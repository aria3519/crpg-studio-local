import { alikeQuest, currentGoalOf, stuckCause, type Game, type Session } from './game/core';

// The local beta dashboard (/admin): who left where, who is stuck, what broke, what they said.
// Pure: the admin route reads beta-data/ and saves/ and hands them in.
export type BetaEvent = { at: string; kind: string; pid: string; ip: string; country: string; ua: string; action?: string; text?: string; contact?: string; gameId?: string; where?: string; message?: string; snapshot?: { level: number; goal: string; log: string[] } };
export type VisitorSave = { gameId: string; pid: string; session: Session };
// One played turn as beta-data/turn-records.jsonl keeps it (the session before the turn).
export type TurnRecord = { at: string; gameId: string; pid: string; session: Session };
type GameInfo = Pick<Game, 'id' | 'name'> & Partial<Game>;

export const DROP_HOURS = 24, STUCK_TURNS = 10;
const LIMIT = /이용할 수 있는 양을 모두|베타 체험 턴\(|참가 인원\(/;
const BROKEN = /^시스템: .*(실패|오류|에러|못했습니다|error|failed)/i;
const BUG_WORDS = /버그|오류|에러|안 ?돼|안 ?되|멈춤|멈췄|멈춰|먹통|이상해|이상하|안 ?나와|안 ?나오|튕|깨져|깨짐|렉/;
const GOAL_END = /^시스템: 목표 (완료|실패|포기) — /;
const TURN_BUCKETS: [number, string][] = [[0, '플레이 안 함'], [10, '1~10턴'], [50, '11~50턴'], [100, '51~100턴'], [300, '101~300턴'], [Infinity, '301턴~']];

const actsOf = (log: string[]) => log.filter(e => e.startsWith('플레이어:'));
const sameish = (a: string) => a.replace(/^플레이어:\s*/, '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 20);

// Where the goal last changed: a 새 목표/완료/실패/포기 line, or the focus the game picked last.
// Only this goal's own start or a goal ending counts: another job taken on the side (이현욱's 구울 while 바레나 stood still)
// restarted the count and read as "got past it".
const goalNamed = (e: string, goal: string) => alikeQuest(e.replace(/^시스템: (새 목표|목표 (완료|실패|포기)) — /, '').replace(/ \(?의뢰인 .*$/, ''), goal);
const goalChanged = (s: Session) => { const goal = currentGoalOf(s); return Math.max(s.focus === goal ? s.focusAt ?? 0 : 0, s.log.map(e => GOAL_END.test(e) || (e.startsWith('시스템: 새 목표 — ') && goalNamed(e, goal))).lastIndexOf(true)); };
// Got past a goal, in the same playthrough (승우 started over; that is not getting past it): it ended, or later play (a turn or the save left now) has another goal current.
const movedOn = (s: Session, goal: string) => currentGoalOf(s) !== goal || s.log.some(e => GOAL_END.test(e) && goalNamed(e, goal));
// Stretches where the story stood still (STUCK_TURNS+ actions on one goal), from every recorded turn, not the save left now:
// 승우 started over and 김민석 stopped coming, so their 27 turns circling at 엘로이즈 never showed (2026-11-23).
// Each comes with the game's own reading of why (stuckCause), at the stretch's last turn.
export function stuckStretches(records: TurnRecord[], games: GameInfo[], saves: VisitorSave[] = []) {
  const runs = new Map<string, { at: string; pid: string; gameId: string; run?: string; goal: string; turns: number; from: number; causes: Map<string, number> }>();
  const gameOf = (id: string) => games.find(x => x.id === id);
  for (const r of records) {
    const s = r.session, goal = s?.log ? currentGoalOf(s) : '';
    if (!goal || s.dead) continue;
    const from = goalChanged(s), turns = actsOf(s.log.slice(from)).length;
    if (turns < STUCK_TURNS) continue;
    const key = `${r.gameId}-${r.pid}-${from}-${goal}`, run = runs.get(key) || { at: r.at, pid: r.pid, gameId: r.gameId, run: s.runId, goal, turns, from, causes: new Map<string, number>() };
    const g = gameOf(r.gameId), cause = g ? stuckCause(g as Game, s) : '';
    run.causes.set(cause, (run.causes.get(cause) || 0) + 1);
    runs.set(key, { ...run, at: r.at, turns });
  }
  // A turn record is the session before the turn: the last one of a stretch is often the turn that undid it (핍's tip told on it).
  // So the cause is the one that held the longest, and a stretch the player later got past says so.
  return [...runs.values()].map(e => ({
    at: e.at, pid: e.pid, game: gameOf(e.gameId)?.name || e.gameId, goal: e.goal, turns: e.turns,
    cause: [...e.causes].sort((x, y) => y[1] - x[1])[0]?.[0] || '',
    passed: [...records.filter(r => r.at > e.at), ...saves].some(r => r.pid === e.pid && r.gameId === e.gameId && !!r.session?.log && r.session.runId === e.run && movedOn(r.session, e.goal)),
  }));
}
// Why a save looks stuck (empty when it doesn't). Talk turns aren't 플레이어: lines, so a long talk never counts.
export function stuckReasons(s: Session): string[] {
  if (s.dead || s.log.length < 2) return [];
  const why: string[] = [];
  const onGoal = actsOf(s.log.slice(goalChanged(s))).length;
  if (onGoal >= STUCK_TURNS) why.push(`같은 목표에 ${onGoal}턴째`);
  const last = actsOf(s.log).slice(-5).map(sameish), top = Math.max(0, ...last.map(a => last.filter(b => b === a).length));
  if (top >= 3) why.push(`최근 5턴 중 ${top}턴이 같은 행동`);
  if (!s.mode && !(s.suggestedActions || []).some(x => x.trim())) why.push('선택지가 비어 있음');
  return why;
}

const saveSummary = (v: VisitorSave, gameName: (id: string) => string) => {
  const s = v.session;
  return { key: `${v.gameId}-${v.pid}`, game: gameName(v.gameId), level: s.level || 1, hp: s.hp, dead: !!s.dead, gold: s.characterGold, goal: currentGoalOf(s), progress: s.storyPoints || 0, acts: actsOf(s.log).length, logLength: s.log.length, recent: s.log.slice(-12), stuck: stuckReasons(s) };
};

export function betaReport(events: BetaEvent[], saves: VisitorSave[], games: GameInfo[], read: Set<string>, now = Date.now(), records: TurnRecord[] = []) {
  const gameName = (id: string) => games.find(g => g.id === id)?.name || id;
  const hoursAgo = (iso: string) => (now - Date.parse(iso)) / 3_600_000;
  const byPid = new Map<string, BetaEvent[]>();
  for (const e of events) if (e.pid) byPid.set(e.pid, [...(byPid.get(e.pid) || []), e]);

  const feedback = events.filter(e => e.kind === 'feedback').map(e => {
    const id = `${e.pid}-${e.at}`;
    return { id, at: e.at, pid: e.pid, contact: e.contact || '', game: gameName(e.gameId || ''), text: e.text || '', snapshot: e.snapshot, read: read.has(id), bugLike: BUG_WORDS.test(e.text || '') };
  }).reverse();

  // Play time: the gaps between one turn and the next; a gap over PLAY_GAP_MIN is a break and counts as one turn's minute.
  const PLAY_GAP_MIN = 15;
  const playMinutes = (turns: BetaEvent[]) => Math.round(turns.slice(1).reduce((n, e, i) => { const gap = (Date.parse(e.at) - Date.parse(turns[i].at)) / 60_000; return n + (gap <= PLAY_GAP_MIN ? gap : 1); }, turns.length ? 1 : 0));
  const players = [...byPid.entries()].map(([pid, evs]) => {
    const mine = saves.filter(v => v.pid === pid).map(v => saveSummary(v, gameName));
    const turns = evs.filter(e => e.kind === 'turn'), last = evs[evs.length - 1].at;
    const limited = mine.some(m => m.recent.some(l => LIMIT.test(l)));
    const main = [...mine].sort((a, b) => b.logLength - a.logLength)[0];
    const away = hoursAgo(last) >= DROP_HOURS;
    return {
      pid, ips: [...new Set(evs.map(e => e.ip).filter(Boolean))], country: evs.find(e => e.country)?.country || '', ua: evs.find(e => e.ua)?.ua || '',
      first: evs[0].at, last, visits: evs.filter(e => e.kind === 'visit').length, turns: turns.length, saves: mine, limited,
      playMinutes: playMinutes(turns), days: new Set(turns.map(e => e.at.slice(0, 10))).size,
      dropped: away && !limited ? { goal: main?.goal || '(시작 전)', dead: !!main?.dead, bucket: TURN_BUCKETS.find(([max]) => turns.length <= max)![1] } : null,
      stuck: !away && main?.stuck.length ? { game: main.game, goal: main.goal, reasons: main.stuck, key: main.key } : null,
      timeline: evs.filter(e => e.kind !== 'visit').slice(-60).map(e => ({ at: e.at, kind: e.kind, text: e.action || e.text || `${e.where}: ${e.message}` })),
    };
  }).sort((a, b) => b.last.localeCompare(a.last));

  // Bugs: failures the routes or the page reported, broken system lines left in saves, and feedback that sounds like one.
  const bugs = [
    ...events.filter(e => e.kind === 'error').map(e => ({ at: e.at, pid: e.pid, source: e.where === 'page' || e.where === 'turn' ? '화면' : '서버', where: e.where || '', message: e.message || '' })),
    ...players.flatMap(p => p.saves.flatMap(s => [...new Set(s.recent.filter(l => BROKEN.test(l) && !LIMIT.test(l)))].map(l => ({ at: p.last, pid: p.pid, source: '기록', where: s.game, message: l.replace(/^시스템:\s*/, '') })))),
    ...stuckStretches(records, games, saves).map(x => ({ at: x.at, pid: x.pid, source: '막힘', where: x.game, message: `「${x.goal}」 ${x.turns}턴째 제자리${x.passed ? ' (이후 풀림)' : ''} — 원인: ${x.cause || '알 수 없음'}` })),
    ...feedback.filter(f => f.bugLike).map(f => ({ at: f.at, pid: f.pid, source: '의견', where: f.game, message: f.text })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const dropped = players.filter(p => p.dropped);
  const count = (keys: string[]) => Object.entries(keys.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  return {
    summary: { players: players.length, today: players.filter(p => hoursAgo(p.last) < 24).length, turns: events.filter(e => e.kind === 'turn').length, unread: feedback.filter(f => !f.read).length, bugs: bugs.length, stuck: players.filter(p => p.stuck).length, dropped: dropped.length },
    feedback, bugs,
    stuck: players.filter(p => p.stuck).map(p => ({ pid: p.pid, last: p.last, ...p.stuck! })),
    drop: { byGoal: count(dropped.map(p => p.dropped!.dead ? `${p.dropped!.goal} (사망)` : p.dropped!.goal)), byTurns: TURN_BUCKETS.map(([, label]) => [label, dropped.filter(p => p.dropped!.bucket === label).length] as [string, number]) },
    players,
  };
}
