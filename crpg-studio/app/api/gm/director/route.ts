import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 90;

// The story manager (Terra, OPENAI_GM_MAJOR_MODEL; the user keeps Terra for writing and managing only): reads the latest scenes against the long-term memory and key facts while the player reads,
// checks them for consistency and fairness, and keeps the people, side stories, places and the world's pending answers.
// It does not steer: what happens next is the writer's call alone, as in a Crack chat (direction/beats/focus pulled against it).
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY 환경변수가 없습니다.' }, { status: 500 });
  try {
    const body = await request.json();
    const strings = (v: unknown, n: number, len: number) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n).map(x => x.slice(0, len)) : [];
    const recent = strings(body.recent, 40, 1500);
    if (!recent.length) return NextResponse.json({ fixes: [] });
    const location = String(body.location || '').slice(0, 60), nearby = strings(body.nearby, 8, 60);
    const cast = strings(body.cast, 45, 260), newPeople = strings(body.newPeople, 8, 40), threads = strings(body.threads, 6, 160);
    const seeds: Record<string, string> = body.seeds && typeof body.seeds === 'object' ? Object.fromEntries(Object.entries(body.seeds as Record<string, unknown>).filter(([, v]) => typeof v === 'string').slice(0, 9).map(([k, v]) => [k.slice(0, 60), String(v).slice(0, 400)])) : {};
    const unseeded = strings(body.unseeded, 9, 60);
    const placeStories: Record<string, string[]> = body.placeStories && typeof body.placeStories === 'object' ? Object.fromEntries(Object.entries(body.placeStories as Record<string, unknown>).slice(0, 9).map(([k, v]) => [k.slice(0, 60), strings(v, 4, 300)])) : {};
    const reserved = strings(body.reserved, 30, 40), consequences = strings(body.consequences, 6, 200), quests = strings(body.quests, 10, 300);
    const world = String(body.world || '').slice(0, 7000), hero = String(body.hero || '').slice(0, 500), prologue = String(body.prologue || '').slice(0, 2000), story = String(body.story || '').slice(0, 1500);
    const system = [
      '당신은 한국어 CRPG의 기록 담당입니다. 장면을 직접 쓰지 않고, 다음에 무엇이 일어날지도 정하지 않습니다. 지금까지 일어난 일을 정리하고 점검해 장면을 쓰는 GM에게 넘깁니다.',
      '플레이어는 메인 이야기 밖에서도 자유롭게 움직이고, 장면을 쓰는 GM은 그 자리에서 인물과 곁가지 사건을 지어냅니다. 당신은 그렇게 생긴 것들이 앞뒤가 맞고 잊히지 않게 지킵니다.',
      'consequences: 플레이어가 한 일 중 세상이 아직 반응하지 않은 것과 그 반응입니다. 이전 목록(consequences)에서 recentScenes에 이미 일어난 것은 빼고, recentScenes에서 플레이어가 새로 한 일(누군가를 돕거나 속이거나 해친 일, 소란, 약속, 훔친 물건, 미룬 일, 눈에 띈 능력)의 결과를 더해 최대 4개로 다시 씁니다. 항목마다 "무엇을 했나 → 누가·어떻게 찾아오나" 한 줄(150자 이내)이고, 반응은 구체적인 사람·소식·대가로 씁니다(예: 경비대 앞에서 칼을 뽑았다 → 경비대장 레아가 여관으로 찾아와 해명을 요구한다). 장소를 옮겨도 찾아올 수 있는 일이어야 합니다. 먼저 일어날 일을 앞에 두세요.',
      'goals: recentScenes에서 이야기 스스로 플레이어에게 생긴 개인 목표입니다(예: 징계 위원회를 피하기, 도둑맞은 지갑 되찾기, 레아의 의심 풀기). quests에 이미 있는 일과 메인·지역 퀘스트는 빼고, 분명히 생긴 것만 0~2개, 각 40자 이내의 할 일 문장입니다.',
      'cards: newPeople(이번에 처음 생긴 인물)마다 그 인물의 설정 한 줄을 씁니다: 역할·직업, 사는 곳이나 주로 있는 곳, 나이대와 겉모습, 성격과 말투, 원하는 것, 플레이어와의 관계. recentScenes에 나온 것만 근거로 쓰고 200자 이내입니다. {"이름":"설정"} 객체입니다.',
      'threads: 아직 끝나지 않은 곁가지 이야기 목록입니다(메인 퀘스트는 제외). 이전 목록(threads)에서 끝난 것은 빼고, recentScenes에서 새로 생긴 부탁·약속·수상한 일·풀리지 않은 갈등을 더해 최대 5개로 다시 씁니다. 항목마다 "누구/어디 — 무슨 일, 지금 어디까지" 한 줄(120자 이내)입니다.',
      'places: 장소마다 "그곳에서 지금 벌어지고 있는 일"을 미리 짜 둡니다. 장면을 쓰는 GM은 플레이어가 그곳에 가거나 그곳에서 무엇을 하든 이 설정에서 인물과 사건을 꺼내 씁니다. unseeded의 장소는 새로 쓰고, location은 recentScenes에서 이미 일어난 일을 반영해 지금 상태로 고쳐 씁니다(seeds에 있는 다른 장소는 쓰지 마세요). 새 이야기를 억지로 만들지 마세요. placeStories에 그 장소의 이야기(지역 이야기·게시판 의뢰·진행 중인 일)가 있으면 그것으로 씁니다: 의뢰인이 그곳에서 무엇을 하고 있는지, 그 일의 낌새가 지금 어떻게 보이는지(hook 직전의 분위기)만 쓰고 결과는 앞당기지 마세요. 그 장소에 이야기가 없을 때만 그곳의 일상을 실감 나게 씁니다: world(세계관·세력·인물·지금까지의 줄거리)와 장소 이름에서 그곳이 어떤 곳인지 읽어 내 그 장소다운 사람과 일(교단 성역이면 순례자와 광신도, 묘지면 묘지기와 도굴꾼, 항구면 선원과 밀수)을 쓰고, 걸린 것이 있는 일 하나(목숨·돈·명예·비밀)와 그냥 두면 곧 벌어질 일을 담으세요. 인물은 world의 인물 목록과 cast에서 그 장소에 어울리는 사람을 먼저 쓰고, 맞는 사람이 없을 때만 새 인물 한 명(세계관에 맞는 이름의 여성)을 둡니다. reserved의 인물은 메인 이야기에서 나중에 처음 등장하니 places·hooks·direction 어디에도 등장시키거나 언급하지 말고, 그런 역할(대신관, 기사단장 등)이 필요하면 새 인물로 채우세요. 장소마다 300자 이내, memory·keyFacts·cast·seeds와 어긋나면 안 되고, 흑막의 정체와 결말은 쓰지 마세요.',
      'fixes: recentScenes가 memory·keyFacts·cast(인물들의 설정)·앞선 장면과 어긋난 점. 죽거나 떠난 인물이 다시 나옴, 이미 끝난 일을 다시 함, 이름·관계·장소·소지품이 바뀜, 인물 말투가 바뀜 같은 것입니다. 어긋남마다 "무엇이 맞는지"를 한 줄로 쓰세요. recentScenes의 대가와 보상(시스템 줄의 HP·골드·명성·획득·호감도 포함)이 플레이어의 행동과 위험에 맞지 않은 것도 여기에 씁니다: 예고 없이 큰 벌을 받음, 별 노력 없이 큰 보상을 받음, 같은 행동의 결과가 앞과 다름. 이런 것은 "무엇이 어긋났고 다음 장면에서 어떻게 맞출지"를 한 줄로 씁니다. 없으면 빈 배열입니다.',
      'story: 이 이야기의 설계도입니다. 장면을 쓰는 GM이 매 장면 이것을 뼈대로 씁니다. 입력 story가 비어 있으면 새로 씁니다. 있으면 recentScenes에서 플레이어가 내린 결정을 따라 고쳐 씁니다: 이야기는 미리 정한 길이 아니라 플레이어의 결정으로 만들어집니다. 결정이 누군가와의 관계, 주인공의 목표나 편을 바꿨으면 핵심 인물까지 그 결정에 맞게 새로 짜고, 그렇지 않으면 그대로 둡니다. 담을 것: (1) 주인공이 원하는 것과 짊어진 것(prologue·hero·world에서), (2) 주인공과 얽힐 핵심 인물 3~4명: cast에서 고르고(reserved 제외), 각자 원하는 것, 숨기는 것, 주인공에게서 얻으려는 것. 앞으로 일어날 일은 쓰지 않습니다(장면을 쓰는 GM이 정합니다). 1,000자 이내.',
      'act: world의 메인 사건에서 recentScenes까지의 이야기가 지금 있는 막의 번호(입력 act가 지금까지의 번호)입니다. 그 막의 일이 이야기 속에서 실제로 매듭지어졌을 때 다음 번호를 씁니다.',
      'fixes·cards·threads는 기록에 근거한 것만 쓰고(places·story는 새로 짓습니다), fixes는 각 항목 150자 이내, 최대 3개입니다.',
      '다음 JSON 객체만 반환하세요: {"fixes":[""],"cards":{"이름":""},"threads":[""],"places":{"장소":""},"consequences":[""],"goals":[""],"story":"","act":1}',
    ].join('\n\n');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_GM_MAJOR_MODEL || process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ memory: String(body.memory || '').slice(0, 9000), keyFacts: strings(body.keyFacts, 100, 200), quests, location, nearby, world, act: Number(body.act) || 1, hero, prologue, story, reserved, consequences, cast, newPeople, threads, seeds, unseeded, placeStories, recentScenes: recent }) },
        ],
      }),
      cache: 'no-store', signal: AbortSignal.timeout(85000),
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result?.error?.message || 'AI API 호출에 실패했습니다.' }, { status: 502 });
    const parsed = JSON.parse(result?.choices?.[0]?.message?.content || '{}');
    const notes = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 200)).slice(0, 3) : [];
    // Cards only for the people asked about; threads replace the old list (finished ones dropped), so a missing list keeps nothing new.
    const cards = parsed?.cards && typeof parsed.cards === 'object' ? Object.fromEntries(newPeople.filter(n => typeof parsed.cards[n] === 'string' && parsed.cards[n].trim()).map(n => [n, String(parsed.cards[n]).trim().slice(0, 200)])) : {};
    const openThreads = Array.isArray(parsed?.threads) ? parsed.threads.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim()).map((x: string) => x.trim().slice(0, 160)).slice(0, 5) : threads;
    const allowed = [location, ...unseeded].filter(Boolean);
    const places = parsed?.places && typeof parsed.places === 'object' ? Object.fromEntries(allowed.filter(n => typeof parsed.places[n] === 'string' && parsed.places[n].trim()).map(n => [n, String(parsed.places[n]).trim().slice(0, 400)])) : {};
    const lines = (v: unknown, n: number, len: number) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, len)).slice(0, n) : undefined;
    const goals = (lines(parsed?.goals, 2, 60) || []).filter(g => !reserved.some(n => g.includes(n)));
    return NextResponse.json({ story: typeof parsed?.story === 'string' && parsed.story.trim() ? parsed.story.trim().slice(0, 1500) : story, act: Number(parsed?.act) || Number(body.act) || 1, fixes: notes(parsed?.fixes), cards, threads: openThreads, places,
      consequences: lines(parsed?.consequences, 4, 200) ?? consequences, goals });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '이야기 감독 서버 오류' }, { status: 500 });
  }
}
