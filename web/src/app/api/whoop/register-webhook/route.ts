import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.prod.whoop.com/developer/v2';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const isProd = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = { httpOnly: true, path: '/', sameSite: 'lax' as const, secure: isProd };

type TokenSet = { access_token: string; refresh_token: string; expires_in: number };

async function doRefresh(refreshToken: string): Promise<TokenSet> {
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

// Resolve the best available access token, refreshing only if necessary.
// Returns { token, newTokens } where newTokens is non-null only when a refresh occurred.
async function resolveToken(req: NextRequest): Promise<{ token: string; newTokens: TokenSet | null } | null> {
  const accessToken  = req.cookies.get('whoop_access')?.value;
  const refreshToken = req.cookies.get('whoop_refresh')?.value;

  if (!accessToken && !refreshToken) return null;
  if (accessToken) return { token: accessToken, newTokens: null };

  // Access token missing — refresh
  const newTokens = await doRefresh(refreshToken!);
  return { token: newTokens.access_token, newTokens };
}

function withTokenCookies(response: NextResponse, tokens: TokenSet): NextResponse {
  response.cookies.set('whoop_access',  tokens.access_token,  { ...COOKIE_OPTS, maxAge: tokens.expires_in });
  response.cookies.set('whoop_refresh', tokens.refresh_token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 30 });
  return response;
}

export async function GET(req: NextRequest) {
  let resolved: Awaited<ReturnType<typeof resolveToken>>;
  try {
    resolved = await resolveToken(req);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 401 });
  }
  if (!resolved) return NextResponse.json({ registered: false });

  const { token, newTokens } = resolved;

  try {
    const res = await fetch(`${API_BASE}/webhook`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      const r = NextResponse.json({ registered: false });
      if (newTokens) withTokenCookies(r, newTokens);
      return r;
    }
    if (!res.ok) return NextResponse.json({ registered: false });
    const data = await res.json();
    const r = NextResponse.json({ registered: true, webhook: data });
    if (newTokens) withTokenCookies(r, newTokens);
    return r;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let resolved: Awaited<ReturnType<typeof resolveToken>>;
  try {
    resolved = await resolveToken(req);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 401 });
  }
  if (!resolved) return NextResponse.json({ error: 'Not connected to WHOOP' }, { status: 401 });

  const { token, newTokens } = resolved;
  const webhookUrl = `${process.env.WHOOP_REDIRECT_URI?.replace('/api/whoop/callback', '')}/api/whoop/webhook`;

  try {
    const res = await fetch(`${API_BASE}/webhook`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url:    webhookUrl,
        events: ['recovery.score.updated', 'sleep.score.updated', 'cycle.score.updated'],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `WHOOP API error: ${text}` }, { status: res.status });
    }

    const data = await res.json();
    const r = NextResponse.json({ ok: true, webhook: data });
    if (newTokens) withTokenCookies(r, newTokens);
    return r;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
