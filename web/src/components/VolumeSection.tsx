'use client';
import { useState, useMemo } from 'react';
import type { Activity } from '@/lib/types';
import { ACTIVITY_COLORS, ACTIVITY_LABELS, fmtDate } from '@/lib/dataUtils';
import Seg from './ui/Seg';
import VolumeChart from './charts/VolumeChart';
import type { Bucket } from './charts/VolumeChart';

function weekStart(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x;
}

interface Props {
  filtered: Activity[];
  from: Date;
  to: Date;
  period: 'weekly' | 'monthly';
  onPeriod: (p: 'weekly' | 'monthly') => void;
  metric: 'trimp' | 'count';
  onMetric: (m: 'trimp' | 'count') => void;
  chartStyle: 'bar' | 'area' | 'line';
  selectedTypes: Set<string>;
}

export default function VolumeSection({ filtered, from, to, period, onPeriod, metric, onMetric, chartStyle, selectedTypes }: Props) {
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [stacked, setStacked] = useState(false);

  const buckets: Bucket[] = useMemo(() => {
    const isWeekly = period === 'weekly';
    const start = isWeekly ? weekStart(from) : new Date(from.getFullYear(), from.getMonth(), 1);
    const bs: Bucket[] = [];
    for (let d = new Date(start); d <= to; isWeekly ? d.setDate(d.getDate() + 7) : d.setMonth(d.getMonth() + 1)) {
      const periodEnd = new Date(d);
      if (isWeekly) periodEnd.setDate(periodEnd.getDate() + 6);
      else periodEnd.setMonth(periodEnd.getMonth() + 1);
      bs.push({
        start: new Date(d), end: periodEnd,
        label: isWeekly ? fmtDate(d, { month: 'short', day: 'numeric' }) : d.toLocaleDateString(undefined, { month: 'short' }),
        fullLabel: isWeekly ? `Week of ${fmtDate(d, { month: 'short', day: 'numeric' })}` : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        byType: {}, total: 0, rolling: 0,
      });
    }
    filtered.forEach(a => {
      const b = bs.find(b => a.date >= b.start && a.date <= b.end);
      if (!b) return;
      const val = metric === 'trimp' ? a.trimp : 1;
      b.byType[a.type] = (b.byType[a.type] || 0) + val;
      b.total += val;
    });
    const win = 8;
    for (let i = 0; i < bs.length; i++) {
      const slice = bs.slice(Math.max(0, i - win + 1), i + 1);
      bs[i].rolling = slice.reduce((s, b) => s + b.total, 0) / slice.length;
    }
    return bs;
  }, [filtered, period, metric, from, to]);

  const usedTypes = useMemo(() => {
    const set = new Set<string>();
    filtered.forEach(a => set.add(a.type));
    return Array.from(selectedTypes).filter(t => set.has(t));
  }, [filtered, selectedTypes]);

  const palette = useMemo(() => {
    const out: Record<string, string> = {};
    usedTypes.forEach(t => out[t] = ACTIVITY_COLORS[t] || '#94a3b8');
    return out;
  }, [usedTypes]);

  const toggle = (t: string) => setMuted(m => { const n = new Set(m); n.has(t) ? n.delete(t) : n.add(t); return n; });

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">
          Training Volume & Intensity
          <span className="info" title="TRIMP = Training Impulse. duration × heart-rate intensity × workout-type scaling.">i</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Seg
            value={metric}
            onChange={v => { onMetric(v as 'trimp' | 'count'); setStacked(false); }}
            options={[{ value: 'trimp', label: 'TRIMP' }, { value: 'count', label: 'Workouts' }]}
          />
          <button
            onClick={() => setStacked(s => !s)}
            style={{
              fontSize: 11.5, fontWeight: 500,
              padding: '4px 10px', borderRadius: 'var(--radius-pill)',
              background: stacked ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: stacked ? 'var(--accent)' : 'var(--text-muted)',
              border: stacked ? '1px solid var(--accent)' : '1px solid var(--border)',
              lineHeight: 1.4,
            }}
          >
            Stack
          </button>
        </div>
      </div>
      <VolumeChart
        buckets={buckets}
        types={usedTypes}
        palette={palette}
        chartStyle={stacked ? 'bar' : chartStyle}
        mutedTypes={muted}
        showRollingAvg={!stacked && metric === 'trimp'}
        forceStack={stacked}
      />
      <div className="legend">
        {usedTypes.map(t => (
          <span
            key={t}
            className={`legend-item ${muted.has(t) ? 'muted' : ''}`}
            style={{ '--c': palette[t] } as React.CSSProperties}
            onClick={() => !stacked && toggle(t)}
          >
            <span className="sw" />
            {ACTIVITY_LABELS[t] || t}
          </span>
        ))}
        {!stacked && metric === 'trimp' && (
          <span className="legend-item" style={{ '--c': 'var(--text)' } as React.CSSProperties}>
            <span className="sw line" style={{ background: 'var(--text)', opacity: 0.7 }} />
            8-{period === 'weekly' ? 'wk' : 'mo'} rolling avg
          </span>
        )}
      </div>
    </div>
  );
}
