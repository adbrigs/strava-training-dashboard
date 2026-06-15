import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.prod.whoop.com/developer/v2';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const isProd = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = { httpOnly: true, path: '/', sameSite: 'lax' as const, secure: isProd };

interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function refresh(refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     process.env.WHOOP_CLIENT_ID!,
    client_secret: process.env.WHOOP_CLIENT_SECRET!,
    redirect_uri:  process.env.WHOOP_REDIRECT_URI!,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return res.json();
}

async function whoopGet(path: string, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 = no data scored yet for this endpoint — treat as empty
  if (res.status === 404) return { records: [] };
  if (!res.ok) {
    const err = new Error(`WHOOP ${path} returned ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function GET(req: NextRequest) {
  let accessToken = req.cookies.get('whoop_access')?.value;
  const refreshToken = req.cookies.get('whoop_refresh')?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ connected: false });
  }

  let newTokens: TokenSet | null = null;

  if (!accessToken && refreshToken) {
    try {
      newTokens = await refresh(refreshToken);
      accessToken = newTokens.access_token;
    } catch {
      return NextResponse.json({ connected: false });
    }
  }

  async function getWithRefresh(path: string) {
    try {
      return await whoopGet(path, accessToken!);
    } catch (err) {
      const e = err as { status?: number };
      if (e.status === 401 && refreshToken) {
        newTokens = await refresh(refreshToken);
        accessToken = newTokens.access_token;
        return await whoopGet(path, accessToken);
      }
      throw err;
    }
  }

  try {
    const [recoveryRes, sleepRes, cycleRes] = await Promise.all([
      getWithRefresh('/recovery?limit=1').catch(() => ({ records: [] })),
      getWithRefresh('/activity/sleep?limit=1').catch(() => ({ records: [] })),
      getWithRefresh('/cycle?limit=1').catch(() => ({ records: [] })),
    ]);

    const rec = recoveryRes.records?.[0];
    const slp = sleepRes.records?.[0];
    const cyc = cycleRes.records?.[0];

    const data = {
      connected: true,
      recovery: rec?.score_state === 'SCORED' && rec.score ? {
        score: Math.round(rec.score.recovery_score),
        hrv: Math.round(rec.score.hrv_rmssd_milli),
        restingHr: Math.round(rec.score.resting_heart_rate),
        date: rec.created_at,
      } : null,
      sleep: slp?.score_state === 'SCORED' && slp.score ? {
        durationMs: slp.score.stage_summary.total_in_bed_time_milli - slp.score.stage_summary.total_awake_time_milli,
        performance: Math.round(slp.score.sleep_performance_percentage),
        efficiency: Math.round(slp.score.sleep_efficiency_percentage),
        remMs: slp.score.stage_summary.total_rem_sleep_time_milli,
        deepMs: slp.score.stage_summary.total_slow_wave_sleep_time_milli,
        date: slp.start,
      } : null,
      strain: cyc?.score_state === 'SCORED' && cyc.score ? {
        score: parseFloat(cyc.score.strain.toFixed(1)),
        avgHr: Math.round(cyc.score.average_heart_rate),
        date: cyc.start,
      } : null,
    };

    const response = NextResponse.json(data);

    if (newTokens) {
      response.cookies.set('whoop_access', newTokens.access_token, { ...COOKIE_OPTS, maxAge: newTokens.expires_in });
      response.cookies.set('whoop_refresh', newTokens.refresh_token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 30 });
    }

    return response;
  } catch (err) {
    console.error('WHOOP data fetch error:', err);
    // Only hit if token refresh itself failed — treat as disconnected
    return NextResponse.json({ connected: false });
  }
}
