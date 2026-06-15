import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const COOKIE_OPTS = { httpOnly: true, path: '/', sameSite: 'lax' as const };
const isProd = process.env.NODE_ENV === 'production';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(new URL('/?whoop=error', req.url));
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.WHOOP_CLIENT_ID!,
    client_secret: process.env.WHOOP_CLIENT_SECRET!,
    redirect_uri: process.env.WHOOP_REDIRECT_URI!,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error('WHOOP token exchange failed:', await res.text());
    return NextResponse.redirect(new URL('/?whoop=error', req.url));
  }

  const { access_token, refresh_token, expires_in } = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const response = NextResponse.redirect(new URL('/?whoop=connected', req.url));
  response.cookies.set('whoop_access', access_token, {
    ...COOKIE_OPTS,
    secure: isProd,
    maxAge: expires_in ?? 3600,
  });
  response.cookies.set('whoop_refresh', refresh_token, {
    ...COOKIE_OPTS,
    secure: isProd,
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
