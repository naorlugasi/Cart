// 3.11 shampoo and deodorant shelf rounds: shampoo leaves (antidandruff, kids, dry, silver), straightened as a kind,
// shampoo-looking household products routed to laundry / floor / carpet, deodorant spellings and kinds. Opus review:
// scratchpad/shelf-review/REVIEW.md. One assertion per case, the name in the message. Behaviour, not config.
// A case with `kind` also checks the variant-signature kind (variantSignature in substituteRules.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept, conceptById, resolveFamily } from '../src/catalog/concepts.js';
import { variantSignature, conceptPolicy } from '../src/pricing/substituteRules.js';

const list = loadConcepts();

const CASES = [
  {"name":"שמפו הוואי למניעת קשקשים 650 מ\"ל","concept":"shampoo-antidandruff"},
  {"name":"שמפו נגד קשקשים קוסוול1ל","concept":"shampoo-antidandruff"},
  {"name":"הד&שולדרס שמפו קלאסי 1 ליטר","concept":"shampoo","why":"brand is not type evidence"},
  {"name":"ג'ונסונס בייבי שמפו גולד 750מ\"ל","concept":"shampoo-kids"},
  {"name":"קמיל בלו שמפו אל דמע ד\"ר פישר 500 מ\"ל","concept":"shampoo-kids"},
  {"name":"סרקל שמפו לילדים 1 ל","concept":"shampoo-kids"},
  {"name":"שמפו לתינוק לפני השינה","concept":"shampoo-kids"},
  {"name":"שמפו לכל סוגי השיער 750 מ\"ל - סטיטץ' Stitch","concept":"shampoo","why":"a character name is not type evidence"},
  {"name":"שמפו יבש בניחוח קלאסי בטיסט 200 גר","concept":"shampoo-dry"},
  {"name":"סאיוס שמפו יבש גריז 200 מל","concept":"shampoo-dry"},
  {"name":"נייטשר נאט שמפו יבש 400 מ`ל","concept":"shampoo","why":"dry HAIR, sibling of שמפו רגיל"},
  {"name":"פינוק שמפו יבש/פגום 700","concept":"shampoo","kind":"dry-hair"},
  {"name":"שמפו לשיער יבש הוואי","concept":"shampoo","kind":"dry-hair"},
  {"name":"שמפו סילבר 500 מ\"ל","concept":"shampoo-silver"},
  {"name":"שמפו לניטרול גוונים 300מ","concept":"shampoo-silver"},
  {"name":"הוואי שמפו קטיפה סגולה 650 מל","concept":"shampoo","why":"Hawaii purple velvet = keratin line with a body wash twin (cheapersal 7290117860007), not a toner"},
  {"name":"שמפו לשיער צבוע ירקות סגולים 1 ליטר","concept":"shampoo","kind":"colored"},
  {"name":"שמפו קרטין לאחר החלקה 750 מל","concept":"shampoo","kind":"straightened"},
  {"name":"שמפו שיער שעבר החלקה ללא מלח אקולאב 500מ","concept":"shampoo","kind":"straightened"},
  {"name":"שמפו לשיער מתולתל נקה 7 750 מ\"ל","concept":"shampoo","kind":"curly"},
  {"name":"כיף שמפו לשיער שמן קוקוס קרטין 700 מל","concept":"shampoo","kind":null,"why":"coconut OIL, not oily hair"},
  {"name":"שמפו לשיער שומני","concept":"shampoo","kind":"oily"},
  {"name":"פנטן שמפו קלאסי 600 מ\"ל","concept":"shampoo","kind":null},
  {"name":"שמפו ומרכך 2 ב-1 לילדים","concept":"shampoo-conditioner-2in1"},
  {"name":"סרקל שמפו+מרכך 1 ליטר","concept":"shampoo-conditioner-2in1"},
  {"name":"קרמה מן שמפו וג'ל רחצה 2 ב 1 מועשר בחימר שחור","concept":"body-wash"},
  {"name":"מרכך שיער פנטן 400 מ\"ל","concept":"conditioner-hair"},
  {"name":"שמפו לכלבים ג'ל 500 מ\"ל","concept":null},
  {"name":"שמפו שמן זית 750 מ\"ל","concept":"shampoo"},
  {"name":"נקה 7 שמפו לחות מוגברת פרוטאין אורז וביוטין","concept":"shampoo"},
  {"name":"שמן זית כתית מעולה 750 מל","concept":"oil-olive"},
  {"name":"טקסטיל שמפו-שקית 1 ק","concept":"laundry-detergent-liquid","why":"cheapersal 7290000149943: מוצרי כביסה"},
  {"name":"בדין שמפו לכביסה עדינה 2 ליטר","concept":"laundry-detergent-liquid"},
  {"name":"סיף פנטסטיק שמפו רצפות 4 ליטר","concept":"floor-cleaner"},
  {"name":"שמפוזר קרבונה אדום","concept":"carpet-cleaner"},
  {"name":"סנו שמפו לניקוי שטיחים 600 מ\"ל","concept":"carpet-cleaner"},
  {"name":"אג'קס ספריי לניקוי חלונות ומשטחים","concept":"glass-cleaner","why":"guard: carpet pattern must not catch משטחים"},
  {"name":"דאב דאודורנט ספריי אורגינל לאשה 150 מל","concept":"deodorant","kind":"spray"},
  {"name":"דאב דאודורנט רולאון אסאי","concept":"deodorant","kind":"roll-on"},
  {"name":"דאודורנט סטיק אינווזיבל דריי 50 גרם","concept":"deodorant","kind":"stick"},
  {"name":"גילט דאודורנט ג'ל אלוורה","concept":"deodorant","kind":"gel"},
  {"name":"דאודורנט ספיד סטיק רגיל ירוק","concept":"deodorant","kind":"stick"},
  {"name":"דאו' ג'ל כחול ספיד סטיק","concept":"deodorant","kind":"gel"},
  {"name":"בוקז דאודורנט קרם 50מל","concept":"deodorant","kind":"cream"},
  {"name":"דאודרנט גל לגבר קרמ","concept":"deodorant","kind":"gel","why":"trailing קרמ = truncated קרמה brand"},
  {"name":"דאו רול אבן קריסטל לבנדר 90 מ\"ל LOVLIS","concept":"deodorant","kind":"crystal"},
  {"name":"סאן דאורדורנט אבן קריסטל לנערות","concept":"deodorant","kind":"crystal"},
  {"name":"דאודרנט קרמה רול און אפרסק 48 ש'","concept":"deodorant","kind":"roll-on"},
  {"name":"דאורדורנט ספריי לגבר","concept":"deodorant","kind":"spray"},
  {"name":"ברברי הירו דאוסטיק 75 גר","concept":"deodorant","kind":"stick","why":"chp 3614229820829: דאודורנט סטיק לגבר"},
  {"name":"סבוקלם דיילי דאו 70מל","concept":"deodorant","why":"chp 7290017012070: דאודורנט לגבר"},
  {"name":"דזיטול דאודורנט טקסטיל 500 מל","concept":null},
  {"name":"סבון הוואי רביעות דאודורנט 400 גר","concept":null},
  {"name":"זאדור פרפום דאו אשה100מ","concept":null},
  {"name":"רעננה קרם דאודורנט לכפות הרגליים","concept":null},
  {"name":"דאודורנט רול און 0% מלחי אלומיניום מלפפונים ותה ירוק","concept":"deodorant","kind":"roll-on"},
  {"name":"מלפפונים חמוצים במלח 1 ק\"ג","concept":"pickles"}
];

for (const t of CASES) {
  test(`assignConcept: "${t.name}" -> ${t.concept}${t.kind ? ' / kind ' + t.kind : ''}`, () => {
    const got = assignConcept(t.name, list);
    assert.equal(got, t.concept, t.name);
    if (t.kind) {
      const kinds = variantSignature(t.name, undefined, got).filter((x) => x.startsWith('kind:'));
      assert.deepEqual(kinds, ['kind:' + t.kind], t.name);
    }
  });
}

test('the shampoo leaves share the shampoo family and are missingOnly like the parent', () => {
  for (const id of ['shampoo', 'shampoo-antidandruff', 'shampoo-kids', 'shampoo-dry', 'shampoo-silver']) {
    const c = conceptById(id, list);
    assert.ok(c, `no concept ${id}`);
    assert.equal(resolveFamily(c, list).id, 'shampoo', id);
    assert.equal(conceptPolicy(id), 'missingOnly', id);
  }
});
