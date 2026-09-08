import { selfPointAdapter } from './selfPoint.js';

/** יינות ביתן - Self Point platform, retailer 1131 (classified from the live site 2026-09-08). */
export default selfPointAdapter({
  chainId: 'ybitan',
  name: 'יינות ביתן',
  baseUrl: 'https://www.ybitan.co.il/',
  domains: ["www.ybitan.co.il"],
  retailerId: 1131,
  defaultBranchId: 1975,
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'live API check from a real browser: barcode lookup + cart create + PATCH confirmed by the site response (recon/selfpoint-live.json); same request sequence as the Carrefour end-to-end run',
});
