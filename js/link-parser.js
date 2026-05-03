/**
 * Video link parser — detects YouTube and Vimeo URLs and extracts the
 * platform-specific video ID across the common URL shapes.
 *
 * Supported shapes:
 *   YouTube:
 *     - https://www.youtube.com/watch?v=VIDEO_ID
 *     - https://youtube.com/watch?v=VIDEO_ID&...
 *     - https://m.youtube.com/watch?v=VIDEO_ID
 *     - https://youtu.be/VIDEO_ID
 *     - https://www.youtube.com/shorts/VIDEO_ID
 *     - https://www.youtube.com/embed/VIDEO_ID
 *     - https://www.youtube.com/live/VIDEO_ID
 *   Vimeo:
 *     - https://vimeo.com/VIDEO_ID
 *     - https://vimeo.com/VIDEO_ID/UNLISTED_HASH        → ID stored as "VIDEO_ID/HASH"
 *     - https://player.vimeo.com/video/VIDEO_ID
 *     - https://vimeo.com/channels/NAME/VIDEO_ID
 *     - https://vimeo.com/groups/NAME/videos/VIDEO_ID
 *
 * Returns { platform: 'youtube' | 'vimeo', videoId: string } or null.
 *
 * Works in both browser and Node (no DOM dependencies).
 */
(function (root) {
  const YT_ID = /^[A-Za-z0-9_-]{6,}$/;        // 11 in practice, but be lenient
  const VIMEO_ID = /^\d+(\/[A-Za-z0-9]+)?$/;  // numeric, optional unlisted hash

  // Hosts we explicitly call out so the UI can show a helpful message
  // ("upload the file directly") instead of a generic "not recognised".
  const UNSUPPORTED_HOSTS = ['dropbox.com', 'drive.google.com', 'onedrive.live.com', 'icloud.com'];

  function isUnsupportedHost(input) {
    if (typeof input !== 'string') return false;
    const lower = input.toLowerCase();
    return UNSUPPORTED_HOSTS.some(h => lower.includes(h));
  }

  function parse(input) {
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    // Reject obvious non-embeddable hosts up front. The server also enforces
    // this; doing it client-side just gives a faster, clearer error.
    if (isUnsupportedHost(trimmed)) return null;

    // Tolerate users pasting without a scheme.
    let urlStr = trimmed;
    if (!/^https?:\/\//i.test(urlStr)) urlStr = 'https://' + urlStr;

    let url;
    try { url = new URL(urlStr); } catch { return null; }

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname;

    // ── YouTube ────────────────────────────────────────────────────────────
    if (host === 'youtu.be') {
      const id = path.split('/').filter(Boolean)[0] || '';
      return YT_ID.test(id) ? { platform: 'youtube', videoId: id } : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      // /watch?v=ID
      if (path === '/watch') {
        const id = url.searchParams.get('v') || '';
        return YT_ID.test(id) ? { platform: 'youtube', videoId: id } : null;
      }
      // /shorts/ID, /embed/ID, /live/ID, /v/ID
      const m = path.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m && YT_ID.test(m[2])) return { platform: 'youtube', videoId: m[2] };
      return null;
    }

    // ── Vimeo ──────────────────────────────────────────────────────────────
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      // player.vimeo.com/video/ID
      let m = path.match(/^\/video\/(\d+)(?:\/([A-Za-z0-9]+))?/);
      if (m) {
        const id = m[2] ? `${m[1]}/${m[2]}` : m[1];
        return { platform: 'vimeo', videoId: id };
      }
      // /channels/NAME/ID
      m = path.match(/^\/channels\/[^/]+\/(\d+)(?:\/([A-Za-z0-9]+))?/);
      if (m) {
        const id = m[2] ? `${m[1]}/${m[2]}` : m[1];
        return { platform: 'vimeo', videoId: id };
      }
      // /groups/NAME/videos/ID
      m = path.match(/^\/groups\/[^/]+\/videos\/(\d+)(?:\/([A-Za-z0-9]+))?/);
      if (m) {
        const id = m[2] ? `${m[1]}/${m[2]}` : m[1];
        return { platform: 'vimeo', videoId: id };
      }
      // /ID or /ID/HASH (unlisted)
      m = path.match(/^\/(\d+)(?:\/([A-Za-z0-9]+))?\/?$/);
      if (m) {
        const id = m[2] ? `${m[1]}/${m[2]}` : m[1];
        return VIMEO_ID.test(id) ? { platform: 'vimeo', videoId: id } : null;
      }
      return null;
    }

    return null;
  }

  /**
   * Build the embed iframe URL for a parsed { platform, videoId }.
   * For Vimeo unlisted videos the ID format "ID/HASH" maps to
   * https://player.vimeo.com/video/ID?h=HASH which is required for embedding.
   */
  function buildEmbedUrl(platform, videoId) {
    if (platform === 'youtube') {
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1`;
    }
    if (platform === 'vimeo') {
      const parts = String(videoId).split('/');
      const id = parts[0];
      const hash = parts[1];
      const qs = hash ? `?h=${encodeURIComponent(hash)}` : '';
      return `https://player.vimeo.com/video/${encodeURIComponent(id)}${qs}`;
    }
    return null;
  }

  /**
   * Build the canonical original URL for a parsed { platform, videoId }.
   * Used in fallback messaging when an embed can't be displayed.
   */
  function buildOriginalUrl(platform, videoId) {
    if (platform === 'youtube') {
      return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    }
    if (platform === 'vimeo') {
      const parts = String(videoId).split('/');
      const id = parts[0];
      const hash = parts[1];
      return hash
        ? `https://vimeo.com/${encodeURIComponent(id)}/${encodeURIComponent(hash)}`
        : `https://vimeo.com/${encodeURIComponent(id)}`;
    }
    return null;
  }

  const api = { parse, buildEmbedUrl, buildOriginalUrl, isUnsupportedHost };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LinkParser = api;
  }
})(typeof window !== 'undefined' ? window : null);
