/* global chrome */
/*
 * Isolated-world bridge for recording mode: mirrors the "recording" flag from extension storage
 * onto the document (so recorder-main.js knows whether to capture) and stores captured events
 * per site in chrome.storage.local for the popup to display and copy.
 */
(function () {
  'use strict';
  var host = location.host;
  var key = 'recon:' + host;
  var MAX = 300;

  function applyFlag(on) {
    var apply = function () { document.documentElement.setAttribute('data-cart-recon', on ? '1' : '0'); };
    if (document.documentElement) apply(); else document.addEventListener('DOMContentLoaded', apply);
  }

  chrome.storage.local.get({ recording: false }, function (items) { applyFlag(!!items.recording); });
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.recording) applyFlag(!!changes.recording.newValue);
  });

  var queue = [];
  var flushing = false;
  function flush() {
    if (flushing || !queue.length) return;
    flushing = true;
    var batch = queue.splice(0, queue.length);
    chrome.storage.local.get([key], function (items) {
      var list = Array.isArray(items[key]) ? items[key] : [];
      list = list.concat(batch);
      if (list.length > MAX) list = list.slice(list.length - MAX);
      var update = {};
      update[key] = list;
      chrome.storage.local.set(update, function () { flushing = false; if (queue.length) flush(); });
    });
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window || e.origin !== location.origin) return;
    var data = e.data;
    if (!data || data.type !== 'cart-recon-event' || !data.event) return;
    queue.push(data.event);
    flush();
  });

  // Also capture page-level hints once: meta tags with tokens, cookie names, storage keys.
  function snapshot() {
    try {
      var metas = [].slice.call(document.querySelectorAll('meta')).filter(function (m) { return /token|csrf|xsrf|api|store|branch/i.test((m.name || '') + ' ' + (m.getAttribute('property') || '')); }).map(function (m) { return { name: m.name || m.getAttribute('property'), content: String(m.content || '').slice(0, 120) }; });
      var cookieNames = document.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); }).filter(Boolean);
      var storageKeys = { local: Object.keys(localStorage).slice(0, 60), session: Object.keys(sessionStorage).slice(0, 60) };
      var update = {};
      update['recon-page:' + host] = { url: location.href, title: document.title, metas: metas, cookieNames: cookieNames, storageKeys: storageKeys, at: new Date().toISOString() };
      chrome.storage.local.set(update);
    } catch (err) { /* ignore */ }
  }
  if (document.readyState === 'complete') setTimeout(snapshot, 1500); else window.addEventListener('load', function () { setTimeout(snapshot, 1500); });
})();

/*
 * SPA routers (Nuxt / Next / Angular) may rewrite the URL hash before the injector runs at
 * document_idle. Remember the handoff id as early as possible so content.js can still find it.
 */
(function () {
  try {
    var hash = String(location.hash || '');
    var m = hash.match(/(?:^#|&)cart_id=([^&]+)/);
    if (m) sessionStorage.setItem('cart-handoff:pending', decodeURIComponent(m[1]));
    var a = hash.match(/(?:^#|&)api=([^&]+)/);
    if (m && a) sessionStorage.setItem('cart-handoff:api', decodeURIComponent(a[1]));
  } catch (e) { /* ignore */ }
})();
