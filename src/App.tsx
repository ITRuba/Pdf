import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpDown, CheckCircle2, ExternalLink, Lock, Trash2, Upload } from 'lucide-react';
import { DropZone } from './components/DropZone';
import { FileList } from './components/FileList';
import { Preview } from './components/Preview';
import { SettingsPanel } from './components/SettingsPanel';
import { Spinner } from './components/Spinner';
import { useFiles } from './hooks/useFiles';
import { useImposition } from './hooks/useImposition';
import { useSettings } from './hooks/useSettings';
import { downloadBlob, pdfFileName, plural } from './lib/format';
import { ptToMm } from './lib/layout';
import { summarizeSettings } from './lib/settings';

interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const onRejected = useCallback(
    (names: string[]) => toast('error', `Skipped ${names.length === 1 ? `“${names[0]}”` : plural(names.length, 'file')} — only PDFs are supported.`),
    [toast],
  );
  const files = useFiles(onRejected);
  const { settings, update, reset } = useSettings();
  const { output, staleOutput, status, ready, blocked, ensure } = useImposition(files.items, settings);
  const [downloading, setDownloading] = useState(false);

  const totalPages = files.items.reduce((n, it) => n + (it.pageCount ?? 0), 0);
  const hasFiles = files.items.length > 0;
  const loading = files.items.some((it) => it.status === 'loading');
  const broken = files.items.filter((it) => it.status === 'error');

  const mergeAndDownload = useCallback(async () => {
    if (!ready) return;
    setDownloading(true);
    try {
      const out = await ensure();
      const name = pdfFileName(settings.fileName);
      downloadBlob(out.url, name);
      toast('success', `Saved ${name} — ${plural(out.plan.sheets.length, 'sheet')}`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }, [ready, ensure, settings.fileName, toast]);

  // ⌘/Ctrl + Enter → Merge & Download
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void mergeAndDownload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mergeAndDownload]);

  const dragging = useWindowFileDrop(files.add);
  const shown = output ?? staleOutput;
  const working = status.state === 'working';

  const mergeButton = (className = '') => (
    <button className={`btn-primary ${className}`} onClick={mergeAndDownload} disabled={!ready || downloading}>
      {downloading ? <Spinner className="size-4" /> : <ArrowDownToLine className="size-4" strokeWidth={2.2} />}
      Merge &amp; Download
    </button>
  );

  return (
    <div className="min-h-dvh pb-24 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.06] dark:bg-zinc-950/75">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          <Logo />
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold tracking-tight">Sheets</h1>
          </div>
          <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-emerald-600/15 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 sm:inline-flex dark:border-emerald-400/15 dark:bg-emerald-400/10 dark:text-emerald-300">
            <Lock className="size-3" /> Processed on this device
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden font-mono text-xs text-zinc-400 md:inline">{summarizeSettings(settings)}</span>
            <kbd className="hidden rounded border border-zinc-200 px-1.5 py-0.5 font-sans text-[11px] text-zinc-400 xl:inline dark:border-white/10">
              ⌘ ↵
            </kbd>
            {mergeButton('hidden lg:inline-flex')}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(360px,420px)_1fr] lg:grid-rows-[auto_1fr]">
          <section className="card min-w-0 self-start overflow-hidden lg:col-start-1 lg:row-start-1">
            <div className="flex h-12 items-center gap-2 border-b border-zinc-100 px-5 dark:border-white/[0.06]">
              <h2 className="text-sm font-semibold">Files</h2>
              {hasFiles && (
                <span className="text-xs text-zinc-400 tabular-nums">
                  {files.items.length} · {plural(totalPages, 'page')}
                </span>
              )}
              {hasFiles && (
                <div className="ml-auto flex items-center gap-0.5">
                  <button className="btn-ghost h-7 px-2 text-xs" onClick={files.sortByName} disabled={files.items.length < 2}>
                    <ArrowUpDown className="size-3.5" /> A–Z
                  </button>
                  <button className="btn-ghost h-7 px-2 text-xs" onClick={files.clear}>
                    <Trash2 className="size-3.5" /> Clear
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 p-3">
              {hasFiles ? (
                <>
                  <FileList items={files.items} onMove={files.move} onMoveBy={files.moveBy} onRemove={files.remove} />
                  <DropZone onFiles={files.add} compact />
                </>
              ) : (
                <DropZone onFiles={files.add} />
              )}
            </div>
            {hasFiles && files.items.length > 1 && (
              <p className="border-t border-zinc-100 px-5 py-2.5 text-xs text-zinc-400 dark:border-white/[0.06]">
                Drag to reorder — files are merged top to bottom.
              </p>
            )}
          </section>


        <section className="card flex min-h-[420px] min-w-0 flex-col overflow-hidden lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100dvh-6.5rem)] lg:self-start">
          <div className="relative flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-100 px-5 py-2 dark:border-white/[0.06]">
            <h2 className="text-sm font-semibold">Preview</h2>
            <PreviewStats shown={shown} working={working} message={status.state === 'working' ? status.message : ''} />
            {shown && (
              <div className="ml-auto flex items-center gap-1.5">
                <a
                  className={`btn-ghost h-8 px-2.5 text-xs ${output ? '' : 'pointer-events-none opacity-40'}`}
                  href={output?.url}
                  target="_blank"
                  rel="noopener"
                >
                  <ExternalLink className="size-3.5" /> Open
                </a>
                <button
                  className="btn-secondary h-8 px-3 text-xs"
                  disabled={!output}
                  onClick={() => output && downloadBlob(output.url, pdfFileName(settings.fileName))}
                >
                  <ArrowDownToLine className="size-3.5" /> Download
                </button>
              </div>
            )}
            {working && (
              <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.max(4, (status.state === 'working' ? status.progress : 0) * 100)}%` }}
                />
              </div>
            )}
          </div>

          <div className="relative flex-1 overflow-auto bg-zinc-100/60 dark:bg-black/20">
            {broken.length > 0 ? (
              <Notice
                tone="error"
                title={broken.length === 1 ? 'One file can’t be used' : `${broken.length} files can’t be used`}
                text={`${broken[0].error ?? ''} Remove ${broken.length === 1 ? 'it' : 'them'} to continue.`}
              />
            ) : status.state === 'error' ? (
              <Notice tone="error" title="Couldn’t build the PDF" text={status.message} />
            ) : shown && !blocked ? (
              <Preview output={shown} dimmed={!output} />
            ) : hasFiles || loading ? (
              <div className="flex h-full min-h-[360px] items-center justify-center gap-2 text-sm text-zinc-500">
                <Spinner /> Preparing preview…
              </div>
            ) : (
              <EmptyPreview />
            )}
          </div>
        </section>
        <section className="card min-w-0 self-start overflow-hidden lg:col-start-1 lg:row-start-2">
          <div className="flex h-12 items-center gap-2 border-b border-zinc-100 px-5 dark:border-white/[0.06]">
            <h2 className="text-sm font-semibold">Layout</h2>
            <span className="ml-auto font-mono text-[11px] text-zinc-400">{summarizeSettings(settings)}</span>
          </div>
          <SettingsPanel settings={settings} onChange={update} onReset={reset} />
        </section>
      </main>

      {/* Mobile action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/70 bg-zinc-50/85 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden dark:border-white/[0.06] dark:bg-zinc-950/80">
        {mergeButton('h-11 w-full text-[15px]')}
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-blue-500/10 p-6 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-blue-500 bg-white/90 px-14 py-10 shadow-2xl dark:bg-zinc-900/90">
            <Upload className="size-7 text-blue-500" />
            <p className="text-base font-semibold">Drop to add PDFs</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-md animate-pop-in items-start gap-2.5 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-xl shadow-zinc-900/20 dark:bg-zinc-800 dark:ring-1 dark:ring-white/10"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-px size-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="mt-px size-4 shrink-0 text-amber-400" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewStats({
  shown,
  working,
  message,
}: {
  shown: ReturnType<typeof useImposition>['staleOutput'];
  working: boolean;
  message: string;
}) {
  if (working)
    return (
      <span className="flex items-center gap-1.5 text-xs text-zinc-500">
        <Spinner className="size-3" /> {message}
      </span>
    );
  if (!shown) return null;
  const { plan, sourcePageCount } = shown;
  const w = Math.round(ptToMm(plan.sheetSize.width));
  const h = Math.round(ptToMm(plan.sheetSize.height));
  return (
    <span className="text-xs text-zinc-500 tabular-nums">
      {plural(sourcePageCount, 'page')} → {plural(plan.sheets.length, 'sheet')}
      <span className="text-zinc-400">
        {' '}
        · {plan.orientation} {w}×{h} mm
      </span>
    </span>
  );
}

function Notice({ tone, title, text }: { tone: 'error'; title: string; text: string }) {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div
          className={`mx-auto mb-4 flex size-11 items-center justify-center rounded-2xl ${
            tone === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' : ''
          }`}
        >
          <AlertTriangle className="size-5" />
        </div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1.5 text-sm text-zinc-500">{text}</p>
      </div>
    </div>
  );
}

function EmptyPreview() {
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="grid aspect-[210/297] w-28 grid-cols-2 grid-rows-2 gap-1.5 rounded-[3px] bg-white p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_-6px_rgba(0,0,0,0.12)] ring-1 ring-zinc-900/[0.06] dark:bg-zinc-800 dark:ring-white/10">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[2px] bg-zinc-100 dark:bg-zinc-700/60" />
        ))}
      </div>
      <div>
        <p className="font-semibold">Your sheets will appear here</p>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-zinc-500">
          Add PDFs and they’re merged, laid out with your preset and previewed instantly — nothing leaves your
          device.
        </p>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-zinc-900 dark:fill-white" />
      {[
        [7, 7, 1],
        [17, 7, 0.75],
        [7, 17, 0.75],
        [17, 17, 0.5],
      ].map(([x, y, o]) => (
        <rect key={`${x}${y}`} x={x} y={y} width="8" height="8" rx="1.5" opacity={o} className="fill-white dark:fill-zinc-900" />
      ))}
    </svg>
  );
}

/** Shows an overlay while files are dragged over the window and accepts drops anywhere. */
function useWindowFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      depth.current = 0;
      setDragging(false);
      // Drops handled by a drop zone are already prevented.
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [onFiles]);
  return dragging;
}
