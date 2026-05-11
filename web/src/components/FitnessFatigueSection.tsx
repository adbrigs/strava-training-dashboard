'use client';
import { useMemo } from 'react';
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

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">
          Fitness · Fatigue · Form
          <span className="info" title="CTL = 42-day rolling load (fitness). ATL = 7-day load (fatigue). TSB = CTL − ATL (form). Positive TSB = fresh.">i</span>
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
