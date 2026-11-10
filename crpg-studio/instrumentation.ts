// Every OpenAI call made by the API routes is reported to the local usage dashboard (cc-usage-dashboard, "OpenAI" tab):
// route, purpose tag, model, tokens, time. Only these numbers leave the process, never prompts or replies.
// A call site can name its purpose with an 'x-usage-tag' header; it is stripped here before the request goes to OpenAI.
type Fetch = typeof globalThis.fetch;
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const dashboard = (process.env.USAGE_DASHBOARD_URL || 'http://localhost:4318') + '/api/openai/calls';
  const wrap = (inner: Fetch): Fetch => {
    const wrapped = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith('https://api.openai.com/')) return inner(input, init);
      let tag = '';
      if (init?.headers && !(init.headers instanceof Headers) && !Array.isArray(init.headers)) {
        const { ['x-usage-tag']: t, ...rest } = init.headers as Record<string, string>;
        tag = String(t || '');
        init = { ...init, headers: rest };
      }
      // The route comes from the caller's stack: .next/server/app/api/gm/route.js → gm
      const route = /app[\\/]api[\\/]([^\s)]*?)[\\/]route\./.exec(new Error().stack || '')?.[1]?.replace(/\\/g, '/') || new URL(url).pathname;
      let model = '';
      try { model = typeof init?.body === 'string' ? String(JSON.parse(init.body).model || '') : init?.body instanceof FormData ? String(init.body.get('model') || '') : ''; } catch {}
      const start = Date.now();
      let res: Response;
      try { res = await inner(input, init); } catch (err) { report(inner, { route, tag, model, ok: false, status: 0, duration_ms: Date.now() - start }); throw err; }
      const duration_ms = Date.now() - start, status = res.status;
      res.clone().json().then(
        (j: { usage?: Record<string, any> }) => {
          const u = j?.usage || {};
          report(inner, {
            route, tag, model, ok: res.ok, status, duration_ms,
            input_tokens: u.prompt_tokens ?? u.input_tokens ?? 0,
            output_tokens: u.completion_tokens ?? u.output_tokens ?? 0,
            cached_tokens: u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0,
          });
        },
        () => report(inner, { route, tag, model, ok: res.ok, status, duration_ms }),
      );
      return res;
    };
    return Object.assign(wrapped, { __usageWrapped: true }) as Fetch;
  };
  // In dev, Next puts back the fetch it saved at startup whenever it rebuilds (router-server resetFetch), which dropped this
  // wrapper: nothing was recorded after the first code edit. Any plain fetch set later is wrapped again; Next's own patched
  // fetch is kept as is, since it calls through to the wrapped one it found.
  let current = wrap(globalThis.fetch);
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true, enumerable: true,
    get: () => current,
    set: (v: Fetch & { __nextPatched?: boolean; __usageWrapped?: boolean }) => { current = !v || v.__nextPatched || v.__usageWrapped ? v : wrap(v); },
  });
  function report(send: Fetch, row: Record<string, unknown>) {
    // Dashboard down → the game keeps running; the call just goes unrecorded.
    send(dashboard, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: 'crpg-studio', ts: Date.now(), ...row }) }).catch(() => {});
  }
}
