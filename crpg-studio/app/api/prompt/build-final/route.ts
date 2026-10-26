import { NextResponse } from 'next/server';
import { buildReferencePrompt } from '../_lib/reference-builder';
import {applySafePatches,parseReview,structuralReview,protectedContentUnchanged,type Review} from '../_lib/semantic-review';
export const runtime='nodejs';
export const maxDuration=120;
const MODEL=process.env.OPENAI_PROMPT_REVIEW_MODEL||process.env.OPENAI_PROMPT_MODEL||'gpt-4.1-mini';
async function review(prompt:string,context:unknown):Promise<Review>{
 const reply=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,temperature:0,max_completion_tokens:2400,response_format:{type:'json_object'},messages:[
 {role:'system',content:`당신은 장기 CRPG 게임 설정의 독립 검증관이다. 절대 문제를 숨기지 말고 실제 전달된 프롬프트의 문장만 근거로 평가하라. 반드시 JSON 객체 {"passed":boolean,"issues":[{"code":string,"severity":"critical"|"major"|"minor","section":string,"detail":string,"evidence":string}],"patches":[{"section":string,"oldText":string,"newText":string,"reason":string}]} 로 반환한다.\n검사: (1) NPC 소속·직책·목표·비밀·발각 조건의 모순, 등장하지 않는 사건·세력 참조 (2) 1~4막 선행조건, 단서→행동→결과의 인과성, 숨겨진 정보 조기 노출 (3) 의뢰/돌발/기연과 메인 사건 간 실제 플롯 구조 중복 (4) 도시·장소·시간·장르 문화 요소 및 인물 호칭 일관성 (5) 시작 신분·소속·성씨·플래그 정합성 (6) 한 장소나 소재 편중. 치명적 모순 critical, 실제 플레이 혼란 major, 문체 minor. 문제가 없으면 passed=true. critical 또는 major가 있으면 passed=false.\n수정안 patches는 '독립 의뢰','돌발 사건','기연','시작 조건' 섹션에만, oldText가 정확히 한 번 등장하는 부분 문자열일 때만 제시한다. 원본 기본 규칙, NPC, 메인 사건, 주요 장소, 세력은 절대 수정 제안하지 않는다. 수정할 수 없는 문제도 issues에 반드시 보고한다. 보상·대가·인과관계는 보존하고 새로운 고유명사를 발명하지 않는다. 불필요한 패치는 금지.`},
 {role:'user',content:JSON.stringify({context,prompt})}]}),signal:AbortSignal.timeout(45000),cache:'no-store'});
 if(!reply.ok)throw Error(`AI 검증 요청 실패 (${reply.status})`);
 const data=await reply.json();const content=data?.choices?.[0]?.message?.content;
 if(typeof content!=='string'||!content.trim())throw Error('AI 검증 응답이 비었습니다.');return parseReview(content);
}
export async function POST(request:Request){
 try{
  const body=await request.json();const choices=Array.isArray(body.choices)?body.choices:[];const ids=['foundation','system','npc','story','goal'];
  if(choices.length!==5||ids.some(id=>!choices.some((c:{id?:string;keyword?:string})=>c.id===id&&typeof c.keyword==='string'&&c.keyword.trim())))return NextResponse.json({error:'다섯 가지 선택이 필요합니다.'},{status:400});
  if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'정합성 우선 모드에는 OPENAI_API_KEY가 필요합니다. AI 검증 없이 통과 처리하지 않습니다.',qualityReview:{passed:false,issues:[{code:'NO_KEY',severity:'critical',detail:'API 키 없음'}]}},{status:503});
  const result=buildReferencePrompt({genre:String(body.genre||''),gameName:String(body.gameName||'').slice(0,100),gameDescription:String(body.gameDescription||'').slice(0,500),choices,goalMode:String(body.goalMode||'single')});
  const baseline=result.prompt;let prompt=baseline;const context={genre:result.genre,city:result.city,main:result.selectedMain,selectedFactions:result.contentOutline.factions,selectedNPCs:result.contentOutline.npcs};
  let first=await review(prompt,context);let applied=0;let finalReview=first;
  if(!first.passed&&first.patches.length){const changed=applySafePatches(prompt,first.patches);if(changed.applied){prompt=changed.prompt;applied=changed.applied;finalReview=await review(prompt,context);}}
  const structure=structuralReview(prompt,baseline,result);if(!protectedContentUnchanged(baseline,prompt))throw Error('고정 설정 보존 검사 실패');
  const issues=[...finalReview.issues,...structure];const passed=finalReview.passed&&structure.length===0&&issues.every(i=>i.severity==='minor');
  if(!passed)return NextResponse.json({error:`정합성 검증 미통과: ${issues.filter(i=>i.severity!=='minor').slice(0,4).map(i=>i.detail).join(' / ')||'수정이 필요한 설정이 있습니다.'}`,qualityReview:{passed:false,issues,appliedPatches:applied,aiValidated:true},check:result.check},{status:422});
  return NextResponse.json({...result,prompt,length:prompt.length,lengthTargetMet:prompt.length>=5500&&prompt.length<=7000,bridgeStatus:'disabled_for_integrity',qualityReview:{passed:true,issues,appliedPatches:applied,aiValidated:true,sourceValidated:true}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'검증 실패',qualityReview:{passed:false,issues:[],aiValidated:false}},{status:503});}
}
