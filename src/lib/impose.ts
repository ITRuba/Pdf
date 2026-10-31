import { PDFDocument, PDFPage, degrees, rgb, type PDFEmbeddedPage } from 'pdf-lib';
import { planLayout, type LayoutPlan, type Rect, type Size } from './layout';
import type { LayoutSettings } from './settings';

export interface SourceFile {
  name: string;
  bytes: Uint8Array;
}

export interface SourcePageInfo {
  fileIndex: number;
  pageNumber: number; // 1-based within its file
  /** Size as the page is displayed (crop box, after /Rotate). */
  size: Size;
}

export interface ImposeResult {
  bytes: Uint8Array;
  plan: LayoutPlan;
  pages: SourcePageInfo[];
}

export type ProgressHandler = (fraction: number, message: string) => void;

export class PdfProcessingError extends Error {
  constructor(
    message: string,
    readonly fileName?: string,
  ) {
    super(message);
    this.name = 'PdfProcessingError';
  }
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Loads a PDF with friendly errors for the common failure modes. */
export async function loadPdf(file: SourceFile): Promise<PDFDocument> {
  const head = new TextDecoder().decode(file.bytes.subarray(0, 1024));
  if (!head.includes('%PDF')) {
    throw new PdfProcessingError(`“${file.name}” is not a PDF file.`, file.name);
  }
  try {
    const doc = await PDFDocument.load(file.bytes, { updateMetadata: false });
    if (doc.getPageCount() === 0) throw new PdfProcessingError(`“${file.name}” has no pages.`, file.name);
    return doc;
  } catch (err) {
    if (err instanceof PdfProcessingError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(msg)) {
      throw new PdfProcessingError(
        `“${file.name}” is password-protected or encrypted. Remove the protection (e.g. Print → Save as PDF) and try again.`,
        file.name,
      );
    }
    throw new PdfProcessingError(`“${file.name}” could not be read — the file may be damaged. (${msg})`, file.name);
  }
}

function normalizedRotation(page: PDFPage): 0 | 90 | 180 | 270 {
  const angle = ((Math.round(page.getRotation().angle / 90) * 90) % 360 + 360) % 360;
  return angle as 0 | 90 | 180 | 270;
}

/** The region of the page a viewer shows: the crop box clipped to the media box. */
function visibleBox(page: PDFPage) {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const left = Math.max(media.x, crop.x);
  const bottom = Math.max(media.y, crop.y);
  const right = Math.min(media.x + media.width, crop.x + crop.width);
  const top = Math.min(media.y + media.height, crop.y + crop.height);
  if (right - left > 0 && top - bottom > 0) return { left, bottom, right, top };
  return { left: media.x, bottom: media.y, right: media.x + media.width, top: media.y + media.height };
}

/** Returns the displayed size of a page (honours crop box and /Rotate). */
export function displayedSize(page: PDFPage): Size {
  const box = visibleBox(page);
  const w = box.right - box.left;
  const h = box.top - box.bottom;
  const rot = normalizedRotation(page);
  return rot === 90 || rot === 270 ? { width: h, height: w } : { width: w, height: h };
}

/**
 * Draws an embedded page so that its *displayed* (rotated) appearance exactly fills `target`.
 * pdf-lib rotates counter-clockwise around (x, y); a page's /Rotate is clockwise.
 */
function drawRotated(sheet: PDFPage, embedded: PDFEmbeddedPage, rotation: 0 | 90 | 180 | 270, target: Rect) {
  const { x, y, width: W, height: H } = target;
  const sideways = rotation === 90 || rotation === 270;
  const width = sideways ? H : W; // unrotated drawn width
  const height = sideways ? W : H;
  const origin = {
    0: { x, y },
    90: { x, y: y + H },
    180: { x: x + W, y: y + H },
    270: { x: x + W, y },
  }[rotation];
  sheet.drawPage(embedded, { ...origin, width, height, rotate: degrees(-rotation) });
}

/**
 * Merges the files in order and lays their pages out on sheets according to `settings`.
 * Pages are embedded as vector form XObjects: content is preserved exactly, never rasterised.
 */
export async function imposePdfs(
  files: SourceFile[],
  settings: LayoutSettings,
  onProgress: ProgressHandler = () => {},
): Promise<ImposeResult> {
  if (files.length === 0) throw new PdfProcessingError('Add at least one PDF.');

  onProgress(0.02, 'Reading files…');
  const docs: PDFDocument[] = [];
  const pages: SourcePageInfo[] = [];
  for (let i = 0; i < files.length; i++) {
    const doc = await loadPdf(files[i]);
    docs.push(doc);
    doc.getPages().forEach((page, p) => pages.push({ fileIndex: i, pageNumber: p + 1, size: displayedSize(page) }));
    onProgress(0.02 + 0.28 * ((i + 1) / files.length), `Reading ${files[i].name}`);
    await yieldToUi();
  }

  const plan = planLayout(
    pages.map((p) => p.size),
    settings,
  );

  const out = await PDFDocument.create();
  out.setCreator('PDF Merger');
  out.setProducer('pdf-lib');
  out.setCreationDate(new Date());

  // Embed each document's pages in one batch (shared resources are copied once).
  const embedded: { page: PDFEmbeddedPage; rotation: 0 | 90 | 180 | 270 }[] = [];
  for (let i = 0; i < docs.length; i++) {
    const srcPages = docs[i].getPages();
    const result = await out.embedPages(srcPages, srcPages.map(visibleBox));
    result.forEach((page, p) => embedded.push({ page, rotation: normalizedRotation(srcPages[p]) }));
    onProgress(0.3 + 0.4 * ((i + 1) / docs.length), `Embedding ${files[i].name}`);
    await yieldToUi();
  }

  const borderColor = rgb(0.62, 0.62, 0.65);
  for (const sheet of plan.sheets) {
    const page = out.addPage([plan.sheetSize.width, plan.sheetSize.height]);
    for (const placement of sheet.placements) {
      const { page: e, rotation } = embedded[placement.pageIndex];
      drawRotated(page, e, rotation, placement.rect);
      if (settings.borders) {
        page.drawRectangle({ ...placement.rect, borderColor, borderWidth: 0.5 });
      }
    }
    if (sheet.index % 20 === 19) {
      onProgress(0.7 + 0.2 * ((sheet.index + 1) / plan.sheets.length), `Laying out sheet ${sheet.index + 1}`);
      await yieldToUi();
    }
  }

  onProgress(0.92, 'Writing PDF…');
  await yieldToUi();
  const bytes = await out.save({ useObjectStreams: true });
  onProgress(1, 'Done');
  return { bytes, plan, pages };
}

/** Lightweight page count, used when a file is added. */
export async function inspectPdf(file: SourceFile): Promise<{ pageCount: number; firstPage: Size }> {
  const doc = await loadPdf(file);
  return { pageCount: doc.getPageCount(), firstPage: displayedSize(doc.getPage(0)) };
}
