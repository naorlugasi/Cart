import { selfPointAdapter } from './selfPoint.js';

/** שוק העיר - Self Point platform, retailer 1254 (classified from the live site 2026-09-08). */
export default selfPointAdapter({
  chainId: 'shukcity',
  name: 'שוק העיר',
  baseUrl: 'https://www.shukcity.co.il/',
  domains: ["www.shukcity.co.il"],
  retailerId: 1254,
  defaultBranchId: 1636,
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'live API check from a real browser: barcode lookup + cart create + PATCH confirmed by the site response (recon/selfpoint-live.json); same request sequence as the Carrefour end-to-end run',
});
