        injectPlatformBadgeStyles('platform-badge');
        // Global variables
        let videos = [];
        let isEditMode = false;
        let currentVideoId = null;
        let editingVideoId = null;
        let platformManager = null;

        /**
         * Edit page title inline in edit mode
         * Creates an input field to edit the title and saves changes to localStorage
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
            input.style.border = '2px solid #008f67';
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
                        // Save to localStorage for this test page
                        localStorage.setItem('dropbox_page_title', newTitle);
                        titleElement.textContent = newTitle;
                        showUnsavedIndicator();
                        showStatus('success', 'Page title updated!');
                    } catch (error) {
                        console.error('Failed to save page title:', error);
                        showStatus('error', 'Failed to save page title');
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

        /**
         * Show unsaved changes indicator
         */
        function showUnsavedIndicator() {
            // For this test page, we'll just show a brief status message
            // In a full implementation, this might show a persistent indicator
            console.log('Page title changes saved to localStorage');
        }

        /**
         * Load saved page title from localStorage
         */
        function loadPageTitle() {
            const savedTitle = localStorage.getItem('dropbox_page_title');
            if (savedTitle) {
                document.getElementById('pageTitle').textContent = savedTitle;
            }
        }

        // Initialize
        window.addEventListener('DOMContentLoaded', async () => {
            // Initialize platform manager
            platformManager = new VideoPlatformManager();
            await platformManager.init();
            
            // Load saved page title
            loadPageTitle();
            
            // Load videos
            loadVideos();
        });

        // Toggle edit mode
        function toggleEditMode() {
            isEditMode = !isEditMode;
            document.body.classList.toggle('edit-mode');
            
            const editBtn = document.getElementById('toggle-edit-btn');
            const editControls = document.getElementById('edit-controls');
            const saveBtn = document.getElementById('save-btn');
            const pageTitle = document.getElementById('pageTitle');
            
            if (isEditMode) {
                editBtn.textContent = 'Exit Edit Mode';
                editControls.style.display = 'block';
                saveBtn.style.display = 'inline-block';
                
                // Add page title edit listener
                pageTitle.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    editPageTitle();
                });
                
                // Add visual indication that title is clickable
                pageTitle.style.border = '2px dashed transparent';
                pageTitle.style.padding = '4px 8px';
                pageTitle.style.borderRadius = '4px';
                pageTitle.title = 'Click to edit page title';
            } else {
                editBtn.textContent = 'Enter Edit Mode';
                editControls.style.display = 'none';
                saveBtn.style.display = 'none';
                
                // Remove page title edit listener by cloning the element
                const newPageTitle = pageTitle.cloneNode(true);
                pageTitle.parentNode.replaceChild(newPageTitle, pageTitle);
                
                // Remove visual indication
                newPageTitle.style.border = '';
                newPageTitle.style.padding = '';
                newPageTitle.style.borderRadius = '';
                newPageTitle.title = '';
            }
            
            renderVideos();
        }

        // Load videos from localStorage (simulating database)
        function loadVideos() {
            const stored = localStorage.getItem('dropbox_test_videos');
            if (stored) {
                videos = JSON.parse(stored);
            } else {
                // Default test videos
                videos = [
                    {
                        id: 'test1',
                        wistiaId: 'test1',
                        platform: 'wistia',
                        title: 'Sample Wistia Video',
                        category: 'all',
                        tags: [],
                        order: 0
                    }
                ];
            }
            renderVideos();
        }

        // Save videos to localStorage
        function saveVideos() {
            localStorage.setItem('dropbox_test_videos', JSON.stringify(videos));
            showStatus('success', 'Videos saved successfully!');
        }

        // Add Wistia video
        function addWistiaVideo() {
            const idInput = document.getElementById('wistia-id-input');
            const titleInput = document.getElementById('wistia-title-input');
            
            const wistiaId = idInput.value.trim();
            const title = titleInput.value.trim() || 'Untitled Video';
            
            if (!wistiaId) {
                showStatus('error', 'Please enter a Wistia video ID');
                return;
            }
            
            const video = {
                id: 'wistia_' + Date.now(),
                wistiaId: wistiaId,
                platform: 'wistia',
                title: title,
                category: 'all',
                tags: [],
                order: videos.length
            };
            
            videos.push(video);
            renderVideos();
            
            // Clear inputs
            idInput.value = '';
            titleInput.value = '';
            
            showStatus('success', 'Wistia video added!');
        }

        // Add Dropbox video
        async function addDropboxVideo() {
            const urlInput = document.getElementById('dropbox-url-input');
            const url = urlInput.value.trim();
            
            if (!url) {
                showStatus('error', 'Please enter a Dropbox URL');
                return;
            }
            
            try {
                // Process the Dropbox URL
                const videoData = platformManager.processDropboxUrl(url);

                // Best-effort frame capture using the shared helper, which
                // sets crossOrigin=anonymous on the hidden <video> so the
                // canvas isn't tainted for cross-origin Dropbox URLs.
                // Captured bytes are uploaded to /api/upload-link-thumbnail
                // and we store the returned stable URL on the video object —
                // never a multi-hundred-KB data: URL — so it persists cleanly
                // through save-videos into Supabase. Any failure leaves
                // thumbnailUrl unset and the card shows the placeholder.
                showStatus('info', 'Capturing thumbnail…');
                try {
                    if (typeof window.captureVideoThumbnail !== 'function') {
                        throw new Error('thumbnail-capture helper unavailable');
                    }
                    const captured = await window.captureVideoThumbnail(videoData.video_url);
                    // Helper resolves to { blob, dataUrl, base64, contentType, ... }
                    // on success, or null on any failure path. Reuse the base64 it
                    // already produced rather than re-encoding.
                    if (captured && captured.base64) {
                        const resp = await fetch('/api/upload-link-thumbnail', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: videoData.id,
                                data: captured.base64,
                                contentType: captured.contentType || 'image/jpeg'
                            })
                        });
                        if (resp.ok) {
                            const out = await resp.json().catch(() => ({}));
                            if (out && out.thumbnailUrl) {
                                videoData.thumbnailUrl = out.thumbnailUrl;
                            }
                        } else {
                            console.warn('upload-link-thumbnail returned', resp.status);
                        }
                    }
                } catch (thumbErr) {
                    console.warn('Dropbox thumbnail capture failed:', thumbErr);
                }

                // Add to videos array
                videoData.order = videos.length;
                videos.push(videoData);

                renderVideos();

                // Clear input
                urlInput.value = '';

                showStatus('success', videoData.thumbnailUrl
                    ? 'Dropbox video added with thumbnail!'
                    : 'Dropbox video added (thumbnail unavailable).');
            } catch (error) {
                showStatus('error', 'Invalid Dropbox URL: ' + error.message);
            }
        }

        // Render video grid
        function renderVideos() {
            const grid = document.getElementById('video-grid');
            
            if (videos.length === 0) {
                grid.innerHTML = '<div class="dropbox-empty-grid">No videos yet. Enter edit mode to add videos.</div>';
                return;
            }
            
            grid.innerHTML = videos.map(video => {
                const isActive = currentVideoId === video.wistiaId;
                const thumbnailUrl = platformManager.getThumbnailUrl(video);
                
                return `
                    <div class="video-item ${isActive ? 'active' : ''}" data-id="${video.id}" data-action="play-video">
                        <div class="thumbnail">
                            ${(video.platform === 'dropbox' && !video.thumbnailUrl) ?
                                `<div class="thumbnail-placeholder">${platformInfo(video).label} Video</div>` :
                                `<img src="${thumbnailUrl}" alt="${video.title}" data-img-hide-on-error="true">`
                            }
                            <div class="platform-badge ${platformInfo(video).key}">${platformInfo(video).label}</div>
                        </div>
                        <div class="video-controls">
                            <button data-action="edit-video" data-id="${video.id}">Edit</button>
                            <button class="danger" data-action="delete-video" data-id="${video.id}">Delete</button>
                        </div>
                        <div class="video-info">
                            <div class="video-item-title">${video.title}</div>
                            <div class="video-meta">Order: ${video.order}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Play video
        function playVideo(videoId) {
            if (isEditMode) return;
            
            const video = videos.find(v => v.id === videoId);
            if (!video) return;
            
            currentVideoId = video.wistiaId;
            
            // Show player
            const playerContainer = document.getElementById('video-player-container');
            const videoWrapper = document.getElementById('video-wrapper');
            const titleElement = document.getElementById('current-video-title');
            
            playerContainer.classList.add('active');
            titleElement.textContent = video.title;
            
            // Load video using platform manager
            platformManager.loadVideo(video, videoWrapper);
            
            // Update grid to show active state
            renderVideos();
        }

        // Close video player
        function closeVideoPlayer() {
            const playerContainer = document.getElementById('video-player-container');
            const videoWrapper = document.getElementById('video-wrapper');
            
            // Stop current video
            platformManager.stopCurrentVideo();
            
            // Clear player
            videoWrapper.innerHTML = '';
            playerContainer.classList.remove('active');
            currentVideoId = null;
            
            // Update grid
            renderVideos();
        }

        // Edit video
        function editVideo(event, videoId) {
            event.stopPropagation();
            
            const video = videos.find(v => v.id === videoId);
            if (!video) return;
            
            editingVideoId = videoId;
            
            // Open modal
            document.getElementById('edit-modal').classList.add('active');
            document.getElementById('edit-title').value = video.title;
            document.getElementById('edit-category').value = video.category || 'all';
        }

        // Save video edit
        function saveVideoEdit() {
            const video = videos.find(v => v.id === editingVideoId);
            if (!video) return;
            
            video.title = document.getElementById('edit-title').value;
            video.category = document.getElementById('edit-category').value;
            
            closeEditModal();
            renderVideos();
            showStatus('success', 'Video updated!');
        }

        // Close edit modal
        function closeEditModal() {
            document.getElementById('edit-modal').classList.remove('active');
            editingVideoId = null;
        }

        // Delete video - show confirmation modal
        let videoToDelete = null;
        
        function deleteVideo(event, videoId) {
            event.stopPropagation();
            
            const video = videos.find(v => v.id === videoId);
            if (!video) return;
            
            videoToDelete = videoId;
            
            // Show confirmation modal
            document.getElementById('delete-confirmation-modal').classList.add('active');
            document.getElementById('delete-video-title').textContent = video.title;
        }
        
        // Confirm video deletion
        function confirmDeleteVideo() {
            if (!videoToDelete) return;
            
            videos = videos.filter(v => v.id !== videoToDelete);
            saveVideos(); // Save changes to localStorage
            renderVideos();
            showStatus('success', 'Video deleted!');
            
            closeDeleteConfirmation();
        }
        
        // Close delete confirmation modal
        function closeDeleteConfirmation() {
            document.getElementById('delete-confirmation-modal').classList.remove('active');
            videoToDelete = null;
        }

        // Show status message
        function showStatus(type, message) {
            const statusEl = document.getElementById('status-message');
            statusEl.className = `status-message ${type}`;
            statusEl.textContent = message;
            statusEl.style.display = 'block';
            
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }

        // ===== EVENT LISTENERS (replacing inline onclick) =====
        document.getElementById('toggle-edit-btn').addEventListener('click', toggleEditMode);
        document.getElementById('save-btn').addEventListener('click', saveVideos);
        document.getElementById('reload-btn').addEventListener('click', loadVideos);
        document.getElementById('add-wistia-btn').addEventListener('click', addWistiaVideo);
        document.getElementById('add-dropbox-btn').addEventListener('click', addDropboxVideo);
        document.getElementById('close-player-btn').addEventListener('click', closeVideoPlayer);
        document.getElementById('edit-close-btn').addEventListener('click', closeEditModal);
        document.getElementById('edit-save-btn').addEventListener('click', saveVideoEdit);
        document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
        document.getElementById('delete-close-btn').addEventListener('click', closeDeleteConfirmation);
        document.getElementById('delete-confirm-btn').addEventListener('click', confirmDeleteVideo);
        document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteConfirmation);

        document.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var action = btn.dataset.action;
            if (action === 'play-video') { playVideo(btn.dataset.id); }
            else if (action === 'edit-video') { editVideo(e, btn.dataset.id); }
            else if (action === 'delete-video') { deleteVideo(e, btn.dataset.id); }
        });

        document.addEventListener('error', function(e) {
            if (e.target.tagName !== 'IMG' || !e.target.hasAttribute('data-img-hide-on-error')) return;
            e.target.style.display = 'none';
        }, true);
