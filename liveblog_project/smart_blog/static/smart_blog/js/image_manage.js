// static/js/image_manage.js
(function () {
    'use strict';

    // tiny helpers
    function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
    function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

    function getCookie(name) {
        const v = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
        return v ? decodeURIComponent(v.split('=')[1]) : null;
    }

    function humanFileSize(size) {
        if (size < 1024) return size + ' B';
        if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
        return (size / (1024 * 1024)).toFixed(1) + ' MB';
    }

    document.addEventListener('DOMContentLoaded', function () {
        const mainInput = qs('#id_images') || qs('input[name="images"]');
        const preview = qs('#preview');
        const existingContainer = qs('#existingImages');
        const infoNode = qs('#imagesHelp');
        const addMoreBtn = qs('#btnAddMoreImages');
        const itemForms = [qs('#itemForm'), qs('#itemEditForm')].filter(Boolean);

        const MAX = 10;
        // Keep in sync with smart_blog.image_utils.ALLOWED_MIME_TYPES (server rejects others)
        const ALLOWED = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

        if (!mainInput || (!preview && !existingContainer)) {
            // nothing to do on pages without the file UI
            return;
        }

        const fileTrigger = document.querySelector('.item-images-file-trigger');
        if (fileTrigger && mainInput) {
            fileTrigger.addEventListener('click', function () {
                mainInput.click();
            });
        }

        // ----- helpers -----
        function setInfo(text, isWarning) {
            if (!infoNode) return;
            infoNode.textContent = text;
            if (isWarning) infoNode.classList.add('text-danger'); else infoNode.classList.remove('text-danger');
        }

        function countThumbnails() {
            const previewCount = preview ? preview.querySelectorAll('.image-preview-item').length : 0;
            const existingCount = existingContainer ? existingContainer.querySelectorAll('.existing-image').length : 0;
            const filesCount = (mainInput.files && mainInput.files.length) ? mainInput.files.length : 0;
            return { previewCount, existingCount, filesCount, total: previewCount + existingCount + filesCount };
        }

        // count existing images (DOM) that are currently present (not necessarily actual DB count)
        function countExistingDOM() {
            return existingContainer ? existingContainer.querySelectorAll('.existing-image').length : 0;
        }

        // count how many existing images user has marked for deletion (we attach hidden inputs named delete_images)
        function countMarkedForDelete() {
            const inputs = document.querySelectorAll('input[name="delete_images"]');
            return inputs ? inputs.length : 0;
        }

        // compute resulting images count after apply delete marks + new files selected
        function computeResultingImagesCount() {
            const existingCount = countExistingDOM();
            const markedDelete = countMarkedForDelete();
            const remainingExisting = Math.max(0, existingCount - markedDelete);
            const newFiles = (mainInput.files && mainInput.files.length) ? mainInput.files.length : 0;
            return remainingExisting + newFiles;
        }

        function refreshAddMoreVisibility() {
            if (!addMoreBtn) return;
            const cnt = countThumbnails();
            // show button only if there is at least one thumbnail OR at least one selected file
            if (cnt.total > 0) addMoreBtn.style.display = 'inline-flex';
            // if (cnt.total > 0) addMoreBtn.style.display = 'flex';
            else addMoreBtn.style.display = 'none';
        }

        // create preview DOM block (used for client previews)
        function makePreviewBlock(srcOrFileName, sizeText, idOrTempId) {
            const wrap = document.createElement('div');
            wrap.className = 'image-preview-item existing-image position-relative text-center';
            wrap.style.width = '150px';

            const img = document.createElement('img');
            img.style.width = '150px';
            img.style.height = '130px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '4px';
            img.style.display = 'block';
            if (srcOrFileName && typeof srcOrFileName === 'string') img.src = srcOrFileName;

            const meta = document.createElement('div');
            meta.style.marginTop = '10px';
            const nameNode = document.createElement('small');
            nameNode.textContent = idOrTempId || (srcOrFileName && srcOrFileName.name ? srcOrFileName.name : srcOrFileName);
            nameNode.style.display = 'block';

            const sizeNode = document.createElement('small');
            sizeNode.className = 'text-muted d-block';
            sizeNode.textContent = sizeText || '';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-danger btn-delete-image position-absolute';
            btn.style.right = '5px';
            btn.style.top = '5px';
            btn.style.fontSize = '.7rem';
            btn.innerHTML = '<i class="fa fa-times"></i>';

            wrap.appendChild(img);
            meta.appendChild(nameNode);
            meta.appendChild(sizeNode);
            wrap.appendChild(meta);
            wrap.appendChild(btn);

            return wrap;
        }

        // render mainInput.files -> preview container
        function renderFilesFromInput() {
            if (!preview) return;
            preview.innerHTML = '';
            const files = Array.from(mainInput.files || []);
            files.forEach(f => {
                const node = makePreviewBlock('', humanFileSize(f.size), f.name);
                const img = node.querySelector('img');
                const reader = new FileReader();
                reader.onload = function (e) { img.src = e.target.result; };
                reader.readAsDataURL(f);

                // mark remove action for this node (client-only)
                const btn = node.querySelector('.btn-delete-image');
                btn.dataset.action = 'remove-temp';
                preview.appendChild(node);
            });
            updateInfo();
            refreshAddMoreVisibility();
        }

        function updateInfo() {
            const count = (mainInput.files && mainInput.files.length) || 0;
            const cntObj = countThumbnails();
            setInfo(
                `You can upload up to ${MAX} images per post · selected ${count} new file(s).`,
                (cntObj.total > MAX),
            );
        }

        function mergeFilesToMainInput(newFiles) {
            const current = Array.from(mainInput.files || []);
            const filteredNew = newFiles.filter(f => ALLOWED.includes(f.type));
            const merged = current.concat(filteredNew);

            if (merged.length > MAX) {
                const kept = merged.slice(0, MAX);
                const dt = new DataTransfer();
                kept.forEach(f => dt.items.add(f));
                mainInput.files = dt.files;
                renderFilesFromInput();
                setInfo(`You can upload up to ${MAX} images per post. Extra files were not added.`, true);
                refreshAddMoreVisibility();
                return;
            }

            const dt = new DataTransfer();
            merged.forEach(f => dt.items.add(f));
            mainInput.files = dt.files;
            renderFilesFromInput();
            refreshAddMoreVisibility();
        }

        // transient temporary input for "add more"
        let tmpInput = null;
        if (addMoreBtn) {
            try { addMoreBtn.style.display = 'none'; } catch (e) { }
            addMoreBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (!tmpInput) {
                    tmpInput = document.createElement('input');
                    tmpInput.type = 'file';
                    tmpInput.accept = 'image/*';
                    tmpInput.multiple = true;
                    tmpInput.style.display = 'none';
                    document.body.appendChild(tmpInput);

                    tmpInput.addEventListener('change', function () {
                        const files = Array.from(tmpInput.files || []);
                        if (!files.length) return;
                        const currentCount = (mainInput.files && mainInput.files.length) || 0;
                        if (currentCount + files.length > MAX) {
                            const allowedCount = Math.max(0, MAX - currentCount);
                            if (allowedCount === 0) {
                                setInfo(`You can upload up to ${MAX} images per post. Remove some first to add more.`, true);
                                tmpInput.value = '';
                                return;
                            }
                            const toAdd = files.slice(0, allowedCount);
                            mergeFilesToMainInput(toAdd);
                            setInfo(`Only ${allowedCount} files were added to reach the maximum ${MAX}.`, true);
                        } else {
                            mergeFilesToMainInput(files);
                        }
                        tmpInput.value = '';
                    });
                }
                tmpInput.click();
            });
        }

        // main input change (user selected files)
        mainInput.addEventListener('change', function () {
            let files = Array.from(mainInput.files || []);
            if (files.length > MAX) {
                files = files.slice(0, MAX);
                const dt = new DataTransfer();
                files.forEach(f => dt.items.add(f));
                mainInput.files = dt.files;
                setInfo(`You can upload up to ${MAX} images per post. Extra files were removed.`, true);
            }

            const bad = files.filter(f => !ALLOWED.includes(f.type));
            if (bad.length) {
                files = files.filter(f => ALLOWED.includes(f.type));
                const dt = new DataTransfer();
                files.forEach(f => dt.items.add(f));
                mainInput.files = dt.files;
                setInfo(`Removed unsupported types (${bad.map(b => b.name).join(', ')})`, true);
            }

            renderFilesFromInput();
        });

        // GLOBAL click listener: handles both client-side removal and AJAX delete for existing images
        document.addEventListener('click', function (ev) {
            const btn = ev.target.closest && ev.target.closest('button.btn-delete-image');
            if (!btn) return;

            ev.preventDefault();

            // Case: AJAX delete existing image (button must have data-delete-url)
            const deleteUrl = btn.dataset.deleteUrl;
            const imageId = btn.dataset.imageId;
            if (deleteUrl) {
                btn.disabled = true;
                btn.classList.add('opacity-75');
                (async function () {
                    try {
                        const resp = await fetch(deleteUrl, {
                            method: 'POST',
                            headers: {
                                'X-CSRFToken': getCookie('csrftoken'),
                                'X-Requested-With': 'XMLHttpRequest',
                                'Accept': 'application/json'
                            },
                            credentials: 'same-origin'
                        });
                        const data = await resp.json().catch(() => null);
                        if (resp.ok && data && data.success) {
                            const node = document.getElementById('image-' + data.image_id) || btn.closest('.existing-image');
                            if (node) {
                                node.style.transition = 'opacity .15s ease, transform .15s ease';
                                node.style.opacity = '0';
                                node.style.transform = 'scale(.98)';
                                setTimeout(function () {
                                    node.remove();
                                    updateInfo();
                                    refreshAddMoreVisibility();
                                }, 160);
                            } else {
                                updateInfo();
                                refreshAddMoreVisibility();
                            }
                        } else {
                            console.warn('Delete failed', data && data.error);
                            btn.disabled = false;
                            btn.classList.remove('opacity-75');
                        }
                    } catch (err) {
                        console.error('Image delete error', err);
                        btn.disabled = false;
                        btn.classList.remove('opacity-75');
                    }
                })();
                return;
            }

            // Case: client-side removal of file selected in input (button dataset.action === 'remove-temp' OR it's inside preview)
            const item = btn.closest('.image-preview-item');
            if (!item) return;
            const filenameNode = item.querySelector('small');
            const filename = filenameNode ? filenameNode.textContent : null;
            const cur = Array.from(mainInput.files || []);
            const dt = new DataTransfer();
            let removed = false;
            for (let f of cur) {
                if (!removed && filename && f.name === filename) {
                    removed = true;
                    continue;
                }
                dt.items.add(f);
            }
            if (!removed) {
                // fallback by index
                const previews = qsa('.image-preview-item', preview);
                const idx = previews.indexOf(item);
                Array.from(mainInput.files || []).forEach((f, i) => { if (i !== idx) dt.items.add(f); });
            }
            mainInput.files = dt.files;

            // animate and remove DOM
            item.style.transition = 'opacity .15s ease, transform .15s ease';
            item.style.opacity = '0';
            item.style.transform = 'scale(.98)';
            setTimeout(function () {
                item.remove();
                updateInfo();
                refreshAddMoreVisibility();
            }, 160);
        });

        // initial render (bfcache or page load)
        renderFilesFromInput();
        refreshAddMoreVisibility();

    });

    // Video upload handling
    document.addEventListener('DOMContentLoaded', function () {
        var videoInput = document.getElementById('id_videos');
        var addVideoBtn = document.getElementById('btnAddVideo');
        var videoPreview = document.getElementById('videoPreview');
        var MAX_VIDEOS = 3;
        var ALLOWED_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime'];

        if (addVideoBtn && videoInput) {
            addVideoBtn.addEventListener('click', function () {
                videoInput.click();
            });
        }

        if (videoInput) {
            videoInput.addEventListener('change', function () {
                var files = Array.from(videoInput.files || []);
                if (files.length > MAX_VIDEOS) {
                    files = files.slice(0, MAX_VIDEOS);
                    var dt = new DataTransfer();
                    files.forEach(function (f) { dt.items.add(f); });
                    videoInput.files = dt.files;
                }
                renderVideoPreview();
            });
        }

        function renderVideoPreview() {
            if (!videoPreview || !videoInput) return;
            videoPreview.innerHTML = '';
            var files = Array.from(videoInput.files || []);
            files.forEach(function (f, i) {
                var wrap = document.createElement('div');
                wrap.className = 'video-preview-item existing-video position-relative text-center';
                wrap.style.width = '150px';

                var thumb = document.createElement('div');
                thumb.className = 'existing-video__thumb';
                thumb.innerHTML = '<i class="fa fa-video-camera"></i><small class="d-block text-muted mt-1">' + f.name.substring(0, 20) + '</small><small class="text-muted d-block">' + (f.size / (1024 * 1024)).toFixed(1) + ' MB</small>';
                wrap.appendChild(thumb);

                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn btn-sm btn-danger btn-delete-video position-absolute';
                btn.style.right = '5px';
                btn.style.top = '5px';
                btn.style.fontSize = '.7rem';
                btn.innerHTML = '<i class="fa fa-times"></i>';
                btn.addEventListener('click', function () {
                    var cur = Array.from(videoInput.files || []);
                    var dt = new DataTransfer();
                    cur.forEach(function (vf, vi) { if (vi !== i) dt.items.add(vf); });
                    videoInput.files = dt.files;
                    renderVideoPreview();
                });
                wrap.appendChild(btn);
                videoPreview.appendChild(wrap);
            });
        }
    });

    // Video mark-for-delete on edit page
    document.addEventListener('DOMContentLoaded', function () {
        var existingVideos = document.getElementById('existingVideos');
        if (!existingVideos) return;

        var deleteVideoContainer = document.getElementById('deleteVideoInputs') || (function () {
            var d = document.createElement('div');
            d.id = 'deleteVideoInputs';
            existingVideos.insertAdjacentElement('afterend', d);
            return d;
        })();

        existingVideos.addEventListener('click', function (ev) {
            var btn = ev.target.closest && ev.target.closest('button.btn-mark-delete-video');
            if (!btn) return;
            ev.preventDefault();
            var videoId = btn.dataset.videoId;
            if (!videoId) return;
            var wrapper = btn.closest('.existing-video');
            if (!wrapper) return;
            var isMarked = btn.getAttribute('aria-pressed') === 'true';
            if (!isMarked) {
                wrapper.classList.add('marked-for-delete');
                wrapper.style.opacity = '0.5';
                btn.innerHTML = '<i class="fa fa-undo" aria-hidden="true"></i>';
                btn.setAttribute('aria-pressed', 'true');
                btn.title = 'Unmark deletion';
                var hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.name = 'delete_videos';
                hidden.value = videoId;
                hidden.id = 'delete-video-input-' + videoId;
                deleteVideoContainer.appendChild(hidden);
            } else {
                wrapper.classList.remove('marked-for-delete');
                wrapper.style.opacity = '';
                btn.innerHTML = '<i class="fa fa-times"></i>';
                btn.setAttribute('aria-pressed', 'false');
                btn.title = 'Mark for deletion';
                var hid = document.getElementById('delete-video-input-' + videoId);
                if (hid) hid.remove();
            }
        });
    });

    // second DOMContentLoaded block remains, for existingContainer mark/unmark logic
    document.addEventListener('DOMContentLoaded', function () {
        const existingContainer = document.getElementById('existingImages');
        if (!existingContainer) return;

        const deleteInputsContainer = document.getElementById('deleteInputs') || (function () {
            const d = document.createElement('div');
            d.id = 'deleteInputs';
            existingContainer.insertAdjacentElement('afterend', d);
            return d;
        })();

        // toggle mark
        existingContainer.addEventListener('click', function (ev) {
            const btn = ev.target.closest && ev.target.closest('button.btn-mark-delete');
            if (!btn) return;
            ev.preventDefault();

            const imageId = btn.dataset.imageId;
            if (!imageId) return;

            const wrapper = btn.closest('.existing-image');
            if (!wrapper) return;

            const isMarked = btn.getAttribute('aria-pressed') === 'true';

            if (!isMarked) {
                // mark visually
                wrapper.classList.add('marked-for-delete');
                // dim thumbnail
                wrapper.style.opacity = '0.5';
                // change button (optional: icon -> undo)
                btn.innerHTML = '<i class="fa fa-undo" aria-hidden="true"></i>';
                btn.setAttribute('aria-pressed', 'true');
                btn.title = 'Unmark deletion';

                // create hidden input to be submitted with the form
                const hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.name = 'delete_images';
                hidden.value = imageId;
                hidden.id = 'delete-input-' + imageId;
                deleteInputsContainer.appendChild(hidden);
            } else {
                // unmark
                wrapper.classList.remove('marked-for-delete');
                wrapper.style.opacity = '';
                btn.innerHTML = '<i class="fa fa-times"></i>';
                btn.setAttribute('aria-pressed', 'false');
                btn.title = 'Mark for deletion';

                // remove hidden input
                const hid = document.getElementById('delete-input-' + imageId);
                if (hid) hid.remove();
            }
        });
    });
})();