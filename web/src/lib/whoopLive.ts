// One shared request for the live WHOOP data.
//
// WHOOP refresh tokens are single-use: the first refresh wins and the token is
// replaced. Several widgets (readiness card, today's plan, chat bot, settings)
// each used to call /api/whoop/data on page load, so after the hourly access
// token expired they all tried to refresh with the same token at once and the
// losers failed ("Not connected"). Every widget now goes through this helper so
// the page makes ONE request, no matter how many widgets ask.

export interface WhoopLiveData {
  connected: boolean;
  // true = the server couldn't reach WHOOP just now; the login is still saved.
  transient?: boolean;
  recovery?: { score: number; hrv: number; restingHr: number; date: string } | null;
  sleep?: {
    durationMs: number; performance: number; efficiency: number;
    remMs: number; deepMs: number; date: string;
  } | null;
  strain?: { score: number; avgHr: number; date: string } | null;
  bodyMeasurement?: { weightKg: number | null; heightM: number | null; maxHeartRate: number | null } | null;
}

const SHARE_WINDOW_MS = 30_000;
let inFlight: Promise<WhoopLiveData | null> | null = null;
let startedAt = 0;

export function getWhoopLive(force = false): Promise<WhoopLiveData | null> {
  const fresh = inFlight && Date.now() - startedAt < SHARE_WINDOW_MS;
  if (!force && fresh) return inFlight!;
  startedAt = Date.now();
  inFlight = fetch('/api/whoop/data')
    .then(r => r.json() as Promise<WhoopLiveData>)
    .catch(() => null);
  return inFlight;
}
