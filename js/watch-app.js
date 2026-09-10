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

/**
 * Full-stage error state. `opts.retry` adds a "Try again" button that calls
 * the given function; `opts.title` overrides the default heading.
 */
function showError(msg, showUploadLink, opts) {
  var options = opts || {};
  root.innerHTML =
    '<div class="state-overlay" role="alert">' +
      '<div aria-hidden="true"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>' +
      '<div class="state-title">' + escapeHtml(options.title || 'Can\'t play this video') + '</div>' +
      '<div class="state-sub">' + escapeHtml(msg) + '</div>' +
      (typeof options.retry === 'function' ? '<button type="button" class="state-retry-btn" id="stateRetry">Try again</button>' : '') +
      (showUploadLink ? '<a href="/upload" class="upload-link">Upload a video</a>' : '') +
    '</div>';
  var retryBtn = document.getElementById('stateRetry');
  if (retryBtn) retryBtn.addEventListener('click', options.retry);
}

function describeError(err, fallback) {
  return window.VsFeedback ? window.VsFeedback.describeError(err, fallback) : fallback;
}

function escapeHtml(str) {
  return String(str === null || str === undefined ? '' : str).replace(/[&<>"']/g, c => ({
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
      '<div class="video-error" id="videoError" role="alert" hidden></div>' +
      titleHtml +
      downloadHtml +
    '</div>';
  wirePlaybackErrors(document.getElementById('videoEl'), document.getElementById('videoError'));
}

/** Plain-English copy for a MediaError code from the <video> element. */
function describePlaybackError(mediaError) {
  var code = mediaError && mediaError.code;
  if (code === 2) return 'Playback stopped because the connection dropped. Check your internet and try again.';
  if (code === 3) return 'This video file appears to be damaged and can\u2019t be played.';
  if (code === 4) return 'This browser can\u2019t play this video format. Try downloading it or using a different browser.';
  return 'The video couldn\u2019t be played. Please try again.';
}

/** Show an inline message under the player when the browser fails to play the file. */
function wirePlaybackErrors(videoEl, errorEl) {
  if (!videoEl || !errorEl) return;
  videoEl.addEventListener('error', function () {
    var canRetry = !videoEl.error || videoEl.error.code === 2 || videoEl.error.code === 1;
    errorEl.textContent = describePlaybackError(videoEl.error);
    if (canRetry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'video-error-retry';
      btn.textContent = 'Try again';
      btn.addEventListener('click', function () {
        errorEl.hidden = true;
        videoEl.load();
        videoEl.play().catch(function () { /* autoplay may be blocked; controls remain */ });
      });
      errorEl.appendChild(document.createTextNode(' '));
      errorEl.appendChild(btn);
    }
    errorEl.hidden = false;
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

  function showPwError(msg, clearInput) {
    pwError.textContent = msg;
    pwError.classList.add('visible');
    pwInput.setAttribute('aria-invalid', 'true');
    pwSubmit.disabled = false; pwSubmit.textContent = 'Watch Video';
    if (clearInput) pwInput.value = '';
    pwInput.focus();
  }

  async function submit() {
    var pw = pwInput.value;
    if (!pw) {
      showPwError('Enter the password to watch this video.');
      return;
    }
    pwSubmit.disabled = true; pwSubmit.textContent = 'Checking\u2026';
    pwError.classList.remove('visible');
    pwInput.removeAttribute('aria-invalid');
    try {
      var res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: videoId, password: pw })
      });
      if (!res.ok) {
        // 429 rate limit, 404 (video removed), 5xx — the server's message is
        // already written for end users; fall back to a status-based one.
        var info = window.VsFeedback
          ? await window.VsFeedback.readApiError(res, 'We couldn\u2019t check that password right now. Please try again.')
          : { message: 'We couldn\u2019t check that password right now. Please try again.' };
        showPwError(info.message);
        return;
      }
      var data = await res.json();
      if (data.valid) {
        if (videoMeta && ['youtube','vimeo','dailymotion','loom','wistia'].includes(videoMeta.platform)) {
          showEmbed(videoMeta);
        } else {
          loadVideo(videoId, data.accessToken || null);
        }
      } else {
        showPwError('That password isn\u2019t right. Check for typos and try again.', true);
      }
    } catch (err) {
      showPwError(describeError(err, 'We couldn\u2019t check that password right now. Please try again.'));
    }
  }

  pwInput.addEventListener('input', function () {
    pwInput.removeAttribute('aria-invalid');
    pwError.classList.remove('visible');
  });
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
    if (probe.status === 404) { showError('This video could not be found. It may have been deleted.', true); return; }
    if (probe.status >= 500) {
      showError('Something went wrong on our end while loading this video. Please try again in a moment.', false,
        { retry: function () { showLoading(); loadVideo(videoId, accessToken); } });
      return;
    }
    if (!probe.ok) { showError('This video could not be loaded.', true); return; }
  } catch (err) {
    if (window.VsFeedback && window.VsFeedback.isNetworkError(err)) {
      showError(window.VsFeedback.NETWORK_MESSAGE, false,
        { title: 'You appear to be offline', retry: function () { showLoading(); loadVideo(videoId, accessToken); } });
      return;
    }
    // Any other probe failure: let the <video> element try; its error
    // handler will explain if playback fails.
  }
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
    } else if (metaRes.status >= 500) {
      showError('Something went wrong on our end while loading this video. Please try again in a moment.', false,
        { retry: init });
      return;
    }
  } catch (err) {
    if (window.VsFeedback && window.VsFeedback.isNetworkError(err)) {
      showError(window.VsFeedback.NETWORK_MESSAGE, false, { title: 'You appear to be offline', retry: init });
      return;
    }
    // Metadata is optional for uploaded files; fall through and try the
    // video itself, whose own error handling will explain any failure.
  }

  await loadVideo(videoId, null);
}

init();
