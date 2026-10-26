import { NextResponse } from 'next/server';
export const runtime='nodejs';
export const maxDuration=120;
const ids=['foundation','system','npc','story','goal'];
const requiredTitles=['역할과 기본 원칙','세계관과 배경','플레이어와 시작 조건','진행 방식과 정합성','판정과 전투','성장과 경제','주요 NPC와 관계','강호 대사건','독립 의뢰와 인연','돌발 사건','기연','게임의 최종 목표'];
export async function POST(request:Request){
 if(!process.env.OPENAI_API_KEY?.trim())return NextResponse.json({error:'OPENAI_API_KEY가 없습니다.'},{status:503});
 try{
  const b=await request.json();
  const id=String(b.stepId||'');if(!ids.includes(id))return NextResponse.json({error:'잘못된 단계'},{status:400});
  const previous=String(b.previous||'').slice(0,14000);
  const addition=String(b.newText||'').slice(0,12000);
  if(!addition.trim())return NextResponse.json({error:'선택한 규칙이 없습니다.'},{status:400});
  const step=ids.indexOf(id)+1;
  const maxChars=7000;
  const instruction=`너는 실제 CRPG 게임 엔진에 투입할 한국어 GM 프롬프트의 편집장이다. 이전까지 확정한 통합 규칙을 정사로 간주하고 새 선택을 반영해 전체 규칙집을 다시 편집한다. 5회 선택은 작성 과정일 뿐 최종 규칙 제목은 자유롭게 여러 개로 분리한다. 적합한 제목 예시: ${requiredTitles.join(', ')}. 제목은 # [제목] 형식. 이전 정보와 의미상 같은 규칙·사건·설명은 한 번만 유지하고, 추가 규칙은 기존 세력·인물·장소·사건과 인과적으로 연결한다. 기존 설정을 함부로 바꾸거나 삭제하지 않는다. 충돌하면 앞서 확정된 설정을 우선하고 새 정보는 모순되지 않게 조정한다. 'choices'는 행동 선택지 배열이지 신뢰도 저장소가 아니다. 신뢰·사건 상태는 플래그 또는 별도 상태로 기록하도록 서술한다. 메인 사건은 특정 세력의 신뢰도를 얻지 못해도 세계에서 발생해야 한다. 사건의 발동 조건·결과·NPC 이름을 보존한다. 게임 시스템은 실제 D20 판정, 피해, 회복, 성장, 기록을 다룬다. NPC 단계 이후 고유 NPC 최소 10명을 이름·성별·나이·소속·외형·목적·비밀과 함께 보존한다. NPC 성별과 외형은 추후 이미지 생성에 사용할 수 있게 구체적으로 남긴다. 사건 단계는 메인 사건, 독립 의뢰, 돌발 사건, 기연을 서로 다른 내용으로 설계하고 기연에는 단서→조사→시험→보상·대가를 넣는다. 최종 목표 단계는 기존 사건과 연동하되 플레이어 소속에 따라 여러 해결 경로를 허용한다. 최종 목표 제목 # [게임의 최종 목표] 아래 첫 줄은 반드시 '목표 요약: '으로 시작하는 30~100자의 단문으로 적고, 다음 줄부터 달성 조건·실패·결말을 작성한다. 목표 요약은 플레이어 HUD에 표시되므로 규칙이나 수치 장문을 넣지 않는다. 장르가 무협이면 시대에 맞지 않는 물건이나 어휘를 피한다. 이전 단계의 반복이나 의미 없는 미사여구를 제거한다. 완성본은 최종 5000~6000자를 목표로 하되 7000자는 절대 상한이다. 1~4단계에서는 남은 단계의 NPC·사건·목표를 위한 공간을 남긴다. 진행 단계별 전체 권장 분량은 1단계 900자, 2단계 1900자, 3단계 3400자, 4단계 4900자, 5단계 5600자다. 억지로 분량을 채우지 않는다. JSON {"prompt":"전체 통합 규칙"}만 출력한다.`;
  let prompt='';let feedback='';
  for(let attempt=0;attempt<2;attempt++){
   const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_PROMPT_MODEL||process.env.OPENAI_GM_MODEL||'gpt-4.1-mini',temperature:0.25,max_completion_tokens:11000,response_format:{type:'json_object'},messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify({step,stepId:id,genre:String(b.genre||''),gameName:String(b.gameName||''),previousIntegratedPrompt:previous,newSelectedRules:addition,revisionFeedback:feedback})}] }),signal:AbortSignal.timeout(105000),cache:'no-store'});
   const data=await r.json();if(!r.ok)throw Error(data?.error?.message||`OpenAI HTTP ${r.status}`);
   const parsed=JSON.parse(data?.choices?.[0]?.message?.content||'{}');prompt=String(parsed.prompt||'').trim();
   const valid=prompt.length<=maxChars && prompt.includes('# [') && (id!=='goal'||/목표 요약\s*[:：]/.test(prompt)) && (id!=='npc'||(prompt.match(/\[(?:남성|여성)\]/g)||[]).length>=10);
   if(valid)break;
   feedback=`기존 결과 ${prompt.length}자. 7000자 이하, 단계별 고유 규칙, NPC 10명 이상, 최종 목표 요약을 검증하고 다시 편집하세요. 기존 정보를 보존하되 반복을 제거하세요.`;
  }
  if(!prompt||prompt.length>maxChars)return NextResponse.json({error:'AI 통합본이 7,000자를 초과하거나 비어 있습니다. 다시 시도해 주세요. 이전 선택은 보존됩니다.'},{status:422});
  if(id==='goal'&&!/목표 요약\s*[:：]/.test(prompt))return NextResponse.json({error:'최종 목표 요약이 누락되었습니다. 다시 시도해 주세요.'},{status:422});
  if(id==='npc'&&(prompt.match(/\[(?:남성|여성)\]/g)||[]).length<10)return NextResponse.json({error:'NPC 성별 정보가 10명 미만입니다. 다시 시도해 주세요.'},{status:422});
  return NextResponse.json({prompt,length:prompt.length});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'규칙 통합 실패'},{status:500});}
}
