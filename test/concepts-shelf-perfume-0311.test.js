// 3.11 perfume shelf: no leaves (concentration, gender and gift set are kinds), a body-mist sibling concept, spelling and stop-word fixes,
// conceptPolicy none. Reviewer: a non-perfume name is excluded by perfume's none, never given a kind. scratchpad shelf-perfume/REPORT.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConcepts, assignConcept, conceptById, resolveFamily } from '../src/catalog/concepts.js';
import { RULES_FILE, variantSignature } from '../src/pricing/substituteRules.js';

const list = loadConcepts();

// [name, concept, kind of a perfume (null: none)]
const CASES = [
  ["בושם מספר 22 100 מ\"ל", "perfume", null],
  ["La vie est belle אדפ100מ", "perfume", "kind:edp"],
  ["הפי אדפ לאשה 100מל", "perfume", "kind:edp-women"],
  ["Terre Dhermes אדט100מל", "perfume", "kind:edt"],
  ["פרנהייט א.ד.ט לגבר 100מל", "perfume", "kind:edt-men"],
  ["SAUVAGE פרפיום לגבר100מל", "perfume", "kind:parfum-men"],
  ["ברניה אדפ יוניסקס 100 מ\"ל", "perfume", "kind:edp-unisex"],
  ["OMBRE LEATHER א.ד.ט 50מל", "perfume", "kind:edt"],
  ["SCANDAL HIM א.ד.ט100 מל", "perfume", "kind:edt-men"],
  ["SHE א.ד.פ 100 מ\"ל", "perfume", "kind:edp-women"],
  ["BLACK - שמן בושם", "perfume", null],
  ["אקספלורר אדפ סט לגבר", "perfume", "kind:set"],
  ["וולווט קריסטל אדפ+קרם יד", "perfume", "kind:set"],
  ["ארמני קוד לה פרפום 50מל", "perfume", "kind:parfum"],
  ["BLACK - מיני בושם", "perfume", null],
  ["ריו רדיאנס מיסט 240 מ\"ל", "body-mist", null],
  ["ברזיליאן מיסט 62 240 מ\"ל", "body-mist-brazilian", null],
  ["אאורה מיסט מבשם שיער90מל", null, null],
  ["מבשם אוויר Duo פרש לוטוס ופרחי מים", "air-freshener", null],
  ["נר כוס אבן ריחני 7 ס\"מ", null, null],
  ["נרות חימום ריחניים", "candle-tealight", null],
  ["דאודורנט ספריי גוף לגבר SPORT", "deodorant", null],
  ["מקסימה בושם מרוכז מרכך 600 מל", null, null],
  ["מרכך כביסה פרפיום קריסטל", "fabric-softener", null],
  ["אפטר שייב ניוואה פרש100מ", "aftershave", null],
  ["בולגרי פור הום אדט100מ\"ל", "perfume", "kind:edt-men"],
  ["גבינה בולגרית 5%", "bulgarian-cheese-5", null]
];

for (const [name, expected, kind] of CASES) {
  test(`assignConcept: "${name}" -> ${expected}${expected === 'perfume' ? ` (${kind})` : ''}`, () => {
    assert.equal(assignConcept(name, list), expected, name);
    if (expected === 'perfume') {
      const k = variantSignature(name, undefined, 'perfume').find((w) => w.startsWith('kind:')) ?? null;
      assert.equal(k, kind, name);
    }
  });
}

test('body-mist is its own family in the fragrance group, perfume is never offered as a stand-in, the not-perfume kind is gone', () => {
  const raw = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
  assert.equal(resolveFamily(conceptById('body-mist', list), list).id, 'body-mist');
  assert.equal(raw.conceptPolicy.perfume, 'none');
  assert.equal(raw.conceptPolicy['body-mist'], undefined);
  assert.equal(raw.variant.groups.perfume['not-perfume'], undefined);
  assert.equal(Object.keys(raw.variant.groups.perfume)[0], 'set');
  const fam = JSON.parse(readFileSync(new URL('../config/concepts/families.json', import.meta.url), 'utf8'));
  assert.ok(fam.groups['beauty-fragrance'].families.includes('body-mist'));
});
