        // ===== GLOBAL VARIABLES AND CONFIGURATION =====
        const routeShowSlug = window.location.pathname.match(/^\/show\/([a-z0-9-]+)$/i);
        const pageKey = (routeShowSlug && routeShowSlug[1].toLowerCase()) ||
            document.body.dataset.pageKey || 'oz';
        const pageCacheKey = (key) => `${key}_${pageKey}`;
        const pageApiUrl = (endpoint) => `/api/${endpoint}?page=${encodeURIComponent(pageKey)}`;
        const DEFAULT_COMING_SOON_IMAGE = '/assets/og-image.png';
        let comingSoonImageUrl = DEFAULT_COMING_SOON_IMAGE;
        let hasConfiguredComingSoonImage = false;
        let pagePresentation = window.PageTemplate
            ? window.PageTemplate.getDefaultPresentation()
            : { empty_state_enabled: false, force_empty_state: false, choreography_by_song: {} };
        let currentWistiaVideo = null;
        const videoContainer = document.getElementById('wistia-player');

        // Track currently playing video for proper cleanup
        let currentlyPlayingVideoId = null;

        
        // Available category icons for admin interface
        const availableIcons = {
            'music-note': '♪',
            'star': '★',
            'heart': '♥',
            'diamond': '♦',
            'club': '♣',
            'spade': '♠'
        };
        
        // Category management arrays
        let categories = [];
        
        // Global videos array - populated from server
        let videos = [];

        function escapeHtml(value) {
            return String(value ?? '').replace(/[&<>"']/g, character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[character]));
        }

        function escapeAttribute(value) {
            return escapeHtml(value);
        }

        function hasConfiguredChoreography() {
            return Object.keys(pagePresentation.choreography_by_song || {}).length > 0;
        }

        function shouldShowEmptyState() {
            return pagePresentation.force_empty_state === true ||
                (pagePresentation.empty_state_enabled === true && videos.length === 0);
        }

        function getComingSoonFallbackImage() {
            return pagePresentation.empty_state_fallback_image_url || DEFAULT_COMING_SOON_IMAGE;
        }

        function syncPageTemplateState() {
            const isEmpty = shouldShowEmptyState();
            document.body.classList.toggle('page-empty-state', isEmpty);

            if (isEmpty && window.PageTemplate) {
                window.PageTemplate.renderEmptyPlayer(
                    comingSoonImageUrl || getComingSoonFallbackImage(),
                    pagePresentation.empty_state_label
                );
            } else if (window.PageTemplate) {
                window.PageTemplate.clearEmptyPlayer();
            }
        }

        // ===== VIDEO PLAYER MANAGEMENT FUNCTIONS =====
        
        /**
         * Sets the active video in the grid and updates URL
         * @param {string} wistiaId - The Wistia video ID
         */
        function setActiveVideo(wistiaId) {
            // Remove active class from all videos
            document.querySelectorAll('.video-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Add active class to current video
            if (wistiaId) {
                const activeVideo = document.querySelector(`[data-wistia="${wistiaId}"]`);
                if (activeVideo) {
                    activeVideo.classList.add('active');
                }
                currentlyPlayingVideoId = wistiaId;
                // Add video-active class to body for mobile layout positioning
                document.body.classList.add('video-active');
                
                // Update browser URL with video's unique string
                updateBrowserUrl(wistiaId);
            } else {
                currentlyPlayingVideoId = null;
                // Remove video-active class from body
                document.body.classList.remove('video-active');
                
                // Clear URL hash when no video is playing
                clearBrowserUrl();
            }
        }

        // Function to update category dropdown with icons
        // ===== CATEGORY AND FILTERING FUNCTIONS =====
        
        /**
         * Updates the category dropdown with available categories
         * @param {Array} categoriesData - Optional categories data
         */
        function updateCategoryDropdown(categoriesData = null) {
            const dropdown = document.getElementById('categoriesDropdown');
            if (!dropdown) return;
            
            dropdown.innerHTML = '';
            
            // Get categories from server first, then fall back to predefined
            let categoriesToShow = [];
            
            if (window.serverCategories && window.serverCategories.length > 0) {
                // Use server categories
                categoriesToShow = window.serverCategories;
            } else {
                // Fall back to predefined categories
                categoriesToShow = predefinedCategories;
            }
            
            // Build dropdown from categories and user preferences
            categoriesToShow.forEach(category => {
                // Check if this category should be shown in dropdown
                let showInDropdown = category.showInDropdown !== undefined ? category.showInDropdown : true;
                
                // Override with user preference if available
                if (categoryPreferences.categories && categoryPreferences.categories[category.id]) {
                    showInDropdown = categoryPreferences.categories[category.id].showInDropdown !== undefined 
                        ? categoryPreferences.categories[category.id].showInDropdown 
                        : true;
                }
                
                if (showInDropdown) {
                    const option = document.createElement('option');
                    option.value = category.id;

                    // Add icon if available
                    const icon = category.icon && availableIcons[category.icon] ? availableIcons[category.icon] + ' ' : '';
                    option.textContent = icon + category.name;
                    option.setAttribute('data-icon', category.icon || '');
                    
                    // Set as selected if it's the default "All Dance Videos"
                    if (category.id === 'all-songs') {
                        option.selected = true;
                    }
                    
                    // Disable if it's a "More Coming Soon" type option
                    if (/more|coming|soon/i.test(category.name)) {
                        option.disabled = true;
                    }
                    
                    dropdown.appendChild(option);
                }
            });
            
            // Add any additional categories from loaded videos (same logic as edit popup)
            if (window.loadedVideos && window.loadedVideos.length > 0) {
                const additionalCategories = new Set();
                
                // Collect unique categories from loaded videos
                window.loadedVideos.forEach(video => {
                    if (video.category && video.category !== 'all-songs') {
                        // Check if it's not already in predefined categories
                        const isPredefined = predefinedCategories.some(pred => pred.id === video.category);
                        const isServerCategory = window.serverCategories && window.serverCategories.some(srv => srv.id === video.category);
                        
                        if (!isPredefined && !isServerCategory) {
                            additionalCategories.add(video.category);
                        }
                    }
                });
                
                // Add additional categories to dropdown
                additionalCategories.forEach(categoryId => {
                    const option = document.createElement('option');
                    option.value = categoryId;
                    option.textContent = categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
                    dropdown.appendChild(option);
                });
            }
            
            // Add any additional categories from video data (future enhancement)
            if (categoriesData && categoriesData.length > 0) {
                categoriesData.forEach(category => {
                    // Only add if not already in categories to show
                    const isAlreadyAdded = categoriesToShow.some(cat => cat.id === category.id);
                    if (!isAlreadyAdded && category.showInDropdown) {
                        const option = document.createElement('option');
                        option.value = category.id;
                        const icon = category.icon && availableIcons[category.icon] ? availableIcons[category.icon] + ' ' : '';
                        option.textContent = icon + category.name;
                        option.setAttribute('data-icon', category.icon || '');
                        dropdown.appendChild(option);
                    }
                });
            }
            
            // Add change event listener to handle category filtering
            dropdown.removeEventListener('change', handleCategoryDropdownChange); // Remove existing listener if any
            dropdown.addEventListener('change', handleCategoryDropdownChange);
        }
        
        // Category dropdown removed - no longer needed
        
        // Category navigation removed - no longer needed

        // Function to get icon HTML for admin interface
        function getIconHtml(iconKey) {
            return iconKey && availableIcons[iconKey] ? availableIcons[iconKey] : '';
        }





        function stopVideoAndClosePlayer() {
            console.log('🛑 Stopping video and closing player');
            
            // Stop the current Wistia video if it exists
            if (window.Wistia && currentlyPlayingVideoId) {
                const video = window.Wistia.api(`wistia_${currentlyPlayingVideoId}`);
                if (video) {
                    console.log('⏹️ Pausing and resetting video:', currentlyPlayingVideoId);
                    video.pause();
                    video.time(0); // Reset to beginning
                } else {
                    console.log('⚠️ Video API not found for:', currentlyPlayingVideoId);
                }
            }
            
            // Clear current video reference
            currentWistiaVideo = null;
            
            // Hide the video container with smooth animation
            const videoContainerElement = document.querySelector('.video-container');
            videoContainerElement.classList.remove('active');
            
            // Wait for animation to complete before clearing content
            setTimeout(() => {
                // Clear the video container content
                const videoContainer = document.getElementById('wistia-player');
                videoContainer.innerHTML = `
                    <div class="video-placeholder video-placeholder-state">
                        <div class="video-placeholder-inner">
                            <div>Loading video player...</div>
                        </div>
                    </div>
                `;
                
                // Clear title overlay
                const titleElement = document.getElementById('current-video-title');
                if (titleElement) {
                    titleElement.textContent = '';
                }
                
                // Clear mobile title
                const mobileTitleElement = document.getElementById('mobile-video-title');
                if (mobileTitleElement) {
                    mobileTitleElement.textContent = '';
                }
            }, 200); // Wait for half of the animation duration
            
            // Clear active video state immediately
            setActiveVideo(null);
        }

        // Reset page to default state (called when clicking page title)
        function resetToDefault() {
            if (isEditMode) return; // Don't reset in edit mode
            
            console.log('Resetting page to default state');
            
            // Stop video and close player
            stopVideoAndClosePlayer();
            
            // Show all videos (they're all shown by default now)
            const videoItems = document.querySelectorAll('.video-item');
            videoItems.forEach(item => {
                item.classList.remove('hidden');
            });
        }

        // Load Wistia video
        function loadWistiaVideo(wistiaId, title) {
            console.log('🎬 Loading Wistia video:', wistiaId, title);
            
            // Show video container
            const videoContainerElement = document.querySelector('.video-container');
            videoContainerElement.classList.add('active');
            
            // Show loading state with better UX
            videoContainer.innerHTML = `
                <div class="video-loading-state video-placeholder-state">
                    <div class="video-placeholder-inner">
                        <div class="video-loading-title">Loading "${title}"</div>
                        <div class="video-loading-spinner"></div>
                    </div>
                </div>
            `;
            
            // Update video title immediately for better perceived performance
            const titleElement = document.getElementById('current-video-title');
            if (titleElement) {
                titleElement.textContent = title;
            }
            
            // Update mobile title
            const mobileTitleElement = document.getElementById('mobile-video-title');
            if (mobileTitleElement) {
                mobileTitleElement.textContent = title;
            }
            
            // Set active video state
            setActiveVideo(wistiaId);
            
            // Ensure Wistia script is loaded with better error handling
            if (typeof window.Wistia === 'undefined') {
                console.log('⏳ Wistia not loaded yet, waiting...');
                // Add timeout counter to prevent infinite retries
                const retryCount = loadWistiaVideo.retryCount || 0;
                if (retryCount < 10) { // Max 5 seconds of retries
                    loadWistiaVideo.retryCount = retryCount + 1;
                    setTimeout(() => loadWistiaVideo(wistiaId, title), 500);
                    return;
                } else {
                    // Show error state after max retries
                    console.error('❌ Failed to load Wistia after multiple attempts');
                    videoContainer.innerHTML = `
                        <div class="video-error-state">
                            <div class="video-placeholder-inner">
                                <div class="video-error-title">⚠️ Video Loading Error</div>
                                <div class="video-error-sub">Unable to load video player. Please refresh the page.</div>
                                <button data-action="reload-page" class="video-error-btn">Refresh Page</button>
                            </div>
                        </div>
                    `;
                    return;
                }
            }
            
            // Reset retry counter on successful load
            loadWistiaVideo.retryCount = 0;
            
            // Create the Wistia embed element
            setTimeout(() => {
                videoContainer.innerHTML = `<div id="wistia_${wistiaId}" class="wistia_embed wistia_async_${wistiaId} wistia-embed-full">&nbsp;</div>`;
            }, 100); // Small delay to show loading state briefly
            
            window._wq = window._wq || [];
            _wq.push({
                id: wistiaId,
                options: {
                    responsive: true,
                    // Let Wistia use the video's configured settings
                    // autoPlay, controls, etc. will be based on Wistia dashboard settings
                },
                onReady: function(video) {
                    console.log('✅ Wistia video ready:', wistiaId, title);
                    currentWistiaVideo = video;
                    
                    // Clear any loading states
                    const loadingElement = videoContainer.querySelector('.video-loading-state');
                    if (loadingElement) {
                        loadingElement.remove();
                    }
                    
                    if (window.innerWidth <= 767) {
                        video.bind('play', function() {
                            if (screen.orientation) {
                                screen.orientation.addEventListener('change', handleOrientationChange);
                            } else if (window.orientation !== undefined) {
                                window.addEventListener('orientationchange', handleOrientationChange);
                            }
                        });
                    }
                },
                onError: function(error) {
                    console.error('❌ Wistia video error:', error);
                    // Show user-friendly error message
                    videoContainer.innerHTML = `
                        <div class="video-error-state">
                            <div class="video-placeholder-inner">
                                <div class="video-error-title">⚠️ Video Unavailable</div>
                                <div class="video-error-sub-margin">This video cannot be loaded right now.</div>
                                <button data-action="retry-video" data-wistia-id="${wistiaId}" data-video-title="${title.replace(/'/g, "\\'")}" class="video-retry-btn">Try Again</button>
                                <button data-action="close-player" class="video-close-btn">Close</button>
                            </div>
                        </div>
                    `;
                }
            });
        }

        // Handle orientation changes
        function handleOrientationChange() {
            if (currentWistiaVideo && window.innerWidth <= 767) {
                const isLandscape = (screen.orientation && screen.orientation.angle !== 0) || 
                                  (window.orientation && (window.orientation === 90 || window.orientation === -90));
                
                if (isLandscape) {
                    setTimeout(() => {
                        if (currentWistiaVideo.state() === 'playing') {
                            currentWistiaVideo.requestFullscreen();
                        }
                    }, 500);
                }
            }
        }

        // Load videos from Netlify Functions
        // ===== DATA LOADING AND SERVER COMMUNICATION =====
        
        /**
         * Cache management for API responses
         * 5-minute expiration to balance freshness and performance
         */
        const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
        
        function getCachedData(key) {
            try {
                const cached = localStorage.getItem(`cache_${key}`);
                if (!cached) return null;
                
                const { data, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                
                if (age < CACHE_DURATION) {
                    console.log(`💾 CACHE HIT: ${key} (age: ${Math.round(age/1000)}s)`);
                    return data;
                }
                
                console.log(`⏰ CACHE EXPIRED: ${key} (age: ${Math.round(age/1000)}s)`);
                localStorage.removeItem(`cache_${key}`);
                return null;
            } catch (error) {
                console.error('Cache read error:', error);
                return null;
            }
        }
        
        function setCachedData(key, data) {
            try {
                const cacheObject = {
                    data: data,
                    timestamp: Date.now()
                };
                localStorage.setItem(`cache_${key}`, JSON.stringify(cacheObject));
                console.log(`💾 CACHED: ${key}`);
            } catch (error) {
                console.error('Cache write error:', error);
            }
        }
        
        /**
         * Loads videos from the server/database
         * Handles caching and error recovery
         */
        async function loadVideosFromServer() {
            try {
                console.log('🎬 === LOADING VIDEOS FROM SERVER ===');

                // Check cache first
                const cachedVideos = getCachedData(pageCacheKey('videos'));
                if (cachedVideos) {
                    videos = cachedVideos;
                    console.log('✅ Videos loaded from cache:', videos.length, 'videos');
                    processLoadedVideos(videos);
                    return;
                }
                
                console.log(`🎬 Making API call to: ${pageApiUrl('get-videos')}`);
                const response = await fetch(pageApiUrl('get-videos'));
                if (response.ok) {
                    videos = await response.json();
                    console.log('✅ Videos loaded successfully:', videos.length, 'videos');
                    console.log('🎬 Video data sample:', videos.slice(0, 2));
                    
                    // Cache the response
                    setCachedData(pageCacheKey('videos'), videos);
                    
                    processLoadedVideos(videos);
                } else {
                    console.error('Server response not ok:', response.status);
                    if (pagePresentation.empty_state_enabled) {
                        videos = [];
                        processLoadedVideos(videos);
                        return;
                    }
                    showError('server');
                }
            } catch (error) {
                console.error('❌ FAILED TO LOAD VIDEOS:', error);
                console.error('❌ Error details:', error.message);
                console.error('❌ This will result in empty video grid!');
                if (pagePresentation.empty_state_enabled) {
                    videos = [];
                    processLoadedVideos(videos);
                    return;
                }
                showError('network');
            }
        }
        
        /**
         * Process loaded videos (featured video, rendering, etc.)
         */
        function processLoadedVideos(videos) {
            syncPageTemplateState();

            if (shouldShowEmptyState()) {
                renderVideoGrid([]);
                return;
            }

            // Check if there's a featured video saved
            const featuredVideo = videos.find(v => v.featured === true);
            if (featuredVideo) {
                featuredContent.videoId = featuredVideo.wistiaId;
                featuredContent.title = featuredVideo.title;
                featuredContent.type = 'video';
                
                // Load the featured video in the player
                loadWistiaVideo(featuredVideo.wistiaId, featuredVideo.title);
                
                // Show the video player
                const videoPlayer = document.getElementById('videoPlayer');
                if (videoPlayer) {
                    videoPlayer.style.display = 'block';
                }
            }
            
            renderVideoGrid(videos);
            
            // Hide categories dropdown if all videos have 'all' category
            hideCategoryDropdownIfAllVideosAreAll(videos);
        }

        // ===== VIDEO GRID RENDERING AND UI FUNCTIONS =====
        
        /**
         * Renders the video grid with thumbnails and metadata
         * @param {Array} videos - Array of video objects to display
         */
        function renderVideoGrid(videos) {
            const videoGrid = document.getElementById('videoGrid');
            
            // Filter out featured video from the grid
            const videosToDisplay = videos.filter(video => video.wistiaId !== featuredContent.videoId);
            
            if (videosToDisplay.length === 0 && videos.length === 0) {
                if (shouldShowEmptyState()) {
                    renderEmptyVideoPlaceholders(videoGrid);
                    return;
                }
                videoGrid.innerHTML = '';
                return;
            }

            videoGrid.classList.remove('coming-soon-placeholder-grid');
            
            console.log('🎬 DEBUG: === RENDERING VIDEO GRID ===');
            console.log('🎬 DEBUG: Videos to render:', videosToDisplay.length);
            console.log('🎬 DEBUG: Featured video:', featuredContent.videoId);
            
            // Calculate grid dimensions based on viewport width
            const getGridColumns = () => {
                const width = window.innerWidth;
                if (width >= 1200) return 4;
                if (width >= 768) return 3;
                return 2;
            };
            
            const columns = getGridColumns();
            const totalVideos = videosToDisplay.length;
            const rows = Math.ceil(totalVideos / columns);
            
            const videoHTML = videosToDisplay.map((video, index) => {
                console.log(`🎬 DEBUG: Rendering video ${index + 1}/${videosToDisplay.length}:`, video);
                
                // Calculate position in grid
                const row = Math.floor(index / columns);
                const col = index % columns;
                const isFirstRow = row === 0;
                const isLastRow = row === rows - 1;
                const isFirstCol = col === 0;
                const isLastCol = col === columns - 1 || index === totalVideos - 1;
                
                // Use actual tags for display, not category
                const videoTags = video.tags || [];
                const safeWistiaId = escapeAttribute(video.wistiaId);
                const safeTitle = escapeHtml(video.title);
                const safeCategory = escapeAttribute(video.category);
                const tagsString = videoTags.map(escapeAttribute).join(',');
                const displayTags = videoTags
                    .filter(tag => tag !== 'all') // Don't show 'all' as a tag pill
                    .map(tag => 
                        `<span class="item-tag-pill">${escapeHtml(tag.charAt(0).toUpperCase() + tag.slice(1))}</span>`
                    ).join('');
                
                // Generate arrow controls based on position
                const arrowControls = `
                    <div class="video-position-controls">
                        ${!isFirstRow ? `<button class="position-arrow arrow-up" data-action="move-video" data-wistia-id="${safeWistiaId}" data-direction="up" title="Move Up">↑</button>` : ''}
                        ${!isLastRow ? `<button class="position-arrow arrow-down" data-action="move-video" data-wistia-id="${safeWistiaId}" data-direction="down" title="Move Down">↓</button>` : ''}
                        ${!isFirstCol ? `<button class="position-arrow arrow-left" data-action="move-video" data-wistia-id="${safeWistiaId}" data-direction="left" title="Move Left">←</button>` : ''}
                        ${!isLastCol ? `<button class="position-arrow arrow-right" data-action="move-video" data-wistia-id="${safeWistiaId}" data-direction="right" title="Move Right">→</button>` : ''}
                    </div>
                `;
                
                const html = `
                    <div class="video-item" data-category="${safeCategory}" data-tags="${tagsString}" data-title="${safeTitle}" data-wistia="${safeWistiaId}">
                        <button class="video-delete-btn" data-action="delete-video" data-wistia-id="${safeWistiaId}" title="Delete Video"></button>
                        <div class="thumbnail" id="thumb-${safeWistiaId}">
                            <img src="https://embed-ssl.wistia.com/deliveries/${safeWistiaId}.jpg" alt="${safeTitle}" class="thumb-img-cover" data-thumb-fallback="${safeWistiaId}">
                            <div class="thumbnail-duration" id="thumb-duration-${safeWistiaId}">--:--</div>
                            <div class="thumbnail-play-button"></div>
                            <div class="featured-controls">
                                <button class="featured-btn${featuredContent.videoId === video.wistiaId ? ' active' : ''}" data-action="set-featured" data-wistia-id="${safeWistiaId}">Feature</button>
                            </div>
                            <div class="video-edit-overlay">
                                <button class="video-edit-btn" data-action="edit-video" data-wistia-id="${safeWistiaId}" data-video-title="${escapeForOnclick(video.title)}" data-video-category="${escapeForOnclick(video.category)}">Edit</button>
                            </div>
                            <div class="thumbnail-close-overlay">
                                <button class="thumbnail-close-button" data-action="close-player">Close</button>
                            </div>
                        </div>
                        ${arrowControls}
                        <div class="item-info">
                            <div class="title-row">
                                <div class="item-title">${safeTitle}</div>
                            </div>
                            <div class="item-tags">${displayTags}</div>
                        </div>
                    </div>
                `;
                console.log(`🎬 DEBUG: Generated HTML for ${video.wistiaId}:`, html.substring(0, 200) + '...');
                return html;
            }).join('');
            
            videoGrid.innerHTML = videoHTML;
            
            // Fix orphaned words in titles
            fixOrphanedWords();
            
            // Build video URL mappings for direct links (include all videos)
            buildVideoUrlMappings(videos);
            
            // Check if we should auto-play a video from URL hash
            checkForDirectVideoLink();
            
            console.log('🎬 DEBUG: Video grid HTML set, checking for duration elements...');
            
            // Verify duration elements were created
            setTimeout(() => {
                videos.forEach(video => {
                    const durationEl = document.getElementById(`duration-${video.wistiaId}`);
                    console.log(`🎬 DEBUG: Duration element for ${video.wistiaId}:`, {
                        exists: !!durationEl,
                        element: durationEl,
                        parentElement: durationEl?.parentElement,
                        styles: durationEl ? window.getComputedStyle(durationEl) : null
                    });
                });
            }, 100);
            
            attachVideoListeners();
            
            // Initialize lazy loading for video durations
            initializeLazyLoading(videosToDisplay);
            
            if (videos.length > 0) {
                loadInitialContent();
            }
        }

        function renderEmptyVideoPlaceholders(videoGrid) {
            const count = Math.max(0, Number(pagePresentation.empty_state_placeholder_count) || 0);
            const label = pagePresentation.empty_state_label || 'Video coming soon';
            const cards = Array.from({ length: count }, () => `
                <div class="coming-soon-placeholder-thumbnail" aria-hidden="true">
                    <div class="coming-soon-placeholder-thumbnail-media">
                        <img data-coming-soon-image alt="">
                    </div>
                    <div class="coming-soon-placeholder-thumbnail-label">${escapeHtml(label)}</div>
                </div>
            `).join('');

            videoGrid.classList.add('coming-soon-placeholder-grid');
            videoGrid.innerHTML = cards;
            applyComingSoonImage();
        }

        function applyComingSoonImage(imageUrl) {
            if (imageUrl !== undefined) {
                hasConfiguredComingSoonImage = Boolean(imageUrl);
                comingSoonImageUrl = imageUrl || getComingSoonFallbackImage();
            } else if (!hasConfiguredComingSoonImage) {
                comingSoonImageUrl = getComingSoonFallbackImage();
            }

            document.querySelectorAll('[data-coming-soon-image]').forEach(image => {
                image.src = comingSoonImageUrl;
            });
            if (shouldShowEmptyState()) syncPageTemplateState();
        }


        // Initialize lazy loading with Intersection Observer
        function initializeLazyLoading(videos) {
            // Load immediately visible videos (above the fold)
            const immediateVideos = videos.slice(0, 6); // First 6 videos load immediately
            immediateVideos.forEach(video => {
                loadVideoDuration(video.wistiaId, defaultCacheOptions);
            });

            // Set up lazy loading for remaining videos
            if (videos.length > 6) {
                const lazyVideos = videos.slice(6);
                setupIntersectionObserver(lazyVideos);
            }
        }

        // Set up Intersection Observer for lazy loading
        function setupIntersectionObserver(videos) {
            const options = {
                root: null,
                rootMargin: '200px', // Load 200px before entering viewport
                threshold: 0.1
            };

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const wistiaId = entry.target.dataset.wistia;
                        if (wistiaId) {
                            loadVideoDuration(wistiaId, defaultCacheOptions);
                            observer.unobserve(entry.target); // Stop observing once loaded
                        }
                    }
                });
            }, options);

            // Observe video elements
            videos.forEach(video => {
                const videoElement = document.querySelector(`[data-wistia="${video.wistiaId}"]`);
                if (videoElement) {
                    observer.observe(videoElement);
                }
            });
        }


        // Hide category dropdown if all videos have 'all' category
        function hideCategoryDropdownIfAllVideosAreAll(videos) {
            const categoryDropdown = document.querySelector('.categories-dropdown');
            if (!categoryDropdown) return;
            
            // If no videos, show the dropdown
            if (!videos || videos.length === 0) {
                categoryDropdown.style.display = 'flex';
                return;
            }
            
            // Check if all videos have 'all-songs' category (the default category)
            const allVideosHaveAllCategory = videos.every(video => 
                video.category === 'all-songs' || !video.category
            );
            
            if (allVideosHaveAllCategory) {
                categoryDropdown.style.display = 'none';
                console.log('Category dropdown hidden: all videos have "all" category');
            } else {
                categoryDropdown.style.display = 'flex';
                console.log('Category dropdown shown: videos have different categories');
            }
        }

        // ===== EVENT LISTENERS AND USER INTERACTION =====
        
        /**
         * Attaches click and interaction event listeners to video items
         */
        function attachVideoListeners() {
            const videoItems = document.querySelectorAll('.video-item');
            
            videoItems.forEach(item => {
                item.addEventListener('click', () => {
                    if (isEditMode) return; // Don't play in edit mode
                    
                    const wistiaId = item.dataset.wistia;
                    const title = item.dataset.title;
                    
                    // Check if this is the currently playing video
                    if (currentlyPlayingVideoId === wistiaId) {
                        // Do nothing - only the close overlay button should close the video
                        return;
                    } else {
                        // Load the new video
                        loadWistiaVideo(wistiaId, title);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                });
                
                const thumbnail = item.querySelector('.thumbnail');
                item.addEventListener('mouseenter', () => {
                    if (!isEditMode && !document.body.classList.contains('edit-mode')) {
                        thumbnail.style.transform = 'scale(1.02)';
                    }
                });
                item.addEventListener('mouseleave', () => {
                    if (!isEditMode && !document.body.classList.contains('edit-mode')) {
                        thumbnail.style.transform = 'scale(1)';
                    } else {
                        // Force reset transform in edit mode
                        thumbnail.style.transform = 'none';
                    }
                });
            });
        }



        // Prevent overlapping filter operations
        let isFilteringInProgress = false;

        // Tag filtering removed - no longer needed

        /**
         * Load saved page title from localStorage
         */
        function loadPageTitle() {
            const savedTitle = localStorage.getItem(pageCacheKey('page_title'));
            if (savedTitle) {
                document.getElementById('pageTitle').textContent = savedTitle;
                return true; // Indicates title was loaded from localStorage
            }
            return false; // No saved title found
        }

        function loadPageConfigOz() {
            return loadPageConfig(pageKey, {
                defaultAccentColor: '#008f67',
                debug: true,
                onTitleLoaded: function(title) {
                    localStorage.setItem(pageCacheKey('page_title'), title);
                },
                onTitleMissing: loadPageTitle,
                onComingSoonImageLoaded: applyComingSoonImage,
                onPresentationLoaded: applyPagePresentation
            });
        }

        function applyPagePresentation(presentation) {
            pagePresentation = window.PageTemplate
                ? window.PageTemplate.applyPresentation(presentation)
                : { ...pagePresentation, ...(presentation || {}) };
            applyComingSoonImage();
            syncPageTemplateState();
            const grid = document.getElementById('videoGrid');
            if (grid) renderVideoGrid(videos);
        }

        /**
         * DEBUG: Test function to check current color state
         * Call this from browser console: window.debugAccentColor()
         */
        window.debugAccentColor = async function() {
            console.log('🎨 Current CSS accent color:', getComputedStyle(document.documentElement).getPropertyValue('--accent-color'));
            console.log('🎨 Admin panel color input:', document.getElementById('adminAccentColorText')?.value);
            console.log('🎨 Admin panel color picker:', document.getElementById('adminAccentColor')?.value);
            
            // Test loading from server
            try {
                const response = await fetch(pageApiUrl('get-page-config'));
                const config = await response.json();
                console.log('🎨 Server config:', config);
            } catch (error) {
                console.error('🎨 Error loading server config:', error);
            }
        };

        /**
         * DEBUG: Force save accent color
         * Call this from browser console: window.forceSaveAccentColor('#008f67')
         */
        window.forceSaveAccentColor = async function(color = '#008f67') {
            console.log('🎨 Force saving accent color:', color);
            try {
                const response = await fetch('/api/save-page-config', {
                    method: 'POST',
                    headers: pageEditorHeaders(),
                    body: JSON.stringify({
                        page: pageKey,
                        accent_color: color
                    })
                });
                
                await requirePageEditorResponse(response, 'Failed to save the accent color.');
                const result = await response.json();
                console.log('🎨 Force save successful:', result);
                // Apply the color immediately
                applyAccentColor(color);
                // Update admin panel inputs
                if (document.getElementById('adminAccentColorText')) {
                    document.getElementById('adminAccentColorText').value = color;
                }
                if (document.getElementById('adminAccentColor')) {
                    document.getElementById('adminAccentColor').value = color;
                }
            } catch (error) {
                console.error('🎨 Force save error:', error);
            }
        };

        /**
         * Load current accent color from server for admin panel
         */
        async function loadCurrentAccentColor() {
            try {
                const response = await fetch(pageApiUrl('get-page-config'));
                if (response.ok) {
                    const config = await response.json();
                    const accentColor = config.accent_color || '#008f67';
                    document.getElementById('adminAccentColor').value = accentColor;
                    document.getElementById('adminAccentColorText').value = accentColor;
                } else {
                    // Server request failed, use default
                    document.getElementById('adminAccentColor').value = '#008f67';
                    document.getElementById('adminAccentColorText').value = '#008f67';
                }
            } catch (error) {
                console.error('Failed to load current accent color:', error);
                // Server unreachable, use default
                document.getElementById('adminAccentColor').value = '#008f67';
                document.getElementById('adminAccentColorText').value = '#008f67';
            }
        }

        // ===== NAVIGATION POPULATION FUNCTIONS =====
        
        /**
         * Populate tag filters (Dancers, Kids, Chorus) from managed tags in database
         * Tags are categories with show_in_dropdown = false
         */
        function populateTagFilters() {
            const tagFilters = document.getElementById('tagFilters');
            if (!tagFilters) return;
            
            const availableTags = getVisibleChoreographyFilters(currentActiveCategory);
            // Keep "All" for All Songs and multi-group songs. For a song
            // with only one choreography group, the extra control is
            // redundant because that group is already the only option.
            const showAllTag = !hasConfiguredChoreography() ||
                currentActiveCategory === 'all' ||
                availableTags.length > 1;
            tagFilters.innerHTML = showAllTag
                ? `<div class="tag active" data-tag="all">${escapeHtml(pagePresentation.tag_all_label || 'All')}</div>`
                : '';
            
            // Add tags from managed tags (show_in_dropdown = false)
            availableTags.forEach(tag => {
                const tagElement = document.createElement('div');
                tagElement.className = `tag${currentActiveTag === tag.id ? ' active' : ''}`;
                tagElement.setAttribute('data-tag', tag.id);
                tagElement.textContent = tag.name;
                tagElement.addEventListener('click', () => filterByTag(tag.id));
                tagFilters.appendChild(tagElement);
            });
            
            console.log(`🏷️ DEBUG: Populated ${availableTags.length} tag filters on main page`);
            
            // Add click listener for "All" tag
            const allTag = tagFilters.querySelector('[data-tag="all"]');
            if (allTag) {
                allTag.addEventListener('click', () => filterByTag('all'));
            }
            
            // Fade in tags container smoothly once populated
            const tagsContainer = document.querySelector('.tags-container');
            if (tagsContainer) {
                tagsContainer.classList.add('loaded');
            }
        }
        
        /**
         * Load videos and populate the song category dropdown
         */
        async function loadVideosAndPopulateDropdown() {
            // Load videos first
            await loadVideosFromServer();
            
            // Populate dropdown from managed categories (not from video data)
            populateCategoryDropdown();
            
            // Add change listener
            const categoryDropdown = document.getElementById('categoryDropdown');
            if (categoryDropdown) {
                categoryDropdown.addEventListener('change', (e) => {
                    filterByCategory(e.target.value);
                });
            }
        }
        
        /**
         * Populate the category dropdown from managed categories
         * This uses the categories from the database/server, respecting user preferences
         */
        function populateCategoryDropdown() {
            const categoryDropdown = document.getElementById('categoryDropdown');
            if (!categoryDropdown) return;
            
            // Use customizable "All" label from preferences
            const allLabel = pagePresentation.category_all_label || categoryPreferences.allLabel || 'All Songs';
            categoryDropdown.innerHTML = `<option value="all">${escapeHtml(allLabel)}</option>`;

            // Configured song/group pages can populate their navigation before
            // any videos exist. Other pages continue to use managed categories.
            const songCategories = hasConfiguredChoreography()
                ? getConfiguredSongCategories()
                : (window.serverCategories || []).filter(cat =>
                    cat.id !== 'all' && cat.show_in_dropdown === true
                );

            // Sort by order field
            songCategories.sort((a, b) => (a.order || 0) - (b.order || 0));

            // Add to dropdown
            songCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categoryDropdown.appendChild(option);
            });

            console.log(`📋 DEBUG: Populated dropdown with ${songCategories.length} song categories`);
        }
        
        /**
         * Filter videos by tag (Dancers, Kids, Chorus)
         */
        function filterByTag(tagId) {
            currentActiveTag = tagId;

            // Update active tag
            document.querySelectorAll('.tag').forEach(tag => tag.classList.remove('active'));
            const activeTag = Array.from(document.querySelectorAll('.tag'))
                .find(tag => tag.dataset.tag === tagId);
            if (activeTag) activeTag.classList.add('active');

            applyVideoFilters();
        }

        function normalizeFilterName(name) {
            return String(name || '').replace(/[’‘]/g, "'").trim().toLowerCase();
        }

        function slugifyFilterName(name) {
            return normalizeFilterName(name)
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }

        function getConfiguredSongName(categoryId) {
            const category = (window.serverCategories || []).find(item => item.id === categoryId);
            if (category) return category.name;

            const mappedSong = Object.keys(pagePresentation.choreography_by_song || {}).find(songName =>
                slugifyFilterName(songName) === categoryId
            );
            return mappedSong || categoryId;
        }

        function getConfiguredSongCategories() {
            const serverCategories = window.serverCategories || [];
            return Object.keys(pagePresentation.choreography_by_song || {}).map((name, index) => {
                const existing = serverCategories.find(category =>
                    normalizeFilterName(category.name) === normalizeFilterName(name)
                );
                return existing || {
                    id: slugifyFilterName(name),
                    name,
                    order: index,
                    show_in_dropdown: true
                };
            });
        }

        function getVisibleChoreographyFilters(categoryId) {
            const managedTags = getAvailableTags();
            if (!hasConfiguredChoreography()) return managedTags;

            const mapping = pagePresentation.choreography_by_song || {};
            const allMappedNames = [...new Set(Object.values(mapping).flat())];
            const selectedSongName = categoryId === 'all' ? null : getConfiguredSongName(categoryId);
            const mappedSongName = selectedSongName && Object.keys(mapping).find(songName =>
                normalizeFilterName(songName) === normalizeFilterName(selectedSongName)
            );
            const names = mappedSongName
                ? mapping[mappedSongName]
                : allMappedNames;

            return names.map(name => {
                const managedTag = managedTags.find(tag =>
                    normalizeFilterName(tag.name) === normalizeFilterName(name) ||
                    normalizeFilterName(tag.id) === normalizeFilterName(name)
                );
                return managedTag || { id: slugifyFilterName(name), name };
            });
        }

        function applyVideoFilters() {
            const videoItems = document.querySelectorAll('.video-item');
            videoItems.forEach(item => {
                const itemCategory = item.dataset.category;
                const tags = item.dataset.tags ? item.dataset.tags.split(',') : [];
                const matchesSong = currentActiveCategory === 'all' || itemCategory === currentActiveCategory;
                const matchesChoreography = currentActiveTag === 'all' || tags.includes(currentActiveTag);
                if (matchesSong && matchesChoreography) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        }
        
        /**
         * Filter videos by category (song)
         */
        function filterByCategory(categoryId) {
            currentActiveCategory = categoryId;

            if (hasConfiguredChoreography()) {
                const visibleFilters = getVisibleChoreographyFilters(categoryId);
                if (currentActiveTag !== 'all' &&
                    !visibleFilters.some(tag => tag.id === currentActiveTag)) {
                    currentActiveTag = 'all';
                }
                populateTagFilters();
            }

            applyVideoFilters();
        }

        // ===== PAGE INITIALIZATION AND STARTUP =====
        
        /**
         * Main page initialization function
         * Runs when DOM is fully loaded and sets up all page functionality
         * 
         * Initialization sequence:
         * 1. Load page configuration (colors, meta tags)
         * 2. Load category preferences from localStorage
         * 3. Refresh categories from server
         * 4. Populate tag filters
         * 5. Load videos and populate song dropdown
         * 6. Attach event listeners
         * 7. Check for direct video links
         * 8. Setup admin functionality
         */
        document.addEventListener('DOMContentLoaded', async () => {
            console.log('🚀 =================================');
            console.log('🚀 OZ PAGE INITIALIZATION STARTING');
            console.log('🚀 =================================');
            
            try {
                // Step 1: Load category preferences (synchronous, no API call)
                console.log('🏷️ Step 1: Loading category preferences...');
                loadCategoryPreferences();
                console.log('✅ Step 1 Complete: Category preferences loaded');
                
                // Step 2: PARALLEL LOADING - Load all API data simultaneously
                console.log('⚡ Step 2: Loading all API data in parallel...');
                const startTime = performance.now();
                
                const [pageConfigResult, categoriesResult, videosResult] = await Promise.all([
                    loadPageConfigOz().catch(err => {
                        console.error('❌ Page config failed:', err);
                        return null;
                    }),
                    refreshCategoriesFromServer().catch(err => {
                        console.error('❌ Categories failed:', err);
                        return null;
                    }),
                    loadVideosAndPopulateDropdown().catch(err => {
                        console.error('❌ Videos failed:', err);
                        return null;
                    })
                ]);
                
                const loadTime = Math.round(performance.now() - startTime);
                console.log(`✅ Step 2 Complete: All API data loaded in ${loadTime}ms`);
                console.log('🎨 Current accent color:', getComputedStyle(document.documentElement).getPropertyValue('--accent-color'));
                
                // Step 3: Populate tag filters (depends on categories being loaded)
                console.log('📋 Step 3: Populating tag filters...');
                populateCategoryDropdown();
                populateTagFilters();
                syncPageTemplateState();
                console.log('✅ Step 3 Complete: Tag filters populated');
                
                console.log('🎯 Step 4: Tag listeners removed - no filtering needed');
                
                console.log('🚀 =================================');
                console.log(`🚀 OZ PAGE INITIALIZATION COMPLETE (${loadTime}ms)`);
                console.log('🚀 =================================');
                
            } catch (error) {
                console.error('❌ CRITICAL INITIALIZATION ERROR:', error);
                console.error('❌ Error details:', error.message);
                console.error('❌ Stack trace:', error.stack);
                console.error('❌ This error prevented page data from loading!');
            }
        });

        // Auto-refresh removed to prevent flickering

        // Handle page visibility
        /**
         * Handle page visibility changes (tab switching)
         * Pauses videos when page becomes hidden
         */
        document.addEventListener('visibilitychange', () => {
            if (currentWistiaVideo && document.hidden) {
                currentWistiaVideo.pause();
            }
        });

        // Edit Mode and Login Functionality
        let isEditMode = false;
        let isOrganizeMode = false;
        let pageEditorToken = null;
        let currentActiveCategory = 'all';
        let currentActiveTag = 'all';
        let loginAttempts = 0;
        let loginCooldown = false;

        function pageEditorStorageKey() {
            return `vidshare-page-editor-token:${pageKey}`;
        }

        function savePageEditorToken(token) {
            pageEditorToken = token;
            try {
                localStorage.setItem(pageEditorStorageKey(), token);
            } catch (error) {
                console.warn('Could not remember the page editor credential in this browser.', error);
            }
        }

        function clearSavedPageEditorToken() {
            pageEditorToken = null;
            try {
                localStorage.removeItem(pageEditorStorageKey());
            } catch (error) {
                console.warn('Could not clear the saved page editor credential.', error);
            }
        }

        function showSetupCredentialDialog(token) {
            const existing = document.getElementById('pageEditorCredentialDialog');
            if (existing) existing.remove();
            const dialog = document.createElement('div');
            dialog.id = 'pageEditorCredentialDialog';
            dialog.className = 'page-settings-overlay';
            dialog.innerHTML = `
                <div class="page-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="pageEditorCredentialTitle">
                    <h3 id="pageEditorCredentialTitle">Save your page editor credential</h3>
                    <p>This credential lets you return to edit this show from another browser. Keep it private.</p>
                    <label>Page editor credential<input id="pageEditorCredentialValue" type="text" readonly></label>
                    <p class="page-settings-status" id="pageEditorCredentialStatus"></p>
                    <div class="page-settings-actions">
                        <button type="button" id="pageEditorCredentialCopy">Copy credential</button>
                        <button type="button" id="pageEditorCredentialContinue">Continue to editor</button>
                    </div>
                </div>`;
            document.body.appendChild(dialog);
            const value = dialog.querySelector('#pageEditorCredentialValue');
            value.value = token;
            dialog.querySelector('#pageEditorCredentialCopy').addEventListener('click', async () => {
                const status = dialog.querySelector('#pageEditorCredentialStatus');
                try {
                    await navigator.clipboard.writeText(token);
                    status.textContent = 'Credential copied.';
                } catch {
                    value.focus();
                    value.select();
                    status.textContent = 'Select and copy the credential above.';
                }
            });
            dialog.querySelector('#pageEditorCredentialContinue').addEventListener('click', () => {
                dialog.remove();
                enterEditMode();
            });
        }

        function pageEditorHeaders(token = pageEditorToken) {
            return {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token || ''}`
            };
        }

        async function getPageEditorError(response, fallbackMessage) {
            try {
                const payload = await response.json();
                return payload?.error?.message || fallbackMessage;
            } catch {
                return fallbackMessage;
            }
        }

        async function requirePageEditorResponse(response, fallbackMessage) {
            if (response.ok) return response;

            const message = await getPageEditorError(response, fallbackMessage);
            if (response.status === 401 || response.status === 403) {
                clearSavedPageEditorToken();
                if (isEditMode) exitEditMode();
            }
            throw new Error(message);
        }

        const MAX_COMING_SOON_IMAGE_SIZE = 5 * 1024 * 1024;
        const COMING_SOON_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

        function setComingSoonImageStatus(message, isError = false) {
            const status = document.getElementById('adminComingSoonImageStatus');
            if (!status) return;
            status.textContent = message;
            status.style.color = isError ? '#ffb4b4' : 'rgba(255, 255, 255, 0.8)';
        }

        function readImageFileAsDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('The selected image could not be read.'));
                reader.readAsDataURL(file);
            });
        }

        async function uploadComingSoonImage(file) {
            if (!file) return;
            if (!COMING_SOON_IMAGE_TYPES.includes(file.type)) {
                setComingSoonImageStatus('Choose a JPG, PNG, or WebP image.', true);
                return;
            }
            if (file.size > MAX_COMING_SOON_IMAGE_SIZE) {
                setComingSoonImageStatus('Image must be 5 MB or smaller.', true);
                return;
            }

            const input = document.getElementById('adminComingSoonImage');
            const resetButton = document.getElementById('adminResetComingSoonImage');
            input.disabled = true;
            resetButton.disabled = true;
            setComingSoonImageStatus('Uploading image…');

            try {
                const image = await readImageFileAsDataUrl(file);
                const response = await fetch('/api/upload-coming-soon-image', {
                    method: 'POST',
                    headers: pageEditorHeaders(),
                    body: JSON.stringify({ page: pageKey, image, contentType: file.type })
                });
                await requirePageEditorResponse(response, 'Failed to upload the Coming Soon image.');
                const result = await response.json();
                applyComingSoonImage(result.imageUrl);
                setComingSoonImageStatus('Image saved.');
            } catch (error) {
                console.error('Failed to upload Coming Soon image:', error);
                setComingSoonImageStatus(error.message || 'Image upload failed.', true);
            } finally {
                input.value = '';
                input.disabled = false;
                resetButton.disabled = false;
            }
        }

        async function resetComingSoonImage() {
            const resetButton = document.getElementById('adminResetComingSoonImage');
            const input = document.getElementById('adminComingSoonImage');
            resetButton.disabled = true;
            input.disabled = true;
            setComingSoonImageStatus('Restoring default…');

            try {
                const response = await fetch('/api/save-page-config', {
                    method: 'POST',
                    headers: pageEditorHeaders(),
                    body: JSON.stringify({ page: pageKey, coming_soon_image_url: null })
                });
                await requirePageEditorResponse(response, 'Failed to restore the default Coming Soon image.');
                applyComingSoonImage(null);
                setComingSoonImageStatus('Default image restored.');
            } catch (error) {
                console.error('Failed to restore default Coming Soon image:', error);
                setComingSoonImageStatus(error.message || 'Could not restore the default image.', true);
            } finally {
                resetButton.disabled = false;
                input.disabled = false;
            }
        }

        function bindComingSoonImageControls() {
            const input = document.getElementById('adminComingSoonImage');
            const resetButton = document.getElementById('adminResetComingSoonImage');
            if (!input || !resetButton || input.dataset.bound === 'true') return;

            input.dataset.bound = 'true';
            resetButton.dataset.bound = 'true';
            input.addEventListener('change', () => uploadComingSoonImage(input.files[0]));
            resetButton.addEventListener('click', resetComingSoonImage);
        }

        function pageSettingsRow(song = '', groups = '') {
            const row = document.createElement('div');
            row.className = 'page-song-group-row';
            row.innerHTML = `
                <input type="text" class="page-song-name" placeholder="Song name" value="${escapeAttribute(song)}">
                <input type="text" class="page-song-groups" placeholder="Groups, separated by commas" value="${escapeAttribute(groups)}">
                <button type="button" class="page-remove-song">Remove</button>
            `;
            row.querySelector('.page-remove-song').addEventListener('click', () => row.remove());
            return row;
        }

        function ensurePagePresentationControls() {
            const buttons = document.querySelector('.admin-banner-buttons');
            if (!buttons || document.getElementById('adminPageSettingsBtn')) return;

            const comingSoonControls = document.createElement('div');
            comingSoonControls.className = 'admin-coming-soon-controls';
            comingSoonControls.innerHTML = `
                <label for="adminComingSoonImage">Coming Soon image:</label>
                <input type="file" id="adminComingSoonImage" accept="image/jpeg,image/png,image/webp">
                <button type="button" class="admin-reset-image-btn" id="adminResetComingSoonImage">Use default</button>
                <span class="admin-image-status" id="adminComingSoonImageStatus" role="status" aria-live="polite"></span>
            `;
            const settingsButton = document.createElement('button');
            settingsButton.type = 'button';
            settingsButton.className = 'admin-add-video-btn';
            settingsButton.id = 'adminPageSettingsBtn';
            settingsButton.textContent = 'Page Settings';
            buttons.insertBefore(comingSoonControls, buttons.querySelector('#adminAddVideoBtn'));
            buttons.insertBefore(settingsButton, buttons.querySelector('#adminAddVideoBtn'));

            const overlay = document.createElement('div');
            overlay.className = 'page-settings-overlay';
            overlay.id = 'pageSettingsOverlay';
            overlay.innerHTML = `
                <section class="page-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="pageSettingsTitle">
                    <h3 id="pageSettingsTitle">Page Settings</h3>
                    <div class="page-settings-grid">
                        <label class="page-settings-check"><input type="checkbox" id="pageEmptyStateEnabled"> Show Coming Soon when no videos exist</label>
                        <label class="page-settings-check"><input type="checkbox" id="pageForceEmptyState"> Show Coming Soon even when videos exist</label>
                        <label>Coming Soon label<input type="text" id="pageEmptyStateLabel" maxlength="120"></label>
                        <label>Placeholder cards<input type="number" id="pagePlaceholderCount" min="0" max="24"></label>
                        <label>Background image URL<input type="url" id="pageBackgroundUrl" maxlength="2048" placeholder="/attached_assets/background.png"></label>
                        <label>Background position<input type="text" id="pageBackgroundPosition" maxlength="80" placeholder="center center"></label>
                        <label>Background opacity<input type="number" id="pageBackgroundOpacity" min="0" max="1" step="0.01"></label>
                        <label>Background blur (px)<input type="number" id="pageBackgroundBlur" min="0" max="20" step="0.5"></label>
                        <label>Mobile background opacity<input type="number" id="pageMobileBackgroundOpacity" min="0" max="1" step="0.01"></label>
                        <label>Footer text<select id="pageFooterTheme"><option value="dark">Dark</option><option value="light">Light</option></select></label>
                        <label>All categories label<input type="text" id="pageCategoryAllLabel" maxlength="80"></label>
                        <label>All groups label<input type="text" id="pageTagAllLabel" maxlength="80"></label>
                        <label>Open Graph title<input type="text" id="pageOgTitle" maxlength="160"></label>
                        <label>Open Graph image URL<input type="url" id="pageOgImageUrl" maxlength="2048" placeholder="/attached_assets/show-thumbnail.jpg"></label>
                        <label class="page-settings-wide">Open Graph description<textarea id="pageOgDescription" maxlength="300"></textarea></label>
                    </div>
                    <h4>Song choreography groups</h4>
                    <p>Use one row per song. List its visible groups with commas. A page without rows uses its normal tag filters.</p>
                    <div class="page-song-groups" id="pageSongGroups"></div>
                    <button type="button" class="page-settings-add-group" id="pageAddSongGroup">Add song</button>
                    <div class="page-settings-actions">
                        <button type="button" id="pageSettingsCancel">Cancel</button>
                        <button type="button" id="pageSettingsSave">Save page settings</button>
                    </div>
                    <p class="admin-image-status" id="pageSettingsStatus" role="status" aria-live="polite"></p>
                </section>
            `;
            document.body.appendChild(overlay);

            settingsButton.addEventListener('click', openPageSettings);
            overlay.addEventListener('click', event => {
                if (event.target === overlay) closePageSettings();
            });
            document.getElementById('pageSettingsCancel').addEventListener('click', closePageSettings);
            document.getElementById('pageAddSongGroup').addEventListener('click', () => {
                document.getElementById('pageSongGroups').appendChild(pageSettingsRow());
            });
            document.getElementById('pageSettingsSave').addEventListener('click', savePageSettings);
        }

        function openPageSettings() {
            ensurePagePresentationControls();
            const presentation = pagePresentation;
            document.getElementById('pageEmptyStateEnabled').checked = presentation.empty_state_enabled === true;
            document.getElementById('pageForceEmptyState').checked = presentation.force_empty_state === true;
            document.getElementById('pageEmptyStateLabel').value = presentation.empty_state_label || '';
            document.getElementById('pagePlaceholderCount').value = presentation.empty_state_placeholder_count || 0;
            document.getElementById('pageBackgroundUrl').value = presentation.background_image_url || '';
            document.getElementById('pageBackgroundPosition').value = presentation.background_position || 'center center';
            document.getElementById('pageBackgroundOpacity').value = presentation.background_opacity || 0;
            document.getElementById('pageBackgroundBlur').value = presentation.background_blur || 0;
            document.getElementById('pageMobileBackgroundOpacity').value = presentation.mobile_background_opacity || 0;
            document.getElementById('pageFooterTheme').value = presentation.footer_theme || 'dark';
            document.getElementById('pageCategoryAllLabel').value = presentation.category_all_label || '';
            document.getElementById('pageTagAllLabel').value = presentation.tag_all_label || '';
            document.getElementById('pageOgTitle').value = window.currentPageConfig?.og_title || document.getElementById('pageTitle').textContent || '';
            document.getElementById('pageOgDescription').value = window.currentPageConfig?.og_description || '';
            document.getElementById('pageOgImageUrl').value = window.currentPageConfig?.og_image_url || '';

            const groups = document.getElementById('pageSongGroups');
            groups.innerHTML = '';
            Object.entries(presentation.choreography_by_song || {}).forEach(([song, songGroups]) => {
                groups.appendChild(pageSettingsRow(song, songGroups.join(', ')));
            });
            document.getElementById('pageSettingsStatus').textContent = '';
            document.getElementById('pageSettingsOverlay').classList.add('open');
        }

        function closePageSettings() {
            document.getElementById('pageSettingsOverlay')?.classList.remove('open');
        }

        async function savePageSettings() {
            const status = document.getElementById('pageSettingsStatus');
            const saveButton = document.getElementById('pageSettingsSave');
            const mapping = {};
            for (const row of document.querySelectorAll('.page-song-group-row')) {
                const song = row.querySelector('.page-song-name').value.trim();
                const groups = row.querySelector('.page-song-groups').value.split(',')
                    .map(group => group.trim()).filter(Boolean);
                if (!song && groups.length === 0) continue;
                if (!song || groups.length === 0 || mapping[song]) {
                    status.textContent = 'Each song needs a unique name and at least one group.';
                    status.style.color = '#ffb4b4';
                    return;
                }
                mapping[song] = groups;
            }

            const presentation = {
                ...pagePresentation,
                empty_state_enabled: document.getElementById('pageEmptyStateEnabled').checked,
                force_empty_state: document.getElementById('pageForceEmptyState').checked,
                empty_state_label: document.getElementById('pageEmptyStateLabel').value.trim() || 'Video coming soon',
                empty_state_placeholder_count: Number(document.getElementById('pagePlaceholderCount').value),
                background_image_url: document.getElementById('pageBackgroundUrl').value.trim() || null,
                background_position: document.getElementById('pageBackgroundPosition').value.trim() || 'center center',
                background_opacity: Number(document.getElementById('pageBackgroundOpacity').value),
                background_blur: Number(document.getElementById('pageBackgroundBlur').value),
                mobile_background_opacity: Number(document.getElementById('pageMobileBackgroundOpacity').value),
                footer_theme: document.getElementById('pageFooterTheme').value,
                category_all_label: document.getElementById('pageCategoryAllLabel').value.trim() || 'All',
                tag_all_label: document.getElementById('pageTagAllLabel').value.trim() || 'All',
                choreography_by_song: mapping
            };
            const ogTitle = document.getElementById('pageOgTitle').value.trim();
            const ogDescription = document.getElementById('pageOgDescription').value.trim();
            const ogImageUrl = document.getElementById('pageOgImageUrl').value.trim() || null;

            saveButton.disabled = true;
            status.textContent = 'Saving page settings…';
            status.style.color = 'rgba(255, 255, 255, 0.8)';
            try {
                const response = await fetch('/api/save-page-config', {
                    method: 'POST',
                    headers: pageEditorHeaders(),
                    body: JSON.stringify({
                        page: pageKey,
                        presentation,
                        og_title: ogTitle,
                        og_description: ogDescription,
                        og_image_url: ogImageUrl
                    })
                });
                await requirePageEditorResponse(response, 'Failed to save page settings.');
                const result = await response.json();
                applyPagePresentation(result.presentation);
                populateCategoryDropdown();
                populateTagFilters();
                processLoadedVideos(videos);
                status.textContent = 'Page settings saved.';
                setTimeout(closePageSettings, 500);
            } catch (error) {
                console.error('Failed to save page settings:', error);
                status.textContent = error.message || 'Could not save page settings.';
                status.style.color = '#ffb4b4';
            } finally {
                saveButton.disabled = false;
            }
        }

        function registerLoginFailure() {
            loginAttempts += 1;
            if (loginAttempts < 5) return;

            loginCooldown = true;
            setTimeout(() => {
                loginAttempts = 0;
                loginCooldown = false;
            }, 30 * 1000);
        }

        // Login functionality
        document.getElementById('loginLink').addEventListener('click', function() {
            if (isEditMode) {
                exitEditMode();
            } else {
                document.getElementById('loginOverlay').style.display = 'flex';
                document.getElementById('loginPassword').focus();
            }
        });

        document.getElementById('cancelLogin').addEventListener('click', function() {
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('loginPassword').value = '';
            document.getElementById('loginError').style.display = 'none';
        });

        document.getElementById('loginForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Check if in cooldown period
            if (loginCooldown) {
                document.getElementById('loginError').textContent = 'Too many attempts. Please wait before trying again.';
                document.getElementById('loginError').style.display = 'block';
                return;
            }
            
            const password = document.getElementById('loginPassword').value;
            const loginError = document.getElementById('loginError');
            const submitButton = e.currentTarget.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Checking...';

            try {
                const response = await fetch('/api/verify-page-editor', {
                    method: 'POST',
                    headers: pageEditorHeaders(password),
                    body: JSON.stringify({ page: pageKey })
                });

                if (!response.ok) {
                    registerLoginFailure();
                    const message = await getPageEditorError(response, 'That password cannot edit this page.');
                    loginError.textContent = message;
                    loginError.style.display = 'block';
                    return;
                }

                savePageEditorToken(password);
                document.getElementById('loginOverlay').style.display = 'none';
                loginError.style.display = 'none';
                loginAttempts = 0;
                enterEditMode();
            } catch (error) {
                loginError.textContent = 'Unable to verify editor access. Please try again.';
                loginError.style.display = 'block';
            } finally {
                document.getElementById('loginPassword').value = '';
                submitButton.disabled = false;
                submitButton.textContent = 'Login';
            }
        });

        async function redeemSetupLink() {
            const setupToken = new URLSearchParams(window.location.search).get('setup');
            if (!setupToken) return;
            try {
                const response = await fetch('/api/redeem-page-editor-setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ page: pageKey, token: setupToken })
                });
                if (!response.ok) throw new Error(await getPageEditorError(response, 'This setup link is expired or already used.'));
                const result = await response.json();
                savePageEditorToken(result.editor_token);
                history.replaceState(null, '', window.location.pathname);
                showSetupCredentialDialog(result.editor_token);
            } catch (error) {
                const loginError = document.getElementById('loginError');
                loginError.textContent = error.message;
                loginError.style.display = 'block';
                document.getElementById('loginOverlay').style.display = 'flex';
            }
        }

        async function restoreSavedPageEditorSession() {
            let token;
            try {
                token = localStorage.getItem(pageEditorStorageKey());
            } catch {
                return;
            }
            if (!token || new URLSearchParams(window.location.search).get('setup')) return;
            try {
                const response = await fetch('/api/verify-page-editor', {
                    method: 'POST',
                    headers: pageEditorHeaders(token),
                    body: JSON.stringify({ page: pageKey })
                });
                if (!response.ok) {
                    clearSavedPageEditorToken();
                    return;
                }
                pageEditorToken = token;
                enterEditMode();
            } catch (error) {
                console.warn('Could not restore page editor session.', error);
            }
        }

        async function initializePageEditorAccess() {
            if (new URLSearchParams(window.location.search).get('setup')) {
                await redeemSetupLink();
                return;
            }
            await restoreSavedPageEditorSession();
        }
        initializePageEditorAccess();

        /**
         * Edit page title inline in admin mode
         * Creates an input field to edit the title and saves changes to the database
         * Handles Enter to save and Escape to cancel
         */
        function editPageTitle() {
            const titleElement = document.getElementById('pageTitle');
            const currentTitle = titleElement.textContent;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentTitle;
            input.style.cssText = titleElement.style.cssText;
            input.style.fontSize = getComputedStyle(titleElement).fontSize;
            input.style.fontWeight = getComputedStyle(titleElement).fontWeight;
            input.style.textAlign = 'center';
            input.style.width = '100%';
            input.style.background = 'rgba(0, 0, 0, 0.8)';
            input.style.color = 'white';
            input.style.border = '2px solid var(--accent-color)';
            input.style.padding = '4px 8px';
            input.style.borderRadius = '4px';
            
            titleElement.style.display = 'none';
            titleElement.parentNode.insertBefore(input, titleElement);
            input.focus();
            input.select();
            
            async function saveTitle() {
                const newTitle = input.value.trim();
                if (newTitle && newTitle !== currentTitle) {
                    try {
                        // Save to server first
                        const response = await fetch('/api/save-page-config', {
                            method: 'POST',
                            headers: pageEditorHeaders(),
                            body: JSON.stringify({
                                page: pageKey,
                                page_title: newTitle
                            })
                        });
                        
                        await requirePageEditorResponse(response, 'Failed to save the page title.');
                        titleElement.textContent = newTitle;
                        localStorage.setItem(pageCacheKey('page_title'), newTitle);
                        markUnsavedChanges();
                    } catch (error) {
                        console.error('Failed to save page title:', error);
                        alert(error.message);
                    }
                }
                
                input.remove();
                titleElement.style.display = '';
            }
            
            input.addEventListener('blur', saveTitle);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveTitle();
                } else if (e.key === 'Escape') {
                    input.value = currentTitle;
                    input.blur();
                }
            });
        }

        // Edit Mode Functions
        function enterEditMode() {
            isEditMode = true;
            document.body.classList.add('edit-mode');
            document.getElementById('loginLink').textContent = 'Exit Edit';
            document.getElementById('adminBanner').style.display = 'block';
            ensurePagePresentationControls();
            bindComingSoonImageControls();
            
            // Add edit functionality to existing videos
            addEditListeners();
            
            // Add category edit listeners
            addCategoryEditListeners();
            
            // Add page title edit listener
            document.getElementById('pageTitle').addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                editPageTitle();
            });
            
            // Load and set current accent color from server
            loadCurrentAccentColor();
            
            // Add accent color synchronization
            document.getElementById('adminAccentColor').addEventListener('input', function(e) {
                const color = e.target.value;
                document.getElementById('adminAccentColorText').value = color;
                // Apply color immediately for preview
                applyAccentColor(color);
                markUnsavedChanges();
            });
            
            document.getElementById('adminAccentColorText').addEventListener('input', function(e) {
                const color = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/i.test(color)) {
                    document.getElementById('adminAccentColor').value = color;
                    // Apply color immediately for preview
                    applyAccentColor(color);
                    markUnsavedChanges();
                }
            });
            
            // Add save button listener
            document.getElementById('adminSaveBtn').addEventListener('click', saveAllChanges);
            
            // Add video button listener
            document.getElementById('adminAddVideoBtn').addEventListener('click', openAddVideoPopup);
            
            // Manage categories button listener
            document.getElementById('adminManageCategoriesBtn').addEventListener('click', openManageCategoriesPopup);
            
            // Manage tags button listener
            document.getElementById('adminManageTagsBtn').addEventListener('click', openManageTagsPopup);
            
            // Organize videos button listener
            document.getElementById('adminOrganizeVideosBtn').addEventListener('click', toggleOrganizeMode);
            
            // Exit edit button listener
            document.getElementById('adminExitBtn').addEventListener('click', function() {
                if (hasUnsavedChanges) {
                    if (confirm('You have unsaved changes. Are you sure you want to exit edit mode?')) {
                        exitEditMode();
                    }
                } else {
                    exitEditMode();
                }
            });
            
            console.log('Edit mode enabled');
        }

        function exitEditMode() {
            isEditMode = false;
            isOrganizeMode = false; // Exit organize mode when exiting edit mode
            clearSavedPageEditorToken();
            document.body.classList.remove('edit-mode');
            document.body.classList.remove('organize-mode');
            document.getElementById('loginLink').textContent = 'Login';
            document.getElementById('adminBanner').style.display = 'none';
            
            // Update organize button text
            document.getElementById('adminOrganizeVideosBtn').textContent = 'Organize Videos';
            
            console.log('Edit mode disabled');
        }

        // Organize Mode Functions
        function toggleOrganizeMode() {
            if (isOrganizeMode) {
                exitOrganizeMode();
            } else {
                enterOrganizeMode();
            }
        }

        function enterOrganizeMode() {
            isOrganizeMode = true;
            document.body.classList.add('organize-mode');
            document.getElementById('adminOrganizeVideosBtn').textContent = 'Exit Organize';
            
            console.log('Organize mode enabled');
        }

        function exitOrganizeMode() {
            isOrganizeMode = false;
            document.body.classList.remove('organize-mode');
            document.getElementById('adminOrganizeVideosBtn').textContent = 'Organize Videos';
            
            console.log('Organize mode disabled');
        }

        // Unsaved changes tracking
        let hasUnsavedChanges = false;

        // ===== ADMIN STATE MANAGEMENT =====
        
        /**
         * Marks that there are unsaved changes and shows indicator
         */
        function markUnsavedChanges() {
            hasUnsavedChanges = true;
            document.getElementById('unsavedIndicator').classList.add('show');
        }

        function clearUnsavedChanges() {
            hasUnsavedChanges = false;
            document.getElementById('unsavedIndicator').classList.remove('show');
        }

        // Keyboard shortcuts
        /**
         * Global keyboard shortcuts handler
         * Supports admin shortcuts like Ctrl+S, Ctrl+A, Esc, etc.
         */
        document.addEventListener('keydown', function(e) {
            // Only handle shortcuts in edit mode
            if (!isEditMode) {
                // Show shortcuts help with ? key even outside edit mode
                if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    const shortcuts = document.getElementById('keyboardShortcuts');
                    shortcuts.classList.toggle('show');
                }
                return;
            }

            // Ctrl+S - Save changes
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                saveAllChanges();
            }
            
            // Escape - Exit edit mode
            else if (e.key === 'Escape' && !document.querySelector('.login-overlay[style*="flex"]') && !document.querySelector('.add-video-overlay[style*="flex"]') && !document.querySelector('.edit-video-overlay[style*="flex"]')) {
                e.preventDefault();
                if (hasUnsavedChanges) {
                    if (confirm('You have unsaved changes. Are you sure you want to exit edit mode?')) {
                        exitEditMode();
                    }
                } else {
                    exitEditMode();
                }
            }

            // Ctrl+A - Add video
            else if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                openAddVideoPopup();
            }
            
            // ? - Toggle keyboard shortcuts help
            else if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                const shortcuts = document.getElementById('keyboardShortcuts');
                shortcuts.classList.toggle('show');
            }
        });

        // Category inline editing and deletion
        function addCategoryEditListeners() {
            document.querySelectorAll('.tag:not(.add-category-btn)').forEach(tag => {
                if (tag.dataset.category === 'all') return; // Skip "All" category
                
                // Double-click to edit category name
                tag.addEventListener('dblclick', function(e) {
                    if (!isEditMode) return;
                    e.stopPropagation();
                    editCategoryName(this);
                });
                
                // Click on X to delete tag
                tag.addEventListener('click', function(e) {
                    if (!isEditMode) return;
                    
                    // Check if Ctrl/Cmd+click for icon editing
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        editCategoryIcon(this);
                        return;
                    }
                    
                    // Check if click is on the X button area (top-right corner)
                    const rect = this.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const clickY = e.clientY - rect.top;
                    
                    // X button is positioned at top: -8px, right: -8px with 18px x 18px dimensions
                    // So it extends from (width-8) to (width+10) horizontally and from -8 to 10 vertically
                    if (clickX > rect.width - 8 && clickX < rect.width + 10 && clickY > -8 && clickY < 10) {
                        e.stopPropagation();
                        deleteCategoryWithReassignment(this);
                    }
                });
            });
        }

        function editCategoryIcon(categoryElement) {
            openIconPickerDialog(categoryElement, availableIcons, function(selectedIcon, categoryId) {
                markUnsavedChanges();
                console.log(`Category ${categoryId} icon updated to: ${selectedIcon}`);
            });
        }

        function editCategoryName(categoryElement) {
            const currentName = categoryElement.textContent;
            const currentId = categoryElement.dataset.category;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'category-editing';
            
            categoryElement.replaceWith(input);
            input.focus();
            input.select();
            
            function saveCategoryName() {
                const newName = input.value.trim();
                if (newName && newName !== currentName) {
                    categoryElement.textContent = newName;
                    
                    // Update all videos with this category
                    const videoItems = document.querySelectorAll(`[data-category="${currentId}"]`);
                    videoItems.forEach(item => {
                        const tagsContainer = item.querySelector('.item-tags');
                        if (tagsContainer) {
                            // Find and update the specific tag pill
                            const tagPills = tagsContainer.querySelectorAll('.item-tag-pill');
                            tagPills.forEach(pill => {
                                if (pill.textContent.toLowerCase() === currentName.toLowerCase()) {
                                    pill.textContent = newName.charAt(0).toUpperCase() + newName.slice(1);
                                }
                            });
                        }
                    });
                    
                    markUnsavedChanges();
                    console.log('Category renamed from', currentName, 'to', newName);
                } else {
                    categoryElement.textContent = currentName;
                }
                input.replaceWith(categoryElement);
                
                // Re-add listeners
                addCategoryEditListeners();
            }
            
            input.addEventListener('blur', saveCategoryName);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    saveCategoryName();
                } else if (e.key === 'Escape') {
                    categoryElement.textContent = currentName;
                    input.replaceWith(categoryElement);
                    addCategoryEditListeners();
                }
            });
        }

        function deleteCategoryWithReassignment(categoryElement) {
            const categoryId = categoryElement.dataset.category;
            const categoryName = categoryElement.textContent;
            
            // Count videos in this category
            const videosInCategory = document.querySelectorAll(`[data-category="${categoryId}"]`);
            
            if (videosInCategory.length === 0) {
                // No videos, safe to delete
                if (confirm(`Delete category "${categoryName}"?`)) {
                    categoryElement.remove();
                    markUnsavedChanges();
                    console.log('Category deleted:', categoryName);
                }
                return;
            }
            
            // Get available categories for reassignment
            const availableCategories = Array.from(document.querySelectorAll('.tag:not(.add-category-btn)'))
                .filter(tag => tag.dataset.category !== 'all' && tag.dataset.category !== categoryId)
                .map(tag => ({ id: tag.dataset.category, name: tag.textContent }));
            
            if (availableCategories.length === 0) {
                alert('Cannot delete the last tag. Create another tag first.');
                return;
            }
            
            // Create reassignment dialog
            const reassignmentOptions = availableCategories.map(cat => 
                `<option value="${cat.id}">${cat.name}</option>`
            ).join('');
            
            openDeleteTagDialog(categoryName, videosInCategory.length, reassignmentOptions, function(newCategoryId) {
                const newCategoryName = availableCategories.find(cat => cat.id === newCategoryId).name;
                
                // Reassign all videos
                reassignVideosToCategory(videosInCategory, categoryName, newCategoryId, newCategoryName, {
                    escapeStr: escapeForOnclick
                });
                
                categoryElement.remove();
                markUnsavedChanges();
                
                console.log(`Category "${categoryName}" deleted, ${videosInCategory.length} videos reassigned to "${newCategoryName}"`);
            }, {
                selectPlaceholder: 'Select category...',
                reassignPrompt: 'Choose a category to reassign them to:'
            });
        }

        function addEditListeners() {
            // Add click listeners to titles and categories for inline editing
            document.querySelectorAll('.item-title').forEach(title => {
                title.addEventListener('click', function(e) {
                    if (!isEditMode) return;
                    e.stopPropagation();
                    editTitle(this);
                });
            });

            document.querySelectorAll('.item-tag-pill').forEach(tagPill => {
                tagPill.addEventListener('click', function(e) {
                    e.stopPropagation();
                    
            if (isEditMode) {
                        editCategory(this);
            } else {
                        // In non-edit mode, activate the category
                        const categoryName = this.textContent.toLowerCase();
                        activateCategory(categoryName);
                    }
                });
            });

            // Add event listeners for thumbnail close overlays
            document.querySelectorAll('.thumbnail-close-overlay').forEach(overlay => {
                overlay.addEventListener('click', function(e) {
                    e.stopPropagation(); // Prevent video click
                });
                
                const closeButton = overlay.querySelector('.thumbnail-close-button');
                if (closeButton) {
                    closeButton.addEventListener('click', function(e) {
                        e.stopPropagation(); // Prevent video click
                stopVideoAndClosePlayer();
                    });
                }
            });

            // Add drag and drop for video reordering
            const videoGrid = document.getElementById('videoGrid');
            
            // Add container-level event listeners for better drag handling
            videoGrid.addEventListener('dragover', handleContainerDragOver);
            videoGrid.addEventListener('drop', handleVideoDrop);
            
            document.querySelectorAll('.video-item').forEach(item => {
                item.draggable = true;
                item.addEventListener('dragstart', handleVideoDragStart);
                item.addEventListener('dragend', handleVideoDragEnd);
            });

            // Add category management (only if element exists)
            const addCategoryBtn = document.getElementById('addCategoryBtn');
            if (addCategoryBtn) {
                addCategoryBtn.addEventListener('click', createNewCategory);
            }
            
            // Add drag and drop for category reordering
            document.querySelectorAll('.tag:not(.add-category-btn)').forEach(tag => {
                tag.draggable = true;
                tag.addEventListener('dragstart', handleCategoryDragStart);
                tag.addEventListener('dragover', handleCategoryDragOver);
                tag.addEventListener('drop', handleCategoryDrop);
                tag.addEventListener('dragend', handleCategoryDragEnd);
            });
        }

        function editTitle(titleElement) {
            const currentTitle = titleElement.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentTitle;
            input.style.background = '#2a2a2a';
            input.style.border = '1px solid var(--accent-color)';
            input.style.borderRadius = '4px';
            input.style.padding = '4px 8px';
            input.style.color = '#ffffff';
            input.style.fontSize = '14px';
            input.style.width = '100%';
            
            titleElement.replaceWith(input);
            input.focus();
            input.select();
            
            function saveTitle() {
                const newTitle = input.value.trim();
                if (newTitle && newTitle !== currentTitle) {
                    titleElement.textContent = newTitle;
                    markUnsavedChanges();
                    console.log('Title changed from', currentTitle, 'to', newTitle);
                } else {
                    titleElement.textContent = currentTitle;
                }
                    input.replaceWith(titleElement);
                    }
            
            input.addEventListener('blur', saveTitle);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    saveTitle();
                } else if (e.key === 'Escape') {
                    titleElement.textContent = currentTitle;
                    input.replaceWith(titleElement);
                }
            });
        }

        function editCategory(tagElement) {
            const currentCategory = tagElement.textContent.toLowerCase();
            const select = document.createElement('select');
            select.style.background = '#2a2a2a';
            select.style.border = '1px solid var(--accent-color)';
            select.style.borderRadius = '4px';
            select.style.padding = '4px 8px';
            select.style.color = '#ffffff';
            select.style.fontSize = '11px';
            
            // Add category options (you'd get these from your categories data)
            const categories = ['ballet', 'jazz', 'contemporary', 'tap', 'hip hop'];
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
                option.selected = cat === currentCategory;
                select.appendChild(option);
            });
            
            tagElement.replaceWith(select);
            select.focus();
            
            function saveCategory() {
                const newCategory = select.value;
                            if (newCategory !== currentCategory) {
                tagElement.textContent = newCategory.charAt(0).toUpperCase() + newCategory.slice(1);
                markUnsavedChanges();
                console.log('Category changed from', currentCategory, 'to', newCategory);
            }
                select.replaceWith(tagElement);
            }
            
            select.addEventListener('blur', saveCategory);
            select.addEventListener('change', saveCategory);
            select.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    select.replaceWith(tagElement);
                }
            });
        }

        // Video Drag and Drop functionality
        let draggedVideoElement = null;
        let placeholder = null;
        let lastPlaceholderPosition = null;
        let dragOverTimer = null;

        function createPlaceholder(element) {
            const rect = element.getBoundingClientRect();
            const ph = document.createElement('div');
            ph.classList.add('drag-placeholder', 'video-item');
            ph.style.width = rect.width + 'px';
            ph.style.height = rect.height + 'px';
            return ph;
        }

        function handleVideoDragStart(e) {
            if (!isEditMode || !isOrganizeMode) return;
            draggedVideoElement = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setDragImage(this, e.offsetX, e.offsetY);
            
            // Create placeholder but don't insert it yet
            placeholder = createPlaceholder(this);
            
            // Hide the dragged element after a short delay to allow drag image to be created
            setTimeout(() => {
                this.style.visibility = 'hidden';
                // Insert placeholder where the element was
                this.parentNode.insertBefore(placeholder, this);
            }, 0);
            
            // Add cursor style
            document.body.style.cursor = 'grabbing';
        }

        function updatePlaceholderPosition(e) {
            if (!isEditMode || !draggedVideoElement || !placeholder) return;
            
            const grid = document.getElementById('videoGrid');
            const afterElement = getDragAfterElement(grid, e.clientX, e.clientY);
            
            // Check if position actually changed
            const newPosition = afterElement ? afterElement.previousElementSibling : null;
            if (newPosition !== lastPlaceholderPosition) {
                lastPlaceholderPosition = newPosition;
                
                if (afterElement == null) {
                    grid.appendChild(placeholder);
                } else {
                    grid.insertBefore(placeholder, afterElement);
                }
            }
        }

        function handleVideoDragOver(e) {
            if (!isEditMode || !isOrganizeMode || !draggedVideoElement || !placeholder) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            // Debounce the placeholder update to reduce flickering
            clearTimeout(dragOverTimer);
            dragOverTimer = setTimeout(() => {
                updatePlaceholderPosition(e);
            }, 50);
        }
        
        function handleContainerDragOver(e) {
            if (!isEditMode || !isOrganizeMode || !draggedVideoElement || !placeholder) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            // Debounce the placeholder update to reduce flickering
            clearTimeout(dragOverTimer);
            dragOverTimer = setTimeout(() => {
                updatePlaceholderPosition(e);
            }, 50);
        }

        function handleVideoDrop(e) {
            if (!isEditMode || !isOrganizeMode || !draggedVideoElement || !placeholder) return;
            e.preventDefault();
            
            // Don't drop on itself
            if (e.target === draggedVideoElement) return;
            
            // Replace placeholder with actual element
            if (placeholder && placeholder.parentNode) {
                placeholder.parentNode.replaceChild(draggedVideoElement, placeholder);
                markUnsavedChanges();
                console.log('Video dropped at new position');
            }
        }

        function handleVideoDragEnd(e) {
            if (!isEditMode || !isOrganizeMode) return;
            
            // Clear any pending timer
            clearTimeout(dragOverTimer);
            
            // Show the element again
            if (draggedVideoElement) {
                draggedVideoElement.style.visibility = '';
                draggedVideoElement.classList.remove('dragging');
            }
            
            // Clean up placeholder
            if (placeholder && placeholder.parentNode) {
                placeholder.parentNode.removeChild(placeholder);
            }
            
            // Remove all drag-over classes
            document.querySelectorAll('.video-item').forEach(item => {
                item.classList.remove('drag-over');
            });
            
            // Reset cursor
            document.body.style.cursor = '';
            
            // Reset variables
            draggedVideoElement = null;
            placeholder = null;
            lastPlaceholderPosition = null;
            dragOverTimer = null;
        }

        function getDragAfterElement(container, x, y) {
            const draggableElements = [...container.querySelectorAll('.video-item:not(.dragging):not(.drag-placeholder)')];
            
            // If no elements, return null
            if (draggableElements.length === 0) return null;
            
            // Find the element that the cursor is over or closest to
            let targetElement = null;
            let insertBefore = false;
            
            // First, check if we're directly over an element
            for (const element of draggableElements) {
                const box = element.getBoundingClientRect();
                
                if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
                    // We're over this element
                    const centerX = box.left + box.width / 2;
                    const centerY = box.top + box.height / 2;
                    
                    // Determine if we should insert before or after based on position
                    // For grid layouts, consider both horizontal and vertical position
                    if (y < centerY - box.height / 4) {
                        // Clearly above center - insert before
                        insertBefore = true;
                    } else if (y > centerY + box.height / 4) {
                        // Clearly below center - insert after
                        insertBefore = false;
                    } else {
                        // In the middle band - use horizontal position
                        insertBefore = x < centerX;
                    }
                    
                    targetElement = element;
                    break;
                }
            }
            
            // If we're not directly over an element, find the closest one
            if (!targetElement) {
                let closestDistance = Number.POSITIVE_INFINITY;
                
                draggableElements.forEach(element => {
                    const box = element.getBoundingClientRect();
                    const centerX = box.left + box.width / 2;
                    const centerY = box.top + box.height / 2;
                    
                    const distance = Math.sqrt(
                        Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
                    );
                    
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        targetElement = element;
                        
                        // For the closest element, determine position based on relative location
                        if (y < box.top) {
                            // Above the element
                            insertBefore = true;
                        } else if (y > box.bottom) {
                            // Below the element
                            insertBefore = false;
                        } else {
                            // Same row - use horizontal position
                            insertBefore = x < centerX;
                        }
                    }
                });
            }
            
            if (!targetElement) return null;
            
            return insertBefore ? targetElement : targetElement.nextElementSibling;
        }

        // Helper function to escape strings for onclick handlers
        function escapeForOnclick(str) {
            return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
        }

        // Delete video with confirmation
        async function deleteVideo(event, wistiaId) {
            console.log('🗑️ Delete button clicked for video:', wistiaId);
            event.stopPropagation();
            event.preventDefault();
            
            if (!isEditMode) {
                console.log('🗑️ Not in edit mode, ignoring delete');
                return;
            }
            
            // Find the video in the videos array
            const video = videos.find(v => v.wistiaId === wistiaId);
            if (!video) return;
            
            openDeleteVideoDialog(video.title, async function() {
                const index = videos.findIndex(v => v.wistiaId === wistiaId);
                if (index !== -1) {
                    videos.splice(index, 1);
                }
                
                if (featuredContent.videoId === wistiaId) {
                    featuredContent.videoId = null;
                    featuredContent.category = null;
                }
                
                const videoElement = document.querySelector(`[data-wistia="${wistiaId}"]`);
                if (videoElement) {
                    videoElement.remove();
                }
                
                markUnsavedChanges();
                
                const allVideoElements = document.querySelectorAll('.video-item');
                const currentVideos = Array.from(allVideoElements).map(element => ({
                    category: element.dataset.category || 'all-songs'
                }));
                hideCategoryDropdownIfAllVideosAreAll(currentVideos);
                
                console.log(`Video "${video.title}" deleted and removed from display`);
            });
        }

        // Move video using arrow controls
        function moveVideo(event, wistiaId, direction) {
            event.stopPropagation();
            event.preventDefault();
            
            if (!isEditMode || !isOrganizeMode) return;
            
            const grid = document.getElementById('videoGrid');
            const videoItems = Array.from(grid.querySelectorAll('.video-item'));
            const currentItem = videoItems.find(item => item.dataset.wistia === wistiaId);
            
            if (!currentItem) return;
            
            const currentIndex = videoItems.indexOf(currentItem);
            const columns = getGridColumns();
            let targetIndex;
            
            switch (direction) {
                case 'up':
                    targetIndex = currentIndex - columns;
                    break;
                case 'down':
                    targetIndex = currentIndex + columns;
                    break;
                case 'left':
                    targetIndex = currentIndex - 1;
                    break;
                case 'right':
                    targetIndex = currentIndex + 1;
                    break;
            }
            
            // Validate target index
            if (targetIndex < 0 || targetIndex >= videoItems.length) return;
            
            // For left/right movement, check if we're crossing row boundaries
            if (direction === 'left' || direction === 'right') {
                const currentRow = Math.floor(currentIndex / columns);
                const targetRow = Math.floor(targetIndex / columns);
                if (currentRow !== targetRow) return;
            }
            
            // Perform the swap
            const targetItem = videoItems[targetIndex];
            
            // Animate the movement
            currentItem.style.transition = 'all 0.3s ease';
            targetItem.style.transition = 'all 0.3s ease';
            
            // Swap positions in DOM
            if (targetIndex < currentIndex) {
                grid.insertBefore(currentItem, targetItem);
            } else {
                grid.insertBefore(targetItem, currentItem);
            }
            
            // Mark as changed
            markUnsavedChanges();
            
            // Re-render to update arrow visibility and dropdown
            setTimeout(() => {
                const allVideoElements = document.querySelectorAll('.video-item');
                const currentVideos = Array.from(allVideoElements).map(element => ({
                    category: element.dataset.category || 'all-songs'
                }));
                hideCategoryDropdownIfAllVideosAreAll(currentVideos);
            }, 300);
        }
        
        // Helper function to get grid columns (also used in moveVideo)
        function getGridColumns() {
            const width = window.innerWidth;
            if (width >= 1200) return 4;
            if (width >= 768) return 3;
            return 2;
        }

        // Category Drag and Drop functionality
        let draggedCategoryElement = null;

        function handleCategoryDragStart(e) {
            if (!isEditMode) return;
            draggedCategoryElement = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        }

        function handleCategoryDragOver(e) {
            if (!isEditMode) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }

        function handleCategoryDrop(e) {
            if (!isEditMode) return;
            e.preventDefault();
            
            if (draggedCategoryElement !== this && !this.classList.contains('add-category-btn')) {
                const tagsContainer = document.querySelector('.tags');
                const draggedIndex = Array.from(tagsContainer.children).indexOf(draggedCategoryElement);
                const targetIndex = Array.from(tagsContainer.children).indexOf(this);
                
                if (draggedIndex < targetIndex) {
                    this.parentNode.insertBefore(draggedCategoryElement, this.nextSibling);
                } else {
                    this.parentNode.insertBefore(draggedCategoryElement, this);
                }
                
                console.log('Category reordered from position', draggedIndex, 'to', targetIndex);
                markUnsavedChanges();
            }
        }

        function handleCategoryDragEnd(e) {
            if (!isEditMode) return;
            this.classList.remove('dragging');
            draggedCategoryElement = null;
        }

        // Create new category functionality
        function createNewCategory() {
            const categoryName = prompt('Enter new category name:');
            if (categoryName && categoryName.trim()) {
                const newTag = document.createElement('div');
                newTag.className = 'tag';
                newTag.setAttribute('data-category', categoryName.toLowerCase());
                newTag.textContent = categoryName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                
                // Insert before the last category (or at the end)
                const tagsContainer = document.querySelector('.tags');
                const addBtn = document.getElementById('addCategoryBtn');
                tagsContainer.insertBefore(newTag, addBtn.nextSibling);
                
                // Add drag functionality to new tag
                newTag.draggable = true;
                newTag.addEventListener('dragstart', handleCategoryDragStart);
                newTag.addEventListener('dragover', handleCategoryDragOver);
                newTag.addEventListener('drop', handleCategoryDrop);
                newTag.addEventListener('dragend', handleCategoryDragEnd);
                
                // Add click functionality for filtering
                newTag.addEventListener('click', () => {
                    if (isEditMode) return; // Don't filter in edit mode
                    document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
                    newTag.classList.add('active');

                    const category = newTag.dataset.category;
                    const videoItems = document.querySelectorAll('.video-item');
                    
                    videoItems.forEach(item => {
                        if (category === 'all-songs' || item.dataset.category === category) {
                            item.classList.remove('hidden');
                        } else {
                            item.classList.add('hidden');
                        }
                    });
                });
                
                console.log('New category created:', categoryName);
                markUnsavedChanges();
            }
        }

        // Save all changes functionality
        /**
         * Saves all pending changes to the server
         * Handles videos, categories, and page configuration
         */
        async function saveAllChanges() {
            const saveBtn = document.getElementById('adminSaveBtn');
            const originalText = saveBtn.textContent;
            
            // Show saving state
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
            saveBtn.style.opacity = '0.7';
            
            try {
                // Get current video data from server to ensure we don't lose any existing data
                const getResponse = await fetch(pageApiUrl('get-videos'));
                const allServerVideos = await getResponse.json();
                
                // Create a map of server videos for easy lookup
                const serverVideosMap = {};
                allServerVideos.forEach(video => {
                    serverVideosMap[video.wistiaId] = video;
                });
                
                // Collect all videos from the current grid (including newly added ones)
                const videos = [];
                document.querySelectorAll('.video-item').forEach((item, index) => {
                    const wistiaId = item.dataset.wistia;
                    const title = item.querySelector('.item-title').textContent;
                    const category = item.dataset.category;
                    const tags = item.dataset.tags ? item.dataset.tags.split(',') : [];
                    
                    // Use existing server data if available, otherwise create new video object
                    const serverVideo = serverVideosMap[wistiaId];
                    const video = {
                        id: serverVideo?.id || wistiaId, // Use wistiaId as id for new videos
                        wistiaId: wistiaId,
                        title: title,
                        category: category,
                        tags: tags,
                        urlString: serverVideo?.urlString || null, // Will be generated by server
                        order: index,
                        featured: wistiaId === featuredContent.videoId
                    };
                    
                    videos.push(video);
                });
                
                const categories = Array.from(document.querySelectorAll('.tag:not(.add-category-btn)')).map((tag, index) => {
                    const name = tag.textContent.trim();
                    const id = tag.dataset.category || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    return {
                        id: id,
                        name: name,
                        order: index
                    };
                }).filter(cat => cat.name && cat.id); // Filter out any invalid categories
                
                console.log('Saving videos:', videos);
                console.log('Saving categories:', categories);
                
                // Save videos
                const videoResponse = await fetch('/api/save-videos', {
                    method: 'POST',
                    headers: pageEditorHeaders(),
                    body: JSON.stringify({ videos: videos, page: pageKey })
                });
                
                await requirePageEditorResponse(videoResponse, 'Failed to save videos.');
                
                // Save categories
                const categoryResponse = await fetch('/api/save-categories', {
                    method: 'POST',
                    headers: pageEditorHeaders(),
                    body: JSON.stringify({ categories: categories, page: pageKey })
                });
                
                await requirePageEditorResponse(categoryResponse, 'Failed to save categories.');
                
                const videoResult = await videoResponse.json();
                const categoryResult = await categoryResponse.json();
                
                console.log('Save results:', { videos: videoResult, categories: categoryResult });
                
                // Save accent color if it has changed
                const currentAccentColor = document.getElementById('adminAccentColorText').value;
                console.log('🎨 DEBUG: Attempting to save accent color:', currentAccentColor);
                if (currentAccentColor && /^#[0-9A-Fa-f]{6}$/i.test(currentAccentColor)) {
                    const colorResponse = await fetch('/api/save-page-config', {
                        method: 'POST',
                        headers: pageEditorHeaders(),
                        body: JSON.stringify({
                            page: pageKey,
                            accent_color: currentAccentColor
                        })
                    });

                    await requirePageEditorResponse(colorResponse, 'Failed to save the accent color.');
                    const savedConfig = await colorResponse.json();
                    console.log('🎨 DEBUG: Successfully saved accent color:', savedConfig);
                }
                
                // Show success state
                saveBtn.textContent = 'Saved!';
                saveBtn.style.background = 'rgba(52, 199, 89, 0.3)';
                saveBtn.style.borderColor = 'rgba(52, 199, 89, 0.5)';
                
                // Clear unsaved changes
                clearUnsavedChanges();
                
                // Clear localStorage cache to ensure changes are visible immediately
                localStorage.removeItem(pageCacheKey('videos'));
                localStorage.removeItem(pageCacheKey('categories'));
                console.log('🗑️ Cleared localStorage cache - changes will be visible on next load');
                
                // Reset button after 2 seconds
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.disabled = false;
                    saveBtn.style.opacity = '1';
                    saveBtn.style.background = 'rgba(255, 255, 255, 0.2)';
                    saveBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }, 2000);
                
            } catch (error) {
                console.error('Save failed:', error);
                
                // Show error state
                saveBtn.textContent = 'Save Failed';
                saveBtn.style.background = 'rgba(255, 59, 48, 0.3)';
                saveBtn.style.borderColor = 'rgba(255, 59, 48, 0.5)';
                
                // Reset button after 3 seconds
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.disabled = false;
                    saveBtn.style.opacity = '1';
                    saveBtn.style.background = 'rgba(255, 255, 255, 0.2)';
                    saveBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }, 3000);
                
                // Show error to user
                alert(`Failed to save changes: ${error.message}`);
            }
        }

        // Featured Video System
        let featuredContent = {
            type: 'video', // 'video' or 'image'
            videoId: null,
            imageUrl: null,
            title: 'Featured Content'
        };

        function setFeaturedVideo(wistiaId) {
            // Remove featured class from all videos and buttons
            document.querySelectorAll('.video-item').forEach(item => {
                item.classList.remove('featured');
            });
            document.querySelectorAll('.featured-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Add featured class to selected video
            const videoItem = document.querySelector(`[data-wistia="${wistiaId}"]`);
            if (videoItem) {
                videoItem.classList.add('featured');
                // Add active class to the button
                const featuredBtn = videoItem.querySelector('.featured-btn');
                if (featuredBtn) {
                    featuredBtn.classList.add('active');
                }
                
                featuredContent.type = 'video';
                featuredContent.videoId = wistiaId;
                featuredContent.title = videoItem.dataset.title;
                
                // Load as default video
                loadWistiaVideo(wistiaId, featuredContent.title);
                
                markUnsavedChanges();
                console.log('Featured video set:', wistiaId);
            }
        }

        function openSetFeaturedDialog() {
            openFeaturedContentDialog(featuredContent, {
                onSetVideo: function(videoId) { setFeaturedVideo(videoId); },
                onSetImage: function(imageUrl) { setFeaturedImage(imageUrl); },
                onClear: function() { clearFeaturedContent(); }
            });
        }

        function setFeaturedImage(imageUrl) {
            // Remove featured class from all videos
            document.querySelectorAll('.video-item').forEach(item => {
                item.classList.remove('featured');
            });
            
            featuredContent.type = 'image';
            featuredContent.imageUrl = imageUrl;
            featuredContent.videoId = null;
            
            // Load image in main player
            loadFeaturedImage(imageUrl);
            
            markUnsavedChanges();
            console.log('Featured image set:', imageUrl);
        }

        function loadFeaturedImage(imageUrl) {
            const videoContainer = document.getElementById('wistia-player');
            videoContainer.innerHTML = `
                <div class="featured-image-placeholder">
                    <img src="${imageUrl}" alt="Featured Image" 
                         class="featured-img-cover"
                         data-img-hide-on-error="true">
                    <div class="featured-img-error">
                        <div class="icon">🖼️</div>
                        <div>Featured Image</div>
                        <div class="featured-img-error-sub">Image failed to load</div>
                    </div>
                </div>
            `;
            
            // Update title for featured image
            const titleElement = document.getElementById('current-video-title');
            if (titleElement) {
                titleElement.textContent = 'Featured Image';
            }
            
            // Update mobile title
            const mobileTitleElement = document.getElementById('mobile-video-title');
            if (mobileTitleElement) {
                mobileTitleElement.textContent = 'Featured Image';
            }
            
            // Clear active video state
            setActiveVideo(null);
        }

        function clearFeaturedContent() {
            // Remove featured class from all videos and buttons
            document.querySelectorAll('.video-item').forEach(item => {
                item.classList.remove('featured');
            });
            document.querySelectorAll('.featured-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            featuredContent = {
                type: 'video',
                videoId: null,
                imageUrl: null,
                title: 'Featured Content'
            };
            
            // Load first video as default
            const videos = Array.from(document.querySelectorAll('.video-item'));
            if (videos.length > 0) {
                const firstVideo = videos[0];
                loadWistiaVideo(firstVideo.dataset.wistia, firstVideo.dataset.title);
            }
            
            markUnsavedChanges();
            console.log('Featured content cleared');
        }

        // Update the initial video loading to check for featured content
        function loadInitialContent() {
            if (featuredContent.type === 'video' && featuredContent.videoId) {
                // Load featured video
                const featuredVideo = document.querySelector(`[data-wistia="${featuredContent.videoId}"]`);
                if (featuredVideo) {
                    featuredVideo.classList.add('featured');
                    loadWistiaVideo(featuredContent.videoId, featuredContent.title);
                    return;
                }
            } else if (featuredContent.type === 'image' && featuredContent.imageUrl) {
                // Show video container and load featured image
                const videoContainerElement = document.querySelector('.video-container');
                videoContainerElement.classList.add('active');
                loadFeaturedImage(featuredContent.imageUrl);
                return;
            }
            
            // Don't load any video by default - just show the grid
            console.log('No featured content set, showing grid only');
        }

        // Edit Video Popup Functions
        let currentEditingVideoId = null;

        function openEditVideoPopup(wistiaId, title, category) {
            console.log('✏️ Edit button clicked for video:', wistiaId, title, category);
            currentEditingVideoId = wistiaId;
            
            // Get current video element to extract tags
            const videoElement = document.querySelector(`[data-wistia="${wistiaId}"]`);
            const currentTags = videoElement && videoElement.dataset.tags ? videoElement.dataset.tags.split(',') : [];
            
            // Populate form with current values
            document.getElementById('editVideoTitle').value = title;
            document.getElementById('editVideoCategory').value = category;
            document.getElementById('editVideoId').value = wistiaId;
            
            // Populate category dropdown
            populateEditCategoryDropdown();
            
            // Populate tags container
            populateEditTagsContainer(currentTags);
            
            // Show popup
            document.getElementById('editVideoOverlay').style.display = 'flex';
            document.getElementById('editVideoTitle').focus();
        }

        function populateEditCategoryDropdown() {
            const select = document.getElementById('editVideoCategory');
            
            select.innerHTML = '<option value="">Select Category</option>';
            
            // Add "All" option
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = categoryPreferences.allLabel || 'All Songs';
            select.appendChild(allOption);
            
            // Get categories from server first, then fall back to predefined
            let categoriesToShow = [];
            
            if (window.serverCategories && window.serverCategories.length > 0) {
                // Use server categories - FILTER FOR ONLY SONG CATEGORIES (show_in_dropdown = true)
                categoriesToShow = window.serverCategories.filter(cat => 
                    cat.id !== 'all' && cat.show_in_dropdown !== false
                );
            } else {
                // Fall back to predefined categories
                categoriesToShow = predefinedCategories.filter(category => {
                    // Skip the "all-songs" category as it's not a selectable category for individual videos
                    if (category.id === 'all-songs') return false;
                    
                    // Check if this category should be shown in dropdown
                    let showInDropdown = category.showInDropdown !== undefined ? category.showInDropdown : true;
                    
                    // Override with user preference if available
                    if (categoryPreferences.categories && categoryPreferences.categories[category.id]) {
                        showInDropdown = categoryPreferences.categories[category.id].showInDropdown !== undefined 
                            ? categoryPreferences.categories[category.id].showInDropdown 
                            : true;
                    }
                    
                    return showInDropdown;
                });
            }
            
            // Add categories to dropdown
            categoriesToShow.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                
                // Add icon if available
                const icon = category.icon && availableIcons[category.icon] ? availableIcons[category.icon] + ' ' : '';
                option.textContent = icon + category.name;
                option.setAttribute('data-icon', category.icon || '');
                select.appendChild(option);
            });
            
            // Add any additional categories from loaded videos
            if (window.loadedVideos && window.loadedVideos.length > 0) {
                const additionalCategories = new Set();
                
                // Collect unique categories from loaded videos
                window.loadedVideos.forEach(video => {
                    if (video.category && video.category !== 'all-songs') {
                        // Check if it's not already in predefined categories
                        const isPredefined = predefinedCategories.some(pred => pred.id === video.category);
                        if (!isPredefined) {
                            additionalCategories.add(video.category);
                        }
                    }
                });
                
                // Add additional categories to dropdown
                additionalCategories.forEach(categoryId => {
                    const option = document.createElement('option');
                    option.value = categoryId;
                    // Convert category ID to display name (capitalize first letter of each word)
                    const displayName = categoryId.split('-').map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ');
                    option.textContent = displayName;
                    select.appendChild(option);
                });
            }
        }

        /**
         * Get available tags from managed categories (show_in_dropdown = false)
         */
        function getAvailableTags() {
            if (window.serverCategories && window.serverCategories.length > 0) {
                return window.serverCategories
                    .filter(cat => cat.show_in_dropdown === false)
                    .sort((a, b) => (a.order || 0) - (b.order || 0));
            }
            return [];
        }

        function populateEditTagsContainer(currentTags = []) {
            const tagContainer = document.getElementById('editTagSelectionContainer');
            tagContainer.innerHTML = '';
            
            const availableTags = getAvailableTags();
            
            availableTags.forEach(tag => {
                const tagSelector = document.createElement('div');
                tagSelector.className = 'tag-selector';
                tagSelector.dataset.tagId = tag.id;
                tagSelector.textContent = tag.name;
                
                // Mark as selected if it's in the current tags
                if (currentTags.includes(tag.id)) {
                    tagSelector.classList.add('selected');
                }
                
                tagSelector.addEventListener('click', function() {
                    this.classList.toggle('selected');
                });
                tagContainer.appendChild(tagSelector);
            });
        }

        // Edit Video Form Handlers
        document.getElementById('cancelEditVideo').addEventListener('click', function() {
            document.getElementById('editVideoOverlay').style.display = 'none';
            document.getElementById('editVideoError').style.display = 'none';
            currentEditingVideoId = null;
        });

        document.getElementById('editVideoForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const submitBtn = e.target.querySelector('.btn-save-video');
            const originalBtnText = submitBtn.textContent;
            
            // Show loading state
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving Changes...';
            
            try {
                const newTitle = document.getElementById('editVideoTitle').value.trim();
                const newCategory = document.getElementById('editVideoCategory').value;
                
                console.log('✏️ Submitting Edit Video form:', { id: currentEditingVideoId, title: newTitle, category: newCategory });
                
                // Enhanced validation
                if (!newTitle || !newCategory) {
                    throw new Error('Please fill in all fields');
                }
                
                // Validate title length
                if (newTitle.length < 3) {
                    throw new Error('Video title must be at least 3 characters long');
                }
                
                if (newTitle.length > 100) {
                    throw new Error('Video title must be less than 100 characters');
                }
                
                // Collect selected tags
                const selectedTags = Array.from(document.querySelectorAll('#editTagSelectionContainer .tag-selector.selected'))
                    .map(tag => tag.dataset.tagId);
            
            // Update the video item in the DOM
            const videoItem = document.querySelector(`[data-wistia="${currentEditingVideoId}"]`);
            if (videoItem) {
                videoItem.dataset.category = newCategory;
                videoItem.dataset.title = newTitle;
                videoItem.dataset.tags = selectedTags.join(',');
                videoItem.querySelector('.item-title').textContent = newTitle;
                
                // Update tags container with new pill structure
                const tagsContainer = videoItem.querySelector('.item-tags');
                if (tagsContainer) {
                    // Generate tag pills for all selected tags (filter out 'all' category)
                    const displayTags = selectedTags
                        .filter(tag => tag !== 'all')
                        .map(tag => {
                            const tagElement = document.querySelector(`[data-category="${tag}"]`);
                            const tagName = tagElement ? tagElement.textContent : tag;
                            return `<span class="item-tag-pill">${tagName.charAt(0).toUpperCase() + tagName.slice(1)}</span>`;
                        })
                        .join('');
                    tagsContainer.innerHTML = displayTags;
                }
                
                // Update the edit button data attributes to reflect new values
                const editBtn = videoItem.querySelector('.video-edit-btn');
                editBtn.dataset.wistiaId = currentEditingVideoId;
                editBtn.dataset.videoTitle = escapeForOnclick(newTitle);
                editBtn.dataset.videoCategory = escapeForOnclick(newCategory);
            }
            
                // CRITICAL: Update the video in the videos array so changes persist when saved
                const videoIndex = videos.findIndex(v => v.wistiaId === currentEditingVideoId);
                if (videoIndex !== -1) {
                    videos[videoIndex].title = newTitle;
                    videos[videoIndex].category = newCategory;
                    videos[videoIndex].tags = selectedTags;
                    console.log('📝 Updated videos array:', videos[videoIndex]);
                }
            
                console.log('✅ Video updated successfully:', { id: currentEditingVideoId, title: newTitle, category: newCategory, tags: selectedTags });
                
                // Mark as having unsaved changes
                markUnsavedChanges();
                
                // Close popup
                document.getElementById('editVideoOverlay').style.display = 'none';
                document.getElementById('editVideoError').style.display = 'none';
                currentEditingVideoId = null;
                
                // Here you would save to server
                
            } catch (error) {
                console.error('❌ Error updating video:', error);
                document.getElementById('editVideoError').textContent = error.message;
                document.getElementById('editVideoError').style.display = 'block';
            } finally {
                // Reset button state
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        });

        document.getElementById('deleteVideoBtn').addEventListener('click', function() {
            const videoTitle = document.getElementById('editVideoTitle').value.trim();
            const confirmMessage = `Are you sure you want to delete "${videoTitle}"?\n\nThis action cannot be undone and will permanently remove the video from your collection.`;
            
            if (confirm(confirmMessage)) {
                console.log('🗑️ Deleting video:', currentEditingVideoId, videoTitle);
                // Remove from videos array
                const index = videos.findIndex(v => v.wistiaId === currentEditingVideoId);
                if (index !== -1) {
                    videos.splice(index, 1);
                }
                
                // If this was the featured video, clear featured status
                if (featuredContent.videoId === currentEditingVideoId) {
                    featuredContent.videoId = null;
                    featuredContent.category = null;
                }
                
                // Remove the video element from the DOM
                const videoItem = document.querySelector(`[data-wistia="${currentEditingVideoId}"]`);
                if (videoItem) {
                    videoItem.remove();
                    console.log('Video deleted from edit popup:', currentEditingVideoId);
                    
                    // Mark as having unsaved changes
                    markUnsavedChanges();
                    
                    // Update categories dropdown visibility
                    const allVideoElements = document.querySelectorAll('.video-item');
                    const currentVideos = Array.from(allVideoElements).map(element => ({
                        category: element.dataset.category || 'all-songs'
                    }));
                    hideCategoryDropdownIfAllVideosAreAll(currentVideos);
                    
                    // Close popup
                    document.getElementById('editVideoOverlay').style.display = 'none';
                    document.getElementById('editVideoError').style.display = 'none';
                    currentEditingVideoId = null;
                }
            }
        });

        // Add Video Popup Functions
        function openAddVideoPopup() {
            console.log('🎬 DEBUG: === OPENING ADD VIDEO POPUP ===');
            
            // Reset form
            console.log('🎬 DEBUG: Resetting add video form');
            document.getElementById('addVideoForm').reset();
            document.getElementById('addVideoError').style.display = 'none';
            
            // Populate category dropdown
            console.log('🎬 DEBUG: Populating category dropdown');
            populateAddCategoryDropdown();
            
            // Show popup
            console.log('🎬 DEBUG: Showing add video overlay');
            document.getElementById('addVideoOverlay').style.display = 'flex';
            document.getElementById('wistiaLink').focus();
            
            console.log('🎬 DEBUG: Add video popup opened successfully');
        }

        async function populateAddCategoryDropdown() {
            console.log('📋 DEBUG: === POPULATING ADD VIDEO CATEGORY DROPDOWN ===');
            
            const select = document.getElementById('newVideoCategory');
            console.log('📋 DEBUG: Found category select element:', select);
            
            if (!select) {
                console.error('📋 ERROR: Category select element not found');
                return;
            }
            
            // Clear and set default option
            select.innerHTML = '<option value="">Select Category</option>';
            
            // Add "All" as the default selected option
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = categoryPreferences.allLabel || 'All';
            allOption.selected = true;
            select.appendChild(allOption);
            
            // Get categories from server first, then fall back to predefined
            let categoriesToShow = [];
            
            if (window.serverCategories && window.serverCategories.length > 0) {
                // Use server categories - FILTER FOR ONLY SONG CATEGORIES (show_in_dropdown = true)
                categoriesToShow = window.serverCategories.filter(cat => 
                    cat.id !== 'all' && cat.show_in_dropdown !== false
                );
            } else {
                // Fall back to predefined categories
                categoriesToShow = predefinedCategories.filter(category => {
                    // Skip the "all-songs" category as it's just for the main filter
                    if (category.id === 'all-songs') return false;
                    
                    // Check if this category should be shown in dropdown
                    let showInDropdown = category.showInDropdown !== undefined ? category.showInDropdown : true;
                    
                    // Override with user preference if available
                    if (categoryPreferences.categories && categoryPreferences.categories[category.id]) {
                        showInDropdown = categoryPreferences.categories[category.id].showInDropdown !== undefined 
                            ? categoryPreferences.categories[category.id].showInDropdown 
                            : true;
                    }
                    
                    return showInDropdown;
                });
            }
            
            // Sort categories: "More Coming Soon" or similar should appear at the bottom
            categoriesToShow.sort((a, b) => {
                const aIsMore = /more|coming|soon/i.test(a.name);
                const bIsMore = /more|coming|soon/i.test(b.name);
                
                if (aIsMore && !bIsMore) return 1;  // a goes to bottom
                if (!aIsMore && bIsMore) return -1; // b goes to bottom
                
                // Both are "more" or both are regular - sort alphabetically
                return a.name.localeCompare(b.name);
            });
            
            // Add categories to dropdown
            categoriesToShow.forEach(category => {
                console.log('📋 DEBUG: Adding category:', category.id, category.name);
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                
                // If it's a "more coming soon" type category, make it disabled
                if (/more|coming|soon/i.test(category.name)) {
                    option.disabled = true;
                }
                
                select.appendChild(option);
            });
            
            // Add any additional categories from video data that aren't predefined
            const additionalCategories = new Set();
            if (window.loadedVideos && Array.isArray(window.loadedVideos)) {
                window.loadedVideos.forEach(video => {
                    if (video.category && video.category !== 'all-songs') {
                        // Check if it's not already in predefined categories
                        const isPredefined = predefinedCategories.some(pred => pred.id === video.category);
                        if (!isPredefined) {
                            additionalCategories.add(video.category);
                        }
                    }
                });
            }
            
            // Add additional categories
            additionalCategories.forEach(categoryId => {
                console.log('📋 DEBUG: Adding additional category:', categoryId);
                const option = document.createElement('option');
                option.value = categoryId;
                // Convert category ID to display name (capitalize and format)
                option.textContent = categoryId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                select.appendChild(option);
            });
            
            console.log('📋 DEBUG: Add video category dropdown populated with', select.children.length - 1, 'categories');
            
            // Also populate tag selection (using managed tags from database)
            const tagContainer = document.getElementById('tagSelectionContainer');
            tagContainer.innerHTML = '';
            
            const availableTags = getAvailableTags();
            
            availableTags.forEach(tag => {
                const tagSelector = document.createElement('div');
                tagSelector.className = 'tag-selector';
                tagSelector.dataset.tagId = tag.id;
                tagSelector.textContent = tag.name;
                tagSelector.addEventListener('click', function() {
                    this.classList.toggle('selected');
                });
                tagContainer.appendChild(tagSelector);
            });
        }

        // Wistia Link Parsing and Title Fetching
        function extractWistiaId(url) {
            // Handle various Wistia URL formats:
            // https://videosharepro.wistia.com/medias/abc123
            // https://fast.wistia.net/embed/iframe/abc123
            // https://videosharepro.wistia.com/embed/iframe/abc123
            // abc123 (direct ID)
            
            if (!url) return null;
            
            // If it's already just an ID (alphanumeric string)
            if (/^[a-zA-Z0-9]+$/.test(url.trim())) {
                return url.trim();
            }
            
            // Extract from various URL patterns
            const patterns = [
                /wistia\.com\/medias\/([a-zA-Z0-9]+)/,
                /wistia\.net\/embed\/iframe\/([a-zA-Z0-9]+)/,
                /wistia\.com\/embed\/iframe\/([a-zA-Z0-9]+)/,
                /fast\.wistia\.com\/embed\/iframe\/([a-zA-Z0-9]+)/
            ];
            
            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match) {
                    return match[1];
                }
            }
            
            return null;
        }

        async function fetchWistiaVideoData(wistiaId) {
            try {
                const response = await fetch(`https://fast.wistia.com/oembed?url=https://videosharepro.wistia.com/medias/${wistiaId}&format=json`);
                const data = await response.json();
                
                return {
                    title: data.title || 'Untitled Video',
                    duration: data.duration || 0,
                    thumbnail: data.thumbnail_url || null
                };
            } catch (error) {
                console.error('Failed to fetch Wistia data:', error);
                return {
                    title: 'Untitled Video',
                    duration: 0,
                    thumbnail: null
                };
            }
        }

        // Wistia Link Input Handler
        document.getElementById('wistiaLink').addEventListener('input', async function(e) {
            const url = e.target.value.trim();
            const titleInput = document.getElementById('newVideoTitle');
            const errorDiv = document.getElementById('addVideoError');
            
            // Clear any previous errors
            errorDiv.style.display = 'none';
            
            if (!url) {
                titleInput.value = '';
                titleInput.placeholder = 'Video title will be loaded...';
                titleInput.style.borderColor = '';
                e.target.style.borderColor = '';
                return;
            }
            
            const wistiaId = extractWistiaId(url);
            
            if (wistiaId) {
                console.log('🎬 Valid Wistia ID detected:', wistiaId);
                e.target.style.borderColor = '#4CAF50'; // Green border for valid URL
                titleInput.placeholder = 'Loading title...';
                titleInput.disabled = true;
                titleInput.style.borderColor = '';
                
                try {
                    const videoData = await fetchWistiaVideoData(wistiaId);
                    
                    if (videoData && videoData.title) {
                        titleInput.value = videoData.title;
                        titleInput.style.borderColor = '#4CAF50'; // Green border for loaded title
                        console.log('✅ Loaded Wistia data:', { id: wistiaId, ...videoData });
                    } else {
                        titleInput.value = '';
                        titleInput.placeholder = 'Could not load video title';
                        titleInput.style.borderColor = '#ff9800'; // Orange border for warning
                        console.warn('⚠️ Could not fetch video data for:', wistiaId);
                    }
                } catch (error) {
                    titleInput.value = '';
                    titleInput.placeholder = 'Error loading video data';
                    titleInput.style.borderColor = '#f44336'; // Red border for error
                    console.error('❌ Error fetching Wistia data:', error);
                }
                
                titleInput.disabled = false;
            } else {
                titleInput.value = '';
                titleInput.placeholder = 'Invalid Wistia URL format';
                titleInput.style.borderColor = '';
                e.target.style.borderColor = '#f44336'; // Red border for invalid URL
                console.warn('⚠️ Invalid Wistia URL format:', url);
            }
        });

        // Add Video Form Handlers
        document.getElementById('cancelAddVideo').addEventListener('click', function() {
            document.getElementById('addVideoOverlay').style.display = 'none';
            document.getElementById('addVideoError').style.display = 'none';
        });

        document.getElementById('addVideoForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = e.target.querySelector('.btn-add-video');
            const originalBtnText = submitBtn.textContent;
            
            // Show loading state
            submitBtn.disabled = true;
            submitBtn.textContent = 'Adding Video...';
            
            try {
                const wistiaUrl = document.getElementById('wistiaLink').value.trim();
                const title = document.getElementById('newVideoTitle').value.trim();
                const category = document.getElementById('newVideoCategory').value;
                
                console.log('🎬 Submitting Add Video form:', { wistiaUrl, title, category });
                
                // Enhanced validation
                if (!wistiaUrl || !title || !category) {
                    throw new Error('Please fill in all fields');
                }
                
                const wistiaId = extractWistiaId(wistiaUrl);
                if (!wistiaId) {
                    throw new Error('Invalid Wistia URL or ID format');
                }
                
                // Check if video already exists
                if (document.querySelector(`[data-wistia="${wistiaId}"]`)) {
                    throw new Error('This video already exists in your collection');
                }
                
                // Validate title length
                if (title.length < 3) {
                    throw new Error('Video title must be at least 3 characters long');
                }
                
                if (title.length > 100) {
                    throw new Error('Video title must be less than 100 characters');
                }
                
                // Collect selected tags
                const selectedTags = Array.from(document.querySelectorAll('.tag-selector.selected'))
                    .map(tag => tag.dataset.tagId);
                console.log('🎬 DEBUG: About to add video to grid:', { wistiaId, title, category, tags: selectedTags });
                
                // Add video to grid
                await addVideoToGrid({
                    wistiaId: wistiaId,
                    title: title,
                    category: category,
                    tags: selectedTags
                });
                
                console.log('🎬 SUCCESS: Video added successfully:', { id: wistiaId, title, category, tags: selectedTags });
                
                // Close popup - video was added successfully
                console.log('🎬 DEBUG: Closing add video popup');
                document.getElementById('addVideoOverlay').style.display = 'none';
                document.getElementById('addVideoError').style.display = 'none';
                
                // Reset form for next use
                document.getElementById('addVideoForm').reset();
                
            } catch (error) {
                console.error('🎬 ERROR: Failed to add video:', error);
                console.error('🎬 ERROR: Error details:', error.message, error.stack);
                document.getElementById('addVideoError').textContent = error.message;
                document.getElementById('addVideoError').style.display = 'block';
                return; // Don't close popup if there was an error
            } finally {
                // Reset button state
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        });

        async function addVideoToGrid(video) {
            console.log('🎬 DEBUG: === ADDING VIDEO TO GRID ===');
            console.log('🎬 DEBUG: Video data:', video);
            
            const videoGrid = document.getElementById('videoGrid');
            if (!videoGrid) {
                throw new Error('Video grid element not found');
            }
            
            // Create new video element
            const videoElement = document.createElement('div');
            videoElement.className = 'video-item';
            videoElement.setAttribute('data-category', video.category);
            videoElement.setAttribute('data-title', video.title);
            videoElement.setAttribute('data-wistia', video.wistiaId);
            
            // Use actual tags for display, not category
            const videoTags = video.tags || [];
            const tagsString = videoTags.map(escapeAttribute).join(',');
            videoElement.setAttribute('data-tags', tagsString);
            const safeWistiaId = escapeAttribute(video.wistiaId);
            const safeTitle = escapeHtml(video.title);
            
            // Generate tag pills HTML from actual tags
            const displayTags = videoTags
                .filter(tag => tag !== 'all') // Don't show 'all' as a tag pill
                .map(tag => 
                    `<span class="item-tag-pill">${escapeHtml(tag.charAt(0).toUpperCase() + tag.slice(1))}</span>`
                ).join('');
            
            videoElement.innerHTML = `
                <div class="thumbnail" id="thumb-${safeWistiaId}">
                    <img src="https://embed-ssl.wistia.com/deliveries/${safeWistiaId}.jpg" alt="${safeTitle}" class="thumb-img-cover" data-thumb-fallback="${safeWistiaId}">
                    <div class="thumbnail-duration" id="thumb-duration-${safeWistiaId}">--:--</div>
                    <div class="thumbnail-play-button"></div>
                    <div class="featured-controls">
                        <button class="featured-btn" data-action="set-featured" data-wistia-id="${safeWistiaId}">Feature</button>
                    </div>
                    <div class="video-edit-overlay">
                        <button class="video-edit-btn" data-action="edit-video" data-wistia-id="${safeWistiaId}" data-video-title="${escapeForOnclick(video.title)}" data-video-category="${escapeForOnclick(video.category)}">Edit</button>
                    </div>
                    <div class="thumbnail-close-overlay">
                        <button class="thumbnail-close-button" data-action="close-player">Close</button>
                    </div>
                </div>
                <div class="item-info">
                    <div class="title-row">
                        <div class="item-title">${safeTitle}</div>
                    </div>
                    <div class="item-tags">${displayTags}</div>
                </div>
            `;
            
            // Add to grid
            videoGrid.appendChild(videoElement);
            
            // Add event listeners for the new video
            try {
                addVideoEventListeners(videoElement);
                console.log('🎬 DEBUG: Event listeners added successfully');
            } catch (error) {
                console.error('🎬 ERROR: Failed to add event listeners:', error);
                throw error;
            }
            
            // Load thumbnail and duration (don't await to avoid blocking popup closure)
            try {
                loadWistiaThumbnail(video.wistiaId, defaultCacheOptions);
                loadVideoDuration(video.wistiaId, defaultCacheOptions);
                console.log('🎬 DEBUG: Thumbnail and duration loading initiated');
            } catch (error) {
                console.warn('🎬 WARNING: Non-critical error loading video metadata:', error);
            }
            
            // If in edit mode, add edit listeners
            if (isEditMode) {
                try {
                    addEditListenersToVideo(videoElement);
                    console.log('🎬 DEBUG: Edit listeners added successfully');
                } catch (error) {
                    console.error('🎬 ERROR: Failed to add edit listeners:', error);
                    throw error;
                }
            }
            
            // Mark as having unsaved changes
            try {
                markUnsavedChanges();
                console.log('🎬 DEBUG: Marked as having unsaved changes');
            } catch (error) {
                console.error('🎬 ERROR: Failed to mark unsaved changes:', error);
                throw error;
            }
            
            // Update dropdown visibility based on all current videos
            try {
                const allVideoElements = document.querySelectorAll('.video-item');
                const currentVideos = Array.from(allVideoElements).map(element => ({
                    category: element.dataset.category || 'all-songs'
                }));
                hideCategoryDropdownIfAllVideosAreAll(currentVideos);
                console.log('🎬 DEBUG: Dropdown visibility updated successfully');
            } catch (error) {
                console.error('🎬 ERROR: Failed to update dropdown visibility:', error);
                throw error;
            }
            
            console.log('🎬 SUCCESS: Video successfully added to grid');
        }

        function addVideoEventListeners(videoElement) {
            // Add click listener for video playback
            videoElement.addEventListener('click', () => {
                if (isEditMode) {
                    // In edit mode, open edit popup instead of playing video
                    const wistiaId = videoElement.dataset.wistia;
                    const title = videoElement.dataset.title;
                    const category = videoElement.dataset.category;
                    openEditVideoPopup(wistiaId, title, category);
                    return;
                }
                
                const wistiaId = videoElement.dataset.wistia;
                const title = videoElement.dataset.title;
                
                // Check if this is the currently playing video
                if (currentlyPlayingVideoId === wistiaId) {
                    // Do nothing - only the close overlay button should close the video
                return;
                } else {
                    // Load the new video
                    loadWistiaVideo(wistiaId, title);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
            
            // Add hover effects
            const thumbnail = videoElement.querySelector('.thumbnail');
            videoElement.addEventListener('mouseenter', () => {
                if (!isEditMode && !document.body.classList.contains('edit-mode')) {
                    thumbnail.style.transform = 'scale(1.02)';
                }
            });
            
            videoElement.addEventListener('mouseleave', () => {
                if (!isEditMode && !document.body.classList.contains('edit-mode')) {
                    thumbnail.style.transform = 'scale(1)';
                } else {
                    // Force reset transform in edit mode
                    thumbnail.style.transform = 'none';
                }
            });
        }

        function addEditListenersToVideo(videoElement) {
            // Add drag and drop (will only work when organize mode is active)
            videoElement.draggable = true;
            videoElement.addEventListener('dragstart', handleVideoDragStart);
            videoElement.addEventListener('dragend', handleVideoDragEnd);
            
            // Handle tag clicks for category filtering (only in non-edit mode)
            const tagElement = videoElement.querySelector('.item-tag');
            if (tagElement) {
                tagElement.addEventListener('click', function(e) {
                    e.stopPropagation();
                    
                    if (!isEditMode) {
                        // In non-edit mode, activate the category
                        const categoryName = this.textContent.toLowerCase();
                        activateCategory(categoryName);
                    }
                    // In edit mode, do nothing - editing only through popup
                });
            }

            // Add event listener for thumbnail close overlay
            const closeOverlay = videoElement.querySelector('.thumbnail-close-overlay');
            if (closeOverlay) {
                closeOverlay.addEventListener('click', function(e) {
                    e.stopPropagation(); // Prevent video click
                });
                
                const closeButton = closeOverlay.querySelector('.thumbnail-close-button');
                if (closeButton) {
                    closeButton.addEventListener('click', function(e) {
                        e.stopPropagation(); // Prevent video click
                        stopVideoAndClosePlayer();
                    });
                }
            }
        }

        // Category filtering removed - showing all videos by default

        // Category navigation removed - showing all videos by default

        // ========================================
        // CATEGORY MANAGEMENT FUNCTIONS
        // ========================================

        // Store for category preferences
        let categoryPreferences = {
            allLabel: 'All'
        };

        function loadCategoryPreferences() {
            // Try to load from localStorage
            try {
                const stored = localStorage.getItem('categoryPreferences');
                if (stored) {
                    categoryPreferences = { ...categoryPreferences, ...JSON.parse(stored) };
                }
            } catch (error) {
                console.warn('Failed to load category preferences:', error);
            }
            
            // Update the "All" tag with the stored preference
            updateAllTagLabel();
        }

        function saveCategoryPreferences() {
            try {
                localStorage.setItem('categoryPreferences', JSON.stringify(categoryPreferences));
            } catch (error) {
                console.warn('Failed to save category preferences:', error);
            }
        }

        function updateAllTagLabel() {
            const allTag = document.querySelector('.tag[data-category="all"]');
            if (allTag) {
                allTag.textContent = categoryPreferences.allLabel;
            }
        }

        function openManageCategoriesPopup() {
            console.log('🏷️ DEBUG: Opening manage categories popup');
            
            // Load current categories and populate the popup
            populateManageCategoriesPopup();
            
            // Show popup
            document.getElementById('manageCategoriesOverlay').style.display = 'flex';
            
            // Add event listeners for the popup (remove existing ones first to prevent duplicates)
            const addBtn = document.getElementById('addNewCategoryBtn');
            const saveBtn = document.getElementById('saveCategoriesBtn');
            const cancelBtn = document.getElementById('cancelManageCategoriesBtn');
            
            addBtn.removeEventListener('click', addNewCategoryItem);
            saveBtn.removeEventListener('click', saveCategories);
            cancelBtn.removeEventListener('click', closeManageCategoriesPopup);
            
            addBtn.addEventListener('click', addNewCategoryItem);
            saveBtn.addEventListener('click', saveCategories);
            cancelBtn.addEventListener('click', closeManageCategoriesPopup);
            
            // Add keyboard support (Escape to close)
            document.addEventListener('keydown', handleManageCategoriesKeydown);
            
            console.log('🏷️ DEBUG: Manage categories popup opened');
        }

        // Predefined categories that should always be available for management
        const predefinedCategories = [
            {
                id: 'all-songs',
                name: 'All Dance Videos',
                icon: 'music-note',
                showInDropdown: true,
                showInTagNavigation: false, // Don't show in navigation - there's already a hardcoded "All" tag
                isDefault: true
            },
            {
                id: 'the-merry-land-of-oz',
                name: 'The Merry Land of Oz',
                icon: 'music-note',
                showInDropdown: true,
                showInTagNavigation: false, // Should NOT show in category navigation
                isDefault: false // User can edit/delete this category
            },
            {
                id: 'munchkinland',
                name: 'Munchkinland',
                icon: 'music-note',
                showInDropdown: true,
                showInTagNavigation: false, // Should NOT show in category navigation
                isDefault: false // User can edit/delete this category
            }
        ];

        function populateManageCategoriesPopup() {
            const categoriesList = document.getElementById('categoriesList');
            const allLabel = document.getElementById('allCategoriesLabel');
            
            // Set the "All" label input to the current preference
            allLabel.value = categoryPreferences.allLabel;
            
            // Get all categories: server categories first, then fall back to predefined + video data
            const allCategories = new Set();
            
            if (window.serverCategories && window.serverCategories.length > 0) {
                // Use server categories - FILTER FOR ONLY SONG CATEGORIES (show_in_dropdown = true)
                console.log('🏷️ DEBUG: Filtering categories for Manage Categories popup');
                console.log('🏷️ DEBUG: All server categories:', window.serverCategories);
                window.serverCategories.forEach(cat => {
                    // Only include categories that should show in dropdown (songs, not audience tags)
                    if (cat.id !== 'all' && cat.show_in_dropdown !== false) {
                        console.log(`🏷️ DEBUG: Adding category to Manage Categories: ${cat.name} (show_in_dropdown: ${cat.show_in_dropdown})`);
                        allCategories.add(cat.id);
                    } else {
                        console.log(`🏷️ DEBUG: Excluding from Manage Categories: ${cat.name} (id: ${cat.id}, show_in_dropdown: ${cat.show_in_dropdown})`);
                    }
                });
            } else {
                // Fall back to predefined categories + video data
                predefinedCategories.forEach(cat => {
                    if (cat.id !== 'all-songs') { // Don't include the "All" option as a manageable category
                        allCategories.add(cat.id);
                    }
                });
                
                // Add categories from loaded video data
                if (window.loadedVideos && Array.isArray(window.loadedVideos)) {
                    window.loadedVideos.forEach(video => {
                        if (video.category && video.category !== 'all-songs') {
                            allCategories.add(video.category);
                        }
                    });
                }
            }
            
            // Clear existing items
            categoriesList.innerHTML = '';
            
            // Add category items
            Array.from(allCategories).forEach((categoryId, index) => {
                // Find predefined category info or create default
                const predefined = predefinedCategories.find(cat => cat.id === categoryId);
                const displayName = predefined ? predefined.name : 
                    categoryId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                
                addCategoryItemToList(categoryId, displayName, index, predefined);
            });
            
            // Update arrow states after all items are added
            updateCategoryArrowStates();
        }

        function addCategoryItemToList(id, name, order, predefinedInfo = null) {
            const categoriesList = document.getElementById('categoriesList');
            
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-item';
            categoryItem.dataset.categoryId = id;
            categoryItem.dataset.order = order;
            
            // Check if this is a predefined category
            const isPredefined = predefinedInfo && predefinedInfo.isDefault;
            const isMoreComingSoon = id === 'more-coming-soon';
            
            // Get current preferences for both dropdown and category navigation
            const showInDropdown = categoryPreferences.categories && categoryPreferences.categories[id] 
                ? categoryPreferences.categories[id].showInDropdown 
                : (predefinedInfo ? predefinedInfo.showInDropdown : true);
            
            const showInTagNavigation = categoryPreferences.categories && categoryPreferences.categories[id] 
                ? categoryPreferences.categories[id].showInTagNavigation 
                : (predefinedInfo ? predefinedInfo.showInTagNavigation : true);
            
            let categoryHTML = `
                <div class="category-reorder-buttons">
                    <button type="button" class="category-arrow-btn category-up-btn" title="Move up">▲</button>
                    <button type="button" class="category-arrow-btn category-down-btn" title="Move down">▼</button>
                </div>
                <input type="text" value="${name}" placeholder="Category name..." ${isPredefined ? 'readonly' : ''} />
            `;
            
            // Song categories don't need a visibility checkbox - they always show in the dropdown
            // Only tags (managed separately) need visibility controls
            
            // Add remove button (disabled for predefined categories)
            if (!isPredefined) {
                categoryHTML += `<button type="button" class="category-remove-btn">×</button>`;
            } else {
                categoryHTML += `<span class="category-predefined-label">Built-in</span>`;
            }
            
            categoryItem.innerHTML = categoryHTML;
            
            // Add remove functionality (only for non-predefined)
            if (!isPredefined) {
                categoryItem.querySelector('.category-remove-btn').addEventListener('click', () => {
                    categoryItem.remove();
                    updateCategoryArrowStates();
                });
            }
            
            // Add reorder functionality
            categoryItem.querySelector('.category-up-btn').addEventListener('click', () => {
                moveCategoryUp(categoryItem);
            });
            
            categoryItem.querySelector('.category-down-btn').addEventListener('click', () => {
                moveCategoryDown(categoryItem);
            });
            
            categoriesList.appendChild(categoryItem);
            updateCategoryArrowStates();
        }

        function addNewCategoryItem() {
            const categoriesCount = document.querySelectorAll('.category-item').length;
            addCategoryItemToList('', 'New Category', categoriesCount);
            
            // Focus the new input
            const newInput = document.querySelector('.category-item:last-child input');
            if (newInput) {
                newInput.focus();
                newInput.select();
            }
        }

        function moveCategoryUp(categoryItem) {
            const previousSibling = categoryItem.previousElementSibling;
            if (previousSibling) {
                categoryItem.parentNode.insertBefore(categoryItem, previousSibling);
                updateCategoryArrowStates();
            }
        }

        function moveCategoryDown(categoryItem) {
            const nextSibling = categoryItem.nextElementSibling;
            if (nextSibling) {
                categoryItem.parentNode.insertBefore(nextSibling, categoryItem);
                updateCategoryArrowStates();
            }
        }

        function updateCategoryArrowStates() {
            const categoryItems = document.querySelectorAll('.category-item');
            
            categoryItems.forEach((item, index) => {
                const upBtn = item.querySelector('.category-up-btn');
                const downBtn = item.querySelector('.category-down-btn');
                
                // Only update if buttons exist
                if (upBtn) {
                    // Disable up button for first item
                    upBtn.disabled = (index === 0);
                }
                
                if (downBtn) {
                    // Disable down button for last item
                    downBtn.disabled = (index === categoryItems.length - 1);
                }
            });
        }

        function saveCategories() {
            console.log('🏷️ DEBUG: Saving categories');
            
            try {
                // Get all category label
                const allLabel = document.getElementById('allCategoriesLabel').value.trim() || 'All';
                
                // Get categories from the list
                const categoryItems = document.querySelectorAll('.category-item');
                const categories = [];
                
                categoryItems.forEach((item, index) => {
                    const input = item.querySelector('input');
                    const name = input.value.trim();
                    
                    if (name) {
                        // Generate ID from name
                        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                        
                        // Song categories always show in dropdown (show_in_dropdown = true)
                        // Tags are managed separately in the "Manage Tags" popup
                        categories.push({
                            id: id,
                            name: name,
                            order: index,
                            show_in_dropdown: true  // Always true for song categories
                        });
                    }
                });
                
                console.log('🏷️ DEBUG: Categories to save:', categories);
                console.log('🏷️ DEBUG: All label:', allLabel);
                
                // Save the "All" label preference
                categoryPreferences.allLabel = allLabel;
                saveCategoryPreferences();
                
                // Update the main page dropdown to reflect the new "All" label
                populateCategoryDropdown();
                
                // Also update the Add Video category dropdown
                populateAddCategoryDropdown();
                
                // Save categories to server with explicit 'songs' scope
                saveCategoriesAsync(categories, 'songs');
                
                closeManageCategoriesPopup();
                console.log('🏷️ SUCCESS: Categories updated successfully!');
                markUnsavedChanges();
                
            } catch (error) {
                console.error('🏷️ ERROR: Failed to save categories:', error);
                showManageCategoriesError('Failed to save categories: ' + error.message);
            }
        }

        async function loadCategoriesFromServer() {
            try {
                console.log('🏷️ DEBUG: Loading categories from server...');
                
                // Check cache first
                const cachedCategories = getCachedData(pageCacheKey('categories'));
                if (cachedCategories) {
                    console.log('🏷️ DEBUG: Loaded categories from cache');
                    return cachedCategories;
                }
                
                const response = await fetch(pageApiUrl('get-categories'));
                
                if (!response.ok) {
                    console.warn('🏷️ WARNING: Could not load categories from server, using local data');
                    return [];
                }
                
                const serverCategories = await response.json();
                console.log('🏷️ DEBUG: Loaded categories from server:', serverCategories);
                console.log('🏷️ DEBUG: Categories with show_in_dropdown=false:', 
                    serverCategories.filter(c => c.show_in_dropdown === false));
                
                // Cache the categories
                setCachedData(pageCacheKey('categories'), serverCategories);
                
                return serverCategories;
            } catch (error) {
                console.warn('🏷️ WARNING: Error loading categories from server:', error);
                return [];
            }
        }

        async function saveCategoriesAsync(categories, categoryScope = 'songs') {
            try {
                console.log('🏷️ DEBUG: Saving categories to server:', categories, 'scope:', categoryScope);
                
                // Save categories to server with explicit scope to prevent cross-scope deletion
                const categoryResponse = await fetch('/api/save-categories', {
                    method: 'POST',
                    headers: pageEditorHeaders(),
                    body: JSON.stringify({ 
                        categories: categories, 
                        page: pageKey,
                        category_scope: categoryScope // Explicit scope: 'songs' or 'tags'
                    })
                });
                
                await requirePageEditorResponse(categoryResponse, 'Failed to save categories.');
                
                const categoryResult = await categoryResponse.json();
                console.log('🏷️ SUCCESS: Categories saved to server:', categoryResult);
                
                // After successful save, refresh the categories from server
                await refreshCategoriesFromServer();
                
            } catch (error) {
                console.error('🏷️ ERROR: Failed to save categories to server:', error);
                // Show error to user but don't prevent the popup from closing
                showManageCategoriesError('Failed to save categories to server: ' + error.message);
            }
        }

        async function refreshCategoriesFromServer() {
            try {
                console.log('🏷️ DEBUG: Refreshing categories from server...');
                
                // Load fresh categories from server
                const serverCategories = await loadCategoriesFromServer();
                
                // Update global categories data
                window.serverCategories = serverCategories;
                
                // Update all UI elements that use categories and tags
                populateCategoryDropdown();  // Main page dropdown (song categories)
                populateTagFilters();  // Main page tag filters (audience tags)
                populateAddCategoryDropdown();  // Add video form
                populateEditCategoryDropdown();  // Edit video form
                
                console.log('🏷️ SUCCESS: Categories and tags refreshed from server');
            } catch (error) {
                console.error('🏷️ ERROR: Failed to refresh categories:', error);
            }
        }

        function closeManageCategoriesPopup() {
            document.getElementById('manageCategoriesOverlay').style.display = 'none';
            document.getElementById('manageCategoriesError').style.display = 'none';
            
            // Remove keyboard listener
            document.removeEventListener('keydown', handleManageCategoriesKeydown);
        }

        function handleManageCategoriesKeydown(e) {
            if (e.key === 'Escape') {
                closeManageCategoriesPopup();
            }
        }

        function showManageCategoriesError(message) {
            const errorDiv = document.getElementById('manageCategoriesError');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }

        // ===== MANAGE TAGS POPUP FUNCTIONS =====
        
        function openManageTagsPopup() {
            console.log('🏷️ DEBUG: Opening manage tags popup');
            
            // Load current tags and populate the popup
            populateManageTagsPopup();
            
            // Show popup
            document.getElementById('manageTagsOverlay').style.display = 'flex';
            
            // Add event listeners for the popup
            const addBtn = document.getElementById('addNewTagBtn');
            const saveBtn = document.getElementById('saveTagsBtn');
            const cancelBtn = document.getElementById('cancelManageTagsBtn');
            
            // Remove existing listeners
            addBtn.replaceWith(addBtn.cloneNode(true));
            saveBtn.replaceWith(saveBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            
            // Add new listeners
            document.getElementById('addNewTagBtn').addEventListener('click', addNewTag);
            document.getElementById('saveTagsBtn').addEventListener('click', saveTags);
            document.getElementById('cancelManageTagsBtn').addEventListener('click', closeManageTagsPopup);
            
            // Add keyboard listener
            document.addEventListener('keydown', handleManageTagsKeydown);
            
            console.log('🏷️ DEBUG: Manage tags popup opened');
        }
        
        function populateManageTagsPopup() {
            const tagsList = document.getElementById('tagsList');
            tagsList.innerHTML = '';
            
            // Get tags using the same function that populates tag filters
            const tags = getAvailableTags();
            
            tags.forEach(tag => {
                const tagItem = createTagItemElement(tag);
                tagsList.appendChild(tagItem);
            });
            
            console.log(`🏷️ DEBUG: Populated ${tags.length} tags`);
        }
        
        function createTagItemElement(tag) {
            const div = document.createElement('div');
            div.className = 'category-item';
            div.innerHTML = `
                <div class="tag-item-row">
                    <input type="text" 
                           value="${tag.name}" 
                           class="tag-name-input tag-name-flex-input" 
                           data-tag-id="${tag.id}"
                           placeholder="Tag name">
                </div>
                <button class="btn-delete-category" data-tag-id="${tag.id}">Delete</button>
            `;
            
            // Add delete listener
            div.querySelector('.btn-delete-category').addEventListener('click', function() {
                deleteTag(tag.id);
            });
            
            return div;
        }
        
        function addNewTag() {
            const tagsList = document.getElementById('tagsList');
            const newTagId = 'new-tag-' + Date.now();
            
            const newTag = {
                id: newTagId,
                name: '',
                show_in_dropdown: false,
                order: getAvailableTags().length
            };
            
            const tagItem = createTagItemElement(newTag);
            tagsList.appendChild(tagItem);
            
            // Focus on the new input
            tagItem.querySelector('.tag-name-input').focus();
        }
        
        function deleteTag(tagId) {
            if (confirm('Are you sure you want to delete this tag?')) {
                const tagItem = document.querySelector(`[data-tag-id="${tagId}"]`).closest('.category-item');
                tagItem.remove();
            }
        }
        
        async function saveTags() {
            console.log('🏷️ Saving tags...');
            
            const tagInputs = document.querySelectorAll('#tagsList .tag-name-input');
            const updatedTags = [];
            
            tagInputs.forEach((input, index) => {
                const tagName = input.value.trim();
                if (tagName) {
                    const tagId = input.dataset.tagId;
                    const categoryKey = tagId.startsWith('new-tag-') 
                        ? tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                        : tagId;
                    
                    updatedTags.push({
                        id: `oz-tag-${categoryKey}`,
                        name: tagName,
                        category_key: categoryKey,
                        show_in_dropdown: false,
                        order: index,
                        page: pageKey
                    });
                }
            });
            
            try {
                console.log('🏷️ Saving tags only (scoped to prevent deleting song categories):', updatedTags);
                
                // Save ONLY tags to server with explicit 'tags' scope
                // This prevents deleting song categories
                const response = await fetch('/api/save-categories', {
                    method: 'POST',
                    headers: pageEditorHeaders(),
                    body: JSON.stringify({
                        page: pageKey,
                        categories: updatedTags,
                        category_scope: 'tags' // Explicit scope: only save/replace tags
                    })
                });
                
                await requirePageEditorResponse(response, 'Failed to save tags.');
                
                console.log('✅ Tags saved successfully');
                
                // Refresh categories from server
                await refreshCategoriesFromServer();
                
                // Close popup
                closeManageTagsPopup();
                
            } catch (error) {
                console.error('❌ Error saving tags:', error);
                showManageTagsError('Failed to save tags. Please try again.');
            }
        }
        
        function closeManageTagsPopup() {
            document.getElementById('manageTagsOverlay').style.display = 'none';
            document.getElementById('manageTagsError').style.display = 'none';
            
            // Remove keyboard listener
            document.removeEventListener('keydown', handleManageTagsKeydown);
        }
        
        function handleManageTagsKeydown(e) {
            if (e.key === 'Escape') {
                closeManageTagsPopup();
            }
        }
        
        function showManageTagsError(message) {
            const errorDiv = document.getElementById('manageTagsError');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }

        // ===== EVENT DELEGATION FOR DATA-ACTION ATTRIBUTES =====
        var pageTitleElement = document.getElementById('pageTitle');
        if (pageTitleElement) {
            pageTitleElement.addEventListener('click', function() {
                if (typeof resetToDefault === 'function') resetToDefault();
            });
        }
        var videoCloseButton = document.getElementById('videoCloseBtn');
        if (videoCloseButton) {
            videoCloseButton.addEventListener('click', function() {
                if (typeof stopVideoAndClosePlayer === 'function') stopVideoAndClosePlayer();
            });
        }

        document.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var action = btn.dataset.action;
            if (action === 'close-player') { stopVideoAndClosePlayer(); }
            else if (action === 'retry-video') { loadWistiaVideo(btn.dataset.wistiaId, btn.dataset.videoTitle); }
            else if (action === 'reload-page') { location.reload(); }
            else if (action === 'set-featured') { setFeaturedVideo(btn.dataset.wistiaId); }
            else if (action === 'edit-video') { openEditVideoPopup(btn.dataset.wistiaId, btn.dataset.videoTitle, btn.dataset.videoCategory); }
            else if (action === 'delete-video') { e.stopPropagation(); deleteVideo(e, btn.dataset.wistiaId); }
            else if (action === 'move-video') { e.stopPropagation(); moveVideo(e, btn.dataset.wistiaId, btn.dataset.direction); }
            else if (action === 'reload-videos') { if (typeof loadVideosFromServer === 'function') loadVideosFromServer(); }
        });

        document.addEventListener('error', function(e) {
            if (e.target.tagName !== 'IMG') return;
            if (e.target.hasAttribute('data-img-hide-on-error')) {
                e.target.style.display = 'none';
                var next = e.target.nextElementSibling;
                if (next) next.style.display = 'flex';
            }
            if (e.target.hasAttribute('data-thumb-fallback')) {
                var wId = e.target.dataset.thumbFallback;
                if (typeof loadWistiaThumbnail === 'function') loadWistiaThumbnail(wId, defaultCacheOptions);
            }
        }, true);

        // ===== END OF JAVASCRIPT APPLICATION =====
        
