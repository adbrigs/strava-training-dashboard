'use client';
import { useMemo, useState, useRef, useEffect } from 'react';
import type { Activity } from '@/lib/types';

interface Props {
  filtered: Activity[];
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// getDay() → 0=Sun…6=Sat, we want Mon-first: [1,2,3,4,5,6,0]
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface HoverInfo { i: number; x: number; y: number; trimp: number; count: number; }

export default function WeekPatternSection({ filtered }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { buckets, maxTrimp } = useMemo(() => {
    const sums = new Array(7).fill(0);
    const counts = new Array(7).fill(0);
    filtered.forEach(a => {
      const dow = a.date.getDay(); // 0=Sun
      sums[dow] += a.trimp;
      counts[dow]++;
    });
    const buckets = DOW_ORDER.map((dow, i) => ({
      label: DOW[i],
      trimp: sums[dow],
      count: counts[dow],
      avg: counts[dow] > 0 ? sums[dow] / counts[dow] : 0,
    }));
    const maxTrimp = Math.max(...buckets.map(b => b.trimp), 1);
    return { buckets, maxTrimp };
  }, [filtered]);

  const padL = 8, padR = 8, padT = 16, padB = 32;
  const H = 200;
  const innerW = Math.max(0, w - padL - padR);
  const innerH = H - padT - padB;
  const n = 7;
  const barW = Math.min(40, (innerW / n) * 0.65);
  const xPos = (i: number) => padL + (innerW / n) * (i + 0.5);

  // Y ticks
  const maxY = maxTrimp * 1.15;
  const tickStep = Math.pow(10, Math.floor(Math.log10(maxY))) / 2;
  const yTicks: number[] = [];
  for (let v = 0; v <= maxY; v += tickStep) yTicks.push(v);
  const yScale = (v: number) => padT + innerH - (v / maxY) * innerH;

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">Training by Day of Week</div>
      </div>

      <div className="chart-wrap" ref={wrapRef}>
        <svg
          className="chart-svg"
          viewBox={`0 0 ${w} ${H}`}
          width={w}
          height={H}
          onMouseLeave={() => setHover(null)}
        >
          {/* Grid */}
          {yTicks.filter((_, i) => i % 2 === 0).map(t => (
            <g key={t}>
              <line className="ax-grid" x1={padL} x2={w - padR} y1={yScale(t)} y2={yScale(t)} />
              <text className="ax-tick" x={padL - 4} y={yScale(t) + 3} textAnchor="end" fontSize="9">
                {t >= 1000 ? `${(t / 1000).toFixed(0)}k` : Math.round(t)}
              </text>
            </g>
          ))}
          <line className="ax-line" x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} />

          {/* Bars */}
          {buckets.map((b, i) => {
            const opacity = 0.25 + 0.75 * (b.trimp / maxTrimp);
            const barH = (b.trimp / maxY) * innerH;
            const x = xPos(i) - barW / 2;
            const y = padT + innerH - barH;
            return (
              <g key={i}>
                <rect
                  x={x} y={y} width={barW} height={Math.max(0, barH)}
                  rx="3" fill="var(--accent)" opacity={opacity}
                />
                {b.count > 0 && (
                  <text
                    x={xPos(i)} y={y - 5}
                    textAnchor="middle"
                    fontSize="9"
                    fill="var(--text-muted)"
                  >{b.count}×</text>
                )}
              </g>
            );
          })}

          {/* X labels */}
          {buckets.map((b, i) => (
            <text key={i} className="ax-tick" x={xPos(i)} y={H - padB + 14} textAnchor="middle">
              {b.label}
            </text>
          ))}

          {/* Hover regions */}
          {buckets.map((b, i) => (
            <rect
              key={'h' + i}
              className="hover-bar"
              x={padL + (innerW / n) * i}
              y={padT}
              width={innerW / n}
              height={innerH}
              onMouseEnter={() => setHover({ i, x: xPos(i), y: padT + 4, trimp: b.trimp, count: b.count })}
            />
          ))}
        </svg>

        {hover && hover.count > 0 && (
          <div className="tt" style={{ left: hover.x, top: hover.y, transform: 'translate(-50%, 0)' }}>
            <h5>{buckets[hover.i].label}</h5>
            <div className="tt-row">
              <span className="nm">Total TRIMP</span>
              <span className="v">{Math.round(hover.trimp)}</span>
            </div>
            <div className="tt-row">
              <span className="nm">Avg TRIMP</span>
              <span className="v">{Math.round(buckets[hover.i].avg)}</span>
            </div>
            <div className="tt-row">
              <span className="nm">Workouts</span>
              <span className="v">{hover.count}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
