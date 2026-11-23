// Replays every recorded play turn (.next/turn-records.jsonl, written while playing in dev) through the current turn logic
// and checks the goal rules. No AI calls. Skipped when there are no records.
// Rules (2026-11-17 playtests): a prepared goal closes only once its beats are done (or the story ran past it to the next step), and on the turn that finishes it; the GM
// always gets the current goal with steps left; one main step is always open; a main step
// just added is the current goal; a main-story person never hands out their own story while a main step is open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { applyReply } from '../app/_lib/game/turn';
import { alikeQuest, currentGoalOf, gmGoal, goalPeople, goalPath, goalsFinished, questsOf, regionQuestsOf, type Game, type Session } from '../app/_lib/game/core';
import { mainChain } from '../app/_lib/prologues';
// Beats left and not passed: the story running ahead (the next step done or gone after, goalsFinished) passes a goal with beats left.
const passedLeft = (g: Game, q: string, s: Session) => goalPath(g, q, s).some(x => !x.startsWith('이미')) && !goalsFinished(g, s).includes(q);

const root = path.resolve(__dirname, '..', '..');
const file = path.join(root, '.next', 'turn-records.jsonl');
type Rec = { gameId: string; session: Session; data: Record<string, unknown>; message: string; ctx?: Record<string, unknown> };

test('recorded turns keep the goal rules under the current code', { skip: !existsSync(file) && 'no recorded play' }, () => {
  const gamesRaw = JSON.parse(readFileSync(path.join(root, 'saves', 'games.json'), 'utf8'));
  const games: Game[] = Array.isArray(gamesRaw) ? gamesRaw : gamesRaw.games || Object.values(gamesRaw);
  const recs: Rec[] = readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const broken: string[] = [];
  for (const r of recs) {
    const g = games.find(x => x.id === r.gameId) || games[0], chain = (mainChain(g.wizardMain) || []).map(s => s.q);
    const isMain = (q: string) => chain.some(m => alikeQuest(m, q));
    const talkers = new Set((mainChain(g.wizardMain) || []).flatMap(st => st.beats.flatMap(b => b.do === 'talk' ? [b.npc] : [])));
    const real = Math.random; Math.random = () => 0.5;
    let res: Session;
    try { res = applyReply(g, structuredClone(r.session), structuredClone(r.data), r.message, (r.ctx || {}) as never).session; } catch { continue; } finally { Math.random = real; }
    const at = `${r.session.runId}@${r.session.log.length}`, before = questsOf(r.session), after = questsOf(res);
    // A talk closing its goal mid-talk counts that talk as its talk beat.
    const talkEnd = r.session.mode === 'talk' && r.session.talkNpc ? [`시스템: ${r.session.talkNpc}와의 대화가 끝났습니다.`] : [];
    for (const q of before.filter(q => !after.includes(q) && goalPath(g, q).length && res.log.some(l => l.startsWith('시스템: 목표 완료 — ' + q))))
      if (passedLeft(g, q, { ...res, log: [...res.log, ...talkEnd], quests: [q] })) broken.push(`${at} closed with beats left: ${q}`);
    // Closed on the turn that finished it, not one turn later (the report to 에드리아 closed only after leaving for the next place).
    // A talk this turn ended counts as ended (its end line comes when the player closes the window).
    const ended = res.talkEnded && res.talkNpc ? { ...res, log: [...res.log, `시스템: ${res.talkNpc}와의 대화가 끝났습니다.`] } : res;
    const late = goalsFinished(g, ended); if (late.length) broken.push(`${at} finished but left open: ${late.join(' / ')}`);
    // The GM always gets a goal to steer by in a scene (blanked at 회색 탑 for 13 turns); a talk with someone outside the goal's
    // story and a goal waiting behind where people live (2026-11-23) are the only times it gets none.
    const sent = gmGoal(g, res);
    const outside = res.mode === 'talk' && !!res.talkNpc && !goalPeople(g, currentGoalOf(res)).includes(res.talkNpc);
    if (after.length && !sent.currentGoal && !outside && res.away?.goal !== currentGoalOf(res)) broken.push(`${at} no goal sent`);
    if (sent.goalPath.length && sent.goalPath.every(x => x.startsWith('이미'))) broken.push(`${at} goal sent with nothing left: ${sent.currentGoal}`);
    const added = after.filter(q => !before.includes(q));
    if (added.some(isMain) && !isMain(currentGoalOf(res))) broken.push(`${at} new main step not the current goal: ${currentGoalOf(res)}`);
    for (const q of added) { const rq = regionQuestsOf(g).find(x => x.steps.some(st => alikeQuest(st.q, q))); if (rq && talkers.has(rq.giver) && before.some(isMain)) broken.push(`${at} main person's own story added: ${q}`); }
    const finished = chain.every(m => res.log.some(l => l.includes('목표 완료 — ' + m)));
    if (chain.length && after.length && !finished && !after.some(isMain)) broken.push(`${at} no main step open: ${after.join(' / ')}`);
  }
  assert.deepEqual(broken, []);
});

// Not only what the AI happened to say: on every recorded turn the bookkeeper claims every open goal done.
test('a bookkeeper claiming every goal done never closes a prepared goal with beats left', { skip: !existsSync(file) && 'no recorded play' }, () => {
  const gamesRaw = JSON.parse(readFileSync(path.join(root, 'saves', 'games.json'), 'utf8'));
  const games: Game[] = Array.isArray(gamesRaw) ? gamesRaw : gamesRaw.games || Object.values(gamesRaw);
  const recs: Rec[] = readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const broken: string[] = [];
  let tried = 0;
  for (const r of recs) {
    const g = games.find(x => x.id === r.gameId) || games[0], before = questsOf(r.session);
    if (!before.some(q => goalPath(g, q).length)) continue;
    const real = Math.random; Math.random = () => 0.5;
    let res: Session;
    try { res = applyReply(g, structuredClone(r.session), { ...structuredClone(r.data), completedQuests: [...before] }, r.message, (r.ctx || {}) as never).session; } catch { continue; } finally { Math.random = real; }
    tried++;
    const talkEnd = r.session.mode === 'talk' && r.session.talkNpc ? [`시스템: ${r.session.talkNpc}와의 대화가 끝났습니다.`] : [];
    for (const q of before.filter(q => goalPath(g, q).length && !questsOf(res).includes(q)))
      if (passedLeft(g, q, { ...res, log: [...res.log, ...talkEnd], quests: [q] })) broken.push(`${r.session.runId}@${r.session.log.length} closed with beats left: ${q}`);
  }
  assert.ok(tried > 0);
  assert.deepEqual(broken, []);
});
