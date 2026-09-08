const STANDALONE_PAGES = Object.freeze({
  oz: '/oz',
  disc: '/disc',
  vertical: '/vertical',
  seussical: '/seussical'
});

function pagePublicPath(page) {
  return STANDALONE_PAGES[page] || `/show/${page}`;
}

function pageSetupUrl(page, setupToken, origin = process.env.PUBLIC_ORIGIN || process.env.ALLOWED_ORIGIN || '') {
  let configuredOrigin = String(origin || '').replace(/\/$/, '');
  if (configuredOrigin === '*') configuredOrigin = '';
  const setupPath = `${pagePublicPath(page)}?setup=${encodeURIComponent(setupToken)}`;
  return configuredOrigin ? `${configuredOrigin}${setupPath}` : setupPath;
}

module.exports = { STANDALONE_PAGES, pagePublicPath, pageSetupUrl };
