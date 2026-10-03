#!/usr/bin/env node
/**
 * Build a local, queryable DuckDB index of the catalog (docs/INDEX.md).
 *
 * WHY: every session that works on this data writes its own ad-hoc script per question, with
 * inconsistent definitions. This index gives one build and one agreed definition per recurring
 * question (the views at the bottom of this file), queried through scripts/index-query.mjs.
 *
 * This is a LOCAL TOOL ONLY: it is never part of the daily pipeline (pipeline/*.mjs, data/pipeline/*)
 * and its output (data/local/catalog.duckdb) is never committed - data/local/ is gitignored.
 *
 *   node scripts/index-build.mjs
 *
 * Reads:
 *   - data/products.json + data/prices/<chain>/catalog.full.json, from DATA_ROOT (env), default
 *     /Users/naorlugassi/Projects/Cart/data - the real machine's data directory. This worktree's own
 *     data/ does not carry data/prices/ (gitignored, not shared across worktrees), which is why the
 *     task hands every session this env var instead of a relative path.
 *   - config/concepts, config/categories, config/products, from this checkout (same as every other
 *     script under src/catalog/) - overridable with CONFIG_ROOT for the fixture-backed test.
 *
 * Writes data/local/catalog.duckdb (OUT env var / --out to override, e.g. for the test).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConcepts, matchingConcepts } from '../src/catalog/concepts.js';
import { parseSize } from '../src/catalog/size.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}

export const DATA_ROOT = arg('data-root') || process.env.DATA_ROOT || '/Users/naorlugassi/Projects/Cart/data';
export const OUT = arg('out') || process.env.INDEX_DB || path.join(ROOT, 'data', 'local', 'catalog.duckdb');
const DUCKDB_BIN = process.env.DUCKDB_BIN || '/opt/homebrew/bin/duckdb';

/**
 * The 7 chains the site actually serves (docs/INDEX.md, task brief): every other chain in
 * data/prices/ is tracked for price comparison but not offered as a checkout destination. This is
 * the one place that list lives - every view below reads it through the `chains.served` column
 * instead of repeating the set.
 */
export const SERVED_CHAINS = new Set(['shufersal', 'ramilevy', 'carrefour', 'yochananof', 'hazihinam', 'victory', 'osherad']);

function duck(sql, { json = false } = {}) {
  const args = [OUT];
  if (json) args.unshift('-json');
  return execFileSync(DUCKDB_BIN, args, { input: sql, encoding: 'utf8', maxBuffer: 1 << 29 });
}

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

function loadProductsFile() {
  const raw = JSON.parse(readFileSync(path.join(DATA_ROOT, 'products.json'), 'utf8'));
  return Array.isArray(raw) ? raw : raw.products ?? [];
}

function chainDirs() {
  const dir = path.join(DATA_ROOT, 'prices');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((c) => existsSync(path.join(dir, c, 'catalog.full.json'))).sort();
}

function loadChainItems(chain) {
  const file = path.join(DATA_ROOT, 'prices', chain, 'catalog.full.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return raw.items ?? [];
}

function loadChainsRegistry() {
  if (!existsSync(path.join(DATA_ROOT, 'chains.json'))) return new Map();
  const raw = JSON.parse(readFileSync(path.join(DATA_ROOT, 'chains.json'), 'utf8'));
  const arr = Array.isArray(raw) ? raw : raw.chains ?? [];
  return new Map(arr.map((c) => [c.id, c]));
}

const SCHEMA = `
drop table if exists products;
drop table if exists chain_items;
drop table if exists name_concepts;
drop table if exists concepts;
drop table if exists chains;
drop table if exists labels;
drop table if exists verified;

create table products (
  id varchar primary key, gtin varchar, name varchar, category varchar, brand varchar,
  concept_id varchar, concept_family varchar, size_value double, size_unit varchar, size_count integer,
  is_weighted boolean, base_price double, chains integer, verified boolean, kind varchar
);
create index products_gtin on products (gtin);
create index products_concept on products (concept_id);

create table chain_items (
  chain varchar, gtin varchar, name varchar, price double, is_weighted boolean, updated_at varchar, promo_count integer
);
create index chain_items_gtin on chain_items (gtin);
create index chain_items_chain on chain_items (chain);

create table name_concepts (
  chain varchar, gtin varchar, name varchar, assigned_concept varchar, matching_concepts varchar,
  parsed_size_value double, parsed_size_unit varchar, parsed_size_count integer
);
create index name_concepts_gtin on name_concepts (gtin);

create table concepts (
  id varchar primary key, name varchar, category varchar, size_unit varchar, default_size double,
  family_id varchar, synonyms varchar
);

create table chains (
  id varchar primary key, name varchar, in_store_only boolean, pickup_only boolean, served boolean
);

create table labels (id varchar primary key, category varchar, name varchar);
create table verified (id varchar primary key, fields varchar);
`;

/**
 * Views - one agreed definition per recurring question. Each comment IS the definition; a consumer
 * who wants to know "what does coverage mean here" reads this file, not a session's memory of it.
 */
const VIEWS = `
-- v_coverage: "has a price" means a gtin appears (any row) in chain_items for that chain. Three
-- sections in one view, told apart by \`scope\`:
--   scope='overall' (one row): every product with a gtin (products.gtin is not null) against whether
--     ANY served chain prices it (with_price_served) and whether ANY chain at all prices it
--     (with_price_any). This is the one number to quote for "coverage" - never the catalog-wide
--     comparable-concept ratio, which is a different, much lower number (docs/INDEX.md, comparability).
--   scope='chain' (one row per chain in the chains table): how many distinct gtins that chain itself
--     prices, out of every product with a gtin. with_price_served/without_price_served are null here -
--     "served" is a property of the overall/department rollups, not of a single chain row.
--   scope='department' (one row per category): per department, how many of its gtin'd products have
--     no price in any served chain, and how many have no price in any chain at all.
create view v_coverage as
with gtin_products as (select * from products where gtin is not null),
served_hits as (
  select distinct gp.id from gtin_products gp
  join chain_items ci on ci.gtin = gp.gtin
  join chains ch on ch.id = ci.chain and ch.served
),
any_hits as (
  select distinct gp.id from gtin_products gp
  join chain_items ci on ci.gtin = gp.gtin
)
select 'overall' as scope, cast(null as varchar) as key,
  (select count(*) from gtin_products) as total_products,
  (select count(*) from served_hits) as with_price_served,
  (select count(*) from any_hits) as with_price_any,
  (select count(*) from gtin_products) - (select count(*) from served_hits) as without_price_served,
  (select count(*) from gtin_products) - (select count(*) from any_hits) as without_price_any
union all
select 'chain' as scope, ch.id as key,
  null, null,
  count(distinct ci.gtin) filter (where ci.gtin in (select gtin from gtin_products)),
  null, null
from chains ch left join chain_items ci on ci.chain = ch.id
group by ch.id
union all
select 'department' as scope, gp.category as key,
  count(*) as total_products,
  count(*) filter (where gp.id in (select id from served_hits)) as with_price_served,
  count(*) filter (where gp.id in (select id from any_hits)) as with_price_any,
  count(*) filter (where gp.id not in (select id from served_hits)) as without_price_served,
  count(*) filter (where gp.id not in (select id from any_hits)) as without_price_any
from gtin_products gp
group by gp.category;

-- v_no_concept: one row per (product with no concept_id) x (one of its raw chain names), so a "tie"
-- (matching_concepts lists 2+ ids - the name matched more than one concept and assignConcept()
-- deliberately refused to pick) reads differently from "no match" (matching_concepts is empty). A
-- product can show both across its different chains' names. A third case, 'resolved-no-consensus',
-- is this one name alone matching exactly one concept while the product still has no concept_id - the
-- build votes across ALL of a barcode's names (docs/CONCEPTS.md §3) and only assigns when they agree,
-- so a single chain resolving cleanly does not by itself carry the product.
create view v_no_concept as
select p.id, p.gtin, p.name as product_name, p.category, nc.chain, nc.name as raw_name,
  nc.assigned_concept, nc.matching_concepts,
  case when nc.matching_concepts is null or nc.matching_concepts = '' then 'no-match'
       when instr(nc.matching_concepts, ',') > 0 then 'tie'
       else 'resolved-no-consensus' end as reason
from products p
join name_concepts nc on nc.gtin = p.gtin
where p.concept_id is null and p.gtin is not null;

-- v_unsized_in_sized_concept: the product's own concept declares a size_unit (every unit of the
-- concept is expected to carry a size), but the product's own size is null. Split weighed / not via
-- is_weighted - a weighted product (sold by the kg, no package size) is expected to have no size,
-- so this view is only a real gap when is_weighted = false.
create view v_unsized_in_sized_concept as
select p.id, p.gtin, p.name, p.category, p.concept_id, c.name as concept_name,
  c.size_unit as concept_size_unit, p.is_weighted
from products p
join concepts c on c.id = p.concept_id
where c.size_unit is not null and p.size_value is null;

-- v_concept_sizes: per concept, how many of its products carry a size at all, the median listed
-- price, and how many distinct chains sell any product of the concept (joined through chain_items by
-- gtin, not the products.chains column - that column counts chains for ONE product, not the concept).
create view v_concept_sizes as
select c.id, c.name, c.category,
  count(p.id) as product_count,
  count(p.size_value) as sized_count,
  median(p.base_price) as median_base_price,
  (select count(distinct ci.chain) from chain_items ci
     join products p2 on p2.gtin = ci.gtin where p2.concept_id = c.id) as chains
from concepts c
left join products p on p.concept_id = c.id
group by c.id, c.name, c.category;

-- v_barcode_sellers: every gtin that appears in at least one chain's price file, with the list of
-- chains that carry it, split into served and unserved (chains.served) so "who sells this" and "who
-- would ring it up at checkout" are two different, explicit columns.
create view v_barcode_sellers as
select ci.gtin,
  string_agg(distinct case when ch.served then ci.chain end, ',') as served_chains,
  string_agg(distinct case when not ch.served then ci.chain end, ',') as unserved_chains,
  count(distinct ci.chain) filter (where ch.served) as served_count,
  count(distinct ci.chain) filter (where not ch.served) as unserved_count
from chain_items ci
join chains ch on ch.id = ci.chain
group by ci.gtin;
`;

function buildNameConcepts(chains, conceptList) {
  const rows = [];
  for (const chain of chains) {
    for (const item of loadChainItems(chain)) {
      if (!item.gtin || !item.name) continue;
      const hits = matchingConcepts(item.name, conceptList);
      const assigned = hits.length === 1 ? hits[0].id : null;
      const size = parseSize(item.name);
      rows.push({
        chain, gtin: item.gtin, name: item.name,
        assigned_concept: assigned,
        matching_concepts: hits.map((c) => c.id).join(','),
        parsed_size_value: size?.value ?? null,
        parsed_size_unit: size?.unit ?? null,
        parsed_size_count: size?.count ?? null,
      });
    }
  }
  return rows;
}

function buildChainItems(chains) {
  const rows = [];
  for (const chain of chains) {
    for (const item of loadChainItems(chain)) {
      if (!item.gtin) continue;
      rows.push({
        chain, gtin: item.gtin, name: item.name ?? null, price: item.price ?? null,
        is_weighted: !!item.isWeighted, updated_at: item.updatedAt ?? null,
        promo_count: Array.isArray(item.promotions) ? item.promotions.length : 0,
      });
    }
  }
  return rows;
}

export async function build({ log = console.log } = {}) {
  const t0 = Date.now();
  mkdirSync(path.dirname(OUT), { recursive: true });
  rmSync(OUT, { force: true });
  rmSync(`${OUT}.wal`, { force: true });
  const tmp = path.join(path.dirname(OUT), 'tmp-build');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  try {
    duck(SCHEMA);

    // products
    const products = loadProductsFile();
    const productRows = products.map((p) => ({
      id: p.id, gtin: p.gtin ?? null, name: p.name ?? null, category: p.category ?? null,
      brand: p.brand ?? null, concept_id: p.conceptId ?? null, concept_family: p.conceptFamily?.id ?? null,
      size_value: p.size?.value ?? null, size_unit: p.size?.unit ?? null, size_count: p.size?.count ?? null,
      is_weighted: !!p.isWeighted, base_price: p.basePrice ?? null, chains: p.chains ?? null,
      verified: !!p.verified, kind: p.kind ?? null,
    }));
    writeFileSync(path.join(tmp, 'products.ndjson'), jsonl(productRows));
    duck(`insert into products select id, gtin, name, category, brand, concept_id, concept_family,
        size_value, size_unit, size_count, is_weighted, base_price, chains, verified, kind
      from read_json_auto('${path.join(tmp, 'products.ndjson')}', format='newline_delimited');`);
    log(`products: ${productRows.length} rows`);

    // chains (14 price dirs, the expensive tables below iterate), joined with the registry for
    // display name / inStoreOnly / pickupOnly
    const chains = chainDirs();
    const registry = loadChainsRegistry();
    const chainRows = chains.map((id) => {
      const reg = registry.get(id);
      return { id, name: reg?.name ?? id, in_store_only: !!reg?.inStoreOnly, pickup_only: !!reg?.pickupOnly, served: SERVED_CHAINS.has(id) };
    });
    writeFileSync(path.join(tmp, 'chains.ndjson'), jsonl(chainRows));
    duck(`insert into chains select id, name, in_store_only, pickup_only, served
      from read_json_auto('${path.join(tmp, 'chains.ndjson')}', format='newline_delimited');`);
    log(`chains: ${chainRows.length} (${[...SERVED_CHAINS].join(', ')} served)`);

    // chain_items - every raw row of every chain
    const chainItemRows = buildChainItems(chains);
    writeFileSync(path.join(tmp, 'chain_items.ndjson'), jsonl(chainItemRows));
    duck(`insert into chain_items select chain, gtin, name, price, is_weighted, updated_at, promo_count
      from read_json_auto('${path.join(tmp, 'chain_items.ndjson')}', format='newline_delimited');`);
    log(`chain_items: ${chainItemRows.length} rows across ${chains.length} chains`);

    // name_concepts - the expensive part: resolve every raw name on its own, once
    const conceptList = loadConcepts();
    const ncT0 = Date.now();
    const nameConceptRows = buildNameConcepts(chains, conceptList);
    const ncMs = Date.now() - ncT0;
    writeFileSync(path.join(tmp, 'name_concepts.ndjson'), jsonl(nameConceptRows));
    duck(`insert into name_concepts select chain, gtin, name, assigned_concept, matching_concepts,
        parsed_size_value, parsed_size_unit, parsed_size_count
      from read_json_auto('${path.join(tmp, 'name_concepts.ndjson')}', format='newline_delimited');`);
    log(`name_concepts: ${nameConceptRows.length} names resolved against ${conceptList.length} concepts in ${ncMs}ms`);

    // concepts
    const conceptRows = conceptList.map((c) => ({
      id: c.id, name: c.name, category: c.category, size_unit: c.sizeUnit ?? null,
      default_size: c.defaultSize ?? null, family_id: c.family?.id ?? null, synonyms: (c.synonyms ?? []).join(','),
    }));
    writeFileSync(path.join(tmp, 'concepts.ndjson'), jsonl(conceptRows));
    duck(`insert into concepts select id, name, category, size_unit, default_size, family_id, synonyms
      from read_json_auto('${path.join(tmp, 'concepts.ndjson')}', format='newline_delimited');`);
    log(`concepts: ${conceptRows.length}`);

    // labels (config/categories/labels.json)
    const labelsFile = path.join(ROOT, 'config', 'categories', 'labels.json');
    if (existsSync(labelsFile)) {
      const raw = JSON.parse(readFileSync(labelsFile, 'utf8'));
      const labelRows = Object.entries(raw.labels ?? {}).map(([id, entry]) => {
        const [category, name] = Array.isArray(entry) ? entry : [entry, null];
        return { id, category, name: name ?? null };
      });
      writeFileSync(path.join(tmp, 'labels.ndjson'), jsonl(labelRows));
      duck(`insert into labels select id, category, name from read_json_auto('${path.join(tmp, 'labels.ndjson')}', format='newline_delimited');`);
      log(`labels: ${labelRows.length}`);
    }

    // verified (config/products/verified.json)
    const verifiedFile = path.join(ROOT, 'config', 'products', 'verified.json');
    if (existsSync(verifiedFile)) {
      const raw = JSON.parse(readFileSync(verifiedFile, 'utf8'));
      const verifiedRows = Object.entries(raw.records ?? {}).map(([id, rec]) => ({ id, fields: JSON.stringify(rec) }));
      writeFileSync(path.join(tmp, 'verified.ndjson'), jsonl(verifiedRows));
      duck(`insert into verified select id, fields from read_json_auto('${path.join(tmp, 'verified.ndjson')}', format='newline_delimited');`);
      log(`verified: ${verifiedRows.length}`);
    }

    duck(VIEWS);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const ms = Date.now() - t0;
  log(`build done in ${ms}ms -> ${OUT}`);
  return { ms };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  build().catch((err) => { console.error(err); process.exit(1); });
}
