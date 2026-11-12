// Replays GM replies through the turn logic (app/_lib/game/turn.ts) without calling any AI, so it costs nothing.
// Each case in tests/fixtures/turns.jsonl is { name, gameId, session, data, message, ctx }: real turns recorded while
// playing (npm run test:keep) or hand-written ones. The result is checked against basic rules and against the result
// saved last time (tests/fixtures/turns.expected.json); `npm run test:update` accepts the current results as the new baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyReply, type TurnContext } from '../app/_lib/game/turn';
import { maxHpOf, refitHp, npcWhereabouts, goalPath, storyCastFull, storyNpcsAfter, mapRoute, reachablePins, asideClue, questWeight, checkDc, checkStakes, type Game, type Session } from '../app/_lib/game/core';

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

// The goal's prepared path reaches the writer: the exam is the wolves, not a made-up duel.
test('goal path comes from the story data', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game;
  const path = goalPath(g, '기사단장 에드리아의 입단 시험 통과하기');
  assert.equal(path.length, 3);
  assert.ok(path[1].includes('굶주린 늑대 무리'));
  assert.deepEqual(goalPath(g, '근무 절차 확인하기'), []);
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
  assert.equal(questWeight(g, '기사단장 에드리아의 입단 시험 통과하기'), 'big');
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

test('a mid-reply gesture at a carried item reads as the item clue', () => {
  const inv = ['낡은 롱소드', '잿빛 갈매기 인장 반지'];
  assert.deepEqual(asideClue('에드리아 하르트', ['인장 반지를 잠시 바라보다'], inv), { item: '잿빛 갈매기 인장 반지', text: '에드리아 하르트가 인장 반지를 잠시 바라본다.' });
  assert.equal(asideClue('넬', ['반지를 들다'], ['은 반지'])?.text, '넬이 반지를 든다.');
  assert.equal(asideClue('넬', ['고개를 끄덕이다'], inv), null);
});
