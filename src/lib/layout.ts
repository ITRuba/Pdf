import { PAPER_SIZES_MM, type LayoutSettings, type ReadingOrder } from './settings';

export const PT_PER_MM = 72 / 25.4;
export const mmToPt = (mm: number): number => mm * PT_PER_MM;
export const ptToMm = (pt: number): number => pt / PT_PER_MM;

export interface Size {
  width: number;
  height: number;
}

/** Rectangle in PDF user space (points, origin bottom-left). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridPosition {
  row: number; // 0 = top
  col: number; // 0 = left
}

export interface Placement {
  /** Index into the flat list of source pages (merged order). */
  pageIndex: number;
  /** Position of this page on its sheet in reading order (0-based). */
  slot: number;
  grid: GridPosition;
  /** The full cell the page was fitted into. */
  cell: Rect;
  /** The area actually covered by the page (aspect ratio preserved, centred in the cell). */
  rect: Rect;
  scale: number;
}

export interface Sheet {
  index: number;
  placements: Placement[];
}

export interface LayoutPlan {
  orientation: 'portrait' | 'landscape';
  sheetSize: Size;
  cells: Rect[][]; // [row][col]
  sheets: Sheet[];
  pagesPerSheet: number;
}

/** Maps a reading-order slot to its row/column on the sheet. */
export function slotToGrid(slot: number, cols: number, rows: number, order: ReadingOrder): GridPosition {
  switch (order) {
    case 'row-ltr':
      return { row: Math.floor(slot / cols), col: slot % cols };
    case 'row-rtl':
      return { row: Math.floor(slot / cols), col: cols - 1 - (slot % cols) };
    case 'col-ltr':
      return { row: slot % rows, col: Math.floor(slot / rows) };
    case 'col-rtl':
      return { row: slot % rows, col: cols - 1 - Math.floor(slot / rows) };
  }
}

export function sheetSizePt(settings: Pick<LayoutSettings, 'paperSize'>, orientation: 'portrait' | 'landscape'): Size {
  const { width, height } = PAPER_SIZES_MM[settings.paperSize];
  const w = mmToPt(width);
  const h = mmToPt(height);
  return orientation === 'portrait' ? { width: w, height: h } : { width: h, height: w };
}

/**
 * Computes every cell of the grid for a given sheet size. Cells are [row][col].
 *
 * Cells take the proportions of `reference` (the largest page), are scaled as large as the
 * printable area allows, and sit edge to edge with exactly `gutter` between them. The whole
 * block is centred inside the margins, so pages of one size touch each other (gutter 0)
 * instead of floating in oversized cells.
 */
export function computeCells(sheet: Size, settings: LayoutSettings, reference?: Size): Rect[][] {
  const { cols, rows, margins } = settings;
  const left = mmToPt(margins.left);
  const right = mmToPt(margins.right);
  const top = mmToPt(margins.top);
  const bottom = mmToPt(margins.bottom);
  const gutter = mmToPt(settings.gutter);

  const availW = sheet.width - left - right - gutter * (cols - 1);
  const availH = sheet.height - top - bottom - gutter * (rows - 1);
  if (!(availW > 0) || !(availH > 0)) {
    throw new Error('Margins are too large for this paper size and grid — there is no room left for pages.');
  }

  let cellW = availW / cols;
  let cellH = availH / rows;
  if (reference && reference.width > 0 && reference.height > 0) {
    const scale = Math.min(cellW / reference.width, cellH / reference.height);
    cellW = reference.width * scale;
    cellH = reference.height * scale;
  }

  const blockW = cellW * cols + gutter * (cols - 1);
  const blockH = cellH * rows + gutter * (rows - 1);
  const originX = left + (sheet.width - left - right - blockW) / 2;
  const blockTop = sheet.height - top - (sheet.height - top - bottom - blockH) / 2;

  const cells: Rect[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Rect[] = [];
    // Row 0 is the top row; PDF y grows upwards.
    const y = blockTop - (r + 1) * cellH - r * gutter;
    for (let c = 0; c < cols; c++) {
      row.push({ x: originX + c * (cellW + gutter), y, width: cellW, height: cellH });
    }
    cells.push(row);
  }
  return cells;
}

/** Bounding size of all pages: the cell shape that fits every page. */
export function referenceSize(pages: Size[]): Size {
  return {
    width: Math.max(...pages.map((p) => p.width)),
    height: Math.max(...pages.map((p) => p.height)),
  };
}

/** Fits content into a cell without cropping or distortion, centred. */
export function fitIntoCell(content: Size, cell: Rect): { rect: Rect; scale: number } {
  const scale = Math.min(cell.width / content.width, cell.height / content.height);
  const width = content.width * scale;
  const height = content.height * scale;
  return {
    scale,
    rect: {
      x: cell.x + (cell.width - width) / 2,
      y: cell.y + (cell.height - height) / 2,
      width,
      height,
    },
  };
}

/**
 * Chooses the sheet orientation that renders the pages largest. Scores each orientation
 * by the total area the pages would occupy; ties go to portrait.
 */
export function resolveOrientation(pages: Size[], settings: LayoutSettings): 'portrait' | 'landscape' {
  if (settings.orientation !== 'auto') return settings.orientation;
  const score = (orientation: 'portrait' | 'landscape'): number => {
    let cell: Rect;
    try {
      cell = computeCells(sheetSizePt(settings, orientation), settings, referenceSize(pages))[0][0];
    } catch {
      return -1;
    }
    return pages.reduce((sum, p) => {
      const { rect } = fitIntoCell(p, cell);
      return sum + rect.width * rect.height;
    }, 0);
  };
  const portrait = score('portrait');
  const landscape = score('landscape');
  return landscape > portrait * 1.0001 ? 'landscape' : 'portrait';
}

/**
 * Plans the whole document: which source page goes onto which sheet, cell and rectangle.
 * Pages are fitted (never cropped or stretched) into equal cells. The last sheet may be partially filled; its remaining cells are simply left blank,
 * keeping every page at the same size and position as on full sheets.
 */
export function planLayout(pages: Size[], settings: LayoutSettings): LayoutPlan {
  if (pages.length === 0) throw new Error('There are no pages to arrange.');
  const orientation = resolveOrientation(pages, settings);
  const sheetSize = sheetSizePt(settings, orientation);
  const cells = computeCells(sheetSize, settings, referenceSize(pages));
  const pagesPerSheet = settings.cols * settings.rows;

  const sheets: Sheet[] = [];
  pages.forEach((page, pageIndex) => {
    const sheetIndex = Math.floor(pageIndex / pagesPerSheet);
    const slot = pageIndex % pagesPerSheet;
    if (!sheets[sheetIndex]) sheets[sheetIndex] = { index: sheetIndex, placements: [] };
    const grid = slotToGrid(slot, settings.cols, settings.rows, settings.readingOrder);
    const cell = cells[grid.row][grid.col];
    const { rect, scale } = fitIntoCell(page, cell);
    sheets[sheetIndex].placements.push({ pageIndex, slot, grid, cell, rect, scale });
  });

  return { orientation, sheetSize, cells, sheets, pagesPerSheet };
}
