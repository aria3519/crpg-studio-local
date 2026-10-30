import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 120;
const kinds = ['start','place','building','event','exit'];
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({error:'OPENAI_API_KEY 환경변수가 없습니다.'},{status:500});
  try {
    const body = await request.json();
    if (typeof body.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(body.image) || body.image.length > 12_000_000) return NextResponse.json({error:'유효한 맵 이미지가 필요합니다.'},{status:400});
    const sections = Array.isArray(body.sections) ? body.sections.slice(0,4).map((s:{name?:string;text?:string})=>`${String(s.name||'').slice(0,80)}: ${String(s.text||'').slice(0,1800)}`).join('\n') : '';
    const planned=Array.isArray(body.locations)?body.locations.slice(0,10).map((loc:{name?:string;kind?:string;x?:number;y?:number;visualCue?:string;description?:string;eventText?:string;eventTrigger?:string})=>({name:String(loc.name||'').slice(0,60),kind:String(loc.kind||'place'),approxX:Number(loc.x)||50,approxY:Number(loc.y)||50,visualCue:String(loc.visualCue||'').slice(0,200),description:String(loc.description||'').slice(0,500),eventText:String(loc.eventText||'').slice(0,900),eventTrigger:loc.eventTrigger==='interact'?'interact':'enter'})):[];
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.OPENAI_MAP_ANALYSIS_MODEL || 'gpt-4.1-mini',temperature:0.5,response_format:{type:'json_object'},messages:[
        {role:'system',content:'You analyze an illustrated game map. Respond with a JSON object {"pins":[{"name":"...","x":50,"y":50,"kind":"start|place|building|event|exit","description":"...","eventText":"...","eventTrigger":"enter|interact","eventOnce":false}]}. Coordinates are percentages from image top-left (0-100). When a planned location list is provided, match its names and descriptions to visible structures and refine x/y coordinates using the actual image. Do not silently replace planned locations with unrelated guesses. Identify the actual center of the matching visible building using roof shape, nearby props, road connections, and spatial relations. The image is the source of truth for x/y, not planned percentages. Do not assign two different places to the same building unless the image unmistakably supports it. If an expected feature is not visibly identifiable, use the planned approximate coordinate and prepend [위치 확인 필요] to its Korean description. Do not invent visual certainty. Without a plan suggest 4-12 visually grounded locations; Do not create a separate start marker. Return only visible places and buildings; the first returned place will be the default start location, editable by the creator. Events must be consistent with provided Korean game context. A portal/exit is a candidate only: do not invent a destination or target map ID. No text labels or icons are drawn; only return data. Do not pretend uncertain features are certain.'},
        {role:'user',content:[{type:'text',text:`게임: ${String(body.gameName||'').slice(0,100)}\n장르: ${String(body.genre||'').slice(0,100)}\n${sections}\n장소 사전 계획: ${JSON.stringify(planned)}\n이미지에 보이는 장소의 중심 좌표를 분석해 주세요.`},{type:'image_url',image_url:{url:body.image,detail:'high'}}]}
      ]}),signal:AbortSignal.timeout(110000),cache:'no-store'});
    const data = await response.json();
    if (!response.ok) return NextResponse.json({error:data?.error?.message||'이미지 분석 API 오류'},{status:502});
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    const input = Array.isArray(parsed.pins) ? parsed.pins : [];
    // Planned names are authoritative. Image analysis can refine coordinates, not invent new labels.
    const pins = (planned.length ? planned : input).slice(0,16).map((loc:Record<string,unknown>,index:number)=>{
      const candidate=planned.length ? (input.find((v:Record<string,unknown>)=>String(v.name||'').trim()===String(loc.name||'').trim()) || input[index]) : loc;
      const position=candidate&&Number.isFinite(Number(candidate.x))&&Number.isFinite(Number(candidate.y))?candidate:loc;
      return {name:String(loc.name||'').slice(0,70),x:Math.max(0,Math.min(100,Number(position.x??loc.approxX??50))),y:Math.max(0,Math.min(100,Number(position.y??loc.approxY??50))),kind:kinds.includes(String(loc.kind))?String(loc.kind):'place',description:String(loc.description||'').slice(0,500),eventText:String(loc.eventText||'').slice(0,1000),eventTrigger:loc.eventTrigger==='interact'?'interact':'enter',eventOnce:Boolean(loc.eventOnce)};
    }).filter((p:{name:string})=>p.name.trim());
    if (!pins.length) return NextResponse.json({error:'분석 가능한 장소를 찾지 못했습니다.'},{status:422});
    pins.forEach((p:{kind:string})=>{if(p.kind==='start')p.kind='place';});
    return NextResponse.json({pins});
  } catch(error) {return NextResponse.json({error:error instanceof Error?error.message:'맵 분석 오류'},{status:500});}
}
