/**
 * Local demo store served by this project (server/demoStore.js). It mimics a chain website
 * with a cookie-based guest cart so the whole handoff flow can be exercised offline.
 */
export default {
  chainId: 'demo',
  name: 'Demo Market (חנות הדגמה)',
  baseUrl: '{{origin}}/demo-store/',
  hashParam: 'cart_id',
  verified: true,
  guestCart: true,
  domains: ['localhost', '127.0.0.1'],
  session: { method: 'GET', path: '/demo-store/api/session' },
  add: {
    method: 'POST',
    path: '/demo-store/api/cart/add',
    format: 'json',
    body: { itemId: '{{storeItemId}}', qty: '{{qty}}' },
    headers: { Accept: 'application/json' },
    csrf: { source: 'meta', name: 'demo-csrf', header: 'X-Demo-CSRF', required: true },
    success: { jsonPath: 'ok', equals: true },
  },
  delayMs: 50,
  checkoutPath: '/demo-store/cart',
  notes: 'Fully working reference implementation of the adapter contract.',
};
