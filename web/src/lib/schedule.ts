// Shared browser copy of the saved schedule changes. Every widget on the page
// reads the same copy; edits show immediately and are saved through /api/plan,
// which writes them to Upstash Redis. The swap rules live in scheduleRules.ts.

import { useMemo, useSyncExternalStore } from 'react';
import type { Activity } from './types';
import { sessionsByActivity, type ActivityTags, type DayOverrides, type LoggedSession } from './trainingPlan';
import { applyChanges, applyTagChanges, type DayChanges, type TagChanges } from './scheduleRules';

export * from './scheduleRules';

// ─── Shared client store ─────────────────────────────────────────────────────

export type ScheduleStatus = 'loading' | 'ready' | 'saving' | 'unavailable' | 'error';
interface ScheduleState { overrides: DayOverrides; tags: ActivityTags; status: ScheduleStatus; message: string | null }

const EMPTY: ScheduleState = { overrides: {}, tags: {}, status: 'loading', message: null };
let state: ScheduleState = EMPTY;
let loadStarted = false;
const listeners = new Set<() => void>();

function setState(next: Partial<ScheduleState>) {
  state = { ...state, ...next };
  listeners.forEach(l => l());
}

async function load() {
  try {
    const res = await fetch('/api/plan', { cache: 'no-store' });
    if (res.status === 503) { setState({ status: 'unavailable', message: 'Schedule changes are unavailable right now.' }); return; }
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json() as { days?: DayOverrides; tags?: ActivityTags };
    setState({ overrides: data.days ?? {}, tags: data.tags ?? {}, status: 'ready', message: null });
  } catch {
    setState({ status: 'unavailable', message: 'Couldn’t load your schedule changes. Showing the standard plan.' });
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!loadStarted && typeof window !== 'undefined') { loadStarted = true; void load(); }
  return () => { listeners.delete(l); };
}

/** Saved schedule changes, shared by every widget on the page. */
export function useSchedule(): ScheduleState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** Which session each workout counted as (tag, else auto-match to the plan). */
export function useActivitySessions(activities: Activity[]): Map<string, LoggedSession> {
  const { overrides, tags } = useSchedule();
  return useMemo(() => sessionsByActivity(activities, overrides, tags), [activities, overrides, tags]);
}

/** Apply edits on screen immediately, then save; roll back if the save fails. */
async function save(changes: DayChanges, tagChanges: TagChanges): Promise<boolean> {
  if (Object.keys(changes).length + Object.keys(tagChanges).length === 0) return true;
  const before = { overrides: state.overrides, tags: state.tags };
  const optimistic = {
    overrides: applyChanges(before.overrides, changes),
    tags: applyTagChanges(before.tags, tagChanges),
  };
  setState({ ...optimistic, status: 'saving', message: null });
  try {
    const res = await fetch('/api/plan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(Object.keys(changes).length ? { changes } : {}),
        ...(Object.keys(tagChanges).length ? { tags: tagChanges } : {}),
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json() as { days?: DayOverrides; tags?: ActivityTags };
    setState({
      overrides: data.days ?? optimistic.overrides,
      tags: data.tags ?? optimistic.tags,
      status: 'ready', message: null,
    });
    return true;
  } catch {
    setState({ ...before, status: 'error', message: 'Couldn’t save that change. Try again.' });
    return false;
  }
}

/** Save day swaps / extra sessions. */
export function saveChanges(changes: DayChanges): Promise<boolean> {
  return save(changes, {});
}

/** Save which session logged workouts were (null = back to automatic). */
export function saveTags(tagChanges: TagChanges): Promise<boolean> {
  return save({}, tagChanges);
}
