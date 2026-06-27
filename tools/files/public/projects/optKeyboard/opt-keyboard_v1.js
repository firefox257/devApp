// opt-keyboard.js
export const optKeyboard = {
  activeTarget: null,
  visible: false,
  _blurTimer: null,
  _scrollRafId: null, // Replaces debounce for frame-synced scroll
  autoShow: true,
  blurDelay: 100,
  scrollConfig: { padding: 20, behavior: 'smooth' },
  keyboardHeight: 215,
  _listeners: new Map(),
  
  // ✨ Drop-in scroll management
  _scrollContainer: null,
  autoScrollIntoView: true,
  _origPadding: null,
  _origScrollPadding: null,
  _origTransition: null,

  init({ 
    autoShow = true, 
    blurDelay = 100, 
    scrollConfig = { padding: 20, behavior: 'smooth' },
    keyboardHeight = 215,
    scrollContainer = null,
    autoScrollIntoView = true
  } = {}) {
    this.autoShow = autoShow;
    this.blurDelay = blurDelay;
    this.scrollConfig = scrollConfig;
    this.keyboardHeight = keyboardHeight;
    this.autoScrollIntoView = autoScrollIntoView;
    
    this._scrollContainer = scrollContainer || document.scrollingElement || document.documentElement;

    const onFocus = (e) => this._onFocus(e.detail);
    const onBlur = (e) => this._onBlur(e.detail);
    
    this._listeners.set('focus', onFocus);
    this._listeners.set('blur', onBlur);
    
    document.addEventListener('optFocus', onFocus);
    document.addEventListener('optBlur', onBlur);
  },

  uninit() {
    for (const [type, handler] of this._listeners) {
      document.removeEventListener(`opt${type}`, handler);
    }
    this._listeners.clear();
    clearTimeout(this._blurTimer);
    cancelAnimationFrame(this._scrollRafId);
    
    this._applyScrollPadding(false);
    this.activeTarget = null;
    this.visible = false;
  },

  _applyScrollPadding(show) {
    if (!this.autoScrollIntoView || !this._scrollContainer) return;
    const el = this._scrollContainer;
    const kbH = this.keyboardHeight;
    
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (show) {
      this._origPadding = el.style.paddingBottom;
      this._origScrollPadding = el.style.scrollPaddingBottom;
      this._origTransition = el.style.transition;
      
      el.style.paddingBottom = `${kbH}px`;
      el.style.scrollPaddingBottom = `${kbH}px`; // 🔑 Native scroll respects this
      
      if (!prefersReduced) {
        el.style.transition = 'padding-bottom 0.2s ease-out';
      }
    } else {
      el.style.paddingBottom = this._origPadding ?? '';
      el.style.scrollPaddingBottom = this._origScrollPadding ?? '';
      
      if (this._origTransition !== null) el.style.transition = this._origTransition;
      else el.style.transition = '';
      
      this._origPadding = null;
      this._origScrollPadding = null;
      this._origTransition = null;
    }
  },

  _onFocus(detail) {
    clearTimeout(this._blurTimer);
    const target = detail.target;
    if (!target.dataset.optEnabled) return;
    
    this.activeTarget = target;
    if (this.autoShow && !this.visible) {
      this.visible = true;
      this._applyScrollPadding(true);
      this.onShow?.(target);
      
      requestAnimationFrame(() => {
        if (this.activeTarget === target) {
          target.scrollIntoView({ block: 'end', behavior: this.scrollConfig.behavior || 'smooth' });
        }
      });
    }
  },

  _onBlur(detail) {
    clearTimeout(this._blurTimer);
    this._blurTimer = setTimeout(() => {
      if (this.activeTarget === detail.target) {
        this.activeTarget = null;
        if (this.visible) {
          this.visible = false;
          this.onHide?.(detail.target);
          this._applyScrollPadding(false);
        }
      }
    }, this.blurDelay);
  },

  _scrollCaretIntoView(el, { behavior } = {}) {
    if (!el || !el.isConnected || !this.visible) return;
    
    // <input>: instant horizontal scroll
    if (el.tagName === 'INPUT' && el.type !== 'password') {
      this._performScroll(el, { behavior });
      return;
    }
    
    // 🎯 Frame-synced vertical scroll. Cancels previous rAF to prevent queue buildup.
    cancelAnimationFrame(this._scrollRafId);
    this._scrollRafId = requestAnimationFrame(() => this._performScroll(el, { behavior }));
  },

  _performScroll(el, { behavior = 'smooth' } = {}) {
    if (!this._scrollContainer || !this.visible) return;
    const pad = this.scrollConfig.padding || 20;
    const kbH = this.keyboardHeight;

    // ─── <input>: Horizontal scroll (unchanged, pixel-perfect) ───
    if (el.tagName === 'INPUT' && el.type !== 'password') {
      el.clientWidth; 
      const cs = getComputedStyle(el);
      const cursorPos = el.selectionStart ?? el.value.length;
      
      const mirror = document.createElement('span');
      mirror.style.cssText = `position:absolute;top:-9999px;left:-9999px;visibility:hidden;
        white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing};
        padding:0;margin:0;border:0;box-sizing:content-box;`;
      mirror.textContent = el.value.slice(0, cursorPos);
      document.body.appendChild(mirror);
      const textWidth = mirror.offsetWidth;
      document.body.removeChild(mirror);
      
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const borderL = parseFloat(cs.borderLeftWidth) || 0;
      const borderR = parseFloat(cs.borderRightWidth) || 0;
      const clientW = el.clientWidth;
      const cursorX = textWidth + padL + borderL;
      
      const visibleStart = el.scrollLeft;
      const visibleEnd = el.scrollLeft + clientW - padL - padR - borderL - borderR;
      const cushion = 10;
      
      let newScroll = el.scrollLeft;
      if (cursorX > visibleEnd - cushion) newScroll = cursorX - (clientW - padR - borderR) + cushion;
      else if (cursorX < visibleStart + cushion) newScroll = cursorX - cushion;
      
      newScroll = Math.max(0, Math.min(newScroll, Math.max(0, el.scrollWidth - clientW)));
      if (Math.abs(newScroll - el.scrollLeft) > 0.5) el.scrollLeft = newScroll;
      return;
    }
    
    // ─── <textarea>: Accurate vertical scroll with keyboard offset ───
    if (el.tagName === 'TEXTAREA') {
      const cursorPos = el.selectionStart ?? el.value.length;
      const cs = getComputedStyle(el);
      
      // Mirror matches textarea typography & layout exactly
      const mirror = document.createElement('div');
      mirror.style.cssText = `position:absolute;top:-9999px;left:-9999px;visibility:hidden;
        white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;
        font:${cs.font};line-height:${cs.lineHeight};letter-spacing:${cs.letterSpacing};
        padding:${cs.padding};border-width:${cs.borderWidth};border-style:${cs.borderStyle};
        width:${el.clientWidth}px;box-sizing:${cs.boxSizing};`;
      document.body.appendChild(mirror);
      
      mirror.textContent = el.value.slice(0, cursorPos);
      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      mirror.appendChild(marker);
      
      // offsetTop gives exact Y in the unscrolled content
      const caretAbsoluteY = marker.offsetTop;
      document.body.removeChild(mirror);
      
      const currentScroll = el.scrollTop;
      const visibleCaretY = caretAbsoluteY - currentScroll;
      const visibleH = el.clientHeight;
      
      // Safe zone: keep cursor between pad and (visible area - keyboard)
      const minVisible = pad;
      const maxVisible = Math.max(pad, visibleH - kbH - pad);
      
      let newScroll = currentScroll;
      if (visibleCaretY > maxVisible) {
        // Cursor below safe zone → scroll content UP to reveal it
        newScroll += (visibleCaretY - maxVisible);
      } else if (visibleCaretY < minVisible) {
        // Cursor above safe zone → scroll content DOWN slightly
        newScroll += (visibleCaretY - minVisible);
      }
      
      // Clamp to valid scroll range
      const maxScroll = Math.max(0, el.scrollHeight - visibleH);
      el.scrollTop = Math.max(0, Math.min(newScroll, maxScroll));
      return;
    }
    
    // ─── contenteditable: scrollPaddingBottom + scrollIntoView (native) ───
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      
      const range = sel.getRangeAt(0);
      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      marker.style.cssText = 'display:inline-block;width:0;height:0;overflow:hidden;vertical-align:baseline;';
      
      range.insertNode(marker);
      marker.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior });
      marker.remove();
      return;
    }
  },

  insertChar(char) {
    if (!this.activeTarget) return false;
    const el = this.activeTarget;
    if (el.isComposing) return false;

    const beforeOk = el.dispatchEvent(new CustomEvent('optBeforeinput', {
      detail: { target: el, inputType: 'insertText', data: char, source: 'virtual' },
      bubbles: true, cancelable: true
    }));
    if (!beforeOk) return false;

    el.focus();
    const val = el.isContentEditable ? el.innerText : el.value;
    const start = el.selectionStart ?? val.length;
    const end = el.selectionEnd ?? val.length;

    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (sel.rangeCount === 0) return false;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      
      if (char === '\n') {
        const br = document.createElement('br');
        range.insertNode(br);
        range.setStartAfter(br);
      } else if (char === ' ') {
        const nbsp = document.createTextNode('\u00A0');
        range.insertNode(nbsp);
        range.setStartAfter(nbsp);
      } else {
        range.insertNode(document.createTextNode(char));
        range.setStart(range.endContainer, range.endOffset);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const newVal = val.slice(0, start) + char + val.slice(end);
      el.value = newVal;
      el.selectionStart = el.selectionEnd = start + char.length;
    }

    el.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: char
    }));
    el.dispatchEvent(new CustomEvent('optInput', {
      detail: { target: el, inputType: 'insertText', data: char, value: el.isContentEditable ? el.innerText : el.value, source: 'virtual' },
      bubbles: true
    }));

    this._scrollCaretIntoView(el, this.scrollConfig);
    return true;
  },

  deleteChar({ direction = 'backward' } = {}) {
    if (!this.activeTarget) return false;
    const el = this.activeTarget;
    if (el.isComposing) return false;

    const inputType = direction === 'backward' ? 'deleteContentBackward' : 'deleteContentForward';
    
    if (!el.dispatchEvent(new CustomEvent('optBeforeinput', {
      detail: { target: el, inputType, data: null, source: 'virtual', direction },
      bubbles: true, cancelable: true
    }))) return false;

    if (el.isContentEditable) {
      el.focus();
      document.execCommand('delete', false, null);
    } else {
      el.focus();
      const val = el.value;
      let start = el.selectionStart, end = el.selectionEnd;
      if (start == null || end == null) start = end = val.length;

      let newStart, newEnd, newVal;
      if (start !== end) {
        newVal = val.slice(0, start) + val.slice(end);
        newStart = newEnd = start;
      } else if (direction === 'backward' && start > 0) {
        newVal = val.slice(0, start - 1) + val.slice(start);
        newStart = newEnd = start - 1;
      } else if (direction === 'forward' && end < val.length) {
        newVal = val.slice(0, start) + val.slice(end + 1);
        newStart = newEnd = start;
      } else {
        el.dispatchEvent(new CustomEvent('optInput', {
          detail: { target: el, inputType, data: null, value: val, source: 'virtual' },
          bubbles: true
        }));
        return true;
      }

      el.value = newVal;
      el.selectionStart = newStart;
      el.selectionEnd = newEnd;
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true, cancelable: true, inputType, data: null
      }));
    }

    el.dispatchEvent(new CustomEvent('optInput', {
      detail: { target: el, inputType, data: null, value: el.isContentEditable ? el.innerText : el.value, source: 'virtual' },
      bubbles: true
    }));

    this._scrollCaretIntoView(el, this.scrollConfig);
    return true;
  },

  dispatchAction(action, detail = {}) {
    if (!this.activeTarget) return;
    const ALLOWED_ACTIONS = new Set(['Submit', 'Search', 'Go', 'Next', 'Prev', 'Done', 'Send', 'Tab', 'Escape']);
    if (!ALLOWED_ACTIONS.has(action)) {
      console.warn(`optKeyboard: Unknown action "${action}". Allowed: ${[...ALLOWED_ACTIONS].join(', ')}`);
      return;
    }
    this.activeTarget.dispatchEvent(new CustomEvent(`opt${action}`, {
      detail: { ...detail, target: this.activeTarget, source: 'optKeyboard' },
      bubbles: true
    }));
  },

  scrollCaretIntoView(el, config) {
    this._scrollCaretIntoView(el, { ...this.scrollConfig, ...config });
  },

  updateKeyboardHeight(newHeight) {
    if (newHeight && newHeight !== this.keyboardHeight) {
      this.keyboardHeight = newHeight;
      if (this.visible) {
        this._applyScrollPadding(true);
        if (this.activeTarget) this._scrollCaretIntoView(this.activeTarget, this.scrollConfig);
      }
      document.documentElement.style.setProperty('--kb-height', `${newHeight}px`);
    }
  }
};