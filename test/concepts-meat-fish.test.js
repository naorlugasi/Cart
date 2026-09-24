import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConcepts, assignConcept } from '../src/catalog/concepts.js';

// Meat-fish concept round, 24.9: one capture case and one near-miss refusal per new concept
// added in config/concepts/meat-fish.json this round (see the round notes in the commit message
// for the LOST-column accounting). The refusal is the one that actually holds the rule up -
// see .claude/skills/taxonomy/TRAPS.md.

const concepts = loadConcepts();

test('chicken-breast captures a real chicken breast listing', () => {
  assert.equal(assignConcept('חזה עוף טרי ארוז', concepts), 'chicken-breast');
});

test('chicken-breast refuses its near-miss', () => {
  assert.notEqual(assignConcept('חזה הודו טרי עטרה', concepts), 'chicken-breast');
});

test('chicken-drumstick captures a real chicken drumstick listing', () => {
  assert.equal(assignConcept('שוקיים עוף טרי', concepts), 'chicken-drumstick');
});

test('chicken-drumstick refuses its near-miss', () => {
  assert.notEqual(assignConcept('שוקיים הודו טרי', concepts), 'chicken-drumstick');
});

test('chicken-wings captures a real chicken wings listing', () => {
  assert.equal(assignConcept('כנפיים עוף טרי', concepts), 'chicken-wings');
});

test('chicken-wings refuses its near-miss', () => {
  assert.notEqual(assignConcept('כנפיים הודו טרי', concepts), 'chicken-wings');
});

test('chicken-leg captures a real chicken leg listing', () => {
  assert.equal(assignConcept('כרעיים עוף קפוא', concepts), 'chicken-leg');
});

test('chicken-leg refuses its near-miss', () => {
  assert.notEqual(assignConcept('כרעיים מחפוד טרי אר', concepts), 'chicken-leg');
});

test('chicken-thigh captures a real chicken thigh listing', () => {
  assert.equal(assignConcept('ירכיים עוף טרי', concepts), 'chicken-thigh');
});

test('chicken-thigh refuses its near-miss', () => {
  assert.notEqual(assignConcept('חזה עוף טרי', concepts), 'chicken-thigh');
});

test('chicken-thigh-fillet captures a real chicken thigh fillet listing', () => {
  assert.equal(assignConcept('פרגית לתנור עם עצם', concepts), 'chicken-thigh-fillet');
});

test('chicken-thigh-fillet refuses its near-miss', () => {
  assert.notEqual(assignConcept('נקניקיות פרגית 600 גר', concepts), 'chicken-thigh-fillet');
});

test('chicken-liver captures a real chicken liver listing', () => {
  assert.equal(assignConcept('כבד עוף טרי', concepts), 'chicken-liver');
});

test('chicken-liver refuses its near-miss', () => {
  assert.notEqual(assignConcept('כבד הודו טרי', concepts), 'chicken-liver');
});

test('chicken-gizzard captures a real chicken gizzard listing', () => {
  assert.equal(assignConcept('קורקבן עוף טרי', concepts), 'chicken-gizzard');
});

test('chicken-gizzard refuses its near-miss', () => {
  assert.notEqual(assignConcept('קורקבן הודו טרי', concepts), 'chicken-gizzard');
});

test('chicken-neck captures a real chicken neck listing', () => {
  assert.equal(assignConcept('גרון עוף טרי', concepts), 'chicken-neck');
});

test('chicken-neck refuses its near-miss', () => {
  assert.notEqual(assignConcept('גרון הודו טרי', concepts), 'chicken-neck');
});

test('chicken-heart captures a real chicken heart listing', () => {
  assert.equal(assignConcept('לבבות עוף טרי', concepts), 'chicken-heart');
});

test('chicken-heart refuses its near-miss', () => {
  assert.notEqual(assignConcept('לבבות הודו טרי', concepts), 'chicken-heart');
});

test('chicken-spleen captures a real chicken spleen listing', () => {
  assert.equal(assignConcept('טחול עוף טרי', concepts), 'chicken-spleen');
});

test('chicken-spleen refuses its near-miss', () => {
  assert.notEqual(assignConcept('כבד עוף טרי', concepts), 'chicken-spleen');
});

test('chicken-bones captures a real chicken bones listing', () => {
  assert.equal(assignConcept('עצמות עוף טרי עטרה', concepts), 'chicken-bones');
});

test('chicken-bones refuses its near-miss', () => {
  assert.notEqual(assignConcept('כנפיים עוף טרי', concepts), 'chicken-bones');
});

test('chicken-nuggets captures a real chicken nuggets listing', () => {
  assert.equal(assignConcept('נגיסי עוף עטרה 600 ג', concepts), 'chicken-nuggets');
});

test('chicken-nuggets refuses its near-miss', () => {
  assert.notEqual(assignConcept('נגיסי דג אמנון בציפוי פירורי לחם 600 גרם רוזנרס', concepts), 'chicken-nuggets');
});

test('chicken-whole captures a real chicken whole listing', () => {
  assert.equal(assignConcept('עוף שלם טרי עטרה', concepts), 'chicken-whole');
});

test('chicken-whole refuses its near-miss', () => {
  assert.notEqual(assignConcept('שוקיים עוף טרי', concepts), 'chicken-whole');
});

test('turkey-breast captures a real turkey breast listing', () => {
  assert.equal(assignConcept('חזה הודו טרי עטרה', concepts), 'turkey-breast');
});

test('turkey-breast refuses its near-miss', () => {
  assert.notEqual(assignConcept('חזה עוף טרי ארוז', concepts), 'turkey-breast');
});

test('turkey-drumstick captures a real turkey drumstick listing', () => {
  assert.equal(assignConcept('שוקיים הודו טרי עטרה', concepts), 'turkey-drumstick');
});

test('turkey-drumstick refuses its near-miss', () => {
  assert.notEqual(assignConcept('שוקיים עוף טרי', concepts), 'turkey-drumstick');
});

test('turkey-wings captures a real turkey wings listing', () => {
  assert.equal(assignConcept('כנפיים הודו טרי עטרה', concepts), 'turkey-wings');
});

test('turkey-wings refuses its near-miss', () => {
  assert.notEqual(assignConcept('כנפיים עוף טרי', concepts), 'turkey-wings');
});

test('turkey-liver captures a real turkey liver listing', () => {
  assert.equal(assignConcept('כבד הודו טרי ארוז עצמי', concepts), 'turkey-liver');
});

test('turkey-liver refuses its near-miss', () => {
  assert.notEqual(assignConcept('כבד עוף טרי', concepts), 'turkey-liver');
});

test('turkey-gizzard captures a real turkey gizzard listing', () => {
  assert.equal(assignConcept('קורקבן הודו טרי א.עצמי', concepts), 'turkey-gizzard');
});

test('turkey-gizzard refuses its near-miss', () => {
  assert.notEqual(assignConcept('קורקבן עוף טרי', concepts), 'turkey-gizzard');
});

test('turkey-neck captures a real turkey neck listing', () => {
  assert.equal(assignConcept('גרון הודו טרי מחפוד', concepts), 'turkey-neck');
});

test('turkey-neck refuses its near-miss', () => {
  assert.notEqual(assignConcept('גרון עוף טרי', concepts), 'turkey-neck');
});

test('turkey-heart captures a real turkey heart listing', () => {
  assert.equal(assignConcept('לבבות הודו טרי', concepts), 'turkey-heart');
});

test('turkey-heart refuses its near-miss', () => {
  assert.notEqual(assignConcept('לבבות עוף טרי', concepts), 'turkey-heart');
});

test('turkey-shank captures a real turkey shank listing', () => {
  assert.equal(assignConcept('שוק הודו מפורק טרי', concepts), 'turkey-shank');
});

test('turkey-shank refuses its near-miss', () => {
  assert.notEqual(assignConcept('שוק טלה טרי עם עצם', concepts), 'turkey-shank');
});

test('turkey-cuts captures a real turkey cuts listing', () => {
  assert.equal(assignConcept('נתחי הודו טרי ארוז עצמי', concepts), 'turkey-cuts');
});

test('turkey-cuts refuses its near-miss', () => {
  assert.notEqual(assignConcept('נתחי סלמון טרי שופרסל לק', concepts), 'turkey-cuts');
});

test('beef-cut-numbered captures a real beef cut numbered listing', () => {
  assert.equal(assignConcept('בשר מס 5 חלק קפוא', concepts), 'beef-cut-numbered');
});

test('beef-cut-numbered refuses its near-miss', () => {
  assert.notEqual(assignConcept('בשר ראש חלק קפוא', concepts), 'beef-cut-numbered');
});

test('beef-head-meat captures a real beef head meat listing', () => {
  assert.equal(assignConcept('בשר ראש חלק קפוא', concepts), 'beef-head-meat');
});

test('beef-head-meat refuses its near-miss', () => {
  assert.notEqual(assignConcept('בשר מס 5 חלק קפוא', concepts), 'beef-head-meat');
});

test('beef-cholent captures a real beef cholent listing', () => {
  assert.equal(assignConcept('בשר לחמין 100% אחדות', concepts), 'beef-cholent');
});

test('beef-cholent refuses its near-miss', () => {
  assert.notEqual(assignConcept('בשר מס 5 חלק קפוא', concepts), 'beef-cholent');
});

test('beef-mock-fillet captures a real beef mock fillet listing', () => {
  assert.equal(assignConcept('פילה מדומה בקר טרי עטרה', concepts), 'beef-mock-fillet');
});

test('beef-mock-fillet refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה מדומה טרי אדום', concepts), 'beef-mock-fillet');
});

test('lamb-shoulder captures a real lamb shoulder listing', () => {
  assert.equal(assignConcept('כתף טלה טרי', concepts), 'lamb-shoulder');
});

test('lamb-shoulder refuses its near-miss', () => {
  assert.notEqual(assignConcept('כתף בקר מעובד מופשר', concepts), 'lamb-shoulder');
});

test('lamb-shank captures a real lamb shank listing', () => {
  assert.equal(assignConcept('שוק טלה טרי עם עצם', concepts), 'lamb-shank');
});

test('lamb-shank refuses its near-miss', () => {
  assert.notEqual(assignConcept('שוק הודו מפורק טרי', concepts), 'lamb-shank');
});

test('lamb-fat captures a real lamb fat listing', () => {
  assert.equal(assignConcept('שומן כבש 200 גרם חלק', concepts), 'lamb-fat');
});

test('lamb-fat refuses its near-miss', () => {
  assert.notEqual(assignConcept('פטה כבשים פיראוס 5% שומן 250 גרם', concepts), 'lamb-fat');
});

test('lamb-quarter captures a real lamb quarter listing', () => {
  assert.equal(assignConcept('רבע טלה טרי חלק', concepts), 'lamb-quarter');
});

test('lamb-quarter refuses its near-miss', () => {
  assert.notEqual(assignConcept('רבע פיצה משפחתית', concepts), 'lamb-quarter');
});

test('amnon-whole captures a real amnon whole listing', () => {
  assert.equal(assignConcept('אמנון שלם טרי נקי', concepts), 'amnon-whole');
});

test('amnon-whole refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה אמנון 5-7 קפוא', concepts), 'amnon-whole');
});

test('amnon-fillet captures a real amnon fillet listing', () => {
  assert.equal(assignConcept('פילה אמנון 5-7 100%', concepts), 'amnon-fillet');
});

test('amnon-fillet refuses its near-miss', () => {
  assert.notEqual(assignConcept('אמנון שלם טרי נקי', concepts), 'amnon-fillet');
});

test('mullet-whole captures a real mullet whole listing', () => {
  assert.equal(assignConcept('בורי שלם טרי', concepts), 'mullet-whole');
});

test('mullet-whole refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה בורי טרי', concepts), 'mullet-whole');
});

test('mullet-fillet captures a real mullet fillet listing', () => {
  assert.equal(assignConcept('פילה בורי טרי', concepts), 'mullet-fillet');
});

test('mullet-fillet refuses its near-miss', () => {
  assert.notEqual(assignConcept('בורי שלם טרי', concepts), 'mullet-fillet');
});

test('denis-whole captures a real denis whole listing', () => {
  assert.equal(assignConcept('דניס שלם טרי', concepts), 'denis-whole');
});

test('denis-whole refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה דניס טרי', concepts), 'denis-whole');
});

test('denis-fillet captures a real denis fillet listing', () => {
  assert.equal(assignConcept('פילה דניס טרי', concepts), 'denis-fillet');
});

test('denis-fillet refuses its near-miss', () => {
  assert.notEqual(assignConcept('דניס שלם טרי', concepts), 'denis-fillet');
});

test('lavrak-whole captures a real lavrak whole listing', () => {
  assert.equal(assignConcept('לברק טרי נקי', concepts), 'lavrak-whole');
});

test('lavrak-whole refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה לברק 5-7', concepts), 'lavrak-whole');
});

test('lavrak-fillet captures a real lavrak fillet listing', () => {
  assert.equal(assignConcept('פילה לברק 5-7', concepts), 'lavrak-fillet');
});

test('lavrak-fillet refuses its near-miss', () => {
  assert.notEqual(assignConcept('לברק טרי נקי', concepts), 'lavrak-fillet');
});

test('bass-whole captures a real bass whole listing', () => {
  assert.equal(assignConcept('דג בס גדול טרי קג', concepts), 'bass-whole');
});

test('bass-whole refuses its near-miss', () => {
  assert.notEqual(assignConcept('יין סוביניון בלאן בס', concepts), 'bass-whole');
});

test('bass-fillet captures a real bass fillet listing', () => {
  assert.equal(assignConcept('פילה דג בס טרי ק"ג', concepts), 'bass-fillet');
});

test('bass-fillet refuses its near-miss', () => {
  assert.notEqual(assignConcept('דג בס גדול טרי קג', concepts), 'bass-fillet');
});

test('redmullet captures a real redmullet listing', () => {
  assert.equal(assignConcept('פילה ברבוניה 400 גר', concepts), 'redmullet');
});

test('redmullet refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה בורי טרי', concepts), 'redmullet');
});

test('barramundi captures a real barramundi listing', () => {
  assert.equal(assignConcept('דג ברמונדי טרי', concepts), 'barramundi');
});

test('barramundi refuses its near-miss', () => {
  assert.notEqual(assignConcept('דג בורי טרי גדול', concepts), 'barramundi');
});

test('carp captures a real carp listing', () => {
  assert.equal(assignConcept('דג קרפיון טרי', concepts), 'carp');
});

test('carp refuses its near-miss', () => {
  assert.notEqual(assignConcept('דג בורי טרי גדול', concepts), 'carp');
});

test('sole captures a real sole listing', () => {
  assert.equal(assignConcept('פילה סול פוטית אירופ', concepts), 'sole');
});

test('sole refuses its near-miss', () => {
  assert.notEqual(assignConcept('סול כרומיום פיקולינט500מ', concepts), 'sole');
});

test('mackerel captures a real mackerel listing', () => {
  assert.equal(assignConcept('פילה מקרל בשמן סויה', concepts), 'mackerel');
});

test('mackerel refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה סלמון טרי', concepts), 'mackerel');
});

test('nile-perch captures a real nile perch listing', () => {
  assert.equal(assignConcept('פילה נסיכת הנילוס טרי', concepts), 'nile-perch');
});

test('nile-perch refuses its near-miss', () => {
  assert.notEqual(assignConcept('סליים קריסטל נסיכה', concepts), 'nile-perch');
});

test('mockfish-fillet captures a real mockfish fillet listing', () => {
  assert.equal(assignConcept('פילה מדומה טרי אדום', concepts), 'mockfish-fillet');
});

test('mockfish-fillet refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה מדומה בקר טרי עטרה', concepts), 'mockfish-fillet');
});

test('salmon-frozen captures a real salmon frozen listing', () => {
  assert.equal(assignConcept('פילה סלמון טרי שלם', concepts), 'salmon-frozen');
});

test('salmon-frozen refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה סלמון טרי', concepts), 'salmon-frozen');
});

test('salmon-portions captures a real salmon portions listing', () => {
  assert.equal(assignConcept('מנות סלמון ללא עור', concepts), 'salmon-portions');
});

test('salmon-portions refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה סלמון טרי', concepts), 'salmon-portions');
});

test('salmon-cuts captures a real salmon cuts listing', () => {
  assert.equal(assignConcept('נתחי פילה סלמון טרי', concepts), 'salmon-cuts');
});

test('salmon-cuts refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה סלמון טרי', concepts), 'salmon-cuts');
});

test('surimi captures a real surimi listing', () => {
  assert.equal(assignConcept('נתחי סורימי 200 גר', concepts), 'surimi');
});

test('surimi refuses its near-miss', () => {
  assert.notEqual(assignConcept('פילה סלמון טרי', concepts), 'surimi');
});

test('mussel-meat captures a real mussel meat listing', () => {
  assert.equal(assignConcept('בשר מולים 500 גר', concepts), 'mussel-meat');
});

test('mussel-meat refuses its near-miss', () => {
  assert.notEqual(assignConcept('בשר מס 5 חלק קפוא', concepts), 'mussel-meat');
});

test('fish-roe captures a real fish roe listing', () => {
  assert.equal(assignConcept('ביצי דג אדום בצנצנת 200 גרם', concepts), 'fish-roe');
});

test('fish-roe refuses its near-miss', () => {
  assert.notEqual(assignConcept('ביצי דג פורל גולד 20', concepts), 'fish-roe');
});

test('breaded-fish-fingers captures a real breaded fish fingers listing', () => {
  assert.equal(assignConcept('אצבעות דג בציפוי 700 ג רמילוי', concepts), 'breaded-fish-fingers');
});

test('breaded-fish-fingers refuses its near-miss', () => {
  assert.notEqual(assignConcept('אצבעות עוף בציפוי פי', concepts), 'breaded-fish-fingers');
});

test('liver-pate captures a real liver pate listing', () => {
  assert.equal(assignConcept('ממרח כבד ביתי 200 גר', concepts), 'liver-pate');
});

test('liver-pate refuses its near-miss', () => {
  assert.notEqual(assignConcept('כבד עוף טרי', concepts), 'liver-pate');
});

test('pate-fish captures a real pate fish listing', () => {
  assert.equal(assignConcept('ממרח דג סלמון המה 100 גר', concepts), 'pate-fish');
});

test('pate-fish refuses its near-miss', () => {
  assert.notEqual(assignConcept('ממרח דג טונה המה 100 גר', concepts), 'pate-fish');
});

test('kreplach captures a real kreplach listing', () => {
  assert.equal(assignConcept('קרפלך במילוי בשר', concepts), 'kreplach');
});

test('kreplach refuses its near-miss', () => {
  assert.notEqual(assignConcept('כיסונים במילוי בשר ב', concepts), 'kreplach');
});

test('kishke captures a real kishke listing', () => {
  assert.equal(assignConcept('קישקע גלאט עוף 600 ג', concepts), 'kishke');
});

test('kishke refuses its near-miss', () => {
  assert.notEqual(assignConcept('קרפלך במילוי בשר', concepts), 'kishke');
});

test('veggie-meat-chunks captures a real veggie meat chunks listing', () => {
  assert.equal(assignConcept('צאנק - בשר מפורק מן הצומח ברבקיו קוריאנ', concepts), 'veggie-meat-chunks');
});

test('veggie-meat-chunks refuses its near-miss', () => {
  assert.notEqual(assignConcept('בשר לחמין 100% אחדות', concepts), 'veggie-meat-chunks');
});
