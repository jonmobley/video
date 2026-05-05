(function () {
  var dropZone = document.getElementById('heroDropZone');
  var fileInput = document.getElementById('heroFileInput');
  var heroLinkBtn = document.getElementById('heroLinkBtn');
  var heroLinkInput = document.getElementById('heroLinkInput');
  var heroLinkDetected = document.getElementById('heroLinkDetected');
  var isLinkMode = false;

  function resetToUploadMode() {
    isLinkMode = false;
    dropZone.classList.remove('hero-link-mode');
    heroLinkBtn.textContent = 'paste a video link';
    heroLinkInput.value = '';
    heroLinkDetected.textContent = '';
    heroLinkDetected.classList.remove('error');
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
      requireAuth(function () { window.openUploadModal(f); });
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
      requireAuth(function () { window.openUploadModal(file); });
    } else if (file) {
      dropZone.classList.add('reject');
      setTimeout(function () { dropZone.classList.remove('reject'); }, 500);
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
      heroLinkDetected.textContent = 'Dropbox/Drive links aren\u2019t supported here';
      heroLinkDetected.classList.add('error');
    }
  });
})();
