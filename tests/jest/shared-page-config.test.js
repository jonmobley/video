const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

function loadSharedConfig() {
  const dom = new JSDOM('<h1 id="pageTitle">Default title</h1>');
  const context = {
    document: dom.window.document,
    console: { error: jest.fn(), log: jest.fn() },
    applyAccentColor: jest.fn()
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../js/shared-page-config.js'), 'utf8'),
    context
  );

  return context;
}

describe('shared page configuration', () => {
  test('passes custom Coming Soon artwork to the page callback', async () => {
    const context = loadSharedConfig();
    const onComingSoonImageLoaded = jest.fn();

    await context.loadPageConfig('seussical', {
      fetchFn: async () => ({
        accent_color: '#123456',
        page_title: 'Seussical',
        coming_soon_image_url: '/api/coming-soon-image/seussical'
      }),
      onComingSoonImageLoaded
    });

    expect(context.applyAccentColor).toHaveBeenCalledWith('#123456');
    expect(context.document.getElementById('pageTitle').textContent).toBe('Seussical');
    expect(onComingSoonImageLoaded).toHaveBeenCalledWith('/api/coming-soon-image/seussical');
  });

  test('uses the page fallback when configuration cannot be loaded', async () => {
    const context = loadSharedConfig();
    const onComingSoonImageLoaded = jest.fn();
    const onTitleMissing = jest.fn();

    await context.loadPageConfig('seussical', {
      fetchFn: async () => {
        throw new Error('network unavailable');
      },
      defaultAccentColor: '#008f67',
      onTitleMissing,
      onComingSoonImageLoaded
    });

    expect(context.applyAccentColor).toHaveBeenCalledWith('#008f67');
    expect(onTitleMissing).toHaveBeenCalledTimes(1);
    expect(onComingSoonImageLoaded).toHaveBeenCalledWith(null);
  });
});