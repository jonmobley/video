function loadWistiaVideo(wistiaId, title) {
    var videoContainer = document.getElementById('wistia-player');
    var modal = document.getElementById('video-modal');

    videoContainer.innerHTML = '';

    videoContainer.innerHTML = '<div id="wistia_' + wistiaId + '" class="wistia_embed wistia_async_' + wistiaId + '" style="height:100%;width:100%">&nbsp;</div>';

    modal.classList.add('active');

    document.querySelectorAll('.video-item').forEach(function(item) { item.classList.remove('active'); });
    var activeEl = document.querySelector('[data-wistia="' + wistiaId + '"]');
    if (activeEl) activeEl.classList.add('active');

    if (window.Wistia) {
        window.Wistia.api(wistiaId, function(video) {
            console.log('Wistia video ready:', wistiaId);
        });
    }
}

function closeVideo() {
    var modal = document.getElementById('video-modal');
    var videoContainer = document.getElementById('wistia-player');

    modal.classList.remove('active');

    videoContainer.innerHTML = '';

    document.querySelectorAll('.video-item').forEach(function(item) { item.classList.remove('active'); });
}

function attachVideoListeners() {
    document.querySelectorAll('.video-item').forEach(function(item) {
        item.addEventListener('click', function() {
            loadWistiaVideo(item.dataset.wistia, item.dataset.title);
        });
    });
}

function attachTagListeners() {
    document.querySelectorAll('.tag').forEach(function(tag) {
        tag.addEventListener('click', function() {
            document.querySelectorAll('.tag').forEach(function(t) { t.classList.remove('active'); });
            tag.classList.add('active');

            var category = tag.dataset.category;
            document.querySelectorAll('.video-item').forEach(function(item) {
                if (category === 'all' || item.dataset.category === category) {
                    item.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                }
            });
        });
    });
}

document.addEventListener('click', function(e) {
    var modal = document.getElementById('video-modal');
    if (e.target === modal) {
        closeVideo();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeVideo();
    }
});

var closeBtn = document.querySelector('.video-close');
if (closeBtn) {
    closeBtn.addEventListener('click', function() {
        closeVideo();
    });
}

document.addEventListener('DOMContentLoaded', function() {
    attachVideoListeners();
    attachTagListeners();
});
