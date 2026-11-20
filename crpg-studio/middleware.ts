import { NextResponse, type NextRequest } from 'next/server';

// Public beta: requests through the Cloudflare tunnel carry cf-connecting-ip, local ones never do.
// Visitors may only play: no editing or generating, and only their own save. Every browser gets a player id (crpg-pid).
const CLOSED = /^\/(admin|api\/(beta\/admin|dev|npc|prompt|registration))(\/|$)/;
const SAVE_LIMIT = 2_000_000;

export function middleware(req: NextRequest) {
  const cookie = req.cookies.get('crpg-pid')?.value || '';
  const pid = /^[a-z0-9]{12}$/.test(cookie) ? cookie : crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  if (req.headers.has('cf-connecting-ip')) {
    const path = req.nextUrl.pathname;
    if (CLOSED.test(path)) return new NextResponse('Not found', { status: 404 });
    const key = /^\/api\/saves\/([^/]+)$/.exec(path)?.[1];
    if (key) {
      const own = new RegExp(`^session-[a-z0-9]+-${pid}$`).test(key);
      if (!own && !(key === 'games' && req.method === 'GET')) return new NextResponse('Forbidden', { status: 403 });
      if (Number(req.headers.get('content-length') || 0) > SAVE_LIMIT) return new NextResponse('Too large', { status: 413 });
    }
  }
  const headers = new Headers(req.headers);
  headers.set('x-crpg-pid', pid);
  const res = NextResponse.next({ request: { headers } });
  if (cookie !== pid) res.cookies.set('crpg-pid', pid, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', path: '/' });
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
