import { NextResponse } from 'next/server';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'OPENAI_API_KEY가 없습니다.'},{status:500});
 try{
  const body=await request.json();const prompt=String(body.prompt||'').slice(0,7000);
  if(!prompt.trim())return NextResponse.json({items:[]});
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_GM_MODEL||'gpt-4.1-mini',response_format:{type:'json_object'},messages:[{role:'system',content:'게임 제작 프롬프트에서 게임 시작 시 플레이어가 실제로 소유하도록 명시된 시작 장비 또는 시작 소지품만 추출하세요. 획득 가능 아이템, 세계관 속 아이템, 일반 예시, 장비 사용 규칙은 제외하세요. 추측하거나 새 아이템을 창작하지 마세요. JSON {"items":["아이템 이름"]} 형태로만 답하세요. 최대 12개.'},{role:'user',content:prompt}]}),signal:AbortSignal.timeout(55000)});
  const result=await response.json();if(!response.ok)throw Error(result?.error?.message||'AI 추출 실패');
  const data=JSON.parse(result?.choices?.[0]?.message?.content||'{}');
  const items=Array.isArray(data.items)?[...new Set(data.items.filter((v:unknown):v is string=>typeof v==='string').map((v:string)=>v.trim()).filter((v:string)=>v.length>0&&v.length<=70))].slice(0,12):[];
  return NextResponse.json({items});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'장비 추출 실패'},{status:500});}
}
