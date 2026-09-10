/**
 * Direct browser → Bunny Stream uploads for show pages.
 *
 * A small TUS 1.0 client (create + PATCH in chunks, HEAD to resume) so the
 * page editor can push a file straight to https://video.bunnycdn.com/tusupload
 * with presigned credentials from /api/bunny-create-upload. Nothing here needs
 * a third-party script, which keeps the CSP tight.
 *
 * Exposes `window.BunnyUpload` with:
 *   uploadFile(file, credentials, { onProgress, signal }) -> Promise<void>
 *   readVideoDuration(file) -> Promise<number|null>   (seconds, via <video>)
 *   titleFromFileName(name) -> string
 */
(function (global) {
  'use strict';

  const TUS_VERSION = '1.0.0';
  const CHUNK_SIZE = 32 * 1024 * 1024;
  const RETRY_DELAYS_MS = [0, 3000, 5000, 10000, 20000, 30000];

  function base64(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function encodeMetadata(pairs) {
    return Object.entries(pairs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key} ${base64(value)}`)
      .join(',');
  }

  function authHeaders(credentials) {
    return {
      'Tus-Resumable': TUS_VERSION,
      AuthorizationSignature: credentials.signature,
      AuthorizationExpire: String(credentials.expires),
      VideoId: credentials.videoId,
      LibraryId: String(credentials.libraryId)
    };
  }

  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(abortError());
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(abortError()); }, { once: true });
      }
    });
  }

  function abortError() {
    const error = new Error('Upload cancelled.');
    error.name = 'AbortError';
    return error;
  }

  async function createUpload(file, credentials, signal) {
    const response = await fetch(credentials.tusEndpoint, {
      method: 'POST',
      signal,
      headers: {
        ...authHeaders(credentials),
        'Upload-Length': String(file.size),
        'Upload-Metadata': encodeMetadata({
          filetype: file.type || 'video/mp4',
          title: file.name
        })
      }
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(await describeFailure(response, 'Bunny rejected the upload request'));
    }
    const location = response.headers.get('Location');
    if (!location) throw new Error('Bunny did not return an upload location.');
    return new URL(location, credentials.tusEndpoint).toString();
  }

  async function fetchOffset(uploadUrl, credentials, signal) {
    const response = await fetch(uploadUrl, { method: 'HEAD', signal, headers: authHeaders(credentials) });
    if (!response.ok) throw new Error(await describeFailure(response, 'Could not resume the upload'));
    const offset = Number(response.headers.get('Upload-Offset'));
    if (!Number.isFinite(offset)) throw new Error('Bunny did not report the upload offset.');
    return offset;
  }

  async function describeFailure(response, prefix) {
    let detail = '';
    try { detail = (await response.text()).slice(0, 160); } catch { /* ignore */ }
    if (response.status === 401) {
      return `${prefix}: the upload signature was rejected (401). Check the Bunny library id and API key on the server.`;
    }
    return `${prefix} (${response.status})${detail ? `: ${detail}` : ''}`;
  }

  function patchChunk(uploadUrl, chunk, offset, credentials, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PATCH', uploadUrl, true);
      const headers = authHeaders(credentials);
      Object.keys(headers).forEach(name => xhr.setRequestHeader(name, headers[name]));
      xhr.setRequestHeader('Upload-Offset', String(offset));
      xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(offset + event.loaded);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const next = Number(xhr.getResponseHeader('Upload-Offset'));
          resolve(Number.isFinite(next) ? next : offset + chunk.size);
        } else {
          const error = new Error(`Chunk upload failed (${xhr.status})`);
          error.status = xhr.status;
          reject(error);
        }
      };
      xhr.onerror = () => reject(new Error('Network error while uploading to Bunny.'));
      xhr.onabort = () => reject(abortError());
      if (signal) {
        if (signal.aborted) { xhr.abort(); return; }
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }
      xhr.send(chunk);
    });
  }

  /**
   * Upload `file` to Bunny Stream. Resolves once every byte is acknowledged;
   * Bunny then encodes the video asynchronously.
   */
  async function uploadFile(file, credentials, options) {
    const opts = options || {};
    const onProgress = typeof opts.onProgress === 'function'
      ? (sent) => opts.onProgress(Math.min(sent, file.size), file.size)
      : null;
    const signal = opts.signal;

    if (!file || !file.size) throw new Error('Choose a video file to upload.');
    if (!credentials || !credentials.tusEndpoint || !credentials.signature) {
      throw new Error('Upload credentials are missing.');
    }

    const uploadUrl = await createUpload(file, credentials, signal);
    let offset = 0;
    let attempt = 0;

    while (offset < file.size) {
      const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
      try {
        offset = await patchChunk(uploadUrl, chunk, offset, credentials, onProgress, signal);
        attempt = 0;
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        // 4xx other than offset conflicts will not succeed on retry.
        if (error.status && error.status >= 400 && error.status < 500 && error.status !== 409) throw error;
        if (attempt >= RETRY_DELAYS_MS.length) throw error;
        await wait(RETRY_DELAYS_MS[attempt], signal);
        attempt += 1;
        offset = await fetchOffset(uploadUrl, credentials, signal);
      }
    }

    if (onProgress) onProgress(file.size);
  }

  /**
   * Read the clip length locally so the grid can show it before Bunny finishes
   * encoding. Resolves null if the browser cannot decode the container.
   */
  function readVideoDuration(file) {
    return new Promise((resolve) => {
      if (!file || typeof URL === 'undefined' || !URL.createObjectURL) return resolve(null);
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      const finish = (value) => {
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 8000);
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        const seconds = Number(video.duration);
        finish(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null);
      };
      video.onerror = () => { clearTimeout(timer); finish(null); };
      video.src = url;
    });
  }

  function titleFromFileName(name) {
    return String(name || '')
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/[_.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const api = {
    CHUNK_SIZE,
    uploadFile,
    readVideoDuration,
    titleFromFileName,
    encodeMetadata
  };
  global.BunnyUpload = api;

  // Node-only export hook for unit tests; browsers ignore this branch.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
