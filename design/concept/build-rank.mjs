import fs from 'node:fs';
// Builds compare-rank.html: the approved "ranked chains" comparison screen of סל חכם (see docs/DESIGN.md).
// Data: basket-data.json (basket, per-chain prices, chain meta), img/<gtin>.s.jpg (product photos), icons/ (Phosphor).
const S = process.argv[2] || new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const { items, chains } = JSON.parse(fs.readFileSync(S + '/basket-data.json', 'utf8'));
const icon = (name, cls) => fs.readFileSync(`${S}/icons/${name}-bold.svg`, 'utf8').replace('<svg ', `<svg class="${cls}" aria-hidden="true" `).replace(/\n/g, '');
const ICON_CART = icon('shopping-cart-simple', 'ic');
const ICON_CARET = icon('caret-left', 'chev');
const img = (g) => 'data:image/jpeg;base64,' + fs.readFileSync(`${S}/img/${g}.s.jpg`).toString('base64');

// Substitutes (real products from the chain catalogs) and the rules that apply them.
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
const data = JSON.stringify({ items: items.map((i) => ({ gtin: i.gtin, name: i.name, brand: i.brand, qty: i.qty, prices: i.prices, size: sizes[i.gtin] || null })), subs: subsCatalog, rules, chains, order, brand, initials });
const imgs = [...items.map((it) => it.gtin), ...Object.keys(subsCatalog)].map((g) => `<img id="im-${g}" src="${img(g)}" alt="">`).join('');

const html = `<title>סל חכם</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f5ff">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#16152a">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Secular+One&family=Rubik:wght@400;500;600;700&display=swap">
<style>
  :root { --bg: #f7f5ff; --card: #ffffff; --ink: #1c1b2e; --ink-2: #5a5872; --muted: #6b6985; --line: #e9e6f7; --brand: #5a47dc; --brand-ink: #3d2db4; --brand-soft: #ebe8fb; --sun: #f7cf4a; --sun-ink: #5c4300; --sun-soft: #fff6cf; --mint: #1fb77a; --mint-ink: #0f7a50; --mint-soft: #e2f8ee; --warn: #9a4a00; --warn-soft: #fff1e0; --shadow: 0 1px 2px rgba(60, 40, 160, .05), 0 14px 36px rgba(60, 40, 160, .10); --ease: cubic-bezier(.32, .72, 0, 1); --ease-out: cubic-bezier(.23, 1, .32, 1); }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #16152a; --card: #1f1e35; --ink: #f1efff; --ink-2: #c3c0dc; --muted: #a09dbd; --line: #2d2b48; --brand: #5a47dc; --brand-ink: #b3a6ff; --brand-soft: #2a2450; --sun: #f7cf4a; --sun-ink: #5c4300; --sun-soft: #3a3110; --mint: #3ad693; --mint-ink: #7fe8b8; --mint-soft: #133528; --warn: #f0a04b; --warn-soft: #3a2a12; --shadow: 0 1px 2px rgba(0,0,0,.3), 0 14px 36px rgba(0,0,0,.4); } }
  :root[data-theme="dark"] { --bg: #16152a; --card: #1f1e35; --ink: #f1efff; --ink-2: #c3c0dc; --muted: #a09dbd; --line: #2d2b48; --brand: #5a47dc; --brand-ink: #b3a6ff; --brand-soft: #2a2450; --sun: #f7cf4a; --sun-ink: #5c4300; --sun-soft: #3a3110; --mint: #3ad693; --mint-ink: #7fe8b8; --mint-soft: #133528; --warn: #f0a04b; --warn-soft: #3a2a12; --shadow: 0 1px 2px rgba(0,0,0,.3), 0 14px 36px rgba(0,0,0,.4); }
  * { box-sizing: border-box; }
  html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Rubik", "Segoe UI", system-ui, Arial, sans-serif; direction: rtl; font-size: 15px; line-height: 1.45; font-variant-numeric: tabular-nums; font-optical-sizing: auto; }
  button { font: inherit; color: inherit; }
  .cta, .rc, .sec-h, .top nav a, .linkbtn, .toggle { touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  :focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; border-radius: 8px; }
  .skip { position: absolute; inset-inline-start: 12px; top: -48px; background: var(--brand); color: #fff; padding: 8px 14px; border-radius: 10px; font-weight: 600; z-index: 1; }
  .skip:focus { top: 12px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  .top { display: flex; align-items: center; gap: 18px; padding: calc(16px + env(safe-area-inset-top, 0px)) calc(24px + env(safe-area-inset-right, 0px)) 16px calc(24px + env(safe-area-inset-left, 0px)); }
  .logo { display: flex; align-items: center; gap: 10px; font-family: "Secular One", sans-serif; font-size: 24px; color: var(--brand-ink); }
  .logo i { width: 36px; height: 36px; border-radius: 12px; background: var(--brand); display: grid; place-items: center; }
  .ic { width: 20px; height: 20px; fill: currentColor; flex: none; }
  .logo .ic { color: #fff; }
  .top nav { display: flex; gap: 18px; color: var(--ink-2); font-weight: 500; }
  .top nav a { text-decoration: none; color: inherit; padding: 6px 10px; border-radius: 999px; min-height: 36px; display: inline-flex; align-items: center; }
  .top nav a.on { background: var(--card); color: var(--brand-ink); box-shadow: var(--shadow); }
  .top .back { display: none; }
  .top .me { margin-inline-start: auto; width: 36px; height: 36px; border-radius: 50%; background: var(--sun); color: var(--sun-ink); display: grid; place-items: center; font-weight: 700; }

  .wrap { max-width: 1040px; margin: 0 auto; padding: 8px 24px calc(60px + env(safe-area-inset-bottom, 0px)); }
  h1 { font-family: "Secular One", sans-serif; font-weight: 400; font-size: 38px; line-height: 1.1; margin: 8px 0 4px; text-wrap: balance; letter-spacing: -.02em; }
  h1 b { color: var(--brand-ink); font-weight: 400; }
  .sub { color: var(--ink-2); font-size: 16px; margin: 0 0 20px; max-width: 62ch; }
  .sub .save { display: inline-block; background: var(--sun); color: var(--sun-ink); font-weight: 700; padding: 2px 10px; border-radius: 999px; }
  .asof { font-size: 12.5px; color: var(--muted); margin: -12px 0 18px; letter-spacing: .01em; }

  .rank { display: grid; gap: 10px; margin-bottom: 26px; padding: 6px; }
  .group-h { font-size: 13px; color: var(--muted); font-weight: 600; letter-spacing: .01em; padding: 12px 6px 0; display: flex; gap: 8px; align-items: center; }
  .group-h::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  .rc { position: relative; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto auto; gap: 12px 16px; align-items: center; background: var(--card); border: 2px solid transparent; border-radius: 20px; padding: 14px 18px; box-shadow: var(--shadow); cursor: pointer; min-width: 0; transition: border-color 200ms var(--ease-out), transform 200ms var(--ease-out), box-shadow 250ms var(--ease-out); }
  .rank.first-paint .rc { animation: rise 450ms var(--ease-out) both; animation-delay: calc(var(--i, 0) * 40ms); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  .rc.on { border-color: var(--brand); }
  .rc.first { box-shadow: 0 0 0 6px var(--brand-soft), var(--shadow); }
  .rc:active { transform: scale(.992); }
  .rc .pos { font-family: "Secular One", sans-serif; font-size: 26px; color: var(--muted); text-align: center; align-self: start; margin-top: 2px; }
  .rc.first .pos { color: var(--sun-ink); background: var(--sun); border-radius: 12px; line-height: 44px; margin-top: 0; }
  .rc.partial .pos { color: var(--muted); }
  .rc .crown { position: absolute; top: -11px; inset-inline-start: 18px; background: var(--sun); color: var(--sun-ink); font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px; }
  .rc .who { display: grid; gap: 4px; min-width: 0; }
  .rc .who h2 { margin: 0; font-size: 17px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
  .rc .who h2 i { width: 30px; height: 30px; border-radius: 10px; color: #fff; display: grid; place-items: center; font-family: "Secular One", sans-serif; font-size: 15px; flex: none; }
  .rc .who .ship { font-size: 13px; color: var(--muted); letter-spacing: .01em; }
  .rc .who .tg { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12.5px; align-items: center; letter-spacing: .01em; }
  .rc .who .tg span { padding: 2px 9px; border-radius: 999px; background: var(--line); color: var(--ink-2); font-weight: 500; }
  .rc .who .tg span.ok { background: var(--mint-soft); color: var(--mint-ink); }
  .rc .who .tg span.sw { background: var(--brand-soft); color: var(--brand-ink); }
  .rc .who .tg span.ms { background: var(--warn-soft); color: var(--warn); }
  .rc .pr { text-align: left; display: grid; }
  .rc .pr b { font-family: "Secular One", sans-serif; font-weight: 400; font-size: 28px; line-height: 1; letter-spacing: -.01em; }
  .rc.partial .pr b { color: var(--ink-2); }
  .rc .pr b.blink { animation: blink 200ms ease; }
  @keyframes blink { 50% { opacity: .4; } }
  .rc .pr small { color: var(--ink-2); font-size: 12.5px; letter-spacing: .01em; }
  .rc.partial .pr small { color: var(--warn); font-weight: 600; }

  .cta { background: var(--brand); color: #fff; border: 0; border-radius: 14px; padding: 12px 18px; font-weight: 700; font-size: 15px; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap; box-shadow: 0 8px 18px rgba(90, 71, 220, .28); transition: transform 160ms var(--ease-out), filter 200ms ease, box-shadow 200ms var(--ease-out), opacity 200ms ease; }
  .cta.ghost { background: var(--brand-soft); color: var(--brand-ink); box-shadow: none; }
  .cta:active { transform: scale(.97); }
  .cta[disabled] { cursor: default; opacity: .85; }
  .cta .disc { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,.18); display: grid; place-items: center; flex: none; transition: transform 200ms var(--ease-out); }
  .cta.ghost .disc { background: rgba(90, 71, 220, .12); }
  .cta .disc .ic { width: 16px; height: 16px; }
  .cta .lbl { transition: filter 200ms ease, opacity 200ms ease; }
  .cta .lbl.swapping { filter: blur(2px); opacity: .7; }
  .cta .spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; animation: spin 700ms linear infinite; }
  .cta.ghost .spin { border-color: rgba(90,71,220,.25); border-top-color: var(--brand-ink); }
  @keyframes spin { to { transform: rotate(360deg); } }

  .rc .toggle { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); background: none; border: 0; padding: 0; min-height: 40px; cursor: pointer; letter-spacing: .01em; text-align: right; }
  .rc .toggle .chev { width: 14px; height: 14px; fill: currentColor; transition: transform 200ms var(--ease-out); }
  .rc.on .toggle .chev { transform: rotate(-90deg); }
  .rc .panel { grid-column: 1 / -1; border-top: 1px solid var(--line); margin-top: 6px; padding-top: 6px; cursor: default; animation: panelIn 180ms var(--ease-out) both; }
  @keyframes panelIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }

  .sec + .sec { border-top: 1px dashed var(--line); }
  .sec h3 { margin: 0; font-size: 14px; }
  .sec-h { width: 100%; display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 4px 0; background: none; border: 0; font-weight: 700; font-size: 14px; cursor: pointer; text-align: right; }
  .sec-h .cnt { font-family: "Secular One", sans-serif; font-weight: 400; font-size: 13px; min-width: 22px; height: 22px; padding: 0 7px; border-radius: 999px; display: grid; place-items: center; flex: none; }
  .sec.swaps .cnt { background: var(--brand-soft); color: var(--brand-ink); }
  .sec.cart .cnt { background: var(--mint-soft); color: var(--mint-ink); }
  .sec.missing .cnt { background: var(--warn-soft); color: var(--warn); }
  .sec-h .sum { margin-inline-start: auto; font-weight: 500; font-size: 13px; color: var(--ink-2); letter-spacing: .01em; text-align: left; }
  .sec-h .chev { width: 16px; height: 16px; fill: var(--muted); margin-inline-start: 4px; transition: transform 200ms var(--ease-out); flex: none; }
  .sec.open .sec-h .chev { transform: rotate(-90deg); }
  .sec .body { display: none; padding: 4px 0 8px; animation: panelIn 180ms var(--ease-out) both; }
  .sec.open .body { display: block; }

  .li { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 7px 0; font-size: 14px; }
  .li img, .miss-li img, .swap-li img { width: 48px; height: 48px; object-fit: contain; border-radius: 12px; background: #fff; border: 1px solid var(--line); flex: none; }
  .li .n { font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .tag { font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: var(--brand); color: #fff; letter-spacing: .01em; }
  .li .m { color: var(--muted); font-size: 12.5px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; letter-spacing: .01em; }
  .li .m .q { background: var(--brand-soft); color: var(--brand-ink); font-weight: 600; padding: 0 8px; border-radius: 999px; font-size: 12px; }
  .li .m .more { color: var(--warn); font-weight: 600; }
  .li .pr { text-align: left; font-family: "Secular One", sans-serif; font-size: 17px; }
  .li .pr small { display: block; font-family: "Rubik", sans-serif; color: var(--muted); font-size: 12px; letter-spacing: .01em; }
  .linkbtn { background: none; border: 0; padding: 0; color: var(--brand-ink); font-weight: 600; cursor: pointer; border-bottom: 1px dashed currentColor; font-size: inherit; min-height: 28px; }

  .swap-li { display: grid; grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 12px; margin: 6px 0; border-radius: 14px; background: var(--brand-soft); font-size: 13.5px; }
  .swap-li .side { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .swap-li .side .n { font-weight: 600; }
  .swap-li .side .m { font-size: 12.5px; color: var(--ink-2); letter-spacing: .01em; }
  .swap-li .side.from .n { text-decoration: line-through; text-decoration-color: var(--muted); color: var(--ink-2); font-weight: 500; }
  .swap-li .arr { display: grid; place-items: center; }
  .swap-li .arr .chev { width: 18px; height: 18px; fill: var(--brand-ink); }
  .swap-li .pr { font-family: "Secular One", sans-serif; font-size: 17px; text-align: left; }
  .swap-li .why { grid-column: 1 / -1; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; font-size: 13px; color: var(--ink-2); letter-spacing: .01em; }
  .swap-li .why .save { background: var(--mint-soft); color: var(--mint-ink); font-weight: 700; padding: 0 8px; border-radius: 999px; }
  .swap-li .why .cost { background: var(--line); color: var(--ink-2); font-weight: 600; padding: 0 8px; border-radius: 999px; }
  .swap-li .why .acts { margin-inline-start: auto; display: flex; gap: 12px; }

  .miss-li { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 7px 0; font-size: 14px; }
  .miss-li img { filter: grayscale(1); opacity: .65; }
  .miss-li .n { font-weight: 600; text-decoration: line-through; text-decoration-color: var(--muted); color: var(--ink-2); }
  .miss-li .m { color: var(--warn); font-size: 12.5px; letter-spacing: .01em; }
  .miss-li .pr { font-size: 12.5px; color: var(--ink-2); text-align: left; letter-spacing: .01em; }

  .empty { display: grid; justify-items: center; gap: 10px; padding: 40px 20px; background: var(--card); border-radius: 24px; box-shadow: var(--shadow); color: var(--ink-2); text-align: center; }
  .empty .ic { width: 40px; height: 40px; color: var(--brand); }
  .skel { background: linear-gradient(90deg, var(--line) 25%, var(--card) 50%, var(--line) 75%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; border-radius: 12px; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  .imgs { display: none; }

  @media (hover: hover) and (pointer: fine) {
    .rc:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(60, 40, 160, .06), 0 18px 44px rgba(60, 40, 160, .14); }
    .cta:not([disabled]):hover { filter: brightness(1.05); }
    .cta:not([disabled]):hover .disc { transform: translateX(-2px) scale(1.06); }
    .sec-h:hover { color: var(--brand-ink); }
  }
  @media (prefers-reduced-motion: reduce) {
    @keyframes rise { from { opacity: 0; } to { opacity: 1; } }
    @keyframes panelIn { from { opacity: 0; } to { opacity: 1; } }
    .rc, .cta, .disc, .chev { transition: none; }
    .rc:hover, .cta:active, .rc:active { transform: none; }
    .cta .lbl.swapping { filter: none; }
  }
  @media (max-width: 760px) {
    .wrap, .top { padding-inline: 16px; }
    .top nav { display: none; }
    .top .back { display: inline-flex; align-items: center; gap: 6px; color: var(--brand-ink); font-weight: 600; text-decoration: none; min-height: 36px; }
    .top .back .chev { width: 14px; height: 14px; fill: currentColor; transform: rotate(180deg); }
    h1 { font-size: 30px; }
    .rc { grid-template-columns: 36px minmax(0, 1fr); padding: 14px; }
    .rc .pos { font-size: 22px; }
    .rc.first .pos { line-height: 36px; }
    .rc .pr { grid-column: 1 / -1; text-align: right; }
    .rc .pr b { font-size: 26px; }
    .rc .cta { grid-column: 1 / -1; justify-content: center; }
    .swap-li { grid-template-columns: 1fr; }
    .swap-li .arr .chev { transform: rotate(-90deg); }
    .swap-li .pr { text-align: right; }
  }
</style>
<a class="skip" href="#main">דלגו לתוכן</a>
<header class="top">
  <div class="logo"><i>${ICON_CART}</i>סל חכם</div>
  <nav aria-label="ראשי"><a href="#basket">הסל שלי</a><a href="#" class="on" aria-current="page">איפה הכי זול?</a><a href="#orders">ההזמנות שלי</a></nav>
  <a class="back" href="#basket">${ICON_CARET}הסל שלי</a>
  <div class="me" aria-label="החשבון של נאור" title="נאור">נ</div>
</header>
<main class="wrap" id="main">
  <h1 id="h1"></h1>
  <p class="sub" id="sub"></p>
  <p class="asof">מחירי אונליין מהבוקר, ${new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}. מתעדכנים כל יום.</p>
  <div class="rank" id="rank"></div>
  <p class="sr" id="live" aria-live="polite"></p>
</main>
<div class="imgs">${imgs}</div>
<script>
(function () {
  var D = ${data};
  var ICON_CART_JS = ${JSON.stringify(ICON_CART)}, ICON_CARET_JS = ${JSON.stringify(ICON_CARET)};
  var nis = function (n) { return '₪' + n.toFixed(2); };
  var $ = function (id) { return document.getElementById(id); };
  var im = function (g) { return document.getElementById('im-' + g).src; };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
  var short = function (name) { return name.split(',')[0]; };
  var keep = {};   // gtin -> true: the shopper keeps the original brand (applies in every chain)
  var noSub = {};  // chain:gtin -> true: the shopper declined the substitute; the product drops out
  var open = {}, secOpen = {}, ordering = {}, painted = false;

  // Resolve one chain's basket: for every product either the original, a substitute, or missing.
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
    var ch = D.chains[c];
    return { c: c, lines: lines, sw: sw, ms: ms, cheaper: cheaper, saved: Math.round(saved * 100) / 100, subtotal: Math.round(sub * 100) / 100, total: Math.round((sub + ch.delivery) * 100) / 100, complete: ms === 0 };
  }
  function cheapestOther(it, c) { var best = null; D.order.forEach(function (o) { if (o === c || it.prices[o] == null) return; if (!best || it.prices[o] < it.prices[best]) best = o; }); return best; }
  function isOpen(c, k) { return !!secOpen[c + ':' + k]; }
  function missingNames(r) { return r.lines.filter(function (l) { return l.missing; }).map(function (l) { return short(l.it.name); }); }

  function panel(r) {
    var ch = D.chains[r.c];
    var swaps = r.lines.filter(function (l) { return l.sub; });
    var cart = r.lines.filter(function (l) { return !l.missing; });
    var miss = r.lines.filter(function (l) { return l.missing; });
    var sec = function (key, cls, count, title, sum, body) {
      var o = isOpen(r.c, key);
      return '<div class="sec ' + cls + (o ? ' open' : '') + '"><h3><button type="button" class="sec-h" data-sec="' + key + '" aria-expanded="' + (o ? 'true' : 'false') + '"><span class="cnt">' + count + '</span>' + title + '<span class="sum">' + sum + '</span>' + ICON_CARET_JS + '</button></h3><div class="body">' + body + '</div></div>';
    };
    var h = '';
    if (swaps.length) {
      h += sec('swaps', 'swaps', swaps.length, 'מוצרים שהחלפנו', r.saved ? 'חיסכון ' + nis(r.saved) : '', swaps.map(function (l) {
        var it = l.it, diff = l.orig != null ? (l.orig - l.price) * it.qty : null;
        var why = l.why === 'missing' ? esc(short(it.name)) + ' לא נמכר ב' + esc(ch.name) + ' אונליין. ' + esc(l.rule.note) + '.' : 'מותג זול יותר. ' + esc(l.rule.note) + '.';
        var money = diff != null ? '<span class="save">חוסכים ' + nis(diff) + '</span>' : '<span class="cost">' + (it.qty > 1 ? it.qty + ' × ' : '') + nis(l.price) + '</span>';
        var acts = l.why === 'cheaper' ? '<button type="button" class="linkbtn" data-keep="' + it.gtin + '">להשאיר ' + esc(it.brand) + '</button>' : '<button type="button" class="linkbtn" data-nosub="' + it.gtin + '">בלי תחליף</button>';
        return '<div class="swap-li"><div class="side from"><img src="' + im(it.gtin) + '" alt="' + esc(it.name) + '"><div><div class="n">' + esc(it.name) + '</div><div class="m">' + esc(it.brand) + (it.size ? ' · ' + esc(it.size) : '') + (l.orig != null ? ' · ' + nis(l.orig) : '') + '</div></div></div><div class="arr">' + ICON_CARET_JS + '</div><div class="side to"><img src="' + im(l.sub.gtin) + '" alt="' + esc(l.sub.name) + '"><div><div class="n">' + esc(l.sub.name) + '</div><div class="m">' + esc(l.sub.brand) + ' · ' + esc(l.sub.size) + ' · ' + nis(l.price) + '</div></div></div><div class="pr">' + nis(l.price * it.qty) + '</div><div class="why"><span>' + why + '</span>' + money + '<span class="acts">' + acts + '</span></div></div>';
      }).join(''));
    }
    h += sec('cart', 'cart', cart.length, 'מה נכנס לעגלה', nis(r.subtotal) + ' + משלוח ' + nis(ch.delivery) + ' = ' + nis(r.total), cart.map(function (l) {
      var it = l.it, g = l.sub ? l.sub.gtin : it.gtin, name = l.sub ? l.sub.name : it.name, brandN = l.sub ? l.sub.brand : it.brand;
      var other = cheapestOther(it, r.c), more = !l.sub && other && it.prices[other] < l.price ? '<span class="more">+' + nis((l.price - it.prices[other]) * it.qty) + ' לעומת ' + esc(D.chains[other].name) + '</span>' : '';
      return '<div class="li"><img src="' + im(g) + '" alt="' + esc(name) + '"><div><div class="n">' + esc(name) + (l.sub ? '<span class="tag">הוחלף</span>' : '') + '</div><div class="m"><span>' + esc(brandN) + '</span>' + (it.qty > 1 ? '<span class="q">× ' + it.qty + '</span>' : '') + more + (l.keepable ? '<button type="button" class="linkbtn" data-swap="' + it.gtin + '">יש מותג זול יותר</button>' : '') + '</div></div><div class="pr">' + nis(l.price * it.qty) + (it.qty > 1 ? '<small>' + nis(l.price) + ' ליח׳</small>' : '') + '</div></div>';
    }).join(''));
    if (miss.length) {
      h += sec('missing', 'missing', miss.length, 'חסרים, ירדו מהסל', 'לא נכללים במחיר', miss.map(function (l) {
        var it = l.it, other = cheapestOther(it, r.c);
        var act = l.declined ? '<button type="button" class="linkbtn" data-resub="' + it.gtin + '">להחזיר את התחליף</button>' : '';
        return '<div class="miss-li"><img src="' + im(it.gtin) + '" alt="' + esc(it.name) + '"><div><div class="n">' + esc(it.name) + '</div><div class="m">' + (l.declined ? 'ביקשת בלי תחליף' : 'לא נמכר ב' + esc(ch.name) + ' אונליין, ולא מצאנו תחליף') + (it.qty > 1 ? ' · ' + it.qty + ' יח׳' : '') + (act ? ' · ' : '') + act + '</div></div><div class="pr">' + (other ? 'ב' + esc(D.chains[other].name) + ' ' + nis(it.prices[other]) : '') + '</div></div>';
      }).join(''));
    }
    return h;
  }

  function card(r, i, first, second) {
    var ch = D.chains[r.c], mnames = missingNames(r);
    var tags = '';
    if (r.complete && !r.sw && !r.cheaper) tags += '<span class="ok">סל שלם, בלי שינויים</span>';
    if (r.sw) tags += '<span class="sw">' + (r.sw > 1 ? r.sw + ' החלפות' : 'החלפה') + ' בגלל חוסר</span>';
    if (r.cheaper && !allCheaper) tags += '<span class="sw">מותג זול יותר</span>';
    mnames.forEach(function (n) { tags += '<span class="ms">חסר: ' + esc(n) + '</span>'; });
    var isFirst = first && r.c === first.c;
    var ctaLabel = ordering[r.c] ? 'פותחים את האתר של ' + esc(ch.name) : (r.complete ? 'הזמן ב' + esc(ch.name) : 'הזמן בלי ' + esc(mnames.join(' ו')));
    var ctaIcon = ordering[r.c] ? '<span class="spin" aria-hidden="true"></span>' : '<span class="disc">' + ICON_CART_JS + '</span>';
    return '<article class="rc' + (open[r.c] ? ' on' : '') + (isFirst ? ' first' : '') + (r.complete ? '' : ' partial') + '" style="--i:' + i + '" data-c="' + r.c + '">' +
      (isFirst ? '<span class="crown">הכי זול לסל שלם</span>' : '') +
      '<div class="pos" aria-hidden="true">' + (i + 1) + '</div>' +
      '<div class="who"><h2><i style="background:' + D.brand[r.c] + '" aria-hidden="true">' + D.initials[r.c] + '</i>' + esc(ch.name) + '<span class="sr">, מקום ' + (i + 1) + '</span></h2><div class="ship">משלוח ' + nis(ch.delivery) + (ch.min ? ' · מינימום הזמנה ₪' + ch.min : '') + '</div><div class="tg">' + tags + '</div></div>' +
      '<div class="pr"><b>' + nis(r.total) + '</b><small>' + (r.complete ? 'כולל משלוח' : 'סל חלקי, בלי ' + esc(mnames.join(' ו'))) + '</small></div>' +
      '<button type="button" class="cta' + (isFirst ? '' : ' ghost') + '" data-order="' + r.c + '"' + (ordering[r.c] ? ' disabled' : '') + '>' + ctaIcon + '<span class="lbl">' + ctaLabel + '</span></button>' +
      (open[r.c] ? '<div class="panel" id="panel-' + r.c + '">' + panel(r) + '</div>' : '') +
      '<button type="button" class="toggle" data-toggle="' + r.c + '" aria-expanded="' + (open[r.c] ? 'true' : 'false') + '" aria-controls="panel-' + r.c + '">' + ICON_CARET_JS + (open[r.c] ? 'סגירה' : 'מה בדיוק נכנס לעגלה, מה הוחלף ומה חסר') + '</button>' +
      '</article>';
  }

  var allCheaper = false;
  function render(focusKey) {
    if (!D.items.length) { $('h1').textContent = 'הסל ריק'; $('sub').innerHTML = 'הוסיפו מוצרים בסל, ונראה איפה הכי זול השבוע.'; $('rank').innerHTML = '<div class="empty">' + ICON_CART_JS + '<div>עדיין אין מה להשוות. חפשו "חלב", "במבה" או "קולה" והוסיפו לסל.</div></div>'; return; }
    var R = D.order.map(resolve);
    // Complete baskets first (cheapest to dearest), then baskets with a missing product.
    R.sort(function (a, b) { return (a.complete === b.complete) ? a.total - b.total : (a.complete ? -1 : 1); });
    var completes = R.filter(function (r) { return r.complete; }), partials = R.filter(function (r) { return !r.complete; });
    var first = completes[0], second = completes[1];
    allCheaper = R.every(function (r) { return r.cheaper > 0; });
    if (!painted) { open[first.c] = true; }
    var before = {}; Array.prototype.forEach.call(document.querySelectorAll('.rc[data-c]'), function (el) { before[el.getAttribute('data-c')] = { top: el.getBoundingClientRect().top, total: el.querySelector('.pr b').textContent }; });
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var wasPainted = painted; painted = true;
    $('h1').innerHTML = 'השבוע הכי זול לך ב<b>' + esc(D.chains[first.c].name) + '</b>';
    $('sub').innerHTML = nis(first.total) + ' לסל שלם כולל משלוח' + (first.cheaper ? ', אחרי החלפה למותג זול יותר' : '') + '. ' + (second ? '<span class="save">חוסכים ' + nis(second.total - first.total) + '</span> לעומת ' + esc(D.chains[second.c].name) + ' במקום השני.' : '') + (partials.length ? ' ב' + partials.map(function (r) { return esc(D.chains[r.c].name); }).join(' וב') + ' חסר מוצר, אז הן מדורגות בנפרד.' : '');
    var rank = $('rank'); rank.className = 'rank' + (wasPainted ? '' : ' first-paint');
    var htmlOut = completes.map(function (r, i) { return card(r, i, first, second); }).join('');
    if (partials.length) htmlOut += '<div class="group-h">רשתות שחסר בהן מוצר, לפי המחיר של מה שכן יש</div>' + partials.map(function (r, j) { return card(r, completes.length + j, first, second); }).join('');
    rank.innerHTML = htmlOut;
    if (wasPainted) Array.prototype.forEach.call(document.querySelectorAll('.rc[data-c]'), function (el) {
      var c = el.getAttribute('data-c'), b = before[c]; if (!b) return;
      var delta = b.top - el.getBoundingClientRect().top;
      if (delta && !reduce && el.animate) el.animate([{ transform: 'translateY(' + delta + 'px)' }, { transform: 'none' }], { duration: 250, easing: 'cubic-bezier(.32, .72, 0, 1)' });
      var tot = el.querySelector('.pr b'); if (tot && tot.textContent !== b.total) { tot.classList.add('blink'); tot.addEventListener('animationend', function () { tot.classList.remove('blink'); }, { once: true }); $('live').textContent = D.chains[c].name + ': ' + tot.textContent; }
    });
    // Restore keyboard focus to the control that was activated (the DOM was rebuilt).
    if (focusKey) { var f = document.querySelector(focusKey); if (f) f.focus({ preventScroll: true }); }
    bind();
  }
  function bind() {
    var on = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); fn(el, e); }); }); };
    Array.prototype.forEach.call(document.querySelectorAll('.rc'), function (t) { t.addEventListener('click', function (e) { if (e.target.closest('button, .panel')) return; var c = t.getAttribute('data-c'); open[c] = !open[c]; render(); }); });
    on('[data-toggle]', function (el) { var c = el.getAttribute('data-toggle'); open[c] = !open[c]; render('[data-toggle="' + c + '"]'); });
    on('.sec-h', function (el) { var c = el.closest('.rc').getAttribute('data-c'), k = el.getAttribute('data-sec'); secOpen[c + ':' + k] = !secOpen[c + ':' + k]; render('.rc[data-c="' + c + '"] .sec-h[data-sec="' + k + '"]'); });
    on('[data-keep]', function (el) { keep[el.getAttribute('data-keep')] = true; render('.rc[data-c="' + el.closest('.rc').getAttribute('data-c') + '"] .sec-h[data-sec="swaps"]'); });
    on('[data-swap]', function (el) { delete keep[el.getAttribute('data-swap')]; render('.rc[data-c="' + el.closest('.rc').getAttribute('data-c') + '"] .sec-h[data-sec="cart"]'); });
    on('[data-nosub]', function (el) { var c = el.closest('.rc').getAttribute('data-c'); noSub[c + ':' + el.getAttribute('data-nosub')] = true; secOpen[c + ':missing'] = true; render('.rc[data-c="' + c + '"] .sec-h[data-sec="missing"]'); });
    on('[data-resub]', function (el) { var c = el.closest('.rc').getAttribute('data-c'); delete noSub[c + ':' + el.getAttribute('data-resub')]; render('.rc[data-c="' + c + '"] .sec-h[data-sec="swaps"]'); });
    on('[data-order]', function (el) {
      var c = el.getAttribute('data-order'), r = resolve(c), mn = missingNames(r);
      if (mn.length && !window.confirm('נעביר ' + r.lines.filter(function (l) { return !l.missing; }).length + ' מוצרים ל' + D.chains[c].name + '. ' + mn.join(' ו') + ' לא ייכנסו לעגלה. להמשיך?')) return;
      var l = el.querySelector('.lbl'); l.classList.add('swapping');
      setTimeout(function () { ordering[c] = true; render('[data-toggle="' + c + '"]'); $('live').textContent = 'פותחים את האתר של ' + D.chains[c].name; }, 200);
    });
  }
  render();
})();
</script>`;
fs.writeFileSync(S + '/compare-rank.html', html);
console.log('compare-rank.html', fs.statSync(S + '/compare-rank.html').size);
