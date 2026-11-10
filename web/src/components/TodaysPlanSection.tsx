'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Activity } from '@/lib/types';
import { dateKey } from '@/lib/dataUtils';
import { planForDay, weekOverview, type Readiness, type ReadinessTier } from '@/lib/trainingPlan';

interface Props {
  activities: Activity[];
  today: Date;
  refreshKey?: number;
}

interface WhoopRecord { date: string; recovery?: number; hrv?: number; restingHr?: number; sleepMs?: number; weightLbs?: number; }

const TIER_LABEL: Record<ReadinessTier, string> = {
  green: 'Green · go', yellow: 'Yellow · controlled', red: 'Red · recover', unknown: 'No score yet',
};
const TIER_COLOR: Record<ReadinessTier, string> = {
  green: 'var(--z2)', yellow: 'var(--z3)', red: 'var(--z5)', unknown: 'var(--accent)',
};

const GOAL_WEIGHT: [number, number] = [150, 155];
const SLEEP_TARGET = 7.5;

export default function TodaysPlanSection({ activities, today, refreshKey = 0 }: Props) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [history, setHistory] = useState<WhoopRecord[]>([]);
  const [tomorrowPick, setTomorrowPick] = useState<boolean | null>(null);

  useEffect(() => {
    const todayKey = dateKey(new Date());
    Promise.all([
      fetch('/api/whoop/data').then(r => r.json()).catch(() => null),
      fetch(`/data/whoop_history.json?v=${refreshKey}`).then(r => r.json()).catch(() => []),
    ]).then(([live, hist]: [{ connected?: boolean; recovery?: { score: number; hrv: number; restingHr: number; date: string } | null; sleep?: { durationMs: number } | null } | null, WhoopRecord[]]) => {
      setHistory(Array.isArray(hist) ? hist : []);
      // Prefer the live score if it was scored today; otherwise today's history row.
      const liveToday = live?.connected && live.recovery && dateKey(new Date(live.recovery.date)) === todayKey;
      if (liveToday) {
        setReadiness({
          recovery: live!.recovery!.score,
          hrv: live!.recovery!.hrv,
          restingHr: live!.recovery!.restingHr,
          sleepHours: live!.sleep ? live!.sleep.durationMs / 3.6e6 : null,
        });
        return;
      }
      const row = (Array.isArray(hist) ? hist : []).find(r => r.date === todayKey);
      setReadiness(row && row.recovery != null ? {
        recovery: row.recovery, hrv: row.hrv ?? null, restingHr: row.restingHr ?? null,
        sleepHours: row.sleepMs ? row.sleepMs / 3.6e6 : null,
      } : { recovery: null, hrv: null, restingHr: null, sleepHours: null });
    });
  }, [refreshKey]);

  const todayPlan = useMemo(() => planForDay(today, readiness, activities), [today, readiness, activities]);
  const tomorrow = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }, [today]);
  const tomorrowPlan = useMemo(() => planForDay(tomorrow, null, activities), [tomorrow, activities]);
  const week = useMemo(() => weekOverview(today, activities), [today, activities]);

  // Once today's session is logged, default to showing tomorrow.
  const showTomorrow = tomorrowPick ?? todayPlan.done;
  const plan = showTomorrow ? tomorrowPlan : todayPlan;
  const s = plan.session;

  const stats = useMemo(() => {
    const last7 = history.slice(-7);
    const sleeps = last7.map(r => r.sleepMs).filter((v): v is number => v != null).map(v => v / 3.6e6);
    const avgSleep = sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null;
    const weight = [...history].reverse().find(r => r.weightLbs != null)?.weightLbs ?? null;
    const lifts = week.filter(d => d.kind === 'lift');
    const legs = week.filter(d => d.title.startsWith('Legs'));
    return {
      avgSleep, weight,
      liftsDone: lifts.filter(d => d.status === 'done').length, liftsTotal: lifts.length,
      legsDone: legs.filter(d => d.status === 'done').length,
      runsDone: week.filter(d => d.kind === 'run' && d.status === 'done').length,
    };
  }, [history, week]);

  const tierColor = TIER_COLOR[plan.tier];

  return (
    <div className="card plan-card fade-in" style={{ ['--plan-c' as string]: tierColor }}>
      <div className="card-head">
        <div className="card-title">
          {showTomorrow
            ? `${tomorrow.toLocaleDateString(undefined, { weekday: 'long' })}'s plan`
            : todayPlan.done ? 'Today · done ✓' : "Today's workout"}
        </div>
        <div className="plan-chips">
          <span className="plan-chip">Block {plan.blockNumber} · Wk {plan.blockWeek}{plan.isDeload ? ' · Deload' : ''}</span>
          {!showTomorrow && <span className="plan-chip plan-tier">{TIER_LABEL[plan.tier]}{readiness?.recovery != null ? ` · ${readiness.recovery}%` : ''}</span>}
          <button className="plan-chip plan-toggle" onClick={() => setTomorrowPick(!showTomorrow)}>
            {showTomorrow ? (todayPlan.done ? '← Today ✓' : '← Today') : 'Tomorrow →'}
          </button>
        </div>
      </div>

      <div className="plan-body">
        <div className="plan-main">
          <h2 className="plan-title">{s.title}</h2>
          <div className="workout-prescription">
            <span>{s.focus}</span>
            <span>{s.duration}</span>
            {plan.adjusted && plan.planned.title !== s.title && <span>planned: {plan.planned.title}</span>}
          </div>

          {(plan.adjustments.length > 0 || plan.makeupNote) && !showTomorrow && (
            <ul className="plan-adjust">
              {plan.makeupNote && <li>{plan.makeupNote}</li>}
              {plan.adjustments.map(a => <li key={a}>{a}</li>)}
            </ul>
          )}
          {showTomorrow && s.kind !== 'rest' && (
            <ul className="plan-adjust"><li>Tomorrow’s session adjusts once WHOOP scores your recovery in the morning.</li></ul>
          )}

          {s.warmup && <div className="plan-warmup"><span>Warm-up</span>{s.warmup}</div>}

          <div className="plan-table">
            {s.exercises.map(e => (
              <div key={e.name} className={`plan-row${e.main ? ' main' : ''}`}>
                <div className="plan-ex">
                  <div className="plan-ex-name">{e.name}</div>
                  {e.note && <div className="plan-ex-note">{e.note}</div>}
                </div>
                <div className="plan-ex-sets">{e.sets}</div>
                <div className="plan-ex-effort">{e.effort ?? ''}</div>
              </div>
            ))}
          </div>
          {s.finisher && <div className="plan-warmup"><span>Finish</span>{s.finisher}</div>}
        </div>

        <div className="plan-side">
          <div className="plan-week">
            {week.map(d => (
              <div key={d.day} className={`plan-day ${d.status}${d.isToday ? ' today' : ''}`} title={d.title}>
                <span className="plan-day-name">{d.day}</span>
                <span className="plan-day-dot" />
                <span className="plan-day-title">{d.title}</span>
              </div>
            ))}
          </div>

          <div className="plan-stats">
            <div><span>Lifts this wk</span><strong>{stats.liftsDone}/{stats.liftsTotal}</strong></div>
            <div><span>Leg days</span><strong>{stats.legsDone}/2</strong></div>
            <div><span>Runs</span><strong>{stats.runsDone}/2</strong></div>
            <div>
              <span>Sleep 7d avg</span>
              <strong style={{ color: stats.avgSleep != null && stats.avgSleep < 7 ? 'var(--z3)' : undefined }}>
                {stats.avgSleep != null ? `${stats.avgSleep.toFixed(1)}h` : '—'}
              </strong>
              <em>goal {SLEEP_TARGET}h</em>
            </div>
            <div>
              <span>Weight</span>
              <strong style={{ color: stats.weight != null && stats.weight < GOAL_WEIGHT[0] ? 'var(--z3)' : undefined }}>
                {stats.weight != null ? `${Math.round(stats.weight)} lb` : '—'}
              </strong>
              <em>goal {GOAL_WEIGHT[0]}–{GOAL_WEIGHT[1]}</em>
            </div>
            <div><span>Protein / day</span><strong>140 g</strong><em>+250 kcal</em></div>
          </div>
        </div>
      </div>
    </div>
  );
}
