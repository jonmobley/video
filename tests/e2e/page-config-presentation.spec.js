const { test, expect } = require('@playwright/test');

const DEFAULT_PRESENTATION = {
  template_key: 'gallery',
  empty_state_enabled: true,
  force_empty_state: false,
  empty_state_label: 'Video coming soon',
  empty_state_placeholder_count: 1,
  empty_state_fallback_image_url: '/assets/og-image.png',
  background_image_url: null,
  background_position: 'center center',
  background_opacity: 0,
  background_blur: 0,
  mobile_background_opacity: 0,
  footer_theme: 'dark',
  category_all_label: 'All Songs',
  tag_all_label: 'All',
  choreography_by_song: {}
};

function pageConfig(slug, presentation) {
  return {
    page: slug,
    page_title: 'Browser presentation test',
    accent_color: '#008f67',
    coming_soon_image_url: null,
    presentation: {
      ...DEFAULT_PRESENTATION,
      ...presentation
    }
  };
}

async function mockPresentationApis(page, config, videos = []) {
  let currentConfig = config;
  let savedPresentation = null;

  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith('/get-page-config')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(currentConfig)
      });
      return;
    }

    if (pathname.endsWith('/get-categories')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([])
      });
      return;
    }

    if (pathname.endsWith('/get-videos')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(videos)
      });
      return;
    }

    if (pathname.endsWith('/verify-page-editor')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ authorized: true })
      });
      return;
    }

    if (pathname.endsWith('/save-page-config')) {
      const body = request.postDataJSON();
      savedPresentation = body.presentation;
      currentConfig = {
        ...currentConfig,
        ...body,
        presentation: body.presentation
      };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(currentConfig)
      });
      return;
    }

    await route.continue();
  });

  // The real Wistia SDK is not part of these rendering regressions.
  await page.route('https://fast.wistia.com/**', route => route.abort());
  await page.route('https://fast.wistia.net/**', route => route.abort());

  return {
    getSavedPresentation: () => savedPresentation
  };
}

test.describe('shared page presentation template', () => {
  test('saves hostile presentation labels and renders them as plain text', async ({ page }) => {
    const slug = 'browser-labels-test';
    const hostileLabels = {
      empty: '<img src=x onerror=alert(1)> Coming Soon',
      category: '<b>All songs</b>',
      tag: '<svg onload=alert(1)>All groups</svg>'
    };
    const mock = await mockPresentationApis(page, pageConfig(slug, {
      empty_state_label: 'Video coming soon',
      category_all_label: 'All Songs',
      tag_all_label: 'All'
    }));

    await page.goto(`/show/${slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#videoGrid .coming-soon-placeholder-thumbnail-label'))
      .toHaveText('Video coming soon');

    await page.locator('#loginLink').click();
    await page.locator('#loginPassword').fill('browser-test-editor-token');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#adminPageSettingsBtn')).toBeVisible();

    await page.locator('#adminPageSettingsBtn').click();
    await page.locator('#pageEmptyStateLabel').fill(hostileLabels.empty);
    await page.locator('#pageCategoryAllLabel').fill(hostileLabels.category);
    await page.locator('#pageTagAllLabel').fill(hostileLabels.tag);
    await page.locator('#pageSettingsSave').click();

    await expect(page.locator('#pageSettingsStatus')).toHaveText('Page settings saved.');
    expect(mock.getSavedPresentation()).toMatchObject({
      empty_state_label: hostileLabels.empty,
      category_all_label: hostileLabels.category,
      tag_all_label: hostileLabels.tag
    });

    await expect(page.locator('#videoGrid .coming-soon-placeholder-thumbnail-label'))
      .toHaveText(hostileLabels.empty);
    await expect(page.locator('#categoryDropdown option').first())
      .toHaveText(hostileLabels.category);
    await expect(page.locator('#tagFilters [data-tag="all"]'))
      .toHaveText(hostileLabels.tag);
    await expect(page.locator('#wistia-player .coming-soon-player-card'))
      .toHaveAttribute('aria-label', hostileLabels.empty);

    expect(await page.locator('#videoGrid img[onerror]').count()).toBe(0);
    expect(await page.locator('#videoGrid .coming-soon-placeholder-thumbnail-label b').count()).toBe(0);
    expect(await page.locator('#tagFilters svg').count()).toBe(0);
  });

  test('force-empty mode hides real videos and renders configured placeholders', async ({ page }) => {
    const slug = 'browser-force-empty-test';
    const placeholderLabel = 'This show is coming soon';
    await mockPresentationApis(page, pageConfig(slug, {
      force_empty_state: true,
      empty_state_label: placeholderLabel,
      empty_state_placeholder_count: 3,
      choreography_by_song: {
        'Opening Song': ['All Cast']
      }
    }), [{
      wistiaId: 'real-video-id',
      title: 'Real video that must stay hidden',
      category: 'opening-song',
      tags: ['all']
    }]);

    await page.goto(`/show/${slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#videoGrid .coming-soon-placeholder-thumbnail'))
      .toHaveCount(3);
    await expect(page.locator('#videoGrid .coming-soon-placeholder-thumbnail-label'))
      .toHaveCount(3);
    await expect(page.locator('#videoGrid .coming-soon-placeholder-thumbnail-label').first())
      .toHaveText(placeholderLabel);

    await expect(page.locator('#videoGrid .video-item')).toHaveCount(0);
    await expect(page.locator('#videoGrid [data-wistia="real-video-id"]')).toHaveCount(0);
    await expect(page.locator('#wistia-player .coming-soon-player-card')).toBeVisible();
    await expect(page.locator('#wistia-player [data-coming-soon-image]')).toHaveCount(1);
  });
});