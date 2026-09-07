/**
 * Chain adapters describe, as plain data, how to populate a cart on each chain's website.
 * Because they are pure JSON they can be shipped to the browser extension / WebView at
 * handoff time, which means a change in a chain's API can be fixed server-side without
 * redeploying the extension (see docs/HANDOFF.md).
 *
 * Adapter shape:
 *  {
 *    chainId, name, baseUrl, hashParam, verified, guestCart,
 *    session: { method, path } | null,                 // optional warm-up request (guest session / cookies)
 *    add: {
 *      method, path, format: 'json' | 'form' | 'query',
 *      body: { field: '{{storeItemId}}', qty: '{{qty}}' },
 *      headers: { ... },
 *      csrf: { source: 'meta'|'cookie'|'input'|'global', name, header?, field?, required? } | null,
 *      success: { statusOk?: boolean, jsonPath?: string, equals?: any, textIncludes?: string }
 *    },
 *    delayMs, checkoutPath, notes
 *  }
 *
 * IMPORTANT: the endpoints of the real chains below are best-effort descriptions and are
 * flagged `verified: false` until confirmed against the live sites during the POC milestone
 * (record the real request from the browser DevTools "Network" tab and adjust the adapter).
 */
import shufersal from './shufersal.js';
import ramilevy from './ramilevy.js';
import carrefour from './carrefour.js';
import yochananof from './yochananof.js';
import demo from './demo.js';

const ADAPTERS = [shufersal, ramilevy, carrefour, yochananof, demo];

export function listAdapters() {
  return ADAPTERS.map((a) => ({ ...a }));
}

export function getAdapter(chainId) {
  return ADAPTERS.find((a) => a.chainId === chainId) ?? null;
}

/** Resolve `{{origin}}` placeholders (used by the local demo store) against the current server origin. */
export function materializeAdapter(adapter, { origin = '' } = {}) {
  const json = JSON.stringify(adapter).replace(/\{\{origin\}\}/g, origin.replace(/\/$/, ''));
  return JSON.parse(json);
}
