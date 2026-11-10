// Copies the latest turns recorded while playing (.next/turn-records.jsonl, written by app/api/dev/turn-record) into the
// test fixtures. Usage: npm run test:keep [count=5]. Then npm test records their results as the baseline.
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
const src = '.next/turn-records.jsonl', dst = 'tests/fixtures/turns.jsonl', count = Number(process.argv[2]) || 5;
if (!existsSync(src)) { console.log('녹화된 턴이 없습니다. 개발 서버에서 몇 턴 플레이한 뒤 다시 실행하세요.'); process.exit(0); }
const have = existsSync(dst) ? readFileSync(dst, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).name) : [];
const picked = readFileSync(src, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(t => t.session && t.data).slice(-count)
  .map(t => ({ name: `recorded ${t.at} ${String(t.message).slice(0, 30)}`, gameId: t.gameId, session: t.session, data: t.data, message: t.message, ctx: t.ctx }))
  .filter(t => !have.includes(t.name));
for (const t of picked) appendFileSync(dst, JSON.stringify(t) + '\n');
console.log(`${picked.length}개 턴을 ${dst}에 추가했습니다.`);
