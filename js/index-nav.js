var __vsSignedIn = false;
var __vsUploadRequiresAuth = true;
var __vsAuthReady = Promise.all([
  fetch('/api/auth/me').then(function (r) {
    __vsSignedIn = r.ok;
    document.getElementById(r.ok ? 'navAccount' : 'navAuth').style.display = 'inline-block';
    return r.ok;
  }).catch(function () {
    document.getElementById('navAuth').style.display = 'inline-block';
    return false;
  }),
  fetch('/api/upload-config').then(function (r) {
    return r.ok ? r.json() : { requireAuth: true };
  }).then(function (cfg) {
    __vsUploadRequiresAuth = cfg.requireAuth !== false;
  }).catch(function () {})
]).then(function (results) { return results[0]; });
