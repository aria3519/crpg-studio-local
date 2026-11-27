// The genre base prompts were written for an older engine. Several of their rules now contradict what the game code does
// (choice count, reply length, combat, death, hidden affection, check ability ids), and the GM tried to obey both.
// Each entry rewrites one outdated sentence into the current rule. Used on the reference data and, at request time,
// on prompts of games created before the fix.
// What a lost fight does (core.ts defeatCost, page.tsx finishBattle): the game picks the outcome, the scene only tells it.
export const DEATH_RULE = '사망: 이 게임에 죽음은 없다. 싸움에서 져 쓰러지면 게임이 정한다: 신의 구원으로 더 강해져 다시 일어나거나, 시간이 마지막 기록 지점으로 되돌아간다(기록 지점이 없으면 빈사(HP 1)로 깨어난다).';
const ALIGNMENTS: [RegExp, string][] = [
  // Scenes are the progress log and talk happens in the talk window; this earlier length sentence asked scenes for long dialogue.
  [/본문 길이는 장면의 무게를 따른다\. 이동·기다림·잡일·준비처럼 결과만 중요한 구간은 두세 문장으로 건너뛰어 다음 중요한 순간에 바로 닿고, 대결·폭로·결심·거래·중요한 대화처럼 이야기가 움직이는 순간은 1,500~2,500자로 길게, 인물의 대사와 반응, 속마음, 감각 묘사를 충분히 담아 쓴다\. 같은 내용을 되풀이하지 않는다\./g, '본문은 진행기록이다: 상황, 행동과 결과, 벌어진 사건, 달라진 것을 서술로 쓰고, 인물과 주고받는 말은 대화 모드에서 쓴다. 이동·기다림·잡일·준비처럼 결과만 중요한 구간은 두세 문장으로 건너뛰고, 벌어진 일은 감각과 움직임으로 구체적으로 쓴다. 같은 내용을 되풀이하지 않는다.'],
  [/본문은 500~1,000자, 첫 줄은 【장소 · 때\(아침\/낮\/저녁\/밤\)】로 시작한다\./g, '본문은 진행기록이다: 상황, 행동과 결과, 벌어진 사건, 달라진 것을 서술로 쓰고, 인물과 주고받는 말은 대화 모드에서 쓴다. 이동·기다림·잡일·준비처럼 결과만 중요한 구간은 두세 문장으로 건너뛰고, 벌어진 일은 감각과 움직임으로 구체적으로 쓴다. 같은 내용을 되풀이하지 않는다. 일반 장면의 첫 줄은 【장소 · 때(아침/낮/저녁/밤)】로 시작한다(대화 모드는 예외).'],
  // The 200~500자 cap made every scene three or four sentences; scenes are full again.
  [/본문은 200~500자로 짧고 밀도 있게 쓰며 같은 내용을 되풀이하지 않는다\./g, '본문은 진행기록이다: 상황, 행동과 결과, 벌어진 사건, 달라진 것을 서술로 쓰고, 인물과 주고받는 말은 대화 모드에서 쓴다. 이동·기다림·잡일·준비처럼 결과만 중요한 구간은 두세 문장으로 건너뛰고, 벌어진 일은 감각과 움직임으로 구체적으로 쓴다. 같은 내용을 되풀이하지 않는다.'],
  // A fixed length made chores as long as climaxes; length now follows how much the scene matters.
  [/본문은 600~1,000자로 쓴다\. 인물의 대사와 반응, 감각 묘사, 상황의 변화를 한 장면 안에 충분히 담고 같은 내용을 되풀이하지 않는다\./g, '본문은 진행기록이다: 상황, 행동과 결과, 벌어진 사건, 달라진 것을 서술로 쓰고, 인물과 주고받는 말은 대화 모드에서 쓴다. 이동·기다림·잡일·준비처럼 결과만 중요한 구간은 두세 문장으로 건너뛰고, 벌어진 일은 감각과 움직임으로 구체적으로 쓴다. 같은 내용을 되풀이하지 않는다.'],
  [/선택지는 choices에만 정확히 3개 넣고 /g, '선택지는 choices에만 넣고 '],
  [/기록: 최근 대화는 12줄만 전달된다\. /g, '기록: 오래된 일은 요약과 인물별 기억으로 전달된다. '],
  [/전투: 한 응답에 한 라운드만 묘사하고 적의 움직임과 빈틈을 보여준 뒤 멈춘다\. 피해는 hpDelta로 일반 타격 -5~-15, 큰 상처 -20 이상이다\. /g, '전투: 명중·피해·HP는 게임 코드가 계산하고 GM은 그 결과를 묘사한다. '],
  // Every death rule, whatever its wording, up to the next 'label:' or the line end (user 2026-11-26: 아스테른's "HP가 0이 되면
  // 죽음이며 게임이 끝난다" slipped past a one-wording pattern, and the writer declared the hero dead after a lost fight).
  [/사망: [^\n]*?(?=\s[^\s:]{1,8}: |\n|$)/g, DEATH_RULE],
  [/호감·신뢰는 내부에서 관리하고 수치는 공개하지 않는다\./g, '호감도(-100~100)와 명성은 게임이 수치로 관리한다.'],
  [/ability는 external\([^)]*\), agility\([^)]*\), insight\([^)]*\) 중 하나다\./g, 'ability는 currentState.characterValues에 있는 능력치 id 중 하나다.'],
];

export const alignEngineRules = (prompt: string) => ALIGNMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), prompt);
