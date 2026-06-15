'use client';
import { useEffect, useState } from 'react';
import WhoopTrendChart, { type WhoopRecord, type WhoopMetric } from './charts/WhoopTrendChart';

const METRICS: { key: WhoopMetric; label: string }[] = [
  { key: 'recovery',         label: 'Recovery' },
  { key: 'hrv',             label: 'HRV' },
  { key: 'restingHr',       label: 'Resting HR' },
  { key: 'sleepPerformance', label: 'Sleep' },
  { key: 'strain',          label: 'Strain' },
  { key: 'weightKg',         label: 'Weight' },
];

interface Props {
  from: Date;
  to: Date;
}

interface WhoopBodyMeasurement {
  weightKg?: number | null;
  fetchedAt?: string | null;
}

export default function WhoopTrendSection({ from, to }: Props) {
  const [allRecords, setAllRecords] = useState<WhoopRecord[]>([]);
  const [metric, setMetric] = useState<WhoopMetric>('recovery');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/data/whoop_history.json').then(r => r.json() as Promise<WhoopRecord[]>),
      fetch('/data/whoop_body_measurement.json')
        .then(r => r.ok ? r.json() as Promise<WhoopBodyMeasurement> : null)
        .catch(() => null),
    ])
      .then(([history, bodyMeasurement]) => {
        if (bodyMeasurement?.weightKg == null) {
          setAllRecords(history);
          return;
        }

        const date = bodyMeasurement.fetchedAt
          ? new Date(bodyMeasurement.fetchedAt).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        const existing = history.find(r => r.date === date);

        setAllRecords(existing
          ? history.map(r => r.date === date ? { ...r, weightKg: bodyMeasurement.weightKg! } : r)
          : [...history, { date, weightKg: bodyMeasurement.weightKg }].sort((a, b) => a.date.localeCompare(b.date)));
      })
      .finally(() => setLoading(false))
      .catch(() => setLoading(false));
  }, []);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr   = to.toISOString().slice(0, 10);
  const records = allRecords.filter(r => r.date >= fromStr && r.date <= toStr);
  const hasData = records.length > 0;

  return (
    <div className="card fade-in">
      <div className="card-head">
        <div className="card-title">WHOOP Trends</div>
        <div className="seg">
          {METRICS.map(m => (
            <button key={m.key} className={metric === m.key ? 'on' : ''} onClick={() => setMetric(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>Loading…</span>
        </div>
      ) : !hasData ? (
        <div style={{ height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No WHOOP data for this range.</span>
          <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
            Run a backfill from <strong style={{ color: 'var(--text)' }}>Settings</strong> to load history.
          </span>
        </div>
      ) : (
        <>
          <WhoopTrendChart records={records} metric={metric} height={220} />
          <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
            <span>{records.length} days</span>
            <span>{records[0]?.date} → {records[records.length - 1]?.date}</span>
            <span style={{ color: 'var(--border-strong)' }}>·</span>
            <span>{allRecords.length} total</span>
          </div>
        </>
      )}
    </div>
  );
}
