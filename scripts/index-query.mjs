#!/usr/bin/env node
/**
 * Named queries against data/local/catalog.duckdb (docs/INDEX.md). Build it first with
 * scripts/index-build.mjs. Output is an aligned text table, one row per line - meant to be read in a
 * terminal, not parsed (use `sql` with `-json`-style needs via DuckDB directly if you need JSON).
 *
 *   node scripts/index-query.mjs why <gtin>
 *   node scripts/index-query.mjs coverage
 *   node scripts/index-query.mjs no-concept [--dept <category>]
 *   node scripts/index-query.mjs unsized [--concept <id>]
 *   node scripts/index-query.mjs sellers <gtin>
 *   node scripts/index-query.mjs concept <id>
 *   node scripts/index-query.mjs sql "<query>"
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.INDEX_DB || path.join(ROOT, 'data', 'local', 'catalog.duckdb');
const DUCKDB_BIN = process.env.DUCKDB_BIN || '/opt/homebrew/bin/duckdb';

function query(sql) {
  const out = execFileSync(DUCKDB_BIN, ['-json', DB], { input: sql, encoding: 'utf8', maxBuffer: 1 << 29 });
  return out.trim() ? JSON.parse(out) : [];
}

/** Aligned text table, DuckDB-CLI style: one header row, a divider, then one row per record. */
function printTable(rows) {
  if (!rows.length) { console.log('(no rows)'); return; }
  const cols = Object.keys(rows[0]);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (vals) => vals.map((v, i) => String(v ?? '').padEnd(widths[i])).join('  ');
  console.log(line(cols));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(cols.map((c) => r[c])));
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
}

function requireDb() {
  if (!existsSync(DB)) {
    console.error(`${DB} does not exist - run: node scripts/index-build.mjs`);
    process.exit(1);
  }
}

function cmdWhy(gtin) {
  if (!gtin) throw new Error('usage: index-query.mjs why <gtin>');
  const [product] = query(`select p.id, p.name, p.category, p.brand, p.concept_id, p.concept_family,
      p.size_value, p.size_unit, p.size_count, p.is_weighted, p.base_price, p.verified, p.kind
    from products p where p.gtin = '${gtin}';`);
  const [label] = query(`select category, name from labels where id = '${product?.id ?? ''}';`);
  const [verifiedRow] = query(`select fields from verified where id = '${product?.id ?? ''}';`);
  const names = query(`select chain, name, assigned_concept, matching_concepts,
      parsed_size_value, parsed_size_unit, parsed_size_count
    from name_concepts where gtin = '${gtin}' order by chain;`);

  if (!product) {
    console.log(`No product in the index with gtin ${gtin}.`);
  } else {
    console.log(`Product: ${product.id}  ${product.name}`);
    console.log(`  category: ${product.category}${label ? `  (reviewed label: ${label.category}${label.name ? ` / "${label.name}"` : ''})` : '  (no reviewed label - rule/concept derived)'}`);
    console.log(`  concept: ${product.concept_id ?? '(none)'}${product.concept_family ? `  family: ${product.concept_family}` : ''}`);
    console.log(`  size: ${product.size_value != null ? `${product.size_value} ${product.size_unit} x ${product.size_count}` : '(none)'}`);
    console.log(`  base price: ${product.base_price ?? '(none)'}  weighted: ${product.is_weighted}  verified: ${product.verified}${product.kind ? `  kind: ${product.kind}` : ''}`);
    if (verifiedRow) console.log(`  verified record: ${verifiedRow.fields}`);
  }
  console.log();
  console.log(`Chain names (${names.length}):`);
  printTable(names.map((n) => ({
    chain: n.chain, name: n.name, assigned: n.assigned_concept ?? '-', matching: n.matching_concepts || '-',
    parsed_size: n.parsed_size_value != null ? `${n.parsed_size_value} ${n.parsed_size_unit} x ${n.parsed_size_count}` : '-',
  })));
}

function cmdCoverage() {
  console.log('Overall:');
  printTable(query(`select total_products, with_price_served, with_price_any, without_price_served, without_price_any from v_coverage where scope = 'overall';`));
  console.log('\nBy chain (distinct gtins priced there):');
  printTable(query(`select key as chain, with_price_any as products_priced from v_coverage where scope = 'chain' order by products_priced desc;`));
  console.log('\nBy department (products with a gtin, with/without a price):');
  printTable(query(`select key as department, total_products, without_price_served, without_price_any from v_coverage where scope = 'department' order by total_products desc;`));
}

function cmdNoConcept(args) {
  const dept = flag(args, 'dept');
  const where = dept ? `where category = '${dept.replace(/'/g, "''")}'` : '';
  console.log(`Products with no concept_id, by department:`);
  printTable(query(`select category, count(distinct id) as products, count(*) filter (where reason = 'tie') as tie_names,
      count(*) filter (where reason = 'no-match') as no_match_names,
      count(*) filter (where reason = 'resolved-no-consensus') as resolved_no_consensus_names
    from v_no_concept ${where} group by category order by products desc;`));
  if (dept) {
    console.log(`\nDetail for ${dept}:`);
    printTable(query(`select id, product_name, chain, raw_name, reason, matching_concepts
      from v_no_concept where category = '${dept.replace(/'/g, "''")}' order by id, chain;`));
  }
}

function cmdUnsized(args) {
  const concept = flag(args, 'concept');
  const where = concept ? `where concept_id = '${concept.replace(/'/g, "''")}'` : '';
  console.log('Unsized products in a concept that declares a size, by concept (split weighed / not):');
  printTable(query(`select concept_id, concept_name, concept_size_unit,
      count(*) filter (where is_weighted) as weighted, count(*) filter (where not is_weighted) as not_weighted
    from v_unsized_in_sized_concept ${where} group by concept_id, concept_name, concept_size_unit
    order by not_weighted desc;`));
  if (concept) {
    console.log(`\nDetail for ${concept}:`);
    printTable(query(`select id, gtin, name, is_weighted from v_unsized_in_sized_concept where concept_id = '${concept.replace(/'/g, "''")}';`));
  }
}

function cmdSellers(gtin) {
  if (!gtin) throw new Error('usage: index-query.mjs sellers <gtin>');
  printTable(query(`select gtin, served_chains, unserved_chains, served_count, unserved_count from v_barcode_sellers where gtin = '${gtin}';`));
}

function cmdConcept(id) {
  if (!id) throw new Error('usage: index-query.mjs concept <id>');
  printTable(query(`select * from v_concept_sizes where id = '${id}';`));
  console.log('\nProducts:');
  printTable(query(`select id, gtin, name, size_value, size_unit, size_count, base_price, is_weighted, verified
    from products where concept_id = '${id}' order by base_price;`));
}

function cmdSql(raw) {
  if (!raw) throw new Error('usage: index-query.mjs sql "<query>"');
  printTable(query(raw));
}

const [, , cmd, ...rest] = process.argv;
requireDb();
switch (cmd) {
  case 'why': cmdWhy(rest[0]); break;
  case 'coverage': cmdCoverage(); break;
  case 'no-concept': cmdNoConcept(rest); break;
  case 'unsized': cmdUnsized(rest); break;
  case 'sellers': cmdSellers(rest[0]); break;
  case 'concept': cmdConcept(rest[0]); break;
  case 'sql': cmdSql(rest.join(' ')); break;
  default:
    console.error('usage: index-query.mjs <why|coverage|no-concept|unsized|sellers|concept|sql> ...');
    process.exit(1);
}
