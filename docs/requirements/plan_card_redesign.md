---
date: 2026-11-23
status: built (steps 1-3 shipped Nov 23-24, 2026)
author: Andrew Briglia
---

# Requirements: Plan Card Redesign (collapsible + editable week)

## Problem Statement

The Today/Tomorrow plan card (`web/src/components/TodaysPlanSection.tsx`) is ~500px tall and mixes two jobs: the next workout's full exercise table and a week tracker with six stat tiles. The exercise list sets the height, leaving dead space on the right.

Worse, the week is fixed in code. `WEEK_TEMPLATE` and `SCHEDULE_OVERRIDES` in `web/src/lib/trainingPlan.ts` decide each day's session, so moving a workout (e.g. Pull instead of Push tomorrow) needs a code edit and redeploy. There is one session per day, and "done" only checks whether *any* lift or run happened that day, not which session it was.

Andrew uses the dashboard on both laptop and phone (phone at the gym), so changes must show on both.

## Goals

- Card is a slim band by default; the full exercise list opens on demand.
- Andrew can reshuffle the week, add an extra session, and tag a logged workout as a specific session, from the dashboard on any device, with no code change.

## Non-Goals

- No changes to the WHOOP fetch pipeline (`fetch_whoop.py`) or `activity_data_with_intensity.csv`.
- No changes to exercise programming (sets, reps, block progression, readiness adjustments).
- No user accounts or multi-user support.
- No passcode or write protection in v1. Anyone with the link could change the schedule or tags; accepted risk for a personal dashboard. Revisit if the link is shared widely.
- No changes to other dashboard sections.

## Functional Requirements

### A. Layout

1. Collapsed (default): one band ~90px tall showing day label, session name(s), lift count and duration (e.g. "Tomorrow · Tue · Pull + Easy run · 6 lifts · 60–70 min"), the 7-day week strip, and Lifts / Legs / Runs counters.
2. A "details" toggle expands the exercise list. Open/closed state is remembered per device.
3. Expanded list shows exercise name and sets × reps. Warm-up line and main-lift coaching note appear only when expanded.
4. Removed: RPE column, WHOOP "adjusts once WHOOP scores your recovery" banner, Sleep / Weight / Protein tiles.
5. Works at phone width (gym use): the expanded list is readable without horizontal scrolling.

### B. Reshuffling the week

1. Tapping a day in the week strip opens a picker: Legs A, Legs B, Push, Pull, Easy run, Quality run, Rest.
2. **Automatic swap:** picking a session that is already planned on another day in the same week swaps the two days (Tue → Pull makes Thu → Push). Picking Rest or a session not elsewhere in the week just replaces that day.
3. "+ Add session" adds a second session to a day (e.g. Easy run on top of Pull). It can be removed.
4. Each changed day has "Reset to plan", which restores the template session for that day (and undoes its swap partner).
5. Changes apply immediately and update the card, counters and the chatbot's plan context.
6. Changes save to a shared online store, so a swap made on the laptop shows on the phone after refresh.
7. The existing hard-coded `SCHEDULE_OVERRIDES` are migrated into the store (or left as fallback) so past weeks still display correctly.

### C. Tagging logged workouts

1. **Default:** a lift on a day counts as that day's planned lift session; a run counts as the planned run session.
2. Andrew can tag a logged workout with a specific session (e.g. mark Monday's WHOOP "Weightlifting" as Legs A). The tag saves to the same shared store, keyed by activity `id`.
3. A tag overrides the default for "done" status and the Lifts / Legs / Runs counters.
4. Tagging a workout that differs from the plan (e.g. Pull on a Push day) marks that session done and leaves the planned one owed for the week.
5. Tagging is available from the plan card: select a day, open Change day, and pick a session for each logged workout ("Auto" goes back to the default). Adding it to the Activity Details table is optional / later.
6. Counters and done dots come from what was logged (matched or tagged), not from the plan, so a Saturday leg make-up counts as legs and a swapped session leaves the planned one owed.

### D. Reliability

1. If the store is unreachable, the card falls back to the template plan and shows a small "changes unavailable" note; it never breaks the page.

## Architecture (plain English)

```
Phone / laptop  →  dashboard page  →  new /api/plan route  →  small hosted store
                                                            (swaps, extra sessions, tags)
```

Today the app has no database: data arrives as files committed by the GitHub Action. This adds the first small store, added through the Vercel Marketplace (specific provider chosen at build time, free tier expected). New environment variables for the store's connection details only.

## Definition of Done

- From the phone, Andrew can change tomorrow from Push to Pull (Thu becomes Push), add an Easy run, and see the same on the laptop after refresh.
- Andrew can tag today's lift as Legs A and the Legs counter reflects it.
- Collapsed card is ~90px tall; nothing else on the dashboard changes.

## Open Questions

1. Is the week Mon–Sun (current strip) or Sun–Sat? Assumed Mon–Sun.
2. Should swaps be allowed across weeks (e.g. push a missed Friday session into next Monday)? Assumed no for v1.

## Estimate

- Andrew's time: ~30 min review of a mockup, ~15 min one-time store setup in Vercel, ~1 hr testing on phone and laptop.
- Suggested build order (small, testable steps): (1) collapsed layout only, (2) store + reshuffle, (3) workout tagging.
