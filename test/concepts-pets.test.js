import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';
import { categorize } from '../src/catalog/categorize.js';

const concepts = loadConcepts();

/**
 * בעלי חיים round (config/concepts/pets.json): 298 products, 225 without a concept (76%) before this
 * round. general.json's pet-food-dog/pet-food-cat (untouched here - another round owns that file) already
 * catch anything that literally says "מזון"/"אוכל" next to כלב/חתול; almost none of the branded names in
 * this department do that (פרמיו, פריסקיז, פנסי, דוגלי, בונזו, סימבה, לה קט...), so every concept below is
 * split by species+form/kind instead of by brand (docs/CONCEPTS.md, taxonomy SKILL.md trap 2), and every
 * one of them rejects "מזונ"/"אוכל" so it can never claim a name pet-food-dog/pet-food-cat already claims -
 * two concepts matching one name is a conflict that drops both (concept-round.mjs --diff, taxonomy
 * TRAPS.md #14).
 */

test('cat-food-kitten: a קיטן/חתלתול name captures, an adult (בוגר) dog name does not', () => {
  assert.equal(assignConcept('פרמיו דליקט קיטן עוף', concepts), 'cat-food-kitten');
  assert.equal(assignConcept('פרמיו חתלתול 1.5ק"ג', concepts), 'cat-food-kitten');
  assert.notEqual(assignConcept('פרמיו שימורי מזון משלים לכלב בוגר עם בקר במרקם פטה', concepts), 'cat-food-kitten');
  assert.notEqual(assignConcept('דוגלי בוגר בקר 3 ק"ג', concepts), 'cat-food-kitten');
});

test('cat-food-wet: a wet-format name (דליקט/פאוץ/פטה/מחית) captures, the dry כריות line does not', () => {
  assert.equal(assignConcept('פרמיו דליקט עוף לחתול', concepts), 'cat-food-wet');
  assert.equal(assignConcept('נייטיב פטה בקר לחתול', concepts), 'cat-food-wet');
  assert.notEqual(assignConcept('פרמיו כריות בקר לחתול', concepts), 'cat-food-wet');
  // a kitten-specific wet name goes to cat-food-kitten instead, not both (no self-conflict):
  assert.equal(assignConcept('פרמיו מחית בשר עוף וסלמון לחתלתול', concepts), 'cat-food-kitten');
});

test('cat-food-dry: the כריות (pillow-kibble) line and bare יבש capture, a wet פטה name does not', () => {
  assert.equal(assignConcept('פרמיו כריות בקר לחתול', concepts), 'cat-food-dry');
  assert.equal(assignConcept('פרמיו כריות סטרילייז לחתול', concepts), 'cat-food-dry');
  assert.notEqual(assignConcept('פרמיו דליקט עוף לחתול', concepts), 'cat-food-dry');
});

test('dog-food-wet: a canned/pouch dog name captures, a brand-only dry kibble bag (no textual cue) does not', () => {
  assert.equal(assignConcept('סימבה שימורים לכלב כבש 415 גרם', concepts), 'dog-food-wet');
  assert.equal(assignConcept('שימורים לכלבים מיגלי', concepts), 'dog-food-wet');
  // "דוגלי בוגר בקר 3 ק"ג" has no מזון/אוכל/פאוץ/שימור word at all - by design it gets no concept here
  // rather than being caught by a brand rule (taxonomy TRAPS.md trap 2).
  assert.notEqual(assignConcept('דוגלי בוגר בקר 3 ק"ג', concepts), 'dog-food-wet');
  assert.equal(assignConcept('דוגלי בוגר בקר 3 ק"ג', concepts), null);
});

test('dog-treats: a חטיף/עצם/רצועה dog name captures, the dental-stick line does not', () => {
  assert.equal(assignConcept('חטיף כלבים ברונו לבבות בקר 80 גרם', concepts), 'dog-treats');
  assert.equal(assignConcept('פרמיו חטיף נגיסי עוף לכלב ננסי', concepts), 'dog-treats');
  assert.notEqual(assignConcept('דנטל סטיקס לכלב גדול 270 גר', concepts), 'dog-treats');
});

test('cat-treats: שלוקים/חטיף captures for cats, the dental-chew line does not', () => {
  assert.equal(assignConcept('שלוקים לחתול טעם עוף 60 גר', concepts), 'cat-treats');
  assert.equal(assignConcept('חטיף לחתול Party Mix', concepts), 'cat-treats');
  assert.notEqual(assignConcept('דנטלייף חטיף דנטלי לחתול בטעם עוף', concepts), 'cat-treats');
});

test('dog-dental: דנטל סטיקס/דנטלייף captures for dogs, a plain dog treat does not', () => {
  assert.equal(assignConcept('דנטל סטיקס לכלב גדול 270 גר', concepts), 'dog-dental');
  assert.equal(assignConcept('דנטלייף חטיף דנטלי לכלבים מגזע בינוני', concepts), 'dog-dental');
  assert.notEqual(assignConcept('חטיף כלבים ברונו לבבות בקר 80 גרם', concepts), 'dog-dental');
});

test('cat-dental: דנטלייף captures for cats, a plain cat treat (שלוקים) does not', () => {
  assert.equal(assignConcept('דנטלייף חטיף דנטלי לחתול בטעם עוף', concepts), 'cat-dental');
  assert.equal(assignConcept('דנטלייף חטיף דנטלי לחתול בטעם סלמון', concepts), 'cat-dental');
  assert.notEqual(assignConcept('שלוקים לחתול טעם עוף 60 גר', concepts), 'cat-dental');
});

test('cat-litter: חול חתולים captures, "כחול" (blue, a Friskies packaging colour) does not', () => {
  assert.equal(assignConcept('חול חתולים אברקלין ללא בישום', concepts), 'cat-litter');
  assert.equal(assignConcept('חול חתולים גריי 10 קג', concepts), 'cat-litter');
  // "כחול" (blue) is not "חול" (litter/sand) with a one-letter grammatical prefix - and this name has no
  // חתול at all, so the all:["חול","חתול"] gate rejects it regardless.
  assert.notEqual(assignConcept('פריסקיז כחול 7.26 קג', concepts), 'cat-litter');
});

test('cat-toys: מגרדת/כדור captures for cats, a same-word dog toy (wrong species) does not', () => {
  assert.equal(assignConcept('מגרדת רדיו לחתול', concepts), 'cat-toys');
  assert.equal(assignConcept('מגדל כדורים לחתול', concepts), 'cat-toys');
  assert.notEqual(assignConcept('כדור זוהר לכלב', concepts), 'cat-toys');
});

test('dog-muzzle: מחסום captures for dogs, a treat literally named "strips" (not a muzzle) does not', () => {
  assert.equal(assignConcept('מחסום ניילון מידה 2 לכלב', concepts), 'dog-muzzle');
  assert.equal(assignConcept('מחסום ניילון מידה 7 לכלב', concepts), 'dog-muzzle');
  assert.notEqual(assignConcept('רצועות בונזו סנדוויץ', concepts), 'dog-muzzle');
});

/**
 * The two directions the brief asked to verify by name: a human food product carrying the same
 * meat/fish word as a pet product never reaches a pet concept, and a pet product carrying a human
 * food's ingredient word never reaches the human concept. Both directions are guarded from the human
 * side already (meat-fish.json / produce-deli-frozen.json / pantry.json `none: ["כלב","חתול", ...]`,
 * a guard the meat round put in place and this round does not touch) - these tests are the proof they
 * still hold now that pets.json's own concepts exist alongside them.
 */
test('a dog is never a beef cut: fresh chicken/beef human food does not reach a pets.json concept', () => {
  assert.equal(assignConcept('חזה עוף טרי 500 גרם', concepts), 'chicken-breast');
  assert.notEqual(assignConcept('חזה עוף טרי 500 גרם', concepts), 'dog-treats');
  assert.notEqual(assignConcept('חזה עוף טרי 500 גרם', concepts), 'dog-food-wet');
  assert.equal(assignConcept('אנטריקוט בקר טרי', concepts), 'beef-steak');
});

test('a beef cut is never a dog food: pet food naming a meat/fish word does not reach the human concept', () => {
  assert.equal(assignConcept('פרמיו דליקט טונה ודג קוד לחתול', concepts), 'cat-food-wet');
  assert.notEqual(assignConcept('פרמיו דליקט טונה ודג קוד לחתול', concepts), 'tuna-canned');
  assert.equal(assignConcept('נייטיב פטה סלמון ברוטב לחתול', concepts), 'cat-food-wet');
  assert.notEqual(assignConcept('נייטיב פטה סלמון ברוטב לחתול', concepts), 'salmon');
  assert.notEqual(assignConcept('נייטיב פטה סלמון ברוטב לחתול', concepts), 'feta-cheese');
});

/**
 * Corrections, not regressions (commit message has the full LOST list): these dog/cat products were
 * matching a human-food concept before this round because that concept's own `none` guard has "לכלב"
 * but not the bare construct-state "כלב" ("שימורי כלב", no ל) - a pre-existing gap in feta-cheese
 * (dairy-eggs.json), out of scope for this round to edit directly. Adding dog-food-wet makes the name
 * match two concepts at once, which conflicts both out rather than leaving the wrong tag standing.
 */
test('a dog can (still, correctly) not be feta cheese - the pre-existing guard gap is now at least a conflict, not a wrong tag', () => {
  assert.notEqual(assignConcept("וונפי שימורי כלב פטה עוף 375 גרם", concepts), 'feta-cheese');
});

/**
 * pets.json's own category ("בעלי חיים") wins even where categorize.js's department wordRule keyword
 * list can't: "לה קט" (La-Cat) is not one of the brand names the wordRule knows, and "חתלתולים" (kitten)
 * shares no substring with the wordRule's "חתולים"/"לחתול" - so this name alone falls through to כללי.
 * Once cat-food-kitten claims it, categorize(name, conceptId) uses the concept's own category and the
 * product lands in בעלי חיים anyway (see ops/taxonomy/pets.md).
 */
test('a concept written here also re-categorizes a product that categorize.js\'s own department keywords miss', () => {
  const name = 'לה קט חתלתולים 2.85 ק"ג';
  assert.equal(assignConcept(name, concepts), 'cat-food-kitten');
  assert.equal(categorize(name, null), 'כללי'); // wordRule alone still misses it
  assert.equal(categorize(name, 'cat-food-kitten'), 'בעלי חיים'); // the concept's category rescues it
});
