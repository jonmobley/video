const fs = require('fs');
const path = require('path');

const uploadWidget = fs.readFileSync(path.join(__dirname, '../../js/upload-widget.js'), 'utf8');
const uploadPage = fs.readFileSync(path.join(__dirname, '../../js/upload-page.js'), 'utf8');
const uploadModal = fs.readFileSync(path.join(__dirname, '../../js/upload-modal.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const indexHero = fs.readFileSync(path.join(__dirname, '../../js/index-hero.js'), 'utf8');
const accountApp = fs.readFileSync(path.join(__dirname, '../../js/account-app.js'), 'utf8');
const accountHtml = fs.readFileSync(path.join(__dirname, '../../account.html'), 'utf8');
const watchApp = fs.readFileSync(path.join(__dirname, '../../js/watch-app.js'), 'utf8');
const uploadCss = fs.readFileSync(path.join(__dirname, '../../styles/upload.css'), 'utf8');

describe('paste-link autofill + gating UX', () => {
  test('upload widget calls /api/link-preview and autofills title', () => {
    expect(uploadWidget).toMatch(/\/api\/link-preview/);
    expect(uploadWidget).toMatch(/fetchLinkPreview/);
    expect(uploadWidget).toMatch(/titleAutofilled/);
    expect(uploadWidget).toMatch(/data-el="linkPreview"/);
    expect(uploadWidget).toMatch(/data-el="gatingNote"/);
    expect(uploadWidget).toMatch(/data-el="warnMsg"/);
    expect(uploadCss).toMatch(/\.link-preview/);
    expect(uploadCss).toMatch(/\.warn-msg/);
  });

  test('create-link soft warnings use showWarning, not showError', () => {
    expect(uploadWidget).toMatch(/warning:\s*data\.warning/);
    expect(uploadWidget).not.toMatch(/showError\(data\.warning\)/);
  });

  test('setLink is exported for hero/modal deep-link paste', () => {
    expect(uploadWidget).toMatch(/function setLink\(/);
    expect(uploadWidget).toMatch(/setLink\s*\}/);
    expect(uploadModal).toMatch(/widget\.setLink/);
    expect(indexHero).toMatch(/openUploadModal\(\{\s*mode:\s*'link',\s*url:\s*val\s*\}\)/);
  });
});

describe('homepage + guest upload consistency', () => {
  test('index loads hero/nav scripts and drops Dropbox marketing copy', () => {
    expect(indexHtml).toMatch(/js\/index-hero\.js/);
    expect(indexHtml).toMatch(/js\/index-nav\.js/);
    expect(indexHtml).not.toMatch(/Dropbox/);
    expect(indexHtml).toMatch(/YouTube, Vimeo, Dailymotion, Loom, or Wistia/);
  });

  test('upload page respects /api/upload-config requireAuth for guests', () => {
    expect(uploadPage).toMatch(/\/api\/upload-config/);
    expect(uploadPage).toMatch(/requireAuth/);
    expect(uploadPage).toMatch(/!signedIn && requireAuth/);
  });
});

describe('account cards for embeds', () => {
  test('renders non-YouTube thumbs and Open original', () => {
    expect(accountApp).toMatch(/function externalThumbUrl/);
    expect(accountApp).toMatch(/vumbnail\.com/);
    expect(accountApp).toMatch(/dailymotion\.com\/thumbnail/);
    expect(accountApp).toMatch(/cdn\.loom\.com\/sessions\/thumbnails/);
    expect(accountApp).toMatch(/original-btn/);
    expect(accountApp).toMatch(/buildOriginalUrl/);
    expect(accountApp).toMatch(/paste a YouTube/);
  });

  test('edit dialog shows embed gating caveat', () => {
    expect(accountHtml).toMatch(/id="editEmbedNote"/);
    expect(accountApp).toMatch(/editEmbedNote/);
  });
});

describe('watch polish', () => {
  test('embed load timeout is at least 20s', () => {
    expect(watchApp).toMatch(/setTimeout\(showFallback,\s*20000\)/);
  });

  test('password verify surfaces network errors', () => {
    expect(watchApp).toMatch(/Network error\. Check your connection/);
  });
});
