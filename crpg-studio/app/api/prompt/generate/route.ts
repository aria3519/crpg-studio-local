import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 120;

const allowed = new Set(['foundation','system','story','role','world','player','flow','goal','npc','factions','map','checks','combat','growth','items','economy','quests','time','survival','failure','dice','religion','ending','events']);
const sections: Record<string,string> = {
 foundation:'GM의 역할과 장면 출력 규칙, 주인공의 자유, 세계의 역사/세력/장소, 시작 신분과 첫 임무를 압축해 정의. 무협이면 정통 무협체, 다른 장르면 해당 장르를 따른다. 뒤 단계의 전투/NPC 목록/메인 사건을 미리 작성하지 않는다.',
 system:'장면·시간·이동·플래그·NPC 독립 행동·인벤토리의 실제 운용 규칙, D20 난이도·턴·공격·방어·피해·회복·패배, 장르에 맞는 성장·경제·초기 장비를 구체적 수치와 함께 작성한다. 세계관이나 시작 상황을 다시 설명하지 않는다.',
 npc:'최소 10명, 권장 12~18명의 NPC. 각자 고유 이름, 나이, 남/여 성별, 소속·역할, 외형, 목적, 갈등/비밀. 동일 목적·외형 반복 금지. 앞서 정한 세력·장소와 연결하고 장기 사건에 활용 가능한 갈등을 준다.',
 story:'앞서 확정된 NPC와 장소를 활용한 3~5막 메인 사건, 각 막의 발동 조건·단서·결과, 2~4개 독립 의뢰, 4~6개 돌발 사건, 3~5개 기연의 단서→시험→보상·대가. 메인 사건을 돌발 사건에 재등장시키지 않는다.',
 goal:'앞서 확정한 사건과 NPC에 연결된 최종 목표, 달성 판정, 실패·부분 성공·분기 엔딩과 후일담/계속 플레이. 이미 작성한 사건의 줄거리를 재서술하지 않는다.',
 world:'서로 다른 세계관 후보 3개',
};
// Recommendations remain detailed. Compression is performed only after all 10 choices.
const sectionTargets: Record<string,number> = {foundation:900,system:1000,npc:1500,story:1500,goal:600};
const angles = [
 '1안: 정통적인 인과관계, 정치·사회·인물의 이해관계에 집중. 기존 설정을 보존하면서 현실적인 대가와 관계 변화를 설계한다.',
 '2안: 탐색·발견·기연, 예상 밖의 장소와 단서에 집중. 기존 설정을 보존하면서 선택 가능한 탐사 경로를 설계한다.',
 '3안: 음모·위험·배신·불완전한 정보에 집중. 기존 설정을 보존하면서 실패와 반전의 인과관계를 설계한다.'
];
type NPC = {name?:unknown;age?:unknown;affiliation?:unknown;appearance?:unknown;gender?:unknown;goal?:unknown;conflict?:unknown};
function formatNPC(n:NPC){
 const name=String(n.name||'').trim();
 if(!name)return '';
 const age=String(n.age||'').trim();
 return `${name}${age?`(${age})`:''} [${String(n.gender||"미설정").trim()}] — ${String(n.affiliation||'').trim()}. ${String(n.appearance||'').trim()}; ${String(n.goal||'').trim()}; ${String(n.conflict||'').trim()}.`;
}
function clean(s:string){return s.trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').replace(/^[\s"']+|[\s"']+$/g,'').replace(/(?:\s*[}\]]\s*){3,}$/g,'').trim();}
async function completion(messages:{role:string;content:string}[],maxTokens:number){
 const controller = new AbortController();
 const timeout=setTimeout(()=>controller.abort(),105000);
 try{
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_PROMPT_MODEL||process.env.OPENAI_GM_MODEL||'gpt-4.1-mini',temperature:0.85,max_completion_tokens:maxTokens,response_format:{type:'json_object'},messages}),signal:controller.signal,cache:'no-store'});
  const data=await r.json();
  if(!r.ok)throw Error(`OpenAI API ${r.status}: ${String(data?.error?.message||'호출 실패')}`);
  const content=data?.choices?.[0]?.message?.content;
  if(typeof content!=='string'||!content.trim())throw Error('AI 응답이 비어 있습니다.');
  return JSON.parse(content);
 }finally{clearTimeout(timeout);}
}
export async function POST(request:Request){
 if(!process.env.OPENAI_API_KEY?.trim())return NextResponse.json({error:'OPENAI_API_KEY가 없습니다. .env.local을 확인하세요.'},{status:503});
 try{
  const body=await request.json();
  const id=String(body.sectionId||'');
  if(!(allowed.has(id)||/^custom-[a-zA-Z0-9_-]{1,100}$/.test(id)))return NextResponse.json({error:'유효하지 않은 규칙 항목입니다.'},{status:400});
  const isPicker=id==='world'&&String(body.sectionName||'').includes('후보');
  const previous=Array.isArray(body.otherSections)?body.otherSections.filter((x:{text?:string})=>x?.text).slice(0,20).map((x:{name?:string;text?:string})=>({name:String(x.name||'').slice(0,100),text:String(x.text||'').slice(0,5000)})):[];
  const targetChars=sectionTargets[id]||650;
  const integratedPrompt=String(body.integratedPrompt||'').slice(0,9000);
  const base={targetChars,gameName:String(body.gameName||'').slice(0,100),genre:String(body.genre||'').slice(0,150),description:String(body.gameDescription||'').slice(0,700),section:String(body.sectionName||'').slice(0,100),guide:String(body.guide||'').slice(0,450),fixedRules:previous,integratedPrompt,previousRejected:Array.isArray(body.previous)?body.previous.slice(0,3).map((v:unknown)=>String(v).slice(0,500)):[],finalGoalMode:body.finalGoalMode==='progress'?'progress':'single'};
  const system=`너는 한국어 장기 CRPG의 수석 게임 디자이너다. 사용자가 제공한 정통 무협 GM 예시처럼 추상적 미사여구 없이 실제 플레이 가능한 구체적인 규칙을 설계한다. 앞서 선택된 규칙과 통합 프롬프트는 확정된 정사다. 통합 프롬프트가 있다면 이를 최우선으로 참조한다. 이전 내용을 반복 설명하지 말고 고유명사만 참조한다. 매 단계는 자신의 담당 범위만 작성한다. 전체 다섯 단계가 약 5,000~6,000자, 절대 7,000자 이하로 끝나도록 정보 밀도를 높인다. 1단계 foundation=GM 역할·세계관·시작, 2단계 system=시간·정합성·D20 전투·성장·경제·소지품, 3단계 npc=최소 10명의 성별·외형·목표·비밀과 관계, 4단계 story=조건부 3~5막·독립 의뢰·돌발 사건·기연, 5단계 goal=달성 조건·결말만. 이전 단계의 줄거리를 다시 소개하지 않는다. story의 돌발 사건은 메인 사건의 재서술이 아닌 별개의 사건이다. NPC의 성별은 명시적으로 남성 또는 여성으로 작성하고, 이름·나이·소속·고유 외형을 일관되게 유지한다. 판정은 불확실성과 대가가 있을 때만 수행하고 플레이어의 생각·대사를 대신 확정하지 않는다. 장르가 무협이면 현대적 물건과 시스템 용어를 섞지 않는다. 고유명사·사건 발동 조건·실패 결과·수치가 있는 간결한 문장을 사용한다. JSON 객체만 출력한다.`;
  if(isPicker){
   const parsed=await completion([{role:'system',content:system+' JSON {"options":["...","...","..."]} 형태. 각 후보는 서로 다른 세계관으로 100자 이내 한 줄.'},{role:'user',content:JSON.stringify(base)}],650);
   const opts=Array.isArray(parsed.options)?parsed.options.map((v:unknown)=>clean(String(v)).slice(0,100)):[];
   if(opts.length!==3)return NextResponse.json({error:'세계관 추천안 생성에 실패했습니다.'},{status:502});
   return NextResponse.json({options:opts});
  }
  const outputs=await Promise.all(angles.map(async(angle,index)=>{
   const npc=id==='npc';
   const instruction=`현재 항목 ${id}: ${sections[id]||String(body.guide||'장르에 맞는 구체적 규칙')}.\n${angle}\n최종 전체 5단계는 5,000~6,000자를 목표로 한다. 이번 항목은 대략 ${targetChars}자 분량의 새로운 정보에 집중하며 강제 상한은 없다. 구체적 사실과 실행 규칙을 우선한다. 다른 안의 문장을 재활용하지 않는다. 각 문장마다 이 항목만의 새로운 규칙·수치·사건 조건을 담는다. 기존 문장의 단어만 바꾼 반복은 금지한다. ${npc?'반드시 JSON {"npcs":[{"name":"이름","age":"나이","affiliation":"소속/역할","appearance":"외형","gender":"남성 또는 여성","goal":"목표","conflict":"갈등 또는 비밀"}, ...]} 형식으로 12~18명의 서로 다른 NPC 객체를 출력한다. 이름이 다른 고유 NPC 10명 이상을 생성한다. 인물별 설명은 한 줄에 핵심만 남기고 각각 70~100자 정도로 압축한다. NPC 목록은 12~18명으로 구성하며 중복 인물 없이 고유한 목적과 사건 연결을 보존한다.':'반드시 JSON {"text":"규칙 본문"} 형식으로 출력한다. 번호/제목 없이 정보 밀도 높은 구체적인 규칙을 작성한다. 단순한 문장 반복이나 강제 분량 맞추기는 금지한다.'}`;
   let parsed=await completion([{role:'system',content:system+'\n'+instruction},{role:'user',content:JSON.stringify({...base,variant:index+1})}],npc?3800:2600);
   if(!npc){
    const priorText=previous.map(x=>x.text).join('\n');
    const repeated=(text:string)=>text.split(/[.!?。\n]/).map(x=>x.trim()).filter(x=>x.length>=35&&priorText.includes(x));
    const first=String(parsed.text||'');
    const duplicates=repeated(first);
    if(duplicates.length){
     parsed=await completion([{role:'system',content:system+'\n'+instruction+'\n이전 확정 규칙과 겹치는 문장을 반드시 제거하고 해당 단계의 새 정보만 작성한다.'},{role:'user',content:JSON.stringify({...base,variant:index+1,rejectedDraft:first,duplicatedSentences:duplicates.slice(0,12)})}],1500);
    }
   }
   if(npc){
    let arr=Array.isArray(parsed.npcs)?parsed.npcs as NPC[]:[];
    let names=new Set(arr.map(x=>String(x.name||'').trim()).filter(Boolean));
    if(names.size<10){
     const extra=await completion([{role:'system',content:system+' JSON {"npcs":[...]} 형식으로 누락된 고유 NPC만 생성한다. 이름, 나이, 소속/역할, 외형, 목표, 갈등/비밀을 모두 채운다.'},{role:'user',content:JSON.stringify({...base,existingNames:[...names],needed:12-names.size,variant:index+1})}],1400);
     if(Array.isArray(extra.npcs))arr=[...arr,...extra.npcs];
    }
    const unique: NPC[]=[];names=new Set();
    for(const n of arr){const key=String(n.name||'').trim();if(!key||names.has(key))continue;names.add(key);unique.push(n);}
    if(unique.length<10)throw Error(`NPC ${index+1}안에 고유 인물이 ${unique.length}명만 생성되었습니다. 다시 시도해 주세요.`);
    const lines=unique.slice(0,18).map(formatNPC);
    const joined=lines.join('\n');
    return joined;
   }
   const t=clean(String(parsed.text||''));
   if(t.length<60)throw Error(`${index+1}안의 규칙 내용이 부족합니다. 다시 생성해 주세요.`);
   if(id==='system'&&!(/(주사위|D20|d20|2D6|확률|판정)/i.test(t)&&/(공격|방어|전투)/.test(t)&&/(피해|부상|회복)/.test(t)))throw Error(`${index+1}안에 실제 전투 판정·공격·피해 규칙이 누락되었습니다. 다시 생성해 주세요.`);

   return t;
  }));
  return NextResponse.json({options:outputs});
 }catch(e){const message=e instanceof Error?e.message:'규칙 생성 실패';console.error('[prompt/generate]',message);return NextResponse.json({error:message},{status:500});}
}
