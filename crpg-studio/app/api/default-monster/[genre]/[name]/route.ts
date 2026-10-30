import { NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { serveAsset } from '../../../_lib/serve-asset';
import { findFoe, ART_STAND_IN } from '../../../../_lib/monsters';
export const runtime='nodejs';
// Art is looked up by the monster's Korean name (e.g. 숲 트롤.png), falling back to its slug (forest-troll.png), and
// then to the stand-in fantasy picture (ART_STAND_IN) for foes that have no art yet.
// Only names in the genre roster are served, so the path can't escape the folder.
export async function GET(request:Request,{params}:{params:Promise<{genre:string;name:string}>}) {
 const {genre,name}=await params;
 const foe=['wuxia','fantasy','modern'].includes(genre)?findFoe(genre,decodeURIComponent(name)):undefined;
 if(!foe)return new NextResponse('Not found',{status:404});
 const root=path.join(process.cwd(),'public','_default_monsters');
 const byName=path.join(root,genre,`${foe.name}.png`), bySlug=path.join(root,genre,`${foe.image}.png`);
 const standIn=ART_STAND_IN[foe.name]?path.join(root,'fantasy',`${ART_STAND_IN[foe.name]}.png`):'';
 const file=existsSync(byName)?byName:existsSync(bySlug)?bySlug:standIn&&existsSync(standIn)?standIn:bySlug;
 return serveAsset(request,file,'image/png','Monster image missing');
}
