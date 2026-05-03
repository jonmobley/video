// Tests for the client-side retry/parse helpers exported by upload-widget.js.
// We exercise these in plain Node — they have no DOM dependencies — by
// importing the Node-only export hook at the bottom of the IIFE.
const { retryChunk, parseErrJson } = require('../../js/upload-widget.js');

function makeJsonResponse(status, body) {
  return {
    status,
    json: async () => body
  };
}

describe('parseErrJson', () => {
  test('reads the new { error: { code, message } } shape', async () => {
    const res = makeJsonResponse(400, { error: { code: 'BAD_VIDEO_ID', message: 'Invalid video id.' } });
    expect(await parseErrJson(res)).toEqual({ code: 'BAD_VIDEO_ID', message: 'Invalid video id.' });
  });

  test('falls back to the legacy { error: "string" } shape', async () => {
    const res = makeJsonResponse(400, { error: 'something exploded' });
    expect(await parseErrJson(res)).toEqual({ code: 'ERROR', message: 'something exploded' });
  });

  test('returns a safe default when JSON parsing fails', async () => {
    const res = { status: 500, json: async () => { throw new Error('not json'); } };
    expect(await parseErrJson(res)).toEqual({ code: 'ERROR', message: '' });
  });
});

describe('retryChunk', () => {
  test('returns the result on first success without delay', async () => {
    let attempts = 0;
    const out = await retryChunk(async () => { attempts++; return 'ok'; }, 0);
    expect(out).toBe('ok');
    expect(attempts).toBe(1);
  });

  test('retries on 5xx and eventually succeeds', async () => {
    let attempts = 0;
    const out = await retryChunk(async () => {
      attempts++;
      if (attempts < 3) {
        const e = new Error('boom'); e.status = 503; throw e;
      }
      return 'ok';
    }, 0);
    expect(out).toBe('ok');
    expect(attempts).toBe(3);
  });

  test('retries on 408 and 429', async () => {
    for (const transientStatus of [408, 429]) {
      let attempts = 0;
      const out = await retryChunk(async () => {
        attempts++;
        if (attempts === 1) {
          const e = new Error('again'); e.status = transientStatus; throw e;
        }
        return 'ok';
      }, 0);
      expect(out).toBe('ok');
      expect(attempts).toBe(2);
    }
  });

  test('retries on network errors (no status field)', async () => {
    let attempts = 0;
    const out = await retryChunk(async () => {
      attempts++;
      if (attempts === 1) throw new Error('network down');
      return 'ok';
    }, 0);
    expect(out).toBe('ok');
    expect(attempts).toBe(2);
  });

  test('does NOT retry on 4xx validation failures', async () => {
    let attempts = 0;
    await expect(retryChunk(async () => {
      attempts++;
      const e = new Error('Invalid video id.'); e.status = 400; throw e;
    }, 0)).rejects.toThrow('Invalid video id.');
    expect(attempts).toBe(1);
  });

  test('does NOT retry on 415 (unsupported media)', async () => {
    let attempts = 0;
    await expect(retryChunk(async () => {
      attempts++;
      const e = new Error('Unsupported file type.'); e.status = 415; throw e;
    }, 0)).rejects.toThrow('Unsupported file type.');
    expect(attempts).toBe(1);
  });

  test('gives up after 4 attempts on persistent 500s', async () => {
    let attempts = 0;
    await expect(retryChunk(async () => {
      attempts++;
      const e = new Error('server down'); e.status = 500; throw e;
    }, 0)).rejects.toThrow('server down');
    expect(attempts).toBe(4);
  }, 30000);

  test('preserves the thrown error so callers see the server message', async () => {
    const original = new Error('Decoded chunk is empty.');
    original.status = 400;
    await expect(retryChunk(async () => { throw original; }, 0)).rejects.toBe(original);
  });
});
