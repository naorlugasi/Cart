import fs from 'node:fs';
const S = process.argv[2] || new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const { items, chains } = JSON.parse(fs.readFileSync(S + '/basket-data.json', 'utf8'));
const img = (g) => 'data:image/jpeg;base64,' + fs.readFileSync(`${S}/img/${g}.s.jpg`).toString('base64');
// basket-data.json holds the basket without pictures; pictures live in img/<gtin>.s.jpg
const subsCatalog = {
  '7290011018917': { gtin: '7290011018917', name: 'קוקה קולה זירו, שישייה 330 מ״ל', brand: 'קוקה קולה', prices: { ramilevy: 19.3, shufersal: 24.9, carrefour: 24.9, yochananof: 21.9, hazihinam: 24.9 } },
  '7290018540831': { gtin: '7290018540831', name: 'לחם מחמצת ארטיזנל חיטה פרוס', brand: 'אנג׳ל ארטיזנל', prices: { ramilevy: 19.2, shufersal: 18.9, carrefour: 20.2, yochananof: 18.9, hazihinam: 18.9 } },
  '7290000060880': { gtin: '7290000060880', name: 'ספגטי מס׳ 8, 500 גרם', brand: 'אסם', prices: { ramilevy: 3.9, shufersal: 6.5, carrefour: 5.9, yochananof: 5.9, hazihinam: 6.8 } },
};
// substitution rules: for a missing product at a chain, or a cheaper brand everywhere
const rules = [
  { orig: '7290110113384', sub: '7290011018917', why: 'missing' },
  { orig: '7290018540817', sub: '7290018540831', why: 'missing' },
  { orig: '8076800195057', sub: '7290000060880', why: 'cheaper' },
];
const order = ['hazihinam', 'carrefour', 'yochananof', 'shufersal', 'ramilevy'];
const brand = { shufersal: '#e30613', ramilevy: '#0057a8', carrefour: '#004e9f', yochananof: '#7cb342', hazihinam: '#ff6f00' };
const initials = { shufersal: 'ש', ramilevy: 'ר', carrefour: 'ק', yochananof: 'י', hazihinam: 'ח' };
const units = items.reduce((s, i) => s + i.qty, 0);
const data = JSON.stringify({ items: items.map((i) => ({ gtin: i.gtin, name: i.name, brand: i.brand, qty: i.qty, prices: i.prices })), subs: subsCatalog, rules, chains, order, brand, initials });
const imgs = [...items.map((it) => it.gtin), ...Object.keys(subsCatalog)].map((g) => `<img id="im-${g}" src="${img(g)}" alt="">`).join('');
const html = `<title>סל חכם</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Secular+One&family=Rubik:wght@400;500;600;700&display=swap">
<style>
  :root { --bg: #f7f5ff; --card: #ffffff; --ink: #1c1b2e; --ink-2: #5a5872; --muted: #8b89a3; --line: #e9e6f7; --brand: #5b3df5; --brand-ink: #3b23c4; --brand-soft: #ece8ff; --sun: #ffd23f; --sun-ink: #6b4d00; --sun-soft: #fff6cf; --mint: #1fb77a; --mint-soft: #e2f8ee; --warn: #b45309; --warn-soft: #fff1e0; --shadow: 0 10px 30px rgba(60, 40, 160, .10); }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #16152a; --card: #1f1e35; --ink: #f1efff; --ink-2: #c3c0dc; --muted: #8f8cab; --line: #2d2b48; --brand: #8f7bff; --brand-ink: #b3a6ff; --brand-soft: #2a2450; --sun: #ffd23f; --sun-ink: #ffe58a; --sun-soft: #3a3110; --mint: #3ad693; --mint-soft: #133528; --warn: #f0a04b; --warn-soft: #3a2a12; --shadow: 0 10px 30px rgba(0,0,0,.35); } }
  :root[data-theme="dark"] { --bg: #16152a; --card: #1f1e35; --ink: #f1efff; --ink-2: #c3c0dc; --muted: #8f8cab; --line: #2d2b48; --brand: #8f7bff; --brand-ink: #b3a6ff; --brand-soft: #2a2450; --sun: #ffd23f; --sun-ink: #ffe58a; --sun-soft: #3a3110; --mint: #3ad693; --mint-soft: #133528; --warn: #f0a04b; --warn-soft: #3a2a12; --shadow: 0 10px 30px rgba(0,0,0,.35); }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Rubik", "Segoe UI", system-ui, Arial, sans-serif; direction: rtl; font-size: 15px; line-height: 1.45; font-variant-numeric: tabular-nums; }
  .top { display: flex; align-items: center; gap: 18px; padding: 16px 24px; }
  .logo { display: flex; align-items: center; gap: 10px; font-family: "Secular One", sans-serif; font-size: 24px; color: var(--brand-ink); }
  .logo i { width: 36px; height: 36px; border-radius: 12px; background: var(--brand); display: grid; place-items: center; }
  .logo svg, .cta svg { width: 20px; height: 20px; stroke: #fff; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .top nav { display: flex; gap: 18px; color: var(--ink-2); font-weight: 500; }
  .top nav a { text-decoration: none; color: inherit; padding: 6px 10px; border-radius: 999px; }
  .top nav a.on { background: var(--card); color: var(--brand-ink); box-shadow: var(--shadow); }
  .top .me { margin-inline-start: auto; width: 36px; height: 36px; border-radius: 50%; background: var(--sun); color: var(--sun-ink); display: grid; place-items: center; font-weight: 700; }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 8px 24px 60px; }
  h1 { font-family: "Secular One", sans-serif; font-weight: 400; font-size: 38px; line-height: 1.15; margin: 8px 0 4px; text-wrap: balance; }
  h1 b { color: var(--brand-ink); font-weight: 400; }
  .sub { color: var(--ink-2); font-size: 16px; margin: 0 0 20px; max-width: 62ch; }
  .sub .save { display: inline-block; background: var(--sun); color: var(--sun-ink); font-weight: 700; padding: 2px 10px; border-radius: 999px; }
  .rank { display: grid; gap: 10px; margin-bottom: 26px; }
  .rc { display: grid; grid-template-columns: 44px 1fr auto auto; gap: 16px; align-items: center; background: var(--card); border: 2px solid transparent; border-radius: 20px; padding: 14px 18px; box-shadow: var(--shadow); cursor: pointer; transition: border-color .15s, transform .15s; }
  .rc:hover { transform: translateY(-1px); }
  .rc.on { border-color: var(--brand); }
  .rc .pos { font-family: "Secular One", sans-serif; font-size: 26px; color: var(--muted); text-align: center; }
  .rc { position: relative; }
  .rc.first .pos { color: var(--sun-ink); background: var(--sun); border-radius: 12px; line-height: 44px; }
  .rc .crown { position: absolute; top: -11px; inset-inline-start: 18px; background: var(--sun); color: var(--sun-ink); font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px; }
  .rc.partial { opacity: 1; }
  .rc.partial .pr b { color: var(--ink-2); }
  .rc .who { display: grid; gap: 4px; }
  .rc .who .nm { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 17px; }
  .rc .who .nm i { width: 30px; height: 30px; border-radius: 10px; color: #fff; display: grid; place-items: center; font-family: "Secular One", sans-serif; font-size: 15px; }
  .rc .who .tg { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12.5px; color: var(--muted); align-items: center; }
  .rc .who .tg span { padding: 2px 9px; border-radius: 999px; background: var(--line); color: var(--ink-2); font-weight: 500; }
  .rc .who .tg span.ok { background: var(--mint-soft); color: var(--mint); }
  .rc .who .tg span.sw { background: var(--brand-soft); color: var(--brand-ink); }
  .rc .who .tg span.ms { background: var(--warn-soft); color: var(--warn); }
  .rc .pr { text-align: left; display: grid; }
  .rc .pr b { font-family: "Secular One", sans-serif; font-weight: 400; font-size: 28px; line-height: 1; }
  .rc .pr small { color: var(--muted); font-size: 12.5px; }
  .cta { background: var(--brand); color: #fff; border: 0; border-radius: 14px; padding: 12px 18px; font: inherit; font-weight: 700; font-size: 15px; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap; box-shadow: 0 8px 18px rgba(91, 61, 245, .3); }
  .cta:hover { filter: brightness(1.05); }
  .cta.ghost { background: transparent; color: var(--brand-ink); box-shadow: none; border: 2px solid var(--brand-soft); }
  .cta.ghost svg { stroke: var(--brand-ink); }
  .cta:focus-visible, .rc:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
  .list { background: var(--card); border-radius: 24px; box-shadow: var(--shadow); overflow: hidden; }
  .list-h { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .list-h b { font-size: 17px; }
  .list-h span.c { color: var(--muted); font-size: 13.5px; }
  .list-h .chips { margin-inline-start: auto; display: flex; gap: 6px; flex-wrap: wrap; font-size: 12.5px; }
  .list-h .chips span { padding: 3px 10px; border-radius: 999px; font-weight: 600; }
  .list-h .chips .sw { background: var(--brand-soft); color: var(--brand-ink); }
  .list-h .chips .ms { background: var(--warn-soft); color: var(--warn); }
  .list-h .chips .sv { background: var(--mint-soft); color: var(--mint); }
  .row { display: grid; grid-template-columns: 64px 1fr auto; gap: 14px; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--line); animation: pop .4s ease both; animation-delay: calc(var(--i) * 28ms); }
  .row:last-child { border-bottom: 0; }
  @keyframes pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .row { animation: none; } .rc { transition: none; } }
  .row img { width: 64px; height: 64px; object-fit: contain; border-radius: 14px; background: #fff; border: 1px solid var(--line); }
  .row .n { font-weight: 600; font-size: 15.5px; }
  .row .m { color: var(--muted); font-size: 13px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .row .m .q { background: var(--brand-soft); color: var(--brand-ink); font-weight: 600; padding: 1px 9px; border-radius: 999px; font-size: 12.5px; }
  .row .m .tip { color: var(--mint); font-weight: 600; }
  .row .pr { text-align: left; }
  .row .pr b { display: block; font-family: "Secular One", sans-serif; font-weight: 400; font-size: 20px; }
  .row .pr small { color: var(--muted); font-size: 12px; }
  .row .pr .best { display: inline-block; background: var(--sun-soft); color: var(--sun-ink); font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 999px; margin-top: 2px; }
  .row.swap { background: var(--brand-soft); }
  .row.swap .n { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .row.swap .n .tag { font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: var(--brand); color: #fff; }
  .row.swap .why { display: flex; align-items: center; gap: 8px; color: var(--ink-2); font-size: 13px; margin-top: 4px; flex-wrap: wrap; }
  .row.swap .why img { width: 26px; height: 26px; border-radius: 7px; }
  .row.swap .why s { color: var(--muted); }
  .row.swap .why a { color: var(--brand-ink); font-weight: 600; text-decoration: none; border-bottom: 1px dashed currentColor; cursor: pointer; }
  .row.miss { background: var(--warn-soft); }
  .row.miss img { filter: grayscale(1); opacity: .6; }
  .row.miss .n { color: var(--ink-2); text-decoration: line-through; text-decoration-color: var(--muted); }
  .row.miss .m .tip { color: var(--warn); }

  .rc .panel { grid-column: 1 / -1; border-top: 1px solid var(--line); margin-top: 6px; padding-top: 6px; cursor: default; }
  .rc .hint { grid-column: 1 / -1; font-size: 12.5px; color: var(--muted); display: flex; align-items: center; gap: 6px; margin-top: -4px; }
  .rc .hint svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; transition: transform .2s; }
  .rc.open .hint svg { transform: rotate(180deg); }
  .sec { padding: 10px 0 4px; }
  .sec + .sec { border-top: 1px dashed var(--line); }
  .sec h4 { margin: 0; padding: 4px 0; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
  .sec h4:hover { color: var(--brand-ink); }
  .sec .body { display: none; padding-top: 4px; }
  .sec.open .body { display: block; }
  .sec h4 .chev { width: 16px; height: 16px; stroke: var(--muted); fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; margin-inline-start: 4px; transition: transform .2s; flex: none; }
  .sec.open h4 .chev { transform: rotate(-90deg); }
  .sec h4 .cnt { font-family: "Secular One", sans-serif; font-weight: 400; font-size: 13px; min-width: 22px; height: 22px; padding: 0 7px; border-radius: 999px; display: grid; place-items: center; }
  .sec.swaps h4 .cnt { background: var(--brand-soft); color: var(--brand-ink); }
  .sec.cart h4 .cnt { background: var(--mint-soft); color: var(--mint); }
  .sec.missing h4 .cnt { background: var(--warn-soft); color: var(--warn); }
  .sec h4 .sum { margin-inline-start: auto; font-weight: 500; font-size: 13px; color: var(--ink-2); }
  .sec h4 .cnt { flex: none; }
  .li { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: center; padding: 7px 0; font-size: 14px; }
  .li img { width: 48px; height: 48px; object-fit: contain; border-radius: 10px; background: #fff; border: 1px solid var(--line); }
  .li .n { font-weight: 600; }
  .li .m { color: var(--muted); font-size: 12.5px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .li .m .q { background: var(--brand-soft); color: var(--brand-ink); font-weight: 600; padding: 0 8px; border-radius: 999px; font-size: 12px; }
  .li .pr { text-align: left; font-family: "Secular One", sans-serif; font-size: 17px; }
  .li .pr small { display: block; font-family: "Rubik", sans-serif; color: var(--muted); font-size: 11.5px; }
  .li .pr .best { display: inline-block; font-family: "Rubik", sans-serif; background: var(--sun-soft); color: var(--sun-ink); font-size: 11px; font-weight: 700; padding: 0 7px; border-radius: 999px; }
  .swap-li { display: grid; grid-template-columns: 1fr 28px 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; margin: 4px 0; border-radius: 14px; background: var(--brand-soft); font-size: 13.5px; }
  .swap-li .side { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .swap-li .side img { width: 40px; height: 40px; object-fit: contain; border-radius: 9px; background: #fff; border: 1px solid var(--line); flex: none; }
  .swap-li .side .n { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
  .swap-li .side .m { font-size: 12px; color: var(--muted); }
  .swap-li .side.from .n { text-decoration: line-through; text-decoration-color: var(--muted); color: var(--ink-2); font-weight: 500; }
  .swap-li .arr { text-align: center; color: var(--brand-ink); font-weight: 700; }
  .swap-li .why { grid-column: 1 / -1; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; font-size: 12.5px; color: var(--ink-2); }
  .swap-li .why b { color: var(--brand-ink); }
  .swap-li .why .save { background: var(--mint-soft); color: var(--mint); font-weight: 700; padding: 0 8px; border-radius: 999px; }
  .swap-li .why .cost { background: var(--warn-soft); color: var(--warn); font-weight: 700; padding: 0 8px; border-radius: 999px; }
  .swap-li .why a { margin-inline-start: auto; color: var(--brand-ink); font-weight: 600; cursor: pointer; border-bottom: 1px dashed currentColor; }
  .swap-li .pr { font-family: "Secular One", sans-serif; font-size: 17px; text-align: left; }
  .miss-li { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: center; padding: 7px 0; font-size: 14px; }
  .miss-li img { width: 48px; height: 48px; object-fit: contain; border-radius: 10px; background: #fff; border: 1px solid var(--line); filter: grayscale(1); opacity: .65; }
  .miss-li .n { font-weight: 600; text-decoration: line-through; text-decoration-color: var(--muted); color: var(--ink-2); }
  .miss-li .m { color: var(--warn); font-size: 12.5px; }
  .miss-li .pr { font-size: 12.5px; color: var(--muted); text-align: left; }
  .list { display: none; }
  .imgs { display: none; }
  @media (max-width: 760px) { .rc { grid-template-columns: 36px 1fr auto; } .rc .cta { grid-column: 1 / -1; justify-content: center; } h1 { font-size: 30px; } .wrap, .top { padding-inline: 16px; } .top nav { display: none; } .rc .pr b { font-size: 24px; } }
</style>
<header class="top">
  <div class="logo"><i><svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11.5a2 2 0 0 0 2 1.5h7.8a2 2 0 0 0 2-1.5L21 8H6.5"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/></svg></i>סל חכם</div>
  <nav><a href="#">הסל שלי</a><a href="#" class="on">איפה הכי זול?</a><a href="#">ההזמנות שלי</a></nav>
  <div class="me">נ</div>
</header>
<main class="wrap">
  <h1 id="h1"></h1>
  <p class="sub" id="sub"></p>
  <div class="rank" id="rank"></div>
  <section class="list">
    <div class="list-h"><b id="lh"></b><span class="c">${items.length} מוצרים · ${units} יחידות</span><div class="chips" id="chips"></div></div>
    <div id="rows"></div>
  </section>
</main>
<div class="imgs">${imgs}</div>
<script>
(function () {
  var D = ${data};
  var nis = function (n) { return '₪' + n.toFixed(2); };
  var $ = function (id) { return document.getElementById(id); };
  var im = function (g) { return document.getElementById('im-' + g).src; };
  var keep = {}; // rule index -> true when the shopper chose to keep the original brand
  var open = {}; var opened = false; var secOpen = {};
  // Resolve the basket for a chain: each line is {it, use: original|substitute, sub, why} or missing.
  function resolve(c) {
    var lines = [], sw = 0, ms = 0, cheaper = 0, saved = 0, sub = 0;
    D.items.forEach(function (it) {
      var p = it.prices[c];
      var rule = D.rules.find(function (r) { return r.orig === it.gtin; });
      var s = rule && D.subs[rule.sub], sp = s && s.prices[c];
      if (rule && rule.why === 'missing' && p == null && sp != null) { lines.push({ it: it, sub: s, why: 'missing', price: sp }); sw++; sub += sp * it.qty; return; }
      if (rule && rule.why === 'cheaper' && p != null && sp != null && sp < p && !keep[rule.orig]) { lines.push({ it: it, sub: s, why: 'cheaper', price: sp, orig: p }); cheaper++; saved += (p - sp) * it.qty; sub += sp * it.qty; return; }
      if (p == null) { lines.push({ it: it, missing: true }); ms++; return; }
      lines.push({ it: it, price: p, keepable: rule && rule.why === 'cheaper' && sp != null && sp < p }); sub += p * it.qty;
    });
    var ch = D.chains[c];
    return { c: c, lines: lines, sw: sw, ms: ms, cheaper: cheaper, saved: Math.round(saved * 100) / 100, subtotal: Math.round(sub * 100) / 100, total: Math.round((sub + ch.delivery) * 100) / 100, complete: ms === 0 };
  }
  function cheapestOther(it, c) { var best = null; D.order.forEach(function (o) { if (o === c || it.prices[o] == null) return; if (!best || it.prices[o] < it.prices[best]) best = o; }); return best; }
  function isOpen(c, k) { return !!secOpen[c + ':' + k]; }
  function panel(r) {
    var ch = D.chains[r.c];
    var swaps = r.lines.filter(function (l) { return l.sub; });
    var cart = r.lines.filter(function (l) { return !l.missing; });
    var miss = r.lines.filter(function (l) { return l.missing; });
    var h = '';
    if (swaps.length) {
      h += '<div class="sec swaps' + (isOpen(r.c, 'swaps') ? ' open' : '') + '"><h4 data-sec="swaps"><span class="cnt">' + swaps.length + '</span>מוצרים שהחלפנו<span class="sum">' + (r.saved ? 'חיסכון ' + nis(r.saved) : '') + '</span><svg class="chev" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></h4><div class="body">';
      h += swaps.map(function (l) {
        var it = l.it, diff = l.orig != null ? (l.orig - l.price) * it.qty : null;
        var why = l.why === 'missing' ? 'למה: <b>' + it.name.split(',')[0] + ' לא נמכר ב' + ch.name + ' אונליין</b>. איך: אותו מותג, אריזה אחרת.' : 'למה: <b>מותג זול יותר</b>. איך: אותו מוצר (' + (it.name.split(',')[1] || '').trim() + '), מותג אחר.';
        var money = diff != null ? '<span class="save">חוסכים ' + nis(diff) + '</span>' : '<span class="cost">' + (it.qty > 1 ? it.qty + ' × ' : '') + nis(l.price) + '</span>';
        return '<div class="swap-li"><div class="side from"><img src="' + im(it.gtin) + '" alt=""><div><div class="n">' + it.name + '</div><div class="m">' + it.brand + (l.orig != null ? ' · ' + nis(l.orig) : '') + '</div></div></div><div class="arr">←</div><div class="side to"><img src="' + im(l.sub.gtin) + '" alt=""><div><div class="n">' + l.sub.name + '</div><div class="m">' + l.sub.brand + ' · ' + nis(l.price) + '</div></div></div><div class="pr">' + nis(l.price * it.qty) + '</div><div class="why"><span>' + why + '</span>' + money + (l.why === 'cheaper' ? '<a data-keep="' + it.gtin + '">להשאיר ' + it.brand + '</a>' : '') + '</div></div>';
      }).join('');
      h += '</div></div>';
    }
    h += '<div class="sec cart' + (isOpen(r.c, 'cart') ? ' open' : '') + '"><h4 data-sec="cart"><span class="cnt">' + cart.length + '</span>מה נכנס לעגלה<span class="sum">' + nis(r.subtotal) + ' + משלוח ' + nis(ch.delivery) + ' = ' + nis(r.total) + '</span><svg class="chev" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></h4><div class="body">';
    h += cart.map(function (l) {
      var it = l.it, g = l.sub ? l.sub.gtin : it.gtin, name = l.sub ? l.sub.name : it.name, brandN = l.sub ? l.sub.brand : it.brand;
      var other = cheapestOther(it, r.c), isBest = !l.sub && (!other || l.price <= it.prices[other]);
      return '<div class="li"><img src="' + im(g) + '" alt=""><div><div class="n">' + name + (l.sub ? ' <span style="font-size:11px;background:var(--brand);color:#fff;padding:0 7px;border-radius:999px;font-weight:700">הוחלף</span>' : '') + '</div><div class="m"><span>' + brandN + '</span>' + (it.qty > 1 ? '<span class="q">× ' + it.qty + '</span>' : '') + (l.keepable ? '<a data-swap="' + it.gtin + '" style="color:var(--brand-ink);font-weight:600;cursor:pointer">יש מותג זול יותר</a>' : '') + '</div></div><div class="pr">' + nis(l.price * it.qty) + (it.qty > 1 ? '<small>' + nis(l.price) + ' ליח׳</small>' : '') + (isBest ? '<small><span class="best">הכי זול</span></small>' : '') + '</div></div>';
    }).join('');
    h += '</div></div>';
    if (miss.length) {
      h += '<div class="sec missing' + (isOpen(r.c, 'missing') ? ' open' : '') + '"><h4 data-sec="missing"><span class="cnt">' + miss.length + '</span>חסרים, ירדו מהסל<span class="sum">לא נכללים במחיר</span><svg class="chev" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></h4><div class="body">';
      h += miss.map(function (l) { var it = l.it, other = cheapestOther(it, r.c); return '<div class="miss-li"><img src="' + im(it.gtin) + '" alt=""><div><div class="n">' + it.name + '</div><div class="m">לא נמכר ב' + ch.name + ' אונליין, ולא מצאנו תחליף' + (it.qty > 1 ? ' · ' + it.qty + ' יח׳' : '') + '</div></div><div class="pr">' + (other ? 'ב' + D.chains[other].name + ' ' + nis(it.prices[other]) : '') + '</div></div>'; }).join('');
      h += '</div></div>';
    }
    return h;
  }
  function render() {
    var R = D.order.map(resolve);
    R.sort(function (a, b) { return a.total - b.total; });
    var completes = R.filter(function (r) { return r.complete; });
    var first = completes[0], second = completes[1];
    if (!opened) { open[first.c] = true; opened = true; }
    $('h1').innerHTML = 'השבוע הכי זול לך ב<b>' + D.chains[first.c].name + '</b>';
    $('sub').innerHTML = nis(first.total) + ' לסל שלם כולל משלוח' + (first.cheaper ? ', אחרי ' + first.cheaper + ' החלפה למותג זול יותר' : '') + '. ' + (second ? '<span class="save">חוסכים ' + nis(second.total - first.total) + '</span> לעומת ' + D.chains[second.c].name + ' במקום השני.' : '');
    $('rank').innerHTML = R.map(function (r, i) {
      var ch = D.chains[r.c];
      var tags = r.complete && !r.sw && !r.cheaper ? '<span class="ok">סל שלם, בלי שינויים</span>' : '';
      if (r.sw) tags += '<span class="sw">' + (r.sw > 1 ? r.sw + ' החלפות' : 'החלפה') + ' בגלל חוסר</span>';
      if (r.cheaper) tags += '<span class="sw">מותג זול יותר' + (r.cheaper > 1 ? ' ×' + r.cheaper : '') + '</span>';
      r.lines.filter(function (l) { return l.missing; }).forEach(function (l) { tags += '<span class="ms">חסר: ' + l.it.name.split(',')[0] + '</span>'; });
      var crown = r.c === first.c ? '<span class="crown">הכי זול לסל שלם</span>' : '';
      return '<div class="rc' + (open[r.c] ? ' on open' : '') + (r.c === first.c ? ' first' : '') + (r.complete ? '' : ' partial') + '" data-c="' + r.c + '" tabindex="0" role="button">' + crown + '<div class="pos">' + (i + 1) + '</div><div class="who"><div class="nm"><i style="background:' + D.brand[r.c] + '">' + D.initials[r.c] + '</i>' + ch.name + '<span style="font-weight:400;color:var(--muted);font-size:13px">משלוח ' + nis(ch.delivery) + '</span></div><div class="tg">' + tags + '</div></div><div class="pr"><b>' + nis(r.total) + '</b><small>' + (r.complete ? 'כולל משלוח' : 'סל חלקי, כולל משלוח') + '</small></div><button class="cta' + (r.c === first.c ? '' : ' ghost') + '" data-order="' + r.c + '"><svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11.5a2 2 0 0 0 2 1.5h7.8a2 2 0 0 0 2-1.5L21 8H6.5"/></svg>הזמן ב' + ch.name + '</button>' + (open[r.c] ? '<div class="panel">' + panel(r) + '</div>' : '') + '<div class="hint"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>' + (open[r.c] ? 'סגירה' : 'מה בדיוק נכנס לעגלה, מה הוחלף ומה חסר') + '</div></div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.rc'), function (t) { t.addEventListener('click', function (e) { if (e.target.closest('[data-order], .panel')) return; var c = t.getAttribute('data-c'); open[c] = !open[c]; render(); }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-order]'), function (b) { b.addEventListener('click', function () { b.textContent = 'טוענים עגלה ב' + D.chains[b.getAttribute('data-order')].name + '…'; }); });
    Array.prototype.forEach.call(document.querySelectorAll('.sec h4[data-sec]'), function (hh) { hh.addEventListener('click', function () { var c = hh.closest('.rc').getAttribute('data-c'), k = c + ':' + hh.getAttribute('data-sec'); secOpen[k] = !secOpen[k]; render(); }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-keep]'), function (a) { a.addEventListener('click', function () { keep[a.getAttribute('data-keep')] = true; render(); }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-swap]'), function (a) { a.addEventListener('click', function () { delete keep[a.getAttribute('data-swap')]; render(); }); });
  }
  render();
})();
</script>`;
fs.writeFileSync(S + '/compare-rank.html', html);
console.log('compare-rank.html', fs.statSync(S + '/compare-rank.html').size);
