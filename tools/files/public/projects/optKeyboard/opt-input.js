// opt-input.js

// ─── Global Auto-Attach State ──────────────────────────────────────
let _globalObserver = null;
let _globalConfig = {
  autoAttach: true,
  selector: '[data-opt-input="true"], input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]'
};

/**
 * Initialize global opt-input auto-attachment
 * Watches DOM for new input elements and auto-attaches opt-input behavior
 * @param {Object} config
 * @param {boolean} [config.autoAttach=true] - Enable auto-attach
 * @param {string} [config.selector] - CSS selector for target elements
 */
export function initGlobalOptInput(config = {}) {
  if (_globalObserver) return; // Already initialized
  
  _globalConfig = { ..._globalConfig, ...config };
  
  // 1️⃣ Attach to existing elements on init
  if (_globalConfig.autoAttach) {
    document.querySelectorAll(_globalConfig.selector).forEach(el => {
      if (!el.dataset.optIgnore) attachOptInput(el);
    });
  }
  
  // 2️⃣ Watch for dynamically added elements via MutationObserver
  _globalObserver = new MutationObserver((mutations) => {
    if (!_globalConfig.autoAttach) return;
    
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // Skip text/comment nodes
        
        // Check the node itself
        if (node.matches?.(_globalConfig.selector) && !node.dataset.optAttached && !node.dataset.optIgnore) {
          attachOptInput(node);
        }
        
        // Check descendants (for innerHTML injection, framework renders, etc.)
        if (node.querySelectorAll) {
          node.querySelectorAll(_globalConfig.selector).forEach(el => {
            if (!el.dataset.optAttached && !el.dataset.optIgnore) {
              attachOptInput(el);
            }
          });
        }
      }
    }
  });
  
  // Start observing document.body for child additions
  _globalObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('🌐 Global opt-input watcher active');
}

/**
 * Stop global auto-attach watcher and cleanup
 */
export function uninitGlobalOptInput() {
  if (_globalObserver) {
    _globalObserver.disconnect();
    _globalObserver = null;
    console.log('🛑 Global opt-input watcher stopped');
  }
}

/**
 * Get current global config (for debugging/inspection)
 */
export function getGlobalOptInputConfig() {
  return { ..._globalConfig };
}

/**
 * Manually attach opt-input behavior to a single element
 * @param {HTMLElement} el - The input/textarea/contenteditable element
 */
export function attachOptInput(el) {
  if (el.dataset.optAttached) return;
  el.dataset.optAttached = 'true';
  el.dataset.optEnabled = 'true';
  el.setAttribute('inputmode', 'none'); // Suppress native mobile keyboard

  const getValue = () => el.isContentEditable ? el.innerText : (el.value ?? '');

  const dispatch = (name, detail = {}, cancelable = true) => {
    const evt = new CustomEvent(`opt${name}`, {
      detail: { target: el, ...detail },
      bubbles: true,
      cancelable
    });
    const ok = el.dispatchEvent(evt);
    if (!ok && detail.preventDefault) detail.preventDefault();
    return ok;
  };

  // ─── Programmatic API ────────────────────────────────────────────
  el.optSetValue = (val, cursorPos) => {
    if (el.isContentEditable) {
      el.innerText = val;
    } else {
      el.value = val;
    }
    if (typeof cursorPos === 'number' && el.setSelectionRange) {
      el.setSelectionRange(cursorPos, cursorPos);
    }
    dispatch('Input', { 
      inputType: 'insertText', 
      value: getValue(), 
      source: 'programmatic' 
    }, false);
  };
  
  el.optFocus = () => el.focus();
  el.optBlur = () => el.blur();
  
  // Detach opt-input behavior from this element
  el.optDetach = () => {
    delete el.dataset.optAttached;
    delete el.dataset.optEnabled;
    el.setAttribute('inputmode', 'text'); // Restore default
    // Note: Event listeners remain for simplicity; re-attach handles duplicates via dataset check
  };

  // ─── Native Event Listeners → opt* Custom Events ─────────────────
  el.addEventListener('focus', () => {
    dispatch('Focus', { value: getValue() }, false);
  });
  
  el.addEventListener('blur', () => {
    dispatch('Blur', { value: getValue() }, false);
  });

  el.addEventListener('keydown', e => {
    dispatch('Keydown', {
      key: e.key,
      code: e.code,
      repeat: e.repeat,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      preventDefault: () => e.preventDefault(),
      nativeEvent: e
    });
  });
  
  el.addEventListener('keyup', e => {
    dispatch('Keyup', {
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      preventDefault: () => e.preventDefault(),
      nativeEvent: e
    });
  });

  el.addEventListener('beforeinput', e => {
    dispatch('Beforeinput', {
      inputType: e.inputType,
      data: e.data,
      dataTransfer: e.dataTransfer,
      preventDefault: () => e.preventDefault(),
      nativeEvent: e
    });
  });
  
  el.addEventListener('input', e => {
    dispatch('Input', {
      inputType: e.inputType,
      data: e.data,
      value: getValue(),
      nativeEvent: e
    }, false);
  });

  // Composition events for IME support
  ['compositionstart', 'compositionupdate', 'compositionend'].forEach(type => {
    el.addEventListener(type, e => {
      dispatch(
        type.replace(/^composition/, 'Composition'),
        { data: e.data, nativeEvent: e },
        type === 'compositionstart'
      );
    });
  });

  // Clipboard events for better control
  ['cut', 'copy', 'paste'].forEach(cmd => {
    el.addEventListener(cmd, e => {
      dispatch('Clipboard', {
        command: cmd,
        clipboardData: e.clipboardData,
        preventDefault: () => e.preventDefault(),
        nativeEvent: e
      });
    });
  });
}

// ─── Auto-init on DOMContentLoaded (optional convenience) ──────────
// Uncomment below if you want global auto-attach to start automatically:
/*
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initGlobalOptInput());
  } else {
    initGlobalOptInput();
  }
}
*/