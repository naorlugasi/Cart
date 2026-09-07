/*
 * Cart handoff injector.
 *
 * Runs INSIDE the chain's website (via the browser extension, the bookmarklet or a mobile
 * WebView) and populates the user's cart there by replaying the chain's own cart-add
 * requests with the user's cookies. It is written as a plain script (no imports) so the very
 * same file is used in Node tests, the extension content script and the WebView template.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.CartHandoffInjector = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  var ERROR_TYPES = {
    NETWORK: 'network',
    ENDPOINT_MISSING: 'endpoint_missing',
    AUTH: 'auth',
    CSRF_MISSING: 'csrf_missing',
    UNEXPECTED_RESPONSE: 'unexpected_response',
    REJECTED: 'rejected',
    SERVER_ERROR: 'server_error',
    ORIGIN_MISMATCH: 'origin_mismatch',
  };

  var BANNER_ID = 'cart-handoff-banner';

  function getByPath(obj, path) {
    if (path === undefined || path === null || path === '') return obj;
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function fill(template, vars) {
    return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (_, key) {
      var v = getByPath(vars, key);
      return v === undefined || v === null ? '' : String(v);
    });
  }

  function fillDeep(value, vars) {
    if (typeof value === 'string') {
      var whole = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
      if (whole) {
        var v = getByPath(vars, whole[1]);
        return v === undefined ? '' : v; // keep numbers as numbers for JSON bodies
      }
      return fill(value, vars);
    }
    if (Array.isArray(value)) return value.map(function (v) { return fillDeep(v, vars); });
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) { out[k] = fillDeep(value[k], vars); });
      return out;
    }
    return value;
  }

  function buildBody(spec, vars) {
    var data = fillDeep(spec.body || {}, vars);
    var format = spec.format || 'json';
    if (format === 'json') return { body: JSON.stringify(data), contentType: 'application/json' };
    if (format === 'form') {
      var parts = [];
      Object.keys(data).forEach(function (k) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(data[k]));
      });
      return { body: parts.join('&'), contentType: 'application/x-www-form-urlencoded;charset=UTF-8' };
    }
    if (format === 'query') return { body: null, contentType: null, query: data };
    throw new Error('Unknown body format: ' + format);
  }

  function readCookie(doc, name) {
    if (!doc || !doc.cookie) return null;
    var m = doc.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function getCsrf(spec, ctx) {
    if (!spec) return null;
    var doc = ctx.document;
    var value = null;
    if (spec.source === 'meta') {
      var meta = doc && doc.querySelector && doc.querySelector('meta[name="' + spec.name + '"]');
      value = meta && meta.getAttribute('content');
    } else if (spec.source === 'cookie') {
      value = readCookie(doc, spec.name);
    } else if (spec.source === 'input') {
      var input = doc && doc.querySelector && doc.querySelector('input[name="' + spec.name + '"]');
      value = input && input.value;
    } else if (spec.source === 'global') {
      value = getByPath(ctx.global || {}, spec.name);
    }
    return value || null;
  }

  function evalSuccess(spec, response, json, text) {
    if (!spec) return !!response.ok;
    if (spec.statusOk && !response.ok) return false;
    if (spec.jsonPath !== undefined && spec.jsonPath !== null) {
      if (json === null || json === undefined) return false;
      var v = getByPath(json, spec.jsonPath);
      if (Object.prototype.hasOwnProperty.call(spec, 'equals')) return v === spec.equals || String(v) === String(spec.equals);
      return !!v;
    }
    if (spec.textIncludes) return String(text || '').indexOf(spec.textIncludes) !== -1;
    return !!response.ok;
  }

  function resolveUrl(base, path) {
    if (/^https?:\/\//i.test(path)) return path;
    return new URL(path, base).toString();
  }

  function appendQuery(url, query) {
    var u = new URL(url);
    Object.keys(query || {}).forEach(function (k) { u.searchParams.set(k, query[k]); });
    return u.toString();
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function request(ctx, adapter, spec, vars) {
    var fetchImpl = ctx.fetch;
    var url = resolveUrl(adapter.baseUrl, fill(spec.path || '/', vars));
    var headers = fillDeep(spec.headers || {}, vars);
    var init = { method: spec.method || 'GET', headers: headers, credentials: 'include' };
    if (init.method !== 'GET' && init.method !== 'HEAD') {
      var built = buildBody(spec, vars);
      if (built.query) url = appendQuery(url, built.query);
      if (built.body !== null) { init.body = built.body; headers['Content-Type'] = built.contentType; }
    }
    if (spec.csrf) {
      var token = getCsrf(spec.csrf, ctx);
      if (token) {
        if (spec.csrf.header) headers[spec.csrf.header] = token;
        if (spec.csrf.field && init.body && spec.format === 'form') init.body += '&' + encodeURIComponent(spec.csrf.field) + '=' + encodeURIComponent(token);
      }
    }
    var response = await fetchImpl(url, init);
    var text = '';
    try { text = await response.text(); } catch (e) { text = ''; }
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    return { response: response, json: json, text: text, url: url };
  }

  function classifyFailure(spec, r) {
    var status = r.response.status;
    if (status === 404 || status === 405 || status === 410) return ERROR_TYPES.ENDPOINT_MISSING;
    if (status === 401 || status === 403) return ERROR_TYPES.AUTH;
    if (status >= 500) return ERROR_TYPES.SERVER_ERROR;
    var success = spec.success || {};
    if (success.jsonPath !== undefined && success.jsonPath !== null) {
      if (r.json === null || r.json === undefined) return ERROR_TYPES.UNEXPECTED_RESPONSE;
      if (getByPath(r.json, success.jsonPath) === undefined) return ERROR_TYPES.UNEXPECTED_RESPONSE;
    }
    return ERROR_TYPES.REJECTED;
  }

  function errorMessage(r) {
    var j = r.json;
    if (j && typeof j === 'object') {
      var msg = j.message || j.error || j.errorMessage || (j.errors && j.errors[0] && (j.errors[0].message || j.errors[0]));
      if (msg) return String(msg);
    }
    return 'HTTP ' + r.response.status;
  }

  async function addItem(ctx, adapter, item, vars) {
    var spec = adapter.add;
    var base = { storeItemId: item.storeItemId, productId: item.productId, name: item.name, qty: item.qty };
    var r;
    try {
      r = await request(ctx, adapter, spec, vars);
    } catch (err) {
      return Object.assign(base, { ok: false, errorType: ERROR_TYPES.NETWORK, error: err && err.message ? err.message : String(err) });
    }
    if (evalSuccess(spec.success, r.response, r.json, r.text)) {
      return Object.assign(base, { ok: true, status: r.response.status });
    }
    return Object.assign(base, { ok: false, status: r.response.status, errorType: classifyFailure(spec, r), error: errorMessage(r) });
  }

  /**
   * Add every item in the payload to the chain cart, one after another.
   * Failed items are recorded and skipped so the rest of the cart still loads.
   */
  async function runHandoff(payload, ctx) {
    ctx = ctx || {};
    ctx.fetch = ctx.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    ctx.document = ctx.document || (typeof document !== 'undefined' ? document : null);
    if (!ctx.fetch) throw new Error('fetch is not available');
    var adapter = payload.adapter;
    var items = payload.items || [];
    var started = Date.now();
    var warnings = [];
    var results = [];

    if (adapter.session) {
      try { await request(ctx, adapter, adapter.session, { handoffId: payload.id }); }
      catch (err) { warnings.push('session warm-up failed: ' + (err && err.message)); }
    }

    var csrfSpec = adapter.add && adapter.add.csrf;
    if (csrfSpec && csrfSpec.required !== false && !getCsrf(csrfSpec, ctx)) {
      items.forEach(function (item) {
        results.push({ storeItemId: item.storeItemId, productId: item.productId, name: item.name, qty: item.qty, ok: false, errorType: ERROR_TYPES.CSRF_MISSING, error: 'CSRF token "' + csrfSpec.name + '" not found on page' });
      });
    } else {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var vars = Object.assign({}, payload.vars || {}, { handoffId: payload.id, storeId: payload.storeId, storeItemId: item.storeItemId, qty: item.qty, productId: item.productId });
        var result = await addItem(ctx, adapter, item, vars);
        results.push(result);
        if (typeof ctx.onProgress === 'function') ctx.onProgress({ index: i + 1, total: items.length, result: result });
        if (adapter.delayMs && i < items.length - 1) await sleep(adapter.delayMs);
      }
    }

    var okCount = results.filter(function (r) { return r.ok; }).length;
    return {
      handoffId: payload.id,
      chainId: adapter.chainId,
      total: items.length,
      okCount: okCount,
      failCount: results.length - okCount,
      results: results,
      warnings: warnings,
      durationMs: Date.now() - started,
      userAgent: ctx.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'node'),
    };
  }

  async function report(payload, summary, ctx) {
    if (!payload.reportUrl || !ctx.fetch) return false;
    try {
      var res = await ctx.fetch(payload.reportUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      });
      return !!res.ok;
    } catch (e) {
      return false;
    }
  }

  /** The platform tab that opened this one (if any) gets the result directly, without polling the API. */
  function notifyOpener(payload, summary, ctx) {
    var opener = ctx.opener !== undefined ? ctx.opener : (typeof window !== 'undefined' ? window.opener : null);
    if (!opener || typeof opener.postMessage !== 'function') return false;
    var target = payload.platformOrigin || (payload.reportUrl ? new URL(payload.reportUrl).origin : '*');
    try {
      opener.postMessage({ type: 'cart-handoff-result', handoffId: payload.id, chainId: payload.chainId, summary: summary }, target);
      return true;
    } catch (e) { return false; }
  }

  function showBanner(doc, text, kind) {
    if (!doc || !doc.body) return;
    var el = doc.getElementById(BANNER_ID);
    if (!el) {
      el = doc.createElement('div');
      el.id = BANNER_ID;
      el.setAttribute('dir', 'rtl');
      el.style.cssText = 'position:fixed;top:12px;right:12px;left:12px;z-index:2147483647;padding:14px 18px;border-radius:12px;font:15px/1.5 system-ui,Arial,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25);direction:rtl;text-align:right;max-width:640px;margin-inline-start:auto;';
      doc.body.appendChild(el);
    }
    var colors = { info: '#1f4b99', success: '#1b7f3b', warn: '#b7791f', error: '#b02a37' };
    el.style.background = colors[kind] || colors.info;
    el.style.color = '#fff';
    el.textContent = text;
  }

  function summaryText(summary) {
    if (summary.total === 0) return 'העגלה ריקה - לא היה מה לטעון.';
    if (summary.failCount === 0) return 'העגלה נטענה בהצלחה, כעת בחר מועד משלוח ובצע תשלום.';
    var failed = summary.results.filter(function (r) { return !r.ok; }).map(function (r) { return r.name || r.storeItemId; });
    if (summary.okCount > 0) return 'העגלה נטענה חלקית: ' + summary.okCount + ' מתוך ' + summary.total + ' מוצרים נוספו. לא נוספו: ' + failed.join(', ') + '.';
    return 'טעינת העגלה נכשלה (' + (summary.results[0] && summary.results[0].error ? summary.results[0].error : 'שגיאה') + '). נסה שוב או הוסף את המוצרים ידנית.';
  }

  function sameOrigin(a, b) {
    try { return new URL(a).origin === new URL(b).origin; } catch (e) { return false; }
  }

  /** Full flow with UI feedback: run -> report -> redirect to checkout. */
  async function execute(payload, ctx) {
    ctx = ctx || {};
    var doc = ctx.document || (typeof document !== 'undefined' ? document : null);
    ctx.document = doc;
    var loc = ctx.location || (typeof location !== 'undefined' ? location : null);
    var adapter = payload.adapter;

    if (loc && loc.href && ctx.enforceOrigin !== false && !sameOrigin(loc.href, adapter.baseUrl)) {
      showBanner(doc, 'הדף הנוכחי אינו אתר ' + adapter.name + ' - הטעינה בוטלה.', 'error');
      return { handoffId: payload.id, chainId: adapter.chainId, total: (payload.items || []).length, okCount: 0, failCount: 0, results: [], warnings: [ERROR_TYPES.ORIGIN_MISMATCH], durationMs: 0 };
    }

    showBanner(doc, 'טוען את העגלה שלך (' + (payload.items || []).length + ' מוצרים)...', 'info');
    var summary = await runHandoff(payload, Object.assign({}, ctx, {
      onProgress: function (p) {
        showBanner(doc, 'טוען את העגלה שלך... ' + p.index + '/' + p.total, 'info');
        if (typeof ctx.onProgress === 'function') ctx.onProgress(p);
      },
    }));
    await report(payload, summary, ctx);
    notifyOpener(payload, summary, ctx);
    showBanner(doc, summaryText(summary), summary.failCount === 0 ? 'success' : (summary.okCount ? 'warn' : 'error'));

    if (summary.okCount > 0 && adapter.checkoutPath && ctx.redirect !== false && loc) {
      var target = resolveUrl(adapter.baseUrl, adapter.checkoutPath);
      var delay = ctx.redirectDelayMs === undefined ? 2500 : ctx.redirectDelayMs;
      setTimeout(function () { loc.href = target; }, delay);
    }
    return summary;
  }

  function readHandoffId(loc, param) {
    param = param || 'cart_id';
    if (!loc) return null;
    var hash = String(loc.hash || '').replace(/^#/, '');
    var fromHash = new URLSearchParams(hash).get(param);
    if (fromHash) return fromHash;
    var search = String(loc.search || '').replace(/^\?/, '');
    return new URLSearchParams(search).get(param);
  }

  function markDone(id, ctx) {
    try {
      var storage = ctx.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
      if (!storage) return false;
      var key = 'cart-handoff:' + id;
      if (storage.getItem(key)) return true;
      storage.setItem(key, String(Date.now()));
      return false;
    } catch (e) { return false; }
  }

  /**
   * Entry point for the extension / bookmarklet / WebView:
   * read the handoff id from the URL, fetch the payload from our API and execute it.
   */
  async function bootstrap(opts) {
    opts = opts || {};
    var loc = opts.location || (typeof location !== 'undefined' ? location : null);
    var id = opts.handoffId || readHandoffId(loc, opts.hashParam);
    if (!id) return null;
    if (markDone(id, opts)) return null; // already executed in this tab (page reload)
    var fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    var apiBase = String(opts.apiBase || '').replace(/\/$/, '');
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var res;
    try {
      res = await fetchImpl(apiBase + '/api/handoffs/' + encodeURIComponent(id), { mode: 'cors', credentials: 'omit' });
    } catch (err) {
      showBanner(doc, 'לא ניתן לטעון את פרטי העגלה (' + err.message + ').', 'error');
      return null;
    }
    if (!res.ok) {
      showBanner(doc, 'העגלה לא נמצאה או שפג תוקפה.', 'error');
      return null;
    }
    var payload = await res.json();
    return execute(payload, Object.assign({}, opts, { fetch: fetchImpl, document: doc, location: loc }));
  }

  return {
    ERROR_TYPES: ERROR_TYPES,
    fill: fill,
    fillDeep: fillDeep,
    getByPath: getByPath,
    buildBody: buildBody,
    evalSuccess: evalSuccess,
    getCsrf: getCsrf,
    readHandoffId: readHandoffId,
    runHandoff: runHandoff,
    execute: execute,
    bootstrap: bootstrap,
    report: report,
    notifyOpener: notifyOpener,
    showBanner: showBanner,
    summaryText: summaryText,
  };
});
