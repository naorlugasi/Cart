/**
 * The 14 retailers of the comparison, as the every-store pipeline sees them. `portal` selects the
 * listing driver (pipeline/listing.mjs); `chain` is the 13-digit chain id in the file names.
 * Sub-chains that share a retailer (yochananof_b, ybitan/quik under Carrefour) are the same
 * download: they are listed once here by retailer, not by catalog row.
 */
export const RETAILERS = {
  shufersal: { portal: 'shufersal', chain: '7290027600007', name: 'שופרסל' },
  ramilevy: { portal: 'publishedprices', user: 'RamiLevi', chain: '7290058140886', name: 'רמי לוי' },
  yochananof: { portal: 'publishedprices', user: 'yohananof', chain: '7290803800003', name: 'יוחננוף' },
  tivtaam: { portal: 'publishedprices', user: 'TivTaam', chain: '7290873255550', name: 'טיב טעם' },
  keshet: { portal: 'publishedprices', user: 'Keshet', chain: '7290785400000', name: 'קשת טעמים' },
  osherad: { portal: 'publishedprices', user: 'osherad', chain: '7290103152017', name: 'אושר עד' },
  carrefour: { portal: 'carrefour', chain: '7290055700007', name: 'קרפור / יינות ביתן / קוויק' },
  hazihinam: { portal: 'hazihinam', chain: '7290700100008', name: 'חצי חינם' },
  victory: { portal: 'laib', chain: '7290696200003', name: 'ויקטורי' },
  mck: { portal: 'laib', chain: '7290661400001', name: 'מחסני השוק' },
  shukcity: { portal: 'bina', host: 'shuk-hayir.binaprojects.com', chain: '7290058148776', name: 'שוק העיר' },
};
