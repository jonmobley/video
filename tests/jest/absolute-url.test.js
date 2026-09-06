const {
  absoluteUrl,
  absolutizeHtmlMeta,
  publicOrigin
} = require('../../lib/absolute-url');

describe('absoluteUrl', () => {
  test('prefixes relative paths when an origin is provided', () => {
    expect(absoluteUrl('/assets/og-image.png', 'https://videos.example'))
      .toBe('https://videos.example/assets/og-image.png');
    expect(absoluteUrl('https://cdn.example/x.png', 'https://videos.example'))
      .toBe('https://cdn.example/x.png');
    expect(absoluteUrl(null, 'https://videos.example')).toBeNull();
  });

  test('rewrites relative Open Graph tags in HTML', () => {
    const html = '<meta property="og:image" content="/assets/og-image.png">\n<link rel="canonical" href="/oz.html">';
    expect(absolutizeHtmlMeta(html, 'https://videos.example')).toContain(
      'content="https://videos.example/assets/og-image.png"'
    );
    expect(absolutizeHtmlMeta(html, 'https://videos.example')).toContain(
      'href="https://videos.example/oz.html"'
    );
  });

  test('rewrites name= twitter:image tags used on the home page', () => {
    const html = '<meta name="twitter:image" content="/assets/vidshare-og.png">';
    expect(absolutizeHtmlMeta(html, 'https://videos.example')).toContain(
      'content="https://videos.example/assets/vidshare-og.png"'
    );
  });

  test('prefers PUBLIC_ORIGIN over the request host', () => {
    const previous = process.env.PUBLIC_ORIGIN;
    process.env.PUBLIC_ORIGIN = 'https://videos.example/';
    expect(publicOrigin({ protocol: 'http', get: () => 'localhost:5000' }))
      .toBe('https://videos.example');
    if (previous === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = previous;
  });
});
