/* Front-end for the Cart Transfer & Redirect MVP. Vanilla JS, no build step. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const state = {
    cartId: null,
    cart: null,
    allProducts: [],
    categories: [],
    query: '',
    category: null,
    compare: null,
    lists: [],
    handoff: null,
    pollTimer: null,
    expanded: new Set(),
  };

  // ---- helpers ------------------------------------------------------------
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function money(n) {
    return `₪${Number(n ?? 0).toFixed(2)}`;
  }
  async function api(path, options = {}) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options, body: options.body ? JSON.stringify(options.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  let toastTimer;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }
  function setStep(n) {
    document.querySelectorAll('.steps li').forEach((li) => {
      const step = Number(li.dataset.step);
      li.classList.toggle('active', step === n);
      li.classList.toggle('done', step < n);
    });
  }

  // ---- cart ---------------------------------------------------------------
  async function ensureCart() {
    const saved = localStorage.getItem('cartId');
    if (saved) {
      try {
        const { cart } = await api(`/api/carts/${saved}`);
        state.cart = cart;
        state.cartId = cart.id;
        return;
      } catch { /* fall through and create a new cart */ }
    }
    const { cart } = await api('/api/carts', { method: 'POST' });
    state.cart = cart;
    state.cartId = cart.id;
    localStorage.setItem('cartId', cart.id);
  }

  function setCart(cart) {
    state.cart = cart;
    renderCart();
  }

  async function addProduct(productId) {
    const product = state.allProducts.find((p) => p.id === productId);
    const delta = product?.isWeighted ? 1 : 1;
    const { cart } = await api(`/api/carts/${state.cartId}/lines/${productId}/add`, { method: 'POST', body: { delta } });
    setCart(cart);
    toast(`${product?.name ?? productId} נוסף לסל`);
  }

  async function setQty(productId, qty) {
    const { cart } = await api(`/api/carts/${state.cartId}/lines`, { method: 'PUT', body: { productId, qty } });
    setCart(cart);
  }

  async function setSubstitute(productId, substituteProductId) {
    const line = state.cart.lines.find((l) => l.productId === productId);
    if (!line) return;
    const { cart } = await api(`/api/carts/${state.cartId}/lines`, { method: 'PUT', body: { productId, qty: line.qty, substituteProductId: substituteProductId || null } });
    setCart(cart);
  }

  function renderCart() {
    const ul = $('#cart-lines');
    const lines = state.cart?.lines ?? [];
    $('#cart-count').textContent = lines.length;
    if (!lines.length) {
      ul.innerHTML = '<li class="empty">הסל ריק. חפש מוצרים והוסף אותם לרשימה.</li>';
      return;
    }
    ul.innerHTML = lines.map((line) => {
      const p = line.product;
      const step = p.isWeighted ? 0.5 : 1;
      const candidates = state.allProducts.filter((x) => x.category === p.category && x.id !== p.id);
      const options = ['<option value="">ללא מוצר תחליפי</option>']
        .concat(candidates.map((c) => `<option value="${esc(c.id)}" ${line.substituteProductId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`))
        .join('');
      return `<li class="cart-line" data-id="${esc(p.id)}">
        <div><div class="name">${esc(p.name)}</div><div class="unit">${esc(p.unit)}${p.isWeighted ? ' (מוצר שקיל)' : ''}</div></div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="qty">
            <button type="button" data-action="dec" aria-label="הפחת">−</button>
            <input type="number" min="0" step="${step}" value="${line.qty}" data-action="qty" aria-label="כמות">
            <button type="button" data-action="inc" aria-label="הוסף">+</button>
          </div>
          <button type="button" class="remove" data-action="remove" title="הסר">✕</button>
        </div>
        <div class="sub-row"><span>תחליף אם חסר:</span><select data-action="sub">${options}</select></div>
      </li>`;
    }).join('');
  }

  $('#cart-lines').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.tagName === 'SELECT' || btn.tagName === 'INPUT') return;
    const li = btn.closest('.cart-line');
    const productId = li.dataset.id;
    const line = state.cart.lines.find((l) => l.productId === productId);
    const step = line.product.isWeighted ? 0.5 : 1;
    if (btn.dataset.action === 'inc') setQty(productId, Math.round((line.qty + step) * 100) / 100);
    if (btn.dataset.action === 'dec') setQty(productId, Math.round((line.qty - step) * 100) / 100);
    if (btn.dataset.action === 'remove') setQty(productId, 0);
  });
  $('#cart-lines').addEventListener('change', (e) => {
    const el = e.target;
    const li = el.closest('.cart-line');
    if (!li) return;
    if (el.dataset.action === 'qty') setQty(li.dataset.id, Number(el.value));
    if (el.dataset.action === 'sub') setSubstitute(li.dataset.id, el.value);
  });
  $('#clear-cart').addEventListener('click', async () => {
    if (!state.cart?.lines.length) return;
    const { cart } = await api(`/api/carts/${state.cartId}/lines`, { method: 'DELETE' });
    setCart(cart);
  });

  // ---- saved lists --------------------------------------------------------
  async function loadLists() {
    const { lists } = await api('/api/lists');
    state.lists = lists;
    renderLists();
  }
  function renderLists() {
    const box = $('#lists');
    if (!state.lists.length) { box.innerHTML = ''; return; }
    box.innerHTML = state.lists.map((l) => `<span class="list-chip" data-id="${esc(l.id)}">📋 ${esc(l.name)} <span class="muted">(${l.lines.length})</span> <button class="load" data-action="load" title="טען לסל">טען</button><button data-action="delete" title="מחק">✕</button></span>`).join('');
  }
  $('#lists').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('.list-chip').dataset.id;
    if (btn.dataset.action === 'load') {
      const { cart } = await api(`/api/lists/${id}/load`, { method: 'POST', body: { cartId: state.cartId, merge: false } });
      setCart(cart);
      toast('הרשימה נטענה לסל');
    } else if (btn.dataset.action === 'delete') {
      await api(`/api/lists/${id}`, { method: 'DELETE' });
      await loadLists();
    }
  });
  $('#save-list').addEventListener('click', async () => {
    if (!state.cart?.lines.length) { toast('הסל ריק'); return; }
    const name = prompt('שם הרשימה (למשל: קניות שבועיות)', 'קניות שבועיות');
    if (!name) return;
    await api('/api/lists', { method: 'POST', body: { name, cartId: state.cartId } });
    await loadLists();
    toast('הרשימה נשמרה');
  });

  // ---- catalog ------------------------------------------------------------
  async function loadCatalog() {
    const [{ products }, { categories }] = await Promise.all([api('/api/products?limit=500'), api('/api/categories')]);
    state.allProducts = products;
    state.categories = categories;
    renderCategories();
    await search();
  }
  function renderCategories() {
    const box = $('#categories');
    box.innerHTML = [`<button type="button" class="chip ${state.category ? '' : 'active'}" data-cat="">הכל</button>`]
      .concat(state.categories.map((c) => `<button type="button" class="chip ${state.category === c.name ? 'active' : ''}" data-cat="${esc(c.name)}">${esc(c.name)} <span class="muted">${c.count}</span></button>`))
      .join('');
  }
  $('#categories').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.category = chip.dataset.cat || null;
    renderCategories();
    search();
  });
  async function search() {
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.category) params.set('category', state.category);
    const { products } = await api(`/api/products?${params}`);
    const ul = $('#results');
    if (!products.length) { ul.innerHTML = '<li class="empty">לא נמצאו מוצרים</li>'; return; }
    ul.innerHTML = products.map((p) => `<li class="result">
      <div class="info"><div class="name">${esc(p.name)}</div><div class="meta">${esc(p.category)}${p.brand ? ' · ' + esc(p.brand) : ''}${p.gtin ? ' · ברקוד ' + esc(p.gtin) : ' · מוצר שקיל'}</div></div>
      <div class="price">~${money(p.basePrice)}<span class="muted small">/${esc(p.unit)}</span></div>
      <button type="button" class="btn btn-sm btn-primary" data-add="${esc(p.id)}">+ הוסף</button>
    </li>`).join('');
  }
  $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); state.query = $('#search-input').value.trim(); search(); });
  $('#search-input').addEventListener('input', (e) => { state.query = e.target.value.trim(); clearTimeout(search._t); search._t = setTimeout(search, 200); });
  $('#results').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (btn) addProduct(btn.dataset.add);
  });

  // ---- comparison ---------------------------------------------------------
  async function compare() {
    if (!state.cart?.lines.length) { toast('הוסף מוצרים לסל לפני ההשוואה'); return; }
    const address = $('#address-input').value.trim();
    const { address: parsed } = await api(`/api/carts/${state.cartId}/address`, { method: 'PUT', body: { address } });
    if (address && !parsed.city) $('#address-hint').textContent = 'לא זוהתה עיר בכתובת - מוצגות ברירות מחדל של כל רשת.';
    else if (parsed.city) $('#address-hint').textContent = `זוהתה העיר ${parsed.city}. מוצגים רק סניפים שמספקים לאזור.`;
    const started = performance.now();
    state.compare = await api(`/api/carts/${state.cartId}/compare`);
    state.expanded.clear();
    renderCompare(Math.round(performance.now() - started));
    setStep(2);
    $('#compare').hidden = false;
    $('#compare').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#compare-btn').addEventListener('click', compare);
  $('#address-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') compare(); });

  function renderCompare(ms) {
    const { rows, itemCount } = state.compare;
    $('#compare-meta').textContent = `${itemCount} מוצרים · ${rows.filter((r) => r.deliverable).length} רשתות מספקות · חושב ב-${ms} מ"ש`;
    const tbody = $('#compare-table tbody');
    tbody.innerHTML = rows.map((row) => {
      const cls = [row.isBestValue ? 'best' : '', row.deliverable ? '' : 'unavailable'].join(' ');
      if (!row.deliverable) {
        return `<tr class="${cls}"><td><div class="chain-name"><span class="chain-dot" style="background:${esc(row.color || '#999')}"></span>${esc(row.chainName)}</div></td><td colspan="4" class="muted">${esc(row.reason)}</td><td></td></tr>`;
      }
      const availability = row.isComplete
        ? `<span class="badge badge-ok">כל ${row.total} המוצרים זמינים</span>`
        : `<span class="badge badge-warn">${esc(row.availabilityText)}</span><ul class="missing-list">${row.missing.map((m) => `<li>✕ ${esc(m.name)}${m.status === 'out_of_stock' ? ' (אזל)' : ''}</li>`).join('')}</ul>`;
      const subs = row.substituted?.length ? `<ul class="sub-list">${row.substituted.map((s) => `<li>↔ ${esc(s.name)} → ${esc(s.with)}</li>`).join('')}</ul>` : '';
      const delivery = `${row.freeDelivery ? '<span class="status-ok">משלוח חינם</span>' : money(row.deliveryFee)}${row.deliveryEta ? `<div class="branch">${esc(row.deliveryEta)}</div>` : ''}${row.belowMinOrder ? `<div class="badge badge-bad">מתחת למינימום הזמנה (${money(row.minOrder)})</div>` : ''}`;
      const badges = `${row.isBestValue ? '<span class="badge badge-best">⭐ הסל המשתלם ביותר</span>' : ''}${row.verified ? '' : '<span class="badge badge-unverified" title="הזרקת העגלה לרשת זו טרם אומתה מול האתר החי">הזרקה טרם אומתה</span>'}`;
      return `<tr class="${cls}" data-chain="${esc(row.chainId)}">
        <td><div class="chain-name"><span class="chain-dot" style="background:${esc(row.color || '#999')}"></span>${esc(row.chainName)}</div><div class="branch">${esc(row.branch.name)}</div><div>${badges}</div></td>
        <td><div class="money">${money(row.subtotal)}</div>${row.savings ? `<div class="savings">חיסכון ממבצעים: ${money(row.savings)}</div>` : ''}</td>
        <td>${availability}${subs}</td>
        <td>${delivery}</td>
        <td><div class="money">${money(row.grandTotal)}</div></td>
        <td><button type="button" class="btn btn-primary" data-order="${esc(row.chainId)}" ${row.available ? '' : 'disabled'}>הזמן ב${esc(row.chainName.split(' (')[0])}</button><div><button type="button" class="btn btn-ghost btn-sm" data-details="${esc(row.chainId)}">פירוט</button></div></td>
      </tr>
      <tr class="details-row" data-details-for="${esc(row.chainId)}" ${state.expanded.has(row.chainId) ? '' : 'hidden'}><td colspan="6">${renderDetails(row)}</td></tr>`;
    }).join('');
  }

  function renderDetails(row) {
    const statusText = { ok: 'זמין', substituted: 'תחליף', missing: 'חסר', out_of_stock: 'אזל מהמלאי' };
    return `<table class="details-table"><thead><tr><th>מוצר</th><th>הפריט ברשת</th><th>כמות</th><th>מחיר יח'</th><th>מבצע</th><th>סה"כ</th><th>סטטוס</th></tr></thead><tbody>
      ${row.lines.map((l) => `<tr>
        <td>${esc(l.name)}</td>
        <td>${l.storeItemName ? `${esc(l.storeItemName)} <span class="muted">(${esc(l.storeItemId)}${l.matchMethod === 'fuzzy' ? `, התאמה ${Math.round(l.matchScore * 100)}%` : ''})</span>` : '-'}</td>
        <td>${l.qty} ${esc(l.unit || '')}</td>
        <td>${l.unitPrice != null ? money(l.unitPrice) : '-'}</td>
        <td>${l.promo ? esc(l.promo) : ''}</td>
        <td>${l.lineTotal ? money(l.lineTotal) : '-'}</td>
        <td class="status-${esc(l.status)}">${esc(statusText[l.status] || l.status)}</td>
      </tr>`).join('')}
    </tbody></table>`;
  }

  $('#compare-table').addEventListener('click', (e) => {
    const details = e.target.closest('[data-details]');
    if (details) {
      const id = details.dataset.details;
      const row = $(`tr[data-details-for="${CSS.escape(id)}"]`);
      row.hidden = !row.hidden;
      if (row.hidden) state.expanded.delete(id); else state.expanded.add(id);
      return;
    }
    const order = e.target.closest('[data-order]');
    if (order) startHandoff(order.dataset.order);
  });

  // ---- handoff ------------------------------------------------------------
  async function startHandoff(chainId) {
    let handoff;
    try {
      ({ handoff } = await api('/api/handoffs', { method: 'POST', body: { cartId: state.cartId, chainId } }));
    } catch (err) {
      toast(err.message);
      return;
    }
    state.handoff = handoff;
    setStep(3);
    const win = window.open(handoff.url, '_blank', 'noopener');
    renderHandoff(!!win);
    $('#handoff').hidden = false;
    $('#handoff').scrollIntoView({ behavior: 'smooth', block: 'start' });
    pollHandoff();
  }

  function renderHandoff(opened = true) {
    const h = state.handoff;
    const result = h.result;
    const statusCls = { pending: '', completed: 'success', partial: 'partial', failed: 'failed' }[h.status] || '';
    const statusText = {
      pending: `נפתח טאב חדש באתר ${h.chainName}. ממתין לטעינת העגלה...`,
      completed: 'העגלה נטענה בהצלחה, כעת בחר מועד משלוח ובצע תשלום באתר הרשת.',
      partial: `העגלה נטענה חלקית: ${result?.okCount} מתוך ${result?.total} מוצרים נוספו.`,
      failed: 'טעינת העגלה נכשלה. ודא שהתוסף מותקן או השתמש ב-Bookmarklet, ונסה שוב.',
    }[h.status];
    const failed = (h.failedItems ?? []).map((f) => `<li>✕ ${esc(f.name || f.storeItemId)} - ${esc(f.error || f.errorType || '')}</li>`).join('');
    const skipped = (h.skipped ?? []).map((s) => `<li>⚠ ${esc(s.name)} - ${s.reason === 'out_of_stock' ? 'אזל מהמלאי ברשת' : 'לא קיים ברשת'} (לא יועבר)</li>`).join('');
    $('#handoff-body').innerHTML = `<div class="handoff-box">
      <div class="handoff-status ${statusCls}"><strong>${esc(statusText)}</strong>${failed ? `<ul class="missing-list">${failed}</ul>` : ''}</div>
      ${opened ? '' : `<div class="handoff-status failed">הדפדפן חסם פתיחת חלון. <a href="${esc(h.url)}" target="_blank" rel="noopener">לחץ כאן לפתיחת אתר ${esc(h.chainName)}</a>.</div>`}
      <div><strong>${h.items.length} פריטים יועברו לעגלה:</strong><ul class="handoff-items">${h.items.map((i) => `<li>${esc(i.name)} × ${i.qty}</li>`).join('')}</ul>${skipped ? `<ul class="sub-list">${skipped}</ul>` : ''}</div>
      <div class="how">
        <div>איך זה עובד: הקישור שנפתח מכיל מזהה סל (<code>#cart_id=${esc(h.id)}</code>). תוסף הדפדפן (או ה-<a href="/bookmarklet">Bookmarklet</a>) מזהה אותו, מושך את רשימת המק"טים של ${esc(h.chainName)} מהשרת, ומוסיף את הפריטים לעגלה באתר הרשת באמצעות העוגיות שלך. אנחנו לא שומרים סיסמאות או פרטי תשלום.</div>
        <div style="margin-top:4px">קישור ידני: <a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.url)}</a></div>
      </div>
    </div>`;
  }

  function pollHandoff() {
    clearInterval(state.pollTimer);
    const started = Date.now();
    state.pollTimer = setInterval(async () => {
      if (!state.handoff) return;
      try {
        const { handoff } = await api(`/api/handoffs/${state.handoff.id}/status`);
        if (handoff.status !== state.handoff.status) {
          state.handoff = handoff;
          renderHandoff();
          if (handoff.status === 'completed') toast('העגלה נטענה בהצלחה');
        }
        if (handoff.status !== 'pending' || Date.now() - started > 120000) clearInterval(state.pollTimer);
      } catch { clearInterval(state.pollTimer); }
      loadAlerts();
    }, 2000);
  }

  // ---- alerts -------------------------------------------------------------
  async function loadAlerts() {
    try {
      const { alerts } = await api('/api/alerts?unresolved=1');
      $('#alerts-count').textContent = alerts.length;
      $('#alerts-link').hidden = alerts.length === 0;
      $('#alerts').hidden = alerts.length === 0;
      $('#alerts-list').innerHTML = alerts.map((a) => `<li class="alert ${esc(a.severity)}"><div><strong>${esc(a.chainId)}</strong> · ${esc(a.message)} <span class="muted small">(${a.count}×, ${new Date(a.lastSeenAt).toLocaleString('he-IL')})</span></div><button class="btn btn-sm" data-resolve="${esc(a.id)}">טופל</button></li>`).join('');
    } catch { /* ignore */ }
  }
  $('#alerts-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-resolve]');
    if (!btn) return;
    await api(`/api/alerts/${btn.dataset.resolve}/resolve`, { method: 'POST' });
    loadAlerts();
  });

  // ---- init ---------------------------------------------------------------
  (async function init() {
    try {
      await ensureCart();
      await loadCatalog();
      renderCart();
      if (state.cart.address?.raw) $('#address-input').value = state.cart.address.raw;
      await loadLists();
      await loadAlerts();
    } catch (err) {
      toast(`שגיאה בטעינה: ${err.message}`);
      console.error(err);
    }
  })();
})();
