'use client';


import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronRight, Dices, Download, FolderOpen, Image as ImageIcon, Map as MapIcon, MapPin as MapPinIcon, EyeOff, Footprints, MessageCircle, Package, Plus, Play, RotateCcw, ScrollText, Send, Shield, Swords, Zap, Settings2, Sparkles, Trash2, Upload, Users, X, Award , Skull, Trophy } from 'lucide-react';
import { mainPrologue, mainChain } from './_lib/prologues';
import { beatGoal, type Beat } from './_lib/quest-beats';
import { REGION_QUESTS, type RegionQuest } from './_lib/regional-quests';
import { EXTRA_REGION_QUESTS } from './_lib/regional-quests-extra';
import GENRE_REF from './api/prompt/_lib/genre-reference.json';
import { mainSections } from './api/prompt/_lib/reference-builder';
import { GRADE_LABELS, KIND_LABELS, SKILLS, infoOf, gearOf, bonusText, skillText, enemyGear, gradeForTier, dropChance, rollGrade, rollSkill, randomGearKind, gearName, POTIONS, healShareOf, enemySkill, enemySkillText, type EnemySkill, type Grade, type ItemInfo, type ItemKind, type Equipped } from './_lib/items';
import { foesOf, findFoe, foeImage, isFoeName, isDangerous, pickEncounter, ENCOUNTER_CHANCE, huntTarget, HUNT_CHANCE, foeInText, type Foe } from './_lib/monsters';
import { POWER_TIERS, MAX_POWER, MAX_LEVEL, foeLevelRange, enemyStats, levelBonus, gainXp, xpToNext, battleXp, questXp, mainQuestXp, deedXp, levelForTier, tierOfLevel, encounterLevel, companionStats } from './_lib/progression';

/** Extract explicitly granted starting items without rewriting their authored wording. */
type RuleItem = { name: string; detail: string; source: string };
const START_SECTION = /(?:주인공|플레이어|시작|초기|최초).*(?:소지품|장비|아이템|도구|물품)|(?:소지품|장비|아이템).*(?:시작|초기)/;
function extractRuleItems(prompt: string): RuleItem[] {
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
function combinedStartingItems(prompt: string, manual: string): string[] {
  const authored=extractRuleItems(prompt).map(x=>x.name);
  return [...new Set([...authored,...manual.split(',').map(x=>x.trim()).filter(Boolean)])];
}

type NpcPortrait = { id:string; name:string; description:string; appearance:string; gender?: "male" | "female" | "unknown"; age?: string; faction?: string; visualIdentity?: string; image?:string };
type ImageRow = { id: string; name: string };
type ImageColumn = { id: string; name: string };
type ImageCell = { rowId: string; columnId: string; image: string };
type Asset = { id: string; name: string; kind: 'character' | 'monster'; description: string; image: string; x: number; y: number };
type MapPin = { id: string; name: string; x: number; y: number; kind: "start" | "place" | "building" | "event" | "exit"; description?: string; eventText?: string; eventTrigger?: "enter" | "interact"; eventOnce?: boolean; requiredItem?: string; requiredFlag?: string; bidirectional?: boolean; targetMapId?: string; targetPinId?: string; background?: string };
type MapLink = { id: string; from: string; to: string };
type BoardMap = { id: string; name: string; image: string; baseImage?: string; pins: MapPin[]; links?: MapLink[] };
// Built-in maps are served as static files from public/_default_maps via /api/default-map.
// Keep their URLs in project state instead of embedding megabytes of base64 in IndexedDB.
const DEFAULT_MAP_NAMES: Record<string,string[]> = {
  wuxia: ['중원 전체 맵','낙양','구파일대 본산','사천·서역'],
  fantasy: ['판타지 세계 지도','레븐홀트','사레타','아스테라'],
  modern: ['신해시 전체 맵','신해시 중앙구','신해 구도심','신해 항만 산업단지']
};
// Places inside a city (its detail-map pins and the prompt's city locations) point to that city, so a scene heading
// like 【북문 초소 · 낮】 puts the player at 레븐홀트 on the world map. The longest matching place name wins.
const GENRE_REF_KEY: Record<string, string> = { wuxia: '정통 무협', fantasy: '정통 판타지', modern: '현대 게이트·헌터' };
const cityPlaceCache: Record<string, [string, string][]> = {};
const cityPlaces = (genre: string): [string, string][] => cityPlaceCache[genre] ??= [
  ...(DEFAULT_MAP_PLACES[genre] || []).slice(1).flatMap((pins, k) => pins.map(([name]) => [name, DEFAULT_MAP_NAMES[genre]?.[k + 1] || ''] as [string, string])),
  ...((GENRE_REF as Record<string, { cities?: { name: string; locations: string[] }[] }>)[GENRE_REF_KEY[genre]]?.cities || [])
    .flatMap(c => c.locations.map(l => [l.replace(/^\{\w+\}\s*/, '').replace(/\(.*$/, '').trim(), c.name] as [string, string])),
].filter(([name, city]) => name.length >= 2 && !!city).sort((a, b) => b[0].length - a[0].length);
const cityOfPlace = (genre: string, heading: string) => cityPlaces(genre).find(([name]) => heading.includes(name))?.[1];
// A game's prompt is assembled once, when the game is made, so it keeps the story text of that day. When the story
// has been rewritten since, its sections (메인 사건, 게임 목표, 첫 사건 계기) are swapped for the current text.
const replaceSection = (prompt: string, title: string, body: string) => prompt.replace(new RegExp(`(# \\[${title}\\]\\n)[\\s\\S]*?(?=\\n\\n# \\[|$)`), (_, head: string) => head + body);
const refreshMainPrompt = (g: Game, text?: string) => {
  if (!text || !g.wizardMain || !text.includes('# [메인 사건]')) return text;
  const m = mainSections(g.wizardWorld || '', g.wizardMain, g.finalGoalMode);
  if (!m) return text;
  const next = replaceSection(replaceSection(text, '메인 사건', m.main), '게임 목표', m.goal).replace(/첫 사건 계기: .*/, () => `첫 사건 계기: ${m.hook}`);
  return next.length <= PROMPT_LIMIT ? next : text;
};
function defaultMapGenre(game: Game): string {
  const world = [game.wizardWorld,game.genre,game.world].filter(Boolean).join(' ').toLowerCase();
  if (/현대\s*판타지|헌터|게이트/.test(world)) return 'modern';
  if (/무협|무림|강호/.test(world)) return 'wuxia';
  return 'fantasy';
}
// Hand-authored normalized coordinates for the 12 supplied maps. No image-analysis API call.
// Each entry is [label, x%, y%]; markers remain fully editable by the creator.
const DEFAULT_MAP_PLACES: Record<string, [string,number,number][][]> = {
  wuxia: [
    [["천마신교",19.1398781920205,4.582530762237253],["곤륜파",13.181109713957282,17.739904701643024],["공동파",25,27],["점창파",16.018618966622014,72.06710636568118],["사천당가",23.67989204375135,60.8196747237942],["청성파",30.0642854809152,51.69440752265163],["아미파",16.586123674753132,48.298952966187365],["용문석굴",42,72],["폐사찰",59.29061840043657,71.85489847033357],["성도",30,60],["항주",75,72],["낙양",53.47372967140384,42.56913319757005],["진하 표국",66.24251654573152,51.90662966587729],["하오문",72.05940527476426,42.78134821685669],["소림사",59.00686842770282,26.016311825639026],["화산파",44.25183174423887,25.591881787065745],["종남파",38.43493348987891,34.92937113143397],["하북팽가",54.18310936590183,7.553548156189229],["북망산 고분",76.31567391642497,4.794745781523893],["제갈세가",81.28131272725645,24.53080669063255],["남궁세가",81,42],["장강수로채",83,65]],
    [["낙양 황성",49,24],["교류시장",44,50],["하오문",65,51],["대리시",71,34],["귀족 거주구",31,36],["상인 거리",33,60],["장강수로채",65,72],["천련대",16,64],["백마사",24,14],["낙양 동문",88,49],["대운하 나루터",84,78],["화청원",22,81],["태학",78,17],["천문대",60,8]],
    [["공동파",19,28],["화산파",46,15],["소림사",75,20],["종남파",48,49],["제갈세가",14,66],["하북팽가",76,75],["구파일대 회맹대",42,77],["공동산 정상",23,13],["연화대",58,26],["대웅보전",84,16]],
    [["천마신교",25,20],["흑염곡",44,30],["혈석관",49,16],["서역 관문",57,8],["사막 오아시스",13,28],["청해진",48,54],["아미파",71,22],["청성파",87,32],["사천당가",65,58],["점창파",83,73],["은남",55,85],["감숙관",31,62]],
  ],
  fantasy: [
    [["사레타",21.693637471951483,37.05152844823939],["레븐홀트",62.837507347599285,53.816571963396065],["아스테라",57.72998878773732,27.077394046011243],["검은 문 관리지",18,19],["금지된 상회 본거지",40,21],["마탑 본부",56.59498889680232,10.100135511567924],["태양교단 총본산",70.49877566206501,18.164334740216304],["심연의 사도 성역",88,15],["옛 왕조 지하 묘지",81.5650626999902,30.897271517109775],["그림우드",94.47571979802115,46.60123281189424],["회색 탑 폐허",75.32254424919323,52.118837561224915],["은염 숲",28.929280827316582,61.2441190102455],["철망치 씨족 본거지",48.22434088783861,68.24723601852168],["해신의 섬",80.00443308729096,86.28556252545918],["그림자 숲의 거점",42.97495210427338,38.55826292150744],["변경백가 영지",78.72755344732546,68.03501387529602]],
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
function presetMaps(genre:string): BoardMap[] { return rawPresetMaps(genre).slice(0, 1); }
// Portals the short-lived auto-linking added (id "<map>-to-<target>") are removed from saved games.
const withoutAutoPortals = (maps: BoardMap[]): BoardMap[] => maps.map(m => m.pins.some(p => p.kind === 'exit' && p.id === `${m.id}-to-${p.targetMapId}`) ? { ...m, pins: m.pins.filter(p => !(p.kind === 'exit' && p.id === `${m.id}-to-${p.targetMapId}`)) } : m);
function rawPresetMaps(genre:string): BoardMap[] {
  const names=DEFAULT_MAP_NAMES[genre] || DEFAULT_MAP_NAMES.fantasy;
  const sets=DEFAULT_MAP_PLACES[genre] || DEFAULT_MAP_PLACES.fantasy;
  return names.map((name,index)=>({
    id:`default-${genre}-${index}`, name, image:`/api/default-map/${genre}/${index}`,
    pins:sets[index].map(([label,x,y],n)=>({id:`default-${genre}-${index}-pin-${n}`,name:label,x,y,kind:'place' as const,description:`${name}의 ${label}. 제작자가 장소 설명과 이벤트를 편집할 수 있습니다.`})),links:[]
  }));
}
const DEFAULT_PLAYER_MARKERS: Record<string,string> = {wuxia:'/api/default-player-marker/wuxia',modern:'/api/default-player-marker/modern',fantasy:'/api/default-player-marker/fantasy'};
// The character art shown in talk and battle: the creator's upload, else the genre's default standing art.
function playerPortraitSrc(game: Game): string { return game.playerPortrait || `/api/default-player-portrait/${defaultMapGenre(game)}`; }
function playerMarkerSrc(game: Game): string { return game.playerMarker || DEFAULT_PLAYER_MARKERS[defaultMapGenre(game)]; }
function createDefaultMaps(game: Game): BoardMap[] {
  return presetMaps(defaultMapGenre(game)).map(m=>({...m,id:makeId(),pins:m.pins.map(p=>({...p,id:makeId()}))}));
}

type Relationship = { id: string; name: string; relation: string; affection: number; image?: string };
type InfoField = { id: string; name: string; kind: 'number' | 'text' | 'gauge'; initial: string; max?: number; visible: boolean };
type CharacterConfig = { preset: string; sections: { character: boolean; stats: boolean; equipment: boolean; inventory: boolean; status: boolean; relationships?: boolean }; relationships?: Relationship[]; fields: InfoField[]; slots: string[]; initialName: string; initialJob: string; initialRace: string; initialLevel: number; initialGold: number };
const defaultCharacterConfig = (): CharacterConfig => ({ preset:'fantasy', sections:{character:true,stats:true,equipment:true,inventory:true,status:true,relationships:true},relationships:[],initialName:'모험가',initialJob:'모험가',initialRace:'인간',initialLevel:1,initialGold:100,slots:['무기','방어구','보조 장비','장신구'],fields:[{id:'strength',name:'근력',kind:'number',initial:'10',visible:true},{id:'agility',name:'민첩',kind:'number',initial:'10',visible:true},{id:'intelligence',name:'지능',kind:'number',initial:'10',visible:true},{id:'mana',name:'마나',kind:'number',initial:'30',visible:true},{id:'realm',name:'성장 단계',kind:'text',initial:'견습 검사',visible:true}] });
const relationshipTypes = (game:Game): string[] => {
 const genre=[game.wizardType,game.wizardWorld,game.genre,game.gameType,game.prompt].join(' ').toLowerCase();
 if(/연애|로맨스|일상|학교|캠퍼스/.test(genre))return ['지인','친구','동료','호감','연인','라이벌','적대'];
 if(/무협|강호|무림|문파/.test(genre))return ['초면','지인','동료','사제','은인','라이벌','원수'];
 if(/전쟁|전략|정치|국가/.test(genre))return ['중립','동맹','부하','상관','협력','경쟁','적대'];
 if(/추리|미스터리|탐정/.test(genre))return ['초면','목격자','협력자','의뢰인','용의자','적대'];
 return ['초면','지인','친구','동료','동맹','라이벌','적대'];
};
const characterPresets: Record<string, { fields: [string,string,'number'|'text'|'gauge',string,number?][]; slots: string[] }> = {
 fantasy:{fields:[['strength','근력','number','10'],['agility','민첩','number','10'],['intelligence','지능','number','10'],['mana','마나','number','30'],['realm','성장 단계','text','견습 검사']],slots:['무기','방어구','보조 장비','장신구']},
 modern:{fields:[['strength','근력','number','10'],['agility','민첩','number','10'],['awakening','각성 등급','text','F급'],['mana','마력','number','100']],slots:['무기','방어구','장신구']},
 survival:{fields:[['stamina','스태미나','gauge','100',100],['hunger','배고픔','gauge','100',100],['thirst','갈증','gauge','100',100],['temperature','체온','number','37']],slots:['도구','방어구','가방']},
 wuxia:{fields:[['internal','내공','number','100'],['external','외공','number','10'],['agility','경공','number','10'],['insight','오성','number','10'],['realm','경지','text','삼류']],slots:['무기','의복','비급','장신구']},
 mystery:{fields:[['sanity','정신력','gauge','100',100],['insight','관찰력','number','10'],['logic','추리력','number','10'],['clues','단서','number','0']],slots:['도구','소지품']}
};
// Keep old saved character data compatible while keeping rule explanations out of stat labels.
const normalizeCharacterConfig = (config: CharacterConfig): CharacterConfig => ({
 ...config,
 fields:(config.fields || []).map(f => {
  if (f.id === 'awakening' && /각성 등급/.test(f.name)) return {...f,name:'각성 등급',initial:f.initial==='F'?'F급':f.initial};
  if (f.id === 'realm' && /직업별 경지/.test(f.name)) return {...f,name:'성장 단계'};
  return f;
 })
});
const statDisplayName = (f: InfoField): string => f.id==='awakening' && /각성 등급/.test(f.name) ? '각성 등급' : f.id==='realm' && /직업별 경지/.test(f.name) ? '성장 단계' : f.name;
const statDisplayValue = (f: InfoField, value: string): string => f.id==='awakening' && /^[FEDSABC]$/.test(String(value).trim()) ? `${String(value).trim()}급` : String(value);
const applyCharacterPreset = (current: CharacterConfig, preset: string): CharacterConfig => { const item=characterPresets[preset]; return item ? {...current,preset,fields:item.fields.map(([id,name,kind,initial,max])=>({id,name,kind,initial,max,visible:true})),slots:[...item.slots]} : {...current,preset}; };
// Follow the chosen world with its stat preset unless the creator already customized the stats.
const genrePresetPatch = (game: Game, world: string): Partial<Game> => {
 const c=game.characterConfig || minimalCharacterConfig();
 const untouched=(c.preset==='custom' && !c.fields.length) || c.preset in characterPresets;
 return untouched ? {characterConfig:applyCharacterPreset(c,defaultMapGenre({wizardWorld:world} as Game))} : {};
};
// Genre-aware, opt-in system recommendations. No RPG stats are forced on new games.
const minimalCharacterConfig = (): CharacterConfig => ({...defaultCharacterConfig(),preset:'custom',sections:{character:true,stats:true,equipment:true,inventory:true,status:true,relationships:true},relationships:[],initialName:'플레이어',initialJob:'',initialRace:'',initialLevel:1,initialGold:0,fields:[],slots:[]});
const genreSystemSuggestions = (game: Game): CharacterConfig => {
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
type PromptDraft = { options: string[]; optionTitles?: string[]; selected: number; custom: string; enabled: boolean };
type PromptDrafts = Record<string, PromptDraft>;
type CustomPromptSection = {id:string;name:string;guide:string};
type DirectionOptions = {mains:{name:string;city:string;hook:string;goal:string;progressSteps:string[];starts:{name:string;summary:string}[]}[]};
const promptSections = [
 {id:'foundation',name:'세계관과 기본 규칙',promptTitle:'세계관과 기본 규칙',required:true,guide:'GM 역할과 주인공 자율성, 서술 형식, 역사/세력/지역, 시작 신분·장소·첫 임무를 정한다. 고유명사와 핵심 갈등을 확정. 게임 엔진의 choices·플래그를 실제 사용 가능한 형태로 정의.'},
 {id:'system',name:'게임 시스템',promptTitle:'게임 시스템',required:true,guide:'시간/이동/기록 플래그, NPC 독립 행동, 장르별 D20 판정·난이도·전투 라운드·피해·회복·패배·성장·경제·초기 장비. 다른 단계의 세계관 설명을 반복하지 않는다.'},
 {id:'npc',name:'주요 NPC와 관계',promptTitle:'주요 NPC와 관계',required:true,guide:'세계관에 연결된 NPC 최소 10명. 각 인물 이름, 성별(남성/여성), 나이, 소속, 외형, 성격, 목표, 비밀/갈등. 이미지 생성용 외형 정보와 인물별 사건 연결 고리. 관계 변화 원칙을 간결하게.'},
 {id:'story',name:'메인 사건과 의뢰·기연',promptTitle:'메인 사건과 의뢰·기연',required:true,guide:'기존 NPC와 장소를 사용한 3~5막 메인 사건(발동 조건·징조·분기·실패 결과), 독립 의뢰, 인연 사건, 반복되지 않는 돌발 사건과 단계형 기연(단서→조사→시험→보상·대가). 동일 사건을 여러 번 설명하지 않는다.'},
 {id:'goal',name:'최종 목표와 결말',promptTitle:'게임의 최종 목표',required:true,guide:'앞에서 확정한 메인 사건과 인물에 직접 연결되는 최종 목표, 측정 가능한 달성 조건, 실패·부분 성공, 복수 결말, 엔딩 후 지속 여부. NPC나 사건을 다시 나열하지 않는다.'}
] as const;
const draftText = (d?:PromptDraft) => !d ? '' : d.selected === 3 ? d.custom : (d.options[d.selected] || '');
const buildDraftPrompt = (drafts:PromptDrafts, extras:CustomPromptSection[] = [], removed:string[] = []) => [...promptSections.filter(x=>!removed.includes(x.id)),...extras].filter(x=>('required' in x && x.required) || drafts[x.id]?.enabled !== false).map(x=>{const t=draftText(drafts[x.id]).trim();return t?`# [${'promptTitle' in x ? x.promptTitle : x.name}]\n\n${t}`:'';}).filter(Boolean).join('\n\n');
// Wizard games keep the generated base prompt and append creator-written rules after it.
const withExtras = (base:string|undefined, drafts:PromptDrafts, extras:CustomPromptSection[]) => base ? [base, buildDraftPrompt(drafts, extras, promptSections.map(x=>x.id))].filter(Boolean).join('\n\n') : undefined;
// Hide GM-only flag identifiers in player-facing goal text without altering stored rules.
const displayGoal = (value:string) => value
 .replace(/\s*[（(]\s*['"‘“]?[^()（）\n]*?(?:대사건|플래그|flag|FLAG)\s*[:：][^()（）\n]*?['"’”]?\s*[)）]/g, '')
 .replace(/\s+([.!?。])/g, '$1')
 .trim();
const getGameGoal = (game:{promptDrafts?:PromptDrafts;prompt?:string;compressedPrompt?:string}) => {
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
const DEFAULT_PROLOGUES: Record<string,{title:string;text:string}> = {
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
const defaultPrologueImage=(g:Game)=>`/api/default-prologue/${defaultMapGenre(g)}`;
// The opening follows the game's chosen main story; the genre default is only for games made before main stories existed.
const prologueText=(g:Game)=>mainPrologue(g.wizardMain)?.text || DEFAULT_PROLOGUES[defaultMapGenre(g)].text;
// The opening is fixed to the genre default; per-game edits are no longer offered.
const prologueTitle=(g:Game)=>mainPrologue(g.wizardMain)?.title || DEFAULT_PROLOGUES[defaultMapGenre(g)].title;
// A story set in another city opens on that city's background when one ships with the genre.
const prologueImage=(g:Game)=>{ const city=mainPrologue(g.wizardMain)?.city; const file=city?DEFAULT_PLACE_BACKGROUNDS[defaultMapGenre(g)]?.[city]:undefined; return file&&city!=='사레타'?`/api/default-background/${defaultMapGenre(g)}/${file}`:defaultPrologueImage(g); };
// Built-in place backgrounds (public/_default_backgrounds/<genre>/<file>.png), matched by pin name.
// wuxia/modern folders are ready; add entries here once their images are in.
const DEFAULT_PLACE_BACKGROUNDS: Record<string, Record<string,string>> = {
  fantasy: {'사레타':'saretta','레븐홀트':'ravenholt','아스테라':'astera','검은 문 관리지':'black-gate','금지된 상회 본거지':'forbidden-guild','마탑 본부':'mage-tower','태양교단 총본산':'sun-temple','심연의 사도 성역':'abyss-sanctum','옛 왕조 지하 묘지':'old-catacombs','그림우드':'grimwood','회색 탑 폐허':'grey-tower-ruins','은염 숲':'silverleaf-forest','철망치 씨족 본거지':'ironhammer-hold','해신의 섬':'sea-god-isle','그림자 숲의 거점':'shadow-outpost','변경백가 영지':'margrave-estate'},
  wuxia: {},
  modern: {}
};
// The pin's own upload wins; otherwise the genre's built-in art for that place, else the prologue image.
function placeBackground(g: Game, pin?: MapPin): string {
  if (pin?.background) return pin.background;
  const genre = defaultMapGenre(g);
  const file = pin && DEFAULT_PLACE_BACKGROUNDS[genre]?.[pin.name.trim()];
  return file ? `/api/default-background/${genre}/${file}` : prologueImage(g);
}
type Game = { npcPortraits?:NpcPortrait[]; npcStyle?:string; finalGoalMode?: 'single' | 'progress'; finalGoalSteps?: string[]; prologue?: string; prologueTitle?:string; prologueImage?:string; profileDone?: boolean; promptDone?: boolean; mapDone?: boolean; assetsDone?: boolean; settingsDone?: boolean; wizardType?: string; wizardWorld?: string; wizardStage?: number; wizardMain?: string; wizardStart?: string; wizardBasePrompt?: string; playerMarker?: string; playerPortrait?: string; customPromptSections?: CustomPromptSection[]; removedPromptSections?: string[]; promptDrafts?: PromptDrafts; compressedPrompt?: string; characterConfig?: CharacterConfig; showHpBar?: boolean; showEquipment?: boolean; showDice?: boolean; startingEquipment?: string; maps?: BoardMap[]; startMapId?: string; startPinId?: string; registrationDescription?: string; genre?: string; gameType?: string; cooperation?: string; progression?: string; playTime?: string; hashtags?: string[]; audience?: string; playMode?: 'single' | 'multi'; minPlayers?: number; maxPlayers?: number; imageRows?: ImageRow[]; imageColumns?: ImageColumn[]; imageCells?: ImageCell[]; prompt?: string; mapImage?: string; assets?: Asset[]; id: string; name: string; description: string; world: string; rules: string; gm: string; hp: number; size: number; created: number; cover?: string };
// foeBleed/foeBleedTurns/foePoison: the player's 출혈 and 독 still working on the foe.
type CombatState = { castGauge?: number; foeBleed?: number; foeBleedTurns?: number; foePoison?: number; level?: number; boss?: boolean; enemyAtk?: number; enemySkill?: EnemySkill; enemyShield?: number; shield?: number; lethal?: boolean; monster?: boolean; foeDesc?: string; power?: number; npc: string; enemyHp: number; enemyMaxHp: number; enemyDc: number; enemyDamage: number; round: number; itemUse?: string; lastDealt?: number; lastTaken?: number; last?: { allies?: string[]; dealt: number; critDealt: boolean; taken: number | null; critTaken: boolean }; totalDealt?: number; totalTaken?: number; result?: 'win' | 'lose' };
type DiceCheck = { ability: string; label: string; dc: number; reason: string; action: string; success?: string; failure?: string };
type DiceResult = { ability: string; label: string; dc: number; die: number; modifier: number; total: number; success: boolean; critical: string; onSuccess?: string; onFailure?: string };
// A roll in the last few actions: the GM is told not to ask for another one right away.
const rolledRecently = (s: Session) => { const acts = s.log.map((e, i) => e.startsWith('플레이어:') ? i : -1).filter(i => i >= 0); return s.log.slice(acts.length >= 3 ? acts[acts.length - 3] : 0).some(e => e.startsWith('주사위:')); };
// An action typed during a talk that walks away from it, rather than something said.
const LEAVING = /(?:으로|로|에|을|를|서)\s+(?:\S+\s+){0,4}?(?:간다|향한다|나선다|떠난다|들어간다|나간다|출발한다|돌아간다|따라간다|뒤쫓는다|추적한다|조사한다|살핀다|뒤진다)\.?$/;
// memory: rolling long-term summary of log[0..upTo); the GM sees it plus the unsummarized recent entries.
// pinned: key facts that are only ever appended to, never rewritten by the summary.
type StoryMemory = { summary: string; upTo: number; pinned?: string[] };
// questProgress: beats done per tracked quest step (main:<quest>, region:<id>:<quest>); questChoice: what a choose beat
// picked; pendingThen: beats a won fight completed, for the next scene to narrate.
// mana: current mana (max: maxManaOf); unset means full. talkAccept: the line that concludes this quest talk.
// talkEnded: the talk has finished and stays on screen until the player presses 대화 끝내기.
type Session = { talkEnded?: boolean; talkAccept?: string; mana?: number; questProgress?: Record<string, number>; questChoice?: Record<string, string>; pendingThen?: { quest: string; then: string }[]; recentFoes?: string[]; regionQuests?: Record<string, number>; regionDone?: string[]; lastRegionHook?: number; scenePlace?: string; lastEventXp?: number; revivals?: number; itemInfo?: Record<string, ItemInfo>; equipped?: Equipped; mainStep?: number; lastInterference?: number; training?: Record<string, number>; threat?: Threat; dead?: boolean; memory?: StoryMemory; npcVoices?: Record<string, string>; npcNotes?: Record<string, string>; quests?: string[]; questGivers?: Record<string, string>; inviteRefusals?: Record<string, number>; npcCombat?: Record<string, { hp: number; dc: number; damage: number; power?: number }>; level?: number; xp?: number; npcPower?: Record<string, number>; companions?: Record<string, { level: number; xp: number }>; reputation?: number; party?: string[];completedGoalSteps?: number[]; currentGoal?: string; goalCompleted?: boolean; relationships?: Relationship[]; suggestedActions?: string[]; pendingCheck?: DiceCheck | null; lastCheck?: DiceResult | null; characterValues?: Record<string,string>; characterEquipment?: Record<string,string>; characterGold?: number; mapId?: string; pinId?: string; gameId: string; x: number; y: number; hp: number; roll: number | null; log: string[]; inventory?: string[]; flags?: string[]; triggeredEvents?: string[]; activeImageKey?: string; sceneNpcs?: string[]; handledNpcs?: string[]; mode?: 'talk' | 'combat'; talkNpc?: string; combat?: CombatState | null; travel?: {mapId:string; destinationId:string; remaining:number; total:number} };
type View = 'library' | 'edit' | 'play';
type Tab = 'prompt' | 'map' | 'assets' | 'settings' | 'register';
const initial: Game = { finalGoalMode:'single',finalGoalSteps:[],characterConfig: defaultCharacterConfig(), showHpBar: true, showEquipment: true, showDice: true, startingEquipment: '낡은 검, 가죽 갑옷, 회복 물약', playMode: 'single', minPlayers: 2, maxPlayers: 4, id: 'sample', name: '잊혀진 던전', description: '고대 유적을 탐험하는 판타지 TRPG', world: '고대 왕국의 유적이 발견되었다. 플레이어는 유적을 탐험하는 모험가다.', rules: 'D20 판정. 10 이상 보통 성공, 15 이상 어려운 성공. 같은 맵 안에서는 장소를 자유롭게 선택하고 다른 맵으로는 포탈을 통해 이동한다. 전투 및 아이템 사용은 추후 규칙 모듈로 확장.', gm: '몰입감 있는 한국어 판타지 TRPG GM. 플레이어의 행동을 임의로 확정하지 말고 결과를 설명한다.', hp: 100, size: 7, created: 0, prompt: '고대 왕국의 유적이 발견되었다. 플레이어는 유적을 탐험하는 모험가다.\nD20 판정을 사용한다.\nGM은 플레이어의 행동을 임의로 확정하지 않는다.', assets: [], imageRows: [], imageColumns: [], imageCells: [], mapImage: '', registrationDescription: '', genre: 'RPG / 탐험', gameType: 'RPG / 탐험', cooperation: '협동', progression: '턴제', playTime: '장기 캠페인', hashtags: [], audience: '전체 이용가' };
const storageKey = 'crpg-studio-games-v2';
const legacyKey = 'crpg-studio-games-v1';

// v39: Store large image-bearing projects in IndexedDB instead of localStorage.
// Legacy localStorage entries are only read for migration; they are never deleted automatically.
const databaseName = 'crpg-studio-storage';
const databaseVersion = 1;
function openProjectDatabase(): Promise<IDBDatabase> {
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
async function readProjectRecord<T>(key: string): Promise<T | undefined> {
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
async function writeProjectRecord(key: string, value: unknown): Promise<void> {
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
}
async function deleteProjectRecord(key: string): Promise<void> {
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
}

const PROMPT_LIMIT = 7000;
// Long-term memory: the GM always gets the newest MEMORY_KEEP_RECENT..30 log entries verbatim;
// older ones are summarized MEMORY_BATCH at a time.
const MEMORY_KEEP_RECENT = 12;
const MEMORY_BATCH = 12;
// Unsummarized entries, at least the last 12 and at most the last 30.
// A talk closes itself when the GM wraps it up, or at the latest after TALK_LIMIT player lines.
const TALK_LIMIT = 6;
// Reputation lost each time the player runs from a foe.
const FLEE_REPUTATION = 20;
// A lethal defeat can turn into an awakening: a god steps in, the player rises stronger and the fight goes on.
// The odds drop each time it happens in one playthrough.
const REVIVE_CHANCES = [0.3, 0.15, 0.05];
// Player actions that must pass between two event rewards.
const EVENT_XP_GAP = 5;
const AWAKEN_LEVELS = 5;
const BLESSING: Record<string, { name: string; desc: string; skill: string }> = {
  fantasy: { name: '여신의 축복 부적', desc: '쓰러진 순간 내려온 신의 빛이 깃든 부적.', skill: '신의 가호' },
  wuxia: { name: '천신의 옥패', desc: '죽음의 문턱에서 깨달음과 함께 손에 쥐어진 옥패.', skill: '천신강림' },
  modern: { name: '각성의 결정', desc: '쓰러진 순간 2차 각성과 함께 몸에서 맺힌 결정.', skill: '2차 각성' },
};
// Grouped log items drawn at once in the story panel.
const LOG_PAGE = 200;
// Hostile factions interfere with the player at random, never two scenes in a row.
const INTERFERE_GAP = 5;
const INTERFERE_CHANCE = 0.35;
const talkTurns = (s: Session) => { const i = s.talkNpc ? s.log.lastIndexOf(`시스템: ${s.talkNpc}와(과) 대화를 시작했습니다.`) : -1; return i < 0 ? 0 : s.log.slice(i + 1).filter(e => parseTalk(e)?.speaker === 'me').length; };
// Lines from the whole log that involve one NPC, so they remember earlier meetings, promises and deeds beyond the recent window.
// What the person has been through with the player: every line of the talks with them (the player's own words too,
// which carry no name; leaving them out made people ask again what they had just been told), and other entries
// that name them.
const npcHistory = (s: Session, name: string) => {
  if (!name) return [];
  let inTalk = false;
  return s.log.filter(e => {
    if (e.startsWith(`시스템: ${name}와(과) 대화를 시작했습니다.`)) { inTalk = true; return true; }
    if (inTalk && /^시스템: .*대화(가 끝났습니다|를 마쳤습니다)/.test(e)) { inTalk = false; return true; }
    return (inTalk && e.startsWith('대화-')) || e.includes(name);
  }).slice(-30).map(e => historyLine(e).slice(0, 300));
};
const recentHistory = (s: Session) => s.log.slice(Math.max(s.log.length - 30, Math.min(s.memory?.upTo || 0, s.log.length - 12)));
// Current goals work like a quest log of up to MAX_QUESTS; saves from before the log carry a single currentGoal.
const MAX_QUESTS = 3;
const questsOf = (s: Session): string[] => s.quests ?? (s.currentGoal?.trim() ? [s.currentGoal.trim()] : []);
// A goal is never rewritten into a longer version of itself: closing a goal and re-adding the same goal with more text is undone, so new work becomes its own entry.
const QUEST_LENGTH = 80;
const sameQuest = (a: string, b: string) => { const x = a.replace(/\s+/g, ''), y = b.replace(/\s+/g, ''); if (x.includes(y) || y.includes(x)) return true; let i = 0; while (i < x.length && x[i] === y[i]) i++; return i >= Math.min(15, Math.ceil(Math.min(x.length, y.length) * 0.5)); };
// The same goal in other words: most letter pairs of the shorter one appear in the other. Short quests need
// the prefix match, so two different errands that share a place name are not merged.
const questPairs = (t: string) => { const x = t.replace(/[^가-힣a-zA-Z0-9]/g, ''); return new Set(Array.from({ length: Math.max(0, x.length - 1) }, (_, i) => x.slice(i, i + 2))); };
const alikeQuest = (a: string, b: string) => { if (sameQuest(a, b)) return true; const p = questPairs(a), q = questPairs(b); if (Math.min(p.size, q.size) < 6) return false; let both = 0; for (const k of p) if (q.has(k)) both++; return both / Math.min(p.size, q.size) >= 0.5; };
// Finishing a quest pays out without waiting on the GM: reputation, plus goodwill from whoever asked for it.
const QUEST_REPUTATION = 150, QUEST_AFFECTION = 10;
const applyQuests = (quests: string[], data: { addQuests?: unknown; completedQuests?: unknown; failedQuests?: unknown }, givers: Record<string, string> = {}) => {
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
const AFFECTION_MIN = -100, AFFECTION_MAX = 100, AFFECTION_STEP = 25;
const clampAffection = (v: number) => Math.max(AFFECTION_MIN, Math.min(AFFECTION_MAX, Math.round(v)));
const attitudeTier = (a: number) => a <= -60 ? { label: '적대', tone: 'hostile', act: '적극적으로 해친다: 도움·거래 거절, 위협, 방해, 거짓 정보, 경비나 동료를 부르거나 기회가 오면 공격·함정' }
  : a <= -20 ? { label: '반감', tone: 'cold', act: '경계하고 비협조적이다: 퉁명한 짧은 대답, 정보 숨김이나 거짓말, 웃돈·담보 요구, 부탁은 대가 없이 거절, 뒤에서 험담' }
  : a < 20 ? { label: '중립', tone: 'neutral', act: '이해관계대로만 움직인다: 정가 거래, 공짜 도움 없음, 비밀은 숨김' }
  : a < 60 ? { label: '호의', tone: 'warm', act: '먼저 돕는다: 할인·작은 선물, 소문과 단서를 자진해서 알려 줌, 사소한 부탁은 들어줌' }
  : { label: '신뢰', tone: 'trust', act: '편에 선다: 위험을 감수하고 돕기, 숨기던 비밀이나 개인 사정 일부 털어놓기, 위기에 먼저 나서기' };
// Joining the party is a roll: the higher the NPC's affection and the player's reputation, the better the odds.
// How much each NPC weighs the two, and how picky they are, is fixed per game and never shown; the player only learns yes or no.
const PARTY_LIMIT = 2;
const PARTY_THINK_MS = 2200;
// An NPC who dislikes the player (affection under -20) never agrees; otherwise the odds grow with both numbers, from 2% up to 95%.
const joinChance = (affection: number, reputation: number, taste: { affectionWeight: number; pickiness: number }) => {
  if (affection < -20) return 0;
  const score = taste.affectionWeight * Math.max(0, affection) / 100 + (1 - taste.affectionWeight) * reputationScore(reputation);
  return Math.max(0.02, Math.min(0.95, score * 1.15 / taste.pickiness));
};
// After a refusal the same NPC can't be asked again until the story has moved on a few entries, so the roll can't be spammed.
const INVITE_COOLDOWN = 6;
const inviteWait = (s: Session, npc: string) => { const at = s.inviteRefusals?.[npc]; return at === undefined ? 0 : Math.max(0, at + INVITE_COOLDOWN - s.log.length); };
// Reputation is open-ended: small deeds earn tens, a famous feat hundreds or thousands at once.
const REPUTATION_STEP = 5000;
const clampReputation = (v: number) => Math.max(-99999, Math.min(999999, Math.round(v)));
// 0..1 for the join odds: 500 ≈ 0.28, 1,000 ≈ 0.49, 3,000 ≈ 0.86; infamy counts as nothing.
const reputationScore = (rep: number) => rep <= 0 ? 0 : 1 - Math.exp(-rep / 1500);
const reputationRank = (rep: number) => rep <= -5000 ? '공포의 대상' : rep <= -1000 ? '악명 높음' : rep <= -100 ? '수상한 자' : rep < 100 ? '무명' : rep < 500 ? '신참' : rep < 2000 ? '알려진 자' : rep < 5000 ? '유명인' : rep < 15000 ? '영웅' : '전설';
const formatReputation = (rep: number) => `${rep > 0 ? '+' : ''}${rep.toLocaleString('ko-KR')}`;
const hashText = (t: string) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ (ch.codePointAt(0) || 0), 16777619); return h >>> 0; };
// Some NPCs care mostly about how they feel about you, others about your name in the world; some are simply harder to win over.
const npcTaste = (g: Game, name: string) => { const h = hashText(`${g.id}:${name.trim()}`); return { affectionWeight: 0.4 + (h % 41) / 100, pickiness: 0.75 + ((h >>> 8) % 51) / 100 }; };
// Each NPC's setting line travels next to the scene so the GM keeps gender, age and personality in the voice; a speech style, once fixed, sticks for the whole playthrough.
const NPC_PROFILE_LIMIT = 24;
const knownNpcNames = (g: Game, s: Session) => [...new Set([...npcProfiles(g, s).map(p => p.name), ...(g.npcPortraits || []).map(n => n.name), ...(DEFAULT_NPC_NAMES[defaultMapGenre(g)] || [])])];
const npcProfiles = (g: Game, s: Session) => {
  const prompt = g.prompt || '';
  const promptNames = [...prompt.matchAll(/^\s*\d+\.\s*([^(\n·]{1,20}?)\s*\(\d+\s*·\s*[남여]/gm)].map(m => m[1].trim());
  const stage = [s.talkNpc || '', s.combat?.npc || '', ...(s.sceneNpcs || [])].filter(Boolean);
  const names = [...new Set([...stage, ...(s.relationships || []).map(r => r.name), ...(g.npcPortraits || []).map(n => n.name), ...promptNames])].slice(0, NPC_PROFILE_LIMIT);
  const lines = prompt.split('\n');
  return names.map(name => {
    const portrait = (g.npcPortraits || []).find(n => n.name === name);
    const line = (lines.find(l => l.includes(name + '(')) || lines.find(l => l.includes(name)) || '').replace(/^\s*\d+\.\s*/, '').trim();
    const gender = portrait?.gender === 'female' ? '여성' : portrait?.gender === 'male' ? '남성' : '';
    const card = [gender, portrait?.age, portrait?.faction, portrait?.description].filter(Boolean).join(' / ');
    const rel = (s.relationships || []).find(r => r.name.trim() === name.trim());
    const attitude = rel ? { relation: rel.relation, affection: rel.affection, attitude: `${attitudeTier(rel.affection).label} — ${attitudeTier(rel.affection).act}` } : { attitude: '아직 만나지 않음' };
    return { name, inScene: stage.includes(name), ...((s.party || []).includes(name) ? { inParty: true } : {}),profile: [line, card].filter(Boolean).join(' | ').slice(0, 320), ...(s.npcNotes?.[name] ? { remembers: stage.includes(name) || (s.party || []).includes(name) ? s.npcNotes[name] : s.npcNotes[name].slice(0, 200) } : {}), speechStyle: s.npcVoices?.[name] || '', ...attitude };
  });
};


const GAME_TYPES = ['RPG / 탐험','전략 / 전쟁','추리 / 미스터리','파티 / 캐주얼','경영 / 경제','생존 / 협동','자유 시뮬레이션','기타'];
const COOPERATION = ['협동','경쟁','혼합'];
const PROGRESSION = ['턴제','동시 행동','자유 진행 (AI GM 중심)'];
const PLAY_TIMES = ['10~30분','30~60분','1시간 이상','장기 캠페인'];
const normalizeType = (g: Game) => g.gameType || (GAME_TYPES.includes(g.genre || '') ? g.genre! : 'RPG / 탐험');
const MAX_TAGS = 10;
const makeId = () => Math.random().toString(36).slice(2, 11);
// Render Korean labels onto the actual map bitmap. Preserve baseImage for editable re-rendering.
async function renderLabeledMap(source: string, pins: MapPin[]): Promise<string> {
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
const getStartingLocation = (g: Game) => {
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
const travelSteps = (map: BoardMap | undefined, from?: string, to?: string): number => {
  const a = map?.pins.find(p=>p.id===from), b=map?.pins.find(p=>p.id===to);
  if (!a || !b || a.id===b.id) return 0;
  const distance = Math.hypot(a.x-b.x,a.y-b.y);
  return distance <= 16 ? 0 : distance <= 38 ? 1 : distance <= 65 ? 2 : 3;
};
const nearbyPins = (map: BoardMap | undefined, pinId?: string): MapPin[] => {
  const current=map?.pins.find(p=>p.id===pinId);
  return current ? (map?.pins||[]).filter(p=>p.id!==pinId && p.kind!=='event' && p.kind!=='exit')
    .sort((a,b)=>Math.hypot(a.x-current.x,a.y-current.y)-Math.hypot(b.x-current.x,b.y-current.y)) : [];
};
// Minimap travel only links each place to its NEAR_NEIGHBORS closest places (both ways),
// then joins any separated clusters by their shortest gap so every place stays reachable step by step.
const NEAR_NEIGHBORS = 2;
const travelLinks = (map: BoardMap, here?: MapPin): Map<string, Set<string>> => {
  const nodes = map.pins.filter(p => p.kind !== 'event' || p.id === here?.id);
  const dist = (a: MapPin, b: MapPin) => Math.hypot(a.x - b.x, a.y - b.y);
  const links = new Map(nodes.map(p => [p.id, new Set<string>()]));
  const link = (a: MapPin, b: MapPin) => { links.get(a.id)!.add(b.id); links.get(b.id)!.add(a.id); };
  for (const p of nodes) nodes.filter(q => q.id !== p.id).sort((a, b) => dist(p, a) - dist(p, b)).slice(0, NEAR_NEIGHBORS).forEach(q => link(p, q));
  for (;;) {
    const seen = new Set([nodes[0]?.id]);
    const stack = nodes.length ? [nodes[0].id] : [];
    while (stack.length) for (const next of links.get(stack.pop()!) || []) if (!seen.has(next)) { seen.add(next); stack.push(next); }
    if (seen.size >= nodes.length) break;
    let best: [MapPin, MapPin] | undefined;
    for (const a of nodes) if (seen.has(a.id)) for (const b of nodes) if (!seen.has(b.id) && (!best || dist(a, b) < dist(...best))) best = [a, b];
    link(...best!);
  }
  return links;
};
// An action that heads somewhere ("이끼골로 가서 …"); the place it names is matched against the map.
// Choosing to fight a creature the scene just described starts that fight, even when the GM forgot to send the ambush.
const FIGHT_INTENT = /(싸운다|맞서 싸|맞선다|공격한다|베어 넘|베어낸다|덤벼든다|덤빈다|휘두른다|맞받아친다|전투를 벌)/;
const BEAST_SCENE = /(마물|늑대|괴물|짐승|야수|습격|덮치|돌진|달려들|으르렁|트롤|거미|고블린|해골|구울)/;
const TRAVEL_VERB = /(간다|향한다|이동한다|돌아간다|찾아간다|들어간다|가 ?본다|떠난다|출발한다|가서|향해|돌아가서|찾아가서)/;
const GENERIC_PLACE = /^(입구|광장|거리|마을|도시|근처|안쪽|바깥|가장자리)$/;
const reachablePins = (map: BoardMap, here: MapPin): MapPin[] => { const links = travelLinks(map, here); return map.pins.filter(p => links.get(here.id)?.has(p.id)); };
const d = (sides: number) => 1 + Math.floor(Math.random() * Math.max(1, sides));
const signed = (n: number) => n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`;
// Resource-like stats (mana, inner energy) are pools, not ability scores, so they never become modifiers.
const abilityMod = (g: Game, s: Session, pattern: RegExp) => {
  const fields = (g.characterConfig || defaultCharacterConfig()).fields.filter(f => f.kind === 'number' && !/마나|내공|기력|mp/i.test(f.name + f.id));
  const field = fields.find(f => pattern.test(f.name) || pattern.test(f.id)) || fields[0];
  const score = Number(s.characterValues?.[field?.id ?? ''] ?? field?.initial ?? 10);
  return Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
};
const clampInt = (v: unknown, min: number, max: number, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback; };
// The GM sizes up the opponent once; missing or out-of-range numbers fall back to an average foe.
// With a tier, the numbers always come from the level curve (enemyStats), so older saves' cached numbers and the
// GM's guesses don't matter; only an enemy given without a tier uses its own numbers.
const startCombat = (c: CombatState, enemy?: { hp?: unknown; dc?: unknown; damage?: unknown; power?: unknown } | null): CombatState => {
  const tiered = Number.isInteger(Number(enemy?.power)) && Number(enemy?.power) >= 1;
  // A monster met at a level above its tier (see encounterLevel) fights, wears gear and drops loot as that level's tier.
  const power = c.level ? tierOfLevel(c.level) : clampInt(enemy?.power ?? c.power, 1, MAX_POWER, 3);
  const base = enemyStats(c.level ?? levelForTier(power), !!c.boss);
  const hp = tiered ? base.hp : clampInt(enemy?.hp, 10, 50000, base.hp);
  // Enemies wear gear that fits their strength, so they are tougher by the same weapon and armor bonus a player would get.
  const worn = enemyGear(power);
  const skill = enemySkill(c.npc, power);
  return { ...c, power, enemySkill: skill, enemyShield: skill?.id === 'guard' ? skill.value : 0, enemyHp: hp + worn.hp, enemyMaxHp: hp + worn.hp, enemyDc: (tiered ? base.dc : clampInt(enemy?.dc, 6, 80, base.dc)) + worn.dc, enemyAtk: base.atk, enemyDamage: (tiered ? base.damage : clampInt(enemy?.damage, 2, 3000, base.damage)) + worn.damage, round: 1, itemUse: undefined };
};
// A monster or hostile NPC blocking the way: the player chooses to fight or to run (no talking).
type Threat = { npc: string; monster: boolean; level?: number; lead?: string; fleeTo?: { mapId: string; pinId: string } };
// Test commands: a named foe ("고블린") wins; otherwise a generic request ("몬스터 인카운트") rolls a local encounter.
const debugFoe = (g: Game, s: Session, command: string): Foe | undefined => {
  const genre = defaultMapGenre(g);
  const named = foesOf(genre).find(f => command.includes(f.name)) || foesOf(genre).find(f => f.name.split(' ').some(w => w.length >= 2 && !/무리|떼|패거리|우두머리|전사|병사/.test(w) && command.includes(w)));
  if (named) return named;
  if (!/몬스터|마물|괴물|습격|인카운트|적대|적 등장|매복/.test(command)) return undefined;
  const pin = (g.maps || []).find(m => m.id === s.mapId)?.pins.find(p => p.id === s.pinId);
  return pickEncounter(genre, `${pin?.name || ''} ${pin?.description || ''}`, s.level || 1, Math.random, s.recentFoes);
};
// At or below this an NPC attacks on sight instead of talking.
const HOSTILE_AFFECTION = -60;
// Max HP grows with level on top of the game's base HP.
// The mana pool: the sheet's 마나 value (fantasy) grows 2 a level, plus what robes add; 0 when the sheet has no mana.
const maxManaOf = (g: Game, s: Session) => { const field = (g.characterConfig || defaultCharacterConfig()).fields.find(f => f.id === 'mana'); if (!field) return 0; const base = Number(s.characterValues?.mana ?? field.initial) || 0; return base + 2 * ((s.level || 1) - 1) + gearOf(s.equipped, s.itemInfo).mana; };
const maxHpOf = (g: Game, s: Session) => g.hp + levelBonus(s.level || 1).hp + gearOf(s.equipped, s.itemInfo).hp;
const npcLevel = (s: Session, name: string): number | undefined => s.companions?.[name]?.level ?? (s.npcPower?.[name] ? levelForTier(s.npcPower[name]) : undefined);
// Use-based growth: what the player keeps doing builds up "training" on the matching stat,
// and each level-up spends GROWTH_POINTS weighted by it. Pools (mana, 내공) grow in bigger steps.
const GROWTH_POINTS = 3;
const growthFields = (g: Game) => (g.characterConfig || defaultCharacterConfig()).fields.filter(f => f.kind === 'number' && !/체온|단서|temperature|clue/i.test(f.id + f.name));
const statLike = (g: Game, re: RegExp) => growthFields(g).find(f => re.test(f.name) || re.test(f.id))?.id;
const STRENGTH = /근력|힘|외공|str/i, AGILITY = /민첩|경공|agi|dex/i, CHARM = /매력|화술|카리스마|cha/i, MIND = /지능|오성|통찰|관찰|추리|insight|int|logic/i;
const train = (s: Session, ids: (string | undefined)[], amount = 1): Session => {
  const t = { ...(s.training || {}) };
  for (const id of ids) if (id) t[id] = (t[id] || 0) + amount;
  return { ...s, training: t };
};
const growStats = (g: Game, s: Session, levels: number): { session: Session; note: string } => {
  const fields = growthFields(g);
  if (levels <= 0 || !fields.length) return { session: s, note: '' };
  const weights = fields.map(f => (s.training?.[f.id] || 0) + 0.5);
  const total = weights.reduce((a, b) => a + b, 0);
  const gains: Record<string, number> = {};
  for (let i = 0; i < levels * GROWTH_POINTS; i++) {
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
  const top = fields.filter(f => (s.training?.[f.id] || 0) > 0).sort((a, b) => (s.training?.[b.id] || 0) - (s.training?.[a.id] || 0))[0];
  return { session: { ...s, characterValues: values, training }, note: `성장: ${parts.join(', ')}${top ? ` (최근 ${top.name}을(를) 많이 썼습니다)` : ''}` };
};
// Quests pay experience that keeps pace with the player's level.
const withXp = (g: Game, s: Session, amount: number, reason: string): { session: Session; levelsGained: number } => {
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
  return { levelsGained: next.levelsGained, session: { ...growth.session, companions, hp: Math.min(maxHpOf(g, grown), s.hp + hpGain), log: [...s.log, `시스템: 경험치 +${amount.toLocaleString('ko-KR')} (${reason})`, ...(next.levelsGained ? [`시스템: 레벨 업! Lv.${before} → Lv.${next.level} · 최대 HP ${maxHpOf(g, s)} → ${maxHpOf(g, grown)}`, ...(growth.note ? [`시스템: ${growth.note}`] : [])] : []), ...allyUps] } };
};
// The story's main quest line: finishing one step hands out the next, and the last one is the ending.
// The stored step number is trusted while it still names a quest the player holds; the chains were regrouped
// (one-action steps folded into their neighbours), so an older save's number can point elsewhere and is worked out
// again from the quest list and the log.
const mainStepOf = (g: Game, s: Session) => {
  const chain = mainChain(g.wizardMain);
  if (s.mainStep !== undefined && (!chain || questsOf(s).includes(chain[s.mainStep]?.q))) return s.mainStep;
  if (!chain) return undefined;
  const i = chain.findIndex(st => questsOf(s).includes(st.q));
  if (i >= 0) return i;
  // A save whose main quest was already finished: continue from the last step the log shows as done.
  let last = -1;
  chain.forEach((st, k) => { if (s.log.some(e => e.startsWith(`시스템: 목표 완료 — ${st.q}`))) last = k; });
  return last >= 0 && last + 1 < chain.length ? last + 1 : undefined;
};
// A place inside a city (소금 골목, 북문 초소) also counts from that city's pin, so a scene heading that names only
// the city still finds it, but not while the scene names a different place in the same city (진흙 골목 is not 북문).
const cityOf = (genre: string, w: string) => cityPlaces(genre).find(([n]) => w.includes(n) || (w.length >= 3 && n.includes(w)))?.[1];
const atPlace = (genre: string, place: string[] | undefined, where: string, scene = '') => !place?.length || place.some(w => {
  if (where.includes(w)) return true;
  const city = cityOf(genre, w);
  return !!city && where.includes(city) && !cityPlaces(genre).some(([n]) => scene.includes(n) && !w.includes(n) && !n.includes(w));
});
// Quest steps the beat tracker follows: the main step in progress and every active regional step.
// key names the step by its quest text (main:<q>, region:<id>:<q>), so beat progress stays with the right quest
// even when step numbers change; step is its number in the chain.
type Tracked = { key: string; step: number; quest: string; kind: 'main' | 'region'; beats: Beat[]; story?: string };
const trackedQuests = (g: Game, s: Session): Tracked[] => {
  const step = mainStepOf(g, s), main = step === undefined ? undefined : mainChain(g.wizardMain)?.[step];
  return [
    ...(main?.beats?.length ? [{ key: `main:${main.q}`, step: step!, quest: main.q, kind: 'main' as const, beats: main.beats }] : []),
    ...regionActive(g, s).flatMap(({ r, i, step: st }) => st.beats?.length ? [{ key: `region:${r.id}:${st.q}`, step: i, quest: st.q, kind: 'region' as const, beats: st.beats, story: r.title }] : []),
  ];
};
const beatOf = (s: Session, t: Tracked): Beat | undefined => t.beats[s.questProgress?.[t.key] || 0];
// The line that concludes a quest conversation is shown as choice 1 while the person has quest business with the
// player: the GM writes it for the moment in its own field (acceptLine, checked by the server to be a decision, not a
// question) and the game remembers it as talkAccept; taking it carries out the talk beat and concludes the talk.
// TALK_ACCEPT stands in when the GM's line was missing or doubtful.
const TALK_ACCEPT = '알겠습니다. 그렇게 하겠습니다.';
// Whether this turn carries out the beat, from what the game itself knows before the GM writes anything.
// A defeat beat is never done here: only a fight won in the battle engine counts (finishBattle).
const beatFires = (g: Game, s: Session, b: Beat, message: string): boolean => {
  const here = atPlace(defaultMapGenre(g), 'at' in b ? b.at : undefined, regionWhere(g, s), s.scenePlace || '');
  switch (b.do) {
    // A talk counts wherever the two meet; its place only says where the person is found.
    case 'talk': return s.mode === 'talk' && s.talkNpc === b.npc && message.trim() === (s.talkAccept || TALK_ACCEPT);
    case 'reach': return !s.mode && here;
    case 'search': return !s.mode && here && !/^(시스템|전투 결과)/.test(message);
    case 'choose': return !s.mode && b.options.includes(message.trim());
    case 'defeat': return false;
  }
};
// A beaten foe answers a defeat beat by its roster name or the NPC's own name.
const sameFoe = (a: string, b: string) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
const mainQuestOf = (g: Game, s: Session) => { const step = mainStepOf(g, s); return step === undefined ? undefined : mainChain(g.wizardMain)?.[step]?.q; };
const advanceMain = (g: Game, current: Session, s: Session, done: string[], failed: string[]): { session: Session; next?: string } => {
  const chain = mainChain(g.wizardMain), step = mainStepOf(g, current);
  if (!chain || step === undefined || step >= chain.length) return { session: s };
  const main = chain[step].q;
  // The main quest never fails or drops out; the GM has to find another way forward.
  // A regional quest worded like a main step ("소금 골목의 뒷골목 불량배 정리하기") is its own quest and stays.
  const regional = new Set(regionActive(g, s).map(a => a.step.q));
  let quests = (s.quests || []).filter(q => regional.has(q) || (q !== main && !alikeQuest(q, main) && !(chain[step + 1] && alikeQuest(q, chain[step + 1].q))));
  let log = failed.includes(main) ? s.log.filter(l => l !== `시스템: 목표 실패 — ${main}`) : s.log;
  // A main quest recovered for an older save is announced once when it reappears in the list.
  if (!done.some(d => d === main || alikeQuest(d, main))) return { session: { ...s, mainStep: step, quests: [main, ...quests], log: (s.quests || []).includes(main) ? log : [...log, `시스템: 메인 목표 — ${main}`] } };
  const act = chain[step].act, next = chain[step + 1]?.q;
  const flags = act && act <= 3 && !(s.flags || []).includes(`막 완료:${act}`) ? [...(s.flags || []), `막 완료:${act}`] : s.flags;
  const goalSteps = (g.finalGoalSteps || []).filter(x => x.trim()).length;
  const completedGoalSteps = act && g.finalGoalMode === 'progress' && act <= goalSteps ? [...new Set([...(s.completedGoalSteps || []), act - 1])].sort((a, b) => a - b) : s.completedGoalSteps;
  if (next) { quests = [next, ...quests]; log = [...log, `시스템: 새 메인 목표 — ${next}`]; }
  const ending = !next && !s.goalCompleted;
  if (ending) log = [...log, '시스템: 최종 목표 달성 — 게임 완료'];
  return { session: { ...s, quests, flags, completedGoalSteps, mainStep: step + 1, goalCompleted: s.goalCompleted || !next, log }, next };
};
// Reward gear is graded from what foes of the player's level wear (rollGrade adds the source's step on top).
const rewardBase = (level: number) => gradeForTier(tierOfLevel(level));
// Regional quests (app/_lib/regional-quests.ts): place-bound stories and guild-board jobs beside the main story.
// A story opens by itself in its region when a quest slot is free; a full log means no new story shows up.
const RANK_FLOORS = [0, 100, 500, 2000, 5000, 15000];
const REGION_HOOK_GAP = 6;
const ALL_REGION_QUESTS = [...REGION_QUESTS, ...EXTRA_REGION_QUESTS];
const regionQuestsOf = (g: Game) => ALL_REGION_QUESTS.filter(r => r.genre === defaultMapGenre(g));
const regionWhere = (g: Game, s: Session) => { const map = (g.maps || []).find(m => m.id === s.mapId); const pin = map?.pins.find(p => p.id === s.pinId); return `${map?.name || ''} ${pin?.name || ''} ${s.scenePlace || ''}`; };
const inRegion = (r: RegionQuest, where: string) => r.region.some(w => where.includes(w));
const actsDone = (s: Session) => (s.flags || []).filter(f => f.startsWith('막 완료:')).length;
// The story as far as it has gone, for the GM: finished acts in full, the current act by its name only (what to do now
// comes from the quest beats), later acts not at all, and the progress goal up to the current act. With the whole
// outline in view the GM pulled the next quest into the scene (taking the player to 회색 탑 while the report to
// Edria at 북문 초소 was still due).
// Games built before still carry the old speech rules ("말투는 신분과 종족에 맞추고 현대 어휘는 쓰지 않는다",
// "총기·전기·현대 어휘와 상태창은 없다"); the modern-word ban and the rank-based speech hint go as the prompt is sent.
const withoutOldSpeechRules = (prompt: string) => prompt.replace(/말투는 [^.\n]*현대 어휘는 쓰지 않는다\./g, '인물의 말투(어체)는 각자의 설정 말투를 따른다.').replace(/·현대 어휘와/g, '와');
const promptUpToAct = (prompt: string, done: number) => prompt.split('\n').flatMap(line => {
  const act = line.match(/^(\s*-\s*)(\d)막\s+([^:：]+)[:：]/);
  if (act) { const n = Number(act[2]); return n <= done ? [line] : n === done + 1 ? [`${act[1]}${n}막 ${act[3].trim()}: 진행 중. 지금 할 일은 currentState.mainQuest와 questBeats를 따른다.`] : []; }
  if (/^\s*최종 목표\(진행도형\)[:：]/.test(line)) return [line.split('→').slice(0, done + 1).join('→').trim()];
  return [line];
}).join('\n');
const playerActs = (s: Session) => s.log.filter(e => e.startsWith('플레이어:')).length;
const regionOpen = (s: Session, r: RegionQuest) => !(s.regionDone || []).includes(r.id) && s.regionQuests?.[r.id] === undefined
  && Math.max(0, s.reputation || 0) >= RANK_FLOORS[r.minRank || 0] && actsDone(s) >= (r.minAct || 0) && (!r.after || (s.regionDone || []).includes(r.after));
const regionActive = (g: Game, s: Session) => regionQuestsOf(g).flatMap(r => { const i = s.regionQuests?.[r.id]; return i === undefined || !r.steps[i] ? [] : [{ r, i, step: r.steps[i] }]; });
const regionKindOf = (g: Game, s: Session, quest: string) => regionActive(g, s).find(a => a.step.q === quest)?.r.kind;
const regionBoard = (g: Game, s: Session) => regionQuestsOf(g).filter(r => r.kind === 'board' && inRegion(r, regionWhere(g, s)) && regionOpen(s, r));
// Not in the first actions of a game, nor while the opening errand of the main story is still open.
const pickRegionHook = (g: Game, s: Session, where: string) => questsOf(s).length >= MAX_QUESTS || playerActs(s) < REGION_HOOK_GAP || mainStepOf(g, s) === 0 || playerActs(s) - (s.lastRegionHook ?? -REGION_HOOK_GAP) < REGION_HOOK_GAP ? undefined
  : regionQuestsOf(g).find(r => r.kind === 'story' && regionOpen(s, r) && inRegion(r, where));
const startRegion = (s: Session, r: RegionQuest, hooked: boolean): Session => {
  const q = r.steps[0].q;
  return { ...s, quests: [...questsOf(s), q], questGivers: { ...(s.questGivers || {}), [q]: r.giver }, regionQuests: { ...(s.regionQuests || {}), [r.id]: 0 },
    ...(hooked ? { lastRegionHook: playerActs(s) } : {}), log: [...s.log, `시스템: ${r.kind === 'story' ? '지역 이야기' : '의뢰 수락'} — ${r.title}`, `시스템: 새 목표 — ${q}`] };
};
// Hands out the next step of each regional quest finished this turn; the last step closes it. A regional quest
// that left the log some other way (dropped, failed) is forgotten, so it can come up again later.
const advanceRegion = (g: Game, before: Session, s: Session, done: string[]): { session: Session; finished: RegionQuest[] } => {
  let quests = questsOf(s), log = s.log, givers = { ...(s.questGivers || {}) };
  const progress = { ...(s.regionQuests || {}) }, regionDone = [...(s.regionDone || [])], finished: RegionQuest[] = [];
  for (const { r, i, step } of regionActive(g, before)) {
    // Done entries are the log's own quest texts (applyQuests maps the GM's wording onto them), so an exact match
    // keeps two similar jobs ("…브레이크 마수 군집 막아 내기") from closing together.
    if (done.includes(step.q)) {
      // Exact text only: a loose match could take the main quest out along with it.
      quests = quests.filter(q => q !== step.q);
      const next = r.steps[i + 1];
      if (next) { progress[r.id] = i + 1; quests = [...quests, next.q]; givers[next.q] = r.giver; log = [...log, `시스템: 새 목표 — ${next.q}`]; }
      else { delete progress[r.id]; regionDone.push(r.id); finished.push(r); log = [...log, `시스템: ${r.kind === 'story' ? '지역 이야기 완료' : '의뢰 완료'} — ${r.title}`]; }
    } else if (!quests.includes(step.q)) delete progress[r.id];
  }
  return { session: { ...s, quests, questGivers: givers, regionQuests: progress, regionDone, log }, finished };
};
// One automatic exchange: the player strikes, then the foe answers if still standing.
// Player damage scales with the foe's size so an ordinary fight resolves in about ten exchanges.
// How long the check die tumbles on screen before it lands.
const DICE_ROLL_MS = 1200;
const AUTO_BATTLE_LIMIT = 40;
// Magic (a staff makes a caster): the cast gauge fills 100% a round plus the gear's cast speed, and a spell fires at
// SPELL_GAUGE, paying SPELL_COST mana. Spells aim at the foe's magic resistance (MAGIC_RESIST of its DC), and swing
// widely around twice a weapon hit, scaled from ×0.7 at Lv.1 to ×1.2 at Lv.100: weaker than a fighter early, stronger
// late (balance: scratchpad magesim.mjs). Mana comes back MANA_REGEN_ROUND a round in a fight, MANA_REGEN_TURN a turn
// outside one.
const SPELL_GAUGE = 200, SPELL_COST = 15, MAGIC_RESIST = 0.75, MANA_REGEN_ROUND = 0.03, MANA_REGEN_TURN = 0.1;
const spellScale = (level: number) => 0.7 + 0.5 * (Math.min(100, Math.max(1, level)) - 1) / 99;
// The player's combat numbers, shared by the battle and the character panel so what is shown is what is used.
// Weapon blows go with strength (외공 in wuxia), spells with intelligence; equipped items add to hit, damage and dodge.
const combatStatsOf = (g: Game, s: Session) => {
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
const autoBattleStep = (g: Game, s: Session): Session => {
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
      if (hit > 0 && skill('bleed')) { const fresh = !bleedTurns; bleed = skill('bleed'); bleedTurns = 3; if (fresh) lines.push(`[${skillName('bleed')}] 출혈 — ${c.npc}이(가) 피를 흘린다 (3라운드, 매 라운드 ${bleed})`); }
      if (hit > 0 && skill('poison') && poison < 5) { poison += 1; lines.push(`[${skillName('poison')}] 독 — ${c.npc}에게 독 ${poison}중첩`); }
      if (hit > 0 && !stunned && skill('stun') && Math.random() * 100 < skill('stun')) { stunned = true; lines.push(`[${skillName('stun')}] 기절 — ${c.npc}이(가) 비틀거린다`); }
      const healed = Math.min(maxHp - hp, Math.round(hit * skill('lifesteal') / 100));
      if (healed > 0) { hp += healed; lines.push(`[${skillName('lifesteal')}] 흡혈 — HP ${healed} 회복 · 내 HP ${hp}/${maxHp}`); }
    } else lines.push(`${extra ? `[${skillName('double')}] 연타 — ` : ''}${spell ? '마법이 빗나갔다' : '내 공격이 빗나갔다'} — ${c.npc}이(가) 피했다`);
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
  if (enemyHp > 0 && stunned) lines.push(`${c.npc}은(는) 기절해 반격하지 못했다`);
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
  if (result) lines.push(result === 'win' ? `승리 — ${c.npc}을(를) 쓰러뜨렸다` : knockedOut ? `패배 — ${c.npc}에게 쓰러져 빈사 상태가 됐다 (HP 1)` : `패배 — ${c.npc}에게 쓰러졌다`);
  return { ...s, hp, ...(maxMana > 0 ? { mana } : {}), combat: { ...c, castGauge: caster ? gauge : undefined, enemyHp, shield, enemyShield, foeBleed: bleed, foeBleedTurns: bleedTurns, foePoison: poison, round, lastDealt: dealt, lastTaken: taken, last: { allies: allyHits, dealt, critDealt: critDealt && dealt > 0, taken: countered ? taken : null, critTaken: critTaken && taken > 0 }, totalDealt: (c.totalDealt || 0) + dealt, totalTaken: (c.totalTaken || 0) + taken, result }, log: [...s.log, ...lines.map(l => `전투: ${l}`)] };
};
const battleIntro = (c: CombatState, hp: number, maxHp: number) => `전투: ${c.npc}의 체력 ${c.enemyHp} · 나의 체력 ${hp}/${maxHp} — 전투 시작`;
// The story log is text only; images belong to the scene stage.
const storyText = (text: string) => text.replace(/\{\{\s*img\s*::[^{}\n]*\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
// GM narration in the story log reads as narration / speech / narration: the 【장소 · 때】 heading stands apart, and
// every quoted line is pulled out of its paragraph onto its own indented line, even when the GM ran it into the prose.
const QUOTE = /(["“][^"”\n]{1,400}["”]|「[^」\n]{1,400}」)/;
const WHOLE_QUOTE = new RegExp(`^${QUOTE.source}$`);
function StoryProse({ text }: { text: string }) {
  const blocks: { kind: 'heading' | 'speech' | 'narration'; text: string }[] = [];
  for (const raw of text.split(/\n+/)) {
    let p = raw.trim();
    const heading = p.match(/^【([^】]+)】\s*(.*)$/);
    if (heading) { blocks.push({ kind: 'heading', text: heading[1] }); p = heading[2].trim(); }
    for (const s of p.split(QUOTE).map(x => x.trim()).filter(Boolean)) blocks.push(WHOLE_QUOTE.test(s) ? { kind: 'speech', text: s.slice(1, -1) } : { kind: 'narration', text: s });
  }
  return <>{blocks.map((b, i) => b.kind === 'heading' ? <div key={i} className="storyHeading">{b.text}</div>
    : b.kind === 'speech' ? <p key={i} className="storySpeech"><q className="storyQuote">{b.text}</q></p>
    : <p key={i} className="storyNarration">{b.text}</p>)}</>;
}
// Talk lines are stored structured so they can render as chat bubbles instead of prose.
type TalkLine = { speaker: 'me' | 'npc' | 'scene'; name: string; line: string; gesture?: string; quiet?: boolean };
const parseTalk = (entry: string): TalkLine | null => {
  if (entry.startsWith('대화-나:')) return { speaker: 'me', name: '나', line: entry.slice(5).trim() };
  if (entry.startsWith('대화-상황:')) return { speaker: 'scene', name: '', line: entry.slice(6).trim() };
  if (!entry.startsWith('대화-NPC:')) return null;
  try { const v = JSON.parse(entry.slice(7)); return { speaker: 'npc', name: String(v.name || ''), line: String(v.line || ''), gesture: typeof v.gesture === 'string' ? v.gesture : '', quiet: v.quiet === true }; } catch { return null; }
};
// The GM reads the conversation as plain dialogue.
const historyLine = (entry: string) => { const t = parseTalk(entry); return !t ? entry : t.speaker === 'scene' ? `(상황) ${t.line}` : t.speaker === 'me' ? `플레이어: "${t.line}"` : `${t.name}: "${t.line}"${t.gesture ? ` (${t.gesture})` : ''}`; };
// The GM's talk reply in reading order: narration lines and speech bubbles alternate as written.
// The gesture rides on the first bubble; its label is hidden when narration already describes it.
const talkEntries = (npc: string, data: { parts?: unknown; text?: unknown; line?: unknown; gesture?: unknown }): string[] => {
  const gesture = typeof data.gesture === 'string' ? data.gesture : '';
  const parts = Array.isArray(data.parts) ? data.parts.filter((p): p is { type: string; text: string } => !!p && typeof p.text === 'string' && !!p.text.trim()) : [];
  const ordered = parts.length ? parts : [...(typeof data.text === 'string' && data.text.trim() ? [{ type: 'scene', text: data.text }] : []), { type: 'speech', text: String(data.line || '…') }];
  const quiet = ordered.some(p => p.type === 'scene');
  let first = true;
  return ordered.map(p => {
    if (p.type === 'scene') return `대화-상황: ${p.text.trim()}`;
    const entry = `대화-NPC: ${JSON.stringify({ name: npc, line: p.text.trim().replace(/^["“”']+|["“”']+$/g, ''), gesture: first ? gesture : '', quiet })}`;
    first = false;
    return entry;
  });
};
// A narrated intent ("~에 대해 묻는다") in the current conversation is replaced by the line the GM phrased as real speech.
const withPlayerLine = (log: string[], line: unknown) => {
  if (typeof line !== 'string' || !line.trim()) return log;
  const start = log.map(e => e.startsWith('시스템:') && e.includes('대화를 시작했습니다')).lastIndexOf(true);
  const mine = log.map(e => e.startsWith('대화-나:')).lastIndexOf(true);
  return mine > start ? [...log.slice(0, mine), `대화-나: ${line.trim()}`, ...log.slice(mine + 1)] : log;
};
// Normal-mode actions that address someone on stage ("당설화에게 ~을 묻는다") open a conversation instead.
const SPEECH_INTENT = /(묻|물어|말을 건|말한다|말해|부탁|요청|청한|이야기|알려 달라|알려달라|설득|인사|대화|질문|따진|사과|고백|제안|되묻)/;
type LogItem = { kind: 'entry'; entry: string } | { kind: 'talk'; lines: TalkLine[] } | { kind: 'battle'; lines: string[] };
const groupLog = (log: string[]): LogItem[] => { let openTalk: { kind: 'talk'; lines: TalkLine[] } | null = null; return log.reduce<LogItem[]>((items, entry) => {
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
const DEFAULT_NPC_NAMES: Record<string, string[]> = {
  wuxia: ["연청", "청연", "설영", "천소화", "정혜", "한설아", "소화", "남궁세린", "당설화", "제갈연", "팽소연", "모용설", "이정", "월하", "혈영", "단유", "홍랑", "왕소교", "류월", "독고연", "진하", "백초희", "운낭", "마련"],
  fantasy: ["그리마 철망치", "넬", "레지나 발트", "리오네 아스크", "말라키아", "미라벨 크로우", "바레나", "브리아", "세라핀", "실바엘", "아우렐리아", "에드리아 하르트", "엘로이즈", "오르벨라", "오틸리에 마른", "우르술라", "이졸데", "카시아", "테오도라", "핍", "한나"],
  modern: ["강태희", "고명숙", "김기연", "나연", "마서윤", "문지혜", "민하늘", "박진아", "백희원", "서지아", "송재은", "오은비", "유채린", "윤세진", "이소라", "장민서", "정유겸", "차유진", "최혜령", "한도연"]
};
const defaultNpcImage = (g: Game, name: string) => { const genre = defaultMapGenre(g); return DEFAULT_NPC_NAMES[genre]?.includes(name) ? `/api/default-npc/${encodeURIComponent(name)}?genre=${genre}` : undefined; };
// Browsers held built-in NPC art for a day under the old cache header; a version tag fetches the replaced files.
const freshAsset = (url?: string) => url && url.startsWith('/api/default-npc/') && !/[?&]v=/.test(url) ? `${url}${url.includes('?') ? '&' : '?'}v=2` : url;
// Anyone without art (a newcomer the GM brought in, an unnamed extra) gets the genre's stand-in portrait.
const unknownNpcImage = (g: Game) => `/api/default-npc/_unknown?genre=${defaultMapGenre(g)}`;
const npcImage = (g: Game, name: string, activeKey?: string) => {
  const cell = activeKey?.startsWith(name + '::') ? (g.imageCells || []).find(c => { const row = (g.imageRows || []).find(r => r.id === c.rowId); const col = (g.imageColumns || []).find(x => x.id === c.columnId); return !!row && !!col && `${row.name}::${col.name}` === activeKey; }) : undefined;
  return freshAsset(cell?.image || (g.npcPortraits || []).find(n => n.name === name)?.image || defaultNpcImage(g, name) || unknownNpcImage(g));
};
// 장르별 프롤로그의 첫 행동은 맵 탐색보다 사건과 인물에 직접 연결합니다.
const openingActions = (g: Game): string[] => {
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
const defaultActions = (g: Game, mapId?: string, pinId?: string): string[] => {
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
const START_PROFILES: Record<string, { job: string; stats: Record<string, string> }> = {
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
const startValues = (g: Game) => { const extra = START_PROFILES[g.wizardStart || '']?.stats || {}; return Object.fromEntries((g.characterConfig || defaultCharacterConfig()).fields.map(f => [f.id, extra[f.id] ?? f.initial])); };
// The start's stats as a short line for the wizard's choice cards, e.g. "근력 15 · 민첩 10".
const startStatLine = (g: Game, start: string) => { const stats = START_PROFILES[start]?.stats; return stats ? (g.characterConfig || defaultCharacterConfig()).fields.filter(f => stats[f.id]).map(f => `${f.name} ${stats[f.id]}`).join(' · ') : ''; };
// The story's own start items (the sword the dying knight hands over) go into the pack once, equipped if the slot is
// free. A flag marks them given, so a save made before this existed gets them, and a lost sword never comes back.
const withStoryItems = (g: Game, s: Session): Session => {
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
const wearStartGear = (s: Session): Session => { const equipped: Equipped = { ...(s.equipped || {}) }; for (const n of s.inventory || []) { const k = infoOf(n, s.itemInfo).kind; if (k !== 'item' && !equipped[k]) equipped[k] = n; } return { ...s, equipped }; };
const makeSession = (g: Game): Session => withStoryItems(g, wearStartGear({
  ...getStartingLocation(g), gameId: g.id,
  x: Math.floor(g.size / 2), y: Math.floor(g.size / 2), hp: g.hp,
  inventory: combinedStartingItems(g.prompt || '', g.startingEquipment || ''),
  characterValues: startValues(g), characterEquipment: {}, characterGold: (g.characterConfig || defaultCharacterConfig()).initialGold,
  flags: [], triggeredEvents: [], completedGoalSteps:[],currentGoal: '', quests: mainPrologue(g.wizardMain)?.firstQuest ? [mainPrologue(g.wizardMain)!.firstQuest] : [], mainStep: mainChain(g.wizardMain) ? 0 : undefined, reputation: 0, party: [], goalCompleted:false, relationships: [], sceneNpcs: [], suggestedActions: prologueText(g).trim() ? openingActions(g) : defaultActions(g, getStartingLocation(g).mapId, getStartingLocation(g).pinId), activeImageKey: undefined, roll: null, pendingCheck: null, lastCheck: null,
  log: [prologueText(g).trim() ? `프롤로그: ${prologueText(g).trim()}` : 'GM: 모험의 첫 장이 열린다. 주변 풍경을 살피며 어디로 향할지 정할 수 있다.']
}));

function PrologueOpening({game}:{game:Game}) {const image=prologueImage(game);return <div className="prologueOpening">{image&&<img className="prologueHero" src={image} alt={prologueTitle(game)}/>}<div className="prologueOpeningBody"><span className="prologueEyebrow">PROLOGUE</span><h3>{prologueTitle(game)}</h3><PrologueRichText text={prologueText(game)} game={game}/></div></div>;}

/** Shared renderer for prologue preview and the actual play log. */
// Light-novel style reactions: the partner's gesture (or, failing that, their punctuation) picks a short motion.
const gestureMotion = (gesture = '', line = '') => {
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
function TypeText({ text }: { text: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(text.length); return; }
    setShown(0);
    const id = setInterval(() => setShown(n => { if (n >= text.length) { clearInterval(id); return n; } return n + 1; }), 28);
    return () => clearInterval(id);
  }, [text]);
  return <span className="typeText" onClick={() => setShown(text.length)}>{text.slice(0, shown)}{shown < text.length && <i className="typeCaret" aria-hidden="true"/>}</span>;
}
function TalkBubble({ t, image, typing = false }: { t: TalkLine; image?: string; typing?: boolean }) {
  // Talk reads like a messenger chat: narration from older saves is hidden and gestures only drive the sprite motion.
  if (t.speaker === 'scene') return null;
  if (t.speaker === 'me') return <div className="talkRow talkMe"><div className="talkBubbleBox">{t.line}</div></div>;
  return <div className="talkRow talkNpc"><span className="talkAvatar">{image ? <img src={image} alt=""/> : t.name.slice(0, 1)}</span><div className="talkBody"><span className="talkName">{t.name}</span><div className="talkBubbleBox" aria-label={t.line}>{typing ? <TypeText text={t.line}/> : t.line}</div></div></div>;
}
function PrologueRichText({text,game}:{text:string;game:Game}) {
  const tokens = text.split(/(\{\{\s*img\s*::[^{}\n]+::[^{}\n]+\}\})/g);
  const inlineTagged=new Set([...text.matchAll(/\{\{\s*img\s*::([^:{}]+)::/g)].map(x=>x[1].trim()));
  const present=(game.npcPortraits||[]).filter(n=>n.image&&!inlineTagged.has(n.name)&&new RegExp(`(^|[^가-힣])${n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=[^가-힣]|$)`).test(text));
  return <div className="prologueRichText">{present.slice(0,2).map(n=><figure key={n.id} className="prologueInlineImage"><img src={freshAsset(n.image)} alt={n.name} loading="lazy"/></figure>)}{tokens.map((token,index)=>{
    const match = /^\{\{\s*img\s*::([^{}\n]+)::([^{}\n]+)\}\}$/.exec(token);
    if (!match) return token ? <span key={index} className="prologueTextSegment">{token}</span> : null;
    const category=match[1].trim(), situation=match[2].trim();
    const portrait=(game.npcPortraits||[]).find(n=>n.name===category||n.id===category);
    if(portrait?.image && (situation==='기본'||situation==='default'))return <figure key={index} className="prologueInlineImage"><img src={portrait.image} alt={portrait.name} loading="lazy"/></figure>;
    const row=(game.imageRows||[]).find(r=>r.name.trim()===category);
    const column=(game.imageColumns||[]).find(c=>c.name.trim()===situation);
    const cell=(game.imageCells||[]).find(c=>c.rowId===row?.id&&c.columnId===column?.id&&!!c.image);
    return cell ? <figure key={index} className="prologueInlineImage"><img src={cell.image} alt={`${category} · ${situation}`} loading="lazy"/></figure> : null;
  })}</div>;
}

const tabs: { id: Tab; label: string }[] = [{ id: 'prompt', label: '게임 프롬프트' }, { id: 'settings', label: '게임 설정' }, { id: 'register', label: '등록' }];

// Tooltip for an item: grade, kind, description, stat bonus and unique skill.
const itemTitle = (name: string, it: ItemInfo) => [`[${GRADE_LABELS[it.grade]}] ${KIND_LABELS[it.kind]} · ${name}`, it.desc, bonusText(it, name), skillText(it)].filter(Boolean).join('\n');
// What a foe brings to a fight: its strength tier plus the gear it wears, and its unique skill.
function FoeCard({ name, tier: baseTier, level, desc, boss }: { name: string; tier: number; level?: number; desc?: string; boss?: boolean }) {
  const tier = level ? tierOfLevel(level) : Math.max(1, Math.min(MAX_POWER, baseTier));
  const base = enemyStats(level ?? levelForTier(tier), boss), worn = enemyGear(tier), skill = enemySkill(name, tier), grade = gradeForTier(tier);
  return <div className="foeCard">
    {desc && <p className="foeDesc">{desc}</p>}
    <div className="foeStats"><span>체력 <b>{(base.hp + worn.hp).toLocaleString('ko-KR')}</b></span><span>공격 <b>{base.damage + worn.damage}</b></span><span>방어 <b>{base.dc + worn.dc}</b></span><span className={`grade${grade}`}>장비 <b>{GRADE_LABELS[grade]}</b></span></div>
    {skill && <div className="foeSkill"><Zap size={13}/> 고유 능력 · {enemySkillText(skill)}</div>}
  </div>;
}
// Details of one inventory item: grade, kind, bonuses, skill, description, and equip/unequip for gear.
// on: this very copy is the equipped one. A second copy of an equipped item can't be equipped on top of it.
function ItemCard({ name, session, on, onEquip, onUse, onDiscard, maxHp, onClose }: { name: string; session: Session; on: boolean; onEquip?: (item: string) => void; onUse?: (item: string) => void; onDiscard?: () => void; maxHp: number; onClose: () => void }) {
  const heal = Math.round(maxHp * healShareOf(name, infoOf(name, session.itemInfo)));
  const it = infoOf(name, session.itemInfo), bonus = bonusText(it, name), gear = it.kind !== 'item';
  const worn = gear ? session.equipped?.[it.kind as Exclude<ItemKind, 'item'>] : undefined;
  const twin = !on && worn === name;
  return <div className={`itemCard grade${it.grade}`}>
    <div className="itemCardHead"><span>[{GRADE_LABELS[it.grade]}] {KIND_LABELS[it.kind]}{on ? ' · 장착 중' : ''}</span><button type="button" aria-label="닫기" onClick={onClose}><X size={13}/></button></div>
    <strong>{name}</strong>
    {bonus ? <div className="itemCardStats">{bonus.split(' · ').map(b => <span key={b}>{b}</span>)}</div> : gear && <div className="itemCardNone">추가 능력치 없음</div>}
    {it.skill && <div className="itemCardSkill"><Zap size={12}/> {skillText(it)}</div>}
    {it.desc && <p>{it.desc}</p>}
    {heal > 0 && onUse && <button type="button" className="itemCardEquip" disabled={session.hp >= maxHp} onClick={() => onUse(name)}>{session.hp >= maxHp ? 'HP가 가득 찼습니다' : `사용 (HP +${heal})`}</button>}
    {gear && onEquip && (twin ? <div className="itemCardNone">같은 장비를 이미 장착하고 있습니다.</div> : <button type="button" className="itemCardEquip" onClick={() => onEquip(name)}>{on ? '장착 해제' : worn ? `장착 (${worn} 대신)` : '장착'}</button>)}
    {onDiscard && <button type="button" className="itemCardDiscard" onClick={onDiscard}>버리기</button>}
  </div>;
}
function CharacterPanel({game,session,portrait,onInvite,onLeave,onDropQuest,onEquip,onUse,onDiscard}:{game:Game;session:Session;portrait?:string;onEquip?:(item:string)=>void;onUse?:(item:string)=>void;onDiscard?:(item:string,index:number)=>void;onInvite?:(npc:string)=>void;onLeave?:(npc:string)=>void;onDropQuest?:(quest:string)=>void}) {
 const c=game.characterConfig || defaultCharacterConfig();
 const hasStartingItems = combinedStartingItems(game.prompt || '', game.startingEquipment || '').length > 0;
 const tabs=([['stats','능력치'],['inventory','인벤토리'],['status','상태'],['relationships','관계도']] as const).filter(([key])=>key==='relationships' ? c.sections.relationships !== false : (c.sections[key] || (key==='inventory' && (hasStartingItems || c.sections.equipment))));
 const [active,setActive]=useState<string>('stats');
 // Items are told apart by inventory position, since two copies can share a name. Only the first copy counts as the
 // equipped one (equipped stores names); picked keeps the name too, so a shifted inventory drops the selection.
 const inv=session.inventory||[];
 const [picked,setPicked]=useState<{i:number;name:string}|null>(null);
 const pickedItem=picked&&inv[picked.i]===picked.name?picked.name:null;
 const pick=(i:number)=>i>=0&&setPicked(p=>p&&p.i===i&&inv[i]===p.name?null:{i,name:inv[i]});
 const isEquipped=(item:string,i:number)=>Object.values(session.equipped||{}).includes(item)&&inv.indexOf(item)===i;
 const selected=tabs.some(([key])=>key===active)?active:tabs[0]?.[0];
 if(!c.sections.character && tabs.length===0)return null;
 return <div className="characterPanel"><div className="characterPanelHeading"><strong>플레이어 정보</strong><span>게임별 설정</span></div>
 <section className="questLog" aria-label="퀘스트"><div className="questLogHeading"><strong><ScrollText size={15}/> 퀘스트</strong><span>{questsOf(session).length} / {Math.max(MAX_QUESTS, questsOf(session).length)}</span></div>{Array.from({length:Math.max(MAX_QUESTS, questsOf(session).length)},(_,i)=>questsOf(session)[i]).map((q,i)=>q ? <div key={i} className={`questCard${q === mainQuestOf(game, session) ? ' questMain' : regionKindOf(game, session, q) ? ' questRegion' : ''}`}><span className="questBadge">{q === mainQuestOf(game, session) ? '메인' : regionKindOf(game, session, q) === 'story' ? '지역' : regionKindOf(game, session, q) === 'board' ? '의뢰' : i+1}</span><p>{q}</p><small>{session.questGivers?.[q] ? <>의뢰 · <b>{session.questGivers[q]}</b></> : '진행 중'}</small>{onDropQuest && q !== mainQuestOf(game, session) && <button type="button" className="questDrop" aria-label={`퀘스트 삭제: ${q}`} title="퀘스트 삭제" onClick={() => onDropQuest(q)}><X size={13}/></button>}</div> : <div key={i} className="questCard questEmpty">빈 퀘스트 슬롯</div>)}</section>

 {session.goalCompleted && <div className="characterGoal"><strong>게임 완료</strong> <span>최종 목표를 달성했습니다. 엔딩이 확정되었습니다.</span></div>}
 {c.sections.character&&<div className="characterSummary">{portrait&&<img className="characterPortrait" src={portrait} alt="플레이어 캐릭터"/>}<div className="characterIdentity"><strong>{c.initialName || '모험가'}</strong><small>{[c.initialRace,START_PROFILES[game.wizardStart || '']?.job || c.initialJob].filter(Boolean).join(' · ')}</small>{game.showHpBar !== false && <div className="characterVitals"><span>HP {session.hp}/{maxHpOf(game, session)}</span><div className="characterVitalTrack"><i style={{width:`${Math.max(0,Math.min(100,session.hp/Math.max(1,maxHpOf(game, session))*100))}%`}}/></div></div>}{maxManaOf(game, session) > 0 && (() => { const mm = maxManaOf(game, session), mp = Math.min(mm, session.mana ?? mm); return <div className="characterVitals characterMp"><span>MP {mp}/{mm}</span><div className="characterVitalTrack"><i style={{width:`${mp / mm * 100}%`}}/></div></div>; })()}<div className="characterLevel"><b>Lv.{session.level || 1}{(session.level || 1) >= MAX_LEVEL ? ' (MAX)' : ''}</b></div><div className="characterVitals characterExp"><span>EXP {(session.level || 1) >= MAX_LEVEL ? 'MAX' : `${(session.xp || 0).toLocaleString('ko-KR')} / ${xpToNext(session.level || 1).toLocaleString('ko-KR')}`}</span><div className="characterVitalTrack"><i style={{width:`${(session.level || 1) >= MAX_LEVEL ? 100 : Math.min(100, (session.xp || 0) / xpToNext(session.level || 1) * 100)}%`}}/></div></div>{c.initialGold > 0 && <small>소지금 {session.characterGold ?? c.initialGold} G</small>}<div className={`characterReputation${(session.reputation || 0) < 0 ? ' infamy' : ''}`}><Award size={16}/><span>명성</span><b>{(session.reputation || 0).toLocaleString('ko-KR')}</b><em>{reputationRank(session.reputation || 0)}</em></div>{(() => { const cs = combatStatsOf(game, session), sign = (n: number) => `${n >= 0 ? '+' : ''}${n}`; return <div className="characterCombat" aria-label="전투 능력">
  <div><span>공격 명중</span><b>{sign(cs.hit)}</b></div>
  <div><span>{cs.gear.caster ? '지팡이 타격' : '공격 피해'}</span><b>{cs.gear.caster ? `${Math.max(1, 1 + cs.strength)}~${Math.max(1, 4 + cs.strength)}` : `${cs.blow[0]}~${cs.blow[1]}`}</b></div>
  {cs.gear.caster && cs.maxMana > 0 && <><div><span>마법 명중</span><b>{sign(cs.spellHit)}</b></div><div><span>마법 피해</span><b>{cs.spell[0]}~{cs.spell[1]}</b></div><div><span>시전 속도</span><b>+{cs.gear.haste}%</b></div><div><span>주문 마나</span><b>{SPELL_COST}</b></div></>}
  <div><span>회피</span><b>{cs.dodge}</b></div>
  <div><span>치명타</span><b>{`${(21 - cs.critFrom) * 5}% (주사위 ${cs.critFrom >= 20 ? '20' : `${cs.critFrom}~20`})`}</b></div>
  {cs.gear.skills.length > 0 && <div className="characterCombatSkills"><span>고유 능력</span><b>{cs.gear.skills.map(k => `${k.name}(${SKILLS[k.id].label})`).join(' · ')}</b></div>}
</div>; })()}</div></div>}
 {tabs.length>0&&<><div className="characterTabs">{tabs.map(([key,label])=><button key={key} type="button" className={selected===key?'active':''} onClick={()=>setActive(key)}>{label}</button>)}</div><div className="characterTabBody">
 {selected==='stats'&&<div className="characterStatGrid">{c.fields.filter(f=>f.visible&&!(f.id==='mana'&&maxManaOf(game,session)>0)).map(f=>{const value=session.characterValues?.[f.id] ?? f.initial;return <div className="characterStat" key={f.id}><small>{statDisplayName(f)}</small><strong>{statDisplayValue(f,String(value))}{f.kind==='gauge'?` / ${f.max || 100}`:''}</strong>{f.kind==='gauge'&&<div className="characterStatTrack"><i style={{width:`${Math.max(0,Math.min(100,Number(value)/Math.max(1,f.max || 100)*100))}%`}}/></div>}</div>;})}{c.fields.every(f=>!f.visible)&&<p>표시할 능력치가 없습니다.</p>}</div>}
 {selected==='inventory'&&<><div className="gearSlots">{(['weapon','armor','accessory'] as const).map(k=>{const n=session.equipped?.[k];const it=n?infoOf(n,session.itemInfo):undefined;return <button type="button" key={k} className={`gearSlot${it?` grade${it.grade}`:''}${n&&picked&&n===pickedItem&&inv.indexOf(n)===picked.i?' picked':''}`} disabled={!n} onClick={()=>n&&pick(inv.indexOf(n))}><small>{KIND_LABELS[k]}</small><b>{n||'비어 있음'}</b>{it?.skill&&<em>{it.skill.name}</em>}</button>;})}</div><div className="characterItems">{(session.inventory || []).length?(session.inventory || []).map((item,i)=>{const it=infoOf(item,session.itemInfo);const on=isEquipped(item,i);return <button type="button" key={`${item}-${i}`} className={`itemChip grade${it.grade}${on?' equipped':''}${picked?.i===i&&item===pickedItem?' picked':''}`} onClick={()=>pick(i)}>{it.grade>0&&<em>{GRADE_LABELS[it.grade]}</em>}{item}{on&&<Check size={11}/>}</button>;}):<p>인벤토리가 비어 있습니다.</p>}</div>{pickedItem?<ItemCard name={pickedItem} session={session} on={isEquipped(pickedItem,picked!.i)} onUse={onUse} maxHp={maxHpOf(game,session)} onEquip={onEquip} onDiscard={onDiscard?()=>{onDiscard(pickedItem,picked!.i);setPicked(null);}:undefined} onClose={()=>setPicked(null)}/>:(session.inventory||[]).length>0&&<small className="gearHint">아이템을 누르면 능력과 설명이 보입니다.</small>}</>}
 {selected==='status'&&<p className="characterEmptyStatus">적용된 상태 효과가 없습니다.</p>}
 {selected==='relationships'&&<div className="relationshipList">{(session.relationships||[]).length ? (session.relationships||[]).map(person=>{const image=(()=>{const portrait=(game.npcPortraits||[]).find(n=>n.name.trim()===person.name.trim());if(portrait?.image)return portrait.image;const row=(game.imageRows||[]).find(r=>r.name.trim()===person.name.trim());const col=(game.imageColumns||[]).find(x=>x.name.trim()==='기본');return (game.imageCells||[]).find(cell=>cell.rowId===row?.id&&cell.columnId===col?.id)?.image||npcImage(game,person.name);})();return <div key={person.id} className="relationshipPerson">{image && <div className="relationshipPhoto"><img src={image} alt={`${person.name} 인물 사진`}/></div>}<div className="relationshipDetails"><strong>{person.name}{npcLevel(session, person.name) && <em className="npcLevelTag">Lv.{npcLevel(session, person.name)}</em>}</strong><small>관계 · {person.relation}{(session.party || []).includes(person.name) && <em className="partyBadge">동료</em>}</small><span className={`attitude-${attitudeTier(person.affection).tone}`}>호감도 <b>{person.affection > 0 ? '+' : ''}{person.affection}</b> · {attitudeTier(person.affection).label}</span><div className="relationshipGauge"><i className={person.affection < 0 ? 'neg' : ''} style={person.affection < 0 ? {right:'50%',width:`${Math.min(100,-person.affection)/2}%`} : {left:'50%',width:`${Math.min(100,person.affection)/2}%`}}/></div>{onInvite && ((session.party || []).includes(person.name) ? <div className="partyJoinedRow"><span className="partyJoined"><Check size={13}/> 합류</span><button type="button" className="partyLeaveLink" onClick={() => onLeave?.(person.name)}>헤어지기</button></div> : <button type="button" className="partyButton" disabled={(session.party || []).length >= PARTY_LIMIT} title={(session.party || []).length >= PARTY_LIMIT ? `파티는 최대 ${PARTY_LIMIT}명입니다` : '함께 다니자고 권유합니다'} onClick={() => onInvite(person.name)}><Users size={12}/> 파티 권유</button>)}</div></div>;}) : <p className="characterEmptyStatus">아직 만난 인물이 없습니다. 게임을 진행하며 NPC를 만나면 자동으로 등록됩니다.</p>}</div>}

 </div></>}
 </div>;
}
const wizardWorlds:Record<string,string[]> = {
 rpg:['정통 판타지','정통 무협','현대 판타지'], survival:['좀비 아포칼립스','무인도 생존','우주 재난'],
 mystery:['현대 범죄 수사','고딕 미스터리','SF 탐정극'],strategy:['중세 왕국 정치','무림 세력 경쟁','현대 국가 외교'],
 management:['판타지 영지 경영','현대 기업 운영','우주 식민지 건설'],romance:['현대 대학 일상','판타지 궁정 로맨스','직장 생활'],
 custom:['현대','판타지','SF · 미래']
};
type BulkRuleSection = { title: string; content: string };
function parseBulkRules(source: string): BulkRuleSection[] {
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
function PromptBuilder({game,update,busy,setBusy,error,setError,onMap}:{game:Game;update:(patch:Partial<Game>)=>void;busy:boolean;setBusy:(v:boolean)=>void;error:string;setError:(v:string)=>void;onMap:()=>void}) {
 const drafts=game.promptDrafts||{};
 const extras=game.customPromptSections||[];
 const removed=game.removedPromptSections||[];
 const sections=[...promptSections.filter(x=>!removed.includes(x.id)),...extras];
 // RPG is the only game type, so the wizard opens on genre selection.
 const stage=Math.max(1,game.wizardStage||0);
 const requestedStep=useRef('');
 const autoRequestedFor=useRef<string>('');
 const [adding,setAdding]=useState(false);
 const [newTitle,setNewTitle]=useState('');
 const [newGuide,setNewGuide]=useState('');
 const [customWorld,setCustomWorld]=useState('');
 const [worldOptions,setWorldOptions]=useState<string[]>([]);
 const [worldBusy,setWorldBusy]=useState(false);
 const [optionalId,setOptionalId]=useState('');
 const [bulkOpen,setBulkOpen]=useState(false);
 const [bulkText,setBulkText]=useState('');
 const [bulkError,setBulkError]=useState('');
 const [compressing,setCompressing]=useState(false);
 const bulkSections=parseBulkRules(bulkText);
 const applyBulkRules=()=>{
  setBulkError('');
  
  if(!bulkSections.length){setBulkError('대괄호로 감싼 규칙 제목을 찾지 못했습니다. 예: [역할과 기본 원칙]');return;}
  const requiredNames=promptSections.filter(section=>section.required).map(section=>section.promptTitle);
  const missing=requiredNames.filter(name=>!bulkSections.some(section=>section.title===name));
  if(missing.length){setBulkError(`기본 규칙 5개가 모두 필요합니다. 누락: ${missing.join(', ')}`);return;}
  const normalized=bulkSections.map(section=>`# [${section.title}]\n\n${section.content}`).join('\n\n');
  
  if((game.prompt?.trim()||Object.values(drafts).some(d=>draftText(d).trim()))&&!window.confirm('현재 작성한 규칙을 일괄 입력한 규칙으로 교체할까요? 기존 규칙은 덮어씁니다.'))return;
  const nextDrafts:PromptDrafts={};
  for(const section of promptSections){
   const match=bulkSections.find(item=>item.title===section.promptTitle);
   if(match)nextDrafts[section.id]={options:[],selected:3,custom:match.content,enabled:true};
  }
  const nextExtras:CustomPromptSection[]=bulkSections.filter(item=>!(requiredNames as readonly string[]).includes(item.title)).map(item=>({id:'custom-'+makeId(),name:item.title,guide:''}));
  bulkSections.filter(item=>!(requiredNames as readonly string[]).includes(item.title)).forEach((item,i)=>{
   nextDrafts[nextExtras[i].id]={options:[],selected:3,custom:item.content,enabled:true};
  });
  update({promptDrafts:nextDrafts,customPromptSections:nextExtras,removedPromptSections:[],prompt:buildDraftPrompt(nextDrafts,nextExtras,[]),compressedPrompt:undefined,wizardBasePrompt:undefined,wizardStage:3});
  setBulkOpen(false);setBulkText('');setBulkError('');
 };

 const setStage=(n:number)=>{if(n<2 && stage>=2)return;update({wizardStage:n});};
 const setDraft=(id:string,patch:Partial<PromptDraft>)=>{
  const base=drafts[id]||{options:[],selected:-1,custom:'',enabled:true};
  const next={...drafts,[id]:{...base,...patch}};
  const full=withExtras(game.wizardBasePrompt,next,extras);
  update({promptDrafts:next,prompt:full||buildDraftPrompt(next,extras,removed),compressedPrompt:full});
 };
 const compressFinal=async()=>{
  if(compressing||busy)return;
  const original=buildDraftPrompt(drafts,extras,removed);
  if(!promptSections.filter(x=>x.required).every(x=>!!draftText(drafts[x.id]).trim())){setError('기본 규칙 5개를 먼저 선택해 주세요.');return;}
  setCompressing(true);setError('');
  try{
   const response=await fetch('/api/prompt/compress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sections:[...promptSections.filter(x=>!removed.includes(x.id)),...extras].map(x=>({title:'promptTitle' in x?x.promptTitle:x.name,text:draftText(drafts[x.id])})).filter(x=>x.text),genre:game.wizardWorld||game.wizardType,originalLength:original.length})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'최종 압축에 실패했습니다.');
   if(typeof data.prompt!=='string'||!data.prompt.trim())throw Error('압축된 프롬프트가 비어 있습니다.');
   if(data.prompt.length>PROMPT_LIMIT)throw Error('최종 프롬프트가 7,000자를 초과했습니다.');
   update({compressedPrompt:data.prompt,prompt:data.prompt});
  }catch(e){setError(e instanceof Error?e.message:'최종 압축에 실패했습니다.');}
  finally{setCompressing(false);}
 };
 const [dirStep,setDirStep]=useState(0);
 const [directionOptions,setDirectionOptions]=useState<DirectionOptions|null>(null);
 useEffect(()=>{
  if(stage<2||!game.wizardWorld)return;
  let cancelled=false;setDirectionOptions(null);
  fetch('/api/prompt/options?genre='+encodeURIComponent(game.wizardWorld)).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'방향 목록을 불러오지 못했습니다.');return d as DirectionOptions;}).then(d=>{if(!cancelled)setDirectionOptions(d);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));});
  return()=>{cancelled=true;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[stage>=2,game.wizardWorld]);
 const chosenMain=directionOptions?.mains.find(m=>m.name===game.wizardMain);
 const directionDone=[!!game.wizardMain,!!game.wizardStart,true];
 const chooseMain=(main:DirectionOptions['mains'][number])=>{
  if(compressing)return;
  setError('');
  // A different story brings its own progress steps.
  const steps=main.name===game.wizardMain?{}:{finalGoalSteps:game.finalGoalMode==='progress'?main.progressSteps:[]};
  update({wizardMain:main.name,compressedPrompt:undefined,...steps});
  setDirStep(1);
 };
 const chooseStart=(name:string)=>{
  if(compressing)return;
  setError('');
  update({wizardStart:name,compressedPrompt:undefined});
  setDirStep(2);
 };
 const chooseGoalMode=(mode:'single'|'progress')=>{
  const prefill=mode==='progress'&&!(game.finalGoalSteps||[]).some(x=>x.trim())&&chosenMain?{finalGoalSteps:chosenMain.progressSteps}:{};
  update({finalGoalMode:mode,compressedPrompt:undefined,...prefill});
 };
 const submitDirections=async()=>{
  if(busy||compressing)return;
  if(!game.wizardMain||!game.wizardStart){setError('이야기와 주인공 시작을 먼저 선택해 주세요.');return;}
  setCompressing(true);setError('');
  try{
   const response=await fetch('/api/prompt/build-final',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameName:game.name,gameDescription:game.description,genre:game.wizardWorld||game.wizardType,goalMode:game.finalGoalMode||'single',mainName:game.wizardMain,startName:game.wizardStart})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'게임 설정 생성 실패');
   if(typeof data.prompt!=='string'||!data.prompt.trim())throw Error('AI가 게임 설정을 반환하지 않았습니다.');
   if(data.prompt.length>PROMPT_LIMIT)throw Error('게임 설정이 7,000자를 초과했습니다.');
   const full=withExtras(data.prompt,drafts,extras)!;
   update({wizardBasePrompt:data.prompt,compressedPrompt:full,prompt:full,wizardStage:3});
  }catch(e){setError(e instanceof Error?e.message:'게임 설정 생성 실패');}
  finally{setCompressing(false);}
 };
 const choiceCard=(key:string,checked:boolean,title:string,body:string,onPick:()=>void)=><div key={key} role="radio" aria-checked={checked} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick();}}} onClick={onPick} className={'wizardChoice wizardSelectable '+(checked?'selected':'')}><div className="wizardOptionSummary"><input type="radio" checked={checked} readOnly tabIndex={-1}/><div className="wizardOptionText"><strong>{title}</strong><span>{body}</span></div></div></div>;
 const directionStepTitles=['어떤 이야기로 시작할까요?','주인공은 누구로 시작할까요?','목표는 어떻게 보여줄까요?'];
 const directionStepHelp=['고른 메인 사건이 게임의 중심 줄거리가 됩니다. 등장 세력과 NPC도 이 사건에 맞춰 정해집니다.','고른 신분으로 게임을 시작합니다. 신분에 따라 시작 소지품과 첫 장면이 달라집니다.','최종 목표형은 하나의 큰 목표를 향해 가고, 진행도형은 단계별 진행 상황이 플레이 화면에 표시됩니다.'];
 const renderDirection=()=>{
  if(!directionOptions)return <p className="wizardHelp">선택지를 불러오는 중입니다...</p>;
  if(dirStep===0)return <div className="wizardChoices">{directionOptions.mains.map(m=>choiceCard(m.name,game.wizardMain===m.name,m.name,m.hook,()=>chooseMain(m)))}</div>;
  if(dirStep===1)return <div className="wizardChoices">{(chosenMain?.starts||[]).map(s=>choiceCard(s.name,game.wizardStart===s.name,s.name,startStatLine(game,s.name)?`${s.summary}\n시작 능력치 · ${startStatLine(game,s.name)}`:s.summary,()=>chooseStart(s.name)))}</div>;
  return <div className="wizardChoices">
   {choiceCard('single',game.finalGoalMode!=='progress','최종 목표형',chosenMain?.goal||'하나의 최종 목표를 달성하면 결말에 이릅니다.',()=>chooseGoalMode('single'))}
   {choiceCard('progress',game.finalGoalMode==='progress','진행도형',chosenMain?.progressSteps.join(' → ')||'단계별 목표를 차례로 달성합니다.',()=>chooseGoalMode('progress'))}
   {game.finalGoalMode==='progress'&&<div className="goalStepEditor"><p className="assetHelp">고른 이야기에 맞춰 단계를 미리 채워 두었습니다. 한 줄에 하나씩 자유롭게 고칠 수 있고, 게임 진행 중 완료한 단계가 진행도로 표시됩니다.</p><label className="field">진행도형 목표 단계 (2개 이상)<textarea rows={6} value={(game.finalGoalSteps||[]).join('\n')} onChange={e=>update({finalGoalSteps:e.target.value.split('\n').slice(0,12).map(v=>v.slice(0,160))})} placeholder={'1단계: 단서 확보\n2단계: 적의 음모 저지\n3단계: 최종 결전 승리'}/></label><small>등록된 단계 {(game.finalGoalSteps||[]).filter(v=>v.trim()).length}개</small></div>}
  </div>;
 };
 const required=promptSections.filter(x=>x.required);
 const requiredReady=required.every(x=>!!draftText(drafts[x.id]).trim());
 const worldChoices=['정통 무협','정통 판타지','현대 게이트·헌터'];
 const selectedWorld=game.wizardWorld||'';
 const optional=extras;
 const activeOptional=optional.find(x=>x.id===optionalId)||optional[0];
 const combined=game.compressedPrompt||buildDraftPrompt(drafts,extras,removed);
 return <div className="wizardBuilder">
  {stage>=2&&<div className="bulkImportEntry"><div><strong>작성한 게임 규칙이 있나요?</strong><p>기본 규칙과 추가 규칙을 한 번에 붙여넣고 제목별로 자동 분류할 수 있어요.</p></div><button type="button" className="btn primary" onClick={()=>{setBulkOpen(v=>!v);setBulkError('');}}><Upload size={16}/>{bulkOpen?'일괄 입력 닫기':'전체 프롬프트 가져오기'}</button></div>}
  {stage>=2&&bulkOpen&&<div className="bulkImportPanel"><label htmlFor="bulkPromptText"><strong>전체 규칙 붙여넣기</strong></label><p>예: [역할과 기본 원칙], [세계관과 배경], [시작 소지품]. 원문 내용은 요약하지 않습니다.</p><textarea id="bulkPromptText" rows={12} value={bulkText} onChange={e=>{setBulkText(e.target.value);setBulkError('');}} placeholder={'[역할과 기본 원칙]\nGM 역할과 진행 규칙...\n\n[세계관과 배경]\n세계관...\n\n[플레이어와 시작 조건]\n시작 조건...\n\n[진행 방식과 정합성]\n진행 규칙...\n\n[시작 소지품]\n아이템 목록...'} /><div className="bulkImportSummary"><strong>분석 결과 · {bulkSections.length}개 항목</strong><span>{bulkText.length.toLocaleString()} / {PROMPT_LIMIT.toLocaleString()}자</span></div><div className="bulkImportTags">{bulkSections.map((section,i)=><span key={i} className={promptSections.some(p=>p.promptTitle===section.title)?'bulkBase':'bulkExtra'}>{section.title} · {promptSections.some(p=>p.promptTitle===section.title)?'기본':'추가'}</span>)}</div>{bulkError&&<p className="promptBuilderError" role="alert">{bulkError}</p>}<div className="bulkImportActions"><button type="button" className="btn" onClick={()=>setBulkOpen(false)}>취소</button><button type="button" className="btn primary" disabled={!bulkSections.length} onClick={applyBulkRules}>분석한 규칙 전체 적용</button></div><small>적용 시 기존 규칙은 확인 후 교체됩니다. 저장은 상단의 수동 저장 버튼으로 진행하세요.</small></div>}

  {stage===1&&<div className="wizardStep"><h3>1. 게임 장르를 선택하세요</h3><p>세계관은 세 가지로 고정됩니다. 다음 단계에서 이야기·주인공·목표 방향을 고릅니다.</p><div className="wizardChoiceList">{worldChoices.map((w,i)=><button type="button" key={w} className={'wizardWorldRow '+(selectedWorld===w?'chosen':'')} onClick={()=>update({...(w!==selectedWorld?{wizardMain:'',wizardStart:'',finalGoalSteps:[]}:{}),wizardType:'rpg',wizardWorld:w,...genrePresetPatch(game,w)})}><b>{i+1}</b><span>{w}</span><ChevronRight size={16}/></button>)}</div><button type="button" className="btn primary" disabled={!worldChoices.includes(selectedWorld)} onClick={()=>{setDirStep(0);update({wizardStage:2,removedPromptSections:[...new Set([...removed,...promptSections.filter(s=>!s.required).map(s=>s.id)])],prompt:buildDraftPrompt(drafts,extras,[...new Set([...removed,...promptSections.filter(s=>!s.required).map(s=>s.id)])])});}}>장르 확정하고 방향 정하기 <ChevronRight size={16}/></button></div>}
  {stage===2&&<div className="wizardStep rpgStepWizard">
    <div className="rpgStepTop"><strong>2. 게임 방향 정하기 · {dirStep+1} / 3</strong><span>{game.wizardWorld}</span></div>
    <div className="rpgStepProgress">{directionStepTitles.map((title,i)=><button key={title} type="button" title={title} className={i===dirStep?'active':directionDone[i]&&i<2?'done':''} disabled={!directionDone.slice(0,i).every(Boolean)} onClick={()=>setDirStep(i)}>{i+1}</button>)}</div>
    <div className="wizardRequired"><div className="wizardRequiredLabel"><span>{dirStep+1} / 3</span><strong>{directionStepTitles[dirStep]}</strong>{dirStep<2&&directionDone[dirStep]&&<small>선택 완료 ✓</small>}</div>
    <p className="wizardHelp">{directionStepHelp[dirStep]}</p>
    {renderDirection()}
    </div>
    <div className="rpgStepNavigation"><button className="btn" type="button" disabled={dirStep===0||compressing} onClick={()=>setDirStep(i=>Math.max(0,i-1))}><ArrowLeft size={15}/> 이전</button>{dirStep<2?<button className="btn primary" type="button" disabled={!directionDone[dirStep]} onClick={()=>setDirStep(i=>i+1)}>다음 <ChevronRight size={15}/></button>:<button className="btn primary" type="button" disabled={compressing||!game.wizardMain||!game.wizardStart||(game.finalGoalMode==='progress'&&(game.finalGoalSteps||[]).filter(x=>x.trim()).length<2)} onClick={()=>void submitDirections()}>{compressing?'게임 설정을 만들고 검토하는 중...':'방향 선택 완료 · 게임 설정 만들기'} <ChevronRight size={15}/></button>}</div>
    <p className="wizardHelp">선택을 마치면 고른 방향으로 세계·NPC·사건이 채워지고, AI가 앞뒤가 맞는지 검토합니다.</p>
  </div>}
  {stage===3&&<div className="wizardStep"><h3>3. 최종 프롬프트 확인 및 선택적 보완</h3>{game.wizardBasePrompt?<div className="tip"><strong>{combined.length.toLocaleString()}자 · 최대 7,000자</strong><p>고른 방향({game.wizardMain} · {game.wizardStart} · {game.finalGoalMode==='progress'?'진행도형':'최종 목표형'})으로 만든 게임 설정입니다. 오른쪽 미리보기에서 NPC·사건·목표를 확인하세요.</p></div>:<div className="tip"><strong>원본 {combined.length.toLocaleString()}자 · 최대 7,000자</strong><p>가져온 규칙을 AI로 하나의 게임 설정으로 통합·압축합니다.</p><button type="button" className="btn primary" disabled={compressing||busy||!requiredReady||!!game.compressedPrompt} onClick={()=>void compressFinal()}><Sparkles size={16}/>{compressing?'전체 규칙 압축 중...':game.compressedPrompt?'통합·압축 완료':'AI로 최종 규칙 통합·압축 (최대 7,000자)'}</button>{game.compressedPrompt&&<p>최종 압축본 {game.compressedPrompt.length.toLocaleString()}자 · 오른쪽 미리보기에 적용됨</p>}</div>}<p>완성된 최종 규칙으로 게임을 시작할 수 있습니다. 필요하면 아래 예시를 참고해 원하는 규칙을 직접 추가하세요. 예시는 자동 적용되지 않습니다.</p><div className="tip">추가 규칙 예시: NPC와 관계(호감도·신뢰도), 세력과 조직(평판·외교), 전투와 대결(승패·부상), 시간과 일정(하루 행동·기한), 경제와 거래(자금·가격), 생존과 자원(식량·피로), 실패·패배·종료 조건(사망·퇴학·파산). 게임 장르에 맞게 제목과 내용을 자유롭게 작성하세요.</div>{optional.map(s=><div key={s.id} className="wizardOptionalEditor"><div className="wizardRowHeader"><strong>{s.name}</strong><button type="button" className="btn" onClick={()=>{const next=extras.filter(x=>x.id!==s.id);const nextDrafts={...drafts};delete nextDrafts[s.id];const full=withExtras(game.wizardBasePrompt,nextDrafts,next);update({customPromptSections:next,promptDrafts:nextDrafts,prompt:full||buildDraftPrompt(nextDrafts,next,removed),compressedPrompt:full});}}><Trash2 size={15}/> 삭제</button></div><textarea rows={4} value={draftText(drafts[s.id])} onChange={e=>setDraft(s.id,{selected:3,custom:e.target.value,enabled:true})} placeholder="게임에 추가할 규칙을 자유롭게 작성하세요."/></div>)}{!adding?<button type="button" className="btn" onClick={()=>setAdding(true)}><Plus size={16}/> 새 규칙 직접 추가</button>:<div className="wizardAdd"><input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="규칙 제목"/><textarea value={newGuide} onChange={e=>setNewGuide(e.target.value)} rows={4} placeholder="추가할 규칙 내용을 직접 작성하세요."/><div className="wizardRowHeader"><button className="btn" type="button" onClick={()=>setAdding(false)}>취소</button><button className="btn primary" type="button" disabled={!newTitle.trim()||!newGuide.trim()} onClick={()=>{const id='custom-'+makeId();const next=[...extras,{id,name:newTitle.trim(),guide:''}];const nextDrafts={...drafts,[id]:{options:[],selected:3,custom:newGuide.trim(),enabled:true}};const full=withExtras(game.wizardBasePrompt,nextDrafts,next);update({customPromptSections:next,promptDrafts:nextDrafts,prompt:full||buildDraftPrompt(nextDrafts,next,removed),compressedPrompt:full});setNewTitle('');setNewGuide('');setAdding(false);}}>규칙 저장</button></div></div>}<button type="button" className="btn" onClick={()=>{setDirStep(0);setStage(2);}}><ArrowLeft size={15}/> 게임 방향 다시 선택</button><button type="button" className="btn primary" disabled={!game.compressedPrompt} onClick={()=>{const finalPrompt=game.compressedPrompt||combined;if(finalPrompt.length>PROMPT_LIMIT){setError('게임에 적용할 프롬프트가 7,000자를 초과했습니다. 먼저 AI 통합·압축을 실행해 주세요. 원본은 보존됩니다.');return;}onMap();}}>프롬프트 작성 완료 · 게임 설정으로 이동 <ChevronRight size={16}/></button></div>}
  
  {combined.length>PROMPT_LIMIT&&<div className="promptBuilderError">원본 {combined.length.toLocaleString()}자입니다. 실제 게임용 프롬프트는 최대 7,000자이므로 최종 통합·압축을 완료해야 합니다.</div>}
  {error&&<div className="promptBuilderError" role="alert">{error}</div>}
 </div>;
}
export default function Home() {
  const [games, setGames] = useState<Game[]>([initial]);
  const [selected, setSelected] = useState('sample');
  const [view, setView] = useState<View>('library');
  const [tab, setTab] = useState<Tab>('prompt');
  const [npcBusy,setNpcBusy]=useState('');
  const [npcError,setNpcError]=useState('');
  const [systemRecommendation, setSystemRecommendation] = useState<CharacterConfig | null>(null);
  const [equipmentSuggestions, setEquipmentSuggestions] = useState<string[]>([]);
  const [equipmentSuggestionBusy, setEquipmentSuggestionBusy] = useState(false);
  const [equipmentSuggestionError, setEquipmentSuggestionError] = useState('');
  const [systemBusy, setSystemBusy] = useState(false);
  const [systemError, setSystemError] = useState('');
  useEffect(()=>{if(tab==='settings' && game?.id) setSystemRecommendation(genreSystemSuggestions(game));},[tab, selected]);
  const [session, setSession] = useState<Session>(makeSession(initial));
  // Only the newest stretch of a long play log is drawn; older entries load on request.
  const [logShown, setLogShown] = useState(LOG_PAGE);
  const [action, setAction] = useState('');
  const [draftSection,setDraftSection]=useState<string>('role');
  const [draftBusy,setDraftBusy]=useState(false);
  const [draftError,setDraftError]=useState('');
  const [goalStepsBusy,setGoalStepsBusy]=useState(false);const [goalStepsError,setGoalStepsError]=useState('');
  const [registrationBusy,setRegistrationBusy]=useState(false);
  const [registrationError,setRegistrationError]=useState('');

  const [busy, setBusy] = useState(false);
  // New gear goes on by itself into an empty slot; gear for a slot already in use waits here for the player to decide.
  // seenInv is the inventory last looked at; null right after a save is loaded or a game starts, so that isn't "new".
  const [equipOffer, setEquipOffer] = useState<string[]>([]);
  const seenInv = useRef<string[] | null>(null);
  const replaceSession = (s: Session) => { seenInv.current = null; setEquipOffer([]); setDiceRoll(null); setSession(s); };
  useEffect(() => {
    const inv = session.inventory || [], before = seenInv.current;
    seenInv.current = inv;
    if (!before) return;
    // What came in since last time, copy by copy (a second sword of the same name is new too).
    const left = [...before];
    const gained = inv.filter(n => { const i = left.indexOf(n); if (i < 0) return true; left.splice(i, 1); return false; });
    const gear = gained.filter(n => infoOf(n, session.itemInfo).kind !== 'item');
    if (!gear.length) return;
    const equipped = { ...(session.equipped || {}) }, worn: string[] = [], offers: string[] = [];
    for (const n of gear) {
      const slot = infoOf(n, session.itemInfo).kind as Exclude<ItemKind, 'item'>;
      if (!equipped[slot] && session.mode !== 'combat') { equipped[slot] = n; worn.push(n); }
      else if (equipped[slot] !== n) offers.push(n);
    }
    if (worn.length) setSession(s => { const next = { ...s, equipped: { ...(s.equipped || {}), ...Object.fromEntries(worn.map(n => [infoOf(n, s.itemInfo).kind, n])) } }; return { ...next, hp: Math.min(s.hp, maxHpOf(game, next)), log: [...s.log, `시스템: 자동 장착 — ${worn.join(', ')}`] }; });
    if (offers.length) setEquipOffer(o => [...o, ...offers]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.inventory]);
  // The offer on screen: the new piece and what it would replace. An offer whose item is gone, or whose slot was
  // emptied or already holds it, is settled without asking.
  const offerItem = equipOffer.find(n => (session.inventory || []).includes(n) && !Object.values(session.equipped || {}).includes(n));
  const offerSlot = offerItem ? infoOf(offerItem, session.itemInfo).kind as Exclude<ItemKind, 'item'> : undefined;
  const offerWorn = offerSlot ? session.equipped?.[offerSlot] : undefined;
  function answerOffer(swap: boolean) {
    if (!offerItem || !offerSlot) return;
    setEquipOffer(o => o.filter(n => n !== offerItem));
    if (!swap) return;
    setSession(s => { const next = { ...s, equipped: { ...(s.equipped || {}), [offerSlot]: offerItem } }; return { ...next, hp: Math.min(s.hp, maxHpOf(game, next)), log: [...s.log, `시스템: 장비 교체 — ${offerWorn || '없음'} → ${offerItem}`] }; });
  }
  const [ready, setReady] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [notice, setNotice] = useState('');
  const [boardOpen, setBoardOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [movingAsset, setMovingAsset] = useState<string | null>(null);
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [customMapPrompt,setCustomMapPrompt] = useState('');
  const [pinMode, setPinMode] = useState<'select' | 'relocate' | 'start' | 'place' | 'building' | 'exit'>('select');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const draggingPin = useRef<{mapId:string;pinId:string;startX:number;startY:number;moved:boolean}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const talkRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = talkRef.current; if (el) el.scrollTop = el.scrollHeight; }, [session.log.length, busy]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // IndexedDB takes precedence. An existing localStorage project is migrated in memory,
        // then persisted to IndexedDB only when the user presses the manual Save button.
        const stored = await readProjectRecord<Game[]>('games');
        let data: unknown = stored;
        const legacyMigration = !Array.isArray(stored);
        if (legacyMigration) {
          const raw = localStorage.getItem(storageKey) || localStorage.getItem(legacyKey);
          data = raw ? JSON.parse(raw) : [];
        }
        if (cancelled) return;
        if (Array.isArray(data) && data.length) {
          const hydrated = data.map((g: Game) => ({ ...g, profileDone: g.profileDone ?? true, promptDone: g.promptDone ?? !!(g.promptDrafts && Object.keys(g.promptDrafts).length), mapDone: g.mapDone ?? !!(g.maps?.length), settingsDone: g.settingsDone ?? !!g.registrationDescription, prompt: typeof g.prompt === 'string' ? refreshMainPrompt(g, g.prompt) : [g.world, g.rules, g.gm].filter(Boolean).join('\n\n'), compressedPrompt: refreshMainPrompt(g, g.compressedPrompt), wizardBasePrompt: refreshMainPrompt(g, g.wizardBasePrompt), assets: Array.isArray(g.assets) ? g.assets : [], imageRows: Array.isArray(g.imageRows) ? g.imageRows : (Array.isArray(g.assets) ? g.assets.map((a: Asset) => ({ id: a.id, name: a.name })) : []), imageColumns: Array.isArray(g.imageColumns) ? g.imageColumns : [{ id: 'default', name: '기본' }] , imageCells: Array.isArray(g.imageCells) ? g.imageCells : (Array.isArray(g.assets) ? g.assets.filter((a: Asset) => a.image).map((a: Asset) => ({ rowId: a.id, columnId: 'default', image: a.image })) : []), mapImage: g.mapImage || '', startMapId: g.startMapId, startPinId: (()=>{const wm=(g.maps||[]).find(m=>m.id===g.startMapId);const isDefaultWuxia=wm?.image==='/api/default-map/wuxia/0';const first=wm?.pins?.[0];return isDefaultWuxia && first?.name==='천마신교' && g.startPinId===first.id ? (wm?.pins.find(p=>p.name==='낙양')?.id || g.startPinId) : g.startPinId;})(), maps: Array.isArray(g.maps) ? g.maps : (g.mapImage ? [{ id: makeId(), name: '기존 맵', image: g.mapImage, pins: [] }] : []), registrationDescription: typeof g.registrationDescription === 'string' ? g.registrationDescription : '', genre: typeof g.genre === 'string' ? g.genre : 'RPG / 탐험', gameType: normalizeType(g), cooperation: COOPERATION.includes(g.cooperation || '') ? g.cooperation : '협동', progression: PROGRESSION.includes(g.progression || '') ? g.progression : '턴제', playTime: PLAY_TIMES.includes(g.playTime || '') ? g.playTime : '장기 캠페인', hashtags: Array.isArray(g.hashtags) ? g.hashtags.filter((x: unknown) => typeof x === 'string').slice(0, MAX_TAGS) : [], audience: typeof g.audience === 'string' ? g.audience : '전체 이용가', characterConfig: g.characterConfig ? {...normalizeCharacterConfig(g.characterConfig), sections:{...defaultCharacterConfig().sections,...(g.characterConfig.sections || {})}} : defaultCharacterConfig(), showHpBar: g.showHpBar !== false, showEquipment: g.showEquipment !== false, showDice: g.showDice !== false, startingEquipment: typeof g.startingEquipment === 'string' ? g.startingEquipment : '낡은 검, 가죽 갑옷, 회복 물약', playMode: g.playMode === 'multi' ? 'multi' as const : 'single' as const, minPlayers: Math.max(2, Math.min(6, Number(g.minPlayers) || 2)), maxPlayers: Math.max(2, Math.min(6, Number(g.maxPlayers) || 4)) }));
          const cleaned = hydrated.map((g: Game) => g.maps?.length ? { ...g, maps: withoutAutoPortals(g.maps) } : g);
          setGames(cleaned);
          setSavedSnapshot(legacyMigration ? '[]' : JSON.stringify(cleaned));
          if (legacyMigration) setNotice('기존 프로젝트를 불러왔습니다. 저장 버튼을 눌러 새 저장소로 이전하세요.');
        } else {
          setSavedSnapshot('[]');
        }
      } catch (error) {
        if (!cancelled) {
          setNotice('프로젝트를 불러오지 못했습니다. 기존 브라우저 데이터를 삭제하지 마세요.');
          setSavedSnapshot(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const hasUnsavedChanges = ready && savedSnapshot !== null && JSON.stringify(games) !== savedSnapshot;
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);
  const [saving, setSaving] = useState(false);
  async function saveGames() {
    if (saving || !ready) return;
    setSaving(true);
    try {
      // A transaction's completion, not merely its request success, confirms persistence.
      const snapshot = JSON.stringify(games);
      await writeProjectRecord('games', games);
      setSavedSnapshot(snapshot);
      setSaveStatus('saved');
      setNotice('게임 프로젝트를 IndexedDB에 저장했습니다.');
    } catch (error) {
      setSaveStatus('error');
      setNotice(`저장 실패: ${error instanceof Error ? error.message : '브라우저 저장 공간을 확인해 주세요.'}`);
    } finally { setSaving(false); }
  }
  // Play sessions are saved separately from the manual project save, as before.
  useEffect(() => {
    if (!ready || view !== 'play' || !session.gameId) return;
    void writeProjectRecord('session-' + session.gameId, session).catch(() => {
      setNotice('플레이 기록 저장에 실패했습니다. 브라우저 저장 공간을 확인해 주세요.');
    });
  }, [session, ready, view]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [session.log]);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(''), 2500); return () => clearTimeout(t); } }, [notice]);

  const game = games.find(g => g.id === selected) ?? games[0] ?? initial;
  // Auto battle: once the GM has sized up the foe, exchanges play out on a timer until someone falls.
  useEffect(() => {
    const c = session.combat;
    if (view !== 'play' || session.mode !== 'combat' || !c || c.result || busy) return;
    const timer = setTimeout(() => setSession(s => {
      if (s.mode !== 'combat' || !s.combat || s.combat.result) return s;
      // If the GM never answered, fight an average foe rather than stall.
      if (s.combat.round < 1) { const combat = startCombat(s.combat, s.npcCombat?.[s.combat.npc] || null);return { ...s, combat, log: [...s.log, battleIntro(combat, s.hp, maxHpOf(game, s))] }; }
      return autoBattleStep(game, s);
    }), c.round < 1 ? 1700 : 1150);
    return () => clearTimeout(timer);
  }, [view, session.mode, session.combat, busy, game]);
  const update = (patch: Partial<Game>) => setGames(old => old.map(g => g.id === game.id ? { ...g, ...patch } : g));
  // Auto-load defaults once when a new game's map editor is first opened.
  useEffect(() => {
    if (!ready || view !== 'edit' || tab !== 'map' || !game.id || game.id === 'sample' || (game.maps||[]).length) return;
    const genre=defaultMapGenre(game);
    const presets=presetMaps(genre);
    setGames(old=>old.map(item=>item.id===game.id && !(item.maps||[]).length ? {...item,maps:presets,startMapId:presets[0].id,startPinId:(genre==='wuxia' ? presets[0].pins.find(p=>p.name==='낙양') : presets[0].pins[0])?.id} : item));
    setEditingMapId(presets[0].id);
  }, [ready,view,tab,game.id,game.maps?.length,game.wizardWorld]);

  // Upgrade older built-in maps that were shipped without place markers.
  useEffect(() => {
    if (!ready || view !== 'edit' || tab !== 'map' || !game.id || !(game.maps||[]).length) return;
    const existing=game.maps||[];
    const updated=existing.map(m=>{
      const match=/^\/api\/default-map\/(wuxia|fantasy|modern)\/([0-3])$/.exec(m.image);
      if (!match || m.pins.length) return m;
      const sample=rawPresetMaps(match[1])[Number(match[2])];
      return {...m,pins:sample.pins.map(p=>({...p,id:`${m.id}-${p.id}`}))};
    });
    if (updated.every((m,i)=>m===existing[i])) return;
    const startMap=updated.find(m=>m.id===game.startMapId) || updated[0];
    setGames(old=>old.map(item=>item.id===game.id ? {...item,maps:updated,startMapId:item.startMapId||startMap.id,startPinId:item.startPinId||startMap.pins[0]?.id} : item));
  }, [ready,view,tab,game.id,game.maps]);

  async function generateRegistration(target:Game){
    if(registrationBusy)return;
    const prompt=String(target.prompt||'').trim();
    if(!prompt){setRegistrationError('먼저 게임 프롬프트를 완성해 주세요.');return;}
    setRegistrationBusy(true);setRegistrationError('');
    try{
      const response=await fetch('/api/registration/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:target.name,description:target.description,prompt:prompt.slice(0,PROMPT_LIMIT),gameType:target.wizardType||target.gameType,world:target.wizardWorld||''})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'등록 소개 생성에 실패했습니다.');
      setGames(old=>old.map(g=>g.id===target.id?{...g,registrationDescription:result.description,hashtags:result.hashtags}:g));
    }catch(e){setRegistrationError(e instanceof Error?e.message:'등록 소개 생성 오류');}
    finally{setRegistrationBusy(false);}
  }

  function create() {
    const g: Game = { ...initial, characterConfig:{...minimalCharacterConfig(),sections:{character:true,stats:true,equipment:true,inventory:true,status:true,relationships:true}}, showHpBar:true, showEquipment:true, showDice:true, startingEquipment:'', promptDrafts:{},customPromptSections:[],removedPromptSections:[], assets: [], imageRows: [], imageColumns: [{ id: makeId(), name: '기본' }], imageCells: [], mapImage: '', maps: [], id: makeId(), name: '', description: '', created: Date.now(), cover: '' };
    setGames(old => [...old, g]); setSelected(g.id); setTab('prompt'); setView('edit');
  }
  // Build the first three actions from the actual prologue, not the map's nearest pins.
  async function loadOpeningChoices(g: Game) {
    if (!prologueText(g).trim()) return;
    try {
      const response = await fetch('/api/prologue/choices', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prologue:prologueText(g), prompt:(g.prompt||'').slice(0,PROMPT_LIMIT), name:g.name, genre:defaultMapGenre(g), firstQuest:mainPrologue(g.wizardMain)?.firstQuest || ''})
      });
      if (!response.ok) throw new Error('opening choices unavailable');
      const data = await response.json();
      if (!Array.isArray(data.choices) || data.choices.length !== 4) throw new Error('invalid opening choices');
      setSession(current => {
        if (current.gameId !== g.id || current.log.length !== 1 || !current.log[0].startsWith('프롤로그:')) return current;
        // The game opens on an empty stage: nobody is met or encountered until the player acts.
        // A story's fixed first quest wins over the model's guess.
        const fixed = mainPrologue(g.wizardMain)?.firstQuest;
        return {...current, quests: fixed ? [fixed] : typeof data.currentGoal === 'string' && data.currentGoal.trim() ? [data.currentGoal.trim().slice(0,160)] : questsOf(current), suggestedActions:data.choices, sceneNpcs: []};
      });
    } catch {
      // API 오류 시에도 장르별 사건 기반 선택지 3개를 유지합니다.
    }
  }
  async function start(g: Game) {
    setSelected(g.id);
    setLogShown(LOG_PAGE);
    try {
      const savedInDb = await readProjectRecord<Session>('session-' + g.id);
      const raw = savedInDb ? JSON.stringify(savedInDb) : localStorage.getItem('crpg-session-' + g.id);
      if (raw) {
        const saved = JSON.parse(raw) as Session;
        if (saved.gameId === g.id && Array.isArray(saved.log)) {
          const maps = g.maps || [];
          const savedMap = maps.find(m => m.id === saved.mapId);
          const savedPin = savedMap?.pins.find(p => p.id === saved.pinId);
          const fallback = getStartingLocation(g);
          // 이전 플레이 기록에 위치가 없거나 해당 핀이 삭제되었으면 시작 지점으로 복구합니다.
          const location = savedMap && savedPin
            ? { mapId: savedMap.id, pinId: savedPin.id } : fallback;
          replaceSession(withStoryItems(g, { ...saved, ...location, pendingCheck: saved.pendingCheck || null, lastCheck: saved.lastCheck || null,
            characterValues: saved.characterValues || startValues(g), characterEquipment: saved.characterEquipment || {}, characterGold: typeof saved.characterGold === "number" ? saved.characterGold : (g.characterConfig || defaultCharacterConfig()).initialGold,
            inventory: Array.isArray(saved.inventory) ? saved.inventory : combinedStartingItems(g.prompt || '', g.startingEquipment || ''),
            flags: Array.isArray(saved.flags) ? saved.flags : [],
            triggeredEvents: Array.isArray(saved.triggeredEvents) ? saved.triggeredEvents : [],
            relationships: Array.isArray(saved.relationships) ? saved.relationships : [],
            currentGoal: typeof saved.currentGoal === 'string' ? saved.currentGoal : '', quests: Array.isArray(saved.quests) ? saved.quests.filter((x: unknown): x is string => typeof x === 'string').slice(0, MAX_QUESTS) : undefined, completedGoalSteps:Array.isArray(saved.completedGoalSteps)?saved.completedGoalSteps.filter((x:unknown)=>Number.isInteger(x)&&Number(x)>=0):[],goalCompleted:saved.goalCompleted === true,
            suggestedActions: Array.isArray(saved.suggestedActions) && saved.suggestedActions.some((x: unknown) => typeof x === 'string' && x.trim()) ? saved.suggestedActions.filter((x: unknown) => typeof x === 'string' && x.trim()).slice(0, 4) : (saved.pendingCheck ? [] : (saved.log.length===1 && saved.log[0]?.startsWith('프롤로그:') ? openingActions(g) : defaultActions(g, location.mapId, location.pinId))),
            activeImageKey: typeof saved.activeImageKey === 'string' ? saved.activeImageKey : undefined, travel: undefined,
            sceneNpcs: Array.isArray(saved.sceneNpcs) ? saved.sceneNpcs.filter((x: unknown): x is string => typeof x === 'string').slice(0, 3) : [],
            x: Number.isFinite(saved.x) ? Math.max(0, Math.min(g.size - 1, saved.x)) : Math.floor(g.size / 2),
            y: Number.isFinite(saved.y) ? Math.max(0, Math.min(g.size - 1, saved.y)) : Math.floor(g.size / 2)
          }));
        } else replaceSession(makeSession(g));
      } else replaceSession(makeSession(g));
    } catch { replaceSession(makeSession(g)); }
    setView('play');
    // Only fresh sessions are modified by the opening analysis; restored progress is left intact.
    void loadOpeningChoices(g);
  }
  function newGame() {
    if (busy) return;
    if (!window.confirm('현재 플레이 기록을 지우고 처음부터 새로 시작할까요? 게임 제작 설정과 맵은 유지됩니다.')) return;
    setAction('');
    replaceSession(makeSession(game));
    void loadOpeningChoices(game);
    if (chatRef.current) chatRef.current.scrollTop = 0;
  }
  function remove(g: Game) {
    if (!confirm(`'${g.name}' 게임을 삭제할까요?`)) return;
    const remaining = games.filter(item => item.id !== g.id);
    if (!remaining.length) {
      const fresh: Game = { ...initial, id: makeId(), created: Date.now(), playMode: 'single', minPlayers: 2, maxPlayers: 4, maps: [] };
      setGames([fresh]); setSelected(fresh.id);
    } else { setGames(remaining); if (selected === g.id) setSelected(remaining[0].id); }
    void deleteProjectRecord('session-' + g.id).catch(() => {});
    localStorage.removeItem('crpg-session-' + g.id);
  }
  function move(x: number, y: number) {
    setSession(s => {
      if (Math.abs(x - s.x) + Math.abs(y - s.y) !== 1) return { ...s, log: [...s.log, '시스템: 상하좌우 인접 칸으로만 이동할 수 있습니다.'] };
      return { ...s, x, y, log: [...s.log, `시스템: (${x + 1}, ${y + 1}) 칸으로 이동했습니다.`] };
    });
  }
  // The roll happens on screen: the dialog shows the target and the modifiers, the die tumbles for a moment, then
  // lands with the verdict; the story moves on only when the player confirms.
  function roll() {
    const check = session.pendingCheck;
    if (!check || busy || diceRoll) return;
    const die = 1 + Math.floor(Math.random() * 20);
    const cfg = game.characterConfig || defaultCharacterConfig();
    const field = cfg.fields.find(f => f.id.toLowerCase() === check.ability.toLowerCase());
    const score = Number(session.characterValues?.[field?.id || check.ability] ?? field?.initial ?? 10);
    const modifier = Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
    const total = die + modifier;
    const success = die === 20 || (die !== 1 && total >= check.dc);
    const result: DiceResult = { ability: check.ability, label: check.label, dc: check.dc, die, modifier, total, success, critical: die === 20 ? '대성공' : die === 1 ? '대실패' : '', onSuccess: check.success, onFailure: check.failure };
    setDiceRoll({ result, statName: field ? statDisplayName(field) : check.label, score: Number.isFinite(score) ? score : 10, face: 1 + Math.floor(Math.random() * 20), done: false });
    const started = Date.now();
    const tick = setInterval(() => {
      if (Date.now() - started >= DICE_ROLL_MS) { clearInterval(tick); setDiceRoll(r => r && { ...r, face: die, done: true }); return; }
      setDiceRoll(r => r && { ...r, face: 1 + Math.floor(Math.random() * 20) });
    }, 70);
  }
  async function confirmRoll() {
    const check = session.pendingCheck, result = diceRoll?.result;
    if (!check || !result || !diceRoll?.done || busy) return;
    setDiceRoll(null);
    const { die, modifier, total, success } = result;
    const field = (game.characterConfig || defaultCharacterConfig()).fields.find(f => f.id.toLowerCase() === check.ability.toLowerCase());
    const verdict = result.critical || (success ? '성공' : '실패');
    // A check trains the ability it tested, a bit more when it succeeds.
    const trained = train(session, [field?.id], success ? 3 : 2);
    const next: Session = { ...trained, pendingCheck: null, lastCheck: result, roll: die,
      suggestedActions: [], log: [...session.log, `주사위: ${check.label} — D20(${die}) ${modifier >= 0 ? '+' : '-'} ${Math.abs(modifier)} = ${total} / DC ${check.dc} → ${verdict}${(success ? check.success : check.failure) ? ` — ${success ? check.success : check.failure}` : ''}`] };
    setSession(next);
    await requestGM(check.action, next, undefined, true, result);
  }
  async function generateGoalSteps(){
    if(goalStepsBusy)return;
    setGoalStepsBusy(true);setGoalStepsError('');
    try{
      const r=await fetch('/api/goals/steps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:getGameGoal(game),prompt:game.prompt||'',genre:game.wizardType||game.gameType||''})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'단계 추천 실패');
      if(!Array.isArray(data.steps)||data.steps.length<2)throw new Error('단계 추천 결과가 올바르지 않습니다.');
      if((game.finalGoalSteps||[]).some(x=>x.trim())&&!window.confirm('기존 목표 단계들을 AI 추천으로 교체할까요?'))return;
      update({finalGoalSteps:data.steps});
    }catch(e){setGoalStepsError(e instanceof Error?e.message:'AI 단계 추천 실패');}finally{setGoalStepsBusy(false);}
  }
  // Once enough entries pile up past the summary, the older ones are folded into long-term memory in the background.
  const memoryBusy = useRef(false);
  const latestSession = useRef(session);
  latestSession.current = session;
  const npcMemoryQueue = useRef<Record<string, Promise<void>>>({});
  // The scene stage swaps to the travel map while this is open; picking a destination swaps it back.
  const [mapOpen, setMapOpen] = useState(false);
  const [repBurst, setRepBurst] = useState<{ delta: number; total: number; key: number } | null>(null);
  const [awakenBurst, setAwakenBurst] = useState<{ level: number; key: number } | null>(null);
  useEffect(() => { if (awakenBurst) { const t = setTimeout(() => setAwakenBurst(null), 4200); return () => clearTimeout(t); } }, [awakenBurst]);
  const [levelBurst, setLevelBurst] = useState<{ level: number; key: number } | null>(null);
  useEffect(() => { if (levelBurst) { const t = setTimeout(() => setLevelBurst(null), 3200); return () => clearTimeout(t); } }, [levelBurst]);
  useEffect(() => { if (repBurst) { const t = setTimeout(() => setRepBurst(null), 3200); return () => clearTimeout(t); } }, [repBurst]);
  // Gear the last beaten enemy was carrying; the GM names it in the next reply and its grade is fixed here.
  const [itemBurst, setItemBurst] = useState<{ name: string; info: ItemInfo; key: number } | null>(null);
  useEffect(() => { if (itemBurst) { const t = setTimeout(() => setItemBurst(null), 4200); return () => clearTimeout(t); } }, [itemBurst]);
  // The quest-clear window: what was finished this turn and everything it paid out.
  // The player's own action, typed as the last choice (apart from the creator's test command).
  const [ownAction, setOwnAction] = useState('');
  const [diceRoll, setDiceRoll] = useState<{ result: DiceResult; statName: string; score: number; face: number; done: boolean } | null>(null);
  const [questClear, setQuestClear] = useState<{ quests: { name: string; giver: string; main?: boolean }[]; next?: string; xp: number; reputation: number; total: number; items: string[]; levelFrom: number; levelTo: number; key: number } | null>(null);
  const [partyResult, setPartyResult] = useState<{ npc: string; accepted: boolean; chance: number; thinking: boolean } | null>(null);
  // While the map is open the stage takes the map image's own ratio, so the art fills it edge to edge.
  const [mapRatios, setMapRatios] = useState<Record<string, number>>({});
  const noteMapRatio = (src: string, img: HTMLImageElement) => { if (img.naturalWidth && img.naturalHeight && !mapRatios[src]) setMapRatios(r => r[src] ? r : { ...r, [src]: img.naturalWidth / img.naturalHeight }); };
  async function rememberStory(s: Session) {
    const upTo = s.memory?.upTo || 0;
    // At most 60 entries per call, so an old save without memory catches up over a few turns.
    const target = Math.min(s.log.length - MEMORY_KEEP_RECENT, upTo + 60);
    if (memoryBusy.current || target - upTo < MEMORY_BATCH) return;
    memoryBusy.current = true;
    try {
      const res = await fetch('/api/gm/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: s.memory?.summary || '', pinned: s.memory?.pinned || [], currentGoal: questsOf(s).join(' / '), entries: s.log.slice(upTo, target).map(historyLine) }) });
      const data = await res.json();
      if (!res.ok || typeof data.summary !== 'string') throw new Error(data.error || '장기 기억 갱신 실패');
      // Apply only if this is still the same playthrough and nobody summarized in between.
      setSession(cur => cur.gameId === s.gameId && (cur.memory?.upTo || 0) === upTo && cur.log.length >= target && cur.log[0] === s.log[0] ? { ...cur, memory: { summary: data.summary, upTo: target, pinned: [...new Set([...(cur.memory?.pinned || []), ...(Array.isArray(data.pinned) ? data.pinned.filter((x: unknown): x is string => typeof x === 'string') : [])])] } } : cur);
      // Outside of talks, what happened with each met NPC (help, quests, fights, deals) goes into that NPC's own memory too.
      // Talk lines are skipped: they were folded in when the talk ended.
      const batch = s.log.slice(upTo, target).filter(e => !parseTalk(e));
      for (const npc of [...new Set((s.relationships || []).map(r => r.name.trim()))].filter(n => n.length >= 2))
        foldNpcMemory(s.gameId, npc, batch.filter(e => e.includes(npc)).map(historyLine));
    } catch (e) { console.warn('장기 기억 갱신 실패', e); }
    finally { memoryBusy.current = false; }
  }
  // A GM reply is built from the session as it was when the request left. NPC memories and the story summary
  // are saved in the background meanwhile, so keep the newer ones instead of overwriting them with the snapshot.
  const keepMemories = (fresh: Session) => (cur: Session): Session => cur.gameId !== fresh.gameId ? fresh : {
    ...fresh, npcNotes: { ...(fresh.npcNotes || {}), ...(cur.npcNotes || {}) },
    memory: (cur.memory?.upTo || 0) > (fresh.memory?.upTo || 0) ? cur.memory : fresh.memory,
  };
  async function requestGM(message: string, next: Session, event?: { id: string; text: string; trigger: string }, movementAllowed = true, diceResult?: DiceResult, debug = false, reroll = false, interfere = false) {
    if (next.goalCompleted || (next.dead && !next.log[next.log.length - 1]?.startsWith('시스템: 사망'))) return;
    setBusy(true);
    try {
      const map = (game.maps || []).find(m => m.id === next.mapId);
      const pin = map?.pins.find(p => p.id === next.pinId);
      // A regional story whose region the player is in opens on an ordinary turn, if a quest slot is free.
      const where = regionWhere(game, next);
      const regionHook = !next.mode && !debug && !reroll && !event && !diceResult && !interfere && !/^(전투 결과|시스템)/.test(message) ? pickRegionHook(game, next, where) : undefined;
      // Quest beats: each tracked step's next beat is checked against what the game knows now; the ones this turn
      // carries out move on, and the GM is told what they bring. A fight won just before adds its own (pendingThen).
      const happen: { quest: string; then: string }[] = reroll || debug ? [] : [...(next.pendingThen || [])];
      // A talk beat carried out now and followed by another talk with the same person (in this step or the next one)
      // keeps the conversation going; holdQuest is the quest that next talk belongs to.
      let holdQuest = '', holdThen = '';
      if (!reroll && !debug) {
        const progress = { ...(next.questProgress || {}) }, picked = { ...(next.questChoice || {}) };
        for (const tq of trackedQuests(game, next)) {
          const b = beatOf(next, tq);
          if (!b || !beatFires(game, next, b, message)) continue;
          progress[tq.key] = (progress[tq.key] || 0) + 1;
          if (b.do === 'choose') picked[tq.key] = message.trim();
          if (b.do === 'talk') {
            const k = progress[tq.key], chain = mainChain(game.wizardMain), stepNo = tq.step;
            const after = k < tq.beats.length ? { q: tq.quest, b: tq.beats[k] }
              : tq.kind === 'main' ? (chain?.[stepNo + 1] ? { q: chain[stepNo + 1].q, b: chain[stepNo + 1].beats[0] } : undefined)
              : (() => { const r = ALL_REGION_QUESTS.find(x => tq.key.startsWith(`region:${x.id}:`)), st = r?.steps[stepNo + 1]; return st ? { q: st.q, b: st.beats[0] } : undefined; })();
            if (after?.b?.do === 'talk' && after.b.npc === next.talkNpc) { holdQuest = after.q; holdThen = after.b.then; }
          }
          happen.push({ quest: tq.quest, then: b.do === 'choose' ? `플레이어는 "${message.trim()}"을(를) 골랐다. ${b.then}` : b.then });
        }
        next = { ...next, questProgress: progress, questChoice: picked, pendingThen: undefined };
      }
      const tracked = trackedQuests(game, next);
      const finishedQuests = tracked.filter(tq => (next.questProgress?.[tq.key] || 0) >= tq.beats.length).map(tq => tq.quest);
      const beatState = tracked.map(tq => {
        const b = beatOf(next, tq), at = b && 'at' in b ? b.at : undefined;
        return { quest: tq.quest, kind: tq.kind, story: tq.story || '', happenNow: happen.filter(h => h.quest === tq.quest).map(h => h.then),
          next: b ? { do: b.do, goal: beatGoal(b), at: (at || []).join(', '), here: atPlace(defaultMapGenre(game), at, where, next.scenePlace || ''), who: b.do === 'talk' ? b.npc : b.do === 'defeat' ? b.foe : '' } : null };
      });
      const mainBeat = beatState.find(q => q.kind === 'main')?.next;
      const res = await fetch('/api/gm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: withoutOldSpeechRules(mainChain(game.wizardMain) ? promptUpToAct(game.prompt || [game.world, game.rules, game.gm].join('\n'), actsDone(next)) : (game.prompt || [game.world, game.rules, game.gm].join('\n'))).slice(0, PROMPT_LIMIT),
          action: message, history: recentHistory(next).map(historyLine), withThisNpc: next.mode === 'talk' ? npcHistory(next, next.talkNpc || '') : [], memory: next.memory?.summary || '', keyFacts: next.memory?.pinned || [], prologue: prologueText(game), movementAllowed, diceResult: diceResult || null, recentCheck: !diceResult && rolledRecently(next),
          closeTalk: next.mode === 'talk' && !holdQuest && message.trim() === (next.talkAccept || TALK_ACCEPT), holdTalk: !!holdQuest, holdQuest, acceptHint: next.mode === 'talk' ? (holdThen || trackedQuests(game, next).map(tq => beatOf(next, tq)).find(b => b?.do === 'talk' && b.npc === next.talkNpc)?.then || '') : '', debug, reroll, interfere, previousChoices: reroll ? next.suggestedActions || [] : [], mode: next.mode || '', genre: defaultMapGenre(game), talkTurns: next.mode === 'talk' ? talkTurns(next) : 0, npc: next.mode === 'talk' ? next.talkNpc || '' : next.combat?.npc || '', monsters: foesOf(defaultMapGenre(game)).map(m => ({ name: m.name, power: m.power, desc: m.desc, boss: !!m.boss })), combat: next.mode === 'combat' && next.combat ? { monster: !!next.combat.monster, foeDesc: next.combat.foeDesc || '', round: next.combat.round, enemyHp: next.combat.enemyHp, enemyMaxHp: next.combat.enemyMaxHp, itemUse: next.combat.itemUse || '' } : null,
          initialEquipment: combinedStartingItems(game.prompt || "", game.startingEquipment || "").join(", "),
          ruleEquipment: extractRuleItems(game.prompt || ""),
          state: {
            safePlace: !isDangerous(defaultMapGenre(game), where), relationships: next.relationships || [], quests: questsOf(next), mainQuest: mainQuestOf(game, next) || '', mainPlace: mainBeat?.at || '', atMainPlace: mainBeat ? mainBeat.here : true, questBeats: beatState, questFinished: finishedQuests, mainProgress: mainStepOf(game, next) !== undefined && mainChain(game.wizardMain) ? `${mainStepOf(game, next)! + 1}/${mainChain(game.wizardMain)!.length}` : '', reputation: next.reputation || 0, reputationRank: reputationRank(next.reputation || 0), recentFoes: next.recentFoes || [], regionHook: regionHook ? { story: regionHook.title, giver: regionHook.giver, hook: regionHook.hook, quest: regionHook.steps[0].q } : null, party: next.party || [], partyLevels: Object.fromEntries((next.party || []).map(n => [n, npcLevel(next, n) || 3])),maxQuests: MAX_QUESTS,finalGoal:getGameGoal(game), finalGoalMode:game.finalGoalMode||'single', finalGoalSteps:game.finalGoalSteps||[],completedGoalSteps:next.completedGoalSteps||[],goalCompleted:!!next.goalCompleted,
            availableImages: [...(game.npcPortraits||[]).filter(n=>n.image).map(n=>`${n.name}::기본`),...(game.imageCells||[]).flatMap(cell=>{const row=(game.imageRows||[]).find(r=>r.id===cell.rowId);const col=(game.imageColumns||[]).find(c=>c.id===cell.columnId);return row&&col?[`${row.name}::${col.name}`]:[];})],
            currentMapId: map?.id || '', mapName: map?.name || '', locationName: next.scenePlace || pin?.name || '', mapPin: pin?.name || '', locationDescription: pin?.description || '',
            locations: (game.maps || []).flatMap(worldMap => worldMap.pins.map(p => ({ id: p.id, mapId: worldMap.id, mapName: worldMap.name, name: p.name, kind: p.kind, description: p.description || '', targetMapId: p.targetMapId || '', targetPinId: p.targetPinId || '' }))),
            adjacentLocationIds: (map?.pins||[]).filter(p=>p.kind!=='event').map(p => p.id),
            adjacentLocations: map && pin ? reachablePins(map, pin).map(p => ({ id:p.id, name:p.name, kind:p.kind })) : [],
            knownNpcs: knownNpcNames(game, next), sceneNpcs: next.sceneNpcs || [], npcProfiles: npcProfiles(game, next),
            event: event?.text || '', eventTrigger: event?.trigger || '', currentInteractionEvent: pin?.eventTrigger === 'interact' ? pin.eventText || '' : '',
            characterValues: next.characterValues || {}, trainableStats: growthFields(game).map(f => ({ id: f.id, name: f.name })), hp: next.hp, maxHp: maxHpOf(game, next), level: next.level || 1, xp: next.xp || 0, inventory: next.inventory || [], items: (next.inventory || []).map(n => { const it = infoOf(n, next.itemInfo); return { name: n, grade: GRADE_LABELS[it.grade], kind: KIND_LABELS[it.kind], skill: it.skill?.name || '' }; }), equipped: next.equipped || {}, flags: next.flags || [], roll: next.roll
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 요청 실패');
      // A reroll only swaps the choices; the log and state stay as they were.
      if (reroll) {
        const fresh = Array.isArray(data.choices) ? data.choices.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0).map((v: string) => v.trim().slice(0, 140)).slice(0, 4) : [];
        if (fresh.length) setSession(s => ({ ...s, suggestedActions: fresh })); else setNotice('새 선택지를 받지 못했습니다. 다시 시도해 주세요.');
        return;
      }
      if (!diceResult && data.check && typeof data.check === 'object') {
        const check = data.check;
        const ability = String(check.ability || '').toLowerCase();
        const valid = (game.characterConfig || defaultCharacterConfig()).fields.some(f => f.id.toLowerCase() === ability && f.kind === 'number');
        const dc = Number(check.dc);
        if (valid && Number.isFinite(dc) && dc >= 1 && dc <= 40) {
          const pending: DiceCheck = { ability, dc: Math.round(dc), label: String(check.label || '능력').slice(0, 60), reason: String(check.reason || '행동 결과를 판정합니다.').slice(0, 200), action: message, success: String(check.success || '').slice(0, 80), failure: String(check.failure || '').slice(0, 80) };
          setSession(keepMemories({ ...next, suggestedActions: [], pendingCheck: pending, lastCheck: null, log: [...next.log, `GM: ${String(data.text || '판정이 필요합니다.')}`, `시스템: ${pending.label} · DC ${pending.dc} — 주사위를 굴려주세요.`] }));
          return;
        }
      }
      const current = next;
      {
        const delta = Number(data.hpDelta);
        const hp = Number.isFinite(delta) ? Math.max(0, Math.min(maxHpOf(game, current), current.hp + Math.max(-maxHpOf(game, current), Math.min(maxHpOf(game, current), Math.trunc(delta))))) : current.hp;
        const inventory = [...(current.inventory || [])];
        const gotItems = (Array.isArray(data.addItems) ? data.addItems : []).map((v: unknown) => typeof v === 'string' ? { name: v.trim() } : v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' ? v as { name: string; kind?: unknown; desc?: unknown; skill?: unknown } : null).filter((v: { name: string } | null): v is { name: string; kind?: unknown; desc?: unknown; skill?: unknown } => !!v && !!v.name.trim()).slice(0, 5);
        // Gear the player already owns isn't handed out again (potions and other items can stack).
        const add: string[] = gotItems.map((v: { name: string }) => v.name.trim()).filter((n: string, i: number, a: string[]) => !(infoOf(n, current.itemInfo).kind !== 'item' && ((current.inventory || []).includes(n) || a.indexOf(n) !== i)));
        const remove = Array.isArray(data.removeItems) ? data.removeItems.filter((v: unknown): v is string => typeof v === 'string').slice(0, 5) : [];
        for (const item of remove) { const idx = inventory.indexOf(item); if (idx >= 0) inventory.splice(idx, 1); }
        for (const item of add) if (item.length <= 80) inventory.push(item);
        const flags = [...(current.flags || [])];
        for (const flag of (Array.isArray(data.addFlags) ? data.addFlags : [])) {
          if (typeof flag !== 'string' || flag.length > 80 || !flag.trim()) continue;
          const separator=flag.indexOf(':');
          const category=separator>0?flag.slice(0,separator).trim():'';
          // Mutable current values replace the previous value; historical events remain append-only.
          if (['막','소속','경지','재물','현재위치','현재목표'].includes(category)) {
            for (let i=flags.length-1;i>=0;i--) if (flags[i].startsWith(category+':')) flags.splice(i,1);
          }
          if (!flags.includes(flag)) flags.push(flag);
        }
        const activeImageKey = typeof data.imageKey === 'string' && ((game.npcPortraits||[]).some(n=>!!n.image&&`${n.name}::기본`===data.imageKey)||(game.imageCells||[]).some(cell=>{const row=(game.imageRows||[]).find(r=>r.id===cell.rowId);const col=(game.imageColumns||[]).find(c=>c.id===cell.columnId);return row&&col&&`${row.name}::${col.name}`===data.imageKey;})) ? data.imageKey : undefined;
        const suggestedActions = Array.isArray(data.choices) ? data.choices.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0).map((v: string) => v.trim().slice(0, 140)).slice(0, 4) : [];
        const relationships = [...(current.relationships || [])];
        if (Array.isArray(data.relationshipUpdates)) {
          for (const raw of data.relationshipUpdates.slice(0, 12)) {
            if (!raw || typeof raw.name !== 'string' || isFoeName(defaultMapGenre(game), raw.name)) continue;
            const name = raw.name.trim().slice(0, 50);
            if (!name || name === (game.characterConfig || defaultCharacterConfig()).initialName) continue;
            const index = relationships.findIndex(p => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
            if (index < 0 && raw.met !== true) continue;
            if (index < 0 && !debug && !knownNpcNames(game, current).includes(name)) continue;
            const previous = index >= 0 ? relationships[index] : undefined;
            const relation = typeof raw.relation === 'string' && raw.relation.trim() ? raw.relation.trim().slice(0, 30) : (previous?.relation || '초면');
            // One scene moves affection by at most AFFECTION_STEP, so a single line can't flip a friend into an enemy; test commands are exempt.
            const proposed = typeof raw.affection === 'number' && Number.isFinite(raw.affection) ? clampAffection(raw.affection) : undefined;
            const affection = proposed === undefined ? (previous?.affection ?? 0) : !previous || debug ? (previous ? proposed : clampAffection(Math.max(-40, Math.min(40, proposed)))) : clampAffection(Math.max(previous.affection - AFFECTION_STEP, Math.min(previous.affection + AFFECTION_STEP, proposed)));
            const person = { id: previous?.id || makeId(), name: previous?.name || name, relation, affection };
            if (index >= 0) relationships[index] = person;
            else if (relationships.length < 100) relationships.push(person);
          }
        }
        // Main and regional quests move only by their beats. Whatever the GM reports about them (done, failed, a next
        // step handed out early) is dropped, and the steps whose beats were all carried out are finished here.
        if (!reroll) {
          const ownQuests = [...(mainChain(game.wizardMain) || []).map(st => st.q), ...regionQuestsOf(game).flatMap(r => r.steps.map(st => st.q))];
          const ours = (v: unknown) => { const q = typeof v === 'string' ? v : v && typeof v === 'object' ? String((v as { text?: unknown }).text ?? '') : ''; return !!q.trim() && ownQuests.some(c => c === q.trim() || alikeQuest(c, q)); };
          data.completedQuests = [...(Array.isArray(data.completedQuests) ? data.completedQuests : []).filter((q: unknown) => !ours(q)), ...finishedQuests];
          data.failedQuests = (Array.isArray(data.failedQuests) ? data.failedQuests : []).filter((q: unknown) => !ours(q));
          data.addQuests = (Array.isArray(data.addQuests) ? data.addQuests : []).filter((q: unknown) => !ours(q));
        }
        const questLog = applyQuests(questsOf(current), data, current.questGivers || {});
        const exercised = Array.isArray(data.trained) ? data.trained.filter((id: unknown): id is string => typeof id === 'string' && growthFields(game).some(f => f.id === id)).slice(0, 2) : [];
        for (const giver of questLog.doneGivers) { const i = giver ? relationships.findIndex(p => p.name.trim() === giver.trim()) : -1; if (i >= 0) relationships[i] = { ...relationships[i], affection: clampAffection(relationships[i].affection + QUEST_AFFECTION) }; }
        const repDelta = (typeof data.reputationDelta === 'number' && Number.isFinite(data.reputationDelta) ? Math.max(-REPUTATION_STEP, Math.min(REPUTATION_STEP, Math.round(data.reputationDelta))) : 0) + questLog.done.length * QUEST_REPUTATION;
        // Every affection change is spelled out, so the player sees what their choices did.
        const affectionNotes = relationships.flatMap(p => { const before = (current.relationships || []).find(r => r.id === p.id); const diff = before ? p.affection - before.affection : 0; return diff ? [`${p.name} 호감도 ${diff > 0 ? '+' : ''}${diff} (${attitudeTier(p.affection).label})`] : []; });
        if (affectionNotes.length) setNotice(affectionNotes.join(' · '));
        const reputation = clampReputation((current.reputation || 0) + repDelta);
        // A big deed gets its own fanfare instead of a quiet log line.
        if (Math.abs(repDelta) >= 300 && !questLog.done.length) setRepBurst({ delta: repDelta, total: reputation, key: Date.now() });
        // A companion who has come to dislike the player walks out.
        const deserters = (current.party || []).filter(n => (relationships.find(r => r.name.trim() === n.trim())?.affection ?? 0) < 0);
        const party = (current.party || []).filter(n => !deserters.includes(n));
        const configuredSteps=(game.finalGoalSteps||[]).map(x=>x.trim()).filter(Boolean);
        // A story with a main quest chain ends only when its last main quest is done (advanceMain), and its goal steps
        // follow the acts; the GM's own say-so would end the game in the middle of the chain.
        const chainDriven = !!mainChain(game.wizardMain);
        const validStepIndices=!chainDriven&&Array.isArray(data.completedGoalSteps)?data.completedGoalSteps.filter((n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<configuredSteps.length):[];
        const completedGoalSteps=[...new Set([...(current.completedGoalSteps||[]),...validStepIndices])].filter(n=>n<configuredSteps.length).sort((a,b)=>a-b);
        const goalCompleted = current.goalCompleted === true || (!chainDriven && (game.finalGoalMode==='progress' ? (configuredSteps.length>0 && completedGoalSteps.length===configuredSteps.length) : (data.finalGoalCompleted === true && !!getGameGoal(game).trim())));
        // Named people come from the game's cast (portraits, prompt NPC list, people already met); the GM can't invent a new named NPC like "잭".
        const knownNpcs = knownNpcNames(game, current);
        const sceneNpcs = Array.isArray(data.presentNpcs) ? [...new Set(data.presentNpcs.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim()).filter((v: string) => !!v && (debug || !knownNpcs.length || knownNpcs.includes(v))))].slice(0, 3) as string[] : (current.sceneNpcs || []);
        // A talk or fight keeps its partner on stage; the encounter prompt only returns for newcomers.
        // Companions travel with the player, so the GM naming one in the scene never turns into a fresh encounter.
        const heading = !current.mode ? String(data.text || '').match(/^\s*【([^】·|]+)/)?.[1].trim().slice(0, 40) : undefined;
        const handledBefore = heading && heading !== current.scenePlace ? [] : current.handledNpcs || [];
        const stageNpcs = current.mode ? (current.sceneNpcs || []) : sceneNpcs.filter(n => !(current.party || []).includes(n) && !isFoeName(defaultMapGenre(game), n) && (debug || !handledBefore.includes(n)));
        // A test action may also teleport within the current map.
        const debugPin = debug && typeof data.moveToPinId === 'string' ? (game.maps || []).find(m => m.id === current.mapId)?.pins.find(p => p.id === data.moveToPinId && p.id !== current.pinId && p.kind !== 'event' && p.kind !== 'exit') : undefined;
        const handledNpcs = handledBefore;
        // Whatever an NPC's strength turns out to be the first time, it stays that way for every later fight.
        const knownFoe = current.combat ? current.npcCombat?.[current.combat.npc] : undefined;
        const combat = current.mode === 'combat' && current.combat ? (current.combat.round === 0 ? startCombat(current.combat, knownFoe || data.enemy) : { ...current.combat, itemUse: undefined }) : current.combat;
        const npcCombat = current.mode === 'combat' && current.combat?.round === 0 && combat && !knownFoe ? { ...(current.npcCombat || {}), [combat.npc]: { hp: combat.enemyMaxHp, dc: combat.enemyDc, damage: combat.enemyDamage, power: combat.power } } : current.npcCombat;
        const nextActions = current.mode === 'combat' ? [] : current.mode === 'talk' ? suggestedActions.slice(0, 3) : (suggestedActions.length ? suggestedActions : defaultActions(game, current.mapId, current.pinId));
        // A voice is fixed the first time an NPC speaks and never rewritten afterwards.
        const npcVoices = { ...(current.npcVoices || {}) };
        for (const v of Array.isArray(data.npcVoices) ? data.npcVoices : []) if (v && typeof v.name === 'string' && typeof v.style === 'string' && !npcVoices[v.name]) npcVoices[v.name] = v.style;
        const curMap = (game.maps || []).find(m => m.id === current.mapId);
        // The heading names a pin on this map, or a place inside a city (북문 초소 is in 레븐홀트): then the city's pin.
        const pinNamed = (name: string) => curMap?.pins.find(p => p.id !== current.pinId && p.kind !== 'exit' && p.kind !== 'event' && p.name === name);
        // A heading that names the pin the player is already on (【그림우드 숲 가장자리】 at 그림우드) keeps them there; before,
        // the city lookup took over and moved them to 레븐홀트, whose places include 그림우드 숲 가장자리.
        const pinHere = curMap?.pins.find(p => p.id === current.pinId)?.name || '';
        const storyPin = !heading || current.mode || debug || (pinHere.length >= 2 && heading.includes(pinHere)) ? undefined
          : curMap?.pins.find(p => p.id !== current.pinId && p.kind !== 'exit' && p.kind !== 'event' && p.name.length >= 2 && heading.includes(p.name))
            || (() => { const here = curMap?.pins.find(p => p.id === current.pinId)?.name || ''; const city = cityOfPlace(defaultMapGenre(game), heading); return city && city !== here ? pinNamed(city) : undefined; })();
        const manaMax = maxManaOf(game, current);
        const result: Session = { ...train(current, exercised), ...(manaMax > 0 && current.mode !== 'combat' ? { mana: Math.min(manaMax, (current.mana ?? manaMax) + Math.round(manaMax * MANA_REGEN_TURN)) } : {}), ...(heading ? { scenePlace: heading } : {}), ...(storyPin ? { pinId: storyPin.id } : {}), npcVoices, relationships, quests: questLog.quests, questGivers: questLog.givers, reputation, party, npcCombat, completedGoalSteps,goalCompleted, sceneNpcs: stageNpcs, handledNpcs: debug ? handledNpcs.filter(n => !stageNpcs.includes(n)) : handledNpcs, combat, suggestedActions: nextActions, hp, inventory, flags, activeImageKey, ...(debugPin ? { pinId: debugPin.id } : {}),
          log: [...withPlayerLine(current.log, current.mode === 'talk' ? data.playerLine : ''), ...(current.mode === 'talk' && current.talkNpc && !data.talkLeft ? talkEntries(current.talkNpc, data) : [`GM: ${String(data.text || 'GM 응답이 없습니다.')}`]), ...(current.mode === 'combat' && current.combat?.round === 0 && combat ? [battleIntro(combat, hp, maxHpOf(game, current))] : []), ...(debugPin ? [`시스템: [테스트] ${debugPin.name}(으)로 이동했습니다.`] : []), ...(storyPin && curMap ? [`시스템: ${curMap.name} / ${storyPin.name}(으)로 이동했습니다.`] : []), ...questLog.done.map((q, i) => `시스템: 목표 완료 — ${q}${questLog.doneGivers[i] ? ` (의뢰인 ${questLog.doneGivers[i]})` : ''}`), ...questLog.failed.map(q => `시스템: 목표 실패 — ${q}`), ...affectionNotes.map(n => `시스템: ${n}`), ...(repDelta ? [`시스템: 명성 ${formatReputation(repDelta)} (${reputation.toLocaleString('ko-KR')} · ${reputationRank(reputation)})`] : []), ...deserters.map(n => `시스템: ${n}이(가) 실망해 파티를 떠났습니다.`),...questLog.added.map(q => `시스템: 새 목표 — ${q}`), ...(hp !== current.hp ? [`시스템: HP ${current.hp} → ${hp}`] : []),...(add.length ? [`시스템: 획득 — ${add.join(', ')}`] : []), ...(remove.length ? [`시스템: 사용 — ${remove.join(', ')}`] : []), ...(goalCompleted && !current.goalCompleted ? ['시스템: 최종 목표 달성 — 게임 완료'] : [])] };
        // Experience: deeds the GM recognised, plus every quest finished this turn.
        if (diceResult?.success && !data.xpGain) data.xpGain = 'minor';
        const lv = current.level || 1, mainDone = Math.min(1, questLog.done.filter(q => { const m = mainQuestOf(game, current); return !!m && (q === m || alikeQuest(q, m)); }).length);
        const acts = current.log.filter(e => e.startsWith('플레이어:')).length;
        const eventPays = data.xpGain === 'event' && !event && !data.moveToPinId && !message.startsWith('시스템이 이동을 확정') && acts - (current.lastEventXp ?? -EVENT_XP_GAP) >= EVENT_XP_GAP;
        // Walking somewhere is not an achievement: a deed pays only when the turn produced something the game can see.
        const tangible = !!diceResult?.success || add.length > 0 || questLog.done.length > 0 || questLog.added.length > 0 || !!data.ambush || repDelta !== 0;
        const deed = message.startsWith('시스템이 이동을 확정') || !tangible ? '' : data.xpGain === 'event' && !eventPays ? 'deed' : data.xpGain;
        const earned = deedXp(deed, lv) + mainDone * mainQuestXp(lv, mainStepOf(game, current) ?? 0) + (questLog.done.length - mainDone) * questXp(lv);
        const chained = advanceMain(game, current, result, questLog.done, questLog.failed);
        // Regional quests move on; a finished regional story pays an event's worth on top of its last step.
        const regioned = advanceRegion(game, current, chained.session, questLog.done);
        const opened = regionHook && questsOf(regioned.session).length < MAX_QUESTS ? startRegion(regioned.session, regionHook, true) : regioned.session;
        const regionBonus = regioned.finished.filter(r => r.kind === 'story').length * deedXp('event', lv);
        const grown = withXp(game, { ...opened, npcPower: { ...(result.npcPower || {}), ...(data.npcPowers && typeof data.npcPowers === 'object' ? data.npcPowers : {}) } }, earned + regionBonus, questLog.done.length ? '퀘스트 완료' : '성장');
        const source = mainDone ? 'main' : eventPays ? 'event' : questLog.done.length ? 'side' : 'other';
        const itemInfo = { ...(grown.session.itemInfo || {}) }, newGear: string[] = [];
        gotItems.forEach((v: { name: string; kind?: unknown; desc?: unknown; skill?: unknown }, i: number) => {
          const name = v.name.trim();
          if (name.length > 80 || itemInfo[name]) return;
          const kind: ItemKind = typeof v.kind === 'string' && ['weapon', 'armor', 'accessory', 'item'].includes(v.kind) ? v.kind as ItemKind : infoOf(name).kind;
          const grade: Grade = rollGrade(source, rewardBase(lv));
          itemInfo[name] = { grade, kind, desc: typeof v.desc === 'string' ? v.desc.trim().slice(0, 120) : undefined, skill: rollSkill(kind, grade, typeof v.skill === 'string' ? v.skill : '') };
          if (grade >= 4) newGear.push(name);
        });
        // The code guarantees what was earned: one piece of gear per finished quest
        // (up to 2) beyond the gear the GM handed out this turn. The GM only gets to name it.
        const extra: string[] = [], genre = defaultMapGenre(game);
        const owned = (n: string) => (grown.session.inventory || []).includes(n) || extra.includes(n);
        const grant = (grade: Grade, desc: string) => {
          const got = gearName(genre, randomGearKind(), grade, owned);
          // Everything of that grade is already in the bag: a healing potion instead of a copy.
          if (!got) { const p = POTIONS[genre] || POTIONS.fantasy; itemInfo[p.name] = { grade: 0, kind: 'item', desc: p.desc }; extra.push(p.name); return; }
          const { kind, name } = got;
          itemInfo[name] = { grade, kind, desc, skill: rollSkill(kind, grade, '') };
          extra.push(name);
          if (grade >= 4) newGear.push(name);
        };
        const gmGear = add.filter(n => itemInfo[n] && itemInfo[n].kind !== 'item').length;
        for (let k = gmGear; k < Math.min(2, questLog.done.length); k++) grant(rollGrade(k === 0 && mainDone ? 'main' : 'side', rewardBase(lv)), `「${questLog.done[k]}」의 보수.`);
        if (extra.length) grown.session = { ...grown.session, inventory: [...(grown.session.inventory || []), ...extra], log: [...grown.session.log, `시스템: 획득 — ${extra.map(n => `[${GRADE_LABELS[itemInfo[n].grade]}] ${n}`).join(', ')}`] };
        if (eventPays && deed === 'event') grown.session = { ...grown.session, lastEventXp: acts };
        grown.session = { ...grown.session, itemInfo, equipped:Object.fromEntries(Object.entries(grown.session.equipped || {}).filter(([, n]) => n && (grown.session.inventory || []).includes(n))) };
        if (newGear.length) setItemBurst({ name: newGear[0], info: itemInfo[newGear[0]], key: Date.now() });
        if (questLog.done.length) setQuestClear({ quests: questLog.done.map((name, i) => ({ name, giver: questLog.doneGivers[i] || '', main: !!mainQuestOf(game, current) && (name === mainQuestOf(game, current) || alikeQuest(name, mainQuestOf(game, current)!)) })), next: chained.next, xp: earned, reputation: repDelta, total: reputation, items: [...add, ...extra], levelFrom: current.level || 1, levelTo: grown.session.level || 1, key: Date.now() });
        else if (grown.levelsGained) setLevelBurst({ level: grown.session.level || 1, key: Date.now() });
        // Test command "레벨 50": jump straight to that level, with the stat growth those levels would have given, at full HP.
        const wantLevel = debug ? (typeof data.setLevel === 'number' && data.setLevel > 0 ? data.setLevel : Number((message.match(/(?:레벨|lv\.?)\s*(\d{1,3})/i) || [])[1]) || 0) : 0;
        if (wantLevel) {
          const target = Math.max(1, Math.min(MAX_LEVEL, Math.round(wantLevel)));
          const jumped = growStats(game, { ...grown.session, level: target, xp: 0 }, Math.max(0, target - (grown.session.level || 1)));
          grown.session = { ...jumped.session, hp: maxHpOf(game, jumped.session), log: [...jumped.session.log, `시스템: [테스트] 레벨 → Lv.${target} · 최대 HP ${maxHpOf(game, jumped.session)}`, ...(jumped.note ? [`시스템: ${jumped.note}`] : [])] };
          setLevelBurst({ level: target, key: Date.now() });
        }
        // The NPC's closing line stays in the log; the scene then resumes with fresh choices, as if the player had left.
        // A quest conversation (the partner still has a talk beat) is not cut off by the turn limit; the server keeps it
        // open the same way, so only the player concludes or leaves it.
        const questTalk = current.mode === 'talk' && !!current.talkNpc && trackedQuests(game, grown.session).some(tq => { const b = beatOf(grown.session, tq); return b?.do === 'talk' && b.npc === current.talkNpc; });
        // The opening reply (the player hasn't said anything yet) never ends a talk.
        const talkOver = current.mode === 'talk' && !!current.talkNpc && talkTurns(result) >= 1 && (data.endTalk === true || (talkTurns(result) >= TALK_LIMIT && !questTalk));
        // A finished talk stays on screen with its last line and the end divider; only 대화 끝내기 closes it.
        if (talkOver && current.talkNpc) { setSession(keepMemories({ ...grown.session, talkEnded: true, suggestedActions: [] })); void rememberStory(grown.session); return; }
        if (!grown.session.dead && !grown.session.mode && grown.session.hp <= 0 && current.hp > 0) grown.session = { ...grown.session, dead: true, log: [...grown.session.log, '시스템: 사망 — 체력이 다했습니다.'] };
        if (grown.session.dead) grown.session = { ...grown.session, suggestedActions: [] };
        let questFoe = '';
        // In a talk with someone who has quest business, choice 1 is the line that concludes it.
        if (grown.session.mode === 'talk' && grown.session.talkNpc) {
          const npc = grown.session.talkNpc, after = grown.session;
          const business = trackedQuests(game, after).some(tq => { const b = beatOf(after, tq); return b?.do === 'talk' && b.npc === npc; });
          const accept = (typeof data.acceptLine === 'string' && data.acceptLine.trim()) || TALK_ACCEPT;
          grown.session = business ? { ...grown.session, talkAccept: accept, suggestedActions: [accept, ...(grown.session.suggestedActions || []).filter(a => a !== accept)].slice(0, 3) } : { ...grown.session, talkAccept: undefined };
        }
        if (!grown.session.mode && !grown.session.dead && !grown.session.goalCompleted) {
          const after = grown.session, whereNow = regionWhere(game, after);
          let options: string[] | undefined;
          for (const tq of trackedQuests(game, after)) {
            const b = beatOf(after, tq);
            if (!b) continue;
            const here = atPlace(defaultMapGenre(game), 'at' in b ? b.at : undefined, whereNow, after.scenePlace || '');
            // A person the quest needs to talk to waits at their own place: elsewhere they leave the scene.
            if (b.do === 'talk' && !here && b.at?.length && !(after.party || []).includes(b.npc)) grown.session = { ...grown.session, sceneNpcs: (grown.session.sceneNpcs || []).filter(n => n !== b.npc) };
            if (b.do === 'talk' && here && !(after.party || []).includes(b.npc)) grown.session = { ...grown.session, sceneNpcs: [...(grown.session.sceneNpcs || []).filter(n => n !== b.npc), b.npc].slice(-3), handledNpcs: (grown.session.handledNpcs || []).filter(n => n !== b.npc) };
            if (b.do === 'choose' && !options) options = b.options.slice(0, 4);
            if (b.do === 'defeat' && here && !questFoe) questFoe = b.foe;
          }
          if (options) grown.session = { ...grown.session, suggestedActions: options };
        }
        setSession(keepMemories(grown.session));
        void rememberStory(grown.session);
        if (!grown.session.mode && !grown.session.goalCompleted && !grown.session.dead) {
          const genre = defaultMapGenre(game), rosterFoe = questFoe ? findFoe(genre, questFoe) : undefined;
          if (questFoe && !rosterFoe) { setSession(keepMemories({ ...grown.session, threat: { npc: questFoe, monster: false }, log: [...grown.session.log, `시스템: ${questFoe}이(가) 앞을 막아섭니다.`] })); return; }
          // A monster the GM set on the player, or an NPC who hates the player, means a fight with no talking first.
          // A foe no quest asked for has to be fair for the player's level (its range starting at most 4 levels above, as
          // for roaming foes); a stronger one is swapped for a fair foe of the place. Before, a word in the narration
          // brought a Lv.33 망령 기사 to a Lv.3 alley scene.
          const placeNow = regionWhere(game, grown.session), lvNow = grown.session.level || 1;
          const asked = typeof data.ambush === 'string' && isDangerous(genre, placeNow) ? findFoe(genre, data.ambush) : undefined;
          const fairFoe = asked && foeLevelRange(asked.power, !!asked.boss)[0] > lvNow + 4 ? pickEncounter(genre, placeNow, lvNow, Math.random, grown.session.recentFoes) : asked;
          const ambush = rosterFoe || fairFoe || (debug ? debugFoe(game, current, message) : undefined);
          const hostile = (grown.session.sceneNpcs || []).find(n => !(grown.session.party || []).includes(n) && ((grown.session.relationships || []).find(r => r.name.trim() === n.trim())?.affection ?? 0) <= HOSTILE_AFFECTION);
          if (ambush) setSession(keepMemories({ ...grown.session, threat: { npc: ambush.name, monster: true, level: encounterLevel(ambush.power, !!ambush.boss, grown.session.level || 1) }, log: [...grown.session.log, `시스템: 습격! ${ambush.name}이(가) 앞을 막아섭니다.`] }));
          else if (hostile) setSession(keepMemories({ ...grown.session, threat: { npc: hostile, monster: false }, log: [...grown.session.log, `시스템: ${hostile}이(가) 적의를 드러내며 앞을 막아섭니다.`] }));
        }
      }
    } catch (err) {
      setSession(s => ({ ...s, log: [...s.log, `시스템: ${err instanceof Error ? err.message : 'AI 연결 실패'}`] }));
    } finally { setBusy(false); }
  }
  // Map marker is managed independently from the retired image matrix.
  const playerBaseImage = undefined;
  // The reachable place an action names, if any: the move is made by the game, so the GM writes the arrival, not the walk.
  function travelPinFor(text: string, s: Session = session) {
    if (!TRAVEL_VERB.test(text)) return undefined;
    const map = (game.maps || []).find(m => m.id === s.mapId); const here = map?.pins.find(x => x.id === s.pinId);
    if (!map || !here) return undefined;
    const words = (p: MapPin) => p.kind === 'exit' ? [] : p.name.split(/\s+/).filter(w => w.length >= 2 && !GENERIC_PLACE.test(w));
    const headed = (w: string) => [`${w}으로`, `${w}로`, `${w}에 `, `${w}까지`, `${w} 쪽`, `${w}쪽`].some(x => text.includes(x));
    return reachablePins(map, here).find(p => text.includes(p.name) || words(p).some(headed));
  }
  async function moveTo(p: MapPin, intent = '', base: Session = session) {
    const session = base;
    if (busy || session.pendingCheck || session.goalCompleted || session.dead) return;
    const map = (game.maps || []).find(m => m.id === session.mapId);
    const here = map?.pins.find(x => x.id === session.pinId);
    if (!map || !here || !reachablePins(map, here).some(x => x.id === p.id)) return;
    setMapOpen(false);
    let destinationMap = map;
    let destinationPin = p;
    if (p.kind === 'exit') {
      const blocked = p.requiredItem && !(session.inventory || []).includes(p.requiredItem) ? `${p.requiredItem} 아이템이 필요합니다.` : p.requiredFlag && !(session.flags || []).includes(p.requiredFlag) ? `${p.requiredFlag} 조건이 필요합니다.` : '';
      const target = (game.maps || []).find(m => m.id === p.targetMapId);
      const targetPin = target?.pins.find(x => x.id === p.targetPinId) || target?.pins.find(x => x.kind === 'start') || target?.pins.find(x => x.kind !== 'exit' && x.kind !== 'event');
      if (blocked || !target || !targetPin) { setSession(s => ({ ...s, log: [...s.log, `시스템: ${p.name} 이동 불가 — ${blocked || '연결된 목적지가 없습니다.'}`] })); return; }
      destinationMap = target; destinationPin = targetPin;
    }
    const key = `${destinationMap.id}:${destinationPin.id}`;
    const arrivalText = destinationPin.eventTrigger !== 'interact' ? destinationPin.eventText?.trim() || '' : '';
    const arrival = arrivalText && (!destinationPin.eventOnce || !(session.triggeredEvents || []).includes(key)) ? { id: key, text: arrivalText, trigger: 'enter' } : undefined;
    // NPCs stay behind; the GM reports who is at the new place.
    const next: Session = { ...session, mapId: destinationMap.id, pinId: destinationPin.id, scenePlace: undefined, travel: undefined, sceneNpcs: [], handledNpcs: [], mode: undefined, talkNpc: undefined, combat: null, suggestedActions: [], lastCheck: null,
      triggeredEvents: arrival && destinationPin.eventOnce ? [...(session.triggeredEvents || []), key] : session.triggeredEvents,
      log: [...session.log, ...(intent ? [`플레이어: ${intent}`] : []), `시스템: ${destinationMap.name} / ${destinationPin.name}(으)로 이동했습니다.`] };
    const genre = defaultMapGenre(game);
    const place = `${destinationPin.name} ${destinationPin.description || ''}`;
    const hunted = !arrival && isDangerous(genre, place) ? huntTarget(genre, place, questsOf(next)) : undefined;
    const ambusher = hunted ? (Math.random() < HUNT_CHANCE ? hunted : undefined) : !arrival && isDangerous(genre, place) && Math.random() < ENCOUNTER_CHANCE ? pickEncounter(genre, place, next.level || 1, Math.random, next.recentFoes) : undefined;
    if (ambusher) { setSession({ ...next, threat: { npc: ambusher.name, monster: true, level: encounterLevel(ambusher.power, !!ambusher.boss, next.level || 1), lead: `${destinationPin.name}에 들어서자`, fleeTo: session.mapId && session.pinId ? { mapId: session.mapId, pinId: session.pinId } : undefined }, log: [...next.log, `시스템: 습격! ${ambusher.name}이(가) 앞을 막아섭니다.`] }); return; }
    setSession(next);
    await requestGM(`시스템이 이동을 확정했습니다. 플레이어가 ${destinationPin.name}에 도착했습니다. ${intent ? `플레이어가 하려던 일: "${intent}". 가는 길은 한 문장으로 줄이고, 도착하자마자 그 일을 시작한 장면을 쓰세요.` : '도착한 장면을 묘사하세요.'}`, next, arrival, false);
  }
  async function faceThreat() {
    const t = session.threat;
    if (busy || !t) return;
    const base: Session = { ...session, threat: undefined };
    const foe = t.monster ? findFoe(defaultMapGenre(game), t.npc) : undefined;
    if (foe) await startMonsterFight(foe, base, t.lead || '', t.level);
    else await startFight(t.npc, base, true);
  }
  async function fleeThreat() {
    const t = session.threat;
    if (busy || !t) return;
    // Running away always works, at a small cost in reputation (never below 0).
    const practiced = train(session, [statLike(game, AGILITY)], 2);
    const repBefore = session.reputation || 0, repAfter = repBefore > 0 ? Math.max(0, repBefore - FLEE_REPUTATION) : repBefore;
    const back = t.fleeTo && (game.maps || []).find(m => m.id === t.fleeTo!.mapId)?.pins.find(p => p.id === t.fleeTo!.pinId);
    const escaped: Session = { ...practiced, reputation: repAfter, threat: undefined, ...(back ? { mapId: t.fleeTo!.mapId, pinId: back.id, sceneNpcs: [] } : {}), handledNpcs: [...new Set([...(session.handledNpcs || []), t.npc])], sceneNpcs: (back ? [] : (session.sceneNpcs || []).filter(n => n !== t.npc)), suggestedActions: [],
      log: [...session.log, `시스템: 도망 성공 — ${t.npc}에게서 벗어났습니다.${back ? ` ${back.name}(으)로 물러났습니다.` : ''}`, ...(repAfter !== repBefore ? [`시스템: 명성 ${formatReputation(repAfter - repBefore)} (${repAfter.toLocaleString('ko-KR')} · ${reputationRank(repAfter)}) — 도망쳤다는 소문이 돈다`] : [])] };
    setSession(escaped);
    await requestGM(`${t.npc}에게서 간신히 도망쳤다.${back ? ` 왔던 길을 되짚어 ${back.name}(으)로 물러났다.` : ''} 도망친 직후의 장면을 묘사하라.`, escaped, undefined, false);
  }
  // Monsters and hostile gangs are enemies on sight: straight into combat, never into the relationship list.
  async function startMonsterFight(foe: Foe, base: Session, lead = '', met?: number) {
    const level = met ?? encounterLevel(foe.power, !!foe.boss, base.level || 1), stats = enemyStats(level, !!foe.boss);
    const next: Session = { ...base, mode: 'combat', talkNpc: undefined, combat: { npc: foe.name, monster: true, boss: !!foe.boss, level, lethal: true, foeDesc: foe.desc, power: foe.power, enemyHp: stats.hp, enemyMaxHp: stats.hp, enemyDc: stats.dc, enemyDamage: stats.damage, round: 0 },
      npcCombat: { ...(base.npcCombat || {}), [foe.name]: { hp: stats.hp, dc: stats.dc, damage: stats.damage, power: foe.power } },
      suggestedActions: [], lastCheck: null, log: [...base.log, `시스템: 습격! ${foe.name}이(가) 나타났습니다.`] };
    setSession(next);
    await requestGM(`${lead ? lead + ' ' : ''}${foe.name}(${foe.desc})이(가) 덮쳐 온다. 대화의 여지 없이 전투가 시작된다.`, next);
  }
  function meetNpc(s: Session, npc: string, hostile = false): Relationship[] {
    const types = relationshipTypes(game);
    const hostileType = types.find(t => /적대|원수/.test(t)) || types[types.length - 1] || '적대';
    const list = [...(s.relationships || [])];
    const index = list.findIndex(p => p.name.trim().toLocaleLowerCase() === npc.trim().toLocaleLowerCase());
    if (index < 0) list.push({ id: makeId(), name: npc, relation: hostile ? hostileType : (types[0] || '초면'), affection: hostile ? -60 : 10 });
    else if (hostile) list[index] = { ...list[index], relation: hostileType, affection: Math.min(list[index].affection, -60) };
    return list;
  }
  function ignoreNpc(npc: string) {
    if (busy) return;
    setSession(s => ({ ...s, sceneNpcs: (s.sceneNpcs || []).filter(n => n !== npc), handledNpcs: [...(s.handledNpcs || []), npc], log: [...s.log, `시스템: ${npc}을(를) 무시하고 지나쳤습니다.`] }));
  }
  async function startTalk(npc: string) {
    if (busy) return;
    const next: Session = { ...session, mode: 'talk', talkEnded: undefined, talkAccept: undefined, talkNpc: npc, relationships: meetNpc(session, npc), handledNpcs: [...(session.handledNpcs || []), npc], suggestedActions: [], lastCheck: null, log: [...session.log, `시스템: ${npc}와(과) 대화를 시작했습니다.`] };
    setSession(next);
    await requestGM(`${npc}에게 다가가 말을 건다.`, next);
  }
  async function sayToNpc(line: string) {
    const clean = line.trim(); const npc = session.talkNpc;
    if (!clean || !npc || busy) return;
    setAction('');
    // Leaving: a walk-off line, or a line that heads for a named place ("북문 초소로 돌아가 보고한다").
    if ((LEAVING.test(clean) || (/(돌아가|가서|향해|찾아가|이동해)/.test(clean) && !!travelPinFor(clean, session))) && !/[?？]$/.test(clean)) {
      const closed: Session = { ...session, mode: undefined, talkNpc: undefined, sceneNpcs: (session.sceneNpcs || []).filter(n => n !== npc), suggestedActions: [], log: [...session.log, `시스템: ${npc}와(과)의 대화가 끝났습니다.`, `플레이어: ${clean}`] };
      setSession(closed);
      void rememberTalk(session, npc);
      const dest = travelPinFor(clean, closed);
      if (dest) await moveTo(dest, clean, { ...closed, log: closed.log.slice(0, -1) });
      else await requestGM(clean, closed);
      return;
    }
    // Talking trains charm, or the mind when the game has no charm stat.
    const next: Session = { ...train(session, [statLike(game, CHARM) || statLike(game, MIND)]), suggestedActions: [], log: [...session.log, `대화-나: ${clean}`] };
    setSession(next);
    await requestGM(clean, next);
  }
  // Folds lines into one NPC's memory. Updates for the same NPC run one after another and start from
  // the newest note, so a talk and a story batch finishing together don't overwrite each other.
  function foldNpcMemory(gameId: string, npc: string, lines: string[]) {
    if (!lines.length) return;
    const run = (npcMemoryQueue.current[npc] || Promise.resolve()).then(async () => {
      try {
        const note = latestSession.current.gameId === gameId ? latestSession.current.npcNotes?.[npc] || '' : '';
        const res = await fetch('/api/gm/npc-memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ npc, note, lines }) });
        const data = await res.json();
        if (res.ok && typeof data.note === 'string') {
          setSession(cur => cur.gameId === gameId ? { ...cur, npcNotes: { ...(cur.npcNotes || {}), [npc]: data.note } } : cur);
          latestSession.current = { ...latestSession.current, npcNotes: { ...(latestSession.current.npcNotes || {}), [npc]: data.note } };
        }
      } catch (e) { console.warn('NPC 기억 갱신 실패', e); }
    });
    npcMemoryQueue.current[npc] = run;
  }
  function rememberTalk(s: Session, npc: string) {
    const start = s.log.lastIndexOf(`시스템: ${npc}와(과) 대화를 시작했습니다.`);
    foldNpcMemory(s.gameId, npc, start >= 0 ? s.log.slice(start + 1).filter(e => parseTalk(e)).map(historyLine) : []);
  }
  async function endTalk() {
    const npc = session.talkNpc;
    if (busy || !npc) return;
    // A talk that already finished: close it and let the scene move on, a short hand-off rather than a new scene.
    if (session.talkEnded) {
      const closed: Session = { ...session, talkEnded: undefined, talkAccept: undefined, mode: undefined, talkNpc: undefined, sceneNpcs: (session.sceneNpcs || []).filter(n => n !== npc), suggestedActions: [], log: [...session.log, `시스템: ${npc}와(과)의 대화가 끝났습니다.`] };
      setSession(keepMemories(closed));
      void rememberTalk(session, npc);
      await requestGM(`${npc}와(과)의 대화가 방금 끝났다. ${npc}의 대사를 다시 쓰거나 대화 내용을 요약하지 말고, 대화 직후 그 자리의 모습만 1~2문장으로 짧게 서술하라. 장소는 옮기지 말고, 대화에서 정한 일을 하러 가는 행동을 1번 선택지로 제시하라.`, closed, undefined, false);
      return;
    }
    const next: Session = { ...session, mode: undefined, talkNpc: undefined, sceneNpcs: (session.sceneNpcs || []).filter(n => n !== npc), suggestedActions: [], log: [...session.log, `시스템: ${npc}와(과)의 대화를 마쳤습니다.`] };
    setSession(next);
    void rememberTalk(session, npc);
    await requestGM(`${npc}와(과)의 대화를 마치고 물러난다.`, next);
  }
  async function startFight(npc: string, base: Session = session, ambush = false) {
    if (busy && !ambush) return;
    const leaving = (base.party || []).includes(npc);
    // Death only against someone who truly hates the player (affection at or below HOSTILE_AFFECTION). Anyone else who
    // steps out to fight (a quest duel like 바레나, a person blocking the way) leaves the loser near death (HP 1);
    // before, any person who stepped out as a threat fought to the death.
    const lethal = ((base.relationships || []).find(r => r.name.trim() === npc.trim())?.affection ?? 0) <= HOSTILE_AFFECTION;
    const next: Session = { ...base, mode: 'combat', relationships: meetNpc(base, npc, true), party: (base.party || []).filter(n => n !== npc),combat: { lethal, npc, enemyHp: 60, enemyMaxHp: 60, enemyDc: 12, enemyDamage: 8, round: 0 }, handledNpcs: [...(base.handledNpcs || []), npc], suggestedActions: [], lastCheck: null, log: [...base.log, ...(leaving ? [`시스템: ${npc}이(가) 파티를 떠났습니다.`] : []), ambush ? `시스템: ${npc}이(가) 적의를 드러내며 덤벼듭니다!` : `시스템: ${npc}와(과) 전투가 시작됐습니다.`] };
    setSession(next);
    await requestGM(ambush ? `${npc}이(가) 플레이어를 보자마자 적의를 드러내며 덤벼든다. 대화 없이 전투가 시작된다.` : `${npc}에게 덤벼들어 전투를 시작한다.`, next);
  }
  // The answer is all the player sees; the bar it was checked against stays hidden.
  function inviteToParty(npc: string) {
    if (busy || session.mode || session.goalCompleted) { setNotice('진행 중인 장면이 끝난 뒤 권유할 수 있습니다.'); return; }
    const party = session.party || [];
    if (party.includes(npc) || partyResult) return;
    if (party.length >= PARTY_LIMIT) { setNotice(`파티는 최대 ${PARTY_LIMIT}명까지입니다. 먼저 동료 한 명과 헤어지세요.`); return; }
    const rel = (session.relationships || []).find(r => r.name.trim() === npc.trim());
    if (inviteWait(session, npc) > 0) { setNotice(`${npc}은(는) 얼마 전에 거절했습니다. 이야기가 좀 더 진행된 뒤 다시 권유해 보세요.`); return; }
    const chance = rel ? joinChance(rel.affection, session.reputation || 0, npcTaste(game, npc)) : 0;
    const accepted = Math.random() < chance;
    // The NPC visibly weighs the offer before answering; the companion joins only when the answer is revealed.
    // The GM learns of a new companion through state.party, not the log.
    setPartyResult({ npc, accepted, chance, thinking: true });
    window.setTimeout(() => {
      if (accepted) setSession(s => (s.party || []).includes(npc) || (s.party || []).length >= PARTY_LIMIT ? s : { ...s, party: [...(s.party || []), npc], sceneNpcs: (s.sceneNpcs || []).filter(n => n !== npc), handledNpcs: [...new Set([...(s.handledNpcs || []), npc])], companions: s.companions?.[npc] ? s.companions : { ...(s.companions || {}), [npc]: { level: npcLevel(s, npc) || 3, xp: 0 } } });
      else setSession(s => ({ ...s, inviteRefusals: { ...(s.inviteRefusals || {}), [npc]: s.log.length } }));
      setPartyResult(r => r && r.npc === npc ? { ...r, thinking: false } : r);
    }, PARTY_THINK_MS);
  }
  // Abandoning frees a slot; the GM sees it in the log and stops steering toward it.
  // Takes a job from the guild board in the current region; it needs a free quest slot.
  function acceptBoard(r: RegionQuest) {
    if (busy) return;
    if (questsOf(session).length >= MAX_QUESTS) { setNotice(`퀘스트가 가득 찼습니다(${MAX_QUESTS}개).`); return; }
    setSession(s => regionOpen(s, r) ? startRegion(s, r, false) : s);
    setBoardOpen(false);
  }
  function dropQuest(quest: string) {
    if (busy) return;
    if (quest === mainQuestOf(game, session)) { setNotice('메인 퀘스트는 삭제할 수 없습니다.'); return; }
    if (!window.confirm(`이 퀘스트를 삭제할까요?\n\n${quest}`)) return;
    // A dropped regional quest starts over if it comes up again, so its beat progress goes too.
    const droppedIds = ALL_REGION_QUESTS.filter(r => r.steps.some(st => st.q === quest)).map(r => r.id);
    setSession(s => ({ ...s, quests: questsOf(s).filter(q => q !== quest), questProgress: Object.fromEntries(Object.entries(s.questProgress || {}).filter(([k]) => !droppedIds.some(id => k.startsWith(`region:${id}:`)))), regionQuests: Object.fromEntries(Object.entries(s.regionQuests || {}).filter(([id, i]) => ALL_REGION_QUESTS.find(r => r.id === id)?.steps[i]?.q !== quest)), log: [...s.log, `시스템: 목표 포기 — ${quest}`] }));
  }
  // Drinks a healing potion: works in a fight too, where the next exchange starts from the healed HP.
  // Throws one copy away (the one at that place in the bag). A worn piece comes off, unless another copy is still there.
  function discardItem(item: string, index: number) {
    if (busy || session.mode === 'combat') { setNotice('전투 중에는 아이템을 버릴 수 없습니다.'); return; }
    if (!window.confirm(`${item}을(를) 버릴까요?`)) return;
    setSession(s => {
      const inventory = [...(s.inventory || [])], at = inventory[index] === item ? index : inventory.indexOf(item);
      if (at < 0) return s;
      inventory.splice(at, 1);
      const equipped = { ...(s.equipped || {}) };
      for (const slot of Object.keys(equipped) as (keyof Equipped)[]) if (equipped[slot] === item && !inventory.includes(item)) delete equipped[slot];
      const next = { ...s, inventory, equipped };
      return { ...next, hp: Math.min(s.hp, maxHpOf(game, next)), log: [...s.log, `시스템: 버림 — ${item}`] };
    });
  }
  function useItem(item: string) {
    const share = healShareOf(item, infoOf(item, session.itemInfo));
    if (!share || session.dead) return;
    setSession(s => {
      const idx = (s.inventory || []).indexOf(item), max = maxHpOf(game, s);
      if (idx < 0 || s.hp >= max) return s;
      const hp = Math.min(max, s.hp + Math.round(max * share)), inventory = [...(s.inventory || [])];
      inventory.splice(idx, 1);
      return { ...s, hp, inventory, log: [...s.log, `시스템: 사용 — ${item} · HP ${s.hp} → ${hp}`] };
    });
  }
  function toggleEquip(item: string) {
    if (busy || session.mode === 'combat') { setNotice('전투 중에는 장비를 바꿀 수 없습니다.'); return; }
    const info = infoOf(item, session.itemInfo);
    if (info.kind === 'item') return;
    const slot = info.kind;
    setSession(s => {
      const equipped = { ...(s.equipped || {}) };
      if (equipped[slot] === item) delete equipped[slot]; else equipped[slot] = item;
      const next = { ...s, equipped };
      return { ...next, hp: Math.min(s.hp, maxHpOf(game, next)) };
    });
  }
  function leaveParty(npc: string) {
    if (busy || session.mode) return;
    setSession(s => ({ ...s, party: (s.party || []).filter(n => n !== npc), log: [...s.log, `시스템: ${npc}와(과) 헤어졌습니다.`] }));
  }
  async function finishBattle() {
    const c = session.combat;
    if (busy || !c?.result) return;
    const ending = c.result === 'win' ? `${c.npc}을(를) 쓰러뜨려 전투에서 이겼다.` : `${c.npc}에게 패배해 쓰러졌다.`;
    // Fighting trains strength (and agility for long fights).
    const fought = train(session, [statLike(game, gearOf(session.equipped, session.itemInfo).caster ? MIND : STRENGTH), ...(c.round > 6 ? [statLike(game, AGILITY)] : [])], 2);
    // A won fight carries out the defeat beat it answers (quest-beats.ts); the scene after the fight narrates it.
    const progress = { ...(session.questProgress || {}) }, pendingThen = [...(session.pendingThen || [])];
    if (c.result === 'win') for (const tq of trackedQuests(game, session)) {
      const b = beatOf(session, tq);
      if (b?.do === 'defeat' && sameFoe(b.foe, c.npc)) { progress[tq.key] = (progress[tq.key] || 0) + 1; pendingThen.push({ quest: tq.quest, then: b.then }); }
    }
    const ended: Session = { ...fought, questProgress: progress, pendingThen, recentFoes: [c.npc, ...(session.recentFoes || []).filter(n => n !== c.npc)].slice(0, 3), mode: undefined, combat: null, sceneNpcs: (session.sceneNpcs || []).filter(n => n !== c.npc), suggestedActions: [], log: [...session.log, `시스템: 전투 종료 — ${c.result === 'win' ? '승리' : '패배'}`] };
    const died = c.result === 'lose' && !!c.lethal;
    if (died && Math.random() < (REVIVE_CHANCES[session.revivals || 0] ?? REVIVE_CHANCES[REVIVE_CHANCES.length - 1])) {
      // Awakening: levels, full health, a blessed charm, and the same fight resumes against the foe as it stands.
      const from = session.level || 1, to = Math.min(MAX_LEVEL, from + AWAKEN_LEVELS);
      const grown = growStats(game, { ...session, level: to, xp: 0 }, to - from);
      const gift = BLESSING[defaultMapGenre(game)] || BLESSING.fantasy;
      const charm = (session.inventory || []).includes(gift.name) ? undefined : gift.name;
      const itemInfo = charm ? { ...(session.itemInfo || {}), [charm]: { grade: 4 as Grade, kind: 'accessory' as ItemKind, desc: gift.desc, skill: rollSkill('accessory', 4, gift.skill) } } : session.itemInfo;
      const equipped = charm && !session.equipped?.accessory ? { ...(session.equipped || {}), accessory: charm } : session.equipped;
      const risen: Session = { ...grown.session, revivals: (session.revivals || 0) + 1, itemInfo, equipped, inventory: charm ? [...(session.inventory || []), charm] : session.inventory };
      const hp = maxHpOf(game, risen);
      setSession({ ...risen, hp, combat: { ...c, result: undefined, shield: undefined, last: undefined },
        log: [...risen.log, `시스템: 쓰러지는 순간, 어딘가에서 신의 목소리가 울립니다 — "아직 끝이 아니다."`, `시스템: 각성! Lv.${from} → Lv.${to} · HP 완전 회복 (${hp})`, ...(grown.note ? [`시스템: ${grown.note}`] : []), ...(charm ? [`시스템: 획득 — [전설] ${charm}${equipped?.accessory === charm ? ' (장착)' : ''}`] : []), `시스템: ${c.npc}와(과)의 전투가 다시 시작됩니다!`] });
      setAwakenBurst({ level: to, key: Date.now() });
      return;
    }
    // A side quest naming the beaten foe (a 토벌 quest like "숲 트롤 토벌하기") is done the moment the fight is won.
    const huntTracked = trackedQuests(game, session).map(tq => tq.quest);
    const hunts = c.result === 'win' ? questsOf(ended).filter(q => q.includes(c.npc) && q !== mainQuestOf(game, ended) && !huntTracked.includes(q)) : [];
    const huntGivers = hunts.map(q => ended.questGivers?.[q] || '');
    const huntRep = hunts.length * QUEST_REPUTATION, huntTotal = clampReputation((ended.reputation || 0) + huntRep);
    const hunted: Session = !hunts.length ? ended : { ...ended, quests: questsOf(ended).filter(q => !hunts.includes(q)), reputation: huntTotal,
      relationships: (ended.relationships || []).map(r => huntGivers.includes(r.name.trim()) ? { ...r, affection: clampAffection(r.affection + QUEST_AFFECTION) } : r),
      log: [...ended.log, ...hunts.map((q, i) => `시스템: 목표 완료 — ${q}${huntGivers[i] ? ` (의뢰인 ${huntGivers[i]})` : ''}`), `시스템: 명성 ${formatReputation(huntRep)} (${huntTotal.toLocaleString('ko-KR')} · ${reputationRank(huntTotal)})`] };
    // Each 토벌 quest pays one piece of gear, handed out by the code.
    const bounty: string[] = [];
    if (hunts.length) {
      const itemInfo = { ...(hunted.itemInfo || {}) }, genre = defaultMapGenre(game);
      for (const q of hunts.slice(0, 2)) {
        const grade = rollGrade('side', rewardBase(ended.level || 1));
        const got = gearName(genre, randomGearKind(), grade, n => (hunted.inventory || []).includes(n) || bounty.includes(n));
        if (!got) { const p = POTIONS[genre] || POTIONS.fantasy; itemInfo[p.name] = { grade: 0, kind: 'item', desc: p.desc }; bounty.push(p.name); continue; }
        itemInfo[got.name] = { grade, kind: got.kind, desc: `「${q}」의 보수.`, skill: rollSkill(got.kind, grade, '') };
        bounty.push(got.name);
      }
      hunted.itemInfo = itemInfo;
      hunted.inventory = [...(hunted.inventory || []), ...bounty];
      hunted.log = [...hunted.log, `시스템: 획득 — ${bounty.map(n => `[${GRADE_LABELS[itemInfo[n].grade]}] ${n}`).join(', ')}`];
    }
    const fightXp = c.result === 'win' ? battleXp(c.level ?? levelForTier(c.power || 3), ended.level || 1) + hunts.length * questXp(ended.level || 1) : 0;
    const huntedOn = hunts.length ? advanceRegion(game, ended, hunted, hunts) : { session: hunted, finished: [] };
    const won = c.result === 'win' ? withXp(game, huntedOn.session, fightXp + huntedOn.finished.filter(r => r.kind === 'story').length * deedXp('event', ended.level || 1), hunts.length ? `${c.npc} 토벌` : `${c.npc} 격파`) : { session: ended, levelsGained: 0 };
    if (hunts.length) setQuestClear({ quests: hunts.map((name, i) => ({ name, giver: huntGivers[i] })), xp: fightXp, reputation: huntRep, total: huntTotal, items: bounty, levelFrom: ended.level || 1, levelTo: won.session.level || 1, key: Date.now() });
    else if (won.levelsGained) setLevelBurst({ level: won.session.level || 1, key: Date.now() });
    const next: Session = died ? { ...won.session, dead: true, hp: 0, suggestedActions: [], log: [...won.session.log, `시스템: 사망 — ${c.npc}에게 목숨을 잃었습니다.`] } : won.session;
    setSession(next);
    if (died) { await requestGM(`전투 결과: ${c.npc}에게 패배해 플레이어가 죽었다. 구출·포로·기적적 생존 없이 죽음이 확정이다. 플레이어의 마지막 순간을 비장하게 묘사하고 이야기를 끝내라. choices는 빈 배열이다.`, next); return; }
    if (c.result === 'lose') { await requestGM(`전투 결과: ${c.npc}에게 패배해 빈사 상태(HP 1)로 쓰러졌다. 죽지는 않았다. ${c.npc}이(가) 숨통은 끊지 않고 어떻게 했는지(조롱하며 떠남, 소지품을 빼앗음, 경고하고 돌아섬 등) 그 인물답게 묘사하라. hpDelta는 0이다.`, next); return; }
    // What the foe leaves, handed out here and only narrated by the GM, the way a game does it: a beaten monster fades
    // away and leaves a drop where it fell (a piece from the gear table at its grade, else a healing potion); a person
    // leaves what they fought with.
    const genre = defaultMapGenre(game), lootGrade = gradeForTier(c.power || 3);
    const loot = c.result === 'win' && Math.random() < dropChance(c.power || 3) ? gearName(genre, randomGearKind(), lootGrade, n => (next.inventory || []).includes(n)) : undefined;
    const potion = POTIONS[genre] || POTIONS.fantasy;
    const prize = loot ? { name: loot.name, info: { grade: lootGrade, kind: loot.kind as ItemKind, desc: `${c.npc}을(를) 쓰러뜨리고 얻은 전리품.` } } : { name: potion.name, info: { grade: 0 as Grade, kind: 'item' as ItemKind, desc: potion.desc } };
    const withPrize: Session = { ...next, inventory: [...(next.inventory || []), prize.name], itemInfo: { ...(next.itemInfo || {}), [prize.name]: prize.info }, log: [...next.log, `시스템: 획득 — ${loot ? `[${GRADE_LABELS[lootGrade]}] ` : ''}${prize.name}`] };
    setSession(withPrize);
    const found = c.monster ? `쓰러진 ${c.npc}은(는) 빛무리처럼 흩어지며 사라지고, 그 자리에 ${prize.name}이(가) 떨어져 있었습니다` : `${c.npc}이(가) 지니고 있던 ${prize.name}을(를) 손에 넣었습니다`;
    await requestGM(`전투 결과: ${Math.max(0, c.round - 1)}합의 공방 끝에 ${ending} 입힌 피해 ${c.totalDealt || 0}, 받은 피해 ${c.totalTaken || 0}. 전투가 끝난 뒤의 장면을 묘사하세요. ${found}(이미 지급됨, addItems에 넣지 마세요).${c.monster ? ' 몬스터의 몸을 뒤져 꺼냈다고 쓰지 말고, 사라진 자리에 떨어진 전리품을 줍는 장면으로 쓰세요.' : ''}${bounty.length ? ` 토벌 의뢰의 보수(${bounty.join(', ')})도 이미 지급됐으니 addItems에 다시 넣지 마세요.` : ''}`, withPrize);
  }
  function interact() {
    if (busy) return;
    const map = (game.maps || []).find(m => m.id === session.mapId);
    const pin = map?.pins.find(p => p.id === session.pinId);
    if (!map || !pin) return;
    const key = `${map.id}:${pin.id}`;
    if (!pin.eventText || pin.eventTrigger !== 'interact') return;
    if (pin.eventOnce && (session.triggeredEvents || []).includes(key)) {
      setSession(s => ({ ...s, log: [...s.log, '시스템: 이미 완료한 이벤트입니다.'] })); return;
    }
    const next = { ...session, triggeredEvents: pin.eventOnce ? [...(session.triggeredEvents || []), key] : (session.triggeredEvents || []), log: [...session.log, `이벤트: ${pin.eventText}`] };
    setSession(next);
    void requestGM(`플레이어가 ${pin.name}에서 상호작용합니다. 설정된 이벤트를 진행하세요.`, next, { id: key, text: pin.eventText, trigger: 'interact' });
  }
  async function rerollChoices() {
    if (busy || session.pendingCheck || session.mode) return;
    await requestGM('현재 장면에서 고를 새 선택지를 다시 제시하세요.', session, undefined, false, undefined, false, true);
  }
  async function sendPlayerAction(message: string, debug = false) {
    const clean = message.trim();
    if (!clean || busy || session.pendingCheck || session.dead) return;
    if (debug) setAction('');
    // Naming a dismissed NPC calls them back, so the encounter prompt can appear again.
    // Anyone the player already knows can be addressed; talking brings them on stage.
    const known = [...new Set([...(session.sceneNpcs || []), ...(session.relationships || []).map(p => p.name), ...(game.npcPortraits || []).map(n => n.name)])].filter(Boolean).sort((a, b) => b.length - a.length);
    const addressed = !debug ? known.find(n => clean.includes(n)) : undefined;
    if (addressed && SPEECH_INTENT.test(clean)) {
      setAction('');
      const talk: Session = { ...session, mode: 'talk', talkEnded: undefined, talkAccept: undefined, talkNpc: addressed, sceneNpcs: [...new Set([...(session.sceneNpcs || []), addressed])].slice(-3), relationships: meetNpc(session, addressed), handledNpcs: [...(session.handledNpcs || []).filter(n => n !== addressed), addressed], suggestedActions: [], lastCheck: null, log: [...session.log, `시스템: ${addressed}와(과) 대화를 시작했습니다.`, `대화-나: ${clean}`] };
      setSession(talk);
      await requestGM(clean, talk);
      return;
    }
    const dest = !debug ? travelPinFor(clean) : undefined;
    if (dest) { await moveTo(dest, clean); return; }
    const lastScene = [...session.log].reverse().find(e => e.startsWith('GM:')) || '';
    if (!debug && FIGHT_INTENT.test(clean) && BEAST_SCENE.test(lastScene)) {
      const genre = defaultMapGenre(game), pin = (game.maps || []).find(m => m.id === session.mapId)?.pins.find(p => p.id === session.pinId);
      const foe = foeInText(genre, lastScene) || pickEncounter(genre, `${session.scenePlace || ''} ${pin?.name || ''} ${pin?.description || ''}`, session.level || 1, Math.random, session.recentFoes);
      if (foe) { await startMonsterFight(foe, { ...session, suggestedActions: [], log: [...session.log, `플레이어: ${clean}`] }); return; }
    }
    const handledNpcs = (session.handledNpcs || []).filter(n => !clean.includes(n));
    // Now and then the hostile side gets in the way: after the first few actions, at least INTERFERE_GAP actions apart.
    const acts = session.log.filter(e => e.startsWith('플레이어:')).length + 1;
    const interfere = !debug && acts >= 4 && acts - (session.lastInterference || 0) >= INTERFERE_GAP && Math.random() < INTERFERE_CHANCE;
    const next: Session = { ...session, handledNpcs, suggestedActions: [], lastCheck: null, ...(interfere ? { lastInterference: acts } : {}), log: [...session.log, `플레이어: ${debug ? '[테스트] ' : ''}${clean}`] };
    setSession(next);
    await requestGM(clean, next, undefined, true, undefined, debug, false, interfere);
  }
  function exportGame(g: Game) {
    const blob = new Blob([JSON.stringify(g, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${g.name.replace(/[^a-zA-Z0-9가-힣_-]/g, '_') || 'game'}.json`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importGame(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data.name !== 'string' || !(typeof data.prompt === 'string' || (typeof data.world === 'string' && typeof data.rules === 'string' && typeof data.gm === 'string'))) throw Error('Invalid JSON');
      const imported: Game = { ...initial, ...data, profileDone: data.profileDone ?? true, promptDone: data.promptDone ?? !!data.promptDrafts, mapDone: data.mapDone ?? !!data.maps?.length, settingsDone: data.settingsDone ?? !!data.registrationDescription, id: makeId(), name: data.name.slice(0, 100), description: typeof data.description === 'string' ? data.description : '', size: Math.max(5, Math.min(11, Number(data.size) || 7)), hp: Math.max(1, Number(data.hp) || 100), cover: typeof data.cover === 'string' && data.cover.startsWith('data:image/') ? data.cover : '', prompt: String(data.prompt || [data.world, data.rules, data.gm].join('\n')).slice(0, PROMPT_LIMIT), mapImage: typeof data.mapImage === 'string' && data.mapImage.startsWith('data:image/') ? data.mapImage : '', maps: Array.isArray(data.maps) ? data.maps.filter((m: BoardMap) => m && typeof m.id === 'string' && typeof m.image === 'string').map((m: BoardMap) => ({ ...m, pins: Array.isArray(m.pins) ? m.pins : [], links: Array.isArray(m.links) ? m.links : [] })).slice(0, 30) : (typeof data.mapImage === 'string' && data.mapImage.startsWith('data:image/') ? [{ id: makeId(), name: '기존 맵', image: data.mapImage, pins: [] }] : []), assets: Array.isArray(data.assets) ? data.assets.filter((a: Asset) => a && typeof a.name === 'string').slice(0, 60) : [], imageRows: Array.isArray(data.imageRows) ? data.imageRows.filter((r: ImageRow) => r && typeof r.name === 'string') : [], imageColumns: Array.isArray(data.imageColumns) ? data.imageColumns.filter((c: ImageColumn) => c && typeof c.name === 'string') : [], imageCells: Array.isArray(data.imageCells) ? data.imageCells.filter((c: ImageCell) => c && typeof c.image === 'string') : [], created: Date.now(), registrationDescription: typeof data.registrationDescription === 'string' ? data.registrationDescription.slice(0, 2000) : '', genre: typeof data.genre === 'string' ? data.genre : 'RPG / 탐험', gameType: normalizeType(data), cooperation: COOPERATION.includes(data.cooperation) ? data.cooperation : '협동', progression: PROGRESSION.includes(data.progression) ? data.progression : '턴제', playTime: PLAY_TIMES.includes(data.playTime) ? data.playTime : '장기 캠페인', hashtags: Array.isArray(data.hashtags) ? data.hashtags.filter((x: unknown) => typeof x === 'string').slice(0, MAX_TAGS) : [], audience: typeof data.audience === 'string' ? data.audience : '전체 이용가', playMode: data.playMode === 'multi' ? 'multi' : 'single', minPlayers: Math.max(2, Math.min(6, Number(data.minPlayers) || 2)), maxPlayers: Math.max(2, Math.min(6, Number(data.maxPlayers) || 4)) };
      setGames(old => [...old, imported]); setSelected(imported.id); setTab('prompt'); setView('edit'); setNotice('게임을 가져왔습니다.');
    } catch { alert('올바른 게임 JSON 파일이 아닙니다.'); }
    if (fileRef.current) fileRef.current.value = '';
  }
  async function imageToData(file: File, maxWidth = 1200): Promise<string> {
    if (!file.type.startsWith('image/') || file.size > 12_000_000) throw new Error('12MB 이하 이미지 파일만 사용할 수 있습니다.');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.')); img.src = url; });
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이미지 변환에 실패했습니다.');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', .73);
    } finally { URL.revokeObjectURL(url); }
  }
  // Preserve animated GIF bytes: drawing onto a canvas would flatten animation to frame one.
  async function imageToDataPreservingGif(file: File, maxWidth: number): Promise<string> {
    const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
    if (!isGif) return imageToData(file, maxWidth);
    if (file.size > 12_000_000) throw new Error('GIF 파일은 최대 12MB까지 업로드할 수 있습니다.');
    const header = new Uint8Array(await file.slice(0, 6).arrayBuffer());
    const signature = String.fromCharCode(...header);
    if (signature !== 'GIF87a' && signature !== 'GIF89a') throw new Error('올바른 GIF 파일이 아닙니다.');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('GIF를 읽지 못했습니다.'));
      reader.onerror = () => reject(new Error('GIF를 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
  }
  async function uploadPlayerPortrait(file?: File) { if (!file) return; if (file.size > 12 * 1024 * 1024) { alert('플레이어 캐릭터 이미지는 최대 12MB까지 업로드할 수 있습니다.'); return; } try { update({ playerPortrait: await imageToDataPreservingGif(file, 900) }); } catch (e) { alert(String(e)); } }
  async function uploadPinBackground(mapId: string, pinId: string, file?: File) { if (!file) return; if (file.size > 12 * 1024 * 1024) { alert('배경 이미지는 최대 12MB까지 업로드할 수 있습니다.'); return; } try { const image = await imageToDataPreservingGif(file, 1280); const map = (game.maps || []).find(x => x.id === mapId); if (map) changeMap(mapId, { pins: map.pins.map(p => p.id === pinId ? { ...p, background: image } : p) }); } catch (e) { alert(String(e)); } }
  async function uploadCover(file?: File) { if (!file) return; if (file.size > 12 * 1024 * 1024) { alert('게임 표지 이미지는 최대 12MB까지 업로드할 수 있습니다.'); return; } try { update({ cover: await imageToDataPreservingGif(file, 720) }); } catch (e) { alert(String(e)); } }
  async function uploadMaps(files: FileList | null) {
    if (!files?.length) return;
    try {
      const added: BoardMap[] = [];
      for (const file of Array.from(files).slice(0, 1)) added.push({ id: makeId(), name: file.name.replace(/\.[^.]+$/, ''), image: await imageToData(file, 1400), pins: [], links: [] });
      update({ maps: [...(game.maps || []), ...added].slice(0, 30), mapImage: '' });
      setEditingMapId(added[0]?.id || null); setSelectedPinId(null);  setNotice(`${added.length}개 맵을 추가했습니다.`);
    } catch (e) { alert(String(e)); }
  }
  async function uploadPlayerMarker(file?:File) {
    if (!file) return;
    if (!['image/png','image/webp','image/gif'].includes(file.type)) {alert('PNG, WebP 또는 GIF 파일을 사용해 주세요.');return;}
    try {update({playerMarker:await imageToDataPreservingGif(file,256)});} catch(error) {alert(String(error));}
  }
  async function relabelMap(id: string, pins: MapPin[]) {
    // Labels are rendered as live map-marker overlays, not painted onto the image.
    // Recover the clean source for maps created by older versions.
    update({maps:(game.maps || []).map(m=>m.id===id ? {...m,image:m.baseImage || m.image,baseImage:undefined,pins} : m)});
  }
  function changeMap(id: string, patch: Partial<BoardMap>) {
    update({ maps: (game.maps || []).map(m => m.id === id ? { ...m, ...patch } : m) });
  }
  function removeMap(id: string) { if (!confirm('이 맵과 위치 핀을 삭제할까요?')) return; update({ maps: (game.maps || []).filter(m => m.id !== id) }); setEditingMapId(null); setSelectedPinId(null); }
  function handlePinClick(m: BoardMap, pin: MapPin) {
    setSelectedPinId(pin.id);
    setPinMode('select');
  }
  // Capture pointer on the stable canvas, not on a marker that re-renders as it moves.
  function pinDragStart(e: React.PointerEvent<HTMLButtonElement>, m: BoardMap, p: MapPin) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    draggingPin.current = {mapId:m.id,pinId:p.id,startX:e.clientX,startY:e.clientY,moved:false};
    e.currentTarget.parentElement?.setPointerCapture(e.pointerId);
    setSelectedPinId(p.id);
  }
  function canvasPinMove(e: React.PointerEvent<HTMLDivElement>, m: BoardMap) {
    const drag = draggingPin.current;
    if (!drag || drag.mapId !== m.id) return;
    if (!drag.moved && Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY) < 4) return;
    drag.moved = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0,Math.min(100,(e.clientX-rect.left)/rect.width*100));
    const y = Math.max(0,Math.min(100,(e.clientY-rect.top)/rect.height*100));
    changeMap(m.id,{pins:m.pins.map(pin=>pin.id===drag.pinId?{...pin,x,y}:pin)});
  }
  function canvasPinEnd(e: React.PointerEvent<HTMLDivElement>, m: BoardMap) {
    const drag = draggingPin.current;
    if (!drag || drag.mapId!==m.id) return;
    draggingPin.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!drag.moved) return;
    const rect=e.currentTarget.getBoundingClientRect();
    const x=Math.max(0,Math.min(100,(e.clientX-rect.left)/rect.width*100));
    const y=Math.max(0,Math.min(100,(e.clientY-rect.top)/rect.height*100));
    changeMap(m.id,{pins:m.pins.map(pin=>pin.id===drag.pinId?{...pin,x,y}:pin)});
    setNotice('장소 마커와 지도 이름표의 위치를 변경했습니다. 저장 버튼을 눌러 저장하세요.');
  }
  function mapClick(e: React.MouseEvent<HTMLDivElement>, m: BoardMap) {
    if (pinMode === 'select') return;
    if (pinMode === 'relocate') {
      const selected = m.pins.find(p => p.id === selectedPinId);
      if (!selected) { setNotice('먼저 위치를 수정할 장소를 선택하세요.'); return; }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
      const y = Math.max(0, Math.min(100, (e.clientY - rect.top) / rect.height * 100));
      const pins = m.pins.map(p => p.id === selected.id ? {...p,x,y} : p);
      changeMap(m.id,{pins});
      setPinMode('select');

      setNotice(`${selected.name} 위치를 옮겼습니다. 이름표도 새 위치로 갱신됩니다.`);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(100, (e.clientY - rect.top) / rect.height * 100));
    const id = makeId(); const name = pinMode === 'start' ? '새 장소' : pinMode === 'exit' ? '다른 맵으로 이동' : pinMode === 'building' ? '새 건물' : '새 장소';
    changeMap(m.id, { pins: [...m.pins, { id, x, y, kind: pinMode === 'start' ? 'place' : pinMode, name }] }); if(!game.startPinId && !m.pins.length) update({startMapId:m.id,startPinId:id}); setSelectedPinId(id); setPinMode('select');
  }
  function addAsset(kind: Asset['kind']) { const a: Asset = { id: makeId(), name: kind === 'character' ? '새 캐릭터' : '새 몬스터', kind, description: '', image: '', x: 50, y: 50 }; update({ assets: [...(game.assets || []), a] }); }
  function changeAsset(id: string, patch: Partial<Asset>) { update({ assets: (game.assets || []).map(a => a.id === id ? { ...a, ...patch } : a) }); }
  async function uploadAsset(id: string, file?: File) { if (!file) return; try { changeAsset(id, { image: await imageToData(file, 480) }); } catch (e) { alert(String(e)); } }
  function placeAsset(id: string, x: number, y: number) { changeAsset(id, { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }); }
  function removeImageRow(id: string) {
    if (!confirm('분류와 해당 이미지들을 삭제할까요?')) return;
    update({ imageRows: (game.imageRows || []).filter(r => r.id !== id), imageCells: (game.imageCells || []).filter(c => c.rowId !== id) });
  }
  function removeImageColumn(id: string) {
    if (!confirm('상황과 해당 이미지들을 삭제할까요?')) return;
    update({ imageColumns: (game.imageColumns || []).filter(c => c.id !== id), imageCells: (game.imageCells || []).filter(c => c.columnId !== id) });
  }
  function setImageCell(rowId: string, columnId: string, image: string) {
    const cells = (game.imageCells || []).filter(c => !(c.rowId === rowId && c.columnId === columnId));
    update({ imageCells: image ? [...cells, { rowId, columnId, image }] : cells });
  }
  async function uploadImageCell(rowId: string, columnId: string, file?: File) {
    if (!file) return;
    try { setImageCell(rowId, columnId, await imageToData(file, 640)); }
    catch (e) { alert(String(e)); }
  }
  async function uploadNamedImages(files: FileList | null) {
    if (!files?.length) return;
    const rows = [...(game.imageRows || [])];
    const columns = [...(game.imageColumns || [])];
    const cells = [...(game.imageCells || [])];
    let added = 0; const invalid: string[] = [];
    for (const file of Array.from(files)) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { invalid.push(file.name); continue; }
      const basename = file.name.replace(/\.[^.]+$/, '');
      const separator = basename.lastIndexOf('_');
      if (separator < 1 || separator === basename.length - 1) { invalid.push(file.name); continue; }
      const category = basename.slice(0, separator).trim();
      const situation = basename.slice(separator + 1).trim();
      if (!category || !situation) { invalid.push(file.name); continue; }
      let row = rows.find(r => r.name === category);
      if (!row) { row = { id: makeId(), name: category }; rows.push(row); }
      let col = columns.find(c => c.name === situation);
      if (!col) { col = { id: makeId(), name: situation }; columns.push(col); }
      try {
        const image = await imageToData(file, 640);
        const index = cells.findIndex(c => c.rowId === row!.id && c.columnId === col!.id);
        const cell = { rowId: row.id, columnId: col.id, image };
        if (index >= 0) cells[index] = cell; else cells.push(cell);
        added++;
      } catch { invalid.push(file.name); }
    }
    if (added) update({ imageRows: rows, imageColumns: columns, imageCells: cells });
    setNotice(`${added}장 등록 완료${invalid.length ? ` · ${invalid.length}장 제외 (분류_상황 파일명 확인)` : ''}`);
  }
  function changeNpc(id:string,patch:Partial<NpcPortrait>){update({npcPortraits:(game.npcPortraits||[]).map(n=>n.id===id?{...n,...patch}:n)});}
  async function uploadNpc(id:string,file?:File){if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('PNG, JPG, WebP만 가능합니다.');changeNpc(id,{image:await imageToData(file,1024)});setNpcError('');}catch(e){setNpcError(String(e));}}
  // Finishing the prompt does what the map and NPC tabs used to: the genre overview map, a start spot, and NPC portraits.
  function completePrompt(){
    const genre=defaultMapGenre(game);
    const maps=(game.maps||[]).length?undefined:presetMaps(genre);
    update({promptDone:true,mapDone:true,assetsDone:true,...(maps?{maps,startMapId:maps[0].id,startPinId:(genre==='wuxia'?maps[0].pins.find(p=>p.name==='낙양'):maps[0].pins[0])?.id}:{})});
    setTab('settings');
    void extractNpcs();
  }
  async function extractNpcs(){setNpcBusy('extract');setNpcError('');try{const r=await fetch('/api/npc/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:game.prompt,world:game.wizardWorld||game.world})});const d=await r.json();if(!r.ok)throw Error(d.error||'NPC 추출 실패');const existing=game.npcPortraits||[];const npcs:NpcPortrait[]=d.npcs.map((n:{name:string;description:string;appearance:string;gender?:"male"|"female"|"unknown";age?:string;faction?:string;visualIdentity?:string})=>{const old=existing.find(x=>x.name===n.name);const defaultPortrait=defaultNpcImage(game,n.name);return old?{...old,image:old.image||defaultPortrait,description:n.description,appearance:old.appearance||n.appearance,gender:old.gender&&old.gender!=="unknown"?old.gender:n.gender||"unknown",age:old.age||n.age||"",faction:old.faction||n.faction||"",visualIdentity:old.visualIdentity||n.visualIdentity||""}:{id:makeId(),name:n.name,image:defaultPortrait,description:n.description,appearance:n.appearance,gender:n.gender||"unknown",age:n.age||"",faction:n.faction||"",visualIdentity:n.visualIdentity||""};});update({npcPortraits:[...npcs,...existing.filter(x=>!npcs.some(n=>n.name===x.name))]});setNotice(`NPC ${npcs.length}명과 기본 이미지를 자동으로 연결했습니다.`);}catch(e){const message=e instanceof Error?e.message:String(e);setNpcError(message);setNotice(`NPC 이미지 자동 연결 실패: ${message}`);}finally{setNpcBusy('');}}
  async function generateNpc(id:string){const npc=(game.npcPortraits||[]).find(n=>n.id===id);if(!npc)return;if(!npc.gender||npc.gender==="unknown"){setNpcError(`${npc.name}의 성별을 먼저 남성 또는 여성으로 지정해 주세요.`);return;}setNpcBusy(id);setNpcError('');try{const reference=(game.npcPortraits||[]).find(n=>n.image&&n.id!==id)?.image;const r=await fetch('/api/npc/image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:npc.name,description:npc.description,appearance:npc.appearance,gender:npc.gender||"unknown",age:npc.age||"",faction:npc.faction||"",visualIdentity:npc.visualIdentity||"",world:game.wizardWorld||game.world,style:game.npcStyle||'',reference})});const d=await r.json();if(!r.ok)throw Error(d.error||'이미지 생성 실패');changeNpc(id,{image:d.image});setNotice(`${npc.name} 이미지 생성 완료`);}catch(e){setNpcError(e instanceof Error?e.message:String(e));}finally{setNpcBusy('');}}
  const currentTab = tabs.findIndex(t => t.id === tab);

  return <div className="appShell">
    <header className="topbar">
      <button className="logo" onClick={() => setView('library')}><span className="logoMark"><Dices size={22} /></span> CRPG <strong>STUDIO</strong></button>
      <nav className="mainNav"><button className={view === 'library' ? 'navActive' : ''} onClick={() => setView('library')}><FolderOpen size={17} /> 내 게임</button><button className={view === 'edit' ? 'navActive' : ''} onClick={() => setView('edit')}><BookOpen size={17} /> 제작 스튜디오</button><button className={view === 'play' ? 'navActive' : ''} onClick={() => start(game)}><Play size={17} /> 테스트 플레이</button></nav>
      <div className="topRight"><span className="localTag"><span className="onlineDot" /> LOCAL</span><button className="btn primary" onClick={create}><Plus size={16} /> 새 게임</button></div>
    </header>

    {view === 'library' && <main className="libraryPage"><div className="pageHeading"><div><div className="eyebrow">YOUR GAME LIBRARY</div><h1>내가 만든 CRPG</h1><p>프롬프트로 나만의 CRPG를 만들고 보드에서 플레이하세요.</p></div><button className="btn primary" onClick={create}><Plus size={17} /> 새 게임 제작</button></div><div className="libraryToolbar"><h2>내 게임 <span>{games.length}</span></h2><button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> JSON 가져오기</button><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={e => importGame(e.target.files?.[0])} /></div><div className="gameGrid">{games.map(g => <article className="gameCard" key={g.id}><div className="gameCover">{g.cover ? <img src={g.cover} alt={`${g.name} 표지`} /> : <div className="coverFallback"><Dices size={52} /><span>YOUR ADVENTURE AWAITS</span></div>}<span className="coverChip">CRPG · {g.playMode === 'multi' ? `${g.minPlayers || 2}~${g.maxPlayers || 4}인` : '싱글'}</span></div><div className="gameInfo"><h3>{g.name}</h3><p>{g.description || '게임 소개가 없습니다.'}</p><div className="gameActions"><button className="btn primary" onClick={() => start(g)}><Play size={15} /> 플레이</button><button className="btn" onClick={() => { setSelected(g.id); setTab('prompt'); setView('edit'); }}><Settings2 size={15} /> 편집</button><button className="iconButton" title="JSON 다운로드" onClick={() => exportGame(g)}><Download size={17} /></button><button className="iconButton dangerIcon" title="삭제" onClick={() => remove(g)}><Trash2 size={17} /></button></div></div></article>)}<button className="createCard" onClick={create}><span className="createIcon"><Plus size={28} /></span><strong>새 게임 만들기</strong><small>나만의 세계를 만들어 보세요</small></button></div></main>}

    {view === 'edit' && <main className="studioPage"><div className="studioHeading"><button className="backButton" onClick={() => setView('library')}><ArrowLeft size={18} /></button><div><h1>게임 제작</h1><p>변경사항은 저장 버튼을 눌러야 보관됩니다.</p></div><div className="studioActions"><span className="saved">{hasUnsavedChanges ? "저장되지 않은 변경사항" : saveStatus === "saved" ? "저장 완료" : "변경사항 없음"}</span><button className="btn primary" type="button" onClick={()=>void saveGames()} disabled={!ready || saving || !hasUnsavedChanges}><Check size={16} /> {saving ? "저장 중..." : "저장"}</button><button className="btn" onClick={() => exportGame(game)}><Download size={16} /> JSON 백업</button><button className="btn dark" onClick={() => start(game)}><Play size={16} /> 테스트 플레이</button></div></div><div className="studioTabs">{tabs.filter(t => t.id === 'prompt' || (t.id === 'settings' && game.promptDone) || (t.id === 'register' && game.settingsDone)).map(t => <button key={t.id} className={tab === t.id ? 'tabActive' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</div><div className="studioColumns"><section className="editPanel"><div className="sectionHeading"><h2>{tabs[currentTab].label}</h2><p>{tab === 'prompt' ? '게임 유형부터 선택해 프롬프트를 완성하세요. 맵과 NPC 이미지는 자동으로 준비됩니다.' : tab === 'map' ? '맵에 장소·건물을 배치하고 각 위치의 이벤트를 설정하세요.' : tab === 'assets' ? '프롬프트의 NPC를 불러와 통일된 화풍으로 이미지를 만들거나 직접 업로드하세요.' : tab === 'settings' ? '게임 프로필과 게임 화면·캐릭터 정보를 구성하세요.' : '보드게임 유형, 플레이 방식, 예상 시간과 해시태그를 설정하세요.'}</p></div>{tab === 'prompt' && <div className="fields"><PromptBuilder game={game} update={update} busy={draftBusy} setBusy={setDraftBusy} error={draftError} setError={setDraftError} onMap={completePrompt}/><div className="tip">프롬프트는 AI GM에게 전달됩니다. 위치 이동은 맵 핀으로 처리하고 D20은 별도 코드로 처리되며, 프롬프트에 적은 모든 규칙이 자동 구현되는 것은 아닙니다.</div></div>}
{tab === 'assets' && <div className="fields npcEditor"><h3>NPC 관리</h3><p className="assetHelp">NPC 정보를 불러오고 기존 이미지를 관리하거나 직접 업로드할 수 있습니다.</p><p className="assetHelp">기존 NPC 이미지와 직접 업로드한 이미지는 게임 본문 및 관계도에서 계속 사용됩니다.</p><button type="button" className="btn primary" disabled={!!npcBusy||!game.prompt?.trim()} onClick={()=>void extractNpcs()}><Sparkles size={16}/>{npcBusy==='extract'?'NPC 분석 중...':'프롬프트에서 NPC 불러오기'}</button><div className="npcPortraitGrid">{(game.npcPortraits||[]).map(n=><div key={n.id} className="npcPortraitCard"><div className="npcPortraitThumb">{n.image?<img src={n.image} alt={n.name}/>:<ImageIcon size={40}/>}</div><div className="npcPortraitInfo"><strong>{n.name}</strong><small>{n.description}</small><label className="field">성별 <select value={n.gender||"unknown"} onChange={e=>changeNpc(n.id,{gender:e.target.value as "male"|"female"|"unknown"})}><option value="unknown">미설정 · 생성 전 확인</option><option value="male">남성</option><option value="female">여성</option></select></label><label className="field">나이 <input value={n.age||""} onChange={e=>changeNpc(n.id,{age:e.target.value})} placeholder="예: 22세"/></label><label className="field">소속/직책 <input value={n.faction||""} onChange={e=>changeNpc(n.id,{faction:e.target.value})} placeholder="예: 화산파 제자"/></label><label className="field">외형 고정 특징 <textarea rows={2} value={n.visualIdentity||""} onChange={e=>changeNpc(n.id,{visualIdentity:e.target.value})} placeholder="머리색, 눈색, 고유 장식, 무기 등 유지할 특징"/></label><label className="field">외형 설명<textarea rows={3} value={n.appearance} onChange={e=>changeNpc(n.id,{appearance:e.target.value})}/></label><div className="npcPortraitActions"><label className="btn npcUpload"><Upload size={15}/> 직접 업로드<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void uploadNpc(n.id,e.target.files?.[0]);e.target.value='';}}/></label></div></div></div>)}</div>{!(game.npcPortraits||[]).length&&<p className="assetHelp">NPC가 없습니다. 위의 '프롬프트에서 NPC 불러오기'를 눌러 주세요.</p>}{npcError&&<p className="mapGenerationError" role="alert">{npcError}</p>}<div className="mapCompletion"><p>NPC 이미지가 준비되면 게임 본문과 관계도에서 같은 이미지를 사용합니다. 관계도에는 실제로 만난 NPC만 표시됩니다.</p><button type="button" className="btn primary" onClick={()=>{update({assetsDone:true});setTab('settings');}}>NPC 이미지 완료 · 게임 설정으로 이동 <ChevronRight size={16}/></button></div></div>}
{tab === 'map' && <div className="fields mapEditor">
  {(() => { const maps = game.maps || []; const hasMap = maps.length > 0; const startMap = maps.find(m => m.id === game.startMapId); const startPin = startMap?.pins.find(p => p.id === game.startPinId && p.kind !== 'exit'); const hasStart = !!startPin; const totalPlaces = maps.reduce((n,m)=>n+m.pins.filter(p=>p.kind !== 'exit').length,0); const hasPlaces = totalPlaces > 0; const mapReady = hasMap && hasPlaces && hasStart; return <div className="mapWorkflowStatus" aria-label="맵 제작 진행 상태"><h3>맵 제작 진행 현황</h3><p className="assetHelp">필수 작업을 완료하면 페이지 맨 아래에 다음 단계 버튼이 표시됩니다.</p><div className="mapWorkflowProgress"><span style={{width:`${(Number(hasMap)+Number(hasPlaces&&hasStart))/2*100}%`}}/></div><div className="mapWorkflowItem"><strong>{hasMap?'✓':'○'} 1. 맵 이미지 준비</strong><span>{hasMap?'완료':'작업 필요'} · 기본 제공 또는 이미지 업로드</span></div><div className="mapWorkflowItem"><strong>{hasPlaces&&hasStart?'✓':'○'} 2. 장소 및 시작 위치 지정</strong><span>{hasPlaces&&hasStart?'완료':!hasPlaces?'장소를 1개 이상 추가하세요':'시작 장소를 지정하세요'}</span></div></div>; })()}
  <section className="mapStepSection mapStepImage"><div className="mapStepHeader"><span className="mapStepNumber">01</span><div><h3>1단계 · 맵 이미지 준비 및 선택</h3><p>장르 전체 지도 1장이 기본으로 제공됩니다. 그대로 쓰거나 직접 이미지를 업로드하세요.</p></div><span className="mapStepState">{(game.maps||[]).length>0?"✓ 맵 준비 완료":"맵 필요"}</span></div>

<div className="mapMarkerPanel"><div><strong>플레이어 위치 마커</strong><p className="assetHelp">권장: 투명 배경 PNG 또는 애니메이션 GIF, 256×256px. 맵에서 현재 위치에 표시됩니다. 캐릭터 초상화와 별도로 관리합니다.</p></div><label className="mapUpload"><Upload size={16}/> 마커 이미지 등록<input type="file" accept="image/png,image/webp,image/gif,.gif" onChange={e => {void uploadPlayerMarker(e.target.files?.[0]);e.target.value='';}}/></label><img className="mapMarkerSample" src={playerMarkerSrc(game)} alt="플레이어 마커 미리보기"/><button type="button" className="btn" onClick={()=>update({playerMarker:''})} disabled={!game.playerMarker}>기본 마커로 복원</button></div>
  <label className="mapUpload"><Upload size={20}/> 맵 이미지 업로드<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void uploadMaps(e.target.files); e.target.value = ''; }} /></label>
  <div className="mapSelectionArea"><div className="mapSelectionHeading"><strong>작업할 맵 선택</strong><span>{(game.maps||[]).length}개 등록됨 · 카드를 클릭해 편집 맵을 바꾸세요</span></div><div className="mapSelectionGrid">{(game.maps||[]).map(m=>{const selected=((game.maps||[]).some(x=>x.id===editingMapId)?editingMapId:game.maps?.[0]?.id)===m.id;return <button type="button" key={m.id} className={`mapSelectionCard ${selected?'mapSelectionActive':''}`} aria-pressed={selected} onClick={()=>{setEditingMapId(m.id);setSelectedPinId(null);}}><span className="mapSelectionThumb"><img src={m.image} alt="" loading="lazy"/></span><span className="mapSelectionInfo"><strong>{m.name}</strong><small>{m.pins.filter(p=>p.kind!=='exit').length}개 장소 {game.startMapId===m.id?'· 시작 맵':''}</small></span><span className="mapSelectionCheck">{selected?'✓ 선택됨':'선택'}</span></button>})}{!(game.maps||[]).length&&<div className="mapSelectionEmpty">등록된 맵이 없습니다. 기본 맵을 추가하거나 이미지를 업로드하세요.</div>}</div></div></section><section className="mapStepSection mapStepLocations"><div className="mapStepHeader"><span className="mapStepNumber">02</span><div><h3>2단계 · 장소 및 이벤트 설정</h3><p>선택한 맵의 장소를 분석하거나 직접 추가하고, 시작 장소와 이벤트를 설정하세요.</p></div><span className="mapStepState">{(game.maps||[]).some(x=>x.id===game.startMapId&&x.pins.some(p=>p.id===game.startPinId&&p.kind!=='exit'))?'✓ 시작 위치 완료':'장소 설정 필요'}</span></div>
  {(() => { const m = (game.maps || []).find(x => x.id === editingMapId) || (game.maps || [])[0]; if (!m) return <div className="mapStepEmpty">먼저 1단계에서 기본 맵을 불러오거나 이미지를 업로드해 주세요. 맵을 선택하면 장소·이벤트 편집 도구가 표시됩니다.</div>;
    const pin = m.pins.find(p => p.id === selectedPinId);
    return <>
      <div className="startPlaceSummary"><span className="startPlaceSummaryIcon">★</span><div><strong>게임 시작 위치</strong><span>{(game.maps||[]).find(x=>x.id===game.startMapId)?.pins.find(p=>p.id===game.startPinId)?.name || '아직 지정되지 않았습니다'}</span></div></div><div className="worldStartRow"><button type="button" className={`btn ${game.startMapId === m.id ? "primary" : ""}`} onClick={() => update({startMapId:m.id,startPinId:(m.pins.find(p=>p.id===game.startPinId)||m.pins[0])?.id})}>{game.startMapId === m.id ? "✓ 게임 시작 맵" : "이 맵을 게임 시작 맵으로"}</button><span className="assetHelp">순서와 무관하게 시작할 맵만 지정합니다.</span></div><label className="field">맵 이름<input value={m.name} onChange={e => changeMap(m.id, { name: e.target.value })}/></label>
      <div className="mapPinToolbar"><span>맵 클릭 시</span>{([['select','선택'],['relocate','선택 장소 위치 수정'],['place','장소'],['building','건물'],['exit','포탈·출입구']] as const).map(([v,label]) => <button key={v} type="button" className={`btn ${pinMode === v ? 'primary' : ''}`} onClick={() => { setPinMode(v); }}>{label}</button>)}</div>
      <p className="assetHelp">{'장소 마크를 마우스로 잡아 실제 건물 위로 끌어 놓으세요. 장소 간 이동은 지도 좌표를 기준으로 자동 판단합니다.'}</p><div className="pinCanvas" onClick={e => {if (draggingPin.current?.moved) return; mapClick(e,m);}} onPointerMove={e=>canvasPinMove(e,m)} onPointerUp={e=>canvasPinEnd(e,m)} onPointerCancel={e=>{draggingPin.current=null; if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);}}><img src={m.image} alt={m.name} draggable={false}/>{m.pins.map((p,i) => <button key={p.id} type="button" className={`pinMarker ${p.kind} ${selectedPinId === p.id ? 'pinSelected' : ''} ${game.startMapId===m.id && game.startPinId===p.id ? 'pinGameStart' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} title={`${game.startMapId===m.id && game.startPinId===p.id ? '★ 게임 시작 위치 · ' : ''}${i+1}. ${p.name} — 드래그하여 위치 변경`} onPointerDown={e=>pinDragStart(e,m,p)} onClick={e => { e.stopPropagation(); handlePinClick(m,p); }}>{game.startMapId===m.id && game.startPinId===p.id ? '★' : i+1}</button>)}{m.pins.map(p=><span key={`label-${p.id}`} className={`mapPlaceLabel ${game.startMapId===m.id && game.startPinId===p.id ? 'mapStartPlaceLabel' : ''}`} style={{left:`${p.x}%`,top:`${p.y}%`}}>{game.startMapId===m.id && game.startPinId===p.id ? `★ 시작 위치 · ${p.name}` : p.name}</span>)}</div>
      <p className="assetHelp">장소·건물·포탈을 선택하고 맵을 클릭하세요. 처음 추가한 장소가 기본 시작 위치이며 장소를 선택해 변경할 수 있습니다. 장소나 건물을 선택하면 이벤트 내용을 입력할 수 있습니다.</p>
      <p className="assetHelp">장소 간 연결은 자동 처리됩니다. 가까운 곳은 바로 이동하고 먼 곳은 여러 장면을 거쳐 이동합니다. 포탈·출입구는 기존 설정을 사용합니다.</p>
      {pin && <div className="pinDetails"><h3>선택한 위치</h3><label className="field">위치 이름<input value={pin.name} onChange={e => changeMap(m.id, { pins: m.pins.map(p => p.id === pin.id ? { ...p, name: e.target.value } : p) })} onBlur={()=>{}}/></label>
      <label className="field">위치 설명<textarea rows={2} value={pin.description || ''} placeholder="AI GM이 참고할 장소·건물 설명" onChange={e => changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,description:e.target.value}:p)})}/></label>
      {pin.kind !== 'exit' && <div className="field">장소 배경 이미지 <small>플레이 화면 가운데에 표시됩니다 · 없으면 장르 기본 이미지</small>{pin.background && <img className="pinBackgroundPreview" src={pin.background} alt={`${pin.name} 배경`}/>}<div className="uploadBox"><ImageIcon size={20} /><span>{pin.background ? '배경 이미지 바꾸기' : '배경 이미지 선택'}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.gif" onChange={e => { void uploadPinBackground(m.id, pin.id, e.target.files?.[0]); e.target.value = ''; }} /></div>{pin.background && <button type="button" className="btn pinBackgroundRemove" onClick={() => changeMap(m.id, { pins: m.pins.map(p => p.id === pin.id ? { ...p, background: undefined } : p) })}><Trash2 size={15}/> 배경 지우기</button>}</div>}
      {pin.kind !== 'exit' && <button className={`btn ${game.startMapId===m.id && game.startPinId===pin.id?'primary':''}`} type="button" onClick={()=>update({startMapId:m.id,startPinId:pin.id})}>{game.startMapId===m.id && game.startPinId===pin.id ? '★ 현재 게임 시작 위치' : '이 장소를 게임 시작 위치로 지정'}</button>}
      {(pin.kind === 'place' || pin.kind === 'building') && <><label className="field">이 장소·건물에서 발생하는 이벤트<textarea rows={3} value={pin.eventText || ''} placeholder="예: 대장간에 들어오면 대장장이가 무기 거래를 제안한다." onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,eventText:e.target.value}:p)})}/></label><label className="field">이벤트 발동<select value={pin.eventTrigger || 'enter'} onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,eventTrigger:e.target.value as 'enter'|'interact'}:p)})}><option value="enter">도착할 때</option><option value="interact">상호작용할 때</option></select></label><label className="worldCheck"><input type="checkbox" checked={!!pin.eventOnce} onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,eventOnce:e.target.checked}:p)})}/>이벤트 한 번만 발생</label></>}
      {pin.kind === 'exit' && <><label className="field">연결할 맵<select value={pin.targetMapId || ''} onChange={e => changeMap(m.id, { pins: m.pins.map(p => p.id === pin.id ? { ...p, targetMapId: e.target.value, targetPinId: '' } : p) })}><option value="">연결하지 않음</option>{(game.maps || []).filter(x => x.id !== m.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{pin.targetMapId && <label className="field">도착 위치<select value={pin.targetPinId || ''} onChange={e => changeMap(m.id, { pins: m.pins.map(p => p.id === pin.id ? { ...p, targetPinId: e.target.value } : p) })}><option value="">해당 맵의 첫 번째 장소</option>{(game.maps || []).find(x => x.id === pin.targetMapId)?.pins.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}</>}
      {pin.kind === 'exit' && <><label className="worldCheck"><input type="checkbox" checked={pin.bidirectional !== false} onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,bidirectional:e.target.checked}:p)})}/>양방향 이동 허용 (역방향 출입구는 별도로 연결 필요)</label><label className="field">필요 아이템 (선택)<input value={pin.requiredItem || ''} placeholder="예: 고대 열쇠" onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,requiredItem:e.target.value}:p)})}/></label><label className="field">필요 퀘스트 플래그 (선택)<input value={pin.requiredFlag || ''} placeholder="예: 성문 개방" onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,requiredFlag:e.target.value}:p)})}/></label></>}
      <button className="btn" type="button" onClick={() => { changeMap(m.id, { pins: m.pins.filter(p => p.id !== pin.id), links: (m.links || []).filter(l => l.from !== pin.id && l.to !== pin.id) }); setSelectedPinId(null);  }}><Trash2 size={15}/> 위치 삭제</button></div>}
      <div className="mapEditorFooter"><span>위치 {m.pins.length}개 · 출구 {m.pins.filter(p => p.kind === 'exit').length}개</span><button className="btn" type="button" onClick={() => removeMap(m.id)}><Trash2 size={15}/> 이 맵 삭제</button></div>
    </>; })()}
  </section>
  {(() => { const maps = game.maps || []; const start = maps.find(m=>m.id===game.startMapId)?.pins.find(p=>p.id===game.startPinId && p.kind !== 'exit'); return maps.length > 0 && !!start ? <div className="mapCompletion"><p>✓ 맵과 시작 장소가 준비되었습니다. 선택 사항인 장소 이벤트를 확인한 뒤 다음 단계로 이동하세요.</p><button type="button" className="btn primary" onClick={()=>{const latestMaps=game.maps||[];if(!latestMaps.length || !latestMaps.find(m=>m.id===game.startMapId)?.pins.some(p=>p.id===game.startPinId&&p.kind!=='exit'))return;update({mapDone:true});setTab('assets');}}>맵 관리 완료 · NPC 이미지로 이동 <ChevronRight size={16}/></button></div> : null; })()}
  <div className="tip">맵 이미지는 플레이 화면의 미니맵으로 쓰입니다. 플레이어는 미니맵에서 가까운 장소와 포탈만 클릭해 이동하며, 장소마다 올린 배경 이미지가 화면 가운데에 표시됩니다. 싱글플레이에서는 장소 도착 이벤트·상호작용·1회 제한·포탈 조건이 적용되며 AI GM에게 자동 전달됩니다.</div>
</div>}
{tab === 'settings' && <div className="fields">
  <div className="modeSection"><h3>게임 프로필</h3><p className="assetHelp">라이브러리와 등록 화면에 보이는 게임의 첫인상입니다.</p><label className="field">게임 표지 이미지 <small>권장 비율 2:3, PNG·JPG·WebP·움직이는 GIF (최대 12MB)</small><div className="uploadBox"><ImageIcon size={20} /><span>표지 이미지 선택</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.gif" onChange={e => uploadCover(e.target.files?.[0])} /></div></label><label className="field">게임 이름 <span className="required">*</span><input maxLength={60} value={game.name} onChange={e => update({ name: e.target.value })} placeholder="게임 이름을 입력하세요" /></label><label className="field">한 줄 소개 <span className="required">*</span><textarea rows={3} maxLength={200} value={game.description} onChange={e => update({ description: e.target.value })} placeholder="어떤 게임인지 소개해 주세요" /></label></div>


  <div className="modeSection"><h3>플레이 방식</h3><p className="assetHelp">게임을 만들 때 싱글 또는 멀티플레이를 지정합니다.</p>
    <div className="modeChoices">
      <button type="button" className={`modeChoice ${game.playMode !== 'multi' ? 'modeSelected' : ''}`} onClick={() => update({ playMode: 'single' })}><strong>싱글플레이</strong><small>혼자서 AI GM과 플레이</small></button>
      <button type="button" className={`modeChoice ${game.playMode === 'multi' ? 'modeSelected' : ''}`} onClick={() => update({ playMode: 'multi' })}><strong>멀티플레이</strong><small>2~6인 협동 게임 설정</small></button>
    </div>
    {game.playMode === 'multi' && <><div className="playerLimits"><label className="field">최소 인원<select value={game.minPlayers || 2} onChange={e => { const n = Number(e.target.value); update({ minPlayers: n, maxPlayers: Math.max(n, game.maxPlayers || 4) }); }}>{[2,3,4,5,6].map(n => <option key={n} value={n}>{n}명</option>)}</select></label><label className="field">최대 인원<select value={game.maxPlayers || 4} onChange={e => { const n = Number(e.target.value); update({ maxPlayers: n, minPlayers: Math.min(n, game.minPlayers || 2) }); }}>{[2,3,4,5,6].map(n => <option key={n} value={n}>{n}명</option>)}</select></label></div><div className="tip">멀티플레이 설정은 저장되지만 실제 방 생성·초대·실시간 동기화 서버는 아직 구현되지 않았습니다. 현재 테스트 플레이는 싱글 방식으로 실행됩니다.</div></>}
  </div>
  <div className="modeSection"><h3>게임 화면 HUD</h3><p className="assetHelp">플레이 화면에 표시할 정보를 선택하세요. 오른쪽에서 바로 확인할 수 있습니다.</p>
    <label className="hudToggle"><input type="checkbox" checked={game.showHpBar !== false} onChange={e => update({ showHpBar: e.target.checked })}/> 체력바 (HP) 표시</label>
    <label className="hudToggle"><input type="checkbox" checked={game.showEquipment !== false} onChange={e => update({ showEquipment: e.target.checked })}/> 인벤토리 표시</label>
    <label className="hudToggle"><input type="checkbox" checked={game.showDice !== false} onChange={e => update({ showDice: e.target.checked })}/> 필요한 판정에서만 주사위 표시</label>
  </div>
  <div className="modeSection playerPortraitEditor"><h3>플레이어 캐릭터</h3><p className="assetHelp">대화와 전투 화면, 플레이어 정보창에 나오는 주인공 이미지입니다. 배경을 지운 PNG(입상)를 권장합니다. 올리지 않으면 장르 기본 캐릭터가 나옵니다.</p>
    <div className="playerPortraitRow"><div className="playerPortraitPreview"><img src={playerPortraitSrc(game)} alt="플레이어 캐릭터 미리보기"/></div><div className="playerPortraitActions"><label className="uploadBox"><ImageIcon size={20} /><span>{game.playerPortrait ? '이미지 바꾸기' : '이미지 선택'}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.gif" onChange={e => { void uploadPlayerPortrait(e.target.files?.[0]); e.target.value = ''; }} /></label>{game.playerPortrait && <button type="button" className="btn" onClick={() => update({ playerPortrait: undefined })}><Trash2 size={15}/> 기본 캐릭터로 되돌리기</button>}</div></div>
  </div>
  <div className="modeSection characterEditor"><h3>캐릭터 · 정보창 설정</h3><p className="assetHelp">게임별로 정보창 구성과 스탯을 지정합니다. 장비와 소지품은 인벤토리에서 함께 관리합니다. 저장 후 플레이 보드 아래에 반영됩니다.</p>
    <label className="field">게임 유형 프리셋<select value={(game.characterConfig || defaultCharacterConfig()).preset} onChange={e=>update({characterConfig:applyCharacterPreset(game.characterConfig || defaultCharacterConfig(),e.target.value)})}><option value="fantasy">판타지</option><option value="wuxia">무협</option><option value="modern">현대 판타지</option><option value="custom">직접 설정</option></select></label>
    <div className="characterSectionToggles">{([['character','캐릭터 기본 정보'],['stats','능력치'],['inventory','인벤토리'],['status','상태 효과'],['relationships','관계도']] as const).map(([key,label])=><label className="hudToggle" key={key}><input type="checkbox" checked={(game.characterConfig || defaultCharacterConfig()).sections[key] !== false} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,sections:{...c.sections,[key]:e.target.checked}}});}}/>{label}</label>)}</div>
    <div className="characterEditorGrid">{([['initialName','시작 이름'],['initialJob','시작 직업'],['initialRace','시작 종족']] as const).map(([key,label])=><label className="field" key={key}>{label}<input value={(game.characterConfig || defaultCharacterConfig())[key]} onChange={e=>update({characterConfig:{...(game.characterConfig || defaultCharacterConfig()),[key]:e.target.value}})}/></label>)}<label className="field">시작 레벨<input type="number" min="1" value={(game.characterConfig || defaultCharacterConfig()).initialLevel} onChange={e=>update({characterConfig:{...(game.characterConfig || defaultCharacterConfig()),initialLevel:Math.max(1,Number(e.target.value)||1)}})}/></label><label className="field">시작 골드<input type="number" min="0" value={(game.characterConfig || defaultCharacterConfig()).initialGold} onChange={e=>update({characterConfig:{...(game.characterConfig || defaultCharacterConfig()),initialGold:Math.max(0,Number(e.target.value)||0)}})}/></label></div>
    <h4>능력치 · 스탯 항목</h4><div className="characterFieldList">{(game.characterConfig || defaultCharacterConfig()).fields.map(f=><div className="characterFieldEditor" key={f.id}><input aria-label="스탯 이름" value={f.name} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,name:e.target.value}:x)}});}}/><select aria-label="값 종류" value={f.kind} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,kind:e.target.value as InfoField['kind']}:x)}});}}><option value="number">숫자</option><option value="text">텍스트</option><option value="gauge">게이지</option></select><input aria-label="초기치" title="초기치" placeholder="초기치" value={f.initial} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,initial:e.target.value}:x)}});}}/>{(f.kind==='gauge'||f.kind==='number')&&<input aria-label="최대치" title="최대치" placeholder="최대치" type="number" min="1" value={f.max ?? ''} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,max:e.target.value===''?undefined:Math.max(1,Number(e.target.value)||1)}:x)}});}}/>}<label className="characterFieldVisible"><input type="checkbox" checked={f.visible} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,fields:c.fields.map(x=>x.id===f.id?{...x,visible:e.target.checked}:x)}});}}/> 표시</label><button className="btn" type="button" title="스탯 삭제" onClick={()=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.filter(x=>x.id!==f.id)}});}}><Trash2 size={14}/></button></div>)}</div>
    <button className="btn" type="button" onClick={()=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:[...c.fields,{id:makeId(),name:'새 스탯',kind:'number',initial:'0',visible:true}]}});}}><Plus size={15}/> 스탯 추가</button>
    <p className="assetHelp">스탯 초기값은 새 플레이에서 적용됩니다. 기존 플레이 기록의 값은 유지되며 새 항목은 기본값으로 표시됩니다.</p>
  </div>
  <div className="tip">HUD 설정은 테스트 플레이 화면에도 반영됩니다.</div><button type="button" className="btn primary" disabled={!game.name.trim()||!game.description.trim()||(game.finalGoalMode==='progress'&&(game.finalGoalSteps||[]).filter(x=>x.trim()).length<2)} onClick={()=>{update({settingsDone:true,profileDone:true});setTab('register');}}>게임 설정 완료 · 등록으로 이동 <ChevronRight size={16}/></button>
</div>}
{tab === 'register' && <div className="fields registerFields">
  <div className="tip">게임 상세 설명과 해시태그를 직접 입력하거나, 아래 버튼을 눌러 AI 초안을 생성할 수 있습니다. AI 생성은 자동으로 실행되지 않습니다.</div>
  <button type="button" className="btn" disabled={registrationBusy||!game.prompt?.trim()} onClick={()=>void generateRegistration(game)}><Sparkles size={16}/>{registrationBusy?'등록 소개 작성 중...':'AI로 등록 정보 자동 채우기'}</button>
  {registrationError&&<p role="alert" className="tip">{registrationError}</p>}
  <label className="field">게임 상세 설명 <span className="required">*</span><textarea rows={9} maxLength={2000} value={game.registrationDescription || ''} onChange={e => update({ registrationDescription: e.target.value })} placeholder="게임의 세계관, 주요 특징, 플레이 방법을 자세히 소개해 주세요." /></label>
  <div className="counter">{(game.registrationDescription || '').length.toLocaleString()} / 2,000자</div>
  <label className="field">게임 유형 <span className="required">*</span><select value={normalizeType(game)} onChange={e => update({ gameType: e.target.value, genre: e.target.value })}>{GAME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
  <label className="field">협력 방식<select value={game.cooperation || '협동'} onChange={e => update({ cooperation: e.target.value })}>{COOPERATION.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
  <label className="field">진행 방식<select value={game.progression || '턴제'} onChange={e => update({ progression: e.target.value })}>{PROGRESSION.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
  <label className="field">예상 플레이 시간<select value={game.playTime || '장기 캠페인'} onChange={e => update({ playTime: e.target.value })}>{PLAY_TIMES.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
  <div className="tip">게임 유형과 진행 방식은 검색·추천용 분류입니다. 실제 전투·턴·승리 규칙은 게임 프롬프트와 별도 게임 로직에서 구현해야 합니다.</div>
  <label className="field">이용 대상<select value={game.audience || '전체 이용가'} onChange={e => update({ audience: e.target.value })}>{['전체 이용가','청소년 이용가','성인 대상'].map(a => <option key={a} value={a}>{a}</option>)}</select></label>
  <div className="field"><strong>해시태그 <small>최대 {MAX_TAGS}개</small></strong><div className="registerTags">{(game.hashtags || []).map(tag => <button key={tag} type="button" className="registerTag" title="태그 삭제" onClick={() => update({ hashtags: (game.hashtags || []).filter(t => t !== tag) })}>#{tag} ×</button>)}</div><div className="tagEntry"><input maxLength={30} value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const tag = newTag.trim().replace(/^#+/, ''); if (tag && !(game.hashtags || []).includes(tag) && (game.hashtags || []).length < MAX_TAGS) update({ hashtags: [...(game.hashtags || []), tag] }); setNewTag(''); } }} placeholder="태그 입력 후 Enter (예: 로그라이크)"/><button type="button" className="btn" disabled={!newTag.trim() || (game.hashtags || []).length >= MAX_TAGS} onClick={() => { const tag = newTag.trim().replace(/^#+/, ''); if (tag && !(game.hashtags || []).includes(tag)) update({ hashtags: [...(game.hashtags || []), tag] }); setNewTag(''); }}><Plus size={15}/> 추가</button></div></div>
  <div className="tip">등록 정보도 상단 저장 버튼을 눌러야 보관되며 JSON 백업에도 포함됩니다. 실제 온라인 게시 기능은 아직 없습니다.</div>
</div>}
</section><aside className="previewPanel">
  <div className="previewTop"><h2>{tab === 'prompt' ? '프롬프트 미리보기' : tab === 'map' ? '맵 미리보기' : tab === 'settings' ? '게임 설정 미리보기' : '등록 정보 미리보기'}</h2><span>실시간 반영</span></div>
  {tab === 'settings' && <><div className="previewCover">{game.cover ? <img src={game.cover} alt="게임 표지" /> : <div className="previewFallback"><Dices size={65}/><span>CRPG</span></div>}</div><h3>{game.name || '게임 제목'}</h3><p>{game.description || '게임 소개를 입력해 주세요.'}</p><div className="previewTags"><span>CRPG</span><span>{game.playMode === 'multi' ? `멀티 ${game.minPlayers || 2}~${game.maxPlayers || 4}명` : '싱글'}</span></div></>}
  {tab === 'prompt' && <><div className="previewTags"><span>CRPG GM 프롬프트 · 실시간 조합</span><span>{(game.compressedPrompt || buildDraftPrompt(game.promptDrafts || {},game.customPromptSections || [],game.removedPromptSections || []) || game.prompt || '').length.toLocaleString()}자 · 최대 7,000자</span></div><div className="promptPreview">{game.compressedPrompt || buildDraftPrompt(game.promptDrafts || {},game.customPromptSections || [],game.removedPromptSections || []) || game.prompt?.trim() || '왼쪽에서 AI 초안을 선택하거나 커스텀 내용을 작성하면 이곳에 즉시 표시됩니다.'}</div><div className="tip">왼쪽에서 선택하거나 작성한 내용은 미리보기에 즉시 반영됩니다. 상단 저장 버튼을 눌러 보관하세요. 원본 규칙은 보존되며 최종 압축본을 따로 만들 수 있습니다.</div></>}
  {tab === 'assets' && <div className="npcRightHelp"><h3>NPC 이미지 연결</h3><p>프롬프트 → NPC 목록 → AI 생성 / 업로드 → 게임 본문과 관계도</p><p>NPC의 고유 ID와 이름을 유지하며, 게임에서 처음 만난 인물만 관계도에 나타납니다.</p><p>AI 생성에는 OpenAI 이미지 API 비용이 발생할 수 있습니다. 버튼을 누른 인물만 생성합니다.</p><strong>등록 {(game.npcPortraits||[]).length}명 · 이미지 {(game.npcPortraits||[]).filter(n=>n.image).length}장</strong></div>}
  {tab === 'settings' && <div className="liveGamePreview">
    <div className="livePreviewTitle"><span>▶ 실제 게임 화면 구성 미리보기</span><small>{game.playMode === 'multi' ? `멀티 ${game.minPlayers || 2}~${game.maxPlayers || 4}인` : '싱글플레이'}</small></div>
    <section className="characterConfigPreview" aria-label="캐릭터 정보창 실시간 미리보기">
      <div className="characterConfigPreviewHeading"><strong>캐릭터 정보창 · 실시간 미리보기</strong><small>능력치 · 인벤토리 · 상태 · 관계도 탭을 눌러 확인하세요</small></div>
      <CharacterPanel game={game} session={makeSession(game)} portrait={playerBaseImage}/>
      {!(game.characterConfig || defaultCharacterConfig()).sections.character && !Object.values((game.characterConfig || defaultCharacterConfig()).sections).some(Boolean) && <p className="characterConfigPreviewEmpty">모든 정보창 항목이 꺼져 있습니다. 왼쪽 설정에서 표시할 항목을 선택하세요.</p>}
      <p className="characterConfigPreviewHint">설정 변경 즉시 반영됩니다. 미리보기에는 초기값과 시작 장비가 표시되며 실제 플레이 기록은 변경되지 않습니다.</p>
    </section>
    {game.playMode === 'multi' ? <>
      <div className="liveRoomBar"><strong>🎲 멀티플레이 대기실</strong><span>방 코드 RPG-4821 · 예시</span><small>참가 인원 {game.minPlayers || 2}~{game.maxPlayers || 4}명 · 초대 링크 공유</small></div>
      <div className="liveTurnBanner"><strong>▶ 플레이어 1의 턴</strong><span>내 차례 · 이동, 공격, 행동 입력 가능</span></div>
      <div className="livePlayerGrid">{Array.from({length: Math.max(2, Math.min(6, game.maxPlayers || 4))},(_,i)=><div key={i} className={`livePlayerCard ${i===0?'livePlayerActive':''}`}><strong>{i===0?'👑 ':''}플레이어 {i+1}</strong><small>{i===0?'현재 턴':'대기 중'}</small>{game.showHpBar !== false && <><span>♥ {game.hp}/{game.hp}</span><div className="livePlayerHp"><i/></div></>}</div>)}</div>
      <div className="liveBoardScene">{(game.maps || []).length ? <img src={(game.maps || [])[0].image} alt="게임 맵 미리보기"/> : <div className="liveEmptyMap"><ImageIcon size={34}/><span>맵 관리에서 이미지를 등록하면 표시됩니다</span></div>}{(game.maps || [])[0]?.pins.map((p,i) => <span key={p.id} className="mapPlaceName" style={{left:`${p.x}%`,top:`${p.y}%`}} title={p.name}>{p.name}</span>)}</div>
      {(game.showEquipment !== false || combinedStartingItems(game.prompt || '', game.startingEquipment || '').length > 0) && <div className="liveEquipment"><strong>플레이어 1 · 장비 / 인벤토리</strong><div className="liveEquipmentSlots">{combinedStartingItems(game.prompt || '', game.startingEquipment || '').slice(0,6).map((item,i)=><span key={i}>🎒 {item}</span>)}</div></div>}
      <div className="liveChat"><b>✦ AI GM · 전체 플레이어 공유</b><p>플레이어 1이 북쪽 통로로 이동합니다. AI GM 판정 후 위치와 HP가 모든 플레이어에게 반영됩니다.</p><div className="liveChatInput">플레이어 1의 행동 입력 <span>전송</span></div><div className="liveWaiting">플레이어 2~{game.maxPlayers || 4}: 다른 플레이어의 턴에는 행동 입력 잠금</div></div>
      {game.showDice !== false && <div className="liveDice"><Dices size={15}/> 현재 턴 플레이어만 D20 굴리기 <small>결과 전체 공유</small></div>}
    </> : <>
    <div className="liveGameHeader"><strong>{game.name || '새로운 CRPG'}</strong><span>{(game.characterConfig || minimalCharacterConfig()).initialName || '플레이어'}</span></div>
    {game.showHpBar !== false && <div className="liveHp"><div className="liveHpLabel"><b>♥ HP</b><span>{game.hp} / {game.hp}</span></div><div className="liveHpTrack"><div style={{width:'100%'}}/></div></div>}
    <div className="liveBoardScene">{(game.maps || []).length ? <img src={(game.maps || [])[0].image} alt="게임 맵 미리보기"/> : <div className="liveEmptyMap"><ImageIcon size={34}/><span>맵 관리에서 이미지를 등록하면 표시됩니다</span></div>}{(game.maps || [])[0]?.pins.map((p,i) => <span key={p.id} className="mapPlaceName" style={{left:`${p.x}%`,top:`${p.y}%`}} title={p.name}>{p.name}</span>)}</div>
    {(game.showEquipment !== false || combinedStartingItems(game.prompt || '', game.startingEquipment || '').length > 0) && <div className="liveEquipment"><strong>장비 · 인벤토리</strong><div className="liveEquipmentSlots">{combinedStartingItems(game.prompt || '', game.startingEquipment || '').slice(0,6).map((item,i)=><span key={i} title={item}>🎒 {item}</span>)}{!combinedStartingItems(game.prompt || '', game.startingEquipment || '').length && <em>등록된 시작 장비 없음</em>}</div></div>}
    <div className="liveChat"><b>✦ AI 게임 마스터</b><p>모험이 시작되었습니다. 주변을 살펴보거나 원하는 행동을 입력하세요.</p><div className="liveChatInput">어떤 행동을 하시겠습니까? <span>전송</span></div></div>
    {game.showDice !== false && <div className="liveDice"><Dices size={15}/> D20 굴리기 <small>판정 결과는 게임 중 표시</small></div>}
    </>}
    <p className="livePreviewNote">설정에 따른 화면 구성 미리보기입니다. 멀티플레이 대기실·턴·동기화는 시각적 예시이며, 실제 실시간 서버는 아직 연결되지 않았습니다.</p>
  </div>}
  {tab === 'register' && <div className="registrationPreview"><div className="registrationCover">{game.cover ? <img src={game.cover} alt="게임 표지"/> : <div className="previewFallback"><Dices size={52}/><span>CRPG</span></div>}</div><h3>{game.name || '게임 제목'}</h3><p>{game.registrationDescription || '왼쪽에서 게임 상세 설명을 입력해 주세요.'}</p><div className="previewTags"><span>{normalizeType(game)}</span><span>{game.cooperation || '협동'}</span><span>{game.progression || '턴제'}</span><span>{game.playTime || '장기 캠페인'}</span><span>{game.playMode === 'multi' ? `${game.minPlayers || 2}~${game.maxPlayers || 4}인` : '싱글'}</span><span>{game.audience || '전체 이용가'}</span></div><div className="registerTags">{(game.hashtags || []).map(t => <span className="registerTag" key={t}>#{t}</span>)}</div><div className="tip">등록 미리보기 · 로컬 저장 전용</div></div>}
</aside></div></main>}

    {view === 'play' && <main className="playPage"><div className="playHeading"><div><button className="textBack" onClick={() => { setView('edit'); setTab('prompt'); }}><ArrowLeft size={16} /> 스튜디오로 돌아가기</button><h1>{game.name}</h1><p>{game.description}</p></div><button className="btn" onClick={newGame} disabled={busy}><RotateCcw size={16} /> 새로하기</button></div>{(() => {
  const maps = game.maps || [];
  const m = maps.find(x => x.id === session.mapId) || maps[0];
  const here = m?.pins.find(p => p.id === session.pinId);
  const reachable = m && here ? reachablePins(m, here).map(p => p.id) : [];
  const locked = busy || !!session.pendingCheck || session.goalCompleted === true || !!session.dead || !!session.threat || !!session.mode;
  const board = regionBoard(game, session);
  const encounterNpc = !session.mode && !session.dead && !session.threat ? (session.sceneNpcs || []).find(n => !(session.handledNpcs || []).includes(n) && !(session.party || []).includes(n)) : undefined;
  const talkStart = session.mode === 'talk' && session.talkNpc ? session.log.lastIndexOf(`시스템: ${session.talkNpc}와(과) 대화를 시작했습니다.`) : -1;
  const talkThread = talkStart >= 0 ? session.log.slice(talkStart + 1).map(parseTalk).filter((t): t is TalkLine => !!t) : [];
  const background = placeBackground(game, here);
  const npcs = (session.sceneNpcs || []).map(name => ({ name, image: npcImage(game, name, session.activeImageKey) }));
  const interactKey = m && here ? `${m.id}:${here.id}` : '';
  const showMap = mapOpen && !!m && session.mode !== 'combat';
  const interactable = !!here && here.eventTrigger === 'interact' && !!here.eventText?.trim() && !(here.eventOnce && (session.triggeredEvents || []).includes(interactKey));
  return <div className="playGrid playGridThree">
  <section className="playInfoPanel">
    <div className="panelHeading"><h2><Dices size={18} /> 플레이어</h2><span className="softPill">{game.playMode === 'multi' ? `멀티 ${game.minPlayers || 2}~${game.maxPlayers || 4}인` : '싱글'} · D20</span></div>
    <CharacterPanel game={game} session={session} portrait={game.playerPortrait} onInvite={inviteToParty} onLeave={leaveParty} onDropQuest={dropQuest} onEquip={toggleEquip} onUse={useItem} onDiscard={discardItem}/>
  </section>
  <section className="playScenePanel">
    <div className={`sceneStage${session.mode === 'combat' ? ' sceneBattleMode' : ''}${showMap ? ' sceneMapMode' : ''}${showMap && m && mapRatios[m.baseImage || m.image] ? ' sceneMapFitted' : ''}`} style={showMap && m && mapRatios[m.baseImage || m.image] ? { aspectRatio: String(mapRatios[m.baseImage || m.image]) } : undefined}>
      {background ?<img className="sceneBackground" src={background} alt="" draggable={false}/> : <div className="sceneBackground sceneFallback"/>}
      <button type="button" className={`sceneLocation${showMap ? ' open' : ''}`} disabled={!m} aria-expanded={showMap} title={showMap ? '지도 닫기' : '지도를 열어 이동'} onClick={() => setMapOpen(o => !o)}><MapPinIcon size={14}/><span>{m ? `${m.name} · ` : ''}{here?.name || '위치 미지정'}</span><b>{showMap ? <><X size={13}/> 닫기</> : <><MapIcon size={13}/> 지도</>}</b></button>
      {showMap && m && <div className="stageMap">
        <div className="miniMap"><div className="stageMapFrame">
          <img src={m.baseImage || m.image} alt={m.name} draggable={false} ref={img => { if (img?.complete) noteMapRatio(m.baseImage || m.image, img); }} onLoad={e => noteMapRatio(m.baseImage || m.image, e.currentTarget)}/>
          {m.pins.filter(p => p.kind !== 'event').map(p => { const current = p.id === here?.id; const near = reachable.includes(p.id); return <button key={p.id} type="button" className={`miniMapPin ${current ? 'current' : near ? 'near' : 'far'}${p.kind === 'exit' ? ' exit' : ''}`} style={{left:`${p.x}%`,top:`${p.y}%`}} aria-disabled={!near || locked} title={current ? `현재 위치: ${p.name}` : near ? (p.kind === 'exit' ? p.name : `${p.name}(으)로 이동`) : `${p.name} · 너무 멀어서 바로 갈 수 없습니다`} onClick={() => { if (near && !locked) void moveTo(p); }}><i aria-hidden="true"/><span>{p.name}</span></button>; })}
          {here && <img className="miniMapPlayer" src={playerMarkerSrc(game)} alt="플레이어 현재 위치" draggable={false} style={{left:`${here.x}%`,top:`${here.y}%`}}/>}
        </div></div>
        <p className="stageMapHint">{locked ? '진행 중인 장면이 끝나면 이동할 수 있습니다.' : '밝게 표시된 가까운 장소를 눌러 이동하세요.'}</p>
      </div>}
      {!showMap && session.mode !== 'combat' && (npcs.length > 0 || session.mode === 'talk') && <div className={`sceneNpcs${session.mode === 'talk' ? ' sceneTalking' : ''}`}>{session.mode === 'talk' && (() => {
        const mine = talkThread.filter(t => t.speaker === 'me');
        const speaking = talkThread[talkThread.length - 1]?.speaker === 'me';
        return <figure key="__player" className={`sceneNpc scenePlayer${speaking ? ' scenePlayerSpeaking' : ''}`}><div key={`me-${mine.length}`} className={`sceneNpcBody${speaking ? ' npcTalk' : ''}`}><img src={playerPortraitSrc(game)} alt="플레이어" draggable={false}/></div><figcaption>나</figcaption></figure>;
      })()}{npcs.map(n => {
        const partner = session.mode === 'talk' && n.name === session.talkNpc;
        const npcLines = partner ? talkThread.filter(t => t.speaker === 'npc') : [];
        const lastLine = npcLines[npcLines.length - 1];
        // Re-keying on each new line restarts the one-shot motion.
        return <figure key={n.name} className={`sceneNpc${partner ? ' sceneNpcFocus' : session.mode === 'talk' ? ' sceneNpcDim' : ''}${partner && busy ? ' sceneNpcListening' : ''}`}>
          <div key={partner ? `line-${npcLines.length}` : 'still'} className={`sceneNpcBody${lastLine ? ' ' + gestureMotion(lastLine.gesture, lastLine.line) : ''}`}>{n.image ? <img src={n.image} alt={n.name} draggable={false}/> : <div className="sceneNpcSilhouette"><Users size={42}/></div>}</div>
          <figcaption>{n.name}</figcaption></figure>; })}</div>}
      {session.mode === 'combat' && session.combat && (() => {
        const c = session.combat;
        const ev = c.last;
        const enemyImage = npcImage(game, c.npc);
        const pop = (value: number | null | undefined, crit?: boolean) => value === null || value === undefined ? null : value > 0 ? { text: `-${value}`, cls: crit ? ' crit' : '' } : { text: 'MISS', cls: ' miss' };
        const enemyPop = pop(ev?.dealt, ev?.critDealt), playerPop = pop(ev?.taken, ev?.critTaken);
        const react = (value: number | null | undefined, crit?: boolean) => value === null || value === undefined ? '' : value > 0 ? ` battleHit${crit ? ' battleCrit' : ''}` : ' battleDodge';
        // Each exchange re-keys the fighters so it replays: I dash in and strike, return, then the foe dashes back at me.
        return <div className={`battleStage battle-${defaultMapGenre(game)}`}>
          <div className="battleFlash" aria-hidden="true"/>
          <div className="battleVs" aria-hidden="true">VS {c.npc}</div>
          <div className="battleSide battlePlayer">
            {(session.party || []).filter(n => n !== c.npc).length > 0 && <div className="battleAllyRow">{(session.party || []).filter(n => n !== c.npc).map(ally => { const face = npcImage(game, ally); const struck = !!ev?.allies?.includes(ally); return <figure key={`${ally}-${c.round}`} className={`battleAlly${struck ? ' battleAllyHit' : ''}`}>{face ? <img src={face} alt={ally} draggable={false}/> : <Users size={20}/>}<figcaption>{ally} Lv.{npcLevel(session, ally) || 3}</figcaption></figure>; })}</div>}<div className="battleHp"><span>나</span><div><i style={{width:`${Math.max(0, Math.min(100, session.hp / Math.max(1, maxHpOf(game, session)) * 100))}%`}}/></div><b>{session.hp}/{maxHpOf(game, session)}</b></div>{gearOf(session.equipped, session.itemInfo).caster && maxManaOf(game, session) > 0 && (() => { const mm = maxManaOf(game, session), mp = Math.min(mm, session.mana ?? mm), gauge = Math.min(SPELL_GAUGE, c.castGauge || 0); return <><div className="battleHp battleMp"><span>MP</span><div><i style={{width:`${mp / mm * 100}%`}}/></div><b>{mp}/{mm}</b></div><div className="battleHp battleCast"><span>시전</span><div><i style={{width:`${gauge / SPELL_GAUGE * 100}%`}}/></div><b>{Math.round(gauge / SPELL_GAUGE * 100)}%</b></div></>; })()}
            <div key={`p${c.round}`} className={`battleBody${ev && !c.result ? ' battleLungeRight' : ''}`}>
              <div className={`battleReact${c.result === 'lose' ? ' battleDown' : react(ev?.taken, ev?.critTaken) + ' battleLate'}`}><img src={playerPortraitSrc(game)} alt="플레이어" draggable={false}/></div>
            </div>
            {playerPop && <span key={`pp${c.round}`} className={`battlePop battleLate${playerPop.cls}`}>{playerPop.text}</span>}
            {!!ev?.taken && <i key={`ps${c.round}`} className="battleSlash battleSlashBack battleLate" aria-hidden="true"/>}
          </div>
          <div className="battleSide battleEnemy">
            <div className="battleHp"><span>{c.npc} Lv.{c.level ?? levelForTier(c.power || 3)}</span><div><i style={{width:`${c.enemyHp / Math.max(1, c.enemyMaxHp) * 100}%`}}/></div><b>{c.enemyHp}/{c.enemyMaxHp}</b></div>
            <div key={`e${c.round}`} className={`battleBody${ev && ev.taken !== null && !c.result ? ' battleLungeLeft battleCounter' : ''}`}>
              <div className={`battleReact${c.result === 'win' ? ' battleDown' : react(ev?.dealt, ev?.critDealt) + ' battleEarly'}`}>{enemyImage && !c.monster ? <img src={enemyImage} alt={c.npc} draggable={false}/> : c.monster ? <div className="battleMonsterArt">{foeImage(defaultMapGenre(game), c.npc) && <img src={foeImage(defaultMapGenre(game), c.npc)} alt={c.npc} draggable={false} onLoad={e => e.currentTarget.parentElement?.classList.add('hasArt')} onError={e => { e.currentTarget.style.display = 'none'; }}/>}<div className="sceneNpcSilhouette battleMonster"><Skull size={54}/></div></div> : <div className="sceneNpcSilhouette"><Users size={42}/></div>}</div>
            </div>
            {enemyPop && <span key={`ep${c.round}`} className={`battlePop battleEarly${enemyPop.cls}`}>{enemyPop.text}</span>}
            {!!ev?.dealt && <i key={`es${c.round}`} className="battleSlash battleEarly" aria-hidden="true"/>}
          </div>
        </div>;
      })()}
      {!showMap && session.threat && !session.mode && (() => {
        // The foe blocking the way stands on the stage while the player decides to fight or run.
        const t = session.threat;
        const art = t.monster ? foeImage(defaultMapGenre(game), t.npc) : npcImage(game, t.npc);
        return <figure className="sceneThreat">
          <div className="battleMonsterArt">{art && <img src={art} alt={t.npc} draggable={false} onLoad={e => e.currentTarget.parentElement?.classList.add('hasArt')} onError={e => { e.currentTarget.style.display = 'none'; }}/>}<div className="sceneNpcSilhouette battleMonster"><Skull size={54}/></div></div>
          <figcaption>{t.npc}</figcaption>
        </figure>;
      })()}
      {busy && <div className="sceneBusy">이야기가 이어지고 있습니다...</div>}
    </div>
    {session.pendingCheck && <div className="diceCheckPanel"><div className="diceCheckTop"><strong><Dices size={18}/> {session.pendingCheck.label} 판정</strong><span>DC {session.pendingCheck.dc}</span></div><p>{session.pendingCheck.reason}</p>{(session.pendingCheck.success || session.pendingCheck.failure) && <ul className="diceStakes">{session.pendingCheck.success && <li className="win"><b>성공</b> {session.pendingCheck.success}</li>}{session.pendingCheck.failure && <li className="lose"><b>실패</b> {session.pendingCheck.failure}</li>}</ul>}<button type="button" className="btn primary" disabled={busy} onClick={() => void roll()}><Dices size={17}/> D20 굴리기</button></div>}
    {session.lastCheck && !session.pendingCheck && <div className="diceCheckResult"><strong>{session.lastCheck.label} · {session.lastCheck.critical || (session.lastCheck.success ? '성공' : '실패')}</strong><span>D20 {session.lastCheck.die} {session.lastCheck.modifier >= 0 ? '+' : '-'} {Math.abs(session.lastCheck.modifier)} = {session.lastCheck.total} / DC {session.lastCheck.dc}</span></div>}
    {session.mode === 'combat' && session.combat ? <div className="combatPanel">
      <div className="combatHeader"><strong><Swords size={16}/> 전투 · {session.combat.npc}</strong><span>{session.combat.round <= 1 ? '준비' : `${session.combat.round - 1}합`}</span></div>
      <p className="combatAuto">{session.combat.result ? '전투가 끝났습니다.' : session.combat.round < 1 || busy ? '상대를 살피는 중...' : '자동 전투 진행 중 — 오른쪽 진행 기록에서 상황을 확인하세요.'}</p>
    </div>
    : session.mode === 'talk' && session.talkNpc ? <div className="talkPanel">
      <div className="talkHeader"><strong><MessageCircle size={16}/> {session.talkNpc}</strong><button type="button" className="btn" disabled={busy} onClick={() => void endTalk()}>대화 끝내기</button></div>
      <div className="talkThread" ref={talkRef}>
        {talkThread.map((t, i) => <TalkBubble key={i} t={t} image={t.speaker === 'npc' ? npcImage(game, t.name) : undefined} typing={i === talkThread.length - 1 && t.speaker === 'npc'}/>)}
        {session.talkEnded && !busy && <div className="talkEndedLine" role="status"><span>대화가 종료되었습니다</span></div>}
        {busy && <div className="talkRow talkNpc"><span className="talkAvatar">{npcImage(game, session.talkNpc) ? <img src={npcImage(game, session.talkNpc)} alt=""/> : session.talkNpc.slice(0, 1)}</span><div className="talkBody"><div className="talkBubbleBox talkTyping" aria-label="입력 중"><i/><i/><i/></div></div></div>}
      </div>
      {!busy && !session.talkEnded && !!session.suggestedActions?.length && <div className="talkSuggestions">{session.suggestedActions.slice(0, 3).map((line, i) => <button key={`${i}-${line}`} type="button" onClick={() => void sayToNpc(line)}><span className="gmChoiceNumber">{i + 1}</span>{line}</button>)}</div>}
      {!session.talkEnded && <form className="talkInput" onSubmit={e => { e.preventDefault(); void sayToNpc(action); }}><input value={action} onChange={e => setAction(e.target.value)} maxLength={300} disabled={busy} placeholder={`${session.talkNpc}에게 메시지 보내기`} aria-label="대사 입력"/><button className="btn primary" type="submit" disabled={busy || !action.trim()}><Send size={15}/> 보내기</button></form>}
    </div>
    : session.threat && !session.dead ? <div className="encounterPanel threatPanel">
      <p>{session.threat.monster ? <Skull size={16}/> : <Swords size={16}/>} <strong>{session.threat.npc}</strong><em className="npcLevelTag">Lv.{session.threat.level ?? (session.threat.monster ? levelForTier(findFoe(defaultMapGenre(game), session.threat.npc)?.power || 3) : npcLevel(session, session.threat.npc) || 3)}</em>이(가) 앞을 막아섰습니다! 대화는 통하지 않습니다.</p>
      {(() => { const foe = session.threat.monster ? findFoe(defaultMapGenre(game), session.threat.npc) : undefined; const tier = foe?.power ?? session.npcPower?.[session.threat.npc] ?? 3; return <FoeCard name={session.threat.npc} tier={tier} level={session.threat.level} desc={foe?.desc} boss={!!foe?.boss}/>; })()}
      <div className="encounterActions">
        <button type="button" className="encounterAction encounterFight" disabled={busy} onClick={() => void faceThreat()}><Swords size={22}/><strong>싸운다</strong></button>
        <button type="button" className="encounterAction encounterFlee" disabled={busy} onClick={() => void fleeThreat()}><Footprints size={22}/><strong>도망친다</strong></button>
      </div>
    </div>
    : encounterNpc && !session.pendingCheck ? <div className="encounterPanel">
      <p><strong>{encounterNpc}</strong>이(가) 눈앞에 있습니다. 어떻게 할까요?</p>
      <div className="encounterActions">
        <button type="button" className="encounterAction encounterTalk" disabled={busy} onClick={() => void startTalk(encounterNpc)}><MessageCircle size={22}/><strong>대화하기</strong></button>
        <button type="button" className="encounterAction encounterFight" disabled={busy} onClick={() => void startFight(encounterNpc)}><Swords size={22}/><strong>싸우기</strong></button>
        <button type="button" className="encounterAction encounterIgnore" disabled={busy} onClick={() => ignoreNpc(encounterNpc)}><EyeOff size={22}/><strong>무시하기</strong></button>
      </div>
    </div>
    : <>
    {session.dead && !busy && <div className="deathPanel"><Skull size={30}/><strong>사망</strong><p>당신의 이야기는 여기서 끝났습니다.</p><button type="button" className="btn primary" onClick={newGame}><RotateCcw size={16}/> 새로 시작하기</button></div>}
    {!session.dead && !session.threat && !session.pendingCheck && !busy && !!session.suggestedActions?.length && <div className="gmChoices"><div className="gmChoicesHeading"><strong>다음 행동을 선택하세요</strong><span>이동은 지도 버튼으로</span><button type="button" className="gmReroll" onClick={() => void rerollChoices()} title="장면은 그대로 두고 선택지만 새로 뽑습니다"><RotateCcw size={13}/> 선택지 다시 뽑기</button></div>{session.suggestedActions.slice(0, 3).map((choice, index) => <button key={`${index}-${choice}`} type="button" className="gmChoiceButton" onClick={() => void sendPlayerAction(choice)}><span className="gmChoiceNumber">{index + 1}</span><span>{choice.replace(/^\s*[(\[]?\s*특이한\s*행동\s*\d?\s*[)\]]?\s*[:：\-—]?\s*/, '')}</span><ChevronRight size={16}/></button>)}
      <form className="gmChoiceButton gmChoiceOwn" onSubmit={e => { e.preventDefault(); const v = ownAction.trim(); if (v) { setOwnAction(''); void sendPlayerAction(v); } }}><span className="gmChoiceNumber">{Math.min(3, session.suggestedActions.length) + 1}</span><input value={ownAction} onChange={e => setOwnAction(e.target.value)} maxLength={300} placeholder="직접 행동 입력 — 하고 싶은 행동을 적으세요" aria-label="직접 행동 입력"/><button type="submit" disabled={!ownAction.trim()} aria-label="행동하기"><ChevronRight size={16}/></button></form></div>}
    {interactable && !locked && <button type="button" className="btn sceneInteract" onClick={interact}><Sparkles size={15}/> {here!.name}에서 상호작용하기</button>}
    {board.length > 0 && !locked && <div className="questBoard"><button type="button" className="btn sceneInteract" onClick={() => setBoardOpen(o => !o)}><ScrollText size={15}/> 의뢰 게시판 ({board.length})</button>
      {boardOpen && <div className="questBoardList">{questsOf(session).length >= MAX_QUESTS && <p className="questBoardFull">퀘스트가 가득 찼습니다({MAX_QUESTS}개). 하나를 끝내거나 포기해야 새 의뢰를 받을 수 있습니다.</p>}
        {board.map(r => <div key={r.id} className="questBoardItem"><div><strong>{r.title}</strong><small>의뢰인 {r.giver}{r.steps.length > 1 ? ` · ${r.steps.length}단계` : ''}</small><p>{r.hook}</p></div><button type="button" className="btn" disabled={questsOf(session).length >= MAX_QUESTS} onClick={() => acceptBoard(r)}>수락</button></div>)}</div>}</div>}
    {/* Creator's test command: whatever is typed happens at once. Kept apart at the bottom, unnumbered. */}
    {!locked && <form className="gmChoiceCustom gmChoiceTest" onSubmit={e => { e.preventDefault(); void sendPlayerAction(action, true); }}><span className="gmChoiceTestTag">테스트</span><input value={action} onChange={e => setAction(e.target.value)} maxLength={300} placeholder="테스트 명령 — 적은 그대로 바로 일어납니다 (예: 혈영이 나타난다)" aria-label="테스트 명령 입력"/><button className="btn" type="submit" disabled={!action.trim()}><Send size={15}/> 전송</button></form>}
    </>}
  </section>
  {session.mode === 'combat' && session.combat?.result && <div className="battleResultBackdrop" role="dialog" aria-modal="true" aria-labelledby="battle-result-title"><div className={`battleResultModal ${session.combat.result}`}>
    <span className="battleResultIcon"><Swords size={28}/></span>
    <h2 id="battle-result-title">{session.combat.result === 'win' ? '승리!' : session.combat.lethal ? '사망' : '패배'}</h2>
    <p>{Math.max(0, session.combat.round - 1)}합 만에 {session.combat.npc}{session.combat.result === 'win' ? '을(를) 쓰러뜨렸습니다.' : '에게 쓰러졌습니다.'}</p>
    <div className="battleResultStats"><span>입힌 피해 <b>{session.combat.totalDealt || 0}</b></span><span>받은 피해 <b>{session.combat.totalTaken || 0}</b></span><span>남은 HP <b>{session.hp}/{maxHpOf(game, session)}</b></span></div>
    <button type="button" className="btn primary" disabled={busy} autoFocus onClick={() => void finishBattle()}>확인</button>
  </div></div>}
  {levelBurst && <div key={levelBurst.key} className="repBurst levelBurst" role="status" onClick={() => setLevelBurst(null)}>
    <Sparkles size={34}/>
    <strong>레벨 업!</strong>
    <b>Lv.{levelBurst.level}</b>
    <span>최대 HP {maxHpOf(game, session)} · 공격과 회피가 강해졌습니다</span>
  </div>}
  {awakenBurst && <div key={awakenBurst.key} className="repBurst awakenBurst" role="status" onClick={() => setAwakenBurst(null)}>
    <Zap size={34}/>
    <strong>신의 가호 — 각성!</strong>
    <b>Lv.{awakenBurst.level}</b>
    <span>쓰러진 자리에서 다시 일어섰습니다. 전투가 이어집니다.</span>
  </div>}
  {itemBurst && <div key={itemBurst.key} className={`repBurst itemBurst grade${itemBurst.info.grade}`} role="status" onClick={() => setItemBurst(null)}>
    <Sparkles size={34}/>
    <strong>{GRADE_LABELS[itemBurst.info.grade]} 장비 획득!</strong>
    <b>{itemBurst.name}</b>
    <span>{[KIND_LABELS[itemBurst.info.kind], bonusText(itemBurst.info, itemBurst.name)].filter(Boolean).join(' · ')}</span>
    {itemBurst.info.skill && <span className="itemBurstSkill">{skillText(itemBurst.info)}</span>}
  </div>}
  {repBurst && <div key={repBurst.key} className={`repBurst${repBurst.delta < 0 ? ' infamy' : ''}`} role="status" onClick={() => setRepBurst(null)}>
    <Award size={34}/>
    <strong>{repBurst.delta > 0 ? '명성 대폭 상승!' : '명성 급락!'}</strong>
    <b>{formatReputation(repBurst.delta)}</b>
    <span>{repBurst.total.toLocaleString('ko-KR')} · {reputationRank(repBurst.total)}</span>
  </div>}
  {diceRoll && session.pendingCheck && (() => { const r = diceRoll.result, need = Math.max(2, Math.min(20, r.dc - r.modifier)); return <div className="battleResultBackdrop" role="dialog" aria-modal="true" aria-labelledby="dice-roll-title"><div className={`battleResultModal diceRollModal${diceRoll.done ? (r.success ? ' win' : ' lose') : ''}`}>
    <h2 id="dice-roll-title"><Dices size={20}/> {r.label} 판정</h2>
    <div className="diceNeed"><span>목표 DC <b>{r.dc}</b></span><span>주사위 <b>{need}</b> 이상 필요</span></div>
    <div className={`diceFace${diceRoll.done ? ' landed' : ' rolling'}${diceRoll.done && r.critical ? ' crit' : ''}`} aria-live="polite">{diceRoll.face}</div>
    <ul className="diceMods">
      <li><span>D20</span><b>{diceRoll.done ? r.die : '?'}</b></li>
      <li><span>{diceRoll.statName} {diceRoll.score} 보정</span><b>{r.modifier >= 0 ? '+' : '−'}{Math.abs(r.modifier)}</b></li>
      <li className="diceTotal"><span>합계</span><b>{diceRoll.done ? r.total : '?'} <small>/ DC {r.dc}</small></b></li>
    </ul>
    <small className="diceRule">1은 항상 실패, 20은 항상 성공입니다.</small>
    {diceRoll.done && <div className="diceVerdict"><strong>{r.critical || (r.success ? '성공!' : '실패')}</strong>{(r.success ? r.onSuccess : r.onFailure) && <span>{r.success ? r.onSuccess : r.onFailure}</span>}</div>}
    <button type="button" className="btn primary" disabled={!diceRoll.done || busy} autoFocus onClick={() => void confirmRoll()}>{diceRoll.done ? '확인' : '굴리는 중…'}</button>
  </div></div>; })()}
  {offerItem && offerSlot && !questClear && !partyResult && session.mode !== 'combat' && <div className="battleResultBackdrop" role="dialog" aria-modal="true" aria-labelledby="equip-offer-title"><div className="battleResultModal equipOffer">
    <h2 id="equip-offer-title">장비를 바꾸시겠습니까?</h2>
    <p>{offerWorn ? <><b>{offerWorn}</b>에서 <b>{offerItem}</b>(으)로 바꾸시겠습니까?</> : <><b>{offerItem}</b>을(를) 장착하시겠습니까?</>}</p>
    <div className="equipOfferCards">
      {offerWorn && <div><small>지금 장착 중</small><ItemCard name={offerWorn} session={session} on={true} maxHp={maxHpOf(game, session)} onClose={() => answerOffer(false)}/></div>}
      <div><small>새로 얻은 {KIND_LABELS[offerSlot]}</small><ItemCard name={offerItem} session={session} on={false} maxHp={maxHpOf(game, session)} onClose={() => answerOffer(false)}/></div>
    </div>
    <div className="equipOfferButtons"><button type="button" className="btn primary" autoFocus onClick={() => answerOffer(true)}>네</button><button type="button" className="btn" onClick={() => answerOffer(false)}>아니오</button></div>
  </div></div>}
  {questClear && <div key={questClear.key} className="battleResultBackdrop" role="dialog" aria-modal="true" aria-labelledby="quest-clear-title" onClick={() => setQuestClear(null)}><div className="battleResultModal questClear" onClick={e => e.stopPropagation()}>
    <span className="battleResultIcon"><Trophy size={30}/></span>
    <h2 id="quest-clear-title">퀘스트 클리어!</h2>
    <ul className="questClearList">{questClear.quests.map(q => <li key={q.name} className={q.main ? 'main' : ''}><Check size={14}/><span>{q.main && <em className="questMainTag">메인</em>}{q.name}{q.giver && <small>의뢰인 {q.giver}</small>}</span></li>)}</ul>
    <div className="questClearRewards"><strong>보상</strong>
      <span><Sparkles size={13}/> 경험치 <b>+{questClear.xp.toLocaleString('ko-KR')}</b></span>
      {questClear.reputation !== 0 && <span><Award size={13}/> 명성 <b>{formatReputation(questClear.reputation)}</b><small>{questClear.total.toLocaleString('ko-KR')} · {reputationRank(questClear.total)}</small></span>}
      {questClear.quests.filter(q => q.giver).map(q => <span key={'aff-' + q.name}><Users size={13}/> {q.giver} 호감도 <b>+{QUEST_AFFECTION}</b></span>)}
      {questClear.items.length > 0 && <span><Package size={13}/> 획득 {questClear.items.map(n => { const it = infoOf(n, session.itemInfo); return <b key={n} className={`itemName grade${it.grade}`} title={itemTitle(n, it)}>{it.grade > 0 ? `[${GRADE_LABELS[it.grade]}] ` : ''}{n}</b>; })}</span>}
      {questClear.levelTo > questClear.levelFrom && <span className="questClearLevel"><Zap size={13}/> 레벨 업 <b>Lv.{questClear.levelFrom} → Lv.{questClear.levelTo}</b></span>}
    </div>
    {questClear.next && <div className="questClearNext"><strong>다음 메인 퀘스트</strong><span>{questClear.next}</span></div>}
    <button type="button" className="btn primary" autoFocus onClick={() => setQuestClear(null)}>확인</button>
  </div></div>}
  {partyResult && (() => { const face = npcImage(game, partyResult.npc); return <div className="battleResultBackdrop" role="dialog" aria-modal="true" aria-labelledby="party-result-title" onClick={() => { if (!partyResult.thinking) setPartyResult(null); }}><div className={`battleResultModal partyResult ${partyResult.thinking ? 'thinking' : partyResult.accepted ? 'accepted' : 'declined'}`} onClick={e => e.stopPropagation()}>
    <span key={partyResult.thinking ? 'wait' : 'done'} className="partyResultFace">{face ? <img src={face} alt={partyResult.npc} draggable={false}/> : <Users size={30}/>}</span>
    {partyResult.thinking ? <>
      <h2 id="party-result-title" className="partyThinkingTitle">고민 중<span className="partyDots" aria-hidden="true"><i/><i/><i/></span></h2>
      <p>{partyResult.npc}이(가) 당신의 제안을 곰곰이 생각하고 있습니다…</p>
      <div className="partyChance"><span>합류 확률 <b>{Math.round(partyResult.chance * 100)}%</b></span><div className="partyChanceTrack"><i style={{width:`${Math.round(partyResult.chance * 100)}%`}}/></div></div>
    </> : <>
      <h2 id="party-result-title" className="partyVerdict">{partyResult.accepted ? '합류!' : '거절'}</h2>
      <p>{partyResult.accepted ? `${partyResult.npc}이(가) 파티에 합류했습니다. 이제 전투에서 함께 싸웁니다.` : `${partyResult.npc}이(가) 파티 권유를 거절했습니다.`}</p>
      <button type="button" className="btn primary" autoFocus onClick={() => setPartyResult(null)}>확인</button>
    </>}
  </div></div>; })()}
  <section className="playChatPanel playLogPanel">
    <div className="panelHeading"><h2><ScrollText size={18} /> 진행 기록</h2><span className="softPill">GM</span></div>
    <div className="chatLog storyLog" ref={chatRef}>{(() => { const items = groupLog(session.log); const lastTalk = items.map(x => x.kind).lastIndexOf('talk'); const lastBattle = items.map(x => x.kind).lastIndexOf('battle'); const start = Math.max(0, items.length - logShown); return <>{start > 0 && <button type="button" className="btn storyMore" onClick={() => setLogShown(n => n + LOG_PAGE)}>이전 기록 {Math.min(start, LOG_PAGE)}개 더 보기 · 남은 {start}개</button>}{items.slice(start).map((item, k) => { const i = k + start; if (item.kind === 'battle') { const name = item.lines[0]?.match(/^(.+?)의 체력/)?.[1] || '상대'; const outcome = item.lines[item.lines.length - 1]?.match(/^(승리|패배)/)?.[1]; const rows = <ul className="battleLines">{item.lines.map((l, j) => <li key={j} className={/^승리/.test(l) ? 'win' : /^패배/.test(l) ? 'lose' : /내 공격 명중/.test(l) ? 'dealt' : /반격 명중/.test(l) ? 'taken' : /전투 시작$/.test(l) ? 'start' : 'miss'}>{l}</li>)}</ul>; return session.mode === 'combat' && i === lastBattle ? <div key={i} className="battleRecord battleLive"><div className="battleRecordTitle"><Swords size={14}/> {name}와(과) 전투 중</div>{rows}</div> : <details key={i} className="talkRecord battleRecord"><summary><Swords size={14}/> {name}와(과)의 전투{outcome ? ` · ${outcome}` : ''}</summary>{rows}</details>; } if (item.kind === 'talk') { const name = item.lines.find(t => t.speaker === 'npc')?.name || ''; return session.mode === 'talk' && i === lastTalk ? <div key={i} className="talkRecord talkLive"><MessageCircle size={14}/> {name ? `${name}와(과) 대화 중` : '대화 중'} · 가운데 창에서 이어집니다</div> : <details key={i} className="talkRecord" open={i === lastTalk}><summary><MessageCircle size={14}/> {name ? `${name}와(과)의 대화` : '대화'} · {item.lines.filter(t => t.speaker !== 'scene').length}마디</summary><div className="talkThread talkThreadLog">{item.lines.map((t, j) => <TalkBubble key={j} t={t} image={t.speaker === 'npc' ? npcImage(game, t.name) : undefined}/>)}<div className="talkEndedLine"><span>대화가 종료되었습니다</span></div></div></details>; } const entry = item.entry; const player = entry.startsWith('플레이어:'); const system = entry.startsWith('시스템:') || entry.startsWith('주사위:'); const event = entry.startsWith('이벤트:'); const prologue = entry.startsWith('프롤로그:'); const content = storyText(entry.replace(/^(GM:|플레이어:|시스템:|주사위:|이벤트:|프롤로그:)\s*/, '')); return <div key={i} className={`storyEntry ${player ? 'storyPlayer' : system ? 'storySystem' : event ? 'storyEvent' : 'storyGM'}`}>{player && <span className="storyEntryLabel">나의 행동</span>}{event && <span className="storyEntryLabel">장소 이벤트</span>}{prologue && <span className="storyEntryLabel">프롤로그 · {prologueTitle(game)}</span>}{system && <span className="storyEntryLabel">{entry.startsWith('주사위:') ? '판정' : '게임 기록'}</span>}<div className="storyEntryText">{player || system ? content : <StoryProse text={content}/>}</div></div>; })}</>; })()}{busy && <div className="storyEntry storyGM storyLoading">이야기가 이어지고 있습니다...</div>}</div>
  </section>
  </div>; })()}</main>}
    {notice && <div className="toast"><Check size={16} /> {notice}</div>}
  </div>;
}
