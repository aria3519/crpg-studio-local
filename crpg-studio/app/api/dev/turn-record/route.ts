import { NextResponse } from 'next/server';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
// Dev only: the play screen sends each turn as it applies it (session before, GM reply, action), so real replies can be
// replayed by the tests for free. `npm run test:keep` copies the latest ones into tests/fixtures/turns.jsonl.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') return new NextResponse('Not found', { status: 404 });
  const turn = await request.text();
  if (turn.length > 2_000_000) return NextResponse.json({ error: 'too large' }, { status: 413 });
  const dir = path.join(process.cwd(), '.next');
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, 'turn-records.jsonl'), turn.replace(/\n/g, ' ') + '\n');
  return NextResponse.json({ ok: true });
}
