import { aiAllowed, LIMIT_REPLY, logError } from '../../../_lib/beta';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// The director reads an action the player typed before it is played (user 2026-11-23): one that fits the story goes on as
// it is; one that breaks the game's balance (a win, a treasure or a power the player just declares) is turned down, and the
// director says why the way a table's game master would. Picked choices never come here.
// POST { action, recent, location, present, inventory, gold, level, goal } → { ok, reason }
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: true, reason: '' });
  try {
    const body = await request.json();
    if (!aiAllowed(request)) return NextResponse.json(LIMIT_REPLY, { status: 429 });
    const action = String(body.action || '').trim().slice(0, 300);
    if (!action) return NextResponse.json({ ok: true, reason: '' });
    const strings = (v: unknown, n: number, len: number) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n).map(x => x.slice(0, len)) : [];
    const input = {
      action, recentScenes: strings(body.recent, 8, 1200), location: String(body.location || '').slice(0, 60), present: strings(body.present, 8, 40),
      inventory: strings(body.inventory, 40, 60), gold: Number(body.gold) || 0, level: Number(body.level) || 1, goal: String(body.goal || '').slice(0, 120),
    };
    const system = [
      '당신은 한국어 CRPG의 이야기 감독입니다. 플레이어가 선택지 대신 직접 써 넣은 행동(action)을 장면으로 진행하기 전에 읽고, 진행할지 정합니다.',
      '플레이어는 무엇이든 시도할 수 있습니다. 위험하거나 무례하거나 엉뚱한 행동, 실패할 수도 있는 행동, 장면에 나온 것을 줍거나 쓰는 행동, 누군가를 찾아가거나 어디로 가는 행동은 모두 진행합니다(결과는 장면과 판정이 정합니다).',
      '진행하지 않는 것은 게임의 균형을 깨는 행동뿐입니다: 결과를 플레이어가 정해 버림(적을 단번에 쓰러뜨린다, 설득에 성공한다, 보물을 찾는다), 가진 적 없는 물건·돈·능력을 씀(inventory와 gold에 없는 것, level에 맞지 않는 힘), 장면에 없는 것을 있다고 함, 이야기를 건너뜀(최종 적 앞으로 바로 간다, 목표를 끝냈다고 한다).',
      '진행하면 {"ok":true,"reason":""}를, 진행하지 않으면 {"ok":false,"reason":"…"}를 JSON으로만 반환합니다. reason은 테이블의 사회자가 플레이어에게 직접 건네는 말로, 하십시오체 1~2문장입니다: 왜 그렇게는 안 되는지 이야기 속 사정으로 짚고, 대신 해 볼 수 있는 것을 하나 권합니다(예: "그 검은 아직 당신 손에 없습니다. 궤짝을 열어 직접 꺼내 보시겠습니까?").',
    ].join('\n\n');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'x-usage-tag': 'judge' },
      body: JSON.stringify({ model: process.env.OPENAI_GM_MAJOR_MODEL || process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }] }),
      cache: 'no-store', signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    // The judge only ever holds an action back; when it can't answer, the action goes on.
    if (!response.ok) return NextResponse.json({ ok: true, reason: '' });
    const parsed = JSON.parse(result?.choices?.[0]?.message?.content || '{}');
    const reason = typeof parsed?.reason === 'string' ? parsed.reason.trim().slice(0, 300) : '';
    return NextResponse.json({ ok: parsed?.ok !== false || !reason, reason });
  } catch (error) {
    void logError(request, 'judge', error);
    return NextResponse.json({ ok: true, reason: '' });
  }
}
