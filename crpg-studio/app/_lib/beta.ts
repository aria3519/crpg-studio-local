import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { accountOfToken, SESSION_COOKIE } from './beta-accounts';

// Public beta helpers (server only). middleware.ts tells visitors apart and sets x-crpg-pid.
export const BETA_DIR = path.resolve(process.cwd(), process.env.BETA_DATA_DIR || 'beta-data');
export const EVENTS_FILE = path.join(BETA_DIR, 'events.jsonl');
// Each visitor turn as the play screen applied it (same shape as the dev .next/turn-records.jsonl, plus pid), for replays.
export const RECORDS_FILE = path.join(BETA_DIR, 'turn-records.jsonl');
export const isPublic = (req: Request) => req.headers.has('cf-connecting-ip');
export const visitorOf = (req: Request) => ({
  pid: req.headers.get('x-crpg-pid') || '', ip: req.headers.get('cf-connecting-ip') || '',
  country: req.headers.get('cf-ipcountry') || '', ua: (req.headers.get('user-agent') || '').slice(0, 200),
});

// The signed-in account (Kakao, later Google) behind the request's session cookie.
const cookieOf = (req: Request, name: string) => (req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(name + '='))?.slice(name.length + 1);
export const accountOf = (req: Request) => accountOfToken(cookieOf(req, SESSION_COOKIE));
export async function logEvent(req: Request, kind: 'visit' | 'turn' | 'feedback' | 'error', extra: Record<string, unknown> = {}) {
  await mkdir(BETA_DIR, { recursive: true });
  await appendFile(EVENTS_FILE, JSON.stringify({ at: new Date().toISOString(), kind, ...visitorOf(req), ...extra }) + '\n');
}

// A visitor-side failure (an AI route that threw, or the page reporting its own error) for the dashboard's bug list.
export async function logError(req: Request, where: string, error: unknown) {
  if (!isPublic(req)) return;
  await logEvent(req, 'error', { where, message: String(error instanceof Error ? error.message : error).slice(0, 500) }).catch(() => {});
}
// Caps per visitor on what the page may write (error reports, turn records), so no one can fill the disk.
// shortcut: counted in memory, reset on restart; fine at beta scale.
const written = new Map<string, number>();
export function underCap(req: Request, kind: string, cap: number) {
  const k = kind + ':' + visitorOf(req).pid, n = written.get(k) || 0;
  if (n >= cap) return false;
  written.set(k, n + 1);
  return true;
}
// The beta's day is Korea's: today's counts start over at 00:00 KST.
export const kstDay = (at = Date.now()) => new Date(at + 9 * 3600e3).toISOString().slice(0, 10);
// The whole beta's daily AI budget, a cost guard over everyone (each account's own day is DAILY_TURNS). It was also 400 calls
// an IP: five testers on one office IP shared it and were all stopped after 129 turns (a turn is 2-3 calls, not 1.5).
// shortcut: counted in memory, reset on restart; keep it in a file if restarts become common.
export const CALLS_PER_DAY = 4000;
const used = new Map<string, number>();
let day = '';
export function aiAllowed(req: Request, count = true): boolean {
  if (!isPublic(req)) return true;
  if (!accountOf(req)) return false; // visitors play once signed in

  const today = kstDay();
  if (today !== day) { day = today; used.clear(); }
  const all = used.get('all') || 0;
  if (all >= CALLS_PER_DAY) { if (all === CALLS_PER_DAY) { used.set('all', all + 1); void logError(req, 'budget', `하루 전체 AI 호출 ${CALLS_PER_DAY}번을 모두 썼습니다`).catch(() => {}); } return false; }
  if (count) used.set('all', all + 1);
  return true;
}
// Each signed-in account gets its limit of turns in all (DEFAULT_TURNS on sign-up), kept on disk so restarts don't reset
// them. Seats are the accounts themselves (MAX_ACCOUNTS, checked when one is made).
let turns: Record<string, number> | null = null;
const turnsFile = () => path.join(BETA_DIR, 'turns.json');
const loadTurns = () => { if (!turns) try { turns = JSON.parse(readFileSync(turnsFile(), 'utf8')) as Record<string, number>; } catch { turns = {}; } return turns; };
export const turnsUsed = (pid: string) => loadTurns()[pid] || 0;
// And DAILY_TURNS a day (user 2026-11-20), on disk too: { day, counts by pid }.
export const DAILY_TURNS = 200;
let daily: { day: string; counts: Record<string, number> } | null = null;
const dailyFile = () => path.join(BETA_DIR, 'today.json');
const loadDaily = () => {
  if (!daily) try { daily = JSON.parse(readFileSync(dailyFile(), 'utf8')); } catch { daily = { day: '', counts: {} }; }
  if (daily!.day !== kstDay()) daily = { day: kstDay(), counts: {} };
  return daily!;
};
export const turnsToday = (pid: string) => loadDaily().counts[pid] || 0;
// Why a turn can't be played (the reply to send), or undefined when it can; counted when `count`.
export function turnBlock(req: Request, count = true) {
  if (!isPublic(req)) return undefined;
  const acct = accountOf(req);
  if (!acct) return LOGIN_REPLY;
  const turns = loadTurns(), today = loadDaily(), pid = acct.pid, n = turns[pid] || 0, d = today.counts[pid] || 0;
  if (n >= acct.limit) return TURNS_REPLY;
  if (d >= DAILY_TURNS) return TODAY_REPLY;
  if (count) {
    turns[pid] = n + 1; today.counts[pid] = d + 1;
    mkdirSync(BETA_DIR, { recursive: true }); writeFileSync(turnsFile(), JSON.stringify(turns)); writeFileSync(dailyFile(), JSON.stringify(today));
  }
  return undefined;
}
export const TURNS_REPLY = { error: `베타 체험 턴을 모두 사용했습니다. 참여해 주셔서 감사합니다! 오른쪽 위 '의견 보내기'로 소감을 남겨 주세요.` };
export const LOGIN_REPLY = { error: '로그인한 뒤에 플레이할 수 있습니다.' };
export const LIMIT_REPLY = { error: '오늘 베타 전체 이용량이 모두 찼습니다. 내일 다시 이어서 해 주세요.' };
export const TODAY_REPLY = { error: `오늘 플레이할 수 있는 ${DAILY_TURNS}턴을 모두 사용했습니다. 내일 0시에 다시 채워집니다.`, today: true };
