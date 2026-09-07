/* global chrome */
var DEFAULT_API = 'http://localhost:3000';
chrome.storage.sync.get({ apiBase: DEFAULT_API }, function (items) {
  document.getElementById('apiBase').value = items.apiBase;
});
document.getElementById('save').addEventListener('click', function () {
  var value = document.getElementById('apiBase').value.trim().replace(/\/$/, '') || DEFAULT_API;
  chrome.storage.sync.set({ apiBase: value }, function () {
    document.getElementById('status').textContent = 'נשמר: ' + value;
  });
});
