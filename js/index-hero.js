(function () {
  var dropZone = document.getElementById('heroDropZone');
  var fileInput = document.getElementById('heroFileInput');
  var heroLinkBtn = document.getElementById('heroLinkBtn');
  var heroLinkInput = document.getElementById('heroLinkInput');
  var heroLinkDetected = document.getElementById('heroLinkDetected');
  var heroDropError = document.getElementById('heroDropError');
  var isLinkMode = false;
  var dropErrorTimer = null;
  var linkHintTimer = null;

  var NOT_VIDEO_MESSAGE = 'That isn\u2019t a video file. Choose an MP4, MOV, or WebM.';
  var UNRECOGNIZED_LINK_MESSAGE =
    'We don\u2019t recognize that link. Paste a YouTube, Vimeo, Dailymotion, Loom, or Wistia video URL.';

  /** Show a short message inside the drop zone; auto-clears after a few seconds. */
  function showDropError(msg) {
    if (!heroDropError) return;
    heroDropError.textContent = msg;
    if (dropErrorTimer) clearTimeout(dropErrorTimer);
    dropErrorTimer = setTimeout(clearDropError, 6000);
  }
  function clearDropError() {
    if (!heroDropError) return;
    heroDropError.textContent = '';
    if (dropErrorTimer) { clearTimeout(dropErrorTimer); dropErrorTimer = null; }
  }

  function rejectFile(file) {
    dropZone.classList.add('reject');
    setTimeout(function () { dropZone.classList.remove('reject'); }, 500);
    showDropError(file && file.name
      ? '\u201C' + file.name + '\u201D isn\u2019t a video file. Choose an MP4, MOV, or WebM.'
      : NOT_VIDEO_MESSAGE);
  }

  function resetToUploadMode() {
    isLinkMode = false;
    dropZone.classList.remove('hero-link-mode');
    heroLinkBtn.textContent = 'paste a video link';
    heroLinkInput.value = '';
    heroLinkDetected.textContent = '';
    heroLinkDetected.classList.remove('error');
    if (linkHintTimer) { clearTimeout(linkHintTimer); linkHintTimer = null; }
    clearDropError();
    dropZone.setAttribute('aria-label', 'Upload a video \u2014 click to browse or drag and drop');
    dropZone.setAttribute('role', 'button');
    dropZone.setAttribute('tabindex', '0');
  }

  function requireAuth(cb) {
    (window.__vsAuthReady || Promise.resolve(false)).then(function () {
      if (window.__vsSignedIn || window.__vsUploadRequiresAuth === false) {
        cb();
      } else {
        window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      }
    });
  }

  fileInput.addEventListener('change', function () {
    var f = fileInput.files[0];
    if (f && f.type.startsWith('video/')) {
      clearDropError();
      requireAuth(function () { window.openUploadModal(f); });
    } else if (f) {
      rejectFile(f);
    }
    fileInput.value = '';
  });

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    if (isLinkMode) return;
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', function (e) {
    if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    if (isLinkMode) return;
    dropZone.classList.remove('drag-over');
    var file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      clearDropError();
      requireAuth(function () { window.openUploadModal(file); });
    } else if (file) {
      rejectFile(file);
    } else {
      // Dropped text/URL rather than a file
      var text = e.dataTransfer.getData && e.dataTransfer.getData('text');
      if (text && /^https?:\/\//i.test(text.trim())) {
        dropZone.classList.add('reject');
        setTimeout(function () { dropZone.classList.remove('reject'); }, 500);
        showDropError('To share a link, use \u201Cpaste a video link\u201D below instead of dropping it here.');
      }
    }
  });

  dropZone.addEventListener('keydown', function (e) {
    if (isLinkMode) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  heroLinkBtn.addEventListener('click', function (e) {
    e.preventDefault();
    isLinkMode = !isLinkMode;
    dropZone.classList.toggle('hero-link-mode', isLinkMode);
    if (isLinkMode) {
      heroLinkBtn.textContent = 'upload a video';
      dropZone.setAttribute('aria-label', 'Paste a video link');
      dropZone.removeAttribute('role');
      dropZone.setAttribute('tabindex', '-1');
      setTimeout(function () { heroLinkInput.focus(); }, 200);
    } else {
      resetToUploadMode();
    }
  });

  heroLinkInput.addEventListener('input', function () {
    var val = heroLinkInput.value.trim();
    heroLinkDetected.textContent = '';
    heroLinkDetected.classList.remove('error');
    if (linkHintTimer) { clearTimeout(linkHintTimer); linkHintTimer = null; }
    if (!val) return;

    var res = window.LinkParser ? window.LinkParser.parse(val) : null;
    if (res) {
      requireAuth(function () {
        window.openUploadModal({ mode: 'link' });
        setTimeout(function () {
          var modalInput = document.querySelector('#uploadModal .link-input');
          if (modalInput) {
            modalInput.value = val;
            modalInput.dispatchEvent(new Event('input'));
          }
        }, 50);
        resetToUploadMode();
      });
    } else if (window.LinkParser && window.LinkParser.isUnsupportedHost(val)) {
      heroLinkDetected.textContent =
        'Cloud-storage links (Dropbox, Google Drive, OneDrive, iCloud) can\u2019t be embedded. ' +
        'Download the file and upload it here instead.';
      heroLinkDetected.classList.add('error');
    } else if (/^https?:\/\/\S+\.\S+/i.test(val) || /^www\.\S+\.\S+/i.test(val)) {
      // Looks like a complete URL but isn't one we support. Wait briefly so
      // we don't flash the message while the user is still pasting/typing.
      linkHintTimer = setTimeout(function () {
        if (heroLinkInput.value.trim() !== val) return;
        heroLinkDetected.textContent = UNRECOGNIZED_LINK_MESSAGE;
        heroLinkDetected.classList.add('error');
      }, 700);
    }
  });
})();
