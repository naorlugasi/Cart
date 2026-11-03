import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutFlavourPhrases } from '../src/catalog/concepts.js';
import { normalizeText } from '../src/catalog/matching.js';

const core = (s) => withoutFlavourPhrases(normalizeText(s));

// Engine fix 3.11 (deodorant-shelf review): "<word> קרם ..." was stripped as a filling also where the cream is
// the product's own head word, which emptied these names until no concept matched.
test('a cream that is the product keeps its words: shaving cream, foot cream, foot deodorant, after-shave', () => {
  const keep = [
    ['ניוואה קרם גילוח לעור רגיל', 'גילוח'],
    ['ניוואה קרם גילוח לעור רגיש', 'גילוח'],
    ['פדיסול Pedisol קרם טיפולי לכף הרגל מועשר בג\'ל באלוורה', 'לכפ הרגל'],
    ['קרם לכף הרגל אפקטיב קר צנצנת 200 מ"ל', 'הרגל'],
    ['כפתן קרם לכף הרגל', 'הרגל'],
    ['רעננה קרם דאודורנט לכפות הרגליים', 'דאודורנט'],
    ['הוואי קרם לאחר גילוח 120 מל', 'גילוח'],
    ['אפטר שייב קרם לעור רגיש 100 מל', 'אפטר שייב'],
  ];
  for (const [name, word] of keep) assert.ok(core(name).includes(word), `${name} -> ${core(name)}`);
});

test('a real filling is still stripped', () => {
  assert.equal(core('וופל במילוי קרם אגוזים'), 'וופל');
  assert.ok(!core('עוגיות טעמי תות קרם אגוזים').includes('אגוזים'));
});

test('the scent stripper stops at a size glued to its unit', () => {
  assert.ok(core('דאודורנט בניחוח לבנדר 55מל').includes('55מל'), core('דאודורנט בניחוח לבנדר 55מל'));
  assert.ok(core('טורטיות בתוספת זרעי צ\'יה 25ס"מ 6יח').includes('25'));
  assert.equal(core('אג\'קס בניחוח לימון'), 'אגקס');
});
