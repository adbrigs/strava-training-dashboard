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

const ZONE_KEYS = ['z1', 'z2', 'z3', 'z4', 'z5'];
const ZONE_COLORS: Record<string, string> = {
  z1: 'var(--z1)', z2: 'var(--z2)', z3: 'var(--z3)', z4: 'var(--z4)', z5: 'var(--z5)',
};
const ZONE_LABELS: Record<string, string> = {
  z1: 'Z1 Recovery', z2: 'Z2 Aerobic', z3: 'Z3 Tempo', z4: 'Z4 Threshold', z5: 'Z5 VO₂max',
};

function fmtMin(min: number): string {
  if (min >= 60) return `${(min / 60).toFixed(1)}h`;
  return `${Math.round(min)}m`;
}

interface Props {
  filtered: Activity[];
  from: Date;
  to: Date;
  period: 'daily' | 'weekly' | 'monthly';
  onPeriod: (p: 'daily' | 'weekly' | 'monthly') => void;
  selectedTypes: Set<string>;
  selectedBucketStart?: Date | null;
  onBucketClick?: (start: Date, end: Date, label: string) => void;
}

export default function VolumeSection({ filtered, from, to, period, onPeriod, selectedTypes, selectedBucketStart, onBucketClick }: Props) {
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [chartStyle, setChartStyle] = useState<'bar' | 'area' | 'line'>('bar');
  const [metric, setMetric] = useState<'trimp' | 'count' | 'zones'>('trimp');

  const isZones = metric === 'zones';

  const buckets: Bucket[] = useMemo(() => {
    const isDaily   = period === 'daily';
    const isWeekly  = period === 'weekly';
    const start = isWeekly ? weekStart(from)
                : isDaily  ? (() => { const d = new Date(from); d.setHours(0,0,0,0); return d; })()
                : new Date(from.getFullYear(), from.getMonth(), 1);
    const bs: Bucket[] = [];
    function advance(d: Date) {
      if (isDaily)  d.setDate(d.getDate() + 1);
      else if (isWeekly)  d.setDate(d.getDate() + 7);
      else          d.setMonth(d.getMonth() + 1);
    }
    for (let d = new Date(start); d <= to; advance(d)) {
      const periodEnd = new Date(d);
      if (isDaily) {
        periodEnd.setHours(23, 59, 59, 999);
      } else if (isWeekly) {
        periodEnd.setDate(periodEnd.getDate() + 6);
        periodEnd.setHours(23, 59, 59, 999);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }
      bs.push({
        start: new Date(d), end: periodEnd,
        label: isDaily
          ? fmtDate(d, { month: 'short', day: 'numeric' })
          : isWeekly
            ? fmtDate(d, { month: 'short', day: 'numeric' })
            : d.toLocaleDateString(undefined, { month: 'short' }),
        fullLabel: isDaily
          ? fmtDate(d, { month: 'long', day: 'numeric', year: 'numeric' })
          : isWeekly
            ? `Week of ${fmtDate(d, { month: 'short', day: 'numeric' })}`
            : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        byType: {}, total: 0, rolling: 0,
      });
    }
    filtered.forEach(a => {
      const b = bs.find(b => a.date >= b.start && a.date <= b.end);
      if (!b) return;
      if (isZones) {
        const hasZoneTimes = a.zoneTimes && a.zoneTimes.length >= 5 && a.zoneTimes.some((minutes) => minutes > 0);
        if (hasZoneTimes) {
          // Use detailed zone times if available
          for (let z = 1; z <= 5; z++) {
            const key = `z${z}`;
            b.byType[key] = (b.byType[key] || 0) + (a.zoneTimes[z - 1] || 0);
          }
        } else {
          // Fallback to average zone when detailed zone times are missing or all zero
          const key = `z${a.zone}`;
          b.byType[key] = (b.byType[key] || 0) + a.duration;
        }
        b.total += a.duration;
      } else {
        const val = metric === 'trimp' ? a.trimp : 1;
        b.byType[a.type] = (b.byType[a.type] || 0) + val;
        b.total += val;
      }
    });
    if (!isZones) {
      const win = 8;
      for (let i = 0; i < bs.length; i++) {
        const slice = bs.slice(Math.max(0, i - win + 1), i + 1);
        bs[i].rolling = slice.reduce((s, b) => s + b.total, 0) / slice.length;
      }
    }
    return bs;
  }, [filtered, period, metric, isZones, from, to]);

  const usedTypes = useMemo(() => {
    if (isZones) return ZONE_KEYS.filter(k => buckets.some(b => (b.byType[k] || 0) > 0));
    const set = new Set<string>();
    filtered.forEach(a => set.add(a.type));
    return Array.from(selectedTypes).filter(t => set.has(t));
  }, [filtered, selectedTypes, isZones, buckets]);

  const palette = useMemo(() => {
    if (isZones) return { ...ZONE_COLORS };
    const out: Record<string, string> = {};
    usedTypes.forEach(t => out[t] = ACTIVITY_COLORS[t] || '#94a3b8');
    return out;
  }, [usedTypes, isZones]);

  const toggle = (t: string) => setMuted(m => { const n = new Set(m); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const selectedBucketIdx = useMemo(() => {
    if (!selectedBucketStart) return null;
    const idx = buckets.findIndex(b => b.start.getTime() === selectedBucketStart.getTime());
    return idx === -1 ? null : idx;
  }, [buckets, selectedBucketStart]);

  function handleBarClick(i: number) {
    const b = buckets[i];
    if (b) onBucketClick?.(b.start, b.end, b.fullLabel || b.label);
  }

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">
          Training Volume & Intensity
          <span className="info" title="TRIMP = Training Impulse. duration × heart-rate intensity × workout-type scaling.">i</span>
        </div>
        <Seg
          value={metric}
          onChange={v => setMetric(v as 'trimp' | 'count' | 'zones')}
          options={[
            { value: 'trimp', label: 'TRIMP' },
            { value: 'count', label: 'Workouts' },
            { value: 'zones', label: 'Zones' },
          ]}
        />
      </div>
      <VolumeChart
        buckets={buckets}
        types={usedTypes}
        palette={palette}
        chartStyle={isZones ? 'bar' : chartStyle}
        onChartStyle={isZones ? undefined : setChartStyle}
        mutedTypes={isZones ? new Set() : muted}
        showRollingAvg={metric === 'trimp'}
        fmtVal={isZones ? fmtMin : undefined}
        labels={isZones ? ZONE_LABELS : undefined}
        selectedBucketIdx={selectedBucketIdx}
        onBarClick={onBucketClick ? handleBarClick : undefined}
      />
      <div className="legend">
        {isZones ? (
          usedTypes.map(k => (
            <span key={k} className="legend-item" style={{ '--c': ZONE_COLORS[k] } as React.CSSProperties}>
              <span className="sw" />
              {ZONE_LABELS[k]}
            </span>
          ))
        ) : (
          <>
            {usedTypes.map(t => (
              <span
                key={t}
                className={`legend-item ${muted.has(t) ? 'muted' : ''}`}
                style={{ '--c': palette[t] } as React.CSSProperties}
                onClick={() => toggle(t)}
              >
                <span className="sw" />
                {ACTIVITY_LABELS[t] || t}
              </span>
            ))}
            {metric === 'trimp' && (
              <span className="legend-item" style={{ '--c': 'var(--text)' } as React.CSSProperties}>
                <span className="sw line" style={{ background: 'var(--text)', opacity: 0.7 }} />
                8-{period === 'daily' ? 'day' : period === 'weekly' ? 'wk' : 'mo'} rolling avg
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
