/**
 * Shufersal Online - SAP Commerce (Hybris) storefront, recorded 2026-09-08 (recon/shufersal*.json).
 *
 * Cart add (what the site's own "הוספה" button does, see _addToCartAjaxCall / z() in main.js):
 *   POST /online/he/cart/add?cartContext[openFrom]=CATALOG&cartContext[recommendationType]=REGULAR
 *   Content-Type: application/json, header CSRFToken: <meta name="_csrf">, X-Requested-With: XMLHttpRequest
 *   body {"productCodePost":"P_4131074","productCode":"P_4131074","sellingMethod":"BY_UNIT","qty":1,"frontQuantity":1,"comment":"","affiliateCode":""}
 *   -> 200 text/html: the re-rendered mini-cart. Success = the fragment contains
 *      <article ... data-product-code="P_4131074" data-entry-number="0" data-entry-qty="1.0">; a rejected
 *      add returns the same fragment with the message "הוספת הפריט נכשלה".
 * Guest carts work (JSESSIONID session, cookie miglog-cart); the cart page itself redirects to /login
 * for guests, the items are kept in the session and merged into the account on login.
 *
 * Item identity: the site's product code "P_" + ItemCode of the price file. For barcodes under the
 * chain's own 729000 prefix the code is the number after the prefix (7290000066318 -> P_66318,
 * 7290004131074 -> P_4131074, 7290000522319 -> P_522319); other barcodes are used as-is
 * (P_7290107932080). scripts/fetch-prices.mjs applies this rule (shufersalCode); verified on the live
 * cart API. A few imported items (non-729 barcodes) are still rejected by the site.
 */
export default {
  chainId: 'shufersal',
  name: 'שופרסל',
  baseUrl: 'https://www.shufersal.co.il/online/he/',
  hashParam: 'cart_id',
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'scripts/e2e-extension.mjs (browser extension, guest cart, recon/e2e-shufersal.json)',
  guestCart: true,
  domains: ['www.shufersal.co.il'],
  itemIdKind: 'site-code',
  session: { method: 'GET', path: '/online/he/cart/load?restoreCart=true', headers: { 'X-Requested-With': 'XMLHttpRequest' } },
  add: {
    method: 'POST',
    path: '/online/he/cart/add',
    query: { 'cartContext[openFrom]': 'CATALOG', 'cartContext[recommendationType]': 'REGULAR' },
    format: 'json',
    body: { productCodePost: '{{storeItemId}}', productCode: '{{storeItemId}}', sellingMethod: 'BY_UNIT', qty: '{{qty}}', frontQuantity: '{{qty}}', comment: '', affiliateCode: '' },
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01' },
    csrf: { source: 'meta', name: '_csrf', header: 'CSRFToken', required: true },
    success: { statusOk: true, textIncludes: 'data-product-code="{{storeItemId}}"', errorText: 'הוספת הפריט נכשלה' },
    // Weighed items (verified 2026-09-22 on the live guest cart, P_22 עגבניה): the same request with
    // sellingMethod BY_WEIGHT and the quantity in kilograms as a 2-decimal string ("0.50"); the mini-cart
    // fragment comes back with data-entry-qty="0.5". The page's own qty input steps by data-inc="0.5"
    // (minimum 0.05 kg). Without the session warm-up above the add answers 400, weighed or not.
    weighted: {
      body: { productCodePost: '{{storeItemId}}', productCode: '{{storeItemId}}', sellingMethod: 'BY_WEIGHT', qty: '{{qtyFixed2}}', frontQuantity: '{{qtyFixed2}}', comment: '', affiliateCode: '' },
    },
  },
  weighted: { step: 0.5 },
  delayMs: 400,
  checkoutPath: '/online/he/cart',
  notes: 'Recorded from the live site. Weighed products go in with sellingMethod BY_WEIGHT and a quantity in kilograms (verified 22.9.2026).',
};
