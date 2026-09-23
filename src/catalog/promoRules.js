/**
 * PromoFull / Promo files -> pricing rules, for every portal layout the chains publish.
 *
 * Two layouts exist (docs/PROMOS-AND-PRIVATE-LABEL.md §1.2):
 *   flat     Rami Levy, Keshet (publishedprices "Promo" schema): MinQty / DiscountedPrice / DiscountRate /
 *            RewardType sit on <Promotion>, the barcodes are <PromotionItems><Item>.
 *   grouped  Shufersal, Carrefour group, Yochananof, Victory, Tiv Taam, Hazi Hinam, Osher Ad, Shuk HaIr...:
 *            <Groups><Group><PromotionItems><PromotionItem> carries RewardType / MinQty / MaxQty /
 *            DiscountRate / DiscountedPrice PER BARCODE.
 *
 * Rule shapes (consumed by src/pricing/promotions.js):
 *   { type:'multi',      minQty:N, totalPrice:X }          N for X
 *   { type:'unit',       minQty:N, unitPrice:X }           discounted unit price (from N units)
 *   { type:'percent',    minQty:N, percent:P }
 *   { type:'bundleFree', minQty:N, freeQty:F }             "2+1": take N, F of them are free
 *   { type:'second',     minQty:2, percent:P }             second unit at P% off
 *   { type:'qtyPrice',   minQty:N, price:X }               N units cost X - total or per unit? resolved against the
 *                                                          shelf price in buildCatalogFromFiles (grouped layout only)
 * Every rule may carry maxQty (units the promo applies to): from an explicit "מוגבל N" / MaxQty field
 * when present, else derived from <RedemptionLimit> (Carrefour national-basket prices: no maxQty text,
 * RedemptionLimit redemptions × the rule's unit quantity - 1 unit for unit/percent/discount, minQty for
 * multi/bundleFree/second/qtyPrice). Flags added when attached to a catalog item: club, validTo,
 * promotionId, description.
 */

const RE = {
  // "2 ב-20", "2ב20", "3 יח' ב 10", "2 יח ב-12 ש"ח". Not preceded by a digit or dot (sizes like "1.5% ב-12.90").
  multi: /(?<![\d.])(\d{1,2})\s*(?:יח['"׳]?\s*)?ב-?\s*(\d+(?:[.,]\d+)?)(?!\s*%)/,
  // "2 ק"ג ב-65", "3 קילו ב 66" (weighted items: N kilograms for X)
  kg: /(?<![\d.])(\d{1,2})\s*(?:ק"ג|ק״ג|קג|קילו)\s*ב-?\s*(\d+(?:[.,]\d+)?)/,
  // "2+1", "1+1 מתנה", "3+1"
  plus: /(?<![\d.*x×])(\d)\s*\+\s*(\d)(?![\d.])/,
  // "השני ב-50%", "שני בINGLOT- 50%", "השני בחצי מחיר"
  secondPct: /שני\s*ב.{0,25}?(\d{1,2})\s*%/,
  secondHalf: /שני\s*ב\s*חצי/,
  // "20% הנחה", "הנחה של 30%", "הנחה DM 10%", "ב30% הנחה"
  percent: /(\d{1,2}(?:\.\d)?)\s*%\s*הנחה|הנחה\b.{0,12}?(\d{1,2}(?:\.\d)?)\s*%/,
  // "מוגבל 3", "מוג 2", "עד 4 יח"
  maxQty: /(?:מוג(?:בל)?|עד)\s*(?:ל-?)?\s*(\d)\b/,
  // Promotions that are not a shelf price: coupons, vouchers, delivery, gifts, id-card, minimum purchase, cards.
  skip: /קופון|שובר|משלוח|תעוד|תעדה|ת"ז|הצגת|קבל|מתנה|W ?CARD|יום הולדת|אשראי|מעל\s*\d|SBOX|פקדון בלבד|החזר/,
};

/** Per-chain quirks. `clubs`: clubId -> label, or null to drop the promotion entirely (employees-only etc.). */
export const PROFILES = {
  default: { clubLabel: 'מועדון', clubs: {} },
  shufersal: { clubLabel: 'מועדון שופרסל', clubs: {} },
  tivtaam: { clubLabel: 'מועדון טיב טעם', clubs: { 1: 'המועדון החדש' } },
  keshet: { clubLabel: 'מועדון קשת', clubs: {} },
  victory: { clubLabel: 'מועדון ויקטורי', clubs: {} },
  carrefour: { clubLabel: 'מועדון קרפור', clubs: {} },
  ramilevy: { clubLabel: 'מועדון רמי לוי', clubs: {} },
  yochananof: { clubLabel: 'מועדון יוחננוף', clubs: { 1: null } },   // 1 = מועדון עובדים
  yochananof_b: { clubLabel: 'מועדון יוחננוף', clubs: { 1: null } },
  mck: { clubLabel: 'מועדון מחסני השוק', clubs: { 1: null } },        // 1 = עובדים / W CARD
};

export function profileFor(chainId) {
  return { ...PROFILES.default, ...(PROFILES[chainId] ?? {}) };
}

// ------------------------------------------------------------------ tiny XML helpers (files are flat, no attributes matter)

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(text) {
  const t = String(text).trim();
  const cdata = t.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) return cdata[1];
  return t.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e) => {
    if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(c) ? String.fromCodePoint(c) : m; }
    return e in ENTITIES ? ENTITIES[e] : m;
  });
}

function blocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function stripBlocks(xml, tag) {
  return xml.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
}

function fields(block) {
  const out = {};
  const re = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([^<]*)<\/\1\s*>/g;
  let m;
  while ((m = re.exec(block))) { const k = m[1].toLowerCase(); if (!(k in out)) out[k] = decode(m[2]); }
  return out;
}

const get = (f, ...names) => { for (const n of names) { const v = f[n.toLowerCase()]; if (v !== undefined && v !== '') return v; } return null; };
const num = (v) => { if (v == null) return null; const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const isoDate = (v) => { const m = String(v ?? '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

/** Today's date in Israel as YYYY-MM-DD (the files are in local time). */
export function israelDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** "0 - כלל הלקוחות" -> 0, "(2=מועדון קרפור אשראי|2=מועדון אפליקציה)" -> 2, "3 - מועדון..." -> 3 */
function clubIdOf(text) {
  const m = String(text ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// ------------------------------------------------------------------ rule derivation

/**
 * One rule from the numeric fields of a promotion (flat) or of a single PromotionItem (grouped), plus the description.
 * `layout` 'flat' means DiscountedPrice for MinQty>1 is the bundle total (Rami Levy "2 ב-20"); 'grouped' leaves the
 * ambiguity to the shelf price (type qtyPrice).
 */
export function deriveRule({ rewardType = null, minQty = null, maxQty = null, discountRate = null, discountedPrice = null, discountedPricePerMida = null, description = '', isWeighted = false, layout = 'grouped', redemptionLimit = null }) {
  const text = String(description ?? '');
  const rt = rewardType == null ? null : Number(rewardType);
  const weighted = isWeighted || (minQty != null && minQty > 0 && minQty < 1) || (minQty != null && !Number.isInteger(minQty));
  let qty = minQty != null && minQty > 0 ? minQty : 1;
  if (weighted) qty = 1;
  const cap = maxQty && maxQty > 0 ? maxQty : (text.match(RE.maxQty)?.[1] ? parseInt(text.match(RE.maxQty)[1], 10) : null);
  // No explicit maxQty (text or field): fall back to RedemptionLimit × the rule's unit quantity - 1 unit
  // per redemption for unit/percent/discount rules, minQty units per redemption for a bundle
  // (multi/bundleFree/second/qtyPrice). Carrefour publishes its national-basket prices this way
  // (RedemptionLimit on the promotion, no "מוגבל" text) - PIPELINE-CONTRACT.md §2.2.
  const limit = Number.isInteger(redemptionLimit) && redemptionLimit > 0 ? redemptionLimit : null;
  const withCap = (rule) => {
    if (cap) return { ...rule, maxQty: cap };
    if (limit) {
      const perRedemption = ['multi', 'bundleFree', 'second', 'qtyPrice'].includes(rule.type) ? rule.minQty : 1;
      return { ...rule, maxQty: limit * perRedemption };
    }
    return rule;
  };
  const price = discountedPrice != null && discountedPrice > 0 ? discountedPrice : null;
  let rate = discountRate != null && discountRate > 0 ? discountRate : null;
  if (rate != null && rate > 100) rate = rate / 100; // tenths of a percent (Keshet 7000 = 70%)
  if (rate != null && rate > 100) rate = null;

  // Weighted items (price per kg). "2 ק"ג ב-65" = 32.5/kg from 2 kg; DiscountedPricePerMida is the per-kg price when
  // it agrees with MinQty × DiscountedPrice (Yochananof: MinQty 1.9, 61.75, PerMida 32.5).
  const kg = text.match(RE.kg);
  if (kg && !RE.skip.test(text)) {
    const n = parseInt(kg[1], 10), total = parseFloat(kg[2].replace(',', '.'));
    if (n >= 1 && total > 0) return withCap({ type: 'unit', minQty: n, unitPrice: Math.round((total / n) * 100) / 100, perKg: true });
  }
  if (weighted) {
    if (RE.skip.test(text)) return null;
    const perMida = discountedPricePerMida != null && discountedPricePerMida > 0 ? discountedPricePerMida : null;
    if (perMida && minQty >= 1 && price && Math.abs(perMida * minQty - price) < 0.05) return withCap({ type: 'unit', minQty, unitPrice: perMida, perKg: true });
    if (price) return withCap({ type: 'unit', minQty: 0, unitPrice: price, perKg: true });
    const pctW = text.match(RE.percent);
    if (pctW) return withCap({ type: 'percent', minQty: 0, percent: parseFloat(pctW[1] ?? pctW[2]) });
    if (rate != null && (rt === 2 || rt == null)) return withCap({ type: 'percent', minQty: 0, percent: rate });
    return null;
  }

  // "2+1" style: the description is the only place the free count is written.
  const plus = text.match(RE.plus);
  if (plus) {
    const pay = parseInt(plus[1], 10), free = parseInt(plus[2], 10);
    if (pay >= 1 && free >= 1 && pay + free <= 8) return withCap({ type: 'bundleFree', minQty: pay + free, freeQty: free });
  }
  // second unit at P% off
  const second = text.match(RE.secondPct);
  if (second) return withCap({ type: 'second', minQty: 2, percent: parseInt(second[1], 10) });
  if (RE.secondHalf.test(text)) return withCap({ type: 'second', minQty: 2, percent: 50 });

  if (RE.skip.test(text)) return null;
  if (rt === 12 || rt === 6) return null; // coupons / gifts (grouped layout)
  if (rate != null && rate >= 100 && !price) return null; // "free" without a bundle description = gift

  const multi = text.match(RE.multi);
  const multiN = multi ? parseInt(multi[1], 10) : null;
  const multiTotal = multi ? parseFloat(multi[2].replace(',', '.')) : null;
  const textAgrees = multi && (minQty == null || multiN === qty);

  if (qty > 1) {
    if (textAgrees && multiN > 1) return withCap({ type: 'multi', minQty: multiN, totalPrice: price ?? multiTotal });
    if (price != null) {
      if (RE.percent.test(text)) return withCap({ type: 'unit', minQty: qty, unitPrice: price }); // "בקניית 2 ... 20% הנחה" - price is per unit
      if (layout === 'flat') return withCap({ type: 'multi', minQty: qty, totalPrice: price });
      return withCap({ type: 'qtyPrice', minQty: qty, price });
    }
    if (rate != null && (rt === 2 || rt == null || RE.percent.test(text))) return withCap({ type: 'percent', minQty: qty, percent: rate });
    const pctN = text.match(RE.percent);
    if (pctN) return withCap({ type: 'percent', minQty: qty, percent: parseFloat(pctN[1] ?? pctN[2]) });
    return null;
  }

  // qty == 1
  if (textAgrees && multiN > 1 && minQty == null) return withCap({ type: 'multi', minQty: multiN, totalPrice: price ?? multiTotal });
  if (price != null) return withCap({ type: 'unit', minQty: 1, unitPrice: price });
  const pct = text.match(RE.percent);
  if (pct) return withCap({ type: 'percent', minQty: 1, percent: parseFloat(pct[1] ?? pct[2]) });
  if (rate != null && (rt === 2 || rt == null)) return withCap({ type: 'percent', minQty: 1, percent: rate });
  return null;
}

// ------------------------------------------------------------------ file parsing

/**
 * Parse a PromoFull / Promo file.
 * Returns { chainId, storeId, layout, promotions:[...], stats }.
 * promotion = { id, description, startDate, endDate, rewardType, clubId, club, clubLabel, coupon, active, skipped,
 *               items:[{ code, rule }], itemCodes, rule }   (`rule` = the first item's rule, for flat-layout callers)
 * `skipped` is null or a reason: 'coupon' | 'inactive' | 'expired' | 'future' | 'club-excluded' | 'min-purchase' | 'no-items' | 'unparsed'
 */
export function parsePromoFile(xml, { chainId = null, now = new Date(), includeExpired = false } = {}) {
  const profile = profileFor(chainId);
  const today = israelDate(now);
  const layout = /<PromotionItem>/i.test(xml) ? 'grouped' : 'flat';
  const head = fields(xml.slice(0, Math.min(xml.length, 4000)));
  const stats = { promotions: 0, active: 0, club: 0, skipped: {}, parsed: 0, unparsed: 0, itemRules: 0, unparsedByRewardType: {} };
  const bump = (reason) => { stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1; };

  const promotions = blocks(xml, 'Promotion').map((block) => {
    stats.promotions++;
    const itemsXml = layout === 'grouped' ? blocks(block, 'PromotionItems').join('') : blocks(block, 'PromotionItems').join('');
    const groupXml = blocks(block, 'Groups').join('');
    const own = fields(stripBlocks(stripBlocks(block, 'PromotionItems'), 'Groups') + stripBlocks(groupXml, 'PromotionItems'));
    const description = get(own, 'PromotionDescription', 'Description') ?? '';
    const startDate = isoDate(get(own, 'PromotionStartDate', 'PromotionStartDateTime'));
    const endDate = isoDate(get(own, 'PromotionEndDate', 'PromotionEndDateTime'));
    const coupon = String(get(own, 'AdditionalIsCoupon') ?? '0') === '1';
    const inactive = String(get(own, 'AdditionalIsActive') ?? '1') === '0';
    const minPurchase = num(get(own, 'MinPurchaseAmount'));
    const clubIds = layout === 'flat'
      ? blocks(block, 'Clubs').join('').match(/<ClubId>([^<]*)/gi)?.map((s) => clubIdOf(s.replace(/<ClubId>/i, ''))) ?? [clubIdOf(get(own, 'ClubId'))]
      : [clubIdOf(get(own, 'ClubID', 'ClubId'))];
    const clubId = clubIds.find((c) => c !== 0) ?? 0;
    const club = clubId !== 0;
    const clubLabel = club ? (profile.clubs[clubId] === undefined ? profile.clubLabel : profile.clubs[clubId]) : null;
    const rewardType = num(get(own, 'RewardType'));

    let skipped = null;
    if (coupon) skipped = 'coupon';
    else if (inactive) skipped = 'inactive';
    else if (club && clubLabel === null) skipped = 'club-excluded';
    else if (minPurchase != null && minPurchase > 0) skipped = 'min-purchase';
    else if (!includeExpired && endDate && endDate < today) skipped = 'expired';
    else if (!includeExpired && startDate && startDate > today) skipped = 'future';

    const redemptionLimit = num(get(own, 'RedemptionLimit'));
    let items = [];
    if (!skipped) {
      if (layout === 'flat') {
        const rule = deriveRule({ rewardType, minQty: num(get(own, 'MinQty')), maxQty: num(get(own, 'MaxQty', 'MAXQTY')), discountRate: num(get(own, 'DiscountRate')), discountedPrice: num(get(own, 'DiscountedPrice')), description, layout, redemptionLimit });
        items = blocks(itemsXml, 'Item').map(fields).filter((f) => String(get(f, 'IsGiftItem') ?? '0') !== '1').map((f) => ({ code: String(get(f, 'ItemCode') ?? '').trim(), rule })).filter((i) => i.code);
        if (rule == null) { stats.unparsedByRewardType[rewardType ?? '?'] ??= { n: 0, samples: [] }; const u = stats.unparsedByRewardType[rewardType ?? '?']; u.n++; if (u.samples.length < 3) u.samples.push(description); }
      } else {
        items = blocks(itemsXml, 'PromotionItem').map(fields).map((f) => {
          const code = String(get(f, 'ItemCode') ?? '').trim();
          const rt = num(get(f, 'RewardType'));
          const rule = deriveRule({ rewardType: rt, minQty: num(get(f, 'MinQty')), maxQty: num(get(f, 'MaxQty')), discountRate: num(get(f, 'DiscountRate')), discountedPrice: num(get(f, 'DiscountedPrice')), discountedPricePerMida: num(get(f, 'DiscountedPricePerMida')), description, isWeighted: String(get(f, 'bIsWeighted') ?? '0') === '1', layout, redemptionLimit });
          if (rule == null) { const k = rt ?? '?'; stats.unparsedByRewardType[k] ??= { n: 0, samples: [] }; stats.unparsedByRewardType[k].n++; if (stats.unparsedByRewardType[k].samples.length < 3 && !stats.unparsedByRewardType[k].samples.includes(description)) stats.unparsedByRewardType[k].samples.push(description); }
          return { code, rule };
        }).filter((i) => i.code);
      }
      if (!items.length) skipped = 'no-items';
      else if (items.every((i) => i.rule == null)) skipped = 'unparsed';
    }
    if (skipped) bump(skipped);
    else { stats.active++; if (club) stats.club++; stats.parsed++; stats.itemRules += items.filter((i) => i.rule).length; }
    if (skipped === 'unparsed') stats.unparsed++;

    const withRules = items.filter((i) => i.rule);
    return {
      id: get(own, 'PromotionId', 'PromotionID'),
      description, startDate, endDate, rewardType, clubId, club, clubLabel, coupon, active: !skipped, skipped,
      items: skipped ? [] : withRules,
      itemCodes: (skipped ? [] : withRules).map((i) => i.code),
      rule: skipped ? null : (withRules[0]?.rule ?? null),
    };
  });

  return { chainId: get(head, 'ChainId'), storeId: get(head, 'StoreId'), layout, promotions, stats };
}

/**
 * Resolve a rule against the item's shelf price and add the display flags.
 * qtyPrice: if the price is at least the shelf price it is the bundle total ("2 ב-16" when a unit costs 10);
 * otherwise it is the discounted unit price from minQty units. Returns null when it cannot be resolved.
 */
export function attachRule(rule, promo, shelfPrice, { isWeighted = null } = {}) {
  let r = rule;
  if (r.perKg) {
    if (isWeighted === false) return null;
    const { perKg, ...rest } = r; r = rest;
  }
  if (r.type === 'qtyPrice') {
    if (shelfPrice == null || shelfPrice <= 0) return null;
    r = r.price >= shelfPrice - 0.005
      ? { type: 'multi', minQty: r.minQty, totalPrice: r.price, ...(r.maxQty ? { maxQty: r.maxQty } : {}) }
      : { type: 'unit', minQty: r.minQty, unitPrice: r.price, ...(r.maxQty ? { maxQty: r.maxQty } : {}) };
  }
  // A "discount" that is not cheaper than the shelf price is noise (stale files, deposit quirks).
  if (shelfPrice != null && shelfPrice > 0) {
    if (r.type === 'unit' && r.unitPrice >= shelfPrice - 0.005) return null;
    if (r.type === 'multi' && r.totalPrice >= shelfPrice * r.minQty - 0.005) return null;
  }
  return { ...r, club: !!promo.club, ...(promo.clubLabel ? { clubLabel: promo.clubLabel } : {}), validTo: promo.endDate ?? null, promotionId: promo.id ?? null, description: promo.description };
}
