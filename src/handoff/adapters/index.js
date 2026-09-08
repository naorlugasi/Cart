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
 * The real chains' adapters were recorded from the live sites on 2026-09-08 (recon/*.json) and
 * proven end to end with the extension (scripts/e2e-extension.mjs, recon/e2e-<chain>.json).
 * Each adapter documents the mechanism, the item identity (barcode vs site code) and caveats;
 * docs/HANDOFF.md describes the full adapter contract (vars / session / lookup / add / strategy).
 */
import shufersal from './shufersal.js';
import ramilevy from './ramilevy.js';
import carrefour from './carrefour.js';
import yochananof from './yochananof.js';
import victory from './victory.js';
import tivtaam from './tivtaam.js';
import ybitan from './ybitan.js';
import mck from './mck.js';
import keshet from './keshet.js';
import quik from './quik.js';
import shukcity from './shukcity.js';
import expressmehadrin from './expressmehadrin.js';
import hazihinam from './hazihinam.js';
import demo from './demo.js';

const ADAPTERS = [shufersal, ramilevy, carrefour, yochananof, victory, tivtaam, ybitan, mck, keshet, quik, shukcity, expressmehadrin, hazihinam, demo];

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
