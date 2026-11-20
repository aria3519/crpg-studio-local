import { NextResponse } from 'next/server';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BETA_DIR, EVENTS_FILE, isPublic, turnsUsed } from '../../../_lib/beta';
import { betaReport, type BetaEvent, type VisitorSave } from '../../../_lib/beta-report';
import { listAccounts, MAX_ACCOUNTS, updateAccount } from '../../../_lib/beta-accounts';
export const runtime = 'nodejs';

// Local only (middleware also hides it from the tunnel). GET: the dashboard report, or one visitor's whole save
// (?save=<game>-<pid>). POST { read: id, value }: mark a feedback read or unread; POST { account: id, addTurns?, disabled? }:
// give an account more turns, or switch it off (signs it out) and on.
const saves = path.join(process.cwd(), 'saves');
const READ_FILE = path.join(BETA_DIR, 'feedback-read.json');
const SAVE_FILE = /^session-([a-z0-9]+)-([a-z0-9]{12})\.json$/;
const readIds = async () => new Set<string>(JSON.parse(await readFile(READ_FILE, 'utf8').catch(() => '[]')));
const json = (data: unknown) => NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  if (isPublic(request)) return new NextResponse('Not found', { status: 404 });
  const one = new URL(request.url).searchParams.get('save');
  if (one) {
    if (!/^[a-z0-9]+-[a-z0-9]{12}$/.test(one)) return new NextResponse('bad key', { status: 400 });
    const text = await readFile(path.join(saves, `session-${one}.json`), 'utf8').catch(() => '');
    return text ? new NextResponse(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }) : new NextResponse('Not found', { status: 404 });
  }
  const events: BetaEvent[] = (await readFile(EVENTS_FILE, 'utf8').catch(() => '')).split('\n').flatMap(l => { try { return l ? [JSON.parse(l)] : []; } catch { return []; } })
    .filter(e => !e.ua?.startsWith('curl/')); // address checks from this machine, not visitors
  const games: { id: string; name: string }[] = JSON.parse(await readFile(path.join(saves, 'games.json'), 'utf8').catch(() => '[]'));
  const visitorSaves: VisitorSave[] = [];
  for (const f of await readdir(saves).catch(() => [] as string[])) {
    const m = SAVE_FILE.exec(f);
    if (!m) continue;
    try { visitorSaves.push({ gameId: m[1], pid: m[2], session: JSON.parse(await readFile(path.join(saves, f), 'utf8')) }); } catch { /* a save mid-write is read next time */ }
  }
  // Seats are signed-in accounts, not visitors (bots visit too); each comes with how it signed in and its name.
  const members = listAccounts().map(a => ({ pid: a.pid, id: a.id, memo: a.memo || '', created: a.created, limit: a.limit, used: turnsUsed(a.pid), disabled: !!a.disabled }));
  return json({ ...betaReport(events, visitorSaves, games.map(g => ({ id: g.id, name: g.name })), await readIds()), members, maxAccounts: MAX_ACCOUNTS });
}

export async function POST(request: Request) {
  if (isPublic(request)) return new NextResponse('Not found', { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.account === 'string') {
    const acct = listAccounts().find(a => a.id === body.account);
    if (!acct) return new NextResponse('없는 계정입니다.', { status: 404 });
    const add = Number(body.addTurns);
    const err = updateAccount(acct.id, { ...(Number.isFinite(add) && add ? { limit: acct.limit + add } : {}), ...(typeof body.disabled === 'boolean' ? { disabled: body.disabled } : {}) });
    return err ? new NextResponse(err, { status: 400 }) : json({ ok: true });
  }
  if (typeof body.read !== 'string') return new NextResponse('bad request', { status: 400 });
  const ids = await readIds();
  if (body.value === false) ids.delete(body.read); else ids.add(body.read);
  await mkdir(BETA_DIR, { recursive: true });
  await writeFile(READ_FILE, JSON.stringify([...ids]));
  return json({ ok: true });
}
