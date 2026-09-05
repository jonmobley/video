/**
 * @jest-environment jsdom
 */

const { sanitizeUrl, escapeHtml } = require('../../js/sanitize.js');

describe('sanitizeUrl', () => {
  test('allows http(s) URLs', () => {
    expect(sanitizeUrl('https://example.com/video')).toBe('https://example.com/video');
    expect(sanitizeUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  test('blocks javascript and data URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeUrl('data:image/svg+xml,<svg>')).toBe('');
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
    expect(sanitizeUrl('file:///etc/passwd')).toBe('');
  });

  test('blocks scheme obfuscation with whitespace', () => {
    expect(sanitizeUrl('java\nscript:alert(1)')).toBe('');
    expect(sanitizeUrl(' java script:alert(1)')).toBe('');
  });
});

describe('escapeHtml', () => {
  test('escapes markup', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
    expect(escapeHtml(`"'&`)).toBe('&quot;&#039;&amp;');
  });
});
