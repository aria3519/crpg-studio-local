// Replays GM replies through the turn logic (app/_lib/game/turn.ts) without calling any AI, so it costs nothing.
// Each case in tests/fixtures/turns.jsonl is { name, gameId, session, data, message, ctx }: real turns recorded while
// playing (npm run test:keep) or hand-written ones. The result is checked against basic rules and against the result
// saved last time (tests/fixtures/turns.expected.json); `npm run test:update` accepts the current results as the new baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyReply, type TurnContext } from '../app/_lib/game/turn';
import { preparedGoal, withGuides, guideOf, guideGoal, ownStoryOpen, heldGoal, personalStories, withNextMain, joinTemp, playerActs, dismissTemps, maxHpOf, refitHp, storyFoes, writerFoes, storyProgress, withStory, finalBoss, finaleQuest, bossPlace, goalElsewhere, foeLevel, defaultMapGenre, npcWhereabouts, goalPath, storyCastFull, storyNpcsAfter, mapRoute, reachablePins, asideClue, questWeight, applyQuests, questsOf, checkDc, checkStakes, impactOf, fightEdge, type Game, type Session } from '../app/_lib/game/core';
import { foesOf } from '../app/_lib/monsters';
import { levelForTier } from '../app/_lib/progression';

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
  const at = npcWhereabouts(g, { act: 1 } as Session);
  assert.equal(at['에드리아 하르트'], '북문 초소');
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
  assert.equal(preparedGoal(g, exam, '기사단 무기 유출 경로를 밝힌다', '에드리아 하르트'), '성채 지하 냉실 문 열기', 'read as still running, the exam left only her story');
  assert.equal(preparedGoal(g, exam, '기사단 무기 유출 경로를 밝힌다', '에드리아 하르트', [q]), '견습 순찰로 진흙 골목의 장물 거래 단속하기');
  assert.equal(preparedGoal(g, s, '성채 지하 냉실', ''), '성채 지하 냉실 문 열기', 'a named story starts at its first step');
  assert.deepEqual(withNextMain(g, s, { quests: [], added: [], done: ['성채 지하 냉실 문 열기'] }).quests, ['변경백의 죽음을 어떻게 할지 레지나와 담판 짓기'], 'a finished step hands on to the next');
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
// Any finished story moves the story on; the finale (the final boss) opens once the points reach it, wherever the player is.
test('story points from any goal reach the finale, and only the final boss ends the game', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId), s = structuredClone(t0.session);
  const p0 = storyProgress(g, s)!;
  const side = withStory(g, s, ['동네 꼬마의 잃어버린 고양이 찾기']);
  assert.ok((side.storyPoints || 0) > (s.storyPoints || 0));
  const late = withStory(g, { ...s, storyPoints: p0.finaleAt - 1 }, ['떠돌이 상인 호위하기']);
  const last = late.quests![late.quests!.length - 1];
  assert.equal(late.focus, last);
  assert.equal(last, finaleQuest(g));
  // The goal comes near the end; the boss itself waits for 100%.
  assert.ok(!storyFoes(g, late).now.includes(finalBoss(g)!), 'the final boss came before 100%');
  const lair = (g.maps || []).flatMap(m => m.pins.map(p => ({ mapId: m.id, pinId: p.id, name: p.name }))).find(p => p.name === bossPlace(g))!;
  const full = { ...late, storyPoints: p0.total, mapId: lair.mapId, pinId: lair.pinId, scenePlace: undefined };
  assert.ok(storyFoes(g, full).now.includes(finalBoss(g)!), 'the finale goal fights the final boss');
  assert.ok(writerFoes(g, full).some(f => f.name === finalBoss(g)), 'the writer may bring the final boss at its place at 100%');
  assert.ok(late.act! >= p0.acts);
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
// At 90% the finale goal leads to the boss's place; at 100% the boss waits there and comes out when the player is there
// (user, 2026-11-16: "자연스럽게 최종 보스 위치로 가게").
test('the final boss waits at its place once progress hits 100%', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'));
  assert.ok(t0, 'fixture missing');
  const g = gameOf(t0.gameId), s0 = structuredClone(t0.session), place = bossPlace(g)!;
  // The map's own name for the story's place (data: 가라앉은 등대, map: 가라앉는 등대; 마탑 본탑 → 마탑 본부).
  assert.equal(place, '가라앉는 등대');
  assert.equal(bossPlace({ ...g, wizardMain: '붉은 그릇' } as Game), '마탑 본부');
  assert.equal(bossPlace({ ...g, wizardMain: '바다 건너온 용병' } as Game), '회색 탑 폐허');
  assert.ok(finaleQuest(g)!.startsWith(place) && goalPath(g, finaleQuest(g)!)[0].startsWith(place), 'the finale goal names the place');
  const turn = (sess: Session) => run({ ...t0, session: { ...sess, storyPoints: storyProgress(g, s0)!.total - 1, quests: ['떠돌이 상인 호위하기'] }, data: { ...t0.data, ambush: '', completedQuests: ['떠돌이 상인 호위하기'] } });
  const away = turn(s0);
  assert.notEqual(away.session.threat?.npc, finalBoss(g), 'the boss came to the player away from its place');
  assert.ok(away.session.log.some(l => l.includes('진행도 100%') && l.includes(place)), 'no word where the boss waits');
  const pin = (g.maps || []).flatMap(m => m.pins.map(p => ({ mapId: m.id, pinId: p.id, name: p.name }))).find(p => p.name === place)!;
  const there = turn({ ...s0, mapId: pin.mapId, pinId: pin.pinId, scenePlace: undefined });
  assert.equal(there.session.threat?.npc, finalBoss(g));
});
// A goal set at a place the player has left gives way to the story taken up where they are (북문 초소 → 변경백가 영지, 2026-11-16).
test('a goal named for a place the player left is elsewhere', () => {
  const t0 = turns.find(x => x.name.includes('다이어울프'))!, g = gameOf(t0.gameId);
  const pin = (n: string) => (g.maps || []).flatMap(m => m.pins.map(p => ({ mapId: m.id, pinId: p.id, name: p.name }))).find(p => p.name === n)!;
  const at = (n: string, goal: string) => ({ ...structuredClone(t0.session), mapId: pin(n).mapId, pinId: pin(n).pinId, scenePlace: undefined, quests: [goal], focus: goal });
  assert.equal(goalElsewhere(g, at('변경백가 영지', '북문 초소의 모병 공고 앞에서 이름을 올리기')), true);
  assert.equal(goalElsewhere(g, at('레븐홀트', '북문 초소의 모병 공고 앞에서 이름을 올리기')), false, 'anywhere in the city is there');
  assert.equal(goalElsewhere(g, at('변경백가 영지', '낡은 수레 바퀴 고치기')), false, 'a goal with no place anywhere stays');
  // The goal's story places count (마탑 본부 turned the knights' exam into paperwork, 2026-11-16).
  assert.equal(goalElsewhere(g, at('변경백가 영지', '변경 기사단 입단 시험 통과하기')), true, 'its story is at 북문 초소 and 그림우드');
  assert.equal(goalElsewhere(g, at('레븐홀트', '변경 기사단 입단 시험 통과하기')), false, 'the city holds 북문 초소');
  assert.equal(goalElsewhere(g, at('변경백가 영지', finaleQuest(g)!)), false, 'the finale goal is never left behind');
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
  assert.deepEqual(withNextMain(knight, base, { quests: ['넬의 마지막 사냥'], added: [], done: [first] }).quests, ['넬의 마지막 사냥'], 'an open goal stays as it is');
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
