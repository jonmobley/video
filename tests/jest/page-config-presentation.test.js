jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));

const { getDefaultPageConfig } = require('../../lib/page-config-defaults');
const { mergePageConfig } = require('../../handlers/get-page-config');
const { validatePresentation } = require('../../handlers/save-page-config');

describe('page configuration presentation backend support', () => {
  test('merges a partial stored presentation over page defaults', () => {
    const config = mergePageConfig({
      page: 'seussical',
      presentation: { footer_theme: 'dark', force_empty_state: true }
    });

    expect(config.presentation).toMatchObject({
      template_key: 'gallery',
      empty_state_enabled: true,
      force_empty_state: true,
      footer_theme: 'dark',
      category_all_label: 'All Songs'
    });
    expect(Object.keys(config.presentation.choreography_by_song)).toHaveLength(14);
  });

  test('accepts supported presentation settings and rejects unsafe choreography', () => {
    expect(validatePresentation(getDefaultPageConfig('seussical').presentation)).toBeNull();
    expect(validatePresentation({
      choreography_by_song: { Song: ['Cast', ' cast '] }
    })).toEqual(expect.objectContaining({ code: 'BAD_PRESENTATION' }));
    expect(validatePresentation({ unexpected: true }))
      .toEqual(expect.objectContaining({ code: 'BAD_PRESENTATION' }));
  });
});