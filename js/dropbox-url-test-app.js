async function testDropboxUrl() {
    const input = document.getElementById('dropbox-url');
    const url = input.value.trim();
    
    if (!url) {
        showStatus('error', 'Please enter a Dropbox URL');
        return;
    }
    
    showStatus('info', 'Processing URL...<span class="loading"></span>');
    
    try {
        var converted = DropboxURLHandler.convertToDirectUrl(url);
        console.log('Converted:', converted);
        
        document.getElementById('url-info').style.display = 'block';
        document.getElementById('original-url').textContent = converted.originalUrl;
        document.getElementById('direct-url').textContent = converted.directUrl;
        document.getElementById('filename').textContent = converted.filename;
        document.getElementById('title').textContent = converted.title;
        
        if (!DropboxURLHandler.isSupportedVideoFormat(url)) {
            showStatus('error', 'Warning: This may not be a supported video format');
        }
        
        var metadata = DropboxURLHandler.extractMetadata(url);
        console.log('Metadata:', metadata);
        
        var videoSection = document.getElementById('video-section');
        var video = document.getElementById('test-video');
        
        videoSection.style.display = 'block';
        video.src = converted.directUrl;
        
        video.onloadedmetadata = async function() {
            showStatus('success', 'Video loaded successfully!');
            
            document.getElementById('video-info').style.display = 'block';
            document.getElementById('video-duration').textContent = formatDuration(video.duration);
            document.getElementById('video-resolution').textContent = video.videoWidth + ' \u00d7 ' + video.videoHeight;
            document.getElementById('video-id').textContent = metadata.id;
            
            showStatus('info', 'Generating thumbnail...<span class="loading"></span>');
            var videoInfo = await DropboxURLHandler.getVideoInfo(converted.directUrl);
            
            if (videoInfo.thumbnail) {
                document.getElementById('thumbnail-preview').style.display = 'block';
                document.getElementById('thumbnail-img').src = videoInfo.thumbnail;
                showStatus('success', 'Video loaded and thumbnail generated successfully!');
            } else {
                showStatus('success', 'Video loaded successfully! (Thumbnail generation failed)');
            }
        };
        
        video.onerror = function(e) {
            console.error('Video error:', e);
            showStatus('error', 'Failed to load video. The URL may be invalid or the video may not be publicly accessible.');
        };
        
    } catch (error) {
        console.error('Error:', error);
        showStatus('error', error.message || 'Failed to process URL');
    }
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return 'Unknown';
    
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return hours + ':' + minutes.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
    } else {
        return minutes + ':' + secs.toString().padStart(2, '0');
    }
}

function showStatus(type, message) {
    var statusEl = document.getElementById('status-message');
    statusEl.className = 'status ' + type;
    statusEl.innerHTML = message;
    statusEl.style.display = 'block';
}

document.getElementById('test-url-btn').addEventListener('click', testDropboxUrl);

document.getElementById('dropbox-url').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        testDropboxUrl();
    }
});
