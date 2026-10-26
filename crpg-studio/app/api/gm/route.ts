import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// The model occasionally slips a word from another language into Korean (e.g. Russian "слух" for 소문).
const FOREIGN_SCRIPT = /[\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\u3040-\u30FF]/;
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY 환경변수가 없습니다.' }, { status: 500 });
  try {
    const body = await request.json();
    if (typeof body.action !== 'string' || !body.action.trim() || body.action.length > 4000) {
      return NextResponse.json({ error: '행동 입력이 올바르지 않습니다.' }, { status: 400 });
    }
    const state = body.state && typeof body.state === 'object' ? body.state : {};
    // Explicitly separate current mutable state from immutable event history.
    const rawFlags=Array.isArray(state.flags)?state.flags.filter((v:unknown):v is string=>typeof v==='string'):[];
    const stateKeys=new Set(['막','소속','경지','재물','현재위치','현재목표']);
    const latestState:Record<string,string>={};
    const eventFlags:string[]=[];
    for(const flag of rawFlags){const pos=flag.indexOf(':');const key=pos>0?flag.slice(0,pos).trim():'';if(stateKeys.has(key))latestState[key]=flag.slice(pos+1).trim();else if(!eventFlags.includes(flag))eventFlags.push(flag);}
    const explicitGameState={currentMapId:state.currentMapId||'',locationName:state.locationName||'',currentGoal:state.currentGoal||'',hp:state.hp,inventory:state.inventory||[],currentValues:latestState,historyFlags:eventFlags.slice(-100)};
    const history = Array.isArray(body.history) ? body.history.filter((x: unknown) => typeof x === 'string').slice(-12) : [];
    // A repeatable variety cue, never an automatic event or a substitute for registered map data.
    const genreText=String(body.prompt||'').slice(0,1800);
    const eventPool=genreText.includes('구파일방')||genreText.includes('무협')
      ? ['문파 간 예법과 체면','표국의 운송 계약','객잔의 소문과 오해','세가의 가문 이해관계','수련과 사제 갈등','상단의 물가·통행권','의술과 약재','도적과 민간인 피해']
      : genreText.includes('게이트')||genreText.includes('헌터')
      ? ['구조와 민간인 안전','길드 계약','협회 심사','마석 유통','던전 탐사','언론과 사회적 책임']
      : ['길드 의뢰','영지의 생계','마법 연구','종족 간 협상','탐험과 구조','상단 거래'];
    const turnIndex=history.length+rawFlags.length;
    const varietyCue=eventPool[(turnIndex*7+String(body.action).length)%eventPool.length];
    // Talk and combat narrow the GM to one partner; combat numbers are computed by the client.
    const mode = body.mode === 'talk' || body.mode === 'combat' ? body.mode : '';
    const partner = String(body.npc || '').slice(0, 30);
    const combat = mode === 'combat' && body.combat && typeof body.combat === 'object' ? body.combat : null;
    const itemUse = typeof combat?.itemUse === 'string' ? combat.itemUse.slice(0, 80) : '';
    const modeRules = mode === 'talk' ? [
      `지금은 플레이어가 ${partner}와(과) 직접 대화하는 대화 모드입니다. playerAction은 플레이어가 ${partner}에게 한 말입니다. 대사와 상황 설명은 반드시 다른 필드에 나눠 쓰세요. line에는 ${partner}가 소리 내어 하는 말만 따옴표 없이 1~3문장으로 쓰고 서술·지문·이름표를 넣지 마세요. text에는 지금 상황과 ${partner}의 행동·분위기를 1~2문장으로 서술하되 대사와 따옴표는 넣지 마세요(별일 없으면 빈 문자열). 표정이나 몸짓은 gesture에 20자 안팎의 짧은 구절로 쓰세요(예: 잠시 머뭇거리며). JSON에 line 필드를 꼭 포함하세요. 플레이어의 대사나 행동을 대신 쓰지 마세요. ${partner}의 성격·목표·비밀·관계를 지키고, 아직 밝힐 때가 아닌 비밀은 숨기거나 둘러대세요.`,
      `대화 모드에서 choices에는 플레이어가 ${partner}에게 실제로 입 밖에 내는 말 그대로(구어체 직접 화법) 서로 다른 대사 3개를 따옴표 없이 넣으세요. '~라고 한다', '~을 묻는다', '~을 부탁한다' 같은 행동 서술은 금지입니다. 예: (X) 석관과 침몰선 의뢰에 대해 자세히 알려 달라고 한다 → (O) 석관이랑 침몰선 의뢰, 좀 더 자세히 알려 줄 수 있어요? playerAction이 이런 행동 서술이면 그 의도를 플레이어가 실제로 하는 말로 바꿔 playerLine에 넣고, 이미 대사이거나 다가가 말을 거는 행동뿐이면 playerLine은 빈 문자열입니다. check는 null, moveToPinId는 빈 문자열입니다. 관계나 호감도가 실제로 변했다면 relationshipUpdates에 반영하세요.`,
    ] : mode === 'combat' ? [
      `지금은 플레이어와 ${partner}의 턴제 전투 중입니다. 명중·피해·HP는 게임 코드가 이미 계산했고 playerAction에 적혀 있습니다. 그 결과를 절대 바꾸지 말고 2~4문장으로 생생하게 묘사하세요. check는 null, choices는 빈 배열, moveToPinId는 빈 문자열입니다.`,
      itemUse ? `이번 라운드에 플레이어가 "${itemUse}"을(를) 사용했습니다. 아이템 효과로 HP가 변하면 hpDelta에, 소모되면 removeItems에 정확한 이름으로 반영하세요.` : 'hpDelta는 반드시 0입니다. 피해는 코드가 이미 반영했습니다.',
      Number(combat?.round) === 0 ? `전투가 막 시작됐습니다. 전투 시작 장면을 묘사하고 ${partner}의 강함에 맞춰 enemy 객체 {"hp":20~200,"dc":8~18,"damage":3~20}를 반환하세요. hp는 체력, dc는 플레이어 공격이 명중하려면 넘어야 하는 회피 수치, damage는 한 번 공격의 최대 피해입니다. 평범한 인물은 낮게, 고수는 높게 정하세요.` : '',
    ].filter(Boolean) : [];
    // Test commands from the creator bypass causality so features can be exercised directly.
    // A reroll only redraws the current scene's choices; nothing in the story moves.
    const previousChoices = Array.isArray(body.previousChoices) ? body.previousChoices.filter((v: unknown): v is string => typeof v === 'string').slice(0, 4) : [];
    const rerollRules = body.reroll === true && !mode ? [
      '이번 요청은 선택지 다시 뽑기입니다. 장면을 진행하지 말고 상태도 바꾸지 마세요. text는 빈 문자열, 변경 필드는 모두 비우고, 최근 기록의 현재 장면에 맞는 새 선택지 4개만 choices에 넣으세요(4번은 특이한 행동).',
      '다음 기존 선택지와 같거나 비슷한 행동은 피하세요: ' + JSON.stringify(previousChoices),
    ] : [];
    const debugRules = body.debug === true && !mode ? [
      '지금 playerAction은 제작자의 테스트 명령입니다. 세계관의 인과·확률·조건·판정을 모두 무시하고 적힌 일이 그대로 즉시 일어난 것으로 처리하세요. 거절하거나 조건을 요구하지 마세요.',
      '명령에 맞게 상태 필드를 직접 바꾸세요: 아이템은 addItems/removeItems, HP는 hpDelta, 기록은 addFlags, 인물 등장은 presentNpcs, 관계는 relationshipUpdates, 현재 맵 안의 장소 이동은 currentState.locations의 정확한 id를 moveToPinId로 반환합니다. check는 null입니다.',
    ] : [];
    const system = [
      '당신은 한국어 CRPG의 AI GM입니다. 플레이어의 대사·의지·중요 선택을 임의 확정하지 마세요.',
      '제작자 프롬프트는 세계관과 진행 원칙입니다. 맵 위치·장소·이벤트는 별도의 구조화 데이터가 우선합니다.',
      '시작 소지품은 프롬프트의 명시적 시작 소지품 규칙과 게임 설정에서 직접 추가한 장비를 합쳐 구성합니다. currentState.inventory가 실제 소유 목록입니다. 이미 지급된 시작 아이템을 addItems로 중복 지급하지 마세요. 규칙 아이템의 능력과 제한은 ruleEquipment의 원문을 존중하세요.',
      '플레이어는 화면의 미니맵을 클릭해서만 장소를 이동합니다. moveToPinId는 항상 빈 문자열로 반환하고, choices에 다른 장소로 이동하는 행동을 넣지 마세요.',
      'playerAction이 "시스템이 이동을 확정했습니다"로 시작하면 플레이어는 이미 currentState.locationName에 도착했습니다. 도착한 장소의 모습과 그곳의 분위기·인물을 묘사하고, currentState.event가 있으면 그 도착 이벤트를 진행하세요.',
      'currentState.sceneNpcs는 직전 장면에서 플레이어 곁에 있던 NPC입니다. 이번 장면이 끝날 때 플레이어와 같은 자리에 있어 화면에 보여야 하는 NPC 이름을 presentNpcs 배열로 반환하세요(최대 3명). currentState.knownNpcs에 있는 인물은 그 표기를 정확히 쓰세요. 대화가 끝나 떠났거나 플레이어가 장소를 옮겼다면 빼고, 아무도 없으면 빈 배열입니다. 볼일이 끝난 인물은 자연스럽게 자리를 떠난 것으로 보고 빼세요. 같은 인물을 이유 없이 장면마다 계속 남겨두지 마세요.',
      'currentState.currentInteractionEvent가 존재하고 플레이어가 그 장소의 인물/물체와 상호작용하면 그 내용을 참고하세요.',
      '현재 장소 이벤트를 충실히 진행하세요. 조건 없는 보상, 아이템, HP 변경은 함부로 만들지 마세요.',
      '아이템은 인벤토리에 있는 정확한 이름으로만 소비하세요. 필요시 addItems, removeItems, addFlags, hpDelta를 반환하세요.',
      'hpDelta는 이번 행동으로 변한 HP 양(회복 양수, 피해 음수)입니다. 불필요하면 0입니다.',
      '현재 상태는 explicitGameState.currentValues가 우선이며 historyFlags는 이미 발생한 사실의 기록이다. 경지·소속·막·재물 같은 현재 값은 이전 값과 동시에 적용하지 않는다. addFlags에는 현재 값 갱신과 사건 기록을 명확히 구분해 반환한다.',
      '게임 규칙이 불명확하면 보수적으로 판정하고 선택권을 남겨두세요.',
      '장면 다양성 참고 소재: '+varietyCue+'. 현재 행동과 등록된 맵·NPC·사건에 자연스럽게 맞을 때만 활용한다. 매 턴 강제 사건을 발생시키지 않고, 새 NPC·장소·보상·사건 결과를 근거 없이 확정하지 않는다. 기존 메인 사건을 반복하지 않고 일상·관계·생계·탐색의 리듬을 유지한다.',
      'D20은 성공이 불확실하고 실패에 의미가 있는 행동에만 요청합니다. 일반 이동, 평범한 대화, 정가 거래, 일상 관찰에는 요청하지 않습니다.',
      '판정이 필요하면 text에 판정 이유를 설명하고 check에 {ability,label,dc,reason}을 반환하세요. ability는 currentState.characterValues에 존재하는 숫자형 능력치 ID 중 하나여야 합니다. 판정 요청 단계에서는 성공·실패·피해·보상·이동을 확정하지 말고 변경 필드를 비우세요.',
      'diceResult가 제공되면 이미 확정된 판정입니다. 같은 행동에 주사위를 다시 요청하지 말고 check:null을 반환하세요. 성공/실패는 diceResult.success를 반드시 따르고 그 결과로 이어지는 상황을 묘사하세요.',
      '판정이 필요하지 않으면 check:null을 반환하세요. 하나의 행동에 불필요한 반복 판정을 요구하지 마세요.',
      '각 장면이 끝날 때 플레이어가 고를 행동 4가지를 choices 문자열 배열로 제시하세요. 플레이어는 직접 입력하지 않고 이 4개 중에서만 고릅니다. 1~3번은 현재 장소·등장인물·방금 벌어진 사건에 직접 연결되는 서로 다른 방향의 현실적인 행동입니다. 4번은 상황을 전혀 다른 방향으로 비트는 특이하고 엉뚱한 행동이지만 세계관 안에서 실제로 시도 가능해야 하며, 억지 개그나 무모한 자살 행동은 안 됩니다. 비밀을 미리 알거나 결과를 확정하지 마세요.',
      'choices는 플레이어의 행동으로 그대로 쓰이는 자연스러운 1인칭 행동 문장으로 작성하세요. 이미 확정된 행동을 다시 반복하거나 플레이어가 알 수 없는 비밀을 누설하지 마세요.',
      '판정 요청(check가 존재) 시에는 choices:[]를 반환하세요. 주사위 결과를 받은 후에는 그 결과에 맞는 새 선택지 4개를 제시하세요.',
      'currentState.availableImages는 제작자가 업로드한 이미지 키 목록입니다. 장면에 적합한 키가 있을 때만 imageKey로 목록에 있는 문자열 하나를 정확히 반환하세요. 없으면 빈 문자열을 반환하세요. 없는 이미지를 지어내지 마세요.',
      '관계도는 실제 플레이에서 플레이어가 직접 만난 NPC만 기록합니다. 단순 언급, 소문, 배경 설정, 아직 만나지 않은 프롤로그 인물은 추가하지 마세요. 새 NPC와 직접 대면/대화했다면 relationshipUpdates에 {name,met:true,relation,affection}을 넣으세요. 이미 기록된 NPC의 관계 또는 호감도가 사건으로 실제 변했다면 {name,met:false,relation,affection}을 넣으세요. 호감도는 0~100의 절대값이며 특별한 변화가 없으면 기존 값을 유지하세요. 해당 사항이 없으면 빈 배열입니다.',
      '현재 목표는 currentState.currentGoal을 참고하여 진행에 따라 설정하거나 갱신합니다. 새 목표가 없으면 기존 목표를 그대로 유지하도록 currentGoal을 빈 문자열로 반환하세요. 최종 목표가 single이면 구체적 승리 조건이 실제 충족된 경우에만 finalGoalCompleted:true를 반환하세요. progress이면 currentState.finalGoalSteps의 각 단계를 실제 달성한 경우에만 0부터 시작하는 해당 인덱스를 completedGoalSteps 배열에 넣으세요. 이미 완료한 단계는 반복할 필요 없습니다. 아직 달성하지 않은 단계는 절대 완료 처리하지 마세요. progress 모드에서는 finalGoalCompleted:true만으로 종료할 수 없고 모든 단계 완료 시에만 엔딩을 서술하세요.',
      'text·choices·gesture는 모두 자연스러운 한국어로만 쓰세요. 러시아어·일본어 등 다른 언어 단어를 섞지 마세요(세계관 고유명사는 예외).',
      '다음 JSON 객체만 반환하세요: {"text":"GM의 한국어 묘사","hpDelta":0,"addItems":[],"removeItems":[],"addFlags":[],"imageKey":"","moveToPinId":"","check":null,"choices":["행동 1","행동 2","행동 3","특이한 행동 4"],"presentNpcs":[],"relationshipUpdates":[],"currentGoal":"","completedGoalSteps":[],"finalGoalCompleted":false}',
      '새 게임 시작 시 플레이어에게 표시한 프롤로그가 있다면 이미 일어난 사실로 존중하고 이어서 진행하세요. 프롤로그를 다시 처음부터 설명하지 마세요. 플레이어의 의지나 행동을 임의 확정하지 마세요.',
      ...modeRules,
      ...debugRules,
      ...rerollRules,
      '확정된 시작 장비 목록:\n' + String(body.initialEquipment || '').slice(0, 2000),
      '프롬프트에서 가져온 시작 장비의 원문 능력과 조건:\n' + JSON.stringify(body.ruleEquipment || []).slice(0, 4000),
      '게임 프롤로그:\n' + String(body.prologue || '').slice(0, 5000),
      '제작자 프롬프트:\n' + String(body.prompt || '').slice(0, 7000),
    ].join('\n\n');
    const payload = { model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ currentState: state, explicitGameState, recentHistory: history, playerAction: body.action, diceResult: body.diceResult || null }).slice(0, 18000) },
      ],
    };
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(55000),
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result?.error?.message || 'AI API 호출에 실패했습니다.' }, { status: 502 });
    const raw = result?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') throw new Error('AI 응답이 비어 있습니다.');
    const data = JSON.parse(raw);
    const availableImages = Array.isArray(state.availableImages) ? state.availableImages.filter((v: unknown): v is string => typeof v === 'string').slice(0, 150) : [];
    const imageKey = typeof data.imageKey === 'string' && availableImages.includes(data.imageKey) ? data.imageKey : '';
    const locations = Array.isArray(state.locations) ? state.locations : [];
    const candidate = typeof data.moveToPinId === 'string' ? data.moveToPinId : '';
    const allowed = Array.isArray(state.adjacentLocationIds) ? state.adjacentLocationIds : [];
    const moveToPinId = body.movementAllowed !== false && allowed.includes(candidate) && locations.some((p: { id?: string; mapId?: string }) => p.id === candidate && p.mapId === state.currentMapId) ? candidate : '';
    if (typeof data.text === 'string') data.text = data.text.split(/(\s+)/).filter((w: string) => !FOREIGN_SCRIPT.test(w)).join('').replace(/ {2,}/g, ' ');
    const choices = Array.isArray(data.choices) ? [...new Set(data.choices.filter((v: unknown): v is string => typeof v === 'string' && !FOREIGN_SCRIPT.test(v)).map((v: string) => v.trim()).filter((v: string) => v.length >= 2 && v.length <= 140))].slice(0, 4) : [];
    const presentNpcs = Array.isArray(data.presentNpcs) ? [...new Set(data.presentNpcs.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim()).filter((v: string) => v.length >= 1 && v.length <= 30))].slice(0, 3) : [];
    const check = !mode && body.reroll !== true && body.debug !== true && !body.diceResult && data.check && typeof data.check === 'object' ? {
      ability: String(data.check.ability || '').toLowerCase().slice(0, 50),
      label: String(data.check.label || '').slice(0, 60),
      reason: String(data.check.reason || '').slice(0, 200),
      dc: Number(data.check.dc)
    } : null;
    const relationshipUpdates = Array.isArray(data.relationshipUpdates) ? data.relationshipUpdates.slice(0, 12).filter((item: unknown) => !!item && typeof item === 'object' && typeof (item as {name?:unknown}).name === 'string').map((item: {name:string;met?:boolean;relation?:string;affection?:number}) => ({name:item.name.trim().slice(0,50),met:item.met===true,relation:typeof item.relation==='string'?item.relation.slice(0,30):'',affection:typeof item.affection==='number'&&Number.isFinite(item.affection)?Math.max(0,Math.min(100,Math.round(item.affection))):undefined})) : [];
    const currentGoal = typeof data.currentGoal==='string' ? data.currentGoal.trim().slice(0,240) : '';
    const finalGoalCompleted = !check && state.finalGoalMode !== 'progress' && data.finalGoalCompleted === true && !!String(state.finalGoal||'').trim();
    const steps=Array.isArray(state.finalGoalSteps)?state.finalGoalSteps.filter((v:unknown)=>typeof v==='string'&&v.trim()):[];
    const completedGoalSteps=!check&&state.finalGoalMode==='progress'&&Array.isArray(data.completedGoalSteps)?data.completedGoalSteps.filter((v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<steps.length):[];
    const rawEnemy = data.enemy && typeof data.enemy === 'object' ? data.enemy : null;
    const enemy = mode === 'combat' && rawEnemy ? { hp: Number(rawEnemy.hp), dc: Number(rawEnemy.dc), damage: Number(rawEnemy.damage) } : null;
    if (mode === 'combat' && !itemUse) data.hpDelta = 0;
    const gesture = mode === 'talk' && typeof data.gesture === 'string' ? data.gesture.trim().slice(0, 60) : '';
    // Talk: the reply becomes ordered parts (narration, speech, narration, speech...) so the chat shows them in turn.
    // Quoted text is speech even when the model mixes it into the narration; a speech repeated in line and text appears once.
    let line = '';
    let parts: { type: 'scene' | 'speech'; text: string }[] = [];
    if (mode === 'talk') {
      const QUOTE = /[“"「『]([^”"」』]+)[”"」』]/g;
      const toParts = (value: string) => {
        const out: { type: 'scene' | 'speech'; text: string }[] = [];
        let last = 0;
        for (const m of value.matchAll(QUOTE)) {
          const before = value.slice(last, m.index).trim();
          if (before) out.push({ type: 'scene', text: before });
          if (m[1].trim()) out.push({ type: 'speech', text: m[1].trim() });
          last = (m.index || 0) + m[0].length;
        }
        const after = value.slice(last).trim();
        if (after) out.push({ type: 'scene', text: after });
        return out;
      };
      const strip = (v: string) => v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim();
      const same = (a: string, b: string) => { const x = a.replace(/[\s"“”'.,!?…]/g, ''), y = b.replace(/[\s"“”'.,!?…]/g, ''); return !!x && !!y && (x.includes(y) || y.includes(x)); };
      parts = toParts(String(data.text || '').trim());
      const rawLine = typeof data.line === 'string' ? data.line.trim() : '';
      const lineParts = /[“"「『]/.test(rawLine) ? toParts(rawLine) : rawLine ? [{ type: 'speech' as const, text: strip(rawLine) }] : [];
      if (!parts.some(p => p.type === 'speech')) {
        // No speech inside the narration: a lone narration with no line is itself the speech.
        parts = lineParts.length ? [...parts, ...lineParts] : parts.length === 1 ? [{ type: 'speech', text: strip(parts[0].text) }] : parts;
      } else {
        for (const p of lineParts) if (!parts.some(q => q.type === p.type && same(q.text, p.text))) parts.push(p);
      }
      // A quotative tail ('…"라고 덧붙인다') belongs to the lead-in before that speech: '그녀는 한숨을 내쉬며 덧붙인다.' then the bubble.
      parts = parts.reduce<typeof parts>((acc, p, i) => {
        const tail = p.type === 'scene' && i >= 2 && parts[i - 1].type === 'speech' ? p.text.match(/^(?:이?라고|하고|고)\s*(.+)$/) : null;
        if (!tail) { acc.push(p); return acc; }
        const lead = acc[acc.length - 2];
        if (lead?.type === 'scene' && !/[.!?…]$/.test(lead.text)) lead.text = `${lead.text} ${tail[1]}`;
        // A bare speech verb ('말한다.') adds nothing once the bubble is shown.
        else { const rest = tail[1].replace(/^(?:말하며|말하고는?|외치며|덧붙이며|중얼거리며)\s*/, ''); if (rest.replace(/[\s.!?…]/g, '').length > 6) acc.push({ type: 'scene', text: rest }); }
        return acc;
      }, []);
      parts = parts.map(p => ({ ...p, text: p.text.slice(0, 600) })).filter(p => p.text).slice(0, 8);
      line = parts.filter(p => p.type === 'speech').map(p => p.text).join(' ');
      data.text = parts.filter(p => p.type === 'scene').map(p => p.text).join(' ');
    }
    // Suggested replies must be speech; narrated intents are dropped unless nothing else is left.
    const NARRATED = /(한다|묻는다|말한다|건넨다|요청한다|부탁한다|청한다|본다|듣는다)\.?$/;
    const spokenChoices = mode === 'talk' ? (choices as string[]).map((v: string) => v.replace(/^["“”'「『]+|["“”'」』]+$/g, '').trim()).filter((v: string) => !NARRATED.test(v)) : [];
    if (mode === 'talk' && spokenChoices.length) choices.splice(0, choices.length, ...spokenChoices);
    const playerLine = mode === 'talk' && typeof data.playerLine === 'string' && !FOREIGN_SCRIPT.test(data.playerLine) ? data.playerLine.trim().replace(/^["“”'「『]+|["“”'」』]+$/g, '').slice(0, 300) : '';
    return NextResponse.json({ enemy, gesture, line, parts, playerLine, currentGoal:check?'':currentGoal,finalGoalCompleted,completedGoalSteps,relationshipUpdates: check ? [] : relationshipUpdates, choices: check ? [] : choices, presentNpcs: check ? null : presentNpcs, check, moveToPinId: check ? '' : moveToPinId, imageKey, text: String(data.text || '').slice(0, 6000), hpDelta: check ? 0 : Number.isFinite(data.hpDelta) ? Math.trunc(data.hpDelta) : 0,
      addItems: !check && Array.isArray(data.addItems) ? data.addItems.slice(0, 5) : [], removeItems: !check && Array.isArray(data.removeItems) ? data.removeItems.slice(0, 5) : [],
      addFlags: !check && Array.isArray(data.addFlags) ? data.addFlags.slice(0, 5) : [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'GM 서버 오류' }, { status: 500 });
  }
}
