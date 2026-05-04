function setThumbnailFallback(wistiaId) {
    var thumbElement = document.getElementById('thumb-' + wistiaId);
    if (thumbElement) {
        var img = thumbElement.querySelector('img');
        if (img) {
            img.style.display = 'none';
        }
        thumbElement.style.background = 'linear-gradient(135deg, #2a2a2a, #1a1a1a)';
    }
}

function loadWistiaThumbnail(wistiaId) {
    fetch('https://fast.wistia.com/oembed?url=https://videosharepro.wistia.com/medias/' + wistiaId + '&format=json')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.thumbnail_url) {
                var thumbElement = document.getElementById('thumb-' + wistiaId);
                if (thumbElement) {
                    var img = thumbElement.querySelector('img');
                    if (img) {
                        img.src = data.thumbnail_url;
                        img.style.display = 'block';
                    }
                }
            } else {
                setThumbnailFallback(wistiaId);
            }
        })
        .catch(function(error) {
            console.log('Failed to load thumbnail for', wistiaId, error);
            setThumbnailFallback(wistiaId);
        });
}

function loadVideoDuration(wistiaId) {
    var thumbnailDurationElement = document.getElementById('thumb-duration-' + wistiaId);

    if (!thumbnailDurationElement) {
        return;
    }

    var apiUrls = [
        'https://fast.wistia.com/oembed?url=https://videosharepro.wistia.com/medias/' + wistiaId + '&format=json',
        'https://fast.wistia.com/oembed?url=https://home.wistia.com/medias/' + wistiaId + '&format=json',
        'https://fast.wistia.com/oembed?url=https://app.wistia.com/medias/' + wistiaId + '&format=json'
    ];

    (async function() {
        var durationFound = false;

        for (var i = 0; i < apiUrls.length; i++) {
            try {
                var response = await fetch(apiUrls[i]);
                if (!response.ok) continue;

                var data = await response.json();
                if (data.duration && data.duration > 0) {
                    var minutes = Math.floor(data.duration / 60);
                    var seconds = Math.floor(data.duration % 60);
                    thumbnailDurationElement.textContent = minutes + ':' + seconds.toString().padStart(2, '0');
                    thumbnailDurationElement.classList.remove('placeholder');
                    durationFound = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!durationFound) {
            thumbnailDurationElement.textContent = '--:--';
            thumbnailDurationElement.classList.add('placeholder');
        }
    })();
}

function fixOrphanedWords() {
    document.querySelectorAll('.item-title').forEach(function(titleElement) {
        var originalText = titleElement.textContent.trim();
        var words = originalText.split(/\s+/);

        if (words.length <= 2) return;

        var lastWord = words[words.length - 1];
        if (lastWord.length <= 2) {
            var newLastLine = words.slice(-2).join(' ');
            var firstLine = words.slice(0, -2).join(' ');
            var fixedText = firstLine + ' ' + newLastLine.replace(' ', '\u00A0');
            titleElement.innerHTML = fixedText;
        }
    });
}
