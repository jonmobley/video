    const content    = document.getElementById('content');
    const emailPill  = document.getElementById('emailPill');
    const headerSub  = document.getElementById('headerSub');
    const toast      = document.getElementById('toast');
    const logoutBtn  = document.getElementById('logoutBtn');

    function showToast(msg) {
      toast.textContent = msg; toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    }

    function formatBytes(b) {
      if (!b) return '—';
      if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
      if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
      return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
    function formatViews(n) {
      if (n === 1) return '1 view';
      if (n < 1000) return n + ' views';
      return (n / 1000).toFixed(1) + 'k views';
    }
    function formatDate(iso) {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    function formatExpiry(iso) {
      if (!iso) return null;
      const diff = new Date(iso) - Date.now();
      if (diff <= 0) return 'Expired';
      const days = Math.floor(diff / 86400000);
      if (days >= 1) return `Expires in ${days} day${days === 1 ? '' : 's'}`;
      const hours = Math.floor(diff / 3600000);
      return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
    }
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }

    function redirectToLogin(opts) {
      const expired = opts && opts.expired;
      const params = new URLSearchParams();
      params.set('next', '/account');
      if (expired) params.set('reason', 'expired');
      window.location.replace('/login?' + params.toString());
    }

    async function loadAccount() {
      // Auth gate
      let me;
      try { me = await fetch('/api/auth/me'); }
      catch { content.innerHTML = '<div class="empty"><div class="empty-title">Network error</div><div class="empty-sub">Please refresh.</div></div>'; return; }
      if (me.status === 401) return redirectToLogin();
      if (!me.ok) {
        content.innerHTML = '<div class="empty"><div class="empty-title">Could not load account</div><div class="empty-sub">Please refresh the page.</div></div>';
        return;
      }
      const meData = await me.json();
      const paidBadge = meData.is_paid ? '<span class="paid-badge">Paid</span>' : '';
      emailPill.innerHTML = 'Signed in as <strong>' + escapeHtml(meData.email) + '</strong>' + paidBadge;
      window.__isPaidUser = !!meData.is_paid;

      const res = await fetch('/api/my-videos');
      // Session may have expired between the /me check and this call —
      // bounce the user to login so they can re-authenticate cleanly.
      if (res.status === 401) return redirectToLogin({ expired: true });
      if (!res.ok) {
        content.innerHTML = '<div class="empty"><div class="empty-title">Could not load videos</div><div class="empty-sub">Please refresh the page.</div></div>';
        headerSub.textContent = '';
        return;
      }
      const { videos } = await res.json();
      renderVideos(videos);
      checkEmbedStatus(videos);
      backfillThumbnails(videos);
    }

    // One-time, client-driven sweep that captures a real frame for any of
    // the user's native uploads that still has no thumbnail. Reuses the
    // same capture helper + endpoint as the upload widget; the server-side
    // /api/upload-thumbnail enforces ownership and is idempotent (returns
    // 409 ALREADY_SET on subsequent calls), so this is safe to re-run on
    // every dashboard load.
    async function backfillThumbnails(videos) {
      if (typeof window.captureVideoThumbnail !== 'function') return;
      // Only native uploads have a streamable file we can decode here.
      // Password-protected videos would 403 from /api/video/:id without a
      // session token, so skip them rather than failing noisily.
      const targets = videos.filter(v =>
        !v.has_thumbnail &&
        !v.has_password &&
        (!v.platform || v.platform === 'upload')
      );
      // Sequential — each capture pulls the video bytes, so concurrency
      // would balloon bandwidth and memory for users with many uploads.
      for (const v of targets) {
        try {
          const src = `/api/video/${encodeURIComponent(v.id)}`;
          const result = await window.captureVideoThumbnail(src);
          if (!result || !result.base64) continue;
          const r = await fetch('/api/upload-thumbnail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoId: v.id,
              data: result.base64,
              contentType: result.contentType || 'image/jpeg'
            })
          });
          // 200 = freshly stored, 409 = someone else already filled it in
          // between page load and now. Both mean a real thumb is available.
          if (r.ok || r.status === 409) {
            swapInThumbnail(v.id);
          }
        } catch (_) { /* non-fatal — placeholder stays */ }
      }
    }

    function swapInThumbnail(videoId) {
      const cards = document.querySelectorAll('.video-card');
      for (const card of cards) {
        if (card.dataset.id !== videoId) continue;
        const wrap = card.querySelector('.vc-thumb');
        if (!wrap) return;
        if (wrap.querySelector('img')) return; // already has one
        const placeholder = wrap.querySelector('.vc-thumb-placeholder');
        if (placeholder) placeholder.remove();
        const img = document.createElement('img');
        img.src = `/api/video-thumbnail/${encodeURIComponent(videoId)}`;
        img.alt = '';
        img.loading = 'lazy';
        img.dataset.thumbErrorFallback = 'true';
        wrap.insertBefore(img, wrap.firstChild);
        return;
      }
    }

    const EMBED_PLATFORMS = ['youtube', 'vimeo', 'dailymotion', 'loom', 'wistia'];
    const WARN_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 0 1 .87.5l7 12A1 1 0 0 1 17 16H3a1 1 0 0 1-.87-1.5l7-12A1 1 0 0 1 10 2zm0 5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 10 7zm0 7a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z"/></svg>';

    function platformSettingsUrl(v) {
      const eid = v.embed_video_id;
      if (!eid) return null;
      const p = (v.platform || '').toLowerCase();
      if (p === 'youtube') return 'https://www.youtube.com/watch?v=' + encodeURIComponent(eid);
      if (p === 'vimeo') return 'https://vimeo.com/' + encodeURIComponent(eid.split('/')[0]) + '/settings';
      if (p === 'dailymotion') return 'https://www.dailymotion.com/video/' + encodeURIComponent(eid);
      if (p === 'loom') return 'https://www.loom.com/share/' + encodeURIComponent(eid);
      if (p === 'wistia') return null;
      return null;
    }

    async function checkEmbedStatus(videos) {
      const linked = videos.filter(v =>
        v.embed_video_id && EMBED_PLATFORMS.includes((v.platform || '').toLowerCase())
      );
      if (!linked.length) return;
      try {
        const r = await fetch('/api/my-videos/embed-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoIds: linked.map(v => v.id) })
        });
        if (!r.ok) return;
        const { results } = await r.json();
        for (const v of linked) {
          const status = results[v.id];
          if (status && status.embedAvailable === false) {
            const card = document.querySelector(`.video-card[data-id="${cssEscape(v.id)}"]`);
            if (!card) continue;
            const titleEl = card.querySelector('.vc-title');
            if (!titleEl || titleEl.querySelector('.vc-unavailable')) continue;
            const url = platformSettingsUrl(v);
            const badge = document.createElement(url ? 'a' : 'span');
            badge.className = 'vc-unavailable';
            badge.setAttribute('title', 'This embed is no longer available. Check the video\u2019s settings on ' + (PLATFORM_CONFIG[(v.platform || '').toLowerCase()] || { label: 'the source' }).label + '.');
            badge.innerHTML = WARN_SVG + ' Unavailable';
            if (url) {
              badge.href = url;
              badge.target = '_blank';
              badge.rel = 'noopener';
            }
            titleEl.appendChild(badge);
          }
        }
      } catch (_) {}
    }

    // Lookup so the thumbnail dialog can read metadata (e.g. password
     // status, platform) without re-fetching the full list.
    const videosById = Object.create(null);

    function renderVideos(videos) {
      // Reset and repopulate the lookup whenever the list re-renders.
      for (const k of Object.keys(videosById)) delete videosById[k];
      videos.forEach(v => { videosById[v.id] = v; });

      if (!videos.length) {
        headerSub.textContent = 'You haven\u2019t uploaded any videos yet.';
        content.innerHTML = `
          <div class="empty">
            <div class="empty-title">No videos yet</div>
            <div class="empty-sub">Upload your first video to get a shareable link.</div>
            <a href="/upload" class="upload-cta empty-upload-cta">+ Upload a video</a>
          </div>`;
        return;
      }
      headerSub.textContent = `${videos.length} video${videos.length === 1 ? '' : 's'}`;
      content.innerHTML = '<div class="video-list">' + videos.map(renderCard).join('') + '</div>';
      attachCardHandlers();
    }

    const PLACEHOLDER_SVG = `
      <div class="vc-thumb-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
             stroke-linecap="round" stroke-linejoin="round">
          <rect x="2.5" y="5" width="19" height="14" rx="2"/>
          <path d="M10 9.5v5l4-2.5z" fill="currentColor" stroke="none"/>
        </svg>
      </div>`;

    document.addEventListener('error', function(e) {
      if (e.target.tagName !== 'IMG' || !e.target.hasAttribute('data-thumb-error-fallback')) return;
      var img = e.target;
      var wrap = img.parentElement;
      if (!wrap) return;
      img.remove();
      var ph = document.createElement('div');
      ph.innerHTML = PLACEHOLDER_SVG.trim();
      wrap.insertBefore(ph.firstElementChild, wrap.firstChild);
    }, true);

    function thumbSrc(v, version) {
      // Cache-busting via version param so a freshly-replaced thumbnail
      // shows up immediately without forcing a hard refresh.
      const base = `/api/video-thumbnail/${encodeURIComponent(v.id)}`;
      return version ? `${base}?v=${version}` : base;
    }

    function renderThumb(v) {
      const info = platformInfo(v);
      let inner;
      if (v.has_thumbnail) {
        inner = `<img src="${escapeHtml(thumbSrc(v))}" alt="" loading="lazy" data-thumb-error-fallback="true">`;
      } else if (info.key === 'youtube' && v.embed_video_id) {
        const src = `https://i.ytimg.com/vi/${encodeURIComponent(v.embed_video_id)}/hqdefault.jpg`;
        inner = `<img src="${escapeHtml(src)}" alt="" loading="lazy" data-thumb-error-fallback="true">`;
      } else {
        inner = PLACEHOLDER_SVG;
      }
      return `<div class="vc-thumb">${inner}</div>`;
    }

    // Native uploads are the only ones whose thumbnail lives in our DB
    // and can be replaced via /api/my-videos/:id/thumbnail. External
    // platforms (YouTube/Vimeo) serve their own art so we hide the button.
    function canChangeThumbnail(v) {
      return platformInfo(v).key === 'upload';
    }

    function renderCard(v) {
      const watchUrl = `/watch?id=${encodeURIComponent(v.id)}`;
      const exp = formatExpiry(v.expires_at);
      const info = platformInfo(v);
      const badge = `<span class="source-badge ${info.key}">${info.label}</span>`;
      const thumbBtn = canChangeThumbnail(v)
        ? '<button class="vc-btn thumb-btn">Thumbnail</button>'
        : '';
      return `
        <div class="video-card" data-id="${escapeHtml(v.id)}">
          ${renderThumb(v)}
          <div class="vc-main">
            <div class="vc-title"><span class="vc-title-text">${escapeHtml(v.title || 'Untitled')}</span>${badge}</div>
            <div class="vc-meta">
              <span>${formatDate(v.uploaded_at)}</span>
              <span>${formatBytes(v.file_size)}</span>
              <span>${formatViews(v.view_count)}</span>
              ${v.has_password ? '<span class="lock">Password</span>' : ''}
              ${exp ? `<span class="exp">${exp}</span>` : (window.__isPaidUser ? '<span class="no-expiry">∞ No expiry</span>' : '')}
            </div>
          </div>
          <div class="vc-actions">
            <a class="vc-btn" href="${watchUrl}" target="_blank" rel="noopener">Open</a>
            <button class="vc-btn copy-btn" data-url="${watchUrl}">Copy link</button>
            <button class="vc-btn edit-btn">Edit</button>
            ${thumbBtn}
            <button class="vc-btn danger delete-btn">Delete</button>
          </div>
        </div>`;
    }

    function attachCardHandlers() {
      document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const url = window.location.origin + btn.dataset.url;
          try { await navigator.clipboard.writeText(url); }
          catch {
            const ta = document.createElement('textarea');
            ta.value = url; ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
          }
          const original = btn.textContent;
          btn.textContent = 'Copied!'; btn.classList.add('copied');
          setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1800);
        });
      });

      document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const card = btn.closest('.video-card');
          openEditDialog(card.dataset.id);
        });
      });

      document.querySelectorAll('.thumb-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const card = btn.closest('.video-card');
          openThumbnailDialog(card.dataset.id);
        });
      });

      document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const card = btn.closest('.video-card');
          const id = card.dataset.id;
          const title = card.querySelector('.vc-title').textContent;
          if (!confirm(`Delete "${title}"? This cannot be undone — the share link will stop working immediately.`)) return;
          btn.disabled = true; btn.textContent = 'Deleting…';
          let res;
          try { res = await fetch(`/api/my-videos/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
          catch { btn.disabled = false; btn.textContent = 'Delete'; showToast('Network error.'); return; }
          if (res.status === 401) return redirectToLogin({ expired: true });
          if (!res.ok) {
            btn.disabled = false; btn.textContent = 'Delete';
            const data = await res.json().catch(() => ({}));
            const msg = (data && data.error && (data.error.message || data.error)) || 'Could not delete video.';
            showToast(typeof msg === 'string' ? msg : 'Could not delete video.');
            return;
          }
          card.style.transition = 'opacity 0.2s, transform 0.2s';
          card.style.opacity = '0'; card.style.transform = 'scale(0.97)';
          setTimeout(() => { card.remove(); checkEmpty(); }, 200);
          showToast('Deleted');
        });
      });
    }

    function checkEmpty() {
      const remaining = document.querySelectorAll('.video-card').length;
      if (remaining === 0) renderVideos([]);
      else headerSub.textContent = `${remaining} video${remaining === 1 ? '' : 's'}`;
    }

    // ── Edit video dialog ─────────────────────────────────────────────────
    const editOverlay   = document.getElementById('editOverlay');
    const editClose     = document.getElementById('editClose');
    const editCancel    = document.getElementById('editCancel');
    const editSave      = document.getElementById('editSave');
    const editTitleInput    = document.getElementById('editTitleInput');
    const editExpirySelect  = document.getElementById('editExpirySelect');
    const editExpiryHint    = document.getElementById('editExpiryHint');
    const editPasswordInput = document.getElementById('editPasswordInput');
    const editPasswordHint  = document.getElementById('editPasswordHint');
    const editRemovePwRow   = document.getElementById('editRemovePwRow');
    const editRemovePw      = document.getElementById('editRemovePw');
    const editError         = document.getElementById('editError');

    let editState = null;
    let editLastFocused = null;

    function setEditError(msg) { editError.textContent = msg || ''; }

    function openEditDialog(videoId) {
      const v = videosById[videoId];
      if (!v) return;
      editLastFocused = document.activeElement;
      editState = { videoId };
      editTitleInput.value = v.title || '';
      editExpirySelect.value = 'keep';
      if (window.__isPaidUser) {
        editExpiryHint.textContent = 'Paid account — your videos never expire.';
        editExpirySelect.disabled = true;
      } else if (v.expires_at) {
        editExpiryHint.textContent = 'Currently: ' + formatExpiry(v.expires_at);
        editExpirySelect.disabled = false;
      } else {
        editExpiryHint.textContent = 'Currently: no expiration';
        editExpirySelect.disabled = false;
      }
      editPasswordInput.value = '';
      editRemovePw.checked = false;
      if (v.has_password) {
        editPasswordHint.textContent = 'Currently password-protected. Enter a new password to change it.';
        editRemovePwRow.style.display = 'flex';
      } else {
        editPasswordHint.textContent = 'No password set. Enter one to add protection.';
        editRemovePwRow.style.display = 'none';
      }
      setEditError('');
      editSave.disabled = false;
      editSave.textContent = 'Save changes';
      editOverlay.classList.add('show');
      editOverlay.setAttribute('aria-hidden', 'false');
      setTimeout(() => editTitleInput.focus(), 0);
    }

    function closeEditDialog() {
      editOverlay.classList.remove('show');
      editOverlay.setAttribute('aria-hidden', 'true');
      setEditError('');
      editState = null;
      if (editLastFocused && typeof editLastFocused.focus === 'function') {
        editLastFocused.focus();
      }
    }

    editClose.addEventListener('click', closeEditDialog);
    editCancel.addEventListener('click', closeEditDialog);
    editOverlay.addEventListener('click', (e) => {
      if (e.target === editOverlay) closeEditDialog();
    });
    document.addEventListener('keydown', (e) => {
      if (!editOverlay.classList.contains('show')) return;
      if (e.key === 'Escape') { closeEditDialog(); return; }
      if (e.key === 'Tab') {
        const focusable = Array.from(editOverlay.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled])'
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

    editSave.addEventListener('click', async () => {
      if (!editState) return;
      const videoId = editState.videoId;
      const v = videosById[videoId];
      if (!v) return;

      const newTitle = editTitleInput.value.trim();
      if (!newTitle) { setEditError('Title cannot be empty.'); editTitleInput.focus(); return; }

      const body = {};
      if (newTitle !== (v.title || '').trim()) {
        body.title = newTitle;
      }

      const expiryVal = editExpirySelect.value;
      if (expiryVal !== 'keep') {
        body.expiryDays = expiryVal === 'never' ? 'never' : parseInt(expiryVal, 10);
      }

      const pw = editPasswordInput.value;
      if (pw !== '') {
        body.password = pw;
      } else if (v.has_password && editRemovePw.checked) {
        body.password = '';
      }

      if (Object.keys(body).length === 0) {
        closeEditDialog();
        showToast('No changes to save');
        return;
      }

      editSave.disabled = true; editSave.textContent = 'Saving…';
      setEditError('');

      let res;
      try {
        res = await fetch(`/api/my-videos/${encodeURIComponent(videoId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } catch (_) {
        editSave.disabled = false; editSave.textContent = 'Save changes';
        setEditError('Network error. Please try again.');
        return;
      }
      if (res.status === 401) { closeEditDialog(); return redirectToLogin({ expired: true }); }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data && data.error && (data.error.message || data.error)) || 'Could not save changes.';
        setEditError(typeof msg === 'string' ? msg : 'Could not save changes.');
        editSave.disabled = false; editSave.textContent = 'Save changes';
        return;
      }

      const { video } = await res.json().catch(() => ({}));
      if (video) {
        v.title = video.title;
        v.expires_at = video.expires_at;
        v.has_password = video.has_password;
      }

      const card = document.querySelector(`.video-card[data-id="${cssEscape(videoId)}"]`);
      if (card) {
        const titleEl = card.querySelector('.vc-title');
        if (titleEl) titleEl.textContent = v.title || 'Untitled';

        const metaEl = card.querySelector('.vc-meta');
        if (metaEl) {
          const exp = formatExpiry(v.expires_at);
          metaEl.innerHTML = `
            <span>${formatDate(v.uploaded_at)}</span>
            <span>${formatBytes(v.file_size)}</span>
            <span>${formatViews(v.view_count)}</span>
            ${v.has_password ? '<span class="lock">Password</span>' : ''}
            ${exp ? `<span class="exp">${exp}</span>` : (window.__isPaidUser ? '<span class="no-expiry">∞ No expiry</span>' : '')}
          `;
        }
      }

      editSave.disabled = false; editSave.textContent = 'Save changes';
      closeEditDialog();
      showToast('Video updated');
    });

    // ── Thumbnail picker dialog ─────────────────────────────────────────────
    const tpOverlay = document.getElementById('tpOverlay');
    const tpClose   = document.getElementById('tpClose');
    const tpCancel  = document.getElementById('tpCancel');
    const tpSave    = document.getElementById('tpSave');
    const tpGrid    = document.getElementById('tpGrid');
    const tpError   = document.getElementById('tpError');
    const tpSub     = document.getElementById('tpSub');
    const tpFramesTitle  = document.getElementById('tpFramesTitle');
    const tpFileInput    = document.getElementById('tpFileInput');
    const tpFileBtn      = document.getElementById('tpFileBtn');
    const tpUploadPreview = document.getElementById('tpUploadPreview');

    // Server-side cap is 500 KB; mirror it here so users get an immediate
    // error instead of a cryptic 413 after the round-trip.
    const TP_MAX_BYTES = 500 * 1024;
    const TP_FRAME_RATIOS = [0.05, 0.20, 0.40, 0.55, 0.75, 0.92];

    let tpState = null; // { videoId, selection, frames: [{base64,contentType}], custom }
    const tpFrameCache = new Map();
    const TP_FRAME_CACHE_MAX = 20;

    function setTpError(msg) { tpError.textContent = msg || ''; }

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
      tile.setAttribute('aria-label', 'Frame ' + (idx + 1));
      const img = document.createElement('img');
      img.src = f.dataUrl;
      img.alt = 'Frame ' + (idx + 1);
      tile.appendChild(img);
      tile.addEventListener('click', () => selectFrame(idx));
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectFrame(idx);
        }
      });
    }

    function closeThumbnailDialog() {
      tpOverlay.classList.remove('show');
      tpOverlay.setAttribute('aria-hidden', 'true');
      tpGrid.innerHTML = '';
      setTpError('');
      tpFileInput.value = '';
      tpUploadPreview.innerHTML = 'No file';
      tpUploadPreview.classList.remove('selected');
      tpSave.disabled = true;
      tpState = null;
      if (tpLastFocused && typeof tpLastFocused.focus === 'function') {
        tpLastFocused.focus();
      }
    }

    function selectFrame(index) {
      if (!tpState) return;
      tpState.selection = { kind: 'frame', index };
      Array.from(tpGrid.children).forEach((el, i) => {
        el.classList.toggle('selected', i === index);
        el.setAttribute('aria-selected', String(i === index));
      });
      tpUploadPreview.classList.remove('selected');
      tpUploadPreview.setAttribute('aria-selected', 'false');
      tpSave.disabled = false;
      setTpError('');
    }

    function selectCustom() {
      if (!tpState || !tpState.custom) return;
      tpState.selection = { kind: 'custom' };
      Array.from(tpGrid.children).forEach(el => {
        el.classList.remove('selected');
        el.setAttribute('aria-selected', 'false');
      });
      tpUploadPreview.classList.add('selected');
      tpUploadPreview.setAttribute('aria-selected', 'true');
      tpSave.disabled = false;
      setTpError('');
    }

    function extractCandidateFrames(videoUrl, ratios, onFrame) {
      return new Promise((resolve) => {
        const out = ratios.map(() => null);
        let i = 0;
        let settled = false;
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.crossOrigin = 'anonymous';
        video.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';

        const TIMEOUT_MS = 30000;
        const timer = setTimeout(() => finish(), TIMEOUT_MS);

        function cleanup() {
          try { video.pause(); } catch (_) {}
          try { video.removeAttribute('src'); video.load(); } catch (_) {}
          try { video.remove(); } catch (_) {}
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
            return { dataUrl, base64: dataUrl.slice(comma + 1), contentType: 'image/jpeg' };
          } catch (_) {
            return null;
          }
        }

        function seekNext() {
          if (i >= ratios.length) return finish();
          const dur = isFinite(video.duration) ? video.duration : 0;
          const t = Math.max(0, Math.min(dur - 0.05, dur * ratios[i]));
          try { video.currentTime = t; }
          catch (_) { i++; seekNext(); }
        }

        video.addEventListener('loadedmetadata', () => seekNext());
        video.addEventListener('seeked', () => {
          const idx = i;
          out[idx] = captureCurrent();
          if (typeof onFrame === 'function') onFrame(idx, out[idx]);
          i++;
          seekNext();
        });
        video.addEventListener('error', () => finish());

        try {
          video.src = videoUrl;
          document.body.appendChild(video);
          video.load();
        } catch (_) { finish(); }
      });
    }

    async function openThumbnailDialog(videoId) {
      const v = videosById[videoId];
      if (!v) return;
      tpLastFocused = document.activeElement;
      tpState = { videoId, selection: null, frames: [], custom: null };
      tpOverlay.classList.add('show');
      tpOverlay.setAttribute('aria-hidden', 'false');
      setTpError('');
      tpSave.disabled = true;
      tpUploadPreview.innerHTML = 'No file';
      tpUploadPreview.classList.remove('selected');
      tpFileInput.value = '';

      tpGrid.innerHTML = '';
      const slots = [];
      for (let n = 0; n < TP_FRAME_RATIOS.length; n++) {
        const tile = document.createElement('div');
        tile.className = 'tp-frame loading';
        tile.setAttribute('aria-label', 'Loading frame');
        tpGrid.appendChild(tile);
        slots.push(tile);
      }

      setTimeout(() => {
        const first = tpOverlay.querySelector('button:not([disabled]), input:not([disabled])');
        if (first) first.focus();
      }, 0);

      if (v.has_password) {
        tpFramesTitle.textContent = 'Pick a frame';
        slots.forEach(tile => {
          tile.className = 'tp-frame empty';
          tile.textContent = 'Password-protected \u2014 upload an image instead';
        });
        return;
      }

      const cached = tpFrameCache.get(videoId);
      if (cached) {
        tpFrameCache.delete(videoId);
        tpFrameCache.set(videoId, cached);
        tpState.frames = cached;
        let any = false;
        cached.forEach((f, idx) => {
          if (f) any = true;
          renderFrameTile(slots[idx], f, idx);
        });
        if (!any) {
          tpFramesTitle.textContent = 'Pick a frame';
          slots.forEach(tile => {
            tile.className = 'tp-frame empty';
            tile.textContent = 'Could not load frames';
          });
        }
        return;
      }

      const videoUrl = `/api/video/${encodeURIComponent(videoId)}`;
      const frames = await extractCandidateFrames(videoUrl, TP_FRAME_RATIOS, (idx, f) => {
        if (!tpState || tpState.videoId !== videoId) return;
        tpState.frames[idx] = f;
        renderFrameTile(slots[idx], f, idx);
      });

      if (!tpState || tpState.videoId !== videoId) return;
      tpState.frames = frames;
      tpFrameCache.set(videoId, frames);
      while (tpFrameCache.size > TP_FRAME_CACHE_MAX) {
        const oldest = tpFrameCache.keys().next().value;
        tpFrameCache.delete(oldest);
      }

      const any = frames.some(f => !!f);
      if (!any) {
        tpFramesTitle.textContent = 'Pick a frame';
        slots.forEach(tile => {
          tile.className = 'tp-frame empty';
          tile.textContent = 'Could not load frames';
        });
      }
    }

    let tpLastFocused = null;

    tpClose.addEventListener('click', closeThumbnailDialog);
    tpCancel.addEventListener('click', closeThumbnailDialog);
    tpOverlay.addEventListener('click', (e) => {
      if (e.target === tpOverlay) closeThumbnailDialog();
    });
    document.addEventListener('keydown', (e) => {
      if (!tpOverlay.classList.contains('show')) return;
      if (e.key === 'Escape') { closeThumbnailDialog(); return; }
      if (e.key === 'Tab') {
        const focusable = Array.from(tpOverlay.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]), .tp-frame:not(.empty):not(.loading)'
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

    tpFileBtn.addEventListener('click', () => tpFileInput.click());
    tpUploadPreview.addEventListener('click', () => { if (tpState && tpState.custom) selectCustom(); });
    tpUploadPreview.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && tpState && tpState.custom) {
        e.preventDefault();
        selectCustom();
      }
    });
    tpFileInput.addEventListener('change', () => {
      const file = tpFileInput.files && tpFileInput.files[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setTpError('Image must be JPEG, PNG, or WebP.');
        tpFileInput.value = '';
        return;
      }
      // Read the file and downscale via canvas if needed to stay under the
      // 500 KB server cap. Re-encode as JPEG when shrinking.
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          processCustomImage(img, file).then(custom => {
            if (!custom) {
              setTpError('Could not process this image. Try a smaller file.');
              return;
            }
            if (!tpState) return;
            tpState.custom = custom;
            tpUploadPreview.tabIndex = 0;
            tpUploadPreview.setAttribute('role', 'option');
            tpUploadPreview.setAttribute('aria-selected', 'false');
            tpUploadPreview.setAttribute('aria-label', 'Custom uploaded image');
            tpUploadPreview.innerHTML = '';
            const preview = document.createElement('img');
            preview.src = custom.dataUrl;
            preview.alt = '';
            tpUploadPreview.appendChild(preview);
            selectCustom();
          });
        };
        img.onerror = () => setTpError('Could not read this image.');
        img.src = String(reader.result || '');
      };
      reader.onerror = () => setTpError('Could not read this image.');
      reader.readAsDataURL(file);
    });

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

    tpSave.addEventListener('click', async () => {
      if (!tpState || !tpState.selection) return;
      let payload;
      if (tpState.selection.kind === 'frame') {
        const f = tpState.frames[tpState.selection.index];
        if (!f) return;
        payload = { data: f.base64, contentType: f.contentType };
      } else if (tpState.selection.kind === 'custom') {
        if (!tpState.custom) return;
        payload = { data: tpState.custom.base64, contentType: tpState.custom.contentType };
      } else { return; }

      const videoId = tpState.videoId;
      tpSave.disabled = true; tpSave.textContent = 'Saving…';
      setTpError('');
      let res;
      try {
        res = await fetch(`/api/my-videos/${encodeURIComponent(videoId)}/thumbnail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (_) {
        tpSave.disabled = false; tpSave.textContent = 'Save thumbnail';
        setTpError('Network error. Please try again.');
        return;
      }
      if (res.status === 401) { closeThumbnailDialog(); return redirectToLogin({ expired: true }); }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data && data.error && (data.error.message || data.error)) || 'Could not save thumbnail.';
        setTpError(typeof msg === 'string' ? msg : 'Could not save thumbnail.');
        tpSave.disabled = false; tpSave.textContent = 'Save thumbnail';
        return;
      }
      const out = await res.json().catch(() => ({}));
      const version = out.version || Date.now();
      tpFrameCache.delete(videoId);

      // Update the card thumbnail in place + flag has_thumbnail so the
      // next list re-render keeps showing the real frame.
      const card = document.querySelector(`.video-card[data-id="${cssEscape(videoId)}"]`);
      if (card) {
        const wrap = card.querySelector('.vc-thumb');
        if (wrap) {
          // Wipe the old <img> or placeholder and drop in a fresh one.
          const placeholder = wrap.querySelector('.vc-thumb-placeholder');
          if (placeholder) placeholder.remove();
          let img = wrap.querySelector('img');
          if (!img) {
            img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            img.dataset.thumbErrorFallback = 'true';
            wrap.insertBefore(img, wrap.firstChild);
          }
          img.src = `/api/video-thumbnail/${encodeURIComponent(videoId)}?v=${encodeURIComponent(version)}`;
        }
      }
      const v = videosById[videoId];
      if (v) v.has_thumbnail = true;

      tpSave.disabled = false; tpSave.textContent = 'Save thumbnail';
      closeThumbnailDialog();
      showToast('Thumbnail updated');
    });

    // Tiny CSS.escape polyfill for older browsers; only used to look up a
    // card by data-id, which is always a known-safe video id.
    function cssEscape(s) {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
      return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
    }

    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    });

    loadAccount();

    document.getElementById('navUploadBtn').addEventListener('click', e => {
      e.preventDefault();
      window.openUploadModal();
    });

    // Delegated since the empty-state CTA is rendered after data load.
    content.addEventListener('click', e => {
      const target = e.target.closest('.empty-upload-cta');
      if (!target) return;
      e.preventDefault();
      window.openUploadModal();
    });
