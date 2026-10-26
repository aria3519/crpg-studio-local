import { NextResponse } from 'next/server';
export const runtime='nodejs';
export const maxDuration=120;
const ids=['foundation','system','npc','story','goal'] as const;
export async function POST(request:Request){
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'OPENAI_API_KEY가 없습니다.'},{status:503});
 try{
  const b=await request.json();
  const sections=Array.isArray(b.sections)?b.sections:[];
  if(sections.length!==5||ids.some(id=>!sections.some((s:{id:string})=>s.id===id)))return NextResponse.json({error:'5개 주제 정보가 필요합니다.'},{status:400});
  const instruction=`너는 장기 RPG 기획 방향 제안자다. 실제 규칙 전체를 작성하지 않고 다섯 주제 각각 서로 다른 기획 방향 3개씩 제안한다. 각 안은 제목(title)과 90~230자의 간결한 설명(description)을 생성한다. 제목은 선택지의 실제 내용에 맞는 고유한 한국어 명사구 8~24자로 작성하고, 1·2·3안 사이에 제목을 반복하지 않는다. foundation=세계관과 시작 조건, system=판정·전투·진행, npc=최소 10명 등장하는 인물 관계축과 성별, story=3~5막 사건과 기연, goal=다중 해결 경로를 갖는 최종 목표. 각 안은 명확히 차별화한다. 이전 단계 내용을 재설명하지 않는다. JSON 객체의 sections 속성에 foundation,system,npc,story,goal 키를 만들고 각각 {"title":"고유 제목","description":"추천 방향 설명"} 객체 세 개의 배열을 반환한다. 제목은 절대로 정해진 템플릿을 쓰지 말고 게임의 고유 인물·세력·사건과 관련된 내용으로 작성한다.`;
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_PROMPT_MODEL||'gpt-4.1-mini',temperature:0.8,max_completion_tokens:4500,response_format:{type:'json_object'},messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify({gameName:b.gameName,gameDescription:b.gameDescription,genre:b.genre,sections})}]}),signal:AbortSignal.timeout(105000),cache:'no-store'});
  const result=await response.json();if(!response.ok)throw Error(result?.error?.message||'추천 생성 실패');
  const parsed=JSON.parse(result?.choices?.[0]?.message?.content||'{}');
  const data=parsed.sections||parsed;const output:Record<string,{title:string;description:string}[]>={};
  for(const id of ids){const arr=data[id];if(!Array.isArray(arr)||arr.length!==3||arr.some((v:unknown)=>!v||typeof v!=='object'||typeof (v as {title?:unknown}).title!=='string'||typeof (v as {description?:unknown}).description!=='string'))throw Error(`${id} 제목과 방향 3개가 누락되었습니다.`);output[id]=arr.map((v:{title:string;description:string})=>({title:v.title.trim().slice(0,45),description:v.description.trim().slice(0,500)}));}
  return NextResponse.json({sections:output});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'추천 생성 실패'},{status:500});}
}
