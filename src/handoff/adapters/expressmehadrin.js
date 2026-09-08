import { selfPointAdapter } from './selfPoint.js';

/** אקספרס מהדרין - Self Point platform, retailer 30 (classified from the live site 2026-09-08). */
export default selfPointAdapter({
  chainId: 'expressmehadrin',
  name: 'אקספרס מהדרין',
  baseUrl: 'https://www.expressmehadrin.co.il/',
  domains: ["www.expressmehadrin.co.il"],
  retailerId: 30,
  defaultBranchId: 2143,
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'live API check from a real browser: barcode lookup + cart create + PATCH confirmed by the site response (recon/selfpoint-live.json); same request sequence as the Carrefour end-to-end run',
});
