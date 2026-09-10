const crypto = require('crypto');
const bunny = require('../../lib/bunny-stream');

const ENV = {
  BUNNY_STREAM_LIBRARY_ID: '12345',
  BUNNY_STREAM_API_KEY: 'stream-key',
  BUNNY_STREAM_CDN_HOSTNAME: 'https://vz-abc123-def.b-cdn.net/'
};
const GUID = '3f1c2a9e-7b4d-4c8e-9a1b-2d3e4f5a6b7c';

describe('bunny-stream config', () => {
  test('isConfigured needs a numeric library id and an API key', () => {
    expect(bunny.isConfigured(ENV)).toBe(true);
    expect(bunny.isConfigured({ ...ENV, BUNNY_STREAM_API_KEY: '' })).toBe(false);
    expect(bunny.isConfigured({ ...ENV, BUNNY_STREAM_LIBRARY_ID: 'abc' })).toBe(false);
    expect(bunny.isConfigured({})).toBe(false);
  });

  test('readConfig normalises the CDN hostname', () => {
    expect(bunny.readConfig(ENV).cdnHostname).toBe('vz-abc123-def.b-cdn.net');
  });

  test('isValidVideoId accepts Bunny GUIDs only', () => {
    expect(bunny.isValidVideoId(GUID)).toBe(true);
    expect(bunny.isValidVideoId('ssgxvlsdmx')).toBe(false);
    expect(bunny.isValidVideoId('')).toBe(false);
    expect(bunny.isValidVideoId(null)).toBe(false);
  });
});

describe('bunny-stream URLs', () => {
  test('embedUrl uses the player endpoint with library and video id', () => {
    expect(bunny.embedUrl(GUID, ENV)).toBe(`https://player.mediadelivery.net/embed/12345/${GUID}`);
  });

  test('thumbnailUrl and previewUrl come from the pull zone', () => {
    expect(bunny.thumbnailUrl(GUID, ENV)).toBe(`https://vz-abc123-def.b-cdn.net/${GUID}/thumbnail.jpg`);
    expect(bunny.previewUrl(GUID, ENV)).toBe(`https://vz-abc123-def.b-cdn.net/${GUID}/preview.webp`);
  });

  test('thumbnailUrl is null without a CDN hostname', () => {
    expect(bunny.thumbnailUrl(GUID, { ...ENV, BUNNY_STREAM_CDN_HOSTNAME: '' })).toBeNull();
  });
});

describe('TUS presigned credentials', () => {
  test('signature is hex sha256 of libraryId + apiKey + expires + videoId', () => {
    const expires = 1_800_000_000;
    const expected = crypto.createHash('sha256')
      .update(`12345stream-key${expires}${GUID}`)
      .digest('hex');
    expect(bunny.tusSignature({ libraryId: '12345', apiKey: 'stream-key', expires, videoId: GUID })).toBe(expected);
  });

  test('buildUploadCredentials keeps the signature valid for at least an hour', () => {
    const now = 1_700_000_000_000;
    const creds = bunny.buildUploadCredentials(GUID, ENV, now);
    expect(creds.tusEndpoint).toBe('https://video.bunnycdn.com/tusupload');
    expect(creds.libraryId).toBe('12345');
    expect(creds.videoId).toBe(GUID);
    expect(creds.expires - Math.floor(now / 1000)).toBeGreaterThanOrEqual(3600);
    expect(creds.signature).toBe(bunny.tusSignature({
      libraryId: '12345', apiKey: 'stream-key', expires: creds.expires, videoId: GUID
    }));
  });
});

describe('Stream API calls', () => {
  function fakeFetch(status, body) {
    return jest.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body === undefined ? '' : JSON.stringify(body))
    }));
  }

  test('createVideo posts the title with the AccessKey header and returns the guid', async () => {
    const fetchImpl = fakeFetch(200, { guid: GUID, title: 'Act One' });
    const result = await bunny.createVideo('Act One', { env: ENV, fetchImpl });
    expect(result).toEqual({ videoId: GUID });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://video.bunnycdn.com/library/12345/videos');
    expect(init.method).toBe('POST');
    expect(init.headers.AccessKey).toBe('stream-key');
    expect(JSON.parse(init.body)).toEqual({ title: 'Act One' });
  });

  test('createVideo rejects when Bunny returns an error', async () => {
    const fetchImpl = fakeFetch(401, { Message: 'Unauthorized' });
    await expect(bunny.createVideo('x', { env: ENV, fetchImpl })).rejects.toThrow(/401/);
  });

  test('getVideo maps status codes and thumbnail names', async () => {
    const fetchImpl = fakeFetch(200, {
      guid: GUID, title: 'Act One', status: 4, encodeProgress: 100, length: 187,
      width: 1920, height: 1080, thumbnailFileName: 'thumbnail_2.jpg'
    });
    const video = await bunny.getVideo(GUID, { env: ENV, fetchImpl });
    expect(video.status).toBe('finished');
    expect(video.length).toBe(187);
    expect(video.thumbnailFileName).toBe('thumbnail_2.jpg');
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://video.bunnycdn.com/library/12345/videos/${GUID}`);
  });

  test('deleteVideo issues DELETE and refuses invalid ids', async () => {
    const fetchImpl = fakeFetch(200, { success: true });
    await bunny.deleteVideo(GUID, { env: ENV, fetchImpl });
    expect(fetchImpl.mock.calls[0][1].method).toBe('DELETE');
    await expect(bunny.deleteVideo('not-a-guid', { env: ENV, fetchImpl })).rejects.toThrow(/Invalid/);
  });
});
