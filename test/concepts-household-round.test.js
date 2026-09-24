import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * The concept round on config/concepts/household.json, department ניקיון וטואלטיקה (24.9):
 * צלחות, כפפות, נרות, ג'ל, מטליות, סבון (see .claude/skills/taxonomy/SKILL.md and TRAPS.md for the
 * procedure and the general.json-collision reasoning). One capture case and one near-miss case per new
 * concept - the near-miss is the one that proves the guard, not the capture.
 */
const concepts = loadConcepts();

test('plate-disposable-small: captures a small disposable plate, not a large one', () => {
  assert.equal(assignConcept('צלחות קטנות 25 יח` מעורב הנמל', concepts), 'plate-disposable-small');
  assert.notEqual(assignConcept('צלחות גדולות 25 יח`', concepts), 'plate-disposable-small');
});

test('plate-disposable-large: captures a large disposable plate, not a reusable porcelain set', () => {
  assert.equal(assignConcept('צלחות גדול 50 יחידות', concepts), 'plate-disposable-large');
  // A real porcelain/glass plate set must never reach a disposable-plate concept (the ceramic-plate trap).
  assert.notEqual(assignConcept('סט צלחות פורצלן ענקיות+בינוניות שווה', concepts), 'plate-disposable-large');
});

test('plate-disposable-xl: captures an XL disposable plate, not an eco/biodegradable one', () => {
  assert.equal(assignConcept("צלחות ענק 10' 20 יח", concepts), 'plate-disposable-xl');
  // Eco material takes priority over plain size when a plate is both.
  assert.notEqual(assignConcept('צלחות ענקיות מקנה סוכר', concepts), 'plate-disposable-xl');
});

test('plate-disposable-soup: captures a soup/deep disposable plate, not a real glass one', () => {
  assert.equal(assignConcept('צלחות מרק לבן 100 יח', concepts), 'plate-disposable-soup');
  assert.notEqual(assignConcept('צלחות עמוקות זכוכית', concepts), 'plate-disposable-soup');
});

test('plate-disposable-dessert: captures a compote/dessert plate, not a soup plate', () => {
  assert.equal(assignConcept('צלחות לפתן נעימות 10', concepts), 'plate-disposable-dessert');
  assert.notEqual(assignConcept('צלחות מרק נעימות ורוד', concepts), 'plate-disposable-dessert');
});

test('plate-disposable-square: captures a square/rectangular disposable plate, not a round large one', () => {
  assert.equal(assignConcept('צלחות מרובעות ענק מדקל', concepts), 'plate-disposable-square');
  assert.notEqual(assignConcept('צלחות גדולות עגולות', concepts), 'plate-disposable-square');
});

test('plate-disposable-eco: captures a biodegradable plate, not a plain (non-eco) one', () => {
  assert.equal(assignConcept('צלחות מתכלות דנטס', concepts), 'plate-disposable-eco');
  assert.notEqual(assignConcept('צלחות גדולות רגילות', concepts), 'plate-disposable-eco');
});

test('cup-disposable: captures a disposable drinking cup, not a hot-water urn measured in cups', () => {
  assert.equal(assignConcept('כוס קרטון 12 OZ מבוד', concepts), 'cup-disposable');
  // "40 כוסות" here is the urn's capacity, not a cup product - the מיחם trap.
  assert.notEqual(assignConcept('מיחם 40 כוסות נירוסטה ML-1580', concepts), 'cup-disposable');
});

test('gloves-disposable: captures a one-time nitrile/latex glove, not a reusable rubber one', () => {
  assert.equal(assignConcept('כפפות ניטריל L שחור 100 יחידות', concepts), 'gloves-disposable');
  assert.notEqual(assignConcept('כפפות גומי רב פעמיות', concepts), 'gloves-disposable');
});

test('gloves-household: captures a reusable rubber household glove, and refuses the aloe-treatment cosmetic', () => {
  assert.equal(assignConcept('כפפות משק בית אלוורה', concepts), 'gloves-household');
  // "כפפות אלוורה להקלה על עור יבש" is a skincare product, not a cleaning glove - refuse it entirely.
  assert.equal(assignConcept('כפפות אלוורה להקלה על עור יבש - בינוני M', concepts), null);
});

test('candle-tealight: captures a heating/tealight candle, not a Shabbat candle', () => {
  assert.equal(assignConcept('נרות חימום 100 יח מ', concepts), 'candle-tealight');
  assert.notEqual(assignConcept('נרות שבת 20 יחידות', concepts), 'candle-tealight');
});

test('candle-shabbat: captures a Shabbat candle, not a Hanukkah candle', () => {
  assert.equal(assignConcept('נרות שבת 4 יחידות', concepts), 'candle-shabbat');
  assert.notEqual(assignConcept('נרות חנוכה 44 יחידות', concepts), 'candle-shabbat');
});

test('candle-hanukkah: captures a Hanukkah candle, not a Shabbat candle', () => {
  assert.equal(assignConcept('נרות חנוכה 44 יחידות', concepts), 'candle-hanukkah');
  assert.notEqual(assignConcept('נרות שבת 4 יחידות', concepts), 'candle-hanukkah');
});

test('candle-party: captures a birthday/decorative candle, not a heating candle', () => {
  assert.equal(assignConcept('נרות ג\'מבו מאויירים -סמי הכבאי', concepts), 'candle-party');
  assert.notEqual(assignConcept("נרות חימום 50 יח' שק", concepts), 'candle-party');
});

test('cloth-floor: captures a dry floor cloth, not a wet wipe', () => {
  assert.equal(assignConcept('מטליות רצפה', concepts), 'cloth-floor');
  // Wet wipes are wet-wipes-surface's territory (the general.json-collision guard: "לחות").
  assert.notEqual(assignConcept('מטליות לחות לרצפה בבישום מרענן', concepts), 'cloth-floor');
});

test('cloth-general: captures a dry multi-purpose/microfiber cloth, not a wet wipe', () => {
  assert.equal(assignConcept('מטליות רב שימושיות', concepts), 'cloth-general');
  assert.notEqual(assignConcept('מטליות לחות לניקוי כללי', concepts), 'cloth-general');
});

test('cloth-disinfect: captures a dry disinfecting cloth, not a wet disinfecting wipe', () => {
  assert.equal(assignConcept('מטליות לניקוי וחיטוי', concepts), 'cloth-disinfect');
  assert.notEqual(assignConcept('מטליות לחות לניקוי וחיטוי', concepts), 'cloth-disinfect');
});

test('soap-bar: captures a solid bath soap, not a solid toilet-bowl soap block', () => {
  assert.equal(assignConcept('סבון מוצק אובליפיחה 125מ', concepts), 'soap-bar');
  assert.notEqual(assignConcept('סבון מוצק לניקוי אסלה בניחוח ים', concepts), 'soap-bar');
});

test('soap-liquid: captures a generic liquid soap, not a body-wash (סבון רחצה)', () => {
  assert.equal(assignConcept('סבון נוזלי בניחוח ורדים', concepts), 'soap-liquid');
  assert.notEqual(assignConcept('סבון רחצה נוזלי לבנדר וורבנה 500 מ"ל', concepts), 'soap-liquid');
});

test('shaving-gel: captures a shaving gel, not a facial cleansing gel', () => {
  assert.equal(assignConcept('ג\'ל גילוח לעור רגיש ניוואה 200 מ"ל', concepts), 'shaving-gel');
  // "ג'ל ניקוי" face-wash products are a cosmetic, refused this round (filed in ops/taxonomy/household.md).
  assert.notEqual(assignConcept('גל ניקוי בוקר 150 מ"ל', concepts), 'shaving-gel');
});

test('pine-gel-cleaner: captures a plain pine gel cleaner, not a general-purpose one (all-purpose-cleaner\'s territory)', () => {
  assert.equal(assignConcept('גל אורנים אקופרינד 1 ליטר', concepts), 'pine-gel-cleaner');
  assert.notEqual(assignConcept('ג\'ל אורנים מרוכז לניקוי כללי 1 ק"ג רמי לוי', concepts), 'pine-gel-cleaner');
});
