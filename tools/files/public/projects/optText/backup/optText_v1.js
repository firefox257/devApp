// ./system/ux/optText.js

import { 
    injectStyles,
    showToast,
    getDialogOverlay,
    createOptTextDOM,
    LINE_HEIGHT,
    LINE_NUM_WIDTH,
    BOTTOM_PADDING,
    FONT_SIZE,
    FONT_FAMILY
} from './optTextUI.js';

const CONFIG = {
    fontSize: FONT_SIZE,
    fontFamily: FONT_FAMILY,
    lineHeight: LINE_HEIGHT,
    lineNumWidth: LINE_NUM_WIDTH,
    bottomPadding: BOTTOM_PADDING,
    charWidth: 9,
    momentumFriction: 0.985,
    momentumMinSpeed: 0.1,
    velocityMultiplier: 1.0,
    tapThreshold: 8,
    tapMaxTime: 200,
    scrollbarFadeDelay: 1000,
    keyboardScrollRatio: 0.40,
    cursorHorizontalPadding: 20,
    longPressDelay: 400,
    longPressMoveThreshold: 15,
    zoomMoveThreshold: 5,
    zoomLevel: 2.5,
    zoomFadeDelay: 250,
    scrollThreshold: 20,
    anchorColor: '#1a73e8',
    anchorSelectedColor: '#0d47a1',
    focusColor: '#f57c00',
    focusSelectedColor: '#e65100',
    debugHistory: false  // Enable console logs for debugging history
};

// --- History Management Config ---
const HISTORY_CONFIG = {
    maxEntries: 100,
    disableCoalesce: true
};

export function setupOptTextInstance(originalElement = null) {
    injectStyles();

    let lines = [''];
    let scroll = { y: 0, x: 0 };
    let cursor = { line: 0, col: 0, visible: true };
    let selection = { active: false, anchor: { line: 0, col: 0 }, focus: { line: 0, col: 0 } };
    let selectedHandle = null;
    let isEditing = false;
    let isLoading = false;
    
    let insertionPoint = { type: 'cursor', ref: cursor };
    
    let metrics = {
        charWidth: 9,
        viewportWidth: 0,
        viewportHeight: 0,
        visibleLineCount: 0,
        maxScrollY: 0,
        maxScrollX: 0,
        contentWidth: 0,
        dpr: window.devicePixelRatio || 1,
        fullViewportHeight: 0,
        keyboardHeight: 0,
        totalContentHeight: 0,
        _fontCached: null
    };
    
    let touch = {
        lastY: 0, lastX: 0, lastTime: 0,
        velocityY: 0, velocityX: 0,
        isScrolling: false, startTime: 0,
        startY: 0, startX: 0, momentumId: null,
        lastMomentumTime: 0, touchedHandle: null,
        didScroll: false,
        scrollYAtGrab: 0,
        scrollXAtGrab: 0
    };
    
    let zoom = {
        active: false,
        timer: null,
        viewportX: 0,
        viewportY: 0,
        fadeTimer: null,
        dragStart: { x: 0, y: 0 }
    };
    
    // --- History State ---
    let history = {
        undoStack: [],
        redoStack: [],
        lastOpTime: 0,
        suppressNext: false
    };
    
    let pendingClipboardText = '';
    let needsRender = true;
    let lastRenderTime = 0;
    
    let container, canvas, ctx, toolbar, dropdown, hiddenInput, cursorPreview, loadingEl;
    let vScroll, vThumb, hScroll, hThumb, menuBtn, modalOverlay;
    
    let scrollbarsVisible = false;
    let scrollbarTimeout = null;
    let instanceOnChange = null;
    let instanceOnInput = null;

    const originalId = originalElement?.id || null;
    const originalClass = originalElement?.className || '';
    
    container = createOptTextDOM(originalClass, originalId);
    
    canvas = container.querySelector('.opt-text-canvas');
    ctx = canvas.getContext('2d', { alpha: false });
    toolbar = container.querySelector('.opt-text-toolbar');
    dropdown = container.querySelector('.opt-text-dropdown');
    hiddenInput = container.querySelector('.opt-text-hidden-input');
    cursorPreview = container.querySelector('.opt-text-cursor-preview');
    loadingEl = container.querySelector('.opt-text-loading');
    vScroll = container.querySelector('.opt-text-scrollbar.vertical');
    vThumb = vScroll.querySelector('.opt-text-scrollbar-thumb');
    hScroll = container.querySelector('.opt-text-scrollbar.horizontal');
    hThumb = hScroll.querySelector('.opt-text-scrollbar-thumb');
    menuBtn = container.querySelector('[data-action="menu"]');
    modalOverlay = getDialogOverlay(container);

    // --- Value/Observable Properties ---
    Object.defineProperty(container, 'value', {
        get() { return lines.join('\n'); },
        set(newValue) {
            if (typeof newValue === 'string') {
                const snapshotBefore = _getDocumentSnapshot();
                lines = newValue.split('\n');
                if (lines.length === 0) lines = [''];
                _updateMetrics();
                needsRender = true;
                const snapshotAfter = _getDocumentSnapshot();
                history.undoStack.push(_createBulkEntry(snapshotBefore, snapshotAfter, 'value-set'));
                history.redoStack = [];
                _updateUndoRedoButtons();
                _logHistory('value-set');
                if (instanceOnChange) instanceOnChange.call(container, { target: container });
            }
        },
        configurable: true
    });

    Object.defineProperty(container, 'onchange', {
        get() { return instanceOnChange; },
        set(fn) { instanceOnChange = typeof fn === 'function' ? fn : null; },
        configurable: true
    });

    Object.defineProperty(container, 'oninput', {
        get() { return instanceOnInput; },
        set(fn) { instanceOnInput = typeof fn === 'function' ? fn : null; },
        configurable: true
    });

    // --- Metrics & Rendering ---
    function _updateMetrics() {
        const rect = container.getBoundingClientRect();
        metrics.dpr = window.devicePixelRatio || 1;
        metrics.viewportWidth = rect.width;
        metrics.viewportHeight = Math.max(0, rect.height - 28);
        metrics.fullViewportHeight = metrics.viewportHeight;
        metrics.visibleLineCount = Math.ceil(metrics.viewportHeight / CONFIG.lineHeight) + 2;
        metrics.totalContentHeight = (lines.length * CONFIG.lineHeight) + CONFIG.bottomPadding;
        metrics.maxScrollY = Math.max(0, metrics.totalContentHeight - metrics.fullViewportHeight);
        metrics.contentWidth = _estimateContentWidth();
        metrics.maxScrollX = Math.max(0, metrics.contentWidth - metrics.viewportWidth);
        
        if (ctx) {
            const fontKey = `${CONFIG.fontSize}px ${CONFIG.fontFamily}`;
            if (!metrics._fontCached || metrics._fontCached !== fontKey) {
                ctx.font = fontKey;
                metrics.charWidth = ctx.measureText('M').width || 9;
                metrics._fontCached = fontKey;
            }
        }
    }

    function _estimateContentWidth() {
        let maxLen = 0;
        const start = Math.max(0, Math.floor(scroll.y / CONFIG.lineHeight) - 50);
        const end = Math.min(lines.length, start + 200);
        for (let i = start; i < end; i++) {
            if (lines[i]?.length > maxLen) maxLen = lines[i].length;
        }
        if (lines[cursor.line]?.length > maxLen) maxLen = lines[cursor.line].length;
        return maxLen * metrics.charWidth + CONFIG.lineNumWidth + 40;
    }

    function _setupCanvas() {
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        
        metrics.dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * metrics.dpr);
        canvas.height = Math.round(Math.max(0, rect.height - 28) * metrics.dpr);
        canvas.style.width = rect.width + 'px';
        canvas.style.height = Math.max(0, rect.height - 28) + 'px';
        
        if (ctx) {
            const fontKey = `${CONFIG.fontSize}px ${CONFIG.fontFamily}`;
            if (!metrics._fontCached || metrics._fontCached !== fontKey) {
                ctx.font = fontKey;
                metrics.charWidth = ctx.measureText('M').width || 9;
                metrics._fontCached = fontKey;
            }
        }
        return true;
    }

    function _renderLoop(timestamp) {
        if (needsRender) {
            _render(timestamp);
            needsRender = false;
            lastRenderTime = timestamp;
        }
        requestAnimationFrame(_renderLoop);
    }

    function _render(timestamp) {
        if (!ctx || isLoading || metrics.viewportWidth <= 0 || metrics.viewportHeight <= 0) return;
        
        const scale = zoom.active ? CONFIG.zoomLevel : 1;
        const offsetX = zoom.active ? zoom.viewportX * (1 - scale) : 0;
        const offsetY = zoom.active ? zoom.viewportY * (1 - scale) : 0;
        
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.setTransform(
            metrics.dpr * scale, 0,
            0, metrics.dpr * scale,
            offsetX * metrics.dpr,
            offsetY * metrics.dpr
        );
        
        ctx.fillStyle = getComputedStyle(container).getPropertyValue('--ot-bg-canvas') || '#ffffff';
        ctx.fillRect(0, 0, metrics.viewportWidth, metrics.viewportHeight);
        
        if (!metrics.charWidth || metrics.charWidth <= 0) {
            const fontKey = `${CONFIG.fontSize}px ${CONFIG.fontFamily}`;
            ctx.font = fontKey;
            metrics.charWidth = ctx.measureText('M').width || 9;
            metrics._fontCached = fontKey;
        }
        
        const effectiveViewportHeight = metrics.viewportHeight / scale;
        let startLine = Math.max(0, Math.floor(scroll.y / CONFIG.lineHeight));
        let endLine = Math.min(lines.length, startLine + Math.ceil(effectiveViewportHeight / CONFIG.lineHeight) + 2);
        
        if (zoom.active) {
            startLine = Math.min(startLine, cursor.line);
            endLine = Math.max(endLine, cursor.line + 1);
        }
        
        ctx.font = `${CONFIG.fontSize}px ${CONFIG.fontFamily}`;
        ctx.textBaseline = 'top';
        
        for (let i = startLine; i < endLine; i++) {
            const y = (i * CONFIG.lineHeight) - scroll.y;
            
            const activeLine = insertionPoint.ref?.line ?? cursor.line;
            if (i === activeLine) {
                ctx.fillStyle = '#fff9c4';
                if (zoom.active) {
                    const highlightX = -offsetX / scale;
                    const highlightWidth = metrics.viewportWidth / scale;
                    ctx.fillRect(highlightX, y, highlightWidth, CONFIG.lineHeight);
                } else {
                    ctx.fillRect(0, y, metrics.viewportWidth, CONFIG.lineHeight);
                }
            }
            
            ctx.fillStyle = '#f8f8f8';
            ctx.fillRect(0, y, CONFIG.lineNumWidth, CONFIG.lineHeight);
            
            ctx.strokeStyle = '#e0e0e0';
            ctx.beginPath();
            ctx.moveTo(CONFIG.lineNumWidth - 0.5, y);
            ctx.lineTo(CONFIG.lineNumWidth - 0.5, y + CONFIG.lineHeight);
            ctx.stroke();
            
            ctx.fillStyle = '#666';
            ctx.textAlign = 'right';
            ctx.fillText(String(i + 1).padStart(7, ' '), CONFIG.lineNumWidth - 12, y);
            ctx.textAlign = 'left';
            
            ctx.save();
            ctx.beginPath();
            ctx.rect(CONFIG.lineNumWidth, -10000, metrics.viewportWidth, 20000);
            ctx.clip();
            ctx.fillStyle = '#000';
            ctx.fillText(lines[i] || '', CONFIG.lineNumWidth + 8 - scroll.x, y);
            ctx.restore();
        }
        
        if (selection.active) {
            const range = _getSelectionRange();
            if (range) {
                ctx.fillStyle = 'rgba(26, 115, 232, 0.25)';
                for (let i = range.start.line; i <= range.end.line; i++) {
                    const y = (i * CONFIG.lineHeight) - scroll.y;
                    if (y + CONFIG.lineHeight < 0 || y > metrics.viewportHeight) continue;
                    
                    let sx, ex;
                    if (i === range.start.line && i === range.end.line) {
                        sx = CONFIG.lineNumWidth + 8 - scroll.x + (range.start.col * metrics.charWidth);
                        ex = CONFIG.lineNumWidth + 8 - scroll.x + (range.end.col * metrics.charWidth);
                    } else if (i === range.start.line) {
                        sx = CONFIG.lineNumWidth + 8 - scroll.x + (range.start.col * metrics.charWidth);
                        ex = metrics.viewportWidth + 100;
                    } else if (i === range.end.line) {
                        sx = CONFIG.lineNumWidth + 8 - scroll.x;
                        ex = CONFIG.lineNumWidth + 8 - scroll.x + (range.end.col * metrics.charWidth);
                    } else {
                        sx = CONFIG.lineNumWidth + 8 - scroll.x;
                        ex = metrics.viewportWidth + 100;
                    }
                    ctx.fillRect(sx, y, Math.max(0, ex - sx), CONFIG.lineHeight);
                }
            }
            _drawSelectionCursors();
            _drawSelectionHandles();
        }
        
        const shouldDrawCursor = cursor.line >= startLine && cursor.line < endLine && cursor.line < lines.length;
        if (shouldDrawCursor && (zoom.active || cursor.visible) && !selection.active) {
            const text = lines[cursor.line] || '';
            const col = Math.min(cursor.col, text.length);
            const cursorX = CONFIG.lineNumWidth + 8 - scroll.x + (col * metrics.charWidth);
            const cursorY = (cursor.line * CONFIG.lineHeight) - scroll.y;
            ctx.fillStyle = '#0066cc';
            const cursorWidth = 2 / scale;
            ctx.fillRect(cursorX, cursorY, cursorWidth, CONFIG.lineHeight);
        }
        
        _updateScrollbars();
        _showScrollbars();
    }

    // --- Selection Drawing ---
    function _drawSelectionHandles() {
        if (!selection.active) return;
        const scale = zoom.active ? CONFIG.zoomLevel : 1;
        _drawHandle(selection.focus.line, selection.focus.col, selectedHandle === 'focus', scale, 'focus');
        _drawHandle(selection.anchor.line, selection.anchor.col, selectedHandle === 'anchor', scale, 'anchor');
    }

    function _drawHandle(line, col, isSelected, scale, handleType) {
        const text = lines[line] || '';
        const clampedCol = Math.min(col, text.length);
        const cursorX = CONFIG.lineNumWidth + 8 - scroll.x + (clampedCol * metrics.charWidth);
        const cursorY = (line * CONFIG.lineHeight) - scroll.y;
        
        if (cursorY < -20 || cursorY > metrics.viewportHeight + 20) return;
        
        const radius = 10;
        const isAnchor = handleType === 'anchor';
        const config = isAnchor 
            ? { base: CONFIG.anchorColor, selected: CONFIG.anchorSelectedColor, fillBase: 'rgba(26, 115, 232, 0.15)', fillSelected: 'rgba(26, 115, 232, 0.25)', ring: 'rgba(26,115,232,0.3)' }
            : { base: CONFIG.focusColor, selected: CONFIG.focusSelectedColor, fillBase: 'rgba(245, 124, 0, 0.15)', fillSelected: 'rgba(245, 124, 0, 0.25)', ring: 'rgba(245,124,0,0.3)' };
        
        const strokeColor = isSelected ? config.selected : config.base;
        const fillColor = isSelected ? config.fillSelected : config.fillBase;
        
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1;
        
        ctx.beginPath();
        ctx.arc(cursorX, cursorY + CONFIG.lineHeight/2, radius, 0, Math.PI*2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isSelected ? 2.5 : 2;
        ctx.stroke();
        
        if (isSelected) {
            ctx.beginPath();
            ctx.arc(cursorX, cursorY + CONFIG.lineHeight/2, radius + 6, 0, Math.PI*2);
            ctx.strokeStyle = config.ring;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4,3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    function _drawSelectionCursors() {
        if (!selection.active) return;
        const scale = zoom.active ? CONFIG.zoomLevel : 1;
        _drawCursorAt(selection.anchor.line, selection.anchor.col, CONFIG.anchorColor, scale);
        _drawCursorAt(selection.focus.line, selection.focus.col, CONFIG.focusColor, scale);
    }

    function _drawCursorAt(line, col, color, scale) {
        const text = lines[line] || '';
        const clampedCol = Math.min(col, text.length);
        const cursorX = CONFIG.lineNumWidth + 8 - scroll.x + (clampedCol * metrics.charWidth);
        const cursorY = (line * CONFIG.lineHeight) - scroll.y;
        if (cursorY < -20 || cursorY > metrics.viewportHeight + 20) return;
        
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 4 * scale;
        ctx.fillStyle = color;
        const cursorWidth = 2 / scale;
        ctx.fillRect(cursorX, cursorY, cursorWidth, CONFIG.lineHeight);
        ctx.restore();
    }

    // --- Scrollbars ---
    function _updateScrollbars() {
        const vRatio = metrics.fullViewportHeight / metrics.totalContentHeight;
        const vThumbH = Math.max(30, metrics.fullViewportHeight * vRatio);
        const vScrollRatio = metrics.maxScrollY > 0 ? scroll.y / metrics.maxScrollY : 0;
        vThumb.style.height = vThumbH + 'px';
        vThumb.style.top = (vScrollRatio * (metrics.fullViewportHeight - vThumbH)) + 'px';
        
        const hRatio = metrics.viewportWidth / metrics.contentWidth;
        const hThumbW = Math.max(30, metrics.viewportWidth * hRatio);
        const hScrollRatio = metrics.maxScrollX > 0 ? scroll.x / metrics.maxScrollX : 0;
        hThumb.style.width = hThumbW + 'px';
        hThumb.style.left = (hScrollRatio * (metrics.viewportWidth - hThumbW)) + 'px';
    }

    function _showScrollbars() {
        if (isLoading) return;
        if (!scrollbarsVisible) {
            scrollbarsVisible = true;
            vScroll.classList.add('visible');
            hScroll.classList.add('visible');
        }
        clearTimeout(scrollbarTimeout);
        scrollbarTimeout = setTimeout(_hideScrollbars, CONFIG.scrollbarFadeDelay);
    }

    function _hideScrollbars() {
        scrollbarsVisible = false;
        vScroll.classList.remove('visible');
        hScroll.classList.remove('visible');
    }

    // --- Selection Helpers ---
    function _getSelectionRange() {
        if (!selection.active) return null;
        const [a, b] = [selection.anchor, selection.focus];
        if (a.line > b.line || (a.line === b.line && a.col > b.col)) return { start: b, end: a };
        return { start: a, end: b };
    }

    function _getSelectedText() {
        const range = _getSelectionRange();
        if (!range) return '';
        if (range.start.line === range.end.line) {
            return (lines[range.start.line] || '').slice(range.start.col, range.end.col);
        }
        const parts = [(lines[range.start.line] || '').slice(range.start.col)];
        for (let i = range.start.line + 1; i < range.end.line; i++) parts.push(lines[i] || '');
        parts.push((lines[range.end.line] || '').slice(0, range.end.col));
        return parts.join('\n');
    }

    function _clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function _clearSelection() {
        if (selection.active) {
            selection.active = false;
            insertionPoint = { type: 'cursor', ref: cursor };
            needsRender = true;
        }
    }

    // --- History Management Functions ---
    function _getDocumentSnapshot() {
        return {
            lines: lines.map(l => String(l)),
            cursor: { line: cursor.line, col: cursor.col },
            selection: selection.active ? { 
                active: true, 
                anchor: { line: selection.anchor.line, col: selection.anchor.col }, 
                focus: { line: selection.focus.line, col: selection.focus.col } 
            } : { active: false, anchor: null, focus: null }
        };
    }

    function _applySnapshot(snapshot) {
        lines = snapshot.lines.map(l => String(l));
        cursor = { line: snapshot.cursor.line, col: snapshot.cursor.col };
        
        if (snapshot.selection.active) {
            selection.active = true;
            selection.anchor = { 
                line: snapshot.selection.anchor.line, 
                col: snapshot.selection.anchor.col 
            };
            selection.focus = { 
                line: snapshot.selection.focus.line, 
                col: snapshot.selection.focus.col 
            };
            
            // ✅ Re-bind insertionPoint to restored selection objects
            if (insertionPoint.type === 'anchor') {
                insertionPoint.ref = selection.anchor;
            } else if (insertionPoint.type === 'focus') {
                insertionPoint.ref = selection.focus;
            }
        } else {
            selection.active = false;
            selection.anchor = { line: 0, col: 0 };
            selection.focus = { line: 0, col: 0 };
            insertionPoint = { type: 'cursor', ref: cursor };
        }
        
        _updateMetrics();
        needsRender = true;
    }

    function _createBulkEntry(snapshotBefore, snapshotAfter, reason) {
        return {
            type: 'bulk',
            reason,
            before: snapshotBefore,
            after: snapshotAfter,
            timestamp: Date.now()
        };
    }

    function _pushSnapshotEntry(snapshotBefore, snapshotAfter, reason = 'edit') {
        if (history.suppressNext) return;
        
        history.undoStack.push(_createBulkEntry(snapshotBefore, snapshotAfter, reason));
        history.redoStack = [];
        
        if (history.undoStack.length > HISTORY_CONFIG.maxEntries) {
            history.undoStack.shift();
        }
        
        _updateUndoRedoButtons();
        _logHistory(reason);
    }

    // ✅ FIX: Robust Undo using consistent entry objects in BOTH stacks
    function _undo() {
        if (history.undoStack.length === 0) return;
        
        history.suppressNext = true;
        const entry = history.undoStack.pop();
        
        // Capture current state BEFORE applying undo (for redo)
        const currentState = _getDocumentSnapshot();
        
        if (entry.type === 'bulk') {
            _applySnapshot(entry.before);
            _logHistory('undo');
            // Push a PROPER ENTRY to redoStack (not raw snapshot)
            history.redoStack.push(_createBulkEntry(currentState, entry.before, entry.reason + '-undo'));
        } else {
            if (entry.cursorBefore) cursor = { ...entry.cursorBefore };
            _logHistory('undo-fallback');
        }
        
        needsRender = true;
        _forceCursorPositionVisible(cursor.line, cursor.col);
        history.suppressNext = false;
        _updateUndoRedoButtons();
        
        if (instanceOnChange) instanceOnChange.call(container, { target: container });
    }

    // ✅ FIX: Robust Redo using consistent entry objects in BOTH stacks
    function _redo() {
        if (history.redoStack.length === 0) return;
        
        history.suppressNext = true;
        const entry = history.redoStack.pop();
        
        // Capture current state BEFORE applying redo (for undo)
        const currentState = _getDocumentSnapshot();
        
        if (entry.type === 'bulk') {
            _applySnapshot(entry.after);
            _logHistory('redo');
            // Push a PROPER ENTRY to undoStack (not raw snapshot)
            history.undoStack.push(_createBulkEntry(currentState, entry.after, entry.reason + '-redo'));
        }
        
        needsRender = true;
        _forceCursorPositionVisible(cursor.line, cursor.col);
        history.suppressNext = false;
        _updateUndoRedoButtons();
        
        if (instanceOnChange) instanceOnChange.call(container, { target: container });
    }

    function _updateUndoRedoButtons() {
        const undoBtn = container.querySelector('[data-action="undo"]');
        const redoBtn = container.querySelector('[data-action="redo"]');
        if (undoBtn) undoBtn.disabled = history.undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = history.redoStack.length === 0;
    }

    function _logHistory(label) {
        if (!CONFIG.debugHistory) return;
        console.log(`[History ${label}]`, {
            undoCount: history.undoStack.length,
            redoCount: history.redoStack.length,
            cursor: {...cursor},
            selection: {
                active: selection.active,
                anchor: selection.active ? {...selection.anchor} : null,
                focus: selection.active ? {...selection.focus} : null
            },
            insertionPoint: { 
                type: insertionPoint.type, 
                ref: insertionPoint.ref === cursor ? 'cursor' : 
                     (insertionPoint.ref === selection.anchor ? 'anchor' : 
                     (insertionPoint.ref === selection.focus ? 'focus' : 'unknown')) 
            },
            linesCount: lines.length
        });
    }

    // --- Event Helpers ---
    function _getEventPoint(e) {
        if (e.touches?.[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (e.changedTouches?.[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    }

    function _isTouchEvent(e) { return e.type.startsWith('touch'); }

    function _shouldPreventDefault(e, isScrolling) {
        return _isTouchEvent(e) && (isScrolling || zoom.active || touch.touchedHandle);
    }

    // --- Pointer Handlers ---
    function _onPointerDown(e) {
        if (isLoading || (e.button !== undefined && e.button !== 0)) return;
        
        if (_isTouchEvent(e) && (selection.active || zoom.active || touch.touchedHandle)) {
            e.preventDefault();
        }
        
        const point = _getEventPoint(e);
        touch.startY = touch.lastY = point.y;
        touch.startX = touch.lastX = point.x;
        touch.startTime = touch.lastTime = Date.now();
        touch.isScrolling = false;
        touch.touchedHandle = null;
        touch.didScroll = false;
        _stopMomentum();
        
        if (selection.active && !zoom.active) {
            const handle = _getHandleAtPosition(point.x, point.y);
            if (handle) {
                if (_shouldPreventDefault(e, false)) e.preventDefault();
                selectedHandle = handle;
                touch.touchedHandle = handle;
                touch.scrollYAtGrab = scroll.y;
                touch.scrollXAtGrab = scroll.x;
                needsRender = true;
                showToast(`Selected ${handle === 'anchor' ? 'blue' : 'orange'} handle`, container);
                _cancelZoomTimer();
                zoom.timer = setTimeout(() => _activateZoom(point.x, point.y), CONFIG.longPressDelay);
                return;
            }
        }
        _cancelZoomTimer();
        zoom.timer = setTimeout(() => _activateZoom(point.x, point.y), CONFIG.longPressDelay);
    }

    function _onPointerMove(e) {
        if (isLoading) return;
        const point = _getEventPoint(e);
        const now = Date.now();
        const dy = point.y - touch.lastY;
        const dx = point.x - touch.lastX;
        const dt = now - touch.lastTime;
        const totalDy = point.y - touch.startY;
        const totalDx = point.x - touch.startX;
        const distance = Math.sqrt(totalDy ** 2 + totalDx ** 2);
        
        if (!zoom.active && distance > CONFIG.longPressMoveThreshold) _cancelZoomTimer();
        if (zoom.active) {
            if (_shouldPreventDefault(e, false)) e.preventDefault();
            _updateCursorPreview(point.x, point.y);
            zoom.dragStart = { x: point.x, y: point.y };
            return;
        }
        if (!touch.isScrolling && distance > CONFIG.scrollThreshold) {
            touch.isScrolling = true;
            touch.didScroll = true;
            _cancelZoomTimer();
        }
        if (touch.isScrolling) {
            if (_shouldPreventDefault(e, true)) e.preventDefault();
            if (dt > 0) {
                touch.velocityY = (dy / dt) * 16.67;
                touch.velocityX = (dx / dt) * 16.67;
            }
            _scrollBy(dy, dx);
            touch.lastY = point.y;
            touch.lastX = point.x;
            touch.lastTime = now;
        }
    }

    function _placeCursorOrHandle(x, y, target = 'cursor', handleType = null) {
        if (isLoading) return false;
        if (selection.active && selectedHandle && target === 'cursor') return false;
        
        const rect = canvas.getBoundingClientRect();
        const viewportX = x - rect.left;
        const viewportY = y - rect.top;
        
        let contentX, contentY;
        if (zoom.active) {
            const scale = CONFIG.zoomLevel;
            const offsetX = zoom.viewportX * (1 - scale);
            const offsetY = zoom.viewportY * (1 - scale);
            contentX = scroll.x + (viewportX - offsetX) / scale;
            contentY = scroll.y + (viewportY - offsetY) / scale;
        } else {
            contentX = scroll.x + viewportX;
            contentY = scroll.y + viewportY;
        }
        
        const line = Math.floor(contentY / CONFIG.lineHeight);
        const col = Math.floor((contentX - CONFIG.lineNumWidth - 8) / metrics.charWidth);
        
        if (line < 0 || line >= lines.length) return false;
        
        const clampedLine = _clamp(line, 0, lines.length - 1);
        const lineText = lines[clampedLine] || '';
        const clampedCol = Math.max(0, Math.min(col, lineText.length));
        
        if (target === 'cursor') {
            cursor.line = clampedLine;
            cursor.col = clampedCol;
            if (selection.active && !selectedHandle) {
                selection.focus.line = clampedLine;
                selection.focus.col = clampedCol;
            }
            insertionPoint.type = 'cursor';
            insertionPoint.ref = cursor;
            _adjustScrollForCursor(clampedLine, clampedCol);
        } else if (handleType && selection.active) {
            const targetObj = handleType === 'anchor' ? selection.anchor : selection.focus;
            targetObj.line = clampedLine;
            targetObj.col = clampedCol;
            insertionPoint.type = handleType;
            insertionPoint.ref = targetObj;
        }
        
        needsRender = true;
        return true;
    }

    function _adjustScrollForCursor(line, col) {
        if (!metrics.charWidth) metrics.charWidth = 9;
        
        const lineY = line * CONFIG.lineHeight;
        const screenY = lineY - scroll.y;
        if (screenY < 0) scroll.y = _clamp(lineY, 0, metrics.maxScrollY);
        else if (screenY > metrics.viewportHeight - CONFIG.lineHeight) scroll.y = _clamp(lineY - metrics.viewportHeight + CONFIG.lineHeight, 0, metrics.maxScrollY);
        
        const colX = CONFIG.lineNumWidth + 8 + (col * metrics.charWidth);
        const screenX = colX - scroll.x;
        const minVisibleX = CONFIG.lineNumWidth + CONFIG.cursorHorizontalPadding;
        const maxVisibleX = metrics.viewportWidth - CONFIG.cursorHorizontalPadding;
        
        if (screenX < minVisibleX) scroll.x = _clamp(colX - minVisibleX, 0, metrics.maxScrollX);
        else if (screenX > maxVisibleX) scroll.x = _clamp(colX - maxVisibleX, 0, metrics.maxScrollX);
    }

    function _placeCursor(x, y) {
        if (_placeCursorOrHandle(x, y, 'cursor')) {
            _enterEdit();
        }
    }

    function _placeSelectedHandle(clientX, clientY, handleToPlace) {
        _updateMetrics();
        if (_placeCursorOrHandle(clientX, clientY, 'handle', handleToPlace)) {
            _render(performance.now());
            showToast(`✓ ${handleToPlace === 'anchor' ? 'Blue' : 'Orange'} handle at line ${(selection[handleToPlace]?.line || 0) + 1}`, container);
            _enterEdit();
        }
    }

    function _forceCursorPositionVisible(line = cursor.line, col = cursor.col) {
        if (isLoading) return;
        _adjustScrollForCursor(line, col);
        needsRender = true;
        _showScrollbars();
    }

    function _activateZoom(screenX, screenY) {
        if (isLoading || zoom.active) return;
        const rect = canvas.getBoundingClientRect();
        zoom.viewportX = screenX - rect.left;
        zoom.viewportY = screenY - rect.top;
        zoom.active = true;
        zoom.dragStart = { x: screenX, y: screenY };
        canvas.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.5), 0 10px 30px rgba(0,0,0,0.2)';
        _updateCursorPreview(screenX, screenY);
        needsRender = true;
    }

    function _deactivateZoom(placeCursorAtEnd = true) {
        if (!zoom.active) return;
        zoom.active = false;
        canvas.style.boxShadow = 'none';
        cursorPreview.classList.remove('visible');
        clearTimeout(zoom.fadeTimer);
        zoom.fadeTimer = setTimeout(() => { canvas.style.transition = 'none'; }, CONFIG.zoomFadeDelay);
        if (placeCursorAtEnd) _updateCursorFromPreview();
        needsRender = true;
    }

    function _cancelZoomTimer() {
        if (zoom.timer) { clearTimeout(zoom.timer); zoom.timer = null; }
    }

    function _updateCursorPreview(screenX, screenY) {
        if (!zoom.active) { cursorPreview.classList.remove('visible'); return; }
        const rect = canvas.getBoundingClientRect();
        const scale = CONFIG.zoomLevel;
        const viewportX = screenX - rect.left;
        const viewportY = screenY - rect.top;
        const offsetX = zoom.viewportX * (1 - scale);
        const offsetY = zoom.viewportY * (1 - scale);
        const contentX = scroll.x + (viewportX - offsetX) / scale;
        const contentY = scroll.y + (viewportY - offsetY) / scale;
        const line = Math.floor(contentY / CONFIG.lineHeight);
        const col = Math.floor((contentX - CONFIG.lineNumWidth - 8) / metrics.charWidth);
        if (line >= 0 && line < lines.length) {
            const clampedLine = _clamp(line, 0, lines.length - 1);
            const lineText = lines[clampedLine] || '';
            const clampedCol = Math.max(0, Math.min(col, lineText.length));
            const cursorContentX = CONFIG.lineNumWidth + 8 + (clampedCol * metrics.charWidth);
            const cursorContentY = clampedLine * CONFIG.lineHeight;
            const cursorScreenX = rect.left + offsetX + (cursorContentX - scroll.x) * scale;
            const cursorScreenY = rect.top + offsetY + (cursorContentY - scroll.y) * scale;
            cursorPreview.style.left = cursorScreenX + 'px';
            cursorPreview.style.top = cursorScreenY + 'px';
            cursorPreview.classList.add('visible');
            cursor.line = clampedLine;
            cursor.col = clampedCol;
            cursor.visible = true;
            if (selection.active && selectedHandle) {
                const target = selectedHandle === 'anchor' ? selection.anchor : selection.focus;
                target.line = clampedLine; target.col = clampedCol;
            }
            needsRender = true;
        }
    }

    function _updateCursorFromPreview() { if (!isEditing) _enterEdit(); }

    function _scrollBy(dy, dx) {
        if (isLoading) return;
        scroll.y = _clamp(scroll.y - dy, 0, metrics.maxScrollY);
        scroll.x = _clamp(scroll.x - dx, 0, metrics.maxScrollX);
        needsRender = true;
        _showScrollbars();
    }

    function _startMomentum() {
        if (touch.momentumId) cancelAnimationFrame(touch.momentumId);
        touch.lastMomentumTime = performance.now();
        function animate(currentTime) {
            const deltaTime = (currentTime - touch.lastMomentumTime) / 16.67;
            touch.lastMomentumTime = currentTime;
            _scrollBy(touch.velocityY * deltaTime, touch.velocityX * deltaTime);
            touch.velocityY *= CONFIG.momentumFriction;
            touch.velocityX *= CONFIG.momentumFriction;
            const speed = Math.sqrt(touch.velocityY ** 2 + touch.velocityX ** 2);
            if (speed > CONFIG.momentumMinSpeed) {
                touch.momentumId = requestAnimationFrame(animate);
            } else {
                touch.momentumId = null;
                touch.velocityY = 0;
                touch.velocityX = 0;
                _hideScrollbars();
            }
        }
        touch.momentumId = requestAnimationFrame(animate);
    }

    function _stopMomentum() {
        if (touch.momentumId) { cancelAnimationFrame(touch.momentumId); touch.momentumId = null; }
        touch.velocityY = 0;
        touch.velocityX = 0;
    }

    function _enterEdit() {
        isEditing = true;
        hiddenInput.value = '';
        hiddenInput.focus();
        hiddenInput.setSelectionRange(0, 0);
    }

    // --- Text Operations with History ---
    function _insertTextAtCursor(text, recordHistory = true) {
        let snapBefore = null;
        
        if (recordHistory && !history.suppressNext) {
            snapBefore = _getDocumentSnapshot();
        }

        if (!selection.active && insertionPoint.type !== 'cursor') {
            insertionPoint = { type: 'cursor', ref: cursor };
        }
        
        if (selection.active) {
            const range = _getSelectionRange();
            if (range) {
                _replaceSelectionWithText(text, range);
                _clearSelection();
                if (recordHistory && !history.suppressNext && snapBefore) {
                    const snapAfter = _getDocumentSnapshot();
                    _pushSnapshotEntry(snapBefore, snapAfter, 'insert-replace');
                }
                return;
            }
        }

        const ip = insertionPoint.ref;
        if (!ip || ip.line < 0 || ip.line >= lines.length) return;
        
        const currentLine = lines[ip.line] || '';
        const before = currentLine.slice(0, ip.col);
        const after = currentLine.slice(ip.col);
        
        let newCursorLine = ip.line;
        let newCursorCol = ip.col;
        
        if (text.includes('\n')) {
            const parts = text.split('\n');
            lines[ip.line] = before + parts[0];
            if (parts.length > 1) {
                const insertParts = parts.slice(1);
                insertParts[insertParts.length - 1] += after;
                lines.splice(ip.line + 1, 0, ...insertParts);
                newCursorLine = ip.line + parts.length - 1;
            }
            newCursorCol = parts[parts.length - 1].length;
        } else {
            lines[ip.line] = before + text + after;
            newCursorCol = ip.col + text.length;
        }
        
        if (insertionPoint.type !== 'cursor') {
            cursor.line = newCursorLine;
            cursor.col = newCursorCol;
        } else {
            ip.line = newCursorLine;
            ip.col = newCursorCol;
        }
        
        _updateMetrics();
        _forceCursorPositionVisible(newCursorLine, newCursorCol);
        needsRender = true;
        
        if (recordHistory && !history.suppressNext && snapBefore) {
            const snapAfter = _getDocumentSnapshot();
            _pushSnapshotEntry(snapBefore, snapAfter, 'insert');
        }
    }

    function _deleteSelectionRange(range) {
        if (!range) return;
        
        if (range.start.line === range.end.line) {
            const line = lines[range.start.line] || '';
            lines[range.start.line] = line.slice(0, range.start.col) + line.slice(range.end.col);
            cursor.col = range.start.col;
        } else {
            const first = lines[range.start.line] || '';
            const last = lines[range.end.line] || '';
            lines[range.start.line] = first.slice(0, range.start.col) + last.slice(range.end.col);
            const toRemove = range.end.line - range.start.line;
            if (toRemove > 0) lines.splice(range.start.line + 1, toRemove);
            cursor.line = range.start.line;
            cursor.col = range.start.col;
        }
        _updateMetrics();
    }

    function _deleteCurrentSelection() {
        if (!selection.active) return false;
        const range = _getSelectionRange();
        if (!range) return false;
        
        const snapBefore = _getDocumentSnapshot();
        _deleteSelectionRange(range);
        const snapAfter = _getDocumentSnapshot();
        _pushSnapshotEntry(snapBefore, snapAfter, 'delete-selection');
        
        _clearSelection();
        needsRender = true;
        return true;
    }

    async function _handleCopy() {
        if (!isEditing) { _enterEdit(); return; }
        const text = selection.active ? _getSelectedText() : (lines[cursor.line] || '');
        if (!text) { showToast('No text selected', container); return; }
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                showToast(`Copied ${text.length} chars`, container);
            } else {
                _fallbackCopy(text);
            }
        } catch {
            _fallbackCopy(text);
        }
    }
    
    function _fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand('copy');
            showToast(`Copied ${text.length} chars`, container);
        } catch {
            showToast('Copy failed', container);
        }
        document.body.removeChild(ta);
    }
    
    async function _handleCut() {
        if (!isEditing) { _enterEdit(); return; }
        let text = '';
        let range = null;
        if (selection.active) {
            text = _getSelectedText();
            range = _getSelectionRange();
            if (!text) { showToast('No text selected', container); return; }
        } else {
            text = lines[cursor.line] || '';
        }
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                
                const snapBefore = _getDocumentSnapshot();
                if (range && selection.active) {
                    _deleteSelectionRange(range);
                    _clearSelection();
                } else if (!selection.active) {
                    lines[cursor.line] = '';
                    cursor.col = 0;
                }
                const snapAfter = _getDocumentSnapshot();
                _pushSnapshotEntry(snapBefore, snapAfter, 'cut');
                
                _updateMetrics();
                needsRender = true;
                showToast(`Cut ${text.length} chars`, container);
            } else {
                _fallbackCopy(text);
                const snapBefore = _getDocumentSnapshot();
                if (range && selection.active) {
                    _deleteSelectionRange(range);
                    _clearSelection();
                } else if (!selection.active) {
                    lines[cursor.line] = '';
                    cursor.col = 0;
                }
                const snapAfter = _getDocumentSnapshot();
                _pushSnapshotEntry(snapBefore, snapAfter, 'cut-fallback');
                _updateMetrics();
                needsRender = true;
            }
        } catch {
            showToast('Cut failed', container);
        }
    }
    
    function _fallbackCut(text, range) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand('copy');
            const snapBefore = _getDocumentSnapshot();
            if (range && selection.active) {
                _deleteSelectionRange(range);
                _clearSelection();
            } else if (!selection.active) {
                lines[cursor.line] = '';
                cursor.col = 0;
            }
            const snapAfter = _getDocumentSnapshot();
            _pushSnapshotEntry(snapBefore, snapAfter, 'cut-fallback');
            showToast(`Cut ${text.length} chars`, container);
            _updateMetrics();
            needsRender = true;
        } catch {
            showToast('Cut failed', container);
        }
        document.body.removeChild(ta);
    }
    
    async function _handlePaste() {
        if (!isEditing) { _enterEdit(); await new Promise(r => setTimeout(r, 50)); }
        try {
            let clipboardText = '';
            if (navigator.clipboard?.readText) {
                clipboardText = await navigator.clipboard.readText();
            } else {
                hiddenInput.focus();
                await new Promise(r => setTimeout(r, 100));
                clipboardText = hiddenInput.value;
                hiddenInput.value = '';
            }
            if (!clipboardText) { showToast('Clipboard is empty', container); return; }
            
            const snapBefore = _getDocumentSnapshot();
            
            if (selection.active) {
                const range = _getSelectionRange();
                if (range) {
                    _replaceSelectionWithText(clipboardText, range);
                    _clearSelection();
                    const snapAfter = _getDocumentSnapshot();
                    _pushSnapshotEntry(snapBefore, snapAfter, 'paste-selection');
                    showToast(`Replaced selection`, container);
                    return;
                }
            }
            
            _insertTextAtCursor(clipboardText, false); 
            
            const snapAfter = _getDocumentSnapshot();
            _pushSnapshotEntry(snapBefore, snapAfter, 'paste');
            showToast(`Pasted ${clipboardText.length} chars`, container);
        } catch {
            showToast('Paste failed', container);
        }
    }

    function _replaceSelectionWithText(text, range) {
        const replacementLines = text.split('\n');
        const firstLine = lines[range.start.line] || '';
        const lastLine = lines[range.end.line] || '';
        lines[range.start.line] = firstLine.slice(0, range.start.col) + replacementLines[0];
        if (replacementLines.length > 1) {
            lines.splice(range.start.line + 1, 0, ...replacementLines.slice(1));
        }
        const lastRepIdx = range.start.line + replacementLines.length - 1;
        lines[lastRepIdx] += lastLine.slice(range.end.col);
        const originalToRemove = range.end.line - range.start.line;
        if (originalToRemove > 0) {
            lines.splice(range.start.line + replacementLines.length, originalToRemove);
        }
        if (replacementLines.length === 1) {
            cursor.line = range.start.line;
            cursor.col = range.start.col + replacementLines[0].length;
        } else {
            cursor.line = lastRepIdx;
            cursor.col = replacementLines[replacementLines.length - 1].length;
        }
        _updateMetrics();
        _forceCursorPositionVisible(cursor.line, cursor.col);
        needsRender = true;
    }
    
    async function _handleCopyAll() {
        const allText = lines.join('\n');
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(allText);
                showToast('Copied all text', container);
            } else {
                _fallbackCopy(allText);
            }
        } catch {
            _fallbackCopy(allText);
        }
    }
    
    async function _handleReplaceAll() {
        try {
            let clipboardText = '';
            if (navigator.clipboard?.readText) {
                clipboardText = await navigator.clipboard.readText();
            } else {
                hiddenInput.focus();
                await new Promise(r => setTimeout(r, 100));
                clipboardText = hiddenInput.value;
                hiddenInput.value = '';
            }
            if (!clipboardText) { showToast('Clipboard is empty', container); return; }
            pendingClipboardText = clipboardText;
            const modalCurrent = modalOverlay.querySelector('[data-ref="current"]');
            const modalClipboard = modalOverlay.querySelector('[data-ref="clipboard"]');
            if (modalCurrent) modalCurrent.textContent = lines.length.toLocaleString();
            if (modalClipboard) modalClipboard.textContent = clipboardText.split('\n').length.toLocaleString();
            modalOverlay.classList.add('visible');
        } catch {
            showToast('Failed to read clipboard', container);
        }
    }
    
    function _confirmReplaceAll() {
        if (!pendingClipboardText) { _hideModal(); return; }
        
        const snapBefore = _getDocumentSnapshot();
        
        lines = pendingClipboardText.split('\n');
        if (lines.length === 0) lines = [''];
        scroll.x = 0; scroll.y = 0;
        cursor.line = 0; cursor.col = 0;
        selection.active = false;
        
        const snapAfter = _getDocumentSnapshot();
        _pushSnapshotEntry(snapBefore, snapAfter, 'replace-all');
        
        _updateMetrics();
        needsRender = true;
        
        _hideModal();
        showToast(`Replaced all content (${lines.length} lines)`, container);
        if (instanceOnChange) instanceOnChange.call(container, { target: container });
    }
    
    function _hideModal() {
        modalOverlay.classList.remove('visible');
        pendingClipboardText = '';
    }

    // --- Keyboard Handling ---
    function _handleKey(e) {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'v') { e.preventDefault(); _handlePaste(); return; }
            if (e.key === 'c') { e.preventDefault(); _handleCopy(); return; }
            if (e.key === 'x') { e.preventDefault(); _handleCut(); return; }
            if (e.key === 'a') {
                e.preventDefault();
                selection.active = true;
                selection.anchor = { line: 0, col: 0 };
                selection.focus = { line: lines.length - 1, col: (lines[lines.length-1]||'').length };
                needsRender = true;
                return;
            }
            if (!e.shiftKey && e.key === 'z') {
                e.preventDefault();
                _undo();
                return;
            }
            if ((e.shiftKey && e.key === 'z') || e.key === 'y') {
                e.preventDefault();
                _redo();
                return;
            }
        }
        if (isLoading) return;
        
        const line = lines[cursor.line] || '';
        
        switch (e.key) {
            case 'ArrowUp':
                if (cursor.line > 0) { 
                    cursor.line--; 
                    cursor.col = Math.min(cursor.col, (lines[cursor.line]||'').length); 
                    _forceCursorPositionVisible(cursor.line, cursor.col);
                    needsRender = true; 
                }
                e.preventDefault(); 
                break;
            case 'ArrowDown':
                if (cursor.line < lines.length - 1) { 
                    cursor.line++; 
                    cursor.col = Math.min(cursor.col, (lines[cursor.line]||'').length); 
                    _forceCursorPositionVisible(cursor.line, cursor.col);
                    needsRender = true; 
                }
                e.preventDefault(); 
                break;
            case 'ArrowLeft':
                if (cursor.col > 0) {
                    cursor.col--;
                } else if (cursor.line > 0) { 
                    cursor.line--; 
                    cursor.col = (lines[cursor.line]||'').length; 
                    _forceCursorPositionVisible(cursor.line, cursor.col);
                }
                needsRender = true; 
                e.preventDefault(); 
                break;
            case 'ArrowRight':
                if (cursor.col < line.length) {
                    cursor.col++;
                } else if (cursor.line < lines.length - 1) { 
                    cursor.line++; 
                    cursor.col = 0; 
                    _forceCursorPositionVisible(cursor.line, cursor.col);
                }
                needsRender = true; 
                e.preventDefault(); 
                break;
            case 'Enter':
                if (selection.active && _deleteCurrentSelection()) { 
                    needsRender = true; 
                    e.preventDefault(); 
                    return; 
                }
                const snapBeforeEnter = _getDocumentSnapshot();
                lines[cursor.line] = line.slice(0, cursor.col);
                lines.splice(cursor.line+1, 0, line.slice(cursor.col));
                cursor.line++; 
                cursor.col = 0;
                const snapAfterEnter = _getDocumentSnapshot();
                _pushSnapshotEntry(snapBeforeEnter, snapAfterEnter, 'enter-key');
                _updateMetrics(); 
                _forceCursorPositionVisible(cursor.line, cursor.col);
                needsRender = true;
                e.preventDefault(); 
                break;
            case 'Backspace':
                if (selection.active && _deleteCurrentSelection()) { 
                    needsRender = true; 
                    e.preventDefault(); 
                    return; 
                }
                if (cursor.col > 0) {
                    const snapBefore = _getDocumentSnapshot();
                    lines[cursor.line] = line.slice(0, cursor.col-1) + line.slice(cursor.col);
                    cursor.col--;
                    const snapAfter = _getDocumentSnapshot();
                    _pushSnapshotEntry(snapBefore, snapAfter, 'backspace-char');
                } else if (cursor.line > 0) {
                    const snapBefore = _getDocumentSnapshot();
                    const prevLineLen = (lines[cursor.line - 1] || '').length;
                    const currentLineText = lines[cursor.line] || '';
                    lines[cursor.line - 1] = lines[cursor.line - 1] + currentLineText;
                    lines.splice(cursor.line, 1);
                    cursor.line = cursor.line - 1;
                    cursor.col = prevLineLen;
                    const snapAfter = _getDocumentSnapshot();
                    _pushSnapshotEntry(snapBefore, snapAfter, 'backspace-join');
                    _updateMetrics();
                }
                needsRender = true;
                e.preventDefault(); 
                break;
            case 'Delete':
                if (selection.active && _deleteCurrentSelection()) { 
                    needsRender = true; 
                    e.preventDefault(); 
                    return; 
                }
                if (cursor.col < line.length) {
                    const snapBefore = _getDocumentSnapshot();
                    lines[cursor.line] = line.slice(0, cursor.col) + line.slice(cursor.col + 1);
                    const snapAfter = _getDocumentSnapshot();
                    _pushSnapshotEntry(snapBefore, snapAfter, 'delete-char');
                } else if (cursor.line < lines.length - 1) {
                    const snapBefore = _getDocumentSnapshot();
                    const nextLine = lines[cursor.line + 1] || '';
                    lines[cursor.line] += nextLine;
                    lines.splice(cursor.line + 1, 1);
                    const snapAfter = _getDocumentSnapshot();
                    _pushSnapshotEntry(snapBefore, snapAfter, 'delete-join');
                    _updateMetrics();
                }
                _forceCursorPositionVisible(cursor.line, cursor.col);
                needsRender = true;
                e.preventDefault(); 
                break;
            case 'Tab':
                e.preventDefault(); 
                const snapBeforeTab = _getDocumentSnapshot();
                _insertTextAtCursor('  ', false);
                const snapAfterTab = _getDocumentSnapshot();
                _pushSnapshotEntry(snapBeforeTab, snapAfterTab, 'tab');
                break;
            case 'Escape':
                if (selection.active) { 
                    _clearSelection();
                    e.preventDefault(); 
                }
                break;
        }
    }

    // --- Event Setup ---
    function _setupEvents() {
        canvas.addEventListener('selectstart', (e) => {
            if (zoom.active || selection.active || touch.touchedHandle) {
                e.preventDefault();
                return false;
            }
        });
        
        container.addEventListener('selectstart', (e) => {
            if (!e.target.classList.contains('opt-text-hidden-input')) {
                e.preventDefault();
                return false;
            }
        });
        
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
        
        canvas.addEventListener('touchstart', _onPointerDown, { passive: true });
        canvas.addEventListener('mousedown', _onPointerDown);
        canvas.addEventListener('touchmove', _onPointerMove, { passive: false });
        canvas.addEventListener('mousemove', _onPointerMove);
        canvas.addEventListener('touchend', _onPointerUp, { passive: true });
        canvas.addEventListener('mouseup', _onPointerUp);
        canvas.addEventListener('touchcancel', _onPointerCancel, { passive: true });
        canvas.addEventListener('mouseleave', _onPointerLeave);
        
        let dragging = null, startScrollY = 0, startScrollX = 0, startTouchY = 0, startTouchX = 0;
        const onScrollStart = (isV, e) => {
            e.preventDefault?.(); e.stopPropagation();
            _stopMomentum(); _cancelZoomTimer(); touch.touchedHandle = null;
            if (zoom.active) _deactivateZoom(false);
            dragging = isV ? 'v' : 'h';
            const pt = _getEventPoint(e);
            if (isV) { startTouchY = pt.y; startScrollY = scroll.y; }
            else { startTouchX = pt.x; startScrollX = scroll.x; }
            _showScrollbars();
        };
        const onScrollMove = (e) => {
            if (!dragging) return;
            const pt = _getEventPoint(e);
            if (dragging === 'v') {
                const delta = pt.y - startTouchY;
                const thumbH = parseFloat(vThumb.style.height) || 30;
                const range = Math.max(1, metrics.fullViewportHeight - thumbH);
                scroll.y = _clamp(startScrollY + (delta/range)*metrics.maxScrollY, 0, metrics.maxScrollY);
            } else {
                const delta = pt.x - startTouchX;
                const thumbW = parseFloat(hThumb.style.width) || 30;
                const range = Math.max(1, metrics.viewportWidth - thumbW);
                scroll.x = _clamp(startScrollX + (delta/range)*metrics.maxScrollX, 0, metrics.maxScrollX);
            }
            needsRender = true; _showScrollbars();
        };
        const onScrollEnd = () => { dragging = null; };
        
        vScroll.addEventListener('touchstart', (e)=>onScrollStart(true,e), {passive:false});
        vScroll.addEventListener('mousedown', (e)=>onScrollStart(true,e));
        hScroll.addEventListener('touchstart', (e)=>onScrollStart(false,e), {passive:false});
        hScroll.addEventListener('mousedown', (e)=>onScrollStart(false,e));
        window.addEventListener('touchmove', onScrollMove, {passive:false});
        window.addEventListener('mousemove', onScrollMove);
        window.addEventListener('touchend', onScrollEnd);
        window.addEventListener('mouseup', onScrollEnd);
        
        hiddenInput.addEventListener('input', (e) => {
            if (isLoading || !e.data) { hiddenInput.value = ''; return; }
            
            const snapBefore = _getDocumentSnapshot();
            _insertTextAtCursor(e.data, false);
            const snapAfter = _getDocumentSnapshot();
            
            _pushSnapshotEntry(snapBefore, snapAfter, 'typing');
            
            hiddenInput.value = '';
            if (instanceOnInput) instanceOnInput.call(container, { target: container });
        });
        hiddenInput.addEventListener('keydown', _handleKey);
        
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
                const active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable) && active !== hiddenInput) {
                    return;
                }
                e.preventDefault();
                _undo();
            }
            if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === 'Z') || e.key === 'y' || e.key === 'Y')) {
                const active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable) && active !== hiddenInput) {
                    return;
                }
                e.preventDefault();
                _redo();
            }
        }, { capture: true });
        
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = dropdown.classList.toggle('open');
            menuBtn.setAttribute('aria-expanded', open);
            dropdown.setAttribute('aria-hidden', !open);
        });
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !menuBtn.contains(e.target)) {
                dropdown.classList.remove('open');
                menuBtn.setAttribute('aria-expanded', 'false');
                dropdown.setAttribute('aria-hidden', 'true');
            }
        });
        dropdown.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action]');
            if (!item) return;
            dropdown.classList.remove('open');
            switch (item.dataset.action) {
                case 'start-select':
                    selection.active = true;
                    selection.anchor = {...cursor}; selection.focus = {...cursor};
                    if (!isEditing) _enterEdit();
                    needsRender = true;
                    break;
                case 'clear-selection': 
                    _clearSelection();
                    break;
                case 'cut': _handleCut(); break;
                case 'copy': _handleCopy(); break;
                case 'paste': _handlePaste(); break;
                case 'copy-all': _handleCopyAll(); break;
                case 'replace-all': _handleReplaceAll(); break;
            }
        });
        
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'undo') { _undo(); }
            if (btn.dataset.action === 'redo') { _redo(); }
        });
        
        modalOverlay.querySelector('[data-action="cancel"]').addEventListener('click', _hideModal);
        modalOverlay.querySelector('[data-action="confirm"]').addEventListener('click', _confirmReplaceAll);
        modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) _hideModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalOverlay.classList.contains('visible')) _hideModal();
        });
        
        window.addEventListener('resize', () => { _setupCanvas(); _updateMetrics(); needsRender = true; });
        
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                const vh = window.visualViewport.height;
                const fullH = window.innerHeight;
                if (fullH - vh > 100) {
                    metrics.keyboardHeight = fullH - vh;
                    metrics.viewportHeight = vh - 28;
                } else {
                    metrics.keyboardHeight = 0;
                    metrics.viewportHeight = metrics.fullViewportHeight;
                }
                _updateMetrics();
                if (isEditing) _forceCursorPositionVisible(cursor.line, cursor.col);
                needsRender = true;
            });
        }
    }

    function _onPointerUp(e) {
        if (isLoading) return;
        const point = _getEventPoint(e);
        _cancelZoomTimer();
        
        if (zoom.active) { _deactivateZoom(true); return; }
        
        let shouldPrevent = false;
        let needsFocus = false;
        
        if (touch.touchedHandle) {
            _stopMomentum();
            needsFocus = _placeCursorOrHandle(point.x, point.y, 'handle', touch.touchedHandle);
            shouldPrevent = true;
            touch.touchedHandle = null;
            touch.didScroll = false;
        }
        else if (selection.active && selectedHandle && !touch.didScroll) {
            const time = Date.now() - touch.startTime;
            const totalDy = touch.lastY - touch.startY;
            const totalDx = touch.lastX - touch.startX;
            const distance = Math.sqrt(totalDy ** 2 + totalDx ** 2);
            
            if (distance < CONFIG.tapThreshold && time < CONFIG.tapMaxTime) {
                needsFocus = _placeCursorOrHandle(point.x, point.y, 'handle', selectedHandle);
                shouldPrevent = true;
            }
        }
        else {
            const time = Date.now() - touch.startTime;
            const totalDy = touch.lastY - touch.startY;
            const totalDx = touch.lastX - touch.startX;
            const distance = Math.sqrt(totalDy ** 2 + totalDx ** 2);
            
            if (!touch.isScrolling && !touch.didScroll && distance < CONFIG.tapThreshold && time < CONFIG.tapMaxTime) {
                needsFocus = _placeCursorOrHandle(point.x, point.y, 'cursor');
            }
        }
        
        if (needsFocus) {
            _enterEdit();
        }
        
        if (shouldPrevent && _shouldPreventDefault(e, false)) {
            e.preventDefault();
        }
        
        if (touch.isScrolling) {
            touch.velocityY *= CONFIG.velocityMultiplier;
            touch.velocityX *= CONFIG.velocityMultiplier;
            const speed = Math.sqrt(touch.velocityY ** 2 + touch.velocityX ** 2);
            if (speed > CONFIG.momentumMinSpeed) _startMomentum();
        }
        touch.isScrolling = false;
    }

    function _onPointerCancel(e) {
        _cancelZoomTimer();
        if (zoom.active) _deactivateZoom(false);
        _stopMomentum();
        touch.isScrolling = false;
        touch.touchedHandle = null;
        touch.didScroll = false;
    }

    function _onPointerLeave(e) {
        _cancelZoomTimer();
        if (zoom.active) _deactivateZoom(false);
        touch.touchedHandle = null;
        touch.didScroll = false;
    }

    function _onContextMenu(e) {
        if (zoom.active) { e.preventDefault(); _deactivateZoom(false); }
    }

    function _getHandleAtPosition(clientX, clientY) {
        if (!selection.active) return null;
        const rect = canvas.getBoundingClientRect();
        const viewportX = clientX - rect.left;
        const viewportY = clientY - rect.top;
        const scale = zoom.active ? CONFIG.zoomLevel : 1;
        const hitRadius = 30 * scale;
        const check = (line, col) => {
            const text = lines[line] || '';
            const clampedCol = Math.min(col, text.length);
            const cursorX = CONFIG.lineNumWidth + 8 - scroll.x + (clampedCol * metrics.charWidth);
            const cursorY = (line * CONFIG.lineHeight) - scroll.y;
            const dy = viewportY - (cursorY + CONFIG.lineHeight / 2);
            const dx = viewportX - cursorX;
            return Math.sqrt(dx * dx + dy * dy) <= hitRadius;
        };
        if (check(selection.anchor.line, selection.anchor.col)) return 'anchor';
        if (check(selection.focus.line, selection.focus.col)) return 'focus';
        return null;
    }

    // --- Initialization ---
    function _init() {
        function waitForSize() {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const ok = _setupCanvas();
                if (!ok) { requestAnimationFrame(waitForSize); return; }
                _updateMetrics();
                _setupEvents();
                if (lines.length === 0) lines = [''];
                needsRender = true;
                loadingEl.classList.add('hidden');
                console.log(`[optText] Ready | Canvas: ${canvas.width}x${canvas.height}`);
                
                setInterval(() => {
                    if (!isLoading && !zoom.active) {
                        cursor.visible = !cursor.visible;
                        needsRender = true;
                    }
                }, 500);
                
                _updateUndoRedoButtons();
                
                requestAnimationFrame(_renderLoop);
            } else {
                requestAnimationFrame(waitForSize);
            }
        }
        setTimeout(() => requestAnimationFrame(waitForSize), 50);
    }
    
    _init();
    return container;
}

export function createOptText() {
    const wrapper = document.createElement('div');
    wrapper.className = 'opt-text-dialog-wrapper';
    wrapper.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:80%;height:80%;max-width:600px;max-height:800px;z-index:99999999999;';
    const instance = setupOptTextInstance();
    wrapper.appendChild(instance);
    return wrapper;
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('opttext').forEach(el => {
            const parent = el.parentNode;
            if (parent) {
                const instance = setupOptTextInstance(el);
                parent.replaceChild(instance, el);
            }
        });
    });
}