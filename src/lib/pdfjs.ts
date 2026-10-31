import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy };

/** Opens a PDF for rendering. A copy of the bytes is passed: pdf.js transfers (detaches) its input. */
export function openForRendering(bytes: Uint8Array) {
  return getDocument({ data: bytes.slice(), verbosity: 0 });
}

/** Renders one page into `canvas` at `cssWidth` CSS pixels wide (crisp on high-DPI screens). */
export async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): Promise<void> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport, background: '#ffffff' }).promise;
  page.cleanup();
}

/** Renders the first page of a PDF to a small JPEG data URL for file thumbnails. */
export async function renderThumbnail(bytes: Uint8Array, cssWidth = 56): Promise<string | undefined> {
  const task = openForRendering(bytes);
  try {
    const doc = await task.promise;
    const canvas = document.createElement('canvas');
    await renderPage(doc, 1, canvas, cssWidth);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return undefined;
  } finally {
    await task.destroy();
  }
}
