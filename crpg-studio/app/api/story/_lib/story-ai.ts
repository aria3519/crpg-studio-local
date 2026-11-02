// AI-written main stories (정통 판타지). Flow:
//   pitches   three short story ideas for the wizard's first step
//   skeleton  the whole design of the picked idea: villain, boss, four acts, progress steps, and which places,
//             people and foes each act owns, so acts written apart do not repeat each other
//   acts      the four acts' quest steps (beats the game checks), written in parallel, plus the prologue
//   check     code checks (names, places, foes, shape, repeats) and an AI read for repeats and plot holes
//   fix       only the acts with problems are rewritten, then checked again (twice at most)
// Everything a story names comes from story-material.ts, so it has a profile, an image, a battle entry or a map pin.
import type { Beat } from '../../../_lib/quest-beats';
import type { GeneratedStory, MainPrologue, MainStep } from '../../../_lib/prologues';
import { ALL_PLACES, CAST, CAST_NAMES, CITY_PLACES, FACTIONS, FINAL_BOSSES, FIXED_MAIN_HOOKS, FIXED_MAIN_NAMES, FOES, SIDE_MATERIAL, STORY_CITIES, VILLAINS, WORLD_PLACES } from '../../../_lib/story-material';

const MODEL = process.env.OPENAI_STORY_MODEL || 'gpt-4.1';

export type Pitch = { title: string; city: string; villain: string; finalBoss: string; hook: string; tone: string; premise: string };
type ActPlan = { title: string; summary: string; places: string[]; npcs: string[]; foes: string[]; boss: string; reveal: string };
export type Skeleton = {
  name: string; city: string; villain: string; finalBoss: string; factions: string[]; requiredNpcs: string[];
  hook: string; villainPlot: string; bossNote: string; goal: string; progressSteps: string[];
  opening: string; startItem?: { name: string; kind: 'weapon' | 'armor' | 'accessory' | 'item'; desc: string } | null; acts: ActPlan[];
};
type ActOut = { steps: MainStep[] };
type PrologueOut = { title: string; firstQuest: string; firstBeats: Beat[]; text: string; actions: string[] };
export type Issue = { act: number; detail: string };

async function ask<T>(system: string, user: unknown, temperature: number, maxTokens: number): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Error('이야기 생성에는 OPENAI_API_KEY가 필요합니다.');
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(150000),
        body: JSON.stringify({ model: MODEL, temperature, max_completion_tokens: maxTokens, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) }] }),
      });
      if (!r.ok) throw Error(`AI 요청 실패 (${r.status})`);
      const data = await r.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw Error('AI 응답이 비었습니다.');
      return JSON.parse(content.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')) as T;
    } catch (e) { last = e; }
  }
  throw last instanceof Error ? last : Error('AI 요청 실패');
}

// ── shared material, in the words the AI sees ──
const castLines = () => CAST.map(c => `- ${c.line}`).join('\n');
const placeLines = () => [...STORY_CITIES.map(c => `${c}(도시) 안: ${CITY_PLACES[c].join(', ')}`), `도시 밖(세계 지도): ${WORLD_PLACES.join(', ')}`].join('\n');
const foeLines = () => FOES.map(f => `- ${f.name} (위협 ${f.power}${f.boss ? ', 보스급: 이야기 비트로만 등장' : ''}): ${f.desc}`).join('\n');
const WORLD_RULES = `정통 판타지 세계. 마법은 마탑의 학문 마법, 교단의 신성력, 정령·악마와의 계약 세 갈래이며 대가가 있다. 귀족 서열·호칭(전하·각하·경)을 지킨다. 총기·전기·상태창은 없다. 세력: ${FACTIONS.join(', ')}.`;
const SHARED_RULES = `규칙:
- 등장인물은 아래 고정 NPC만 쓴다. 새 이름 있는 인물을 만들지 않는다(이름 없는 경비병·수병·인부 같은 단역은 괜찮다). NPC의 나이·소속·성격·비밀을 바꾸지 않는다.
- 장소는 아래 목록의 이름만 쓴다. 적(몬스터)은 아래 적 목록의 이름만 쓴다.
- 흑막의 음모는 그 인물의 기존 비밀·목표에서 자라나야 한다. 흑막은 정해진 막의 발각 조건 전까지 정체를 숨긴다.
- 고정 서브 소재(아래)와 같은 플롯을 메인에 쓰지 않는다. 기존 고정 메인 이야기를 베끼지 않는다.
- 모든 문장은 자연스러운 한국어. 고유명사 표기를 목록 그대로 쓴다.`;
const materialBlock = () => `${WORLD_RULES}\n\n[고정 NPC]\n${castLines()}\n\n[장소]\n${placeLines()}\n\n[적 목록]\n${foeLines()}\n최종 보스 후보: ${FINAL_BOSSES.join(', ')}\n흑막 후보: ${VILLAINS.join(', ')}\n\n[고정 서브 소재 — 메인에 쓰지 말 것]\n${SIDE_MATERIAL.map(s => `- ${s}`).join('\n')}\n\n[기존 고정 메인 — 베끼지 말 것]\n${FIXED_MAIN_HOOKS.map(s => `- ${s}`).join('\n')}`;

// ── 1. pitches ──
export async function makePitches(avoid: string[] = []): Promise<Pitch[]> {
  const system = `너는 장기 CRPG의 메인 시나리오 작가다. 고정된 세계·인물·장소·적을 재료로, 서로 확연히 다른 메인 이야기 기획안 3개를 쓴다.\n${SHARED_RULES}\n- 3개는 시작 도시(${STORY_CITIES.join('/')})·흑막·최종 보스·분위기가 서로 겹치지 않게 한다.\n- hook은 플레이어에게 보여 줄 도입 2~3문장. 흑막의 정체·반전은 절대 쓰지 않는다. 주인공이 겪는 첫 사건으로 시작한다.\n- premise는 GM만 보는 음모 요약 2문장(흑막의 동기와 수법).\n- title은 4~10자의 이야기 제목.\nJSON {"pitches":[{"title":string,"city":string,"villain":string,"finalBoss":string,"hook":string,"tone":string,"premise":string}]} 로만 답한다.`;
  const user = `${materialBlock()}${avoid.length ? `\n\n[이번엔 피할 제목]\n${avoid.join(', ')}` : ''}\n\n기획안 3개를 써라.`;
  const out = await ask<{ pitches?: Pitch[] }>(system, user, 1, 2500);
  const pitches = (out.pitches || []).map(p => ({ title: String(p.title || '').trim().slice(0, 30), city: String(p.city || '').trim(), villain: String(p.villain || '').trim(), finalBoss: String(p.finalBoss || '').trim(), hook: String(p.hook || '').trim().slice(0, 400), tone: String(p.tone || '').trim().slice(0, 60), premise: String(p.premise || '').trim().slice(0, 400) }))
    .filter(p => p.title && p.hook && STORY_CITIES.includes(p.city) && VILLAINS.includes(p.villain) && FINAL_BOSSES.includes(p.finalBoss) && !FIXED_MAIN_NAMES.includes(p.title));
  const seen = new Set<string>();
  const unique = pitches.filter(p => !seen.has(p.title) && !!seen.add(p.title));
  if (unique.length < 3) throw Error('이야기 기획안을 충분히 만들지 못했습니다. 다시 시도해 주세요.');
  return unique.slice(0, 3);
}

// ── 2. skeleton ──
async function makeSkeleton(pitch: Pitch, feedback: string[] = []): Promise<Skeleton> {
  const system = `너는 장기 CRPG의 메인 시나리오 설계자다. 고른 기획안을 4막짜리 메인 이야기의 뼈대로 설계한다. 이 뼈대를 받아 네 명의 작가가 각 막을 따로 쓰므로, 막마다 쓸 재료를 겹치지 않게 미리 나눠 준다.\n${SHARED_RULES}
- 흑막은 기획안의 흑막, 최종 보스는 기획안의 최종 보스로 고정한다. 최종 보스는 4막에만 나온다.
- 막마다 무대가 다르다. 1막은 시작 도시와 그 주변, 2~4막은 다른 도시나 도시 밖 장소로 넓혀 간다(돌아오는 것은 괜찮다).
- acts[i].places: 그 막의 핵심 장소 2~4개(장소 목록의 이름). 다른 막과 핵심 장소가 2개 이상 겹치지 않게 한다.
- acts[i].npcs: 그 막에서 주로 상대하는 NPC 1~3명. acts[i].foes: 그 막에서 싸우는 적 1~3종(적 목록 이름). acts[i].boss: 그 막의 마지막 전투 상대(적 목록 이름이나 결투할 NPC). 4막 boss는 최종 보스. 막 보스는 서로 달라야 한다. 위협이 막마다 커진다(1막 2~4, 2막 4~6, 3막 6~8).
- acts[i].summary: 그 막의 줄거리 2~4문장(250자 이내). 단서→행동→결과가 이어지고, 각 막에서 새로 알게 되는 사실이 다르다.
- acts[i].reveal: 그 막에서 드러나는 핵심 사실 한 줄. 흑막의 정체는 3막이나 4막에서 드러난다.
- requiredNpcs: 이야기에서 주인공이 직접 이야기를 나누는 NPC 전원(흑막 포함, 3~7명). factions: 그 NPC들의 세력과 사건에 필요한 세력 3~5개(세력 목록 이름).
- hook: 시작 계기 1~2문장(정체·반전 금지). opening: 프롤로그 직후 첫 심부름(쉬운 일: 어디 가기·누구 만나기·등록하기) 한 줄.
- villainPlot: 흑막의 동기·수법과 정체가 드러나는 발각 조건(2~3문장). bossNote: 최종 보스가 왜 4막에 나타나는지 1~2문장.
- goal: 최종 목표 한 문장. progressSteps: 막마다 하나씩 4개('1단계' 같은 접두어 없이 짧게).
- startItem: 프롤로그에서 주인공이 받는 이야기 물건이 있으면 {name,kind(weapon|armor|accessory|item),desc}, 없으면 null.
JSON {"name","city","villain","finalBoss","factions":[],"requiredNpcs":[],"hook","villainPlot","bossNote","goal","progressSteps":[],"opening","startItem","acts":[{"title","summary","places":[],"npcs":[],"foes":[],"boss","reveal"}]} 로만 답한다. acts는 정확히 4개.`;
  const user = `${materialBlock()}\n\n[고른 기획안]\n${JSON.stringify(pitch)}${feedback.length ? `\n\n[지난 설계의 문제 — 반드시 고칠 것]\n${feedback.map(f => `- ${f}`).join('\n')}` : ''}`;
  const s = await ask<Skeleton>(system, user, 0.8, 3500);
  return { ...s, name: pitch.title, city: pitch.city, villain: pitch.villain, finalBoss: pitch.finalBoss, acts: (s.acts || []).slice(0, 4), progressSteps: (s.progressSteps || []).map(x => String(x).replace(/^\d+\s*단계\s*/, '').trim()).slice(0, 4) };
}
function checkSkeleton(s: Skeleton): string[] {
  const out: string[] = [];
  if (s.acts.length !== 4) out.push('acts는 4개여야 한다');
  if (s.progressSteps.length !== 4) out.push('progressSteps는 4개여야 한다');
  for (const n of s.requiredNpcs || []) if (!CAST_NAMES.includes(n)) out.push(`없는 NPC: ${n}`);
  if (!(s.requiredNpcs || []).includes(s.villain)) out.push('requiredNpcs에 흑막이 없다');
  if ((s.requiredNpcs || []).length > 7) out.push('requiredNpcs는 7명 이하');
  for (const f of s.factions || []) if (!FACTIONS.includes(f)) out.push(`없는 세력: ${f}`);
  s.acts.forEach((a, i) => {
    for (const p of a.places || []) if (!isPlace(p)) out.push(`${i + 1}막 없는 장소: ${p}`);
    for (const f of a.foes || []) if (!isFoe(f)) out.push(`${i + 1}막 없는 적: ${f}`);
    if (i < 3 && (a.boss === s.finalBoss || FINAL_BOSSES.includes(a.boss))) out.push(`${i + 1}막 보스로 최종 보스를 썼다`);
    if (i < 3 && !isFoe(a.boss) && !CAST_NAMES.includes(a.boss)) out.push(`${i + 1}막 보스가 목록에 없다: ${a.boss}`);
  });
  if (s.acts[3] && s.acts[3].boss !== s.finalBoss) s.acts[3].boss = s.finalBoss;
  const bosses = s.acts.map(a => a.boss);
  if (new Set(bosses).size !== bosses.length) out.push('막 보스가 겹친다');
  return out;
}

// ── 3. acts and prologue ──
const BEAT_FORMAT = `beats는 게임 코드가 직접 판정하는 행동 목록이다. 종류:
- {"do":"talk","npc":NPC이름,"at":[장소],"then":그 NPC가 하는 말·행동}
- {"do":"defeat","foe":적 이름 또는 결투할 NPC 이름,"at":[장소],"then":이긴 뒤 벌어지는 일}
- {"do":"reach","at":[장소],"then":도착해서 보게 되는 것}
- {"do":"search","at":[장소],"then":그곳을 살펴 찾아낸 것}
- {"do":"choose","options":[선택지 2~3개],"then":어느 쪽을 골라도 이어지는 일}
at에는 장소 목록의 이름을 1~3개 쓴다(같은 곳의 다른 표기를 함께 써도 된다). then은 1~2문장, 120자 안팎, 다음 단계로 이어지는 단서나 지시를 담는다.
단계(step)는 {"q":퀘스트 이름(25자 안팎, 해야 할 일),"beats":[1~3개]}. 단계마다 하는 일이 달라야 한다(전투만 연달아 두지 않는다).`;
const FORMAT_EXAMPLE = `형식 예시(내용·소재는 따라 하지 말 것):
{"q":"회색 탑 폐허를 차지한 해골 병사 소탕하기","beats":[{"do":"defeat","foe":"해골 병사","at":["회색 탑 폐허"],"then":"해골 병사들이 무너져 내리고 폐허의 순찰로가 다시 열린다"},{"do":"search","at":["회색 탑 폐허"],"then":"폐허 벽에서 옛 기사들의 맹세문이 나온다"}]}`;
const stepCount = (i: number) => (i === 0 ? '3~4' : '4~5');
async function makeAct(s: Skeleton, i: number, feedback: string[] = [], others: string[] = []): Promise<ActOut> {
  const act = s.acts[i];
  const system = `너는 장기 CRPG의 메인 퀘스트 작가다. 설계된 뼈대 중 ${i + 1}막의 퀘스트 단계를 쓴다.\n${SHARED_RULES}\n${BEAT_FORMAT}\n${FORMAT_EXAMPLE}
- ${i + 1}막은 ${stepCount(i)}단계다. 이 막의 summary를 처음부터 끝까지 순서대로 플레이할 수 있게 쪼갠다.
- 이 막에 배정된 장소·NPC·적을 중심으로 쓴다. 다른 막에 배정된 핵심 장소·막 보스·사실은 쓰지 않는다.
- 마지막 단계에는 이 막의 보스(${act.boss})를 쓰러뜨리는 defeat가 있어야 한다.${i === 3 ? ` 마지막 단계는 최종 보스 ${s.finalBoss}와의 defeat 뒤 결말을 고르는 choose로 끝난다.` : ` 마지막 단계의 마지막 beat는 다음 막(${s.acts[i + 1]?.title})으로 넘어가는 계기를 then에 담는다.`}
- ${i === 0 ? `첫 단계는 프롤로그 직후의 첫 심부름("${s.opening}")이 끝난 다음부터 시작한다.` : `첫 단계는 ${i}막 마지막 장면("${s.acts[i - 1]?.reveal}")에서 자연스럽게 이어진다.`}
- 흑막(${s.villain})의 정체는 ${i < 2 ? '이 막에서 절대 드러내지 않는다. 흑막은 겉모습대로만 행동한다' : '뼈대의 reveal에 맞을 때만 드러낸다'}.
- 이 막에 choose 단계를 하나 넣어 플레이어가 중요한 결정을 하게 한다.${i === 3 ? '' : ''}
JSON {"steps":[{"q","beats":[]}]} 로만 답한다.`;
  const user = `${materialBlock()}\n\n[뼈대]\n${JSON.stringify({ ...s, acts: s.acts.map((a, k) => ({ act: k + 1, ...a })) })}\n\n[쓸 막] ${i + 1}막 ${act.title}${others.length ? `\n\n[다른 막에서 이미 쓴 단계 — 겹치지 말 것]\n${others.join('\n')}` : ''}${feedback.length ? `\n\n[지난 원고의 문제 — 반드시 고칠 것]\n${feedback.map(f => `- ${f}`).join('\n')}` : ''}`;
  const out = await ask<ActOut>(system, user, 0.7, 4000);
  return { steps: normalizeSteps(out.steps || []) };
}
async function makePrologue(s: Skeleton, feedback: string[] = []): Promise<PrologueOut> {
  const system = `너는 장기 CRPG의 도입부 작가다. 뼈대를 보고 게임 첫 화면의 프롤로그와 첫 심부름을 쓴다.\n${SHARED_RULES}\n${BEAT_FORMAT}
- text: 3문단(문단 사이 빈 줄), 600~900자. 1문단은 시작 도시(${s.city})의 풍경, 2문단은 시작 계기("${s.hook}"), 3문단은 지금 주인공 앞에 놓인 상황. 2인칭 '당신'. 흑막의 정체·뒤의 반전은 절대 쓰지 않는다.
- title: 장면 제목(예: "도시 이름, 무슨 날").
- firstQuest: 첫 심부름("${s.opening}")을 퀘스트 이름으로(25자 안팎). firstBeats: 그 심부름의 beats 2~3개(쉬운 일. 강한 적 없이, 싸움은 위협 1~2의 적까지만). ${s.city} 안의 장소에서 일어난다. 마지막 beat의 then은 1막 첫 일("${s.acts[0]?.summary}")로 이어진다.
- actions: 첫 장면에서 플레이어가 고를 행동 4개(각 1문장, 서로 다른 성향: 정면·대화·조사·과감).
JSON {"title","firstQuest","firstBeats":[],"text","actions":[]} 로만 답한다.`;
  const user = `${materialBlock()}\n\n[뼈대]\n${JSON.stringify(s)}${feedback.length ? `\n\n[지난 원고의 문제 — 반드시 고칠 것]\n${feedback.map(f => `- ${f}`).join('\n')}` : ''}`;
  const out = await ask<PrologueOut>(system, user, 0.8, 2500);
  return { title: String(out.title || s.name).slice(0, 40), firstQuest: String(out.firstQuest || s.opening).slice(0, 60), firstBeats: normalizeBeats(out.firstBeats || []), text: String(out.text || '').trim(), actions: (out.actions || []).map(String).slice(0, 4) };
}

// ── normalising and code checks ──
const squash = (s: string) => s.replace(/\s+/g, '');
const PLACE_SET = new Set(ALL_PLACES.map(squash));
const isPlace = (p: string) => PLACE_SET.has(squash(p));
const FOE_SET = new Set(FOES.map(f => f.name));
const isFoe = (f: string) => FOE_SET.has(f) || FINAL_BOSSES.includes(f);
function normalizeBeats(raw: unknown[]): Beat[] {
  const out: Beat[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    const at = Array.isArray(r.at) ? r.at.map(x => String(x).trim()).filter(Boolean).slice(0, 3) : [];
    const then = String(r.then || '').trim().slice(0, 300);
    if (r.do === 'talk') out.push({ do: 'talk', npc: String(r.npc || '').trim(), ...(at.length ? { at } : {}), then });
    else if (r.do === 'defeat') out.push({ do: 'defeat', foe: String(r.foe || '').trim(), ...(at.length ? { at } : {}), then });
    else if (r.do === 'reach' || r.do === 'search') out.push({ do: r.do, at, then });
    else if (r.do === 'choose') out.push({ do: 'choose', options: Array.isArray(r.options) ? r.options.map(x => String(x).trim()).filter(Boolean).slice(0, 3) : [], then });
  }
  return out;
}
function normalizeSteps(raw: unknown[]): MainStep[] {
  return (raw as Record<string, unknown>[]).filter(r => r && typeof r === 'object').map(r => ({ q: String(r.q || '').trim().slice(0, 60), beats: normalizeBeats(Array.isArray(r.beats) ? r.beats : []) }));
}
function checkBeats(beats: Beat[], where: string, s: Skeleton, act: number): string[] {
  const out: string[] = [];
  if (!beats.length || beats.length > 4) out.push(`${where}: beats는 1~3개`);
  for (const b of beats) {
    if (!b.then) out.push(`${where}: then이 비었다`);
    if ('at' in b && b.at) { const known = b.at.filter(isPlace); if (!known.length) out.push(`${where}: 장소 목록에 없는 at ${JSON.stringify(b.at)}`); else b.at = known; }
    if ((b.do === 'reach' || b.do === 'search') && !b.at?.length) out.push(`${where}: ${b.do}에는 at이 필요하다`);
    if (b.do === 'talk' && !CAST_NAMES.includes(b.npc)) out.push(`${where}: 없는 NPC와 대화 ${b.npc}`);
    if (b.do === 'defeat') {
      if (!isFoe(b.foe) && !CAST_NAMES.includes(b.foe)) out.push(`${where}: 적 목록에 없는 적 ${b.foe}`);
      if (FINAL_BOSSES.includes(b.foe) && (act !== 4 || b.foe !== s.finalBoss)) out.push(`${where}: 최종 보스 ${b.foe}는 4막 마지막에만 나온다`);
    }
    if (b.do === 'choose' && (b.options.length < 2 || b.options.length > 3)) out.push(`${where}: choose 선택지는 2~3개`);
  }
  return out;
}
const bigrams = (s: string) => { const t = squash(s).replace(/[^가-힣a-zA-Z0-9]/g, ''); const set = new Set<string>(); for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2)); return set; };
const similar = (a: string, b: string) => { const x = bigrams(a), y = bigrams(b); if (!x.size || !y.size) return 0; let n = 0; for (const g of x) if (y.has(g)) n++; return n / Math.min(x.size, y.size); };
export function checkStory(s: Skeleton, acts: ActOut[], pro: PrologueOut): Issue[] {
  const issues: Issue[] = [];
  if (pro.text.length < 300) issues.push({ act: 0, detail: '프롤로그 text가 너무 짧다' });
  if (pro.actions.length !== 4) issues.push({ act: 0, detail: 'actions는 4개' });
  for (const d of checkBeats(pro.firstBeats, '첫 심부름', s, 0)) issues.push({ act: 0, detail: d });
  for (const b of pro.firstBeats) if (b.do === 'defeat' && (FOES.find(f => f.name === b.foe)?.power || 9) > 2) issues.push({ act: 0, detail: `첫 심부름의 적 ${b.foe}가 너무 강하다(위협 2 이하)` });
  if (pro.text.includes(s.villain) && /흑막|배후|정체/.test(pro.text)) issues.push({ act: 0, detail: '프롤로그가 흑막을 드러낸다' });
  acts.forEach((a, k) => {
    const act = k + 1, [lo, hi] = k === 0 ? [3, 4] : [4, 5];
    if (a.steps.length < lo || a.steps.length > hi + 1) issues.push({ act, detail: `${act}막은 ${lo}~${hi}단계여야 한다(현재 ${a.steps.length})` });
    a.steps.forEach((st, j) => { if (!st.q) issues.push({ act, detail: `${j + 1}단계 q가 비었다` }); for (const d of checkBeats(st.beats, `${act}막 ${j + 1}단계`, s, act)) issues.push({ act, detail: d }); });
    const last = a.steps[a.steps.length - 1];
    if (last && !last.beats.some(b => b.do === 'defeat')) issues.push({ act, detail: `${act}막 마지막 단계에 막 보스 전투(defeat)가 없다` });
    if (act === 4 && last && !last.beats.some(b => b.do === 'defeat' && b.foe === s.finalBoss)) issues.push({ act, detail: `4막 마지막 단계에 최종 보스 ${s.finalBoss} 전투가 없다` });
    if (act < 3 && a.steps.some(st => st.beats.some(b => b.do === 'defeat' && b.foe === s.villain))) issues.push({ act, detail: `${act}막에서 흑막 ${s.villain}과 싸운다(정체가 너무 일찍 드러남)` });
  });
  // Repeats across acts: the same step, the same act boss, a foe in three acts, the same scene told twice.
  const steps = acts.flatMap((a, k) => a.steps.map(st => ({ act: k + 1, st })));
  for (let x = 0; x < steps.length; x++) for (let y = x + 1; y < steps.length; y++) {
    const A = steps[x], B = steps[y]; if (A.act === B.act) continue;
    if (similar(A.st.q, B.st.q) > 0.7) issues.push({ act: B.act, detail: `${A.act}막 "${A.st.q}"와 ${B.act}막 "${B.st.q}"가 같은 일을 반복한다` });
    for (const ba of A.st.beats) for (const bb of B.st.beats) if (ba.then && bb.then && similar(ba.then, bb.then) > 0.6) issues.push({ act: B.act, detail: `${B.act}막 "${bb.then.slice(0, 40)}…" 장면이 ${A.act}막 장면과 거의 같다` });
  }
  const finalFoe = (a: ActOut) => [...(a.steps[a.steps.length - 1]?.beats || [])].reverse().find(b => b.do === 'defeat') as Extract<Beat, { do: 'defeat' }> | undefined;
  acts.forEach((a, k) => { const f = finalFoe(a); if (!f) return; for (let j = 0; j < k; j++) if (finalFoe(acts[j])?.foe === f.foe) issues.push({ act: k + 1, detail: `${k + 1}막 보스 ${f.foe}가 ${j + 1}막 보스와 같다` }); });
  const foeActs = new Map<string, Set<number>>();
  acts.forEach((a, k) => a.steps.forEach(st => st.beats.forEach(b => { if (b.do === 'defeat') (foeActs.get(b.foe) || foeActs.set(b.foe, new Set()).get(b.foe)!).add(k + 1); })));
  for (const [foe, set] of foeActs) if (set.size >= 3) issues.push({ act: Math.max(...set), detail: `${foe}와의 전투가 ${[...set].join('·')}막에 반복된다` });
  // Every NPC the story talks to must be in the GM's cast list.
  const talked = new Set([...pro.firstBeats, ...acts.flatMap(a => a.steps.flatMap(st => st.beats))].flatMap(b => b.do === 'talk' ? [b.npc] : []));
  for (const n of talked) if (CAST_NAMES.includes(n) && !s.requiredNpcs.includes(n)) s.requiredNpcs.push(n);
  if (s.requiredNpcs.length > 8) issues.push({ act: 0, detail: `대화 상대 NPC가 너무 많다(${s.requiredNpcs.length}명, 8명 이하)` });
  return issues;
}

// The AI reads the whole story for what code cannot see: repeated plots, broken cause and effect, early reveals.
async function reviewStory(s: Skeleton, acts: ActOut[], pro: PrologueOut): Promise<Issue[]> {
  const system = `너는 장기 CRPG 메인 시나리오의 검수자다. 네 막을 서로 다른 작가가 따로 썼으므로 막끼리 겹치거나 어긋난 곳을 찾는다. 실제 원고 문장만 근거로 판단한다.
검사: (1) 다른 막에서 같은 사건·같은 단서·같은 장면 구조(예: 두 막 모두 '밤에 습격당함')가 되풀이됨 (2) 앞 막에서 이미 알게 된 사실을 다시 처음 알게 됨, 이미 만난 인물을 처음 만나는 것처럼 씀 (3) 단계 사이 인과가 끊김(갑자기 다른 곳으로 가거나 이유 없이 결론이 남) (4) 흑막 ${s.villain}의 정체가 뼈대의 reveal보다 일찍 드러남 (5) NPC의 소속·성격·비밀과 어긋나는 행동 (6) 고정 서브 소재와 플롯이 겹침.
문제마다 어느 막을 고쳐야 하는지 act(0=프롤로그, 1~4=막)를 정하고, 고칠 방법을 detail에 구체적으로 쓴다. 사소한 문체 문제는 쓰지 않는다. 문제가 없으면 빈 배열.
JSON {"issues":[{"act":number,"severity":"critical"|"major"|"minor","detail":string}]} 로만 답한다.`;
  const story = { 뼈대: s, 프롤로그: pro, 막: acts.map((a, k) => ({ 막: k + 1, 단계: a.steps })) };
  const out = await ask<{ issues?: { act?: number; severity?: string; detail?: string }[] }>(system, `[고정 서브 소재]\n${SIDE_MATERIAL.join('\n')}\n\n[원고]\n${JSON.stringify(story)}`, 0, 2000);
  return (out.issues || []).filter(x => x && x.severity !== 'minor' && typeof x.act === 'number' && x.act >= 0 && x.act <= 4 && x.detail).slice(0, 12).map(x => ({ act: x.act!, detail: String(x.detail).slice(0, 300) }));
}

// ── assembling ──
const actLine = (a: ActPlan, i: number) => `- ${i + 1}막 ${a.title}: ${a.summary.replace(/\s+/g, ' ').trim()}`;
export function storyText(s: Skeleton) {
  const flag = `대사건:${s.name}-결과`;
  return [
    `필요 세력: ${s.factions.join(', ')}`,
    `필수 NPC: ${s.requiredNpcs.join(', ')}`,
    `시작 계기: ${s.hook}`,
    ...s.acts.map((a, i) => actLine(a, i) + (i === 3 ? ` 결과는 '${flag}'.` : '')),
    `흑막: [GM] ${s.villain}. ${s.villainPlot}`,
    `최종 보스: [GM] ${s.finalBoss}. ${s.bossNote} 4막에서만 등장한다.`,
    `최종 목표(최종 목표형): ${s.goal.replace(/[.。]$/, '')}('${flag}').`,
    `최종 목표(진행도형): ${s.progressSteps.map((p, i) => `${i + 1}단계 ${p}`).join(' → ')}`,
  ].join('\n');
}
function assemble(s: Skeleton, acts: ActOut[], pro: PrologueOut): GeneratedStory {
  const questChain: MainStep[] = acts.flatMap((a, k) => a.steps.map((st, j) => (j === a.steps.length - 1 ? { ...st, act: (k + 1) as 1 | 2 | 3 | 4 } : st)));
  const prologue: MainPrologue = {
    title: pro.title, city: s.city, startPlaces: [s.city], firstQuest: pro.firstQuest, firstBeats: pro.firstBeats,
    ...(s.startItem?.name ? { startItems: [{ name: s.startItem.name.slice(0, 30), kind: (['weapon', 'armor', 'accessory', 'item'].includes(s.startItem.kind) ? s.startItem.kind : 'item'), grade: 1 as const, desc: String(s.startItem.desc || '').slice(0, 120) }] } : {}),
    questChain, text: pro.text, actions: [pro.actions[0] || '', pro.actions[1] || '', pro.actions[2] || '', pro.actions[3] || ''],
  };
  return { name: s.name, city: s.city, text: storyText(s), progressSteps: s.progressSteps, prologue, createdAt: Date.now() };
}

// ── the whole build ──
export async function buildStory(pitch: Pitch, log: (m: string) => void = () => {}): Promise<{ story: GeneratedStory; remaining: Issue[]; rounds: number }> {
  let s = await makeSkeleton(pitch);
  let problems = checkSkeleton(s);
  if (problems.length) { log(`뼈대 재설계: ${problems.join(' / ')}`); s = await makeSkeleton(pitch, problems); problems = checkSkeleton(s); }
  if (problems.length) throw Error(`이야기 뼈대 검증 실패: ${problems.slice(0, 3).join(' / ')}`);
  let [pro, ...acts] = await Promise.all([makePrologue(s), ...s.acts.map((_, i) => makeAct(s, i))]);
  let issues: Issue[] = [];
  let rounds = 0;
  for (; rounds <= 2; rounds++) {
    issues = checkStory(s, acts, pro);
    if (!issues.length) issues = await reviewStory(s, acts, pro).catch(() => []);
    if (!issues.length || rounds === 2) break;
    log(`수정 ${rounds + 1}회차: ${issues.map(i => `${i.act}막 ${i.detail}`).join(' / ')}`);
    const byAct = new Map<number, string[]>();
    for (const i of issues) (byAct.get(i.act) || byAct.set(i.act, []).get(i.act)!).push(i.detail);
    const others = (k: number) => acts.flatMap((a, j) => (j === k ? [] : a.steps.map(st => `${j + 1}막: ${st.q}`)));
    const redo = await Promise.all([...byAct].map(async ([act, fb]) => [act, act === 0 ? await makePrologue(s, fb) : await makeAct(s, act - 1, fb, others(act - 1))] as const));
    for (const [act, out] of redo) { if (act === 0) pro = out as PrologueOut; else acts[act - 1] = out as ActOut; }
  }
  // Code-level problems that remain make the story unplayable; AI review leftovers are reported but tolerated.
  const hard = checkStory(s, acts, pro);
  if (hard.length) throw Error(`이야기 검증 실패: ${hard.slice(0, 3).map(i => i.detail).join(' / ')}`);
  return { story: assemble(s, acts, pro), remaining: issues, rounds };
}
