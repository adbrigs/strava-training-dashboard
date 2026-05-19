// Generates two supplementary data files for the Coach AI chatbot:
//   public/data/hr_summaries.csv       — per-activity HR stats from hr_streams.json
//   public/data/activity_supplement.csv — extra Strava columns (watts, suffer score, etc.)
//   public/data/athlete_data.csv        — athlete profile
//
// Run: node scripts/prepare-chat-data.js
// (from the web/ directory)

const fs   = require('fs');
const path = require('path');

const DATA_SRC  = path.join(__dirname, '..', '..', 'Training_Intensity_Report', 'dashboard', 'data');
const DATA_DEST = path.join(__dirname, '..', 'public', 'data');

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const lines  = text.split('\n').filter(Boolean);
  const header = splitCsvRow(lines[0]);
  return lines.slice(1).map(line => {
    const cols = splitCsvRow(line);
    const obj  = {};
    header.forEach((h, i) => { obj[h.trim()] = (cols[i] || '').trim(); });
    return obj;
  });
}

function splitCsvRow(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

function toCsvRow(values) {
  return values.map(v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

// ---------------------------------------------------------------------------
// 1. HR summaries from hr_streams.json
// ---------------------------------------------------------------------------
function buildHrSummaries() {
  const srcFile = path.join(DATA_SRC, 'hr_streams.json');
  if (!fs.existsSync(srcFile)) {
    console.warn('hr_streams.json not found — skipping HR summaries');
    return;
  }

  console.log('Reading hr_streams.json…');
  const streams = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
  const actIds  = Object.keys(streams);
  console.log(`  ${actIds.length} activities`);

  const header = [
    'activity_id', 'hr_avg', 'hr_min', 'hr_max', 'hr_median',
    'first_half_avg', 'second_half_avg', 'cardiac_drift',
    'pct_over_150', 'pct_over_160', 'pct_over_170',
  ];
  const rows = [header.join(',')];

  for (const id of actIds) {
    const { heartrate: hrs, time: times } = streams[id];
    if (!hrs || hrs.length === 0) continue;

    const n       = hrs.length;
    const hrSort  = [...hrs].sort((a, b) => a - b);
    const median  = hrSort[Math.floor(n / 2)];
    const avg     = hrs.reduce((s, v) => s + v, 0) / n;
    const min     = hrSort[0];
    const max     = hrSort[hrSort.length - 1];

    // cardiac drift: compare first vs second half by time
    const totalTime = times[times.length - 1];
    const midTime   = totalTime / 2;
    let s1 = 0, c1 = 0, s2 = 0, c2 = 0;
    for (let i = 0; i < n; i++) {
      if (times[i] <= midTime) { s1 += hrs[i]; c1++; }
      else                     { s2 += hrs[i]; c2++; }
    }
    const firstHalfAvg  = c1 > 0 ? s1 / c1 : avg;
    const secondHalfAvg = c2 > 0 ? s2 / c2 : avg;
    const drift         = secondHalfAvg - firstHalfAvg;

    const pct150 = (hrs.filter(h => h > 150).length / n * 100).toFixed(1);
    const pct160 = (hrs.filter(h => h > 160).length / n * 100).toFixed(1);
    const pct170 = (hrs.filter(h => h > 170).length / n * 100).toFixed(1);

    rows.push(toCsvRow([
      id,
      avg.toFixed(1), min, max, median,
      firstHalfAvg.toFixed(1), secondHalfAvg.toFixed(1), drift.toFixed(1),
      pct150, pct160, pct170,
    ]));
  }

  const dest = path.join(DATA_DEST, 'hr_summaries.csv');
  fs.writeFileSync(dest, rows.join('\n'));
  console.log(`  → ${dest} (${rows.length - 1} rows)`);
}

// ---------------------------------------------------------------------------
// 2. Activity supplement — extra Strava columns not in the processed CSV
// ---------------------------------------------------------------------------
const SUPPLEMENT_COLS = [
  'id', 'workout_type', 'elapsed_time',
  'average_watts', 'max_watts', 'weighted_average_watts', 'kilojoules',
  'gear_id', 'pr_count', 'suffer_score', 'device_name',
  'location_city', 'location_state',
  'achievement_count', 'kudos_count',
];

function buildSupplement() {
  const srcFile = path.join(DATA_SRC, 'all_activities_rawdata.csv');
  if (!fs.existsSync(srcFile)) {
    console.warn('all_activities_rawdata.csv not found — skipping supplement');
    return;
  }

  console.log('Reading all_activities_rawdata.csv…');
  const text = fs.readFileSync(srcFile, 'utf8');
  const rows = parseCsv(text);
  console.log(`  ${rows.length} rows`);

  const lines = [SUPPLEMENT_COLS.join(',')];
  for (const row of rows) {
    lines.push(toCsvRow(SUPPLEMENT_COLS.map(col => row[col] ?? '')));
  }

  const dest = path.join(DATA_DEST, 'activity_supplement.csv');
  fs.writeFileSync(dest, lines.join('\n'));
  console.log(`  → ${dest} (${lines.length - 1} rows)`);
}

// ---------------------------------------------------------------------------
// 3. Athlete data
// ---------------------------------------------------------------------------
function copyAthleteData() {
  const src  = path.join(DATA_SRC, 'athlete_data.csv');
  const dest = path.join(DATA_DEST, 'athlete_data.csv');
  if (!fs.existsSync(src)) { console.warn('athlete_data.csv not found'); return; }
  fs.copyFileSync(src, dest);
  console.log(`  → ${dest}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
fs.mkdirSync(DATA_DEST, { recursive: true });
buildHrSummaries();
buildSupplement();
copyAthleteData();
console.log('Done.');
