import { NextResponse } from 'next/server';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'OPENAI_API_KEY가 없습니다.'},{status:500});
 try{
  const body=await request.json();
  const goal=String(body.goal||'').trim().slice(0,2500);
  if(!goal)return NextResponse.json({error:'먼저 게임 프롬프트에서 최종 목표를 작성해 주세요.'},{status:400});
  const prompt=String(body.prompt||'').slice(0,4000);
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_PROMPT_MODEL||process.env.OPENAI_GM_MODEL||'gpt-4.1-mini',response_format:{type:'json_object'},temperature:0.6,messages:[{role:'system',content:'한국어 CRPG 게임 설계자입니다. 최종 목표를 달성하기 위해 필요한 3~8개의 명확하고 순서가 있는 검증 가능한 마일스톤을 만드세요. 게임 내 실제 행동이나 사건으로 완료 여부를 판정할 수 있어야 합니다. JSON {"steps":["...", "..."]}만 반환하세요.'},{role:'user',content:JSON.stringify({goal,prompt,genre:String(body.genre||'').slice(0,100)})}]}),signal:AbortSignal.timeout(55000),cache:'no-store'});
  const data=await r.json();if(!r.ok)return NextResponse.json({error:data?.error?.message||'AI 요청 실패'},{status:502});
  const parsed=JSON.parse(data?.choices?.[0]?.message?.content||'{}');
  const steps=Array.isArray(parsed.steps)?parsed.steps.filter((v:unknown):v is string=>typeof v==='string'&&v.trim().length>=3).slice(0,8).map((v:string)=>v.trim().slice(0,160)):[];
  if(steps.length<2)throw Error('AI가 목표 단계를 충분히 반환하지 않았습니다.');
  return NextResponse.json({steps});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'단계 생성 오류'},{status:500});}
}
