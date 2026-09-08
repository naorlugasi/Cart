import { selfPointAdapter } from './selfPoint.js';

/** קוויק - Self Point platform, retailer 1541 (classified from the live site 2026-09-08). */
export default selfPointAdapter({
  chainId: 'quik',
  name: 'קוויק',
  baseUrl: 'https://www.quik.co.il/',
  domains: ["www.quik.co.il","quik.co.il"],
  retailerId: 1541,
  defaultBranchId: 3091,
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'live API check from a real browser: barcode lookup + cart create + PATCH confirmed by the site response (recon/selfpoint-live.json); same request sequence as the Carrefour end-to-end run',
});
