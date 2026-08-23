async function loadPageConfig(pageName, options) {
    var opts = options || {};
    var defaultAccentColor = opts.defaultAccentColor || null;
    var onTitleLoaded = opts.onTitleLoaded || null;
    var onTitleMissing = opts.onTitleMissing || null;
    var onComingSoonImageLoaded = opts.onComingSoonImageLoaded || null;
    var onPresentationLoaded = opts.onPresentationLoaded || null;
    var fetchFn = opts.fetchFn || null;
    var debug = opts.debug || false;

    var url = '/.netlify/functions/get-page-config?page=' + pageName;

    try {
        var config;

        if (fetchFn) {
            config = await fetchFn(url);
        } else {
            var response = await fetch(url);
            if (!response.ok) {
                if (defaultAccentColor) applyAccentColor(defaultAccentColor);
                if (onTitleMissing) onTitleMissing();
                if (onComingSoonImageLoaded) onComingSoonImageLoaded(null);
                if (onPresentationLoaded) onPresentationLoaded(null);
                return;
            }
            config = await response.json();
        }

        if (debug) console.log('🎨 DEBUG: Loaded page config:', config);

        var accentColor = config.accent_color || defaultAccentColor;
        if (accentColor) {
            if (debug) console.log('🎨 DEBUG: Setting accent color to:', accentColor);
            applyAccentColor(accentColor);
        }

        if (config.page_title) {
            document.getElementById('pageTitle').textContent = config.page_title;
            if (onTitleLoaded) onTitleLoaded(config.page_title);
        } else if (onTitleMissing) {
            onTitleMissing();
        }

        if (onComingSoonImageLoaded) {
            onComingSoonImageLoaded(config.coming_soon_image_url || null);
        }
        if (onPresentationLoaded) {
            onPresentationLoaded(config.presentation || null);
        }
    } catch (error) {
        console.error('Failed to load page config:', error);
        if (defaultAccentColor) {
            if (debug) console.log('🎨 DEBUG: Server unreachable, using default accent color');
            applyAccentColor(defaultAccentColor);
        }
        if (onTitleMissing) onTitleMissing();
        if (onComingSoonImageLoaded) onComingSoonImageLoaded(null);
        if (onPresentationLoaded) onPresentationLoaded(null);
    }
}
