import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{genre:string}>}) {
 const {genre}=await params;
 if(!['wuxia','fantasy','modern'].includes(genre))return new NextResponse('Not found',{status:404});
 try {const bytes=await readFile(path.join(process.cwd(),'public','_default_prologues',`${genre}.png`));return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'}});}
 catch{return new NextResponse('Not found',{status:404});}
}
