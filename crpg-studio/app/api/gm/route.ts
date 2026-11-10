import { NextResponse } from 'next/server';
import { readFileSync, appendFileSync } from 'fs';
import path from 'path';
import { POWER_TIERS, MAX_POWER, levelForTier, foeLevelRange } from '../../_lib/progression';
import { alignEngineRules } from '../../_lib/engine-rules';
import { namesFoe } from '../../_lib/monsters';
import { TRAVEL_VERB } from '../../_lib/travel';
import type { GmBody, GmState } from '../../_lib/game/gm-contract';

export const runtime = 'nodejs';
// The model occasionally slips a word from another language into Korean (e.g. Russian "слух" for 소문).
const FOREIGN_SCRIPT = /[\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\u3040-\u30FF]/;
export const maxDuration = 60;

const VOICE_LENGTH = 200;
// A medieval setting pulled the model toward translated-drama speech (~이오, ~하시오). Wuxia keeps its authored 하오체 characters, so it skips this.
const NATURAL_SPEECH = '인물은 모두 오늘날 한국 사람이 실제로 입으로 하는 자연스러운 말로 이야기합니다. 세계관이 중세여도 번역극이나 사극처럼 말하지 않습니다.';
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
async function assignVoices(npcs: { name: string; profile: string }[], genre: string, wuxia: boolean): Promise<{ name: string; style: string }[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'x-usage-tag': 'voices' },
      body: JSON.stringify({ reasoning_effort: 'low', model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: [
            '한국어 CRPG의 NPC마다 게임 내내 고정될 말투를 정합니다.',
            `style 형식: "어체: <${wuxia ? '하십시오체|해요체|하오체|하게체|해체|해라체' : '하십시오체|해요체|해체|해라체'} 중 하나만> | 어미: <자주 쓰는 어미 2~3개> | 버릇: <말버릇·자주 쓰는 표현> | 예: <그 인물다운 짧은 대사 하나>" 120자 이내.`,
            wuxia ? '성별·나이·신분·성격에 맞추고, 인물끼리 서로 구분되게 하세요. 여성 인물은 profile에 근거가 없으면 하오체·하게체를 쓰지 마세요.' : `성별·나이·신분·성격에 맞추고, 인물끼리 서로 구분되게 하세요. 젊은 인물은 해요체·해체가 자연스럽습니다. ${NATURAL_SPEECH}`,
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
// Talk replies read as "the same" when they share most character pairs or two content words, or when all three are questions.
const pairShare = (a: string, b: string) => { const p = pairs(squash(a)), q = pairs(squash(b)); let both = 0; for (const k of p) if (q.has(k)) both++; return both / Math.max(1, Math.min(p.size, q.size)); };
const TALK_STOP = /^(그럼|그래|그건|그게|정말|혹시|지금|우리|당신|너|제가|내가|저는|나는|뭐|무슨|어떻게|왜|좀|더|이제|그냥|알려|말해|주세요|줄래|있어|있나요|있어요|없어|해요|하는|거야|건가요)$/;
const contentWords = (t: string) => new Set([...t.matchAll(/[가-힣]{2,}/g)].map(m => m[0].replace(/(이랑|으로|에게|한테|은|는|이|가|을|를|에|의|도|로|와|과|랑|요|죠)$/, '')).filter(w => w.length >= 2 && !TALK_STOP.test(w)));
// An action that walks away from the conversation ("이끼골로 향해 조사하러 간다"), not something said.
// Same pattern as the play screen: a destination or object before the verb, so "좋아, 같이 간다" stays speech.
const LEAVING = /(?:으로|로|에|을|를|서)\s+(?:\S+\s+){0,4}?(?:간다|향한다|나선다|떠난다|들어간다|나간다|출발한다|돌아간다|따라간다|뒤쫓는다|추적한다|조사한다|살핀다|뒤진다)\.?$/;
const ADDRESS = ['경', '그대', '인간', '꼬맹이', '형씨', '아가', '자네', '당신', '손님', '나리', '아가씨', '소협', '대협', '헌터님'];
const ADDRESS_JOSA = ['', '은', '는', '이', '가', '의', '을', '를', '에게', '도', '여', '이여', '께서', '께', '님'];
const addressesIn = (t: string) => { const words = t.split(/[\s,.!?…~"'“”]+/).filter(Boolean); return ADDRESS.filter(a => words.some(w => w.startsWith(a) && ADDRESS_JOSA.includes(w.slice(a.length)))); };
const sentences = (t: string) => t.split(/(?<=[.!?…])\s+/).map(x => x.trim()).filter(Boolean);
// Drama-style speech is judged per sentence end: the old any-word match fired on "유연하게 대처", and its rewrite then changed clean lines.
const OLD_ENDING = /(?:(?<!십)시오|(?:겠|했|있|없|었|였|않|같|많|좋|맞|됐|왔|갔|봤|는|한|렸|졌)소|(?:하|이|되|가|주|보|마|리|니|지|치|키|기|려|대|내|해)오|소이다|구려|이외다|일세|이로다|하도다|전부요|무엇이요|누구요|(?:하|주|보|오)게|(?:하|이|되|드리)옵(?:니다|니까|소서)|하노라|겠노라|이니라|하느니라)[.!?…~,]*["”」']?$/;
const OLD_CLAUSE = /이오니|하오니|사오니|하옵고|이옵고|하오나|이오나|사옵/;
// A nickname marked "친해지면" in a sheet is earned: from a stranger, 핍's "대장" made no sense. It leaves the habits and the example lines alike.
const CLOSE_AFFECTION = 20;
const voiceFor = (speech: string, affection: number) => {
  const pet = speech.match(/친해지면 상대를 '([^']+)'[^,|]*부름,?\s*/);
  return !pet || affection >= CLOSE_AFFECTION ? speech : speech.replace(pet[0], '').split(`${pet[1]}, `).join('');
};
// Scenes have no check like the one talk lines get: "이번엔 네가 이겼어" came back in four scenes in a row. A quote already said is dropped.
const QUOTED = /["“]([^"”]+)["”]/g;
const dropRepeatedQuotes = (text: string, history: string[]) => {
  const quotes = history.flatMap(h => [...h.matchAll(QUOTED)].map(m => m[1])), said = quotes.flatMap(sentences);
  // Whole quotes too: "대장… 이번엔" splits at the dots where "대장, 이번엔" doesn't, so its sentences alone look new.
  const kept = text.replace(QUOTED, (all, q: string) => { const lines = sentences(q); return quotes.some(y => repeats(q, y)) || (lines.length && lines.every(x => said.some(y => repeats(x, y)))) ? '' : all; }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return kept.replace(/【[^】]*】/, '').trim() ? kept : text;
};
const oldSpeech = (t: string) => t.split(/(?<=[.!?…]["”」']?)\s+|\n+/).some(x => OLD_ENDING.test(x.trim()) || OLD_CLAUSE.test(x));
// A question ("같이 가 볼래요?") is not a decision.
const plainEnd = (t: string) => { const m = t.trim().replace(/[.!]+$/, '').match(/(.)다$/); if (!m) return false; const c = m[1].charCodeAt(0) - 0xac00; return m[1] === '는' || (c >= 0 && c < 11172 && c % 28 === 4); };

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY 환경변수가 없습니다.' }, { status: 500 });
  try {
    const body: GmBody = await request.json();
    if (typeof body.action !== 'string' || !body.action.trim() || body.action.length > 4000) {
      return NextResponse.json({ error: '행동 입력이 올바르지 않습니다.' }, { status: 400 });
    }
    // The play screen sends the monster roster beside state, not inside it; the GM reads it as currentState.monsters.
    const state: GmState = { ...(body.state && typeof body.state === 'object' ? body.state : {}), ...(Array.isArray(body.monsters) && !Array.isArray(body.state?.monsters) ? { monsters: body.monsters } : {}) };
    // Explicitly separate current mutable state from immutable event history.
    const rawFlags=Array.isArray(state.flags)?state.flags.filter((v:unknown):v is string=>typeof v==='string'):[];
    const stateKeys=new Set(['막','소속','경지','재물','현재위치','현재목표']);
    const latestState:Record<string,string>={};
    const eventFlags:string[]=[];
    for(const flag of rawFlags){const pos=flag.indexOf(':');const key=pos>0?flag.slice(0,pos).trim():'';if(stateKeys.has(key))latestState[key]=flag.slice(pos+1).trim();else if(!eventFlags.includes(flag))eventFlags.push(flag);}
    const explicitGameState={currentMapId:state.currentMapId||'',locationName:state.locationName||'',quests:Array.isArray(state.quests)?state.quests:[],hp:state.hp,inventory:state.inventory||[],currentValues:latestState,historyFlags:eventFlags.slice(-100)};
    const history = Array.isArray(body.history) ? body.history.filter((x: unknown) => typeof x === 'string').slice(-30).map((x: string) => x.slice(0, 1500)) : [];
    // Rolling summary of everything older than recentHistory (built by /api/gm/memory).
    const storySoFar = typeof body.memory === 'string' ? body.memory.slice(0, 8000) : '';
    const keyFacts = Array.isArray(body.keyFacts) ? body.keyFacts.filter((x: unknown): x is string => typeof x === 'string').map((x: string) => x.slice(0, 120)).slice(-100) : [];
    const genreText = String(body.prompt || '').slice(0, 1800);
    // Talk and combat narrow the GM to one partner; combat numbers are computed by the client.
    const mode = body.mode === 'talk' || body.mode === 'combat' ? body.mode : '';
    const partner = String(body.npc || '').slice(0, 30);
    // How the hero talks, for every pass that writes the player's lines. Without it the lines mixed 반말 into a talk
    // with the knight-captain, assumed a companion who wasn't there ("우리가 둘이라면"), and gave the hero a trade
    // ("늑대 상대는 내 전문이야") that the identity-free stories never fix.
    const partnerAffection = Number((Array.isArray(state.relationships) ? state.relationships : []).find((r: { name?: unknown }) => r?.name === partner)?.affection) || 0;
    const party: string[] = Array.isArray(state.party) ? state.party.filter((n: unknown): n is string => typeof n === 'string') : [];
    const playerVoice = [
      `플레이어 대사의 말투: 세 대사 모두 같은 어체입니다. ${partnerAffection >= 40 || party.includes(partner) ? `${partner}와(과)는 가까운 사이라 편한 반말도 됩니다.` : `${partner}에게는 해요체(~요)로 말하고 반말은 쓰지 마세요.`}`,
      `지금 플레이어의 동료: ${party.length ? party.join(', ') : '없음(혼자)'}. 없는 동료나 "우리 둘" 같은 일행을 전제하지 말고, ${partner}가 함께 간다고 정해지지 않았으면 같이 가자는 전제도 하지 마세요.`,
      '주인공의 출신·직업·특기·과거를 단정하는 말("그건 내 전문이야", "기사 출신이라서")은 금지입니다.',
    ].join(' ');
    const talkTurns = Math.max(0, Math.min(99, Math.round(Number(body.talkTurns) || 0)));
    // The talk closes after this reply either way, so the NPC must say goodbye in it rather than ask something left hanging.
    const decided = mode === 'talk' && body.closeTalk === true;
    const playerLeaves = mode === 'talk' && LEAVING.test(String(body.action || '').trim());
    // The opening reply of a talk (nothing said by the player yet) never ends it either.
    const holdTalk = mode === 'talk' && talkTurns === 0 && !playerLeaves;
    const lastReply = mode === 'talk' && (decided || talkTurns >= 5);
    const combat = mode === 'combat' && body.combat && typeof body.combat === 'object' ? body.combat : null;
    const itemUse = typeof combat?.itemUse === 'string' ? combat.itemUse.slice(0, 80) : '';
    const pacingRules = [
      ...(state.safePlace === true ? ['지금 있는 곳은 안전한 곳(마을·도시 안)입니다. 몬스터 습격(ambush)을 넣지 마세요.'] : []),
      ...(!mode && body.interfere === true ? ['방해 사건: 이번 장면에서 플레이어와 적대하는 세력(메인 사건의 흑막 쪽, 또는 플레이어가 척진 세력·인물)이 플레이어의 일을 방해합니다. 지금 상황과 장소에 맞는 것 하나만 고르세요: 미행·감시가 드러남, 협박 편지나 경고, 증인·거래 상대가 매수되거나 입막음당함, 가진 단서·물건을 도둑맞거나 망가짐, 나쁜 소문이 돌아 명성 하락(reputationDelta -20~-80), 가려던 곳의 출입이 막힘, 하수인 무리나 자객의 습격(ambush에 currentState.monsters 중 사람 무리·자객 계열 하나, boss:true는 금지). 흑막의 정체와 이름은 드러내지 말고 하수인·흔적·소문으로만 보이게 하세요. 방해는 진행을 막는 벽이 아니라 대가와 위험을 더하는 일이니, 이번 장면 choices 중 하나는 방해에 맞서거나 피하는 행동으로 넣으세요.'] : []),
    ];
    const modeRules = mode === 'talk' ? [
      // 에드리아 closed a report with "이제 다음 행동은 무엇입니까?": the game master's question leaking into an NPC.
      `${partner}는 게임 진행자가 아닙니다. "다음 행동은 무엇입니까?"·"어떻게 하시겠습니까?"·"무엇을 하시겠습니까?"처럼 플레이어에게 다음 행동을 고르라는 진행자식 질문으로 말을 끝내지 마세요. 묻는다면 ${partner}가 이야기 속에서 실제로 궁금해할 구체적인 것(본 것, 가진 물건, 누구에게 들었는지)만 묻거나, 명령·부탁·정보로 끝내세요.`,
      `지금은 플레이어가 ${partner}와(과) 직접 대화하는 대화 모드입니다. playerAction은 플레이어가 ${partner}에게 한 말입니다. 대화는 메신저 채팅처럼 대사만 오갑니다. 상황 설명·지문·행동 묘사는 쓰지 말고 text는 반드시 빈 문자열입니다. line에는 ${partner}가 하는 말만 따옴표·이름표 없이 쓰세요. 채팅 메시지처럼 짧게 1~3개로 나누고 메시지 사이는 줄바꿈(\\n)으로 구분하세요. 감정과 태도는 지문 대신 말투·어휘로 드러내세요. "..."이나 "…"만 있는 대답은 금지입니다. 과묵하거나 적대적인 인물도 짧더라도 실제 말로 반응해야 하며(예: "할 말 없어. 가."), 플레이어가 물은 내용에 답하거나 답하지 않는 이유를 말하세요. 표정이나 몸짓은 화면 연출용으로 gesture에 20자 안팎의 짧은 구절로만 쓰세요(예: 잠시 머뭇거리며). JSON에 line 필드를 꼭 포함하세요. 플레이어의 대사나 행동을 대신 쓰지 마세요. ${partner}의 성격·목표·비밀·관계를 지키고, 아직 밝힐 때가 아닌 비밀은 숨기거나 둘러대세요.`,
      `${partner}는 플레이어의 가방 속을 들여다볼 수 없고, 직접 보거나 듣거나 전해 들은 것만 압니다. JSON의 howKnown 필드: 이번 대사에서 ${partner}가 플레이어가 이 대화에서 말하지 않은 플레이어의 일(가진 물건, 차림, 출신, 한 일)을 안다고 드러내면, 그 순간을 플레이어가 볼 수 있게 현재형 서술 한 문장으로 쓰세요. 무엇을 어떻게 보거나 들었는지(눈에 띈 물건·차림, 건네받은 서류, 누구에게 들은 소문)가 구체적으로 드러나야 합니다. 그런 일이 없는 대답이면 빈 문자열입니다. 그 근거가 플레이어의 소지품이면 knownItem에 currentState.inventory의 이름을 그대로 쓰고, 아니면 빈 문자열입니다. 대화의 JSON은 {"nextAction":"","knownItem":"","howKnown":"","text":"","line":"",...} 순서로 씁니다.`,
      `npcProfiles의 remembers는 각 인물이 플레이어에 대해 기억하는 내용(이전 대화의 요약)입니다. 그 인물이 등장하면 대화든 일반 장면이든 이 기억과 어긋나지 않게 행동하세요. recentHistory에 ${partner}가 이미 한 말은 다시 하지 마세요. 같은 경고·같은 소식을 표현만 바꿔 되풀이하는 것도 반복입니다. 매 대답은 아직 하지 않은 말이어야 합니다. 플레이어가 무엇을 하겠다고 정하면(가 보겠다, 처리하고 오겠다 등) 그 대답은 짧은 작별 한마디로 끝내세요. withThisNpc는 지금까지 플레이어와 ${partner} 사이에 있었던 일(이전 대화·약속·도움·싸움·거래)의 기록이고, storySoFar의 [인물 메모]와 [약속·거래·빚]도 함께 참고하세요. ${partner}는 그 일을 기억하는 사람처럼 말해야 합니다: 이미 나눈 이야기를 처음 듣는 척하거나 같은 설명을 반복하지 말고, 지난 약속·빚·도움·상처를 자연스럽게 언급하며, 플레이어가 이룬 일(퀘스트 완료, 명성)을 들었다면 그에 맞게 대하세요. [지난 대화]가 붙은 줄은 이미 끝나 매듭지어진 대화입니다: 그 일(받은 시험·맡긴 일)은 끝난 일로만 기억하고, 지금 대화의 주제로 다시 꺼내 칭찬·확인·재부여하지 마세요. 지금 대화의 주제는 플레이어의 말과 questBeats에서 ${partner}와 남은 일입니다.`,
      `대화 모드에서 choices에는 플레이어가 ${partner}에게 실제로 입 밖에 내는 말 그대로(구어체 직접 화법) 대사 3개를 따옴표 없이 넣으세요. 세 대사는 역할이 완전히 달라야 합니다: 1번 진행 — ${partner}가 방금 한 말(제안·부탁·정보·요구)을 받아들이거나 그 흐름대로 이야기를 앞으로 진행하는 말(수락, 다음에 할 일 확인, 바로 움직이겠다는 말). 2번 살짝 다른 방법 — 같은 화제에 응하되 방식을 바꾸는 말(조건 걸기, 보수 흥정, 다른 방법 제안, 의심하며 확인하기). 3번 거절 또는 상황에서 벗어나기 — 제안을 거절하거나 미루는 말, 또는 이 대화·상황에서 빠져나오는 말(다른 볼일을 대며 자리를 뜨기, 생각해 보겠다며 물러나기, 작별). 도발이나 허세, 새 질문이 아닙니다. 1번처럼 받아들이거나 출발하겠다는 말이면 안 됩니다. 셋 다 질문이거나 셋 다 같은 내용을 다르게 묻는 말이면 안 됩니다. ${playerVoice} '~라고 한다', '~을 묻는다', '~을 부탁한다' 같은 행동 서술은 금지입니다. 예: (X) 그 의뢰에 대해 자세히 알려 달라고 한다 → (O) 그 의뢰, 좀 더 자세히 알려 줄 수 있어요? playerAction이 이런 행동 서술이면 그 의도를 플레이어가 실제로 하는 말로 바꿔 playerLine에 넣고, 이미 대사이거나 다가가 말을 거는 행동뿐이면 playerLine은 빈 문자열입니다. check는 null, moveToPinId는 빈 문자열입니다. 관계나 호감도가 실제로 변했다면 relationshipUpdates에 반영하세요.`,
      `JSON의 첫 필드 nextAction: 이번 대답으로 플레이어가 다음에 할 행동이 정해졌으면(플레이어가 받아들이거나 나서겠다고 함) 지금 바로 하는 첫 행동 하나를 주어 없이 "~한다"로 끝나는 한 문장으로 씁니다(예: 북문을 나서 개척지로 간다). 그때 line은 그 결정을 들은 ${partner}의 짧은 한마디 하나이고, 게임이 대화를 닫고 그 행동을 다음 장면으로 이어 갑니다. 아직 대화로 나눌 이야기가 남았으면 빈 문자열입니다. 할 이야기가 남아 있는 동안 대화는 이어집니다. NPC는 매 대답마다 새 정보·결정·조건 중 하나를 꼭 내놓고, 같은 이야기를 반복하거나 질문으로 되묻기만 하며 시간을 끌지 마세요. 대화에는 끝이 있습니다. 다음 중 하나가 되면 ${partner}가 자연스럽게 마무리하는 말을 하고 endTalk:true를 반환하세요: 의뢰·퀘스트를 맡기거나 플레이어가 수락·거절함, 거래·약속이 성사되거나 결렬됨, 플레이어가 물은 것을 다 들어 더 나눌 이야기가 없음, ${partner}가 더 말하기 싫어하거나(반감·적대) 볼일이 있어 자리를 떠야 함, 플레이어가 작별 인사를 함. 할 말이 없는데 같은 이야기를 되풀이하거나 "더 궁금한 게 있나요?"로 대화를 억지로 이어 가지 마세요. endTalk:true일 때 choices는 빈 배열입니다. 지금까지 플레이어가 이 대화에서 한 말은 ${talkTurns}번입니다.${lastReply ? ` 이번이 이 대화의 마지막 대답입니다.${decided ? ' 플레이어가 할 일을 정하고 떠나려 합니다.' : ''} ${partner}는 플레이어의 말에 짧게 답한 뒤 작별·당부·응원 같은 마무리 한마디로 끝내세요. 질문이나 새 화제를 꺼내 대답을 기다리게 하지 마세요. endTalk:true를 반환하세요.` : talkTurns >= 3 ? ` 대화가 길어지고 있습니다. 새로 줄 정보나 결정이 없다면 이번 대답에서 정리하고 endTalk:true를 반환하세요.` : ''}`,
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
      '이번 요청은 선택지 다시 뽑기입니다. 장면을 진행하지 말고 상태도 바꾸지 마세요. text는 빈 문자열, 변경 필드는 모두 비우고, 최근 기록의 현재 장면에 맞는 새 선택지 3개만 choices에 넣으세요(셋 다 지금 장면에 대한 자연스러운 다음 행동: 1번 적극적으로, 2번 신중하게, 3번 의외의 수나 그 자리를 벗어나기).',
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
      const speech = voiceFor(sheet.speech || '', Number((p as { affection?: unknown }).affection) || 0);
      if (p.inScene || p.inParty || p.name === partner) (p as Profile & { sheet?: NpcSheet }).sheet = { ...sheet, speech };
      // A hand-written voice outranks one improvised earlier in the playthrough.
      if (speech) p.speechStyle = speech.slice(0, VOICE_LENGTH);
    }
    const sheetVoices = profiles.filter(p => typeof p?.name === 'string' && sheets[p.name as string]?.speech && p.speechStyle === voiceFor(sheets[p.name as string].speech || '', Number((p as { affection?: unknown }).affection) || 0).slice(0, VOICE_LENGTH) && (p.inScene || p.inParty || p.name === partner)).map(p => ({ name: String(p.name), style: String(p.speechStyle) }));
    const voiceless = profiles.filter(p => typeof p?.name === 'string' && !String(p.speechStyle || '').trim() && (p.inScene || p.inParty || p.name === partner)).slice(0, 4);
    const fixedVoices = [...sheetVoices, ...(voiceless.length && body.phase !== 'write' ? await assignVoices(voiceless.map(p => ({ name: String(p.name), profile: String(p.profile || '') })), genreText, body.genre === 'wuxia') : [])];
    for (const v of fixedVoices) { const p = profiles.find(x => x.name === v.name); if (p) p.speechStyle = v.style; }
    // Scenes are written in two steps: phase 'write' streams Terra's prose to the player; then this route is called again with
    // that prose as sceneText, and the routine model only fills in the game's fields (measured 2026-11-10: Luna wrote 120~160자
    // of a dice request in 6~7s; Terra wrote 400~600자 of story, first words after 1.7~3s).
    // Talk replies too (step 3, 2026-11-10): the partner's words and the player's next lines come from the writer in one call;
    // the six fix-up calls that patched Luna's talk replies (refill, redo, retry, rewrite, speech fixes) are gone.
    const prewritten = (!mode || mode === 'talk') && typeof body.sceneText === 'string' ? body.sceneText.slice(0, 6000) : '';
    const early = !!String(body.prologue || '').trim() || !!String(body.initialEquipment || '').trim();
    const wild = state.safePlace !== true || mode === 'combat' || body.debug === true;
    const system = [
      '당신은 한국어 CRPG의 AI GM입니다. 플레이어의 대사·의지·중요 선택을 임의 확정하지 마세요.',
      '본문 형식: 서술과 대사를 한 문단에 섞지 마세요. 서술이 끝나면 줄을 바꾸고, 인물이 소리 내어 하는 말은 반드시 큰따옴표로 감싸 그 말만 한 줄에 쓰고, 다시 줄을 바꿔 서술을 이어 가세요. 따옴표 없는 대사는 금지입니다. 예: 에드리아가 낡은 검을 잠시 바라본다.\n"늑대 무리를 쫓아냈다니, 다행이군."\n그녀는 다음 시험 일정을 짧게 전한다.',
      '이동·추적·수색처럼 과정이 긴 행동은 과정을 1~2문장으로 압축하고, 도착하거나 찾아낸 순간의 장면부터 쓰세요. 한 턴은 한 걸음이 아니라 한 장면입니다.',
      'currentState.locationName은 지금 이야기 속 위치이고 mapPin은 그 위치가 속한 지도 장소입니다. 이야기 속 장소가 지도에 없더라도(마을 안의 집, 숲 속 개척촌 등) 플레이어가 그곳으로 가면 막지 말고 바로 도착한 장면을 쓰세요. 장면 첫 줄 【】에는 지금 있는 이야기 속 장소 이름을 정확히 쓰세요. 선택지는 지금 있는 곳에서 할 수 있는 행동이어야 합니다.',
      '진행 원칙: 매 장면은 이야기를 실제로 한 걸음 나아가게 해야 합니다. 새 단서·정보 공개, 인물의 결정이나 행동, 사건 발생, 상황 변화, 거래·약속 성사 중 최소 하나가 이번 장면에서 일어나야 합니다.',
      '"준비가 필요하다", "장비를 갖춰야 한다", "아직 때가 아니다", "더 알아봐야 한다"처럼 진행을 미루는 말로 장면을 끝내지 마세요. 그런 조건은 같은 일에 한 번만 말하고, 플레이어가 준비 행동을 한 번 했거나 그대로 하겠다고 하면 바로 실행해 결과(성공·실패·대가)를 보여 주세요. 준비 부족은 막는 이유가 아니라 위험·대가·판정 난이도로 반영하세요.',
      '플레이어가 같은 사람에게 같은 주제를 다시 물으면 새 정보를 지어내 늘리지 말고, 아는 건 다 말했다고 짧게 끊은 뒤 직접 가 볼 장소나 만날 사람을 알려 주어 장면을 앞으로 밀어 주세요.',
      'NPC는 플레이어가 물은 것에 구체적으로 답합니다(누가·어디서·언제·어떻게). 둘러대거나 다음에 알려 주겠다고 미루는 건 그 인물이 감추는 비밀이거나 호감도가 낮을 때만입니다.',
      'addItems의 각 항목은 이름 문자열 또는 {"name":"아이템 이름","kind":"weapon|armor|accessory|item","desc":"한 문장 설명","skill":"고유 능력 이름(있을 때만)"} 객체입니다. 무기·방어구·장신구는 꼭 객체로 kind를 밝히고, 물약·열쇠·증표 같은 물건은 kind를 item으로 하세요. 등급(일반~신화)과 능력 수치는 게임 코드가 정하므로 이름에 등급을 붙이거나 수치를 지어내지 마세요. currentState.items에 각 소지품의 등급·종류·고유 능력이, equipped에 장착 중인 장비가 있으니 서술에 반영하세요.',
      '플레이어는 화면의 미니맵을 클릭해서만 장소를 이동합니다. moveToPinId는 항상 빈 문자열로 반환하세요. choices에 다른 장소로 가는 행동은 currentState.adjacentLocations의 이웃 장소로만 넣으세요. 지금 장소 안의 건물·구석·사람에게 가는 행동은 자유입니다.',
      // A player heading for 그림우드 was written back at 북문 초소, where the main story's next talk waited.
      '플레이어가 playerAction에서 어딘가로 가겠다고 하면(…로 가서, …로 돌아가, …로 향해) 이번 장면은 그곳에서 일어납니다. 퀘스트의 다음 일이 다른 곳에 있어도 플레이어를 그곳으로 데려가거나 판정·전투의 결과로 다른 장소에 옮겨 놓지 마세요. 그곳에 갈 이유는 선택지로만 제시하세요.',
      'playerAction이 "시스템이 이동을 확정했습니다"로 시작하면 플레이어는 이미 currentState.locationName에 도착했습니다. 도착한 장소의 모습과 그곳의 분위기·인물을 묘사하고, currentState.event가 있으면 그 도착 이벤트를 진행하세요.',
      'currentState.sceneNpcs는 직전 장면에서 플레이어 곁에 있던 NPC입니다. 이번 장면이 끝날 때 플레이어와 같은 자리에 있어 화면에 보여야 하는 NPC 이름을 presentNpcs 배열로 반환하세요(최대 3명). currentState.knownNpcs에 있는 인물은 그 표기를 정확히 쓰세요. 대화가 끝나 떠났거나 플레이어가 장소를 옮겼다면 빼고, 아무도 없으면 빈 배열입니다. 볼일이 끝난 인물은 자연스럽게 자리를 떠난 것으로 보고 빼세요. 같은 인물을 이유 없이 장면마다 계속 남겨두지 마세요.',
      'currentState.npcProfiles는 인물별 설정입니다(inScene:true는 지금 장면에 있는 인물). 인물의 대사와 행동은 profile의 성별·나이·신분·성격·목표에 맞추세요. 과묵한 인물은 짧게, 수줍은 인물은 머뭇거리며, 호탕한 인물은 시원시원하게 말하는 식으로 성격이 말과 행동에 드러나야 하고, 모든 인물이 같은 말투로 말하면 안 됩니다.',
      'npcProfiles에 sheet가 있는 인물은 그 설정집을 따르세요: personality(성격의 겉과 속), likes/dislikes(플레이어 행동이 likes에 맞으면 호감도를 올리고 dislikes에 걸리면 깎으며 그 인물이 실제로 반응), firstAttitude(첫 만남 태도), relations(다른 인물에 대한 태도와 언급), asCompanion(동료일 때의 모습과 실망하는 지점). 설정집 내용을 대사로 줄줄 설명하지 말고 행동과 반응으로 보여 주세요.',
      'speechStyle은 그 인물의 고정 말투입니다. "어체"에 적힌 한 가지 어체로, 한 대답 안에서도 여러 턴에 걸쳐서도 똑같이 말하고, 성격과 "버릇"이 어휘·말 길이·태도에 드러나게 하세요. "예:"의 대사가 그 인물의 실제 목소리입니다. speechStyle은 제작자 프롬프트의 "신분에 맞는 말투" 같은 지시보다 우선합니다. recentHistory나 withThisNpc에 그 인물이 speechStyle과 다른 어체로 한 말이 있으면 그건 잘못 쓴 것이니 따라 하지 말고, 이번 대답부터 speechStyle의 어체로 말하세요. 같은 어체 안의 말버릇은 이어 가도 됩니다. 이 규칙은 대화 모드뿐 아니라 일반 서술 속 대사에도 똑같이 적용됩니다. 직원·행인처럼 npcProfiles에 없는 이름 없는 인물도 한 장면 안에서는 처음 쓴 어체를 유지하세요. speechStyle이 빈 인물이 이번 응답에서 처음 말을 하면 profile에 어울리는 말투를 정해 npcVoices에 {"name":"정확한 이름","style":"어체: 해요체 | 어미: ~요, ~죠 | 버릇: ... | 예: ..."}로 반환하고 그 말투로 말하게 하세요(예: 수줍은 19세 여성 견습생 → "조심스러운 존댓말, ~요 어미, 말끝을 자주 흐림"). 여성 인물은 profile에 거칠다·호탕하다 같은 근거가 없는 한 "이놈", "크하하" 같은 거친 남성 어투나 군대식 말투를 쓰지 마세요. 나이·신분이 높은 여성은 "~하지요/~하세요/~란다" 같은 품위 있는 말투가 자연스럽습니다.',
      'currentState.gold는 플레이어가 가진 골드입니다. 이번 장면에서 플레이어가 실제로 돈을 내거나(물건·정보 구입, 뇌물, 숙박비) 받았으면(물건 판매, 전리품, 사례금) 그 액수를 goldDelta에 넣으세요(쓰면 음수). 가진 골드보다 많이 쓰는 거래는 성사시키지 말고 돈이 모자란다고 서술하세요. 퀘스트 완료 보수 골드는 게임이 자동으로 주므로 goldDelta에 넣지 마세요. 돈이 오가지 않았으면 0입니다.',
      'currentState.reputation은 세상이 플레이어를 아는 명성 점수(시작 0, 상한 없음)이고 reputationRank는 그 등급입니다. 등급 기준: 무명 0~99, 신참 100~499, 알려진 자 500~1,999, 유명인 2,000~4,999, 영웅 5,000~14,999, 전설 15,000 이상 / 수상한 자 -100 이하, 악명 높음 -1,000 이하, 공포의 대상 -5,000 이하. 사람들이 보거나 소문이 날 만한 일을 했을 때만 reputationDelta로 바꾸세요. 규모 기준: 동네 사람들이 알 만한 작은 선행·말썽 ±10~50, 이름 있는 인물을 돕거나 공개 결투에서 이김 ±50~200, 마을·세력 단위의 공적(마물 무리 토벌, 납치된 사람 구출, 큰 음모 폭로) ±300~1,000, 도시나 나라 전체가 아는 위업(재앙을 막음, 전설적 괴물 처치, 왕국의 운명을 바꿈) ±2,000~5,000. 의뢰·퀘스트 완료 자체의 기본 명성(+150)은 게임 코드가 주므로, 그 의뢰가 특히 큰 공적이었을 때만 그 차이만큼 더 주세요. 아무도 모르는 일이나 평범한 행동은 0입니다. NPC들은 플레이어의 명성 등급을 알고 첫 태도와 대우에 반영합니다(신참은 반신반의, 유명인 이상은 존중·경계·부탁, 악명은 공포·적대·문전박대).',
      'currentState.level과 xp는 플레이어의 성장 단계입니다. 전투 승리와 퀘스트 완료 경험치는 게임 코드가 자동으로 줍니다. 그 밖에 실제로 성장할 만한 경험을 했을 때만 xpGain에 종류를 적으세요(숫자 아님): "minor"는 어려운 판정 성공·위험을 무릅쓴 탐험 같은 작은 성취, "deed"는 중요한 비밀 해명·큰 위기 극복 같은 의미 있는 성취, "event"는 특별 이벤트·장소 이벤트·돌발 사건을 끝까지 해결했을 때만입니다. 이벤트가 막 시작됐거나, 어딘가로 이동·도착했거나, 무언가를 발견만 한 턴은 event가 아닙니다(빈 문자열이나 minor). 평범한 이동·대화·거래는 빈 문자열입니다. 실제 양은 게임 코드가 레벨에 맞춰 정합니다. 플레이어의 레벨이 오를수록 그에 걸맞은 강한 적과 큰 사건을 내되, 약한 상대(마을 사람 등)를 갑자기 강하게 만들지는 마세요.',
      'currentState.trainableStats는 플레이어의 성장형 능력치입니다. 이번 playerAction이 실제로 어떤 능력치를 단련했다면 그 id를 trained 배열에 최대 2개 넣으세요(예: 마법서 연구·주문 연습→지능, 운기조식→내공, 잠입·추격·곡예→민첩, 무거운 짐 나르기·힘겨루기→근력, 설득·협상→매력류). 레벨이 오를 때 많이 단련한 능력치가 더 크게 오릅니다. 평범한 이동·잡담·구경은 빈 배열입니다. 전투와 주사위 판정은 게임 코드가 따로 반영하므로 넣지 마세요.',
      '제작자 프롬프트의 메인 사건은 막 순서대로만 드러납니다. 아직 시작되지 않은 막의 사건, 그 막에서야 밝혀지는 물건·정체·진실(예: 나중 막에서 발견될 유물), [GM] 표시 비밀은 플레이어가 그 단계에 이르기 전까지 서술·선택지·NPC 대사·퀘스트 어디에도 언급하지 마세요. 진행 정도는 recentHistory·storySoFar·historyFlags의 대사건 기록으로 판단합니다.',
      '서술에서 플레이어에게 다음에 할 일을 조언하거나 정리해 주지 마세요("~하는 것도 좋겠다", "그 뒤에는 ~로 이동해 ~를 추적할 수 있다" 금지). 장면만 보여 주고 판단은 선택지로 맡기세요.',
      '이 세계는 메인 이야기 밖에서도 살아 있습니다. 플레이어가 어디서 무엇을 하든 그 장소에 어울리는 인물이 나와 장면을 끌고 가게 하세요. 그 자리에 어울리는 기존 인물(npcProfiles, currentState.knownNpcs)을 먼저 쓰고, 그 장소·역할에 맞는 사람이 정말 없을 때만 세계관에 맞는 이름을 붙인 새 인물을 한 장면에 한 명까지 만들 수 있습니다. 새 인물은 본문에 이름을 쓰고, presentNpcs와 relationshipUpdates(met:true, relation은 "초면" 같은 짧은 말)에 넣고, npcVoices에 말투를 정해 주세요. 이름은 currentState.knownNpcs와 겹치지 않게 하세요. 스쳐 지나가는 사람은 이름 없이 역할로만 묘사해도 됩니다. 새로 등장시키는 사람은 단역·행인·상인·경비병·적대 인물까지 모두 여성입니다. 남성 인물은 만들지 마세요(몬스터는 예외). 말투도 여성 인물답게 쓰세요: npcProfiles의 sheet에 speech가 있으면 그대로 따르고, 없으면 "놈", "형씨", "껄껄" 같은 남성적인 표현은 쓰지 마세요.',
      'currentState.reservedNpcs의 인물은 메인 이야기에서 나중에 처음 등장합니다. 아직 장면에 등장시키거나 이름으로 언급하지 말고, 그 사람이 맡을 법한 역할이 지금 필요하면 새 인물로 채우세요.',
      '장면은 정지된 풍경으로 끝나지 않습니다. 인물들은 원하는 것(npcProfiles의 설정·기억)에 따라 먼저 움직입니다: 다가와 묻거나, 요구하거나, 제안하거나, 소식을 들고 오거나, 계산하고 결심합니다. 장면 끝은 그런 인물의 말·행동이나 막 터진 일로 맺어 플레이어가 반응할 거리를 남기세요. 플레이어가 한 일은 세상에 흔적을 남기고, 인물들은 그것을 기억해 반응합니다.',
      'currentState.party는 플레이어와 함께 다니는 동료 NPC입니다(npcProfiles에서 inParty:true). 동료는 장면을 옮겨도 늘 곁에 있으므로 presentNpcs에는 넣지 마세요. 서술에서 동료가 자기 성격과 말투로 가끔 한마디 거들거나 의견을 내고, 자기 목표·가치관에 반하는 플레이어 행동에는 반대하거나 실망하게 하세요(필요하면 relationshipUpdates로 호감도 반영). 전투에서는 동료도 함께 싸웁니다. 동료 합류·이탈은 게임 코드가 처리하니 서술로 동료를 새로 합류시키거나 떠나보내지 마세요.',
      'hpDelta는 이번 행동으로 변한 HP 양(회복 양수, 피해 음수)입니다. 불필요하면 0입니다. HP가 0이 되면 플레이어는 사망하고 게임이 끝납니다(구출·기적 없음, 제작자 프롬프트의 사망 완화 규칙보다 우선). 함정·추락·독처럼 전투 밖 피해로 HP를 0까지 깎는 것은 정말 살아날 수 없는 상황에서만 하고, 그렇지 않으면 빈사(HP 1)에서 멈추세요.',
      '현재 상태는 explicitGameState.currentValues가 우선이며 historyFlags는 이미 발생한 사실의 기록이다. 경지·소속·막·재물 같은 현재 값은 이전 값과 동시에 적용하지 않는다. addFlags에는 현재 값 갱신과 사건 기록을 명확히 구분해 반환한다.',
      '각 장면이 끝날 때 플레이어가 고를 행동 3가지를 choices 문자열 배열로 제시하세요(네 번째는 플레이어가 직접 입력합니다). 세 선택지는 모두 방금 장면 끝에 놓인 상황(눈앞 인물의 말·행동, 벌어진 일, 이 장소에서 할 수 있는 일)에 대한 플레이어의 자연스러운 다음 행동입니다. 셋은 태도나 방법이 확실히 달라야 합니다: 1번 적극적으로 나서거나 받아들이기, 2번 신중하게 살피거나 떠보거나 캐묻기, 3번 의외의 수를 두거나 그 자리를 벗어나 다른 데로 가기(이웃 장소 currentState.adjacentLocations, 곁가지 이야기 directorNotes.threads의 인물·장소). 정해진 길로 끌고 가는 느낌이 없어야 합니다: 장면과 상관없이 퀘스트 장소로 돌아가라는 선택지는 넣지 말고, 퀘스트 쪽 행동은 지금 장면이 그 일과 이어져 있을 때(그 장소에 있음, 그 인물이 앞에 있음, 방금 그 소문·단서를 들음)만 그중 하나로 자연스럽게 넣으세요. 체력은 전투가 아닌 장면마다 게임이 저절로 조금씩 회복시키므로 휴식·회복하러 가기·잠자기 같은 선택지는 넣지 마세요. 각 선택지는 지문처럼 행동을 쓴 뒤 플레이어의 속마음이나 이유를 짧게 한 문장 덧붙여도 됩니다. 각 선택지의 target에 그 행동의 대상(인물·장소·적·사물 하나)을 쓰세요. 비밀을 미리 알거나 결과를 확정하지 마세요.',

      '선택지는 그대로 플레이어의 행동으로 쓰이는 1인칭 행동 문장이며, 꼬리표·머리말 없이 행동만 씁니다. 선택지가 점점 단순해지지 않게 하세요. "주변을 살펴본다", "이야기를 듣는다", "다음 장소로 향한다" 같은 막연한 행동은 금지입니다. 각 선택지는 구체적인 대상(이름 있는 인물·물건·장소·단서)과 의도·방법을 담은 한 문장입니다. recentHistory에서 플레이어가 이미 했던 것과 같은 유형의 행동은 다시 제시하지 마세요.',
      'keyFacts는 지금까지 확정된 핵심 사실(막의 결과, 죽음·배신·합류, 밝혀진 비밀, 큰 결정과 약속, 중요한 물건)입니다. 아무리 오래된 일이어도 절대 잊거나 어기지 마세요: 죽은 인물은 살아 돌아오지 않고, 배신한 인물은 그 일을 기억하며, 맺은 약속은 유효합니다.',
      'storySoFar는 recentHistory보다 앞선 플레이의 장기 기억입니다. 그 안의 사실·약속·인물 관계와 모순되게 서술하지 말고, 이미 끝난 사건을 처음 일어나는 것처럼 반복하지 마세요. 장면에 자연스럽게 맞으면 [진행 중인 사건·떡밥]이나 [약속·거래·빚]을 다시 불러와 서술이나 선택지에 엮으세요.',
      'currentState.placeSeed는 이야기 감독이 미리 짜 둔 "지금 이 장소에 있는 사람과 벌어지고 있는 일"입니다. 플레이어가 이곳에 처음 도착했거나 메인과 상관없는 일을 하면, 새로 지어내지 말고 이 설정의 인물과 사건을 꺼내 쓰세요. 설정에 있는 이름·역할·관계는 그대로 지키세요. 설정의 "그냥 두면 곧 벌어질 일"은 플레이어가 그 일에 손대지 않고 몇 장면이 지나면 실제로 터뜨리세요. currentState.event(장소 이벤트)가 있으면 그것을 충실히 진행하고, 조건 없는 보상·아이템·HP 변경은 만들지 마세요. 아이템은 인벤토리의 정확한 이름으로만 소비합니다.',
      'currentState.directorNotes는 이야기 감독이 최근 장면들을 검토해 남긴 메모입니다. fixes는 앞선 장면에서 기록·핵심 사실과 어긋난 점이니, 이번 장면에서 따로 설명하지 말고 자연스럽게 맞는 쪽으로 서술하세요. threads는 아직 끝나지 않은 곁가지 이야기입니다. 플레이어가 그 인물·장소로 가거나 그 일을 꺼내면 그 이야기를 이어서 쓰고, 처음부터 다시 만들지 마세요.',
      '판정 요청(check가 존재) 시에는 choices:[]를 반환하세요. 주사위 결과를 받은 후에는 그 결과에 맞는 새 선택지 3개를 제시하세요.',
      'currentState.availableImages는 제작자가 업로드한 이미지 키 목록입니다. 장면에 적합한 키가 있을 때만 imageKey로 목록에 있는 문자열 하나를 정확히 반환하세요. 없으면 빈 문자열을 반환하세요. 없는 이미지를 지어내지 마세요.',
      '관계도는 실제 플레이에서 플레이어가 직접 만난 NPC만 기록합니다. 단순 언급, 소문, 배경 설정, 아직 만나지 않은 프롤로그 인물은 추가하지 마세요. 새 NPC와 직접 대면/대화했다면 relationshipUpdates에 {name,met:true,relation,affection}을 넣으세요. 이미 기록된 NPC의 관계 또는 호감도가 사건으로 실제 변했다면 {name,met:false,relation,affectionChange}를 넣으세요. affection은 첫 만남의 첫인상 값(-100~100: -100 철천지원수, 0 무관심, 100 목숨을 맡길 신뢰)이고, affectionChange는 이번 장면에서 오르내린 양(예: 5, -8)입니다. 현재 값은 게임이 더하므로 다시 적지 마세요. 첫 만남은 보통 -10~20이고, 첫인상이 나쁘거나 세력·목표가 충돌하면 처음부터 음수로 시작합니다. 플레이어가 인물의 성격·목표·소속에 반하는 행동(모욕, 협박, 약속 파기, 거짓말 들킴, 동료를 해침, 이익 침해)을 하면 깎고, 목표를 돕거나 약속을 지키면 올리세요. 한 장면의 변화는 보통 ±3~15, 결정적 배신이나 큰 은혜만 ±25까지입니다. 특별한 변화가 없으면 affectionChange를 넣지 마세요. 해당 사항이 없으면 빈 배열입니다.',
      'npcProfiles의 attitude는 그 인물의 현재 호감도 단계와 그 단계에서 해야 할 행동입니다. 태도는 말투만이 아니라 실제 행동과 결과로 보여 주세요. 같은 부탁이라도 단계에 따라 결과가 달라야 합니다: 반감·적대 인물은 정보를 숨기거나 거짓말하고, 값을 올리거나 거절하고, 플레이어 몰래 방해하며, 적대 인물은 위협·경비 호출·공격까지 갑니다. 호의·신뢰 인물은 먼저 도움을 주고 할인·단서·비밀을 내줍니다. 말로는 화를 내면서 결국 순순히 도와주는 식으로 처리하지 마세요. 반감 이하 인물의 협조가 필요한 행동에는 D20 판정의 dc를 3~6 올리고, 호의 이상이면 3~6 내리거나 판정 없이 성공시키세요. 선택지(choices)에도 관계가 드러나게 하세요(예: 적대 인물 앞에서는 달래기·협박·피하기·대가 제시처럼 관계를 다루는 선택지).',
      '토벌을 부탁받아 맡는 목표는 문장에 currentState.monsters의 이름을 표기 그대로 넣으세요(예: "숲 트롤 토벌하기"). 그 몬스터를 전투로 이기면 게임이 완료 처리합니다.',
      'currentState.currentGoal은 플레이어가 지금 몰두하고 있는 일이며, 화면에 보이는 목표는 이것 하나입니다. 장면은 플레이어의 행동과 이 일을 중심으로 이어 가고, quests의 다른 일은 플레이어가 그쪽으로 움직이거나 장면이 자연스럽게 닿을 때만 꺼내세요.',
      'currentState.quests는 플레이어가 지금 진행 중인 목표(퀘스트) 목록이며 최대 currentState.maxQuests개까지 동시에 가질 수 있습니다. NPC에게 의뢰·부탁을 받아 플레이어가 수락했거나, 사건으로 새로 해야 할 일이 분명해졌을 때만 addQuests에 {"text":"구체적 대상과 할 일이 담긴 짧은 한 문장, 40자 이내","giver":"의뢰한 NPC의 정확한 이름(없으면 빈 문자열)"} 형태로 새 목표를 넣으세요. 플레이어가 수락하지 않은 제안은 넣지 말고, 기존 목표와 같은 일은 다시 넣지 마세요. 목표 하나는 일 하나입니다. 기존 목표 문장을 고쳐 쓰거나 내용을 덧붙여 늘리지 마세요(완료 처리 후 더 긴 같은 목표를 다시 넣는 것도 금지). 같은 목표가 진행돼 다음 단계가 생겨도 기존 목표는 그대로 두고 서술로만 보여 주세요. 새로 생긴 다른 일(다른 인물의 의뢰, 새 장소 조사 등)만 addQuests에 별도 항목으로 넣으세요. 목표를 실제로 이뤄 냈으면 currentState.quests의 문장을 글자 그대로 completedQuests에, 실패·포기·무의미해졌으면 failedQuests에 넣으세요. 변화가 없으면 모두 빈 배열입니다. 퀘스트 완료 기본 보상(명성 +150, 의뢰인 호감도 +10)은 게임 코드가 자동으로 주므로, 완료 그 자체에 대해서는 reputationDelta나 의뢰인 relationshipUpdates를 따로 올리지 마세요(완료 과정에서 생긴 다른 일은 반영). 퀘스트를 완료하는 턴에는 의뢰인이나 그 일의 결과로 손에 들어오는 보수 장비 하나(무기·방어구·장신구)를 addItems에 {"name","kind","desc"} 객체로 넣고 장면에서 건네받는 모습을 묘사하세요. 등급은 게임 코드가 정하며, 넣지 않으면 게임이 대신 지급합니다. 최종 목표는 플레이어에게 보이지 않는 GM 전용 정보입니다. 최종 목표를 목록에 그대로 넣거나 서술에서 밝히지 말고 사건을 통해 자연스럽게 드러나게 하세요. 최종 목표가 single이면 구체적 승리 조건이 실제 충족된 경우에만 finalGoalCompleted:true를 반환하세요. progress이면 currentState.finalGoalSteps의 각 단계를 실제 달성한 경우에만 0부터 시작하는 해당 인덱스를 completedGoalSteps 배열에 넣으세요. 이미 완료한 단계는 반복할 필요 없습니다. 아직 달성하지 않은 단계는 절대 완료 처리하지 마세요. progress 모드에서는 finalGoalCompleted:true만으로 종료할 수 없고 모든 단계 완료 시에만 엔딩을 서술하세요.',
      'text·choices·gesture는 모두 자연스러운 한국어로만 쓰세요. 러시아어·일본어 등 다른 언어 단어를 섞지 마세요(세계관 고유명사는 예외).',
      '다음 JSON 객체만 반환하세요: {"text":"GM의 한국어 묘사","hpDelta":0,"addItems":[],"removeItems":[],"addFlags":[],"imageKey":"","moveToPinId":"","check":null,"choices":[{"text":"","target":""},{"text":"","target":""},{"text":"","target":""}],"presentNpcs":[],"npcVoices":[],"reputationDelta":0,"goldDelta":0,"xpGain":"","trained":[],"ambush":"","relationshipUpdates":[],"addQuests":[],"completedQuests":[],"failedQuests":[],"completedGoalSteps":[],"finalGoalCompleted":false}',
      // Older games still carry the outdated engine rules in their saved prompt; they are rewritten before the GM sees them.
      '제작자 프롬프트(세계관·인물·사건 설정. 응답 분량·선택지 개수·전투·사망·호감도 같은 진행 규칙이 위 시스템 규칙과 다르면 시스템 규칙을 따르세요):\n' + alignEngineRules(String(body.prompt || '')).slice(0, 7000),
      // Everything above is the same turn after turn, so OpenAI caches it; what changes per turn comes last (it used to sit in
      // the middle, and every scene re-read ~19K tokens from scratch).
      // Only in the first turns (page.tsx stops sending them): the opening, and the starting gear as the prompt describes it.
      ...(early ? ['시작 소지품은 프롬프트의 명시적 시작 소지품 규칙과 게임 설정에서 직접 추가한 장비를 합쳐 구성합니다. currentState.inventory가 실제 소유 목록입니다. 이미 지급된 시작 아이템을 addItems로 중복 지급하지 마세요. 규칙 아이템의 능력과 제한은 ruleEquipment의 원문을 존중하세요.'] : []),
      ...(early ? ['새 게임 시작 시 플레이어에게 표시한 프롤로그가 있다면 이미 일어난 사실로 존중하고 이어서 진행하세요. 프롤로그를 다시 처음부터 설명하지 마세요. 플레이어의 의지나 행동을 임의 확정하지 마세요.'] : []),
      ...(early ? ['확정된 시작 장비 목록:\n' + String(body.initialEquipment || '').slice(0, 2000)] : []),
      ...(early ? ['프롬프트에서 가져온 시작 장비의 원문 능력과 조건:\n' + JSON.stringify(body.ruleEquipment || []).slice(0, 4000)] : []),
      ...(!!String(body.prologue || '').trim() ? ['게임 프롤로그:\n' + String(body.prologue || '').slice(0, 5000)] : []),
      // Monsters only where they can turn up; asking for a roll and using one are told apart.
      ...(wild ? ['currentState.monsters는 이 세계관에 존재하는 적대 몬스터·적대 무리 목록입니다. 몬스터는 처음부터 사람과 적대이며 NPC가 아닙니다: presentNpcs와 relationshipUpdates에 넣지 말고 대화 상대로 만들지 마세요. 목록에 없는 몬스터를 지어내거나 다른 세계관의 존재(무협에 고블린·드래곤, 판타지에 강시 등)를 등장시키지 마세요. 이야기상 습격이 자연스러울 때(위험한 곳에서 방심, 추적당함, 함정, 사건의 결과)만 ambush에 목록의 정확한 이름 하나를 넣으세요. 그러면 게임 코드가 곧바로 전투를 시작하니 서술은 습격 직전에서 멈추세요. boss:true인 존재는 메인 사건의 클라이맥스에서만 씁니다. 평범한 장면은 ambush를 빈 문자열로 두세요.'] : []),
      ...(!body.diceResult ? ['D20은 플레이어가 고른 행동 자체가 위험하거나 남과 겨루는 일일 때만 요청합니다(잠입, 추격, 함정 해제, 절벽 오르기, 거짓말·협박, 억지로 문 열기 등). 이동·도착, 장소에 들어가기, 평범한 대화, 정가 거래, 둘러보기·소리 듣기에는 절대 요청하지 않습니다.'] : []),
      ...(!body.diceResult ? ['판정이 필요하면 text에 지금 무엇이 위험하고 왜 굴리는지를 한두 문장으로 분명히 쓰고, check에 {ability,label,dc,reason,success,failure}을 반환하세요. success는 성공하면 얻는 구체적인 것(예: 사냥꾼보다 먼저 흔적을 찾아 은신처 위치를 알아냄), failure는 실패하면 치르는 구체적인 대가(예: 덫에 걸려 HP 피해, 적에게 들켜 습격당함)로 각 40자 이내입니다. ability는 currentState.characterValues에 존재하는 숫자형 능력치 ID 중 하나여야 합니다. 판정 요청 단계에서는 성공·실패·피해·보상·이동을 확정하지 말고 변경 필드를 비우세요. 판정이 필요 없으면 check:null입니다.'] : []),
      ...(!!body.diceResult ? ['diceResult가 제공되면 이미 확정된 판정입니다. 같은 행동에 주사위를 다시 요청하지 말고 check:null을 반환하세요. 성공/실패는 diceResult.success를 반드시 따르고, diceResult.onSuccess/onFailure에 미리 약속한 결과를 실제로 일으키세요. 성공은 눈에 보이는 이득(새 단서·물건 addItems·목표 진척·적보다 유리한 위치)이고, 실패는 눈에 보이는 대가(들켜서 ambush 습격, 물건 잃음 removeItems, 호감도 하락, 적이 먼저 움직임)입니다. 경험치·골드·명성·HP는 게임이 판정의 무게로 정하니 xpGain·goldDelta·reputationDelta·hpDelta는 비워 둡니다. "아무 일도 일어나지 않았다"로 끝내지 마세요. 실패해도 이야기는 대가를 치르고 앞으로 나아갑니다.'] : []),
      ...pacingRules,
      ...modeRules,
      ...debugRules,
      ...rerollRules,
      ...(prewritten && mode === 'talk' ? ['이번 대화의 대답은 이미 쓰여 플레이어에게 보였습니다(sceneText: "---" 위는 상대의 말, 아래는 주인공의 다음 말 후보나 [대화 끝]). 대답을 새로 쓰지 말고 line·text·playerLine·nextAction은 빈 문자열, choices는 빈 배열로 두세요. sceneText에서 실제로 오간 일에 맞게 나머지 필드만 채우세요: relationshipUpdates(이번 대화로 달라진 호감은 affectionChange), addQuests(새로 맡은 일), completedQuests, failedQuests, goldDelta, addItems, removeItems(실제로 주고받은 것), reputationDelta, howKnown·knownItem, npcVoices.'] : []),
      ...(prewritten && !mode ? ['이번 장면의 본문은 이미 쓰여 플레이어에게 보였습니다(sceneText, "---" 아래는 선택지나 판정). 장면을 새로 쓰지 말고 text는 빈 문자열, choices는 빈 배열, check는 null로 두세요. sceneText에서 실제로 일어난 일에 맞게 나머지 필드만 채우세요: hpDelta, goldDelta, addItems, removeItems, addFlags, relationshipUpdates, presentNpcs, npcVoices, addQuests, completedQuests, failedQuests, reputationDelta, xpGain, trained, ambush(몬스터가 덮쳐 오는 장면이면 그 이름), imageKey.'] : []),
      '응답은 위에서 정한 JSON 객체 하나만 반환하고, 본문·선택지·대사는 자연스러운 한국어로 씁니다.',
      ...(body.recentCheck === true ? ['직전 행동들에서 이미 주사위를 굴렸습니다. 이번 장면에서는 check를 요청하지 말고 결과를 바로 서술하세요.'] : []),
    ].join('\n\n');
    // Flags already travel deduplicated in explicitGameState; listing every map's pins only matters for the current map.
    // The message is never cut mid-JSON: older history is dropped first so the action and memory always arrive whole.
    const { flags: _flags, locations: allLocations, ...stateRest } = state;
    const { monsters: _monsters, ...stateCore } = stateRest;
    const modelState = { ...(wild ? stateRest : stateCore), ...(body.debug === true ? { locations: Array.isArray(allLocations) ? allLocations.filter((p: { mapId?: string }) => p?.mapId === state.currentMapId).slice(0, 60) : [] } : {}) };
    const partnerStyle = String(profiles.find(p => p?.name === partner)?.speechStyle || '');
    const keepsOldSpeech = /하오체|하게체/.test(partnerStyle);
    // The model copies what the partner said before: one old line in a save's history took 에드리아 from 2% to 30%.
    const spokeOld = (h: string) => mode === 'talk' && !keepsOldSpeech && h.startsWith(`${partner}: "`) && oldSpeech(h);
    const recent = history.filter((h: string) => !spokeOld(h));
    const withThisNpc = mode === 'talk' && Array.isArray(body.withThisNpc) ? body.withThisNpc.filter((x: unknown) => typeof x === 'string' && !spokeOld(x)).slice(-30).map((x: string) => x.slice(0, 300)) : [];
    const userContent = () => JSON.stringify({ playerAction: body.action, ...(prewritten ? { sceneText: prewritten } : {}), diceResult: body.diceResult || null, keyFacts, storySoFar, withThisNpc, recentHistory: recent, explicitGameState, currentState: modelState });
    while (userContent().length > 30000 && recent.length > 6) recent.shift();
    // Measured on hard cases: the partner's own lines as an earlier exchange took old endings from 18% to 7%; rewording the rules changed nothing.
    const voiceLines = mode === 'talk' ? [...(partnerStyle.split('예:')[1] || '').matchAll(/["“]([^"”]+)["”]/g)].map(m => m[1]).filter(l => keepsOldSpeech || !oldSpeech(l)) : [];
    // Scenes that move the story (a quest step happens or ends, a region story opens, interference, a stalled scene, a quest
    // talk) still run on the routine model so the player never waits on the major one; the client has it review them afterwards (/api/gm/director).
    const majorScene = !mode && body.interfere === true;
    if (process.env.NODE_ENV !== 'production') { try { const u = JSON.parse(userContent()); appendFileSync(path.join(process.cwd(), '.next', 'gm-size.jsonl'), JSON.stringify({ ts: new Date().toISOString(), mode: mode || 'scene', system: system.length, user: userContent().length, parts: Object.fromEntries(Object.entries(u).map(([k, v]) => [k, JSON.stringify(v ?? '').length])), state: Object.fromEntries(Object.entries(modelState).map(([k, v]) => [k, JSON.stringify(v ?? '').length]).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 12)) }) + '\n'); } catch {} }
    const streamWrite = async (writer: string, input: unknown, tag: string) => {
      const up = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'x-usage-tag': tag },
        body: JSON.stringify({ model: process.env.OPENAI_GM_MAJOR_MODEL || process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', reasoning_effort: 'low', stream: true, messages: [{ role: 'system', content: writer }, { role: 'user', content: JSON.stringify(input) }] }),
        cache: 'no-store', signal: AbortSignal.timeout(60000),
      });
      if (!up.ok || !up.body) return NextResponse.json({ error: '글쓰기 실패' }, { status: 502 });
      const reader = up.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
      return new Response(new ReadableStream({
        async start(ctrl) {
          let buf = '';
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let i;
              while ((i = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
                if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
                try { const d = JSON.parse(line.slice(5))?.choices?.[0]?.delta?.content; if (d) ctrl.enqueue(enc.encode(d)); } catch {}
              }
            }
          } finally { ctrl.close(); }
        },
      }), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    };
    if (body.phase === 'write' && mode === 'talk' && body.reroll !== true) {
      const me = profiles.find(p => p?.name === partner) || { name: partner };
      const opening = talkTurns === 0;
      const talk = {
        partner: { name: partner, profile: me.profile, remembers: (me as { remembers?: unknown }).remembers, attitude: (me as { attitude?: unknown }).attitude, speechStyle: me.speechStyle || '' },
        purpose: String(body.talkPurpose || '').slice(0, 300), playerSaid: body.action, talkSoFar: recent.slice(-14), withThisNpc, keyFacts, storySoFar: storySoFar.slice(0, 4000),
        now: { story: String(state.storyPlan || '').slice(0, 1200), location: state.locationName || '', currentGoal: state.currentGoal || '', gold: state.gold, inventory: state.inventory || [], party: state.party || [], reservedNpcs: state.reservedNpcs || [] },
      };
      const writer = [
        `당신은 한국어 CRPG의 대화를 씁니다. 주인공(플레이어)과 ${partner}가 마주 보고 이야기하는 메신저식 대화창이고, 당신은 ${partner}의 대답을 씁니다.`,
        `자료: partner는 ${partner}의 설정(profile), 주인공에 대한 기억(remembers), 지금 태도(attitude), 말투(speechStyle)입니다. purpose는 주인공이 이 대화를 시작한 까닭, playerSaid는 주인공이 방금 한 말이나 행동, talkSoFar는 최근에 오간 말, withThisNpc는 두 사람 사이에 전에 있었던 일, now.story·storySoFar·keyFacts는 지금까지의 이야기입니다.`,
        `${partner}는 자기 목적과 사정을 가진 사람입니다. 매 대답에서 새 정보, 조건, 요구, 감정 중 하나를 내놓아 이야기를 앞으로 밀고, 이미 한 말은 되풀이하지 않습니다. 말투는 speechStyle 그대로(어체·어미·버릇), 태도는 attitude에 맞는 실제 대답(숨기기, 값 올리기, 먼저 돕기)으로 드러납니다. ${partner}는 직접 보거나 들은 것만 알고, 지금 이 자리(now.location)에서 말합니다.`,
        `형식: ${partner}의 말을 1~3줄로 씁니다. 한 줄이 말풍선 하나이고, 따옴표와 이름표 없이 말만 씁니다. 표정이나 몸짓이 필요하면 첫 줄 맨 앞에 (괄호)로 짧게 씁니다.${opening ? ` 이번은 대화의 첫마디입니다: purpose를 보고 ${partner}가 먼저 반응합니다.` : ''}`,
        `말이 끝나면 "---"만 쓴 줄을 두고, 그 아래에 셋 중 하나를 씁니다. (가) 주인공이 이번 말로 무엇을 하겠다고 스스로 정했으면(받아들임, 나서겠다고 함, 어디로 가겠다고 함): "[대화 끝: 그 행동]" 한 줄. 행동은 주인공이 지금 바로 하는 첫 행동 하나를 주어 없이 "~한다"로 끝나는 한 문장으로 씁니다(예: 개척지로 간다). (나) 그 밖에 대화가 끝났으면(${partner}가 할 일·갈 곳·기다릴 곳을 정해 줌, 작별, 거절하고 돌아섬, 볼일이 있어 떠남): "[대화 끝]" 한 줄과, 그 아래에 대화가 끝난 뒤 주인공이 고를 행동 3개를 "1. ", "2. ", "3. "으로 한 줄씩. 셋은 서로 다른 방향의 결정입니다: 1 ${partner}가 정해 준 일을 하거나 이야기를 앞으로 미는 행동, 2 다른 방법으로 자기 뜻을 밀어붙이는 행동, 3 아무도 예상 못 한 수. 주어 없이 "~한다"로 끝나는 한 문장입니다. (다) 그 밖에는 주인공이 이어서 할 말 3개를 "1. ", "2. ", "3. "으로 한 줄씩: 1 받아들이거나 이야기를 앞으로 미는 말, 2 조건·흥정·의심처럼 다른 방법으로 응하는 말, 3 거절하거나 물러나는 말. 주인공이 입 밖에 내는 말 그대로 씁니다. ${playerVoice}`,
        ...(opening ? ['첫마디에서는 (다)를 씁니다.'] : lastReply ? [`이번이 이 대화의 마지막 대답입니다: ${partner}는 짧게 답하고 마무리하며, "---" 아래는 (가)나 (나)입니다.`] : []),
        '모든 글은 자연스러운 한국어로만 씁니다.',
        '세계관(제작자 프롬프트):\n' + alignEngineRules(String(body.prompt || '')).slice(0, 5000),
      ].join('\n\n');
      return streamWrite(writer, talk, 'talk-write');
    }
    if (body.phase === 'write' && !mode && body.reroll !== true) {
      const u = JSON.parse(userContent());
      const cv = (state.characterValues || {}) as Record<string, unknown>;
      const statNames = new Map<string, string>((Array.isArray(state.trainableStats) ? state.trainableStats : []).map((t: { id?: unknown; name?: unknown }) => [String(t?.id || ''), String(t?.name || '')]));
      const abilities = Object.entries(cv).filter(([, v]) => v !== '' && Number.isFinite(Number(v))).map(([k]) => statNames.get(k) ? `${k}(${statNames.get(k)})` : k);
      // Who is physically here and who isn't: given one list, Terra brought 카시아 and a dock worker along from 사레타 to 그림우드.
      const card = (n: Record<string, unknown>) => ({ name: n.name, profile: n.profile, remembers: n.remembers, attitude: n.attitude, speechStyle: n.speechStyle });
      const profileList: Record<string, unknown>[] = Array.isArray(state.npcProfiles) ? state.npcProfiles : [];
      const presentPeople = profileList.filter(n => n.inScene || n.inParty).map(card);
      const awayPeople = profileList.filter(n => !n.inScene && !n.inParty).map(card);
      const events = [
        ...(body.interfere === true ? ['주인공과 적대하는 세력이 지금 하는 일을 방해합니다'] : []),
      ];
      // How long a scene runs is the game's call, from what it knows is coming: the player's own moments that change what comes
      // next (a risky attempt's outcome) are written out; arriving and plain
      // situation are kept short (user, 2026-11-10: skip plain description, tell future-changing moments and decisions well).
      const arrived = String(body.action || '').startsWith('시스템이 이동을 확정');
      const length = body.diceResult ? '1,000~1,800자. 앞으로를 바꾸는 순간입니다: 무엇이 걸렸는지, 인물들이 어떻게 움직이고 반응하는지, 주인공의 선택이 무엇을 바꿨는지를 긴장과 감각 속에 자세히 씁니다.'
        : arrived ? '400자 안팎. 도착은 짧게 넘기고, 그곳에서 지금 벌어지고 있는 일 하나에 바로 닿습니다.'
        : '300~600자. 주인공의 행동과 그 결과를 보여 주고, 단순한 상황 설명은 건너뜁니다.';
      const scene = {
        playerAction: body.action, ...(events.length ? { mustHappen: events } : {}), length, diceResult: body.diceResult || null, keyFacts, storySoFar, recentHistory: recent,
        now: { story: String(state.storyPlan || '').slice(0, 1500), location: state.locationName || '', mapPin: state.mapPin || '', nearby: Array.isArray(state.adjacentLocations) ? state.adjacentLocations.filter((l: { kind?: unknown }) => l?.kind !== 'event').map((l: { name?: unknown }) => l?.name) : [],
          event: state.event || '', placeSeed: state.placeSeed || '', localStories: Array.isArray(state.localStories) ? state.localStories.slice(0, 4) : [], directorNotes: state.directorNotes || null, unanswered: Array.isArray(state.unanswered) ? state.unanswered.slice(0, 4) : [], whereabouts: Array.isArray(state.whereabouts) ? state.whereabouts.slice(0, 24) : [], currentGoal: state.currentGoal || '', otherStories: state.quests || [],
          hp: state.hp, maxHp: state.maxHp, gold: state.gold, inventory: state.inventory || [], party: state.party || [], level: state.level, reputationRank: state.reputationRank || '',
          ...(arrived ? { justArrived: true } : {}), presentPeople, awayPeople, cast: Array.isArray(state.cast) && state.cast.length ? state.cast.slice(0, 30) : state.knownNpcs || [], reservedNpcs: state.reservedNpcs || [], monsters: wild ? (Array.isArray(state.monsters) ? state.monsters : []).filter((m: { boss?: unknown }) => !m?.boss).map((m: { name?: unknown; desc?: unknown }) => String(m?.name || '') + ': ' + String(m?.desc || '').slice(0, 60)) : [], abilities, safePlace: state.safePlace === true },
      };
      const writer = [
        '당신은 한국어 CRPG의 이야기꾼입니다. 세계관과 지금까지의 이야기를 이어 다음 장면 하나를 씁니다. 이 이야기의 주인공은 플레이어 캐릭터이고, now.story가 이 이야기의 설계도입니다(주인공이 원하는 것과 짊어진 것, 주인공과 얽힌 인물들). 다음에 무슨 일이 일어날지는 당신이 정합니다. 이 게임에서 장면은 진행기록입니다: 상황, 주인공의 행동과 그 결과, 벌어진 사건, 달라진 것을 서술로 씁니다. 사람과 주고받는 말은 대화창이 맡습니다. playerAction은 이번 장면에서 실제로 해냅니다(맡으면 이미 그 일 한가운데에 있습니다). 장면은 그 결정의 결과, 그 결과로 달라진 것, 다음 갈림길 순서로 이어집니다. 본문에서 플레이어 캐릭터는 "당신"이라고 부릅니다.',
        '이번 장면의 분량은 length를 따릅니다. 기다림·잡일·준비처럼 결과만 중요한 구간은 두세 문장으로 시간을 건너뛰어("해 질 무렵까지 창고를 지킨 끝에…", "사흘 뒤…") 다음 일이 벌어지는 순간에 바로 닿고, 벌어진 일은 감각과 움직임으로 구체적으로 씁니다. 첫 줄은 【장소 · 때】입니다(장소는 지금 이야기 속 위치).',
        '장면을 움직이는 것은 사람입니다. now.story의 인물과 now.cast에서 이 자리에 어울리는 사람이 자기 목적대로 먼저 움직입니다(다가오기, 막아서기, 뒤를 밟기, 무언가를 숨기거나 빼앗기). 주인공의 행동은 무언가를 얻거나 잃게 하고(신뢰, 정보, 돈, 상처, 적, 평판), 그 결과가 다음 일을 부릅니다. 위기는 기회로, 작은 일은 더 큰 일로 이어집니다. 수수께끼는 답을 하나씩 내놓으며 더 큰 질문으로 이어 갑니다.',
        '자료: now.presentPeople은 지금 이 자리에 있는 사람(동료 포함), now.awayPeople은 다른 곳에 있는 사람, now.whereabouts는 아직 무대에 없는 이야기 속 인물이 지금 있는 곳("이름: 장소")이며, justArrived면 동료만 함께 왔습니다. remembers·attitude·speechStyle은 그 사람의 기억·태도·말투입니다. placeSeed·localStories는 이 장소에서 벌어지는 일, directorNotes.fixes는 앞선 장면에서 어긋난 점(맞는 쪽으로 이어 씁니다), directorNotes.threads는 아직 끝나지 않은 곁가지, unanswered는 주인공이 한 일 중 세상이 아직 반응하지 않은 것(흐름에 맞을 때 누가 찾아오거나 소식이 닿게 합니다), mustHappen은 이번 장면에서 일어나는 일, currentGoal은 주인공이 지금 하는 일, otherStories는 주인공이 벌여 둔 다른 일, keyFacts·storySoFar는 이미 일어난 일입니다. 새 인물이 필요하면 세계관에 맞는 이름의 여성으로 만듭니다.',
        '지킬 것 세 가지: 1) 세계관에서 [GM]으로 표시된 정보와 reservedNpcs는 아직 무대 밖에 있고, 비밀과 결말은 사건을 통해 조금씩 드러납니다. 2) 돈은 now.gold 안에서, 물건은 now.inventory 안에서 씁니다. 3) 몬스터는 now.monsters의 이름 그대로 나오며, 덤벼드는 순간에서 장면을 멈춥니다(싸움은 게임이 진행합니다).',
        'diceResult가 있으면 그 성공·실패를 반드시 따르고 약속된 결과(onSuccess/onFailure)를 실제로 일으킵니다. 실패해도 대가를 치르고 이야기는 나아갑니다.',
        '본문이 끝나면 줄을 바꿔 "---"만 쓴 줄을 둡니다. 주인공이 누군가와 말을 나누게 되는 순간(상대가 말을 걸어오거나, 주인공이 말을 꺼내거나, 신청·거래·보고·추궁하러 마주 섬)에 장면이 닿았다면 거기서 본문을 멈추고, "---" 아래에 "[대화: 이름]" 한 줄만 씁니다(이름은 now.presentPeople·now.cast에 적힌 그대로). 대화는 그 사람의 대화창에서 이어집니다. 주인공이 지금 있는 곳을 떠나 다른 장소로 가려 하면 떠나는 모습까지만 쓰고, "---" 아래에 "[이동: 장소 이름]" 한 줄만 씁니다(now.nearby나 세계관에 나온 장소 이름 그대로). 가는 길과 도착은 게임이 지도에서 진행합니다. 그 밖에는 "---" 아래에 플레이어가 고를 다음 행동 3개를 "1. ", "2. ", "3. "으로 한 줄씩 씁니다. 셋은 각각 고르면 결과가 나는 결정입니다: 무엇을 해서 무엇을 얻거나 잃는지가 한 문장에 드러납니다(예: 기사와 대련해 실력을 증명한다). 셋은 서로 다른 방향으로 이야기를 엽니다: 1 정면으로 맞서거나 밀어붙이기, 2 속이거나 거래하거나 이용하기, 3 아무도 예상 못 한 수. 주어 없이 지금 바로 하는 행동을 "~한다"로 끝나는 한 문장으로 씁니다(다짐이나 계획이 아니라 실제 행동). 휴식·회복 행동은 넣지 않습니다.',
        ...(body.recentCheck === true || body.diceResult ? [] : ['playerAction이 성공할 수도 실패할 수도 있고, 어느 쪽이냐에 따라 주인공이 얻거나 잃는 것이 달라지는 일이면, 본문 없이 "---" 한 줄과 그 아래 "[판정: 능력치id | 무게 | 시도하는 일 | 성공하면 … | 실패하면 …]" 한 줄만 씁니다(시도와 결과는 주사위를 굴린 뒤 한 장면으로 씁니다). 능력치id는 now.abilities의 괄호 앞 id 중 하나, 무게는 이 시도에 걸린 것의 크기로 작음(얻을 것도 잃을 것도 적은 일상의 시도)·보통(일이 어느 쪽으로 갈릴지 정해지는 시도)·큼(위험하거나 얻는 것이 큰 시도)·결정적(이야기의 갈림길) 중 하나입니다. 난이도와 경험치·골드·명성·피해는 게임이 무게로 정하니, 성공하면·실패하면에는 이야기 속 결과만 씁니다. 이동·대화·둘러보기에는 판정을 걸지 않고, 몬스터와 싸우는 행동은 판정이 아니라 습격입니다.']),
        '모든 글은 자연스러운 한국어로만 씁니다.',
        '세계관(제작자 프롬프트):\n' + alignEngineRules(String(body.prompt || '')).slice(0, 7000),
        ...(early && String(body.prologue || '').trim() ? ['게임 프롤로그(이미 일어난 일, 다시 설명하지 않음):\n' + String(body.prologue).slice(0, 3000)] : []),
      ].join('\n\n');
      return streamWrite(writer, scene, 'scene-write');
    }
    // Luna accepts low reasoning effort (tested 2026-11-10); the player waits on these calls, so they think briefly.
    const payload = { reasoning_effort: 'low', model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        ...(voiceLines.length ? [
          { role: 'user', content: JSON.stringify({ playerAction: `${partner}, 평소 말하는 대로 한마디 해 주세요.`, note: '이전 대화 기록' }) },
          { role: 'assistant', content: JSON.stringify({ knownItem: '', howKnown: '', text: '', line: voiceLines.join('\n'), choices: [] }) },
        ] : []),
        { role: 'user', content: userContent() },
      ],
    };
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'x-usage-tag': mode || 'scene' },
      body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(55000),
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result?.error?.message || 'AI API 호출에 실패했습니다.' }, { status: 502 });
    const raw = result?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') throw new Error('AI 응답이 비어 있습니다.');
    let data = JSON.parse(raw);
    let talkWritten = false;
    if (prewritten && mode === 'talk') {
      const [said, tail = '']: string[] = prewritten.split(/\n\s*-{3,}\s*(?:\n|$)/);
      let gestureW = '';
      const lines = said.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
        const g = i === 0 ? l.match(/^\(([^)]{1,40})\)\s*/) : null;
        if (g) { gestureW = g[1].trim(); l = l.slice(g[0].length); }
        const tag = l.match(/^([^:：]{1,20})\s*[:：]\s*/);
        if (tag && tag[1].trim() === partner) l = l.slice(tag[0].length);
        return l.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim();
      }).filter(l => l && !FOREIGN_SCRIPT.test(l));
      const end = tail.match(/\[대화\s*끝(?:\s*[:：]\s*([^\]]+))?\]/);
      talkWritten = lines.length > 0;
      data.line = lines.join('\n'); data.text = ''; data.playerLine = ''; data.gesture = gestureW;
      data.endTalk = !!end; data.nextAction = end?.[1]?.trim() || '';
      const numbered = tail.split('\n').map(l => (l.match(/^\s*\d\s*[.)]\s*(.+)$/)?.[1] || '').replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim()).filter(Boolean).slice(0, 3);
      data.choices = end ? [] : numbered;
      // The talk ended on the partner's word: the ways on are the player's to pick, not played for them.
      data.afterChoices = end && !end[1] ? numbered.filter(l => !FOREIGN_SCRIPT.test(l)) : [];
    }
    if (prewritten && !mode) {
      const [story, tail = '']: string[] = prewritten.split(/(?:^|\n)\s*-{3,}\s*(?:\n|$)/);
      data.text = story.trim();
      data.choices = tail.split('\n').map(l => (l.match(/^\s*\d\s*[.)]\s*(.+)$/)?.[1]?.trim() || '').replace(/^나는\s+/, '')).filter(Boolean).slice(0, 3);
      data.check = null;
      // The scene reached a conversation: the talk window takes it over with that person (only someone the game knows).
      const talkName = tail.match(/\[대화:\s*([^\]|]+)/)?.[1].trim() || '';
      const onStage = (Array.isArray(state.npcProfiles) ? state.npcProfiles : []).filter((p: { inScene?: unknown }) => p?.inScene).map((p: { name?: unknown }) => String(p?.name || ''));
      const talkable = [...onStage, ...[...(Array.isArray(state.knownNpcs) ? state.knownNpcs : []), ...(Array.isArray(state.cast) ? state.cast : []).map((c: unknown) => String(c || '').replace(/^\[GM\]\s*/, '').split(/[(:：]/)[0].trim())].filter((n: string) => story.includes(n))]
        .filter((n: string) => n.length >= 2 && !(Array.isArray(state.reservedNpcs) ? state.reservedNpcs : []).includes(n) && !(Array.isArray(state.party) ? state.party : []).includes(n));
      data.talkTo = talkName.length < 2 ? '' : talkable.find((n: string) => n === talkName) || talkable.find((n: string) => talkName.includes(n) || n.includes(talkName)) || '';
      if (data.talkTo) data.choices = [];
      // The player sets off: the game makes the move on the map (not on an arrival the map already made).
      const goName = tail.match(/\[이동:\s*([^\]|]+)/)?.[1].trim().slice(0, 40) || '';
      data.goTo = !data.talkTo && goName.length >= 2 && !String(body.action || '').startsWith('시스템이 이동을 확정') ? goName : '';
      if (data.goTo) data.choices = [];
      const roll = body.diceResult || data.talkTo || data.goTo ? null : tail.match(/\[판정:\s*([^\]]+)\]/);
      if (roll) {
        const [ab = '', dcPart = '', what = '', ...rest]: string[] = roll[1].split('|').map((x: string) => x.trim());
        const cv = (state.characterValues || {}) as Record<string, unknown>;
        const ids = Object.keys(cv).filter(k => cv[k] !== '' && Number.isFinite(Number(cv[k])));
        const id = ab.replace(/\(.*$/, '').trim();
        const byName = (Array.isArray(state.trainableStats) ? state.trainableStats : []).find((t: { name?: unknown }) => String(t?.name || '') === id)?.id;
        const tail2 = (k: string) => rest.find(r => r.startsWith(k))?.replace(new RegExp('^' + k + '하면\\s*'), '').trim() || '';
        // "사내를 밀쳐 고정쇠에 닿기; 실패하면 그가 종을 울린다" in one field also happens.
        const [tried, inlineFail = ''] = what.split(/[;,]?\s*실패하면\s*/);
        data.check = { ability: ids.includes(id) ? id : byName || ids[0] || id, weight: dcPart.slice(0, 10), dc: Number(dcPart.match(/\d+/)?.[0]) || 11, label: tried.slice(0, 60) || '판정', reason: tried, success: tail2('성공'), failure: tail2('실패') || inlineFail.trim() };
        data.choices = [];
      }
    }
    const availableImages = Array.isArray(state.availableImages) ? state.availableImages.filter((v: unknown): v is string => typeof v === 'string').slice(0, 150) : [];
    const imageKey = typeof data.imageKey === 'string' && availableImages.includes(data.imageKey) ? data.imageKey : '';
    const locations = Array.isArray(state.locations) ? state.locations : [];
    const candidate = typeof data.moveToPinId === 'string' ? data.moveToPinId : '';
    const allowed = Array.isArray(state.adjacentLocationIds) ? state.adjacentLocationIds : [];
    const moveToPinId = body.movementAllowed !== false && allowed.includes(candidate) && locations.some((p: { id?: string; mapId?: string }) => p.id === candidate && p.mapId === state.currentMapId) ? candidate : '';
    if (typeof data.text === 'string') data.text = data.text.split(/(\s+)/).filter((w: string) => !FOREIGN_SCRIPT.test(w)).join('').replace(/ {2,}/g, ' ');
    if (!mode && typeof data.text === 'string') data.text = dropRepeatedQuotes(data.text, history);
    // Choices may come as {text, target}; the text is what the player sees, the target is only used to catch repeats.
    if (Array.isArray(data.choices)) data.choices = data.choices.map((v: unknown) => { if (v && typeof v === 'object') { return String((v as { text?: unknown }).text || ''); } return v; });
    const choices = Array.isArray(data.choices) ? [...new Set(data.choices.filter((v: unknown): v is string => typeof v === 'string' && !FOREIGN_SCRIPT.test(v)).map((v: string) => v.trim().replace(/^[(\[]?\s*특이한\s*행동\s*\d?\s*[)\]]?\s*[:：\-—]?\s*/, '')).filter((v: string) => v.length >= 2 && v.length <= 140))].slice(0, 3) : [];
    // Only a foe from this genre's roster can ambush, and never mid-fight or mid-talk.
    const monsterNames = Array.isArray(state.monsters) ? state.monsters.map((m: { name?: unknown }) => String(m?.name || '')) : [];
    const toMonster = (v: unknown) => { const t = typeof v === 'string' ? v.trim() : ''; return !t ? '' : monsterNames.find((n: string) => n === t) || monsterNames.find((n: string) => n.includes(t) || t.includes(n)) || ''; };
    const ATTACK = /(습격|덮치|덮쳐|돌진|달려들|달려든|덤벼|막아서|모습을 드러)/;
    // By full name, or a telling word standing on its own (monsters.ts namesFoe); a boss only by its full name.
    const foeInScene = (t: string) => monsterNames.find((n: string) => t.includes(n)) || monsterNames.find((n: string) => !(state.monsters || []).find((m: { name?: unknown; boss?: unknown }) => m?.name === n && m?.boss) && namesFoe(t, n));
    const sceneText = String(data.text || '');
    // Fighting a roster monster is a battle, not a dice check: a 근력 check once "제압했다" the wolf pack a quest
    // needed fought, and the same wolves had to be fought again later.
    const FIGHT = /(상대하|싸우|싸운|공격|처치|물리치|쫓아내|토벌|사냥|제압|맞서)/;
    const action = String(body.action || '');
    const fightFoe = !mode && data.check && typeof data.check === 'object' && FIGHT.test(action) ? foeInScene(action) || foeInScene(sceneText) : '';
    if (fightFoe) data.check = null;
    const ambush = mode ? '' : fightFoe || toMonster(data.ambush) || (Array.isArray(data.presentNpcs) ? data.presentNpcs.map(toMonster).find(Boolean) || '' : '') || (!(data.check && typeof data.check === 'object') && ATTACK.test(sceneText) ? foeInScene(sceneText) : '');
    const trainableIds = Array.isArray(state.trainableStats) ? state.trainableStats.map((t: { id?: unknown }) => String(t?.id || '')) : [];
    const trained = !mode && Array.isArray(data.trained) ? data.trained.filter((id: unknown): id is string => typeof id === 'string' && trainableIds.includes(id)).slice(0, 2) : [];
    const xpGain = typeof data.xpGain === 'string' && ['minor', 'deed', 'event'].includes(data.xpGain) ? data.xpGain : '';
    const reputationDelta = typeof data.reputationDelta === 'number' && Number.isFinite(data.reputationDelta) ? Math.max(-5000, Math.min(5000, Math.round(data.reputationDelta))) : 0;
    const goldDelta = typeof data.goldDelta === 'number' && Number.isFinite(data.goldDelta) ? Math.max(-1000, Math.min(500, Math.round(data.goldDelta))) : 0;
    const presentNpcs = Array.isArray(data.presentNpcs) ? [...new Set(data.presentNpcs.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim()).filter((v: string) => v.length >= 1 && v.length <= 30))].slice(0, 3) : [];
    const profileNames = Array.isArray(state.npcProfiles) ? state.npcProfiles.map((p: { name?: unknown }) => String(p?.name || '')) : [];
    const npcVoices = [...fixedVoices, ...(Array.isArray(data.npcVoices) ? data.npcVoices.filter((v: { name?: unknown; style?: unknown }) => v && typeof v.name === 'string' && typeof v.style === 'string' && v.style.trim() && profileNames.includes(v.name.trim()) && !fixedVoices.some(f => f.name === String(v.name).trim()) && !FOREIGN_SCRIPT.test(v.style))
      .map((v: { name: string; style: string }) => ({ name: v.name.trim(), style: v.style.trim().slice(0, VOICE_LENGTH) })) : [])].slice(0, 6);
    const check = !mode && body.reroll !== true && body.debug !== true && !body.diceResult && data.check && typeof data.check === 'object' ? {
      ability: String(data.check.ability || '').toLowerCase().slice(0, 50),
      label: String(data.check.label || '').slice(0, 60),
      reason: String(data.check.reason || '').slice(0, 200),
      dc: Number(data.check.dc) || 11, weight: String(data.check.weight || '').slice(0, 10),
      // What hangs on the roll, shown before the player rolls.
      success: String(data.check.success || '').slice(0, 80),
      failure: String(data.check.failure || '').slice(0, 80),
    } : null;
    const relationshipUpdates = Array.isArray(data.relationshipUpdates) ? data.relationshipUpdates.slice(0, 12).filter((item: unknown) => !!item && typeof item === 'object' && typeof (item as {name?:unknown}).name === 'string').map((item: {name:string;met?:boolean;relation?:string;affection?:number;affectionChange?:number}) => ({name:item.name.trim().slice(0,50),met:item.met===true,relation:typeof item.relation==='string'?item.relation.slice(0,30):'',affection:typeof item.affection==='number'&&Number.isFinite(item.affection)?Math.max(-100,Math.min(100,Math.round(item.affection))):undefined,affectionChange:typeof item.affectionChange==='number'&&Number.isFinite(item.affectionChange)?Math.max(-25,Math.min(25,Math.round(item.affectionChange))):undefined})) : [];
    const questStrings = (v: unknown) => Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim() && !FOREIGN_SCRIPT.test(x)).map((x: string) => x.trim().slice(0, 80)).slice(0, 3) : [];
    const completedQuests = questStrings(data.completedQuests), failedQuests = questStrings(data.failedQuests);
    // A giver outside the known cast (an unnamed extra) is dropped, like any other invented person.
    const addQuests = (Array.isArray(data.addQuests) ? data.addQuests : []).map((x: unknown) => typeof x === 'string' ? { text: x, giver: '' } : x && typeof x === 'object' ? { text: String((x as { text?: unknown; quest?: unknown }).text || (x as { quest?: unknown }).quest || ''), giver: String((x as { giver?: unknown }).giver || '') } : null)
      .filter((q: { text: string; giver: string } | null): q is { text: string; giver: string } => !!q && !!q.text.trim() && !FOREIGN_SCRIPT.test(q.text)).map((q: { text: string; giver: string }) => ({ text: q.text.trim().slice(0, 80), giver: (Array.isArray(state.knownNpcs) ? state.knownNpcs : []).includes(q.giver.trim()) ? q.giver.trim() : '' })).slice(0, 3);
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
    const howKnownText = mode === 'talk' && typeof data.howKnown === 'string' ? data.howKnown.trim().slice(0, 120) : '';
    // The item tag comes from the real inventory, so the model can't name something the player doesn't carry.
    const carried: string[] = Array.isArray(state.inventory) ? state.inventory.filter((n: unknown): n is string => typeof n === 'string' && !!n.trim()) : [];
    const namedItem = typeof data.knownItem === 'string' ? data.knownItem.trim() : '';
    const knownItem = (namedItem && carried.find(n => n.includes(namedItem) || namedItem.includes(n))) || carried.find(n => howKnownText.includes(n));
    const howKnown = howKnownText && knownItem ? `[소지품: ${knownItem}] ${howKnownText}` : howKnownText;
    // Talk: the reply becomes ordered parts (narration, speech, narration, speech...) so the chat shows them in turn.
    // Quoted text is speech even when the model mixes it into the narration; a speech repeated in line and text appears once.
    let line = '';
    let parts: { type: 'scene' | 'speech'; text: string }[] = [];
    let talkLeft = false, nextAction = '';
    if (mode === 'talk' && talkWritten) {
      parts = String(data.line).split('\n').map(text => ({ type: 'speech' as const, text: text.slice(0, 600) })).slice(0, 4);
      line = parts.map(p => p.text).join(' ');
      if (holdTalk) { data.endTalk = false; data.nextAction = ''; }
      if (lastReply) data.endTalk = true;
      nextAction = typeof data.nextAction === 'string' && !FOREIGN_SCRIPT.test(data.nextAction) ? data.nextAction.trim().replace(/^나는\s+/, '').slice(0, 140) : '';
    } else if (mode === 'talk') {
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
      // A line that slipped into another language (a whole Japanese reply, 2026-11-10) is no reply either.
      if (FOREIGN_SCRIPT.test(rawLine)) rawLine = '';
      const lineParts = /[“"「『]/.test(rawLine) ? toParts(rawLine) : rawLine ? [{ type: 'speech' as const, text: strip(rawLine) }] : [];
      // Story narration sent as the partner's words ("핍이 당신에게 귀띔한 대로 … 생각이 스친다"): not speech, so it is dropped and the words asked for below.
      const narrated = (t: string) => t.includes(`${partner}이 `) || t.includes(`${partner}가 `) || t.includes(`${partner}은 `) || t.includes(`${partner}는 `) || (t.includes('당신') && /(는다|한다|간다|돈다|친다|있다|없다|였다|았다|었다).?$/.test(t.trim()));
      for (let i = lineParts.length - 1; i >= 0; i--) if (lineParts[i].type === 'speech' && narrated(lineParts[i].text)) lineParts.splice(i, 1);
      if (holdTalk) data.endTalk = false;
      // Headings are scene formatting; in a talk they are dropped from the narration. Only the player leaving (a walk-off
      // action) takes the reply out of the talk.
      parts = parts.map(p => ({ ...p, text: p.text.replace(/【[^】]+】/g, '').trim() })).filter(p => p.text);
      if (playerLeaves) {
        talkLeft = true;
        lineParts.splice(0);
        parts = [{ type: 'scene', text: [String(data.text || ''), rawLine].join(' ').replace(/【[^】]+】/g, '').replace(/["“”「」『』]/g, '').replace(/\s+/g, ' ').trim() }];
      }
      if (!talkLeft && !parts.some(p => p.type === 'speech')) {
        // No speech inside the narration: a lone line with no quotes is the NPC talking without quote marks.
        parts = lineParts.length ? [...parts, ...lineParts] : parts.length === 1 && !narrated(parts[0].text) ? [{ type: 'speech', text: strip(parts[0].text) }] : parts;
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
      const ownAddress = new Set(saidBefore.flatMap((t: string) => addressesIn(t)));
      const inVoice = (t: string) => { const used = addressesIn(t); return !ownAddress.size || !used.length || used.some(a => ownAddress.has(a)); };
      if (speech.some(inVoice)) speech = speech.filter(inVoice);
      parts = talkLeft ? [] : (speech.length ? speech : [strip(rawLine) || '…']).map(text => ({ type: 'speech' as const, text: text.slice(0, 600) })).slice(0, 4);
      line = parts.filter(p => p.type === 'speech').map(p => p.text).join(' ');
      const FAREWELL = /(기약|다음에 (또 )?(봅시다|봐요|뵙|보자)|다시 만나(면|자|요|게)|다시 보자|또 보자|또 봐|몸 조심|조심히 가|조심해서 가|살펴 가|잘 가|여기까지(다|야|예요|입니다|군|로))/;
      if (!talkLeft && talkTurns >= 1 && FAREWELL.test(line)) data.endTalk = true;
      // Past the turn limit the talk closes whatever the model said.
      if (lastReply) data.endTalk = true;
      // The player's line settled what they do next (the GM's call): the partner's one answer closes the talk and the game plays the
      // action as a scene. Before, the talk ran on and the partner narrated the next scene (에드리아 describing tracks at the farm).
      nextAction = !holdTalk && !talkLeft && typeof data.nextAction === 'string' && !FOREIGN_SCRIPT.test(data.nextAction) ? data.nextAction.trim().replace(/^나는\s+/, '').slice(0, 140) : '';
      if (nextAction) { const first = parts.find(p => p.type === 'speech'); if (first) { parts = [first]; line = first.text; } data.endTalk = true; }
      const replySentences = sentences(line);
      const echoed = replySentences.filter(x => saidBefore.some((y: string) => pairShare(x, y) >= 0.45)).length;
      if (!talkLeft && talkTurns >= 2 && replySentences.length && echoed * 2 >= replySentences.length) data.endTalk = true;
      data.text = talkLeft ? leftText : parts.filter(p => p.type === 'scene').map(p => p.text).join(' ');
    }
    // The scene's choices are the writer's own. The game drops only what it can't carry out: going where the player already
    // is, a trip past the next pin (the map moves one step), paying with an empty purse, or only resting (health comes back by itself).
    const here = [...contentWords(String(state.locationName || ''))].filter(w => !/^(입구|근처|안쪽|바깥|앞|가장자리)$/.test(w));
    const goesHere = (c: string) => /(가서|간다|향한다|이동한다|돌아간다|찾아간다)/.test(c) && here.some(w => c.includes(w));
    const nextDoor = Array.isArray(state.adjacentLocations) ? state.adjacentLocations.map((l: { name?: unknown }) => String(l?.name || '')) : [];
    const farPins = (Array.isArray(state.locations) ? state.locations.map((l: { name?: unknown }) => String(l?.name || '').trim()) : []).filter((n: string) => n.length >= 2 && !nextDoor.includes(n) && !here.some(w => n.includes(w)));
    const farTrip = (c: string) => TRAVEL_VERB.test(c) && farPins.some((n: string) => c.includes(n));
    const broke = Number(state.gold ?? 1) <= 0;
    const pays = (c: string) => broke && /(은화|금화|동화|동전|골드|돈|값|요금|[가-힣]료|삯|대금|사례금)[^.]{0,15}(내고|낸다|내며|내서|건네|치르고|치른다|치러|지불|갚|꺼내)/.test(c);
    const RESTING = /(휴식|쉬며|쉬면서|쉰다|쉬어|잠을 ?청|눈을 붙|숨을 돌리|체력을 ?회복|회복하러|회복한다|기력을 ?회복|상처를 ?돌보|치료(를|하러) ?받)/;
    const whyBad = (c: string) => [goesHere(c) && 'goes-here', farTrip(c) && 'far-trip', pays(c) && 'no-gold', RESTING.test(c) && 'rest'].filter(Boolean).join(',');
    const gmChoices = [...(choices as string[])];
    if (!mode && !check && !ambush) choices.splice(0, choices.length, ...gmChoices.filter(c => !whyBad(c)));
    // Dev only: what the writer offered and what went out (.next/choice-debug.jsonl).
    if (process.env.NODE_ENV !== 'production' && !mode && !check && !ambush) {
      try { appendFileSync(path.join(process.cwd(), '.next', 'choice-debug.jsonl'), JSON.stringify({ ts: new Date().toISOString(), at: state.locationName || '', gm: gmChoices.map(c => ({ c, bad: whyBad(c) })), out: choices }) + '\n'); } catch {}
    }
    // Suggested replies must be speech; narrated intents are dropped unless nothing else is left.
    const NARRATED = /(한다|묻는다|말한다|건넨다|요청한다|부탁한다|청한다|본다|듣는다)\.?$/;
    const thirdPerson = (v: string) => partner.length >= 2 && ['와', '과', '에게', '한테', '를', '을', '의'].some(p => v.includes(`${partner}${p} `));
    const spoken = (v: string) => !NARRATED.test(v) && !LEAVING.test(v) && !plainEnd(v) && !/겠다.?$/.test(v) && !thirdPerson(v);
    const spokenChoices = mode === 'talk' && talkWritten ? [...(choices as string[])] : mode === 'talk' ? (choices as string[]).map((v: string) => v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim()).filter(spoken) : [];
    if (mode === 'talk' && spokenChoices.length) choices.splice(0, choices.length, ...spokenChoices);
    const playerLine = mode === 'talk' && typeof data.playerLine === 'string' && !FOREIGN_SCRIPT.test(data.playerLine) ? data.playerLine.trim().replace(/^["“”'「『]+|["“”'」』]+$/g, '').slice(0, 300) : '';
    return NextResponse.json({ majorScene, nextAction, afterChoices: Array.isArray(data.afterChoices) ? data.afterChoices : [], goTo: !mode && !check && typeof data.goTo === 'string' ? data.goTo : '', talkTo: !mode && !check && typeof data.talkTo === 'string' ? data.talkTo : '', setLevel: body.debug === true && Number.isInteger(data.setLevel) ? Math.max(1, Math.min(100, data.setLevel)) : 0, enemy, npcPowers, trained: check ? [] : trained, ambush: check ? '' : ambush, xpGain: check ? '' : xpGain, gesture, howKnown, line, parts, playerLine, npcVoices, endTalk: mode === 'talk' && (data.endTalk === true || talkLeft || decided), talkLeft, reputationDelta: check ? 0 : reputationDelta, goldDelta: check ? 0 : goldDelta,addQuests:check?[]:addQuests,completedQuests:check?[]:completedQuests,failedQuests:check?[]:failedQuests,finalGoalCompleted,completedGoalSteps,relationshipUpdates: check ? [] : relationshipUpdates, choices: check ? [] : choices, presentNpcs: check ? null : presentNpcs, check, moveToPinId: check ? '' : moveToPinId, imageKey, text: String(data.text || '').slice(0, 6000), hpDelta: check ? 0 : Number.isFinite(data.hpDelta) ? Math.trunc(data.hpDelta) : 0,
      addItems: !check && Array.isArray(data.addItems) ? data.addItems.slice(0, 5) : [], removeItems: !check && Array.isArray(data.removeItems) ? data.removeItems.slice(0, 5) : [],
      addFlags: !check && Array.isArray(data.addFlags) ? data.addFlags.slice(0, 5) : [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'GM 서버 오류' }, { status: 500 });
  }
}
