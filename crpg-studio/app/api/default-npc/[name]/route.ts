import {NextResponse} from 'next/server';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
export const runtime='nodejs';
const names:Record<string,Set<string>>={
  modern:new Set(["강태희", "고명숙", "김기연", "나연", "마서윤", "문지혜", "민하늘", "박진아", "백희원", "서지아", "송재은", "오은비", "유채린", "윤세진", "이소라", "장민서", "정유겸", "차유진", "최혜령", "한도연"]),
  fantasy:new Set(["그리마 철망치", "넬", "레지나 발트", "리오네 아스크", "말라키아", "미라벨 크로우", "바레나", "브리아", "세라핀", "실바엘", "아우렐리아", "에드리아 하르트", "엘로이즈", "오르벨라", "오틸리에 마른", "우르술라", "이졸데", "카시아", "테오도라", "핍", "한나"]),
  wuxia:new Set(["남궁세린", "단유", "당설화", "독고연", "류월", "마련", "모용설", "백초희", "설영", "소화", "연청", "왕소교", "운낭", "월하", "이정", "정혜", "제갈연", "진하", "천소화", "청연", "팽소연", "한설아", "혈영", "홍랑"])
};
export async function GET(request:Request,{params}:{params:Promise<{name:string}>}){
 const {name}=await params;
 const genre=new URL(request.url).searchParams.get('genre')||'wuxia';
 if(!names[genre]?.has(name))return new NextResponse('Not found',{status:404});
 try{const bytes=await readFile(path.join(process.cwd(),'public','_default_npcs',genre,`${name}_기본.png`));return new NextResponse(bytes,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'}})}catch{return new NextResponse('Not found',{status:404})}
}
