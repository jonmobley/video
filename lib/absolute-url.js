function configuredPublicOrigin() {
  return String(process.env.PUBLIC_ORIGIN || '').replace(/\/$/, '');
}

function requestOrigin(req) {
  if (!req) return '';
  const host = typeof req.get === 'function' ? req.get('host') : req.headers && req.headers.host;
  if (!host) return '';
  const proto = req.protocol || 'http';
  return `${proto}://${host}`;
}

function publicOrigin(req) {
  return configuredPublicOrigin() || requestOrigin(req);
}

function absoluteUrl(pathOrUrl, origin) {
  if (pathOrUrl == null || pathOrUrl === '') return pathOrUrl;
  const value = String(pathOrUrl);
  if (/^https?:\/\//i.test(value) || !origin) return value;
  if (value.startsWith('/')) return `${origin}${value}`;
  return `${origin}/${value}`;
}

function absolutizeHtmlMeta(html, origin) {
  if (!origin) return html;
  return String(html)
    .replace(
      /((?:property|name)="(?:og:url|og:image|twitter:url|twitter:image)"\s+content=")(\/[^"]*)(")/g,
      `$1${origin}$2$3`
    )
    .replace(/(rel="canonical"\s+href=")(\/[^"]*)(")/g, `$1${origin}$2$3`);
}

module.exports = {
  configuredPublicOrigin,
  publicOrigin,
  absoluteUrl,
  absolutizeHtmlMeta
};
