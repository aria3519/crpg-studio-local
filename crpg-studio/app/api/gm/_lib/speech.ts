// Speech helpers for the GM route: NPC voices and sheets, and the checks that catch repeated or old-fashioned lines.
import { readFileSync } from 'fs';
import path from 'path';

// The model occasionally slips a word from another language into Korean (e.g. Russian "слух" for 소문).
export const FOREIGN_SCRIPT = /[\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\u3040-\u30FF]/;
export const VOICE_LENGTH = 200;
// A medieval setting pulled the model toward translated-drama speech (~이오, ~하시오). Wuxia keeps its authored 하오체 characters, so it skips this.
export const NATURAL_SPEECH = '인물은 모두 오늘날 한국 사람이 실제로 입으로 하는 자연스러운 말로 이야기합니다. 세계관이 중세여도 번역극이나 사극처럼 말하지 않습니다.';
// Built-in NPC character sheets (personality, voice, likes/dislikes) live outside the 7000-char game prompt and are attached per NPC on stage.
export type NpcSheet = { identity?: string; personality?: string; speech?: string; likes?: string[]; dislikes?: string[]; firstAttitude?: string; relations?: string[]; asCompanion?: string; power?: number };
// An NPC as the play screen sends it in state.npcProfiles.
export type Profile = { name?: unknown; inScene?: unknown; inParty?: unknown; profile?: unknown; speechStyle?: unknown };
export const sheetCache = new Map<string, Record<string, NpcSheet>>();
export function npcSheets(genre: string): Record<string, NpcSheet> {
  if (!['fantasy', 'wuxia', 'modern'].includes(genre)) return {};
  if (!sheetCache.has(genre)) {
    try { sheetCache.set(genre, JSON.parse(readFileSync(path.join(process.cwd(), 'app', 'api', 'gm', '_data', 'npc-sheets', `${genre}.json`), 'utf8'))); }
    catch { return {}; }
  }
  return sheetCache.get(genre) || {};
}
// One small request decides each new NPC's speech register and habits; the result is stored and reused for the whole playthrough.
export async function assignVoices(npcs: { name: string; profile: string }[], genre: string, wuxia: boolean): Promise<{ name: string; style: string }[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'x-usage-tag': 'voices' },
      body: JSON.stringify({ reasoning_effort: 'low', model: process.env.OPENAI_GM_MODEL || 'gpt-4.1-mini', response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: [
            '한국어 CRPG의 NPC마다 게임 내내 고정될 말투를 정합니다.',
            `style 형식: "어체: <${wuxia ? '하십시오체|해요체|하오체|하게체|해체|해라체' : '하십시오체|해요체|해체|해라체'} 중 하나만> | 어미: <자주 쓰는 어미 2~3개> | 버릇: <말버릇·자주 쓰는 표현> | 예: <그 인물다운 짧은 대사 하나>" 120자 이내.`,
            wuxia ? '성별·나이·신분·성격에 맞추고, 인물끼리 서로 구분되게 하세요. 여성 인물은 profile에 근거가 없으면 하오체·하게체를 쓰지 마세요.' : `성별·나이·신분·성격에 맞추고, 인물끼리 서로 구분되게 하세요. 젊은 인물은 해요체·해체가 자연스럽습니다. ${NATURAL_SPEECH}`,
            '{"voices":[{"name":"정확한 이름","style":"..."}]} JSON만 반환하세요.',
          ].join('\n') },
          { role: 'user', content: JSON.stringify({ genre: genre.slice(0, 300), npcs }) },
        ] }),
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    const voices = JSON.parse(result?.choices?.[0]?.message?.content || '{}')?.voices;
    return Array.isArray(voices) ? voices.filter((v: { name?: unknown; style?: unknown }) => typeof v?.name === 'string' && typeof v?.style === 'string' && npcs.some(n => n.name === v.name) && v.style.trim() && !FOREIGN_SCRIPT.test(v.style))
      .map((v: { name: string; style: string }) => ({ name: v.name, style: v.style.trim().slice(0, VOICE_LENGTH) })) : [];
  } catch { return []; }
}
// Repeats are judged per sentence: same text, one containing the other, or mostly the same character pairs.
export const squash = (t: string) => t.replace(/[\s.,!?…~'"“”‘’「」『』\-]/g, '');
export const pairs = (t: string) => new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)));
export const repeats = (a: string, b: string) => {
  const x = squash(a), y = squash(b);
  if (x.length < 4 || y.length < 4) return x === y && x.length > 0;
  if (x === y || (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x)))) return true;
  const p = pairs(x), q = pairs(y); let both = 0; for (const k of p) if (q.has(k)) both++;
  return both / Math.max(1, Math.min(p.size, q.size)) >= 0.7;
};
// Talk replies read as "the same" when they share most character pairs or two content words, or when all three are questions.
export const pairShare = (a: string, b: string) => { const p = pairs(squash(a)), q = pairs(squash(b)); let both = 0; for (const k of p) if (q.has(k)) both++; return both / Math.max(1, Math.min(p.size, q.size)); };
export const TALK_STOP = /^(그럼|그래|그건|그게|정말|혹시|지금|우리|당신|너|제가|내가|저는|나는|뭐|무슨|어떻게|왜|좀|더|이제|그냥|알려|말해|주세요|줄래|있어|있나요|있어요|없어|해요|하는|거야|건가요)$/;
export const contentWords = (t: string) => new Set([...t.matchAll(/[가-힣]{2,}/g)].map(m => m[0].replace(/(이랑|으로|에게|한테|은|는|이|가|을|를|에|의|도|로|와|과|랑|요|죠)$/, '')).filter(w => w.length >= 2 && !TALK_STOP.test(w)));
// An action that walks away from the conversation ("이끼골로 향해 조사하러 간다"), not something said.
// Same pattern as the play screen: a destination or object before the verb, so "좋아, 같이 간다" stays speech.
export const LEAVING = /(?:으로|로|에|을|를|서)\s+(?:\S+\s+){0,4}?(?:간다|향한다|나선다|떠난다|들어간다|나간다|출발한다|돌아간다|따라간다|뒤쫓는다|추적한다|조사한다|살핀다|뒤진다)\.?$/;
export const ADDRESS = ['경', '그대', '인간', '꼬맹이', '형씨', '아가', '자네', '당신', '손님', '나리', '아가씨', '소협', '대협', '헌터님'];
export const ADDRESS_JOSA = ['', '은', '는', '이', '가', '의', '을', '를', '에게', '도', '여', '이여', '께서', '께', '님'];
export const addressesIn = (t: string) => { const words = t.split(/[\s,.!?…~"'“”]+/).filter(Boolean); return ADDRESS.filter(a => words.some(w => w.startsWith(a) && ADDRESS_JOSA.includes(w.slice(a.length)))); };
export const sentences = (t: string) => t.split(/(?<=[.!?…])\s+/).map(x => x.trim()).filter(Boolean);
// Drama-style speech is judged per sentence end: the old any-word match fired on "유연하게 대처", and its rewrite then changed clean lines.
export const OLD_ENDING = /(?:(?<!십)시오|(?:겠|했|있|없|었|였|않|같|많|좋|맞|됐|왔|갔|봤|는|한|렸|졌)소|(?:하|이|되|가|주|보|마|리|니|지|치|키|기|려|대|내|해)오|소이다|구려|이외다|일세|이로다|하도다|전부요|무엇이요|누구요|(?:하|주|보|오)게|(?:하|이|되|드리)옵(?:니다|니까|소서)|하노라|겠노라|이니라|하느니라)[.!?…~,]*["”」']?$/;
export const OLD_CLAUSE = /이오니|하오니|사오니|하옵고|이옵고|하오나|이오나|사옵/;
// A nickname marked "친해지면" in a sheet is earned: from a stranger, 핍's "대장" made no sense. It leaves the habits and the example lines alike.
export const CLOSE_AFFECTION = 20;
export const voiceFor = (speech: string, affection: number) => {
  const pet = speech.match(/친해지면 상대를 '([^']+)'[^,|]*부름,?\s*/);
  return !pet || affection >= CLOSE_AFFECTION ? speech : speech.replace(pet[0], '').split(`${pet[1]}, `).join('');
};
// Scenes have no check like the one talk lines get: "이번엔 네가 이겼어" came back in four scenes in a row. A quote already said is dropped.
export const QUOTED = /["“]([^"”]+)["”]/g;
export const dropRepeatedQuotes = (text: string, history: string[]) => {
  const quotes = history.flatMap(h => [...h.matchAll(QUOTED)].map(m => m[1])), said = quotes.flatMap(sentences);
  // Whole quotes too: "대장… 이번엔" splits at the dots where "대장, 이번엔" doesn't, so its sentences alone look new.
  const kept = text.replace(QUOTED, (all, q: string) => { const lines = sentences(q); return quotes.some(y => repeats(q, y)) || (lines.length && lines.every(x => said.some(y => repeats(x, y)))) ? '' : all; }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return kept.replace(/【[^】]*】/, '').trim() ? kept : text;
};
export const oldSpeech = (t: string) => t.split(/(?<=[.!?…]["”」']?)\s+|\n+/).some(x => OLD_ENDING.test(x.trim()) || OLD_CLAUSE.test(x));
// A question ("같이 가 볼래요?") is not a decision.
export const plainEnd = (t: string) => { const m = t.trim().replace(/[.!]+$/, '').match(/(.)다$/); if (!m) return false; const c = m[1].charCodeAt(0) - 0xac00; return m[1] === '는' || (c >= 0 && c < 11172 && c % 28 === 4); };
