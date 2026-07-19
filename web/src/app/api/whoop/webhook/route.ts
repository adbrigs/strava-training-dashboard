import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GITHUB_OWNER = 'adbrigs';
const GITHUB_REPO  = 'strava-training-dashboard';

// WHOOP v2 puts the event category in `type` (NOT `event`) using
// `<resource>.updated` names: workout.updated, sleep.updated, recovery.updated.
// There are no cycle/strain/body-measurement webhooks.
export async function POST(request: NextRequest) {
  let event: { user_id?: number; id?: number | string; type?: string; trace_id?: string };
  try {
    event = await request.json();
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const relevant = ['workout.updated', 'sleep.updated', 'recovery.updated'];
  if (!relevant.includes(event.type ?? '')) {
    return new NextResponse('OK', { status: 200 });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          event_type: 'whoop-data',
          client_payload: { event: event.type },
        }),
      },
    );
    if (!res.ok) {
      console.error(`GitHub dispatch failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error('GitHub dispatch error:', err);
  }

  return new NextResponse('OK', { status: 200 });
}
