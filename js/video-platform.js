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
    loadVideo(video, container, onReady = null) {
        this.currentPlatform = video.platform || 'wistia';
        this.currentVideoId = video.wistiaId || video.id;

        if (this.currentPlatform === 'dropbox') {
            this.loadDropboxVideo(video, container, onReady);
        } else {
            this.loadWistiaVideo(video, container, onReady);
        }
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
        if (video.platform === 'dropbox') {
            // For Dropbox, we might not have a thumbnail
            // Could potentially generate one using video element
            return video.thumbnailUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"%3E%3Crect width="640" height="360" fill="%232a2a2a"/%3E%3Ctext x="320" y="180" text-anchor="middle" dy=".3em" fill="%23666" font-family="system-ui" font-size="24"%3EDropbox Video%3C/text%3E%3C/svg%3E';
        } else {
            // Wistia thumbnail
            return `https://embed-ssl.wistia.com/deliveries/${video.wistiaId}.jpg`;
        }
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
