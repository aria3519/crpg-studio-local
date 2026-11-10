// One turn's GM reply applied to the session: HP, items, people, goals, rewards, the log, and whatever the scene sets
// on the player next (a monster, a hostile NPC). Pure: no React, no network. The play screen applies the result and
// shows the effects; tests replay recorded replies through it (tests/turn.test.ts).
import { TRAVEL_VERB } from '../travel';
import { weightOf, checkStakes, questStakes, questWeight, MapPin, cityPlaces, cityOfPlace, defaultMapGenre, defaultCharacterConfig, getGameGoal, Game, DiceResult, Session, TALK_LIMIT, EVENT_XP_GAP, talkTurns, questsOf, QUEST_REPUTATION, startGold, applyQuests, clampAffection, attitudeTier, REPUTATION_STEP, clampReputation, reputationRank, formatReputation, knownNpcNames, makeId, AFTERMATH, reachablePins, d, startCombat, debugFoe, HOSTILE_AFFECTION, CLASH_GAP, maxManaOf, maxHpOf, growthFields, growStats, withXp, TALK_ACCEPT, rewardBase, regionWhere, playerActs, HP_REGEN_TURN, restReason, QuestClear, battleIntro, josa, carriedOpening, openWithCue, talkEntries, withPlayerLine, defaultActions, QUEST_AFFECTION, QUEST_GOLD, AFFECTION_STEP, MANA_REGEN_TURN, train } from './core';
import { GRADE_LABELS, KIND_LABELS, SKILLS, infoOf, gearOf, bonusText, skillText, enemyGear, gradeForTier, dropChance, rollGrade, rollSkill, randomGearKind, gearName, POTIONS, healShareOf, enemySkill, enemySkillText, type EnemySkill, type Grade, type ItemInfo, type ItemKind, type Equipped } from '../items';
import { foesOf, findFoe, trophyOf, foeImage, isFoeName, isDangerous, pickEncounter, ENCOUNTER_CHANCE, huntTarget, HUNT_CHANCE, foeInText, type Foe } from '../monsters';
import { POWER_TIERS, MAX_POWER, MAX_LEVEL, foeLevelRange, enemyStats, levelBonus, gainXp, xpToNext, battleXp, questXp, mainQuestXp, deedXp, levelForTier, tierOfLevel, encounterLevel, companionStats } from '../progression';

// The map decides where the player is. A scene heading moves them only when they set off for a place one step away.
export const scenePin = (game: Game, cur: Session, message: string, heading: string) => {
  const map = (game.maps || []).find(m => m.id === cur.mapId), here = map?.pins.find(p => p.id === cur.pinId), pinHere = here?.name || '';
  const nextTo = map && here ? reachablePins(map, here).map(p => p.id) : [];
  // Only where the player set off for (a travel word in the action) and only one step away: a heading after a talk
  // ("곧 회색 탑 폐허로 향하겠습니다") or a far place named in passing no longer carries the player off.
  const setOff = TRAVEL_VERB.test(message) && !/^(시스템|전투 결과)/.test(message) && message.trim() !== (cur.talkAccept || TALK_ACCEPT);
  if (!setOff || (pinHere.length >= 2 && heading.includes(pinHere))) return undefined;
  const usable = (p: MapPin) => p.id !== cur.pinId && p.kind !== 'exit' && p.kind !== 'event';
  // A heading that names the pin the player is already on (【그림우드 숲 가장자리】 at 그림우드) keeps them there; before,
  // the city lookup took over and moved them to 레븐홀트, whose places include 그림우드 숲 가장자리.
  const city = cityOfPlace(defaultMapGenre(game), heading);
  const pin = map?.pins.find(p => usable(p) && p.name.length >= 2 && heading.includes(p.name)) || (city && city !== pinHere ? map?.pins.find(p => usable(p) && p.name === city) : undefined);
  return pin && nextTo.includes(pin.id) ? pin : undefined;
};

// What the screen shows besides the new session; it adds the timestamps (keys) itself.
export type TurnEffects = { notice?: string; repBurst?: { delta: number; total: number }; questClear?: Omit<QuestClear, 'key'>; levelBurst?: number };
// session: the new state (with a threat when a fight or a hostile NPC comes next). settled: the same turn without that
// threat, for the story summary and the director. major: the director should read this turn now.
export type TurnResult = TurnEffects & { session: Session; settled: Session; major: boolean };
export type TurnContext = { event?: { id: string; text: string; trigger: string }; diceResult?: DiceResult; debug?: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyReply(game: Game, current: Session, data: any, message: string, { event, diceResult, debug = false }: TurnContext = {}): TurnResult {
  const fx: TurnEffects = {};
  // A roll's numbers are the game's, by its weight; what the writer and the bookkeeper wrote is the story, not the payout.
  const rollPay = diceResult ? checkStakes(diceResult.weight || weightOf(diceResult.dc) || 'normal', current.level || 1, maxHpOf(game, current)) : undefined;
  const rollWon = !!rollPay && !!diceResult?.success;
  if (diceResult && rollPay) { data.goldDelta = 0; data.reputationDelta = 0; data.xpGain = undefined; data.hpDelta = diceResult.success ? 0 : -rollPay.hurt; }
    const delta = Number(data.hpDelta);
    let hp = Number.isFinite(delta) ? Math.max(0, Math.min(maxHpOf(game, current), current.hp + Math.max(-maxHpOf(game, current), Math.min(maxHpOf(game, current), Math.trunc(delta))))) : current.hp;
    const inventory = [...(current.inventory || [])];
    const gotItems = (Array.isArray(data.addItems) ? data.addItems : []).map((v: unknown) => typeof v === 'string' ? { name: v.trim() } : v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' ? v as { name: string; kind?: unknown; desc?: unknown; skill?: unknown } : null).filter((v: { name: string } | null): v is { name: string; kind?: unknown; desc?: unknown; skill?: unknown } => !!v && !!v.name.trim()).slice(0, 5);
    // Gear the player already owns isn't handed out again (potions and other items can stack).
    const add: string[] = gotItems.map((v: { name: string }) => v.name.trim()).filter((n: string, i: number, a: string[]) => !(infoOf(n, current.itemInfo).kind !== 'item' && ((current.inventory || []).includes(n) || a.indexOf(n) !== i)));
    const remove = Array.isArray(data.removeItems) ? data.removeItems.filter((v: unknown): v is string => typeof v === 'string').slice(0, 5) : [];
    // A healing potion the scene used up (resting and drinking one) heals the way using it from the bag does; when the GM
    // also raised hpDelta for the same drink, the larger of the two counts, not both.
    let potionHeal = 0; const drunk: string[] = [];
    const drinking = /(마신|마셔|마시|들이켜|들이킨|물약|포션|약을 ?먹|사용한다|사용해)/.test(message);
    for (const item of remove) { const idx = inventory.indexOf(item); if (idx < 0) continue; if (!drinking && healShareOf(item, infoOf(item, current.itemInfo)) > 0) continue; inventory.splice(idx, 1); const share = healShareOf(item, infoOf(item, current.itemInfo)); if (share > 0) { potionHeal += Math.round(maxHpOf(game, current) * share); drunk.push(item); } }
    if (potionHeal > 0) hp = Math.max(hp, Math.min(maxHpOf(game, current), current.hp + potionHeal));
    // Natural recovery on a calm turn: no fight, no threat, and the scene didn't hurt the player.
    const hpBeforeRest = hp;
    if (current.mode !== 'combat' && !current.threat && !current.dead && hp > 0 && hp >= current.hp && hp < maxHpOf(game, current)) hp = Math.min(maxHpOf(game, current), hp + Math.max(1, Math.round(maxHpOf(game, current) * HP_REGEN_TURN)));
    // The recovery is told as something that happened in the scene (catching breath in a talk, a warm bowl in town,
    // binding a cut in the wild), not as a bare number.
    const restNote = hp > hpBeforeRest ? `시스템: ${restReason(current.mode === 'talk' ? 'talk' : isDangerous(defaultMapGenre(game), regionWhere(game, current)) ? 'wild' : 'town', current.log.filter(l => / · HP \d+ → \d+$/.test(l)).length)} · HP ${hpBeforeRest} → ${hp}` : '';
    // The drink line shows what the potion did; the rest note after it shows the calm turn's own recovery.
    const drinkNote = !drunk.length ? '' : hpBeforeRest > current.hp ? `시스템: 사용 — ${drunk.join(', ')} · HP ${current.hp} → ${hpBeforeRest}` : `시스템: 사용 — ${drunk.join(', ')}`;
    for (const item of add) if (item.length <= 80) inventory.push(item);
    const flags = [...(current.flags || [])];
    for (const flag of (Array.isArray(data.addFlags) ? data.addFlags : [])) {
      if (typeof flag !== 'string' || flag.length > 80 || !flag.trim()) continue;
      const separator=flag.indexOf(':');
      const category=separator>0?flag.slice(0,separator).trim():'';
      // Mutable current values replace the previous value; historical events remain append-only.
      if (['막','소속','경지','재물','현재위치','현재목표'].includes(category)) {
        for (let i=flags.length-1;i>=0;i--) if (flags[i].startsWith(category+':')) flags.splice(i,1);
      }
      if (!flags.includes(flag)) flags.push(flag);
    }
    const activeImageKey = typeof data.imageKey === 'string' && ((game.npcPortraits||[]).some(n=>!!n.image&&`${n.name}::기본`===data.imageKey)||(game.imageCells||[]).some(cell=>{const row=(game.imageRows||[]).find(r=>r.id===cell.rowId);const col=(game.imageColumns||[]).find(c=>c.id===cell.columnId);return row&&col&&`${row.name}::${col.name}`===data.imageKey;})) ? data.imageKey : undefined;
    const suggestedActions = Array.isArray(data.choices) ? data.choices.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0).map((v: string) => v.trim().slice(0, 140)).slice(0, 4) : [];
    const relationships = [...(current.relationships || [])];
    let newcomers = 0;
    if (Array.isArray(data.relationshipUpdates)) {
      for (const raw of data.relationshipUpdates.slice(0, 12)) {
        if (!raw || typeof raw.name !== 'string' || isFoeName(defaultMapGenre(game), raw.name)) continue;
        const name = raw.name.trim().slice(0, 50);
        if (!name || name === (game.characterConfig || defaultCharacterConfig()).initialName) continue;
        const index = relationships.findIndex(p => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
        if (index < 0 && raw.met !== true) continue;
        // Someone new the GM made up joins the cast once they actually appear in the scene (free play: the world beyond the main story has people too).
        if (index < 0 && !debug && !knownNpcNames(game, current).includes(name) && (!String(data.text || '').includes(name) || newcomers++ >= 1)) continue;
        const previous = index >= 0 ? relationships[index] : undefined;
        const relation = typeof raw.relation === 'string' && raw.relation.trim() ? raw.relation.trim().slice(0, 30) : (previous?.relation || '초면');
        // A first meeting sets a first impression; after that the GM only says how much this scene moved it, and the game
        // adds it up. When the GM wrote the whole value, it echoed a stale one: a finished quest's +5 came back as -5.
        // One scene moves affection by at most AFFECTION_STEP, so a single line can't flip a friend into an enemy; test commands are exempt.
        const proposed = typeof raw.affection === 'number' && Number.isFinite(raw.affection) ? clampAffection(raw.affection) : undefined;
        const change = typeof raw.affectionChange === 'number' && Number.isFinite(raw.affectionChange) ? raw.affectionChange : 0;
        const affection = !previous ? (proposed === undefined ? 0 : debug ? proposed : clampAffection(Math.max(-40, Math.min(40, proposed)))) : debug && proposed !== undefined ? proposed : clampAffection(previous.affection + Math.max(-AFFECTION_STEP, Math.min(AFFECTION_STEP, change)));
        const person = { id: previous?.id || makeId(), name: previous?.name || name, relation, affection };
        if (index >= 0) relationships[index] = person;
        else if (relationships.length < 100) relationships.push(person);
      }
    }
    const questLog = applyQuests(questsOf(current), data, current.questGivers || {});
    // Each finished goal pays by its weight (where it came from), not one fixed purse for all.
    const questPays = questLog.done.map(q => questStakes(questWeight(game, q), current.level || 1));
    const questSum = (k: 'xp' | 'gold' | 'rep') => questPays.reduce((a, p) => a + p[k], 0);
    const exercised = Array.isArray(data.trained) ? data.trained.filter((id: unknown): id is string => typeof id === 'string' && growthFields(game).some(f => f.id === id)).slice(0, 2) : [];
    for (const giver of questLog.doneGivers) { const i = giver ? relationships.findIndex(p => p.name.trim() === giver.trim()) : -1; if (i >= 0) relationships[i] = { ...relationships[i], affection: clampAffection(relationships[i].affection + QUEST_AFFECTION) }; }
    // Talking is not a deed: the deed paid when it was done, and the GM paid a reported kill a second time.
    // A quest the talk concludes still pays through questLog below.
    if (current.mode === 'talk') { data.reputationDelta = 0; data.xpGain = undefined; }
    const repDelta = (typeof data.reputationDelta === 'number' && Number.isFinite(data.reputationDelta) ? Math.max(-REPUTATION_STEP, Math.min(REPUTATION_STEP, Math.round(data.reputationDelta))) : 0) + questSum('rep') + (rollWon ? rollPay!.rep : 0);
    // Every affection change is spelled out, so the player sees what their choices did.
    const affectionNotes = relationships.flatMap(p => { const before = (current.relationships || []).find(r => r.id === p.id); const diff = before ? p.affection - before.affection : 0; return diff ? [`${p.name} 호감도 ${diff > 0 ? '+' : ''}${diff} (${attitudeTier(p.affection).label})`] : []; });
    if (affectionNotes.length) fx.notice = affectionNotes.join(' · ');
    const reputation = clampReputation((current.reputation || 0) + repDelta);
    // Quests pay a fixed purse; the GM reports only what the scene itself moved (a trade, a bribe, loot). Never below 0.
    const goldBefore = current.characterGold ?? startGold(game);
    const goldDelta = Math.max(-goldBefore, (typeof data.goldDelta === 'number' && Number.isFinite(data.goldDelta) ? Math.round(data.goldDelta) : 0) + questSum('gold') + (rollWon ? rollPay!.gold : 0));
    const characterGold = goldBefore + goldDelta;
    // A big deed gets its own fanfare instead of a quiet log line.
    if (Math.abs(repDelta) >= 300 && !questLog.done.length) fx.repBurst = { delta: repDelta, total: reputation };
    // A companion who has come to dislike the player walks out.
    const deserters = (current.party || []).filter(n => (relationships.find(r => r.name.trim() === n.trim())?.affection ?? 0) < 0);
    const party = (current.party || []).filter(n => !deserters.includes(n));
    const configuredSteps=(game.finalGoalSteps||[]).map(x=>x.trim()).filter(Boolean);
    const validStepIndices=Array.isArray(data.completedGoalSteps)?data.completedGoalSteps.filter((n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<configuredSteps.length):[];
    const completedGoalSteps=[...new Set([...(current.completedGoalSteps||[]),...validStepIndices])].filter(n=>n<configuredSteps.length).sort((a,b)=>a-b);
    const goalCompleted = current.goalCompleted === true || ((game.finalGoalMode==='progress' ? (configuredSteps.length>0 && completedGoalSteps.length===configuredSteps.length) : (data.finalGoalCompleted === true && !!getGameGoal(game).trim())));
    // Named people come from the game's cast (portraits, prompt NPC list, people already met) or were just met in this scene (relationships above).
    const knownNpcs = knownNpcNames(game, current);
    const sceneNpcs = Array.isArray(data.presentNpcs) ? [...new Set(data.presentNpcs.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim()).filter((v: string) => !!v && (debug || !knownNpcs.length || knownNpcs.includes(v) || relationships.some(r => r.name === v))))].slice(0, 3) as string[] : (current.sceneNpcs || []);
    // A talk or fight keeps its partner on stage; the encounter prompt only returns for newcomers.
    // Companions travel with the player, so the GM naming one in the scene never turns into a fresh encounter.
    const heading = !current.mode ? String(data.text || '').match(/^\s*【([^】·|]+)/)?.[1].trim().slice(0, 40) : undefined;
    // Only a move between two known places clears who was dealt with: a heading is the GM's wording (진흙 골목 / 골목 어귀), not a location.
    const placeOf = (h = '') => cityPlaces(defaultMapGenre(game)).find(([n]) => h.includes(n))?.[0];
    const placeFrom = placeOf(current.scenePlace), placeTo = placeOf(heading);
    const handledBefore = placeFrom && placeTo && placeFrom !== placeTo ? [] : current.handledNpcs || [];
    const talkTo = !current.mode && typeof data.talkTo === 'string' ? data.talkTo : '';
    const stageNpcs = current.mode ? (current.sceneNpcs || []) : talkTo ? [...new Set([talkTo, ...sceneNpcs])].slice(0, 3) : sceneNpcs.filter(n => !(current.party || []).includes(n) && !isFoeName(defaultMapGenre(game), n) && (debug || !handledBefore.includes(n)));
    // A test action may also teleport within the current map.
    const debugPin = debug && typeof data.moveToPinId === 'string' ? (game.maps || []).find(m => m.id === current.mapId)?.pins.find(p => p.id === data.moveToPinId && p.id !== current.pinId && p.kind !== 'event' && p.kind !== 'exit') : undefined;
    const handledNpcs = talkTo ? handledBefore.filter(n => n !== talkTo) : handledBefore;
    // Whatever an NPC's strength turns out to be the first time, it stays that way for every later fight.
    const knownFoe = current.combat ? current.npcCombat?.[current.combat.npc] : undefined;
    const combat = current.mode === 'combat' && current.combat ? (current.combat.round === 0 ? startCombat(current.combat, knownFoe || data.enemy) : { ...current.combat, itemUse: undefined }) : current.combat;
    const npcCombat = current.mode === 'combat' && current.combat?.round === 0 && combat && !knownFoe ? { ...(current.npcCombat || {}), [combat.npc]: { hp: combat.enemyMaxHp, dc: combat.enemyDc, damage: combat.enemyDamage, power: combat.power } } : current.npcCombat;
    const nextActions = current.mode === 'combat' ? [] : current.mode === 'talk' ? suggestedActions.slice(0, 3) : (suggestedActions.length ? suggestedActions : defaultActions(game, current.mapId, current.pinId));
    // A voice is fixed the first time an NPC speaks and never rewritten afterwards.
    const npcVoices = { ...(current.npcVoices || {}) };
    for (const v of Array.isArray(data.npcVoices) ? data.npcVoices : []) if (v && typeof v.name === 'string' && typeof v.style === 'string' && !npcVoices[v.name]) npcVoices[v.name] = v.style;
    const curMap = (game.maps || []).find(m => m.id === current.mapId);
    const storyPin = !heading || current.mode || debug ? undefined : scenePin(game, current, message, heading);
    const manaMax = maxManaOf(game, current);
    const result: Session = { ...train(current, exercised), typed: undefined, ...(!current.mode ? { talkPurpose: talkTo ? { npc: talkTo, action: message } : undefined } : {}), ...(manaMax > 0 && current.mode !== 'combat' ? { mana: Math.min(manaMax, (current.mana ?? manaMax) + Math.round(manaMax * MANA_REGEN_TURN)) } : {}), ...(heading ? { scenePlace: heading } : {}), ...(storyPin ? { pinId: storyPin.id } : {}), npcVoices, relationships, quests: questLog.quests, questGivers: questLog.givers, reputation, characterGold, party, npcCombat, completedGoalSteps,goalCompleted, sceneNpcs: stageNpcs, handledNpcs: debug ? handledNpcs.filter(n => !stageNpcs.includes(n)) : handledNpcs, combat, suggestedActions: nextActions, hp, inventory, flags, activeImageKey, ...(debugPin ? { pinId: debugPin.id } : {}),
      log: [...(carriedOpening(current) ? openWithCue(current.log, current.talkNpc ? talkEntries(current.talkNpc, data) : []) : withPlayerLine(current.log, current.mode === 'talk' ? data.playerLine : '')), ...(current.mode === 'talk' && current.talkNpc && !data.talkLeft ? (carriedOpening(current) ? [] : talkEntries(current.talkNpc, data)) : [`GM: ${String(data.text || 'GM 응답이 없습니다.')}`]), ...(current.mode === 'combat' && current.combat?.round === 0 && combat ? [battleIntro(combat, hp, maxHpOf(game, current))] : []), ...(drinkNote ? [drinkNote] : []), ...(restNote ? [restNote] : []), ...(debugPin ? [`시스템: [테스트] ${debugPin.name}${josa(debugPin.name, '로')} 이동했습니다.`] : []), ...(storyPin && curMap ? [`시스템: ${curMap.name} / ${storyPin.name}${josa(storyPin.name, '로')} 이동했습니다.`] : []), ...questLog.done.map((q, i) => `시스템: 목표 완료 — ${q}${questLog.doneGivers[i] ? ` (의뢰인 ${questLog.doneGivers[i]})` : ''}`), ...questLog.failed.map(q => `시스템: 목표 실패 — ${q}`), ...affectionNotes.map(n => `시스템: ${n}`), ...(repDelta ? [`시스템: 명성 ${formatReputation(repDelta)} (${reputation.toLocaleString('ko-KR')} · ${reputationRank(reputation)})`] : []), ...(goldDelta ? [`시스템: 골드 ${goldDelta > 0 ? '+' : ''}${goldDelta} (보유 ${characterGold.toLocaleString('ko-KR')})`] : []), ...deserters.map(n => `시스템: ${n}${josa(n, '이')} 실망해 파티를 떠났습니다.`),...questLog.added.map(q => `시스템: 새 목표 — ${q}`), ...(hp !== current.hp && !restNote && !drinkNote ? [`시스템: HP ${current.hp} → ${hp}`] : []),...(add.length ? [`시스템: 획득 — ${add.join(', ')}`] : []), ...(remove.filter((x: string) => !drunk.includes(x)).length ? [`시스템: 사용 — ${remove.filter((x: string) => !drunk.includes(x)).join(', ')}`] : []), ...(goalCompleted && !current.goalCompleted ? ['시스템: 최종 목표 달성 — 게임 완료'] : [])] };
    // Experience: deeds the GM recognised, plus every quest finished this turn.
    const lv = current.level || 1;
    const acts = current.log.filter(e => e.startsWith('플레이어:')).length;
    const eventPays = data.xpGain === 'event' && !event && !data.moveToPinId && !message.startsWith('시스템이 이동을 확정') && acts - (current.lastEventXp ?? -EVENT_XP_GAP) >= EVENT_XP_GAP;
    // Walking somewhere is not an achievement: a deed pays only when the turn produced something the game can see.
    const tangible = !!diceResult?.success || add.length > 0 || questLog.done.length > 0 || questLog.added.length > 0 || !!data.ambush || repDelta !== 0;
    const deed = message.startsWith('시스템이 이동을 확정') || !tangible ? '' : data.xpGain === 'event' && !eventPays ? 'deed' : data.xpGain;
    const earned = deedXp(deed, lv) + questSum('xp') + (rollWon ? rollPay!.xp : 0);
    const grown = withXp(game, { ...result, npcPower: { ...(result.npcPower || {}), ...(data.npcPowers && typeof data.npcPowers === 'object' ? data.npcPowers : {}) } }, earned, questLog.done.length ? '퀘스트 완료' : rollWon ? '판정 성공' : '성장');
    const source = eventPays ? 'event' : questLog.done.length ? 'side' : 'other';
    const itemInfo = { ...(grown.session.itemInfo || {}) };
    gotItems.forEach((v: { name: string; kind?: unknown; desc?: unknown; skill?: unknown }, i: number) => {
      const name = v.name.trim();
      if (name.length > 80 || itemInfo[name]) return;
      const kind: ItemKind = typeof v.kind === 'string' && ['weapon', 'armor', 'accessory', 'item'].includes(v.kind) ? v.kind as ItemKind : infoOf(name).kind;
      const grade: Grade = rollGrade(source, rewardBase(lv));
      itemInfo[name] = { grade, kind, desc: typeof v.desc === 'string' ? v.desc.trim().slice(0, 120) : undefined, skill: rollSkill(kind, grade, typeof v.skill === 'string' ? v.skill : '') };
    });
    // The code guarantees what was earned: one piece of gear per finished quest
    // (up to 2) beyond the gear the GM handed out this turn. The GM only gets to name it.
    const extra: string[] = [], genre = defaultMapGenre(game);
    const owned = (n: string) => (grown.session.inventory || []).includes(n) || extra.includes(n);
    const grant = (grade: Grade, desc: string) => {
      const got = gearName(genre, randomGearKind(), grade, owned);
      // Everything of that grade is already in the bag: a healing potion instead of a copy.
      if (!got) { const p = POTIONS[genre] || POTIONS.fantasy; itemInfo[p.name] = { grade: 0, kind: 'item', desc: p.desc }; extra.push(p.name); return; }
      const { kind, name } = got;
      itemInfo[name] = { grade, kind, desc, skill: rollSkill(kind, grade, '') };
      extra.push(name);
    };
    const gmGear = add.filter(n => itemInfo[n] && itemInfo[n].kind !== 'item').length;
    const gearDue = [...questLog.done.map((q, i) => ({ src: questPays[i].gear, why: `「${q}」의 보수.` })), ...(rollWon && rollPay!.gear ? [{ src: rollPay!.gear, why: `${diceResult!.label} — 성공의 보상.` }] : [])].filter(x => x.src);
    for (let k = gmGear; k < Math.min(2, gearDue.length); k++) grant(rollGrade(gearDue[k].src!, rewardBase(lv)), gearDue[k].why);
    if (extra.length) grown.session = { ...grown.session, inventory: [...(grown.session.inventory || []), ...extra], log: [...grown.session.log, `시스템: 획득 — ${extra.map(n => `[${GRADE_LABELS[itemInfo[n].grade]}] ${n}`).join(', ')}`] };
    if (eventPays && deed === 'event') grown.session = { ...grown.session, lastEventXp: acts };
    grown.session = { ...grown.session, itemInfo, equipped:Object.fromEntries(Object.entries(grown.session.equipped || {}).filter(([, n]) => n && (grown.session.inventory || []).includes(n))) };
    if (questLog.done.length) fx.questClear = { quests: questLog.done.map((name, i) => ({ name, giver: questLog.doneGivers[i] || '', main: false })), next: undefined, xp: earned, reputation: repDelta, total: reputation, items: [...add, ...extra], levelFrom: current.level || 1, levelTo: grown.session.level || 1 };
    else if (grown.levelsGained) fx.levelBurst = grown.session.level || 1;
    // Test command "레벨 50": jump straight to that level, with the stat growth those levels would have given, at full HP.
    const wantLevel = debug ? (typeof data.setLevel === 'number' && data.setLevel > 0 ? data.setLevel : Number((message.match(/(?:레벨|lv\.?)\s*(\d{1,3})/i) || [])[1]) || 0) : 0;
    if (wantLevel) {
      const target = Math.max(1, Math.min(MAX_LEVEL, Math.round(wantLevel)));
      const jumped = growStats(game, { ...grown.session, level: target, xp: 0 }, Math.max(0, target - (grown.session.level || 1)));
      grown.session = { ...jumped.session, hp: maxHpOf(game, jumped.session), log: [...jumped.session.log, `시스템: [테스트] 레벨 → Lv.${target} · 최대 HP ${maxHpOf(game, jumped.session)}`, ...(jumped.note ? [`시스템: ${jumped.note}`] : [])] };
      fx.levelBurst = target;
    }
    // The opening reply (the player hasn't said anything yet) never ends a talk.
    const talkOver = current.mode === 'talk' && !!current.talkNpc && talkTurns(result) >= 1 && (data.endTalk === true || talkTurns(result) >= TALK_LIMIT);
    // A finished talk stays on screen with its last line and the end divider; only 대화 끝내기 closes it.
    // A finished talk is where the player usually takes on something (the 7번 부두 salvage job), so the director reads it now
    // and the current goal follows; before, the first main step stayed on screen for 20 entries of dock work.
    if (talkOver && current.talkNpc) return { ...fx, session: { ...grown.session, talkEnded: true, suggestedActions: [] }, settled: grown.session, major: true };
    if (!grown.session.dead && !grown.session.mode && grown.session.hp <= 0 && current.hp > 0) grown.session = { ...grown.session, dead: true, log: [...grown.session.log, '시스템: 사망 — 체력이 다했습니다.'] };
    if (grown.session.dead) grown.session = { ...grown.session, suggestedActions: [] };
    // The scene that wraps up a fight, a flight or a talk brings no foe: the next one waits for the player's own move
    // (a log had wolves right after goblins, a skeleton right after a spider, a thug right after a talk).
    const aftermath = AFTERMATH.test(message);
    // Turns that can change what comes next are read by the director at once: the player did something no choice offered,
    // a roll decided something, a goal moved, or someone's attitude crossed into another tier. Fights below count too.
    const offPlan = !current.mode && current.typed === true;
    const tierMoved = relationships.some(p => { const b = (current.relationships || []).find(r => r.id === p.id); return !!b && attitudeTier(b.affection).label !== attitudeTier(p.affection).label; });
    const settled = grown.session, major = data.majorScene === true || offPlan || !!diceResult || tierMoved || deserters.length > 0 || questLog.done.length + questLog.failed.length + questLog.added.length > 0;
    if (!grown.session.mode && !grown.session.goalCompleted && !grown.session.dead) {
      const genre = defaultMapGenre(game);
      // A monster the GM set on the player, or an NPC who hates the player, means a fight with no talking first.
      // A foe no quest asked for has to be fair for the player's level (its range starting at most 4 levels above, as
      // for roaming foes); a stronger one is swapped for a fair foe of the place. Before, a word in the narration
      // brought a Lv.33 망령 기사 to a Lv.3 alley scene.
      const placeNow = regionWhere(game, grown.session), lvNow = grown.session.level || 1;
      const askedFoe = !aftermath && typeof data.ambush === 'string' && isDangerous(genre, placeNow) ? findFoe(genre, data.ambush) : undefined;
      const asked = askedFoe;
      const fairFoe = asked && foeLevelRange(asked.power, !!asked.boss)[0] > lvNow + 4 ? pickEncounter(genre, placeNow, lvNow, Math.random, grown.session.recentFoes) : asked;
      const ambush = fairFoe || (debug ? debugFoe(game, current, message) : undefined);
      // An NPC the player just fought or fled from keeps away for CLASH_GAP actions: the GM kept putting 핍 back in the
      // scene, so she blocked the way again every turn.
      const hostile = (grown.session.sceneNpcs || []).find(n => !(grown.session.party || []).includes(n) && playerActs(grown.session) - (grown.session.clashed?.[n] ?? -CLASH_GAP) >= CLASH_GAP && ((grown.session.relationships || []).find(r => r.name.trim() === n.trim())?.affection ?? 0) <= HOSTILE_AFFECTION);
      if (ambush) return { ...fx, settled, major: true, session: { ...grown.session, threat: { npc: ambush.name, monster: true, level: encounterLevel(ambush.power, !!ambush.boss, grown.session.level || 1) }, log: [...grown.session.log, `시스템: 습격! ${ambush.name}${josa(ambush.name, '이')} 앞을 막아섭니다.`] } };
      if (hostile) return { ...fx, settled, major: true, session: { ...grown.session, threat: { npc: hostile, monster: false }, log: [...grown.session.log, `시스템: ${hostile}${josa(hostile, '이')} 적의를 드러내며 앞을 막아섭니다.`] } };
    }
  return { ...fx, session: grown.session, settled, major };
}
