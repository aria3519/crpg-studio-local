import { NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { serveAsset } from '../../../_lib/serve-asset';
import { findFoe } from '../../../../_lib/monsters';
export const runtime='nodejs';
// Art is looked up by the monster's Korean name (e.g. 숲 트롤.png), falling back to its slug (forest-troll.png).
// Only names in the genre roster are served, so the path can't escape the folder.
export async function GET(request:Request,{params}:{params:Promise<{genre:string;name:string}>}) {
 const {genre,name}=await params;
 const foe=['wuxia','fantasy','modern'].includes(genre)?findFoe(genre,decodeURIComponent(name)):undefined;
 if(!foe)return new NextResponse('Not found',{status:404});
 const dir=path.join(process.cwd(),'public','_default_monsters',genre);
 const byName=path.join(dir,`${foe.name}.png`);
 return serveAsset(request,existsSync(byName)?byName:path.join(dir,`${foe.image}.png`),'image/png','Monster image missing');
}
