import { NextResponse } from 'next/server';
import { referenceOptions } from '../_lib/reference-builder';
export const runtime='nodejs';
// Stories, starts and goals the creator can pick for a genre.
export async function GET(request:Request){
 try{return NextResponse.json(referenceOptions(new URL(request.url).searchParams.get('genre')||''));}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'방향 목록을 불러오지 못했습니다.'},{status:400});}
}
