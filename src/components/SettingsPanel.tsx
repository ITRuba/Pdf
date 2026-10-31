import { useEffect, useId, useState } from 'react';
import { Link2, Link2Off, RotateCcw } from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  PAGES_PER_SHEET_PRESETS,
  PAPER_SIZES_MM,
  READING_ORDER_LABELS,
  settingsEqual,
  type LayoutSettings,
  type Orientation,
  type PaperSize,
  type ReadingOrder,
} from '../lib/settings';

interface Props {
  settings: LayoutSettings;
  onChange: (patch: Partial<LayoutSettings>) => void;
  onReset: () => void;
}

export function SettingsPanel({ settings, onChange, onReset }: Props) {
  const pages = settings.cols * settings.rows;
  const isPreset = PAGES_PER_SHEET_PRESETS.some((p) => p.cols === settings.cols && p.rows === settings.rows);
  const isDefault = settingsEqual({ ...settings, fileName: DEFAULT_SETTINGS.fileName }, DEFAULT_SETTINGS);
  const m = settings.margins;
  const [linked, setLinked] = useState(m.top === m.right && m.right === m.bottom && m.bottom === m.left);

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-white/[0.06]">
      <Section title="Pages per sheet">
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {PAGES_PER_SHEET_PRESETS.map((p) => {
            const active = p.cols === settings.cols && p.rows === settings.rows;
            return (
              <button
                key={p.pages}
                onClick={() => onChange({ cols: p.cols, rows: p.rows })}
                className={`h-9 rounded-lg text-sm font-medium tabular-nums transition ${
                  active
                    ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100'
                }`}
                aria-pressed={active}
              >
                {p.pages}
              </button>
            );
          })}
          <span
            className={`flex h-9 items-center justify-center rounded-lg text-xs font-medium ${
              isPreset ? 'text-zinc-400' : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
            }`}
          >
            {isPreset ? 'Custom' : pages}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-zinc-500">Arrangement</span>
          <div className="ml-auto flex items-center gap-1.5">
            <NumberInput
              label="Columns"
              value={settings.cols}
              min={1}
              max={8}
              step={1}
              onChange={(cols) => onChange({ cols })}
              className="w-14"
            />
            <span className="text-zinc-400">×</span>
            <NumberInput
              label="Rows"
              value={settings.rows}
              min={1}
              max={8}
              step={1}
              onChange={(rows) => onChange({ rows })}
              className="w-14"
            />
          </div>
        </div>
      </Section>

      <Section title="Reading direction">
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(READING_ORDER_LABELS) as ReadingOrder[]).map((order) => {
            const active = settings.readingOrder === order;
            return (
              <button
                key={order}
                onClick={() => onChange({ readingOrder: order })}
                title={READING_ORDER_LABELS[order]}
                aria-label={READING_ORDER_LABELS[order]}
                aria-pressed={active}
                className={`flex h-14 items-center justify-center rounded-lg border transition ${
                  active
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:border-white/10 dark:hover:border-white/20 dark:hover:text-zinc-200'
                }`}
              >
                <OrderGlyph order={order} />
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-zinc-500">{READING_ORDER_LABELS[settings.readingOrder]}</p>
      </Section>

      <Section title="Paper">
        <div className="flex flex-col gap-2">
          <select
            className="field appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2371717a%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[position:right_0.75rem_center] bg-no-repeat pr-8"
            value={settings.paperSize}
            onChange={(e) => onChange({ paperSize: e.target.value as PaperSize })}
            aria-label="Paper size"
          >
            {(Object.keys(PAPER_SIZES_MM) as PaperSize[]).map((size) => (
              <option key={size} value={size}>
                {size} — {PAPER_SIZES_MM[size].width} × {PAPER_SIZES_MM[size].height} mm
              </option>
            ))}
          </select>
          <Segmented<Orientation>
            value={settings.orientation}
            onChange={(orientation) => onChange({ orientation })}
            options={[
              ['auto', 'Auto'],
              ['portrait', 'Portrait'],
              ['landscape', 'Landscape'],
            ]}
          />
        </div>
      </Section>

      <Section
        title="Margins"
        action={
          <button
            className="icon-btn"
            onClick={() => {
              if (!linked) onChange({ margins: { top: m.top, right: m.top, bottom: m.top, left: m.top } });
              setLinked(!linked);
            }}
            title={linked ? 'Set each side separately' : 'Use one value for all sides'}
            aria-label={linked ? 'Unlink margins' : 'Link margins'}
          >
            {linked ? <Link2 className="size-4" /> : <Link2Off className="size-4" />}
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {linked ? (
            <MmField
              label="Outer"
              value={m.top}
              onChange={(v) => onChange({ margins: { top: v, right: v, bottom: v, left: v } })}
            />
          ) : (
            <div className="col-span-2 grid grid-cols-4 gap-2">
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <MmField
                  key={side}
                  label={side[0].toUpperCase() + side.slice(1)}
                  value={m[side]}
                  onChange={(v) => onChange({ margins: { ...m, [side]: v } })}
                />
              ))}
            </div>
          )}
          <MmField label="Inner" value={settings.gutter} onChange={(gutter) => onChange({ gutter })} />
        </div>
      </Section>

      <Section title="Output">
        <label className="flex cursor-pointer items-center justify-between gap-3 py-0.5">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">Page borders</span>
          <Switch checked={settings.borders} onChange={(borders) => onChange({ borders })} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs text-zinc-500">File name</span>
          <div className="relative">
            <input
              className="field pr-12"
              value={settings.fileName}
              onChange={(e) => onChange({ fileName: e.target.value || DEFAULT_SETTINGS.fileName })}
              spellCheck={false}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-zinc-400">
              .pdf
            </span>
          </div>
        </label>
      </Section>

      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-xs text-zinc-400">Saved on this device</span>
        <button className="btn-ghost h-7 px-2 text-xs" onClick={onReset} disabled={isDefault}>
          <RotateCcw className="size-3.5" /> Reset to my preset
        </button>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4">
      <div className="mb-3 flex h-5 items-center justify-between">
        <h3 className="label">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex h-9 rounded-lg bg-zinc-100 p-0.5 dark:bg-white/5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-md px-2.5 text-xs font-medium transition ${
            value === v
              ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-700 dark:text-white dark:ring-white/10'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-zinc-200 dark:bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}

function MmField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-zinc-500">{label}</span>
      <div className="relative">
        <NumberInput label={label} value={value} min={0} max={100} step={0.5} onChange={onChange} className="pr-9" />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-zinc-400">
          mm
        </span>
      </div>
    </label>
  );
}

/** Number input that allows free typing and commits only valid values. */
function NumberInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
  className = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = (raw: string) => {
    const n = Number(raw.replace(',', '.'));
    if (raw.trim() !== '' && Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, step >= 1 ? Math.round(n) : n));
      onChange(clamped);
      return clamped;
    }
    return null;
  };

  return (
    <input
      id={id}
      aria-label={label}
      inputMode={step >= 1 ? 'numeric' : 'decimal'}
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={(e) => {
        if (commit(e.target.value) === null) setText(String(value));
        else setText(String(Math.min(max, Math.max(min, Number(e.target.value.replace(',', '.'))))));
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`field text-center tabular-nums ${className}`}
    />
  );
}

/** Tiny 2×2 diagram showing the order cells are filled in. */
function OrderGlyph({ order }: { order: ReadingOrder }) {
  const pos = {
    'row-ltr': [
      [7, 7],
      [21, 7],
      [7, 21],
      [21, 21],
    ],
    'row-rtl': [
      [21, 7],
      [7, 7],
      [21, 21],
      [7, 21],
    ],
    'col-ltr': [
      [7, 7],
      [7, 21],
      [21, 7],
      [21, 21],
    ],
    'col-rtl': [
      [21, 7],
      [21, 21],
      [7, 7],
      [7, 21],
    ],
  }[order];
  const path = pos.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return (
    <svg viewBox="0 0 28 28" className="size-7" fill="none">
      {[
        [2, 2],
        [16, 2],
        [2, 16],
        [16, 16],
      ].map(([x, y]) => (
        <rect key={`${x}${y}`} x={x} y={y} width="10" height="10" rx="2" stroke="currentColor" strokeOpacity=".35" />
      ))}
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pos[0][0]} cy={pos[0][1]} r="2" fill="currentColor" />
    </svg>
  );
}
