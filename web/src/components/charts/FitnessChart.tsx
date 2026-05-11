'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { fmtNum, fmtDate } from '@/lib/dataUtils';

export interface FitnessSeries {
  date: Date;
  ctl: number;
  atl: number;
  tsb: number;
}

interface Props {
  series: FitnessSeries[];
  height?: number;
}

export default function FitnessChart({ series, height = 220 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hi, setHi] = useState(series.length - 1);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const padL = 40, padR = 14, padT = 14, padB = 28;
  const H = height;
  const innerW = Math.max(0, w - padL - padR);
  const innerH = H - padT - padB;
  const n = series.length;

  const all = useMemo(() => {
    const max = Math.max(...series.map(s => Math.max(s.ctl, s.atl))) * 1.1 || 100;
    const minT = Math.min(...series.map(s => s.tsb));
    const maxT = Math.max(...series.map(s => s.tsb));
    return Math.max(max, Math.abs(minT), Math.abs(maxT));
  }, [series]);

  const xPos = (i: number) => padL + (innerW / Math.max(1, n - 1)) * i;
  const yPos = (v: number) => padT + innerH / 2 - (v / all) * (innerH / 2 - 4);

  const path = (key: keyof FitnessSeries) =>
    series.map((s, i) => (i ? 'L' : 'M') + xPos(i).toFixed(1) + ' ' + yPos(s[key] as number).toFixed(1)).join(' ');

  const areaTsb = (() => {
    const top = series.map((s, i) => xPos(i).toFixed(1) + ' ' + yPos(s.tsb).toFixed(1));
    const bot = series.map((_, i) => xPos(i).toFixed(1) + ' ' + yPos(0).toFixed(1)).reverse();
    return `M${top.join(' L')} L${bot.join(' L')} Z`;
  })();

  const ticks = useMemo(() => {
    const out: number[] = [];
    let lastM = -1;
    series.forEach((s, i) => {
      if (s.date.getMonth() !== lastM) { out.push(i); lastM = s.date.getMonth(); }
    });
    return out;
  }, [series]);

  const tx = padL + (hi / Math.max(1, n - 1)) * innerW;
  const ratio = innerW ? (tx - padL) / innerW : 0;
  const anchor = ratio < 0.15 ? '0%' : ratio > 0.85 ? '-100%' : '-50%';

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
      >
        <line className="ax-line" x1={padL} x2={w - padR} y1={yPos(0)} y2={yPos(0)} />
        {[-all * 0.6, 0, all * 0.6].map((v, i) => (
          <text key={i} className="ax-tick" x={padL - 8} y={yPos(v) + 3} textAnchor="end">{Math.round(v)}</text>
        ))}
        <path d={areaTsb} fill="var(--z2)" opacity="0.13" />
        <path d={path('tsb')} fill="none" stroke="var(--z2)" strokeWidth="1.5" />
        <path d={path('ctl')} fill="none" stroke="var(--accent)" strokeWidth="2" />
        <path d={path('atl')} fill="none" stroke="var(--hot)" strokeWidth="1.6" strokeDasharray="4 4" />

        {hi != null && series[hi] && (
          <g>
            <line x1={xPos(hi)} x2={xPos(hi)} y1={padT} y2={padT + innerH} stroke="var(--border-strong)" strokeDasharray="2 3" />
            <circle cx={xPos(hi)} cy={yPos(series[hi].ctl)} r="3" fill="var(--accent)" />
            <circle cx={xPos(hi)} cy={yPos(series[hi].atl)} r="3" fill="var(--hot)" />
            <circle cx={xPos(hi)} cy={yPos(series[hi].tsb)} r="3" fill="var(--z2)" />
          </g>
        )}

        {ticks.map(i => (
          <text key={i} className="ax-tick" x={xPos(i)} y={H - padB + 16} textAnchor="middle">
            {series[i].date.toLocaleDateString(undefined, { month: 'short' })}
          </text>
        ))}
      </svg>

      {hi != null && series[hi] && (
        <div className="tt" style={{ left: tx, top: 8, transform: `translate(${anchor}, 0)` }}>
          <h5>{fmtDate(series[hi].date, { month: 'short', day: 'numeric' })}</h5>
          <div className="tt-row" style={{ '--c': 'var(--accent)' } as React.CSSProperties}>
            <span className="sw" /><span className="nm">Fitness (CTL)</span><span className="v">{fmtNum(series[hi].ctl, 1)}</span>
          </div>
          <div className="tt-row" style={{ '--c': 'var(--hot)' } as React.CSSProperties}>
            <span className="sw" /><span className="nm">Fatigue (ATL)</span><span className="v">{fmtNum(series[hi].atl, 1)}</span>
          </div>
          <div className="tt-row" style={{ '--c': 'var(--z2)' } as React.CSSProperties}>
            <span className="sw" /><span className="nm">Form (TSB)</span><span className="v">{fmtNum(series[hi].tsb, 1)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
