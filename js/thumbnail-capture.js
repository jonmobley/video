/* VidShare thumbnail capture helper.
 *
 * Loads a video source (File/Blob or URL) into a hidden <video>, seeks a
 * little way in, and exports a small JPEG frame via <canvas>. Used by the
 * upload widget (right after a successful finalize) and by the Dropbox URL
 * flow so uploaded videos can show a real frame in listings instead of a
 * grey placeholder.
 *
 * Defensive by design: every failure mode (timeout, decode error, taint,
 * empty frame, missing API) resolves to `null` so the caller can fall back
 * to a placeholder without ever throwing into the upload happy-path.
 */
(function () {
  function captureVideoThumbnail(source, opts) {
    const o = Object.assign({
      maxWidth: 640,
      maxHeight: 360,
      quality: 0.75,
      timeoutMs: 12000,
      seekRatio: 0.1,
      maxSeekSeconds: 2,
      mimeType: 'image/jpeg'
    }, opts || {});

    return new Promise((resolve) => {
      let settled = false;
      let objectUrl = null;
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      // Required so that drawing a remote frame to a canvas doesn't taint
      // it. Harmless on local Blob URLs. If the remote server doesn't
      // serve permissive CORS headers, video.error fires and we resolve
      // null — exactly the graceful-failure behaviour we want.
      video.crossOrigin = 'anonymous';
      video.style.cssText =
        'position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';

      function cleanup() {
        try { video.pause(); } catch (_) {}
        try { video.removeAttribute('src'); video.load(); } catch (_) {}
        try { video.remove(); } catch (_) {}
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch (_) {}
          objectUrl = null;
        }
      }

      function finish(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(value);
      }

      const timer = setTimeout(() => finish(null), o.timeoutMs);

      video.addEventListener('loadedmetadata', () => {
        const dur = isFinite(video.duration) ? video.duration : 0;
        const target = Math.min(o.maxSeekSeconds, Math.max(0, dur * o.seekRatio));
        try {
          video.currentTime = target;
        } catch (_) {
          // Some decoders refuse seek on metadata; fall back to frame 0.
          try { video.currentTime = 0; } catch (_) { finish(null); }
        }
      });

      video.addEventListener('seeked', () => {
        try {
          const vw = video.videoWidth, vh = video.videoHeight;
          if (!vw || !vh) return finish(null);
          const ratio = vw / vh;
          let cw = o.maxWidth;
          let ch = o.maxHeight;
          if (ratio > cw / ch) {
            ch = Math.max(1, Math.round(cw / ratio));
          } else {
            cw = Math.max(1, Math.round(ch * ratio));
          }
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          if (!ctx) return finish(null);
          ctx.drawImage(video, 0, 0, cw, ch);

          const onBlob = (blob) => {
            if (!blob) return finish(null);
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = String(reader.result || '');
              const comma = dataUrl.indexOf(',');
              const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
              if (!base64) return finish(null);
              finish({
                blob,
                dataUrl,
                base64,
                width: cw,
                height: ch,
                contentType: blob.type || o.mimeType
              });
            };
            reader.onerror = () => finish(null);
            reader.readAsDataURL(blob);
          };

          if (typeof canvas.toBlob === 'function') {
            canvas.toBlob(onBlob, o.mimeType, o.quality);
          } else {
            // Older Safari fallback: synthesize a blob from dataURL.
            try {
              const dataUrl = canvas.toDataURL(o.mimeType, o.quality);
              const comma = dataUrl.indexOf(',');
              const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
              const bin = atob(base64);
              const arr = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              onBlob(new Blob([arr], { type: o.mimeType }));
            } catch (_) { finish(null); }
          }
        } catch (_) {
          // Most commonly: SecurityError from a tainted canvas.
          finish(null);
        }
      });

      video.addEventListener('error', () => finish(null));

      try {
        if (typeof Blob !== 'undefined' && source instanceof Blob) {
          objectUrl = URL.createObjectURL(source);
          video.src = objectUrl;
        } else if (typeof source === 'string' && source) {
          video.src = source;
        } else {
          return finish(null);
        }
        document.body.appendChild(video);
        video.load();
      } catch (_) {
        finish(null);
      }
    });
  }

  window.captureVideoThumbnail = captureVideoThumbnail;
})();
