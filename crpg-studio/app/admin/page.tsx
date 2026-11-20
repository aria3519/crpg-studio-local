'use client';
import { useEffect, useState } from 'react';
import type { betaReport } from '../_lib/beta-report';

type Member = { pid: string; id: string; memo: string; created: string; limit: number; used: number; disabled: boolean };
// Minutes as 1시간 20분.
const span = (m: number) => m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
type Report = ReturnType<typeof betaReport> & { members: Member[]; maxAccounts: number };
type Player = Report['players'][number];

const time = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const device = (ua: string) => /iPhone|Android.*Mobile/.test(ua) ? '휴대폰' : /iPad|Android/.test(ua) ? '태블릿' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '기타';
const KIND: Record<string, string> = { turn: '행동', feedback: '💬 의견', error: '🐞 오류' };
// How an account signed in, from its id (kakao-123, google-456; an id the admin made has no provider).
const PROVIDER: Record<string, string> = { kakao: '카카오', google: '구글' };
// Not signed in, and the browser says it is a crawler, a script or a headless browser; or, posing as a browser, it came
// once from abroad and never played (most beta visits once the domain was up: US/NL/CA, one visit, old Chrome versions).
const BOT_UA = /bot|crawl|spider|slurp|scan|monitor|preview|headless|phantom|facebookexternalhit|curl|wget|python|httpclient|go-http|java\/|axios|node-fetch|okhttp|^$/i;
// Who a player id is: the account's name with how it signed in, or a visitor marked 봇 or 비로그인.
function Who({ pid, members, p }: { pid: string; members: Map<string, Member>; p?: Player }) {
  const m = members.get(pid);
  if (m) { const p = m.id.split('-')[0]; return <span className="adminWho"><b>{m.memo.replace(/^\w+: /, '') || m.id}</b> <em className={`adminTag ${PROVIDER[p] ? p : 'direct'}`}>{PROVIDER[p] || '직접 계정'}</em>{m.disabled && <em className="adminTag off">중지</em>}</span>; }
  const bot = !!p && (BOT_UA.test(p.ua || '') || (!p.turns && p.visits <= 1 && !!p.country && p.country !== 'KR'));
  return <span className="adminWho muted" title={pid}>{pid.slice(0, 6)} <em className={`adminTag ${bot ? 'bot' : 'guest'}`}>{bot ? '🤖 봇' : '비로그인'}</em></span>;
}

// Beta dashboard, local only (the tunnel never reaches /admin): feedback, bugs, stuck players, drop-off, each visitor's save.
export default function Admin() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [pid, setPid] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const load = () => fetch('/api/beta/admin', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(Error('불러오지 못했습니다.'))).then(d => { setData(d); setError(''); }, e => setError(e.message));
  useEffect(() => { void load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);
  const markRead = (id: string, value: boolean) => void fetch('/api/beta/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read: id, value }) }).then(load);
  if (!data) return <main className="adminPage"><p>{error || '불러오는 중…'}</p></main>;
  const s = data.summary, player = data.players.find(p => p.pid === pid);
  const members = new Map(data.members.map(m => [m.pid, m])), byPid = new Map(data.players.map(p => [p.pid, p]));
  const who = (id: string) => <Who pid={id} members={members} p={byPid.get(id)} />;
  const open = (id: string) => <button className="btn adminOpen" onClick={() => setPid(id)}>보기</button>;
  const maxDrop = Math.max(1, ...data.drop.byGoal.map(([, n]) => n), ...data.drop.byTurns.map(([, n]) => n));
  const bar = ([label, n]: [string, number]) => <div className="adminBar" key={label}><span>{label}</span><i style={{ width: `${(n / maxDrop) * 100}%` }} /><b>{n}명</b></div>;

  return <main className="adminPage">
    <div className="adminHead"><h1>베타 대시보드</h1><button className="btn" onClick={() => void load()}>새로고침</button>{error && <small className="feedbackError">{error}</small>}</div>
    <div className="adminCards">
      <div><small>가입자</small><b>{data.members.length}/{data.maxAccounts}</b></div><div><small>방문자</small><b>{s.players}</b></div><div><small>24시간 내 활동</small><b>{s.today}</b></div><div><small>총 턴</small><b>{s.turns}</b></div>
      <a href="#feedback" className={s.unread ? 'hot' : ''}><small>💬 안 읽은 의견</small><b>{s.unread}</b></a>
      <a href="#bugs" className={s.bugs ? 'hot' : ''}><small>🐞 버그 의심</small><b>{s.bugs}</b></a>
      <a href="#stuck" className={s.stuck ? 'hot' : ''}><small>⛔ 막힘</small><b>{s.stuck}</b></a>
      <a href="#drop"><small>🚪 이탈</small><b>{s.dropped}</b></a>
    </div>

    <section id="feedback"><h2>💬 의견 <label className="adminToggle"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} /> 안 읽은 것만</label></h2>
      {data.feedback.filter(f => !unreadOnly || !f.read).map(f => <div className={`adminFeedback${f.read ? ' read' : ''}`} key={f.id}>
        <small>{!f.read && '● '}{time(f.at)} · {who(f.pid)}{f.contact && ` (${f.contact})`}{f.game && ` · ${f.game}`}{f.snapshot && ` · Lv.${f.snapshot.level} · ${f.snapshot.goal || '목표 없음'}`}{f.bugLike && ' · 🐞 버그 의심'}</small>
        <p>{f.text}</p>
        {f.snapshot && f.snapshot.log.length > 0 && <details><summary>보낼 때 화면 (최근 기록)</summary><pre>{f.snapshot.log.join('\n')}</pre></details>}
        <div className="adminActions">{open(f.pid)}<button className="btn" onClick={() => markRead(f.id, !f.read)}>{f.read ? '안 읽음으로' : '읽음'}</button></div>
      </div>)}
      {!data.feedback.length && <p className="adminEmpty">아직 받은 의견이 없습니다.</p>}
    </section>

    <section id="bugs"><h2>🐞 버그 의심</h2>
      {data.bugs.length ? <table className="adminTable"><thead><tr><th>시간</th><th>이용자</th><th>출처</th><th>어디서</th><th>내용</th><th /></tr></thead>
        <tbody>{data.bugs.slice(0, 100).map((b, i) => <tr key={i}><td>{time(b.at)}</td><td>{who(b.pid)}</td><td>{b.source}</td><td>{b.where}</td><td className="adminMsg">{b.message}</td><td>{open(b.pid)}</td></tr>)}</tbody></table>
        : <p className="adminEmpty">감지된 버그가 없습니다.</p>}
    </section>

    <section id="stuck"><h2>⛔ 막힘 <small>최근 24시간 안에 활동했고, 같은 목표 10턴 이상 · 같은 행동 반복 · 빈 선택지 중 하나</small></h2>
      {data.stuck.length ? <table className="adminTable"><thead><tr><th>이용자</th><th>마지막 활동</th><th>게임</th><th>목표</th><th>이유</th><th /></tr></thead>
        <tbody>{data.stuck.map(x => <tr key={x.pid}><td>{who(x.pid)}</td><td>{time(x.last)}</td><td>{x.game}</td><td>{x.goal || '-'}</td><td>{x.reasons.join(' · ')}</td><td>{open(x.pid)}</td></tr>)}</tbody></table>
        : <p className="adminEmpty">막힌 이용자가 없습니다.</p>}
    </section>

    <section id="drop"><h2>🚪 이탈 지점 <small>24시간 넘게 안 들어온 이용자 (턴 한도에 걸린 사람 제외)</small></h2>
      <div className="adminDrop"><div><h3>마지막 목표별</h3>{data.drop.byGoal.length ? data.drop.byGoal.map(bar) : <p className="adminEmpty">아직 없습니다.</p>}</div><div><h3>진행한 턴별</h3>{data.drop.byTurns.map(bar)}</div></div>
    </section>

    <section><h2>이용자 목록</h2>
      <table className="adminTable"><thead><tr><th>이용자</th><th>지역 · 기기</th><th>가입</th><th>처음</th><th>마지막</th><th>방문</th><th>남은 턴</th><th>플레이</th><th>진행</th><th>상태</th></tr></thead>
        <tbody>{data.players.map(p => <tr key={p.pid} className="adminRow" onClick={() => setPid(p.pid)}>
          <td>{who(p.pid)}</td><td>{p.country || '-'} · {device(p.ua)}</td><td>{members.get(p.pid) ? time(members.get(p.pid)!.created) : '-'}</td><td>{time(p.first)}</td><td>{time(p.last)}</td><td>{p.visits}</td><td>{members.get(p.pid) ? `${Math.max(0, members.get(p.pid)!.limit - members.get(p.pid)!.used)} / ${members.get(p.pid)!.limit}` : '-'}</td><td>{p.turns ? `${p.turns}턴 · ${span(p.playMinutes)}${p.days > 1 ? ` · ${p.days}일` : ''}` : '-'}</td>
          <td>{p.saves.map(v => `${v.game} Lv.${v.level}`).join(', ') || '-'}</td>
          <td>{[p.stuck && '⛔', p.dropped && '🚪', p.limited && '한도', p.saves.some(v => v.dead) && '사망'].filter(Boolean).join(' ') || '진행 중'}</td>
        </tr>)}</tbody>
      </table>
      {!data.players.length && <p className="adminEmpty">아직 공개 주소로 들어온 이용자가 없습니다.</p>}
    </section>
    {player && <PlayerPanel player={player} who={who(player.pid)} member={members.get(player.pid)} onChanged={load} onClose={() => setPid('')} />}
  </main>;
}

function PlayerPanel({ player: p, who, member: m, onChanged, onClose }: { player: Player; who: React.ReactNode; member?: Member; onChanged: () => void; onClose: () => void }) {
  const [extra, setExtra] = useState('');
  const manage = (patch: { addTurns?: number; disabled?: boolean }) => m && void fetch('/api/beta/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: m.id, ...patch }) }).then(onChanged);
  const [save, setSave] = useState<{ key: string; log: string[]; raw: string } | null>(null);
  const [find, setFind] = useState('');
  const openSave = (key: string) => void fetch(`/api/beta/admin?save=${key}`, { cache: 'no-store' }).then(r => r.text()).then(raw => setSave({ key, raw, log: JSON.parse(raw).log || [] }));
  return <div className="feedbackBackdrop" onClick={onClose}><div className="adminPanel" onClick={e => e.stopPropagation()}>
    <div className="adminHead"><h2>{who} <small className="adminUa">{p.pid}</small></h2><button className="btn" onClick={onClose}>닫기</button></div>
    <p><b>IP</b> {p.ips.join(', ') || '-'} · <b>지역</b> {p.country || '-'} · <b>처음</b> {time(p.first)} · <b>마지막</b> {time(p.last)} · <b>턴</b> {p.turns}</p>
    <p><b>플레이</b> {p.turns}턴 · {span(p.playMinutes)} · {p.days}일 · <b>방문</b> {p.visits}회{p.turns ? ` · 턴당 평균 ${Math.round(p.playMinutes * 60 / p.turns)}초` : ''}</p>
    {m && <div className="adminSave"><p><b>계정</b> {m.id} · 가입 {time(m.created)} · 남은 턴 <b>{Math.max(0, m.limit - m.used)}</b> / {m.limit} (사용 {m.used}){m.disabled && ' · 이용 중지됨'}</p>
      <button className="btn" onClick={() => manage({ addTurns: 100 })}>+100턴</button> <button className="btn" onClick={() => manage({ addTurns: 500 })}>+500턴</button> <button className="btn" onClick={() => manage({ addTurns: -100 })}>-100턴</button> <input className="adminFind" type="number" value={extra} onChange={e => setExtra(e.target.value)} placeholder="턴 수 (빼려면 -)" /> <button className="btn" disabled={!Number(extra)} onClick={() => { manage({ addTurns: Number(extra) }); setExtra(''); }}>적용</button> <button className="btn" onClick={() => manage({ disabled: !m.disabled })}>{m.disabled ? '이용 재개' : '이용 중지'}</button></div>}
    <p className="adminUa">{p.ua}</p>
    {p.stuck && <p className="adminFlag">⛔ 막힘: {p.stuck.reasons.join(' · ')}</p>}
    {p.dropped && <p className="adminFlag">🚪 이탈: {p.dropped.goal} · {p.dropped.bucket}{p.dropped.dead && ' · 사망'}</p>}
    <h3>세이브</h3>
    {p.saves.map(v => <div className="adminSave" key={v.key}>
      <p><b>{v.game}</b> Lv.{v.level} · HP {v.hp} · 골드 {v.gold ?? '-'} · 진행도 {v.progress} · 행동 {v.acts}턴 · 기록 {v.logLength}줄{v.dead && ' · 사망'}<br />목표: {v.goal || '-'}</p>
      <button className="btn" onClick={() => openSave(v.key)}>전체 기록 보기</button> <a className="btn" href={`/api/beta/admin?save=${v.key}`} download={`session-${v.key}.json`}>세이브 JSON 받기</a>
    </div>)}
    {!p.saves.length && <p className="adminEmpty">세이브가 없습니다 (플레이 전).</p>}
    {save && <div className="adminSave"><h3>전체 기록 · {save.key} <input className="adminFind" value={find} onChange={e => setFind(e.target.value)} placeholder="기록에서 찾기" /></h3>
      <pre className="adminLog">{save.log.map((l, i) => `${String(i).padStart(4)}  ${l}`).filter(l => !find || l.includes(find)).join('\n')}</pre>
      <details><summary>세이브 원본 (상태 전체)</summary><pre className="adminLog">{save.raw}</pre></details>
    </div>}
    <h3>타임라인 (최근 60개)</h3>
    <pre className="adminLog">{[...p.timeline].reverse().map(t => `${time(t.at)}  ${KIND[t.kind] || t.kind}  ${t.text}`).join('\n') || '-'}</pre>
  </div></div>;
}
