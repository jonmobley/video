var PLATFORM_CONFIG = {
  youtube:     { label: 'YouTube',      color: '#ff0000' },
  vimeo:       { label: 'Vimeo',        color: '#1ab7ea' },
  dailymotion: { label: 'Dailymotion',  color: '#0d0d6e' },
  loom:        { label: 'Loom',         color: '#625df5' },
  wistia:      { label: 'Wistia',       color: '#54bbff' },
  dropbox:     { label: 'Dropbox',      color: 'rgba(0,143,103,0.9)' },
  upload:      { label: 'Upload',       color: 'rgba(78,205,196,0.9)' },
};

function platformInfo(v) {
  var p = (v.platform || 'upload').toLowerCase();
  var cfg = PLATFORM_CONFIG[p] || PLATFORM_CONFIG.upload;
  return { key: PLATFORM_CONFIG[p] ? p : 'upload', label: cfg.label };
}

function injectPlatformBadgeStyles(badgeClass) {
  var css = Object.entries(PLATFORM_CONFIG)
    .map(function(entry) {
      return '.' + badgeClass + '.' + entry[0] + ' { background: ' + entry[1].color + '; }';
    })
    .join('\n');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

function sourceBadge(platform, badgeClass) {
  var info = platformInfo({ platform: platform });
  return '<span class="' + badgeClass + ' ' + info.key + '">' + info.label + '</span>';
}
