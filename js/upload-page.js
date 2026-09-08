let uploadWidget = null;

async function initPage() {
  const spinner = document.getElementById('authSpinner');
  const pageNav = document.getElementById('pageNav');
  const pageMain = document.getElementById('pageMain');
  const uploadRoot = document.getElementById('uploadRoot');

  // Match the modal: guests can upload when ALLOW_ANONYMOUS_UPLOADS is on.
  let requireAuth = true;
  try {
    const cfgRes = await fetch('/api/upload-config');
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      requireAuth = cfg.requireAuth !== false;
    }
  } catch (_) { /* default to requiring auth */ }

  let me = null;
  try { me = await fetch('/api/auth/me'); }
  catch {
    spinner.remove();
    pageMain.classList.remove('hidden');
    pageMain.style.display = '';
    uploadRoot.innerHTML =
      '<div class="upload-error-msg">Network error. Please refresh.</div>';
    return;
  }

  const signedIn = me && me.ok;
  if (!signedIn && requireAuth) {
    spinner.remove();
    window.location.replace('/login?next=/upload');
    return;
  }
  if (me && !me.ok && me.status !== 401) {
    spinner.remove();
    pageMain.classList.remove('hidden');
    pageMain.style.display = '';
    uploadRoot.innerHTML =
      '<div class="upload-error-msg">Something went wrong. Please refresh.</div>';
    return;
  }

  spinner.remove();
  if (signedIn) {
    pageNav.classList.remove('hidden');
    pageNav.style.display = '';
  }
  pageMain.classList.remove('hidden');
  pageMain.style.display = '';

  uploadWidget = window.initUploadWidget
    ? window.initUploadWidget(uploadRoot)
    : null;
}

window.addEventListener('beforeunload', e => {
  if (uploadWidget && typeof uploadWidget.isUploading === 'function' && uploadWidget.isUploading()) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

initPage();
