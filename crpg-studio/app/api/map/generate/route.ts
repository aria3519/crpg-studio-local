import { reviewGeneratedImage } from '../../_lib/image-quality';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request:Request){
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'OPENAI_API_KEY 환경변수가 없습니다.'},{status:500});
 try{
  const body=await request.json();
  const sections=Array.isArray(body.sections)?body.sections:[];
  if(!sections.some((x:{text?:string})=>typeof x.text==='string'&&x.text.trim()))return NextResponse.json({error:'게임 프롬프트를 먼저 작성해 주세요.'},{status:400});
  // Analyze the full game specification first; send only map-relevant facts to image generation.
  const context=sections.filter((x:{name?:string;text?:string})=>typeof x.text==='string'&&x.text.trim()).map((x:{name:string;text:string})=>`${x.name}: ${x.text.slice(0,10000)}`).join('\n').slice(0,28000);
  const customPrompt=typeof body.customPrompt==='string'?body.customPrompt.trim().slice(0,1600):'';
  const extraction=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MAP_ANALYSIS_MODEL||'gpt-4.1-mini',temperature:0.2,response_format:{type:'json_object'},messages:[{role:'system',content:'You are a level artist for a playable board-style CRPG. Read the complete game design and extract ONLY visual map-relevant information. Return JSON with keys setting,terrain,architecture,landmarks,spatialRelationships,startingArea,visualMood. landmarks is an array of up to 14 objects {name,visualCue,region}. Use actual locations from the story, including quests and secrets only if explicitly present. No NPC biographies, plot spoilers, dialogue, stats or game rules. Do not invent unrelated regions. Write visual descriptions in English; preserve proper names only as metadata.'},{role:'user',content:`GAME: ${String(body.gameName||'').slice(0,100)}\nGENRE: ${String(body.genre||'').slice(0,100)}\nFULL GAME DESIGN:\n${context}`}]}),signal:AbortSignal.timeout(45000),cache:'no-store'});
  const extractionData=await extraction.json();
  if(!extraction.ok)return NextResponse.json({error:extractionData?.error?.message||'맵 정보 추출 실패'},{status:502});
  let mapSpec:Record<string,unknown>={};
  try{mapSpec=JSON.parse(extractionData?.choices?.[0]?.message?.content||'{}');}catch{return NextResponse.json({error:'맵 정보 분석 결과를 읽지 못했습니다.'},{status:502});}
  const mapFacts=JSON.stringify(mapSpec).slice(0,9500);
  const prompt=`CRITICAL CAMERA LOCK: SHOW AN ENTIRE PLAYABLE REGION FROM EXTREME HIGH-ALTITUDE 3/4 TOP-DOWN VIEW, LIKE A STRATEGY RPG OVERWORLD BOARD. The whole map must contain multiple separated named-in-data settlements and landmarks, visible roads linking them, different terrain zones, and a readable network of routes. A single mountain valley, one temple, one town, cinematic horizon, eye-level perspective or landscape concept art is STRICTLY FORBIDDEN. The composition must read as a tabletop strategy game map at a glance. Create an AAA-quality richly illustrated hand-painted RPG WORLD MAP with the density, craft, and visual storytelling of a premium Korean wuxia strategy game atlas. Every landmark is an exquisitely detailed distinct environment, with layered mountain ranges, tiny but legible architecture, rivers, bridges, forest canopies, roads and settlements; dramatic elevation, natural terrain transitions, atmospheric perspective, beautiful clouds, carefully balanced colors and excellent geographic readability. Use a panoramic high-angle oblique bird's-eye map composition, with broad interconnected regions, meaningful roads and waterways, harmonious miniature architecture, and a striking central focal settlement. Avoid repeated generic icons, cloned buildings, blank terrain, random landmark placement or a muddy texture. The reference image, when provided, is for VISUAL CRAFT, DENSITY, TERRAIN DETAIL AND ART DIRECTION ONLY: do not replicate its geography, buildings, labels, factions or specific composition. Invent a fresh geography strictly grounded in the extracted game locations. Create a premium, playable BOARD-STYLE CRPG GAME MAP illustration, NOT an antique parchment map or historical atlas. Wide 3:2 landscape, high-angle three-quarter isometric tabletop RPG board view, professionally art-directed game environment, vibrant but balanced game-art colors, crisp hand-painted 3D-like depth, finely detailed miniature-scale architecture, terrain elevation, natural lighting, readable interactive landmarks, distinct roads and traversable terrain. Visual quality of a premium fantasy strategy/RPG board game, richly modeled buildings, cliffs, bridges, forests, waterways and environmental storytelling as appropriate to the actual genre. Distinct game-board composition with landmarks spaced apart and navigable paths, clear silhouettes, a cohesive environment and playable feel. NO parchment texture, antique paper, scroll borders, cartographic legend, old map icons, flat historical ink painting, photoreal satellite view, UI frame, hex grid, square grid or miniature figures. Genre fidelity is mandatory: modern survival uses modern streets/buildings; sci-fi uses futuristic architecture; wuxia uses Chinese-style martial arts settlements, temples and mountainous paths. Show approximately 8-14 clear landmark areas when supported by the source. DO NOT DRAW TEXT OF ANY KIND: no names, letters, numbers, signboard text, symbols resembling writing, pins, markers or player icons. The application overlays Korean labels and player position separately. Map-specific extracted design (authoritative): ${mapFacts}. ${customPrompt?`Additional creator art direction, only if consistent with the game world: ${customPrompt}`:''}`;
  // An in-app style reference keeps this app-only ZIP self-contained. The map's actual places always come from mapFacts.
  const useReference=process.env.OPENAI_MAP_STYLE_REFERENCE!=='false';
  const referencePath=path.join(process.cwd(),'app','api','map','generate','map-style-reference.jpg');
  let response:Response;
  if(useReference){
   try{
    const bytes=await readFile(referencePath);
    const form=new FormData();
    form.set('model',process.env.OPENAI_MAP_IMAGE_MODEL||'gpt-image-1');
    form.set('prompt',prompt+' IMPORTANT: render the final map WITHOUT any written words, legends, frames, calligraphy or location labels; the UI will overlay exact Korean names.');
    form.set('size','1536x1024');form.set('quality','high');form.set('n','1');
    form.set('image',new Blob([bytes],{type:'image/jpeg'}),'map-style-reference.jpg');
    response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(110000),cache:'no-store'});
   }catch(error){
    if(!(error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code==='ENOENT'))throw error;
    response=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MAP_IMAGE_MODEL||'gpt-image-1',prompt,size:'1536x1024',quality:'high',n:1}),signal:AbortSignal.timeout(110000),cache:'no-store'});
   }
  }else{
   response=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MAP_IMAGE_MODEL||'gpt-image-1',prompt,size:'1536x1024',quality:'high',n:1}),signal:AbortSignal.timeout(110000),cache:'no-store'});
  }
  const data=await response.json();
  if(!response.ok)return NextResponse.json({error:data?.error?.message||'이미지 생성 API 오류'},{status:502});
  const b64=data?.data?.[0]?.b64_json;
  if(typeof b64!=='string')return NextResponse.json({error:'이미지 생성 결과가 비어 있습니다.'},{status:502});
  let finalImage=b64;
  const review=await reviewGeneratedImage('map',b64,`Genre: ${String(body.genre||'')}. Landmarks: ${mapFacts}`);
  if(!review.passed){
   try{
    const retryPrompt=prompt+`\nMANDATORY CORRECTIONS FROM VISUAL REVIEW: ${review.feedback}. This is a GAME WORLD MAP, not a scenic landscape. EXTREME TOP-DOWN VIEW; ALL DISTINCT REGIONS AND CONNECTING ROADS VISIBLE. NO WORDS.`;
    const retry=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MAP_IMAGE_MODEL||'gpt-image-1',prompt:retryPrompt,size:'1536x1024',quality:'high',n:1}),signal:AbortSignal.timeout(110000),cache:'no-store'});
    const result=await retry.json();if(retry.ok&&typeof result?.data?.[0]?.b64_json==='string')finalImage=result.data[0].b64_json;
   }catch(err){console.warn('Map image correction unavailable',err);}
  }
  return NextResponse.json({image:`data:image/png;base64,${finalImage}`,qualityReview:{passed:review.passed,issues:review.issues,correctiveRetry:!review.passed}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'맵 생성 오류'},{status:500});}
}
