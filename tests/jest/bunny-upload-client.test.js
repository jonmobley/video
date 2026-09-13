// Exercises the browser TUS client in plain Node with fake fetch/XHR so we
// can verify the protocol headers Bunny expects without a network.
const BunnyUpload = require('../../js/bunny-upload.js');

const CREDS = {
  tusEndpoint: 'https://video.bunnycdn.com/tusupload',
  libraryId: '12345',
  videoId: '3f1c2a9e-7b4d-4c8e-9a1b-2d3e4f5a6b7c',
  expires: 1800000000,
  signature: 'a'.repeat(64)
};

function fakeFile(size, name = 'Act_One.final.mp4', type = 'video/mp4') {
  const bytes = new Uint8Array(size);
  return {
    name,
    type,
    size,
    slice(start, end) {
      const part = bytes.subarray(start, end);
      return { size: part.length };
    }
  };
}

class FakeXHR {
  constructor() {
    this.headers = {};
    this.upload = {};
    FakeXHR.instances.push(this);
  }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(name, value) { this.headers[name] = value; }
  getResponseHeader(name) { return this.responseHeaders[name] || null; }
  send(body) {
    this.body = body;
    const script = FakeXHR.script.shift() || { status: 204 };
    setTimeout(() => {
      if (script.networkError) { this.onerror(); return; }
      this.status = script.status;
      const offset = Number(this.headers['Upload-Offset']) + body.size;
      this.responseHeaders = { 'Upload-Offset': String(script.offset !== undefined ? script.offset : offset) };
      if (this.upload.onprogress) this.upload.onprogress({ lengthComputable: true, loaded: body.size });
      this.onload();
    }, 0);
  }
  abort() { if (this.onabort) this.onabort(); }
}
FakeXHR.instances = [];
FakeXHR.script = [];

describe('BunnyUpload helpers', () => {
  test('titleFromFileName strips the extension and separators', () => {
    expect(BunnyUpload.titleFromFileName('Act_One.final.mp4')).toBe('Act One final');
    expect(BunnyUpload.titleFromFileName('opening-number.MOV')).toBe('opening-number');
    expect(BunnyUpload.titleFromFileName('')).toBe('');
  });

  test('encodeMetadata base64-encodes values in TUS Upload-Metadata form', () => {
    const encoded = BunnyUpload.encodeMetadata({ filetype: 'video/mp4', title: 'Act One', empty: '' });
    expect(encoded).toBe(`filetype ${Buffer.from('video/mp4').toString('base64')},title ${Buffer.from('Act One').toString('base64')}`);
  });
});

describe('BunnyUpload.uploadFile', () => {
  const originalFetch = global.fetch;
  const originalXHR = global.XMLHttpRequest;
  const originalTextEncoder = global.TextEncoder;
  const originalBtoa = global.btoa;

  beforeEach(() => {
    FakeXHR.instances = [];
    FakeXHR.script = [];
    global.XMLHttpRequest = FakeXHR;
    global.TextEncoder = global.TextEncoder || require('util').TextEncoder;
    global.btoa = global.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.XMLHttpRequest = originalXHR;
    global.TextEncoder = originalTextEncoder;
    global.btoa = originalBtoa;
  });

  test('creates the upload with presigned headers, then PATCHes chunks in order', async () => {
    global.fetch = jest.fn(async () => ({
      status: 201,
      headers: { get: (name) => (name === 'Location' ? '/tusupload/abc123' : null) },
      text: async () => ''
    }));
    const file = fakeFile(BunnyUpload.CHUNK_SIZE + 10);
    const progress = [];

    await BunnyUpload.uploadFile(file, CREDS, { onProgress: (sent, total) => progress.push([sent, total]) });

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(CREDS.tusEndpoint);
    expect(init.method).toBe('POST');
    expect(init.headers['Tus-Resumable']).toBe('1.0.0');
    expect(init.headers.AuthorizationSignature).toBe(CREDS.signature);
    expect(init.headers.AuthorizationExpire).toBe(String(CREDS.expires));
    expect(init.headers.VideoId).toBe(CREDS.videoId);
    expect(init.headers.LibraryId).toBe('12345');
    expect(init.headers['Upload-Length']).toBe(String(file.size));
    expect(init.headers['Upload-Metadata']).toContain('filetype ');
    expect(init.headers['Upload-Metadata']).toContain('title ');

    expect(FakeXHR.instances).toHaveLength(2);
    const [first, second] = FakeXHR.instances;
    expect(first.method).toBe('PATCH');
    expect(first.url).toBe('https://video.bunnycdn.com/tusupload/abc123');
    expect(first.headers['Upload-Offset']).toBe('0');
    expect(first.headers['Content-Type']).toBe('application/offset+octet-stream');
    expect(first.headers.AuthorizationSignature).toBe(CREDS.signature);
    expect(second.headers['Upload-Offset']).toBe(String(BunnyUpload.CHUNK_SIZE));
    expect(second.body.size).toBe(10);
    expect(progress[progress.length - 1]).toEqual([file.size, file.size]);
  });

  test('resumes from the server offset after a transient chunk failure', async () => {
    let headCalls = 0;
    global.fetch = jest.fn(async (url, init) => {
      if (init && init.method === 'HEAD') {
        headCalls += 1;
        return { ok: true, status: 200, headers: { get: (n) => (n === 'Upload-Offset' ? '0' : null) } };
      }
      return {
        status: 201,
        headers: { get: (name) => (name === 'Location' ? 'https://video.bunnycdn.com/tusupload/xyz' : null) },
        text: async () => ''
      };
    });
    FakeXHR.script = [{ status: 503 }, { status: 204 }];
    const file = fakeFile(100);

    await BunnyUpload.uploadFile(file, CREDS);

    expect(headCalls).toBe(1);
    expect(FakeXHR.instances).toHaveLength(2);
    expect(FakeXHR.instances[1].headers['Upload-Offset']).toBe('0');
  });

  test('surfaces a clear message when the signature is rejected', async () => {
    global.fetch = jest.fn(async () => ({ status: 401, headers: { get: () => null }, text: async () => 'Unauthorized' }));
    await expect(BunnyUpload.uploadFile(fakeFile(10), CREDS)).rejects.toThrow(/signature was rejected/);
  });

  test('rejects when no file was chosen', async () => {
    await expect(BunnyUpload.uploadFile(null, CREDS)).rejects.toThrow(/Choose a video file/);
  });
});
