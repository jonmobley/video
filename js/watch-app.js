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

function showVideo(videoUrl, downloadHref) {
  const titleHtml = videoTitle
    ? '<div class="video-title">' + escapeHtml(videoTitle) + '</div>'
    : '';
  // Only uploaded videos can be downloaded — embeds / external platforms cannot.
  const downloadHtml = downloadHref
    ? '<div class="watch-actions">' +
        '<a class="watch-download-btn" href="' + downloadHref + '" download>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
            '<polyline points="7 10 12 15 17 10"/>' +
            '<line x1="12" y1="15" x2="12" y2="3"/>' +
          '</svg>' +
          '<span>Download</span>' +
        '</a>' +
      '</div>'
    : '';
  root.innerHTML =
    '<div class="video-wrap">' +
      '<video id="videoEl" src="' + videoUrl + '" controls autoplay playsinline preload="auto"></video>' +
      titleHtml +
      downloadHtml +
    '</div>';
}

function showEmbed(meta) {
  var platform = meta.platform;
  var embedId = meta.embedVideoId;
  var originalUrl = (window.LinkParser && window.LinkParser.buildOriginalUrl)
    ? window.LinkParser.buildOriginalUrl(platform, embedId)
    : '';
  var platformLabels = { youtube: 'YouTube', vimeo: 'Vimeo', dailymotion: 'Dailymotion', loom: 'Loom', wistia: 'Wistia' };
  var platformLabel = platformLabels[platform] || platform;

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
    '</div>';

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
  // Give slow embeds (and the YouTube click-to-play facade) more time before
  // surfacing the fallback — 10s was too aggressive on mobile networks.
  var loadTimer = setTimeout(showFallback, 20000);

  var mgr = new window.VideoPlatformManager();
  mgr.loadVideo({
    platform: platform,
    embedVideoId: embedId,
    wistiaId: embedId,
    title: meta.title || '',
    durationSeconds: meta.durationSeconds
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
          loadVideo(videoId, data.accessToken || null);
        }
      } else {
        pwError.textContent = 'Incorrect password. Try again.';
        pwError.classList.add('visible');
        pwSubmit.disabled = false; pwSubmit.textContent = 'Watch Video';
        pwInput.value = ''; pwInput.focus();
      }
    } catch (_) {
      pwError.textContent = 'Network error. Check your connection and try again.';
      pwError.classList.add('visible');
      pwSubmit.disabled = false; pwSubmit.textContent = 'Watch Video';
    }
  }

  pwSubmit.addEventListener('click', submit);
  pwInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') submit(); });
  setTimeout(function() { pwInput.focus(); }, 100);
}

function buildVideoUrl(videoId, accessToken) {
  var url = '/api/video/' + encodeURIComponent(videoId);
  if (accessToken) url += '?t=' + encodeURIComponent(accessToken);
  return url;
}

function buildDownloadUrl(videoId, accessToken) {
  var url = '/api/video/' + encodeURIComponent(videoId) + '/download';
  if (accessToken) url += '?t=' + encodeURIComponent(accessToken);
  return url;
}

async function loadVideo(videoId, accessToken) {
  var videoUrl = buildVideoUrl(videoId, accessToken);
  try {
    var probe = await fetch(videoUrl, { method: 'HEAD' });
    if (probe.status === 403) { showPasswordPrompt(videoId); return; }
    if (probe.status === 410) { showError('This video has expired and is no longer available.', true); return; }
    if (!probe.ok) { showError('This video could not be found.', true); return; }
  } catch (_) {}
  // Only uploaded files have a backing blob to download — external embeds don't.
  var canDownload = !videoMeta || !videoMeta.platform || videoMeta.platform === 'upload';
  showVideo(videoUrl, canDownload ? buildDownloadUrl(videoId, accessToken) : null);
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
