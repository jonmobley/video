const fs = require('fs');
const path = require('path');
const {
  PRODUCTION_ORIGIN,
  PRODUCTION_HOST,
  WWW_HOST,
  apexRedirectLocation
} = require('../../lib/site-origin');

describe('production origin', () => {
  test('apex and www are vidshare.co', () => {
    expect(PRODUCTION_ORIGIN).toBe('https://vidshare.co');
    expect(PRODUCTION_HOST).toBe('vidshare.co');
    expect(WWW_HOST).toBe('www.vidshare.co');
  });

  test('www requests redirect to the apex host and keep path and query', () => {
    expect(apexRedirectLocation('https://www.vidshare.co/oz?edit=1')).toBe(
      'https://vidshare.co/oz?edit=1'
    );
    expect(apexRedirectLocation('https://vidshare.co/health')).toBeNull();
  });

  test('wrangler binds the Worker as the origin for vidshare.co', () => {
    const text = fs.readFileSync(path.join(__dirname, '../../wrangler.jsonc'), 'utf8');
    expect(text).toMatch(/"pattern": "vidshare\.co"/);
    expect(text).toMatch(/"pattern": "www\.vidshare\.co"/);
    expect(text).toMatch(/"custom_domain": true/);
    expect(text).toMatch(/"PUBLIC_ORIGIN": "https:\/\/vidshare\.co"/);
    expect(text).toMatch(/"ALLOWED_ORIGIN": "https:\/\/vidshare\.co"/);
  });
});
