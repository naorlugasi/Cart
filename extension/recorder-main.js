/*
 * Recording mode (runs in the page's own JS world, so it sees the site's real fetch/XHR calls).
 * Only active while the bridge sets <html data-cart-recon="1">. Captures cart-related,
 * same-origin requests with their payload and a response snippet, and hands them to the
 * bridge via window.postMessage. Cookies and Authorization headers are never recorded.
 */
(function () {
  'use strict';
  if (window.__cartReconInstalled) return;
  window.__cartReconInstalled = true;

  var INTERESTING = /cart|basket|add|checkout|order|item|product|search|catalog|api\//i;
  var SKIP = /\.(png|jpe?g|gif|svg|webp|woff2?|ttf|css|ico|mp4)(\?|$)|google|facebook|doubleclick|analytics|gtm|hotjar|clarity|sentry|segment|appsflyer|taboola|outbrain|dynamicyield|optimizely|cdn-cgi/i;

  function enabled() { return document.documentElement && document.documentElement.getAttribute('data-cart-recon') === '1'; }
  function sameOrigin(url) { try { return new URL(url, location.href).origin === location.origin; } catch (e) { return false; } }
  function emit(event) {
    try { window.postMessage({ type: 'cart-recon-event', event: event }, location.origin); } catch (e) { /* ignore */ }
  }
  function headersToObject(h) {
    var out = {};
    try {
      if (!h) return out;
      if (typeof Headers !== 'undefined' && h instanceof Headers) { h.forEach(function (v, k) { out[k] = v; }); return out; }
      if (Array.isArray(h)) { h.forEach(function (p) { out[p[0]] = p[1]; }); return out; }
      Object.keys(h).forEach(function (k) { out[k] = h[k]; });
    } catch (e) { /* ignore */ }
    return out;
  }
  function redact(headers) {
    var out = {};
    Object.keys(headers).forEach(function (k) {
      var lk = k.toLowerCase();
      if (lk === 'cookie' || lk === 'authorization') { out[k] = '[redacted]'; return; }
      var v = String(headers[k]);
      out[k] = v.length > 300 ? v.slice(0, 300) + '…' : v;
    });
    return out;
  }
  function bodyToString(body) {
    try {
      if (body == null) return null;
      if (typeof body === 'string') return body.slice(0, 2000);
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return body.toString().slice(0, 2000);
      if (typeof FormData !== 'undefined' && body instanceof FormData) { var parts = []; body.forEach(function (v, k) { parts.push(k + '=' + (typeof v === 'string' ? v : '[file]')); }); return parts.join('&').slice(0, 2000); }
      if (typeof Blob !== 'undefined' && body instanceof Blob) return '[blob ' + body.size + ' bytes]';
      if (body instanceof ArrayBuffer) return '[arraybuffer ' + body.byteLength + ' bytes]';
      return String(body).slice(0, 2000);
    } catch (e) { return '[unreadable body]'; }
  }
  function shouldRecord(method, url) {
    if (!enabled()) return false;
    if (!sameOrigin(url)) return false;
    if (SKIP.test(url)) return false;
    return method !== 'GET' || INTERESTING.test(url);
  }

  // ---- fetch ----
  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var promise = origFetch.apply(this, arguments);
      if (shouldRecord(method, url)) {
        var started = Date.now();
        var reqHeaders = redact(headersToObject((init && init.headers) || (input && input.headers)));
        var body = bodyToString(init && init.body);
        promise.then(function (res) {
          try {
            var clone = res.clone();
            var ct = clone.headers.get('content-type') || '';
            var record = { via: 'fetch', method: method, url: new URL(url, location.href).toString(), requestHeaders: reqHeaders, body: body, status: res.status, contentType: ct, ms: Date.now() - started, page: location.href, at: new Date().toISOString() };
            if (/json|text|html|xml/i.test(ct)) {
              clone.text().then(function (t) { record.response = t.slice(0, 1500); emit(record); }, function () { emit(record); });
            } else emit(record);
          } catch (e) { /* ignore */ }
        }, function (err) {
          emit({ via: 'fetch', method: method, url: url, requestHeaders: reqHeaders, body: body, error: String(err), page: location.href, at: new Date().toISOString() });
        });
      }
      return promise;
    };
  }

  // ---- XMLHttpRequest ----
  var XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    var open = XHR.prototype.open;
    var send = XHR.prototype.send;
    var setHeader = XHR.prototype.setRequestHeader;
    XHR.prototype.open = function (method, url) {
      this.__recon = { method: String(method || 'GET').toUpperCase(), url: url, headers: {} };
      return open.apply(this, arguments);
    };
    XHR.prototype.setRequestHeader = function (k, v) {
      if (this.__recon) this.__recon.headers[k] = v;
      return setHeader.apply(this, arguments);
    };
    XHR.prototype.send = function (body) {
      var info = this.__recon;
      if (info && shouldRecord(info.method, info.url)) {
        var started = Date.now();
        var xhr = this;
        var bodyStr = bodyToString(body);
        xhr.addEventListener('loadend', function () {
          var ct = '';
          try { ct = xhr.getResponseHeader('content-type') || ''; } catch (e) { /* ignore */ }
          var resp = null;
          try { if (xhr.responseType === '' || xhr.responseType === 'text') resp = String(xhr.responseText || '').slice(0, 1500); else if (xhr.responseType === 'json') resp = JSON.stringify(xhr.response).slice(0, 1500); } catch (e) { /* ignore */ }
          emit({ via: 'xhr', method: info.method, url: new URL(info.url, location.href).toString(), requestHeaders: redact(info.headers), body: bodyStr, status: xhr.status, contentType: ct, response: resp, ms: Date.now() - started, page: location.href, at: new Date().toISOString() });
        });
      }
      return send.apply(this, arguments);
    };
  }
})();
