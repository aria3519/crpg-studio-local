import { NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { serveAsset } from '../../_lib/serve-asset';
export const runtime = 'nodejs';
// Standing art for talk and battle; genres without one fall back to the map marker.
export async function GET(request: Request, { params }: { params: Promise<{genre:string}> }) {
  const { genre } = await params;
  if (!['wuxia','fantasy','modern'].includes(genre)) return new NextResponse('Not found', {status:404});
  const portrait = path.join(process.cwd(),'public','_default_player_portraits',genre+'.png');
  if (existsSync(portrait)) return serveAsset(request, portrait, 'image/png');
  return serveAsset(request, path.join(process.cwd(),'public','_default_player_markers',genre+'.gif'), 'image/gif');
}
