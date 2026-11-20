import { NextResponse } from 'next/server';
import { accountOf, DAILY_TURNS, isPublic, kstDay, logEvent, turnsToday, turnsUsed, visitorOf } from '../../../_lib/beta';
import { listAccounts, MAX_ACCOUNTS } from '../../../_lib/beta-accounts';
export const runtime = 'nodejs';
// The page asks on load (a visit) and after each turn (?check, not logged): is this a public visitor, are they signed in,
// which player id keys their save, and how many of their turns are left.
export async function GET(request: Request) {
  const pub = isPublic(request), acct = accountOf(request), pid = acct?.pid || visitorOf(request).pid;
  if (pub && !new URL(request.url).searchParams.has('check')) await logEvent(request, 'visit').catch(() => {});
  const res = NextResponse.json({
    public: pub, pid, signedIn: !!acct, name: acct?.memo?.replace(/^\w+: /, '') || '',
    turnsLeft: acct ? Math.max(0, acct.limit - turnsUsed(acct.pid)) : 0, turnsTotal: acct?.limit || 0,
    // Today's turns and when they come back (next 00:00 KST, as epoch ms).
    todayLeft: acct ? Math.max(0, DAILY_TURNS - turnsToday(acct.pid)) : 0, todayTotal: DAILY_TURNS,
    refillAt: Date.parse(kstDay(Date.now() + 864e5) + 'T00:00:00+09:00'),
    full: !acct && listAccounts().length >= MAX_ACCOUNTS,
  }, { headers: { 'Cache-Control': 'no-store' } });
  // Signed in from a browser whose player id differs (cookies cleared, another device): saves follow the account.
  if (acct && acct.pid !== visitorOf(request).pid) res.cookies.set('crpg-pid', acct.pid, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', path: '/' });
  return res;
}
