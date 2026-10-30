// Item grades, equipment bonuses and unique skills, shared by every genre.
// The GM only names and describes items; the grade, kind and skill numbers are decided here.
import { GEAR_TABLE, type GearRow } from './gear-table';

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;
export const GRADE_LABELS = ['일반', '고급', '희귀', '영웅', '전설', '신화'] as const;
export type ItemKind = 'weapon' | 'armor' | 'accessory' | 'item';
export const KIND_LABELS: Record<ItemKind, string> = { weapon: '무기', armor: '방어구', accessory: '장신구', item: '도구' };
export type SkillId = 'lifesteal' | 'double' | 'keen' | 'thorns' | 'guard' | 'regen' | 'bleed' | 'poison' | 'stun' | 'parry';
export type GearStats = { hit: number; damage: number; dodge: number; hp: number };
export type ItemInfo = { grade: Grade; kind: ItemKind; desc?: string; skill?: { id: SkillId; name: string } };

// What each equipped kind adds, by grade: the average piece of that grade (gear-table.ts spreads pieces around it).
// Each grade is about 1.5× the one below, so better grades stand clearly apart.
export const BONUS: Record<Exclude<ItemKind, 'item'>, { hit: number[]; damage: number[]; dodge: number[]; hp: number[] }> = {
  weapon: { hit: [0, 1, 2, 3, 4, 5], damage: [3, 7, 10, 16, 24, 34], dodge: [0, 0, 0, 0, 0, 0], hp: [0, 0, 0, 0, 0, 0] },
  armor: { hit: [0, 0, 0, 0, 0, 0], damage: [0, 0, 0, 0, 0, 0], dodge: [0, 1, 1, 2, 3, 4], hp: [8, 20, 45, 75, 120, 180] },
  accessory: { hit: [0, 0, 1, 1, 2, 2], damage: [0, 0, 0, 0, 0, 0], dodge: [0, 1, 1, 2, 2, 3], hp: [6, 10, 20, 34, 52, 76] },
};

// Unique skills come with 영웅(3) and above. Values by grade; index 0-2 unused.
export const SKILLS: Record<SkillId, { label: string; kinds: ItemKind[]; values: number[]; text: (v: number) => string }> = {
  lifesteal: { label: '흡혈', kinds: ['weapon', 'accessory'], values: [0, 0, 0, 15, 25, 40], text: v => `준 피해의 ${v}%만큼 HP 회복` },
  double: { label: '연타', kinds: ['weapon', 'accessory'], values: [0, 0, 0, 20, 30, 45], text: v => `${v}% 확률로 한 번 더 공격` },
  keen: { label: '예리', kinds: ['weapon', 'accessory'], values: [0, 0, 0, 19, 18, 16], text: v => `주사위 ${v} 이상이면 치명타` },
  thorns: { label: '가시', kinds: ['armor', 'accessory'], values: [0, 0, 0, 20, 35, 50], text: v => `받은 피해의 ${v}%를 되돌려 줌` },
  guard: { label: '수호', kinds: ['armor', 'accessory'], values: [0, 0, 0, 30, 60, 120], text: v => `전투 시작 시 보호막 ${v}` },
  regen: { label: '재생', kinds: ['armor', 'accessory'], values: [0, 0, 0, 4, 8, 15], text: v => `매 라운드 HP ${v} 회복` },
  bleed: { label: '출혈', kinds: ['weapon'], values: [0, 0, 0, 4, 7, 12], text: v => `명중하면 3라운드 동안 매 라운드 ${v} 출혈 피해` },
  poison: { label: '독', kinds: ['weapon', 'accessory'], values: [0, 0, 0, 1, 2, 3], text: v => `명중할 때마다 독 1중첩(최대 5), 매 라운드 중첩당 ${v} 피해` },
  stun: { label: '기절', kinds: ['weapon', 'accessory'], values: [0, 0, 0, 10, 15, 20], text: v => `명중하면 ${v}% 확률로 기절시켜 그 라운드 반격을 막음` },
  parry: { label: '가드', kinds: ['armor', 'accessory'], values: [0, 0, 0, 20, 30, 40], text: v => `공격할 때 ${v}% 확률로 자세를 잡아 다음 반격을 막아 냄` },
};
// Enemies fight with the first six only; the newer ones (출혈, 독, 기절, 가드) belong to the player's gear.
const ENEMY_SKILL_IDS: SkillId[] = ['lifesteal', 'double', 'keen', 'thorns', 'guard', 'regen'];

export const skillValue = (info: ItemInfo) => info.skill ? SKILLS[info.skill.id].values[info.grade] : 0;
export const skillText = (info: ItemInfo) => info.skill ? `${info.skill.name} (${SKILLS[info.skill.id].label}): ${SKILLS[info.skill.id].text(skillValue(info))}` : '';

// Items with no record yet (start items, older saves) are guessed from their names and count as 일반.
export const guessKind = (name: string): ItemKind =>
  /검|도$|단도|창|활|지팡이|철퇴|도끼|칼|낫|채찍|권갑|총|석궁|봉$|부채|비수|암기|소드|배트|나이프|바톤|스태프|완드/.test(name) ? 'weapon'
  : /갑옷|갑주|가죽옷|의복|도포|로브|방패|흉갑|투구|경갑|코트|슈트|전투복|방탄/.test(name) ? 'armor'
  : /반지|목걸이|팔찌|귀걸이|부적|장신구|브로치|노리개|옥패|펜던트|인장 반지/.test(name) ? 'accessory'
  : 'item';
// A piece from the gear table always carries the table's ability (or none below 영웅), whatever was stored with it.
export const infoOf = (name: string, known?: Record<string, ItemInfo>): ItemInfo => {
  const info = known?.[name] || { grade: 0, kind: guessKind(name) };
  const row = info.kind !== 'item' ? tableRowOf(name, info.grade) : undefined;
  return row && row[1] === info.kind ? { ...info, skill: row[7] ? { id: row[7], name: row[8] || SKILLS[row[7]].label } : undefined } : info;
};

// Healing consumables: a beaten foe that drops no gear leaves one of these. Using one restores a share of max HP;
// start items and GM-given ones are recognised by name.
export const POTIONS: Record<string, { name: string; desc: string }> = {
  fantasy: { name: '회복 물약', desc: '마시면 최대 HP의 30%를 회복한다.' },
  wuxia: { name: '금창약', desc: '상처에 바르면 최대 HP의 30%를 회복한다.' },
  modern: { name: '회복 포션', desc: '마시면 최대 HP의 30%를 회복한다.' },
};
export const POTION_SHARE = 0.3;
export const healShareOf = (name: string, info: ItemInfo) => info.kind === 'item' && /물약|포션|금창약|회복약|치유약|성수/.test(name) ? POTION_SHARE : 0;

export type Equipped = Partial<Record<Exclude<ItemKind, 'item'>, string>>;
// A piece listed in the gear table (gear-table.ts) has the numbers written there, so two 고급 weapons differ and the
// same piece is always the same. Anything else (named by the GM, a story item) uses the grade table.
const TABLE_ROWS = new Map<string, GearRow>(Object.values(GEAR_TABLE).flat().map(r => [`${r[0]}|${r[2]}`, r]));
export const tableRowOf = (name: string, grade: Grade) => TABLE_ROWS.get(`${name}|${grade}`);
export const statsOf = (info: ItemInfo, name = ''): GearStats => {
  if (info.kind === 'item') return { hit: 0, damage: 0, dodge: 0, hp: 0 };
  const row = tableRowOf(name, info.grade);
  if (row && row[1] === info.kind) return { hit: row[3], damage: row[4], dodge: row[5], hp: row[6] };
  const b = BONUS[info.kind], g = info.grade;
  return { hit: b.hit[g], damage: b.damage[g], dodge: b.dodge[g], hp: b.hp[g] };
};
// Magic gear, known by name so story and GM items count too. A staff makes its wielder a caster: its damage is spell
// power (cast with intelligence, paid in mana), not a weapon blow. Staffs and robes speed the cast gauge
// (HASTE_PER_GRADE % a grade each), and a robe widens the mana pool (ROBE_MANA_PER_GRADE a grade).
export const isStaff = (name: string) => /지팡이|스태프|완드/.test(name);
export const isRobe = (name: string) => /로브|법의/.test(name);
export const HASTE_PER_GRADE = 4, ROBE_MANA_PER_GRADE = 10;
// Combined stat bonus and skills of everything equipped. spell: the staff's spell power, kept out of weapon damage.
export const gearOf = (equipped: Equipped | undefined, known?: Record<string, ItemInfo>) => {
  const out = { hit: 0, damage: 0, dodge: 0, hp: 0, spell: 0, haste: 0, mana: 0, caster: false, skills: [] as { id: SkillId; name: string; value: number }[] };
  for (const name of Object.values(equipped || {})) {
    if (!name) continue;
    const info = infoOf(name, known), s = statsOf(info, name), staff = info.kind === 'weapon' && isStaff(name), robe = info.kind === 'armor' && isRobe(name);
    out.hit += s.hit; out.dodge += s.dodge; out.hp += s.hp;
    if (staff) { out.spell += s.damage; out.caster = true; } else out.damage += s.damage;
    if (staff || robe) out.haste += HASTE_PER_GRADE * info.grade;
    if (robe) out.mana += ROBE_MANA_PER_GRADE * info.grade;
    if (info.skill) out.skills.push({ id: info.skill.id, name: info.skill.name, value: skillValue(info) });
  }
  return out;
};
export const bonusText = (info: ItemInfo, name = '') => {
  if (info.kind === 'item') return '';
  const s = statsOf(info, name), staff = info.kind === 'weapon' && isStaff(name), robe = info.kind === 'armor' && isRobe(name);
  return [s.hit && `명중 +${s.hit}`, s.damage && (staff ? `마법 피해 +${s.damage}` : `피해 +${s.damage}`), s.dodge && `회피 +${s.dodge}`, s.hp && `최대 HP +${s.hp}`,
    (staff || robe) && info.grade && `시전 속도 +${HASTE_PER_GRADE * info.grade}%`, robe && info.grade && `최대 마나 +${ROBE_MANA_PER_GRADE * info.grade}`].filter(Boolean).join(' · ');
};

// An enemy carries gear that matches its strength, and drops it when beaten.
export const gradeForTier = (tier: number): Grade => (tier >= 10 ? 5 : tier >= 9 ? 4 : tier >= 7 ? 3 : tier >= 5 ? 2 : tier >= 3 ? 1 : 0);
export const dropChance = (tier: number) => (tier >= 9 ? 1 : tier >= 7 ? 0.8 : tier >= 5 ? 0.6 : tier >= 3 ? 0.5 : 0.4);
// The enemy's own gear makes it that much tougher: the same weapon and armor bonus a player would get.
export const enemyGear = (tier: number) => { const g = gradeForTier(tier); return { damage: BONUS.weapon.damage[g], hp: BONUS.armor.hp[g] * 2, dc: BONUS.armor.dodge[g] }; };

// Rewards by source: main quest > event > side quest > anything else, as steps above the grade that fits the
// player's level (base: the gear grade of foes at that level, 일반 at Lv.1 up to 신화 at Lv.100). So the first
// errand pays 고급 or 희귀, and 전설 shows up around the level where 전설-wearing foes do.
const ODDS: Record<'main' | 'event' | 'side' | 'other', [number, number][]> = {
  main: [[1, 0.75], [2, 0.25]],
  event: [[0, 0.4], [1, 0.5], [2, 0.1]],
  side: [[0, 0.6], [1, 0.4]],
  other: [[-1, 0.5], [0, 0.5]],
};
export const rollGrade = (source: keyof typeof ODDS, base: Grade, rand = Math.random): Grade => {
  let r = rand(), step = ODDS[source][ODDS[source].length - 1][0];
  for (const [s, p] of ODDS[source]) { if ((r -= p) <= 0) { step = s; break; } }
  return Math.max(0, Math.min(5, base + step)) as Grade;
};
// Gear the code hands out itself (a drop or quest reward the GM did not name) comes from the gear table.
type GearKind = Exclude<ItemKind, 'item'>;
export const randomGearKind = (rand = Math.random): GearKind => (['weapon', 'armor', 'accessory'] as const)[Math.floor(rand() * 3)];
// A piece the player doesn't already own: the same piece is never handed out twice (it used to come back as
// "손질된 창 2"). The wanted kind first, then the others; none left means undefined.
export const gearName = (genre: string, kind: GearKind, grade: Grade, owned: (name: string) => boolean, rand = Math.random): { kind: GearKind; name: string } | undefined => {
  const rows = GEAR_TABLE[genre as keyof typeof GEAR_TABLE] || GEAR_TABLE.fantasy;
  for (const k of [kind, ...(['weapon', 'armor', 'accessory'] as const).filter(x => x !== kind)]) {
    const fresh = rows.filter(r => r[1] === k && r[2] === grade && !owned(r[0]));
    if (fresh.length) return { kind: k, name: fresh[Math.floor(rand() * fresh.length)][0] };
  }
  return undefined;
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
  const ids = ENEMY_SKILL_IDS;
  const id = BOSS_SKILLS[name.trim().replace(/ /g, '_')] || ids[[...name].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) % ids.length];
  return { id, value: id === 'keen' ? (grade >= 4 ? 18 : 19) : Math.max(1, Math.round(SKILLS[id].values[grade] / 2)) };
};
export const enemySkillText = (s: EnemySkill) => `${SKILLS[s.id].label} — ${s.id === 'thorns' ? `내가 준 피해의 ${s.value}%를 되돌려 받음` : s.id === 'lifesteal' ? `입힌 피해의 ${s.value}%만큼 회복` : s.id === 'double' ? `${s.value}% 확률로 한 번 더 반격` : s.id === 'keen' ? `주사위 ${s.value} 이상이면 치명타` : s.id === 'guard' ? `보호막 ${s.value}` : `매 라운드 HP ${s.value} 회복`}`;
