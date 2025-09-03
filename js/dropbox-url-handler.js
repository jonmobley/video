/**
 * Dropbox URL Handler
 * Converts public Dropbox sharing URLs to direct streaming URLs
 */

class DropboxURLHandler {
    /**
     * Convert a Dropbox sharing URL to a direct streaming URL
     * 
     * Dropbox URL formats:
     * - Share link: https://www.dropbox.com/s/XXXXX/filename.mp4?dl=0
     * - Scl link: https://www.dropbox.com/scl/fi/XXXXX/filename.mp4?rlkey=XXXXX&dl=0
     * 
     * Direct link format (for streaming):
     * - Changes dl=0 to raw=1
     * - Or changes www.dropbox.com to dl.dropboxusercontent.com
     * 
     * @param {string} url - Dropbox sharing URL
     * @returns {Object} Object with directUrl and metadata
     */
    static convertToDirectUrl(url) {
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL provided');
        }

        // Check if it's a Dropbox URL
        if (!url.includes('dropbox.com')) {
            throw new Error('Not a Dropbox URL');
        }

        let directUrl = url;
        let filename = 'Untitled Video';

        try {
            // Extract filename from URL
            const urlParts = url.split('/');
            const filenamePart = urlParts[urlParts.length - 1];
            if (filenamePart) {
                // Remove query parameters and decode
                filename = decodeURIComponent(filenamePart.split('?')[0]);
            }

            // Method 1: Replace dl=0 with raw=1 for direct streaming
            if (url.includes('?dl=0') || url.includes('&dl=0')) {
                directUrl = url.replace('dl=0', 'raw=1');
            } 
            // Method 2: Replace domain for older style links
            else if (url.includes('www.dropbox.com')) {
                directUrl = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
                // Ensure raw=1 is in the URL
                if (!directUrl.includes('raw=1')) {
                    const separator = directUrl.includes('?') ? '&' : '?';
                    directUrl += separator + 'raw=1';
                }
            }

            // Ensure the URL uses HTTPS
            directUrl = directUrl.replace('http://', 'https://');

        } catch (error) {
            console.error('Error converting Dropbox URL:', error);
            // Return original URL if conversion fails
            directUrl = url;
        }

        return {
            directUrl: directUrl,
            filename: filename,
            title: filename.replace(/\.[^/.]+$/, ''), // Remove file extension
            originalUrl: url
        };
    }

    /**
     * Validate if a URL is a supported video format
     * @param {string} url - URL to validate
     * @returns {boolean} True if supported video format
     */
    static isSupportedVideoFormat(url) {
        const supportedExtensions = ['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv'];
        const lowercaseUrl = url.toLowerCase();
        return supportedExtensions.some(ext => lowercaseUrl.includes(ext));
    }

    /**
     * Extract video metadata from Dropbox URL
     * @param {string} url - Dropbox URL
     * @returns {Object} Video metadata object
     */
    static extractMetadata(url) {
        const converted = this.convertToDirectUrl(url);
        
        // Generate a unique ID for this video
        const videoId = 'dropbox_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        return {
            id: videoId,
            wistiaId: videoId, // For compatibility with existing code
            platform: 'dropbox',
            title: converted.title,
            video_url: converted.directUrl,
            originalUrl: converted.originalUrl,
            filename: converted.filename,
            category: 'all',
            tags: [],
            order: 0
        };
    }

    /**
     * Test if a Dropbox URL is accessible
     * @param {string} url - Direct Dropbox URL
     * @returns {Promise<boolean>} True if accessible
     */
    static async testUrl(url) {
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'cors'
            });
            return response.ok;
        } catch (error) {
            console.error('Error testing Dropbox URL:', error);
            return false;
        }
    }

    /**
     * Create a video element to test playback and extract duration
     * @param {string} url - Direct video URL
     * @returns {Promise<Object>} Object with duration and thumbnail
     */
    static async getVideoInfo(url) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.src = url;
            video.muted = true;
            
            const timeout = setTimeout(() => {
                video.remove();
                resolve({ duration: 0, thumbnail: null, error: 'Timeout loading video' });
            }, 10000); // 10 second timeout

            video.onloadedmetadata = () => {
                clearTimeout(timeout);
                
                // Get duration
                const duration = video.duration;
                
                // Try to generate thumbnail
                video.currentTime = Math.min(2, duration / 10); // Seek to 10% or 2 seconds
            };

            video.onseeked = () => {
                try {
                    // Create canvas for thumbnail
                    const canvas = document.createElement('canvas');
                    canvas.width = 640;
                    canvas.height = 360;
                    const ctx = canvas.getContext('2d');
                    
                    // Calculate dimensions to maintain aspect ratio
                    const videoRatio = video.videoWidth / video.videoHeight;
                    const canvasRatio = canvas.width / canvas.height;
                    let drawWidth = canvas.width;
                    let drawHeight = canvas.height;
                    
                    if (videoRatio > canvasRatio) {
                        drawHeight = canvas.width / videoRatio;
                    } else {
                        drawWidth = canvas.height * videoRatio;
                    }
                    
                    const x = (canvas.width - drawWidth) / 2;
                    const y = (canvas.height - drawHeight) / 2;
                    
                    ctx.drawImage(video, x, y, drawWidth, drawHeight);
                    
                    const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
                    
                    clearTimeout(timeout);
                    video.remove();
                    
                    resolve({
                        duration: video.duration,
                        thumbnail: thumbnail,
                        width: video.videoWidth,
                        height: video.videoHeight
                    });
                } catch (error) {
                    clearTimeout(timeout);
                    video.remove();
                    resolve({
                        duration: video.duration,
                        thumbnail: null,
                        error: 'Could not generate thumbnail'
                    });
                }
            };

            video.onerror = () => {
                clearTimeout(timeout);
                video.remove();
                resolve({ duration: 0, thumbnail: null, error: 'Failed to load video' });
            };
        });
    }
}

// Export for use
window.DropboxURLHandler = DropboxURLHandler;
