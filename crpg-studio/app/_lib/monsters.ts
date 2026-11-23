// Hostile foes per genre: creatures and hostile groups that are enemies on sight.
// They are not NPCs: no conversation, no relationship entry, and they only ever appear as fights.
// Fantasy is the only roster left (wuxia and modern removed 2026-11-16).
import { foeLevelRange } from './progression';

// Art: public/_default_monsters/<genre>/<name>.png (Korean name), or <image>.png as a fallback.
// trophy: what the player takes from the foe when it is an act's boss (거대 거미 → 거대 거미의 심장).
export type Foe = { name: string; image: string; power: number; desc: string; trophy?: string; habitat: string[]; boss?: boolean };
type Roster = { danger: RegExp; habitats: Record<string, RegExp>; foes: Foe[] };

const ROSTERS: Record<string, Roster> = {
  fantasy: {
    danger: /숲|그림우드|폐허|묘지|성역|관리지|동굴|등대|섬|골목|밑동네|거점|해안|늪|광산|황무지|협곡/,
    habitats: { forest: /숲|그림우드|협곡/, undead: /묘지|폐허|등대|광산/, abyss: /심연|검은 문|성역|관리지/, coast: /섬|해안|동굴|등대|늪/, street: /골목|밑동네|거점/ },
    foes: [
      { name: '굶주린 늑대 무리', image: 'wolf-pack', power: 2, desc: '숲 가장자리를 떠도는 굶주린 늑대 대여섯 마리', trophy: '늑대 우두머리의 송곳니', habitat: ['forest'] },
      { name: '고블린 약탈대', image: 'goblin-raiders', power: 2, desc: '녹슨 칼과 활을 든 고블린 무리. 비겁하지만 수가 많다', trophy: '고블린 약탈대장의 녹슨 귀걸이', habitat: ['forest', 'coast'] },
      { name: '거대 거미', image: 'giant-spider', power: 3, desc: '사람 키만 한 독거미. 거미줄로 먹잇감을 묶는다', trophy: '거대 거미의 심장', habitat: ['forest', 'undead'] },
      { name: '다이어울프 우두머리', image: 'direwolf-alpha', power: 4, desc: '말만 한 덩치의 늑대 우두머리', trophy: '다이어울프 우두머리의 송곳니', habitat: ['forest'] },
      { name: '숲 트롤', image: 'forest-troll', power: 5, desc: '상처가 금세 아무는 거대한 트롤', trophy: '숲 트롤의 심장', habitat: ['forest'] },
      { name: '해골 병사', image: 'skeleton-soldier', power: 3, desc: '옛 왕조의 갑옷을 걸친 채 움직이는 해골', trophy: '해골 병사의 금 간 두개골', habitat: ['undead'] },
      { name: '구울', image: 'ghoul', power: 4, desc: '시체를 뜯어먹는 굶주린 언데드', trophy: '구울의 검은 손톱', habitat: ['undead'] },
      { name: '망령 기사', image: 'wraith-knight', power: 6, desc: '저주받은 검을 든 옛 기사의 망령', trophy: '망령 기사의 깨진 투구', habitat: ['undead', 'abyss'] },
      { name: '머맨 약탈자', image: 'merman-raider', power: 3, desc: '작살을 든 물고기 머리의 약탈자들', trophy: '머맨 약탈자의 삼지창 날', habitat: ['coast'] },
      { name: '바다뱀', image: 'sea-serpent', power: 5, desc: '배 한 척을 휘감을 만한 거대한 바다뱀', trophy: '바다뱀의 푸른 비늘', habitat: ['coast'] },
      { name: '심연의 하수인', image: 'abyss-minion', power: 4, desc: '검은 문 틈에서 기어 나온 일그러진 마물', trophy: '심연의 하수인의 검은 핵', habitat: ['abyss'] },
      { name: '촉수 마물', image: 'tentacle-horror', power: 6, desc: '심연의 기운으로 부풀어 오른 촉수 덩어리', trophy: '촉수 마물의 눈', habitat: ['abyss'] },
      { name: '심연의 사도 광신도', image: 'abyss-cultist', power: 3, desc: '단검과 저주를 휘두르는 사교 광신도들', trophy: '광신도의 사교 표식', habitat: ['abyss', 'street'] },
      { name: '뒷골목 불량배', image: 'alley-thugs', power: 2, desc: '몽둥이를 든 뒷골목 패거리', trophy: '불량배 두목의 징 박힌 몽둥이', habitat: ['street'] },
      { name: '청부 암살자', image: 'assassin', power: 5, desc: '돈을 받고 목숨을 노리는 그림자 속 암살자', trophy: '청부 암살자의 독 단검', habitat: ['street'] },
      { name: '와이번', image: 'wyvern', power: 7, desc: '독 꼬리를 가진 하늘의 포식자', trophy: '와이번의 독침', habitat: ['forest', 'coast'] },
      { name: '고대 고룡', image: 'ancient-dragon', power: 10, desc: '수백 년을 산 거대한 용. 바다 밑에서 잠들어 있었다', habitat: [], boss: true },
      { name: '홍염의 패왕', image: 'crimson-overlord', power: 10, desc: '불타는 대검을 든 붉은 갑주의 마계 패왕. 누구의 밑에도 서지 않는다', habitat: [], boss: true },
      { name: '마왕', image: 'demon-king', power: 10, desc: '세상을 집어삼키려는 마의 군주', habitat: [], boss: true },
      // Act bosses of the chronicle mains; the scouts and the bandit chief also roam.
      { name: '산적 두목', image: 'bandit-chief', power: 4, desc: '약탈대를 거느린 흉터투성이 산적 두목. 쇠사슬 도끼를 휘두른다', trophy: '산적 두목의 쇠사슬 도끼', habitat: ['forest', 'street'] },
      { name: '마왕군 척후대', image: 'demon-scouts', power: 5, desc: '검은 뿔 투구를 쓰고 늑대를 탄 마족 척후병들', trophy: '마왕군 척후대의 검은 뿔 투구', habitat: ['forest', 'abyss'] },
      { name: '마왕군 장군', image: 'demon-general', power: 8, desc: '검은 뿔 깃발을 든 마왕군의 장군. 거대한 언월도를 휘두른다', trophy: '마왕군 장군의 검은 뿔 깃발', habitat: [], boss: true },
      { name: '흑철 기사', image: 'black-iron-knight', power: 8, desc: '검은 강철 갑주로 얼굴까지 가린 대공의 비밀 친위대장', trophy: '흑철 기사의 흑철 투구', habitat: [], boss: true },
      { name: '홍염 마인', image: 'crimson-fiend', power: 8, desc: '홍염의 패왕이 먼저 보낸 불꽃의 마인. 몸에서 불길이 솟는다', trophy: '홍염 마인의 불씨 핵', habitat: [], boss: true },
    ],
  },
};

const rosterOf = (genre: string) => ROSTERS[genre] || ROSTERS.fantasy;
export const foesOf = (genre: string) => rosterOf(genre).foes;
// The trophy for a beaten act boss: the roster's own, else a plain token named after it (a person beaten in a duel too).
export const trophyOf = (genre: string, name: string) => findFoe(genre, name)?.trophy || `${name.trim()} 토벌 증표`;
export const findFoe = (genre: string, name: string) => rosterOf(genre).foes.find(f => f.name === name.trim());
// Built-in art for a foe; a missing file falls back to the skull icon on screen.
export const foeImage = (genre: string, name: string) => { const foe = findFoe(genre, name); return foe ? `/api/default-monster/${ROSTERS[genre] ? genre : 'fantasy'}/${encodeURIComponent(foe.name)}` : undefined; };
export const isFoeName = (genre: string, name: string) => !!findFoe(genre, name);
// Stand-in art until a foe has its own picture: the fantasy picture that looks closest (public/_default_monsters/
// fantasy/<name>.png). A file of the foe's own, by name or slug, always wins over this.
export const ART_STAND_IN: Record<string, string> = {

  '산적 두목': '뒷골목 불량배', '마왕군 척후대': '심연의 하수인', '마왕군 장군': '마왕', '흑철 기사': '망령 기사', '홍염 마인': '홍염의 패왕',
};

// Places whose name or description sounds dangerous (forests, ruins, gates...) can ambush the player.
export const isDangerous = (genre: string, place: string) => rosterOf(genre).danger.test(place);

// Random ambush on arrival: only non-boss foes that live there, and nothing far beyond the player's level.
// recent: foes fought lately (newest first); they are skipped while anything else fits, so fights don't repeat.
export const ENCOUNTER_CHANCE = 0.4;
export const pickEncounter = (genre: string, place: string, playerLevel: number, rand = Math.random, recent: string[] = [], banned: string[] = []): Foe | undefined => {
  const roster = rosterOf(genre);
  const tags = Object.entries(roster.habitats).filter(([, re]) => re.test(place)).map(([tag]) => tag);
  const local = roster.foes.filter(f => !f.boss && !banned.includes(f.name) && f.habitat.some(h => tags.includes(h)));
  const pool = local.length ? local : roster.foes.filter(f => !f.boss && !banned.includes(f.name) && f.power <= 3);
  // Foes whose level range starts at most one level above the player (at +4 a Lv.1 player met a Lv.4 giant spider); they are met near the player's level, see
  // encounterLevel. Those whose range covers the player are the most common.
  const gapOf = (f: Foe) => { const [min, max] = foeLevelRange(f.power, f.boss); return playerLevel < min ? min - playerLevel : playerLevel > max ? playerLevel - max : 0; };
  const fair = pool.filter(f => foeLevelRange(f.power, f.boss)[0] <= playerLevel + 1);
  const fresh = fair.filter(f => !recent.includes(f.name));
  const options = fresh.length ? fresh : fair.length ? fair : pool.slice().sort((a, b) => a.power - b.power).slice(0, 1);
  const weights = options.map(f => 1 / (1 + gapOf(f) / 6));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) return options[i]; }
  return options[options.length - 1];
};

// The roster foe a scene's text is describing ("늑대 무리가 달려든다" → 굶주린 늑대 무리), matched by its name or a
// telling word of it. Bosses only by full name, so a passing "마왕" in the narration never starts the finale.
// Generic words that name a kind of person or a crowd, not one foe: never enough on their own.
export const FOE_STOP = /^(무리|떼|거대|거대한|우두머리|병사|기사|전사|무사|마물|약탈대|약탈자|하수인|교도|패거리|광신도|부대|척후대|장군|두목|군집|조)$/;
// A word standing as a word: followed by a space, punctuation, the end, or a particle (기사단·기사검 are other words).
export const wordIn = (text: string, w: string) => new RegExp(`${w.replace(/[.*+?^${}()|[\]\\]/g, ch => '\\' + ch)}(?=$|[\\s.,!?…"'”』」)]|(들)?(이|가|을|를|은|는|의|에게|에|과|와|도|로|으로|만)(?![가-힣])|들(?![가-힣])|입니|이었|였|이라|라는|라고|한테|에게서|께서|님)`).test(text);
export const namesFoe = (text: string, name: string) => text.includes(name) || name.split(/\s+/).some(w => w.length >= 2 && !FOE_STOP.test(w) && wordIn(text, w));
export const foeInText = (genre: string, text: string): Foe | undefined => {
  const foes = rosterOf(genre).foes;
  return foes.find(f => text.includes(f.name)) || foes.filter(f => !f.boss).find(f => namesFoe(text, f.name));
};

// A 토벌 quest naming a foe that lives here makes that foe the one waiting at this place.
export const HUNT_CHANCE = 0.7;
export const huntTarget = (genre: string, place: string, quests: string[]): Foe | undefined => {
  const roster = rosterOf(genre);
  const tags = Object.entries(roster.habitats).filter(([, re]) => re.test(place)).map(([tag]) => tag);
  return roster.foes.find(f => !f.boss && f.habitat.some(h => tags.includes(h)) && quests.some(q => q.includes(f.name)));
};
