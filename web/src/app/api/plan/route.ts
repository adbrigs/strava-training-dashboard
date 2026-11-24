// Saved schedule changes (day swaps, extra sessions) and workout tags, stored
// in Upstash Redis.
//
//   GET  /api/plan  → { days: { "2026-11-24": { main: "pull", extra: ["easyRun"] } },
//                       tags: { "<workout id>": "legsA" } }
//   PUT  /api/plan  { changes?: {...}, tags?: {...} }
//                   → applies the edits (null = back to the plan / automatic), returns { days, tags }
//
// Day changes live in one Redis hash (one field per date), tags in another
// (one field per workout id). No login: an accepted risk for a personal
// dashboard (see docs/requirements/plan_card_redesign.md).

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { parseChanges, parseTagChanges } from '@/lib/scheduleRules';
import type { ActivityTags, DayOverride, DayOverrides, SessionKey } from '@/lib/trainingPlan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'plan:days';
const TAGS_KEY = 'plan:tags';

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

async function readAll(redis: Redis): Promise<{ days: DayOverrides; tags: ActivityTags }> {
  const [days, tags] = await Promise.all([
    redis.hgetall<Record<string, DayOverride>>(KEY),
    redis.hgetall<Record<string, SessionKey>>(TAGS_KEY),
  ]);
  return { days: days ?? {}, tags: tags ?? {} };
}

function unavailable() {
  return NextResponse.json({ error: 'Schedule store is not configured' }, { status: 503 });
}

export async function GET() {
  const redis = getRedis();
  if (!redis) return unavailable();
  try {
    return NextResponse.json(await readAll(redis), { headers: { 'Cache-Control': 'no-store' } });
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
  const raw = (body ?? {}) as { changes?: unknown; tags?: unknown };
  const changes = raw.changes === undefined ? {} : parseChanges(raw.changes);
  const tagChanges = raw.tags === undefined ? {} : parseTagChanges(raw.tags);
  if (!changes || !tagChanges || (Object.keys(changes).length + Object.keys(tagChanges).length) === 0) {
    return NextResponse.json({ error: 'Invalid changes' }, { status: 400 });
  }

  const toSet: Record<string, DayOverride> = {};
  const toDelete: string[] = [];
  for (const [date, value] of Object.entries(changes)) {
    if (value) toSet[date] = value;
    else toDelete.push(date);
  }
  const tagsToSet: Record<string, SessionKey> = {};
  const tagsToDelete: string[] = [];
  for (const [id, value] of Object.entries(tagChanges)) {
    if (value) tagsToSet[id] = value;
    else tagsToDelete.push(id);
  }

  try {
    // One round trip; Redis runs the steps in order.
    const tx = redis.multi();
    if (Object.keys(toSet).length) tx.hset(KEY, toSet);
    if (toDelete.length) tx.hdel(KEY, ...toDelete);
    if (Object.keys(tagsToSet).length) tx.hset(TAGS_KEY, tagsToSet);
    if (tagsToDelete.length) tx.hdel(TAGS_KEY, ...tagsToDelete);
    await tx.exec();
    return NextResponse.json(await readAll(redis), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[plan] write failed', err);
    return NextResponse.json({ error: 'Could not save schedule' }, { status: 502 });
  }
}
