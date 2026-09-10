function createAdminDialogOverlay(zIndex) {
    var overlay = document.createElement('div');
    overlay.style.cssText =
        'position: fixed; top: 0; left: 0; right: 0; bottom: 0;' +
        'background: rgba(0,0,0,0.8); display: flex; align-items: center;' +
        'justify-content: center; z-index: ' + zIndex + '; backdrop-filter: blur(4px);';
    return overlay;
}

/**
 * Show (or clear, when message is empty) an inline error inside a dialog,
 * placed just above its action buttons. `anchor` is the actions container.
 */
function setDialogError(anchor, message) {
    if (!anchor || !anchor.parentNode) return;
    var existing = anchor.parentNode.querySelector('.oz-dialog-error');
    if (!message) {
        if (existing) existing.remove();
        return;
    }
    if (!existing) {
        existing = document.createElement('div');
        existing.className = 'oz-dialog-error';
        existing.setAttribute('role', 'alert');
        anchor.parentNode.insertBefore(existing, anchor);
    }
    existing.textContent = message;
}

function describeDialogError(err, fallback) {
    if (window.VsFeedback) return window.VsFeedback.describeError(err, fallback);
    return (err && err.message) || fallback;
}

var adminBannerMessageTimer = null;

/**
 * Show a message in a strip directly under the edit-mode admin banner (next
 * to the Save button), instead of alert(). `options.tone` is 'error'
 * (default) or 'notice'; `options.timeout` (ms, default 8000) auto-hides it.
 */
function showAdminBannerMessage(message, options) {
    options = options || {};
    var banner = document.getElementById('adminBanner');
    if (!banner) return null;
    var strip = banner.querySelector('.admin-banner-message');
    if (!message) {
        if (strip) strip.remove();
        return null;
    }
    if (!strip) {
        strip = document.createElement('div');
        strip.className = 'admin-banner-message';
        strip.setAttribute('role', 'alert');
        banner.appendChild(strip);
    }
    strip.classList.toggle('notice', options.tone === 'notice');
    strip.innerHTML = '';
    var text = document.createElement('span');
    text.className = 'admin-banner-message-text';
    text.textContent = message;
    strip.appendChild(text);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'admin-banner-message-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '\u00D7';
    close.addEventListener('click', function() { showAdminBannerMessage(''); });
    strip.appendChild(close);

    if (adminBannerMessageTimer) clearTimeout(adminBannerMessageTimer);
    var timeout = options.timeout === undefined ? 8000 : options.timeout;
    if (timeout) {
        adminBannerMessageTimer = setTimeout(function() { showAdminBannerMessage(''); }, timeout);
    }
    return strip;
}

function openIconPickerDialog(categoryElement, availableIcons, onSave) {
    var categoryId = categoryElement.dataset.category;
    var currentIcon = categoryElement.dataset.icon || '';

    var popup = document.createElement('div');
    popup.style.cssText = '\
        position: fixed;\
        top: 50%;\
        left: 50%;\
        transform: translate(-50%, -50%);\
        background: #2a2a2a;\
        border: 2px solid var(--accent-color);\
        border-radius: 12px;\
        padding: 20px;\
        z-index: 1000;\
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);\
        color: white;\
        min-width: 300px;\
    ';

    popup.innerHTML = '\
        <h3 class="oz-icon-picker-title">Choose Category Icon</h3>\
        <div class="oz-icon-grid">\
            <button class="icon-option oz-icon-option' + (currentIcon === '' ? ' selected' : '') + '" data-icon="">None</button>\
            ' + Object.entries(availableIcons).map(function(entry) {
                var key = entry[0], icon = entry[1];
                return '<button class="icon-option oz-icon-option oz-icon-option-lg' + (currentIcon === key ? ' selected' : '') + '" data-icon="' + key + '">' + icon + ' ' + key.replace('-', ' ') + '</button>';
            }).join('') + '\
        </div>\
        <div class="oz-icon-picker-actions">\
            <button id="cancelIconEdit" class="oz-icon-picker-btn-cancel">Cancel</button>\
            <button id="saveIconEdit" class="oz-icon-picker-btn-save">Save</button>\
        </div>\
    ';

    document.body.appendChild(popup);

    var selectedIcon = currentIcon;

    popup.querySelectorAll('.icon-option').forEach(function(btn) {
        btn.addEventListener('click', function() {
            popup.querySelectorAll('.icon-option').forEach(function(b) { b.style.borderColor = 'transparent'; });
            this.style.borderColor = 'var(--accent-color)';
            selectedIcon = this.dataset.icon;
        });
    });

    popup.querySelector('#saveIconEdit').addEventListener('click', function() {
        categoryElement.dataset.icon = selectedIcon;
        var iconDisplay = selectedIcon && availableIcons[selectedIcon] ? availableIcons[selectedIcon] + ' ' : '';
        onSave(selectedIcon, categoryId);
        document.body.removeChild(popup);
    });

    popup.querySelector('#cancelIconEdit').addEventListener('click', function() {
        document.body.removeChild(popup);
    });

    popup.addEventListener('click', function(e) {
        if (e.target === popup) {
            document.body.removeChild(popup);
        }
    });
}

function openDeleteTagDialog(categoryName, videoCount, reassignmentOptionsHtml, onConfirm, options) {
    options = options || {};
    var selectPlaceholder = options.selectPlaceholder || 'Select tag...';
    var reassignPrompt = options.reassignPrompt || 'Choose a tag to reassign them to:';
    var validationMessage = options.validationMessage || 'Please select a tag for reassignment.';

    var dialog = createAdminDialogOverlay(1001);

    dialog.innerHTML = '\
        <div class="oz-dialog-panel">\
            <h3 class="oz-dialog-title">Delete Tag</h3>\
            <p class="oz-dialog-text">\
                "' + categoryName + '" has ' + videoCount + ' video(s). \
                ' + reassignPrompt + '\
            </p>\
            <select id="reassignSelect" class="oz-dialog-select">\
                <option value="">' + selectPlaceholder + '</option>\
                ' + reassignmentOptionsHtml + '\
            </select>\
            <div class="oz-dialog-actions">\
                <button id="confirmDelete" class="oz-btn-danger">Delete &amp; Reassign</button>\
                <button id="cancelDelete" class="oz-btn-cancel">Cancel</button>\
            </div>\
        </div>\
    ';

    document.body.appendChild(dialog);

    var reassignSelect = dialog.querySelector('#reassignSelect');
    var actions = dialog.querySelector('.oz-dialog-actions');

    reassignSelect.addEventListener('change', function() {
        reassignSelect.removeAttribute('aria-invalid');
        setDialogError(actions, '');
    });

    dialog.querySelector('#confirmDelete').addEventListener('click', function() {
        var newCategoryId = reassignSelect.value;
        if (!newCategoryId) {
            reassignSelect.setAttribute('aria-invalid', 'true');
            setDialogError(actions, validationMessage);
            reassignSelect.focus();
            return;
        }
        onConfirm(newCategoryId);
        document.body.removeChild(dialog);
    });

    dialog.querySelector('#cancelDelete').addEventListener('click', function() {
        document.body.removeChild(dialog);
    });
}

function reassignVideosToCategory(videosInCategory, categoryName, newCategoryId, newCategoryName, options) {
    options = options || {};
    var escapeStr = options.escapeStr || function(s) { return s; };
    var lowerName = categoryName.toLowerCase();
    var capitalizedName = newCategoryName.charAt(0).toUpperCase() + newCategoryName.slice(1);

    videosInCategory.forEach(function(item) {
        item.dataset.category = newCategoryId;
        var tagsContainer = item.querySelector('.item-tags');
        if (tagsContainer) {
            var tagPills = tagsContainer.querySelectorAll('.item-tag-pill');
            tagPills.forEach(function(pill) {
                if (pill.textContent.toLowerCase() === lowerName) {
                    pill.textContent = capitalizedName;
                }
            });
        }

        var editBtn = item.querySelector('.video-edit-btn');
        if (editBtn) {
            var wistiaId = item.dataset.wistia;
            var title = item.dataset.title;
            editBtn.dataset.wistiaId = wistiaId;
            editBtn.dataset.videoTitle = escapeStr(title);
            editBtn.dataset.videoCategory = escapeStr(newCategoryId);
        }
    });
}

function openDeleteVideoDialog(videoTitle, onConfirm) {
    var dialog = createAdminDialogOverlay(1000);

    dialog.innerHTML = '\
        <div class="oz-dialog-panel-center">\
            <h3 class="oz-dialog-title-lg">Delete Video</h3>\
            <p class="oz-dialog-text-lg">\
                Are you sure you want to delete "' + videoTitle + '"?\
            </p>\
            <div class="oz-dialog-actions-center">\
                <button id="confirmDelete" class="oz-btn-danger-lg">Delete</button>\
                <button id="cancelDelete" class="oz-btn-cancel-lg">Cancel</button>\
            </div>\
        </div>\
    ';

    document.body.appendChild(dialog);

    var confirmBtn = dialog.querySelector('#confirmDelete');
    var cancelBtn = dialog.querySelector('#cancelDelete');

    confirmBtn.onmouseover = function() { confirmBtn.style.background = '#d70015'; };
    confirmBtn.onmouseout = function() { confirmBtn.style.background = '#ff3b30'; };
    cancelBtn.onmouseover = function() { cancelBtn.style.background = '#444'; };
    cancelBtn.onmouseout = function() { cancelBtn.style.background = '#333'; };

    var actions = dialog.querySelector('.oz-dialog-actions-center');

    confirmBtn.addEventListener('click', async function() {
        setDialogError(actions, '');
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        var originalLabel = confirmBtn.textContent;
        confirmBtn.textContent = 'Deleting\u2026';
        try {
            await onConfirm();
            document.body.removeChild(dialog);
        } catch (err) {
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
            confirmBtn.textContent = originalLabel;
            setDialogError(actions, 'The video wasn\u2019t deleted. ' +
                describeDialogError(err, 'Something went wrong. Please try again.'));
        }
    });

    cancelBtn.addEventListener('click', function() {
        document.body.removeChild(dialog);
    });

    dialog.addEventListener('click', function(e) {
        if (e.target === dialog) {
            document.body.removeChild(dialog);
        }
    });
}

function openFeaturedContentDialog(featuredContent, callbacks) {
    var onSetVideo = callbacks.onSetVideo;
    var onSetImage = callbacks.onSetImage;
    var onClear = callbacks.onClear;

    var dialog = createAdminDialogOverlay(1001);

    dialog.innerHTML = '\
        <div class="oz-dialog-panel-wide">\
            <h3 class="oz-dialog-title-featured">Set Featured Content</h3>\
            \
            <div class="oz-featured-section">\
                <label class="oz-featured-label">\
                    <input type="radio" name="featuredType" value="video" ' + (featuredContent.type === 'video' ? 'checked' : '') + '>\
                    <span>Featured Video</span>\
                </label>\
                <label class="oz-featured-label-last">\
                    <input type="radio" name="featuredType" value="image" ' + (featuredContent.type === 'image' ? 'checked' : '') + '>\
                    <span>Featured Image</span>\
                </label>\
            </div>\
            \
            <div id="videoOptions" class="oz-featured-field' + (featuredContent.type === 'video' ? '' : ' hidden') + '">\
                <label class="oz-featured-field-label">Select Video:</label>\
                <select id="featuredVideoSelect" class="oz-featured-input">\
                    <option value="">Choose a video...</option>\
                </select>\
            </div>\
            \
            <div id="imageOptions" class="oz-featured-field' + (featuredContent.type === 'image' ? '' : ' hidden') + '">\
                <label class="oz-featured-field-label">Image URL:</label>\
                <input type="url" id="featuredImageUrl" placeholder="https://example.com/image.jpg" \
                       value="' + (featuredContent.imageUrl || '') + '"\
                       class="oz-featured-input">\
            </div>\
            \
            <div class="oz-featured-actions">\
                <button id="setFeaturedConfirm" class="oz-featured-btn-confirm">Set Featured</button>\
                <button id="clearFeatured" class="oz-featured-btn-clear">Clear Featured</button>\
                <button id="cancelFeatured" class="oz-featured-btn-cancel">Cancel</button>\
            </div>\
        </div>\
    ';

    document.body.appendChild(dialog);

    var videoSelect = dialog.querySelector('#featuredVideoSelect');
    var videoItems = Array.from(document.querySelectorAll('.video-item')).map(function(item) {
        return { id: item.dataset.wistia, title: item.dataset.title };
    });

    videoItems.forEach(function(video) {
        var option = document.createElement('option');
        option.value = video.id;
        option.textContent = video.title;
        option.selected = video.id === featuredContent.videoId;
        videoSelect.appendChild(option);
    });

    dialog.querySelectorAll('input[name="featuredType"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            var videoOptions = dialog.querySelector('#videoOptions');
            var imageOptions = dialog.querySelector('#imageOptions');

            if (this.value === 'video') {
                videoOptions.style.display = 'block';
                imageOptions.style.display = 'none';
            } else {
                videoOptions.style.display = 'none';
                imageOptions.style.display = 'block';
            }
        });
    });

    var featuredActions = dialog.querySelector('.oz-featured-actions');
    var imageInput = dialog.querySelector('#featuredImageUrl');

    function clearFeaturedError() {
        setDialogError(featuredActions, '');
        videoSelect.removeAttribute('aria-invalid');
        imageInput.removeAttribute('aria-invalid');
    }
    videoSelect.addEventListener('change', clearFeaturedError);
    imageInput.addEventListener('input', clearFeaturedError);
    dialog.querySelectorAll('input[name="featuredType"]').forEach(function(radio) {
        radio.addEventListener('change', clearFeaturedError);
    });

    dialog.querySelector('#setFeaturedConfirm').addEventListener('click', function() {
        var checked = dialog.querySelector('input[name="featuredType"]:checked');
        if (!checked) {
            setDialogError(featuredActions, 'Choose whether to feature a video or an image.');
            return;
        }

        if (checked.value === 'video') {
            var selectedVideoId = videoSelect.value;
            if (!selectedVideoId) {
                videoSelect.setAttribute('aria-invalid', 'true');
                setDialogError(featuredActions, 'Choose a video to feature first.');
                videoSelect.focus();
                return;
            }
            onSetVideo(selectedVideoId);
        } else {
            var imageUrl = imageInput.value.trim();
            if (!imageUrl) {
                imageInput.setAttribute('aria-invalid', 'true');
                setDialogError(featuredActions, 'Enter an image URL first.');
                imageInput.focus();
                return;
            }
            if (!/^https?:\/\/\S+/i.test(imageUrl)) {
                imageInput.setAttribute('aria-invalid', 'true');
                setDialogError(featuredActions, 'That doesn\u2019t look like a web address. It should start with https://');
                imageInput.focus();
                return;
            }
            onSetImage(imageUrl);
        }

        document.body.removeChild(dialog);
    });

    dialog.querySelector('#clearFeatured').addEventListener('click', function() {
        onClear();
        document.body.removeChild(dialog);
    });

    dialog.querySelector('#cancelFeatured').addEventListener('click', function() {
        document.body.removeChild(dialog);
    });
}
