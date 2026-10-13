import { useId } from 'react';

// Простой линейный график (SVG, без внешних библиотек): точки по времени, линии пределов,
// точки вне пределов выделены. Масштабируется по ширине контейнера.
export interface ChartPoint { t: number; v: number; ok: boolean }

interface Props {
  points: ChartPoint[];
  min: number | null;
  max: number | null;
  label: string;
  formatT: (t: number) => string;
  formatV: (v: number) => string;
}

const W = 640, H = 220, PL = 48, PR = 12, PT = 12, PB = 28;

export function LineChart({ points, min, max, label, formatT, formatV }: Props) {
  const id = useId();
  if (points.length === 0) return null;
  const ts = points.map((p) => p.t);
  const vs = [...points.map((p) => p.v), ...(min !== null ? [min] : []), ...(max !== null ? [max] : [])];
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const t0 = Math.min(...ts), t1 = Math.max(...ts) === t0 ? t0 + 1 : Math.max(...ts);
  const x = (t: number) => PL + ((t - t0) / (t1 - t0)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} preserveAspectRatio="none">
        <title id={`${id}-t`}>{label}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} className="chart__grid" />
            <text x={PL - 6} y={y(v) + 4} className="chart__axis" textAnchor="end">{formatV(v)}</text>
          </g>
        ))}
        {min !== null && <line x1={PL} x2={W - PR} y1={y(min)} y2={y(min)} className="chart__limit" />}
        {max !== null && <line x1={PL} x2={W - PR} y1={y(max)} y2={y(max)} className="chart__limit" />}
        <polyline points={sorted.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} className="chart__line" />
        {sorted.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.v)} r={p.ok ? 3 : 5} className={p.ok ? 'chart__dot' : 'chart__dot chart__dot--bad'}>
            <title>{`${formatT(p.t)}: ${formatV(p.v)}`}</title>
          </circle>
        ))}
        <text x={PL} y={H - 8} className="chart__axis">{formatT(t0)}</text>
        <text x={W - PR} y={H - 8} className="chart__axis" textAnchor="end">{formatT(t1)}</text>
      </svg>
      <figcaption className="muted">{label}</figcaption>
    </figure>
  );
}
