import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { POWER_TIERS, MAX_POWER, levelForTier, foeLevelRange } from '../../_lib/progression';
import { alignEngineRules } from '../../_lib/engine-rules';
import { namesFoe } from '../../_lib/monsters';

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
// Talk replies read as "the same" when they share most character pairs or two content words, or when all three are questions.
const pairShare = (a: string, b: string) => { const p = pairs(squash(a)), q = pairs(squash(b)); let both = 0; for (const k of p) if (q.has(k)) both++; return both / Math.max(1, Math.min(p.size, q.size)); };
const TALK_STOP = /^(그럼|그래|그건|그게|정말|혹시|지금|우리|당신|너|제가|내가|저는|나는|뭐|무슨|어떻게|왜|좀|더|이제|그냥|알려|말해|주세요|줄래|있어|있나요|있어요|없어|해요|하는|거야|건가요)$/;
const contentWords = (t: string) => new Set([...t.matchAll(/[가-힣]{2,}/g)].map(m => m[0].replace(/(이랑|으로|에게|한테|은|는|이|가|을|를|에|의|도|로|와|과|랑|요|죠)$/, '')).filter(w => w.length >= 2 && !TALK_STOP.test(w)));
const talkChoicesAlike = (list: string[], said: string[]) => {
  if (list.length < 3 || list.filter(c => /[?？]s*$/.test(c)).length >= 3) return true;
  const words = list.map(contentWords);
  const alike = (i: number, j: number) => repeats(list[i], list[j]) || pairShare(list[i], list[j]) >= 0.4 || [...words[i]].filter(w => words[j].has(w)).length >= 2;
  return list.some((_, i) => list.some((__, j) => j > i && alike(i, j))) || list.some(c => said.some(p => repeats(c, p)));
};
// An action that walks away from the conversation ("이끼골로 향해 조사하러 간다"), not something said.
// Same pattern as the play screen: a destination or object before the verb, so "좋아, 같이 간다" stays speech.
const LEAVING = /(?:으로|로|에|을|를|서)\s+(?:\S+\s+){0,4}?(?:간다|향한다|나선다|떠난다|들어간다|나간다|출발한다|돌아간다|따라간다|뒤쫓는다|추적한다|조사한다|살핀다|뒤진다)\.?$/;
// What a stalled scene is made to do (see idleBeat).
const IDLE_BEATS = {
  ambush: '적이 덮칩니다. currentState.monsters 중 이 장소에 어울리는 것 하나(boss:true 금지)를 ambush에 정확한 이름으로 반드시 넣고, 본문에도 그 이름 그대로 쓰세요("덩치 큰 마물"처럼 뭉뚱그리지 말 것). 습격 직전의 한순간만 짧게 쓰면 전투는 게임이 시작합니다.',
  clue: '결정적인 단서가 나옵니다. 실종자의 소지품·핏자국·편지처럼 손에 쥘 수 있는 증거를 addItems에 넣고, 그것이 가리키는 다음 장소나 인물을 분명히 말하세요.',
} as const;
// Forced beats point at the culprit without naming them: the story reveals the mastermind only in its own act.
const IDLE_HIDE = ' 단서나 증언이 흑막([GM] 흑막으로 적힌 인물)을 가리키더라도 그 이름·정체는 밝히지 말고 별명·겉모습·물건(예: 약장수 아주머니, 낯선 문양)으로만 보여 주세요.';
const ADDRESS = ['경', '그대', '인간', '꼬맹이', '형씨', '아가', '자네', '당신', '손님', '나리', '아가씨', '소협', '대협', '헌터님'];
const ADDRESS_JOSA = ['', '은', '는', '이', '가', '의', '을', '를', '에게', '도', '여', '이여', '께서', '께', '님'];
const addressesIn = (t: string) => { const words = t.split(/[\s,.!?…~"'“”]+/).filter(Boolean); return ADDRESS.filter(a => words.some(w => w.startsWith(a) && ADDRESS_JOSA.includes(w.slice(a.length)))); };
const sentences = (t: string) => t.split(/(?<=[.!?…])\s+/).map(x => x.trim()).filter(Boolean);
// The player announcing what they'll do next ("직접 숲을 살펴봐야겠어", "처리하고 올게") closes the conversation.
// Only clear "I'm off to do it" lines; generic ones like "하겠습니다" or "해 볼게" fired mid-conversation and cut talks short.
const DECIDED = /(다녀올|다녀오겠|갔다 올|가 ?볼게|가 ?보겠|가야겠|가겠|가 ?봐야겠|살펴봐야겠|살펴보겠|알아봐야겠|알아보겠|조사해야겠|조사하겠|처리하고 올|해결하고 올|맡을게|맡겠|떠나겠|떠날게|출발하|그럼 이만|이만 가|나중에 봐|또 올게|해낼게|해내겠|해내고 올|물러나겠|물러갈게|접겠|접고|여기서 끝내|대화는 끝|끝내자|끝내죠|마무리하자|마무리하죠|여기까지|다시 보자|다시 봐|다시 만나|내일 보|쉬었다가|쉬러 가|돌아가겠|돌아갈게|확인하겠|확인해 볼게|찾아낼게|찾아내겠|찾아볼게|찾아보겠|하고 올게|확실히 할게|맡아 볼게|맡아볼게|다녀와서)/;
// A question ("같이 가 볼래요?") is not a decision.
const plainEnd = (t: string) => { const m = t.trim().replace(/[.!]+$/, '').match(/(.)다$/); if (!m) return false; const c = m[1].charCodeAt(0) - 0xac00; return m[1] === '는' || (c >= 0 && c < 11172 && c % 28 === 4); };
const decidedLine = (action: string) => DECIDED.test(action) && !/[?？]\s*["”']?\s*$/.test(action.trim());
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
    // The play screen sends the monster roster beside state, not inside it; the GM reads it as currentState.monsters.
    const state = { ...(body.state && typeof body.state === 'object' ? body.state : {}), ...(Array.isArray(body.monsters) && !Array.isArray(body.state?.monsters) ? { monsters: body.monsters } : {}) };
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
    // How the hero talks, for every pass that writes the player's lines. Without it the lines mixed 반말 into a talk
    // with the knight-captain, assumed a companion who wasn't there ("우리가 둘이라면"), and gave the hero a trade
    // ("늑대 상대는 내 전문이야") that the identity-free stories never fix.
    const partnerAffection = Number((Array.isArray(state.relationships) ? state.relationships : []).find((r: { name?: unknown }) => r?.name === partner)?.affection) || 0;
    const party: string[] = Array.isArray(state.party) ? state.party.filter((n: unknown): n is string => typeof n === 'string') : [];
    const playerVoice = [
      `플레이어 대사의 말투: 세 대사 모두 같은 어체입니다. ${partnerAffection >= 40 || party.includes(partner) ? `${partner}와(과)는 가까운 사이라 편한 반말도 됩니다.` : `${partner}에게는 해요체(~요)로 말합니다. 반말·하게체(~하지, ~게)·하오체는 쓰지 마세요.`}`,
      `지금 플레이어의 동료: ${party.length ? party.join(', ') : '없음(혼자)'}. 없는 동료나 "우리 둘" 같은 일행을 전제하지 말고, ${partner}가 함께 간다고 정해지지 않았으면 같이 가자는 전제도 하지 마세요.`,
      '주인공의 출신·직업·특기·과거를 단정하는 말("그건 내 전문이야", "기사 출신이라서")은 금지입니다.',
    ].join(' ');
    const talkTurns = Math.max(0, Math.min(99, Math.round(Number(body.talkTurns) || 0)));
    // The talk closes after this reply either way, so the NPC must say goodbye in it rather than ask something left hanging.
    // The game's own accept line for a quest conversation (closeTalk) concludes the talk like a decision does.
    const decided = mode === 'talk' && (decidedLine(String(body.action || '')) || body.closeTalk === true);
    // A quest conversation stays open until the player concludes or leaves it (see questTalk below).
    // holdTalk: the client says the next quest step is another talk with this partner (holdQuest), so it goes on.
    const questTalk = mode === 'talk' && !decided && (body.holdTalk === true || (Array.isArray(state.questBeats) && (state.questBeats as { next?: { do?: unknown; who?: unknown; here?: unknown } | null }[]).some(q => q?.next?.do === 'talk' && q.next.who === partner)));
    const playerLeaves = mode === 'talk' && LEAVING.test(String(body.action || '').trim());
    // The opening reply of a talk (nothing said by the player yet) never ends it either.
    const holdTalk = (questTalk || (mode === 'talk' && talkTurns === 0)) && !playerLeaves;
    const lastReply = mode === 'talk' && (decided || (talkTurns >= 5 && !questTalk));
    const combat = mode === 'combat' && body.combat && typeof body.combat === 'object' ? body.combat : null;
    const itemUse = typeof combat?.itemUse === 'string' ? combat.itemUse.slice(0, 80) : '';
    // Several recent GM turns that only talk about getting ready mean the story has stalled; the next scene is told to act.
    const STALL = /준비|장비|채비|대비|갖춰|갖추|때가 아니|더 알아봐|정보가 더 필요|서두르지/;
    const recentGm = history.filter((h: string) => /^GM:|^[^:]{1,30}: "/.test(h)).slice(-6);
    const stalled = recentGm.length >= 3 && recentGm.filter((h: string) => STALL.test(h)).length >= 3;
    // Three questions in a row with nothing happening: this scene has to move.
    const lastActs = history.filter((h: string) => h.startsWith('플레이어:')).slice(-3);
    const askingLoop = !mode && lastActs.length >= 3 && lastActs.every((h: string) => /(묻는다|물어본다|캐묻는다|듣는다|들어 본다|알아본다|묻고|물어)/.test(h));
    // Three actions with nothing the game could see change (no quest, item, fight, roll, move, meeting): circling in place.
    const PROGRESS = /^(시스템: (목표|새 목표|새 메인|메인 목표|획득|습격|.*이동했습니다|.*대화를 시작|.*막아섭니다)|전투:|주사위:)/;
    const actAt = history.map((h: string, i: number) => /^플레이어: (?!")/.test(h) ? i : -1).filter((i: number) => i >= 0);
    const idleLoop = !mode && actAt.length >= 3 && !history.slice(actAt[actAt.length - 3]).some((h: string) => PROGRESS.test(h));
    // The code picks what happens, so the GM can't answer the warning with more scenery: finish the main errand when the
    // player is standing where it points, otherwise a fight and a clue in turn.
    // The main quest's next beat, for pointing a stalled scene toward it.
    const mainNext = Array.isArray(state.questBeats) ? (state.questBeats as { kind?: unknown; next?: { goal?: unknown; at?: unknown } | null }[]).find(q => q?.kind === 'main')?.next : undefined;
    // A safe place (inside a town) never gets a monster ambush; a stalled scene there gets a clue instead.
    const idleBeat: keyof typeof IDLE_BEATS | '' = !idleLoop || body.reroll === true ? '' : turnIndex % 2 && state.safePlace !== true ? 'ambush' : 'clue';
    type RosterFoe = { name?: unknown; power?: unknown; desc?: unknown; boss?: unknown };
    const placeWords = [...contentWords(`${state.locationName || ''} ${state.mapPin || ''}`)];
    // The forced ambush draws among foes that fit the place and the player's level, skipping the ones fought lately,
    // instead of always taking the single best fit (which made the same foe come back every time).
    const recentFoes: string[] = Array.isArray(state.recentFoes) ? state.recentFoes.map(String) : [];
    const foeCands = ((state.monsters || []) as RosterFoe[]).filter(m => !m.boss && typeof m.name === 'string')
      .map(m => ({ name: String(m.name), fit: placeWords.filter(w => `${m.name} ${m.desc || ''}`.includes(w)).length, gap: (([min, max], l) => l < min ? min - l : l > max ? l - max : 0)(foeLevelRange(Number(m.power) || 1, !!m.boss), Number(state.level) || 1) }));
    const freshCands = foeCands.filter(m => !recentFoes.includes(m.name));
    const ambushPool = (freshCands.length ? freshCands : foeCands).sort((a, b) => b.fit - a.fit || a.gap - b.gap).slice(0, 4);
    const ambushFoe = idleBeat !== 'ambush' ? '' : ambushPool[Math.floor(Math.random() * ambushPool.length)]?.name || '';
    const pacingRules = [
      '본문 형식: 서술과 대사를 한 문단에 섞지 마세요. 서술이 끝나면 줄을 바꾸고, 인물이 소리 내어 하는 말은 반드시 큰따옴표로 감싸 그 말만 한 줄에 쓰고, 다시 줄을 바꿔 서술을 이어 가세요. 따옴표 없는 대사는 금지입니다. 예: 에드리아가 낡은 검을 잠시 바라본다.\n"늑대 무리를 쫓아냈다니, 다행이군."\n그녀는 다음 시험 일정을 짧게 전한다.',
      '이동·추적·수색처럼 과정이 긴 행동은 과정을 1~2문장으로 압축하고, 도착하거나 찾아낸 순간의 장면부터 쓰세요. 한 턴은 한 걸음이 아니라 한 장면입니다.',
      'currentState.locationName은 지금 이야기 속 위치이고 mapPin은 그 위치가 속한 지도 장소입니다. 이야기 속 장소가 지도에 없더라도(마을 안의 집, 숲 속 개척촌 등) 플레이어가 그곳으로 가면 막지 말고 바로 도착한 장면을 쓰세요. 장면 첫 줄 【】에는 지금 있는 이야기 속 장소 이름을 정확히 쓰세요. 선택지는 지금 있는 곳에서 할 수 있는 행동이어야 합니다. 목표가 다른 곳에 있으면 그곳의 이름을 넣어 "그림우드로 돌아가 발자국을 쫓는다"처럼 가는 행동으로 쓰세요.',
      '진행 원칙: 매 장면은 이야기를 실제로 한 걸음 나아가게 해야 합니다. 새 단서·정보 공개, 인물의 결정이나 행동, 사건 발생, 상황 변화, 거래·약속 성사 중 최소 하나가 이번 장면에서 일어나야 합니다.',
      '"준비가 필요하다", "장비를 갖춰야 한다", "아직 때가 아니다", "더 알아봐야 한다"처럼 진행을 미루는 말로 장면을 끝내지 마세요. 그런 조건은 같은 일에 한 번만 말하고, 플레이어가 준비 행동을 한 번 했거나 그대로 하겠다고 하면 바로 실행해 결과(성공·실패·대가)를 보여 주세요. 준비 부족은 막는 이유가 아니라 위험·대가·판정 난이도로 반영하세요.',
      '플레이어가 같은 사람에게 같은 주제를 다시 물으면 새 정보를 지어내 늘리지 말고, 아는 건 다 말했다고 짧게 끊은 뒤 직접 가 볼 장소나 만날 사람을 알려 주어 장면을 앞으로 밀어 주세요.',
      'NPC는 플레이어가 물은 것에 구체적으로 답합니다(누가·어디서·언제·어떻게). 둘러대거나 다음에 알려 주겠다고 미루는 건 그 인물이 감추는 비밀이거나 호감도가 낮을 때만입니다.',
      'choices에 준비·장비 구하기·정보 더 모으기 같은 준비성 행동만 늘어놓지 마세요. 최소 2개는 지금 바로 사건에 뛰어들거나 인물과 담판을 짓는 행동이어야 합니다.',
      ...(!mode && state.regionHook?.hook ? [`지역 이야기 시작: 이번 장면에서 이 일이 자연스럽게 벌어지게 해 지역 이야기 「${String(state.regionHook.story).slice(0, 40)}」를 여세요: "${String(state.regionHook.hook).slice(0, 200)}". 의뢰인은 ${String(state.regionHook.giver).slice(0, 20)}입니다(그 자리에 있을 이유가 있으면 직접, 아니면 소식·쪽지·심부름꾼으로). 퀘스트 "${String(state.regionHook.quest).slice(0, 80)}"는 게임이 직접 추가하므로 addQuests에 넣지 마세요. 지금 하던 행동의 결과도 함께 보여 주세요.`] : []),
      ...(state.safePlace === true ? ['지금 있는 곳은 안전한 곳(마을·도시 안)입니다. 몬스터 습격(ambush)을 넣지 마세요.'] : []),
      ...(recentFoes.length ? [`최근에 싸운 적(${recentFoes.slice(0, 3).join(', ')})은 이야기상 꼭 필요하지 않으면 다시 등장시키지 마세요. 습격(ambush)이나 장면에 나오는 적은 currentState.monsters의 다른 적에서 고르세요.`] : []),
      // Quest beats (app/_lib/quest-beats.ts): the game decides when each one happens; the GM narrates what it brings
      // this turn and sets the scene for the next one, without running ahead of it.
      ...(Array.isArray(state.questBeats) ? (state.questBeats as { quest?: unknown; happenNow?: unknown; next?: { do?: unknown; goal?: unknown; at?: unknown; here?: unknown; who?: unknown } | null }[]).slice(0, 4).flatMap(q => {
        const quest = String(q.quest || '').slice(0, 80), now = Array.isArray(q.happenNow) ? q.happenNow.map(String).filter(Boolean) : [], n = q.next;
        if (!quest) return [];
        const lines = now.length ? [`퀘스트 "${quest}": 이번 장면에서 반드시 일어나는 일 — ${now.join(' / ').slice(0, 400)}. 이 일을 장면의 중심으로 분명하게 묘사하세요. 이 일은 이번 장면(대화라면 이번 대답) 안에서 이미 이루어진 것으로 쓰고, 같은 일을 다시 요구하거나 나중으로 미루지 마세요.`] : [];
        if (!n || mode === 'combat') return lines;
        const who = String(n.who || '').slice(0, 30), at = String(n.at || '').slice(0, 60), goal = String(n.goal || '').slice(0, 120);
        if (mode === 'talk') return n.do === 'talk' && who === partner ? [...lines, `퀘스트 "${quest}"에서 ${partner}와(과) 매듭지을 일이 남았습니다. JSON에 acceptLine 문자열을 따로 넣으세요: 플레이어가 ${partner}의 말을 받아들여 이 일을 매듭짓는 한 문장(예: "네, 입단 지원서를 내겠습니다.", "그 늑대들, 제가 처리하고 오겠습니다.", "늑대는 모두 쫓아냈습니다. 보고드립니다."). 질문·망설임·되묻기는 안 됩니다. choices에는 acceptLine과 다른 말(질문, 다른 방법, 거절)을 넣으세요. 대화는 플레이어가 acceptLine을 고를 때까지 이어지니 endTalk는 false로 두고, ${partner}의 말은 반드시 큰따옴표 대사로 쓰세요.`] : lines;
        if (n.here === false) return [...lines, `퀘스트 "${quest}"의 다음 일은 ${at}에서 할 일(${goal})입니다. 지금 있는 곳에서는 그 일의 결과나 그곳의 단서를 꺼내지 말고, 선택지 하나는 ${at}(으)로 가는 행동으로 쓰세요.`];
        if (n.do === 'talk') return [...lines, `${who}이(가) 이 자리에 있습니다. 장면에 등장시키고 presentNpcs에 넣으세요. 퀘스트 "${quest}"는 플레이어가 ${who}에게 말을 걸어야 진행되니, ${who}가 그 결과를 먼저 말해 버리지 마세요.`];
        if (n.do === 'defeat') return [...lines, `이번 장면 끝에 ${who}이(가) 나타나 플레이어 앞을 막아섭니다(전투는 게임이 시작합니다). 등장하는 순간까지만 묘사하고 싸움의 결과는 쓰지 마세요. ambush는 비워 두세요.`];
        if (n.do === 'choose') return [...lines, `퀘스트 "${quest}": 플레이어가 결정해야 합니다(${goal}). 그 갈림길을 장면에서 분명히 보여 주세요. 선택지는 게임이 줍니다.`];
        return [...lines, `퀘스트 "${quest}"의 다음 일: ${goal}. 그 일이 일어나기 전에는 결과를 미리 묘사하지 마세요.`];
      }) : []),
      ...(mode === 'talk' && body.holdTalk === true && body.holdQuest ? [`이 대화는 끝나지 않고 이어집니다: 방금 일이 매듭지어진 뒤 ${partner}는 곧바로 다음 일(퀘스트 "${String(body.holdQuest).slice(0, 80)}")로 말을 이어 갑니다. 작별 인사를 하지 말고 endTalk는 false로 두세요.`] : []),
      ...(Array.isArray(state.questBeats) && state.questBeats.length ? ['메인·지역 퀘스트(questBeats에 있는 것)의 진행·완료·다음 목표는 게임이 처리합니다. 이 퀘스트들을 completedQuests·failedQuests·addQuests에 넣지 말고, questBeats에 적힌 일이 실제로 일어나기 전에 그 결과(시험 통과, 자백, 적의 패배, 다음 임무)를 미리 묘사하지 마세요.'] : []),
      ...(!mode && body.interfere === true ? ['방해 사건: 이번 장면에서 플레이어와 적대하는 세력(메인 사건의 흑막 쪽, 또는 플레이어가 척진 세력·인물)이 플레이어의 일을 방해합니다. 지금 상황과 장소에 맞는 것 하나만 고르세요: 미행·감시가 드러남, 협박 편지나 경고, 증인·거래 상대가 매수되거나 입막음당함, 가진 단서·물건을 도둑맞거나 망가짐, 나쁜 소문이 돌아 명성 하락(reputationDelta -20~-80), 가려던 곳의 출입이 막힘, 하수인 무리나 자객의 습격(ambush에 currentState.monsters 중 사람 무리·자객 계열 하나, boss:true는 금지). 흑막의 정체와 이름은 드러내지 말고 하수인·흔적·소문으로만 보이게 하세요. 방해는 진행을 막는 벽이 아니라 대가와 위험을 더하는 일이니, 이번 장면 choices 중 하나는 방해에 맞서거나 피하는 행동으로 넣으세요.'] : []),
      ...(askingLoop ? ['경고: 플레이어가 세 번 연속 묻기만 했고 이야기가 제자리입니다. 이번 장면에서는 대답을 늘이지 말고 사건을 일으키세요: 결정적인 단서 발견, 습격이나 사고, 새 인물 등장, 지금 바로 가 볼 장소 제시 중 하나. 선택지에 묻기·듣기 행동은 넣지 마세요.'] : []),
      ...(idleBeat ? [`경고: 최근 세 번의 행동 동안 이야기에 눈에 보이는 변화가 없었습니다(같은 곳을 맴돌며 들어가기·살피기·소리 듣기만 반복). 묘사를 늘이지 말고 mustHappen에 적힌 일을 이번 장면에서 반드시 일으키세요: ${IDLE_BEATS[idleBeat]} 선택지에는 같은 장소로 더 들어가기·주변 살피기·소리 듣기를 넣지 말고, 방금 터진 일에 대응하는 행동을 넣으세요.`] : []),
      ...(stalled ? ['경고: 최근 장면들이 준비·장비 이야기만 반복하며 제자리걸음 중입니다. 이번 장면에서는 준비 이야기를 하지 말고, 사건을 실제로 터뜨리거나 플레이어의 시도를 실행해 결과를 보여 주세요. 선택지에도 준비 행동을 넣지 마세요.'] : []),
    ];
    const modeRules = mode === 'talk' ? [
      `지금은 플레이어가 ${partner}와(과) 직접 대화하는 대화 모드입니다. playerAction은 플레이어가 ${partner}에게 한 말입니다. 대화는 메신저 채팅처럼 대사만 오갑니다. 상황 설명·지문·행동 묘사는 쓰지 말고 text는 반드시 빈 문자열입니다. line에는 ${partner}가 하는 말만 따옴표·이름표 없이 쓰세요. 채팅 메시지처럼 짧게 1~3개로 나누고 메시지 사이는 줄바꿈(\\n)으로 구분하세요. 감정과 태도는 지문 대신 말투·어휘로 드러내세요. "..."이나 "…"만 있는 대답은 금지입니다. 과묵하거나 적대적인 인물도 짧더라도 실제 말로 반응해야 하며(예: "할 말 없어. 가."), 플레이어가 물은 내용에 답하거나 답하지 않는 이유를 말하세요. 표정이나 몸짓은 화면 연출용으로 gesture에 20자 안팎의 짧은 구절로만 쓰세요(예: 잠시 머뭇거리며). JSON에 line 필드를 꼭 포함하세요. 플레이어의 대사나 행동을 대신 쓰지 마세요. ${partner}의 성격·목표·비밀·관계를 지키고, 아직 밝힐 때가 아닌 비밀은 숨기거나 둘러대세요.`,
      `npcProfiles의 remembers는 각 인물이 플레이어에 대해 기억하는 내용(이전 대화의 요약)입니다. 그 인물이 등장하면 대화든 일반 장면이든 이 기억과 어긋나지 않게 행동하세요. recentHistory에 ${partner}가 이미 한 말은 다시 하지 마세요. 같은 경고·같은 소식을 표현만 바꿔 되풀이하는 것도 반복입니다. 매 대답은 아직 하지 않은 말이어야 합니다. 플레이어가 무엇을 하겠다고 정하면(가 보겠다, 처리하고 오겠다 등) 그 대답은 짧은 작별 한마디로 끝내세요. withThisNpc는 지금까지 플레이어와 ${partner} 사이에 있었던 일(이전 대화·약속·도움·싸움·거래)의 기록이고, storySoFar의 [인물 메모]와 [약속·거래·빚]도 함께 참고하세요. ${partner}는 그 일을 기억하는 사람처럼 말해야 합니다: 이미 나눈 이야기를 처음 듣는 척하거나 같은 설명을 반복하지 말고, 지난 약속·빚·도움·상처를 자연스럽게 언급하며, 플레이어가 이룬 일(퀘스트 완료, 명성)을 들었다면 그에 맞게 대하세요.`,
      `대화 모드에서 choices에는 플레이어가 ${partner}에게 실제로 입 밖에 내는 말 그대로(구어체 직접 화법) 대사 3개를 따옴표 없이 넣으세요. 세 대사는 역할이 완전히 달라야 합니다: 1번 진행 — ${partner}가 방금 한 말(제안·부탁·정보·요구)을 받아들이거나 그 흐름대로 이야기를 앞으로 진행하는 말(수락, 다음에 할 일 확인, 바로 움직이겠다는 말). 2번 살짝 다른 방법 — 같은 화제에 응하되 방식을 바꾸는 말(조건 걸기, 보수 흥정, 다른 방법 제안, 의심하며 확인하기). 3번 거절 또는 상황에서 벗어나기 — 제안을 거절하거나 미루는 말, 또는 이 대화·상황에서 빠져나오는 말(다른 볼일을 대며 자리를 뜨기, 생각해 보겠다며 물러나기, 작별). 도발이나 허세, 새 질문이 아닙니다. 1번처럼 받아들이거나 출발하겠다는 말이면 안 됩니다. 셋 다 질문이거나 셋 다 같은 내용을 다르게 묻는 말이면 안 됩니다. ${playerVoice} '~라고 한다', '~을 묻는다', '~을 부탁한다' 같은 행동 서술은 금지입니다. 예: (X) 그 의뢰에 대해 자세히 알려 달라고 한다 → (O) 그 의뢰, 좀 더 자세히 알려 줄 수 있어요? playerAction이 이런 행동 서술이면 그 의도를 플레이어가 실제로 하는 말로 바꿔 playerLine에 넣고, 이미 대사이거나 다가가 말을 거는 행동뿐이면 playerLine은 빈 문자열입니다. check는 null, moveToPinId는 빈 문자열입니다. 관계나 호감도가 실제로 변했다면 relationshipUpdates에 반영하세요.`,
      `플레이어가 다음에 할 일이 정해지면(의뢰를 받거나 거절함, 갈 곳·만날 사람·건넬 물건이 정해짐, 약속이나 거래가 맺어짐) 더 끌지 말고 그 대답에서 바로 한두 마디로 마무리하고 endTalk:true를 반환하세요. 그러면 게임이 곧장 다음 장면으로 넘어갑니다. 플레이어가 대화 중에 자리를 뜨거나 다른 곳으로 가는 등 대화가 아닌 행동을 하면, line은 빈 문자열로 두고 text에 그 행동을 짧게 서술한 뒤 endTalk:true를 반환하세요. 그 서술을 NPC의 말처럼 쓰지 마세요. 대화는 짧게 끝납니다. NPC는 매 대답마다 새 정보·결정·조건 중 하나를 꼭 내놓고, 같은 이야기를 반복하거나 질문으로 되묻기만 하며 시간을 끌지 마세요. 대화에는 끝이 있습니다. 다음 중 하나가 되면 ${partner}가 자연스럽게 마무리하는 말을 하고 endTalk:true를 반환하세요: 의뢰·퀘스트를 맡기거나 플레이어가 수락·거절함, 거래·약속이 성사되거나 결렬됨, 플레이어가 물은 것을 다 들어 더 나눌 이야기가 없음, ${partner}가 더 말하기 싫어하거나(반감·적대) 볼일이 있어 자리를 떠야 함, 플레이어가 작별 인사를 함. 할 말이 없는데 같은 이야기를 되풀이하거나 "더 궁금한 게 있나요?"로 대화를 억지로 이어 가지 마세요. endTalk:true일 때 choices는 빈 배열입니다. 지금까지 플레이어가 이 대화에서 한 말은 ${talkTurns}번입니다.${lastReply ? ` 이번이 이 대화의 마지막 대답입니다.${decided ? ' 플레이어가 할 일을 정하고 떠나려 합니다.' : ''} ${partner}는 플레이어의 말에 짧게 답한 뒤 작별·당부·응원 같은 마무리 한마디로 끝내세요. 질문이나 새 화제를 꺼내 대답을 기다리게 하지 마세요. endTalk:true를 반환하세요.` : talkTurns >= 3 ? ` 대화가 길어지고 있습니다. 새로 줄 정보나 결정이 없다면 이번 대답에서 정리하고 endTalk:true를 반환하세요.` : ''}`,
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
      '이번 요청은 선택지 다시 뽑기입니다. 장면을 진행하지 말고 상태도 바꾸지 마세요. text는 빈 문자열, 변경 필드는 모두 비우고, 최근 기록의 현재 장면에 맞는 새 선택지 4개만 choices에 넣으세요(1번 메인 따라가기, 2번 메인을 다른 방식으로, 3번 다른 일, 4번 도박·의외의 행동).',
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
      'addItems의 각 항목은 이름 문자열 또는 {"name":"아이템 이름","kind":"weapon|armor|accessory|item","desc":"한 문장 설명","skill":"고유 능력 이름(있을 때만)"} 객체입니다. 무기·방어구·장신구는 꼭 객체로 kind를 밝히고, 물약·열쇠·증표 같은 물건은 kind를 item으로 하세요. 등급(일반~신화)과 능력 수치는 게임 코드가 정하므로 이름에 등급을 붙이거나 수치를 지어내지 마세요. currentState.items에 각 소지품의 등급·종류·고유 능력이, equipped에 장착 중인 장비가 있으니 서술에 반영하세요.',
      '시작 소지품은 프롬프트의 명시적 시작 소지품 규칙과 게임 설정에서 직접 추가한 장비를 합쳐 구성합니다. currentState.inventory가 실제 소유 목록입니다. 이미 지급된 시작 아이템을 addItems로 중복 지급하지 마세요. 규칙 아이템의 능력과 제한은 ruleEquipment의 원문을 존중하세요.',
      '플레이어는 화면의 미니맵을 클릭해서만 장소를 이동합니다. moveToPinId는 항상 빈 문자열로 반환하고, choices에 다른 장소로 이동하는 행동을 넣지 마세요.',
      'playerAction이 "시스템이 이동을 확정했습니다"로 시작하면 플레이어는 이미 currentState.locationName에 도착했습니다. 도착한 장소의 모습과 그곳의 분위기·인물을 묘사하고, currentState.event가 있으면 그 도착 이벤트를 진행하세요.',
      'currentState.sceneNpcs는 직전 장면에서 플레이어 곁에 있던 NPC입니다. 이번 장면이 끝날 때 플레이어와 같은 자리에 있어 화면에 보여야 하는 NPC 이름을 presentNpcs 배열로 반환하세요(최대 3명). currentState.knownNpcs에 있는 인물은 그 표기를 정확히 쓰세요. 대화가 끝나 떠났거나 플레이어가 장소를 옮겼다면 빼고, 아무도 없으면 빈 배열입니다. 볼일이 끝난 인물은 자연스럽게 자리를 떠난 것으로 보고 빼세요. 같은 인물을 이유 없이 장면마다 계속 남겨두지 마세요.',
      'currentState.npcProfiles는 인물별 설정입니다(inScene:true는 지금 장면에 있는 인물). 인물의 대사와 행동은 profile의 성별·나이·신분·성격·목표에 맞추세요. 과묵한 인물은 짧게, 수줍은 인물은 머뭇거리며, 호탕한 인물은 시원시원하게 말하는 식으로 성격이 말과 행동에 드러나야 하고, 모든 인물이 같은 말투로 말하면 안 됩니다.',
      'npcProfiles에 sheet가 있는 인물은 그 설정집을 따르세요: personality(성격의 겉과 속), likes/dislikes(플레이어 행동이 likes에 맞으면 호감도를 올리고 dislikes에 걸리면 깎으며 그 인물이 실제로 반응), firstAttitude(첫 만남 태도), relations(다른 인물에 대한 태도와 언급), asCompanion(동료일 때의 모습과 실망하는 지점). 설정집 내용을 대사로 줄줄 설명하지 말고 행동과 반응으로 보여 주세요.',
      'speechStyle은 그 인물의 고정 말투입니다. "어체"에 적힌 한 가지 어체로만 말하고, 한 대답 안에서도 여러 턴에 걸쳐서도 절대 다른 어체를 섞지 마세요(예: 해요체 인물이 "~하오", "~소"를 쓰거나 하오체 인물이 "~요"를 쓰는 것 금지). speechStyle은 제작자 프롬프트의 "신분에 맞는 말투" 같은 지시보다 우선합니다(신분이 높거나 나이가 많다고 하오체·하게체로 바꾸지 마세요). recentHistory나 withThisNpc에 그 인물이 speechStyle과 다른 어체로 한 말이 있으면 그건 잘못 쓴 것이니 따라 하지 말고, 이번 대답부터 speechStyle의 어체로 말하세요. 같은 어체 안의 말버릇은 이어 가도 됩니다. 이 규칙은 대화 모드뿐 아니라 일반 서술 속 대사에도 똑같이 적용됩니다. 직원·행인처럼 npcProfiles에 없는 이름 없는 인물도 한 장면 안에서는 처음 쓴 어체를 유지하세요. speechStyle이 빈 인물이 이번 응답에서 처음 말을 하면 profile에 어울리는 말투를 정해 npcVoices에 {"name":"정확한 이름","style":"어체: 해요체 | 어미: ~요, ~죠 | 버릇: ... | 예: ..."}로 반환하고 그 말투로 말하게 하세요(예: 수줍은 19세 여성 견습생 → "조심스러운 존댓말, ~요 어미, 말끝을 자주 흐림"). 여성 인물은 profile에 거칠다·호탕하다 같은 근거가 없는 한 "~하게", "~일세", "~다, 이놈", "크하하" 같은 중년 남성 어투나 군대식 말투를 쓰지 마세요. 나이·신분이 높은 여성은 "~하오/~구려"보다 품위 있는 "~하지요/~하세요/~란다" 같은 말투가 자연스럽습니다.',
      'currentState.reputation은 세상이 플레이어를 아는 명성 점수(시작 0, 상한 없음)이고 reputationRank는 그 등급입니다. 등급 기준: 무명 0~99, 신참 100~499, 알려진 자 500~1,999, 유명인 2,000~4,999, 영웅 5,000~14,999, 전설 15,000 이상 / 수상한 자 -100 이하, 악명 높음 -1,000 이하, 공포의 대상 -5,000 이하. 사람들이 보거나 소문이 날 만한 일을 했을 때만 reputationDelta로 바꾸세요. 규모 기준: 동네 사람들이 알 만한 작은 선행·말썽 ±10~50, 이름 있는 인물을 돕거나 공개 결투에서 이김 ±50~200, 마을·세력 단위의 공적(마물 무리 토벌, 납치된 사람 구출, 큰 음모 폭로) ±300~1,000, 도시나 나라 전체가 아는 위업(재앙을 막음, 전설적 괴물 처치, 왕국의 운명을 바꿈) ±2,000~5,000. 의뢰·퀘스트 완료 자체의 기본 명성(+150)은 게임 코드가 주므로, 그 의뢰가 특히 큰 공적이었을 때만 그 차이만큼 더 주세요. 아무도 모르는 일이나 평범한 행동은 0입니다. NPC들은 플레이어의 명성 등급을 알고 첫 태도와 대우에 반영합니다(신참은 반신반의, 유명인 이상은 존중·경계·부탁, 악명은 공포·적대·문전박대).',
      'currentState.level과 xp는 플레이어의 성장 단계입니다. 전투 승리와 퀘스트 완료 경험치는 게임 코드가 자동으로 줍니다. 그 밖에 실제로 성장할 만한 경험을 했을 때만 xpGain에 종류를 적으세요(숫자 아님): "minor"는 어려운 판정 성공·위험을 무릅쓴 탐험 같은 작은 성취, "deed"는 중요한 비밀 해명·큰 위기 극복 같은 의미 있는 성취, "event"는 특별 이벤트·장소 이벤트·돌발 사건을 끝까지 해결했을 때만입니다. 이벤트가 막 시작됐거나, 어딘가로 이동·도착했거나, 무언가를 발견만 한 턴은 event가 아닙니다(빈 문자열이나 minor). 평범한 이동·대화·거래는 빈 문자열입니다. 실제 양은 게임 코드가 레벨에 맞춰 정합니다. 플레이어의 레벨이 오를수록 그에 걸맞은 강한 적과 큰 사건을 내되, 약한 상대(마을 사람 등)를 갑자기 강하게 만들지는 마세요.',
      'currentState.trainableStats는 플레이어의 성장형 능력치입니다. 이번 playerAction이 실제로 어떤 능력치를 단련했다면 그 id를 trained 배열에 최대 2개 넣으세요(예: 마법서 연구·주문 연습→지능, 운기조식→내공, 잠입·추격·곡예→민첩, 무거운 짐 나르기·힘겨루기→근력, 설득·협상→매력류). 레벨이 오를 때 많이 단련한 능력치가 더 크게 오릅니다. 평범한 이동·잡담·구경은 빈 배열입니다. 전투와 주사위 판정은 게임 코드가 따로 반영하므로 넣지 마세요.',
      '제작자 프롬프트의 메인 사건은 막 순서대로만 드러납니다. 아직 시작되지 않은 막의 사건, 그 막에서야 밝혀지는 물건·정체·진실(예: 나중 막에서 발견될 유물), [GM] 표시 비밀은 플레이어가 그 단계에 이르기 전까지 서술·선택지·NPC 대사·퀘스트 어디에도 언급하지 마세요. 진행 정도는 recentHistory·storySoFar·historyFlags의 대사건 기록으로 판단합니다.',
      '서술에서 플레이어에게 다음에 할 일을 조언하거나 정리해 주지 마세요("~하는 것도 좋겠다", "그 뒤에는 ~로 이동해 ~를 추적할 수 있다" 금지). 장면만 보여 주고 판단은 선택지로 맡기세요.',
      '이름 있는 인물은 currentState.npcProfiles나 currentState.knownNpcs에 있는 사람만 등장시키세요. 목록에 없는 새 인물에게 이름(예: 잭, 한스)을 붙여 만들어 내지 마세요. 새로 등장시키는 사람은 단역·행인·상인·경비병·적대 인물까지 모두 여성입니다. 남성 인물은 만들지 마세요(몬스터는 예외). 말투도 여성 인물답게 쓰세요: npcProfiles의 sheet에 speech가 있으면 그대로 따르고, 없으면 "~하오/~구려/~하게/~일세" 같은 노인 남성 어투와 "놈", "형씨", "껄껄" 같은 남성적인 표현은 쓰지 마세요. 장면에 필요한 단역은 "부두의 늙은 여선원", "여경비병"처럼 이름 없이 역할로만 묘사하고, presentNpcs·relationshipUpdates·의뢰인(giver)에 넣지 마세요. 의뢰나 중요한 정보는 가능하면 목록의 인물을 통해 주세요. 장면에 정보원·상인·의뢰인·증인·안내인·적대자처럼 역할이 있는 사람이 필요하면 새 사람을 만들지 말고, npcProfiles에서 그 역할에 어울리는 기존 인물(소속·직업·장소가 맞는 사람)을 등장시켜 맡기세요. 이름 없는 단역은 스쳐 지나가는 사람에게만 쓰세요.',
      'currentState.monsters는 이 세계관에 존재하는 적대 몬스터·적대 무리 목록입니다. 몬스터는 처음부터 사람과 적대이며 NPC가 아닙니다: presentNpcs와 relationshipUpdates에 넣지 말고 대화 상대로 만들지 마세요. 목록에 없는 몬스터를 지어내거나 다른 세계관의 존재(무협에 고블린·드래곤, 판타지에 강시 등)를 등장시키지 마세요. 이야기상 습격이 자연스러울 때(위험한 곳에서 방심, 추적당함, 함정, 사건의 결과)만 ambush에 목록의 정확한 이름 하나를 넣으세요. 그러면 게임 코드가 곧바로 전투를 시작하니 서술은 습격 직전에서 멈추세요. boss:true인 존재는 메인 사건의 클라이맥스에서만 씁니다. 평범한 장면은 ambush를 빈 문자열로 두세요.',
      'currentState.party는 플레이어와 함께 다니는 동료 NPC입니다(npcProfiles에서 inParty:true). 동료는 장면을 옮겨도 늘 곁에 있으므로 presentNpcs에는 넣지 마세요. 서술에서 동료가 자기 성격과 말투로 가끔 한마디 거들거나 의견을 내고, 자기 목표·가치관에 반하는 플레이어 행동에는 반대하거나 실망하게 하세요(필요하면 relationshipUpdates로 호감도 반영). 전투에서는 동료도 함께 싸웁니다. 동료 합류·이탈은 게임 코드가 처리하니 서술로 동료를 새로 합류시키거나 떠나보내지 마세요.',
      'currentState.currentInteractionEvent가 존재하고 플레이어가 그 장소의 인물/물체와 상호작용하면 그 내용을 참고하세요.',
      '현재 장소 이벤트를 충실히 진행하세요. 조건 없는 보상, 아이템, HP 변경은 함부로 만들지 마세요.',
      '아이템은 인벤토리에 있는 정확한 이름으로만 소비하세요. 필요시 addItems, removeItems, addFlags, hpDelta를 반환하세요.',
      'hpDelta는 이번 행동으로 변한 HP 양(회복 양수, 피해 음수)입니다. 불필요하면 0입니다. HP가 0이 되면 플레이어는 사망하고 게임이 끝납니다(구출·기적 없음, 제작자 프롬프트의 사망 완화 규칙보다 우선). 함정·추락·독처럼 전투 밖 피해로 HP를 0까지 깎는 것은 정말 살아날 수 없는 상황에서만 하고, 그렇지 않으면 빈사(HP 1)에서 멈추세요.',
      '현재 상태는 explicitGameState.currentValues가 우선이며 historyFlags는 이미 발생한 사실의 기록이다. 경지·소속·막·재물 같은 현재 값은 이전 값과 동시에 적용하지 않는다. addFlags에는 현재 값 갱신과 사건 기록을 명확히 구분해 반환한다.',
      '게임 규칙이 불명확하면 보수적으로 판정하고 선택권을 남겨두세요.',
      '장면 다양성 참고 소재: '+varietyCue+'. 현재 행동과 등록된 맵·NPC·사건에 자연스럽게 맞을 때만 활용한다. 매 턴 강제 사건을 발생시키지 않고, 새 NPC·장소·보상·사건 결과를 근거 없이 확정하지 않는다. 기존 메인 사건을 반복하지 않고 일상·관계·생계·탐색의 리듬을 유지한다.',
      'D20은 플레이어가 고른 행동 자체가 위험하거나 남과 겨루는 일일 때만 요청합니다(잠입, 추격, 함정 해제, 절벽 오르기, 거짓말·협박, 억지로 문 열기 등). 이동·도착, 장소에 들어가기, 평범한 대화, 정가 거래, 둘러보기·소리 듣기에는 절대 요청하지 않습니다.',
      ...(body.recentCheck === true ? ['직전 행동들에서 이미 주사위를 굴렸습니다. 이번 장면에서는 check를 요청하지 말고 결과를 바로 서술하세요.'] : []),
      '판정이 필요하면 text에 지금 무엇이 위험하고 왜 굴리는지를 한두 문장으로 분명히 쓰고, check에 {ability,label,dc,reason,success,failure}을 반환하세요. success는 성공하면 얻는 구체적인 것(예: 사냥꾼보다 먼저 흔적을 찾아 은신처 위치를 알아냄), failure는 실패하면 치르는 구체적인 대가(예: 덫에 걸려 HP 피해, 적에게 들켜 습격당함)로 각 40자 이내입니다. ability는 currentState.characterValues에 존재하는 숫자형 능력치 ID 중 하나여야 합니다. 판정 요청 단계에서는 성공·실패·피해·보상·이동을 확정하지 말고 변경 필드를 비우세요.',
      'diceResult가 제공되면 이미 확정된 판정입니다. 같은 행동에 주사위를 다시 요청하지 말고 check:null을 반환하세요. 성공/실패는 diceResult.success를 반드시 따르고, diceResult.onSuccess/onFailure에 미리 약속한 결과를 실제로 일으키세요. 성공은 눈에 보이는 이득(새 단서·물건 addItems·목표 진척·적보다 유리한 위치, xpGain "minor")이고, 실패는 눈에 보이는 대가(hpDelta -5~-20 피해, 들켜서 ambush 습격, 물건 잃음 removeItems, 호감도·명성 하락, 적이 먼저 움직임)입니다. "아무 일도 일어나지 않았다"로 끝내지 마세요. 실패해도 이야기는 대가를 치르고 앞으로 나아갑니다.',
      '판정이 필요하지 않으면 check:null을 반환하세요. 하나의 행동에 불필요한 반복 판정을 요구하지 마세요.',
      '각 장면이 끝날 때 플레이어가 고를 행동 3가지를 choices 문자열 배열로 제시하세요(네 번째는 플레이어가 직접 입력합니다). 3개는 성격이 완전히 달라야 하며 반드시 이 순서와 역할을 지키세요. 1번 메인 따라가기 — 메인 목표(mainQuest)를 지금 바로 한 걸음 진척시키는 가장 곧은 행동. 메인 목표가 다른 곳의 일이면 그곳으로 가는 행동이고, 이미 들은 정보가 있으면 그 정보를 따라 움직이는 행동입니다(같은 걸 다시 묻기·주변 살피기 금지). 2번 서브 스토리 따라가기 — currentState.quests 가운데 메인이 아닌 퀘스트(지역 이야기·의뢰)를 한 걸음 진척시키는 행동. 그런 퀘스트가 없으면 근처의 의뢰 게시판·소문·인물에게서 새 일을 찾는 행동입니다. 3번 상황 벗어나기 — 지금 장면에서 물러나는 행동: 자리를 뜨기, 여관에서 쉬며 회복하기, 장비 정비, 근처의 다른 장소로 가기. 각 선택지의 target에 그 행동의 대상(인물·장소·물건 하나)을 쓰고, 세 target은 모두 달라야 합니다. 같은 대상에게 말 거는 선택지를 두 개 이상 넣지 마세요. 비밀을 미리 알거나 결과를 확정하지 마세요.',

      'choices는 플레이어의 행동으로 그대로 쓰이는 자연스러운 1인칭 행동 문장으로 작성하세요. 4번을 포함해 어떤 선택지에도 "특이한 행동", "(4)" 같은 꼬리표나 머리말을 붙이지 말고 행동 문장만 쓰세요. 이미 확정된 행동을 다시 반복하거나 플레이어가 알 수 없는 비밀을 누설하지 마세요.',
      '선택지가 점점 단순해지지 않게 하세요. "주변을 살펴본다", "이야기를 듣는다", "다음 장소로 향한다" 같은 막연한 행동은 금지입니다. 각 선택지는 구체적인 대상(이름 있는 인물·물건·장소·단서)과 의도·방법을 담은 한 문장입니다. recentHistory에서 플레이어가 이미 했던 것과 같은 유형의 행동은 다시 제시하지 마세요.',
      'keyFacts는 지금까지 확정된 핵심 사실(막의 결과, 죽음·배신·합류, 밝혀진 비밀, 큰 결정과 약속, 중요한 물건)입니다. 아무리 오래된 일이어도 절대 잊거나 어기지 마세요: 죽은 인물은 살아 돌아오지 않고, 배신한 인물은 그 일을 기억하며, 맺은 약속은 유효합니다.',
      'storySoFar는 recentHistory보다 앞선 플레이의 장기 기억입니다. 그 안의 사실·약속·인물 관계와 모순되게 서술하지 말고, 이미 끝난 사건을 처음 일어나는 것처럼 반복하지 마세요. 장면에 자연스럽게 맞으면 [진행 중인 사건·떡밥]이나 [약속·거래·빚]을 다시 불러와 서술이나 선택지에 엮으세요(대화·전투 모드가 아니면 4개 중 최소 1개는 이것과 연결).',
      '판정 요청(check가 존재) 시에는 choices:[]를 반환하세요. 주사위 결과를 받은 후에는 그 결과에 맞는 새 선택지 3개를 제시하세요.',
      'currentState.availableImages는 제작자가 업로드한 이미지 키 목록입니다. 장면에 적합한 키가 있을 때만 imageKey로 목록에 있는 문자열 하나를 정확히 반환하세요. 없으면 빈 문자열을 반환하세요. 없는 이미지를 지어내지 마세요.',
      '관계도는 실제 플레이에서 플레이어가 직접 만난 NPC만 기록합니다. 단순 언급, 소문, 배경 설정, 아직 만나지 않은 프롤로그 인물은 추가하지 마세요. 새 NPC와 직접 대면/대화했다면 relationshipUpdates에 {name,met:true,relation,affection}을 넣으세요. 이미 기록된 NPC의 관계 또는 호감도가 사건으로 실제 변했다면 {name,met:false,relation,affection}을 넣으세요. 호감도는 -100~100의 절대값입니다(-100 철천지원수, 0 무관심, 100 목숨을 맡길 신뢰). 첫 만남은 보통 -10~20이고, 첫인상이 나쁘거나 세력·목표가 충돌하면 처음부터 음수로 시작합니다. 플레이어가 인물의 성격·목표·소속에 반하는 행동(모욕, 협박, 약속 파기, 거짓말 들킴, 동료를 해침, 이익 침해)을 하면 깎고, 목표를 돕거나 약속을 지키면 올리세요. 한 장면의 변화는 보통 ±3~15, 결정적 배신이나 큰 은혜만 ±25까지입니다. 특별한 변화가 없으면 기존 값을 유지하세요. 해당 사항이 없으면 빈 배열입니다.',
      'npcProfiles의 attitude는 그 인물의 현재 호감도 단계와 그 단계에서 해야 할 행동입니다. 태도는 말투만이 아니라 실제 행동과 결과로 보여 주세요. 같은 부탁이라도 단계에 따라 결과가 달라야 합니다: 반감·적대 인물은 정보를 숨기거나 거짓말하고, 값을 올리거나 거절하고, 플레이어 몰래 방해하며, 적대 인물은 위협·경비 호출·공격까지 갑니다. 호의·신뢰 인물은 먼저 도움을 주고 할인·단서·비밀을 내줍니다. 말로는 화를 내면서 결국 순순히 도와주는 식으로 처리하지 마세요. 반감 이하 인물의 협조가 필요한 행동에는 D20 판정의 dc를 3~6 올리고, 호의 이상이면 3~6 내리거나 판정 없이 성공시키세요. 선택지(choices)에도 관계가 드러나게 하세요(예: 적대 인물 앞에서는 달래기·협박·피하기·대가 제시처럼 관계를 다루는 선택지).',
      'currentState.mainQuest는 메인 줄거리의 지금 단계 목표입니다(mainProgress는 몇 번째 단계인지). 장면과 선택지 중 최소 하나는 늘 mainQuest 쪽으로 이어지게 하세요. 진행·완료·다음 목표는 게임이 questBeats로 처리하므로 completedQuests·addQuests에 넣지 마세요. 막히면 다른 길(다른 인물·우회로·대가를 치르는 방법)을 열어 주세요.',
      '서브 퀘스트: 플레이어가 다른 장소에 도착하거나 메인 퀘스트 사이에 숨을 돌릴 때, 남은 퀘스트 칸이 있으면 그 장소에 어울리는 서브 퀘스트를 장면 속 제안으로 내놓으세요. 그곳의 기존 NPC가 하는 부탁(배달·호위·수색·거래·화해)이나, 그 지역에 나타나는 currentState.monsters 중 하나(boss:true 제외)를 잡아 달라는 토벌 의뢰가 좋습니다. 토벌 의뢰는 목표 문장에 몬스터 이름을 목록 표기 그대로 넣으세요(예: "숲 트롤 토벌하기"). 그 몬스터를 전투로 이기면 게임이 자동으로 완료 처리합니다. 서브 퀘스트는 메인 줄거리의 비밀을 앞당겨 밝히지 않는 선에서, 보상·평판·인물과의 관계로 보답하세요.',
      'currentState.quests는 플레이어가 지금 진행 중인 목표(퀘스트) 목록이며 최대 currentState.maxQuests개까지 동시에 가질 수 있습니다. NPC에게 의뢰·부탁을 받아 플레이어가 수락했거나, 사건으로 새로 해야 할 일이 분명해졌을 때만 addQuests에 {"text":"구체적 대상과 할 일이 담긴 짧은 한 문장, 40자 이내","giver":"의뢰한 NPC의 정확한 이름(없으면 빈 문자열)"} 형태로 새 목표를 넣으세요. 플레이어가 수락하지 않은 제안은 넣지 말고, 기존 목표와 같은 일은 다시 넣지 마세요. 목록이 이미 꽉 찼으면 새 목표를 넣지 말고, 의뢰인이 제안하면 지금은 맡을 여유가 없다는 선택지를 줄 수 있습니다. 목표 하나는 일 하나입니다. 기존 목표 문장을 고쳐 쓰거나 내용을 덧붙여 늘리지 마세요(완료 처리 후 더 긴 같은 목표를 다시 넣는 것도 금지). 같은 목표가 진행돼 다음 단계가 생겨도 기존 목표는 그대로 두고 서술로만 보여 주세요. 새로 생긴 다른 일(다른 인물의 의뢰, 새 장소 조사 등)만 addQuests에 별도 항목으로 넣으세요. 예: (X) "부두 창고를 조사한다" → "부두 창고를 조사하고 밀수업자 레온을 찾아 장부를 빼앗는다" (O) 기존 항목 유지 + 새 항목 "밀수업자 레온의 장부를 손에 넣는다". 목표를 실제로 이뤄 냈으면 currentState.quests의 문장을 글자 그대로 completedQuests에, 실패·포기·무의미해졌으면 failedQuests에 넣으세요. 변화가 없으면 모두 빈 배열입니다. 퀘스트 완료 기본 보상(명성 +150, 의뢰인 호감도 +10)은 게임 코드가 자동으로 주므로, 완료 그 자체에 대해서는 reputationDelta나 의뢰인 relationshipUpdates를 따로 올리지 마세요(완료 과정에서 생긴 다른 일은 반영). 퀘스트를 완료하는 턴에는 의뢰인이나 그 일의 결과로 손에 들어오는 보수 장비 하나(무기·방어구·장신구)를 addItems에 {"name","kind","desc"} 객체로 넣고 장면에서 건네받는 모습을 묘사하세요. 등급은 게임 코드가 정하며, 넣지 않으면 게임이 대신 지급합니다. 최종 목표는 플레이어에게 보이지 않는 GM 전용 정보입니다. 최종 목표를 목록에 그대로 넣거나 서술에서 밝히지 말고 사건을 통해 자연스럽게 드러나게 하세요. 최종 목표가 single이면 구체적 승리 조건이 실제 충족된 경우에만 finalGoalCompleted:true를 반환하세요. progress이면 currentState.finalGoalSteps의 각 단계를 실제 달성한 경우에만 0부터 시작하는 해당 인덱스를 completedGoalSteps 배열에 넣으세요. 이미 완료한 단계는 반복할 필요 없습니다. 아직 달성하지 않은 단계는 절대 완료 처리하지 마세요. progress 모드에서는 finalGoalCompleted:true만으로 종료할 수 없고 모든 단계 완료 시에만 엔딩을 서술하세요.',
      'text·choices·gesture는 모두 자연스러운 한국어로만 쓰세요. 러시아어·일본어 등 다른 언어 단어를 섞지 마세요(세계관 고유명사는 예외).',
      '다음 JSON 객체만 반환하세요: {"text":"GM의 한국어 묘사","hpDelta":0,"addItems":[],"removeItems":[],"addFlags":[],"imageKey":"","moveToPinId":"","check":null,"choices":[{"text":"1번 메인 따라가기 행동","target":"행동 대상"},{"text":"2번 메인을 다른 방식으로 접근하는 행동","target":"다른 대상"},{"text":"3번 다른 일을 하는 행동","target":"또 다른 대상"},{"text":"4번 도박·의외의 행동","target":"또 다른 대상"}],"presentNpcs":[],"npcVoices":[],"reputationDelta":0,"xpGain":"","trained":[],"ambush":"","relationshipUpdates":[],"addQuests":[],"completedQuests":[],"failedQuests":[],"completedGoalSteps":[],"finalGoalCompleted":false}',
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
    const withThisNpc = mode === 'talk' && Array.isArray(body.withThisNpc) ? body.withThisNpc.filter((x: unknown) => typeof x === 'string').slice(-30).map((x: string) => x.slice(0, 300)) : [];
    const userContent = () => JSON.stringify({ playerAction: body.action, ...(idleBeat ? { mustHappen: idleBeat === 'ambush' && ambushFoe ? `${ambushFoe}이(가) 플레이어를 덮칩니다. ambush에 "${ambushFoe}"를 넣고 본문에도 이 이름 그대로 쓰세요. 습격 직전의 한순간만 짧게 쓰면 전투는 게임이 시작합니다.` : idleBeat === 'clue' && mainNext?.goal ? `플레이어가 다음에 할 일(${String(mainNext.goal).slice(0, 120)}${mainNext.at ? `, ${String(mainNext.at).slice(0, 60)}` : ''})로 곧장 이어지는 실마리를 지금 보여 주세요: 그 인물·장소를 가리키는 전갈, 흔적, 목격담. 그 일의 결과는 쓰지 마세요.` : IDLE_BEATS[idleBeat] + IDLE_HIDE } : {}), diceResult: body.diceResult || null, keyFacts, storySoFar, withThisNpc, recentHistory: recent, explicitGameState, currentState: modelState });
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
    const choices = Array.isArray(data.choices) ? [...new Set(data.choices.filter((v: unknown): v is string => typeof v === 'string' && !FOREIGN_SCRIPT.test(v)).map((v: string) => v.trim().replace(/^[(\[]?\s*특이한\s*행동\s*\d?\s*[)\]]?\s*[:：\-—]?\s*/, '')).filter((v: string) => v.length >= 2 && v.length <= 140))].slice(0, 3) : [];
    // Only a foe from this genre's roster can ambush, and never mid-fight or mid-talk.
    const monsterNames = Array.isArray(state.monsters) ? state.monsters.map((m: { name?: unknown }) => String(m?.name || '')) : [];
    const toMonster = (v: unknown) => { const t = typeof v === 'string' ? v.trim() : ''; return !t ? '' : monsterNames.find((n: string) => n === t) || monsterNames.find((n: string) => n.includes(t) || t.includes(n)) || ''; };
    const ATTACK = /(습격|덮치|덮쳐|돌진|달려들|달려든|덤벼|막아서|모습을 드러)/;
    // By full name, or a telling word standing on its own (monsters.ts namesFoe); a boss only by its full name.
    const foeInScene = (t: string) => monsterNames.find((n: string) => t.includes(n)) || monsterNames.find((n: string) => !(state.monsters || []).find((m: { name?: unknown; boss?: unknown }) => m?.name === n && m?.boss) && namesFoe(t, n));
    const sceneText = String(data.text || '');
    const ambush = mode ? '' : toMonster(data.ambush) || (Array.isArray(data.presentNpcs) ? data.presentNpcs.map(toMonster).find(Boolean) || '' : '') || (!(data.check && typeof data.check === 'object') && ATTACK.test(sceneText) ? foeInScene(sceneText) || ambushFoe : '');
    const trainableIds = Array.isArray(state.trainableStats) ? state.trainableStats.map((t: { id?: unknown }) => String(t?.id || '')) : [];
    const trained = !mode && Array.isArray(data.trained) ? data.trained.filter((id: unknown): id is string => typeof id === 'string' && trainableIds.includes(id)).slice(0, 2) : [];
    const xpGain = typeof data.xpGain === 'string' && ['minor', 'deed', 'event'].includes(data.xpGain) ? data.xpGain : '';
    const reputationDelta = typeof data.reputationDelta === 'number' && Number.isFinite(data.reputationDelta) ? Math.max(-5000, Math.min(5000, Math.round(data.reputationDelta))) : 0;
    const presentNpcs = Array.isArray(data.presentNpcs) ? [...new Set(data.presentNpcs.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim()).filter((v: string) => v.length >= 1 && v.length <= 30))].slice(0, 3) : [];
    const profileNames = Array.isArray(state.npcProfiles) ? state.npcProfiles.map((p: { name?: unknown }) => String(p?.name || '')) : [];
    const npcVoices = [...fixedVoices, ...(Array.isArray(data.npcVoices) ? data.npcVoices.filter((v: { name?: unknown; style?: unknown }) => v && typeof v.name === 'string' && typeof v.style === 'string' && v.style.trim() && profileNames.includes(v.name.trim()) && !fixedVoices.some(f => f.name === String(v.name).trim()) && !FOREIGN_SCRIPT.test(v.style))
      .map((v: { name: string; style: string }) => ({ name: v.name.trim(), style: v.style.trim().slice(0, VOICE_LENGTH) })) : [])].slice(0, 6);
    const check = !mode && body.reroll !== true && body.debug !== true && !body.diceResult && data.check && typeof data.check === 'object' ? {
      ability: String(data.check.ability || '').toLowerCase().slice(0, 50),
      label: String(data.check.label || '').slice(0, 60),
      reason: String(data.check.reason || '').slice(0, 200),
      dc: Number(data.check.dc),
      // What hangs on the roll, shown before the player rolls.
      success: String(data.check.success || '').slice(0, 80),
      failure: String(data.check.failure || '').slice(0, 80),
    } : null;
    const relationshipUpdates = Array.isArray(data.relationshipUpdates) ? data.relationshipUpdates.slice(0, 12).filter((item: unknown) => !!item && typeof item === 'object' && typeof (item as {name?:unknown}).name === 'string').map((item: {name:string;met?:boolean;relation?:string;affection?:number}) => ({name:item.name.trim().slice(0,50),met:item.met===true,relation:typeof item.relation==='string'?item.relation.slice(0,30):'',affection:typeof item.affection==='number'&&Number.isFinite(item.affection)?Math.max(-100,Math.min(100,Math.round(item.affection))):undefined})) : [];
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
      // The whole reply came back as narration, no words of the partner anywhere: ask once for what they say, so the talk
      // shows them speaking (the narration stays as the scene around it).
      if (!lineParts.length && !parts.some(p => p.type === 'speech') && !playerLeaves) {
        const words = await retryTalkLine(partner, body, history, state);
        if (words) lineParts.push(...(/[“"「『]/.test(words) ? toParts(words) : [{ type: 'speech' as const, text: strip(words) }]));
      }
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
      const ownAddress = new Set(saidBefore.flatMap((t: string) => addressesIn(t)));
      const inVoice = (t: string) => { const used = addressesIn(t); return !ownAddress.size || !used.length || used.some(a => ownAddress.has(a)); };
      if (speech.some(inVoice)) speech = speech.filter(inVoice);
      if (!talkLeft && !speech.length && saidBefore.length) speech = fresh((await retryTalkLine(partner, body, history, state, saidBefore)).split(/\n+/).map(t => strip(t)).filter(Boolean));
      parts = talkLeft ? [] : (speech.length ? speech : [strip(rawLine) || '…']).map(text => ({ type: 'speech' as const, text: text.slice(0, 600) })).slice(0, 4);
      line = parts.filter(p => p.type === 'speech').map(p => p.text).join(' ');
      const FAREWELL = /(기약|다음에 (또 )?(봅시다|봐요|뵙|보자)|다시 만나(면|자|요|게)|다시 보자|또 보자|또 봐|몸 조심|조심히 가|조심해서 가|살펴 가|잘 가|여기까지(다|야|예요|입니다|군|로))/;
      if (!talkLeft && !questTalk && talkTurns >= 1 && FAREWELL.test(line)) data.endTalk = true;
      // Past the turn limit the talk closes whatever the model said.
      if (lastReply) data.endTalk = true;
      const replySentences = sentences(line);
      const echoed = replySentences.filter(x => saidBefore.some((y: string) => pairShare(x, y) >= 0.45)).length;
      if (!talkLeft && !questTalk && talkTurns >= 2 && replySentences.length && echoed * 2 >= replySentences.length) data.endTalk = true;
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
    const recentActs = history.filter((h: string) => h.startsWith('플레이어:')).slice(-3).map((h: string) => h.replace(/^플레이어:\s*/, ''));
    const ASKING = /(묻는다|물어본다|물어보다|캐묻는다|듣는다|들어 본다|들어본다|알아본다).?$/;
    const rehash = (c: string) => recentActs.some((a: string) => repeats(c, a) || pairShare(c, a) >= 0.4 || [...contentWords(c)].filter(w => contentWords(a).has(w)).length >= 2);
    const here = [...contentWords(String(state.locationName || ''))].filter(w => !/^(입구|근처|안쪽|바깥|앞|가장자리)$/.test(w));
    const mainDoneNow = Array.isArray(state.questFinished) && state.questFinished.length > 0;
    const goesHere = (c: string) => /(가서|간다|향한다|이동한다|돌아간다|찾아간다)/.test(c) && here.some(w => c.includes(w));
    const askHeavy = (list: string[]) => list.filter(c => ASKING.test(c)).length >= 2 && recentActs.some((a: string) => ASKING.test(a));
    if (!mode && !check && !ambush && choices.length === 3 && (sameTarget(choices as string[], choiceTargets) || (choices as string[]).some(rehash) || askHeavy(choices as string[]) || idleLoop || (choices as string[]).some(goesHere) || mainDoneNow)) {
      try {
        const fix = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.9, response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: '한국어 CRPG의 다음 행동 선택지 3개를 다시 씁니다. 기존 선택지는 같은 대상을 겹치게 노리거나, 플레이어가 방금 한 행동(alreadyDone)을 되풀이하거나, 같은 걸 계속 묻기만 해서 이야기가 제자리입니다. 세 선택지의 대상이 모두 다르게 하고, alreadyDone과 같은 주제를 다시 묻거나 하는 선택지는 금지입니다. 묻기·듣기 선택지는 최대 1개이고, 이미 들은 정보가 있으면 그 정보를 따라 실제로 움직이는 행동(그 장소로 간다, 흔적을 쫓는다, 그 사람을 찾아간다)을 내세요. 모든 선택지는 scene의 마지막 상황(누가 나타났는지, 무엇이 덮쳐 오는지, 무엇을 찾았는지)에 바로 이어져야 합니다. 1번은 mainQuest를 향해 지금 바로 움직이는 행동입니다. mainQuestDone이 true면 그 목표는 이번 장면에서 이미 끝났으니 1번은 nextMainQuest를 향하는 행동입니다. 플레이어는 이미 location에 있으니 그곳으로 가는 선택지는 금지입니다(그 안의 특정 건물·인물로 가는 건 가능). 역할 순서: 1번 메인 따라가기(mainQuest를 지금 바로 진척시키는 가장 곧은 행동, 다른 곳의 일이면 그곳으로 감), 2번 서브 스토리 따라가기(quests 중 메인이 아닌 퀘스트를 진척, 없으면 근처에서 새 일을 찾음), 3번 상황 벗어나기(자리 뜨기, 여관 휴식·회복, 정비, 근처 다른 장소). 1인칭 행동 문장, 각 80자 이내, 플레이어가 모르는 비밀을 쓰지 마세요. 다음 JSON만 반환: {"choices":[{"text":"","target":""},{"text":"","target":""},{"text":"","target":""}]}' },
              { role: 'user', content: JSON.stringify({ scene: String(data.text || '').slice(0, 1500), location: state.locationName || '', nearbyPlaces: Array.isArray(state.adjacentLocations) ? state.adjacentLocations.map((p: { name?: unknown }) => p?.name) : [], quests: state.quests || [], mainQuest: state.mainQuest || '', mainQuestDone: mainDoneNow, nextMainQuest: state.nextMainQuest || '', alreadyDone: recentActs, repetitive: choices }) },
            ] }),
          cache: 'no-store', signal: AbortSignal.timeout(20000),
        });
        const fresh = JSON.parse((await fix.json())?.choices?.[0]?.message?.content || '{}')?.choices;
        if (Array.isArray(fresh)) {
          const targets: Record<string, string> = {};
          const texts = fresh.map((v: { text?: unknown; target?: unknown }) => { const t = String(v?.text || '').trim(); if (typeof v?.target === 'string') targets[t] = v.target; return t; }).filter((t: string) => t.length >= 2 && t.length <= 140 && !FOREIGN_SCRIPT.test(t));
          if (texts.length === 3 && new Set(texts).size === 3 && !sameTarget(texts, targets) && !texts.some(rehash) && !texts.some(goesHere)) choices.splice(0, choices.length, ...texts);
        }
      } catch (err) { console.warn('선택지 다양화 실패', err); }
    }
    // Suggested replies must be speech; narrated intents are dropped unless nothing else is left.
    const NARRATED = /(한다|묻는다|말한다|건넨다|요청한다|부탁한다|청한다|본다|듣는다)\.?$/;
    const thirdPerson = (v: string) => partner.length >= 2 && ['와', '과', '에게', '한테', '를', '을', '의'].some(p => v.includes(`${partner}${p} `));
    const spoken = (v: string) => !NARRATED.test(v) && !LEAVING.test(v) && !plainEnd(v) && !/겠다.?$/.test(v) && !thirdPerson(v);
    const spokenChoices = mode === 'talk' ? (choices as string[]).map((v: string) => v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim()).filter(spoken) : [];
    // Too few spoken replies survive when the model narrates them; ask once more for real lines to fill three.
    if (mode === 'talk' && spokenChoices.length < 3) {
      try {
        const refill = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.8, response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: `한국어 CRPG 대화 장면입니다. 플레이어가 ${partner}에게 다음에 실제로 입 밖에 낼 대사 후보를 만듭니다. 구어체 직접 화법 대사만 쓰고, '~라고 묻는다', '~한다' 같은 행동 서술은 금지입니다. 역할이 서로 다른 대사로 쓰세요: 상대의 말을 받아들여 이야기를 진행하는 말 / 같은 화제에 조건·흥정·다른 방법으로 응하는 말 / 거절하거나 미루는 말, 또는 이 대화·상황에서 빠져나오는 말(자리를 뜨기, 물러나기, 작별. 도발·허세·새 질문은 아님). ${playerVoice} 이미 있는 대사와 같은 역할·내용은 피하세요. 따옴표 없이 각 60자 이내. 다음 JSON만 반환: {"choices":["대사1","대사2","대사3"]}` },
              { role: 'user', content: JSON.stringify({ npcJustSaid: line, recentHistory: history.slice(-8), existing: spokenChoices, rejectedNarrations: (choices as string[]).filter(v => !spokenChoices.includes(v)) }) },
            ] }),
          cache: 'no-store', signal: AbortSignal.timeout(20000),
        });
        const extra = JSON.parse((await refill.json())?.choices?.[0]?.message?.content || '{}')?.choices;
        if (Array.isArray(extra)) for (const v of extra) {
          const t = typeof v === 'string' ? v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim() : '';
          if (t.length >= 2 && t.length <= 140 && !FOREIGN_SCRIPT.test(t) && spoken(t) && !spokenChoices.includes(t) && spokenChoices.length < 3) spokenChoices.push(t);
        }
      } catch (err) { console.warn('대화 선택지 보충 실패', err); }
    }
    const saidByPlayer = history.filter((h: string) => h.startsWith('플레이어: "')).slice(-8).map((h: string) => h.slice(7, -1));
    // Skipped when the talk is closing anyway: no replies are shown then.
    if (mode === 'talk' && !lastReply && !(data.endTalk === true || talkLeft || decided) && talkChoicesAlike(spokenChoices, saidByPlayer)) {
      try {
        const redo = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.9, response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: [
                `한국어 CRPG 대화 장면입니다. 플레이어가 ${partner}에게 다음에 할 수 있는 대사 3개를 만듭니다. 세 대사는 내용·목적·말투가 완전히 달라야 합니다.`,
                'dig: 진행. npcJustSaid의 제안·부탁·정보를 받아들이거나 그 흐름대로 이야기를 앞으로 미는 말(수락, 다음 할 일 확인, 바로 움직이겠다는 말).',
                'shift: 살짝 다른 방법. 같은 화제에 응하되 방식을 바꾸는 말(조건 걸기, 보수 흥정, 다른 방법 제안, 의심하며 확인). dig와 문장 구조·핵심 단어가 달라야 합니다.',
                'bold: 거절 또는 상황에서 벗어나기. 제안을 거절하거나 미루는 말, 또는 이 대화·상황에서 빠져나오는 말(다른 볼일을 대며 자리를 뜨기, 생각해 보겠다며 물러나기, 작별). 도발·허세·새 질문은 아닙니다. 받아들이거나 출발하겠다는 말은 안 됩니다. dig·shift와 같은 명사를 쓰지 마세요.',
                playerVoice,
                'alreadySaid에 있는 플레이어 대사와 같거나 비슷한 말은 금지입니다. 구어체 직접 화법만, 따옴표 없이 각 60자 이내. 행동 서술(~한다, ~묻는다) 금지.',
                '다음 JSON만 반환: {"dig":"...","shift":"...","bold":"..."}',
              ].join(' ') },
              { role: 'user', content: JSON.stringify({ npc: partner, npcJustSaid: line, recentHistory: history.slice(-8), alreadySaid: saidByPlayer, tooSimilar: spokenChoices }) },
            ] }),
          cache: 'no-store', signal: AbortSignal.timeout(20000),
        });
        const roles = JSON.parse((await redo.json())?.choices?.[0]?.message?.content || '{}');
        const fresh = [roles?.dig, roles?.shift, roles?.bold].map(v => typeof v === 'string' ? v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim() : '').filter(t => t.length >= 2 && t.length <= 140 && !FOREIGN_SCRIPT.test(t) && !NARRATED.test(t));
        if (fresh.length === 3) spokenChoices.splice(0, spokenChoices.length, ...fresh);
      } catch (err) { console.warn('대화 선택지 다양화 실패', err); }
    }
    // Speech in the narration keeps to each person's fixed voice. The model still slips old-man endings (~하오, ~이오,
    // ~구려, ~일세) into a commander's or an elder's lines; when no one named in the scene has 하오체/하게체 as their
    // speechStyle, the quoted lines are rewritten once to the speakers' own styles, narration untouched.
    // Old-voice endings at the end of a sentence: ~시오 (주시오, 하시오; not ~십시오), ~소 (했소, 냈소, 있소), ~하오/~이오,
    // ~구려, ~이외다, ~일세, and ~하게/~하네/~오게.
    const OLD_VOICE = /((?<!십)시오|[가-힣]소|하오|이오|구려|이외다|일세|하게|하네|오게|주게|보게|가게)\s*[.!?…~]*\s*["”」]?(\s|$)/;
    const named = profiles.filter(p => typeof p?.name === 'string' && sceneText.includes(String(p.name)) && String(p.speechStyle || '').trim()).map(p => ({ name: String(p.name), speechStyle: String(p.speechStyle) }));
    if (!mode && OLD_VOICE.test(sceneText) && !named.some(n => /하오체|하게체/.test(n.speechStyle))) {
      try {
        const fix = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.3, response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: '한국어 CRPG 장면 글입니다. 따옴표 안의 대사만 고칩니다. 각 대사를 말한 인물을 찾아 speakers의 speechStyle(어체·어미·버릇) 그대로 말하게 바꾸세요. "~하오", "~이오", "~구려", "~하시오", "~소", "~일세", "~하게" 같은 옛 어투는 모두 그 인물의 어체로 바꿉니다(하십시오체면 ~습니다/~십시오, 해요체면 ~요, 해체면 반말). speakers에 없는 이름 없는 인물은 해요체로 바꾸세요. 따옴표 없이 서술에 섞여 있는 대사도 찾아 같은 방법으로 고치고, 큰따옴표로 감싸 앞뒤 줄을 바꿔 따로 한 줄에 두세요. 뜻과 길이는 그대로 두고, 그 밖의 서술 문장과 【장소 · 때】 줄은 바꾸지 마세요. 다음 JSON만 반환: {"text":"고친 전체 글"}' },
              { role: 'user', content: JSON.stringify({ speakers: named, text: sceneText }) },
            ] }),
          cache: 'no-store', signal: AbortSignal.timeout(20000),
        });
        const fixed = JSON.parse((await fix.json())?.choices?.[0]?.message?.content || '{}')?.text;
        if (typeof fixed === 'string' && fixed.trim().length > sceneText.length * 0.8 && !FOREIGN_SCRIPT.test(fixed)) data.text = fixed.trim();
      } catch (err) { console.warn('대사 어체 교정 실패', err); }
    }
    // The same in a talk: the partner's lines (unquoted parts) slip into 하오체 too, as Edria did on the entrance test.
    // Unless the partner's own style is 하오체/하게체, those lines are rewritten once to that style.
    const partnerStyle = String(profiles.find(p => p?.name === partner)?.speechStyle || '');
    const oldLines = mode === 'talk' && partnerStyle && !/하오체|하게체/.test(partnerStyle) ? parts.map((p, i) => ({ p, i })).filter(({ p }) => OLD_VOICE.test(p.text)) : [];
    if (oldLines.length) {
      try {
        const fix = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.3, response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: '한국어 CRPG 대화 글 목록입니다. 각 글에서 인물이 하는 말(따옴표가 없어도)을 speechStyle(어체·어미·버릇) 그대로 말하게 고치고, 서술 문장은 그대로 두세요. "~하오", "~이오", "~구려", "~하시오", "~소", "~일세", "~하게" 같은 옛 어투는 모두 그 어체로 바꿉니다(하십시오체면 ~습니다/~십시오, 해요체면 ~요, 해체면 반말). 뜻과 길이는 그대로 두세요. 다음 JSON만 반환: {"lines":["고친 대사1", ...]} (같은 개수, 같은 순서)' },
              { role: 'user', content: JSON.stringify({ speechStyle: partnerStyle, lines: oldLines.map(({ p }) => p.text) }) },
            ] }),
          cache: 'no-store', signal: AbortSignal.timeout(20000),
        });
        const fixed = JSON.parse((await fix.json())?.choices?.[0]?.message?.content || '{}')?.lines;
        if (Array.isArray(fixed) && fixed.length === oldLines.length && fixed.every(v => typeof v === 'string' && v.trim() && !FOREIGN_SCRIPT.test(v))) {
          oldLines.forEach(({ i }, k) => { parts[i] = { ...parts[i], text: String(fixed[k]).trim() }; });
          line = parts.filter(p => p.type === 'speech').map(p => p.text).join(' ');
        }
      } catch (err) { console.warn('대화 어체 교정 실패', err); }
    }
    if (mode === 'talk' && spokenChoices.length) choices.splice(0, choices.length, ...spokenChoices);
    // The line that settles a quest talk: a decision, never a question; a doubtful one falls back to the game's own.
    const rawAccept = questTalk && typeof data.acceptLine === 'string' ? data.acceptLine.trim().replace(/^["“”'「『]+|["“”'」』]+$/g, '') : '';
    const isDecision = (v: string) => !!v && v.length <= 90 && !/[?？]$/.test(v) && !/(묻|물어|알려 ?주|궁금|자세히|설명해|어떻게|무엇|뭔가요|뭐죠|인가요|일까요|할까요)/.test(v) && !FOREIGN_SCRIPT.test(v);
    // With the talk's outcome known (acceptHint), the line is always written for it; otherwise the GM's own is used.
    const acceptHint = typeof body.acceptHint === 'string' ? body.acceptHint.slice(0, 300) : '';
    let acceptLine = isDecision(rawAccept) && !acceptHint ? rawAccept : '';
    // Missing or doubtful: one small call writes it as an answer to what the partner just said.
    const questNext = questTalk && Array.isArray(state.questBeats) ? (state.questBeats as { quest?: unknown; next?: { do?: unknown; who?: unknown } | null }[]).find(q => q?.next?.do === 'talk' && q.next.who === partner) : undefined;
    const acceptQuest = questNext ? String(questNext.quest || '') : body.holdTalk === true ? String(body.holdQuest || '').slice(0, 80) : '';
    if (questTalk && !acceptLine && acceptQuest) {
      try {
        const gen = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.7, response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: `한국어 CRPG 대화입니다. 플레이어가 ${partner}에게 할 대사 한 문장을 씁니다: ${partner}가 방금 한 말에 답하면서, 퀘스트 일을 받아들여 매듭짓는 결정의 말. 질문·망설임·되묻기는 안 됩니다. whenChosen이 있으면 그 말을 고를 때 이어질 일이니, 그 일로 자연스럽게 이어지는 말을 쓰세요(보고를 받는 일이면 보고하는 말, 일을 맡기는 일이면 맡겠다는 말). 해요체나 하십시오체, 60자 이내, 따옴표 없이. 주인공의 출신·직업은 지어내지 마세요. 다음 JSON만 반환: {"line":"..."}` },
              { role: 'user', content: JSON.stringify({ npcJustSaid: line, quest: acceptQuest, ...(acceptHint ? { whenChosen: acceptHint } : {}) }) },
            ] }),
          cache: 'no-store', signal: AbortSignal.timeout(15000),
        });
        const made = String(JSON.parse((await gen.json())?.choices?.[0]?.message?.content || '{}')?.line || '').trim().replace(/^["“”'「『]+|["“”'」』]+$/g, '');
        if (isDecision(made)) acceptLine = made;
      } catch (err) { console.warn('수락 대사 생성 실패', err); }
    }
    const playerLine = mode === 'talk' && typeof data.playerLine === 'string' && !FOREIGN_SCRIPT.test(data.playerLine) ? data.playerLine.trim().replace(/^["“”'「『]+|["“”'」』]+$/g, '').slice(0, 300) : '';
    return NextResponse.json({ acceptLine, setLevel: body.debug === true && Number.isInteger(data.setLevel) ? Math.max(1, Math.min(100, data.setLevel)) : 0, enemy, npcPowers, trained: check ? [] : trained, ambush: check ? '' : ambush, xpGain: check ? '' : xpGain, gesture, line, parts, playerLine, npcVoices, endTalk: mode === 'talk' && (data.endTalk === true || talkLeft || decided), talkLeft, reputationDelta: check ? 0 : reputationDelta,addQuests:check?[]:addQuests,completedQuests:check?[]:completedQuests,failedQuests:check?[]:failedQuests,finalGoalCompleted,completedGoalSteps,relationshipUpdates: check ? [] : relationshipUpdates, choices: check ? [] : choices, presentNpcs: check ? null : presentNpcs, check, moveToPinId: check ? '' : moveToPinId, imageKey, text: String(data.text || '').slice(0, 6000), hpDelta: check ? 0 : Number.isFinite(data.hpDelta) ? Math.trunc(data.hpDelta) : 0,
      addItems: !check && Array.isArray(data.addItems) ? data.addItems.slice(0, 5) : [], removeItems: !check && Array.isArray(data.removeItems) ? data.removeItems.slice(0, 5) : [],
      addFlags: !check && Array.isArray(data.addFlags) ? data.addFlags.slice(0, 5) : [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'GM 서버 오류' }, { status: 500 });
  }
}
