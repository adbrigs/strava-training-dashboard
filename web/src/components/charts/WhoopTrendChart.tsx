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
  weightKg?: number;
  weightLbs?: number;
}

export type WhoopMetric = 'recovery' | 'hrv' | 'restingHr' | 'sleepPerformance' | 'strain' | 'weightLbs';

const METRIC_META: Record<WhoopMetric, { label: string; unit: string; color: string; domain?: [number, number] }> = {
  recovery:         { label: 'Recovery',    unit: '%',   color: 'var(--z2)',   domain: [0, 100] },
  hrv:              { label: 'HRV',         unit: 'ms',  color: 'var(--accent)'                 },
  restingHr:        { label: 'Resting HR',  unit: 'bpm', color: 'var(--hot)'                    },
  sleepPerformance: { label: 'Sleep Perf.', unit: '%',   color: 'var(--z1)',   domain: [0, 100] },
  strain:           { label: 'Strain',      unit: '/21', color: 'var(--warn)', domain: [0, 21]  },
  weightLbs:        { label: 'Weight',      unit: 'lbs', color: 'var(--act-weights)'            },
};

// Target ranges: what counts as "good" for each metric
const TARGET_RANGES: Partial<Record<WhoopMetric, { lo: number; hi: number; label: string }>> = {
  recovery:         { lo: 67,  hi: 100, label: 'Green zone'    },
  hrv:              { lo: 70,  hi: 100, label: 'Optimal'       },
  restingHr:        { lo: 40,  hi: 60,  label: 'Athlete range' },
  sleepPerformance: { lo: 85,  hi: 100, label: 'Optimal sleep' },
  strain:           { lo: 10,  hi: 18,  label: 'Training zone' },
};

function recoveryFill(score: number) {
  if (score >= 67) return 'var(--z2)';
  if (score >= 34) return 'var(--warn)';
  return 'var(--hot)';
}

function formatMetric(metric: WhoopMetric, value: number) {
  if (metric === 'strain' || metric === 'weightLbs') return value.toFixed(1);
  return Math.round(value).toString();
}

interface Props {
  records: WhoopRecord[];
  metric: WhoopMetric;
  height?: number;
}

export default function WhoopTrendChart({ records, metric, height = 220 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

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

  const padL = 44, padR = 14, padT = 16, padB = 28;
  const H = height;
  const innerW = Math.max(0, w - padL - padR);
  const innerH = H - padT - padB;
  const n = filtered.length;

  const { minV, maxV } = useMemo(() => {
    const meta = METRIC_META[metric];
    const target = TARGET_RANGES[metric];
    if (meta.domain) return { minV: meta.domain[0], maxV: meta.domain[1] };
    const vals = filtered.map(r => r[metric] as number);
    const lo = target ? Math.min(...vals, target.lo) : Math.min(...vals);
    const hi = target ? Math.max(...vals, target.hi) : Math.max(...vals);
    const pad = (hi - lo) * 0.15 || 5;
    return { minV: lo - pad, maxV: hi + pad };
  }, [filtered, metric]);

  const xPos = (i: number) => padL + (innerW / Math.max(1, n - 1)) * i;
  const yPos = (v: number) => padT + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;

  // Average
  const avg = useMemo(() => {
    if (n === 0) return null;
    const vals = filtered.map(r => r[metric] as number);
    return vals.reduce((a, b) => a + b, 0) / n;
  }, [filtered, metric, n]);

  // Linear regression trend line (in data space)
  const trend = useMemo(() => {
    if (n < 2) return null;
    const ys = filtered.map(r => r[metric] as number);
    const sumX = (n * (n - 1)) / 2;
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = ys.reduce((s, y, i) => s + i * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { start: intercept, end: intercept + slope * (n - 1), slope };
  }, [filtered, metric, n]);

  const linePath = filtered.map((r, i) =>
    `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)} ${yPos(r[metric] as number).toFixed(1)}`
  ).join(' ');

  const areaPath = (() => {
    const top = filtered.map((r, i) => `${xPos(i).toFixed(1)} ${yPos(r[metric] as number).toFixed(1)}`);
    const baseline = yPos(Math.max(minV, 0));
    return `M${top.join(' L')} L${xPos(n - 1).toFixed(1)} ${baseline.toFixed(1)} L${xPos(0).toFixed(1)} ${baseline.toFixed(1)} Z`;
  })();

  const xTicks = useMemo(() => {
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
  const target = TARGET_RANGES[metric];

  // Target band (clamped to chart area)
  const bandTop = target ? Math.max(padT, yPos(Math.min(target.hi, maxV))) : 0;
  const bandBot = target ? Math.min(padT + innerH, yPos(Math.max(target.lo, minV))) : 0;
  const bandVisible = target ? bandBot > bandTop : false;

  const hiX = hover != null ? xPos(hover) : null;
  const hiRatio = hiX != null ? (hiX - padL) / innerW : 0;
  const ttAnchor = hiRatio < 0.15 ? '0%' : hiRatio > 0.85 ? '-100%' : '-50%';

  // Trend direction — positive slope = values rising
  const trendUp = trend ? trend.slope > 0 : null;

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
          setHover(i);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* target range band */}
        {bandVisible && (
          <rect
            x={padL} y={bandTop}
            width={innerW} height={bandBot - bandTop}
            fill={meta.color} opacity="0.09"
          />
        )}

        {/* y-axis grid + labels */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={yPos(v)} y2={yPos(v)} stroke="var(--border)" strokeWidth="1" />
            <text className="ax-tick" x={padL - 6} y={yPos(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}

        {/* area fill */}
        <path d={areaPath} fill={meta.color} opacity="0.08" />

        {/* trend line */}
        {trend && (
          <line
            x1={xPos(0)}    y1={yPos(trend.start)}
            x2={xPos(n - 1)} y2={yPos(trend.end)}
            stroke={meta.color} strokeWidth="1.5" strokeOpacity="0.55"
            strokeDasharray="5 3"
          />
        )}

        {/* average line */}
        {avg != null && (
          <>
            <line
              x1={padL} x2={w - padR}
              y1={yPos(avg)} y2={yPos(avg)}
              stroke="var(--text-subtle)" strokeWidth="1" strokeOpacity="0.65"
              strokeDasharray="3 4"
            />
            <text
              x={w - padR - 3} y={yPos(avg) - 4}
              textAnchor="end"
              fontSize="9" fontFamily="var(--font-mono)"
              fill="var(--text-subtle)" opacity="0.85"
            >
              avg {formatMetric(metric, avg)}{meta.unit}
            </text>
          </>
        )}

        {/* data line */}
        <path d={linePath} fill="none" stroke={meta.color} strokeWidth="2" strokeLinejoin="round" />

        {/* recovery dots (color-coded) */}
        {metric === 'recovery' && filtered.map((r, i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(r.recovery!)} r="3"
            fill={recoveryFill(r.recovery!)} opacity="0.7" />
        ))}

        {/* x-axis month labels */}
        {xTicks.map(i => (
          <text key={i} className="ax-tick" x={xPos(i)} y={H - padB + 16} textAnchor="middle">
            {new Date(filtered[i].date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short' })}
          </text>
        ))}

        {/* hover crosshair */}
        {hover != null && (
          <g>
            <line x1={xPos(hover)} x2={xPos(hover)} y1={padT} y2={padT + innerH}
              stroke="var(--border-strong)" strokeDasharray="2 3" />
            <circle
              cx={xPos(hover)} cy={yPos(filtered[hover][metric] as number)} r="4"
              fill={metric === 'recovery' ? recoveryFill(filtered[hover].recovery!) : meta.color}
              stroke="var(--surface)" strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hover != null && filtered[hover] && (
        <div className="tt" style={{ left: hiX!, top: 8, transform: `translate(${ttAnchor}, 0)` }}>
          <h5>{new Date(filtered[hover].date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</h5>
          <div className="tt-row" style={{ '--c': metric === 'recovery' ? recoveryFill(filtered[hover].recovery!) : meta.color } as React.CSSProperties}>
            <span className="sw" />
            <span className="nm">{meta.label}</span>
            <span className="v">{formatMetric(metric, filtered[hover][metric] as number)}{meta.unit}</span>
          </div>
          {metric !== 'recovery' && filtered[hover].recovery != null && (
            <div className="tt-row" style={{ '--c': 'var(--z2)' } as React.CSSProperties}>
              <span className="sw" /><span className="nm">Recovery</span>
              <span className="v">{filtered[hover].recovery}%</span>
            </div>
          )}
          {metric !== 'hrv' && filtered[hover].hrv != null && (
            <div className="tt-row" style={{ '--c': 'var(--text-subtle)' } as React.CSSProperties}>
              <span className="sw" /><span className="nm">HRV</span>
              <span className="v">{filtered[hover].hrv} ms</span>
            </div>
          )}
          {metric === 'weightLbs' && filtered[hover].weightKg != null && (
            <div className="tt-row" style={{ '--c': 'var(--text-subtle)' } as React.CSSProperties}>
              <span className="sw" /><span className="nm">Weight</span>
              <span className="v">{filtered[hover].weightKg?.toFixed(1)} kg</span>
            </div>
          )}
        </div>
      )}

      {/* legend */}
      <div style={{
        display: 'flex', gap: 18, marginTop: 8,
        fontSize: 10, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)',
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        {/* average */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="18" height="8" style={{ flexShrink: 0 }}>
            <line x1="0" y1="4" x2="18" y2="4" stroke="var(--text-subtle)" strokeWidth="1" strokeDasharray="3 4" />
          </svg>
          <span>avg {avg != null ? `${formatMetric(metric, avg)}${meta.unit}` : '—'}</span>
        </div>
        {/* trend */}
        {trend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="18" height="8" style={{ flexShrink: 0 }}>
              <line x1="0" y1={trendUp ? 7 : 1} x2="18" y2={trendUp ? 1 : 7}
                stroke={meta.color} strokeWidth="1.5" strokeDasharray="5 3" strokeOpacity="0.7" />
            </svg>
            <span>trend {trendUp ? '↑' : '↓'}</span>
          </div>
        )}
        {/* target band */}
        {target && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 14, height: 8, borderRadius: 2,
              background: meta.color, opacity: 0.3, flexShrink: 0,
            }} />
            <span>{target.label} {target.lo}-{target.hi}{meta.unit === '/21' ? '' : meta.unit}</span>
          </div>
        )}
      </div>
    </div>
  );
}
