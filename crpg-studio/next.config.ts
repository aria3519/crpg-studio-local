// The public beta builds into its own folder (scripts/beta.mjs) so it can run beside `npm run dev`.
// middleware.ts sees every request, and Next passes on only the first 10MB of a body it sees by default: a game with a
// large GIF cover (saved inside games.json) was cut short and refused as bad JSON. Visitors' saves stay capped in middleware.ts.
const config = { distDir: process.env.NEXT_DIST_DIR || '.next', experimental: { middlewareClientMaxBodySize: '64mb' } };
export default config;
