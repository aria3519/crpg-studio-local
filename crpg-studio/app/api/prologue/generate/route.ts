import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({error:'OPENAI_API_KEY 환경변수가 없습니다.'},{status:500});
  try {
    const body = await request.json();
    const system = '당신은 CRPG 게임 도입부 작가입니다. 입력된 게임의 장르, 세계관, 시작 조건에 정확히 맞는 서로 다른 프롤로그 3개를 한국어로 작성하세요. 각각 400~900자 분량으로 분위기와 도입 사건을 구체적으로 묘사하되 플레이어의 대사, 감정, 의지, 중요한 행동을 임의로 확정하지 마세요. 세 프롤로그는 서로 다른 연출 방식이어야 합니다. 오직 JSON {"options":["...","...","..."]}만 반환하세요.';
    const response = await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_GM_MODEL||'gpt-4.1-mini',temperature:0.8,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({name:String(body.name||'').slice(0,100),description:String(body.description||'').slice(0,300),world:String(body.world||'').slice(0,1000),prompt:String(body.prompt||'').slice(0,7000)})}]}),cache:'no-store',signal:AbortSignal.timeout(55000)});
    const result=await response.json();
    if(!response.ok)return NextResponse.json({error:result?.error?.message||'AI 생성 실패'},{status:502});
    const parsed=JSON.parse(result?.choices?.[0]?.message?.content||'{}');
    if(!Array.isArray(parsed.options)||parsed.options.length!==3||parsed.options.some((x:unknown)=>typeof x!=='string'||!x.trim()))throw new Error('프롤로그 3개를 생성하지 못했습니다.');
    return NextResponse.json({options:parsed.options.map((x:string)=>x.slice(0,5000))});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'프롤로그 생성 오류'},{status:500});}
}
