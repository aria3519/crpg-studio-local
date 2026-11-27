// Reads what the writers wrote for /api/gm into the reply's fields: a talk reply's lines, gesture, item clue, end tag
// and suggested answers; a scene's text, choices and its tail tags ([대화: …], [판정: …]).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GmBody, GmState } from '../../../_lib/game/gm-contract';
import { FOREIGN_SCRIPT } from './speech';
import { asideClue, impactOf } from '../../../_lib/game/core';

// The writer's hidden answers, "[정함: 무엇 — 내용]": taken out before anyone reads the text (the bookkeeper would log them as
// clues the hero knows), kept by the game and handed back to later scenes and talks (4차: a date "written" but never decided).
const SETTLED = /\[정함\s*[:：]\s*([^\]]+)\]/g;
export const takeSettled = (text: string) => ({
  text: text.replace(SETTLED, '').replace(/\n{3,}/g, '\n\n'),
  settled: [...text.matchAll(SETTLED)].map(m => m[1].trim().slice(0, 200)).filter(s => s && !FOREIGN_SCRIPT.test(s)).slice(0, 3),
});

// What the writer says happened, one tag a line under "---" (prompt-writer.ts). The bookkeeper doesn't judge these: no tag, it
// didn't happen (user 2026-11-27).
const tagsOf = (tail: string, name: string) => [...tail.matchAll(new RegExp(`\\[${name}\\s*[:：]\\s*([^\\]]+)\\]`, 'g'))].map(m => m[1].split('|').map(x => x.trim()));
const XP: Record<string, string> = { '작은 성취': 'minor', '큰 성취': 'deed', '사건 해결': 'event' };
const signed = (s = '') => Number(s.replace(/[^\d+-]/g, '')) || 0;
// A choice's own tags: the place it goes to, whom it speaks to, whom it fights.
export const choiceOf = (line: string) => {
  const pick = (k: string) => line.match(new RegExp(`\\[${k}\\s*[:：]\\s*([^\\]]+)\\]`))?.[1].trim() || '';
  return { do: line.replace(/\s*\[(이동|상대|전투)\s*[:：][^\]]*\]/g, '').trim(), to: pick('이동'), talk: pick('상대'), fight: pick('전투') };
};
// A talk is told only some of them; the rest read as nothing happened.
const readTags = (tail: string, data: any, seen: string[]) => {
  data.completedQuests = tagsOf(tail, '끝남').map(t => t[0]).filter(Boolean);
  data.failedQuests = tagsOf(tail, '실패').map(t => t[0]).filter(Boolean);
  // A first meeting is the bookkeeper's record (who was met); how anyone's goodwill moved is the writer's (no first impression: a first meeting starts at 0, user 2026-11-27).
  const moved = tagsOf(tail, '호감').map(([name = '', by = '', because = '']) => ({ name, by: signed(by), because })).filter(x => x.name);
  // Whom the hero met is who the writer put in front of them (seen); the bookkeeper only words a new one's relation.
  const worded = (Array.isArray(data.relationshipUpdates) ? data.relationshipUpdates : []).filter((u: any) => u?.met === true && typeof u.name === 'string');
  const met = [...new Set(seen.filter(Boolean))].map(name => ({ name, met: true, relation: String(worded.find((u: any) => u.name === name)?.relation || ''), affection: moved.find(m => m.name === name)?.by || 0 }));
  data.relationshipUpdates = [...met, ...moved.filter(m => m.by && !met.some((u: any) => u.name === m.name)).map(m => ({ name: m.name, met: false, affectionChange: m.by, because: m.because }))];
  data.reputationDelta = tagsOf(tail, '명성').reduce((t, [v]) => t + signed(v), 0);
  data.addQuests = tagsOf(tail, '맡음').map(([text = '', giver = '']) => ({ text, giver })).filter(q => q.text);
  data.xpGain = XP[tagsOf(tail, '성장')[0]?.[0] || ''] || '';
  data.trained = tagsOf(tail, '단련').map(t => t[0].replace(/\(.*$/, '').trim()).filter(Boolean).slice(0, 2);
  data.hpDelta = tagsOf(tail, 'HP').reduce((t, [v]) => t + signed(v), 0);
  // Money and things are the writer's too: the game adds the gold up (goldOf caps it) and grades the items.
  data.goldMoves = null;
  data.goldDelta = tagsOf(tail, '골드').reduce((t, [v]) => t + signed(v), 0);
  data.addItems = tagsOf(tail, '얻음').map(([name = '', kind = '', desc = '']) => ({ name, kind: KIND[kind] || 'item', desc })).filter(x => x.name).slice(0, 5);
  data.removeItems = tagsOf(tail, '잃음').map(t => t[0]).filter(Boolean).slice(0, 5);
};
const KIND: Record<string, string> = { 무기: 'weapon', 방어구: 'armor', 장신구: 'accessory', 물건: 'item' };
// A typed action the writer answered with a tag alone (no story): turned down with the host's words, a move the map makes,
// or a fight the game opens. Only a tag standing on its own line counts, not one on a numbered choice.
const ownTag = (tail: string, name: string) => tail.split('\n').map(l => l.trim()).find(l => new RegExp(`^\\[${name}\\s*[:：]`).test(l))?.replace(new RegExp(`^\\[${name}\\s*[:：]\\s*`), '').replace(/\]\s*$/, '').split('|').map(x => x.trim()) || [];
const answeredByTag = (tail: string, data: any) => {
  const [no = ''] = ownTag(tail, '안\\s*됨'), [to = '', ...more] = ownTag(tail, '이동'), [foe = ''] = ownTag(tail, '전투');
  if (no) data.refused = no.slice(0, 300);
  else if (to) { data.moveTo = to; data.meet = more.find(x => /^상대\s*[:：]/.test(x))?.replace(/^상대\s*[:：]\s*/, '') || ''; }
  else if (foe) data.fightNow = foe;
};

type Ctx ={ body: GmBody; state: GmState; data: any; prewritten: string; mode: string; partner: string };
// The writers know an unmet person only by their look (route.ts); inside the tags under "---" the look is turned back into
// the name, so [등장], [호감], [상대] reach the real person. The choice words keep the look the player reads.
const namedTags = (tail: string, state: GmState) => {
  const looks = (Array.isArray(state.npcProfiles) ? state.npcProfiles : []).flatMap((p: { name?: unknown; heroCalls?: unknown }) => typeof p?.heroCalls === 'string' && p.heroCalls && typeof p.name === 'string' ? [[p.heroCalls, p.name] as [string, string]] : []);
  return looks.length ? tail.replace(/\[[^\]]*\]/g, tag => looks.reduce((t, [look, name]) => t.split(look).join(name), tag)) : tail;
};
export function readWritten(c: Ctx) {
  const { prewritten, mode, partner, data, state, body } = c;
  let talkWritten = false;
  if (prewritten && mode === 'talk') {
    const [said, tail0 = '']: string[] = prewritten.split(/(?:^|\n)\s*-{3,}\s*(?:\n|$)/), tail = namedTags(tail0, state);
    let gestureW = '';
    const asides: string[] = [];
    const lines = said.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
      const g = i === 0 ? l.match(/^\(([^)]{1,40})\)\s*/) : null;
      if (g) { gestureW = g[1].trim(); l = l.slice(g[0].length); }
      // A gesture written mid-reply is taken out of the speech too.
      l = l.replace(/\s*\(([^)]{1,40})\)\s*/g, (_m: string, a: string) => { asides.push(a.trim()); return ' '; }).trim();
      const tag = l.match(/^([^:：]{1,20})\s*[:：]\s*/);
      if (tag && tag[1].trim() === partner) l = l.slice(tag[0].length);
      return l.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim();
    }).filter(l => l && !FOREIGN_SCRIPT.test(l));
    const end = tail.match(/\[대화\s*끝(?:\s*[:：]\s*([^\]]+))?\]/);
    talkWritten = lines.length > 0;
    data.stepDone = /\[단계\s*완료\]/.test(tail);
    data.line = lines.join('\n'); data.text = ''; data.playerLine = ''; data.gesture = gestureW || asides[0] || '';
    // How the partner knows a thing is what the writer put in the gesture, not the bookkeeper's guess.
    const clue = asideClue(partner, asides, Array.isArray(state.inventory) ? state.inventory.filter((n: unknown): n is string => typeof n === 'string') : []);
    data.howKnown = clue?.text || ''; data.knownItem = clue?.item || '';
    const [act = '', ...rest] = (end?.[1] || '').split('|');
    data.endTalk = !!end; data.nextAction = act.trim(); data.joins = rest.some(p => p.trim() === '함께'); data.task = rest.map(p => p.trim()).find(p => p && p !== '함께' && !FOREIGN_SCRIPT.test(p))?.slice(0, 60) || '';
    const read = tail.split('\n').map(l => l.match(/^\s*\d\s*[.)]\s*(.+)$/)?.[1] || '').filter(Boolean).slice(0, 3).map(l => choiceOf(l)).map(c => ({ ...c, do: c.do.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim() })).filter(c => c.do);
    const numbered = read.map(c => c.do);
    data.choices = end ? [] : numbered;
    // Where each way on goes is the writer's tag on it; the settled action is the first of them.
    data.goes = end ? [...read, ...(read[0] && data.nextAction ? [{ ...read[0], do: data.nextAction }] : [])] : [];
    readTags(tail, data, [partner]);
    if (!lines.length) answeredByTag(tail, data);
    // Every ended talk offers the ways on for the player to pick (the settled action among them), never played for them.
    data.afterChoices = end ? numbered.filter(l => !FOREIGN_SCRIPT.test(l)) : [];
  }
  if (prewritten && !mode) {
    const [story, tail0 = '']: string[] = prewritten.split(/(?:^|\n)\s*-{3,}\s*(?:\n|$)/), tail = namedTags(tail0, state);
    data.text = story.trim();
    // The writer says whether the goal's step happened in what it wrote (prompt-writer.ts); a redraw carries no tag.
    data.stepDone = /\[단계\s*완료\]/.test(tail);
    const read = tail.split('\n').map(l => l.match(/^\s*\d\s*[.)]\s*(.+)$/)?.[1]?.trim() || '').filter(Boolean).slice(0, 3).map(l => choiceOf(l)).map(c => ({ ...c, do: c.do.replace(/^나는\s+/, '') })).filter(c => c.do);
    data.choices = read.map(c => c.do);
    data.goes = read;
    if (!data.text) answeredByTag(tail, data);
    // Who is here at the end and what attacked are the writer's too (user 2026-11-27).
    data.presentNpcs = (tail.match(/\[등장\s*[:：]\s*([^\]]+)\]/)?.[1] || '').split(/[,，|]/).map(n => n.trim()).filter(Boolean).slice(0, 3);
    data.ambush = data.text ? ownTag(tail, '전투')[0] || '' : '';
    data.check = null;
    // The scene reached a conversation: the talk window takes it over with that person (only someone the game knows).
    const talkName = tail.match(/\[대화:\s*([^\]|]+)/)?.[1].trim() || '';
    // Someone the hero hasn't met is written by their look (heroCalls), so the scene and the tag may carry "떠돌이 약초사" for 엘로이즈.
    const profiles: { name?: unknown; inScene?: unknown; heroCalls?: unknown }[] = Array.isArray(state.npcProfiles) ? state.npcProfiles : [];
    const shownLook = (p: { heroCalls?: unknown }) => { const look = String(p?.heroCalls || ''); return look && story.includes(look) ? look : ''; };
    const onStage = profiles.filter(p => p?.inScene || shownLook(p)).map(p => String(p?.name || ''));
    const byLook = String(profiles.find(p => shownLook(p) && talkName.includes(shownLook(p)))?.name || '');
    const talkable = [...onStage, ...[...(Array.isArray(state.knownNpcs) ? state.knownNpcs : []), ...(Array.isArray(state.cast) ? state.cast : []).map((c: unknown) => String(c || '').replace(/^\[GM\]\s*/, '').split(/[(:：]/)[0].trim())]]
      .filter((n: string) => n.length >= 1 && !(Array.isArray(state.party) ? state.party : []).includes(n));
    // A one-letter name (넬) counts only when exact; partial matches need two letters so 넬 isn't read into another name.
    // Only someone with a name in this world is talked to (user 2026-11-27: no nameless people); anyone else leaves no talk.
    data.talkTo = !talkName ? '' : talkable.find((n: string) => n === talkName) || talkable.find((n: string) => n === byLook) || (talkName.length < 2 ? '' : talkable.find((n: string) => n.length >= 2 && (talkName.includes(n) || n.includes(talkName)))) || '';
    if (data.talkTo) data.choices = [];
    readTags(tail, data, [...data.presentNpcs, data.talkTo]);
    const roll = body.diceResult || data.talkTo ? null : tail.match(/\[판정:\s*([^\]]+)\]/);
    if (roll) {
      const [ab = '', dcPart = '', ...more]: string[] = roll[1].split('|').map((x: string) => x.trim());
      // The impact field (전투/이후/최종보스) may sit anywhere after the weight.
      const impactPart = more.find(x => !!impactOf(x)) || '';
      // Whose trust hangs on the roll is the writer's "| 믿음: 이름".
      const trust = more.find(x => /^믿음\s*[:：]/.test(x)) || '';
      if (trust) data.checkPerson = trust.replace(/^믿음\s*[:：]\s*/, '').trim();
      const [what = '', ...rest] = more.filter(x => x !== impactPart && x !== trust);
      const cv = (state.characterValues || {}) as Record<string, unknown>;
      const ids = Object.keys(cv).filter(k => cv[k] !== '' && Number.isFinite(Number(cv[k])));
      const id = ab.replace(/\(.*$/, '').trim();
      const byName = (Array.isArray(state.trainableStats) ? state.trainableStats : []).find((t: { name?: unknown }) => String(t?.name || '') === id)?.id;
      const tail2 = (k: string) => rest.find(r => r.startsWith(k))?.replace(new RegExp('^' + k + '하면\\s*'), '').trim() || '';
      // "사내를 밀쳐 고정쇠에 닿기; 실패하면 그가 종을 울린다" in one field also happens.
      const [tried, inlineFail = ''] = what.split(/[;,]?\s*실패하면\s*/);
      data.check = { ability: ids.includes(id) ? id : byName || ids[0] || id, weight: dcPart.slice(0, 10), impact: impactOf(impactPart) || '', dc: Number(dcPart.match(/\d+/)?.[0]) || 11, label: tried.slice(0, 60) || '판정', reason: tried, success: tail2('성공'), failure: tail2('실패') || inlineFail.trim() };
      data.choices = [];
    }
  }
  return talkWritten;
}
