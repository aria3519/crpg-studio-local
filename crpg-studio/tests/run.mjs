// Runs the compiled tests; `--update` accepts the current turn results as the new baseline (works the same on Windows).
import { spawnSync } from 'node:child_process';
const env = { ...process.env, ...(process.argv.includes('--update') ? { UPDATE_TURNS: '1' } : {}) };
process.exit(spawnSync(process.execPath, ['--test', '.test-build/tests/turn.test.js', '.test-build/tests/gm-route.test.js'], { stdio: 'inherit', env }).status ?? 1);
