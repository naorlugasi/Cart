/**
 * Provenance of a chain catalog (docs/PIPELINE-CONTRACT.md §2.2): which published price list the
 * prices come from and when it was built. The UI shows it next to every price as
 * "לפי מחירון <רשת>, חנות <store>, מ-<תאריך>". `sourceDate` is the date the chain produced the price file
 * (from its name), `generatedAt` only when it was downloaded; show `sourceDate` when present, because on a
 * Shabbat or holiday no new file is published and the download date would overstate freshness.
 * Seeded / demo catalogs carry only `generatedAt`.
 */
export function priceListMeta(catalog) {
  if (!catalog) return null;
  const source = catalog.source && typeof catalog.source === 'object' ? catalog.source : {};
  return {
    generatedAt: catalog.generatedAt ?? null,
    sourceDate: catalog.sourceDate ?? null,
    asOf: catalog.sourceDate ?? catalog.generatedAt ?? null,
    store: source.store ?? catalog.storeId ?? null,
    storeName: source.storeName ?? null,
    onlineStore: typeof source.onlineStore === 'boolean' ? source.onlineStore : null,
    priceSource: catalog.priceSource ?? null,
    portal: source.portal ?? null,
  };
}
