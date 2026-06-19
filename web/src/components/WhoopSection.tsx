'use client';
import { useEffect, useState } from 'react';

interface WhoopData {
  connected: boolean;
  recovery?: { score: number; hrv: number; restingHr: number; date: string; } | null;
  sleep?: { durationMs: number; performance: number; efficiency: number; remMs: number; deepMs: number; date: string; } | null;
  strain?: { score: number; avgHr: number; date: string; } | null;
  bodyMeasurement?: { weightKg: number | null; heightM: number | null; maxHeartRate: number | null; } | null;
}

function recoveryColor(v: number) {
  if (v >= 67) return 'var(--z2)';
  if (v >= 34) return 'var(--warn)';
  return 'var(--hot)';
}
function recoveryLabel(v: number) {
  if (v >= 67) return 'GREEN';
  if (v >= 34) return 'YELLOW';
  return 'RED';
}
function strainColor(v: number) {
  if (v >= 18) return 'var(--hot)';
  if (v >= 14) return 'var(--z4)';
  if (v >= 10) return 'var(--warn)';
  if (v >= 2)  return 'var(--z2)';
  return 'var(--z1)';
}
function strainLabel(v: number) {
  if (v < 2)  return 'REST';
  if (v < 10) return 'LIGHT';
  if (v < 14) return 'MODERATE';
  if (v < 18) return 'HIGH';
  return 'ALL OUT';
}
function fmtMs(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function RecoveryRing({ score, color }: { score: number; color: string }) {
  const cx = 38, cy = 38, r = 28, sw = 5.5;
  const start = 145, sweep = 250;
  function polar(deg: number) {
    const a = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
  function arc(a: number, b: number) {
    const s = polar(a), e = polar(b);
    return `M${s.x.toFixed(1)} ${s.y.toFixed(1)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
  }
  const fill = Math.max(0, (score / 100) * sweep);
  const S = cx * 2;
  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ flexShrink: 0 }}>
      <path d={arc(start, start + sweep)} fill="none" stroke="var(--surface-3)" strokeWidth={sw} strokeLinecap="round" />
      {fill > 3 && (
        <path d={arc(start, start + fill)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      )}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize="19" fontWeight="700" fontFamily="var(--font-mono)" fill={color} letterSpacing="-1">
        {score}
      </text>
      <text x={cx} y={cx + 13} textAnchor="middle"
        fontSize="7.5" fontFamily="var(--font-mono)" fill="var(--text-subtle)" letterSpacing="1">
        REC
      </text>
    </svg>
  );
}

function SleepBar({ deepMs, remMs, lightMs }: { deepMs: number; remMs: number; lightMs: number }) {
  const total = deepMs + remMs + Math.max(0, lightMs);
  if (total <= 0) return null;
  return (
    <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1.5 }}>
      <div style={{ flex: deepMs, background: 'var(--z1)', minWidth: 0 }} />
      <div style={{ flex: remMs, background: 'var(--z2)', minWidth: 0 }} />
      <div style={{ flex: Math.max(0, lightMs), background: 'var(--accent)', minWidth: 0 }} />
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', padding: '2px 8px', borderRadius: 4,
      background: `color-mix(in srgb, ${color} 18%, transparent)`,
      color, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.08em', fontFamily: 'var(--font-mono)',
      lineHeight: '16px',
    }}>
      {label}
    </span>
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
      <div className="card whoop-readiness-card fade-in">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          Loading WHOOP…
        </div>
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="card whoop-readiness-card fade-in">
        <div className="card-head">
          <div className="card-title"><WhoopLogo size={13} /> WHOOP READINESS</div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
          Not connected — open <strong style={{ color: 'var(--text)', margin: '0 3px' }}>Settings</strong> to connect.
        </div>
      </div>
    );
  }

  const { recovery, sleep, strain, bodyMeasurement } = data;
  const weightLbs = bodyMeasurement?.weightKg != null
    ? parseFloat((bodyMeasurement.weightKg * 2.20462).toFixed(1))
    : null;
  const rc = recovery ? recoveryColor(recovery.score) : 'var(--text-subtle)';
  const lightMs = sleep ? Math.max(0, sleep.durationMs - sleep.remMs - sleep.deepMs) : 0;
  const hrvDelta = recovery && avgHrv != null ? recovery.hrv - avgHrv : null;
  const rhrDelta = recovery && avgRestingHr != null ? recovery.restingHr - avgRestingHr : null;

  const stageRows = sleep ? [
    { label: 'Deep',  ms: sleep.deepMs, color: 'var(--z1)' },
    { label: 'REM',   ms: sleep.remMs,  color: 'var(--z2)' },
    { label: 'Light', ms: lightMs,      color: 'var(--accent)' },
  ].filter(s => s.ms > 0) : [];

  return (
    <div className="card whoop-readiness-card fade-in">
      <div className="card-head" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ gap: 7 }}>
          <WhoopLogo size={13} />
          WHOOP READINESS
        </div>
        {recovery && (
          <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
            {new Date(recovery.date.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      <div className="whoop-readiness-grid">
        {/* ── Left col: Recovery · HRV · Resting HR ── */}
        <div className="whoop-readiness-col whoop-readiness-primary">

          {/* Recovery ring */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {recovery
              ? <RecoveryRing score={recovery.score} color={rc} />
              : <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--surface-3)' }} />
            }
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-subtle)', fontWeight: 600 }}>
                RECOVERY
              </div>
              {recovery && <Badge label={recoveryLabel(recovery.score)} color={rc} />}
            </div>
          </div>

          {/* HRV */}
          <div className="whoop-metric">
            <div className="whoop-metric-label">HRV</div>
            <div className="whoop-metric-value">
              {recovery?.hrv ?? '—'}
              <span className="whoop-metric-unit">ms</span>
            </div>
            {hrvDelta != null && avgHrv != null && (
              <div className="whoop-metric-delta" style={{ color: hrvDelta >= 0 ? 'var(--z2)' : 'var(--hot)' }}>
                {hrvDelta >= 0 ? '+' : ''}{hrvDelta} vs {avgHrv}ms 30d
              </div>
            )}
          </div>

          {/* Resting HR */}
          <div className="whoop-metric">
            <div className="whoop-metric-label">RESTING HR</div>
            <div className="whoop-metric-value">
              {recovery?.restingHr ?? '—'}
              <span className="whoop-metric-unit">bpm</span>
            </div>
            {rhrDelta != null && avgRestingHr != null && (
              <div className="whoop-metric-delta" style={{ color: rhrDelta <= 0 ? 'var(--z2)' : 'var(--hot)' }}>
                {rhrDelta >= 0 ? '+' : ''}{rhrDelta} vs {avgRestingHr}bpm 30d
              </div>
            )}
          </div>

        </div>

        {/* ── Right col: Sleep · Strain ── */}
        <div className="whoop-readiness-col whoop-readiness-secondary">

          {/* Sleep */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div className="whoop-metric-label">SLEEP</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--text)' }}>
              {sleep ? fmtMs(sleep.durationMs) : '—'}
            </div>
            {sleep && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {sleep.performance}% perf · {sleep.efficiency}% eff
              </div>
            )}
            {sleep && stageRows.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 2 }}>
                <SleepBar deepMs={sleep.deepMs} remMs={sleep.remMs} lightMs={lightMs} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {stageRows.map(({ label, ms, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                      </div>
                      <span style={{ color: 'var(--text-muted)' }}>{fmtMs(ms)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Day Strain + Weight — pinned to bottom */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 10, borderTop: '1px solid var(--border)', marginTop: 'auto', gap: 12,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className="whoop-metric-label">DAY STRAIN</div>
              {strain ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.03em', color: strainColor(strain.score) }}>
                    {strain.score}
                    <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 400 }}>/21</span>
                  </span>
                  <Badge label={strainLabel(strain.score)} color={strainColor(strain.score)} />
                </div>
              ) : (
                <span style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>—</span>
              )}
            </div>
            {weightLbs != null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                <div className="whoop-metric-label">WEIGHT</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.03em', color: 'var(--text)' }}>
                  {weightLbs}
                  <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 400 }}> lbs</span>
                </span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

function WhoopLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="var(--surface-3)" />
      <path d="M7 12l3 4 3-8 2 4 2-2" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
