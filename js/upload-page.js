let uploadWidget = null;

function showEl(el) {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = '';
}

// Render a load failure inside the upload area with a retry control, so the
// user can recover without a full page refresh.
function showLoadError(title, sub) {
  const rootEl = document.getElementById('uploadRoot');
  rootEl.innerHTML =
    '<div class="load-error" role="alert">' +
      '<div class="load-error-title"></div>' +
      '<div class="load-error-sub"></div>' +
      '<button type="button" class="load-error-btn">Try again</button>' +
    '</div>';
  rootEl.querySelector('.load-error-title').textContent = title;
  rootEl.querySelector('.load-error-sub').textContent = sub;
  rootEl.querySelector('.load-error-btn').addEventListener('click', () => {
    rootEl.innerHTML = '<div class="spinner"></div>';
    initPage();
  });
}

async function initPage() {
  const spinner = document.getElementById('authSpinner');
  let me;
  try { me = await fetch('/api/auth/me'); }
  catch {
    if (spinner) spinner.remove();
    showEl(document.getElementById('pageMain'));
    showLoadError(
      'Couldn\u2019t reach VidShare',
      'Check your internet connection, then try again.'
    );
    return;
  }
  if (me.status === 401) {
    if (spinner) spinner.remove();
    window.location.replace('/login?next=/upload');
    return;
  }
  if (!me.ok) {
    if (spinner) spinner.remove();
    showEl(document.getElementById('pageMain'));
    showLoadError(
      'Something went wrong on our end',
      'We couldn\u2019t confirm your sign-in. Please try again in a moment.'
    );
    return;
  }

  if (spinner) spinner.remove();
  showEl(document.getElementById('pageNav'));
  showEl(document.getElementById('pageMain'));

  uploadWidget = window.initUploadWidget(document.getElementById('uploadRoot'));
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
