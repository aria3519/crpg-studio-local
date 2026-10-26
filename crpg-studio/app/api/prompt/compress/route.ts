import { NextResponse } from 'next/server';
export const runtime='nodejs';
export const maxDuration=120;
type Section={title:string;text:string};
export async function POST(request:Request){
 if(!process.env.OPENAI_API_KEY?.trim())return NextResponse.json({error:'OPENAI_API_KEY가 없습니다.'},{status:503});
 try{
  const body=await request.json();
  const sections:Section[]=Array.isArray(body.sections)?body.sections.filter((x:Section)=>typeof x?.title==='string'&&typeof x?.text==='string'&&x.text.trim()).slice(0,30):[];
  if(sections.length<5)return NextResponse.json({error:'5개 기본 규칙이 완성된 후 압축할 수 있습니다.'},{status:400});
  const original=sections.map(s=>`# [${s.title}]\n\n${s.text.trim()}`).join('\n\n');
  const instructions=`너는 한국어 장기 RPG 시스템 프롬프트의 정합성 편집자다. 입력은 사용자가 이미 확정한 규칙이며 임의로 설정을 바꾸거나 사건·인물을 삭제해서는 안 된다. 최종 규칙 제목은 5개 선택 항목에 고정하지 않고 내용에 맞게 세부 제목으로 나누어 재배치한다. 인물은 이름, 나이, 소속, 목적, 비밀을 유지하고 고유 NPC가 최소 10명 존재하도록 보존한다. 장기 사건의 조건·분기·결과, 기연, 전투 수치, 시작 장비, 주요 장소를 보존한다. 이미 확정된 내용을 다른 항목에서 재서술하지 않는다. 의미 중복과 불필요한 수식어를 제거하되 단계별 필수 규칙은 유지한다. 게임 시스템 항목에는 반드시 실제 판정 방식, 전투, 피해, 회복이 존재해야 한다. 문장을 나열식으로 간결하게 고치되 핵심 정보의 누락을 피한다. 최종 길이는 공백 포함 5000~6000자를 목표로 하되 절대 상한은 7000자다. 6000자 이하는 목표일 뿐 필수 설정을 보존하려면 6001~7000자도 허용한다. 5000자를 억지로 채우거나 6000자를 맞추려고 핵심 설정을 삭제하지 않는다. 중복을 제거하고 세부 제목을 나눈다. 항목별 책임을 분리한다: 세계관과 기본 규칙=GM/배경/시작, 게임 시스템=시간/기록/전투/성장/경제, 주요 NPC와 관계=인물 목록, 메인 사건과 의뢰·기연=메인 사건/독립 의뢰/돌발 사건/기연, 게임의 최종 목표=달성 조건/결말. 다른 항목의 설명을 반복하지 않는다. 원문에서 같은 뜻의 문장이 반복되면 단 한 번만 남긴다. 이미 확정된 세력·장소·NPC는 최초 정의한 항목 외에서는 이름으로만 참조한다. 탐색 규칙이 전투 항목을 대체하는 등 항목 내용이 잘못 들어간 경우 올바른 항목으로 재배치한다. 반드시 JSON {"prompt":"완성된 프롬프트"} 형태로 응답한다.`;
  let feedback='';
  let prompt='';
  for(let attempt=0;attempt<2;attempt++){
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_PROMPT_MODEL||process.env.OPENAI_GM_MODEL||'gpt-4.1-mini',temperature:0.25,max_completion_tokens:12500,response_format:{type:'json_object'},messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify({genre:String(body.genre||'').slice(0,150),original,sectionTitles:sections.map(s=>s.title),revisionFeedback:feedback})}] }),signal:AbortSignal.timeout(110000),cache:'no-store'});
  const result=await response.json();
  if(!response.ok)return NextResponse.json({error:result?.error?.message||'AI 압축 호출 실패'},{status:502});
  const parsed=JSON.parse(result?.choices?.[0]?.message?.content||'{}');
  prompt=String(parsed.prompt||'').trim();
  if(!prompt)return NextResponse.json({error:'AI가 압축 결과를 반환하지 않았습니다.'},{status:502});
  const missing=sections.filter(s=>!prompt.includes(`# [${s.title}]`)).map(s=>s.title);
  if(!missing.length&&prompt.length<=7000)break;
  feedback=`이전 결과는 ${prompt.length}자이고 누락 항목은 ${missing.join(', ')||'없음'}입니다. 7,000자 이하로 압축하면서 5개 항목과 NPC 10명 이상을 반드시 보존하세요. 반복을 먼저 삭제하고 설정을 유지하세요.`;
  }
  const missing=sections.filter(s=>!prompt.includes(`# [${s.title}]`)).map(s=>s.title);
  if(missing.length)return NextResponse.json({error:`최종 결과에서 누락된 규칙 항목: ${missing.join(', ')}. 원본은 유지됩니다.`},{status:422});
  if(prompt.length>7000)return NextResponse.json({error:`최종 ${prompt.length}자로 최대 7,000자를 초과했습니다. 원본은 유지됩니다.`},{status:422});
  return NextResponse.json({prompt,originalLength:original.length,finalLength:prompt.length});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'압축 실패'},{status:500});}
}
