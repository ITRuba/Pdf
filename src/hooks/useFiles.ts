import { useCallback, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { inspectPdf } from '../lib/impose';
import { renderThumbnail } from '../lib/pdfjs';

export interface PdfItem {
  id: string;
  name: string;
  size: number;
  bytes: Uint8Array;
  status: 'loading' | 'ready' | 'error';
  pageCount?: number;
  error?: string;
  thumbnail?: string;
}

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function useFiles(onRejected: (names: string[]) => void) {
  const [items, setItems] = useState<PdfItem[]>([]);

  const patch = useCallback((id: string, changes: Partial<PdfItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const add = useCallback(
    async (files: File[]) => {
      const accepted = files.filter(isPdf);
      const rejected = files.filter((f) => !isPdf(f)).map((f) => f.name);
      if (rejected.length) onRejected(rejected);
      if (!accepted.length) return;

      const loaded = await Promise.all(
        accepted.map(async (file) => {
          const id = newId();
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            return { id, name: file.name, size: file.size, bytes, status: 'loading' } as PdfItem;
          } catch {
            return { id, name: file.name, size: file.size, bytes: new Uint8Array(), status: 'error', error: 'Could not read this file.' } as PdfItem;
          }
        }),
      );
      setItems((prev) => [...prev, ...loaded]);

      for (const item of loaded) {
        if (item.status === 'error') continue;
        try {
          const { pageCount } = await inspectPdf(item);
          patch(item.id, { status: 'ready', pageCount });
          renderThumbnail(item.bytes).then((thumbnail) => thumbnail && patch(item.id, { thumbnail }));
        } catch (err) {
          patch(item.id, { status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      }
    },
    [onRejected, patch],
  );

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((it) => it.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);

  const move = useCallback((fromId: string, toId: string) => {
    setItems((prev) => {
      const from = prev.findIndex((it) => it.id === fromId);
      const to = prev.findIndex((it) => it.id === toId);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  }, []);

  const moveBy = useCallback((id: string, delta: number) => {
    setItems((prev) => {
      const from = prev.findIndex((it) => it.id === id);
      const to = Math.min(prev.length - 1, Math.max(0, from + delta));
      return from < 0 || from === to ? prev : arrayMove(prev, from, to);
    });
  }, []);

  const sortByName = useCallback(() => {
    setItems((prev) =>
      [...prev].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
    );
  }, []);

  return { items, add, remove, clear, move, moveBy, sortByName };
}
