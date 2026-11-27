// One turn's GM reply applied to the session: HP, items, people, goals, rewards, the log, and whatever the scene sets
// on the player next (a monster, a hostile NPC). Pure: no React, no network. The play screen applies the result and
// shows the effects; tests replay recorded replies through it (tests/turn.test.ts).
import { withSettled, stepBeat, passedBy, talkStartIndex, metNames, NPC_LOOKS, unnamedScene, relationOf, placeHeading, heroFits, wasTold, wearNew, rollOutcome, timeOfDay, withDecision, storyFight, storyEnds, gritOf, focusAfter, goalsFinished, goalPath, withNextMain, preparedGoal, ownStoryOpen, currentGoalOf, alikeQuest, FIRST_LIKE_MAX, dismissTemps, storyNpcsAfter, storyFoes, foeLevel, withStory, storyProgress, storyPointsOf, finalBoss, weightOf, questStakes, questWeight, MapPin, cityPlaces, cityOfPlace, defaultMapGenre, defaultCharacterConfig, Game, DiceResult, Session, TALK_LIMIT, EVENT_XP_GAP, talkTurns, questsOf, QUEST_REPUTATION, startGold, applyQuests, clampAffection, attitudeTier, REPUTATION_STEP, clampReputation, reputationRank, formatReputation, knownNpcNames, makeId, AFTERMATH, reachablePins, d, startCombat, debugFoe, HOSTILE_AFFECTION, CLASH_GAP, maxManaOf, maxHpOf, growthFields, growStats, withXp, TALK_ACCEPT, rewardBase, regionWhere, playerActs, HP_REGEN_TURN, restReason, QuestClear, battleIntro, josa, talkEntries, withPlayerLine, QUEST_GOLD, AFFECTION_STEP, AFFECTION_UNIT, MANA_REGEN_TURN, train } from './core';
import { GRADE_LABELS, KIND_LABELS, SKILLS, infoOf, gearOf, bonusText, skillText, enemyGear, gradeForTier, dropChance, rollGrade, rollSkill, randomGearKind, gearName, POTIONS, healShareOf, enemySkill, enemySkillText, type EnemySkill, type Grade, type ItemInfo, type ItemKind, type Equipped } from '../items';
import { foesOf, findFoe, trophyOf, foeImage, isFoeName, isDangerous, pickEncounter, ENCOUNTER_CHANCE, huntTarget, HUNT_CHANCE, foeInText, wordIn, type Foe } from '../monsters';
import { POWER_TIERS, MAX_POWER, MAX_LEVEL, foeLevelRange, enemyStats, levelBonus, gainXp, xpToNext, storyLevel, storyLevelAt, xpToReach, battleXp, questXp, deedXp, levelForTier, tierOfLevel, encounterLevel, companionStats } from '../progression';


// What the screen shows besides the new session; it adds the timestamps (keys) itself.
export type TurnEffects = { notice?: string; repBurst?: { delta: number; total: number }; questClear?: Omit<QuestClear, 'key'>; levelBurst?: number };
// session: the new state (with a threat when a fight or a hostile NPC comes next). settled: the same turn without that
// threat, for the story summary and the director. major: the director should read this turn now.
export type TurnResult = TurnEffects & { session: Session; settled: Session; major: boolean };
// settle: no reply to apply, only what the game itself has already decided (a won fight's goals, page.tsx finishBattle): the
// goals it finished close and pay now, with the clear window, before the scene after the fight is written.
export type TurnContext = { event?: { id: string; text: string; trigger: string }; diceResult?: DiceResult; debug?: boolean; settle?: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyReply(game: Game, current: Session, data: any, message: string, { event, diceResult, debug = false, settle = false }: TurnContext = {}): TurnResult {
  const fx: TurnEffects = {};
  // The heading's time is the game clock's (timeOfDay), whatever the writer put there.
  if (typeof data.text === 'string' && !debug) data.text = placeHeading(game, current, data.text).replace(/^(\s*【[^】·]+·\s*)[^】]*】/, `$1${timeOfDay(current)}】`);
  // The scene that wraps up a fight, a flight or a talk (its prompt carries that fight's numbers).
  const aftermath = AFTERMATH.test(message);
  // The numbers are the game's (2026-11-19 playtest). The bookkeeper reads the log, so it took a fight's "받은 피해 68" off a
  // second time (a won fight ended in death), echoed the last fight's -11 inside a talk, and took back a roll's +40 gold and
  // +30 fame on the next turn. It may still report harm or care the scene itself did (a trap, a healer), within limits, and
  // gold the player handed over or took in a deal that named the amount; fame, rewards and gear are paid by the game alone.
  if (!debug) {
    const max = maxHpOf(game, current), hpSaid = Number(data.hpDelta) || 0;
    data.hpDelta = current.mode === 'combat' ? data.hpDelta : current.mode === 'talk' || aftermath || settle || message.startsWith('시스템이 이동을 확정') ? 0
      : Math.max(Math.min(-1, -Math.round(max * 0.2)), Math.min(Math.round(max * 0.3), Math.trunc(hpSaid)));
    // Scene harm stops at 1: only a fight kills.
    if (data.hpDelta < 0 && current.mode !== 'combat') data.hpDelta = Math.max(data.hpDelta, 1 - current.hp);
    // Gold moves as the writer said ([골드]). After a fight the game has settled the drop or the loss itself and tells the writer
    // so ("게임이 이미 줌/뺐음", page.tsx finishBattle); what else changed hands in that scene is the writer's.
    data.goldDelta = Math.round(Number(data.goldDelta) || 0);
    data.reputationDelta = 0;
    // Gear comes from fights and finished goals (the game's tables); other gear the scene hands over is kept as a story thing,
    // never worn (the scenes kept mentioning a sword the bag didn't have, 2026-11-20). What was obtained is the bookkeeper's
    // reading; the player's words no longer have to say "챙긴다" (user 2026-11-26). A goal's reward it names is graded below.
    const rewardTurn = Array.isArray(data.completedQuests) && data.completedQuests.length > 0;
    if (Array.isArray(data.addItems)) data.addItems = data.addItems.flatMap((v: unknown) => { const name = typeof v === 'string' ? v : String((v as { name?: unknown })?.name || ''), kind = typeof v === 'object' && v && typeof (v as { kind?: unknown }).kind === 'string' ? (v as { kind: string }).kind : infoOf(name, current.itemInfo).kind; return !name.trim() ? [] : (kind === 'item' && !infoOf(name, current.itemInfo).grade) || rewardTurn ? [v] : [{ name, kind: 'item', desc: typeof v === 'object' && v ? (v as { desc?: unknown }).desc : undefined, story: true }]; });
  }
  // A roll's numbers are the game's, by its weight; what the writer and the bookkeeper wrote is the story, not the payout.
  // A small attempt that simply worked (no die thrown, page.tsx) pays nothing of its own.
  // What it costs or pays follows the situation the roll was about (rollOutcome): body, money, a person, a thing, a name.
  const rollPay = diceResult && diceResult.die > 0 ? rollOutcome(game, current, { weight: diceResult.weight, dc: diceResult.dc, success: diceResult.onSuccess, failure: diceResult.onFailure, person: diceResult.person }, diceResult.success, diceResult.critical) : undefined;
  // The roll's own cost (the hurt of a failure) is the game's and the writer is told so; what else the scene moved is the writer's tags.
  if (diceResult && rollPay && !diceResult.success) data.hpDelta = (Number(data.hpDelta) || 0) - rollPay.hp;
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
    // A healing item heals when the bookkeeper read it used (it raised hpDelta); one handed to someone just leaves the bag.
    const used = Number(data.hpDelta) > 0;
    for (const item of remove) { const idx = inventory.indexOf(item); if (idx < 0) continue; inventory.splice(idx, 1); const share = healShareOf(item, infoOf(item, current.itemInfo)); if (share > 0 && used) { potionHeal += Math.round(maxHpOf(game, current) * share); drunk.push(item); } }
    if (potionHeal > 0) hp = Math.max(hp, Math.min(maxHpOf(game, current), current.hp + potionHeal));
    // Natural recovery on a calm turn: no fight, no threat, and the scene didn't hurt the player.
    const hpBeforeRest = hp;
    if (!settle && current.mode !== 'combat' && !current.threat && hp > 0 && hp >= current.hp && hp < maxHpOf(game, current)) hp = Math.min(maxHpOf(game, current), hp + Math.max(1, Math.round(maxHpOf(game, current) * HP_REGEN_TURN)));
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
    const because: Record<string, string> = {};
    if (Array.isArray(data.relationshipUpdates)) {
      for (const raw of data.relationshipUpdates.slice(0, 12)) {
        if (!raw || typeof raw.name !== 'string' || isFoeName(defaultMapGenre(game), raw.name)) continue;
        const name = raw.name.trim().slice(0, 50);
        if (!name || name === (game.characterConfig || defaultCharacterConfig()).initialName) continue;
        const index = relationships.findIndex(p => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
        if (index < 0 && raw.met !== true) continue;
        // Only this world's people join the relations; a name made up in a scene does not (user 2026-11-27: no nameless people).
        if (index < 0 && !debug && !knownNpcNames(game, current).includes(name)) continue;
        const previous = index >= 0 ? relationships[index] : undefined;
        const relation = typeof raw.relation === 'string' && raw.relation.trim() ? raw.relation.trim().slice(0, 30) : previous ? (!previous.relation || previous.relation === '초면' ? '지인' : previous.relation) : '초면'; // met before: no longer 초면 (브리아 stayed 초면 after many dealings)
        // A first meeting sets a first impression; after that the GM only says how much this scene moved it, and the game
        // adds it up. When the GM wrote the whole value, it echoed a stale one: a finished quest's +5 came back as -5.
        // One scene moves affection by at most AFFECTION_STEP, so a single line can't flip a friend into an enemy; test commands are exempt.
        const proposed = typeof raw.affection === 'number' && Number.isFinite(raw.affection) ? clampAffection(raw.affection) : undefined;
        const change0 = typeof raw.affectionChange === 'number' && Number.isFinite(raw.affectionChange) ? raw.affectionChange : 0;
        // Whether a deed moves them again is the writer's: the log line names why goodwill last rose (affectionNotes).
        const change = change0;
        if (change && typeof raw.because === 'string' && raw.because.trim()) because[name] = raw.because.trim().slice(0, 40);
        // How much a scene moves goodwill is the game's: the bookkeeper says which way (AFFECTION_UNIT a scene).
        const affection = !previous ? (proposed === undefined ? 0 : debug ? proposed : clampAffection(Math.max(-40, Math.min(FIRST_LIKE_MAX, proposed)))) : debug && proposed !== undefined ? proposed : clampAffection(previous.affection + Math.sign(change) * AFFECTION_UNIT);
        const person = { id: previous?.id || makeId(), name: previous?.name || name, relation, affection };
        if (index >= 0) relationships[index] = person;
        else if (relationships.length < 100) relationships.push(person);
      }
    }
    const offeredBy = (x: unknown) => x && typeof x === 'object' ? String((x as { giver?: unknown }).giver || '').trim() || (current.mode === 'talk' ? current.talkNpc || '' : '') : '';
    // Offers land on prepared stories only; one that matches none (or the giver's story already running) adds no goal.
    const offerText = (x: unknown) => typeof x === 'string' ? x : x && typeof x === 'object' ? String((x as { text?: unknown }).text || '') : '';
    // This turn's own lines (the player's words, the scene or the talk reply), the same ones the log gets below.
    // A thing the partner noticed is told once per talk: the writer names it on every reply that leans on it (에드리아's
    // [소지품: 인장 반지] twice in one talk, 2026-11-20).
    const noticed = current.mode === 'talk' && typeof data.howKnown === 'string' ? data.howKnown.match(/^\[소지품: [^\]]+\]/)?.[0] : undefined;
    if (noticed && current.log.slice(Math.max(0, talkStartIndex(current.log, current.talkNpc || ''))).some(l => l.startsWith(`대화-단서: ${noticed}`))) data.howKnown = '';
    // A step is done when the writer says it wrote it out ([단계 완료]), and only then (user 2026-11-27). The writer already told
    // what it brought, so the game keeps it in delivered, not in a line of its own (that told it twice).
    const judged = !debug && data.stepDone === true ? stepBeat(game, current) : undefined;
    const turnLog = settle ? current.log : [...withPlayerLine(current.log, current.mode === 'talk' ? data.playerLine : ''), ...(current.mode === 'talk' && current.talkNpc && !data.talkLeft ? [...talkEntries(current.talkNpc, data)] : [`GM: ${debug ? String(data.text || 'GM 응답이 없습니다.') : unnamedScene(String(data.text || 'GM 응답이 없습니다.'), metNames(current))}`])];
    // The opening reply (the player hasn't said anything yet) never ends a talk.
    const talking = current.mode === 'talk' && !!current.talkNpc ? talkTurns({ ...current, log: turnLog }) : 0;
    const talkOver = talking >= 1 && (data.endTalk === true || talking >= TALK_LIMIT);
    // Goals are judged on what this turn did, a talk ending now counting as ended: judged on the turn before, a goal
    // whose last step was the report to 에드리아 closed only after the hero had set off for the next place.
    const delivered = judged && current.delivered && !wasTold(current.delivered, judged.then) ? [...current.delivered, judged.then] : current.delivered;
    const seen = { ...current, delivered, log: [...turnLog, ...(talkOver ? [`시스템: ${current.talkNpc}${josa(current.talkNpc!, '와')}의 대화가 끝났습니다.`] : [])] };
    if (!debug) {
      data.completedQuests = [...(Array.isArray(data.completedQuests) ? data.completedQuests : []), ...goalsFinished(game, seen)];
    }
    const closing = applyQuests(questsOf(current), { completedQuests: data.completedQuests, failedQuests: data.failedQuests }).done;
    // A job the hero took in a talk is the writer's [대화 끝: … | 맡은 일], the one say on it (the bookkeeper's own list there was a second):
    // 레지나's 창고와 부엌 정리 was taken, the bookkeeper's addQuests came back empty, and her story never started (2026-11-23).
    const taken = current.mode === 'talk' && current.talkNpc && typeof data.task === 'string' && data.task ? [{ text: data.task, giver: current.talkNpc }] : [];
    const addQuests = [...(current.mode !== 'talk' && Array.isArray(data.addQuests) ? data.addQuests : []), ...taken].flatMap((x: unknown) => { const giver = offeredBy(x), q = ownStoryOpen(game, questsOf(current).filter(q => !closing.includes(q)), giver) ? '' : preparedGoal(game, current, offerText(x), giver, closing); return q ? [{ text: q, giver }] : []; }).filter((o, i, all) => all.findIndex(p => p.text === o.text) === i);
    let questLog0 = withNextMain(game, current, applyQuests(questsOf(current), { ...data, addQuests }, current.questGivers || {}));
    // A next step the log already shows done (it happened before it became the goal) closes as it comes, and the one after follows.
    for (let k = 0; k < 8 && !debug; k++) {
      const over = questLog0.added.filter(q => goalsFinished(game, { ...seen, quests: [q] }).length);
      if (!over.length) break;
      const left = (q: string) => !over.includes(q);
      questLog0 = withNextMain(game, current, { ...questLog0, quests: questLog0.quests.filter(left), added: questLog0.added.filter(left), done: [...questLog0.done, ...over], doneGivers: [...questLog0.doneGivers, ...over.map(() => '')] });
    }
    // The hidden task (a talk's settled job) ends quietly when the GM closes it: no goal line, no purse.
    const taskText = current.task?.text || '', taskEnds = !!taskText && [data.completedQuests, data.failedQuests].flat().some((c: unknown) => typeof c === 'string' && (c.trim() === taskText || alikeQuest(taskText, c.trim())));
    // A quest with no recorded giver (the story's opening main quest) that closes in a talk counts the talk partner as its giver.
    const questLog = { ...questLog0, doneGivers: questLog0.doneGivers.map(g => g || (current.mode === 'talk' ? current.talkNpc || '' : '')) };
    // Each finished goal pays by its weight (where it came from), not one fixed purse for all.
    const questPays = questLog.done.map(q => questStakes(questWeight(game, q), current.level || 1));
    const questSum = (k: 'xp' | 'gold' | 'rep') => questPays.reduce((a, p) => a + p[k], 0);
    const exercised = Array.isArray(data.trained) ? data.trained.filter((id: unknown): id is string => typeof id === 'string' && growthFields(game).some(f => f.id === id)).slice(0, 2) : [];
    // What the game pays a person (a finished job, a roll about them) replaces the bookkeeper's change for them this turn;
    // stacked, one turn moved someone three times over.
    const gamePaid = new Set<string>();
    const pay = (name: string, by: number) => { const i = relationships.findIndex(p => p.name.trim() === name.trim()); if (i < 0) return; const was = (current.relationships || []).find(r => r.id === relationships[i].id); const base = gamePaid.has(name) || !was ? relationships[i].affection : was.affection; gamePaid.add(name); relationships[i] = { ...relationships[i], affection: clampAffection(base + by) }; };
    // A talk's [명성] is the writer's (it is told a deed told again was paid when done); the talk writer has no [성장].
    if (current.mode === 'talk') data.xpGain = undefined;
    const repDelta = (typeof data.reputationDelta === 'number' && Number.isFinite(data.reputationDelta) ? Math.max(-REPUTATION_STEP, Math.min(REPUTATION_STEP, Math.round(data.reputationDelta))) : 0) + questSum('rep');
    // Every affection change is spelled out, so the player sees what their choices did.
    // A first meeting's impression too: the relationship tab showed goodwill the log never mentioned (2026-11-19 playtest).
    if (rollPay?.person) pay(rollPay.person.name, rollPay.person.by);
    const affectionNotes = relationships.flatMap(p => { const before = (current.relationships || []).find(r => r.id === p.id); const diff = before ? p.affection - before.affection : p.affection; return diff ? [`${p.name} ${before ? '호감도' : '첫인상'} ${diff > 0 ? '+' : ''}${diff} (${attitudeTier(p.affection).label})${because[p.name] ? ` — ${because[p.name]}` : ''}`] : []; });
    if (affectionNotes.length) fx.notice = affectionNotes.join(' · ');
    const reputation = clampReputation((current.reputation || 0) + repDelta);
    // Quests pay a fixed purse; the GM reports only what the scene itself moved (a trade, a bribe, loot). Never below 0.
    const goldBefore = current.characterGold ?? startGold(game);
    const goldDelta = Math.max(-goldBefore, (typeof data.goldDelta === 'number' && Number.isFinite(data.goldDelta) ? Math.round(data.goldDelta) : 0) + questSum('gold'));
    const characterGold = goldBefore + goldDelta;
    // A big deed gets its own fanfare instead of a quiet log line.
    if (Math.abs(repDelta) >= 300 && !questLog.done.length) fx.repBurst = { delta: repDelta, total: reputation };
    // A companion who has come to dislike the player walks out.
    // Only a fall below 0 now: someone the writer had join while cool to the hero (`[대화 끝: … | 함께]`) stays.
    const deserters = (current.party || []).filter(n => (relationships.find(r => r.name.trim() === n.trim())?.affection ?? 0) < 0 && ((current.relationships || []).find(r => r.name.trim() === n.trim())?.affection ?? 0) >= 0);
    const party = (current.party || []).filter(n => !deserters.includes(n));
    // The game ends only when its final boss falls (finishBattle sets bossDown), whichever way the player came.
    const goalCompleted = current.goalCompleted === true || current.bossDown === true;
    // Named people come from the game's cast (portraits, prompt NPC list, people already met) or were just met in this scene (relationships above).
    const knownNpcs = knownNpcNames(game, current);
    // Who is on stage is the writer's [등장] (presentNpcs, user 2026-11-27), for people the game knows.
    const sceneText = String(data.text || ''), onStage = current.sceneNpcs || [];
    const sceneNpcs = Array.isArray(data.presentNpcs) ? [...new Set(data.presentNpcs.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim()).filter((v: string) => !!v && (debug || ((!knownNpcs.length || knownNpcs.includes(v) || relationships.some(r => r.name === v))))))].slice(0, 3) as string[] : onStage;
    // A talk or fight keeps its partner on stage; the encounter prompt only returns for newcomers.
    // Companions travel with the player, so the GM naming one in the scene never turns into a fresh encounter.
    // Who was dealt with is cleared by the game's own moves (moveTo, walkInTown), never by a heading.
    const handledBefore = current.handledNpcs || [];
    const talkTo = !current.mode && typeof data.talkTo === 'string' ? data.talkTo : '';
    const passed = passedBy(current);
    const stageNpcs = current.mode ? (current.sceneNpcs || []) : talkTo ? [...new Set([talkTo, ...sceneNpcs])].slice(0, 3) : [...new Set([...sceneNpcs.filter(n => !(current.party || []).includes(n) && !isFoeName(defaultMapGenre(game), n) && (debug || !handledBefore.includes(n)))])].slice(0, 3);
    // A test action may also teleport within the current map.
    const debugPin = debug && typeof data.moveToPinId === 'string' ? (game.maps || []).find(m => m.id === current.mapId)?.pins.find(p => p.id === data.moveToPinId && p.id !== current.pinId && p.kind !== 'event' && p.kind !== 'exit') : undefined;
    const handledNpcs = talkTo ? handledBefore.filter(n => n !== talkTo) : handledBefore;
    // Whatever an NPC's strength turns out to be the first time, it stays that way for every later fight.
    const knownFoe = current.combat ? current.npcCombat?.[current.combat.npc] : undefined;
    const combat = current.mode === 'combat' && current.combat ? (current.combat.round === 0 ? startCombat(current.combat, knownFoe || data.enemy) : { ...current.combat, itemUse: undefined }) : current.combat;
    const npcCombat = current.mode === 'combat' && current.combat?.round === 0 && combat && !knownFoe ? { ...(current.npcCombat || {}), [combat.npc]: { hp: combat.enemyMaxHp, dc: combat.enemyDc, damage: combat.enemyDamage, power: combat.power } } : current.npcCombat;
    // No stand-in choices: a scene that ends without any gets them drawn by the play screen (drawChoicesIfStuck).
    const nextActions = settle ? current.suggestedActions || [] : current.mode === 'combat' ? [] : current.mode === 'talk' ? suggestedActions.slice(0, 3) : suggestedActions;
    // A voice is fixed the first time an NPC speaks and never rewritten afterwards.
    const npcVoices = { ...(current.npcVoices || {}) };
    for (const v of Array.isArray(data.npcVoices) ? data.npcVoices : []) if (v && typeof v.name === 'string' && typeof v.style === 'string' && !npcVoices[v.name]) npcVoices[v.name] = v.style;
    const manaMax = maxManaOf(game, current);
    const choiceDest = data.goes && typeof data.goes === 'object' ? data.goes as Record<string, string> : undefined;
    const choiceTalk = data.talks && typeof data.talks === 'object' ? data.talks as Record<string, string> : undefined;
    const choiceFight = data.fights && typeof data.fights === 'object' ? data.fights as Record<string, string> : undefined;
    // A moment the writer marked as mattering (a step done, a job taken, ended or failed, a talk over) is the next save point.
    const marked = !!judged || questLog.added.length + questLog.done.length + questLog.failed.length > 0 || talkOver;
    const result: Session = dismissTemps({ ...train(current, exercised), ...(marked ? { savePoint: true } : {}), ...(Array.isArray(data.settled) && data.settled.length ? { settled: withSettled(current.settled, data.settled) } : {}), choiceDest, choiceTalk, choiceFight, delivered, ...(taskEnds ? { task: undefined } : {}), typed: undefined, ...(!current.mode ? { talkPurpose: talkTo && !/^(시스템|전투 결과)/.test(message) ? { npc: talkTo, action: message } : undefined } : {}), ...(manaMax > 0 && !gritOf(game, current) && current.mode !== 'combat' && !settle ? { mana: Math.min(manaMax, (current.mana ?? manaMax) + Math.round(manaMax * MANA_REGEN_TURN)) } : {}), npcVoices, relationships: relationships.map(r => (current.relationships || []).some(p => p.id === r.id) ? { ...r, relation: relationOf(game, party, r) } : r), storyNpcs: storyNpcsAfter(current, relationships), quests: questLog.quests, questGivers: questLog.givers, ...(questLog.added.length ? { focus: focusAfter(game, currentGoalOf(current), questLog.quests, questLog.added), focusAt: current.log.length } : {}), reputation, characterGold, party, npcCombat, goalCompleted, sceneNpcs: stageNpcs, handledNpcs: debug ? handledNpcs.filter(n => !stageNpcs.includes(n)) : handledNpcs, combat, suggestedActions: nextActions, hp, inventory, flags, activeImageKey, ...(debugPin ? { pinId: debugPin.id } : {}),
      log: [...turnLog, ...(current.mode === 'combat' && current.combat?.round === 0 && combat ? [battleIntro(combat, hp, maxHpOf(game, current))] : []), ...(drinkNote ? [drinkNote] : []), ...(restNote ? [restNote] : []), ...(debugPin ? [`시스템: [테스트] ${debugPin.name}${josa(debugPin.name, '로')} 이동했습니다.`] : []), ...questLog.done.map((q, i) => `시스템: 목표 완료 — ${q}${questLog.doneGivers[i] ? ` (의뢰인 ${questLog.doneGivers[i]})` : ''}`), ...questLog.failed.map(q => `시스템: 목표 실패 — ${q}`), ...affectionNotes.map(n => `시스템: ${n}`), ...(repDelta ? [`시스템: 명성 ${formatReputation(repDelta)} (${reputation.toLocaleString('ko-KR')} · ${reputationRank(reputation)})`] : []), ...(goldDelta ? [`시스템: 골드 ${goldDelta > 0 ? '+' : ''}${goldDelta} (보유 ${characterGold.toLocaleString('ko-KR')})`] : []), ...deserters.map(n => `시스템: ${n}${josa(n, '이')} 실망해 파티를 떠났습니다.`),...questLog.added.map(q => `시스템: 새 목표 — ${q}`), ...(hp !== current.hp && !restNote && !drinkNote ? [`시스템: HP ${current.hp} → ${hp}`] : []),...(add.length ? [`시스템: 획득 — ${add.join(', ')}`] : []), ...(remove.filter((x: string) => !drunk.includes(x)).length ? [`시스템: 사용 — ${remove.filter((x: string) => !drunk.includes(x)).join(', ')}`] : []), ...(goalCompleted && !current.goalCompleted ? ['시스템: 최종 목표 달성 — 게임 완료'] : [])] });
    // Experience: deeds the GM recognised, plus every quest finished this turn.
    const lv = current.level || 1;
    const acts = current.log.filter(e => e.startsWith('플레이어:')).length;
    const eventPays = data.xpGain === 'event' && !event && !data.moveToPinId && !message.startsWith('시스템이 이동을 확정') && acts - (current.lastEventXp ?? -EVENT_XP_GAP) >= EVENT_XP_GAP;
    // Walking somewhere is not an achievement: a deed pays only when the turn produced something the game can see.
    const tangible = !!diceResult?.success || add.length > 0 || questLog.done.length > 0 || questLog.added.length > 0 || !!data.ambush || repDelta !== 0;
    const deed = message.startsWith('시스템이 이동을 확정') || !tangible ? '' : data.xpGain === 'event' && !eventPays ? 'deed' : data.xpGain;
    // A finished goal brings the hero at least to the level the story's new progress calls for (storyLevel).
    const story = questLog.done.length ? storyProgress(game, { ...current, storyPoints: (current.storyPoints || 0) + storyPointsOf(game, questLog.done) }) : undefined;
    const catchUp = story ? xpToReach(lv, current.xp || 0, storyLevelAt(story.done / story.total)) : 0;
    const earned = deedXp(deed, lv) + Math.max(questSum('xp'), catchUp);
    const grown = withXp(game, { ...result, npcPower: { ...(result.npcPower || {}), ...(data.npcPowers && typeof data.npcPowers === 'object' ? data.npcPowers : {}) } }, earned, questLog.done.length ? '퀘스트 완료' : '성장');
    const source = eventPays ? 'event' : questLog.done.length ? 'side' : 'other';
    const itemInfo = { ...(grown.session.itemInfo || {}) };
    gotItems.forEach((v: { name: string; kind?: unknown; desc?: unknown; skill?: unknown }, i: number) => {
      const name = v.name.trim();
      if (name.length > 80 || itemInfo[name]) return;
      const kind: ItemKind = typeof v.kind === 'string' && ['weapon', 'armor', 'accessory', 'item'].includes(v.kind) ? v.kind as ItemKind : infoOf(name).kind;
      const grade: Grade = (v as { story?: unknown }).story ? 0 : rollGrade(source, rewardBase(lv));
      itemInfo[name] = { grade, kind, desc: typeof v.desc === 'string' ? v.desc.trim().slice(0, 120) : undefined, skill: rollSkill(kind, grade, typeof v.skill === 'string' ? v.skill : '') };
    });
    // The code guarantees what was earned: one piece of gear per finished quest
    // (up to 2) beyond the gear the GM handed out this turn. The GM only gets to name it.
    const extra: string[] = [], genre = defaultMapGenre(game);
    const owned = (n: string) => (grown.session.inventory || []).includes(n) || extra.includes(n);
    const grant = (grade: Grade, desc: string) => {
      const got = gearName(genre, randomGearKind(), grade, owned, Math.random, heroFits(game, current));
      // Everything of that grade is already in the bag: a healing potion instead of a copy.
      if (!got) { const p = POTIONS[genre] || POTIONS.fantasy; itemInfo[p.name] = { grade: 0, kind: 'item', desc: p.desc }; extra.push(p.name); return; }
      const { kind, name } = got;
      itemInfo[name] = { grade, kind, desc, skill: rollSkill(kind, grade, '') };
      extra.push(name);
    };
    const gmGear = add.filter(n => itemInfo[n] && itemInfo[n].kind !== 'item').length;
    const gearDue = [...questLog.done.map((q, i) => ({ src: questPays[i].gear, why: `「${q}」의 보수.` }))].filter((x, i) => x.src && storyEnds(game, questLog.done[i]));
    for (let k = gmGear; k < Math.min(2, gearDue.length); k++) grant(rollGrade(gearDue[k].src!, rewardBase(lv)), gearDue[k].why);
    if (extra.length) grown.session = { ...grown.session, inventory: [...(grown.session.inventory || []), ...extra], log: [...grown.session.log, `시스템: 획득 — ${extra.map(n => `[${GRADE_LABELS[itemInfo[n].grade]}] ${n}`).join(', ')}`] };
    if (eventPays && deed === 'event') grown.session = { ...grown.session, lastEventXp: acts };
    grown.session = withStory(game, grown.session, questLog.done);
    grown.session = { ...grown.session, itemInfo, equipped:Object.fromEntries(Object.entries(grown.session.equipped || {}).filter(([, n]) => n && (grown.session.inventory || []).includes(n))) };
    grown.session = wearNew(game, grown.session, (grown.session.inventory || []).filter((n, i, all) => all.slice(0, i + 1).filter(x => x === n).length > (current.inventory || []).filter(x => x === n).length));
    if (questLog.done.length) fx.questClear = { quests: questLog.done.map((name, i) => ({ name, giver: questLog.doneGivers[i] || '' })), xp: earned, reputation: repDelta, total: reputation, gold: goldDelta, items: [...add, ...extra], levelFrom: current.level || 1, levelTo: grown.session.level || 1, next: currentGoalOf(grown.session) };
    else if (grown.levelsGained) fx.levelBurst = grown.session.level || 1;
    // Test command "레벨 50": jump straight to that level, with the stat growth those levels would have given, at full HP.
    const wantLevel = debug ? (typeof data.setLevel === 'number' && data.setLevel > 0 ? data.setLevel : Number((message.match(/(?:레벨|lv\.?)\s*(\d{1,3})/i) || [])[1]) || 0) : 0;
    if (wantLevel) {
      const target = Math.max(1, Math.min(MAX_LEVEL, Math.round(wantLevel)));
      const jumped = growStats(game, { ...grown.session, level: target, xp: 0 }, Math.max(0, target - (grown.session.level || 1)));
      grown.session = { ...jumped.session, hp: maxHpOf(game, jumped.session), log: [...jumped.session.log, `시스템: [테스트] 레벨 → Lv.${target} · 최대 HP ${maxHpOf(game, jumped.session)}`, ...(jumped.note ? [`시스템: ${jumped.note}`] : [])] };
      fx.levelBurst = target;
    }
    // A finished talk stays on screen with its last line and the end divider; only 대화 끝내기 closes it.
    // A finished talk is where the player usually takes on something (the 7번 부두 salvage job), so the director reads it now
    // and the current goal follows; before, the first main step stayed on screen for 20 entries of dock work.
    if (talkOver && current.talkNpc) return { ...fx, session: { ...grown.session, talkEnded: true, suggestedActions: [] }, settled: grown.session, major: true };
    // No death (user 2026-11-23): health run out outside a fight leaves the hero at 1.
    if (!grown.session.mode && grown.session.hp <= 0 && current.hp > 0) grown.session = { ...grown.session, hp: 1, log: [...grown.session.log, '시스템: 쓰러질 뻔했지만 간신히 버텼습니다 (HP 1)'] };
    if (settle) return { ...fx, session: grown.session, settled: grown.session, major: questLog.done.length > 0 };
    // A decision the goal waits on is offered as the game's own options, word for word, so picking one is the decision; the
    // writer's choices fill the rest.
    grown.session = withDecision(game, grown.session);
    // The scene that wraps up a fight, a flight or a talk brings no foe: the next one waits for the player's own move
    // (a log had wolves right after goblins, a skeleton right after a spider, a thug right after a talk).
    // Turns that can change what comes next are read by the director at once: the player did something no choice offered,
    // a roll decided something, a goal moved, or someone's attitude crossed into another tier. Fights below count too.
    const met = grown.session.ambushNext;
    if (met) grown.session = { ...grown.session, ambushNext: undefined };
    const offPlan = !current.mode && current.typed === true;
    const tierMoved = relationships.some(p => { const b = (current.relationships || []).find(r => r.id === p.id); return !!b && attitudeTier(b.affection).label !== attitudeTier(p.affection).label; });
    const settled = grown.session, major = data.majorScene === true || offPlan || !!diceResult || tierMoved || deserters.length > 0 || questLog.done.length + questLog.failed.length + questLog.added.length > 0;
    if (!grown.session.mode && !grown.session.goalCompleted) {
      // A foe met on the move blocks the way only after the arrival scene is read (user: no fight straight off the map).
      // The final boss is the story's fight at 100% (storyFight): it comes out when the scene AI has it attack; it falling ends the game.
      if (met) return { ...fx, settled, major: true, session: { ...grown.session, threat: met, log: [...grown.session.log, `시스템: 습격! ${met.npc}${josa(met.npc, '이')} 앞을 막아섭니다.`] } };
      const genre = defaultMapGenre(game);
      // A monster the GM set on the player, or an NPC who hates the player, means a fight with no talking first.
      // A foe no quest asked for has to be fair for the player's level (its range starting at most 4 levels above, as
      // for roaming foes); a stronger one is swapped for a fair foe of the place. Before, a word in the narration
      // brought a Lv.33 망령 기사 to a Lv.3 alley scene.
      const placeNow = regionWhere(game, grown.session), lvNow = grown.session.level || 1;
      // The story's foe comes where the bookkeeper read it attack, a town's dock too.
      const askedFoe = !aftermath && typeof data.ambush === 'string' && (isDangerous(genre, placeNow) || data.ambush === storyFight(game, grown.session)?.foe) ? findFoe(genre, data.ambush) : undefined;
      // The current goal's foe is fought as written; a later story step's foe is swapped like an unfair one.
      const { now: goalFoes, later } = storyFoes(game, grown.session);
      const asked = askedFoe;
      const fairFoe = asked && !goalFoes.includes(asked.name) && (later.includes(asked.name) || foeLevelRange(asked.power, !!asked.boss)[0] > lvNow + 4) ? pickEncounter(genre, placeNow, lvNow, Math.random, grown.session.recentFoes, later) : asked;
      const ambush = fairFoe || (debug ? debugFoe(game, current, message) : undefined);
      // An NPC the player just fought or fled from keeps away for CLASH_GAP actions: the GM kept putting 핍 back in the
      // scene, so she blocked the way again every turn.
      const hostile = (grown.session.sceneNpcs || []).find(n => !(grown.session.party || []).includes(n) && playerActs(grown.session) - (grown.session.clashed?.[n] ?? -CLASH_GAP) >= CLASH_GAP && ((grown.session.relationships || []).find(r => r.name.trim() === n.trim())?.affection ?? 0) <= HOSTILE_AFFECTION);
      if (ambush) return { ...fx, settled, major: true, session: { ...grown.session, threat: { npc: ambush.name, monster: true, level: foeLevel(game, grown.session, ambush), ...(ambush.name === askedFoe?.name ? { told: true } : {}) }, log: [...grown.session.log, ambush.name === finalBoss(game) ? `시스템: 최종 보스 ${ambush.name}${josa(ambush.name, '이')} 모습을 드러냅니다!` : `시스템: 습격! ${ambush.name}${josa(ambush.name, '이')} 앞을 막아섭니다.`] } };
      if (hostile) return { ...fx, settled, major: true, session: { ...grown.session, threat: { npc: hostile, monster: false }, log: [...grown.session.log, `시스템: ${hostile}${josa(hostile, '이')} 적의를 드러내며 앞을 막아섭니다.`] } };
    }
  return { ...fx, session: grown.session, settled, major };
}
