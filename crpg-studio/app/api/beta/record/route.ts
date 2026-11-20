import { NextResponse } from 'next/server';
import { appendFile, mkdir } from 'node:fs/promises';
import { BETA_DIR, isPublic, RECORDS_FILE, underCap, visitorOf } from '../../../_lib/beta';
export const runtime = 'nodejs';
// A visitor's turn as the page applied it (session before, GM reply, action), like /api/dev/turn-record does locally.
export async function POST(request: Request) {
  if (!isPublic(request)) return NextResponse.json({ ok: true });
  if (!underCap(request, 'record', 1000)) return NextResponse.json({ ok: false }, { status: 429 });
  const text = await request.text();
  if (text.length > 2_000_000) return NextResponse.json({ error: 'too large' }, { status: 413 });
  let turn: Record<string, unknown>;
  try { turn = JSON.parse(text); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  await mkdir(BETA_DIR, { recursive: true });
  await appendFile(RECORDS_FILE, JSON.stringify({ ...turn, pid: visitorOf(request).pid }) + '\n');
  return NextResponse.json({ ok: true });
}
