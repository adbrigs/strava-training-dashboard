import type { Activity } from './types';
import { ACTIVITY_LABELS, dateKey } from './dataUtils';

export type WorkoutRecommendationStatus = 'recover' | 'maintain' | 'build' | 'push';

export interface DayLoad {
  date: Date;
  trimp: number;
  label: string;
  isToday: boolean;
  intensity: 'rest' | 'easy' | 'moderate' | 'hard';
}

export interface WorkoutRecommendation {
  title: string;
  type: string;
  duration: string;
  intensity: string;
  status: WorkoutRecommendationStatus;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  alternative: string;
  workedOutToday: boolean;
  todaySummary: string;
  chatContext: string;
  metrics: {
    form: number;
    fitness: number;
    fatigue: number;
    sevenDayTrimp: number;
    weeklyBaseline: number;
    daysSinceWorkout: number | null;
    sevenDayLoads: DayLoad[];
  };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

function computeLoad(activities: Activity[], today: Date) {
  const start = new Date(today.getFullYear(), 0, 1);
  start.setHours(0, 0, 0, 0);
  const dailyMap: Record<string, number> = {};
  activities.forEach(a => {
    const k = dateKey(a.date);
    dailyMap[k] = (dailyMap[k] || 0) + a.trimp;
  });

  let ctl = 30;
  let atl = 30;
  const ctlA = 2 / (42 + 1);
  const atlA = 2 / (7 + 1);
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const t = dailyMap[dateKey(d)] || 0;
    ctl = ctl + ctlA * (t - ctl);
    atl = atl + atlA * (t - atl);
  }

  return { ctl, atl, tsb: ctl - atl };
}

function sumTrimpSince(activities: Activity[], today: Date, days: number): number {
  const from = new Date(today);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return activities
    .filter(a => a.date >= from && a.date <= today)
    .reduce((sum, a) => sum + a.trimp, 0);
}

function mostCommonType(activities: Activity[], fallback = 'Run'): string {
  if (!activities.length) return fallback;
  const counts = new Map<string, number>();
  activities.forEach(a => counts.set(a.type, (counts.get(a.type) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || fallback;
}

function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] || type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

const NARROW_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function computeSevenDayLoads(activities: Activity[], today: Date, dailyAvg: number): DayLoad[] {
  const threshold = dailyAvg > 0 ? dailyAvg : 25;
  const result: DayLoad[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const trimp = activities
      .filter(a => dateKey(a.date) === dateKey(d))
      .reduce((sum, a) => sum + a.trimp, 0);
    let intensity: DayLoad['intensity'];
    if (trimp === 0) intensity = 'rest';
    else if (trimp < threshold * 0.6) intensity = 'easy';
    else if (trimp < threshold * 1.3) intensity = 'moderate';
    else intensity = 'hard';
    result.push({ date: new Date(d), trimp, label: NARROW_DAYS[d.getDay()], isToday: i === 0, intensity });
  }
  return result;
}

function buildChatContext(
  today: Date,
  metrics: WorkoutRecommendation['metrics'],
  rec: Pick<WorkoutRecommendation, 'title' | 'status' | 'confidence' | 'reason'>,
  preferredLabel: string,
  workedOutToday: boolean,
  todaySummary: string,
): string {
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const trend = metrics.weeklyBaseline > 0
    ? `${((metrics.sevenDayTrimp / metrics.weeklyBaseline - 1) * 100).toFixed(0)}%`
    : 'n/a';
  const historyStr = metrics.sevenDayLoads
    .map(d => `${d.label}:${d.intensity === 'rest' ? 'rest' : Math.round(d.trimp)}`)
    .join(' ');
  const lastActivity = workedOutToday
    ? `Today — ${todaySummary}`
    : metrics.daysSinceWorkout !== null
      ? `${metrics.daysSinceWorkout} day(s) ago`
      : 'unknown';

  return [
    `Training context for Andrew (${DAY_NAMES[today.getDay()]} ${today.toLocaleDateString()}):`,
    `- Fitness (CTL): ${metrics.fitness.toFixed(1)} | Fatigue (ATL): ${metrics.fatigue.toFixed(1)} | Form (TSB): ${metrics.form.toFixed(1)}`,
    `- 7-day load: ${Math.round(metrics.sevenDayTrimp)} TRIMP vs ${Math.round(metrics.weeklyBaseline)} baseline (${trend})`,
    `- Last activity: ${lastActivity}`,
    `- 7-day history (TRIMP): ${historyStr}`,
    `- Preferred sport: ${preferredLabel}`,
    `- Current recommendation: ${rec.title} (${rec.status}, ${rec.confidence} confidence)`,
    `- Rationale: ${rec.reason}`,
  ].join('\n');
}

export function recommendWorkout(activities: Activity[], today: Date, restDate: string | null = null): WorkoutRecommendation {
  const restToday = restDate !== null && restDate === dateKey(today);
  const usable = activities
    .filter(a => a.date <= today)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const emptySevDayLoads = computeSevenDayLoads([], today, 25);

  if (usable.length < 5) {
    const rec = {
      title: 'Easy aerobic session', type: 'Cardio', duration: '25-35 min',
      intensity: 'Zone 1-2', status: 'maintain' as const, confidence: 'low' as const,
      reason: 'There is not enough history yet to estimate fatigue well, so the safest useful suggestion is a controlled aerobic session.',
      alternative: 'Full rest if you feel sore or under-slept.',
      workedOutToday: false, todaySummary: '',
      metrics: { form: 0, fitness: 0, fatigue: 0, sevenDayTrimp: 0, weeklyBaseline: 0, daysSinceWorkout: null, sevenDayLoads: emptySevDayLoads },
    };
    return { ...rec, chatContext: buildChatContext(today, rec.metrics, rec, 'Cardio', false, '') };
  }

  const { ctl, atl, tsb } = computeLoad(usable, today);
  const sevenDayTrimp = sumTrimpSince(usable, today, 7);
  const twentyEightDayTrimp = sumTrimpSince(usable, today, 28);
  const weeklyBaseline = twentyEightDayTrimp / 4;
  const latest = usable[0];
  const daysSinceWorkout = daysBetween(today, latest.date);
  const todayKey = dateKey(today);
  const todayActivities = usable.filter(a => dateKey(a.date) === todayKey);
  const workedOutToday = todayActivities.length > 0;
  const todaySummary = workedOutToday
    ? todayActivities.map(a => activityLabel(a.type)).join(', ') +
      ` · ${Math.round(todayActivities.reduce((s, a) => s + a.duration, 0))} min` +
      ` · ${Math.round(todayActivities.reduce((s, a) => s + a.trimp, 0))} TRIMP`
    : '';

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dateKey(yesterday);
  const yesterdayTrimp = usable
    .filter(a => dateKey(a.date) === yesterdayKey)
    .reduce((sum, a) => sum + a.trimp, 0);
  const hadHardYesterday = yesterdayTrimp > Math.max(65, weeklyBaseline * 0.28) || usable.some(a => dateKey(a.date) === yesterdayKey && a.zone >= 4);
  const recentHard = usable.find(a => daysBetween(today, a.date) <= 2 && (a.trimp > Math.max(70, weeklyBaseline * 0.3) || a.zone >= 4));
  const recentTypes = usable.filter(a => daysBetween(today, a.date) <= 14);
  const preferredType = mostCommonType(recentTypes, 'Run');
  const preferredLabel = activityLabel(preferredType);
  const loadRatio = weeklyBaseline > 0 ? sevenDayTrimp / weeklyBaseline : 1;

  const tomorrowDate = new Date(today);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const restTomorrow = restDate !== null && restDate === dateKey(tomorrowDate);

  // Project TSB one rest-day forward when:
  //   • user marks today as rest (and hasn't trained today), or
  //   • user marks tomorrow as rest (already trained today — project through the rest day to show day-after)
  let effectiveTSB = tsb;
  let effectiveDaysSince = daysSinceWorkout;
  const effectiveWorkedOutToday = restToday ? false : workedOutToday;
  if ((restToday && !workedOutToday) || (restTomorrow && workedOutToday)) {
    const projATL = atl + (2 / 8) * (0 - atl);
    const projCTL = ctl + (2 / 43) * (0 - ctl);
    effectiveTSB = projCTL - projATL;
    effectiveDaysSince = daysSinceWorkout !== null ? daysSinceWorkout + 1 : 1;
  }

  const sevenDayLoads = computeSevenDayLoads(usable, today, weeklyBaseline / 7);

  const metrics = {
    form: effectiveTSB,
    fitness: ctl,
    fatigue: atl,
    sevenDayTrimp,
    weeklyBaseline,
    daysSinceWorkout: effectiveDaysSince,
    sevenDayLoads,
  };

  const shared = { workedOutToday: effectiveWorkedOutToday, todaySummary, metrics };

  if (effectiveTSB < -30 || (loadRatio > 1.25 && hadHardYesterday)) {
    const rec = {
      title: 'Recovery day', type: 'Recovery', duration: '20-40 min', intensity: 'Zone 1',
      status: 'recover' as const, confidence: 'high' as const,
      reason: `Form is ${effectiveTSB.toFixed(1)} and recent load is ${Math.round(loadRatio * 100)}% of baseline, so another hard session would stack fatigue.`,
      alternative: 'Easy walk, yoga, mobility, or complete rest.',
      ...shared,
    };
    return { ...rec, chatContext: buildChatContext(today, metrics, rec, preferredLabel, effectiveWorkedOutToday, todaySummary) };
  }

  if (effectiveTSB < -10 || hadHardYesterday || recentHard) {
    const rec = {
      title: `Easy ${preferredLabel.toLowerCase()} or cross-training`,
      type: preferredLabel, duration: '30-45 min',
      intensity: preferredType === 'WeightTraining' ? 'Moderate load, RPE 5-6' : 'Zone 2',
      status: 'maintain' as const, confidence: 'high' as const,
      reason: hadHardYesterday
        ? 'Yesterday already carried a hard training load, so today should add aerobic volume without another intensity spike.'
        : `Form is ${effectiveTSB.toFixed(1)}, which suggests useful training is fine but intensity should stay controlled.`,
      alternative: preferredType === 'WeightTraining'
        ? 'Mobility work, a walk, or an easy cardio session.'
        : 'Technique work, mobility, or an easy spin if your legs feel flat.',
      ...shared,
    };
    return { ...rec, chatContext: buildChatContext(today, metrics, rec, preferredLabel, effectiveWorkedOutToday, todaySummary) };
  }

  if (effectiveDaysSince !== null && effectiveDaysSince >= 2 && loadRatio < 0.85) {
    const rec = {
      title: 'Productive aerobic build', type: preferredLabel,
      duration: '45-60 min', intensity: 'Zone 2 with 4-6 relaxed pickups',
      status: 'build' as const, confidence: 'medium' as const,
      reason: `${effectiveDaysSince} days since the last logged workout and this week is below baseline — a steady build session fits well.`,
      alternative: 'Strength training if you want lower impact today.',
      ...shared,
    };
    return { ...rec, chatContext: buildChatContext(today, metrics, rec, preferredLabel, effectiveWorkedOutToday, todaySummary) };
  }

  if (effectiveTSB > 8 && loadRatio <= 1.1) {
    const rec = {
      title: 'Quality workout',
      type: preferredType === 'WeightTraining' ? 'Weights' : preferredLabel,
      duration: preferredType === 'WeightTraining' ? '45-60 min' : '40-55 min',
      intensity: preferredType === 'WeightTraining' ? 'Moderate-heavy, RPE 7-8' : 'Tempo or intervals, Zone 3-4',
      status: 'push' as const, confidence: 'medium' as const,
      reason: `Form is positive at ${effectiveTSB.toFixed(1)} and weekly load is not above baseline — you look fresh enough for quality work.`,
      alternative: 'If sleep or soreness is poor, swap to 35-45 min Zone 2.',
      ...shared,
    };
    return { ...rec, chatContext: buildChatContext(today, metrics, rec, preferredLabel, effectiveWorkedOutToday, todaySummary) };
  }

  const rec = {
    title: 'Steady maintenance session', type: preferredLabel,
    duration: '35-50 min', intensity: 'Zone 2-3',
    status: 'build' as const, confidence: 'medium' as const,
    reason: `Form is balanced at ${effectiveTSB.toFixed(1)} and weekly load is near baseline — a moderate session keeps momentum without forcing recovery debt.`,
    alternative: 'Short strength session or mobility if you want a lighter day.',
    ...shared,
  };
  return { ...rec, chatContext: buildChatContext(today, metrics, rec, preferredLabel, effectiveWorkedOutToday, todaySummary) };
}
