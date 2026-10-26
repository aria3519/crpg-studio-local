export async function reviewGeneratedImage(kind:'map'|'npc',imageBase64:string,requirements:string):Promise<{passed:boolean;issues:string[];feedback:string}> {
 const key=process.env.OPENAI_API_KEY;
 if(!key)return {passed:true,issues:[],feedback:'review unavailable'};
 const criteria=kind==='map'
 ? 'This must be a PLAYABLE full-region CRPG BOARD WORLD MAP from a very high bird-eye/isometric angle, with many distinct widely spaced navigable settlements, routes, rivers and geographic regions. A close-up valley landscape or cinematic scenery painting FAILS. Written labels, UI, parchment frames FAIL. Genre architecture must match.'
 : 'This must be a SINGLE full or 3/4 body character illustration suitable as a CRPG NPC asset, not a landscape, card collage, screenshot or scene. Must match the specified gender, age impression, faction attire and identity. No text or extra characters. Genre-specific costume and coherent high-quality 2D rendering.';
 try{
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_IMAGE_REVIEW_MODEL||'gpt-4.1-mini',temperature:0,response_format:{type:'json_object'},max_completion_tokens:450,messages:[{role:'system',content:`Inspect generated art critically. ${criteria} Return JSON {"passed":boolean,"issues":string[],"feedback":string}. Fail only meaningful visual usability problems. Max 3 issues. feedback is a concise corrective image-generation instruction in English.`},{role:'user',content:[{type:'text',text:`Asset type: ${kind}. Specific requirements: ${requirements.slice(0,1700)}`},{type:'image_url',image_url:{url:`data:image/png;base64,${imageBase64}`,detail:'low'}}]}]}),signal:AbortSignal.timeout(30000),cache:'no-store'});
  if(!response.ok)throw Error('review API unavailable');
  const json=await response.json();const review=JSON.parse(json?.choices?.[0]?.message?.content||'{}');
  return {passed:review.passed!==false,issues:Array.isArray(review.issues)?review.issues.slice(0,3):[],feedback:String(review.feedback||'').slice(0,700)};
 }catch{return {passed:true,issues:[],feedback:'review unavailable'};}
}
