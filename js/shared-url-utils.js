var videoUrlMappings = {};

function updateBrowserUrl(wistiaId) {
    var video = videoUrlMappings[wistiaId];
    if (video && video.urlString) {
        var newUrl = window.location.pathname + '#' + video.urlString;
        window.history.replaceState(null, '', newUrl);
    }
}

function clearBrowserUrl() {
    var newUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', newUrl);
}

function buildVideoUrlMappings(videos) {
    videoUrlMappings = {};

    videos.forEach(function(video) {
        if (video.urlString) {
            videoUrlMappings[video.wistiaId] = video;
            videoUrlMappings[video.urlString] = video;
        }
    });

    console.log('🔗 Built video URL mappings:', Object.keys(videoUrlMappings).length / 2, 'videos');
}

function checkForDirectVideoLink() {
    var hash = window.location.hash.substring(1);
    if (hash) {
        var video = videoUrlMappings[hash];
        if (video && video.wistiaId) {
            console.log('🔗 Direct link detected, loading video:', video.title);
            setTimeout(function() {
                loadWistiaVideo(video.wistiaId, video.title);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 100);
        }
    }
}

window.addEventListener('hashchange', function() {
    checkForDirectVideoLink();
});
