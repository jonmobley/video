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
      canonical_url: 'https://vidsharepro.netlify.app/seussical.html'
    }
  };

  return defaults[page] || {
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
  buildPageConfigWrite
};