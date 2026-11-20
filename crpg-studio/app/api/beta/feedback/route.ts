import { NextResponse } from 'next/server';
import { aiAllowed, LIMIT_REPLY, logEvent } from '../../../_lib/beta';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  // Counted like an AI call so the file can't be flooded.
  if (!aiAllowed(request)) return NextResponse.json(LIMIT_REPLY, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
  if (!text) return NextResponse.json({ error: '내용을 적어 주세요.' }, { status: 400 });
  const contact = typeof body.contact === 'string' ? body.contact.trim().slice(0, 100) : '';
  const gameId = typeof body.gameId === 'string' ? body.gameId.slice(0, 20) : '';
  // Where the visitor stood when they wrote it, so a 'choices are gone' can be read against the screen they had.
  const at = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : {};
  const snapshot = { level: Number(at.level) || 1, goal: typeof at.goal === 'string' ? at.goal.slice(0, 200) : '', log: Array.isArray(at.log) ? at.log.filter((x: unknown) => typeof x === 'string').slice(-15).map((x: string) => x.slice(0, 1000)) : [] };
  await logEvent(request, 'feedback', { text, contact, gameId, snapshot });
  return NextResponse.json({ ok: true });
}
