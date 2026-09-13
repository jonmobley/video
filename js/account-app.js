    const content    = document.getElementById('content');
    const emailPill  = document.getElementById('emailPill');
    const headerSub  = document.getElementById('headerSub');
    const toast      = document.getElementById('toast');
    const logoutBtn  = document.getElementById('logoutBtn');

    const Feedback = window.VsFeedback;

    // Toasts are reserved for confirmations of things that already happened
    // (deleted, updated). Errors are rendered next to the control that failed.
    function showToast(msg) {
      toast.textContent = msg; toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    }

    // Replace the main content area with a load failure + retry control.
    function showLoadError(title, sub, onRetry) {
      content.innerHTML =
        '<div class="empty load-error" role="alert">' +
          '<div class="empty-title load-error-title"></div>' +
          '<div class="empty-sub load-error-sub"></div>' +
          '<button type="button" class="load-error-btn">Try again</button>' +
        '</div>';
      content.querySelector('.load-error-title').textContent = title;
      content.querySelector('.load-error-sub').textContent = sub;
      content.querySelector('.load-error-btn').addEventListener('click', () => {
        content.innerHTML = '<div class="spinner"></div>';
        headerSub.textContent = 'Loading your uploads\u2026';
        onRetry();
      });
      headerSub.textContent = '';
    }

    // Per-card error line (delete failed, etc.) so the message sits with
    // the video it concerns instead of floating at the bottom of the page.
    function showCardError(card, msg) {
      const host = card.querySelector('.vc-main') || card;
      Feedback.showInlineError(host, msg, { inside: true, className: 'inline-error inline-compact' });
    }
    function clearCardError(card) {
      const host = card.querySelector('.vc-main') || card;
      Feedback.clearInlineError(host, { inside: true, className: 'inline-error inline-compact' });
    }

    // Copy with visible success/failure on the button itself.
    async function copyWithButtonFeedback(btn, text) {
      const ok = await Feedback.copyText(text);
      if (ok) {
        Feedback.flashButton(btn, 'Copied!', 'copied', 1800);
      } else {
        Feedback.flashButton(btn, 'Couldn\u2019t copy', 'btn-failed', 2500);
      }
      return ok;
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
      catch {
        showLoadError(
          'Couldn\u2019t reach VidShare',
          'Check your internet connection, then try again.',
          loadAccount
        );
        return;
      }
      if (me.status === 401) return redirectToLogin();
      if (!me.ok) {
        showLoadError(
          'Couldn\u2019t load your account',
          'Something went wrong on our end. Please try again in a moment.',
          loadAccount
        );
        return;
      }
      let meData;
      try { meData = await me.json(); }
      catch {
        showLoadError(
          'Couldn\u2019t load your account',
          'We got an unexpected response from the server. Please try again.',
          loadAccount
        );
        return;
      }
      const paidBadge = meData.is_paid ? '<span class="paid-badge">Paid</span>' : '';
      emailPill.innerHTML = 'Signed in as <strong>' + escapeHtml(meData.email) + '</strong>' + paidBadge;
      window.__isPaidUser = !!meData.is_paid;

      let videosRes, foldersRes;
      try {
        [videosRes, foldersRes] = await Promise.all([
          fetch('/api/my-videos'),
          fetch('/api/my-folders')
        ]);
      } catch {
        showLoadError(
          'Couldn\u2019t load your videos',
          'The connection dropped while loading. Check your internet and try again.',
          loadAccount
        );
        return;
      }
      // Session may have expired between the /me check and this call —
      // bounce the user to login so they can re-authenticate cleanly.
      if (videosRes.status === 401 || foldersRes.status === 401) {
        return redirectToLogin({ expired: true });
      }
      if (!videosRes.ok) {
        const info = await Feedback.readApiError(videosRes, 'Something went wrong on our end. Please try again in a moment.');
        showLoadError('Couldn\u2019t load your videos', info.message, loadAccount);
        return;
      }
      let videos;
      try { ({ videos } = await videosRes.json()); }
      catch {
        showLoadError(
          'Couldn\u2019t load your videos',
          'We got an unexpected response from the server. Please try again.',
          loadAccount
        );
        return;
      }
      videos = Array.isArray(videos) ? videos : [];
      let folders = [];
      if (foldersRes.ok) {
        try {
          const data = await foldersRes.json();
          folders = Array.isArray(data.folders) ? data.folders : [];
        } catch (_) { folders = []; }
      }
      renderAccount(videos, folders);
      checkEmbedStatus(videos);
      backfillThumbnails(videos);
    }

    function renderAccount(videos, folders) {
      const parts = [];
      if (folders && folders.length) {
        parts.push(
          '<section class="account-section" aria-labelledby="foldersHeading">' +
            '<h2 class="section-heading" id="foldersHeading">Folders</h2>' +
            '<div class="folder-list">' + folders.map(renderFolderCard).join('') + '</div>' +
          '</section>'
        );
      }
      parts.push(
        '<section class="account-section" aria-labelledby="videosHeading">' +
          (folders && folders.length ? '<h2 class="section-heading" id="videosHeading">Videos</h2>' : '') +
          '<div id="videosSection"></div>' +
        '</section>'
      );
      content.innerHTML = parts.join('');
      const videosSection = document.getElementById('videosSection') || content;
      renderVideos(videos, videosSection);
      attachFolderHandlers();
    }

    function renderFolderCard(f) {
      const count = f.video_count || 0;
      const url = '/f/' + encodeURIComponent(f.slug);
      return (
        '<div class="folder-card" data-slug="' + escapeHtml(f.slug) + '">' +
          '<div class="folder-main">' +
            '<div class="folder-title">' + escapeHtml(f.title || 'Folder') + '</div>' +
            '<div class="folder-meta">' +
              count + ' video' + (count === 1 ? '' : 's') +
              (f.created_at ? ' · ' + formatDate(f.created_at) : '') +
            '</div>' +
          '</div>' +
          '<div class="folder-actions">' +
            '<a class="vc-btn" href="' + escapeHtml(url) + '">Open</a>' +
            '<button type="button" class="vc-btn copy-folder-btn">Copy link</button>' +
          '</div>' +
        '</div>'
      );
    }

    function attachFolderHandlers() {
      content.querySelectorAll('.copy-folder-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const card = btn.closest('.folder-card');
          if (!card) return;
          const url = window.location.origin + '/f/' + encodeURIComponent(card.dataset.slug);
          await copyWithButtonFeedback(btn, url);
        });
      });
    }

    function renderVideos(videos, mountEl) {
      const mount = mountEl || content;
      // Reset and repopulate the lookup whenever the list re-renders.
      for (const k of Object.keys(videosById)) delete videosById[k];
      videos.forEach(v => { videosById[v.id] = v; });

      if (!videos.length) {
        headerSub.textContent = 'You haven\u2019t uploaded any videos yet.';
        mount.innerHTML = `
          <div class="empty">
            <div class="empty-title">No videos yet</div>
            <div class="empty-sub">Upload your first video to get a shareable link.</div>
            <a href="/upload" class="upload-cta empty-upload-cta">+ Upload a video</a>
          </div>`;
        return;
      }
      headerSub.textContent = `${videos.length} video${videos.length === 1 ? '' : 's'}`;
      mount.innerHTML = '<div class="video-list">' + videos.map(renderCard).join('') + '</div>';
      attachCardHandlers();
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
      // Native uploads can replace their stored frame — put a compact edit
      // control on the thumb instead of a full-size action-row button.
      const editOverlay = canChangeThumbnail(v)
        ? '<button type="button" class="vc-thumb-edit thumb-btn" aria-label="Change thumbnail" title="Change thumbnail">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3 2.1 2.1 0 0 1 0 3L7 19l-4 1 1-4 12.5-12.5z"/>' +
            '</svg>' +
          '</button>'
        : '';
      return `<div class="vc-thumb">${inner}${editOverlay}</div>`;
    }

    // Native uploads are the only ones whose thumbnail lives in our DB
    // and can be replaced via /api/my-videos/:id/thumbnail. External
    // platforms (YouTube/Vimeo) serve their own art so we hide the control.
    function canChangeThumbnail(v) {
      return platformInfo(v).key === 'upload';
    }

    function renderCard(v) {
      const watchUrl = `/watch?id=${encodeURIComponent(v.id)}`;
      const exp = formatExpiry(v.expires_at);
      const info = platformInfo(v);
      const badge = `<span class="source-badge ${info.key}">${info.label}</span>`;
      return `
        <div class="video-card" data-id="${escapeHtml(v.id)}">
          ${renderThumb(v)}
          <div class="vc-main">
            <div class="vc-badge-row">${badge}</div>
            <div class="vc-title"><a class="vc-title-text" href="${watchUrl}" target="_blank" rel="noopener">${escapeHtml(v.title || 'Untitled')}</a></div>
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
            <button class="vc-btn danger delete-btn">Delete</button>
          </div>
        </div>`;
    }

    function attachCardHandlers() {
      document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const url = window.location.origin + btn.dataset.url;
          await copyWithButtonFeedback(btn, url);
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
          clearCardError(card);
          btn.disabled = true; btn.textContent = 'Deleting…';
          let res;
          try { res = await fetch(`/api/my-videos/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
          catch {
            btn.disabled = false; btn.textContent = 'Delete';
            showCardError(card, 'Couldn\u2019t delete — ' + Feedback.NETWORK_MESSAGE);
            return;
          }
          if (res.status === 401) return redirectToLogin({ expired: true });
          if (!res.ok) {
            btn.disabled = false; btn.textContent = 'Delete';
            const info = await Feedback.readApiError(res, 'Something went wrong on our end. Please try again.');
            showCardError(card, 'Couldn\u2019t delete this video. ' + info.message);
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
      if (!newTitle) {
        setEditError('Please enter a title — it can\u2019t be blank.');
        editTitleInput.setAttribute('aria-invalid', 'true');
        editTitleInput.focus();
        return;
      }
      editTitleInput.removeAttribute('aria-invalid');

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
        setEditError('Your changes weren\u2019t saved. ' + Feedback.NETWORK_MESSAGE);
        return;
      }
      if (res.status === 401) { closeEditDialog(); return redirectToLogin({ expired: true }); }
      if (!res.ok) {
        const info = await Feedback.readApiError(res, 'Something went wrong on our end. Please try again.');
        setEditError('Your changes weren\u2019t saved. ' + info.message);
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
        const titleText = card.querySelector('.vc-title-text') || card.querySelector('.vc-title');
        if (titleText) titleText.textContent = v.title || 'Untitled';

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
    // The dialog itself lives in js/thumbnail-picker.js (shared with the
    // show-page editors); this only wires the account-specific save path.
    function openThumbnailDialog(videoId) {
      const v = videosById[videoId];
      if (!v || !window.ThumbnailPicker) return;
      const ThumbnailPicker = window.ThumbnailPicker;

      ThumbnailPicker.open({
        // Same-origin /api/video/:id does not send CORS headers; the picker
        // leaves crossOrigin unset so the canvas capture is not tainted.
        source: v.has_password ? null : { videoUrl: `/api/video/${encodeURIComponent(videoId)}` },
        cacheKey: videoId,
        framesUnavailableMessage: 'Password-protected \u2014 upload an image instead',
        onSave: async (selection) => {
          const payload = { data: selection.base64, contentType: selection.contentType };
          let res;
          try {
            res = await fetch(`/api/my-videos/${encodeURIComponent(videoId)}/thumbnail`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } catch (_) {
            throw new Error('The thumbnail wasn\u2019t saved. ' + Feedback.NETWORK_MESSAGE);
          }
          if (res.status === 401) {
            ThumbnailPicker.close();
            redirectToLogin({ expired: true });
            return;
          }
          if (!res.ok) {
            const info = await Feedback.readApiError(res, 'Something went wrong on our end. Please try again.');
            throw new Error('The thumbnail wasn\u2019t saved. ' + (res.status === 413
              ? 'That image is over the 500 KB limit \u2014 try a smaller one.'
              : info.message));
          }
          const out = await res.json().catch(() => ({}));
          const version = out.version || Date.now();
          ThumbnailPicker.invalidateCache(videoId);

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
          if (v) v.has_thumbnail = true;
          showToast('Thumbnail updated');
        }
      });
    }

    // Tiny CSS.escape polyfill for older browsers; only used to look up a
    // card by data-id, which is always a known-safe video id.
    function cssEscape(s) {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
      return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
    }

    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (_) {
        logoutBtn.disabled = false;
        Feedback.flashButton(logoutBtn, 'Couldn\u2019t sign out — try again', 'btn-failed', 3000);
        return;
      }
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
