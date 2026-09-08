/**
 * Rami Levy Online - Nuxt SPA, recorded 2026-09-08 (recon/ramilevy*.json).
 *
 * There is no server-side guest cart: the cart of an anonymous visitor lives in the persisted Vuex
 * store (localStorage key "ramilevy", path cart.items = array of full product objects + "amount").
 * Every change is priced by POST /api/v2/cart {"store":331,"isClub":0,"supplyAt":<now>,"items":{"<id>":"1.00"},"meta":null}
 * (Authorization: Bearer <static anonymous token embedded in the site's JS bundle>, Locale: he) which
 * returns {items:[{id, quantity, price...}], price, sales...}. On page load the SPA re-reads localStorage
 * and prices it again, so filling the cart = resolve products + write them into localStorage + navigate.
 *
 * Item identity: the site's numeric product id (e.g. 425127) - resolved at runtime from the barcode via
 * POST /api/catalog {"store":331,"items":"<barcode,...>","size":N,"itemsBy":"barcode"} -> {data:[{id, barcode, ...}]}.
 * storeItemId is therefore the barcode. Logged-in users have a server cart (EcomToken) - not covered.
 */
const ANONYMOUS_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjIxNzE5ZDM2NzI0OGYyZDAwY2RkMThmM2U5ZmJhNGYxYTU1OTRkYjZlYjI3ODY4ZTlmZmJhNWI0YTdmNTc2Y2IwNDg3N2FiNjY1ODMwYWNjIn0.eyJhdWQiOiIzIiwianRpIjoiMjE3MTlkMzY3MjQ4ZjJkMDBjZGQxOGYzZTlmYmE0ZjFhNTU5NGRiNmV$";
const HEADERS = { authorization: 'Bearer ' + ANONYMOUS_TOKEN, locale: 'he', accept: 'application/json, text/plain, */*' };

export default {
  chainId: 'ramilevy',
  name: 'רמי לוי',
  baseUrl: 'https://www.rami-levy.co.il/he',
  hashParam: 'cart_id',
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'scripts/e2e-extension.mjs (browser extension, guest cart, recon/e2e-ramilevy.json)',
  guestCart: true,
  domains: ['www.rami-levy.co.il'],
  itemIdKind: 'barcode',
  strategy: 'localStorageCart',
  vars: {
    storeCode: { source: 'localStorage', name: 'ramilevy', path: 'cart.storeId', default: 331 },
  },
  session: null,
  lookup: {
    method: 'POST',
    path: '/api/catalog?',
    format: 'json',
    body: { store: '{{storeCode}}', items: '{{barcodes}}', size: '{{count}}', itemsBy: 'barcode' },
    headers: HEADERS,
    bulk: true,
    chunkSize: 40,
    itemsPath: 'data',
    matchField: 'barcode',
    idField: 'id',
  },
  add: {
    method: 'POST',
    path: '/api/v2/cart',
    format: 'json',
    bulk: true,
    items: { as: 'map', key: '{{resolvedId}}', value: '{{qtyFixed2}}' },
    body: { store: '{{storeCode}}', isClub: 0, supplyAt: '{{nowIso}}', items: '{{items}}', meta: null },
    headers: HEADERS,
    success: { statusOk: true, itemsPath: 'items', itemIdField: 'id' },
  },
  localStorageCart: { key: 'ramilevy', itemsPath: 'cart.items', idField: 'id', qtyField: 'amount' },
  delayMs: 0,
  redirectDelayMs: 300,
  checkoutPath: '/he',
  notes: 'Guest cart is client-side; the injector prices the items with the site API, writes them into the persisted store and reloads the site so the cart panel shows them.',
};
