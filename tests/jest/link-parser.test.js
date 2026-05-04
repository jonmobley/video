const { parse, buildEmbedUrl, buildOriginalUrl, isUnsupportedHost } = require('../../js/link-parser.js');

describe('parse', () => {
  describe('YouTube watch URLs', () => {
    test('standard watch URL', () => {
      expect(parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('watch URL without www', () => {
      expect(parse('https://youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('watch URL with extra query params', () => {
      expect(parse('https://youtube.com/watch?v=dQw4w9WgXcQ&t=42&list=PLrAXtmEr')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('mobile watch URL (m.youtube.com)', () => {
      expect(parse('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('music.youtube.com watch URL', () => {
      expect(parse('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('watch URL with missing v param returns null', () => {
      expect(parse('https://www.youtube.com/watch')).toBeNull();
    });

    test('watch URL with empty v param returns null', () => {
      expect(parse('https://www.youtube.com/watch?v=')).toBeNull();
    });

    test('watch URL with too-short v param returns null', () => {
      expect(parse('https://www.youtube.com/watch?v=abc')).toBeNull();
    });
  });

  describe('YouTube short URLs (youtu.be)', () => {
    test('standard short URL', () => {
      expect(parse('https://youtu.be/dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('short URL with query params', () => {
      expect(parse('https://youtu.be/dQw4w9WgXcQ?t=120')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('short URL with empty path returns null', () => {
      expect(parse('https://youtu.be/')).toBeNull();
    });

    test('short URL with too-short ID returns null', () => {
      expect(parse('https://youtu.be/abc')).toBeNull();
    });
  });

  describe('YouTube /shorts/ URLs', () => {
    test('standard shorts URL', () => {
      expect(parse('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('shorts URL without www', () => {
      expect(parse('https://youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });
  });

  describe('YouTube /embed/ URLs', () => {
    test('standard embed URL', () => {
      expect(parse('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('embed URL with query params', () => {
      expect(parse('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });
  });

  describe('YouTube /live/ URLs', () => {
    test('standard live URL', () => {
      expect(parse('https://www.youtube.com/live/dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });
  });

  describe('YouTube /v/ URLs', () => {
    test('old-style /v/ URL', () => {
      expect(parse('https://www.youtube.com/v/dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });
  });

  describe('YouTube unrecognised paths', () => {
    test('youtube.com root returns null', () => {
      expect(parse('https://www.youtube.com/')).toBeNull();
    });

    test('youtube.com/playlist returns null', () => {
      expect(parse('https://www.youtube.com/playlist?list=PLrAXtmEr')).toBeNull();
    });

    test('youtube.com/channel returns null', () => {
      expect(parse('https://www.youtube.com/channel/UCxyz')).toBeNull();
    });
  });

  describe('Vimeo standard URLs', () => {
    test('standard numeric ID', () => {
      expect(parse('https://vimeo.com/123456789')).toEqual({
        platform: 'vimeo',
        videoId: '123456789'
      });
    });

    test('with www prefix', () => {
      expect(parse('https://www.vimeo.com/123456789')).toEqual({
        platform: 'vimeo',
        videoId: '123456789'
      });
    });

    test('with trailing slash', () => {
      expect(parse('https://vimeo.com/123456789/')).toEqual({
        platform: 'vimeo',
        videoId: '123456789'
      });
    });
  });

  describe('Vimeo unlisted URLs', () => {
    test('unlisted URL with hash', () => {
      expect(parse('https://vimeo.com/123456789/abc123def')).toEqual({
        platform: 'vimeo',
        videoId: '123456789/abc123def'
      });
    });
  });

  describe('Vimeo player embed URLs', () => {
    test('player.vimeo.com/video/ID', () => {
      expect(parse('https://player.vimeo.com/video/123456789')).toEqual({
        platform: 'vimeo',
        videoId: '123456789'
      });
    });

    test('player.vimeo.com/video/ID with unlisted hash', () => {
      expect(parse('https://player.vimeo.com/video/123456789/abc123def')).toEqual({
        platform: 'vimeo',
        videoId: '123456789/abc123def'
      });
    });
  });

  describe('Vimeo channel URLs', () => {
    test('/channels/NAME/ID', () => {
      expect(parse('https://vimeo.com/channels/staffpicks/123456789')).toEqual({
        platform: 'vimeo',
        videoId: '123456789'
      });
    });

    test('/channels/NAME/ID with unlisted hash', () => {
      expect(parse('https://vimeo.com/channels/staffpicks/123456789/abc123def')).toEqual({
        platform: 'vimeo',
        videoId: '123456789/abc123def'
      });
    });
  });

  describe('Vimeo group URLs', () => {
    test('/groups/NAME/videos/ID', () => {
      expect(parse('https://vimeo.com/groups/dance/videos/123456789')).toEqual({
        platform: 'vimeo',
        videoId: '123456789'
      });
    });

    test('/groups/NAME/videos/ID with unlisted hash', () => {
      expect(parse('https://vimeo.com/groups/dance/videos/123456789/abc123def')).toEqual({
        platform: 'vimeo',
        videoId: '123456789/abc123def'
      });
    });
  });

  describe('Vimeo unrecognised paths', () => {
    test('vimeo.com root returns null', () => {
      expect(parse('https://vimeo.com/')).toBeNull();
    });

    test('vimeo.com/settings returns null', () => {
      expect(parse('https://vimeo.com/settings')).toBeNull();
    });

    test('vimeo.com non-numeric path returns null', () => {
      expect(parse('https://vimeo.com/username')).toBeNull();
    });
  });

  describe('edge cases: empty and non-string input', () => {
    test('empty string returns null', () => {
      expect(parse('')).toBeNull();
    });

    test('whitespace-only string returns null', () => {
      expect(parse('   ')).toBeNull();
    });

    test('null returns null', () => {
      expect(parse(null)).toBeNull();
    });

    test('undefined returns null', () => {
      expect(parse(undefined)).toBeNull();
    });

    test('number returns null', () => {
      expect(parse(12345)).toBeNull();
    });
  });

  describe('edge cases: non-URL text', () => {
    test('random words return null', () => {
      expect(parse('just some random text')).toBeNull();
    });

    test('email address returns null', () => {
      expect(parse('user@example.com')).toBeNull();
    });

    test('partial URL without host returns null', () => {
      expect(parse('/watch?v=dQw4w9WgXcQ')).toBeNull();
    });
  });

  describe('edge cases: unsupported hosts', () => {
    test('Dropbox URL returns null', () => {
      expect(parse('https://www.dropbox.com/s/abc123/video.mp4')).toBeNull();
    });

    test('Google Drive URL returns null', () => {
      expect(parse('https://drive.google.com/file/d/abc123/view')).toBeNull();
    });

    test('OneDrive URL returns null', () => {
      expect(parse('https://onedrive.live.com/?cid=abc')).toBeNull();
    });

    test('iCloud URL returns null', () => {
      expect(parse('https://www.icloud.com/iclouddrive/abc')).toBeNull();
    });
  });

  describe('edge cases: unrecognised hosts', () => {
    test('example.com returns null', () => {
      expect(parse('https://example.com/video.mp4')).toBeNull();
    });

    test('dailymotion returns null', () => {
      expect(parse('https://www.dailymotion.com/video/x123abc')).toBeNull();
    });

    test('tiktok returns null', () => {
      expect(parse('https://www.tiktok.com/@user/video/123')).toBeNull();
    });
  });

  describe('edge cases: URLs without scheme', () => {
    test('YouTube URL without https://', () => {
      expect(parse('www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('youtu.be without https://', () => {
      expect(parse('youtu.be/dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('vimeo.com without https://', () => {
      expect(parse('vimeo.com/123456789')).toEqual({
        platform: 'vimeo',
        videoId: '123456789'
      });
    });

    test('unsupported host without scheme still rejected', () => {
      expect(parse('dropbox.com/s/abc123/video.mp4')).toBeNull();
    });
  });

  describe('edge cases: HTTP scheme', () => {
    test('http:// YouTube URL still parses', () => {
      expect(parse('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('http:// Vimeo URL still parses', () => {
      expect(parse('http://vimeo.com/123456789')).toEqual({
        platform: 'vimeo',
        videoId: '123456789'
      });
    });
  });

  describe('edge cases: whitespace around input', () => {
    test('leading/trailing spaces are trimmed', () => {
      expect(parse('  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ')).toEqual({
        platform: 'youtube',
        videoId: 'dQw4w9WgXcQ'
      });
    });

    test('leading/trailing tabs and newlines are trimmed', () => {
      expect(parse('\thttps://vimeo.com/123456789\n')).toEqual({
        platform: 'vimeo',
        videoId: '123456789'
      });
    });
  });

  describe('edge cases: video IDs with hyphens and underscores', () => {
    test('YouTube ID with hyphens', () => {
      expect(parse('https://youtube.com/watch?v=a-b_c-D_E-f')).toEqual({
        platform: 'youtube',
        videoId: 'a-b_c-D_E-f'
      });
    });

    test('YouTube ID that is exactly 11 chars', () => {
      expect(parse('https://youtube.com/watch?v=AbCdEfGhIjK')).toEqual({
        platform: 'youtube',
        videoId: 'AbCdEfGhIjK'
      });
    });
  });
});

describe('buildEmbedUrl', () => {
  describe('YouTube', () => {
    test('builds privacy-enhanced embed URL', () => {
      expect(buildEmbedUrl('youtube', 'dQw4w9WgXcQ')).toBe(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1'
      );
    });

    test('encodes special characters in video ID', () => {
      const url = buildEmbedUrl('youtube', 'a-b_c');
      expect(url).toContain('/embed/a-b_c');
    });
  });

  describe('Vimeo', () => {
    test('builds standard Vimeo embed URL', () => {
      expect(buildEmbedUrl('vimeo', '123456789')).toBe(
        'https://player.vimeo.com/video/123456789'
      );
    });

    test('builds unlisted Vimeo embed URL with h= param', () => {
      expect(buildEmbedUrl('vimeo', '123456789/abc123def')).toBe(
        'https://player.vimeo.com/video/123456789?h=abc123def'
      );
    });
  });

  describe('unknown platform', () => {
    test('returns null for unsupported platform', () => {
      expect(buildEmbedUrl('dailymotion', '12345')).toBeNull();
    });
  });
});

describe('buildOriginalUrl', () => {
  describe('YouTube', () => {
    test('builds standard watch URL', () => {
      expect(buildOriginalUrl('youtube', 'dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
    });
  });

  describe('Vimeo', () => {
    test('builds standard Vimeo URL', () => {
      expect(buildOriginalUrl('vimeo', '123456789')).toBe(
        'https://vimeo.com/123456789'
      );
    });

    test('builds unlisted Vimeo URL with hash in path', () => {
      expect(buildOriginalUrl('vimeo', '123456789/abc123def')).toBe(
        'https://vimeo.com/123456789/abc123def'
      );
    });
  });

  describe('unknown platform', () => {
    test('returns null for unsupported platform', () => {
      expect(buildOriginalUrl('dailymotion', '12345')).toBeNull();
    });
  });
});

describe('isUnsupportedHost', () => {
  test('detects dropbox.com', () => {
    expect(isUnsupportedHost('https://www.dropbox.com/s/abc/file.mp4')).toBe(true);
  });

  test('detects drive.google.com', () => {
    expect(isUnsupportedHost('https://drive.google.com/file/d/abc')).toBe(true);
  });

  test('detects onedrive.live.com', () => {
    expect(isUnsupportedHost('https://onedrive.live.com/?cid=abc')).toBe(true);
  });

  test('detects icloud.com', () => {
    expect(isUnsupportedHost('https://www.icloud.com/iclouddrive/abc')).toBe(true);
  });

  test('case-insensitive matching', () => {
    expect(isUnsupportedHost('https://DRIVE.GOOGLE.COM/file')).toBe(true);
  });

  test('returns false for supported hosts', () => {
    expect(isUnsupportedHost('https://www.youtube.com/watch?v=abc')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isUnsupportedHost('')).toBe(false);
  });

  test('returns false for non-string input', () => {
    expect(isUnsupportedHost(null)).toBe(false);
    expect(isUnsupportedHost(undefined)).toBe(false);
    expect(isUnsupportedHost(123)).toBe(false);
  });
});

describe('roundtrip: parse → buildEmbedUrl → buildOriginalUrl', () => {
  const urls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://vimeo.com/123456789',
    'https://vimeo.com/123456789/abc123def',
  ];

  test.each(urls)('parse then buildEmbedUrl produces a valid string for %s', (url) => {
    const result = parse(url);
    expect(result).not.toBeNull();
    const embedUrl = buildEmbedUrl(result.platform, result.videoId);
    expect(typeof embedUrl).toBe('string');
    expect(embedUrl.startsWith('https://')).toBe(true);
  });

  test.each(urls)('parse then buildOriginalUrl produces a valid string for %s', (url) => {
    const result = parse(url);
    expect(result).not.toBeNull();
    const originalUrl = buildOriginalUrl(result.platform, result.videoId);
    expect(typeof originalUrl).toBe('string');
    expect(originalUrl.startsWith('https://')).toBe(true);
  });
});
