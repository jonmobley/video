/* VidShare upload widget — shared by /upload and the home-page modal.
 * Usage: initUploadWidget(rootElement). Renders the upload card markup
 * inside the given root and wires up all behavior scoped to that root,
 * so multiple instances do not collide via document.getElementById. */

(function () {
  const CHUNK_SIZE = 3 * 1024 * 1024;
  const MAX_SIZE = 1024 * 1024 * 1024;

  const TEMPLATE = `
    <div class="drop-zone" data-el="dropZone">
      <input type="file" data-el="fileInput" accept="video/*">
      <span class="drop-icon-wrap">
        <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="url(#vsGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <defs><linearGradient id="vsGrad" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset="1" stop-color="#4ecdc4"/></linearGradient></defs>
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

      <div class="qr-wrap" data-el="qrWrap">
        <img data-el="qrImg" src="" alt="QR Code" width="160" height="160">
        <div class="qr-label">Scan to watch</div>
      </div>

      <a class="watch-link-btn" data-el="watchLinkBtn" target="_blank">Watch it now ↗</a>
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

    let selectedFile = null;

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

    function updateUploadBtnState() {
      const hasFile = !!selectedFile;
      const hasTitle = titleInput.value.trim().length > 0;
      uploadBtn.disabled = !(hasFile && hasTitle);
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

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('video/')) setFile(f);
      else showError('Please drop a video file.');
    });

    uploadBtn.addEventListener('click', startUpload);

    async function startUpload() {
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
      hideError();
      setProgress(0, 'Preparing…');

      try {
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const slice = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
          const ab = await slice.arrayBuffer();
          const base64 = arrayBufferToBase64(ab);

          setProgress(Math.round((i / totalChunks) * 85), 'Uploading…');

          const res = await fetch('/api/upload-chunk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId, chunkIndex: i, totalChunks, data: base64, contentType: file.type || 'video/mp4' })
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Chunk ${i} failed`);
          }
        }

        setProgress(92, 'Finalizing…');

        const finalRes = await fetch('/api/finalize-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, totalChunks, contentType: file.type || 'video/mp4', title, expiryDays, password })
        });
        if (!finalRes.ok) {
          const err = await finalRes.json().catch(() => ({}));
          throw new Error(err.error || 'Finalize failed');
        }

        setProgress(100, 'Done!');

        try {
          const KEY = 'vs_pending_claims';
          const raw = localStorage.getItem(KEY);
          const list = raw ? JSON.parse(raw) : [];
          const cleaned = Array.isArray(list) ? list.filter(e => e && typeof e.id === 'string') : [];
          cleaned.push({ id: videoId, ts: Date.now() });
          localStorage.setItem(KEY, JSON.stringify(cleaned.slice(-50)));
        } catch {}

        const watchUrl = window.location.origin + '/watch?id=' + encodeURIComponent(videoId);

        setTimeout(() => {
          progressArea.classList.remove('visible');
          successArea.classList.add('visible');
          shareLink.textContent = watchUrl;
          watchLinkBtn.href = watchUrl;

          metaRow.innerHTML = '';
          if (title) {
            const b = document.createElement('span');
            b.className = 'meta-badge'; b.textContent = title;
            metaRow.appendChild(b);
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

          successSub.textContent = password
            ? 'Share the link — recipients will need the password to watch.'
            : 'Copy the link and send it to anyone.';

          authReady.then(signedIn => {
            accountNudge.classList.toggle('visible', !signedIn);
          });

          qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=ffffff&bgcolor=1c1c1e&data=' + encodeURIComponent(watchUrl);

          navigator.clipboard.writeText(watchUrl).then(() => {
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            setTimeout(() => { copyBtn.textContent = 'Copy Link'; copyBtn.classList.remove('copied'); }, 3000);
          }).catch(() => {});

          root.dispatchEvent(new CustomEvent('upload:success', { detail: { videoId, watchUrl } }));
        }, 400);

      } catch (err) {
        progressArea.classList.remove('visible');
        uploadBtn.classList.add('visible');
        filePreview.classList.add('visible');
        fieldsArea.style.display = 'flex';
        showError('Upload failed: ' + err.message);
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
      titleInput.value = '';
      passwordInput.value = '';
      clearFile();
      updateUploadBtnState();
    }

    anotherBtn.addEventListener('click', reset);

    return { reset, root };
  }

  window.initUploadWidget = initUploadWidget;
})();
