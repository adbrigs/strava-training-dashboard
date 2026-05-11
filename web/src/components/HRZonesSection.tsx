'use client';
import { useMemo } from 'react';
import type { Activity } from '@/lib/types';

const ZONES = [
  { z: 1, name: 'Recovery',  range: '<60% HRmax',   color: 'var(--z1)' },
  { z: 2, name: 'Aerobic',   range: '60–70%',       color: 'var(--z2)' },
  { z: 3, name: 'Tempo',     range: '70–80%',       color: 'var(--z3)' },
  { z: 4, name: 'Threshold', range: '80–90%',       color: 'var(--z4)' },
  { z: 5, name: 'VO₂ max',   range: '>90%',         color: 'var(--z5)' },
];

interface Props {
  filtered: Activity[];
}

export default function HRZonesSection({ filtered }: Props) {
  const byZone = useMemo(() => {
    const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    filtered.forEach(a => { out[a.zone] = (out[a.zone] || 0) + a.duration; });
    return out;
  }, [filtered]);

  const totalMin = Object.values(byZone).reduce((s, v) => s + v, 0);

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">
          Time in HR Zones
          <span className="info" title="Time spent in each heart-rate zone, summed across all sessions in range.">i</span>
        </div>
      </div>
      <div className="zones">
        {ZONES.map(z => {
          const min = byZone[z.z] || 0;
          const pct = totalMin ? (min / totalMin) * 100 : 0;
          const hrs = min / 60;
          return (
            <div key={z.z} className="zone-row" style={{ '--zc': z.color } as React.CSSProperties}>
              <div className="zone-tag">Z{z.z}</div>
              <div className="zone-meta">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="name">{z.name}</span>
                  <span className="sub">{z.range}</span>
                </div>
                <div className="zone-bar"><div style={{ width: `${pct}%` }} /></div>
              </div>
              <div className="zone-time">
                {hrs >= 1 ? `${hrs.toFixed(1)}h` : `${Math.round(min)}m`}
                <small>{pct.toFixed(0)}%</small>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
