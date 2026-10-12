/**
 * What can never be a brand: fillers ("," "-" "לא ידוע"), company suffixes (בע"מ, Ltd, Inc), the words of a
 * manufacturer or importer line (תעשיות, שיווק, יבוא, הפצה), long numbers and street addresses. Shared by the
 * brand import (scripts/brands-import.mjs), the size import, and the concept matcher's manufacturer strip
 * (src/catalog/concepts.js). Dependency-free on purpose: the backend vendors it beside concepts.js.
 */
export const NOT_A_BRAND = /^(,|-|לא ידוע|כללי|unknown|n\/a|none)$|בע"?מ|בעמ|\bltd\b|\binc\b|\bco\.|s\.a\.|תעשיות|שיווק|יבוא|הפצה|\d{4,}|רח'|רחוב/i;
