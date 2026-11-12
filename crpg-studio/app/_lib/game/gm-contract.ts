// The /api/gm request, shared by the play screen (app/page.tsx builds it) and the GM route (app/api/gm/route.ts reads it).
// It fixes the field names: a name only one side knows is a type error on that side, so a field renamed or dropped on one
// end can't silently arrive empty at the other. Values stay loose because the route checks each one at runtime.
// State fields the route never names still reach the bookkeeping GM, which reads the whole state (modelState).
/* eslint-disable @typescript-eslint/no-explicit-any */
export type GmStateKey =
  | 'adjacentLocationIds' | 'adjacentLocations' | 'availableImages' | 'cast' | 'characterValues' | 'completedGoalSteps'
  | 'currentGoal' | 'currentInteractionEvent' | 'currentMapId' | 'directorNotes' | 'equipped' | 'event' | 'eventTrigger'
  | 'finalGoal' | 'finalGoalMode' | 'finalGoalSteps' | 'flags' | 'goalCompleted' | 'goalPath' | 'gold' | 'handledNpcs' | 'hp' | 'inventory'
  | 'items' | 'knownNpcs' | 'level' | 'localStories' | 'locationDescription' | 'locationName' | 'locations' | 'mapName'
  | 'mapPin' | 'maxHp' | 'maxQuests' | 'monsters' | 'npcProfiles' | 'party' | 'partyLevels' | 'placeSeed' | 'quests'
  | 'recentFoes' | 'relationships' | 'reputation' | 'reputationRank' | 'reservedNpcs' | 'roll' | 'safePlace' | 'sceneNpcs'
  | 'storyCastFull' | 'storyPlan' | 'trainableStats' | 'unanswered' | 'whereabouts' | 'xp';
export type GmState = { [K in GmStateKey]?: any };
export type GmBodyKey =
  | 'action' | 'closeTalk' | 'combat' | 'debug' | 'diceResult' | 'genre' | 'hero' | 'history' | 'initialEquipment'
  | 'interfere' | 'keyFacts' | 'memory' | 'mode' | 'monsters' | 'movementAllowed' | 'npc' | 'phase'
  | 'previousChoices' | 'prologue' | 'prompt' | 'recentCheck' | 'reroll' | 'ruleEquipment' | 'sceneText' | 'talkTurns'
  | 'talkPurpose' | 'withThisNpc';
export type GmBody = { [K in GmBodyKey]?: any } & { state?: GmState };
