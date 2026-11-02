// The fixed building blocks an AI-written main story is made of (정통 판타지 only for now).
// The story itself changes every game; the cast, villains, final bosses, places and foes below stay the same,
// so everything a story names already has a profile, an image, a battle entry or a map pin.
import reference from '../api/prompt/_lib/genre-reference.json';
import { foesOf } from './monsters';

export const STORY_GENRE = '정통 판타지';
const src = reference[STORY_GENRE];

// The mastermind (흑막) is always one of these cast members; their existing secret is the root of the scheme.
export const VILLAINS = ['아우렐리아', '리오네 아스크', '오틸리에 마른', '말라키아'];
// The final boss of act 4 is always one of these (each has fixed boss skills and art).
export const FINAL_BOSSES = ['고대 고룡', '홍염의 패왕', '마왕'];

// Places a beat's `at` may name. City places merge the detail-map pins with the prompt's city locations; both
// spellings count when matching where the player stands.
export const CITY_PLACES: Record<string, string[]> = {
  레븐홀트: ['변경왕 성채', '진흙 골목', '천공 전망대', '성문 앞 장터', '변경병 성채', '마탑 출장소', '귀족 구역', '북문 초소', '변경백 상재', '대장간', '남문'],
  사레타: ['파도의 성소', '상인 주거지', '항구 관측소', '창신로 시장', '소금 골목', '모험가 길드 사레타 지부', '항구 선창', '7번 부두', '산호 동굴 해안', '가라앉은 등대'],
  아스테라: ['마탑 본탑', '왕궁', '귀족가 주거지', '마을 본탑', '왕도 대시장', '대신전', '왕궁 외성', '왕도 항구', '밀동네'],
};
for (const c of src.cities) {
  const list = (CITY_PLACES[c.name] ??= []);
  for (const l of c.locations) { const n = l.replace(/^\{\w+\}\s*/, '').replace(/\(.*$/, '').trim(); if (n && !list.includes(n)) list.push(n); }
}
// World-map pins outside the cities (travel destinations).
export const WORLD_PLACES = ['검은 문 관리지', '금지된 상회 본거지', '마탑 본부', '태양교단 총본산', '심연의 사도 성역', '옛 왕조 지하 묘지', '그림우드', '회색 탑 폐허', '은염 숲', '철망치 씨족 본거지', '해신의 섬', '그림자 숲의 거점', '변경백가 영지'];
export const STORY_CITIES = Object.keys(CITY_PLACES);
export const ALL_PLACES = [...STORY_CITIES, ...WORLD_PLACES, ...Object.values(CITY_PLACES).flat()];

const personName = (line: string) => line.replace(/^\[GM\]\s*/, '').split('(')[0].trim();
export const CAST = src.npcs.map(line => ({ name: personName(line), line: line.replace(/\s*\(전용:[^)]*\)/g, '') }));
export const CAST_NAMES = CAST.map(c => c.name);
export const FACTIONS = src.factions.map(f => f.split(':')[0].trim());

// Roaming foes and act bosses; the three final bosses appear only as act 4's finale.
export const FOES = foesOf('fantasy').filter(f => !FINAL_BOSSES.includes(f.name));

// Sub-quests, events and opportunities stay fixed, so a main story must not reuse their plots.
export const SIDE_TITLES = [...src.quests, ...src.events, ...src.opportunities].map(s => s.split(':')[0].trim());
export const SIDE_MATERIAL = [...src.quests, ...src.opportunities].map(s => s.replace(/\{\w+\}/g, '').replace(/\s*\((?:필요 세력|제외 시작 신분):[^)]*\)/g, ''));
// The fixed stories stay as the fallback; new ones must not copy them.
export const FIXED_MAIN_NAMES = src.mains.map(m => m.name);
export const FIXED_MAIN_HOOKS = src.mains.map(m => `${m.name}: ${m.text.match(/^시작 계기:\s*(.+)$/m)?.[1] || ''}`);

// Start identities, with their first line written for a given city (places resolved to that city's names).
export function startsFor(city: string) {
  const c = src.cities.find(x => x.name === city) || src.cities[0];
  const loc: Record<string, string> = {};
  for (const l of c.locations) { const m = l.match(/^\{([a-zA-Z]+)\}\s+(.+?)\([^)]*\):/); if (m) loc[m[1]] = m[2].trim(); }
  return src.starts.map(s => { const first = s.split('\n')[0]; return { name: first.split(':')[0].trim(), summary: first.slice(first.indexOf(':') + 1).replace(/\{(\w+)\}/g, (_, k: string) => loc[k] || '').trim() }; });
}
