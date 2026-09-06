    let adminToken = sessionStorage.getItem('vs_admin_token') || '';

    const loginScreen    = document.getElementById('loginScreen');
    const dashboard      = document.getElementById('dashboard');
    const tokenInput     = document.getElementById('tokenInput');
    const loginBtn       = document.getElementById('loginBtn');
    const loginError     = document.getElementById('loginError');
    const loginNotice    = document.getElementById('loginNotice');
    const logoutBtn      = document.getElementById('logoutBtn');
    const statsRow       = document.getElementById('statsRow');
    const videoList      = document.getElementById('videoList');
    const refreshBtn     = document.getElementById('refreshBtn');
    const userList       = document.getElementById('userList');
    const refreshUsersBtn = document.getElementById('refreshUsersBtn');
    const userSearchInput = document.getElementById('userSearchInput');
    const userTierFilter  = document.getElementById('userTierFilter');
    const userFilterBar   = document.getElementById('userFilterBar');
    const userCountEl     = document.getElementById('userCount');
    const videoPagination = document.getElementById('videoPagination');
    const userPagination  = document.getElementById('userPagination');
    const videoSearchInput = document.getElementById('videoSearchInput');
    const videoStatusFilter = document.getElementById('videoStatusFilter');
    const videoPlatformFilter = document.getElementById('videoPlatformFilter');
    const videoFilterBar  = document.getElementById('videoFilterBar');
    const videoCountEl    = document.getElementById('videoCount');
    const videoFilterStatus = document.getElementById('videoFilterStatus');
    const userFilterStatus  = document.getElementById('userFilterStatus');
    const clearVideoFiltersBtn = document.getElementById('clearVideoFilters');
    const videoFilterCountEl   = document.getElementById('videoFilterCount');
    const tabBtns        = document.querySelectorAll('.tab-btn');
    const tabPanels      = document.querySelectorAll('.tab-panel');
    const createShowBtn = document.getElementById('createShowBtn');
    const createShowModal = document.getElementById('createShowModal');
    const createShowForm = document.getElementById('createShowForm');
    const createShowError = document.getElementById('createShowError');
    const createShowResult = document.getElementById('createShowResult');
    const createShowLink = document.getElementById('createShowLink');

    let usersLoaded = false;
    const PAGE_SIZE = 50;
    let videoOffset = 0;
    let userOffset = 0;
    let userSearchDebounce = null;
    const pendingTierToggles = new Set();
    const pendingDeletes = new Set();
    let videoSearchDebounce = null;
    let videoSearchState = '';
    let videoStatusState = 'all';
    let videoPlatformState = 'all';
    let userSearchState = '';
    let userTierState = 'all';
    let activeTab = 'videos';
    let videosAbortController = null;
    let usersAbortController = null;

    const VALID_STATUSES = ['all', 'active', 'expired', 'password'];
    const VALID_PLATFORMS = ['all', 'upload', 'youtube', 'vimeo'];
    const VALID_TIERS = ['all', 'paid', 'free'];
    const VALID_TABS = ['videos', 'users'];

    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    let isPopstateNav = false;

    function buildFilterUrl() {
      const params = new URLSearchParams();
      if (activeTab !== 'videos') params.set('tab', activeTab);
      const trimmed = videoSearchState.trim();
      if (trimmed) params.set('search', trimmed);
      if (videoStatusState && videoStatusState !== 'all') params.set('status', videoStatusState);
      if (videoPlatformState && videoPlatformState !== 'all') params.set('platform', videoPlatformState);
      if (videoOffset > 0) params.set('page', Math.floor(videoOffset / PAGE_SIZE) + 1);
      const userTrimmed = userSearchState.trim();
      if (userTrimmed) params.set('usearch', userTrimmed);
      if (userTierState && userTierState !== 'all') params.set('tier', userTierState);
      if (userOffset > 0) params.set('upage', Math.floor(userOffset / PAGE_SIZE) + 1);
      const qs = params.toString();
      return window.location.pathname + (qs ? '?' + qs : '');
    }

    function syncFiltersToUrl() {
      const newUrl = buildFilterUrl();
      if (isPopstateNav) {
        isPopstateNav = false;
        return;
      }
      if (newUrl !== window.location.pathname + window.location.search) {
        history.pushState(null, '', newUrl);
      }
    }

    function readFiltersFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab') || 'videos';
      activeTab = VALID_TABS.includes(tab) ? tab : 'videos';
      videoSearchState = (params.get('search') || '').trim();
      const status = params.get('status') || 'all';
      videoStatusState = VALID_STATUSES.includes(status) ? status : 'all';
      const platform = params.get('platform') || 'all';
      videoPlatformState = VALID_PLATFORMS.includes(platform) ? platform : 'all';
      const page = parseInt(params.get('page'), 10);
      videoOffset = (page > 1 && !isNaN(page)) ? (page - 1) * PAGE_SIZE : 0;
      videoSearchInput.value = videoSearchState;
      videoStatusFilter.value = videoStatusState;
      videoPlatformFilter.value = videoPlatformState;
      userSearchState = (params.get('usearch') || '').trim();
      const tier = params.get('tier') || 'all';
      userTierState = VALID_TIERS.includes(tier) ? tier : 'all';
      const upage = parseInt(params.get('upage'), 10);
      userOffset = (upage > 1 && !isNaN(upage)) ? (upage - 1) * PAGE_SIZE : 0;
      userSearchInput.value = userSearchState;
      userTierFilter.value = userTierState;
    }

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        tabPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        panel.classList.add('active');
        activeTab = btn.dataset.tab;
        syncFiltersToUrl();
        if (btn.dataset.tab === 'users' && !usersLoaded) loadUsers();
        if (btn.dataset.tab === 'videos') {
          videoSearchInput.value = videoSearchState;
          videoStatusFilter.value = videoStatusState;
          videoPlatformFilter.value = videoPlatformState;
        }
        if (btn.dataset.tab === 'users') {
          userSearchInput.value = userSearchState;
          userTierFilter.value = userTierState;
        }
      });
    });

    function formatBytes(b) {
      if (!b) return '—';
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
      return (b / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatDate(dt) {
      if (!dt) return '—';
      return new Date(dt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function adminSourceBadge(platform) {
      return sourceBadge(platform, 'source-badge');
    }

    function expiryBadge(expiresAt, ownerIsPaid) {
      if (!expiresAt) {
        if (ownerIsPaid) return '<span class="badge badge-no-expiry">∞ No expiry</span>';
        return '<span class="badge badge-ok">No expiry</span>';
      }
      const diff = new Date(expiresAt) - Date.now();
      if (diff <= 0) return '<span class="badge badge-exp">Expired</span>';
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      if (days <= 1) return `<span class="badge badge-exp">Expires today</span>`;
      return `<span class="badge badge-ok">Expires in ${days}d</span>`;
    }

    function renderPagination(container, total, limit, offset, onPageChange) {
      container.innerHTML = '';
      const totalPages = Math.ceil(total / limit);
      if (totalPages <= 1) return;

      const currentPage = Math.floor(offset / limit) + 1;

      const prevBtn = document.createElement('button');
      prevBtn.className = 'page-btn';
      prevBtn.textContent = '‹ Prev';
      prevBtn.disabled = currentPage <= 1;
      prevBtn.addEventListener('click', () => onPageChange((currentPage - 2) * limit));
      container.appendChild(prevBtn);

      const maxVisible = 7;
      let startPage = 1;
      let endPage = totalPages;
      if (totalPages > maxVisible) {
        const half = Math.floor(maxVisible / 2);
        startPage = Math.max(1, currentPage - half);
        endPage = startPage + maxVisible - 1;
        if (endPage > totalPages) {
          endPage = totalPages;
          startPage = Math.max(1, endPage - maxVisible + 1);
        }
      }

      if (startPage > 1) {
        const first = document.createElement('button');
        first.className = 'page-btn';
        first.textContent = '1';
        first.addEventListener('click', () => onPageChange(0));
        container.appendChild(first);
        if (startPage > 2) {
          const dots = document.createElement('span');
          dots.className = 'page-info';
          dots.textContent = '…';
          container.appendChild(dots);
        }
      }

      for (let p = startPage; p <= endPage; p++) {
        const btn = document.createElement('button');
        btn.className = 'page-btn' + (p === currentPage ? ' page-btn-active' : '');
        btn.textContent = p;
        if (p !== currentPage) {
          btn.addEventListener('click', () => onPageChange((p - 1) * limit));
        }
        container.appendChild(btn);
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          const dots = document.createElement('span');
          dots.className = 'page-info';
          dots.textContent = '…';
          container.appendChild(dots);
        }
        const last = document.createElement('button');
        last.className = 'page-btn';
        last.textContent = totalPages;
        last.addEventListener('click', () => onPageChange((totalPages - 1) * limit));
        container.appendChild(last);
      }

      const nextBtn = document.createElement('button');
      nextBtn.className = 'page-btn';
      nextBtn.textContent = 'Next ›';
      nextBtn.disabled = currentPage >= totalPages;
      nextBtn.addEventListener('click', () => onPageChange(currentPage * limit));
      container.appendChild(nextBtn);

      const info = document.createElement('span');
      info.className = 'page-info';
      const from = offset + 1;
      const to = Math.min(offset + limit, total);
      info.textContent = from + '–' + to + ' of ' + total;
      container.appendChild(info);
    }

    function updateVideoFilterIndicator() {
      let count = 0;
      if (videoSearchState.trim()) count++;
      if (videoStatusState !== 'all') count++;
      if (videoPlatformState !== 'all') count++;
      videoFilterCountEl.textContent = count;
      clearVideoFiltersBtn.classList.toggle('visible', count > 0);
    }

    function generateVideoSkeletons(count) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += '<div class="skeleton-row"><div class="skeleton-main"><div class="skeleton-line skeleton-title"></div><div class="skeleton-line skeleton-meta"></div></div><div class="skeleton-actions"><div class="skeleton-btn"></div><div class="skeleton-btn"></div></div></div>';
      }
      return html;
    }

    function generateUserSkeletons(count) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += '<div class="skeleton-row"><div class="skeleton-main"><div class="skeleton-line skeleton-title"></div><div class="skeleton-line skeleton-meta"></div></div><div class="skeleton-toggle"></div></div>';
      }
      return html;
    }

    async function loadVideos() {
      syncFiltersToUrl();
      if (videosAbortController) videosAbortController.abort();
      videosAbortController = new AbortController();
      const signal = videosAbortController.signal;

      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Loading…';
      videoSearchInput.disabled = true;
      videoStatusFilter.disabled = true;
      videoFilterBar.classList.add('loading');
      videoPlatformFilter.disabled = true;
      videoFilterBar.setAttribute('aria-busy', 'true');
      videoFilterStatus.textContent = 'Loading videos…';
      clearVideoFiltersBtn.disabled = true;
      videoList.innerHTML = generateVideoSkeletons(5);
      videoCountEl.style.display = 'none';
      statsRow.innerHTML = `
        <div class="stat-card shimmer"><div class="stat-val">&nbsp;</div><div class="stat-label">&nbsp;</div></div>
        <div class="stat-card shimmer"><div class="stat-val">&nbsp;</div><div class="stat-label">&nbsp;</div></div>
        <div class="stat-card shimmer"><div class="stat-val">&nbsp;</div><div class="stat-label">&nbsp;</div></div>
        <div class="stat-card shimmer"><div class="stat-val">&nbsp;</div><div class="stat-label">&nbsp;</div></div>
      `;
      videoPagination.innerHTML = '';

      try {
        const params = new URLSearchParams({ limit: PAGE_SIZE, offset: videoOffset });
        const searchVal = videoSearchState.trim();
        const statusVal = videoStatusState;
        const platformVal = videoPlatformState;
        if (searchVal) params.set('search', searchVal);
        if (statusVal && statusVal !== 'all') params.set('status', statusVal);
        if (platformVal && platformVal !== 'all') params.set('platform', platformVal);

        const res = await fetch('/api/admin/videos?' + params, {
          headers: { 'Authorization': 'Bearer ' + adminToken },
          signal
        });

        if (res.status === 401 || res.status === 403) {
          logout({ expired: true });
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = (data && data.error && (data.error.message || data.error)) || 'Failed to load videos';
          videoList.innerHTML = `<div class="empty-state"><div>${typeof msg === 'string' ? msg : 'Failed to load videos'}</div></div>`;
          videoFilterStatus.textContent = 'Loading failed';
          statsRow.innerHTML = '';
          return;
        }

        const data = await res.json();
        const videos = data.videos || [];
        const total = data.total || 0;

        const maxOffset = Math.max(0, (Math.ceil(total / PAGE_SIZE) - 1) * PAGE_SIZE);
        if (videoOffset > maxOffset) {
          videoOffset = maxOffset;
          await loadVideos();
          return;
        }

        statsRow.innerHTML = `
          <div class="stat-card"><div class="stat-val">${data.total_unfiltered || total}</div><div class="stat-label">Total videos</div></div>
          <div class="stat-card"><div class="stat-val">${formatBytes(data.total_size)}</div><div class="stat-label">Storage used</div></div>
          <div class="stat-card"><div class="stat-val">${(data.total_views || 0).toLocaleString()}</div><div class="stat-label">Total views</div></div>
          <div class="stat-card"><div class="stat-val">${data.expired_count || 0}</div><div class="stat-label">Expired</div></div>
        `;

        videoFilterBar.style.display = 'flex';
        videoFilterBar.classList.remove('loading');
        videoFilterBar.setAttribute('aria-busy', 'false');
        videoFilterStatus.textContent = 'Loading complete';
        updateVideoFilterIndicator();

        if (searchVal || statusVal !== 'all' || platformVal !== 'all') {
          videoCountEl.textContent = total + ' video' + (total === 1 ? '' : 's') + ' found';
          videoCountEl.style.display = 'block';
        }

        if (!videos.length && total === 0 && !searchVal && statusVal === 'all' && platformVal === 'all') {
          videoList.innerHTML = `<div class="empty-state"><div class="empty-icon">🎬</div><div>No videos uploaded yet.</div></div>`;
          videoFilterBar.style.display = 'none';
          return;
        }

        if (!videos.length) {
          videoList.innerHTML = '<div class="empty-state"><div>No videos match your filters.</div></div>';
          return;
        }

        videoList.innerHTML = '';
        for (const v of videos) {
          const row = document.createElement('div');
          row.className = 'video-row';
          row.innerHTML = `
            <div class="video-main">
              <div class="video-title ${v.title ? '' : 'untitled'}"><span class="video-title-text">${escapeHtml(v.title || 'Untitled')}</span>${adminSourceBadge(v.platform)}</div>
              <div class="video-meta">
                <span>${formatDate(v.uploaded_at)}</span>
                <span>${formatBytes(v.file_size)}</span>
                <span>${v.view_count || 0} view${v.view_count === 1 ? '' : 's'}</span>
                ${v.has_password ? '<span class="badge badge-pw">🔒 Password</span>' : ''}
                ${expiryBadge(v.expires_at, v.owner_is_paid)}
              </div>
            </div>
            <div class="video-actions">
              <a class="watch-lnk" href="/watch?id=${encodeURIComponent(v.id)}" target="_blank">Watch</a>
              <button class="del-btn" data-id="${v.id}"${pendingDeletes.has(v.id) ? ' disabled' : ''}>${pendingDeletes.has(v.id) ? '…' : 'Delete'}</button>
            </div>
          `;
          row.querySelector('.del-btn').addEventListener('click', async function() {
            if (this.disabled) return;
            if (!confirm('Delete this video? This cannot be undone.')) return;
            this.disabled = true; this.textContent = '…';
            pendingDeletes.add(v.id);
            try {
              const dr = await fetch('/api/admin/video/' + encodeURIComponent(v.id), {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + adminToken }
              });
              if (dr.status === 401 || dr.status === 403) { pendingDeletes.delete(v.id); logout({ expired: true }); return; }
              if (dr.ok) { pendingDeletes.delete(v.id); loadVideos(); return; }
              else {
                pendingDeletes.delete(v.id);
                this.disabled = false; this.textContent = 'Delete';
                const data = await dr.json().catch(() => ({}));
                const msg = (data && data.error && (data.error.message || data.error)) || 'Delete failed.';
                alert(typeof msg === 'string' ? msg : 'Delete failed.');
              }
            } catch { pendingDeletes.delete(v.id); this.disabled = false; this.textContent = 'Delete'; }
          });
          videoList.appendChild(row);
        }

        renderPagination(videoPagination, total, PAGE_SIZE, videoOffset, function(newOffset) {
          videoOffset = newOffset;
          loadVideos();
        });
      } catch (err) {
        if (err.name === 'AbortError') return;
          videoList.innerHTML = `<div class="empty-state"><div>Failed to load videos: ${escapeHtml(err.message)}</div></div>`;
        videoFilterStatus.textContent = 'Loading failed';
        statsRow.innerHTML = '';
      } finally {
        if (!signal.aborted) {
          refreshBtn.disabled = false;
          refreshBtn.textContent = '↻ Refresh';
          videoSearchInput.disabled = false;
          videoStatusFilter.disabled = false;
          videoPlatformFilter.disabled = false;
          clearVideoFiltersBtn.disabled = false;
        }
        videoFilterBar.classList.remove('loading');
        videoFilterBar.setAttribute('aria-busy', 'false');
      }
    }

    async function loadUsers() {
      syncFiltersToUrl();
      if (usersAbortController) usersAbortController.abort();
      usersAbortController = new AbortController();
      const signal = usersAbortController.signal;

      refreshUsersBtn.disabled = true;
      refreshUsersBtn.textContent = 'Loading…';
      userSearchInput.disabled = true;
      userTierFilter.disabled = true;
      userFilterBar.classList.add('loading');
      userFilterBar.setAttribute('aria-busy', 'true');
      userFilterStatus.textContent = 'Loading users…';
      userList.innerHTML = generateUserSkeletons(5);
      userPagination.innerHTML = '';
      userCountEl.style.display = 'none';
      try {
        const params = new URLSearchParams({ limit: PAGE_SIZE, offset: userOffset });
        const searchVal = userSearchState.trim();
        const tierVal = userTierState;
        if (searchVal) params.set('search', searchVal);
        if (tierVal && tierVal !== 'all') params.set('tier', tierVal);

        const res = await fetch('/api/admin/users?' + params, {
          headers: { 'Authorization': 'Bearer ' + adminToken },
          signal
        });
        if (res.status === 401 || res.status === 403) { logout({ expired: true }); return; }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = (data && data.error && (data.error.message || data.error)) || 'Failed to load users';
          userList.innerHTML = `<div class="empty-state"><div>${typeof msg === 'string' ? msg : 'Failed to load users'}</div></div>`;
          userFilterStatus.textContent = 'Loading failed';
          return;
        }
        const data = await res.json();
        const users = data.users || [];
        const total = data.total || 0;
        usersLoaded = true;

        userFilterBar.style.display = 'flex';
        userFilterBar.classList.remove('loading');
        userFilterBar.setAttribute('aria-busy', 'false');
        userFilterStatus.textContent = 'Loading complete';

        if (searchVal || tierVal !== 'all') {
          userCountEl.textContent = total + ' user' + (total === 1 ? '' : 's') + ' found';
          userCountEl.style.display = 'block';
        }

        if (!users.length && total === 0 && !searchVal && tierVal === 'all') {
          userList.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><div>No registered users yet.</div></div>`;
          return;
        }

        if (!users.length) {
          userList.innerHTML = '<div class="empty-state"><div>No users match your filters.</div></div>';
          return;
        }

        const maxOffset = Math.max(0, (Math.ceil(total / PAGE_SIZE) - 1) * PAGE_SIZE);
        if (userOffset > maxOffset) {
          userOffset = maxOffset;
          await loadUsers();
          return;
        }

        userList.innerHTML = '';
        for (const u of users) {
          const row = document.createElement('div');
          row.className = 'user-row';

          const main = document.createElement('div');
          main.className = 'user-main';

          const emailDiv = document.createElement('div');
          emailDiv.className = 'user-email';
          emailDiv.textContent = u.email;
          main.appendChild(emailDiv);

          const meta = document.createElement('div');
          meta.className = 'user-meta';

          const joinSpan = document.createElement('span');
          joinSpan.textContent = 'Joined ' + formatDate(u.created_at);
          meta.appendChild(joinSpan);

          const countSpan = document.createElement('span');
          countSpan.textContent = u.video_count + ' video' + (u.video_count === 1 ? '' : 's');
          meta.appendChild(countSpan);

          const badge = document.createElement('span');
          badge.className = 'badge ' + (u.is_paid ? 'badge-paid' : 'badge-free');
          badge.textContent = u.is_paid ? 'Paid' : 'Free';
          meta.appendChild(badge);

          main.appendChild(meta);
          row.appendChild(main);

          const toggleLabel = document.createElement('label');
          toggleLabel.className = 'tier-toggle';
          if (pendingTierToggles.has(u.id)) toggleLabel.classList.add('loading');

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = u.is_paid;
          checkbox.setAttribute('aria-label', 'Toggle paid status for ' + u.email);
          if (pendingTierToggles.has(u.id)) checkbox.disabled = true;
          toggleLabel.appendChild(checkbox);

          const slider = document.createElement('span');
          slider.className = 'slider';
          toggleLabel.appendChild(slider);

          const label = document.createElement('span');
          label.className = 'tier-label ' + (u.is_paid ? 'tier-label-paid' : 'tier-label-free');
          label.textContent = u.is_paid ? 'Paid' : 'Free';
          toggleLabel.appendChild(label);

          row.appendChild(toggleLabel);

          checkbox.addEventListener('change', async () => {
            const newPaid = checkbox.checked;
            checkbox.disabled = true;
            toggleLabel.classList.add('loading');
            pendingTierToggles.add(u.id);
            try {
              const pr = await fetch('/api/admin/users/' + encodeURIComponent(u.id) + '/tier', {
                method: 'PATCH',
                headers: {
                  'Authorization': 'Bearer ' + adminToken,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_paid: newPaid })
              });
              if (pr.status === 401 || pr.status === 403) { logout({ expired: true }); return; }
              if (!pr.ok) {
                checkbox.checked = !newPaid;
                const data = await pr.json().catch(() => ({}));
                const msg = (data && data.error && (data.error.message || data.error)) || 'Update failed.';
                alert(typeof msg === 'string' ? msg : 'Update failed.');
              } else {
                loadUsers();
                return;
              }
            } catch {
              checkbox.checked = !newPaid;
              alert('Network error. Could not update user tier.');
            } finally {
              pendingTierToggles.delete(u.id);
              toggleLabel.classList.remove('loading');
              checkbox.disabled = false;
            }
          });

          userList.appendChild(row);
        }

        renderPagination(userPagination, total, PAGE_SIZE, userOffset, function(newOffset) {
          userOffset = newOffset;
          loadUsers();
        });
      } catch (err) {
        if (err.name === 'AbortError') return;
        const errDiv = document.createElement('div');
        errDiv.className = 'empty-state';
        const errMsg = document.createElement('div');
        errMsg.textContent = 'Failed to load users: ' + err.message;
        errDiv.appendChild(errMsg);
        userList.innerHTML = '';
        userList.appendChild(errDiv);
        userFilterStatus.textContent = 'Loading failed';
      } finally {
        if (!signal.aborted) {
          refreshUsersBtn.disabled = false;
          refreshUsersBtn.textContent = '↻ Refresh';
          userSearchInput.disabled = false;
          userTierFilter.disabled = false;
        }
        userFilterBar.classList.remove('loading');
        userFilterBar.setAttribute('aria-busy', 'false');
      }
    }

    async function tryLogin() {
      if (loginBtn.disabled) return;
      const token = tokenInput.value.trim();
      if (!token) return;
      loginBtn.disabled = true; loginBtn.textContent = 'Checking…';
      try {
        const res = await fetch('/api/admin/videos', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          adminToken = token;
          sessionStorage.setItem('vs_admin_token', token);
          showDashboard();
        } else {
          loginError.classList.add('visible');
          loginBtn.disabled = false; loginBtn.textContent = 'Sign In';
        }
      } catch {
        loginError.classList.add('visible');
        loginError.textContent = 'Network error. Please try again.';
        loginBtn.disabled = false; loginBtn.textContent = 'Sign In';
      }
    }

    function resetTabs() {
      tabBtns.forEach(b => { b.classList.toggle('active', b.dataset.tab === activeTab); b.setAttribute('aria-selected', b.dataset.tab === activeTab ? 'true' : 'false'); });
      tabPanels.forEach(p => p.classList.toggle('active', p.id === (activeTab === 'users' ? 'usersPanel' : 'videosPanel')));
    }

    function showDashboard() {
      loginScreen.style.display = 'none';
      dashboard.style.display = 'block';
      logoutBtn.style.display = 'inline-block';
      usersLoaded = false;
      pendingDeletes.clear();
      readFiltersFromUrl();
      resetTabs();
      loadVideos();
      if (activeTab === 'users') loadUsers();
    }

    function logout(opts) {
      const expired = opts && opts.expired;
      if (videosAbortController) { videosAbortController.abort(); videosAbortController = null; }
      if (usersAbortController) { usersAbortController.abort(); usersAbortController = null; }
      adminToken = '';
      sessionStorage.removeItem('vs_admin_token');
      loginScreen.style.display = 'flex';
      dashboard.style.display = 'none';
      logoutBtn.style.display = 'none';
      tokenInput.value = '';
      loginError.classList.remove('visible');
      loginNotice.classList.toggle('visible', !!expired);
      loginBtn.disabled = false; loginBtn.textContent = 'Sign In';
      usersLoaded = false;
      videoOffset = 0;
      userOffset = 0;
      pendingDeletes.clear();
      pendingTierToggles.clear();
      userSearchState = '';
      userTierState = 'all';
      userSearchInput.value = '';
      userTierFilter.value = 'all';
      userFilterBar.style.display = 'none';
      userCountEl.style.display = 'none';
      videoSearchState = '';
      videoStatusState = 'all';
      videoPlatformState = 'all';
      videoSearchInput.value = '';
      videoStatusFilter.value = 'all';
      videoPlatformFilter.value = 'all';
      videoFilterBar.style.display = 'none';
      videoCountEl.style.display = 'none';
      activeTab = 'videos';
      history.replaceState(null, '', window.location.pathname);
      resetTabs();
    }

    loginBtn.addEventListener('click', tryLogin);
    tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
    logoutBtn.addEventListener('click', logout);
    createShowBtn.addEventListener('click', () => {
      createShowModal.classList.remove('hidden');
      createShowResult.classList.add('hidden');
      createShowError.classList.remove('visible');
      document.getElementById('newShowTitle').focus();
    });
    document.getElementById('closeCreateShow').addEventListener('click', () => createShowModal.classList.add('hidden'));
    createShowForm.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = document.getElementById('createShowSubmit');
      submit.disabled = true;
      createShowError.classList.remove('visible');
      try {
        const response = await fetch('/api/create-show-page', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: document.getElementById('newShowTitle').value.trim(),
            page: document.getElementById('newShowSlug').value.trim().toLowerCase()
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'Could not create show.');
        createShowLink.value = result.setup_url;
        createShowResult.classList.remove('hidden');
      } catch (error) {
        createShowError.textContent = error.message;
        createShowError.classList.add('visible');
      } finally {
        submit.disabled = false;
      }
    });
    document.getElementById('copyShowLink').addEventListener('click', async () => {
      await navigator.clipboard.writeText(createShowLink.value);
      document.getElementById('copyShowLink').textContent = 'Copied';
    });
    refreshBtn.addEventListener('click', () => {
      if (refreshBtn.disabled) return;
      videoOffset = 0;
      videoSearchState = '';
      videoStatusState = 'all';
      videoPlatformState = 'all';
      videoSearchInput.value = '';
      videoStatusFilter.value = 'all';
      videoPlatformFilter.value = 'all';
      syncFiltersToUrl();
      loadVideos();
    });
    clearVideoFiltersBtn.addEventListener('click', () => {
      videoOffset = 0;
      videoSearchState = '';
      videoStatusState = 'all';
      videoPlatformState = 'all';
      videoSearchInput.value = '';
      videoStatusFilter.value = 'all';
      videoPlatformFilter.value = 'all';
      updateVideoFilterIndicator();
      loadVideos();
    });
    refreshUsersBtn.addEventListener('click', () => {
      if (refreshUsersBtn.disabled) return;
      usersLoaded = false;
      userOffset = 0;
      userSearchState = '';
      userTierState = 'all';
      userSearchInput.value = '';
      userTierFilter.value = 'all';
      loadUsers();
    });
    userSearchInput.addEventListener('input', () => {
      userSearchState = userSearchInput.value;
      clearTimeout(userSearchDebounce);
      userSearchDebounce = setTimeout(() => { userOffset = 0; loadUsers(); }, 300);
    });
    userTierFilter.addEventListener('change', () => {
      userTierState = userTierFilter.value;
      userOffset = 0;
      loadUsers();
    });
    videoSearchInput.addEventListener('input', () => {
      videoSearchState = videoSearchInput.value;
      updateVideoFilterIndicator();
      clearTimeout(videoSearchDebounce);
      videoSearchDebounce = setTimeout(() => { videoOffset = 0; loadVideos(); }, 300);
    });
    videoStatusFilter.addEventListener('change', () => {
      videoStatusState = videoStatusFilter.value;
      updateVideoFilterIndicator();
      videoOffset = 0;
      loadVideos();
    });
    videoPlatformFilter.addEventListener('change', () => {
      videoPlatformState = videoPlatformFilter.value;
      updateVideoFilterIndicator();
      videoOffset = 0;
      loadVideos();
    });

    window.addEventListener('popstate', () => {
      if (!adminToken) return;
      isPopstateNav = true;
      readFiltersFromUrl();
      updateVideoFilterIndicator();
      loadVideos();
    });

    if (adminToken) showDashboard();
    else loginScreen.style.display = 'flex';
