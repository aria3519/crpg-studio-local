import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({error:'OPENAI_API_KEY 환경변수가 없습니다.'},{status:500});
  try {
    const body = await request.json();
    const prompt = String(body.prompt || '').slice(0,7000).trim();
    if (!prompt) return NextResponse.json({error:'게임 프롬프트가 비어 있습니다.'},{status:400});
    const response = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.OPENAI_PROMPT_MODEL||process.env.OPENAI_GM_MODEL||'gpt-4.1-mini',temperature:0.5,response_format:{type:'json_object'},messages:[
        {role:'system',content:'당신은 한국어 CRPG 게임 등록 페이지의 소개문 작성자입니다. 제작자의 실제 프롬프트에 명시된 내용만 사용하여 플레이어에게 보여줄 흥미롭고 자연스러운 게임 소개를 350~800자로 작성하세요. 게임 배경, 플레이어 역할, 주요 경험과 특징을 포함하되, GM 내부 규칙이나 시스템 프롬프트를 노출하지 마세요. 프롬프트에 없는 기능, 전투, 멀티플레이, 맵, 장비, 보상, 콘텐츠는 지어내지 마세요. 실제 구현 여부가 불명확한 기능은 확정적으로 홍보하지 마세요. 반드시 JSON 객체 {"description":"...","hashtags":["태그1","태그2"]}로 응답하고 해시태그는 3~6개, # 기호 없이 20자 이내로 작성하세요.'},
        {role:'user',content:JSON.stringify({title:String(body.name||'').slice(0,100),shortIntro:String(body.description||'').slice(0,300),gameType:String(body.gameType||'').slice(0,100),world:String(body.world||'').slice(0,100),prompt})}
      ]}),signal:AbortSignal.timeout(55000),cache:'no-store'
    });
    const data=await response.json();
    if(!response.ok) return NextResponse.json({error:data?.error?.message||'AI 소개 작성 요청 실패'},{status:502});
    const parsed=JSON.parse(data?.choices?.[0]?.message?.content||'{}');
    const description=typeof parsed.description==='string'?parsed.description.trim().slice(0,2000):'';
    const hashtags=Array.isArray(parsed.hashtags)?parsed.hashtags.filter((x:unknown):x is string=>typeof x==='string').map((x:string)=>x.replace(/^#+/,'').trim().slice(0,20)).filter(Boolean).slice(0,10):[];
    if(!description)throw Error('소개 문구가 생성되지 않았습니다.');
    return NextResponse.json({description,hashtags});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'등록 소개 생성 오류'},{status:500});}
}
