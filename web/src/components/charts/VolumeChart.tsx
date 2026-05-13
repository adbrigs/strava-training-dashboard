'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { ACTIVITY_LABELS } from '@/lib/dataUtils';

export interface Bucket {
  label: string;
  fullLabel: string;
  start: Date;
  end: Date;
  byType: Record<string, number>;
  total: number;
  rolling: number;
}

interface Props {
  buckets: Bucket[];
  types: string[];
  palette: Record<string, string>;
  chartStyle?: 'bar' | 'area' | 'line';
  onChartStyle?: (s: 'bar' | 'area' | 'line') => void;
  showRollingAvg?: boolean;
  mutedTypes?: Set<string>;
  height?: number;
  fmtVal?: (v: number) => string;
  labels?: Record<string, string>;
  selectedBucketIdx?: number | null;
  onBarClick?: (i: number) => void;
}

interface HoverInfo {
  i: number;
  x: number;
  y: number;
  b: Bucket;
}

export default function VolumeChart({
  buckets, types, palette,
  chartStyle = 'bar', onChartStyle,
  showRollingAvg = true,
  mutedTypes = new Set(), height = 300,
  fmtVal, labels,
  selectedBucketIdx = null, onBarClick,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const padL = 36, padR = 14, padT = 16, padB = 36;
  const H = height;
  const innerW = Math.max(0, w - padL - padR);
  const innerH = H - padT - padB;
  const n = buckets.length;

  const maxVal = useMemo(() => {
    if (chartStyle === 'line') {
      let m = 0;
      buckets.forEach(b => types.forEach(t => { if (!mutedTypes.has(t)) m = Math.max(m, b.byType[t] || 0); }));
      return Math.max(m, ...buckets.map(b => b.rolling || 0)) * 1.1 || 100;
    }
    let m = 0;
    buckets.forEach(b => {
      let s = 0; types.forEach(t => { if (!mutedTypes.has(t)) s += (b.byType[t] || 0); });
      m = Math.max(m, s);
    });
    return Math.max(m, ...buckets.map(b => b.rolling || 0)) * 1.1 || 100;
  }, [buckets, types, chartStyle, mutedTypes]);

  const xPos = (i: number) => padL + (innerW / Math.max(1, n)) * (i + 0.5);
  const xBand = innerW / Math.max(1, n);
  const yScale = (v: number) => padT + innerH - (v / maxVal) * innerH;

  const yTicks = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(maxVal))) / 2;
    const ts: number[] = [];
    for (let v = 0; v <= maxVal; v += step) ts.push(v);
    if (ts.length > 6) return ts.filter((_, i) => i % 2 === 0);
    return ts;
  }, [maxVal]);

  const xStep = n > 20 ? Math.ceil(n / 8) : n > 10 ? 2 : 1;

  function fmt(n: number) {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  const STYLES: Array<'bar' | 'area' | 'line'> = ['bar', 'area', 'line'];

  return (
    <div className="chart-wrap" ref={wrapRef}>
      {/* Chart style overlay */}
      {onChartStyle && (
        <div style={{
          position: 'absolute', top: 6, right: 6, zIndex: 10,
          display: 'flex', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)',
          padding: '2px',
        }}>
          {STYLES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onChartStyle(s)}
              style={{
                fontSize: 10.5, fontWeight: 500,
                padding: '2px 9px', borderRadius: 'var(--radius-pill)',
                background: chartStyle === s ? 'var(--surface)' : 'transparent',
                color: chartStyle === s ? 'var(--text)' : 'var(--text-subtle)',
                border: chartStyle === s ? '1px solid var(--border-strong)' : '1px solid transparent',
                lineHeight: 1.6,
              }}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      <svg
        className="chart-svg"
        viewBox={`0 0 ${w} ${H}`}
        width={w}
        height={H}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid */}
        {yTicks.map(t => (
          <g key={t}>
            <line className="ax-grid" x1={padL} x2={w - padR} y1={yScale(t)} y2={yScale(t)} />
            <text className="ax-tick" x={padL - 8} y={yScale(t) + 3} textAnchor="end">{fmt(t)}</text>
          </g>
        ))}
        <line className="ax-line" x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} />

        {/* Selected bucket highlight */}
        {selectedBucketIdx != null && (
          <rect
            x={padL + (innerW / Math.max(1, n)) * selectedBucketIdx}
            y={padT}
            width={innerW / Math.max(1, n)}
            height={innerH}
            fill="var(--accent)"
            opacity={0.1}
            rx={4}
          />
        )}

        {/* Bars */}
        {chartStyle === 'bar' && buckets.map((b, i) => {
          let y0 = padT + innerH;
          const barW = Math.min(38, xBand * 0.7);
          const dimmed = selectedBucketIdx != null && selectedBucketIdx !== i;
          return (
            <g key={i} className="bar-stack" transform={`translate(${xPos(i) - barW / 2}, 0)`} opacity={dimmed ? 0.3 : 1}>
              {types.map(t => {
                if (mutedTypes.has(t)) return null;
                const v = b.byType[t] || 0;
                if (!v) return null;
                const h = (v / maxVal) * innerH;
                const y = y0 - h;
                y0 = y;
                return <rect key={t} x="0" y={y} width={barW} height={h - 1} rx="2" fill={palette[t]} />;
              })}
            </g>
          );
        })}

        {/* Area */}
        {chartStyle === 'area' && (() => {
          const stacks: Record<string, number>[] = [];
          for (let i = 0; i < n; i++) {
            let cum = 0;
            const row: Record<string, number> = {};
            types.forEach(t => {
              if (mutedTypes.has(t)) { row[t] = cum; return; }
              cum += (buckets[i].byType[t] || 0);
              row[t] = cum;
            });
            stacks.push(row);
          }
          let prev = new Array(n).fill(0);
          return types.map(t => {
            if (mutedTypes.has(t)) return null;
            const top = stacks.map(r => r[t]);
            const bot = prev.slice();
            const d = [
              ...top.map((v, i) => `${i ? 'L' : 'M'}${xPos(i).toFixed(1)} ${yScale(v).toFixed(1)}`),
              ...bot.slice().reverse().map((v, i) => `L${xPos(n - 1 - i).toFixed(1)} ${yScale(v).toFixed(1)}`),
              'Z',
            ].join(' ');
            prev = top;
            return <path key={t} d={d} fill={palette[t]} opacity="0.85" />;
          });
        })()}

        {/* Line */}
        {chartStyle === 'line' && types.map(t => {
          if (mutedTypes.has(t)) return null;
          const pts = buckets.map((b, i) => [xPos(i), yScale(b.byType[t] || 0)]);
          const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
          return <path key={t} d={d} fill="none" stroke={palette[t]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
        })}

        {/* Rolling avg overlay */}
        {showRollingAvg && (() => {
          const pts = buckets.map((b, i) => [xPos(i), yScale(b.rolling || 0)]);
          const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
          return (
            <g>
              <path d={d} fill="none" stroke="var(--text)" strokeWidth="1.3" strokeDasharray="3 3" opacity="0.9" />
              {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2" fill="var(--text)" opacity="0.9" />)}
            </g>
          );
        })()}

        {/* X ticks */}
        {buckets.map((b, i) => i % xStep === 0 && (
          <text key={i} className="ax-tick" x={xPos(i)} y={H - padB + 16} textAnchor="middle">{b.label}</text>
        ))}

        {/* Hover regions */}
        {buckets.map((b, i) => (
          <rect
            key={'h' + i}
            className="hover-bar"
            x={padL + (innerW / Math.max(1, n)) * i}
            y={padT}
            width={innerW / Math.max(1, n)}
            height={innerH}
            style={{ cursor: onBarClick ? 'pointer' : undefined }}
            onMouseEnter={() => setHover({ i, x: xPos(i), y: padT + innerH * 0.35, b })}
            onClick={() => onBarClick?.(i)}
          />
        ))}
      </svg>

      {hover && (
        <div className="tt" style={{ left: hover.x, top: hover.y }}>
          <div className="tt-head">{hover.b.fullLabel || hover.b.label}</div>
          {types.filter(t => (hover.b.byType[t] || 0) > 0 && !mutedTypes.has(t)).map(t => (
            <div key={t} className="tt-row" style={{ '--c': palette[t] } as React.CSSProperties}>
              <span className="sw" />
              <span className="nm">{(labels && labels[t]) || ACTIVITY_LABELS[t] || t}</span>
              <span className="v">{fmtVal ? fmtVal(hover.b.byType[t]) : fmt(hover.b.byType[t])}</span>
            </div>
          ))}
          <div className="tt-row total">
            <span className="nm">Total</span>
            <span className="v">{fmtVal
              ? fmtVal(types.reduce((s, t) => s + (!mutedTypes.has(t) ? (hover.b.byType[t] || 0) : 0), 0))
              : fmt(types.reduce((s, t) => s + (!mutedTypes.has(t) ? (hover.b.byType[t] || 0) : 0), 0))
            }</span>
          </div>
          {showRollingAvg && (
            <div className="tt-row">
              <span className="sw" style={{ background: 'var(--text-muted)' }} />
              <span className="nm">8-wk avg</span>
              <span className="v">{fmt(hover.b.rolling)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
