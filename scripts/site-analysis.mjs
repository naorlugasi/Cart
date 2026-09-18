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

const home = await analyze(startUrl, 'home');
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
