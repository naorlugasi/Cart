import { selfPointAdapter } from './selfPoint.js';

/** קרפור - Self Point platform, retailer 1540 (classified from the live site 2026-09-08). */
export default selfPointAdapter({
  chainId: 'carrefour',
  name: 'קרפור',
  baseUrl: 'https://www.carrefour.co.il/',
  domains: ["www.carrefour.co.il","carrefour.co.il"],
  retailerId: 1540,
  defaultBranchId: 3003,
  verified: true,
  verifiedAt: "2026-09-08",
  verifiedBy: "injector run inside the live site from a real browser (bookmarklet channel), cart lines confirmed by the site API and the site UI (recon/e2e-carrefour.json); Cloudflare blocks automated Chromium so scripts/e2e-handoff.mjs needs --manual",
});
