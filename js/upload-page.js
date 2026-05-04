let uploadWidget = null;

async function initPage() {
  const spinner = document.getElementById('authSpinner');
  let me;
  try { me = await fetch('/api/auth/me'); }
  catch {
    spinner.remove();
    document.getElementById('pageMain').style.display = '';
    document.getElementById('uploadRoot').innerHTML =
      '<div class="upload-error-msg">Network error. Please refresh.</div>';
    return;
  }
  if (me.status === 401) {
    spinner.remove();
    window.location.replace('/login?next=/upload');
    return;
  }
  if (!me.ok) {
    spinner.remove();
    document.getElementById('pageMain').style.display = '';
    document.getElementById('uploadRoot').innerHTML =
      '<div class="upload-error-msg">Something went wrong. Please refresh.</div>';
    return;
  }

  spinner.remove();
  document.getElementById('pageNav').style.display = '';
  document.getElementById('pageMain').style.display = '';

  uploadWidget = initUploadWidget(document.getElementById('uploadRoot'));
}

window.addEventListener('beforeunload', e => {
  if (uploadWidget && typeof uploadWidget.isUploading === 'function' && uploadWidget.isUploading()) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

initPage();
