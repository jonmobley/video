/**
 * HTML Sanitization Utility
 * 
 * Provides functions to safely escape HTML and prevent XSS attacks
 * when rendering user-generated content.
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} unsafe - Unsafe string that may contain HTML
 * @returns {string} - Safe string with HTML entities escaped
 */
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') {
    return '';
  }
  
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape for use in HTML attributes
 * @param {string} unsafe - Unsafe string for attribute
 * @returns {string} - Safe string for attribute use
 */
function escapeAttr(unsafe) {
  if (typeof unsafe !== 'string') {
    return '';
  }
  
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitize a URL to prevent javascript: and data: URL XSS
 * @param {string} url - URL to sanitize
 * @returns {string} - Safe URL or empty string if dangerous
 */
function sanitizeUrl(url) {
  if (typeof url !== 'string') {
    return '';
  }
  
  const trimmed = url.trim().toLowerCase();
  
  // Block dangerous URL schemes
  if (trimmed.startsWith('javascript:') || 
      trimmed.startsWith('data:text/html') ||
      trimmed.startsWith('vbscript:')) {
    console.warn('Blocked potentially dangerous URL:', url);
    return '';
  }
  
  return url;
}

/**
 * Safely set text content (prefer this over innerHTML)
 * @param {HTMLElement} element - DOM element
 * @param {string} text - Text to set
 */
function safeSetText(element, text) {
  if (element && element.textContent !== undefined) {
    element.textContent = text || '';
  }
}

/**
 * Safely set an attribute value
 * @param {HTMLElement} element - DOM element
 * @param {string} attr - Attribute name
 * @param {string} value - Attribute value
 */
function safeSetAttr(element, attr, value) {
  if (element && attr) {
    element.setAttribute(attr, escapeAttr(value || ''));
  }
}

/**
 * Create a safe text node
 * @param {string} text - Text content
 * @returns {Text} - Text node
 */
function createSafeTextNode(text) {
  return document.createTextNode(text || '');
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
    escapeAttr,
    sanitizeUrl,
    safeSetText,
    safeSetAttr,
    createSafeTextNode
  };
}
