import { NextResponse } from 'next/server';
import { appendFileSync } from 'fs';
import path from 'path';
import type { GmBody, GmState } from '../../_lib/game/gm-contract';
import { fillSystem } from './_lib/prompt-fill';
import { sceneWriter, talkWriter } from './_lib/prompt-writer';
import { readWritten } from './_lib/parse';
import { checkReply } from './_lib/checks';
import { VOICE_LENGTH, type NpcSheet, type Profile, npcSheets, assignVoices, LEAVING, voiceFor, oldSpeech } from './_lib/speech';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY 환경변수가 없습니다.' }, { status: 500 });
  try {
    const body: GmBody = await request.json();
    if (typeof body.action !== 'string' || !body.action.trim() || body.action.length > 4000) {
      return NextResponse.json({ error: '행동 입력이 올바르지 않습니다.' }, { status: 400 });
    }
    // The play screen sends the monster roster beside state, not inside it; the GM reads it as currentState.monsters.
    const state: GmState = { ...(body.state && typeof body.state === 'object' ? body.state : {}), ...(Array.isArray(body.monsters) && !Array.isArray(body.state?.monsters) ? { monsters: body.monsters } : {}) };
    // Explicitly separate current mutable state from immutable event history.
    const rawFlags=Array.isArray(state.flags)?state.flags.filter((v:unknown):v is string=>typeof v==='string'):[];
    const stateKeys=new Set(['막','소속','경지','재물','현재위치','현재목표']);
    const latestState:Record<string,string>={};
    const eventFlags:string[]=[];
    for(const flag of rawFlags){const pos=flag.indexOf(':');const key=pos>0?flag.slice(0,pos).trim():'';if(stateKeys.has(key))latestState[key]=flag.slice(pos+1).trim();else if(!eventFlags.includes(flag))eventFlags.push(flag);}
    const explicitGameState={currentMapId:state.currentMapId||'',locationName:state.locationName||'',quests:Array.isArray(state.quests)?state.quests:[],hp:state.hp,inventory:state.inventory||[],currentValues:latestState,historyFlags:eventFlags.slice(-100)};
    const history = Array.isArray(body.history) ? body.history.filter((x: unknown) => typeof x === 'string').slice(-30).map((x: string) => x.slice(0, 1500)) : [];
    // Rolling summary of everything older than recentHistory (built by /api/gm/memory).
    const storySoFar = typeof body.memory === 'string' ? body.memory.slice(0, 8000) : '';
    const keyFacts = Array.isArray(body.keyFacts) ? body.keyFacts.filter((x: unknown): x is string => typeof x === 'string').map((x: string) => x.slice(0, 120)).slice(-100) : [];
    const genreText = String(body.prompt || '').slice(0, 1800);
    // Talk and combat narrow the GM to one partner; combat numbers are computed by the client.
    const mode = body.mode === 'talk' || body.mode === 'combat' ? body.mode : '';
    const partner = String(body.npc || '').slice(0, 30);
    // How the hero talks, for every pass that writes the player's lines. Without it the lines mixed 반말 into a talk
    // with the knight-captain, assumed a companion who wasn't there ("우리가 둘이라면"), and gave the hero a trade
    // ("늑대 상대는 내 전문이야") that the identity-free stories never fix.
    const partnerAffection = Number((Array.isArray(state.relationships) ? state.relationships : []).find((r: { name?: unknown }) => r?.name === partner)?.affection) || 0;
    const party: string[] = Array.isArray(state.party) ? state.party.filter((n: unknown): n is string => typeof n === 'string') : [];
    const playerVoice = [
      `플레이어 대사의 말투: 세 대사 모두 같은 어체입니다. ${partnerAffection >= 40 || party.includes(partner) ? `${partner}와(과)는 가까운 사이라 편한 반말도 됩니다.` : `${partner}에게는 해요체(~요)로 말하고 반말은 쓰지 마세요.`}`,
      `지금 플레이어의 동료: ${party.length ? party.join(', ') : '없음(혼자)'}. 없는 동료나 "우리 둘" 같은 일행을 전제하지 말고, ${partner}가 함께 간다고 정해지지 않았으면 같이 가자는 전제도 하지 마세요.`,
      '주인공의 출신·직업·특기·과거는 주인공 자료(대화에서는 hero)에 있는 그대로만 말합니다.',
    ].join(' ');
    const talkTurns = Math.max(0, Math.min(99, Math.round(Number(body.talkTurns) || 0)));
    // The talk closes after this reply either way, so the NPC must say goodbye in it rather than ask something left hanging.
    const decided = mode === 'talk' && body.closeTalk === true;
    const playerLeaves = mode === 'talk' && LEAVING.test(String(body.action || '').trim());
    // The opening reply of a talk (nothing said by the player yet) never ends it either.
    const holdTalk = mode === 'talk' && talkTurns === 0 && !playerLeaves;
    const lastReply = mode === 'talk' && (decided || talkTurns >= 5);
    const combat = mode === 'combat' && body.combat && typeof body.combat === 'object' ? body.combat : null;
    const itemUse = typeof combat?.itemUse === 'string' ? combat.itemUse.slice(0, 80) : '';
    // Voices are fixed before the scene is written: an NPC on stage without one gets it now, so the first line already uses it and later turns can't drift.
    const profiles: Profile[] = Array.isArray(state.npcProfiles) ? state.npcProfiles : [];
    // Sheets go only to NPCs that matter this turn (on stage, in the party, the talk partner) so they never crowd out recent history.
    const sheets = npcSheets(String(body.genre || ''));
    for (const p of profiles) {
      const sheet = typeof p?.name === 'string' ? sheets[p.name] : undefined;
      if (!sheet) continue;
      const speech = voiceFor(sheet.speech || '', Number((p as { affection?: unknown }).affection) || 0);
      if (p.inScene || p.inParty || p.name === partner) (p as Profile & { sheet?: NpcSheet }).sheet = { ...sheet, speech };
      // A hand-written voice outranks one improvised earlier in the playthrough.
      if (speech) p.speechStyle = speech.slice(0, VOICE_LENGTH);
    }
    const sheetVoices = profiles.filter(p => typeof p?.name === 'string' && sheets[p.name as string]?.speech && p.speechStyle === voiceFor(sheets[p.name as string].speech || '', Number((p as { affection?: unknown }).affection) || 0).slice(0, VOICE_LENGTH) && (p.inScene || p.inParty || p.name === partner)).map(p => ({ name: String(p.name), style: String(p.speechStyle) }));
    const voiceless = profiles.filter(p => typeof p?.name === 'string' && !String(p.speechStyle || '').trim() && (p.inScene || p.inParty || p.name === partner)).slice(0, 4);
    const fixedVoices = [...sheetVoices, ...(voiceless.length && body.phase !== 'write' ? await assignVoices(voiceless.map(p => ({ name: String(p.name), profile: String(p.profile || '') })), genreText, body.genre === 'wuxia') : [])];
    for (const v of fixedVoices) { const p = profiles.find(x => x.name === v.name); if (p) p.speechStyle = v.style; }
    // Scenes are written in two steps: phase 'write' streams Terra's prose to the player; then this route is called again with
    // that prose as sceneText, and the routine model only fills in the game's fields (measured 2026-11-10: Luna wrote 120~160자
    // of a dice request in 6~7s; Terra wrote 400~600자 of story, first words after 1.7~3s).
    // Talk replies too (step 3, 2026-11-10): the partner's words and the player's next lines come from the writer in one call;
    // the six fix-up calls that patched Luna's talk replies (refill, redo, retry, rewrite, speech fixes) are gone.
    const prewritten = (!mode || mode === 'talk') && typeof body.sceneText === 'string' ? body.sceneText.slice(0, 6000) : '';
    const early = !!String(body.prologue || '').trim() || !!String(body.initialEquipment || '').trim();
    const wild = state.safePlace !== true || mode === 'combat' || body.debug === true;
    const system = fillSystem({ state, mode, body, partner, playerVoice, talkTurns, lastReply, decided, combat, itemUse, early, wild, prewritten });
    // Flags already travel deduplicated in explicitGameState; listing every map's pins only matters for the current map.
    // The message is never cut mid-JSON: older history is dropped first so the action and memory always arrive whole.
    const { flags: _flags, locations: allLocations, ...stateRest } = state;
    const { monsters: _monsters, ...stateCore } = stateRest;
    const modelState = { ...(wild ? stateRest : stateCore), ...(body.debug === true ? { locations: Array.isArray(allLocations) ? allLocations.filter((p: { mapId?: string }) => p?.mapId === state.currentMapId).slice(0, 60) : [] } : {}) };
    const partnerStyle = String(profiles.find(p => p?.name === partner)?.speechStyle || '');
    const keepsOldSpeech = /하오체|하게체/.test(partnerStyle);
    // The model copies what the partner said before: one old line in a save's history took 에드리아 from 2% to 30%.
    const spokeOld = (h: string) => mode === 'talk' && !keepsOldSpeech && h.startsWith(`${partner}: "`) && oldSpeech(h);
    const recent = history.filter((h: string) => !spokeOld(h));
    const withThisNpc = mode === 'talk' && Array.isArray(body.withThisNpc) ? body.withThisNpc.filter((x: unknown) => typeof x === 'string' && !spokeOld(x)).slice(-30).map((x: string) => x.slice(0, 300)) : [];
    const userContent = () => JSON.stringify({ playerAction: body.action, ...(prewritten ? { sceneText: prewritten } : {}), diceResult: body.diceResult || null, keyFacts, storySoFar, withThisNpc, recentHistory: recent, explicitGameState, currentState: modelState });
    while (userContent().length > 30000 && recent.length > 6) recent.shift();
    // Measured on hard cases: the partner's own lines as an earlier exchange took old endings from 18% to 7%; rewording the rules changed nothing.
    const voiceLines = mode === 'talk' ? [...(partnerStyle.split('예:')[1] || '').matchAll(/["“]([^"”]+)["”]/g)].map(m => m[1]).filter(l => keepsOldSpeech || !oldSpeech(l)) : [];
    // Scenes that move the story (a quest step happens or ends, a region story opens, interference, a stalled scene, a quest
    // talk) still run on the routine model so the player never waits on the major one; the client has it review them afterwards (/api/gm/director).
    const majorScene = !mode && body.interfere === true;
    if (process.env.NODE_ENV !== 'production') { try { const u = JSON.parse(userContent()); appendFileSync(path.join(process.cwd(), '.next', 'gm-size.jsonl'), JSON.stringify({ ts: new Date().toISOString(), mode: mode || 'scene', system: system.length, user: userContent().length, parts: Object.fromEntries(Object.entries(u).map(([k, v]) => [k, JSON.stringify(v ?? '').length])), state: Object.fromEntries(Object.entries(modelState).map(([k, v]) => [k, JSON.stringify(v ?? '').length]).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 12)) }) + '\n'); } catch {} }
    const streamWrite = async (writer: string, input: unknown, tag: string) => {
      const up = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'x-usage-tag': tag },
        body: JSON.stringify({ model: process.env.OPENAI_GM_MAJOR_MODEL || process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', reasoning_effort: 'low', stream: true, messages: [{ role: 'system', content: writer }, { role: 'user', content: JSON.stringify(input) }] }),
        cache: 'no-store', signal: AbortSignal.timeout(60000),
      });
      if (!up.ok || !up.body) return NextResponse.json({ error: '글쓰기 실패' }, { status: 502 });
      const reader = up.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
      return new Response(new ReadableStream({
        async start(ctrl) {
          let buf = '';
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let i;
              while ((i = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
                if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
                try { const d = JSON.parse(line.slice(5))?.choices?.[0]?.delta?.content; if (d) ctrl.enqueue(enc.encode(d)); } catch {}
              }
            }
          } finally { ctrl.close(); }
        },
      }), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    };
    if (body.phase === 'write' && mode === 'talk' && body.reroll !== true) {
      const { writer, input } = talkWriter({ profiles, partner, talkTurns, body, state, recent, storySoFar, playerVoice, lastReply, withThisNpc, keyFacts });
      return streamWrite(writer, input, 'talk-write');
    }
    if (body.phase === 'write' && !mode && body.reroll !== true) {
      const { writer, input } = sceneWriter({ userContent, state, body, recent, wild, early, keyFacts, storySoFar });
      return streamWrite(writer, input, 'scene-write');
    }
    // Luna accepts low reasoning effort (tested 2026-11-10); the player waits on these calls, so they think briefly.
    const payload = { reasoning_effort: 'low', model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        ...(voiceLines.length ? [
          { role: 'user', content: JSON.stringify({ playerAction: `${partner}, 평소 말하는 대로 한마디 해 주세요.`, note: '이전 대화 기록' }) },
          { role: 'assistant', content: JSON.stringify({ knownItem: '', howKnown: '', text: '', line: voiceLines.join('\n'), choices: [] }) },
        ] : []),
        { role: 'user', content: userContent() },
      ],
    };
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'x-usage-tag': mode || 'scene' },
      body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(55000),
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result?.error?.message || 'AI API 호출에 실패했습니다.' }, { status: 502 });
    const raw = result?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') throw new Error('AI 응답이 비어 있습니다.');
    let data = JSON.parse(raw);
    const talkWritten = readWritten({ prewritten, mode, partner, data, state, body });
    const { addQuests, ambush, check, choices, completedGoalSteps, completedQuests, enemy, failedQuests, finalGoalCompleted, gesture, goldDelta, howKnown, imageKey, line, moveToPinId, nextAction, npcPowers, npcVoices, parts, playerLine, presentNpcs, relationshipUpdates, reputationDelta, talkLeft, trained, xpGain } = checkReply({ state, data, body, mode, fixedVoices, sheets, partner, profiles, itemUse, talkWritten, holdTalk, lastReply, playerLeaves, talkTurns, history });
    return NextResponse.json({ majorScene, nextAction, afterChoices: Array.isArray(data.afterChoices) ? data.afterChoices : [], goTo: !mode && !check && typeof data.goTo === 'string' ? data.goTo : '', talkTo: !mode && !check && typeof data.talkTo === 'string' ? data.talkTo : '', setLevel: body.debug === true && Number.isInteger(data.setLevel) ? Math.max(1, Math.min(100, data.setLevel)) : 0, enemy, npcPowers, trained: check ? [] : trained, ambush: check ? '' : ambush, xpGain: check ? '' : xpGain, gesture, howKnown, line, parts, playerLine, npcVoices, endTalk: mode === 'talk' && (data.endTalk === true || talkLeft || decided), talkLeft, reputationDelta: check ? 0 : reputationDelta, goldDelta: check ? 0 : goldDelta,addQuests:check?[]:addQuests,completedQuests:check?[]:completedQuests,failedQuests:check?[]:failedQuests,finalGoalCompleted,completedGoalSteps,relationshipUpdates: check ? [] : relationshipUpdates, choices: check ? [] : choices, presentNpcs: check ? null : presentNpcs, check, moveToPinId: check ? '' : moveToPinId, imageKey, text: String(data.text || '').slice(0, 6000), hpDelta: check ? 0 : Number.isFinite(data.hpDelta) ? Math.trunc(data.hpDelta) : 0,
      addItems: !check && Array.isArray(data.addItems) ? data.addItems.slice(0, 5) : [], removeItems: !check && Array.isArray(data.removeItems) ? data.removeItems.slice(0, 5) : [],
      addFlags: !check && Array.isArray(data.addFlags) ? data.addFlags.slice(0, 5) : [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'GM 서버 오류' }, { status: 500 });
  }
}
