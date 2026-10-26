// 10개 기본 규칙의 "소관(쓸 것/쓰지 말 것)"과 분량을 한 곳에서 관리한다.
// 분량은 목표 예시 프롬프트(약 6,400자)의 항목별 비율을 기준으로 잡았다.
// 합계: 최소 ≈ 4,880자, 목표 ≈ 5,550자, 최대 ≈ 6,660자 (+ 제목 줄 약 150자) → 최종 5,000~6,800자.

export const TOTAL_MIN = 5000;
export const TOTAL_TARGET_MAX = 6000;
export const TOTAL_HARD_MAX = 7000;

export type SectionSpec = { min: number; target: number; max: number; write: string; avoid: string };

export const SPEC: Record<string, SectionSpec> = {
 role: { min: 310, target: 350, max: 420,
  write: 'GM의 역할과 주인공 대리 금지(대사·행동·생각·결정을 쓰지 않음), 장면 단위 진행과 멈추는 지점, 한 응답의 본문 분량과 첫 줄 형식, 문체와 말투, choices 사용 규칙, 괄호 ( ) 입력 처리.',
  avoid: '세계관·세력·장소, 판정 수치, NPC 태도·호감도, 플래그 기록, 실패·사망 처리.' },
 world: { min: 350, target: 400, max: 480,
  write: '시대와 현재 상황을 만든 역사적 계기 한두 문장, 세력 목록과 각 세력의 이해관계, 무대가 되는 도시와 주요 장소 이름(장소마다 한 구절), 통화 단위와 대표 물가 두세 개.',
  avoid: '주인공 설정, 사건 전개, 인물 소개, 진행 규칙.' },
 player: { min: 265, target: 300, max: 360,
  write: '주인공의 신분·출신 범위와 시작 실력, 소속이 정해지지 않았을 때 묻는 절차, 시작 장소, 즉시 실행할 첫 임무, 명령·임무를 어겼을 때의 결과.',
  avoid: '시작 소지품 목록(성장 항목 소관), 세계관 재설명, 판정 규칙.' },
 flow: { min: 440, target: 500, max: 600,
  write: '이동과 장소별 차별화, 장기 기록 플래그의 분류 목록과 "분류:내용" 예시, 소지품·재물 갱신 규칙, 이미지 키 사용 규칙, NPC·설정 정합성 유지, 불가능한 행동 처리, 치명상·사망·구출 처리.',
  avoid: '판정 DC·피해 수치, NPC 호감 규칙, 세계관.' },
 combat: { min: 370, target: 420, max: 500,
  write: '판정을 요청하는 조건, 주사위(D20 등)와 능력치 종류, 난이도 수치, 실력 차이 보정, 전투 라운드 진행, 피해 수치(hpDelta), 적의 후퇴·항복, 장르와 세력에 맞는 기술의 색.',
  avoid: '사망·구출 처리(진행 항목 소관), 성장 단계, 회복 아이템 설명.' },
 npc: { min: 1100, target: 1250, max: 1500,
  write: '고유 인물 목록(이름·나이·성별·소속/직책·특징·목적·비밀)과 NPC 관계 규칙(첫 태도, 호감·신뢰의 내부 관리, 도움의 조건, 은원, 연정, 관계 플래그).',
  avoid: '사건 전개 서술, 세계관 재설명.' },
 quests: { min: 880, target: 1000, max: 1200,
  write: '막(단계) 구조의 메인 사건: 각 사건의 발동 조건→징조→전개→분기와 결과, 막을 넘기는 조건, 대사건 플래그. 이어서 의뢰 목록과 관계가 깊어지면 찾아오는 인연 사건.',
  avoid: '인물 소개 재서술, 돌발 사건·기연, 성장 규칙.' },
 events: { min: 700, target: 800, max: 960,
  write: '돌발 사건 목록(발생 상황, 1회성, 사건 플래그)과 기연 목록(단서→장소→시험→보상/대가, 단계 플래그, 거절 가능).',
  avoid: '메인 사건을 이름만 바꿔 다시 쓰기, 인물 소개, 세계관 재설명.' },
 growth: { min: 245, target: 280, max: 340,
  write: '실력 단계 이름 순서, 성장이 일어나는 조건과 기록, 평판·별호, 마지막에 시작 소지품을 "이름: 설명" 형태로 한 줄씩.',
  avoid: '화폐 단위·물가(세계관 소관), 전투 피해 수치, 사건 재서술.' },
 goal: { min: 220, target: 250, max: 300,
  write: '최종 목표와 완료 조건(진행도형이면 단계별 검증 가능한 성공 조건), 부분 성공과 실패의 결말, 결말 이후 이야기가 이어지는지.',
  avoid: '메인 사건 재서술, 호감도 같은 획일 수치 조건.' },
};

export const SECTION_ORDER = ['role','world','player','flow','combat','npc','quests','events','growth','goal'] as const;

export function ownershipMap(current: string) {
 return SECTION_ORDER.filter(id => id !== current).map(id => `${id}: ${SPEC[id].write}`).join('\n');
}

// ---------- 중복 탐지 (문자 2-gram 포함률) ----------
// 예시 프롬프트에서 0.42는 오탐 1건, 한국어 바꿔쓰기('호의적이지 않다'↔'처음엔 호의적이지 않고')는 잡아낸다.
const STRIP = /[\s.,·:;'"“”‘’()\[\]【】<>—–\-/!?…~]/g;
export function sentences(text: string): string[] {
 return text.split(/(?<=[.!?。])\s+|\n+|\s\/\s/).map(s => s.trim()).filter(s => s.replace(STRIP, '').length >= 14);
}
function grams(s: string) {
 const c = s.replace(STRIP, '');
 const g = new Set<string>();
 for (let i = 0; i + 2 <= c.length; i++) g.add(c.slice(i, i + 2));
 return g;
}
function containment(a: Set<string>, b: Set<string>) {
 if (!a.size) return 0;
 let hit = 0; for (const x of a) if (b.has(x)) hit++;
 return hit / a.size;
}
/** text 안에서 priors(다른 항목) 또는 text 자신의 앞 문장과 내용이 겹치는 문장을 돌려준다. */
export function findDuplicates(text: string, priors: string[], threshold = 0.42): string[] {
 const prior = priors.flatMap(sentences).map(grams).filter(g => g.size >= 10);
 const own = sentences(text);
 const seen: Set<string>[] = [];
 const dups: string[] = [];
 for (const s of own) {
  const g = grams(s);
  if (g.size >= 10 && (prior.some(p => containment(g, p) >= threshold) || seen.some(p => containment(g, p) >= threshold))) dups.push(s);
  seen.push(g);
 }
 return dups;
}

// ---------- 분량·중복 보정 ----------
export type Call = (messages: { role: string; content: string }[], maxTokens: number, timeoutMs?: number) => Promise<Record<string, unknown>>;

function score(text: string, min: number, max: number, dups: number) {
 const n = text.length;
 const off = n < min ? min - n : n > max ? n - max : 0;
 return off + dups * 120;
}
export const tokensFor = (chars: number) => Math.ceil(chars * 1.4) + 300;

/**
 * 초안을 [min,max] 분량에 맞추고 다른 항목과 겹치는 문장을 없앤다.
 * 실제 글자 수를 측정해 모델에게 되돌려 주는 방식이라, 모델이 글자 수를 잘못 세는 문제를 보정한다.
 */
export async function fitText(opts: {
 text: string; min: number; max: number; priors: string[]; call: Call; context: string; deadline: number; rounds?: number;
}): Promise<string> {
 const { min, max, priors, call, context, deadline } = opts;
 let best = opts.text.trim();
 let bestDups = findDuplicates(best, priors);
 let bestScore = score(best, min, max, bestDups.length);
 for (let round = 0; round < (opts.rounds ?? 2); round++) {
  if (bestScore === 0 || Date.now() > deadline - 25000) break;
  const n = best.length;
  const target = Math.round((min + max) / 2);
  const lengthNote = n > max ? `현재 ${n}자로 너무 길다. 공백 포함 ${min}~${max}자(약 ${target}자)로 줄인다. 수식어·예시 나열·다른 항목 소관 내용을 먼저 덜어내고 고유 사실과 수치는 남긴다.`
   : n < min ? `현재 ${n}자로 너무 짧다. 공백 포함 ${min}~${max}자(약 ${target}자)로 늘린다. 이번 항목 소관의 구체적 조건·결과·고유명사를 추가하고 같은 말을 반복하지 않는다.`
   : `분량(${n}자)은 적당하다. ${min}~${max}자를 유지한다.`;
  const dupNote = bestDups.length ? `\n다음 문장은 다른 항목이나 같은 글 안에 이미 있는 내용이다. 삭제하거나 이번 항목에만 필요한 새 정보로 바꾼다:\n- ${bestDups.slice(0, 12).join('\n- ')}` : '';
  try {
   const parsed = await call([
    { role: 'system', content: `너는 한국어 CRPG 시스템 프롬프트 편집자다. 주어진 초안의 설정·고유명사·수치를 바꾸지 않고 분량과 중복만 고친다. 제목·번호·머리말 없이 본문만 쓴다. JSON {"text":"고친 본문"}만 출력한다.\n${context}` },
    { role: 'user', content: `${lengthNote}${dupNote}\n\n[초안]\n${best}` },
   ], tokensFor(max), Math.max(15000, Math.min(45000, deadline - Date.now() - 5000)));
   const cand = clean(String(parsed.text || ''));
   if (cand.length < 60) continue;
   const d = findDuplicates(cand, priors);
   const sc = score(cand, min, max, d.length);
   if (sc < bestScore) { best = cand; bestDups = d; bestScore = sc; }
  } catch { break; }
 }
 // 마지막 안전장치: 남은 중복 문장은 다른 곳에 이미 있으므로 길이가 넘칠 때만 기계적으로 뺀다.
 if (best.length > max && bestDups.length) {
  let t = best;
  for (const s of findDuplicates(best, priors, 0.6)) { if (t.length <= max) break; t = t.replace(s, '').replace(/\s{2,}/g, ' ').trim(); }
  if (t.length >= min) best = t;
 }
 return best;
}

export function clean(s: string) {
 return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').replace(/^[\s"']+|[\s"']+$/g, '').replace(/(?:\s*[}\]]\s*){3,}$/g, '').replace(/^#\s*\[[^\]]+\]\s*/, '').trim();
}
