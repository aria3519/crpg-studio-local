// Item grades, equipment bonuses and unique skills, shared by every genre.
// The GM only names and describes items; the grade, kind and skill numbers are decided here.

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;
export const GRADE_LABELS = ['일반', '고급', '희귀', '영웅', '전설', '신화'] as const;
export type ItemKind = 'weapon' | 'armor' | 'accessory' | 'item';
export const KIND_LABELS: Record<ItemKind, string> = { weapon: '무기', armor: '방어구', accessory: '장신구', item: '도구' };
export type SkillId = 'lifesteal' | 'double' | 'keen' | 'thorns' | 'guard' | 'regen';
export type ItemInfo = { grade: Grade; kind: ItemKind; desc?: string; skill?: { id: SkillId; name: string } };

// What each equipped kind adds, by grade.
const BONUS: Record<Exclude<ItemKind, 'item'>, { hit: number[]; damage: number[]; dodge: number[]; hp: number[] }> = {
  weapon: { hit: [0, 1, 1, 2, 3, 4], damage: [0, 2, 4, 7, 11, 16], dodge: [0, 0, 0, 0, 0, 0], hp: [0, 0, 0, 0, 0, 0] },
  armor: { hit: [0, 0, 0, 0, 0, 0], damage: [0, 0, 0, 0, 0, 0], dodge: [0, 0, 1, 2, 3, 4], hp: [0, 10, 25, 50, 90, 150] },
  accessory: { hit: [0, 0, 1, 1, 2, 2], damage: [0, 0, 0, 0, 0, 0], dodge: [0, 1, 1, 1, 2, 3], hp: [0, 5, 10, 20, 35, 60] },
};

// Unique skills come with 영웅(3) and above. Values by grade; index 0-2 unused.
export const SKILLS: Record<SkillId, { label: string; kinds: ItemKind[]; values: number[]; text: (v: number) => string }> = {
  lifesteal: { label: '흡혈', kinds: ['weapon', 'accessory'], values: [0, 0, 0, 15, 25, 40], text: v => `준 피해의 ${v}%만큼 HP 회복` },
  double: { label: '연타', kinds: ['weapon', 'accessory'], values: [0, 0, 0, 20, 30, 45], text: v => `${v}% 확률로 한 번 더 공격` },
  keen: { label: '예리', kinds: ['weapon', 'accessory'], values: [0, 0, 0, 19, 18, 16], text: v => `주사위 ${v} 이상이면 치명타` },
  thorns: { label: '가시', kinds: ['armor', 'accessory'], values: [0, 0, 0, 20, 35, 50], text: v => `받은 피해의 ${v}%를 되돌려 줌` },
  guard: { label: '수호', kinds: ['armor', 'accessory'], values: [0, 0, 0, 30, 60, 120], text: v => `전투 시작 시 보호막 ${v}` },
  regen: { label: '재생', kinds: ['armor', 'accessory'], values: [0, 0, 0, 4, 8, 15], text: v => `매 라운드 HP ${v} 회복` },
};

export const skillValue = (info: ItemInfo) => info.skill ? SKILLS[info.skill.id].values[info.grade] : 0;
export const skillText = (info: ItemInfo) => info.skill ? `${info.skill.name} (${SKILLS[info.skill.id].label}): ${SKILLS[info.skill.id].text(skillValue(info))}` : '';

// Items with no record yet (start items, older saves) are guessed from their names and count as 일반.
export const guessKind = (name: string): ItemKind =>
  /검|도$|단도|창|활|지팡이|철퇴|도끼|칼|낫|채찍|권갑|총|석궁|봉$|부채|비수|암기/.test(name) ? 'weapon'
  : /갑옷|갑주|가죽옷|의복|도포|로브|방패|흉갑|투구|경갑|코트|슈트|전투복|방탄/.test(name) ? 'armor'
  : /반지|목걸이|팔찌|귀걸이|부적|장신구|브로치|노리개|옥패|펜던트|인장 반지/.test(name) ? 'accessory'
  : 'item';
export const infoOf = (name: string, known?: Record<string, ItemInfo>): ItemInfo => known?.[name] || { grade: 0, kind: guessKind(name) };

export type Equipped = Partial<Record<Exclude<ItemKind, 'item'>, string>>;
// Combined stat bonus and skills of everything equipped.
export const gearOf = (equipped: Equipped | undefined, known?: Record<string, ItemInfo>) => {
  const out = { hit: 0, damage: 0, dodge: 0, hp: 0, skills: [] as { id: SkillId; name: string; value: number }[] };
  for (const [slot, name] of Object.entries(equipped || {}) as [Exclude<ItemKind, 'item'>, string][]) {
    if (!name) continue;
    const info = infoOf(name, known);
    const b = BONUS[slot];
    out.hit += b.hit[info.grade]; out.damage += b.damage[info.grade]; out.dodge += b.dodge[info.grade]; out.hp += b.hp[info.grade];
    if (info.skill) out.skills.push({ id: info.skill.id, name: info.skill.name, value: skillValue(info) });
  }
  return out;
};
export const bonusText = (info: ItemInfo) => {
  if (info.kind === 'item') return '';
  const b = BONUS[info.kind];
  return [b.hit[info.grade] && `명중 +${b.hit[info.grade]}`, b.damage[info.grade] && `피해 +${b.damage[info.grade]}`, b.dodge[info.grade] && `회피 +${b.dodge[info.grade]}`, b.hp[info.grade] && `최대 HP +${b.hp[info.grade]}`].filter(Boolean).join(' · ');
};

// An enemy carries gear that matches its strength, and drops it when beaten.
export const gradeForTier = (tier: number): Grade => (tier >= 10 ? 5 : tier >= 9 ? 4 : tier >= 7 ? 3 : tier >= 5 ? 2 : tier >= 3 ? 1 : 0);
export const dropChance = (tier: number) => (tier >= 9 ? 1 : tier >= 7 ? 0.7 : tier >= 5 ? 0.5 : tier >= 3 ? 0.35 : 0.25);
// The enemy's own gear makes it that much tougher: the same weapon and armor bonus a player would get.
export const enemyGear = (tier: number) => { const g = gradeForTier(tier); return { damage: BONUS.weapon.damage[g], hp: BONUS.armor.hp[g] * 2, dc: BONUS.armor.dodge[g] }; };

// Rewards by source: main quest > event > side quest > anything else.
const ODDS: Record<'main' | 'event' | 'side' | 'other', [Grade, number][]> = {
  main: [[3, 0.6], [4, 0.35], [5, 0.05]],
  event: [[2, 0.5], [3, 0.4], [4, 0.1]],
  side: [[1, 0.5], [2, 0.4], [3, 0.1]],
  other: [[0, 0.7], [1, 0.25], [2, 0.05]],
};
export const rollGrade = (source: keyof typeof ODDS, rand = Math.random): Grade => {
  let r = rand();
  for (const [g, p] of ODDS[source]) { if ((r -= p) <= 0) return g; }
  return ODDS[source][ODDS[source].length - 1][0];
};
// 영웅 and above carry one unique skill that fits the item's kind.
export const rollSkill = (kind: ItemKind, grade: Grade, name: string, rand = Math.random): ItemInfo['skill'] => {
  if (grade < 3 || kind === 'item') return undefined;
  const pool = (Object.keys(SKILLS) as SkillId[]).filter(id => SKILLS[id].kinds.includes(kind));
  const id = pool[Math.floor(rand() * pool.length)];
  return { id, name: name.trim().slice(0, 20) || SKILLS[id].label };
};

// Strong enemies (영웅 grade, tier 7+) fight with a unique skill of their own, at half the strength of the player's
// version. The gear they drop carries the same skill. Fixed per enemy name, so a foe always fights the same way.
export type EnemySkill = { id: SkillId; value: number };
// The final bosses fight in their own signature way; everyone else gets a skill fixed by name.
const BOSS_SKILLS: Record<string, SkillId> = { 마왕: 'double', 홍염의_패왕: 'keen', 고대_고룡: 'lifesteal', 혈마_장로: 'lifesteal', 사파_마두: 'double', 천마: 'keen', 재앙급_게이트_군주: 'thorns', S급_드래곤: 'double', 심해_크라켄: 'regen' };
export const enemySkill = (name: string, tier: number): EnemySkill | undefined => {
  const grade = gradeForTier(tier);
  if (grade < 3) return undefined;
  const ids = Object.keys(SKILLS) as SkillId[];
  const id = BOSS_SKILLS[name.trim().replace(/ /g, '_')] || ids[[...name].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) % ids.length];
  return { id, value: id === 'keen' ? (grade >= 4 ? 18 : 19) : Math.max(1, Math.round(SKILLS[id].values[grade] / 2)) };
};
export const enemySkillText = (s: EnemySkill) => `${SKILLS[s.id].label} — ${s.id === 'thorns' ? `내가 준 피해의 ${s.value}%를 되돌려 받음` : s.id === 'lifesteal' ? `입힌 피해의 ${s.value}%만큼 회복` : s.id === 'double' ? `${s.value}% 확률로 한 번 더 반격` : s.id === 'keen' ? `주사위 ${s.value} 이상이면 치명타` : s.id === 'guard' ? `보호막 ${s.value}` : `매 라운드 HP ${s.value} 회복`}`;
