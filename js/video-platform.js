/**
 * Video Platform Abstraction Layer
 * Handles both Wistia and Dropbox video playback
 */

class VideoPlatformManager {
    constructor() {
        this.currentPlatform = null;
        this.currentVideoId = null;
    }

    /**
     * Initialize the video platform manager
     */
    async init() {
        // Load Dropbox URL handler if not already loaded
        if (typeof window.DropboxURLHandler === 'undefined') {
            await this.loadDropboxURLHandler();
        }
    }

    /**
     * Load Dropbox URL Handler script
     */
    async loadDropboxURLHandler() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'js/dropbox-url-handler.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Dropbox URL Handler'));
            document.head.appendChild(script);
        });
    }

    /**
     * Process a Dropbox URL and convert to video data
     * @param {string} url - Dropbox sharing URL
     * @returns {Object} Video data object
     */
    processDropboxUrl(url) {
        if (typeof window.DropboxURLHandler === 'undefined') {
            throw new Error('Dropbox URL Handler not loaded');
        }
        
        return window.DropboxURLHandler.extractMetadata(url);
    }

    /**
     * Load video based on platform
     * @param {Object} video - Video object with platform info
     * @param {HTMLElement} container - Container element for the video
     * @param {Function} onReady - Callback when video is ready
     */
    loadVideo(video, container, onReady = null, onError = null) {
        this.currentPlatform = video.platform || 'wistia';
        this.currentVideoId = video.wistiaId || video.id;

        if (this.currentPlatform === 'dropbox') {
            this.loadDropboxVideo(video, container, onReady);
        } else if (this.currentPlatform === 'youtube') {
            this.loadYouTubeVideo(video, container, onReady, onError);
        } else if (this.currentPlatform === 'vimeo') {
            this.loadVimeoVideo(video, container, onReady, onError);
        } else {
            this.loadWistiaVideo(video, container, onReady);
        }
    }

    /**
     * Load an external script once and reuse the same in-flight Promise on
     * subsequent calls. Used to lazy-load the YouTube IFrame API and Vimeo
     * Player.js so we only pay the cost when an embed actually renders.
     */
    _loadScriptOnce(src) {
        if (!this._scriptPromises) this._scriptPromises = {};
        if (VideoPlatformManager._scriptPromises &&
            VideoPlatformManager._scriptPromises[src]) {
            return VideoPlatformManager._scriptPromises[src];
        }
        VideoPlatformManager._scriptPromises = VideoPlatformManager._scriptPromises || {};
        VideoPlatformManager._scriptPromises[src] = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (existing.dataset.loaded === '1') { resolve(); return; }
                existing.addEventListener('load', () => resolve());
                existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)));
                return;
            }
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => { s.dataset.loaded = '1'; resolve(); };
            s.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(s);
        });
        return VideoPlatformManager._scriptPromises[src];
    }

    /**
     * Resolve once the YouTube IFrame API global (YT.Player) is available.
     * The API calls window.onYouTubeIframeAPIReady when ready; we chain any
     * existing handler so we don't clobber other consumers.
     */
    _ensureYouTubeAPI() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (VideoPlatformManager._ytReadyPromise) return VideoPlatformManager._ytReadyPromise;
        VideoPlatformManager._ytReadyPromise = new Promise((resolve, reject) => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function () {
                if (typeof prev === 'function') { try { prev(); } catch (e) {} }
                resolve();
            };
            this._loadScriptOnce('https://www.youtube.com/iframe_api').catch(reject);
        });
        return VideoPlatformManager._ytReadyPromise;
    }

    _ensureVimeoAPI() {
        if (window.Vimeo && window.Vimeo.Player) return Promise.resolve();
        return this._loadScriptOnce('https://player.vimeo.com/api/player.js');
    }

    /**
     * Load a YouTube video as an iframe embed.
     * @param {Object} video - Video object. Expects video.embedVideoId (the
     *                        YouTube 11-char ID) or falls back to video.wistiaId.
     * @param {HTMLElement} container
     * @param {Function} [onReady]
     */
    loadYouTubeVideo(video, container, onReady, onError) {
        const id = video.embedVideoId || video.wistiaId || video.id;
        container.innerHTML = '';
        container.setAttribute('data-platform', 'youtube');

        // enablejsapi=1 lets us attach a YT.Player to this iframe for
        // onError detection (private/removed/embedding-disabled). The unique
        // iframe id gives YT.Player a stable target.
        const iframe = document.createElement('iframe');
        const frameId = `yt_${Math.random().toString(36).slice(2)}`;
        iframe.id = frameId;
        const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
        const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : '';
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1&enablejsapi=1${originParam}`;
        iframe.title = video.title || 'YouTube video';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.allowFullscreen = true;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = '0';

        iframe.addEventListener('load', () => { if (onReady) onReady(iframe); });
        container.appendChild(iframe);

        // Attach the IFrame API for onError detection. YT error codes:
        //   2   — invalid video id
        //   5   — HTML5 player error
        //   100 — video not found / removed / private
        //   101 / 150 — embedding disabled by owner
        // Any of these means our friendly fallback should take over.
        this._ensureYouTubeAPI().then(() => {
            try {
                new window.YT.Player(frameId, {
                    events: {
                        onError: (e) => {
                            if (typeof onError === 'function') {
                                onError({ code: e && e.data, source: 'youtube' });
                            }
                        }
                    }
                });
            } catch (err) {
                // Player attach failed; leave the iframe in place. The watch
                // page's safety-net timeout will still cover this case.
            }
        }).catch(() => { /* API failed to load — safety-net timeout covers us */ });

        return iframe;
    }

    /**
     * Load a Vimeo video as an iframe embed. For unlisted videos the embed
     * ID may carry an `ID/HASH` shape; we split that out into the player URL.
     * @param {Object} video - Expects video.embedVideoId.
     * @param {HTMLElement} container
     * @param {Function} [onReady]
     */
    loadVimeoVideo(video, container, onReady, onError) {
        const raw = video.embedVideoId || video.wistiaId || video.id || '';
        const parts = String(raw).split('/');
        const id = parts[0];
        const hash = parts[1];
        const qs = hash ? `?h=${encodeURIComponent(hash)}` : '';

        container.innerHTML = '';
        container.setAttribute('data-platform', 'vimeo');

        const iframe = document.createElement('iframe');
        iframe.src = `https://player.vimeo.com/video/${encodeURIComponent(id)}${qs}`;
        iframe.title = video.title || 'Vimeo video';
        iframe.allow = 'autoplay; fullscreen; picture-in-picture; clipboard-write';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.allowFullscreen = true;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = '0';

        iframe.addEventListener('load', () => { if (onReady) onReady(iframe); });
        container.appendChild(iframe);

        // Attach Vimeo Player.js to detect privacy/embed errors. ready()
        // rejects when the video is private, removed, or has embedding
        // disallowed for this domain; the 'error' event fires for runtime
        // playback failures. Either should surface our friendly fallback.
        this._ensureVimeoAPI().then(() => {
            try {
                const player = new window.Vimeo.Player(iframe);
                player.ready().catch((err) => {
                    if (typeof onError === 'function') {
                        onError({ source: 'vimeo', error: err });
                    }
                });
                player.on('error', (err) => {
                    if (typeof onError === 'function') {
                        onError({ source: 'vimeo', error: err });
                    }
                });
            } catch (err) {
                // Player.js attach failed; safety-net timeout still applies.
            }
        }).catch(() => { /* API failed to load — safety-net timeout covers us */ });

        return iframe;
    }

    /**
     * Load Dropbox video using HTML5 player
     * @param {Object} video - Video object
     * @param {HTMLElement} container - Container element
     * @param {Function} onReady - Callback when ready
     */
    loadDropboxVideo(video, container, onReady) {
        // Clear container
        container.innerHTML = '';

        // Create HTML5 video element
        const videoElement = document.createElement('video');
        videoElement.id = `dropbox_${video.wistiaId}`;
        videoElement.className = 'dropbox-video-player';
        videoElement.controls = true;
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        
        // Add source
        const source = document.createElement('source');
        source.src = video.video_url;
        source.type = 'video/mp4'; // Assume MP4, could be enhanced
        
        videoElement.appendChild(source);
        
        // Add error handling
        videoElement.onerror = (e) => {
            console.error('Error loading Dropbox video:', e);
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff6666;">Error loading video. The link may have expired or the file may not be accessible.</div>';
        };

        // Add loaded callback
        videoElement.onloadedmetadata = () => {
            console.log('Dropbox video loaded:', video.title);
            if (onReady) onReady(videoElement);
        };

        container.appendChild(videoElement);
        
        // Set container attributes for styling
        container.setAttribute('data-platform', 'dropbox');
    }

    /**
     * Load Wistia video (existing functionality)
     * @param {Object} video - Video object
     * @param {HTMLElement} container - Container element
     * @param {Function} onReady - Callback when ready
     */
    loadWistiaVideo(video, container, onReady) {
        // Clear container
        container.innerHTML = `<div id="wistia_${video.wistiaId}" class="wistia_embed wistia_async_${video.wistiaId}" style="height:100%;width:100%">&nbsp;</div>`;
        
        // Set container attributes
        container.setAttribute('data-platform', 'wistia');
        
        // Ensure Wistia is loaded
        if (typeof window.Wistia === 'undefined') {
            console.log('Wistia not loaded yet, retrying...');
            setTimeout(() => this.loadWistiaVideo(video, container, onReady), 500);
            return;
        }

        // Configure Wistia player
        window._wq = window._wq || [];
        window._wq.push({
            id: video.wistiaId,
            onReady: function(wistiaVideo) {
                console.log('Wistia video ready:', video.title);
                if (onReady) onReady(wistiaVideo);
            }
        });
    }

    /**
     * Stop current video
     */
    stopCurrentVideo() {
        if (this.currentPlatform === 'dropbox') {
            const videoElement = document.querySelector('.dropbox-video-player');
            if (videoElement) {
                videoElement.pause();
                videoElement.currentTime = 0;
            }
        } else if (this.currentPlatform === 'wistia' && this.currentVideoId) {
            const wistiaVideo = window.Wistia.api(this.currentVideoId);
            if (wistiaVideo) {
                wistiaVideo.pause();
                wistiaVideo.time(0);
            }
        }
        
        this.currentPlatform = null;
        this.currentVideoId = null;
    }

    /**
     * Get thumbnail URL for a video
     * @param {Object} video - Video object
     * @returns {string} Thumbnail URL
     */
    getThumbnailUrl(video) {
        // A captured/stored frame always wins over the platform default —
        // it represents what the user actually sees in their video.
        if (video && video.thumbnailUrl) {
            return video.thumbnailUrl;
        }
        // Native uploads expose thumbnails via /api/video-thumbnail/<id>;
        // both the Express server and the Netlify function serve this path.
        if (video && video.platform === 'upload' && (video.has_thumbnail || video.hasThumbnail)) {
            return `/api/video-thumbnail/${encodeURIComponent(video.id)}`;
        }
        if (video && video.platform === 'dropbox') {
            // No frame captured (legacy entry) — fall back to a clear placeholder.
            return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"%3E%3Crect width="640" height="360" fill="%232a2a2a"/%3E%3Ctext x="320" y="180" text-anchor="middle" dy=".3em" fill="%23666" font-family="system-ui" font-size="24"%3EDropbox Video%3C/text%3E%3C/svg%3E';
        }
        // Wistia thumbnail
        return `https://embed-ssl.wistia.com/deliveries/${video.wistiaId}.jpg`;
    }

    /**
     * Extract video duration (for future enhancement)
     * @param {Object} video - Video object
     * @returns {Promise<number>} Duration in seconds
     */
    async getVideoDuration(video) {
        if (video.platform === 'dropbox') {
            // For Dropbox, we'd need to load the video metadata
            // This is an async operation
            return new Promise((resolve) => {
                const tempVideo = document.createElement('video');
                tempVideo.src = video.video_url;
                tempVideo.onloadedmetadata = () => {
                    resolve(tempVideo.duration);
                    tempVideo.remove();
                };
                tempVideo.onerror = () => {
                    resolve(0);
                    tempVideo.remove();
                };
            });
        } else {
            // For Wistia, we can get it from the API
            // This would need to be implemented based on Wistia's API
            return 0;
        }
    }
}

// Export for use in other scripts
window.VideoPlatformManager = VideoPlatformManager;
