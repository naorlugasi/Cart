/**
 * Carrefour Israel Online - "ZuZ" (Self Point) AngularJS storefront, retailer 1540, recorded 2026-09-08
 * (recon/carrefour*.json). The site sits behind Cloudflare bot protection: automated browsers get a
 * challenge page, real browsers (and therefore the extension) pass.
 *
 * Guest cart = server cart addressed by id only (no cookies):
 *   create: POST /v2/retailers/1540/branches/<branch>/carts?appId=4 {"lines":[...],"source":"Category"} -> 201 {cart:{id, lines}}
 *   update: POST /v2/retailers/1540/branches/<branch>/carts/<id>?appId=4 with header X-HTTP-Method-Override: PATCH
 *           {"lines":[{"quantity":1,"soldBy":null,"retailerProductId":16381075,"type":1}],"source":"Category"} -> 200 {cart:{id, lines:[{retailerProductId, quantity, ...}]}}
 *   The id is kept in localStorage "frontend" as serverCartId (with branchId), which the SPA reads on load.
 *   Sending the same retailerProductId again sets its quantity (idempotent); unknown ids are silently dropped.
 *
 * Item identity: retailerProductId, resolved from the barcode via
 *   GET /v2/retailers/1540/branches/<branch>/products?appId=4&filters={"must":{"term":{"barcode":"<gtin>"}}}&from=0&size=1
 *   -> {total, products:[{id, ...}]} (the response omits the barcode field, hence one lookup per item).
 */
export default {
  chainId: 'carrefour',
  name: 'קרפור',
  baseUrl: 'https://www.carrefour.co.il/',
  hashParam: 'cart_id',
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'injector run inside the live site from a real (non-automated) browser via the bookmarklet channel, cart lines confirmed by the site API (recon/e2e-carrefour.json); Cloudflare blocks automated Chromium so scripts/e2e-extension.mjs needs --manual for this chain',
  guestCart: true,
  domains: ['www.carrefour.co.il', 'carrefour.co.il'],
  itemIdKind: 'barcode',
  vars: {
    branchId: { source: 'localStorage', name: 'frontend', path: 'branchId', default: 3003 },
    cartId: { source: 'localStorage', name: 'frontend', path: 'serverCartId' },
  },
  session: {
    skipIfVar: 'cartId',
    method: 'POST',
    path: '/v2/retailers/1540/branches/{{branchId}}/carts',
    query: { appId: 4 },
    format: 'json',
    body: { lines: [], source: 'Category' },
    headers: { Accept: 'application/json, text/plain, */*' },
    capture: [{ jsonPath: 'cart.id', var: 'cartId', localStorage: { key: 'frontend', path: 'serverCartId' } }],
  },
  lookup: {
    method: 'GET',
    path: '/v2/retailers/1540/branches/{{branchId}}/products',
    query: { appId: 4, filters: '{"must":{"term":{"barcode":"{{barcode}}"}}}', from: 0, size: 1 },
    headers: { Accept: 'application/json, text/plain, */*' },
    bulk: false,
    itemsPath: 'products',
    idField: 'id',
  },
  add: {
    method: 'POST',
    path: '/v2/retailers/1540/branches/{{branchId}}/carts/{{cartId}}',
    query: { appId: 4 },
    format: 'json',
    bulk: true,
    items: { as: 'list', template: { quantity: '{{qty}}', soldBy: null, retailerProductId: '{{resolvedId}}', type: 1 } },
    body: { lines: '{{items}}', source: 'Category' },
    headers: { 'X-HTTP-Method-Override': 'PATCH', Accept: 'application/json, text/plain, */*' },
    success: { statusOk: true, itemsPath: 'cart.lines', itemIdField: 'retailerProductId' },
  },
  delayMs: 150,
  checkoutPath: '/',
  notes: 'Recorded from the live site. Branch 3003 (Kfar Saba online) is the default until the visitor picks a delivery area; the adapter follows localStorage frontend.branchId.',
};
