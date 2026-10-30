import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
const KEY_FACT_LIMIT = 100;

// Folds log entries that are about to leave the GM's recent window into a rolling long-term memory.
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY 환경변수가 없습니다.' }, { status: 500 });
  try {
    const body = await request.json();
    const previous = typeof body.summary === 'string' ? body.summary.slice(0, 9000) : '';
    const entries = Array.isArray(body.entries) ? body.entries.filter((x: unknown): x is string => typeof x === 'string').map((x: string) => x.slice(0, 1500)).slice(-80) : [];
    // Key facts live outside the summary and are never rewritten; the model only adds new ones.
    const pinned = Array.isArray(body.pinned) ? body.pinned.filter((x: unknown): x is string => typeof x === 'string').slice(-KEY_FACT_LIMIT) : [];
    if (!entries.length) return NextResponse.json({ summary: previous, pinned: [] });
    const system = [
      '당신은 한국어 CRPG의 장기 기억 관리자입니다. 기존 장기 기억과 새 플레이 기록을 합쳐 갱신된 장기 기억 하나를 만듭니다.',
      '실제 기록에 있는 사실만 남기세요. 추측·새 사건·아직 드러나지 않은 비밀을 지어내지 마세요. 고유명사(인물·장소·물건·세력)는 기록의 표기 그대로 쓰세요.',
      '다음 다섯 개 머리말로 나눠 짧은 글머리표로 쓰세요:\n[지금까지의 줄거리] 시간순 핵심 사건. 오래된 일일수록 더 짧게 압축.\n[진행 중인 사건·떡밥] 아직 해결되지 않은 의뢰, 수상한 점, 남은 단서, 미뤄 둔 선택.\n[약속·거래·빚] 플레이어가 한 약속, 받은 의뢰, 진 빚이나 은혜.\n[인물 메모] 만난 인물별 관계, 태도, 플레이어가 알게 된 그 인물의 정보.\n[알게 된 사실] 플레이어가 알아낸 비밀·단서·세계 정보.',
      '해결된 떡밥은 [진행 중인 사건·떡밥]에서 빼고 줄거리에 결과만 남기세요. 전투 수치, 주사위 수치, 시스템 안내 같은 세부는 결과만 남기고 버리세요.',
      '이와 별도로, newLogEntries에서 이야기 끝까지 영향을 줄 중요한 사실만 골라 pinned 배열에 새로 넣으세요: 막·대사건의 결과, 인물의 죽음·배신·합류·적대, 밝혀진 흑막·비밀, 플레이어의 큰 결정과 맺은 약속, 얻거나 잃은 중요한 물건, 세력과의 관계 변화. 한 줄에 사실 하나, 100자 이내. alreadyPinned에 이미 있는 사실은 다시 쓰지 말고, 사소한 일이면 빈 배열로 두세요. alreadyPinned의 사실은 영구 보존되므로 summary에서는 짧게 줄여도 됩니다.',
      'summary는 전체 6000자 이내. 다음 JSON 객체만 반환하세요: {"summary":"갱신된 장기 기억","pinned":["새 핵심 사실"]}',
    ].join('\n\n');
    const payload = { model: process.env.OPENAI_MEMORY_MODEL || process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ previousMemory: previous, alreadyPinned: pinned, currentGoal: String(body.currentGoal || '').slice(0, 240), newLogEntries: entries }) },
      ],
    };
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(55000),
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result?.error?.message || 'AI API 호출에 실패했습니다.' }, { status: 502 });
    const raw = result?.choices?.[0]?.message?.content;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : {};
    const summary = parsed?.summary;
    if (typeof summary !== 'string' || !summary.trim()) throw new Error('장기 기억 요약이 비어 있습니다.');
    const added = Array.isArray(parsed?.pinned) ? parsed.pinned.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim()).map((x: string) => x.trim().slice(0, 120)).filter((x: string) => !pinned.includes(x)).slice(0, 10) : [];
    return NextResponse.json({ summary: summary.trim().slice(0, 8000), pinned: added });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '장기 기억 서버 오류' }, { status: 500 });
  }
}
