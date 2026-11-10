// Andrew's training program: PPL + 2 leg days + run, in 4-week blocks
// (3 build weeks + 1 deload), auto-adjusted each morning by WHOOP readiness.
//
// Goals it is built around (Nov 2026):
//   - 150–155 lb with lean, visible muscle (currently ~147–148, drifting down)
//   - Legs are the priority → trained twice a week (squat day + hinge day)
//   - Keep running for cardio/health, mostly easy aerobic with one quality day
//   - ~5 sessions/week, 60–75 min, commercial gym

import type { Activity } from './types';
import { dateKey } from './dataUtils';

// Block 1, week 1 starts Monday Nov 9, 2026. Blocks repeat every 4 weeks.
export const PLAN_ANCHOR = new Date(2026, 10, 9);

export type SessionKey = 'legsA' | 'push' | 'easyRun' | 'pull' | 'legsB' | 'qualityRun' | 'rest' | 'recovery';
export type SessionKind = 'lift' | 'run' | 'rest';
export type ReadinessTier = 'green' | 'yellow' | 'red' | 'unknown';

export interface Exercise {
  name: string;
  sets: string;          // e.g. "4 × 5" or "10 min"
  effort?: string;       // e.g. "RPE 7" or "HR < 145"
  note?: string;
  main?: boolean;        // main lift — the one to progress and log
}

export interface Session {
  key: SessionKey;
  kind: SessionKind;
  title: string;
  focus: string;
  duration: string;
  warmup?: string;
  exercises: Exercise[];
  finisher?: string;
}

export interface Readiness {
  recovery: number | null;   // WHOOP recovery %
  sleepHours: number | null; // last night's sleep
  hrv: number | null;
  restingHr: number | null;
}

export interface DailyPlan {
  date: Date;
  blockNumber: number;
  blockWeek: 1 | 2 | 3 | 4;
  isDeload: boolean;
  planned: Session;            // what the calendar says
  session: Session;            // what to actually do today
  tier: ReadinessTier;
  adjusted: boolean;
  adjustments: string[];       // human-readable changes made for readiness
  makeupNote: string | null;   // e.g. "Saturday is your Legs B make-up"
  done: boolean;               // the planned work is already logged today
}

// Mon..Sun → session, JS getDay() indexing (0 = Sunday)
export const WEEK_TEMPLATE: SessionKey[] = ['rest', 'legsA', 'push', 'easyRun', 'pull', 'legsB', 'qualityRun'];

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Block math ──────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return x;
}

export function blockPosition(date: Date): { blockNumber: number; blockWeek: 1 | 2 | 3 | 4 } {
  const weeks = Math.floor((mondayOf(date).getTime() - mondayOf(PLAN_ANCHOR).getTime()) / (7 * 864e5));
  if (weeks < 0) return { blockNumber: 1, blockWeek: 1 };
  return { blockNumber: Math.floor(weeks / 4) + 1, blockWeek: ((weeks % 4) + 1) as 1 | 2 | 3 | 4 };
}

// ─── Session library ─────────────────────────────────────────────────────────

const MAIN_RPE: Record<number, string> = { 1: 'RPE 7', 2: 'RPE 7.5–8', 3: 'RPE 8–8.5', 4: 'RPE 6' };
const ACC_RPE: Record<number, string> = { 1: 'RPE 7', 2: 'RPE 8', 3: 'RPE 8–9', 4: 'RPE 6–7' };

/** Main lift: 4 sets in build weeks, 3 lighter sets on deload. */
function mainSets(week: number, reps: string) {
  return week === 4 ? `3 × ${reps}` : `4 × ${reps}`;
}
/** Accessories: drop a set on deload. */
function accSets(week: number, sets: number, reps: string) {
  return `${week === 4 ? Math.max(1, sets - 1) : sets} × ${reps}`;
}

const PROGRESS_NOTE = 'Hit the top of the rep range on every set at target RPE → add weight next week';

function buildSession(key: SessionKey, week: number): Session {
  const deload = week === 4;
  switch (key) {
    case 'legsA':
      return {
        key, kind: 'lift', title: 'Legs A — Squat', focus: 'Quads · glutes · calves',
        duration: '65–75 min',
        warmup: '5 min bike + leg swings, goblet squat 2×8, 2–3 ramp-up squat sets',
        exercises: [
          { name: 'Back squat', sets: mainSets(week, '5'), effort: MAIN_RPE[week], main: true, note: deload ? 'Use ~85% of last week’s weight' : PROGRESS_NOTE },
          { name: 'Bulgarian split squat', sets: accSets(week, 3, '8/leg'), effort: ACC_RPE[week], note: 'DBs, rear foot on bench, slow down' },
          { name: 'Leg press', sets: accSets(week, 3, '10–12'), effort: ACC_RPE[week] },
          { name: 'Leg extension', sets: accSets(week, 3, '12–15'), effort: ACC_RPE[week], note: '1s squeeze at top' },
          { name: 'Standing calf raise', sets: accSets(week, 4, '10–12'), effort: ACC_RPE[week], note: '2s pause in the stretch' },
          { name: 'Hanging knee raise', sets: accSets(week, 3, '12'), note: 'No swinging' },
        ],
        finisher: deload ? undefined : 'Optional: 10 min easy bike to flush',
      };
    case 'legsB':
      return {
        key, kind: 'lift', title: 'Legs B — Hinge & Power', focus: 'Hamstrings · glutes · single-leg',
        duration: '65–75 min',
        warmup: '5 min bike, glute bridges 2×10, banded walks, 2 ramp-up RDL sets',
        exercises: [
          { name: 'Box jump', sets: deload ? '3 × 3' : '4 × 3', effort: 'Explosive, full rest', note: 'Step down, don’t jump down' },
          { name: 'Romanian deadlift', sets: mainSets(week, '6–8'), effort: MAIN_RPE[week], main: true, note: deload ? 'Use ~85% of last week’s weight' : PROGRESS_NOTE },
          { name: 'DB walking lunge', sets: accSets(week, 3, '10/leg'), effort: ACC_RPE[week] },
          { name: 'Barbell hip thrust', sets: accSets(week, 3, '8–10'), effort: ACC_RPE[week], note: '1s lockout' },
          { name: 'Lying leg curl', sets: accSets(week, 3, '10–12'), effort: ACC_RPE[week] },
          { name: 'Seated calf raise', sets: accSets(week, 3, '15'), effort: ACC_RPE[week] },
          { name: 'Pallof press', sets: accSets(week, 3, '10/side') },
        ],
      };
    case 'push':
      return {
        key, kind: 'lift', title: 'Push', focus: 'Chest · shoulders · triceps',
        duration: '60–70 min',
        warmup: 'Band pull-aparts 2×15, push-ups 2×10, 2–3 ramp-up bench sets',
        exercises: [
          { name: 'Barbell bench press', sets: mainSets(week, '6–8'), effort: MAIN_RPE[week], main: true, note: deload ? 'Use ~85% of last week’s weight' : PROGRESS_NOTE },
          { name: 'Incline DB press', sets: accSets(week, 3, '8–10'), effort: ACC_RPE[week] },
          { name: 'Seated DB shoulder press', sets: accSets(week, 3, '8–10'), effort: ACC_RPE[week] },
          { name: 'Cable lateral raise', sets: accSets(week, 3, '12–15'), effort: ACC_RPE[week] },
          { name: 'Cable fly', sets: accSets(week, 2, '12–15'), effort: ACC_RPE[week] },
          { name: 'Rope triceps pushdown', sets: accSets(week, 3, '10–12'), effort: ACC_RPE[week] },
        ],
      };
    case 'pull':
      return {
        key, kind: 'lift', title: 'Pull', focus: 'Back · rear delts · biceps',
        duration: '60–70 min',
        warmup: 'Band pull-aparts 2×15, dead hang 2×30s, 2 light pulldown sets',
        exercises: [
          { name: 'Pull-up (or lat pulldown)', sets: mainSets(week, '6–8'), effort: MAIN_RPE[week], main: true, note: 'Add weight once you get 10 clean reps' },
          { name: 'Chest-supported row', sets: accSets(week, 3, '8–10'), effort: ACC_RPE[week] },
          { name: 'Single-arm cable row', sets: accSets(week, 3, '10–12'), effort: ACC_RPE[week] },
          { name: 'Face pull', sets: accSets(week, 3, '15'), effort: ACC_RPE[week] },
          { name: 'Incline DB curl', sets: accSets(week, 3, '10–12'), effort: ACC_RPE[week] },
          { name: 'Hammer curl', sets: accSets(week, 2, '12'), effort: ACC_RPE[week] },
        ],
        finisher: deload ? undefined : 'Back extension 2 × 12',
      };
    case 'easyRun': {
      const mins = { 1: 30, 2: 35, 3: 40, 4: 25 }[week]!;
      return {
        key, kind: 'run', title: 'Easy aerobic run + core', focus: 'Aerobic base',
        duration: `${mins + 12}–${mins + 15} min`,
        exercises: [
          { name: 'Easy run', sets: `${mins} min`, effort: 'HR 130–145, conversational', main: true, note: 'Slow down or walk if HR passes 150 — easy is the point' },
          { name: 'Dead bug', sets: '3 × 10' },
          { name: 'Side plank', sets: '3 × 30s/side' },
          { name: 'Back extension', sets: '2 × 12' },
        ],
      };
    }
    case 'qualityRun': {
      const main: Record<number, Exercise> = {
        1: { name: 'Strides', sets: '6 × 20s', effort: 'Fast but relaxed, walk back', main: true },
        2: { name: 'Intervals', sets: '4 × 3 min', effort: 'RPE 8 (HR ~165–175)', main: true, note: '2 min easy jog between' },
        3: { name: 'Intervals', sets: '5 × 3 min', effort: 'RPE 8 (HR ~165–175)', main: true, note: '2 min easy jog between' },
        4: { name: 'Strides', sets: '4 × 20s', effort: 'Relaxed', main: true },
      };
      return {
        key, kind: 'run', title: week === 4 ? 'Easy run (deload)' : 'Run — quality day', focus: 'Speed & VO₂',
        duration: '30–40 min',
        exercises: [
          { name: 'Easy warm-up jog', sets: '10 min', effort: 'HR < 145' },
          main[week],
          { name: 'Easy cool-down jog', sets: week === 4 ? '15 min' : '10 min', effort: 'HR < 145' },
        ],
        finisher: 'Tennis or pickleball instead is fine — keep it to one hard effort',
      };
    }
    case 'recovery':
      return {
        key, kind: 'rest', title: 'Active recovery', focus: 'Bring HRV back up',
        duration: '30–45 min',
        exercises: [
          { name: 'Walk or easy bike', sets: '30–45 min', effort: 'Zone 1, HR < 115' },
          { name: 'Mobility: hips, t-spine, ankles', sets: '10–15 min' },
        ],
        finisher: 'Early night and extra water. Nothing hard today.',
      };
    case 'rest':
    default:
      return {
        key: 'rest', kind: 'rest', title: 'Rest day', focus: 'Recover',
        duration: '—',
        exercises: [
          { name: 'Optional long walk or ruck', sets: '45–90 min', effort: 'Easy' },
        ],
        finisher: 'Prep the week: food, sleep, schedule Mon–Fri sessions',
      };
  }
}

export function plannedSessionFor(date: Date): Session {
  const { blockWeek } = blockPosition(date);
  return buildSession(WEEK_TEMPLATE[date.getDay()], blockWeek);
}

// ─── Readiness ───────────────────────────────────────────────────────────────

export function readinessTier(r: Readiness): ReadinessTier {
  if (r.recovery == null) return 'unknown';
  let tier: ReadinessTier = r.recovery >= 67 ? 'green' : r.recovery >= 34 ? 'yellow' : 'red';
  // Very short sleep knocks you down a tier even if recovery looks okay.
  if (r.sleepHours != null && r.sleepHours < 5.5) {
    tier = tier === 'green' ? 'yellow' : 'red';
  }
  return tier;
}

function capLift(session: Session, adjustments: string[]): Session {
  adjustments.push('Main lift: one fewer set, cap effort at RPE 7');
  adjustments.push('Accessories: stop 2–3 reps short of failure');
  if (session.finisher) adjustments.push('Skip the finisher');
  return {
    ...session,
    exercises: session.exercises.map(e => {
      if (!e.main) return { ...e, effort: e.effort ? 'RPE 6–7' : e.effort };
      const m = e.sets.match(/^(\d+) × (.+)$/);
      const sets = m ? `${Math.max(2, Number(m[1]) - 1)} × ${m[2]}` : e.sets;
      return { ...e, sets, effort: 'RPE 7 max', note: 'Same weight as last time is fine today' };
    }),
    finisher: undefined,
  };
}

// ─── Activity helpers ────────────────────────────────────────────────────────

function liftedOn(activities: Activity[], d: Date): boolean {
  const k = dateKey(d);
  return activities.some(a => dateKey(a.date) === k && a.type === 'WeightTraining' && a.duration >= 25);
}
function ranOn(activities: Activity[], d: Date): boolean {
  const k = dateKey(d);
  return activities.some(a => dateKey(a.date) === k && (a.type === 'Run' || a.type === 'TrailRun'));
}

/** Leg days (Mon/Fri) earlier this week with no lift logged on that date. */
function missedLegDays(activities: Activity[], today: Date): SessionKey[] {
  const mon = mondayOf(today);
  const missed: SessionKey[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    if (d >= startOfDay(today)) break;
    const key = WEEK_TEMPLATE[d.getDay()];
    if ((key === 'legsA' || key === 'legsB') && !liftedOn(activities, d)) missed.push(key);
  }
  return missed;
}

export function sessionDone(session: Session, activities: Activity[], d: Date): boolean {
  if (session.kind === 'lift') return liftedOn(activities, d);
  if (session.kind === 'run') return ranOn(activities, d);
  return false;
}

// ─── The daily recommendation ────────────────────────────────────────────────

export function planForDay(date: Date, readiness: Readiness | null, activities: Activity[]): DailyPlan {
  const { blockNumber, blockWeek } = blockPosition(date);
  const planned = plannedSessionFor(date);
  const tier = readiness ? readinessTier(readiness) : 'unknown';
  const adjustments: string[] = [];
  let session = planned;
  let makeupNote: string | null = null;

  // Saturday: if a leg day was missed this week, legs beat the quality run.
  if (planned.key === 'qualityRun') {
    const missed = missedLegDays(activities, date);
    if (missed.length) {
      const key = missed[missed.length - 1];
      session = buildSession(key, blockWeek);
      makeupNote = `You missed ${key === 'legsA' ? 'Legs A' : 'Legs B'} this week, so today is a leg make-up instead of the quality run.`;
    }
  }

  if (tier === 'red' && session.kind !== 'rest') {
    const was = session.title;
    session = buildSession('recovery', blockWeek);
    adjustments.push(`Swapped ${was} for active recovery: recovery is in the red`);
    if (planned.key === 'legsA' || planned.key === 'legsB') {
      makeupNote = 'Missed leg day? Saturday will automatically become your leg make-up.';
    } else {
      makeupNote = 'Don’t double up tomorrow. Just pick the plan back up.';
    }
  } else if (tier === 'yellow') {
    if (session.kind === 'lift') {
      session = capLift(session, adjustments);
    } else if (session.key === 'qualityRun') {
      session = { ...buildSession('easyRun', blockWeek), title: 'Easy run (downgraded)' };
      adjustments.push('Quality run downgraded to an easy run: recovery is in the yellow');
    } else if (session.key === 'easyRun') {
      adjustments.push('Keep it truly easy. Cut it to 25 min if HR runs high.');
    }
  }

  if (readiness?.sleepHours != null && readiness.sleepHours < 6.5 && tier !== 'red') {
    adjustments.push(`Only ${readiness.sleepHours.toFixed(1)}h of sleep. Aim for bed 45 min earlier tonight.`);
  }

  const done = sessionDone(session, activities, date) || sessionDone(planned, activities, date);

  return {
    date, blockNumber, blockWeek, isDeload: blockWeek === 4,
    planned, session, tier,
    adjusted: session !== planned,
    adjustments, makeupNote, done,
  };
}

/** Mon–Sun strip for the current week with completion status. */
export function weekOverview(today: Date, activities: Activity[]) {
  const mon = mondayOf(today);
  const t0 = startOfDay(today).getTime();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const s = plannedSessionFor(d);
    const isPast = d.getTime() < t0;
    const isToday = d.getTime() === t0;
    const done = sessionDone(s, activities, d);
    return {
      date: d,
      day: DAY_SHORT[d.getDay()],
      title: s.key === 'rest' ? 'Rest' : s.title.split(' — ')[0].replace('Run — quality day', 'Run Q').replace('Easy aerobic run + core', 'Easy run'),
      kind: s.kind,
      isToday,
      status: s.kind === 'rest' ? 'rest' as const : done ? 'done' as const : isPast ? 'missed' as const : 'upcoming' as const,
    };
  });
}

/** Short plan summary for the Coach AI context. */
export function planChatContext(plan: DailyPlan): string {
  return [
    `=== ANDREW'S TRAINING PROGRAM ===`,
    `Weekly template: Mon Legs A (squat) · Tue Push · Wed Easy run + core · Thu Pull · Fri Legs B (hinge/power) · Sat Quality run (or leg make-up) · Sun Rest.`,
    `4-week blocks: weeks 1–3 build (main lifts RPE 7 → 8.5), week 4 deload. Block ${plan.blockNumber}, week ${plan.blockWeek}${plan.isDeload ? ' (deload)' : ''}.`,
    `Readiness rules: WHOOP recovery ≥67 = as written; 34–66 = cap RPE 7, one fewer main set, quality runs become easy; <34 = active recovery only. Sleep <5.5h drops one tier.`,
    `Goals: 150–155 lb lean (currently ~148), legs are the priority, keep running for cardio. Fix sleep (avg ~6.3h) and weekend recovery crashes.`,
    `Today: ${plan.session.title} (${plan.tier} readiness${plan.adjusted ? ', adjusted from ' + plan.planned.title : ''})${plan.done ? ' — already done' : ''}.`,
    plan.session.exercises.map(e => `  - ${e.name}: ${e.sets}${e.effort ? ' @ ' + e.effort : ''}`).join('\n'),
  ].join('\n');
}
