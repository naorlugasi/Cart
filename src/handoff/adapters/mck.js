import { selfPointAdapter } from './selfPoint.js';

/** מחסני השוק - Self Point platform, retailer 1107 (classified from the live site 2026-09-08). */
export default selfPointAdapter({
  chainId: 'mck',
  name: 'מחסני השוק',
  baseUrl: 'https://www.mck.co.il/',
  domains: ["www.mck.co.il"],
  retailerId: 1107,
  defaultBranchId: 836,
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'live API check from a real browser: barcode lookup + cart create + PATCH confirmed by the site response (recon/selfpoint-live.json); same request sequence as the Carrefour end-to-end run',
});
