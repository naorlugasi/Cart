import fs from 'node:fs';
// Option B: the comparison screen in a Wolt-like language (white, one blue, venue-style cards,
// menu-style item rows, sticky checkout bar). Same data and logic as option A.
const S = process.argv[2] || new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const A = S + '/../concept';
const { items, chains: chainsBase } = JSON.parse(fs.readFileSync(A + '/basket-data.json', 'utf8'));
const branches = { shufersal: { fee: 29.9, free: 350, min: 150, eta: 'מחר, 08:00-12:00' }, ramilevy: { fee: 19.9, free: 300, min: 200, eta: 'מחר, 10:00-14:00' }, carrefour: { fee: 24.9, free: 299, min: 120, eta: 'היום, 18:00-22:00' }, yochananof: { fee: 29.9, free: 250, min: 100, eta: 'מחר, 08:00-12:00' }, hazihinam: { fee: 29.9, free: 300, min: 150, eta: 'מחר, 08:00-12:00' } };
const chains = {}; for (const c of Object.keys(chainsBase)) chains[c] = { name: chainsBase[c].name, delivery: branches[c].fee, free: branches[c].free, min: branches[c].min, eta: branches[c].eta };
const icon = (name, cls) => fs.readFileSync(`${A}/icons/${name}-bold.svg`, 'utf8').replace('<svg ', `<svg class="${cls}" aria-hidden="true" `).replace(/\n/g, '');
const I = { cart: icon('shopping-cart-simple', 'ic'), caret: icon('caret-left', 'ic'), down: icon('caret-down', 'ic'), clock: icon('clock', 'ic'), truck: icon('truck', 'ic'), pin: icon('map-pin', 'ic'), check: icon('check', 'ic'), basket: icon('basket', 'ic') };
const img = (g) => 'data:image/jpeg;base64,' + fs.readFileSync(`${A}/img/${g}.s.jpg`).toString('base64');
const subsCatalog = {
  '7290011018917': { gtin: '7290011018917', name: 'קוקה קולה זירו, שישייה 330 מ״ל', brand: 'קוקה קולה', size: '6 × 330 מ״ל = 1.98 ליטר', prices: { ramilevy: 19.3, shufersal: 24.9, carrefour: 24.9, yochananof: 21.9, hazihinam: 24.9 } },
  '7290018540831': { gtin: '7290018540831', name: 'לחם מחמצת ארטיזנל חיטה פרוס', brand: 'אנג׳ל ארטיזנל', size: 'כיכר פרוסה, אותו משקל', prices: { ramilevy: 19.2, shufersal: 18.9, carrefour: 20.2, yochananof: 18.9, hazihinam: 18.9 } },
  '7290000060880': { gtin: '7290000060880', name: 'ספגטי מס׳ 8, 500 גרם', brand: 'אסם', size: '500 גרם', prices: { ramilevy: 3.9, shufersal: 6.5, carrefour: 5.9, yochananof: 5.9, hazihinam: 6.8 } },
};
const sizes = { '7290110113384': '4 × 1 ליטר = 4 ליטר', '7290018540817': 'כיכר פרוסה', '8076800195057': '500 גרם' };
const rules = [
  { orig: '7290110113384', sub: '7290011018917', why: 'missing', note: 'פחות מהמקור: 1.98 ליטר במקום 4 ליטר לכל יחידה' },
  { orig: '7290018540817', sub: '7290018540831', why: 'missing', note: 'אותו מותג, קמח חיטה במקום כוסמין' },
  { orig: '8076800195057', sub: '7290000060880', why: 'cheaper', note: 'אותו משקל, מותג אחר' },
];
const order = ['hazihinam', 'carrefour', 'yochananof', 'shufersal', 'ramilevy'];
const brand = { shufersal: '#e30613', ramilevy: '#0057a8', carrefour: '#004e9f', yochananof: '#7cb342', hazihinam: '#ff6f00' };
const initials = { shufersal: 'ש', ramilevy: 'ר', carrefour: 'ק', yochananof: 'י', hazihinam: 'ח' };
const units = items.reduce((s, i) => s + i.qty, 0);
const data = JSON.stringify({ items: items.map((i) => ({ gtin: i.gtin, name: i.name, brand: i.brand, qty: i.qty, prices: i.prices, size: sizes[i.gtin] || null })), subs: subsCatalog, rules, chains, order, brand, initials, units });
const imgs = [...items.map((it) => it.gtin), ...Object.keys(subsCatalog)].map((g) => `<img id="im-${g}" src="${img(g)}" alt="">`).join('');

const html = `<title>סל חכם</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#141516">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Rubik:wght@400;500;600&display=swap">
<style>
  :root { --bg: #ffffff; --surface: #f6f6f6; --card: #ffffff; --ink: #202125; --ink-2: #4b4c4f; --muted: #717173; --line: #e9e9ea; --blue: #009de0; --blue-dark: #0184bd; --blue-soft: #e8f6fd; --green: #1f9d4d; --green-soft: #e8f6ee; --warn: #b33a05; --warn-soft: #fff1ea; --shadow: 0 2px 8px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.08); --ease-out: cubic-bezier(.23, 1, .32, 1); }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #141516; --surface: #1d1e20; --card: #1d1e20; --ink: #f2f2f3; --ink-2: #c6c7ca; --muted: #9a9b9f; --line: #2c2d30; --blue: #1fb0f0; --blue-dark: #55c4f5; --blue-soft: #10303f; --green: #4ccd7a; --green-soft: #12301d; --warn: #ff9a63; --warn-soft: #3a2115; --shadow: 0 2px 8px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.5); } }
  :root[data-theme="dark"] { --bg: #141516; --surface: #1d1e20; --card: #1d1e20; --ink: #f2f2f3; --ink-2: #c6c7ca; --muted: #9a9b9f; --line: #2c2d30; --blue: #1fb0f0; --blue-dark: #55c4f5; --blue-soft: #10303f; --green: #4ccd7a; --green-soft: #12301d; --warn: #ff9a63; --warn-soft: #3a2115; --shadow: 0 2px 8px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.5); }
  * { box-sizing: border-box; }
  html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Rubik", "Segoe UI", system-ui, Arial, sans-serif; direction: rtl; font-size: 15px; line-height: 1.45; font-variant-numeric: tabular-nums; padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }
  button { font: inherit; color: inherit; }
  .ic { width: 18px; height: 18px; fill: currentColor; flex: none; }
  :focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; border-radius: 8px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .skip { position: absolute; inset-inline-start: 12px; top: -48px; background: var(--blue); color: #fff; padding: 8px 14px; border-radius: 8px; font-weight: 600; z-index: 3; }
  .skip:focus { top: 12px; }
  h1, h2, .num, .brandmark { font-family: "Fredoka", "Rubik", sans-serif; }
  .btn, .crow, .chip-btn, .row button, .tab { touch-action: manipulation; user-select: none; -webkit-user-select: none; }

  .top { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); }
  .top-in { max-width: 1120px; margin: 0 auto; display: flex; align-items: center; gap: 14px; padding: calc(10px + env(safe-area-inset-top, 0px)) 20px 10px; }
  .brandmark { font-weight: 700; font-size: 24px; color: var(--blue); letter-spacing: -.01em; white-space: nowrap; }
  .addr { display: inline-flex; align-items: center; gap: 6px; background: var(--surface); border-radius: 999px; padding: 8px 14px; font-weight: 500; font-size: 14px; border: 0; cursor: pointer; white-space: nowrap; min-width: 0; }
  .addr .full { display: inline; } .addr .shortaddr { display: none; }
  .addr .ic { color: var(--blue); }
  .addr .down { width: 14px; height: 14px; color: var(--muted); }
  .basket-btn { margin-inline-start: auto; display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 0; border-radius: 999px; padding: 8px 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .basket-btn .ic { color: var(--blue); }

  .wrap { max-width: 1120px; margin: 0 auto; padding: 18px 20px 0; }
  h1 { font-size: 30px; font-weight: 700; margin: 6px 0 2px; letter-spacing: -.01em; line-height: 1.15; }
  .lead { color: var(--muted); margin: 0 0 16px; font-size: 15px; }
  .lead b { color: var(--green); font-weight: 600; }
  .tabs { display: flex; gap: 8px; margin: 0 0 14px; overflow-x: auto; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { flex: none; border: 1px solid var(--line); background: var(--card); border-radius: 999px; padding: 7px 14px; font-weight: 500; font-size: 14px; cursor: pointer; }
  .tab.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }

  h2 { font-size: 20px; font-weight: 600; margin: 22px 0 10px; display: flex; align-items: baseline; gap: 10px; }
  h2 small { font-family: "Rubik", sans-serif; font-weight: 400; color: var(--muted); font-size: 14px; }
  .chainlist { display: grid; gap: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--card); }
  .crow { width: 100%; display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 14px 16px; background: var(--card); border: 0; border-bottom: 1px solid var(--line); cursor: pointer; text-align: right; position: relative; transition: background 150ms ease; }
  .crow:last-child { border-bottom: 0; }
  .crow.on { background: var(--blue-soft); box-shadow: inset 4px 0 0 var(--blue); }
  .crow:active { background: var(--surface); }
  .crow .mosaic { width: 56px; height: 56px; border-radius: 10px; overflow: hidden; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; background: var(--surface); position: relative; }
  .crow .mosaic img { width: 100%; height: 100%; object-fit: cover; }
  .crow .mosaic i { position: absolute; bottom: -2px; inset-inline-start: -2px; width: 22px; height: 22px; border-radius: 6px; color: #fff; display: grid; place-items: center; font-family: "Fredoka", sans-serif; font-weight: 700; font-size: 12px; border: 2px solid var(--card); }
  .crow .name { font-weight: 600; font-size: 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .crow .name .rank { font-family: "Fredoka", sans-serif; color: var(--muted); font-weight: 600; }
  .crow .price { text-align: left; }
  .crow .price .num { font-weight: 600; font-size: 18px; display: block; }
  .crow .price .num.partial { color: var(--ink-2); }
  .crow .price small { color: var(--muted); font-size: 12.5px; }
  .crow.blocked .mosaic { filter: grayscale(.7); }
  .grp { font-size: 13px; color: var(--muted); font-weight: 500; padding: 14px 4px 6px; }
  .badge { background: var(--blue); color: #fff; font-weight: 600; font-size: 12px; padding: 2px 9px; border-radius: 999px; }
  .badge.warn { background: var(--warn-soft); color: var(--warn); }
  .meta { display: flex; gap: 10px; flex-wrap: wrap; color: var(--muted); font-size: 13px; align-items: center; }
  .meta span { display: inline-flex; align-items: center; gap: 4px; }
  .meta .ic { width: 14px; height: 14px; }
  .meta .ok { color: var(--green); font-weight: 500; }
  .meta .bad { color: var(--warn); font-weight: 500; }

  .info { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 6px 0 4px; }
  .info div { background: var(--surface); border-radius: 10px; padding: 10px 12px; font-size: 13px; color: var(--muted); }
  .info div b { display: block; color: var(--ink); font-weight: 600; font-size: 14px; margin-top: 2px; }
  .info div.warn { background: var(--warn-soft); color: var(--warn); }
  .info div.warn b { color: var(--warn); }

  .menu { max-width: 1120px; margin: 0 auto; padding: 0 20px; }
  .group { margin-top: 18px; }
  .group h3 { font-size: 15px; font-weight: 600; margin: 0; padding: 10px 0; display: flex; align-items: center; gap: 8px; color: var(--ink); border-bottom: 1px solid var(--line); }
  .group h3 .cnt { color: var(--muted); font-weight: 400; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 64px; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); }
  .row img { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; background: #fff; border: 1px solid var(--line); }
  .row .t { font-weight: 500; font-size: 15px; }
  .row .d { color: var(--muted); font-size: 13px; margin-top: 2px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .row .p { font-weight: 600; margin-top: 4px; font-size: 14px; display: flex; gap: 8px; align-items: baseline; }
  .row .p small { color: var(--muted); font-weight: 400; font-size: 12.5px; }
  .row .p .more { color: var(--warn); font-weight: 500; font-size: 12.5px; }
  .row .swapped { color: var(--blue-dark); font-weight: 500; }
  .row .note { color: var(--ink-2); }
  .row button { background: none; border: 0; padding: 0; color: var(--blue-dark); font-weight: 600; cursor: pointer; font-size: 13px; min-height: 28px; }
  .row.miss .t { color: var(--muted); text-decoration: line-through; }
  .row.miss img { filter: grayscale(1); opacity: .55; }
  .row.miss .d { color: var(--warn); }
  .chip { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
  .chip.blue { background: var(--blue-soft); color: var(--blue-dark); }
  .chip.warn { background: var(--warn-soft); color: var(--warn); }
  .chip.green { background: var(--green-soft); color: var(--green); }

  .bar { position: fixed; bottom: 0; inset-inline: 0; padding: 10px 16px calc(12px + env(safe-area-inset-bottom, 0px)); background: linear-gradient(to top, var(--bg) 75%, transparent); z-index: 2; }
  .btn { max-width: 1088px; margin: 0 auto; width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--blue); color: #fff; border: 0; border-radius: 12px; padding: 16px 20px; font-weight: 600; font-size: 17px; cursor: pointer; box-shadow: 0 8px 24px rgba(0, 157, 224, .3); transition: transform 160ms var(--ease-out), filter 200ms ease; }
  .btn:active { transform: scale(.98); }
  .btn .num { font-size: 18px; }
  .btn .l { display: flex; align-items: center; gap: 10px; }
  .btn .l .lbl { transition: filter 200ms ease, opacity 200ms ease; }
  .btn .l .lbl.swapping { filter: blur(2px); opacity: .7; }
  .btn[disabled] { background: var(--surface); color: var(--muted); box-shadow: none; cursor: default; }
  .btn .spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; animation: spin 700ms linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .imgs { display: none; }
  @media (hover: hover) and (pointer: fine) { .crow:not(.on):hover { background: var(--surface); } .btn:not([disabled]):hover { filter: brightness(1.06); } }
  @media (prefers-reduced-motion: reduce) { .crow, .btn { transition: none; } .btn:active { transform: none; } .btn .l .lbl.swapping { filter: none; } }
  @media (max-width: 760px) { .top-in { gap: 8px; } .addr .full { display: none; } .addr .shortaddr { display: inline; } .basket-btn { padding: 8px 12px; } .info { grid-template-columns: 1fr 1fr; } .crow { grid-template-columns: 48px minmax(0, 1fr) auto; padding: 12px; gap: 10px; } .crow .mosaic { width: 48px; height: 48px; } h1 { font-size: 26px; } .top-in { padding-inline: 16px; } .wrap, .menu { padding-inline: 16px; } .brandmark { font-size: 20px; } }
</style>
<a class="skip" href="#main">דלגו לתוכן</a>
<header class="top"><div class="top-in">
  <div class="brandmark">סל חכם</div>
  <button type="button" class="addr">${I.pin}<span class="full">רוטשילד 3, תל אביב</span><span class="shortaddr">רוטשילד 3</span> ${I.down.replace('class="ic"', 'class="ic down"')}</button>
  <button type="button" class="basket-btn">${I.basket}הסל שלי · ${items.length}</button>
</div></header>
<main class="wrap" id="main">
  <h1 id="h1"></h1>
  <p class="lead" id="lead"></p>
  <div class="tabs" role="tablist" aria-label="סינון"><button type="button" class="tab on">הכל</button><button type="button" class="tab">משלוח היום</button><button type="button" class="tab">משלוח חינם</button><button type="button" class="tab">סל שלם בלבד</button></div>
  <h2>הרשתות לסל שלך <small>${items.length} מוצרים · ${units} יחידות · מחירי אונליין של היום</small></h2>
  <div id="shelf"></div>
  <h2 id="selh"></h2>
  <div class="info" id="info"></div>
</main>
<section class="menu" id="menu" aria-live="polite"></section>
<div class="bar"><button type="button" class="btn" id="cta"></button></div>
<div class="imgs">${imgs}</div>
<script>
(function () {
  var D = ${data};
  var I = ${JSON.stringify(I)};
  var nis = function (n) { return '₪' + n.toFixed(2); };
  var $ = function (id) { return document.getElementById(id); };
  var im = function (g) { return document.getElementById('im-' + g).src; };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
  var short = function (name) { return name.split(',')[0]; };
  var keep = {}, noSub = {}, sel = null, ordering = null;

  function resolve(c) {
    var lines = [], sw = 0, ms = 0, cheaper = 0, saved = 0, sub = 0;
    D.items.forEach(function (it) {
      var p = it.prices[c];
      var rule = D.rules.find(function (r) { return r.orig === it.gtin; });
      var s = rule && D.subs[rule.sub], sp = s && s.prices[c];
      if (rule && rule.why === 'missing' && p == null && sp != null && !noSub[c + ':' + it.gtin]) { lines.push({ it: it, sub: s, rule: rule, why: 'missing', price: sp }); sw++; sub += sp * it.qty; return; }
      if (rule && rule.why === 'cheaper' && p != null && sp != null && sp < p && !keep[it.gtin]) { lines.push({ it: it, sub: s, rule: rule, why: 'cheaper', price: sp, orig: p }); cheaper++; saved += (p - sp) * it.qty; sub += sp * it.qty; return; }
      if (p == null) { lines.push({ it: it, missing: true, declined: !!noSub[c + ':' + it.gtin] && rule && rule.why === 'missing' && sp != null }); ms++; return; }
      lines.push({ it: it, price: p, keepable: rule && rule.why === 'cheaper' && sp != null && sp < p }); sub += p * it.qty;
    });
    var ch = D.chains[c], subtotal = Math.round(sub * 100) / 100, fee = subtotal >= ch.free ? 0 : ch.delivery;
    var belowMin = ch.min && subtotal < ch.min ? Math.round((ch.min - subtotal) * 100) / 100 : 0;
    return { c: c, lines: lines, sw: sw, ms: ms, cheaper: cheaper, saved: Math.round(saved * 100) / 100, subtotal: subtotal, fee: fee, total: Math.round((sub + fee) * 100) / 100, complete: ms === 0, belowMin: belowMin };
  }
  function cheapestOther(it, c) { var best = null; D.order.forEach(function (o) { if (o === c || it.prices[o] == null) return; if (!best || it.prices[o] < it.prices[best]) best = o; }); return best; }
  function missingNames(r) { return r.lines.filter(function (l) { return l.missing; }).map(function (l) { return short(l.it.name); }); }

  function render() {
    var R = D.order.map(resolve);
    R.sort(function (a, b) { return (a.complete === b.complete) ? a.total - b.total : (a.complete ? -1 : 1); });
    var first = R[0], second = R.filter(function (r) { return r.complete; })[1];
    if (!sel) sel = first.c;
    var cur = R.find(function (r) { return r.c === sel; }), ch = D.chains[cur.c], mn = missingNames(cur);
    $('h1').textContent = 'השבוע הכי זול לך ב' + D.chains[first.c].name;
    $('lead').innerHTML = nis(first.total) + ' לסל שלם, כולל משלוח. ' + (second ? '<b>חוסכים ' + nis(second.total - first.total) + '</b> לעומת ' + esc(D.chains[second.c].name) + '.' : '');
    // Venue-style cards, cheapest first. The cover is a mosaic of what actually goes in that cart.
    var rowFor = function (r, i) {
      var c = D.chains[r.c], pics = r.lines.filter(function (l) { return !l.missing; }).slice(0, 4).map(function (l) { return '<img src="' + im(l.sub ? l.sub.gtin : l.it.gtin) + '" alt="">'; }).join('');
      var badge = i === 0 ? '<span class="badge">הכי זול לסל שלם</span>' : r.belowMin ? '<span class="badge warn">מתחת למינימום</span>' : !r.complete ? '<span class="badge warn">חסר: ' + esc(missingNames(r).join(', ')) + '</span>' : '';
      var status = r.belowMin ? '<span class="bad">הוסיפו ' + nis(r.belowMin) + ' כדי להזמין</span>' : r.complete ? '<span class="ok">' + I.check + 'כל ' + D.items.length + ' המוצרים</span>' : '<span class="bad">' + (D.items.length - r.ms) + ' מתוך ' + D.items.length + ' מוצרים</span>';
      return '<button type="button" class="crow' + (r.c === sel ? ' on' : '') + (r.belowMin ? ' blocked' : '') + '" data-c="' + r.c + '" aria-pressed="' + (r.c === sel ? 'true' : 'false') + '"><div class="mosaic">' + pics + '<i style="background:' + D.brand[r.c] + '" aria-hidden="true">' + D.initials[r.c] + '</i></div><div><div class="name"><span class="rank">' + (i + 1) + '</span>' + esc(c.name) + badge + '</div><div class="meta"><span>' + I.truck + (r.fee ? 'משלוח ' + nis(r.fee) : 'משלוח חינם') + '</span><span>' + I.clock + esc(c.eta) + '</span>' + status + (r.sw || r.cheaper ? '<span>' + (r.sw + r.cheaper) + ' החלפות</span>' : '') + '</div></div><div class="price"><span class="num' + (r.complete ? '' : ' partial') + '">' + nis(r.total) + '</span><small>' + (r.complete ? 'כולל משלוח' : 'סל חלקי') + '</small></div></button>';
    };
    var completes = R.filter(function (r) { return r.complete; }), partials = R.filter(function (r) { return !r.complete; });
    $('shelf').innerHTML = '<div class="chainlist">' + completes.map(rowFor).join('') + '</div>' + (partials.length ? '<div class="grp">רשתות שחסר בהן מוצר, לפי המחיר של מה שכן יש</div><div class="chainlist">' + partials.map(function (r, j) { return rowFor(r, completes.length + j); }).join('') + '</div>' : '');
    $('selh').innerHTML = 'הסל שלך ב' + esc(ch.name) + ' <small>לחיצה על רשת אחרת ברשימה מחליפה</small>';
    $('info').innerHTML = '<div>משלוח<b>' + (cur.fee ? nis(cur.fee) : 'חינם') + (cur.fee && ch.free ? ' · חינם מעל ₪' + ch.free : '') + '</b></div><div>מגיע<b>' + esc(ch.eta) + '</b></div><div' + (cur.belowMin ? ' class="warn"' : '') + '>מינימום הזמנה<b>₪' + ch.min + (cur.belowMin ? ' · חסרים ' + nis(cur.belowMin) : '') + '</b></div><div>סה״כ מוצרים<b>' + nis(cur.subtotal) + '</b></div>';
    // Menu-style list for the selected chain: substituted, in the cart, unavailable.
    var swaps = cur.lines.filter(function (l) { return l.sub; }), cart = cur.lines.filter(function (l) { return !l.missing && !l.sub; }), miss = cur.lines.filter(function (l) { return l.missing; });
    var row = function (cls, g, name, d, p) { return '<div class="row' + (cls ? ' ' + cls : '') + '"><div><div class="t">' + name + '</div><div class="d">' + d + '</div>' + (p ? '<div class="p">' + p + '</div>' : '') + '</div><img src="' + im(g) + '" alt=""></div>'; };
    var h = '';
    if (swaps.length) h += '<div class="group"><h3>הוחלפו <span class="cnt">' + swaps.length + '</span>' + (cur.saved ? '<span class="chip green">חוסכים ' + nis(cur.saved) + '</span>' : '') + '</h3>' + swaps.map(function (l) {
      var it = l.it, why = l.why === 'missing' ? '<span class="swapped">במקום ' + esc(short(it.name)) + ', שלא נמכר ב' + esc(ch.name) + '.</span> <span class="note">' + esc(l.rule.note) + '</span>' : '<span class="swapped">במקום ' + esc(it.brand) + ' (' + nis(l.orig) + '), מותג זול יותר.</span> <span class="note">' + esc(l.rule.note) + '</span>';
      var act = l.why === 'cheaper' ? '<button type="button" data-keep="' + it.gtin + '">להשאיר ' + esc(it.brand) + '</button>' : '<button type="button" data-nosub="' + it.gtin + '">בלי תחליף</button>';
      return row('', l.sub.gtin, esc(l.sub.name) + ' <span class="chip blue">הוחלף</span>', why + ' ' + act, nis(l.price * it.qty) + (it.qty > 1 ? '<small>' + it.qty + ' × ' + nis(l.price) + '</small>' : '') + (l.orig != null ? '<span class="chip green">חוסכים ' + nis((l.orig - l.price) * it.qty) + '</span>' : ''));
    }).join('') + '</div>';
    h += '<div class="group"><h3>בעגלה <span class="cnt">' + cart.length + '</span></h3>' + cart.map(function (l) {
      var it = l.it, other = cheapestOther(it, cur.c);
      var more = other && it.prices[other] < l.price ? '<span class="more">+' + nis((l.price - it.prices[other]) * it.qty) + ' לעומת ' + esc(D.chains[other].name) + '</span>' : '';
      return row('', it.gtin, esc(it.name), esc(it.brand) + (it.qty > 1 ? ' · ' + it.qty + ' יח׳' : '') + (l.keepable ? ' <button type="button" data-swap="' + it.gtin + '">יש מותג זול יותר</button>' : ''), nis(l.price * it.qty) + (it.qty > 1 ? '<small>' + it.qty + ' × ' + nis(l.price) + '</small>' : '') + more);
    }).join('') + '</div>';
    if (miss.length) h += '<div class="group"><h3>לא זמינים ב' + esc(ch.name) + ' <span class="cnt">' + miss.length + '</span></h3>' + miss.map(function (l) {
      var it = l.it, other = cheapestOther(it, cur.c);
      return row('miss', it.gtin, esc(it.name), (l.declined ? 'ביקשת בלי תחליף. <button type="button" data-resub="' + it.gtin + '">להחזיר את התחליף</button>' : 'לא נמכר אונליין, ולא מצאנו תחליף') + (other ? ' · ב' + esc(D.chains[other].name) + ' ' + nis(it.prices[other]) : ''), '');
    }).join('') + '</div>';
    $('menu').innerHTML = h;
    // Sticky checkout bar, Wolt-style: action on the right, total on the left.
    var cta = $('cta');
    var blocked = !!cur.belowMin, busy = ordering === cur.c;
    cta.disabled = blocked || busy;
    cta.innerHTML = '<span class="l">' + (busy ? '<span class="spin" aria-hidden="true"></span>' : I.cart) + '<span class="lbl">' + (busy ? 'פותחים את האתר של ' + esc(ch.name) : blocked ? 'הוסיפו ' + nis(cur.belowMin) + ' לסל כדי להזמין ב' + esc(ch.name) : mn.length ? 'הזמן ב' + esc(ch.name) + ' בלי ' + esc(mn.join(' ו')) : 'הזמן ב' + esc(ch.name)) + '</span></span><span class="num">' + nis(cur.total) + '</span>';
    bind(cur, mn);
  }
  function bind(cur, mn) {
    var on = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) { el.addEventListener('click', function () { fn(el); }); }); };
    on('.crow', function (el) { sel = el.getAttribute('data-c'); render(); document.querySelector('.crow[data-c="' + sel + '"]').focus({ preventScroll: true }); });
    on('[data-keep]', function (el) { keep[el.getAttribute('data-keep')] = true; render(); });
    on('[data-swap]', function (el) { delete keep[el.getAttribute('data-swap')]; render(); });
    on('[data-nosub]', function (el) { noSub[sel + ':' + el.getAttribute('data-nosub')] = true; render(); });
    on('[data-resub]', function (el) { delete noSub[sel + ':' + el.getAttribute('data-resub')]; render(); });
    $('cta').onclick = function () {
      if (mn.length && !window.confirm('נעביר ' + cur.lines.filter(function (l) { return !l.missing; }).length + ' מוצרים ל' + D.chains[cur.c].name + '. ' + mn.join(' ו') + ' לא ייכנסו לעגלה. להמשיך?')) return;
      var l = $('cta').querySelector('.lbl'); l.classList.add('swapping');
      setTimeout(function () { ordering = cur.c; render(); }, 200);
    };
  }
  render();
})();
</script>`;
fs.writeFileSync(S + '/compare-wolt.html', html);
console.log('compare-wolt.html', fs.statSync(S + '/compare-wolt.html').size);
