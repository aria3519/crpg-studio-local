// The public beta builds into its own folder (scripts/beta.mjs) so it can run beside `npm run dev`.
// middleware.ts sees every request, and Next passes on only the first 10MB of a body it sees by default: a game with a
// large GIF cover (saved inside games.json) was cut short and refused as bad JSON. Visitors' saves stay capped in middleware.ts.
import { execSync } from 'node:child_process';
// Which commit this build is, shown on /admin; "+수정" when the build had uncommitted changes.
const git = (cmd: string) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
// The commit's whole subject, and its "- " lines as what the build changed (user 2026-11-23: the cut subject said too little).
const subject = git('log -1 --format=%s').slice(0, 120) || '?';
const notes = git('log -1 --format=%b').split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim()).slice(0, 12).join('\n');
const build = `${subject}${git('status --porcelain') ? ' +수정' : ''} · ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
const config = { distDir: process.env.NEXT_DIST_DIR || '.next', env: { BUILD_LABEL: build, BUILD_NOTES: notes }, experimental: { middlewareClientMaxBodySize: '64mb' } };
export default config;
