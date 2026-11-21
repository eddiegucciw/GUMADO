/**
 * Lightweight, dependency-free SVG charts. Interactive (hover / tap shows
 * values), accessible (data table fallback for screen readers), and cheap to
 * render on low-end phones.
 */
import { useMemo, useState } from 'react';
import { cx } from './core';

export interface SeriesDef { key: string; label: string; color: string }

export function BarChart<T extends Record<string, unknown>>({ data, xKey, series, formatX, formatY, height = 220, title }: {
  data: T[]; xKey: keyof T; series: SeriesDef[]; formatX: (v: string) => string; formatY: (v: number) => string; height?: number; title: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0)))), [data, series]);
  const W = 640, H = height, PAD_L = 8, PAD_B = 22, PAD_T = 10;
  const n = Math.max(1, data.length);
  const band = (W - PAD_L) / n;
  const barW = Math.max(2, Math.min(22, (band * 0.72) / series.length));
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / max);
  const labelEvery = Math.ceil(n / 8);
  const ticks = [0, 0.5, 1].map((t) => t * max);

  const onMove = (clientX: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * W - PAD_L;
    setActive(Math.max(0, Math.min(n - 1, Math.floor(x / band))));
  };

  const cur = active != null ? data[active] : null;
  return (
    <figure className="relative">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
        {cur && (
          <span className="ml-auto font-medium text-ink tabular">
            {formatX(String(cur[xKey]))}: {series.map((s) => `${s.label} ${formatY(Number(cur[s.key] ?? 0))}`).join(' · ')}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-pan-y select-none" role="img" aria-label={title}
        onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActive(null)}>
        {ticks.map((t, i) => (
          <line key={i} x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={i === 0 ? undefined : '3 4'} />
        ))}
        {data.map((d, i) => {
          const x0 = PAD_L + i * band + (band - barW * series.length) / 2;
          return (
            <g key={i} opacity={active == null || active === i ? 1 : 0.45}>
              <rect x={PAD_L + i * band} y={PAD_T} width={band} height={H - PAD_T - PAD_B} fill={active === i ? 'var(--surface-2)' : 'transparent'} />
              {series.map((s, j) => {
                const v = Number(d[s.key] ?? 0);
                const top = y(v);
                return <rect key={s.key} x={x0 + j * barW} y={top} width={barW - 1} height={Math.max(0, H - PAD_B - top)} rx={Math.min(3, barW / 3)} fill={s.color} />;
              })}
              {i % labelEvery === 0 && (
                <text x={PAD_L + i * band + band / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">{formatX(String(d[xKey]))}</text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-right text-[0.7rem] text-muted tabular">Max {formatY(max)}</p>
      <table className="sr-only">
        <thead><tr><th>Period</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{data.map((d, i) => <tr key={i}><td>{formatX(String(d[xKey]))}</td>{series.map((s) => <td key={s.key}>{formatY(Number(d[s.key] ?? 0))}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Horizontal stacked bar, e.g. plot inventory by status. */
export function StackedBar({ parts, total, className }: { parts: { label: string; value: number; color: string }[]; total: number; className?: string }) {
  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3" role="img"
        aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
        {parts.map((p) => p.value > 0 && (
          <div key={p.label} style={{ width: `${(p.value / Math.max(1, total)) * 100}%`, background: p.color }} className="h-full" title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="text-muted">{p.label}</span>
            <span className={cx('ml-auto font-semibold text-ink tabular')}>{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
