#!/usr/bin/env node
/**
 * Competitive/site analysis helper: renders a site in a real browser and prints what a
 * product analyst needs (copy, structure, CTAs, flows, tech stack), following a few internal
 * links. Used from CI because this project's dev sandbox cannot reach external sites.
 *
 *   node scripts/site-analysis.mjs https://example.com [--max-pages 8] [--out analysis/]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const startUrl = process.argv[2];
if (!startUrl) { console.error('usage: site-analysis.mjs <url>'); process.exit(2); }
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i === -1 ? fallback : process.argv[i + 1]; };
const maxPages = Number(arg('--max-pages', 8));
const outDir = arg('--out', 'analysis');
mkdirSync(outDir, { recursive: true });

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true, args: ['--lang=he-IL'] });
const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1366, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' });
const page = await context.newPage();
const origin = new URL(startUrl).origin;
const thirdParty = new Set();
page.on('request', (r) => { try { const h = new URL(r.url()).host; if (!r.url().startsWith(origin)) thirdParty.add(h); } catch { /* ignore */ } });

async function analyze(url, label) {
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => ({ status: () => `ERR ${e.message}` }));
  await page.waitForTimeout(1500);
  const data = await page.evaluate(() => {
    const txt = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
    const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.content ?? null;
    const headings = [...document.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName}: ${txt(h)}`).filter((s) => s.length > 4).slice(0, 80);
    const ctas = [...document.querySelectorAll('a,button')].map((b) => ({ t: txt(b).slice(0, 60), href: b.getAttribute('href') || null })).filter((b) => b.t).slice(0, 150);
    const links = [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href))].filter((h) => h.startsWith(location.origin)).slice(0, 200);
    const forms = [...document.querySelectorAll('form')].map((f) => ({ action: f.action, inputs: [...f.querySelectorAll('input,select,textarea')].map((i) => `${i.tagName.toLowerCase()}:${i.type || ''}:${i.name || i.placeholder || ''}`).slice(0, 15) })).slice(0, 10);
    const imgs = [...document.querySelectorAll('img')].map((i) => i.alt || '').filter(Boolean).slice(0, 40);
    const scripts = [...new Set([...document.querySelectorAll('script[src]')].map((s) => { try { return new URL(s.src).host + new URL(s.src).pathname.slice(0, 40); } catch { return s.src; } }))].slice(0, 40);
    const generators = { nextjs: !!document.getElementById('__NEXT_DATA__') || !!window.__NEXT_DATA__, nuxt: !!window.__NUXT__, react: !!document.querySelector('[data-reactroot], #root, #__next'), wix: /wix/i.test(document.documentElement.outerHTML.slice(0, 5000)), wordpress: /wp-content|wp-includes/.test(document.documentElement.outerHTML), webflow: /webflow/i.test(document.documentElement.outerHTML.slice(0, 5000)), framer: /framer/i.test(document.documentElement.outerHTML.slice(0, 5000)), shopify: /shopify/i.test(document.documentElement.outerHTML.slice(0, 5000)) };
    const jsonld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent.slice(0, 600));
    const bodyText = txt(document.body).slice(0, 12000);
    return { title: document.title, description: meta('description'), ogTitle: meta('og:title'), ogDesc: meta('og:description'), lang: document.documentElement.lang, dir: document.documentElement.dir, headings, ctas, links, forms, imgs, scripts, generators, jsonld, bodyText };
  });
  const shot = path.join(outDir, `${label}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  const status = typeof res?.status === 'function' ? res.status() : res;
  writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify({ url, finalUrl: page.url(), status, ...data }, null, 2));
  console.log(`\n::group::${label} ${page.url()} (${status})`);
  console.log('title:', data.title, '| lang:', data.lang, data.dir);
  console.log('description:', data.description ?? data.ogDesc);
  console.log('generators:', JSON.stringify(data.generators));
  console.log('headings:\n  ' + data.headings.join('\n  '));
  console.log('CTAs/links:\n  ' + data.ctas.map((c) => `${c.t}${c.href ? ' -> ' + c.href : ''}`).join('\n  '));
  console.log('forms:', JSON.stringify(data.forms));
  console.log('img alts:', data.imgs.join(' | '));
  console.log('scripts:', data.scripts.join(', '));
  if (data.jsonld.length) console.log('jsonld:', data.jsonld.join('\n'));
  console.log('TEXT:\n' + data.bodyText);
  console.log('::endgroup::');
  return data;
}

// Optional scripted flow for single-page apps: --steps "click=text;fill=selector|value;press=Enter;wait=ms;dump=label;goto=url"
const stepsArg = arg('--steps', '');
const popups = [];
context.on('page', (p) => { popups.push(p); p.on('load', () => console.log('POPUP:', p.url().slice(0, 600))); });

async function runSteps(spec) {
  const steps = spec.split(';').map((s) => s.trim()).filter(Boolean);
  let n = 0;
  for (const step of steps) {
    const eq = step.indexOf('=');
    const op = step.slice(0, eq); const val = step.slice(eq + 1);
    try {
      if (op === 'click') { await page.locator(`text=${val}`).first().click({ timeout: 8000 }); }
      else if (op === 'clicksel') { await page.locator(val).first().click({ timeout: 8000 }); }
      else if (op === 'fill') { const [sel, v] = val.split('|'); await page.locator(sel).first().fill(v, { timeout: 8000 }); }
      else if (op === 'type') { await page.keyboard.type(val, { delay: 40 }); }
      else if (op === 'press') { await page.keyboard.press(val); }
      else if (op === 'wait') { await page.waitForTimeout(Number(val)); }
      else if (op === 'goto') { await page.goto(val, { waitUntil: 'networkidle', timeout: 60000 }); }
      else if (op === 'dump') { await dumpCurrent(`step-${++n}-${val}`); }
      console.log(`step ok: ${step}`);
    } catch (err) { console.log(`step FAILED: ${step} -> ${err.message.split('\n')[0]}`); }
  }
  for (const p of popups) console.log('popup url:', p.url().slice(0, 800));
}

async function dumpCurrent(label) {
  const data = await page.evaluate(() => {
    const txt = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      url: location.href,
      headings: [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => `${h.tagName}: ${txt(h)}`).filter((s) => s.length > 4).slice(0, 60),
      buttons: [...document.querySelectorAll('button,a,[role=button]')].map((b) => txt(b).slice(0, 50)).filter(Boolean).slice(0, 120),
      inputs: [...document.querySelectorAll('input,select,textarea')].map((i) => `${i.tagName.toLowerCase()}:${i.type || ''}:${i.placeholder || i.name || i.id || ''}`).slice(0, 30),
      text: txt(document.body).slice(0, 9000),
    };
  });
  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true }).catch(() => {});
  console.log(`\n::group::${label} ${data.url}`);
  console.log('headings:\n  ' + data.headings.join('\n  '));
  console.log('buttons:', data.buttons.join(' | '));
  console.log('inputs:', data.inputs.join(' | '));
  console.log('TEXT:\n' + data.text);
  console.log('::endgroup::');
}

// Optional bundle inspection: --js <url>[,<url>]
for (const jsUrl of (arg('--js', '') || '').split(',').filter(Boolean)) {
  try {
    const res = await context.request.get(jsUrl);
    const src = await res.text();
    const urls = [...new Set((src.match(/https?:\/\/[^"'`\s)]+/g) || []))].slice(0, 80);
    const routes = [...new Set((src.match(/#\/[a-zA-Z0-9_\-\/]+/g) || []))].slice(0, 60);
    const keywords = ['bookmarklet', 'extension', 'chrome', 'postMessage', 'localStorage', 'firebase', 'firestore', 'openfoodfacts', 'gtin', 'barcode', 'ItemCode', 'PriceFull', 'Promo', 'delivery', 'cart', 'checkout', 'deep', 'window.open', 'clipboard', 'receipt', 'ocr', 'recipe', 'gemini', 'openai', 'anthropic', 'stripe', 'paypal', 'affiliate', 'analytics', 'shufersal', 'rami-levy', 'carrefour', 'yochananof', 'osherad', 'victory', 'bitan'];
    const counts = Object.fromEntries(keywords.map((k) => [k, (src.match(new RegExp(k, 'gi')) || []).length]).filter(([, c]) => c));
    const hebrew = [...new Set((src.match(/["'`]([^"'`\n]{12,140}[\u05D0-\u05EA][^"'`\n]*)["'`]/g) || []).map((m) => m.slice(1, -1)))].slice(0, 120);
    console.log(`\n::group::bundle ${jsUrl} (${res.status()}, ${src.length} bytes)`);
    console.log('routes:', routes.join(' '));
    console.log('urls:\n  ' + urls.join('\n  '));
    console.log('keyword counts:', JSON.stringify(counts));
    console.log('hebrew strings:\n  ' + hebrew.join('\n  '));
    console.log('::endgroup::');
  } catch (err) { console.log('bundle fetch failed', jsUrl, err.message); }
}

const home = await analyze(startUrl, 'home');
if (stepsArg) await runSteps(stepsArg);
const seen = new Set([startUrl, page.url()]);
const queue = home.links.filter((l) => !seen.has(l) && !/\.(pdf|jpg|png|zip)$/i.test(l) && !/#/.test(l));
let n = 1;
for (const link of queue) {
  if (n >= maxPages) break;
  if (seen.has(link)) continue;
  seen.add(link);
  await analyze(link, `page-${n}`);
  n++;
}
console.log('\nthird-party hosts:', [...thirdParty].sort().join(', '));
await browser.close();
