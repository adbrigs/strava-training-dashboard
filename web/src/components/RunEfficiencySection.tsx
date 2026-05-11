'use client';
import { useMemo, useState, useRef, useEffect } from 'react';
import type { Activity } from '@/lib/types';
import { fmtPace, fmtDate } from '@/lib/dataUtils';

interface Props {
  filtered: Activity[];
}

const ZONE_COLORS = ['#4f8cff', '#3ec9a8', '#f5b942', '#ff7a3d', '#ff4d6d'];

function linReg(pts: [number, number][]) {
  const n = pts.length;
  if (n < 2) return { m: 0, b: 0 };
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const num = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const den = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const slope = den === 0 ? 0 : num / den;
  return { m: slope, b: my - slope * mx };
}

interface HoverInfo { run: Activity; x: number; y: number; }

export default function RunEfficiencySection({ filtered }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(500);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const runs = useMemo(() =>
    filtered
      .filter(a => a.type === 'Run' && a.avgHr > 0 && a.distance >= 0.5)
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [filtered]
  );

  const { minHr, maxHr, reg, monthLabels } = useMemo(() => {
    if (runs.length < 2) return { minHr: 100, maxHr: 200, reg: { m: 0, b: 0 }, monthLabels: [] };
    const hrs = runs.map(r => r.avgHr);
    const minHr = Math.max(50, Math.min(...hrs) - 10);
    const maxHr = Math.min(220, Math.max(...hrs) + 10);
    const pts: [number, number][] = runs.map((r, i) => [i, r.avgHr]);
    const reg = linReg(pts);

    // Month label positions
    const labels: { i: number; label: string }[] = [];
    let lastMonth = -1;
    runs.forEach((r, i) => {
      const m = r.date.getMonth();
      if (m !== lastMonth) {
        labels.push({ i, label: r.date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) });
        lastMonth = m;
      }
    });
    return { minHr, maxHr, reg, monthLabels: labels };
  }, [runs]);

  const padL = 36, padR = 16, padT = 16, padB = 36;
  const H = 240;
  const innerW = Math.max(0, w - padL - padR);
  const innerH = H - padT - padB;
  const n = runs.length;

  const xPos = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yScale = (hr: number) => padT + innerH - ((hr - minHr) / Math.max(1, maxHr - minHr)) * innerH;

  // HR y-ticks
  const hrRange = maxHr - minHr;
  const hrStep = hrRange > 60 ? 20 : hrRange > 30 ? 10 : 5;
  const yTicks: number[] = [];
  for (let v = Math.ceil(minHr / hrStep) * hrStep; v <= maxHr; v += hrStep) yTicks.push(v);

  // Trend line endpoints
  const trendX0 = xPos(0), trendX1 = xPos(n - 1);
  const trendY0 = yScale(reg.b);
  const trendY1 = yScale(reg.m * (n - 1) + reg.b);

  if (runs.length < 3) {
    return (
      <div className="card fade-in">
        <div className="card-head">
          <div className="card-title">Run Efficiency</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-subtle)', fontSize: 13 }}>
          Not enough run data with heart rate
        </div>
      </div>
    );
  }

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">
          Run Heart Rate Trend
          <span className="info" title="Avg HR per run over time. Colored by zone. Dot size = distance. Dashed line = trend. Declining HR = aerobic improvement.">i</span>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-subtle)' }}>
          {[1, 2, 3, 4, 5].map(z => (
            <span key={z} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: ZONE_COLORS[z - 1], display: 'inline-block' }} />
              Z{z}
            </span>
          ))}
        </div>
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
          {yTicks.map(t => (
            <g key={t}>
              <line className="ax-grid" x1={padL} x2={w - padR} y1={yScale(t)} y2={yScale(t)} />
              <text className="ax-tick" x={padL - 6} y={yScale(t) + 3} textAnchor="end">{t}</text>
            </g>
          ))}
          <line className="ax-line" x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} />

          {/* Trend line */}
          <line
            x1={trendX0} y1={trendY0} x2={trendX1} y2={trendY1}
            stroke="var(--text-muted)" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.6"
          />

          {/* Dots */}
          {runs.map((r, i) => {
            const cx = xPos(i);
            const cy = yScale(r.avgHr);
            const radius = Math.max(4, Math.min(11, r.distance * 1.4));
            const color = ZONE_COLORS[Math.min(4, Math.max(0, r.zone - 1))];
            return (
              <circle
                key={r.id}
                cx={cx} cy={cy} r={radius}
                fill={color} opacity="0.85"
                stroke={hover?.run.id === r.id ? 'var(--text)' : 'transparent'}
                strokeWidth="1.5"
                style={{ cursor: 'default' }}
                onMouseEnter={() => setHover({ run: r, x: cx, y: cy - radius - 4 })}
              />
            );
          })}

          {/* X axis: month labels */}
          {monthLabels.map(({ i, label }) => (
            <text key={i} className="ax-tick" x={xPos(i)} y={H - padB + 14} textAnchor="middle">{label}</text>
          ))}
        </svg>

        {hover && (
          <div className="tt" style={{ left: hover.x, top: hover.y, transform: 'translate(-50%, -100%)' }}>
            <h5>{hover.run.name}</h5>
            <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginBottom: 4 }}>
              {fmtDate(hover.run.date, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="tt-row">
              <span className="nm">Avg HR</span>
              <span className="v">{Math.round(hover.run.avgHr)} bpm</span>
            </div>
            <div className="tt-row">
              <span className="nm">Distance</span>
              <span className="v">{hover.run.distance.toFixed(1)} mi</span>
            </div>
            {hover.run.pace && (
              <div className="tt-row">
                <span className="nm">Pace</span>
                <span className="v">{fmtPace(hover.run.pace)}/mi</span>
              </div>
            )}
            <div className="tt-row">
              <span className="nm">Zone</span>
              <span className="v" style={{ color: ZONE_COLORS[Math.min(4, Math.max(0, hover.run.zone - 1))] }}>Z{hover.run.zone}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
