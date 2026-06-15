'use client';
import { useEffect, useState } from 'react';

interface WhoopData {
  connected: boolean;
  recovery?: {
    score: number;
    hrv: number;
    restingHr: number;
    date: string;
  } | null;
  sleep?: {
    durationMs: number;
    performance: number;
    efficiency: number;
    remMs: number;
    deepMs: number;
    date: string;
  } | null;
  strain?: {
    score: number;
    avgHr: number;
    date: string;
  } | null;
}

function recoveryColor(score: number) {
  if (score >= 67) return 'var(--z2)';
  if (score >= 34) return 'var(--warn)';
  return 'var(--hot)';
}

function strainColor(score: number) {
  if (score >= 18) return 'var(--hot)';
  if (score >= 14) return 'var(--z4)';
  if (score >= 10) return 'var(--warn)';
  return 'var(--z2)';
}

function strainLabel(score: number) {
  if (score >= 18) return 'All Out';
  if (score >= 14) return 'High';
  if (score >= 10) return 'Moderate';
  return 'Light';
}

function fmtMs(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Divider() {
  return <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', flexShrink: 0, margin: '2px 0' }} />;
}

function MetricBlock({
  label, value, unit, sub, color,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <div style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--text-subtle)', fontWeight: 500,
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 3,
        fontFamily: 'var(--font-mono)', fontWeight: 600,
        fontSize: 22, lineHeight: 1, letterSpacing: '-0.03em',
        color: color ?? 'var(--text)',
      }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, letterSpacing: 0 }}>{unit}</span>}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', letterSpacing: 0 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function WhoopSection() {
  const [data, setData] = useState<WhoopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [avgHrv, setAvgHrv] = useState<number | null>(null);
  const [avgRestingHr, setAvgRestingHr] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/whoop/data')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    fetch('/data/whoop_history.json')
      .then(r => r.json())
      .then((records: Array<{ date: string; hrv?: number; restingHr?: number }>) => {
        const recent = records.filter(r => r.date >= cutoffStr);
        const hrvVals = recent.filter(r => r.hrv != null).map(r => r.hrv!);
        const rhrVals = recent.filter(r => r.restingHr != null).map(r => r.restingHr!);
        if (hrvVals.length) setAvgHrv(Math.round(hrvVals.reduce((a, b) => a + b) / hrvVals.length));
        if (rhrVals.length) setAvgRestingHr(Math.round(rhrVals.reduce((a, b) => a + b) / rhrVals.length));
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="card fade-in" style={{ padding: '14px 22px' }}>
        <div style={{ height: 54, display: 'flex', alignItems: 'center', color: 'var(--text-subtle)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          Loading WHOOP…
        </div>
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="card fade-in" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <WhoopLogo size={20} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>WHOOP</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Not connected — open <strong style={{ color: 'var(--text)' }}>Settings</strong> to connect and load your recovery data.
          </div>
        </div>
      </div>
    );
  }

  const { recovery, sleep, strain } = data;
  const rc = recovery ? recoveryColor(recovery.score) : 'var(--text-subtle)';
  const sc = strain ? strainColor(strain.score) : 'var(--text-subtle)';

  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-head" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <WhoopLogo size={14} />
          WHOOP Readiness
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, minHeight: 0 }}>
        {/* Left col: Recovery + HRV + Resting HR */}
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20,
          paddingRight: 24, borderRight: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-subtle)', fontWeight: 500 }}>
              Recovery
            </div>
            <div style={{
              fontSize: 52, fontWeight: 700, fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.04em', lineHeight: 1, color: rc,
            }}>
              {recovery ? `${recovery.score}%` : '—'}
            </div>
            {recovery && (
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: rc, fontWeight: 600, opacity: 0.8 }}>
                {recovery.score >= 67 ? 'Green' : recovery.score >= 34 ? 'Yellow' : 'Red'}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <MetricBlock
              label="HRV"
              value={recovery?.hrv ?? '—'}
              unit=" ms"
              sub={avgHrv != null ? `${avgHrv}ms 30d avg` : undefined}
            />
            <MetricBlock
              label="Resting HR"
              value={recovery?.restingHr ?? '—'}
              unit=" bpm"
              sub={avgRestingHr != null ? `${avgRestingHr}bpm 30d avg` : undefined}
            />
          </div>
        </div>

        {/* Right col: Sleep + Strain */}
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20,
          paddingLeft: 24,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-subtle)', fontWeight: 500 }}>
              Sleep
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 26,
              lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--text)',
            }}>
              {sleep ? fmtMs(sleep.durationMs) : '—'}
            </div>
            {sleep && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                <span>{sleep.performance}% perf · {sleep.efficiency}% eff</span>
                <span>REM {fmtMs(sleep.remMs)} · Deep {fmtMs(sleep.deepMs)}</span>
              </div>
            )}
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-subtle)', fontWeight: 500 }}>
              Strain
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 26,
                lineHeight: 1, letterSpacing: '-0.03em', color: sc,
              }}>
                {strain?.score ?? '—'}
              </div>
              {strain && <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>/21</span>}
            </div>
            {strain && (
              <>
                <div style={{ fontSize: 11, color: sc, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.85 }}>
                  {strainLabel(strain.score)}
                </div>
                <div style={{ width: 90, height: 4, background: 'var(--surface-3)', borderRadius: 2, marginTop: 2 }}>
                  <div style={{
                    width: `${(strain.score / 21) * 100}%`,
                    height: '100%', borderRadius: 2,
                    background: sc, transition: 'width 600ms ease',
                  }} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WhoopLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" fill="var(--surface-3)" />
      <path
        d="M7 12l3 4 3-8 2 4 2-2"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
