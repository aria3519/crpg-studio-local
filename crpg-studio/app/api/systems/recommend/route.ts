import { NextResponse } from 'next/server';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'OPENAI_API_KEY가 없습니다.'},{status:500});
 try{
  const body=await request.json();
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_GM_MODEL||'gpt-4.1-mini',response_format:{type:'json_object'},messages:[{role:'system',content:'게임 제작 도구의 시스템 설계자입니다. 게임 유형·세계관·프롬프트에 맞는 최소한의 정보 항목 0~8개를 추천하세요. RPG 능력치, HP, 인벤토리, 레벨을 무조건 추천하지 마세요. 추리라면 단서/사건, 연애라면 관계/시간, 경영이라면 자금/직원처럼 장르에 맞게. JSON만 반환: {"fields":[{"name":"항목","initial":"0","kind":"number|text|gauge","max":100}],"inventory":false,"equipment":false}. kind는 number,text,gauge 중 하나. 게이지에만 max를 넣으세요.'},{role:'user',content:JSON.stringify({gameType:String(body.gameType||'').slice(0,100),world:String(body.world||'').slice(0,1000),description:String(body.description||'').slice(0,300),prompt:String(body.prompt||'').slice(0,7000)})}]}),signal:AbortSignal.timeout(55000)});
  const result=await response.json();if(!response.ok)throw new Error(result?.error?.message||'AI 추천 실패');
  const data=JSON.parse(result?.choices?.[0]?.message?.content||'{}');if(!Array.isArray(data.fields))throw new Error('응답 형식 오류');
  const fields=data.fields.slice(0,8).filter((f:Record<string,unknown>)=>typeof f.name==='string'&&typeof f.initial==='string'&&['number','text','gauge'].includes(String(f.kind))).map((f:{name:string;initial:string;kind:string;max?:number})=>({name:f.name.slice(0,50),initial:f.initial.slice(0,80),kind:f.kind,max:f.kind==='gauge'?Math.max(1,Math.min(100000,Number(f.max)||100)):undefined}));
  return NextResponse.json({fields,inventory:!!data.inventory,equipment:!!data.equipment});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'시스템 추천 오류'},{status:500});}
}
