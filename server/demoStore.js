import { createHmac } from 'node:crypto';
import { getSecret } from '../src/handoff/handoffToken.js';

/**
 * A miniature "chain website" used to demonstrate and test the handoff end to end.
 * It has a guest cart held in a cookie (so it works on stateless hosts), a CSRF meta tag,
 * a JSON cart-add endpoint and a checkout page - the same surface the real chain adapters describe.
 */
export function registerDemoStore(router, { catalog, escapeHtml }) {
  const itemsById = new Map(catalog.items.map((i) => [i.storeItemId, i]));
  const CSRF = 'demo-csrf-' + createHmac('sha256', getSecret()).update('demo-store-csrf').digest('base64url').slice(0, 12);

  /** The guest cart lives in a cookie: { itemId: qty }. */
  function session(ctx) {
    const items = new Map();
    try {
      const raw = ctx.cookies.demo_cart;
      if (raw) for (const [k, v] of Object.entries(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))) items.set(k, Number(v));
    } catch { /* corrupt cookie -> empty cart */ }
    const cart = { items };
    const save = () => {
      const encoded = Buffer.from(JSON.stringify(Object.fromEntries(items)), 'utf8').toString('base64url');
      ctx.setHeader('Set-Cookie', `demo_cart=${encoded}; Path=/demo-store; SameSite=Lax; Max-Age=86400`);
    };
    return { cart, save };
  }

  function cartView(cart) {
    const lines = [...cart.items.entries()].map(([itemId, qty]) => {
      const item = itemsById.get(itemId);
      return { itemId, name: item?.name ?? itemId, qty, unitPrice: item?.price ?? 0, total: Math.round((item?.price ?? 0) * qty * 100) / 100 };
    });
    return { lines, total: Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100 };
  }

  function page(title, body, extraHead = '') {
    return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="demo-csrf" content="${CSRF}">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/demo-store/demo.css">
${extraHead}
</head>
<body>
<header class="demo-header"><a href="/demo-store/" class="brand">🛒 Demo Market</a><nav><a href="/demo-store/">קטלוג</a><a href="/demo-store/cart">העגלה שלי</a></nav></header>
<main class="demo-main">${body}</main>
<footer class="demo-footer">אתר הדגמה של רשת שיווק - משמש לבדיקת הזרקת עגלה. ה"תוסף" מסומלץ כאן ע"י טעינת <code>/handoff.js</code> בדף.</footer>
<script src="/handoff.js" data-api="/"></script>
</body>
</html>`;
  }

  router.get('/demo-store/', (ctx) => {
    session(ctx);
    const cards = catalog.items.map((i) => `<div class="card${i.inStock ? '' : ' oos'}"><div class="name">${escapeHtml(i.name)}</div><div class="price">₪${i.price.toFixed(2)}${i.isWeighted ? ' / ק"ג' : ''}</div><div class="sku">מק"ט ${escapeHtml(i.storeItemId)}</div>${i.inStock ? `<button data-add="${escapeHtml(i.storeItemId)}">הוסף לעגלה</button>` : '<span class="badge">אזל מהמלאי</span>'}</div>`).join('');
    return ctx.html(page('Demo Market - קטלוג', `<h1>Demo Market</h1><p class="lead">רשת שיווק מדומה. אם הגעת לכאן עם <code>#cart_id=…</code> בכתובת, העגלה נטענת אוטומטית.</p><div class="grid">${cards}</div>`, '<script defer src="/demo-store/demo.js"></script>'));
  });

  router.get('/demo-store/cart', (ctx) => {
    const { cart } = session(ctx);
    const view = cartView(cart);
    const rows = view.lines.map((l) => `<tr><td>${escapeHtml(l.name)}</td><td>${l.qty}</td><td>₪${l.unitPrice.toFixed(2)}</td><td>₪${l.total.toFixed(2)}</td></tr>`).join('');
    const body = `<h1>העגלה שלי</h1>
<table class="cart"><thead><tr><th>מוצר</th><th>כמות</th><th>מחיר</th><th>סה"כ</th></tr></thead><tbody>${rows || '<tr><td colspan="4">העגלה ריקה</td></tr>'}</tbody></table>
<div class="summary">סה"כ לתשלום: <strong>₪${view.total.toFixed(2)}</strong></div>
<section class="checkout"><h2>סיום הזמנה</h2>
<label>חלון אספקה <select><option>מחר, 09:00-13:00</option><option>מחר, 13:00-17:00</option><option>מחרתיים, 09:00-13:00</option></select></label>
<label>כרטיס אשראי <input placeholder="•••• •••• •••• ••••" disabled></label>
<button class="primary" disabled>לתשלום (הדגמה)</button>
<p class="note">בשלב זה, באתר אמיתי, המשתמש מתחבר לחשבונו (העגלה של האורח נשמרת) ומשלים תשלום. המערכת שלנו לא נוגעת בפרטי תשלום.</p></section>`;
    return ctx.html(page('Demo Market - העגלה שלי', body));
  });

  router.get('/demo-store/api/session', () => ({ ok: true, csrf: CSRF }));

  router.get('/demo-store/api/cart', (ctx) => {
    const { cart } = session(ctx);
    return { ok: true, cart: cartView(cart) };
  });

  router.post('/demo-store/api/cart/add', (ctx) => {
    const { cart, save } = session(ctx);
    if (ctx.req.headers['x-demo-csrf'] !== CSRF) return ctx.json({ ok: false, error: 'CSRF token missing or invalid' }, 403);
    const { itemId, qty } = ctx.body ?? {};
    const item = itemsById.get(String(itemId));
    if (!item) return ctx.json({ ok: false, error: `Unknown item ${itemId}` }, 200);
    if (!item.inStock) return ctx.json({ ok: false, error: `${item.name} - אזל מהמלאי` }, 200);
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) return ctx.json({ ok: false, error: 'invalid qty' }, 200);
    cart.items.set(item.storeItemId, (cart.items.get(item.storeItemId) ?? 0) + quantity);
    save();
    return { ok: true, itemId: item.storeItemId, qty: cart.items.get(item.storeItemId), cart: cartView(cart) };
  });

  router.post('/demo-store/api/cart/clear', (ctx) => {
    const { cart, save } = session(ctx);
    cart.items.clear();
    save();
    return { ok: true };
  });

  router.get('/demo-store/demo.css', (ctx) => ctx.text(DEMO_CSS, 200, 'text/css; charset=utf-8'));
  router.get('/demo-store/demo.js', (ctx) => ctx.text(DEMO_JS, 200, 'application/javascript; charset=utf-8'));

  return { csrf: CSRF, cartView };
}

const DEMO_CSS = `
body{margin:0;font-family:system-ui,Arial,sans-serif;background:#f4f1fb;color:#222}
.demo-header{display:flex;justify-content:space-between;align-items:center;background:#6f42c1;color:#fff;padding:12px 24px}
.demo-header a{color:#fff;text-decoration:none;margin-inline-start:16px}.brand{font-weight:700;font-size:20px;margin:0!important}
.demo-main{max-width:1100px;margin:24px auto;padding:0 16px}
.lead{color:#555}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.card{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.card.oos{opacity:.6}.name{font-weight:600;min-height:40px}.price{color:#6f42c1;font-weight:700;margin:6px 0}.sku{font-size:12px;color:#888}
button{background:#6f42c1;color:#fff;border:0;border-radius:6px;padding:8px 12px;cursor:pointer;margin-top:8px}button:disabled{opacity:.5;cursor:not-allowed}
.badge{display:inline-block;background:#eee;border-radius:6px;padding:4px 8px;font-size:12px;margin-top:8px}
table.cart{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden}
table.cart th,table.cart td{padding:10px;border-bottom:1px solid #eee;text-align:right}
.summary{font-size:18px;margin:16px 0}
.checkout{background:#fff;padding:16px;border-radius:10px}.checkout label{display:block;margin:10px 0}.checkout input,.checkout select{margin-inline-start:8px;padding:6px}
.note{color:#666;font-size:13px}
.demo-footer{text-align:center;color:#777;font-size:12px;padding:24px}
`;

const DEMO_JS = `
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-add]');
  if (!btn) return;
  const csrf = document.querySelector('meta[name="demo-csrf"]').content;
  const res = await fetch('/demo-store/api/cart/add', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-CSRF': csrf }, body: JSON.stringify({ itemId: btn.dataset.add, qty: 1 }) });
  const data = await res.json();
  btn.textContent = data.ok ? 'נוסף ✓' : 'שגיאה';
  setTimeout(() => { btn.textContent = 'הוסף לעגלה'; }, 1200);
});
`;
