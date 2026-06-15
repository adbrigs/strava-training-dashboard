'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface WhoopRecord {
  date: string;
  recovery?: number;
  hrv?: number;
  restingHr?: number;
  sleepMs?: number;
  sleepPerformance?: number;
  strain?: number;
}

export type WhoopMetric = 'recovery' | 'hrv' | 'restingHr' | 'sleepPerformance' | 'strain';

const METRIC_META: Record<WhoopMetric, { label: string; unit: string; color: string; domain?: [number, number] }> = {
  recovery:         { label: 'Recovery',      unit: '%',   color: 'var(--z2)',     domain: [0, 100] },
  hrv:              { label: 'HRV',           unit: 'ms',  color: 'var(--accent)'                   },
  restingHr:        { label: 'Resting HR',    unit: 'bpm', color: 'var(--hot)'                      },
  sleepPerformance: { label: 'Sleep Perf.',   unit: '%',   color: 'var(--z1)',     domain: [0, 100] },
  strain:           { label: 'Strain',        unit: '/21', color: 'var(--warn)',   domain: [0, 21]  },
};

function recoveryFill(score: number) {
  if (score >= 67) return 'var(--z2)';
  if (score >= 34) return 'var(--warn)';
  return 'var(--hot)';
}

interface Props {
  records: WhoopRecord[];
  metric: WhoopMetric;
  height?: number;
}

export default function WhoopTrendChart({ records, metric, height = 220 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hi, setHi] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(
    () => records.filter(r => r[metric] != null),
    [records, metric],
  );

  const padL = 44, padR = 14, padT = 14, padB = 28;
  const H = height;
  const innerW = Math.max(0, w - padL - padR);
  const innerH = H - padT - padB;
  const n = filtered.length;

  const { minV, maxV } = useMemo(() => {
    const meta = METRIC_META[metric];
    if (meta.domain) return { minV: meta.domain[0], maxV: meta.domain[1] };
    const vals = filtered.map(r => r[metric] as number);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.15 || 5;
    return { minV: lo - pad, maxV: hi + pad };
  }, [filtered, metric]);

  const xPos = (i: number) => padL + (innerW / Math.max(1, n - 1)) * i;
  const yPos = (v: number) => padT + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;

  const linePath = filtered.map((r, i) =>
    `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)} ${yPos(r[metric] as number).toFixed(1)}`
  ).join(' ');

  const areaPath = (() => {
    const top = filtered.map((r, i) => `${xPos(i).toFixed(1)} ${yPos(r[metric] as number).toFixed(1)}`);
    const baseline = yPos(Math.max(minV, 0));
    const bl = [
      `${xPos(n - 1).toFixed(1)} ${baseline.toFixed(1)}`,
      `${xPos(0).toFixed(1)} ${baseline.toFixed(1)}`,
    ];
    return `M${top.join(' L')} L${bl.join(' L')} Z`;
  })();

  const ticks = useMemo(() => {
    const out: number[] = [];
    let lastM = -1;
    filtered.forEach((r, i) => {
      const m = new Date(r.date + 'T12:00:00').getMonth();
      if (m !== lastM) { out.push(i); lastM = m; }
    });
    return out;
  }, [filtered]);

  const yTicks = useMemo(() => {
    const range = maxV - minV;
    const step = range < 20 ? 5 : range < 50 ? 10 : range < 100 ? 25 : 50;
    const start = Math.ceil(minV / step) * step;
    const out: number[] = [];
    for (let v = start; v <= maxV; v += step) out.push(v);
    return out;
  }, [minV, maxV]);

  const meta = METRIC_META[metric];

  const hiX = hi != null ? xPos(hi) : null;
  const hiRatio = hiX != null ? (hiX - padL) / innerW : 0;
  const ttAnchor = hiRatio < 0.15 ? '0%' : hiRatio > 0.85 ? '-100%' : '-50%';

  if (n === 0) {
    return (
      <div ref={wrapRef} style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>No data yet</span>
      </div>
    );
  }

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${w} ${H}`}
        width={w}
        height={H}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const i = Math.max(0, Math.min(n - 1, Math.round(((px - padL) / innerW) * (n - 1))));
          setHi(i);
        }}
        onMouseLeave={() => setHi(null)}
      >
        {/* y-axis ticks */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={yPos(v)} y2={yPos(v)} stroke="var(--border)" strokeWidth="1" />
            <text className="ax-tick" x={padL - 6} y={yPos(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}

        {/* area fill */}
        <path d={areaPath} fill={meta.color} opacity="0.1" />

        {/* line */}
        <path d={linePath} fill="none" stroke={meta.color} strokeWidth="2" strokeLinejoin="round" />

        {/* dot-per-point for recovery (color-coded) */}
        {metric === 'recovery' && filtered.map((r, i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(r.recovery!)} r="3"
            fill={recoveryFill(r.recovery!)} opacity="0.7" />
        ))}

        {/* x-axis month labels */}
        {ticks.map(i => (
          <text key={i} className="ax-tick" x={xPos(i)} y={H - padB + 16} textAnchor="middle">
            {new Date(filtered[i].date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short' })}
          </text>
        ))}

        {/* hover crosshair */}
        {hi != null && (
          <g>
            <line x1={xPos(hi)} x2={xPos(hi)} y1={padT} y2={padT + innerH}
              stroke="var(--border-strong)" strokeDasharray="2 3" />
            <circle cx={xPos(hi)} cy={yPos(filtered[hi][metric] as number)} r="4"
              fill={metric === 'recovery' ? recoveryFill(filtered[hi].recovery!) : meta.color}
              stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hi != null && filtered[hi] && (
        <div className="tt" style={{ left: hiX!, top: 8, transform: `translate(${ttAnchor}, 0)` }}>
          <h5>{new Date(filtered[hi].date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</h5>
          <div className="tt-row" style={{ '--c': metric === 'recovery' ? recoveryFill(filtered[hi].recovery!) : meta.color } as React.CSSProperties}>
            <span className="sw" />
            <span className="nm">{meta.label}</span>
            <span className="v">{filtered[hi][metric]}{meta.unit}</span>
          </div>
          {/* Show companion metrics in tooltip */}
          {metric !== 'recovery' && filtered[hi].recovery != null && (
            <div className="tt-row" style={{ '--c': 'var(--z2)' } as React.CSSProperties}>
              <span className="sw" /><span className="nm">Recovery</span>
              <span className="v">{filtered[hi].recovery}%</span>
            </div>
          )}
          {metric !== 'hrv' && filtered[hi].hrv != null && (
            <div className="tt-row" style={{ '--c': 'var(--text-subtle)' } as React.CSSProperties}>
              <span className="sw" /><span className="nm">HRV</span>
              <span className="v">{filtered[hi].hrv} ms</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
