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

  function run() {
    var id = CartHandoffInjector.readHandoffId(location);
    if (!id) return;
    getApiBase().then(function (apiBase) {
      // The demo store is served by the platform itself; use the current origin there.
      if (location.pathname.indexOf('/demo-store') === 0) apiBase = location.origin;
      CartHandoffInjector.bootstrap({ apiBase: apiBase, redirect: true });
    });
  }

  run();
  // SPA navigations (hash changes) can carry a new handoff id.
  window.addEventListener('hashchange', run);
})();
