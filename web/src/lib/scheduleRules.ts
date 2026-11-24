// Rules for schedule changes Andrew makes from the dashboard (swap a day, add
// a run). Pure functions with no network or React, so the API route can use
// the same validation. The browser store lives in schedule.ts.

import { dateKey } from './dataUtils';
import {
  EXTRA_SESSIONS, MAX_EXTRA_SESSIONS, PICKABLE_SESSIONS, TAGGABLE_SESSIONS,
  extraKeysFor, sessionKeyFor, templateKeyFor,
  type ActivityTags, type DayOverride, type DayOverrides, type SessionKey,
} from './trainingPlan';

/** Per-workout tag edits: the session it was, or null to go back to automatic. */
export type TagChanges = Record<string, SessionKey | null>;

export function applyTagChanges(tags: ActivityTags, changes: TagChanges): ActivityTags {
  const next = { ...tags };
  for (const [id, v] of Object.entries(changes)) {
    if (v) next[id] = v;
    else delete next[id];
  }
  return next;
}

/** Per-date edits: a new value for the day, or null to go back to the plan. */
export type DayChanges = Record<string, DayOverride | null>;

// ─── Rules ───────────────────────────────────────────────────────────────────

/** Store a day's state, or null when it matches the plan with nothing extra. */
function entryFor(date: Date, main: SessionKey, extra: SessionKey[]): DayOverride | null {
  if (main === templateKeyFor(date) && extra.length === 0) return null;
  return extra.length ? { main, extra } : { main };
}

/**
 * Change a day's main session. If the chosen session is already planned on
 * another day this week, the two days swap (Tue → Pull makes Thu → Push).
 * Rest never swaps; it just replaces the day.
 */
export function chooseSession(week: Date[], overrides: DayOverrides, date: Date, next: SessionKey): DayChanges {
  const current = sessionKeyFor(date, overrides);
  if (current === next) return {};
  const changes: DayChanges = {
    [dateKey(date)]: entryFor(date, next, extraKeysFor(date, overrides)),
  };
  if (next !== 'rest') {
    const others = week.filter(d => dateKey(d) !== dateKey(date));
    // Prefer a later day as the swap partner, so the week still flows forward.
    const later = others.filter(d => d.getTime() > date.getTime());
    const partner = [...later, ...others.filter(d => d.getTime() < date.getTime())]
      .find(d => sessionKeyFor(d, overrides) === next);
    if (partner) changes[dateKey(partner)] = entryFor(partner, current, extraKeysFor(partner, overrides));
  }
  return changes;
}

/**
 * Put a day back to the plan. If it was swapped with another day this week,
 * that day goes back too.
 */
export function resetDay(week: Date[], overrides: DayOverrides, date: Date): DayChanges {
  const k = dateKey(date);
  const saved = overrides[k];
  if (!saved) return {};
  const changes: DayChanges = { [k]: null };
  const partner = week.find(d => {
    const o = overrides[dateKey(d)];
    return dateKey(d) !== k && !!o
      && o.main === templateKeyFor(date)
      && templateKeyFor(d) === saved.main;
  });
  if (partner) changes[dateKey(partner)] = entryFor(partner, templateKeyFor(partner), extraKeysFor(partner, overrides));
  return changes;
}

export function addExtra(overrides: DayOverrides, date: Date, extra: SessionKey): DayChanges {
  const extras = extraKeysFor(date, overrides);
  if (extras.length >= MAX_EXTRA_SESSIONS) return {};
  return { [dateKey(date)]: entryFor(date, sessionKeyFor(date, overrides), [...extras, extra]) };
}

export function removeExtra(overrides: DayOverrides, date: Date, index: number): DayChanges {
  const extras = extraKeysFor(date, overrides).filter((_, i) => i !== index);
  return { [dateKey(date)]: entryFor(date, sessionKeyFor(date, overrides), extras) };
}

export function applyChanges(overrides: DayOverrides, changes: DayChanges): DayOverrides {
  const next = { ...overrides };
  for (const [k, v] of Object.entries(changes)) {
    if (v) next[k] = v;
    else delete next[k];
  }
  return next;
}

// ─── Validation (shared with the API route) ──────────────────────────────────

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TAG_OK = new Set<string>(TAGGABLE_SESSIONS);

/** Returns the cleaned tag edits, or null if anything in them is invalid. */
export function parseTagChanges(input: unknown): TagChanges | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 20) return null;
  const out: TagChanges = {};
  for (const [id, v] of entries) {
    if (!ID_RE.test(id)) return null;
    if (v !== null && (typeof v !== 'string' || !TAG_OK.has(v))) return null;
    out[id] = v as SessionKey | null;
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAIN_OK = new Set<string>(PICKABLE_SESSIONS);
const EXTRA_OK = new Set<string>(EXTRA_SESSIONS);

/** Returns the cleaned changes, or null if anything in them is invalid. */
export function parseChanges(input: unknown): DayChanges | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 14) return null;
  const out: DayChanges = {};
  for (const [k, v] of entries) {
    if (!DATE_RE.test(k)) return null;
    if (v === null) { out[k] = null; continue; }
    if (!v || typeof v !== 'object') return null;
    const { main, extra } = v as { main?: unknown; extra?: unknown };
    if (typeof main !== 'string' || !MAIN_OK.has(main)) return null;
    if (extra !== undefined) {
      if (!Array.isArray(extra) || extra.length > MAX_EXTRA_SESSIONS) return null;
      if (!extra.every(e => typeof e === 'string' && EXTRA_OK.has(e))) return null;
    }
    out[k] = extra && (extra as string[]).length
      ? { main: main as SessionKey, extra: extra as SessionKey[] }
      : { main: main as SessionKey };
  }
  return out;
}
