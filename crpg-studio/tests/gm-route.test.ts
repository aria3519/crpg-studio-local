// Runs the GM route (app/api/gm/route.ts) with fetch faked, so no AI is called and it costs nothing.
// Every request the route would send (prompts included) and every answer it gives back are compared with the
// saved copy in tests/fixtures/gm-route.expected.json; `npm run test:update` accepts the current output as the new baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { POST } from '../app/api/gm/route';

const root = path.join(__dirname, '..', '..');
const expectedFile = path.join(root, 'tests', 'fixtures', 'gm-route.expected.json');
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = 'production'; // no dev logs into .next
env.OPENAI_API_KEY = 'test';
process.chdir(root); // NPC sheets are read from app/api/gm/_data

// What the bookkeeping model answers in every case: enough fields that the route's checks all have work to do.
const LUNA = {
  text: '【그림우드 · 낮】\n\n넬이 수레 자국 곁에 쭈그려 앉습니다. "여기 봐요."', choices: ['수레 자국을 따라간다', '넬에게 묻는다', '마을로 돌아간다', '은화 3닢을 내고 짐마차를 탄다'],
  presentNpcs: ['넬', '이름없는 상인'], check: { ability: 'str', dc: 13, label: '바위를 민다', reason: '길을 막은 바위', success: '길이 열린다', failure: '시간이 흐른다' },
  addQuests: [{ title: '장물 행방 찾기', giver: '에드리아 하르트' }, { title: '엉뚱한 일', giver: '모르는 사람' }], completedQuests: ['입단 시험'], failedQuests: [],
  relationshipUpdates: [{ name: '넬', delta: 5, reason: '갑옷을 줌' }], goldDelta: 30, reputationDelta: 2, xpGain: 'deed', hpDelta: -3,
  addItems: ['거친 삼실'], removeItems: [], addFlags: ['단서:그림우드-삼실'], trained: ['str'], moveToPinId: 'p2', imageKey: 'forest',
  npcVoices: [{ name: '이름없는 상인', style: '어체: 해요체' }], ambush: '', enemy: { power: 3 }, howKnown: '', knownItem: '',
};
const state = {
  locationName: '그림우드', currentMapId: 'm1', safePlace: false, gold: 12, hp: 20, maxHp: 24, level: 3, xp: 40, reputation: 5, reputationRank: '무명',
  inventory: ['잿빛 갈매기 인장 반지', '은 반지', '투박한 가죽 갑옷'], equipped: { body: '투박한 가죽 갑옷' },
  quests: [{ title: '입단 시험', giver: '에드리아 하르트' }], currentGoal: '그림우드의 늑대를 처리한다', goalPath: '에드리아 → 그림우드 늑대 → 보고',
  characterValues: { str: 14, dex: 12, int: 10, 신분: '떠돌이' }, trainableStats: [{ id: 'str', name: '근력' }, { id: 'dex', name: '민첩' }],
  npcProfiles: [{ name: '넬', inScene: true, profile: '사냥꾼 소녀' }, { name: '에드리아 하르트', inScene: false, profile: '기사단장' }, { name: '이름없는 상인', inScene: true, profile: '행상' }],
  knownNpcs: ['넬', '에드리아 하르트'], cast: ['[GM] 에드리아 하르트(기사단장)'], reservedNpcs: [], party: [], relationships: [{ name: '넬', affection: 25 }],
  locations: [{ id: 'p1', name: '그림우드' }, { id: 'p2', name: '이끼골' }, { id: 'p3', name: '사레타' }], adjacentLocationIds: ['p2'], adjacentLocations: [{ id: 'p2', name: '이끼골' }],
  availableImages: ['forest', 'town'], monsters: [{ name: '회색 늑대', level: 2 }], flags: ['막:1', '현재위치:그림우드', '단서:숲-발자국'],
  storyPlan: '늑대 무리 뒤에 밀수꾼이 있다', directorNotes: ['넬은 밀수꾼을 안다'], placeSeed: '안개 낀 숲길',
};
const base = { genre: 'fantasy', prompt: '중세 판타지 왕국 변경', history: ['GM: 【그림우드】 숲에 들어섭니다.', '넬: "이번엔 네가 이겼어."'], memory: '주인공은 입단 시험 중이다.', keyFacts: ['넬은 사냥꾼'], hero: '떠돌이 검사. 북쪽에서 왔다.', state };
const CASES: Record<string, Record<string, unknown>> = {
  'scene write': { ...base, action: '수레 자국을 살핀다', phase: 'write' },
  'scene fill choices': { ...base, action: '수레 자국을 살핀다', sceneText: '【그림우드 · 낮】\n\n넬이 흙을 쓸어 냅니다. "이번엔 네가 이겼어."\n---\n1. 나는 자국을 따라간다\n2. 넬에게 묻는다\n3. 이끼골로 간다' },
  'scene fill check': { ...base, action: '바위를 민다', sceneText: '바위가 길을 막고 있습니다.\n---\n[판정: 근력 | 어려움 15 | 바위를 밀어 길 열기; 실패하면 늑대가 다가온다 | 성공하면 길이 열린다]' },
  'scene fill talk': { ...base, action: '넬을 부른다', sceneText: '넬이 돌아봅니다.\n---\n[대화: 넬]' },
  'scene fill travel': { ...base, action: '이끼골로 간다', sceneText: '당신은 길을 나섭니다.\n---\n[이동: 이끼골]' },
  'scene fill dice': { ...base, action: '바위를 민다', diceResult: { roll: 17, dc: 15, success: true }, sceneText: '바위가 굴러갑니다.\n---\n1. 앞으로 간다' },
  'talk write': { ...base, action: '"뭘 찾았어?"', mode: 'talk', npc: '넬', talkTurns: 1, phase: 'write', withThisNpc: ['넬: "여기 봐요."'] },
  'talk fill': { ...base, action: '"뭘 찾았어?"', mode: 'talk', npc: '넬', talkTurns: 1, sceneText: '(삼실을 들어 보이며) 넬: "이거요. (은 반지를 들다) 밀수꾼 거예요."\n---\n1. "어디로 갔지?"\n2. "얼마면 알려 줄래?"\n3. "난 빠질게."' },
  'talk end': { ...base, action: '"고마워."', mode: 'talk', npc: '넬', talkTurns: 3, closeTalk: true, sceneText: '넬: "그럼 가 봐요."\n---\n[대화 끝]\n1. 이끼골로 간다\n2. 마을로 돌아간다' },
  'combat': { ...base, action: '검을 휘두른다', mode: 'combat', npc: '회색 늑대', combat: { round: 2, itemUse: '' } },
  'reroll': { ...base, action: '수레 자국을 살핀다', reroll: true, previousChoices: ['자국을 따라간다'] },
  'debug': { ...base, action: '늑대를 소환', debug: true },
  'new voice': { ...base, action: '상인에게 다가간다', state: { ...state, npcProfiles: [...state.npcProfiles, { name: '새 얼굴', inScene: true, profile: '수상한 사내' }] } },
};

type Sent = { url: string; tag: string | null; body: unknown };
async function run(body: Record<string, unknown>) {
  const sent: Sent[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const req = JSON.parse(String(init.body));
    sent.push({ url, tag: (init.headers as Record<string, string>)['x-usage-tag'] || null, body: req });
    if (req.stream) {
      const sse = ['넬이 ', '고개를 듭니다.'].map(d => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n`).join('') + 'data: [DONE]\n';
      return new Response(sse);
    }
    const content = JSON.stringify(sent.length && (init.headers as Record<string, string>)['x-usage-tag'] === 'voices' ? { voices: [{ name: '새 얼굴', style: '어체: 해체' }] } : LUNA);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const res = await POST(new Request('http://local/api/gm', { method: 'POST', body: JSON.stringify(body) }));
  const text = await res.text();
  let answer: unknown = text; try { answer = JSON.parse(text); } catch { /* streamed prose */ }
  return { sent, status: res.status, answer };
}

test('GM route sends the same prompts and gives the same answers', async () => {
  const got: Record<string, unknown> = {};
  for (const [name, body] of Object.entries(CASES)) got[name] = JSON.parse(JSON.stringify(await run(body)));
  if (process.env.UPDATE_TURNS || !existsSync(expectedFile)) { writeFileSync(expectedFile, JSON.stringify(got, null, 1) + '\n'); return; }
  const want = JSON.parse(readFileSync(expectedFile, 'utf8'));
  for (const name of Object.keys(CASES)) assert.deepEqual(got[name], want[name], name);
});
