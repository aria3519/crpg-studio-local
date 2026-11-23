import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Test-server accounts (server only; middleware.ts runs on Node to read them). The admin makes each account on the local
// dashboard; a visitor signs in and plays with that account's player id, so saves and turn counts follow the account,
// not the browser. Kept in beta-data/accounts.json: password hashes (scrypt) and signed-in sessions (sha256 of the token).
const DIR = path.resolve(process.cwd(), process.env.BETA_DATA_DIR || 'beta-data');
const FILE = path.join(DIR, 'accounts.json');
export const DEFAULT_TURNS = 500;
// Seats in the beta: signed-in people, not visitors (bots kept walking in once the domain was up, 2026-11-20).
export const MAX_ACCOUNTS = 200;
export const SESSION_COOKIE = 'crpg-session';
export const SESSION_DAYS = 30;
export type Account = { id: string; pid: string; salt: string; hash: string; limit: number; disabled?: boolean; created: string; memo?: string };
type Store = { accounts: Account[]; sessions: Record<string, { pid: string; at: string }> };

// Re-read only when the file changed: middleware and the routes may be separate module copies in one server.
// Written to a side file then renamed over the old one, so a server closed mid-write never leaves half a file (audit 2026-11-23).
export const writeWhole = (file: string, text: string) => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, text); renameSync(tmp, file); };
let cache: { mtime: number; store: Store } | null = null;
// A file that exists but can't be read is never written over: before, it read as no accounts and the next sign-in saved a
// file holding that one account, losing every other.
let unreadable = false;
const load = (): Store => {
  let mtime = 0;
  try { mtime = statSync(FILE).mtimeMs; } catch { return { accounts: [], sessions: {} }; }
  if (cache?.mtime === mtime) return cache.store;
  try { cache = { mtime, store: JSON.parse(readFileSync(FILE, 'utf8')) as Store }; unreadable = false; } catch { unreadable = true; return cache?.store || { accounts: [], sessions: {} }; }
  return cache.store;
};
const save = (store: Store) => { if (unreadable) throw new Error('accounts.json을 읽지 못해 덮어쓰지 않습니다.'); mkdirSync(DIR, { recursive: true }); writeWhole(FILE, JSON.stringify(store, null, 1)); cache = null; };

const hashOf = (password: string, salt: string) => scryptSync(password, salt, 32).toString('hex');
const tokenKey = (token: string) => createHash('sha256').update(token).digest('hex');
export const ID_RULE = /^[a-z0-9_-]{3,20}$/;
export const newPassword = () => randomBytes(6).toString('base64url');

export const accountByPid = (pid: string) => load().accounts.find(a => a.pid === pid);
// The signed-in account behind a session cookie; none when the cookie is unknown or the account is switched off.
export function accountOfToken(token?: string): Account | undefined {
  if (!token) return undefined;
  const store = load(), s = store.sessions[tokenKey(token)];
  const acct = s && store.accounts.find(a => a.pid === s.pid);
  return acct && !acct.disabled && Date.now() - Date.parse(s.at) < SESSION_DAYS * 86_400_000 ? acct : undefined;
}
export function signIn(id: string, password: string): string | undefined {
  const store = load(), acct = store.accounts.find(a => a.id === id.trim().toLowerCase());
  if (!acct || acct.disabled || !acct.hash) return undefined; // a Kakao/Google account has no password
  if (!timingSafeEqual(Buffer.from(hashOf(password, acct.salt), 'hex'), Buffer.from(acct.hash, 'hex'))) return undefined;
  const token = startSession(store, acct.pid);
  save(store);
  return token;
}
const newPid = (store: Store) => { let pid = ''; do pid = randomBytes(9).toString('hex').slice(0, 12); while (store.accounts.some(a => a.pid === pid)); return pid; };
const startSession = (store: Store, pid: string) => { const token = randomBytes(32).toString('hex'); store.sessions[tokenKey(token)] = { pid, at: new Date().toISOString() }; return token; };
// Sign-in through a provider (Kakao now, Google later): its user id is the account, made on the first sign-in with
// DEFAULT_TURNS. The browser's player id carries over (keepPid), so someone who played before signing in keeps their save.
export function signInWith(provider: 'kakao' | 'google', uid: string, name: string, keepPid: string): { token: string; pid: string } | { error: string } {
  const store = load(), id = `${provider}-${uid}`.toLowerCase();
  let acct = store.accounts.find(a => a.id === id);
  if (acct?.disabled) return { error: '이용이 중지된 계정입니다.' };
  if (!acct) {
    if (store.accounts.length >= MAX_ACCOUNTS) return { error: `이번 베타 테스트는 참가 인원(${MAX_ACCOUNTS}명)이 모두 찼습니다. 관심 가져 주셔서 감사합니다!` };
    const pid = /^[a-z0-9]{12}$/.test(keepPid) && !store.accounts.some(a => a.pid === keepPid) ? keepPid : newPid(store);
    acct = { id, pid, salt: '', hash: '', limit: DEFAULT_TURNS, created: new Date().toISOString(), ...(name ? { memo: `${provider}: ${name}`.slice(0, 100) } : {}) };
    store.accounts.push(acct);
  }
  const token = startSession(store, acct.pid);
  save(store);
  return { token, pid: acct.pid };
}
export function signOut(token?: string) {
  if (!token) return;
  const store = load();
  if (delete store.sessions[tokenKey(token)]) save(store);
}

// Dashboard side. Errors come back as the Korean message to show.
export const listAccounts = () => load().accounts.map(({ salt: _s, hash: _h, ...a }) => a);
export function createAccount(id: string, password: string, limit = DEFAULT_TURNS, memo = ''): string | undefined {
  const store = load(), name = id.trim().toLowerCase();
  if (!ID_RULE.test(name)) return '아이디는 영문 소문자·숫자·-·_ 3~20자입니다.';
  if (password.length < 4) return '비밀번호는 4자 이상입니다.';
  if (store.accounts.some(a => a.id === name)) return '이미 있는 아이디입니다.';
  const salt = randomBytes(16).toString('hex');
  store.accounts.push({ id: name, pid: newPid(store), salt, hash: hashOf(password, salt), limit: Math.max(0, Math.round(limit)), created: new Date().toISOString(), ...(memo ? { memo: memo.slice(0, 100) } : {}) });
  save(store);
}
export function updateAccount(id: string, patch: { limit?: number; disabled?: boolean; password?: string; memo?: string }): string | undefined {
  const store = load(), acct = store.accounts.find(a => a.id === id);
  if (!acct) return '없는 계정입니다.';
  if (patch.password !== undefined) {
    if (patch.password.length < 4) return '비밀번호는 4자 이상입니다.';
    acct.salt = randomBytes(16).toString('hex'); acct.hash = hashOf(patch.password, acct.salt);
  }
  // A new password or a switch-off signs the account out everywhere.
  if (patch.password !== undefined || patch.disabled) for (const [k, s] of Object.entries(store.sessions)) if (s.pid === acct.pid) delete store.sessions[k];
  if (patch.limit !== undefined && Number.isFinite(patch.limit)) acct.limit = Math.max(0, Math.round(patch.limit));
  if (patch.disabled !== undefined) acct.disabled = patch.disabled || undefined;
  if (patch.memo !== undefined) acct.memo = patch.memo.slice(0, 100) || undefined;
  save(store);
}
