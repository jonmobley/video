(function() {
    const DEFAULT_PRESENTATION = Object.freeze({
        template_key: 'gallery',
        empty_state_enabled: false,
        force_empty_state: false,
        empty_state_label: 'Video coming soon',
        empty_state_placeholder_count: 0,
        empty_state_fallback_image_url: '/assets/og-image.png',
        background_image_url: null,
        background_position: 'center center',
        background_opacity: 0,
        background_blur: 0,
        mobile_background_opacity: 0,
        footer_theme: 'dark',
        category_all_label: 'All',
        tag_all_label: 'All',
        choreography_by_song: {}
    });

    function normalizePresentation(value) {
        const input = value && typeof value === 'object' ? value : {};
        return {
            ...DEFAULT_PRESENTATION,
            ...input,
            choreography_by_song: input.choreography_by_song && typeof input.choreography_by_song === 'object'
                ? input.choreography_by_song
                : {}
        };
    }

    function applyPresentation(value) {
        const presentation = normalizePresentation(value);
        const body = document.body;
        const root = document.documentElement;
        const hasBackground = Boolean(presentation.background_image_url);

        body.classList.toggle('page-template-has-background', hasBackground);
        body.classList.toggle('page-template-light-footer', presentation.footer_theme === 'light');
        root.style.setProperty('--page-background-image', hasBackground
            ? `url("${presentation.background_image_url.replace(/"/g, '%22')}")`
            : 'none');
        root.style.setProperty('--page-background-position', presentation.background_position);
        root.style.setProperty('--page-background-opacity', String(presentation.background_opacity));
        root.style.setProperty('--page-background-blur', `${presentation.background_blur}px`);
        root.style.setProperty('--page-mobile-background-opacity', String(presentation.mobile_background_opacity));

        return presentation;
    }

    function renderEmptyPlayer(imageUrl, label) {
        const player = document.getElementById('wistia-player');
        const container = document.querySelector('.video-container');
        if (!player || !container) return;

        container.classList.add('page-template-coming-soon');
        container.classList.add('active');
        player.innerHTML = `
            <div class="coming-soon-player-card" role="img" aria-label="${escapeHtml(label || 'Videos coming soon')}">
                <img data-coming-soon-image alt="${escapeHtml(label || 'Coming soon')}">
            </div>
        `;
        if (imageUrl) {
            player.querySelector('[data-coming-soon-image]').src = imageUrl;
        }
    }

    function clearEmptyPlayer() {
        const container = document.querySelector('.video-container');
        const player = document.getElementById('wistia-player');
        if (container) {
            container.classList.remove('page-template-coming-soon', 'active');
        }
        if (player) {
            player.innerHTML = `
                <div class="video-placeholder video-placeholder-state">
                    <div class="video-placeholder-inner"><div>Loading video player...</div></div>
                </div>
            `;
        }
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    window.PageTemplate = {
        getDefaultPresentation: () => normalizePresentation(),
        normalizePresentation,
        applyPresentation,
        renderEmptyPlayer,
        clearEmptyPlayer
    };
})();