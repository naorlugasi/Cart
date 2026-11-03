// 3.11 pasta-other shelf: lasagna, cannelloni, fresh pasta and the shape leaves (ribbon, pappardelle, linguine, farfalle, fusilli,
// shells, tubes, elbows, kids shapes); instant-pasta rejected; the konjac/legume/spelt/oat/buckwheat kinds on every pasta leaf.
// Opus review: scratchpad shelf-pasta/REVIEW.md. Behaviour on real chain names, not restated config.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConcepts, assignConcept, conceptById, resolveFamily } from '../src/catalog/concepts.js';
import { RULES_FILE, variantSignature, compatible, rules } from '../src/pricing/substituteRules.js';

const list = loadConcepts();

const CASES = [
  { "name": "ברילה לזניה 500 גרם", "expected": "lasagna" },
  { "name": "דפי לזניה גרנד ארמנדו 500 גרם", "expected": "lasagna" },
  { "name": "לזניה בשר ארוז", "expected": null },
  { "name": "רוטב לזניה 240 גרם", "expected": null },
  { "name": "קנלוני ברילה 250 גרם", "expected": "cannelloni" },
  { "name": "פסטה פרפקטו קונצ'יליוני 400 גרם אסם", "expected": "cannelloni" },
  { "name": "ברילה פסטה טליאטלה פלייה ופיינ", "expected": "pasta-ribbon" },
  { "name": "פסטה פפרדלה ביצים 250 גר Agnesi", "expected": "pasta-pappardelle" },
  { "name": "פרפקטו פסטה פטוציני 500 גרם", "expected": "pasta-ribbon" },
  { "name": "פטוצ'יני פסטה טרייה מצוננת שטראוס 400ג'", "expected": "fresh-pasta" },
  { "name": "איטריות ביצים פפרדלה 400 גר", "expected": "noodles" },
  { "name": "פסטה לינגוויני 500 גרם", "expected": "pasta-linguine" },
  { "name": "ברילה פרפלה 500 גרם", "expected": "pasta-farfalle" },
  { "name": "פסטה רגיה 84 פרפר קטן", "expected": "pasta-farfalle" },
  { "name": "פסטה פוזילי 500 גרם ברילה", "expected": "pasta-fusilli" },
  { "name": "פוזילי כוסמין אורגני 500 גר", "expected": "pasta-fusilli" },
  { "name": "תמי פסטה פוזילי ללא גלוטן 400 גר", "expected": "pasta-fusilli" },
  { "name": "פסטה צדפים גדולים אסם 500 גרם", "expected": "pasta-shells" },
  { "name": "קונכיות טאקו מקסיקני", "expected": null },
  { "name": "ליגורי פסטה ניוקי סרדי קונכיות 500גר", "expected": "pasta-other" },
  { "name": "פסטה ריגטוני 500 גר Agnesi", "expected": "pasta-tubes" },
  { "name": "פסטה מקרוני מספר 7 אסם 500 גרם", "expected": "pasta-tubes" },
  { "name": "מארז מקרונים במילויים", "expected": null },
  { "name": "פסטה גן חיות אסם 400 גרם", "expected": "pasta-kids-shapes" },
  { "name": "מנת פסטה נפוליטנה בלה איטליה 55 גרם", "expected": null },
  { "name": "מקרוני עם גבינה 206 גרם דודל'ס", "expected": "instant-mac-cheese" },
  { "name": "ברילה ספגטי מספר 5 500 גרם", "expected": "pasta-spaghetti" },
  { "name": "ברילה פנה ריגטה 500 גרם", "expected": "pasta-penne" },
  { "name": "ליגורי ניוקי 400 גר", "expected": "pasta-other" },
  { "name": "ניוקי תפוחי אדמה 500 גרם", "expected": "gnocchi" },
  { "name": "אטריות אורז 400 גרם", "expected": "noodles-rice" },
  { "name": "פוסילי כוסמת ללא גלו", "expected": "pasta-fusilli" },
  { "name": "רוטב עגבניות לפסטה 350 מל", "expected": "pasta-sauce-tomato" },
  { "name": "פסטה רדיאטורי 500 גר", "expected": "pasta-other" },
  { "name": "קמח לפסטה 1ק\"ג", "expected": null },
  { "name": "בצק לפסטה", "expected": null },
  { "name": "פסטה קרניים בינוניות אסם 500 גרם", "expected": "pasta-elbows" },
  { "name": "פרפקטו קיפרי ריגאטי", "expected": "pasta-elbows" },
  { "name": "פסטה צינורות אסם 500 גרם", "expected": "pasta-tubes" },
  { "name": "פסטה מאצ'רוני", "expected": "pasta-tubes" },
  { "name": "פסטה ברילה מקרוני בוקטיני מספר 9 500 גרם", "expected": "pasta-other" },
  { "name": "פסטה פפרדלה טרייה 400 גרם", "expected": "fresh-pasta" },
  { "name": "טליאטלה 250 גרם - קר", "expected": "fresh-pasta" },
  { "name": "פסטה רגיה 60 קונכיה 500 גרם", "expected": "pasta-shells" },
  { "name": "פסטה בולונז מאדאם פרז", "expected": null },
  { "name": "בייבי פסטה 120 גרם", "expected": null },
  { "name": "פתיתי פרמזן לפסטה 100גרם", "expected": null },
  { "name": "סקיני פסטה דפי אורז לבן 300 גר לל\"ס לל\"ג", "expected": null },
  { "name": "פוסיליני עדשים צהובות", "expected": "pasta-fusilli" },
  { "name": "פסטה בצורת מכוניות", "expected": "pasta-kids-shapes" },
  { "name": "קונקילי ריגטה", "expected": "pasta-shells" }
];

for (const { name, expected } of CASES) {
  test(`assignConcept: "${name}" -> ${expected}`, () => {
    assert.equal(assignConcept(name, list), expected, name);
  });
}

const KINDS = [
  ["פסטה פוזילי ברילה 500 גרם", "pasta-fusilli", []],
  ["פוסיליני עדשים צהובות", "pasta-fusilli", ["kind:lentil"]],
  ["פוזילי כוסמין אורגני 500 גר", "pasta-fusilli", ["kind:spelt"]],
  ["פוסילי כוסמת ללא גלו", "pasta-fusilli", ["kind:buckwheat"]],
  ["סקיני פסטה פנה 270 גרם", "pasta-penne", ["kind:konjac"]],
  ["פסטה פנה ברילה 500 גרם", "pasta-penne", []],
  ["פסטה אפונה ירוקה 250", "pasta-other", ["kind:pea"]],
  ["פסטה PRO קטניות", "pasta-other", ["kind:legume"]],
  ["פסטה עדשים אדומות 250גר", "pasta-other", ["kind:lentil"]],
  ["לזניה עדשים", "lasagna", ["kind:lentil"]],
  ["פסטה פפרדלה ביצים 250 גר Agnesi", "pasta-pappardelle", ["kind:egg"]],
  ["אטריות סקיני קונג׳אק 270 גרם", "noodles", ["kind:konjac"]],
  ["אטריות ביצים 400 גרם", "noodles", ["kind:egg"]]
];

for (const [name, conceptId, expected] of KINDS) {
  test(`variantSignature: "${name}" in ${conceptId} -> ${JSON.stringify(expected)}`, () => {
    assert.deepEqual(variantSignature(name, undefined, conceptId), expected, name);
  });
}

const LEAVES = ['pasta-spaghetti', 'pasta-penne', 'pasta-ribbon', 'pasta-pappardelle', 'pasta-linguine', 'pasta-farfalle', 'pasta-fusilli',
  'pasta-shells', 'pasta-tubes', 'pasta-elbows', 'pasta-kids-shapes', 'pasta-other', 'lasagna'];

test('every pasta leaf lives in the pasta group; lasagna, cannelloni and fresh-pasta are their own families; kids shapes are out of the pasta family', () => {
  const raw = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
  for (const id of LEAVES.filter((x) => x.startsWith('pasta-'))) {
    const c = conceptById(id, list);
    assert.ok(c, `no concept ${id}`);
    assert.equal(resolveFamily(c, list).id, 'pasta', id);
  }
  for (const id of ['lasagna', 'cannelloni', 'fresh-pasta']) assert.equal(resolveFamily(conceptById(id, list), list).id, id, id);
  assert.ok(!conceptById('instant-pasta', list));
  assert.deepEqual(raw.families.pasta.without, ['pasta-kids-shapes']);
  for (const id of ['pasta-other', 'pasta-kids-shapes']) assert.equal(raw.conceptPolicy[id], 'missingOnly', id);
  for (const id of ['pasta-fusilli', 'pasta-ribbon', 'pasta-pappardelle', 'pasta-elbows', 'pasta-tubes', 'pasta-shells', 'pasta-farfalle', 'pasta-linguine',
    'lasagna', 'cannelloni', 'fresh-pasta']) assert.equal(raw.conceptPolicy[id], undefined, id);
});

test('the same kind groups sit on every pasta leaf, konjac first; noodles carry konjac, buckwheat and egg', () => {
  const raw = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
  const ref = raw.variant.groups['pasta-spaghetti'];
  assert.deepEqual(Object.keys(ref), ['konjac', 'lentil', 'chickpea', 'pea', 'legume', 'buckwheat', 'spelt', 'oat', 'egg']);
  for (const id of LEAVES) assert.deepEqual(raw.variant.groups[id], ref, id);
  for (const id of ['noodles', 'noodles-rice']) assert.deepEqual(Object.keys(raw.variant.groups[id]), ['konjac', 'buckwheat', 'egg'], id);
});

const mk = (name, conceptId, grams, brand = 'בדיקה') => ({ name, conceptId, category: 'שימורים', brand, isWeighted: false, size: { value: grams, unit: 'g', count: 1 }, basePrice: 10 });
const offer = (product, candidate, purpose = 'missing') => compatible({ product, candidate, requireSize: true, purpose, sameSizeUnit: true }, rules());

test('(a) a lentil fusilli is not offered for a semolina fusilli', () => {
  const r = offer(mk('פסטה פוזילי ברילה 500 גרם', 'pasta-fusilli', 500), mk('פוסיליני עדשים צהובות 250 גרם', 'pasta-fusilli', 250));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'variant');
});

test('(b) Skinny konjac penne is refused for a Barilla penne and the reverse', () => {
  const skinny = mk('סקיני פסטה פנה 270 גרם', 'pasta-penne', 270);
  const barilla = mk('פסטה פנה ברילה 500 גרם', 'pasta-penne', 500);
  assert.equal(offer(skinny, barilla).reason, 'variant');
  assert.equal(offer(barilla, skinny).reason, 'variant');
});

test('(c) a missing penne is offered fusilli with the other-family caveat', () => {
  const r = offer(mk('פסטה פנה ברילה 500 גרם', 'pasta-penne', 500), mk('פסטה פוזילי ברילה 500 גרם', 'pasta-fusilli', 500));
  assert.equal(r.ok, true);
  assert.ok(r.caveats.includes('other-family'));
});

test('(d) the family tree never offers kids shapes, lasagna or cannelloni for a penne', () => {
  assert.equal(resolveFamily(conceptById('pasta-kids-shapes', list), list).id, 'pasta');
  const raw = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
  assert.ok(raw.families.pasta.without.includes('pasta-kids-shapes'));
  for (const id of ['lasagna', 'cannelloni', 'fresh-pasta']) assert.notEqual(resolveFamily(conceptById(id, list), list).id, 'pasta', id);
});

test('(e) a missing farfalle is offered casarecce (pasta-other) with the other-family caveat', () => {
  const r = offer(mk('ברילה פרפלה 500 גרם', 'pasta-farfalle', 500), mk('פסטה קסרצה 500 גרם', 'pasta-other', 500));
  assert.equal(r.ok, true);
  assert.ok(r.caveats.includes('other-family'));
});
