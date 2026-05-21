// ./system/ux/optText.js
import {
  injectStyles, showToast, getDialogOverlay, getGotoLineModal, createOptTextDOM,
  LINE_HEIGHT, LINE_NUM_WIDTH, BOTTOM_PADDING, FONT_SIZE, FONT_FAMILY
} from './optTextUI.js';
import { TextDataManager, TextContext } from './optTextData.js';
import { additionManager } from './optTextAdditions.js';
import './optTextAdditionsRegistry.js';

const CONFIG = {
  fontSize: FONT_SIZE, fontFamily: FONT_FAMILY, lineHeight: LINE_HEIGHT,
  lineNumWidth: LINE_NUM_WIDTH, bottomPadding: BOTTOM_PADDING, charWidth: 9,
  momentumFriction: 0.985, momentumMinSpeed: 0.1, velocityMultiplier: 1.0,
  tapThreshold: 8, tapMaxTime: 200, scrollbarFadeDelay: 1000,
  keyboardScrollRatio: 0.40, cursorHorizontalPadding: 20, longPressDelay: 400,
  longPressMoveThreshold: 15, zoomMoveThreshold: 5, zoomLevel: 2.5,
  zoomFadeDelay: 250, scrollThreshold: 20,
  anchorColor: '#1a73e8', anchorSelectedColor: '#0d47a1',
  focusColor: '#f57c00', focusSelectedColor: '#e65100', debugHistory: false
};
const HISTORY_CONFIG = { maxEntries: 100, disableCoalesce: false };

export function setupOptTextInstance(originalElement = null, initialData = null) {
  injectStyles();
  let dataManager = null;
  if (initialData?.dataManager) dataManager = initialData.dataManager;
  else if (initialData?.contexts) dataManager = new TextDataManager(initialData.contexts);
  if (!dataManager) dataManager = new TextDataManager([{ name: 'default', lines: [''] }]);
  
  let lines = dataManager.current ? dataManager.current.lines : (dataManager.addContext('default'), dataManager.current.lines);
  let scroll = { y: 0, x: 0 };
  let cursor = { line: 0, col: 0, visible: true };
  let selection = { active: false, anchor: { line: 0, col: 0 }, focus: { line: 0, col: 0 } };
  let selectedHandle = null;
  let isEditing = false;
  let isLoading = false;
  let insertionPoint = { type: 'cursor', ref: cursor };
  let metrics = { charWidth: 9, viewportWidth: 0, viewportHeight: 0, visibleLineCount: 0, maxScrollY: 0, maxScrollX: 0, contentWidth: 0, dpr: window.devicePixelRatio || 1, fullViewportHeight: 0, keyboardHeight: 0, totalContentHeight: 0, _fontCached: null };
  let touch = { lastY: 0, lastX: 0, lastTime: 0, velocityY: 0, velocityX: 0, isScrolling: false, startTime: 0, startY: 0, startX: 0, momentumId: null, lastMomentumTime: 0, touchedHandle: null, didScroll: false, scrollYAtGrab: 0, scrollXAtGrab: 0 };
  let zoom = { active: false, timer: null, viewportX: 0, viewportY: 0, fadeTimer: null, dragStart: { x: 0, y: 0 } };
  let history = { undoStack: [], redoStack: [], lastOpTime: 0, suppressNext: false };
  let pendingClipboardText = '';
  let needsRender = true;
  let lastRenderTime = 0;
  
  let container, canvas, ctx, toolbar, dropdown, hiddenInput, cursorPreview, loadingEl;
  let vScroll, vThumb, hScroll, hThumb, menuBtn, modalOverlay;
  let gotoModal, gotoInput, gotoMaxLabel;
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
  gotoModal = getGotoLineModal(container);
  gotoInput = gotoModal.querySelector('.opt-text-goto-input');
  gotoMaxLabel = gotoModal.querySelector('[data-ref="max"]');
  
  container.cursor = cursor;
  container.selection = selection;
  container._internalUndo = _undo;
  container._internalRedo = _redo;
  
  container.addEventListener('optText:cursor:set', (e) => {
    const { line, col } = e.detail;
    if (line >= 0 && line < lines.length) {
      cursor.line = line; cursor.col = Math.min(col, (lines[line] || '').length);
      _adjustScrollForCursor(cursor.line, cursor.col); needsRender = true;
    }
  });
  container.addEventListener('optText:selection:set', (e) => {
    const { anchor, focus } = e.detail;
    selection.active = true; selection.anchor = { ...anchor }; selection.focus = { ...focus };
    insertionPoint = { type: 'focus', ref: selection.focus }; needsRender = true;
  });
  container.addEventListener('optText:scroll:to', (e) => {
    const { line, col } = e.detail;
    if (line >= 0 && line < lines.length) {
      _adjustScrollForCursor(line, Math.min(col, (lines[line] || '').length));
      needsRender = true;
    }
  });
  container.addEventListener('optText:change', () => { needsRender = true; });
  
  container._pushAdditionHistory = (snapBefore, reason) => {
    if (history.suppressNext) return;
    const snapAfter = _getDocumentSnapshot();
    if (snapBefore.lines.join('\n') === snapAfter.lines.join('\n')) return;
    history.undoStack.push(_createBulkEntry(snapBefore, snapAfter, reason));
    history.redoStack = [];
    if (history.undoStack.length > HISTORY_CONFIG.maxEntries) history.undoStack.shift();
    _updateUndoRedoButtons();
  };
  
  if (typeof additionManager !== 'undefined' && typeof additionManager.injectDropdownItems === 'function') {
    additionManager.injectDropdownItems(container, dataManager);
  }
  if (typeof additionManager !== 'undefined' && typeof additionManager.injectToolbarButtons === 'function') {
    additionManager.injectToolbarButtons(container, dataManager);
  }
  
  Object.defineProperty(container, 'value', {
    get() { return lines.join('\n'); },
    set(newValue) {
      if (typeof newValue === 'string') {
        const snapshotBefore = _getDocumentSnapshot();
        lines.length = 0; lines.push(...newValue.split('\n'));
        if (lines.length === 0) lines.push('');
        _updateMetrics(); needsRender = true;
        const snapshotAfter = _getDocumentSnapshot();
        history.undoStack.push(_createBulkEntry(snapshotBefore, snapshotAfter, 'value-set'));
        history.redoStack = []; _updateUndoRedoButtons();
        if (dataManager?.current) dataManager.current.markModified();
        if (instanceOnChange) instanceOnChange.call(container, { target: container });
      }
    }, configurable: true
  });
  Object.defineProperty(container, 'onchange', { get() { return instanceOnChange; }, set(fn) { instanceOnChange = typeof fn === 'function' ? fn : null; }, configurable: true });
  Object.defineProperty(container, 'oninput', { get() { return instanceOnInput; }, set(fn) { instanceOnInput = typeof fn === 'function' ? fn : null; }, configurable: true });
  
  container.dataManager = dataManager;
  container.switchContext = (identifier) => {
    if (!dataManager) return false;
    if (dataManager.setCurrent(identifier)) {
      lines = dataManager.current.lines; if (lines.length === 0) lines.push('');
      scroll.x = 0; scroll.y = 0; cursor.line = 0; cursor.col = 0; selection.active = false;
      _updateMetrics(); needsRender = true; _updateUndoRedoButtons();
      if (instanceOnChange) instanceOnChange.call(container, { target: container, type: 'context-switch' });
      return true;
    } return false;
  };
  container.addContext = (name, initialLines, options) => { if (!dataManager) return null; return dataManager.addContext(name, initialLines, options); };
  container.listContexts = () => dataManager?.listContexts() || [];
  container.toJSON = () => dataManager?.toJSON() || null;
  
  // ✅ NUTS & BOLTS: Custom Property System & Context Management
  container.values = {};
  
  const PROTECTED_OPT_PROPS = new Set([
    'value', 'onchange', 'oninput', 'cursor', 'selection', 'dataManager',
    'switchContext', 'addContext', 'removeContext', 'listContexts', 'toJSON',
    '_internalUndo', '_internalRedo', '_pushAdditionHistory', 'contextId', 'values'
  ]);

  container.defineProperty = function(name, descriptor) {
    if (PROTECTED_OPT_PROPS.has(name)) {
      throw new Error(`[optText] Cannot define protected property: '${name}'`);
    }
    if (typeof descriptor === 'object' && descriptor !== null && ('get' in descriptor || 'set' in descriptor || 'value' in descriptor)) {
      Object.defineProperty(this, name, descriptor);
    } else {
      this[name] = descriptor;
    }
    return this;
  };

  container.removeContext = (identifier) => {
    if (!dataManager) return false;
    const removed = dataManager.removeContext(identifier);
    if (removed) {
      lines = dataManager.current.lines;
      if (lines.length === 0) lines.push('');
      scroll.x = 0; scroll.y = 0; cursor.line = 0; cursor.col = 0; selection.active = false;
      _updateMetrics(); needsRender = true; _updateUndoRedoButtons();
      container.dispatchEvent(new CustomEvent('optText:change', { detail: { type: 'context-removed' } }));
    }
    return removed;
  };

  Object.defineProperty(container, 'contextId', {
    get() { return dataManager?.current?.id ?? null; },
    set(newId) {
      if (!dataManager || !newId) return;
      const exists = dataManager.contexts.some(c => c.id === newId || c.name === newId);
      if (!exists) {
        dataManager.addContext(newId, [''], { switchTo: true });
      } else {
        dataManager.setCurrent(newId);
      }
      lines = dataManager.current.lines;
      if (lines.length === 0) lines.push('');
      scroll.x = 0; scroll.y = 0; cursor.line = 0; cursor.col = 0; selection.active = false;
      _updateMetrics(); needsRender = true; _updateUndoRedoButtons();
      container.dispatchEvent(new CustomEvent('optText:change', { detail: { type: 'context-switched', id: newId } }));
    },
    configurable: true
  });
  // ✅ END NUTS & BOLTS

  function _updateMetrics() {
    const rect = container.getBoundingClientRect();
    metrics.dpr = window.devicePixelRatio || 1; metrics.viewportWidth = rect.width; metrics.viewportHeight = Math.max(0, rect.height - 28);
    metrics.fullViewportHeight = metrics.viewportHeight; metrics.visibleLineCount = Math.ceil(metrics.viewportHeight / CONFIG.lineHeight) + 2;
    metrics.totalContentHeight = (lines.length * CONFIG.lineHeight) + CONFIG.bottomPadding;
    metrics.maxScrollY = Math.max(0, metrics.totalContentHeight - metrics.fullViewportHeight);
    metrics.contentWidth = _estimateContentWidth(); metrics.maxScrollX = Math.max(0, metrics.contentWidth - metrics.viewportWidth);
    if (ctx) {
      const fontKey = `${CONFIG.fontSize}px ${CONFIG.fontFamily}`;
      if (!metrics._fontCached || metrics._fontCached !== fontKey) {
        ctx.font = fontKey; metrics.charWidth = ctx.measureText('M').width || 9; metrics._fontCached = fontKey;
      }
    }
  }
  function _estimateContentWidth() {
    let maxLen = 0; const start = Math.max(0, Math.floor(scroll.y / CONFIG.lineHeight) - 50);
    const end = Math.min(lines.length, start + 200);
    for (let i = start; i < end; i++) if (lines[i]?.length > maxLen) maxLen = lines[i].length;
    if (lines[cursor.line]?.length > maxLen) maxLen = lines[cursor.line].length;
    return maxLen * metrics.charWidth + CONFIG.lineNumWidth + 40;
  }
  function _setupCanvas() {
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    metrics.dpr = window.devicePixelRatio || 1; canvas.width = Math.round(rect.width * metrics.dpr);
    canvas.height = Math.round(Math.max(0, rect.height - 28) * metrics.dpr);
    canvas.style.width = rect.width + 'px'; canvas.style.height = Math.max(0, rect.height - 28) + 'px';
    if (ctx) {
      const fontKey = `${CONFIG.fontSize}px ${CONFIG.fontFamily}`;
      if (!metrics._fontCached || metrics._fontCached !== fontKey) { ctx.font = fontKey; metrics.charWidth = ctx.measureText('M').width || 9; metrics._fontCached = fontKey; }
    } return true;
  }
  function _renderLoop(ts) { if (needsRender) { _render(ts); needsRender = false; lastRenderTime = ts; } requestAnimationFrame(_renderLoop); }
  function _render(timestamp) {
    if (!ctx || isLoading || metrics.viewportWidth <= 0 || metrics.viewportHeight <= 0) return;
    const scale = zoom.active ? CONFIG.zoomLevel : 1;
    const offsetX = zoom.active ? zoom.viewportX * (1 - scale) : 0;
    const offsetY = zoom.active ? zoom.viewportY * (1 - scale) : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.setTransform(metrics.dpr * scale, 0, 0, metrics.dpr * scale, offsetX * metrics.dpr, offsetY * metrics.dpr);
    ctx.fillStyle = getComputedStyle(container).getPropertyValue('--ot-bg-canvas') || '#ffffff';
    ctx.fillRect(0, 0, metrics.viewportWidth, metrics.viewportHeight);
    if (!metrics.charWidth || metrics.charWidth <= 0) { ctx.font = `${CONFIG.fontSize}px ${CONFIG.fontFamily}`; metrics.charWidth = ctx.measureText('M').width || 9; metrics._fontCached = `${CONFIG.fontSize}px ${CONFIG.fontFamily}`; }
    const effectiveViewportHeight = metrics.viewportHeight / scale;
    let startLine = Math.max(0, Math.floor(scroll.y / CONFIG.lineHeight));
    let endLine = Math.min(lines.length, startLine + Math.ceil(effectiveViewportHeight / CONFIG.lineHeight) + 2);
    if (zoom.active) { startLine = Math.min(startLine, cursor.line); endLine = Math.max(endLine, cursor.line + 1); }
    ctx.font = `${CONFIG.fontSize}px ${CONFIG.fontFamily}`; ctx.textBaseline = 'top';
    for (let i = startLine; i < endLine; i++) {
      const y = (i * CONFIG.lineHeight) - scroll.y; const activeLine = insertionPoint.ref?.line ?? cursor.line;
      if (i === activeLine) { ctx.fillStyle = '#fff9c4'; if (zoom.active) { const hX = -offsetX / scale; const hW = metrics.viewportWidth / scale; ctx.fillRect(hX, y, hW, CONFIG.lineHeight); } else { ctx.fillRect(0, y, metrics.viewportWidth, CONFIG.lineHeight); } }
      ctx.fillStyle = '#f8f8f8'; ctx.fillRect(0, y, CONFIG.lineNumWidth, CONFIG.lineHeight);
      ctx.strokeStyle = '#e0e0e0'; ctx.beginPath(); ctx.moveTo(CONFIG.lineNumWidth - 0.5, y); ctx.lineTo(CONFIG.lineNumWidth - 0.5, y + CONFIG.lineHeight); ctx.stroke();
      ctx.fillStyle = '#666'; ctx.textAlign = 'right'; ctx.fillText(String(i + 1).padStart(7, ' '), CONFIG.lineNumWidth - 12, y); ctx.textAlign = 'left';
      ctx.save(); ctx.beginPath(); ctx.rect(CONFIG.lineNumWidth, -10000, metrics.viewportWidth, 20000); ctx.clip();
      ctx.fillStyle = '#000'; ctx.fillText(lines[i] || '', CONFIG.lineNumWidth + 8 - scroll.x, y); ctx.restore();
    }
    if (selection.active) {
      const range = _getSelectionRange();
      if (range) {
        ctx.fillStyle = 'rgba(26, 115, 232, 0.25)';
        for (let i = range.start.line; i <= range.end.line; i++) {
          const y = (i * CONFIG.lineHeight) - scroll.y; if (y + CONFIG.lineHeight < 0 || y > metrics.viewportHeight) continue;
          let sx, ex;
          if (i === range.start.line && i === range.end.line) { sx = CONFIG.lineNumWidth + 8 - scroll.x + (range.start.col * metrics.charWidth); ex = CONFIG.lineNumWidth + 8 - scroll.x + (range.end.col * metrics.charWidth); }
          else if (i === range.start.line) { sx = CONFIG.lineNumWidth + 8 - scroll.x + (range.start.col * metrics.charWidth); ex = metrics.viewportWidth + 100; }
          else if (i === range.end.line) { sx = CONFIG.lineNumWidth + 8 - scroll.x; ex = CONFIG.lineNumWidth + 8 - scroll.x + (range.end.col * metrics.charWidth); }
          else { sx = CONFIG.lineNumWidth + 8 - scroll.x; ex = metrics.viewportWidth + 100; }
          ctx.fillRect(sx, y, Math.max(0, ex - sx), CONFIG.lineHeight);
        }
      } _drawSelectionCursors(); _drawSelectionHandles();
    }
    const shouldDrawCursor = cursor.line >= startLine && cursor.line < endLine && cursor.line < lines.length;
    if (shouldDrawCursor && (zoom.active || cursor.visible) && !selection.active) {
      const text = lines[cursor.line] || ''; const col = Math.min(cursor.col, text.length);
      const cursorX = CONFIG.lineNumWidth + 8 - scroll.x + (col * metrics.charWidth);
      const cursorY = (cursor.line * CONFIG.lineHeight) - scroll.y;
      ctx.fillStyle = '#0066cc'; ctx.fillRect(cursorX, cursorY, 2 / scale, CONFIG.lineHeight);
    }
    _updateScrollbars(); _showScrollbars();
  }
  function _drawSelectionHandles() { if (!selection.active) return; const scale = zoom.active ? CONFIG.zoomLevel : 1; _drawHandle(selection.focus.line, selection.focus.col, selectedHandle === 'focus', scale, 'focus'); _drawHandle(selection.anchor.line, selection.anchor.col, selectedHandle === 'anchor', scale, 'anchor'); }
  function _drawHandle(line, col, isSelected, scale, handleType) {
    const text = lines[line] || ''; const clampedCol = Math.min(col, text.length);
    const cursorX = CONFIG.lineNumWidth + 8 - scroll.x + (clampedCol * metrics.charWidth);
    const cursorY = (line * CONFIG.lineHeight) - scroll.y;
    if (cursorY < -20 || cursorY > metrics.viewportHeight + 20) return;
    const radius = 10; const isAnchor = handleType === 'anchor';
    const cfg = isAnchor ? { base: CONFIG.anchorColor, sel: CONFIG.anchorSelectedColor, fill: 'rgba(26,115,232,0.15)', fillS: 'rgba(26,115,232,0.25)', ring: 'rgba(26,115,232,0.3)' } : { base: CONFIG.focusColor, sel: CONFIG.focusSelectedColor, fill: 'rgba(245,124,0,0.15)', fillS: 'rgba(245,124,0,0.25)', ring: 'rgba(245,124,0,0.3)' };
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
    ctx.beginPath(); ctx.arc(cursorX, cursorY + CONFIG.lineHeight / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? cfg.fillS : cfg.fill; ctx.fill();
    ctx.strokeStyle = isSelected ? cfg.sel : cfg.base; ctx.lineWidth = isSelected ? 2.5 : 2; ctx.stroke();
    if (isSelected) { ctx.beginPath(); ctx.arc(cursorX, cursorY + CONFIG.lineHeight / 2, radius + 6, 0, Math.PI * 2); ctx.strokeStyle = cfg.ring; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  }
  function _drawSelectionCursors() { if (!selection.active) return; const scale = zoom.active ? CONFIG.zoomLevel : 1; _drawCursorAt(selection.anchor.line, selection.anchor.col, CONFIG.anchorColor, scale); _drawCursorAt(selection.focus.line, selection.focus.col, CONFIG.focusColor, scale); }
  function _drawCursorAt(line, col, color, scale) {
    const text = lines[line] || ''; const clampedCol = Math.min(col, text.length);
    const cursorX = CONFIG.lineNumWidth + 8 - scroll.x + (clampedCol * metrics.charWidth);
    const cursorY = (line * CONFIG.lineHeight) - scroll.y;
    if (cursorY < -20 || cursorY > metrics.viewportHeight + 20) return;
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 4 * scale; ctx.fillStyle = color; ctx.fillRect(cursorX, cursorY, 2 / scale, CONFIG.lineHeight); ctx.restore();
  }
  function _updateScrollbars() {
    const vRatio = metrics.fullViewportHeight / metrics.totalContentHeight; const vH = Math.max(30, metrics.fullViewportHeight * vRatio);
    vThumb.style.height = vH + 'px'; vThumb.style.top = ((metrics.maxScrollY > 0 ? scroll.y / metrics.maxScrollY : 0) * (metrics.fullViewportHeight - vH)) + 'px';
    const hRatio = metrics.viewportWidth / metrics.contentWidth; const hW = Math.max(30, metrics.viewportWidth * hRatio);
    hThumb.style.width = hW + 'px'; hThumb.style.left = ((metrics.maxScrollX > 0 ? scroll.x / metrics.maxScrollX : 0) * (metrics.viewportWidth - hW)) + 'px';
  }
  function _showScrollbars() { if (isLoading) return; if (!scrollbarsVisible) { scrollbarsVisible = true; vScroll.classList.add('visible'); hScroll.classList.add('visible'); } clearTimeout(scrollbarTimeout); scrollbarTimeout = setTimeout(_hideScrollbars, CONFIG.scrollbarFadeDelay); }
  function _hideScrollbars() { scrollbarsVisible = false; vScroll.classList.remove('visible'); hScroll.classList.remove('visible'); }
  function _getSelectionRange() { if (!selection.active) return null; const [a, b] = [selection.anchor, selection.focus]; return (a.line > b.line || (a.line === b.line && a.col > b.col)) ? { start: b, end: a } : { start: a, end: b }; }
  function _getSelectedText() { const r = _getSelectionRange(); if (!r) return ''; if (r.start.line === r.end.line) return (lines[r.start.line] || '').slice(r.start.col, r.end.col); const p = [(lines[r.start.line] || '').slice(r.start.col)]; for (let i = r.start.line + 1; i < r.end.line; i++) p.push(lines[i] || ''); p.push((lines[r.end.line] || '').slice(0, r.end.col)); return p.join('\n'); }
  function _clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function _clearSelection() { if (selection.active) { selection.active = false; insertionPoint = { type: 'cursor', ref: cursor }; needsRender = true; } }
  function _getDocumentSnapshot() {
    return {
      lines: lines.map(l => String(l)),
      cursor: { line: cursor.line, col: cursor.col },
      selection: selection.active ? { active: true, anchor: { line: selection.anchor.line, col: selection.anchor.col }, focus: { line: selection.focus.line, col: selection.focus.col } } : { active: false, anchor: null, focus: null }
    };
  }
  function _applySnapshot(snapshot) {
    if (!snapshot) return;
    lines.length = 0; lines.push(...snapshot.lines.map(l => String(l)));
    if (lines.length === 0) lines.push('');
    cursor.line = _clamp(snapshot.cursor.line, 0, lines.length - 1);
    cursor.col = _clamp(snapshot.cursor.col, 0, (lines[cursor.line] || '').length);
    if (snapshot.selection.active) {
      selection.active = true;
      selection.anchor.line = _clamp(snapshot.selection.anchor.line, 0, lines.length - 1);
      selection.anchor.col = _clamp(snapshot.selection.anchor.col, 0, (lines[selection.anchor.line] || '').length);
      selection.focus.line = _clamp(snapshot.selection.focus.line, 0, lines.length - 1);
      selection.focus.col = _clamp(snapshot.selection.focus.col, 0, (lines[selection.focus.line] || '').length);
      insertionPoint.type = (snapshot.selection.anchor.line === snapshot.selection.focus.line && snapshot.selection.anchor.col === snapshot.selection.focus.col) ? 'cursor' : 'focus';
      insertionPoint.ref = insertionPoint.type === 'cursor' ? cursor : selection.focus;
    } else { selection.active = false; insertionPoint = { type: 'cursor', ref: cursor }; }
    _updateMetrics(); needsRender = true;
  }
  function _createBulkEntry(before, after, reason) { return { type: 'bulk', reason, before, after, timestamp: Date.now() }; }
  function _pushSnapshotEntry(before, after, reason = 'edit') {
    if (history.suppressNext) return;
    history.undoStack.push(_createBulkEntry(before, after, reason));
    history.redoStack = [];
    if (history.undoStack.length > HISTORY_CONFIG.maxEntries) history.undoStack.shift();
    _updateUndoRedoButtons(); _logHistory(reason);
  }
  function _undo() {
    if (history.undoStack.length === 0) return;
    history.suppressNext = true;
    const entry = history.undoStack.pop();
    const stateAfterEdit = _getDocumentSnapshot();
    if (entry.type === 'bulk') {
      _applySnapshot(entry.before);
      _logHistory('undo');
      history.redoStack.push(_createBulkEntry(stateAfterEdit, stateAfterEdit, entry.reason + '-undo'));
    } else { if (entry.cursorBefore) { cursor.line = entry.cursorBefore.line; cursor.col = entry.cursorBefore.col; } _logHistory('undo-fallback'); }
    needsRender = true; _forceCursorPositionVisible(cursor.line, cursor.col);
    history.suppressNext = false; _updateUndoRedoButtons();
    if (instanceOnChange) instanceOnChange.call(container, { target: container });
  }
  function _redo() {
    if (history.redoStack.length === 0) return;
    history.suppressNext = true;
    const entry = history.redoStack.pop();
    const stateBeforeRedo = _getDocumentSnapshot();
    if (entry.type === 'bulk') {
      _applySnapshot(entry.after);
      _logHistory('redo');
      history.undoStack.push(_createBulkEntry(stateBeforeRedo, stateBeforeRedo, entry.reason + '-redo'));
    }
    needsRender = true; _forceCursorPositionVisible(cursor.line, cursor.col);
    history.suppressNext = false; _updateUndoRedoButtons();
    if (instanceOnChange) instanceOnChange.call(container, { target: container });
  }
  function _updateUndoRedoButtons() { const u = container.querySelector('[data-action="undo"]'); const r = container.querySelector('[data-action="redo"]'); if (u) u.disabled = history.undoStack.length === 0; if (r) r.disabled = history.redoStack.length === 0; }
  function _logHistory(label) { if (!CONFIG.debugHistory) return; console.log(`[History ${label}]`, { undo: history.undoStack.length, redo: history.redoStack.length, cursor: { ...cursor }, sel: selection.active ? { a: { ...selection.anchor }, f: { ...selection.focus } } : null }); }
  function _goToLine(ln, col = 0) { if (isLoading) return false; const tL = _clamp(Math.floor(ln) - 1, 0, lines.length - 1); const tC = _clamp(Math.floor(col), 0, (lines[tL] || '').length); scroll.y = _clamp(tL * CONFIG.lineHeight, 0, metrics.maxScrollY); cursor.line = tL; cursor.col = tC; if (!selection.active) { insertionPoint.type = 'cursor'; insertionPoint.ref = cursor; } _forceCursorPositionVisible(tL, tC); needsRender = true; _showScrollbars(); if (!isEditing) _enterEdit(); return true; }
  function _showGotoModal() { if (gotoMaxLabel) gotoMaxLabel.textContent = lines.length; if (gotoInput) { gotoInput.value = cursor.line + 1; gotoInput.max = lines.length; } gotoModal.classList.add('visible'); setTimeout(() => { gotoInput?.focus(); gotoInput?.select(); }, 200); }
  function _hideGotoModal() { gotoModal.classList.remove('visible'); if (isEditing && hiddenInput) hiddenInput.focus(); }
  function _getEventPoint(e) { if (e.touches?.[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY }; if (e.changedTouches?.[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }; return { x: e.clientX, y: e.clientY }; }
  function _isTouchEvent(e) { return e.type.startsWith('touch'); }
  function _shouldPreventDefault(e, isScrolling) { return _isTouchEvent(e) && (isScrolling || zoom.active || touch.touchedHandle); }
  function _onPointerDown(e) { if (isLoading || (e.button !== undefined && e.button !== 0)) return; if (_isTouchEvent(e) && (selection.active || zoom.active || touch.touchedHandle)) e.preventDefault(); const pt = _getEventPoint(e); touch.startY = touch.lastY = pt.y; touch.startX = touch.lastX = pt.x; touch.startTime = touch.lastTime = Date.now(); touch.isScrolling = false; touch.touchedHandle = null; touch.didScroll = false; _stopMomentum(); if (selection.active && !zoom.active) { const h = _getHandleAtPosition(pt.x, pt.y); if (h) { if (_shouldPreventDefault(e, false)) e.preventDefault(); selectedHandle = h; touch.touchedHandle = h; touch.scrollYAtGrab = scroll.y; touch.scrollXAtGrab = scroll.x; needsRender = true; showToast(`Selected ${h === 'anchor' ? 'blue' : 'orange'} handle`, container); _cancelZoomTimer(); zoom.timer = setTimeout(() => _activateZoom(pt.x, pt.y), CONFIG.longPressDelay); return; } } _cancelZoomTimer(); zoom.timer = setTimeout(() => _activateZoom(pt.x, pt.y), CONFIG.longPressDelay); }
  function _onPointerMove(e) { if (isLoading) return; const pt = _getEventPoint(e); const now = Date.now(); const dy = pt.y - touch.lastY; const dx = pt.x - touch.lastX; const dt = now - touch.lastTime; const d = Math.sqrt((pt.y - touch.startY) ** 2 + (pt.x - touch.startX) ** 2); if (!zoom.active && d > CONFIG.longPressMoveThreshold) _cancelZoomTimer(); if (zoom.active) { if (_shouldPreventDefault(e, false)) e.preventDefault(); _updateCursorPreview(pt.x, pt.y); zoom.dragStart = { x: pt.x, y: pt.y }; return; } if (!touch.isScrolling && d > CONFIG.scrollThreshold) { touch.isScrolling = true; touch.didScroll = true; _cancelZoomTimer(); } if (touch.isScrolling) { if (_shouldPreventDefault(e, true)) e.preventDefault(); if (dt > 0) { touch.velocityY = (dy / dt) * 16.67; touch.velocityX = (dx / dt) * 16.67; } _scrollBy(dy, dx); touch.lastY = pt.y; touch.lastX = pt.x; touch.lastTime = now; } }
  function _placeCursorOrHandle(x, y, target = 'cursor', handleType = null) {
    if (isLoading) return false; if (selection.active && selectedHandle && target === 'cursor') return false;
    const rect = canvas.getBoundingClientRect(); const vx = x - rect.left; const vy = y - rect.top;
    let cx, cy; if (zoom.active) { const s = CONFIG.zoomLevel; const ox = zoom.viewportX * (1 - s); const oy = zoom.viewportY * (1 - s); cx = scroll.x + (vx - ox) / s; cy = scroll.y + (vy - oy) / s; } else { cx = scroll.x + vx; cy = scroll.y + vy; }
    const line = Math.floor(cy / CONFIG.lineHeight); const col = Math.floor((cx - CONFIG.lineNumWidth - 8) / metrics.charWidth);
    if (line < 0 || line >= lines.length) return false;
    const cl = _clamp(line, 0, lines.length - 1); const lt = lines[cl] || ''; const cc = Math.max(0, Math.min(col, lt.length));
    if (target === 'cursor') { cursor.line = cl; cursor.col = cc; if (selection.active && !selectedHandle) { selection.focus.line = cl; selection.focus.col = cc; } insertionPoint.type = 'cursor'; insertionPoint.ref = cursor; _adjustScrollForCursor(cl, cc); }
    else if (handleType && selection.active) { const tgt = handleType === 'anchor' ? selection.anchor : selection.focus; tgt.line = cl; tgt.col = cc; insertionPoint.type = handleType; insertionPoint.ref = tgt; }
    needsRender = true; return true;
  }
  function _adjustScrollForCursor(line, col) { if (!metrics.charWidth) metrics.charWidth = 9; const ly = line * CONFIG.lineHeight; const sy = ly - scroll.y; if (sy < 0) scroll.y = _clamp(ly, 0, metrics.maxScrollY); else if (sy > metrics.viewportHeight - CONFIG.lineHeight) scroll.y = _clamp(ly - metrics.viewportHeight + CONFIG.lineHeight, 0, metrics.maxScrollY); const cx = CONFIG.lineNumWidth + 8 + (col * metrics.charWidth); const sx = cx - scroll.x; const minV = CONFIG.lineNumWidth + CONFIG.cursorHorizontalPadding; const maxV = metrics.viewportWidth - CONFIG.cursorHorizontalPadding; if (sx < minV) scroll.x = _clamp(cx - minV, 0, metrics.maxScrollX); else if (sx > maxV) scroll.x = _clamp(cx - maxV, 0, metrics.maxScrollX); }
  function _placeCursor(x, y) { if (_placeCursorOrHandle(x, y, 'cursor')) _enterEdit(); }
  function _placeSelectedHandle(cx, cy, h) { _updateMetrics(); if (_placeCursorOrHandle(cx, cy, 'handle', h)) { _render(performance.now()); showToast(`✓ ${h === 'anchor' ? 'Blue' : 'Orange'} handle at line ${(selection[h]?.line || 0) + 1}`, container); _enterEdit(); } }
  function _forceCursorPositionVisible(line = cursor.line, col = cursor.col) { if (isLoading) return; _adjustScrollForCursor(line, col); needsRender = true; _showScrollbars(); }
  function _activateZoom(sx, sy) { if (isLoading || zoom.active) return; const r = canvas.getBoundingClientRect(); zoom.viewportX = sx - r.left; zoom.viewportY = sy - r.top; zoom.active = true; zoom.dragStart = { x: sx, y: sy }; canvas.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.5), 0 10px 30px rgba(0,0,0,0.2)'; _updateCursorPreview(sx, sy); needsRender = true; }
  function _deactivateZoom(place = true) { if (!zoom.active) return; zoom.active = false; canvas.style.boxShadow = 'none'; cursorPreview.classList.remove('visible'); clearTimeout(zoom.fadeTimer); zoom.fadeTimer = setTimeout(() => { canvas.style.transition = 'none'; }, CONFIG.zoomFadeDelay); if (place) _updateCursorFromPreview(); needsRender = true; }
  function _cancelZoomTimer() { if (zoom.timer) { clearTimeout(zoom.timer); zoom.timer = null; } }
  function _updateCursorPreview(sx, sy) { if (!zoom.active) { cursorPreview.classList.remove('visible'); return; } const r = canvas.getBoundingClientRect(); const s = CONFIG.zoomLevel; const vx = sx - r.left; const vy = sy - r.top; const ox = zoom.viewportX * (1 - s); const oy = zoom.viewportY * (1 - s); const cx = scroll.x + (vx - ox) / s; const cy = scroll.y + (vy - oy) / s; const l = Math.floor(cy / CONFIG.lineHeight); const c = Math.floor((cx - CONFIG.lineNumWidth - 8) / metrics.charWidth); if (l >= 0 && l < lines.length) { const cl = _clamp(l, 0, lines.length - 1); const lt = lines[cl] || ''; const cc = Math.max(0, Math.min(c, lt.length)); const csx = r.left + ox + ((CONFIG.lineNumWidth + 8 + cc * metrics.charWidth) - scroll.x) * s; const csy = r.top + oy + ((cl * CONFIG.lineHeight) - scroll.y) * s; cursorPreview.style.left = csx + 'px'; cursorPreview.style.top = csy + 'px'; cursorPreview.classList.add('visible'); cursor.line = cl; cursor.col = cc; cursor.visible = true; if (selection.active && selectedHandle) { const t = selectedHandle === 'anchor' ? selection.anchor : selection.focus; t.line = cl; t.col = cc; } needsRender = true; } }
  function _updateCursorFromPreview() { if (!isEditing) _enterEdit(); }
  function _scrollBy(dy, dx) { if (isLoading) return; scroll.y = _clamp(scroll.y - dy, 0, metrics.maxScrollY); scroll.x = _clamp(scroll.x - dx, 0, metrics.maxScrollX); needsRender = true; _showScrollbars(); }
  function _startMomentum() { if (touch.momentumId) cancelAnimationFrame(touch.momentumId); touch.lastMomentumTime = performance.now(); function animate(t) { const dt = (t - touch.lastMomentumTime) / 16.67; touch.lastMomentumTime = t; _scrollBy(touch.velocityY * dt, touch.velocityX * dt); touch.velocityY *= CONFIG.momentumFriction; touch.velocityX *= CONFIG.momentumFriction; if (Math.sqrt(touch.velocityY ** 2 + touch.velocityX ** 2) > CONFIG.momentumMinSpeed) touch.momentumId = requestAnimationFrame(animate); else { touch.momentumId = null; touch.velocityY = 0; touch.velocityX = 0; _hideScrollbars(); } } touch.momentumId = requestAnimationFrame(animate); }
  function _stopMomentum() { if (touch.momentumId) { cancelAnimationFrame(touch.momentumId); touch.momentumId = null; } touch.velocityY = 0; touch.velocityX = 0; }
  function _enterEdit() { isEditing = true; hiddenInput.value = ''; hiddenInput.focus(); hiddenInput.setSelectionRange(0, 0); }
  function _insertTextAtCursor(text, recordHistory = true) {
    let sb = null; if (recordHistory && !history.suppressNext) sb = _getDocumentSnapshot();
    if (!selection.active && insertionPoint.type !== 'cursor') insertionPoint = { type: 'cursor', ref: cursor };
    if (selection.active) { const r = _getSelectionRange(); if (r) { _replaceSelectionWithText(text, r); _clearSelection(); if (recordHistory && !history.suppressNext && sb) _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'insert-replace'); return; } }
    const ip = insertionPoint.ref; if (!ip || ip.line < 0 || ip.line >= lines.length) return;
    const cur = lines[ip.line] || ''; const before = cur.slice(0, ip.col); const after = cur.slice(ip.col);
    let nl = ip.line, nc = ip.col;
    if (text.includes('\n')) { const p = text.split('\n'); lines[ip.line] = before + p[0]; if (p.length > 1) { const ins = p.slice(1); ins[ins.length - 1] += after; lines.splice(ip.line + 1, 0, ...ins); nl = ip.line + p.length - 1; } nc = p[p.length - 1].length; }
    else { lines[ip.line] = before + text + after; nc = ip.col + text.length; }
    if (insertionPoint.type !== 'cursor') { cursor.line = nl; cursor.col = nc; } else { ip.line = nl; ip.col = nc; }
    _updateMetrics(); _forceCursorPositionVisible(nl, nc); needsRender = true;
    if (recordHistory && !history.suppressNext && sb) _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'insert');
  }
  function _deleteSelectionRange(r) { if (!r) return; if (r.start.line === r.end.line) { const l = lines[r.start.line] || ''; lines[r.start.line] = l.slice(0, r.start.col) + l.slice(r.end.col); cursor.col = r.start.col; } else { const f = lines[r.start.line] || ''; const la = lines[r.end.line] || ''; lines[r.start.line] = f.slice(0, r.start.col) + la.slice(r.end.col); const rm = r.end.line - r.start.line; if (rm > 0) lines.splice(r.start.line + 1, rm); cursor.line = r.start.line; cursor.col = r.start.col; } _updateMetrics(); }
  function _deleteCurrentSelection() { if (!selection.active) return false; const r = _getSelectionRange(); if (!r) return false; const sb = _getDocumentSnapshot(); _deleteSelectionRange(r); const sa = _getDocumentSnapshot(); _pushSnapshotEntry(sb, sa, 'delete-selection'); _clearSelection(); needsRender = true; return true; }
  async function _handleCopy() { if (!isEditing) { _enterEdit(); return; } const t = selection.active ? _getSelectedText() : (lines[cursor.line] || ''); if (!t) { showToast('No text selected', container); return; } try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(t); showToast(`Copied ${t.length} chars`, container); } else _fallbackCopy(t); } catch { _fallbackCopy(t); } }
  function _fallbackCopy(t) { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px'; document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand('copy'); showToast(`Copied ${t.length} chars`, container); } catch { showToast('Copy failed', container); } document.body.removeChild(ta); }
  async function _handleCut() { if (!isEditing) { _enterEdit(); return; } let t = ''; let r = null; if (selection.active) { t = _getSelectedText(); r = _getSelectionRange(); if (!t) { showToast('No text selected', container); return; } } else t = lines[cursor.line] || ''; try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(t); const sb = _getDocumentSnapshot(); if (r && selection.active) _deleteSelectionRange(r); else if (!selection.active) { lines[cursor.line] = ''; cursor.col = 0; } _clearSelection(); _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'cut'); _updateMetrics(); needsRender = true; showToast(`Cut ${t.length} chars`, container); } else { _fallbackCopy(t); const sb = _getDocumentSnapshot(); if (r && selection.active) _deleteSelectionRange(r); else if (!selection.active) { lines[cursor.line] = ''; cursor.col = 0; } _clearSelection(); _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'cut-fallback'); _updateMetrics(); needsRender = true; } } catch { showToast('Cut failed', container); } }
  async function _handlePaste() { if (!isEditing) { _enterEdit(); await new Promise(r => setTimeout(r, 50)); } try { let ct = ''; if (navigator.clipboard?.readText) ct = await navigator.clipboard.readText(); else { hiddenInput.focus(); await new Promise(r => setTimeout(r, 100)); ct = hiddenInput.value; hiddenInput.value = ''; } if (!ct) { showToast('Clipboard is empty', container); return; } const sb = _getDocumentSnapshot(); if (selection.active) { const r = _getSelectionRange(); if (r) { _replaceSelectionWithText(ct, r); _clearSelection(); _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'paste-selection'); showToast(`Replaced selection`, container); return; } } _insertTextAtCursor(ct, false); _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'paste'); showToast(`Pasted ${ct.length} chars`, container); } catch { showToast('Paste failed', container); } }
  function _replaceSelectionWithText(t, r) { const rl = t.split('\n'); const f = lines[r.start.line] || ''; const la = lines[r.end.line] || ''; lines[r.start.line] = f.slice(0, r.start.col) + rl[0]; if (rl.length > 1) lines.splice(r.start.line + 1, 0, ...rl.slice(1)); const li = r.start.line + rl.length - 1; lines[li] += la.slice(r.end.col); if (r.end.line - r.start.line > 0) lines.splice(r.start.line + rl.length, r.end.line - r.start.line); if (rl.length === 1) { cursor.line = r.start.line; cursor.col = r.start.col + rl[0].length; } else { cursor.line = li; cursor.col = rl[rl.length - 1].length; } _updateMetrics(); _forceCursorPositionVisible(cursor.line, cursor.col); needsRender = true; }
  async function _handleCopyAll() { const t = lines.join('\n'); try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(t); else _fallbackCopy(t); } catch { _fallbackCopy(t); } }
  async function _handleReplaceAll() { try { let ct = ''; if (navigator.clipboard?.readText) ct = await navigator.clipboard.readText(); else { hiddenInput.focus(); await new Promise(r => setTimeout(r, 100)); ct = hiddenInput.value; hiddenInput.value = ''; } if (!ct) { showToast('Clipboard is empty', container); return; } pendingClipboardText = ct; const mc = modalOverlay.querySelector('[data-ref="current"]'); const mb = modalOverlay.querySelector('[data-ref="clipboard"]'); if (mc) mc.textContent = lines.length.toLocaleString(); if (mb) mb.textContent = ct.split('\n').length.toLocaleString(); modalOverlay.classList.add('visible'); } catch { showToast('Failed to read clipboard', container); } }
  function _confirmReplaceAll() { if (!pendingClipboardText) { _hideModal(); return; } const sb = _getDocumentSnapshot(); lines.length = 0; lines.push(...pendingClipboardText.split('\n')); if (lines.length === 0) lines.push(''); scroll.x = 0; scroll.y = 0; cursor.line = 0; cursor.col = 0; selection.active = false; _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'replace-all'); _updateMetrics(); needsRender = true; _hideModal(); showToast(`Replaced all content (${lines.length} lines)`, container); if (instanceOnChange) instanceOnChange.call(container, { target: container }); }
  function _hideModal() { modalOverlay.classList.remove('visible'); pendingClipboardText = ''; }
  function _handleKey(e) {
    if (e.ctrlKey || e.metaKey) { if (e.key === 'v') { e.preventDefault(); _handlePaste(); return; } if (e.key === 'c') { e.preventDefault(); _handleCopy(); return; } if (e.key === 'x') { e.preventDefault(); _handleCut(); return; } if (e.key === 'a') { e.preventDefault(); selection.active = true; selection.anchor = { line: 0, col: 0 }; selection.focus = { line: lines.length - 1, col: (lines[lines.length - 1] || '').length }; needsRender = true; return; } if (!e.shiftKey && e.key === 'z') { e.preventDefault(); _undo(); return; } if ((e.shiftKey && e.key === 'z') || e.key === 'y') { e.preventDefault(); _redo(); return; } }
    if (isLoading) return; const line = lines[cursor.line] || '';
    switch (e.key) {
      case 'ArrowUp': if (cursor.line > 0) { cursor.line--; cursor.col = Math.min(cursor.col, (lines[cursor.line] || '').length); _forceCursorPositionVisible(cursor.line, cursor.col); } needsRender = true; e.preventDefault(); break;
      case 'ArrowDown': if (cursor.line < lines.length - 1) { cursor.line++; cursor.col = Math.min(cursor.col, (lines[cursor.line] || '').length); _forceCursorPositionVisible(cursor.line, cursor.col); } needsRender = true; e.preventDefault(); break;
      case 'ArrowLeft': if (cursor.col > 0) cursor.col--; else if (cursor.line > 0) { cursor.line--; cursor.col = (lines[cursor.line] || '').length; _forceCursorPositionVisible(cursor.line, cursor.col); } needsRender = true; e.preventDefault(); break;
      case 'ArrowRight': if (cursor.col < line.length) cursor.col++; else if (cursor.line < lines.length - 1) { cursor.line++; cursor.col = 0; _forceCursorPositionVisible(cursor.line, cursor.col); } needsRender = true; e.preventDefault(); break;
      case 'Enter': if (selection.active && _deleteCurrentSelection()) { needsRender = true; e.preventDefault(); return; } { const sb = _getDocumentSnapshot(); lines[cursor.line] = line.slice(0, cursor.col); lines.splice(cursor.line + 1, 0, line.slice(cursor.col)); cursor.line++; cursor.col = 0; _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'enter-key'); } _updateMetrics(); _forceCursorPositionVisible(cursor.line, cursor.col); needsRender = true; e.preventDefault(); break;
      case 'Backspace': if (selection.active && _deleteCurrentSelection()) { needsRender = true; e.preventDefault(); return; } if (cursor.col > 0) { const sb = _getDocumentSnapshot(); lines[cursor.line] = line.slice(0, cursor.col - 1) + line.slice(cursor.col); cursor.col--; _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'backspace-char'); } else if (cursor.line > 0) { const sb = _getDocumentSnapshot(); const pl = (lines[cursor.line - 1] || '').length; lines[cursor.line - 1] += lines[cursor.line]; lines.splice(cursor.line, 1); cursor.line--; cursor.col = pl; _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'backspace-join'); _updateMetrics(); } needsRender = true; e.preventDefault(); break;
      case 'Delete': if (selection.active && _deleteCurrentSelection()) { needsRender = true; e.preventDefault(); return; } if (cursor.col < line.length) { const sb = _getDocumentSnapshot(); lines[cursor.line] = line.slice(0, cursor.col) + line.slice(cursor.col + 1); _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'delete-char'); } else if (cursor.line < lines.length - 1) { const sb = _getDocumentSnapshot(); lines[cursor.line] += lines[cursor.line + 1]; lines.splice(cursor.line + 1, 1); _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'delete-join'); _updateMetrics(); } _forceCursorPositionVisible(cursor.line, cursor.col); needsRender = true; e.preventDefault(); break;
      case 'Tab': e.preventDefault(); { const sb = _getDocumentSnapshot(); _insertTextAtCursor('  ', false); _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'tab'); } break;
      case 'Escape': if (selection.active) { _clearSelection(); e.preventDefault(); } break;
    }
  }
  function _setupEvents() {
    canvas.addEventListener('selectstart', e => { if (zoom.active || selection.active || touch.touchedHandle) { e.preventDefault(); return false; } });
    container.addEventListener('selectstart', e => { if (!e.target.classList.contains('opt-text-hidden-input')) { e.preventDefault(); return false; } });
    canvas.addEventListener('contextmenu', e => { e.preventDefault(); return false; });
    canvas.addEventListener('touchstart', _onPointerDown, { passive: true }); canvas.addEventListener('mousedown', _onPointerDown);
    canvas.addEventListener('touchmove', _onPointerMove, { passive: false }); canvas.addEventListener('mousemove', _onPointerMove);
    canvas.addEventListener('touchend', _onPointerUp, { passive: true }); canvas.addEventListener('mouseup', _onPointerUp);
    canvas.addEventListener('touchcancel', _onPointerCancel, { passive: true }); canvas.addEventListener('mouseleave', _onPointerLeave);
    let dragging = null, sSY = 0, sSX = 0, sTY = 0, sTX = 0;
    const onS = (isV, e) => { e.preventDefault?.(); e.stopPropagation(); _stopMomentum(); _cancelZoomTimer(); touch.touchedHandle = null; if (zoom.active) _deactivateZoom(false); dragging = isV ? 'v' : 'h'; const pt = _getEventPoint(e); if (isV) { sTY = pt.y; sSY = scroll.y; } else { sTX = pt.x; sSX = scroll.x; } _showScrollbars(); };
    const onM = (e) => { if (!dragging) return; const pt = _getEventPoint(e); if (dragging === 'v') { const d = pt.y - sTY; const tH = parseFloat(vThumb.style.height) || 30; const rng = Math.max(1, metrics.fullViewportHeight - tH); scroll.y = _clamp(sSY + (d / rng) * metrics.maxScrollY, 0, metrics.maxScrollY); } else { const d = pt.x - sTX; const tW = parseFloat(hThumb.style.width) || 30; const rng = Math.max(1, metrics.viewportWidth - tW); scroll.x = _clamp(sSX + (d / rng) * metrics.maxScrollX, 0, metrics.maxScrollX); } needsRender = true; _showScrollbars(); };
    const onE = () => { dragging = null; };
    vScroll.addEventListener('touchstart', e => onS(true, e), { passive: false }); vScroll.addEventListener('mousedown', e => onS(true, e));
    hScroll.addEventListener('touchstart', e => onS(false, e), { passive: false }); hScroll.addEventListener('mousedown', e => onS(false, e));
    window.addEventListener('touchmove', onM, { passive: false }); window.addEventListener('mousemove', onM); window.addEventListener('touchend', onE); window.addEventListener('mouseup', onE);
    hiddenInput.addEventListener('input', e => { if (isLoading || !e.data) { hiddenInput.value = ''; return; } const sb = _getDocumentSnapshot(); _insertTextAtCursor(e.data, false); _pushSnapshotEntry(sb, _getDocumentSnapshot(), 'typing'); hiddenInput.value = ''; if (instanceOnInput) instanceOnInput.call(container, { target: container }); });
    hiddenInput.addEventListener('keydown', _handleKey);
    document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable) && a !== hiddenInput) return; e.preventDefault(); _undo(); } if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === 'Z') || e.key === 'y' || e.key === 'Y')) { const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable) && a !== hiddenInput) return; e.preventDefault(); _redo(); } if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'g') { const a = document.activeElement; if (!a || !(a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable) || a === hiddenInput) { e.preventDefault(); _showGotoModal(); } } }, { capture: true });
    menuBtn.addEventListener('click', e => { e.stopPropagation(); const o = dropdown.classList.toggle('open'); menuBtn.setAttribute('aria-expanded', o); dropdown.setAttribute('aria-hidden', !o); });
    document.addEventListener('click', e => { if (!dropdown.contains(e.target) && !menuBtn.contains(e.target)) { dropdown.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); dropdown.setAttribute('aria-hidden', 'true'); } });
    dropdown.addEventListener('click', e => { const it = e.target.closest('[data-action]'); if (!it) return; dropdown.classList.remove('open'); switch (it.dataset.action) { case 'start-select': selection.active = true; selection.anchor = { ...cursor }; selection.focus = { ...cursor }; if (!isEditing) _enterEdit(); needsRender = true; break; case 'clear-selection': _clearSelection(); break; case 'cut': _handleCut(); break; case 'copy': _handleCopy(); break; case 'paste': _handlePaste(); break; case 'copy-all': _handleCopyAll(); break; case 'replace-all': _handleReplaceAll(); break; case 'goto-line': _showGotoModal(); break; } });
    container.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; if (b.dataset.action === 'undo') _undo(); if (b.dataset.action === 'redo') _redo(); });
    gotoModal.querySelector('[data-action="cancel"]').addEventListener('click', _hideGotoModal);
    gotoModal.querySelector('[data-action="goto"]').addEventListener('click', () => { const v = parseInt(gotoInput.value, 10); if (!isNaN(v) && v >= 1) _goToLine(v, 0); _hideGotoModal(); });
    gotoInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = parseInt(gotoInput.value, 10); if (!isNaN(v) && v >= 1) _goToLine(v, 0); _hideGotoModal(); } if (e.key === 'Escape') { e.preventDefault(); _hideGotoModal(); } });
    gotoModal.addEventListener('click', e => { if (e.target === gotoModal) _hideGotoModal(); });
    modalOverlay.querySelector('[data-action="cancel"]').addEventListener('click', _hideModal);
    modalOverlay.querySelector('[data-action="confirm"]').addEventListener('click', _confirmReplaceAll);
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) _hideModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalOverlay.classList.contains('visible')) _hideModal(); });
    window.addEventListener('resize', () => { _setupCanvas(); _updateMetrics(); needsRender = true; });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { const vh = window.visualViewport.height; const fh = window.innerHeight; if (fh - vh > 100) { metrics.keyboardHeight = fh - vh; metrics.viewportHeight = vh - 28; } else { metrics.keyboardHeight = 0; metrics.viewportHeight = metrics.fullViewportHeight; } _updateMetrics(); if (isEditing) _forceCursorPositionVisible(cursor.line, cursor.col); needsRender = true; });
  }
  function _onPointerUp(e) { if (isLoading) return; const pt = _getEventPoint(e); _cancelZoomTimer(); if (zoom.active) { _deactivateZoom(true); return; } let prev = false; let focus = false; if (touch.touchedHandle) { _stopMomentum(); focus = _placeCursorOrHandle(pt.x, pt.y, 'handle', touch.touchedHandle); prev = true; touch.touchedHandle = null; touch.didScroll = false; } else if (selection.active && selectedHandle && !touch.didScroll) { if (Math.sqrt((pt.y - touch.startY) ** 2 + (pt.x - touch.startX) ** 2) < CONFIG.tapThreshold && Date.now() - touch.startTime < CONFIG.tapMaxTime) { focus = _placeCursorOrHandle(pt.x, pt.y, 'handle', selectedHandle); prev = true; } } else { if (!touch.isScrolling && !touch.didScroll && Math.sqrt((pt.y - touch.startY) ** 2 + (pt.x - touch.startX) ** 2) < CONFIG.tapThreshold && Date.now() - touch.startTime < CONFIG.tapMaxTime) focus = _placeCursorOrHandle(pt.x, pt.y, 'cursor'); } if (focus) _enterEdit(); if (prev && _shouldPreventDefault(e, false)) e.preventDefault(); if (touch.isScrolling) { touch.velocityY *= CONFIG.velocityMultiplier; touch.velocityX *= CONFIG.velocityMultiplier; if (Math.sqrt(touch.velocityY ** 2 + touch.velocityX ** 2) > CONFIG.momentumMinSpeed) _startMomentum(); } touch.isScrolling = false; }
  function _onPointerCancel(e) { _cancelZoomTimer(); if (zoom.active) _deactivateZoom(false); _stopMomentum(); touch.isScrolling = false; touch.touchedHandle = null; touch.didScroll = false; }
  function _onPointerLeave(e) { _cancelZoomTimer(); if (zoom.active) _deactivateZoom(false); touch.touchedHandle = null; touch.didScroll = false; }
  function _onContextMenu(e) { if (zoom.active) { e.preventDefault(); _deactivateZoom(false); } }
  function _getHandleAtPosition(cx, cy) { if (!selection.active) return null; const r = canvas.getBoundingClientRect(); const vx = cx - r.left; const vy = cy - r.top; const s = zoom.active ? CONFIG.zoomLevel : 1; const hit = 30 * s; const chk = (l, c) => { const t = lines[l] || ''; const cc = Math.min(c, t.length); const hx = CONFIG.lineNumWidth + 8 - scroll.x + cc * metrics.charWidth; const hy = l * CONFIG.lineHeight - scroll.y; return Math.sqrt((vx - hx) ** 2 + (vy - hy - CONFIG.lineHeight / 2) ** 2) <= hit; }; if (chk(selection.anchor.line, selection.anchor.col)) return 'anchor'; if (chk(selection.focus.line, selection.focus.col)) return 'focus'; return null; }
  function _init() { function wait() { const r = container.getBoundingClientRect(); if (r.width > 0 && r.height > 0) { if (!_setupCanvas()) { requestAnimationFrame(wait); return; } _updateMetrics(); _setupEvents(); if (lines.length === 0) lines = ['']; needsRender = true; loadingEl.classList.add('hidden'); console.log(`[optText] Ready | Canvas: ${canvas.width}x${canvas.height}`); setInterval(() => { if (!isLoading && !zoom.active) { cursor.visible = !cursor.visible; needsRender = true; } }, 500); _updateUndoRedoButtons(); requestAnimationFrame(_renderLoop); } else requestAnimationFrame(wait); } setTimeout(() => requestAnimationFrame(wait), 50); }
  _init(); return container;
}
export function createOptText() { const w = document.createElement('div'); w.className = 'opt-text-dialog-wrapper'; w.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:80%;height:80%;max-width:600px;max-height:800px;z-index:99999999999;'; w.appendChild(setupOptTextInstance()); return w; }
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => { document.querySelectorAll('opttext').forEach(el => { const p = el.parentNode; if (p) p.replaceChild(setupOptTextInstance(el), el); }); });