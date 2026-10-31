import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from './dndModifiers';
import { AlertCircle, ChevronDown, ChevronUp, FileText, GripVertical, X } from 'lucide-react';
import type { PdfItem } from '../hooks/useFiles';
import { formatBytes, plural } from '../lib/format';
import { Spinner } from './Spinner';

interface Props {
  items: PdfItem[];
  onMove: (fromId: string, toId: string) => void;
  onMoveBy: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}

export function FileList({ items, onMove, onMoveBy, onRemove }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
        <ol className="relative flex flex-col gap-1">
          {items.map((item, index) => (
            <Row
              key={item.id}
              item={item}
              index={index}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onMoveBy={onMoveBy}
              onRemove={onRemove}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

interface RowProps {
  item: PdfItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveBy: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}

function Row({ item, index, isFirst, isLast, onMoveBy, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative flex items-center gap-2.5 rounded-xl border px-2 py-2 transition-colors ${
        isDragging
          ? 'z-10 border-zinc-200 bg-white shadow-lg shadow-zinc-900/10 dark:border-white/10 dark:bg-zinc-800'
          : item.status === 'error'
            ? 'border-red-200 bg-red-50/60 dark:border-red-500/20 dark:bg-red-500/5'
            : 'border-transparent hover:bg-zinc-50 dark:hover:bg-white/[0.03]'
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${item.name}`}
        className="flex h-10 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-zinc-300 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400"
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-4 shrink-0 text-right font-mono text-[11px] text-zinc-400 tabular-nums">{index + 1}</span>

      <div className="flex h-11 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-zinc-100 ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:ring-white/10">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className="h-full w-full object-contain bg-white" draggable={false} />
        ) : item.status === 'error' ? (
          <AlertCircle className="size-4 text-red-500" />
        ) : (
          <FileText className="size-4 text-zinc-400" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={item.name}>
          {item.name}
        </p>
        <p className={`truncate text-xs ${item.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}`}>
          {item.status === 'loading' && (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3" /> Reading…
            </span>
          )}
          {item.status === 'ready' && `${plural(item.pageCount ?? 0, 'page')} · ${formatBytes(item.size)}`}
          {item.status === 'error' && <span title={item.error}>{item.error}</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <button className="icon-btn" onClick={() => onMoveBy(item.id, -1)} disabled={isFirst} aria-label="Move up">
          <ChevronUp className="size-4" />
        </button>
        <button className="icon-btn" onClick={() => onMoveBy(item.id, 1)} disabled={isLast} aria-label="Move down">
          <ChevronDown className="size-4" />
        </button>
      </div>
      <button
        className="icon-btn hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-500/10"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.name}`}
      >
        <X className="size-4" />
      </button>
    </li>
  );
}
