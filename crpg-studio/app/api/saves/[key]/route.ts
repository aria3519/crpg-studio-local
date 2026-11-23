import { NextResponse } from 'next/server';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { accountOf, isPublic } from '../../../_lib/beta';
export const runtime = 'nodejs';
// Saves (games, play sessions) are mirrored to crpg-studio/saves/ so they can be committed to git.
const dir = path.join(process.cwd(), 'saves');
const fileOf = (key: string) => (/^[\w-]+$/.test(key) ? path.join(dir, `${key}.json`) : null);
type Ctx = { params: Promise<{ key: string }> };
// Through the tunnel a visitor touches only their own play save: signed in, keyed by their account (not by the browser cookie,
// which they can set), for a game that exists, and at most SAVE_LIMIT bytes as received (a chunked body has no content-length).
// Before, anyone could make session-<anything>-<cookie> files without end (audit 2026-11-23). The games list stays readable.
const SAVE_LIMIT = 2_000_000;
const gameIds = async () => { try { const g = JSON.parse(await readFile(path.join(dir, 'games.json'), 'utf8')); return (Array.isArray(g) ? g : g.games || Object.values(g)).map((x: { id?: string }) => x?.id); } catch { return []; } };
async function visitorBlock(req: Request, key: string, write: boolean) {
  if (!isPublic(req)) return undefined;
  if (key === 'games' && !write) return undefined;
  const acct = accountOf(req);
  if (!acct) return new NextResponse('Login required', { status: 401 });
  const game = new RegExp(`^session-([a-z0-9]+)-${acct.pid}$`).exec(key)?.[1];
  if (!game || !(await gameIds()).includes(game)) return new NextResponse('Forbidden', { status: 403 });
  return undefined;
}

export async function GET(request: Request, { params }: Ctx) {
  const key = (await params).key, file = fileOf(key);
  if (!file) return new NextResponse('bad key', { status: 400 });
  const blocked = await visitorBlock(request, key, false);
  if (blocked) return blocked;
  try {
    return new NextResponse(await readFile(file, 'utf8'), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  const key = (await params).key, file = fileOf(key);
  if (!file) return new NextResponse('bad key', { status: 400 });
  const blocked = await visitorBlock(request, key, true);
  if (blocked) return blocked;
  const text = await request.text();
  if (isPublic(request) && Buffer.byteLength(text) > SAVE_LIMIT) return new NextResponse('Too large', { status: 413 });
  let value: unknown;
  try { value = JSON.parse(text); } catch { return new NextResponse('bad json', { status: 400 }); }
  await mkdir(dir, { recursive: true });
  // Write then rename, so a crash mid-write never leaves a half-written save. Indented for readable git diffs.
  // A tmp name per write: two saves at once (a new game while the old one was still saving) wrote into one shared .tmp and left mixed JSON.
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 1), 'utf8');
  await rename(tmp, file);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const key = (await params).key, file = fileOf(key);
  if (!file) return new NextResponse('bad key', { status: 400 });
  const blocked = await visitorBlock(request, key, true);
  if (blocked) return blocked;
  await rm(file, { force: true });
  return NextResponse.json({ ok: true });
}
