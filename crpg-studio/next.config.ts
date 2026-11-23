// The public beta builds into its own folder (scripts/beta.mjs) so it can run beside `npm run dev`.
// middleware.ts sees every request, and Next passes on only the first 10MB of a body it sees by default: a game with a
// large GIF cover (saved inside games.json) was cut short and refused as bad JSON. Visitors' saves stay capped in middleware.ts.
import { execSync } from 'node:child_process';
// Which commit this build is, shown on /admin; "+수정" when the build had uncommitted changes.
const git = (cmd: string) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
// The commit's subject up to its colon ("선택지·장소·위치 정리: …" → "선택지·장소·위치 정리"), cut at 30 characters.
const subject = git('log -1 --format=%s').split(':')[0].slice(0, 30) || '?';
const build = `${subject}${git('status --porcelain') ? ' +수정' : ''} · ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
const config = { distDir: process.env.NEXT_DIST_DIR || '.next', env: { BUILD_LABEL: build }, experimental: { middlewareClientMaxBodySize: '64mb' } };
export default config;
