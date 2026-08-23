const GENERIC_PRESENTATION = Object.freeze({
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

const SEUSSICAL_CHOREOGRAPHY = Object.freeze({
  'Oh, the Thinks You Can Think!': ['All Cast'],
  'Finale / Oh, the Thinks You Can Think!': ['All Cast'],
  'Horton Hears a Who': ['Jungle People'],
  'Biggest Blame Fool': ['Jungle People'],
  'Here on Who': ['Whos'],
  'Amayzing Mayzie': ['Mayzie', 'Bird Girls'],
  'Amayzing Gertrude': ['Gertrude', 'Bird Girls'],
  'Chasing the Whos': ['All Cast'],
  'Monkey Around': ['Wickershams', 'Jungle People'],
  'How Lucky You Are': ['Cat'],
  'The Military': ['General Schmitz', 'Cadets', 'JoJo', 'Cat'],
  "It's Possible": ['Fish'],
  'Egg, Nest and Tree': ['Jungle People'],
  "Havin' a Hunch": ['Cat', 'JoJo', 'Hunches']
});

function getGenericPresentation() {
  return {
    ...GENERIC_PRESENTATION,
    choreography_by_song: {}
  };
}

function getDefaultPageConfig(page) {
  const defaults = {
    oz: {
      page: 'oz',
      accent_color: '#008f67',
      page_title: 'Oz',
      meta_description: 'Oz - Video Collection',
      meta_keywords: 'oz, videos, collection',
      og_title: 'Oz',
      og_description: 'Oz - Video Collection',
      og_image_url: '/assets/og-image.png',
      coming_soon_image_url: null,
      twitter_title: null,
      twitter_description: null,
      canonical_url: 'https://vidsharepro.netlify.app/oz.html'
    },
    disc: {
      page: 'disc',
      accent_color: '#008f67',
      page_title: 'Disc',
      meta_description: 'Disc - Video Collection',
      meta_keywords: 'disc, videos, collection',
      og_title: 'Disc',
      og_description: 'Disc - Video Collection',
      og_image_url: '/assets/og-image.png',
      coming_soon_image_url: null,
      twitter_title: null,
      twitter_description: null,
      canonical_url: 'https://vidsharepro.netlify.app/disc.html'
    },
    seussical: {
      page: 'seussical',
      accent_color: '#008f67',
      page_title: 'Seussical',
      meta_description: 'Seussical dance videos from Grace Church.',
      meta_keywords: 'Seussical, dance videos, choreography, performance',
      og_title: 'Seussical',
      og_description: 'Seussical dance videos from Grace Church.',
      og_image_url: '/assets/og-image.png',
      coming_soon_image_url: null,
      twitter_title: null,
      twitter_description: null,
      canonical_url: 'https://vidsharepro.netlify.app/seussical.html',
      presentation: {
        ...getGenericPresentation(),
        empty_state_enabled: true,
        empty_state_placeholder_count: 4,
        empty_state_fallback_image_url: '/attached_assets/coming-soon_1787511284874.jpg',
        background_image_url: '/attached_assets/Seussical_background_1787511048230.png',
        background_opacity: 0.46,
        background_blur: 1,
        mobile_background_opacity: 0.36,
        footer_theme: 'light',
        category_all_label: 'All Songs',
        choreography_by_song: { ...SEUSSICAL_CHOREOGRAPHY }
      }
    }
  };

  const config = defaults[page] || {
    page,
    accent_color: '#008f67',
    page_title: page.charAt(0).toUpperCase() + page.slice(1),
    meta_description: `${page.charAt(0).toUpperCase() + page.slice(1)} - Video Collection`,
    meta_keywords: `${page}, videos, collection`,
    og_title: page.charAt(0).toUpperCase() + page.slice(1),
    og_description: `${page.charAt(0).toUpperCase() + page.slice(1)} - Video Collection`,
    og_image_url: '/assets/og-image.png',
    coming_soon_image_url: null,
    twitter_title: null,
    twitter_description: null,
    canonical_url: `https://vidsharepro.netlify.app/${page}.html`
  };

  return {
    ...config,
    presentation: config.presentation || getGenericPresentation()
  };
}

function buildPageConfigWrite(page, changes, existingConfig) {
  return {
    ...(existingConfig ? {} : getDefaultPageConfig(page)),
    page,
    ...changes
  };
}

module.exports = {
  getDefaultPageConfig,
  buildPageConfigWrite,
  getGenericPresentation
};