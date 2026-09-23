import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignConcept, conceptById } from '../src/catalog/concepts.js';

/**
 * Data-quality guard (20.9 follow-up, docs/CONCEPTS.md §6/§7). The bug report: ~150 barcoded products
 * under ירקות ופירות were actually processed/non-food - juice, deodorant, crackers, canned goods,
 * frozen appetizers, yogurt/dairy-alternative desserts, candy, pickled relishes, seeds, dried herbs,
 * tea/wine, and seasoned/prepared salads - because a produce concept's `match` rules
 * (config/concepts/*.json) still matched the processed product's name (a majority-vote across every
 * chain's name variant, some of which never spell out the disambiguating word - see build-products.mjs
 * pickConcept). A wrong produce conceptId is worse than a wrong display category: it also drives
 * substitutes (docs/CONCEPTS.md §4) - a juice must never be offered as a substitute for a fresh orange.
 *
 * This test drives assignConcept() directly against a fixed list of real product names copied verbatim
 * from data/prices/<chain>/catalog.full.json at the time of the fix, rather than reading
 * data/products.json (which reflects whatever price data happened to be downloaded, and may be
 * mid-rebuild by another process) - so it stays meaningful however the catalog is refreshed.
 *
 * NOTE: this only exercises the concept layer (config/concepts/*.json). The category-display bug
 * (src/catalog/categorize.js still routing a processed product to ירקות ופירות even once its concept
 * is fixed) is a separate, related fix owned elsewhere - see the PROCESSED-guard proposal in the fix's
 * final report.
 */

// Real, verbatim chain names that must NEVER carry a produce (ירקות ופירות) conceptId.
const PROCESSED_NAMES = [
  // juice
  'פריגת תפוזים 1.5 ליטר',
  'משקה קל בטעם תפוזים פריגת 1.5 ליטר',
  'פריגת תפוזים 1.5 ליט', // the truncated chain-name variant that used to tip the majority vote
  // deodorant
  "דאב סטיק מלפפון ותה ירוק 50 גרם",
  "דאו' ספריי מלפפונים",
  'דאב ספריי מלפפונים לאישה*',
  // crackers
  'כיפלי בצל בד"ץ 70 גר',
  'חטיף כיפלי בטעם בצל 70גר',
  'גריזלי בצל 70 גרם רמי לוי',
  "פריכיות משולשות-תפו\"א וסלק אנרג'י 30 גרם",
  // canned / preserved fruit
  'עגבניות מקולפות 800ג',
  'עגבניות שלמ2*400ג LIVATO',
  'חתיכות אננס850ג ב.יהודה',
  'פרוסות אננס850ג ב.יהודה',
  // frozen
  'תחתיות ארטישוק מוקפאות',
  'סנפרוסט צמד ברוקולי כרובית 800 גרם',
  'פסטלים במילוי תפוחי אדמה שלושת האופים 1 ק"ג',
  // yogurt / dairy-alternative dessert
  'סויה BIO תות גביע 15',
  'מעדן סויה BIO עם תות',
  'מעדן סויה ביו עם תות אלטרנטיב 150 גרם',
  // candy
  'סוכ.לימון צמחים לל"ס 80ג',
  "ג'לי תות רמי לוי 85 גרם",
  // oil
  'שמן זרעי ענבים מזוכך750מ',
  // soup
  'מרק ירקות עשיר בעגבניות ובצל',
  // seeds
  'גרעיני דלעת אורגניים300ג',
  'גרעין אבטיח 240 גרם',
  // pickled / preserved relish sold under a brand name rather than the word "pickled" itself
  'פלפל שיפקה בית השיטה',
  'פלפל חריף שיפקה קבוצת יבנה 225 גרם.',
  'פלפל צ`ומה ביטון 250',
  // dried
  'מנגו מיובש ללת"ס 200 גרם',
  // tea / wine
  'תה קמומיל עם תפוזים',
  'יין לבן מוסקטו בטעם ענבים',
  // seasoned/prepared salad
  'מתבל עגבניות 550 גר ויקטורי',
  'ס.חציל תאילנדי250 המסעדה',
];

test('produceCategory: real processed/non-food product names never get a produce (ירקות ופירות) conceptId', () => {
  for (const name of PROCESSED_NAMES) {
    const conceptId = assignConcept(name);
    const concept = conceptId ? conceptById(conceptId) : null;
    assert.ok(
      !concept || concept.category !== 'ירקות ופירות',
      `"${name}" was assigned produce concept "${conceptId}" (category ${concept?.category})`,
    );
  }
});

// Real, verbatim genuinely-fresh barcoded produce names that must keep resolving to their produce
// concept - the fix must not overreach and cost the catalog a correct concept assignment (needed for
// substitutes to work at all - docs/CONCEPTS.md §4).
const FRESH_PRODUCE_NAMES = [
  ['אבוקדו טרי ארוז 4 יח', 'avocado'],
  ['בצל יבש ארוז', 'onion-yellow'], // "dry onion" - not "dried" - a regression guard (20.9 follow-up)
  ['מלפפון ארוז 6 יחידות', 'cucumber'],
  ['חסה אייסברג שטופה (ק)', 'lettuce'],
  ['עגבניות שרי כתום רמי לוי', 'tomato-cherry'],
  ['פטריות שמפיניון 400', 'mushroom-button'],
  ['תפוז טרי ארוז', 'orange-fresh'],
];

test('produceCategory: genuinely fresh barcoded produce still resolves to its produce concept', () => {
  for (const [name, expectedConceptId] of FRESH_PRODUCE_NAMES) {
    assert.equal(assignConcept(name), expectedConceptId, `"${name}" should resolve to ${expectedConceptId}`);
  }
});
