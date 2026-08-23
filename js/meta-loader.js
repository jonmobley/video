(function() {
    var el = document.currentScript || document.querySelector('script[data-page]');
    var match = window.location.pathname.match(/^\/show\/([a-z0-9-]+)$/i);
    var page = match ? match[1].toLowerCase() : (el ? el.getAttribute('data-page') : null);
    if (!page) return;

    (async function() {
        try {
            var response = await fetch('/.netlify/functions/get-page-config?page=' + page);
            if (response.ok) {
                var config = await response.json();

                if (config.page_title) {
                    document.title = config.page_title;
                }

                var metaDesc = document.querySelector('meta[name="description"]');
                if (config.meta_description && metaDesc) {
                    metaDesc.content = config.meta_description;
                }

                var metaKeywords = document.querySelector('meta[name="keywords"]');
                if (config.meta_keywords && metaKeywords) {
                    metaKeywords.content = config.meta_keywords;
                }

                var ogTitle = document.querySelector('meta[property="og:title"]');
                if (config.og_title && ogTitle) {
                    ogTitle.content = config.og_title;
                }
                var ogDesc = document.querySelector('meta[property="og:description"]');
                if (config.og_description && ogDesc) {
                    ogDesc.content = config.og_description;
                }
                if (config.og_image_url) {
                    var ogImage = document.querySelector('meta[property="og:image"]');
                    if (ogImage) {
                        ogImage.content = config.og_image_url.startsWith('http')
                            ? config.og_image_url
                            : 'https://vidsharepro.netlify.app' + config.og_image_url;
                    }
                }

                var twitterTitle = config.twitter_title || config.og_title;
                var twitterDescription = config.twitter_description || config.og_description;

                var twTitle = document.querySelector('meta[property="twitter:title"]');
                if (twitterTitle && twTitle) {
                    twTitle.content = twitterTitle;
                }
                var twDesc = document.querySelector('meta[property="twitter:description"]');
                if (twitterDescription && twDesc) {
                    twDesc.content = twitterDescription;
                }
                if (config.og_image_url) {
                    var twitterImage = document.querySelector('meta[property="twitter:image"]');
                    if (twitterImage) {
                        twitterImage.content = config.og_image_url.startsWith('http')
                            ? config.og_image_url
                            : 'https://vidsharepro.netlify.app' + config.og_image_url;
                    }
                }

                var canonicalLink = document.getElementById('canonical-link');
                if (config.canonical_url && canonicalLink) {
                    canonicalLink.href = config.canonical_url;
                }
            }
        } catch (error) {
            console.error('Failed to load page configuration:', error);
        }
    })();
})();
