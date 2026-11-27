import { aiAllowed, LIMIT_REPLY, logError } from '../../../_lib/beta';
import { alignEngineRules } from '../../../_lib/engine-rules';
import { NextResponse } from 'next/server';
import { FOREIGN_SCRIPT } from '../_lib/speech';

export const runtime = 'nodejs';
export const maxDuration = 90;

// The story manager (Terra, OPENAI_GM_MAJOR_MODEL; the user keeps Terra for writing and managing only): reads the latest scenes against the long-term memory and key facts while the player reads,
// checks them for consistency and fairness, and keeps the people, side stories, places and the world's pending answers.
// It does not steer (2026-11-17: the scheduled `next` developments were dropped): the story moves on the hero's choices and the named
// cast's answers to them; the director adds how people elsewhere react to the hero's big deeds (reactions → the 세상: log lines).
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY 환경변수가 없습니다.' }, { status: 500 });
  try {
    const body = await request.json();
    if (!aiAllowed(request)) return NextResponse.json(LIMIT_REPLY, { status: 429 });
    const strings = (v: unknown, n: number, len: number) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n).map(x => x.slice(0, len)) : [];
    const recent = strings(body.recent, 40, 1500);
    // Reactions come only from what happened since the last run: the 30-line window overlaps, so the same deed was reacted to two or three times (4차).
    const fresh = Array.isArray(body.fresh) ? strings(body.fresh, 40, 1500) : recent;
    if (!recent.length) return NextResponse.json({ fixes: [] });
    const location = String(body.location || '').slice(0, 60), nearby = strings(body.nearby, 8, 60);
    const cast = strings(body.cast, Infinity, 260), threads = strings(body.threads, 6, 160);
    // The cast's names ("에드리아 하르트(52·여) ..." → 에드리아 하르트): the only people a thread or a reaction may be about.
    const castNames = new Set(cast.map(c => c.replace(/^\[GM\]\s*/, '').split('(')[0].trim()).filter(Boolean));
    // A thread's "누구" is one of them (by full or first name, 에드리아 for 에드리아 하르트) or, with no one in it, a place of the map.
    const placeNames = new Set(strings(body.placeNames, Infinity, 60));
    const castPerson = (who: string) => [...castNames].some(n => n === who || n.split(' ')[0] === who);
    const aboutCast = (x: string) => { const who = x.split(/[/—]/)[0].trim(); return !castNames.size || castPerson(who) || placeNames.has(who); };
    const seeds: Record<string, string> = body.seeds && typeof body.seeds === 'object' ? Object.fromEntries(Object.entries(body.seeds as Record<string, unknown>).filter(([, v]) => typeof v === 'string').slice(0, 9).map(([k, v]) => [k.slice(0, 60), String(v).slice(0, 400)])) : {};
    const unseeded = strings(body.unseeded, 9, 60), reacted = strings(body.reacted, 6, 200), stories = strings(body.stories, 8, 300), steps = strings(body.steps, 12, 1200);
    const placeStories: Record<string, string[]> = body.placeStories && typeof body.placeStories === 'object' ? Object.fromEntries(Object.entries(body.placeStories as Record<string, unknown>).slice(0, 9).map(([k, v]) => [k.slice(0, 60), strings(v, 4, 300)])) : {};
    // The people fixed to each place (PLACE_NPCS): a place's sketch uses them and no one else, and a place without any gets none.
    const placePeople: Record<string, string[]> = body.placePeople && typeof body.placePeople === 'object' ? Object.fromEntries(Object.entries(body.placePeople as Record<string, unknown>).slice(0, 9).map(([k, v]) => [k.slice(0, 60), strings(v, 6, 40)])) : {};
    const spots: Record<string, string[]> = body.spots && typeof body.spots === 'object' ? Object.fromEntries(Object.entries(body.spots as Record<string, unknown>).slice(0, 9).map(([k, v]) => [k.slice(0, 60), strings(v, 6, 80)])) : {};
    // A place's guide (그림우드 → 넬) is always there, so that place's sketch must have them in it.
    const guides: Record<string, string> = body.guides && typeof body.guides === 'object' ? Object.fromEntries(Object.entries(body.guides as Record<string, unknown>).slice(0, 9).map(([k, v]) => [k.slice(0, 60), String(v || '').slice(0, 40)])) : {};
    const consequences = strings(body.consequences, 6, 200), quests = strings(body.quests, 10, 300);
    const finalFoe = body.finalFoe && typeof body.finalFoe === 'object' ? { name: String(body.finalFoe.name || '').slice(0, 40), place: String(body.finalFoe.place || '').slice(0, 40), desc: String(body.finalFoe.desc || '').slice(0, 200) } : null;
    const progress = body.progress && typeof body.progress === 'object' ? { percent: Number(body.progress.percent) || 0 } : null, ties = strings(body.ties, 20, 60);
    const world = alignEngineRules(String(body.world || '')).slice(0, 7000), hero = String(body.hero || '').slice(0, 500), prologue = String(body.prologue || '').slice(0, 2000), story = String(body.story || '').slice(0, 1500);
    const system = [
      '당신은 한국어 CRPG의 이야기 감독입니다. 장면을 직접 쓰지 않습니다. 지금까지 일어난 일을 정리하고 점검하며, 다음 장면들에서 벌어질 일을 준비해 장면을 쓰는 GM에게 넘깁니다.',
      '플레이어는 어디로든 자유롭게 움직이고, 이야기는 플레이어의 선택과 그에 대한 인물들의 반응으로 움직입니다. 이야기를 끌고 가는 사람은 cast의 이름 있는 인물들입니다. 당신은 그렇게 생긴 일들이 앞뒤가 맞고 잊히지 않게 지킵니다.',
      'finalFoe는 이 이야기 끝에서 주인공이 맞설 최종 적과 그 장소, progress는 이야기 진행도(percent)입니다. 이야기는 처음부터 그 적을 향해 갑니다: 진행도가 낮을 때는 소문·흔적·피해로, 중반에는 그 적과 손잡은 cast 인물과 그 적이 부리는 무리(몬스터)의 움직임으로, 끝에 가까울수록 정체와 거처가 드러납니다. finalFoe 자신은 진행도가 100이 되어 주인공이 그 장소에 갈 때 나옵니다. ties는 주인공과 얽힌 사람과 호감도(-100~100)입니다.',
      'reactions: newScenes(지난번 정리 뒤에 새로 벌어진 장면)에서 주인공이 한 큰일(판정의 성공이나 실패, 목표를 이룸, 강적을 쓰러뜨림, 소란, 누군가를 돕거나 배신함) 가운데 세상이 아직 반응하지 않은 것에, 그 자리에 없던 cast 인물이 소식을 듣고 보이는 반응 0~2개입니다. 항목은 {"who":"cast의 이름","text":"그 사람이 지금 어디서 무엇을 하다 그 소식에 어떻게 반응하는지, 한마디 말을 넣어도 됩니다(120자 이내)","affection":그 사람의 주인공에 대한 호감 변화 -10~10}입니다. reacted는 이미 나온 반응이니 같은 일에 다시 반응하지 않습니다. 큰일이 없으면 빈 배열입니다.',
      'consequences: 플레이어가 한 일 중 세상이 아직 반응하지 않은 것과 그 반응입니다. 이전 목록(consequences)에서 recentScenes에 이미 일어난 것은 빼고, recentScenes에서 플레이어가 새로 한 일(누군가를 돕거나 속이거나 해친 일, 소란, 약속, 훔친 물건, 미룬 일, 눈에 띈 능력)의 결과를 더해 최대 4개로 다시 씁니다. 항목마다 "무엇을 했나 → 누가·어떻게 찾아오나" 한 줄(150자 이내)이고, 반응은 구체적인 사람·소식·대가로 씁니다(예: 경비대 앞에서 칼을 뽑았다 → 경비대장 레아가 여관으로 찾아와 해명을 요구한다). 장소를 옮겨도 찾아올 수 있는 일이어야 합니다. 먼저 일어날 일을 앞에 두세요.',
      'goals: recentScenes에서 주인공 앞에 새로 생긴, 주인공이 쫓게 될 일입니다. 지금 쫓는 일은 quests에, 주인공이 지금 하고 있는 일(마지막 대화에서 정한 것)은 task에 있습니다. 40자 이내의 문장으로 쓰고, 없으면 빈 배열입니다. stories는 주인공이 만난 인물들의 준비된 개인 이야기("맡기는 사람 — 제목: 줄거리")입니다. 새로 생긴 일이 그중 하나라면(그 사람이 쫓는 일, 그 사람의 사정) 그 제목을 글자 그대로 씁니다: 그 이야기에는 답과 단계가 이미 준비되어 있습니다.',
      'threads: 아직 끝나지 않은 곁가지 이야기 목록입니다. 이전 목록(threads)에서 끝난 것은 빼고, recentScenes에서 새로 생긴 부탁·약속·수상한 일·풀리지 않은 갈등을 더해 최대 5개로 다시 씁니다. 항목마다 "누구/어디 — 무슨 일, 지금 어디까지" 한 줄(120자 이내)이고, 누구는 cast의 이름입니다(사람이 걸리지 않은 일이면 장소 이름).',
      'places: placePeople는 장소마다 그곳에 사는 사람(이름) 목록이고, spots는 그중 그 장소 안의 한 곳에 있는 사람이 지금 있는 곳("이름: 장소")으로, 그 사람의 일은 그곳에서 벌어집니다. guides의 장소에는 그 사람이 늘 있으니 그 장소 설정에 꼭 들어갑니다. 장소마다 "그곳에서 지금 벌어지고 있는 일"을 그 목록의 사람들로만 짜 둡니다. 장면을 쓰는 GM은 플레이어가 그곳에 가면 이 설정의 인물과 사건만 꺼내 씁니다. unseeded의 장소는 새로 쓰고, location은 recentScenes에서 이미 일어난 일을 반영해 지금 상태로 고쳐 씁니다(seeds에 있는 다른 장소는 쓰지 마세요). 장소마다: 그 목록의 사람 각자가 지금 그곳에서 하고 있는 일, 원하는 것과 숨기는 것, 그 일에 걸린 것(목숨·돈·명예·비밀). placeStories에 그 장소의 지역 이야기·의뢰가 있으면 그 사람의 일로 쓰되 결과는 앞당기지 말고, 그 일이 왜 생겼는지까지 씁니다. world의 갈등과 finalFoe의 세력이 progress에 맞는 만큼 그 사람의 일에 닿아 있을 수 있고, ties·consequences·threads에서 주인공과 얽힌 일이 그 사람에게 남아 있으면 그것도 씁니다. 사건을 움직이는 사람은 그 목록의 이름뿐입니다. 장소마다 500자 이내, memory·keyFacts·cast·seeds와 어긋나면 안 되고, 흑막의 정체와 결말은 쓰지 마세요.',
      'arrive: places에 쓴 장소마다, 주인공이 그곳에 닿았을 때 그곳 사람의 일이 주인공 눈앞에 보이는 첫 모습 한 줄입니다("그 장소 목록의 이름 — 무엇을 하고 있는지", 150자 이내).',
      'fixes: recentScenes가 memory·keyFacts·cast(인물들의 설정)·앞선 장면과 어긋난 점. 죽거나 떠난 인물이 다시 나옴, 이미 끝난 일을 다시 함, 이름·관계·장소·소지품이 바뀜, 인물 말투가 바뀜 같은 것입니다. 어긋남마다 "무엇이 맞는지"를 한 줄로 쓰세요. recentScenes의 대가와 보상(시스템 줄의 HP·골드·명성·획득·호감도 포함)이 플레이어의 행동과 위험에 맞지 않은 것도 여기에 씁니다: 예고 없이 큰 벌을 받음, 별 노력 없이 큰 보상을 받음, 같은 행동의 결과가 앞과 다름. 이런 것은 "무엇이 어긋났고 다음 장면에서 어떻게 맞출지"를 한 줄로 씁니다. 없으면 빈 배열입니다.',
      'steps는 이 이야기에 준비된 단계와 게임이 센 진행 상황입니다: "끝남"은 이미 이룬 단계, "지금"은 주인공이 하고 있는 단계와 그 남은 일("어디서 무엇을 하면 → 벌어지는 일", "이미 일어남"은 벌어진 일), "앞으로"는 그다음 단계입니다. 지금 단계의 남은 일이 이야기의 다음 순서이고, 주인공이 벌인 다른 일(threads)은 그 순서와 엮어 이어 갑니다.',
      'story: 이 이야기의 설계도입니다. 장면을 쓰는 GM이 매 장면 이것을 뼈대로 씁니다. 입력 story가 비어 있으면 새로 씁니다. 있으면 recentScenes에서 플레이어가 내린 결정을 따라 고쳐 씁니다: 이야기는 미리 정한 길이 아니라 플레이어의 결정으로 만들어집니다. 결정이 누군가와의 관계, 주인공의 목표나 편을 바꿨으면 핵심 인물까지 그 결정에 맞게 새로 짜고, 그렇지 않으면 그대로 둡니다. 담을 것: (1) 주인공이 원하는 것과 짊어진 것(prologue·hero·world에서), (2) 주인공이 쫓는 것: finalFoe와 world의 흑막 중 지금까지 드러난 만큼, 그리고 주인공과 그 사이에 놓인 것, (3) 주인공과 얽힐 핵심 인물 3~4명: cast에서 고르고, 각자 원하는 것, 숨기는 것, 주인공에게서 얻으려는 것. 앞으로 일어날 일은 쓰지 않습니다(장면을 쓰는 GM이 정합니다). 1,000자 이내.',
      'fixes·threads는 기록에 근거한 것만 쓰고(places·story는 새로 짓습니다), fixes는 각 항목 150자 이내, 최대 3개입니다.',
      '다음 JSON 객체만 반환하세요: {"fixes":[""],"threads":[""],"places":{"장소":""},"arrive":{"장소":""},"consequences":[""],"goals":[""],"reactions":[{"who":"","text":"","affection":0}],"story":""}',
    ].join('\n\n');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_GM_MAJOR_MODEL || process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ memory: String(body.memory || '').slice(0, 9000), keyFacts: strings(body.keyFacts, 100, 200), quests, task: String(body.task || '').slice(0, 80), location, nearby, placePeople, spots, guides, world, hero, prologue, steps, story, finalFoe, progress, ties, reacted, stories, consequences, cast, threads, seeds, unseeded, placeStories, recentScenes: recent, newScenes: fresh }) },
        ],
      }),
      cache: 'no-store', signal: AbortSignal.timeout(85000),
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result?.error?.message || 'AI API 호출에 실패했습니다.' }, { status: 502 });
    const parsed = JSON.parse(result?.choices?.[0]?.message?.content || '{}');
    const notes = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 200)).slice(0, 3) : [];
    // Cards only for the people asked about; threads replace the old list (finished ones dropped), so a missing list keeps nothing new.
    const openThreads = Array.isArray(parsed?.threads) ? parsed.threads.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim() && aboutCast(x)).map((x: string) => x.trim().slice(0, 160)).slice(0, 5) : threads;
    // A name counts when it stands as a word ("한나" in "한나절" is not 한나).
    const named = (t: string) => [...cast.map(c => c.replace(/^\[GM\]\s*/, '').split(/[(:]/)[0].trim())].filter(n => n && new RegExp(`${n}(?=$|[^가-힣]|(?:이|가|은|는|을|를|의|에게|와|과|도|만|이나|랑|한테|께서|님)(?![가-힣]))`).test(t));
    const ownPeople = (place: string, t: string) => named(t).every(n => (placePeople[place] || []).includes(n));
    const hasGuide = (place: string, t: string) => !guides[place] || named(t).includes(guides[place]);
    const allowed = [location, ...unseeded].filter(n => n && placePeople[n]?.length);
    const places = parsed?.places && typeof parsed.places === 'object' ? Object.fromEntries(allowed.filter(n => typeof parsed.places[n] === 'string' && parsed.places[n].trim() && ownPeople(n, parsed.places[n]) && hasGuide(n, parsed.places[n])).map(n => [n, String(parsed.places[n]).trim().slice(0, 600)])) : {};
    const arrive = parsed?.arrive && typeof parsed.arrive === 'object' ? Object.fromEntries(allowed.filter(n => typeof parsed.arrive[n] === 'string' && parsed.arrive[n].trim() && ownPeople(n, parsed.arrive[n])).map(n => [n, String(parsed.arrive[n]).trim().slice(0, 200)])) : {};
    const lines = (v: unknown, n: number, len: number) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, len)).slice(0, n) : undefined;
    const goals = (lines(parsed?.goals, 2, 60) || []).filter(g => !FOREIGN_SCRIPT.test(g));
    return NextResponse.json({ story: typeof parsed?.story === 'string' && parsed.story.trim() ? parsed.story.trim().slice(0, 1500) : story, fixes: notes(parsed?.fixes), threads: openThreads, places, arrive,
      consequences: lines(parsed?.consequences, 4, 200) ?? consequences, goals,
      // Only named people or a named group; goodwill moves by at most 10 per reaction.
      reactions: (Array.isArray(parsed?.reactions) ? parsed.reactions : []).filter((r: unknown): r is { who: string; text: string; affection?: unknown } => !!r && typeof (r as { who?: unknown }).who === 'string' && !!(r as { who: string }).who.trim() && (!castNames.size || castPerson((r as { who: string }).who.trim())) && typeof (r as { text?: unknown }).text === 'string' && !!(r as { text: string }).text.trim())
        .slice(0, 2).map((r: { who: string; text: string; affection?: unknown }) => ({ who: r.who.trim().slice(0, 30), text: r.text.trim().slice(0, 160), affection: Math.max(-10, Math.min(10, Math.round(Number(r.affection) || 0))) })) });
  } catch (error) {
    void logError(request, 'director', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '이야기 감독 서버 오류' }, { status: 500 });
  }
}
