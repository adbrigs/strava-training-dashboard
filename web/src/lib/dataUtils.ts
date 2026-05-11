import Papa from 'papaparse';
import type { Activity, PR } from './types';

export const ACTIVITY_COLORS: Record<string, string> = {
  WeightTraining: '#c4f24e',
  Run:            '#ff7a3d',
  Tennis:         '#4fd1c5',
  Ride:           '#b794f4',
  Walk:           '#6b7280',
  Yoga:           '#f0a9d1',
  Pickleball:     '#f5b942',
  RockClimbing:   '#ff4d6d',
  Hike:           '#5b9eff',
  StairStepper:   '#ee84ff',
  HighIntensityIntervalTraining: '#ff5470',
  Swim:           '#38bdf8',
  VirtualRide:    '#a78bfa',
  Workout:        '#94a3b8',
  EllipticalTrainer: '#fb923c',
  Rowing:         '#34d399',
};

const DEFAULT_COLOR = '#94a3b8';

export const ACTIVITY_LABELS: Record<string, string> = {
  WeightTraining: 'Weights',
  Run:            'Run',
  Tennis:         'Tennis',
  Ride:           'Ride',
  Walk:           'Walk',
  Yoga:           'Yoga',
  Pickleball:     'Pickleball',
  RockClimbing:   'Climbing',
  Hike:           'Hike',
  StairStepper:   'Stairs',
  HighIntensityIntervalTraining: 'HIIT',
  Swim:           'Swim',
  VirtualRide:    'Virtual Ride',
  Workout:        'Workout',
  EllipticalTrainer: 'Elliptical',
  Rowing:         'Rowing',
};

function normalizeKey(col: string): string {
  return col.trim().toLowerCase().replace(/ /g, '_').replace(/[()]/g, '');
}

function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseActivities(csvText: string): Activity[] {
  const result = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  return result.data
    .map((row) => {
      const r: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) r[normalizeKey(k)] = v ?? '';

      const date = new Date(r.start_date_local_formatted);
      if (isNaN(date.getTime())) return null;

      const type = r.sport_type || 'Workout';
      const hrZoneRaw = parseFloat(r['hr_zone_1-5']);
      const duration = parseFloat(r.moving_time_minutes) || 0;
      const paceRaw = parseFloat(r.pace_min_per_mile);
      const distanceMiles = parseFloat(r.distance_miles) || 0;

      return {
        id: r.id || String(date.getTime()),
        date,
        week: weekStart(date),
        name: r.name || type,
        type,
        color: ACTIVITY_COLORS[type] || DEFAULT_COLOR,
        distance: distanceMiles,
        duration,
        pace: paceRaw > 0 && paceRaw < 60 ? paceRaw : null,
        elevation: parseFloat(r.elevation_gain_feet) || 0,
        avgHr: parseFloat(r.average_heartrate) || 0,
        maxHr: parseFloat(r.max_heartrate) || 0,
        hrRatio: parseFloat(r['hr_ratio_0-1']) || 0,
        zone: isNaN(hrZoneRaw) ? 1 : Math.max(1, Math.min(5, hrZoneRaw)),
        trimp: parseFloat(r.trimp_score) || 0,
      } as Activity;
    })
    .filter((a): a is Activity => a !== null);
}

export function computePRs(all: Activity[], today: Date): PR[] {
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recent = all.filter(a => a.date >= thirtyDaysAgo);

  const prs: PR[] = [];

  // Longest run
  const runs = all.filter(a => a.type === 'Run' && a.distance > 0);
  const recentRuns = recent.filter(a => a.type === 'Run' && a.distance > 0);
  if (runs.length > 0) {
    const best = runs.reduce((b, a) => a.distance > b.distance ? a : b);
    const recentBest = recentRuns.length > 0 ? recentRuns.reduce((b, a) => a.distance > b.distance ? a : b) : null;
    const isFresh = recentBest?.id === best.id;
    const prev = runs.filter(a => a.id !== best.id).sort((a, b) => b.distance - a.distance)[0];
    prs.push({
      kind: 'longest_run', name: 'Longest run', iconKey: 'arrowR',
      value: `${best.distance.toFixed(2)} mi`,
      date: best.date,
      delta: prev ? `+${(best.distance - prev.distance).toFixed(1)} mi over prev` : 'all-time best',
      color: ACTIVITY_COLORS.Run,
      fresh: isFresh,
    });
  }

  // Fastest run pace (lower is better)
  if (runs.filter(a => a.pace).length > 0) {
    const fastRuns = runs.filter(a => a.pace && a.distance >= 0.5);
    if (fastRuns.length > 0) {
      const best = fastRuns.reduce((b, a) => (a.pace! < b.pace!) ? a : b);
      const recentBest = recentRuns.filter(a => a.pace && a.distance >= 0.5);
      const isFresh = recentBest.some(a => a.id === best.id);
      const m = Math.floor(best.pace!), s = Math.round((best.pace! - m) * 60);
      prs.push({
        kind: 'fastest_pace', name: 'Fastest run pace', iconKey: 'bolt',
        value: `${m}:${String(s).padStart(2, '0')} /mi`,
        date: best.date,
        delta: 'best recorded',
        color: ACTIVITY_COLORS.Run,
        fresh: isFresh,
      });
    }
  }

  // Max HR
  const hrActivities = all.filter(a => a.maxHr > 0);
  if (hrActivities.length > 0) {
    const best = hrActivities.reduce((b, a) => a.maxHr > b.maxHr ? a : b);
    const isFresh = recent.some(a => a.id === best.id);
    prs.push({
      kind: 'max_hr', name: 'Max HR recorded', iconKey: 'heart',
      value: `${best.maxHr} bpm`,
      date: best.date,
      delta: 'personal best',
      color: '#ff5470',
      fresh: isFresh,
    });
  }

  // Peak TRIMP session
  const trimpActivities = all.filter(a => a.trimp > 0);
  if (trimpActivities.length > 0) {
    const best = trimpActivities.reduce((b, a) => a.trimp > b.trimp ? a : b);
    const isFresh = recent.some(a => a.id === best.id);
    prs.push({
      kind: 'peak_trimp', name: 'Peak TRIMP session', iconKey: 'chart',
      value: best.trimp.toFixed(0),
      date: best.date,
      delta: 'all-time peak',
      color: '#c4f24e',
      fresh: isFresh,
    });
  }

  // Streak
  const { current: streak, max: maxStreak } = computeStreaks(all, today);
  if (all.length > 0) {
    const latestDate = all.reduce((b, a) => a.date > b ? a.date : b, all[0].date);
    prs.push({
      kind: 'streak', name: 'Workout streak', iconKey: 'flame',
      value: `${streak} days`,
      date: latestDate,
      delta: `best ${maxStreak} days`,
      color: '#f5b942',
      fresh: streak > 0,
    });
  }

  // Peak weekly TRIMP
  const weekMap = new Map<string, { total: number; weekStart: Date }>();
  for (const a of all) {
    const k = dateKey(a.week);
    if (!weekMap.has(k)) weekMap.set(k, { total: 0, weekStart: a.week });
    weekMap.get(k)!.total += a.trimp;
  }
  if (weekMap.size > 0) {
    const weeks = Array.from(weekMap.values());
    const best = weeks.reduce((b, a) => a.total > b.total ? a : b);
    const recentWeeks = weeks.filter(w => w.weekStart >= thirtyDaysAgo);
    const isFresh = recentWeeks.some(w => w.total === best.total);
    const avg = weeks.reduce((s, w) => s + w.total, 0) / weeks.length;
    prs.push({
      kind: 'weekly_trimp', name: 'Weekly TRIMP peak', iconKey: 'chart',
      value: best.total.toFixed(0),
      date: best.weekStart,
      delta: `+${((best.total / avg - 1) * 100).toFixed(0)}% vs avg`,
      color: '#c4f24e',
      fresh: isFresh,
    });
  }

  return prs.slice(0, 6);
}

export function computeStreaks(activities: Activity[], today: Date): { current: number; max: number } {
  const set = new Set(activities.map(a => dateKey(a.date)));
  let maxStreak = 0, run = 0;
  const start = new Date(today.getFullYear(), 0, 1);
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    if (set.has(dateKey(d))) { run++; maxStreak = Math.max(maxStreak, run); } else run = 0;
  }
  let current = 0;
  for (let d = new Date(today); ; d.setDate(d.getDate() - 1)) {
    if (set.has(dateKey(d))) current++; else break;
    if (current > 365) break;
  }
  return { current, max: maxStreak };
}

export function fmtNum(n: number, digits = 0): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPace(decMin: number): string {
  if (!decMin || !isFinite(decMin)) return '—';
  const m = Math.floor(decMin), s = Math.round((decMin - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(d: Date, opts?: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString(undefined, opts || { month: 'short', day: 'numeric' });
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
