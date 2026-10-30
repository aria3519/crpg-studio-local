// Shared by the play screen and the GM route: how strong NPCs are, and how the player and companions grow.
// Enemy strength is a function of level, built against the player a level brings: stats grown by use (about one
// point a level into the stat they fight with), the level bonus below, and gear of the matching grade. Simulated
// (mirror of autoBattleStep): a player wins about 85% against an ordinary foe of their own level, ~45% at 5 levels
// above, ~98% at 5 below; a boss of their level is a coin flip, and the demon king at Lv.100 likewise.
import { BONUS, gradeForTier } from './items';

export type PowerTier = { hp: number; dc: number; atk: number; damage: number; label: string };
export const MAX_POWER = 10;
export const MAX_LEVEL = 100;

// The lowest level of each tier: early tiers sit close because the starting roster (wolves, goblins, soldiers) lives there.
export const TIER_LEVELS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 10, 5: 20, 6: 33, 7: 48, 8: 65, 9: 82, 10: 100 };
export const levelForTier = (tier: number) => TIER_LEVELS[Math.max(1, Math.min(MAX_POWER, Math.round(tier)))];
export const tierOfLevel = (level: number) => { let t = 1; while (t < MAX_POWER && TIER_LEVELS[t + 1] <= level) t++; return t; };
// A roaming foe grows with the player: it starts at its tier's level and can be met up to two tiers higher
// (wolves Lv.2-10, a troll Lv.20-48, a wyvern Lv.48-82). Bosses keep their tier's level.
export const foeLevelRange = (tier: number, boss = false): [number, number] => [levelForTier(tier), boss ? levelForTier(tier) : levelForTier(Math.min(MAX_POWER, Math.round(tier) + 2))];
// The level a foe is met at: a level or so under the player, within its range, so ordinary fights stay winnable.
export const encounterLevel = (tier: number, boss: boolean, playerLevel: number, rand = Math.random) => {
  const [min, max] = foeLevelRange(tier, boss);
  return Math.max(min, Math.min(max, Math.round(playerLevel - 1 + (rand() * 3 - 1.5))));
};

// What each level adds on top of the character sheet: HP and damage grow by a steady share per level.
export const levelBonus = (level: number) => {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return { hp: Math.round(100 * (Math.pow(1.028, l - 1) - 1)), hit: 0, damage: Math.round(4 * (Math.pow(1.03, l - 1) - 1)), dodge: 0 };
};
// The modifiers of the player a level brings: fighting stat 13 at Lv.1 growing a point a level, agility 11 growing half.
const statMod = (score: number) => Math.floor((score - 10) / 2);
export const expectedMods = (level: number) => ({ attack: statMod(13 + (level - 1)), agility: statMod(11 + Math.floor((level - 1) / 2)) });

// Rounds an even fight takes: the player needs ENEMY_ROUNDS to fell an ordinary foe (a little more at high level),
// the foe PLAYER_ROUNDS to fell the player. Bosses carry more health and hit harder.
const ENEMY_ROUNDS = 6, PLAYER_ROUNDS = 11, BOSS_HP = 1.5, BOSS_DAMAGE = 1.2;
export const enemyStats = (level: number, boss = false): Omit<PowerTier, 'label'> => {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
  const g = gradeForTier(tierOfLevel(l)), m = expectedMods(l), bonus = levelBonus(l);
  const playerHp = 100 + bonus.hp + BONUS.armor.hp[g], playerHit = 4.5 + m.attack + bonus.damage + BONUS.weapon.damage[g];
  // Gear is added on top when the fight starts (enemyGear), so it is taken out here.
  // The first levels are softer still, so a new hero can learn the ropes (×0.75 at Lv.1, full strength from Lv.10).
  const soft = Math.min(1, 0.725 + 0.0275 * l);
  const hp = Math.max(10, Math.round(ENEMY_ROUNDS * (1 + 0.004 * (l - 1)) * 0.6 * playerHit * soft * (boss ? BOSS_HP : 1)) - BONUS.armor.hp[g] * 2);
  const damage = Math.max(2, Math.round((4 * playerHp / PLAYER_ROUNDS - 1) * soft * (boss ? BOSS_DAMAGE : 1)) - BONUS.weapon.damage[g]);
  return { hp, dc: 9 + m.attack, atk: 2 + m.agility, damage };
};

const TIER_LABELS = ['', '민간인·비전투원', '싸움을 조금 하는 일반인·하급 불량배', '훈련받은 병사·견습 무인·하급 마물', '숙련된 전투원·정식 기사·중견 헌터', '정예·실력 있는 마법사·이름난 무인', '지휘관급 고수·전직 최상위 모험가·대형 마물', '영웅급·한 시대를 풍미한 강자', '전설적 강자·고룡', '재앙급·마왕군 대장군·천재지변 같은 존재', '마왕·신에 가까운 최종 존재'];
export const POWER_TIERS: Record<number, PowerTier> = Object.fromEntries(
  Array.from({ length: MAX_POWER }, (_, i) => [i + 1, { ...enemyStats(TIER_LEVELS[i + 1]), label: TIER_LABELS[i + 1] }]));

// Experience for defeating a foe of a given tier; quests and deeds add on top.
export const xpForTier = (tier: number) => Math.round(15 * Math.pow(2.6, Math.max(1, Math.min(MAX_POWER, tier)) - 1));
// Experience needed to go from `level` to `level + 1`: 60 at the start, ~1,300 at 10, ~13,000 at 40, ~43,000 at 80.
// Early levels come fast (a couple of fights each), later ones slow down.
export const xpToNext = (level: number) => Math.round(25 * Math.pow(level, 1.7) + 35);
// Rewards are shares of the level the player is on, so they stay meaningful at any level. A main quest pays more the
// further along the story it is, growing with the square of the step. Roaming foes are met near the player's level
// (encounterLevel), so the fixed points are the boss tiers: Lv.65 for the act-3 bosses and Lv.100 for the finale.
// With ~3 fights, a side quest and a deed per main step (and earlyBoost) a player is about Lv.5 after the first
// errand, Lv.17 / 33 / 60 at the end of acts 1-3 and Lv.92 before the finale (simulated); one who only follows the
// main quest is about Lv.64 there, and one who grinds hits the cap in act 4. Fights alone take ~9 to reach Lv.5.
export const MAIN_QUEST_BASE = 0.5, MAIN_QUEST_STEP = 0.024;
export const SIDE_QUEST_SHARE = 0.7;
// Early levels come quickly: every reward counts up to 2.4× at Lv.1, easing to normal by Lv.15.
export const earlyBoost = (level: number) => 1 + Math.max(0, 15 - Math.max(1, level)) * 0.1;
// A fight pays 0.25 of a level against an even foe, more against a stronger one, never past a side quest's worth.
export const battleXp = (foeLevel: number, playerLevel: number) => {
  const level = Math.max(1, playerLevel);
  const share = Math.max(0.1, Math.min(SIDE_QUEST_SHARE, 0.25 + 0.04 * (foeLevel - level)));
  return Math.round(xpToNext(level) * share * earlyBoost(level));
};
export const questXp = (level: number) => Math.round(xpToNext(level) * SIDE_QUEST_SHARE * earlyBoost(level));
export const mainQuestXp = (level: number, step = 0) => Math.round(xpToNext(level) * (MAIN_QUEST_BASE + MAIN_QUEST_STEP * Math.max(0, step) ** 2) * earlyBoost(level));
// Deeds the GM recognises outside quests and fights; a finished regional story also pays an event.
export const DEED_SHARES: Record<string, number> = { minor: 0.1, deed: 0.3, event: 0.6 };
export const deedXp = (kind: unknown, level: number) => typeof kind === 'string' && DEED_SHARES[kind] ? Math.round(xpToNext(Math.max(1, level)) * DEED_SHARES[kind] * earlyBoost(level)) : 0;

// Adds experience and returns the new level and progress, with how many levels were gained.
export const gainXp = (level: number, xp: number, gained: number) => {
  let l = Math.max(1, Math.floor(level)), x = Math.max(0, xp) + Math.max(0, Math.round(gained));
  const start = l;
  while (l < MAX_LEVEL && x >= xpToNext(l)) { x -= xpToNext(l); l++; }
  if (l >= MAX_LEVEL) x = 0;
  return { level: l, xp: x, levelsGained: l - start };
};

// A companion fights like a somewhat weaker player of its level: it lands about as often, for ~70% of the damage
// (autoBattleStep rolls ceil(d(damage) * 0.7), so damage is twice the player's average hit).
export const companionStats = (level: number) => {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
  const m = expectedMods(l), g = gradeForTier(tierOfLevel(l));
  return { dc: 10 + m.attack, damage: Math.round(2 * (4.5 + m.attack + levelBonus(l).damage + BONUS.weapon.damage[g]) - 1) };
};
