import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, signOut } from '../../../../_lib/beta-accounts';

export const runtime = 'nodejs';

// Signs the player out: the session ends and the browser's player id goes too, so the saves it keyed can't be opened
// from this browser until someone signs in again (a fresh id comes with the next request).
export async function POST(req: NextRequest) {
  signOut(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete('crpg-pid');
  return res;
}
