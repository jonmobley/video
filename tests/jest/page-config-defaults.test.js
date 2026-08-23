const { getDefaultPageConfig, buildPageConfigWrite } = require('../../lib/page-config-defaults');

describe('page configuration defaults', () => {
  test('provides a complete Seussical config when creating its first setting', () => {
    const result = buildPageConfigWrite('seussical', {
      coming_soon_image_url: '/.netlify/blobs/page-images/coming-soon-seussical.png'
    }, null);

    expect(result).toMatchObject({
      page: 'seussical',
      accent_color: '#008f67',
      page_title: 'Seussical',
      coming_soon_image_url: '/.netlify/blobs/page-images/coming-soon-seussical.png'
    });
  });

  test('does not overwrite an existing page config while changing artwork', () => {
    const result = buildPageConfigWrite('seussical', {
      coming_soon_image_url: null
    }, { page: 'seussical' });

    expect(result).toEqual({
      page: 'seussical',
      coming_soon_image_url: null
    });
  });

  test('returns the public fallback config for pages with no database row', () => {
    expect(getDefaultPageConfig('seussical')).toMatchObject({
      page: 'seussical',
      accent_color: '#008f67',
      page_title: 'Seussical',
      coming_soon_image_url: null
    });
  });
});