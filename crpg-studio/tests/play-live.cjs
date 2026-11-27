// Plays the real screen of the dev server (npm run dev, :3000) in headless Chrome: opens a game from its local save,
// ends an open talk, types one action, reads the scene, presses 대화하기 if offered, then answers talk choices.
// Spends real GM calls (the user's OpenAI money): run it only when asked.
//
//   node tests/play-live.cjs --action "떠돌이 약초사에게 냄새를 묻는다" [--talk 3] [--game 0wxcoq1ef] [--session seed.json] [--keep]
//   node tests/play-live.cjs --talk 3 --keep     (no --action: goes on with the talk left open)
//   node tests/play-live.cjs --say "그럼 쏴 봐!" --talk 0   (types a line into the open talk window)
//   node tests/play-live.cjs --press 싸운다 --talk 0 --keep  (presses a button first, e.g. a fight)
//   node tests/play-live.cjs --talk 0 --wait 30  (no --action: just opens the save and watches for 30s, e.g. a redraw)
//
// --session  seeds the local save with that session JSON first (e.g. a beta player's session from beta-data/turn-records.jsonl).
// --keep     keeps the save the run produced; otherwise the local save is put back as it was.
// Screenshots go to <tmp>/crpg-play/.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]; };
const GAME = arg('game', '0wxcoq1ef'), ACTION = arg('action', ''), TALK = Number(arg('talk', 3)), SEED = arg('session', ''), KEEP = !!arg('keep', false), WAIT = Number(arg('wait', 0)), PRESS = arg('press', '');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const URL = 'http://localhost:3000/', PORT = 9333;
const saveFile = path.join(__dirname, '..', 'saves', `session-${GAME}.json`);
const out = path.join(os.tmpdir(), 'crpg-play'), prof = path.join(out, 'chrome-profile');
const wait = ms => new Promise(r => setTimeout(r, ms));
const save = () => JSON.parse(fs.readFileSync(saveFile, 'utf8'));
const show = lines => lines.forEach(l => console.log('  ', l.slice(0, 500).replace(/\n+/g, ' ')));

// No --action: an open talk goes on (its first suggested lines are picked).
if (!CHROME) { console.error('Chrome/Edge를 찾지 못했습니다.'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const backup = fs.existsSync(saveFile) ? fs.readFileSync(saveFile) : null;
if (SEED) fs.writeFileSync(saveFile, fs.readFileSync(SEED));
// A window left open for testing (chrome --remote-debugging-port=9222 http://localhost:3000) is used as it is: no new browser,
// and the game already on screen is not opened again. Otherwise a headless one is started for this run.
const LIVE = 9222;
let chrome, live = false;

(async () => {
  live = await fetch(`http://127.0.0.1:${LIVE}/json/version`).then(r => r.ok, () => false);
  const port = live ? LIVE : PORT;
  if (!live) chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40 && !target; i++) { if (!live) await wait(500); try { const pages = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === 'page'); target = pages.find(t => t.url.startsWith(URL)) || pages[0]; } catch {} }
  if (!target) throw new Error('Chrome 디버그 포트에 연결하지 못했습니다.');
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pending = {};
  // Every /api/gm call but the streamed scene text counts as a beta turn; printed per step to see redraws.
  let gmCalls = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Network.requestWillBeSent' && m.params.request.url.endsWith('/api/gm') && !/"phase":"write"/.test(m.params.request.postData || '')) gmCalls.push(JSON.parse(m.params.request.postData || '{}').reroll ? '다시 뽑기' : '턴'); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
  const calls = () => { const c = gmCalls; gmCalls = []; return `AI 호출 ${c.length}회 (${c.join(', ')})`; };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const until = async (expr, ms = 120000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(expr)) return true; await wait(700); } return false; };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.result.data, 'base64')); };
  const click = text => js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);
  // A turn is done when a reply (a scene, a partner's line or a fight) is saved after entry n and nothing on screen is busy:
  // a map move logs two lines before its scene, and the run used to stop there.
  const replied = l => /^(GM:|대화-NPC:|전투)/.test(l);
  const settle = async n => { const t = Date.now(); while (Date.now() - t < 180000) { await wait(1500); if (save().log.slice(n).some(replied) && !(await js(`!!document.querySelector('[aria-busy="true"]')`))) { await wait(2500); return save(); } } return save(); };
  const readPages = async () => { for (let k = 0; k < 8 && await js(`!!document.querySelector('.vnSkip')`); k++) { await js(`document.querySelector('.vnSkip').click()`); await wait(1200); } await wait(1500); };

  await send('Page.enable'); await send('Network.enable');
  // The open window keeps its game unless a seed was written under it (the page holds the session in memory).
  const onGame = live && !SEED && await js(`location.href.startsWith(${JSON.stringify(URL)}) && !!document.querySelector('.storyLog')`);
  if (!onGame) {
  await send('Page.navigate', { url: URL });
  if (!await until(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === '플레이')`, 90000)) throw new Error('게임 목록이 뜨지 않았습니다. 개발 서버(:3000)가 켜져 있나요?');
  const name = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'saves', 'games.json'), 'utf8')).find(g => g.id === GAME)?.name || '';
  await js(`(() => { const bs = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '플레이'); const b = bs.find(x => { let p = x; for (let i = 0; i < 6 && p; i++, p = p.parentElement) if ((p.textContent || '').includes(${JSON.stringify(name)})) return true; return false; }); (b || bs[0]).click(); })()`);
  await wait(4000);
  }
  let s = save();
  // --press: a button by its text (싸운다 on a fight), then the log it adds and the screen are shown.
  if (PRESS) { const n = save().log.length; if (!await until(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === ${JSON.stringify(PRESS)})`, 30000)) throw new Error(PRESS + ' 버튼이 없습니다.'); await shot('0-before'); await click(PRESS); console.log('누름:', PRESS); s = await settle(n); await readPages(); show(s.log.slice(n)); }
  // --clicks "정보창>>파티 권유": screen-only buttons clicked in turn (no AI), then a screenshot (3-clicks.png).
  const CLICKS = arg('clicks', '');
  // Confirm dialogs (새로하기) are accepted.
  if (CLICKS) { await wait(9000); await js('window.confirm = () => true'); for (const b of CLICKS.split('>>')) { await until(`[...document.querySelectorAll('button')].some(x => x.textContent.trim() === ${JSON.stringify(b.trim())})`, 180000); await click(b.trim()); await wait(1500); } await shot('3-clicks'); console.log('누름:', CLICKS); }
  // --say: a line typed into the open talk window (not one of its suggested lines).
  const SAY = arg('say', '');
  if (SAY) {
    if (!await until(`!!document.querySelector('form.talkInput input')`, 60000)) throw new Error('대화 입력 칸이 뜨지 않았습니다.');
    await shot('0-before');
    const n = save().log.length;
    await js(`(() => { const el = document.querySelector('form.talkInput input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(SAY)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await wait(300);
    await js(`document.querySelector('form.talkInput').requestSubmit()`);
    console.log('대사:', SAY);
    s = await settle(n); await readPages(); await shot('1-say');
    s = save(); show(s.log.slice(n));
    console.log('→', calls(), '| mode:', s.mode, '| 대화 상대:', s.talkNpc || '-');
  }
  if (ACTION) {
  // An open talk is closed first, so the action goes in as a scene action.
  for (let k = 0; k < 10 && !(await js(`!!document.querySelector('form.gmChoiceOwn')`)); k++) { await readPages(); await click('대화 끝내기'); await wait(2000); }
  if (!await until(`!!document.querySelector('form.gmChoiceOwn input, form.gmChoiceOwn textarea')`, 60000)) throw new Error('행동 입력 칸이 뜨지 않았습니다.');
  await shot('0-before');

  const n0 = save().log.length;
  await js(`(() => { const el = document.querySelector('form.gmChoiceOwn input, form.gmChoiceOwn textarea'); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(ACTION)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await wait(300);
  await js(`document.querySelector('form.gmChoiceOwn').requestSubmit()`);
  console.log('행동:', ACTION);
  s = await settle(n0);
  await readPages(); await shot('1-scene');
  s = save(); show(s.log.slice(n0));
  console.log('→', calls(), '| 무대:', JSON.stringify(s.sceneNpcs || []), '| 선택지:', JSON.stringify(s.suggestedActions || []));

  if (await js(`!!document.querySelector('.encounterTalk')`)) {
    const n = save().log.length;
    await js(`document.querySelector('.encounterTalk').click()`);
    s = await settle(n); show(s.log.slice(n));
  }
  } else { await readPages(); await wait(WAIT * 1000); s = save(); console.log('열린 대화를 이어 갑니다:', s.talkNpc || '(대화 없음)', '| 선택지:', JSON.stringify(s.suggestedActions || [])); }
  for (let i = 0; i < TALK && s.mode === 'talk' && !s.talkEnded; i++) {
    if (!await until(`!!document.querySelector('.talkSuggestions button')`, 30000)) break;
    const n = save().log.length;
    const pick = await js(`(() => { const b = document.querySelector('.talkSuggestions button'); b.click(); return b.textContent.trim(); })()`);
    console.log('>> 고른 대사:', pick.replace(/^\d/, ''));
    s = await settle(n); show(s.log.slice(n));
  }
  await shot('2-end');
  console.log(calls()); console.log('끝: mode =', s.mode || '(장면)', '| 대화 상대 =', s.talkNpc || '-', '| 만난 사람 =', JSON.stringify(s.metNpcs || []));
  console.log('스크린샷:', out);
  // The open window would save its in-memory session over the restored file: put the save back and reload it there.
  if (live && !KEEP) { if (backup) fs.writeFileSync(saveFile, backup); await send('Page.reload'); console.log('로컬 세이브를 원래대로 되돌리고 창을 새로 불렀습니다.'); }
  ws.close();
})().catch(e => { console.error('실패:', e.message); process.exitCode = 1; }).finally(() => {
  chrome?.kill();
  if (!KEEP && !live) { if (backup) fs.writeFileSync(saveFile, backup); else fs.rmSync(saveFile, { force: true }); console.log('로컬 세이브를 원래대로 되돌렸습니다.'); }
});
