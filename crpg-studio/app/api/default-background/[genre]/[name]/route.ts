import { NextResponse } from 'next/server';
import { serveAsset } from '../../../_lib/serve-asset';
import path from 'node:path';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{genre:string;name:string}>}) {
 const {genre,name}=await params;
 if(!['wuxia','fantasy','modern'].includes(genre)||!/^[a-z0-9-]+$/.test(name))return new NextResponse('Not found',{status:404});
 return serveAsset(request,path.join(process.cwd(),'public','_default_backgrounds',genre,`${name}.png`),'image/png','Background image missing');
}
