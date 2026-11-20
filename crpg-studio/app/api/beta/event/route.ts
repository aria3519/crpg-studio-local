import { NextResponse } from 'next/server';
import { isPublic, logError, underCap } from '../../../_lib/beta';
export const runtime = 'nodejs';
// The play screen reports its own failures here (a script error, a GM call that never came back) for the bug list.
export async function POST(request: Request) {
  if (!isPublic(request)) return NextResponse.json({ ok: true });
  if (!underCap(request, 'event', 200)) return NextResponse.json({ ok: false }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const where = typeof body.where === 'string' ? body.where.slice(0, 40) : 'page';
  const message = typeof body.message === 'string' ? body.message : '';
  if (message) await logError(request, where, message);
  return NextResponse.json({ ok: true });
}
