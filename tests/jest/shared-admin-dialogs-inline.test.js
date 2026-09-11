/**
 * @jest-environment jsdom
 *
 * Show-page admin dialogs must validate inline (no alert()) and must not
 * silently close when required input is missing.
 */

const fs = require('fs');
const path = require('path');

function loadDialogs() {
  const src = fs.readFileSync(path.join(__dirname, '../../js/shared-admin-dialogs.js'), 'utf8');
  // Plain script (no module wrapper) — run it as a function body and return
  // the functions the tests need.
  const run = new Function(src + '\nreturn { openDeleteTagDialog, openDeleteVideoDialog, openFeaturedContentDialog, showAdminBannerMessage };');
  return run();
}

describe('shared-admin-dialogs inline feedback', () => {
  let dialogs;

  beforeEach(() => {
    document.body.innerHTML = '<div id="adminBanner"><div class="admin-banner-content"></div></div>';
    window.alert = jest.fn();
    dialogs = loadDialogs();
  });

  test('delete-tag dialog shows inline validation instead of alert()', () => {
    const onConfirm = jest.fn();
    dialogs.openDeleteTagDialog('Songs', 3, '<option value="x">Other</option>', onConfirm, {
      validationMessage: 'Pick a tag to move the videos to.'
    });
    document.getElementById('confirmDelete').click();

    expect(window.alert).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    const err = document.querySelector('.oz-dialog-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toBe('Pick a tag to move the videos to.');
    expect(document.getElementById('reassignSelect').getAttribute('aria-invalid')).toBe('true');

    // Choosing a value clears the error and lets the action proceed.
    const select = document.getElementById('reassignSelect');
    select.value = 'x';
    select.dispatchEvent(new Event('change'));
    expect(document.querySelector('.oz-dialog-error')).toBeNull();
    document.getElementById('confirmDelete').click();
    expect(onConfirm).toHaveBeenCalledWith('x');
  });

  test('featured dialog does not silently close when nothing is chosen', () => {
    const onSetVideo = jest.fn();
    dialogs.openFeaturedContentDialog({ type: 'video', videoId: null, imageUrl: null }, {
      onSetVideo, onSetImage: jest.fn(), onClear: jest.fn()
    });
    document.getElementById('setFeaturedConfirm').click();

    expect(onSetVideo).not.toHaveBeenCalled();
    expect(document.getElementById('setFeaturedConfirm')).not.toBeNull();
    expect(document.querySelector('.oz-dialog-error').textContent).toMatch(/choose a video/i);
  });

  test('featured dialog flags an image URL that is not a web address', () => {
    dialogs.openFeaturedContentDialog({ type: 'image', videoId: null, imageUrl: '' }, {
      onSetVideo: jest.fn(), onSetImage: jest.fn(), onClear: jest.fn()
    });
    const input = document.getElementById('featuredImageUrl');
    input.value = 'not a url';
    document.getElementById('setFeaturedConfirm').click();
    expect(document.querySelector('.oz-dialog-error').textContent).toMatch(/https:\/\//);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  test('delete-video dialog stays open and explains when the delete fails', async () => {
    const err = new Error('You don\u2019t have permission to do that.');
    err.userFacing = true;
    dialogs.openDeleteVideoDialog('Clip', async () => { throw err; });
    const confirm = document.getElementById('confirmDelete');
    confirm.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('confirmDelete')).not.toBeNull();
    expect(confirm.disabled).toBe(false);
    expect(confirm.textContent).toBe('Delete');
    expect(document.querySelector('.oz-dialog-error').textContent)
      .toBe('The video wasn\u2019t deleted. You don\u2019t have permission to do that.');
  });

  test('banner message renders under the admin banner and can be dismissed', () => {
    const strip = dialogs.showAdminBannerMessage('Your changes weren\u2019t saved. Try again.', { timeout: 0 });
    expect(strip.parentNode).toBe(document.getElementById('adminBanner'));
    expect(strip.getAttribute('role')).toBe('alert');
    expect(strip.textContent).toContain('weren\u2019t saved');
    strip.querySelector('.admin-banner-message-close').click();
    expect(document.querySelector('.admin-banner-message')).toBeNull();
  });
});
