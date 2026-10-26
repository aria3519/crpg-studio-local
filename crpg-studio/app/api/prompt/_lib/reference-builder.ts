import reference from './genre-reference.json';

type Genre=keyof typeof reference;
type Choice={id:string;keyword:string;title?:string};
const genres=Object.keys(reference) as Genre[];
// Each main story is staged in a fixed city.
const cityMap:Record<Genre,number[]>={'정통 무협':[2,0,1],'정통 판타지':[0,2,1],'현대 게이트·헌터':[0,0,2]};
const hash=(s:string)=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const rank=<T>(xs:T[],seed:number)=>xs.map((v,i)=>({v,s:hash(`${seed}:${i}`)})).sort((a,b)=>a.s-b.s).map(x=>x.v);
const nameOf=(line:string)=>line.split(':')[0].trim();
const personName=(line:string)=>line.replace(/^\[GM\]\s*/,'').split('(')[0].trim();
const factionOf=(line:string,names:string[])=>{
 const head=line.split(') ').slice(1).join(') ').split(/[。.]/)[0];
 return names.find(n=>head.startsWith(n+' ')||head.startsWith(n+'·')||head===n)||(line.startsWith('[GM]')?names.find(n=>line.includes(`비밀: ${n}`)||line.includes(`${n} 첩자`)||line.includes(`${n} 강경파`)):null)||null;
};
const tokens=(s:string)=>s.replace(/\s+/g,'').replace(/[^가-힣a-zA-Z0-9]/g,'');
function locationMap(locations:string[]){
 const map:Record<string,string>={};
 for(const line of locations){const m=line.match(/^\{([a-zA-Z]+)\}\s+(.+?)\([^)]*\):/);if(m)map[m[1]]=m[2].trim();}
 return map;
}
function hasBatchim(s:string){const c=s.trim().charCodeAt(s.trim().length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28!==0;}
function materialize(text:string,loc:Record<string,string>,identity:Record<string,string>={}){
 return text.replace(/\{([a-zA-Z]+)\}(가|이|은|는|을|를)?/g,(match,key:string,suffix:string='')=>{
  const name=identity[key]??loc[key];
  if(!name)throw Error(`알 수 없는 자리 표시: ${match}`);
  if(suffix==='가'||suffix==='이')return name+(hasBatchim(name)?'이':'가');
  if(suffix==='은'||suffix==='는')return name+(hasBatchim(name)?'은':'는');
  if(suffix==='을'||suffix==='를')return name+(hasBatchim(name)?'을':'를');
  return name;
 });
}
function exclusiveForNpc(line:string){const m=line.match(/\(전용:\s*([^)]*)\)/);return m?m[1].split(',').map(s=>s.trim()):[];}
function startName(s:string){return s.split(':')[0].trim();}
function materialMeta(s:string){
 const required=(s.match(/\(필요 세력:\s*([^)]*)\)/)?.[1]||'').split(',').map(x=>x.trim()).filter(Boolean);
 const excluded=(s.match(/\(제외 시작 신분:\s*([^)]*)\)/)?.[1]||'').split(',').map(x=>x.trim()).filter(Boolean);
 return {required,excluded};
}
function cleanMaterial(s:string){return s.replace(/\s*\((?:필요 세력|제외 시작 신분):[^)]*\)/g,'');}
function cleanStart(s:string){return s.split('\n').filter(x=>!x.trim().startsWith('조립 메모')&&!/^\s*\{(?:token|clan|clanWeapon)\}\s*=/.test(x)).join('\n').trim();}
const settingTag=(s:string)=>{
 const tags=['노름','투기장','독','약','비급','검보','암살','습격','호위','고분','석굴','배','수적','표국','열병','관부','장터','도적','마정석','게이트','의식','연회','아이','실종'];
 return tags.filter(t=>s.includes(t));
};
function varied(items:string[],seed:number,count:number,main:string,city:Record<string,string>,previous:string[]=[],excluded:string[]=[],groups:string[][]=[],selectedFactions:string[]=[],startIdentity='',identity:Record<string,string>={}){
 const out:string[]=[];const used=new Map<string,number>();const tagUse=new Map<string,number>();
 const reserved=[main,...previous];
 const eligible=items.filter(item=>{
  const title=item.split(':')[0].trim();const meta=materialMeta(item);
  if(excluded.includes(title))return false;
  if(meta.required.some(f=>!selectedFactions.includes(f)))return false;
  if(meta.excluded.includes(startIdentity))return false;
  if(/\{token\}/.test(item)&&!identity.token)return false;
  if(groups.some(g=>g.includes(title)&&g.some(t=>reserved.some(r=>r.startsWith(t+':')))))return false;
  return true;
 });
 const chosen=(item:string)=>{
  const title=item.split(':')[0].trim();
  if(groups.some(g=>g.includes(title)&&g.some(t=>out.some(r=>r.startsWith(t+':')))))return false;
  return true;
 };
 for(const item of rank(eligible,seed)){
  if(!chosen(item))continue;
  const rendered=materialize(cleanMaterial(item),city,identity);const tags=settingTag(rendered);const locs=Object.values(city).filter(v=>rendered.includes(v));
  const overlap=tags.filter(t=>reserved.some(x=>x.includes(t)));
  if(locs.some(l=>(used.get(l)||0)>=2)||tags.some(t=>(tagUse.get(t)||0)>=2)||overlap.length>=2)continue;
  out.push(rendered);reserved.push(rendered);
  for(const l of locs)used.set(l,(used.get(l)||0)+1);
  for(const tag of tags)tagUse.set(tag,(tagUse.get(tag)||0)+1);
  if(out.length===count)break;
 }
 for(const item of rank(eligible,seed+1)){
  if(out.length>=count)break;
  if(!chosen(item))continue;
  const rendered=materialize(cleanMaterial(item),city,identity);
  if(!out.includes(rendered))out.push(rendered);
 }
 if(out.length<count)throw Error(`조건을 충족하는 재료 부족: ${out.length}/${count}`);
 return out;
}
export function buildReferencePrompt(input:{genre:string;gameName:string;gameDescription:string;choices:Choice[];goalMode?:string;mainName?:string;startName?:string}){
 const genre=genres.find(k=>input.genre.includes(k));if(!genre)throw Error('지원하지 않는 장르입니다.');
 const src=reference[genre];const seed=hash([genre,input.gameName,input.gameDescription,input.mainName||'',input.startName||'',...input.choices.map(c=>c.keyword)].join('|'));
 // The creator's picks win; the seed only fills in what was not chosen.
 const main=src.mains.find(m=>m.name===input.mainName)||src.mains[seed%src.mains.length];const mainIndex=src.mains.indexOf(main);
 const city=src.cities[cityMap[genre][mainIndex]];const loc=locationMap(city.locations);
 const requiredNames=(main.text.match(/^필수 NPC:\s*(.+)$/m)?.[1]||'').split(',').map(x=>x.trim());
 const requiredFactions=(main.text.match(/^필요 세력:\s*(.+)$/m)?.[1]||'').split(',').map(x=>x.trim());
 const allFactions=src.factions.map(nameOf);
 const required=src.factions.filter(f=>requiredFactions.includes(nameOf(f)));
 const factionCandidates=rank(src.factions.filter(f=>!required.includes(f)),seed+3);
 const factions=[...required];
 // Prefer factions with available NPC representation; keep each selected faction represented.
 for(const f of factionCandidates){if(factions.length>=6)break;const n=nameOf(f);if(src.npcs.some(p=>factionOf(p,allFactions)===n&&(!exclusiveForNpc(p).length||exclusiveForNpc(p).includes(main.name))))factions.push(f);}
 const selectedNames=factions.map(nameOf);
 const eligibleNpcs=src.npcs.filter(p=>{const only=exclusiveForNpc(p);return !only.length||only.includes(main.name);});
 const npcRequired=eligibleNpcs.filter(p=>requiredNames.includes(personName(p)));
 const picked=[...npcRequired];
 for(const faction of selectedNames){if(picked.some(p=>factionOf(p,allFactions)===faction))continue;
  const candidates=rank(eligibleNpcs.filter(p=>factionOf(p,allFactions)===faction&&!picked.includes(p)),seed+7);
  if(candidates[0])picked.push(candidates[0]);
 }
 // Avoid NPCs explicitly required by other main stories unless also required here.
 const otherMainNames=new Set(src.mains.filter(m=>m!==main).flatMap(m=>(m.text.match(/^필수 NPC:\s*(.+)$/m)?.[1]||'').split(',').map(s=>s.trim())));
 const extras=rank(eligibleNpcs.filter(p=>!picked.includes(p)&&!otherMainNames.has(personName(p))&&(!factionOf(p,allFactions)||selectedNames.includes(factionOf(p,allFactions)!))),seed+9);
 for(const p of extras){if(picked.length>=10)break;picked.push(p);}
 // Never fabricate a filler NPC. A smaller cast is preferable to an inconsistent character.
 const npcs=picked.slice(0,10).map(p=>p.replace(/\s*\(전용:[^)]*\)/g,''));
 const starts=rank(src.starts,seed+19);
 const rawStart=src.starts.find(s=>startName(s)===input.startName)||starts[0];const startIdentity=startName(rawStart);
 const identity:Record<string,string>={};
 if(genre==='정통 무협'){
  if(startIdentity==='문파 제자')identity.token='사문 신패';
  if(startIdentity==='표국 신참 표사')identity.token='표국 패';
  if(startIdentity==='몰락 세가의 서자'){
   identity.token='가문 옥패';
   const clans=['남궁세가','모용세가','제갈세가','사천당가','하북팽가'];
   identity.clan=clans[seed%clans.length];
   identity.clanWeapon=identity.clan==='하북팽가'?'도':identity.clan==='사천당가'?'암기 주머니':'검';
  }
 }
 const start=materialize(cleanStart(rawStart),loc,identity);
 const mainText=materialize(main.text.split('\n').filter(x=>!x.startsWith('이 사건과 함께 쓰지 않을 재료')).join('\n'),loc,identity);
 const exclusions=main.exclusions||[];const exclusiveGroups=src.exclusiveGroups||[];
 const quests=varied(src.quests,seed+11,4,mainText,loc,[],exclusions,exclusiveGroups,selectedNames,startIdentity,identity);
 const events=varied(src.events,seed+13,6,mainText,loc,quests,exclusions,exclusiveGroups,selectedNames,startIdentity,identity);
 const opportunities=varied(src.opportunities,seed+17,3,mainText,loc,[...quests,...events],exclusions,exclusiveGroups,selectedNames,startIdentity,identity);
 let fixed=src.fixed;
 // Remove duplicate realm list from the genre paragraph, retain it in the growth paragraph.
 if(genre==='정통 무협')fixed=fixed.replace(/경지는 삼류→이류→일류→절정→초절정→화경→현경→생사경→자연경\.\s*/,'');
 const goalLines=mainText.split('\n').filter(l=>l.startsWith('최종 목표('));
 const goal=goalLines.find(l=>l.startsWith(input.goalMode==='progress'?'최종 목표(진행도형)':'최종 목표(최종 목표형)'))||goalLines[0]||main.name;
 const compactMain=mainText.split('\n').filter(l=>!l.startsWith('최종 목표(')).join('\n');
 const format=(xs:string[])=>xs.map((s,i)=>`${i+1}. ${s}`).join('\n');
 const sections:[string,string][]=[
  ['장르 기본 규칙',fixed],['무대와 세력',`${city.name}: ${city.description}\n${format(factions)}`],
  ['주요 장소',format(city.locations.map(x=>x.replace(/^\{[a-zA-Z]+\}\s*/,'')))],['NPC와 비밀',format(npcs.map(n=>materialize(n,loc,identity)))],
  ['메인 사건',`${main.name}\n${compactMain}`],['독립 의뢰',format(quests)],
  ['돌발 사건',format(events)],['기연',format(opportunities)],
  ['시작 조건',`${start}\n첫 사건 계기: ${mainText.match(/^시작 계기:\s*(.+)$/m)?.[1]||''}`],
  ['사건 진행과 검증','메인 사건은 1~4막을 순서대로 진행한다. 선택한 세력과 NPC의 소속을 유지하고 등장하지 않는 메인 사건의 비밀은 도입하지 않는다. 돌발 사건은 현재 장소와 조건에 맞을 때만 발생하며 NPC의 비밀은 발각 조건이 충족된 뒤 공개한다. 등록된 맵과 현재 상태·플래그를 우선한다.'],
  ['게임 목표',goal.replace(/^최종 목표\([^)]+\):\s*/,'')],
 ];
 const compose=()=>sections.filter(x=>x[1]).map(([h,v])=>`# [${h}]\n${v}`).join('\n\n');
 let prompt=compose();
 if(prompt.length>7000){sections[2][1]=format(city.locations.slice(0,7).map(x=>x.replace(/^\{[a-zA-Z]+\}\s*/,'')));prompt=compose();}
 if(prompt.length>7000){sections[2][1]=format(city.locations.slice(0,5).map(x=>x.replace(/^\{[a-zA-Z]+\}\s*/,'')));prompt=compose();}
 if(prompt.length>7000){sections[9][1]='메인 사건 1~4막을 순서대로 진행하고 NPC 소속·비밀 발각 조건·현재 맵과 상태를 지킨다.';prompt=compose();}
 if(prompt.length>7000)throw Error(`원본 규칙과 사건을 보존하면 ${prompt.length}자로 7,000자를 초과합니다.`);
 if(/\{[a-zA-Z]+\}|조립 메모|\(전용:|\(필요 세력:|\(제외 시작 신분:/.test(prompt))throw Error('조립 전용 메타데이터 또는 자리 표시가 남았습니다.');
 const actualFactions=npcs.map(n=>factionOf(n,allFactions)).filter(Boolean);
 const check={fixed:prompt.includes(fixed),mainActs:[1,2,3,4].every(i=>prompt.includes(`${i}막`)),requiredNpcs:requiredNames.every(n=>npcs.some(p=>personName(p)===n)),requiredFactions:requiredFactions.every(n=>selectedNames.includes(n)),factionCoverage:selectedNames.every(n=>actualFactions.includes(n)),npcFactionConsistency:actualFactions.every(n=>selectedNames.includes(n!)),count:{npcs:npcs.length,quests:quests.length,events:events.length,opportunities:opportunities.length},length:prompt.length};
 if(Object.entries(check).some(([k,v])=>typeof v==='boolean'&&!v))throw Error('연결성 검증 실패: '+JSON.stringify(check));
 return {prompt,genre,seed,selectedMain:main.name,city:city.name,check,expectedNpcCount:npcs.length,contentOutline:{factions,locations:city.locations,npcs,main:[main.name],quests,events,opportunities}};
}
// Player-facing summaries for the direction picker: which story, which start, which goal.
export function referenceOptions(genreLabel:string){
 const genre=genres.find(k=>genreLabel.includes(k));if(!genre)throw Error('지원하지 않는 장르입니다.');
 const src=reference[genre];
 // Identity slots are decided at build time, so summaries use a generic word for them.
 const generic:Record<string,string>={clan:'명문 세가',token:'신분 증표',clanWeapon:'검'};
 const plain=(text:string,loc:Record<string,string>)=>text.replace(/\{([a-zA-Z]+)\}/g,(_,key:string)=>loc[key]||generic[key]||'').replace(/\[GM\]\s*/g,'').replace(/\s*\('[^']*'\)/g,'').trim();
 // Start places depend on the story's city, so each story carries its own start summaries.
 const mains=src.mains.map((main,i)=>{
  const city=src.cities[cityMap[genre][i]];const loc=locationMap(city.locations);
  const line=(prefix:string)=>plain(main.text.split('\n').find(l=>l.startsWith(prefix))?.slice(prefix.length)||'',loc);
  const starts=src.starts.map(s=>{const first=s.split('\n')[0];return {name:startName(s),summary:plain(first.slice(first.indexOf(':')+1),loc)};});
  return {name:main.name,city:city.name,hook:line('시작 계기:'),goal:line('최종 목표(최종 목표형):'),progressSteps:line('최종 목표(진행도형):').split('→').map(x=>x.trim()).filter(Boolean),starts};
 });
 return {genre,mains};
}
