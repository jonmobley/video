/* VidShare upload widget — shared by /upload and the home-page modal.
 * Usage: initUploadWidget(rootElement). Renders the upload card markup
 * inside the given root and wires up all behavior scoped to that root,
 * so multiple instances do not collide via document.getElementById. */

(function () {
  const CHUNK_SIZE = 3 * 1024 * 1024;
  const MAX_SIZE = 1024 * 1024 * 1024;
  let widgetCounter = 0;

  const TEMPLATE = `
    <div class="mode-tabs" role="tablist" data-el="modeTabs">
      <button type="button" class="mode-tab active" data-el="tabFile" role="tab" aria-selected="true">Upload a file</button>
      <button type="button" class="mode-tab" data-el="tabLink" role="tab" aria-selected="false">Paste a link</button>
    </div>

    <div class="mode-panel active" data-el="panelFile">
      <div class="drop-zone" data-el="dropZone">
        <input type="file" data-el="fileInput" accept="video/*" multiple aria-label="Choose one or more video files">
        <span class="drop-icon-wrap">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="url(#vsGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <defs><linearGradient id="vsGrad" x1="0" x2="1" y1="0" x2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset="1" stop-color="#4ecdc4"/></linearGradient></defs>
            <path d="M12 16V4M12 4l-5 5M12 4l5 5"/>
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
          </svg>
        </span>
        <div class="drop-label">Tap to choose video(s)</div>
        <div class="drop-sub">Pick one or several · Any format</div>
        <div class="size-limit">Max 1 GB per file · Up to 10 in a collection</div>
      </div>

      <div class="files-list" data-el="filesList" hidden></div>

      <div class="file-preview" data-el="filePreview">
        <span class="file-icon-wrap">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="#4ecdc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="6" width="14" height="12" rx="2"/>
            <path d="M22 8l-6 4 6 4V8z"/>
          </svg>
        </span>
        <div class="file-info">
          <div class="file-name" data-el="fileName"></div>
          <div class="file-size-txt" data-el="fileSizeTxt"></div>
        </div>
        <button type="button" class="file-remove" data-el="fileRemove" aria-label="Remove file">✕</button>
      </div>
    </div>

    <div class="mode-panel" data-el="panelLink">
      <div class="link-zone">
        <span class="drop-icon-wrap">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="url(#vsGrad2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <defs><linearGradient id="vsGrad2" x1="0" x2="1" y1="0" x2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset="1" stop-color="#4ecdc4"/></linearGradient></defs>
            <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/>
            <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>
          </svg>
        </span>
        <div class="link-zone-label">Paste a video link</div>
        <div class="link-zone-sub">We'll embed it on a shareable watch page.</div>
        <input type="url" class="link-input" data-el="linkInput"
               placeholder="YouTube, Vimeo, Dailymotion, Loom, or Wistia URL"
               autocomplete="off" spellcheck="false" aria-label="Video URL">
        <div class="link-detected" data-el="linkDetected" aria-live="polite"></div>
      </div>
    </div>

    <div class="fields hidden" data-el="fieldsArea">
      <div class="field">
        <label data-el="titleLabel">Title</label>
        <input type="text" data-el="titleInput" placeholder="e.g. Practice run – June 3" maxlength="120" required>
      </div>
      <div class="fields-row">
        <div class="field">
          <label>Link expires</label>
          <select data-el="expirySelect">
            <option value="1">1 day</option>
            <option value="7" selected>7 days</option>
            <option value="30">30 days</option>
            <option value="never">Never</option>
          </select>
        </div>
        <div class="field">
          <label>Password (optional)</label>
          <input type="password" data-el="passwordInput" placeholder="Leave blank = public" maxlength="64">
        </div>
      </div>
    </div>

    <div class="link-note password-note" data-el="passwordNote" hidden>
      Heads up: password and expiration only protect this watch page.
      Anyone with the original video URL can still view it on the source platform.
    </div>

    <button type="button" class="btn upload-btn" data-el="uploadBtn">Upload &amp; Get Link</button>

    <div class="progress-area" data-el="progressArea" role="status" aria-live="polite">
      <div class="progress-label">
        <span data-el="progressText">Uploading…</span>
        <span data-el="progressPct">0%</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" data-el="progressFill"></div>
      </div>
    </div>

    <div class="error-msg" data-el="errorMsg" role="alert" aria-live="assertive"></div>

    <div class="success-area" data-el="successArea" role="status" aria-live="polite">
      <div class="success-icon-wrap">
        <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="5 12 10 17 19 8"/>
        </svg>
      </div>
      <div class="success-title">Ready to share!</div>
      <div class="success-sub" data-el="successSub">Copy the link and send it to anyone.</div>

      <div class="meta-row" data-el="metaRow"></div>

      <div class="share-link-box" data-el="shareLink"></div>
      <button type="button" class="btn copy-btn" data-el="copyBtn">Copy Link</button>

      <div class="qr-disclosure" data-el="qrDisclosure">
        <button type="button" class="qr-toggle" data-el="qrToggle" aria-expanded="false">
          <svg class="qr-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.01"/>
          </svg>
          <span class="qr-toggle-label" data-el="qrToggleLabel">Show QR code</span>
          <svg class="qr-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="qr-panel" data-el="qrPanel" hidden>
          <div class="qr-wrap" data-el="qrWrap">
            <img data-el="qrImg" src="" alt="QR Code" width="160" height="160">
            <div class="qr-label">Scan to watch</div>
            <button type="button" class="qr-download-btn" data-el="qrDownloadBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Download QR code</span>
            </button>
          </div>
        </div>
      </div>

      <button type="button" class="btn watch-link-btn" data-el="watchLinkBtn">Watch it now ↗</button>
      <button type="button" class="btn another-btn" data-el="anotherBtn">Upload another video</button>

      <p class="account-nudge" data-el="accountNudge">
        Want to manage this video later?
        <a href="/login">Create a free account →</a>
      </p>
    </div>
  `;

  function arrayBufferToBase64(ab) {
    const bytes = new Uint8Array(ab);
    const WINDOW = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += WINDOW) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + WINDOW));
    }
    return btoa(binary);
  }

  function formatBytes(b) {
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  // Parse server error responses tolerantly. New shape is
  // { error: { code, message } }; legacy shape was { error: 'string' }.
  // Returns { code, message } so callers can branch on either.
  async function parseErrJson(res) {
    try {
      const j = await res.json();
      if (j && j.error && typeof j.error === 'object') {
        return { code: j.error.code || 'ERROR', message: j.error.message || '' };
      }
      if (j && typeof j.error === 'string') {
        return { code: 'ERROR', message: j.error };
      }
    } catch {}
    return { code: 'ERROR', message: '' };
  }

  // Retry a chunk upload up to MAX_TRIES times on transient failures
  // (network errors, 5xx, 408, 429). 4xx validation failures bail immediately.
  async function retryChunk(fn, chunkIndex) {
    const MAX_TRIES = 4;
    let lastErr;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const status = err && err.status;
        const transient = !status || status >= 500 || status === 408 || status === 429;
        if (!transient || attempt === MAX_TRIES) throw err;
        // Exponential backoff with jitter, capped at ~6s.
        const delay = Math.min(6000, 500 * Math.pow(2, attempt - 1)) + Math.random() * 250;
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  function genId() {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getExt(file) {
    const parts = file.name.split('.');
    if (parts.length > 1) return parts.pop().toLowerCase();
    const m = file.type;
    if (m === 'video/mp4') return 'mp4';
    if (m === 'video/quicktime') return 'mov';
    if (m === 'video/webm') return 'webm';
    return 'mp4';
  }

  // Capture a frame from the just-uploaded file and POST it to the server
  // as a thumbnail. Wrapped in a try/catch and never awaited from the upload
  // happy-path so any failure (capture, network, server 4xx/5xx) is silent.
  async function captureAndUploadThumbnail(file, videoId) {
    try {
      if (typeof window.captureVideoThumbnail !== 'function') return;
      const result = await window.captureVideoThumbnail(file);
      if (!result || !result.base64) return;
      await fetch('/api/upload-thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          data: result.base64,
          contentType: result.contentType || 'image/jpeg'
        })
      });
    } catch (err) {
      console.warn('Thumbnail capture/upload failed (non-fatal):', err);
    }
  }

  function deriveTitleFromFilename(name) {
    const lastDot = name.lastIndexOf('.');
    const base = lastDot > 0 ? name.slice(0, lastDot) : name;
    return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function initUploadWidget(root) {
    if (!root || root.dataset.uploadInitialized === '1') return;
    root.dataset.uploadInitialized = '1';
    root.classList.add('upload-card');
    root.innerHTML = TEMPLATE;

    const $ = name => root.querySelector(`[data-el="${name}"]`);
    const dropZone = $('dropZone');
    const fileInput = $('fileInput');
    const filesList = $('filesList');
    const filePreview = $('filePreview');
    const fileName = $('fileName');
    const fileSizeTxt = $('fileSizeTxt');
    const fileRemove = $('fileRemove');
    const fieldsArea = $('fieldsArea');
    const titleInput = $('titleInput');
    const titleLabel = $('titleLabel');
    const expirySelect = $('expirySelect');
    const passwordInput = $('passwordInput');
    const passwordNote = $('passwordNote');
    const uploadBtn = $('uploadBtn');
    const progressArea = $('progressArea');
    const progressText = $('progressText');
    const progressPct = $('progressPct');
    const progressFill = $('progressFill');
    const errorMsg = $('errorMsg');
    const successArea = $('successArea');
    const shareLink = $('shareLink');
    const copyBtn = $('copyBtn');
    const watchLinkBtn = $('watchLinkBtn');
    const anotherBtn = $('anotherBtn');
    const qrImg = $('qrImg');
    const metaRow = $('metaRow');
    const successSub = $('successSub');
    const accountNudge = $('accountNudge');

    const modeTabs = $('modeTabs');
    const tabFile = $('tabFile');
    const tabLink = $('tabLink');
    const qrDisclosure = $('qrDisclosure');
    const qrToggle = $('qrToggle');
    const qrToggleLabel = $('qrToggleLabel');
    const qrPanel = $('qrPanel');
    const qrDownloadBtn = $('qrDownloadBtn');

    let currentVideoId = null;
    let currentTitle = null;
    let currentWatchUrl = null;
    const panelFile = $('panelFile');
    const panelLink = $('panelLink');
    const linkInput = $('linkInput');
    const linkDetected = $('linkDetected');

    let selectedFile = null;
    let selectedFiles = [];       // multi-file collection mode
    let isCollectionMode = false; // true when 2+ files selected
    let mode = 'file';            // 'file' | 'link'
    let parsedLink = null;        // { platform, videoId } | null
    let uploading = false;
    let isSignedIn = false;

    const wid = 'uw' + (++widgetCounter);
    panelFile.id = wid + '_file';
    panelFile.setAttribute('role', 'tabpanel');
    panelFile.setAttribute('aria-labelledby', wid + '_tabFile');
    panelLink.id = wid + '_link';
    panelLink.setAttribute('role', 'tabpanel');
    panelLink.setAttribute('aria-labelledby', wid + '_tabLink');
    tabFile.id = wid + '_tabFile';
    tabFile.setAttribute('aria-controls', wid + '_file');
    tabLink.id = wid + '_tabLink';
    tabLink.setAttribute('aria-controls', wid + '_link');

    titleInput.id = wid + '_title';
    titleInput.closest('.field').querySelector('label').setAttribute('for', wid + '_title');
    expirySelect.id = wid + '_expiry';
    expirySelect.closest('.field').querySelector('label').setAttribute('for', wid + '_expiry');
    passwordInput.id = wid + '_password';
    passwordInput.closest('.field').querySelector('label').setAttribute('for', wid + '_password');

    progressFill.setAttribute('role', 'progressbar');
    progressFill.setAttribute('aria-valuemin', '0');
    progressFill.setAttribute('aria-valuemax', '100');
    progressFill.setAttribute('aria-valuenow', '0');

    let isPaidUser = false;
    const authReady = fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async r => {
        if (!r.ok) return false;
        try {
          const data = await r.json();
          isSignedIn = true;
          if (data && data.is_paid) {
            isPaidUser = true;
            expirySelect.value = 'never';
            expirySelect.disabled = true;
          }
          return true;
        } catch { return false; }
      })
      .catch(() => false);

    function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.add('visible'); }
    function hideError() { errorMsg.classList.remove('visible'); }
    function setProgress(pct, label) {
      progressFill.style.width = pct + '%';
      progressFill.setAttribute('aria-valuenow', String(pct));
      progressPct.textContent = pct + '%';
      progressText.textContent = label || 'Uploading…';
    }

    function setMode(next) {
      mode = next;
      tabFile.classList.toggle('active', mode === 'file');
      tabLink.classList.toggle('active', mode === 'link');
      tabFile.setAttribute('aria-selected', mode === 'file');
      tabLink.setAttribute('aria-selected', mode === 'link');
      panelFile.classList.toggle('active', mode === 'file');
      panelLink.classList.toggle('active', mode === 'link');

      // Fields are visible in link mode (always) or file mode whenever the user
      // has picked at least one file (single OR collection).
      const hasAnyFile = !!selectedFile || selectedFiles.length > 0;
      const showFields = mode === 'link' ? true : hasAnyFile;
      fieldsArea.style.display = showFields ? 'flex' : 'none';
      uploadBtn.classList.toggle('visible', showFields);
      // Preserve the collection-mode label when returning to the file tab.
      if (mode === 'link') {
        uploadBtn.textContent = 'Create Watch Link';
      } else if (isCollectionMode) {
        uploadBtn.textContent = 'Upload & Share Collection';
      } else {
        uploadBtn.textContent = 'Upload & Get Link';
      }

      hideError();
      updateUploadBtnState();
    }

    tabFile.addEventListener('click', () => setMode('file'));
    tabLink.addEventListener('click', () => setMode('link'));

    linkInput.addEventListener('input', () => {
      const val = linkInput.value.trim();
      parsedLink = null;
      linkDetected.textContent = '';
      linkDetected.classList.remove('error');

      if (!val) {
        updateUploadBtnState();
        return;
      }

      const res = window.LinkParser ? window.LinkParser.parse(val) : null;
      if (res) {
        parsedLink = res;
        const platformNames = { youtube: 'YouTube', vimeo: 'Vimeo', dailymotion: 'Dailymotion', loom: 'Loom', wistia: 'Wistia' };
        linkDetected.textContent = `Detected: ${platformNames[res.platform] || res.platform} video`;
      } else if (window.LinkParser && window.LinkParser.isUnsupportedHost(val)) {
        linkDetected.textContent = 'Dropbox/Drive links aren\u2019t supported. Upload the file directly, or paste a supported video link.';
        linkDetected.classList.add('error');
      } else {
        linkDetected.textContent = 'Not a recognized video URL';
        linkDetected.classList.add('error');
      }
      updateUploadBtnState();
    });

    function updateUploadBtnState() {
      if (mode === 'file') {
        const hasFiles = isCollectionMode ? selectedFiles.length > 0 : !!selectedFile;
        const hasTitle = titleInput.value.trim().length > 0;
        uploadBtn.disabled = !(hasFiles && hasTitle);
      } else {
        const hasLink = !!parsedLink;
        const hasTitle = titleInput.value.trim().length > 0;
        uploadBtn.disabled = !(hasLink && hasTitle);
      }
    }

    function applyCollectionMode(on) {
      isCollectionMode = on;
      if (on) {
        titleLabel.textContent = 'Collection title';
        titleInput.placeholder = 'e.g. June practice videos';
        uploadBtn.textContent = 'Upload & Share Collection';
      } else {
        titleLabel.textContent = 'Title';
        titleInput.placeholder = 'e.g. Practice run – June 3';
        uploadBtn.textContent = mode === 'link' ? 'Create Watch Link' : 'Upload & Get Link';
      }
    }

    function renderFilesList() {
      // Multi-file preview list. Each row shows name + size + remove button.
      filesList.innerHTML = '';
      selectedFiles.forEach((f, idx) => {
        const row = document.createElement('div');
        row.className = 'files-list-row';
        row.innerHTML =
          `<div class="files-list-info">
             <div class="files-list-name"></div>
             <div class="files-list-size">${formatBytes(f.size)}</div>
           </div>
           <button type="button" class="files-list-remove" data-idx="${idx}" aria-label="Remove file">✕</button>`;
        row.querySelector('.files-list-name').textContent = f.name;
        filesList.appendChild(row);
      });
      const summary = document.createElement('div');
      summary.className = 'files-list-summary';
      summary.textContent = `${selectedFiles.length} videos · ${formatBytes(selectedFiles.reduce((s, f) => s + f.size, 0))}`;
      filesList.appendChild(summary);
    }

    function setFile(file) {
      if (file.size > MAX_SIZE) {
        showError(`File is too large (${formatBytes(file.size)}). Maximum size is 1 GB.`);
        return;
      }
      if (mode !== 'file') setMode('file');
      applyCollectionMode(false);
      selectedFile = file;
      selectedFiles = [];
      filesList.hidden = true;
      fileName.textContent = file.name;
      fileSizeTxt.textContent = formatBytes(file.size);
      filePreview.classList.add('visible');
      fieldsArea.style.display = 'flex';
      uploadBtn.classList.add('visible');
      dropZone.style.display = 'none';
      if (!titleInput.value.trim()) {
        titleInput.value = deriveTitleFromFilename(file.name);
      }
      updateUploadBtnState();
      hideError();
    }

    function setFiles(files) {
      // Validate every file up-front so we don't get half-way through and fail.
      const oversized = files.find(f => f.size > MAX_SIZE);
      if (oversized) {
        showError(`"${oversized.name}" is too large (${formatBytes(oversized.size)}). Maximum size is 1 GB per file.`);
        return;
      }
      if (files.length > 10) {
        showError(`Too many files (${files.length}). A collection can contain at most 10 videos.`);
        return;
      }
      if (mode !== 'file') setMode('file');
      applyCollectionMode(true);
      selectedFile = null;
      selectedFiles = files;
      filePreview.classList.remove('visible');
      filesList.hidden = false;
      renderFilesList();
      fieldsArea.style.display = 'flex';
      uploadBtn.classList.add('visible');
      dropZone.style.display = 'none';
      if (!titleInput.value.trim()) {
        titleInput.value = `Collection · ${new Date().toLocaleDateString()}`;
      }
      updateUploadBtnState();
      hideError();
    }

    function clearFile() {
      selectedFile = null;
      selectedFiles = [];
      isCollectionMode = false;
      fileInput.value = '';
      filePreview.classList.remove('visible');
      filesList.hidden = true;
      filesList.innerHTML = '';
      applyCollectionMode(false);
      fieldsArea.style.display = 'none';
      uploadBtn.classList.remove('visible');
      dropZone.style.display = '';
      hideError();
    }

    function removeFileAt(idx) {
      selectedFiles.splice(idx, 1);
      if (selectedFiles.length === 0) { clearFile(); return; }
      if (selectedFiles.length === 1) { setFile(selectedFiles[0]); return; }
      renderFilesList();
      updateUploadBtnState();
    }

    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      if (files.length === 0) return;
      if (files.length === 1) setFile(files[0]);
      else setFiles(files);
    });
    fileRemove.addEventListener('click', clearFile);
    filesList.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.files-list-remove');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      if (!isNaN(idx)) removeFileAt(idx);
    });
    titleInput.addEventListener('input', updateUploadBtnState);

    function updatePasswordNote() {
      passwordNote.hidden = passwordInput.value.length === 0;
    }
    passwordInput.addEventListener('input', updatePasswordNote);

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      const dropped = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('video/'));
      if (dropped.length === 0) { showError('Please drop a video file.'); return; }
      if (dropped.length === 1) setFile(dropped[0]);
      else setFiles(dropped);
    });

    function finishSuccess(videoId, opts) {
      const { title, expiryDays, password, isLink, platform } = opts || {};

      try {
        const KEY = 'vs_pending_claims';
        const raw = localStorage.getItem(KEY);
        const list = raw ? JSON.parse(raw) : [];
        const cleaned = Array.isArray(list) ? list.filter(e => e && typeof e.id === 'string') : [];
        cleaned.push({ id: videoId, ts: Date.now() });
        localStorage.setItem(KEY, JSON.stringify(cleaned.slice(-50)));
      } catch {}

      const watchUrl = window.location.origin + '/watch?id=' + encodeURIComponent(videoId);

      currentVideoId = videoId;
      currentTitle = title || null;
      currentWatchUrl = watchUrl;

      setTimeout(() => {
        progressArea.classList.remove('visible');
        successArea.classList.add('visible');
        if (modeTabs) modeTabs.style.display = 'none';
        shareLink.textContent = watchUrl;
        watchLinkBtn.dataset.url = watchUrl;
        qrPanel.hidden = true;
        qrToggle.setAttribute('aria-expanded', 'false');
        qrToggleLabel.textContent = 'Show QR code';
        qrDisclosure.classList.remove('open');

        metaRow.innerHTML = '';
        if (title) {
          const b = document.createElement('span');
          b.className = 'meta-badge'; b.textContent = title;
          metaRow.appendChild(b);
        }
        if (isLink && platform) {
          const pb = document.createElement('span');
          pb.className = 'meta-badge';
          const pNames = { youtube: 'YouTube', vimeo: 'Vimeo', dailymotion: 'Dailymotion', loom: 'Loom', wistia: 'Wistia' };
          pb.textContent = `${pNames[platform] || platform} embed`;
          metaRow.appendChild(pb);
        }
        const expBadge = document.createElement('span');
        expBadge.className = 'meta-badge';
        expBadge.textContent = expiryDays === 'never' ? 'No expiry' : `Expires in ${expiryDays} day${expiryDays === '1' ? '' : 's'}`;
        metaRow.appendChild(expBadge);
        if (password) {
          const pb = document.createElement('span');
          pb.className = 'meta-badge'; pb.textContent = 'Password protected';
          metaRow.appendChild(pb);
        }

        if (isLink) {
          successSub.textContent = password
            ? 'Share the watch link — recipients will need the password. (Anyone who already has the original video URL can still view it there.)'
            : 'Share the watch link with anyone. (Anyone who already has the original video URL can still view it there.)';
        } else {
          successSub.textContent = password
            ? 'Share the link — recipients will need the password to watch.'
            : 'Copy the link and send it to anyone.';
        }

        authReady.then(signedIn => {
          accountNudge.classList.toggle('visible', !signedIn);
        });

        qrImg.src = renderQrDataUrl(watchUrl);

        navigator.clipboard.writeText(watchUrl).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => { copyBtn.textContent = 'Copy Link'; copyBtn.classList.remove('copied'); }, 3000);
        }).catch(() => {});

        root.dispatchEvent(new CustomEvent('upload:success', { detail: { videoId, watchUrl } }));
      }, 400);
    }

    uploadBtn.addEventListener('click', startUpload);

    async function startUpload() {
      // Debounce double-clicks: while an upload is in flight, ignore further
      // button presses so we don't kick off two parallel uploads.
      if (uploading) return;
      if (mode === 'link') {
        return startLinkUpload();
      }
      if (isCollectionMode) {
        return startCollectionUpload();
      }
      if (!selectedFile) return;
      const title = titleInput.value.trim();
      if (!title) {
        showError('Please add a title for your video.');
        titleInput.focus();
        return;
      }
      const file = selectedFile;
      const ext = getExt(file);
      const videoId = genId() + '.' + ext;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const expiryDays = expirySelect.value;
      const password = passwordInput.value;

      uploadBtn.classList.remove('visible');
      filePreview.classList.remove('visible');
      fieldsArea.style.display = 'none';
      progressArea.classList.add('visible');
      if (modeTabs) modeTabs.style.display = 'none';
      hideError();
      setProgress(0, 'Preparing…');
      uploading = true;
      root.dispatchEvent(new CustomEvent('upload:start'));

      try {
        if (file.size === 0) {
          throw new Error('That file is empty (0 bytes). Please pick another video.');
        }
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const slice = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
          const ab = await slice.arrayBuffer();
          const base64 = arrayBufferToBase64(ab);

          setProgress(Math.round((i / totalChunks) * 85), 'Uploading…');

          // Retry transient failures (network blips, 5xx) with capped exponential
          // backoff. The server's UPSERT makes chunk PUTs idempotent so re-trying
          // is safe. We give up on 4xx (validation, rate-limit, auth).
          await retryChunk(async () => {
            const res = await fetch('/api/upload-chunk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoId, chunkIndex: i, totalChunks, data: base64, contentType: file.type || 'video/mp4' })
            });
            if (!res.ok) {
              const err = await parseErrJson(res);
              const e = new Error(err.message || `Chunk ${i} failed`);
              e.status = res.status;
              throw e;
            }
          }, i);
        }

        setProgress(92, 'Finalizing…');

        const finalRes = await fetch('/api/finalize-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, totalChunks, contentType: file.type || 'video/mp4', title, expiryDays, password })
        });
        if (!finalRes.ok) {
          const err = await parseErrJson(finalRes);
          throw new Error(err.message || 'Finalize failed');
        }

        setProgress(100, 'Done!');
        uploading = false;
        // Fire-and-forget thumbnail capture: a frame-grab failure (corrupt
        // file, unsupported codec, slow decoder) must NEVER fail the upload
        // or block the success UI. Worst case, the card shows a placeholder.
        captureAndUploadThumbnail(file, videoId);
        finishSuccess(videoId, { title, expiryDays, password, isLink: false });

      } catch (err) {
        uploading = false;
        progressArea.classList.remove('visible');
        uploadBtn.classList.add('visible');
        filePreview.classList.add('visible');
        fieldsArea.style.display = 'flex';
        if (modeTabs) modeTabs.style.display = '';
        root.dispatchEvent(new CustomEvent('upload:reset'));
        showError('Upload failed: ' + err.message);
      }
    }

    async function startLinkUpload() {
      if (!parsedLink) return;
      const title = titleInput.value.trim();
      if (!title) {
        showError('Please add a title for your video.');
        titleInput.focus();
        return;
      }
      const url = linkInput.value.trim();
      const expiryDays = expirySelect.value;
      const password = passwordInput.value;

      uploadBtn.classList.remove('visible');
      panelLink.style.display = 'none';
      fieldsArea.style.display = 'none';
      progressArea.classList.add('visible');
      if (modeTabs) modeTabs.style.display = 'none';
      hideError();
      setProgress(50, 'Submitting link…');
      uploading = true;
      root.dispatchEvent(new CustomEvent('upload:start'));

      try {
        const res = await fetch('/api/create-link-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, title, expiryDays, password })
        });
        if (!res.ok) {
          const errData = await parseErrJson(res);
          const err = new Error(errData.message || 'Failed to create link video');
          err._errorCode = errData.code;
          throw err;
        }
        const data = await res.json();
        setProgress(100, 'Done!');
        uploading = false;
        finishSuccess(data.videoId, { title, expiryDays, password, isLink: true, platform: data.platform });
        if (data.warning) {
          showError(data.warning);
        }
      } catch (err) {
        uploading = false;
        progressArea.classList.remove('visible');
        uploadBtn.classList.add('visible');
        panelLink.style.display = '';
        fieldsArea.style.display = 'flex';
        if (modeTabs) modeTabs.style.display = '';
        root.dispatchEvent(new CustomEvent('upload:reset'));
        const isUnavailable = err._errorCode === 'VIDEO_UNAVAILABLE';
        showError(isUnavailable ? err.message : 'Submission failed: ' + err.message);
      }
    }

    async function startCollectionUpload() {
      // Multi-file flow: requires sign-in (collections are owned). Sequentially
      // uploads each file (reuses the existing chunked upload + finalize), then
      // creates a collection and attaches each video. Aborts on the first hard
      // failure to keep the UX simple — user can retry the whole batch.
      const collectionTitle = titleInput.value.trim();
      if (!collectionTitle) {
        showError('Please add a collection title.');
        titleInput.focus();
        return;
      }
      const files = selectedFiles.slice();
      if (files.length < 2) return;

      // Wait for the auth probe and bail out if not signed in.
      await authReady;
      if (!isSignedIn) {
        showError('Please sign in first to create a shareable collection.');
        // Soft hint: most users land here without realizing they need an account.
        setTimeout(() => {
          window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
        }, 1500);
        return;
      }

      const expiryDays = expirySelect.value;
      const password = passwordInput.value;

      uploadBtn.classList.remove('visible');
      filesList.hidden = true;
      fieldsArea.style.display = 'none';
      progressArea.classList.add('visible');
      if (modeTabs) modeTabs.style.display = 'none';
      hideError();
      setProgress(0, 'Preparing collection…');
      uploading = true;
      root.dispatchEvent(new CustomEvent('upload:start'));

      try {
        // 1) Create collection up-front so a partial-upload failure still
        //    leaves an empty collection the user can retry into.
        const cRes = await fetch('/api/collections', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: collectionTitle })
        });
        if (!cRes.ok) {
          const err = await parseErrJson(cRes);
          throw new Error(err.message || 'Could not create collection');
        }
        const { slug } = await cRes.json();

        // 2) Upload each file sequentially. Per-file progress is mapped onto a
        //    band of the overall bar (0..95% across all files).
        const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;
        let bytesDone = 0;
        const uploadedIds = [];

        for (let f = 0; f < files.length; f++) {
          const file = files[f];
          if (file.size === 0) throw new Error(`"${file.name}" is empty (0 bytes).`);
          const ext = getExt(file);
          const videoId = genId() + '.' + ext;
          const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
          const fileTitle = deriveTitleFromFilename(file.name) || file.name;

          for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const slice = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
            const ab = await slice.arrayBuffer();
            const base64 = arrayBufferToBase64(ab);

            const overallPct = Math.min(95, Math.round(((bytesDone + start) / totalBytes) * 95));
            setProgress(overallPct, `Uploading ${f + 1} of ${files.length}: ${file.name}`);

            await retryChunk(async () => {
              const res = await fetch('/api/upload-chunk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId, chunkIndex: i, totalChunks, data: base64, contentType: file.type || 'video/mp4' })
              });
              if (!res.ok) {
                const err = await parseErrJson(res);
                const e = new Error(err.message || `Chunk ${i} failed`);
                e.status = res.status;
                throw e;
              }
            }, i);
          }

          const finalRes = await fetch('/api/finalize-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId, totalChunks, contentType: file.type || 'video/mp4', title: fileTitle, expiryDays, password })
          });
          if (!finalRes.ok) {
            const err = await parseErrJson(finalRes);
            throw new Error(err.message || `Finalize failed for "${file.name}"`);
          }

          // Attach to collection. Best-effort thumbnail (fire-and-forget).
          const aRes = await fetch(`/api/collections/${encodeURIComponent(slug)}/videos`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId })
          });
          if (!aRes.ok) {
            const err = await parseErrJson(aRes);
            throw new Error(err.message || `Could not attach "${file.name}" to the collection`);
          }
          captureAndUploadThumbnail(file, videoId);
          uploadedIds.push(videoId);

          bytesDone += file.size;
        }

        setProgress(100, 'Done!');
        uploading = false;
        finishCollectionSuccess(slug, { title: collectionTitle, count: files.length, expiryDays, password });
      } catch (err) {
        uploading = false;
        progressArea.classList.remove('visible');
        uploadBtn.classList.add('visible');
        filesList.hidden = false;
        fieldsArea.style.display = 'flex';
        if (modeTabs) modeTabs.style.display = '';
        root.dispatchEvent(new CustomEvent('upload:reset'));
        showError('Upload failed: ' + err.message);
      }
    }

    function finishCollectionSuccess(slug, opts) {
      const { title, count, expiryDays, password } = opts || {};
      const collectionUrl = window.location.origin + '/c/' + encodeURIComponent(slug);

      currentVideoId = null;
      currentTitle = title || null;
      currentWatchUrl = collectionUrl;

      setTimeout(() => {
        progressArea.classList.remove('visible');
        successArea.classList.add('visible');
        if (modeTabs) modeTabs.style.display = 'none';
        shareLink.textContent = collectionUrl;
        watchLinkBtn.dataset.url = collectionUrl;
        watchLinkBtn.textContent = 'Open collection ↗';
        qrPanel.hidden = true;
        qrToggle.setAttribute('aria-expanded', 'false');
        qrToggleLabel.textContent = 'Show QR code';
        qrDisclosure.classList.remove('open');

        metaRow.innerHTML = '';
        const tBadge = document.createElement('span');
        tBadge.className = 'meta-badge'; tBadge.textContent = title;
        metaRow.appendChild(tBadge);
        const cBadge = document.createElement('span');
        cBadge.className = 'meta-badge'; cBadge.textContent = `${count} videos`;
        metaRow.appendChild(cBadge);
        const expBadge = document.createElement('span');
        expBadge.className = 'meta-badge';
        expBadge.textContent = expiryDays === 'never' ? 'No expiry' : `Expires in ${expiryDays} day${expiryDays === '1' ? '' : 's'}`;
        metaRow.appendChild(expBadge);
        if (password) {
          const pb = document.createElement('span');
          pb.className = 'meta-badge'; pb.textContent = 'Password protected';
          metaRow.appendChild(pb);
        }

        successSub.textContent = 'Share this collection link — recipients can watch each video and download them all as a zip.';
        accountNudge.classList.remove('visible'); // user is signed in by definition
        qrImg.src = renderQrDataUrl(collectionUrl);

        navigator.clipboard.writeText(collectionUrl).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => { copyBtn.textContent = 'Copy Link'; copyBtn.classList.remove('copied'); }, 3000);
        }).catch(() => {});

        root.dispatchEvent(new CustomEvent('upload:success', { detail: { collectionSlug: slug, watchUrl: collectionUrl } }));
      }, 400);
    }

    copyBtn.addEventListener('click', async () => {
      const url = shareLink.textContent;
      try { await navigator.clipboard.writeText(url); }
      catch {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copy Link'; copyBtn.classList.remove('copied'); }, 2500);
    });

    function reset() {
      successArea.classList.remove('visible');
      accountNudge.classList.remove('visible');
      if (modeTabs) modeTabs.style.display = '';
      qrPanel.hidden = true;
      qrToggle.setAttribute('aria-expanded', 'false');
      qrToggleLabel.textContent = 'Show QR code';
      qrDisclosure.classList.remove('open');
      watchLinkBtn.textContent = 'Watch it now ↗';
      currentVideoId = null;
      currentTitle = null;
      currentWatchUrl = null;
      titleInput.value = '';
      passwordInput.value = '';
      updatePasswordNote();
      linkInput.value = '';
      parsedLink = null;
      linkDetected.textContent = '';
      setMode('file');
      clearFile();
      updateUploadBtnState();
      root.dispatchEvent(new CustomEvent('upload:reset'));
    }

    anotherBtn.addEventListener('click', reset);

    watchLinkBtn.addEventListener('click', () => {
      const url = watchLinkBtn.dataset.url || currentWatchUrl;
      if (url) window.open(url, '_blank', 'noopener');
    });

    qrToggle.addEventListener('click', () => {
      const isOpen = !qrPanel.hidden;
      qrPanel.hidden = isOpen;
      qrToggle.setAttribute('aria-expanded', String(!isOpen));
      qrToggleLabel.textContent = isOpen ? 'Show QR code' : 'Hide QR code';
      qrDisclosure.classList.toggle('open', !isOpen);
    });

    function slugifyForFilename(s) {
      return (s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    }

    function renderQrDataUrl(text, opts) {
      const o = opts || {};
      const size = o.size || 160;
      const fg = o.fg || '#ffffff';
      const bg = o.bg || '#1c1c1e';
      const margin = o.margin != null ? o.margin : 2;
      if (typeof window.qrcode !== 'function') {
        console.warn('qrcode-generator library not loaded');
        return '';
      }
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      const count = qr.getModuleCount();
      const ratio = (typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 1) ? window.devicePixelRatio : 1;
      const pxSize = Math.floor(size * ratio);
      const cell = pxSize / (count + margin * 2);
      const canvas = document.createElement('canvas');
      canvas.width = pxSize;
      canvas.height = pxSize;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, pxSize, pxSize);
      ctx.fillStyle = fg;
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            const x = Math.floor((c + margin) * cell);
            const y = Math.floor((r + margin) * cell);
            const w = Math.ceil(cell);
            ctx.fillRect(x, y, w, w);
          }
        }
      }
      return canvas.toDataURL('image/png');
    }

    qrDownloadBtn.addEventListener('click', () => {
      if (!qrImg.src) return;
      const baseName = slugifyForFilename(currentTitle) || (currentVideoId ? currentVideoId.split('.')[0] : 'video');
      const filename = `vidshare-qr-${baseName}.png`;
      const a = document.createElement('a');
      a.href = qrImg.src;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    return { reset, root, isUploading: () => uploading, setFile, setMode };
  }

  if (typeof window !== 'undefined') {
    window.initUploadWidget = initUploadWidget;
  }

  // Node-only export hook so the retry/parse helpers can be unit-tested
  // without spinning up a DOM. Browsers ignore this branch.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { retryChunk, parseErrJson };
  }
})();
