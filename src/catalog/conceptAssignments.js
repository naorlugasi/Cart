/**
 * Reviewed concept assignments - config/products/concept-assignments.json (products session, 3.10.2026).
 *
 * Concepts for products the concept rules leave unassigned, proposed by the embedding tool (tools/embeddings,
 * nearest reviewed neighbours above a holdout-measured threshold) and then reviewed: screened through the
 * catalogue checks (concept department, department guards, type words, the concept's own exclusions,
 * flavour-only words), required to share a word with the concept, and decided concept group by concept group.
 * They are deliberately NOT verified records: no person checked each one, so the product keeps
 * `verified: false`. The build applies one only where the rules found no concept and no verified record
 * decided the concept - a rule or a record always wins.
 *
 * { "version": 1, "assignments": { "g7290017217222": { "conceptId": "disposable-cups", "confidence": 1 } } }
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASSIGNMENTS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'products', 'concept-assignments.json');

let cache = null;
export function loadConceptAssignments(file = ASSIGNMENTS_FILE) {
  if (!existsSync(file)) return new Map();
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return new Map(Object.entries(raw.assignments ?? {}).filter(([, a]) => a && typeof a.conceptId === 'string').map(([id, a]) => [id, a.conceptId]));
}
export function conceptAssignment(id) { return (cache ??= loadConceptAssignments()).get(id) ?? null; }
export function resetConceptAssignments(map = null) { cache = map; }
