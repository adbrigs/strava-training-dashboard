import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GITHUB_OWNER = 'adbrigs';
const GITHUB_REPO = 'strava-training-dashboard';

// The Vercel filesystem is read-only, so the dashboard cannot write
// whoop_history.json directly (doing so throws EROFS). Instead, trigger the
// GitHub Actions data-refresh workflow — the same repository_dispatch the WHOOP
// webhook fires — which fetches the full history server-side, commits it, and
// redeploys. Data lands in Trends/Calendar within a couple of minutes.
export async function POST() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_DISPATCH_TOKEN is not configured' }, { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event_type: 'whoop-data' }),
    },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: `GitHub dispatch failed: ${res.status} ${await res.text()}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, triggered: true });
}
