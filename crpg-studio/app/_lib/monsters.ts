// Hostile foes per genre: creatures and hostile groups that are enemies on sight.
// They are not NPCs: no conversation, no relationship entry, and they only ever appear as fights.
// Each genre keeps to its own concept — no goblins in wuxia, no demonic-cult elders in a gate city.
import { levelForTier } from './progression';

// Art: public/_default_monsters/<genre>/<name>.png (Korean name), or <image>.png as a fallback.
export type Foe = { name: string; image: string; power: number; desc: string; habitat: string[]; boss?: boolean };
type Roster = { danger: RegExp; habitats: Record<string, RegExp>; foes: Foe[] };

const ROSTERS: Record<string, Roster> = {
  fantasy: {
    danger: /숲|그림우드|폐허|묘지|성역|관리지|동굴|등대|섬|골목|밀동네|거점|해안|늪|광산|황무지|협곡/,
    habitats: { forest: /숲|그림우드|협곡/, undead: /묘지|폐허|등대|광산/, abyss: /심연|검은 문|성역|관리지/, coast: /섬|해안|동굴|등대|늪/, street: /골목|밀동네|거점/ },
    foes: [
      { name: '굶주린 늑대 무리', image: 'wolf-pack', power: 2, desc: '숲 가장자리를 떠도는 굶주린 늑대 대여섯 마리', habitat: ['forest'] },
      { name: '고블린 약탈대', image: 'goblin-raiders', power: 2, desc: '녹슨 칼과 활을 든 고블린 무리. 비겁하지만 수가 많다', habitat: ['forest', 'coast'] },
      { name: '거대 거미', image: 'giant-spider', power: 3, desc: '사람 키만 한 독거미. 거미줄로 먹잇감을 묶는다', habitat: ['forest', 'undead'] },
      { name: '다이어울프 우두머리', image: 'direwolf-alpha', power: 4, desc: '말만 한 덩치의 늑대 우두머리', habitat: ['forest'] },
      { name: '숲 트롤', image: 'forest-troll', power: 5, desc: '상처가 금세 아무는 거대한 트롤', habitat: ['forest'] },
      { name: '해골 병사', image: 'skeleton-soldier', power: 3, desc: '옛 왕조의 갑옷을 걸친 채 움직이는 해골', habitat: ['undead'] },
      { name: '구울', image: 'ghoul', power: 4, desc: '시체를 뜯어먹는 굶주린 언데드', habitat: ['undead'] },
      { name: '망령 기사', image: 'wraith-knight', power: 6, desc: '저주받은 검을 든 옛 기사의 망령', habitat: ['undead', 'abyss'] },
      { name: '머맨 약탈자', image: 'merman-raider', power: 3, desc: '작살을 든 물고기 머리의 약탈자들', habitat: ['coast'] },
      { name: '바다뱀', image: 'sea-serpent', power: 5, desc: '배 한 척을 휘감을 만한 거대한 바다뱀', habitat: ['coast'] },
      { name: '심연의 하수인', image: 'abyss-minion', power: 4, desc: '검은 문 틈에서 기어 나온 일그러진 마물', habitat: ['abyss'] },
      { name: '촉수 마물', image: 'tentacle-horror', power: 6, desc: '심연의 기운으로 부풀어 오른 촉수 덩어리', habitat: ['abyss'] },
      { name: '심연의 사도 광신도', image: 'abyss-cultist', power: 3, desc: '단검과 저주를 휘두르는 사교 광신도들', habitat: ['abyss', 'street'] },
      { name: '뒷골목 불량배', image: 'alley-thugs', power: 2, desc: '몽둥이를 든 뒷골목 패거리', habitat: ['street'] },
      { name: '청부 암살자', image: 'assassin', power: 5, desc: '돈을 받고 목숨을 노리는 그림자 속 암살자', habitat: ['street'] },
      { name: '와이번', image: 'wyvern', power: 7, desc: '독 꼬리를 가진 하늘의 포식자', habitat: ['forest', 'coast'] },
      { name: '고대 고룡', image: 'ancient-dragon', power: 9, desc: '수백 년을 산 거대한 용', habitat: [], boss: true },
      { name: '마왕군 대장군', image: 'demon-general', power: 9, desc: '마왕을 섬기는 최강의 장수', habitat: [], boss: true },
      { name: '마왕', image: 'demon-king', power: 10, desc: '세상을 집어삼키려는 마의 군주', habitat: [], boss: true },
    ],
  },
  wuxia: {
    danger: /천마신교|석굴|폐사찰|고분|수로채|흑염곡|혈석관|관문|사막|정상|하오문|나루터|감숙관|은남|오아시스|산채|밀림/,
    habitats: { mountain: /산|석굴|폐사찰|고분|곡|정상|산채|밀림/, water: /수로채|나루터|운하|강/, demon: /천마신교|흑염곡|혈석관/, desert: /사막|관문|감숙|오아시스|서역/, street: /하오문|은남/ },
    foes: [
      { name: '산적 떼', image: 'bandits', power: 2, desc: '도끼와 몽둥이를 든 산길의 산적들', habitat: ['mountain'] },
      { name: '독물 떼', image: 'venom-swarm', power: 2, desc: '독사와 독지네가 들끓는 독물 무리', habitat: ['mountain', 'desert'] },
      { name: '수적 무리', image: 'river-pirates', power: 3, desc: '작은 배를 몰고 나루를 터는 수적들', habitat: ['water'] },
      { name: '흑도 낭인', image: 'black-ronin', power: 3, desc: '돈만 주면 칼을 뽑는 흑도의 낭인 무리', habitat: ['street', 'water'] },
      { name: '산중 맹호', image: 'mountain-tiger', power: 4, desc: '사람을 해친 적 있는 거대한 범', habitat: ['mountain'] },
      { name: '서역 마적단', image: 'western-raiders', power: 4, desc: '말을 타고 상단을 노리는 서역 마적', habitat: ['desert'] },
      { name: '마교 교도', image: 'demon-cult-disciple', power: 4, desc: '천마를 섬기는 마교의 무사들', habitat: ['demon'] },
      { name: '강시', image: 'jiangshi', power: 5, desc: '부적이 떨어진 채 뛰어다니는 강시', habitat: ['mountain', 'demon'] },
      { name: '사파 살수', image: 'unorthodox-assassin', power: 5, desc: '암기와 독을 쓰는 사파의 살수', habitat: ['street', 'desert'] },
      { name: '혈교 무사', image: 'blood-cult-warrior', power: 5, desc: '피로 무공을 닦는 혈교의 무사', habitat: ['demon', 'desert'] },
      { name: '마교 호법', image: 'demon-cult-guardian', power: 6, desc: '마교 교주를 지키는 호법', habitat: ['demon'] },
      { name: '사파 마두', image: 'unorthodox-fiend', power: 7, desc: '강호를 피로 물들인 사파의 마두', habitat: ['mountain', 'demon'] },
      { name: '혈마 장로', image: 'blood-demon-elder', power: 8, desc: '혈공을 극한까지 익힌 혈교의 장로', habitat: [], boss: true },
      { name: '천마', image: 'heavenly-demon', power: 10, desc: '마교의 정점, 천하를 노리는 천마', habitat: [], boss: true },
    ],
  },
  modern: {
    danger: /게이트|폐쇄구역|연구소|산악|섬 지역|야적장|폐교|던전|브레이크/,
    habitats: { gate: /게이트|던전/, wild: /산악|섬/, ruin: /폐쇄구역|연구소|브레이크/, urban: /야적장|폐교|구도심/ },
    foes: [
      { name: '가시쥐 떼', image: 'spine-rats', power: 1, desc: 'E급 게이트에서 흘러나온 가시 돋친 쥐 떼', habitat: ['gate', 'urban'] },
      { name: '고블린 척후조', image: 'goblin-scouts', power: 2, desc: '게이트 안을 정찰하는 고블린 무리', habitat: ['gate'] },
      { name: '게이트 늑대', image: 'gate-wolf', power: 3, desc: '눈이 붉게 빛나는 게이트산 늑대', habitat: ['gate', 'wild'] },
      { name: '오크 돌격병', image: 'orc-charger', power: 3, desc: '도끼를 휘두르며 돌진하는 오크', habitat: ['gate'] },
      { name: '불법 헌터 패거리', image: 'rogue-hunters', power: 3, desc: '마정석을 노리고 사람을 터는 무등록 헌터들', habitat: ['urban'] },
      { name: '문지기회 광신도', image: 'gatekeeper-cultist', power: 3, desc: '게이트 개방을 숭배하는 사교 신도들', habitat: ['urban', 'ruin'] },
      { name: '철갑 하이에나', image: 'armored-hyena', power: 4, desc: '총알도 튕겨 내는 갑각을 두른 하이에나', habitat: ['wild', 'gate'] },
      { name: '리자드맨 전사', image: 'lizardman-warrior', power: 4, desc: '창을 든 비늘 전사. 물가 게이트에 많다', habitat: ['gate'] },
      { name: '브레이크 마수 군집', image: 'break-swarm', power: 5, desc: '게이트 브레이크로 쏟아져 나온 마수 떼', habitat: ['ruin', 'gate'] },
      { name: '연구소 변이체', image: 'lab-mutant', power: 5, desc: '인공 각성 실험이 낳은 뒤틀린 변이체', habitat: ['ruin'] },
      { name: '미노타우로스', image: 'minotaur', power: 6, desc: 'B급 게이트의 보스급 우두인', habitat: ['gate'] },
      { name: '심해 크라켄', image: 'kraken', power: 7, desc: '해상 게이트 깊은 곳의 거대 두족류', habitat: ['gate', 'wild'] },
      { name: 'S급 드래곤', image: 's-rank-dragon', power: 9, desc: '도시 하나를 불태울 수 있는 S급 게이트의 용', habitat: [], boss: true },
      { name: '재앙급 게이트 군주', image: 'gate-overlord', power: 10, desc: '세계를 잇는 게이트의 지배자', habitat: [], boss: true },
    ],
  },
};

const rosterOf = (genre: string) => ROSTERS[genre] || ROSTERS.fantasy;
export const foesOf = (genre: string) => rosterOf(genre).foes;
export const findFoe = (genre: string, name: string) => rosterOf(genre).foes.find(f => f.name === name.trim());
// Built-in art for a foe; a missing file falls back to the skull icon on screen.
export const foeImage = (genre: string, name: string) => { const foe = findFoe(genre, name); return foe ? `/api/default-monster/${ROSTERS[genre] ? genre : 'fantasy'}/${encodeURIComponent(foe.name)}` : undefined; };
export const isFoeName = (genre: string, name: string) => !!findFoe(genre, name);

// Places whose name or description sounds dangerous (forests, ruins, gates...) can ambush the player.
export const isDangerous = (genre: string, place: string) => rosterOf(genre).danger.test(place);

// Random ambush on arrival: only non-boss foes that live there, and nothing far beyond the player's level.
export const ENCOUNTER_CHANCE = 0.4;
export const pickEncounter = (genre: string, place: string, playerLevel: number, rand = Math.random): Foe | undefined => {
  const roster = rosterOf(genre);
  const tags = Object.entries(roster.habitats).filter(([, re]) => re.test(place)).map(([tag]) => tag);
  const local = roster.foes.filter(f => !f.boss && f.habitat.some(h => tags.includes(h)));
  const pool = local.length ? local : roster.foes.filter(f => !f.boss && f.power <= 3);
  // Foes up to a little above the player's own tier; stronger ones stay rare, weaker ones common.
  const fair = pool.filter(f => levelForTier(f.power) <= playerLevel + 10);
  const options = fair.length ? fair : pool.slice().sort((a, b) => a.power - b.power).slice(0, 1);
  const weights = options.map(f => 1 / (1 + Math.abs(levelForTier(f.power) - playerLevel) / 6));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) return options[i]; }
  return options[options.length - 1];
};
