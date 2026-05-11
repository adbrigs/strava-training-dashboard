'use client';
import { useMemo, useRef, useEffect, useState } from 'react';
import type { Activity } from '@/lib/types';

interface Props {
  filtered: Activity[];
}

type Split = 'Push' | 'Pull' | 'Legs' | 'Shoulders' | 'Other';

const SPLIT_COLORS: Record<Split, string> = {
  Push:      '#ff7a3d',
  Pull:      '#4f8cff',
  Legs:      '#c4f24e',
  Shoulders: '#b794f4',
  Other:     '#6b7280',
};

const SPLIT_ORDER: Split[] = ['Push', 'Pull', 'Legs', 'Shoulders', 'Other'];

function classifyLift(name: string): Split {
  const n = name.toLowerCase();
  if (n.includes('push') || n.includes('chest')) return 'Push';
  if (n.includes('pull') || n.includes('back') || n.includes('bis')) return 'Pull';
  if (n.includes('leg')) return 'Legs';
  if (n.includes('shoulder')) return 'Shoulders';
  return 'Other';
}

interface HoverBar { i: number; x: number; y: number; month: string; byType: Record<Split, number>; }

export default function LiftSplitSection({ filtered }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<HoverBar | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const lifts = useMemo(
    () => filtered.filter(a => a.type === 'WeightTraining'),
    [filtered]
  );

  // Per-split totals
  const totals = useMemo(() => {
    const counts: Record<Split, number> = { Push: 0, Pull: 0, Legs: 0, Shoulders: 0, Other: 0 };
    const trimpSum: Record<Split, number> = { Push: 0, Pull: 0, Legs: 0, Shoulders: 0, Other: 0 };
    lifts.forEach(a => {
      const s = classifyLift(a.name);
      counts[s]++;
      trimpSum[s] += a.trimp;
    });
    return SPLIT_ORDER.map(s => ({
      split: s,
      count: counts[s],
      avg: counts[s] > 0 ? Math.round(trimpSum[s] / counts[s]) : 0,
      pct: lifts.length > 0 ? Math.round((counts[s] / lifts.length) * 100) : 0,
      color: SPLIT_COLORS[s],
    })).filter(s => s.count > 0);
  }, [lifts]);

  // Monthly breakdown for stacked bar
  const { months, maxCount } = useMemo(() => {
    const map = new Map<string, Record<Split, number>>();
    lifts.forEach(a => {
      const key = `${a.date.getFullYear()}-${String(a.date.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, { Push: 0, Pull: 0, Legs: 0, Shoulders: 0, Other: 0 });
      const s = classifyLift(a.name);
      map.get(key)![s]++;
    });
    const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    let maxCount = 0;
    sorted.forEach(([, v]) => {
      const total = SPLIT_ORDER.reduce((s, t) => s + v[t], 0);
      maxCount = Math.max(maxCount, total);
    });
    return {
      months: sorted.map(([key, byType]) => ({
        key,
        label: new Date(key + '-01').toLocaleDateString(undefined, { month: 'short' }),
        byType,
      })),
      maxCount: Math.max(maxCount, 1),
    };
  }, [lifts]);

  if (lifts.length === 0) {
    return (
      <div className="card fade-in">
        <div className="card-head">
          <div className="card-title">Lift Split</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--text-subtle)', fontSize: 13 }}>
          No weight training in selected range
        </div>
      </div>
    );
  }

  // Chart dims
  const padL = 28, padR = 12, padT = 12, padB = 28;
  const H = 180;
  const innerW = Math.max(0, w - padL - padR);
  const innerH = H - padT - padB;
  const n = months.length;
  const xBand = innerW / Math.max(1, n);
  const barW = Math.min(36, xBand * 0.72);
  const xPos = (i: number) => padL + xBand * (i + 0.5);
  const yScale = (v: number) => padT + innerH - (v / maxCount) * innerH;
  const xStep = n > 18 ? Math.ceil(n / 8) : n > 10 ? 2 : 1;

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">
          Lift Split
          <span className="info" title="Weight training sessions classified by name: push/chest → Push, pull/back → Pull, leg → Legs, shoulder → Shoulders.">i</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{lifts.length} sessions</span>
      </div>

      {/* Split stat boxes */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {totals.map(({ split, count, avg, pct, color }) => (
          <div key={split} style={{
            flex: '1 1 100px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 14px',
            borderTop: `3px solid ${color}`,
            minWidth: 90,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 6, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {split}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>
              {count}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {pct}% · avg {avg} TRIMP
            </div>
          </div>
        ))}
      </div>

      {/* Monthly stacked bar */}
      {months.length > 1 && (
        <div className="chart-wrap" ref={wrapRef} style={{ marginTop: 0 }}>
          <svg
            className="chart-svg"
            viewBox={`0 0 ${w} ${H}`}
            width={w}
            height={H}
            onMouseLeave={() => setHover(null)}
          >
            <line className="ax-line" x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} />

            {/* Y ticks */}
            {[0, Math.ceil(maxCount / 2), maxCount].map(t => (
              <g key={t}>
                <line className="ax-grid" x1={padL} x2={w - padR} y1={yScale(t)} y2={yScale(t)} />
                <text className="ax-tick" x={padL - 5} y={yScale(t) + 3} textAnchor="end">{t}</text>
              </g>
            ))}

            {/* Stacked bars */}
            {months.map((m, i) => {
              let y0 = padT + innerH;
              return (
                <g key={m.key} transform={`translate(${xPos(i) - barW / 2}, 0)`}>
                  {SPLIT_ORDER.map(s => {
                    const v = m.byType[s];
                    if (!v) return null;
                    const h = (v / maxCount) * innerH;
                    const y = y0 - h;
                    y0 = y;
                    return <rect key={s} x="0" y={y} width={barW} height={h - 0.5} rx="2" fill={SPLIT_COLORS[s]} />;
                  })}
                </g>
              );
            })}

            {/* X labels */}
            {months.map((m, i) => i % xStep === 0 && (
              <text key={i} className="ax-tick" x={xPos(i)} y={H - padB + 14} textAnchor="middle">{m.label}</text>
            ))}

            {/* Hover regions */}
            {months.map((m, i) => (
              <rect
                key={'h' + i}
                className="hover-bar"
                x={padL + xBand * i} y={padT}
                width={xBand} height={innerH}
                onMouseEnter={() => setHover({ i, x: xPos(i), y: padT + 4, month: m.label, byType: m.byType })}
              />
            ))}
          </svg>

          {hover && (
            <div className="tt" style={{ left: hover.x, top: hover.y }}>
              <h5>{hover.month}</h5>
              {SPLIT_ORDER.map(s => hover.byType[s] > 0 && (
                <div key={s} className="tt-row" style={{ '--c': SPLIT_COLORS[s] } as React.CSSProperties}>
                  <span className="sw" />
                  <span className="nm">{s}</span>
                  <span className="v">{hover.byType[s]}</span>
                </div>
              ))}
              <div className="tt-row total">
                <span className="nm">Total</span>
                <span className="v">{SPLIT_ORDER.reduce((s, t) => s + hover.byType[t], 0)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="legend" style={{ marginTop: 8 }}>
        {totals.map(({ split, color }) => (
          <span key={split} className="legend-item" style={{ '--c': color } as React.CSSProperties}>
            <span className="sw" />
            {split}
          </span>
        ))}
      </div>
    </div>
  );
}
