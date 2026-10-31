import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { SourceFile } from '../src/lib/impose';

export const A4 = { width: 595.2756, height: 841.8898 };
export const MM = 72 / 25.4;

export interface FixturePage {
  label: string;
  width?: number;
  height?: number;
  rotate?: 0 | 90 | 180 | 270;
  cropBox?: [number, number, number, number]; // x, y, w, h
}

/**
 * Builds a PDF whose pages carry markers we can locate later:
 *  - `label` drawn at the visible page's bottom-left corner (origin of the crop box),
 *  - `label:TR` near the top-right corner.
 */
export async function makePdf(name: string, pages: FixturePage[]): Promise<SourceFile> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const p of pages) {
    const w = p.width ?? A4.width;
    const h = p.height ?? A4.height;
    const page = doc.addPage([w, h]);
    const [cx, cy, cw, ch] = p.cropBox ?? [0, 0, w, h];
    if (p.cropBox) page.setCropBox(cx, cy, cw, ch);
    page.drawText(p.label, { x: cx, y: cy, size: 10, font });
    page.drawText(`${p.label}:TR`, { x: cx + cw - 60, y: cy + ch - 20, size: 10, font });
    if (p.rotate) page.setRotation(degrees(p.rotate));
  }
  return { name, bytes: await doc.save() };
}

export async function makeSimplePdf(name: string, labels: string[], size = A4): Promise<SourceFile> {
  return makePdf(
    name,
    labels.map((label) => ({ label, ...size })),
  );
}

export interface TextHit {
  str: string;
  /** Position in PDF user space (bottom-left origin). */
  x: number;
  y: number;
  /** Effective font scale (font size × CTM scale). */
  scale: number;
  /** Position normalised to the displayed page, top-left origin, 0..1. */
  nx: number;
  ny: number;
}

export interface ParsedPage {
  width: number; // displayed width (after rotation)
  height: number;
  view: number[]; // [x0, y0, x1, y1] media/crop box used by pdf.js
  rotate: number;
  texts: TextHit[];
}

/** Parses a PDF with pdf.js — an independent implementation from pdf-lib. */
export async function parsePdf(bytes: Uint8Array): Promise<ParsedPage[]> {
  const task = getDocument({ data: bytes.slice(), disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  const result: ParsedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const texts: TextHit[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [a, b, , , e, f] = item.transform as number[];
      const [vx, vy] = viewport.convertToViewportPoint(e, f);
      texts.push({
        str: item.str,
        x: e,
        y: f,
        scale: Math.hypot(a, b),
        nx: vx / viewport.width,
        ny: vy / viewport.height,
      });
    }
    result.push({ width: viewport.width, height: viewport.height, view: page.view, rotate: page.rotate, texts });
  }
  await task.destroy();
  return result;
}

export const find = (page: ParsedPage, str: string): TextHit => {
  const hit = page.texts.find((t) => t.str === str);
  if (!hit) throw new Error(`"${str}" not found on page; found: ${page.texts.map((t) => t.str).join(', ')}`);
  return hit;
};

export const labels = (page: ParsedPage): string[] =>
  page.texts.map((t) => t.str).filter((s) => !s.endsWith(':TR'));

/** Returns the decoded content stream(s) of a page — the raw drawing operators. */
export async function pageContent(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(pageIndex).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return refs
    .map((ref) => {
      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) return '';
      const filter = stream.dict.get(PDFName.of('Filter'));
      const data = filter === PDFName.of('FlateDecode') ? inflateSync(stream.contents) : stream.contents;
      return new TextDecoder().decode(data);
    })
    .join('\n');
}
