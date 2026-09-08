/* global CartHandoffInjector, chrome */
(function () {
  'use strict';
  var DEFAULT_API = 'http://localhost:3000';

  function getApiBase() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.sync.get({ apiBase: DEFAULT_API }, function (items) { resolve(items.apiBase || DEFAULT_API); });
      } catch (e) {
        resolve(DEFAULT_API);
      }
    });
  }

  function pendingId() {
    // Saved by recorder-bridge.js at document_start, before an SPA router can strip the hash.
    try { return sessionStorage.getItem('cart-handoff:pending'); } catch (e) { return null; }
  }

  // Development aid: a handoff URL may name a local platform instance (#cart_id=..&api=http://localhost:3100).
  function apiOverride() {
    var fromHash = null;
    try { fromHash = new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get('api') || sessionStorage.getItem('cart-handoff:api'); } catch (e) { fromHash = null; }
    return fromHash && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(fromHash) ? fromHash : null;
  }

  function run() {
    var id = CartHandoffInjector.readHandoffId(location) || pendingId();
    if (!id) return;
    var override = apiOverride();
    try { sessionStorage.removeItem('cart-handoff:pending'); sessionStorage.removeItem('cart-handoff:api'); } catch (e) { /* ignore */ }
    getApiBase().then(function (apiBase) {
      if (override) apiBase = override;
      // The demo store is served by the platform itself; use the current origin there.
      if (location.pathname.indexOf('/demo-store') === 0) apiBase = location.origin;
      CartHandoffInjector.bootstrap({ apiBase: apiBase, handoffId: id, redirect: true });
    });
  }

  run();
  // SPA navigations (hash changes) can carry a new handoff id.
  window.addEventListener('hashchange', run);
})();
