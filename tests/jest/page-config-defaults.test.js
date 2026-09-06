const { getDefaultPageConfig, buildPageConfigWrite } = require('../../lib/page-config-defaults');

describe('page configuration defaults', () => {
  test('provides a complete Seussical config when creating its first setting', () => {
    const result = buildPageConfigWrite('seussical', {
      coming_soon_image_url: '/api/coming-soon-image/seussical'
    }, null);

    expect(result).toMatchObject({
      page: 'seussical',
      accent_color: '#008f67',
      page_title: 'Seussical',
      coming_soon_image_url: '/api/coming-soon-image/seussical'
    });
    expect(result.presentation).toMatchObject({
      template_key: 'gallery',
      empty_state_enabled: true,
      empty_state_placeholder_count: 4,
      category_all_label: 'All Songs'
    });
    expect(Object.keys(result.presentation.choreography_by_song)).toHaveLength(14);
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

  test('gives unknown pages a safe generic gallery presentation', () => {
    expect(getDefaultPageConfig('new-page').presentation).toEqual({
      template_key: 'gallery',
      empty_state_enabled: false,
      force_empty_state: false,
      empty_state_label: 'Video coming soon',
      empty_state_placeholder_count: 0,
      empty_state_fallback_image_url: '/assets/og-image.png',
      background_image_url: null,
      background_position: 'center center',
      background_opacity: 0,
      background_blur: 0,
      mobile_background_opacity: 0,
      footer_theme: 'dark',
      category_all_label: 'All',
      tag_all_label: 'All',
      choreography_by_song: {}
    });
  });
});