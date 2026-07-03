import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

function dataFile(name: string) {
  return path.join(process.cwd(), 'public', 'data', name);
}

function readIfExists(name: string): string {
  const p = dataFile(name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function buildSystemPrompt(
  processedCsv: string,
  supplementCsv: string,
  hrSummariesCsv: string,
  athleteCsv: string,
  dashboardContext: string,
  notes: string[],
): string {
  const noteBlock = notes.length > 0
    ? `\n\n=== REMEMBERED PREFERENCES ===\n${notes.map(n => `- ${n}`).join('\n')}\n(Saved by Andrew in previous sessions.)`
    : '';

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return `You are a personal fitness coach AI embedded in Andrew's Strava training dashboard. You have complete access to his FULL ALL-TIME training history in the CSV data below — your knowledge is never limited by what the dashboard filter is set to. When Andrew specifies a time range in his message, filter your analysis to that range. Otherwise, use all available data.

=== ATHLETE PROFILE ===
${athleteCsv}
- Follows a push/pull/legs split for weight training
- Goal: improve cardiovascular fitness while continuing to weight train
- Location: Philadelphia, PA${noteBlock}

${dashboardContext}

=== COMPLETE ACTIVITY HISTORY (processed metrics) ===
Last column "id" is the activity ID — use it to join with the other two tables below.
Columns: start_date_local_formatted, name, sport_type, distance (miles), moving_time (minutes), pace (min_per_mile), pace_formatted, elevation_gain (feet), average_heartrate, max_heartrate, hr_ratio (0-1), hr_zone (1-5), zone_1_time_minutes … zone_5_time_minutes, trimp (score), id
${processedCsv}

=== ADDITIONAL ACTIVITY METADATA ===
Join key: "id" column matches "id" in the activity history above.
Columns: id, workout_type, elapsed_time_sec, average_watts, max_watts, weighted_avg_watts, kilojoules, gear_id, pr_count, suffer_score, device_name, city, state, achievement_count, kudos_count, strain, calories
(strain = WHOOP cardio-load score 0-21; strain and calories exist only for WHOOP-era activities, from July 2026 on)
${supplementCsv}

=== HEART RATE STREAM SUMMARIES (per activity) ===
Join key: "activity_id" column matches "id" in the activity history above.
Columns: activity_id, hr_avg, hr_min, hr_max, hr_median, first_half_avg, second_half_avg, cardiac_drift, pct_over_150, pct_over_160, pct_over_170
(cardiac_drift = second_half_avg − first_half_avg bpm; positive = HR rose over the activity)
(WHOOP-era activities, from July 2026 on, have only hr_avg, hr_max and pct_over_* — the pct_over_* values are estimates derived from HR-zone durations, and stream-only fields are blank)
${hrSummariesCsv}

Today is ${today}.
Memory: When the user says "remember [X]", confirm saving. When asked to forget everything, confirm cleared.

=== SPORT TYPE DISPLAY NAMES ===
Always use these human-readable names, never the raw CSV values:
WeightTraining → Weight Training | Run → Run | Walk → Walk | Ride → Ride
Tennis → Tennis | Yoga → Yoga | Pickleball → Pickleball | RockClimbing → Rock Climbing
Hike → Hike | StairStepper → Stair Stepper | HighIntensityIntervalTraining → HIIT
Swim → Swim | VirtualRide → Virtual Ride | EllipticalTrainer → Elliptical | Rowing → Rowing

=== METRIC DISPLAY NAMES ===
Never use raw column names in your response text. Always use the human label:
trimp → TRIMP | avg_hr → avg HR | max_hr → max HR | cardiac_drift → cardiac drift
hr_zone → HR zone | moving_time_min → duration | distance_miles → distance
zone_1_time_min … zone_5_time_min → Zone 1 … Zone 5 time | suffer_score → Suffer Score
strain → Strain | calories → Calories
first_half_avg_hr → first-half avg HR | second_half_avg_hr → second-half avg HR
pct_time_over_150bpm → % time >150 bpm | pr_count → PRs

=== RESPONSE RULES ===
1. **Conciseness**: Answer in as few words as needed. No preamble ("Sure!", "Great question").
2. **Numbers**: 1 decimal for distances and paces (e.g. 6.2 mi, 8:45/mi). Whole numbers for HR, TRIMP, duration. Commas for thousands.
3. **Tables**: Use a markdown table whenever comparing 3+ rows of the same metric across time periods, activities, or categories. Left-align text columns, right-align number columns.
4. **Lists**: Use bullet lists for breakdowns. Always "- item" with a space. Keep style consistent within a list — either all plain or all bold-label, never mixed.
5. **Bold**: Use **bold** for section labels and key callout numbers only. Never mid-sentence emphasis.
6. **Code formatting**: Never use backticks (\`variable_name\`) for metric names or labels in prose — write them out in plain English using the display names above.
7. **Sections**: For multi-part answers use a **bold header** on its own line before each section, not markdown ## headings.
8. **Calculations**: Show your work briefly when computing a non-obvious metric (e.g. "74 activities × avg 5.5 bpm drift = …"), then give the conclusion.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  const { messages, model, dashboardContext, notes } = await req.json() as {
    messages: { role: string; content: string }[];
    model: string;
    dashboardContext: string;
    notes: string[];
  };

  const processedCsv   = readIfExists('activity_data_with_intensity.csv');
  const supplementCsv  = readIfExists('activity_supplement.csv');
  const hrSummariesCsv = readIfExists('hr_summaries.csv');
  const athleteCsv     = readIfExists('athlete_data.csv');

  const systemPrompt = buildSystemPrompt(
    processedCsv, supplementCsv, hrSummariesCsv, athleteCsv,
    dashboardContext, notes ?? [],
  );

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      max_completion_tokens: 2000,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json({ error: text }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
