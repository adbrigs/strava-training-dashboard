import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GITHUB_OWNER = 'adbrigs';
const GITHUB_REPO  = 'strava-training-dashboard';

// WHOOP sends events for: recovery.score.updated, sleep.score.updated,
// workout.score.updated, cycle.score.updated
export async function POST(request: NextRequest) {
  let event: { user_id?: number; event?: string; type?: string };
  try {
    event = await request.json();
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const relevant = ['recovery.score.updated', 'sleep.score.updated', 'cycle.score.updated'];
  if (!relevant.includes(event.event ?? '')) {
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
          client_payload: { event: event.event },
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
