/* VidShare upload widget — shared by /upload and the home-page modal.
 * Usage: initUploadWidget(rootElement). Renders the upload card markup
 * inside the given root and wires up all behavior scoped to that root,
 * so multiple instances do not collide via document.getElementById. */

(function () {
  const CHUNK_SIZE = 3 * 1024 * 1024;
  const MAX_SIZE = 1024 * 1024 * 1024;
  let widgetCounter = 0;

  // Shared friendly-error helpers. In the browser they come from
  // shared-feedback.js (loaded before this file); under Jest we require()
  // them so the widget can be unit-tested on its own.
  const Feedback = (typeof window !== 'undefined' && window.VsFeedback) ||
    (typeof require === 'function' ? require('./shared-feedback.js') : null);

  const NETWORK_UPLOAD_MESSAGE = 'Connection lost while uploading. Check your internet and try again.';

  /**
   * Convert an upload-pipeline error into a short message the user can act
   * on. Server messages (already written for end users) pass through;
   * network drops, size limits and 5xx get specific copy instead of raw
   * "Failed to fetch" / "Chunk 3 failed" text.
   */
  function describeUploadFailure(err, fallback) {
    const def = fallback || 'Upload failed. Please try again.';
    if (!err) return def;
    if (Feedback && Feedback.isNetworkError(err)) return NETWORK_UPLOAD_MESSAGE;
    if (!Feedback && /failed to fetch|networkerror|load failed/i.test(String(err.message))) {
      return NETWORK_UPLOAD_MESSAGE;
    }
    const status = err.status;
    if (status === 413) return 'That file is too large for the server. The limit is 1 GB per video.';
    if (status >= 500) return 'Something went wrong on our end. Please try again in a moment.';
    if (err.userFacing && err.message) return err.message;
    if (status && err.message) return err.message;
    if (status && Feedback) return Feedback.messageForStatus(status, def);
    if (err.message && !/^Chunk \d+ failed$/.test(err.message)) return err.message;
    return def;
  }

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
        <div class="size-limit">Max 1 GB per file · Up to 10 in a folder</div>
      </div>
      <div class="zone-error" data-el="dropError" role="alert" aria-live="assertive"></div>

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
        <div class="field-error" data-el="titleError" role="alert"></div>
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
      <div class="files-status" data-el="filesStatus" hidden></div>
      <button type="button" class="btn cancel-btn" data-el="cancelBtn" hidden>Cancel</button>
    </div>

    <div class="batch-summary" data-el="batchSummary" hidden role="status" aria-live="polite"></div>

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

      <button type="button" class="btn watch-link-btn" data-el="watchLinkBtn">Watch it now ↗</button>
      <button type="button" class="btn another-btn" data-el="anotherBtn">Upload another video</button>

      <p class="account-nudge" data-el="accountNudge">
        Want to manage this video later?
        <a href="/login">Sign in with email →</a>
        <span class="account-nudge-hint">Videos from this browser can be claimed for 24 hours after upload.</span>
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
    const dropError = $('dropError');
    const titleInput = $('titleInput');
    const titleError = $('titleError');
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
    const metaRow = $('metaRow');
    const successSub = $('successSub');
    const accountNudge = $('accountNudge');

    const modeTabs = $('modeTabs');
    const tabFile = $('tabFile');
    const tabLink = $('tabLink');
    let currentWatchUrl = null;
    const panelFile = $('panelFile');
    const panelLink = $('panelLink');
    const linkInput = $('linkInput');
    const linkDetected = $('linkDetected');

    let selectedFile = null;
    let selectedFiles = [];       // multi-file folder mode
    let isFolderMode = false;     // true when 2+ files selected
    let mode = 'file';            // 'file' | 'link'
    let parsedLink = null;        // { platform, videoId } | null
    let autoFilledTitle = null;   // last title we suggested from a pasted link
    let linkTitleFetchSeq = 0;    // ignore stale /api/link-title responses
    let linkTitleTimer = null;
    let uploading = false;
    // Per-file upload state for folder mode. Keyed by file index.
    // Each entry: { name, status, videoId, error }
    // status ∈ 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled'
    let folderState = null;
    let cancelRequested = false;
    let inFlightVideoId = null;   // chunked upload currently in progress (for cancel cleanup)
    let currentFolderSlug = null; // folder created for the current batch (for retries / cleanup)

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
    $('titleError').id = wid + '_titleError';
    expirySelect.id = wid + '_expiry';
    expirySelect.closest('.field').querySelector('label').setAttribute('for', wid + '_expiry');
    passwordInput.id = wid + '_password';
    passwordInput.closest('.field').querySelector('label').setAttribute('for', wid + '_password');

    progressFill.setAttribute('role', 'progressbar');
    progressFill.setAttribute('aria-valuemin', '0');
    progressFill.setAttribute('aria-valuemax', '100');
    progressFill.setAttribute('aria-valuenow', '0');

    let isPaidUser = false;
    let isSignedIn = false;
    let uploadRequiresAuth = true;
    const filesStatus = $('filesStatus');
    const cancelBtn = $('cancelBtn');
    const batchSummary = $('batchSummary');
    const authReady = Promise.all([
      fetch('/api/auth/me', { credentials: 'same-origin' })
        .then(async r => {
          if (!r.ok) return false;
          try {
            const data = await r.json();
            if (data && data.is_paid) {
              isPaidUser = true;
              expirySelect.value = 'never';
              expirySelect.disabled = true;
            }
            isSignedIn = true;
            return true;
          } catch { return false; }
        })
        .catch(() => false),
      fetch('/api/upload-config')
        .then(r => r.ok ? r.json() : { requireAuth: true })
        .then(cfg => { uploadRequiresAuth = cfg.requireAuth !== false; })
        .catch(() => {})
    ]).then(([signedIn]) => signedIn);

    function showError(msg) {
      errorMsg.textContent = msg;
      errorMsg.classList.remove('notice');
      errorMsg.setAttribute('role', 'alert');
      errorMsg.classList.add('visible');
    }
    // Non-blocking heads-up (e.g. "link saved, but the embed may be private")
    // — same slot as errorMsg but styled as a warning, not a failure.
    function showNotice(msg) {
      errorMsg.textContent = msg;
      errorMsg.classList.add('notice');
      errorMsg.setAttribute('role', 'status');
      errorMsg.classList.add('visible');
    }
    // Scroll an element into view on mobile so the user actually sees the new
    // state after a tap (file picked, error shown, etc.). Wrapped in try/catch
    // because some embedded webviews don't implement scrollIntoView.
    function scrollIntoViewSafe(el) {
      if (!el) return;
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    }
    function hideError() { errorMsg.classList.remove('visible'); errorMsg.classList.remove('notice'); }
    // File-selection problems (too big, wrong type, empty) belong right under
    // the drop zone the user just interacted with, not at the bottom of the card.
    function showDropError(msg) {
      dropError.textContent = msg;
      dropError.classList.add('visible');
      scrollIntoViewSafe(dropError);
    }
    function hideDropError() { dropError.textContent = ''; dropError.classList.remove('visible'); }
    function showTitleError(msg) {
      titleError.textContent = msg;
      titleError.classList.add('visible');
      titleInput.setAttribute('aria-invalid', 'true');
      titleInput.setAttribute('aria-describedby', titleError.id);
      titleInput.focus();
      scrollIntoViewSafe(titleInput);
    }
    function hideTitleError() {
      if (!titleError.classList.contains('visible')) return;
      titleError.textContent = '';
      titleError.classList.remove('visible');
      titleInput.removeAttribute('aria-invalid');
      titleInput.removeAttribute('aria-describedby');
    }
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
      // Preserve the folder-mode label when returning to the file tab.
      if (mode === 'link') {
        uploadBtn.textContent = 'Create Watch Link';
      } else if (isFolderMode) {
        uploadBtn.textContent = 'Upload & Share Folder';
      } else {
        uploadBtn.textContent = 'Upload & Get Link';
      }

      hideError();
      updateUploadBtnState();
    }

    tabFile.addEventListener('click', () => setMode('file'));
    tabLink.addEventListener('click', () => setMode('link'));

    function shouldAutoFillTitle() {
      const current = titleInput.value.trim();
      return !current || current === autoFilledTitle;
    }

    function applySuggestedTitle(title) {
      if (!title || !shouldAutoFillTitle()) return;
      titleInput.value = title;
      autoFilledTitle = title;
      updateUploadBtnState();
    }

    function scheduleLinkTitleFetch(url) {
      if (linkTitleTimer) clearTimeout(linkTitleTimer);
      const seq = ++linkTitleFetchSeq;
      linkTitleTimer = setTimeout(() => {
        linkTitleTimer = null;
        if (!shouldAutoFillTitle()) return;
        fetch('/api/link-title?url=' + encodeURIComponent(url), { credentials: 'same-origin' })
          .then(async (r) => {
            if (!r.ok) return null;
            try { return await r.json(); } catch { return null; }
          })
          .then((data) => {
            if (seq !== linkTitleFetchSeq) return;
            const title = data && typeof data.title === 'string' ? data.title.trim() : '';
            if (title) applySuggestedTitle(title);
          })
          .catch(() => {});
      }, 280);
    }

    linkInput.addEventListener('input', () => {
      const val = linkInput.value.trim();
      parsedLink = null;
      linkDetected.textContent = '';
      linkDetected.classList.remove('error');
      if (linkTitleTimer) { clearTimeout(linkTitleTimer); linkTitleTimer = null; }
      linkTitleFetchSeq++;

      if (!val) {
        updateUploadBtnState();
        return;
      }

      const res = window.LinkParser ? window.LinkParser.parse(val) : null;
      if (res) {
        parsedLink = res;
        const platformNames = { youtube: 'YouTube', vimeo: 'Vimeo', dailymotion: 'Dailymotion', loom: 'Loom', wistia: 'Wistia' };
        linkDetected.textContent = `Detected: ${platformNames[res.platform] || res.platform} video`;
        // Mirror file-upload filename → title: suggest the real video title
        // from the platform when the field is empty (or still holds our last
        // suggestion). Never overwrite a title the user typed themselves.
        if (shouldAutoFillTitle()) scheduleLinkTitleFetch(val);
      } else if (window.LinkParser && window.LinkParser.isUnsupportedHost(val)) {
        linkDetected.textContent = 'Dropbox/Drive links aren\u2019t supported. Upload the file directly, or paste a supported video link.';
        linkDetected.classList.add('error');
      } else {
        linkDetected.textContent = 'We don\u2019t recognize that link. Paste a YouTube, Vimeo, Dailymotion, Loom, or Wistia video URL.';
        linkDetected.classList.add('error');
      }
      updateUploadBtnState();
    });

    function updateUploadBtnState() {
      if (mode === 'file') {
        const hasFiles = isFolderMode ? selectedFiles.length > 0 : !!selectedFile;
        const hasTitle = titleInput.value.trim().length > 0;
        uploadBtn.disabled = !(hasFiles && hasTitle);
      } else {
        const hasLink = !!parsedLink;
        const hasTitle = titleInput.value.trim().length > 0;
        uploadBtn.disabled = !(hasLink && hasTitle);
      }
    }

    function applyFolderMode(on) {
      isFolderMode = on;
      if (on) {
        titleLabel.textContent = 'Folder title';
        titleInput.placeholder = 'e.g. June practice videos';
        uploadBtn.textContent = 'Upload & Share Folder';
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
      if (!file || typeof file.size !== 'number' || file.size === 0) {
        showDropError('That file looks empty or unreadable. Please pick a different video.');
        return;
      }
      if (file.size > MAX_SIZE) {
        showDropError(`"${file.name}" is too large (${formatBytes(file.size)}). The limit is 1 GB per video — try trimming or compressing it.`);
        return;
      }
      hideDropError();
      if (mode !== 'file') setMode('file');
      applyFolderMode(false);
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
      scrollIntoViewSafe(filePreview);
    }

    function setFiles(files) {
      // Validate every file up-front so we don't get half-way through and fail.
      const oversized = files.find(f => f.size > MAX_SIZE);
      if (oversized) {
        showDropError(`"${oversized.name}" is too large (${formatBytes(oversized.size)}). The limit is 1 GB per video — remove it or compress it, then choose the files again.`);
        return;
      }
      if (files.length > 10) {
        showDropError(`You picked ${files.length} files, but a folder can hold at most 10 videos. Please choose 10 or fewer.`);
        return;
      }
      const empty = files.find(f => !f || typeof f.size !== 'number' || f.size === 0);
      if (empty) {
        showDropError(`"${empty && empty.name || 'One of the files'}" looks empty or unreadable. Remove it and choose the files again.`);
        return;
      }
      hideDropError();
      if (mode !== 'file') setMode('file');
      applyFolderMode(true);
      selectedFile = null;
      selectedFiles = files;
      filePreview.classList.remove('visible');
      filesList.hidden = false;
      renderFilesList();
      fieldsArea.style.display = 'flex';
      uploadBtn.classList.add('visible');
      dropZone.style.display = 'none';
      if (!titleInput.value.trim()) {
        titleInput.value = `Folder · ${new Date().toLocaleDateString()}`;
      }
      updateUploadBtnState();
      hideError();
      scrollIntoViewSafe(filesList);
    }

    function clearFile() {
      selectedFile = null;
      selectedFiles = [];
      isFolderMode = false;
      fileInput.value = '';
      filePreview.classList.remove('visible');
      filesList.hidden = true;
      filesList.innerHTML = '';
      applyFolderMode(false);
      fieldsArea.style.display = 'none';
      uploadBtn.classList.remove('visible');
      dropZone.style.display = '';
      hideError();
      hideDropError();
      hideTitleError();
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
    titleInput.addEventListener('input', () => {
      hideTitleError();
      updateUploadBtnState();
    });

    function updatePasswordNote() {
      passwordNote.hidden = passwordInput.value.length === 0;
    }
    passwordInput.addEventListener('input', updatePasswordNote);

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      const all = Array.from(e.dataTransfer.files || []);
      const dropped = all.filter(f => f.type.startsWith('video/'));
      if (dropped.length === 0) {
        showDropError(all.length
          ? 'That isn\u2019t a video file. Drop an MP4, MOV, or WebM video instead.'
          : 'Nothing was dropped. Drag a video file onto this area or tap to choose one.');
        return;
      }
      if (dropped.length === 1) setFile(dropped[0]);
      else setFiles(dropped);
      const accepted = selectedFile || selectedFiles.length > 0;
      if (accepted && dropped.length < all.length) {
        const skipped = all.length - dropped.length;
        showDropError(`${skipped} non-video file${skipped === 1 ? ' was' : 's were'} skipped — only videos can be uploaded.`);
      }
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
      currentWatchUrl = watchUrl;

      setTimeout(() => {
        progressArea.classList.remove('visible');
        successArea.classList.add('visible');
        if (modeTabs) modeTabs.style.display = 'none';
        shareLink.textContent = watchUrl;
        watchLinkBtn.dataset.url = watchUrl;

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

        navigator.clipboard.writeText(watchUrl).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => { copyBtn.textContent = 'Copy Link'; copyBtn.classList.remove('copied'); }, 3000);
        }).catch(() => {});

        root.dispatchEvent(new CustomEvent('upload:success', { detail: { videoId, watchUrl } }));
      }, 400);
    }

    uploadBtn.addEventListener('click', startUpload);

    function showAuthError() {
      showError('Please sign in to upload. ');
      var link = document.createElement('a');
      link.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      link.textContent = 'Sign in →';
      link.style.color = '#4ecdc4';
      link.style.fontWeight = '600';
      errorMsg.appendChild(link);
    }

    async function startUpload() {
      if (uploading) return;

      await authReady;
      if (uploadRequiresAuth && !isSignedIn) {
        showAuthError();
        return;
      }

      if (mode === 'link') {
        return startLinkUpload();
      }
      if (isFolderMode) {
        return startFolderUpload();
      }
      if (!selectedFile) return;
      const title = titleInput.value.trim();
      if (!title) {
        showTitleError('Please add a title so people know what they\u2019re watching.');
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
      hideDropError();
      setProgress(0, 'Preparing…');
      uploading = true;
      root.dispatchEvent(new CustomEvent('upload:start'));

      try {
        if (file.size === 0) {
          const e = new Error('That file is empty (0 bytes). Please pick another video.');
          e.userFacing = true;
          throw e;
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
              e.userFacing = !!err.message;
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
          const e = new Error(err.message || 'Finalize failed');
          e.status = finalRes.status;
          e.userFacing = !!err.message;
          throw e;
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
        if (err.status === 401) {
          showAuthError();
        } else {
          showError(describeUploadFailure(err, 'Upload failed. Your file is still selected — tap Upload to try again.'));
          scrollIntoViewSafe(errorMsg);
        }
      }
    }

    async function startLinkUpload() {
      if (!parsedLink) return;

      await authReady;
      if (uploadRequiresAuth && !isSignedIn) {
        showAuthError();
        return;
      }

      const title = titleInput.value.trim();
      if (!title) {
        showTitleError('Please add a title so people know what they\u2019re watching.');
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
          err.status = res.status;
          err.userFacing = !!errData.message;
          throw err;
        }
        const data = await res.json();
        setProgress(100, 'Done!');
        uploading = false;
        finishSuccess(data.videoId, { title, expiryDays, password, isLink: true, platform: data.platform });
        if (data.warning) {
          showNotice(data.warning);
        }
      } catch (err) {
        uploading = false;
        progressArea.classList.remove('visible');
        uploadBtn.classList.add('visible');
        panelLink.style.display = '';
        fieldsArea.style.display = 'flex';
        if (modeTabs) modeTabs.style.display = '';
        root.dispatchEvent(new CustomEvent('upload:reset'));
        if (err.status === 401) {
          showAuthError();
        } else if (err._errorCode === 'VIDEO_UNAVAILABLE') {
          showError(err.message);
        } else {
          showError(describeUploadFailure(err, 'We couldn\u2019t create a watch link for that video. Please try again.'));
        }
        scrollIntoViewSafe(errorMsg);
      }
    }

    function renderFilesStatus() {
      // Render the per-file status list shown beneath the progress bar during
      // a folder upload. Updates in place; keyed by index.
      filesStatus.innerHTML = '';
      if (!folderState) return;
      folderState.forEach((entry, idx) => {
        const row = document.createElement('div');
        row.className = 'files-status-row status-' + entry.status;
        row.dataset.idx = String(idx);
        const dot = document.createElement('span');
        dot.className = 'files-status-dot';
        const labels = {
          queued:    'Queued',
          uploading: 'Uploading…',
          done:      'Done',
          failed:    'Failed',
          cancelled: 'Cancelled'
        };
        dot.textContent = labels[entry.status] || entry.status;
        const name = document.createElement('span');
        name.className = 'files-status-name';
        name.textContent = entry.name;
        row.appendChild(dot);
        row.appendChild(name);
        if (entry.status === 'failed' && entry.error) {
          const err = document.createElement('span');
          err.className = 'files-status-err';
          err.textContent = entry.error;
          row.appendChild(err);
        }
        filesStatus.appendChild(row);
      });
    }

    async function uploadOneFile(file, slug, expiryDays, password) {
      // Returns the new videoId on success; throws on failure. The caller
      // catches per-file errors so other files can still proceed.
      if (file.size === 0) {
        const e = new Error('File is empty (0 bytes).');
        e.userFacing = true;
        throw e;
      }
      const ext = getExt(file);
      const videoId = genId() + '.' + ext;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const fileTitle = deriveTitleFromFilename(file.name) || file.name;

      inFlightVideoId = videoId;
      try {
        for (let i = 0; i < totalChunks; i++) {
          if (cancelRequested) {
            const e = new Error('Cancelled');
            e._cancelled = true;
            throw e;
          }
          const start = i * CHUNK_SIZE;
          const slice = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
          const ab = await slice.arrayBuffer();
          const base64 = arrayBufferToBase64(ab);

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
              e.userFacing = !!err.message;
              throw e;
            }
          }, i);
        }

        if (cancelRequested) {
          const e = new Error('Cancelled');
          e._cancelled = true;
          throw e;
        }

        const finalRes = await fetch('/api/finalize-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, totalChunks, contentType: file.type || 'video/mp4', title: fileTitle, expiryDays, password })
        });
        if (!finalRes.ok) {
          const err = await parseErrJson(finalRes);
          const e = new Error(err.message || 'Finalize failed');
          e.status = finalRes.status;
          e.userFacing = !!err.message;
          throw e;
        }

        const aRes = await fetch(`/api/folders/${encodeURIComponent(slug)}/videos`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId })
        });
        if (!aRes.ok) {
          const err = await parseErrJson(aRes);
          const e = new Error(err.message || 'Uploaded, but it could not be added to the folder.');
          e.status = aRes.status;
          e.userFacing = true;
          throw e;
        }
        captureAndUploadThumbnail(file, videoId);
        return videoId;
      } finally {
        inFlightVideoId = null;
      }
    }

    async function startFolderUpload() {
      // Multi-file flow with per-file partial-failure handling. Anonymous
      // users CAN create folders (matches anonymous single-upload behavior).
      // Each file uploads independently — one failure no longer aborts the
      // whole batch. At the end we show a summary; if everything failed and
      // the folder is empty, we delete it server-side as cleanup.
      const folderTitle = titleInput.value.trim();
      if (!folderTitle) {
        showTitleError('Please give the folder a name.');
        return;
      }
      const files = selectedFiles.slice();
      if (files.length < 2) return;

      const expiryDays = expirySelect.value;
      const password = passwordInput.value;

      uploadBtn.classList.remove('visible');
      filesList.hidden = true;
      fieldsArea.style.display = 'none';
      progressArea.classList.add('visible');
      filesStatus.hidden = false;
      cancelBtn.hidden = false;
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel';
      batchSummary.hidden = true;
      batchSummary.innerHTML = '';
      if (modeTabs) modeTabs.style.display = 'none';
      hideError();
      setProgress(0, 'Preparing folder…');
      cancelRequested = false;
      uploading = true;
      folderState = files.map(f => ({ name: f.name, status: 'queued', videoId: null, error: null }));
      renderFilesStatus();
      root.dispatchEvent(new CustomEvent('upload:start'));

      // Create the folder up-front. If it fails we don't have anything to
      // clean up. Anonymous users hit the same endpoint — server allows it.
      let slug = currentFolderSlug;
      if (!slug) {
        try {
          const cRes = await fetch('/api/folders', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: folderTitle })
          });
          if (!cRes.ok) {
            const err = await parseErrJson(cRes);
            const e = new Error(err.message || 'Could not create folder');
            e.status = cRes.status;
            e.userFacing = !!err.message;
            throw e;
          }
          const data = await cRes.json();
          slug = data.slug;
          currentFolderSlug = slug;
        } catch (err) {
          uploading = false;
          progressArea.classList.remove('visible');
          filesStatus.hidden = true;
          cancelBtn.hidden = true;
          uploadBtn.classList.add('visible');
          filesList.hidden = false;
          fieldsArea.style.display = 'flex';
          if (modeTabs) modeTabs.style.display = '';
          root.dispatchEvent(new CustomEvent('upload:reset'));
          if (err.status === 401) {
            showAuthError();
          } else {
            showError(describeUploadFailure(err, 'We couldn\u2019t create the folder. Nothing was uploaded — please try again.'));
          }
          scrollIntoViewSafe(errorMsg);
          return;
        }
      }

      const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;
      let bytesDone = 0;
      let succeededCount = 0;
      let failedCount = 0;

      for (let f = 0; f < files.length; f++) {
        if (folderState[f].status === 'done') {
          // skip already-uploaded files (retry path)
          bytesDone += files[f].size;
          continue;
        }
        if (cancelRequested) {
          if (folderState[f].status === 'queued') {
            folderState[f].status = 'cancelled';
          }
          continue;
        }

        folderState[f].status = 'uploading';
        folderState[f].error = null;
        renderFilesStatus();
        const overallPct = Math.min(95, Math.round((bytesDone / totalBytes) * 95));
        setProgress(overallPct, `Uploading ${f + 1} of ${files.length}: ${files[f].name}`);

        try {
          const videoId = await uploadOneFile(files[f], slug, expiryDays, password);
          folderState[f].status = 'done';
          folderState[f].videoId = videoId;
          succeededCount++;
        } catch (err) {
          if (err && err._cancelled) {
            folderState[f].status = 'cancelled';
          } else {
            folderState[f].status = 'failed';
            folderState[f].error = describeUploadFailure(err, 'Upload failed');
            failedCount++;
          }
        }
        bytesDone += files[f].size;
        renderFilesStatus();
      }

      cancelBtn.hidden = true;
      uploading = false;

      // Clean up empty folders so we don't leak slugs into the DB. We only
      // attempt this when no video was attached at all.
      if (succeededCount === 0 && currentFolderSlug) {
        try {
          await fetch(`/api/folders/${encodeURIComponent(currentFolderSlug)}`, {
            method: 'DELETE', credentials: 'same-origin'
          });
        } catch {}
        currentFolderSlug = null;
      }

      const cancelledCount = folderState.filter(s => s.status === 'cancelled').length;
      if (succeededCount === files.length) {
        setProgress(100, 'Done!');
        finishFolderSuccess(slug, { title: folderTitle, count: succeededCount, expiryDays, password });
        return;
      }

      // Partial / total failure: show a summary with retry + (if any
      // succeeded) an "Open folder" link so the user can keep what worked.
      progressArea.classList.remove('visible');
      filesStatus.hidden = true;
      if (modeTabs) modeTabs.style.display = '';
      showBatchSummary({
        slug: succeededCount > 0 ? slug : null,
        succeededCount, failedCount, cancelledCount, total: files.length,
        folderTitle
      });
      root.dispatchEvent(new CustomEvent('upload:partial', {
        detail: { slug: succeededCount > 0 ? slug : null, succeeded: succeededCount, failed: failedCount, cancelled: cancelledCount }
      }));
    }

    function showBatchSummary(opts) {
      const { slug, succeededCount, failedCount, cancelledCount, total, folderTitle } = opts;
      batchSummary.innerHTML = '';
      const heading = document.createElement('div');
      heading.className = 'batch-summary-heading';
      if (succeededCount === 0) {
        heading.textContent = `Upload failed — 0 of ${total} videos uploaded.`;
      } else {
        heading.textContent = `Uploaded ${succeededCount} of ${total} videos to "${folderTitle}".`;
      }
      batchSummary.appendChild(heading);

      const detail = document.createElement('div');
      detail.className = 'batch-summary-detail';
      const parts = [];
      if (failedCount)    parts.push(`${failedCount} failed`);
      if (cancelledCount) parts.push(`${cancelledCount} cancelled`);
      detail.textContent = parts.join(' · ');
      if (parts.length) batchSummary.appendChild(detail);

      const actions = document.createElement('div');
      actions.className = 'batch-summary-actions';

      if (failedCount > 0 || cancelledCount > 0) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'btn btn-primary';
        retryBtn.textContent = `Retry ${failedCount + cancelledCount} failed`;
        retryBtn.addEventListener('click', () => retryFailed());
        actions.appendChild(retryBtn);
      }

      if (slug) {
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'btn btn-secondary';
        openBtn.textContent = 'Open folder ↗';
        openBtn.addEventListener('click', () => {
          window.open('/f/' + encodeURIComponent(slug), '_blank', 'noopener');
        });
        actions.appendChild(openBtn);
      }

      const startOverBtn = document.createElement('button');
      startOverBtn.type = 'button';
      startOverBtn.className = 'btn btn-secondary';
      startOverBtn.textContent = 'Start over';
      startOverBtn.addEventListener('click', () => {
        currentFolderSlug = null;
        folderState = null;
        batchSummary.hidden = true;
        reset();
      });
      actions.appendChild(startOverBtn);

      batchSummary.appendChild(actions);
      batchSummary.hidden = false;
    }

    function retryFailed() {
      // Mark every failed/cancelled entry as queued, then re-run the same
      // pipeline. uploadOneFile() generates a fresh videoId per attempt, so
      // there's no orphaned-chunk concern.
      if (!folderState) return;
      folderState.forEach(entry => {
        if (entry.status === 'failed' || entry.status === 'cancelled') {
          entry.status = 'queued';
          entry.error = null;
        }
      });
      batchSummary.hidden = true;
      startFolderUpload();
    }

    cancelBtn.addEventListener('click', async () => {
      if (!uploading) return;
      cancelRequested = true;
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling…';
      // Best-effort orphaned-chunk cleanup for the file mid-flight. The
      // server only honors this when no vs_uploads row exists for the id.
      const id = inFlightVideoId;
      if (id) {
        try {
          await fetch('/api/upload-chunks/' + encodeURIComponent(id), {
            method: 'DELETE', credentials: 'same-origin'
          });
        } catch {}
      }
    });

    function finishFolderSuccess(slug, opts) {
      const { title, count, expiryDays, password } = opts || {};
      const folderUrl = window.location.origin + '/f/' + encodeURIComponent(slug);
      currentWatchUrl = folderUrl;
      currentFolderSlug = null;

      setTimeout(() => {
        progressArea.classList.remove('visible');
        filesStatus.hidden = true;
        cancelBtn.hidden = true;
        successArea.classList.add('visible');
        if (modeTabs) modeTabs.style.display = 'none';
        shareLink.textContent = folderUrl;
        watchLinkBtn.dataset.url = folderUrl;
        watchLinkBtn.textContent = 'Open folder ↗';

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

        successSub.textContent = 'Share this folder link — recipients can watch each video and download them all as a zip.';
        authReady.then(signedIn => {
          accountNudge.classList.toggle('visible', !signedIn);
        });

        navigator.clipboard.writeText(folderUrl).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => { copyBtn.textContent = 'Copy Link'; copyBtn.classList.remove('copied'); }, 3000);
        }).catch(() => {});

        root.dispatchEvent(new CustomEvent('upload:success', { detail: { folderSlug: slug, watchUrl: folderUrl } }));
      }, 400);
    }

    async function copyShareLink() {
      const url = shareLink.textContent;
      let ok = false;
      if (Feedback) {
        ok = await Feedback.copyText(url);
      } else {
        try { await navigator.clipboard.writeText(url); ok = true; } catch { ok = false; }
      }
      return ok;
    }

    function selectShareLinkText() {
      // Clipboard access can be blocked (insecure context, embedded webview,
      // permissions). Highlight the link so a manual copy is one gesture away.
      try {
        const range = document.createRange();
        range.selectNodeContents(shareLink);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {}
    }

    copyBtn.addEventListener('click', async () => {
      const ok = await copyShareLink();
      if (ok) {
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        copyBtn.classList.remove('copy-failed');
        setTimeout(() => { copyBtn.textContent = 'Copy Link'; copyBtn.classList.remove('copied'); }, 2500);
        return;
      }
      selectShareLinkText();
      copyBtn.textContent = 'Couldn\u2019t copy — link is selected above';
      copyBtn.classList.add('copy-failed');
      setTimeout(() => { copyBtn.textContent = 'Copy Link'; copyBtn.classList.remove('copy-failed'); }, 3500);
    });

    function reset() {
      successArea.classList.remove('visible');
      accountNudge.classList.remove('visible');
      if (modeTabs) modeTabs.style.display = '';
      watchLinkBtn.textContent = 'Watch it now ↗';
      currentWatchUrl = null;
      titleInput.value = '';
      passwordInput.value = '';
      updatePasswordNote();
      linkInput.value = '';
      parsedLink = null;
      autoFilledTitle = null;
      if (linkTitleTimer) { clearTimeout(linkTitleTimer); linkTitleTimer = null; }
      linkTitleFetchSeq++;
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
