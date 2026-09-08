/* סל חכם - front-end. Vanilla JS, no build step. The cart lives in the browser; the API is stateless. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const STORAGE_KEY = 'smartcart:state:v1';
  const TINTS = {
    'חלב וביצים': '#eef4ff', 'ירקות ופירות': '#e9f8ea', 'בשר ועוף': '#fdeceb', 'מאפים ולחם': '#fff3e3',
    'יבשים ואפייה': '#f7f1e5', 'שימורים': '#f0f0f5', 'חטיפים וממתקים': '#fff0f6', 'משקאות': '#e6f6fb',
    'ניקיון וטואלטיקה': '#eaf7f5', 'מעדנייה': '#fff8e1',
  };
  const CATEGORY_ICONS = {
    'חלב וביצים': '🥛', 'ירקות ופירות': '🥬', 'בשר ועוף': '🍗', 'מאפים ולחם': '🍞', 'יבשים ואפייה': '🌾',
    'שימורים': '🥫', 'חטיפים וממתקים': '🍫', 'משקאות': '🥤', 'ניקיון וטואלטיקה': '🧴', 'מעדנייה': '🧀',
  };

  const state = {
    cart: { lines: [], address: null },
    lists: [],
    products: [],
    categories: [],
    chains: [],
    query: '',
    category: null,
    results: [],
    compare: null,
    expanded: new Set(),
    handoff: null,
    pollTimer: null,
    openSubPicker: null,
  };

  // ---------- helpers ----------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `₪${Number(n ?? 0).toFixed(2)}`;
  const money0 = (n) => `₪${Math.round(Number(n ?? 0))}`;
  const productOf = (id) => state.products.find((p) => p.id === id) ?? { id, name: id, category: '', unit: '', icon: '🛒', isWeighted: false };
  const tint = (p) => TINTS[p.category] ?? '#f1f3ee';
  const chainOf = (id) => state.chains.find((c) => c.id === id);
  const shortName = (name) => String(name).split(' (')[0];

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
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function setStep(n) {
    document.querySelectorAll('.steps-nav li').forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('is-active', s === n);
      li.classList.toggle('is-done', s < n);
    });
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.cart) state.cart = { lines: saved.cart.lines ?? [], address: saved.cart.address ?? null };
      if (Array.isArray(saved?.lists)) state.lists = saved.lists;
    } catch { /* ignore */ }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart: state.cart, lists: state.lists })); } catch { /* ignore */ }
  }
  const cleanLines = () => state.cart.lines.map(({ productId, qty, substituteProductId }) => ({ productId, qty, substituteProductId: substituteProductId || null }));

  // ---------- cart mutations ----------
  function setLines(lines) {
    state.cart.lines = lines;
    saveState();
    renderCart();
    renderProducts();
  }
  function lineOf(id) { return state.cart.lines.find((l) => l.productId === id); }
  function addProduct(id) {
    const lines = cleanLines();
    const line = lines.find((l) => l.productId === id);
    if (line) line.qty = round(line.qty + 1);
    else lines.push({ productId: id, qty: 1, substituteProductId: null });
    setLines(lines);
    if (!line) toast(`${productOf(id).name} נוסף לסל`);
  }
  function setQty(id, qty) {
    let lines = cleanLines();
    if (!Number.isFinite(qty) || qty <= 0) lines = lines.filter((l) => l.productId !== id);
    else { const l = lines.find((x) => x.productId === id); if (l) l.qty = round(qty); }
    setLines(lines);
  }
  function setSubstitute(id, subId) {
    const lines = cleanLines();
    const l = lines.find((x) => x.productId === id);
    if (l) l.substituteProductId = subId || null;
    setLines(lines);
  }
  const round = (n) => Math.round(n * 100) / 100;
  const stepOf = (p) => (p.isWeighted ? 0.5 : 1);

  // ---------- catalog ----------
  async function loadCatalog() {
    const [{ products }, { categories }, { chains }, cities] = await Promise.all([
      api('/api/products?limit=500'), api('/api/categories'), api('/api/chains'), api('/api/cities').catch(() => ({ cities: [] })),
    ]);
    state.products = products;
    state.categories = categories;
    state.chains = chains;
    $('#chain-count').textContent = chains.length;
    $('#cities').innerHTML = (cities.cities ?? []).map((c) => `<option value="${esc(c)}">`).join('');
    renderCategories();
    renderChainsStrip();
    await search();
  }

  function renderCategories() {
    $('#categories').innerHTML = [`<button type="button" class="tab ${state.category ? '' : 'is-active'}" data-cat="">🛒 הכל</button>`]
      .concat(state.categories.map((c) => `<button type="button" class="tab ${state.category === c.name ? 'is-active' : ''}" data-cat="${esc(c.name)}">${CATEGORY_ICONS[c.name] ?? ''} ${esc(c.name)} <span class="tab-count">${c.count}</span></button>`))
      .join('');
  }
  $('#categories').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    state.category = tab.dataset.cat || null;
    renderCategories();
    search();
  });

  async function search() {
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.category) params.set('category', state.category);
    params.set('limit', '60');
    const { products } = await api(`/api/products?${params}`);
    state.results = products;
    renderProducts();
  }
  function renderProducts() {
    const grid = $('#product-grid');
    if (!state.results.length) {
      grid.innerHTML = `<div class="empty-state"><div style="font-size:34px">🔎</div>לא מצאנו "${esc(state.query)}". נסו שם אחר או עברו לפי קטגוריה.</div>`;
      return;
    }
    grid.innerHTML = state.results.map((p) => {
      const line = lineOf(p.id);
      const range = p.priceRange;
      const price = !range ? '<span class="muted">לא זמין כרגע</span>'
        : range.min === range.max ? money(range.min) : `${money(range.min)} <span class="range">– ${money(range.max)}</span>`;
      const action = line
        ? stepperHtml(p, line.qty)
        : `<button type="button" class="add-btn" data-add="${esc(p.id)}">+ הוסף</button>`;
      return `<article class="product-card ${line ? 'in-cart' : ''}" data-id="${esc(p.id)}">
        <div class="product-top">
          <div class="product-icon" style="--tint:${tint(p)}">${p.icon}</div>
          <div>
            <h3 class="product-name">${esc(p.name)}</h3>
            <div class="product-meta">${[p.brand, p.size].filter(Boolean).map(esc).join(' · ') || esc(p.category)}${p.isWeighted ? ' · לפי ק"ג' : ''}</div>
          </div>
        </div>
        <div class="product-bottom">
          <div><div class="product-price">${price}<small>ל${esc(p.unit)}</small></div>${range ? `<span class="product-chains">ב-${range.chains} מתוך ${state.chains.length} רשתות</span>` : ''}</div>
          ${action}
        </div>
      </article>`;
    }).join('');
  }
  function stepperHtml(p, qty) {
    return `<div class="stepper" data-id="${esc(p.id)}">
      <button type="button" data-action="inc" aria-label="הוסף">+</button>
      <input type="number" min="0" step="${stepOf(p)}" value="${qty}" data-action="qty" aria-label="כמות">
      ${p.isWeighted ? '<span class="unit">ק"ג</span>' : ''}
      <button type="button" data-action="dec" aria-label="הפחת">−</button>
    </div>`;
  }
  function handleStepper(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.tagName === 'INPUT') return false;
    const box = btn.closest('.stepper');
    if (!box) return false;
    const id = box.dataset.id;
    const line = lineOf(id);
    if (!line) return true;
    const step = stepOf(productOf(id));
    if (btn.dataset.action === 'inc') setQty(id, line.qty + step);
    if (btn.dataset.action === 'dec') setQty(id, line.qty - step);
    return true;
  }
  function handleStepperChange(e) {
    const input = e.target;
    if (input.dataset.action !== 'qty') return false;
    const box = input.closest('.stepper');
    if (!box) return false;
    setQty(box.dataset.id, Number(input.value));
    return true;
  }
  $('#product-grid').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { addProduct(add.dataset.add); return; }
    handleStepper(e);
  });
  $('#product-grid').addEventListener('change', handleStepperChange);

  $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); state.query = $('#search-input').value.trim(); search(); });
  $('#search-input').addEventListener('input', (e) => {
    state.query = e.target.value.trim();
    $('#search-clear').hidden = !state.query;
    clearTimeout(search._t);
    search._t = setTimeout(search, 180);
  });
  $('#search-clear').addEventListener('click', () => { $('#search-input').value = ''; state.query = ''; $('#search-clear').hidden = true; search(); });

  // ---------- cart panel ----------
  function estimate() {
    let min = 0; let max = 0;
    for (const l of state.cart.lines) {
      const r = productOf(l.productId).priceRange;
      if (!r) continue;
      min += r.min * l.qty; max += r.max * l.qty;
    }
    return { min, max };
  }
  function renderCart() {
    const lines = state.cart.lines;
    const count = lines.length;
    $('#cart-count').textContent = count;
    $('#cart-count-badge').textContent = count;
    $('#cart-fab-count').textContent = count;
    $('#cart-fab').hidden = count === 0;
    $('#compare-btn').disabled = count === 0;
    const est = estimate();
    $('#cart-estimate').textContent = count ? (est.min === est.max ? money0(est.min) : `${money0(est.min)} – ${money0(est.max)}`) : '₪0';

    const ul = $('#cart-lines');
    if (!count) {
      ul.innerHTML = '<li class="cart-empty"><div class="big">🧺</div>הסל ריק.<br>הוסיפו מוצרים מהקטלוג כדי להשוות מחירים.</li>';
      return;
    }
    ul.innerHTML = lines.map((l) => {
      const p = productOf(l.productId);
      const sub = l.substituteProductId ? productOf(l.substituteProductId) : null;
      const open = state.openSubPicker === p.id;
      const candidates = state.products.filter((x) => x.category === p.category && x.id !== p.id);
      return `<li class="cart-item" data-id="${esc(p.id)}">
        <div class="cart-item-icon" style="--tint:${tint(p)}">${p.icon}</div>
        <div>
          <div class="cart-item-name">${esc(p.name)}</div>
          <div class="cart-item-meta">
            <span>${esc(p.size || p.unit)}</span>
            <button type="button" class="sub-link ${sub ? 'has-sub' : ''}" data-sub-toggle="${esc(p.id)}">${sub ? `↔ תחליף: ${esc(sub.name)}` : '+ מוצר תחליפי'}</button>
          </div>
        </div>
        <div class="cart-item-actions">
          ${stepperHtml(p, l.qty)}
          <button type="button" class="remove-btn" data-remove="${esc(p.id)}" aria-label="הסר">✕</button>
        </div>
        ${open ? `<div class="sub-picker"><span>אם חסר ברשת, קחו במקום:</span><select data-sub-select="${esc(p.id)}"><option value="">ללא תחליף</option>${candidates.map((c) => `<option value="${esc(c.id)}" ${sub?.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
      </li>`;
    }).join('');
  }
  $('#cart-lines').addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove]');
    if (remove) { setQty(remove.dataset.remove, 0); return; }
    const subToggle = e.target.closest('[data-sub-toggle]');
    if (subToggle) { state.openSubPicker = state.openSubPicker === subToggle.dataset.subToggle ? null : subToggle.dataset.subToggle; renderCart(); return; }
    handleStepper(e);
  });
  $('#cart-lines').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-sub-select]');
    if (sel) { setSubstitute(sel.dataset.subSelect, sel.value); state.openSubPicker = null; renderCart(); return; }
    handleStepperChange(e);
  });
  $('#clear-cart').addEventListener('click', () => { if (state.cart.lines.length && confirm('לרוקן את הסל?')) setLines([]); });

  // saved lists (browser storage)
  function renderLists() {
    $('#lists').innerHTML = state.lists.map((l) => `<span class="list-chip" data-id="${esc(l.id)}">📋 ${esc(l.name)} <span class="muted">(${l.lines.length})</span><button type="button" class="load" data-action="load">טען</button><button type="button" data-action="delete" aria-label="מחק">✕</button></span>`).join('');
  }
  $('#lists').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('.list-chip').dataset.id;
    const list = state.lists.find((l) => l.id === id);
    if (!list) return;
    if (btn.dataset.action === 'load') { setLines(list.lines.map((l) => ({ ...l }))); toast(`"${list.name}" נטענה לסל`); }
    else { state.lists = state.lists.filter((l) => l.id !== id); saveState(); renderLists(); }
  });
  $('#save-list').addEventListener('click', () => {
    if (!state.cart.lines.length) { toast('הסל ריק'); return; }
    const name = prompt('שם לרשימה', 'קניות שבועיות');
    if (!name) return;
    state.lists.unshift({ id: `list_${Date.now().toString(36)}`, name, lines: cleanLines(), createdAt: new Date().toISOString() });
    saveState(); renderLists(); toast('הרשימה נשמרה');
  });

  // mobile drawer
  const openCart = (open) => { $('#cart-panel').classList.toggle('is-open', open); };
  $('#cart-toggle').addEventListener('click', () => openCart(true));
  $('#cart-fab').addEventListener('click', () => openCart(true));
  $('#cart-close').addEventListener('click', () => openCart(false));

  // ---------- comparison ----------
  async function compare() {
    if (!state.cart.lines.length) { toast('הוסיפו מוצרים לסל לפני ההשוואה'); return; }
    const address = $('#address-input').value.trim();
    state.cart.address = address || null;
    saveState();
    const btn = $('#compare-btn');
    btn.disabled = true; btn.textContent = 'משווים...';
    try {
      const t0 = performance.now();
      state.compare = await api('/api/compare', { method: 'POST', body: { lines: cleanLines(), address: address || undefined } });
      state.expanded.clear();
      renderCompare(Math.round(performance.now() - t0));
      const parsed = state.compare.address;
      $('#address-hint').textContent = address && !parsed?.city ? 'לא זיהינו עיר בכתובת, מוצג סניף ברירת מחדל לכל רשת.' : parsed?.city ? `מוצגים סניפים שמספקים ל${parsed.city}.` : 'הכתובת קובעת אילו סניפים מספקים אליכם ומה דמי המשלוח.';
      setStep(2);
      openCart(false);
      $('#compare-section').hidden = false;
      $('#compare-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      toast(`שגיאה: ${err.message}`);
    } finally {
      btn.disabled = false; btn.innerHTML = `השוו מחירים ב-<span id="chain-count">${state.chains.length}</span> רשתות`;
    }
  }
  $('#compare-btn').addEventListener('click', compare);
  $('#address-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') compare(); });

  function renderCompare(ms) {
    const { rows, itemCount } = state.compare;
    const best = rows.find((r) => r.isBestValue);
    const complete = rows.filter((r) => r.deliverable && r.isComplete);
    const priciest = complete.length ? complete.reduce((a, b) => (b.grandTotal > a.grandTotal ? b : a)) : null;
    let summary = '';
    if (best && best.isComplete) {
      summary = `הסל המשתלם ביותר: <strong>${esc(shortName(best.chainName))}</strong> ב-<strong>${money(best.grandTotal)}</strong> כולל משלוח`;
      if (priciest && priciest.chainId !== best.chainId) summary += `, חיסכון של <strong>${money(priciest.grandTotal - best.grandTotal)}</strong> לעומת ${esc(shortName(priciest.chainName))}`;
      summary += '.';
    } else if (best) {
      summary = `אף רשת לא מציעה את כל המוצרים. <strong>${esc(shortName(best.chainName))}</strong> מכסה הכי הרבה (${best.available} מתוך ${best.total}) ב-${money(best.grandTotal)}.`;
    } else {
      summary = 'אף רשת לא מספקת לכתובת שהוזנה. נסו כתובת אחרת.';
    }
    $('#compare-summary').innerHTML = summary;
    $('#compare-meta').textContent = `${itemCount} מוצרים · ${rows.filter((r) => r.deliverable).length} רשתות מספקות · חושב ב-${ms} מ"ש`;
    $('#compare-cards').innerHTML = rows.map(renderChainCard).join('');
  }

  function chainLogo(row) {
    return `<div class="chain-logo" style="background:${esc(row.color || '#64748b')}">${esc(shortName(row.chainName).slice(0, 1))}</div>`;
  }

  function renderChainCard(row) {
    if (!row.deliverable) {
      return `<article class="chain-card is-unavailable" data-chain="${esc(row.chainId)}">
        <div class="chain-id">${chainLogo(row)}<div><div class="chain-name">${esc(shortName(row.chainName))}</div></div></div>
        <div class="unavailable-msg">🚚 ${esc(row.reason)}</div>
        <div></div>
      </article>`;
    }
    const pct = Math.round(row.coverage * 100);
    const flags = [];
    if (!row.verified) flags.push('<span class="flag warn" title="הטעינה האוטומטית לרשת זו טרם אומתה מול האתר החי">⚠ באימות</span>');
    if (row.belowMinOrder) flags.push(`<span class="flag bad">מתחת למינימום הזמנה (${money0(row.minOrder)})</span>`);
    if (row.savings > 0) flags.push(`<span class="flag ok">מבצעים: חיסכון ${money(row.savings)}</span>`);
    const missing = row.missing.map((m) => `<span class="chip">✕ ${esc(m.name)}${m.status === 'out_of_stock' ? ' (אזל)' : ''}</span>`).join('');
    const subs = (row.substituted || []).map((s) => `<span class="chip sub">↔ ${esc(s.name)} → ${esc(s.with)}</span>`).join('');
    return `<article class="chain-card ${row.isBestValue ? 'is-best' : ''}" data-chain="${esc(row.chainId)}">
      ${row.isBestValue ? '<div class="best-ribbon">⭐ הסל המשתלם ביותר</div>' : ''}
      <div class="chain-id">
        ${chainLogo(row)}
        <div>
          <div class="chain-name">${esc(shortName(row.chainName))}</div>
          <div class="chain-branch">${esc(row.branch.name)}</div>
          <div class="chain-flags">${flags.join('')}</div>
        </div>
      </div>
      <div class="availability">
        <div class="avail-label"><span>זמינות</span><strong>${row.available}/${row.total} מוצרים</strong></div>
        <div class="avail-bar ${row.isComplete ? '' : 'partial'}"><span style="width:${pct}%"></span></div>
        ${missing || subs ? `<div class="missing-chips">${missing}${subs}</div>` : ''}
      </div>
      <div class="delivery">
        <div>${row.freeDelivery ? '<span class="free">🚚 משלוח חינם</span>' : `🚚 משלוח ${money(row.deliveryFee)}`}</div>
        ${row.deliveryEta ? `<div>🕒 ${esc(row.deliveryEta)}</div>` : ''}
      </div>
      <div class="pricing">
        <div class="total">${money(row.grandTotal)}</div>
        <div class="breakdown">סל ${money(row.subtotal)} + משלוח ${money(row.deliveryFee)}</div>
      </div>
      <div class="chain-actions">
        <button type="button" class="btn btn-primary" data-order="${esc(row.chainId)}" ${row.available ? '' : 'disabled'}>הזמן ב${esc(shortName(row.chainName))}</button>
        <button type="button" class="details-btn" data-details="${esc(row.chainId)}">${state.expanded.has(row.chainId) ? 'הסתר פירוט' : 'פירוט המוצרים'}</button>
      </div>
      ${state.expanded.has(row.chainId) ? `<div class="chain-details">${renderDetails(row)}</div>` : ''}
    </article>`;
  }

  function renderDetails(row) {
    const st = { ok: 'זמין', substituted: 'תחליף', missing: 'חסר', out_of_stock: 'אזל מהמלאי' };
    return `<table class="details-table"><thead><tr><th>מוצר</th><th>הפריט ברשת</th><th>כמות</th><th>מחיר</th><th>מבצע</th><th>סה"כ</th><th>סטטוס</th></tr></thead><tbody>
      ${row.lines.map((l) => `<tr>
        <td>${esc(l.name)}</td>
        <td>${l.storeItemName ? `${esc(l.storeItemName)} <span class="muted">(${esc(l.storeItemId)}${l.matchMethod === 'fuzzy' ? `, התאמה ${Math.round(l.matchScore * 100)}%` : ''})</span>` : '—'}</td>
        <td>${l.qty} ${esc(l.unit || '')}</td>
        <td>${l.unitPrice != null ? money(l.unitPrice) : '—'}</td>
        <td>${l.promo ? esc(l.promo) : ''}</td>
        <td>${l.lineTotal ? money(l.lineTotal) : '—'}</td>
        <td class="st-${esc(l.status)}">${esc(st[l.status] || l.status)}</td>
      </tr>`).join('')}
    </tbody></table>`;
  }

  $('#compare-cards').addEventListener('click', (e) => {
    const details = e.target.closest('[data-details]');
    if (details) {
      const id = details.dataset.details;
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      renderCompare(0);
      $('#compare-meta').textContent = `${state.compare.itemCount} מוצרים · ${state.compare.rows.filter((r) => r.deliverable).length} רשתות מספקות`;
      return;
    }
    const order = e.target.closest('[data-order]');
    if (order) openOrderDialog(order.dataset.order);
  });

  // ---------- handoff dialog ----------
  function modal(html) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    root.querySelector('.modal-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    return root.querySelector('.modal');
  }
  function closeModal() { $('#modal-root').innerHTML = ''; clearInterval(state.pollTimer); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function openOrderDialog(chainId) {
    const row = state.compare.rows.find((r) => r.chainId === chainId);
    startHandoff(chainId, { verified: !!row?.verified });
  }

  const BOOKMARKLET_KEY = 'cart-bookmarklet-installed';
  function bookmarkletInstalled() { try { return localStorage.getItem(BOOKMARKLET_KEY) === '1'; } catch { return false; } }
  function setBookmarkletInstalled(v) { try { if (v) localStorage.setItem(BOOKMARKLET_KEY, '1'); else localStorage.removeItem(BOOKMARKLET_KEY); } catch { /* ignore */ } }
  async function bookmarkletCode() {
    if (!state.bookmarklet) { try { ({ code: state.bookmarklet } = await api('/api/bookmarklet')); } catch { state.bookmarklet = null; } }
    return state.bookmarklet;
  }

  async function startHandoff(chainId, { verified }) {
    let handoff;
    try {
      ({ handoff } = await api('/api/handoffs', { method: 'POST', body: { lines: cleanLines(), chainId, address: state.cart.address || undefined } }));
    } catch (err) { toast(err.message); return; }
    await bookmarkletCode();
    state.handoff = { ...handoff, verified };
    setStep(3);
    const win = window.open(handoff.url, '_blank'); // keep the opener link: the chain tab reports back via postMessage
    state.handoff.popupBlocked = !win;
    renderHandoffDialog();
    pollHandoff();
  }

  function renderHandoffDialog() {
    const h = state.handoff;
    const name = shortName(h.chainName);
    const status = h.status;
    const failed = (h.failedItems ?? []).map((f) => `<li class="skipped">✕ ${esc(f.name || f.storeItemId)} — ${esc(f.error || f.errorType || '')}</li>`).join('');
    const stepState = (i) => {
      if (i === 1) return 'done';
      if (i === 2) return status === 'pending' ? 'active' : status === 'failed' ? 'failed' : 'done';
      return status === 'completed' || status === 'partial' ? 'active' : '';
    };
    const installed = bookmarkletInstalled();
    const step2Text = {
      pending: 'בטאב של הרשת לחצו על הסימנייה "🛒 טען עגלה" בשורת הסימניות. הסטטוס יתעדכן כאן.',
      completed: `כל ${h.result?.total ?? h.items.length} הפריטים נוספו לעגלה.`,
      partial: `${h.result?.okCount} מתוך ${h.result?.total} פריטים נוספו. הפריטים שלא נוספו מסומנים למטה.`,
      failed: 'טעינת העגלה נכשלה. נסו שוב או הוסיפו את המוצרים ידנית באתר הרשת.',
    }[status];
    const bookmarkletStep = state.bookmarklet ? `
          <div class="step-row ${installed ? 'done' : 'active'}"><div class="step-icon">${installed ? '✓' : '★'}</div><div><div class="step-title">${installed ? 'סימניית "טען עגלה" מותקנת' : 'פעם אחת: גררו את הכפתור לשורת הסימניות'}</div><div class="step-desc">${installed ? '' : 'ב-Chrome: Ctrl/Cmd+Shift+B מציג את שורת הסימניות. '}<a class="btn btn-small" href="${esc(state.bookmarklet)}" draggable="true" onclick="return false">🛒 טען עגלה</a> <label class="hint"><input type="checkbox" data-bm-installed ${installed ? 'checked' : ''}> כבר גררתי</label>${h.verified ? '' : ' <span class="muted">(החיבור לרשת זו טרם אומת)</span>'}</div></div>` : '';
    const notice = status === 'completed'
      ? '<div class="notice ok"><span>✅</span><div><strong>העגלה נטענה בהצלחה.</strong> עברו לטאב של הרשת, בחרו מועד משלוח ובצעו תשלום.</div></div>'
      : status === 'partial' ? '<div class="notice warn"><span>⚠️</span><div><strong>העגלה נטענה חלקית.</strong> השלימו ידנית את הפריטים החסרים בטאב של הרשת.</div></div>'
      : status === 'failed' ? '<div class="notice bad"><span>❌</span><div><strong>הטעינה נכשלה.</strong> נסו שוב, או הוסיפו את המוצרים ידנית באתר הרשת.</div></div>'
      : h.popupBlocked ? `<div class="notice bad"><span>🚫</span><div>הדפדפן חסם פתיחת חלון. <a href="${esc(h.url)}" target="_blank" rel="opener">לחצו כאן לפתיחת אתר ${esc(name)}</a>.</div></div>`
      : `<div class="notice info"><span>🪟</span><div>נפתח טאב חדש באתר ${esc(name)}. השאירו את הדף הזה פתוח, הסטטוס יתעדכן כאן.</div></div>`;

    const m = modal(`
      <div class="modal-head"><h3>הזמנה ב${esc(name)}</h3><button type="button" class="modal-close" data-close aria-label="סגור">✕</button></div>
      <div class="modal-body">
        ${notice}
        <div class="steps-list">${bookmarkletStep}
          <div class="step-row ${stepState(1)}"><div class="step-icon">✓</div><div><div class="step-title">פתחנו את אתר ${esc(name)}</div><div class="step-desc">הסל שלכם נמצא בכתובת הדף.</div></div></div>
          <div class="step-row ${stepState(2)}"><div class="step-icon">${status === 'pending' ? '<span class="spinner"></span>' : status === 'failed' ? '✕' : '✓'}</div><div><div class="step-title">טוענים את העגלה</div><div class="step-desc">${esc(step2Text)}</div>${failed ? `<ul class="items-summary" style="margin-top:6px">${failed}</ul>` : ''}</div></div>
          <div class="step-row ${stepState(3)}"><div class="step-icon">3</div><div><div class="step-title">בחרו מועד משלוח ושלמו</div><div class="step-desc">באתר ${esc(name)}, בחשבון שלכם. אם אינכם מחוברים, העגלה נשמרת כעגלת אורח עד ההתחברות בקופה.</div></div></div>
        </div>
        <details class="items-summary"><summary>${h.items.length} פריטים מועברים${h.skipped?.length ? ` · ${h.skipped.length} לא זמינים` : ''}</summary><ul>${h.items.map((i) => `<li>${esc(i.name)} × ${i.qty}</li>`).join('')}${(h.skipped ?? []).map((s) => `<li class="skipped">✕ ${esc(s.name)} (${s.reason === 'out_of_stock' ? 'אזל' : 'לא קיים ברשת'})</li>`).join('')}</ul></details>
        <p class="hint">קישור ידני: <a href="${esc(h.url)}" target="_blank" rel="opener">${esc(h.url.slice(0, 60))}…</a></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>סגור</button></div>`);
    m.querySelector('[data-bm-installed]')?.addEventListener('change', (e) => { setBookmarkletInstalled(e.target.checked); renderHandoffDialog(); });
    return m;
  }

  // The chain tab reports its result to this (opener) tab. Chains whose CSP forbids the page from
  // calling the platform rely on this path, so the platform tab records the result in the API too.
  window.addEventListener('message', (event) => {
    const d = event.data;
    if (!d || d.type !== 'cart-handoff-result' || !state.handoff || d.handoffId !== state.handoff.id) return;
    const s = d.summary || {};
    const status = s.failCount === 0 && s.total > 0 ? 'completed' : s.okCount > 0 ? 'partial' : 'failed';
    const wasPending = state.handoff.status === 'pending';
    state.handoff = { ...state.handoff, status, result: { okCount: s.okCount, failCount: s.failCount, total: s.total }, failedItems: (s.results || []).filter((r) => !r.ok) };
    clearInterval(state.pollTimer);
    if ($('#modal-root').firstChild) renderHandoffDialog();
    toast(status === 'completed' ? 'העגלה נטענה בהצלחה' : status === 'partial' ? 'העגלה נטענה חלקית' : 'טעינת העגלה נכשלה');
    if (wasPending) api(`/api/handoffs/${encodeURIComponent(d.handoffId)}/results`, { method: 'POST', body: s }).catch(() => {});
  });

  function pollHandoff() {
    clearInterval(state.pollTimer);
    const started = Date.now();
    state.pollTimer = setInterval(async () => {
      if (!state.handoff) return;
      try {
        const { handoff } = await api(`/api/handoffs/${encodeURIComponent(state.handoff.id)}/status`);
        if (handoff.status !== 'pending' && handoff.status !== state.handoff.status) {
          state.handoff = { ...state.handoff, ...handoff };
          if ($('#modal-root').firstChild) renderHandoffDialog();
        }
        if (handoff.status !== 'pending' || Date.now() - started > 10 * 60 * 1000) clearInterval(state.pollTimer);
      } catch { clearInterval(state.pollTimer); }
      loadAlerts();
    }, 2500);
  }

  // ---------- misc ----------
  function renderChainsStrip() {
    $('#chains-strip').innerHTML = state.chains.map((c) => `<span class="chain-pill"><span class="dot" style="background:${esc(c.color || '#999')}"></span>${esc(shortName(c.name))}<span class="status ${c.verified ? 'ok' : ''}">${c.verified ? '✓ טעינה אוטומטית' : 'באימות'}</span></span>`).join('');
  }
  async function loadAlerts() {
    try {
      const { alerts } = await api('/api/alerts?unresolved=1');
      $('#alerts-count').textContent = alerts.length;
      $('#alerts-link').hidden = alerts.length === 0;
    } catch { /* ignore */ }
  }

  (async function init() {
    try {
      loadState();
      await loadCatalog();
      renderCart();
      renderLists();
      if (state.cart.address) $('#address-input').value = state.cart.address;
      loadAlerts();
    } catch (err) {
      toast(`שגיאה בטעינה: ${err.message}`);
      console.error(err);
    }
  })();
})();
