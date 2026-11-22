# WHOOP Strain Column Implementation Plan

## Overview

Add a sortable "Strain" column (after TRIMP) to the Activity Details table, populated from the existing `activity_supplement.csv` by joining on activity `id`. Requirements: `docs/requirements/whoop_strain_column.md`.

## Current State Analysis

- `fetch_whoop.py:267-283` already writes `strain` (and `calories`) per WHOOP workout into `web/public/data/activity_supplement.csv`, keyed by `id` (UUID for WHOOP rows; ~305 WHOOP rows present).
- `Dashboard.tsx:147-149` fetches only `activity_data_with_intensity.csv` and calls `parseActivities` (`dataUtils.ts:59`), which builds `Activity` objects with `id` from the CSV `id` column. The same ids are used by the supplement CSV.
- `ActivityTable.tsx` renders columns from the `COLS` array (line 9) with hand-written `<td>`s in the same order (lines 143-179), and sorts via `getVal` (line 59), where `null` values always sink to the bottom (line 69).
- `Activity` (`types.ts:1`) has no strain field.

## Desired End State

The Activity Details table shows a "Strain" column right after TRIMP. WHOOP activities show one-decimal strain (e.g. `4.4`); Strava-era and unscored rows show "—". Clicking the header sorts by strain with empties last. Verified in the browser at http://localhost:3000.

### Key Discoveries

- Sorting needs no change beyond adding `'strain'` to `SortKey`; `getVal` reads `a[k]` and treats `null` as missing (`ActivityTable.tsx:65-69`).
- The empty-state row uses `COLS.length` for `colSpan` (line 184), so it adapts automatically.
- `web/AGENTS.md`: this Next.js version has breaking changes. No new routes/APIs are involved (client-side fetch of a static file, same as the existing CSV), so docs lookup is only needed if the build complains.
- The supplement CSV has blank strain for Strava rows, so blank → `null`.

## What We're NOT Doing

- No changes to `fetch_whoop.py` or `activity_data_with_intensity.csv`.
- No Strava-era backfill, color scale, charts or new stats using strain.
- No change to the chatbot's use of the supplement CSV.

## Implementation Approach

Keep `parseActivities(csvText)` signature-compatible by adding an optional second argument (supplement CSV text). Parse the supplement into an `id → strain` map and set `strain` on each activity. Dashboard fetches both files in parallel; a supplement failure is swallowed so the table still loads.

## Phase 1: Data plumbing

### Changes Required

#### 1. Type
**File**: `web/src/lib/types.ts`
Add to `Activity`:
```ts
strain: number | null; // WHOOP strain (0-21), null when unavailable
```

#### 2. Parser
**File**: `web/src/lib/dataUtils.ts`
```ts
export function parseStrainMap(supplementCsv: string): Map<string, number> {
  const out = new Map<string, number>();
  const res = Papa.parse<Record<string, string>>(supplementCsv, { header: true, skipEmptyLines: true });
  for (const row of res.data) {
    const v = parseFloat(row.strain);
    if (row.id && Number.isFinite(v)) out.set(row.id, v);
  }
  return out;
}

export function parseActivities(csvText: string, strainById?: Map<string, number>): Activity[] {
  ...
  const id = r.id || String(date.getTime());
  return { id, ..., strain: strainById?.get(id) ?? null } as Activity;
```
(Hoist `id` into a const in the existing `.map`; keep the rest unchanged.)

#### 3. Dashboard load
**File**: `web/src/components/Dashboard.tsx` (~line 147)
```ts
const [res, supRes] = await Promise.all([
  fetch('/data/activity_data_with_intensity.csv'),
  fetch('/data/activity_supplement.csv').catch(() => null),
]);
const text = await res.text();
let strainById: Map<string, number> | undefined;
try { if (supRes?.ok) strainById = parseStrainMap(await supRes.text()); } catch {}
const parsed = parseActivities(text, strainById);
```
Import `parseStrainMap` alongside `parseActivities`.

Check for other constructors/mocks of `Activity` (`grep "as Activity\|: Activity = {"`) and add `strain: null` if any exist.

### Success Criteria

#### Automated Verification
- [x] Type check passes: `cd web && npx tsc --noEmit`
- [x] Lint passes: `cd web && npm run lint`

#### Manual Verification
- [ ] Dashboard still loads when `/data/activity_supplement.csv` is blocked (DevTools block request): table renders, no console crash.

---

## Phase 2: Table column

### Changes Required

**File**: `web/src/components/ActivityTable.tsx`

1. `SortKey` union (line 7): add `'strain'`.
2. `COLS` (after the `trimp` entry, line 13):
   ```ts
   { k: 'strain', l: 'Strain', num: true },
   ```
3. Row cells, directly after the TRIMP cell (line 149):
   ```tsx
   <td className="num">{a.strain != null ? fmtNum(a.strain, 1) : '—'}</td>
   ```

### Success Criteria

#### Automated Verification
- [x] `cd web && npx tsc --noEmit`
- [x] `cd web && npm run lint`
- [x] `cd web && npm run build`

#### Manual Verification
(`cd web && npm run dev`, open http://localhost:3000)
- [ ] "Strain" header appears right after TRIMP; columns after it are unshifted in order.
- [ ] A recent WHOOP row (e.g. Nov 21 "Lunch Football") shows a one-decimal value matching its row in `activity_supplement.csv`.
- [ ] Strava-era rows (before 2026-07-02, use the date range "All") show "—".
- [ ] Clicking Strain sorts descending, again ascending; "—" rows stay at the bottom in both directions.
- [ ] Name filter and pagination still work; "No activities match" row spans the full width.
- [ ] Table fits on screen without clipping at typical desktop width (the table is already wide; check horizontal scroll via `.table-wrap`).

---

## Testing Strategy

No test runner exists in `web/` (scripts: dev/build/start/lint), so verification is type check, lint, build and the manual steps above. Edge cases: blank strain, supplement fetch failure, WHOOP workout with strain `0.0` (must show `0.0`, not "—" — hence the `!= null` check rather than truthiness).

## Performance Considerations

One extra small static CSV fetch, parsed once on load, in parallel with the main CSV. Negligible.

## Migration Notes

None. Newly synced WHOOP workouts get strain automatically because `fetch_whoop.py` already writes it to the supplement CSV.

## References

- `docs/requirements/whoop_strain_column.md`
- `web/src/components/ActivityTable.tsx:9,59,149`
- `web/src/components/Dashboard.tsx:147`
- `web/src/lib/dataUtils.ts:59`
- `Training_Intensity_Report/dashboard/fetch_whoop.py:267`
