import { selfPointAdapter } from './selfPoint.js';

/** ויקטורי - Self Point platform, retailer 1470 (classified from the live site 2026-09-08). */
export default selfPointAdapter({
  chainId: 'victory',
  name: 'ויקטורי',
  baseUrl: 'https://www.victoryonline.co.il/',
  domains: ["www.victoryonline.co.il"],
  retailerId: 1470,
  defaultBranchId: 2331,
  verified: true,
  verifiedAt: '2026-09-08',
  verifiedBy: 'live API check from a real browser: barcode lookup + cart create + PATCH confirmed by the site response (recon/selfpoint-live.json); same request sequence as the Carrefour end-to-end run',
});
