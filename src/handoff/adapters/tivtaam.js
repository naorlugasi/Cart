import { selfPointAdapter } from './selfPoint.js';

/** טיב טעם - Self Point platform, retailer 1062 (classified from the live site 2026-09-08). */
export default selfPointAdapter({
  chainId: 'tivtaam',
  name: 'טיב טעם',
  baseUrl: 'https://www.tivtaam.co.il/',
  domains: ["www.tivtaam.co.il"],
  retailerId: 1062,
  defaultBranchId: 924,
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'live API check from a real browser: barcode lookup + cart create + PATCH confirmed by the site response (recon/selfpoint-live.json); same request sequence as the Carrefour end-to-end run',
});
