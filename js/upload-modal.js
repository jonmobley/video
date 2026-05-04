/* VidShare upload modal — shared modal shell that hosts the upload widget.
 * Usage: openUploadModal(). Inserts the modal markup on demand (once per
 * page), wires up open/close, focus trap, Escape, and backdrop dismissal,
 * and lazy-initializes the upload widget on first open. */

(function () {
  let modal = null;
  let dialog = null;
  let root = null;
  let widget = null;
  let lastFocused = null;
  let keydownBound = false;

  function buildModal() {
    if (modal) return;

    modal = document.createElement('div');
    modal.className = 'upload-modal';
    modal.id = 'uploadModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'uploadModalTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="upload-modal-backdrop" data-modal-close></div>
      <div class="upload-modal-dialog">
        <button type="button" class="upload-modal-close" aria-label="Close upload dialog" data-modal-close>✕</button>
        <h2 id="uploadModalTitle" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">Upload a video</h2>
        <div data-el="uploadRoot"></div>
        <a class="upload-modal-link" href="/upload">Open the full upload page →</a>
      </div>
    `;
    document.body.appendChild(modal);

    dialog = modal.querySelector('.upload-modal-dialog');
    root = modal.querySelector('[data-el="uploadRoot"]');

    modal.addEventListener('click', e => {
      if (e.target.hasAttribute('data-modal-close')) closeUploadModal();
    });

    if (!keydownBound) {
      document.addEventListener('keydown', onKeydown);
      keydownBound = true;
    }
  }

  function focusables() {
    return modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
  }

  function onKeydown(e) {
    if (!modal || !modal.classList.contains('open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeUploadModal();
      return;
    }
    if (e.key === 'Tab') {
      const f = Array.from(focusables());
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }

  function openUploadModal(fileOrOpts) {
    buildModal();
    if (!widget && typeof window.initUploadWidget === 'function') {
      widget = window.initUploadWidget(root);
      const link = modal.querySelector('.upload-modal-link');
      if (link && widget && widget.root) {
        widget.root.addEventListener('upload:start', () => link.classList.add('hidden-during-upload'));
        widget.root.addEventListener('upload:success', () => link.classList.add('hidden-during-upload'));
        widget.root.addEventListener('upload:reset', () => link.classList.remove('hidden-during-upload'));
      }
    }
    lastFocused = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    var isFile = fileOrOpts instanceof File;
    var mode = (!isFile && fileOrOpts && fileOrOpts.mode) ? fileOrOpts.mode : null;

    if (isFile && widget && typeof widget.setFile === 'function') {
      widget.setFile(fileOrOpts);
    } else if (mode && widget && typeof widget.setMode === 'function') {
      widget.setMode(mode);
    }

    setTimeout(() => {
      const f = focusables();
      if (f.length) f[0].focus();
    }, 0);
  }

  function closeUploadModal() {
    if (!modal) return;
    if (widget && typeof widget.isUploading === 'function' && widget.isUploading()) {
      const ok = window.confirm('An upload is in progress. Closing now will cancel it. Cancel the upload?');
      if (!ok) return;
    }
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
  }

  window.openUploadModal = openUploadModal;
  window.closeUploadModal = closeUploadModal;
})();
