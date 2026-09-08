/**
 * Yochananof Online - Magento 2 (PWA, GraphQL at https://api.yochananof.co.il/graphql), recorded 2026-09-08
 * (recon/yochananof*.json).
 *
 * Guest cart: mutation CreateEmptyCart -> cart id kept in localStorage "cartId" (no cookies involved).
 *   POST https://api.yochananof.co.il/graphql {"operationName":"AddProductsToCart","variables":{"cartId":"<id>","cartItems":[{"sku":"7290117765951","quantity":1}]},"query":"mutation AddProductsToCart(...)"}
 *   -> 200 {"data":{"addProductsToCart":{"user_errors":[],"cart":{"id":..,"total_quantity":1,...}}}}
 *   Unknown SKU -> user_errors:[{"code":"PRODUCT_NOT_FOUND","message":"Could not find a product with SKU ..."}]
 *   Unknown cart -> {"errors":[{"message":"Could not find a cart with ID ..."}],"data":{"addProductsToCart":null}}
 *   CORS allows the site origin; the request needs no credentials (x-magento-cache-id is optional).
 *
 * Item identity: the Magento SKU, which is the barcode.
 */
const ADD_MUTATION = 'mutation AddProductsToCart($cartId: String!, $cartItems: [CartItemInput!]!) { addProductsToCart(cartId: $cartId, cartItems: $cartItems) { user_errors { code message } cart { id total_quantity } } }';

export default {
  chainId: 'yochananof',
  name: 'יוחננוף',
  baseUrl: 'https://yochananof.co.il/',
  hashParam: 'cart_id',
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'scripts/e2e-extension.mjs (browser extension, guest cart, recon/e2e-yochananof.json)',
  guestCart: true,
  domains: ['yochananof.co.il', 'www.yochananof.co.il'],
  itemIdKind: 'barcode',
  vars: {
    // The PWA creates its guest cart asynchronously right after load; wait for it instead of racing it.
    cartId: { source: 'localStorage', name: 'cartId', waitMs: 10000 },
    cacheId: { source: 'localStorage', name: 'cache-id', default: '' },
  },
  session: {
    skipIfVar: 'cartId',
    method: 'POST',
    path: 'https://api.yochananof.co.il/graphql',
    format: 'json',
    credentials: 'omit',
    body: { operationName: 'CreateEmptyCart', variables: {}, query: 'mutation CreateEmptyCart { createEmptyCart(input: null) }' },
    capture: [{ jsonPath: 'data.createEmptyCart', var: 'cartId', localStorage: { key: 'cartId' } }],
  },
  add: {
    method: 'POST',
    path: 'https://api.yochananof.co.il/graphql',
    format: 'json',
    credentials: 'omit',
    body: { operationName: 'AddProductsToCart', variables: { cartId: '{{cartId}}', cartItems: [{ sku: '{{storeItemId}}', quantity: '{{qty}}' }] }, query: ADD_MUTATION },
    headers: { 'x-magento-cache-id': '{{cacheId}}' },
    success: { statusOk: true, jsonPath: 'data.addProductsToCart.user_errors.length', equals: 0, errorPath: 'data.addProductsToCart.user_errors.0.message' },
  },
  delayMs: 200,
  checkoutPath: '/',
  notes: 'Recorded from the live site. The cart is a side drawer on the home page (no dedicated cart URL).',
};
