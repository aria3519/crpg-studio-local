import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
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
    const system = [
      '당신은 한국어 CRPG의 AI GM입니다. 플레이어의 대사·의지·중요 선택을 임의 확정하지 마세요.',
      '제작자 프롬프트는 세계관과 진행 원칙입니다. 맵 위치·장소·이벤트는 별도의 구조화 데이터가 우선합니다.',
      '시작 소지품은 프롬프트의 명시적 시작 소지품 규칙과 게임 설정에서 직접 추가한 장비를 합쳐 구성합니다. currentState.inventory가 실제 소유 목록입니다. 이미 지급된 시작 아이템을 addItems로 중복 지급하지 마세요. 규칙 아이템의 능력과 제한은 ruleEquipment의 원문을 존중하세요.',
      '사용자의 행동 문장에서 실제 장소 이동 의도를 판별하세요. 이동 의도가 명확할 때만 currentState.locations 중 현재 맵의 정확한 장소 id를 moveToPinId로 반환하세요. 주변을 둘러보기, 장소에 대한 질문, 이동을 고민하는 말에는 빈 문자열을 반환하세요.',
      '현재 맵 외 장소로 이동하려면 현재 맵에 등록된 출구/포탈 id를 반환해야 합니다. 연결 없는 다른 맵으로 즉시 이동시키지 마세요.',
      '현재 맵에서 이동할 목적지는 자유롭게 선택할 수 있지만 거리에 따라 시간이 걸립니다. 가까운 장소 위주로 선택지를 제안하세요. 먼 장소로 이동할 때는 여행 시작과 도중의 풍경, 휴식, 사건을 묘사하고 도착을 임의 확정하지 마세요. 다른 맵으로 이동할 때는 연결된 포탈을 사용합니다.',
      'moveToPinId는 제안일 뿐이며 클라이언트가 거리와 이동 단계를 검증하고 도착을 확정합니다. 실제 도착 이벤트는 별도의 후속 요청으로 받습니다. 최초 이동 응답에서 도착 이벤트를 이미 실행했다고 말하지 마세요.',
      'currentState.travel이 존재하면 아직 여행 중입니다. playerAction이 이동을 계속하겠다는 내용이면 해당 목적지 id를 moveToPinId로 반환하고 이동 도중 한 장면만 묘사하세요. 중단·귀환 의사면 이동을 진행하지 마세요. 휴식·대화 등 다른 행동은 이동 단계를 진행하지 마세요.',
      'movementAllowed가 false라면 이동을 제안하지 마세요. 현재 장소에 머무르며 전달된 도착 이벤트를 묘사하세요.',
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
      '각 장면이 끝날 때 플레이어가 다음에 할 수 있는 구체적인 행동 3가지를 choices 문자열 배열로 제시하세요. 1~2번은 현재 장면에 직접 연결되는 현실적인 행동이고, 3번은 현재 상황의 단서·인물·환경을 활용하는 독창적이고 예상 밖의 행동입니다. 3번도 실제로 시도 가능한 행동이어야 하며, 비밀을 미리 알거나 결과를 확정하지 마세요. 현재 장소, 등장인물, 방금 벌어진 사건에 맞게 서로 다른 방향의 선택지로 만드세요. 자유 행동은 언제나 허용되며 선택지를 강요하지 마세요.',
      'choices는 플레이어가 그대로 입력해도 자연스러운 1인칭 행동 문장으로 작성하세요. 이미 확정된 행동을 다시 반복하거나 플레이어가 알 수 없는 비밀을 누설하지 마세요.',
      '판정 요청(check가 존재) 시에는 choices:[]를 반환하세요. 주사위 결과를 받은 후에는 그 결과에 맞는 새 선택지 3개를 제시하세요.',
      'currentState.availableImages는 제작자가 업로드한 이미지 키 목록입니다. 장면에 적합한 키가 있을 때만 imageKey로 목록에 있는 문자열 하나를 정확히 반환하세요. 없으면 빈 문자열을 반환하세요. 없는 이미지를 지어내지 마세요.',
      '관계도는 실제 플레이에서 플레이어가 직접 만난 NPC만 기록합니다. 단순 언급, 소문, 배경 설정, 아직 만나지 않은 프롤로그 인물은 추가하지 마세요. 새 NPC와 직접 대면/대화했다면 relationshipUpdates에 {name,met:true,relation,affection}을 넣으세요. 이미 기록된 NPC의 관계 또는 호감도가 사건으로 실제 변했다면 {name,met:false,relation,affection}을 넣으세요. 호감도는 0~100의 절대값이며 특별한 변화가 없으면 기존 값을 유지하세요. 해당 사항이 없으면 빈 배열입니다.',
      '현재 목표는 currentState.currentGoal을 참고하여 진행에 따라 설정하거나 갱신합니다. 새 목표가 없으면 기존 목표를 그대로 유지하도록 currentGoal을 빈 문자열로 반환하세요. 최종 목표가 single이면 구체적 승리 조건이 실제 충족된 경우에만 finalGoalCompleted:true를 반환하세요. progress이면 currentState.finalGoalSteps의 각 단계를 실제 달성한 경우에만 0부터 시작하는 해당 인덱스를 completedGoalSteps 배열에 넣으세요. 이미 완료한 단계는 반복할 필요 없습니다. 아직 달성하지 않은 단계는 절대 완료 처리하지 마세요. progress 모드에서는 finalGoalCompleted:true만으로 종료할 수 없고 모든 단계 완료 시에만 엔딩을 서술하세요.',
      '다음 JSON 객체만 반환하세요: {"text":"GM의 한국어 묘사","hpDelta":0,"addItems":[],"removeItems":[],"addFlags":[],"imageKey":"","moveToPinId":"","check":null,"choices":["행동 1","행동 2","독창적이고 실행 가능한 행동 3"],"relationshipUpdates":[],"currentGoal":"","completedGoalSteps":[],"finalGoalCompleted":false}',
      '새 게임 시작 시 플레이어에게 표시한 프롤로그가 있다면 이미 일어난 사실로 존중하고 이어서 진행하세요. 프롤로그를 다시 처음부터 설명하지 마세요. 플레이어의 의지나 행동을 임의 확정하지 마세요.',
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
    const choices = Array.isArray(data.choices) ? [...new Set(data.choices.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim()).filter((v: string) => v.length >= 2 && v.length <= 140))].slice(0, 4) : [];
    const check = !body.diceResult && data.check && typeof data.check === 'object' ? {
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
    return NextResponse.json({ currentGoal:check?'':currentGoal,finalGoalCompleted,completedGoalSteps,relationshipUpdates: check ? [] : relationshipUpdates, choices: check ? [] : choices, check, moveToPinId: check ? '' : moveToPinId, imageKey, text: String(data.text || '').slice(0, 6000), hpDelta: check ? 0 : Number.isFinite(data.hpDelta) ? Math.trunc(data.hpDelta) : 0,
      addItems: !check && Array.isArray(data.addItems) ? data.addItems.slice(0, 5) : [], removeItems: !check && Array.isArray(data.removeItems) ? data.removeItems.slice(0, 5) : [],
      addFlags: !check && Array.isArray(data.addFlags) ? data.addFlags.slice(0, 5) : [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'GM 서버 오류' }, { status: 500 });
  }
}
