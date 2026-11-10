'use client';


import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, Dices, Download, Droplet, Flag, FolderOpen, Heart, Info, Moon, Sun, Coins, Image as ImageIcon, Map as MapIcon, MapPin as MapPinIcon, EyeOff, Footprints, MessageCircle, Package, Plus, Play, RotateCcw, ScrollText, Send, Shield, Swords, Zap, Settings2, Sparkles, Trash2, Upload, Users, X, Award , Skull, Trophy } from 'lucide-react';
import { mainPrologue } from './_lib/prologues';
import { applyReply, scenePin } from './_lib/game/turn';
import type { GmBody } from './_lib/game/gm-contract';
import { beatGoal, type Beat } from './_lib/quest-beats';
import { TRAVEL_VERB } from './_lib/travel';
import { REGION_QUESTS, type RegionQuest } from './_lib/regional-quests';
import { EXTRA_REGION_QUESTS } from './_lib/regional-quests-extra';
import GENRE_REF from './api/prompt/_lib/genre-reference.json';
import { mainSections } from './api/prompt/_lib/reference-builder';
import { GRADE_LABELS, KIND_LABELS, SKILLS, infoOf, gearOf, bonusText, skillText, enemyGear, gradeForTier, dropChance, rollGrade, rollSkill, randomGearKind, gearName, POTIONS, healShareOf, enemySkill, enemySkillText, type EnemySkill, type Grade, type ItemInfo, type ItemKind, type Equipped } from './_lib/items';
import { foesOf, findFoe, trophyOf, foeImage, isFoeName, isDangerous, pickEncounter, ENCOUNTER_CHANCE, huntTarget, HUNT_CHANCE, foeInText, type Foe } from './_lib/monsters';
import { POWER_TIERS, MAX_POWER, MAX_LEVEL, foeLevelRange, enemyStats, levelBonus, gainXp, xpToNext, battleXp, questXp, mainQuestXp, deedXp, levelForTier, tierOfLevel, encounterLevel, companionStats } from './_lib/progression';
import { refitHp, npcWhereabouts, weightOf, checkDc, checkStakes, WEIGHT_LABEL, RuleItem, START_SECTION, extractRuleItems, combinedStartingItems, NpcPortrait, ImageRow, ImageColumn, ImageCell, Asset, MapPin, MapLink, BoardMap, DEFAULT_MAP_NAMES, GENRE_REF_KEY, cityPlaceCache, cityPlaces, cityOfPlace, replaceSection, refreshMainPrompt, defaultMapGenre, DEFAULT_MAP_PLACES, presetMaps, withoutAutoPortals, missingDefaultPins, rawPresetMaps, DEFAULT_PLAYER_MARKERS, playerPortraitSrc, playerMarkerSrc, createDefaultMaps, Relationship, InfoField, CharacterConfig, defaultCharacterConfig, relationshipTypes, characterPresets, normalizeCharacterConfig, statDisplayName, statDisplayValue, applyCharacterPreset, genrePresetPatch, minimalCharacterConfig, genreSystemSuggestions, PromptDraft, PromptDrafts, CustomPromptSection, DirectionOptions, promptSections, draftText, buildDraftPrompt, withExtras, displayGoal, getGameGoal, DEFAULT_PROLOGUES, defaultPrologueImage, prologueText, prologueTitle, prologueImage, DEFAULT_PLACE_BACKGROUNDS, placeBackground, Game, CombatState, DiceCheck, DiceResult, rolledRecently, LEAVING, StoryMemory, StoryHook, DirectorNotes, Session, View, Tab, initial, storageKey, legacyKey, databaseName, databaseVersion, openProjectDatabase, readProjectRecord, writeProjectRecord, deleteProjectRecord, PROMPT_LIMIT, MEMORY_KEEP_RECENT, DIRECTOR_EVERY, PLACE_SEEDS_V, MEMORY_BATCH, TALK_LIMIT, FLEE_REPUTATION, REVIVE_CHANCES, EVENT_XP_GAP, AWAKEN_LEVELS, BLESSING, LOG_PAGE, INTERFERE_GAP, INTERFERE_CHANCE, isTalkStart, talkStartIndex, talkTurns, npcHistory, recentHistory, MAX_QUESTS, questsOf, scenesHere, currentGoalOf, QUEST_LENGTH, sameQuest, questPairs, alikeQuest, QUEST_REPUTATION, startGold, applyQuests, AFFECTION_MIN, clampAffection, attitudeTier, PARTY_LIMIT, PARTY_THINK_MS, joinChance, INVITE_COOLDOWN, inviteWait, REPUTATION_STEP, clampReputation, reputationScore, reputationRank, formatReputation, hashText, npcTaste, NPC_PROFILE_LIMIT, genreCast, knownNpcNames, npcProfiles, GAME_TYPES, COOPERATION, PROGRESSION, PLAY_TIMES, normalizeType, MAX_TAGS, makeId, renderLabeledMap, getStartingLocation, travelSteps, nearbyPins, AFTERMATH, FIGHT_INTENT, BEAST_SCENE, GENERIC_PLACE, reachablePins, d, signed, abilityMod, clampInt, startCombat, Threat, debugFoe, HOSTILE_AFFECTION, CLASH_GAP, maxManaOf, maxHpOf, npcLevel, GROWTH_POINTS, growthFields, statLike, STRENGTH, train, growStats, levelUpRestore, withXp, TALK_ACCEPT, rewardBase, RANK_FLOORS, ALL_REGION_QUESTS, regionQuestsOf, regionWhere, inRegion, actsDone, withoutOldSpeechRules, promptUpToAct, playerActs, regionOpen, reservedNpcs, regionFree, DICE_ROLL_MS, AUTO_BATTLE_LIMIT, SPELL_GAUGE, HP_REGEN_TURN, REST_REASONS, restReason, spellScale, combatStatsOf, autoBattleStep, fightEdge, QuestClear, mergeClear, INTRO_SECONDS, gifSeconds, battleIntro, affectionClass, josa, storyText, QUOTE, WHOLE_QUOTE, TalkLine, parseTalk, lastSceneLine, carriedOpening, openWithCue, historyLine, talkEntries, withPlayerLine, SPEECH_INTENT, TALK_TO, arrivalToMeet, speaksTo, LogItem, groupLog, DEFAULT_NPC_NAMES, defaultNpcImage, freshAsset, unknownNpcImage, npcImage, openingActions, defaultActions, START_PROFILES, startValues, startStatLine, withStoryItems, wearStartGear, storyReplaces, makeSession, gestureMotion, tabs, itemTitle, sceneTime, infoMarks, wizardWorlds, BulkRuleSection, parseBulkRules, QUEST_AFFECTION, QUEST_GOLD, AFFECTION_MAX, AFFECTION_STEP, AGILITY, CHARM, MIND, SPELL_COST, MAGIC_RESIST, MANA_REGEN_ROUND, MANA_REGEN_TURN, INTRO_MAX_SECONDS } from './_lib/game/core';

/** Extract explicitly granted starting items without rewriting their authored wording. */
// Play map camera: the player marker stays in the middle and the map slides under it, zoomed in just far enough
// that every place reachable from here fits on screen (2.5× when nothing is linked yet, never wider than 1.4×).
// Pins and the marker are counter-scaled with --mapZoom so they keep their size.
function mapCamera(map: BoardMap, here: MapPin | undefined, reachable: string[]): React.CSSProperties {
  if (!here) return {};
  const near = map.pins.filter(p => reachable.includes(p.id) && p.kind !== 'event');
  const span = (d: number[]) => Math.max(6, ...d) + 7;
  const zoom = near.length ? Math.min(4, Math.max(1.4, Math.min(44 / span(near.map(p => Math.abs(p.x - here.x))), 44 / span(near.map(p => Math.abs(p.y - here.y)))))) : 2.5;
  return { transform: `translate(${50 - here.x * zoom}%, ${50 - here.y * zoom}%) scale(${zoom})`, ['--mapZoom' as string]: zoom } as React.CSSProperties;
}
// Browsers run all copies of one GIF address on one clock, so a cover already shown in the library would join mid-way.
// A fresh address starts it from the first frame, and the title screen lasts as long as one pass (a longer one can be clicked away).
function PlayIntro({ cover, art, children }: { cover?: string; art?: string; children: React.ReactNode }) {
  const src = cover || art || '';
  const isGif = /^data:image\/gif|\.gif(\?|$)/i.test(src);
  const [play, setPlay] = useState<{ src: string; seconds: number } | null>(isGif ? null : { src, seconds: INTRO_SECONDS });
  const [skipped, setSkipped] = useState(false);
  useEffect(() => {
    if (!isGif) return;
    let url = '', gone = false;
    (async () => {
      try {
        const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
        url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
        const img = new Image(); img.src = url; await img.decode();
        if (!gone) setPlay({ src: url, seconds: Math.min(INTRO_MAX_SECONDS, Math.max(INTRO_SECONDS, gifSeconds(bytes) + 0.4)) });
      } catch { if (!gone) setPlay({ src, seconds: INTRO_SECONDS }); }
    })();
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [src, isGif]);
  if (skipped) return null;
  return <div className={`playIntro${play ? '' : ' introWaiting'}${play && play.seconds > INTRO_SECONDS ? ' introSkippable' : ''}`} style={play ? { '--intro': `${play.seconds}s` } as React.CSSProperties : undefined} aria-hidden="true" onClick={() => { if (play && play.seconds > INTRO_SECONDS) setSkipped(true); }}>
    {play && <>
      <div className={`introArt${cover ? ' introArtCover' : ''}`}>{play.src && <img src={play.src} alt="" draggable={false}/>}</div>
      <div className="introCover">{cover ? <img src={play.src} alt="" draggable={false}/> : <div className="coverFallback"><Dices size={52}/><span>YOUR ADVENTURE AWAITS</span></div>}</div>
      {children}
      <i className="introFlash"/>
    </>}
  </div>;
}
const withAffectionColors = (text: string): React.ReactNode => { const parts = text.split(/(호감도 [+-]\d+)/); return parts.length === 1 ? text : parts.map((p, i) => i % 2 ? <b key={i} className={p.includes('+') ? 'affPos' : 'affNeg'}>{p}</b> : p); };
function StoryProse({ text }: { text: string }) {
  const blocks: { kind: 'heading' | 'speech' | 'narration'; text: string }[] = [];
  for (const raw of text.split(/\n+/)) {
    let p = raw.trim();
    const heading = p.match(/^【([^】]+)】\s*(.*)$/);
    if (heading) { blocks.push({ kind: 'heading', text: heading[1] }); p = heading[2].trim(); }
    for (const s of p.split(QUOTE).map(x => x.trim()).filter(Boolean)) blocks.push(WHOLE_QUOTE.test(s) ? { kind: 'speech', text: s.slice(1, -1) } : { kind: 'narration', text: s });
  }
  return <>{blocks.map((b, i) => b.kind === 'heading' ? <div key={i} className="storyHeading">{b.text}</div>
    : b.kind === 'speech' ? <p key={i} className="storySpeech"><q className="storyQuote">{b.text}</q></p>
    : <p key={i} className="storyNarration">{b.text}</p>)}</>;
}
function PrologueOpening({game}:{game:Game}) {const image=prologueImage(game);return <div className="prologueOpening">{image&&<img className="prologueHero" src={image} alt={prologueTitle(game)}/>}<div className="prologueOpeningBody"><span className="prologueEyebrow">PROLOGUE</span><h3>{prologueTitle(game)}</h3><PrologueRichText text={prologueText(game)} game={game}/></div></div>;}

/** Shared renderer for prologue preview and the actual play log. */
function TypeText({ text }: { text: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(text.length); return; }
    setShown(0);
    const id = setInterval(() => setShown(n => { if (n >= text.length) { clearInterval(id); return n; } return n + 1; }), 28);
    return () => clearInterval(id);
  }, [text]);
  return <span className="typeText" onClick={() => setShown(text.length)}>{text.slice(0, shown)}{shown < text.length && <i className="typeCaret" aria-hidden="true"/>}</span>;
}
// The first time someone appears: their cut-in plays, then the talk/fight/ignore choice shows (the timer matches .cutInSweep).
function NpcCutIn({ npc, art, onDone }: { npc: string; art?: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1250); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="cutIn cutInSweep" aria-hidden="true">
    <i className="cutInScrim"/>
    <div className="cutInBand"><i className="cutInHalftone"/><i className="cutInSpeed"/></div>
    <i className="cutInSpark"/><i className="cutInSpark"/><i className="cutInSpark"/><i className="cutInSpark"/>
    {art && <div className="cutInPortrait"><img src={art} alt="" draggable={false}/></div>}
    <div className="cutInPlate"><small>첫 만남</small><b>{npc}</b></div>
  </div>;
}
function TalkBubble({ t, image, typing = false }: { t: TalkLine; image?: string; typing?: boolean }) {
  // Talk reads like a messenger chat: narration from older saves is hidden and gestures only drive the sprite motion.
  if (t.speaker === 'scene') return null;
  if (t.speaker === 'cue') return <div className="talkCue">{t.line}</div>;
  if (t.speaker === 'me') return <div className="talkRow talkMe"><div className="talkBubbleBox">{t.line}</div></div>;
  return <div className="talkRow talkNpc"><span className="talkAvatar">{image ? <img src={image} alt=""/> : t.name.slice(0, 1)}</span><div className="talkBody"><span className="talkName">{t.name}</span><div className="talkBubbleBox" aria-label={t.line}>{typing ? <TypeText text={t.line}/> : t.line}</div></div></div>;
}
function PrologueRichText({text,game}:{text:string;game:Game}) {
  const tokens = text.split(/(\{\{\s*img\s*::[^{}\n]+::[^{}\n]+\}\})/g);
  const inlineTagged=new Set([...text.matchAll(/\{\{\s*img\s*::([^:{}]+)::/g)].map(x=>x[1].trim()));
  const present=(game.npcPortraits||[]).filter(n=>n.image&&!inlineTagged.has(n.name)&&new RegExp(`(^|[^가-힣])${n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=[^가-힣]|$)`).test(text));
  return <div className="prologueRichText">{present.slice(0,2).map(n=><figure key={n.id} className="prologueInlineImage"><img src={freshAsset(n.image)} alt={n.name} loading="lazy"/></figure>)}{tokens.map((token,index)=>{
    const match = /^\{\{\s*img\s*::([^{}\n]+)::([^{}\n]+)\}\}$/.exec(token);
    if (!match) return token ? <span key={index} className="prologueTextSegment">{token}</span> : null;
    const category=match[1].trim(), situation=match[2].trim();
    const portrait=(game.npcPortraits||[]).find(n=>n.name===category||n.id===category);
    if(portrait?.image && (situation==='기본'||situation==='default'))return <figure key={index} className="prologueInlineImage"><img src={portrait.image} alt={portrait.name} loading="lazy"/></figure>;
    const row=(game.imageRows||[]).find(r=>r.name.trim()===category);
    const column=(game.imageColumns||[]).find(c=>c.name.trim()===situation);
    const cell=(game.imageCells||[]).find(c=>c.rowId===row?.id&&c.columnId===column?.id&&!!c.image);
    return cell ? <figure key={index} className="prologueInlineImage"><img src={cell.image} alt={`${category} · ${situation}`} loading="lazy"/></figure> : null;
  })}</div>;
}

// What a foe brings to a fight: its strength tier plus the gear it wears, and its unique skill.
function FoeCard({ name, tier: baseTier, level, desc, boss }: { name: string; tier: number; level?: number; desc?: string; boss?: boolean }) {
  const tier = level ? tierOfLevel(level) : Math.max(1, Math.min(MAX_POWER, baseTier));
  const base = enemyStats(level ?? levelForTier(tier), boss), worn = enemyGear(tier), skill = enemySkill(name, tier), grade = gradeForTier(tier);
  return <div className="foeCard">
    {desc && <p className="foeDesc">{desc}</p>}
    <div className="foeStats"><span>체력 <b>{(base.hp + worn.hp).toLocaleString('ko-KR')}</b></span><span>공격 <b>{base.damage + worn.damage}</b></span><span>방어 <b>{base.dc + worn.dc}</b></span><span className={`grade${grade}`}>장비 <b>{GRADE_LABELS[grade]}</b></span></div>
    {skill && <div className="foeSkill"><Zap size={13}/> 고유 능력 · {enemySkillText(skill)}</div>}
  </div>;
}
// Details of one inventory item: grade, kind, bonuses, skill, description, and equip/unequip for gear.
// on: this very copy is the equipped one. A second copy of an equipped item can't be equipped on top of it.
function ItemCard({ name, session, on, onEquip, onUse, onDiscard, maxHp, onClose }: { name: string; session: Session; on: boolean; onEquip?: (item: string) => void; onUse?: (item: string) => void; onDiscard?: () => void; maxHp: number; onClose: () => void }) {
  const heal = Math.round(maxHp * healShareOf(name, infoOf(name, session.itemInfo)));
  const it = infoOf(name, session.itemInfo), bonus = bonusText(it, name), gear = it.kind !== 'item';
  const worn = gear ? session.equipped?.[it.kind as Exclude<ItemKind, 'item'>] : undefined;
  const twin = !on && worn === name;
  return <div className={`itemCard grade${it.grade}`}>
    <div className="itemCardHead"><span>[{GRADE_LABELS[it.grade]}] {KIND_LABELS[it.kind]}{on ? ' · 장착 중' : ''}</span><button type="button" aria-label="닫기" onClick={onClose}><X size={13}/></button></div>
    <strong>{name}</strong>
    {bonus ? <div className="itemCardStats">{bonus.split(' · ').map(b => <span key={b}>{b}</span>)}</div> : gear && <div className="itemCardNone">추가 능력치 없음</div>}
    {it.skill && <div className="itemCardSkill"><Zap size={12}/> {skillText(it)}</div>}
    {it.desc && <p>{it.desc}</p>}
    {heal > 0 && onUse && <button type="button" className="itemCardEquip" disabled={session.hp >= maxHp} onClick={() => onUse(name)}>{session.hp >= maxHp ? 'HP가 가득 찼습니다' : `사용 (HP +${heal})`}</button>}
    {gear && onEquip && (twin ? <div className="itemCardNone">같은 장비를 이미 장착하고 있습니다.</div> : <button type="button" className="itemCardEquip" onClick={() => onEquip(name)}>{on ? '장착 해제' : worn ? `장착 (${worn} 대신)` : '장착'}</button>)}
    {onDiscard && <button type="button" className="itemCardDiscard" onClick={onDiscard}>버리기</button>}
  </div>;
}
// Health going up outside a fight (resting, a potion, a level-up) shows: a green +N rises from the bar and the bar glows.
function useHealPop(session:Session){
 const lastHp=useRef(session.hp);const [heal,setHeal]=useState<{n:number;key:number}|null>(null);
 useEffect(()=>{const d=session.hp-lastHp.current;lastHp.current=session.hp;if(d>0&&session.mode!=='combat'){const key=Date.now();setHeal({n:d,key});const t=setTimeout(()=>setHeal(h=>h?.key===key?null:h),1600);return()=>clearTimeout(t);}},[session.hp,session.mode]);
 return heal;
}
function PlayStatus({game,session,place,region}:{game:Game;session:Session;place:string;region?:string}) {
 const c=game.characterConfig || defaultCharacterConfig();
 const heal=useHealPop(session);
 const maxHp=maxHpOf(game,session),maxMp=maxManaOf(game,session),mp=Math.min(maxMp,session.mana??maxMp),level=session.level||1,maxed=level>=MAX_LEVEL,need=xpToNext(level),rep=session.reputation||0,time=sceneTime(session.log);
 return <section className="playStatus" aria-label="플레이어 상태">
  {c.sections.character&&<>
   <img className="statusPortrait" src={playerPortraitSrc(game)} alt="" draggable={false}/>
   <div className="statusWho"><strong>Lv.{level} {c.initialName||'모험가'}</strong><small>EXP {maxed?'MAX':`${(session.xp||0).toLocaleString('ko-KR')} / ${need.toLocaleString('ko-KR')}`}</small><div className="statusTrack statusExp"><i style={{width:`${maxed?100:Math.min(100,(session.xp||0)/need*100)}%`}}/></div></div>
   {game.showHpBar!==false&&<div className={`statusVital statusHp${heal?' vitalHeal':''}`}><Heart size={22}/><div><span>HP {session.hp} / {maxHp}</span>{heal&&<b className="healPop" key={heal.key}>+{heal.n}</b>}<div className="statusTrack"><i style={{width:`${Math.max(0,Math.min(100,session.hp/Math.max(1,maxHp)*100))}%`}}/></div></div></div>}
   {maxMp>0&&<div className="statusVital statusMp"><Droplet size={22}/><div><span>MP {mp} / {maxMp}</span><div className="statusTrack"><i style={{width:`${mp/maxMp*100}%`}}/></div></div></div>}
   <div className={`statusFact${rep<0?' infamy':''}`}><Award size={20}/><span>명성 <b>{rep.toLocaleString('ko-KR')}</b></span><em>{reputationRank(rep)}</em></div>
   <div className="statusFact"><Coins size={20}/><span>골드 <b>{(session.characterGold??c.initialGold).toLocaleString('ko-KR')}</b></span></div>
  </>}
  <div className="statusFact statusPlace"><MapPinIcon size={20}/><span><b>{place||'위치 미지정'}</b>{region&&<small>{region}</small>}</span></div>
  {time&&<div className="statusTime">{/밤|새벽|저녁|황혼|심야|자정/.test(time)?<Moon size={18}/>:<Sun size={18}/>}<span>{time}</span></div>}
 </section>;
}
function CharacterPanel({game,session,portrait,onInvite,onLeave,onTalk,onDropQuest,onEquip,onUse,onDiscard,visible,fresh=[],onSeen}:{game:Game;session:Session;portrait?:string;onTalk?:(npc:string)=>void;onEquip?:(item:string)=>void;onUse?:(item:string)=>void;onDiscard?:(item:string,index:number)=>void;onInvite?:(npc:string)=>void;onLeave?:(npc:string)=>void;onDropQuest?:(quest:string)=>void;visible?:boolean;fresh?:string[];onSeen?:(keys:string[])=>void}) {
 const c=game.characterConfig || defaultCharacterConfig();
 const heal=useHealPop(session);
 const hasStartingItems = combinedStartingItems(game.prompt || '', game.startingEquipment || '').length > 0;
 const tabs=([['stats','능력치'],['inventory','인벤토리'],['status','상태'],['relationships','관계도']] as const).filter(([key])=>key==='relationships' ? c.sections.relationships !== false : (c.sections[key] || (key==='inventory' && (hasStartingItems || c.sections.equipment))));
 const [active,setActive]=useState<string>('stats');
 // Items are told apart by inventory position, since two copies can share a name. Only the first copy counts as the
 // equipped one (equipped stores names); picked keeps the name too, so a shifted inventory drops the selection.
 const inv=session.inventory||[];
 const [picked,setPicked]=useState<{i:number;name:string}|null>(null);
 const pickedItem=picked&&inv[picked.i]===picked.name?picked.name:null;
 const pick=(i:number)=>i>=0&&setPicked(p=>p&&p.i===i&&inv[i]===p.name?null:{i,name:inv[i]});
 const isEquipped=(item:string,i:number)=>Object.values(session.equipped||{}).includes(item)&&inv.indexOf(item)===i;
 const selected=tabs.some(([key])=>key===active)?active:tabs[0]?.[0];
 // The open tab counts as seen, and so does everything without a tab of its own (the quest log is always on show).
 useEffect(()=>{ if(visible&&onSeen)onSeen(Object.keys(infoMarks(session)).filter(k=>k===selected||!tabs.some(([key])=>key===k))); },[visible,selected,fresh.join()]);
 if(!c.sections.character && tabs.length===0)return null;
 return <div className="characterPanel"><div className="characterPanelHeading"><strong>플레이어 정보</strong><span>게임별 설정</span></div>
 <section className="questLog" aria-label="목표">{(()=>{const goal=currentGoalOf(session),open=questsOf(session).filter(q=>q!==goal);
  const card=(q:string,cls:string)=><div key={q} className={`questCard ${cls}`}><p>{q}</p>{session.questGivers?.[q]&&<small>의뢰 · <b>{session.questGivers[q]}</b></small>}{onDropQuest&&<button type="button" className="questDrop" aria-label={`목표 포기: ${q}`} title="목표 포기" onClick={()=>onDropQuest(q)}><X size={13}/></button>}</div>;
  return <><div className="questLogHeading"><strong><ScrollText size={15}/> 현재 목표</strong></div>{goal?card(goal,'questMain'):<div className="questCard questEmpty">지금은 정해진 목표가 없습니다.</div>}
  {open.length>0&&<><div className="questLogHeading"><strong>열린 이야기</strong></div>{open.map(q=>card(q,'questOpen'))}</>}</>;})()}</section>

 {session.goalCompleted && <div className="characterGoal"><strong>게임 완료</strong> <span>최종 목표를 달성했습니다. 엔딩이 확정되었습니다.</span></div>}
 {c.sections.character&&<div className={`characterSummary${heal?' healGlow':''}`} key={heal?`h${heal.key}`:'h'}>{portrait&&<img className="characterPortrait" src={portrait} alt="플레이어 캐릭터"/>}<div className="characterIdentity"><strong>{c.initialName || '모험가'}</strong><small>{[c.initialRace,START_PROFILES[game.wizardStart || '']?.job || c.initialJob].filter(Boolean).join(' · ')}</small>{game.showHpBar !== false && <div className={`characterVitals${heal?' vitalHeal':''}`}><span>HP {session.hp}/{maxHpOf(game, session)}</span>{heal&&<b className="healPop" key={heal.key}>+{heal.n}</b>}<div className="characterVitalTrack"><i style={{width:`${Math.max(0,Math.min(100,session.hp/Math.max(1,maxHpOf(game, session))*100))}%`}}/></div></div>}{maxManaOf(game, session) > 0 && (() => { const mm = maxManaOf(game, session), mp = Math.min(mm, session.mana ?? mm); return <div className="characterVitals characterMp"><span>MP {mp}/{mm}</span><div className="characterVitalTrack"><i style={{width:`${mp / mm * 100}%`}}/></div></div>; })()}<div className="characterLevel"><b>Lv.{session.level || 1}{(session.level || 1) >= MAX_LEVEL ? ' (MAX)' : ''}</b></div><div className="characterVitals characterExp"><span>EXP {(session.level || 1) >= MAX_LEVEL ? 'MAX' : `${(session.xp || 0).toLocaleString('ko-KR')} / ${xpToNext(session.level || 1).toLocaleString('ko-KR')}`}</span><div className="characterVitalTrack"><i style={{width:`${(session.level || 1) >= MAX_LEVEL ? 100 : Math.min(100, (session.xp || 0) / xpToNext(session.level || 1) * 100)}%`}}/></div></div><div className={`characterReputation${(session.reputation || 0) < 0 ? ' infamy' : ''}`}><Award size={16}/><span>명성</span><b>{(session.reputation || 0).toLocaleString('ko-KR')}</b><em>{reputationRank(session.reputation || 0)}</em></div><div className="characterReputation gold"><Coins size={16}/><span>골드</span><b>{(session.characterGold ?? c.initialGold).toLocaleString('ko-KR')}</b></div>{(() => { const cs = combatStatsOf(game, session), sign = (n: number) => `${n >= 0 ? '+' : ''}${n}`; return <div className="characterCombat" aria-label="전투 능력">
  <div><span>공격 명중</span><b>{sign(cs.hit)}</b></div>
  <div><span>{cs.gear.caster ? '지팡이 타격' : '공격 피해'}</span><b>{cs.gear.caster ? `${Math.max(1, 1 + cs.strength)}~${Math.max(1, 4 + cs.strength)}` : `${cs.blow[0]}~${cs.blow[1]}`}</b></div>
  {cs.gear.caster && cs.maxMana > 0 && <><div><span>마법 명중</span><b>{sign(cs.spellHit)}</b></div><div><span>마법 피해</span><b>{cs.spell[0]}~{cs.spell[1]}</b></div><div><span>시전 속도</span><b>+{cs.gear.haste}%</b></div><div><span>주문 마나</span><b>{SPELL_COST}</b></div></>}
  <div><span>회피</span><b>{cs.dodge}</b></div>
  <div><span>치명타</span><b>{`${(21 - cs.critFrom) * 5}%`}</b></div>
  {cs.gear.skills.length > 0 && <div className="characterCombatSkills"><span>고유 능력</span><b>{cs.gear.skills.map(k => `${k.name}(${SKILLS[k.id].label})`).join(' · ')}</b></div>}
</div>; })()}</div></div>}
 {tabs.length>0&&<><div className="characterTabs">{tabs.map(([key,label])=><button key={key} type="button" className={selected===key?'active':''} onClick={()=>setActive(key)}>{label}{fresh.includes(key)&&<i className="newDot" role="img" aria-label="새 변화"/>}</button>)}</div><div className="characterTabBody">
 {selected==='stats'&&<div className="characterStatGrid">{c.fields.filter(f=>f.visible&&!(f.id==='mana'&&maxManaOf(game,session)>0)).map(f=>{const value=session.characterValues?.[f.id] ?? f.initial;return <div className="characterStat" key={f.id}><small>{statDisplayName(f)}</small><strong>{statDisplayValue(f,String(value))}{f.kind==='gauge'?` / ${f.max || 100}`:''}</strong>{f.kind==='gauge'&&<div className="characterStatTrack"><i style={{width:`${Math.max(0,Math.min(100,Number(value)/Math.max(1,f.max || 100)*100))}%`}}/></div>}</div>;})}{c.fields.every(f=>!f.visible)&&<p>표시할 능력치가 없습니다.</p>}</div>}
 {selected==='inventory'&&<><div className="gearSlots">{(['weapon','armor','accessory'] as const).map(k=>{const n=session.equipped?.[k];const it=n?infoOf(n,session.itemInfo):undefined;return <button type="button" key={k} className={`gearSlot${it?` grade${it.grade}`:''}${n&&picked&&n===pickedItem&&inv.indexOf(n)===picked.i?' picked':''}`} disabled={!n} onClick={()=>n&&pick(inv.indexOf(n))}><small>{KIND_LABELS[k]}</small><b>{n||'비어 있음'}</b>{it?.skill&&<em>{it.skill.name}</em>}</button>;})}</div><div className="characterItems">{(session.inventory || []).length?(session.inventory || []).map((item,i)=>{const it=infoOf(item,session.itemInfo);const on=isEquipped(item,i);return <button type="button" key={`${item}-${i}`} className={`itemChip grade${it.grade}${on?' equipped':''}${picked?.i===i&&item===pickedItem?' picked':''}`} onClick={()=>pick(i)}>{it.grade>0&&<em>{GRADE_LABELS[it.grade]}</em>}{item}{on&&<Check size={11}/>}</button>;}):<p>인벤토리가 비어 있습니다.</p>}</div>{pickedItem?<ItemCard name={pickedItem} session={session} on={isEquipped(pickedItem,picked!.i)} onUse={onUse} maxHp={maxHpOf(game,session)} onEquip={onEquip} onDiscard={onDiscard?()=>{onDiscard(pickedItem,picked!.i);setPicked(null);}:undefined} onClose={()=>setPicked(null)}/>:(session.inventory||[]).length>0&&<small className="gearHint">아이템을 누르면 능력과 설명이 보입니다.</small>}</>}
 {selected==='status'&&<p className="characterEmptyStatus">적용된 상태 효과가 없습니다.</p>}
 {selected==='relationships'&&<div className="relationshipList">{(session.relationships||[]).length ? (session.relationships||[]).map(person=>{const image=(()=>{const portrait=(game.npcPortraits||[]).find(n=>n.name.trim()===person.name.trim());if(portrait?.image)return portrait.image;const row=(game.imageRows||[]).find(r=>r.name.trim()===person.name.trim());const col=(game.imageColumns||[]).find(x=>x.name.trim()==='기본');return (game.imageCells||[]).find(cell=>cell.rowId===row?.id&&cell.columnId===col?.id)?.image||npcImage(game,person.name);})();return <div key={person.id} className="relationshipPerson">{image && <div className="relationshipPhoto"><img src={image} alt={`${person.name} 인물 사진`}/></div>}<div className="relationshipDetails"><strong>{person.name}{npcLevel(session, person.name) && <em className="npcLevelTag">Lv.{npcLevel(session, person.name)}</em>}</strong><small>관계 · {person.relation}{(session.party || []).includes(person.name) && <em className="partyBadge">동료</em>}</small><span className={`attitude-${attitudeTier(person.affection).tone}`}>호감도 <b className={affectionClass(person.affection)}>{person.affection > 0 ? '+' : ''}{person.affection}</b> · {attitudeTier(person.affection).label}</span><div className="relationshipGauge"><i className={person.affection < 0 ? 'neg' : 'pos'} style={person.affection < 0 ? {right:'50%',width:`${Math.min(100,-person.affection)/2}%`} : {left:'50%',width:`${Math.min(100,person.affection)/2}%`}}/></div>{onInvite && ((session.party || []).includes(person.name) ? <div className="partyJoinedRow"><span className="partyJoined"><Check size={13}/> 합류</span>{onTalk && <button type="button" className="partyTalkLink" onClick={() => onTalk(person.name)}><MessageCircle size={12}/> 대화</button>}<button type="button" className="partyLeaveLink" onClick={() => onLeave?.(person.name)}>헤어지기</button></div> : <button type="button" className="partyButton" disabled={(session.party || []).length >= PARTY_LIMIT} title={(session.party || []).length >= PARTY_LIMIT ? `파티는 최대 ${PARTY_LIMIT}명입니다` : '함께 다니자고 권유합니다'} onClick={() => onInvite(person.name)}><Users size={12}/> 파티 권유</button>)}</div></div>;}) : <p className="characterEmptyStatus">아직 만난 인물이 없습니다. 게임을 진행하며 NPC를 만나면 자동으로 등록됩니다.</p>}</div>}

 </div></>}
 </div>;
}
function PromptBuilder({game,update,busy,setBusy,error,setError,onMap}:{game:Game;update:(patch:Partial<Game>)=>void;busy:boolean;setBusy:(v:boolean)=>void;error:string;setError:(v:string)=>void;onMap:()=>void}) {
 const drafts=game.promptDrafts||{};
 const extras=game.customPromptSections||[];
 const removed=game.removedPromptSections||[];
 const sections=[...promptSections.filter(x=>!removed.includes(x.id)),...extras];
 // RPG is the only game type, so the wizard opens on genre selection.
 const stage=Math.max(1,game.wizardStage||0);
 const requestedStep=useRef('');
 const autoRequestedFor=useRef<string>('');
 const [adding,setAdding]=useState(false);
 const [newTitle,setNewTitle]=useState('');
 const [newGuide,setNewGuide]=useState('');
 const [customWorld,setCustomWorld]=useState('');
 const [worldOptions,setWorldOptions]=useState<string[]>([]);
 const [worldBusy,setWorldBusy]=useState(false);
 const [optionalId,setOptionalId]=useState('');
 const [bulkOpen,setBulkOpen]=useState(false);
 const [bulkText,setBulkText]=useState('');
 const [bulkError,setBulkError]=useState('');
 const [compressing,setCompressing]=useState(false);
 const bulkSections=parseBulkRules(bulkText);
 const applyBulkRules=()=>{
  setBulkError('');
  
  if(!bulkSections.length){setBulkError('대괄호로 감싼 규칙 제목을 찾지 못했습니다. 예: [역할과 기본 원칙]');return;}
  const requiredNames=promptSections.filter(section=>section.required).map(section=>section.promptTitle);
  const missing=requiredNames.filter(name=>!bulkSections.some(section=>section.title===name));
  if(missing.length){setBulkError(`기본 규칙 5개가 모두 필요합니다. 누락: ${missing.join(', ')}`);return;}
  const normalized=bulkSections.map(section=>`# [${section.title}]\n\n${section.content}`).join('\n\n');
  
  if((game.prompt?.trim()||Object.values(drafts).some(d=>draftText(d).trim()))&&!window.confirm('현재 작성한 규칙을 일괄 입력한 규칙으로 교체할까요? 기존 규칙은 덮어씁니다.'))return;
  const nextDrafts:PromptDrafts={};
  for(const section of promptSections){
   const match=bulkSections.find(item=>item.title===section.promptTitle);
   if(match)nextDrafts[section.id]={options:[],selected:3,custom:match.content,enabled:true};
  }
  const nextExtras:CustomPromptSection[]=bulkSections.filter(item=>!(requiredNames as readonly string[]).includes(item.title)).map(item=>({id:'custom-'+makeId(),name:item.title,guide:''}));
  bulkSections.filter(item=>!(requiredNames as readonly string[]).includes(item.title)).forEach((item,i)=>{
   nextDrafts[nextExtras[i].id]={options:[],selected:3,custom:item.content,enabled:true};
  });
  update({promptDrafts:nextDrafts,customPromptSections:nextExtras,removedPromptSections:[],prompt:buildDraftPrompt(nextDrafts,nextExtras,[]),compressedPrompt:undefined,wizardBasePrompt:undefined,wizardStage:3});
  setBulkOpen(false);setBulkText('');setBulkError('');
 };

 const setStage=(n:number)=>{if(n<2 && stage>=2)return;update({wizardStage:n});};
 const setDraft=(id:string,patch:Partial<PromptDraft>)=>{
  const base=drafts[id]||{options:[],selected:-1,custom:'',enabled:true};
  const next={...drafts,[id]:{...base,...patch}};
  const full=withExtras(game.wizardBasePrompt,next,extras);
  update({promptDrafts:next,prompt:full||buildDraftPrompt(next,extras,removed),compressedPrompt:full});
 };
 const compressFinal=async()=>{
  if(compressing||busy)return;
  const original=buildDraftPrompt(drafts,extras,removed);
  if(!promptSections.filter(x=>x.required).every(x=>!!draftText(drafts[x.id]).trim())){setError('기본 규칙 5개를 먼저 선택해 주세요.');return;}
  setCompressing(true);setError('');
  try{
   const response=await fetch('/api/prompt/compress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sections:[...promptSections.filter(x=>!removed.includes(x.id)),...extras].map(x=>({title:'promptTitle' in x?x.promptTitle:x.name,text:draftText(drafts[x.id])})).filter(x=>x.text),genre:game.wizardWorld||game.wizardType,originalLength:original.length})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'최종 압축에 실패했습니다.');
   if(typeof data.prompt!=='string'||!data.prompt.trim())throw Error('압축된 프롬프트가 비어 있습니다.');
   if(data.prompt.length>PROMPT_LIMIT)throw Error('최종 프롬프트가 7,000자를 초과했습니다.');
   update({compressedPrompt:data.prompt,prompt:data.prompt});
  }catch(e){setError(e instanceof Error?e.message:'최종 압축에 실패했습니다.');}
  finally{setCompressing(false);}
 };
 const [dirStep,setDirStep]=useState(0);
 // 무협·현대는 잠시 막아 두었으므로 장르 선택 없이 정통 판타지로 바로 방향 정하기 단계에 들어갑니다.
 useEffect(()=>{
  if(stage!==1)return;
  const w='정통 판타지';
  const nextRemoved=[...new Set([...removed,...promptSections.filter(s=>!s.required).map(s=>s.id)])];
  setDirStep(0);
  update({...(w!==game.wizardWorld?{wizardMain:'',wizardStart:'',finalGoalSteps:[]}:{}),wizardType:'rpg',wizardWorld:w,...genrePresetPatch(game,w),wizardStage:2,removedPromptSections:nextRemoved,prompt:buildDraftPrompt(drafts,extras,nextRemoved)});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[stage]);
 const [directionOptions,setDirectionOptions]=useState<DirectionOptions|null>(null);
 useEffect(()=>{
  if(stage<2||!game.wizardWorld)return;
  let cancelled=false;setDirectionOptions(null);
  fetch('/api/prompt/options?genre='+encodeURIComponent(game.wizardWorld)).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'방향 목록을 불러오지 못했습니다.');return d as DirectionOptions;}).then(d=>{if(!cancelled)setDirectionOptions(d);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));});
  return()=>{cancelled=true;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[stage>=2,game.wizardWorld]);
 const shownMains=directionOptions?.mains||[];
 const chosenMain=directionOptions?.mains.find(m=>m.name===game.wizardMain);
 const directionDone=[!!game.wizardMain,!!game.wizardStart,true];
 const chooseMain=(main:DirectionOptions['mains'][number])=>{
  if(compressing)return;
  setError('');
  // A different story brings its own progress steps.
  const steps=main.name===game.wizardMain?{}:{finalGoalSteps:game.finalGoalMode==='progress'?main.progressSteps:[]};
  update({wizardMain:main.name,compressedPrompt:undefined,...steps});
  setDirStep(1);
 };
 const chooseStart=(name:string)=>{
  if(compressing)return;
  setError('');
  update({wizardStart:name,compressedPrompt:undefined});
  setDirStep(2);
 };
 const chooseGoalMode=(mode:'single'|'progress')=>{
  const prefill=mode==='progress'&&!(game.finalGoalSteps||[]).some(x=>x.trim())&&chosenMain?{finalGoalSteps:chosenMain.progressSteps}:{};
  update({finalGoalMode:mode,compressedPrompt:undefined,...prefill});
 };
 const submitDirections=async()=>{
  if(busy||compressing)return;
  if(!game.wizardMain||!game.wizardStart){setError('이야기와 주인공 시작을 먼저 선택해 주세요.');return;}
  setCompressing(true);setError('');
  try{
   const response=await fetch('/api/prompt/build-final',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameName:game.name,gameDescription:game.description,genre:game.wizardWorld||game.wizardType,goalMode:game.finalGoalMode||'single',mainName:game.wizardMain,startName:game.wizardStart})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'게임 설정 생성 실패');
   if(typeof data.prompt!=='string'||!data.prompt.trim())throw Error('AI가 게임 설정을 반환하지 않았습니다.');
   if(data.prompt.length>PROMPT_LIMIT)throw Error('게임 설정이 7,000자를 초과했습니다.');
   const full=withExtras(data.prompt,drafts,extras)!;
   update({wizardBasePrompt:data.prompt,compressedPrompt:full,prompt:full,wizardStage:3});
  }catch(e){setError(e instanceof Error?e.message:'게임 설정 생성 실패');}
  finally{setCompressing(false);}
 };
 const choiceCard=(key:string,checked:boolean,title:string,body:string,onPick:()=>void)=><div key={key} role="radio" aria-checked={checked} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick();}}} onClick={onPick} className={'wizardChoice wizardSelectable '+(checked?'selected':'')}><div className="wizardOptionSummary"><input type="radio" checked={checked} readOnly tabIndex={-1}/><div className="wizardOptionText"><strong>{title}</strong><span>{body}</span></div></div></div>;
 const directionStepTitles=['어떤 이야기로 시작할까요?','주인공은 누구로 시작할까요?','목표는 어떻게 보여줄까요?'];
 const directionStepHelp=['고른 메인 사건이 게임의 중심 줄거리가 됩니다. 등장 세력과 NPC도 이 사건에 맞춰 정해집니다.','고른 신분으로 게임을 시작합니다. 신분에 따라 시작 소지품과 첫 장면이 달라집니다.','최종 목표형은 하나의 큰 목표를 향해 가고, 진행도형은 단계별 진행 상황이 플레이 화면에 표시됩니다.'];
 const renderDirection=()=>{
  if(!directionOptions)return <p className="wizardHelp">선택지를 불러오는 중입니다...</p>;
  if(dirStep===0)return <><div className="wizardChoices">{shownMains.map(m=>choiceCard(m.name,game.wizardMain===m.name,m.name,m.hook,()=>chooseMain(m)))}</div></>;
  if(dirStep===1)return <div className="wizardChoices">{(chosenMain?.starts||[]).map(s=>choiceCard(s.name,game.wizardStart===s.name,s.name,startStatLine(game,s.name)?`${s.summary}\n시작 능력치 · ${startStatLine(game,s.name)}`:s.summary,()=>chooseStart(s.name)))}</div>;
  return <div className="wizardChoices">
   {choiceCard('single',game.finalGoalMode!=='progress','최종 목표형',chosenMain?.goal||'하나의 최종 목표를 달성하면 결말에 이릅니다.',()=>chooseGoalMode('single'))}
   {choiceCard('progress',game.finalGoalMode==='progress','진행도형',chosenMain?.progressSteps.join(' → ')||'단계별 목표를 차례로 달성합니다.',()=>chooseGoalMode('progress'))}
   {game.finalGoalMode==='progress'&&<div className="goalStepEditor"><p className="assetHelp">고른 이야기에 맞춰 단계를 미리 채워 두었습니다. 한 줄에 하나씩 자유롭게 고칠 수 있고, 게임 진행 중 완료한 단계가 진행도로 표시됩니다.</p><label className="field">진행도형 목표 단계 (2개 이상)<textarea rows={6} value={(game.finalGoalSteps||[]).join('\n')} onChange={e=>update({finalGoalSteps:e.target.value.split('\n').slice(0,12).map(v=>v.slice(0,160))})} placeholder={'1단계: 단서 확보\n2단계: 적의 음모 저지\n3단계: 최종 결전 승리'}/></label><small>등록된 단계 {(game.finalGoalSteps||[]).filter(v=>v.trim()).length}개</small></div>}
  </div>;
 };
 const required=promptSections.filter(x=>x.required);
 const requiredReady=required.every(x=>!!draftText(drafts[x.id]).trim());
 const worldChoices=['정통 무협','정통 판타지','현대 게이트·헌터'];
 const selectedWorld=game.wizardWorld||'';
 const optional=extras;
 const activeOptional=optional.find(x=>x.id===optionalId)||optional[0];
 const combined=game.compressedPrompt||buildDraftPrompt(drafts,extras,removed);
 return <div className="wizardBuilder">
  {stage>=2&&<div className="bulkImportEntry"><div><strong>작성한 게임 규칙이 있나요?</strong><p>기본 규칙과 추가 규칙을 한 번에 붙여넣고 제목별로 자동 분류할 수 있어요.</p></div><button type="button" className="btn primary" onClick={()=>{setBulkOpen(v=>!v);setBulkError('');}}><Upload size={16}/>{bulkOpen?'일괄 입력 닫기':'전체 프롬프트 가져오기'}</button></div>}
  {stage>=2&&bulkOpen&&<div className="bulkImportPanel"><label htmlFor="bulkPromptText"><strong>전체 규칙 붙여넣기</strong></label><p>예: [역할과 기본 원칙], [세계관과 배경], [시작 소지품]. 원문 내용은 요약하지 않습니다.</p><textarea id="bulkPromptText" rows={12} value={bulkText} onChange={e=>{setBulkText(e.target.value);setBulkError('');}} placeholder={'[역할과 기본 원칙]\nGM 역할과 진행 규칙...\n\n[세계관과 배경]\n세계관...\n\n[플레이어와 시작 조건]\n시작 조건...\n\n[진행 방식과 정합성]\n진행 규칙...\n\n[시작 소지품]\n아이템 목록...'} /><div className="bulkImportSummary"><strong>분석 결과 · {bulkSections.length}개 항목</strong><span>{bulkText.length.toLocaleString()} / {PROMPT_LIMIT.toLocaleString()}자</span></div><div className="bulkImportTags">{bulkSections.map((section,i)=><span key={i} className={promptSections.some(p=>p.promptTitle===section.title)?'bulkBase':'bulkExtra'}>{section.title} · {promptSections.some(p=>p.promptTitle===section.title)?'기본':'추가'}</span>)}</div>{bulkError&&<p className="promptBuilderError" role="alert">{bulkError}</p>}<div className="bulkImportActions"><button type="button" className="btn" onClick={()=>setBulkOpen(false)}>취소</button><button type="button" className="btn primary" disabled={!bulkSections.length} onClick={applyBulkRules}>분석한 규칙 전체 적용</button></div><small>적용 시 기존 규칙은 확인 후 교체됩니다. 저장은 상단의 수동 저장 버튼으로 진행하세요.</small></div>}

  {stage===1&&<div className="wizardStep"><h3>1. 게임 장르를 선택하세요</h3><p>세계관은 세 가지로 고정됩니다. 다음 단계에서 이야기·주인공·목표 방향을 고릅니다.</p><div className="wizardChoiceList">{worldChoices.map((w,i)=><button type="button" key={w} className={'wizardWorldRow '+(selectedWorld===w?'chosen':'')} onClick={()=>update({...(w!==selectedWorld?{wizardMain:'',wizardStart:'',finalGoalSteps:[]}:{}),wizardType:'rpg',wizardWorld:w,...genrePresetPatch(game,w)})}><b>{i+1}</b><span>{w}</span><ChevronRight size={16}/></button>)}</div><button type="button" className="btn primary" disabled={!worldChoices.includes(selectedWorld)} onClick={()=>{setDirStep(0);update({wizardStage:2,removedPromptSections:[...new Set([...removed,...promptSections.filter(s=>!s.required).map(s=>s.id)])],prompt:buildDraftPrompt(drafts,extras,[...new Set([...removed,...promptSections.filter(s=>!s.required).map(s=>s.id)])])});}}>장르 확정하고 방향 정하기 <ChevronRight size={16}/></button></div>}
  {stage===2&&<div className="wizardStep rpgStepWizard">
    <div className="rpgStepTop"><strong>2. 게임 방향 정하기 · {dirStep+1} / 3</strong><span>{game.wizardWorld}</span></div>
    <div className="rpgStepProgress">{directionStepTitles.map((title,i)=><button key={title} type="button" title={title} className={i===dirStep?'active':directionDone[i]&&i<2?'done':''} disabled={!directionDone.slice(0,i).every(Boolean)} onClick={()=>setDirStep(i)}>{i+1}</button>)}</div>
    <div className="wizardRequired"><div className="wizardRequiredLabel"><span>{dirStep+1} / 3</span><strong>{directionStepTitles[dirStep]}</strong>{dirStep<2&&directionDone[dirStep]&&<small>선택 완료 ✓</small>}</div>
    <p className="wizardHelp">{directionStepHelp[dirStep]}</p>
    {renderDirection()}
    </div>
    <div className="rpgStepNavigation"><button className="btn" type="button" disabled={dirStep===0||compressing} onClick={()=>setDirStep(i=>Math.max(0,i-1))}><ArrowLeft size={15}/> 이전</button>{dirStep<2?<button className="btn primary" type="button" disabled={!directionDone[dirStep]} onClick={()=>setDirStep(i=>i+1)}>다음 <ChevronRight size={15}/></button>:<button className="btn primary" type="button" disabled={compressing||!game.wizardMain||!game.wizardStart||(game.finalGoalMode==='progress'&&(game.finalGoalSteps||[]).filter(x=>x.trim()).length<2)} onClick={()=>void submitDirections()}>{compressing?'게임 설정을 만들고 검토하는 중...':'방향 선택 완료 · 게임 설정 만들기'} <ChevronRight size={15}/></button>}</div>
    <p className="wizardHelp">선택을 마치면 고른 방향으로 세계·NPC·사건이 채워지고, AI가 앞뒤가 맞는지 검토합니다.</p>
  </div>}
  {stage===3&&<div className="wizardStep"><h3>3. 최종 프롬프트 확인 및 선택적 보완</h3>{game.wizardBasePrompt?<div className="tip"><strong>{combined.length.toLocaleString()}자 · 최대 7,000자</strong><p>고른 방향({game.wizardMain} · {game.wizardStart} · {game.finalGoalMode==='progress'?'진행도형':'최종 목표형'})으로 만든 게임 설정입니다. 오른쪽 미리보기에서 NPC·사건·목표를 확인하세요.</p></div>:<div className="tip"><strong>원본 {combined.length.toLocaleString()}자 · 최대 7,000자</strong><p>가져온 규칙을 AI로 하나의 게임 설정으로 통합·압축합니다.</p><button type="button" className="btn primary" disabled={compressing||busy||!requiredReady||!!game.compressedPrompt} onClick={()=>void compressFinal()}><Sparkles size={16}/>{compressing?'전체 규칙 압축 중...':game.compressedPrompt?'통합·압축 완료':'AI로 최종 규칙 통합·압축 (최대 7,000자)'}</button>{game.compressedPrompt&&<p>최종 압축본 {game.compressedPrompt.length.toLocaleString()}자 · 오른쪽 미리보기에 적용됨</p>}</div>}<p>완성된 최종 규칙으로 게임을 시작할 수 있습니다. 필요하면 아래 예시를 참고해 원하는 규칙을 직접 추가하세요. 예시는 자동 적용되지 않습니다.</p><div className="tip">추가 규칙 예시: NPC와 관계(호감도·신뢰도), 세력과 조직(평판·외교), 전투와 대결(승패·부상), 시간과 일정(하루 행동·기한), 경제와 거래(자금·가격), 생존과 자원(식량·피로), 실패·패배·종료 조건(사망·퇴학·파산). 게임 장르에 맞게 제목과 내용을 자유롭게 작성하세요.</div>{optional.map(s=><div key={s.id} className="wizardOptionalEditor"><div className="wizardRowHeader"><strong>{s.name}</strong><button type="button" className="btn" onClick={()=>{const next=extras.filter(x=>x.id!==s.id);const nextDrafts={...drafts};delete nextDrafts[s.id];const full=withExtras(game.wizardBasePrompt,nextDrafts,next);update({customPromptSections:next,promptDrafts:nextDrafts,prompt:full||buildDraftPrompt(nextDrafts,next,removed),compressedPrompt:full});}}><Trash2 size={15}/> 삭제</button></div><textarea rows={4} value={draftText(drafts[s.id])} onChange={e=>setDraft(s.id,{selected:3,custom:e.target.value,enabled:true})} placeholder="게임에 추가할 규칙을 자유롭게 작성하세요."/></div>)}{!adding?<button type="button" className="btn" onClick={()=>setAdding(true)}><Plus size={16}/> 새 규칙 직접 추가</button>:<div className="wizardAdd"><input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="규칙 제목"/><textarea value={newGuide} onChange={e=>setNewGuide(e.target.value)} rows={4} placeholder="추가할 규칙 내용을 직접 작성하세요."/><div className="wizardRowHeader"><button className="btn" type="button" onClick={()=>setAdding(false)}>취소</button><button className="btn primary" type="button" disabled={!newTitle.trim()||!newGuide.trim()} onClick={()=>{const id='custom-'+makeId();const next=[...extras,{id,name:newTitle.trim(),guide:''}];const nextDrafts={...drafts,[id]:{options:[],selected:3,custom:newGuide.trim(),enabled:true}};const full=withExtras(game.wizardBasePrompt,nextDrafts,next);update({customPromptSections:next,promptDrafts:nextDrafts,prompt:full||buildDraftPrompt(nextDrafts,next,removed),compressedPrompt:full});setNewTitle('');setNewGuide('');setAdding(false);}}>규칙 저장</button></div></div>}<button type="button" className="btn" onClick={()=>{setDirStep(0);setStage(2);}}><ArrowLeft size={15}/> 게임 방향 다시 선택</button><button type="button" className="btn primary" disabled={!game.compressedPrompt} onClick={()=>{const finalPrompt=game.compressedPrompt||combined;if(finalPrompt.length>PROMPT_LIMIT){setError('게임에 적용할 프롬프트가 7,000자를 초과했습니다. 먼저 AI 통합·압축을 실행해 주세요. 원본은 보존됩니다.');return;}onMap();}}>프롬프트 작성 완료 · 게임 설정으로 이동 <ChevronRight size={16}/></button></div>}
  
  {combined.length>PROMPT_LIMIT&&<div className="promptBuilderError">원본 {combined.length.toLocaleString()}자입니다. 실제 게임용 프롬프트는 최대 7,000자이므로 최종 통합·압축을 완료해야 합니다.</div>}
  {error&&<div className="promptBuilderError" role="alert">{error}</div>}
 </div>;
}
// move transition (from Stellive): white diamonds sweep in from the right, then shrink away from the bottom-right; jitter is index-hashed so renders stay stable
export default function Home() {
  const [games, setGames] = useState<Game[]>([initial]);
  const [selected, setSelected] = useState('sample');
  const [view, setView] = useState<View>('library');
  const [tab, setTab] = useState<Tab>('prompt');
  const [npcBusy,setNpcBusy]=useState('');
  const [npcError,setNpcError]=useState('');
  const [systemRecommendation, setSystemRecommendation] = useState<CharacterConfig | null>(null);
  const [equipmentSuggestions, setEquipmentSuggestions] = useState<string[]>([]);
  const [equipmentSuggestionBusy, setEquipmentSuggestionBusy] = useState(false);
  const [equipmentSuggestionError, setEquipmentSuggestionError] = useState('');
  const [systemBusy, setSystemBusy] = useState(false);
  const [systemError, setSystemError] = useState('');
  useEffect(()=>{if(tab==='settings' && game?.id) setSystemRecommendation(genreSystemSuggestions(game));},[tab, selected]);
  const [session, setSession] = useState<Session>(makeSession(initial));
  // The scene being written right now, shown on the log as it streams in.
  const [liveScene, setLiveScene] = useState('');
  const [liveTalk, setLiveTalk] = useState('');
  // The last talk reply streamed in live, so its bubble is not typed out again (it looked written twice).
  const [talkStreamed, setTalkStreamed] = useState(false);
  // A goal that just came up becomes the current goal (until the director says the player is busy with another).
  const seenQuests = useRef<{ id: string; quests: string[] }>(undefined);
  useEffect(() => {
    const id = `${session.gameId}|${session.log[0] || ''}`, quests = questsOf(session), prev = seenQuests.current;
    seenQuests.current = { id, quests };
    if (!prev || prev.id !== id) return;
    const pick = quests.filter(q => !prev.quests.includes(q)).at(-1);
    if (pick) setSession(s => ({ ...s, focus: pick, focusAt: s.log.length }));
  }, [questsOf(session).join('\n')]);
  // Only the newest stretch of a long play log is drawn; older entries load on request.
  const [logShown, setLogShown] = useState(LOG_PAGE);
  const [action, setAction] = useState('');
  const [draftSection,setDraftSection]=useState<string>('role');
  const [draftBusy,setDraftBusy]=useState(false);
  const [draftError,setDraftError]=useState('');
  const [goalStepsBusy,setGoalStepsBusy]=useState(false);const [goalStepsError,setGoalStepsError]=useState('');
  const [registrationBusy,setRegistrationBusy]=useState(false);
  const [registrationError,setRegistrationError]=useState('');

  const [busy, setBusy] = useState(false);
  // New gear goes on by itself into an empty slot; otherwise it waits in the bag for the player to equip.
  // seenInv is the inventory last looked at; null right after a save is loaded or a game starts, so that isn't "new".
  const seenInv = useRef<string[] | null>(null);
  // Where the last transition left off. Only a real change of place plays one: the end of a talk or a fight doesn't,
  // and neither does entering play (empty map), which has its own title screen.
  const moved = useRef({ map: '', pin: '', place: '', kind: '', seq: 0 });
  const [infoSeen, setInfoSeen] = useState<Record<string, string> | null>(null);
  useEffect(() => { if (!infoSeen) setInfoSeen(infoMarks(session)); }, [infoSeen, session]);
  const replaceSession = (s: Session) => { seenInv.current = null; setDiceRoll(null); setInfoSeen(null); setSession(s); };
  useEffect(() => {
    const inv = session.inventory || [], before = seenInv.current;
    seenInv.current = inv;
    if (!before) return;
    // What came in since last time, copy by copy (a second sword of the same name is new too).
    const left = [...before];
    const gained = inv.filter(n => { const i = left.indexOf(n); if (i < 0) return true; left.splice(i, 1); return false; });
    const gear = gained.filter(n => infoOf(n, session.itemInfo).kind !== 'item');
    if (!gear.length) return;
    // The get window only for gear above the best of its kind already in the bag.
    const owned = (kind: ItemKind) => Math.max(-1, ...before.filter(n => infoOf(n, session.itemInfo).kind === kind).map(n => infoOf(n, session.itemInfo).grade));
    const better = gear.filter(n => { const it = infoOf(n, session.itemInfo); return it.grade > owned(it.kind); });
    if (better.length) { const best = better.reduce((a, b) => infoOf(b, session.itemInfo).grade > infoOf(a, session.itemInfo).grade ? b : a); setItemBurst({ name: best, info: infoOf(best, session.itemInfo), more: better.length - 1, key: Date.now() }); }
    const equipped = { ...(session.equipped || {}) }, worn: string[] = [];
    for (const n of gear) {
      const slot = infoOf(n, session.itemInfo).kind as Exclude<ItemKind, 'item'>;
      if (!equipped[slot] && session.mode !== 'combat') { equipped[slot] = n; worn.push(n); }
    }
    if (worn.length) setSession(s => { const next = { ...s, equipped: { ...(s.equipped || {}), ...Object.fromEntries(worn.map(n => [infoOf(n, s.itemInfo).kind, n])) } }; const was = maxHpOf(game, s), now = maxHpOf(game, next); return { ...next, hp: refitHp(game, s, next), log: [...s.log, `시스템: 자동 장착 — ${worn.join(', ')}${now !== was ? ` · 최대 HP ${was} → ${now}` : ''}`] }; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.inventory]);
  const [ready, setReady] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [notice, setNotice] = useState('');
  const [newTag, setNewTag] = useState('');
  const [movingAsset, setMovingAsset] = useState<string | null>(null);
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [customMapPrompt,setCustomMapPrompt] = useState('');
  const [pinMode, setPinMode] = useState<'select' | 'relocate' | 'start' | 'place' | 'building' | 'exit'>('select');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const draggingPin = useRef<{mapId:string;pinId:string;startX:number;startY:number;moved:boolean}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const talkRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = talkRef.current; if (el) el.scrollTop = el.scrollHeight; }, [session.log.length, busy]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // IndexedDB takes precedence. An existing localStorage project is migrated in memory,
        // then persisted to IndexedDB only when the user presses the manual Save button.
        const stored = await readProjectRecord<Game[]>('games');
        let data: unknown = stored;
        const legacyMigration = !Array.isArray(stored);
        if (legacyMigration) {
          const raw = localStorage.getItem(storageKey) || localStorage.getItem(legacyKey);
          data = raw ? JSON.parse(raw) : [];
        }
        if (cancelled) return;
        if (Array.isArray(data) && data.length) {
          const hydrated = data.map((g: Game) => ({ ...g, profileDone: g.profileDone ?? true, promptDone: g.promptDone ?? !!(g.promptDrafts && Object.keys(g.promptDrafts).length), mapDone: g.mapDone ?? !!(g.maps?.length), settingsDone: g.settingsDone ?? !!g.registrationDescription, prompt: typeof g.prompt === 'string' ? refreshMainPrompt(g, g.prompt) : [g.world, g.rules, g.gm].filter(Boolean).join('\n\n'), compressedPrompt: refreshMainPrompt(g, g.compressedPrompt), wizardBasePrompt: refreshMainPrompt(g, g.wizardBasePrompt), assets: Array.isArray(g.assets) ? g.assets : [], imageRows: Array.isArray(g.imageRows) ? g.imageRows : (Array.isArray(g.assets) ? g.assets.map((a: Asset) => ({ id: a.id, name: a.name })) : []), imageColumns: Array.isArray(g.imageColumns) ? g.imageColumns : [{ id: 'default', name: '기본' }] , imageCells: Array.isArray(g.imageCells) ? g.imageCells : (Array.isArray(g.assets) ? g.assets.filter((a: Asset) => a.image).map((a: Asset) => ({ rowId: a.id, columnId: 'default', image: a.image })) : []), mapImage: g.mapImage || '', startMapId: g.startMapId, startPinId: (()=>{const wm=(g.maps||[]).find(m=>m.id===g.startMapId);const isDefaultWuxia=wm?.image==='/api/default-map/wuxia/0';const first=wm?.pins?.[0];return isDefaultWuxia && first?.name==='천마신교' && g.startPinId===first.id ? (wm?.pins.find(p=>p.name==='낙양')?.id || g.startPinId) : g.startPinId;})(), maps: Array.isArray(g.maps) ? g.maps : (g.mapImage ? [{ id: makeId(), name: '기존 맵', image: g.mapImage, pins: [] }] : []), registrationDescription: typeof g.registrationDescription === 'string' ? g.registrationDescription : '', genre: typeof g.genre === 'string' ? g.genre : 'RPG / 탐험', gameType: normalizeType(g), cooperation: COOPERATION.includes(g.cooperation || '') ? g.cooperation : '협동', progression: PROGRESSION.includes(g.progression || '') ? g.progression : '턴제', playTime: PLAY_TIMES.includes(g.playTime || '') ? g.playTime : '장기 캠페인', hashtags: Array.isArray(g.hashtags) ? g.hashtags.filter((x: unknown) => typeof x === 'string').slice(0, MAX_TAGS) : [], audience: typeof g.audience === 'string' ? g.audience : '전체 이용가', characterConfig: g.characterConfig ? {...normalizeCharacterConfig(g.characterConfig), sections:{...defaultCharacterConfig().sections,...(g.characterConfig.sections || {})}} : defaultCharacterConfig(), showHpBar: g.showHpBar !== false, showEquipment: g.showEquipment !== false, showDice: g.showDice !== false, startingEquipment: typeof g.startingEquipment === 'string' ? g.startingEquipment : '낡은 검, 가죽 갑옷, 회복 물약', playMode: g.playMode === 'multi' ? 'multi' as const : 'single' as const, minPlayers: Math.max(2, Math.min(6, Number(g.minPlayers) || 2)), maxPlayers: Math.max(2, Math.min(6, Number(g.maxPlayers) || 4)) }));
          const cleaned = hydrated.map((g: Game) => g.maps?.length ? { ...g, maps: withoutAutoPortals(g.maps) } : g);
          setGames(cleaned);
          setSavedSnapshot(legacyMigration ? '[]' : JSON.stringify(cleaned));
          if (legacyMigration) setNotice('기존 프로젝트를 불러왔습니다. 저장 버튼을 눌러 새 저장소로 이전하세요.');
        } else {
          setSavedSnapshot('[]');
        }
      } catch (error) {
        if (!cancelled) {
          setNotice('프로젝트를 불러오지 못했습니다. 기존 브라우저 데이터를 삭제하지 마세요.');
          setSavedSnapshot(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const hasUnsavedChanges = ready && savedSnapshot !== null && JSON.stringify(games) !== savedSnapshot;
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);
  const [saving, setSaving] = useState(false);
  async function saveGames() {
    if (saving || !ready) return;
    setSaving(true);
    try {
      // A transaction's completion, not merely its request success, confirms persistence.
      const snapshot = JSON.stringify(games);
      await writeProjectRecord('games', games);
      setSavedSnapshot(snapshot);
      setSaveStatus('saved');
      setNotice('게임 프로젝트를 저장했습니다 (saves 폴더 포함).');
    } catch (error) {
      setSaveStatus('error');
      setNotice(`저장 실패: ${error instanceof Error ? error.message : '브라우저 저장 공간을 확인해 주세요.'}`);
    } finally { setSaving(false); }
  }
  // Play sessions are saved separately from the manual project save, as before.
  useEffect(() => {
    if (!ready || view !== 'play' || !session.gameId) return;
    void writeProjectRecord('session-' + session.gameId, session).catch(() => {
      setNotice('플레이 기록 저장에 실패했습니다. 브라우저 저장 공간을 확인해 주세요.');
    });
  }, [session, ready, view]);
  const [sideTab, setSideTab] = useState<'log' | 'info'>('log');
  // Story entries from this log item on glow until clicked, so the new scene gets read.
  const [freshFrom, setFreshFrom] = useState<number | null>(null);
  // A new scene is read first in a visual-novel box over the stage (ref/진행기록 예시.jpg), a paragraph at a time with ▽;
  // once read it joins the progress log marked NEW. Talks and fights keep their own windows.
  // Only the player turns the page: while the scene is still being written the box stays on the paragraph being read (it
  // used to jump to whichever paragraph had just arrived), and ▽ waits when the next one hasn't been written yet.
  const [vnPage, setVnPage] = useState(0);
  const [readDone, setReadDone] = useState('');
  const readKey = freshFrom === null ? '' : `${freshFrom}:${session.log.length}`;
  const toPages = (text: string) => { const c = storyText(text), h = c.match(/^【([^】]+)】\s*/); const place = h ? h[1].split('·')[0].trim() : '';
    return (h ? c.slice(h[0].length) : c).split(/\n+/).map(t => t.trim()).filter(Boolean).map(t => ({ place, text: t })); };
  const readPages = freshFrom === null || session.mode ? [] : groupLog(session.log).slice(freshFrom).flatMap(it => it.kind === 'entry' && /^(GM|이벤트):/.test(it.entry) ? toPages(it.entry.replace(/^(GM|이벤트):\s*/, '')) : []);
  const reading = !busy && !session.mode && !!readKey && readPages.length > 0 && readDone !== readKey;
  const streaming = busy && !session.mode && !!liveScene.trim();
  const vnPages = reading ? readPages : streaming ? toPages(liveScene) : [];
  const vnAt = Math.min(vnPage, Math.max(0, vnPages.length - 1));
  const finishReading = () => setReadDone(readKey);
  const nextPage = () => { if (vnAt + 1 < vnPages.length) setVnPage(vnAt + 1); else if (reading) finishReading(); };
  // The fight plays out in the log, so a fight brings the log forward.
  useEffect(() => { if (session.mode === 'combat') setSideTab('log'); }, [session.mode]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [session.log, sideTab, !!liveScene, readDone]);
  useEffect(() => { if (!busy) { setLiveScene(''); setLiveTalk(''); } }, [busy]);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(''), 2500); return () => clearTimeout(t); } }, [notice]);

  const game = games.find(g => g.id === selected) ?? games[0] ?? initial;
  // Auto battle: once the GM has sized up the foe, exchanges play out on a timer until someone falls.
  useEffect(() => {
    const c = session.combat;
    if (view !== 'play' || session.mode !== 'combat' || !c || c.result || busy) return;
    const timer = setTimeout(() => setSession(s => {
      if (s.mode !== 'combat' || !s.combat || s.combat.result) return s;
      // If the GM never answered, fight an average foe rather than stall.
      if (s.combat.round < 1) { const combat = startCombat(s.combat, s.npcCombat?.[s.combat.npc] || null);return { ...s, combat, log: [...s.log, battleIntro(combat, s.hp, maxHpOf(game, s))] }; }
      return autoBattleStep(game, s);
    }), c.round < 1 ? 1700 : 1150);
    return () => clearTimeout(timer);
  }, [view, session.mode, session.combat, busy, game]);
  const update = (patch: Partial<Game>) => setGames(old => old.map(g => g.id === game.id ? { ...g, ...patch } : g));
  // Auto-load defaults once when a new game's map editor is first opened.
  useEffect(() => {
    if (!ready || view !== 'edit' || tab !== 'map' || !game.id || game.id === 'sample' || (game.maps||[]).length) return;
    const genre=defaultMapGenre(game);
    const presets=presetMaps(genre);
    setGames(old=>old.map(item=>item.id===game.id && !(item.maps||[]).length ? {...item,maps:presets,startMapId:presets[0].id,startPinId:(genre==='wuxia' ? presets[0].pins.find(p=>p.name==='낙양') : presets[0].pins[0])?.id} : item));
    setEditingMapId(presets[0].id);
  }, [ready,view,tab,game.id,game.maps?.length,game.wizardWorld]);

  // Upgrade older built-in maps that were shipped without place markers.
  useEffect(() => {
    if (!ready || view !== 'edit' || tab !== 'map' || !game.id || !(game.maps||[]).length) return;
    const existing=game.maps||[];
    const updated=existing.map(m=>{
      const match=/^\/api\/default-map\/(wuxia|fantasy|modern)\/([0-3])$/.exec(m.image);
      if (!match || m.pins.length) return m;
      const sample=rawPresetMaps(match[1])[Number(match[2])];
      return {...m,pins:sample.pins.map(p=>({...p,id:`${m.id}-${p.id}`}))};
    });
    if (updated.every((m,i)=>m===existing[i])) return;
    const startMap=updated.find(m=>m.id===game.startMapId) || updated[0];
    setGames(old=>old.map(item=>item.id===game.id ? {...item,maps:updated,startMapId:item.startMapId||startMap.id,startPinId:item.startPinId||startMap.pins[0]?.id} : item));
  }, [ready,view,tab,game.id,game.maps]);

  async function generateRegistration(target:Game){
    if(registrationBusy)return;
    const prompt=String(target.prompt||'').trim();
    if(!prompt){setRegistrationError('먼저 게임 프롬프트를 완성해 주세요.');return;}
    setRegistrationBusy(true);setRegistrationError('');
    try{
      const response=await fetch('/api/registration/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:target.name,description:target.description,prompt:prompt.slice(0,PROMPT_LIMIT),gameType:target.wizardType||target.gameType,world:target.wizardWorld||''})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'등록 소개 생성에 실패했습니다.');
      setGames(old=>old.map(g=>g.id===target.id?{...g,registrationDescription:result.description,hashtags:result.hashtags}:g));
    }catch(e){setRegistrationError(e instanceof Error?e.message:'등록 소개 생성 오류');}
    finally{setRegistrationBusy(false);}
  }

  function create() {
    const g: Game = { ...initial, characterConfig:{...minimalCharacterConfig(),sections:{character:true,stats:true,equipment:true,inventory:true,status:true,relationships:true}}, showHpBar:true, showEquipment:true, showDice:true, startingEquipment:'', promptDrafts:{},customPromptSections:[],removedPromptSections:[], assets: [], imageRows: [], imageColumns: [{ id: makeId(), name: '기본' }], imageCells: [], mapImage: '', maps: [], id: makeId(), name: '', description: '', created: Date.now(), cover: '' };
    setGames(old => [...old, g]); setSelected(g.id); setTab('prompt'); setView('edit');
  }
  // Build the first three actions from the actual prologue, not the map's nearest pins.
  async function loadOpeningChoices(g: Game) {
    if (!prologueText(g).trim()) return;
    try {
      const response = await fetch('/api/prologue/choices', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prologue:prologueText(g), prompt:(g.prompt||'').slice(0,PROMPT_LIMIT), name:g.name, genre:defaultMapGenre(g), firstQuest:mainPrologue(g.wizardMain)?.firstQuest || ''})
      });
      if (!response.ok) throw new Error('opening choices unavailable');
      const data = await response.json();
      if (!Array.isArray(data.choices) || data.choices.length !== 4) throw new Error('invalid opening choices');
      setSession(current => {
        if (current.gameId !== g.id || current.log.length !== 1 || !current.log[0].startsWith('프롤로그:')) return current;
        // The game opens on an empty stage: nobody is met or encountered until the player acts.
        // A story's fixed first quest wins over the model's guess.
        const fixed = mainPrologue(g.wizardMain)?.firstQuest;
        return {...current, quests: fixed ? [fixed] : typeof data.currentGoal === 'string' && data.currentGoal.trim() ? [data.currentGoal.trim().slice(0,160)] : questsOf(current), suggestedActions:data.choices, sceneNpcs: []};
      });
    } catch {
      // API 오류 시에도 장르별 사건 기반 선택지 3개를 유지합니다.
    }
  }
  async function start(g: Game) {
    setSelected(g.id);
    setLogShown(LOG_PAGE);
    try {
      const savedInDb = await readProjectRecord<Session>('session-' + g.id);
      const raw = savedInDb ? JSON.stringify(savedInDb) : localStorage.getItem('crpg-session-' + g.id);
      if (raw) {
        const saved = JSON.parse(raw) as Session;
        if (saved.gameId === g.id && Array.isArray(saved.log)) {
          const maps = g.maps || [];
          const savedMap = maps.find(m => m.id === saved.mapId);
          const savedPin = savedMap?.pins.find(p => p.id === saved.pinId);
          const fallback = getStartingLocation(g);
          // 이전 플레이 기록에 위치가 없거나 해당 핀이 삭제되었으면 시작 지점으로 복구합니다.
          const location = savedMap && savedPin
            ? { mapId: savedMap.id, pinId: savedPin.id } : fallback;
          replaceSession(withStoryItems(g, { ...saved, ...location, metNpcs: saved.metNpcs || (saved.relationships || []).map(r => r.name), pendingCheck: saved.pendingCheck || null, lastCheck: saved.lastCheck || null,
            characterValues: saved.characterValues || startValues(g), characterEquipment: saved.characterEquipment || {}, characterGold: typeof saved.characterGold === "number" ? saved.characterGold : (g.characterConfig || defaultCharacterConfig()).initialGold,
            inventory: Array.isArray(saved.inventory) ? saved.inventory : combinedStartingItems(g.prompt || '', g.startingEquipment || ''),
            flags: Array.isArray(saved.flags) ? saved.flags : [],
            triggeredEvents: Array.isArray(saved.triggeredEvents) ? saved.triggeredEvents : [],
            relationships: Array.isArray(saved.relationships) ? saved.relationships : [],
            currentGoal: typeof saved.currentGoal === 'string' ? saved.currentGoal : '', quests: Array.isArray(saved.quests) ? saved.quests.filter((x: unknown): x is string => typeof x === 'string').slice(0, MAX_QUESTS) : undefined, completedGoalSteps:Array.isArray(saved.completedGoalSteps)?saved.completedGoalSteps.filter((x:unknown)=>Number.isInteger(x)&&Number(x)>=0):[],goalCompleted:saved.goalCompleted === true,
            suggestedActions: Array.isArray(saved.suggestedActions) && saved.suggestedActions.some((x: unknown) => typeof x === 'string' && x.trim()) ? saved.suggestedActions.filter((x: unknown) => typeof x === 'string' && x.trim()).slice(0, 4) : (saved.pendingCheck ? [] : (saved.log.length===1 && saved.log[0]?.startsWith('프롤로그:') ? openingActions(g) : defaultActions(g, location.mapId, location.pinId))),
            activeImageKey: typeof saved.activeImageKey === 'string' ? saved.activeImageKey : undefined, travel: undefined,
            sceneNpcs: Array.isArray(saved.sceneNpcs) ? saved.sceneNpcs.filter((x: unknown): x is string => typeof x === 'string').slice(0, 3) : [],
            x: Number.isFinite(saved.x) ? Math.max(0, Math.min(g.size - 1, saved.x)) : Math.floor(g.size / 2),
            y: Number.isFinite(saved.y) ? Math.max(0, Math.min(g.size - 1, saved.y)) : Math.floor(g.size / 2)
          }));
        } else replaceSession(makeSession(g));
      } else replaceSession(makeSession(g));
    } catch { replaceSession(makeSession(g)); }
    moved.current = { map: '', pin: '', place: '', kind: '', seq: moved.current.seq };
    setView('play');
    // Only fresh sessions are modified by the opening analysis; restored progress is left intact.
    void loadOpeningChoices(g);
  }
  function newGame() {
    if (busy) return;
    if (!window.confirm('현재 플레이 기록을 지우고 처음부터 새로 시작할까요? 게임 제작 설정과 맵은 유지됩니다.')) return;
    setAction('');
    directorOwed.current = false; npcMemoryQueue.current = {};
    replaceSession(makeSession(game));
    void loadOpeningChoices(game);
    if (chatRef.current) chatRef.current.scrollTop = 0;
  }
  function remove(g: Game) {
    if (!confirm(`'${g.name}' 게임을 삭제할까요?`)) return;
    const remaining = games.filter(item => item.id !== g.id);
    if (!remaining.length) {
      const fresh: Game = { ...initial, id: makeId(), created: Date.now(), playMode: 'single', minPlayers: 2, maxPlayers: 4, maps: [] };
      setGames([fresh]); setSelected(fresh.id);
    } else { setGames(remaining); if (selected === g.id) setSelected(remaining[0].id); }
    void deleteProjectRecord('session-' + g.id).catch(() => {});
    localStorage.removeItem('crpg-session-' + g.id);
  }
  function move(x: number, y: number) {
    setSession(s => {
      if (Math.abs(x - s.x) + Math.abs(y - s.y) !== 1) return { ...s, log: [...s.log, '시스템: 상하좌우 인접 칸으로만 이동할 수 있습니다.'] };
      return { ...s, x, y, log: [...s.log, `시스템: (${x + 1}, ${y + 1}) 칸으로 이동했습니다.`] };
    });
  }
  // The stat behind a check and its modifier: shown before the roll and used by it.
  function checkBonus(check: { ability: string; label: string }) {
    const cfg = game.characterConfig || defaultCharacterConfig();
    const field = cfg.fields.find(f => f.id.toLowerCase() === check.ability.toLowerCase());
    const raw = Number(session.characterValues?.[field?.id || check.ability] ?? field?.initial ?? 10);
    const score = Number.isFinite(raw) ? raw : 10;
    return { statName: field ? statDisplayName(field) : check.label, score, modifier: Math.floor((score - 10) / 2) };
  }
  // The roll happens on screen: the dialog shows the target and the modifiers, the die tumbles for a moment, then
  // lands with the verdict; the story moves on only when the player confirms.
  function roll() {
    const check = session.pendingCheck;
    if (!check || busy || diceRoll) return;
    const die = 1 + Math.floor(Math.random() * 20);
    const { statName, score, modifier } = checkBonus(check);
    const total = die + modifier;
    const success = die === 20 || (die !== 1 && total >= check.dc);
    const result: DiceResult = { ability: check.ability, label: check.label, dc: check.dc, weight: check.weight, die, modifier, total, success, critical: die === 20 ? '대성공' : die === 1 ? '대실패' : '', onSuccess: check.success, onFailure: check.failure };
    setDiceRoll({ result, statName, score, face: 1 + Math.floor(Math.random() * 20), done: false });
    const started = Date.now();
    const tick = setInterval(() => {
      if (Date.now() - started >= DICE_ROLL_MS) { clearInterval(tick); setDiceRoll(r => r && { ...r, face: die, done: true }); return; }
      setDiceRoll(r => r && { ...r, face: 1 + Math.floor(Math.random() * 20) });
    }, 70);
  }
  // Backing off: no roll, no result; the player is back at the choices they had before trying.
  function skipCheck() {
    const check = session.pendingCheck;
    if (!check || busy || diceRoll) return;
    setSession(s => ({ ...s, pendingCheck: null, suggestedActions: check.back?.length ? check.back : defaultActions(game, s.mapId, s.pinId), log: [...s.log, `시스템: ${check.label} 판정을 하지 않고 물러났습니다.`] }));
  }
  async function confirmRoll() {
    const check = session.pendingCheck, result = diceRoll?.result;
    if (!check || !result || !diceRoll?.done || busy) return;
    setDiceRoll(null);
    const { die, modifier, total, success } = result;
    const field = (game.characterConfig || defaultCharacterConfig()).fields.find(f => f.id.toLowerCase() === check.ability.toLowerCase());
    const verdict = result.critical || (success ? '성공' : '실패');
    // A check trains the ability it tested, a bit more when it succeeds.
    const trained = train(session, [field?.id], success ? 3 : 2);
    const next: Session = { ...trained, pendingCheck: null, lastCheck: result, roll: die,
      suggestedActions: [], log: [...session.log, `주사위: ${check.label} — D20(${die}) ${modifier >= 0 ? '+' : '-'} ${Math.abs(modifier)} = ${total} / DC ${check.dc} → ${verdict}${(success ? check.success : check.failure) ? ` — ${success ? check.success : check.failure}` : ''}`] };
    setSession(next);
    await requestGM(check.action, next, undefined, true, result);
  }
  async function generateGoalSteps(){
    if(goalStepsBusy)return;
    setGoalStepsBusy(true);setGoalStepsError('');
    try{
      const r=await fetch('/api/goals/steps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:getGameGoal(game),prompt:game.prompt||'',genre:game.wizardType||game.gameType||''})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'단계 추천 실패');
      if(!Array.isArray(data.steps)||data.steps.length<2)throw new Error('단계 추천 결과가 올바르지 않습니다.');
      if((game.finalGoalSteps||[]).some(x=>x.trim())&&!window.confirm('기존 목표 단계들을 AI 추천으로 교체할까요?'))return;
      update({finalGoalSteps:data.steps});
    }catch(e){setGoalStepsError(e instanceof Error?e.message:'AI 단계 추천 실패');}finally{setGoalStepsBusy(false);}
  }
  // Once enough entries pile up past the summary, the older ones are folded into long-term memory in the background.
  // Busy marks hold the playthrough (runId) whose job is running: a job left over from before 새로 하기 neither blocks the new
  // game's own jobs nor clears their mark when it ends (its results are dropped by the runId checks).
  const memoryBusy = useRef<string | false>(false);
  const directorBusy = useRef<string | false>(false);
  // A turn the director had to read came while it was busy: the next turn is read in its place.
  const directorOwed = useRef(false);
  const latestSession = useRef(session);
  latestSession.current = session;
  const npcMemoryQueue = useRef<Record<string, Promise<void>>>({});
  // The scene stage swaps to the travel map while this is open; picking a destination swaps it back.
  const [mapOpen, setMapOpen] = useState(false);
  const [repBurst, setRepBurst] = useState<{ delta: number; total: number; key: number } | null>(null);
  const [awakenBurst, setAwakenBurst] = useState<{ level: number; key: number } | null>(null);
  useEffect(() => { if (awakenBurst) { const t = setTimeout(() => setAwakenBurst(null), 4200); return () => clearTimeout(t); } }, [awakenBurst]);
  const [levelBurst, setLevelBurst] = useState<{ level: number; key: number } | null>(null);
  useEffect(() => { if (levelBurst) { const t = setTimeout(() => setLevelBurst(null), 3200); return () => clearTimeout(t); } }, [levelBurst]);
  useEffect(() => { if (repBurst) { const t = setTimeout(() => setRepBurst(null), 3200); return () => clearTimeout(t); } }, [repBurst]);
  // Gear the last beaten enemy was carrying; the GM names it in the next reply and its grade is fixed here.
  const [itemBurst, setItemBurst] = useState<{ name: string; info: ItemInfo; more: number; key: number } | null>(null);
  useEffect(() => { if (itemBurst) { const t = setTimeout(() => setItemBurst(null), 4200); return () => clearTimeout(t); } }, [itemBurst]);
  // The quest-clear window: what was finished this turn and everything it paid out.
  // The player's own action, typed as the last choice (apart from the creator's test command).
  const [ownAction, setOwnAction] = useState('');
  const [diceRoll, setDiceRoll] = useState<{ result: DiceResult; statName: string; score: number; face: number; done: boolean } | null>(null);
  const [questClear, setQuestClear] = useState<QuestClear | null>(null);
  const [partyResult, setPartyResult] = useState<{ npc: string; accepted: boolean; chance: number; thinking: boolean } | null>(null);
  // While the map is open the stage takes the map image's own ratio, so the art fills it edge to edge.
  const [mapRatios, setMapRatios] = useState<Record<string, number>>({});
  const noteMapRatio = (src: string, img: HTMLImageElement) => { if (img.naturalWidth && img.naturalHeight && !mapRatios[src]) setMapRatios(r => r[src] ? r : { ...r, [src]: img.naturalWidth / img.naturalHeight }); };
  async function rememberStory(s: Session) {
    const upTo = s.memory?.upTo || 0;
    // At most 60 entries per call, so an old save without memory catches up over a few turns.
    const target = Math.min(s.log.length - MEMORY_KEEP_RECENT, upTo + 60);
    const run = s.runId || '-';
    if (memoryBusy.current === run || target - upTo < MEMORY_BATCH) return;
    memoryBusy.current = run;
    try {
      const res = await fetch('/api/gm/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: s.memory?.summary || '', pinned: s.memory?.pinned || [], currentGoal: questsOf(s).join(' / '), entries: s.log.slice(upTo, target).map(historyLine) }) });
      const data = await res.json();
      if (!res.ok || typeof data.summary !== 'string') throw new Error(data.error || '장기 기억 갱신 실패');
      // Apply only if this is still the same playthrough and nobody summarized in between.
      setSession(cur => cur.gameId === s.gameId && cur.runId === s.runId && (cur.memory?.upTo || 0) === upTo && cur.log.length >= target && cur.log[0] === s.log[0] ? { ...cur, memory: { summary: data.summary, upTo: target, pinned: [...new Set([...(cur.memory?.pinned || []), ...(Array.isArray(data.pinned) ? data.pinned.filter((x: unknown): x is string => typeof x === 'string') : [])])] } } : cur);
      // Outside of talks, what happened with each met NPC (help, quests, fights, deals) goes into that NPC's own memory too.
      // Talk lines are skipped: they were folded in when the talk ended.
      const batch = s.log.slice(upTo, target).filter(e => !parseTalk(e));
      for (const npc of [...new Set((s.relationships || []).map(r => r.name.trim()))].filter(n => n.length >= 2))
        foldNpcMemory(s, npc, batch.filter(e => e.includes(npc)).map(historyLine));
    } catch (e) { console.warn('장기 기억 갱신 실패', e); }
    finally { if (memoryBusy.current === run) memoryBusy.current = false; }
  }
  // The major model reviews the story in the background after a major scene, or every DIRECTOR_EVERY log entries; the next scene gets its notes.
  const hookPlaces = (s: Session) => {
    const map = (game.maps || []).find(m => m.id === s.mapId), pin = map?.pins.find(p => p.id === s.pinId);
    return { here: s.scenePlace || pin?.name || '', nearby: map && pin ? reachablePins(map, pin).filter(p => p.kind !== 'exit' && p.kind !== 'event').map(p => p.name) : [] };
  };
  // The hand-written stories and jobs of each place, by their hook.
  const placeStoriesOf = (s: Session, places: string[]) => { const mapName = (game.maps || []).find(m => m.id === s.mapId)?.name || '', free = regionFree(game, s);
    return Object.fromEntries(places.map(n => [n, regionQuestsOf(game).flatMap(r => !inRegion(r, `${mapName} ${n}`) ? [] : free(r) ? [`${r.kind === 'story' ? '지역 이야기' : '의뢰'} "${r.title}"(${r.giver}) — ${r.hook}`] : []).slice(0, 4)]).filter(([, v]) => v.length)); };
  // Met people who are in no cast list (portraits, the genre's default NPCs, the prompt): the GM invented them in free play.
  const improvisedNpcs = (s: Session) => { const cast = new Set([...(game.npcPortraits || []).map(n => n.name), ...(DEFAULT_NPC_NAMES[defaultMapGenre(game)] || [])]);
    return [...new Set((s.relationships || []).map(r => r.name.trim()))].filter(n => n.length >= 2 && !cast.has(n) && !(game.prompt || '').includes(n)); };
  // The director's hooks that can be acted on from where the player stands.
  // Only the hooks made for this very place: "여관을 나와 회색 탑 폐허로 간다" (made at the inn) came up again in 아스테라.
  // It also runs when the player stands somewhere it has prepared nothing for (new place, or the hooks here used up a few entries ago).
  async function directStory(s: Session, major: boolean) {
    const upTo = s.directorNotes?.upTo || 0;
    const { here, nearby } = hookPlaces(s);
    // People the GM made up during play have no setting line anywhere; the director writes one so they stay the same person.
    const madeUp = improvisedNpcs(s), uncarded = madeUp.filter(n => !s.npcCards?.[n]);
    // Places around the player without a sketch yet, so wherever they go next the scene GM has people and events to write from.
    const around = [...new Set([here, ...nearby].filter(Boolean))].slice(0, 9), seeds = s.placeSeedsV === PLACE_SEEDS_V ? s.placeSeeds || {} : {}, unseeded = around.filter(n => !seeds[n]);
    major = major || directorOwed.current;
    const run = s.runId || '-';
    if (directorBusy.current === run) { if (major) directorOwed.current = true; return; }
    if (s.dead || (!major && !uncarded.length && !unseeded.length && s.log.length - upTo < DIRECTOR_EVERY)) return;
    directorBusy.current = run; directorOwed.current = false;
    try {
      const res = await fetch('/api/gm/director', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory: s.memory?.summary || '', keyFacts: s.memory?.pinned || [], quests: questsOf(s), location: here, nearby, recent: s.log.slice(-30).map(historyLine),
          cast: [...genreCast(game, s), ...madeUp.filter(n => s.npcCards?.[n]).map(n => `${n}: ${s.npcCards![n]}`)], newPeople: uncarded, threads: s.directorNotes?.threads || [],
          seeds: Object.fromEntries(around.filter(n => seeds[n]).map(n => [n, seeds[n]])), unseeded, placeStories: placeStoriesOf(s, around), reserved: reservedNpcs(game, s), consequences: s.directorNotes?.consequences || [],
          // The world as far as the story has gone (later acts stay hidden), and who the hero is: the sketches were bland paperwork without them.
          world: withoutOldSpeechRules(game.prompt || [game.world, game.rules, game.gm].join('\n')).slice(0, 7000), act: s.act || 1,
          hero: JSON.stringify({ ...(s.characterValues || {}), level: s.level || 1, reputation: reputationRank(s.reputation || 0) }).slice(0, 500),
          story: s.storyPlan || '', prologue: s.log[0]?.startsWith('프롤로그:') ? s.log[0].slice(0, 2000) : '' }) });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.fixes)) throw new Error(data.error || '이야기 감독 실패');
      const notes: DirectorNotes = { fixes: data.fixes, hooks: Array.isArray(data.hooks) ? data.hooks : [], threads: Array.isArray(data.threads) ? data.threads : s.directorNotes?.threads || [], consequences: Array.isArray(data.consequences) ? data.consequences : s.directorNotes?.consequences || [], goals: Array.isArray(data.goals) ? data.goals : [], place: here, upTo: s.log.length, at: Date.now() };
      const cards: Record<string, string> = data.cards && typeof data.cards === 'object' ? Object.fromEntries(Object.entries(data.cards as Record<string, unknown>).filter(([n, c]) => uncarded.includes(n) && typeof c === 'string' && c.trim()).map(([n, c]) => [n, String(c).trim().slice(0, 200)])) : {};
      const places: Record<string, string> = data.places && typeof data.places === 'object' ? Object.fromEntries(Object.entries(data.places as Record<string, unknown>).filter(([n, c]) => around.includes(n) && typeof c === 'string' && c.trim()).map(([n, c]) => [n, String(c).trim().slice(0, 400)])) : {};
      setSession(cur => cur.gameId === s.gameId && cur.runId === s.runId && cur.log[0] === s.log[0] ? { ...cur, directorNotes: notes, npcCards: { ...(cur.npcCards || {}), ...cards }, placeSeeds: { ...(cur.placeSeedsV === PLACE_SEEDS_V ? cur.placeSeeds || {} : {}), ...places }, placeSeedsV: PLACE_SEEDS_V, ...(typeof data.story === 'string' && data.story.trim() ? { storyPlan: data.story.trim().slice(0, 1500) } : {}), act: Math.max(cur.act || 1, Math.min(9, Number(data.act) || 1)) } : cur);
    } catch (e) { console.warn('이야기 감독 실패', e); }
    finally { if (directorBusy.current === run) directorBusy.current = false; }
  }
  // The blueprint is asked for as soon as a game starts (while the prologue is read), so the first scene already has it.
  useEffect(() => { if (session.gameId && session.gameId === game.id && !session.storyPlan && !session.dead) void directStory(session, true); }, [session.gameId, !!session.storyPlan]); // eslint-disable-line react-hooks/exhaustive-deps
  // A GM reply is built from the session as it was when the request left. NPC memories, the story summary and the
  // director's notes are saved in the background meanwhile, so keep the newer ones instead of overwriting them with the snapshot.
  // The notes that went out with the request have been used, so their fixes are dropped.
  const keepMemories = (fresh: Session) => (cur: Session): Session => cur.gameId !== fresh.gameId ? fresh : cur.runId !== fresh.runId ? cur : {
    ...fresh, npcNotes: { ...(fresh.npcNotes || {}), ...(cur.npcNotes || {}) }, npcCards: { ...(fresh.npcCards || {}), ...(cur.npcCards || {}) }, placeSeeds: cur.placeSeedsV === PLACE_SEEDS_V ? { ...(fresh.placeSeeds || {}), ...(cur.placeSeeds || {}) } : fresh.placeSeeds, placeSeedsV: cur.placeSeedsV ?? fresh.placeSeedsV,
    memory: (cur.memory?.upTo || 0) > (fresh.memory?.upTo || 0) ? cur.memory : fresh.memory,
    directorNotes: (cur.directorNotes?.at || 0) > (fresh.directorNotes?.at || 0) ? cur.directorNotes : fresh.directorNotes && { ...fresh.directorNotes, fixes: [] },
    metNpcs: [...new Set([...(fresh.metNpcs || []), ...(cur.metNpcs || [])])],
    storyPlan: cur.storyPlan || fresh.storyPlan, act: Math.max(cur.act || 1, fresh.act || 1),
    ...((cur.focusAt ?? -1) > (fresh.focusAt ?? -1) ? { focus: cur.focus, focusAt: cur.focusAt } : {}),
  };
  // 【회색 탑 폐허】 written while the player stands in 레븐홀트: a scene set somewhere the player isn't.
  const strayScene = (cur: Session, message: string, text: unknown) => {
    const heading = cur.mode ? '' : String(text || '').match(/^\s*【([^】·|]+)/)?.[1].trim() || '';
    const map = (game.maps || []).find(m => m.id === cur.mapId), pinHere = map?.pins.find(p => p.id === cur.pinId)?.name || '';
    if (!heading || (pinHere.length >= 2 && heading.includes(pinHere)) || scenePin(game, cur, message, heading)) return false;
    const city = cityOfPlace(defaultMapGenre(game), heading);
    return city ? city !== pinHere : !!map?.pins.some(p => p.id !== cur.pinId && p.kind !== 'exit' && p.kind !== 'event' && p.name.length >= 2 && heading.includes(p.name));
  };
  async function requestGM(message: string, next: Session, event?: { id: string; text: string; trigger: string }, movementAllowed = true, diceResult?: DiceResult, debug = false, reroll = false, interfere = false) {
    if (next.goalCompleted || (next.dead && !next.log[next.log.length - 1]?.startsWith('시스템: 사망'))) return;
    setFreshFrom(groupLog(next.log).length); setVnPage(0);
    setBusy(true);
    try {
      // Goals the story gave the player join the quest list now (in the background they'd be lost to the reply built from the old session).
      // Only on the player's own action, not on a scene the game adds in between (the wrap-up after a talk, an arrival).
      const acted = next.log[next.log.length - 1] === `플레이어: ${message}`;
      if (!reroll && !debug && !next.mode && acted && (next.directorNotes?.goals || []).length) {
        const notes = next.directorNotes!;
        const goals = (notes.goals || []).filter(g => !questsOf(next).some(q => q === g || alikeQuest(q, g))).slice(0, Math.max(0, MAX_QUESTS - questsOf(next).length));
        next = { ...next, quests: [...questsOf(next), ...goals], log: [...next.log, ...goals.map(g => `시스템: 새 목표 — ${g}`)], directorNotes: { ...notes, goals: [] } };
      }
      const map = (game.maps || []).find(m => m.id === next.mapId);
      const pin = map?.pins.find(p => p.id === next.pinId);
      const where = regionWhere(game, next);
      const reserved = reservedNpcs(game, next);
      // The opening and the starting gear matter only at the start; later the story memory carries them.
      const early = playerActs(next) < 5;
      // Full profiles go only to people on stage, in the party, or in play right now (recent lines, the place sketch, a quest's next
      // person); everyone else stays a name in knownNpcs. Up to 24 profiles went every turn.
      const lately = [...next.log.slice(-8), next.placeSeeds?.[next.scenePlace || ''] || '', next.placeSeeds?.[pin?.name || ''] || ''].join(' ');
      let gmRequest = {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: withoutOldSpeechRules(promptUpToAct(game.prompt || [game.world, game.rules, game.gm].join('\n'), actsDone(next))).slice(0, PROMPT_LIMIT),
          action: message, history: recentHistory(next).map(historyLine), withThisNpc: next.mode === 'talk' ? npcHistory(next, next.talkNpc || '') : [], memory: next.memory?.summary || '', keyFacts: next.memory?.pinned || [], prologue: early ? prologueText(game) : '', movementAllowed, diceResult: diceResult || null, recentCheck: !diceResult && rolledRecently(next),
          talkPurpose: next.mode === 'talk' && next.talkPurpose && next.talkPurpose.npc === next.talkNpc ? next.talkPurpose.action : '', closeTalk: next.mode === 'talk' && message.trim() === (next.talkAccept || TALK_ACCEPT), debug, reroll, interfere, previousChoices: reroll ? next.suggestedActions || [] : [], mode: next.mode || '', genre: defaultMapGenre(game), talkTurns: next.mode === 'talk' ? talkTurns(next) : 0, npc: next.mode === 'talk' ? next.talkNpc || '' : next.combat?.npc || '', monsters: foesOf(defaultMapGenre(game)).map(m => ({ name: m.name, power: m.power, desc: m.desc, boss: !!m.boss })), combat: next.mode === 'combat' && next.combat ? { monster: !!next.combat.monster, foeDesc: next.combat.foeDesc || '', round: next.combat.round, enemyHp: next.combat.enemyHp, enemyMaxHp: next.combat.enemyMaxHp, itemUse: next.combat.itemUse || '' } : null,
          initialEquipment: !early ? '' : combinedStartingItems(game.prompt || "", game.startingEquipment || "").filter(n => !storyReplaces(game, n)).join(", "),
          ruleEquipment: !early ? [] : extractRuleItems(game.prompt || "").filter(r => !storyReplaces(game, r.name)),
          state: {
            directorNotes: next.directorNotes && (next.directorNotes.fixes.length || next.directorNotes.threads?.length) ? { fixes: next.directorNotes.fixes, threads: next.directorNotes.threads || [] } : undefined,
            unanswered: next.mode ? [] : next.directorNotes?.consequences || [],
            safePlace: !isDangerous(defaultMapGenre(game), where), relationships: next.relationships || [], quests: questsOf(next), currentGoal: currentGoalOf(next), gold: next.characterGold ?? startGold(game), reputation: next.reputation || 0, reputationRank: reputationRank(next.reputation || 0), recentFoes: next.recentFoes || [], party: next.party || [], partyLevels: Object.fromEntries((next.party || []).map(n => [n, npcLevel(next, n) || 3])),maxQuests: MAX_QUESTS,finalGoal:getGameGoal(game), finalGoalMode:game.finalGoalMode||'single', finalGoalSteps:game.finalGoalSteps||[],completedGoalSteps:next.completedGoalSteps||[],goalCompleted:!!next.goalCompleted,
            availableImages: [...(game.npcPortraits||[]).filter(n=>n.image).map(n=>`${n.name}::기본`),...(game.imageCells||[]).flatMap(cell=>{const row=(game.imageRows||[]).find(r=>r.id===cell.rowId);const col=(game.imageColumns||[]).find(c=>c.id===cell.columnId);return row&&col?[`${row.name}::${col.name}`]:[];})],
            currentMapId: map?.id || '', mapName: map?.name || '', locationName: next.scenePlace || pin?.name || '', mapPin: pin?.name || '', locationDescription: pin?.description || '',
            // The director's sketch of who is here and what is going on (made in the background); the scene GM writes from it.
            placeSeed: next.placeSeedsV !== PLACE_SEEDS_V ? '' : next.placeSeeds?.[next.scenePlace || ''] || next.placeSeeds?.[pin?.name || ''] || '',
            // Before the director has sketched a place (a fresh game's first stop), the writer still gets what the region
            // already holds; with nothing, it made up a spilled-flour chore while 카시아's job sat unused.
            localStories: Object.values(placeStoriesOf(next, [...new Set([next.scenePlace || '', pin?.name || ''].filter(Boolean))])).flat().slice(0, 4),
            locations: (game.maps || []).flatMap(worldMap => worldMap.pins.map(p => ({ id: p.id, mapId: worldMap.id, mapName: worldMap.name, name: p.name, kind: p.kind, description: p.description || '', targetMapId: p.targetMapId || '', targetPinId: p.targetPinId || '' }))),
            adjacentLocationIds: (map?.pins||[]).filter(p=>p.kind!=='event').map(p => p.id),
            adjacentLocations: map && pin ? reachablePins(map, pin).map(p => ({ id:p.id, name:p.name, kind:p.kind })) : [],
            knownNpcs: knownNpcNames(game, next).filter(n => !reserved.includes(n)), reservedNpcs: reserved,
            // Where the story people off stage are, so the writer doesn't bring them to wherever the hero goes.
            whereabouts: Object.entries(npcWhereabouts(game, next)).filter(([n]) => !reserved.includes(n) && ![next.talkNpc, ...(next.sceneNpcs || []), ...(next.party || [])].includes(n)).map(([n, at]) => `${n}: ${at}`),
            // The genre's cast with what each wants, hides and when it comes out. The writer had only their names, so it met
            // nobody at 한나's inn or 브리아's guild and made up a 마르타 instead.
            cast: genreCast(game, next), storyPlan: next.storyPlan || '', sceneNpcs: next.sceneNpcs || [], handledNpcs: next.handledNpcs || [], npcProfiles: npcProfiles(game, next).filter(p => !reserved.includes(p.name) && (p.inScene || p.inParty || lately.includes(p.name))),
            event: event?.text || '', eventTrigger: event?.trigger || '', currentInteractionEvent: pin?.eventTrigger === 'interact' ? pin.eventText || '' : '',
            characterValues: next.characterValues || {}, trainableStats: growthFields(game).map(f => ({ id: f.id, name: f.name })), hp: next.hp, maxHp: maxHpOf(game, next), level: next.level || 1, xp: next.xp || 0, inventory: next.inventory || [], items: (next.inventory || []).map(n => { const it = infoOf(n, next.itemInfo); return { name: n, grade: GRADE_LABELS[it.grade], kind: KIND_LABELS[it.kind], skill: it.skill?.name || '' }; }), equipped: next.equipped || {}, flags: next.flags || [], roll: next.roll
          }
        } satisfies GmBody)
      };
      // A scene is written by the story model and shown as it streams in; the same request then goes back with that text so the
      // game reads its numbers (HP, items, people, quests) and choices out of it. Talks, fights and rerolls keep one call.
      // Talk replies are written the same way: the partner's words stream into the talk window.
      const talking = next.mode === 'talk';
      setTalkStreamed(false);
      if ((!next.mode || talking) && !reroll && !debug) {
        try {
          const w = await fetch('/api/gm', { ...gmRequest, body: JSON.stringify({ ...JSON.parse(gmRequest.body), phase: 'write' }) });
          if (w.ok && w.body && (w.headers.get('Content-Type') || '').startsWith('text/plain')) {
            const rd = w.body.getReader(), dec = new TextDecoder();
            let written = '';
            for (;;) { const { done, value } = await rd.read(); if (done) break; written += dec.decode(value, { stream: true }); const shown = written.split(/(?:^|\n)\s*-{3,}/)[0]; if (talking) { setLiveTalk(shown.replace(/^\([^)]*\)\s*/, '')); setTalkStreamed(true); } else setLiveScene(shown); }
            if (written.split(/(?:^|\n)\s*-{3,}/)[0].trim().length > (talking ? 1 : 40) || (!talking && /\[판정:/.test(written))) gmRequest = { ...gmRequest, body: JSON.stringify({ ...JSON.parse(gmRequest.body), sceneText: written }) };
          }
        } catch (e) { console.warn('장면 쓰기 실패', e); }
      }
      const res = await fetch('/api/gm', gmRequest);
      let data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 요청 실패');
      // Moves are the map's: the writer stops where the player sets off ([이동: …] → data.goTo), and a scene written somewhere
      // the map hasn't taken the player (its heading names another place) is that move too. The game makes it, and the arrival
      // scene follows; when the place can't be reached from here, the player is told why. Before, such a scene was asked for
      // again with the same text and then covered with "당신은 잠시 숨을 고르며…" ("아스테라로 ㄱ", 2026-11-10).
      const moving = !reroll && !debug && !message.startsWith('시스템이 이동을 확정');
      const goTo = moving && typeof data.goTo === 'string' ? data.goTo : '';
      const strayTo = moving && !goTo && strayScene(next, message, data.text) ? String(data.text || '').match(/^\s*【([^】·|]+)/)?.[1].trim() || '' : '';
      const go = goTo || strayTo ? placeFor(goTo || strayTo, next) : undefined;
      if (strayTo && go) {
        if (go.pin) { await moveTo(go.pin, message, next, '', false); return; }
        if (go.inTown) { await walkInTown(go.inTown, message, next); return; }
        setSession(keepMemories({ ...next, suggestedActions: defaultActions(game, next.mapId, next.pinId), log: [...next.log, `시스템: ${go.why || '그곳으로는 지금 갈 수 없습니다.'}`] }));
        return;
      }
      // A reroll only swaps the choices; the log and state stay as they were.
      if (reroll) {
        const fresh = Array.isArray(data.choices) ? data.choices.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0).map((v: string) => v.trim().slice(0, 140)).slice(0, 4) : [];
        if (fresh.length) setSession(s => ({ ...s, suggestedActions: fresh })); else setNotice('새 선택지를 받지 못했습니다. 다시 시도해 주세요.');
        return;
      }
      if (!diceResult && data.check && typeof data.check === 'object') {
        const check = data.check;
        const ability = String(check.ability || '').toLowerCase();
        const valid = (game.characterConfig || defaultCharacterConfig()).fields.some(f => f.id.toLowerCase() === ability && f.kind === 'number');
        const dc = Number(check.dc);
        if (valid && Number.isFinite(dc) && dc >= 1 && dc <= 40) {
          const weight = weightOf(check.weight) || weightOf(dc) || 'normal';
          const pending: DiceCheck = { ability, weight, dc: checkDc(weight, next.level || 1), label: String(check.label || '능력').slice(0, 60), reason: String(check.reason || '행동 결과를 판정합니다.').slice(0, 200), action: message, success: String(check.success || '').slice(0, 80), failure: String(check.failure || '').slice(0, 80), back: (session.suggestedActions || []).filter(a => a !== message) };
          setSession(keepMemories({ ...next, suggestedActions: [], pendingCheck: pending, lastCheck: null, log: [...next.log, ...(String(data.text || '').trim() ? [`GM: ${data.text}`] : []), `시스템: ${pending.label} · DC ${pending.dc} — 주사위를 굴려주세요.`] }));
          return;
        }
      }
      // Dev only: keep the turn so the tests can replay it (app/api/dev/turn-record).
      if (process.env.NODE_ENV !== 'production') void fetch('/api/dev/turn-record', { method: 'POST', body: JSON.stringify({ at: new Date().toISOString(), gameId: game.id, session: next, data, message, ctx: { event, diceResult, debug } }) }).catch(() => {});
      const out = applyReply(game, next, data, message, { event, diceResult, debug });
      if (out.notice) setNotice(out.notice);
      if (out.repBurst) setRepBurst({ ...out.repBurst, key: Date.now() });
      if (out.questClear) setQuestClear(prev => mergeClear(prev, { ...out.questClear!, key: Date.now() }));
      if (out.levelBurst) setLevelBurst({ level: out.levelBurst, key: Date.now() });
      setSession(keepMemories(out.session));
      void rememberStory(out.settled); void directStory(out.settled, out.major);
      // The talk settled what the player does next: it waits on 대화 끝내기, which plays that action (endTalk).
      if (next.mode === 'talk' && out.session.talkEnded && typeof data.nextAction === 'string' && data.nextAction) { setSession(keepMemories({ ...out.session, talkNext: data.nextAction })); return; }
      if (next.mode === 'talk' && out.session.talkEnded && Array.isArray(data.afterChoices) && data.afterChoices.length) { setSession(keepMemories({ ...out.session, talkChoices: data.afterChoices.filter((c: unknown): c is string => typeof c === 'string').slice(0, 3) })); return; }
      // The scene showed the player setting off; the map move and the arrival come now.
      if (go && !out.session.threat && !out.session.dead && !out.session.mode) {
        if (go.pin) await moveTo(go.pin, message, out.session, '', false);
        else if (go.inTown) await walkInTown(go.inTown, message, out.session);
        else if (go.why) setSession(s => ({ ...s, log: [...s.log, `시스템: ${go.why}`] }));
      }
    } catch (err) {
      setSession(s => ({ ...s, log: [...s.log, `시스템: ${err instanceof Error ? err.message : 'AI 연결 실패'}`] }));
    } finally { setBusy(false); }
  }
  // Map marker is managed independently from the retired image matrix.
  const playerBaseImage = undefined;
  // The reachable place an action names, if any: the move is made by the game, so the GM writes the arrival, not the walk.
  function travelPinFor(text: string, s: Session = session) {
    if (!TRAVEL_VERB.test(text)) return undefined;
    const map = (game.maps || []).find(m => m.id === s.mapId); const here = map?.pins.find(x => x.id === s.pinId);
    if (!map || !here) return undefined;
    const words = (p: MapPin) => p.kind === 'exit' ? [] : p.name.split(/\s+/).filter(w => w.length >= 2 && !GENERIC_PLACE.test(w));
    const headed = (w: string) => [`${w}으로`, `${w}로`, `${w}에 `, `${w}까지`, `${w} 쪽`, `${w}쪽`].some(x => text.includes(x));
    return reachablePins(map, here).find(p => text.includes(p.name) || words(p).some(headed)) || cityTarget(text, map, here, headed)?.pin;
  }
  // The exit pin on this map that leads straight to the map holding a place (or the map itself) named in a travel action.
  // shortcut: one hop only; a map two exits away isn't found and the GM handles the action in place. Upgrade with a path search if maps chain.
  function exitToward(text: string, s: Session = session) {
    if (!TRAVEL_VERB.test(text)) return undefined;
    const map = (game.maps || []).find(m => m.id === s.mapId);
    if (!map) return undefined;
    const target = (game.maps || []).find(m => m.id !== map.id && ((m.name.length >= 2 && text.includes(m.name)) || m.pins.some(p => p.kind !== 'exit' && p.kind !== 'event' && p.name.length >= 2 && text.includes(p.name))));
    return target ? map.pins.find(p => p.kind === 'exit' && p.targetMapId === target.id) : undefined;
  }
  // Where a place the writer sends the player to lies: a pin to move to (on this map or through an exit), a place inside the
  // city the player is in, nothing when it is here already, or why it can't be reached from here.
  function placeFor(name: string, s: Session): { pin?: MapPin; inTown?: string; why?: string } {
    const go = `${name}로 간다`;
    const map = (game.maps || []).find(m => m.id === s.mapId), here = map?.pins.find(p => p.id === s.pinId), pinName = here?.name || '';
    const pin = travelPinFor(go, s) || exitToward(go, s);
    if (pin && map && here && reachablePins(map, here).some(p => p.id === pin.id)) return { pin };
    if (pinName.length >= 2 && name.includes(pinName)) return {};
    const town = cityPlaces(defaultMapGenre(game)).find(([n, c]) => c === pinName && n.length >= 2 && name.includes(n))?.[0];
    if (town) return town === s.scenePlace ? {} : { inTown: town };
    const onMap = map?.pins.find(p => p.kind !== 'exit' && p.kind !== 'event' && p.name.length >= 2 && (name.includes(p.name) || p.name.includes(name)));
    const elsewhere = (game.maps || []).find(m => m.id !== s.mapId && ((m.name.length >= 2 && name.includes(m.name)) || m.pins.some(p => p.kind !== 'exit' && p.kind !== 'event' && p.name.length >= 2 && name.includes(p.name))));
    return { why: onMap ? `${onMap.name}${josa(onMap.name, '은')} 여기서 바로 이어지지 않습니다. 지도에서 가까운 곳을 거쳐 가세요.`
      : elsewhere ? `${elsewhere.name}${josa(elsewhere.name, '로')} 바로 이어지는 길이 여기에는 없습니다. 지도에서 다른 길을 거쳐 가세요.`
      : `${name}${josa(name, '은')} 지도에 없는 곳입니다. 지도에서 갈 곳을 고르세요.` };
  }
  // A walk to another place in the same city: the scene moves there and the arrival is written.
  async function walkInTown(place: string, intent: string, base: Session) {
    const arrived: Session = { ...base, scenePlace: place, suggestedActions: [], lastCheck: null, log: [...base.log, `시스템: ${place}${josa(place, '로')} 이동했습니다.`] };
    setSession(arrived);
    await requestGM(`시스템이 이동을 확정했습니다. 플레이어가 ${place}에 도착했습니다. 플레이어가 하려던 일: "${intent}". 가는 길은 한 문장으로 줄이고, 도착하자마자 그 일을 시작한 장면을 쓰세요.`, arrived, undefined, false);
  }
  // A place inside a city named in the action (북문 초소 → 레븐홀트): that city's pin, when it isn't where the player is.
  function cityTarget(text: string, map: BoardMap, here: MapPin, headed: (w: string) => boolean): { pin: MapPin } | undefined {
    const near = reachablePins(map, here), genre = defaultMapGenre(game);
    const named = cityPlaces(genre).find(([n]) => n.length >= 2 && (text.includes(n + '으로') || text.includes(n + '로') || headed(n) || text.includes(n + '에서') || text.includes(n + '에 ')));
    const target = named ? map.pins.find(p => p.name === named[1] && p.kind !== 'exit' && p.kind !== 'event') : map.pins.find(p => p.id !== here.id && p.kind !== 'exit' && p.kind !== 'event' && p.name.length >= 2 && headed(p.name));
    if (!target || target.id === here.id) return undefined;
    return near.some(p => p.id === target.id) ? { pin: target } : undefined;
  }
  // meet: the person the player came to talk to. They wait at the destination; the talk itself opens from there.
  // logIntent: false when the player's line is already in the log (the scene showed them setting off).
  async function moveTo(p: MapPin, intent = '', base: Session = session, meet = '', logIntent = true) {
    const session = base;
    if (busy || session.pendingCheck || session.goalCompleted || session.dead) return;
    const map = (game.maps || []).find(m => m.id === session.mapId);
    const here = map?.pins.find(x => x.id === session.pinId);
    if (!map || !here || !reachablePins(map, here).some(x => x.id === p.id)) return;
    setMapOpen(false);
    let destinationMap = map;
    let destinationPin = p;
    if (p.kind === 'exit') {
      const blocked = p.requiredItem && !(session.inventory || []).includes(p.requiredItem) ? `${p.requiredItem} 아이템이 필요합니다.` : p.requiredFlag && !(session.flags || []).includes(p.requiredFlag) ? `${p.requiredFlag} 조건이 필요합니다.` : '';
      const target = (game.maps || []).find(m => m.id === p.targetMapId);
      const targetPin = target?.pins.find(x => x.id === p.targetPinId) || target?.pins.find(x => x.kind === 'start') || target?.pins.find(x => x.kind !== 'exit' && x.kind !== 'event');
      if (blocked || !target || !targetPin) { setSession(s => ({ ...s, log: [...s.log, `시스템: ${p.name} 이동 불가 — ${blocked || '연결된 목적지가 없습니다.'}`] })); return; }
      destinationMap = target; destinationPin = targetPin;
    }
    const key = `${destinationMap.id}:${destinationPin.id}`;
    const arrivalText = destinationPin.eventTrigger !== 'interact' ? destinationPin.eventText?.trim() || '' : '';
    const arrival = arrivalText && (!destinationPin.eventOnce || !(session.triggeredEvents || []).includes(key)) ? { id: key, text: arrivalText, trigger: 'enter' } : undefined;
    // NPCs stay behind; the GM reports who is at the new place.
    const next: Session = { ...session, mapId: destinationMap.id, pinId: destinationPin.id, scenePlace: undefined, travel: undefined, sceneNpcs: meet ? [meet] : [], handledNpcs: [], mode: undefined, talkNpc: undefined, combat: null, suggestedActions: [], lastCheck: null,
      triggeredEvents: arrival && destinationPin.eventOnce ? [...(session.triggeredEvents || []), key] : session.triggeredEvents,
      log: [...session.log, ...(intent && logIntent ? [`플레이어: ${intent}`] : []), `시스템: ${destinationMap.name} / ${destinationPin.name}${josa(destinationPin.name, '로')} 이동했습니다.`] };
    const genre = defaultMapGenre(game);
    const place = `${destinationPin.name} ${destinationPin.description || ''}`;
    const huntFoe = !arrival && isDangerous(genre, place) ? huntTarget(genre, place, questsOf(next)) : undefined;
    const hunted = huntFoe;
    const ambusher = hunted ? (Math.random() < HUNT_CHANCE ? hunted : undefined) : !arrival && isDangerous(genre, place) && Math.random() < ENCOUNTER_CHANCE ? pickEncounter(genre, place, next.level || 1, Math.random, next.recentFoes) : undefined;
    if (ambusher) { setSession({ ...next, threat: { npc: ambusher.name, monster: true, level: encounterLevel(ambusher.power, !!ambusher.boss, next.level || 1), lead: `${destinationPin.name}에 들어서자`, fleeTo: session.mapId && session.pinId ? { mapId: session.mapId, pinId: session.pinId } : undefined }, log: [...next.log, `시스템: 습격! ${ambusher.name}${josa(ambusher.name, '이')} 앞을 막아섭니다.`] }); return; }
    setSession(next);
    await requestGM(`시스템이 이동을 확정했습니다. 플레이어가 ${destinationPin.name}에 도착했습니다. ${meet ? arrivalToMeet(meet) : intent ? `플레이어가 하려던 일: "${intent}". 가는 길은 한 문장으로 줄이고, 도착하자마자 그 일을 시작한 장면을 쓰세요.` : '도착한 장면을 묘사하세요.'}`, next, arrival, false);
  }
  async function faceThreat() {
    const t = session.threat;
    if (busy || !t) return;
    const base: Session = { ...session, threat: undefined };
    const foe = t.monster ? findFoe(defaultMapGenre(game), t.npc) : undefined;
    if (foe) await startMonsterFight(foe, base, t.lead || '', t.level);
    else await startFight(t.npc, base, true);
  }
  async function fleeThreat() {
    const t = session.threat;
    if (busy || !t) return;
    // Running away always works, at a small cost in reputation (never below 0).
    const practiced = train(session, [statLike(game, AGILITY)], 2);
    const repBefore = session.reputation || 0, repAfter = repBefore > 0 ? Math.max(0, repBefore - FLEE_REPUTATION) : repBefore;
    const back = t.fleeTo && (game.maps || []).find(m => m.id === t.fleeTo!.mapId)?.pins.find(p => p.id === t.fleeTo!.pinId);
    const escaped: Session = { ...practiced, reputation: repAfter, threat: undefined, ...(t.monster ? {} : { clashed: { ...(session.clashed || {}), [t.npc]: playerActs(session) } }), ...(back ? { mapId: t.fleeTo!.mapId, pinId: back.id, sceneNpcs: [] } : {}), handledNpcs: [...new Set([...(session.handledNpcs || []), t.npc])], sceneNpcs: (back ? [] : (session.sceneNpcs || []).filter(n => n !== t.npc)), suggestedActions: [],
      log: [...session.log, `시스템: 도망 성공 — ${t.npc}에게서 벗어났습니다.${back ? ` ${back.name}${josa(back.name, '로')} 물러났습니다.` : ''}`, ...(repAfter !== repBefore ? [`시스템: 명성 ${formatReputation(repAfter - repBefore)} (${repAfter.toLocaleString('ko-KR')} · ${reputationRank(repAfter)}) — 도망쳤다는 소문이 돈다`] : [])] };
    setSession(escaped);
    await requestGM(`${t.npc}에게서 간신히 도망쳤다.${back ? ` 왔던 길을 되짚어 ${back.name}${josa(back.name, '로')} 물러났다.` : ''} 도망친 직후의 장면을 묘사하라.`, escaped, undefined, false);
  }
  // Monsters and hostile gangs are enemies on sight: straight into combat, never into the relationship list.
  async function startMonsterFight(foe: Foe, base: Session, lead = '', met?: number) {
    const level = met ?? encounterLevel(foe.power, !!foe.boss, base.level || 1), stats = enemyStats(level, !!foe.boss), edge = fightEdge(game, base, foe.name);
    const next: Session = { ...base, hp: edge.hp, mode: 'combat', talkNpc: undefined, combat: { npc: foe.name, monster: true, boss: !!foe.boss, level, lethal: true, foeDesc: foe.desc, power: foe.power, openCut: edge.openCut, enemyHp: stats.hp, enemyMaxHp: stats.hp, enemyDc: stats.dc, enemyDamage: stats.damage, round: 0 },
      npcCombat: { ...(base.npcCombat || {}), [foe.name]: { hp: stats.hp, dc: stats.dc, damage: stats.damage, power: foe.power } },
      suggestedActions: [], lastCheck: null, log: [...base.log, ...(base.log[base.log.length - 1]?.startsWith(`시스템: 습격! ${foe.name}`) ? [] : [`시스템: 습격! ${foe.name}${josa(foe.name, '이')} 나타났습니다.`]), ...edge.log] };
    setSession(next);
    await requestGM(`${lead ? lead + ' ' : ''}${foe.name}(${foe.desc})이(가) 덮쳐 온다. 대화의 여지 없이 전투가 시작된다.${edge.note}`, next);
  }
  function meetNpc(s: Session, npc: string, hostile = false): Relationship[] {
    const types = relationshipTypes(game);
    const hostileType = types.find(t => /적대|원수/.test(t)) || types[types.length - 1] || '적대';
    const list = [...(s.relationships || [])];
    const index = list.findIndex(p => p.name.trim().toLocaleLowerCase() === npc.trim().toLocaleLowerCase());
    if (index < 0) list.push({ id: makeId(), name: npc, relation: hostile ? hostileType : (types[0] || '초면'), affection: hostile ? -60 : 10 });
    else if (hostile) list[index] = { ...list[index], relation: hostileType, affection: Math.min(list[index].affection, -60) };
    return list;
  }
  function ignoreNpc(npc: string) {
    if (busy) return;
    setSession(s => ({ ...s, sceneNpcs: (s.sceneNpcs || []).filter(n => n !== npc), handledNpcs: [...(s.handledNpcs || []), npc], log: [...s.log, `시스템: ${npc}${josa(npc, '을')} 무시하고 지나쳤습니다.`] }));
  }
  async function startTalk(npc: string) {
    if (busy) return;
    const purpose = session.talkPurpose?.npc === npc ? session.talkPurpose.action : '';
    await openTalk(npc, purpose || `${npc}에게 다가가 말을 건다.`, { ...session, talkPurpose: undefined });
  }
  // The action that led here stays an action: the partner speaks first, and the player's own lines start after this.
  async function openTalk(npc: string, action: string, base: Session) {
    const talk: Session = { ...base, mode: 'talk', talkEnded: undefined, talkAccept: undefined, talkNext: undefined, talkChoices: undefined, talkNpc: npc, talkPurpose: { npc, action }, sceneNpcs: [...new Set([...(base.sceneNpcs || []), npc])].slice(-3), relationships: meetNpc(base, npc), handledNpcs: [...(base.handledNpcs || []).filter(n => n !== npc), npc], suggestedActions: [], lastCheck: null, log: [...base.log, `시스템: ${npc}${josa(npc, '와')} 대화를 시작했습니다.`] };
    // The partner just spoke to the player in the scene: that line opens the talk, so the GM doesn't greet or ask it again.
    const said = lastSceneLine(base.log, npc);
    const next: Session = said ? { ...talk, log: [...talk.log, `대화-NPC: ${JSON.stringify({ name: npc, line: said, gesture: '', quiet: false })}`] } : talk;
    setSession(next);
    await requestGM(action, next);
  }
  async function sayToNpc(line: string) {
    const clean = line.trim(); const npc = session.talkNpc;
    if (!clean || !npc || busy) return;
    setAction('');
    // Leaving: a walk-off line, or a line that heads for a named place ("북문 초소로 돌아가 보고한다").
    if ((LEAVING.test(clean) || (/(돌아가|가서|향해|찾아가|이동해)/.test(clean) && !!travelPinFor(clean, session))) && !/[?？]$/.test(clean)) {
      const closed: Session = { ...session, mode: undefined, talkNpc: undefined, sceneNpcs: (session.sceneNpcs || []).filter(n => n !== npc), suggestedActions: [], log: [...session.log, `시스템: ${npc}${josa(npc, '와')}의 대화가 끝났습니다.`, `플레이어: ${clean}`] };
      setSession(closed);
      void rememberTalk(session, npc);
      const dest = travelPinFor(clean, closed);
      if (dest) await moveTo(dest, clean, { ...closed, log: closed.log.slice(0, -1) });
      else await requestGM(clean, closed);
      return;
    }
    // Talking trains charm, or the mind when the game has no charm stat.
    const next: Session = { ...train(session, [statLike(game, CHARM) || statLike(game, MIND)]), suggestedActions: [], log: [...session.log, `대화-나: ${clean}`] };
    setSession(next);
    await requestGM(clean, next);
  }
  // Folds lines into one NPC's memory. Updates for the same NPC run one after another and start from
  // the newest note, so a talk and a story batch finishing together don't overwrite each other.
  function foldNpcMemory(from: Session, npc: string, lines: string[]) {
    const same = (cur: Session) => cur.gameId === from.gameId && cur.runId === from.runId;
    if (!lines.length) return;
    const run = (npcMemoryQueue.current[npc] || Promise.resolve()).then(async () => {
      try {
        const note = same(latestSession.current) ? latestSession.current.npcNotes?.[npc] || '' : '';
        const res = await fetch('/api/gm/npc-memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ npc, note, lines }) });
        const data = await res.json();
        if (res.ok && typeof data.note === 'string') {
          if (!same(latestSession.current)) return;
          setSession(cur => same(cur) ? { ...cur, npcNotes: { ...(cur.npcNotes || {}), [npc]: data.note } } : cur);
          latestSession.current = { ...latestSession.current, npcNotes: { ...(latestSession.current.npcNotes || {}), [npc]: data.note } };
        }
      } catch (e) { console.warn('NPC 기억 갱신 실패', e); }
    });
    npcMemoryQueue.current[npc] = run;
  }
  function rememberTalk(s: Session, npc: string) {
    const start = talkStartIndex(s.log, npc);
    foldNpcMemory(s, npc, start >= 0 ? s.log.slice(start + 1).filter(e => parseTalk(e)).map(historyLine) : []);
  }
  async function endTalk() {
    const npc = session.talkNpc;
    if (busy || !npc) return;
    // A talk that already finished: close it and let the scene move on, a short hand-off rather than a new scene.
    if (session.talkEnded) {
      const then = session.talkNext;
      const ways = !then ? session.talkChoices || [] : [];
      const closed: Session = { ...session, talkEnded: undefined, talkAccept: undefined, talkNext: undefined, talkChoices: undefined, mode: undefined, talkNpc: undefined, sceneNpcs: (session.sceneNpcs || []).filter(n => n !== npc), suggestedActions: ways, log: [...session.log, `시스템: ${npc}${josa(npc, '와')}의 대화가 끝났습니다.`, ...(then ? [`플레이어: ${then}`] : [])] };
      setSession(keepMemories(closed));
      void rememberTalk(session, npc);
      // The partner set what to do: the player picks the way on from the talk's own choices, no extra scene.
      if (ways.length) return;
      // The action the talk settled is played like one the player picked: a move goes on the map first.
      if (then) {
        const map = (game.maps || []).find(m => m.id === closed.mapId), here = map?.pins.find(p => p.id === closed.pinId);
        const pin = travelPinFor(then, closed) || exitToward(then, closed);
        if (pin && map && here && reachablePins(map, here).some(p => p.id === pin.id)) await moveTo(pin, then, closed, '', false);
        else await requestGM(then, closed);
        return;
      }
      await requestGM(`${npc}${josa(npc, '와')}의 대화가 방금 끝났다. ${npc}의 대사를 다시 쓰거나 대화 내용을 요약하지 말고, 대화 직후 그 자리의 모습만 1~2문장으로 짧게 서술하라. 장소는 옮기지 말고, 대화에서 정한 일을 하러 가는 행동을 1번 선택지로 제시하라.`, closed, undefined, false);
      return;
    }
    const next: Session = { ...session, mode: undefined, talkNpc: undefined, sceneNpcs: (session.sceneNpcs || []).filter(n => n !== npc), suggestedActions: [], log: [...session.log, `시스템: ${npc}${josa(npc, '와')}의 대화를 마쳤습니다.`] };
    setSession(next);
    void rememberTalk(session, npc);
    await requestGM(`${npc}${josa(npc, '와')}의 대화가 방금 끝났다. ${npc}의 대사를 다시 쓰거나 대화 내용을 요약하지 말고, 대화 직후 그 자리의 모습만 1~2문장으로 짧게 서술하라. 장소는 옮기지 말고, 다음에 할 일을 1번 선택지로 제시하라.`, next, undefined, false);
  }
  async function startFight(npc: string, base: Session = session, ambush = false) {
    if (busy && !ambush) return;
    const leaving = (base.party || []).includes(npc);
    // Death only against someone who truly hates the player (affection at or below HOSTILE_AFFECTION). Anyone else who
    // steps out to fight (a quest duel like 바레나, a person blocking the way) leaves the loser near death (HP 1);
    // before, any person who stepped out as a threat fought to the death.
    const lethal = ((base.relationships || []).find(r => r.name.trim() === npc.trim())?.affection ?? 0) <= HOSTILE_AFFECTION;
    const edge = fightEdge(game, base, npc);
    const next: Session = { ...base, hp: edge.hp, mode: 'combat', relationships: meetNpc(base, npc, true), party: (base.party || []).filter(n => n !== npc),combat: { lethal, npc, openCut: edge.openCut, enemyHp: 60, enemyMaxHp: 60, enemyDc: 12, enemyDamage: 8, round: 0 }, handledNpcs: [...(base.handledNpcs || []), npc], clashed: { ...(base.clashed || {}), [npc]: playerActs(base) }, suggestedActions: [], lastCheck: null, log: [...base.log, ...(leaving ? [`시스템: ${npc}${josa(npc, '이')} 파티를 떠났습니다.`] : []), ambush ? `시스템: ${npc}${josa(npc, '이')} 적의를 드러내며 덤벼듭니다!` : `시스템: ${npc}${josa(npc, '와')} 전투가 시작됐습니다.`, ...edge.log] };
    setSession(next);
    await requestGM(`${ambush ? `${npc}${josa(npc, '이')} 플레이어를 보자마자 적의를 드러내며 덤벼든다. 대화 없이 전투가 시작된다.` : `${npc}에게 덤벼들어 전투를 시작한다.`}${edge.note}`, next);
  }
  // The answer is all the player sees; the bar it was checked against stays hidden.
  function inviteToParty(npc: string) {
    if (busy || session.mode || session.goalCompleted) { setNotice('진행 중인 장면이 끝난 뒤 권유할 수 있습니다.'); return; }
    const party = session.party || [];
    if (party.includes(npc) || partyResult) return;
    if (party.length >= PARTY_LIMIT) { setNotice(`파티는 최대 ${PARTY_LIMIT}명까지입니다. 먼저 동료 한 명과 헤어지세요.`); return; }
    const rel = (session.relationships || []).find(r => r.name.trim() === npc.trim());
    if (inviteWait(session, npc) > 0) { setNotice(`${npc}${josa(npc, '은')} 얼마 전에 거절했습니다. 이야기가 좀 더 진행된 뒤 다시 권유해 보세요.`); return; }
    const chance = rel ? joinChance(rel.affection, session.reputation || 0, npcTaste(game, npc)) : 0;
    const accepted = Math.random() < chance;
    // The NPC visibly weighs the offer before answering; the companion joins only when the answer is revealed.
    // The GM learns of a new companion through state.party, not the log.
    setPartyResult({ npc, accepted, chance, thinking: true });
    window.setTimeout(() => {
      if (accepted) setSession(s => (s.party || []).includes(npc) || (s.party || []).length >= PARTY_LIMIT ? s : { ...s, party: [...(s.party || []), npc], sceneNpcs: (s.sceneNpcs || []).filter(n => n !== npc), handledNpcs: [...new Set([...(s.handledNpcs || []), npc])], companions: s.companions?.[npc] ? s.companions : { ...(s.companions || {}), [npc]: { level: npcLevel(s, npc) || 3, xp: 0 } } });
      else setSession(s => ({ ...s, inviteRefusals: { ...(s.inviteRefusals || {}), [npc]: s.log.length } }));
      setPartyResult(r => r && r.npc === npc ? { ...r, thinking: false } : r);
    }, PARTY_THINK_MS);
  }
  // Abandoning frees a slot; the GM sees it in the log and stops steering toward it.
  function dropQuest(quest: string) {
    if (busy) return;
    if (!window.confirm(`이 퀘스트를 삭제할까요?\n\n${quest}`)) return;
    setSession(s => ({ ...s, quests: questsOf(s).filter(q => q !== quest), log: [...s.log, `시스템: 목표 포기 — ${quest}`] }));
  }
  // Drinks a healing potion: works in a fight too, where the next exchange starts from the healed HP.
  // Throws one copy away (the one at that place in the bag). A worn piece comes off, unless another copy is still there.
  function discardItem(item: string, index: number) {
    if (busy || session.mode === 'combat') { setNotice('전투 중에는 아이템을 버릴 수 없습니다.'); return; }
    if (!window.confirm(`${item}${josa(item, '을')} 버릴까요?`)) return;
    setSession(s => {
      const inventory = [...(s.inventory || [])], at = inventory[index] === item ? index : inventory.indexOf(item);
      if (at < 0) return s;
      inventory.splice(at, 1);
      const equipped = { ...(s.equipped || {}) };
      for (const slot of Object.keys(equipped) as (keyof Equipped)[]) if (equipped[slot] === item && !inventory.includes(item)) delete equipped[slot];
      const next = { ...s, inventory, equipped };
      return { ...next, hp: refitHp(game, s, next), log: [...s.log, `시스템: 버림 — ${item}`] };
    });
  }
  function useItem(item: string) {
    const share = healShareOf(item, infoOf(item, session.itemInfo));
    if (!share || session.dead) return;
    setSession(s => {
      const idx = (s.inventory || []).indexOf(item), max = maxHpOf(game, s);
      if (idx < 0 || s.hp >= max) return s;
      const hp = Math.min(max, s.hp + Math.round(max * share)), inventory = [...(s.inventory || [])];
      inventory.splice(idx, 1);
      return { ...s, hp, inventory, log: [...s.log, `시스템: 사용 — ${item} · HP ${s.hp} → ${hp}`] };
    });
  }
  function toggleEquip(item: string) {
    if (busy || session.mode === 'combat') { setNotice('전투 중에는 장비를 바꿀 수 없습니다.'); return; }
    const info = infoOf(item, session.itemInfo);
    if (info.kind === 'item') return;
    const slot = info.kind;
    setSession(s => {
      const equipped = { ...(s.equipped || {}) };
      if (equipped[slot] === item) delete equipped[slot]; else equipped[slot] = item;
      const next = { ...s, equipped };
      return { ...next, hp: refitHp(game, s, next) };
    });
  }
  function leaveParty(npc: string) {
    if (busy || session.mode) return;
    setSession(s => ({ ...s, party: (s.party || []).filter(n => n !== npc), log: [...s.log, `시스템: ${npc}${josa(npc, '와')} 헤어졌습니다.`] }));
  }
  async function finishBattle() {
    const c = session.combat;
    if (busy || !c?.result) return;
    const ending = c.result === 'win' ? `${c.npc}${josa(c.npc, '을')} 쓰러뜨려 전투에서 이겼다.` : `${c.npc}에게 패배해 쓰러졌다.`;
    // Fighting trains strength (and agility for long fights).
    const fought = train(session, [statLike(game, gearOf(session.equipped, session.itemInfo).caster ? MIND : STRENGTH), ...(c.round > 6 ? [statLike(game, AGILITY)] : [])], 2);
    const ended: Session = { ...fought, recentFoes: [c.npc, ...(session.recentFoes || []).filter(n => n !== c.npc)].slice(0, 3), mode: undefined, combat: null, sceneNpcs: (session.sceneNpcs || []).filter(n => n !== c.npc), suggestedActions: [], log: [...session.log, `시스템: 전투 종료 — ${c.result === 'win' ? '승리' : '패배'}`] };
    const died = c.result === 'lose' && !!c.lethal;
    if (died && Math.random() < (REVIVE_CHANCES[session.revivals || 0] ?? REVIVE_CHANCES[REVIVE_CHANCES.length - 1])) {
      // Awakening: levels, full health, a blessed charm, and the same fight resumes against the foe as it stands.
      const from = session.level || 1, to = Math.min(MAX_LEVEL, from + AWAKEN_LEVELS);
      const grown = growStats(game, { ...session, level: to, xp: 0 }, to - from);
      const gift = BLESSING[defaultMapGenre(game)] || BLESSING.fantasy;
      const charm = (session.inventory || []).includes(gift.name) ? undefined : gift.name;
      const itemInfo = charm ? { ...(session.itemInfo || {}), [charm]: { grade: 4 as Grade, kind: 'accessory' as ItemKind, desc: gift.desc, skill: rollSkill('accessory', 4, gift.skill) } } : session.itemInfo;
      const equipped = charm && !session.equipped?.accessory ? { ...(session.equipped || {}), accessory: charm } : session.equipped;
      const risen: Session = { ...grown.session, revivals: (session.revivals || 0) + 1, itemInfo, equipped, inventory: charm ? [...(session.inventory || []), charm] : session.inventory };
      const hp = maxHpOf(game, risen);
      setSession({ ...risen, hp, combat: { ...c, result: undefined, shield: undefined, last: undefined },
        log: [...risen.log, `시스템: 쓰러지는 순간, 어딘가에서 신의 목소리가 울립니다 — "아직 끝이 아니다."`, `시스템: 각성! Lv.${from} → Lv.${to} · HP 완전 회복 (${hp})`, ...(grown.note ? [`시스템: ${grown.note}`] : []), ...(charm ? [`시스템: 획득 — [전설] ${charm}${equipped?.accessory === charm ? ' (장착)' : ''}`] : []), `시스템: ${c.npc}${josa(c.npc, '와')}의 전투가 다시 시작됩니다!`] });
      setAwakenBurst({ level: to, key: Date.now() });
      return;
    }
    // A side quest naming the beaten foe (a 토벌 quest like "숲 트롤 토벌하기") is done the moment the fight is won.
    const hunts = c.result === 'win' ? questsOf(ended).filter(q => q.includes(c.npc)) : [];
    const huntGivers = hunts.map(q => ended.questGivers?.[q] || '');
    const huntRep = hunts.length * QUEST_REPUTATION, huntTotal = clampReputation((ended.reputation || 0) + huntRep);
    const huntGold = (ended.characterGold ?? startGold(game)) + hunts.length * QUEST_GOLD;
    const hunted: Session = !hunts.length ? ended : { ...ended, quests: questsOf(ended).filter(q => !hunts.includes(q)), reputation: huntTotal, characterGold: huntGold,
      relationships: (ended.relationships || []).map(r => huntGivers.includes(r.name.trim()) ? { ...r, affection: clampAffection(r.affection + QUEST_AFFECTION) } : r),
      log: [...ended.log, ...hunts.map((q, i) => `시스템: 목표 완료 — ${q}${huntGivers[i] ? ` (의뢰인 ${huntGivers[i]})` : ''}`), `시스템: 명성 ${formatReputation(huntRep)} (${huntTotal.toLocaleString('ko-KR')} · ${reputationRank(huntTotal)})`, `시스템: 골드 +${hunts.length * QUEST_GOLD} (보유 ${huntGold.toLocaleString('ko-KR')})`] };
    // Each 토벌 quest pays one piece of gear, handed out by the code.
    const bounty: string[] = [];
    if (hunts.length) {
      const itemInfo = { ...(hunted.itemInfo || {}) }, genre = defaultMapGenre(game);
      for (const q of hunts.slice(0, 2)) {
        const grade = rollGrade('side', rewardBase(ended.level || 1));
        const got = gearName(genre, randomGearKind(), grade, n => (hunted.inventory || []).includes(n) || bounty.includes(n));
        if (!got) { const p = POTIONS[genre] || POTIONS.fantasy; itemInfo[p.name] = { grade: 0, kind: 'item', desc: p.desc }; bounty.push(p.name); continue; }
        itemInfo[got.name] = { grade, kind: got.kind, desc: `「${q}」의 보수.`, skill: rollSkill(got.kind, grade, '') };
        bounty.push(got.name);
      }
      hunted.itemInfo = itemInfo;
      hunted.inventory = [...(hunted.inventory || []), ...bounty];
      hunted.log = [...hunted.log, `시스템: 획득 — ${bounty.map(n => `[${GRADE_LABELS[itemInfo[n].grade]}] ${n}`).join(', ')}`];
    }
    const fightXp = c.result === 'win' ? battleXp(c.level ?? levelForTier(c.power || 3), ended.level || 1) + hunts.length * questXp(ended.level || 1) : 0;
    const won = c.result === 'win' ? withXp(game, hunted, fightXp, hunts.length ? `${c.npc} 토벌` : `${c.npc} 격파`) : { session: ended, levelsGained: 0 };
    if (hunts.length) setQuestClear({ quests: hunts.map((name, i) => ({ name, giver: huntGivers[i] })), xp: fightXp, reputation: huntRep, total: huntTotal, items: bounty, levelFrom: ended.level || 1, levelTo: won.session.level || 1, key: Date.now() });
    else if (won.levelsGained) setLevelBurst({ level: won.session.level || 1, key: Date.now() });
    const next: Session = died ? { ...won.session, dead: true, hp: 0, suggestedActions: [], log: [...won.session.log, `시스템: 사망 — ${c.npc}에게 목숨을 잃었습니다.`] } : won.session;
    setSession(next);
    if (died) { await requestGM(`전투 결과: ${c.npc}에게 패배해 플레이어가 죽었다. 구출·포로·기적적 생존 없이 죽음이 확정이다. 플레이어의 마지막 순간을 비장하게 묘사하고 이야기를 끝내라. choices는 빈 배열이다.`, next); return; }
    if (c.result === 'lose') { await requestGM(`전투 결과: ${c.npc}에게 패배해 빈사 상태(HP 1)로 쓰러졌다. 죽지는 않았다. ${c.npc}${josa(c.npc, '이')} 숨통은 끊지 않고 어떻게 했는지(조롱하며 떠남, 소지품을 빼앗음, 경고하고 돌아섬 등) 그 인물답게 묘사하라. hpDelta는 0이다.`, next); return; }
    // What the foe leaves, handed out here and only narrated by the GM, the way a game does it: a beaten monster fades
    // away and leaves a drop where it fell (a piece from the gear table at its grade, else a healing potion); a person
    // leaves what they fought with.
    const genre = defaultMapGenre(game), lootGrade = gradeForTier(c.power || 3);
    const loot = c.result === 'win' && Math.random() < dropChance(c.power || 3) ? gearName(genre, randomGearKind(), lootGrade, n => (next.inventory || []).includes(n)) : undefined;
    const potion = POTIONS[genre] || POTIONS.fantasy;
    const prize = loot ? { name: loot.name, info: { grade: lootGrade, kind: loot.kind as ItemKind, desc: `${c.npc}${josa(c.npc, '을')} 쓰러뜨리고 얻은 전리품.` } } : { name: potion.name, info: { grade: 0 as Grade, kind: 'item' as ItemKind, desc: potion.desc } };
    const withPrize: Session = { ...next, inventory: [...(next.inventory || []), prize.name], itemInfo: { ...(next.itemInfo || {}), [prize.name]: prize.info }, log: [...next.log, `시스템: 획득 — ${loot ? `[${GRADE_LABELS[lootGrade]}] ` : ''}${prize.name}`] };
    setSession(withPrize);
    const found = c.monster ? `쓰러진 ${c.npc}${josa(c.npc, '은')} 빛무리처럼 흩어지며 사라지고, 그 자리에 ${prize.name}${josa(prize.name, '이')} 떨어져 있었습니다` : `${c.npc}${josa(c.npc, '이')} 지니고 있던 ${prize.name}${josa(prize.name, '을')} 손에 넣었습니다`;
    await requestGM(`전투 결과: ${Math.max(0, c.round - 1)}합의 공방 끝에 ${ending} 입힌 피해 ${c.totalDealt || 0}, 받은 피해 ${c.totalTaken || 0}. 전투가 끝난 뒤의 장면을 묘사하세요. ${found}(이미 지급됨, addItems에 넣지 마세요).${c.monster ? ' 몬스터의 몸을 뒤져 꺼냈다고 쓰지 말고, 사라진 자리에 떨어진 전리품을 줍는 장면으로 쓰세요.' : ''}${bounty.length ? ` 토벌 의뢰의 보수(${bounty.join(', ')})도 이미 지급됐으니 addItems에 다시 넣지 마세요.` : ''}`, withPrize);
  }
  function interact() {
    if (busy) return;
    const map = (game.maps || []).find(m => m.id === session.mapId);
    const pin = map?.pins.find(p => p.id === session.pinId);
    if (!map || !pin) return;
    const key = `${map.id}:${pin.id}`;
    if (!pin.eventText || pin.eventTrigger !== 'interact') return;
    if (pin.eventOnce && (session.triggeredEvents || []).includes(key)) {
      setSession(s => ({ ...s, log: [...s.log, '시스템: 이미 완료한 이벤트입니다.'] })); return;
    }
    const next = { ...session, triggeredEvents: pin.eventOnce ? [...(session.triggeredEvents || []), key] : (session.triggeredEvents || []), log: [...session.log, `이벤트: ${pin.eventText}`] };
    setSession(next);
    void requestGM(`플레이어가 ${pin.name}에서 상호작용합니다. 설정된 이벤트를 진행하세요.`, next, { id: key, text: pin.eventText, trigger: 'interact' });
  }
  async function sendPlayerAction(message: string, debug = false) {
    const clean = message.trim();
    if (!clean || busy || session.pendingCheck || session.dead) return;
    if (debug) setAction('');
    // Naming a dismissed NPC calls them back, so the encounter prompt can appear again.
    // Anyone the player already knows can be addressed; talking brings them on stage.
    const known = [...new Set([...(session.sceneNpcs || []), ...(session.relationships || []).map(p => p.name), ...(game.npcPortraits || []).map(n => n.name)])].filter(Boolean).sort((a, b) => b.length - a.length);
    const picked = (session.suggestedActions || []).includes(clean);
    const addressed = !debug && !picked ? known.find(n => speaksTo(clean, n)) : undefined;
    // "북문 초소로 돌아가 에드리아와 이야기한다": the move happens first, and the talk opens there, not where the player stood.
    const goFirst = addressed && SPEECH_INTENT.test(clean) && !debug ? travelPinFor(clean) : undefined;
    if (goFirst) { setAction(''); await moveTo(goFirst, clean, session, addressed); return; }
    // Heading for a place inside the city the player is already in (진흙 골목 → 북문 초소 in 레븐홀트) is a walk across town:
    // the scene moves there and the talk opens at that place.
    const inTown = addressed && SPEECH_INTENT.test(clean) && !debug && TRAVEL_VERB.test(clean) ? (() => { const pinName = (game.maps || []).find(m => m.id === session.mapId)?.pins.find(p => p.id === session.pinId)?.name || ''; return cityPlaces(defaultMapGenre(game)).find(([n, c]) => c === pinName && n.length >= 2 && clean.includes(n))?.[0]; })() : undefined;
    const sceneNow: Session = inTown ? { ...session, scenePlace: inTown } : session;
    const talkBase: Session = sceneNow;
    const here = (n: string) => (session.sceneNpcs || []).includes(n) || (session.party || []).includes(n);
    if (addressed && SPEECH_INTENT.test(clean) && (here(addressed) || talkBase.scenePlace !== session.scenePlace)) {
      setAction('');
      const acted: Session = { ...talkBase, log: [...session.log, `플레이어: ${clean}`] };
      // A walk across town is a real move: the arrival scene comes first, and the person waits there to be talked to.
      if (talkBase.scenePlace && talkBase.scenePlace !== session.scenePlace) {
        const arrived: Session = { ...acted, sceneNpcs: [...new Set([...(session.sceneNpcs || []), addressed])].slice(-3), handledNpcs: (session.handledNpcs || []).filter(n => n !== addressed), suggestedActions: [], lastCheck: null, log: [...acted.log, `시스템: ${talkBase.scenePlace}${josa(talkBase.scenePlace, '로')} 이동했습니다.`] };
        setSession(arrived);
        await requestGM(`시스템이 이동을 확정했습니다. 플레이어가 ${talkBase.scenePlace}에 도착했습니다. ${arrivalToMeet(addressed)}`, arrived, undefined, false);
        return;
      }
      await openTalk(addressed, clean, acted);
      return;
    }
    const dest = !debug ? travelPinFor(clean) : undefined;
    if (dest) { await moveTo(dest, clean); return; }
    // A place on another map: the exit leading to that map takes the player there, instead of the GM narrating an arrival the map never made.
    const exit = !debug ? exitToward(clean) : undefined;
    if (exit) { await moveTo(exit, clean); return; }
    const lastScene = [...session.log].reverse().find(e => e.startsWith('GM:')) || '';
    if (!debug && FIGHT_INTENT.test(clean) && BEAST_SCENE.test(lastScene)) {
      const genre = defaultMapGenre(game), pin = (game.maps || []).find(m => m.id === session.mapId)?.pins.find(p => p.id === session.pinId);
      const foe = foeInText(genre, lastScene) || pickEncounter(genre, `${session.scenePlace || ''} ${pin?.name || ''} ${pin?.description || ''}`, session.level || 1, Math.random, session.recentFoes);
      if (foe) { await startMonsterFight(foe, { ...session, suggestedActions: [], log: [...session.log, `플레이어: ${clean}`] }); return; }
    }
    const handledNpcs = (session.handledNpcs || []).filter(n => !clean.includes(n));
    // Now and then the hostile side gets in the way: after the first few actions, at least INTERFERE_GAP actions apart.
    const acts = session.log.filter(e => e.startsWith('플레이어:')).length + 1;
    const interfere = !debug && acts >= 4 && acts - (session.lastInterference || 0) >= INTERFERE_GAP && Math.random() < INTERFERE_CHANCE;
    const next: Session = { ...session, handledNpcs, typed: !picked && !debug, suggestedActions: [], lastCheck: null, ...(interfere ? { lastInterference: acts } : {}), log: [...session.log, `플레이어: ${debug ? '[테스트] ' : ''}${clean}`] };
    setSession(next);
    await requestGM(clean, next, undefined, true, undefined, debug, false, interfere);
  }
  function exportGame(g: Game) {
    const blob = new Blob([JSON.stringify(g, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${g.name.replace(/[^a-zA-Z0-9가-힣_-]/g, '_') || 'game'}.json`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importGame(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data.name !== 'string' || !(typeof data.prompt === 'string' || (typeof data.world === 'string' && typeof data.rules === 'string' && typeof data.gm === 'string'))) throw Error('Invalid JSON');
      const imported: Game = { ...initial, ...data, profileDone: data.profileDone ?? true, promptDone: data.promptDone ?? !!data.promptDrafts, mapDone: data.mapDone ?? !!data.maps?.length, settingsDone: data.settingsDone ?? !!data.registrationDescription, id: makeId(), name: data.name.slice(0, 100), description: typeof data.description === 'string' ? data.description : '', size: Math.max(5, Math.min(11, Number(data.size) || 7)), hp: Math.max(1, Number(data.hp) || 100), cover: typeof data.cover === 'string' && data.cover.startsWith('data:image/') ? data.cover : '', prompt: String(data.prompt || [data.world, data.rules, data.gm].join('\n')).slice(0, PROMPT_LIMIT), mapImage: typeof data.mapImage === 'string' && data.mapImage.startsWith('data:image/') ? data.mapImage : '', maps: Array.isArray(data.maps) ? data.maps.filter((m: BoardMap) => m && typeof m.id === 'string' && typeof m.image === 'string').map((m: BoardMap) => ({ ...m, pins: Array.isArray(m.pins) ? m.pins : [], links: Array.isArray(m.links) ? m.links : [] })).slice(0, 30) : (typeof data.mapImage === 'string' && data.mapImage.startsWith('data:image/') ? [{ id: makeId(), name: '기존 맵', image: data.mapImage, pins: [] }] : []), assets: Array.isArray(data.assets) ? data.assets.filter((a: Asset) => a && typeof a.name === 'string').slice(0, 60) : [], imageRows: Array.isArray(data.imageRows) ? data.imageRows.filter((r: ImageRow) => r && typeof r.name === 'string') : [], imageColumns: Array.isArray(data.imageColumns) ? data.imageColumns.filter((c: ImageColumn) => c && typeof c.name === 'string') : [], imageCells: Array.isArray(data.imageCells) ? data.imageCells.filter((c: ImageCell) => c && typeof c.image === 'string') : [], created: Date.now(), registrationDescription: typeof data.registrationDescription === 'string' ? data.registrationDescription.slice(0, 2000) : '', genre: typeof data.genre === 'string' ? data.genre : 'RPG / 탐험', gameType: normalizeType(data), cooperation: COOPERATION.includes(data.cooperation) ? data.cooperation : '협동', progression: PROGRESSION.includes(data.progression) ? data.progression : '턴제', playTime: PLAY_TIMES.includes(data.playTime) ? data.playTime : '장기 캠페인', hashtags: Array.isArray(data.hashtags) ? data.hashtags.filter((x: unknown) => typeof x === 'string').slice(0, MAX_TAGS) : [], audience: typeof data.audience === 'string' ? data.audience : '전체 이용가', playMode: data.playMode === 'multi' ? 'multi' : 'single', minPlayers: Math.max(2, Math.min(6, Number(data.minPlayers) || 2)), maxPlayers: Math.max(2, Math.min(6, Number(data.maxPlayers) || 4)) };
      setGames(old => [...old, imported]); setSelected(imported.id); setTab('prompt'); setView('edit'); setNotice('게임을 가져왔습니다.');
    } catch { alert('올바른 게임 JSON 파일이 아닙니다.'); }
    if (fileRef.current) fileRef.current.value = '';
  }
  async function imageToData(file: File, maxWidth = 1200): Promise<string> {
    if (!file.type.startsWith('image/') || file.size > 12_000_000) throw new Error('12MB 이하 이미지 파일만 사용할 수 있습니다.');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.')); img.src = url; });
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이미지 변환에 실패했습니다.');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', .73);
    } finally { URL.revokeObjectURL(url); }
  }
  // Preserve animated GIF bytes: drawing onto a canvas would flatten animation to frame one.
  async function imageToDataPreservingGif(file: File, maxWidth: number): Promise<string> {
    const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
    if (!isGif) return imageToData(file, maxWidth);
    if (file.size > 12_000_000) throw new Error('GIF 파일은 최대 12MB까지 업로드할 수 있습니다.');
    const header = new Uint8Array(await file.slice(0, 6).arrayBuffer());
    const signature = String.fromCharCode(...header);
    if (signature !== 'GIF87a' && signature !== 'GIF89a') throw new Error('올바른 GIF 파일이 아닙니다.');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('GIF를 읽지 못했습니다.'));
      reader.onerror = () => reject(new Error('GIF를 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
  }
  async function uploadPlayerPortrait(file?: File) { if (!file) return; if (file.size > 12 * 1024 * 1024) { alert('플레이어 캐릭터 이미지는 최대 12MB까지 업로드할 수 있습니다.'); return; } try { update({ playerPortrait: await imageToDataPreservingGif(file, 900) }); } catch (e) { alert(String(e)); } }
  async function uploadPinBackground(mapId: string, pinId: string, file?: File) { if (!file) return; if (file.size > 12 * 1024 * 1024) { alert('배경 이미지는 최대 12MB까지 업로드할 수 있습니다.'); return; } try { const image = await imageToDataPreservingGif(file, 1280); const map = (game.maps || []).find(x => x.id === mapId); if (map) changeMap(mapId, { pins: map.pins.map(p => p.id === pinId ? { ...p, background: image } : p) }); } catch (e) { alert(String(e)); } }
  async function uploadCover(file?: File) { if (!file) return; if (file.size > 12 * 1024 * 1024) { alert('게임 표지 이미지는 최대 12MB까지 업로드할 수 있습니다.'); return; } try { update({ cover: await imageToDataPreservingGif(file, 720) }); } catch (e) { alert(String(e)); } }
  async function uploadMaps(files: FileList | null) {
    if (!files?.length) return;
    try {
      const added: BoardMap[] = [];
      for (const file of Array.from(files).slice(0, 1)) added.push({ id: makeId(), name: file.name.replace(/\.[^.]+$/, ''), image: await imageToData(file, 1400), pins: [], links: [] });
      update({ maps: [...(game.maps || []), ...added].slice(0, 30), mapImage: '' });
      setEditingMapId(added[0]?.id || null); setSelectedPinId(null);  setNotice(`${added.length}개 맵을 추가했습니다.`);
    } catch (e) { alert(String(e)); }
  }
  async function uploadPlayerMarker(file?:File) {
    if (!file) return;
    if (!['image/png','image/webp','image/gif'].includes(file.type)) {alert('PNG, WebP 또는 GIF 파일을 사용해 주세요.');return;}
    try {update({playerMarker:await imageToDataPreservingGif(file,256)});} catch(error) {alert(String(error));}
  }
  async function relabelMap(id: string, pins: MapPin[]) {
    // Labels are rendered as live map-marker overlays, not painted onto the image.
    // Recover the clean source for maps created by older versions.
    update({maps:(game.maps || []).map(m=>m.id===id ? {...m,image:m.baseImage || m.image,baseImage:undefined,pins} : m)});
  }
  function changeMap(id: string, patch: Partial<BoardMap>) {
    update({ maps: (game.maps || []).map(m => m.id === id ? { ...m, ...patch } : m) });
  }
  function removeMap(id: string) { if (!confirm('이 맵과 위치 핀을 삭제할까요?')) return; update({ maps: (game.maps || []).filter(m => m.id !== id) }); setEditingMapId(null); setSelectedPinId(null); }
  function handlePinClick(m: BoardMap, pin: MapPin) {
    setSelectedPinId(pin.id);
    setPinMode('select');
  }
  // Capture pointer on the stable canvas, not on a marker that re-renders as it moves.
  function pinDragStart(e: React.PointerEvent<HTMLButtonElement>, m: BoardMap, p: MapPin) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    draggingPin.current = {mapId:m.id,pinId:p.id,startX:e.clientX,startY:e.clientY,moved:false};
    e.currentTarget.parentElement?.setPointerCapture(e.pointerId);
    setSelectedPinId(p.id);
  }
  function canvasPinMove(e: React.PointerEvent<HTMLDivElement>, m: BoardMap) {
    const drag = draggingPin.current;
    if (!drag || drag.mapId !== m.id) return;
    if (!drag.moved && Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY) < 4) return;
    drag.moved = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0,Math.min(100,(e.clientX-rect.left)/rect.width*100));
    const y = Math.max(0,Math.min(100,(e.clientY-rect.top)/rect.height*100));
    changeMap(m.id,{pins:m.pins.map(pin=>pin.id===drag.pinId?{...pin,x,y}:pin)});
  }
  function canvasPinEnd(e: React.PointerEvent<HTMLDivElement>, m: BoardMap) {
    const drag = draggingPin.current;
    if (!drag || drag.mapId!==m.id) return;
    draggingPin.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!drag.moved) return;
    const rect=e.currentTarget.getBoundingClientRect();
    const x=Math.max(0,Math.min(100,(e.clientX-rect.left)/rect.width*100));
    const y=Math.max(0,Math.min(100,(e.clientY-rect.top)/rect.height*100));
    changeMap(m.id,{pins:m.pins.map(pin=>pin.id===drag.pinId?{...pin,x,y}:pin)});
    setNotice('장소 마커와 지도 이름표의 위치를 변경했습니다. 저장 버튼을 눌러 저장하세요.');
  }
  function mapClick(e: React.MouseEvent<HTMLDivElement>, m: BoardMap) {
    if (pinMode === 'select') return;
    if (pinMode === 'relocate') {
      const selected = m.pins.find(p => p.id === selectedPinId);
      if (!selected) { setNotice('먼저 위치를 수정할 장소를 선택하세요.'); return; }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
      const y = Math.max(0, Math.min(100, (e.clientY - rect.top) / rect.height * 100));
      const pins = m.pins.map(p => p.id === selected.id ? {...p,x,y} : p);
      changeMap(m.id,{pins});
      setPinMode('select');

      setNotice(`${selected.name} 위치를 옮겼습니다. 이름표도 새 위치로 갱신됩니다.`);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(100, (e.clientY - rect.top) / rect.height * 100));
    const id = makeId(); const name = pinMode === 'start' ? '새 장소' : pinMode === 'exit' ? '다른 맵으로 이동' : pinMode === 'building' ? '새 건물' : '새 장소';
    changeMap(m.id, { pins: [...m.pins, { id, x, y, kind: pinMode === 'start' ? 'place' : pinMode, name }] }); if(!game.startPinId && !m.pins.length) update({startMapId:m.id,startPinId:id}); setSelectedPinId(id); setPinMode('select');
  }
  function addAsset(kind: Asset['kind']) { const a: Asset = { id: makeId(), name: kind === 'character' ? '새 캐릭터' : '새 몬스터', kind, description: '', image: '', x: 50, y: 50 }; update({ assets: [...(game.assets || []), a] }); }
  function changeAsset(id: string, patch: Partial<Asset>) { update({ assets: (game.assets || []).map(a => a.id === id ? { ...a, ...patch } : a) }); }
  async function uploadAsset(id: string, file?: File) { if (!file) return; try { changeAsset(id, { image: await imageToData(file, 480) }); } catch (e) { alert(String(e)); } }
  function placeAsset(id: string, x: number, y: number) { changeAsset(id, { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }); }
  function removeImageRow(id: string) {
    if (!confirm('분류와 해당 이미지들을 삭제할까요?')) return;
    update({ imageRows: (game.imageRows || []).filter(r => r.id !== id), imageCells: (game.imageCells || []).filter(c => c.rowId !== id) });
  }
  function removeImageColumn(id: string) {
    if (!confirm('상황과 해당 이미지들을 삭제할까요?')) return;
    update({ imageColumns: (game.imageColumns || []).filter(c => c.id !== id), imageCells: (game.imageCells || []).filter(c => c.columnId !== id) });
  }
  function setImageCell(rowId: string, columnId: string, image: string) {
    const cells = (game.imageCells || []).filter(c => !(c.rowId === rowId && c.columnId === columnId));
    update({ imageCells: image ? [...cells, { rowId, columnId, image }] : cells });
  }
  async function uploadImageCell(rowId: string, columnId: string, file?: File) {
    if (!file) return;
    try { setImageCell(rowId, columnId, await imageToData(file, 640)); }
    catch (e) { alert(String(e)); }
  }
  async function uploadNamedImages(files: FileList | null) {
    if (!files?.length) return;
    const rows = [...(game.imageRows || [])];
    const columns = [...(game.imageColumns || [])];
    const cells = [...(game.imageCells || [])];
    let added = 0; const invalid: string[] = [];
    for (const file of Array.from(files)) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { invalid.push(file.name); continue; }
      const basename = file.name.replace(/\.[^.]+$/, '');
      const separator = basename.lastIndexOf('_');
      if (separator < 1 || separator === basename.length - 1) { invalid.push(file.name); continue; }
      const category = basename.slice(0, separator).trim();
      const situation = basename.slice(separator + 1).trim();
      if (!category || !situation) { invalid.push(file.name); continue; }
      let row = rows.find(r => r.name === category);
      if (!row) { row = { id: makeId(), name: category }; rows.push(row); }
      let col = columns.find(c => c.name === situation);
      if (!col) { col = { id: makeId(), name: situation }; columns.push(col); }
      try {
        const image = await imageToData(file, 640);
        const index = cells.findIndex(c => c.rowId === row!.id && c.columnId === col!.id);
        const cell = { rowId: row.id, columnId: col.id, image };
        if (index >= 0) cells[index] = cell; else cells.push(cell);
        added++;
      } catch { invalid.push(file.name); }
    }
    if (added) update({ imageRows: rows, imageColumns: columns, imageCells: cells });
    setNotice(`${added}장 등록 완료${invalid.length ? ` · ${invalid.length}장 제외 (분류_상황 파일명 확인)` : ''}`);
  }
  function changeNpc(id:string,patch:Partial<NpcPortrait>){update({npcPortraits:(game.npcPortraits||[]).map(n=>n.id===id?{...n,...patch}:n)});}
  async function uploadNpc(id:string,file?:File){if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('PNG, JPG, WebP만 가능합니다.');changeNpc(id,{image:await imageToData(file,1024)});setNpcError('');}catch(e){setNpcError(String(e));}}
  // Finishing the prompt does what the map and NPC tabs used to: the genre overview map, a start spot, and NPC portraits.
  function completePrompt(){
    const genre=defaultMapGenre(game);
    const maps=(game.maps||[]).length?undefined:presetMaps(genre);
    update({promptDone:true,mapDone:true,assetsDone:true,...(maps?{maps,startMapId:maps[0].id,startPinId:(genre==='wuxia'?maps[0].pins.find(p=>p.name==='낙양'):maps[0].pins[0])?.id}:{})});
    setTab('settings');
    void extractNpcs();
  }
  async function extractNpcs(){setNpcBusy('extract');setNpcError('');try{const r=await fetch('/api/npc/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:game.prompt,world:game.wizardWorld||game.world})});const d=await r.json();if(!r.ok)throw Error(d.error||'NPC 추출 실패');const existing=game.npcPortraits||[];const npcs:NpcPortrait[]=d.npcs.map((n:{name:string;description:string;appearance:string;gender?:"male"|"female"|"unknown";age?:string;faction?:string;visualIdentity?:string})=>{const old=existing.find(x=>x.name===n.name);const defaultPortrait=defaultNpcImage(game,n.name);return old?{...old,image:old.image||defaultPortrait,description:n.description,appearance:old.appearance||n.appearance,gender:old.gender&&old.gender!=="unknown"?old.gender:n.gender||"unknown",age:old.age||n.age||"",faction:old.faction||n.faction||"",visualIdentity:old.visualIdentity||n.visualIdentity||""}:{id:makeId(),name:n.name,image:defaultPortrait,description:n.description,appearance:n.appearance,gender:n.gender||"unknown",age:n.age||"",faction:n.faction||"",visualIdentity:n.visualIdentity||""};});update({npcPortraits:[...npcs,...existing.filter(x=>!npcs.some(n=>n.name===x.name))]});setNotice(`NPC ${npcs.length}명과 기본 이미지를 자동으로 연결했습니다.`);}catch(e){const message=e instanceof Error?e.message:String(e);setNpcError(message);setNotice(`NPC 이미지 자동 연결 실패: ${message}`);}finally{setNpcBusy('');}}
  async function generateNpc(id:string){const npc=(game.npcPortraits||[]).find(n=>n.id===id);if(!npc)return;if(!npc.gender||npc.gender==="unknown"){setNpcError(`${npc.name}의 성별을 먼저 남성 또는 여성으로 지정해 주세요.`);return;}setNpcBusy(id);setNpcError('');try{const reference=(game.npcPortraits||[]).find(n=>n.image&&n.id!==id)?.image;const r=await fetch('/api/npc/image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:npc.name,description:npc.description,appearance:npc.appearance,gender:npc.gender||"unknown",age:npc.age||"",faction:npc.faction||"",visualIdentity:npc.visualIdentity||"",world:game.wizardWorld||game.world,style:game.npcStyle||'',reference})});const d=await r.json();if(!r.ok)throw Error(d.error||'이미지 생성 실패');changeNpc(id,{image:d.image});setNotice(`${npc.name} 이미지 생성 완료`);}catch(e){setNpcError(e instanceof Error?e.message:String(e));}finally{setNpcBusy('');}}
  const currentTab = tabs.findIndex(t => t.id === tab);

  return <div className="appShell">
    <header className="topbar">
      <button className="logo" onClick={() => setView('library')}><span className="logoMark"><Dices size={22} /></span> CRPG <strong>STUDIO</strong></button>
      <nav className="mainNav"><button className={view === 'library' ? 'navActive' : ''} onClick={() => setView('library')}><FolderOpen size={17} /> 내 게임</button><button className={view === 'edit' ? 'navActive' : ''} onClick={() => setView('edit')}><BookOpen size={17} /> 제작 스튜디오</button><button className={view === 'play' ? 'navActive' : ''} onClick={() => start(game)}><Play size={17} /> 테스트 플레이</button></nav>
      {view === 'play' && <div className="playHeading"><div><button className="textBack" onClick={() => { setView('edit'); setTab('prompt'); }}><ArrowLeft size={16} /> 스튜디오로 돌아가기</button><h1>{game.name}</h1></div><button className="btn" onClick={newGame} disabled={busy}><RotateCcw size={16} /> 새로하기</button></div>}
      <div className="topRight"><span className="localTag"><span className="onlineDot" /> LOCAL</span><button className="btn primary" onClick={create}><Plus size={16} /> 새 게임</button></div>
    </header>

    {view === 'library' && <main className="libraryPage"><div className="pageHeading"><div><div className="eyebrow">YOUR GAME LIBRARY</div><h1>내가 만든 CRPG</h1><p>프롬프트로 나만의 CRPG를 만들고 보드에서 플레이하세요.</p></div><button className="btn primary" onClick={create}><Plus size={17} /> 새 게임 제작</button></div><div className="libraryToolbar"><h2>내 게임 <span>{games.length}</span></h2><button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> JSON 가져오기</button><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={e => importGame(e.target.files?.[0])} /></div><div className="gameGrid">{games.map(g => <article className="gameCard" key={g.id}><div className="gameCover">{g.cover ? <img src={g.cover} alt={`${g.name} 표지`} /> : <div className="coverFallback"><Dices size={52} /><span>YOUR ADVENTURE AWAITS</span></div>}<span className="coverChip">CRPG · {g.playMode === 'multi' ? `${g.minPlayers || 2}~${g.maxPlayers || 4}인` : '싱글'}</span></div><div className="gameInfo"><h3>{g.name}</h3><p>{g.description || '게임 소개가 없습니다.'}</p><div className="gameActions"><button className="btn primary" onClick={() => start(g)}><Play size={15} /> 플레이</button><button className="btn" onClick={() => { setSelected(g.id); setTab('prompt'); setView('edit'); }}><Settings2 size={15} /> 편집</button><button className="iconButton" title="JSON 다운로드" onClick={() => exportGame(g)}><Download size={17} /></button><button className="iconButton dangerIcon" title="삭제" onClick={() => remove(g)}><Trash2 size={17} /></button></div></div></article>)}<button className="createCard" onClick={create}><span className="createIcon"><Plus size={28} /></span><strong>새 게임 만들기</strong><small>나만의 세계를 만들어 보세요</small></button></div></main>}

    {view === 'edit' && <main className="studioPage"><div className="studioHeading"><button className="backButton" onClick={() => setView('library')}><ArrowLeft size={18} /></button><div><h1>게임 제작</h1><p>변경사항은 저장 버튼을 눌러야 보관됩니다.</p></div><div className="studioActions"><span className="saved">{hasUnsavedChanges ? "저장되지 않은 변경사항" : saveStatus === "saved" ? "저장 완료" : "변경사항 없음"}</span><button className="btn primary" type="button" onClick={()=>void saveGames()} disabled={!ready || saving || !hasUnsavedChanges}><Check size={16} /> {saving ? "저장 중..." : "저장"}</button><button className="btn" onClick={() => exportGame(game)}><Download size={16} /> JSON 백업</button><button className="btn dark" onClick={() => start(game)}><Play size={16} /> 테스트 플레이</button></div></div><div className="studioTabs">{tabs.filter(t => t.id === 'prompt' || ((t.id === 'settings' || t.id === 'map') && game.promptDone) || (t.id === 'register' && game.settingsDone)).map(t => <button key={t.id} className={tab === t.id ? 'tabActive' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</div><div className="studioColumns"><section className="editPanel"><div className="sectionHeading"><h2>{tabs[currentTab].label}</h2><p>{tab === 'prompt' ? '게임 유형부터 선택해 프롬프트를 완성하세요. 맵과 NPC 이미지는 자동으로 준비됩니다.' : tab === 'map' ? '맵에 장소·건물을 배치하고 각 위치의 이벤트를 설정하세요.' : tab === 'assets' ? '프롬프트의 NPC를 불러와 통일된 화풍으로 이미지를 만들거나 직접 업로드하세요.' : tab === 'settings' ? '게임 프로필과 게임 화면·캐릭터 정보를 구성하세요.' : '보드게임 유형, 플레이 방식, 예상 시간과 해시태그를 설정하세요.'}</p></div>{tab === 'prompt' && <div className="fields"><PromptBuilder game={game} update={update} busy={draftBusy} setBusy={setDraftBusy} error={draftError} setError={setDraftError} onMap={completePrompt}/><div className="tip">프롬프트는 AI GM에게 전달됩니다. 위치 이동은 맵 핀으로 처리하고 D20은 별도 코드로 처리되며, 프롬프트에 적은 모든 규칙이 자동 구현되는 것은 아닙니다.</div></div>}
{tab === 'assets' && <div className="fields npcEditor"><h3>NPC 관리</h3><p className="assetHelp">NPC 정보를 불러오고 기존 이미지를 관리하거나 직접 업로드할 수 있습니다.</p><p className="assetHelp">기존 NPC 이미지와 직접 업로드한 이미지는 게임 본문 및 관계도에서 계속 사용됩니다.</p><button type="button" className="btn primary" disabled={!!npcBusy||!game.prompt?.trim()} onClick={()=>void extractNpcs()}><Sparkles size={16}/>{npcBusy==='extract'?'NPC 분석 중...':'프롬프트에서 NPC 불러오기'}</button><div className="npcPortraitGrid">{(game.npcPortraits||[]).map(n=><div key={n.id} className="npcPortraitCard"><div className="npcPortraitThumb">{n.image?<img src={n.image} alt={n.name}/>:<ImageIcon size={40}/>}</div><div className="npcPortraitInfo"><strong>{n.name}</strong><small>{n.description}</small><label className="field">성별 <select value={n.gender||"unknown"} onChange={e=>changeNpc(n.id,{gender:e.target.value as "male"|"female"|"unknown"})}><option value="unknown">미설정 · 생성 전 확인</option><option value="male">남성</option><option value="female">여성</option></select></label><label className="field">나이 <input value={n.age||""} onChange={e=>changeNpc(n.id,{age:e.target.value})} placeholder="예: 22세"/></label><label className="field">소속/직책 <input value={n.faction||""} onChange={e=>changeNpc(n.id,{faction:e.target.value})} placeholder="예: 화산파 제자"/></label><label className="field">외형 고정 특징 <textarea rows={2} value={n.visualIdentity||""} onChange={e=>changeNpc(n.id,{visualIdentity:e.target.value})} placeholder="머리색, 눈색, 고유 장식, 무기 등 유지할 특징"/></label><label className="field">외형 설명<textarea rows={3} value={n.appearance} onChange={e=>changeNpc(n.id,{appearance:e.target.value})}/></label><div className="npcPortraitActions"><label className="btn npcUpload"><Upload size={15}/> 직접 업로드<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void uploadNpc(n.id,e.target.files?.[0]);e.target.value='';}}/></label></div></div></div>)}</div>{!(game.npcPortraits||[]).length&&<p className="assetHelp">NPC가 없습니다. 위의 '프롬프트에서 NPC 불러오기'를 눌러 주세요.</p>}{npcError&&<p className="mapGenerationError" role="alert">{npcError}</p>}<div className="mapCompletion"><p>NPC 이미지가 준비되면 게임 본문과 관계도에서 같은 이미지를 사용합니다. 관계도에는 실제로 만난 NPC만 표시됩니다.</p><button type="button" className="btn primary" onClick={()=>{update({assetsDone:true});setTab('settings');}}>NPC 이미지 완료 · 게임 설정으로 이동 <ChevronRight size={16}/></button></div></div>}
{tab === 'map' && <div className="fields mapEditor">
  {(() => { const maps = game.maps || []; const hasMap = maps.length > 0; const startMap = maps.find(m => m.id === game.startMapId); const startPin = startMap?.pins.find(p => p.id === game.startPinId && p.kind !== 'exit'); const hasStart = !!startPin; const totalPlaces = maps.reduce((n,m)=>n+m.pins.filter(p=>p.kind !== 'exit').length,0); const hasPlaces = totalPlaces > 0; const mapReady = hasMap && hasPlaces && hasStart; return <div className="mapWorkflowStatus" aria-label="맵 제작 진행 상태"><h3>맵 제작 진행 현황</h3><p className="assetHelp">필수 작업을 완료하면 페이지 맨 아래에 다음 단계 버튼이 표시됩니다.</p><div className="mapWorkflowProgress"><span style={{width:`${(Number(hasMap)+Number(hasPlaces&&hasStart))/2*100}%`}}/></div><div className="mapWorkflowItem"><strong>{hasMap?'✓':'○'} 1. 맵 이미지 준비</strong><span>{hasMap?'완료':'작업 필요'} · 기본 제공 또는 이미지 업로드</span></div><div className="mapWorkflowItem"><strong>{hasPlaces&&hasStart?'✓':'○'} 2. 장소 및 시작 위치 지정</strong><span>{hasPlaces&&hasStart?'완료':!hasPlaces?'장소를 1개 이상 추가하세요':'시작 장소를 지정하세요'}</span></div></div>; })()}
  <section className="mapStepSection mapStepImage"><div className="mapStepHeader"><span className="mapStepNumber">01</span><div><h3>1단계 · 맵 이미지 준비 및 선택</h3><p>장르 전체 지도 1장이 기본으로 제공됩니다. 그대로 쓰거나 직접 이미지를 업로드하세요.</p></div><span className="mapStepState">{(game.maps||[]).length>0?"✓ 맵 준비 완료":"맵 필요"}</span></div>

<div className="mapMarkerPanel"><div><strong>플레이어 위치 마커</strong><p className="assetHelp">권장: 투명 배경 PNG 또는 애니메이션 GIF, 256×256px. 맵에서 현재 위치에 표시됩니다. 캐릭터 초상화와 별도로 관리합니다.</p></div><label className="mapUpload"><Upload size={16}/> 마커 이미지 등록<input type="file" accept="image/png,image/webp,image/gif,.gif" onChange={e => {void uploadPlayerMarker(e.target.files?.[0]);e.target.value='';}}/></label><img className="mapMarkerSample" src={playerMarkerSrc(game)} alt="플레이어 마커 미리보기"/><button type="button" className="btn" onClick={()=>update({playerMarker:''})} disabled={!game.playerMarker}>기본 마커로 복원</button></div>
  <label className="mapUpload"><Upload size={20}/> 맵 이미지 업로드<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void uploadMaps(e.target.files); e.target.value = ''; }} /></label>
  <div className="mapSelectionArea"><div className="mapSelectionHeading"><strong>작업할 맵 선택</strong><span>{(game.maps||[]).length}개 등록됨 · 카드를 클릭해 편집 맵을 바꾸세요</span></div><div className="mapSelectionGrid">{(game.maps||[]).map(m=>{const selected=((game.maps||[]).some(x=>x.id===editingMapId)?editingMapId:game.maps?.[0]?.id)===m.id;return <button type="button" key={m.id} className={`mapSelectionCard ${selected?'mapSelectionActive':''}`} aria-pressed={selected} onClick={()=>{setEditingMapId(m.id);setSelectedPinId(null);}}><span className="mapSelectionThumb"><img src={m.image} alt="" loading="lazy"/></span><span className="mapSelectionInfo"><strong>{m.name}</strong><small>{m.pins.filter(p=>p.kind!=='exit').length}개 장소 {game.startMapId===m.id?'· 시작 맵':''}</small></span><span className="mapSelectionCheck">{selected?'✓ 선택됨':'선택'}</span></button>})}{!(game.maps||[]).length&&<div className="mapSelectionEmpty">등록된 맵이 없습니다. 기본 맵을 추가하거나 이미지를 업로드하세요.</div>}</div></div></section><section className="mapStepSection mapStepLocations"><div className="mapStepHeader"><span className="mapStepNumber">02</span><div><h3>2단계 · 장소 및 이벤트 설정</h3><p>선택한 맵의 장소를 분석하거나 직접 추가하고, 시작 장소와 이벤트를 설정하세요.</p></div><span className="mapStepState">{(game.maps||[]).some(x=>x.id===game.startMapId&&x.pins.some(p=>p.id===game.startPinId&&p.kind!=='exit'))?'✓ 시작 위치 완료':'장소 설정 필요'}</span></div>
  {(() => { const m = (game.maps || []).find(x => x.id === editingMapId) || (game.maps || [])[0]; if (!m) return <div className="mapStepEmpty">먼저 1단계에서 기본 맵을 불러오거나 이미지를 업로드해 주세요. 맵을 선택하면 장소·이벤트 편집 도구가 표시됩니다.</div>;
    const pin = m.pins.find(p => p.id === selectedPinId);
    return <>
      <div className="startPlaceSummary"><span className="startPlaceSummaryIcon">★</span><div><strong>게임 시작 위치</strong><span>{(game.maps||[]).find(x=>x.id===game.startMapId)?.pins.find(p=>p.id===game.startPinId)?.name || '아직 지정되지 않았습니다'}</span></div></div><div className="worldStartRow"><button type="button" className={`btn ${game.startMapId === m.id ? "primary" : ""}`} onClick={() => update({startMapId:m.id,startPinId:(m.pins.find(p=>p.id===game.startPinId)||m.pins[0])?.id})}>{game.startMapId === m.id ? "✓ 게임 시작 맵" : "이 맵을 게임 시작 맵으로"}</button><span className="assetHelp">순서와 무관하게 시작할 맵만 지정합니다.</span></div><label className="field">맵 이름<input value={m.name} onChange={e => changeMap(m.id, { name: e.target.value })}/></label>
      {(() => { const missing = missingDefaultPins(m); return missing.length ? <div className="mapMissingPins"><span>기본 장소 중 <strong>{missing.map(p => p.name).join(', ')}</strong>이(가) 이 맵에 없습니다. 없으면 그곳으로 이동할 수 없습니다.</span><button type="button" className="btn primary" onClick={() => changeMap(m.id, { pins: [...m.pins, ...missing.map(p => ({ ...p, id: makeId() }))] })}><Plus size={14}/> 빠진 장소 {missing.length}곳 다시 넣기</button></div> : null; })()}
      <div className="mapPinToolbar"><span>맵 클릭 시</span>{([['select','선택'],['relocate','선택 장소 위치 수정'],['place','장소'],['building','건물'],['exit','포탈·출입구']] as const).map(([v,label]) => <button key={v} type="button" className={`btn ${pinMode === v ? 'primary' : ''}`} onClick={() => { setPinMode(v); }}>{label}</button>)}</div>
      <p className="assetHelp">{'장소 마크를 마우스로 잡아 실제 건물 위로 끌어 놓으세요. 장소 간 이동은 지도 좌표를 기준으로 자동 판단합니다.'}</p><div className="pinCanvas" onClick={e => {if (draggingPin.current?.moved) return; mapClick(e,m);}} onPointerMove={e=>canvasPinMove(e,m)} onPointerUp={e=>canvasPinEnd(e,m)} onPointerCancel={e=>{draggingPin.current=null; if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);}}><img src={m.image} alt={m.name} draggable={false}/>{m.pins.map((p,i) => <button key={p.id} type="button" className={`pinMarker ${p.kind} ${selectedPinId === p.id ? 'pinSelected' : ''} ${game.startMapId===m.id && game.startPinId===p.id ? 'pinGameStart' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} title={`${game.startMapId===m.id && game.startPinId===p.id ? '★ 게임 시작 위치 · ' : ''}${i+1}. ${p.name} — 드래그하여 위치 변경`} onPointerDown={e=>pinDragStart(e,m,p)} onClick={e => { e.stopPropagation(); handlePinClick(m,p); }}>{game.startMapId===m.id && game.startPinId===p.id ? '★' : i+1}</button>)}{m.pins.map(p=><span key={`label-${p.id}`} className={`mapPlaceLabel ${game.startMapId===m.id && game.startPinId===p.id ? 'mapStartPlaceLabel' : ''}`} style={{left:`${p.x}%`,top:`${p.y}%`}}>{game.startMapId===m.id && game.startPinId===p.id ? `★ 시작 위치 · ${p.name}` : p.name}</span>)}</div>
      <p className="assetHelp">장소·건물·포탈을 선택하고 맵을 클릭하세요. 처음 추가한 장소가 기본 시작 위치이며 장소를 선택해 변경할 수 있습니다. 장소나 건물을 선택하면 이벤트 내용을 입력할 수 있습니다.</p>
      <p className="assetHelp">장소 간 연결은 자동 처리됩니다. 가까운 곳은 바로 이동하고 먼 곳은 여러 장면을 거쳐 이동합니다. 포탈·출입구는 기존 설정을 사용합니다.</p>
      {pin && <div className="pinDetails"><h3>선택한 위치</h3><label className="field">위치 이름<input value={pin.name} onChange={e => changeMap(m.id, { pins: m.pins.map(p => p.id === pin.id ? { ...p, name: e.target.value } : p) })} onBlur={()=>{}}/></label>
      <label className="field">위치 설명<textarea rows={2} value={pin.description || ''} placeholder="AI GM이 참고할 장소·건물 설명" onChange={e => changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,description:e.target.value}:p)})}/></label>
      {pin.kind !== 'exit' && <div className="field">장소 배경 이미지 <small>플레이 화면 가운데에 표시됩니다 · 없으면 장르 기본 이미지</small>{pin.background && <img className="pinBackgroundPreview" src={pin.background} alt={`${pin.name} 배경`}/>}<div className="uploadBox"><ImageIcon size={20} /><span>{pin.background ? '배경 이미지 바꾸기' : '배경 이미지 선택'}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.gif" onChange={e => { void uploadPinBackground(m.id, pin.id, e.target.files?.[0]); e.target.value = ''; }} /></div>{pin.background && <button type="button" className="btn pinBackgroundRemove" onClick={() => changeMap(m.id, { pins: m.pins.map(p => p.id === pin.id ? { ...p, background: undefined } : p) })}><Trash2 size={15}/> 배경 지우기</button>}</div>}
      {pin.kind !== 'exit' && <button className={`btn ${game.startMapId===m.id && game.startPinId===pin.id?'primary':''}`} type="button" onClick={()=>update({startMapId:m.id,startPinId:pin.id})}>{game.startMapId===m.id && game.startPinId===pin.id ? '★ 현재 게임 시작 위치' : '이 장소를 게임 시작 위치로 지정'}</button>}
      {(pin.kind === 'place' || pin.kind === 'building') && <><label className="field">이 장소·건물에서 발생하는 이벤트<textarea rows={3} value={pin.eventText || ''} placeholder="예: 대장간에 들어오면 대장장이가 무기 거래를 제안한다." onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,eventText:e.target.value}:p)})}/></label><label className="field">이벤트 발동<select value={pin.eventTrigger || 'enter'} onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,eventTrigger:e.target.value as 'enter'|'interact'}:p)})}><option value="enter">도착할 때</option><option value="interact">상호작용할 때</option></select></label><label className="worldCheck"><input type="checkbox" checked={!!pin.eventOnce} onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,eventOnce:e.target.checked}:p)})}/>이벤트 한 번만 발생</label></>}
      {pin.kind === 'exit' && <><label className="field">연결할 맵<select value={pin.targetMapId || ''} onChange={e => changeMap(m.id, { pins: m.pins.map(p => p.id === pin.id ? { ...p, targetMapId: e.target.value, targetPinId: '' } : p) })}><option value="">연결하지 않음</option>{(game.maps || []).filter(x => x.id !== m.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{pin.targetMapId && <label className="field">도착 위치<select value={pin.targetPinId || ''} onChange={e => changeMap(m.id, { pins: m.pins.map(p => p.id === pin.id ? { ...p, targetPinId: e.target.value } : p) })}><option value="">해당 맵의 첫 번째 장소</option>{(game.maps || []).find(x => x.id === pin.targetMapId)?.pins.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}</>}
      {pin.kind === 'exit' && <><label className="worldCheck"><input type="checkbox" checked={pin.bidirectional !== false} onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,bidirectional:e.target.checked}:p)})}/>양방향 이동 허용 (역방향 출입구는 별도로 연결 필요)</label><label className="field">필요 아이템 (선택)<input value={pin.requiredItem || ''} placeholder="예: 고대 열쇠" onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,requiredItem:e.target.value}:p)})}/></label><label className="field">필요 퀘스트 플래그 (선택)<input value={pin.requiredFlag || ''} placeholder="예: 성문 개방" onChange={e=>changeMap(m.id,{pins:m.pins.map(p=>p.id===pin.id?{...p,requiredFlag:e.target.value}:p)})}/></label></>}
      <button className="btn" type="button" onClick={() => { changeMap(m.id, { pins: m.pins.filter(p => p.id !== pin.id), links: (m.links || []).filter(l => l.from !== pin.id && l.to !== pin.id) }); setSelectedPinId(null);  }}><Trash2 size={15}/> 위치 삭제</button></div>}
      <div className="mapEditorFooter"><span>위치 {m.pins.length}개 · 출구 {m.pins.filter(p => p.kind === 'exit').length}개</span><button className="btn" type="button" onClick={() => removeMap(m.id)}><Trash2 size={15}/> 이 맵 삭제</button></div>
    </>; })()}
  </section>
  {(() => { const maps = game.maps || []; const start = maps.find(m=>m.id===game.startMapId)?.pins.find(p=>p.id===game.startPinId && p.kind !== 'exit'); return maps.length > 0 && !!start ? <div className="mapCompletion"><p>✓ 맵과 시작 장소가 준비되었습니다. 선택 사항인 장소 이벤트를 확인한 뒤 다음 단계로 이동하세요.</p><button type="button" className="btn primary" onClick={()=>{const latestMaps=game.maps||[];if(!latestMaps.length || !latestMaps.find(m=>m.id===game.startMapId)?.pins.some(p=>p.id===game.startPinId&&p.kind!=='exit'))return;update({mapDone:true});setTab('assets');}}>맵 관리 완료 · NPC 이미지로 이동 <ChevronRight size={16}/></button></div> : null; })()}
  <div className="tip">맵 이미지는 플레이 화면의 미니맵으로 쓰입니다. 미니맵은 장소를 확인하는 용도이고, 플레이어는 행동 선택지나 직접 입력으로 장소 이름을 말해 이동하며, 장소마다 올린 배경 이미지가 화면 가운데에 표시됩니다. 싱글플레이에서는 장소 도착 이벤트·상호작용·1회 제한·포탈 조건이 적용되며 AI GM에게 자동 전달됩니다.</div>
</div>}
{tab === 'settings' && <div className="fields">
  <div className="modeSection"><h3>게임 프로필</h3><p className="assetHelp">라이브러리와 등록 화면에 보이는 게임의 첫인상입니다.</p><label className="field">게임 표지 이미지 <small>권장 비율 2:3, PNG·JPG·WebP·움직이는 GIF (최대 12MB)</small><div className="uploadBox"><ImageIcon size={20} /><span>표지 이미지 선택</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.gif" onChange={e => uploadCover(e.target.files?.[0])} /></div></label><label className="field">게임 이름 <span className="required">*</span><input maxLength={60} value={game.name} onChange={e => update({ name: e.target.value })} placeholder="게임 이름을 입력하세요" /></label><label className="field">한 줄 소개 <span className="required">*</span><textarea rows={3} maxLength={200} value={game.description} onChange={e => update({ description: e.target.value })} placeholder="어떤 게임인지 소개해 주세요" /></label></div>


  <div className="modeSection"><h3>플레이 방식</h3><p className="assetHelp">게임을 만들 때 싱글 또는 멀티플레이를 지정합니다.</p>
    <div className="modeChoices">
      <button type="button" className={`modeChoice ${game.playMode !== 'multi' ? 'modeSelected' : ''}`} onClick={() => update({ playMode: 'single' })}><strong>싱글플레이</strong><small>혼자서 AI GM과 플레이</small></button>
      <button type="button" className={`modeChoice ${game.playMode === 'multi' ? 'modeSelected' : ''}`} onClick={() => update({ playMode: 'multi' })}><strong>멀티플레이</strong><small>2~6인 협동 게임 설정</small></button>
    </div>
    {game.playMode === 'multi' && <><div className="playerLimits"><label className="field">최소 인원<select value={game.minPlayers || 2} onChange={e => { const n = Number(e.target.value); update({ minPlayers: n, maxPlayers: Math.max(n, game.maxPlayers || 4) }); }}>{[2,3,4,5,6].map(n => <option key={n} value={n}>{n}명</option>)}</select></label><label className="field">최대 인원<select value={game.maxPlayers || 4} onChange={e => { const n = Number(e.target.value); update({ maxPlayers: n, minPlayers: Math.min(n, game.minPlayers || 2) }); }}>{[2,3,4,5,6].map(n => <option key={n} value={n}>{n}명</option>)}</select></label></div><div className="tip">멀티플레이 설정은 저장되지만 실제 방 생성·초대·실시간 동기화 서버는 아직 구현되지 않았습니다. 현재 테스트 플레이는 싱글 방식으로 실행됩니다.</div></>}
  </div>
  <div className="modeSection"><h3>게임 화면 HUD</h3><p className="assetHelp">플레이 화면에 표시할 정보를 선택하세요. 오른쪽에서 바로 확인할 수 있습니다.</p>
    <label className="hudToggle"><input type="checkbox" checked={game.showHpBar !== false} onChange={e => update({ showHpBar: e.target.checked })}/> 체력바 (HP) 표시</label>
    <label className="hudToggle"><input type="checkbox" checked={game.showEquipment !== false} onChange={e => update({ showEquipment: e.target.checked })}/> 인벤토리 표시</label>
    <label className="hudToggle"><input type="checkbox" checked={game.showDice !== false} onChange={e => update({ showDice: e.target.checked })}/> 필요한 판정에서만 주사위 표시</label>
  </div>
  <div className="modeSection playerPortraitEditor"><h3>플레이어 캐릭터</h3><p className="assetHelp">대화와 전투 화면, 플레이어 정보창에 나오는 주인공 이미지입니다. 배경을 지운 PNG(입상)를 권장합니다. 올리지 않으면 장르 기본 캐릭터가 나옵니다.</p>
    <div className="playerPortraitRow"><div className="playerPortraitPreview"><img src={playerPortraitSrc(game)} alt="플레이어 캐릭터 미리보기"/></div><div className="playerPortraitActions"><label className="uploadBox"><ImageIcon size={20} /><span>{game.playerPortrait ? '이미지 바꾸기' : '이미지 선택'}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.gif" onChange={e => { void uploadPlayerPortrait(e.target.files?.[0]); e.target.value = ''; }} /></label>{game.playerPortrait && <button type="button" className="btn" onClick={() => update({ playerPortrait: undefined })}><Trash2 size={15}/> 기본 캐릭터로 되돌리기</button>}</div></div>
  </div>
  <div className="modeSection characterEditor"><h3>캐릭터 · 정보창 설정</h3><p className="assetHelp">게임별로 정보창 구성과 스탯을 지정합니다. 장비와 소지품은 인벤토리에서 함께 관리합니다. 저장 후 플레이 보드 아래에 반영됩니다.</p>
    <label className="field">게임 유형 프리셋<select value={(game.characterConfig || defaultCharacterConfig()).preset} onChange={e=>update({characterConfig:applyCharacterPreset(game.characterConfig || defaultCharacterConfig(),e.target.value)})}><option value="fantasy">판타지</option><option value="wuxia">무협</option><option value="modern">현대 판타지</option><option value="custom">직접 설정</option></select></label>
    <div className="characterSectionToggles">{([['character','캐릭터 기본 정보'],['stats','능력치'],['inventory','인벤토리'],['status','상태 효과'],['relationships','관계도']] as const).map(([key,label])=><label className="hudToggle" key={key}><input type="checkbox" checked={(game.characterConfig || defaultCharacterConfig()).sections[key] !== false} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,sections:{...c.sections,[key]:e.target.checked}}});}}/>{label}</label>)}</div>
    <div className="characterEditorGrid">{([['initialName','시작 이름'],['initialJob','시작 직업'],['initialRace','시작 종족']] as const).map(([key,label])=><label className="field" key={key}>{label}<input value={(game.characterConfig || defaultCharacterConfig())[key]} onChange={e=>update({characterConfig:{...(game.characterConfig || defaultCharacterConfig()),[key]:e.target.value}})}/></label>)}<label className="field">시작 레벨<input type="number" min="1" value={(game.characterConfig || defaultCharacterConfig()).initialLevel} onChange={e=>update({characterConfig:{...(game.characterConfig || defaultCharacterConfig()),initialLevel:Math.max(1,Number(e.target.value)||1)}})}/></label><label className="field">시작 골드<input type="number" min="0" value={(game.characterConfig || defaultCharacterConfig()).initialGold} onChange={e=>update({characterConfig:{...(game.characterConfig || defaultCharacterConfig()),initialGold:Math.max(0,Number(e.target.value)||0)}})}/></label></div>
    <h4>능력치 · 스탯 항목</h4><div className="characterFieldList">{(game.characterConfig || defaultCharacterConfig()).fields.map(f=><div className="characterFieldEditor" key={f.id}><input aria-label="스탯 이름" value={f.name} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,name:e.target.value}:x)}});}}/><select aria-label="값 종류" value={f.kind} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,kind:e.target.value as InfoField['kind']}:x)}});}}><option value="number">숫자</option><option value="text">텍스트</option><option value="gauge">게이지</option></select><input aria-label="초기치" title="초기치" placeholder="초기치" value={f.initial} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,initial:e.target.value}:x)}});}}/>{(f.kind==='gauge'||f.kind==='number')&&<input aria-label="최대치" title="최대치" placeholder="최대치" type="number" min="1" value={f.max ?? ''} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.map(x=>x.id===f.id?{...x,max:e.target.value===''?undefined:Math.max(1,Number(e.target.value)||1)}:x)}});}}/>}<label className="characterFieldVisible"><input type="checkbox" checked={f.visible} onChange={e=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,fields:c.fields.map(x=>x.id===f.id?{...x,visible:e.target.checked}:x)}});}}/> 표시</label><button className="btn" type="button" title="스탯 삭제" onClick={()=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:c.fields.filter(x=>x.id!==f.id)}});}}><Trash2 size={14}/></button></div>)}</div>
    <button className="btn" type="button" onClick={()=>{const c=game.characterConfig || defaultCharacterConfig();update({characterConfig:{...c,preset:'custom',fields:[...c.fields,{id:makeId(),name:'새 스탯',kind:'number',initial:'0',visible:true}]}});}}><Plus size={15}/> 스탯 추가</button>
    <p className="assetHelp">스탯 초기값은 새 플레이에서 적용됩니다. 기존 플레이 기록의 값은 유지되며 새 항목은 기본값으로 표시됩니다.</p>
  </div>
  <div className="tip">HUD 설정은 테스트 플레이 화면에도 반영됩니다.</div><button type="button" className="btn primary" disabled={!game.name.trim()||!game.description.trim()||(game.finalGoalMode==='progress'&&(game.finalGoalSteps||[]).filter(x=>x.trim()).length<2)} onClick={()=>{update({settingsDone:true,profileDone:true});setTab('register');}}>게임 설정 완료 · 등록으로 이동 <ChevronRight size={16}/></button>
</div>}
{tab === 'register' && <div className="fields registerFields">
  <div className="tip">게임 상세 설명과 해시태그를 직접 입력하거나, 아래 버튼을 눌러 AI 초안을 생성할 수 있습니다. AI 생성은 자동으로 실행되지 않습니다.</div>
  <button type="button" className="btn" disabled={registrationBusy||!game.prompt?.trim()} onClick={()=>void generateRegistration(game)}><Sparkles size={16}/>{registrationBusy?'등록 소개 작성 중...':'AI로 등록 정보 자동 채우기'}</button>
  {registrationError&&<p role="alert" className="tip">{registrationError}</p>}
  <label className="field">게임 상세 설명 <span className="required">*</span><textarea rows={9} maxLength={2000} value={game.registrationDescription || ''} onChange={e => update({ registrationDescription: e.target.value })} placeholder="게임의 세계관, 주요 특징, 플레이 방법을 자세히 소개해 주세요." /></label>
  <div className="counter">{(game.registrationDescription || '').length.toLocaleString()} / 2,000자</div>
  <label className="field">게임 유형 <span className="required">*</span><select value={normalizeType(game)} onChange={e => update({ gameType: e.target.value, genre: e.target.value })}>{GAME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
  <label className="field">협력 방식<select value={game.cooperation || '협동'} onChange={e => update({ cooperation: e.target.value })}>{COOPERATION.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
  <label className="field">진행 방식<select value={game.progression || '턴제'} onChange={e => update({ progression: e.target.value })}>{PROGRESSION.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
  <label className="field">예상 플레이 시간<select value={game.playTime || '장기 캠페인'} onChange={e => update({ playTime: e.target.value })}>{PLAY_TIMES.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
  <div className="tip">게임 유형과 진행 방식은 검색·추천용 분류입니다. 실제 전투·턴·승리 규칙은 게임 프롬프트와 별도 게임 로직에서 구현해야 합니다.</div>
  <label className="field">이용 대상<select value={game.audience || '전체 이용가'} onChange={e => update({ audience: e.target.value })}>{['전체 이용가','청소년 이용가','성인 대상'].map(a => <option key={a} value={a}>{a}</option>)}</select></label>
  <div className="field"><strong>해시태그 <small>최대 {MAX_TAGS}개</small></strong><div className="registerTags">{(game.hashtags || []).map(tag => <button key={tag} type="button" className="registerTag" title="태그 삭제" onClick={() => update({ hashtags: (game.hashtags || []).filter(t => t !== tag) })}>#{tag} ×</button>)}</div><div className="tagEntry"><input maxLength={30} value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const tag = newTag.trim().replace(/^#+/, ''); if (tag && !(game.hashtags || []).includes(tag) && (game.hashtags || []).length < MAX_TAGS) update({ hashtags: [...(game.hashtags || []), tag] }); setNewTag(''); } }} placeholder="태그 입력 후 Enter (예: 로그라이크)"/><button type="button" className="btn" disabled={!newTag.trim() || (game.hashtags || []).length >= MAX_TAGS} onClick={() => { const tag = newTag.trim().replace(/^#+/, ''); if (tag && !(game.hashtags || []).includes(tag)) update({ hashtags: [...(game.hashtags || []), tag] }); setNewTag(''); }}><Plus size={15}/> 추가</button></div></div>
  <div className="tip">등록 정보도 상단 저장 버튼을 눌러야 보관되며 JSON 백업에도 포함됩니다. 실제 온라인 게시 기능은 아직 없습니다.</div>
</div>}
</section><aside className="previewPanel">
  <div className="previewTop"><h2>{tab === 'prompt' ? '프롬프트 미리보기' : tab === 'map' ? '맵 미리보기' : tab === 'settings' ? '게임 설정 미리보기' : '등록 정보 미리보기'}</h2><span>실시간 반영</span></div>
  {tab === 'settings' && <><div className="previewCover">{game.cover ? <img src={game.cover} alt="게임 표지" /> : <div className="previewFallback"><Dices size={65}/><span>CRPG</span></div>}</div><h3>{game.name || '게임 제목'}</h3><p>{game.description || '게임 소개를 입력해 주세요.'}</p><div className="previewTags"><span>CRPG</span><span>{game.playMode === 'multi' ? `멀티 ${game.minPlayers || 2}~${game.maxPlayers || 4}명` : '싱글'}</span></div></>}
  {tab === 'prompt' && <><div className="previewTags"><span>CRPG GM 프롬프트 · 실시간 조합</span><span>{(game.compressedPrompt || buildDraftPrompt(game.promptDrafts || {},game.customPromptSections || [],game.removedPromptSections || []) || game.prompt || '').length.toLocaleString()}자 · 최대 7,000자</span></div><div className="promptPreview">{game.compressedPrompt || buildDraftPrompt(game.promptDrafts || {},game.customPromptSections || [],game.removedPromptSections || []) || game.prompt?.trim() || '왼쪽에서 AI 초안을 선택하거나 커스텀 내용을 작성하면 이곳에 즉시 표시됩니다.'}</div><div className="tip">왼쪽에서 선택하거나 작성한 내용은 미리보기에 즉시 반영됩니다. 상단 저장 버튼을 눌러 보관하세요. 원본 규칙은 보존되며 최종 압축본을 따로 만들 수 있습니다.</div></>}
  {tab === 'assets' && <div className="npcRightHelp"><h3>NPC 이미지 연결</h3><p>프롬프트 → NPC 목록 → AI 생성 / 업로드 → 게임 본문과 관계도</p><p>NPC의 고유 ID와 이름을 유지하며, 게임에서 처음 만난 인물만 관계도에 나타납니다.</p><p>AI 생성에는 OpenAI 이미지 API 비용이 발생할 수 있습니다. 버튼을 누른 인물만 생성합니다.</p><strong>등록 {(game.npcPortraits||[]).length}명 · 이미지 {(game.npcPortraits||[]).filter(n=>n.image).length}장</strong></div>}
  {tab === 'settings' && <div className="liveGamePreview">
    <div className="livePreviewTitle"><span>▶ 실제 게임 화면 구성 미리보기</span><small>{game.playMode === 'multi' ? `멀티 ${game.minPlayers || 2}~${game.maxPlayers || 4}인` : '싱글플레이'}</small></div>
    <section className="characterConfigPreview" aria-label="캐릭터 정보창 실시간 미리보기">
      <div className="characterConfigPreviewHeading"><strong>캐릭터 정보창 · 실시간 미리보기</strong><small>능력치 · 인벤토리 · 상태 · 관계도 탭을 눌러 확인하세요</small></div>
      <CharacterPanel game={game} session={makeSession(game)} portrait={playerBaseImage}/>
      {!(game.characterConfig || defaultCharacterConfig()).sections.character && !Object.values((game.characterConfig || defaultCharacterConfig()).sections).some(Boolean) && <p className="characterConfigPreviewEmpty">모든 정보창 항목이 꺼져 있습니다. 왼쪽 설정에서 표시할 항목을 선택하세요.</p>}
      <p className="characterConfigPreviewHint">설정 변경 즉시 반영됩니다. 미리보기에는 초기값과 시작 장비가 표시되며 실제 플레이 기록은 변경되지 않습니다.</p>
    </section>
  </div>}
  {tab === 'register' && <div className="registrationPreview"><div className="registrationCover">{game.cover ? <img src={game.cover} alt="게임 표지"/> : <div className="previewFallback"><Dices size={52}/><span>CRPG</span></div>}</div><h3>{game.name || '게임 제목'}</h3><p>{game.registrationDescription || '왼쪽에서 게임 상세 설명을 입력해 주세요.'}</p><div className="previewTags"><span>{normalizeType(game)}</span><span>{game.cooperation || '협동'}</span><span>{game.progression || '턴제'}</span><span>{game.playTime || '장기 캠페인'}</span><span>{game.playMode === 'multi' ? `${game.minPlayers || 2}~${game.maxPlayers || 4}인` : '싱글'}</span><span>{game.audience || '전체 이용가'}</span></div><div className="registerTags">{(game.hashtags || []).map(t => <span className="registerTag" key={t}>#{t}</span>)}</div><div className="tip">등록 미리보기 · 로컬 저장 전용</div></div>}
</aside></div></main>}

    {view === 'play' && <main className="playPage">{(() => {
  const maps = game.maps || [];
  const m = maps.find(x => x.id === session.mapId) || maps[0];
  const here = m?.pins.find(p => p.id === session.pinId);
  const reachable = m && here ? reachablePins(m, here).map(p => p.id) : [];
  const locked = busy || !!session.pendingCheck || session.goalCompleted === true || !!session.dead || !!session.threat || !!session.mode;
  const infoFresh = infoSeen ? Object.entries(infoMarks(session)).filter(([k, v]) => infoSeen[k] !== v).map(([k]) => k) : [];
  const encounterNpc = !session.mode && !session.dead && !session.threat ? (session.sceneNpcs || []).find(n => !(session.handledNpcs || []).includes(n) && !(session.party || []).includes(n)) : undefined;
  const talkStart = session.mode === 'talk' && session.talkNpc ? talkStartIndex(session.log, session.talkNpc) : -1;
  const talkThread = talkStart >= 0 ? session.log.slice(talkStart + 1).map(parseTalk).filter((t): t is TalkLine => !!t) : [];
  const background = placeBackground(game, here);
  const introNpc = reading ? undefined : [session.mode === 'talk' ? session.talkNpc : undefined, session.pendingCheck ? undefined : encounterNpc].find(n => n && !(session.metNpcs || []).includes(n));
  const wipeKey = `${session.mapId}|${session.pinId}|${session.mode || ''}`;
  const placeName = session.scenePlace || here?.name || '';
  // A heading that only rewords the place (북문 초소 → 북문 초소 망루) is not a move. Ref written in render: same inputs give the same result, so a double render is safe.
  const last = moved.current;
  const mapNow = session.mapId || '', pinNow = session.pinId || '';
  if (last.map !== mapNow || last.pin !== pinNow || last.place !== placeName) {
    const sceneMoved = !session.mode && !!last.place && !!placeName && !last.place.includes(placeName) && !placeName.includes(last.place);
    const kind = !last.map ? '' : last.map !== mapNow ? 'map' : last.pin !== pinNow ? 'place' : sceneMoved ? 'scene' : '';
    moved.current = { map: mapNow, pin: pinNow, place: placeName, kind: kind || last.kind, seq: last.seq + (kind ? 1 : 0) };
  }
  const move = moved.current;
  const npcs = (session.sceneNpcs || []).map(name => ({ name, image: npcImage(game, name, session.activeImageKey) }));
  const interactKey = m && here ? `${m.id}:${here.id}` : '';
  const showMap = mapOpen && !!m && session.mode !== 'combat';
  const interactable = !!here && here.eventTrigger === 'interact' && !!here.eventText?.trim() && !(here.eventOnce && (session.triggeredEvents || []).includes(interactKey));
  return <div className="playBoard">
  <PlayIntro cover={game.cover} art={background}>
    <div className="introTitle"><small>{session.log.length > 1 ? 'CONTINUE' : 'NEW GAME'}</small><b>{game.name}</b><span>Lv.{session.level} · {placeName}</span>{currentGoalOf(session) && <span>{currentGoalOf(session)}</span>}<i className="introBar"/></div>
  </PlayIntro>
  {move.kind === 'map' && <div key={move.seq} className="cutIn cutInMap" aria-hidden="true">
    <div className="cutInMapBg">{background && <img src={background} alt="" draggable={false}/>}</div>
    <div className="cutInMapBody"><i className="cutInCompass"/><small>지역 이동</small><b>{m?.name}</b><span>{here?.name}</span><i/></div>
  </div>}
  {move.kind === 'place' && <div key={move.seq} className="cutIn cutInSweep cutInPlace" aria-hidden="true">
    <i className="cutInScrim"/>
    <div className="cutInBand">{background && <img src={background} alt="" draggable={false}/>}<i className="cutInHalftone"/><i className="cutInSpeed"/></div>
    <i className="cutInChevrons">»»»</i>
    <div className="cutInPlate"><small>이동</small><b>{here?.name}</b><span>{m?.name}</span></div>
  </div>}
  {/* Re-keying on a place or mode change replays the one-shot cut-in. */}
  {session.mode === 'combat' && session.combat && (() => {
    const c = session.combat, genre = defaultMapGenre(game), art = c.monster ? foeImage(genre, c.npc) : npcImage(game, c.npc), boss = !!findFoe(genre, c.npc)?.boss;
    return <div key={wipeKey} className={`cutIn cutInBattle${boss ? ' cutInBoss' : ''}`} aria-hidden="true">
      <div className="cutInSide cutInMe"><i className="cutInHalftone"/><img src={playerPortraitSrc(game)} alt="" draggable={false}/></div>
      <div className="cutInSide cutInFoe"><i className="cutInHalftone"/>{art && <img src={art} alt="" draggable={false} onError={e => { e.currentTarget.style.display = 'none'; }}/>}</div>
      <i className="cutInSpeed"/><i className="cutInSeam"/>
      <div className="cutInTag cutInTagMe"><small>Lv.{session.level}</small><b>나</b></div>
      <div className="cutInTag cutInTagFoe"><small>{boss ? 'BOSS' : 'ENEMY'} Lv.{c.level ?? levelForTier(c.power || 3)}</small><b>{c.npc}</b></div>
      <b className="cutInVs">VS</b>
      <div className="cutInBanner">{boss ? 'WARNING' : 'BATTLE START'}</div>
      <i className="cutInFlash"/>
    </div>;
  })()}
  {introNpc && <NpcCutIn key={introNpc} npc={introNpc} art={npcImage(game, introNpc, session.activeImageKey)} onDone={() => setSession(s => ({ ...s, metNpcs: [...new Set([...(s.metNpcs || []), introNpc])] }))}/>}
  <PlayStatus game={game} session={session} place={placeName} region={m?.name}/>
  <section className="playScenePanel">
    {/* The stage asks for the height that shows its image whole; the text below takes what is left. */}
    <div className={`sceneStage${session.mode === 'combat' ? ' sceneBattleMode' : ''}${showMap ? ' sceneMapMode' : ''}`} style={{ ['--sceneRatio' as string]: mapRatios[showMap && m ? m.baseImage || m.image : background] || 16 / 9 } as React.CSSProperties}>
      {background && <img className="sceneBackdrop" src={background} alt="" aria-hidden="true" draggable={false}/>}
      {background ?<img key={`${session.mapId}|${session.pinId}`} className="sceneBackground sceneArrive" src={background} alt="" draggable={false} ref={img => { if (img?.complete) noteMapRatio(background, img); }} onLoad={e => noteMapRatio(background, e.currentTarget)}/> : <div className="sceneBackground sceneFallback"/>}
      {move.kind === 'scene' && <div key={move.seq} className="sceneRibbon" aria-hidden="true"><small>현재 위치</small><b>{placeName}</b></div>}
      <div className="sceneTopBar">
      <button type="button" className={`sceneLocation${showMap ? ' open' : ''}`} disabled={!m} aria-expanded={showMap} title={showMap ? '지도 닫기' : '지도를 열어 이동'} onClick={() => setMapOpen(o => !o)}><MapPinIcon size={14}/><span>{m ? `${m.name} · ` : ''}{here?.name || '위치 미지정'}</span><b>{showMap ? <><X size={13}/> 닫기</> : <><MapIcon size={13}/> 지도</>}</b></button>
      </div>
      {showMap && m && <div className="stageMap">
        <div className="miniMap"><div className="stageMapFrame stageMapFollow" style={mapCamera(m, here, reachable)}>
          <img src={m.baseImage || m.image} alt={m.name} draggable={false} ref={img => { if (img?.complete) noteMapRatio(m.baseImage || m.image, img); }} onLoad={e => noteMapRatio(m.baseImage || m.image, e.currentTarget)}/>
          {m.pins.filter(p => p.kind !== 'event').map(p => { const current = p.id === here?.id; const near = reachable.includes(p.id); return <button key={p.id} type="button" className={`miniMapPin ${current ? 'current' : near ? 'near' : 'far'}${p.kind === 'exit' ? ' exit' : ''}`} style={{left:`${p.x}%`,top:`${p.y}%`}} aria-disabled={!near || locked} title={current ? `현재 위치: ${p.name}` : near ? (p.kind === 'exit' ? p.name : `${p.name}${josa(p.name, '로')} 이동`) : `${p.name} · 너무 멀어서 바로 갈 수 없습니다`} onClick={() => { if (near && !locked) { setMapOpen(false); void moveTo(p); } }}><i aria-hidden="true"/><span>{p.name}</span></button>; })}
          {here && <img className="miniMapPlayer" src={playerPortraitSrc(game)} alt="플레이어 현재 위치" draggable={false} style={{left:`${here.x}%`,top:`${here.y}%`}}/>}
        </div></div>
        <p className="stageMapHint">{locked ? '진행 중인 장면이 끝나면 이동할 수 있습니다.' : '밝게 표시된 가까운 장소를 누르거나, 선택지·직접 입력으로 이동하세요.'}</p>
      </div>}
      {!showMap && !session.mode && !session.threat && (session.party || []).length > 0 && <div className="partyStrip">{(session.party || []).map(n => { const face = npcImage(game, n); return <button key={n} type="button" className="partyTalk" disabled={busy} title={`${n}와(과) 대화`} aria-label={`${n}와(과) 대화`} onClick={() => void startTalk(n)}><span className="partyTalkFace">{face ? <img src={face} alt="" draggable={false}/> : <Users size={20}/>}</span><small><MessageCircle size={10}/> {n}</small></button>; })}</div>}
      {!showMap && session.mode !== 'combat' && (npcs.length > 0 || !session.threat) && <div className={`sceneNpcs${session.mode === 'talk' ? ' sceneTalking' : ''}`}>{!session.threat && (() => {
        const mine = talkThread.filter(t => t.speaker === 'me');
        const speaking = talkThread[talkThread.length - 1]?.speaker === 'me';
        return <figure key="__player" className={`sceneNpc scenePlayer${speaking ? ' scenePlayerSpeaking' : ''}`}><div key={`me-${mine.length}`} className={`sceneNpcBody${speaking ? ' npcTalk' : ''}`}><img src={playerPortraitSrc(game)} alt="플레이어" draggable={false}/></div><figcaption>나</figcaption></figure>;
      })()}{npcs.map(n => {
        const partner = session.mode === 'talk' && n.name === session.talkNpc;
        const npcLines = partner ? talkThread.filter(t => t.speaker === 'npc') : [];
        const lastLine = npcLines[npcLines.length - 1];
        // Re-keying on each new line restarts the one-shot motion.
        return <figure key={n.name} className={`sceneNpc${partner ? ' sceneNpcFocus' : session.mode === 'talk' ? ' sceneNpcDim' : ''}${partner && busy ? ' sceneNpcListening' : ''}`}>
          <div key={partner ? `line-${npcLines.length}` : 'still'} className={`sceneNpcBody${lastLine ? ' ' + gestureMotion(lastLine.gesture, lastLine.line) : ''}`}>{n.image ? <img src={n.image} alt={n.name} draggable={false}/> : <div className="sceneNpcSilhouette"><Users size={42}/></div>}</div>
          <figcaption className={`nameTag-${attitudeTier((session.relationships || []).find(r => r.name.trim() === n.name.trim())?.affection ?? 0).tone}`}>{n.name}</figcaption></figure>; })}</div>}
      {session.mode === 'combat' && session.combat && (() => {
        const c = session.combat;
        const ev = c.last;
        const enemyImage = npcImage(game, c.npc);
        const pop = (value: number | null | undefined, crit?: boolean) => value === null || value === undefined ? null : value > 0 ? { text: `-${value}`, cls: crit ? ' crit' : '' } : { text: 'MISS', cls: ' miss' };
        const enemyPop = pop(ev?.dealt, ev?.critDealt), playerPop = pop(ev?.taken, ev?.critTaken);
        const react = (value: number | null | undefined, crit?: boolean) => value === null || value === undefined ? '' : value > 0 ? ` battleHit${crit ? ' battleCrit' : ''}` : ' battleDodge';
        // Each exchange re-keys the fighters so it replays: I dash in and strike, return, then the foe dashes back at me.
        return <div className={`battleStage battle-${defaultMapGenre(game)}`}>
          <div className="battleSide battlePlayer">
            {(session.party || []).filter(n => n !== c.npc).length > 0 && <div className="battleAllyRow">{(session.party || []).filter(n => n !== c.npc).map(ally => { const face = npcImage(game, ally); const struck = !!ev?.allies?.includes(ally); return <figure key={`${ally}-${c.round}`} className={`battleAlly${struck ? ' battleAllyHit' : ''}`}>{face ? <img src={face} alt={ally} draggable={false}/> : <Users size={20}/>}<figcaption>{ally} Lv.{npcLevel(session, ally) || 3}</figcaption></figure>; })}</div>}<div className="battleHp"><span>나</span><div><i style={{width:`${Math.max(0, Math.min(100, session.hp / Math.max(1, maxHpOf(game, session)) * 100))}%`}}/></div><b>{session.hp}/{maxHpOf(game, session)}</b></div>{gearOf(session.equipped, session.itemInfo).caster && maxManaOf(game, session) > 0 && (() => { const mm = maxManaOf(game, session), mp = Math.min(mm, session.mana ?? mm), gauge = Math.min(SPELL_GAUGE, c.castGauge || 0); return <><div className="battleHp battleMp"><span>MP</span><div><i style={{width:`${mp / mm * 100}%`}}/></div><b>{mp}/{mm}</b></div><div className="battleHp battleCast"><span>시전</span><div><i style={{width:`${gauge / SPELL_GAUGE * 100}%`}}/></div><b>{Math.round(gauge / SPELL_GAUGE * 100)}%</b></div></>; })()}
            <div key={`p${c.round}`} className={`battleBody${ev && !c.result ? ' battleLungeRight' : ''}`}>
              <div className={`battleReact${c.result === 'lose' ? ' battleDown' : react(ev?.taken, ev?.critTaken) + ' battleLate'}`}><img src={playerPortraitSrc(game)} alt="플레이어" draggable={false}/></div>
            </div>
            {playerPop && <span key={`pp${c.round}`} className={`battlePop battleLate${playerPop.cls}`}>{playerPop.text}</span>}
            {!!ev?.taken && <i key={`ps${c.round}`} className="battleSlash battleSlashBack battleLate" aria-hidden="true"/>}
          </div>
          <div className="battleSide battleEnemy">
            <div className="battleHp"><span>{c.npc} Lv.{c.level ?? levelForTier(c.power || 3)}</span><div><i style={{width:`${c.enemyHp / Math.max(1, c.enemyMaxHp) * 100}%`}}/></div><b>{c.enemyHp}/{c.enemyMaxHp}</b></div>
            <div key={`e${c.round}`} className={`battleBody${ev && ev.taken !== null && !c.result ? ' battleLungeLeft battleCounter' : ''}`}>
              <div className={`battleReact${c.result === 'win' ? ' battleDown' : react(ev?.dealt, ev?.critDealt) + ' battleEarly'}`}>{enemyImage && !c.monster ? <img src={enemyImage} alt={c.npc} draggable={false}/> : c.monster ? <div className="battleMonsterArt">{foeImage(defaultMapGenre(game), c.npc) && <img src={foeImage(defaultMapGenre(game), c.npc)} alt={c.npc} draggable={false} onLoad={e => e.currentTarget.parentElement?.classList.add('hasArt')} onError={e => { e.currentTarget.style.display = 'none'; }}/>}<div className="sceneNpcSilhouette battleMonster"><Skull size={54}/></div></div> : <div className="sceneNpcSilhouette"><Users size={42}/></div>}</div>
            </div>
            {enemyPop && <span key={`ep${c.round}`} className={`battlePop battleEarly${enemyPop.cls}`}>{enemyPop.text}</span>}
            {!!ev?.dealt && <i key={`es${c.round}`} className="battleSlash battleEarly" aria-hidden="true"/>}
          </div>
        </div>;
      })()}
      {!showMap && session.threat && !session.mode && (() => {
        // The foe blocking the way stands on the stage while the player decides to fight or run.
        const t = session.threat;
        const art = t.monster ? foeImage(defaultMapGenre(game), t.npc) : npcImage(game, t.npc);
        return <figure className="sceneThreat">
          <div className="battleMonsterArt">{art && <img src={art} alt={t.npc} draggable={false} onLoad={e => e.currentTarget.parentElement?.classList.add('hasArt')} onError={e => { e.currentTarget.style.display = 'none'; }}/>}<div className="sceneNpcSilhouette battleMonster"><Skull size={54}/></div></div>
          <figcaption>{t.npc} Lv.{t.level ?? (t.monster ? levelForTier(findFoe(defaultMapGenre(game), t.npc)?.power || 3) : npcLevel(session, t.npc) || 3)}</figcaption>
        </figure>;
      })()}
      {vnPages.length > 0 && (() => {
        const page = vnPages[vnAt];
        const canGo = vnAt + 1 < vnPages.length || reading;
        return <div className={`vnBox${canGo ? ' vnReady' : ''}`} role="button" tabIndex={0} aria-label="다음"
          onClick={nextPage} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextPage(); } }}>
          <div className="vnName">{page.place || '이야기'}</div>
          <p className="vnText">{page.text}</p>
          {reading && <button type="button" className="vnSkip" onClick={e => { e.stopPropagation(); finishReading(); }}>건너뛰기</button>}
          <span className="vnCount">{vnAt + 1}/{vnPages.length}{streaming ? '…' : ''}</span>
          <span className={`vnNext${canGo ? '' : ' vnWait'}`} aria-hidden="true">▽</span>
        </div>;
      })()}
      {busy && session.mode !== 'talk' && vnPages.length === 0 && <div className="sceneBusy">이야기가 이어지고 있습니다... <BusySeconds/></div>}
    </div>
    {/* On desktop this box floats over the stage's bottom, visual-novel style (style.css), so the stage never resizes. */}
    <div className={`sceneBody${reading ? ' sceneBodyReading' : ''}`}>
    {session.pendingCheck && <div className="diceCheckPanel"><div className="diceCheckTop"><strong><Dices size={18}/> {session.pendingCheck.label} 판정</strong><span>{WEIGHT_LABEL[session.pendingCheck.weight || weightOf(session.pendingCheck.dc) || 'normal']} · DC {session.pendingCheck.dc}</span></div><p>{session.pendingCheck.reason}</p>{(() => { const b = checkBonus(session.pendingCheck), need = Math.max(2, Math.min(20, session.pendingCheck.dc - b.modifier)); return <p className="diceBonus">{b.statName} {b.score} → {b.modifier ? <b>보정 {b.modifier > 0 ? '+' : '−'}{Math.abs(b.modifier)}</b> : <b>보정 없음</b>} · 주사위 <b>{need}</b> 이상이면 성공</p>; })()}{(() => { const c = session.pendingCheck, pay = checkStakes(c.weight || weightOf(c.dc) || 'normal', session.level || 1, maxHpOf(game, session)); const win = [pay.xp && `경험치 +${pay.xp}`, pay.gold && `골드 +${pay.gold}`, pay.rep && `명성 +${pay.rep}`, pay.gear && '장비'].filter(Boolean).join(' · ');
      return <ul className="diceStakes"><li className="win"><b>성공</b> {c.success}{win && <em className="diceGain"> {win}</em>}</li><li className="lose"><b>실패</b> {c.failure}{pay.hurt > 0 && <em className="diceGain"> HP -{pay.hurt}</em>}</li></ul>; })()}<div className="diceCheckActions"><button type="button" className="btn primary" disabled={busy} onClick={() => void roll()}><Dices size={17}/> D20 굴리기</button><button type="button" className="btn" disabled={busy || !!diceRoll} onClick={skipCheck}>굴리지 않는다</button></div></div>}
    {/* The result box stays only while its scene is written; the log keeps the roll after that. */}
    {session.lastCheck && !session.pendingCheck && busy && <div className="diceCheckResult"><strong>{session.lastCheck.label} · {session.lastCheck.critical || (session.lastCheck.success ? '성공' : '실패')}</strong><span>D20 {session.lastCheck.die} {session.lastCheck.modifier >= 0 ? '+' : '-'} {Math.abs(session.lastCheck.modifier)} = {session.lastCheck.total} / DC {session.lastCheck.dc}</span></div>}
    {session.mode === 'combat' && session.combat ? <div className="combatPanel">
      <div className="combatHeader"><strong><Swords size={16}/> 전투 · {session.combat.npc}</strong><span>{session.combat.round <= 1 ? '준비' : `${session.combat.round - 1}합`}</span></div>
      <p className="combatAuto">{session.combat.result ? '전투가 끝났습니다.' : session.combat.round < 1 || busy ? '상대를 살피는 중...' : '자동 전투 진행 중 — 오른쪽 진행 기록에서 상황을 확인하세요.'}</p>
    </div>
    : session.mode === 'talk' && session.talkNpc ? <div className="talkPanel">
      <div className="talkHeader"><strong><MessageCircle size={16}/> {session.talkNpc}</strong></div>
      <div className="talkThread" ref={talkRef}>
        {talkThread.map((t, i) => <TalkBubble key={i} t={t} image={t.speaker === 'npc' ? npcImage(game, t.name) : undefined} typing={!talkStreamed && i === talkThread.length - 1 && t.speaker === 'npc'}/>)}
        {session.talkEnded && !busy && <div className="talkEndedLine" role="status"><span>대화가 종료되었습니다</span></div>}
        {busy && <div className="talkRow talkNpc"><span className="talkAvatar">{npcImage(game, session.talkNpc) ? <img src={npcImage(game, session.talkNpc)} alt=""/> : session.talkNpc.slice(0, 1)}</span><div className="talkBody">{liveTalk ? liveTalk.split('\n').filter(l => l.trim()).map((l, i) => <div key={i} className="talkBubbleBox">{l.trim()}</div>) : <div className="talkBubbleBox talkTyping" aria-label="입력 중"><i/><i/><i/></div>}</div></div>}
      </div>
      {!busy && !session.talkEnded && !!session.suggestedActions?.length && <div className="talkSuggestions">{session.suggestedActions.slice(0, 3).map((line, i) => <button key={`${i}-${line}`} type="button" onClick={() => void sayToNpc(line)}><span className="gmChoiceNumber">{i + 1}</span>{line}</button>)}</div>}
      {session.talkEnded ? <button type="button" className="btn primary talkEndButton" disabled={busy} onClick={() => void endTalk()}>대화 끝내기</button> : <form className="talkInput" onSubmit={e => { e.preventDefault(); void sayToNpc(action); }}><input value={action} onChange={e => setAction(e.target.value)} maxLength={300} disabled={busy} placeholder={`${session.talkNpc}에게 메시지 보내기`} aria-label="대사 입력"/><button className="btn primary" type="submit" disabled={busy || !action.trim()}><Send size={15}/> 보내기</button></form>}
    </div>
    : session.threat && !session.dead ? <div className="encounterPanel threatPanel">
      {(() => { const foe = session.threat.monster ? findFoe(defaultMapGenre(game), session.threat.npc) : undefined; const tier = foe?.power ?? session.npcPower?.[session.threat.npc] ?? 3; return <FoeCard name={session.threat.npc} tier={tier} level={session.threat.level} desc={foe?.desc} boss={!!foe?.boss}/>; })()}
      <div className="encounterActions">
        <button type="button" className="encounterAction encounterFight" disabled={busy} onClick={() => void faceThreat()}><Swords size={22}/><strong>싸운다</strong></button>
        <button type="button" className="encounterAction encounterFlee" disabled={busy} onClick={() => void fleeThreat()}><Footprints size={22}/><strong>도망친다</strong></button>
      </div>
    </div>
    : encounterNpc && !session.pendingCheck && introNpc === encounterNpc ? null
    : encounterNpc && !session.pendingCheck ? <div className="encounterPanel">
      <div className="encounterActions">
        <button type="button" className="encounterAction encounterTalk" disabled={busy} onClick={() => void startTalk(encounterNpc)}><MessageCircle size={22}/><strong>대화하기</strong></button>
        <button type="button" className="encounterAction encounterFight" disabled={busy} onClick={() => void startFight(encounterNpc)}><Swords size={22}/><strong>싸우기</strong></button>
        <button type="button" className="encounterAction encounterIgnore" disabled={busy} onClick={() => ignoreNpc(encounterNpc)}><EyeOff size={22}/><strong>무시하기</strong></button>
      </div>
    </div>
    : <>
    {session.dead && !busy && <div className="deathPanel"><Skull size={30}/><strong>사망</strong><p>당신의 이야기는 여기서 끝났습니다.</p><button type="button" className="btn primary" onClick={newGame}><RotateCcw size={16}/> 새로 시작하기</button></div>}
    {!session.dead && !session.threat && !session.pendingCheck && !busy && !!session.suggestedActions?.length && <div className="gmChoices">{session.suggestedActions.slice(0, 3).map((choice, index) => <button key={`${index}-${choice}`} type="button" className="gmChoiceButton" onClick={() => void sendPlayerAction(choice)}><span className="gmChoiceNumber">{index + 1}</span><span>{choice.replace(/^\s*[(\[]?\s*특이한\s*행동\s*\d?\s*[)\]]?\s*[:：\-—]?\s*/, '')}</span><ChevronRight size={16}/></button>)}
      <form className="gmChoiceButton gmChoiceOwn" onSubmit={e => { e.preventDefault(); const v = ownAction.trim(); if (v) { setOwnAction(''); void sendPlayerAction(v); } }}><MessageCircle size={18} className="gmChoiceOwnIcon"/><span className="gmChoiceOwnTag">직접 쓰기</span><input value={ownAction} onChange={e => setOwnAction(e.target.value)} maxLength={300} placeholder="원하는 행동을 직접 입력합니다." aria-label="직접 행동 입력"/><button type="submit" disabled={!ownAction.trim()} aria-label="행동하기"><ChevronRight size={16}/></button></form></div>}
    {interactable && !locked && <button type="button" className="btn sceneInteract" onClick={interact}><Sparkles size={15}/> {here!.name}에서 상호작용하기</button>}
    </>}
    </div>
  </section>
  {session.mode === 'combat' && session.combat?.result && <div className="battleResultBackdrop" role="dialog" aria-modal="true" aria-labelledby="battle-result-title"><div className={`battleResultModal ${session.combat.result}`}>
    <span className="battleResultIcon"><Swords size={28}/></span>
    <h2 id="battle-result-title">{session.combat.result === 'win' ? '승리!' : session.combat.lethal ? '사망' : '패배'}</h2>
    <p>{Math.max(0, session.combat.round - 1)}합 만에 {session.combat.npc}{session.combat.result === 'win' ? '을(를) 쓰러뜨렸습니다.' : '에게 쓰러졌습니다.'}</p>
    <div className="battleResultStats"><span>입힌 피해 <b>{session.combat.totalDealt || 0}</b></span><span>받은 피해 <b>{session.combat.totalTaken || 0}</b></span><span>남은 HP <b>{session.hp}/{maxHpOf(game, session)}</b></span></div>
    <button type="button" className="btn primary" disabled={busy} autoFocus onClick={() => void finishBattle()}>확인</button>
  </div></div>}
  {levelBurst && <div key={levelBurst.key} className="repBurst levelBurst" role="status" onClick={() => setLevelBurst(null)}>
    <Sparkles size={34}/>
    <strong>레벨 업!</strong>
    <b>Lv.{levelBurst.level}</b>
    <span>최대 HP {maxHpOf(game, session)} · 공격과 회피가 강해졌습니다</span>
  </div>}
  {awakenBurst && <div key={awakenBurst.key} className="repBurst awakenBurst" role="status" onClick={() => setAwakenBurst(null)}>
    <Zap size={34}/>
    <strong>신의 가호 — 각성!</strong>
    <b>Lv.{awakenBurst.level}</b>
    <span>쓰러진 자리에서 다시 일어섰습니다. 전투가 이어집니다.</span>
  </div>}
  {itemBurst && <div key={itemBurst.key} className={`repBurst itemBurst grade${itemBurst.info.grade}`} role="status" onClick={() => setItemBurst(null)}>
    <Sparkles size={34}/>
    <strong>{GRADE_LABELS[itemBurst.info.grade]} 장비 획득!</strong>
    <b>{itemBurst.name}</b>{itemBurst.more > 0 && <span>외 {itemBurst.more}개</span>}
    <span>{[KIND_LABELS[itemBurst.info.kind], bonusText(itemBurst.info, itemBurst.name)].filter(Boolean).join(' · ')}</span>
    {itemBurst.info.skill && <span className="itemBurstSkill">{skillText(itemBurst.info)}</span>}
  </div>}
  {repBurst && <div key={repBurst.key} className={`repBurst${repBurst.delta < 0 ? ' infamy' : ''}`} role="status" onClick={() => setRepBurst(null)}>
    <Award size={34}/>
    <strong>{repBurst.delta > 0 ? '명성 대폭 상승!' : '명성 급락!'}</strong>
    <b>{formatReputation(repBurst.delta)}</b>
    <span>{repBurst.total.toLocaleString('ko-KR')} · {reputationRank(repBurst.total)}</span>
  </div>}
  {diceRoll && session.pendingCheck && (() => { const r = diceRoll.result, need = Math.max(2, Math.min(20, r.dc - r.modifier)); return <div className="battleResultBackdrop" role="dialog" aria-modal="true" aria-labelledby="dice-roll-title"><div className={`battleResultModal diceRollModal${diceRoll.done ? (r.success ? ' win' : ' lose') : ''}`}>
    <h2 id="dice-roll-title"><Dices size={20}/> {r.label} 판정</h2>
    <div className="diceNeed"><span>목표 DC <b>{r.dc}</b></span><span>주사위 <b>{need}</b> 이상 필요</span></div>
    <div className={`diceFace${diceRoll.done ? ' landed' : ' rolling'}${diceRoll.done && r.critical ? ' crit' : ''}`} aria-live="polite">{diceRoll.face}</div>
    <ul className="diceMods">
      <li><span>D20</span><b>{diceRoll.done ? r.die : '?'}</b></li>
      <li><span>{diceRoll.statName} {diceRoll.score} 보정</span><b>{r.modifier >= 0 ? '+' : '−'}{Math.abs(r.modifier)}</b></li>
      <li className="diceTotal"><span>합계</span><b>{diceRoll.done ? r.total : '?'} <small>/ DC {r.dc}</small></b></li>
    </ul>
    <small className="diceRule">1은 항상 실패, 20은 항상 성공입니다.</small>
    {diceRoll.done && <div className="diceVerdict"><strong>{r.critical || (r.success ? '성공!' : '실패')}</strong>{(r.success ? r.onSuccess : r.onFailure) && <span>{r.success ? r.onSuccess : r.onFailure}</span>}</div>}
    <button type="button" className="btn primary" disabled={!diceRoll.done || busy} autoFocus onClick={() => void confirmRoll()}>{diceRoll.done ? '확인' : '굴리는 중…'}</button>
  </div></div>; })()}
  {questClear && session.mode !== 'talk' && <div key={questClear.key} className="battleResultBackdrop" role="dialog" aria-modal="true" aria-labelledby="quest-clear-title" onClick={() => setQuestClear(null)}><div className="battleResultModal questClear" onClick={e => e.stopPropagation()}>
    <span className="battleResultIcon"><Trophy size={30}/></span>
    <h2 id="quest-clear-title">퀘스트 클리어!</h2>
    <ul className="questClearList">{questClear.quests.map(q => <li key={q.name} className={q.main ? 'main' : ''}><Check size={14}/><span>{q.main && <em className="questMainTag">메인</em>}{q.name}{q.giver && <small>의뢰인 {q.giver}</small>}</span></li>)}</ul>
    <div className="questClearRewards"><strong>보상</strong>
      <span><Sparkles size={13}/> 경험치 <b>+{questClear.xp.toLocaleString('ko-KR')}</b></span>
      {questClear.reputation !== 0 && <span><Award size={13}/> 명성 <b>{formatReputation(questClear.reputation)}</b><small>{questClear.total.toLocaleString('ko-KR')} · {reputationRank(questClear.total)}</small></span>}
      {questClear.quests.filter(q => q.giver).map(q => <span key={'aff-' + q.name}><Users size={13}/> {q.giver} 호감도 <b className="affPos">+{QUEST_AFFECTION}</b></span>)}
      {questClear.items.length > 0 && <span><Package size={13}/> 획득 {questClear.items.map(n => { const it = infoOf(n, session.itemInfo); return <b key={n} className={`itemName grade${it.grade}`} title={itemTitle(n, it)}>{it.grade > 0 ? `[${GRADE_LABELS[it.grade]}] ` : ''}{n}</b>; })}</span>}
      {questClear.levelTo > questClear.levelFrom && <span className="questClearLevel"><Zap size={13}/> 레벨 업 <b>Lv.{questClear.levelFrom} → Lv.{questClear.levelTo}</b></span>}
    </div>
    {questClear.next && <div className="questClearNext"><strong>다음 메인 퀘스트</strong><span>{questClear.next}</span></div>}
    <button type="button" className="btn primary" autoFocus onClick={() => setQuestClear(null)}>확인</button>
  </div></div>}
  {partyResult && (() => { const face = npcImage(game, partyResult.npc); return <div className="battleResultBackdrop" role="dialog" aria-modal="true" aria-labelledby="party-result-title" onClick={() => { if (!partyResult.thinking) setPartyResult(null); }}><div className={`battleResultModal partyResult ${partyResult.thinking ? 'thinking' : partyResult.accepted ? 'accepted' : 'declined'}`} onClick={e => e.stopPropagation()}>
    <span key={partyResult.thinking ? 'wait' : 'done'} className="partyResultFace">{face ? <img src={face} alt={partyResult.npc} draggable={false}/> : <Users size={30}/>}</span>
    {partyResult.thinking ? <>
      <h2 id="party-result-title" className="partyThinkingTitle">고민 중<span className="partyDots" aria-hidden="true"><i/><i/><i/></span></h2>
      <p>{partyResult.npc}{josa(partyResult.npc, '이')} 당신의 제안을 곰곰이 생각하고 있습니다…</p>
      <div className="partyChance"><span>합류 확률 <b>{Math.round(partyResult.chance * 100)}%</b></span><div className="partyChanceTrack"><i style={{width:`${Math.round(partyResult.chance * 100)}%`}}/></div></div>
    </> : <>
      <h2 id="party-result-title" className="partyVerdict">{partyResult.accepted ? '합류!' : '거절'}</h2>
      <p>{partyResult.accepted ? `${partyResult.npc}${josa(partyResult.npc, '이')} 파티에 합류했습니다. 이제 전투에서 함께 싸웁니다.` : `${partyResult.npc}${josa(partyResult.npc, '이')} 파티 권유를 거절했습니다.`}</p>
      <button type="button" className="btn primary" autoFocus onClick={() => setPartyResult(null)}>확인</button>
    </>}
  </div></div>; })()}
  <section className="playChatPanel playLogPanel">
    <p className="currentGoal"><b>현재 목표:</b> {currentGoalOf(session) || '없음'}</p>
    <div className="sideTabs" role="tablist">{([['log', '진행 기록'], ['info', '정보창']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={sideTab === key} className={sideTab === key ? 'active' : ''} onClick={() => setSideTab(key)}>{label}{key === 'info' && sideTab !== 'info' && infoFresh.length > 0 && <i className="newDot" role="img" aria-label="새 변화"/>}</button>)}</div>
    {/* Hidden, not unmounted: the info tab keeps its picked item and inner tab. */}
    <div className="sideInfo" hidden={sideTab !== 'info'}><CharacterPanel game={game} session={session} portrait={game.playerPortrait} onInvite={inviteToParty} onLeave={leaveParty} onTalk={!busy && !session.mode ? npc => void startTalk(npc) : undefined} onDropQuest={dropQuest} onEquip={toggleEquip} onUse={useItem} onDiscard={discardItem} visible={sideTab === 'info'} fresh={infoFresh} onSeen={keys => setInfoSeen(seen => { const now = infoMarks(session); return seen && keys.every(k => seen[k] === now[k]) ? seen : { ...seen, ...Object.fromEntries(keys.map(k => [k, now[k]])) }; })}/></div>
    <div className="sideLog" hidden={sideTab !== 'log'}>
    <div className="logActions"><button type="button" className="btn logExport" title="진행 기록을 JSON 파일로 저장" onClick={() => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(session, null, 1)], { type: 'application/json' })); link.download = `${game.name.replace(/[^a-zA-Z0-9가-힣_-]/g, '_') || 'game'}_진행기록_${new Date().toLocaleString('sv-SE').slice(5, 16).replace(/[-: ]/g, '')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }}><Download size={14}/> JSON</button></div>
    <div className="chatLog storyLog" ref={chatRef}>{(() => { const items = groupLog(session.log); const lastTalk = items.map(x => x.kind).lastIndexOf('talk'); const lastBattle = items.map(x => x.kind).lastIndexOf('battle'); const start = Math.max(0, items.length - logShown); return <>{start > 0 && <button type="button" className="btn storyMore" onClick={() => setLogShown(n => n + LOG_PAGE)}>이전 기록 {Math.min(start, LOG_PAGE)}개 더 보기 · 남은 {start}개</button>}{items.slice(start).map((item, k) => { const i = k + start; if (reading && freshFrom !== null && i >= freshFrom) return null; if (item.kind === 'battle') { const name = item.lines[0]?.match(/^(.+?)의 체력/)?.[1] || '상대'; const outcome = item.lines[item.lines.length - 1]?.match(/^(승리|패배)/)?.[1]; const rows = <ul className="battleLines">{item.lines.map((l, j) => <li key={j} className={/^승리/.test(l) ? 'win' : /^패배/.test(l) ? 'lose' : /내 공격 명중/.test(l) ? 'dealt' : /반격 명중/.test(l) ? 'taken' : /전투 시작$/.test(l) ? 'start' : 'miss'}>{l}</li>)}</ul>; return session.mode === 'combat' && i === lastBattle ? <div key={i} className="battleRecord battleLive"><div className="battleRecordTitle"><Swords size={14}/> {name}{josa(name, '와')} 전투 중</div>{rows}</div> : <details key={i} className="talkRecord battleRecord"><summary><Swords size={14}/> {name}{josa(name, '와')}의 전투{outcome ? ` · ${outcome}` : ''}</summary>{rows}</details>; } if (item.kind === 'talk') { const name = item.lines.find(t => t.speaker === 'npc')?.name || ''; return session.mode === 'talk' && i === lastTalk ? <div key={i} className="talkRecord talkLive"><MessageCircle size={14}/> {name ? `${name}${josa(name, '와')} 대화 중` : '대화 중'} · 가운데 창에서 이어집니다</div> : <details key={i} className="talkRecord" open={i === lastTalk}><summary><MessageCircle size={14}/> {name ? `${name}${josa(name, '와')}의 대화` : '대화'} · {item.lines.filter(t => t.speaker !== 'scene').length}마디</summary><div className="talkThread talkThreadLog">{item.lines.map((t, j) => <TalkBubble key={j} t={t} image={t.speaker === 'npc' ? npcImage(game, t.name) : undefined}/>)}<div className="talkEndedLine"><span>대화가 종료되었습니다</span></div></div></details>; } const entry = item.entry; const player = entry.startsWith('플레이어:'); const system = entry.startsWith('시스템:') || entry.startsWith('주사위:'); const event = entry.startsWith('이벤트:'); const prologue = entry.startsWith('프롤로그:'); const content = storyText(entry.replace(/^(GM:|플레이어:|시스템:|주사위:|이벤트:|프롤로그:)\s*/, '')); const dice = entry.startsWith('주사위:'); const heading = content.match(/^【([^】]+)】\s*/); const body = heading ? content.slice(heading[0].length) : content; const fresh = freshFrom !== null && i >= freshFrom && !prologue; const Icon = player ? CheckCircle2 : event ? Flag : dice ? Dices : system ? Info : BookOpen; const label = <span className="storyEntryLabel"><Icon size={15}/> {player ? '선택' : event ? '이벤트' : prologue ? `프롤로그 · ${prologueTitle(game)}` : dice ? '판정' : system ? '변화' : heading?.[1] || '장면'}{fresh && <span className="freshHint">NEW</span>}</span>; return player || system ? <div key={i} className={`storyEntry ${player ? 'storyPlayer' : 'storySystem'}`}>{label}<div className="storyEntryText">{player ? content : withAffectionColors(content)}</div></div> : <details key={i} open className={`storyEntry ${event ? 'storyEvent' : 'storyGM'}${fresh ? ' storyFresh' : ''}`} onClick={e => { if (fresh) { e.preventDefault(); setFreshFrom(null); } }}><summary>{label}<span className="storyPreview">{body}</span></summary><div className="storyEntryText"><StoryProse text={body}/></div></details>; })}</>; })()}</div>
    </div>
  </section>
  </div>; })()}</main>}
    {notice && <div className="toast"><Check size={16} /> {notice}</div>}
  </div>;
}

// Seconds since the wait began; mounted only while busy, so each wait starts again at 0.
function BusySeconds() {
  const [s, setS] = useState(0);
  useEffect(() => { const id = setInterval(() => setS(v => v + 1), 1000); return () => clearInterval(id); }, []);
  return <span className="busySeconds">{s}초</span>;
}
