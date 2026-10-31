import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Output } from '../hooks/useImposition';
import { openForRendering, renderPage, type PDFDocumentProxy } from '../lib/pdfjs';
import { Spinner } from './Spinner';

interface Props {
  output: Output;
  dimmed?: boolean;
}

/** Renders the generated PDF's sheets with pdf.js (lazily, as they scroll into view). */
export function Preview({ output, dimmed }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = openForRendering(output.bytes);
    task.promise.then(
      (d) => !cancelled && setDoc(d),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
      setDoc(null);
      void task.destroy();
    };
  }, [output.bytes]);

  const { width, height } = output.plan.sheetSize;
  const aspect = `${width} / ${height}`;

  if (error) return <p className="p-6 text-sm text-red-600">Preview unavailable: {error}</p>;

  return (
    <>
      <div
        className={`grid gap-5 p-5 transition-opacity sm:gap-6 sm:p-8 ${dimmed ? 'opacity-50' : ''} ${
          output.plan.orientation === 'landscape'
            ? 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-4'
        }`}
      >
        {output.plan.sheets.map((sheet) => (
          <figure key={sheet.index} className="animate-pop-in">
            <button
              onClick={() => setOpen(sheet.index)}
              className="block w-full overflow-hidden rounded-[3px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_-6px_rgba(0,0,0,0.12)] ring-1 ring-zinc-900/[0.06] transition hover:-translate-y-0.5 hover:shadow-[0_2px_6px_rgba(0,0,0,0.08),0_16px_32px_-8px_rgba(0,0,0,0.18)] dark:ring-white/10"
              style={{ aspectRatio: aspect }}
              aria-label={`Open sheet ${sheet.index + 1}`}
            >
              {doc && <SheetCanvas doc={doc} pageNumber={sheet.index + 1} />}
            </button>
            <figcaption className="mt-2 text-center text-xs text-zinc-500 tabular-nums">
              {sheet.index + 1}
              <span className="text-zinc-400">
                {' · pages '}
                {sheet.placements[0].pageIndex + 1}
                {sheet.placements.length > 1 && `–${sheet.placements[sheet.placements.length - 1].pageIndex + 1}`}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      {open !== null && doc && (
        <Lightbox
          doc={doc}
          index={open}
          count={output.plan.sheets.length}
          aspect={aspect}
          ratio={width / height}
          onChange={setOpen}
        />
      )}
    </>
  );
}

function SheetCanvas({ doc, pageNumber, eager }: { doc: PDFDocumentProxy; pageNumber: number; eager?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    setRendered(false);
    const render = () => {
      const width = canvas.parentElement?.clientWidth || 300;
      // Render into an offscreen canvas, then swap, so there's no blank flash.
      const off = document.createElement('canvas');
      renderPage(doc, pageNumber, off, width)
        .then(() => {
          if (cancelled) return;
          canvas.width = off.width;
          canvas.height = off.height;
          canvas.getContext('2d')?.drawImage(off, 0, 0);
          setRendered(true);
        })
        .catch(() => {});
    };
    if (eager) {
      render();
      return () => void (cancelled = true);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          render();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(canvas);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [doc, pageNumber, eager]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={ref} className="block h-full w-full" />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-300">
          <Spinner className="size-4" />
        </div>
      )}
    </div>
  );
}

function Lightbox({
  doc,
  index,
  count,
  aspect,
  ratio,
  onChange,
}: {
  doc: PDFDocumentProxy;
  index: number;
  count: number;
  aspect: string;
  ratio: number;
  onChange: (i: number | null) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChange(null);
      if (e.key === 'ArrowRight' && index < count - 1) onChange(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onChange(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onChange]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm sm:p-10"
      onClick={() => onChange(null)}
      role="dialog"
      aria-modal="true"
      aria-label={`Sheet ${index + 1} of ${count}`}
    >
      <div
        className="relative -mt-8 overflow-hidden rounded bg-white shadow-2xl"
        style={{ aspectRatio: aspect, width: `min(calc(100vw - 2rem), calc((100dvh - 8rem) * ${ratio}))` }}
        onClick={(e) => e.stopPropagation()}
      >
        <SheetCanvas key={index} doc={doc} pageNumber={index + 1} eager />
      </div>
      <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn size-9 bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={index === 0} onClick={() => onChange(index - 1)} aria-label="Previous sheet">
          <ChevronLeft className="size-5" />
        </button>
        <span className="min-w-16 text-center text-sm text-white/80 tabular-nums">
          {index + 1} / {count}
        </span>
        <button className="icon-btn size-9 bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={index === count - 1} onClick={() => onChange(index + 1)} aria-label="Next sheet">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <button className="icon-btn absolute top-4 right-4 size-9 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => onChange(null)} aria-label="Close">
        <X className="size-5" />
      </button>
    </div>
  );
}
