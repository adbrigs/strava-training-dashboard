'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Activity } from '@/lib/types';
import { dateKey } from '@/lib/dataUtils';
import { getWhoopLive } from '@/lib/whoopLive';
import {
  planForDay, weekOverview, PICKABLE_SESSIONS, EXTRA_SESSIONS, MAX_EXTRA_SESSIONS, SESSION_LABEL,
  type Exercise, type Readiness, type ReadinessTier,
} from '@/lib/trainingPlan';
import { useSchedule, saveChanges, chooseSession, resetDay, addExtra, removeExtra } from '@/lib/schedule';

interface Props {
  activities: Activity[];
  today: Date;
  refreshKey?: number;
}

interface WhoopRecord { date: string; recovery?: number; hrv?: number; restingHr?: number; sleepMs?: number; }

const TIER_LABEL: Record<ReadinessTier, string> = {
  green: 'Green · go', yellow: 'Yellow · controlled', red: 'Red · recover', unknown: 'No score yet',
};
const TIER_COLOR: Record<ReadinessTier, string> = {
  green: 'var(--z2)', yellow: 'var(--z3)', red: 'var(--z5)', unknown: 'var(--accent)',
};

// Per-device memory of whether the exercise list is open.
const EXPANDED_KEY = 'planCard.expanded';
const expandedListeners = new Set<() => void>();
function readExpanded(): boolean {
  try { return localStorage.getItem(EXPANDED_KEY) === '1'; } catch { return false; }
}
function writeExpanded(v: boolean) {
  try { localStorage.setItem(EXPANDED_KEY, v ? '1' : '0'); } catch { /* storage blocked */ }
  expandedListeners.forEach(l => l());
}
function subscribeExpanded(l: () => void) {
  // Also follow changes made in another tab of the dashboard.
  const onStorage = (e: StorageEvent) => { if (e.key === EXPANDED_KEY) l(); };
  expandedListeners.add(l);
  window.addEventListener('storage', onStorage);
  return () => { expandedListeners.delete(l); window.removeEventListener('storage', onStorage); };
}

export default function TodaysPlanSection({ activities, today, refreshKey = 0 }: Props) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const expanded = useSyncExternalStore(subscribeExpanded, readExpanded, () => false);
  const toggleExpanded = () => writeExpanded(!expanded);
  // null = default view (today, or tomorrow once today's session is logged)
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const pickDay = (k: string) => { setPickedKey(k); setEditing(false); };
  // Swaps and extra sessions saved from this card (shared with the Coach AI).
  const schedule = useSchedule();
  const overrides = schedule.overrides;

  useEffect(() => {
    const todayKey = dateKey(new Date());
    Promise.all([
      getWhoopLive(),
      fetch(`/data/whoop_history.json?v=${refreshKey}`).then(r => r.json()).catch(() => []),
    ]).then(([live, hist]: [{ connected?: boolean; recovery?: { score: number; hrv: number; restingHr: number; date: string } | null; sleep?: { durationMs: number } | null } | null, WhoopRecord[]]) => {
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

  const todayPlan = useMemo(() => planForDay(today, readiness, activities, overrides), [today, readiness, activities, overrides]);
  const tomorrow = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }, [today]);
  const tomorrowPlan = useMemo(() => planForDay(tomorrow, null, activities, overrides), [tomorrow, activities, overrides]);
  const week = useMemo(() => weekOverview(today, activities, overrides), [today, activities, overrides]);
  const weekDates = useMemo(() => week.map(d => d.date), [week]);

  const todayKey = dateKey(today);
  const tomorrowKey = dateKey(tomorrow);
  // Once today's session is logged, default to showing tomorrow.
  const selectedKey = pickedKey ?? (todayPlan.done ? tomorrowKey : todayKey);
  const isToday = selectedKey === todayKey;
  const isTomorrow = selectedKey === tomorrowKey;

  const selectedDate = useMemo(() => {
    if (selectedKey === todayKey) return today;
    if (selectedKey === tomorrowKey) return tomorrow;
    return week.find(d => dateKey(d.date) === selectedKey)?.date ?? today;
  }, [selectedKey, todayKey, tomorrowKey, today, tomorrow, week]);
  const isPast = !isToday && selectedDate.getTime() < today.getTime();
  const selectedStatus = week.find(d => dateKey(d.date) === selectedKey)?.status;

  const plan = useMemo(() => {
    if (isToday) return todayPlan;
    if (isTomorrow) return tomorrowPlan;
    return planForDay(selectedDate, null, activities, overrides);
  }, [isToday, isTomorrow, todayPlan, tomorrowPlan, selectedDate, activities, overrides]);
  const s = plan.session;
  const weekday = selectedDate.toLocaleDateString(undefined, { weekday: 'long' });
  const headTitle = isToday
    ? (todayPlan.done ? 'Today · done ✓' : "Today's workout")
    : isTomorrow ? `Tomorrow · ${weekday}`
    : `${weekday}${isPast ? (plan.done || selectedStatus === 'done' ? ' · done ✓' : s.kind === 'rest' ? '' : ' · missed') : ''}`;

  // Counts every session in the week, including extras (an added run counts).
  const stats = useMemo(() => {
    const all = week.flatMap(d => d.sessions);
    const lifts = all.filter(x => x.kind === 'lift');
    const legs = all.filter(x => x.key === 'legsA' || x.key === 'legsB');
    const runs = all.filter(x => x.kind === 'run');
    return {
      liftsDone: lifts.filter(x => x.done).length, liftsTotal: lifts.length,
      legsDone: legs.filter(x => x.done).length, legsTotal: legs.length,
      runsDone: runs.filter(x => x.done).length, runsTotal: runs.length,
    };
  }, [week]);

  // Editing works on days in this week's strip.
  const selectedInWeek = weekDates.some(d => dateKey(d) === selectedKey);
  const canEdit = selectedInWeek && schedule.status !== 'loading' && schedule.status !== 'unavailable';
  const dayChanged = selectedKey in overrides;
  const extraKeys = plan.extras.map(x => x.key);

  const tierColor = TIER_COLOR[plan.tier];

  const exerciseCount = s.exercises.length;
  const hasDetail = exerciseCount > 0 || !!s.warmup || !!s.finisher || plan.extras.length > 0;
  // Lifts drop the routine RPE targets; runs and recovery keep their HR targets,
  // and a lift capped by low recovery keeps its caps.
  const showEffort = s.kind !== 'lift' || plan.adjusted;
  const showAdjust = (plan.adjustments.length > 0 || !!plan.makeupNote) && (isToday || isPast);

  const renderRows = (exercises: Exercise[], withEffort: boolean, keyPrefix: string) => (
    <div className="plan-table">
      {exercises.map(e => (
        <div key={keyPrefix + e.name} className={`plan-row${e.main ? ' main' : ''}`}>
          <div className="plan-ex">
            <div className="plan-ex-name">{e.name}</div>
            {e.note && <div className="plan-ex-note">{e.note}</div>}
          </div>
          <div className="plan-ex-sets">
            {e.sets}
            {withEffort && e.effort && <div className="plan-ex-effort">{e.effort}</div>}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="card plan-card fade-in" style={{ ['--plan-c' as string]: tierColor }}>
      <div className="plan-summary">
        <div className="plan-main">
          <div className="plan-label">{headTitle}</div>
          <div className="plan-headline">
            <h2 className="plan-title">
              {s.title}
              {plan.extras.map((x, i) => <span key={i} className="plan-title-extra"> + {SESSION_LABEL[x.key]}</span>)}
            </h2>
            <div className="plan-meta">
              {s.focus && <span>{s.focus}</span>}
              {s.duration && <span>{s.duration}</span>}
              {exerciseCount > 0 && <span>{exerciseCount} exercises</span>}
              {plan.adjusted && plan.planned.title !== s.title && <span>planned: {plan.planned.title}</span>}
            </div>
          </div>
          <div className="plan-chips">
            {isToday && <span className="plan-chip plan-tier">{TIER_LABEL[plan.tier]}{readiness?.recovery != null ? ` · ${readiness.recovery}%` : ''}</span>}
            <span className="plan-chip">Block {plan.blockNumber} · Wk {plan.blockWeek}{plan.isDeload ? ' · Deload' : ''}</span>
            <button type="button" className="plan-chip plan-toggle" onClick={() => pickDay(isToday ? tomorrowKey : todayKey)}>
              {isToday ? 'Tomorrow →' : (todayPlan.done ? '← Today ✓' : '← Today')}
            </button>
            {hasDetail && (
              <button type="button" className="plan-chip plan-toggle plan-expand" aria-expanded={expanded} onClick={toggleExpanded}>
                {expanded ? 'Hide details ▴' : 'Details ▾'}
              </button>
            )}
            {canEdit && (
              <button type="button" className="plan-chip plan-toggle plan-edit" aria-expanded={editing} onClick={() => setEditing(v => !v)}>
                {editing ? 'Done' : 'Change day'}
              </button>
            )}
          </div>
        </div>

        <div className="plan-side">
          <div className="plan-week">
            {week.map(d => {
              const k = dateKey(d.date);
              const selected = k === selectedKey;
              return (
                <button
                  type="button"
                  key={d.day}
                  className={`plan-day ${d.status}${d.isToday ? ' today' : ''}${selected ? ' selected' : ''}${d.changed ? ' changed' : ''}`}
                  title={`View ${[d.title, ...d.extraTitles].join(' + ')} workout${d.changed ? ' (changed)' : ''}`}
                  aria-pressed={selected}
                  onClick={() => pickDay(k)}
                >
                  <span className="plan-day-name">{d.day}</span>
                  <span className="plan-day-dot" />
                  <span className="plan-day-title">{d.title}</span>
                  {d.extraTitles.length > 0 && <span className="plan-day-extra">+ {d.extraTitles.join(', ')}</span>}
                </button>
              );
            })}
          </div>
          <div className="plan-stats">
            <span>Lifts <strong>{stats.liftsDone}/{stats.liftsTotal}</strong></span>
            <span>Legs <strong>{stats.legsDone}/{stats.legsTotal}</strong></span>
            <span>Runs <strong>{stats.runsDone}/{stats.runsTotal}</strong></span>
          </div>
        </div>
      </div>

      {editing && canEdit && (
        <div className="plan-editor" aria-label={`Change ${weekday}`}>
          <div className="plan-editor-row">
            <span className="plan-editor-label">Do instead</span>
            <div className="plan-editor-options">
              {PICKABLE_SESSIONS.map(k => (
                <button
                  key={k} type="button"
                  className={`plan-pick${plan.planned.key === k ? ' current' : ''}`}
                  aria-pressed={plan.planned.key === k}
                  disabled={schedule.status === 'saving'}
                  onClick={() => void saveChanges(chooseSession(weekDates, overrides, selectedDate, k))}
                >
                  {SESSION_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="plan-editor-row">
            <span className="plan-editor-label">Add</span>
            <div className="plan-editor-options">
              {extraKeys.map((k, i) => (
                <button
                  key={`x${i}`} type="button" className="plan-pick current"
                  title={`Remove ${SESSION_LABEL[k]}`}
                  disabled={schedule.status === 'saving'}
                  onClick={() => void saveChanges(removeExtra(overrides, selectedDate, i))}
                >
                  {SESSION_LABEL[k]} ✕
                </button>
              ))}
              {extraKeys.length < MAX_EXTRA_SESSIONS && EXTRA_SESSIONS.map(k => (
                <button
                  key={k} type="button" className="plan-pick add"
                  disabled={schedule.status === 'saving'}
                  onClick={() => void saveChanges(addExtra(overrides, selectedDate, k))}
                >
                  + {SESSION_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="plan-editor-foot">
            <span className="plan-editor-hint">
              {schedule.status === 'saving' ? 'Saving…' : 'Picking a session planned on another day swaps the two days.'}
            </span>
            {dayChanged && (
              <button
                type="button" className="plan-chip plan-toggle"
                disabled={schedule.status === 'saving'}
                onClick={() => void saveChanges(resetDay(weekDates, overrides, selectedDate))}
              >
                Reset to plan
              </button>
            )}
          </div>
        </div>
      )}

      {schedule.message && (schedule.status === 'error' || editing) && (
        <p className="plan-status" role="status">{schedule.message}</p>
      )}

      {showAdjust && (
        <ul className="plan-adjust">
          {plan.makeupNote && <li>{plan.makeupNote}</li>}
          {plan.adjustments.map(a => <li key={a}>{a}</li>)}
        </ul>
      )}

      {expanded && hasDetail && (
        <div className="plan-detail">
          {s.warmup && <div className="plan-warmup"><span>Warm-up</span>{s.warmup}</div>}
          {exerciseCount > 0 && renderRows(s.exercises, showEffort, 'm-')}
          {s.finisher && <div className="plan-warmup"><span>Finish</span>{s.finisher}</div>}
          {plan.extras.map((x, i) => (
            <div key={i} className="plan-extra">
              <div className="plan-extra-head">+ {x.title} <span>{x.duration}</span></div>
              {renderRows(x.exercises, x.kind !== 'lift', `x${i}-`)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
