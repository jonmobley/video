const root  = document.getElementById('root');
const toast = document.getElementById('toast');
let videoTitle = '';

let videoMeta = null;

function showToast(msg) {
  toast.textContent = msg; toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function showLoading() {
  root.innerHTML = '<div class="state-overlay" role="status"><div class="spinner" aria-hidden="true"></div><div class="state-title">Loading\u2026</div></div>';
}

function showError(msg, showUploadLink) {
  root.innerHTML =
    '<div class="state-overlay" role="alert">' +
      '<div aria-hidden="true"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>' +
      '<div class="state-title">Can\'t play this video</div>' +
      '<div class="state-sub">' + msg + '</div>' +
      (showUploadLink ? '<a href="/upload" class="upload-link">Upload a video</a>' : '') +
    '</div>';
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showVideo(videoUrl) {
  const titleHtml = videoTitle
    ? '<div class="video-title">' + escapeHtml(videoTitle) + '</div>'
    : '';
  root.innerHTML =
    '<div class="video-wrap">' +
      '<video id="videoEl" src="' + videoUrl + '" controls autoplay playsinline preload="auto"></video>' +
      titleHtml +
      renderQrSection() +
    '</div>';
  attachQrHandlers();
}

function renderQrSection() {
  return '<div class="qr-section" id="qrSection">' +
    '<button type="button" class="qr-toggle" id="qrToggle" aria-expanded="false">' +
      '<svg class="qr-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="3" y="3" width="7" height="7"/>' +
        '<rect x="14" y="3" width="7" height="7"/>' +
        '<rect x="3" y="14" width="7" height="7"/>' +
        '<path d="M14 14h3v3h-3zM20 14h1v1M14 20h3v1M20 17h1v4"/>' +
      '</svg>' +
      '<span id="qrToggleLabel">Show QR code</span>' +
      '<svg class="qr-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polyline points="6 9 12 15 18 9"/>' +
      '</svg>' +
    '</button>' +
    '<div class="qr-panel" id="qrPanel" hidden>' +
      '<img id="qrImg" src="" alt="QR code for this video" width="160" height="160">' +
      '<button type="button" class="qr-download-btn" id="qrDownloadBtn">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
          '<polyline points="7 10 12 15 17 10"/>' +
          '<line x1="12" y1="15" x2="12" y2="3"/>' +
        '</svg>' +
        '<span>Download QR code</span>' +
      '</button>' +
    '</div>' +
  '</div>';
}

function slugifyForFilename(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function attachQrHandlers() {
  var section = document.getElementById('qrSection');
  var toggle = document.getElementById('qrToggle');
  var label = document.getElementById('qrToggleLabel');
  var panel = document.getElementById('qrPanel');
  var img = document.getElementById('qrImg');
  var dlBtn = document.getElementById('qrDownloadBtn');
  if (!section || !toggle || !panel || !img || !dlBtn) return;

  var watchUrl = window.location.href;
  var qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&color=ffffff&bgcolor=1c1c1e&data=' + encodeURIComponent(watchUrl);

  toggle.addEventListener('click', function() {
    var isOpen = !panel.hidden;
    if (isOpen) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      label.textContent = 'Show QR code';
      section.classList.remove('open');
    } else {
      if (!img.src) img.src = qrSrc;
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      label.textContent = 'Hide QR code';
      section.classList.add('open');
    }
  });

  dlBtn.addEventListener('click', async function() {
    var params = new URLSearchParams(window.location.search);
    var videoId = params.get('id') || '';
    var baseName = slugifyForFilename(videoTitle) || (videoId ? videoId.split('.')[0] : 'video');
    var filename = 'vidshare-qr-' + baseName + '.png';
    var src = img.src || qrSrc;
    try {
      var res = await fetch(src, { mode: 'cors' });
      if (!res.ok) throw new Error('Fetch failed');
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    } catch (_) {
      var a = document.createElement('a');
      a.href = src; a.download = filename; a.target = '_blank';
      document.body.appendChild(a); a.click(); a.remove();
    }
  });
}

function showEmbed(meta) {
  var platform = meta.platform;
  var embedId = meta.embedVideoId;
  var originalUrl = (window.LinkParser && window.LinkParser.buildOriginalUrl)
    ? window.LinkParser.buildOriginalUrl(platform, embedId)
    : '';
  var platformLabels = { youtube: 'YouTube', vimeo: 'Vimeo', dailymotion: 'Dailymotion', loom: 'Loom', wistia: 'Wistia' };
  var platformLabel = platformLabels[platform] || platform;
  var noteText = 'Note: this watch page\u2019s password and expiration only protect this page. Anyone who already has the original ' + platformLabel + ' URL can still view it there.';

  var titleHtml = videoTitle
    ? '<div class="video-title">' + escapeHtml(videoTitle) + '</div>'
    : '';
  root.innerHTML =
    '<div class="video-wrap">' +
      '<div class="embed-frame" id="embedFrame">' +
        '<div class="embed-host" id="embedHost"></div>' +
        '<div class="embed-fallback embed-fallback-hidden" id="embedFallback" role="alert" aria-live="assertive">' +
          '<div class="ef-icon" aria-hidden="true">\u26A0\uFE0F</div>' +
          '<div class="ef-title">This embed isn\'t available</div>' +
          '<div class="ef-sub">The video may be private, removed, or have embedding disabled by the owner.</div>' +
          (originalUrl ? '<a href="' + originalUrl + '" target="_blank" rel="noopener noreferrer">Open on ' + platformLabel + ' \u2197</a>' : '') +
        '</div>' +
      '</div>' +
      titleHtml +
      '<div class="gating-note">' + noteText + '</div>' +
      renderQrSection() +
    '</div>';
  attachQrHandlers();

  var host = document.getElementById('embedHost');
  var fallback = document.getElementById('embedFallback');

  if (meta.embedAvailable === false) {
    fallback.style.display = 'flex';
    return;
  }

  var fallbackShown = false;
  var showFallback = function() {
    if (fallbackShown) return;
    fallbackShown = true;
    fallback.style.display = 'flex';
  };
  var loadTimer = setTimeout(showFallback, 10000);

  var mgr = new window.VideoPlatformManager();
  mgr.loadVideo({
    platform: platform,
    embedVideoId: embedId,
    wistiaId: embedId,
    title: meta.title || ''
  }, host,
    function() { clearTimeout(loadTimer); },
    function() { clearTimeout(loadTimer); showFallback(); }
  );
}

function showPasswordPrompt(videoId) {
  root.innerHTML =
    '<div class="pw-card">' +
      '<div class="pw-icon" aria-hidden="true">\uD83D\uDD12</div>' +
      '<div class="pw-title">Password required</div>' +
      '<label for="pwInput" class="pw-sub pw-sub-block">This video is password protected.</label>' +
      '<input class="pw-input" id="pwInput" type="password" placeholder="Enter password" autocomplete="off" aria-describedby="pwError">' +
      '<button class="pw-btn" id="pwSubmit">Watch Video</button>' +
      '<div class="pw-error" id="pwError" role="alert" aria-live="assertive">Incorrect password. Try again.</div>' +
    '</div>';

  var pwInput  = document.getElementById('pwInput');
  var pwSubmit = document.getElementById('pwSubmit');
  var pwError  = document.getElementById('pwError');

  async function submit() {
    var pw = pwInput.value;
    if (!pw) return;
    pwSubmit.disabled = true; pwSubmit.textContent = 'Checking\u2026';
    try {
      var res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: videoId, password: pw })
      });
      var data = await res.json();
      if (data.valid) {
        if (videoMeta && ['youtube','vimeo','dailymotion','loom','wistia'].includes(videoMeta.platform)) {
          showEmbed(videoMeta);
        } else {
          loadVideo(videoId, pw);
        }
      } else {
        pwError.classList.add('visible');
        pwSubmit.disabled = false; pwSubmit.textContent = 'Watch Video';
        pwInput.value = ''; pwInput.focus();
      }
    } catch (_) {
      pwSubmit.disabled = false; pwSubmit.textContent = 'Watch Video';
    }
  }

  pwSubmit.addEventListener('click', submit);
  pwInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') submit(); });
  setTimeout(function() { pwInput.focus(); }, 100);
}

function buildVideoUrl(videoId, password) {
  var url = '/api/video/' + encodeURIComponent(videoId);
  if (password) url += '?pt=' + encodeURIComponent(password);
  return url;
}

async function loadVideo(videoId, password) {
  var videoUrl = buildVideoUrl(videoId, password);
  try {
    var probe = await fetch(videoUrl, { method: 'HEAD' });
    if (probe.status === 403) { showPasswordPrompt(videoId); return; }
    if (probe.status === 410) { showError('This video has expired and is no longer available.', true); return; }
    if (!probe.ok) { showError('This video could not be found.', true); return; }
  } catch (_) {}
  showVideo(videoUrl);
}

async function init() {
  var params = new URLSearchParams(window.location.search);
  var videoId = params.get('id');
  if (!videoId) { showError('No video ID provided.', true); return; }

  showLoading();

  try {
    var metaRes = await fetch('/api/video-meta/' + encodeURIComponent(videoId));

    if (metaRes.status === 410) {
      showError('This video has expired and is no longer available.', true);
      return;
    }
    if (metaRes.status === 404) {
      showError('This video could not be found. It may have been deleted.', true);
      return;
    }

    if (metaRes.ok) {
      videoMeta = await metaRes.json();
      if (videoMeta.title) {
        videoTitle = videoMeta.title;
        document.title = videoMeta.title + ' \u2013 VidShare';
      }
      if (videoMeta.hasPassword) {
        showPasswordPrompt(videoId);
        return;
      }
      if (['youtube','vimeo','dailymotion','loom','wistia'].includes(videoMeta.platform)) {
        showEmbed(videoMeta);
        return;
      }
    }
  } catch (_) {}

  await loadVideo(videoId, null);
}

init();

document.getElementById('footerUploadBtn').addEventListener('click', function() {
  window.openUploadModal();
});
