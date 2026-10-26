import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({error:'OPENAI_API_KEY 환경변수가 없습니다.'},{status:500});
  try {
    const body = await request.json();
    const prologue = String(body.prologue || '').trim().slice(0,5000);
    if (!prologue) return NextResponse.json({error:'프롤로그가 없습니다.'},{status:400});
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini',
        temperature:0.7, response_format:{type:'json_object'},
        messages:[
          {role:'system',content:'당신은 한국어 CRPG 게임 마스터입니다. 프롤로그가 끝나는 바로 그 순간 플레이어가 실제로 선택할 수 있는 구체적이고 서로 다른 행동 3개를 생성하세요. 1~2번은 프롤로그 마지막 상황에 직접 연결되는 서로 다른 현실적인 행동이어야 합니다. 3번은 현재 상황을 바탕으로 한 독창적이고 예상 밖의 행동이어야 합니다. 3번도 세계관 안에서 실행 가능해야 하고 숨겨진 사실을 아는 척하거나 순간이동을 확정하면 안 됩니다. 반드시 프롤로그 마지막 장면, 등장인물, 미해결 사건과 목표를 근거로 작성하세요. 단순히 이동한다, 살펴본다, 주변을 조사한다 같은 일반적인 행동은 금지합니다. 각 선택지에 반드시 구체적인 인물·사물·사건·질문 중 하나를 넣고 선택했을 때 서로 다른 사건 전개가 일어나도록 하세요. 1번은 직접 개입하거나 대화하는 정석적인 선택, 2번은 정보를 수집하거나 다른 현실적인 방법으로 접근하는 선택, 3번은 주변 단서나 제도를 역이용하는 기발하지만 실현 가능한 선택으로 만드세요. 3번은 억지 개그나 무모한 자살행동이 아닙니다. 맵의 가까운 장소나 일반적인 행동을 임의로 끼워 넣지 마세요. 플레이어의 행동을 대신 확정하지 마세요. 각 문장은 플레이어가 그대로 입력할 수 있는 행동 문장이고 140자 이내여야 합니다. 프롤로그에 없는 비밀이나 인물의 정체를 지어내지 마세요. 프롤로그에서 플레이어와 직접 대면하거나 대화한 이름이 확인된 NPC만 metCharacters 배열에 {name,relation,affection}으로 넣으세요. 단순히 멀리 보이거나 이름만 언급된 인물은 제외하세요. 호감도는 0~100의 보수적인 초기 추정값입니다. 현재 목표 currentGoal은 프롤로그 끝에서 플레이어가 수행해야 할 구체적 당면 과제 하나이며 최종 승리 조건과 구별하세요. 오직 JSON {"choices":["...","...","..."],"metCharacters":[],"currentGoal":"..."}만 반환하세요.'},
          {role:'user',content:JSON.stringify({name:String(body.name||'').slice(0,100),genre:String(body.genre||''),prompt:String(body.prompt||'').slice(0,7000),prologue})}
        ]
      }), cache:'no-store', signal:AbortSignal.timeout(55000)
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({error:data?.error?.message||'선택지 생성 실패'},{status:502});
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    const choices = Array.isArray(parsed.choices) ? [...new Set(parsed.choices.filter((x:unknown):x is string=>typeof x==='string').map((x:string)=>x.trim()).filter((x:string)=>x.length>=2&&x.length<=140))].slice(0,3) : [];
    if (choices.length!==3) throw new Error('프롤로그 선택지 3개를 생성하지 못했습니다.');
    const metCharacters = Array.isArray(parsed.metCharacters) ? parsed.metCharacters.slice(0,20).filter((v:unknown)=>!!v && typeof v==='object' && typeof (v as {name?:unknown}).name==='string').map((v:{name:string;relation?:string;affection?:number})=>({name:v.name.trim().slice(0,50),relation:typeof v.relation==='string'?v.relation.trim().slice(0,30):'초면',affection:typeof v.affection==='number'&&Number.isFinite(v.affection)?Math.max(0,Math.min(100,Math.round(v.affection))):50})).filter((v:{name:string})=>!!v.name) : [];
    return NextResponse.json({choices,metCharacters,currentGoal:typeof parsed.currentGoal==='string'?parsed.currentGoal.trim().slice(0,240):''});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'선택지 생성 오류'},{status:500});
  }
}
