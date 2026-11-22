---
date: 2026-11-21
status: draft
author: Andrew Briglia
---

# Requirements: WHOOP Strain Column in Activity Details Table

## Problem Statement

The Activity Details table on brig-trains.vercel.app shows TRIMP, HR and zone data for each activity, but not the WHOOP strain score for workouts pulled from WHOOP. Strain is already captured by the pipeline, but it is not visible in the table.

## Goals

- Show WHOOP strain for each WHOOP-sourced activity as its own column in the Activity Details table.

## Non-Goals

- No changes to the WHOOP fetch pipeline (`fetch_whoop.py`) or to `activity_data_with_intensity.csv`.
- No backfilling strain for Strava-era activities (before 2026-07-02).
- No color scale or strain-band styling.
- No new charts or summary stats using strain.

## Functional Requirements

### Data

1. The dashboard fetches `/data/activity_supplement.csv` in addition to `activity_data_with_intensity.csv`.
2. Strain is matched to each activity by `id` (supplement `id` column to `Activity.id`).
3. `Activity` type gains an optional `strain: number | null` field, populated from the supplement `strain` column. Blank or non-numeric values become `null`.
4. If the supplement CSV fails to load, the table still renders with strain shown as "—" (no error state).

### Table

1. New column "Strain" placed immediately after "TRIMP" (order: Date, Activity, Sport, TRIMP, Strain, Dist, Time, Pace, Avg HR, Max HR, Top/2nd/3rd Zone).
2. Values are right-aligned numeric cells, formatted to one decimal (e.g. `4.4`).
3. Activities with no strain (all Strava-era rows, unscored WHOOP rows) display "—".
4. The column is sortable. Clicking the header follows the existing sort behavior; rows with no strain sort to the bottom.
5. Existing "No activities match" row uses `COLS.length`, so it spans the new column automatically.

## Constraints & Assumptions

- The current UI is the Next.js app in `web/`; `web/AGENTS.md` warns of Next.js breaking changes, so consult `node_modules/next/dist/docs/` before writing code.
- Strain exists only for WHOOP workouts; supplement rows with `device_name` = WHOOP have strain populated (about 305 WHOOP rows at time of writing).
- Strain is WHOOP's 0–21 scale; no conversion or normalization.

## User Flows

### Viewing strain

1. User opens the dashboard and scrolls to Activity Details.
2. Each WHOOP activity shows its strain next to TRIMP; older activities show "—".
3. User clicks "Strain" header to sort highest-first, and again to reverse.

## Open Questions

None.

## References

- `web/src/components/ActivityTable.tsx` (COLS, row rendering)
- `web/src/components/Dashboard.tsx:147` (CSV load)
- `web/src/lib/types.ts` (`Activity`)
- `web/src/lib/dataUtils.ts` (`parseActivities`)
- `Training_Intensity_Report/dashboard/fetch_whoop.py:267` (`update_supplement_csv` writes strain)
- `web/public/data/activity_supplement.csv`
