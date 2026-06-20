import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const COOKIE_OPTS = { httpOnly: true, path: '/', sameSite: 'lax' as const };
const isProd = process.env.NODE_ENV === 'production';

/** Self-contained page that shows the independent cron refresh token for copying
 *  into the WHOOP_REFRESH_TOKEN GitHub secret. The token is injected via a JSON
 *  string into script context so it can't break out of HTML. */
function cronTokenPage(refreshToken: string): string {
  const tokenJson = JSON.stringify(refreshToken);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WHOOP cron token</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0b0b0e; color:#e7e7ea; font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; display:flex; justify-content:center; }
  main { max-width:560px; padding:48px 24px; }
  h1 { font-size:20px; margin:0 0 8px; }
  p { color:#a0a0a8; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; background:#1a1a20; padding:2px 6px; border-radius:4px; color:#e7e7ea; font-size:13px; }
  textarea { width:100%; box-sizing:border-box; height:96px; margin:16px 0 8px; background:#15151a; color:#e7e7ea; border:1px solid #2a2a32; border-radius:8px; padding:12px; font-family:ui-monospace,monospace; font-size:12px; resize:none; }
  button { background:#2a2a32; color:#e7e7ea; border:1px solid #3a3a44; border-radius:8px; padding:10px 16px; font-size:14px; cursor:pointer; }
  button:hover { background:#33333d; }
  ol { color:#a0a0a8; padding-left:20px; } li { margin:6px 0; }
  .warn { color:#f0a85c; font-size:13px; margin-top:24px; }
</style></head>
<body><main>
  <h1>Independent WHOOP cron token</h1>
  <p>This token is a <strong>separate grant</strong> from your dashboard session, so rotating it in GitHub Actions will never disconnect the live dashboard.</p>
  <textarea id="t" readonly></textarea>
  <button id="c" onclick="copyTok()">Copy token</button>
  <ol>
    <li>Copy the token above.</li>
    <li>Go to GitHub → repo → <strong>Settings → Secrets and variables → Actions</strong>.</li>
    <li>Update <code>WHOOP_REFRESH_TOKEN</code> with this value.</li>
  </ol>
  <p class="warn">⚠ Do not reuse this token anywhere else — let only the GitHub workflow rotate it.</p>
</main>
<script>
  var TOKEN = ${tokenJson};
  document.getElementById('t').value = TOKEN;
  function copyTok(){ navigator.clipboard.writeText(TOKEN).then(function(){ var b=document.getElementById('c'); b.textContent='✓ Copied'; setTimeout(function(){ b.textContent='Copy token'; },1500); }); }
</script>
</body></html>`;
}

/** Error page shown when the cron-token OAuth flow fails, surfacing the actual
 *  WHOOP reason instead of a blank redirect. Detail is injected via a JSON
 *  string into script context so it can't break out of HTML. */
function cronMessagePage(title: string, detail: string): string {
  const detailJson = JSON.stringify(detail);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WHOOP cron token — ${title}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0b0b0e; color:#e7e7ea; font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; display:flex; justify-content:center; }
  main { max-width:560px; padding:48px 24px; }
  h1 { font-size:20px; margin:0 0 8px; color:#f06c6c; }
  pre { white-space:pre-wrap; word-break:break-word; background:#15151a; color:#e7e7ea; border:1px solid #2a2a32; border-radius:8px; padding:12px; font-family:ui-monospace,monospace; font-size:12px; }
</style></head>
<body><main>
  <h1>${title}</h1>
  <p>Share this message so the issue can be diagnosed:</p>
  <pre id="d"></pre>
</main>
<script>
  document.getElementById('d').textContent = ${detailJson};
</script>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  const errorDescription = req.nextUrl.searchParams.get('error_description');
  const state = req.nextUrl.searchParams.get('state');
  const isCron = state === 'cron-token';

  if (error || !code) {
    const detail = `WHOOP authorization failed: ${error || 'no authorization code returned'}${errorDescription ? ` — ${errorDescription}` : ''}`;
    if (isCron) {
      return new NextResponse(cronMessagePage('Authorization failed', detail), {
        status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    // WHOOP drops `state` on its error redirect, so cron failures land here too.
    // Carry the reason in the URL so it isn't silently swallowed.
    const url = new URL('/?whoop=error', req.url);
    url.searchParams.set('reason', error || 'no_code');
    if (errorDescription) url.searchParams.set('desc', errorDescription);
    return NextResponse.redirect(url);
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
    const body = await res.text();
    console.error('WHOOP token exchange failed:', res.status, body);
    if (isCron) {
      return new NextResponse(cronMessagePage('Token exchange failed', `WHOOP returned HTTP ${res.status}: ${body}`), {
        status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    const url = new URL('/?whoop=error', req.url);
    url.searchParams.set('reason', `token_exchange_${res.status}`);
    return NextResponse.redirect(url);
  }

  const { access_token, refresh_token, expires_in } = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Cron grant: this is an INDEPENDENT lineage for the GitHub Actions workflow.
  // Show the refresh token for copying into the WHOOP_REFRESH_TOKEN secret, and
  // deliberately do NOT set session cookies — so it never collides with the
  // live dashboard's rotating token.
  if (isCron) {
    return new NextResponse(cronTokenPage(refresh_token), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

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
