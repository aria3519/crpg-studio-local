// Reads what the writers wrote for /api/gm into the reply's fields: a talk reply's lines, gesture, item clue, end tag
// and suggested answers; a scene's text, choices and its tail tags ([대화: …], [이동: …], [판정: …]).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GmBody, GmState } from '../../../_lib/game/gm-contract';
import { FOREIGN_SCRIPT } from './speech';
import { asideClue } from '../../../_lib/game/core';

type Ctx = { body: GmBody; state: GmState; data: any; prewritten: string; mode: string; partner: string };
export function readWritten(c: Ctx) {
  const { prewritten, mode, partner, data, state, body } = c;
  let talkWritten = false;
  if (prewritten && mode === 'talk') {
    const [said, tail = '']: string[] = prewritten.split(/\n\s*-{3,}\s*(?:\n|$)/);
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
    data.line = lines.join('\n'); data.text = ''; data.playerLine = ''; data.gesture = gestureW || asides[0] || '';
    const clue = typeof data.howKnown === 'string' && data.howKnown.trim() ? null : asideClue(partner, asides, Array.isArray(state.inventory) ? state.inventory.filter((n: unknown): n is string => typeof n === 'string') : []);
    if (clue) { data.howKnown = clue.text; data.knownItem = clue.item; }
    data.endTalk = !!end; data.nextAction = end?.[1]?.trim() || '';
    const numbered = tail.split('\n').map(l => (l.match(/^\s*\d\s*[.)]\s*(.+)$/)?.[1] || '').replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim()).filter(Boolean).slice(0, 3);
    data.choices = end ? [] : numbered;
    // The talk ended on the partner's word: the ways on are the player's to pick, not played for them.
    data.afterChoices = end && !end[1] ? numbered.filter(l => !FOREIGN_SCRIPT.test(l)) : [];
  }
  if (prewritten && !mode) {
    const [story, tail = '']: string[] = prewritten.split(/(?:^|\n)\s*-{3,}\s*(?:\n|$)/);
    data.text = story.trim();
    data.choices = tail.split('\n').map(l => (l.match(/^\s*\d\s*[.)]\s*(.+)$/)?.[1]?.trim() || '').replace(/^나는\s+/, '')).filter(Boolean).slice(0, 3);
    data.check = null;
    // The scene reached a conversation: the talk window takes it over with that person (only someone the game knows).
    const talkName = tail.match(/\[대화:\s*([^\]|]+)/)?.[1].trim() || '';
    const onStage = (Array.isArray(state.npcProfiles) ? state.npcProfiles : []).filter((p: { inScene?: unknown }) => p?.inScene).map((p: { name?: unknown }) => String(p?.name || ''));
    const talkable = [...onStage, ...[...(Array.isArray(state.knownNpcs) ? state.knownNpcs : []), ...(Array.isArray(state.cast) ? state.cast : []).map((c: unknown) => String(c || '').replace(/^\[GM\]\s*/, '').split(/[(:：]/)[0].trim())].filter((n: string) => story.includes(n))]
      .filter((n: string) => n.length >= 1 && !(Array.isArray(state.reservedNpcs) ? state.reservedNpcs : []).includes(n) && !(Array.isArray(state.party) ? state.party : []).includes(n));
    // A one-letter name (넬) counts only when exact; partial matches need two letters so 넬 isn't read into another name.
    // Someone the scene itself brought on (개척민 하나, a gate guard) is talked to as they are, not dropped: the scene stopped
    // at that talk, so dropping it left no talk and no choices. Not a later act's person, a companion or a monster.
    const foes = (Array.isArray(body.monsters) ? body.monsters : []).map((m: { name?: unknown }) => String(m?.name || ''));
    const extra = talkName.length >= 2 && talkName.length <= 12 && story.includes(talkName) && !(Array.isArray(state.reservedNpcs) ? state.reservedNpcs : []).includes(talkName)
      && !(Array.isArray(state.party) ? state.party : []).includes(talkName) && !foes.some((n: string) => n && (n.includes(talkName) || talkName.includes(n))) ? talkName : '';
    data.talkTo = !talkName ? '' : talkable.find((n: string) => n === talkName) || (talkName.length < 2 ? '' : talkable.find((n: string) => n.length >= 2 && (talkName.includes(n) || n.includes(talkName)))) || extra;
    if (data.talkTo) data.choices = [];
    // The player sets off: the game makes the move on the map (not on an arrival the map already made).
    const goName = tail.match(/\[이동:\s*([^\]|]+)/)?.[1].trim().slice(0, 40) || '';
    data.goTo = !data.talkTo && goName.length >= 2 && !String(body.action || '').startsWith('시스템이 이동을 확정') ? goName : '';
    if (data.goTo) data.choices = [];
    const roll = body.diceResult || data.talkTo || data.goTo ? null : tail.match(/\[판정:\s*([^\]]+)\]/);
    if (roll) {
      const [ab = '', dcPart = '', what = '', ...rest]: string[] = roll[1].split('|').map((x: string) => x.trim());
      const cv = (state.characterValues || {}) as Record<string, unknown>;
      const ids = Object.keys(cv).filter(k => cv[k] !== '' && Number.isFinite(Number(cv[k])));
      const id = ab.replace(/\(.*$/, '').trim();
      const byName = (Array.isArray(state.trainableStats) ? state.trainableStats : []).find((t: { name?: unknown }) => String(t?.name || '') === id)?.id;
      const tail2 = (k: string) => rest.find(r => r.startsWith(k))?.replace(new RegExp('^' + k + '하면\\s*'), '').trim() || '';
      // "사내를 밀쳐 고정쇠에 닿기; 실패하면 그가 종을 울린다" in one field also happens.
      const [tried, inlineFail = ''] = what.split(/[;,]?\s*실패하면\s*/);
      data.check = { ability: ids.includes(id) ? id : byName || ids[0] || id, weight: dcPart.slice(0, 10), dc: Number(dcPart.match(/\d+/)?.[0]) || 11, label: tried.slice(0, 60) || '판정', reason: tried, success: tail2('성공'), failure: tail2('실패') || inlineFail.trim() };
      data.choices = [];
    }
  }
  return talkWritten;
}
