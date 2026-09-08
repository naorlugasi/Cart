/**
 * Hazi Hinam Online (shop.hazi-hinam.co.il) - custom Angular storefront over a ".../proxy/api" backend,
 * recorded 2026-09-08 (recon/hazihinam*.json).
 *
 * Guest session: GET /proxy/init returns an anonymous token and sets the H_UUID / H_Authentication cookies;
 * every later call is authenticated by those cookies (no Authorization header).
 * Lookup:  POST /proxy/api/item/getItemsBySearch {"Paging":{"Page":1,"PageSize":20},"Object":{"SearchPhrase":"<barcode>",...}}
 *          -> {IsOK:true, Results:{Items:[{Id, BarKod, Name, IsShakil, ...}]}}
 * Add:     POST /proxy/api/item/addItemToCart {"Object":{"ItemId":7357,"Quantity":1,"Type":1,"IsCalculateCart":false}}
 *          -> {IsOK:true, Results:{CartItemsCount}} ; unknown id -> {IsOK:false, ErrorResponse:{ErrorCode:6, ErrorDescription:"מידע לא קיים"}}
 * Cart:    GET /proxy/api/item/getItemsInCart -> Results.CartItems.Items[] (used by the end-to-end check).
 * No Content-Security-Policy and no bot wall, so the bookmarklet and automated checks both work.
 *
 * Item identity: the site's numeric item id, resolved from the barcode (BarKod) at runtime.
 */
export default {
  chainId: 'hazihinam',
  name: 'חצי חינם',
  baseUrl: 'https://shop.hazi-hinam.co.il/',
  hashParam: 'cart_id',
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'scripts/e2e-handoff.mjs (bookmarklet channel, guest cart, recon/e2e-hazihinam.json)',
  guestCart: true,
  domains: ['shop.hazi-hinam.co.il'],
  itemIdKind: 'barcode',
  session: { method: 'GET', path: '/proxy/init', headers: { Accept: 'application/json, text/plain, */*' } },
  lookup: {
    method: 'POST',
    path: '/proxy/api/item/getItemsBySearch',
    format: 'json',
    body: { Paging: { Page: 1, PageSize: 20 }, Object: { SearchPhrase: '{{barcode}}', SearchPhrases: null, ItemGroupping: null } },
    headers: { Accept: 'application/json, text/plain, */*' },
    bulk: false,
    itemsPath: 'Results.Items',
    matchField: 'BarKod',
    idField: 'Id',
  },
  add: {
    method: 'POST',
    path: '/proxy/api/item/addItemToCart',
    format: 'json',
    body: { Object: { ItemId: '{{resolvedId}}', Quantity: '{{qty}}', Type: 1, IsCalculateCart: false } },
    headers: { Accept: 'application/json, text/plain, */*' },
    success: { statusOk: true, jsonPath: 'IsOK', equals: true, errorPath: 'ErrorResponse.ErrorDescription' },
  },
  delayMs: 200,
  checkoutPath: '/checkout',
  notes: 'Recorded from the live site. Weighted items (IsShakil) are not handled yet.',
};
