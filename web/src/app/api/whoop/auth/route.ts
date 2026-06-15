import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return new NextResponse('WHOOP_CLIENT_ID and WHOOP_REDIRECT_URI must be set', { status: 500 });
  }

  const url = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'offline read:recovery read:sleep read:cycles read:body_measurement');
  url.searchParams.set('state', 'dashboard');

  return NextResponse.redirect(url.toString());
}
