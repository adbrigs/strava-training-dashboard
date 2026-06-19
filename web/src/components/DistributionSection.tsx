'use client';
import { useState, useMemo } from 'react';
import type { Activity } from '@/lib/types';
import { ACTIVITY_COLORS, ACTIVITY_LABELS, fmtNum } from '@/lib/dataUtils';
import Seg from './ui/Seg';
import Donut from './charts/Donut';

interface Props {
  filtered: Activity[];
}

export default function DistributionSection({ filtered }: Props) {
  const [mode, setMode] = useState<'trimp' | 'count' | 'duration' | 'zones'>('trimp');

  const ZONE_COLORS = ['var(--z1)', 'var(--z2)', 'var(--z3)', 'var(--z4)', 'var(--z5)'];
  const ZONE_NAMES  = ['Z1 Recovery', 'Z2 Aerobic', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO₂max'];

  const slices = useMemo(() => {
    if (mode === 'zones') {
      const sums = [0, 0, 0, 0, 0];
      filtered.forEach(a => {
        if (a.zoneTimes?.length >= 5 && a.zoneTimes.some(t => t > 0)) {
          a.zoneTimes.forEach((t, i) => { if (i < 5) sums[i] += t; });
        } else if (a.zone >= 1 && a.zone <= 5) {
          sums[a.zone - 1] += a.duration;
        }
      });
      return sums
        .map((v, i) => ({ name: ZONE_NAMES[i], value: v, color: ZONE_COLORS[i], type: `z${i + 1}` }))
        .filter(s => s.value > 0);
    }
    const sums: Record<string, number> = {};
    filtered.forEach(a => {
      const v = mode === 'trimp' ? a.trimp : mode === 'count' ? 1 : a.duration;
      sums[a.type] = (sums[a.type] || 0) + v;
    });
    return Object.entries(sums)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([t, v]) => ({
        name: ACTIVITY_LABELS[t] || t,
        value: v,
        color: ACTIVITY_COLORS[t] || '#94a3b8',
        type: t,
      }));
  }, [filtered, mode]);

  const total = slices.reduce((s, x) => s + x.value, 0);
  const centerValue = mode === 'duration' || mode === 'zones'
    ? `${Math.round(total / 60)}h`
    : fmtNum(total, 0);
  const centerLabel = mode === 'trimp' ? 'Total TRIMP' : mode === 'count' ? 'Workouts' : 'Time';

  return (
    <div className="card card-fill fade-in">
      <div className="card-head">
        <div className="card-title">Activity Mix</div>
        <Seg
          value={mode}
          onChange={v => setMode(v as 'trimp' | 'count' | 'duration' | 'zones')}
          options={[{ value: 'trimp', label: 'TRIMP' }, { value: 'count', label: '#' }, { value: 'duration', label: 'Time' }, { value: 'zones', label: 'Zones' }]}
        />
      </div>
      <div className="donut-wrap">
        <Donut
          slices={slices}
          size={220}
          thickness={34}
          centerLabel={centerLabel}
          centerValue={centerValue}
        />
        <div className="donut-legend">
          {slices.map(s => (
            <div key={s.type} className="donut-leg-row" style={{ '--c': s.color } as React.CSSProperties}>
              <span className="sw" />
              <span className="nm">{s.name}</span>
              <span className="pct">{((s.value / total) * 100).toFixed(1)}%</span>
              <span className="ct">{mode === 'duration' || mode === 'zones' ? `${Math.round(s.value)}m` : fmtNum(s.value, 0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
