import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GITHUB_OWNER = 'adbrigs';
const GITHUB_REPO = 'strava-training-dashboard';

/**
 * GET — Strava subscription validation handshake.
 * When you create a push subscription, Strava immediately calls this endpoint
 * with hub.mode=subscribe, a hub.verify_token (which must match ours), and a
 * hub.challenge that we have to echo back as JSON.
 * https://developers.strava.com/docs/webhooks/
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.STRAVA_VERIFY_TOKEN) {
    return NextResponse.json({ 'hub.challenge': challenge });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * POST — Strava activity events.
 * Strava requires a 2xx response within 2 seconds, so we fire a GitHub
 * repository_dispatch (which kicks off the data-refresh workflow) and always
 * return 200 — even if the dispatch fails — so Strava doesn't disable the
 * subscription. The 4-hour cron remains as a safety net for any missed events.
 */
export async function POST(request: NextRequest) {
  let event: { object_type?: string; aspect_type?: string; object_id?: number };
  try {
    event = await request.json();
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const isActivityChange =
    event.object_type === 'activity' &&
    (event.aspect_type === 'create' || event.aspect_type === 'update');

  if (isActivityChange) {
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
            event_type: 'strava-activity',
            client_payload: {
              aspect_type: event.aspect_type,
              object_id: event.object_id,
            },
          }),
        },
      );
      if (!res.ok) {
        console.error(
          `GitHub dispatch failed: ${res.status} ${await res.text()}`,
        );
      }
    } catch (err) {
      console.error('GitHub dispatch error:', err);
    }
  }

  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}
