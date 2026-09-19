#!/usr/bin/env node
/**
 * Promotion coverage report: how much of each chain's PromoFull turns into pricing rules.
 *
 *   node scripts/promo-coverage.mjs [chain ...] [--json out.json] [--date YYYY-MM-DD]
 *
 * Reads data/prices/<chain>/PromoFull.xml (+ PriceFull.xml for the shelf-price join) written by prices:fetch.
 * Used by the daily refresh log and by hand when a chain's file changes shape.
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parsePriceFile, parsePromoFile, buildCatalogFromFiles } from '../src/catalog/priceXml.js';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };
const chains = args.filter((a) => !a.startsWith('--') && a !== opt('json') && a !== opt('date'));
const now = opt('date') ? new Date(`${opt('date')}T12:00:00+03:00`) : new Date();
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'prices');

export function coverageFor(chainId, { promoXml, priceXml, now = new Date() }) {
  const promo = parsePromoFile(promoXml, { chainId, now });
  const price = priceXml ? parsePriceFile(priceXml) : null;
  const catalog = price ? buildCatalogFromFiles({ chainId, price, promo }) : null;
  const s = promo.stats;
  const itemsWithPromo = catalog ? catalog.items.filter((i) => i.promotions.length).length : null;
  const clubItems = catalog ? catalog.items.filter((i) => i.promotions.some((p) => p.club)).length : null;
  const types = {};
  if (catalog) for (const i of catalog.items) for (const p of i.promotions) types[p.type] = (types[p.type] ?? 0) + 1;
  const considered = s.promotions - (s.skipped.coupon ?? 0) - (s.skipped.inactive ?? 0) - (s.skipped.expired ?? 0) - (s.skipped.future ?? 0) - (s.skipped['club-excluded'] ?? 0) - (s.skipped['min-purchase'] ?? 0);
  return {
    chainId, layout: promo.layout, promotions: s.promotions, considered, parsed: s.parsed, club: s.club,
    parsedPct: considered ? Math.round((100 * s.parsed) / considered) : null,
    skipped: s.skipped, unparsedByRewardType: s.unparsedByRewardType,
    items: catalog?.items.length ?? null, itemsWithPromo, clubItems, ruleTypes: types,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const targets = chains.length ? chains : readdirSync(root).filter((c) => existsSync(path.join(root, c, 'PromoFull.xml')));
  const report = [];
  console.log('chain          layout   promos consid parsed  pct  club | items  w/promo  club | skipped');
  for (const chainId of targets) {
    const dir = path.join(root, chainId);
    const promoXml = readFileSync(path.join(dir, 'PromoFull.xml'), 'utf8');
    const priceXml = existsSync(path.join(dir, 'PriceFull.xml')) ? readFileSync(path.join(dir, 'PriceFull.xml'), 'utf8') : null;
    const r = coverageFor(chainId, { promoXml, priceXml, now });
    report.push(r);
    const sk = Object.entries(r.skipped).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`${chainId.padEnd(14)} ${r.layout.padEnd(8)} ${String(r.promotions).padStart(6)} ${String(r.considered).padStart(6)} ${String(r.parsed).padStart(6)} ${String(r.parsedPct ?? '-').padStart(3)}% ${String(r.club).padStart(5)} | ${String(r.items ?? '-').padStart(5)} ${String(r.itemsWithPromo ?? '-').padStart(8)} ${String(r.clubItems ?? '-').padStart(5)} | ${sk}`);
    for (const [rt, u] of Object.entries(r.unparsedByRewardType)) console.log(`    unparsed RewardType ${rt}: ${u.n}  e.g. ${u.samples.map((x) => JSON.stringify(x.slice(0, 40))).join(' ')}`);
    if (Object.keys(r.ruleTypes).length) console.log(`    rules: ${Object.entries(r.ruleTypes).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(report, null, 2));
}
