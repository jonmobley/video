function detectVideoPlatform(url) {
    if (!url) return null;

    if (url.includes('wistia.com') || url.includes('wistia.net') || url.includes('wi.st')) {
        return 'wistia';
    }

    if (url.includes('vimeo.com') || url.includes('player.vimeo.com')) {
        return 'vimeo';
    }

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return 'youtube';
    }

    if (url.includes('dropbox.com') || url.includes('dl.dropboxusercontent.com')) {
        return 'dropbox';
    }

    return null;
}

function extractVideoId(url, platform) {
    var videoId = null;

    switch (platform) {
        case 'wistia':
            var wistiaMatch = url.match(/medias?\/([a-zA-Z0-9]+)/);
            videoId = wistiaMatch ? wistiaMatch[1] : null;
            break;

        case 'vimeo':
            var vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
            videoId = vimeoMatch ? vimeoMatch[1] : null;
            break;

        case 'youtube':
            var ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
            videoId = ytMatch ? ytMatch[1] : null;
            break;

        case 'dropbox':
            videoId = 'dropbox_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            break;
    }

    return videoId;
}

function getThumbnailUrl(videoUrl, platform, videoId) {
    switch (platform) {
        case 'wistia':
            return 'https://embed-ssl.wistia.com/deliveries/' + videoId + '.jpg';

        case 'vimeo':
            return 'https://vumbnail.com/' + videoId + '.jpg';

        case 'youtube':
            return 'https://img.youtube.com/vi/' + videoId + '/sddefault.jpg';

        case 'dropbox':
            return null;

        default:
            return null;
    }
}
