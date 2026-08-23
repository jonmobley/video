const { handler, decodeImage, isMatchingImageSignature } = require('../../netlify/functions/upload-coming-soon-image');

const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function event(body, token) {
  return {
    httpMethod: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body)
  };
}

describe('Coming Soon image upload validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SEUSSICAL_EDITOR_TOKEN = 'seussical-editor-test-token';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('decodes FileReader-style data URLs and recognizes PNG signatures', () => {
    const image = decodeImage(`data:image/png;base64,${tinyPng}`);

    expect(image).toBeInstanceOf(Buffer);
    expect(isMatchingImageSignature(image, 'image/png')).toBe(true);
    expect(isMatchingImageSignature(image, 'image/jpeg')).toBe(false);
  });

  test('rejects uploads without the page editor credential', async () => {
    const result = await handler(event({
      page: 'seussical',
      image: tinyPng,
      contentType: 'image/png'
    }));

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error.code).toBe('AUTH_REQUIRED');
  });

  test('rejects unsupported image types before attempting storage', async () => {
    const result = await handler(event({
      page: 'seussical',
      image: tinyPng,
      contentType: 'image/gif'
    }, 'seussical-editor-test-token'));

    expect(result.statusCode).toBe(415);
    expect(JSON.parse(result.body).error.code).toBe('UNSUPPORTED_TYPE');
  });

  test('rejects image data that does not match its declared content type', async () => {
    const result = await handler(event({
      page: 'seussical',
      image: Buffer.from('not an image').toString('base64'),
      contentType: 'image/png'
    }, 'seussical-editor-test-token'));

    expect(result.statusCode).toBe(415);
    expect(JSON.parse(result.body).error.code).toBe('IMAGE_CONTENT_MISMATCH');
  });
});