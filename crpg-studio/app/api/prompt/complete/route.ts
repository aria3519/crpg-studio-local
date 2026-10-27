import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MAIN_PROLOGUES } from '../../../_lib/prologues';
export const runtime = 'nodejs';

// Ready-made, hand-checked game prompt for one main story (app/api/prompt/_lib/complete/<story>.txt).
// Replaces the old seeded assembly of factions, NPCs and quests, which produced mismatched combinations.
export async function GET(request: Request) {
  const main = new URL(request.url).searchParams.get('main')?.trim() || '';
  if (!MAIN_PROLOGUES[main]) return NextResponse.json({ error: '알 수 없는 이야기입니다.' }, { status: 404 });
  try {
    const prompt = (await readFile(path.join(process.cwd(), 'app', 'api', 'prompt', '_lib', 'complete', `${main}.txt`), 'utf8')).replace(/^﻿/, '').trim();
    return NextResponse.json({ prompt, length: [...prompt].length });
  } catch {
    return NextResponse.json({ error: '이 이야기의 완성 프롬프트가 아직 준비되지 않았습니다.' }, { status: 503 });
  }
}
