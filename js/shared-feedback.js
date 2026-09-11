/* Shared user-facing error helpers.
 *
 * Turns fetch failures and API error payloads into short, plain-English
 * messages, and renders them inline next to the control that failed
 * (instead of alert() or a global toast). Loaded via <script> on pages
 * that need it; also require()-able from Node for unit tests. */

(function (root) {
  const NETWORK_MESSAGE = 'Couldn\u2019t reach the server. Check your internet connection and try again.';

  const STATUS_MESSAGES = {
    400: 'Something about that request wasn\u2019t right. Please check and try again.',
    401: 'Your session has expired. Please sign in again.',
    403: 'You don\u2019t have permission to do that.',
    404: 'That item could not be found. It may have been removed.',
    408: 'The server took too long to respond. Please try again.',
    409: 'That change conflicts with the current state. Refresh and try again.',
    413: 'That\u2019s too large for the server to accept.',
    429: 'Too many requests. Please wait a moment and try again.'
  };

  /** True when `err` looks like a fetch()/network failure rather than an HTTP error. */
  function isNetworkError(err) {
    if (!err) return false;
    if (err.status) return false;
    if (err.networkError) return true;
    const msg = String(err.message || err);
    // Chrome: "Failed to fetch"; Firefox: "NetworkError when attempting to
    // fetch resource."; Safari: "Load failed" / "The Internet connection
    // appears to be offline."
    return /failed to fetch|networkerror|network request failed|load failed|internet connection|offline/i.test(msg);
  }

  /** Default copy for an HTTP status when the server sent no message. */
  function messageForStatus(status, fallback) {
    if (status >= 500) return 'Something went wrong on our end. Please try again in a moment.';
    return STATUS_MESSAGES[status] || fallback || 'Something went wrong. Please try again.';
  }

  /**
   * Read an error message out of a failed fetch Response.
   * Accepts both `{ error: { code, message } }` and legacy `{ error: 'text' }`.
   * Resolves to `{ status, code, message }` and never throws.
   */
  async function readApiError(res, fallback) {
    const status = (res && res.status) || 0;
    let code = 'ERROR';
    let message = '';
    try {
      const body = await res.json();
      if (body && body.error && typeof body.error === 'object') {
        code = body.error.code || code;
        message = body.error.message || '';
      } else if (body && typeof body.error === 'string') {
        message = body.error;
      } else if (body && typeof body.message === 'string') {
        message = body.message;
      }
    } catch (_) { /* non-JSON body */ }
    // 5xx bodies are generic ("Could not load folder.") and say nothing the
    // user can act on; our copy at least tells them to try again shortly.
    if (!message || status >= 500) message = messageForStatus(status, fallback);
    return { status, code, message };
  }

  /**
   * Build an Error from a failed Response so callers can `throw` it and let
   * describeError() produce the user-facing text later.
   */
  async function errorFromResponse(res, fallback) {
    const info = await readApiError(res, fallback);
    const err = new Error(info.message);
    err.status = info.status;
    err.code = info.code;
    err.userFacing = true;
    return err;
  }

  /**
   * Plain-English description of any caught error. Server-provided messages
   * pass through; network failures and raw JS errors get friendly copy.
   */
  function describeError(err, fallback) {
    const def = fallback || 'Something went wrong. Please try again.';
    if (!err) return def;
    if (typeof err === 'string') return err || def;
    if (isNetworkError(err)) return NETWORK_MESSAGE;
    if (err.userFacing && err.message) return err.message;
    if (err.status) return err.message || messageForStatus(err.status, def);
    // Raw JS errors (TypeError from a null deref, JSON parse failures, ...)
    // are not useful to end users.
    if (/^(TypeError|SyntaxError|RangeError|ReferenceError|AbortError|DOMException)$/.test(err.name || '')) return def;
    return err.message || def;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  }

  /**
   * Show `message` in an inline error element attached to `target`.
   * Creates a `<div class="inline-error" role="alert">` after `target`
   * (or inside it when `opts.inside` is true) and reuses it on later calls.
   * Pass an empty message to clear. Returns the element.
   */
  function showInlineError(target, message, opts) {
    if (!target) return null;
    const options = opts || {};
    const className = options.className || 'inline-error';
    const marker = options.key || 'default';
    const selector = '.' + className.split(/\s+/).join('.') + '[data-inline-key="' + marker + '"]';
    const parent = options.inside ? target : target.parentNode;
    if (!parent) return null;
    let el = options.inside
      ? target.querySelector(':scope > ' + selector)
      : (target.nextElementSibling && target.nextElementSibling.matches(selector)
        ? target.nextElementSibling : null);
    if (!message) {
      if (el) el.remove();
      return null;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = className;
      el.dataset.inlineKey = marker;
      el.setAttribute('role', options.role || 'alert');
      if (options.inside) target.appendChild(el);
      else parent.insertBefore(el, target.nextSibling);
    }
    el.textContent = message;
    if (options.actionLabel && typeof options.onAction === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inline-error-action';
      btn.textContent = options.actionLabel;
      btn.addEventListener('click', options.onAction);
      el.appendChild(document.createTextNode(' '));
      el.appendChild(btn);
    }
    if (options.timeout) {
      setTimeout(() => { if (el && el.parentNode) el.remove(); }, options.timeout);
    }
    return el;
  }

  /** Remove an inline error previously shown for `target`. */
  function clearInlineError(target, opts) {
    return showInlineError(target, '', opts);
  }

  /**
   * Temporarily swap a button's label (e.g. "Copied!" / "Couldn\u2019t copy")
   * and restore it after `ms`. Adds `className` for the duration.
   */
  function flashButton(btn, label, className, ms) {
    if (!btn) return;
    if (btn.dataset.flashOriginal === undefined) btn.dataset.flashOriginal = btn.textContent;
    if (btn._flashTimer) clearTimeout(btn._flashTimer);
    btn.textContent = label;
    if (className) btn.classList.add(className);
    btn._flashTimer = setTimeout(() => {
      btn.textContent = btn.dataset.flashOriginal;
      delete btn.dataset.flashOriginal;
      if (className) btn.classList.remove(className);
      btn._flashTimer = null;
    }, ms || 2000);
  }

  /**
   * Copy text to the clipboard with an execCommand fallback.
   * Resolves true on success, false when nothing worked.
   */
  async function copyText(text) {
    try {
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        await root.navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fall through to legacy path */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  const api = {
    NETWORK_MESSAGE,
    isNetworkError,
    messageForStatus,
    readApiError,
    errorFromResponse,
    describeError,
    escapeHtml,
    showInlineError,
    clearInlineError,
    flashButton,
    copyText
  };

  root.VsFeedback = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
