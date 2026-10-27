// Shared by the play screen and the GM route: how strong NPCs are, and how the player and companions grow.
// Tuned by simulation for a 100-level cap: a level-1 player beats soldiers, level ~23 matches a master,
// and the demon king is level 100 — a max-level player alone wins about half the time, a party does better.

export type PowerTier = { hp: number; dc: number; damage: number; label: string };

// Tiers grow steeply on purpose: a village shopkeeper and a demon king must not be a few points apart.
export const POWER_TIERS: Record<number, PowerTier> = {
  1: { hp: 20, dc: 8, damage: 3, label: '민간인·비전투원' },
  2: { hp: 35, dc: 10, damage: 5, label: '싸움을 조금 하는 일반인·하급 불량배' },
  3: { hp: 60, dc: 12, damage: 8, label: '훈련받은 병사·견습 무인·하급 마물' },
  4: { hp: 100, dc: 13, damage: 12, label: '숙련된 전투원·정식 기사·중견 헌터' },
  5: { hp: 170, dc: 15, damage: 18, label: '정예·실력 있는 마법사·이름난 무인' },
  6: { hp: 280, dc: 16, damage: 26, label: '지휘관급 고수·전직 최상위 모험가·대형 마물' },
  7: { hp: 450, dc: 18, damage: 36, label: '영웅급·한 시대를 풍미한 강자' },
  8: { hp: 700, dc: 19, damage: 48, label: '전설적 강자·고룡' },
  9: { hp: 1100, dc: 21, damage: 62, label: '재앙급·마왕군 대장군·천재지변 같은 존재' },
  10: { hp: 1800, dc: 23, damage: 80, label: '마왕·신에 가까운 최종 존재' },
};
export const MAX_POWER = 10;
export const MAX_LEVEL = 100;

// The level at which a player fights a tier roughly evenly; NPCs of that tier carry this level.
export const TIER_LEVELS: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 12, 6: 23, 7: 38, 8: 53, 9: 75, 10: 100 };
export const levelForTier = (tier: number) => TIER_LEVELS[Math.max(1, Math.min(MAX_POWER, Math.round(tier)))];

// Experience for defeating a foe of a given tier; quests and deeds add on top.
export const xpForTier = (tier: number) => Math.round(15 * Math.pow(2.6, Math.max(1, Math.min(MAX_POWER, tier)) - 1));
// Experience needed to go from `level` to `level + 1`: ~300 at the start, ~4,600 at 40, ~30,000 at 80 —
// roughly one or two fights against foes of the player's own level.
export const xpToNext = (level: number) => Math.round(50 * level + 250 * Math.pow(1.06, level));

// What each level adds on top of the character sheet. Growth is spread over 100 levels.
export const levelBonus = (level: number) => {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const e = 1 + (l - 1) / 2.95;
  return { hp: Math.round((e - 1) * 18), hit: Math.floor(e / 2), damage: Math.round((e - 1) * 1.8), dodge: Math.floor(e / 3) };
};

// Adds experience and returns the new level and progress, with how many levels were gained.
export const gainXp = (level: number, xp: number, gained: number) => {
  let l = Math.max(1, Math.floor(level)), x = Math.max(0, xp) + Math.max(0, Math.round(gained));
  const start = l;
  while (l < MAX_LEVEL && x >= xpToNext(l)) { x -= xpToNext(l); l++; }
  if (l >= MAX_LEVEL) x = 0;
  return { level: l, xp: x, levelsGained: l - start };
};

// A companion's fighting strength follows its level, sliding between the tiers around it.
export const companionStats = (level: number) => {
  const l = Math.max(1, Math.min(MAX_LEVEL, level));
  let t = 1;
  while (t < MAX_POWER && TIER_LEVELS[t + 1] <= l) t++;
  const a = POWER_TIERS[t];
  if (t === MAX_POWER) return { dc: a.dc + Math.floor((l - TIER_LEVELS[t]) / 10), damage: a.damage + (l - TIER_LEVELS[t]) };
  const b = POWER_TIERS[t + 1], f = (l - TIER_LEVELS[t]) / (TIER_LEVELS[t + 1] - TIER_LEVELS[t]);
  return { dc: Math.round(a.dc + (b.dc - a.dc) * f), damage: Math.round(a.damage + (b.damage - a.damage) * f) };
};
