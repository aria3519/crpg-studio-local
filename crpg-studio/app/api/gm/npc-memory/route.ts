import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// After each conversation, folds what was said into one NPC's own memory of the player,
// so the NPC still remembers it long after the lines have left the recent history.
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY 환경변수가 없습니다.' }, { status: 500 });
  try {
    const body = await request.json();
    const npc = String(body.npc || '').slice(0, 30);
    const previous = typeof body.note === 'string' ? body.note.slice(0, 800) : '';
    const lines = Array.isArray(body.lines) ? body.lines.filter((x: unknown): x is string => typeof x === 'string').map((x: string) => x.slice(0, 400)).slice(-30) : [];
    if (!npc || !lines.length) return NextResponse.json({ note: previous });
    const system = [
      `당신은 한국어 CRPG에서 NPC "${npc}"의 기억을 관리합니다. 기존 기억과 방금 끝난 대화를 합쳐, ${npc}가 플레이어에 대해 기억하는 내용을 갱신하세요.`,
      '대화에 실제로 나온 사실만 남기세요: 주고받은 정보, 맡기거나 받은 의뢰, 약속·거래·빚, 플레이어가 한 부탁이나 무례, 서로의 감정 변화. 추측이나 새 사건을 지어내지 마세요.',
      '오래된 내용은 짧게 압축하고, 이미 끝난 약속은 결과만 남기세요. 글머리표 없이 짧은 문장 여러 개로, 전체 400자 이내.',
      '다음 JSON만 반환하세요: {"note":"갱신된 기억"}',
    ].join('\n');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MEMORY_MODEL || process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.2, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ previousMemory: previous, conversation: lines }) }] }),
      cache: 'no-store', signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result?.error?.message || 'AI API 호출에 실패했습니다.' }, { status: 502 });
    const note = JSON.parse(result?.choices?.[0]?.message?.content || '{}')?.note;
    if (typeof note !== 'string' || !note.trim()) throw new Error('NPC 기억이 비어 있습니다.');
    return NextResponse.json({ note: note.trim().slice(0, 600) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'NPC 기억 서버 오류' }, { status: 500 });
  }
}
