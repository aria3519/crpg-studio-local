// The writers' (Terra) prompts for /api/gm: the scene writer and the talk writer, each with the material it gets.
// route.ts streams what they write to the player; the bookkeeping model then fills the game's fields from it.
import type { GmBody, GmState } from '../../../_lib/game/gm-contract';
import { alignEngineRules } from '../../../_lib/engine-rules';
import type { Profile } from './speech';

type SceneCtx = { body: GmBody; state: GmState; userContent: () => string; recent: string[]; wild: boolean; early: boolean; keyFacts: string[]; storySoFar: string };
type TalkCtx = {
  body: GmBody; state: GmState; profiles: Profile[]; partner: string; talkTurns: number; recent: string[]; storySoFar: string;
  playerVoice: string; lastReply: boolean; withThisNpc: string[]; keyFacts: string[];
};
export function sceneWriter(c: SceneCtx) {
  const { userContent, state, body, recent, wild, early, keyFacts, storySoFar } = c;
    const u = JSON.parse(userContent());
    const cv = (state.characterValues || {}) as Record<string, unknown>;
    const statNames = new Map<string, string>((Array.isArray(state.trainableStats) ? state.trainableStats : []).map((t: { id?: unknown; name?: unknown }) => [String(t?.id || ''), String(t?.name || '')]));
    const abilities = Object.entries(cv).filter(([, v]) => v !== '' && Number.isFinite(Number(v))).map(([k]) => statNames.get(k) ? `${k}(${statNames.get(k)})` : k);
    // Who is physically here and who isn't: given one list, Terra brought 카시아 and a dock worker along from 사레타 to 그림우드.
    const card = (n: Record<string, unknown>) => ({ name: n.name, profile: n.profile, remembers: n.remembers, attitude: n.attitude, speechStyle: n.speechStyle });
    const profileList: Record<string, unknown>[] = Array.isArray(state.npcProfiles) ? state.npcProfiles : [];
    const presentPeople = profileList.filter(n => n.inScene || n.inParty).map(card);
    const awayPeople = profileList.filter(n => !n.inScene && !n.inParty).map(card);
    const events = [
      ...(body.interfere === true ? ['주인공과 적대하는 세력이 지금 하는 일을 방해합니다'] : []),
    ];
    // How long a scene runs is the game's call, from what it knows is coming: the player's own moments that change what comes
    // next (a risky attempt's outcome) are written out; arriving and plain
    // situation are kept short (user, 2026-11-10: skip plain description, tell future-changing moments and decisions well).
    const arrived = String(body.action || '').startsWith('시스템이 이동을 확정');
    const length = body.diceResult ? '1,000~1,800자. 앞으로를 바꾸는 순간입니다: 무엇이 걸렸는지, 인물들이 어떻게 움직이고 반응하는지, 주인공의 선택이 무엇을 바꿨는지를 장면으로 보여 줍니다.'
      : arrived ? '400자 안팎. 도착은 짧게 넘기고, 그곳에서 지금 벌어지고 있는 일 하나에 바로 닿습니다.'
      : '300~600자. 주인공의 행동과 그 결과를 보여 주고, 단순한 상황 설명은 건너뜁니다.';
    const scene = {
      playerAction: body.action, ...(body.fromTalk ? { justTalkedWith: String(body.fromTalk).slice(0, 40) } : {}), ...(events.length ? { mustHappen: events } : {}), length, diceResult: body.diceResult || null, keyFacts, storySoFar, recentHistory: recent,
      now: { story: String(state.storyPlan || '').slice(0, 1500), location: state.locationName || '', mapPin: state.mapPin || '', nearby: Array.isArray(state.adjacentLocations) ? state.adjacentLocations.filter((l: { kind?: unknown }) => l?.kind !== 'event').map((l: { name?: unknown }) => l?.name) : [],
        event: state.event || '', placeSeed: state.placeSeed || '', localStories: Array.isArray(state.localStories) ? state.localStories.slice(0, 4) : [], directorNotes: state.directorNotes || null, unanswered: Array.isArray(state.unanswered) ? state.unanswered.slice(0, 4) : [], whereabouts: Array.isArray(state.whereabouts) ? state.whereabouts.slice(0, 24) : [], currentGoal: state.currentGoal || '', goalPath: Array.isArray(state.goalPath) ? state.goalPath.slice(0, 8) : [], otherStories: state.quests || [],
        hp: state.hp, maxHp: state.maxHp, gold: state.gold, inventory: state.inventory || [], party: state.party || [], level: state.level, reputationRank: state.reputationRank || '',
        ...(arrived ? { justArrived: true } : {}), presentPeople, awayPeople, cast: Array.isArray(state.cast) && state.cast.length ? state.cast.slice(0, 30) : state.knownNpcs || [], reservedNpcs: state.reservedNpcs || [], ...(state.storyCastFull === true ? { storyCastFull: true } : {}), monsters: wild ? (Array.isArray(state.monsters) ? state.monsters : []).filter((m: { boss?: unknown }) => !m?.boss).map((m: { name?: unknown; desc?: unknown }) => String(m?.name || '') + ': ' + String(m?.desc || '').slice(0, 60)) : [], abilities, safePlace: state.safePlace === true },
    };
    const writer = [
      '당신은 한국어 TRPG 테이블의 게임 마스터(사회자)입니다. 플레이어와 마주 앉아 장면을 말로 들려주듯 씁니다: 하십시오체 구어("~합니다", "~입니다")로, 눈앞에 펼쳐지는 일을 차례로 짚어 줍니다. 세계관과 지금까지의 이야기를 이어 다음 장면 하나를 씁니다. 이 이야기의 주인공은 플레이어 캐릭터이고, now.story가 이 이야기의 설계도입니다(주인공이 원하는 것과 짊어진 것, 주인공과 얽힌 인물들). 다음에 무슨 일이 일어날지는 당신이 정합니다. 이 게임에서 장면은 독자가 눈으로 따라가는 이야기입니다: 누가 무엇을 하고 무슨 일이 벌어지는지를 씁니다. 독자는 이 글을 화면 아래 글상자에서 두세 문장씩 넘기며 읽습니다. 돈·보상·시간 같은 상태 변화는 게임 화면이 보여 줍니다. 사람과 주고받는 말은 대화창이 맡습니다. playerAction은 이번 장면에서 실제로 해내고, 그 일이 끝날 때까지 이어집니다(맡으면 이미 그 일 한가운데에 있습니다. 대련은 이기거나 질 때까지, 시험은 붙거나 떨어질 때까지, 수색은 찾아내거나 허탕 칠 때까지). 장면은 그 일의 결말, 그 결말로 달라진 것, 그 결말에서 생긴 다음 갈림길 순서로 이어집니다. 플레이어 캐릭터는 "당신"이라고 부릅니다.',
      '이번 장면의 분량은 length를 따릅니다. 기다림·잡일·준비처럼 결과만 중요한 구간은 두세 문장으로 시간을 건너뛰어("해 질 무렵까지 창고를 지킨 끝에…", "사흘 뒤…") 다음 일이 벌어지는 순간에 바로 닿습니다. 벌어진 일은 눈에 보이고 들리게 씁니다: 사람들이 하는 일, 그 자리의 모습, 주인공의 손에 닿는 것. 문장은 짧게 끊어, 한 문장에 한 가지 일만 담습니다. 첫 줄은 【장소 · 때】입니다(장소는 지금 이야기 속 위치).',
      '장면을 움직이는 것은 사람입니다. now.story의 인물과 now.cast에서 이 자리에 어울리는 사람이 자기 목적대로 먼저 움직입니다(다가오기, 막아서기, 뒤를 밟기, 무언가를 숨기거나 빼앗기). 주인공의 행동은 무언가를 얻거나 잃게 하고(신뢰, 정보, 돈, 상처, 적, 평판), 그 결과가 다음 일을 부릅니다. 위기는 기회로, 작은 일은 더 큰 일로 이어집니다. 수수께끼는 답을 하나씩 내놓으며 더 큰 질문으로 이어 갑니다.',
      '자료: now.presentPeople은 지금 이 자리에 있는 사람(동료 포함), now.awayPeople은 다른 곳에 있는 사람, now.whereabouts는 아직 무대에 없는 이야기 속 인물이 지금 있는 곳("이름: 장소")이며, justArrived면 동료만 함께 왔습니다. remembers·attitude·speechStyle은 그 사람의 기억·태도·말투입니다. placeSeed·localStories는 이 장소에서 벌어지는 일, directorNotes.fixes는 앞선 장면에서 어긋난 점(맞는 쪽으로 이어 씁니다), directorNotes.threads는 아직 끝나지 않은 곁가지, unanswered는 주인공이 한 일 중 세상이 아직 반응하지 않은 것(흐름에 맞을 때 누가 찾아오거나 소식이 닿게 합니다), mustHappen은 이번 장면에서 일어나는 일, justTalkedWith가 있으면 주인공이 방금 그 사람과 대화창에서 할 이야기를 마쳤고 playerAction은 그 대화에서 정한 일입니다, currentGoal은 주인공이 지금 하는 일, goalPath는 그 일이 준비된 흐름(순서대로 "할 일 → 그때 벌어지는 일"; 주인공이 그 일을 해 나가면 이 흐름대로 벌어집니다), otherStories는 주인공이 벌여 둔 다른 일, keyFacts·storySoFar는 이미 일어난 일입니다. 새 인물이 필요하면 세계관에 맞는 이름의 여성으로 만듭니다. now.storyCastFull이면 이 이야기에 나올 사람은 이미 다 나왔고, 장면은 지금까지 만난 사람과 now.whereabouts의 사람으로 이어 갑니다.',
      '지킬 것 세 가지: 1) 세계관에서 [GM]으로 표시된 정보와 reservedNpcs는 아직 무대 밖에 있고, 비밀과 결말은 사건을 통해 조금씩 드러납니다. 2) 돈은 now.gold 안에서, 물건은 now.inventory 안에서 씁니다. 3) 몬스터는 now.monsters의 이름 그대로 나오며, 덤벼드는 순간에서 장면을 멈춥니다(싸움은 게임이 진행합니다). 한 장면의 만남은 하나입니다: 사람을 만나는 장면이면 몬스터는 그다음 장면에, 몬스터가 덤벼드는 장면이면 새로 나서는 사람은 싸움이 끝난 뒤의 장면에 나옵니다.',
      'diceResult가 있으면 그 성공·실패를 반드시 따르고 약속된 결과(onSuccess/onFailure)를 실제로 일으킵니다. 실패해도 대가를 치르고 이야기는 나아갑니다.',
      '본문이 끝나면 줄을 바꿔 "---"만 쓴 줄을 둡니다. 주인공이 누군가와 말을 나누게 되는 순간(상대가 말을 걸어오거나, 주인공이 말을 꺼내거나, 신청·거래·보고·추궁하러 마주 섬)에 장면이 닿았다면 거기서 본문을 멈추고, "---" 아래에 "[대화: 이름]" 한 줄만 씁니다(이름은 now.presentPeople·now.cast에 적힌 그대로). 대화는 그 사람의 대화창에서 이어집니다. 주인공이 지금 있는 곳을 떠나 다른 장소로 가려 하면 떠나는 모습까지만 쓰고, "---" 아래에 "[이동: 장소 이름]" 한 줄만 씁니다(now.nearby나 세계관에 나온 장소 이름 그대로). 가는 길과 도착은 게임이 지도에서 진행합니다. 그 밖에는 "---" 아래에 플레이어가 고를 다음 행동 3개를 "1. ", "2. ", "3. "으로 한 줄씩 씁니다. 셋은 각각 고르면 결과가 나는 결정입니다: 무엇을 해서 무엇을 얻거나 잃는지가 한 문장에 드러납니다(예: 기사와 대련해 실력을 증명한다). 셋은 서로 다른 길입니다: 1 now.currentGoal을 향해 goalPath에서 아직 하지 않은 첫 일로 바로 나아가기(currentGoal이 없으면 정면으로 맞서거나 밀어붙이기), 2 사람을 움직이기(now.presentPeople의 누군가에게 ' + (Number(state.gold ?? 1) <= 0 ? '묻거나, 부탁하거나, 속이기' : '묻거나 거래하거나 속이거나 도움을 청하기') + ', 이 자리에 아무도 없으면 now.whereabouts의 인물을 그가 있는 곳으로 찾아가기), 3 아무도 예상 못 한 수. 주어 없이 지금 바로 하는 행동을 "~한다"로 끝나는 한 문장으로 씁니다(다짐이나 계획이 아니라 실제 행동). 휴식·회복 행동은 넣지 않습니다.',
      ...(body.recentCheck === true || body.diceResult ? [] : ['playerAction이 성공할 수도 실패할 수도 있고, 어느 쪽이냐에 따라 주인공이 얻거나 잃는 것이 달라지는 일이면, 본문 없이 "---" 한 줄과 그 아래 "[판정: 능력치id | 무게 | 시도하는 일 | 성공하면 … | 실패하면 …]" 한 줄만 씁니다(시도와 결과는 주사위를 굴린 뒤 한 장면으로 씁니다). 능력치id는 now.abilities의 괄호 앞 id 중 하나, 무게는 이 시도에 걸린 것의 크기로 작음(얻을 것도 잃을 것도 적은 일상의 시도)·보통(일이 어느 쪽으로 갈릴지 정해지는 시도)·큼(위험하거나 얻는 것이 큰 시도)·결정적(이야기의 갈림길) 중 하나입니다. 난이도와 경험치·골드·명성·피해는 게임이 무게로 정하니, 성공하면·실패하면에는 그 일이 끝났을 때의 이야기 속 결과만 씁니다. 이동·대화·둘러보기에는 판정을 걸지 않고, 몬스터와 싸우는 행동은 판정이 아니라 습격입니다.']),
      '모든 글은 자연스러운 한국어로만 씁니다.',
      '세계관(제작자 프롬프트):\n' + alignEngineRules(String(body.prompt || '')).slice(0, 7000),
      ...(early && String(body.prologue || '').trim() ? ['게임 프롤로그(이미 일어난 일, 다시 설명하지 않음):\n' + String(body.prologue).slice(0, 3000)] : []),
    ].join('\n\n');
  return { writer, input: scene };
}

export function talkWriter(c: TalkCtx) {
  const { profiles, partner, talkTurns, body, state, recent, storySoFar, playerVoice, lastReply, withThisNpc, keyFacts } = c;
    const me = profiles.find(p => p?.name === partner) || { name: partner };
    const opening = talkTurns === 0;
    const talk = {
      partner: { name: partner, profile: me.profile, remembers: (me as { remembers?: unknown }).remembers, attitude: (me as { attitude?: unknown }).attitude, speechStyle: me.speechStyle || '' },
      hero: { story: String(body.hero || '').slice(0, 1500), sheet: state.characterValues || {}, level: state.level, reputationRank: state.reputationRank || '' },
      purpose: String(body.talkPurpose || '').slice(0, 300), playerSaid: body.action, talkSoFar: recent.slice(-14), withThisNpc, keyFacts, storySoFar: storySoFar.slice(0, 4000),
      now: { story: String(state.storyPlan || '').slice(0, 1200), location: state.locationName || '', currentGoal: state.currentGoal || '', goalPath: Array.isArray(state.goalPath) ? state.goalPath.slice(0, 8) : [], gold: state.gold, inventory: state.inventory || [], party: state.party || [], reservedNpcs: state.reservedNpcs || [] },
    };
    const writer = [
      `당신은 한국어 CRPG의 대화를 씁니다. 주인공(플레이어)과 ${partner}가 마주 보고 이야기하는 메신저식 대화창이고, 당신은 ${partner}의 대답을 씁니다.`,
      `자료: partner는 ${partner}의 설정(profile), 주인공에 대한 기억(remembers), 지금 태도(attitude), 말투(speechStyle)입니다. hero는 주인공입니다: story는 주인공이 누구이고 어디서 왔는지(프롤로그), sheet는 능력치와 신분, level과 reputationRank는 성장과 이름값입니다. purpose는 주인공이 이 대화를 시작한 까닭, playerSaid는 주인공이 방금 한 말이나 행동, talkSoFar는 최근에 오간 말, withThisNpc는 두 사람 사이에 전에 있었던 일, now.story·storySoFar·keyFacts는 지금까지의 이야기입니다. now.goalPath는 주인공의 지금 목표(now.currentGoal)를 두고 정해져 있는 일(순서대로 "할 일 → 그때 벌어지는 일")로, ${partner}가 아는 사정이자 앞으로 할 일입니다.`,
      `${partner}의 대답은 주인공이 방금 한 말(playerSaid)에 대한 반응입니다: 그 말의 내용과 태도를 듣고, 자기 성격과 사정대로 답하거나 받아치거나 되묻습니다. 정해진 일은 대화가 그쪽에 닿을 때 ${partner}가 자기 말로 꺼냅니다. ${partner}는 자기 목적과 사정을 가진 사람입니다. 매 대답에서 새 정보, 조건, 요구, 감정 중 하나를 내놓아 이야기를 앞으로 밀고, 이미 한 말은 되풀이하지 않습니다. 말투는 speechStyle 그대로(어체·어미·버릇), 태도는 attitude에 맞는 실제 대답(숨기기, 값 올리기, 먼저 돕기)으로 드러납니다. ${partner}는 직접 보거나 들은 것만 알고, 지금 이 자리(now.location)에서 말합니다.`,
      `형식: ${partner}의 말을 1~3줄로 씁니다. 한 줄이 말풍선 하나이고, 따옴표와 이름표 없이 말만 씁니다. 표정이나 몸짓이 필요하면 첫 줄 맨 앞에 (괄호)로 짧게 씁니다.${opening ? ` 이번은 대화의 첫마디입니다: purpose를 보고 ${partner}가 먼저 반응합니다.` : ''}`,
      `말이 끝나면 "---"만 쓴 줄을 두고, 그 아래에 셋 중 하나를 씁니다. (가) 주인공이 이번 말로 무엇을 하겠다고 스스로 정했으면(받아들임, 나서겠다고 함, 어디로 가겠다고 함): "[대화 끝: 그 행동]" 한 줄. 행동은 주인공이 맡거나 하기로 정한 일 그 자체이고, 그 일을 하러 갈 곳이 있으면 그곳으로 가는 것까지 담아 주어 없이 "~한다"로 끝나는 한 문장으로 씁니다(예: 늑대 무리를 처리하러 개척지로 간다). (나) 그 밖에 대화가 끝났으면(${partner}가 할 일·갈 곳·기다릴 곳을 정해 줌, 작별, 거절하고 돌아섬, 볼일이 있어 떠남): "[대화 끝]" 한 줄과, 그 아래에 대화가 끝난 뒤 주인공이 고를 행동 3개를 "1. ", "2. ", "3. "으로 한 줄씩. 셋은 서로 다른 방향의 결정입니다: 1 ${partner}가 정해 준 일을 하거나 이야기를 앞으로 미는 행동, 2 다른 방법으로 자기 뜻을 밀어붙이는 행동, 3 아무도 예상 못 한 수. 주어 없이 "~한다"로 끝나는 한 문장입니다. (다) 그 밖에는 주인공이 이어서 할 말 3개를 "1. ", "2. ", "3. "으로 한 줄씩 씁니다. 셋은 모두 ${partner}가 방금 한 말에 대한 주인공의 대답입니다: ${partner}가 물었으면 hero에 맞게 실제로 답하고, 요구했으면 응하거나 버팁니다. 셋은 대답의 방향으로 나뉩니다: 1 응함, 2 조건·흥정·의심, 3 거절하거나 물러남. 주인공이 입 밖에 내는 말 그대로 씁니다. ${playerVoice}`,
      ...(opening ? ['첫마디에서는 (다)를 씁니다.'] : lastReply ? [`이번이 이 대화의 마지막 대답입니다: ${partner}는 짧게 답하고 마무리하며, "---" 아래는 (가)나 (나)입니다.`] : []),
      '모든 글은 자연스러운 한국어로만 씁니다.',
      '세계관(제작자 프롬프트):\n' + alignEngineRules(String(body.prompt || '')).slice(0, 5000),
    ].join('\n\n');
  return { writer, input: talk };
}
