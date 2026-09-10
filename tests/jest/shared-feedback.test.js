/**
 * @jest-environment jsdom
 *
 * Unit tests for js/shared-feedback.js — the helper every page uses to turn
 * fetch failures / API error payloads into plain-English text and render it
 * inline next to the control that failed.
 */

const Feedback = require('../../js/shared-feedback.js');

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

describe('describeError', () => {
  test('maps browser network failures to the friendly connection message', () => {
    for (const msg of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
      expect(Feedback.describeError(new TypeError(msg))).toBe(Feedback.NETWORK_MESSAGE);
    }
  });

  test('passes through server-provided messages marked userFacing', () => {
    const err = new Error('Too many attempts. Please wait a minute.');
    err.userFacing = true;
    err.status = 429;
    expect(Feedback.describeError(err)).toBe('Too many attempts. Please wait a minute.');
  });

  test('hides raw JS errors behind the fallback', () => {
    expect(Feedback.describeError(new TypeError('Cannot read properties of undefined'), 'Try again.')).toBe('Try again.');
    expect(Feedback.describeError(new SyntaxError('Unexpected token < in JSON'), 'Try again.')).toBe('Try again.');
  });

  test('uses a status-based message when an HTTP error carries no text', () => {
    const err = new Error('');
    err.status = 503;
    expect(Feedback.describeError(err)).toMatch(/on our end/i);
  });

  test('accepts plain strings and null', () => {
    expect(Feedback.describeError('Nope')).toBe('Nope');
    expect(Feedback.describeError(null, 'Fallback')).toBe('Fallback');
  });
});

describe('readApiError / errorFromResponse', () => {
  test('reads { error: { code, message } }', async () => {
    const info = await Feedback.readApiError(jsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'Slow down.' } }));
    expect(info).toEqual({ status: 429, code: 'RATE_LIMITED', message: 'Slow down.' });
  });

  test('reads legacy { error: "text" } and { message }', async () => {
    expect((await Feedback.readApiError(jsonResponse(400, { error: 'Bad input' }))).message).toBe('Bad input');
    expect((await Feedback.readApiError(jsonResponse(400, { message: 'Nope' }))).message).toBe('Nope');
  });

  test('falls back to friendly status text on non-JSON bodies', async () => {
    const res = { status: 502, json: async () => { throw new Error('not json'); } };
    const info = await Feedback.readApiError(res, 'Fallback');
    expect(info.message).toMatch(/on our end/i);
    const notFound = await Feedback.readApiError({ status: 404, json: async () => ({}) });
    expect(notFound.message).toMatch(/could not be found/i);
  });

  test('errorFromResponse yields a userFacing Error with status', async () => {
    const err = await Feedback.errorFromResponse(jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'Not yours.' } }));
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not yours.');
    expect(err.status).toBe(403);
    expect(err.userFacing).toBe(true);
    expect(Feedback.describeError(err)).toBe('Not yours.');
  });
});

describe('showInlineError', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="card"><button id="btn">Delete</button></div>';
  });

  test('inserts an alert after the target and reuses it on later calls', () => {
    const btn = document.getElementById('btn');
    const el = Feedback.showInlineError(btn, 'First');
    expect(el.getAttribute('role')).toBe('alert');
    expect(btn.nextElementSibling).toBe(el);
    expect(el.textContent).toBe('First');

    const again = Feedback.showInlineError(btn, 'Second');
    expect(again).toBe(el);
    expect(document.querySelectorAll('.inline-error').length).toBe(1);
    expect(el.textContent).toBe('Second');
  });

  test('renders inside the target when asked, and clears on empty message', () => {
    const card = document.getElementById('card');
    const el = Feedback.showInlineError(card, 'Oops', { inside: true, className: 'inline-error inline-compact' });
    expect(el.parentNode).toBe(card);
    expect(el.classList.contains('inline-compact')).toBe(true);

    Feedback.showInlineError(card, '', { inside: true, className: 'inline-error inline-compact' });
    expect(card.querySelector('.inline-error')).toBeNull();
  });

  test('adds an action button wired to onAction', () => {
    const btn = document.getElementById('btn');
    const onAction = jest.fn();
    const el = Feedback.showInlineError(btn, 'Failed', { actionLabel: 'Try again', onAction });
    const action = el.querySelector('button.inline-error-action');
    expect(action.textContent).toBe('Try again');
    action.click();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('escapes nothing by accident: message is set as text, not HTML', () => {
    const btn = document.getElementById('btn');
    const el = Feedback.showInlineError(btn, '<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img');
  });
});

describe('flashButton', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('swaps the label temporarily and restores it', () => {
    document.body.innerHTML = '<button id="b">Copy link</button>';
    const b = document.getElementById('b');
    Feedback.flashButton(b, 'Couldn\u2019t copy', 'btn-failed', 1000);
    expect(b.textContent).toBe('Couldn\u2019t copy');
    expect(b.classList.contains('btn-failed')).toBe(true);
    jest.advanceTimersByTime(1000);
    expect(b.textContent).toBe('Copy link');
    expect(b.classList.contains('btn-failed')).toBe(false);
  });
});

describe('copyText', () => {
  test('returns false when no clipboard mechanism works', async () => {
    const original = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    document.execCommand = undefined;
    expect(await Feedback.copyText('hello')).toBe(false);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: original });
  });

  test('returns true when the async clipboard API succeeds', async () => {
    const writeText = jest.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    expect(await Feedback.copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });
});
