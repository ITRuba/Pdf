import { describe, expect, it } from 'vitest';
import { imposePdfs, inspectPdf, PdfProcessingError } from '../src/lib/impose';
import { DEFAULT_SETTINGS, type LayoutSettings } from '../src/lib/settings';
import { A4, MM, find, labels, makePdf, makeSimplePdf, pageContent, parsePdf } from './helpers';

const settings = (overrides: Partial<LayoutSettings> = {}): LayoutSettings => ({ ...DEFAULT_SETTINGS, ...overrides });
const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

// Independent expectations for the default preset (A4 portrait, 15 mm outer margins, no gap
// between pages, 2×2), derived by hand from millimetres rather than from the layout module.
const OUTER = 15 * MM;
const CELL_W = 90 * MM; // (210 − 2·15) / 2 — A4 pages are width-limited
const SCALE = CELL_W / A4.width;
const PAGE_H = A4.height * SCALE; // ≈ 127.3 mm
const V_OFF = (A4.height - 2 * OUTER - 2 * PAGE_H) / 2; // the 2×2 block is centred vertically

/** Expected bottom-left corner of each 2×2 slot on an A4 portrait sheet (row by row, LTR). */
const expectedOrigin = [
  { x: OUTER, y: A4.height - OUTER - V_OFF - PAGE_H },
  { x: OUTER + CELL_W, y: A4.height - OUTER - V_OFF - PAGE_H },
  { x: OUTER, y: OUTER + V_OFF },
  { x: OUTER + CELL_W, y: OUTER + V_OFF },
];

describe('default preset: 4 pages per sheet, 2×2, A4, auto orientation', () => {
  it('merges files in order onto A4 portrait sheets with exact dimensions', async () => {
    const a = await makeSimplePdf('a.pdf', range('A', 1, 3));
    const b = await makeSimplePdf('b.pdf', range('B', 1, 7));
    const { bytes, plan } = await imposePdfs([a, b], settings());
    const pages = await parsePdf(bytes);

    expect(plan.orientation).toBe('portrait');
    expect(pages).toHaveLength(3); // ceil(10 / 4)
    for (const p of pages) {
      expect(p.width).toBeCloseTo(A4.width, 2); // 210 mm
      expect(p.height).toBeCloseTo(A4.height, 2); // 297 mm
      expect(p.rotate).toBe(0);
    }
    expect(pages.map(labels)).toEqual([
      ['A1', 'A2', 'A3', 'B1'],
      ['B2', 'B3', 'B4', 'B5'],
      ['B6', 'B7'],
    ]);
  });

  it('places pages row by row, left to right, touching each other inside 15 mm margins', async () => {
    const src = await makeSimplePdf('a.pdf', range('P', 1, 4));
    const [sheet] = await parsePdf((await imposePdfs([src], settings())).bytes);

    ['P1', 'P2', 'P3', 'P4'].forEach((label, slot) => {
      const hit = find(sheet, label);
      expect(hit.x).toBeCloseTo(expectedOrigin[slot].x, 2);
      expect(hit.y).toBeCloseTo(expectedOrigin[slot].y, 2);
      expect(hit.scale).toBeCloseTo(10 * SCALE, 3); // uniform scale → aspect ratio preserved
    });

    const [p1, p2, p3] = ['P1', 'P2', 'P3'].map((l) => find(sheet, l));
    const pageW = A4.width * SCALE;
    // Left page on the 15 mm left margin, right page on the 15 mm right margin.
    expect(p1.x / MM).toBeCloseTo(15, 3);
    expect((A4.width - (p2.x + pageW)) / MM).toBeCloseTo(15, 3);
    // No space between pages, horizontally or vertically.
    expect((p2.x - (p1.x + pageW)) / MM).toBeCloseTo(0, 3);
    expect((p1.y - (p3.y + PAGE_H)) / MM).toBeCloseTo(0, 3);
    // Top and bottom margins are equal and at least 15 mm.
    expect((A4.height - (p1.y + PAGE_H)) / MM).toBeCloseTo(p3.y / MM, 3);
    expect(p3.y).toBeGreaterThanOrEqual(OUTER);
  });

  it('puts exactly the inner margin between pages when one is set', async () => {
    const src = await makeSimplePdf('a.pdf', range('P', 1, 4));
    const { bytes, plan } = await imposePdfs([src], settings({ gutter: 5 }));
    const [sheet] = await parsePdf(bytes);
    const [p1, p2, p3] = ['P1', 'P2', 'P3'].map((l) => find(sheet, l));
    const { width, height } = plan.sheets[0].placements[0].rect;
    expect((p2.x - (p1.x + width)) / MM).toBeCloseTo(5, 3);
    expect((p1.y - (p3.y + height)) / MM).toBeCloseTo(5, 3);
    expect(p1.x / MM).toBeCloseTo(15, 3);
  });

  it('keeps every page inside the printable area and never crops content', async () => {
    const src = await makeSimplePdf('a.pdf', range('P', 1, 4));
    const { bytes, plan } = await imposePdfs([src], settings());
    for (const pl of plan.sheets[0].placements) {
      expect(pl.rect.x).toBeGreaterThanOrEqual(OUTER - 1e-6);
      expect(pl.rect.y).toBeGreaterThanOrEqual(OUTER - 1e-6);
      expect(pl.rect.x + pl.rect.width).toBeLessThanOrEqual(A4.width - OUTER + 1e-6);
      expect(pl.rect.y + pl.rect.height).toBeLessThanOrEqual(A4.height - OUTER + 1e-6);
      expect(pl.rect.width / pl.rect.height).toBeCloseTo(A4.width / A4.height, 6);
    }
    // The top-right corner marker of each page must also survive (content not clipped).
    const [sheet] = await parsePdf(bytes);
    for (const l of ['P1', 'P2', 'P3', 'P4']) expect(() => find(sheet, `${l}:TR`)).not.toThrow();
  });

  it('handles an incomplete final sheet without resizing or moving pages', async () => {
    const src = await makeSimplePdf('a.pdf', range('P', 1, 5));
    const pages = await parsePdf((await imposePdfs([src], settings())).bytes);
    expect(pages).toHaveLength(2);
    expect(labels(pages[1])).toEqual(['P5']);
    const p5 = find(pages[1], 'P5');
    expect(p5.x).toBeCloseTo(expectedOrigin[0].x, 2);
    expect(p5.y).toBeCloseTo(expectedOrigin[0].y, 2);
    expect(p5.scale).toBeCloseTo(find(pages[0], 'P1').scale, 6);
    expect(pages[1].width).toBeCloseTo(A4.width, 2);
  });

  it('chooses landscape sheets automatically for landscape pages', async () => {
    const src = await makeSimplePdf('wide.pdf', range('L', 1, 4), { width: A4.height, height: A4.width });
    const { bytes, plan } = await imposePdfs([src], settings());
    const [sheet] = await parsePdf(bytes);
    expect(plan.orientation).toBe('landscape');
    expect(sheet.width).toBeCloseTo(A4.height, 2);
    expect(sheet.height).toBeCloseTo(A4.width, 2);
    expect(labels(sheet)).toEqual(['L1', 'L2', 'L3', 'L4']);
    // Landscape pages are height-limited (2 × 90 mm tall): the top row touches the
    // 15 mm top margin, the bottom row the 15 mm bottom margin.
    const l1 = find(sheet, 'L1');
    expect((A4.width - (l1.y + 90 * MM)) / MM).toBeCloseTo(15, 3);
    expect(find(sheet, 'L3').y / MM).toBeCloseTo(15, 3);
    expect(find(sheet, 'L1').y).toBeGreaterThan(find(sheet, 'L3').y);
  });

  it('respects a fixed orientation override', async () => {
    const src = await makeSimplePdf('a.pdf', range('P', 1, 4));
    const [sheet] = await parsePdf((await imposePdfs([src], settings({ orientation: 'landscape' }))).bytes);
    expect(sheet.width).toBeCloseTo(A4.height, 2);
  });
});

describe('page fidelity', () => {
  it('honours /Rotate so rotated pages look exactly as in a viewer', async () => {
    const pagesIn = [0, 90, 180, 270].map((rotate) => ({ label: `R${rotate}`, rotate: rotate as 0 | 90 | 180 | 270 }));
    const src = await makePdf('rot.pdf', pagesIn);
    const original = await parsePdf(src.bytes);
    const { bytes, plan } = await imposePdfs([src], settings({ cols: 1, rows: 1 }));
    const out = await parsePdf(bytes);

    pagesIn.forEach((p, i) => {
      const rect = plan.sheets[i].placements[0].rect;
      // Displayed aspect ratio preserved (sideways pages become landscape).
      expect(rect.width / rect.height).toBeCloseTo(original[i].width / original[i].height, 6);
      for (const marker of [p.label, `${p.label}:TR`]) {
        const src = find(original[i], marker);
        const hit = find(out[i], marker);
        // Same relative position within the displayed page as pdf.js shows in the original.
        expect((hit.x - rect.x) / rect.width).toBeCloseTo(src.nx, 4);
        expect((rect.y + rect.height - hit.y) / rect.height).toBeCloseTo(src.ny, 4);
      }
    });
  });

  it('uses the crop box (what viewers display), not the media box', async () => {
    const src = await makePdf('crop.pdf', [{ label: 'C1', width: 600, height: 800, cropBox: [100, 150, 300, 400] }]);
    expect((await inspectPdf(src)).firstPage).toEqual({ width: 300, height: 400 });
    const { plan } = await imposePdfs([src], settings({ cols: 1, rows: 1 }));
    const rect = plan.sheets[0].placements[0].rect;
    expect(rect.width / rect.height).toBeCloseTo(300 / 400, 6);
    const [sheet] = await parsePdf((await imposePdfs([src], settings({ cols: 1, rows: 1 }))).bytes);
    const c1 = find(sheet, 'C1');
    expect(c1.x).toBeCloseTo(rect.x, 2);
    expect(c1.y).toBeCloseTo(rect.y, 2);
  });

  it('mixes page sizes, fitting each one into its cell without distortion', async () => {
    const src = await makePdf('mix.pdf', [
      { label: 'M1' },
      { label: 'M2', width: 200, height: 200 },
      { label: 'M3', width: 1000, height: 300 },
      { label: 'M4', width: 300, height: 1200 },
    ]);
    const { plan } = await imposePdfs([src], settings());
    const sizes = [A4, { width: 200, height: 200 }, { width: 1000, height: 300 }, { width: 300, height: 1200 }];
    plan.sheets[0].placements.forEach((pl, i) => {
      expect(pl.rect.width / pl.rect.height).toBeCloseTo(sizes[i].width / sizes[i].height, 6);
      expect(pl.rect.width).toBeLessThanOrEqual(pl.cell.width + 1e-6);
      expect(pl.rect.height).toBeLessThanOrEqual(pl.cell.height + 1e-6);
      // Fills the cell in at least one dimension.
      expect(Math.max(pl.rect.width / pl.cell.width, pl.rect.height / pl.cell.height)).toBeCloseTo(1, 6);
    });
  });
});

describe('options', () => {
  it('supports other reading orders', async () => {
    const src = await makeSimplePdf('a.pdf', range('P', 1, 4));
    const pos = async (readingOrder: LayoutSettings['readingOrder']) => {
      const [sheet] = await parsePdf((await imposePdfs([src], settings({ readingOrder }))).bytes);
      return ['P1', 'P2', 'P3', 'P4'].map((l) => {
        const h = find(sheet, l);
        // Labels sit at each page's bottom-left corner; compare the page centre.
        const cx = h.x + (A4.width * SCALE) / 2;
        const cy = h.y + PAGE_H / 2;
        return `${cy > A4.height / 2 ? 'T' : 'B'}${cx < A4.width / 2 ? 'L' : 'R'}`;
      });
    };
    expect(await pos('row-ltr')).toEqual(['TL', 'TR', 'BL', 'BR']);
    expect(await pos('row-rtl')).toEqual(['TR', 'TL', 'BR', 'BL']);
    expect(await pos('col-ltr')).toEqual(['TL', 'BL', 'TR', 'BR']);
    expect(await pos('col-rtl')).toEqual(['TR', 'BR', 'TL', 'BL']);
  });

  it('draws borders only when enabled (disabled by default)', async () => {
    const src = await makeSimplePdf('a.pdf', range('P', 1, 4));
    const strokes = async (borders: boolean) => {
      const content = await pageContent((await imposePdfs([src], settings({ borders }))).bytes, 0);
      return content.split('\n').filter((line) => /\bre\b/.test(line) || /^\s*S\s*$/.test(line)).length;
    };
    expect(DEFAULT_SETTINGS.borders).toBe(false);
    expect(await strokes(false)).toBe(0);
    expect(await strokes(true)).toBeGreaterThanOrEqual(4);
  });

  it('applies custom paper sizes, grids and margins', async () => {
    const src = await makeSimplePdf('a.pdf', range('P', 1, 9));
    const s = settings({
      paperSize: 'Letter',
      cols: 3,
      rows: 3,
      orientation: 'portrait',
      margins: { top: 10, right: 20, bottom: 30, left: 40 },
      gutter: 0,
    });
    const { bytes, plan } = await imposePdfs([src], s);
    const [sheet] = await parsePdf(bytes);
    expect(sheet.width).toBeCloseTo(612, 1);
    expect(sheet.height).toBeCloseTo(792, 1);
    expect(labels(sheet)).toEqual(range('P', 1, 9));
    const cells = plan.cells.flat();
    // A4 pages on Letter are width-limited: left/right margins exact…
    expect(Math.min(...cells.map((c) => c.x)) / MM).toBeCloseTo(40, 4);
    expect((612 - Math.max(...cells.map((c) => c.x + c.width))) / MM).toBeCloseTo(20, 4);
    // …and the block is centred vertically, keeping at least the requested top/bottom margins.
    const bottomGap = Math.min(...cells.map((c) => c.y)) / MM;
    const topGap = (792 - Math.max(...cells.map((c) => c.y + c.height))) / MM;
    expect(bottomGap).toBeGreaterThanOrEqual(30);
    expect(topGap).toBeGreaterThanOrEqual(10);
    expect(bottomGap - 30).toBeCloseTo(topGap - 10, 4);
  });

  it('plain merge (1 per sheet) keeps page count', async () => {
    const a = await makeSimplePdf('a.pdf', ['A1', 'A2']);
    const b = await makeSimplePdf('b.pdf', ['B1']);
    const pages = await parsePdf((await imposePdfs([b, a], settings({ cols: 1, rows: 1 }))).bytes);
    expect(pages.map(labels)).toEqual([['B1'], ['A1'], ['A2']]);
  });
});

describe('errors', () => {
  it('rejects non-PDF input with a readable message', async () => {
    const bogus = { name: 'notes.txt', bytes: new TextEncoder().encode('hello world') };
    await expect(imposePdfs([bogus], settings())).rejects.toThrow(PdfProcessingError);
    await expect(imposePdfs([bogus], settings())).rejects.toThrow(/not a PDF/);
  });

  it('rejects margins that leave no room', async () => {
    const src = await makeSimplePdf('a.pdf', ['P1']);
    await expect(
      imposePdfs([src], settings({ orientation: 'portrait', margins: { top: 100, right: 100, bottom: 100, left: 110 } })),
    ).rejects.toThrow(/no room/);
  });

  it('rejects an empty file list', async () => {
    await expect(imposePdfs([], settings())).rejects.toThrow(/at least one/);
  });
});
