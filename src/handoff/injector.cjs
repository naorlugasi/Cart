/*
 * Cart handoff injector.
 *
 * Runs INSIDE the chain's website (via the browser extension, the bookmarklet or a mobile
 * WebView) and populates the user's cart there by replaying the chain's own cart-add
 * requests with the user's cookies. It is written as a plain script (no imports) so the very
 * same file is used in Node tests, the extension content script and the WebView template.
 *
 * Everything chain-specific comes from the adapter (plain data, see src/handoff/adapters):
 *   vars      values read from the page (localStorage / cookie / meta / input / global)
 *   session   optional warm-up request (guest cart creation); can capture values from its response
 *   lookup    optional barcode -> chain item id resolution (per item or in bulk)
 *   add       the cart-add request, one per item or one bulk request for all items
 *   strategy  'requests' (default) or 'localStorageCart' (chains that keep the guest cart in localStorage)
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
    NOT_IN_CATALOG: 'not_in_catalog',
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

  function setByPath(obj, path, value) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
  }

  function fill(template, vars) {
    return String(template).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, function (_, key) {
      var v = getByPath(vars, key);
      return v === undefined || v === null ? '' : String(v);
    });
  }

  function fillDeep(value, vars) {
    if (typeof value === 'string') {
      var whole = value.match(/^\{\{\s*([\w.-]+)\s*\}\}$/);
      if (whole) {
        var v = getByPath(vars, whole[1]);
        return v === undefined ? '' : v; // keep numbers / arrays / objects as they are for JSON bodies
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

  function storageOf(ctx, kind) {
    if (kind === 'sessionStorage') return ctx.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    return ctx.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
  }

  function readStorage(ctx, kind, name, path) {
    var storage;
    try { storage = storageOf(ctx, kind); } catch (e) { storage = null; }
    if (!storage) return null;
    var raw = null;
    try { raw = storage.getItem(name); } catch (e) { raw = null; }
    if (raw === null || raw === undefined) return null;
    if (!path) return raw;
    try { return getByPath(JSON.parse(raw), path); } catch (e) { return null; }
  }

  /** Write a value into web storage; with `path` the key holds a JSON document and only that field is set. */
  function writeStorage(ctx, kind, name, path, value) {
    var storage;
    try { storage = storageOf(ctx, kind); } catch (e) { storage = null; }
    if (!storage) return false;
    try {
      if (!path) { storage.setItem(name, typeof value === 'string' ? value : JSON.stringify(value)); return true; }
      var doc = {};
      try { doc = JSON.parse(storage.getItem(name) || '{}') || {}; } catch (e) { doc = {}; }
      setByPath(doc, path, value);
      storage.setItem(name, JSON.stringify(doc));
      return true;
    } catch (e) { return false; }
  }

  /**
   * Read one value from the page. `spec`: { source, name, path?, default? } with source one of
   * meta | cookie | input | global | localStorage | sessionStorage.
   */
  function readSource(spec, ctx) {
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
      value = getByPath(ctx.global || (typeof window !== 'undefined' ? window : {}), spec.name);
    } else if (spec.source === 'localStorage' || spec.source === 'sessionStorage') {
      value = readStorage(ctx, spec.source, spec.name, spec.path);
    } else if (spec.source === 'static') {
      value = spec.value;
    }
    if (value === undefined || value === null || value === '') value = null;
    if (value === null && spec.default !== undefined) value = spec.default;
    return value;
  }

  function getCsrf(spec, ctx) {
    return readSource(spec, ctx);
  }

  /** Resolve adapter.vars against the page; returns { values, missing } (missing = required vars not found). */
  function resolveVars(adapter, ctx) {
    var values = {};
    var missing = [];
    var specs = (adapter && adapter.vars) || {};
    Object.keys(specs).forEach(function (name) {
      var v = readSource(specs[name], ctx);
      if (v === null) { if (specs[name].required) missing.push(name); return; }
      values[name] = v;
    });
    return { values: values, missing: missing };
  }

  /**
   * Like resolveVars, but a var with `waitMs` is polled until the page produces it (SPAs create
   * their guest cart asynchronously right after load; racing them would leave our items in a
   * cart the site never looks at).
   */
  async function awaitVars(adapter, ctx) {
    var specs = (adapter && adapter.vars) || {};
    var deadline = 0;
    Object.keys(specs).forEach(function (name) { if (specs[name].waitMs) deadline = Math.max(deadline, Date.now() + specs[name].waitMs); });
    var resolved = resolveVars(adapter, ctx);
    while (deadline && Date.now() < deadline) {
      var pending = Object.keys(specs).filter(function (name) { return specs[name].waitMs && !(name in resolved.values); });
      if (!pending.length) break;
      await sleep(ctx.pollMs || 250);
      resolved = resolveVars(adapter, ctx);
    }
    return resolved;
  }

  function evalSuccess(spec, response, json, text, vars) {
    if (!spec) return !!response.ok;
    if (spec.statusOk && !response.ok) return false;
    if (spec.itemsPath !== undefined && spec.itemsPath !== null && vars) {
      var list = getByPath(json, spec.itemsPath);
      if (!Array.isArray(list)) return false;
      var want = String(getByPath(vars, spec.itemIdVar || 'resolvedId'));
      return list.some(function (entry) { return String(getByPath(entry, spec.itemIdField || 'id')) === want; });
    }
    if (spec.jsonPath !== undefined && spec.jsonPath !== null) {
      if (json === null || json === undefined) return false;
      var v = getByPath(json, spec.jsonPath);
      if (Object.prototype.hasOwnProperty.call(spec, 'equals')) return v === spec.equals || String(v) === String(spec.equals);
      return !!v;
    }
    if (spec.textIncludes) return String(text || '').indexOf(vars ? fill(spec.textIncludes, vars) : spec.textIncludes) !== -1;
    return !!response.ok;
  }

  function resolveUrl(base, path) {
    if (/^https?:\/\//i.test(path)) return path;
    return new URL(path, base).toString();
  }

  function appendQuery(url, query) {
    var u = new URL(url);
    Object.keys(query || {}).forEach(function (k) {
      var v = query[k];
      if (v === undefined || v === null) return;
      u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    return u.toString();
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function request(ctx, adapter, spec, vars) {
    var fetchImpl = ctx.fetch;
    var url = resolveUrl(adapter.baseUrl, fill(spec.path || '/', vars));
    if (spec.query) url = appendQuery(url, fillDeep(spec.query, vars));
    var headers = {};
    var rawHeaders = fillDeep(spec.headers || {}, vars);
    Object.keys(rawHeaders).forEach(function (k) { if (rawHeaders[k] !== '' && rawHeaders[k] !== null && rawHeaders[k] !== undefined) headers[k] = rawHeaders[k]; });
    var init = { method: spec.method || 'GET', headers: headers, credentials: spec.credentials || 'include' };
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
    if (success.itemsPath !== undefined && success.itemsPath !== null) {
      if (!Array.isArray(getByPath(r.json, success.itemsPath))) return ERROR_TYPES.UNEXPECTED_RESPONSE;
      return ERROR_TYPES.REJECTED;
    }
    if (success.jsonPath !== undefined && success.jsonPath !== null) {
      if (r.json === null || r.json === undefined) return ERROR_TYPES.UNEXPECTED_RESPONSE;
      if (getByPath(r.json, success.jsonPath) === undefined) return ERROR_TYPES.UNEXPECTED_RESPONSE;
    }
    return ERROR_TYPES.REJECTED;
  }

  function errorMessage(r, spec) {
    var success = (spec && spec.success) || {};
    if (success.errorPath && r.json) {
      var fromPath = getByPath(r.json, success.errorPath);
      if (fromPath) return String(fromPath);
    }
    if (success.errorText && String(r.text || '').indexOf(success.errorText) !== -1) return success.errorText;
    var j = r.json;
    if (j && typeof j === 'object') {
      var msg = j.message || j.error || j.errorMessage || (j.errors && j.errors[0] && (j.errors[0].message || j.errors[0]));
      if (msg) return String(msg);
    }
    return 'HTTP ' + r.response.status;
  }

  function baseResult(item) {
    return { storeItemId: item.storeItemId, resolvedId: item.resolvedId, productId: item.productId, name: item.name, qty: item.qty };
  }

  function itemVars(payload, common, item) {
    var qty = item.qty;
    return Object.assign({}, common, {
      storeItemId: item.storeItemId,
      barcode: item.storeItemId,
      resolvedId: item.resolvedId !== undefined ? item.resolvedId : item.storeItemId,
      qty: qty,
      qtyFixed2: Number(qty).toFixed(2),
      productId: item.productId,
      name: item.name,
    });
  }

  function chunk(list, size) {
    var out = [];
    for (var i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  function matchEntry(list, spec, wanted) {
    var fields = [].concat(spec.matchField || 'barcode');
    for (var i = 0; i < list.length; i++) {
      for (var f = 0; f < fields.length; f++) {
        var v = getByPath(list[i], fields[f]);
        if (v !== undefined && v !== null && String(v) === String(wanted)) return list[i];
      }
    }
    return null;
  }

  /**
   * Resolve every item's chain id from its barcode using adapter.lookup. Items that cannot be
   * resolved get an error and are skipped by the add step. Resolved items carry `resolvedId`
   * and `lookupEntry` (the chain's product object, used by the localStorageCart strategy).
   */
  async function lookupItems(ctx, adapter, items, common) {
    var spec = adapter.lookup;
    var errors = {};
    items.forEach(function (item) { if (item.resolvedId === undefined) item.resolvedId = item.storeItemId; });
    if (!spec) return errors;
    var pending = items.slice();
    if (spec.bulk) {
      var groups = chunk(pending, spec.chunkSize || 50);
      for (var g = 0; g < groups.length; g++) {
        var ids = groups[g].map(function (i) { return i.storeItemId; });
        var vars = Object.assign({}, common, { barcodes: ids.join(spec.separator || ','), barcodeList: ids, count: ids.length });
        var r;
        try { r = await request(ctx, adapter, spec, vars); }
        catch (err) { groups[g].forEach(function (item) { errors[item.storeItemId] = { errorType: ERROR_TYPES.NETWORK, error: 'lookup: ' + (err && err.message ? err.message : String(err)) }; }); continue; }
        var list = getByPath(r.json, spec.itemsPath);
        if (!r.response.ok || !Array.isArray(list)) {
          groups[g].forEach(function (item) { errors[item.storeItemId] = { errorType: r.response.ok ? ERROR_TYPES.UNEXPECTED_RESPONSE : classifyFailure(spec, r), error: 'lookup: ' + errorMessage(r, spec) }; });
          continue;
        }
        groups[g].forEach(function (item) {
          var entry = matchEntry(list, spec, item.storeItemId);
          if (!entry) { errors[item.storeItemId] = { errorType: ERROR_TYPES.NOT_IN_CATALOG, error: 'not found in chain catalog' }; return; }
          item.resolvedId = getByPath(entry, spec.idField || 'id');
          item.lookupEntry = entry;
        });
      }
      return errors;
    }
    for (var i = 0; i < pending.length; i++) {
      var item = pending[i];
      var single;
      try { single = await request(ctx, adapter, spec, itemVars(null, common, item)); }
      catch (err) { errors[item.storeItemId] = { errorType: ERROR_TYPES.NETWORK, error: 'lookup: ' + (err && err.message ? err.message : String(err)) }; continue; }
      var found = getByPath(single.json, spec.itemsPath);
      if (!single.response.ok || !Array.isArray(found)) { errors[item.storeItemId] = { errorType: single.response.ok ? ERROR_TYPES.UNEXPECTED_RESPONSE : classifyFailure(spec, single), error: 'lookup: ' + errorMessage(single, spec) }; continue; }
      var hit = spec.matchField ? matchEntry(found, spec, item.storeItemId) : found[0];
      if (!hit) { errors[item.storeItemId] = { errorType: ERROR_TYPES.NOT_IN_CATALOG, error: 'not found in chain catalog' }; continue; }
      item.resolvedId = getByPath(hit, spec.idField || 'id');
      item.lookupEntry = hit;
      if (adapter.delayMs && i < pending.length - 1) await sleep(adapter.delayMs);
    }
    return errors;
  }

  async function addItem(ctx, adapter, item, vars) {
    var spec = adapter.add;
    var base = baseResult(item);
    var r;
    try {
      r = await request(ctx, adapter, spec, vars);
    } catch (err) {
      return Object.assign(base, { ok: false, errorType: ERROR_TYPES.NETWORK, error: err && err.message ? err.message : String(err) });
    }
    if (evalSuccess(spec.success, r.response, r.json, r.text, vars)) {
      return Object.assign(base, { ok: true, status: r.response.status });
    }
    return Object.assign(base, { ok: false, status: r.response.status, errorType: classifyFailure(spec, r), error: errorMessage(r, spec) });
  }

  /** One request for all items: adapter.add.items describes how the item list is rendered into the body. */
  async function addBulk(ctx, adapter, items, common, payload) {
    var spec = adapter.add;
    var itemSpec = spec.items || {};
    var rendered;
    if (itemSpec.as === 'map') {
      rendered = {};
      items.forEach(function (item) {
        var vars = itemVars(payload, common, item);
        rendered[fill(itemSpec.key || '{{resolvedId}}', vars)] = fillDeep(itemSpec.value === undefined ? '{{qty}}' : itemSpec.value, vars);
      });
    } else {
      rendered = items.map(function (item) { return fillDeep(itemSpec.template || { id: '{{resolvedId}}', qty: '{{qty}}' }, itemVars(payload, common, item)); });
    }
    var vars = Object.assign({}, common, { items: rendered, count: items.length });
    var r;
    try {
      r = await request(ctx, adapter, spec, vars);
    } catch (err) {
      return items.map(function (item) { return Object.assign(baseResult(item), { ok: false, errorType: ERROR_TYPES.NETWORK, error: err && err.message ? err.message : String(err) }); });
    }
    return items.map(function (item) {
      var iv = itemVars(payload, common, item);
      if (evalSuccess(spec.success, r.response, r.json, r.text, iv)) return Object.assign(baseResult(item), { ok: true, status: r.response.status });
      return Object.assign(baseResult(item), { ok: false, status: r.response.status, errorType: classifyFailure(spec, r), error: errorMessage(r, spec) });
    });
  }

  /**
   * Chains whose guest cart lives in the browser (a persisted store in localStorage) get their
   * cart filled by merging the looked-up product objects into that store. The page then picks
   * the cart up on the next navigation (checkoutPath).
   */
  function mergeLocalStorageCart(ctx, adapter, items) {
    var spec = adapter.localStorageCart;
    var raw = readStorage(ctx, 'localStorage', spec.key, null);
    var state = {};
    try { state = raw ? JSON.parse(raw) : {}; } catch (e) { state = {}; }
    if (!state || typeof state !== 'object') state = {};
    var list = getByPath(state, spec.itemsPath);
    if (!Array.isArray(list)) { list = []; setByPath(state, spec.itemsPath, list); }
    var idField = spec.idField || 'id';
    var qtyField = spec.qtyField || 'qty';
    var results = items.map(function (item) {
      if (!item.lookupEntry) return Object.assign(baseResult(item), { ok: false, errorType: ERROR_TYPES.NOT_IN_CATALOG, error: 'not found in chain catalog' });
      var existing = null;
      for (var i = 0; i < list.length; i++) if (String(getByPath(list[i], idField)) === String(item.resolvedId)) { existing = list[i]; break; }
      var entry = existing || Object.assign({}, item.lookupEntry);
      entry[qtyField] = spec.accumulate && existing ? Number(existing[qtyField] || 0) + Number(item.qty) : Number(item.qty);
      if (!existing) list.push(entry);
      return Object.assign(baseResult(item), { ok: true });
    });
    var written = writeStorage(ctx, 'localStorage', spec.key, null, state);
    if (!written) return results.map(function (r) { return r.ok ? Object.assign(r, { ok: false, errorType: ERROR_TYPES.UNEXPECTED_RESPONSE, error: 'localStorage is not writable' }) : r; });
    return results;
  }

  async function runSession(ctx, adapter, common, warnings) {
    var spec = adapter.session;
    if (!spec) return;
    if (spec.skipIfVar && common[spec.skipIfVar] !== undefined && common[spec.skipIfVar] !== null && common[spec.skipIfVar] !== '') return;
    var r;
    try { r = await request(ctx, adapter, spec, common); }
    catch (err) { warnings.push('session warm-up failed: ' + (err && err.message)); return; }
    if (!r.response.ok) warnings.push('session warm-up returned HTTP ' + r.response.status);
    (spec.capture || []).forEach(function (cap) {
      var v = getByPath(r.json, cap.jsonPath);
      if (v === undefined || v === null || v === '') { warnings.push('session: nothing at ' + cap.jsonPath); return; }
      if (cap.var) common[cap.var] = v;
      if (cap.localStorage) writeStorage(ctx, 'localStorage', cap.localStorage.key, cap.localStorage.path, v);
    });
  }

  /**
   * Add every item in the payload to the chain cart.
   * Failed items are recorded and skipped so the rest of the cart still loads.
   */
  async function runHandoff(payload, ctx) {
    ctx = ctx || {};
    ctx.fetch = ctx.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    ctx.document = ctx.document || (typeof document !== 'undefined' ? document : null);
    if (!ctx.fetch) throw new Error('fetch is not available');
    var adapter = payload.adapter;
    var items = (payload.items || []).map(function (item) { return Object.assign({}, item); });
    var started = Date.now();
    var warnings = [];
    var results = [];

    var resolved = await awaitVars(adapter, ctx);
    var common = Object.assign({}, payload.vars || {}, resolved.values, { handoffId: payload.id, storeId: payload.storeId, nowIso: new Date().toISOString() });
    if (resolved.missing.length) {
      items.forEach(function (item) { results.push(Object.assign(baseResult(item), { ok: false, errorType: ERROR_TYPES.CSRF_MISSING, error: 'page value "' + resolved.missing[0] + '" not found' })); });
      return finish(payload, adapter, items, results, warnings, started, ctx);
    }

    await runSession(ctx, adapter, common, warnings);

    var csrfSpec = adapter.add && adapter.add.csrf;
    if (csrfSpec && csrfSpec.required !== false && !getCsrf(csrfSpec, ctx)) {
      items.forEach(function (item) {
        results.push(Object.assign(baseResult(item), { ok: false, errorType: ERROR_TYPES.CSRF_MISSING, error: 'CSRF token "' + csrfSpec.name + '" not found on page' }));
      });
      return finish(payload, adapter, items, results, warnings, started, ctx);
    }

    var lookupErrors = await lookupItems(ctx, adapter, items, common);
    var todo = [];
    items.forEach(function (item) {
      var err = lookupErrors[item.storeItemId];
      if (err) results.push(Object.assign(baseResult(item), { ok: false }, err));
      else todo.push(item);
    });
    var progress = function (result) {
      if (typeof ctx.onProgress === 'function') ctx.onProgress({ index: results.length, total: items.length, result: result });
    };

    if (adapter.strategy === 'localStorageCart') {
      var verify = adapter.add && adapter.add.bulk && todo.length ? await addBulk(ctx, adapter, todo, common, payload) : null;
      var priced = {};
      (verify || []).forEach(function (r) { priced[r.storeItemId] = r; });
      var accepted = todo.filter(function (item) { return !verify || (priced[item.storeItemId] && priced[item.storeItemId].ok); });
      var merged = mergeLocalStorageCart(ctx, adapter, accepted);
      var byId = {};
      merged.forEach(function (r) { byId[r.storeItemId] = r; });
      todo.forEach(function (item) {
        var r = byId[item.storeItemId] || priced[item.storeItemId];
        results.push(r);
        progress(r);
      });
    } else if (adapter.add && adapter.add.bulk) {
      if (todo.length) {
        var bulk = await addBulk(ctx, adapter, todo, common, payload);
        bulk.forEach(function (r) { results.push(r); progress(r); });
      }
    } else {
      for (var i = 0; i < todo.length; i++) {
        var item = todo[i];
        var result = await addItem(ctx, adapter, item, itemVars(payload, common, item));
        results.push(result);
        progress(result);
        if (adapter.delayMs && i < todo.length - 1) await sleep(adapter.delayMs);
      }
    }

    return finish(payload, adapter, items, results, warnings, started, ctx);
  }

  function finish(payload, adapter, items, results, warnings, started, ctx) {
    var order = {};
    items.forEach(function (item, i) { order[item.storeItemId] = i; });
    results.sort(function (a, b) { return (order[a.storeItemId] || 0) - (order[b.storeItemId] || 0); });
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

  function originAllowed(href, adapter) {
    if (sameOrigin(href, adapter.baseUrl)) return true;
    var host;
    try { host = new URL(href).hostname; } catch (e) { return false; }
    return (adapter.domains || []).some(function (d) { return d === host; });
  }

  /** Full flow with UI feedback: run -> report -> redirect to checkout. */
  async function execute(payload, ctx) {
    ctx = ctx || {};
    var doc = ctx.document || (typeof document !== 'undefined' ? document : null);
    ctx.document = doc;
    var loc = ctx.location || (typeof location !== 'undefined' ? location : null);
    var adapter = payload.adapter;

    if (loc && loc.href && ctx.enforceOrigin !== false && !originAllowed(loc.href, adapter)) {
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
      var delay = ctx.redirectDelayMs !== undefined ? ctx.redirectDelayMs : (adapter.redirectDelayMs !== undefined ? adapter.redirectDelayMs : 2500);
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

  function decodeBase64Url(text) {
    var b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /**
   * The platform can embed the whole payload (items + adapter + report URL) in the URL hash
   * (`#cart_id=<id>&p=<base64url json>`), so the chain page never has to call the platform API.
   * Sites whose Content-Security-Policy forbids connections to other origins (Rami Levy) only
   * work this way; the result then travels back to the platform tab with postMessage.
   */
  function readInlinePayload(loc, param) {
    param = param || 'p';
    if (!loc) return null;
    var hash = String(loc.hash || '').replace(/^#/, '');
    var raw = new URLSearchParams(hash).get(param);
    if (!raw) return null;
    try {
      var payload = JSON.parse(decodeBase64Url(raw));
      return payload && payload.adapter && Array.isArray(payload.items) ? payload : null;
    } catch (e) { return null; }
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
    var inline = opts.payload || readInlinePayload(loc, opts.payloadParam);
    var id = opts.handoffId || (inline && inline.id) || readHandoffId(loc, opts.hashParam);
    if (!id) return null;
    if (markDone(id, opts)) return null; // already executed in this tab (page reload)
    var fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    var apiBase = String(opts.apiBase || '').replace(/\/$/, '');
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    if (inline && inline.id === id) return execute(inline, Object.assign({}, opts, { fetch: fetchImpl, document: doc, location: loc }));
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
    setByPath: setByPath,
    buildBody: buildBody,
    evalSuccess: evalSuccess,
    getCsrf: getCsrf,
    readSource: readSource,
    resolveVars: resolveVars,
    awaitVars: awaitVars,
    readHandoffId: readHandoffId,
    readInlinePayload: readInlinePayload,
    runHandoff: runHandoff,
    execute: execute,
    bootstrap: bootstrap,
    report: report,
    notifyOpener: notifyOpener,
    showBanner: showBanner,
    summaryText: summaryText,
  };
});
