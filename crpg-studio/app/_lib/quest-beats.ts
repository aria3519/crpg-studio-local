// How a quest step gets done: a short list of beats, in order, each one something the game itself can see happen.
// The code alone decides when a beat happens (a talk with the right person, a fight won in the battle engine,
// standing at a place, a choice clicked); the GM is only told what to narrate when it does. Nothing the GM writes,
// flags or reports moves a main or regional quest.
//   talk    the player talks with npc (talk mode), at a place if given. then: what the npc says or does. pay: gold the npc
//           asks first; the beat waits for the player to offer it and the game takes it (core.ts dueBeat). accept: the line
//           that carries it out, knowing only what the player has heard so far; without it the GM route writes one.
//   defeat  the player beats foe in the battle engine, at a place if given. The game brings the foe on there.
//   reach   the player is at the place. then: what they find on arriving.
//   search  the player does something at the place (an action, not just arriving). then: what turns up.
//   choose  the player picks one of options (shown as the choices). then: what follows, whichever was picked.
// at lists words of the place (a map pin like 그림우드, or a place in a city like 북문 초소); any one matching counts.
export type Beat =
  | { do: 'talk'; npc: string; at?: string[]; accept?: string; pay?: number; then: string }
  // lose: a duel with a person the hero may lose (a bout, HP 1): what follows then, from who they are. Either outcome moves the story.
  // with: the cast members the step puts at its place (카시아 in the 진흙 골목 store): they are there while it waits.
  | { do: 'defeat'; foe: string; at?: string[]; then: string; lose?: string; with?: string[] }
  | { do: 'reach'; at: string[]; then: string; with?: string[] }
  | { do: 'search'; at: string[]; then: string; with?: string[] }
  | { do: 'choose'; options: string[]; then: string };

// What the player has to do next, in words for the GM and the quest log.
export const beatGoal = (b: Beat): string => {
  const where = 'at' in b && b.at?.length ? b.at[0] : '';
  switch (b.do) {
    case 'talk': return `${where ? `${where}에서 ` : ''}${b.npc}와(과) 이야기하기`;
    case 'defeat': return `${where ? `${where}에서 ` : ''}${b.foe} 쓰러뜨리기`;
    case 'reach': return `${where}(으)로 가기`;
    case 'search': return `${where}에서 살펴보기`;
    case 'choose': return `결정하기: ${b.options.join(' / ')}`;
  }
};
