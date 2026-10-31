import { useRef, useState } from 'react';
import { Plus, Upload } from 'lucide-react';

interface Props {
  onFiles: (files: File[]) => void;
  compact?: boolean;
}

export function FilePicker({ onFiles, children }: { onFiles: (files: File[]) => void; children: (open: () => void) => React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      {children(() => input.current?.click())}
    </>
  );
}

export function DropZone({ onFiles, compact }: Props) {
  const [over, setOver] = useState(false);

  const handlers = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      onFiles(Array.from(e.dataTransfer.files));
    },
  };

  return (
    <FilePicker onFiles={onFiles}>
      {(open) =>
        compact ? (
          <button
            {...handlers}
            onClick={open}
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium transition ${
              over
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                : 'border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-800 dark:border-white/15 dark:hover:border-white/25 dark:hover:bg-white/[0.03] dark:hover:text-zinc-200'
            }`}
          >
            <Plus className="size-4" /> Add PDFs
          </button>
        ) : (
          <button
            {...handlers}
            onClick={open}
            className={`group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center transition ${
              over
                ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-500/10'
                : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50/80 dark:border-white/15 dark:hover:border-white/25 dark:hover:bg-white/[0.02]'
            }`}
          >
            <span
              className={`flex size-12 items-center justify-center rounded-2xl transition ${
                over
                  ? 'bg-blue-500 text-white'
                  : 'bg-zinc-900 text-white shadow-md shadow-zinc-900/20 group-hover:scale-105 dark:bg-white dark:text-zinc-900'
              }`}
            >
              <Upload className="size-5" strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                Drop PDFs here
              </span>
              <span className="mt-1 block text-sm text-zinc-500">
                or <span className="text-blue-600 dark:text-blue-400">browse</span> — select as many as you like
              </span>
            </span>
          </button>
        )
      }
    </FilePicker>
  );
}
