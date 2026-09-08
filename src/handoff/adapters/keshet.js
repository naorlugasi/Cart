import { selfPointAdapter } from './selfPoint.js';

/** קשת טעמים - Self Point platform, retailer 1219 (classified from the live site 2026-09-08). */
export default selfPointAdapter({
  chainId: 'keshet',
  name: 'קשת טעמים',
  baseUrl: 'https://www.keshet-teamim.co.il/',
  domains: ["www.keshet-teamim.co.il"],
  retailerId: 1219,
  defaultBranchId: 2585,
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'live API check from a real browser: barcode lookup + cart create + PATCH confirmed by the site response (recon/selfpoint-live.json); same request sequence as the Carrefour end-to-end run',
});
