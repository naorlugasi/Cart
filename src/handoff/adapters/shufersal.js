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
  },
  delayMs: 400,
  checkoutPath: '/online/he/cart',
  notes: 'Recorded from the live site. Weighted products (sellingMethod BY_WEIGHT) are not handled yet.',
};
