/* global chrome */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var host = null;

  function render(items) {
    var list = (host && Array.isArray(items['recon:' + host])) ? items['recon:' + host] : [];
    $('count').textContent = list.length;
    $('events').innerHTML = list.slice(-40).reverse().map(function (e) {
      var u = e.url.replace(/^https?:\/\/[^/]+/, '');
      return '<li><b>' + e.method + '</b> ' + (e.status || (e.error ? 'ERR' : '…')) + ' ' + u.slice(0, 90) + '</li>';
    }).join('') || '<li style="color:#7a857f;direction:rtl;text-align:right">עדיין לא נלכדו בקשות. הפעילו הקלטה והוסיפו מוצר לעגלה באתר.</li>';
    $('copy').disabled = list.length === 0;
    $('clear').disabled = list.length === 0;
    var on = !!items.recording;
    $('recording').checked = on;
    $('rec-badge').textContent = on ? 'מקליט' : 'כבוי';
    $('rec-badge').className = 'badge' + (on ? ' on' : '');
  }

  function refresh() {
    chrome.storage.local.get(null, render);
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    try { host = new URL(tabs[0].url).host; } catch (e) { host = null; }
    $('host').textContent = host || 'לא נתמך';
    refresh();
  });

  $('recording').addEventListener('change', function () {
    chrome.storage.local.set({ recording: $('recording').checked }, refresh);
  });

  $('copy').addEventListener('click', function () {
    chrome.storage.local.get(null, function (items) {
      var report = {
        tool: 'smart-cart-recon',
        version: 1,
        host: host,
        page: items['recon-page:' + host] || null,
        events: items['recon:' + host] || [],
        exportedAt: new Date().toISOString(),
      };
      var text = JSON.stringify(report, null, 2);
      navigator.clipboard.writeText(text).then(function () {
        $('status').textContent = 'הדוח הועתק (' + report.events.length + ' בקשות). הדביקו אותו בצ\'אט.';
      }, function () {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        $('status').textContent = 'הדוח הועתק.';
      });
    });
  });

  $('clear').addEventListener('click', function () {
    if (!host) return;
    chrome.storage.local.remove(['recon:' + host, 'recon-page:' + host], refresh);
  });

  $('open-options').addEventListener('click', function (e) { e.preventDefault(); chrome.runtime.openOptionsPage(); });

  chrome.storage.onChanged.addListener(refresh);
})();
