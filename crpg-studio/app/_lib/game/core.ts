// Game rules shared by the play screen: session shape, constants and pure helpers (no React).
// Moved out of app/page.tsx unchanged so the turn logic can be tested without the screen.
import { mainPrologue, mainChain } from '../prologues';
import { beatGoal, type Beat } from '../quest-beats';
import { TRAVEL_VERB } from '../travel';
import { REGION_QUESTS, type RegionQuest } from '../regional-quests';
import { EXTRA_REGION_QUESTS } from '../regional-quests-extra';
import GENRE_REF from '../../api/prompt/_lib/genre-reference.json';
import { mainSections } from '../../api/prompt/_lib/reference-builder';
import { GRADE_LABELS, KIND_LABELS, SKILLS, infoOf, gearOf, bonusText, skillText, enemyGear, gradeForTier, dropChance, rollGrade, rollSkill, randomGearKind, gearName, POTIONS, healShareOf, enemySkill, enemySkillText, type EnemySkill, type Grade, type ItemInfo, type ItemKind, type Equipped } from '../items';
import { foesOf, findFoe, trophyOf, foeImage, isFoeName, isDangerous, pickEncounter, ENCOUNTER_CHANCE, huntTarget, HUNT_CHANCE, foeInText, type Foe } from '../monsters';
import { POWER_TIERS, MAX_POWER, MAX_LEVEL, foeLevelRange, enemyStats, levelBonus, gainXp, xpToNext, earlyBoost, battleXp, questXp, mainQuestXp, deedXp, levelForTier, tierOfLevel, encounterLevel, companionStats } from '../progression';

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
  // / 은화 세 닢." Each "name: detail" part is an item; money (은화 세 닢, 은자 주머니, 현금 30만 원) is not.
  for (const m of prompt.matchAll(/시작 소지품\s*[:：]\s*([^\n]+)/g)) {
    for (const part of m[1].split(/\s+\/\s+/)) {
      const [rawName, ...rest] = part.split(/\s*[:：]\s*/);
      const name = (rawName || '').trim().replace(/[.。]+$/, '');
      if (!name || name.length > 40 || /^(은화|금화|동화|은자|동전|현금)|주머니|꾸러미|\d+\s*(닢|냥|문|원)$|(닢|냥|문|원)$/.test(name) || result.some(x => x.name === name)) continue;
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
  wuxia: ['중원 전체 맵','낙양','구파일대 본산','사천·서역'],
  fantasy: ['판타지 세계 지도','레븐홀트','사레타','아스테라'],
  modern: ['신해시 전체 맵','신해시 중앙구','신해 구도심','신해 항만 산업단지']
};
// Places inside a city (its detail-map pins and the prompt's city locations) point to that city, so a scene heading
// like 【북문 초소 · 낮】 puts the player at 레븐홀트 on the world map. The longest matching place name wins.
export const GENRE_REF_KEY: Record<string, string> = { wuxia: '정통 무협', fantasy: '정통 판타지', modern: '현대 게이트·헌터' };
export const cityPlaceCache: Record<string, [string, string][]> = {};
export const cityPlaces = (genre: string): [string, string][] => cityPlaceCache[genre] ??= [
  ...(DEFAULT_MAP_PLACES[genre] || []).slice(1).flatMap((pins, k) => pins.map(([name]) => [name, DEFAULT_MAP_NAMES[genre]?.[k + 1] || ''] as [string, string])),
  ...((GENRE_REF as Record<string, { cities?: { name: string; locations: string[] }[] }>)[GENRE_REF_KEY[genre]]?.cities || [])
    .flatMap(c => c.locations.map(l => [l.replace(/^\{\w+\}\s*/, '').replace(/\(.*$/, '').trim(), c.name] as [string, string])),
  // A place with its own pin on the world map isn't inside a city: 회색 탑 폐허 counted as 레븐홀트, so its fight started there.
].filter(([name, city]) => name.length >= 2 && !!city && !(DEFAULT_MAP_PLACES[genre]?.[0] || []).some(([pin]) => pin === name)).sort((a, b) => b[0].length - a[0].length);
export const cityOfPlace = (genre: string, heading: string) => cityPlaces(genre).find(([name]) => heading.includes(name))?.[1];
// A game's prompt is assembled once, when the game is made, so it keeps the story text of that day. When the story
// has been rewritten since, its sections (메인 사건, 게임 목표, 첫 사건 계기) are swapped for the current text.
export const replaceSection = (prompt: string, title: string, body: string) => prompt.replace(new RegExp(`(# \\[${title}\\]\\n)[\\s\\S]*?(?=\\n\\n# \\[|$)`), (_, head: string) => head + body);
export const refreshMainPrompt = (g: Game, text?: string) => {
  if (!text || !g.wizardMain || !text.includes('# [메인 사건]')) return text;
  const m = mainSections(g.wizardWorld || '', g.wizardMain, g.finalGoalMode);
  if (!m) return text;
  const next = replaceSection(replaceSection(text, '메인 사건', m.main), '게임 목표', m.goal).replace(/첫 사건 계기: .*/, () => `첫 사건 계기: ${m.hook}`);
  return next.length <= PROMPT_LIMIT ? next : text;
};
export function defaultMapGenre(game: Game): string {
  const world = [game.wizardWorld,game.genre,game.world].filter(Boolean).join(' ').toLowerCase();
  if (/현대\s*판타지|헌터|게이트/.test(world)) return 'modern';
  if (/무협|무림|강호/.test(world)) return 'wuxia';
  return 'fantasy';
}
// Hand-authored normalized coordinates for the 12 supplied maps. No image-analysis API call.
// Each entry is [label, x%, y%]; markers remain fully editable by the creator.
export const DEFAULT_MAP_PLACES: Record<string, [string,number,number][][]> = {
  wuxia: [
    [["천마신교",19.1398781920205,4.582530762237253],["곤륜파",13.181109713957282,17.739904701643024],["공동파",25,27],["점창파",16.018618966622014,72.06710636568118],["사천당가",23.67989204375135,60.8196747237942],["청성파",30.0642854809152,51.69440752265163],["아미파",16.586123674753132,48.298952966187365],["용문석굴",42,72],["폐사찰",59.29061840043657,71.85489847033357],["성도",30,60],["항주",75,72],["낙양",53.47372967140384,42.56913319757005],["진하 표국",66.24251654573152,51.90662966587729],["하오문",72.05940527476426,42.78134821685669],["소림사",59.00686842770282,26.016311825639026],["화산파",44.25183174423887,25.591881787065745],["종남파",38.43493348987891,34.92937113143397],["하북팽가",54.18310936590183,7.553548156189229],["북망산 고분",76.31567391642497,4.794745781523893],["제갈세가",81.28131272725645,24.53080669063255],["남궁세가",81,42],["장강수로채",83,65]],
    [["낙양 황성",49,24],["교류시장",44,50],["하오문",65,51],["대리시",71,34],["귀족 거주구",31,36],["상인 거리",33,60],["장강수로채",65,72],["천련대",16,64],["백마사",24,14],["낙양 동문",88,49],["대운하 나루터",84,78],["화청원",22,81],["태학",78,17],["천문대",60,8]],
    [["공동파",19,28],["화산파",46,15],["소림사",75,20],["종남파",48,49],["제갈세가",14,66],["하북팽가",76,75],["구파일대 회맹대",42,77],["공동산 정상",23,13],["연화대",58,26],["대웅보전",84,16]],
    [["천마신교",25,20],["흑염곡",44,30],["혈석관",49,16],["서역 관문",57,8],["사막 오아시스",13,28],["청해진",48,54],["아미파",71,22],["청성파",87,32],["사천당가",65,58],["점창파",83,73],["은남",55,85],["감숙관",31,62]],
  ],
  fantasy: [
    [["사레타",21.69,37.05],["레븐홀트",61.99,54.46],["아스테라",57.73,27.08],["검은 문 관리지",15.88,20.08],["금지된 상회 본거지",40.99,19.23],["마탑 본부",55.46,10.11],["태양교단 총본산",70.5,18.16],["심연의 사도 성역",88,15],["옛 왕조 지하 묘지",81.57,30.9],["그림우드",94.48,46.6],["회색 탑 폐허",76.46,51.91],["은염 숲",28.93,61.24],["철망치 씨족 본거지",47.8,68.04],["해신의 섬",80,86.29],["그림자 숲의 거점",42.97,38.56],["변경백가 영지",78.16,70.59],["산호 동굴 해안",12.76,55.73],["가라앉은 등대",7.79,70.38]],
    [["변경왕 성채",49.784970500537845,14.981102326977688],["진흙 골목",31.908665066348192,20.710922095594995],["천공 전망대",82.7000625909252,9.039060415134722],["성문 앞 장터",14.457989353922773,31.746138718195354],["변경병 성채",35,39],["마탑 출장소",55.601859229570586,41.93248813971013],["귀족 구역",78.01817375282747,36.83931342895274],["북문 초소",12.471734782122903,54.24100200196934],["변경백 상재",34.320544597248684,61.66854904881879],["대장간",64,78],["남문",87,71]],
    [["파도의 성소",40.988692769809894,11.585647770513418],["상인 주거지",24.956771683716845,25.80409680635239],["항구 관측소",74.47129433099198,12.434507847659978],["창신로 시장",42.83307235524289,28.775114200304365],["소금 골목",63.546887042097275,25.379666767779106],["모험가 길드 사레타 지부",15.734868993888265,42.99356323614333],["항구 선창",57.30436859130032,60.8196747237942],["7번 부두",86.38882176179119,54.877639935890244],["산호 동굴 해안",25.524271629184348,73.55261862462669],["가라앉은 등대",84.40257195265494,82.89010796899491]],
    [["마탑 본탑",32.33429478811243,17.315474663069743],["왕궁",53.189979698670086,17.952119720929662],["귀족가 주거지",72.76878496926224,13.283375048745553],["마을 본탑",26.801151269149837,41.295843081850215],["왕도 대시장",53.189979698670086,45.96458775403432],["대신전",79,40],["왕궁 외성",25.38239664281747,67.18615379814946],["왕도 항구",73.052534941996,67.18615379814946],["밀동네",92.3475902398544,55.938722156262465]],
  ],
  // Order must match DEFAULT_MAP_NAMES.modern and modern-{0..3}.png: 전체 맵, 중앙구, 구도심, 항만.
  modern: [
    [['신해 구도심',26,51],['신해시 중앙구',51,49],['신해 항만 산업단지',75,58],['신해 대학교',26,75],['신해 국제공항',57,80],['북부 산악지대',49,12],['서부 신도시',35,28],['폐쇄구역',77,19],['구 국립연구소',91,32],['동해 섬 지역',91,78]],
    [['관리국 신해지부',22,27],['백야 타워',54,20],['신해 마정석 거래소',73,37],['강변 먹자골목',72,58],['중앙공원 상설 게이트',32,82]],
    [['고물상 겸 마정석 매입소',13,35],['등불 길드 사무실',51,21],['폐교 체육관 경매',79,17],['포장마차 거리',62,50],['구도심 게이트',85,8]],
    [['관리국 항만 검역소',70,20],['해신 길드 물류센터',55,31],['항만 마정석 하역장',26,43],['컨테이너 야적장',65,61],['해상 게이트',40,78]]
  ]
};
// Only the overview map is loaded by default; the detail maps stay available for backfilling older saves.
export function presetMaps(genre:string): BoardMap[] { return rawPresetMaps(genre).slice(0, 1); }
// Portals the short-lived auto-linking added (id "<map>-to-<target>") are removed from saved games.
export const withoutAutoPortals = (maps: BoardMap[]): BoardMap[] => maps.map(m => m.pins.some(p => p.kind === 'exit' && p.id === `${m.id}-to-${p.targetMapId}`) ? { ...m, pins: m.pins.filter(p => !(p.kind === 'exit' && p.id === `${m.id}-to-${p.targetMapId}`)) } : m);
// Default places a built-in map is missing (deleted, or the save predates them), by name, at their default spots.
export function missingDefaultPins(m: BoardMap): MapPin[] {
  const match=/^\/api\/default-map\/(wuxia|fantasy|modern)\/([0-3])$/.exec(m.image);
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
export const DEFAULT_PLAYER_MARKERS: Record<string,string> = {wuxia:'/api/default-player-marker/wuxia',modern:'/api/default-player-marker/modern',fantasy:'/api/default-player-marker/fantasy'};
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
 const genre=[game.wizardType,game.wizardWorld,game.genre,game.gameType,game.prompt].join(' ').toLowerCase();
 if(/연애|로맨스|일상|학교|캠퍼스/.test(genre))return ['지인','친구','동료','호감','연인','라이벌','적대'];
 if(/무협|강호|무림|문파/.test(genre))return ['초면','지인','동료','사제','은인','라이벌','원수'];
 if(/전쟁|전략|정치|국가/.test(genre))return ['중립','동맹','부하','상관','협력','경쟁','적대'];
 if(/추리|미스터리|탐정/.test(genre))return ['초면','목격자','협력자','의뢰인','용의자','적대'];
 return ['초면','지인','친구','동료','동맹','라이벌','적대'];
};
export const characterPresets: Record<string, { fields: [string,string,'number'|'text'|'gauge',string,number?][]; slots: string[] }> = {
 fantasy:{fields:[['strength','근력','number','10'],['agility','민첩','number','10'],['intelligence','지능','number','10'],['mana','마나','number','30'],['realm','성장 단계','text','견습 검사']],slots:['무기','방어구','보조 장비','장신구']},
 modern:{fields:[['strength','근력','number','10'],['agility','민첩','number','10'],['awakening','각성 등급','text','F급'],['mana','마력','number','100']],slots:['무기','방어구','장신구']},
 survival:{fields:[['stamina','스태미나','gauge','100',100],['hunger','배고픔','gauge','100',100],['thirst','갈증','gauge','100',100],['temperature','체온','number','37']],slots:['도구','방어구','가방']},
 wuxia:{fields:[['internal','내공','number','100'],['external','외공','number','10'],['agility','경공','number','10'],['insight','오성','number','10'],['realm','경지','text','삼류']],slots:['무기','의복','비급','장신구']},
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
 if(/무협|무림|문파|강호/.test(context))return add([field('internal','내공','100','number'),field('realm','경지','삼류','text')],true,true);
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
// Hide GM-only flag identifiers in player-facing goal text without altering stored rules.
export const displayGoal = (value:string) => value
 .replace(/\s*[（(]\s*['"‘“]?[^()（）\n]*?(?:대사건|플래그|flag|FLAG)\s*[:：][^()（）\n]*?['"’”]?\s*[)）]/g, '')
 .replace(/\s+([.!?。])/g, '$1')
 .trim();
export const getGameGoal = (game:{promptDrafts?:PromptDrafts;prompt?:string;compressedPrompt?:string}) => {
 const text=game.prompt||game.compressedPrompt||'';
 const match=text.match(/(?:^|\n)\s*#{0,6}\s*\[(?:게임의 )?최종 목표(?:와 결말)?\]\s*\n([\s\S]*?)(?=\n\s*#{0,6}\s*\[[^\]]+\]|$)/);
 const storyGoal=text.match(/(?:^|\n)\s*#{1,6}\s*\[게임 목표\]\s*\n([^\n]+)/)?.[1]?.trim()||'';
 const raw=(storyGoal||match?.[1]||draftText(game.promptDrafts?.goal)||'').trim();
 if(!raw)return '';
 const lines=raw.split('\n').map(x=>x.replace(/^\s*[-*\d.)]+\s*/, '').trim()).filter(Boolean);
 const instruction=/설계|작성|제시|명시|포함|설정하|정의하|구성하|연결하|나열|측정 가능|달성 조건을|결말을|엔딩 후|NPC나 사건|앞에서 확정|플레이어가.*해야 한다/;
 const explicit=lines.find(x=>/^(?:목표 요약|한줄 목표|핵심 목표|최종 목표)\s*[:：]/.test(x));
 const candidate=explicit?.replace(/^[^:：]+[:：]\s*/, '')||lines.find(x=>!instruction.test(x));
 return candidate&&!instruction.test(candidate)?displayGoal(candidate).slice(0,140):'주요 사건의 진상을 밝히고 결말을 결정한다. 자세한 목표는 이야기 속 단서를 통해 드러납니다.';
};
export const DEFAULT_PROLOGUES: Record<string,{title:string;text:string}> = {
 wuxia:{title:'낙양, 강호의 그림자',text:`해가 서산에 걸리자 낙양의 성문은 붉은 노을로 물들었다. 사방에서 몰려든 상인과 무림인들로 거리는 여전히 붐볐고, 주루의 등불 아래에서는 온갖 소문이 오갔다. 누군가는 명문정파의 새로운 협객을 이야기했고, 누군가는 이름 없는 무인들이 하룻밤 사이 사라졌다고 수군거렸다.

그러나 오늘 낙양을 뒤덮은 것은 단순한 강호의 소란이 아니었다. 며칠 전부터 정체 모를 열병이 퍼지고 있었다. 의원들은 원인을 찾지 못했고, 관아는 소문이 번지는 것을 막으려 했다. 사람들은 병을 두려워하면서도 그 뒤에 숨은 누군가의 의도를 의심하기 시작했다.

성문 안쪽, 짐수레가 멈춰 선 거리 너머에서 급한 종소리가 울렸다. 누군가 도움을 청하고 있었다. 아직 사건의 진상은 드러나지 않았다. 낙양에서 펼쳐질 이야기는 이제부터 시작된다.`},
 fantasy:{title:'사레타, 파도 아래 잠든 비밀',text:`푸른 바다가 햇빛을 반사하는 사레타 항구. 거대한 범선들이 선창을 메우고, 뱃사람과 상인, 모험가들이 좁은 부두를 오간다. 소금기 섞인 바람에는 향신료와 젖은 밧줄 냄새가 뒤섞여 있다. 먼 나라에서 온 화물과 소문이 모이는 이곳에서는 하루에도 수십 가지 의뢰가 생겨난다.

최근 항구에서는 이상한 이야기가 돌고 있다. 잔잔한 바다에서 상회의 배 한 척이 이유도 없이 가라앉았다는 것이다. 상인들은 입을 다물고, 선원들은 밤바다로 나가는 일을 꺼린다.

오늘도 모험가 길드 사레타 지부의 게시판에는 새 의뢰서가 붙었다. 파도 소리 너머로 종이 울리고, 항구에서는 또 한 척의 배가 출항을 준비한다. 무엇을 믿고 어디서부터 조사할지는 아직 정해지지 않았다.`},
 modern:{title:'신해시 구도심, 균열의 밤',text:`해가 저문 신해시 구도심. 낡은 상가와 오래된 주택 사이로 가로등이 켜지고, 골목에는 저녁 장사를 마치는 사람들의 발소리가 이어진다. 언덕 아래로는 익숙한 간판과 전깃줄이 얽혀 있고, 강 건너 중앙구의 초고층 빌딩들은 눈부신 빛을 뿜어낸다.

게이트와 각성자가 존재하는 세상에서도 이 동네의 일상은 크게 달라지지 않은 듯 보인다. 그러나 최근 구도심 일대에서 작은 마력 이상 현상이 잇따라 보고되고 있다. 폐건물 주변의 푸른 잔광, 갑자기 끊기는 통신, 그리고 정체를 알 수 없는 야간 출입자들. 관리국은 공식 발표를 미루고 있다.

그때 골목 끝에서 짧은 경보음이 울린다. 폐쇄된 건물 담장 너머로 희미한 푸른빛이 번졌다 사라진다. 평범한 저녁이 끝나고, 신해시 구도심의 새로운 사건이 시작되려 하고 있다.`}
};
export const defaultPrologueImage=(g:Game)=>`/api/default-prologue/${defaultMapGenre(g)}`;
// The opening follows the game's chosen main story; the genre default is only for games made before main stories existed.
export const prologueText=(g:Game)=>mainPrologue(g.wizardMain)?.text || DEFAULT_PROLOGUES[defaultMapGenre(g)].text;
// The opening is fixed to the genre default; per-game edits are no longer offered.
export const prologueTitle=(g:Game)=>mainPrologue(g.wizardMain)?.title || DEFAULT_PROLOGUES[defaultMapGenre(g)].title;
// A story set in another city opens on that city's background when one ships with the genre.
export const prologueImage=(g:Game)=>{ const city=mainPrologue(g.wizardMain)?.city; const file=city?DEFAULT_PLACE_BACKGROUNDS[defaultMapGenre(g)]?.[city]:undefined; return file&&city!=='사레타'?`/api/default-background/${defaultMapGenre(g)}/${file}`:defaultPrologueImage(g); };
// Built-in place backgrounds (public/_default_backgrounds/<genre>/<file>.png), matched by pin name.
// wuxia/modern folders are ready; add entries here once their images are in.
export const DEFAULT_PLACE_BACKGROUNDS: Record<string, Record<string,string>> = {
  fantasy: {'사레타':'saretta','레븐홀트':'ravenholt','아스테라':'astera','검은 문 관리지':'black-gate','금지된 상회 본거지':'forbidden-guild','마탑 본부':'mage-tower','태양교단 총본산':'sun-temple','심연의 사도 성역':'abyss-sanctum','옛 왕조 지하 묘지':'old-catacombs','그림우드':'grimwood','회색 탑 폐허':'grey-tower-ruins','은염 숲':'silverleaf-forest','철망치 씨족 본거지':'ironhammer-hold','해신의 섬':'sea-god-isle','그림자 숲의 거점':'shadow-outpost','변경백가 영지':'margrave-estate','산호 동굴 해안':'coral-caves','가라앉은 등대':'sunken-lighthouse'},
  wuxia: {},
  modern: {}
};
// The pin's own upload wins; otherwise the genre's built-in art for that place, else the prologue image.
export function placeBackground(g: Game, pin?: MapPin): string {
  if (pin?.background) return pin.background;
  const genre = defaultMapGenre(g);
  const file = pin && DEFAULT_PLACE_BACKGROUNDS[genre]?.[pin.name.trim()];
  return file ? `/api/default-background/${genre}/${file}` : prologueImage(g);
}
export type Game = { npcPortraits?:NpcPortrait[]; npcStyle?:string; finalGoalMode?: 'single' | 'progress'; finalGoalSteps?: string[]; prologue?: string; prologueTitle?:string; prologueImage?:string; profileDone?: boolean; promptDone?: boolean; mapDone?: boolean; assetsDone?: boolean; settingsDone?: boolean; wizardType?: string; wizardWorld?: string; wizardStage?: number; wizardMain?: string; wizardMainDraw?: string[]; wizardStart?: string; wizardBasePrompt?: string; playerMarker?: string; playerPortrait?: string; customPromptSections?: CustomPromptSection[]; removedPromptSections?: string[]; promptDrafts?: PromptDrafts; compressedPrompt?: string; characterConfig?: CharacterConfig; showHpBar?: boolean; showEquipment?: boolean; showDice?: boolean; startingEquipment?: string; maps?: BoardMap[]; startMapId?: string; startPinId?: string; registrationDescription?: string; genre?: string; gameType?: string; cooperation?: string; progression?: string; playTime?: string; hashtags?: string[]; audience?: string; playMode?: 'single' | 'multi'; minPlayers?: number; maxPlayers?: number; imageRows?: ImageRow[]; imageColumns?: ImageColumn[]; imageCells?: ImageCell[]; prompt?: string; mapImage?: string; assets?: Asset[]; id: string; name: string; description: string; world: string; rules: string; gm: string; hp: number; size: number; created: number; cover?: string };
// foeBleed/foeBleedTurns/foePoison: the player's 출혈 and 독 still working on the foe.
export type CombatState = { openCut?: number; castGauge?: number; foeBleed?: number; foeBleedTurns?: number; foePoison?: number; level?: number; boss?: boolean; enemyAtk?: number; enemySkill?: EnemySkill; enemyShield?: number; shield?: number; lethal?: boolean; monster?: boolean; foeDesc?: string; power?: number; npc: string; enemyHp: number; enemyMaxHp: number; enemyDc: number; enemyDamage: number; round: number; itemUse?: string; lastDealt?: number; lastTaken?: number; last?: { allies?: string[]; dealt: number; critDealt: boolean; taken: number | null; critTaken: boolean }; totalDealt?: number; totalTaken?: number; result?: 'win' | 'lose' };
export type DiceCheck = { ability: string; label: string; dc: number; weight?: Weight; reason: string; action: string; success?: string; failure?: string; back?: string[] };
export type DiceResult = { ability: string; label: string; dc: number; weight?: Weight; die: number; modifier: number; total: number; success: boolean; critical: string; onSuccess?: string; onFailure?: string };
// A roll in the last few actions: the GM is told not to ask for another one right away.
export const rolledRecently = (s: Session) => { const acts = s.log.map((e, i) => e.startsWith('플레이어:') ? i : -1).filter(i => i >= 0); return s.log.slice(acts.length >= 3 ? acts[acts.length - 3] : 0).some(e => e.startsWith('주사위:')); };
// An action typed during a talk that walks away from it, rather than something said.
export const LEAVING = /(?:으로|로|에|을|를|서)\s+(?:\S+\s+){0,4}?(?:간다|향한다|나선다|떠난다|들어간다|나간다|출발한다|돌아간다|따라간다|뒤쫓는다|추적한다|조사한다|살핀다|뒤진다)\.?$/;
// memory: rolling long-term summary of log[0..upTo); the GM sees it plus the unsummarized recent entries.
// pinned: key facts that are only ever appended to, never rewritten by the summary.
export type StoryMemory = { summary: string; upTo: number; pinned?: string[] };
// directorNotes: the major model's notes on recent scenes (/api/gm/director); upTo is the log length reviewed, at when they were made.
// hooks: choices the director prepared with what happens when one is picked (at: this place, or a place next door); place: where they were made.
export type StoryHook = { at: string; choice: string; event: string };
// threads: side stories started in free play and not finished yet, rewritten on each review.
// consequences: things the player did that the world hasn't answered yet; the writer brings one in when it fits the scene.
// goals: personal goals the story itself gave the player, added to the quest list on the next action.
export type DirectorNotes = { fixes: string[]; upTo: number; at: number; hooks?: StoryHook[]; place?: string; threads?: string[]; consequences?: string[]; goals?: string[] };
// mana: current mana (max: maxManaOf); unset means full. talkAccept: the line that wraps up this talk.
// talkEnded: the talk has finished and stays on screen until the player presses 대화 끝내기.
// npcCards: the director's setting line for people the GM made up in play (role, place, personality, looks).
// placeSeeds: the director's sketch per place (who is there, what is going on), made in the background before the player arrives.
// talkNext: the action an ended talk settled; 대화 끝내기 plays it. talkChoices: the ways on the talk offered instead (the partner set what to do; the player picks). typed: this action was written by the player, not one of the offered choices.
// talkPurpose: the scene stopped where the player meets someone to talk; choosing 대화하기 opens the talk with that action as its purpose.
// focus/focusAt: the current goal the game picked last, and the log length then (see currentGoalOf).
// storyPlan: the record keeper's blueprint (the hero's want, the people tied to them); written at game start.
// act: which act of the outline the story is in (the director says so; it never goes back).
// runId: one playthrough. A new game keeps the gameId and the same prologue, so background jobs (story memory, director, NPC
// memory) still running from the previous playthrough wrote into the new one: 에드리아 spoke of a wolf test it never gave.
export type Session = { storyNpcs?: { goal: string; names: string[] }; runId?: string; typed?: boolean; talkNext?: string; talkChoices?: string[]; talkPurpose?: { npc: string; action: string }; act?: number; storyPlan?: string; focus?: string; focusAt?: number; placeSeedsV?: number; placeSeeds?: Record<string, string>; npcCards?: Record<string, string>; directorNotes?: DirectorNotes; metNpcs?: string[]; clashed?: Record<string, number>; talkEnded?: boolean; talkAccept?: string; mana?: number; recentFoes?: string[]; scenePlace?: string; lastEventXp?: number; revivals?: number; itemInfo?: Record<string, ItemInfo>; equipped?: Equipped; lastInterference?: number; training?: Record<string, number>; threat?: Threat; ambushNext?: Threat; dead?: boolean; memory?: StoryMemory; npcVoices?: Record<string, string>; npcNotes?: Record<string, string>; quests?: string[]; questGivers?: Record<string, string>; inviteRefusals?: Record<string, number>; npcCombat?: Record<string, { hp: number; dc: number; damage: number; power?: number }>; level?: number; xp?: number; npcPower?: Record<string, number>; companions?: Record<string, { level: number; xp: number }>; reputation?: number; party?: string[];completedGoalSteps?: number[]; currentGoal?: string; goalCompleted?: boolean; relationships?: Relationship[]; suggestedActions?: string[]; pendingCheck?: DiceCheck | null; lastCheck?: DiceResult | null; characterValues?: Record<string,string>; characterEquipment?: Record<string,string>; characterGold?: number; mapId?: string; pinId?: string; gameId: string; x: number; y: number; hp: number; roll: number | null; log: string[]; inventory?: string[]; flags?: string[]; triggeredEvents?: string[]; activeImageKey?: string; sceneNpcs?: string[]; handledNpcs?: string[]; mode?: 'talk' | 'combat'; talkNpc?: string; combat?: CombatState | null; travel?: {mapId:string; destinationId:string; remaining:number; total:number} };
export type View = 'library' | 'edit' | 'play';
export type Tab = 'prompt' | 'map' | 'assets' | 'settings' | 'register';
export const initial: Game = { finalGoalMode:'single',finalGoalSteps:[],characterConfig: defaultCharacterConfig(), showHpBar: true, showEquipment: true, showDice: true, startingEquipment: '낡은 검, 가죽 갑옷, 회복 물약', playMode: 'single', minPlayers: 2, maxPlayers: 4, id: 'sample', name: '잊혀진 던전', description: '고대 유적을 탐험하는 판타지 TRPG', world: '고대 왕국의 유적이 발견되었다. 플레이어는 유적을 탐험하는 모험가다.', rules: 'D20 판정. 10 이상 보통 성공, 15 이상 어려운 성공. 같은 맵 안에서는 장소를 자유롭게 선택하고 다른 맵으로는 포탈을 통해 이동한다. 전투 및 아이템 사용은 추후 규칙 모듈로 확장.', gm: '몰입감 있는 한국어 판타지 TRPG GM. 플레이어의 행동을 임의로 확정하지 말고 결과를 설명한다.', hp: 100, size: 7, created: 0, prompt: '고대 왕국의 유적이 발견되었다. 플레이어는 유적을 탐험하는 모험가다.\nD20 판정을 사용한다.\nGM은 플레이어의 행동을 임의로 확정하지 않는다.', assets: [], imageRows: [], imageColumns: [], imageCells: [], mapImage: '', registrationDescription: '', genre: 'RPG / 탐험', gameType: 'RPG / 탐험', cooperation: '협동', progression: '턴제', playTime: '장기 캠페인', hashtags: [], audience: '전체 이용가' };
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
export const PLACE_SEEDS_V = 3;
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
export const AWAKEN_LEVELS = 5;
export const BLESSING: Record<string, { name: string; desc: string; skill: string }> = {
  fantasy: { name: '여신의 축복 부적', desc: '쓰러진 순간 내려온 신의 빛이 깃든 부적.', skill: '신의 가호' },
  wuxia: { name: '천신의 옥패', desc: '죽음의 문턱에서 깨달음과 함께 손에 쥐어진 옥패.', skill: '천신강림' },
  modern: { name: '각성의 결정', desc: '쓰러진 순간 2차 각성과 함께 몸에서 맺힌 결정.', skill: '2차 각성' },
};
// Grouped log items drawn at once in the story panel.
export const LOG_PAGE = 200;
// Hostile factions interfere with the player at random, never two scenes in a row.
export const INTERFERE_GAP = 5;
export const INTERFERE_CHANCE = 0.35;
// The line that opens a talk with name; saves from before the particle fix wrote it with 와(과).
export const isTalkStart = (e: string, name: string) => e === `시스템: ${name}${josa(name, '와')} 대화를 시작했습니다.` || e === `시스템: ${name}와(과) 대화를 시작했습니다.`;
export const talkStartIndex = (log: string[], name: string) => { for (let i = log.length - 1; i >= 0; i--) if (isTalkStart(log[i], name)) return i; return -1; };
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
// Finishing a quest pays out without waiting on the GM: reputation, a purse of gold, plus goodwill from whoever asked for it.
export const QUEST_REPUTATION = 150, QUEST_AFFECTION = 10, QUEST_GOLD = 50;
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
const CHECK_STAKES: Record<Weight, Stake> = {
  small: { xp: 0.08, gold: 0, rep: 0, gear: null, hurt: 0.05 }, normal: { xp: 0.15, gold: 5, rep: 20, gear: null, hurt: 0.1 },
  big: { xp: 0.35, gold: 15, rep: 60, gear: 'side', hurt: 0.18 }, decisive: { xp: 0.6, gold: 30, rep: 150, gear: 'event', hurt: 0.28 },
};
const QUEST_STAKES: Record<Weight, Stake> = {
  small: { xp: 0.2, gold: 5, rep: 20, gear: null, hurt: 0 }, normal: { xp: 0.5, gold: 15, rep: 80, gear: 'side', hurt: 0 },
  big: { xp: 0.8, gold: 25, rep: 150, gear: 'side', hurt: 0 }, decisive: { xp: 1.2, gold: 50, rep: 300, gear: 'main', hurt: 0 },
};
const payOf = (s: Stake, level: number, maxHp: number) => ({ xp: Math.round(xpToNext(Math.max(1, level)) * s.xp * earlyBoost(level)), gold: s.gold * (Math.max(1, level) + 1), rep: s.rep, gear: s.gear, hurt: Math.round(maxHp * s.hurt) });
export const checkStakes = (w: Weight, level: number, maxHp: number) => payOf(CHECK_STAKES[w], level, maxHp);
export const questStakes = (w: Weight, level: number) => payOf(QUEST_STAKES[w], level, 0);
// A goal's weight from where it came from: a main story step (the step that closes an act is the turning point), a region
// story or board job, or something play turned up ("근무 절차 확인하기" paid the same as the entrance exam).
export const questWeight = (g: Game, q: string): Weight => {
  const step = (mainChain(g.wizardMain) || []).find(x => alikeQuest(x.q, q));
  if (step) return step.act ? 'decisive' : 'big';
  const first = mainPrologue(g.wizardMain)?.firstQuest;
  if (first && alikeQuest(first, q)) return 'big';
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
const mainSteps = (g: Game) => { const main = mainPrologue(g.wizardMain); return main ? [{ q: main.firstQuest, beats: main.firstBeats }, ...(main.questChain || [])] : []; };
const storySteps = (g: Game) => [...mainSteps(g), ...regionQuestsOf(g).flatMap(r => [{ q: r.title, beats: r.steps.flatMap(x => x.beats) }, ...r.steps])];
const stepOf = (g: Game, q: string) => q ? storySteps(g).find(x => alikeQuest(x.q, q)) : undefined;
export const goalPath = (g: Game, q: string): string[] => (stepOf(g, q)?.beats || []).map(b => `${beatGoal(b)} → ${b.then}`);
// Foes the story sets for its steps (do: 'defeat'): the current goal's are fought as written, and those of main steps not
// reached yet stay off stage until their step. Before, a Lv.2 player's improvised goal ("큰 그림자") met 다이어울프
// 우두머리, the act-1 finale foe, and 고블린 약탈대 from act 2.
export const storyFoes = (g: Game, s: Session) => {
  const foes = (beats: Beat[]) => beats.flatMap(b => b.do === 'defeat' ? [b.foe] : []);
  const steps = mainSteps(g);
  const seen = [...questsOf(s), ...s.log.flatMap(l => l.match(/^시스템: 목표 완료 — (.+?)(?: \(의뢰인 .*\))?$/)?.[1] || [])];
  const reached = Math.max(0, ...steps.map((st, i) => seen.some(q => alikeQuest(st.q, q)) ? i : 0));
  const now = foes(stepOf(g, currentGoalOf(s))?.beats || []);
  return { now, later: [...new Set(steps.slice(reached + 1).flatMap(st => foes(st.beats)))].filter(n => !now.includes(n)) };
};
// The level a foe is met at. The current goal's foe matches the player: the story puts it on that step, so its tier's
// minimum (Lv.10 for 다이어울프 우두머리) doesn't apply.
export const foeLevel = (g: Game, s: Session, foe: Foe) => storyFoes(g, s).now.includes(foe.name) ? Math.max(1, s.level || 1) : encounterLevel(foe.power, !!foe.boss, s.level || 1);
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
  const closing = (v: unknown) => [...new Set(strings(v).map(c => quests.find(q => q === c) || quests.find(q => alikeQuest(q, c)) || (c.length >= 6 ? quests.find(q => q.includes(c) || c.includes(q)) : '') || ''))].filter(q => q && !proposed.some(a => sameQuest(a, q)));
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
export const AFFECTION_MIN = -100, AFFECTION_MAX = 100, AFFECTION_STEP = 25;
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
  if (affection < -20) return 0;
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
export const genreCast = (g: Game, s: Session) => { const reserved = reservedNpcs(g, s); return ((GENRE_REF as Record<string, { npcs?: string[] }>)[GENRE_REF_KEY[defaultMapGenre(g)]]?.npcs || []).filter(t => !reserved.includes(t.replace(/^\[GM\]\s*/, '').split('(')[0].trim())); };
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
    return { name, inScene: stage.includes(name), ...((s.party || []).includes(name) ? { inParty: true } : {}),profile: [line, card].filter(Boolean).join(' | ').slice(0, 320), ...(s.npcNotes?.[name] ? { remembers: stage.includes(name) || (s.party || []).includes(name) ? s.npcNotes[name] : s.npcNotes[name].slice(0, 200) } : {}), speechStyle: s.npcVoices?.[name] || '', ...attitude };
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
export const FIGHT_INTENT = /(싸운다|맞서 싸|맞선다|공격한다|베어 넘|베어낸다|덤벼든다|덤빈다|휘두른다|맞받아친다|전투를 벌)/;
export const BEAST_SCENE = /(마물|늑대|괴물|짐승|야수|습격|덮치|돌진|달려들|으르렁|트롤|거미|고블린|해골|구울)/;
export const GENERIC_PLACE = /^(입구|광장|거리|마을|도시|근처|안쪽|바깥|가장자리)$/;
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
    ['사레타', '해신의 섬'], ['산호 동굴 해안', '가라앉는 등대'],
    ['그림자 숲의 거점', '은염 숲'], ['은염 숲', '철망치 씨족 본거지'], ['은염 숲', '산호 동굴 해안'],
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
export type Threat = { npc: string; monster: boolean; level?: number; lead?: string; fleeTo?: { mapId: string; pinId: string } };
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
export const CLASH_GAP = 8;
// Max HP grows with level on top of the game's base HP.
// The mana pool: the sheet's 마나 value (fantasy) grows 2 a level, plus what robes add; 0 when the sheet has no mana.
export const maxManaOf = (g: Game, s: Session) => { const field = (g.characterConfig || defaultCharacterConfig()).fields.find(f => f.id === 'mana'); if (!field) return 0; const base = Number(s.characterValues?.mana ?? field.initial) || 0; return base + 2 * ((s.level || 1) - 1) + gearOf(s.equipped, s.itemInfo).mana; };
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
export const growStats = (g: Game, s: Session, levels: number): { session: Session; note: string } => {
  const fields = growthFields(g);
  if (levels <= 0 || !fields.length) return { session: s, note: '' };
  const weights = fields.map(f => (s.training?.[f.id] || 0) + 0.5);
  const total = weights.reduce((a, b) => a + b, 0);
  const gains: Record<string, number> = {};
  const top = fields.filter(f => (s.training?.[f.id] || 0) > 0).sort((a, b) => (s.training?.[b.id] || 0) - (s.training?.[a.id] || 0))[0];
  // The most-used stat always gets half the points, so the "you used X a lot" note is never contradicted.
  const sure = top ? Math.ceil(levels * GROWTH_POINTS / 2) : 0;
  if (top) gains[top.id] = sure;
  for (let i = sure; i < levels * GROWTH_POINTS; i++) {
    let r = Math.random() * total, k = 0;
    while (k < fields.length - 1 && (r -= weights[k]) > 0) k++;
    gains[fields[k].id] = (gains[fields[k].id] || 0) + 1;
  }
  const values = { ...(s.characterValues || {}) };
  const parts: string[] = [];
  for (const field of fields) {
    const points = gains[field.id];
    if (!points) continue;
    const base = Number(field.initial) || 10;
    const step = base >= 30 ? Math.max(1, Math.round(base / 10)) : 1;
    values[field.id] = String((Number(values[field.id] ?? field.initial) || 0) + points * step);
    parts.push(`${field.name} +${points * step}`);
  }
  // Older habits fade by half each level so the build follows how the player plays now.
  const training = Object.fromEntries(Object.entries(s.training || {}).map(([k, v]) => [k, Math.floor(v / 2)]).filter(([, v]) => (v as number) > 0));
  return { session: { ...s, characterValues: values, training }, note: `성장: ${parts.join(', ')}${top ? ` (최근 ${top.name}${josa(top.name, '을')} 많이 썼습니다)` : ''}` };
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
  for (const ally of s.party || []) {
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
export const ALL_REGION_QUESTS = [...REGION_QUESTS, ...EXTRA_REGION_QUESTS];
export const regionQuestsOf = (g: Game) => ALL_REGION_QUESTS.filter(r => r.genre === defaultMapGenre(g));
// Where each story person is found, read from the story data (main steps of the acts reached, then the region stories): the writer had no
// place for anyone it hadn't met, so 에드리아 (북문 초소) turned up at 변경백가 영지 because her title says 변경백가.
export const npcWhereabouts = (g: Game, s: Session): Record<string, string> => {
  const main = mainPrologue(g.wizardMain), beats: Beat[] = [...(main?.firstBeats || [])], out: Record<string, string> = {};
  let act = 1;
  for (const step of main?.questChain || []) { if (act <= (s.act || 1)) beats.push(...step.beats); if (step.act) act = step.act + 1; }
  for (const b of [...beats, ...regionQuestsOf(g).flatMap(r => r.steps.flatMap(x => x.beats))]) if (b.do === 'talk' && b.at?.[0] && !out[b.npc]) out[b.npc] = b.at[0];
  return out;
};
export const regionWhere = (g: Game, s: Session) => { const map = (g.maps || []).find(m => m.id === s.mapId); const pin = map?.pins.find(p => p.id === s.pinId); return `${map?.name || ''} ${pin?.name || ''} ${s.scenePlace || ''}`; };
export const inRegion = (r: RegionQuest, where: string) => r.region.some(w => where.includes(w));
export const actsDone = (s: Session) => Math.max(0, (s.act || 1) - 1);
// The story as far as it has gone, for the GM: finished acts in full, the current act by its name only (what to do now
// comes from the quest beats), later acts not at all, and the progress goal up to the current act. With the whole
// outline in view the GM pulled the next quest into the scene (taking the player to 회색 탑 while the report to
// Edria at 북문 초소 was still due).
// Games built before still carry the old speech rules ("말투는 신분과 종족에 맞추고 현대 어휘는 쓰지 않는다",
// "총기·전기·현대 어휘와 상태창은 없다"); the modern-word ban and the rank-based speech hint go as the prompt is sent.
export const withoutOldSpeechRules = (prompt: string) => prompt.replace(/말투는 [^.\n]*현대 어휘는 쓰지 않는다\./g, '인물의 말투(어체)는 각자의 설정 말투를 따른다.').replace(/·현대 어휘와/g, '와');
export const promptUpToAct = (prompt: string, done: number) => prompt.split('\n').flatMap(line => {
  const act = line.match(/^(\s*-\s*)(\d)막\s+([^:：]+)[:：]/);
  if (act) { const n = Number(act[2]); return n <= done ? [line] : n === done + 1 ? [`${act[1]}${n}막 ${act[3].trim()}: 진행 중.`] : []; }
  if (/^\s*최종 목표\(진행도형\)[:：]/.test(line)) return [line.split('→').slice(0, done + 1).join('→').trim()];
  return [line];
}).join('\n');
export const playerActs = (s: Session) => s.log.filter(e => e.startsWith('플레이어:')).length;
export const regionOpen = (s: Session, r: RegionQuest) => Math.max(0, s.reputation || 0) >= RANK_FLOORS[r.minRank || 0] && actsDone(s) >= (r.minAct || 0);
// Cast members the main story brings in only at a later step (and the player hasn't met yet). Nothing may pull them in early:
// region stories they appear in stay shut, and the GM and the director use a new person for such a role instead
// (세라핀, central to act 3, would otherwise meet the player in 축일의 독배 at the start).
export const reservedNpcs = (g: Game, s: Session): string[] => {
  const acts = (g.prompt || '').split('\n').flatMap(l => { const m = l.match(/^\s*-\s*(\d)막\s/); return m ? [{ n: Number(m[1]), l }] : []; });
  if (!acts.length) return [];
  const cur = s.act || 1, now = acts.filter(a => a.n <= cur).map(a => a.l).join(' '), later = acts.filter(a => a.n > cur).map(a => a.l).join(' ');
  const cast = [...new Set([...(g.npcPortraits || []).map(n => n.name), ...(DEFAULT_NPC_NAMES[defaultMapGenre(g)] || [])])].filter(n => n.length >= 2);
  const seen = new Set([...(s.relationships || []).map(r => r.name), ...(s.metNpcs || [])]);
  return cast.filter(n => later.includes(n) && !now.includes(n) && !seen.has(n));
};
// An open region quest that brings in none of them.
export const regionFree = (g: Game, s: Session) => { const reserved = reservedNpcs(g, s); return (r: RegionQuest) => regionOpen(s, r) && !reserved.some(n => JSON.stringify(r).includes(n)); };
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
// Health comes back on its own too: HP_REGEN_TURN of the maximum each calm turn (not in a fight, nothing hurt the
// player this turn), so the player never has to go and rest just to heal.
export const HP_REGEN_TURN = 0.06;
// Why the player feels better, by where the calm turn was spent; cycled by how many HP notes the log already has, so
// back-to-back notes never repeat. Lines must fit anywhere in their group (a crypt is 'wild' too, so no streams).
export const REST_REASONS: Record<'talk' | 'town' | 'wild', string[]> = {
  talk: ['이야기를 나누는 사이 거칠던 숨이 가라앉아 몸이 조금 가벼워졌습니다', '말을 주고받으며 굳었던 어깨의 긴장이 풀렸습니다', '앉아서 이야기를 듣는 동안 다리에 다시 힘이 돌아왔습니다'],
  town: ['따뜻한 국물 한 모금에 기운이 조금 돌아왔습니다', '그늘에 잠시 앉아 물 한 모금을 마시며 숨을 돌렸습니다', '사람들 틈에서 걸음을 늦추자 쑤시던 상처가 조금 가라앉았습니다', '찬물로 얼굴을 씻자 정신이 맑아졌습니다'],
  wild: ['바위에 기대어 잠시 숨을 고르자 몸이 조금 가벼워졌습니다', '상처를 천으로 단단히 동여매자 피가 멎었습니다', '걸음을 늦추고 호흡을 가다듬자 욱신거림이 잦아들었습니다', '물통의 물로 목을 축이자 기운이 조금 돌아왔습니다'],
};
export const restReason = (where: 'talk' | 'town' | 'wild', turn: number) => { const list = REST_REASONS[where]; return list[turn % list.length]; };
export const spellScale = (level: number) => 0.7 + 0.5 * (Math.min(100, Math.max(1, level)) - 1) / 99;
// The player's combat numbers, shared by the battle and the character panel so what is shown is what is used.
// Weapon blows go with strength (외공 in wuxia), spells with intelligence; equipped items add to hit, damage and dodge.
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
export const autoBattleStep = (g: Game, s: Session): Session => {
  const c = s.combat;
  if (!c || c.result) return s;
  const { strength, agility, intellect, grow, gear, critFrom, maxHp } = combatStatsOf(g, s);
  const skill = (id: string) => gear.skills.filter(k => k.id === id).reduce((a, k) => a + k.value, 0);
  const skillName = (id: string) => gear.skills.find(k => k.id === id)?.name || '';
  const lines: string[] = [];
  let enemyHp = c.enemyHp, hp = s.hp, dealt = 0, taken = 0, countered = false, critTaken = false, critDealt = false;
  let shield = c.shield ?? skill('guard'), enemyShield = c.enemyShield || 0;
  // 출혈 and 독 keep working between rounds; 기절 and 가드 last only this round.
  let bleed = c.foeBleed || 0, bleedTurns = c.foeBleedTurns || 0, poison = c.foePoison || 0, stunned = false, parried = false;
  const foe = c.enemySkill, foeSkill = (id: string) => foe?.id === id ? foe.value : 0, foeLabel = foe ? SKILLS[foe.id].label : '';
  const maxMana = maxManaOf(g, s), caster = gear.caster && maxMana > 0;
  let mana = Math.min(maxMana, s.mana ?? maxMana), gauge = c.castGauge || 0;
  // weapon: a blow with the weapon; spell: a cast spell; poke: a caster out of mana jabbing with the staff.
  const strike = (extra: boolean, how: 'weapon' | 'spell' | 'poke' = 'weapon') => {
    if (!parried && skill('parry') && Math.random() * 100 < skill('parry')) { parried = true; lines.push(`[${skillName('parry')}] 가드 — 공격하며 자세를 잡았다`); }
    const die = d(20), spell = how === 'spell';
    const aim = spell ? intellect + grow.hit + gear.hit : how === 'poke' ? strength + grow.hit : strength + grow.hit + gear.hit;
    const target = spell ? Math.round(c.enemyDc * MAGIC_RESIST) : c.enemyDc;
    if (die >= critFrom || (die !== 1 && die + aim >= target)) {
      const base = spell ? Math.round((4.5 + Math.max(0, intellect) + grow.damage + gear.spell) * 2 * spellScale(s.level || 1) * (0.4 + Math.random() * 1.2))
        : how === 'poke' ? Math.max(1, d(4) + strength) : d(8) + Math.max(0, strength) + grow.damage + gear.damage;
      const swing = base * (die >= critFrom ? 2 : 1);
      const blocked = Math.min(enemyShield, swing); enemyShield -= blocked;
      const hit = swing - blocked;
      enemyHp = Math.max(0, enemyHp - hit); dealt += hit; critDealt = critDealt || die >= critFrom;
      lines.push(`${extra ? `[${skillName('double')}] 연타! ` : ''}${die >= critFrom ? '치명타! ' : ''}${spell ? '마법 명중' : '내 공격 명중'} — ${c.npc}에게 ${spell ? '마법' : '물리'} 피해 ${hit}${blocked ? ` (${c.npc}의 ${foeLabel}이 ${blocked} 막음)` : ''} · ${c.npc} ${enemyHp}/${c.enemyMaxHp}`);
      const thorn = Math.round(hit * foeSkill('thorns') / 100);
      if (thorn > 0) { hp = Math.max(c.lethal ? 0 : 1, hp - thorn); taken += thorn; lines.push(`${c.npc}의 ${foeLabel} — 나에게 ${thorn} 피해가 되돌아옴 · 내 HP ${hp}/${maxHp}`); }
      if (hit > 0 && skill('bleed')) { const fresh = !bleedTurns; bleed = skill('bleed'); bleedTurns = 3; if (fresh) lines.push(`[${skillName('bleed')}] 출혈 — ${c.npc}${josa(c.npc, '이')} 피를 흘린다 (3라운드, 매 라운드 ${bleed})`); }
      if (hit > 0 && skill('poison') && poison < 5) { poison += 1; lines.push(`[${skillName('poison')}] 독 — ${c.npc}에게 독 ${poison}중첩`); }
      if (hit > 0 && !stunned && skill('stun') && Math.random() * 100 < skill('stun')) { stunned = true; lines.push(`[${skillName('stun')}] 기절 — ${c.npc}${josa(c.npc, '이')} 비틀거린다`); }
      const healed = Math.min(maxHp - hp, Math.round(hit * skill('lifesteal') / 100));
      if (healed > 0) { hp += healed; lines.push(`[${skillName('lifesteal')}] 흡혈 — HP ${healed} 회복 · 내 HP ${hp}/${maxHp}`); }
    } else lines.push(`${extra ? `[${skillName('double')}] 연타 — ` : ''}${spell ? '마법이 빗나갔다' : '내 공격이 빗나갔다'} — ${c.npc}${josa(c.npc, '이')} 피했다`);
  };
  if (caster) {
    gauge += 100 + gear.haste;
    if (gauge < SPELL_GAUGE) lines.push(`마법 시전 중… ${Math.round(gauge / SPELL_GAUGE * 100)}%`);
    else if (mana >= SPELL_COST) { gauge -= SPELL_GAUGE; mana -= SPELL_COST; lines.push(`마법 발동! (마나 -${SPELL_COST} · ${mana}/${maxMana})`); strike(false, 'spell'); }
    else { gauge = SPELL_GAUGE; lines.push('마나가 부족하다 — 지팡이로 후려친다'); strike(false, 'poke'); }
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
      lines.push(`${again ? `${c.npc}의 ${foeLabel}! ` : ''}${counter >= foeCrit ? '치명타! ' : ''}${c.npc}의 반격 명중 — 나에게 ${got} 피해${absorbed ? ` ([${skillName('guard')}] 보호막이 ${absorbed} 막음)` : ''} · 내 HP ${hp}/${maxHp}`);
      const back = Math.round(raw * skill('thorns') / 100);
      if (back > 0 && enemyHp > 0) { enemyHp = Math.max(0, enemyHp - back); dealt += back; lines.push(`[${skillName('thorns')}] 가시 — ${c.npc}에게 ${back} 피해를 되돌려 줌 · ${c.npc} ${enemyHp}/${c.enemyMaxHp}`); }
      const drain = Math.min(c.enemyMaxHp - enemyHp, Math.round(got * foeSkill('lifesteal') / 100));
      if (drain > 0 && enemyHp > 0) { enemyHp += drain; lines.push(`${c.npc}의 ${foeLabel} — ${drain} 회복 · ${c.npc} ${enemyHp}/${c.enemyMaxHp}`); }
    } else lines.push(`${again ? `${c.npc}의 ${foeLabel} — ` : ''}${c.npc}의 반격을 피했다`);
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
  if (maxMana > 0) mana = Math.min(maxMana, mana + Math.max(1, Math.round(maxMana * MANA_REGEN_ROUND)));
  const round = c.round + 1;
  // A stalemate is settled by whoever has more health left.
  const knockedOut = !c.lethal && hp <= 1 && taken > 0;
  const result: CombatState['result'] = enemyHp <= 0 ? 'win' : hp <= 0 || knockedOut ? 'lose' : round > AUTO_BATTLE_LIMIT ? (enemyHp / c.enemyMaxHp < hp / Math.max(1, maxHp) ? 'win' : 'lose') : undefined;
  if (result) lines.push(result === 'win' ? `승리 — ${c.npc}${josa(c.npc, '을')} 쓰러뜨렸다` : knockedOut ? `패배 — ${c.npc}에게 쓰러져 빈사 상태가 됐다 (HP 1)` : `패배 — ${c.npc}에게 쓰러졌다`);
  return { ...s, hp, ...(maxMana > 0 ? { mana } : {}), combat: { ...c, castGauge: caster ? gauge : undefined, enemyHp, shield, enemyShield, foeBleed: bleed, foeBleedTurns: bleedTurns, foePoison: poison, round, lastDealt: dealt, lastTaken: taken, last: { allies: allyHits, dealt, critDealt: critDealt && dealt > 0, taken: countered ? taken : null, critTaken: critTaken && taken > 0 }, totalDealt: (c.totalDealt || 0) + dealt, totalTaken: (c.totalTaken || 0) + taken, result }, log: [...s.log, ...lines.map(l => `전투: ${l}`)] };
};
// A check rolled just before a fight changes the fight itself, whatever the narration said: the GM's text alone left no visible difference.
// openCut is a share of the foe's health, taken in startCombat because that's where its real health is settled.
export const fightEdge = (g: Game, s: Session, foe: string): { openCut: number; hp: number; log: string[]; note: string } => {
  const c = s.lastCheck;
  if (!c) return { openCut: 0, hp: s.hp, log: [], note: '' };
  if (c.success) {
    const openCut = c.critical ? 0.35 : 0.2;
    return { openCut, hp: s.hp, log: [`시스템: 판정 ${c.critical || '성공'} — 선제 타격! ${foe}의 체력 -${openCut * 100}%`], note: ` 플레이어가 판정에 성공해 먼저 일격을 넣었으니 ${foe}${josa(foe, '은')} 이미 다친 채 싸움을 시작합니다.` };
  }
  const hp = Math.max(1, s.hp - Math.max(1, Math.round(maxHpOf(g, s) * (c.critical ? 0.2 : 0.1))));
  return { openCut: 0, hp, log: [`시스템: 판정 ${c.critical || '실패'} — 허를 찔렸다! HP ${s.hp} → ${hp}`], note: ` 플레이어가 판정에 실패해 ${foe}에게 먼저 한 방 맞았으니 다친 채 싸움을 시작합니다.` };
};
export type QuestClear = { quests: { name: string; giver: string; main?: boolean }[]; next?: string; xp: number; reputation: number; total: number; items: string[]; levelFrom: number; levelTo: number; key: number };
// A notice held back during a talk: one talk can finish more than one quest, and the later one mustn't erase the earlier.
export const mergeClear = (prev: QuestClear | null, now: QuestClear): QuestClear => !prev ? now : { ...now, quests: [...prev.quests, ...now.quests], next: now.next || prev.next, xp: prev.xp + now.xp, reputation: prev.reputation + now.reputation, items: [...prev.items, ...now.items], levelFrom: prev.levelFrom };
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
// The partner's last quoted words in the scene right before the talk opened.
// shortcut: assumes the last quote belongs to the named NPC; with two speakers in one scene it may pick the other one's line.
export const lastSceneLine = (log: string[], npc: string) => {
  const last = log[log.length - 1] || '';
  if (!last.startsWith('GM:') || !last.includes(npc.split(' ')[0])) return '';
  return [...last.matchAll(/["“]([^"”\n]{2,200})["”]/g)].pop()?.[1].trim() || '';
};
// Carried into the talk by openTalk, it stands as the opening line: the GM's own reply then only brings the choices.
export const carriedOpening = (s: Session) => s.mode === 'talk' && talkTurns(s) === 0 && parseTalk(s.log[s.log.length - 1] || '')?.speaker === 'npc';
// The GM's own opening line is dropped then, but what it noticed on the player ("[소지품: 인장 반지] …") stays, read before the line.
export const openWithCue = (log: string[], reply: string[]) => [...log.slice(0, -1), ...reply.filter(e => e.startsWith('대화-단서:')), ...log.slice(-1)];
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
// Normal-mode actions that address someone on stage ("당설화에게 ~을 묻는다") open a conversation instead.
export const SPEECH_INTENT = /(묻|물어|말을 건|말한다|말해|부탁|요청|청한|이야기|알려 달라|알려달라|설득|인사|대화|질문|따진|사과|고백|제안|되묻|만나|만난|보고한|보고드|알린|알리러|알려 주|전한다|전하러)/;
// Is the action aimed at this person? "여관 주인에게 에드리아 하르트에 대해 묻는다" asks the innkeeper, so it isn't a talk with 에드리아.
// A two-word name also answers to its first word (에드리아 하르트 → 에드리아).
export const TALK_TO = ['에게', '한테', '께', '와', '과', '랑', '이랑', '하고', '을 만', '를 만', '을 설득', '를 설득'];
// A foe met on a move: the way there and the foe showing up, ending before any blow (the fight is the player's call).
export const ambushScene = (where: string, foe: { name: string; desc: string }, intent = '') => `시스템이 이동을 확정했습니다. ${where} ${intent ? `플레이어가 하려던 일: "${intent}". ` : ''}가는 길과 주변을 짧게 묘사한 뒤, ${foe.name}(${foe.desc})${josa(foe.name, '이')} 나타나 앞을 막아서는 데서 장면을 끝내세요. 싸움은 아직 시작되지 않았습니다.`;
export const arrivalToMeet = (npc: string) => `도착한 장면을 묘사하세요. ${npc}${josa(npc, '이')} 그곳에 있습니다. 대화는 아직 시작되지 않았으니 ${npc}의 대사는 쓰지 마세요.`;
export const speaksTo = (text: string, npc: string) => { const w = npc.split(/\s+/); return [npc, ...(w.length === 2 && w[0].length >= 2 ? [w[0]] : [])].some(n => TALK_TO.some(p => text.includes(n + p))); };
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
  wuxia: ["연청", "청연", "설영", "천소화", "정혜", "한설아", "소화", "남궁세린", "당설화", "제갈연", "팽소연", "모용설", "이정", "월하", "혈영", "단유", "홍랑", "왕소교", "류월", "독고연", "진하", "백초희", "운낭", "마련"],
  fantasy: ["그리마 철망치", "넬", "레지나 발트", "리오네 아스크", "말라키아", "미라벨 크로우", "바레나", "브리아", "세라핀", "실바엘", "아우렐리아", "에드리아 하르트", "엘로이즈", "오르벨라", "오틸리에 마른", "우르술라", "이졸데", "카시아", "테오도라", "핍", "한나"],
  modern: ["강태희", "고명숙", "김기연", "나연", "마서윤", "문지혜", "민하늘", "박진아", "백희원", "서지아", "송재은", "오은비", "유채린", "윤세진", "이소라", "장민서", "정유겸", "차유진", "최혜령", "한도연"]
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
// 장르별 프롤로그의 첫 행동은 맵 탐색보다 사건과 인물에 직접 연결합니다.
export const openingActions = (g: Game): string[] => {
  const main = mainPrologue(g.wizardMain);
  if (main) return [...main.actions];
  const genre = defaultMapGenre(g);
  if (genre === 'wuxia') return [
    '종소리가 들려온 거리로 향해 도움을 청한 사람에게 무슨 일이 일어났는지 묻는다.',
    '열병에 관한 소문을 듣기 위해 가까운 의원이나 약재상을 찾아 환자들의 상태를 확인한다.',
    '관아가 소문을 막는 이유가 수상하다. 성문 주변의 포졸과 짐수레를 지켜보며 감춰진 움직임을 찾아본다.',
    '저잣거리 한복판에서 열병을 고친다는 떠돌이 약장수 행세를 하며 누가 가장 먼저 반응하는지 지켜본다.'
  ];
  if (genre === 'fantasy') return [
    '모험가 길드 사레타 지부로 가서 침몰선과 관련된 의뢰서를 확인하고 접수 담당자에게 묻는다.',
    '출항을 준비하는 선원에게 다가가 침몰선의 마지막 항해와 위험한 해역에 관해 물어본다.',
    '침몰 이야기를 꺼리는 상인들의 반응이 이상하다. 항구에서 화물 장부와 선박 출입 기록을 조사할 방법을 찾는다.',
    '항구 술집에서 내가 침몰선의 유일한 생존자라고 허풍을 떨고, 누가 가장 먼저 캐물으러 오는지 기다린다.'
  ];
  if (genre === 'modern') return [
    '골목 끝 경보음이 들린 곳으로 조심스럽게 다가가 주변 사람들의 안전과 현장 상황을 확인한다.',
    '관리국 신고 번호로 마력 이상 현상을 알리고 최근 구도심 신고 내역을 문의한다.',
    '폐쇄 건물 담장에 번진 푸른빛이 사라진 시각과 주변 CCTV 위치를 기록해 누군가 일부러 숨기는지 확인한다.',
    '푸른빛이 번진 담장에 일부러 손을 대고 내 각성 능력이 어떻게 반응하는지 시험해 본다.'
  ];
  return defaultActions(g, getStartingLocation(g).mapId, getStartingLocation(g).pinId);
};
// AI 응답 이전에도 선택지가 비어 있지 않도록 현재 맵에서 시작 행동을 구성합니다.
export const defaultActions = (g: Game, mapId?: string, pinId?: string): string[] => {
  const map = (g.maps || []).find(m => m.id === mapId) || (g.maps || [])[0];
  const current = map?.pins.find(p => p.id === pinId);
  return [
    current ? `${current.name} 주변을 살펴본다.` : '주변을 살펴본다.',
    '주변 사람에게 이 지역에 대해 물어본다.',
    '현재 장소에서 할 수 있는 일을 알아본다.',
    '아무도 하지 않을 법한 엉뚱한 방법으로 주변의 단서를 찾아본다.'
  ];
};
// Each start identity (chosen in the wizard) begins with its own strengths; the start items come from the prompt.
// Values replace the genre preset's initial value for fields with that id.
export const START_PROFILES: Record<string, { job: string; stats: Record<string, string> }> = {
  '신입 모험가': { job: '철급 모험가', stats: { strength: '12', agility: '12', intelligence: '10', mana: '30', realm: '철급 모험가' } },
  '몰락 기사 가문의 후계자': { job: '몰락 기사 가문 후계자', stats: { strength: '15', agility: '10', intelligence: '9', mana: '20', realm: '견습 기사' } },
  '마탑 탈주 견습생': { job: '탈주 견습 마법사', stats: { strength: '7', agility: '10', intelligence: '15', mana: '80', realm: '1서클 마법사' } },
  '문파 제자': { job: '문파 제자', stats: { internal: '120', external: '12', agility: '12', insight: '10', realm: '삼류' } },
  '표국 신참 표사': { job: '신참 표사', stats: { internal: '80', external: '14', agility: '11', insight: '9', realm: '삼류' } },
  '떠돌이 낭인': { job: '떠돌이 낭인', stats: { internal: '90', external: '13', agility: '13', insight: '10', realm: '삼류' } },
  '몰락 세가의 서자': { job: '몰락 세가의 서자', stats: { internal: '110', external: '10', agility: '11', insight: '14', realm: '삼류' } },
  '막 각성한 F급': { job: 'F급 신입 헌터', stats: { strength: '10', agility: '10', awakening: 'F급', mana: '100' } },
  'E급 짐꾼': { job: 'E급 짐꾼', stats: { strength: '13', agility: '11', awakening: 'E급', mana: '120' } },
  '등불 길드 신입': { job: '등불 길드 D급', stats: { strength: '12', agility: '12', awakening: 'D급', mana: '150' } },
  '수사대 협력 각성자': { job: '수사대 협력 C급', stats: { strength: '13', agility: '14', awakening: 'C급', mana: '200' } },
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
  flags: [], triggeredEvents: [], completedGoalSteps:[],currentGoal: '', quests: mainPrologue(g.wizardMain)?.firstQuest ? [mainPrologue(g.wizardMain)!.firstQuest] : [], reputation: 0, party: [], goalCompleted:false, relationships: [], sceneNpcs: [], suggestedActions: prologueText(g).trim() ? openingActions(g) : defaultActions(g, getStartingLocation(g).mapId, getStartingLocation(g).pinId), activeImageKey: undefined, roll: null, pendingCheck: null, lastCheck: null,
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
export const infoMarks = (s: Session): Record<string, string> => ({ quests: JSON.stringify(questsOf(s)), stats: JSON.stringify([s.level || 1, s.characterValues || {}]), inventory: JSON.stringify([s.inventory || [], s.equipped || {}]), relationships: JSON.stringify([(s.relationships || []).map(r => [r.name, r.relation, r.affection]), s.party || []]) });
export const wizardWorlds:Record<string,string[]> = {
 rpg:['정통 판타지','정통 무협','현대 판타지'], survival:['좀비 아포칼립스','무인도 생존','우주 재난'],
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
