// Shared browser copy of the saved schedule changes. Every widget on the page
// reads the same copy; edits show immediately and are saved through /api/plan,
// which writes them to Upstash Redis. The swap rules live in scheduleRules.ts.

import { useSyncExternalStore } from 'react';
import type { DayOverrides } from './trainingPlan';
import { applyChanges, type DayChanges } from './scheduleRules';

export * from './scheduleRules';

// ─── Shared client store ─────────────────────────────────────────────────────

export type ScheduleStatus = 'loading' | 'ready' | 'saving' | 'unavailable' | 'error';
interface ScheduleState { overrides: DayOverrides; status: ScheduleStatus; message: string | null }

const EMPTY: ScheduleState = { overrides: {}, status: 'loading', message: null };
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
    const data = await res.json() as { days?: DayOverrides };
    setState({ overrides: data.days ?? {}, status: 'ready', message: null });
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

/** Apply edits on screen immediately, then save; roll back if the save fails. */
export async function saveChanges(changes: DayChanges): Promise<boolean> {
  if (Object.keys(changes).length === 0) return true;
  const before = state.overrides;
  setState({ overrides: applyChanges(before, changes), status: 'saving', message: null });
  try {
    const res = await fetch('/api/plan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json() as { days?: DayOverrides };
    setState({ overrides: data.days ?? applyChanges(before, changes), status: 'ready', message: null });
    return true;
  } catch {
    setState({ overrides: before, status: 'error', message: 'Couldn’t save that change. Try again.' });
    return false;
  }
}
