// Public beta: production build in .next-beta, served on port 3001 (the tunnel points here). `npm run beta` builds then
// serves; `npm run beta:start` serves the last build.
import { spawnSync } from 'node:child_process';
const env = { ...process.env, NEXT_DIST_DIR: '.next-beta' };
const run = args => { const r = spawnSync('npx', ['next', ...args], { stdio: 'inherit', env, shell: true }); if (r.status) process.exit(r.status); };
if (process.argv[2] !== 'start') run(['build']);
run(['start', '-p', '3001']);
