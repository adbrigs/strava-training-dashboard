'use client';
import { useMemo, useState } from 'react';
import type { Activity } from '@/lib/types';
import { dateKey, fmtNum } from '@/lib/dataUtils';
import FitnessChart from './charts/FitnessChart';
import type { FitnessSeries } from './charts/FitnessChart';

interface Props {
  filtered: Activity[];
  today: Date;
}

export default function FitnessFatigueSection({ filtered, today }: Props) {
  const series = useMemo<FitnessSeries[]>(() => {
    const start = new Date(today.getFullYear(), 0, 1);
    start.setHours(0, 0, 0, 0);
    const dailyMap: Record<string, number> = {};
    filtered.forEach(a => {
      const k = dateKey(a.date);
      dailyMap[k] = (dailyMap[k] || 0) + a.trimp;
    });
    let ctl = 30, atl = 30;
    const ctlA = 2 / (42 + 1);
    const atlA = 2 / (7 + 1);
    const days: FitnessSeries[] = [];
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const k = dateKey(d);
      const t = dailyMap[k] || 0;
      ctl = ctl + ctlA * (t - ctl);
      atl = atl + atlA * (t - atl);
      days.push({ date: new Date(d), ctl, atl, tsb: ctl - atl });
    }
    return days;
  }, [filtered, today]);

  const last = series[series.length - 1] || { ctl: 0, atl: 0, tsb: 0 };
  const tsb = last.tsb;

  let status = { label: 'Optimal', cls: '' };
  if (tsb > 25) status = { label: 'Detraining', cls: 'warn' };
  else if (tsb > 5) status = { label: 'Fresh', cls: '' };
  else if (tsb > -10) status = { label: 'Optimal', cls: '' };
  else if (tsb > -30) status = { label: 'Building', cls: 'warn' };
  else status = { label: 'Overreached', cls: 'bad' };

  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">
          Fitness · Fatigue · Form
          <span
            className="info"
            onMouseEnter={() => setInfoOpen(true)}
            onMouseLeave={() => setInfoOpen(false)}
            style={{ position: 'relative' }}
          >
            i
            {infoOpen && (
              <span className="tooltip" style={{
                top: 22, left: 0, width: 280,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 11 }}>CTL — Fitness</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
                    Chronic Training Load. 42-day exponential average of daily TRIMP. Rises slowly as you build a training base.
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ color: 'var(--hot)', fontWeight: 600, fontSize: 11 }}>ATL — Fatigue</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
                    Acute Training Load. 7-day exponential average of daily TRIMP. Spikes quickly after hard blocks and drops with rest.
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ color: 'var(--z2)', fontWeight: 600, fontSize: 11 }}>TSB — Form (CTL − ATL)</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
                    Training Stress Balance. Positive = fresh &amp; recovered. Negative = fatigued but building fitness.
                  </span>
                </span>
                <span style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {[
                    { range: 'TSB > +25', label: 'Detraining', color: 'var(--warn)' },
                    { range: '+5 to +25', label: 'Fresh', color: 'var(--text-muted)' },
                    { range: '−10 to +5', label: 'Optimal', color: 'var(--accent)' },
                    { range: '−30 to −10', label: 'Building', color: 'var(--warn)' },
                    { range: 'TSB < −30', label: 'Overreached', color: 'var(--hot)' },
                  ].map(({ range, label, color }) => (
                    <span key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>{range}</span>
                      <span style={{ color, fontWeight: 500 }}>{label}</span>
                    </span>
                  ))}
                </span>
              </span>
            )}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>year to date</span>
      </div>
      <div className="ff-stats">
        <div className="ff-stat"><span className="l">Fitness (CTL)</span><span className="v ctl">{fmtNum(last.ctl, 1)}</span></div>
        <div className="ff-stat"><span className="l">Fatigue (ATL)</span><span className="v atl">{fmtNum(last.atl, 1)}</span></div>
        <div className="ff-stat"><span className="l">Form (TSB)</span><span className={`v tsb ${status.cls}`}>{tsb > 0 ? '+' : ''}{fmtNum(tsb, 1)}</span></div>
      </div>
      <div style={{ marginTop: 14 }}>
        {series.length > 0 && <FitnessChart series={series} />}
      </div>
      <div className="form-readout">
        <span className="label">Today</span>
        <span className={`status ${status.cls}`}>{status.label}</span>
      </div>
    </div>
  );
}
