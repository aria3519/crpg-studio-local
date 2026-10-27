import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { POWER_TIERS, MAX_POWER } from '../../_lib/progression';
import { alignEngineRules } from '../../_lib/engine-rules';

export const runtime = 'nodejs';
// The model occasionally slips a word from another language into Korean (e.g. Russian "слух" for 소문).
const FOREIGN_SCRIPT = /[\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\u3040-\u30FF]/;
export const maxDuration = 60;

const VOICE_LENGTH = 200;
// Words too generic to mean two choices share a target.
const OBJECT_STOP = /^(정보|주변|상황|이야기|사람|사람들|길|것|무기|소문|단서|시간|자리|기회|도움|흔적|대화)$/;
// Built-in NPC character sheets (personality, voice, likes/dislikes) live outside the 7000-char game prompt and are attached per NPC on stage.
type NpcSheet = { identity?: string; personality?: string; speech?: string; likes?: string[]; dislikes?: string[]; firstAttitude?: string; relations?: string[]; asCompanion?: string; power?: number };
const sheetCache = new Map<string, Record<string, NpcSheet>>();
function npcSheets(genre: string): Record<string, NpcSheet> {
  if (!['fantasy', 'wuxia', 'modern'].includes(genre)) return {};
  if (!sheetCache.has(genre)) {
    try { sheetCache.set(genre, JSON.parse(readFileSync(path.join(process.cwd(), 'app', 'api', 'gm', '_data', 'npc-sheets', `${genre}.json`), 'utf8'))); }
    catch { return {}; }
  }
  return sheetCache.get(genre) || {};
}
// One small request decides each new NPC's speech register and habits; the result is stored and reused for the whole playthrough.
async function assignVoices(npcs: { name: string; profile: string }[], genre: string): Promise<{ name: string; style: string }[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.6, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: [
            '한국어 CRPG의 NPC마다 게임 내내 고정될 말투를 정합니다.',
            'style 형식: "어체: <하십시오체|해요체|하오체|하게체|해체|해라체 중 하나만> | 어미: <자주 쓰는 어미 2~3개> | 버릇: <말버릇·자주 쓰는 표현> | 예: <그 인물다운 짧은 대사 하나>" 120자 이내.',
            '성별·나이·신분·성격·장르에 맞추고, 인물끼리 서로 구분되게 하세요. 여성 인물은 profile에 근거가 없으면 하오체·하게체를 쓰지 마세요. 판타지·현대 판타지의 젊은 인물은 해요체·해체가 자연스럽고, 하오체는 무협이나 나이 든 권위자에게만 어울립니다.',
            '{"voices":[{"name":"정확한 이름","style":"..."}]} JSON만 반환하세요.',
          ].join('\n') },
          { role: 'user', content: JSON.stringify({ genre: genre.slice(0, 300), npcs }) },
        ] }),
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    const voices = JSON.parse(result?.choices?.[0]?.message?.content || '{}')?.voices;
    return Array.isArray(voices) ? voices.filter((v: { name?: unknown; style?: unknown }) => typeof v?.name === 'string' && typeof v?.style === 'string' && npcs.some(n => n.name === v.name) && v.style.trim() && !FOREIGN_SCRIPT.test(v.style))
      .map((v: { name: string; style: string }) => ({ name: v.name, style: v.style.trim().slice(0, VOICE_LENGTH) })) : [];
  } catch { return []; }
}
// Second, narrow request for a talk reply that came back empty or as a bare "…".
// Repeats are judged per sentence: same text, one containing the other, or mostly the same character pairs.
const squash = (t: string) => t.replace(/[\s.,!?…~'"“”‘’「」『』\-]/g, '');
const pairs = (t: string) => new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)));
const repeats = (a: string, b: string) => {
  const x = squash(a), y = squash(b);
  if (x.length < 4 || y.length < 4) return x === y && x.length > 0;
  if (x === y || (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x)))) return true;
  const p = pairs(x), q = pairs(y); let both = 0; for (const k of p) if (q.has(k)) both++;
  return both / Math.max(1, Math.min(p.size, q.size)) >= 0.7;
};
const sentences = (t: string) => t.split(/(?<=[.!?…])\s+/).map(x => x.trim()).filter(Boolean);
// The player announcing what they'll do next ("직접 숲을 살펴봐야겠어", "처리하고 올게") closes the conversation.
const DECIDED = /(다녀올|다녀오겠|갔다 올|가 ?볼게|가 ?보겠|가야겠|가겠|가 ?봐야겠|살펴봐야겠|살펴보겠|알아봐야겠|알아보겠|조사해야겠|조사하겠|처리하고 올|해결하고 올|맡을게|맡겠|하겠습니다|해 ?볼게|떠나겠|떠날게|출발하|그럼 이만|이만 가|나중에 봐|또 올게)/;
async function retryTalkLine(partner: string, body: { action?: unknown }, history: string[], state: { npcProfiles?: unknown }, alreadySaid: string[] = []): Promise<string> {
  try {
    const profile = Array.isArray(state.npcProfiles) ? state.npcProfiles.find((p: { name?: unknown }) => p?.name === partner) : null;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.8, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `한국어 CRPG 메신저식 대화입니다. ${partner}가 플레이어의 말에 실제로 하는 대답만 씁니다. 지문 없이 대사만, 짧은 채팅 메시지 1~3개를 줄바꿈(\\n)으로 구분하세요. 말줄임표만 있는 대답은 금지이며 반드시 플레이어의 말에 구체적으로 반응하세요. alreadySaid에 있는 말과 같거나 비슷한 문장은 절대 다시 쓰지 말고, 아직 하지 않은 새 정보·감정·제안만 말하세요. 인물의 성격·말투·호감도 단계를 지키세요. {"line":"대사"} JSON만 반환하세요.` },
          { role: 'user', content: JSON.stringify({ npc: profile || partner, recentHistory: history.slice(-10), alreadySaid, playerSaid: String(body.action || '').slice(0, 1000) }) },
        ] }),
      cache: 'no-store', signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    const line = JSON.parse(result?.choices?.[0]?.message?.content || '{}')?.line;
    return typeof line === 'string' && line.replace(/[\s.…!?~ㅡ\-]/g, '') && !FOREIGN_SCRIPT.test(line) ? line.trim() : '';
  } catch { return ''; }
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY 환경변수가 없습니다.' }, { status: 500 });
  try {
    const body = await request.json();
    if (typeof body.action !== 'string' || !body.action.trim() || body.action.length > 4000) {
      return NextResponse.json({ error: '행동 입력이 올바르지 않습니다.' }, { status: 400 });
    }
    const state = body.state && typeof body.state === 'object' ? body.state : {};
    // Explicitly separate current mutable state from immutable event history.
    const rawFlags=Array.isArray(state.flags)?state.flags.filter((v:unknown):v is string=>typeof v==='string'):[];
    const stateKeys=new Set(['막','소속','경지','재물','현재위치','현재목표']);
    const latestState:Record<string,string>={};
    const eventFlags:string[]=[];
    for(const flag of rawFlags){const pos=flag.indexOf(':');const key=pos>0?flag.slice(0,pos).trim():'';if(stateKeys.has(key))latestState[key]=flag.slice(pos+1).trim();else if(!eventFlags.includes(flag))eventFlags.push(flag);}
    const explicitGameState={currentMapId:state.currentMapId||'',locationName:state.locationName||'',quests:Array.isArray(state.quests)?state.quests:[],hp:state.hp,inventory:state.inventory||[],currentValues:latestState,historyFlags:eventFlags.slice(-100)};
    const history = Array.isArray(body.history) ? body.history.filter((x: unknown) => typeof x === 'string').slice(-30).map((x: string) => x.slice(0, 1500)) : [];
    // Rolling summary of everything older than recentHistory (built by /api/gm/memory).
    const storySoFar = typeof body.memory === 'string' ? body.memory.slice(0, 4000) : '';
    // A repeatable variety cue, never an automatic event or a substitute for registered map data.
    const genreText=String(body.prompt||'').slice(0,1800);
    const eventPool=genreText.includes('구파일방')||genreText.includes('무협')
      ? ['문파 간 예법과 체면','표국의 운송 계약','객잔의 소문과 오해','세가의 가문 이해관계','수련과 사제 갈등','상단의 물가·통행권','의술과 약재','도적과 민간인 피해']
      : genreText.includes('게이트')||genreText.includes('헌터')
      ? ['구조와 민간인 안전','길드 계약','협회 심사','마석 유통','던전 탐사','언론과 사회적 책임']
      : ['길드 의뢰','영지의 생계','마법 연구','종족 간 협상','탐험과 구조','상단 거래'];
    const turnIndex=history.length+rawFlags.length;
    const varietyCue=eventPool[(turnIndex*7+String(body.action).length)%eventPool.length];
    // Talk and combat narrow the GM to one partner; combat numbers are computed by the client.
    const mode = body.mode === 'talk' || body.mode === 'combat' ? body.mode : '';
    const partner = String(body.npc || '').slice(0, 30);
    const talkTurns = Math.max(0, Math.min(99, Math.round(Number(body.talkTurns) || 0)));
    const combat = mode === 'combat' && body.combat && typeof body.combat === 'object' ? body.combat : null;
    const itemUse = typeof combat?.itemUse === 'string' ? combat.itemUse.slice(0, 80) : '';
    // Several recent GM turns that only talk about getting ready mean the story has stalled; the next scene is told to act.
    const STALL = /준비|장비|채비|대비|갖춰|갖추|때가 아니|더 알아봐|정보가 더 필요|서두르지/;
    const recentGm = history.filter((h: string) => /^GM:|^[^:]{1,30}: "/.test(h)).slice(-6);
    const stalled = recentGm.length >= 3 && recentGm.filter((h: string) => STALL.test(h)).length >= 3;
    const pacingRules = [
      '진행 원칙: 매 장면은 이야기를 실제로 한 걸음 나아가게 해야 합니다. 새 단서·정보 공개, 인물의 결정이나 행동, 사건 발생, 상황 변화, 거래·약속 성사 중 최소 하나가 이번 장면에서 일어나야 합니다.',
      '"준비가 필요하다", "장비를 갖춰야 한다", "아직 때가 아니다", "더 알아봐야 한다"처럼 진행을 미루는 말로 장면을 끝내지 마세요. 그런 조건은 같은 일에 한 번만 말하고, 플레이어가 준비 행동을 한 번 했거나 그대로 하겠다고 하면 바로 실행해 결과(성공·실패·대가)를 보여 주세요. 준비 부족은 막는 이유가 아니라 위험·대가·판정 난이도로 반영하세요.',
      'NPC는 플레이어가 물은 것에 구체적으로 답합니다(누가·어디서·언제·어떻게). 둘러대거나 다음에 알려 주겠다고 미루는 건 그 인물이 감추는 비밀이거나 호감도가 낮을 때만입니다.',
      'choices에 준비·장비 구하기·정보 더 모으기 같은 준비성 행동만 늘어놓지 마세요. 최소 2개는 지금 바로 사건에 뛰어들거나 인물과 담판을 짓는 행동이어야 합니다.',
      ...(stalled ? ['경고: 최근 장면들이 준비·장비 이야기만 반복하며 제자리걸음 중입니다. 이번 장면에서는 준비 이야기를 하지 말고, 사건을 실제로 터뜨리거나 플레이어의 시도를 실행해 결과를 보여 주세요. 선택지에도 준비 행동을 넣지 마세요.'] : []),
    ];
    const modeRules = mode === 'talk' ? [
      `지금은 플레이어가 ${partner}와(과) 직접 대화하는 대화 모드입니다. playerAction은 플레이어가 ${partner}에게 한 말입니다. 대화는 메신저 채팅처럼 대사만 오갑니다. 상황 설명·지문·행동 묘사는 쓰지 말고 text는 반드시 빈 문자열입니다. line에는 ${partner}가 하는 말만 따옴표·이름표 없이 쓰세요. 채팅 메시지처럼 짧게 1~3개로 나누고 메시지 사이는 줄바꿈(\\n)으로 구분하세요. 감정과 태도는 지문 대신 말투·어휘로 드러내세요. "..."이나 "…"만 있는 대답은 금지입니다. 과묵하거나 적대적인 인물도 짧더라도 실제 말로 반응해야 하며(예: "할 말 없어. 가."), 플레이어가 물은 내용에 답하거나 답하지 않는 이유를 말하세요. 표정이나 몸짓은 화면 연출용으로 gesture에 20자 안팎의 짧은 구절로만 쓰세요(예: 잠시 머뭇거리며). JSON에 line 필드를 꼭 포함하세요. 플레이어의 대사나 행동을 대신 쓰지 마세요. ${partner}의 성격·목표·비밀·관계를 지키고, 아직 밝힐 때가 아닌 비밀은 숨기거나 둘러대세요.`,
      `npcProfiles의 remembers는 각 인물이 플레이어에 대해 기억하는 내용(이전 대화의 요약)입니다. 그 인물이 등장하면 대화든 일반 장면이든 이 기억과 어긋나지 않게 행동하세요. recentHistory에 ${partner}가 이미 한 말은 다시 하지 마세요. 같은 경고·같은 소식을 표현만 바꿔 되풀이하는 것도 반복입니다. 매 대답은 아직 하지 않은 말이어야 합니다. 플레이어가 무엇을 하겠다고 정하면(가 보겠다, 처리하고 오겠다 등) 그 대답은 짧은 작별 한마디로 끝내세요. withThisNpc는 지금까지 플레이어와 ${partner} 사이에 있었던 일(이전 대화·약속·도움·싸움·거래)의 기록이고, storySoFar의 [인물 메모]와 [약속·거래·빚]도 함께 참고하세요. ${partner}는 그 일을 기억하는 사람처럼 말해야 합니다: 이미 나눈 이야기를 처음 듣는 척하거나 같은 설명을 반복하지 말고, 지난 약속·빚·도움·상처를 자연스럽게 언급하며, 플레이어가 이룬 일(퀘스트 완료, 명성)을 들었다면 그에 맞게 대하세요.`,
      `대화 모드에서 choices에는 플레이어가 ${partner}에게 실제로 입 밖에 내는 말 그대로(구어체 직접 화법) 대사 3개를 따옴표 없이 넣으세요. 세 대사는 역할이 완전히 달라야 합니다: 1번 지금 화제를 더 깊이 파고드는 말, 2번 화제를 돌리거나 대화를 정리·마무리하는 말(다른 부탁, 작별, 개인적인 이야기), 3번 판을 흔드는 대담한 말(도발, 협박, 비밀을 안다고 떠보기, 파격적인 제안) — 상대가 화낼 수도 크게 넘어올 수도 있는 말. 셋 다 질문이거나 셋 다 같은 내용을 다르게 묻는 말이면 안 됩니다. '~라고 한다', '~을 묻는다', '~을 부탁한다' 같은 행동 서술은 금지입니다. 예: (X) 석관과 침몰선 의뢰에 대해 자세히 알려 달라고 한다 → (O) 석관이랑 침몰선 의뢰, 좀 더 자세히 알려 줄 수 있어요? playerAction이 이런 행동 서술이면 그 의도를 플레이어가 실제로 하는 말로 바꿔 playerLine에 넣고, 이미 대사이거나 다가가 말을 거는 행동뿐이면 playerLine은 빈 문자열입니다. check는 null, moveToPinId는 빈 문자열입니다. 관계나 호감도가 실제로 변했다면 relationshipUpdates에 반영하세요.`,
      `플레이어가 다음에 할 일이 정해지면(의뢰를 받거나 거절함, 갈 곳·만날 사람·건넬 물건이 정해짐, 약속이나 거래가 맺어짐) 더 끌지 말고 그 대답에서 바로 한두 마디로 마무리하고 endTalk:true를 반환하세요. 그러면 게임이 곧장 다음 장면으로 넘어갑니다. 플레이어가 대화 중에 자리를 뜨거나 다른 곳으로 가는 등 대화가 아닌 행동을 하면, line은 빈 문자열로 두고 text에 그 행동을 짧게 서술한 뒤 endTalk:true를 반환하세요. 그 서술을 NPC의 말처럼 쓰지 마세요. 대화는 짧게 끝납니다. NPC는 매 대답마다 새 정보·결정·조건 중 하나를 꼭 내놓고, 같은 이야기를 반복하거나 질문으로 되묻기만 하며 시간을 끌지 마세요. 대화에는 끝이 있습니다. 다음 중 하나가 되면 ${partner}가 자연스럽게 마무리하는 말을 하고 endTalk:true를 반환하세요: 의뢰·퀘스트를 맡기거나 플레이어가 수락·거절함, 거래·약속이 성사되거나 결렬됨, 플레이어가 물은 것을 다 들어 더 나눌 이야기가 없음, ${partner}가 더 말하기 싫어하거나(반감·적대) 볼일이 있어 자리를 떠야 함, 플레이어가 작별 인사를 함. 할 말이 없는데 같은 이야기를 되풀이하거나 "더 궁금한 게 있나요?"로 대화를 억지로 이어 가지 마세요. endTalk:true일 때 choices는 빈 배열입니다. 지금까지 플레이어가 이 대화에서 한 말은 ${talkTurns}번입니다.${talkTurns >= 5 ? ` 이번이 마지막 대답입니다. 반드시 마무리하는 말을 하고 endTalk:true를 반환하세요.` : talkTurns >= 3 ? ` 대화가 길어지고 있습니다. 새로 줄 정보나 결정이 없다면 이번 대답에서 정리하고 endTalk:true를 반환하세요.` : ''}`,
    ] : mode === 'combat' ? [
      combat?.monster ? `상대 ${partner}는 대화가 통하지 않는 적대 존재입니다(${String(combat.foeDesc || '').slice(0, 120)}). 사람처럼 말하게 하지 말고 행동·소리·기세로만 묘사하며, relationshipUpdates·presentNpcs에 절대 넣지 마세요.` : '',
      `지금은 플레이어와 ${partner}의 턴제 전투 중입니다. 명중·피해·HP는 게임 코드가 이미 계산했고 playerAction에 적혀 있습니다. 그 결과를 절대 바꾸지 말고 2~4문장으로 생생하게 묘사하세요. check는 null, choices는 빈 배열, moveToPinId는 빈 문자열입니다.`,
      itemUse ? `이번 라운드에 플레이어가 "${itemUse}"을(를) 사용했습니다. 아이템 효과로 HP가 변하면 hpDelta에, 소모되면 removeItems에 정확한 이름으로 반영하세요.` : 'hpDelta는 반드시 0입니다. 피해는 코드가 이미 반영했습니다.',
      Number(combat?.round) === 0 ? `전투가 막 시작됐습니다. 전투 시작 장면을 묘사하고 ${partner}의 전투력 등급을 enemy 객체 {"power":1~10}로 반환하세요. 등급 기준: ${Object.entries(POWER_TIERS).map(([k, v]) => `${k}=${v.label}`).join(', ')}. 겉모습이 아니라 profile·sheet에 드러난 실제 경력과 정체(전직 용병, 숨은 고수 등)로 판단하세요. npcProfiles의 sheet에 power가 있으면 그 값이 확정이며, 묘사도 그 강함에 맞추세요(등급이 낮은 인물이 압도하거나 높은 인물이 맥없이 밀리는 묘사 금지). 마을 사람·상인·학자 같은 비전투원은 1~2, 마왕이나 신에 가까운 존재만 9~10입니다.` : '',
    ].filter(Boolean) : [];
    // Test commands from the creator bypass causality so features can be exercised directly.
    // A reroll only redraws the current scene's choices; nothing in the story moves.
    const previousChoices = Array.isArray(body.previousChoices) ? body.previousChoices.filter((v: unknown): v is string => typeof v === 'string').slice(0, 4) : [];
    const rerollRules = body.reroll === true && !mode ? [
      '이번 요청은 선택지 다시 뽑기입니다. 장면을 진행하지 말고 상태도 바꾸지 마세요. text는 빈 문자열, 변경 필드는 모두 비우고, 최근 기록의 현재 장면에 맞는 새 선택지 4개만 choices에 넣으세요(4번은 특이한 행동).',
      '다음 기존 선택지와 같거나 비슷한 행동은 피하세요: ' + JSON.stringify(previousChoices),
    ] : [];
    const debugRules = body.debug === true && !mode ? [
      '지금 playerAction은 제작자의 테스트 명령입니다. 세계관의 인과·확률·조건·판정을 모두 무시하고 적힌 일이 그대로 즉시 일어난 것으로 처리하세요. 거절하거나 조건을 요구하지 마세요.',
      '명령에 맞게 상태 필드를 직접 바꾸세요: 아이템은 addItems/removeItems, HP는 hpDelta, 기록은 addFlags, 인물 등장은 presentNpcs, 몬스터·적대 무리 등장은 ambush에 currentState.monsters의 정확한 이름(가장 가까운 것), 관계는 relationshipUpdates, 레벨 변경은 setLevel(1~100 숫자), 현재 맵 안의 장소 이동은 currentState.locations의 정확한 id를 moveToPinId로 반환합니다. check는 null입니다.',
    ] : [];
    // Voices are fixed before the scene is written: an NPC on stage without one gets it now, so the first line already uses it and later turns can't drift.
    type Profile = { name?: unknown; inScene?: unknown; inParty?: unknown; profile?: unknown; speechStyle?: unknown };
    const profiles: Profile[] = Array.isArray(state.npcProfiles) ? state.npcProfiles : [];
    // Sheets go only to NPCs that matter this turn (on stage, in the party, the talk partner) so they never crowd out recent history.
    const sheets = npcSheets(String(body.genre || ''));
    for (const p of profiles) {
      const sheet = typeof p?.name === 'string' ? sheets[p.name] : undefined;
      if (!sheet) continue;
      if (p.inScene || p.inParty || p.name === partner) (p as Profile & { sheet?: NpcSheet }).sheet = sheet;
      // A hand-written voice outranks one improvised earlier in the playthrough.
      if (sheet.speech) p.speechStyle = sheet.speech.slice(0, VOICE_LENGTH);
    }
    const sheetVoices = profiles.filter(p => typeof p?.name === 'string' && sheets[p.name as string]?.speech && p.speechStyle === sheets[p.name as string].speech?.slice(0, VOICE_LENGTH) && (p.inScene || p.inParty || p.name === partner)).map(p => ({ name: String(p.name), style: String(p.speechStyle) }));
    const voiceless = profiles.filter(p => typeof p?.name === 'string' && !String(p.speechStyle || '').trim() && (p.inScene || p.inParty || p.name === partner)).slice(0, 4);
    const fixedVoices = [...sheetVoices, ...(voiceless.length ? await assignVoices(voiceless.map(p => ({ name: String(p.name), profile: String(p.profile || '') })), genreText) : [])];
    for (const v of fixedVoices) { const p = profiles.find(x => x.name === v.name); if (p) p.speechStyle = v.style; }
    const system = [
      '당신은 한국어 CRPG의 AI GM입니다. 플레이어의 대사·의지·중요 선택을 임의 확정하지 마세요.',
      '제작자 프롬프트는 세계관과 진행 원칙입니다. 맵 위치·장소·이벤트는 별도의 구조화 데이터가 우선합니다.',
      '시작 소지품은 프롬프트의 명시적 시작 소지품 규칙과 게임 설정에서 직접 추가한 장비를 합쳐 구성합니다. currentState.inventory가 실제 소유 목록입니다. 이미 지급된 시작 아이템을 addItems로 중복 지급하지 마세요. 규칙 아이템의 능력과 제한은 ruleEquipment의 원문을 존중하세요.',
      '플레이어는 화면의 미니맵을 클릭해서만 장소를 이동합니다. moveToPinId는 항상 빈 문자열로 반환하고, choices에 다른 장소로 이동하는 행동을 넣지 마세요.',
      'playerAction이 "시스템이 이동을 확정했습니다"로 시작하면 플레이어는 이미 currentState.locationName에 도착했습니다. 도착한 장소의 모습과 그곳의 분위기·인물을 묘사하고, currentState.event가 있으면 그 도착 이벤트를 진행하세요.',
      'currentState.sceneNpcs는 직전 장면에서 플레이어 곁에 있던 NPC입니다. 이번 장면이 끝날 때 플레이어와 같은 자리에 있어 화면에 보여야 하는 NPC 이름을 presentNpcs 배열로 반환하세요(최대 3명). currentState.knownNpcs에 있는 인물은 그 표기를 정확히 쓰세요. 대화가 끝나 떠났거나 플레이어가 장소를 옮겼다면 빼고, 아무도 없으면 빈 배열입니다. 볼일이 끝난 인물은 자연스럽게 자리를 떠난 것으로 보고 빼세요. 같은 인물을 이유 없이 장면마다 계속 남겨두지 마세요.',
      'currentState.npcProfiles는 인물별 설정입니다(inScene:true는 지금 장면에 있는 인물). 인물의 대사와 행동은 profile의 성별·나이·신분·성격·목표에 맞추세요. 과묵한 인물은 짧게, 수줍은 인물은 머뭇거리며, 호탕한 인물은 시원시원하게 말하는 식으로 성격이 말과 행동에 드러나야 하고, 모든 인물이 같은 말투로 말하면 안 됩니다.',
      'npcProfiles에 sheet가 있는 인물은 그 설정집을 따르세요: personality(성격의 겉과 속), likes/dislikes(플레이어 행동이 likes에 맞으면 호감도를 올리고 dislikes에 걸리면 깎으며 그 인물이 실제로 반응), firstAttitude(첫 만남 태도), relations(다른 인물에 대한 태도와 언급), asCompanion(동료일 때의 모습과 실망하는 지점). 설정집 내용을 대사로 줄줄 설명하지 말고 행동과 반응으로 보여 주세요.',
      'speechStyle은 그 인물의 고정 말투입니다. "어체"에 적힌 한 가지 어체로만 말하고, 한 대답 안에서도 여러 턴에 걸쳐서도 절대 다른 어체를 섞지 마세요(예: 해요체 인물이 "~하오", "~소"를 쓰거나 하오체 인물이 "~요"를 쓰는 것 금지). recentHistory에 그 인물이 했던 말이 있으면 그 어미·말버릇을 이어 가세요. 이 규칙은 대화 모드뿐 아니라 일반 서술 속 대사에도 똑같이 적용됩니다. 직원·행인처럼 npcProfiles에 없는 이름 없는 인물도 한 장면 안에서는 처음 쓴 어체를 유지하세요. speechStyle이 빈 인물이 이번 응답에서 처음 말을 하면 profile에 어울리는 말투를 정해 npcVoices에 {"name":"정확한 이름","style":"어체: 해요체 | 어미: ~요, ~죠 | 버릇: ... | 예: ..."}로 반환하고 그 말투로 말하게 하세요(예: 수줍은 19세 여성 견습생 → "조심스러운 존댓말, ~요 어미, 말끝을 자주 흐림"). 여성 인물은 profile에 거칠다·호탕하다 같은 근거가 없는 한 "~하게", "~일세", "~다, 이놈", "크하하" 같은 중년 남성 어투나 군대식 말투를 쓰지 마세요. 나이·신분이 높은 여성은 "~하오/~구려"보다 품위 있는 "~하지요/~하세요/~란다" 같은 말투가 자연스럽습니다.',
      'currentState.reputation은 세상이 플레이어를 아는 명성 점수(시작 0, 상한 없음)이고 reputationRank는 그 등급입니다. 등급 기준: 무명 0~99, 신참 100~499, 알려진 자 500~1,999, 유명인 2,000~4,999, 영웅 5,000~14,999, 전설 15,000 이상 / 수상한 자 -100 이하, 악명 높음 -1,000 이하, 공포의 대상 -5,000 이하. 사람들이 보거나 소문이 날 만한 일을 했을 때만 reputationDelta로 바꾸세요. 규모 기준: 동네 사람들이 알 만한 작은 선행·말썽 ±10~50, 이름 있는 인물을 돕거나 공개 결투에서 이김 ±50~200, 마을·세력 단위의 공적(마물 무리 토벌, 납치된 사람 구출, 큰 음모 폭로) ±300~1,000, 도시나 나라 전체가 아는 위업(재앙을 막음, 전설적 괴물 처치, 왕국의 운명을 바꿈) ±2,000~5,000. 의뢰·퀘스트 완료 자체의 기본 명성(+150)은 게임 코드가 주므로, 그 의뢰가 특히 큰 공적이었을 때만 그 차이만큼 더 주세요. 아무도 모르는 일이나 평범한 행동은 0입니다. NPC들은 플레이어의 명성 등급을 알고 첫 태도와 대우에 반영합니다(신참은 반신반의, 유명인 이상은 존중·경계·부탁, 악명은 공포·적대·문전박대).',
      'currentState.level과 xp는 플레이어의 성장 단계입니다. 전투 승리와 퀘스트 완료 경험치는 게임 코드가 자동으로 줍니다. 그 밖에 위험을 무릅쓴 탐험, 어려운 판정 성공, 중요한 비밀 해명, 큰 위기 극복처럼 실제로 성장할 만한 경험을 했을 때만 xpGain으로 경험치를 주세요: 작은 성취 10~40, 의미 있는 성취 50~200, 큰 성취 300~1,000. 평범한 이동·대화·거래는 0입니다. 플레이어의 레벨이 오를수록 그에 걸맞은 강한 적과 큰 사건을 내되, 약한 상대(마을 사람 등)를 갑자기 강하게 만들지는 마세요.',
      'currentState.trainableStats는 플레이어의 성장형 능력치입니다. 이번 playerAction이 실제로 어떤 능력치를 단련했다면 그 id를 trained 배열에 최대 2개 넣으세요(예: 마법서 연구·주문 연습→지능, 운기조식→내공, 잠입·추격·곡예→민첩, 무거운 짐 나르기·힘겨루기→근력, 설득·협상→매력류). 레벨이 오를 때 많이 단련한 능력치가 더 크게 오릅니다. 평범한 이동·잡담·구경은 빈 배열입니다. 전투와 주사위 판정은 게임 코드가 따로 반영하므로 넣지 마세요.',
      '제작자 프롬프트의 메인 사건은 막 순서대로만 드러납니다. 아직 시작되지 않은 막의 사건, 그 막에서야 밝혀지는 물건·정체·진실(예: 나중 막에서 발견될 유물), [GM] 표시 비밀은 플레이어가 그 단계에 이르기 전까지 서술·선택지·NPC 대사·퀘스트 어디에도 언급하지 마세요. 진행 정도는 recentHistory·storySoFar·historyFlags의 대사건 기록으로 판단합니다.',
      '서술에서 플레이어에게 다음에 할 일을 조언하거나 정리해 주지 마세요("~하는 것도 좋겠다", "그 뒤에는 ~로 이동해 ~를 추적할 수 있다" 금지). 장면만 보여 주고 판단은 선택지로 맡기세요.',
      '이름 있는 인물은 currentState.npcProfiles나 currentState.knownNpcs에 있는 사람만 등장시키세요. 목록에 없는 새 인물에게 이름(예: 잭, 한스)을 붙여 만들어 내지 마세요. 장면에 필요한 단역은 "부두의 늙은 선원", "경비병"처럼 이름 없이 역할로만 묘사하고, presentNpcs·relationshipUpdates·의뢰인(giver)에 넣지 마세요. 의뢰나 중요한 정보는 가능하면 목록의 인물을 통해 주세요.',
      'currentState.monsters는 이 세계관에 존재하는 적대 몬스터·적대 무리 목록입니다. 몬스터는 처음부터 사람과 적대이며 NPC가 아닙니다: presentNpcs와 relationshipUpdates에 넣지 말고 대화 상대로 만들지 마세요. 목록에 없는 몬스터를 지어내거나 다른 세계관의 존재(무협에 고블린·드래곤, 판타지에 강시 등)를 등장시키지 마세요. 이야기상 습격이 자연스러울 때(위험한 곳에서 방심, 추적당함, 함정, 사건의 결과)만 ambush에 목록의 정확한 이름 하나를 넣으세요. 그러면 게임 코드가 곧바로 전투를 시작하니 서술은 습격 직전에서 멈추세요. boss:true인 존재는 메인 사건의 클라이맥스에서만 씁니다. 평범한 장면은 ambush를 빈 문자열로 두세요.',
      'currentState.party는 플레이어와 함께 다니는 동료 NPC입니다(npcProfiles에서 inParty:true). 동료는 장면을 옮겨도 늘 곁에 있으므로 presentNpcs에는 넣지 마세요. 서술에서 동료가 자기 성격과 말투로 가끔 한마디 거들거나 의견을 내고, 자기 목표·가치관에 반하는 플레이어 행동에는 반대하거나 실망하게 하세요(필요하면 relationshipUpdates로 호감도 반영). 전투에서는 동료도 함께 싸웁니다. 동료 합류·이탈은 게임 코드가 처리하니 서술로 동료를 새로 합류시키거나 떠나보내지 마세요.',
      'currentState.currentInteractionEvent가 존재하고 플레이어가 그 장소의 인물/물체와 상호작용하면 그 내용을 참고하세요.',
      '현재 장소 이벤트를 충실히 진행하세요. 조건 없는 보상, 아이템, HP 변경은 함부로 만들지 마세요.',
      '아이템은 인벤토리에 있는 정확한 이름으로만 소비하세요. 필요시 addItems, removeItems, addFlags, hpDelta를 반환하세요.',
      'hpDelta는 이번 행동으로 변한 HP 양(회복 양수, 피해 음수)입니다. 불필요하면 0입니다. HP가 0이 되면 플레이어는 사망하고 게임이 끝납니다(구출·기적 없음, 제작자 프롬프트의 사망 완화 규칙보다 우선). 함정·추락·독처럼 전투 밖 피해로 HP를 0까지 깎는 것은 정말 살아날 수 없는 상황에서만 하고, 그렇지 않으면 빈사(HP 1)에서 멈추세요.',
      '현재 상태는 explicitGameState.currentValues가 우선이며 historyFlags는 이미 발생한 사실의 기록이다. 경지·소속·막·재물 같은 현재 값은 이전 값과 동시에 적용하지 않는다. addFlags에는 현재 값 갱신과 사건 기록을 명확히 구분해 반환한다.',
      '게임 규칙이 불명확하면 보수적으로 판정하고 선택권을 남겨두세요.',
      '장면 다양성 참고 소재: '+varietyCue+'. 현재 행동과 등록된 맵·NPC·사건에 자연스럽게 맞을 때만 활용한다. 매 턴 강제 사건을 발생시키지 않고, 새 NPC·장소·보상·사건 결과를 근거 없이 확정하지 않는다. 기존 메인 사건을 반복하지 않고 일상·관계·생계·탐색의 리듬을 유지한다.',
      'D20은 성공이 불확실하고 실패에 의미가 있는 행동에만 요청합니다. 일반 이동, 평범한 대화, 정가 거래, 일상 관찰에는 요청하지 않습니다.',
      '판정이 필요하면 text에 판정 이유를 설명하고 check에 {ability,label,dc,reason}을 반환하세요. ability는 currentState.characterValues에 존재하는 숫자형 능력치 ID 중 하나여야 합니다. 판정 요청 단계에서는 성공·실패·피해·보상·이동을 확정하지 말고 변경 필드를 비우세요.',
      'diceResult가 제공되면 이미 확정된 판정입니다. 같은 행동에 주사위를 다시 요청하지 말고 check:null을 반환하세요. 성공/실패는 diceResult.success를 반드시 따르고 그 결과로 이어지는 상황을 묘사하세요.',
      '판정이 필요하지 않으면 check:null을 반환하세요. 하나의 행동에 불필요한 반복 판정을 요구하지 마세요.',
      '각 장면이 끝날 때 플레이어가 고를 행동 4가지를 choices 문자열 배열로 제시하세요. 플레이어는 직접 입력하지 않고 이 4개 중에서만 고릅니다. 4개는 성격이 완전히 달라야 하며 반드시 이 순서와 역할을 지키세요: 1번 정면 대응 — 지금 장면의 핵심(눈앞의 인물·사건·단서)에 곧장 뛰어드는 행동. 2번 방향 전환 — 이 장면을 벗어나 다른 장소·다른 인물·다른 단서·일상(휴식·장비·생계)으로 가는 행동. 3번 위험한 도박 — 성공하면 크게 얻지만 실패하면 다치거나 관계·명성을 잃을 수 있는 대담한 행동(기습, 협박, 잠입, 큰 거래, 금기 건드리기). 4번 엉뚱한 행동 — 상황을 전혀 다른 방향으로 비트는 특이하지만 세계관 안에서 실제로 시도 가능한 행동(억지 개그·자살 행위 금지). 각 선택지의 target에 그 행동의 대상(인물·장소·물건 하나)을 쓰고, 네 target은 모두 달라야 합니다. 같은 인물을 묻기·협박·미행하기처럼 방법만 바꿔 여러 번 쓰는 것은 같은 선택지입니다. 같은 대상에게 말 거는 선택지를 두 개 이상 넣거나, 묻기·살피기·조사하기처럼 같은 동사의 변주만 늘어놓지 마세요. 비밀을 미리 알거나 결과를 확정하지 마세요.',

      'choices는 플레이어의 행동으로 그대로 쓰이는 자연스러운 1인칭 행동 문장으로 작성하세요. 4번을 포함해 어떤 선택지에도 "특이한 행동", "(4)" 같은 꼬리표나 머리말을 붙이지 말고 행동 문장만 쓰세요. 이미 확정된 행동을 다시 반복하거나 플레이어가 알 수 없는 비밀을 누설하지 마세요.',
      '선택지가 점점 단순해지지 않게 하세요. "주변을 살펴본다", "이야기를 듣는다", "다음 장소로 향한다" 같은 막연한 행동은 금지입니다. 각 선택지는 구체적인 대상(이름 있는 인물·물건·장소·단서)과 의도·방법을 담은 한 문장입니다. recentHistory에서 플레이어가 이미 했던 것과 같은 유형의 행동은 다시 제시하지 마세요.',
      'storySoFar는 recentHistory보다 앞선 플레이의 장기 기억입니다. 그 안의 사실·약속·인물 관계와 모순되게 서술하지 말고, 이미 끝난 사건을 처음 일어나는 것처럼 반복하지 마세요. 장면에 자연스럽게 맞으면 [진행 중인 사건·떡밥]이나 [약속·거래·빚]을 다시 불러와 서술이나 선택지에 엮으세요(대화·전투 모드가 아니면 4개 중 최소 1개는 이것과 연결).',
      '판정 요청(check가 존재) 시에는 choices:[]를 반환하세요. 주사위 결과를 받은 후에는 그 결과에 맞는 새 선택지 4개를 제시하세요.',
      'currentState.availableImages는 제작자가 업로드한 이미지 키 목록입니다. 장면에 적합한 키가 있을 때만 imageKey로 목록에 있는 문자열 하나를 정확히 반환하세요. 없으면 빈 문자열을 반환하세요. 없는 이미지를 지어내지 마세요.',
      '관계도는 실제 플레이에서 플레이어가 직접 만난 NPC만 기록합니다. 단순 언급, 소문, 배경 설정, 아직 만나지 않은 프롤로그 인물은 추가하지 마세요. 새 NPC와 직접 대면/대화했다면 relationshipUpdates에 {name,met:true,relation,affection}을 넣으세요. 이미 기록된 NPC의 관계 또는 호감도가 사건으로 실제 변했다면 {name,met:false,relation,affection}을 넣으세요. 호감도는 -100~100의 절대값입니다(-100 철천지원수, 0 무관심, 100 목숨을 맡길 신뢰). 첫 만남은 보통 -10~20이고, 첫인상이 나쁘거나 세력·목표가 충돌하면 처음부터 음수로 시작합니다. 플레이어가 인물의 성격·목표·소속에 반하는 행동(모욕, 협박, 약속 파기, 거짓말 들킴, 동료를 해침, 이익 침해)을 하면 깎고, 목표를 돕거나 약속을 지키면 올리세요. 한 장면의 변화는 보통 ±3~15, 결정적 배신이나 큰 은혜만 ±25까지입니다. 특별한 변화가 없으면 기존 값을 유지하세요. 해당 사항이 없으면 빈 배열입니다.',
      'npcProfiles의 attitude는 그 인물의 현재 호감도 단계와 그 단계에서 해야 할 행동입니다. 태도는 말투만이 아니라 실제 행동과 결과로 보여 주세요. 같은 부탁이라도 단계에 따라 결과가 달라야 합니다: 반감·적대 인물은 정보를 숨기거나 거짓말하고, 값을 올리거나 거절하고, 플레이어 몰래 방해하며, 적대 인물은 위협·경비 호출·공격까지 갑니다. 호의·신뢰 인물은 먼저 도움을 주고 할인·단서·비밀을 내줍니다. 말로는 화를 내면서 결국 순순히 도와주는 식으로 처리하지 마세요. 반감 이하 인물의 협조가 필요한 행동에는 D20 판정의 dc를 3~6 올리고, 호의 이상이면 3~6 내리거나 판정 없이 성공시키세요. 선택지(choices)에도 관계가 드러나게 하세요(예: 적대 인물 앞에서는 달래기·협박·피하기·대가 제시처럼 관계를 다루는 선택지).',
      'currentState.quests는 플레이어가 지금 진행 중인 목표(퀘스트) 목록이며 최대 currentState.maxQuests개까지 동시에 가질 수 있습니다. NPC에게 의뢰·부탁을 받아 플레이어가 수락했거나, 사건으로 새로 해야 할 일이 분명해졌을 때만 addQuests에 {"text":"구체적 대상과 할 일이 담긴 짧은 한 문장, 40자 이내","giver":"의뢰한 NPC의 정확한 이름(없으면 빈 문자열)"} 형태로 새 목표를 넣으세요. 플레이어가 수락하지 않은 제안은 넣지 말고, 기존 목표와 같은 일은 다시 넣지 마세요. 목록이 이미 꽉 찼으면 새 목표를 넣지 말고, 의뢰인이 제안하면 지금은 맡을 여유가 없다는 선택지를 줄 수 있습니다. 목표 하나는 일 하나입니다. 기존 목표 문장을 고쳐 쓰거나 내용을 덧붙여 늘리지 마세요(완료 처리 후 더 긴 같은 목표를 다시 넣는 것도 금지). 같은 목표가 진행돼 다음 단계가 생겨도 기존 목표는 그대로 두고 서술로만 보여 주세요. 새로 생긴 다른 일(다른 인물의 의뢰, 새 장소 조사 등)만 addQuests에 별도 항목으로 넣으세요. 예: (X) "부두 창고를 조사한다" → "부두 창고를 조사하고 밀수업자 레온을 찾아 장부를 빼앗는다" (O) 기존 항목 유지 + 새 항목 "밀수업자 레온의 장부를 손에 넣는다". 목표를 실제로 이뤄 냈으면 currentState.quests의 문장을 글자 그대로 completedQuests에, 실패·포기·무의미해졌으면 failedQuests에 넣으세요. 변화가 없으면 모두 빈 배열입니다. 퀘스트 완료 기본 보상(명성 +150, 의뢰인 호감도 +10)은 게임 코드가 자동으로 주므로, 완료 그 자체에 대해서는 reputationDelta나 의뢰인 relationshipUpdates를 따로 올리지 마세요(완료 과정에서 생긴 다른 일은 반영). 최종 목표는 플레이어에게 보이지 않는 GM 전용 정보입니다. 최종 목표를 목록에 그대로 넣거나 서술에서 밝히지 말고 사건을 통해 자연스럽게 드러나게 하세요. 최종 목표가 single이면 구체적 승리 조건이 실제 충족된 경우에만 finalGoalCompleted:true를 반환하세요. progress이면 currentState.finalGoalSteps의 각 단계를 실제 달성한 경우에만 0부터 시작하는 해당 인덱스를 completedGoalSteps 배열에 넣으세요. 이미 완료한 단계는 반복할 필요 없습니다. 아직 달성하지 않은 단계는 절대 완료 처리하지 마세요. progress 모드에서는 finalGoalCompleted:true만으로 종료할 수 없고 모든 단계 완료 시에만 엔딩을 서술하세요.',
      'text·choices·gesture는 모두 자연스러운 한국어로만 쓰세요. 러시아어·일본어 등 다른 언어 단어를 섞지 마세요(세계관 고유명사는 예외).',
      '다음 JSON 객체만 반환하세요: {"text":"GM의 한국어 묘사","hpDelta":0,"addItems":[],"removeItems":[],"addFlags":[],"imageKey":"","moveToPinId":"","check":null,"choices":[{"text":"1번 정면 대응 행동","target":"행동 대상"},{"text":"2번 방향 전환 행동","target":"다른 대상"},{"text":"3번 위험한 도박 행동","target":"또 다른 대상"},{"text":"4번 엉뚱한 행동","target":"또 다른 대상"}],"presentNpcs":[],"npcVoices":[],"reputationDelta":0,"xpGain":0,"trained":[],"ambush":"","relationshipUpdates":[],"addQuests":[],"completedQuests":[],"failedQuests":[],"completedGoalSteps":[],"finalGoalCompleted":false}',
      '새 게임 시작 시 플레이어에게 표시한 프롤로그가 있다면 이미 일어난 사실로 존중하고 이어서 진행하세요. 프롤로그를 다시 처음부터 설명하지 마세요. 플레이어의 의지나 행동을 임의 확정하지 마세요.',
      ...pacingRules,
      ...modeRules,
      ...debugRules,
      ...rerollRules,
      '확정된 시작 장비 목록:\n' + String(body.initialEquipment || '').slice(0, 2000),
      '프롬프트에서 가져온 시작 장비의 원문 능력과 조건:\n' + JSON.stringify(body.ruleEquipment || []).slice(0, 4000),
      '게임 프롤로그:\n' + String(body.prologue || '').slice(0, 5000),
      // Older games still carry the outdated engine rules in their saved prompt; they are rewritten before the GM sees them.
      '제작자 프롬프트(세계관·인물·사건 설정. 응답 분량·선택지 개수·전투·사망·호감도 같은 진행 규칙이 위 시스템 규칙과 다르면 시스템 규칙을 따르세요):\n' + alignEngineRules(String(body.prompt || '')).slice(0, 7000),
    ].join('\n\n');
    // Flags already travel deduplicated in explicitGameState; listing every map's pins only matters for the current map.
    // The message is never cut mid-JSON: older history is dropped first so the action and memory always arrive whole.
    const { flags: _flags, locations: allLocations, ...stateRest } = state;
    const modelState = { ...stateRest, locations: Array.isArray(allLocations) ? allLocations.filter((p: { mapId?: string }) => p?.mapId === state.currentMapId).slice(0, 60) : [] };
    const recent = [...history];
    const withThisNpc = mode === 'talk' && Array.isArray(body.withThisNpc) ? body.withThisNpc.filter((x: unknown) => typeof x === 'string').slice(-15).map((x: string) => x.slice(0, 300)) : [];
    const userContent = () => JSON.stringify({ playerAction: body.action, diceResult: body.diceResult || null, storySoFar, withThisNpc, recentHistory: recent, explicitGameState, currentState: modelState });
    while (userContent().length > 30000 && recent.length > 6) recent.shift();
    const payload = { model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent() },
      ],
    };
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(55000),
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result?.error?.message || 'AI API 호출에 실패했습니다.' }, { status: 502 });
    const raw = result?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') throw new Error('AI 응답이 비어 있습니다.');
    const data = JSON.parse(raw);
    const availableImages = Array.isArray(state.availableImages) ? state.availableImages.filter((v: unknown): v is string => typeof v === 'string').slice(0, 150) : [];
    const imageKey = typeof data.imageKey === 'string' && availableImages.includes(data.imageKey) ? data.imageKey : '';
    const locations = Array.isArray(state.locations) ? state.locations : [];
    const candidate = typeof data.moveToPinId === 'string' ? data.moveToPinId : '';
    const allowed = Array.isArray(state.adjacentLocationIds) ? state.adjacentLocationIds : [];
    const moveToPinId = body.movementAllowed !== false && allowed.includes(candidate) && locations.some((p: { id?: string; mapId?: string }) => p.id === candidate && p.mapId === state.currentMapId) ? candidate : '';
    if (typeof data.text === 'string') data.text = data.text.split(/(\s+)/).filter((w: string) => !FOREIGN_SCRIPT.test(w)).join('').replace(/ {2,}/g, ' ');
    // Choices may come as {text, target}; the text is what the player sees, the target is only used to catch repeats.
    const choiceTargets: Record<string, string> = {};
    if (Array.isArray(data.choices)) data.choices = data.choices.map((v: unknown) => { if (v && typeof v === 'object') { const o = v as { text?: unknown; target?: unknown }; const t = String(o.text || ''); if (typeof o.target === 'string') choiceTargets[t.trim()] = o.target; return t; } return v; });
    const choices = Array.isArray(data.choices) ? [...new Set(data.choices.filter((v: unknown): v is string => typeof v === 'string' && !FOREIGN_SCRIPT.test(v)).map((v: string) => v.trim().replace(/^[(\[]?\s*특이한\s*행동\s*\d?\s*[)\]]?\s*[:：\-—]?\s*/, '')).filter((v: string) => v.length >= 2 && v.length <= 140))].slice(0, 4) : [];
    // Only a foe from this genre's roster can ambush, and never mid-fight or mid-talk.
    const monsterNames = Array.isArray(state.monsters) ? state.monsters.map((m: { name?: unknown }) => String(m?.name || '')) : [];
    const toMonster = (v: unknown) => { const t = typeof v === 'string' ? v.trim() : ''; return !t ? '' : monsterNames.find((n: string) => n === t) || monsterNames.find((n: string) => n.includes(t) || t.includes(n)) || ''; };
    const ambush = mode ? '' : toMonster(data.ambush) || (Array.isArray(data.presentNpcs) ? data.presentNpcs.map(toMonster).find(Boolean) || '' : '');
    const trainableIds = Array.isArray(state.trainableStats) ? state.trainableStats.map((t: { id?: unknown }) => String(t?.id || '')) : [];
    const trained = !mode && Array.isArray(data.trained) ? data.trained.filter((id: unknown): id is string => typeof id === 'string' && trainableIds.includes(id)).slice(0, 2) : [];
    const xpGain = typeof data.xpGain === 'number' && Number.isFinite(data.xpGain) ? Math.max(0, Math.min(5000, Math.round(data.xpGain))) : 0;
    const reputationDelta = typeof data.reputationDelta === 'number' && Number.isFinite(data.reputationDelta) ? Math.max(-5000, Math.min(5000, Math.round(data.reputationDelta))) : 0;
    const presentNpcs = Array.isArray(data.presentNpcs) ? [...new Set(data.presentNpcs.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim()).filter((v: string) => v.length >= 1 && v.length <= 30))].slice(0, 3) : [];
    const profileNames = Array.isArray(state.npcProfiles) ? state.npcProfiles.map((p: { name?: unknown }) => String(p?.name || '')) : [];
    const npcVoices = [...fixedVoices, ...(Array.isArray(data.npcVoices) ? data.npcVoices.filter((v: { name?: unknown; style?: unknown }) => v && typeof v.name === 'string' && typeof v.style === 'string' && v.style.trim() && profileNames.includes(v.name.trim()) && !fixedVoices.some(f => f.name === String(v.name).trim()) && !FOREIGN_SCRIPT.test(v.style))
      .map((v: { name: string; style: string }) => ({ name: v.name.trim(), style: v.style.trim().slice(0, VOICE_LENGTH) })) : [])].slice(0, 6);
    const check = !mode && body.reroll !== true && body.debug !== true && !body.diceResult && data.check && typeof data.check === 'object' ? {
      ability: String(data.check.ability || '').toLowerCase().slice(0, 50),
      label: String(data.check.label || '').slice(0, 60),
      reason: String(data.check.reason || '').slice(0, 200),
      dc: Number(data.check.dc)
    } : null;
    const relationshipUpdates = Array.isArray(data.relationshipUpdates) ? data.relationshipUpdates.slice(0, 12).filter((item: unknown) => !!item && typeof item === 'object' && typeof (item as {name?:unknown}).name === 'string').map((item: {name:string;met?:boolean;relation?:string;affection?:number}) => ({name:item.name.trim().slice(0,50),met:item.met===true,relation:typeof item.relation==='string'?item.relation.slice(0,30):'',affection:typeof item.affection==='number'&&Number.isFinite(item.affection)?Math.max(-100,Math.min(100,Math.round(item.affection))):undefined})) : [];
    const questStrings = (v: unknown) => Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim() && !FOREIGN_SCRIPT.test(x)).map((x: string) => x.trim().slice(0, 80)).slice(0, 3) : [];
    const completedQuests = questStrings(data.completedQuests), failedQuests = questStrings(data.failedQuests);
    const addQuests = (Array.isArray(data.addQuests) ? data.addQuests : []).map((x: unknown) => typeof x === 'string' ? { text: x, giver: '' } : x && typeof x === 'object' ? { text: String((x as { text?: unknown; quest?: unknown }).text || (x as { quest?: unknown }).quest || ''), giver: String((x as { giver?: unknown }).giver || '') } : null)
      .filter((q: { text: string; giver: string } | null): q is { text: string; giver: string } => !!q && !!q.text.trim() && !FOREIGN_SCRIPT.test(q.text)).map((q: { text: string; giver: string }) => ({ text: q.text.trim().slice(0, 80), giver: q.giver.trim().slice(0, 30) })).slice(0, 3);
    const finalGoalCompleted = !check && state.finalGoalMode !== 'progress' && data.finalGoalCompleted === true && !!String(state.finalGoal||'').trim();
    const steps=Array.isArray(state.finalGoalSteps)?state.finalGoalSteps.filter((v:unknown)=>typeof v==='string'&&v.trim()):[];
    const completedGoalSteps=!check&&state.finalGoalMode==='progress'&&Array.isArray(data.completedGoalSteps)?data.completedGoalSteps.filter((v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<steps.length):[];
    const rawEnemy = data.enemy && typeof data.enemy === 'object' ? data.enemy : null;
    // A built-in NPC always fights at its sheet tier; anyone else gets the tier the GM judged from their profile.
    const sheetPower = Number(sheets[partner]?.power);
    const gmPower = Number(rawEnemy?.power);
    const tier = Number.isInteger(sheetPower) && POWER_TIERS[sheetPower] ? sheetPower : Number.isInteger(gmPower) && gmPower >= 1 && gmPower <= MAX_POWER ? gmPower : 0;
    const npcPowers = Object.fromEntries(profiles.filter(p => typeof p?.name === 'string' && Number.isInteger(sheets[p.name as string]?.power)).map(p => [String(p.name), Number(sheets[p.name as string].power)]));
    const enemy = mode === 'combat' && (tier || rawEnemy) ? (tier ? { ...POWER_TIERS[tier], power: tier } : { hp: Number(rawEnemy.hp), dc: Number(rawEnemy.dc), damage: Number(rawEnemy.damage) }) : null;
    if (mode === 'combat' && !itemUse) data.hpDelta = 0;
    const gesture = mode === 'talk' && typeof data.gesture === 'string' ? data.gesture.trim().slice(0, 60) : '';
    // Talk: the reply becomes ordered parts (narration, speech, narration, speech...) so the chat shows them in turn.
    // Quoted text is speech even when the model mixes it into the narration; a speech repeated in line and text appears once.
    let line = '';
    let parts: { type: 'scene' | 'speech'; text: string }[] = [];
    let talkLeft = false;
    if (mode === 'talk') {
      const QUOTE = /[“"「『]([^”"」』]+)[”"」』]/g;
      const toParts = (value: string) => {
        const out: { type: 'scene' | 'speech'; text: string }[] = [];
        let last = 0;
        for (const m of value.matchAll(QUOTE)) {
          const before = value.slice(last, m.index).trim();
          if (before) out.push({ type: 'scene', text: before });
          if (m[1].trim()) out.push({ type: 'speech', text: m[1].trim() });
          last = (m.index || 0) + m[0].length;
        }
        const after = value.slice(last).trim();
        if (after) out.push({ type: 'scene', text: after });
        return out;
      };
      const strip = (v: string) => v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim();
      const same = (a: string, b: string) => { const x = a.replace(/[\s"“”'.,!?…]/g, ''), y = b.replace(/[\s"“”'.,!?…]/g, ''); return !!x && !!y && (x.includes(y) || y.includes(x)); };
      parts = toParts(String(data.text || '').trim());
      // Chat-style prompts invite the model to send the messages as an array or under another key.
      const lineSource = data.line ?? data.lines ?? data.messages;
      let rawLine = (Array.isArray(lineSource) ? lineSource.filter((v: unknown) => typeof v === 'string').join('\n') : typeof lineSource === 'string' ? lineSource : '').trim();
      // A bare ellipsis is not a reply; ask once more for the actual words.
      if (!rawLine.replace(/[\s.…!?~ㅡ\-]/g, '') && !String(data.text || '').replace(/[\s.…!?~ㅡ\-]/g, '')) rawLine = await retryTalkLine(partner, body, history, state) || rawLine;
      const lineParts = /[“"「『]/.test(rawLine) ? toParts(rawLine) : rawLine ? [{ type: 'speech' as const, text: strip(rawLine) }] : [];
      // Narration reads as third person: "당신은 …한다", or the partner named as a subject ("브리아는").
      const partnerPattern = partner.split('').map(ch => /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch).join('');
      // Both a third-person subject and a plain "~다." sentence ending (speech says "~니다", "~요", "~게").
      const narrated = (t: string) => new RegExp(`(^|[.!?…]\\s*)당신(은|이|의|을)\\s|${partnerPattern}(은|는|이|가|의)\\s`).test(t) && /[^니]다[.!]?(\s|$)/.test(t);
      if (!lineParts.length && parts.length && !parts.some(p => p.type === 'speech') && (data.endTalk === true || parts.some(p => narrated(p.text)))) talkLeft = true;
      if (!talkLeft && !parts.some(p => p.type === 'speech')) {
        // No speech inside the narration: a lone line with no quotes is the NPC talking without quote marks.
        parts = lineParts.length ? [...parts, ...lineParts] : parts.length === 1 ? [{ type: 'speech', text: strip(parts[0].text) }] : parts;
      } else {
        for (const p of lineParts) if (!parts.some(q => q.type === p.type && same(q.text, p.text))) parts.push(p);
      }
      // A quotative tail ('…"라고 덧붙인다') belongs to the lead-in before that speech: '그녀는 한숨을 내쉬며 덧붙인다.' then the bubble.
      parts = parts.reduce<typeof parts>((acc, p, i) => {
        const tail = p.type === 'scene' && i >= 2 && parts[i - 1].type === 'speech' ? p.text.match(/^(?:이?라고|하고|고)\s*(.+)$/) : null;
        if (!tail) { acc.push(p); return acc; }
        const lead = acc[acc.length - 2];
        if (lead?.type === 'scene' && !/[.!?…]$/.test(lead.text)) lead.text = `${lead.text} ${tail[1]}`;
        // A bare speech verb ('말한다.') adds nothing once the bubble is shown.
        else { const rest = tail[1].replace(/^(?:말하며|말하고는?|외치며|덧붙이며|중얼거리며)\s*/, ''); if (rest.replace(/[\s.!?…]/g, '').length > 6) acc.push({ type: 'scene', text: rest }); }
        return acc;
      }, []);
      // Chat-style talk: narration is dropped and each line of speech becomes its own bubble.
      const leftText = talkLeft ? parts.map(p => p.text).join(' ') : '';
      const prefix = `${partner}: "`;
      const saidBefore = history.filter((h: string) => h.startsWith(prefix)).slice(-12).flatMap((h: string) => sentences(h.slice(prefix.length).replace(/"(\s*\(.*\))?$/, '')));
      const fresh = (messages: string[]) => {
        const kept: string[] = [], seen = [...saidBefore];
        for (const m of messages) {
          const novel = sentences(m).filter(x => !seen.some(y => repeats(x, y)));
          seen.push(...novel);
          if (novel.length) kept.push(novel.join(' '));
        }
        return kept;
      };
      let speech = talkLeft ? [] : fresh(parts.filter(p => p.type === 'speech').flatMap(p => p.text.split(/\n+/).map(t => strip(t))).filter(Boolean));
      if (!talkLeft && !speech.length && saidBefore.length) speech = fresh((await retryTalkLine(partner, body, history, state, saidBefore)).split(/\n+/).map(t => strip(t)).filter(Boolean));
      parts = talkLeft ? [] : (speech.length ? speech : [strip(rawLine) || '…']).map(text => ({ type: 'speech' as const, text: text.slice(0, 600) })).slice(0, 4);
      line = parts.filter(p => p.type === 'speech').map(p => p.text).join(' ');
      data.text = talkLeft ? leftText : parts.filter(p => p.type === 'scene').map(p => p.text).join(' ');
    }
    const sameTarget = (list: string[], targets: Record<string, string>) => {
      const names: string[] = Array.isArray(state.knownNpcs) ? state.knownNpcs.filter((n: unknown): n is string => typeof n === 'string' && n.length >= 2) : [];
      const keys = list.map(c => (targets[c] || '').replace(/\s+/g, ''));
      const keyDup = keys.some((k, i) => k.length >= 2 && keys.some((o, j) => j !== i && o.length >= 2 && (o.includes(k) || k.includes(o))));
      const nameDup = names.some(n => list.filter(c => c.includes(n)).length > 1);
      // Without targets, the objects in the sentences ("기사에게", "기사를") still reveal a repeated target.
      const objects = list.map(c => new Set([...c.matchAll(/([가-힣]{2,})(?:에게|한테|를|을)(?=\s|$)/g)].map(m => m[1]).filter(w => !OBJECT_STOP.test(w))));
      const objectDup = objects.some((o, i) => [...o].some(w => objects.some((p, j) => j !== i && p.has(w))));
      return keyDup || nameDup || objectDup;
    };
    if (!mode && !check && choices.length === 4 && sameTarget(choices as string[], choiceTargets)) {
      try {
        const fix = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.9, response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: '한국어 CRPG의 다음 행동 선택지 4개를 다시 씁니다. 기존 선택지는 여러 개가 같은 대상(같은 인물·장소·물건)을 향해 사실상 같은 선택입니다. 네 선택지의 대상이 모두 다르게 고치세요. 역할 순서: 1번 정면 대응(지금 장면의 핵심 하나), 2번 방향 전환(이 장면을 떠나 다른 장소·다른 인물·다른 단서·휴식이나 준비), 3번 위험한 도박(1번과 다른 대상을 노리는 대담한 행동), 4번 엉뚱하지만 세계관 안에서 가능한 행동. 1인칭 행동 문장, 각 80자 이내, 플레이어가 모르는 비밀을 쓰지 마세요. 다음 JSON만 반환: {"choices":[{"text":"","target":""},{"text":"","target":""},{"text":"","target":""},{"text":"","target":""}]}' },
              { role: 'user', content: JSON.stringify({ scene: String(data.text || '').slice(0, 1500), location: state.locationName || '', nearbyPlaces: Array.isArray(state.adjacentLocations) ? state.adjacentLocations.map((p: { name?: unknown }) => p?.name) : [], quests: state.quests || [], repetitive: choices }) },
            ] }),
          cache: 'no-store', signal: AbortSignal.timeout(20000),
        });
        const fresh = JSON.parse((await fix.json())?.choices?.[0]?.message?.content || '{}')?.choices;
        if (Array.isArray(fresh)) {
          const targets: Record<string, string> = {};
          const texts = fresh.map((v: { text?: unknown; target?: unknown }) => { const t = String(v?.text || '').trim(); if (typeof v?.target === 'string') targets[t] = v.target; return t; }).filter((t: string) => t.length >= 2 && t.length <= 140 && !FOREIGN_SCRIPT.test(t));
          if (texts.length === 4 && new Set(texts).size === 4 && !sameTarget(texts, targets)) choices.splice(0, choices.length, ...texts);
        }
      } catch (err) { console.warn('선택지 다양화 실패', err); }
    }
    // Suggested replies must be speech; narrated intents are dropped unless nothing else is left.
    const NARRATED = /(한다|묻는다|말한다|건넨다|요청한다|부탁한다|청한다|본다|듣는다)\.?$/;
    const spokenChoices = mode === 'talk' ? (choices as string[]).map((v: string) => v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim()).filter((v: string) => !NARRATED.test(v)) : [];
    // Too few spoken replies survive when the model narrates them; ask once more for real lines to fill three.
    if (mode === 'talk' && spokenChoices.length < 3) {
      try {
        const refill = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.8, response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: `한국어 CRPG 대화 장면입니다. 플레이어가 ${partner}에게 다음에 실제로 입 밖에 낼 대사 후보를 만듭니다. 구어체 직접 화법 대사만 쓰고, '~라고 묻는다', '~한다' 같은 행동 서술은 금지입니다. 역할이 서로 다른 대사로 쓰세요: 지금 화제를 파고드는 말 / 화제를 돌리거나 대화를 마무리하는 말 / 도발·협박·떠보기·파격 제안처럼 판을 흔드는 대담한 말. 이미 있는 대사와 같은 역할·내용은 피하세요. 따옴표 없이 각 60자 이내. 다음 JSON만 반환: {"choices":["대사1","대사2","대사3"]}` },
              { role: 'user', content: JSON.stringify({ npcJustSaid: line, recentHistory: history.slice(-8), existing: spokenChoices, rejectedNarrations: (choices as string[]).filter(v => !spokenChoices.includes(v)) }) },
            ] }),
          cache: 'no-store', signal: AbortSignal.timeout(20000),
        });
        const extra = JSON.parse((await refill.json())?.choices?.[0]?.message?.content || '{}')?.choices;
        if (Array.isArray(extra)) for (const v of extra) {
          const t = typeof v === 'string' ? v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim() : '';
          if (t.length >= 2 && t.length <= 140 && !FOREIGN_SCRIPT.test(t) && !NARRATED.test(t) && !spokenChoices.includes(t) && spokenChoices.length < 3) spokenChoices.push(t);
        }
      } catch (err) { console.warn('대화 선택지 보충 실패', err); }
    }
    if (mode === 'talk' && spokenChoices.length) choices.splice(0, choices.length, ...spokenChoices);
    const playerLine = mode === 'talk' && typeof data.playerLine === 'string' && !FOREIGN_SCRIPT.test(data.playerLine) ? data.playerLine.trim().replace(/^["“”'「『]+|["“”'」』]+$/g, '').slice(0, 300) : '';
    return NextResponse.json({ setLevel: body.debug === true && Number.isInteger(data.setLevel) ? Math.max(1, Math.min(100, data.setLevel)) : 0, enemy, npcPowers, trained: check ? [] : trained, ambush: check ? '' : ambush, xpGain: check ? 0 : xpGain, gesture, line, parts, playerLine, npcVoices, endTalk: mode === 'talk' && (data.endTalk === true || talkLeft || DECIDED.test(String(body.action || ''))), talkLeft, reputationDelta: check ? 0 : reputationDelta,addQuests:check?[]:addQuests,completedQuests:check?[]:completedQuests,failedQuests:check?[]:failedQuests,finalGoalCompleted,completedGoalSteps,relationshipUpdates: check ? [] : relationshipUpdates, choices: check ? [] : choices, presentNpcs: check ? null : presentNpcs, check, moveToPinId: check ? '' : moveToPinId, imageKey, text: String(data.text || '').slice(0, 6000), hpDelta: check ? 0 : Number.isFinite(data.hpDelta) ? Math.trunc(data.hpDelta) : 0,
      addItems: !check && Array.isArray(data.addItems) ? data.addItems.slice(0, 5) : [], removeItems: !check && Array.isArray(data.removeItems) ? data.removeItems.slice(0, 5) : [],
      addFlags: !check && Array.isArray(data.addFlags) ? data.addFlags.slice(0, 5) : [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'GM 서버 오류' }, { status: 500 });
  }
}
