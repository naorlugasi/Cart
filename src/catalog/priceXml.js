/**
 * Parser for Israeli "price transparency" (חוק שקיפות מחירים) XML files.
 *
 * The files are flat: a header (ChainId / StoreId / ...) followed by an
 * <Items> (or <Products>) list of <Item> elements with simple text children.
 * A tiny purpose-built parser is enough and keeps the project dependency-free.
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return entity in ENTITIES ? ENTITIES[entity] : match;
  });
}

function cleanText(raw) {
  const text = raw.trim();
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) return cdata[1];
  return decodeEntities(text);
}

/** Parse the direct text children of an element body into a { tag: text } map. */
export function parseFields(block) {
  const fields = {};
  const re = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/g;
  let match;
  while ((match = re.exec(block))) {
    if (!(match[1] in fields)) fields[match[1]] = cleanText(match[2]);
  }
  return fields;
}

/** Return the parsed bodies of every element named by one of `tagNames` (first name that matches wins). */
export function parseElements(xml, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`, 'gi');
    const out = [];
    let match;
    while ((match = re.exec(xml))) out.push(parseFields(match[1]));
    if (out.length) return out;
  }
  return [];
}

export function firstTag(xml, name) {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`, 'i').exec(xml);
  return match ? cleanText(match[1]) : null;
}

function pick(fields, names) {
  const lower = new Map(Object.keys(fields).map((k) => [k.toLowerCase(), fields[k]]));
  for (const name of names) {
    const value = lower.get(name.toLowerCase());
    if (value !== undefined && value !== '') return value;
  }
  return null;
}

function num(value) {
  if (value == null) return null;
  const n = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function flag(value) {
  return ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

/** GTIN/EAN codes are 8, 12, 13 or 14 digits. Short numeric codes are internal (weighted/PLU) codes. */
export function isGtin(code) {
  return /^(\d{8}|\d{12,14})$/.test(String(code ?? '').trim());
}

export function normalizePriceItem(fields) {
  const code = String(pick(fields, ['ItemCode', 'ProductCode', 'Barcode']) ?? '').trim();
  return {
    code,
    gtin: isGtin(code) ? code : null,
    name: pick(fields, ['ItemName', 'ItemNm', 'ProductName', 'Name']) ?? '',
    manufacturer: pick(fields, ['ManufacturerName', 'ManufactureName']),
    unitQty: pick(fields, ['UnitQty']),
    quantity: num(pick(fields, ['Quantity'])),
    unitOfMeasure: pick(fields, ['UnitOfMeasure']),
    isWeighted: flag(pick(fields, ['bIsWeighted', 'BisWeighted', 'IsWeighted'])),
    price: num(pick(fields, ['ItemPrice', 'Price'])),
    unitPrice: num(pick(fields, ['UnitOfMeasurePrice'])),
    status: pick(fields, ['ItemStatus']),
    updatedAt: pick(fields, ['PriceUpdateDate']),
  };
}

/** Parse a PriceFull / Price file. */
export function parsePriceFile(xml) {
  const items = parseElements(xml, ['Item', 'Product']).map(normalizePriceItem).filter((i) => i.code);
  return {
    chainId: firstTag(xml, 'ChainId'),
    subChainId: firstTag(xml, 'SubChainId'),
    storeId: firstTag(xml, 'StoreId'),
    bikoretNo: firstTag(xml, 'BikoretNo'),
    items,
  };
}

/**
 * Turn the promotion description / numeric fields into a rule the pricing engine understands.
 * Supported shapes: "3 ב-10", "2 ב-25 ₪", "10% הנחה", MinQty + DiscountedPrice.
 */
export function promoRuleFromFields({ description, minQty, discountedPrice, discountRate }) {
  const text = String(description ?? '');
  const multi = text.match(/(\d+)\s*(?:יח['"]?\s*)?ב-?\s*(\d+(?:[.,]\d+)?)\s*(?:₪|ש"ח|שח)?/);
  if (multi) {
    return { type: 'multi', minQty: parseInt(multi[1], 10), totalPrice: parseFloat(multi[2].replace(',', '.')) };
  }
  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) {
    return { type: 'percent', minQty: minQty && minQty > 1 ? minQty : 1, percent: parseFloat(percent[1]) };
  }
  if (discountedPrice != null) {
    if (minQty && minQty > 1) return { type: 'multi', minQty, totalPrice: discountedPrice };
    return { type: 'unit', minQty: 1, unitPrice: discountedPrice };
  }
  if (discountRate != null && discountRate > 0) {
    // Some chains publish the rate in tenths of a percent (e.g. 1000 = 10%).
    const rate = discountRate > 100 ? discountRate / 100 : discountRate;
    return { type: 'percent', minQty: minQty && minQty > 1 ? minQty : 1, percent: rate };
  }
  return null;
}

/** Parse a PromoFull / Promo file. */
export function parsePromoFile(xml) {
  const promotions = parseElements(xml, ['Promotion', 'Sale']).map((fields) => {
    const itemsBlock = pick(fields, ['PromotionItems', 'Items']) ?? '';
    const itemCodes = parseElements(itemsBlock, ['Item']).map((f) => String(pick(f, ['ItemCode']) ?? '').trim()).filter(Boolean);
    const minQty = num(pick(fields, ['MinQty']));
    const discountedPrice = num(pick(fields, ['DiscountedPrice']));
    const discountRate = num(pick(fields, ['DiscountRate']));
    const description = pick(fields, ['PromotionDescription', 'Description']) ?? '';
    return {
      id: pick(fields, ['PromotionId', 'PromotionID']),
      description,
      startDate: pick(fields, ['PromotionStartDate']),
      endDate: pick(fields, ['PromotionEndDate']),
      minQty,
      discountedPrice,
      discountRate,
      itemCodes,
      rule: promoRuleFromFields({ description, minQty, discountedPrice, discountRate }),
    };
  });
  return {
    chainId: firstTag(xml, 'ChainId'),
    storeId: firstTag(xml, 'StoreId'),
    promotions,
  };
}

/**
 * Convert parsed price + promo files into the catalog shape used by the mapping/pricing engines.
 * `storeItemIdFor(item)` translates a barcode into the online-storefront item id; defaults to the code itself.
 */
export function buildCatalogFromFiles({ chainId, price, promo, storeItemIdFor = (item) => item.code }) {
  const promosByCode = new Map();
  for (const p of promo?.promotions ?? []) {
    if (!p.rule) continue;
    for (const code of p.itemCodes) {
      if (!promosByCode.has(code)) promosByCode.set(code, []);
      promosByCode.get(code).push({ ...p.rule, description: p.description, promotionId: p.id });
    }
  }
  const items = price.items.map((item) => ({
    storeItemId: String(storeItemIdFor(item)),
    code: item.code,
    gtin: item.gtin,
    name: item.name,
    brand: item.manufacturer || null,
    price: item.price,
    isWeighted: item.isWeighted,
    unit: item.isWeighted ? 'ק"ג' : 'יח\'',
    inStock: item.status == null ? true : item.status !== '0',
    promotions: promosByCode.get(item.code) ?? [],
  }));
  return { chainId, storeId: price.storeId, items };
}
