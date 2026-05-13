import type { Activity } from './types';
import { ACTIVITY_LABELS, dateKey } from './dataUtils';

export type WorkoutRecommendationStatus = 'recover' | 'maintain' | 'build' | 'push';

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
  metrics: {
    form: number;
    fitness: number;
    fatigue: number;
    sevenDayTrimp: number;
    weeklyBaseline: number;
    daysSinceWorkout: number | null;
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

export function recommendWorkout(activities: Activity[], today: Date): WorkoutRecommendation {
  const usable = activities
    .filter(a => a.date <= today)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (usable.length < 5) {
    return {
      title: 'Easy aerobic session',
      type: 'Cardio',
      duration: '25-35 min',
      intensity: 'Zone 1-2',
      status: 'maintain',
      confidence: 'low',
      reason: 'There is not enough history yet to estimate fatigue well, so the safest useful suggestion is a controlled aerobic session.',
      alternative: 'Full rest if you feel sore or under-slept.',
      workedOutToday: false,
      todaySummary: '',
      metrics: { form: 0, fitness: 0, fatigue: 0, sevenDayTrimp: 0, weeklyBaseline: 0, daysSinceWorkout: null },
    };
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

  const metrics = {
    form: tsb,
    fitness: ctl,
    fatigue: atl,
    sevenDayTrimp,
    weeklyBaseline,
    daysSinceWorkout,
  };

  if (tsb < -30 || (loadRatio > 1.25 && hadHardYesterday)) {
    return {
      title: 'Recovery day',
      type: 'Recovery',
      duration: '20-40 min',
      intensity: 'Zone 1',
      status: 'recover',
      confidence: 'high',
      reason: `Form is ${tsb.toFixed(1)} and recent load is ${Math.round(loadRatio * 100)}% of baseline, so another hard session would stack fatigue.`,
      alternative: 'Easy walk, yoga, mobility, or complete rest.',
      workedOutToday, todaySummary, metrics,
    };
  }

  if (tsb < -10 || hadHardYesterday || recentHard) {
    return {
      title: `Easy ${preferredLabel.toLowerCase()} or cross-training`,
      type: preferredLabel,
      duration: '30-45 min',
      intensity: 'Zone 2',
      status: 'maintain',
      confidence: 'high',
      reason: hadHardYesterday
        ? 'Yesterday already carried a hard training load, so today should add aerobic volume without another intensity spike.'
        : `Form is ${tsb.toFixed(1)}, which suggests useful training is fine but intensity should stay controlled.`,
      alternative: 'Technique work, mobility, or an easy spin if your legs feel flat.',
      workedOutToday, todaySummary, metrics,
    };
  }

  if (daysSinceWorkout !== null && daysSinceWorkout >= 2 && loadRatio < 0.85) {
    return {
      title: 'Productive aerobic build',
      type: preferredLabel,
      duration: '45-60 min',
      intensity: 'Zone 2 with 4-6 relaxed pickups',
      status: 'build',
      confidence: 'medium',
      reason: `You have had ${daysSinceWorkout} days since the last logged workout and this week is below baseline, so a steady build session fits.`,
      alternative: 'Strength training if you want lower impact today.',
      workedOutToday, todaySummary, metrics,
    };
  }

  if (tsb > 8 && loadRatio <= 1.1) {
    return {
      title: 'Quality workout',
      type: preferredType === 'WeightTraining' ? 'Weights' : preferredLabel,
      duration: preferredType === 'WeightTraining' ? '45-60 min' : '40-55 min',
      intensity: preferredType === 'WeightTraining' ? 'Moderate-heavy, leave 1-2 reps in reserve' : 'Tempo or intervals, Zone 3-4',
      status: 'push',
      confidence: 'medium',
      reason: `Form is positive at ${tsb.toFixed(1)} and weekly load is not above baseline, so you look fresh enough for quality work.`,
      alternative: 'If sleep or soreness is poor, swap to 35-45 min Zone 2.',
      workedOutToday, todaySummary, metrics,
    };
  }

  return {
    title: 'Steady maintenance session',
    type: preferredLabel,
    duration: '35-50 min',
    intensity: 'Zone 2-3',
    status: 'build',
    confidence: 'medium',
    reason: `Form is balanced at ${tsb.toFixed(1)} and weekly load is near baseline, so a moderate session keeps momentum without forcing recovery debt.`,
    alternative: 'Short strength session or mobility if you want a lighter day.',
    workedOutToday, todaySummary, metrics,
  };
}
