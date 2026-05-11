'use client';
import { useMemo } from 'react';
import type { Activity } from '@/lib/types';
import { dateKey, fmtNum, computeStreaks } from '@/lib/dataUtils';
import Sparkline from './charts/Sparkline';

function weekStart(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x;
}

interface InfoDotProps { text: string; }
function InfoDot({ text }: InfoDotProps) {
  return (
    <span className="info" style={{ position: 'relative' }} title={text}>i</span>
  );
}

interface Props {
  filtered: Activity[];
  today: Date;
}

export default function SummaryRow({ filtered, today }: Props) {
  const bins = useMemo(() => {
    const from = new Date(today); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0);
    const map: Record<string, number> = {};
    for (let d = new Date(from); d <= today; d.setDate(d.getDate() + 1)) map[dateKey(d)] = 0;
    filtered.forEach(a => { const k = dateKey(a.date); if (k in map) map[k] += a.trimp; });
    return Object.values(map);
  }, [filtered, today]);

  const countBins = useMemo(() => {
    const from = new Date(today); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0);
    const arr = new Array(30).fill(0);
    filtered.forEach(a => {
      const idx = Math.floor((a.date.getTime() - from.getTime()) / 86400000);
      if (idx >= 0 && idx < 30) arr[idx]++;
    });
    return arr;
  }, [filtered, today]);

  const weeklyBins = useMemo(() => {
    const w0 = weekStart(today); w0.setDate(w0.getDate() - 11 * 7);
    const arr = new Array(12).fill(0);
    filtered.forEach(a => {
      const w = weekStart(a.date);
      const idx = Math.round((w.getTime() - w0.getTime()) / (86400000 * 7));
      if (idx >= 0 && idx < 12) arr[idx] += a.trimp;
    });
    return arr;
  }, [filtered, today]);

  const total = filtered.length;
  const sumTrimp = filtered.reduce((s, a) => s + a.trimp, 0);
  const avgTrimp = total ? sumTrimp / total : 0;

  const weekCount = useMemo(() => {
    if (!filtered.length) return 1;
    const dates = filtered.map(a => a.date.getTime());
    const span = Math.max(7, (Math.max(...dates) - Math.min(...dates)) / 86400000);
    return span / 7;
  }, [filtered]);

  const avgWeekly = sumTrimp / weekCount;
  const maxTrimp = filtered.reduce((m, a) => Math.max(m, a.trimp), 0);
  const longestDist = filtered.reduce((m, a) => Math.max(m, a.distance || 0), 0);
  const { current: currentStreak, max: maxStreak } = useMemo(() => computeStreaks(filtered, today), [filtered, today]);

  const metrics = [
    { label: 'Workouts',     value: fmtNum(total),              sub: 'in range',       spark: countBins,  color: 'var(--text)' },
    { label: 'Avg TRIMP',    value: fmtNum(avgTrimp, 1),        sub: 'per session',    spark: bins,       color: 'var(--accent)', info: 'Training Impulse — duration × HR-reserve × intensity. Higher = harder session.' },
    { label: 'Weekly TRIMP', value: fmtNum(avgWeekly, 0),       sub: 'rolling avg',    spark: weeklyBins, color: 'var(--accent)' },
    { label: 'Total TRIMP',  value: fmtNum(sumTrimp, 0),        sub: 'cumulative',     spark: weeklyBins, color: 'var(--z2)' },
    { label: 'Max TRIMP',    value: fmtNum(maxTrimp, 1),        sub: 'single session', spark: bins,       color: 'var(--hot)' },
    { label: 'Longest',      value: fmtNum(longestDist, 1),     sub: 'miles',          spark: bins,       color: 'var(--act-run)', unit: 'mi' },
    { label: 'Streak',       value: fmtNum(currentStreak),      sub: `max ${maxStreak}d`, color: 'var(--warn)', unit: 'd' },
  ];

  return (
    <div className="grid-layout row-metrics">
      {metrics.map((m, i) => (
        <div key={m.label} className="card fade-in" style={{ animationDelay: `${i * 30}ms` }}>
          <div className="metric">
            <div className="card-title">
              {m.label}
              {m.info && <InfoDot text={m.info} />}
            </div>
            <div className="metric-num">
              {m.value}
              {m.unit && <span className="unit">{m.unit}</span>}
            </div>
            <div className="metric-sub">{m.sub}</div>
            {m.spark && (
              <div className="metric-spark">
                <Sparkline values={m.spark} stroke={m.color} fill={m.color} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
