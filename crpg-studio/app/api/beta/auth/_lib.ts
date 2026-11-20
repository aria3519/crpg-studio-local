import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { isPublic } from '../../../_lib/beta';
import { SESSION_COOKIE, SESSION_DAYS, signInWith } from '../../../_lib/beta-accounts';

// Shared by the sign-in providers (Kakao, Google): the address the provider sends the player back to, the
// state check against forged returns, and the session cookie once the provider says who they are.
// The redirect address must match what is registered with the provider, so visitors always use the one public origin.
export const PUBLIC_ORIGIN = process.env.BETA_ORIGIN || 'https://crpgstudio.com';
export const originOf = (req: NextRequest) => isPublic(req) ? PUBLIC_ORIGIN : req.nextUrl.origin;
const STATE_COOKIE = 'crpg-oauth';
const cookieOpts = (req: NextRequest, maxAge: number) => ({ httpOnly: true, sameSite: 'lax' as const, secure: isPublic(req), path: '/', maxAge });

// Sends the player to the provider's sign-in page (from www. first to the registered origin, so the state cookie comes back).
export function startSignIn(req: NextRequest, provider: string, authorizeUrl: (redirectUri: string, state: string) => string) {
  const origin = originOf(req);
  if (isPublic(req) && req.headers.get('host') !== new URL(origin).host) return NextResponse.redirect(`${origin}/api/beta/auth/${provider}`);
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(authorizeUrl(`${origin}/api/beta/auth/${provider}/callback`, state));
  res.cookies.set(STATE_COOKIE, state, cookieOpts(req, 600));
  return res;
}
// Back on the page; a failure shows its message there (?login=…).
const back = (req: NextRequest, message = '') => NextResponse.redirect(`${originOf(req)}/${message ? `?login=${encodeURIComponent(message)}` : ''}`);
export async function finishSignIn(req: NextRequest, provider: 'kakao' | 'google', who: (code: string, redirectUri: string) => Promise<{ uid: string; name: string } | null>) {
  const code = req.nextUrl.searchParams.get('code') || '', state = req.nextUrl.searchParams.get('state') || '';
  if (!code || !state || state !== req.cookies.get(STATE_COOKIE)?.value) return back(req, '로그인이 취소되었거나 시간이 지났습니다. 다시 시도해 주세요.');
  const person = await who(code, `${originOf(req)}/api/beta/auth/${provider}/callback`).catch(() => null);
  if (!person?.uid) return back(req, '로그인에 실패했습니다. 다시 시도해 주세요.');
  const out = signInWith(provider, person.uid, person.name, req.cookies.get('crpg-pid')?.value || '');
  if ('error' in out) return back(req, out.error);
  const res = back(req);
  res.cookies.set(SESSION_COOKIE, out.token, cookieOpts(req, SESSION_DAYS * 86_400));
  res.cookies.set('crpg-pid', out.pid, { ...cookieOpts(req, 60 * 60 * 24 * 365), secure: false });
  res.cookies.delete(STATE_COOKIE);
  return res;
}
