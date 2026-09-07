import { URL } from 'node:url';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function compile(pattern) {
  const keys = [];
  const source = pattern.replace(/\/$/, '').replace(/\/:(\w+)/g, (_, key) => { keys.push(key); return '/([^/]+)'; });
  return { regex: new RegExp(`^${source}/?$`), keys };
}

export async function readBody(req, { limit = 1024 * 1024 } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'payload too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  const type = req.headers['content-type'] ?? '';
  if (type.includes('application/json') || /^[\s]*[{[]/.test(raw)) {
    try { return JSON.parse(raw); } catch { throw new HttpError(400, 'invalid JSON body'); }
  }
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  return raw;
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function createRouter() {
  const routes = [];

  const add = (method, pattern, handler) => {
    routes.push({ method, ...compile(pattern), handler });
  };

  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const ctx = {
      req,
      res,
      url,
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      params: {},
      origin: `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers.host ?? 'localhost'}`,
      cookies: parseCookies(req),
      body: null,
      status: 200,
      headers: {},
      json(data, status = 200) { this.status = status; this.headers['Content-Type'] = 'application/json; charset=utf-8'; return JSON.stringify(data); },
      text(data, status = 200, type = 'text/plain; charset=utf-8') { this.status = status; this.headers['Content-Type'] = type; return data; },
      html(data, status = 200) { return this.text(data, status, 'text/html; charset=utf-8'); },
      redirect(location, status = 302) { this.status = status; this.headers.Location = location; return ''; },
      setHeader(name, value) { this.headers[name] = value; },
    };

    let matched = false;
    let methodMismatch = false;
    for (const route of routes) {
      const match = route.regex.exec(url.pathname);
      if (!match) continue;
      matched = true;
      if (route.method !== req.method && route.method !== '*') { methodMismatch = true; continue; }
      route.keys.forEach((key, i) => { ctx.params[key] = decodeURIComponent(match[i + 1]); });
      if (req.method !== 'GET' && req.method !== 'HEAD') ctx.body = await readBody(req);
      const result = await route.handler(ctx);
      if (result === undefined && ctx.res.writableEnded) return true;
      const payload = typeof result === 'string' || Buffer.isBuffer(result) ? result : ctx.json(result ?? {});
      res.writeHead(ctx.status, ctx.headers);
      res.end(payload);
      return true;
    }
    if (matched && methodMismatch) throw new HttpError(405, 'method not allowed');
    return false;
  }

  return { add, handle, get: (p, h) => add('GET', p, h), post: (p, h) => add('POST', p, h), put: (p, h) => add('PUT', p, h), delete: (p, h) => add('DELETE', p, h), options: (p, h) => add('OPTIONS', p, h) };
}
