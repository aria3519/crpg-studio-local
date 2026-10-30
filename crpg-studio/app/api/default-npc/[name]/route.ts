import {NextResponse} from 'next/server';
import {serveAsset} from '../../_lib/serve-asset';
import path from 'node:path';
import {existsSync} from 'node:fs';
export const runtime='nodejs';
const names:Record<string,Set<string>>={
  modern:new Set(["강태희", "고명숙", "김기연", "나연", "마서윤", "문지혜", "민하늘", "박진아", "백희원", "서지아", "송재은", "오은비", "유채린", "윤세진", "이소라", "장민서", "정유겸", "차유진", "최혜령", "한도연"]),
  fantasy:new Set(["그리마 철망치", "넬", "레지나 발트", "리오네 아스크", "말라키아", "미라벨 크로우", "바레나", "브리아", "세라핀", "실바엘", "아우렐리아", "에드리아 하르트", "엘로이즈", "오르벨라", "오틸리에 마른", "우르술라", "이졸데", "카시아", "테오도라", "핍", "한나"]),
  wuxia:new Set(["남궁세린", "단유", "당설화", "독고연", "류월", "마련", "모용설", "백초희", "설영", "소화", "연청", "왕소교", "운낭", "월하", "이정", "정혜", "제갈연", "진하", "천소화", "청연", "팽소연", "한설아", "혈영", "홍랑"])
};
// Stand-in portrait for anyone without art: npc_기본.png in public/_default_npcs/<genre>/,
// then in public/_default_npcs/ (shared by every genre), else a plain silhouette.
const SILHOUETTE=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dee7"/><stop offset="1" stop-color="#aab3c2"/></linearGradient></defs><rect width="400" height="600" fill="url(#bg)"/><circle cx="200" cy="205" r="92" fill="#6b7587"/><path d="M40 600c0-120 72-215 160-215s160 95 160 215z" fill="#6b7587"/><text x="200" y="560" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="700" fill="#e5e9f0">?</text></svg>`;
export async function GET(request:Request,{params}:{params:Promise<{name:string}>}){
 const {name}=await params;
 const genre=new URL(request.url).searchParams.get('genre')||'wuxia';
 if(name==='_unknown'&&names[genre]){
  const root=path.join(process.cwd(),'public','_default_npcs');
  const art=[path.join(root,genre,'npc_기본.png'),path.join(root,'npc_기본.png')].find(f=>existsSync(f));
  if(art)return serveAsset(request,art,'image/png');
  return new NextResponse(SILHOUETTE,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-cache'}});
 }
 if(!names[genre]?.has(name))return new NextResponse('Not found',{status:404});
 return serveAsset(request,path.join(process.cwd(),'public','_default_npcs',genre,`${name}_기본.png`),'image/png');
}
