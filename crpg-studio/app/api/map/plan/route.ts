import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request:Request){
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'OPENAI_API_KEY 환경변수가 없습니다.'},{status:500});
 try{
  const body=await request.json();
  const sections=Array.isArray(body.sections)?body.sections:[];
  if(!sections.some((x:{text?:string})=>typeof x.text==='string'&&x.text.trim()))return NextResponse.json({error:'게임 프롬프트를 먼저 작성해 주세요.'},{status:400});
  const context=sections.slice(0,12).map((s:{name?:string;text?:string})=>`${String(s.name||'').slice(0,80)}: ${String(s.text||'').slice(0,1800)}`).join('\n');
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MAP_ANALYSIS_MODEL||'gpt-4.1-mini',temperature:0.1,response_format:{type:'json_object'},messages:[{role:'system',content:'Plan a coherent illustrated RPG map before image generation. Output JSON {"locations":[{"name":"Korean short place name","kind":"start|place|building|event|exit","x":25,"y":40,"visualCue":"distinctive visible building shape and surrounding props in English","description":"Korean location description","eventText":"Korean arrival event or interaction hook","eventTrigger":"enter|interact"}]}. 5-9 locations. Names must be copied exactly from explicitly named places in the supplied game prompt. Never invent poetic or generic place names. Exactly one safe start, grounded in the player start conditions. Use a clear visually distinct silhouette for each place. x,y are approximate percentages from upper left, between 12 and 88. Spread locations across the canvas to avoid label overlaps. Genre and setting are authoritative: never introduce fantasy landmarks into a modern or post-apocalyptic world unless specifically requested. Exit candidates have no linked destination. No fabricated guaranteed features.'},{role:'user',content:`게임: ${String(body.gameName||'').slice(0,100)}\n장르: ${String(body.genre||'').slice(0,100)}\n${context}`}]}),signal:AbortSignal.timeout(110000),cache:'no-store'});
  const data=await response.json();if(!response.ok)return NextResponse.json({error:data?.error?.message||'장소 계획 생성 실패'},{status:502});
  const parsed=JSON.parse(data?.choices?.[0]?.message?.content||'{}');
  const allowed=['start','place','building','event','exit'];
  const locations=(Array.isArray(parsed.locations)?parsed.locations:[]).slice(0,10).filter((v:Record<string,unknown>)=>v&&typeof v.name==='string'&&typeof v.visualCue==='string'&&Number.isFinite(Number(v.x))&&Number.isFinite(Number(v.y))).map((v:Record<string,unknown>)=>({name:String(v.name).slice(0,55),kind:allowed.includes(String(v.kind))?String(v.kind):'place',x:Math.max(8,Math.min(92,Number(v.x))),y:Math.max(8,Math.min(92,Number(v.y))),visualCue:String(v.visualCue).slice(0,200),description:String(v.description||'').slice(0,500),eventText:String(v.eventText||'').slice(0,900),eventTrigger:v.eventTrigger==='interact'?'interact':'enter'}));
  if(!locations.length)return NextResponse.json({error:'맵 장소 계획을 만들지 못했습니다.'},{status:422});
  let startFound=false;for(const loc of locations){if(loc.kind==='start'){if(startFound)loc.kind='place';else startFound=true;}}if(!startFound)locations[0].kind='start';
  return NextResponse.json({locations});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'맵 장소 계획 오류'},{status:500});}
}
