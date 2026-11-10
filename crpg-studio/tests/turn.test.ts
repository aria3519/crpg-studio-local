// Replays GM replies through the turn logic (app/_lib/game/turn.ts) without calling any AI, so it costs nothing.
// Each case in tests/fixtures/turns.jsonl is { name, gameId, session, data, message, ctx }: real turns recorded while
// playing (npm run test:keep) or hand-written ones. The result is checked against basic rules and against the result
// saved last time (tests/fixtures/turns.expected.json); `npm run test:update` accepts the current results as the new baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyReply, type TurnContext } from '../app/_lib/game/turn';
import { maxHpOf, refitHp, npcWhereabouts, questWeight, checkDc, checkStakes, type Game, type Session } from '../app/_lib/game/core';

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

// Small things early are easy and pay little; a goal pays by where it came from (a duty briefing paid like the entrance exam).
test('weights set DC and pay', () => {
  const g = { ...games[0], wizardMain: '잿빛 문장의 기사' } as Game;
  assert.equal(questWeight(g, '기사단장 에드리아의 입단 시험 통과하기'), 'big');
  assert.equal(questWeight(g, '북문 초소 근무와 보고 절차 확인하기'), 'small');
  assert.equal(checkDc('small', 1), 8);
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
