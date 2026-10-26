'use client';


import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronRight, Dices, Download, FolderOpen, Image as ImageIcon, Plus, Play, RotateCcw, Send, Settings2, Sparkles, Trash2, Upload } from 'lucide-react';

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
type MapPin = { id: string; name: string; x: number; y: number; kind: "start" | "place" | "building" | "event" | "exit"; description?: string; eventText?: string; eventTrigger?: "enter" | "interact"; eventOnce?: boolean; requiredItem?: string; requiredFlag?: string; bidirectional?: boolean; targetMapId?: string; targetPinId?: string };
type MapLink = { id: string; from: string; to: string };
type BoardMap = { id: string; name: string; image: string; baseImage?: string; pins: MapPin[]; links?: MapLink[] };
// Built-in maps are served as static files from public/_default_maps via /api/default-map.
// Keep their URLs in project state instead of embedding megabytes of base64 in IndexedDB.
const DEFAULT_MAP_NAMES: Record<string,string[]> = {
  wuxia: ['중원 전체 맵','낙양','구파일대 본산','사천·서역'],
  fantasy: ['판타지 세계 지도','레븐홀트','사레타','아스테라'],
  modern: ['신해시 전체 맵','신해시 중앙구','신해 구도심','신해 항만 산업단지']
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
    [["천마신교",19.1398781920205,4.582530762237253],["곤륜파",13.181109713957282,17.739904701643024],["공동파",25,27],["점창파",16.018618966622014,72.06710636568118],["사천당가",23.67989204375135,60.8196747237942],["청성파",30.0642854809152,51.69440752265163],["아미파",16.586123674753132,48.298952966187365],["용문석굴",42,72],["폐사찰",59.29061840043657,71.85489847033357],["낙양",53.47372967140384,42.56913319757005],["진하 표국",66.24251654573152,51.90662966587729],["하오문",72.05940527476426,42.78134821685669],["소림사",59.00686842770282,26.016311825639026],["화산파",44.25183174423887,25.591881787065745],["종남파",38.43493348987891,34.92937113143397],["하북팽가",54.18310936590183,7.553548156189229],["북망산 고분",76.31567391642497,4.794745781523893],["제갈세가",81.28131272725645,24.53080669063255],["남궁세가",81,42],["장강수로채",83,65]],
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
function presetMaps(genre:string): BoardMap[] {
  const names=DEFAULT_MAP_NAMES[genre] || DEFAULT_MAP_NAMES.fantasy;
  const sets=DEFAULT_MAP_PLACES[genre] || DEFAULT_MAP_PLACES.fantasy;
  return names.map((name,index)=>({
    id:`default-${genre}-${index}`, name, image:`/api/default-map/${genre}/${index}`,
    pins:sets[index].map(([label,x,y],n)=>({id:`default-${genre}-${index}-pin-${n}`,name:label,x,y,kind:'place' as const,description:`${name}의 ${label}. 제작자가 장소 설명과 이벤트를 편집할 수 있습니다.`})),links:[]
  }));
}
const DEFAULT_PLAYER_MARKERS: Record<string,string> = {wuxia:'/api/default-player-marker/wuxia',modern:'/api/default-player-marker/modern',fantasy:'/api/default-player-marker/fantasy'};
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
const promptSections = [
 {id:'foundation',name:'세계관과 기본 규칙',promptTitle:'세계관과 기본 규칙',required:true,guide:'GM 역할과 주인공 자율성, 서술 형식, 역사/세력/지역, 시작 신분·장소·첫 임무를 정한다. 고유명사와 핵심 갈등을 확정. 게임 엔진의 choices·플래그를 실제 사용 가능한 형태로 정의.'},
 {id:'system',name:'게임 시스템',promptTitle:'게임 시스템',required:true,guide:'시간/이동/기록 플래그, NPC 독립 행동, 장르별 D20 판정·난이도·전투 라운드·피해·회복·패배·성장·경제·초기 장비. 다른 단계의 세계관 설명을 반복하지 않는다.'},
 {id:'npc',name:'주요 NPC와 관계',promptTitle:'주요 NPC와 관계',required:true,guide:'세계관에 연결된 NPC 최소 10명. 각 인물 이름, 성별(남성/여성), 나이, 소속, 외형, 성격, 목표, 비밀/갈등. 이미지 생성용 외형 정보와 인물별 사건 연결 고리. 관계 변화 원칙을 간결하게.'},
 {id:'story',name:'메인 사건과 의뢰·기연',promptTitle:'메인 사건과 의뢰·기연',required:true,guide:'기존 NPC와 장소를 사용한 3~5막 메인 사건(발동 조건·징조·분기·실패 결과), 독립 의뢰, 인연 사건, 반복되지 않는 돌발 사건과 단계형 기연(단서→조사→시험→보상·대가). 동일 사건을 여러 번 설명하지 않는다.'},
 {id:'goal',name:'최종 목표와 결말',promptTitle:'게임의 최종 목표',required:true,guide:'앞에서 확정한 메인 사건과 인물에 직접 연결되는 최종 목표, 측정 가능한 달성 조건, 실패·부분 성공, 복수 결말, 엔딩 후 지속 여부. NPC나 사건을 다시 나열하지 않는다.'}
] as const;
const draftText = (d?:PromptDraft) => !d ? '' : d.selected === 3 ? d.custom : (d.options[d.selected] || '');
const buildDraftPrompt = (drafts:PromptDrafts, extras:CustomPromptSection[] = [], removed:string[] = []) => [...promptSections.filter(x=>!removed.includes(x.id)),...extras].filter(x=>x.required || drafts[x.id]?.enabled !== false).map(x=>{const t=draftText(drafts[x.id]).trim();return t?`# [${'promptTitle' in x ? x.promptTitle : x.name}]\n\n${t}`:'';}).filter(Boolean).join('\n\n');
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

최근 항구에서는 이상한 이야기가 돌고 있다. 먼바다에서 침몰한 배와 그 안에 실려 있었다는 정체불명의 석관. 누군가는 저주받은 유물이라 말하고, 누군가는 왕국의 역사를 뒤바꿀 물건이라 속삭인다. 상인들은 입을 다물고, 선원들은 밤바다로 나가는 일을 꺼린다.

오늘도 모험가 길드 사레타 지부의 게시판에는 새 의뢰서가 붙었다. 파도 소리 너머로 종이 울리고, 항구에서는 또 한 척의 배가 출항을 준비한다. 무엇을 믿고 어디서부터 조사할지는 아직 정해지지 않았다.`},
 modern:{title:'신해시 구도심, 균열의 밤',text:`해가 저문 신해시 구도심. 낡은 상가와 오래된 주택 사이로 가로등이 켜지고, 골목에는 저녁 장사를 마치는 사람들의 발소리가 이어진다. 언덕 아래로는 익숙한 간판과 전깃줄이 얽혀 있고, 강 건너 중앙구의 초고층 빌딩들은 눈부신 빛을 뿜어낸다.

게이트와 각성자가 존재하는 세상에서도 이 동네의 일상은 크게 달라지지 않은 듯 보인다. 그러나 최근 구도심 일대에서 작은 마력 이상 현상이 잇따라 보고되고 있다. 폐건물 주변의 푸른 잔광, 갑자기 끊기는 통신, 그리고 정체를 알 수 없는 야간 출입자들. 관리국은 공식 발표를 미루고 있다.

그때 골목 끝에서 짧은 경보음이 울린다. 폐쇄된 건물 담장 너머로 희미한 푸른빛이 번졌다 사라진다. 평범한 저녁이 끝나고, 신해시 구도심의 새로운 사건이 시작되려 하고 있다.`}
};
const defaultPrologueImage=(g:Game)=>`/api/default-prologue/${defaultMapGenre(g)}`;
const prologueText=(g:Game)=>g.prologue===undefined?DEFAULT_PROLOGUES[defaultMapGenre(g)].text:g.prologue;
const prologueTitle=(g:Game)=>g.prologueTitle===undefined?DEFAULT_PROLOGUES[defaultMapGenre(g)].title:g.prologueTitle;
const prologueImage=(g:Game)=>g.prologueImage===undefined?defaultPrologueImage(g):g.prologueImage;
type Game = { npcPortraits?:NpcPortrait[]; npcStyle?:string; finalGoalMode?: 'single' | 'progress'; finalGoalSteps?: string[]; prologue?: string; prologueTitle?:string; prologueImage?:string; profileDone?: boolean; promptDone?: boolean; mapDone?: boolean; assetsDone?: boolean; settingsDone?: boolean; wizardType?: string; wizardWorld?: string; wizardStage?: number; playerMarker?: string; customPromptSections?: CustomPromptSection[]; removedPromptSections?: string[]; promptDrafts?: PromptDrafts; compressedPrompt?: string; characterConfig?: CharacterConfig; showHpBar?: boolean; showEquipment?: boolean; showDice?: boolean; startingEquipment?: string; maps?: BoardMap[]; startMapId?: string; startPinId?: string; registrationDescription?: string; genre?: string; gameType?: string; cooperation?: string; progression?: string; playTime?: string; hashtags?: string[]; audience?: string; playMode?: 'single' | 'multi'; minPlayers?: number; maxPlayers?: number; imageRows?: ImageRow[]; imageColumns?: ImageColumn[]; imageCells?: ImageCell[]; prompt?: string; mapImage?: string; assets?: Asset[]; id: string; name: string; description: string; world: string; rules: string; gm: string; hp: number; size: number; created: number; cover?: string };
type DiceCheck = { ability: string; label: string; dc: number; reason: string; action: string };
type DiceResult = { ability: string; label: string; dc: number; die: number; modifier: number; total: number; success: boolean; critical: string };
type Session = { completedGoalSteps?: number[]; currentGoal?: string; goalCompleted?: boolean; relationships?: Relationship[]; suggestedActions?: string[]; pendingCheck?: DiceCheck | null; lastCheck?: DiceResult | null; characterValues?: Record<string,string>; characterEquipment?: Record<string,string>; characterGold?: number; mapId?: string; pinId?: string; gameId: string; x: number; y: number; hp: number; roll: number | null; log: string[]; inventory?: string[]; flags?: string[]; triggeredEvents?: string[]; activeImageKey?: string; travel?: {mapId:string; destinationId:string; remaining:number; total:number} };
type View = 'library' | 'edit' | 'play';
type Tab = 'profile' | 'prompt' | 'map' | 'assets' | 'settings' | 'register';
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

const getStartingLocation = (g: Game) => {
  const maps = g.maps || [];
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
// 장르별 프롤로그의 첫 행동은 맵 탐색보다 사건과 인물에 직접 연결합니다.
const openingActions = (g: Game): string[] => {
  const genre = defaultMapGenre(g);
  if (genre === 'wuxia') return [
    '종소리가 들려온 거리로 향해 도움을 청한 사람에게 무슨 일이 일어났는지 묻는다.',
    '열병에 관한 소문을 듣기 위해 가까운 의원이나 약재상을 찾아 환자들의 상태를 확인한다.',
    '관아가 소문을 막는 이유가 수상하다. 성문 주변의 포졸과 짐수레를 지켜보며 감춰진 움직임을 찾아본다.'
  ];
  if (genre === 'fantasy') return [
    '모험가 길드 사레타 지부로 가서 침몰선과 관련된 의뢰서를 확인하고 접수 담당자에게 묻는다.',
    '출항을 준비하는 선원에게 다가가 침몰선의 마지막 항해와 위험한 해역에 관해 물어본다.',
    '석관 이야기를 꺼리는 상인들의 반응이 이상하다. 항구에서 화물 장부와 선박 출입 기록을 조사할 방법을 찾는다.'
  ];
  if (genre === 'modern') return [
    '골목 끝 경보음이 들린 곳으로 조심스럽게 다가가 주변 사람들의 안전과 현장 상황을 확인한다.',
    '관리국 신고 번호로 마력 이상 현상을 알리고 최근 구도심 신고 내역을 문의한다.',
    '폐쇄 건물 담장에 번진 푸른빛이 사라진 시각과 주변 CCTV 위치를 기록해 누군가 일부러 숨기는지 확인한다.'
  ];
  return defaultActions(g, getStartingLocation(g).mapId, getStartingLocation(g).pinId);
};
// AI 응답 이전에도 선택지가 비어 있지 않도록 현재 맵에서 시작 행동을 구성합니다.
const defaultActions = (g: Game, mapId?: string, pinId?: string): string[] => {
  const map = (g.maps || []).find(m => m.id === mapId) || (g.maps || [])[0];
  const current = map?.pins.find(p => p.id === pinId);
  const destinations = nearbyPins(map, current?.id);
  const options = [
    current ? `${current.name} 주변을 살펴본다.` : '주변을 살펴본다.',
    ...destinations.slice(0, 2).map(p => `${p.name}(으)로 이동한다.`),
    '주변 사람에게 이 지역에 대해 물어본다.',
    '현재 장소에서 할 수 있는 일을 알아본다.'
  ];
  return [...new Set(options)].slice(0, 2).concat('평범하지 않은 방법으로 주변의 단서를 찾아본다.');
};
const makeSession = (g: Game): Session => ({
  ...getStartingLocation(g), gameId: g.id,
  x: Math.floor(g.size / 2), y: Math.floor(g.size / 2), hp: g.hp,
  inventory: combinedStartingItems(g.prompt || '', g.startingEquipment || ''),
  characterValues: Object.fromEntries((g.characterConfig || defaultCharacterConfig()).fields.map(f=>[f.id,f.initial])), characterEquipment: {}, characterGold: (g.characterConfig || defaultCharacterConfig()).initialGold,
  flags: [], triggeredEvents: [], completedGoalSteps:[],currentGoal: '', goalCompleted:false, relationships: [], suggestedActions: prologueText(g).trim() ? openingActions(g) : defaultActions(g, getStartingLocation(g).mapId, getStartingLocation(g).pinId), activeImageKey: undefined, roll: null, pendingCheck: null, lastCheck: null,
  log: [prologueText(g).trim() ? `프롤로그: ${prologueText(g).trim()}` : 'GM: 모험의 첫 장이 열린다. 주변 풍경을 살피며 어디로 향할지 정할 수 있다.']
});

function PrologueOpening({game}:{game:Game}) {const image=prologueImage(game);return <div className="prologueOpening">{image&&<img className="prologueHero" src={image} alt={prologueTitle(game)}/>}<div className="prologueOpeningBody"><span className="prologueEyebrow">PROLOGUE</span><h3>{prologueTitle(game)}</h3><PrologueRichText text={prologueText(game)} game={game}/></div></div>;}

/** Shared renderer for prologue preview and the actual play log. */
function PrologueRichText({text,game}:{text:string;game:Game}) {
  const tokens = text.split(/(\{\{\s*img\s*::[^{}\n]+::[^{}\n]+\}\})/g);
  const inlineTagged=new Set([...text.matchAll(/\{\{\s*img\s*::([^:{}]+)::/g)].map(x=>x[1].trim()));
  const present=(game.npcPortraits||[]).filter(n=>n.image&&!inlineTagged.has(n.name)&&new RegExp(`(^|[^가-힣])${n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=[^가-힣]|$)`).test(text));
  return <div className="prologueRichText">{present.slice(0,2).map(n=><figure key={n.id} className="prologueInlineImage"><img src={n.image} alt={n.name} loading="lazy"/></figure>)}{tokens.map((token,index)=>{
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

const tabs: { id: Tab; label: string }[] = [{ id: 'profile', label: '프로필' }, { id: 'prompt', label: '게임 프롬프트' }, { id: 'map', label: '맵 관리' }, { id: 'assets', label: 'NPC 이미지' }, { id: 'settings', label: '게임 설정' }, { id: 'register', label: '등록' }];

function CharacterPanel({game,session,portrait}:{game:Game;session:Session;portrait?:string}) {
 const c=game.characterConfig || defaultCharacterConfig();
 const hasStartingItems = combinedStartingItems(game.prompt || '', game.startingEquipment || '').length > 0;
 const tabs=([['stats','능력치'],['inventory','인벤토리'],['status','상태'],['relationships','관계도']] as const).filter(([key])=>key==='relationships' ? c.sections.relationships !== false : (c.sections[key] || (key==='inventory' && (hasStartingItems || c.sections.equipment))));
 const [active,setActive]=useState<string>('stats');
 const selected=tabs.some(([key])=>key===active)?active:tabs[0]?.[0];
 if(!c.sections.character && tabs.length===0)return null;
 return <div className="characterPanel"><div className="characterPanelHeading"><strong>플레이어 정보</strong><span>게임별 설정</span></div>
 <div className="characterGoal characterGoalFinal"><strong>최종 목표</strong><span>{getGameGoal(game) || '아직 최종 목표의 전모가 밝혀지지 않았습니다. 사건을 조사하고 주요 인물과 대화하여 단서를 찾아보세요.'}</span>{game.finalGoalMode==='progress'&&<div className="goalMilestoneProgress"><div className="goalMilestoneCount">진행도 {(session.completedGoalSteps||[]).filter(n=>n<(game.finalGoalSteps||[]).filter(Boolean).length).length} / {(game.finalGoalSteps||[]).filter(Boolean).length}</div><div className="goalMilestoneTrack"><i style={{width:`${(game.finalGoalSteps||[]).filter(Boolean).length?Math.min(100,(session.completedGoalSteps||[]).filter(n=>n<(game.finalGoalSteps||[]).filter(Boolean).length).length/(game.finalGoalSteps||[]).filter(Boolean).length*100):0}%`}}/></div>{(game.finalGoalSteps||[]).filter(Boolean).map((step,i)=><div className="goalMilestoneItem" key={i}><span>{(session.completedGoalSteps||[]).includes(i)?'✓':'○'}</span><span>{displayGoal(step)}</span></div>)}</div>}</div>
 
 <div className="characterGoal characterGoalCurrent"><strong>현재 목표</strong><span>{session.currentGoal?.trim() || "현재 목표: 없음"}</span></div>

 {session.goalCompleted && <div className="characterGoal"><strong>게임 완료</strong> <span>최종 목표를 달성했습니다. 엔딩이 확정되었습니다.</span></div>}
 {c.sections.character&&<div className="characterSummary">{portrait&&<img className="characterPortrait" src={portrait} alt="플레이어 캐릭터"/>}<div className="characterIdentity"><strong>{c.initialName || '모험가'}</strong><small>{[c.initialRace,c.initialJob].filter(Boolean).join(' · ')}</small>{game.showHpBar !== false && <div className="characterVitals"><span>HP {session.hp}/{game.hp}</span><div className="characterVitalTrack"><i style={{width:`${Math.max(0,Math.min(100,session.hp/Math.max(1,game.hp)*100))}%`}}/></div></div>}{c.initialGold > 0 && <small>소지금 {session.characterGold ?? c.initialGold} G</small>}</div></div>}
 {tabs.length>0&&<><div className="characterTabs">{tabs.map(([key,label])=><button key={key} type="button" className={selected===key?'active':''} onClick={()=>setActive(key)}>{label}</button>)}</div><div className="characterTabBody">
 {selected==='stats'&&<div className="characterStatGrid">{c.fields.filter(f=>f.visible).map(f=>{const value=session.characterValues?.[f.id] ?? f.initial;return <div className="characterStat" key={f.id}><small>{statDisplayName(f)}</small><strong>{statDisplayValue(f,String(value))}{f.kind==='gauge'?` / ${f.max || 100}`:''}</strong>{f.kind==='gauge'&&<div className="characterStatTrack"><i style={{width:`${Math.max(0,Math.min(100,Number(value)/Math.max(1,f.max || 100)*100))}%`}}/></div>}</div>;})}{c.fields.every(f=>!f.visible)&&<p>표시할 능력치가 없습니다.</p>}</div>}
 {selected==='inventory'&&<div className="characterItems">{(session.inventory || []).length?(session.inventory || []).map((item,i)=><span key={`${item}-${i}`}>{item}</span>):<p>인벤토리가 비어 있습니다.</p>}</div>}
 {selected==='status'&&<p className="characterEmptyStatus">적용된 상태 효과가 없습니다.</p>}
 {selected==='relationships'&&<div className="relationshipList">{(session.relationships||[]).length ? (session.relationships||[]).map(person=>{const image=(()=>{const portrait=(game.npcPortraits||[]).find(n=>n.name.trim()===person.name.trim());if(portrait?.image)return portrait.image;const row=(game.imageRows||[]).find(r=>r.name.trim()===person.name.trim());const col=(game.imageColumns||[]).find(x=>x.name.trim()==='기본');return (game.imageCells||[]).find(cell=>cell.rowId===row?.id&&cell.columnId===col?.id)?.image;})();return <div key={person.id} className="relationshipPerson">{image && <div className="relationshipPhoto"><img src={image} alt={`${person.name} 인물 사진`}/></div>}<div className="relationshipDetails"><strong>{person.name}</strong><small>관계 · {person.relation}</small><span>호감도 <b>{person.affection}</b> / 100</span><div className="relationshipGauge"><i style={{width:`${Math.max(0,Math.min(100,person.affection))}%`}}/></div></div></div>;}) : <p className="characterEmptyStatus">아직 만난 인물이 없습니다. 게임을 진행하며 NPC를 만나면 자동으로 등록됩니다.</p>}</div>}

 </div></>}
 </div>;
}
const wizardTypes = [
 ['rpg','RPG · 모험','탐험, 전투, 성장, 이야기'],
 ['survival','생존 · 아포칼립스','탐색, 자원 관리, 위험 극복'],
 ['mystery','추리 · 미스터리','사건 조사, 단서, 추론'],
 ['strategy','전략 · 정치','세력, 외교, 전쟁, 권력'],
 ['management','경영 · 운영','생산, 거래, 조직 운영'],
 ['romance','연애 · 일상','대화, 인간관계, 일정'],
 ['custom','자유 제작','나만의 게임 규칙과 경험']
] as const;
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
 const stage=game.wizardStage||0;
 const [loadingId,setLoadingId]=useState('');
 const [ruleStep,setRuleStep]=useState(0);
 const [staleAfter,setStaleAfter]=useState(-1);
 const requestedStep=useRef('');
 const autoRequestedFor=useRef<string>('');
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
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
  const nextExtras:CustomPromptSection[]=bulkSections.filter(item=>!requiredNames.includes(item.title)).map(item=>({id:'custom-'+makeId(),name:item.title,guide:''}));
  bulkSections.filter(item=>!requiredNames.includes(item.title)).forEach((item,i)=>{
   nextDrafts[nextExtras[i].id]={options:[],selected:3,custom:item.content,enabled:true};
  });
  update({promptDrafts:nextDrafts,customPromptSections:nextExtras,removedPromptSections:[],prompt:buildDraftPrompt(nextDrafts,nextExtras,[]),compressedPrompt:undefined,wizardStage:3});
  setBulkOpen(false);setBulkText('');setBulkError('');
 };

 const setStage=(n:number)=>{if(n<2 && stage>=2)return;update({wizardStage:n});};
 const setDraft=(id:string,patch:Partial<PromptDraft>)=>{
  const index=promptSections.filter(x=>x.required).findIndex(x=>x.id===id);
  if(index>=0 && index<ruleStep)setStaleAfter(index);
  const base=drafts[id]||{options:[],selected:-1,custom:'',enabled:true};
  const next={...drafts,[id]:{...base,...patch}};
  update({promptDrafts:next,prompt:buildDraftPrompt(next,extras,removed),compressedPrompt:undefined});
 };
 const generate=async(section:{id:string;name:string;guide:string})=>{
  if(busy)return;
  setLoadingId(section.id);setBusy(true);setError('');
  try{
   const r=await fetch('/api/prompt/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sectionId:section.id,remainingChars:Math.max(0,PROMPT_LIMIT-(game.compressedPrompt||'').length),usedChars:buildDraftPrompt(drafts,extras,removed).length,sectionName:'promptTitle' in section ? section.promptTitle : section.name,guide:section.guide,finalGoalMode:game.finalGoalMode||'single',gameName:game.name,gameDescription:game.description,genre:`${game.wizardType||''} / ${game.wizardWorld||''}`,integratedPrompt:game.compressedPrompt||'',otherSections:sections.filter(x=>x.id!==section.id).map(x=>({name:'promptTitle' in x ? x.promptTitle : x.name,text:draftText(drafts[x.id])})).filter(x=>x.text).slice(0,15),previous:drafts[section.id]?.options||[]})});
   const data=await r.json().catch(()=>({error:'서버 응답을 읽을 수 없습니다.'}));if(!r.ok)throw Error(data.error||`AI 생성 실패 (HTTP ${r.status})`);
   if(!Array.isArray(data.options)||data.options.length!==3)throw Error('초안 3개를 받지 못했습니다.');
   setDraft(section.id,{options:data.options,selected:draftText(drafts[section.id]).trim()?3:-1,custom:draftText(drafts[section.id])});
  }catch(e){setError(e instanceof Error?e.message:'AI 생성에 실패했습니다.');}finally{setBusy(false);setLoadingId('');}
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
 const integrateStep=async()=>{
  if(busy||compressing)return;
  const section=promptSections[ruleStep];
  if(!draftText(drafts[section.id]).trim()){setError('현재 주제를 먼저 선택해 주세요.');return;}
  setError('');
  if(ruleStep<promptSections.length-1){setRuleStep(v=>v+1);return;}
  await submitFinalChoices(drafts);
 };
 // Prewritten choices: no API calls are required while selecting five directions.
 const presetChoices:Record<string,{title:string;description:string}[]>={
  foundation:[{title:'세계와 세력의 갈등',description:'이름 있는 세력, 거점, 경제, 세력 간 이해관계와 첫 갈등을 구체적으로 정한다.'},{title:'인물 중심 모험',description:'플레이어의 출신과 첫 임무를 명확히 하고 동료와 라이벌을 만나며 세계를 알아간다.'},{title:'탐험과 비밀',description:'미지의 지역과 숨겨진 비밀을 발견하며 탐험 결과가 후속 사건에 영향을 준다.'}],
  system:[{title:'전투와 성장',description:'장르에 맞는 판정, 전투, 부상, 훈련과 단계별 성장을 구체적인 규칙으로 운영한다.'},{title:'선택과 결과',description:'선택의 대가, 시간 경과, 자원과 관계 변화를 엄격히 기록하고 사건을 일관되게 이어간다.'},{title:'균형 잡힌 CRPG',description:'전투, 탐험, 대화, 경제, 성장과 패배 가능성을 균형 있게 운영한다.'}],
  npc:[{title:'인연과 동료',description:'개별 목표와 성격을 가진 NPC의 신뢰, 우정, 경쟁과 인연 사건을 중심으로 설계한다.'},{title:'세력과 라이벌',description:'서로 충돌하는 세력과 라이벌을 만들고 NPC가 플레이어 없이도 독립적으로 행동한다.'},{title:'비밀과 배신',description:'겉모습과 속내가 다른 NPC, 숨겨진 정체, 누적된 단서와 관계의 반전을 설계한다.'}],
  story:[{title:'장기 메인 스토리',description:'3~5막 메인 사건을 발동 조건, 징조, 분기, 실패 결과까지 연결하고 의뢰와 돌발 사건을 배치한다.'},{title:'자유 탐험과 의뢰',description:'지역별 독립 의뢰, 기연, 발견, NPC 인연 사건을 중심으로 자유롭게 진행하되 사건의 결과를 유지한다.'},{title:'세력 갈등과 분기',description:'세력 경쟁과 음모를 중심으로 플레이어의 개입 여부에 따라 사건의 결과와 다음 막이 달라진다.'}],
  goal:[{title:'명확한 결말',description:'달성 조건이 명확한 최종 목표와 성공, 실패, 부분 성공의 복수 결말을 설계한다.'},{title:'끝없는 성장',description:'주요 목표를 달성한 후에도 성장, 새로운 사건, 관계와 탐험이 계속되는 장기 플레이를 설계한다.'},{title:'세계 변화와 선택',description:'세력과 세계의 운명이 플레이어의 누적된 선택에 따라 달라지고 복수의 결말로 이어진다.'}]
 };
 const presetFor=(id:string)=>presetChoices[id]||presetChoices.foundation;
 const activeRule=promptSections.filter(x=>x.required)[ruleStep];
 useEffect(()=>{
  if(stage!==2)return;
  const next={...drafts};let changed=false;
  for(const section of promptSections){
   const presets=presetFor(section.id);
   const previous=next[section.id];
   const options=presets.map(x=>x.description);
   if(previous?.options?.every((v,i)=>v===options[i])&&previous.options.length===3)continue;
   // Keep an existing selection only when it matches the fixed presets.
   const oldText=draftText(previous);
   const match=options.indexOf(oldText);
   next[section.id]={options,optionTitles:presets.map(x=>x.title),selected:previous?.selected===3?3:match,custom:previous?.custom||'',enabled:true};
   changed=true;
  }
  if(changed)update({promptDrafts:next,compressedPrompt:undefined});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[stage,game.id]);
 // Preset selection advances immediately; the custom fourth option still needs confirmation.
 const choosePreset=(sectionId:string,index:number)=>{
  if(busy||compressing)return;
  const sectionIndex=promptSections.findIndex(x=>x.id===sectionId);
  if(sectionIndex<0)return;
  setError('');
  setDraft(sectionId,{selected:index});
  if(sectionIndex<promptSections.length-1){setRuleStep(sectionIndex+1);return;}
  // The last choice must be persisted before build-final reads drafts.
  const nextDrafts={...drafts,[sectionId]:{...(drafts[sectionId]||{options:[],selected:-1,custom:'',enabled:true}),selected:index}};
  void submitFinalChoices(nextDrafts);
 };
 const submitFinalChoices=async(nextDrafts:typeof drafts)=>{
  if(busy||compressing)return;
  const chosen=promptSections.map(x=>({id:x.id,title:x.promptTitle,keyword:draftText(nextDrafts[x.id]).trim()}));
  if(chosen.some(x=>!x.keyword)){setError('5개 주제를 모두 선택해 주세요.');return;}
  setCompressing(true);setError('');
  try{
   const response=await fetch('/api/prompt/build-final',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameName:game.name,gameDescription:game.description,genre:game.wizardWorld||game.wizardType,goalMode:game.finalGoalMode||'single',choices:chosen})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'최종 규칙 생성 실패');
   if(typeof data.prompt!=='string'||!data.prompt.trim())throw Error('AI가 최종 규칙을 반환하지 않았습니다.');
   if(data.prompt.length>PROMPT_LIMIT)throw Error('최종 규칙이 7,000자를 초과했습니다.');
   update({compressedPrompt:data.prompt,prompt:data.prompt,wizardStage:3});
  }catch(e){setError(e instanceof Error?e.message:'최종 규칙 생성 실패');}
  finally{setCompressing(false);}
 };
 const renderChoices=(section:{id:string;name:string;guide:string})=>{
  const d=drafts[section.id]||{options:[],selected:-1,custom:'',enabled:true};
  return <div className="wizardChoices">{section.id==='goal'&&<div className="goalModePicker"><strong>최종 목표 달성 방식</strong><div className="modeChoices"><button type="button" className={'modeChoice '+(game.finalGoalMode!=='progress'?'modeSelected':'')} onClick={()=>update({finalGoalMode:'single'})}>최종 목표형</button><button type="button" className={'modeChoice '+(game.finalGoalMode==='progress'?'modeSelected':'')} onClick={()=>update({finalGoalMode:'progress'})}>진행도형</button></div><small>선택한 방식에 맞춰 최종 목표가 설계됩니다. 진행도형의 세부 단계도 이곳에서 설정합니다.</small>{game.finalGoalMode==='progress'&&<div className="goalStepEditor"><p className="assetHelp">최종 목표를 이루기 위한 세부 단계를 한 줄에 하나씩 입력하세요. 게임 진행 중 완료한 단계가 진행도로 표시됩니다.</p><label className="field">진행도형 목표 단계 (2개 이상)<textarea rows={6} value={(game.finalGoalSteps||[]).join('\n')} onChange={e=>update({finalGoalSteps:e.target.value.split('\n').slice(0,12).map(v=>v.slice(0,160))})} placeholder={'1단계: 단서 확보\n2단계: 적의 음모 저지\n3단계: 최종 결전 승리'}/></label><small>등록된 단계 {(game.finalGoalSteps||[]).filter(v=>v.trim()).length}개</small></div>}</div>}<div className="wizardRowHeader"><strong>{section.name}</strong><span className="softPill">미리 준비된 선택지 3개</span></div>
   <p className="wizardSectionGuide">{section.guide} 아래에서 원하는 방향 하나를 선택하세요. AI 호출 없이 바로 선택할 수 있습니다.</p>
   {[0,1,2].map(i=>{const full=d.options[i]||'';const key=section.id+'-'+i;return <div role="radio" aria-checked={d.selected===i} tabIndex={full?0:-1} onKeyDown={e=>{if(full&&(e.key==='Enter'||e.key===' ')){e.preventDefault();choosePreset(section.id,i);}}} onClick={()=>{if(full)choosePreset(section.id,i);}} className={'wizardChoice wizardSelectable '+(d.selected===i?'selected':'')+(full?'':' wizardDisabled')} key={i}><div className="wizardOptionSummary"><input type="radio" name={'wizard-'+section.id} disabled={!full} checked={d.selected===i} onClick={e=>e.stopPropagation()} onChange={()=>choosePreset(section.id,i)}/><div className="wizardOptionText"><strong>{i+1}안 · {d.optionTitles?.[i] || (full ? full.replace(/^[#\s\d.]+/,'').split(/[.!?\n]/)[0].slice(0,22) : '다른 진행 방식')}</strong><span>{full?full.replace(/\s+/g,' ').slice(0,115)+(full.length>115?'…':''):'미리 준비된 선택지를 불러오는 중입니다.'}</span></div></div>{full&&<div className="wizardHoverFull" role="tooltip">{full}</div>}{full.length>115&&<button type="button" className="wizardDetail" onClick={e=>{e.stopPropagation();setExpanded(v=>({...v,[key]:!v[key]}));}}>{expanded[key]?'접기':'전체 내용 보기'}</button>}{expanded[key]&&<p className="wizardFull">{full}</p>}</div>})}
   <div className={'wizardChoice wizardCustom '+(d.selected===3?'selected':'')} onClick={()=>{if(d.selected!==3)setDraft(section.id,{selected:3});}}><label><input type="radio" name={'wizard-'+section.id} checked={d.selected===3} onChange={()=>setDraft(section.id,{selected:3})}/><b>4안 · 직접 작성</b></label><textarea rows={2} value={d.custom} onFocus={()=>{if(d.selected!==3)setDraft(section.id,{selected:3});}} onChange={e=>setDraft(section.id,{selected:3,custom:e.target.value})} placeholder="원하는 내용을 직접 입력하세요. 입력하면 오른쪽 미리보기에 반영됩니다."/></div>
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

  {stage===0&&<div className="wizardStep"><h3>1. 어떤 게임을 만들고 싶나요?</h3><p>플레이어가 주로 무엇을 하는 게임인지 골라주세요.</p><div className="wizardTypeList">{wizardTypes.map(([id,name,desc])=><button type="button" key={id} className={game.wizardType===id?'chosen':''} disabled={id!=='rpg'} onClick={()=>{if(id==='rpg')update({wizardType:id,wizardWorld:'',wizardStage:1});}}><strong>{name}</strong><small>{desc}</small>{id==='rpg'?<ChevronRight size={18}/>:<em className="comingSoon">추후 제작 가능</em>}</button>)}</div></div>}
  {stage===1&&<div className="wizardStep"><h3>2. 게임 장르를 선택하세요</h3><p>세계관은 세 가지로 고정됩니다. 이후 5가지 핵심 방향을 버튼으로 선택하세요.</p><div className="wizardChoiceList">{worldChoices.map((w,i)=><button type="button" key={w} className={'wizardWorldRow '+(selectedWorld===w?'chosen':'')} onClick={()=>update({wizardWorld:w,...genrePresetPatch(game,w)})}><b>{i+1}</b><span>{w}</span><ChevronRight size={16}/></button>)}</div><button type="button" className="btn primary" disabled={!worldChoices.includes(selectedWorld)} onClick={()=>update({wizardStage:2,removedPromptSections:[...new Set([...removed,...promptSections.filter(s=>!s.required).map(s=>s.id)])],prompt:buildDraftPrompt(drafts,extras,[...new Set([...removed,...promptSections.filter(s=>!s.required).map(s=>s.id)])])})}>장르 확정하고 5단계 선택 시작 <ChevronRight size={16}/></button></div>}
  {stage===2&&<div className="wizardStep rpgStepWizard">
    <div className="rpgStepTop"><strong>RPG 규칙 제작 · {ruleStep+1} / {required.length}</strong><span>{combined.length.toLocaleString()}자 · 최대 7,000자</span></div>
    <div className="rpgStepProgress">{required.map((section,i)=><button key={section.id} type="button" title={section.name} className={i===ruleStep?'active':draftText(drafts[section.id]).trim()?'done':''} disabled={i>ruleStep&&!required.slice(0,i).every(x=>draftText(drafts[x.id]).trim())} onClick={()=>setRuleStep(i)}>{i+1}</button>)}</div>
    <div className="wizardRequired"><div className="wizardRequiredLabel"><span>{ruleStep+1} / {required.length}</span><strong>{activeRule.name}</strong>{draftText(drafts[activeRule.id]).trim()&&<small>선택 완료 ✓</small>}</div>
    <p className="wizardHelp">5개 주제의 방향만 빠르게 선택합니다. 선택 중에는 AI 호출이 없고, 마지막에 3회 생성·통합하여 최종 규칙을 완성합니다.</p>
    {renderChoices(activeRule)}
    <button className="btn" type="button" disabled={busy} onClick={()=>void generate(activeRule)}><RotateCcw size={15}/>{loadingId===activeRule.id?'추천 생성 중...':'추천 방향 3개 다시 생성'}</button>
    </div>
    {staleAfter>=0&&ruleStep>staleAfter&&<p className="promptBuilderError">앞선 규칙이 변경되었습니다. 현재 단계와 이후 규칙을 재검토하거나 추천을 다시 생성해 주세요.</p>}
    <div className="rpgStepNavigation"><button className="btn" type="button" disabled={ruleStep===0} onClick={()=>setRuleStep(i=>Math.max(0,i-1))}><ArrowLeft size={15}/> 이전</button>{ruleStep<required.length-1?<button className="btn primary" type="button" disabled={compressing||!draftText(drafts[activeRule.id]).trim()} onClick={()=>void integrateStep()}>{'다음 주제'} <ChevronRight size={15}/></button>:<button className="btn primary" type="button" disabled={compressing||!requiredReady} onClick={()=>void integrateStep()}>{compressing?'AI가 2단계로 최종 규칙 생성 중...':'5개 선택 완료 · 전체 규칙 생성'} <ChevronRight size={15}/></button>}</div>
    <p className="wizardHelp">5개 주제를 먼저 선택하고 마지막에 AI가 전체 규칙을 3회 생성·통합합니다. 최대 7,000자입니다.</p>
  </div>}
  {stage===3&&<div className="wizardStep"><h3>4. 최종 프롬프트 확인 및 선택적 보완</h3><div className="tip"><strong>원본 {combined.length.toLocaleString()}자 · 최대 7,000자</strong><p>선택한 5개 기획 방향을 바탕으로 3회의 AI 생성·편집을 마친 완성본입니다. NPC·사건·전투·목표를 확인하세요.</p><button type="button" className="btn primary" disabled={compressing||busy||!requiredReady||!!game.compressedPrompt} onClick={()=>void compressFinal()}><Sparkles size={16}/>{compressing?'전체 규칙 압축 중...':game.compressedPrompt?'5단계 자동 통합 완료':'AI로 최종 규칙 통합·압축 (최대 7,000자)'}</button>{game.compressedPrompt&&<p>최종 압축본 {game.compressedPrompt.length.toLocaleString()}자 · 오른쪽 미리보기에 적용됨</p>}</div><p>완성된 최종 규칙으로 게임을 시작할 수 있습니다. 필요하면 아래 예시를 참고해 원하는 규칙을 직접 추가하세요. 예시는 자동 적용되지 않습니다.</p><div className="tip">추가 규칙 예시: NPC와 관계(호감도·신뢰도), 세력과 조직(평판·외교), 전투와 대결(승패·부상), 시간과 일정(하루 행동·기한), 경제와 거래(자금·가격), 생존과 자원(식량·피로), 실패·패배·종료 조건(사망·퇴학·파산). 게임 장르에 맞게 제목과 내용을 자유롭게 작성하세요.</div>{optional.map(s=><div key={s.id} className="wizardOptionalEditor"><div className="wizardRowHeader"><strong>{s.name}</strong><button type="button" className="btn" onClick={()=>{const next=extras.filter(x=>x.id!==s.id);const nextDrafts={...drafts};delete nextDrafts[s.id];update({customPromptSections:next,promptDrafts:nextDrafts,prompt:buildDraftPrompt(nextDrafts,next,removed),compressedPrompt:undefined});}}><Trash2 size={15}/> 삭제</button></div><textarea rows={4} value={draftText(drafts[s.id])} onChange={e=>setDraft(s.id,{selected:3,custom:e.target.value,enabled:true})} placeholder="게임에 추가할 규칙을 자유롭게 작성하세요."/></div>)}{!adding?<button type="button" className="btn" onClick={()=>setAdding(true)}><Plus size={16}/> 새 규칙 직접 추가</button>:<div className="wizardAdd"><input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="규칙 제목"/><textarea value={newGuide} onChange={e=>setNewGuide(e.target.value)} rows={4} placeholder="추가할 규칙 내용을 직접 작성하세요."/><div className="wizardRowHeader"><button className="btn" type="button" onClick={()=>setAdding(false)}>취소</button><button className="btn primary" type="button" disabled={!newTitle.trim()||!newGuide.trim()} onClick={()=>{const id='custom-'+makeId();const next=[...extras,{id,name:newTitle.trim(),guide:''}];const nextDrafts={...drafts,[id]:{options:[],selected:3,custom:newGuide.trim(),enabled:true}};update({customPromptSections:next,promptDrafts:nextDrafts,prompt:buildDraftPrompt(nextDrafts,next,removed),compressedPrompt:undefined});setNewTitle('');setNewGuide('');setAdding(false);}}>규칙 저장</button></div></div>}<button type="button" className="btn" onClick={()=>setStage(2)}><ArrowLeft size={15}/> RPG 규칙 5단계 다시 수정</button><button type="button" className="btn primary" disabled={!requiredReady||!game.compressedPrompt} onClick={()=>{const finalPrompt=game.compressedPrompt||combined;if(finalPrompt.length>PROMPT_LIMIT){setError('게임에 적용할 프롬프트가 7,000자를 초과했습니다. 먼저 AI 통합·압축을 실행해 주세요. 원본은 보존됩니다.');return;}onMap();}}>프롬프트 작성 완료 · 맵 관리로 이동 <ChevronRight size={16}/></button></div>}
  {stage===1&&<button type="button" className="btn wizardBack" onClick={()=>setStage(0)}><ArrowLeft size={15}/> 게임 유형 다시 선택</button>}
  {combined.length>PROMPT_LIMIT&&<div className="promptBuilderError">원본 {combined.length.toLocaleString()}자입니다. 실제 게임용 프롬프트는 최대 7,000자이므로 최종 통합·압축을 완료해야 합니다.</div>}
  {error&&<div className="promptBuilderError" role="alert">{error}</div>}
 </div>;
}
export default function Home() {
  const [games, setGames] = useState<Game[]>([initial]);
  const [selected, setSelected] = useState('sample');
  const [view, setView] = useState<View>('library');
  const [tab, setTab] = useState<Tab>('profile');
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
  const [action, setAction] = useState('');
  const [draftSection,setDraftSection]=useState<string>('role');
  const [draftBusy,setDraftBusy]=useState(false);
  const [draftError,setDraftError]=useState('');
  const [goalStepsBusy,setGoalStepsBusy]=useState(false);const [goalStepsError,setGoalStepsError]=useState('');
  const [registrationBusy,setRegistrationBusy]=useState(false);
  const [registrationError,setRegistrationError]=useState('');

  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [notice, setNotice] = useState('');
  const [newTag, setNewTag] = useState('');
  const [movingAsset, setMovingAsset] = useState<string | null>(null);
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [customMapPrompt,setCustomMapPrompt] = useState('');
  const [pinMode, setPinMode] = useState<'select' | 'relocate' | 'start' | 'place' | 'building' | 'exit'>('select');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const draggingPin = useRef<{mapId:string;pinId:string;startX:number;startY:number;moved:boolean}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

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
          const hydrated = data.map((g: Game) => ({ ...g, profileDone: g.profileDone ?? true, promptDone: g.promptDone ?? !!(g.promptDrafts && Object.keys(g.promptDrafts).length), mapDone: g.mapDone ?? !!(g.maps?.length), settingsDone: g.settingsDone ?? !!g.registrationDescription, prompt: typeof g.prompt === 'string' ? g.prompt : [g.world, g.rules, g.gm].filter(Boolean).join('\n\n'), assets: Array.isArray(g.assets) ? g.assets : [], imageRows: Array.isArray(g.imageRows) ? g.imageRows : (Array.isArray(g.assets) ? g.assets.map((a: Asset) => ({ id: a.id, name: a.name })) : []), imageColumns: Array.isArray(g.imageColumns) ? g.imageColumns : [{ id: 'default', name: '기본' }] , imageCells: Array.isArray(g.imageCells) ? g.imageCells : (Array.isArray(g.assets) ? g.assets.filter((a: Asset) => a.image).map((a: Asset) => ({ rowId: a.id, columnId: 'default', image: a.image })) : []), mapImage: g.mapImage || '', startMapId: g.startMapId, startPinId: (()=>{const wm=(g.maps||[]).find(m=>m.id===g.startMapId);const isDefaultWuxia=wm?.image==='/api/default-map/wuxia/0';const first=wm?.pins?.[0];return isDefaultWuxia && first?.name==='천마신교' && g.startPinId===first.id ? (wm?.pins.find(p=>p.name==='낙양')?.id || g.startPinId) : g.startPinId;})(), maps: Array.isArray(g.maps) ? g.maps : (g.mapImage ? [{ id: makeId(), name: '기존 맵', image: g.mapImage, pins: [] }] : []), registrationDescription: typeof g.registrationDescription === 'string' ? g.registrationDescription : '', genre: typeof g.genre === 'string' ? g.genre : 'RPG / 탐험', gameType: normalizeType(g), cooperation: COOPERATION.includes(g.cooperation || '') ? g.cooperation : '협동', progression: PROGRESSION.includes(g.progression || '') ? g.progression : '턴제', playTime: PLAY_TIMES.includes(g.playTime || '') ? g.playTime : '장기 캠페인', hashtags: Array.isArray(g.hashtags) ? g.hashtags.filter((x: unknown) => typeof x === 'string').slice(0, MAX_TAGS) : [], audience: typeof g.audience === 'string' ? g.audience : '전체 이용가', characterConfig: g.characterConfig ? {...normalizeCharacterConfig(g.characterConfig), sections:{...defaultCharacterConfig().sections,...(g.characterConfig.sections || {})}} : defaultCharacterConfig(), showHpBar: g.showHpBar !== false, showEquipment: g.showEquipment !== false, showDice: g.showDice !== false, startingEquipment: typeof g.startingEquipment === 'string' ? g.startingEquipment : '낡은 검, 가죽 갑옷, 회복 물약', playMode: g.playMode === 'multi' ? 'multi' : 'single', minPlayers: Math.max(2, Math.min(6, Number(g.minPlayers) || 2)), maxPlayers: Math.max(2, Math.min(6, Number(g.maxPlayers) || 4)) }));
          setGames(hydrated);
          setSavedSnapshot(legacyMigration ? '[]' : JSON.stringify(hydrated));
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
      const sample=presetMaps(match[1])[Number(match[2])];
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
    setGames(old => [...old, g]); setSelected(g.id); setTab('profile'); setView('edit');
  }
  // Build the first three actions from the actual prologue, not the map's nearest pins.
  async function loadOpeningChoices(g: Game) {
    if (!prologueText(g).trim()) return;
    try {
      const response = await fetch('/api/prologue/choices', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prologue:prologueText(g), prompt:(g.prompt||'').slice(0,PROMPT_LIMIT), name:g.name, genre:defaultMapGenre(g)})
      });
      if (!response.ok) throw new Error('opening choices unavailable');
      const data = await response.json();
      if (!Array.isArray(data.choices) || data.choices.length !== 3) throw new Error('invalid opening choices');
      setSession(current => {
        if (current.gameId !== g.id || current.log.length !== 1 || !current.log[0].startsWith('프롤로그:')) return current;
        const relationships = [...(current.relationships || [])];
        for (const raw of (Array.isArray(data.metCharacters) ? data.metCharacters : []).slice(0, 20)) {
          if (!raw || typeof raw.name !== 'string') continue;
          const name = raw.name.trim().slice(0, 50);
          if (!name || name === (g.characterConfig || defaultCharacterConfig()).initialName || relationships.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase())) continue;
          relationships.push({id:makeId(),name,relation:typeof raw.relation==='string' ? raw.relation.slice(0,30) : '초면',affection:0});
        }
        return {...current, relationships, currentGoal: typeof data.currentGoal === 'string' ? data.currentGoal.trim().slice(0,240) : current.currentGoal, suggestedActions:data.choices};
      });
    } catch {
      // API 오류 시에도 장르별 사건 기반 선택지 3개를 유지합니다.
    }
  }
  async function start(g: Game) {
    setSelected(g.id);
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
          setSession({ ...saved, ...location, pendingCheck: saved.pendingCheck || null, lastCheck: saved.lastCheck || null,
            characterValues: saved.characterValues || Object.fromEntries((g.characterConfig || defaultCharacterConfig()).fields.map(f=>[f.id,f.initial])), characterEquipment: saved.characterEquipment || {}, characterGold: typeof saved.characterGold === "number" ? saved.characterGold : (g.characterConfig || defaultCharacterConfig()).initialGold,
            inventory: Array.isArray(saved.inventory) ? saved.inventory : combinedStartingItems(g.prompt || '', g.startingEquipment || ''),
            flags: Array.isArray(saved.flags) ? saved.flags : [],
            triggeredEvents: Array.isArray(saved.triggeredEvents) ? saved.triggeredEvents : [],
            relationships: Array.isArray(saved.relationships) ? saved.relationships : [],
            currentGoal: typeof saved.currentGoal === 'string' ? saved.currentGoal : '', completedGoalSteps:Array.isArray(saved.completedGoalSteps)?saved.completedGoalSteps.filter((x:unknown)=>Number.isInteger(x)&&Number(x)>=0):[],goalCompleted:saved.goalCompleted === true,
            suggestedActions: Array.isArray(saved.suggestedActions) && saved.suggestedActions.some((x: unknown) => typeof x === 'string' && x.trim()) ? saved.suggestedActions.filter((x: unknown) => typeof x === 'string' && x.trim()).slice(0, 3) : (saved.pendingCheck ? [] : (saved.log.length===1 && saved.log[0]?.startsWith('프롤로그:') ? openingActions(g) : defaultActions(g, location.mapId, location.pinId))),
            activeImageKey: typeof saved.activeImageKey === 'string' ? saved.activeImageKey : undefined,
            x: Number.isFinite(saved.x) ? Math.max(0, Math.min(g.size - 1, saved.x)) : Math.floor(g.size / 2),
            y: Number.isFinite(saved.y) ? Math.max(0, Math.min(g.size - 1, saved.y)) : Math.floor(g.size / 2)
          });
        } else setSession(makeSession(g));
      } else setSession(makeSession(g));
    } catch { setSession(makeSession(g)); }
    setView('play');
    // Only fresh sessions are modified by the opening analysis; restored progress is left intact.
    void loadOpeningChoices(g);
  }
  function newGame() {
    if (busy) return;
    if (!window.confirm('현재 플레이 기록을 지우고 처음부터 새로 시작할까요? 게임 제작 설정과 맵은 유지됩니다.')) return;
    setAction('');
    setSession(makeSession(game));
    void loadOpeningChoices(game);
    if (chatRef.current) chatRef.current.scrollTop = 0;
  }
  function remove(g: Game) {
    if (!confirm(`'${g.name}' 게임을 삭제할까요?`)) return;
    const remaining = games.filter(item => item.id !== g.id);
    if (!remaining.length) {
      const fresh = { ...initial, id: makeId(), created: Date.now(), playMode: 'single', minPlayers: 2, maxPlayers: 4, maps: [] };
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
  async function roll() {
    const check = session.pendingCheck;
    if (!check || busy) return;
    const die = 1 + Math.floor(Math.random() * 20);
    const cfg = game.characterConfig || defaultCharacterConfig();
    const field = cfg.fields.find(f => f.id.toLowerCase() === check.ability.toLowerCase());
    const score = Number(session.characterValues?.[field?.id || check.ability] ?? field?.initial ?? 10);
    const modifier = Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
    const total = die + modifier;
    const success = die === 20 || (die !== 1 && total >= check.dc);
    const result: DiceResult = { ability: check.ability, label: check.label, dc: check.dc, die, modifier, total, success, critical: die === 20 ? '대성공' : die === 1 ? '대실패' : '' };
    const verdict = result.critical || (success ? '성공' : '실패');
    const next: Session = { ...session, pendingCheck: null, lastCheck: result, roll: die,
      suggestedActions: [], log: [...session.log, `주사위: ${check.label} — D20(${die}) ${modifier >= 0 ? '+' : '-'} ${Math.abs(modifier)} = ${total} / DC ${check.dc} → ${verdict}`] };
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
  async function requestGM(message: string, next: Session, event?: { id: string; text: string; trigger: string }, movementAllowed = true, diceResult?: DiceResult) {
    if (next.goalCompleted) return;
    setBusy(true);
    try {
      const map = (game.maps || []).find(m => m.id === next.mapId);
      const pin = map?.pins.find(p => p.id === next.pinId);
      const res = await fetch('/api/gm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: (game.prompt || [game.world, game.rules, game.gm].join('\n')).slice(0, PROMPT_LIMIT),
          action: message, history: next.log.slice(-12), prologue: game.prologue || "", movementAllowed, diceResult: diceResult || null,
          initialEquipment: combinedStartingItems(game.prompt || "", game.startingEquipment || "").join(", "),
          ruleEquipment: extractRuleItems(game.prompt || ""),
          state: {
            relationships: next.relationships || [], currentGoal:next.currentGoal || "", finalGoal:getGameGoal(game), finalGoalMode:game.finalGoalMode||'single', finalGoalSteps:game.finalGoalSteps||[],completedGoalSteps:next.completedGoalSteps||[],goalCompleted:next.goalCompleted === true,
            availableImages: [...(game.npcPortraits||[]).filter(n=>n.image).map(n=>`${n.name}::기본`),...(game.imageCells||[]).flatMap(cell=>{const row=(game.imageRows||[]).find(r=>r.id===cell.rowId);const col=(game.imageColumns||[]).find(c=>c.id===cell.columnId);return row&&col?[`${row.name}::${col.name}`]:[];})],
            currentMapId: map?.id || '', mapName: map?.name || '', locationName: pin?.name || '', locationDescription: pin?.description || '',
            locations: (game.maps || []).flatMap(worldMap => worldMap.pins.map(p => ({ id: p.id, mapId: worldMap.id, mapName: worldMap.name, name: p.name, kind: p.kind, description: p.description || '', targetMapId: p.targetMapId || '', targetPinId: p.targetPinId || '' }))),
            adjacentLocationIds: (map?.pins||[]).filter(p=>p.kind!=='event').map(p => p.id),
            adjacentLocations: nearbyPins(map, pin?.id).slice(0, 4).map(p => ({ id:p.id, name:p.name, kind:p.kind })),
            travel: next.travel ? { destinationName: map?.pins.find(p=>p.id===next.travel?.destinationId)?.name || '', remaining: next.travel.remaining, total: next.travel.total } : null,
            event: event?.text || '', eventTrigger: event?.trigger || '', currentInteractionEvent: pin?.eventTrigger === 'interact' ? pin.eventText || '' : '',
            characterValues: next.characterValues || {}, hp: next.hp, maxHp: game.hp, inventory: next.inventory || [], flags: next.flags || [], roll: next.roll
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 요청 실패');
      if (!diceResult && data.check && typeof data.check === 'object') {
        const check = data.check;
        const ability = String(check.ability || '').toLowerCase();
        const valid = (game.characterConfig || defaultCharacterConfig()).fields.some(f => f.id.toLowerCase() === ability && f.kind === 'number');
        const dc = Number(check.dc);
        if (valid && Number.isFinite(dc) && dc >= 1 && dc <= 40) {
          const pending: DiceCheck = { ability, dc: Math.round(dc), label: String(check.label || '능력').slice(0, 60), reason: String(check.reason || '행동 결과를 판정합니다.').slice(0, 200), action: message };
          setSession({ ...next, suggestedActions: [], pendingCheck: pending, lastCheck: null, log: [...next.log, `GM: ${String(data.text || '판정이 필요합니다.')}`, `시스템: ${pending.label} · DC ${pending.dc} — 주사위를 굴려주세요.`] });
          return;
        }
      }
      // AI는 이동 의도를 제안만 합니다. 실제 장소 ID와 포탈 조건은 클라이언트가 검증합니다.
      const proposedId = movementAllowed && typeof data.moveToPinId === 'string' ? data.moveToPinId : '';
      const activeMap = (game.maps || []).find(m => m.id === next.mapId);
      const proposedPin = activeMap?.pins.find(p => p.id === proposedId && p.kind !== 'exit');
      const exitPin = activeMap?.pins.find(p => p.id === proposedId && p.kind === 'exit');
      let destinationMap = activeMap;
      let destinationPin = proposedPin;
      let blocked = '';
      // A long journey is completed only after subsequent player turns.
      // Explicit interruption or a new destination cancels/replaces the prior journey.
      const travelDestination = next.travel?.mapId===next.mapId ? activeMap?.pins.find(p=>p.id===next.travel?.destinationId) : undefined;
      const continueJourney = !!travelDestination && (!proposedId || proposedId===travelDestination.id) && /(?:계속|이동|향해|간다|전진|여정|출발)/.test(message) && !/(돌아|중단|취소|멈춰|그만|포기)/.test(message);
      let nextTravel = continueJourney ? next.travel : undefined;
      let travelNote = '';
      if (continueJourney && nextTravel) {
        if (nextTravel.remaining > 1) {
          nextTravel = {...nextTravel, remaining:nextTravel.remaining-1};
          destinationPin=undefined;
          travelNote=`${travelDestination!.name}까지 이동 중입니다. 남은 이동 장면 ${nextTravel.remaining}회.`;
        } else {
          destinationPin=travelDestination;
          nextTravel=undefined;
          travelNote=`${travelDestination!.name}에 도착했습니다.`;
        }
      } else if (next.travel && /(?:돌아|중단|취소|멈춰|그만|포기)/.test(message)) {
        travelNote='이동을 중단했습니다.';
      } else if (proposedPin && proposedPin.id!==next.pinId) {
        const steps=travelSteps(activeMap,next.pinId,proposedPin.id);
        if (steps>0) {
          nextTravel={mapId:next.mapId!,destinationId:proposedPin.id,remaining:steps,total:steps};
          destinationPin=undefined;
          travelNote=`${proposedPin.name}(으)로 장거리 이동을 시작했습니다. 이동 중 ${steps}개 장면을 거쳐야 합니다.`;
        }
      }
      if (exitPin && !blocked) {
        nextTravel=undefined;
        if (exitPin.requiredItem && !(next.inventory || []).includes(exitPin.requiredItem)) blocked = `${exitPin.requiredItem} 아이템이 필요합니다.`;
        else if (exitPin.requiredFlag && !(next.flags || []).includes(exitPin.requiredFlag)) blocked = `${exitPin.requiredFlag} 조건이 필요합니다.`;
        else {
          destinationMap = (game.maps || []).find(m => m.id === exitPin.targetMapId);
          destinationPin = destinationMap?.pins.find(p => p.id === exitPin.targetPinId) || destinationMap?.pins.find(p => p.kind === 'start') || destinationMap?.pins[0];
          if (!destinationMap || !destinationPin) blocked = '연결된 포탈 목적지가 없습니다.';
        }
      }
      const moved = !!destinationMap && !!destinationPin && !blocked && (destinationMap.id !== next.mapId || destinationPin.id !== next.pinId);
      const destinationKey = moved ? `${destinationMap!.id}:${destinationPin!.id}` : '';
      const arrivalEvent = moved && destinationPin!.eventText?.trim() && destinationPin!.eventTrigger !== 'interact' && (!destinationPin!.eventOnce || !(next.triggeredEvents || []).includes(destinationKey))
        ? { id: destinationKey, text: destinationPin!.eventText!.trim(), trigger: 'enter' } : undefined;
      const current = next;
      {
        const delta = Number(data.hpDelta);
        const hp = Number.isFinite(delta) ? Math.max(0, Math.min(game.hp, current.hp + Math.max(-game.hp, Math.min(game.hp, Math.trunc(delta))))) : current.hp;
        const inventory = [...(current.inventory || [])];
        const add = Array.isArray(data.addItems) ? data.addItems.filter((v: unknown): v is string => typeof v === 'string').slice(0, 5) : [];
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
        const suggestedActions = Array.isArray(data.choices) ? data.choices.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0).map((v: string) => v.trim().slice(0, 140)).slice(0, 3) : [];
        const travelActions = nextTravel ? [`${activeMap?.pins.find(p=>p.id===nextTravel.destinationId)?.name || '목적지'} 방향으로 계속 이동한다.`, '잠시 쉬며 주변을 살핀다.', '이동 경로에 숨겨진 지름길이나 낯선 흔적을 조사한다.'] : [];
        const relationships = [...(current.relationships || [])];
        if (Array.isArray(data.relationshipUpdates)) {
          for (const raw of data.relationshipUpdates.slice(0, 12)) {
            if (!raw || typeof raw.name !== 'string') continue;
            const name = raw.name.trim().slice(0, 50);
            if (!name || name === (game.characterConfig || defaultCharacterConfig()).initialName) continue;
            const index = relationships.findIndex(p => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
            if (index < 0 && raw.met !== true) continue;
            const previous = index >= 0 ? relationships[index] : undefined;
            const relation = typeof raw.relation === 'string' && raw.relation.trim() ? raw.relation.trim().slice(0, 30) : (previous?.relation || '초면');
            const affection = previous ? (typeof raw.affection === 'number' && Number.isFinite(raw.affection) ? Math.max(0, Math.min(100, Math.round(raw.affection))) : previous.affection) : 0;
            const person = { id: previous?.id || makeId(), name: previous?.name || name, relation, affection };
            if (index >= 0) relationships[index] = person;
            else if (relationships.length < 100) relationships.push(person);
          }
        }
        const currentGoal = typeof data.currentGoal === 'string' && data.currentGoal.trim() ? data.currentGoal.trim().slice(0,240) : current.currentGoal;
        const configuredSteps=(game.finalGoalSteps||[]).map(x=>x.trim()).filter(Boolean);
        const validStepIndices=Array.isArray(data.completedGoalSteps)?data.completedGoalSteps.filter((n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<configuredSteps.length):[];
        const completedGoalSteps=[...new Set([...(current.completedGoalSteps||[]),...validStepIndices])].filter(n=>n<configuredSteps.length).sort((a,b)=>a-b);
        const goalCompleted = current.goalCompleted === true || (game.finalGoalMode==='progress' ? (configuredSteps.length>0 && completedGoalSteps.length===configuredSteps.length) : (data.finalGoalCompleted === true && !!getGameGoal(game).trim()));
        const result: Session = { ...current, relationships, currentGoal, completedGoalSteps,goalCompleted, travel:nextTravel, suggestedActions: arrivalEvent ? [] : (travelActions.length ? travelActions : (suggestedActions.length ? suggestedActions : defaultActions(game, moved ? destinationMap!.id : current.mapId, moved ? destinationPin!.id : current.pinId))), ...(moved ? { mapId: destinationMap!.id, pinId: destinationPin!.id } : {}), hp, inventory, flags, activeImageKey,
          triggeredEvents: arrivalEvent && destinationPin!.eventOnce ? [...(current.triggeredEvents || []), destinationKey] : current.triggeredEvents,
          log: [...current.log, `GM: ${String(data.text || 'GM 응답이 없습니다.')}${activeImageKey && !String(data.text||'').includes('{{img::') && activeImageKey === data.imageKey ? `\n\n{{img::${activeImageKey.replace('::','::')}}}` : ''}`, ...(blocked ? [`시스템: 이동 불가 — ${blocked}`] : []), ...(travelNote ? [`시스템: ${travelNote}`] : []), ...(moved ? [`시스템: ${destinationMap!.name} / ${destinationPin!.name}(으)로 이동했습니다.`] : []), ...(hp !== current.hp ? [`시스템: HP ${current.hp} → ${hp}`] : []), ...(add.length ? [`시스템: 획득 — ${add.join(', ')}`] : []), ...(remove.length ? [`시스템: 사용 — ${remove.join(', ')}`] : []), ...(goalCompleted && !current.goalCompleted ? ['시스템: 최종 목표 달성 — 게임 완료'] : [])] };
        setSession(result);
        if (arrivalEvent) {
          await requestGM(`시스템에서 ${destinationPin!.name} 도착을 확정했습니다. 도착 이벤트를 진행하세요.`, result, arrivalEvent, false);
        }
      }
    } catch (err) {
      setSession(s => ({ ...s, log: [...s.log, `시스템: ${err instanceof Error ? err.message : 'AI 연결 실패'}`] }));
    } finally { setBusy(false); }
  }
  // Map marker is managed independently from the retired image matrix.
  const playerBaseImage = undefined;
  function clickPlayMap(e: React.MouseEvent<HTMLDivElement>, map: BoardMap) {
    if (busy || !map.pins.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * 100;
    const y = (e.clientY - rect.top) / rect.height * 100;
    // 장소 표시를 숨기더라도 해당 지점 근처를 클릭하면 이동합니다.
    const nearest = [...map.pins].sort((a,b) => ((a.x-x)**2+(a.y-y)**2)-((b.x-x)**2+(b.y-y)**2))[0];
    if (Math.hypot(nearest.x-x, nearest.y-y) <= 9) visitPin(nearest, map);
  }
  function visitPin(p: MapPin, map: BoardMap) {
    if (busy || map.id!==session.mapId || p.id===session.pinId || p.kind==='event') return;
    // Route all map clicks through the same GM movement validation as typed actions.
    void sendPlayerAction(`${p.name}(으)로 이동한다.`);
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
  async function sendPlayerAction(message: string) {
    const clean = message.trim();
    if (!clean || busy || session.pendingCheck) return;
    setAction('');
    const next: Session = { ...session, suggestedActions: [], lastCheck: null, log: [...session.log, `플레이어: ${clean}`] };
    setSession(next);
    await requestGM(clean, next);
  }
  async function submit() {
    await sendPlayerAction(action);
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
      setGames(old => [...old, imported]); setSelected(imported.id); setTab('profile'); setView('edit'); setNotice('게임을 가져왔습니다.');
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
  async function extractNpcs(){setNpcBusy('extract');setNpcError('');try{const r=await fetch('/api/npc/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:game.prompt,world:game.wizardWorld||game.world})});const d=await r.json();if(!r.ok)throw Error(d.error||'NPC 추출 실패');const existing=game.npcPortraits||[];const wuxiaDefaultNames=new Set(["청연", "설영", "천소화", "정혜", "한설아", "소화", "남궁세린", "당설화", "제갈연", "팽소연", "모용설", "이정", "월하", "혈영", "단유", "홍랑", "왕소교", "류월", "독고연", "진하", "백초희", "운낭", "마련"]);const isWuxiaNpcWorld=(game.wizardWorld||game.world||" ").includes("무협")||(game.genre||"").includes("무협");const npcs:NpcPortrait[]=d.npcs.map((n:{name:string;description:string;appearance:string;gender?:"male"|"female"|"unknown";age?:string;faction?:string;visualIdentity?:string})=>{const old=existing.find(x=>x.name===n.name);const npcWorld=(game.wizardWorld||game.world||" ")+" "+(game.genre||"");const defaultGenre=isWuxiaNpcWorld?"wuxia":npcWorld.includes("현대")?"modern":npcWorld.includes("판타지")?"fantasy":null;const defaultNamesByGenre:Record<string,Set<string>>={wuxia:wuxiaDefaultNames,fantasy:new Set(["그리마 철망치", "넬", "레지나 발트", "리오네 아스크", "말라키아", "미라벨 크로우", "바레나", "브리아", "세라핀", "실바엘", "아우렐리아", "에드리아 하르트", "엘로이즈", "오르벨라", "오틸리에 마른", "우르술라", "이졸데", "카시아", "테오도라", "핍", "한나"]),modern:new Set(["강태희", "고명숙", "김기연", "나연", "마서윤", "문지혜", "민하늘", "박진아", "백희원", "서지아", "송재은", "오은비", "유채린", "윤세진", "이소라", "장민서", "정유겸", "차유진", "최혜령", "한도연"])};const defaultPortrait=defaultGenre&&defaultNamesByGenre[defaultGenre].has(n.name)?`/api/default-npc/${encodeURIComponent(n.name)}?genre=${defaultGenre}`:undefined;return old?{...old,image:old.image||defaultPortrait,description:n.description,appearance:old.appearance||n.appearance,gender:old.gender&&old.gender!=="unknown"?old.gender:n.gender||"unknown",age:old.age||n.age||"",faction:old.faction||n.faction||"",visualIdentity:old.visualIdentity||n.visualIdentity||""}:{id:makeId(),name:n.name,image:defaultPortrait,description:n.description,appearance:n.appearance,gender:n.gender||"unknown",age:n.age||"",faction:n.faction||"",visualIdentity:n.visualIdentity||""};});update({npcPortraits:[...npcs,...existing.filter(x=>!npcs.some(n=>n.name===x.name))]});setNotice(`${npcs.length}명의 NPC를 불러왔습니다.`);}catch(e){setNpcError(e instanceof Error?e.message:String(e));}finally{setNpcBusy('');}}
  async function generateNpc(id:string){const npc=(game.npcPortraits||[]).find(n=>n.id===id);if(!npc)return;if(!npc.gender||npc.gender==="unknown"){setNpcError(`${npc.name}의 성별을 먼저 남성 또는 여성으로 지정해 주세요.`);return;}setNpcBusy(id);setNpcError('');try{const reference=(game.npcPortraits||[]).find(n=>n.image&&n.id!==id)?.image;const r=await fetch('/api/npc/image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:npc.name,description:npc.description,appearance:npc.appearance,gender:npc.gender||"unknown",age:npc.age||"",faction:npc.faction||"",visualIdentity:npc.visualIdentity||"",world:game.wizardWorld||game.world,style:game.npcStyle||'',reference})});const d=await r.json();if(!r.ok)throw Error(d.error||'이미지 생성 실패');changeNpc(id,{image:d.image});setNotice(`${npc.name} 이미지 생성 완료`);}catch(e){setNpcError(e instanceof Error?e.message:String(e));}finally{setNpcBusy('');}}
  const currentTab = tabs.findIndex(t => t.id === tab);

  return <div className="appShell">
    <header className="topbar">
      <button className="logo" onClick={() => setView('library')}><span className="logoMark"><Dices size={22} /></span> CRPG <strong>STUDIO</strong></button>
      <nav className="mainNav"><button className={view === 'library' ? 'navActive' : ''} onClick={() => setView('library')}><FolderOpen size={17} /> 내 게임</button><button className={view === 'edit' ? 'navActive' : ''} onClick={() => setView('edit')}><BookOpen size={17} /> 제작 스튜디오</button><button className={view === 'play' ? 'navActive' : ''} onClick={() => start(game)}><Play size={17} /> 테스트 플레이</button></nav>
      <div className="topRight"><span className="localTag"><span className="onlineDot" /> LOCAL</span><button className="btn primary" onClick={create}><Plus size={16} /> 새 게임</button></div>
    </header>

    {view === 'library' && <main className="libraryPage"><div className="pageHeading"><div><div className="eyebrow">YOUR GAME LIBRARY</div><h1>내가 만든 CRPG</h1><p>프롬프트로 나만의 CRPG를 만들고 보드에서 플레이하세요.</p></div><button className="btn primary" onClick={create}><Plus size={17} /> 새 게임 제작</button></div><div className="libraryToolbar"><h2>내 게임 <span>{games.length}</span></h2><button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> JSON 가져오기</button><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={e => importGame(e.target.files?.[0])} /></div><div className="gameGrid">{games.map(g => <article className="gameCard" key={g.id}><div className="gameCover">{g.cover ? <img src={g.cover} alt={`${g.name} 표지`} /> : <div className="coverFallback"><Dices size={52} /><span>YOUR ADVENTURE AWAITS</span></div>}<span className="coverChip">CRPG · {g.playMode === 'multi' ? `${g.minPlayers || 2}~${g.maxPlayers || 4}인` : '싱글'}</span></div><div className="gameInfo"><h3>{g.name}</h3><p>{g.description || '게임 소개가 없습니다.'}</p><div className="gameActions"><button className="btn primary" onClick={() => start(g)}><Play size={15} /> 플레이</button><button className="btn" onClick={() => { setSelected(g.id); setTab('profile'); setView('edit'); }}><Settings2 size={15} /> 편집</button><button className="iconButton" title="JSON 다운로드" onClick={() => exportGame(g)}><Download size={17} /></button><button className="iconButton dangerIcon" title="삭제" onClick={() => remove(g)}><Trash2 size={17} /></button></div></div></article>)}<button className="createCard" onClick={create}><span className="createIcon"><Plus size={28} /></span><strong>새 게임 만들기</strong><small>나만의 세계를 만들어 보세요</small></button></div></main>}

    {view === 'edit' && <main className="studioPage"><div className="studioHeading"><button className="backButton" onClick={() => setView('library')}><ArrowLeft size={18} /></button><div><h1>게임 제작</h1><p>변경사항은 저장 버튼을 눌러야 보관됩니다.</p></div><div className="studioActions"><span className="saved">{hasUnsavedChanges ? "저장되지 않은 변경사항" : saveStatus === "saved" ? "저장 완료" : "변경사항 없음"}</span><button className="btn primary" type="button" onClick={()=>void saveGames()} disabled={!ready || saving || !hasUnsavedChanges}><Check size={16} /> {saving ? "저장 중..." : "저장"}</button><button className="btn" onClick={() => exportGame(game)}><Download size={16} /> JSON 백업</button><button className="btn dark" onClick={() => start(game)}><Play size={16} /> 테스트 플레이</button></div></div><div className="studioTabs">{tabs.filter(t => t.id === 'profile' || (t.id === 'prompt' && game.profileDone) || (t.id === 'map' && game.promptDone) || (t.id === 'assets' && game.mapDone) || (t.id === 'settings' && game.mapDone && game.assetsDone && (game.maps || []).some(m=>m.id===game.startMapId && m.pins.some(p=>p.id===game.startPinId && p.kind!=='exit'))) || (t.id === 'register' && game.settingsDone && (game.maps?.length || 0) > 0)).map(t => <button key={t.id} className={tab === t.id ? 'tabActive' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</div><div className="studioColumns"><section className="editPanel"><div className="sectionHeading"><h2>{tabs[currentTab].label}</h2><p>{tab === 'profile' ? '게임의 첫인상을 만들어 주세요.' : tab === 'prompt' ? '게임 유형부터 선택해 프롬프트를 완성한 다음 맵 관리로 이동하세요.' : tab === 'map' ? '맵에 장소·건물을 배치하고 각 위치의 이벤트를 설정하세요.' : tab === 'assets' ? '프롬프트의 NPC를 불러와 통일된 화풍으로 이미지를 만들거나 직접 업로드하세요.' : tab === 'settings' ? '게임 화면과 캐릭터 정보를 직접 구성하세요.' : '보드게임 유형, 플레이 방식, 예상 시간과 해시태그를 설정하세요.'}</p></div>{tab === 'profile' && <div className="fields"><label className="field">게임 표지 이미지 <small>권장 비율 2:3, PNG·JPG·WebP·움직이는 GIF (최대 12MB)</small><div className="uploadBox"><ImageIcon size={20} /><span>표지 이미지 선택</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.gif" onChange={e => uploadCover(e.target.files?.[0])} /></div></label><label className="field">게임 이름 <span className="required">*</span><input maxLength={60} value={game.name} onChange={e => update({ name: e.target.value })} placeholder="게임 이름을 입력하세요" /></label><label className="field">한 줄 소개<textarea rows={3} maxLength={200} value={game.description} onChange={e => update({ description: e.target.value })} placeholder="어떤 게임인지 소개해 주세요" /></label><button type="button" className="btn primary" disabled={!game.name.trim() || !game.description.trim()} onClick={()=>{update({profileDone:true});setTab('prompt');}}>프로필 완료 · 게임 프롬프트로 이동 <ChevronRight size={16}/></button></div>}{tab === 'prompt' && <div className="fields"><PromptBuilder game={game} update={update} busy={draftBusy} setBusy={setDraftBusy} error={draftError} setError={setDraftError} onMap={()=>{update({promptDone:true});setTab('map');}}/><div className="tip">프롬프트는 AI GM에게 전달됩니다. 위치 이동은 맵 핀으로 처리하고 D20은 별도 코드로 처리되며, 프롬프트에 적은 모든 규칙이 자동 구현되는 것은 아닙니다.</div></div>}
{tab === 'assets' && <div className="fields npcEditor"><h3>NPC 관리</h3><p className="assetHelp">NPC 정보를 불러오고 기존 이미지를 관리하거나 직접 업로드할 수 있습니다.</p><p className="assetHelp">기존 NPC 이미지와 직접 업로드한 이미지는 게임 본문 및 관계도에서 계속 사용됩니다.</p><button type="button" className="btn primary" disabled={!!npcBusy||!game.prompt?.trim()} onClick={()=>void extractNpcs()}><Sparkles size={16}/>{npcBusy==='extract'?'NPC 분석 중...':'프롬프트에서 NPC 불러오기'}</button><div className="npcPortraitGrid">{(game.npcPortraits||[]).map(n=><div key={n.id} className="npcPortraitCard"><div className="npcPortraitThumb">{n.image?<img src={n.image} alt={n.name}/>:<ImageIcon size={40}/>}</div><div className="npcPortraitInfo"><strong>{n.name}</strong><small>{n.description}</small><label className="field">성별 <select value={n.gender||"unknown"} onChange={e=>changeNpc(n.id,{gender:e.target.value as "male"|"female"|"unknown"})}><option value="unknown">미설정 · 생성 전 확인</option><option value="male">남성</option><option value="female">여성</option></select></label><label className="field">나이 <input value={n.age||""} onChange={e=>changeNpc(n.id,{age:e.target.value})} placeholder="예: 22세"/></label><label className="field">소속/직책 <input value={n.faction||""} onChange={e=>changeNpc(n.id,{faction:e.target.value})} placeholder="예: 화산파 제자"/></label><label className="field">외형 고정 특징 <textarea rows={2} value={n.visualIdentity||""} onChange={e=>changeNpc(n.id,{visualIdentity:e.target.value})} placeholder="머리색, 눈색, 고유 장식, 무기 등 유지할 특징"/></label><label className="field">외형 설명<textarea rows={3} value={n.appearance} onChange={e=>changeNpc(n.id,{appearance:e.target.value})}/></label><div className="npcPortraitActions"><label className="btn npcUpload"><Upload size={15}/> 직접 업로드<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void uploadNpc(n.id,e.target.files?.[0]);e.target.value='';}}/></label></div></div></div>)}</div>{!(game.npcPortraits||[]).length&&<p className="assetHelp">NPC가 없습니다. 위의 '프롬프트에서 NPC 불러오기'를 눌러 주세요.</p>}{npcError&&<p className="mapGenerationError" role="alert">{npcError}</p>}<div className="mapCompletion"><p>NPC 이미지가 준비되면 게임 본문과 관계도에서 같은 이미지를 사용합니다. 관계도에는 실제로 만난 NPC만 표시됩니다.</p><button type="button" className="btn primary" onClick={()=>{update({assetsDone:true});setTab('settings');}}>NPC 이미지 완료 · 게임 설정으로 이동 <ChevronRight size={16}/></button></div></div>}
{tab === 'map' && <div className="fields mapEditor">
  {(() => { const maps = game.maps || []; const hasMap = maps.length > 0; const startMap = maps.find(m => m.id === game.startMapId); const startPin = startMap?.pins.find(p => p.id === game.startPinId && p.kind !== 'exit'); const hasStart = !!startPin; const totalPlaces = maps.reduce((n,m)=>n+m.pins.filter(p=>p.kind !== 'exit').length,0); const hasPlaces = totalPlaces > 0; const mapReady = hasMap && hasPlaces && hasStart; return <div className="mapWorkflowStatus" aria-label="맵 제작 진행 상태"><h3>맵 제작 진행 현황</h3><p className="assetHelp">필수 작업을 완료하면 페이지 맨 아래에 다음 단계 버튼이 표시됩니다.</p><div className="mapWorkflowProgress"><span style={{width:`${(Number(hasMap)+Number(hasPlaces&&hasStart))/2*100}%`}}/></div><div className="mapWorkflowItem"><strong>{hasMap?'✓':'○'} 1. 맵 이미지 준비</strong><span>{hasMap?'완료':'작업 필요'} · 기본 제공 또는 이미지 업로드</span></div><div className="mapWorkflowItem"><strong>{hasPlaces&&hasStart?'✓':'○'} 2. 장소 및 시작 위치 지정</strong><span>{hasPlaces&&hasStart?'완료':!hasPlaces?'장소를 1개 이상 추가하세요':'시작 장소를 지정하세요'}</span></div></div>; })()}
  <section className="mapStepSection mapStepImage"><div className="mapStepHeader"><span className="mapStepNumber">01</span><div><h3>1단계 · 맵 이미지 준비 및 선택</h3><p>기본 제공된 4장 중 편집할 맵을 선택하거나 직접 이미지를 업로드하세요.</p></div><span className="mapStepState">{(game.maps||[]).length>0?"✓ 맵 준비 완료":"맵 필요"}</span></div>

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
      {pin.kind !== 'exit' && <button className={`btn ${game.startMapId===m.id && game.startPinId===pin.id?'primary':''}`} type="button" onClick={()=>update({startMapId:m.id,startPinId:pin.id})}>{game.startMapId===m.id && game.startPinId===pin.id ? '★ 현재 게임 시작 위치' : '이 장소를 게임 시작 위치로 지정'}</button>}
      {(pin.kind === 'place' || pin.kind === 'building') && <><label className="field">이 장소·건물에서 발생하는 이벤트<textarea rows={3} value={pin.eventText || ''} placeholder="예: 대장간에 들어오면 대장장이가 무기 거래를 제안한다." onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,eventText:e.target.value}:p)})}/></label><label className="field">이벤트 발동<select value={pin.eventTrigger || 'enter'} onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,eventTrigger:e.target.value as 'enter'|'interact'}:p)})}><option value="enter">도착할 때</option><option value="interact">상호작용할 때</option></select></label><label className="worldCheck"><input type="checkbox" checked={!!pin.eventOnce} onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,eventOnce:e.target.checked}:p)})}/>이벤트 한 번만 발생</label></>}
      {pin.kind === 'exit' && <><label className="field">연결할 맵<select value={pin.targetMapId || ''} onChange={e => changeMap(m.id, { pins: m.pins.map(p => p.id === pin.id ? { ...p, targetMapId: e.target.value, targetPinId: '' } : p) })}><option value="">연결하지 않음</option>{(game.maps || []).filter(x => x.id !== m.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{pin.targetMapId && <label className="field">도착 위치<select value={pin.targetPinId || ''} onChange={e => changeMap(m.id, { pins: m.pins.map(p => p.id === pin.id ? { ...p, targetPinId: e.target.value } : p) })}><option value="">해당 맵의 첫 번째 장소</option>{(game.maps || []).find(x => x.id === pin.targetMapId)?.pins.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}</>}
      {pin.kind === 'exit' && <><label className="worldCheck"><input type="checkbox" checked={pin.bidirectional !== false} onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,bidirectional:e.target.checked}:p)})}/>양방향 이동 허용 (역방향 출입구는 별도로 연결 필요)</label><label className="field">필요 아이템 (선택)<input value={pin.requiredItem || ''} placeholder="예: 고대 열쇠" onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,requiredItem:e.target.value}:p)})}/></label><label className="field">필요 퀘스트 플래그 (선택)<input value={pin.requiredFlag || ''} placeholder="예: 성문 개방" onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,requiredFlag:e.target.value}:p)})}/></label></>}
      <button className="btn" type="button" onClick={() => { changeMap(m.id, { pins: m.pins.filter(p => p.id !== pin.id), links: (m.links || []).filter(l => l.from !== pin.id && l.to !== pin.id) }); setSelectedPinId(null);  }}><Trash2 size={15}/> 위치 삭제</button></div>}
      <div className="mapEditorFooter"><span>위치 {m.pins.length}개 · 출구 {m.pins.filter(p => p.kind === 'exit').length}개</span><button className="btn" type="button" onClick={() => removeMap(m.id)}><Trash2 size={15}/> 이 맵 삭제</button></div>
    </>; })()}
  </section>
  {(() => { const maps = game.maps || []; const start = maps.find(m=>m.id===game.startMapId)?.pins.find(p=>p.id===game.startPinId && p.kind !== 'exit'); return maps.length > 0 && !!start ? <div className="mapCompletion"><p>✓ 맵과 시작 장소가 준비되었습니다. 선택 사항인 장소 이벤트를 확인한 뒤 다음 단계로 이동하세요.</p><button type="button" className="btn primary" onClick={()=>{const latestMaps=game.maps||[];if(!latestMaps.length || !latestMaps.find(m=>m.id===game.startMapId)?.pins.some(p=>p.id===game.startPinId&&p.kind!=='exit'))return;update({mapDone:true});setTab('assets');}}>맵 관리 완료 · NPC 이미지로 이동 <ChevronRight size={16}/></button></div> : null; })()}
  <div className="tip">맵 이미지는 위치·이동용입니다. 테스트 플레이는 거리 기반 이동, 포탈 이동, 도착 이벤트를 지원합니다. 싱글플레이에서는 장소 도착 이벤트·상호작용·1회 제한·포탈 조건이 적용되며 AI GM에게 자동 전달됩니다.</div>
</div>}
{tab === 'settings' && <div className="fields">


  <div className="modeSection"><h3>플레이 방식</h3><p className="assetHelp">게임을 만들 때 싱글 또는 멀티플레이를 지정합니다.</p>
    <div className="modeChoices">
      <button type="button" className={`modeChoice ${game.playMode !== 'multi' ? 'modeSelected' : ''}`} onClick={() => update({ playMode: 'single' })}><strong>싱글플레이</strong><small>혼자서 AI GM과 플레이</small></button>
      <button type="button" className={`modeChoice ${game.playMode === 'multi' ? 'modeSelected' : ''}`} onClick={() => update({ playMode: 'multi' })}><strong>멀티플레이</strong><small>2~6인 협동 게임 설정</small></button>
    </div>
    {game.playMode === 'multi' && <><div className="playerLimits"><label className="field">최소 인원<select value={game.minPlayers || 2} onChange={e => { const n = Number(e.target.value); update({ minPlayers: n, maxPlayers: Math.max(n, game.maxPlayers || 4) }); }}>{[2,3,4,5,6].map(n => <option key={n} value={n}>{n}명</option>)}</select></label><label className="field">최대 인원<select value={game.maxPlayers || 4} onChange={e => { const n = Number(e.target.value); update({ maxPlayers: n, minPlayers: Math.min(n, game.minPlayers || 2) }); }}>{[2,3,4,5,6].map(n => <option key={n} value={n}>{n}명</option>)}</select></label></div><div className="tip">멀티플레이 설정은 저장되지만 실제 방 생성·초대·실시간 동기화 서버는 아직 구현되지 않았습니다. 현재 테스트 플레이는 싱글 방식으로 실행됩니다.</div></>}
  </div>
  <div className="modeSection prologueEditor"><h3>게임 시작 프롤로그</h3><p className="assetHelp">장르별 기본 오프닝이 제공됩니다. AI 생성 없이 제작자가 직접 편집하며, 저장된 내용이 게임 시작 시 그대로 표시됩니다.</p>
    <label className="field">프롤로그 제목<input maxLength={80} value={prologueTitle(game)} onChange={e=>update({prologueTitle:e.target.value})}/></label>
    <label className="field">프롤로그 대표 이미지<div className="prologueImageEditor">{prologueImage(game)?<img src={prologueImage(game)} alt="프롤로그 대표 이미지"/>:<div className="prologueEmptyImage">등록된 이미지 없음</div>}</div><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>8*1024*1024){setNotice('프롤로그 이미지는 8MB 이하로 등록해 주세요.');e.target.value='';return;}const reader=new FileReader();reader.onload=()=>update({prologueImage:String(reader.result||'')});reader.readAsDataURL(file);e.target.value='';}}/></label>
    <div className="prologueControls"><button type="button" className="btn" onClick={()=>update({prologueImage:''})}>이미지 제거</button><button type="button" className="btn" onClick={()=>update({prologueTitle:DEFAULT_PROLOGUES[defaultMapGenre(game)].title,prologue:DEFAULT_PROLOGUES[defaultMapGenre(game)].text,prologueImage:defaultPrologueImage(game)})}><RotateCcw size={15}/> 기본값 복원</button></div>
    <label className="field">프롤로그 본문 <small>{prologueText(game).length.toLocaleString()} / 1,000자</small><textarea rows={11} maxLength={1000} value={prologueText(game)} onChange={e=>update({prologue:e.target.value})} placeholder="게임 시작 장면을 작성하세요."/></label>
    <div className="prologuePreviewPanel"><h4>실제 게임 시작 화면 미리보기</h4><PrologueOpening game={game}/></div>
    <p className="assetHelp">수정 후 프로젝트 저장 버튼을 눌러 저장하세요. 플레이어의 행동과 대사는 프롤로그에서 임의로 확정하지 않는 것을 권장합니다.</p>
  </div>
  <div className="modeSection"><h3>게임 화면 HUD</h3><p className="assetHelp">플레이 화면에 표시할 정보를 선택하세요. 오른쪽에서 바로 확인할 수 있습니다.</p>
    <label className="hudToggle"><input type="checkbox" checked={game.showHpBar !== false} onChange={e => update({ showHpBar: e.target.checked })}/> 체력바 (HP) 표시</label>
    <label className="hudToggle"><input type="checkbox" checked={game.showEquipment !== false} onChange={e => update({ showEquipment: e.target.checked })}/> 인벤토리 표시</label>
    <label className="hudToggle"><input type="checkbox" checked={game.showDice !== false} onChange={e => update({ showDice: e.target.checked })}/> 필요한 판정에서만 주사위 표시</label>
  </div>
  <div className="modeSection characterEditor"><h3>캐릭터 · 정보창 설정</h3><p className="assetHelp">게임별로 정보창 구성과 스탯을 지정합니다. 장비와 소지품은 인벤토리에서 함께 관리합니다. 저장 후 플레이 보드 아래에 반영됩니다.</p>
    <label className="field">게임 유형 프리셋<select value={(game.characterConfig || defaultCharacterConfig()).preset} onChange={e=>update({characterConfig:applyCharacterPreset(game.characterConfig || defaultCharacterConfig(),e.target.value)})}><option value="fantasy">판타지</option><option value="wuxia">무협</option><option value="modern">현대 판타지</option><option value="custom">직접 설정</option></select></label>
    <div className="characterSectionToggles">{([['character','캐릭터 기본 정보'],['stats','능력치'],['inventory','인벤토리'],['status','상태 효과'],['relationships','관계도']] as const).map(([key,label])=><label className="hudToggle" key={key}><input type="checkbox" checked={(game.characterConfig || defaultCharacterConfig()).sections[key] !== false} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,sections:{...c.sections,[key]:e.target.checked}}});}}/>{label}</label>)}</div>
    <div className="characterEditorGrid">{([['initialName','시작 이름'],['initialJob','시작 직업'],['initialRace','시작 종족']] as const).map(([key,label])=><label className="field" key={key}>{label}<input value={(game.characterConfig || defaultCharacterConfig())[key]} onChange={e=>update({characterConfig:{...(game.characterConfig || defaultCharacterConfig()),[key]:e.target.value}})}/></label>)}<label className="field">시작 레벨<input type="number" min="1" value={(game.characterConfig || defaultCharacterConfig()).initialLevel} onChange={e=>update({characterConfig:{...(game.characterConfig || defaultCharacterConfig()),initialLevel:Math.max(1,Number(e.target.value)||1)}})}/></label><label className="field">시작 골드<input type="number" min="0" value={(game.characterConfig || defaultCharacterConfig()).initialGold} onChange={e=>update({characterConfig:{...(game.characterConfig || defaultCharacterConfig()),initialGold:Math.max(0,Number(e.target.value)||0)}})}/></label></div>
    <h4>능력치 · 스탯 항목</h4><div className="characterFieldList">{(game.characterConfig || defaultCharacterConfig()).fields.map(f=><div className="characterFieldEditor" key={f.id}><input aria-label="스탯 이름" value={f.name} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,name:e.target.value}:x)}});}}/><select aria-label="값 종류" value={f.kind} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,kind:e.target.value as InfoField['kind']}:x)}});}}><option value="number">숫자</option><option value="text">텍스트</option><option value="gauge">게이지</option></select><input aria-label="초기치" title="초기치" placeholder="초기치" value={f.initial} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,initial:e.target.value}:x)}});}}/>{(f.kind==='gauge'||f.kind==='number')&&<input aria-label="최대치" title="최대치" placeholder="최대치" type="number" min="1" value={f.max ?? ''} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,max:e.target.value===''?undefined:Math.max(1,Number(e.target.value)||1)}:x)}});}}/>}<label className="characterFieldVisible"><input type="checkbox" checked={f.visible} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,fields:c.fields.map(x=>x.id===f.id?{...x,visible:e.target.checked}:x)}});}}/> 표시</label><button className="btn" type="button" title="스탯 삭제" onClick={()=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.filter(x=>x.id!==f.id)}});}}><Trash2 size={14}/></button></div>)}</div>
    <button className="btn" type="button" onClick={()=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:[...c.fields,{id:makeId(),name:'새 스탯',kind:'number',initial:'0',visible:true}]}});}}><Plus size={15}/> 스탯 추가</button>
    <p className="assetHelp">스탯 초기값은 새 플레이에서 적용됩니다. 기존 플레이 기록의 값은 유지되며 새 항목은 기본값으로 표시됩니다.</p>
  </div>
  <div className="tip">위치와 맵 연결은 맵 관리 탭에서 설정하세요. HUD 설정은 테스트 플레이 화면에도 반영됩니다.</div><button type="button" className="btn primary" disabled={game.finalGoalMode==='progress'&&(game.finalGoalSteps||[]).filter(x=>x.trim()).length<2} onClick={()=>{update({settingsDone:true});setTab('register');}}>게임 설정 완료 · 등록으로 이동 <ChevronRight size={16}/></button>
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
  <div className="previewTop"><h2>{tab === 'profile' ? '게임 미리보기' : tab === 'prompt' ? '프롬프트 미리보기' : tab === 'map' ? '맵 미리보기' : tab === 'settings' ? '게임 설정 미리보기' : '등록 정보 미리보기'}</h2><span>실시간 반영</span></div>
  {tab === 'profile' && <><div className="previewCover">{game.cover ? <img src={game.cover} alt="게임 표지" /> : <div className="previewFallback"><Dices size={65}/><span>CRPG</span></div>}</div><h3>{game.name || '게임 제목'}</h3><p>{game.description || '게임 소개를 입력해 주세요.'}</p><div className="previewTags"><span>CRPG</span><span>{game.playMode === 'multi' ? `멀티 ${game.minPlayers || 2}~${game.maxPlayers || 4}명` : '싱글'}</span></div></>}
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

    {view === 'play' && <main className="playPage"><div className="playHeading"><div><button className="textBack" onClick={() => { setView('edit'); setTab('profile'); }}><ArrowLeft size={16} /> 스튜디오로 돌아가기</button><h1>{game.name}</h1><p>{game.description}</p></div><button className="btn" onClick={newGame} disabled={busy}><RotateCcw size={16} /> 새로하기</button></div><div className="playGrid"><section className="playBoardPanel"><div className="panelHeading"><h2><Dices size={18} /> 게임 보드</h2><span className="softPill">{game.playMode === 'multi' ? `멀티 ${game.minPlayers || 2}~${game.maxPlayers || 4}인 설정` : '싱글'} · D20</span></div><div className="statRow"><span>맵 <b>{(game.maps || []).find(m => m.id === session.mapId)?.name || (game.maps || [])[0]?.name || "없음"}</b></span><span>최근 판정 <b>{session.roll ?? '-'}</b></span></div><CharacterPanel game={game} session={session} portrait={playerBaseImage}/>{(() => { const maps = game.maps || []; const m = maps.find(x => x.id === session.mapId) || maps[0]; const currentPin = m?.pins.find(p => p.id === session.pinId); return m ? <><div className="playMapPicker"><span className="softPill">현재 맵: {m.name}</span><span className="playCurrentLocationPill">● 현재 위치: {currentPin?.name || "미지정"}</span><span className="assetHelp">장소 이동은 오른쪽 AI GM에게 행동을 입력하세요.</span></div><div className="imageBoard playWorldMap"><img src={m.baseImage || m.image} alt={m.name} draggable={false}/>{currentPin && <span className="playLocationHalo" style={{left:`${currentPin.x}%`,top:`${currentPin.y}%`}} aria-hidden="true"/>}{currentPin && <img className="playCharacterSprite" src={playerMarkerSrc(game)} alt="플레이어 현재 위치" draggable={false} style={{left:`${currentPin.x}%`,top:`${currentPin.y}%`}}/>}</div><p className="mapHint">현재 위치: {currentPin?.name || '미지정'} · {session.travel ? `이동 중: ${m.pins.find(p=>p.id===session.travel?.destinationId)?.name || '목적지'} (남은 장면 ${session.travel.remaining})` : '이동할 장소를 글로 입력하세요.'} 도착 이벤트는 자동으로 진행됩니다. 상호작용 이벤트는 행동 입력으로 진행하며 1회 이벤트는 저장됩니다. 출구는 연결된 맵으로 전환합니다.</p></> : <div className="emptyPreview"><ImageIcon size={42}/><span>등록된 맵이 없습니다. AI GM 대화는 계속 사용할 수 있습니다.</span></div>; })()}{game.showHpBar !== false && <div className="playHpBar"><div style={{width:`${Math.max(0,Math.min(100,session.hp/Math.max(1,game.hp)*100))}%`}}/></div>}<div className="boardBottom">{session.pendingCheck && <span className="diceWaitingLabel">판정 대기 중 · 오른쪽 AI GM에서 주사위를 굴려주세요.</span>}<span>자유형 보드 · 격자 없음</span></div></section><section className="playChatPanel"><div className="panelHeading"><h2><Sparkles size={18} /> AI 게임 마스터</h2><span className="softPill">GM</span></div><div className="chatLog storyLog" ref={chatRef}>{session.log.map((entry, i) => { const player = entry.startsWith('플레이어:'); const system = entry.startsWith('시스템:') || entry.startsWith('주사위:'); const event = entry.startsWith('이벤트:'); const prologue = entry.startsWith('프롤로그:'); const content = entry.replace(/^(GM:|플레이어:|시스템:|주사위:|이벤트:|프롤로그:)\s*/, ''); return <div key={i} className={`storyEntry ${player ? 'storyPlayer' : system ? 'storySystem' : event ? 'storyEvent' : 'storyGM'}`}>{player && <span className="storyEntryLabel">나의 행동</span>}{event && <span className="storyEntryLabel">장소 이벤트</span>}{prologue && <span className="storyEntryLabel">프롤로그</span>}{system && <span className="storyEntryLabel">게임 기록</span>}<div className="storyEntryText">{(prologue || event || (!player && !system)) ? (prologue ? <PrologueOpening game={{...game,prologue:content}}/> : <PrologueRichText text={content} game={game}/>) : content}</div></div>; })}{busy && <div className="storyEntry storyGM storyLoading">이야기가 이어지고 있습니다...</div>}</div>{session.pendingCheck && <div className="diceCheckPanel"><div className="diceCheckTop"><strong><Dices size={18}/> {session.pendingCheck.label} 판정</strong><span>DC {session.pendingCheck.dc}</span></div><p>{session.pendingCheck.reason}</p><button type="button" className="btn primary" disabled={busy} onClick={() => void roll()}><Dices size={17}/> D20 굴리기</button></div>}{!session.pendingCheck && !busy && !!session.suggestedActions?.length && <div className="gmChoices"><div className="gmChoicesHeading"><strong>다음 행동을 선택하세요</strong><span>또는 아래에 자유롭게 입력</span></div>{session.suggestedActions.slice(0, 3).map((choice, index) => <button key={`${index}-${choice}`} type="button" className="gmChoiceButton" onClick={() => void sendPlayerAction(choice)}><span className="gmChoiceNumber">{index + 1}</span><span>{choice}</span><ChevronRight size={16}/></button>)}</div>}{session.lastCheck && !session.pendingCheck && <div className="diceCheckResult"><strong>{session.lastCheck.label} · {session.lastCheck.critical || (session.lastCheck.success ? '성공' : '실패')}</strong><span>D20 {session.lastCheck.die} {session.lastCheck.modifier >= 0 ? '+' : '-'} {Math.abs(session.lastCheck.modifier)} = {session.lastCheck.total} / DC {session.lastCheck.dc}</span></div>}<form className="chatForm" onSubmit={e => { e.preventDefault(); void submit(); }}><input id="gm-free-action" value={action} onChange={e => setAction(e.target.value)} placeholder={session.pendingCheck ? "주사위 판정이 끝난 후 행동할 수 있습니다." : "어떤 행동을 하시겠습니까?"} disabled={busy || !!session.pendingCheck} /><button className="btn primary" disabled={busy || !!session.pendingCheck || !action.trim()} type="submit"><Send size={16} /> 전송</button></form><p className="chatHint">원하는 행동을 자유롭게 입력하거나 제안된 선택지를 고르세요. 판정이 필요한 경우에만 주사위가 나타납니다.</p></section></div></main>}
    {notice && <div className="toast"><Check size={16} /> {notice}</div>}
  </div>;
}
