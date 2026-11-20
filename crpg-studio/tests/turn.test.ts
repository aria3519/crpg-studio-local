// Replays GM replies through the turn logic (app/_lib/game/turn.ts) without calling any AI, so it costs nothing.
// Each case in tests/fixtures/turns.jsonl is { name, gameId, session, data, message, ctx }: real turns recorded while
// playing (npm run test:keep) or hand-written ones. The result is checked against basic rules and against the result
// saved last time (tests/fixtures/turns.expected.json); `npm run test:update` accepts the current results as the new baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyReply, type TurnContext } from '../app/_lib/game/turn';
import { toBeatPlace, duelBeat, metNames, foundHere, routeFor, placeHeading, bestGear, growStats, heroFits, amountsIn, tookItem, relationOf, priceAsk, unnamedScene, spendStat, growthFields, playerPower, fightOdds, foeCombat, gmGoal, dueBeat, storyStatus, withoutUnmetNames, placeReasoned, focusAfter, goalsFinished, preparedGoal, withGuides, guideOf, guideGoal, ownStoryOpen, heldGoal, personalStories, withNextMain, joinTemp, playerActs, dismissTemps, maxHpOf, refitHp, storyFoes, writerFoes, storyProgress, withStory, finalBoss, finaleQuest, bossPlace, foeLevel, defaultMapGenre, npcWhereabouts, goalPath, storyCastFull, storyNpcsAfter, mapRoute, reachablePins, asideClue, questWeight, applyQuests, questsOf, checkDc, checkStakes, impactOf, fightEdge, pendingChoice, beatFoe, sellJunk, junkOf, rollOutcome, type Game, type Session, chaptersOpen, promptUpToAct, regionQuestsOf, regionOpen, bossOpen, storyPointsOf, alikeQuest, gritOf, maxManaOf, autoBattleStep, finisherOf } from '../app/_lib/game/core';
import { foesOf, findFoe } from '../app/_lib/monsters';
import { mainChain } from '../app/_lib/prologues';
import { levelForTier, storyLevel } from '../app/_lib/progression';

const root = path.join(__dirname, '..', '..');
const fixtures = path.join(root, 'tests', 'fixtures', 'turns.jsonl');
const expectedFile = path.join(root, 'tests', 'fixtures', 'turns.expected.json');
type Turn = { name: string; gameId: string; session: Session; data: Record<string, unknown>; message: string; ctx?: TurnContext };

const turns: Turn[] = existsSync(fixtures) ? readFileSync(fixtures, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)) : [];
const gamesRaw = JSON.parse(readFileSync(path.join(root, 'saves', 'games.json'), 'utf8'));
const games: Game[] = Array.isArray(gamesRaw) ? gamesRaw : gamesRaw.games || Object.values(gamesRaw);
const gameOf = (id: string) => games.find(g => g?.id === id) || games[0];

// Item grades, gear names and encounters roll dice; a fixed seed makes every run the same.
const seeded = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const run = (t: Turn) => {
  const real = Math.random; Math.random = seeded(7);
  try { return applyReply(gameOf(t.gameId), structuredClone(t.session), structuredClone(t.data), t.message, t.ctx || {}); } finally { Math.random = real; }
};
// What a turn changed, without generated ids.
const view = (t: Turn, r: ReturnType<typeof applyReply>) => ({
  newLog: r.session.log.slice(t.session.log.length), hp: r.session.hp, gold: r.session.characterGold, reputation: r.session.reputation,
  quests: r.session.quests, inventory: r.session.inventory, level: r.session.level, xp: r.session.xp, threat: r.session.threat || null,
  people: (r.session.relationships || []).map(p => `${p.name} ${p.relation} ${p.affection}`), sceneNpcs: r.session.sceneNpcs, choices: r.session.suggestedActions,
  talkPurpose: r.session.talkPurpose || null, notice: r.notice || null, repBurst: r.repBurst || null, questClear: r.questClear || null, levelBurst: r.levelBurst || null, major: r.major,
});

const update = process.env.UPDATE_TURNS === '1';
const expected: Record<string, unknown> = existsSync(expectedFile) && !update ? JSON.parse(readFileSync(expectedFile, 'utf8')) : {};
const fresh: Record<string, unknown> = {};

test('turn fixtures exist', () => assert.ok(turns.length > 0, 'tests/fixtures/turns.jsonl has no turns'));
for (const t of turns) test(t.name, () => {
  const r = run(t), s = r.session, game = gameOf(t.gameId);
  // Rules that hold for every turn.
  assert.ok(s.hp >= 0 && s.hp <= maxHpOf(game, s), `HP ${s.hp} out of range`);
  assert.ok((s.characterGold ?? 0) >= 0, `gold ${s.characterGold} below zero`);
  assert.ok(s.log.length > t.session.log.length || t.session.mode === 'talk', 'the turn added nothing to the log');
  assert.ok((s.suggestedActions || []).length <= 4, 'more than four choices');
  assert.equal(new Set(s.quests || []).size, (s.quests || []).length, 'a goal is listed twice');
  // Same result as last time.
  const v = JSON.parse(JSON.stringify(view(t, r)));
  fresh[t.name] = v;
  if (!update && t.name in expected) assert.deepEqual(v, expected[t.name], `result changed for "${t.name}" (npm run test:update accepts it)`);
});
test('baseline saved', () => {
  if (update || Object.keys(fresh).some(k => !(k in expected))) writeFileSync(expectedFile, JSON.stringify({ ...expected, ...fresh }, null, 1) + '\n');
});

// Story people have a place before the writer meets them (에드리아 turned up at 변경백가 영지 with nowhere set).
test('whereabouts come from the story data', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game;
  const at = npcWhereabouts(g, { log: [] } as unknown as Session);
  assert.equal(at['에드리아 하르트'], '북문 초소');
});

// The world's story opens by progress made anywhere, not only along the main story (user 2026-11-20): 100% by side stories
// left the writer on chapter 1 when the final boss came, and the chapter-2 region story never opened.
test('story chapters open by progress or by the main story, whichever is further', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game, at = (pts: number) => ({ log: [], storyPoints: pts } as unknown as Session);
  assert.deepEqual([0, 9, 18, 27, 36].map(p => chaptersOpen(g, at(p))), [0, 1, 2, 3, 4]);
  const sanctum = regionQuestsOf(g).find(r => r.id === 'w-abyss-sanctum')!;
  assert.deepEqual([regionOpen(g, at(9), sanctum), regionOpen(g, at(18), sanctum)], [false, true]);
  const lines = (n: number) => promptUpToAct(g.prompt || '', n).split('\n').filter(l => /^\s*-\s*\d막/.test(l) && !l.endsWith('진행 중.')).length;
  assert.equal(lines(chaptersOpen(g, at(36))), 4, 'at 100% the writer sees the whole story');
  // Along the main story a chapter opens when its last step is done, well before its quarter of progress (6 points = 17%).
  const ch1 = { log: ['시스템: 목표 완료 — 그림우드의 다이어울프 우두머리를 토벌하고 기사단 서약하기'], storyPoints: 6 } as unknown as Session;
  assert.equal(chaptersOpen(g, ch1), 1);
});

// A region story's and the world's first goal's prepared path reach the writer; a made-up goal has none until the director draws it.
test('goal path comes from region stories and the first goal', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game;
  assert.ok(goalPath(g, '침몰한 금고선').length > 0);
  assert.equal(goalPath(g, '변경 기사단 입단 시험 통과하기').length, 3);
  assert.deepEqual(goalPath(g, '근무 절차 확인하기'), []);
});

// Done beats come from the game's own lines in order; the rest keep where and what (the 2026-11-17 run: after the wolves the
// writer had no "go back to 북문 초소" and offered marking the site with bones).
// No story without a goal (2026-11-17): offers land on prepared stories, or add nothing.
test('an offered job becomes the next main step, the giver own story, or no goal', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game, q = '변경 기사단 입단 시험 통과하기';
  const s = { ...structuredClone(turns[0].session), quests: [], log: ['시스템: 목표 완료 — ' + q], relationships: [] };
  assert.equal(preparedGoal(g, s, '진흙 골목의 장물 거래와 무기의 출처를 조사한다', '에드리아 하르트'), '견습 순찰로 진흙 골목의 장물 거래 단속하기');
  assert.equal(preparedGoal(g, s, '늑대 발자국의 주인을 찾는다', '넬'), '넬의 옛 파티가 몰살당한 날의 진실 듣기', 'rank aside for a story, as its first step');
  // The exam closes in the same talk that hands out the next job: the job is the next main step, not 에드리아 own story.
  const exam = { ...s, quests: [q], log: [] };
  assert.equal(preparedGoal(g, exam, '기사단 무기 유출 경로를 밝힌다', '에드리아 하르트'), '', 'read as still running: the exam is open, so 에드리아 speaks for the main story');
  assert.equal(preparedGoal(g, exam, '기사단 무기 유출 경로를 밝힌다', '에드리아 하르트', [q]), '견습 순찰로 진흙 골목의 장물 거래 단속하기');
  assert.equal(preparedGoal(g, s, '성채 지하 냉실', ''), '성채 지하 냉실 문 열기', 'a named story starts at its first step');
  assert.deepEqual(withNextMain(g, s, { quests: [], added: [], done: ['성채 지하 냉실 문 열기'] }).quests[0], '변경백의 죽음을 어떻게 할지 레지나와 담판 짓기', 'a finished step hands on to the next');
  // 브리아 wolf job after the wolves already fell: nothing left to do, so it is not handed out.
  assert.equal(preparedGoal(g, { ...s, log: [...s.log, '전투: 승리 — 굶주린 늑대 무리를 쓰러뜨렸다'] }, '북문 밖 늑대 떼', ''), '', 'already happened');
  assert.equal(preparedGoal(g, { ...s, quests: ['넬의 마지막 사냥'] }, '화살의 주인을 알아낸다', '넬'), '', 'already running: nothing new');
  assert.equal(preparedGoal(g, s, '화살의 주인을 알아낸다', ''), '', 'no giver, no prepared title: no goal');
  assert.equal(preparedGoal(g, s, '말벗이 되어 준다', '한나'), '', 'someone with no prepared story adds no goal');
});

test('goal path marks the beats the log shows as done and keeps place and action for the rest', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game, q = '변경 기사단 입단 시험 통과하기';
  const base = { ...structuredClone(turns[0].session), quests: [q] };
  const path = (log: string[]) => goalPath(g, q, { ...base, log });
  const talked = ['플레이어: 지원서를 낸다', '시스템: 에드리아 하르트와 대화를 시작했습니다.', '시스템: 에드리아 하르트와의 대화가 끝났습니다.'];
  assert.match(path([])[0], /^북문 초소에서 에드리아 하르트/);
  const won = [...talked, '전투: 승리 — 굶주린 늑대 무리를 쓰러뜨렸다'];
  assert.deepEqual(path(won).map(x => x.startsWith('이미 일어남:')), [true, true, false]);
  assert.match(path(won)[2], /^북문 초소에서 에드리아 하르트.* → 에드리아가 늑대를 쫓아낸/);
  assert.ok(path(['전투: 승리 — 굶주린 늑대 무리를 쓰러뜨렸다', ...talked]).filter(x => x.startsWith('이미 일어남:')).length === 1, 'in order: wolves before the first talk do not count');
  assert.ok(path([...won, '시스템: 에드리아 하르트와의 대화가 끝났습니다.']).every(x => x.startsWith('이미 일어남:')));
});

// One story brings in 1~2 people (3 for a long one); after that the writer works with who was already met.
test('a story fills up with people', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game, goal = '근무 절차 확인하기';
  let s = { log: [], quests: [goal], relationships: [] } as unknown as Session;
  s = { ...s, storyNpcs: storyNpcsAfter(s, [{ name: '넬' }]), relationships: [{ id: 'a', name: '넬', relation: '', affection: 0 }] };
  assert.equal(storyCastFull(g, s), false);
  s = { ...s, storyNpcs: storyNpcsAfter(s, [...s.relationships!, { name: '실바엘' }]) };
  assert.equal(storyCastFull(g, s), true);
  assert.equal(storyCastFull(g, { ...s, quests: ['다른 일 하기'] }), false);
});

// A far place is reached through the near ones, and every place on the map can be reached.
test('map routes go through near places', () => {
  const map = games.flatMap(g => g.maps || []).find(m => m.pins.some(p => p.name === '레븐홀트') && m.pins.some(p => p.name === '사레타'))!;
  const at = (n: string) => map.pins.find(p => p.name === n)!;
  const near = reachablePins(map, at('레븐홀트')).map(p => p.name);
  console.log('레븐홀트 near:', near.join(', '), '| to 사레타:', mapRoute(map, at('레븐홀트'), at('사레타').id).map(p => p.name).join(' → '));
  assert.ok(near.length >= 1 && near.length < map.pins.length - 1);
  assert.ok(near.includes('그림우드') && !near.includes('해신의 섬'));
  assert.ok(mapRoute(map, at('레븐홀트'), at('사레타').id).length > 1);
  for (const a of map.pins) for (const b of map.pins) if (a.id !== b.id && a.kind !== 'event' && b.kind !== 'event' && a.kind !== 'exit') assert.ok(mapRoute(map, a, b.id).length > 0, a.name + ' → ' + b.name);
});

// Small things early are easy and pay little; a goal pays by where it came from (a duty briefing paid like the entrance exam).
test('weights set DC and pay', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game;
  assert.equal(questWeight(g, finaleQuest(g)!), 'decisive');
  assert.equal(questWeight(g, '침몰한 금고선'), 'normal');
  assert.equal(questWeight(g, '북문 초소 근무와 보고 절차 확인하기'), 'small');
  assert.equal(checkDc('small', 1), 4);
  assert.ok(checkDc('decisive', 99) <= 20);
  assert.ok(checkStakes('decisive', 5, 150).xp > checkStakes('small', 5, 150).xp * 5);
});

// A roll pays what its weight says, whatever numbers the bookkeeper wrote for the scene.
test('a won roll pays by weight', () => {
  const t = turns[0], g = gameOf(t.gameId), lv = t.session.level || 1;
  const dice = { ability: 'str', label: '표적 베기', dc: 14, weight: 'big' as const, die: 18, modifier: 0, total: 18, success: true, critical: '' };
  const r = applyReply(g, structuredClone(t.session), { ...structuredClone(t.data), goldDelta: 999, hpDelta: -30 }, t.message, { diceResult: dice });
  const pay = checkStakes('big', lv, maxHpOf(g, t.session));
  assert.equal((r.session.characterGold ?? 0) - (t.session.characterGold ?? 0), pay.gold);
  assert.ok(r.session.hp >= t.session.hp);
});

// Gear that raises max HP keeps a full hero full, and never heals one who took it off and put it back on.
test('gear refits HP', () => {
  const t = turns[0], g = gameOf(t.gameId);
  const bare = { ...structuredClone(t.session), equipped: {}, itemInfo: { 시험부적: { grade: 3, kind: 'accessory' } } } as Session;
  const worn = { ...bare, equipped: { accessory: '시험부적' } } as Session;
  const full = { ...bare, hp: maxHpOf(g, bare) };
  assert.ok(maxHpOf(g, worn) > maxHpOf(g, bare));
  assert.equal(refitHp(g, full, worn), maxHpOf(g, worn));
  assert.equal(refitHp(g, { ...bare, hp: 10 }, worn), 10);
});

// A failed roll never completes a goal (the exam was marked passed, with its reward, on the turn the hero failed it).
test('a lost roll finishes no goal', () => {
  const t0 = turns.find(x => Array.isArray(x.data.completedQuests) && (x.data.completedQuests as unknown[]).length) || turns[0], g = gameOf(t0.gameId);
  const dice = { ability: 'str', label: '검술 증명', dc: 6, weight: 'normal' as const, die: 1, modifier: 2, total: 3, success: false, critical: '대실패' };
  const r = applyReply(g, structuredClone(t0.session), structuredClone(t0.data), t0.message, { diceResult: dice });
  assert.ok(!r.session.log.some(l => l.startsWith('시스템: 목표 완료')));
});

// No main story: no act's foes are set; the final boss stays off stage until the finale (user, 2026-11-16).
test('the final boss stays off stage until the finale', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'));
  assert.ok(t0, 'fixture missing');
  const g = gameOf(t0.gameId), early = structuredClone(t0.session);
  const { now, later } = storyFoes(g, early);
  assert.ok(!now.includes(finalBoss(g)!) && later.includes(finalBoss(g)!), `now: ${now} later: ${later}`);
  assert.ok(!writerFoes(g, early).some(f => f.name === finalBoss(g)), 'the writer was offered the final boss in act 1');
});
// session 0wxcoq1ef: Lv.5 at 17% of the story. A finished goal lifts the hero to the level the new progress calls for.
test('a finished goal brings the hero up to the story level', () => {
  assert.deepEqual([0, 0.17, 0.25, 0.5, 0.75, 0.9, 1].map(storyLevel), [1, 17, 25, 50, 75, 90, 100]);
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const finish = (level: number) => run({ ...t0, session: { ...structuredClone(t0.session), level, xp: 0, storyPoints: 4, quests: ['떠돌이 상인 호위하기'] }, data: { ...t0.data, ambush: '', completedQuests: ['떠돌이 상인 호위하기'] } }).session;
  const low = finish(5), p = storyProgress(g, low)!;
  assert.ok(p.done > 4);
  assert.equal(low.level, storyLevel(p.done / p.total), 'caught up to the story');
  assert.equal(finish(30).level, 30, 'a hero already past it keeps the usual pay');
});
// Any finished goal moves the bar; the boss's story line (the old main story) carries 80% of it and, once done, opens the way
// to the final boss at once, at whatever percent: the player goes now or grows first (user 2026-11-20).
const doneLines = (qs: string[]) => qs.map(q => `시스템: 목표 완료 — ${q}`);
test('the boss story line opens the final boss; other goals fill the bar', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId), s = structuredClone(t0.session);
  const side = withStory(g, s, ['동네 꼬마의 잃어버린 고양이 찾기']);
  assert.ok((side.storyPoints || 0) > (s.storyPoints || 0));
  const line = mainChain(g)!.slice(0, -1), total = storyProgress(g, s)!.total;
  assert.equal(Math.round(storyPointsOf(g, line.map(st => st.q)) / total * 100), 80, 'the whole line is 80% of the bar');
  for (const main of ['잿빛 문장의 기사', '붉은 그릇', '바다 건너온 용병']) {
    const g2 = { ...g, wizardMain: main } as Game, l2 = mainChain(g2)!.slice(0, -1);
    assert.equal(Math.round(storyPointsOf(g2, l2.map(st => st.q)) / total * 100), 80, main);
  }
  const before = { ...s, log: [...s.log, ...doneLines(line.slice(0, -1).map(st => st.q))] };
  assert.ok(!bossOpen(g, before), 'the way opened before the line was done');
  const lastStep = line[line.length - 1].q;
  const late = withStory(g, { ...before, log: [...before.log, ...doneLines([lastStep])] }, [lastStep]);
  assert.ok(storyProgress(g, late)!.percent < 100, 'the line alone does not fill the bar');
  assert.equal(late.focus, finaleQuest(g));
  assert.ok(late.log.some(l => l.includes('최종 보스로 가는 길이 열렸습니다') && l.includes(bossPlace(g)!)), 'no word where the boss waits');
  assert.ok(!(late.quests || []).some(q => alikeQuest(q, mainChain(g)!.slice(-1)[0].q)), 'the boss step came as a second goal beside the finale');
  assert.ok(!storyFoes(g, late).now.includes(finalBoss(g)!), 'the final boss came to the player away from its place');
  const lair = (g.maps || []).flatMap(m => m.pins.map(p => ({ mapId: m.id, pinId: p.id, name: p.name }))).find(p => p.name === bossPlace(g))!;
  const there = { ...late, mapId: lair.mapId, pinId: lair.pinId, scenePlace: undefined };
  assert.ok(storyFoes(g, there).now.includes(finalBoss(g)!), 'the finale goal fights the final boss');
  assert.ok(writerFoes(g, there).some(f => f.name === finalBoss(g)), 'the writer may bring the final boss at its place');
  assert.ok(!storyFoes(g, { ...there, storyPoints: total, log: s.log }).now.includes(finalBoss(g)!), '100% by side goals opened the boss');
  const r = run({ ...t0, session: { ...late, bossDown: true } });
  assert.equal(r.session.goalCompleted, true);
  assert.equal(storyProgress(g, r.session)!.percent, 100, "the final boss down fills the bar");
  const boss = foesOf(defaultMapGenre(g)).find(x => x.name === finalBoss(g))!;
  assert.equal(foeLevel(g, late, boss), levelForTier(boss.power), "the final boss keeps its own level");
  const r2 = run({ ...t0, session: late, data: { ...t0.data, finalGoalCompleted: true } });
  assert.notEqual(r2.session.goalCompleted, true);
});
test('a foe met on a move blocks the way only after the arrival scene', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'));
  assert.ok(t0, 'fixture missing');
  const met = { npc: '굶주린 늑대 무리', monster: true, level: 2, lead: '그림우드에 들어서자' };
  const r = run({ ...t0, session: { ...structuredClone(t0.session), ambushNext: met }, data: { ...t0.data, ambush: '' } });
  assert.deepEqual(r.session.threat, met);
  assert.equal(r.session.ambushNext, undefined);
  assert.ok(r.session.log[r.session.log.length - 1].startsWith('시스템: 습격! 굶주린 늑대 무리'));
});
// Once the way is open the boss waits at its place and comes out when the player is there (user, 2026-11-16: "자연스럽게 최종 보스 위치로 가게").
test('the final boss waits at its place once its story line is done', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'));
  assert.ok(t0, 'fixture missing');
  const g = gameOf(t0.gameId), s0 = structuredClone(t0.session), place = bossPlace(g)!;
  // The map's own name for the story's place (data: 가라앉은 등대, map: 가라앉는 등대; 마탑 본탑 → 마탑 본부).
  assert.equal(place, '가라앉는 등대');
  assert.equal(bossPlace({ ...g, wizardMain: '붉은 그릇' } as Game), '마탑 본부');
  assert.equal(bossPlace({ ...g, wizardMain: '바다 건너온 용병' } as Game), '회색 탑 폐허');
  assert.ok(finaleQuest(g)!.startsWith(place) && goalPath(g, finaleQuest(g)!)[0].startsWith(place), 'the finale goal names the place');
  const line = mainChain(g)!.slice(0, -1);
  const turn = (sess: Session) => run({ ...t0, session: { ...sess, log: [...sess.log, ...doneLines(line.map(st => st.q))], quests: ['떠돌이 상인 호위하기'] }, data: { ...t0.data, ambush: '', completedQuests: ['떠돌이 상인 호위하기'] } });
  const away = turn(s0);
  assert.notEqual(away.session.threat?.npc, finalBoss(g), 'the boss came to the player away from its place');
  const pin = (g.maps || []).flatMap(m => m.pins.map(p => ({ mapId: m.id, pinId: p.id, name: p.name }))).find(p => p.name === place)!;
  const there = turn({ ...s0, mapId: pin.mapId, pinId: pin.pinId, scenePlace: undefined });
  assert.equal(there.session.threat?.npc, finalBoss(g));
});
// The GM is told the goal and its steps wherever the player is: blanked away from the goal's places, 회색 탑 had nothing to
// steer by for 13 turns in three runs. A talk's job rides along as other work, never as the current goal.
test('the GM always gets the current goal and its steps', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const pin = (n: string) => (g.maps || []).flatMap(m => m.pins.map(p => ({ mapId: m.id, pinId: p.id, name: p.name }))).find(p => p.name === n)!;
  const exam = '변경 기사단 입단 시험 통과하기';
  const away = { ...structuredClone(t0.session), mapId: pin('변경백가 영지').mapId, pinId: pin('변경백가 영지').pinId, scenePlace: undefined, quests: [exam], focus: exam, task: { text: '다른 짐승의 흔적 찾기', at: 0 } };
  const sent = gmGoal(g, away);
  assert.equal(sent.currentGoal, exam);
  assert.ok(sent.goalPath.length > 0 && sent.goalPath.some(x => x.includes('북문 초소')), 'steps name where to go');
  assert.deepEqual(sent.quests, [exam, '다른 짐승의 흔적 찾기'], 'the talk job rides along');
});
// Choices name people only once the hero has met them (넬 was sought by name before meeting her, 17 times in recorded play).
test('choices call people the hero has not met by how they look', () => {
  assert.equal(withoutUnmetNames('숲 가장자리에서 넬을 찾아 도움을 구한다.', []), '숲 가장자리에서 숲의 궁수를 찾아 도움을 구한다.');
  assert.equal(withoutUnmetNames('골목의 정보통 핍에게 거래를 건다.', []), '골목의 정보통에게 거래를 건다.', 'a title before the name is not doubled');
  assert.equal(withoutUnmetNames('에드리아에게 보고하고 핍과 함께 간다.', ['핍']), '은발의 기사단장에게 보고하고 핍과 함께 간다.', 'a first name alone is a name too; a met person keeps theirs');
});
// Choices head only where the story gave a reason (넬's talk ended on 회색 탑 with nothing pointing there, 2026-11-19).
test('a choice never heads to a place the story gave no reason for', () => {
  const places = ['회색 탑 폐허', '북문 초소', '그림우드'];
  assert.equal(placeReasoned('회색 탑 폐허로 가서 주변을 살핀다.', places, '넬: "돌아갈 때도 조심해."\n그림우드'), false);
  assert.equal(placeReasoned('회색 탑으로 간다.', places, '그림우드'), false, 'a name without its last word is the same place');
  assert.equal(placeReasoned('회색 탑으로 간다.', places, '에드리아: "회색 탑 폐허의 해골을 치우십시오."'), true, 'named in a talk');
  assert.equal(placeReasoned('북문 초소로 돌아가 보고한다.', places, '이미 일어남: 북문 초소에서 시험을 받는다'), true, 'named in the goal steps');
  assert.equal(placeReasoned('발자국을 따라간다.', places, ''), true, 'no place, no question');
});
// n22qfysdm: a letter written at 회색 탑 counted as its 맹세문 search, the step closed with neither the 맹세문 nor 에드리아's order
// ever told, and 다이어울프 came as the goal for no reason in the story. The game now tells the writer the beat and counts it once told.
test('a beat the writer was not told does not count, and the director sees where the story stands', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const tower = '회색 탑 폐허를 차지한 해골 병사 소탕하기';
  const s0 = { ...structuredClone(t0.session), mode: undefined, talkNpc: undefined, scenePlace: '회색 탑 폐허', quests: [tower], focus: tower, task: undefined, delivered: [] as string[],
    log: ['시스템: 새 목표 — ' + tower, '전투: 승리 — 해골 병사를 쓰러뜨렸다', '플레이어: 편지를 보낸다', 'GM: 【회색 탑 폐허 · 낮】 순찰병에게 편지를 맡긴다.'] };
  const left = (s: Session) => goalPath(g, tower, s).filter(x => !x.startsWith('이미')).length;
  assert.equal(left(s0), 2, 'a scene there with the beat untold is not the search');
  const due = dueBeat(g, s0);
  assert.equal(due?.do, 'search');
  assert.equal(dueBeat(g, s0, true), undefined, 'arriving is not searching');
  const res = applyReply(g, { ...s0, log: [...s0.log, '플레이어: 벽을 살핀다'] }, { text: '【회색 탑 폐허 · 낮】 벽에서 옛 맹세문이 드러난다.', choices: [] }, '벽을 살핀다').session;
  assert.deepEqual(res.delivered, [due!.then], 'told in a scene there: delivered');
  assert.equal(left(res), 1);
  const status = storyStatus(g, s0);
  assert.ok(status.some(l => l.startsWith('지금: ' + tower) && l.includes('맹세문')), 'the director gets the current step and what is left');
  assert.ok(status.some(l => l.startsWith('앞으로: ')));
  // session 0wxcoq1ef: the 맹세문 came in the scene right after the fight, no player line before it; told, so it counts.
  const fight = { ...s0, log: ['시스템: 새 목표 — ' + tower, '전투: 승리 — 해골 병사를 쓰러뜨렸다', '시스템: 전투 종료 — 승리'] };
  const after = applyReply(g, fight, { text: '【회색 탑 폐허 · 낮】 돌가루 아래에서 옛 맹세문이 드러난다.', choices: [] }, '전투 결과: 승리').session;
  assert.deepEqual(after.delivered, [due!.then]);
  assert.equal(left(after), 1, 'the scene after a fight there is the search once told');
});
test('a search inside the city the hero stands in is taken there, told and counted (파도의 성소 at 【사레타】)', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const goal = '파도의 성소와 항구 관측소에서 가문의 옛 기록 찾기';
  const map = (g.maps || []).find(m => m.pins.some(p => p.name === '사레타'))!, pin = map.pins.find(p => p.name === '사레타')!;
  const s0 = { ...structuredClone(t0.session), mode: undefined, talkNpc: undefined, mapId: map.id, pinId: pin.id, scenePlace: '사레타', quests: [goal], focus: goal, task: undefined, delivered: [] as string[],
    log: ['시스템: 새 목표 — ' + goal, '플레이어: 사제에게 문장이 지워진 까닭을 묻는다'] };
  assert.equal(dueBeat(g, s0), undefined, 'at 사레타 itself the search is not due');
  const there = toBeatPlace(g, s0);
  assert.equal(there.scenePlace, '파도의 성소');
  const due = dueBeat(g, there);
  assert.equal(due?.do, 'search');
  const res = applyReply(g, there, { text: '【사레타 · 낮】 사제가 성소 안쪽의 옛 기록을 펼친다.', choices: [] }, '사제에게 문장이 지워진 까닭을 묻는다').session;
  assert.deepEqual(res.delivered, [due!.then], 'the writer heading it 【사레타】 does not undo what the game handed over');
  assert.equal(goalPath(g, goal, res).filter(x => !x.startsWith('이미')).length, 1);
  assert.equal(toBeatPlace(g, { ...s0, pinId: 'nowhere' }).scenePlace, '사레타', 'outside its city nothing moves');
  assert.deepEqual(foundHere(g, there), [], 'nothing found here yet');
  assert.deepEqual(foundHere(g, res), [due!.then], 'once told, a look here again has nothing new');
});
test('one place decides a move: walks in town, pins with the spot, refusals, and the heading follows (진흙 골목 stall, 2026-11-20)', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const map = (g.maps || []).find(m => m.pins.some(p => p.name === '레븐홀트'))!, city = map.pins.find(p => p.name === '레븐홀트')!;
  const s0 = { ...structuredClone(t0.session), mode: undefined, talkNpc: undefined, mapId: map.id, pinId: city.id, scenePlace: '북문 초소', log: [] as string[] };
  assert.deepEqual(routeFor(g, s0, '장물 거래와 무기의 출처를 조사하러 진흙 골목으로 간다'), { place: '진흙 골목' }, 'a place in this city is a walk');
  assert.equal(routeFor(g, { ...s0, scenePlace: '진흙 골목' }, '진흙 골목으로 간다'), undefined, 'already there: no move, the action is played here');
  assert.equal(routeFor(g, s0, '장물아비를 다그친다'), undefined, 'no travel word, no move');
  const tower = routeFor(g, s0, '회색 탑 폐허로 간다');
  assert.equal(tower?.pin?.name ?? tower?.why?.slice(0, 6), tower?.pin ? '회색 탑 폐허' : '회색 탑 폐허', 'a world pin is a map move or a reason why not');
  const away = map.pins.find(p => p.name === '그림우드')!;
  const back = routeFor(g, { ...s0, pinId: away.id, scenePlace: undefined }, '북문 초소로 돌아가 보고한다');
  assert.equal(back?.pin?.name, '레븐홀트'); assert.equal(back?.place, '북문 초소', 'the city pin carries the spot the scene opens at');
  const wolves = routeFor(g, s0, '늑대 무리를 처리하러 그림우드 숲 가장자리로 간다');
  assert.equal(wolves?.pin?.name, '그림우드'); assert.equal(wolves?.place, '그림우드 숲 가장자리', 'a spot named after another pin is in that pin, not this city (stayed at 레븐홀트, 2026-11-20)');
  assert.deepEqual(routeFor(g, { ...s0, pinId: away.id, scenePlace: undefined }, '그림우드 숲 가장자리로 간다'), { place: '그림우드 숲 가장자리' }, 'at 그림우드 it is a walk');
  assert.match(placeHeading(g, { ...s0, scenePlace: '진흙 골목' }, '【북문 초소 · 낮】\n\n당신은 길을 나섭니다.'), /^【진흙 골목 · 낮】/, 'a heading naming another place is the game\'s place');
  assert.equal(placeHeading(g, { ...s0, pinId: away.id, scenePlace: undefined }, '【그림우드 숲 가장자리 · 낮】 x'), '【그림우드 숲 가장자리 · 낮】 x', 'a spot inside the pin stays as written');
  const res = applyReply(g, { ...s0, scenePlace: '진흙 골목' }, { text: '【북문 초소 · 낮】\n\n당신은 초소를 나섭니다.', choices: ['장물아비를 찾는다'] }, '조사한다').session;
  assert.equal(res.scenePlace, '진흙 골목', 'the writer\'s heading never moves the player');
});
test('auto-play puts on carried gear only when it raises 전투력', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const s0 = { ...structuredClone(t0.session), equipped: { weapon: '낡은 롱소드' }, inventory: ['낡은 롱소드', '좋은 검', '나쁜 검', '가죽 갑옷'],
    itemInfo: { '낡은 롱소드': { grade: 1, kind: 'weapon' }, '좋은 검': { grade: 3, kind: 'weapon' }, '나쁜 검': { grade: 0, kind: 'weapon' }, '가죽 갑옷': { grade: 1, kind: 'armor' } } } as Session;
  const s1 = bestGear(g, s0);
  assert.deepEqual(s1.equipped, { weapon: '좋은 검', armor: '가죽 갑옷' });
  assert.ok(playerPower(g, s1) > playerPower(g, s0));
  assert.equal(bestGear(g, s1), s1, 'nothing better left: unchanged');
});
test('the story may run ahead of its order: the next step\'s foe is fought at the player\'s level and passes the step before (넬\'s wyvern)', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const truth = '넬의 옛 파티가 몰살당한 날의 진실 듣기', wyvern = findFoe('fantasy', '와이번')!;
  const s0 = { ...structuredClone(t0.session), mode: undefined, level: 2, quests: [truth], focus: truth, delivered: [] as string[], log: ['시스템: 새 목표 — ' + truth] } as Session;
  assert.ok(storyFoes(g, s0).now.includes('와이번'), 'the next step\'s foe can be fought now');
  assert.equal(foeLevel(g, s0, wyvern, () => 0), 2, 'the story\'s foe: the player\'s level or one under, not Lv.48');
  assert.equal(foeLevel(g, s0, wyvern, () => 0.99), 1);
  assert.equal(foeLevel(g, s0, wyvern), foeLevel(g, s0, wyvern), 'met again at the same level: the same level');
  const wolves = findFoe('fantasy', '굶주린 늑대 무리')!, at10 = { ...s0, level: 10 };
  assert.deepEqual([foeLevel(g, at10, wolves, () => 0), foeLevel(g, at10, wolves, () => 0.99)], [9, 6], 'an ordinary monster: 1-4 under the player');
  assert.deepEqual(goalsFinished(g, s0), []);
  assert.deepEqual(goalsFinished(g, { ...s0, log: [...s0.log, 'GM: 【그림우드 · 낮】 협곡 아래에서 와이번의 날갯소리가 들린다.', '플레이어: 넬과 함께 둥지에서 돌아오는 와이번을 노린다'] }), [truth], 'the hero going after the wyvern in the scene moves the goal to the hunt');
  assert.deepEqual(goalsFinished(g, { ...s0, log: [...s0.log, '플레이어: 한나에게 와이번 이야기를 묻는다'] }), [], 'naming it with no wyvern in the scene is not going after it');
  const won = { ...s0, log: [...s0.log, '전투: 승리 — 와이번을 쓰러뜨렸다'] };
  assert.deepEqual(goalsFinished(g, won), [truth], 'the hunt done, the talk with 한나 is not waited for');
  const res = applyReply(g, won, { text: '【그림우드 · 낮】 넬이 화살을 바위에 꽂는다.', choices: [] }, '전투 결과: 승리').session;
  assert.deepEqual(questsOf(res).filter(q => /넬|와이번/.test(q)), [], 'both steps close: the hunt was already done');
});
test('only someone the scene names comes on stage (핍 guessed in at 북문 초소 vanished on arrival)', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const s0 = { ...structuredClone(t0.session), mode: undefined, talkNpc: undefined, combat: null, sceneNpcs: [] as string[], handledNpcs: [] as string[], log: ['플레이어: 진흙 골목으로 간다'] };
  const stage = (text: string, s = s0) => applyReply(g, s, { text, choices: [], presentNpcs: ['핍'] }, '진흙 골목으로 간다').session.sceneNpcs;
  assert.deepEqual(stage('【북문 초소 · 낮】 당신은 초소를 나서 진흙 골목으로 향합니다.'), []);
  assert.deepEqual(stage('【진흙 골목 · 낮】 낡은 천막 아래에서 핍이 손을 흔듭니다.'), ['핍']);
  assert.deepEqual(stage('【진흙 골목 · 낮】 키 작은 소년이 다가옵니다. 핍입니다.'), ['핍']);
  assert.deepEqual(stage('【진흙 골목 · 낮】 골목이 조용합니다.', { ...s0, sceneNpcs: ['핍'] }), ['핍'], 'someone already there stays');
});
test('a mid-reply gesture at a carried item reads as the item clue', () => {
  const inv = ['낡은 롱소드', '잿빛 갈매기 인장 반지'];
  assert.deepEqual(asideClue('에드리아 하르트', ['인장 반지를 잠시 바라보다'], inv), { item: '잿빛 갈매기 인장 반지', text: '에드리아 하르트가 인장 반지를 잠시 바라본다.' });
  assert.equal(asideClue('넬', ['반지를 들다'], ['은 반지'])?.text, '넬이 반지를 든다.');
  assert.equal(asideClue('넬', ['고개를 끄덕이다'], inv), null);
});

test('a roll counts only for what it changes later, and boss rolls wear the final boss down', () => {
  assert.equal(impactOf('전투'), 'combat');
  assert.equal(impactOf('이후'), 'later');
  assert.equal(impactOf('최종보스'), 'boss');
  assert.equal(impactOf('작음'), undefined);
  const t0 = turns.find(x => x.name.includes('다이어울프'));
  assert.ok(t0, 'fixture missing');
  const g = gameOf(t0.gameId), boss = finalBoss(g)!, s = { ...structuredClone(t0.session), lastCheck: null };
  assert.equal(fightEdge(g, { ...s, bossEdge: 2 }, boss).openCut, 0.2);
  assert.equal(fightEdge(g, { ...s, bossEdge: 9 }, boss).openCut, 0.3, 'capped at 30%');
  assert.equal(fightEdge(g, { ...s, bossEdge: 2 }, '회색 늑대').openCut, 0, 'only the final boss');
});

test('a temporary companion stays for its job and goes home when it is done', () => {
  const s = { ...structuredClone(turns[0].session), quests: ['늑대 처리하기'], party: ['에드리아 하르트', '넬'], tempParty: { '에드리아 하르트': '늑대 처리하기' }, tempSince: { '에드리아 하르트': -99 } };
  assert.equal(dismissTemps(s), s, 'job still open');
  const done = dismissTemps({ ...s, quests: [] });
  assert.deepEqual(done.party, ['넬'], 'only the temporary one leaves');
  assert.deepEqual(done.tempParty, {});
  assert.match(done.log.at(-1)!, /에드리아 하르트.*임시 동행을 끝내고/);
});

test('someone who agreed to come along joins at once for any job, and stays at least three actions', () => {
  const base = { ...structuredClone(turns[0].session), quests: [], party: [], tempParty: {} };
  const along = joinTemp(base, '브리아', '들것 옮기기');
  assert.deepEqual(along.party, ['브리아'], 'no foe needed');
  assert.equal(along.tempParty?.['브리아'], '들것 옮기기');
  assert.deepEqual(dismissTemps(along).party, ['브리아'], 'job done at once: stays until three actions have passed');
  assert.deepEqual(dismissTemps({ ...along, tempSince: { '브리아': playerActs(base) - 3 } }).party, []);
  assert.deepEqual(dismissTemps({ ...base, tempPending: { npc: '넬', goal: '발자국 추적하기' } }).party, ['넬'], 'an old save joins too');
});

test('넬 is always in 그림우드 sketch; once she agrees in a talk she guides while there and stays behind on leaving', () => {
  const g = gameOf(turns[0].gameId), base = { ...structuredClone(turns[0].session), quests: [], party: [], tempParty: {}, sceneNpcs: [], task: undefined };
  const arrived = withGuides(base, '그림우드');
  assert.deepEqual(arrived.party, [], 'not out of nowhere');
  assert.ok(!arrived.sceneNpcs?.includes('넬'), 'she comes in through the story, not on arrival');
  assert.equal(guideOf(g, arrived, '그림우드'), '넬', 'the director must put her in the sketch');
  const inWood = joinTemp(arrived, '넬', guideGoal('그림우드'));
  assert.equal(guideOf(g, inWood, '그림우드'), '', 'already along: no new request');
  assert.deepEqual(dismissTemps({ ...inWood, tempSince: { '넬': -99 } }).party, ['넬'], 'not dismissed after three actions');
  const out = withGuides(inWood, '회색 탑 폐허');
  assert.deepEqual(out.party, []);
  assert.match(out.log.at(-1)!, /넬.*그림우드에 남습니다/);
});

test('the hidden task runs behind, a met person brings their own story, an emptied list takes the next main step', () => {
  const g = gameOf(turns[0].gameId), base = { ...structuredClone(turns[0].session), quests: ['변경 기사단 입단 시험 통과하기', '천 조각 쪽을 살핀다'], focus: '천 조각 쪽을 살핀다', focusAt: 0 };
  const took = { ...base, task: { text: '늑대 무리 처리하기', at: base.log.length } };
  const along = { ...took, party: ['브리아'], tempParty: { '브리아': '늑대 무리 처리하기' }, tempSince: { '브리아': -99 } };
  assert.deepEqual(dismissTemps(along).party, ['브리아'], 'stays while the task is open');
  assert.deepEqual(dismissTemps({ ...along, task: undefined }).party, []);
  const met = { ...base, relationships: [{ id: 'x', name: '넬', relation: '', affection: 0 }] };
  assert.ok(personalStories(g, met).some(l => l.startsWith('넬 — 넬의 마지막 사냥')));
  assert.ok(!personalStories(g, { ...met, relationships: [] }).some(l => l.includes('넬의 마지막 사냥')), 'not before meeting');
  const knight = { ...g, wizardMain: '잿빛 문장의 기사' } as Game, first = '변경 기사단 입단 시험 통과하기', second = '견습 순찰로 진흙 골목의 장물 거래 단속하기';
  const emptied = withNextMain(knight, base, { quests: [], added: [], done: [first] });
  assert.deepEqual(emptied.quests, [second], 'the list never stays empty');
  assert.deepEqual(withNextMain(knight, { ...base, log: [...base.log, `시스템: 목표 포기 — ${second}`] }, { quests: [], added: [], done: [first] }).quests.length, 1);
  assert.notEqual(withNextMain(knight, { ...base, log: [...base.log, `시스템: 목표 포기 — ${second}`] }, { quests: [], added: [], done: [first] }).quests[0], second, 'a given-up step is skipped');
  assert.deepEqual(withNextMain(knight, base, { quests: ['넬의 마지막 사냥'], added: [], done: [] }).quests, ['넬의 마지막 사냥', first], 'an open goal stays, and a main step is always open beside it');
  assert.deepEqual(withNextMain(knight, base, { quests: ['넬의 마지막 사냥', first], added: [], done: [] }).quests, ['넬의 마지막 사냥', first], 'an open main step is left alone');
  // 2026-11-17 run: 장물 단속 done beside the wolf job; the next main step comes anyway, or 회색 탑 had no goal.
  assert.deepEqual(withNextMain(knight, base, { quests: ['북문 밖 굶주린 늑대 무리 쫓아내기'], added: [], done: [second] }).quests, ['북문 밖 굶주린 늑대 무리 쫓아내기', '장물아비가 빼돌린 물건의 행방 쫓기'], 'a main step done hands on to the next');
  // Its last beat was a fight: the game closes it once the log shows both beats, no bookkeeper word needed.
  const raid = { ...base, quests: [second], log: ['시스템: 새 목표 — ' + second, '플레이어: 창고를 뒤진다', 'GM: 【진흙 골목 · 낮】 무기 더미'] };
  assert.deepEqual(goalsFinished(knight, raid), [], 'one beat left');
  assert.deepEqual(goalsFinished(knight, { ...raid, log: [...raid.log, '전투: 승리 — 뒷골목 불량배를 쓰러뜨렸다'] }), [second]);
  // cjkirq5ma: the kill alone closed 해골 병사 소탕 and skipped its 맹세문 and report; a plain hunt job still closes on the kill.
  const tower = '회색 탑 폐허를 차지한 해골 병사 소탕하기', troll = '북쪽 숲길을 막은 숲 트롤 토벌하기';
  const won = { ...base, quests: [tower, troll], log: ['시스템: 새 목표 — ' + tower, '전투: 승리 — 해골 병사를 쓰러뜨렸다', '전투: 승리 — 숲 트롤을 쓰러뜨렸다'] };
  assert.deepEqual(goalsFinished(knight, won), [troll], 'beats left: 소탕 stays open; the hunt job closes on the kill');
  assert.deepEqual(goalsFinished(knight, { ...won, log: ['전투: 승리 — 숲 트롤을 쓰러뜨렸다', '시스템: 새 목표 — ' + troll] }), [], 'a kill before the job was set does not count');
  // A main step just added takes the focus from an older side goal (회색 탑 was steered by 성채 냉실).
  assert.equal(focusAfter(knight, '', ['성채 지하 냉실 문 열기', tower], [tower]), tower);
  assert.equal(focusAfter(knight, '성채 지하 냉실 문 열기', ['성채 지하 냉실 문 열기', '넬의 옛 파티가 몰살당한 날의 진실 듣기'], ['넬의 옛 파티가 몰살당한 날의 진실 듣기']), '성채 지하 냉실 문 열기', 'an offer still does not take it');
  // 에드리아 hands out a later main step while one is open: no goal, not her own 성채 냉실.
  const chasing = { ...base, quests: ['장물아비가 빼돌린 물건의 행방 쫓기'], log: [...base.log, '시스템: 목표 완료 — ' + first, '시스템: 목표 완료 — ' + second] };
  assert.equal(preparedGoal(knight, chasing, '회색 탑 폐허의 해골 병사들을 처치한다', '에드리아 하르트'), '');
  const hunt = { ...base, quests: ['넬의 마지막 사냥'], party: [], tempParty: {} };
  assert.equal(ownStoryOpen(g, hunt.quests, '넬'), '넬의 마지막 사냥', "넬's offer joins her open story");
  assert.equal(ownStoryOpen(g, hunt.quests, '브리아'), undefined);
});

test('goodwill rises once per liked deed in five actions, and a first impression starts low', () => {
  const t = turns[0], g = gameOf(t.gameId), s = structuredClone(t.session);
  const who = (s.relationships || [])[0]?.name;
  if (who) {
    const up = { relationshipUpdates: [{ name: who, met: false, relation: '', affectionChange: 5, because: '좋아하는 일' }] };
    const one = applyReply(g, s, { ...structuredClone(t.data), ...up }, t.message, t.ctx || {}).session;
    const two = applyReply(g, one, { ...structuredClone(t.data), ...up }, t.message, t.ctx || {}).session;
    const a = (x: typeof s) => x.relationships!.find(r => r.name === who)!.affection;
    assert.equal(a(two), a(one), 'the same like again right away adds nothing');
  }
  const fresh = applyReply(g, { ...s, relationships: [] }, { ...structuredClone(t.data), text: '새로운 넬이 있다', relationshipUpdates: [{ name: '넬', met: true, relation: '초면', affection: 40 }] }, t.message, t.ctx || {}).session;
  const nel = fresh.relationships!.find(r => r.name === '넬');
  if (nel) assert.ok(nel.affection <= 10, 'first impression capped');
});

test('an offer joins the list without taking over the current goal', () => {
  const exam = '변경 기사단 입단 시험 통과하기', offer = '이끼골에서 사라진 주민을 찾아라';
  assert.equal(heldGoal(exam, [exam, offer], [offer]), exam);
  assert.equal(heldGoal('늑대 무리 처리하기', [exam, offer], [offer]), exam, 'the current one just ended: the older one leads');
  assert.equal(heldGoal('', [offer], [offer]), offer, 'nothing older: the offer is all there is');
});
// Level-ups hand out stat points the player places; 전투력 and the odds read the same numbers the fight uses.
test('level-ups place their points by who the hero started as, and a stronger foe reads as riskier', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId), s0 = { ...structuredClone(t0.session), statPoints: 0, level: 3 };
  const val = (x: Session, k: string) => Number(x.characterValues?.[k] ?? growthFields(g).find(f => f.id === k)?.initial);
  const knight = growStats({ ...g, wizardStart: '몰락 기사 가문의 후계자' }, s0, 2).session;
  assert.equal(knight.statPoints, undefined, 'nothing left to place by hand');
  assert.equal(val(knight, 'strength') - val(s0, 'strength'), 5, 'a knight grows 근력 2.5 a level');
  assert.equal(val(knight, 'agility') - val(s0, 'agility'), 1);
  assert.equal(val(knight, 'intelligence'), val(s0, 'intelligence'), 'and never 지능 (7 levels went there before)');
  const mage = growStats({ ...g, wizardStart: '마탑 탈주 견습생' }, s0, 2).session;
  assert.equal(val(mage, 'intelligence') - val(s0, 'intelligence'), 5, 'the runaway mage grows 지능');
  assert.equal(val(mage, 'strength'), val(s0, 'strength'));
  const rookie = { ...g, wizardStart: '신입 모험가' }, both = growStats(rookie, s0, 2).session;
  for (const k of ['strength', 'intelligence', 'agility']) assert.equal(val(both, k) - val(s0, k), 2, 'the new adventurer grows every way: ' + k);
  assert.ok(heroFits(rookie, s0)('견습 마법 지팡이', 'weapon') && heroFits(rookie, s0)('낡은 롱소드', 'weapon'), 'and may take a staff or a sword');
  assert.ok(!heroFits({ ...g, wizardStart: '몰락 기사 가문의 후계자' }, s0)('견습 마법 지팡이', 'weapon'));
  assert.equal(val(growStats({ ...g, wizardStart: '몰락 기사 가문의 후계자' }, { ...s0, statPoints: 4 }, 1).session, 'strength') - val(s0, 'strength'), 7, 'points an older save left unplaced are placed too');
  const s = { ...s0, level: 8, hp: 200 }, odds = (lv: number) => fightOdds(g, s, foeCombat({ npc: '해골 병사', monster: true }, 3, lv));
  assert.ok(odds(4).ratio > odds(8).ratio && odds(8).ratio > odds(12).ratio);
  assert.ok(odds(4).power < odds(12).power);
  // The two 전투력 compare the way the fight goes: the side shown stronger wins most of the time (Lv.18 read 1,109 vs 2,370 in a won fight).
  // Lv.16, not 14: with 투지 the Lv.8 knight wins about half the Lv.14 fights (2026-11-20).
  for (const lv of [4, 16]) { const o = odds(lv); assert.equal(o.mine > o.power, o.winRate > 0.5, `Lv.${lv}: 나 ${o.mine} 적 ${o.power} 승률 ${o.winRate}`); }
  assert.ok(playerPower(g, spendStat(g, { ...s, statPoints: 1 }, growthFields(g)[0].id)) >= playerPower(g, s));
});
// 투지 (user 2026-11-20: the knight never spent mana): a fighter's mana fills by fighting and, full, becomes a 필살기.
test('a fighter\'s mana is 투지: filled by fighting, spent on a sure-hit finisher', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const s = { ...structuredClone(t0.session), level: 8, hp: 200, equipped: {}, mode: 'combat' } as Session;
  const fight = foeCombat({ npc: '해골 병사', monster: true }, 3, 8);
  assert.ok(gritOf(g, s), 'a hero with no staff fights on 투지');
  const step = (x: Session) => autoBattleStep(g, { ...x, combat: { ...fight, ...x.combat, round: Math.max(1, x.combat?.round || 0), lethal: true } });
  const max = maxManaOf(g, s);
  let x: Session = { ...s, mana: 0, combat: { ...fight, lethal: true } }, rose = false;
  for (let k = 0; k < 6 && !x.combat?.result; k++) { const before = x.mana || 0; x = step(x); rose ||= (x.mana || 0) > before; }
  assert.ok(rose, '투지 never rose in a fight');
  // Blows in a row fill it faster, and the log says so.
  let streak = false;
  for (let i = 0; i < 40 && !streak; i++) { let y: Session = { ...s, mana: 0, combat: { ...fight, lethal: true } }; for (let k = 0; k < 6 && !y.combat?.result; k++) y = step(y); streak = y.log.some(l => /연속 \d회 — 마나 \+\d+/.test(l)); }
  assert.ok(streak, 'no faster fill for a run of blows');
  const full = step({ ...s, mana: max, combat: { ...fight, lethal: true } });
  assert.ok(full.log.some(l => l.includes(`필살기 「${finisherOf(g)}」`)) && full.combat?.last?.finisher === finisherOf(g) && full.log.some(l => l.includes('필살기 명중')), 'no finisher at full 투지');
  assert.ok((full.mana || 0) < max, 'the finisher did not spend 투지');
  // Out of a fight 투지 stays where it is (a caster's mana comes back by itself).
  const r = run({ ...t0, session: { ...structuredClone(t0.session), mode: undefined, mana: 3 } as unknown as Session });
  assert.equal(r.session.mana, 3);
});

test('public beta visitors get a daily AI budget per address once signed in; local play is never limited', async () => {
  process.env.BETA_DATA_DIR = require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'beta-'));
  const { aiAllowed, CALLS_PER_VISITOR } = await import('../app/_lib/beta');
  const { signInWith } = await import('../app/_lib/beta-accounts');
  const signed = signInWith('kakao', '1', '가', '') as { token: string };
  const req = (ip?: string, token = signed.token) => new Request('http://x/api/gm', { headers: { ...(ip ? { 'cf-connecting-ip': ip } : {}), cookie: `crpg-session=${token}` } });
  assert.equal(aiAllowed(req('6.6.6.6', '')), false, 'not signed in');
  for (let i = 0; i < CALLS_PER_VISITOR; i++) assert.ok(aiAllowed(req('9.9.9.9')));
  assert.equal(aiAllowed(req('9.9.9.9')), false, 'over the budget');
  assert.ok(aiAllowed(req('9.9.9.8')), 'another visitor still plays');
  assert.ok(aiAllowed(req()), 'local');
  assert.ok(aiAllowed(req('7.7.7.7'), false) && aiAllowed(req('7.7.7.7'), false), 'the scene-writing half is not counted');
});

test('each signed-in beta player gets 500 turns from sign-up, remembered on disk, and seats are the accounts (200)', async () => {
  const dir = process.env.BETA_DATA_DIR!;
  const { turnAllowed } = await import('../app/_lib/beta');
  const { signInWith, MAX_ACCOUNTS, DEFAULT_TURNS, listAccounts } = await import('../app/_lib/beta-accounts');
  const req = (token = '') => new Request('http://x/api/gm', { headers: { 'cf-connecting-ip': '5.5.5.5', cookie: `crpg-session=${token}` } });
  assert.equal(turnAllowed(req()), false, 'a visitor not signed in plays no turn');
  const a = signInWith('kakao', '100', '가', 'aaaaaaaaaaaa') as { token: string; pid: string };
  assert.equal(a.pid, 'aaaaaaaaaaaa', 'the save made before signing in carries over');
  for (let i = 0; i < DEFAULT_TURNS; i++) assert.ok(turnAllowed(req(a.token)));
  assert.equal(turnAllowed(req(a.token), false), false, 'used up');
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'turns.json'), 'utf8')).aaaaaaaaaaaa, DEFAULT_TURNS);
  assert.equal((signInWith('kakao', '100', '가', 'zzzzzzzzzzzz') as { pid: string }).pid, a.pid, 'the same account on the next sign-in, from another browser');
  const b = signInWith('kakao', '200', '나', '') as { token: string };
  assert.ok(turnAllowed(req(b.token)), 'another player');
  for (let i = listAccounts().length; i < MAX_ACCOUNTS; i++) signInWith('google', String(i), '', '');
  assert.ok('error' in signInWith('kakao', '999', '', ''), 'seats full: a newcomer is turned away');
  assert.ok('token' in signInWith('kakao', '200', '나', ''), 'a member still signs in');
});

test('beta dashboard: stuck after 10 turns on one goal, gone after 24h, bugs from errors, broken lines and feedback', async () => {
  const { betaReport, stuckReasons } = await import('../app/_lib/beta-report');
  const now = Date.parse('2026-11-20T12:00:00Z'), ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const acts = (n: number, a = (i: number) => `플레이어: 길을 살핀다 ${i}`) => Array.from({ length: n }, (_, i) => a(i));
  const base = { gameId: 'g1', x: 0, y: 0, hp: 10, roll: null, suggestedActions: ['가기'] } as unknown as Session;
  const s = (log: string[], extra: Partial<Session> = {}) => ({ ...base, log, ...extra }) as Session;
  assert.deepEqual(stuckReasons(s(['프롤로그: 시작', '시스템: 새 목표 — 늑대', ...acts(9)])), [], '9 turns is fine');
  assert.match(stuckReasons(s(['프롤로그: 시작', '시스템: 새 목표 — 늑대', ...acts(10)])).join(), /10턴째/);
  assert.deepEqual(stuckReasons(s([...acts(12), '시스템: 목표 완료 — 늑대', ...acts(2)])), [], 'counted from the last goal change');
  assert.match(stuckReasons(s(['프롤로그', ...acts(3, () => '플레이어: 문을 연다!')])).join(), /같은 행동/);
  assert.match(stuckReasons(s(['프롤로그', '플레이어: 간다'], { suggestedActions: [] })).join(), /선택지/);
  assert.deepEqual(stuckReasons(s(['프롤로그', '플레이어: 간다'], { suggestedActions: [], mode: 'talk' })), [], 'a talk has its own choices');

  const ev = (pid: string, h: number, kind: string, extra = {}) => ({ at: ago(h), kind, pid, ip: '1.1.1.1', country: 'KR', ua: 'x', ...extra });
  const report = betaReport([
    ev('aaaaaaaaaaaa', 30, 'visit'), ev('aaaaaaaaaaaa', 29, 'turn', { action: '간다' }),
    ev('bbbbbbbbbbbb', 2, 'visit'), ev('bbbbbbbbbbbb', 1, 'error', { where: 'gm', message: 'boom' }),
    ev('bbbbbbbbbbbb', 1, 'feedback', { text: '선택지가 안 나와요', gameId: 'g1' }),
  ], [
    { gameId: 'g1', pid: 'aaaaaaaaaaaa', session: s(['프롤로그', '시스템: 새 목표 — 늑대', '플레이어: 간다']) },
    { gameId: 'g1', pid: 'bbbbbbbbbbbb', session: s(['프롤로그', '시스템: 새 목표 — 늑대', ...acts(11), '시스템: AI 요청 실패', '시스템: 오늘 이용할 수 있는 양을 모두 사용했습니다.']) },
  ], [{ id: 'g1', name: '서울' }], new Set(), now);
  assert.deepEqual([report.summary.dropped, report.summary.stuck, report.summary.unread], [1, 1, 1]);
  assert.equal(report.drop.byTurns.find(([l]) => l === '1~10턴')![1], 1, 'a left after one turn');
  assert.equal(report.stuck[0].pid, 'bbbbbbbbbbbb');
  // Play time: turns 2 and 3 minutes apart count, a 2-hour break counts as a minute.
  const timed = betaReport([ev('cccccccccccc', 3, 'turn'), ev('cccccccccccc', 3 - 2 / 60, 'turn'), ev('cccccccccccc', 3 - 5 / 60, 'turn'), ev('cccccccccccc', 1, 'turn')], [], [], new Set(), now).players[0];
  assert.deepEqual([timed.playMinutes, timed.turns], [7, 4]);
  assert.deepEqual(report.bugs.map(b => b.source).sort(), ['기록', '서버', '의견'], 'the usage limit line is not a bug');
});

// The 2026-11-19 alpha playtest (100 turns), replayed from its own recorded turns.
const playtest = (n: string) => { const x = turns.find(t => t.name.includes(n)); assert.ok(x, `fixture missing: ${n}`); return x!; };
const replay = (x: Turn, s = x.session) => applyReply(gameOf(x.gameId), structuredClone(s), structuredClone(x.data), x.message, x.ctx || {});

test('playtest 1119: the numbers are the game\'s (no second hit after a won fight, no echoed damage, no clawed-back reward)', () => {
  const skel = playtest('해골 병사 win'), after = replay(skel).session;
  assert.ok(after.hp >= skel.session.hp && !after.dead, 'the fight already took its 68; the scene after it does not take it again');
  const talk = playtest('echoing the last fight');
  assert.ok(replay(talk).session.hp >= talk.session.hp, 'a talk does not repeat the last fight\'s -11');
  const claw = playtest('taken back'), r = replay(claw).session;
  assert.deepEqual([r.characterGold, r.reputation], [claw.session.characterGold, claw.session.reputation], 'the roll\'s +40 gold and +30 fame stay');
  const early = playtest('gold -2');
  assert.equal(replay(early).session.characterGold, early.session.characterGold, 'no price was named, nothing paid');
  const pay = playtest('pays 3 gold');
  assert.equal(replay(pay).session.characterGold, (pay.session.characterGold ?? 0) - 3, 'paid in the player\'s own words');
  const g = gameOf(skel.gameId), failed = { ...structuredClone(skel.session), lastCheck: { success: false } as unknown as Session['lastCheck'] };
  assert.equal(fightEdge(g, failed, '해골 병사').hp, failed.hp, 'a failed roll costs its HP once, not again when the fight starts');
});

test('playtest 1119: a decision is offered word for word, and the story\'s fight comes where it waits', () => {
  const dec = playtest('follows the footprints'), g = gameOf(dec.gameId), q = '엘프와 변경백가가 부딪치기 전에 사태 수습하기';
  const r = replay(dec).session, options = pendingChoice(g, r);
  assert.equal(options.length, 2, 'the reworded pick did not decide');
  assert.ok(options.every(o => (r.suggestedActions || []).includes(o)), 'the game offers the options themselves');
  const picked = { ...r, log: [...r.log, `플레이어: ${options[1]}`] };
  assert.deepEqual(pendingChoice(g, picked), []);
  assert.ok(goalsFinished(g, picked).includes(q), 'picking an offered option is the decision');
  const tower = playtest('in 회색 탑');
  assert.equal(beatFoe(g, tower.session), '심연의 사도 광신도', 'the next step\'s fight waits in the tower');
  assert.equal(replay(tower).session.threat?.npc, '심연의 사도 광신도', 'the game sets it on the hero');
  const won = { ...tower.session, log: [...tower.session.log, '전투: 승리 — 심연의 사도 광신도를 쓰러뜨렸다'] };
  assert.ok(goalsFinished(g, won).includes(q), 'the rescue begun passes the decision it ran ahead of');
  // Live test 1120: finishing the decision put an older 입단 시험 on screen, so the tower's foe never came.
  const rescue = '회색 탑 폐허 지하에서 실종자들 구해 내기';
  assert.equal(focusAfter(g, q, ['변경 기사단 입단 시험 통과하기', rescue], [rescue]), rescue, 'the next step of the story just finished is the goal');
});

test('playtest 1119: a won fight closes its goal at once, and the scene after it does not close it again', () => {
  const won = playtest('goal ends on the win'), g = gameOf(won.gameId);
  const settled = applyReply(g, structuredClone(won.session), {}, '전투 결과:', { settle: true });
  assert.ok(settled.questClear?.quests.some(x => x.name.includes('장물 거래')), 'clear window on the win');
  assert.ok(!settled.session.log.slice(won.session.log.length).some(l => l.startsWith('GM:')), 'nothing is written when settling');
  assert.equal(replay(won, settled.session).questClear, undefined, 'the scene after does not close or pay it twice');
});

test('playtest 1119: the story\'s fight gives the hero a few actions after they flee it', () => {
  const tower = playtest('in 회색 탑'), g = gameOf(tower.gameId), foe = '심연의 사도 광신도';
  const fled = { ...tower.session, log: [...tower.session.log, `시스템: 도망 성공 — ${foe}에게서 벗어났습니다.`] };
  assert.equal(beatFoe(g, fled), undefined, 'not straight back');
  const later = { ...fled, log: [...fled.log, '플레이어: 숨을 고른다', '플레이어: 주위를 살핀다', '플레이어: 다시 안으로 들어간다'] };
  assert.equal(beatFoe(g, later), foe, 'it waits for them to come back');
});

test('inventory clean-up sells unworn gear by grade, never tools, potions or the prologue ring', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game;
  const s = { ...structuredClone(playtest('해골 병사 win').session), inventory: ['낡은 롱소드', '녹슨 단검', '회복 물약', '잿빛 갈매기 인장 반지', '은 반지'], equipped: { weapon: '낡은 롱소드' }, characterGold: 10,
    itemInfo: { '낡은 롱소드': { grade: 0, kind: 'weapon' }, '녹슨 단검': { grade: 0, kind: 'weapon' }, '회복 물약': { grade: 0, kind: 'item' }, '잿빛 갈매기 인장 반지': { grade: 0, kind: 'item' }, '은 반지': { grade: 1, kind: 'accessory' } } } as Session;
  assert.deepEqual(junkOf(g, s), ['녹슨 단검', '은 반지']);
  const sold = sellJunk(g, s);
  assert.deepEqual(sold.inventory, ['낡은 롱소드', '회복 물약', '잿빛 갈매기 인장 반지']);
  assert.equal(sold.characterGold, 10 + 5 + 15);
});

test('reward gear fits the hero who started: staffs and robes for the mage, weapons for the knight', async () => {
  const { gearName, fitsHero, isStaff, isRobe } = await import('../app/_lib/items');
  for (let i = 0; i < 40; i++) {
    const mage = gearName('fantasy', 'weapon', (i % 4) as 0 | 1 | 2 | 3, () => false, Math.random, fitsHero(true));
    const knight = gearName('fantasy', 'weapon', (i % 4) as 0 | 1 | 2 | 3, () => false, Math.random, fitsHero(false));
    if (mage?.kind === 'weapon') assert.ok(isStaff(mage.name), mage.name);
    if (knight?.kind === 'weapon') assert.ok(!isStaff(knight.name), knight.name);
    const coat = gearName('fantasy', 'armor', (i % 4) as 0 | 1 | 2 | 3, () => false, Math.random, fitsHero(false));
    if (coat?.kind === 'armor') assert.ok(!isRobe(coat.name), coat.name);
  }
});

test('a roll costs and pays by its situation: money, a person, a thing, a name, else the body; a 20 pays more', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game;
  const s = { ...structuredClone(playtest('해골 병사 win').session), characterGold: 100, reputation: 200, inventory: ['회복 물약', '낡은 롱소드'], equipped: { weapon: '낡은 롱소드' }, itemInfo: { '회복 물약': { grade: 0, kind: 'item' } },
    relationships: [{ id: 'r1', name: '레지나 발트', affection: 20, relation: '지인' }] } as unknown as Session;
  const c = (failure: string, success = '') => ({ weight: 'normal' as const, dc: 12, failure, success });
  const money = rollOutcome(g, s, c('뇌물이 통하지 않아 돈만 날린다'), false);
  assert.ok(money.kind === 'money' && money.gold < 0 && money.hp === 0, JSON.stringify(money));
  const person = rollOutcome(g, s, c('레지나 발트의 신뢰가 흔들린다'), false);
  assert.deepEqual([person.kind, person.person?.name, person.hp], ['person', '레지나 발트', 0]);
  const thing = rollOutcome(g, s, c('품에 넣은 물건을 떨어뜨려 잃는다'), false);
  assert.deepEqual([thing.kind, thing.item], ['thing', '회복 물약'], 'the potion, never the worn sword');
  const nobody = rollOutcome(g, { ...s, relationships: [] }, c('누군가의 신뢰를 잃는다'), false);
  assert.ok(nobody.kind === 'body' && nobody.hp > 0, 'no one to lose: the body pays');
  const win = rollOutcome(g, s, c('', '흥정에 성공해 값을 깎는다'), true), crit = rollOutcome(g, s, c('', '흥정에 성공해 값을 깎는다'), true, '대성공');
  assert.ok(win.gold > 0 && crit.gold > win.gold && crit.xp > win.xp && !!crit.gear, 'a natural 20 pays more and always gear');
});
test('playtest 1120: gold in words, things taken by hand, relations, a paid tip, unmet names', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  assert.ok(amountsIn('좋아요. 두 골드 드릴 테니').includes(2) && amountsIn('열다섯 닢 줄게').includes(15) && amountsIn('30골드').includes(30));
  assert.ok(!amountsIn('한 번 더 본다').length, 'a count that is not money');
  assert.ok(tookItem('창고에 들어가 잿빛 갈매기 문장이 새겨진 검을 챙겨 천으로 감싸 든다', '잿빛 갈매기 문장의 기사검'));
  assert.ok(!tookItem('검을 상자에 돌려놓는다', '잿빛 갈매기 문장의 기사검'), 'put back, not taken');
  const r = { id: 'x', name: '에드리아 하르트', relation: '초면', affection: 30 };
  assert.equal(relationOf(g, [], r), '지인', 'met before: no longer 초면');
  assert.equal(relationOf(g, [], { ...r, affection: 45 }), '친구');
  assert.equal(relationOf(g, ['에드리아 하르트'], r), '동료');
  const goal = '장물아비가 빼돌린 물건의 행방 쫓기';
  const s = { ...structuredClone(t0.session), quests: [goal], focus: goal, focusAt: 0, delivered: [], characterGold: 60, mode: 'talk', talkNpc: '핍', log: ['시스템: 새 목표 — ' + goal, '시스템: 핍과 대화를 시작했습니다.'] } as Session;
  assert.equal(dueBeat(g, s), undefined, 'the tip waits for the price');
  assert.match(priceAsk(g, s), /3골드/);
  const offered = { ...s, log: [...s.log, '대화-나: 값은 치를게요. 궤짝이 어디로 가는지 말해 주세요.'] };
  assert.equal(dueBeat(g, offered)?.do, 'talk', 'offered: told now');
  assert.equal(dueBeat(g, { ...offered, characterGold: 1 }), undefined, 'not with an empty purse');
  assert.equal(unnamedScene('핍이 손을 내민다. "난 핍이야."', []), '골목의 정보통이 손을 내민다. "난 핍이야."', 'by look outside quotes, the name kept in what is said');
});
test('a talk beat answers what the player says, not the opening reply (에드리아, 2026-11-20)', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId), goal = '변경 기사단 입단 시험 통과하기';
  const s = { ...structuredClone(t0.session), quests: [goal], focus: goal, focusAt: 0, delivered: [], mode: 'talk', talkNpc: '에드리아 하르트', log: ['시스템: 새 목표 — ' + goal, '시스템: 에드리아 하르트와 대화를 시작했습니다.'] } as Session;
  assert.equal(dueBeat(g, s), undefined, 'the opening reply comes before the player has said anything');
  assert.equal(dueBeat(g, { ...s, log: [...s.log, '대화-NPC: {"name":"에드리아 하르트","line":"무슨 일로 왔나?"}', '대화-나: 입단 지원서를 내겠습니다.'] })?.do, 'talk');
  assert.equal(metNames({ ...s, mode: undefined, talkNpc: undefined, relationships: [{ id: 'x', name: '핍', relation: '초면', affection: 0 }], metNpcs: [], party: [] }).length, 0, 'a relationship row the bookkeeper made is not meeting');
});
test('playtest 1120b: the escort fight is on the road, income named in the deal, one clue per talk, gear swaps said', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const goal = '기사단의 세금 마차를 사레타까지 호송하기';
  const map = (g.maps || []).find(m => m.pins.some(p => p.name === '사레타'))!, pin = map.pins.find(p => p.name === '사레타')!;
  const s0 = { ...structuredClone(t0.session), mode: undefined, talkNpc: undefined, threat: undefined, mapId: map.id, pinId: pin.id, scenePlace: undefined, quests: [goal], focus: goal, focusAt: 0, task: undefined, delivered: [] as string[], characterGold: 100, log: ['시스템: 새 목표 — ' + goal] } as Session;
  assert.equal(beatFoe(g, s0), undefined, 'standing in 사레타: no goblins in town');
  assert.equal(beatFoe(g, s0, true), '고블린 약탈대', 'on the way to 사레타: the road fight, whatever the route');
  const won = { ...s0, log: [...s0.log, '전투: 승리 — 고블린 약탈대를 쓰러뜨렸다'] };
  assert.equal(beatFoe(g, won, true), undefined);
  assert.equal(dueBeat(g, won)?.do, 'reach', 'after the fight the arrival is due and closes the escort');
  const sold = applyReply(g, s0, { text: '【사레타 · 낮】 카시아가 동전을 건넨다.', goldDelta: 25, choices: [] }, '운송표 원본을 25골드에 넘긴다').session;
  assert.equal(sold.characterGold, 125, 'income the player named');
  const free = applyReply(g, s0, { text: '【사레타 · 낮】 누군가 동전을 건넨다.', goldDelta: 40, choices: [] }, '항구를 둘러본다').session;
  assert.equal(free.characterGold, 100, 'no deal named it: no money');
  const talk = { ...s0, mode: 'talk', talkNpc: '에드리아 하르트', log: [...s0.log, '시스템: 에드리아 하르트와 대화를 시작했습니다.', '대화-단서: [소지품: 잿빛 갈매기 인장 반지] 반지를 보았다.', '대화-NPC: {"name":"에드리아 하르트","line":"입단 시험을 치르십시오.","gesture":"","quiet":false}', '대화-나: 반지를 보셨습니까?'] } as Session;
  const again = applyReply(g, talk, { parts: [{ type: 'speech', text: '봤습니다.' }], line: '봤습니다.', howKnown: '[소지품: 잿빛 갈매기 인장 반지] 앞서 반지를 보았다.', choices: ['네'] }, '반지를 보셨습니까?').session;
  assert.equal(again.log.filter(l => l.startsWith('대화-단서:')).length, 1, 'the ring is noticed once per talk');
  const geared = { ...s0, equipped: { weapon: '낡은 롱소드' }, inventory: ['낡은 롱소드', '좋은 검'], itemInfo: { '낡은 롱소드': { grade: 1, kind: 'weapon' }, '좋은 검': { grade: 3, kind: 'weapon' } } } as Session;
  assert.match(bestGear(g, geared).log.at(-1) || '', /장비 교체 — 낡은 롱소드 → 좋은 검/);
});
test('an unmet name is swapped only as a whole word (한나절 is not 한나)', () => {
  assert.equal(unnamedScene('한나절이 지나도 아무도 오지 않습니다.', []), '한나절이 지나도 아무도 오지 않습니다.');
  assert.equal(unnamedScene('핍이 손을 내민다. 핍의 동전이 구른다.', []), '골목의 정보통이 손을 내민다. 골목의 정보통의 동전이 구른다.');
});
test('the story duel is fought, and won or lost the story goes on its own way (바레나, 2026-11-20)', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const goal = '검은 돛 선장 바레나와 담판 짓기';
  const map = (g.maps || []).find(m => m.pins.some(p => p.name === '사레타'))!, pin = map.pins.find(p => p.name === '사레타')!;
  const challenge = goalPath(g, goal)[0].split(' → ')[1];
  const s0 = { ...structuredClone(t0.session), mode: undefined, talkNpc: undefined, threat: undefined, mapId: map.id, pinId: pin.id, scenePlace: '7번 부두', quests: [goal], focus: goal, focusAt: 0, task: undefined, delivered: [] as string[], log: ['시스템: 새 목표 — ' + goal] } as Session;
  assert.equal(duelBeat(g, s0), undefined, 'before the challenge it is a talk, not a duel');
  const dared = { ...s0, delivered: [challenge], log: [...s0.log, '시스템: 바레나와 대화를 시작했습니다.', '시스템: 바레나와의 대화가 끝났습니다.'] };
  assert.equal(duelBeat(g, dared)?.foe, '바레나');
  assert.equal(duelBeat(g, { ...dared, scenePlace: undefined, pinId: 'nowhere' }), undefined, 'only where it waits');
  const lost = { ...dared, log: [...dared.log, '전투: 패배 — 바레나에게 쓰러져 빈사 상태가 됐다 (HP 1)'] };
  assert.equal(duelBeat(g, lost), undefined, 'a lost duel is over too');
  const told = goalPath(g, goal, lost);
  assert.ok(told.every(x => x.startsWith('이미 일어남:')) && /배짱/.test(told[1]), 'the losing way is what happened');
  const won = { ...dared, log: [...dared.log, '전투: 승리 — 바레나를 쓰러뜨렸다'] };
  assert.match(goalPath(g, goal, won)[1], /명령서대로/);
});
