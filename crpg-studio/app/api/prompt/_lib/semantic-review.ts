export type Issue={code:string;severity:'critical'|'major'|'minor';section:string;detail:string;evidence:string};
export type Patch={section:string;oldText:string;newText:string;reason:string};
export type Review={passed:boolean;issues:Issue[];patches:Patch[]};
const ALLOWED=['독립 의뢰','돌발 사건','기연','시작 조건'];
const sections=(prompt:string)=>{const out=new Map<string,string>();const re=/^# \[([^\]]+)\]\n/gm;const heads=[...prompt.matchAll(re)];for(let i=0;i<heads.length;i++){const h=heads[i];const start=h.index!+h[0].length;const end=i+1<heads.length?heads[i+1].index!:prompt.length;out.set(h[1],prompt.slice(start,end).trimEnd());}return out;};
export function applySafePatches(prompt:string,patches:Patch[]){let result=prompt;let applied=0;for(const p of patches.slice(0,8)){
 if(!ALLOWED.includes(p.section)||!p.oldText||!p.newText||p.newText.length>p.oldText.length+120||p.newText.includes('# [')||p.newText.includes('```'))continue;
 const map=sections(result),body=map.get(p.section);if(!body||body.split(p.oldText).length!==2)continue;
 const replacement=body.replace(p.oldText,p.newText);const header=`# [${p.section}]\n`;const original=header+body; if(!result.includes(original))continue;
 const next=result.replace(original,header+replacement);if(next.length>7000)continue;result=next;applied++;
 }
 return {prompt:result,applied};
}
export function protectedContentUnchanged(before:string,after:string){const a=sections(before),b=sections(after);return [...a.keys()].every(k=>ALLOWED.includes(k)||a.get(k)===b.get(k));}
export function structuralReview(prompt:string,baseline:string,required:{selectedMain:string;expectedNpcCount?:number;check:{[k:string]:unknown}}){
 const issues:Issue[]=[];const p=sections(prompt),b=sections(baseline);
 if(prompt.length>7000)issues.push({code:'LENGTH',severity:'critical',section:'전체',detail:'7,000자 초과',evidence:String(prompt.length)});
 for(const [key,value] of b)if(!ALLOWED.includes(key)&&p.get(key)!==value)issues.push({code:'PROTECTED_CHANGED',severity:'critical',section:key,detail:'고정 규칙·NPC·메인 사건이 변경됨',evidence:key});
 for(const [key,min] of [['NPC와 비밀',required.expectedNpcCount||10],['독립 의뢰',4],['돌발 사건',6],['기연',3]] as const){const text=p.get(key)||'';const count=(text.match(/^\d+\. /gm)||[]).length;if(count!==min)issues.push({code:'COUNT',severity:'critical',section:key,detail:`항목 ${min}개 필요`,evidence:String(count)});}
 for(const [key,v] of Object.entries(required.check))if(typeof v==='boolean'&&!v)issues.push({code:'SOURCE',severity:'critical',section:key,detail:'원본 설계 검증 실패',evidence:key});
 if(!p.get('메인 사건')?.includes(required.selectedMain))issues.push({code:'MAIN',severity:'critical',section:'메인 사건',detail:'선택 메인 사건 누락',evidence:required.selectedMain});
 return issues;
}
export function parseReview(raw:string):Review{
 const cleaned=raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');const data=JSON.parse(cleaned);
 if(!data||typeof data!=='object'||!Array.isArray(data.issues)||!Array.isArray(data.patches)||typeof data.passed!=='boolean')throw Error('AI 검증 결과 형식 오류');
 const issues=data.issues.slice(0,30).map((x:Record<string,unknown>)=>({code:String(x.code||'SEMANTIC'),severity:(['critical','major','minor'].includes(String(x.severity))?x.severity:'major') as Issue['severity'],section:String(x.section||'전체'),detail:String(x.detail||'').slice(0,400),evidence:String(x.evidence||'').slice(0,200)}));
 const patches=data.patches.slice(0,8).map((x:Record<string,unknown>)=>({section:String(x.section||''),oldText:String(x.oldText||''),newText:String(x.newText||''),reason:String(x.reason||'')}));
 return {passed:data.passed&&issues.every(x=>x.severity==='minor'),issues,patches};
}
