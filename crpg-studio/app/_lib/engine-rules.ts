// The genre base prompts were written for an older engine. Several of their rules now contradict what the game code does
// (choice count, reply length, combat, death, hidden affection, check ability ids), and the GM tried to obey both.
// Each entry rewrites one outdated sentence into the current rule. Used on the reference data and, at request time,
// on prompts of games created before the fix.
const ALIGNMENTS: [RegExp, string][] = [
  [/본문은 500~1,000자, 첫 줄은 【장소 · 때\(아침\/낮\/저녁\/밤\)】로 시작한다\./g, '본문은 200~500자로 짧고 밀도 있게 쓰며 같은 내용을 되풀이하지 않는다. 일반 장면의 첫 줄은 【장소 · 때(아침/낮/저녁/밤)】로 시작한다(대화 모드는 예외).'],
  [/선택지는 choices에만 정확히 3개 넣고 /g, '선택지는 choices에만 넣고 '],
  [/기록: 최근 대화는 12줄만 전달된다\. /g, '기록: 오래된 일은 요약과 인물별 기억으로 전달된다. '],
  [/전투: 한 응답에 한 라운드만 묘사하고 적의 움직임과 빈틈을 보여준 뒤 멈춘다\. 피해는 hpDelta로 일반 타격 -5~-15, 큰 상처 -20 이상이다\. /g, '전투: 명중·피해·HP는 게임 코드가 계산하고 GM은 그 결과를 묘사한다. '],
  [/사망: 치명적 상황이 곧 죽음은 아니다\.[^\n]*?게임을 끝낸다\./g, '사망: 몬스터나 적대한 상대와의 싸움에서 HP가 0이 되면 죽음이며 게임이 끝난다. 플레이어가 먼저 건 평범한 다툼에서 지면 빈사(HP 1)로 살아남는다.'],
  [/호감·신뢰는 내부에서 관리하고 수치는 공개하지 않는다\./g, '호감도(-100~100)와 명성은 게임이 수치로 관리한다.'],
  [/ability는 external\([^)]*\), agility\([^)]*\), insight\([^)]*\) 중 하나다\./g, 'ability는 currentState.characterValues에 있는 능력치 id 중 하나다.'],
];

export const alignEngineRules = (prompt: string) => ALIGNMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), prompt);
