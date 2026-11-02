import { NextResponse } from 'next/server';
import { serveAsset } from '../../../_lib/serve-asset';
import path from 'node:path';
import fs from 'node:fs';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{genre:string;name:string}>}) {
 const {genre,name}=await params;
 if(!['wuxia','fantasy','modern'].includes(genre)||!/^[a-z0-9-]+$/.test(name))return new NextResponse('Not found',{status:404});
 // Backgrounds are PNG, or WebP for the ones added later.
 const base=path.join(process.cwd(),'public','_default_backgrounds',genre,name);
 const webp=!fs.existsSync(base+'.png')&&fs.existsSync(base+'.webp');
 return serveAsset(request,base+(webp?'.webp':'.png'),webp?'image/webp':'image/png','Background image missing');
}
