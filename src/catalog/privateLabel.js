/**
 * Private-label detection: is this catalog item the chain's own brand?
 *
 * Signals (config/private-label.json, per chain):
 *   prefixes  the barcode starts with one of the chain's GS1 company prefixes (Shufersal 7296073, Carrefour 3560070/1)
 *   names     a whole-word match of the chain's brand name in the item name or manufacturer ("שוקו 400 גר רמי לוי")
 *   exclude   phrases that void a name match ("מארז חסכון" is a value pack, not Rami Levy's "חסכון" brand)
 *
 * Why not the manufacturer field: it is empty or "לא ידוע" for most items in most chains (§1.3 of the plan).
 * Products sold by several chains cannot be one chain's private label, so callers may also check exclusivity.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'private-label.json');

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole-word match that understands Hebrew: no letter or digit directly before or after. */
const wordRe = (word) => new RegExp(`(?<![\\p{L}\\d])${escape(word)}(?![\\p{L}\\d])`, 'iu');

export function loadPrivateLabelConfig(file = DEFAULT_CONFIG) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const out = {};
  for (const [chainId, c] of Object.entries(raw)) {
    if (chainId.startsWith('_')) continue;
    out[chainId] = {
      prefixes: c.prefixes ?? [],
      names: (c.names ?? []).map(wordRe),
      exclude: (c.exclude ?? []).map(wordRe),
    };
  }
  return out;
}

let cached = null;
const config = () => (cached ??= loadPrivateLabelConfig());

/**
 * Which signal marks `item` as `chainId`'s private label: 'prefix' | 'name' | null.
 * item = { gtin|code, name, brand|manufacturer }
 */
export function privateLabelSignal(item, chainId, cfg = config()) {
  const c = cfg[chainId];
  if (!c) return null;
  const code = String(item.gtin ?? item.code ?? '');
  if (c.prefixes.some((p) => code.startsWith(p))) return 'prefix';
  const text = `${item.name ?? ''} ${item.brand ?? item.manufacturer ?? ''}`;
  if (c.names.some((re) => re.test(text)) && !c.exclude.some((re) => re.test(text))) return 'name';
  return null;
}

export function isPrivateLabel(item, chainId, cfg) {
  return privateLabelSignal(item, chainId, cfg) != null;
}
