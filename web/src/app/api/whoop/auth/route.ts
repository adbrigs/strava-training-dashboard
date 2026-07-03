import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return new NextResponse('WHOOP_CLIENT_ID and WHOOP_REDIRECT_URI must be set', { status: 500 });
  }

  // mode=cron mints an INDEPENDENT refresh-token grant for the GitHub Actions
  // workflow. The resulting token is shown for copying into the WHOOP_REFRESH_TOKEN
  // secret — it is never stored in the browser session, so its rotating lineage
  // can never collide with the live dashboard's token.
  // WHOOP rejects state values shorter than 8 characters (invalid_state), so
  // both values below are deliberately long enough.
  const mode = req.nextUrl.searchParams.get('mode');
  const state = mode === 'cron' ? 'cron-token' : 'dashboard';

  const url = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'offline read:recovery read:sleep read:cycles read:body_measurement read:workout');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}
