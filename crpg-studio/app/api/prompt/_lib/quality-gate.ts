export const IMMUTABLE_GENRE_RULES:Record<string,string>={
 '정통 무협':'구파일방은 문파 집합, 오대세가는 가문 집합이며 서로 포함 관계가 아니다. 소림 수장은 방장, 무당·화산 수장은 장문인, 세가 수장은 가주다. 당가는 당씨 가문이다. 무당 본산은 도관이지 산채가 아니다. 천마는 마교 관련 호칭이다. 경지 순서는 삼류→이류→일류→절정→초절정→화경→현경→생사경→자연경. 문·은자(1은자=100문), 내공·외공·경공·무공을 구분한다.',
 '정통 판타지':'국가·귀족·기사단·길드는 서로 다른 유형이다. 종족과 직업을 구분한다. 마법에는 시전 조건·제약·대가가 따른다. 모험가 공인 등급은 F→E→D→C→B→A→S→SS→SSS이며 전투력과 구분하고 길드 심사로 승급한다. 100동화=1은화, 100은화=1금화.',
 '현대 게이트·헌터':'현대 대한민국. 정부는 법·재난 대응, 협회는 등록·평가·감독, 길드는 고용·공략 담당. 헌터 공인 등급 F→E→D→C→B→A→S. 게이트 위험도와 헌터 등급은 별개. 재각성·재평가에는 구체적인 선행 사건과 조건이 필요하다. 통화는 원화이며 스킬에 사용 조건·제약·소모가 있다.'
};
export const CREATIVE_COUNTS:Record<string,number>={'주요 NPC와 관계':9,'메인 사건':3,'독립 의뢰와 인연':4,'돌발 사건':3,'기연':3};
export type GateIssue={section:string;problem:string};
// Accept common Korean chapter headings without mistaking sub-bullets for entries.
function entryMatches(value:string,section:string):RegExpMatchArray[]{
 const normalized=value.replace(/\r\n?/g,'\n');
 const pattern=section==='메인 사건'
  ? /^\s*(?:#{1,5}\s*)?(?:\*\*)?(?:제\s*)?(\d+)\s*(?:막|장|부)\s*(?:[:：.\-–]|\*\*|\s)\s*(.+)$/gm
  : /^\s*(?:#{1,5}\s*)?(?:\*\*)?(\d+)\s*[.)．、:]\s*(.+)$/gm;
 return [...normalized.matchAll(pattern)].filter(m=>!!m[2]?.trim());
}
export function itemLabels(value:string,section?:string):string[]{
 const kind=section||(/(?:^|\n)\s*(?:제\s*)?\d+\s*막/.test(value)?'메인 사건':'기타');
 return entryMatches(value,kind).map(m=>m[2].trim().replace(/\*\*/g,'').split(/[(:：\-]/)[0].trim());
}
export function countEntries(value:string,section:string):number{
 return new Set(entryMatches(value,section).map(m=>Number(m[1]))).size;
}
export function validateSection(section:string,value:string,genre:string):GateIssue[]{
 const issues:GateIssue[]=[];
 if(!value.trim())return [{section,problem:'섹션이 비어 있습니다.'}];
 const expected=CREATIVE_COUNTS[section];
 if(expected&&countEntries(value,section)<expected)issues.push({section,problem:`${section} 항목 ${expected}개 필요, 현재 ${countEntries(value,section)}개`});
 if(genre==='정통 무협'){
  const patterns:[RegExp,string][]=[[/구파일방[^\n]{0,65}(?:오대세가를?\s*포함|세가를?\s*포함)/,'구파일방에 오대세가를 포함시킴'],[/(?:남궁|제갈|당가|사천당가)[^\n]{0,20}(?:문주|장문인)/,'세가 수장의 직함 오류'],[/(?:무당파|화산파)[^\n]{0,25}문주/,'문파 장문인의 직함 오류'],[/소림[^\n]{0,22}(?:문주|주지)/,'소림 수장은 방장으로 표기'],[/무당[^\n]{0,24}(?:본산\s*산채|산채)/,'무당 본산을 산채로 표기'],[/천마산채[^\n]*/,'천마를 사파 산채 명칭에 사용'],[/구파일방\s*(?:오대세가|남궁|제갈|사천당가)/,'문파와 세가를 같은 집합으로 표기']];
  for(const [re,problem] of patterns)if(re.test(value))issues.push({section,problem});
 }
 // '사건:이름:상태' can be a legitimate structured value. Validate only empty keys/values.
 if(/(?:addFlags\s*[:=]\s*)?(?:막|대사건|소속|경지|무공|관계|약속|은원|단서|의뢰|사건|기연|재물)\s*:\s*(?=$|[,，\n])/m.test(value))issues.push({section,problem:'내용이 비어 있는 플래그'});
 return issues;
}
export function preserveCreativeItems(section:string,before:string,after:string):boolean{
 if(!after.trim())return false;
 const oldLabels=itemLabels(before,section),newLabels=itemLabels(after,section);
 if(CREATIVE_COUNTS[section]&&countEntries(after,section)<CREATIVE_COUNTS[section])return false;
 if(oldLabels.length && newLabels.length<oldLabels.length)return false;
 if(oldLabels.length && oldLabels.some((label,i)=>!newLabels[i]||newLabels[i]!==label))return false;
 return true;
}
export function validateDocument(parts:Record<string,string>,genre:string):GateIssue[]{
 const issues=Object.entries(parts).flatMap(([k,v])=>validateSection(k,v,genre));
 const main=parts['메인 사건']||'',quests=parts['독립 의뢰와 인연']||'',fortunes=parts['기연']||'';
 const normalize=(s:string)=>s.replace(/\s+/g,'').replace(/^(?:\d+막|\d+[.)])[:：]?/,'');
 const names=(s:string,kind:string)=>itemLabels(s,kind).map(normalize).filter(x=>x.length>5);
 for(const q of names(quests,'독립 의뢰와 인연'))if(names(main,'메인 사건').some(m=>m.includes(q)||q.includes(m)))issues.push({section:'독립 의뢰와 인연',problem:`메인 사건과 의뢰 소재 중복: ${q}`});
 for(const f of names(fortunes,'기연'))if(names(quests,'독립 의뢰와 인연').some(q=>q.includes(f)||f.includes(q)))issues.push({section:'기연',problem:`의뢰와 기연 중복: ${f}`});
 return issues;
}
