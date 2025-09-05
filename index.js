document.addEventListener('DOMContentLoaded', () => {
    const CANVAS_SIZE = 1024;

    // DOM Elements
    const canvasContainer = document.getElementById('canvas-container');
    const canvas = document.getElementById('workspace');
    const ctx = canvas.getContext('2d');
    const fileInput = document.getElementById('file-input');
    const uploadPrompt = document.getElementById('upload-prompt');
    const stickerEditor = document.getElementById('sticker-editor');
    const stickerSelector = document.getElementById('sticker-selector');
    const rotateSlider = document.getElementById('rotate-slider');
    const scaleSlider = document.getElementById('scale-slider');
    const flipButton = document.getElementById('flip-button');
    const deleteButton = document.getElementById('delete-button');
    const resetButton = document.getElementById('reset-button');
    const saveButton = document.getElementById('save-button');
    const stickerButtons = document.querySelectorAll('.sticker-btn');

    // Canvas setup
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    // App State
    let background = null;
    let stickers = [];
    let activeStickerId = null;
    let dragContext = null;
    let pinchContext = null; // For mobile pinch-to-zoom
    const stickerImageCache = {};

    const getSelectedSticker = () => stickers.find(s => s.id === activeStickerId);

    function drawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (background && background.img?.complete) {
            const w = background.width * background.scale;
            const h = background.height * background.scale;
            ctx.drawImage(background.img, background.x, background.y, w, h);
        }

        stickers.forEach(sticker => {
            const img = stickerImageCache[sticker.id];
            if (img?.complete) {
                const w = sticker.width * sticker.scale;
                const h = sticker.height * sticker.scale;
                ctx.save();
                ctx.translate(sticker.x + w / 2, sticker.y + h / 2);
                ctx.rotate(sticker.rotation * Math.PI / 180);
                ctx.scale(sticker.flipX ? -1 : 1, 1);
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
                ctx.restore();
            }
        });
        
        const selectedSticker = getSelectedSticker();
        if (selectedSticker) {
            const w = selectedSticker.width * selectedSticker.scale;
            const h = selectedSticker.height * selectedSticker.scale;
            ctx.save();
            ctx.translate(selectedSticker.x + w / 2, selectedSticker.y + h / 2);
            ctx.rotate(selectedSticker.rotation * Math.PI / 180);
            ctx.strokeStyle = '#F97316';
            ctx.lineWidth = 8;
            ctx.strokeRect(-w / 2, -h / 2, w, h);
            ctx.restore();
        }
    }
    
    function updateUI() {
        const selectedSticker = getSelectedSticker();
        if (selectedSticker) {
            stickerEditor.classList.remove('hidden');
            stickerSelector.classList.add('hidden');
            rotateSlider.value = selectedSticker.rotation;
            scaleSlider.value = selectedSticker.scale;
        } else {
            stickerEditor.classList.add('hidden');
            stickerSelector.classList.remove('hidden');
        }
        uploadPrompt.classList.toggle('hidden', !!background);
        saveButton.disabled = !background;
        canvas.style.cursor = dragContext ? 'grabbing' : (background ? 'grab' : 'pointer');
        drawCanvas();
    }

    function getInitialBackgroundState(img) {
        const scale = Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);
        const newWidth = img.width * scale;
        const newHeight = img.height * scale;
        return { img, src: img.src, width: img.width, height: img.height, scale, x: (CANVAS_SIZE - newWidth) / 2, y: (CANVAS_SIZE - newHeight) / 2 };
    }

    fileInput.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = event => {
                const img = new Image();
                img.onload = () => {
                    background = getInitialBackgroundState(img);
                    updateUI();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    canvasContainer.addEventListener('click', () => {
        if (!background) {
            fileInput.click();
        }
    });

    stickerButtons.forEach(button => {
        button.addEventListener('click', () => {
            const src = button.dataset.src;
            const id = Date.now().toString();
            const img = new Image();
            
            if (!src.startsWith('data:')) {
                img.crossOrigin = "Anonymous";
            }
            
            img.onload = () => {
                stickerImageCache[id] = img;
                const scale = Math.min(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height, 1) * 0.25;
                stickers.push({
                    id, src, width: img.width, height: img.height, scale,
                    x: (CANVAS_SIZE - img.width * scale) / 2,
                    y: (CANVAS_SIZE - img.height * scale) / 2,
                    rotation: 0, flipX: false,
                });
                activeStickerId = id;
                updateUI();
            };
            img.onerror = () => {
                alert(`Could not load sticker from: ${src}\nThis might be due to server restrictions (CORS).`);
            };
            img.src = src;
        });
    });

    // --- Canvas Interaction ---

    const getCanvasCoords = (e) => {
        const rect = canvas.getBoundingClientRect();
        const pointer = e.touches ? e.touches[0] : e;
        if (!pointer) return { x: 0, y: 0 };
        return {
            x: (pointer.clientX - rect.left) / rect.width * CANVAS_SIZE,
            y: (pointer.clientY - rect.top) / rect.height * CANVAS_SIZE,
        };
    };
    
    const isPointerInImage = (coords, image) => {
        const w = image.width * image.scale;
        const h = image.height * image.scale;
        return coords.x >= image.x && coords.x <= image.x + w && coords.y >= image.y && coords.y <= image.y + h;
    };

    const findTargetAt = (coords) => {
        const targetSticker = [...stickers].reverse().find(s => isPointerInImage(coords, s));
        if (targetSticker) return targetSticker;
        if (background && isPointerInImage(coords, background)) return background;
        return null;
    };

    const applyScale = (target, newScale, zoomCenter) => {
        const oldW = target.width * target.scale;
        const newW = target.width * newScale;
        const oldH = target.height * target.scale;
        const newH = target.height * newScale;

        target.scale = newScale;
        if (oldW > 0 && oldH > 0) {
            target.x -= ((zoomCenter.x - target.x) / oldW) * (newW - oldW);
            target.y -= ((zoomCenter.y - target.y) / oldH) * (newH - oldH);
        }
    };
    
    // Mouse Handlers
    canvas.addEventListener('mousedown', e => {
        const coords = getCanvasCoords(e);
        const target = findTargetAt(coords);

        if (target && stickers.includes(target)) {
            activeStickerId = target.id;
            dragContext = { target, x: coords.x, y: coords.y, imgX: target.x, imgY: target.y };
        } else if (target) {
            activeStickerId = null;
            dragContext = { target, x: coords.x, y: coords.y, imgX: target.x, imgY: target.y };
        } else {
            activeStickerId = null;
        }
        updateUI();
    });

    canvas.addEventListener('mousemove', e => {
        if (!dragContext) return;
        const coords = getCanvasCoords(e);
        const dx = coords.x - dragContext.x;
        const dy = coords.y - dragContext.y;
        dragContext.target.x = dragContext.imgX + dx;
        dragContext.target.y = dragContext.imgY + dy;
        drawCanvas();
    });

    canvas.addEventListener('wheel', e => {
        if (!background) return;
        e.preventDefault();
        const coords = getCanvasCoords(e);
        const target = findTargetAt(coords);
        if (!target) return;

        const scaleAmount = -e.deltaY * 0.001;
        const newScale = Math.max(0.05, target.scale + scaleAmount);
        applyScale(target, newScale, coords);
        
        if(stickers.includes(target)) {
            scaleSlider.value = newScale;
        }
        drawCanvas();
    });

    // Touch Handlers
    const getTouchDistance = (t1, t2) => Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
    const getTouchMidpoint = (t1, t2) => {
        const rect = canvas.getBoundingClientRect();
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        return { x: (midX - rect.left) * (CANVAS_SIZE / rect.width), y: (midY - rect.top) * (CANVAS_SIZE / rect.height) };
    };

    canvas.addEventListener('touchstart', e => {
        if (!background) return;
        e.preventDefault();
        const touches = e.touches;

        if (touches.length === 1) {
            pinchContext = null;
            const coords = getCanvasCoords(e);
            const target = findTargetAt(coords);
            if (target && stickers.includes(target)) {
                activeStickerId = target.id;
                dragContext = { target, x: coords.x, y: coords.y, imgX: target.x, imgY: target.y };
            } else if (target) {
                activeStickerId = null;
                dragContext = { target, x: coords.x, y: coords.y, imgX: target.x, imgY: target.y };
            } else {
                activeStickerId = null;
            }
            updateUI();
        } else if (touches.length === 2) {
            dragContext = null;
            const midpoint = getTouchMidpoint(touches[0], touches[1]);
            const target = findTargetAt(midpoint);
            if (target) {
                pinchContext = { target, initialDistance: getTouchDistance(touches[0], touches[1]), initialScale: target.scale };
            }
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        if (!background) return;
        e.preventDefault();
        const touches = e.touches;

        if (touches.length === 1 && dragContext) {
            const coords = getCanvasCoords(e);
            const dx = coords.x - dragContext.x;
            const dy = coords.y - dragContext.y;
            dragContext.target.x = dragContext.imgX + dx;
            dragContext.target.y = dragContext.imgY + dy;
            drawCanvas();
        } else if (touches.length === 2 && pinchContext) {
            const { target, initialDistance, initialScale } = pinchContext;
            const newDistance = getTouchDistance(touches[0], touches[1]);
            const scaleFactor = newDistance / initialDistance;
            const newScale = Math.max(0.05, initialScale * scaleFactor);
            const midpoint = getTouchMidpoint(touches[0], touches[1]);
            applyScale(target, newScale, midpoint);

            if (stickers.includes(target)) {
                scaleSlider.value = newScale;
            }
            drawCanvas();
        }
    }, { passive: false });

    const endInteraction = () => {
        dragContext = null;
        pinchContext = null;
        updateUI();
    };

    canvas.addEventListener('mouseup', endInteraction);
    canvas.addEventListener('mouseleave', endInteraction);
    canvas.addEventListener('touchend', endInteraction);
    canvas.addEventListener('touchcancel', endInteraction);


    // Controls listeners
    rotateSlider.addEventListener('input', e => {
        const sticker = getSelectedSticker();
        if (sticker) {
            sticker.rotation = +e.target.value;
            drawCanvas();
        }
    });
    scaleSlider.addEventListener('input', e => {
        const sticker = getSelectedSticker();
        if (sticker) {
            sticker.scale = +e.target.value;
            drawCanvas();
        }
    });
    flipButton.addEventListener('click', () => {
        const sticker = getSelectedSticker();
        if (sticker) {
            sticker.flipX = !sticker.flipX;
            drawCanvas();
        }
    });
    deleteButton.addEventListener('click', () => {
        if (activeStickerId) {
            stickers = stickers.filter(s => s.id !== activeStickerId);
            activeStickerId = null;
            updateUI();
        }
    });

    resetButton.addEventListener('click', () => {
        background = null;
        stickers = [];
        activeStickerId = null;
        fileInput.value = "";
        updateUI();
    });

    saveButton.addEventListener('click', () => {
        if (!background) return;
        const currentActiveId = activeStickerId;
        activeStickerId = null; 
        drawCanvas(); 

        const link = document.createElement('a');
        link.download = 'sticker-creation.png';
        link.href = canvas.toDataURL('image/png');
        link.click();

        activeStickerId = currentActiveId; 
        drawCanvas();
    });

    // Initial UI state
    updateUI();
});
