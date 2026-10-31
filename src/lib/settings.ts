export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal';
export type Orientation = 'auto' | 'portrait' | 'landscape';
/**
 * row-ltr: row by row, left to right (Z order)
 * row-rtl: row by row, right to left
 * col-ltr: column by column, top to bottom, columns left to right (N order)
 * col-rtl: column by column, top to bottom, columns right to left
 */
export type ReadingOrder = 'row-ltr' | 'row-rtl' | 'col-ltr' | 'col-rtl';

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutSettings {
  /** Grid columns per sheet. */
  cols: number;
  /** Grid rows per sheet. */
  rows: number;
  readingOrder: ReadingOrder;
  paperSize: PaperSize;
  orientation: Orientation;
  /** Outer margins, in millimetres. */
  margins: Margins;
  /** Space between cells (inner margin), in millimetres. */
  gutter: number;
  borders: boolean;
  /** Output file name, without extension. */
  fileName: string;
}

/** Paper sizes in millimetres, portrait (width < height). */
export const PAPER_SIZES_MM: Record<PaperSize, { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export const READING_ORDER_LABELS: Record<ReadingOrder, string> = {
  'row-ltr': 'Row by row, left to right',
  'row-rtl': 'Row by row, right to left',
  'col-ltr': 'Column by column, left to right',
  'col-rtl': 'Column by column, right to left',
};

/** Pages-per-sheet presets and the grid each one uses (cols × rows). */
export const PAGES_PER_SHEET_PRESETS: { pages: number; cols: number; rows: number }[] = [
  { pages: 1, cols: 1, rows: 1 },
  { pages: 2, cols: 2, rows: 1 },
  { pages: 4, cols: 2, rows: 2 },
  { pages: 6, cols: 3, rows: 2 },
  { pages: 8, cols: 4, rows: 2 },
  { pages: 9, cols: 3, rows: 3 },
  { pages: 16, cols: 4, rows: 4 },
];

export const DEFAULT_SETTINGS: LayoutSettings = Object.freeze({
  cols: 2,
  rows: 2,
  readingOrder: 'row-ltr',
  paperSize: 'A4',
  orientation: 'auto',
  margins: Object.freeze({ top: 15, right: 15, bottom: 15, left: 15 }),
  gutter: 0,
  borders: false,
  fileName: 'merged',
}) as LayoutSettings;

export const STORAGE_KEY = 'pdf-merger:settings:v2';

const MAX_GRID = 8;
const MAX_MM = 100;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Coerces arbitrary (possibly stale or tampered) data into valid settings. */
export function sanitizeSettings(input: unknown): LayoutSettings {
  const d = DEFAULT_SETTINGS;
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const m = (raw.margins && typeof raw.margins === 'object' ? raw.margins : {}) as Record<string, unknown>;
  return {
    cols: Math.round(clampNumber(raw.cols, 1, MAX_GRID, d.cols)),
    rows: Math.round(clampNumber(raw.rows, 1, MAX_GRID, d.rows)),
    readingOrder: oneOf(raw.readingOrder, ['row-ltr', 'row-rtl', 'col-ltr', 'col-rtl'], d.readingOrder),
    paperSize: oneOf(raw.paperSize, Object.keys(PAPER_SIZES_MM) as PaperSize[], d.paperSize),
    orientation: oneOf(raw.orientation, ['auto', 'portrait', 'landscape'], d.orientation),
    margins: {
      top: clampNumber(m.top, 0, MAX_MM, d.margins.top),
      right: clampNumber(m.right, 0, MAX_MM, d.margins.right),
      bottom: clampNumber(m.bottom, 0, MAX_MM, d.margins.bottom),
      left: clampNumber(m.left, 0, MAX_MM, d.margins.left),
    },
    gutter: clampNumber(raw.gutter, 0, MAX_MM, d.gutter),
    borders: typeof raw.borders === 'boolean' ? raw.borders : d.borders,
    fileName: typeof raw.fileName === 'string' && raw.fileName.trim() ? raw.fileName.trim().slice(0, 120) : d.fileName,
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): LayoutSettings {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return stored ? sanitizeSettings(JSON.parse(stored)) : sanitizeSettings(DEFAULT_SETTINGS);
  } catch {
    return sanitizeSettings(DEFAULT_SETTINGS);
  }
}

export function saveSettings(
  settings: LayoutSettings,
  storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode, quota). Settings still work for this session.
  }
}

export function settingsEqual(a: LayoutSettings, b: LayoutSettings): boolean {
  return JSON.stringify(sanitizeSettings(a)) === JSON.stringify(sanitizeSettings(b));
}

/** Short human summary, e.g. "4-up · 2×2 · A4 · Auto". */
export function summarizeSettings(s: LayoutSettings): string {
  const orientation = s.orientation[0].toUpperCase() + s.orientation.slice(1);
  return `${s.cols * s.rows}-up · ${s.cols}×${s.rows} · ${s.paperSize} · ${orientation}`;
}
