import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Self-contained handoff ids.
 *
 * The id embedded in `#cart_id=` is a compact, signed snapshot of the handoff
 * (chain, branch, resolved product lines, expiry). Any server instance can turn it
 * back into a payload without shared storage, which is what makes the platform work
 * on serverless hosts (Vercel) as well as on a single long-running process.
 *
 * Format: base64url(JSON) + "." + base64url(HMAC-SHA256 prefix)
 */
const DEFAULT_SECRET = 'cart-handoff-dev-secret-change-me';

export function getSecret() {
  return process.env.HANDOFF_SECRET || DEFAULT_SECRET;
}

function sign(body, secret) {
  return createHmac('sha256', secret).update(body).digest().subarray(0, 16).toString('base64url');
}

export function encodeHandoffToken(data, { secret = getSecret() } = {}) {
  const body = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function decodeHandoffToken(token, { secret = getSecret() } = {}) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
