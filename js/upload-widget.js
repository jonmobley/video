/* VidShare upload widget — shared by /upload and the home-page modal.
 * Usage: initUploadWidget(rootElement). Renders the upload card markup
 * inside the given root and wires up all behavior scoped to that root,
 * so multiple instances do not collide via document.getElementById. */

(function () {
  const CHUNK_SIZE = 3 * 1024 * 1024;
  const MAX_SIZE = 1024 * 1024 * 1024;

  const TEMPLATE = `
    <div class="mode-tabs" role="tablist" data-el="modeTabs">
      <button type="button" class="mode-tab active" data-el="tabFile" role="tab" aria-selected="true">Upload a file</button>
      <button type="button" class="mode-tab" data-el="tabLink" role="tab" aria-selected="false">Paste a link</button>
    </div>

    <div class="mode-panel active" data-el="panelFile">
      <div class="drop-zone" data-el="dropZone">
        <input type="file" data-el="fileInput" accept="video/*">
        <span class="drop-icon-wrap">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="url(#vsGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <defs><linearGradient id="vsGrad" x1="0" x2="1" y1="0" x2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset="1" stop-color="#4ecdc4"/></linearGradient></defs>
            <path d="M12 16V4M12 4l-5 5M12 4l5 5"/>
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
          </svg>
        </span>
        <div class="drop-label">Tap to choose a video</div>
        <div class="drop-sub">Any format · Vertical or horizontal</div>
        <div class="size-limit">Max 1 GB</div>
      </div>

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
        <div class="link-zone-label">Paste a YouTube or Vimeo link</div>
        <div class="link-zone-sub">We'll embed it on a shareable watch page.</div>
        <input type="url" class="link-input" data-el="linkInput"
               placeholder="https://youtu.be/… or https://vimeo.com/…"
               autocomplete="off" spellcheck="false">
        <div class="link-detected" data-el="linkDetected"></div>
      </div>
    </div>

    <div class="fields" data-el="fieldsArea" style="display:none;">
      <div class="field">
        <label>Title</label>
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
      Anyone with the original YouTube or Vimeo URL can still view the video there.
    </div>

    <button type="button" class="btn upload-btn" data-el="uploadBtn">Upload &amp; Get Link</button>

    <div class="progress-area" data-el="progressArea">
      <div class="progress-label">
        <span data-el="progressText">Uploading…</span>
        <span data-el="progressPct">0%</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" data-el="progressFill"></div>
      </div>
    </div>

    <div class="error-msg" data-el="errorMsg"></div>

    <div class="success-area" data-el="successArea">
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
    const filePreview = $('filePreview');
    const fileName = $('fileName');
    const fileSizeTxt = $('fileSizeTxt');
    const fileRemove = $('fileRemove');
    const fieldsArea = $('fieldsArea');
    const titleInput = $('titleInput');
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
    let mode = 'file';            // 'file' | 'link'
    let parsedLink = null;        // { platform, videoId } | null
    let uploading = false;

    const authReady = fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(r => r.ok)
      .catch(() => false);

    function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.add('visible'); }
    function hideError() { errorMsg.classList.remove('visible'); }
    function setProgress(pct, label) {
      progressFill.style.width = pct + '%';
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

      const showFields = mode === 'link' ? true : !!selectedFile;
      fieldsArea.style.display = showFields ? 'flex' : 'none';
      uploadBtn.classList.toggle('visible', showFields);
      uploadBtn.textContent = mode === 'link' ? 'Create Watch Link' : 'Upload & Get Link';

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
        linkDetected.textContent = `Detected: ${res.platform === 'youtube' ? 'YouTube' : 'Vimeo'} video`;
      } else if (window.LinkParser && window.LinkParser.isUnsupportedHost(val)) {
        linkDetected.textContent = 'Only YouTube and Vimeo links work here. For Dropbox/Drive files, upload the file instead.';
        linkDetected.classList.add('error');
      } else {
        linkDetected.textContent = 'Not a recognized YouTube or Vimeo URL';
        linkDetected.classList.add('error');
      }
      updateUploadBtnState();
    });

    function updateUploadBtnState() {
      if (mode === 'file') {
        const hasFile = !!selectedFile;
        const hasTitle = titleInput.value.trim().length > 0;
        uploadBtn.disabled = !(hasFile && hasTitle);
      } else {
        const hasLink = !!parsedLink;
        const hasTitle = titleInput.value.trim().length > 0;
        uploadBtn.disabled = !(hasLink && hasTitle);
      }
    }

    function setFile(file) {
      if (file.size > MAX_SIZE) {
        showError(`File is too large (${formatBytes(file.size)}). Maximum size is 1 GB.`);
        return;
      }
      selectedFile = file;
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

    function clearFile() {
      selectedFile = null;
      fileInput.value = '';
      filePreview.classList.remove('visible');
      fieldsArea.style.display = 'none';
      uploadBtn.classList.remove('visible');
      dropZone.style.display = '';
      hideError();
    }

    fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });
    fileRemove.addEventListener('click', clearFile);
    titleInput.addEventListener('input', updateUploadBtnState);

    function updatePasswordNote() {
      passwordNote.hidden = passwordInput.value.length === 0;
    }
    passwordInput.addEventListener('input', updatePasswordNote);

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('video/')) setFile(f);
      else showError('Please drop a video file.');
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
          pb.textContent = platform === 'youtube' ? 'YouTube embed' : 'Vimeo embed';
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
          const err = await parseErrJson(res);
          throw new Error(err.message || 'Failed to create link video');
        }
        const data = await res.json();
        setProgress(100, 'Done!');
        uploading = false;
        finishSuccess(data.videoId, { title, expiryDays, password, isLink: true, platform: data.platform });
      } catch (err) {
        uploading = false;
        progressArea.classList.remove('visible');
        uploadBtn.classList.add('visible');
        panelLink.style.display = '';
        fieldsArea.style.display = 'flex';
        if (modeTabs) modeTabs.style.display = '';
        root.dispatchEvent(new CustomEvent('upload:reset'));
        showError('Submission failed: ' + err.message);
      }
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

    return { reset, root, isUploading: () => uploading };
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
