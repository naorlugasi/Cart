/**
 * Minimal Upstash Redis REST client (no dependency): one command per POST, or a pipeline.
 * https://upstash.com/docs/redis/features/restapi
 *
 * Works with Vercel KV as well (it is Upstash underneath): KV_REST_API_URL / KV_REST_API_TOKEN.
 */
export function createUpstashRedis({ url, token, fetch: fetchImpl = globalThis.fetch, timeoutMs = 5000 }) {
  if (!url || !token) throw new Error('upstash: url and token are required');
  const base = String(url).replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function post(pathname, body) {
    const res = await fetchImpl(base + pathname, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`upstash: HTTP ${res.status}${data?.error ? ` (${data.error})` : ''}`);
    return data;
  }

  return {
    kind: 'upstash',
    url: base,
    /** @returns {Promise<any>} the command's result */
    async command(...args) {
      const data = await post('', args.map(String));
      if (data?.error) throw new Error(`upstash: ${data.error}`);
      return data.result;
    },
    /** @param {Array<Array<string|number>>} commands @returns {Promise<any[]>} one result per command */
    async pipeline(commands) {
      const data = await post('/pipeline', commands.map((c) => c.map(String)));
      return data.map((entry) => {
        if (entry?.error) throw new Error(`upstash: ${entry.error}`);
        return entry.result;
      });
    },
  };
}

/** The client for the current environment, or null when no Redis is configured. */
export function upstashFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? createUpstashRedis({ url, token }) : null;
}
