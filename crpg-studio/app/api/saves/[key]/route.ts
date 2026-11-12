import { NextResponse } from 'next/server';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const runtime = 'nodejs';
// Saves (games, play sessions) are mirrored to crpg-studio/saves/ so they can be committed to git.
const dir = path.join(process.cwd(), 'saves');
const fileOf = (key: string) => (/^[\w-]+$/.test(key) ? path.join(dir, `${key}.json`) : null);
type Ctx = { params: Promise<{ key: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const file = fileOf((await params).key);
  if (!file) return new NextResponse('bad key', { status: 400 });
  try {
    return new NextResponse(await readFile(file, 'utf8'), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  const file = fileOf((await params).key);
  if (!file) return new NextResponse('bad key', { status: 400 });
  let value: unknown;
  try { value = JSON.parse(await request.text()); } catch { return new NextResponse('bad json', { status: 400 }); }
  await mkdir(dir, { recursive: true });
  // Write then rename, so a crash mid-write never leaves a half-written save. Indented for readable git diffs.
  // A tmp name per write: two saves at once (a new game while the old one was still saving) wrote into one shared .tmp and left mixed JSON.
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 1), 'utf8');
  await rename(tmp, file);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const file = fileOf((await params).key);
  if (!file) return new NextResponse('bad key', { status: 400 });
  await rm(file, { force: true });
  return NextResponse.json({ ok: true });
}
