// Checks on the bookkeeping model's reply for /api/gm: every field is kept to what the game can carry out (known
// people, real items, reachable pins, roster monsters, sane numbers), talk replies become speech parts, and choices
// the game can't honor are dropped. route.ts sends what comes back to the play screen.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GmBody, GmState } from '../../../_lib/game/gm-contract';
import { FOREIGN_SCRIPT, dropRepeatedQuotes, VOICE_LENGTH, sentences, repeats, addressesIn, pairShare, contentWords, LEAVING, plainEnd, type NpcSheet, type Profile } from './speech';
import { namesFoe } from '../../../_lib/monsters';
import { POWER_TIERS, MAX_POWER } from '../../../_lib/progression';
import { TRAVEL_VERB } from '../../../_lib/travel';
import { appendFileSync } from 'fs';
import path from 'path';

type Ctx = {
  body: GmBody; state: GmState; data: any; history: string[]; mode: string; partner: string; profiles: Profile[]; sheets: Record<string, NpcSheet>;
  fixedVoices: { name: string; style: string }[]; itemUse: string; talkWritten: boolean; holdTalk: boolean; lastReply: boolean; playerLeaves: boolean; talkTurns: number;
};
export function checkReply(c: Ctx) {
  const { state, data, body, mode, fixedVoices, sheets, partner, profiles, itemUse, talkWritten, holdTalk, lastReply, playerLeaves, talkTurns, history } = c;
  const availableImages = Array.isArray(state.availableImages) ? state.availableImages.filter((v: unknown): v is string => typeof v === 'string').slice(0, 150) : [];
  const imageKey = typeof data.imageKey === 'string' && availableImages.includes(data.imageKey) ? data.imageKey : '';
  const locations = Array.isArray(state.locations) ? state.locations : [];
  const candidate = typeof data.moveToPinId === 'string' ? data.moveToPinId : '';
  const allowed = Array.isArray(state.adjacentLocationIds) ? state.adjacentLocationIds : [];
  const moveToPinId = body.movementAllowed !== false && allowed.includes(candidate) && locations.some((p: { id?: string; mapId?: string }) => p.id === candidate && p.mapId === state.currentMapId) ? candidate : '';
  if (typeof data.text === 'string') data.text = data.text.split(/(\s+)/).filter((w: string) => !FOREIGN_SCRIPT.test(w)).join('').replace(/ {2,}/g, ' ');
  if (!mode && typeof data.text === 'string') data.text = dropRepeatedQuotes(data.text, history);
  // Choices may come as {text, target}; the text is what the player sees, the target is only used to catch repeats.
  if (Array.isArray(data.choices)) data.choices = data.choices.map((v: unknown) => { if (v && typeof v === 'object') { return String((v as { text?: unknown }).text || ''); } return v; });
  const choices = Array.isArray(data.choices) ? [...new Set(data.choices.filter((v: unknown): v is string => typeof v === 'string' && !FOREIGN_SCRIPT.test(v)).map((v: string) => v.trim().replace(/^[(\[]?\s*특이한\s*행동\s*\d?\s*[)\]]?\s*[:：\-—]?\s*/, '')).filter((v: string) => v.length >= 2 && v.length <= 140))].slice(0, 3) : [];
  // Only a foe from this genre's roster can ambush, and never mid-fight or mid-talk.
  const monsterNames = Array.isArray(state.monsters) ? state.monsters.map((m: { name?: unknown }) => String(m?.name || '')) : [];
  const toMonster = (v: unknown) => { const t = typeof v === 'string' ? v.trim() : ''; return !t ? '' : monsterNames.find((n: string) => n === t) || monsterNames.find((n: string) => n.includes(t) || t.includes(n)) || ''; };
  const ATTACK = /(습격|덮치|덮쳐|돌진|달려들|달려든|덤벼|막아서|모습을 드러)/;
  // By full name, or a telling word standing on its own (monsters.ts namesFoe); a boss only by its full name.
  const foeInScene = (t: string) => monsterNames.find((n: string) => t.includes(n)) || monsterNames.find((n: string) => !(state.monsters || []).find((m: { name?: unknown; boss?: unknown }) => m?.name === n && m?.boss) && namesFoe(t, n));
  const sceneText = String(data.text || '');
  // Fighting a roster monster is a battle, not a dice check: a 근력 check once "제압했다" the wolf pack a quest
  // needed fought, and the same wolves had to be fought again later.
  const FIGHT = /(상대하|싸우|싸운|공격|처치|물리치|쫓아내|토벌|사냥|제압|맞서)/;
  const action = String(body.action || '');
  const fightFoe = !mode && data.check && typeof data.check === 'object' && FIGHT.test(action) ? foeInScene(action) || foeInScene(sceneText) : '';
  if (fightFoe) data.check = null;
  const ambush = mode ? '' : fightFoe || toMonster(data.ambush) || (Array.isArray(data.presentNpcs) ? data.presentNpcs.map(toMonster).find(Boolean) || '' : '') || (!(data.check && typeof data.check === 'object') && ATTACK.test(sceneText) ? foeInScene(sceneText) : '');
  const trainableIds = Array.isArray(state.trainableStats) ? state.trainableStats.map((t: { id?: unknown }) => String(t?.id || '')) : [];
  const trained = !mode && Array.isArray(data.trained) ? data.trained.filter((id: unknown): id is string => typeof id === 'string' && trainableIds.includes(id)).slice(0, 2) : [];
  const xpGain = typeof data.xpGain === 'string' && ['minor', 'deed', 'event'].includes(data.xpGain) ? data.xpGain : '';
  const reputationDelta = typeof data.reputationDelta === 'number' && Number.isFinite(data.reputationDelta) ? Math.max(-5000, Math.min(5000, Math.round(data.reputationDelta))) : 0;
  const goldDelta = typeof data.goldDelta === 'number' && Number.isFinite(data.goldDelta) ? Math.max(-1000, Math.min(500, Math.round(data.goldDelta))) : 0;
  const presentNpcs = Array.isArray(data.presentNpcs) ? [...new Set(data.presentNpcs.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim()).filter((v: string) => v.length >= 1 && v.length <= 30))].slice(0, 3) : [];
  const profileNames = Array.isArray(state.npcProfiles) ? state.npcProfiles.map((p: { name?: unknown }) => String(p?.name || '')) : [];
  const npcVoices = [...fixedVoices, ...(Array.isArray(data.npcVoices) ? data.npcVoices.filter((v: { name?: unknown; style?: unknown }) => v && typeof v.name === 'string' && typeof v.style === 'string' && v.style.trim() && profileNames.includes(v.name.trim()) && !fixedVoices.some(f => f.name === String(v.name).trim()) && !FOREIGN_SCRIPT.test(v.style))
    .map((v: { name: string; style: string }) => ({ name: v.name.trim(), style: v.style.trim().slice(0, VOICE_LENGTH) })) : [])].slice(0, 6);
  const check = !mode && body.reroll !== true && body.debug !== true && !body.diceResult && data.check && typeof data.check === 'object' ? {
    ability: String(data.check.ability || '').toLowerCase().slice(0, 50),
    label: String(data.check.label || '').slice(0, 60),
    reason: String(data.check.reason || '').slice(0, 200),
    dc: Number(data.check.dc) || 11, weight: String(data.check.weight || '').slice(0, 10),
    // What hangs on the roll, shown before the player rolls.
    success: String(data.check.success || '').slice(0, 80),
    failure: String(data.check.failure || '').slice(0, 80),
  } : null;
  const relationshipUpdates = Array.isArray(data.relationshipUpdates) ? data.relationshipUpdates.slice(0, 12).filter((item: unknown) => !!item && typeof item === 'object' && typeof (item as {name?:unknown}).name === 'string').map((item: {name:string;met?:boolean;relation?:string;affection?:number;affectionChange?:number}) => ({name:item.name.trim().slice(0,50),met:item.met===true,relation:typeof item.relation==='string'?item.relation.slice(0,30):'',affection:typeof item.affection==='number'&&Number.isFinite(item.affection)?Math.max(-100,Math.min(100,Math.round(item.affection))):undefined,affectionChange:typeof item.affectionChange==='number'&&Number.isFinite(item.affectionChange)?Math.max(-25,Math.min(25,Math.round(item.affectionChange))):undefined})) : [];
  const questStrings = (v: unknown) => Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim() && !FOREIGN_SCRIPT.test(x)).map((x: string) => x.trim().slice(0, 80)).slice(0, 3) : [];
  const completedQuests = questStrings(data.completedQuests), failedQuests = questStrings(data.failedQuests);
  // A giver outside the known cast (an unnamed extra) is dropped, like any other invented person.
  const addQuests = (Array.isArray(data.addQuests) ? data.addQuests : []).map((x: unknown) => typeof x === 'string' ? { text: x, giver: '' } : x && typeof x === 'object' ? { text: String((x as { text?: unknown; quest?: unknown }).text || (x as { quest?: unknown }).quest || ''), giver: String((x as { giver?: unknown }).giver || '') } : null)
    .filter((q: { text: string; giver: string } | null): q is { text: string; giver: string } => !!q && !!q.text.trim() && !FOREIGN_SCRIPT.test(q.text)).map((q: { text: string; giver: string }) => ({ text: q.text.trim().slice(0, 80), giver: (Array.isArray(state.knownNpcs) ? state.knownNpcs : []).includes(q.giver.trim()) ? q.giver.trim() : '' })).slice(0, 3);
  const finalGoalCompleted = !check && state.finalGoalMode !== 'progress' && data.finalGoalCompleted === true && !!String(state.finalGoal||'').trim();
  const steps=Array.isArray(state.finalGoalSteps)?state.finalGoalSteps.filter((v:unknown)=>typeof v==='string'&&v.trim()):[];
  const completedGoalSteps=!check&&state.finalGoalMode==='progress'&&Array.isArray(data.completedGoalSteps)?data.completedGoalSteps.filter((v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<steps.length):[];
  const rawEnemy = data.enemy && typeof data.enemy === 'object' ? data.enemy : null;
  // A built-in NPC always fights at its sheet tier; anyone else gets the tier the GM judged from their profile.
  const sheetPower = Number(sheets[partner]?.power);
  const gmPower = Number(rawEnemy?.power);
  const tier = Number.isInteger(sheetPower) && POWER_TIERS[sheetPower] ? sheetPower : Number.isInteger(gmPower) && gmPower >= 1 && gmPower <= MAX_POWER ? gmPower : 0;
  const npcPowers = Object.fromEntries(profiles.filter(p => typeof p?.name === 'string' && Number.isInteger(sheets[p.name as string]?.power)).map(p => [String(p.name), Number(sheets[p.name as string].power)]));
  const enemy = mode === 'combat' && (tier || rawEnemy) ? (tier ? { ...POWER_TIERS[tier], power: tier } : { hp: Number(rawEnemy.hp), dc: Number(rawEnemy.dc), damage: Number(rawEnemy.damage) }) : null;
  if (mode === 'combat' && !itemUse) data.hpDelta = 0;
  const gesture = mode === 'talk' && typeof data.gesture === 'string' ? data.gesture.trim().slice(0, 60) : '';
  const howKnownText = mode === 'talk' && typeof data.howKnown === 'string' ? data.howKnown.trim().slice(0, 120) : '';
  // The item tag comes from the real inventory, so the model can't name something the player doesn't carry.
  const carried: string[] = Array.isArray(state.inventory) ? state.inventory.filter((n: unknown): n is string => typeof n === 'string' && !!n.trim()) : [];
  const namedItem = typeof data.knownItem === 'string' ? data.knownItem.trim() : '';
  const knownItem = (namedItem && carried.find(n => n.includes(namedItem) || namedItem.includes(n))) || carried.find(n => howKnownText.includes(n));
  const howKnown = howKnownText && knownItem ? `[소지품: ${knownItem}] ${howKnownText}` : howKnownText;
  // Talk: the reply becomes ordered parts (narration, speech, narration, speech...) so the chat shows them in turn.
  // Quoted text is speech even when the model mixes it into the narration; a speech repeated in line and text appears once.
  let line = '';
  let parts: { type: 'scene' | 'speech'; text: string }[] = [];
  let talkLeft = false, nextAction = '';
  if (mode === 'talk' && talkWritten) {
    parts = String(data.line).split('\n').map(text => ({ type: 'speech' as const, text: text.slice(0, 600) })).slice(0, 4);
    line = parts.map(p => p.text).join(' ');
    if (holdTalk) { data.endTalk = false; data.nextAction = ''; }
    if (lastReply) data.endTalk = true;
    nextAction = typeof data.nextAction === 'string' && !FOREIGN_SCRIPT.test(data.nextAction) ? data.nextAction.trim().replace(/^나는\s+/, '').slice(0, 140) : '';
  } else if (mode === 'talk') {
    const QUOTE = /[“"「『]([^”"」』]+)[”"」』]/g;
    const toParts = (value: string) => {
      const out: { type: 'scene' | 'speech'; text: string }[] = [];
      let last = 0;
      for (const m of value.matchAll(QUOTE)) {
        const before = value.slice(last, m.index).trim();
        if (before) out.push({ type: 'scene', text: before });
        if (m[1].trim()) out.push({ type: 'speech', text: m[1].trim() });
        last = (m.index || 0) + m[0].length;
      }
      const after = value.slice(last).trim();
      if (after) out.push({ type: 'scene', text: after });
      return out;
    };
    const strip = (v: string) => v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim();
    const same = (a: string, b: string) => { const x = a.replace(/[\s"“”'.,!?…]/g, ''), y = b.replace(/[\s"“”'.,!?…]/g, ''); return !!x && !!y && (x.includes(y) || y.includes(x)); };
    parts = toParts(String(data.text || '').trim());
    // Chat-style prompts invite the model to send the messages as an array or under another key.
    const lineSource = data.line ?? data.lines ?? data.messages;
    let rawLine = (Array.isArray(lineSource) ? lineSource.filter((v: unknown) => typeof v === 'string').join('\n') : typeof lineSource === 'string' ? lineSource : '').trim();
    // A line that slipped into another language (a whole Japanese reply, 2026-11-10) is no reply either.
    if (FOREIGN_SCRIPT.test(rawLine)) rawLine = '';
    const lineParts = /[“"「『]/.test(rawLine) ? toParts(rawLine) : rawLine ? [{ type: 'speech' as const, text: strip(rawLine) }] : [];
    // Story narration sent as the partner's words ("핍이 당신에게 귀띔한 대로 … 생각이 스친다"): not speech, so it is dropped and the words asked for below.
    const narrated = (t: string) => t.includes(`${partner}이 `) || t.includes(`${partner}가 `) || t.includes(`${partner}은 `) || t.includes(`${partner}는 `) || (t.includes('당신') && /(는다|한다|간다|돈다|친다|있다|없다|였다|았다|었다).?$/.test(t.trim()));
    for (let i = lineParts.length - 1; i >= 0; i--) if (lineParts[i].type === 'speech' && narrated(lineParts[i].text)) lineParts.splice(i, 1);
    if (holdTalk) data.endTalk = false;
    // Headings are scene formatting; in a talk they are dropped from the narration. Only the player leaving (a walk-off
    // action) takes the reply out of the talk.
    parts = parts.map(p => ({ ...p, text: p.text.replace(/【[^】]+】/g, '').trim() })).filter(p => p.text);
    if (playerLeaves) {
      talkLeft = true;
      lineParts.splice(0);
      parts = [{ type: 'scene', text: [String(data.text || ''), rawLine].join(' ').replace(/【[^】]+】/g, '').replace(/["“”「」『』]/g, '').replace(/\s+/g, ' ').trim() }];
    }
    if (!talkLeft && !parts.some(p => p.type === 'speech')) {
      // No speech inside the narration: a lone line with no quotes is the NPC talking without quote marks.
      parts = lineParts.length ? [...parts, ...lineParts] : parts.length === 1 && !narrated(parts[0].text) ? [{ type: 'speech', text: strip(parts[0].text) }] : parts;
    } else {
      for (const p of lineParts) if (!parts.some(q => q.type === p.type && same(q.text, p.text))) parts.push(p);
    }
    // A quotative tail ('…"라고 덧붙인다') belongs to the lead-in before that speech: '그녀는 한숨을 내쉬며 덧붙인다.' then the bubble.
    parts = parts.reduce<typeof parts>((acc, p, i) => {
      const tail = p.type === 'scene' && i >= 2 && parts[i - 1].type === 'speech' ? p.text.match(/^(?:이?라고|하고|고)\s*(.+)$/) : null;
      if (!tail) { acc.push(p); return acc; }
      const lead = acc[acc.length - 2];
      if (lead?.type === 'scene' && !/[.!?…]$/.test(lead.text)) lead.text = `${lead.text} ${tail[1]}`;
      // A bare speech verb ('말한다.') adds nothing once the bubble is shown.
      else { const rest = tail[1].replace(/^(?:말하며|말하고는?|외치며|덧붙이며|중얼거리며)\s*/, ''); if (rest.replace(/[\s.!?…]/g, '').length > 6) acc.push({ type: 'scene', text: rest }); }
      return acc;
    }, []);
    // Chat-style talk: narration is dropped and each line of speech becomes its own bubble.
    const leftText = talkLeft ? parts.map(p => p.text).join(' ') : '';
    const prefix = `${partner}: "`;
    const saidBefore = history.filter((h: string) => h.startsWith(prefix)).slice(-12).flatMap((h: string) => sentences(h.slice(prefix.length).replace(/"(\s*\(.*\))?$/, '')));
    const fresh = (messages: string[]) => {
      const kept: string[] = [], seen = [...saidBefore];
      for (const m of messages) {
        const novel = sentences(m).filter(x => !seen.some(y => repeats(x, y)));
        seen.push(...novel);
        if (novel.length) kept.push(novel.join(' '));
      }
      return kept;
    };
    let speech = talkLeft ? [] : fresh(parts.filter(p => p.type === 'speech').flatMap(p => p.text.split(/\n+/).map(t => strip(t))).filter(Boolean));
    const ownAddress = new Set(saidBefore.flatMap((t: string) => addressesIn(t)));
    const inVoice = (t: string) => { const used = addressesIn(t); return !ownAddress.size || !used.length || used.some(a => ownAddress.has(a)); };
    if (speech.some(inVoice)) speech = speech.filter(inVoice);
    parts = talkLeft ? [] : (speech.length ? speech : [strip(rawLine) || '…']).map(text => ({ type: 'speech' as const, text: text.slice(0, 600) })).slice(0, 4);
    line = parts.filter(p => p.type === 'speech').map(p => p.text).join(' ');
    const FAREWELL = /(기약|다음에 (또 )?(봅시다|봐요|뵙|보자)|다시 만나(면|자|요|게)|다시 보자|또 보자|또 봐|몸 조심|조심히 가|조심해서 가|살펴 가|잘 가|여기까지(다|야|예요|입니다|군|로))/;
    if (!talkLeft && talkTurns >= 1 && FAREWELL.test(line)) data.endTalk = true;
    // Past the turn limit the talk closes whatever the model said.
    if (lastReply) data.endTalk = true;
    // The player's line settled what they do next (the GM's call): the partner's one answer closes the talk and the game plays the
    // action as a scene. Before, the talk ran on and the partner narrated the next scene (에드리아 describing tracks at the farm).
    nextAction = !holdTalk && !talkLeft && typeof data.nextAction === 'string' && !FOREIGN_SCRIPT.test(data.nextAction) ? data.nextAction.trim().replace(/^나는\s+/, '').slice(0, 140) : '';
    if (nextAction) { const first = parts.find(p => p.type === 'speech'); if (first) { parts = [first]; line = first.text; } data.endTalk = true; }
    const replySentences = sentences(line);
    const echoed = replySentences.filter(x => saidBefore.some((y: string) => pairShare(x, y) >= 0.45)).length;
    if (!talkLeft && talkTurns >= 2 && replySentences.length && echoed * 2 >= replySentences.length) data.endTalk = true;
    data.text = talkLeft ? leftText : parts.filter(p => p.type === 'scene').map(p => p.text).join(' ');
  }
  // The scene's choices are the writer's own. The game drops only what it can't carry out: going where the player already
  // is, a trip past the next pin (the map moves one step), paying with an empty purse, or only resting (health comes back by itself).
  const here = [...contentWords(String(state.locationName || ''))].filter(w => !/^(입구|근처|안쪽|바깥|앞|가장자리)$/.test(w));
  const goesHere = (c: string) => /(가서|간다|향한다|이동한다|돌아간다|찾아간다)/.test(c) && here.some(w => c.includes(w));
  const nextDoor = Array.isArray(state.adjacentLocations) ? state.adjacentLocations.map((l: { name?: unknown }) => String(l?.name || '')) : [];
  const farPins = (Array.isArray(state.locations) ? state.locations.map((l: { name?: unknown }) => String(l?.name || '').trim()) : []).filter((n: string) => n.length >= 2 && !nextDoor.includes(n) && !here.some(w => n.includes(w)));
  const farTrip = (c: string) => TRAVEL_VERB.test(c) && farPins.some((n: string) => c.includes(n));
  const broke = Number(state.gold ?? 1) <= 0;
  const pays = (c: string) => broke && /(은화|금화|동화|동전|골드|돈|값|요금|[가-힣]료|삯|대금|사례금)[^.]{0,15}(내고|낸다|내며|내서|건네|치르고|치른다|치러|지불|갚|꺼내)/.test(c);
  const RESTING = /(휴식|쉬며|쉬면서|쉰다|쉬어|잠을 ?청|눈을 붙|숨을 돌리|체력을 ?회복|회복하러|회복한다|기력을 ?회복|상처를 ?돌보|치료(를|하러) ?받)/;
  const whyBad = (c: string) => [goesHere(c) && 'goes-here', farTrip(c) && 'far-trip', pays(c) && 'no-gold', RESTING.test(c) && 'rest'].filter(Boolean).join(',');
  const gmChoices = [...(choices as string[])];
  if (!mode && !check && !ambush) choices.splice(0, choices.length, ...gmChoices.filter(c => !whyBad(c)));
  // Dev only: what the writer offered and what went out (.next/choice-debug.jsonl).
  if (process.env.NODE_ENV !== 'production' && !mode && !check && !ambush) {
    try { appendFileSync(path.join(process.cwd(), '.next', 'choice-debug.jsonl'), JSON.stringify({ ts: new Date().toISOString(), at: state.locationName || '', gm: gmChoices.map(c => ({ c, bad: whyBad(c) })), out: choices }) + '\n'); } catch {}
  }
  // Suggested replies must be speech; narrated intents are dropped unless nothing else is left.
  const NARRATED = /(한다|묻는다|말한다|건넨다|요청한다|부탁한다|청한다|본다|듣는다)\.?$/;
  const thirdPerson = (v: string) => partner.length >= 2 && ['와', '과', '에게', '한테', '를', '을', '의'].some(p => v.includes(`${partner}${p} `));
  const spoken = (v: string) => !NARRATED.test(v) && !LEAVING.test(v) && !plainEnd(v) && !/겠다.?$/.test(v) && !thirdPerson(v);
  const spokenChoices = mode === 'talk' && talkWritten ? [...(choices as string[])] : mode === 'talk' ? (choices as string[]).map((v: string) => v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim()).filter(spoken) : [];
  if (mode === 'talk' && spokenChoices.length) choices.splice(0, choices.length, ...spokenChoices);
  const playerLine = mode === 'talk' && typeof data.playerLine === 'string' && !FOREIGN_SCRIPT.test(data.playerLine) ? data.playerLine.trim().replace(/^["“”'「『]+|["“”'」』]+$/g, '').slice(0, 300) : '';
  return { addQuests, ambush, check, choices, completedGoalSteps, completedQuests, enemy, failedQuests, finalGoalCompleted, gesture, goldDelta, howKnown, imageKey, line, moveToPinId, nextAction, npcPowers, npcVoices, parts, playerLine, presentNpcs, relationshipUpdates, reputationDelta, talkLeft, trained, xpGain };
}
