var __vsSignedIn = false;
var __vsUploadRequiresAuth = true;
var __vsAuthReady = Promise.all([
  fetch('/api/auth/me').then(function (r) {
    __vsSignedIn = r.ok;
    var el = document.getElementById(r.ok ? 'navAccount' : 'navAuth');
    if (el) el.classList.remove('hidden');
    return r.ok;
  }).catch(function () {
    var el = document.getElementById('navAuth');
    if (el) el.classList.remove('hidden');
    return false;
  }),
  fetch('/api/upload-config').then(function (r) {
    return r.ok ? r.json() : { requireAuth: true };
  }).then(function (cfg) {
    __vsUploadRequiresAuth = cfg.requireAuth !== false;
  }).catch(function () {})
]).then(function (results) { return results[0]; });
