#!/usr/bin/env node
/**
 * Adapter reconnaissance: open a chain's website in a real browser, add one product to the
 * cart through the site's own UI, and record the network calls the site makes. The report
 * tells us the cart-add endpoint, its payload/headers (CSRF etc.) and how items are identified,
 * which is exactly what src/handoff/adapters/<chain>.js needs.
 *
 *   node scripts/recon-chain.mjs shufersal [--out recon/] [--headed]
 *
 * Requires playwright (installed in CI; not a project dependency).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const chainId = process.argv[2];
const outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'recon';
const headed = process.argv.includes('--headed');

const CHAINS = {
  shufersal: {
    home: 'https://www.shufersal.co.il/online/he/',
    search: (q) => `https://www.shufersal.co.il/online/he/search?text=${encodeURIComponent(q)}`,
  },
  ramilevy: {
    home: 'https://www.rami-levy.co.il/he',
    search: (q) => `https://www.rami-levy.co.il/he/search?q=${encodeURIComponent(q)}`,
  },
  carrefour: {
    home: 'https://www.carrefour.co.il/',
    search: (q) => `https://www.carrefour.co.il/search?q=${encodeURIComponent(q)}`,
  },
  yochananof: {
    home: 'https://yochananof.co.il/',
    search: (q) => `https://yochananof.co.il/search?q=${encodeURIComponent(q)}`,
  },
};

const chain = CHAINS[chainId];
if (!chain) { console.error(`unknown chain ${chainId}; one of ${Object.keys(CHAINS).join(', ')}`); process.exit(2); }

const { chromium } = await import('playwright');
mkdirSync(outDir, { recursive: true });

const report = { chainId, startedAt: new Date().toISOString(), pages: [], requests: [], cookies: [], metaTokens: [], storageKeys: [], addClick: null, botWall: null, errors: [] };
const INTERESTING = /cart|basket|add|checkout|order|search|product|catalog|item|api\//i;
const SKIP = /\.(png|jpe?g|gif|svg|webp|woff2?|ttf|css|js|ico|mp4)(\?|$)|google|facebook|doubleclick|analytics|gtm|hotjar|clarity|sentry|segment|appsflyer|taboola|outbrain|dynamicyield|optimizely/i;

const browser = await chromium.launch({ headless: !headed, args: ['--disable-blink-features=AutomationControlled', '--lang=he-IL'] });
const context = await browser.newContext({
  locale: 'he-IL',
  timezoneId: 'Asia/Jerusalem',
  viewport: { width: 1366, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
});
await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const page = await context.newPage();

page.on('requestfinished', async (req) => {
  try {
    const url = req.url();
    if (SKIP.test(url)) return;
    const type = req.resourceType();
    if (!['xhr', 'fetch', 'document'].includes(type)) return;
    if (type !== 'document' && !INTERESTING.test(url) && req.method() === 'GET') return;
    const res = await req.response();
    const headers = req.headers();
    const keep = {};
    for (const [k, v] of Object.entries(headers)) if (/^(content-type|accept|x-|csrf|authorization|referer|origin)/i.test(k) || /token|csrf|session/i.test(k)) keep[k] = v.length > 200 ? v.slice(0, 200) + '…' : v;
    let bodySnippet = null; let contentType = null;
    if (res) {
      contentType = res.headers()['content-type'] ?? null;
      if (/json|text|html/.test(contentType ?? '') && type !== 'document') {
        try { const text = await res.text(); bodySnippet = text.slice(0, 600); } catch { /* ignore */ }
      }
    }
    report.requests.push({ t: Date.now(), phase: report.phase, type, method: req.method(), url: url.slice(0, 400), headers: keep, postData: (req.postData() ?? '').slice(0, 800) || null, status: res?.status() ?? null, contentType, bodySnippet });
  } catch (err) { report.errors.push(`request: ${err.message}`); }
});

async function visit(label, url) {
  report.phase = label;
  const t0 = Date.now();
  let status = null;
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = res?.status() ?? null;
  } catch (err) { report.errors.push(`${label}: ${err.message}`); }
  await page.waitForTimeout(4000);
  const title = await page.title().catch(() => '');
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) ?? '').catch(() => '');
  const shot = path.join(outDir, `${chainId}-${label}.png`);
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  report.pages.push({ label, url: page.url(), status, title, ms: Date.now() - t0, bodyStart: bodyText.replace(/\s+/g, ' ').slice(0, 200) });
  if (/access denied|just a moment|attention required|are you human|blocked|captcha|403 forbidden/i.test(`${title} ${bodyText}`) || status === 403) report.botWall = { label, status, title };
}

async function dismissPopups() {
  const candidates = ['button:has-text("אישור")', 'button:has-text("סגור")', 'button:has-text("הבנתי")', 'button:has-text("המשך")', '[aria-label="close"]', '[aria-label="סגור"]', '.close', 'button.accept', '#onetrust-accept-btn-handler'];
  for (const sel of candidates) {
    try { const el = page.locator(sel).first(); if (await el.isVisible({ timeout: 300 })) { await el.click({ timeout: 1000 }); await page.waitForTimeout(500); } } catch { /* ignore */ }
  }
}

async function findAddButton() {
  const texts = ['הוסף לסל', 'הוספה לסל', 'הוסף לעגלה', 'הוספה לעגלה', 'לסל', 'לעגלה', 'הוסף', 'הוספה'];
  for (const t of texts) {
    const loc = page.locator(`button:has-text("${t}"), a:has-text("${t}"), [role=button]:has-text("${t}")`).first();
    try { if (await loc.isVisible({ timeout: 800 })) return { locator: loc, how: `text:${t}` }; } catch { /* next */ }
  }
  const attrSelectors = ['[aria-label*="הוסף"]', '[aria-label*="לסל"]', '[title*="הוסף"]', '[data-testid*="add"]', '[data-test*="add"]', '[class*="add-to-cart"]', '[class*="addToCart"]', '[class*="add-cart"]', 'button[class*="add"]', '[class*="plus"] button', 'button[class*="plus"]'];
  for (const sel of attrSelectors) {
    const loc = page.locator(sel).first();
    try { if (await loc.isVisible({ timeout: 800 })) return { locator: loc, how: `selector:${sel}` }; } catch { /* next */ }
  }
  return null;
}

try {
  await visit('home', chain.home);
  await dismissPopups();
  await visit('search', chain.search('חלב'));
  await dismissPopups();

  report.phase = 'add';
  const btn = await findAddButton();
  if (!btn) {
    report.addClick = { found: false };
    // dump candidate buttons to help write selectors by hand
    report.buttonSample = await page.evaluate(() => [...document.querySelectorAll('button, [role=button], a')].slice(0, 400).map((b) => ({ tag: b.tagName, text: (b.innerText || b.getAttribute('aria-label') || b.title || '').trim().slice(0, 40), cls: (b.className || '').toString().slice(0, 80), id: b.id || null })).filter((b) => b.text || b.cls).slice(0, 120)).catch(() => []);
  } else {
    const before = report.requests.length;
    const outer = await btn.locator.evaluate((el) => el.outerHTML.slice(0, 500)).catch(() => null);
    const product = await btn.locator.evaluate((el) => { const card = el.closest('[class*="product"], [class*="item"], [class*="card"], li, article'); return card ? { html: card.outerHTML.slice(0, 1500), text: card.innerText.slice(0, 200) } : null; }).catch(() => null);
    try { await btn.locator.click({ timeout: 5000 }); } catch (err) { report.errors.push(`click: ${err.message}`); }
    await page.waitForTimeout(5000);
    report.addClick = { found: true, how: btn.how, outerHTML: outer, productCard: product, requestsAfter: report.requests.length - before };
    await page.screenshot({ path: path.join(outDir, `${chainId}-after-add.png`) }).catch(() => {});
  }

  report.cookies = (await context.cookies()).map((c) => ({ name: c.name, domain: c.domain, path: c.path, httpOnly: c.httpOnly, len: c.value.length }));
  report.metaTokens = await page.evaluate(() => [...document.querySelectorAll('meta')].filter((m) => /token|csrf|xsrf|api|key|store|branch/i.test(m.name + ' ' + (m.getAttribute('property') || ''))).map((m) => ({ name: m.name || m.getAttribute('property'), content: (m.content || '').slice(0, 80) }))).catch(() => []);
  report.storageKeys = await page.evaluate(() => ({ local: Object.keys(localStorage).slice(0, 60), session: Object.keys(sessionStorage).slice(0, 60) })).catch(() => ({}));
  report.globals = await page.evaluate(() => Object.keys(window).filter((k) => /csrf|token|cart|store|config|__NUXT__|__NEXT_DATA__|ACC|dataLayer/i.test(k)).slice(0, 40)).catch(() => []);
} finally {
  await browser.close();
}

report.finishedAt = new Date().toISOString();
writeFileSync(path.join(outDir, `${chainId}.json`), JSON.stringify(report, null, 2));

// ---- compact log report ----
const cartish = report.requests.filter((r) => r.method !== 'GET' || /cart|basket/i.test(r.url));
console.log(`\n===== ${chainId} =====`);
for (const p of report.pages) console.log(`page ${p.label}: ${p.status} "${p.title}" ${p.url} (${p.ms}ms) :: ${p.bodyStart}`);
console.log('botWall:', JSON.stringify(report.botWall));
console.log('addClick:', JSON.stringify({ ...report.addClick, productCard: report.addClick?.productCard ? { text: report.addClick.productCard.text } : null }));
console.log('cookies:', report.cookies.map((c) => c.name).join(', '));
console.log('metaTokens:', JSON.stringify(report.metaTokens));
console.log('storage:', JSON.stringify(report.storageKeys));
console.log('globals:', JSON.stringify(report.globals));
console.log(`\n--- cart-related / non-GET requests (${cartish.length}) ---`);
for (const r of cartish) {
  console.log(`\n[${r.phase}] ${r.method} ${r.url} -> ${r.status} ${r.contentType ?? ''}`);
  console.log('  headers:', JSON.stringify(r.headers));
  if (r.postData) console.log('  body:', r.postData.replace(/\s+/g, ' ').slice(0, 600));
  if (r.bodySnippet) console.log('  response:', r.bodySnippet.replace(/\s+/g, ' ').slice(0, 400));
}
const searchish = report.requests.filter((r) => r.method === 'GET' && /search|product|catalog|item/i.test(r.url) && /json/.test(r.contentType ?? ''));
console.log(`\n--- JSON search/product responses (${searchish.length}) ---`);
for (const r of searchish.slice(0, 8)) {
  console.log(`\n[${r.phase}] ${r.method} ${r.url} -> ${r.status}`);
  if (r.bodySnippet) console.log('  response:', r.bodySnippet.replace(/\s+/g, ' ').slice(0, 500));
}
if (report.buttonSample) console.log('\n--- button sample ---\n' + JSON.stringify(report.buttonSample.slice(0, 60)));
if (report.errors.length) console.log('\nerrors:', report.errors.join(' | '));
