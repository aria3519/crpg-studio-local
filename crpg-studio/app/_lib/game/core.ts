// Game rules shared by the play screen: session shape, constants and pure helpers (no React).
// Moved out of app/page.tsx unchanged so the turn logic can be tested without the screen.
import { mainPrologue, mainChain } from '../prologues';
import { type Beat, beatGoal } from '../quest-beats';
import { TRAVEL_VERB } from '../travel';
import { REGION_QUESTS, type RegionQuest } from '../regional-quests';
import GENRE_REF from '../../api/prompt/_lib/genre-reference.json';
import { mainSections } from '../../api/prompt/_lib/reference-builder';
import { isStaff, fitsHero, GRADE_LABELS, KIND_LABELS, SKILLS, infoOf, gearOf, bonusText, skillText, enemyGear, gradeForTier, dropChance, rollGrade, rollSkill, randomGearKind, gearName, POTIONS, healShareOf, enemySkill, enemySkillText, type EnemySkill, type Grade, type ItemInfo, type ItemKind, type Equipped } from '../items';
import { foesOf, findFoe, trophyOf, foeImage, isFoeName, isDangerous, pickEncounter, ENCOUNTER_CHANCE, huntTarget, HUNT_CHANCE, foeInText, type Foe } from '../monsters';
import { POWER_TIERS, MAX_POWER, MAX_LEVEL, foeLevelRange, enemyStats, levelBonus, gainXp, xpToNext, earlyBoost, battleXp, questXp, deedXp, levelForTier, tierOfLevel, encounterLevel, companionStats } from '../progression';

export type RuleItem = { name: string; detail: string; source: string };
export const START_SECTION = /(?:주인공|플레이어|시작|초기|최초).*(?:소지품|장비|아이템|도구|물품)|(?:소지품|장비|아이템).*(?:시작|초기)/;
export function extractRuleItems(prompt: string): RuleItem[] {
  const sections = prompt.split(/(?=^#{1,6}\s*\[?[^\n]+\]?\s*$)/m);
  const result: RuleItem[] = [];
  for (const section of sections) {
    const lines = section.split(/\r?\n/);
    const header = (lines[0] || '').replace(/^#+\s*/, '').replace(/[\[\]]/g, '').trim();
    if (!START_SECTION.test(header)) continue;
    const body = lines.slice(1).join('\n').trim();
    const explicit = [...body.matchAll(/(?:^|\n)\s*(?:[-*]\s*)?(?:이름|아이템명|장비명|소지품명)\s*[:：]\s*([^\n]+)/g)];
    if (explicit.length) {
      for (let i=0;i<explicit.length;i++) {
        const name=explicit[i][1].trim();
        const from=(explicit[i].index||0)+explicit[i][0].length;
        const to=i+1<explicit.length ? explicit[i+1].index! : body.length;
        const detail=body.slice(from,to).trim();
        if (name && !result.some(x=>x.name===name)) result.push({name,detail,source:header});
      }
    } else {
      for (const line of lines.slice(1)) {
        const match=line.match(/^\s*[-*]\s+([^:：\n]{1,70})(?:\s*[:：]\s*(.*))?$/);
        if (match && !result.some(x=>x.name===match[1].trim())) result.push({name:match[1].trim(),detail:(match[2]||'').trim(),source:header});
      }
    }
  }
  // The built prompt lists the start's belongings on one line: "시작 소지품: 견습 지팡이: 1서클 주문의 매개. / 낡은 주문서: …
  // / 돈주머니: 10골드." Each "name: detail" part is an item; money (돈주머니: 10골드, 현금 30만 원) is not.
  for (const m of prompt.matchAll(/시작 소지품\s*[:：]\s*([^\n]+)/g)) {
    for (const part of m[1].split(/\s+\/\s+/)) {
      const [rawName, ...rest] = part.split(/\s*[:：]\s*/);
      const name = (rawName || '').trim().replace(/[.。]+$/, '');
      if (!name || name.length > 40 || /^(현금|골드)|주머니|꾸러미|\d+\s*(원|골드)$|(원|골드)$/.test(name) || result.some(x => x.name === name)) continue;
      result.push({ name, detail: rest.join(': ').trim(), source: '시작 소지품' });
    }
  }
  return result.slice(0,30);
}
export function combinedStartingItems(prompt: string, manual: string): string[] {
  const authored=extractRuleItems(prompt).map(x=>x.name);
  return [...new Set([...authored,...manual.split(',').map(x=>x.trim()).filter(Boolean)])];
}

export type NpcPortrait = { id:string; name:string; description:string; appearance:string; gender?: "male" | "female" | "unknown"; age?: string; faction?: string; visualIdentity?: string; image?:string };
export type ImageRow = { id: string; name: string };
export type ImageColumn = { id: string; name: string };
export type ImageCell = { rowId: string; columnId: string; image: string };
export type Asset = { id: string; name: string; kind: 'character' | 'monster'; description: string; image: string; x: number; y: number };
export type MapPin = { id: string; name: string; x: number; y: number; kind: "start" | "place" | "building" | "event" | "exit"; description?: string; eventText?: string; eventTrigger?: "enter" | "interact"; eventOnce?: boolean; requiredItem?: string; requiredFlag?: string; bidirectional?: boolean; targetMapId?: string; targetPinId?: string; background?: string };
export type MapLink = { id: string; from: string; to: string };
export type BoardMap = { id: string; name: string; image: string; baseImage?: string; pins: MapPin[]; links?: MapLink[] };
// Built-in maps are served as static files from public/_default_maps via /api/default-map.
// Keep their URLs in project state instead of embedding megabytes of base64 in IndexedDB.
export const DEFAULT_MAP_NAMES: Record<string,string[]> = {
  fantasy: ['판타지 세계 지도','레븐홀트','사레타','아스테라'],
};
// Places inside a city (its detail-map pins and the prompt's city locations) point to that city, so a scene heading
// like 【북문 초소 · 낮】 puts the player at 레븐홀트 on the world map. The longest matching place name wins.
export const GENRE_REF_KEY: Record<string, string> = { fantasy: '정통 판타지' };
// A reference place that belongs to its own world pin, not the city it is listed under (user 2026-11-17: 변경백 성채 is at 변경백가 영지, not 레븐홀트).
const PLACE_HOME: Record<string, string> = { '변경백 성채': '변경백가 영지' };
// A listed place named after another world pin is in that pin (그림우드 숲 가장자리 is at 그림우드, not 레븐홀트, where it was
// listed: the walk there stayed in the city and the scene kept 레븐홀트's background, 2026-11-20).
const worldPinOf = (genre: string, place: string, city: string) => (DEFAULT_MAP_PLACES[genre]?.[0] || []).map(([pin]) => pin).find(pin => pin !== city && pin.length >= 2 && place.startsWith(pin));
export const cityPlaceCache: Record<string, [string, string][]> = {};
export const cityPlaces = (genre: string): [string, string][] => cityPlaceCache[genre] ??= [
  ...(DEFAULT_MAP_PLACES[genre] || []).slice(1).flatMap((pins, k) => pins.map(([name]) => [name, DEFAULT_MAP_NAMES[genre]?.[k + 1] || ''] as [string, string])),
  ...((GENRE_REF as Record<string, { cities?: { name: string; locations: string[] }[] }>)[GENRE_REF_KEY[genre]]?.cities || [])
    .flatMap(c => c.locations.map(l => { const n = l.replace(/^\{\w+\}\s*/, '').replace(/\(.*$/, '').trim(); return [n, PLACE_HOME[n] || worldPinOf(genre, n, c.name) || c.name] as [string, string]; })),
  // A place with its own pin on the world map isn't inside a city: 회색 탑 폐허 counted as 레븐홀트, so its fight started there.
].filter(([name, city]) => name.length >= 2 && !!city && !(DEFAULT_MAP_PLACES[genre]?.[0] || []).some(([pin]) => pin === name)).sort((a, b) => b[0].length - a[0].length);
export const cityOfPlace = (genre: string, heading: string) => cityPlaces(genre).find(([name]) => heading.includes(name))?.[1];
// A game's prompt is assembled once, when the game is made, so it keeps the story text of that day. When the story
// has been rewritten since, its sections (메인 사건, 게임 목표, 첫 사건 계기) are swapped for the current text.
export const replaceSection = (prompt: string, title: string, body: string) => prompt.replace(new RegExp(`(# \\[${title}\\]\\n)[\\s\\S]*?(?=\\n\\n# \\[|$)`), (_, head: string) => head + body);
export const refreshMainPrompt = (g: Game, text?: string) => {
  if (!text || !g.wizardMain || !text.includes('# [메인 사건]')) return text;
  const m = mainSections(g.wizardWorld || '', g.wizardMain);
  if (!m) return text;
  const next = replaceSection(replaceSection(text, '메인 사건', m.main), '게임 목표', m.goal).replace(/첫 사건 계기: .*/, () => `첫 사건 계기: ${m.hook}`);
  return next.length <= PROMPT_LIMIT ? next : text;
};
// Fantasy is the only genre left (wuxia and modern removed 2026-11-16); the genre keys stay so the data keeps its shape.
export function defaultMapGenre(_game: Game): string { return 'fantasy'; }
// Hand-authored normalized coordinates for the 12 supplied maps. No image-analysis API call.
// Each entry is [label, x%, y%]; markers remain fully editable by the creator.
export const DEFAULT_MAP_PLACES: Record<string, [string,number,number][][]> = {
  fantasy: [
    [["사레타",21.69,37.05],["레븐홀트",61.99,54.46],["아스테라",57.73,27.08],["검은 문 관리지",15.88,20.08],["금지된 상회 본거지",40.99,19.23],["마탑 본부",55.46,10.11],["태양교단 총본산",70.5,18.16],["심연의 사도 성역",88,15],["옛 왕조 지하 묘지",81.57,30.9],["그림우드",94.48,46.6],["회색 탑 폐허",76.46,51.91],["은엽 숲",28.93,61.24],["철망치 씨족 본거지",47.8,68.04],["해신의 섬",80,86.29],["그림자 숲의 거점",42.97,38.56],["변경백가 영지",78.16,70.59],["산호 동굴 해안",12.76,55.73],["가라앉은 등대",7.79,70.38]],
    [["레븐홀트 성채",49.784970500537845,14.981102326977688],["진흙 골목",31.908665066348192,20.710922095594995],["천공 전망대",82.7000625909252,9.039060415134722],["성문 앞 장터",14.457989353922773,31.746138718195354],["변경 수비 성채",35,39],["마탑 출장소",55.601859229570586,41.93248813971013],["귀족 구역",78.01817375282747,36.83931342895274],["북문 초소",12.471734782122903,54.24100200196934],["상인 거리",34.320544597248684,61.66854904881879],["대장간",64,78],["남문",87,71]],
    [["파도의 성소",40.988692769809894,11.585647770513418],["상인 주거지",24.956771683716845,25.80409680635239],["마탑 항구 관측소",74.47129433099198,12.434507847659978],["향신료 시장",42.83307235524289,28.775114200304365],["소금 골목",63.546887042097275,25.379666767779106],["모험가 길드 사레타 지부",15.734868993888265,42.99356323614333],["항구 선창",57.30436859130032,60.8196747237942],["7번 부두",86.38882176179119,54.877639935890244],["산호 동굴 해안",25.524271629184348,73.55261862462669],["가라앉은 등대",84.40257195265494,82.89010796899491]],
    [["마탑 본탑",32.33429478811243,17.315474663069743],["왕궁",53.189979698670086,17.952119720929662],["귀족가 주거지",72.76878496926224,13.283375048745553],["시민 구역",26.801151269149837,41.295843081850215],["왕도 대시장",53.189979698670086,45.96458775403432],["태양 대신전",79,40],["왕궁 외성",25.38239664281747,67.18615379814946],["왕도 항구",73.052534941996,67.18615379814946],["밑동네",92.3475902398544,55.938722156262465]],
  ],
};
// Only the overview map is loaded by default; the detail maps stay available for backfilling older saves.
export function presetMaps(genre:string): BoardMap[] { return rawPresetMaps(genre).slice(0, 1); }
// One name per place (2026-11-23). The map pins were copied from the map art's lettering, which the image model misspelled
// (은염 숲 for 은엽 숲, 밀동네, 창신로 시장, 변경병 성채…), and the same place went by two names (대신전 / 태양 대신전): a choice
// in one name read as unexplained against the story's other. Saved games and saves are renamed when they load.
const PLACE_RENAMED: [RegExp, string][] = [
  [/은염 숲/g, '은엽 숲'], [/가라앉는 등대/g, '가라앉은 등대'], [/창신로 시장/g, '향신료 시장'], [/밀동네/g, '밑동네'],
  [/(?<!태양 )대신전/g, '태양 대신전'], [/(?<!마탑 )항구 관측소/g, '마탑 항구 관측소'],
  [/변경왕 성채/g, '레븐홀트 성채'], [/변경병 성채/g, '변경 수비 성채'], [/변경백 상재/g, '상인 거리'], [/마을 본탑/g, '시민 구역'],
];
// Story words changed when their nameless people became the cast's (user 2026-11-26: the story's key roles are the NPCs
// with portraits). Goals and told steps are matched by their exact words (quests, delivered, the log's step lines), so saved
// games and saves get the new words on load as well.
const STORY_RENAMED: [string, string][] = [
  ["그 검들이 진흙 골목 장물아비의 손을 거쳐 팔린다는 제보가 들어왔다", "그 검들이 진흙 골목에서 그림자 손 간부 카시아의 손을 거쳐 팔린다는 제보가 들어왔다"],
  ["진흙 골목 장물아비의 창고에서 밀수된 무기 더미가 나오고, 그 속에 잿빛 갈매기 문장이 새겨진 낡은 기사검이 섞여 있다. 장물아비는 사레타에서 온 배에서 넘겨받았다고만 하고", "진흙 골목 그림자 손 창고에서 밀수된 무기 더미가 나오고, 그 속에 잿빛 갈매기 문장이 새겨진 낡은 기사검이 섞여 있다. 창고를 지키던 카시아는 사레타에서 온 배에서 넘겨받았다고만 하고"],
  ["장물아비가 부른 골목 패거리가 쓰러지는 사이 장물아비는 달아나고, 그가 떨군 찢어진 운송 쪽지에", "카시아가 부른 골목 패거리가 쓰러지는 사이 카시아는 골목 어둠 속으로 자취를 감추고, 그녀가 떨군 찢어진 운송 쪽지에"],
  ["장물아비가 빼돌린 물건의 행방 쫓기", "카시아가 빼돌린 물건의 행방 쫓기"],
  ["장물아비의 궤짝이 어디로 실려 가는지 말해 주세요.", "카시아의 궤짝이 어디로 실려 가는지 말해 주세요."],
  ["골목 정보통 핍이 몇 골드를 받고, 장물아비의 궤짝이", "골목 정보통 핍이 몇 골드를 받고, 같은 그림자 손인 카시아의 눈치를 살피며 그녀의 궤짝이"],
  ["사레타에 마차를 넘기자 파도의 성소 사제가 당신의 문장을 보고 \"그 문장은 여기서 오래전에 지워졌다\"고 말한다", "사레타에서 세금을 왕도로 실어 갈 금저울 상회 대리인 오틸리에 마른에게 마차를 넘기자, 오틸리에가 당신의 문장을 보고 \"그 문장은 여기서 오래전에 지워졌답니다\"라며 웃는다. 그 이름이 아직 남은 곳이라면 선원들이 기도하는 파도의 성소 옛 기록뿐일 거라고 덧붙인다"],
  ["가문이 몰락한 해의 기록은 마탑 항구 관측소 일지로 넘겼다는 사제의 메모가 붙어 있다", "기록 끝에는 가문이 몰락한 해의 기록을 마탑 항구 관측소 일지로 넘겼다는 메모가 붙어 있다"],
  ["왕궁 외성 청원소의 관리가 반역 가문의 청원은 받을 수 없다며 문서를 찢는다. 돌아서는 당신에게 제2왕녀 테오도라의 시녀가 다가와 왕녀가 직접 만나겠다는 전갈을 전한다", "왕궁 외성 청원소에 들른 대공 아우렐리아가 당신의 문장을 차갑게 내려다보더니, 반역 가문의 청원은 받을 수 없다며 문서를 찢는다. 돌아서는 당신 앞에 그 광경을 지켜본 제2왕녀 테오도라가 다가와 따로 이야기를 나누자고 한다"],
  ["침몰 함대의 생존 수병 하나가 밑동네에 숨어 산다는 메모도 끼어 있다.", "20년 전 그 함대에 종군 사제로 탔다가 살아남은 대신관 오르벨라가 밤마다 밑동네 구호소를 돈다는 메모도 끼어 있다."],
  ["밑동네에 숨어 사는 침몰 함대의 생존 수병 지켜 내기", "침몰 함대의 증인 오르벨라를 밑동네에서 지켜 내기"],
  ["밑동네의 늙은 수병이 그날 함대를 친 배에 검은 돛이 걸려 있었다고 증언하겠다고 나선다. 그날 밤 수병의 집 지붕 위로 낯선 그림자가 내려앉는다", "밑동네 구호소에서 병자들을 돌보던 오르벨라가 한참 말이 없다가, 그날 함대를 친 배에 검은 돛이 걸려 있었다고 털어놓고 이제는 증언하겠다고 나선다. 그날 밤 구호소 지붕 위로 낯선 그림자가 내려앉는다"],
  ["대공이 보낸 청부 암살자를 쓰러뜨리고 수병을 지켜 낸다. 수병은 공개 증언대에 서겠다고 약속한다", "대공이 보낸 청부 암살자를 쓰러뜨리고 오르벨라를 지켜 낸다. 오르벨라는 공개 증언대에 서겠다고 약속한다"],
  ["관측소는 해신의 섬 봉인이 무너지고 있고, 금저울 상회가 20년 동안 섬에서 용비늘석을 캐 간 탓이라고 결론짓는다.", "관측소의 조류 기록과 별 관측 일지를 맞춰 보니, 해신의 섬 봉인이 무너지고 있고 금저울 상회가 20년 동안 섬에서 용비늘석을 캐 간 탓이라는 것이 드러난다."],
  ["시험 감독관이 자리를 비운 사이", "시험을 감독하던 리오네가 자리를 비운 사이"],
  ["풀려난 영혼 하나가 미라벨의 스승이라며 꼭대기로 가는 길을 알려 준다", "함께 오른 미라벨이 풀려난 영혼들 사이에서 스승의 마력 흔적을 알아보고, 스승이 벽에 새겨 둔 표식을 따라 꼭대기로 가는 길을 찾아낸다"],
  ["검은 뿔 자백을 전해 들은 영주 대리 레지나의 전령이 당신을 변경백 성채로 부른다", "레븐홀트 성문에서 변경 물자를 실은 상단을 맞던 영주 대리 레지나 발트가, 숲길에서 산적과 싸웠다는 말을 듣고 자세한 이야기는 변경백 성채에서 듣겠다며 당신을 부른다"],
  ["끝까지 버틴 당신의 검을 본 심판단이 패자 부활 자리로 본선에 올린다", "관람석에서 지켜보던 제2왕녀 테오도라가 끝까지 버틴 당신의 검을 눈여겨보고 패자 부활 자리로 본선에 올리게 한다"],
  ["예선을 이긴 밤, 은잔 여관에서 누군가 결승 상대의 칼에 독이 발려 있다고 귀띔한다", "예선을 이긴 밤, 단원의 경기를 보러 왕도에 올라온 단장 우르술라가 은잔 여관에서 술잔을 내려놓고, 셈이 정확한 그녀답게 결승 상대의 뒷배부터 캐 두었다며 그 칼에 독이 발려 있다고 귀띔한다"],
  ["시상대에서 내려오자 왕실 시종이 다가와 관람석의 제2왕녀 테오도라가 당신을 찾는다고 전한다", "시상대에서 내려오자 관람석의 제2왕녀 테오도라가 직접 손짓해 당신을 부른다"],
  ["붙잡힌 보급선의 여자 항해사가, 배를 대 준 오틸리에가 그 본진에서 마족 장교들과 값을 셈하고 있다고 털어놓는다.", "상륙로를 막던 바레나가 붙잡은 보급선의 항해 일지를 넘기며, 보호비를 받으며 오래 봐 온 오틸리에의 서명이 거기 있고 일지의 마지막 접선지가 바로 그 본진이라 오틸리에가 지금 거기서 마족 장교들과 값을 셈하고 있을 거라고 알려 준다."],
  ["고용주가 칼날을 튕겨 내는 마탑제 수호 반지를 끼라고 건넸다며", "대공 아우렐리아가 칼날을 튕겨 내는 마탑제 수호 반지를 끼라고 건넸다며"],
  ["침몰선의 생존 선원에게 그날 일 듣기", "침몰을 지켜본 바레나에게 그날 일 듣기"],
  ["침몰한 배의 선원들을 건져 올린 검은 돛 선장 바레나가, 그들이 상회 사람들 눈을 피해 갈매기 둥지 여관 뒷방에 숨어 지낸다고 알려 준다", "침몰한 배의 선원들을 건져 올린 검은 돛 선장 바레나가, 그날 자기 배가 바로 곁에 있었다며 잔잔하던 바다가 상회 배를 끌어당겼고 물속에서 노랫소리가 들렸다고 털어놓는다. 건져 올린 선원들은 상회 사람들 눈을 피해 갈매기 둥지 여관 뒷방에 숨어 지낸다고 한다"],
  ["여관 뒷방에 숨어 있던 생존 선원 하나가 떨리는 목소리로, 그날 잔잔하던 바다가 배를 끌어당겼고 물속에서 노랫소리가 들렸다고 털어놓는다", "여관 뒷방의 선원들은 겁에 질려 고개만 젓고, 방 한구석에 금저울 상회 인장이 찍힌 묵직한 돈주머니가 놓여 있다: 상회가 먼저 다녀가 입을 막은 것이다"],
  ["갈매기 둥지 여관 다락방에 사흘째 내려오지 않던 수상한 손님이 창문으로 달아나려 한다", "카시아가 짚어 준 갈매기 둥지 여관 다락방에서, 사흘째 내려오지 않던 청부 암살자가 창문으로 달아나려 한다"],
  ["그림자 손의 배신자", "그림자 숲의 금고털이"],
  ["거점 오두막들은 비어 있고, 금고 열쇠와 청부 계약서 한 장이 버려져 있다. 배신자가 조직을 팔아넘기려고 청부 암살자를 고용해 숲길에 매복을 깔아 두었다", "거점 오두막들은 비어 있고, 비틀어 연 금고 자물쇠와 숲길로 이어진 발자국만 남아 있다. 금고를 턴 청부 암살자가 그림자 손의 추격을 끊으려고 숲길에 매복을 깔아 두었다"],
];
export const renamePlaces = (text: string) => STORY_RENAMED.reduce((t, [from, to]) => t.split(from).join(to), PLACE_RENAMED.reduce((t, [from, to]) => t.replace(from, to), text));
// Portals the short-lived auto-linking added (id "<map>-to-<target>") are removed from saved games.
export const withoutAutoPortals = (maps: BoardMap[]): BoardMap[] => maps.map(m => m.pins.some(p => p.kind === 'exit' && p.id === `${m.id}-to-${p.targetMapId}`) ? { ...m, pins: m.pins.filter(p => !(p.kind === 'exit' && p.id === `${m.id}-to-${p.targetMapId}`)) } : m);
// Default places a built-in map is missing (deleted, or the save predates them), by name, at their default spots.
export function missingDefaultPins(m: BoardMap): MapPin[] {
  const match=/^\/api\/default-map\/(fantasy)\/([0-3])$/.exec(m.image);
  const sample=match?rawPresetMaps(match[1])[Number(match[2])]:undefined;
  return sample?sample.pins.filter(p=>!m.pins.some(q=>q.name.trim()===p.name)):[];
}
export function rawPresetMaps(genre:string): BoardMap[] {
  const names=DEFAULT_MAP_NAMES[genre] || DEFAULT_MAP_NAMES.fantasy;
  const sets=DEFAULT_MAP_PLACES[genre] || DEFAULT_MAP_PLACES.fantasy;
  return names.map((name,index)=>({
    id:`default-${genre}-${index}`, name, image:`/api/default-map/${genre}/${index}`,
    pins:sets[index].map(([label,x,y],n)=>({id:`default-${genre}-${index}-pin-${n}`,name:label,x,y,kind:'place' as const,description:`${name}의 ${label}. 제작자가 장소 설명과 이벤트를 편집할 수 있습니다.`})),links:[]
  }));
}
export const DEFAULT_PLAYER_MARKERS: Record<string,string> = {fantasy:'/api/default-player-marker/fantasy'};
// The character art shown in talk and battle: the creator's upload, else the genre's default standing art.
export function playerPortraitSrc(game: Game): string { return game.playerPortrait || `/api/default-player-portrait/${defaultMapGenre(game)}`; }
export function playerMarkerSrc(game: Game): string { return game.playerMarker || DEFAULT_PLAYER_MARKERS[defaultMapGenre(game)]; }
// Play map camera: the player marker stays in the middle and the map slides under it, zoomed in just far enough
// that every place reachable from here fits on screen (2.5× when nothing is linked yet, never wider than 1.4×).
// Pins and the marker are counter-scaled with --mapZoom so they keep their size.
export function createDefaultMaps(game: Game): BoardMap[] {
  return presetMaps(defaultMapGenre(game)).map(m=>({...m,id:makeId(),pins:m.pins.map(p=>({...p,id:makeId()}))}));
}

export type Relationship = { id: string; name: string; relation: string; affection: number; image?: string };
export type InfoField = { id: string; name: string; kind: 'number' | 'text' | 'gauge'; initial: string; max?: number; visible: boolean };
export type CharacterConfig = { preset: string; sections: { character: boolean; stats: boolean; equipment: boolean; inventory: boolean; status: boolean; relationships?: boolean }; relationships?: Relationship[]; fields: InfoField[]; slots: string[]; initialName: string; initialJob: string; initialRace: string; initialLevel: number; initialGold: number };
export const defaultCharacterConfig = (): CharacterConfig => ({ preset:'fantasy', sections:{character:true,stats:true,equipment:true,inventory:true,status:true,relationships:true},relationships:[],initialName:'모험가',initialJob:'모험가',initialRace:'인간',initialLevel:1,initialGold:100,slots:['무기','방어구','보조 장비','장신구'],fields:[{id:'strength',name:'근력',kind:'number',initial:'10',visible:true},{id:'agility',name:'민첩',kind:'number',initial:'10',visible:true},{id:'intelligence',name:'지능',kind:'number',initial:'10',visible:true},{id:'mana',name:'마나',kind:'number',initial:'30',visible:true},{id:'realm',name:'성장 단계',kind:'text',initial:'견습 검사',visible:true}] });
export const relationshipTypes = (game:Game): string[] => {
 // The prompt only when the game names no world: a fantasy prompt's "정치가" (오르벨라) made every relation a war-game one.
 const genre=[game.wizardType,game.wizardWorld,game.genre,game.gameType,...(game.wizardWorld?[]:[game.prompt])].join(' ').toLowerCase();
 if(/연애|로맨스|일상|학교|캠퍼스/.test(genre))return ['지인','친구','동료','호감','연인','라이벌','적대'];
 if(/전쟁|전략|정치|국가/.test(genre))return ['중립','동맹','부하','상관','협력','경쟁','적대'];
 if(/추리|미스터리|탐정/.test(genre))return ['초면','목격자','협력자','의뢰인','용의자','적대'];
 return ['초면','지인','친구','동료','동맹','라이벌','적대'];
};
export const characterPresets: Record<string, { fields: [string,string,'number'|'text'|'gauge',string,number?][]; slots: string[] }> = {
 fantasy:{fields:[['strength','근력','number','10'],['agility','민첩','number','10'],['intelligence','지능','number','10'],['mana','마나','number','30'],['realm','성장 단계','text','견습 검사']],slots:['무기','방어구','보조 장비','장신구']},
 survival:{fields:[['stamina','스태미나','gauge','100',100],['hunger','배고픔','gauge','100',100],['thirst','갈증','gauge','100',100],['temperature','체온','number','37']],slots:['도구','방어구','가방']},
 mystery:{fields:[['sanity','정신력','gauge','100',100],['insight','관찰력','number','10'],['logic','추리력','number','10'],['clues','단서','number','0']],slots:['도구','소지품']}
};
// Keep old saved character data compatible while keeping rule explanations out of stat labels.
export const normalizeCharacterConfig = (config: CharacterConfig): CharacterConfig => ({
 ...config,
 fields:(config.fields || []).map(f => {
  if (f.id === 'awakening' && /각성 등급/.test(f.name)) return {...f,name:'각성 등급',initial:f.initial==='F'?'F급':f.initial};
  if (f.id === 'realm' && /직업별 경지/.test(f.name)) return {...f,name:'성장 단계'};
  return f;
 })
});
export const statDisplayName = (f: InfoField): string => f.id==='awakening' && /각성 등급/.test(f.name) ? '각성 등급' : f.id==='realm' && /직업별 경지/.test(f.name) ? '성장 단계' : f.name;
export const statDisplayValue = (f: InfoField, value: string): string => f.id==='awakening' && /^[FEDSABC]$/.test(String(value).trim()) ? `${String(value).trim()}급` : String(value);
export const applyCharacterPreset = (current: CharacterConfig, preset: string): CharacterConfig => { const item=characterPresets[preset]; return item ? {...current,preset,fields:item.fields.map(([id,name,kind,initial,max])=>({id,name,kind,initial,max,visible:true})),slots:[...item.slots]} : {...current,preset}; };
// Follow the chosen world with its stat preset unless the creator already customized the stats.
export const genrePresetPatch = (game: Game, world: string): Partial<Game> => {
 const c=game.characterConfig || minimalCharacterConfig();
 const untouched=(c.preset==='custom' && !c.fields.length) || c.preset in characterPresets;
 return untouched ? {characterConfig:applyCharacterPreset(c,defaultMapGenre({wizardWorld:world} as Game))} : {};
};
// Genre-aware, opt-in system recommendations. No RPG stats are forced on new games.
export const minimalCharacterConfig = (): CharacterConfig => ({...defaultCharacterConfig(),preset:'custom',sections:{character:true,stats:true,equipment:true,inventory:true,status:true,relationships:true},relationships:[],initialName:'플레이어',initialJob:'',initialRace:'',initialLevel:1,initialGold:0,fields:[],slots:[]});
export const genreSystemSuggestions = (game: Game): CharacterConfig => {
 const context = [game.wizardType,game.gameType,game.genre,game.wizardWorld,game.world,game.prompt,game.description].join(' ').toLowerCase();
 const c=minimalCharacterConfig();
 const field=(id:string,name:string,initial='0',kind:InfoField['kind']='number',max?:number):InfoField=>({id,name,initial,kind,max,visible:true});
 const add=(items:InfoField[],inventory=false,equipment=false)=>({...c,sections:{...c.sections,stats:items.length>0,inventory:inventory||equipment,equipment:false},fields:items,slots:equipment?['장비','도구']:[]});
 if(/추리|미스터리|탐정|사건|수사/.test(context.slice(0,300)))return add([field('clues','발견한 단서'),field('case','사건 진행도','0','gauge',100)]);
 if(/연애|일상|로맨스|학교|캠퍼스/.test(context.slice(0,300)))return add([field('day','날짜','1일차','text'),field('time','시간','오전','text'),field('relationship','관계 상태','미정','text')]);
 if(/경영|경제|상점|회사|사업/.test(context.slice(0,300)))return add([field('money','자금','10000'),field('income','수입'),field('staff','직원 수')]);
 if(/전략|전쟁|정치|영토|국가/.test(context.slice(0,300)))return add([field('army','병력','100'),field('resources','자원','100'),field('diplomacy','외교 관계','중립','text')]);
 if(/생존|아포칼립스|좀비|재난/.test(context.slice(0,300)))return add([field('stamina','체력','100','gauge',100),field('hunger','허기','0','gauge',100),field('thirst','갈증','0','gauge',100)],true);
 if(/rpg|모험|판타지|던전|마법/.test(context.slice(0,300)))return add([field('mp','마나','50','number')],true,true);
 return c;
};
export type PromptDraft = { options: string[]; optionTitles?: string[]; selected: number; custom: string; enabled: boolean };
export type PromptDrafts = Record<string, PromptDraft>;
export type CustomPromptSection = {id:string;name:string;guide:string};
export type DirectionOptions = {mains:{name:string;city:string;hook:string;goal:string;progressSteps:string[];starts:{name:string;summary:string}[]}[]};
export const promptSections = [
 {id:'foundation',name:'세계관과 기본 규칙',promptTitle:'세계관과 기본 규칙',required:true,guide:'GM 역할과 주인공 자율성, 서술 형식, 역사/세력/지역, 시작 신분·장소·첫 임무를 정한다. 고유명사와 핵심 갈등을 확정. 게임 엔진의 choices·플래그를 실제 사용 가능한 형태로 정의.'},
 {id:'system',name:'게임 시스템',promptTitle:'게임 시스템',required:true,guide:'시간/이동/기록 플래그, NPC 독립 행동, 장르별 D20 판정·난이도·전투 라운드·피해·회복·패배·성장·경제·초기 장비. 다른 단계의 세계관 설명을 반복하지 않는다.'},
 {id:'npc',name:'주요 NPC와 관계',promptTitle:'주요 NPC와 관계',required:true,guide:'세계관에 연결된 NPC 최소 10명. 각 인물 이름, 성별(남성/여성), 나이, 소속, 외형, 성격, 목표, 비밀/갈등. 이미지 생성용 외형 정보와 인물별 사건 연결 고리. 관계 변화 원칙을 간결하게.'},
 {id:'story',name:'메인 사건과 의뢰·기연',promptTitle:'메인 사건과 의뢰·기연',required:true,guide:'기존 NPC와 장소를 사용한 3~5막 메인 사건(발동 조건·징조·분기·실패 결과), 독립 의뢰, 인연 사건, 반복되지 않는 돌발 사건과 단계형 기연(단서→조사→시험→보상·대가). 동일 사건을 여러 번 설명하지 않는다.'},
 {id:'goal',name:'최종 목표와 결말',promptTitle:'게임의 최종 목표',required:true,guide:'앞에서 확정한 메인 사건과 인물에 직접 연결되는 최종 목표, 측정 가능한 달성 조건, 실패·부분 성공, 복수 결말, 엔딩 후 지속 여부. NPC나 사건을 다시 나열하지 않는다.'}
] as const;
export const draftText = (d?:PromptDraft) => !d ? '' : d.selected === 3 ? d.custom : (d.options[d.selected] || '');
export const buildDraftPrompt = (drafts:PromptDrafts, extras:CustomPromptSection[] = [], removed:string[] = []) => [...promptSections.filter(x=>!removed.includes(x.id)),...extras].filter(x=>('required' in x && x.required) || drafts[x.id]?.enabled !== false).map(x=>{const t=draftText(drafts[x.id]).trim();return t?`# [${'promptTitle' in x ? x.promptTitle : x.name}]\n\n${t}`:'';}).filter(Boolean).join('\n\n');
// Wizard games keep the generated base prompt and append creator-written rules after it.
export const withExtras = (base:string|undefined, drafts:PromptDrafts, extras:CustomPromptSection[]) => base ? [base, buildDraftPrompt(drafts, extras, promptSections.map(x=>x.id))].filter(Boolean).join('\n\n') : undefined;
export const DEFAULT_PROLOGUES: Record<string,{title:string;text:string}> = {
 fantasy:{title:'사레타, 파도 아래 잠든 비밀',text:`푸른 바다가 햇빛을 반사하는 사레타 항구. 거대한 범선들이 선창을 메우고, 뱃사람과 상인, 모험가들이 좁은 부두를 오간다. 소금기 섞인 바람에는 향신료와 젖은 밧줄 냄새가 뒤섞여 있다. 먼 나라에서 온 화물과 소문이 모이는 이곳에서는 하루에도 수십 가지 의뢰가 생겨난다.

최근 항구에서는 이상한 이야기가 돌고 있다. 잔잔한 바다에서 상회의 배 한 척이 이유도 없이 가라앉았다는 것이다. 상인들은 입을 다물고, 선원들은 밤바다로 나가는 일을 꺼린다.

오늘도 모험가 길드 사레타 지부의 게시판에는 새 의뢰서가 붙었다. 파도 소리 너머로 종이 울리고, 항구에서는 또 한 척의 배가 출항을 준비한다. 무엇을 믿고 어디서부터 조사할지는 아직 정해지지 않았다.`},
};
export const defaultPrologueImage=(g:Game)=>`/api/default-prologue/${defaultMapGenre(g)}`;
// The opening follows the game's chosen main story; the genre default is only for games made before main stories existed.
export const prologueText=(g:Game)=>mainPrologue(g.wizardMain)?.text || DEFAULT_PROLOGUES[defaultMapGenre(g)].text;
// The opening is fixed to the genre default; per-game edits are no longer offered.
export const prologueTitle=(g:Game)=>mainPrologue(g.wizardMain)?.title || DEFAULT_PROLOGUES[defaultMapGenre(g)].title;
// A story set in another city opens on that city's background when one ships with the genre.
export const prologueImage=(g:Game)=>{ const city=mainPrologue(g.wizardMain)?.city; const file=city?DEFAULT_PLACE_BACKGROUNDS[defaultMapGenre(g)]?.[city]:undefined; return file&&city!=='사레타'?`/api/default-background/${defaultMapGenre(g)}/${file}`:defaultPrologueImage(g); };
// Built-in place backgrounds (public/_default_backgrounds/<genre>/<file>.png), matched by pin name.
export const DEFAULT_PLACE_BACKGROUNDS: Record<string, Record<string,string>> = {
  fantasy: {'사레타':'saretta','레븐홀트':'ravenholt','아스테라':'astera','검은 문 관리지':'black-gate','금지된 상회 본거지':'forbidden-guild','마탑 본부':'mage-tower','태양교단 총본산':'sun-temple','심연의 사도 성역':'abyss-sanctum','옛 왕조 지하 묘지':'old-catacombs','그림우드':'grimwood','회색 탑 폐허':'grey-tower-ruins','은엽 숲':'silverleaf-forest','철망치 씨족 본거지':'ironhammer-hold','해신의 섬':'sea-god-isle','그림자 숲의 거점':'shadow-outpost','변경백가 영지':'margrave-estate','산호 동굴 해안':'coral-caves','가라앉은 등대':'sunken-lighthouse'},
};
// The pin's own upload wins; otherwise the genre's built-in art for that place, else the prologue image.
export function placeBackground(g: Game, pin?: MapPin): string {
  if (pin?.background) return pin.background;
  const genre = defaultMapGenre(g);
  const file = pin && DEFAULT_PLACE_BACKGROUNDS[genre]?.[pin.name.trim()];
  return file ? `/api/default-background/${genre}/${file}` : prologueImage(g);
}
// betaHidden: left off the public beta's game list (set from 내 게임).
export type Game = { betaHidden?: boolean; npcPortraits?:NpcPortrait[]; npcStyle?:string; prologue?: string; prologueTitle?:string; prologueImage?:string; profileDone?: boolean; promptDone?: boolean; mapDone?: boolean; assetsDone?: boolean; settingsDone?: boolean; wizardType?: string; wizardWorld?: string; wizardStage?: number; wizardMain?: string; wizardMainDraw?: string[]; wizardStart?: string; wizardBasePrompt?: string; playerMarker?: string; playerPortrait?: string; customPromptSections?: CustomPromptSection[]; removedPromptSections?: string[]; promptDrafts?: PromptDrafts; compressedPrompt?: string; characterConfig?: CharacterConfig; showHpBar?: boolean; showEquipment?: boolean; showDice?: boolean; startingEquipment?: string; maps?: BoardMap[]; startMapId?: string; startPinId?: string; registrationDescription?: string; genre?: string; gameType?: string; cooperation?: string; progression?: string; playTime?: string; hashtags?: string[]; audience?: string; playMode?: 'single' | 'multi'; minPlayers?: number; maxPlayers?: number; imageRows?: ImageRow[]; imageColumns?: ImageColumn[]; imageCells?: ImageCell[]; prompt?: string; mapImage?: string; assets?: Asset[]; id: string; name: string; description: string; world: string; rules: string; gm: string; hp: number; size: number; created: number; cover?: string };
// foeBleed/foeBleedTurns/foePoison: the player's 출혈 and 독 still working on the foe.
// hitRun / takenRun: blows landed / taken in a row, for 투지 (gritOf).
export type CombatState = { hitRun?: number; takenRun?: number; respect?: boolean; openCut?: number; castGauge?: number; foeBleed?: number; foeBleedTurns?: number; foePoison?: number; level?: number; boss?: boolean; enemyAtk?: number; enemySkill?: EnemySkill; enemyShield?: number; shield?: number; lethal?: boolean; monster?: boolean; foeDesc?: string; power?: number; npc: string; enemyHp: number; enemyMaxHp: number; enemyDc: number; enemyDamage: number; round: number; itemUse?: string; lastDealt?: number; lastTaken?: number; last?: { allies?: string[]; finisher?: string; dealt: number; critDealt: boolean; taken: number | null; critTaken: boolean }; totalDealt?: number; totalTaken?: number; result?: 'win' | 'lose' };
// What a roll changes later (user, 2026-11-17: roll only for what affects a later event): the fight that follows,
// the story two or three scenes on, or the final boss fight. A roll that changes none of these is not rolled.
export type Impact = 'combat' | 'later' | 'boss';
export const impactOf = (v: unknown): Impact | undefined => { const t = String(v ?? '').trim(); return /^(combat|전투)/.test(t) ? 'combat' : /^(later|이후)/.test(t) ? 'later' : /^(boss|최종)/.test(t) ? 'boss' : undefined; };
export type DiceCheck = { person?: string; ability: string; label: string; dc: number; weight?: Weight; impact?: Impact; reason: string; action: string; success?: string; failure?: string; back?: string[] };
export type DiceResult = { person?: string; ability: string; label: string; dc: number; weight?: Weight; die: number; modifier: number; total: number; success: boolean; critical: string; onSuccess?: string; onFailure?: string };
// A roll in the last few actions: the GM is told not to ask for another one right away.
export const rolledRecently = (s: Session) => { const acts = s.log.map((e, i) => e.startsWith('플레이어:') ? i : -1).filter(i => i >= 0); return s.log.slice(acts.length >= 3 ? acts[acts.length - 3] : 0).some(e => e.startsWith('주사위:')); };
// memory: rolling long-term summary of log[0..upTo); the GM sees it plus the unsummarized recent entries.
// pinned: key facts that are only ever appended to, never rewritten by the summary.
export type StoryMemory = { summary: string; upTo: number; pinned?: string[] };
// directorNotes: the major model's notes on recent scenes (/api/gm/director); upTo is the log length reviewed, at when they were made.
// hooks: choices the director prepared with what happens when one is picked (at: this place, or a place next door); place: where they were made.
export type StoryHook = { at: string; choice: string; event: string };
// threads: side stories started in free play and not finished yet, rewritten on each review.
// consequences: things the player did that the world hasn't answered yet; the writer brings one in when it fits the scene.
// goals: personal goals the story itself gave the player, added to the quest list on the next action.
// reactions: people elsewhere hearing of what the hero did, put in the log (세상:) on the next action, with their goodwill change.
export type WorldReaction = { who: string; text: string; affection: number };
export type DirectorNotes = { fixes: string[]; upTo: number; at: number; hooks?: StoryHook[]; place?: string; threads?: string[]; consequences?: string[]; goals?: string[]; reactions?: WorldReaction[] };
// mana: current mana (max: maxManaOf); unset means full. talkAccept: the line that wraps up this talk.
// talkEnded: the talk has finished and stays on screen until the player presses 대화 끝내기.
// npcCards: the director's setting line for people the GM made up in play (role, place, personality, looks).
// placeSeeds: the director's sketch per place (who is there, what is going on), made in the background before the player arrives.
// talkNext: the action an ended talk settled; 대화 끝내기 plays it. talkChoices: the ways on the talk offered instead (the partner set what to do; the player picks). typed: this action was written by the player, not one of the offered choices.
// talkPurpose: the scene stopped where the player meets someone to talk; choosing 대화하기 opens the talk with that action as its purpose.
// focus/focusAt: the current goal the game picked last, and the log length then (see currentGoalOf).
// away: the current goal waiting behind while the hero is at a place with its own people (goalHere); it steers again when it is current somewhere else.
// storyPlan: the record keeper's blueprint (the hero's want, the people tied to them); written at game start.
// runId: one playthrough. A new game keeps the gameId and the same prologue, so background jobs (story memory, director, NPC
// memory) still running from the previous playthrough wrote into the new one: 에드리아 spoke of a wolf test it never gave. storyPoints: story points earned (storyProgress); bossDown: the final boss fell, so this turn writes the ending.
// echoes: rolls whose outcome comes back two or three player actions later (at: playerActs when rolled). bossEdge: rolls won toward the final boss fight.
// tempParty: companions who came along for one job (npc → that goal); they go home when it is done or dropped (dismissTemps).
// talkJoin: the partner agreed to come along on the job the ended talk settled (endTalk makes them a temporary companion).
// tempPending: from older saves only (companions used to join after the first scene); dismissTemps turns it into a join.
// tempSince: the player-action count when each temporary companion joined (they stay at least TEMP_MIN_ACTS).
// likedAt: when each liked deed last raised someone's goodwill ("이름|like" → player-action count).
// task: the job the last talk settled ("늑대 무리 처리하기"). It runs behind: never shown as a goal, but the writer and director work to it.
// choiceDest: where each action on offer goes, as the bookkeeper read it ('' stays); the game moves by it (page.tsx routeOf).
// choiceTalk: who each action on offer speaks to, as the bookkeeper read it ('' nobody); the play screen opens that talk.
// choiceFight: who each action on offer attacks ('' nobody), as the bookkeeper read it; the play screen opens that fight.
export type Session = { choiceDest?: Record<string, string>; choiceTalk?: Record<string, string>; choiceFight?: Record<string, string>; task?: { text: string; at: number }; away?: { place: string; goal: string }; delivered?: string[]; statPoints?: number; talkTask?: string; likedAt?: Record<string, number>; tempSince?: Record<string, number>; tempPending?: { npc: string; goal: string }; talkJoin?: boolean; tempParty?: Record<string, string>; echoes?: { text: string; at: number }[]; bossEdge?: number; placeArrive?: Record<string, string>; shownNext?: string[]; storyPoints?: number; bossDown?: boolean; storyNpcs?: { goal: string; names: string[] }; runId?: string; typed?: boolean; talkNext?: string; talkChoices?: string[]; talkPurpose?: { npc: string; action: string }; storyPlan?: string; focus?: string; focusAt?: number; placeSeedsV?: number; placeSeeds?: Record<string, string>; npcCards?: Record<string, string>; directorNotes?: DirectorNotes; metNpcs?: string[]; clashed?: Record<string, number>; talkEnded?: boolean; talkAccept?: string; mana?: number; recentFoes?: string[]; scenePlace?: string; lastEventXp?: number; revivals?: number; rewind?: Session; itemInfo?: Record<string, ItemInfo>; equipped?: Equipped; lastInterference?: number; training?: Record<string, number>; threat?: Threat; ambushNext?: Threat; dead?: boolean /* saves from before 2026-11-23 only: they wake at HP 1 on load */; memory?: StoryMemory; npcVoices?: Record<string, string>; npcNotes?: Record<string, string>; quests?: string[]; questGivers?: Record<string, string>; inviteRefusals?: Record<string, number>; npcCombat?: Record<string, { hp: number; dc: number; damage: number; power?: number }>; level?: number; xp?: number; npcPower?: Record<string, number>; companions?: Record<string, { level: number; xp: number }>; reputation?: number; party?: string[];currentGoal?: string; goalCompleted?: boolean; relationships?: Relationship[]; suggestedActions?: string[]; pendingCheck?: DiceCheck | null; lastCheck?: DiceResult | null; characterValues?: Record<string,string>; characterEquipment?: Record<string,string>; characterGold?: number; mapId?: string; pinId?: string; gameId: string; x: number; y: number; hp: number; roll: number | null; log: string[]; inventory?: string[]; flags?: string[]; triggeredEvents?: string[]; activeImageKey?: string; sceneNpcs?: string[]; handledNpcs?: string[]; mode?: 'talk' | 'combat'; talkNpc?: string; combat?: CombatState | null; travel?: {mapId:string; destinationId:string; remaining:number; total:number} };
export type View = 'library' | 'edit' | 'play';
export type Tab = 'prompt' | 'map' | 'assets' | 'settings' | 'register';
export const initial: Game = { characterConfig: defaultCharacterConfig(), showHpBar: true, showEquipment: true, showDice: true, startingEquipment: '낡은 검, 가죽 갑옷, 회복 물약', playMode: 'single', minPlayers: 2, maxPlayers: 4, id: 'sample', name: '잊혀진 던전', description: '고대 유적을 탐험하는 판타지 TRPG', world: '고대 왕국의 유적이 발견되었다. 플레이어는 유적을 탐험하는 모험가다.', rules: 'D20 판정. 10 이상 보통 성공, 15 이상 어려운 성공. 같은 맵 안에서는 장소를 자유롭게 선택하고 다른 맵으로는 포탈을 통해 이동한다. 전투 및 아이템 사용은 추후 규칙 모듈로 확장.', gm: '몰입감 있는 한국어 판타지 TRPG GM. 플레이어의 행동을 임의로 확정하지 말고 결과를 설명한다.', hp: 100, size: 7, created: 0, prompt: '고대 왕국의 유적이 발견되었다. 플레이어는 유적을 탐험하는 모험가다.\nD20 판정을 사용한다.\nGM은 플레이어의 행동을 임의로 확정하지 않는다.', assets: [], imageRows: [], imageColumns: [], imageCells: [], mapImage: '', registrationDescription: '', genre: 'RPG / 탐험', gameType: 'RPG / 탐험', cooperation: '협동', progression: '턴제', playTime: '장기 캠페인', hashtags: [], audience: '전체 이용가' };
export const storageKey = 'crpg-studio-games-v2';
export const legacyKey = 'crpg-studio-games-v1';

// v39: Store large image-bearing projects in IndexedDB instead of localStorage.
// Legacy localStorage entries are only read for migration; they are never deleted automatically.
export const databaseName = 'crpg-studio-storage';
export const databaseVersion = 1;
export function openProjectDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('이 브라우저에서 IndexedDB를 사용할 수 없습니다.')); return; }
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('저장소를 열지 못했습니다.'));
    request.onblocked = () => reject(new Error('다른 탭이 저장소를 사용 중입니다. 해당 탭을 닫고 다시 시도하세요.'));
  });
}
// Public beta visitors keep their own save beside the owner's (session-<game>-<player>); see middleware.ts.
let sessionOwner = '';
export const setSessionOwner = (pid: string) => { sessionOwner = pid; };
export const sessionKey = (gameId: string) => `session-${gameId}${sessionOwner ? '-' + sessionOwner : ''}`;
// Every record is mirrored to saves/<key>.json on disk (api/saves) so it can go into git; the disk copy wins on load.
export async function readProjectRecord<T>(key: string): Promise<T | undefined> {
  try {
    const res = await fetch(`/api/saves/${key}`, { cache: 'no-store' });
    if (res.ok) return await res.json() as T;
  } catch { /* fall back to IndexedDB */ }
  const db = await openProjectDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const req = tx.objectStore('records').get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error || new Error('불러오기 실패'));
      tx.onabort = () => reject(tx.error || new Error('불러오기 취소'));
    });
  } finally { db.close(); }
}
export async function writeProjectRecord(key: string, value: unknown): Promise<void> {
  const db = await openProjectDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('저장 실패'));
      tx.onabort = () => reject(tx.error || new Error('저장 취소'));
    });
  } finally { db.close(); }
  const res = await fetch(`/api/saves/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  if (!res.ok) throw new Error('saves 폴더에 파일로 저장하지 못했습니다.');
}
export async function deleteProjectRecord(key: string): Promise<void> {
  const db = await openProjectDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('삭제 실패'));
      tx.onabort = () => reject(tx.error || new Error('삭제 취소'));
    });
  } finally { db.close(); }
  await fetch(`/api/saves/${key}`, { method: 'DELETE' });
}

export const PROMPT_LIMIT = 7000;
// Long-term memory: the GM always gets the newest MEMORY_KEEP_RECENT..30 log entries verbatim;
// older ones are summarized MEMORY_BATCH at a time.
export const MEMORY_KEEP_RECENT = 12;
// About four scenes between story reviews when nothing major happens.
export const DIRECTOR_EVERY = 12;
// Version of the director's place sketches; bump it when how they are made changes, so old ones are redone.
export const PLACE_SEEDS_V = 9;
export const MEMORY_BATCH = 12;
// Unsummarized entries, at least the last 12 and at most the last 30.
// A talk closes itself when the GM wraps it up, or at the latest after TALK_LIMIT player lines.
export const TALK_LIMIT = 6;
// Reputation lost each time the player runs from a foe.
export const FLEE_REPUTATION = 20;
// A lethal defeat can turn into an awakening: a god steps in, the player rises stronger and the fight goes on.
// The odds drop each time it happens in one playthrough.
export const REVIVE_CHANCES = [0.3, 0.15, 0.05];
// Player actions that must pass between two event rewards.
export const EVENT_XP_GAP = 5;
// A lost fight never ends the game (user 2026-11-23). Past the awakening's chance the hero pays one way, picked at random from
// what can be paid: a few turns undone (back to the calm moment saved every REWIND_EVERY actions), half the gold, or one spare
// item (a potion or unworn gear, never what the story asks for), and comes to at HP 1.
export const REWIND_EVERY = 4;
export const defeatCost = (g: Game, s: Session, rand = Math.random): { session: Session; lost: string; back?: boolean } => {
  const gold = s.characterGold ?? 0, worn = Object.values(s.equipped || {}), potion = (POTIONS[defaultMapGenre(g)] || POTIONS.fantasy).name, asked = (s.quests || []).join(' ');
  const spare = [...new Set(s.inventory || [])].filter(n => !worn.includes(n) && !asked.includes(n) && (n === potion || ((s.itemInfo?.[n]?.grade || 0) >= 1 && s.itemInfo?.[n]?.kind !== 'item')));
  const ways = [s.rewind ? 'rewind' : '', gold > 0 ? 'gold' : '', spare.length ? 'item' : ''].filter(Boolean), way = ways[Math.floor(rand() * ways.length)];
  if (way === 'rewind' && s.rewind) return { session: { ...s.rewind, revivals: s.revivals, rewind: undefined, log: [...s.rewind.log, `시스템: 쓰러지는 순간 시간이 거꾸로 흐릅니다 — ${Math.max(1, playerActs(s) - playerActs(s.rewind))}턴 전으로 돌아왔습니다.`] }, lost: '', back: true };
  if (way === 'gold') { const n = Math.ceil(gold / 2); return { session: { ...s, hp: 1, characterGold: gold - n, log: [...s.log, `시스템: 쓰러진 사이 골드 ${n}을 잃었습니다 (보유 ${gold - n})`] }, lost: `골드 ${n}` }; }
  if (way === 'item') { const item = spare[Math.floor(rand() * spare.length)], inventory = [...(s.inventory || [])]; inventory.splice(inventory.indexOf(item), 1); return { session: { ...s, hp: 1, inventory, log: [...s.log, `시스템: 쓰러진 사이 ${item}${josa(item, '을')} 잃었습니다`] }, lost: item }; }
  return { session: { ...s, hp: 1 }, lost: '' };
};
export const AWAKEN_LEVELS = 5;
export const BLESSING: Record<string, { name: string; desc: string; skill: string }> = {
  fantasy: { name: '여신의 축복 부적', desc: '쓰러진 순간 내려온 신의 빛이 깃든 부적.', skill: '신의 가호' },
};
// Grouped log items drawn at once in the story panel.
export const LOG_PAGE = 200;
// Hostile factions interfere with the player at random, never two scenes in a row.
export const INTERFERE_GAP = 5;
export const INTERFERE_CHANCE = 0.35;
// The line that opens a talk with name; saves from before the particle fix wrote it with 와(과).
export const isTalkStart = (e: string, name: string) => e === `시스템: ${name}${josa(name, '와')} 대화를 시작했습니다.` || e === `시스템: ${name}와(과) 대화를 시작했습니다.`;
export const talkStartIndex = (log: string[], name: string) => { for (let i = log.length - 1; i >= 0; i--) if (isTalkStart(log[i], name)) return i; return -1; };
// People the hero walked past at this spot (무시하기) and hasn't spoken to since: they don't step out again here (user 2026-11-23:
// 실바엘, ignored, came back to block the way three scenes running). handledNpcs empties on every move.
export const passedBy = (s: Session) => (s.handledNpcs || []).filter(n => { const at = s.log.lastIndexOf(`시스템: ${n}${josa(n, '을')} 무시하고 지나쳤습니다.`); return at >= 0 && at > talkStartIndex(s.log, n); });
export const talkTurns = (s: Session) => { const i = s.talkNpc ? talkStartIndex(s.log, s.talkNpc) : -1; return i < 0 ? 0 : s.log.slice(i + 1).filter(e => parseTalk(e)?.speaker === 'me').length; };
// Lines from the whole log that involve one NPC, so they remember earlier meetings, promises and deeds beyond the recent window.
// What the person has been through with the player: every line of the talks with them (the player's own words too,
// which carry no name; leaving them out made people ask again what they had just been told), and other entries
// that name them.
// Lines from talks that already ended carry [지난 대화], so a new talk with the same person (reporting the smuggled
// sword) is not taken up as the old one again (the wolf test that was settled two scenes ago).
export const npcHistory = (s: Session, name: string) => {
  if (!name) return [];
  const current = s.mode === 'talk' && s.talkNpc === name ? talkStartIndex(s.log, name) : -1;
  let inTalk = false;
  return s.log.map((e, i) => ({ e, i })).filter(({ e }) => {
    if (isTalkStart(e, name)) { inTalk = true; return true; }
    if (inTalk && /^시스템: .*대화(가 끝났습니다|를 마쳤습니다)/.test(e)) { inTalk = false; return true; }
    return (inTalk && e.startsWith('대화-')) || e.includes(name);
  }).slice(-30).map(({ e, i }) => (current >= 0 && i < current ? '[지난 대화] ' : '') + historyLine(e).slice(0, 300));
};
export const recentHistory = (s: Session) => s.log.slice(Math.max(s.log.length - 30, Math.min(s.memory?.upTo || 0, s.log.length - 12)));
// Current goals work like a quest log of up to MAX_QUESTS; saves from before the log carry a single currentGoal.
// The player sees one current goal; the rest are open stories kept quietly, so the cap is only an internal limit.
export const MAX_QUESTS = 5;
export const questsOf = (s: Session): string[] => s.quests ?? (s.currentGoal?.trim() ? [s.currentGoal.trim()] : []);
// Whoever agreed in a talk to come along joins at once for the job the talk settled (the hidden task), whatever the job is:
// requiring a foe's name in it (2026-11-17) let nobody join for tracking, searching or guiding, which is most of what people offer.
// They stay at least TEMP_MIN_ACTS actions, so a one-scene errand doesn't show someone who leaves at once.
export const TEMP_MIN_ACTS = 3;
export const joinTemp = (s: Session, npc: string, goal: string, line = `시스템: ${npc}${josa(npc, "이")} 이번 일에 임시로 동행합니다.`): Session => (s.party || []).includes(npc) || (s.party || []).length >= PARTY_LIMIT ? s : {
  ...s, party: [...(s.party || []), npc], tempParty: { ...(s.tempParty || {}), [npc]: goal }, tempSince: { ...(s.tempSince || {}), [npc]: playerActs(s) },
  companions: s.companions?.[npc] ? s.companions : { ...(s.companions || {}), [npc]: { level: npcLevel(s, npc) || 3, xp: 0 } },
  log: [...s.log, line] };
// A place's guide is always in that place's sketch, so the story brings them in as it goes (after the wolves, 넬 by the tracks);
// only if the player agrees in a talk do they come along, for as long as the player stays there, staying behind on leaving.
export const GUIDES: Record<string, string> = { 그림우드: '넬' };
export const guideGoal = (place: string) => `${place} 안내`;
export const guideOf = (g: Game, s: Session, place: string) => { const guide = GUIDES[place] || ''; return guide && !(s.party || []).includes(guide) ? guide : ''; };
export const withGuides = (s: Session, place: string): Session => {
  const temp = s.tempParty || {}, leaving = Object.keys(temp).filter(n => Object.entries(GUIDES).some(([p, guide]) => guide === n && temp[n] === guideGoal(p) && p !== place));
  const left: Session = !leaving.length ? s : { ...s, party: (s.party || []).filter(n => !leaving.includes(n)), tempParty: Object.fromEntries(Object.entries(temp).filter(([n]) => !leaving.includes(n))), sceneNpcs: (s.sceneNpcs || []).filter(n => !leaving.includes(n)), handledNpcs: [...new Set([...(s.handledNpcs || []), ...leaving])],
    log: [...s.log, ...leaving.map(n => `시스템: ${n}${josa(n, "이")} 길잡이를 마치고 ${Object.keys(GUIDES).find(p => GUIDES[p] === n)}에 남습니다.`)] };
  return left;
};
const open = (s: Session, goal: string) => questsOf(s).includes(goal) || s.task?.text === goal || Object.keys(GUIDES).some(p => guideGoal(p) === goal);
export const dismissTemps = (s0: Session): Session => {
  // tempPending only in saves from before companions joined at once.
  const s: Session = s0.tempPending ? joinTemp({ ...s0, tempPending: undefined }, s0.tempPending.npc, s0.tempPending.goal) : s0;
  const temp = s.tempParty || {}, party = s.party || [];
  const gone = Object.keys(temp).filter(n => !party.includes(n) || (!open(s, temp[n]) && playerActs(s) - (s.tempSince?.[n] ?? 0) >= TEMP_MIN_ACTS));
  if (!gone.length) return s;
  const home = gone.filter(n => party.includes(n));
  // Gone from the scene and its choices too (실바엘 left, then was offered as someone to talk to).
  return { ...s, party: party.filter(n => !home.includes(n)), tempParty: Object.fromEntries(Object.entries(temp).filter(([n]) => !gone.includes(n))), sceneNpcs: (s.sceneNpcs || []).filter(n => !home.includes(n)), handledNpcs: [...new Set([...(s.handledNpcs || []), ...home])], suggestedActions: (s.suggestedActions || []).filter(c => !home.some(n => c.includes(n))),
    log: [...s.log, ...home.map(n => `시스템: 일을 마친 ${n}${josa(n, "이")} 임시 동행을 끝내고 돌아갑니다.`)] };
};
// The one goal on screen: what the player is busy with now. The director's read of the recent scenes wins when it is newer
// than the game's own pick (a quest that just came up); with neither, the last quest in the list.
// Scenes the GM has written since the player last arrived somewhere.
export const scenesHere = (s: Session) => { let n = 0; for (let i = s.log.length - 1; i >= 0 && !/^시스템: .*이동했습니다./.test(s.log[i]); i--) if (s.log[i].startsWith('GM:')) n++; return n; };
export const currentGoalOf = (s: Session): string => {
  const q = questsOf(s);
  return (s.focus && q.includes(s.focus) ? s.focus : '') || q[q.length - 1] || '';
};
// A goal is never rewritten into a longer version of itself: closing a goal and re-adding the same goal with more text is undone, so new work becomes its own entry.
export const QUEST_LENGTH = 80;
export const sameQuest = (a: string, b: string) => { const x = a.replace(/\s+/g, ''), y = b.replace(/\s+/g, ''); if (x.includes(y) || y.includes(x)) return true; let i = 0; while (i < x.length && x[i] === y[i]) i++; return i >= Math.min(15, Math.ceil(Math.min(x.length, y.length) * 0.5)); };
// The same goal in other words: most letter pairs of the shorter one appear in the other. Short quests need
// the prefix match, so two different errands that share a place name are not merged.
export const questPairs = (t: string) => { const x = t.replace(/[^가-힣a-zA-Z0-9]/g, ''); return new Set(Array.from({ length: Math.max(0, x.length - 1) }, (_, i) => x.slice(i, i + 2))); };
export const alikeQuest = (a: string, b: string) => { if (sameQuest(a, b)) return true; const p = questPairs(a), q = questPairs(b); if (Math.min(p.size, q.size) < 6) return false; let both = 0; for (const k of p) if (q.has(k)) both++; return both / Math.min(p.size, q.size) >= 0.5; };
// Finishing a quest pays out without waiting on the GM: reputation and a purse of gold. The giver's goodwill is the bookkeeper's call (a refused giver gained +10 in the 4th test).
export const QUEST_REPUTATION = 150, QUEST_GOLD = 50;
// How much hangs on a roll or a goal. The writer names it; the game turns it into the DC and the payout, so small things
// early on are easy and pay little, and the turning points are hard and pay a lot (a straw dummy was a coin flip that paid nothing).
export type Weight = 'small' | 'normal' | 'big' | 'decisive';
export const WEIGHT_LABEL: Record<Weight, string> = { small: '작음', normal: '보통', big: '큼', decisive: '결정적' };
// Early on most rolls should pass (user: "초반엔 왠만하면 통과"): at Lv.1 with +2, small 95%, normal 85%, big 70%, decisive 55%.
const WEIGHT_DC: Record<Weight, number> = { small: 4, normal: 6, big: 9, decisive: 12 };
// A weight word (or its label), or an old-style DC number mapped to the nearest weight.
export const weightOf = (v: unknown): Weight | undefined => {
  const t = String(v ?? '').trim(), w = (Object.keys(WEIGHT_LABEL) as Weight[]).find(k => k === t || t.startsWith(WEIGHT_LABEL[k]));
  if (w) return w;
  const n = Number(t.match(/\d+/)?.[0]);
  return !n ? undefined : n <= 10 ? 'small' : n <= 13 ? 'normal' : n <= 16 ? 'big' : 'decisive';
};
// One DC step per 3 levels on top of the weight, never past 20: the turning points late in the story get hard.
export const checkDc = (w: Weight, level: number) => Math.min(20, WEIGHT_DC[w] + Math.floor((Math.max(1, level) - 1) / 3));
// xp: share of the level (with earlyBoost); gold: per (level + 1); rep: flat; gear: reward odds (none for small things); hurt: share of max HP a failed roll costs.
type Stake = { xp: number; gold: number; rep: number; gear: 'main' | 'event' | 'side' | null; hurt: number };
// Share of max HP a failed roll costs (small is never rolled now; kept for old saves' pending checks).
const CHECK_HURT: Record<Weight, number> = { small: 0.05, normal: 0.1, big: 0.18, decisive: 0.28 };
const QUEST_STAKES: Record<Weight, Stake> = {
  small: { xp: 0.2, gold: 5, rep: 20, gear: null, hurt: 0 }, normal: { xp: 0.5, gold: 15, rep: 80, gear: 'side', hurt: 0 },
  big: { xp: 0.8, gold: 25, rep: 150, gear: 'side', hurt: 0 }, decisive: { xp: 1.2, gold: 50, rep: 300, gear: 'main', hurt: 0 },
};
const payOf = (s: Stake, level: number, maxHp: number) => ({ xp: Math.round(xpToNext(Math.max(1, level)) * s.xp * earlyBoost(level)), gold: s.gold * (Math.max(1, level) + 1), rep: s.rep, gear: s.gear, hurt: Math.round(maxHp * s.hurt) });
export const questStakes = (w: Weight, level: number) => payOf(QUEST_STAKES[w], level, 0);
// A goal's weight from where it came from: the finale is decisive, a region story or board job normal, anything play
// turned up small ("근무 절차 확인하기" paid the same as the entrance exam).
// The goal that ends a story: a region story's last step or the finale. Its gear is the story's reward (user 2026-11-26:
// a 5-step story handed out 5 pieces).
export const storyEnds = (g: Game, q: string) => alikeQuest(finaleQuest(g) || '', q) || regionQuestsOf(g).some(r => !!r.steps.length && alikeQuest(r.steps[r.steps.length - 1].q, q));
export const questWeight = (g: Game, q: string): Weight => {
  if (alikeQuest(finaleQuest(g) || '', q)) return 'decisive';
  if (alikeQuest(mainPrologue(g.wizardMain)?.firstQuest || '', q)) return 'normal';
  return regionQuestsOf(g).some(r => alikeQuest(r.title, q) || r.steps.some(x => alikeQuest(x.q, q))) ? 'normal' : 'small';
};
// How the goal is prepared to go, from the story data ("할 일 → 그때 벌어지는 일"), as material for the writer and the talk.
// With only the goal's name, the talk made the entrance exam a wooden-sword duel and the writer dragged it out over 9 turns.
// People one story (the current goal) brings in: 1~2, 3 for a long one (user, 2026-11-12). storyNpcs counts who was met
// under the goal; once full the writer gets only people already met, as 넬 and 실바엘 joined 에드리아 within three actions.
export const storyCastFull = (g: Game, s: Session) => { const goal = currentGoalOf(s); return (s.storyNpcs?.goal === goal ? s.storyNpcs.names.length : 0) >= (goalPath(g, goal).length > 3 ? 3 : 2); };
export const storyNpcsAfter = (s: Session, relationships: { name: string }[]) => {
  const goal = currentGoalOf(s), before = new Set((s.relationships || []).map(r => r.name));
  return { goal, names: [...new Set([...(s.storyNpcs?.goal === goal ? s.storyNpcs.names : []), ...relationships.map(r => r.name).filter(n => !before.has(n))])] };
};
// There is no main story (user, 2026-11-16: "메인스토리 개념이 있으면 안돼"): the story is made wherever the player goes,
// from the world's material. What stays fixed is the progress (acts, %) and the ending, the world's final boss.
// The main's whole chain is prepared story too: its later steps come back as goals (preparedGoal), so they need their path.
const storySteps = (g: Game) => { const m = mainPrologue(g.wizardMain); return [...(mainChain(g) || (m?.firstQuest ? [{ q: m.firstQuest, beats: m.firstBeats }] : [])), ...regionQuestsOf(g).flatMap(r => [{ q: r.title, beats: r.steps.flatMap(x => x.beats) }, ...r.steps])]; };
const stepOf = (g: Game, q: string) => q ? storySteps(g).find(x => alikeQuest(x.q, q)) : undefined;
// What the hero already found here, from any step: told once, a search here has nothing new. Without it the writer
// re-told the 관측소 log's whole finding on every look (2026-11-20).
export const foundHere = (g: Game, s: Session) => { const where = regionWhere(g, s); return [...new Set(storySteps(g).flatMap(x => x.beats || []).filter(b => b.do === 'search' && b.at.some(w => where.includes(w)) && wasTold(s.delivered, b.then)).map(b => b.then))]; };
// The step that follows a goal in its own story (the main chain or a region story).
const nextStepOf = (g: Game, q: string) => { for (const steps of [mainChain(g) || [], ...regionQuestsOf(g).map(r => r.steps)]) { const i = steps.findIndex(x => alikeQuest(x.q, q)); if (i >= 0) return steps[i + 1]; } return undefined; };
export const goalPath = (g: Game, q: string, s?: Session): string[] => {
  const b = lastBeat(g), place = bossPlace(g);
  // The finale's path: go to where the boss waits, then fight it (user: "자연스럽게 최종 보스 위치로 가게").
  if (b?.do === 'defeat' && place && alikeQuest(finaleQuest(g) || '', q)) return [`${place}에서 ${b.foe}${josa(b.foe, '이')} 기다린다`, b.then];
  const beats = stepOf(g, q)?.beats || [], done = s ? beatsDone(beats, s.log, goalStart(s, q), s.delivered) : 0;
  // Done beats go as what already happened (so they are not asked for again, 에드리아's 지원서 three times); the rest keep
  // where and what (without it the writer had the hero mark the wolf site for 에드리아 instead of going back to report).
  return beats.map((b, i) => i < done ? `이미 일어남: ${s ? beatOutcome(b, s.log) : b.then}` : `${beatGoal(b)} → ${b.then}`);
};
// Open goals whose every prepared beat the log shows: the game closes them itself. Left to the bookkeeper, 장물 단속 (last
// beat a fight, no talk to say "done") stayed open for ~40 turns with nothing left, and the writer made up 핍's errands.
// A goal with no prepared beats that names a foe (a 토벌 job like "숲 트롤 토벌하기") is finished by a win over that foe since it was set.
// This is the one place the game judges goals: the turn (turn.ts) closes, pays and celebrates what it returns.
export const goalsFinished = (g: Game, s: Session) => questsOf(s).filter(q => {
  const beats = stepOf(g, q)?.beats || [], from = goalStart(s, q);
  // A goal with beats ends only when each one happened. It used to be passed once the hero turned to the next step (its foe
  // faced or beaten): 이현욱's 행방 goal closed, paid, at the 회색 탑 skeletons without the report to 에드리아 (4th test, T43).
  // A step run ahead (넬's wyvern hunted before 한나 was asked) now waits: its fight counts when its goal comes (beatsDone).
  if (beats.length) return beatsDone(beats, s.log, from, s.delivered) >= beats.length;
  return s.log.slice(Math.max(0, from)).some(l => { const foe = l.match(/^전투: 승리 — (.+?)[을를] 쓰러뜨렸다/)?.[1]; return !!foe && q.includes(foe); });
});
// What a done beat brought: a duel the hero lost goes on its losing way.
export const beatOutcome = (b: Beat, log: string[]) => b.do === 'defeat' && b.lose && [...log].reverse().find(e => /^전투: (승리|패배) — /.test(e) && e.includes(b.foe))?.startsWith('전투: 패배') ? b.lose : b.then;
// The current goal's next beat (undefined when all are done).
const beatNow = (g: Game, s: Session) => { const goal = currentGoalOf(s), beats = stepOf(g, goal)?.beats || []; return { goal, beat: beats[beatsDone(beats, s.log, goalStart(s, goal), s.delivered)] }; };
// The decision the current goal waits on: the game offers its options as the choices, so picking one is the decision.
// Left to the writer, the options came back reworded and the pick never counted.
export const pendingChoice = (g: Game, s: Session): string[] => { const { beat } = beatNow(g, s); return beat?.do === 'choose' ? beat.options : []; };
// Those options first, word for word, wherever the next choices are set (a scene, the end of a talk); the scene's own fill the rest.
export const withDecision = (g: Game, s: Session): Session => { const decide = !s.mode ? pendingChoice(g, s) : []; return decide.length ? { ...s, suggestedActions: [...decide, ...(s.suggestedActions || []).filter(c => !decide.some(o => alikeQuest(o, c)))].slice(0, 3) } : s; }; // 3: what the play screen shows
// The story's fight the hero stands at: the current goal's 'defeat' beat, or, while the goal waits only on a decision (or is
// done), the next step's opening fight. The game sets it on the hero; the writer never brought 회색 탑's 광신도 and looped the
// rescue for 25 turns instead (2026-11-19).
// The story's fight with a person standing here (바레나's duel): fought in the game's fight, not settled by a roll the writer
// asked for (a D20 decided it and the lost duel left the step with no way on, 2026-11-20).
export const duelBeat = (g: Game, s: Session) => { const { beat } = beatNow(g, s); if (beat?.do !== 'defeat' || findFoe(defaultMapGenre(g), beat.foe)) return undefined; const where = regionWhere(g, s); return !beat.at?.length || beat.at.some(w => where.includes(w)) ? beat : undefined; };
// The scene AI is told it (storyFoe) and its bookkeeper says when it attacks (ambush); the game no longer sets it on the hero
// by the place name (광신도 in the vault the game filed under 항구 선창, user 2026-11-26).
export const storyFight = (g: Game, s: Session): { foe: string; at: string[]; then: string } | undefined => {
  // Not again right after the hero fled from it or fell to it: the next few actions are theirs.
  const fresh = (foe: string) => { const last = s.log.map(l => (l.startsWith('전투: ') || l.startsWith('시스템: 도망 성공 — ')) && l.includes(foe)).lastIndexOf(true); return last < 0 || s.log.slice(last).filter(l => l.startsWith('플레이어:')).length >= 3; };
  // At 100% the final boss waits at its place; the scene brings it on when it gets there (no longer the game, on arrival).
  if (bossWaits(g, s)) { const boss = finalBoss(g)!; return findFoe(defaultMapGenre(g), boss) && fresh(boss) ? { foe: boss, at: [bossPlace(g)!], then: finaleQuest(g) || '' } : undefined; }
  const { goal, beat } = beatNow(g, s);
  const fight = beat?.do === 'defeat' ? beat : !beat || beat.do === 'choose' ? nextStepOf(g, goal)?.beats[0] : undefined;
  if (fight?.do !== 'defeat' || !findFoe(defaultMapGenre(g), fight.foe) || !fresh(fight.foe)) return undefined;
  return { foe: fight.foe, at: fight.at || [], then: fight.then };
};
// The beat the hero's move reaches now, which the writer is told must happen (mustHappen) and which counts once told: the
// current goal's next beat when the hero talks with its person, or stands at its place (a search needs an action, not the
// arrival). The game decides when a beat happens; the writer only tells it (quest-beats.ts).
// In a talk, the partner's own next beat: of the current goal, else of another open goal, else the first of her own story not
// started yet (ownStoryStep, the same pick that makes her job a goal). Given only the current goal's, 레지나 improvised a letter
// to 북문 초소 while the exam was current, and the game filed it as her estate story (2026-11-23).
const beatAhead = (g: Game, s: Session): Beat | undefined => {
  const next = (q: string) => { const beats = stepOf(g, q)?.beats || []; return beats[beatsDone(beats, s.log, goalStart(s, q), s.delivered)]; };
  const b = next(currentGoalOf(s)), mine = (x?: Beat) => x?.do === 'talk' && x.npc === s.talkNpc;
  if (s.mode !== 'talk' || !s.talkNpc || mine(b)) return b;
  const own = ownStoryStep(g, s, s.talkNpc);
  return [...questsOf(s).map(next), own ? stepOf(g, own)?.beats[0] : undefined].find(mine) || b;
};
export const dueBeat = (g: Game, s: Session, arriving = false): Beat | undefined => {
  const b = beatAhead(g, s);
  if (!b) return undefined;
  // told once, not every line (엘로이즈 said it 3 times). It answers what the player says: on the opening reply 에드리아 had
  // already "heard the report" before the hero gave it (2026-11-20). A priced one goes with its price (beatBrief).
  if (b.do === 'talk') return s.mode === 'talk' && s.talkNpc === b.npc && talkTurns(s) >= 1 && !wasTold(s.delivered, b.then) ? b : undefined;
  if (s.mode || (b.do !== 'search' && b.do !== 'reach') || (b.do === 'search' && arriving)) return undefined;
  const where = regionWhere(g, s);
  return !b.at.length || b.at.some(w => where.includes(w)) ? b : undefined;
};
// The step the bookkeeper (the AI that reads each scene or talk reply) is asked about: the current goal's next one, when the
// game isn't handing it to the writer this turn (dueBeat). Its OK counts the step and the game tells the fixed outcome (turn.ts),
// so a step done in other words, at another spot or on arrival counts: 이현욱 searched 파도의 성소 only on arrival turns, and
// dived into the vault from 바레나's ship, not at 산호 동굴 (4th test). Fights are the game's own result; a paid tip and a talk
// with its own person stay with dueBeat (the price, and the reply after the player speaks).
export const stepBeat = (g: Game, s: Session): Beat | undefined => {
  if (s.mode && s.mode !== 'talk') return undefined;
  const b = beatAhead(g, s);
  return !b || b.do === 'defeat' || b.do === 'reach' ? undefined : b;
};
// What the writer is handed for a step: its outcome, and for a priced tip (핍) the price that comes first.
export const beatBrief = (b: Beat) => b.do === 'talk' && b.pay ? `${b.npc}${josa(b.npc, '은')} 아는 것을 말해 주는 대가로 ${b.pay}골드를 요구하고, 주인공이 그 값을 치르면 말해 준다: ${b.then}` : b.then;
export const stepToCheck = (g: Game, s: Session) => {
  const b = stepBeat(g, s);
  if (!b) return '';
  const what = b.do === 'talk' && b.pay ? `${b.npc}에게 ${b.pay}골드를 치르고 이 이야기를 듣기: ${b.then}` : b.do === 'talk' ? (b.accept ? `${b.npc}에게 이 일을 알리기: "${b.accept}"` : `${b.npc}에게서 이 이야기를 듣기: ${b.then}`)
    : b.do === 'search' ? `${b.at[0] || '그곳'}에서 찾아보기(찾게 될 것: ${b.then})` : b.do === 'choose' ? `이 가운데 하나로 정하기: ${b.options.join(' / ')}` : '';
  return `${what} (목표: ${currentGoalOf(s)})`;
};
// The line the game adds when the bookkeeper counts a step (turn.ts); beatsDone counts the step on it.
export const stepLine = (b: Beat) => `시스템: ${b.do === 'search' ? '찾아낸 것' : '진행'} — ${b.then}`;
// A talk beat with a price (핍's tip): the player's last line offers to pay and the purse holds it. Before, the beat ran on
// the talk's first line: 핍 held out her hand for money, then told it all for free and no gold left the purse (2026-11-20).
// Where an action takes the player: the one place that decides a move (2026-11-20). Before, seven spots judged it (the
// action's words, a walk to talk, the goal's search place, the writer's [이동:] tag, the scene heading twice) and they
// disagreed: the goal's search moved the scene to 진흙 골목 before the request, the writer still wrote the departure from
// 북문 초소, the tag found the player already there, the heading moved them back, and the turn ended with no choices.
// pin: go there on the map (place: the spot inside that city the scene opens at). place alone: a walk inside this city.
// why: a named place that can't be reached from here. undefined: no move; the action is played where the player stands.
export type Route = { pin?: MapPin; place?: string; why?: string };
export const routeFor = (g: Game, s: Session, text: string): Route | undefined => {
  if (s.mode || !TRAVEL_VERB.test(text)) return undefined;
  const map = (g.maps || []).find(m => m.id === s.mapId), here = map?.pins.find(p => p.id === s.pinId);
  if (!map || !here) return undefined;
  const genre = defaultMapGenre(g);
  const headed = (w: string) => [`${w}으로`, `${w}로`, `${w}에 `, `${w}까지`, `${w} 쪽`, `${w}쪽`].some(x => text.includes(x));
  const words = (p: MapPin) => p.kind === 'exit' ? [] : p.name.split(/\s+/).filter(w => w.length >= 2 && !GENERIC_PLACE.test(w));
  const pins = map.pins.filter(p => p.id !== here.id && p.kind !== 'event');
  const toPin = (p: MapPin, place?: string): Route => mapRoute(map, here, p.id).length ? { pin: p, ...(place ? { place } : {}) } : { why: `${p.name}${josa(p.name, '은')} 여기서 바로 이어지지 않습니다. 지도에서 가까운 곳을 거쳐 가세요.` };
  // A place inside a city, longest name first (북문 초소, 진흙 골목); in this city it is a walk, in another it is that city's pin.
  // In the city the hero is in, a place also goes by one word of its name (성소로, 관측소에 가서, 북문으로, 여관에) when no other
  // place there shares that word: "성소에 들러" moved nowhere, so the 파도의 성소 search was never counted (2026-11-26).
  const local = [...new Set(cityPlaces(genre).filter(([, c]) => c === here.name).map(([n]) => n))];
  const short = (w: string) => w.length >= 2 && w !== here.name && !GENERIC_PLACE.test(w) && local.filter(n => n.split(/\s+/).includes(w)).length === 1;
  const nick = local.find(n => n.split(/\s+/).some(w => short(w) && headed(w)));
  const inCity = cityPlaces(genre).find(([n]) => headed(n)) || cityPlaces(genre).find(([n]) => text.includes(n)) || (nick ? [nick, here.name] as [string, string] : undefined);
  const walk = (place: string): Route | undefined => place === s.scenePlace ? undefined : { place };
  const headedPin = pins.find(p => headed(p.name) || words(p).some(headed));
  if (headedPin && !(inCity && headed(inCity[0]) && inCity[1] === here.name)) return toPin(headedPin);
  if (inCity?.[1] === here.name) return walk(inCity[0]);
  // A pin named only as part of a place inside it (그림우드 in 그림우드 숲 가장자리) is reached below with that place.
  const namedPin = pins.find(p => p.kind !== 'exit' && text.includes(p.name) && p.name !== inCity?.[1]);
  if (namedPin) return toPin(namedPin);
  if (inCity) { const city = pins.find(p => p.name === inCity[1] && p.kind !== 'exit'); if (city) return toPin(city, inCity[0]); }
  // Another map: the exit leading to it. shortcut: one hop only; upgrade with a path search if maps chain.
  const other = (g.maps || []).find(m => m.id !== map.id && ((m.name.length >= 2 && text.includes(m.name)) || m.pins.some(p => p.kind !== 'exit' && p.kind !== 'event' && p.name.length >= 2 && text.includes(p.name))));
  const exit = other && map.pins.find(p => p.kind === 'exit' && p.targetMapId === other.id);
  if (exit) return toPin(exit);
  if (other) return { why: `${other.name}${josa(other.name, '로')} 바로 이어지는 길이 여기에는 없습니다. 지도에서 다른 길을 거쳐 가세요.` };
  // No place named, a known person is ("말라키아를 찾아간다"): where the story keeps them.
  const at = Object.entries(npcWhereabouts(g, s)).sort((a, b) => b[0].length - a[0].length).find(([n]) => n.length >= 2 && text.includes(n))?.[1];
  return at && at !== s.scenePlace && at !== here.name ? routeFor(g, s, `${at}로 간다`) : undefined;
};
// The heading names where the game has the player, whatever place the writer put there (【북문 초소】 written at 진흙 골목).
// A heading naming a spot that holds no other known place (그림우드 숲 가장자리 at 그림우드) is kept as written.
export const placeHeading = (g: Game, s: Session, text: string) => {
  const m = text.match(/^(\s*【)([^】·|]+)/);
  if (!m || s.mode) return text;
  const pinHere = (g.maps || []).find(x => x.id === s.mapId)?.pins.find(p => p.id === s.pinId)?.name || '', here = s.scenePlace || pinHere;
  const label = m[2].trim();
  if (!here || label.includes(here) || (!s.scenePlace && pinHere && label.includes(pinHere))) return text;
  const genre = defaultMapGenre(g);
  const elsewhere = cityPlaces(genre).some(([n]) => label.includes(n)) || (g.maps || []).some(x => x.pins.some(p => p.kind !== 'exit' && p.kind !== 'event' && p.name.length >= 2 && label.includes(p.name)));
  return elsewhere ? text.replace(/^(\s*【)[^】·|]+/, `$1${here} `).replace(/^(\s*【[^】·|]*?)\s+(】)/, '$1$2') : text;
};
// Where the prepared story stands, for the director: steps done, the current one with what is left, and the next ones.
// The director planned from the scenes alone and never knew the steps: at 회색 탑 its plan followed the crates and the
// letter to 핍 while the game had moved on to 다이어울프, and the writer, given both, pushed neither.
export const storyStatus = (g: Game, s: Session) => {
  const chain = mainChain(g) || [], done = questsDone(s), goal = currentGoalOf(s), at = chain.findIndex(st => alikeQuest(st.q, goal));
  const lines = chain.flatMap((st, i) => done.some(d => alikeQuest(d, st.q)) ? [`끝남: ${st.q}`] : i === at ? [`지금: ${st.q} — ${goalPath(g, goal, s).join(' / ')}`] : i > at && i <= at + 2 ? [`앞으로: ${st.q}`] : []);
  return at < 0 && goal ? [...lines, `지금: ${goal} — ${goalPath(g, goal, s).join(' / ') || '준비된 단계 없음'}`] : lines;
};
// Where a goal starts in the log: its "새 목표" line, else the start (a main's first goal is there from the opening).
const goalStart = (s: Session, q: string) => s.log.map(e => e.startsWith('시스템: 새 목표 — ') && alikeQuest(e.slice(12).replace(/ (의뢰인 .*)$/, ''), q)).lastIndexOf(true);
// How many of a goal's beats the log shows, in order, from the game's own lines: a talk with that person ended, that foe
// beaten, a scene at the place (search: one the player acted in, not the arrival), an option picked. A first talk may come
// before the goal's line (the talk that gave it). A talk, search or arrival also needs the writer to have been told its outcome
// (delivered, see dueBeat): counted on any talk or any action there, 회색 탑 closed in 3 of 4 runs without its 맹세문 or
// 에드리아's order ever told, and the next step came with no reason in the story. Sessions from before (no delivered) keep the old count.
// A beat told with older wording still counts once the data grows a clause (실바엘's line gained the 레지나 warning).
export const wasTold = (delivered: string[] | undefined, then: string) => !!delivered?.some(d => d === then || then.startsWith(d) || d.startsWith(then));
export const beatsDone = (beats: Beat[], log: string[], from: number, delivered?: string[]) => {
  const told = (b: Beat) => !delivered || wasTold(delivered, b.then);
  const place = (e: string) => e.match(/^GM: 【([^】]*)】/)?.[1] || '';
  const acted = (i: number) => { for (let k = i - 1; k >= 0 && !log[k].startsWith('GM:'); k--) { if (log[k].endsWith('이동했습니다.')) return false; if (log[k].startsWith('플레이어:')) return true; } return false; };
  const hit = (b: Beat, e: string, i: number) => {
    if (b.do !== 'defeat' && e === stepLine(b)) return true;
    const here = () => !!place(e) && (!('at' in b) || !b.at?.length || b.at.some(w => place(e).includes(w)));
    switch (b.do) {
      case 'talk': return e.match(/^시스템: (.+?)[와과]의 대화가 끝났습니다.$/)?.[1] === b.npc && told(b);
      // A duel with its own losing way (바레나) is over either way: the story goes on from how it ended.
      case 'defeat': return (e.startsWith('전투: 승리 — ') || (!!b.lose && e.startsWith('전투: 패배 — '))) && e.includes(b.foe);
      // Whether a search or arrival happened, and where, is decided once, when it is handed to the writer (dueBeat): the record
      // is trusted. Guessing again from the scene's heading or the log's shape missed 회색 탑's 맹세문 and 파도의 성소's records.
      case 'reach': return delivered ? e.startsWith('GM:') && told(b) : here();
      case 'search': return delivered ? e.startsWith('GM:') && told(b) : here() && acted(i);
      case 'choose': return false;
    }
  };
  let at = Math.max(0, from), done = 0;
  // A first-step fight won while the goal before was still open (넬's wyvern before 한나 was asked) counts once this goal comes.
  // shortcut: "the goal before" is the last goal set before this one, which may be a side job; upgrade by tracking story order.
  let before = Math.min(at, log.length) - 1; while (before >= 0 && !log[before].startsWith('시스템: 새 목표 — ')) before--;
  for (const [n, b] of beats.entries()) {
    const i = log.findIndex((e, k) => k >= (n === 0 && b.do === 'talk' ? 0 : n === 0 && b.do === 'defeat' && before >= 0 ? before : at) && hit(b, e, k));
    if (i < 0) break;
    done++; at = i + 1;
  }
  return done;
};
// The final boss: material of the chosen world (the foe its story data ends on). The game ends only when it falls.
const lastBeat = (g: Game) => (mainChain(g) || []).slice(-1)[0]?.beats.filter(b => b.do === 'defeat').pop();
export const finalBoss = (g: Game): string | undefined => { const b = lastBeat(g); return b?.do === 'defeat' ? b.foe : undefined; };
// Where the final boss waits: the map's own place for the story's (the data says 마탑 본탑, the map 마탑 본부), matched by
// name, else by a shared word of 2+ letters, in the story's order of places; the story's name when the map has none.
export const bossPlace = (g: Game): string | undefined => {
  const b = lastBeat(g); if (b?.do !== 'defeat' || !b.at?.length) return undefined;
  const pins = (g.maps || []).flatMap(m => m.pins).filter(p => p.kind !== 'exit' && p.kind !== 'event').map(p => p.name);
  const words = (n: string) => n.split(/\s+/).filter(w => w.length >= 2);
  for (const a of b.at) { const hit = pins.find(n => n === a) || pins.find(n => words(a).some(w => words(n).includes(w))); if (hit) return hit; }
  return b.at[0];
};
// Who is in a goal's story: the people its beats talk with and the giver of the region story it belongs to.
export const goalPeople = (g: Game, q: string) => [...new Set([...(stepOf(g, q)?.beats || []).flatMap(b => b.do === 'talk' ? [b.npc] : []), ...regionQuestsOf(g).filter(r => r.steps.some(st => alikeQuest(st.q, q))).map(r => r.giver)])];
// On arrival the place decides what the GM steers by (user 2026-11-23: "다른 지역 가면 현재 상태에 의해 목표가 바뀌거나 상황이 진행"):
// the current goal when its next beat is here; else another open goal whose next beat is here becomes current; else, where people
// live, the current goal waits behind (away) and their own doings and stories lead, until a new goal takes over or the hero
// moves on. An empty place keeps the goal: with nothing to steer by, the writer circled at 회색 탑 for 13 turns (2026-11-19).
export const goalHere = (g: Game, s: Session, place: string): Session => {
  const pin = (g.maps || []).find(m => m.id === s.mapId)?.pins.find(p => p.id === s.pinId)?.name || '';
  const where = `${regionWhere(g, s)} ${place}`, people = [...new Set([...placePeople(g, s, place), ...placePeople(g, s, pin)])].filter(n => !(s.party || []).includes(n));
  const at = (ws?: string[]) => !!ws?.length && ws.some(w => where.includes(w));
  const here = (q: string) => { const beats = stepOf(g, q)?.beats || [], b = beats[beatsDone(beats, s.log, goalStart(s, q), s.delivered)]; return !!b && (b.do === 'talk' ? people.includes(b.npc) || at(b.at) : b.do !== 'choose' && at(b.at)); };
  const cur = currentGoalOf(s), back: Session = { ...s, away: undefined };
  if (!cur || here(cur)) return back;
  const waiting = questsOf(s).find(q => q !== cur && here(q));
  if (waiting) return { ...back, focus: waiting, focusAt: s.log.length };
  return people.length ? { ...s, away: { place: place || pin, goal: cur } } : back;
};
// Why the current goal stands still, for the beta dashboard: the prepared beat that comes next and what keeps it from
// happening, read from the game's own state. 승우 and 김민석 circled ~27 turns and the dashboard only said "same goal N turns".
export const stuckCause = (g: Game, s: Session): string => {
  const goal = currentGoalOf(s);
  if (!goal) return '목표가 없음';
  if (s.away?.goal === goal) return `목표가 대기 중 — ${s.away.place}에 머무는 동안 이 목표는 진행되지 않음`;
  const beats = stepOf(g, goal)?.beats || [], from = Math.max(0, goalStart(s, goal)), done = beatsDone(beats, s.log, from, s.delivered), b = beats[done];
  if (!beats.length) return '준비된 장면이 없는 목표 — 끝낼 길이 없음';
  if (!b) return '준비된 장면은 모두 일어났는데 목표가 완료되지 않음';
  const pin = (g.maps || []).find(m => m.id === s.mapId)?.pins.find(p => p.id === s.pinId)?.name || '';
  const here = s.scenePlace?.includes(pin) ? s.scenePlace : [pin, s.scenePlace].filter(Boolean).join(' '), where = regionWhere(g, s);
  // Talks and fights are counted from where the last beat done happened: 에드리아's 10 "talks" for the report were the exam's first talk.
  const since = done ? s.log.findIndex((_, k) => beatsDone(beats.slice(0, done), s.log.slice(0, k + 1), from, s.delivered) >= done) + 1 : from, log = s.log.slice(since);
  const away = 'at' in b && b.at?.length && !b.at.some(w => where.includes(w)) ? `${b.at[0]}에서 일어나는데 플레이어는 ${here || '다른 곳'}에 있음` : '';
  const step = `${done + 1}/${beats.length}단계`;
  switch (b.do) {
    case 'talk': {
      const talks = log.filter(l => new RegExp(`^시스템: ${b.npc}[와과] 대화를 시작했습니다`).test(l)).length, look = !metNames(s).includes(b.npc) && NPC_LOOKS[b.npc];
      const why = wasTold(s.delivered, b.then) ? `장면은 전달됐지만 ${b.npc}${josa(b.npc, '와')}의 대화가 끝나지 않음`
        : talks ? (b.pay ? `${b.npc}에게 ${b.pay}골드를 내야 하는데 값을 치르지 않음 (대화 ${talks}번)` : `${b.npc}${josa(b.npc, '와')} ${talks}번 대화했지만 준비된 장면이 전달되지 않음`)
        : `${b.npc}${look ? `(${look})` : ''}${josa(b.npc, '와')}의 대화가 한 번도 열리지 않음${away ? ` — ${away}` : ''}`;
      return `${step} ${b.npc}${josa(b.npc, '와')} 대화: ${why}`;
    }
    case 'defeat': {
      const fights = log.filter(l => /^(전투: |시스템: 도망 성공)/.test(l) && l.includes(b.foe)).length;
      return `${step} ${b.foe} 쓰러뜨리기: ${fights ? `${fights}번 싸웠지만 이기지 못함` : away || '전투가 시작되지 않음'}`;
    }
    case 'choose': return `${step} 결정: 「${b.options.join('」/「')}」 중 하나를 고르지 않음${(s.suggestedActions || []).some(x => b.options.some(o => x.includes(o))) ? '' : ' (선택지에 나오지 않음)'}`;
    default: return `${step} ${b.do === 'reach' ? '도착' : '조사'}: ${away || `${b.at[0] || here}에 있지만 장면이 전달되지 않음`}`;
  }
};
// The goal the finale opens: the final boss, where it waits.
export const finaleQuest = (g: Game): string | undefined => { const b = lastBeat(g), place = bossPlace(g); return b?.do === 'defeat' ? `${place ? `${place}에서 ` : ''}${b.foe}${josa(b.foe, '을')} 쓰러뜨리기` : undefined; };
// What the GM is told to steer by, every turn and wherever the player is: the current goal and what is left of it (the steps
// name their places, so choice 1 leads there). Goals were blanked when the hero stood somewhere the goal didn't name; at
// 회색 탑 the writer then had nothing to steer by and circled for 13 turns, in three runs. A talk's job is told as other work
// beside the goals, never as the current goal (넬's "look for tracks" steered 6 turns away from reporting to 에드리아).
// Two exceptions (user 2026-11-23, 박재유: the unfinished exam steered every scene at 회색 탑 and 변경백가 영지 back to the
// wolves, and 레지나 relayed 에드리아's exam word for word): a goal waiting behind at a place with its own people (goalHere)
// steers nothing there, and in a talk only someone in the goal's story knows it.
export const gmGoal = (g: Game, s: Session) => {
  const held = currentGoalOf(s), task = s.task?.text || '', open = questsOf(s);
  const goal = !held || s.away?.goal === held || (s.mode === 'talk' && s.talkNpc && !goalPeople(g, held).includes(s.talkNpc)) ? '' : held;
  return { currentGoal: goal, goalPath: goal ? goalPath(g, goal, s) : [], quests: [...open, ...(task && !open.some(q => alikeQuest(q, task)) ? [task] : [])] };
};
// The way to the final boss opens when the boss's story line (the old main story, all but its last step: the boss fight) is
// done, not at 100% (user 2026-11-20): the player may go at once or grow first. Steps passed over count as passed (mainAt).
export const bossOpen = (g: Game, s: Session) => { const chain = mainChain(g) || []; return chain.length > 1 && mainAt(chain, questsDone(s)) >= chain.length - 2; };
// The final boss comes out once its way is open and the player is at its place; before that it isn't there yet.
export const bossWaits = (g: Game, s: Session) => { const place = bossPlace(g); return !!finalBoss(g) && !!place && bossOpen(g, s) && regionWhere(g, s).includes(place); };
// Foes the story sets: the current goal's (a region story's 'defeat' steps) are fought as written. The final boss stays
// off stage until progress hits 100% and the player reaches its place. Act bosses are whatever the story calls for, at a fair level (writerFoes).
export const storyFoes = (g: Game, s: Session) => {
  const boss = finalBoss(g), finale = bossWaits(g, s);
  // The next step's foe too: when the scene gets there first (넬's wyvern on stage while 한나 was still to be asked), it is fought, at the player's level.
  const goal = currentGoalOf(s), steps = [stepOf(g, goal), nextStepOf(g, goal)];
  const now = [...new Set(steps.flatMap(st => st?.beats || []).flatMap(b => b.do === 'defeat' ? [b.foe] : []))].filter(n => n !== boss);
  return boss && finale ? { now: [...now, boss], later: [] } : { now, later: boss ? [boss] : [] };
};
// The story moves on with every story the player finishes. The boss's story line (the old main story) carries MAIN_SHARE of
// the bar over its steps, whatever their count (19 for the knight, 13 for the mage), so following it grows the hero fast
// (storyLevelAt); every other goal adds points by its weight (small 1, normal/big 2, decisive 3) toward the rest (user 2026-11-20).
// Before, a main step was a small goal: the whole main story came to 56% (knight) / 47% (mage).
// shortcut: a weight per goal, not per what it did; if made-up errands farm progress, weigh them by the director instead.
// Side goals add none (user 2026-11-26: a region step was +5 levels); they pay their own experience (questStakes).
const STORY_POINTS: Record<Weight, number> = { small: 0, normal: 0, big: 0, decisive: 0 };
// The boss line alone leaves the hero at Lv.80 (user 2026-11-20: "메인만 클리어 해도 80").
const STORY_TOTAL = 36, MAIN_SHARE = 0.8;
export const storyPointsOf = (g: Game, quests: string[]) => {
  const line = (mainChain(g) || []).slice(0, -1);
  return quests.reduce((a, q) => a + (line.some(st => alikeQuest(st.q, q)) ? STORY_TOTAL * MAIN_SHARE / line.length : STORY_POINTS[questWeight(g, q)]), 0);
};
// How far the story has come, in story points.
// undefined for a world with no final boss (nothing to end on).
export const storyProgress = (g: Game, s: Session) => {
  if (!finalBoss(g)) return undefined;
  const total = STORY_TOTAL;
  // The final boss down is the end of the story: 100%.
  const done = s.goalCompleted || s.bossDown ? total : Math.min(total, s.storyPoints || 0);
  return { done, total, percent: Math.round(done / total * 100) };
};
// After a turn: the points for the goals finished, and the finale (the final boss) opened as the
// current goal once the boss's story line is done (bossOpen), wherever the player is.
export const withStory = (g: Game, s: Session, done: string[]): Session => {
  const scored = done.length ? { ...s, storyPoints: (s.storyPoints || 0) + storyPointsOf(g, done) } : s;
  const p = storyProgress(g, scored), last = finaleQuest(g);
  if (!p || !last) return scored;
  const place = bossPlace(g);
  // The turn has already logged its finished goals; the way opened this turn if it was shut without them.
  const opens = bossOpen(g, scored), before = { ...s, log: s.log.filter(l => !done.some(q => l.startsWith(`시스템: 목표 완료 — ${q}`))) };
  const next = { ...scored, ...(opens && !bossOpen(g, before) && !scored.goalCompleted ? { log: [...scored.log, `시스템: 최종 보스로 가는 길이 열렸습니다 — ${finalBoss(g)}${josa(finalBoss(g)!, '이')} ${place || '그곳'}에서 기다립니다.`] } : {}) };
  if (next.goalCompleted || !opens || questsOf(next).some(q => alikeQuest(q, last)) || done.some(q => alikeQuest(q, last))) return next;
  return { ...next, quests: [...questsOf(next).slice(-(MAX_QUESTS - 1)), last], focus: last, focusAt: next.log.length, log: [...next.log, `시스템: 새 목표 — ${last}`] };
};
// The level a foe is met at. The final boss is always met at its own level (Lv.100 for tier 10; user, 2026-11-16).
// The current goal's foe matches the player: the story puts it on that step, so its tier's minimum (Lv.10 for
// 다이어울프 우두머리) doesn't apply.
// A story foe comes 1-3 levels over the hero, rolled once when it is met (the threat keeps it) (user 2026-11-20).
// The same foe met again at the same player level is the same level: rolled anew, 다이어울프 우두머리 went Lv.10 → 12 ("매우 위험")
// between a flight and the return, the player still Lv.9 (2026-11-20).
export const foeLevel = (g: Game, s: Session, foe: Foe, rand = () => hashText(`${foe.name}:${s.level || 1}`) % 1000 / 1000) =>
  foe.name === finalBoss(g) ? levelForTier(foe.power) : encounterLevel(!!foe.boss || storyFoes(g, s).now.includes(foe.name), s.level || 1, rand);
// The foes the writer may bring in: fair for the player's level (as for roaming foes), never a later step's, always the current goal's.
export const writerFoes = (g: Game, s: Session) => {
  const { now, later } = storyFoes(g, s), lv = s.level || 1;
  return foesOf(defaultMapGenre(g)).filter(f => now.includes(f.name) || (!later.includes(f.name) && foeLevelRange(f.power, !!f.boss)[0] <= lv + 4));
};
export const startGold = (g: Game) => (g.characterConfig || defaultCharacterConfig()).initialGold;
export const applyQuests = (quests: string[], data: { addQuests?: unknown; completedQuests?: unknown; failedQuests?: unknown }, givers: Record<string, string> = {}) => {
  const strings = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean) : [];
  // A new quest may arrive as plain text or as {text, giver}.
  const incoming = (Array.isArray(data.addQuests) ? data.addQuests : []).map((x: unknown) => typeof x === 'string' ? { text: x.trim(), giver: '' } : x && typeof x === 'object' ? { text: String((x as { text?: unknown }).text || '').trim(), giver: String((x as { giver?: unknown }).giver || '').trim().slice(0, 30) } : { text: '', giver: '' }).filter(q => q.text).map(q => ({ ...q, text: q.text.slice(0, QUEST_LENGTH) }));
  const proposed = incoming.map(q => q.text);
  // The GM sometimes shortens the quest when closing it ("견습 기사 지원서 내기"); a text one contains in the other still counts.
  const closing = (v: unknown) => [...new Set(strings(v).map(c => quests.find(q => sameQuest(q, c)) || ''))].filter(q => q && !proposed.some(a => sameQuest(a, q)));
  const done = closing(data.completedQuests);
  const failed = closing(data.failedQuests).filter(q => !done.includes(q));
  const kept = quests.filter(q => !done.includes(q) && !failed.includes(q));
  const added = proposed.filter((q, i, a) => !kept.some(k => sameQuest(k, q)) && ![...done, ...failed].some(d => sameQuest(d, q)) && a.findIndex(o => sameQuest(o, q)) === i).slice(0, Math.max(0, MAX_QUESTS - kept.length));
  const nextGivers: Record<string, string> = {};
  for (const q of kept) if (givers[q]) nextGivers[q] = givers[q];
  for (const q of added) { const giver = incoming.find(x => x.text === q)?.giver; if (giver) nextGivers[q] = giver; }
  return { quests: [...kept, ...added], done, failed, added, givers: nextGivers, doneGivers: done.map(q => givers[q] || '') };
};
// Affection runs -100..100; the tier is what the GM must act out, not just mention.
// AFFECTION_UNIT: how much one scene moves goodwill (the bookkeeper only says which way).
export const AFFECTION_MIN = -100, AFFECTION_MAX = 100, AFFECTION_STEP = 25, AFFECTION_UNIT = 5;
// A first impression starts at most here; goodwill beyond it is earned by what each person likes (LIKE_GAP actions apart).
export const FIRST_LIKE_MAX = 10, LIKE_GAP = 5;
export const clampAffection = (v: number) => Math.max(AFFECTION_MIN, Math.min(AFFECTION_MAX, Math.round(v)));
export const attitudeTier = (a: number) => a <= -60 ? { label: '적대', tone: 'hostile', act: '적극적으로 해친다: 도움·거래 거절, 위협, 방해, 거짓 정보, 경비나 동료를 부르거나 기회가 오면 공격·함정' }
  : a <= -20 ? { label: '반감', tone: 'cold', act: '경계하고 비협조적이다: 퉁명한 짧은 대답, 정보 숨김이나 거짓말, 웃돈·담보 요구, 부탁은 대가 없이 거절, 뒤에서 험담' }
  : a < 20 ? { label: '중립', tone: 'neutral', act: '이해관계대로만 움직인다: 정가 거래, 공짜 도움 없음, 비밀은 숨김' }
  : a < 60 ? { label: '호의', tone: 'warm', act: '먼저 돕는다: 할인·작은 선물, 소문과 단서를 자진해서 알려 줌, 사소한 부탁은 들어줌' }
  : { label: '신뢰', tone: 'trust', act: '편에 선다: 위험을 감수하고 돕기, 숨기던 비밀이나 개인 사정 일부 털어놓기, 위기에 먼저 나서기' };
// Joining the party is a roll: the higher the NPC's affection and the player's reputation, the better the odds.
// How much each NPC weighs the two, and how picky they are, is fixed per game and never shown; the player only learns yes or no.
export const PARTY_LIMIT = 2;
export const PARTY_THINK_MS = 2200;
// An NPC who dislikes the player (affection under -20) never agrees; otherwise the odds grow with both numbers, from 2% up to 95%.
export const joinChance = (affection: number, reputation: number, taste: { affectionWeight: number; pickiness: number }) => {
  // Below 0 a companion walks out the next turn (turn.ts deserters), so nobody below 0 joins (audit 2026-11-23: -10 joined, then left).
  if (affection < 0) return 0;
  const score = taste.affectionWeight * Math.max(0, affection) / 100 + (1 - taste.affectionWeight) * reputationScore(reputation);
  return Math.max(0.02, Math.min(0.95, score * 1.15 / taste.pickiness));
};
// After a refusal the same NPC can't be asked again until the story has moved on a few entries, so the roll can't be spammed.
export const INVITE_COOLDOWN = 6;
export const inviteWait = (s: Session, npc: string) => { const at = s.inviteRefusals?.[npc]; return at === undefined ? 0 : Math.max(0, at + INVITE_COOLDOWN - s.log.length); };
// Reputation is open-ended: small deeds earn tens, a famous feat hundreds or thousands at once.
export const REPUTATION_STEP = 5000;
export const clampReputation = (v: number) => Math.max(-99999, Math.min(999999, Math.round(v)));
// 0..1 for the join odds: 500 ≈ 0.28, 1,000 ≈ 0.49, 3,000 ≈ 0.86; infamy counts as nothing.
export const reputationScore = (rep: number) => rep <= 0 ? 0 : 1 - Math.exp(-rep / 1500);
export const reputationRank = (rep: number) => rep <= -5000 ? '공포의 대상' : rep <= -1000 ? '악명 높음' : rep <= -100 ? '수상한 자' : rep < 100 ? '무명' : rep < 500 ? '신참' : rep < 2000 ? '알려진 자' : rep < 5000 ? '유명인' : rep < 15000 ? '영웅' : '전설';
export const formatReputation = (rep: number) => `${rep > 0 ? '+' : ''}${rep.toLocaleString('ko-KR')}`;
export const hashText = (t: string) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ (ch.codePointAt(0) || 0), 16777619); return h >>> 0; };
// Some NPCs care mostly about how they feel about you, others about your name in the world; some are simply harder to win over.
export const npcTaste = (g: Game, name: string) => { const h = hashText(`${g.id}:${name.trim()}`); return { affectionWeight: 0.4 + (h % 41) / 100, pickiness: 0.75 + ((h >>> 8) % 51) / 100 }; };
// Each NPC's setting line travels next to the scene so the GM keeps gender, age and personality in the voice; a speech style, once fixed, sticks for the whole playthrough.
export const NPC_PROFILE_LIMIT = 24;
// The genre's cast with what each wants, hides and when it comes out, minus those the main story brings in later.
export const genreCast = (g: Game, _s?: Session) => (GENRE_REF as Record<string, { npcs?: string[] }>)[GENRE_REF_KEY[defaultMapGenre(g)]]?.npcs || [];
export const knownNpcNames = (g: Game, s: Session) => [...new Set([...npcProfiles(g, s).map(p => p.name), ...(g.npcPortraits || []).map(n => n.name), ...(DEFAULT_NPC_NAMES[defaultMapGenre(g)] || [])])];
export const npcProfiles = (g: Game, s: Session) => {
  const prompt = g.prompt || '';
  const promptNames = [...prompt.matchAll(/^\s*\d+\.\s*([^(\n·]{1,20}?)\s*\(\d+\s*·\s*[남여]/gm)].map(m => m[1].trim());
  const stage = [s.talkNpc || '', s.combat?.npc || '', ...(s.sceneNpcs || [])].filter(Boolean);
  const names = [...new Set([...stage, ...(s.relationships || []).map(r => r.name), ...(g.npcPortraits || []).map(n => n.name), ...promptNames])].slice(0, NPC_PROFILE_LIMIT);
  const lines = prompt.split('\n');
  return names.map(name => {
    const portrait = (g.npcPortraits || []).find(n => n.name === name);
    const line = (lines.find(l => l.includes(name + '(')) || lines.find(l => l.includes(name)) || '').replace(/^\s*\d+\.\s*/, '').trim();
    const gender = portrait?.gender === 'female' ? '여성' : portrait?.gender === 'male' ? '남성' : '';
    const card = [gender, portrait?.age, portrait?.faction, portrait?.description, s.npcCards?.[name]].filter(Boolean).join(' / ');
    const rel = (s.relationships || []).find(r => r.name.trim() === name.trim());
    const attitude = rel ? { relation: rel.relation, affection: rel.affection, attitude: `${attitudeTier(rel.affection).label} — ${attitudeTier(rel.affection).act}` } : { attitude: '아직 만나지 않음' };
    const unmetLook = NPC_LOOKS[name] && !metNames(s).includes(name) ? NPC_LOOKS[name] : '';
    return { name, inScene: stage.includes(name), ...(unmetLook ? { heroCalls: unmetLook } : {}), ...((s.party || []).includes(name) ? { inParty: true } : {}),profile: [line, card].filter(Boolean).join(' | ').slice(0, 320), ...(s.npcNotes?.[name] ? { remembers: stage.includes(name) || (s.party || []).includes(name) ? s.npcNotes[name] : s.npcNotes[name].slice(0, 200) } : {}), speechStyle: s.npcVoices?.[name] || '', ...attitude };
  });
};


export const GAME_TYPES = ['RPG / 탐험','전략 / 전쟁','추리 / 미스터리','파티 / 캐주얼','경영 / 경제','생존 / 협동','자유 시뮬레이션','기타'];
export const COOPERATION = ['협동','경쟁','혼합'];
export const PROGRESSION = ['턴제','동시 행동','자유 진행 (AI GM 중심)'];
export const PLAY_TIMES = ['10~30분','30~60분','1시간 이상','장기 캠페인'];
export const normalizeType = (g: Game) => g.gameType || (GAME_TYPES.includes(g.genre || '') ? g.genre! : 'RPG / 탐험');
export const MAX_TAGS = 10;
export const makeId = () => Math.random().toString(36).slice(2, 11);
// Render Korean labels onto the actual map bitmap. Preserve baseImage for editable re-rendering.
export async function renderLabeledMap(source: string, pins: MapPin[]): Promise<string> {
  const img = new window.Image();
  img.src = source;
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('맵 이미지를 불러오지 못했습니다.')); });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지 합성을 지원하지 않는 브라우저입니다.');
  ctx.drawImage(img, 0, 0);
  const scale = canvas.width / 1536;
  const fontSize = Math.max(17, Math.round(23 * scale));
  const padX = 15 * scale, padY = 10 * scale;
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const used: {x:number;y:number;w:number;h:number}[] = [];
  for (const pin of pins.filter(p => p.name.trim() && p.kind !== 'event')) {
    const label = pin.name.trim().slice(0, 30);
    const width = Math.min(canvas.width - 12, ctx.measureText(label).width + padX * 2);
    const height = fontSize + padY * 2;
    const centerX = Math.max(width/2 + 6, Math.min(canvas.width-width/2-6, canvas.width * pin.x / 100));
    const centerY = canvas.height * pin.y / 100;
    const candidates = [-48, 34, -82, 68, -116, 102].map(d => Math.max(height/2+5, Math.min(canvas.height-height/2-5, centerY+d*scale)));
    const y = candidates.find(y => used.every(b => Math.abs(centerX-b.x) > (width+b.w)/2+8 || Math.abs(y-b.y) > (height+b.h)/2+6)) ?? candidates[0];
    used.push({x:centerX,y,w:width,h:height});
    const left=centerX-width/2, top=y-height/2;
    ctx.beginPath();ctx.roundRect(left,top,width,height,Math.max(5,7*scale));
    ctx.fillStyle='rgba(246,229,185,0.96)';ctx.fill();
    ctx.lineWidth=Math.max(1.5,2*scale);ctx.strokeStyle='#5b4730';ctx.stroke();
    ctx.fillStyle='#292018';ctx.fillText(label,centerX,y,Math.max(20,width-padX));
  }
  return canvas.toDataURL('image/png');
}

// A game starts in its main story's city when that place is on the map; otherwise at the configured start.
export const getStartingLocation = (g: Game) => {
  const maps = g.maps || [];
  for (const place of mainPrologue(g.wizardMain)?.startPlaces || []) {
    for (const m of maps) { const p = m.pins.find(x => x.name === place && x.kind !== 'event' && x.kind !== 'exit'); if (p) return { mapId: m.id, pinId: p.id }; }
  }
  const map = maps.find(m => m.id === g.startMapId) || maps[0];
  const pin = map?.pins.find(p => p.id === g.startPinId)
    || map?.pins.find(p => p.kind === 'start')
    || map?.pins[0];
  return { mapId: map?.id, pinId: pin?.id };
};
// Map coordinates are percentages. Travel duration is deliberately approximate, not real-world kilometers.
export const travelSteps = (map: BoardMap | undefined, from?: string, to?: string): number => {
  const a = map?.pins.find(p=>p.id===from), b=map?.pins.find(p=>p.id===to);
  if (!a || !b || a.id===b.id) return 0;
  const distance = Math.hypot(a.x-b.x,a.y-b.y);
  return distance <= 16 ? 0 : distance <= 38 ? 1 : distance <= 65 ? 2 : 3;
};
export const nearbyPins = (map: BoardMap | undefined, pinId?: string): MapPin[] => {
  const current=map?.pins.find(p=>p.id===pinId);
  return current ? (map?.pins||[]).filter(p=>p.id!==pinId && p.kind!=='event' && p.kind!=='exit')
    .sort((a,b)=>Math.hypot(a.x-current.x,a.y-current.y)-Math.hypot(b.x-current.x,b.y-current.y)) : [];
};
// An action that heads somewhere ("이끼골로 가서 …"); the place it names is matched against the map.
// Choosing to fight a creature the scene just described starts that fight, even when the GM forgot to send the ambush.
// The game's own requests that wrap up a fight, a flight or a talk: not a move of the player's.
export const AFTERMATH = /^전투 결과:|에게서 간신히 도망쳤다\.|의 대화가 방금 끝났다\./;
// 지하: "지하로 내려가" in 변경백 성채 went to 옛 왕조 지하 묘지; the full name still travels there.
export const GENERIC_PLACE = /^(입구|광장|거리|마을|도시|근처|안쪽|바깥|가장자리|지하)$/;
// Places next to each other (user, 2026-11-12: a far place is reached through the near ones, like a real journey): the map's
// own links when it has any, else each place's NEAR_PINS nearest; separate groups are joined at their closest pair.
const NEAR_PINS = 3;
// Roads of the built-in maps by place name (key: the map's image), used when the map has no links of its own; nearness alone
// left 그림우드 (북문 밖) off 레븐홀트's list and put the island 해신의 섬 next to it. The island is reached by ship from 사레타.
const DEFAULT_MAP_LINKS: Record<string, [string, string][]> = {
  '/api/default-map/fantasy/0': [
    ['레븐홀트', '그림우드'], ['레븐홀트', '회색 탑 폐허'], ['레븐홀트', '변경백가 영지'], ['레븐홀트', '철망치 씨족 본거지'], ['레븐홀트', '아스테라'],
    ['그림우드', '회색 탑 폐허'], ['회색 탑 폐허', '변경백가 영지'], ['그림우드', '옛 왕조 지하 묘지'],
    ['아스테라', '마탑 본부'], ['아스테라', '태양교단 총본산'], ['아스테라', '금지된 상회 본거지'], ['아스테라', '그림자 숲의 거점'], ['마탑 본부', '금지된 상회 본거지'],
    ['태양교단 총본산', '옛 왕조 지하 묘지'], ['옛 왕조 지하 묘지', '심연의 사도 성역'], ['태양교단 총본산', '심연의 사도 성역'],
    ['사레타', '그림자 숲의 거점'], ['사레타', '금지된 상회 본거지'], ['사레타', '검은 문 관리지'], ['사레타', '산호 동굴 해안'], ['검은 문 관리지', '금지된 상회 본거지'],
    ['사레타', '해신의 섬'], ['산호 동굴 해안', '가라앉은 등대'],
    ['그림자 숲의 거점', '은엽 숲'], ['은엽 숲', '철망치 씨족 본거지'], ['은엽 숲', '산호 동굴 해안'],
  ],
};
export const mapNeighbors = (map: BoardMap): Map<string, Set<string>> => {
  const pins = map.pins.filter(p => p.kind !== 'event'), out = new Map(pins.map(p => [p.id, new Set<string>()]));
  const link = (a: string, b: string) => { if (a !== b && out.has(a) && out.has(b)) { out.get(a)!.add(b); out.get(b)!.add(a); } };
  const dist = (a: MapPin, b: MapPin) => Math.hypot(a.x - b.x, a.y - b.y);
  const roads = DEFAULT_MAP_LINKS[map.image], idOf = (name: string) => pins.find(p => p.name.trim() === name)?.id || '';
  if (map.links?.length) map.links.forEach(l => link(l.from, l.to));
  else if (roads) roads.forEach(([a, b]) => link(idOf(a), idOf(b)));
  else for (const p of pins) pins.filter(q => q.id !== p.id).sort((a, b) => dist(p, a) - dist(p, b)).slice(0, NEAR_PINS).forEach(q => link(p.id, q.id));
  for (;;) {
    const seen = new Set<string>(), stack = pins.length ? [pins[0].id] : [];
    while (stack.length) { const id = stack.pop()!; if (!seen.has(id)) { seen.add(id); stack.push(...out.get(id)!); } }
    const rest = pins.filter(p => !seen.has(p.id));
    if (!rest.length) break;
    let best: [MapPin, MapPin] = [pins.find(p => seen.has(p.id))!, rest[0]];
    for (const a of pins.filter(p => seen.has(p.id))) for (const b of rest) if (dist(a, b) < dist(best[0], best[1])) best = [a, b];
    link(best[0].id, best[1].id);
  }
  return out;
};
export const reachablePins = (map: BoardMap, here: MapPin): MapPin[] => { const near = mapNeighbors(map).get(here.id); return map.pins.filter(p => near?.has(p.id)); };
// The places passed on the way to a place, the place itself last, in the fewest steps; an exit (to another map) is only
// ever the destination. Empty when it is here or can't be reached.
export const mapRoute = (map: BoardMap, from: MapPin, toId: string): MapPin[] => {
  const near = mapNeighbors(map), back = new Map<string, string>([[from.id, '']]), queue = [from.id];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === toId) break;
    if (id !== from.id && map.pins.find(p => p.id === id)?.kind === 'exit') continue;
    for (const n of near.get(id) || []) if (!back.has(n)) { back.set(n, id); queue.push(n); }
  }
  if (toId === from.id || !back.has(toId)) return [];
  const path: MapPin[] = [];
  for (let id = toId; id !== from.id; id = back.get(id)!) path.unshift(map.pins.find(p => p.id === id)!);
  return path;
};
export const d = (sides: number) => 1 + Math.floor(Math.random() * Math.max(1, sides));
export const signed = (n: number) => n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`;
// Resource-like stats (mana, inner energy) are pools, not ability scores, so they never become modifiers.
export const abilityMod = (g: Game, s: Session, pattern: RegExp) => {
  const fields = (g.characterConfig || defaultCharacterConfig()).fields.filter(f => f.kind === 'number' && !/마나|내공|기력|mp/i.test(f.name + f.id));
  const field = fields.find(f => pattern.test(f.name) || pattern.test(f.id)) || fields[0];
  const score = Number(s.characterValues?.[field?.id ?? ''] ?? field?.initial ?? 10);
  return Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
};
export const clampInt = (v: unknown, min: number, max: number, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback; };
// The GM sizes up the opponent once; missing or out-of-range numbers fall back to an average foe.
// With a tier, the numbers always come from the level curve (enemyStats), so older saves' cached numbers and the
// GM's guesses don't matter; only an enemy given without a tier uses its own numbers.
export const startCombat = (c: CombatState, enemy?: { hp?: unknown; dc?: unknown; damage?: unknown; power?: unknown } | null): CombatState => {
  const tiered = Number.isInteger(Number(enemy?.power)) && Number(enemy?.power) >= 1;
  // A monster met at a level above its tier (see encounterLevel) fights, wears gear and drops loot as that level's tier.
  const power = c.level ? tierOfLevel(c.level) : clampInt(enemy?.power ?? c.power, 1, MAX_POWER, 3);
  const base = enemyStats(c.level ?? levelForTier(power), !!c.boss);
  const hp = tiered ? base.hp : clampInt(enemy?.hp, 10, 50000, base.hp);
  // Enemies wear gear that fits their strength, so they are tougher by the same weapon and armor bonus a player would get.
  const worn = enemyGear(power);
  const skill = enemySkill(c.npc, power);
  return { ...c, power, enemySkill: skill, enemyShield: skill?.id === 'guard' ? skill.value : 0, enemyHp: Math.max(1, Math.round((hp + worn.hp) * (1 - (c.openCut || 0)))), enemyMaxHp: hp + worn.hp, enemyDc: (tiered ? base.dc : clampInt(enemy?.dc, 6, 80, base.dc)) + worn.dc, enemyAtk: base.atk, enemyDamage: (tiered ? base.damage : clampInt(enemy?.damage, 2, 3000, base.damage)) + worn.damage, round: 1, itemUse: undefined };
};
// A monster or hostile NPC blocking the way: the player chooses to fight or to run (no talking).
// told: the scene already showed this foe attacking (the writer put it there), so the fight starts without another scene.
export type Threat = { npc: string; monster: boolean; level?: number; lead?: string; told?: boolean; fleeTo?: { mapId: string; pinId: string } };
// A threat met on a move: the arrival scene is written first, then applyReply turns it into session.threat.
// Test commands: a named foe ("고블린") wins; otherwise a generic request ("몬스터 인카운트") rolls a local encounter.
export const debugFoe = (g: Game, s: Session, command: string): Foe | undefined => {
  const genre = defaultMapGenre(g);
  const named = foesOf(genre).find(f => command.includes(f.name)) || foesOf(genre).find(f => f.name.split(' ').some(w => w.length >= 2 && !/무리|떼|패거리|우두머리|전사|병사/.test(w) && command.includes(w)));
  if (named) return named;
  if (!/몬스터|마물|괴물|습격|인카운트|적대|적 등장|매복/.test(command)) return undefined;
  const pin = (g.maps || []).find(m => m.id === s.mapId)?.pins.find(p => p.id === s.pinId);
  return pickEncounter(genre, `${pin?.name || ''} ${pin?.description || ''}`, s.level || 1, Math.random, s.recentFoes);
};
// At or below this an NPC attacks on sight instead of talking.
export const HOSTILE_AFFECTION = -60;
// What someone is to the hero is the game's, from what it knows (user 2026-11-20): 에드리아 gave three jobs, stood at +30 and
// was still 초면, because only the bookkeeper's rare relation field ever changed it. Anyone met before is at least 지인;
// a companion is 동료, goodwill 40+ is 친구, a hostile one 적대. Genres with their own relation words keep the bookkeeper's.
export const relationOf = (g: Game, party: string[], r: Relationship) => {
  const types = relationshipTypes(g), has = (t: string) => types.includes(t);
  if (!has('지인')) return r.relation;
  if (r.affection <= HOSTILE_AFFECTION / 2 && has('적대')) return '적대';
  if (party.includes(r.name) && has('동료')) return '동료';
  if (r.affection >= 40 && has('친구')) return '친구';
  return r.relation === '라이벌' || r.relation === '동맹' ? r.relation : '지인';
};
// People who take a fight as a test of strength: picking one with them doesn't make them enemies, and beating them
// raises their opinion of the player (RESPECT_WIN) instead of lowering it. Names are the built-in cast's.
export const RESPECTS_STRENGTH = ['에드리아 하르트', '브리아', '우르술라', '남궁세린', '팽소연', '홍랑'];
export const RESPECT_WIN = 15;
export const respectsStrength = (name: string) => RESPECTS_STRENGTH.includes(name.trim());
export const CLASH_GAP = 8;
// Max HP grows with level on top of the game's base HP.
// The mana pool: the sheet's 마나 value (fantasy) grows 2 a level, plus what robes add; 0 when the sheet has no mana.
// A fighter-only start (the knight) has no mana at all, so no 투지 or 필살기 either (user 2026-11-23).
export const manaless = (g: Game) => START_PROFILES[g.wizardStart || '']?.path === 'fighter';
export const maxManaOf = (g: Game, s: Session) => { const field = (g.characterConfig || defaultCharacterConfig()).fields.find(f => f.id === 'mana'); if (!field || manaless(g)) return 0; const base = Number(s.characterValues?.mana ?? field.initial) || 0; return base + 2 * ((s.level || 1) - 1) + gearOf(s.equipped, s.itemInfo).mana; };
export const maxHpOf = (g: Game, s: Session) => g.hp + levelBonus(s.level || 1).hp + gearOf(s.equipped, s.itemInfo).hp;
// HP after gear changes the maximum: at full health the hero stays full (reward gear worn right after a level-up
// left HP short of the new maximum, and calm-turn recovery then told of wounds healing that never were); otherwise
// HP stays as it was, never above the new maximum (no healing by taking gear off and on).
export const refitHp = (g: Game, before: Session, after: Session) => { const was = maxHpOf(g, before), now = maxHpOf(g, after); return before.hp >= was ? now : Math.min(before.hp, now); };
export const npcLevel = (s: Session, name: string): number | undefined => s.companions?.[name]?.level ?? (s.npcPower?.[name] ? levelForTier(s.npcPower[name]) : undefined);
// Use-based growth: what the player keeps doing builds up "training" on the matching stat,
// and each level-up spends GROWTH_POINTS weighted by it. Pools (mana, 내공) grow in bigger steps.
export const GROWTH_POINTS = 3;
export const growthFields = (g: Game) => (g.characterConfig || defaultCharacterConfig()).fields.filter(f => f.kind === 'number' && !/체온|단서|temperature|clue/i.test(f.id + f.name));
export const statLike = (g: Game, re: RegExp) => growthFields(g).find(f => re.test(f.name) || re.test(f.id))?.id;
export const STRENGTH = /근력|힘|외공|str/i, AGILITY = /민첩|경공|agi|dex/i, CHARM = /매력|화술|카리스마|cha/i, MIND = /지능|오성|통찰|관찰|추리|insight|int|logic/i;
export const train = (s: Session, ids: (string | undefined)[], amount = 1): Session => {
  const t = { ...(s.training || {}) };
  for (const id of ids) if (id) t[id] = (t[id] || 0) + amount;
  return { ...s, training: t };
};
// Each level-up places GROWTH_POINTS by who the hero started as (user 2026-11-20): the fighting stat (근력, or 지능 for the
// runaway mage) takes 2.5 a level and 민첩 0.5; the new adventurer, who may go either way, puts one in each of 근력, 지능, 민첩.
// The fighter's pace is the pace foes are built for (progression.ts expectedMods). Left to the player,
// 21 points sat unspent and a Lv.8 knight with Lv.1 근력 died to a Lv.8 skeleton; use-based growth before that put 7 levels
// into 지능 for a sword fighter.
export const growStats = (g: Game, s: Session, levels: number): { session: Session; note: string } => {
  const fields = growthFields(g);
  if (levels <= 0 || !fields.length) return { session: s, note: '' };
  const path = heroPath(g, s), str = statLike(g, STRENGTH), mind = statLike(g, MIND), agi = statLike(g, AGILITY);
  const main = (path === 'caster' ? mind : str) || fields[0].id;
  // Odd levels: 3 to the fighting stat; even: 2 and 1 to 민첩. Points an older save left unplaced go the same way.
  const even = [str || main, mind || main, agi || main], to = s.level || 1;
  const plan: string[] = Array.from({ length: s.statPoints || 0 }, (_, i) => path === 'both' ? even[i % 3] : main);
  for (let l = to - levels + 1; l <= to; l++) plan.push(...(path === 'both' ? even : [main, main, l % 2 || !agi ? main : agi]));
  let next: Session = { ...s, statPoints: plan.length };
  for (const id of plan) next = spendStat(g, next, id);
  const gained = fields.map(f => [f.name, (Number(next.characterValues?.[f.id] ?? f.initial) || 0) - (Number(s.characterValues?.[f.id] ?? f.initial) || 0)] as const).filter(([, n]) => n > 0);
  return { session: { ...next, statPoints: undefined }, note: `능력치 성장 — ${gained.map(([n, v]) => `${n} +${v}`).join(' · ')}` };
};
// One point into a stat: +1, or a pool's bigger step (마나 30 → +3).
export const spendStat = (g: Game, s: Session, id: string): Session => {
  const field = growthFields(g).find(f => f.id === id);
  if (!field || !(s.statPoints && s.statPoints > 0)) return s;
  const base = Number(field.initial) || 10, step = base >= 30 ? Math.max(1, Math.round(base / 10)) : 1;
  return { ...s, statPoints: s.statPoints - 1, characterValues: { ...(s.characterValues || {}), [id]: String((Number(s.characterValues?.[id] ?? field.initial) || 0) + step) } };
};
// Quests pay experience that keeps pace with the player's level.
// A level-up refills health and mana completely (stats grown by it included).
export const levelUpRestore = (g: Game, s: Session): Partial<Session> => { const mana = maxManaOf(g, s); return { hp: maxHpOf(g, s), ...(mana > 0 ? { mana } : {}) }; };
export const withXp = (g: Game, s: Session, amount: number, reason: string): { session: Session; levelsGained: number } => {
  if (amount <= 0) return { session: s, levelsGained: 0 };
  const before = s.level || 1;
  const next = gainXp(before, s.xp || 0, amount);
  const grown: Session = { ...s, level: next.level, xp: next.xp };
  const hpGain = maxHpOf(g, grown) - maxHpOf(g, s);
  const companions = { ...(s.companions || {}) }, allyUps: string[] = [];
  // Someone along for one job only (tempParty) doesn't grow with the hero (user 2026-11-26).
  for (const ally of (s.party || []).filter(a => !s.tempParty?.[a])) {
    const was = companions[ally] || { level: npcLevel(s, ally) || 3, xp: 0 };
    const up = gainXp(was.level, was.xp, amount);
    companions[ally] = { level: up.level, xp: up.xp };
    if (up.levelsGained) allyUps.push(`시스템: 동료 ${ally} 레벨 업! Lv.${was.level} → Lv.${up.level}`);
  }
  const growth = growStats(g, grown, next.levelsGained);
  return { levelsGained: next.levelsGained, session: { ...growth.session, companions, ...(next.levelsGained ? levelUpRestore(g, growth.session) : { hp: Math.min(maxHpOf(g, grown), s.hp + hpGain) }), log: [...s.log, `시스템: 경험치 +${amount.toLocaleString('ko-KR')} (${reason})`, ...(next.levelsGained ? [`시스템: 레벨 업! Lv.${before} → Lv.${next.level} · 최대 HP ${maxHpOf(g, s)} → ${maxHpOf(g, grown)} · HP${maxManaOf(g, growth.session) > 0 ? '·마나' : ''} 모두 회복`, ...(growth.note ? [`시스템: ${growth.note}`] : [])] : []), ...allyUps] } };
};
// The line that wraps up a talk when the player says it (closeTalk).
export const TALK_ACCEPT = '알겠습니다. 그렇게 하겠습니다.';
// Reward gear is graded from what foes of the player's level wear (rollGrade adds the source's step on top).
export const rewardBase = (level: number) => gradeForTier(tierOfLevel(level));
// Regional stories (app/_lib/regional-quests.ts): what each place has going on, material for the director and the writer.
// A story opens by itself in its region when a quest slot is free; a full log means no new story shows up.
export const RANK_FLOORS = [0, 100, 500, 2000, 5000, 15000];
export const ALL_REGION_QUESTS = REGION_QUESTS;
export const regionQuestsOf = (g: Game) => ALL_REGION_QUESTS.filter(r => r.genre === defaultMapGenre(g));
// Where each story person is, decided in one place (2026-11-23): their home spot (PLACE_NPCS, the first spot inside a city listed
// for them), or, while a talk with them is the next step of an open goal, that step's place (바레나 on 해신의 섬 for that step only).
// Before, the writer was told the first place any story step named (한나 at 부러진 방패 여관, of a story not even begun) while the
// director and who-is-here read PLACE_NPCS (한나 at 성문 앞 장터): ten talk steps waited where their person never was.
const dueTalks = (g: Game, s: Session) => {
  const out: Record<string, string[]> = {};
  for (const q of questsOf(s)) { const beats = stepOf(g, q)?.beats || [], b = beats[beatsDone(beats, s.log, goalStart(s, q), s.delivered)]; if (b && 'with' in b && b.with && b.at?.length) for (const n of b.with) out[n] ||= b.at;
    if (b?.do === 'talk' && b.at?.length && !out[b.npc]) out[b.npc] = b.at; else if (b?.do === 'defeat' && b.at?.length && !findFoe(defaultMapGenre(g), b.foe) && !out[b.foe]) out[b.foe] = b.at; }
  return out;
};
const homeOf = (n: string) => { const homes = Object.entries(PLACE_NPCS).filter(([, people]) => people.includes(n)).map(([p]) => p); return homes.find(p => cityPlaces('fantasy').some(([c]) => c === p)) || homes[0]; };
export const npcWhereabouts = (g: Game, s: Session): Record<string, string> => {
  const due = dueTalks(g, s), out: Record<string, string> = {};
  for (const n of new Set(Object.values(PLACE_NPCS).flat())) out[n] = due[n]?.[0] || homeOf(n);
  for (const [n, at] of Object.entries(due)) out[n] ||= at[0];
  return out;
};
export const regionWhere = (g: Game, s: Session) => { const map = (g.maps || []).find(m => m.id === s.mapId); const pin = map?.pins.find(p => p.id === s.pinId); return `${map?.name || ''} ${pin?.name || ''} ${s.scenePlace || ''}`; };
export const inRegion = (r: RegionQuest, where: string) => r.region.some(w => where.includes(w));
// Story chapters open: the further of the main story's finished chapters (main steps marked act, done) and one per quarter of
// progress made anywhere (user 2026-11-20: a hero off the main path still moves the world's story; at 100% by side stories the
// writer saw only chapter 1 when the final boss came). Read, never stored: a stored act stayed at 1 while the goals were in
// chapter 2, and 바레나 never came (2026-11-20).
export const chaptersOpen = (g: Game, s: Session) => Math.max(
  (mainChain(g) || []).filter(st => st.act && questsDone(s).some(d => alikeQuest(st.q, d))).length,
  Math.floor((storyProgress(g, s)?.percent || 0) / 25));
// The story as far as it has gone, for the GM: finished acts in full, the current act by its name only (what to do now
// comes from the quest beats), later acts not at all, and the progress goal up to the current act. With the whole
// outline in view the GM pulled the next quest into the scene (taking the player to 회색 탑 while the report to
// Edria at 북문 초소 was still due).
export const promptUpToAct = (prompt: string, done: number) => prompt.split('\n').flatMap(line => {
  const act = line.match(/^(\s*-\s*)(\d)막\s+([^:：]+)[:：]/);
  if (act) { const n = Number(act[2]); return n <= done ? [line] : n === done + 1 ? [`${act[1]}${n}막 ${act[3].trim()}: 진행 중.`] : []; }
  if (/^\s*최종 목표\(진행도형\)[:：]/.test(line)) return [line.split('→').slice(0, done + 1).join('→').trim()];
  return [line];
}).join('\n');
export const playerActs = (s: Session) => s.log.filter(e => e.startsWith('플레이어:')).length;
// People's own prepared stories (넬 → 넬의 마지막 사냥) for those the player has met: the director names one as a goal instead
// of improvising a hunt with no answer (11 actions chasing boars and hedgehogs for 넬's monster, 2026-11-17). Rank doesn't
// gate them here: once the story has started in play, it runs on its prepared steps.
export const personalStories = (g: Game, s: Session): string[] => {
  const met = (s.relationships || []).map(r => r.name), done = questsDone(s);
  return regionQuestsOf(g).filter(r => r.kind === 'story' && met.includes(r.giver) && !done.includes(r.title)).map(r => `${r.giver} — ${r.title}: ${r.hook}`);
};
// A goal someone only offered joins the list without taking over (user, 2026-11-17): the current goal holds until the player accepts
// (endTalk) — or, if it just ended, the latest older one; with nothing older, the offer is all there is.
// A main step just added is the current goal: held on the older 성채 냉실 instead, the hero stood at 회색 탑 steered by another place's goal.
// The step after the one just finished comes next (a region story's next step lost to an older 입단 시험, so its foe never came).
export const focusAfter = (g: Game, before: string, quests: string[], added: string[]) => added.find(q => (mainChain(g) || []).some(st => alikeQuest(st.q, q))) || (() => { const nx = !quests.includes(before) && nextStepOf(g, before); return nx ? added.find(q => alikeQuest(nx.q, q)) : undefined; })() || heldGoal(before, quests, added);
export const heldGoal = (before: string, quests: string[], added: string[]) => { const old = quests.filter(q => !added.includes(q)); return old.includes(before) ? before : old.at(-1) || added.at(-1) || ''; };
const questsDone = (s: Session) => s.log.flatMap(l => l.match(/^시스템: 목표 완료 — (.+?)(?: (의뢰인 .+))?$/)?.[1] || []);
// The open quest that is one of this person's prepared stories (its title or a step). A job the same person offers while it is open
// joins that story instead of becoming a goal of its own: 넬's improvised "세 갈래 발자국의 주인 추적" took the focus from
// 넬의 마지막 사냥, so the writer got none of its steps and spun clues with no answer for six turns.
export const ownStoryOpen = (g: Game, quests: string[], giver: string) => giver ? quests.find(q => regionQuestsOf(g).some(r => r.kind === 'story' && r.giver === giver && (alikeQuest(r.title, q) || r.steps.some(x => alikeQuest(x.q, q))))) : undefined;
// Every goal is a prepared story (user 2026-11-17: a story with no goal is a design miss). An improvised errand had no
// ending, so the scenes spun clues around it (넬's "화살의 주인", 4 scenes of "놓쳤어"). An offered job becomes, in order:
// the prepared title it names; the next main step when the giver hands it (who closed the last step or opens this one, as
// 에드리아 does 장물 단속); the giver's own story or job not yet taken (rank aside for stories); else no goal at all.
// The last main step done (-1 before any).
const mainAt = (chain: { q: string }[], done: string[]) => chain.map(st => done.some(d => alikeQuest(st.q, d))).lastIndexOf(true);
// No scene runs without a goal (user 2026-11-17): when the list empties, the next main step not given up becomes the goal,
// as the main's first step is from the opening.
// A finished region-story step hands on to that story's next step, so the story goes on as its own goals.
export const withNextMain = <T extends { quests: string[]; added: string[]; done: string[] }>(g: Game, s: Session, log0: T): T => {
  const done = [...questsDone(s), ...log0.done], dropped = s.log.flatMap(l => l.match(/^시스템: 목표 포기 — (.+)$/)?.[1] || []);
  const after = log0.done.flatMap(d => { const r = regionQuestsOf(g).find(r => r.steps.some(st => alikeQuest(st.q, d))), n = r?.steps[r.steps.findIndex(st => alikeQuest(st.q, d)) + 1]?.q; return n && ![...log0.quests, ...done].some(q => alikeQuest(q, n)) ? [n] : []; });
  const log = after.length ? { ...log0, quests: [...log0.quests, ...after], added: [...log0.added, ...after] } : log0;
  // A main step done hands on to the next one even with other goals open: 장물 단속 done beside 브리아's wolf job left the
  // hero at 회색 탑 with only the wolves as a goal, and the writer circled for ~15 turns.
  // One main step is always open (unless given up): with none, the hero only had side jobs to steer by.
  const chain = mainChain(g) || [];
  if (log.quests.some(q => chain.some(st => alikeQuest(st.q, q)))) return log;
  // The last step is the boss fight: the finale goal (withStory) stands in for it once the rest is done.
  const next = chain.slice(mainAt(chain, done) + 1, -1).find(st => !dropped.some(d => alikeQuest(st.q, d)))?.q;
  return next && !log.quests.some(q => alikeQuest(q, next)) ? { ...log, quests: [...log.quests, next], added: [...log.added, next] } : log;
};
// doneNow: goals this same turn closes (the exam closed in the talk that handed out 장물 단속, and was read as still running).
// A goal is always a step's wording ("성채 지하 냉실 문 열기"), never a story's title ("성채 지하 냉실").
const goalsFree = (g: Game, s: Session, doneNow: string[]) => {
  const open = questsOf(s).filter(q => !doneNow.includes(q)), done = [...questsDone(s), ...doneNow];
  // A job whose beats the log already shows is over: 브리아's wolf job came after the wolves fell in the exam and could never clear.
  const over = (q: string) => { const beats = stepOf(g, q)?.beats || []; return beats.length > 0 && beatsDone(beats, s.log, 0, s.delivered) >= beats.length; };
  const free = (q: string) => !open.some(o => alikeQuest(o, q)) && !done.some(d => alikeQuest(d, q)) && !over(q);
  // A region story's goal: its first step not done yet, while none of its steps is running.
  const firstStep = (r: ReturnType<typeof regionQuestsOf>[number]) => [r.title, ...r.steps.map(st => st.q)].some(q => open.some(o => alikeQuest(o, q))) ? '' : r.steps.find(st => free(st.q))?.q || '';
  return { open, done, free, firstStep };
};
export const preparedGoal = (g: Game, s: Session, text: string, giver: string, doneNow: string[] = []): string => {
  const { open, done, free, firstStep } = goalsFree(g, s, doneNow), chain = mainChain(g) || [];
  const mainNamed = chain.slice(0, -1).find(st => alikeQuest(st.q, text))?.q, regionNamed = regionQuestsOf(g).find(r => alikeQuest(r.title, text) || r.steps.some(st => alikeQuest(st.q, text)));
  // A later main step named while an earlier one is still open waits its turn.
  if (mainNamed) return free(mainNamed) && !open.some(o => chain.some(st => alikeQuest(st.q, o))) ? mainNamed : '';
  if (regionNamed || !giver) return regionNamed ? firstStep(regionNamed) : '';
  const at = mainAt(chain, done), next = at + 1 < chain.length - 1 ? chain[at + 1] : undefined;
  const talkers = (beats: Beat[] = []) => beats.flatMap(b => b.do === 'talk' ? [b.npc] : []);
  if (next && free(next.q) && [talkers(next.beats)[0], talkers(chain[at]?.beats).at(-1)].includes(giver)) return next.q;
  return ownStoryStep(g, s, giver, doneNow);
};
// The step of this person's own story (or open job) that her offer starts: its first step not done, while none of it runs.
export const ownStoryStep = (g: Game, s: Session, giver: string, doneNow: string[] = []): string => {
  const { open, firstStep } = goalsFree(g, s, doneNow), chain = mainChain(g) || [];
  const talkers = (beats: Beat[] = []) => beats.flatMap(b => b.do === 'talk' ? [b.npc] : []);
  // A main-story person speaks for the main story while a step of it is open: 에드리아's "clear 회색 탑" (a later step) fell
  // through to her own 성채 냉실 twice. Her own story comes when the director names it.
  if (chain.some(st => talkers(st.beats).includes(giver)) && open.some(o => chain.some(st => alikeQuest(st.q, o)))) return '';
  const own = regionQuestsOf(g).filter(r => r.giver === giver && firstStep(r) && (r.kind === 'story' || regionOpen(g, s, r)));
  const pick = own.find(r => r.kind === 'story') || own[0];
  return pick ? firstStep(pick) : '';
};
export const regionOpen = (g: Game, s: Session, r: RegionQuest) => Math.max(0, s.reputation || 0) >= RANK_FLOORS[r.minRank || 0] && chaptersOpen(g, s) >= (r.minAct || 0);
// Everyone is where they live from the start: holding later-chapter people back (by a stored act) kept 바레나 off 7번 부두 while
// the goal was to meet her, 34 turns (2026-11-20). Secrets stay hidden by the story text (promptUpToAct), not by absence.
export const regionFree = (g: Game, s: Session) => (r: RegionQuest) => regionOpen(g, s, r);
// One automatic exchange: the player strikes, then the foe answers if still standing.
// Player damage scales with the foe's size so an ordinary fight resolves in about ten exchanges.
// How long the check die tumbles on screen before it lands.
export const DICE_ROLL_MS = 1200;
export const AUTO_BATTLE_LIMIT = 40;
// Magic (a staff makes a caster): the cast gauge fills 100% a round plus the gear's cast speed, and a spell fires at
// SPELL_GAUGE, paying SPELL_COST mana. Spells aim at the foe's magic resistance (MAGIC_RESIST of its DC), and swing
// widely around twice a weapon hit, scaled from ×0.7 at Lv.1 to ×1.2 at Lv.100: weaker than a fighter early, stronger
// late (balance: scratchpad magesim.mjs). Mana comes back MANA_REGEN_ROUND a round in a fight, MANA_REGEN_TURN a turn
// outside one.
export const SPELL_GAUGE = 200, SPELL_COST = 15, MAGIC_RESIST = 0.75, MANA_REGEN_ROUND = 0.03, MANA_REGEN_TURN = 0.1;
// 투지 (user 2026-11-20: the knight never used mana): a fighter's mana (no staff) doesn't come back by itself; it fills by
// fighting, GRIT_HIT of the maximum per blow landed and GRIT_TAKEN per blow taken, and kept between fights. Full, the next
// blow is a 필살기: a sure hit for GRIT_FINISH times a weapon blow, emptying it. At 0.15/0.2 a fight (3-4 rounds) never
// filled it (0 finishers in 300 fights at Lv.5-10); at these it comes about once a fight.
// A run of blows landed (or taken) in a row fills it faster, GRIT_RUN more per blow in the run (user 2026-11-20: "연속으로
//맞거나 때리면 더 많이"); a miss or a dodge breaks the run.
export const GRIT_HIT = 0.3, GRIT_TAKEN = 0.35, GRIT_FINISH = 3, GRIT_RUN = 0.5;
// The finisher's name, shouted as it lands: the hero's own start, else a plain one.
const FINISHERS: Record<string, string> = { '신입 모험가': '철급 혼신격', '바다 건너온 용병': '파도 가르기' };
export const finisherOf = (g: Game) => FINISHERS[g.wizardStart || ''] || '혼신의 일격';
export const gritOf = (g: Game, s: Session) => maxManaOf(g, s) > 0 && !gearOf(s.equipped, s.itemInfo).caster;
// Mana now. Unset is full for a caster but empty for 투지, which is earned in a fight: unset-as-full gave every first
// fight (and every fight the odds simulated) a 필살기 in round 1, and a foe 3× the player's 전투력 read as a coin flip.
export const manaNow = (g: Game, s: Session) => { const max = maxManaOf(g, s); return Math.min(max, s.mana ?? (gritOf(g, s) ? 0 : max)); };
// Health comes back on its own too: HP_REGEN_TURN of the maximum each calm turn (not in a fight, nothing hurt the
// player this turn), so the player never has to go and rest just to heal.
export const HP_REGEN_TURN = 0.06;
// Why the player feels better, by where the calm turn was spent; cycled by how many HP notes the log already has, so
// back-to-back notes never repeat. Lines must fit anywhere in their group (a crypt is 'wild' too, so no streams).
export const REST_REASONS: Record<'talk' | 'town' | 'wild', string[]> = {
  talk: ['이야기를 나누는 사이 거칠던 숨이 가라앉아 몸이 조금 가벼워졌습니다', '말을 주고받으며 굳었던 어깨의 긴장이 풀렸습니다', '앉아서 이야기를 듣는 동안 다리에 다시 힘이 돌아왔습니다'],
  town: ['따뜻한 국물 한 모금에 기운이 조금 돌아왔습니다', '사람들 틈에서 걸음을 늦추자 쑤시던 상처가 조금 가라앉았습니다', '찬물로 얼굴을 씻자 정신이 맑아졌습니다'],
  wild: ['벽이나 나무에 등을 기대어 잠시 숨을 고르자 몸이 조금 가벼워졌습니다', '상처를 천으로 단단히 동여매자 피가 멎었습니다', '걸음을 늦추고 호흡을 가다듬자 욱신거림이 잦아들었습니다', '물통의 물로 목을 축이자 기운이 조금 돌아왔습니다'],
};
export const restReason = (where: 'talk' | 'town' | 'wild', turn: number) => { const list = REST_REASONS[where]; return list[turn % list.length]; };
export const spellScale = (level: number) => 0.7 + 0.5 * (Math.min(100, Math.max(1, level)) - 1) / 99;
// The player's combat numbers, shared by the battle and the character panel so what is shown is what is used.
// Weapon blows go with strength, spells with intelligence; equipped items add to hit, damage and dodge.
export const combatStatsOf = (g: Game, s: Session) => {
  const strength = abilityMod(g, s, /근력|힘|외공|str|external/i), agility = abilityMod(g, s, /민첩|경공|agi|dex/i), intellect = abilityMod(g, s, /지능|intelligence/i);
  const grow = levelBonus(s.level || 1), gear = gearOf(s.equipped, s.itemInfo);
  // Crits: a natural 19–20 (10%), widened by agility (one more face per 3 points of agility modifier) and by the
  // 예리 ability of gear, never below 15 (30%).
  const critFrom = Math.max(15, Math.min(19 - Math.floor(Math.max(0, agility) / 3), ...gear.skills.filter(k => k.id === 'keen').map(k => k.value)));
  const spellBase = (4.5 + Math.max(0, intellect) + grow.damage + gear.spell) * 2 * spellScale(s.level || 1);
  return { strength, agility, intellect, grow, gear, critFrom, maxHp: maxHpOf(g, s), maxMana: maxManaOf(g, s),
    hit: strength + grow.hit + gear.hit, blow: [1, 8].map(d => d + Math.max(0, strength) + grow.damage + gear.damage) as [number, number],
    spellHit: intellect + grow.hit + gear.hit, spell: [0.4, 1.6].map(k => Math.round(spellBase * k)) as [number, number],
    dodge: 12 + Math.max(0, agility) + grow.dodge + gear.dodge };
};
// 전투력 = √(damage a round × health). Who falls first in a duel is whoever's health runs out in fewer of the other's rounds,
// so two fighters' 전투력, each counted against the other with the battle's own rules (autoBattleStep: every d20 face, crits,
// 연타, 출혈, companions, the spell rhythm), compare the way the fight goes. The old figure measured both against one fixed
// opponent (명중 5, 방어 15): at Lv.18 a foe's 방어 33 hit the 5% floor and read 2,370 against the hero's 1,109 in a fight
// the hero won 84% of the time (2026-11-20).
// shortcut: leaves out 독, 재생, 흡혈, 가시, 기절, 가드 and running out of mana; the numbers before a fight (fightOdds) are measured in play instead.
const faces = (dealt: (die: number) => number) => { let e = 0; for (let die = 1; die <= 20; die++) e += dealt(die); return e / 20; };
const heroRound = (g: Game, s: Session, c: CombatState) => {
  const st = combatStatsOf(g, s), { gear, critFrom } = st, skill = (id: string) => gear.skills.filter(k => k.id === id).reduce((n, k) => n + k.value, 0);
  const swing = (aim: number, target: number, dmg: number) => faces(die => die >= critFrom ? 2 * dmg : die !== 1 && die + aim >= target ? dmg : 0);
  const landed = (aim: number, target: number) => faces(die => die >= critFrom || (die !== 1 && die + aim >= target) ? 1 : 0);
  const caster = gear.caster && st.maxMana > 0;
  const own = caster ? swing(st.spellHit, Math.round(c.enemyDc * MAGIC_RESIST), (st.spell[0] + st.spell[1]) / 2) * Math.min(1, (100 + gear.haste) / SPELL_GAUGE)
    : swing(st.hit, c.enemyDc, (st.blow[0] + st.blow[1]) / 2) * (1 + skill('double') / 100);
  // 투지: the 필살기 comes once the bar fills, a sure GRIT_FINISH-times blow; spread over the rounds it takes to fill.
  // shortcut: runs counted as an average 1.25×, the foe landing half its blows; simulate per foe if 전투력 drifts from the odds again.
  const fillRate = caster || !st.maxMana ? 0 : Math.min(1, 1.25 * (landed(st.hit, c.enemyDc) * GRIT_HIT + 0.5 * GRIT_TAKEN));
  const finisher = fillRate * GRIT_FINISH * (st.blow[0] + st.blow[1]) / 2;
  const bleed = caster ? 0 : skill('bleed') * Math.min(1, 3 * landed(st.hit, c.enemyDc));
  const allies = (s.party || []).filter(n => n !== c.npc).reduce((n, ally) => {
    const t = companionStats(npcLevel(s, ally) || 3), hit = 0.7 * (t.damage + 1) / 2 + 0.5;
    return n + faces(roll => roll === 20 ? 2 * hit : roll !== 1 && roll + (t.dc - 10) >= c.enemyDc - 2 ? hit : 0);
  }, 0);
  return own + finisher + bleed + allies;
};
const foeRound = (g: Game, s: Session, c: CombatState) => {
  const st = combatStatsOf(g, s), foe = c.enemySkill, crit = foe?.id === 'keen' ? foe.value : 20, acc = c.enemyAtk ?? c.enemyDc - 10, dmg = (c.enemyDamage + 1) / 2;
  return faces(die => die >= crit ? 2 * dmg : die !== 1 && die + acc >= st.dodge ? dmg : 0) * (1 + (foe?.id === 'double' ? foe.value / 100 : 0));
};
const power = (perRound: number, hp: number) => Math.round(10 * Math.sqrt(Math.max(0, perRound) * Math.max(1, hp)));
const heroPowerVs = (g: Game, s: Session, c: CombatState) => power(heroRound(g, s, c), maxHpOf(g, s));
// The hero's own 전투력 (status bar, gear choice): against the ordinary foe of the hero's level.
export const playerPower = (g: Game, s: Session) => { const lv = s.level || 1; return heroPowerVs(g, s, foeCombat({ npc: '', monster: true, level: lv }, tierOfLevel(lv), lv)); };
// Gear the hero carries that raises their 전투력 over what each slot holds now, put on (auto-play). One piece at a time,
// so the next pick is weighed against what was just worn.
export const bestGear = (g: Game, s: Session): Session => {
  let best = s, power = playerPower(g, s);
  const fits = heroFits(g, s);
  for (const item of new Set(s.inventory || [])) {
    const kind = infoOf(item, s.itemInfo).kind;
    if (kind === 'item' || best.equipped?.[kind] === item || !fits(item, kind)) continue;
    const next = { ...best, equipped: { ...(best.equipped || {}), [kind]: item } }, p = playerPower(g, next);
    if (p > power) { best = next; power = p; }
  }
  if (best === s) return s;
  // Said in the log: the swap was silent, and a scene's "철퇴를 든 당신" read as a mistake while the 롱소드 was off (2026-11-20).
  const swaps = Object.entries(best.equipped || {}).filter(([k, v]) => v && v !== s.equipped?.[k as keyof typeof s.equipped]).map(([k, v]) => { const was = s.equipped?.[k as keyof typeof s.equipped]; return was ? `${was} → ${v}` : String(v); });
  return { ...best, hp: refitHp(g, s, best), log: [...best.log, `시스템: 장비 교체 — ${swaps.join(', ')}`] };
};
// 1,000 and up reads in thousands-units: 1.2k, 34k, 5.6M.
export const formatPower = (n: number) => { const u = ['', 'k', 'M', 'B']; let i = 0; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; } return i ? `${n >= 100 ? Math.floor(n) : Math.floor(n * 10) / 10}${u[i]}` : String(Math.round(n)); };
// The foe as the fight would start it (startCombat), for its 전투력 before the player decides.
export const foeCombat = (t: { npc: string; monster: boolean; level?: number }, power: number, level: number, boss = false) =>
  startCombat({ npc: t.npc, monster: t.monster, boss, level, power, enemyHp: 1, enemyMaxHp: 1, enemyDc: 10, enemyDamage: 1, round: 0 } as CombatState, { power });
// How the fight leans: rounds the foe needs to fell the player over rounds the player needs (>1 favors the player).
// The 전투력 shown before a fight is the status bar's (user 2026-11-23: one number for "나", 267 on the bar was 237 on the
// card). The foe's is measured in the fight played out (fightSim) and scaled by the same factor, so which side is stronger
// still matches the odds (the plain formula read 나 178 < 적 185 at 99%).
export const fightOdds = (g: Game, s: Session, c: CombatState) => {
  const mine = heroRound(g, s, c), theirs = foeRound(g, s, c);
  const ratio = (s.hp / Math.max(0.01, theirs)) / (c.enemyMaxHp / Math.max(0.01, mine));
  const sim = fightSim(g, s, c);
  // Labelled by the fight itself played out many times (the average-only ratio said 승산 있음 for a fight lost in 6 rounds).
  const bar = playerPower(g, s), scale = bar / Math.max(1, power(sim.heroRound, Math.max(1, s.hp)));
  return { power: Math.round(power(sim.foeRound, c.enemyMaxHp) * scale), mine: bar, ratio, winRate: sim.win, hpLoss: sim.loss, label: sim.win >= 0.95 && sim.loss < 0.3 ? '여유' : sim.win >= 0.75 ? '승산 있음' : sim.win >= 0.4 ? '위험' : '매우 위험' };
};
// The same auto battle as play (autoBattleStep), run a number of times: how often the hero wins, the share of HP it costs, and
// the damage each side deals a round.
const simCache = new Map<string, { win: number; loss: number; heroRound: number; foeRound: number }>();
export const fightSim = (g: Game, s: Session, c: CombatState, runs = 150) => {
  // The whole fight in the key: without the foe's own numbers a boss and an ordinary foe of one level shared one result (85% / 46%).
  const key = JSON.stringify([c, s.hp, s.mana, s.level, s.equipped, s.itemInfo, s.characterValues, s.party, g.wizardStart, runs]), hit = simCache.get(key);
  if (hit) return hit;
  let wins = 0, lost = 0, dealt = 0, taken = 0, rounds = 0;
  const start = Math.max(1, s.hp);
  for (let i = 0; i < runs; i++) {
    let x: Session = { ...s, log: [], mode: 'combat', combat: { ...c, lethal: true, round: Math.max(1, c.round || 0) } }, k = 0;
    for (; k < AUTO_BATTLE_LIMIT * 2 && x.combat && !x.combat.result; k++) x = autoBattleStep(g, x);
    if (x.combat?.result === 'win') wins++;
    lost += Math.min(1, Math.max(0, (start - x.hp) / start));
    dealt += Math.max(0, c.enemyHp - Math.max(0, x.combat?.enemyHp ?? 0)); taken += Math.max(0, start - Math.max(0, x.hp)); rounds += Math.max(1, k);
  }
  const out = { win: wins / runs, loss: lost / runs, heroRound: dealt / rounds, foeRound: taken / rounds };
  if (simCache.size > 50) simCache.clear();
  simCache.set(key, out);
  return out;
};
export const autoBattleStep = (g: Game, s: Session): Session => {
  const c = s.combat;
  if (!c || c.result) return s;
  const { strength, agility, intellect, grow, gear, critFrom, maxHp } = combatStatsOf(g, s);
  const skill = (id: string) => gear.skills.filter(k => k.id === id).reduce((a, k) => a + k.value, 0);
  const skillName = (id: string) => gear.skills.find(k => k.id === id)?.name || '';
  const lines: string[] = [];
  let enemyHp = c.enemyHp, hp = s.hp, dealt = 0, taken = 0, countered = false, critTaken = false, critDealt = false, finisher = '';
  let shield = c.shield ?? skill('guard'), enemyShield = c.enemyShield || 0;
  // 출혈 and 독 keep working between rounds; 기절 and 가드 last only this round.
  let bleed = c.foeBleed || 0, bleedTurns = c.foeBleedTurns || 0, poison = c.foePoison || 0, stunned = false, parried = false;
  const foe = c.enemySkill, foeSkill = (id: string) => foe?.id === id ? foe.value : 0, foeLabel = foe ? SKILLS[foe.id].label : '';
  const maxMana = maxManaOf(g, s), caster = gear.caster && maxMana > 0, grit = !gear.caster && maxMana > 0;
  let hitRun = c.hitRun || 0, takenRun = c.takenRun || 0;
  // Returns a note for the log once a run is going (2 in a row and on).
  const fill = (share: number, run: number) => { if (!grit || mana >= maxMana) return ''; const add = Math.max(1, Math.round(maxMana * share * (1 + GRIT_RUN * (run - 1)))); mana = Math.min(maxMana, mana + add); return run >= 2 ? ` (연속 ${run}회 — 마나 +${add})` : ''; };
  let mana = manaNow(g, s), gauge = c.castGauge || 0;
  // weapon: a blow with the weapon; spell: a cast spell; poke: a caster out of mana jabbing with the staff.
  // finisher: the 필살기, a weapon blow that can't miss, GRIT_FINISH times as hard.
  const strike = (extra: boolean, how: 'weapon' | 'spell' | 'poke' | 'finisher' = 'weapon') => {
    if (!parried && skill('parry') && Math.random() * 100 < skill('parry')) { parried = true; lines.push(`[${skillName('parry')}] 가드 — 공격하며 자세를 잡았다`); }
    const die = d(20), spell = how === 'spell';
    const aim = spell ? intellect + grow.hit + gear.hit : how === 'poke' ? strength + grow.hit : strength + grow.hit + gear.hit;
    const target = spell ? Math.round(c.enemyDc * MAGIC_RESIST) : c.enemyDc;
    if (how === 'finisher' || die >= critFrom || (die !== 1 && die + aim >= target)) {
      const base = spell ? Math.round((4.5 + Math.max(0, intellect) + grow.damage + gear.spell) * 2 * spellScale(s.level || 1) * (0.4 + Math.random() * 1.2))
        : how === 'poke' ? Math.max(1, d(4) + strength) : Math.round((d(8) + Math.max(0, strength) + grow.damage + gear.damage) * (how === 'finisher' ? GRIT_FINISH : 1));
      const swing = base * (die >= critFrom ? 2 : 1);
      const blocked = Math.min(enemyShield, swing); enemyShield -= blocked;
      const hit = swing - blocked;
      enemyHp = Math.max(0, enemyHp - hit); dealt += hit; critDealt = critDealt || die >= critFrom;
      const run = how === 'finisher' ? '' : fill(GRIT_HIT, ++hitRun);
      lines.push(`${extra ? `[${skillName('double')}] 연타! ` : ''}${die >= critFrom ? '치명타! ' : ''}${spell ? '마법 명중' : how === 'finisher' ? '필살기 명중' : '내 공격 명중'} — ${c.npc}에게 ${spell ? '마법' : '물리'} 피해 ${hit}${blocked ? ` (${c.npc}의 ${foeLabel}이 ${blocked} 막음)` : ''} · ${c.npc} ${enemyHp}/${c.enemyMaxHp}${run}`);
      const thorn = Math.round(hit * foeSkill('thorns') / 100);
      if (thorn > 0) { hp = Math.max(c.lethal ? 0 : 1, hp - thorn); taken += thorn; lines.push(`${c.npc}의 ${foeLabel} — 나에게 ${thorn} 피해가 되돌아옴 · 내 HP ${hp}/${maxHp}`); }
      if (hit > 0 && skill('bleed')) { const fresh = !bleedTurns; bleed = skill('bleed'); bleedTurns = 3; if (fresh) lines.push(`[${skillName('bleed')}] 출혈 — ${c.npc}${josa(c.npc, '이')} 피를 흘린다 (3라운드, 매 라운드 ${bleed})`); }
      if (hit > 0 && skill('poison') && poison < 5) { poison += 1; lines.push(`[${skillName('poison')}] 독 — ${c.npc}에게 독 ${poison}중첩`); }
      if (hit > 0 && !stunned && skill('stun') && Math.random() * 100 < skill('stun')) { stunned = true; lines.push(`[${skillName('stun')}] 기절 — ${c.npc}${josa(c.npc, '이')} 비틀거린다`); }
      const healed = Math.min(maxHp - hp, Math.round(hit * skill('lifesteal') / 100));
      if (healed > 0) { hp += healed; lines.push(`[${skillName('lifesteal')}] 흡혈 — HP ${healed} 회복 · 내 HP ${hp}/${maxHp}`); }
    } else { hitRun = 0; lines.push(`${extra ? `[${skillName('double')}] 연타 — ` : ''}${spell ? '마법이 빗나갔다' : '내 공격이 빗나갔다'} — ${c.npc}${josa(c.npc, '이')} 피했다`); }
  };
  if (caster) {
    gauge += 100 + gear.haste;
    if (gauge < SPELL_GAUGE) lines.push(`마법 시전 중… ${Math.round(gauge / SPELL_GAUGE * 100)}%`);
    else if (mana >= SPELL_COST) { gauge -= SPELL_GAUGE; mana -= SPELL_COST; lines.push(`마법 발동! (마나 -${SPELL_COST} · ${mana}/${maxMana})`); strike(false, 'spell'); }
    else { gauge = SPELL_GAUGE; lines.push('마나가 부족하다 — 지팡이로 후려친다'); strike(false, 'poke'); }
  } else if (grit && mana >= maxMana) {
    mana = 0; finisher = finisherOf(g); lines.push(`마나 폭발! 필살기 「${finisher}」!!`); strike(false, 'finisher');
  } else {
    strike(false);
    if (enemyHp > 0 && skill('double') && Math.random() * 100 < skill('double')) strike(true);
  }
  // Companions strike after the player; a companion never fights against itself.
  const allyHits: string[] = [];
  for (const ally of (s.party || []).filter(n => n !== c.npc)) {
    if (enemyHp <= 0) break;
    const roll = d(20), allyTier = companionStats(npcLevel(s, ally) || 3);
    if (roll === 20 || (roll !== 1 && roll + (allyTier.dc - 10) >= c.enemyDc - 2)) {
      const hit = Math.ceil(d(allyTier.damage) * 0.7) * (roll === 20 ? 2 : 1);
      enemyHp = Math.max(0, enemyHp - hit); dealt += hit; allyHits.push(ally);
      lines.push(`${roll === 20 ? '치명타! ' : ''}동료 ${ally}의 공격 명중 — ${c.npc}에게 ${hit} 피해 · ${c.npc} ${enemyHp}/${c.enemyMaxHp}`);
    } else lines.push(`동료 ${ally}의 공격이 빗나갔다`);
  }
  const foeCrit = foeSkill('keen') || 20;
  const counterAttack = (again: boolean) => {
    if (parried) { parried = false; countered = true; lines.push(`[${skillName('parry')}] 가드 — ${c.npc}의 반격을 막아 냈다`); return; }
    const counter = d(20);
    countered = true; critTaken = critTaken || counter >= foeCrit;
    // Stronger foes (higher dc) also land their counters more often: a civilian rarely connects, a legend almost always does.
    if (counter >= foeCrit || (counter !== 1 && counter + (c.enemyAtk ?? c.enemyDc - 10) >= 12 + Math.max(0, agility) + grow.dodge + gear.dodge)) {
      const raw = d(c.enemyDamage) * (counter >= foeCrit ? 2 : 1);
      const absorbed = Math.min(shield, raw); shield -= absorbed;
      const got = raw - absorbed; taken += got;
      hp = Math.max(c.lethal ? 0 : 1, hp - got);
      const run = got > 0 ? fill(GRIT_TAKEN, ++takenRun) : (takenRun = 0, '');
      lines.push(`${again ? `${c.npc}의 ${foeLabel}! ` : ''}${counter >= foeCrit ? '치명타! ' : ''}${c.npc}의 반격 명중 — 나에게 ${got} 피해${absorbed ? ` ([${skillName('guard')}] 보호막이 ${absorbed} 막음)` : ''} · 내 HP ${hp}/${maxHp}${run}`);
      const back = Math.round(raw * skill('thorns') / 100);
      if (back > 0 && enemyHp > 0) { enemyHp = Math.max(0, enemyHp - back); dealt += back; lines.push(`[${skillName('thorns')}] 가시 — ${c.npc}에게 ${back} 피해를 되돌려 줌 · ${c.npc} ${enemyHp}/${c.enemyMaxHp}`); }
      const drain = Math.min(c.enemyMaxHp - enemyHp, Math.round(got * foeSkill('lifesteal') / 100));
      if (drain > 0 && enemyHp > 0) { enemyHp += drain; lines.push(`${c.npc}의 ${foeLabel} — ${drain} 회복 · ${c.npc} ${enemyHp}/${c.enemyMaxHp}`); }
    } else { takenRun = 0; lines.push(`${again ? `${c.npc}의 ${foeLabel} — ` : ''}${c.npc}의 반격을 피했다`); }
  };
  if (enemyHp > 0 && stunned) lines.push(`${c.npc}${josa(c.npc, '은')} 기절해 반격하지 못했다`);
  if (enemyHp > 0 && hp > 0 && !stunned) counterAttack(false);
  if (enemyHp > 0 && hp > 0 && !stunned && foeSkill('double') && Math.random() * 100 < foeSkill('double')) counterAttack(true);
  if (enemyHp > 0 && bleedTurns > 0) { const cut = Math.min(enemyHp, bleed); enemyHp -= cut; dealt += cut; bleedTurns -= 1; lines.push(`출혈 — ${c.npc}에게 ${cut} 피해 · ${c.npc} ${enemyHp}/${c.enemyMaxHp}`); }
  if (enemyHp > 0 && poison > 0 && skill('poison')) { const sting = Math.min(enemyHp, poison * skill('poison')); enemyHp -= sting; dealt += sting; lines.push(`독 — ${c.npc}에게 ${sting} 피해 (${poison}중첩) · ${c.npc} ${enemyHp}/${c.enemyMaxHp}`); }
  if (enemyHp > 0 && foeSkill('regen') && enemyHp < c.enemyMaxHp) { const mend = Math.min(c.enemyMaxHp - enemyHp, foeSkill('regen')); enemyHp += mend; lines.push(`${c.npc}의 ${foeLabel} — ${mend} 회복 · ${c.npc} ${enemyHp}/${c.enemyMaxHp}`); }
  if (enemyHp > 0 && hp > 0 && skill('regen') && hp < maxHp) {
    const heal = Math.min(maxHp - hp, skill('regen')); hp += heal;
    lines.push(`[${skillName('regen')}] 재생 — HP ${heal} 회복 · 내 HP ${hp}/${maxHp}`);
  }
  if (caster) mana = Math.min(maxMana, mana + Math.max(1, Math.round(maxMana * MANA_REGEN_ROUND)));
  const round = c.round + 1;
  // A stalemate is settled by whoever has more health left.
  const knockedOut = !c.lethal && hp <= 1 && taken > 0;
  const result: CombatState['result'] = enemyHp <= 0 ? 'win' : hp <= 0 || knockedOut ? 'lose' : round > AUTO_BATTLE_LIMIT ? (enemyHp / c.enemyMaxHp < hp / Math.max(1, maxHp) ? 'win' : 'lose') : undefined;
  if (result) lines.push(result === 'win' ? `승리 — ${c.npc}${josa(c.npc, '을')} 쓰러뜨렸다` : knockedOut ? `패배 — ${c.npc}에게 쓰러져 빈사 상태가 됐다 (HP 1)` : `패배 — ${c.npc}에게 쓰러졌다`);
  return { ...s, hp, ...(maxMana > 0 ? { mana } : {}), combat: { ...c, castGauge: caster ? gauge : undefined, hitRun, takenRun, enemyHp, shield, enemyShield, foeBleed: bleed, foeBleedTurns: bleedTurns, foePoison: poison, round, lastDealt: dealt, lastTaken: taken, last: { allies: allyHits, ...(finisher ? { finisher } : {}), dealt, critDealt: critDealt && dealt > 0, taken: countered ? taken : null, critTaken: critTaken && taken > 0 }, totalDealt: (c.totalDealt || 0) + dealt, totalTaken: (c.totalTaken || 0) + taken, result }, log: [...s.log, ...lines.map(l => `전투: ${l}`)] };
};
// A check rolled just before a fight changes the fight itself, whatever the narration said: the GM's text alone left no visible difference.
// openCut is a share of the foe's health, taken in startCombat because that's where its real health is settled.
export const fightEdge = (g: Game, s: Session, foe: string): { openCut: number; hp: number; log: string[]; note: string } => {
  const c = s.lastCheck;
  // Rolls won earlier toward the final boss (impact 'boss') wear it down before the fight: 10% each, up to 30%.
  const prepared = foe === finalBoss(g) && s.bossEdge ? Math.min(0.3, s.bossEdge * 0.1) : 0;
  if (prepared) { const e = c ? fightEdge(g, { ...s, bossEdge: 0 }, foe) : { openCut: 0, hp: s.hp, log: [], note: '' }; return { ...e, openCut: Math.min(0.6, e.openCut + prepared), log: [`시스템: 앞서 해 둔 준비 — ${foe}의 체력 -${Math.round(prepared * 100)}%`, ...e.log], note: e.note + ` 주인공이 앞서 해 둔 준비로 ${foe}${josa(foe, '은')} 약해진 채 싸움을 시작합니다.` }; }
  if (!c) return { openCut: 0, hp: s.hp, log: [], note: '' };
  if (c.success) {
    const openCut = c.critical ? 0.35 : 0.2;
    return { openCut, hp: s.hp, log: [`시스템: 판정 ${c.critical || '성공'} — 선제 타격! ${foe}의 체력 -${openCut * 100}%`], note: ` 플레이어가 판정에 성공해 먼저 일격을 넣었으니 ${foe}${josa(foe, '은')} 이미 다친 채 싸움을 시작합니다.` };
  }
  // The failed roll already cost its HP (turn.ts, rollPay.hurt): the fight starts on the back foot, not with a second hit
  // ("HP 150 → 135" then "허를 찔렸다! 135 → 105" in one failure, 2026-11-19 playtest).
  return { openCut: 0, hp: s.hp, log: [`시스템: 판정 ${c.critical || '실패'} — 허를 찔린 채 싸움이 시작됩니다`], note: ` 플레이어가 판정에 실패해 이미 다친 채 ${foe}${josa(foe, '와')} 싸움을 시작합니다.` };
};
export type QuestClear = { quests: { name: string; giver: string }[]; xp: number; reputation: number; total: number; gold?: number; items: string[]; levelFrom: number; levelTo: number; next?: string; key: number };
// A notice held back during a talk: one talk can finish more than one quest, and the later one mustn't erase the earlier.
export const mergeClear = (prev: QuestClear | null, now: QuestClear): QuestClear => !prev ? now : { ...now, quests: [...prev.quests, ...now.quests], xp: prev.xp + now.xp, reputation: prev.reputation + now.reputation, gold: (prev.gold || 0) + (now.gold || 0), items: [...prev.items, ...now.items], levelFrom: prev.levelFrom, next: now.next || prev.next };
export const INTRO_SECONDS = 2.4, INTRO_MAX_SECONDS = 10;
// One pass of a GIF in seconds, from its frame delays (a delay under 2/100s plays as 1/10s in browsers).
export const gifSeconds = (b: Uint8Array) => { let cs = 0; for (let i = 0; i + 7 < b.length; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 4 && b[i + 7] === 0) { const d = b[i + 4] | (b[i + 5] << 8); cs += d < 2 ? 10 : d; } return cs / 100; };
export const battleIntro = (c: CombatState, hp: number, maxHp: number) => `전투: ${c.npc}의 체력 ${c.enemyHp} · 나의 체력 ${hp}/${maxHp} — 전투 시작`;
// The story log is text only; images belong to the scene stage.
// Affection numbers read at a glance: green when it went up or is above zero, red when down or below.
export const affectionClass = (n: number) => n > 0 ? 'affPos' : n < 0 ? 'affNeg' : '';
// The right particle for a word: 와/과, 을/를, 이/가, 은/는, 로/으로 by its last syllable (non-Hangul: the 이/가-free form).
export const josa = (word: unknown, p: '와' | '을' | '이' | '은' | '로'): string => {
  const w = String(word ?? '').trim(), c = w.charCodeAt(w.length - 1), hangul = c >= 0xac00 && c <= 0xd7a3, fin = hangul ? (c - 0xac00) % 28 : 0;
  if (p === '로') return fin && fin !== 8 ? '으로' : '로';
  const has = fin > 0;
  return p === '와' ? (has ? '과' : '와') : p === '을' ? (has ? '을' : '를') : p === '이' ? (has ? '이' : '가') : (has ? '은' : '는');
};
// A gesture the talk writer put mid-reply ("…받겠습니다. (인장 반지를 잠시 바라보다) 첫 임무입니다…") that looks at something the
// player carries reads as the item clue line, as the first sight of the ring did (user, 2026-11-12). "바라보다" → "바라본다".
export const asideClue = (partner: string, asides: string[], inventory: string[]) => {
  const short = (n: string) => n.split(' ').slice(-2).join(' ');
  for (const a of asides) {
    const item = inventory.find(n => a.includes(n) || a.includes(short(n))) || inventory.find(n => { const w = n.split(' ').pop() || ''; return w.length >= 2 && a.includes(w); });
    if (!item) continue;
    const act = a.trim().replace(/[.。]$/, '').replace(/(.)다$/, (m, ch: string) => {
      const c = ch.charCodeAt(0), fin = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : -1;
      if (fin < 0 || /[있없]/.test(ch) || fin === 4) return m;
      return fin === 0 ? String.fromCharCode(c + 4) + '다' : fin === 8 ? String.fromCharCode(c - 4) + '다' : ch + '는다';
    });
    return { item, text: `${partner}${josa(partner, '이')} ${act}.` };
  }
  return null;
};
export const storyText = (text: string) => text.replace(/\{\{\s*img\s*::[^{}\n]*\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
// GM narration in the story log reads as narration / speech / narration: the 【장소 · 때】 heading stands apart, and
// every quoted line is pulled out of its paragraph onto its own indented line, even when the GM ran it into the prose.
export const QUOTE = /(["“][^"”\n]{1,400}["”]|「[^」\n]{1,400}」)/;
export const WHOLE_QUOTE = new RegExp(`^${QUOTE.source}$`);
// Talk lines are stored structured so they can render as chat bubbles instead of prose.
export type TalkLine = { speaker: 'me' | 'npc' | 'scene' | 'cue'; name: string; line: string; gesture?: string; quiet?: boolean };
export const parseTalk = (entry: string): TalkLine | null => {
  if (entry.startsWith('대화-나:')) return { speaker: 'me', name: '나', line: entry.slice(5).trim() };
  if (entry.startsWith('대화-상황:')) return { speaker: 'scene', name: '', line: entry.slice(6).trim() };
  if (entry.startsWith('대화-단서:')) return { speaker: 'cue', name: '', line: entry.slice(6).trim() };
  if (!entry.startsWith('대화-NPC:')) return null;
  try { const v = JSON.parse(entry.slice(7)); return { speaker: 'npc', name: String(v.name || ''), line: String(v.line || ''), gesture: typeof v.gesture === 'string' ? v.gesture : '', quiet: v.quiet === true }; } catch { return null; }
};
// The GM reads the conversation as plain dialogue.
export const historyLine = (entry: string) => { const t = parseTalk(entry); return !t ? entry : t.speaker === 'scene' || t.speaker === 'cue' ? `(상황) ${t.line}` : t.speaker === 'me' ? `플레이어: "${t.line}"` : `${t.name}: "${t.line}"${t.gesture ? ` (${t.gesture})` : ''}`; };
// The GM's talk reply in reading order: narration lines and speech bubbles alternate as written.
// The gesture rides on the first bubble; its label is hidden when narration already describes it.
export const talkEntries = (npc: string, data: { parts?: unknown; text?: unknown; line?: unknown; gesture?: unknown; howKnown?: unknown }): string[] => {
  const gesture = typeof data.gesture === 'string' ? data.gesture : '';
  const parts = Array.isArray(data.parts) ? data.parts.filter((p): p is { type: string; text: string } => !!p && typeof p.text === 'string' && !!p.text.trim()) : [];
  const ordered = parts.length ? parts : [...(typeof data.text === 'string' && data.text.trim() ? [{ type: 'scene', text: data.text }] : []), { type: 'speech', text: String(data.line || '…') }];
  const quiet = ordered.some(p => p.type === 'scene');
  let first = true;
  const lines = ordered.map(p => {
    if (p.type === 'scene') return `대화-상황: ${p.text.trim()}`;
    const entry = `대화-NPC: ${JSON.stringify({ name: npc, line: p.text.trim().replace(/^["“”']+|["“”']+$/g, ''), gesture: first ? gesture : '', quiet })}`;
    first = false;
    return entry;
  });
  // How the NPC came to know what they're about to say: it reads before the line it explains.
  return typeof data.howKnown === 'string' && data.howKnown.trim() ? [`대화-단서: ${data.howKnown.trim()}`, ...lines] : lines;
};
// A narrated intent ("~에 대해 묻는다") in the current conversation is replaced by the line the GM phrased as real speech.
export const withPlayerLine = (log: string[], line: unknown) => {
  if (typeof line !== 'string' || !line.trim()) return log;
  const start = log.map(e => e.startsWith('시스템:') && e.includes('대화를 시작했습니다')).lastIndexOf(true);
  const mine = log.map(e => e.startsWith('대화-나:')).lastIndexOf(true);
  return mine > start ? [...log.slice(0, mine), `대화-나: ${line.trim()}`, ...log.slice(mine + 1)] : log;
};
// A foe met on a move: the way there and the foe showing up, ending before any blow (the fight is the player's call).
export const ambushScene = (where: string, foe: { name: string; desc: string }, intent = '') => `시스템이 이동을 확정했습니다. ${where} ${intent ? `플레이어가 하려던 일: "${intent}". ` : ''}가는 길과 주변을 짧게 묘사한 뒤, ${foe.name}(${foe.desc})${josa(foe.name, '이')} 나타나 앞을 막아서는 데서 장면을 끝내세요. 싸움은 아직 시작되지 않았습니다.`;
// The action that set off a move, for the arrival scene: the move skips the scene where it was played, so what it does before
// leaving is told as done. "검을 증거로 챙겨 … 보고하러 간다" arrived as "검은 챙겨 오지 못했습니다": no sword in the bag (2026-11-23).
export const setOffWith = (intent: string) => intent ? `플레이어가 한 행동: "${intent}". 그 가운데 떠나기 전에 할 일(물건 챙기기, 숨기기, 남기기)은 하고 떠난 것으로 씁니다. ` : '';
export const arrivalToMeet = (npc: string, intent = '') => `${setOffWith(intent)}도착한 장면을 묘사하세요. ${npc}${josa(npc, '이')} 그곳에 있습니다. 대화는 아직 시작되지 않았으니 ${npc}의 대사는 쓰지 마세요.`;
export type LogItem = { kind: 'entry'; entry: string } | { kind: 'talk'; lines: TalkLine[] } | { kind: 'battle'; lines: string[] };
export const groupLog = (log: string[]): LogItem[] => { let openTalk: { kind: 'talk'; lines: TalkLine[] } | null = null; return log.reduce<LogItem[]>((items, entry) => {
  const t = parseTalk(entry); const last = items[items.length - 1];
  if (entry.startsWith('시스템:') && /대화(를 시작했습니다|를 마쳤습니다|가 끝났습니다)/.test(entry)) openTalk = null;
  if (t && openTalk) { openTalk.lines.push(t); return items; }
  if (entry.startsWith('전투:')) { const line = entry.slice(3).trim(); if (last?.kind === 'battle' && !line.endsWith('전투 시작')) last.lines.push(line); else items.push({ kind: 'battle', lines: [line] }); }
  else if (!t) items.push({ kind: 'entry', entry });
  else if (last?.kind === 'talk') last.lines.push(t);
  else { openTalk = { kind: 'talk', lines: [t] }; items.push(openTalk); }
  return items;
}, []); };
// Built-in portraits shipped for each genre (files in public/_default_npcs/<genre>/<name>_기본.png).
export const DEFAULT_NPC_NAMES: Record<string, string[]> = {
  fantasy: ["그리마 철망치", "넬", "레지나 발트", "리오네 아스크", "말라키아", "미라벨 크로우", "바레나", "브리아", "세라핀", "실바엘", "아우렐리아", "에드리아 하르트", "엘로이즈", "오르벨라", "오틸리에 마른", "우르술라", "이졸데", "카시아", "테오도라", "핍", "한나"],
};
// The people who live or work at each place (pin name). The director builds a place's sketch from these people only, and a place with none
// gets no sketch: with free rein it filled 회색 탑 폐허 with a nameless band of scavengers that the scene, the choices and the dice then chased.
export const PLACE_NPCS: Record<string, string[]> = {
  레븐홀트: ['에드리아 하르트', '브리아', '한나'], 사레타: ['바레나', '오틸리에 마른', '우르술라'], 아스테라: ['테오도라', '오르벨라'],
  '금지된 상회 본거지': ['오틸리에 마른'], '마탑 본부': ['리오네 아스크', '미라벨 크로우'], '태양교단 총본산': ['오르벨라', '세라핀'],
  그림우드: ['넬', '실바엘', '엘로이즈'], '은엽 숲': ['실바엘'], '철망치 씨족 본거지': ['그리마 철망치'], '그림자 숲의 거점': ['카시아'], '변경백가 영지': ['레지나 발트'],
  // A person is found at the first spot inside a city listed for them (npcWhereabouts): 한나 runs the inn, 브리아 the guild branch.
  '부러진 방패 여관': ['한나'], '모험가 길드 레븐홀트 지부': ['브리아'], '북문 초소': ['에드리아 하르트', '브리아'],
  '진흙 골목': ['핍'], '성문 앞 장터': ['한나', '말라키아'], '변경 수비 성채': ['에드리아 하르트'], '마탑 출장소': ['미라벨 크로우'], 대장간: ['그리마 철망치'],
  '상인 주거지': ['오틸리에 마른'], '소금 골목': ['핍', '카시아'], '모험가 길드 사레타 지부': ['우르술라'], '항구 선창': ['바레나'], '7번 부두': ['바레나'],
  '마탑 본탑': ['리오네 아스크', '미라벨 크로우'], 왕궁: ['테오도라', '아우렐리아'], '귀족가 주거지': ['아우렐리아'], '왕도 대시장': ['오틸리에 마른'],
  '태양 대신전': ['오르벨라', '세라핀', '이졸데'], '왕궁 외성': ['테오도라'], 밑동네: ['카시아', '핍'],
};
// How the hero sees someone not met yet. A choice names a person only once the hero has met them: before, choices sent the
// hero "to find 넬" in a forest they had never met her in (17 times in recorded play), since every input names the cast.
export const NPC_LOOKS: Record<string, string> = {
  '에드리아 하르트': '은발의 기사단장', '레지나 발트': '변경백가의 젊은 영주 대리', 세라핀: '젊은 성기사', 오르벨라: '늙은 대신관',
  '리오네 아스크': '마탑의 마도사', '미라벨 크로우': '견습 기록관', 브리아: '길드 지부장', 넬: '숲의 궁수', 카시아: '뒷골목의 여인',
  핍: '골목의 정보통', '오틸리에 마른': '상회 대리인', 실바엘: '엘프 순찰자', '그리마 철망치': '드워프 대장장이', 우르술라: '용병단장',
  바레나: '선장', 테오도라: '왕녀', 아우렐리아: '대공', 말라키아: '떠돌이 약장수', 이졸데: '신전 시녀', 한나: '여관 주인', 엘로이즈: '떠돌이 약초사',
};
const LOOK_JOSA: Record<string, '와' | '을' | '이' | '은' | '로'> = { 이: '이', 가: '이', 을: '을', 를: '을', 은: '은', 는: '은', 와: '와', 과: '와', 으로: '로', 로: '로' };
// A choice heads only to a place the story gave a reason for: named in `told` (the recent scenes and talks, the current
// goal's steps, where the hero is). Choice 3, "the unexpected move", picked any nearby place: 회색 탑 after 넬's talk with
// nothing pointing there (2026-11-19). A name counts whole or without its last word (회색 탑 폐허 → 회색 탑), never a generic word alone.
// A place is also told through what lies in it (7번 부두 → 사레타) or the world pin its name starts with (그림우드 숲 가장자리 →
// 그림우드): "사레타로 가서 7번 부두의 바레나를 찾는다" for the goal at 7번 부두 read as unexplained, and every redraw wrote it again (9 in a row).
// The name without its last word counts only when it still names the place: not a two-letter word (새벽 신전 → 새벽, 소금 골목 →
// 소금, 마탑 출장소 → 마탑) nor a faction (태양교단 총본산 → 태양교단, 심연의 사도 성역 → 심연의 사도), which a choice says for other reasons.
const FACTIONS = ((GENRE_REF as Record<string, { factions?: string[] }>)[GENRE_REF_KEY.fantasy]?.factions || []).map(f => f.split(':')[0].trim());
export const withoutUnmetNames = (text: string, known: string[]) => Object.entries(NPC_LOOKS).reduce((t, [name, look]) => {
  const first = name.split(' ')[0];
  if (known.some(k => k === name || k.split(' ')[0] === first)) return t;
  // A title already written before the name ("골목의 정보통 핍") is not doubled.
  const tail = look.split(' ').at(-1)!;
  // The name stands alone: a word that only starts with it is left as written ("한나절" read as 한나 became "여관 주인절", 2026-11-20).
  return t.replace(new RegExp(`(?:(?:${look}|${tail})\\s+)?(?<![가-힣])(?:${name}|${first})(으로|로|이|가|을|를|은|는|와|과)?(의|에게서|에게|에서|한테|도|만|처럼|보다|까지|부터)?(?![가-힣])`, 'g'), (_m, p?: string, q?: string) => look + (p ? josa(look, LOOK_JOSA[p]) : '') + (q || ''));
}, text);
// A scene calls someone the hero hasn't met by how they look, outside what is said aloud (user 2026-11-20: 넬 and 핍 walked
// on by name, and the hero asked 넬 hers only afterwards). The name comes with the meeting (the talk and its cut-in).
// The one list of names the hero knows: met on stage (the cut-in), in the party, or talking now. Scene text, choices and the
// writers' input all read it; the bookkeeper's relationship rows don't count (it added anyone the writer named, so names showed early).
export const metNames = (s: Session) => [...new Set([...(s.metNpcs || []), ...(s.party || []), s.talkNpc || ''])].filter(Boolean);
export const unnamedScene = (text: string, known: string[]) => text.split(/(“[^”]*”|"[^"]*")/).map((part, i) => i % 2 ? part : withoutUnmetNames(part, known)).join('');
// Who is at a place now: those who live there, less anyone a next talk step has called elsewhere, plus anyone it has called here.
// A spot inside a city is in that city too (에드리아 called to 북문 초소 is in 레븐홀트).
export const placePeople = (g: Game, s: Session, place: string) => {
  const due = dueTalks(g, s), inside = (spots: string[]) => spots.some(w => w === place || cityPlaces('fantasy').some(([n, c]) => n === w && c === place));
  return [...new Set([...(PLACE_NPCS[place] || []).filter(n => !due[n] || inside(due[n])), ...Object.keys(due).filter(n => inside(due[n]))])];
};
export const defaultNpcImage = (g: Game, name: string) => { const genre = defaultMapGenre(g); return DEFAULT_NPC_NAMES[genre]?.includes(name) ? `/api/default-npc/${encodeURIComponent(name)}?genre=${genre}` : undefined; };
// Browsers held built-in NPC art for a day under the old cache header; a version tag fetches the replaced files.
export const freshAsset = (url?: string) => url && url.startsWith('/api/default-npc/') && !/[?&]v=/.test(url) ? `${url}${url.includes('?') ? '&' : '?'}v=2` : url;
// Anyone without art (a newcomer the GM brought in, an unnamed extra) gets the genre's stand-in portrait.
export const unknownNpcImage = (g: Game) => `/api/default-npc/_unknown?genre=${defaultMapGenre(g)}`;
export const npcImage = (g: Game, name: string, activeKey?: string) => {
  const cell = activeKey?.startsWith(name + '::') ? (g.imageCells || []).find(c => { const row = (g.imageRows || []).find(r => r.id === c.rowId); const col = (g.imageColumns || []).find(x => x.id === c.columnId); return !!row && !!col && `${row.name}::${col.name}` === activeKey; }) : undefined;
  return freshAsset(cell?.image || (g.npcPortraits || []).find(n => n.name === name)?.image || defaultNpcImage(g, name) || unknownNpcImage(g));
};
// Each start identity (chosen in the wizard) begins with its own strengths; the start items come from the prompt.
// Values replace the genre preset's initial value for fields with that id.
// path: what the hero grows into and wears (growStats, heroFits). The new adventurer can still become either (user 2026-11-20).
export const START_PROFILES: Record<string, { job: string; path: HeroPath; stats: Record<string, string> }> = {
  '신입 모험가': { job: '철급 모험가', path: 'both', stats: { strength: '12', agility: '12', intelligence: '10', mana: '30', realm: '철급 모험가' } },
  '몰락 기사 가문의 후계자': { job: '몰락 기사 가문 후계자', path: 'fighter', stats: { strength: '15', agility: '10', intelligence: '9', realm: '견습 기사' } },
  '마탑 탈주 견습생': { job: '탈주 견습 마법사', path: 'caster', stats: { strength: '7', agility: '10', intelligence: '15', mana: '80', realm: '1서클 마법사' } },
};
export const startValues = (g: Game) => { const extra = START_PROFILES[g.wizardStart || '']?.stats || {}; return Object.fromEntries((g.characterConfig || defaultCharacterConfig()).fields.map(f => [f.id, extra[f.id] ?? f.initial])); };
// The start's stats as a short line for the wizard's choice cards, e.g. "근력 15 · 민첩 10".
export const startStatLine = (g: Game, start: string) => { const stats = START_PROFILES[start]?.stats; return stats ? (g.characterConfig || defaultCharacterConfig()).fields.filter(f => stats[f.id]).map(f => `${f.name} ${stats[f.id]}`).join(' · ') : ''; };
// The story's own start items (the sword the dying knight hands over) go into the pack once, equipped if the slot is
// free. A flag marks them given, so a save made before this existed gets them, and a lost sword never comes back.
export const withStoryItems = (g: Game, s: Session): Session => {
  const due = (mainPrologue(g.wizardMain)?.startItems || []).filter(it => !(s.flags || []).includes(`시작 아이템:${it.name}`));
  if (!due.length) return s;
  const equipped = { ...(s.equipped || {}) };
  for (const it of due) if (it.kind !== 'item' && !equipped[it.kind]) equipped[it.kind] = it.name;
  return { ...s, inventory: [...(s.inventory || []).filter(n => !due.some(it => it.name === n)), ...due.map(it => it.name)], equipped,
    itemInfo: { ...(s.itemInfo || {}), ...Object.fromEntries(due.map(it => [it.name, { grade: it.grade, kind: it.kind, desc: it.desc }])) },
    flags: [...(s.flags || []), ...due.map(it => `시작 아이템:${it.name}`)] };
};
// Starting gear goes on at once, one piece per slot (the mage starts holding the staff), before story items, which
// only take a slot still empty (the knight's sword stays in the bag of a mage).
export const wearStartGear = (s: Session): Session => { const equipped: Equipped = { ...(s.equipped || {}) }; for (const n of s.inventory || []) { const k = infoOf(n, s.itemInfo).kind; if (k !== 'item' && !equipped[k]) equipped[k] = n; } return { ...s, equipped }; };
// A story item takes the place of the start's item of the same sort: 몰락 기사 후계자's 가문 인장 반지 beside the knight's 잿빛 갈매기 인장 반지 read as two of one thing.
export const storyReplaces = (g: Game, name: string) => (mainPrologue(g.wizardMain)?.startItems || []).some(it => name !== it.name && name.endsWith(it.name.split(' ').slice(-2).join(' ')));
export const makeSession = (g: Game): Session => withStoryItems(g, wearStartGear({
  ...getStartingLocation(g), gameId: g.id, runId: makeId(),
  x: Math.floor(g.size / 2), y: Math.floor(g.size / 2), hp: g.hp,
  inventory: combinedStartingItems(g.prompt || '', g.startingEquipment || '').filter(n => !storyReplaces(g, n)),
  characterValues: startValues(g), characterEquipment: {}, characterGold: (g.characterConfig || defaultCharacterConfig()).initialGold,
  flags: [], triggeredEvents: [], delivered: [], currentGoal: '', quests: mainPrologue(g.wizardMain)?.firstQuest ? [mainPrologue(g.wizardMain)!.firstQuest] : [], reputation: 0, party: [], goalCompleted:false, relationships: [], sceneNpcs: [], suggestedActions: [], activeImageKey: undefined, roll: null, pendingCheck: null, lastCheck: null,
  log: [prologueText(g).trim() ? `프롤로그: ${prologueText(g).trim()}` : 'GM: 모험의 첫 장이 열린다. 주변 풍경을 살피며 어디로 향할지 정할 수 있다.']
}));

// Light-novel style reactions: the partner's gesture (or, failing that, their punctuation) picks a short motion.
export const gestureMotion = (gesture = '', line = '') => {
  if (/놀라|깜짝|흠칫|눈을 크게|눈이 커/.test(gesture)) return 'npcJump';
  if (/화를|화가|노려|언성|버럭|분노|격앙|이를 악/.test(gesture)) return 'npcShake';
  if (/고개를 (젓|저)|저으며|도리질/.test(gesture)) return 'npcHeadShake';
  if (/끄덕|고개를 숙|인사|목례/.test(gesture)) return 'npcNod';
  if (/물러|뒷걸음|뒤로|움찔/.test(gesture)) return 'npcStepBack';
  if (/다가|낮추|속삭|몸을 기울|가까이/.test(gesture)) return 'npcLeanIn';
  if (/웃|미소|부끄|수줍|장난|킥킥/.test(gesture)) return 'npcSway';
  if (/갸웃|의아|고개를 기울/.test(gesture)) return 'npcTilt';
  if (/[!！]/.test(line)) return 'npcJump';
  if (/[?？]\s*$/.test(line)) return 'npcTilt';
  return 'npcTalk';
};
export const tabs: { id: Tab; label: string }[] = [{ id: 'prompt', label: '게임 프롬프트' }, { id: 'map', label: '맵 관리' }, { id: 'settings', label: '게임 설정' }, { id: 'register', label: '등록' }];

// Tooltip for an item: grade, kind, description, stat bonus and unique skill.
export const itemTitle = (name: string, it: ItemInfo) => [`[${GRADE_LABELS[it.grade]}] ${KIND_LABELS[it.kind]} · ${name}`, it.desc, bonusText(it, name), skillText(it)].filter(Boolean).join('\n');
// The GM states the time of day only in its 【장소 · 때】 heading, so that is where the status bar reads it.
export const sceneTime = (log: string[]) => { for (let i = log.length - 1; i >= 0; i--) { const t = log[i].match(/^GM:\s*【[^】]*·\s*([^】·]+)】/)?.[1].trim(); if (t) return t; } return ''; };
// The newest scene sits under the stage; older scenes open above it, and the full history stays in the side log.
// What the info tab shows, per section: a section whose mark differs from the last one the player saw gets a red dot.
export const infoMarks = (s: Session): Record<string, string> => ({ stats: JSON.stringify([s.level || 1, s.characterValues || {}]), inventory: JSON.stringify([s.inventory || [], s.equipped || {}]), relationships: JSON.stringify([(s.relationships || []).map(r => [r.name, r.relation, r.affection]), s.party || []]) });
export const wizardWorlds:Record<string,string[]> = {
 rpg:['정통 판타지'], survival:['좀비 아포칼립스','무인도 생존','우주 재난'],
 mystery:['현대 범죄 수사','고딕 미스터리','SF 탐정극'],strategy:['중세 왕국 정치','무림 세력 경쟁','현대 국가 외교'],
 management:['판타지 영지 경영','현대 기업 운영','우주 식민지 건설'],romance:['현대 대학 일상','판타지 궁정 로맨스','직장 생활'],
 custom:['현대','판타지','SF · 미래']
};
export type BulkRuleSection = { title: string; content: string };
export function parseBulkRules(source: string): BulkRuleSection[] {
 const heading = /^\s*(?:#{1,6}\s*)?\[([^\]\r\n]+)\]\s*$/gm;
 const matches = Array.from(source.matchAll(heading));
 if (!matches.length) return [];
 const parsed: BulkRuleSection[] = [];
 for (let i = 0; i < matches.length; i++) {
  const match = matches[i];
  const start = (match.index || 0) + match[0].length;
  const end = i + 1 < matches.length ? matches[i + 1].index! : source.length;
  const title = match[1].trim();
  const content = source.slice(start, end).trim();
  if (title && content) parsed.push({ title, content });
 }
 return parsed;
}
// Inventory clean-up (user 2026-11-20): gear the hero isn't wearing sells in one go for gold by grade. Tools, potions and the
// prologue's own items (the family ring) are never sold.
export const SELL_PRICE = [5, 15, 40, 100, 250, 600];
export const junkOf = (g: Game, s: Session) => {
  const worn = new Set(Object.values(s.equipped || {})), keep = new Set((mainPrologue(g.wizardMain)?.startItems || []).map(it => it.name));
  return (s.inventory || []).filter(n => !worn.has(n) && !keep.has(n) && (infoOf(n, s.itemInfo).kind !== 'item' || !!infoOf(n, s.itemInfo).trophy));
};
export const sellJunk = (g: Game, s: Session): Session => {
  const junk = junkOf(g, s);
  if (!junk.length) return s;
  const gold = junk.reduce((t, n) => t + SELL_PRICE[infoOf(n, s.itemInfo).grade], 0), purse = (s.characterGold ?? startGold(g)) + gold;
  return { ...s, inventory: (s.inventory || []).filter(n => !junk.includes(n)), characterGold: purse,
    log: [...s.log, `시스템: 안 쓰는 장비 ${junk.length}개를 팔았습니다 · 골드 +${gold} (보유 ${purse})`] };
};
// Which gear the hero can use, from who they started as (user 2026-11-20): the runaway mage gets staffs and robes, the
// knight and the adventurer weapons. A game without a start profile goes by the weapon in hand.
export type HeroPath = 'fighter' | 'caster' | 'both';
export const heroPath = (g: Game, s: Session): HeroPath => START_PROFILES[g.wizardStart || '']?.path ?? (isStaff(s.equipped?.weapon || '') ? 'caster' : 'fighter');
export const heroFits = (g: Game, s: Session) => { const path = heroPath(g, s); return path === 'both' ? () => true : fitsHero(path === 'caster'); };
// New gear goes on when it raises 전투력 (bestGear), as part of the state that brought it (a loot drop or a reward). Done in a
// side effect after the fact, the GM reply built from the earlier state overwrote it: the 흉갑 came off again, HP 108 → 100.
// Only empty slots were filled before: a [고급] 갑옷 stayed in the bag under a [일반] one all game (2026-11-20).
export const wearNew = (g: Game, s: Session, gained: string[]): Session =>
  s.mode === 'combat' || !gained.some(n => infoOf(n, s.itemInfo).kind !== 'item') ? s : bestGear(g, s);
// What a roll does (user 2026-11-26): it changes what comes next, never pays loot. A win's edge is the fight it leads into
// (fightEdge, bossEdge) or what comes back later; the dice pay no experience, gold, fame or gear (a broken lock had paid a
// [전설] weapon and fame +60, a roll's gold outran the quests'). A loss costs the body, or a person's trust when the failure
// is about them; never gold or things.
export type StakeKind = 'body' | 'person';
export type RollOutcome = { hp: number; person?: { name: string; by: number }; kind: StakeKind; label: string };
type RollCheck = { weight?: Weight; dc: number; success?: string; failure?: string; label?: string; person?: string };
const STAKE_PERSON = 10;
export const rollOutcome = (g: Game, s: Session, c: RollCheck, success: boolean, critical = ''): RollOutcome => {
  const text = (success ? c.success : c.failure) || '', big = critical ? 1.5 : 1;
  // Whose trust is at stake is the bookkeeper's reading (person); the trust words only for a check it didn't read.
  const person = c.person && (s.relationships || []).some(r => r.name === c.person) ? c.person : '';
  if (person) { const by = Math.round(STAKE_PERSON * big) * (success ? 1 : -1); return { hp: 0, person: { name: person, by }, kind: 'person', label: `${person} 호감도 ${by > 0 ? '+' : ''}${by}` }; }
  const hp = success ? 0 : Math.round(maxHpOf(g, s) * CHECK_HURT[c.weight || weightOf(c.dc) || 'normal'] * big);
  return { hp, kind: 'body', label: hp ? `HP -${hp}` : '' };
};
// The game keeps the clock (the writer copied "낮" into 48 of 52 headings): the day turns every few actions.
export const TIMES = ['아침', '낮', '저녁', '밤'] as const, ACTS_PER_TIME = 6;
export const timeOfDay = (s: Session) => TIMES[Math.floor(playerActs(s) / ACTS_PER_TIME) % TIMES.length];
