/* Folder page (/f/:slug) — fetches /api/folders/:slug, renders the gallery,
 * exposes per-video and bulk download, plus owner-only rename/delete and
 * remove-video controls. Pure DOM API, no framework. */

(function () {
  const main = document.getElementById('main');
  const toast = document.getElementById('toast');

  function showToast(msg, isError) {
    toast.textContent = msg;
    toast.classList.toggle('error', !!isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function getSlug() {
    const m = window.location.pathname.match(/^\/f\/([a-f0-9]{8,32})\/?$/i);
    return m ? m[1].toLowerCase() : null;
  }

  function thumbUrlFor(v) {
    if (v.has_thumbnail) return `/api/video-thumbnail/${encodeURIComponent(v.id)}`;
    if (v.platform === 'youtube' && v.embed_video_id) {
      return `https://img.youtube.com/vi/${encodeURIComponent(v.embed_video_id)}/hqdefault.jpg`;
    }
    if (v.platform === 'vimeo' && v.embed_video_id) {
      return `https://vumbnail.com/${encodeURIComponent(v.embed_video_id)}.jpg`;
    }
    return null;
  }

  function formatBytes(b) {
    b = parseInt(b, 10) || 0;
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function renderError(title, sub) {
    main.innerHTML =
      `<div class="error-state">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(sub || '')}</p>
       </div>`;
  }

  function renderFolder(data) {
    document.title = (data.title || 'Folder') + ' – VidShare';

    const videoCount = data.videos.length;
    const totalBytes = data.videos.reduce((s, v) => s + (parseInt(v.file_size, 10) || 0), 0);
    const downloadableCount = data.videos.filter(v =>
      v.platform === 'upload' && !v.has_password && (!v.expires_at || new Date(v.expires_at) > new Date())
    ).length;

    const headerHtml =
      `<div class="folder-header">
        <div class="folder-header-text">
          <h1 class="folder-title" id="folderTitle">${escapeHtml(data.title)}</h1>
          <div class="folder-meta">
            ${videoCount} video${videoCount === 1 ? '' : 's'}
            ${totalBytes > 0 ? ' · ' + formatBytes(totalBytes) : ''}
          </div>
        </div>
        <div class="folder-actions">
          ${downloadableCount > 0 ? `<button type="button" class="btn btn-primary" id="dlAllBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download all (zip)
          </button>` : ''}
          <button type="button" class="btn btn-secondary" id="copyLinkBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/>
              <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>
            </svg>
            Copy link
          </button>
          ${data.isOwner ? `<button type="button" class="btn btn-secondary" id="renameBtn">Rename</button>
          <button type="button" class="btn btn-danger" id="deleteBtn">Delete</button>` : ''}
        </div>
      </div>`;

    const gridHtml = videoCount === 0
      ? `<div class="empty-state"><h1>No videos yet</h1><p>This folder is empty.</p></div>`
      : `<div class="video-grid">${data.videos.map(v => renderCard(v, data.isOwner)).join('')}</div>`;

    main.innerHTML = headerHtml + gridHtml;

    wireUp(data);
  }

  function renderCard(v, isOwner) {
    const watchUrl = `/watch?id=${encodeURIComponent(v.id)}`;
    const thumb = thumbUrlFor(v);
    const isDownloadable = v.platform === 'upload' && !v.has_password;

    const badges = [];
    if (v.has_password) badges.push(`<span class="badge lock" title="Password protected">🔒</span>`);
    if (v.platform && v.platform !== 'upload') {
      badges.push(`<span class="badge">${escapeHtml(v.platform)}</span>`);
    }

    return `<div class="video-card" data-video-id="${escapeHtml(v.id)}">
      <a href="${watchUrl}" class="video-thumb" aria-label="Watch ${escapeHtml(v.title || 'video')}">
        ${thumb
          ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy">`
          : `<div class="placeholder">▶</div>`}
        <div class="play-overlay">
          <div class="play-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
        ${badges.length ? `<div class="badges">${badges.join('')}</div>` : ''}
      </a>
      <div class="video-body">
        <div class="video-card-title">${escapeHtml(v.title || 'Untitled')}</div>
        <div class="video-card-meta">
          ${v.file_size ? formatBytes(v.file_size) : ''}
          ${v.view_count ? ` · ${v.view_count} view${v.view_count === 1 ? '' : 's'}` : ''}
        </div>
        <div class="video-card-actions">
          <a href="${watchUrl}" class="btn btn-secondary">Watch</a>
          ${isDownloadable ? `<a href="/api/video/${encodeURIComponent(v.id)}/download" class="btn btn-secondary" download>Download</a>` : ''}
          ${isOwner ? `<button type="button" class="btn btn-danger" data-action="remove" data-id="${escapeHtml(v.id)}">Remove</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  function wireUp(data) {
    const slug = data.slug;

    const dlAllBtn = document.getElementById('dlAllBtn');
    if (dlAllBtn) {
      dlAllBtn.addEventListener('click', async () => {
        // HEAD probe so we can show server-side errors (e.g. 413 too large)
        // before kicking off a multi-GB download in a new tab.
        dlAllBtn.disabled = true;
        const orig = dlAllBtn.innerHTML;
        dlAllBtn.innerHTML = 'Preparing…';
        try {
          const url = `/api/folders/${encodeURIComponent(slug)}/download`;
          const probe = await fetch(url, { method: 'HEAD' });
          if (!probe.ok) {
            const ctrl = new AbortController();
            const r = await fetch(url, { signal: ctrl.signal }).catch(() => null);
            if (r && !r.ok) {
              try {
                const j = await r.json();
                showToast((j.error && j.error.message) || 'Download failed', true);
              } catch {
                showToast('Download failed (' + probe.status + ')', true);
              }
              ctrl.abort();
              return;
            }
            ctrl.abort();
            showToast('Download failed (' + probe.status + ')', true);
            return;
          }
          const a = document.createElement('a');
          a.href = url;
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (err) {
          showToast('Download failed', true);
        } finally {
          dlAllBtn.disabled = false;
          dlAllBtn.innerHTML = orig;
        }
      });
    }

    const copyBtn = document.getElementById('copyLinkBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          showToast('Link copied');
        } catch {
          showToast('Could not copy link', true);
        }
      });
    }

    const renameBtn = document.getElementById('renameBtn');
    if (renameBtn) {
      renameBtn.addEventListener('click', () => openRenameDialog(data));
    }

    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => openDeleteDialog(data));
    }

    main.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-action="remove"]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      if (!confirm('Remove this video from the folder? The video itself will not be deleted.')) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/folders/${encodeURIComponent(slug)}/videos/${encodeURIComponent(id)}`, {
          method: 'DELETE', credentials: 'same-origin'
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j.error && j.error.message) || 'Remove failed');
        }
        const card = btn.closest('.video-card');
        if (card) card.remove();
        showToast('Removed');
      } catch (err) {
        btn.disabled = false;
        showToast(err.message, true);
      }
    });
  }

  function openRenameDialog(data) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay visible';
    overlay.innerHTML = `<div class="dialog">
      <h2>Rename folder</h2>
      <input type="text" id="renameInput" maxlength="120" value="${escapeHtml(data.title)}">
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" id="renameCancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="renameSave">Save</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#renameInput');
    input.focus(); input.select();
    overlay.querySelector('#renameCancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#renameSave').addEventListener('click', async () => {
      const title = input.value.trim();
      if (!title) return;
      try {
        const res = await fetch(`/api/folders/${encodeURIComponent(data.slug)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j.error && j.error.message) || 'Rename failed');
        }
        overlay.remove();
        document.getElementById('folderTitle').textContent = title;
        document.title = title + ' – VidShare';
        showToast('Renamed');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  function openDeleteDialog(data) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay visible';
    overlay.innerHTML = `<div class="dialog">
      <h2>Delete folder?</h2>
      <p>This will delete the folder page only. The videos themselves stay in your account.</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" id="dCancel">Cancel</button>
        <button type="button" class="btn btn-danger" id="dConfirm">Delete</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#dCancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#dConfirm').addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/folders/${encodeURIComponent(data.slug)}`, {
          method: 'DELETE', credentials: 'same-origin'
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j.error && j.error.message) || 'Delete failed');
        }
        window.location.href = '/account';
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  async function init() {
    const slug = getSlug();
    if (!slug) return renderError('Invalid folder link', 'Check the URL and try again.');

    try {
      const res = await fetch(`/api/folders/${encodeURIComponent(slug)}`, { credentials: 'same-origin' });
      if (res.status === 404) return renderError('Folder not found', 'It may have been deleted.');
      if (!res.ok) return renderError('Could not load folder', 'Please refresh and try again.');
      const data = await res.json();
      renderFolder(data);
    } catch (err) {
      renderError('Could not load folder', 'Check your connection and refresh.');
    }
  }

  init();
})();
