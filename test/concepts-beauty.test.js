import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

/**
 * טיפוח ויופי round (24.9): two cases per new concept in config/concepts/beauty.json - a real chain name
 * the concept must capture, and a near-miss (a sibling variety, a neighbouring product type, or a product
 * this department shares wording with) that must NOT resolve to it. The near-miss is what actually holds:
 * a rule that captures its target but also swallows its neighbour is exactly the mushroom/קרם trap
 * (.claude/skills/taxonomy/TRAPS.md #1, #3, #9). Names are copied verbatim from
 * data/prices/<chain>/catalog.full.json.
 */
const concepts = loadConcepts();
const id = (name) => assignConcept(name, concepts);

test('lip-stick: captures a shade-only lipstick, rejects the liquid variety', () => {
  assert.equal(id('שפתון 20'), 'lip-stick');
  assert.notEqual(id('שפתון נוזלי 10'), 'lip-stick');
});

test('lip-stick-liquid: captures liquid lipstick, rejects the stick', () => {
  assert.equal(id('שפתון נוזלי 20'), 'lip-stick-liquid');
  assert.notEqual(id('שפתון 20'), 'lip-stick-liquid');
});

test('lip-pencil: captures a lip liner, rejects an eye pencil', () => {
  assert.equal(id('עפרון שפתיים עמיד 33'), 'lip-pencil');
  assert.notEqual(id('עפרון עיניים 01'), 'lip-pencil');
});

test('lip-gloss: captures a gloss tube, rejects a lipstick whose product line is named "gloss"', () => {
  assert.equal(id('גלוס שפתיים מבריק'), 'lip-gloss');
  assert.notEqual(id('שפתון גלוס עמיד 83 יח'), 'lip-gloss');
});

test('lip-balm: captures a lip balm, rejects a makeup-remover balm', () => {
  assert.equal(id('באלם לחות לשפתיים 28'), 'lip-balm');
  assert.notEqual(id('באלם להסרת איפור וניקוי'), 'lip-balm');
});

test('eye-pencil: captures an eye pencil, rejects a brow pencil', () => {
  assert.equal(id('עפרון עיניים 01'), 'eye-pencil');
  assert.notEqual(id('עפרון גבות ברואו יח'), 'eye-pencil');
});

test('brow-pencil: captures a brow pencil, rejects an eye pencil', () => {
  assert.equal(id('עפרון גבות ברואו יח'), 'brow-pencil');
  assert.notEqual(id('עפרון עיניים 01'), 'brow-pencil');
});

test('eye-liner: captures a liquid/gel liner, rejects an eyeliner PENCIL (that is eye-pencil)', () => {
  assert.equal(id('אייליינר גל עמיד - 65'), 'eye-liner');
  assert.notEqual(id('עפרון אייליינר קרמי 219'), 'eye-liner');
});

test('eye-shadow: captures an eyeshadow palette, rejects a brow product named with the same word', () => {
  assert.equal(id('פלטת צלליות'), 'eye-shadow');
  assert.notEqual(id('צללית בייסיק לגבות יח'), 'eye-shadow');
});

test('mascara: captures a mascara, rejects a concealer', () => {
  assert.equal(id('מסקרה שחורה'), 'mascara');
  assert.notEqual(id('קונסילר 07'), 'mascara');
});

test('concealer: captures a concealer, rejects the brush that applies it', () => {
  assert.equal(id('קונסילר 07'), 'concealer');
  assert.notEqual(id('מברשת להנחת קונסילר יח'), 'concealer');
});

test('face-powder: captures loose powder, rejects an Italian wine estate whose name transliterates to "powder"', () => {
  assert.equal(id('פודרה בתפזורת שקוף'), 'face-powder');
  assert.notEqual(id('יין פודרה דה קטאלדו נגרואמארו רוזה 750מ'), 'face-powder');
});

test('bronzer: captures a bronzer, rejects a concealer', () => {
  assert.equal(id('ברונזר בגימור מאט'), 'bronzer');
  assert.notEqual(id('קונסילר 07'), 'bronzer');
});

test('nail-polish: captures a shade-only polish, rejects nail-polish REMOVER (an existing concept)', () => {
  assert.equal(id('לק גוון 03 יח'), 'nail-polish');
  assert.notEqual(id('מסיר לק'), 'nail-polish');
});

test('nail-polish-gel: captures the gel-polish line, rejects regular polish', () => {
  assert.equal(id('לק גל קוטור 270'), 'nail-polish-gel');
  assert.notEqual(id('לק גוון 03 יח'), 'nail-polish-gel');
});

test('makeup-primer: captures a primer, rejects a moisturizer that merely contains one', () => {
  assert.equal(id('פריימר 30 מ"ל'), 'makeup-primer');
  assert.notEqual(id('קרם לחות עם פריימר 50מל'), 'makeup-primer');
});

test('makeup-remover: captures a bi-phase remover, rejects a lip balm', () => {
  assert.equal(id('מסיר איפור דו פאזי 200מל'), 'makeup-remover');
  assert.notEqual(id('באלם לחות לשפתיים 28'), 'makeup-remover');
});

test('contact-lens-colored: captures colored lenses, rejects clear prescription lenses', () => {
  assert.equal(id('עדשות צבעוניות חודשיות'), 'contact-lens-colored');
  assert.notEqual(id('מויסט עדשות -1.00'), 'contact-lens-colored');
});

test('contact-lens-clear: captures clear prescription lenses, rejects colored lenses', () => {
  assert.equal(id('מויסט עדשות -1.00'), 'contact-lens-clear');
  assert.notEqual(id('עדשות צבעוניות חודשיות'), 'contact-lens-clear');
});

test('hair-color: captures a hair-dye product line, rejects a root-touch-up spray (a different product)', () => {
  assert.equal(id('צבע לשיער אקסלנס קרם'), 'hair-color');
  assert.notEqual(id('ספריי צבע לשורשים 120 מל'), 'hair-color');
});

test('hair-color-spray: captures the root-touch-up spray, rejects the permanent dye kit', () => {
  assert.equal(id('ספריי צבע לשורשים 120 מל'), 'hair-color-spray');
  assert.notEqual(id('צבע לשיער אקסלנס קרם'), 'hair-color-spray');
});

test('hair-cream: captures a curl cream, rejects a hair-REMOVAL cream (a different product that also says "hair")', () => {
  assert.equal(id('קרם לחות לשיער תלתלים 400 מ"ל'), 'hair-cream');
  assert.notEqual(id('קרם להסרת שיער 200גרם'), 'hair-cream');
});

test('hair-glaze: captures a curl glaze, rejects a food glaze (balsamic reduction) that says the same word', () => {
  assert.equal(id('גלייז לתלתלים 400 מ"ל'), 'hair-glaze');
  assert.notEqual(id('חומץ בלסמי ממודנה גלייז 250 מ"ל'), 'hair-glaze');
});

test('hair-serum: captures a hair serum, rejects a face serum', () => {
  assert.equal(id('סרום לשיער 100 מ"ל'), 'hair-serum');
  assert.notEqual(id('סרום פנים לחיזוק50מ"ל'), 'hair-serum');
});

test('skin-face-cream: captures a face moisturizer, rejects hand cream (its own concept)', () => {
  assert.equal(id('קרם לחות 50 מ"ל'), 'skin-face-cream');
  assert.notEqual(id('קרם ידיים 150 מ"ל'), 'skin-face-cream');
});

test('skin-eye-cream: captures an eye cream, rejects a general face cream', () => {
  assert.equal(id('קרם עיניים 15 מל'), 'skin-eye-cream');
  assert.notEqual(id('קרם לחות 50 מ"ל'), 'skin-eye-cream');
});

test('skin-hand-cream: captures a hand cream, rejects an eye cream', () => {
  assert.equal(id('קרם ידיים 150 מ"ל'), 'skin-hand-cream');
  assert.notEqual(id('קרם עיניים 15 מל'), 'skin-hand-cream');
});

test('skin-face-serum: captures a face serum, rejects a hair serum', () => {
  assert.equal(id('סרום פנים לחיזוק50מ"ל'), 'skin-face-serum');
  assert.notEqual(id('סרום לשיער 100 מ"ל'), 'skin-face-serum');
});

test('skin-face-mask: captures a disposable face mask, rejects a keratin hair mask that never says "hair"', () => {
  assert.equal(id('מסכת פנים הגיינית 10 יח'), 'skin-face-mask');
  assert.notEqual(id('מסכת קרטין אינטנס למניעת קשקשים'), 'skin-face-mask');
});

test('foundation: captures liquid foundation, rejects the brush that applies it', () => {
  assert.equal(id('מייק אפ 46 HD 30 מ"ל'), 'foundation');
  assert.notEqual(id('מברשת מייקאפ מספר 11'), 'foundation');
});

test('highlighter: captures a highlighter, rejects the brush that applies it', () => {
  assert.equal(id('היילייטר אינסאן שמפיין'), 'highlighter');
  assert.notEqual(id('מברשת להנחת היילייטר'), 'highlighter');
});

test('toner: captures a face toner, rejects an unrelated lip product', () => {
  assert.equal(id('רויטליפט טונר לפנים 180מ'), 'toner');
  assert.notEqual(id('שפתון 20'), 'toner');
});
