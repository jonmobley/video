const { pagePublicPath, pageSetupUrl } = require('../../lib/page-public-path');

describe('page public paths', () => {
  const previousOrigin = process.env.PUBLIC_ORIGIN;

  afterEach(() => {
    if (previousOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = previousOrigin;
  });

  test('uses dedicated routes for standalone productions', () => {
    expect(pagePublicPath('seussical')).toBe('/seussical');
    expect(pagePublicPath('oz')).toBe('/oz');
    expect(pagePublicPath('new-show')).toBe('/show/new-show');
  });

  test('builds an absolute Seussical setup URL', () => {
    process.env.PUBLIC_ORIGIN = 'https://vidshare.link';
    expect(pageSetupUrl('seussical', 'once+token')).toBe(
      'https://vidshare.link/seussical?setup=once%2Btoken'
    );
  });
});
