/* VidShare shared thumbnail picker.
 *
 * One dialog used by the account dashboard and the show-page editors. The
 * caller supplies where candidate frames come from and what to do with the
 * choice; the picker owns the markup, keyboard/focus handling, frame
 * extraction, and the "upload your own image" downscale path.
 *
 *   ThumbnailPicker.open({
 *     source: { videoUrl } | { file } | { imageUrls: [...] } | null,
 *     cacheKey: 'abc',              // optional: reuse extracted frames
 *     framesUnavailableMessage,     // shown in the grid when source is null
 *     skipLabel: 'Keep auto thumbnail', // optional third button
 *     onSave(selection) => Promise, // throw to show an error and stay open
 *     onSkip() / onClose()
 *   });
 *
 * `selection` is one of
 *   { kind: 'frame',  base64, contentType, dataUrl, timeSec }
 *   { kind: 'custom', base64, contentType, dataUrl }
 *   { kind: 'url',    url }
 */
(function () {
  // Server-side cap is 500 KB; mirror it here so users get an immediate
  // error instead of a cryptic 413 after the round-trip.
  const TP_MAX_BYTES = 500 * 1024;
  // Evenly spaced interior samples — avoids the black first/last frames and
  // keeps picks visually distinct when the clip has any motion.
  const TP_FRAME_COUNT = 6;
  const TP_FRAME_CACHE_MAX = 20;
  const EXTRACT_TIMEOUT_MS = 30000;
  // How long after 'seeked' (+2 animation frames) to capture if
  // requestVideoFrameCallback has not fired.
  const PAINT_FALLBACK_MS = 150;

  const TEMPLATE = `
    <div class="tp-dialog">
      <div class="tp-header">
        <div class="tp-title" id="tpTitle">Change thumbnail</div>
        <button type="button" class="tp-close" id="tpClose" aria-label="Close">&times;</button>
      </div>
      <div class="tp-sub" id="tpSub">Pick a frame from your video or upload your own image.</div>

      <div class="tp-section-title" id="tpFramesTitle">Pick a frame</div>
      <div class="tp-grid" id="tpGrid" role="listbox" aria-label="Thumbnail frame options"></div>

      <div class="tp-section-title" id="tpUploadTitle">Upload your own</div>
      <div class="tp-upload-row" id="tpUploadRow">
        <div class="tp-upload-preview" id="tpUploadPreview">No file</div>
        <button type="button" class="tp-file-btn" id="tpFileBtn">Choose image\u2026</button>
        <div class="tp-file-hint">JPEG, PNG, or WebP. Max 500&nbsp;KB after compression.</div>
        <input type="file" id="tpFileInput" accept="image/jpeg,image/png,image/webp" class="hidden">
      </div>

      <div class="tp-error" id="tpError"></div>

      <div class="tp-actions">
        <button type="button" class="tp-btn" id="tpCancel">Cancel</button>
        <button type="button" class="tp-btn" id="tpSkip" hidden>Skip</button>
        <button type="button" class="tp-btn primary" id="tpSave" disabled>Save thumbnail</button>
      </div>
    </div>`;

  const frameCache = new Map();
  let els = null;
  let state = null; // { options, selection, frames, custom, saving }
  let lastFocused = null;

  function formatTimecode(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  /** Build seek targets spread across a known duration. */
  function frameSeekTimes(duration, count) {
    const n = Math.max(1, count | 0);
    const dur = Number(duration);
    if (!isFinite(dur) || dur <= 0) return [];
    // Very short clips: still return unique-ish times within the range.
    if (dur < 0.6) {
      const mid = Math.max(0, dur / 2);
      return Array.from({ length: n }, () => mid);
    }
    const times = [];
    for (let i = 0; i < n; i++) {
      // (i+1)/(n+1) keeps samples away from 0 and EOF.
      const t = dur * ((i + 1) / (n + 1));
      times.push(Math.min(Math.max(0.05, t), Math.max(0.05, dur - 0.05)));
    }
    return times;
  }

  /**
   * Seek through a video and capture `count` JPEG frames. Resolves to an
   * array (nulls for slots that failed); `onFrame(idx, frame)` fires as each
   * one lands so the grid can fill in progressively.
   */
  function extractCandidateFrames(videoUrl, count, onFrame) {
    return new Promise((resolve) => {
      const n = Math.max(1, count | 0);
      const out = Array.from({ length: n }, () => null);
      let i = 0;
      let settled = false;
      let seekTimes = [];
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      // Same-origin /api/video/:id does not send CORS headers. Setting
      // crossOrigin=anonymous here makes the <video> fail to load (or
      // taints the canvas), which is why the picker showed
      // "Could not load frames". Leave crossOrigin unset for same-origin.
      video.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';

      const timer = setTimeout(() => finish(), EXTRACT_TIMEOUT_MS);

      function cleanup() {
        try { video.pause(); } catch (_) { /* best effort */ }
        try { video.removeAttribute('src'); video.load(); } catch (_) { /* best effort */ }
        try { video.remove(); } catch (_) { /* best effort */ }
      }
      function finish() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(out);
      }

      function captureCurrent() {
        try {
          const vw = video.videoWidth, vh = video.videoHeight;
          if (!vw || !vh) return null;
          const maxW = 480, maxH = 270;
          const ratio = vw / vh;
          let cw = maxW, ch = maxH;
          if (ratio > cw / ch) ch = Math.max(1, Math.round(cw / ratio));
          else cw = Math.max(1, Math.round(ch * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.drawImage(video, 0, 0, cw, ch);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          const comma = dataUrl.indexOf(',');
          if (comma < 0) return null;
          return {
            dataUrl,
            base64: dataUrl.slice(comma + 1),
            contentType: 'image/jpeg',
            // Record the time we actually landed on (keyframe snap may
            // differ from the requested seek).
            timeSec: isFinite(video.currentTime) ? video.currentTime : null
          };
        } catch (_) {
          return null;
        }
      }

      function afterPaint(cb) {
        // Wait until a decoded frame is available at the seeked time —
        // capturing immediately on 'seeked' often reuses the prior frame.
        // requestVideoFrameCallback is the precise signal, but it only fires
        // when the element is actually composited, and this hidden 1px video
        // is not in some renderers (software GL, background tabs). Race it
        // against a short rAF-based delay so extraction never stalls until
        // the overall timeout; drawImage reads the decoder's current frame
        // either way.
        let done = false;
        const fire = () => {
          if (done) return;
          done = true;
          cb();
        };
        if (typeof video.requestVideoFrameCallback === 'function') {
          try { video.requestVideoFrameCallback(() => fire()); } catch (_) { /* fall back to rAF */ }
        }
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fire, PAINT_FALLBACK_MS)));
      }

      function seekNext() {
        if (i >= seekTimes.length) return finish();
        const t = seekTimes[i];
        try { video.currentTime = t; }
        catch (_) { i++; seekNext(); }
      }

      let seekingStarted = false;
      function startSeeking() {
        if (seekingStarted || settled) return;
        const dur = video.duration;
        if (!isFinite(dur) || dur <= 0) return;
        seekingStarted = true;
        seekTimes = frameSeekTimes(dur, n);
        if (!seekTimes.length) return finish();
        i = 0;
        seekNext();
      }

      // Duration is often Infinity/0 on first loadedmetadata for ranged
      // MP4s. Wait until we have a real length before spreading seeks —
      // otherwise every sample collapses to t=0 and all tiles look alike.
      video.addEventListener('loadedmetadata', startSeeking);
      video.addEventListener('durationchange', startSeeking);
      video.addEventListener('seeked', () => {
        const idx = i;
        afterPaint(() => {
          if (settled) return;
          out[idx] = captureCurrent();
          if (typeof onFrame === 'function') onFrame(idx, out[idx]);
          i++;
          seekNext();
        });
      });
      video.addEventListener('error', () => finish());

      try {
        video.src = videoUrl;
        document.body.appendChild(video);
        video.load();
      } catch (_) { finish(); }
    });
  }

  /** Extract frames from a local File/Blob via a temporary object URL. */
  async function extractFramesFromFile(file, count, onFrame) {
    let objectUrl = null;
    try {
      objectUrl = URL.createObjectURL(file);
      return await extractCandidateFrames(objectUrl, count, onFrame);
    } catch (_) {
      return Array.from({ length: Math.max(1, count | 0) }, () => null);
    } finally {
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (_) { /* best effort */ }
      }
    }
  }

  // If the file is already small enough and a supported type, send it as-is.
  // Otherwise downscale to a 16:9-ish thumbnail and re-encode JPEG until
  // it fits under TP_MAX_BYTES.
  function processCustomImage(img, file) {
    return new Promise((resolve) => {
      try {
        // Fast path: small original PNG/JPEG/WebP → just base64 it.
        if (file.size <= TP_MAX_BYTES) {
          const fr = new FileReader();
          fr.onload = () => {
            const dataUrl = String(fr.result || '');
            const comma = dataUrl.indexOf(',');
            if (comma < 0) return resolve(null);
            resolve({
              dataUrl,
              base64: dataUrl.slice(comma + 1),
              contentType: file.type
            });
          };
          fr.onerror = () => resolve(null);
          fr.readAsDataURL(file);
          return;
        }
        // Re-encode path. Walk down quality until we fit.
        const maxW = 1280, maxH = 720;
        const ratio = img.width / img.height;
        let cw = maxW, ch = maxH;
        if (ratio > cw / ch) ch = Math.max(1, Math.round(cw / ratio));
        else cw = Math.max(1, Math.round(ch * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, cw, ch);
        const qualities = [0.82, 0.7, 0.55, 0.4, 0.25];
        for (const q of qualities) {
          const dataUrl = canvas.toDataURL('image/jpeg', q);
          const comma = dataUrl.indexOf(',');
          if (comma < 0) continue;
          const base64 = dataUrl.slice(comma + 1);
          // base64 length * 3/4 ≈ decoded bytes.
          const approxBytes = Math.floor(base64.length * 0.75);
          if (approxBytes <= TP_MAX_BYTES) {
            return resolve({ dataUrl, base64, contentType: 'image/jpeg' });
          }
        }
        resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  /** Read a user-picked image file into a { dataUrl, base64, contentType }. */
  function readCustomImage(file) {
    return new Promise((resolve, reject) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        return reject(new Error('Image must be JPEG, PNG, or WebP.'));
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          processCustomImage(img, file).then(custom => {
            if (!custom) return reject(new Error('Could not process this image. Try a smaller file.'));
            resolve(custom);
          });
        };
        img.onerror = () => reject(new Error('Could not read this image.'));
        img.src = String(reader.result || '');
      };
      reader.onerror = () => reject(new Error('Could not read this image.'));
      reader.readAsDataURL(file);
    });
  }

  // ── DOM ────────────────────────────────────────────────────────────────────

  function ensureDialog() {
    if (els) return els;
    let overlay = document.getElementById('tpOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'tp-overlay';
      overlay.id = 'tpOverlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'tpTitle');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);
    }
    if (!overlay.querySelector('.tp-dialog')) overlay.innerHTML = TEMPLATE;

    const q = (id) => overlay.querySelector('#' + id);
    els = {
      overlay,
      title: q('tpTitle'),
      sub: q('tpSub'),
      close: q('tpClose'),
      cancel: q('tpCancel'),
      skip: q('tpSkip'),
      save: q('tpSave'),
      grid: q('tpGrid'),
      error: q('tpError'),
      framesTitle: q('tpFramesTitle'),
      uploadTitle: q('tpUploadTitle'),
      uploadRow: q('tpUploadRow'),
      fileInput: q('tpFileInput'),
      fileBtn: q('tpFileBtn'),
      uploadPreview: q('tpUploadPreview')
    };
    bindEvents();
    return els;
  }

  function setError(msg) {
    if (els) els.error.textContent = msg || '';
  }

  function isOpen() {
    return !!(els && els.overlay.classList.contains('show'));
  }

  function close() {
    if (!els) return;
    const options = state && state.options;
    els.overlay.classList.remove('show');
    els.overlay.setAttribute('aria-hidden', 'true');
    els.grid.innerHTML = '';
    setError('');
    els.fileInput.value = '';
    els.uploadPreview.innerHTML = 'No file';
    els.uploadPreview.classList.remove('selected');
    els.save.disabled = true;
    els.save.textContent = 'Save thumbnail';
    state = null;
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch (_) { /* best effort */ }
    }
    lastFocused = null;
    if (options && typeof options.onClose === 'function') options.onClose();
  }

  function clearGridSelection() {
    Array.from(els.grid.children).forEach(el => {
      el.classList.remove('selected');
      el.setAttribute('aria-selected', 'false');
    });
  }

  function selectFrame(index) {
    if (!state) return;
    const f = state.frames[index];
    if (!f) return;
    state.selection = f.url
      ? { kind: 'url', url: f.url, index }
      : { kind: 'frame', index, base64: f.base64, contentType: f.contentType, dataUrl: f.dataUrl, timeSec: f.timeSec };
    Array.from(els.grid.children).forEach((el, i) => {
      el.classList.toggle('selected', i === index);
      el.setAttribute('aria-selected', String(i === index));
    });
    els.uploadPreview.classList.remove('selected');
    els.uploadPreview.setAttribute('aria-selected', 'false');
    els.save.disabled = false;
    setError('');
  }

  function selectCustom() {
    if (!state || !state.custom) return;
    state.selection = Object.assign({ kind: 'custom' }, state.custom);
    clearGridSelection();
    els.uploadPreview.classList.add('selected');
    els.uploadPreview.setAttribute('aria-selected', 'true');
    els.save.disabled = false;
    setError('');
  }

  function renderFrameTile(tile, f, idx) {
    if (!f) {
      tile.className = 'tp-frame empty';
      tile.textContent = '\u2014';
      return;
    }
    tile.className = 'tp-frame';
    tile.innerHTML = '';
    tile.tabIndex = 0;
    tile.setAttribute('role', 'option');
    tile.setAttribute('aria-selected', 'false');
    const label = f.timeSec !== null && f.timeSec !== undefined
      ? ('Frame at ' + formatTimecode(f.timeSec))
      : ('Frame ' + (idx + 1));
    tile.setAttribute('aria-label', label);
    const img = document.createElement('img');
    img.src = f.url || f.dataUrl;
    img.alt = label;
    if (f.url) {
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        tile.className = 'tp-frame empty';
        tile.textContent = 'Not ready';
        tile.removeAttribute('tabindex');
      }, { once: true });
    }
    tile.appendChild(img);
    if (f.timeSec !== null && f.timeSec !== undefined) {
      const badge = document.createElement('span');
      badge.className = 'tp-frame-time';
      badge.textContent = formatTimecode(f.timeSec);
      tile.appendChild(badge);
    }
    tile.addEventListener('click', () => selectFrame(idx));
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectFrame(idx);
      }
    });
  }

  function showEmptyGrid(slots, message) {
    els.framesTitle.textContent = 'Pick a frame';
    slots.forEach(tile => {
      tile.className = 'tp-frame empty';
      tile.textContent = message;
    });
  }

  function rememberFrames(key, frames) {
    if (!key) return;
    frameCache.delete(key);
    frameCache.set(key, frames);
    while (frameCache.size > TP_FRAME_CACHE_MAX) {
      const oldest = frameCache.keys().next().value;
      frameCache.delete(oldest);
    }
  }

  function invalidateCache(key) {
    if (key === null || key === undefined) frameCache.clear();
    else frameCache.delete(key);
  }

  async function populateFrames(options, slots) {
    const token = state;
    const source = options.source;
    const count = slots.length;

    if (!source) {
      showEmptyGrid(slots, options.framesUnavailableMessage || 'No frames available \u2014 upload an image instead');
      return;
    }

    if (Array.isArray(source.imageUrls)) {
      const frames = source.imageUrls.slice(0, count).map(url => ({ url }));
      while (frames.length < count) frames.push(null);
      state.frames = frames;
      frames.forEach((f, idx) => renderFrameTile(slots[idx], f, idx));
      if (!frames.some(Boolean)) showEmptyGrid(slots, options.emptyFramesMessage || 'Could not load frames');
      return;
    }

    const cached = options.cacheKey ? frameCache.get(options.cacheKey) : null;
    if (cached) {
      rememberFrames(options.cacheKey, cached);
      state.frames = cached;
      cached.forEach((f, idx) => renderFrameTile(slots[idx], f, idx));
      if (!cached.some(Boolean)) showEmptyGrid(slots, options.emptyFramesMessage || 'Could not load frames');
      return;
    }

    const onFrame = (idx, f) => {
      if (state !== token) return;
      state.frames[idx] = f;
      renderFrameTile(slots[idx], f, idx);
    };
    let frames;
    if (source.frames) {
      // Pre-extracted (e.g. computed while an upload was in flight). A
      // `partial` array lets tiles that already landed show immediately.
      if (Array.isArray(source.partial)) {
        source.partial.forEach((f, idx) => { if (f && idx < count) onFrame(idx, f); });
      }
      frames = await Promise.resolve(source.frames);
      if (state !== token) return;
      frames = Array.from({ length: count }, (_, idx) => (frames && frames[idx]) || null);
      frames.forEach((f, idx) => onFrame(idx, f));
    } else if (source.file) {
      frames = await extractFramesFromFile(source.file, count, onFrame);
    } else if (source.videoUrl) {
      frames = await extractCandidateFrames(source.videoUrl, count, onFrame);
    } else {
      frames = Array.from({ length: count }, () => null);
    }
    if (state !== token) return;
    state.frames = frames;
    rememberFrames(options.cacheKey, frames);
    if (!frames.some(Boolean)) showEmptyGrid(slots, options.emptyFramesMessage || 'Could not load frames');
  }

  function open(options) {
    const o = Object.assign({ allowUpload: true }, options || {});
    ensureDialog();
    lastFocused = document.activeElement;
    state = { options: o, selection: null, frames: [], custom: null, saving: false };

    els.title.textContent = o.title || 'Change thumbnail';
    els.sub.textContent = o.subtitle || (o.allowUpload
      ? 'Pick a frame from your video or upload your own image.'
      : 'Pick a frame from your video.');
    els.framesTitle.textContent = o.framesTitle || 'Pick a frame';
    els.uploadTitle.hidden = !o.allowUpload;
    els.uploadRow.hidden = !o.allowUpload;
    els.skip.hidden = !o.skipLabel;
    els.skip.textContent = o.skipLabel || 'Skip';
    els.save.textContent = o.saveLabel || 'Save thumbnail';
    els.save.disabled = true;
    setError('');
    els.uploadPreview.innerHTML = 'No file';
    els.uploadPreview.classList.remove('selected');
    els.fileInput.value = '';

    els.grid.innerHTML = '';
    const slots = [];
    for (let n = 0; n < TP_FRAME_COUNT; n++) {
      const tile = document.createElement('div');
      tile.className = 'tp-frame loading';
      tile.setAttribute('aria-label', 'Loading frame');
      els.grid.appendChild(tile);
      slots.push(tile);
    }

    els.overlay.classList.add('show');
    els.overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      const first = els.overlay.querySelector('button:not([disabled]):not([hidden]), input:not([disabled])');
      if (first) first.focus();
    }, 0);

    populateFrames(o, slots).catch(() => {
      if (state && state.options === o) showEmptyGrid(slots, 'Could not load frames');
    });
  }

  async function save() {
    if (!state || !state.selection || state.saving) return;
    const { options, selection } = state;
    const token = state;
    state.saving = true;
    els.save.disabled = true;
    els.save.textContent = 'Saving\u2026';
    setError('');
    try {
      const result = typeof options.onSave === 'function' ? await options.onSave(selection) : undefined;
      if (state !== token) return; // caller closed the dialog itself
      if (result === false) {
        state.saving = false;
        els.save.disabled = false;
        els.save.textContent = options.saveLabel || 'Save thumbnail';
        return;
      }
      close();
    } catch (err) {
      if (state !== token) return;
      state.saving = false;
      els.save.disabled = false;
      els.save.textContent = options.saveLabel || 'Save thumbnail';
      setError((err && err.message) || 'Could not save thumbnail.');
    }
  }

  function bindEvents() {
    els.close.addEventListener('click', close);
    els.cancel.addEventListener('click', close);
    els.skip.addEventListener('click', () => {
      const options = state && state.options;
      close();
      if (options && typeof options.onSkip === 'function') options.onSkip();
    });
    els.save.addEventListener('click', save);
    els.overlay.addEventListener('click', (e) => {
      if (e.target === els.overlay) close();
    });
    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') {
        const focusable = Array.from(els.overlay.querySelectorAll(
          'button:not([disabled]):not([hidden]), input:not([disabled]), [tabindex]:not([tabindex="-1"]), .tp-frame:not(.empty):not(.loading)'
        ));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });

    els.fileBtn.addEventListener('click', () => els.fileInput.click());
    els.uploadPreview.addEventListener('click', () => { if (state && state.custom) selectCustom(); });
    els.uploadPreview.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && state && state.custom) {
        e.preventDefault();
        selectCustom();
      }
    });
    els.fileInput.addEventListener('change', () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      if (!file) return;
      const token = state;
      readCustomImage(file).then(custom => {
        if (state !== token) return;
        state.custom = custom;
        els.uploadPreview.tabIndex = 0;
        els.uploadPreview.setAttribute('role', 'option');
        els.uploadPreview.setAttribute('aria-selected', 'false');
        els.uploadPreview.setAttribute('aria-label', 'Custom uploaded image');
        els.uploadPreview.innerHTML = '';
        const preview = document.createElement('img');
        preview.src = custom.dataUrl;
        preview.alt = '';
        els.uploadPreview.appendChild(preview);
        selectCustom();
      }).catch(err => {
        if (state !== token) return;
        setError((err && err.message) || 'Could not read this image.');
        els.fileInput.value = '';
      });
    });
  }

  const api = {
    TP_MAX_BYTES,
    TP_FRAME_COUNT,
    open,
    close,
    isOpen,
    setError,
    invalidateCache,
    formatTimecode,
    frameSeekTimes,
    extractCandidateFrames,
    extractFramesFromFile,
    readCustomImage
  };

  if (typeof window !== 'undefined') window.ThumbnailPicker = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
