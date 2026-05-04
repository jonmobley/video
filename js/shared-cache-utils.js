var METADATA_CACHE_DURATION = 24 * 60 * 60 * 1000;

function getCachedMetadata(wistiaId) {
    var cacheKey = 'wistia_' + wistiaId;
    try {
        var cached = localStorage.getItem(cacheKey);
        if (cached) {
            var data = JSON.parse(cached);
            var now = Date.now();
            if (now - data.timestamp < METADATA_CACHE_DURATION) {
                return data.metadata;
            } else {
                localStorage.removeItem(cacheKey);
            }
        }
    } catch (error) {
        console.warn('Cache read error:', error);
    }
    return null;
}

function setCachedMetadata(wistiaId, metadata) {
    var cacheKey = 'wistia_' + wistiaId;
    try {
        var cacheData = {
            metadata: metadata,
            timestamp: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
        console.warn('Cache write error:', error);
    }
}

function getOptimizedThumbnailUrl(url) {
    if (url && url.includes('embed-ssl.wistia.com')) {
        return url.replace('image.png', 'image.png?image_resize=640');
    }
    return url;
}

var defaultCacheOptions = {
    getCached: getCachedMetadata,
    setCached: setCachedMetadata,
    transformUrl: getOptimizedThumbnailUrl
};
