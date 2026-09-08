/**
 * Adapter template for chains on the Self Point ("ZuZ") e-commerce platform - the majority of the
 * Israeli online supermarkets (Carrefour, Victory, Tiv Taam, Yeinot Bitan, Mahsanei Hashuk, Keshet
 * Teamim, Quik, Shuk City, Express Mehadrin...). Recorded on Carrefour 2026-09-08 (recon/carrefour*.json)
 * and verified on every listed chain against its live API (recon/selfpoint-*.json).
 *
 * Guest cart = server cart addressed by id only (no cookies):
 *   create: POST /v2/retailers/<retailer>/branches/<branch>/carts?appId=4 {"lines":[...],"source":"Category"} -> 201 {cart:{id, lines}}
 *   update: POST .../carts/<id>?appId=4 + X-HTTP-Method-Override: PATCH
 *           {"lines":[{"quantity":1,"soldBy":null,"retailerProductId":16381075,"type":1}],"source":"Category"} -> 200 {cart:{id, lines:[...]}}
 *   The id lives in localStorage "frontend" (serverCartId, with branchId), which the SPA reads on load.
 *   Sending a retailerProductId again sets its quantity (idempotent); unknown ids are silently dropped.
 *
 * Item identity: retailerProductId, resolved from the barcode via
 *   GET /v2/retailers/<retailer>/branches/<branch>/products?appId=4&filters={"must":{"term":{"barcode":"<gtin>"}}}&from=0&size=1
 *   -> {total, products:[{id, ...}]} (the response omits the barcode, hence one lookup per item).
 */
export function selfPointAdapter({ chainId, name, baseUrl, domains, retailerId, defaultBranchId, verified = false, verifiedAt = null, verifiedBy = null, notes = '' }) {
  const branchPath = `/v2/retailers/${retailerId}/branches/{{branchId}}`;
  return {
    chainId,
    name,
    baseUrl,
    hashParam: 'cart_id',
    verified,
    verifiedAt,
    verifiedBy,
    guestCart: true,
    domains,
    platform: 'selfpoint',
    retailerId,
    itemIdKind: 'barcode',
    vars: {
      branchId: { source: 'localStorage', name: 'frontend', path: 'branchId', default: defaultBranchId },
      cartId: { source: 'localStorage', name: 'frontend', path: 'serverCartId' },
    },
    session: {
      skipIfVar: 'cartId',
      method: 'POST',
      path: `${branchPath}/carts`,
      query: { appId: 4 },
      format: 'json',
      body: { lines: [], source: 'Category' },
      headers: { Accept: 'application/json, text/plain, */*' },
      capture: [{ jsonPath: 'cart.id', var: 'cartId', localStorage: { key: 'frontend', path: 'serverCartId' } }],
    },
    lookup: {
      method: 'GET',
      path: `${branchPath}/products`,
      // Same visibility filters the storefront applies: a product that is inactive / out of stock at
      // this branch is reported as "not in catalog" instead of being silently dropped by the cart PATCH.
      query: { appId: 4, filters: '{"must":{"term":{"barcode":"{{barcode}}","branch.isActive":true,"branch.isVisible":true}},"mustNot":{"term":{"branch.isOutOfStock":true}}}', from: 0, size: 1 },
      headers: { Accept: 'application/json, text/plain, */*' },
      bulk: false,
      itemsPath: 'products',
      idField: 'id',
    },
    add: {
      method: 'POST',
      path: `${branchPath}/carts/{{cartId}}`,
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
    // the storefront opens its side cart on load when this flag is "0" - the customer sees the filled cart right away
    checkoutPrep: [{ localStorage: { key: 'frontend', path: 'cartClosed' }, value: '0' }],
    notes: `Self Point platform, retailer ${retailerId}; default branch ${defaultBranchId} until the visitor picks a delivery area (the adapter follows localStorage frontend.branchId). ${notes}`.trim(),
  };
}
