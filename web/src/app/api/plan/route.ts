// Saved schedule changes (day swaps and extra sessions), stored in Upstash Redis.
//
//   GET  /api/plan                      → { days: { "2026-11-24": { main: "pull", extra: ["easyRun"] } } }
//   PUT  /api/plan  { changes: {...} }  → applies the edits (null = back to the plan), returns { days }
//
// All changes live in one Redis hash, one field per date. No login (accepted
// risk for a personal dashboard; see docs/requirements/plan_card_redesign.md).

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { parseChanges } from '@/lib/scheduleRules';
import type { DayOverride, DayOverrides } from '@/lib/trainingPlan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'plan:days';

let client: Redis | null = null;
/** Created on first use, so a missing store breaks this route only, never the build. */
function getRedis(): Redis | null {
  if (client) return client;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  client = new Redis({ url, token });
  return client;
}

async function readDays(redis: Redis): Promise<DayOverrides> {
  return (await redis.hgetall<Record<string, DayOverride>>(KEY)) ?? {};
}

function unavailable() {
  return NextResponse.json({ error: 'Schedule store is not configured' }, { status: 503 });
}

export async function GET() {
  const redis = getRedis();
  if (!redis) return unavailable();
  try {
    return NextResponse.json({ days: await readDays(redis) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[plan] read failed', err);
    return NextResponse.json({ error: 'Could not read schedule' }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const redis = getRedis();
  if (!redis) return unavailable();

  let body: unknown;
  try { body = await req.json(); } catch { body = null; }
  const changes = parseChanges((body as { changes?: unknown } | null)?.changes);
  if (!changes) return NextResponse.json({ error: 'Invalid changes' }, { status: 400 });

  const toSet: Record<string, DayOverride> = {};
  const toDelete: string[] = [];
  for (const [date, value] of Object.entries(changes)) {
    if (value) toSet[date] = value;
    else toDelete.push(date);
  }

  try {
    // One round trip; Redis runs the steps in order.
    const tx = redis.multi();
    if (Object.keys(toSet).length) tx.hset(KEY, toSet);
    if (toDelete.length) tx.hdel(KEY, ...toDelete);
    await tx.exec();
    return NextResponse.json({ days: await readDays(redis) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[plan] write failed', err);
    return NextResponse.json({ error: 'Could not save schedule' }, { status: 502 });
  }
}
