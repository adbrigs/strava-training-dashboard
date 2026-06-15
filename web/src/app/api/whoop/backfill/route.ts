import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.prod.whoop.com/developer/v2';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const isProd = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = { httpOnly: true, path: '/', sameSite: 'lax' as const, secure: isProd };

type TokenSet = { access_token: string; refresh_token: string; expires_in: number };

async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
      redirect_uri:  process.env.WHOOP_REDIRECT_URI!,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

interface PaginateResult {
  records: unknown[];
  firstStatus: number;
  firstBody: unknown;
}
interface FetchJsonResult {
  status: number;
  body: unknown;
  error?: string;
}

async function paginate(endpoint: string, token: string): Promise<PaginateResult> {
  const records: unknown[] = [];
  let nextToken: string | null = null;
  let firstStatus = 0;
  let firstBody: unknown = null;

  while (true) {
    const url = new URL(`${API_BASE}${endpoint}`);
    url.searchParams.set('limit', '25');
    if (nextToken) url.searchParams.set('nextToken', nextToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const bodyText = await res.text();
    let bodyJson: unknown;
    try { bodyJson = JSON.parse(bodyText); } catch { bodyJson = bodyText; }

    if (firstStatus === 0) {
      firstStatus = res.status;
      firstBody = bodyJson;
    }

    if (res.status === 404) break;
    if (!res.ok) {
      const err = Object.assign(new Error(`${endpoint} → ${res.status}: ${bodyText}`), { status: res.status });
      throw err;
    }

    const data = bodyJson as { records?: unknown[]; next_token?: string | null };
    records.push(...(data.records ?? []));
    nextToken = data.next_token ?? null;
    if (!nextToken) break;
  }

  return { records, firstStatus, firstBody };
}

async function fetchJson(endpoint: string, token: string): Promise<FetchJsonResult> {
  const res = await fetch(`${API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
  const bodyText = await res.text();
  let bodyJson: unknown;
  try { bodyJson = JSON.parse(bodyText); } catch { bodyJson = bodyText; }

  if (res.status === 404) return { status: res.status, body: null };
  if (!res.ok) {
    const err = Object.assign(new Error(`${endpoint} → ${res.status}: ${bodyText}`), { status: res.status });
    throw err;
  }

  return { status: res.status, body: bodyJson };
}

interface RecoveryRecord {
  created_at: string; score_state: string;
  score?: { recovery_score: number; hrv_rmssd_milli: number; resting_heart_rate: number };
}
interface SleepRecord {
  start: string; score_state: string; nap?: boolean;
  score?: {
    stage_summary: { total_in_bed_time_milli: number; total_awake_time_milli: number };
    sleep_performance_percentage: number;
  };
}
interface CycleRecord {
  start: string; score_state: string;
  score?: { strain: number };
}
interface BodyMeasurement {
  weight_kilogram?: number;
  height_meter?: number;
  max_heart_rate?: number;
}

export async function POST(req: NextRequest) {
  let accessToken  = req.cookies.get('whoop_access')?.value;
  const refreshToken = req.cookies.get('whoop_refresh')?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ error: 'Not connected to WHOOP — please reconnect.' }, { status: 401 });
  }

  let latestTokens: TokenSet | null = null;

  if (!accessToken) {
    try {
      latestTokens = await refreshTokens(refreshToken!);
      accessToken  = latestTokens.access_token;
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  async function fetch401Retry(endpoint: string): Promise<PaginateResult> {
    try {
      return await paginate(endpoint, accessToken!);
    } catch (err) {
      if ((err as { status?: number }).status === 401 && refreshToken) {
        latestTokens = await refreshTokens(refreshToken);
        accessToken  = latestTokens.access_token;
        return paginate(endpoint, accessToken);
      }
      throw err;
    }
  }

  async function fetchJson401Retry(endpoint: string): Promise<FetchJsonResult> {
    try {
      return await fetchJson(endpoint, accessToken!);
    } catch (err) {
      if ((err as { status?: number }).status === 401 && refreshToken) {
        latestTokens = await refreshTokens(refreshToken);
        accessToken  = latestTokens.access_token;
        return fetchJson(endpoint, accessToken);
      }
      throw err;
    }
  }

  try {
    // Run sequentially for clean diagnostics
    const recoveryResult = await fetch401Retry('/recovery');
    const sleepResult    = await fetch401Retry('/activity/sleep');
    const cycleResult    = await fetch401Retry('/cycle');
    const bodyMeasurementResult = await fetchJson401Retry('/user/measurement/body')
      .catch((err) => ({ status: (err as { status?: number }).status ?? 0, body: null, error: String(err) }));

    const recoveries = recoveryResult.records as RecoveryRecord[];
    const sleeps     = sleepResult.records    as SleepRecord[];
    const cycles     = cycleResult.records    as CycleRecord[];
    const bodyMeasurement = bodyMeasurementResult.body as BodyMeasurement | null;

    const recByDate: Record<string, object> = {};
    for (const r of recoveries) {
      if (r.score_state !== 'SCORED' || !r.score) continue;
      recByDate[r.created_at.slice(0, 10)] = {
        recovery:  Math.round(r.score.recovery_score),
        hrv:       Math.round(r.score.hrv_rmssd_milli),
        restingHr: Math.round(r.score.resting_heart_rate),
      };
    }

    const slpByDate: Record<string, object> = {};
    for (const s of sleeps) {
      if (s.score_state !== 'SCORED' || !s.score || s.nap) continue;
      const st = s.score.stage_summary;
      slpByDate[s.start.slice(0, 10)] = {
        sleepMs:          st.total_in_bed_time_milli - st.total_awake_time_milli,
        sleepPerformance: Math.round(s.score.sleep_performance_percentage),
      };
    }

    const strainByDate: Record<string, object> = {};
    for (const c of cycles) {
      if (c.score_state !== 'SCORED' || !c.score) continue;
      strainByDate[c.start.slice(0, 10)] = { strain: parseFloat(c.score.strain.toFixed(1)) };
    }

    const allDates = [...new Set([
      ...Object.keys(recByDate),
      ...Object.keys(slpByDate),
      ...Object.keys(strainByDate),
    ])].sort();

    const history = allDates.map(date => ({
      date,
      ...recByDate[date],
      ...slpByDate[date],
      ...strainByDate[date],
    }));

    const outPath = path.join(process.cwd(), 'public', 'data', 'whoop_history.json');
    fs.writeFileSync(outPath, JSON.stringify(history, null, 2));

    const bodyMeasurementPath = path.join(process.cwd(), 'public', 'data', 'whoop_body_measurement.json');
    fs.writeFileSync(bodyMeasurementPath, JSON.stringify({
      weightKg: bodyMeasurement?.weight_kilogram ?? null,
      heightM: bodyMeasurement?.height_meter ?? null,
      maxHeartRate: bodyMeasurement?.max_heart_rate ?? null,
      fetchedAt: new Date().toISOString(),
    }, null, 2));

    const response = NextResponse.json({
      ok: true,
      count: history.length,
      debug: {
        recovery: { status: recoveryResult.firstStatus, raw: recoveryResult.records.length, scored: Object.keys(recByDate).length, sample: recoveryResult.firstBody },
        sleep:    { status: sleepResult.firstStatus,    raw: sleepResult.records.length,    scored: Object.keys(slpByDate).length,  sample: sleepResult.firstBody },
        cycle:    { status: cycleResult.firstStatus,    raw: cycleResult.records.length,    scored: Object.keys(strainByDate).length },
        bodyMeasurement: { status: bodyMeasurementResult.status, sample: bodyMeasurementResult.body, error: bodyMeasurementResult.error },
      },
    });
    if (latestTokens) {
      response.cookies.set('whoop_access',  latestTokens.access_token,  { ...COOKIE_OPTS, maxAge: latestTokens.expires_in });
      response.cookies.set('whoop_refresh', latestTokens.refresh_token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 30 });
    }
    return response;
  } catch (err) {
    console.error('Backfill error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
