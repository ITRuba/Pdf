import { describe, expect, it } from 'vitest';
import { slotToGrid } from '../src/lib/layout';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  summarizeSettings,
} from '../src/lib/settings';

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
};

describe('default preset', () => {
  it('matches the requested layout', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      cols: 2,
      rows: 2,
      readingOrder: 'row-ltr',
      paperSize: 'A4',
      orientation: 'auto',
      margins: { top: 15, right: 15, bottom: 15, left: 15 },
      gutter: 0,
      borders: false,
    });
    expect(summarizeSettings(DEFAULT_SETTINGS)).toBe('4-up · 2×2 · A4 · Auto');
  });
});

describe('persistence', () => {
  it('returns the default preset on first visit', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', () => {
    const storage = memoryStorage();
    const custom = { ...DEFAULT_SETTINGS, cols: 3, rows: 3, borders: true, paperSize: 'Letter' as const };
    saveSettings(custom, storage);
    expect(storage.map.has(STORAGE_KEY)).toBe(true);
    expect(loadSettings(storage)).toEqual(custom);
  });

  it('recovers from corrupt or tampered storage', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.setItem(STORAGE_KEY, JSON.stringify({ cols: 99, gutter: -4, paperSize: 'B9', margins: { top: 'x' } }));
    const s = loadSettings(storage);
    expect(s.cols).toBe(8);
    expect(s.gutter).toBe(0);
    expect(s.paperSize).toBe('A4');
    expect(s.margins.top).toBe(15);
  });

  it('never throws when storage is unavailable', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, broken)).not.toThrow();
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('reading order', () => {
  const grid = (order: Parameters<typeof slotToGrid>[3]) =>
    [0, 1, 2, 3, 4, 5].map((i) => {
      const { row, col } = slotToGrid(i, 3, 2, order);
      return `${row}${col}`;
    });
  it('maps slots for a 3×2 grid', () => {
    expect(grid('row-ltr')).toEqual(['00', '01', '02', '10', '11', '12']);
    expect(grid('row-rtl')).toEqual(['02', '01', '00', '12', '11', '10']);
    expect(grid('col-ltr')).toEqual(['00', '10', '01', '11', '02', '12']);
    expect(grid('col-rtl')).toEqual(['02', '12', '01', '11', '00', '10']);
  });
});
