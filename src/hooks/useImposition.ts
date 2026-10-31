import { useCallback, useEffect, useRef, useState } from 'react';
import { imposePdfs, type ImposeResult } from '../lib/impose';
import type { LayoutSettings } from '../lib/settings';
import type { PdfItem } from './useFiles';

export interface Output extends ImposeResult {
  key: string;
  url: string;
  sourcePageCount: number;
}

export type Status =
  | { state: 'idle' }
  | { state: 'working'; progress: number; message: string }
  | { state: 'ready' }
  | { state: 'error'; message: string };

const PREVIEW_DELAY_MS = 250;

/** Everything except the file name affects the generated document. */
function inputKey(items: PdfItem[], settings: LayoutSettings): string {
  const { fileName: _ignored, ...layout } = settings;
  return JSON.stringify([items.map((it) => it.id), layout]);
}

/**
 * Keeps an up-to-date merged PDF for the current files and settings (regenerated
 * automatically, debounced) and exposes `ensure()` to get it immediately.
 */
export function useImposition(items: PdfItem[], settings: LayoutSettings) {
  const [output, setOutput] = useState<Output | null>(null);
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const inflight = useRef<{ key: string; promise: Promise<Output> } | null>(null);
  const currentKey = useRef('');

  const blocked = items.some((it) => it.status !== 'ready');
  const ready = items.length > 0 && !blocked;
  const key = ready ? inputKey(items, settings) : '';
  currentKey.current = key;

  const inputs = useRef({ items, settings });
  inputs.current = { items, settings };

  const ensure = useCallback((): Promise<Output> => {
    const { items, settings } = inputs.current;
    const k = inputKey(items, settings);
    if (inflight.current?.key === k) return inflight.current.promise;

    setStatus({ state: 'working', progress: 0, message: 'Starting…' });
    const promise = imposePdfs(items, settings, (progress, message) => {
      if (currentKey.current === k) setStatus({ state: 'working', progress, message });
    }).then((result) => {
      const blob = new Blob([result.bytes as BlobPart], { type: 'application/pdf' });
      return { ...result, key: k, url: URL.createObjectURL(blob), sourcePageCount: result.pages.length };
    });
    inflight.current = { key: k, promise };

    promise.then(
      (out) => {
        if (currentKey.current !== k) {
          if (inflight.current?.key === k) inflight.current = null;
          return URL.revokeObjectURL(out.url);
        }
        setOutput((prev) => {
          if (prev && prev.url !== out.url) URL.revokeObjectURL(prev.url);
          return out;
        });
        setStatus({ state: 'ready' });
      },
      (err: unknown) => {
        if (inflight.current?.key === k) inflight.current = null;
        if (currentKey.current !== k) return;
        setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      },
    );
    return promise;
  }, []);

  // Auto-regenerate the preview when inputs change.
  useEffect(() => {
    if (!key) {
      setStatus({ state: 'idle' });
      setOutput((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      inflight.current = null;
      return;
    }
    const timer = setTimeout(() => void ensure().catch(() => {}), PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, ensure]);

  const current = output && output.key === key ? output : null;
  return { output: current, staleOutput: output, status, ready, blocked, ensure };
}
