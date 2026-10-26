import { NextResponse } from 'next/server';
import { serveAsset } from '../../../_lib/serve-asset';
import path from 'node:path';

export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{genre:string;index:string}> }) {
  const {genre,index}=await params;
  if (!['wuxia','fantasy','modern'].includes(genre) || !/^[0-3]$/.test(index)) return new NextResponse('Not found',{status:404});
  return serveAsset(request, path.join(process.cwd(),'public','_default_maps',`${genre}-${index}.png`), 'image/png', 'Map image missing');
}
