// ./ux/textCode.js
import {
    TAB_SPACES,
    HISTORY_DEBOUNCE_TIME,
    LINE_HEIGHT_PX,
    injectStyles,
    getCaretPosition,
    setCaretPosition,
    scrollCaretIntoView,
    editorHtml,
    copyToClipboard,
    getFromClipboard,
    buildLineCache,
    updateLineNumbersVirtual
} from './textCodeUI_workon.js';

// --- Module-level Variables ---
let lastTypedChar = '';
let secLastTypedChar = '';

// ✨ PERFORMANCE: Debounce timers and cache
let lineNumbersUpdateTimeout = null;
let scrollSyncRaf = null;
let cachedContent = '';
let cachedLineCache = null; // { content, offsets }

// --- Core Editor Setup Function ---
/**
 * Sets up a code editor instance, handling DOM creation, event listeners,
 * and property emulation. OPTIMIZED for large text performance.
 * @param {string|Array<Object>} initialContent - The initial text content or an array of page objects.
 * @param {HTMLElement|null} originalElement - The original <textcode> element if converting, otherwise null.
 * @returns {HTMLElement} The outermost DOM element representing the code editor.
 */
function setupCodeEditorInstance(initialContent, originalElement = null) {
    injectStyles();

    // --- Pages and History Management ---
    let pages = [];
    let currentPageIndex = 0;

    const createNewPage = (content = '', title = 'Untitled') => ({
        title,
        content,
        history: [],
        historyPointer: -1,
        redoStack: [],
        lineCache: null // ✨ Per-page line cache
    });

    if (Array.isArray(initialContent)) {
        pages = initialContent.map(page => ({
            title: page.title,
            content: page.content,
            history: [],
            historyPointer: -1,
            redoStack: [],
            lineCache: null
        }));
    } else {
        const initialPage = createNewPage(initialContent, originalElement?.title || 'Untitled');
        initialPage.lineCache = buildLineCache(initialContent); // ✨ Build initial cache
        pages.push(initialPage);
    }

    let historyTimeout = null;

    // --- Store original attributes for emulation ---
    const originalId = originalElement ? originalElement.id : null;
    const originalClass = originalElement ? originalElement.className : null;
    const originalTitle = originalElement ? originalElement.getAttribute('title') : null;
    const originalOnInputAttribute = originalElement ? originalElement.getAttribute('oninput') : null;
    const originalOnChangeAttribute = originalElement ? originalElement.getAttribute('onchange') : null;
    const originalOnSaveAttribute = originalElement ? originalElement.getAttribute('onsave') : null;
    const originalOnCloseAttribute = originalElement ? originalElement.getAttribute('onclose') : null;
    const originalOnRunAttribute = originalElement ? originalElement.getAttribute('onrun') : null;

    // --- Build UI with String Literals ---
    const editorContainerWrapper = document.createElement('div');
    editorContainerWrapper.className = `code-editor-container-wrapper ${originalClass || ''}`;
    if (originalId) {
        editorContainerWrapper.id = originalId;
    }
    if (originalTitle) {
        editorContainerWrapper.setAttribute('title', originalTitle);
    }
    editorContainerWrapper.innerHTML = editorHtml;

    // --- Get References to DOM Elements ---
    const menuBar = editorContainerWrapper.querySelector('.code-editor-menu-bar');
    const undoButton = editorContainerWrapper.querySelector('.undo-btn');
    const redoButton = editorContainerWrapper.querySelector('.redo-btn');
    const selectAllButton = editorContainerWrapper.querySelector('.select-all-btn');
    const selectBracketButton = editorContainerWrapper.querySelector('.select-bracket-btn');
    const clipboardButton = editorContainerWrapper.querySelector('.clipboard-btn');
    const clipboardMenu = editorContainerWrapper.querySelector('.code-editor-clipboard-menu');
    const clipboardCutButton = editorContainerWrapper.querySelector('.clipboard-cut');
    const clipboardCopyButton = editorContainerWrapper.querySelector('.clipboard-copy');
    const clipboardPasteButton = editorContainerWrapper.querySelector('.clipboard-paste');
    const clipboardCopyAllButton = editorContainerWrapper.querySelector('.clipboard-copy-all');
    const clipboardReplaceAllButton = editorContainerWrapper.querySelector('.clipboard-replace-all');
    const goToLineButton = editorContainerWrapper.querySelector('.goto-btn');
    const findButton = editorContainerWrapper.querySelector('.find-btn');
    const pagesButton = editorContainerWrapper.querySelector('.pages-btn');
    const runButton = editorContainerWrapper.querySelector('.run-btn');
    const saveButton = editorContainerWrapper.querySelector('.save-btn');
    const closeButton = editorContainerWrapper.querySelector('.close-btn');
    const findInput = editorContainerWrapper.querySelector('.find-input');
    const findInputCell = editorContainerWrapper.querySelector('.find-input-cell');
    const prevFindButton = editorContainerWrapper.querySelector('.find-prev-btn');
    const prevFindCell = prevFindButton.parentElement;
    const nextFindButton = editorContainerWrapper.querySelector('.find-next-btn');
    const nextFindCell = nextFindButton.parentElement;
    const findCloseButton = editorContainerWrapper.querySelector('.find-close-btn');
    const findCloseCell = findCloseButton.parentElement;
    const lineNumbersDiv = editorContainerWrapper.querySelector('.code-editor-line-numbers');
    const contentDivScroller = editorContainerWrapper.querySelector('.code-editor-content-scroller');
    const contentDiv = editorContainerWrapper.querySelector('.code-editor-content');
    const beautifyButton = editorContainerWrapper.querySelector('.beautify-btn');
    const goToLineDialog = editorContainerWrapper.querySelector('.code-editor-goto-dialog');
    const goToLineInput = goToLineDialog.querySelector('input[type="number"]');
    const goToLineOkButton = goToLineDialog.querySelector('.goto-ok');
    const goToLineCancelButton = goToLineDialog.querySelector('.cancel');
    const titleBarRow = editorContainerWrapper.querySelector('.code-editor-title-bar-row');
    const titleTextSpan = editorContainerWrapper.querySelector('.code-editor-title-bar .title-text');
    const pagesPrevButton = editorContainerWrapper.querySelector('.pages-prev-btn');
    const pagesNextButton = editorContainerWrapper.querySelector('.pages-next-btn');
    const pagesMenuTitleInput = editorContainerWrapper.querySelector('.pages-menu-title-input');
    const pagesMenuDropdown = editorContainerWrapper.querySelector('.pages-menu-dropdown');
    const pagesCloseButton = editorContainerWrapper.querySelector('.pages-close-btn');
    const pagesPrevCell = pagesPrevButton.parentElement;
    const pagesNextCell = pagesNextButton.parentElement;
    const pagesTitleCell = pagesMenuTitleInput.parentElement;
    const pagesDropdownCell = pagesMenuDropdown.parentElement;
    const pagesCloseCell = pagesCloseButton.parentElement;

    // Set initial content and title based on pages
    contentDiv.textContent = pages[currentPageIndex].content;
    titleTextSpan.textContent = pages[currentPageIndex].title;

    // Update UI based on original attributes
    if (originalTitle) {
        titleBarRow.style.display = '';
        titleTextSpan.textContent = originalTitle;
    } else {
        titleBarRow.style.display = 'none';
    }

    // --- INTERCEPT AND WRAP addEventListener/removeEventListener ---
    const originalAddEventListener = editorContainerWrapper.addEventListener;
    const originalRemoveEventListener = editorContainerWrapper.removeEventListener;
    const eventListenerCount = {
        run: 0,
        save: 0,
        close: 0
    };

    const updateButtonVisibility = (type) => {
        const button = {
            run: runButton.parentElement,
            save: saveButton.parentElement,
            close: closeButton.parentElement
        }[type];
        if (button) {
            button.style.display = (eventListenerCount[type] > 0) ? 'table-cell' : 'none';
        }
    };

    editorContainerWrapper.__addEventListener = originalAddEventListener.bind(editorContainerWrapper);
    editorContainerWrapper.__removeEventListener = originalRemoveEventListener.bind(editorContainerWrapper);

    editorContainerWrapper.addEventListener = function(type, listener, options) {
        if (eventListenerCount.hasOwnProperty(type)) {
            eventListenerCount[type]++;
            updateButtonVisibility(type);
        }
        this.__addEventListener(type, listener, options);
    };

    editorContainerWrapper.removeEventListener = function(type, listener, options) {
        if (eventListenerCount.hasOwnProperty(type)) {
            eventListenerCount[type]--;
            updateButtonVisibility(type);
        }
        this.__removeEventListener(type, listener, options);
    };
    // --- END INTERCEPT ---

    // Set initial button visibility based on original attributes
    if (originalOnRunAttribute) {
        eventListenerCount.run++;
    }
    if (originalOnSaveAttribute) {
        eventListenerCount.save++;
    }
    if (originalOnCloseAttribute) {
        eventListenerCount.close++;
    }
    updateButtonVisibility('run');
    updateButtonVisibility('save');
    updateButtonVisibility('close');

    // --- Emulate 'value', 'oninput', 'onchange', etc. properties ---
    Object.defineProperty(editorContainerWrapper, 'value', {
        get() {
            return pages[currentPageIndex].content;
        },
        set(newValue) {
            if (typeof newValue !== 'string') {
                console.warn("Attempted to set 'value' to a non-string value:", newValue);
                newValue = String(newValue);
            }
            const currentPage = pages[currentPageIndex];
            currentPage.content = newValue;
            currentPage.lineCache = buildLineCache(newValue); // ✨ Update cache
            contentDiv.textContent = newValue;
            debouncedUpdateLineNumbers(); // ✨ Debounced
            const lines = newValue.split('\n');
            const lastLineLength = (lines.pop() || '').length;
            setCaretPosition(contentDiv, lines.length + 1, lastLineLength * TAB_SPACES, null, currentPage.lineCache); // ✨ Use cache
            scrollCaretIntoView(contentDivScroller);
            pushToHistory(true);
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'values', {
        get() {
            return pages.map(page => ({ title: page.title, content: page.content }));
        },
        set(newValues) {
            if (Array.isArray(newValues)) {
                pages = newValues.map(page => ({
                    title: page.title,
                    content: page.content,
                    history: [],
                    historyPointer: -1,
                    redoStack: [],
                    lineCache: buildLineCache(page.content) // ✨ Build cache for each page
                }));
                const oldPageIndex = currentPageIndex;
                currentPageIndex = 0;
                const firstPage = pages[currentPageIndex];
                contentDiv.textContent = firstPage.content;
                titleTextSpan.textContent = firstPage.title;
                pagesMenuTitleInput.value = firstPage.title;
                pushToHistory(true);
                updatePageMenuDropdown();
                debouncedUpdateLineNumbers(); // ✨ Debounced
                updateUndoRedoButtons();
                setCaretPosition(contentDiv, 1, 1, null, firstPage.lineCache); // ✨ Use cache
                scrollCaretIntoView(contentDivScroller);
                if (oldPageIndex !== currentPageIndex) {
                    const detail = {
                        valuesIndex: currentPageIndex,
                        title: firstPage.title,
                        content: firstPage.content
                    };
                    if (_onPageChangeHandler) {
                        try {
                            _onPageChangeHandler.call(editorContainerWrapper, detail);
                        } catch (err) {
                            console.error("Error executing programmatic onpagechange handler:", err);
                        }
                    }
                    editorContainerWrapper.dispatchEvent(new CustomEvent('pagechange', { detail: detail, bubbles: true, composed: true }));
                }
            } else {
                console.warn("Attempted to set 'values' to a non-array value:", newValues);
            }
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'valuesIndex', {
        get() {
            return currentPageIndex;
        },
        set(newIndex) {
            if (newIndex >= 0 && newIndex < pages.length) {
                switchPage(newIndex);
            } else {
                console.warn(`Attempted to set 'valuesIndex' to an invalid index: ${newIndex}`);
            }
        },
        configurable: true
    });

    let _onInputHandler = null;
    let _onChangeHandler = null;
    let _onSaveHandler = null;
    let _onCloseHandler = null;
    let _onRunHandler = null;
    let _onPageChangeHandler = null;

    Object.defineProperty(editorContainerWrapper, 'oninput', {
        get() { return _onInputHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onInputHandler = newValue;
            } else {
                console.warn("Attempted to set oninput to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'onchange', {
        get() { return _onChangeHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onChangeHandler = newValue;
            } else {
                console.warn("Attempted to set onchange to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'onsave', {
        get() { return _onSaveHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onSaveHandler = newValue;
                eventListenerCount.save++;
                updateButtonVisibility('save');
            } else {
                console.warn("Attempted to set onsave to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'onclose', {
        get() { return _onCloseHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onCloseHandler = newValue;
                eventListenerCount.close++;
                updateButtonVisibility('close');
            } else {
                console.warn("Attempted to set onclose to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'onrun', {
        get() { return _onRunHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onRunHandler = newValue;
                eventListenerCount.run++;
                updateButtonVisibility('run');
            } else {
                console.warn("Attempted to set onrun to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    Object.defineProperty(editorContainerWrapper, 'onpagechange', {
        get() { return _onPageChangeHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                _onPageChangeHandler = newValue;
            } else {
                console.warn("Attempted to set onpagechange to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // --- Helper Functions for Editor Instance ---
    
    // ✨ DEBOUNCED: Update line numbers only when needed
    const debouncedUpdateLineNumbers = () => {
        if (lineNumbersUpdateTimeout) clearTimeout(lineNumbersUpdateTimeout);
        lineNumbersUpdateTimeout = setTimeout(() => {
            updateLineNumbers();
            lineNumbersUpdateTimeout = null;
        }, 50);
    };

    const updateLineNumbers = () => {
        const currentPage = pages[currentPageIndex];
        // ✨ Use virtualized line numbers for performance
        const totalLines = currentPage.content.split('\n').length;
        updateLineNumbersVirtual(contentDiv, lineNumbersDiv, contentDivScroller, totalLines);
    };

    const updateUndoRedoButtons = () => {
        const currentPage = pages[currentPageIndex];
        undoButton.disabled = currentPage.history.length === 0;
        redoButton.disabled = currentPage.redoStack.length === 0;
    };

    const updatePageMenuDropdown = () => {
        pagesMenuDropdown.innerHTML = pages.map((p, i) => `<option value="${i}" ${i === currentPageIndex ? 'selected' : ''}>${p.title}</option>`).join('');
    };

    const switchPage = (index) => {
        if (index < 0 || index >= pages.length) return;
        const oldPageIndex = currentPageIndex;
        const isPageChanging = index !== oldPageIndex;
        
        // Save current page content
        pages[oldPageIndex].content = contentDiv.textContent;
        
        // Switch index
        currentPageIndex = index;
        const newPage = pages[currentPageIndex];
        
        // ✨ Restore from cache if available
        const stateToRestore = newPage.history[newPage.historyPointer] || {
            content: newPage.content,
            caret: getCaretPosition(contentDiv, newPage.lineCache)
        };
        
        contentDiv.textContent = stateToRestore.content;
        titleTextSpan.textContent = newPage.title;
        pagesMenuTitleInput.value = newPage.title;
        
        // Update UI
        updateLineNumbers();
        updateUndoRedoButtons();
        updatePageMenuDropdown();
        
        // ✨ Use cached line offsets for caret positioning
        setCaretPosition(contentDiv, stateToRestore.caret.line, stateToRestore.caret.column, null, newPage.lineCache);
        scrollCaretIntoView(contentDivScroller);
        
        if (isPageChanging) {
            const detail = {
                valuesIndex: currentPageIndex,
                title: newPage.title,
                content: newPage.content
            };
            if (_onPageChangeHandler) {
                try {
                    _onPageChangeHandler.call(editorContainerWrapper, detail);
                } catch (err) {
                    console.error("Error executing programmatic onpagechange handler:", err);
                }
            }
            editorContainerWrapper.dispatchEvent(new CustomEvent('pagechange', {
                detail: detail,
                bubbles: true,
                composed: true
            }));
        }
    };

    var oncurrentState;
    
    // ✨ OPTIMIZED: Debounced history with content comparison
    const pushToHistory = (force = false) => {
        const currentPage = pages[currentPageIndex];
        const currentState = {
            content: contentDiv.textContent,
            caret: getCaretPosition(contentDiv, currentPage.lineCache)
        };
        
        // Skip if no actual change
        if (currentPage.history.length > 0) {
            const lastState = currentPage.history[currentPage.history.length-1];
            if (lastState.content === currentState.content &&
                lastState.caret.line === currentState.caret.line &&
                lastState.caret.column === currentState.caret.column) {
                return;
            }
        }
        
        if (historyTimeout) {
            clearTimeout(historyTimeout);
        }
        
        if (force) {
            currentPage.redoStack = [];
            currentPage.history.push(currentState);
            updateUndoRedoButtons();
        } else {
            if(oncurrentState==undefined) {
                oncurrentState=currentState;
            }
            historyTimeout = setTimeout(() => {
                currentPage.redoStack = [];
                currentPage.history.push(oncurrentState);
                oncurrentState=undefined;
                updateUndoRedoButtons();
            }, HISTORY_DEBOUNCE_TIME);
        }
    };

    const applyHistoryState = (state) => {
        const currentPage = pages[currentPageIndex];
        contentDiv.textContent = state.content;
        // ✨ Rebuild line cache when restoring history
        currentPage.lineCache = buildLineCache(state.content);
        updateLineNumbers();
        setCaretPosition(contentDiv, state.caret.line, state.caret.column, null, currentPage.lineCache);
        scrollCaretIntoView(contentDivScroller);
        updateUndoRedoButtons();
    };

    const undo = () => {
        const currentPage = pages[currentPageIndex];
        if (currentPage.history.length > 0) {
            const stateToApply = currentPage.history.pop();
            currentPage.redoStack.push({
                content: contentDiv.textContent,
                caret: getCaretPosition(contentDiv, currentPage.lineCache)
            });
            applyHistoryState(stateToApply);
        }
    };

    const redo = () => {
        const currentPage = pages[currentPageIndex];
        if (currentPage.redoStack.length > 0) {
            const stateToApply = currentPage.redoStack.pop();
            currentPage.history.push({
                content: contentDiv.textContent,
                caret: getCaretPosition(contentDiv, currentPage.lineCache)
            });
            applyHistoryState(stateToApply);
        }
    };

    const selectAll = () => {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(contentDiv);
        selection.removeAllRanges();
        selection.addRange(range);
    };

    // --- Bracket Selector Logic (unchanged, already efficient) ---
    const BRACKET_PAIRS = {
        '{': '}',
        '[': ']',
        '(': ')',
        '<': '>',
        '}': '{',
        ']': '[',
        ')': '(',
        '>': '<'
    };

    const isBracket = (char) => !!BRACKET_PAIRS[char];

    const selectBracketContent = () => {
        const content = contentDiv.textContent;
        const { charIndex } = getCaretPosition(contentDiv, pages[currentPageIndex].lineCache);
        let startCharIndex = -1;
        let endCharIndex = -1;
        let targetBracket = '';

        let checkIndex = charIndex;
        let caretChar = content[checkIndex];
        let prevChar = content[checkIndex - 1];

        if (isBracket(prevChar)) {
            targetBracket = prevChar;
            startCharIndex = checkIndex - 1;
        } else if (isBracket(caretChar)) {
            targetBracket = caretChar;
            startCharIndex = checkIndex;
        } else {
            return;
        }

        const matchingBracket = BRACKET_PAIRS[targetBracket];
        const isOpening = ['{', '[', '(', '<'].includes(targetBracket);
        const searchDirection = isOpening ? 1 : -1;
        let currentCount = 1;
        let currentIndex = startCharIndex + searchDirection;

        while (currentIndex >= 0 && currentIndex < content.length) {
            const currentChar = content[currentIndex];
            if (currentChar === targetBracket) {
                currentCount++;
            } else if (currentChar === matchingBracket) {
                currentCount--;
            }
            if (currentCount === 0) {
                endCharIndex = currentIndex;
                break;
            }
            currentIndex += searchDirection;
        }

        if (endCharIndex !== -1) {
            const selectionStart = Math.min(startCharIndex, endCharIndex);
            const selectionEnd = Math.max(startCharIndex, endCharIndex) + 1;

            setCaretPosition(contentDiv, null, null, selectionStart, pages[currentPageIndex].lineCache);
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            const range = selection.getRangeAt(0);

            let charsCounted = 0;
            let endNode = contentDiv;
            let endOffset = 0;
            let currentNode = contentDiv.firstChild;

            if (!currentNode && selectionEnd === 0) {
                range.setEnd(contentDiv, 0);
            }

            while (currentNode) {
                if (currentNode.nodeType === Node.TEXT_NODE) {
                    const nodeLength = currentNode.length;
                    if (selectionEnd <= charsCounted + nodeLength) {
                        endNode = currentNode;
                        endOffset = selectionEnd - charsCounted;
                        break;
                    }
                    charsCounted += nodeLength;
                } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
                    charsCounted += (currentNode.textContent ? currentNode.textContent.length : 0);
                }
                if (selectionEnd === content.length && !currentNode.nextSibling) {
                    endNode = contentDiv.lastChild || contentDiv;
                    endOffset = endNode.nodeType === Node.TEXT_NODE ? endNode.length : (endNode.childNodes.length || 0);
                }
                currentNode = currentNode.nextSibling;
            }

            if (endNode) {
                const maxOffset = endNode.nodeType === Node.TEXT_NODE ? endNode.length : endNode.childNodes.length;
                range.setEnd(endNode, Math.min(endOffset, maxOffset));
            }

            selection.removeAllRanges();
            selection.addRange(range);
        }
    };

    // --- Clipboard Menu Logic - OPTIMIZED ---
    const toggleClipboardMenu = () => {
        if (clipboardMenu.style.display === 'flex') {
            clipboardMenu.style.display = 'none';
            return;
        }
        
        const buttonRect = clipboardButton.getBoundingClientRect();
        const containerRect = editorContainerWrapper.getBoundingClientRect();
        
        const top = buttonRect.bottom - containerRect.top + 2;
        const left = buttonRect.left - containerRect.left;
        
        clipboardMenu.style.top = `${top}px`;
        clipboardMenu.style.left = `${left}px`;
        clipboardMenu.style.display = 'flex';
        
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!clipboardMenu.contains(e.target) && e.target !== clipboardButton) {
                    clipboardMenu.style.display = 'none';
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 0);
    };

    const clipboardCut = () => {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        
        if (selectedText) {
            copyToClipboard(selectedText);
            range.deleteContents();
            contentDiv.dispatchEvent(new Event('input', { bubbles: true }));
            pushToHistory();
        }
        clipboardMenu.style.display = 'none';
    };

    const clipboardCopy = () => {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        
        if (selectedText) {
            copyToClipboard(selectedText);
        }
        clipboardMenu.style.display = 'none';
    };

    // ✨ OPTIMIZED: Handle large pastes with DocumentFragment
    const clipboardPaste = async () => {
        const text = await getFromClipboard();
        if (!text) return;
        
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        // ✨ Use DocumentFragment for large pastes (>50k chars)
        if (text.length > 50000) {
            const fragment = document.createDocumentFragment();
            fragment.textContent = text;
            range.insertNode(fragment);
            range.setStartAfter(fragment.lastChild || fragment);
            range.collapse(true);
        } else {
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);
        }
        
        selection.removeAllRanges();
        selection.addRange(range);
        
        // ✨ Debounce history push for large pastes
        if (text.length > 10000) {
            setTimeout(() => {
                contentDiv.dispatchEvent(new Event('input', { bubbles: true }));
                pushToHistory(true);
            }, 0);
        } else {
            contentDiv.dispatchEvent(new Event('input', { bubbles: true }));
            pushToHistory();
        }
        clipboardMenu.style.display = 'none';
    };

    const clipboardCopyAll = () => {
        copyToClipboard(contentDiv.textContent);
        clipboardMenu.style.display = 'none';
    };

    const clipboardReplaceAll = async () => {
        const text = await getFromClipboard();
        if (!text) return;
        
        pushToHistory(true);
        
        contentDiv.textContent = text;
        // ✨ Update line cache
        pages[currentPageIndex].lineCache = buildLineCache(text);
        updateLineNumbers();
        setCaretPosition(contentDiv, 1, 1, null, pages[currentPageIndex].lineCache);
        scrollCaretIntoView(contentDivScroller);
        
        clipboardMenu.style.display = 'none';
    };

    const showGoToLineDialog = () => {
        const currentPage = pages[currentPageIndex];
        const currentLine = getCaretPosition(contentDiv, currentPage.lineCache).line;
        goToLineInput.value = currentLine;
        goToLineDialog.style.display = 'flex';
        goToLineInput.focus();
        goToLineInput.select();
    };

    const hideGoToLineDialog = () => {
        goToLineDialog.style.display = 'none';
    };

    const goToLine = () => {
        const lineNumber = parseInt(goToLineInput.value, 10);
        const currentPage = pages[currentPageIndex];
        const totalLines = currentPage.content.split('\n').length;
        if (isNaN(lineNumber) || lineNumber < 1 || lineNumber > totalLines) {
            goToLineInput.focus();
            goToLineInput.select();
            return;
        }
        setCaretPosition(contentDiv, lineNumber, 1, null, currentPage.lineCache);
        scrollCaretIntoView(contentDivScroller);
        hideGoToLineDialog();
        contentDiv.focus();
    };

    const toggleMenu = (menuName) => {
        const allButtonCells = Array.from(menuBar.querySelectorAll('td:not(.code-editor-title-bar)'));
        const mainMenuButtons = [undoButton.parentElement, redoButton.parentElement, selectAllButton.parentElement, selectBracketButton.parentElement, clipboardButton.parentElement, goToLineButton.parentElement, findButton.parentElement, pagesButton.parentElement, runButton.parentElement, saveButton.parentElement, closeButton.parentElement];
        const findMenuButtons = [findInputCell, prevFindCell, nextFindCell, findCloseCell];
        const pagesMenuButtons = [pagesPrevCell, pagesTitleCell, pagesDropdownCell, pagesNextCell, pagesCloseCell];

        allButtonCells.forEach(cell => cell.style.display = 'none');
        titleBarRow.style.display = 'none';

        if (menuName === 'find') {
            findMenuButtons.forEach(cell => cell.style.display = 'table-cell');
            findInput.focus();
            findInput.select();
        } else if (menuName === 'pages') {
            pagesMenuButtons.forEach(cell => cell.style.display = 'table-cell');
            pagesMenuTitleInput.focus();
            pagesMenuTitleInput.select();
        } else {
            mainMenuButtons.forEach(cell => cell.style.display = 'table-cell');
            if (originalTitle) {
                titleBarRow.style.display = '';
            }
            contentDiv.focus();
        }

        if (menuName === 'main') {
            updateButtonVisibility('run');
            updateButtonVisibility('save');
            updateButtonVisibility('close');
        }
    };

    const findNext = () => {
        const query = findInput.value;
        if (!query) return;
        const content = contentDiv.textContent;
        let { charIndex: currentCaretIndex } = getCaretPosition(contentDiv, pages[currentPageIndex].lineCache);
        let startIndex = currentCaretIndex;
        if (content.substring(startIndex, startIndex + query.length) === query) {
            startIndex += query.length;
        }
        let foundIndex = content.indexOf(query, startIndex);
        if (foundIndex === -1) {
            foundIndex = content.indexOf(query, 0);
        }
        if (foundIndex !== -1) {
            setCaretPosition(contentDiv, null, null, foundIndex, pages[currentPageIndex].lineCache);
            scrollCaretIntoView(contentDivScroller);
        }
    };

    const findPrevious = () => {
        const query = findInput.value;
        if (!query) return;
        const content = contentDiv.textContent;
        let { charIndex: currentCaretIndex } = getCaretPosition(contentDiv, pages[currentPageIndex].lineCache);
        let endIndex = currentCaretIndex;
        if (content.substring(currentCaretIndex, currentCaretIndex + query.length) === query) {
            endIndex = currentCaretIndex - 1;
        } else {
            endIndex = currentCaretIndex - 1;
        }
        let foundIndex = content.lastIndexOf(query, endIndex);
        if (foundIndex === -1) {
            foundIndex = content.lastIndexOf(query, content.length);
        }
        if (foundIndex !== -1) {
            setCaretPosition(contentDiv, null, null, foundIndex, pages[currentPageIndex].lineCache);
            scrollCaretIntoView(contentDivScroller);
        }
    };

    const executeAttributeHandler = (handlerCode, scope, ...args) => {
        if (!handlerCode) return;
        try {
            const fn = new Function('event', 'value', handlerCode);
            fn.apply(scope, args);
        } catch (err) {
            console.error("Error executing attribute handler:", handlerCode, err);
        }
    };

    // --- Event Listeners ---
    updateUndoRedoButtons();
    updatePageMenuDropdown();
    pagesMenuTitleInput.value = pages[currentPageIndex].title;
    toggleMenu('main');

    undoButton.addEventListener('click', undo);
    redoButton.addEventListener('click', redo);
    selectAllButton.addEventListener('click', selectAll);
    selectBracketButton.addEventListener('click', selectBracketContent);
    clipboardButton.addEventListener('click', toggleClipboardMenu);
    clipboardCutButton.addEventListener('click', clipboardCut);
    clipboardCopyButton.addEventListener('click', clipboardCopy);
    clipboardPasteButton.addEventListener('click', clipboardPaste);
    clipboardCopyAllButton.addEventListener('click', clipboardCopyAll);
    clipboardReplaceAllButton.addEventListener('click', clipboardReplaceAll);
    goToLineButton.addEventListener('click', showGoToLineDialog);
    goToLineOkButton.addEventListener('click', goToLine);
    goToLineCancelButton.addEventListener('click', hideGoToLineDialog);
    findButton.addEventListener('click', () => toggleMenu('find'));
    findCloseButton.addEventListener('click', () => toggleMenu('main'));
    nextFindButton.addEventListener('click', findNext);
    prevFindButton.addEventListener('click', findPrevious);
    pagesButton.addEventListener('click', () => toggleMenu('pages'));
    pagesCloseButton.addEventListener('click', () => toggleMenu('main'));
    pagesPrevButton.addEventListener('click', () => {
        if (currentPageIndex > 0) {
            switchPage(currentPageIndex - 1);
        }
    });
    pagesNextButton.addEventListener('click', () => {
        if (currentPageIndex < pages.length - 1) {
            switchPage(currentPageIndex + 1);
        } else {
            const newPageTitle = `Untitled ${pages.length + 1}`;
            const newPage = createNewPage('', newPageTitle);
            pages.push(newPage);
            switchPage(pages.length - 1);
        }
    });
    pagesMenuDropdown.addEventListener('change', (e) => switchPage(parseInt(e.target.value, 10)));
    pagesMenuTitleInput.addEventListener('input', (e) => {
        pages[currentPageIndex].title = e.target.value;
        titleTextSpan.textContent = e.target.value;
        updatePageMenuDropdown();
    });
    saveButton.addEventListener('click', (e) => {
        if (_onSaveHandler) {
            try {
                _onSaveHandler.call(editorContainerWrapper, e, editorContainerWrapper.values);
            } catch (err) {
                console.error("Error executing programmatic onsave handler:", err);
            }
        }
        executeAttributeHandler(originalOnSaveAttribute, editorContainerWrapper, e, editorContainerWrapper.values);
        editorContainerWrapper.dispatchEvent(new CustomEvent('save', {
            detail: { values: editorContainerWrapper.values },
            bubbles: true,
            composed: true
        }));
    });
    runButton.addEventListener('click', (e) => {
        if (_onRunHandler) {
            try {
                _onRunHandler.call(editorContainerWrapper, e, editorContainerWrapper.value);
            } catch (err) {
                console.error("Error executing programmatic onrun handler:", err);
            }
        }
        executeAttributeHandler(originalOnRunAttribute, editorContainerWrapper, e, editorContainerWrapper.value);
        editorContainerWrapper.dispatchEvent(new CustomEvent('run', {
            detail: { value: editorContainerWrapper.value },
            bubbles: true,
            composed: true
        }));
    });
    closeButton.addEventListener('click', (e) => {
        if (_onCloseHandler) {
            try {
                _onCloseHandler.call(editorContainerWrapper, e, editorContainerWrapper.value);
            } catch (err) {
                console.error("Error executing programmatic onclose handler:", err);
            }
        }
        executeAttributeHandler(originalOnCloseAttribute, editorContainerWrapper, e, editorContainerWrapper.value);
        editorContainerWrapper.dispatchEvent(new CustomEvent('close', {
            detail: { value: editorContainerWrapper.value },
            bubbles: true,
            composed: true
        }));
    });
    goToLineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            goToLine();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideGoToLineDialog();
            contentDiv.focus();
        }
    });
    findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            findNext();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            toggleMenu('main');
        }
    });
    
    // ✨ OPTIMIZED: Throttled scroll sync with requestAnimationFrame
    contentDivScroller.addEventListener('scroll', () => {
        if (scrollSyncRaf) return;
        scrollSyncRaf = requestAnimationFrame(() => {
            lineNumbersDiv.scrollTop = contentDivScroller.scrollTop;
            // ✨ Also update virtualized line numbers on scroll
            updateLineNumbers();
            scrollSyncRaf = null;
        });
    });
    
    contentDiv.addEventListener('input', (e) => {
        const currentPage = pages[currentPageIndex];
        currentPage.content = contentDiv.textContent;
        // ✨ Rebuild line cache on content change (debounced via updateLineNumbers)
        currentPage.lineCache = buildLineCache(currentPage.content);
        debouncedUpdateLineNumbers(); // ✨ Debounced
        scrollCaretIntoView(contentDivScroller);
        if (e.inputType === 'insertText') {
            lastTypedChar = e.data;
        } else {
            lastTypedChar = '';
        }
        if (_onInputHandler) {
            try {
                _onInputHandler.call(editorContainerWrapper, e, editorContainerWrapper.value);
            } catch (err) {
                console.error("Error executing programmatic oninput handler:", err);
            }
        }
        executeAttributeHandler(originalOnInputAttribute, editorContainerWrapper, e, editorContainerWrapper.value);
        editorContainerWrapper.dispatchEvent(new CustomEvent('input', {
            detail: { value: editorContainerWrapper.value },
            bubbles: true,
            composed: true
        }));
    });
    contentDiv.addEventListener('blur', () => {
        pages[currentPageIndex].content = contentDiv.textContent;
        if (_onChangeHandler) {
            try {
                _onChangeHandler.call(editorContainerWrapper, editorContainerWrapper.value);
            } catch (err) {
                console.error("Error executing programmatic onchange handler:", err);
            }
        }
        executeAttributeHandler(originalOnChangeAttribute, editorContainerWrapper, editorContainerWrapper.value);
        editorContainerWrapper.dispatchEvent(new CustomEvent('change', {
            detail: { value: editorContainerWrapper.value },
            bubbles: true,
            composed: true
        }));
    });
    contentDiv.addEventListener('click', (e) => {
        secLastTypedChar=lastTypedChar='';
    });
    contentDiv.addEventListener('paste', function(event) {
        pushToHistory();
        event.preventDefault();
        const plainText = event.clipboardData.getData('text/plain');
        
        // ✨ Use execCommand for small pastes, manual for large
        if (plainText.length < 10000 && document.execCommand('insertText', false, plainText)) {
            return;
        }
        
        // Fallback for large pastes or restricted environments
        try {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            
            if (plainText.length > 50000) {
                const fragment = document.createDocumentFragment();
                fragment.textContent = plainText;
                const range = selection.getRangeAt(0);
                range.insertNode(fragment);
                range.setStartAfter(fragment.lastChild || fragment);
                range.collapse(true);
            } else {
                const textNode = document.createTextNode(plainText);
                const range = selection.getRangeAt(0);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.collapse(true);
            }
            selection.removeAllRanges();
            selection.addRange(range);
        } catch (error) {
            console.error("Manual text insertion failed:", error);
            document.execCommand('insertText', false, plainText);
        }
    });
    contentDiv.addEventListener('keydown', (e) => {
        pushToHistory();
        if (e.key === 'Tab') {
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            const range = selection.getRangeAt(0);
            range.insertNode(document.createTextNode('\t'));
            range.collapse(false);
            scrollCaretIntoView(contentDivScroller);
            secLastTypedChar=lastTypedChar;
            lastTypedChar = '\t';
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const originalCaret = getCaretPosition(contentDiv, pages[currentPageIndex].lineCache);
            const currentText = contentDiv.textContent;
            let lines = currentText.split('\n');
            const targetLineIndex = originalCaret.line - 1;
            const currentLineContent = lines[targetLineIndex] || '';
            let charIndexInLine = 0;
            let visualColCounter = 0;
            for (let i = 0; i < currentLineContent.length; i++) {
                if (visualColCounter >= originalCaret.column) {
                    charIndexInLine = i;
                    break;
                }
                if (currentLineContent[i] === '\t') {
                    visualColCounter += TAB_SPACES;
                } else {
                    visualColCounter += 1;
                }
                charIndexInLine = i + 1;
            }
            const contentBeforeCaretInLine = currentLineContent.substring(0, charIndexInLine);
            const contentAfterCaretInLine = currentLineContent.substring(charIndexInLine);
            let calculatedIndentLevel = 0;
            const leadingTabsMatch = contentBeforeCaretInLine.match(/^\t*/);
            const leadingTabs = leadingTabsMatch ? leadingTabsMatch[0].length : 0;
            calculatedIndentLevel = leadingTabs;
            const bracketOpenings = (contentBeforeCaretInLine.match(/[{[(]/g) || []).length;
            const bracketClosings = (contentBeforeCaretInLine.match(/[}\])]/g) || []).length;
            if ((['}', ']', ')'].includes(lastTypedChar)
            || ['}', ']', ')'].includes(secLastTypedChar)
            || ['{', '[', '('].includes(contentBeforeCaretInLine[contentBeforeCaretInLine.length-1]) )
            )
            {
                calculatedIndentLevel += (bracketOpenings - bracketClosings);
            }
            const trimmedContentAfterCaret = contentAfterCaretInLine.trim();
            if (trimmedContentAfterCaret.length > 0 && ['}', ']', ')'].includes(trimmedContentAfterCaret.charAt(0))) {
                calculatedIndentLevel = Math.max(0, calculatedIndentLevel - 1);
            }
            const newIndent = '\t'.repeat(Math.max(0, calculatedIndentLevel));
            lines[targetLineIndex] = contentBeforeCaretInLine;
            lines.splice(originalCaret.line, 0, newIndent + contentAfterCaretInLine);
            let shouldDeindentClosingBracket = false;
            if ((['}', ']', ')'].includes(lastTypedChar)
            ||  ['}', ']', ')'].includes(secLastTypedChar))
            && (bracketClosings - bracketOpenings) >0
            && targetLineIndex >= 0) {
                shouldDeindentClosingBracket = true;
            }
            if (shouldDeindentClosingBracket && lines[targetLineIndex] && lines[targetLineIndex].startsWith('\t')) {
                lines[targetLineIndex] = lines[targetLineIndex].substring(1);
            }
            contentDiv.textContent = lines.join('\n');
            const newCaretLine = originalCaret.line + 1;
            const newCaretColumn = newIndent.length * TAB_SPACES;
            // ✨ Use cached line offsets
            const currentPage = pages[currentPageIndex];
            currentPage.lineCache = buildLineCache(contentDiv.textContent);
            setCaretPosition(contentDiv, newCaretLine, newCaretColumn, null, currentPage.lineCache);
            scrollCaretIntoView(contentDivScroller);
            debouncedUpdateLineNumbers(); // ✨ Debounced
            secLastTypedChar=lastTypedChar;
            lastTypedChar = '\n';
            contentDiv.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (['}', ']', ')'].includes(e.key)) {
            secLastTypedChar=lastTypedChar;
            lastTypedChar = e.key;
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            toggleMenu('find');
        } else if (e.key === 'F3') {
            e.preventDefault();
            findNext();
        } else if (e.shiftKey && e.key === 'F3') {
            e.preventDefault();
            findPrevious();
        } else {
            secLastTypedChar=lastTypedChar;
            lastTypedChar = '';
        }
    });
    beautifyButton.addEventListener('click', () => {
        const originalScrollTop = contentDivScroller.scrollTop;
        const originalScrollLeft = contentDivScroller.scrollLeft;
        const lines = contentDiv.textContent.split('\n');
        let beautifiedLines = [];
        let currentIndentLevel = 0;
        var isAtStr= false;
        var atStrChar;
        var isAtMultiComment=false;
        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.length === 0) {
                beautifiedLines.push('');
                return;
            }
            var skipBracket=0;
            if (!isAtStr&&!isAtMultiComment&&trimmedLine.length > 0 && (trimmedLine.startsWith('}') || trimmedLine.startsWith(']') || trimmedLine.startsWith(')'))) {
                currentIndentLevel = Math.max(0, currentIndentLevel - 1);
                skipBracket=1;
            }
            if(isAtMultiComment)
            {
                beautifiedLines.push(line);
            }
            else
            {
                const indent = '\t'.repeat(currentIndentLevel);
                beautifiedLines.push(indent + trimmedLine);
            }
            var strLen= trimmedLine.length;
            for(var i = skipBracket; i < strLen;i++)
            {
                var c=trimmedLine[i];
                if(isAtStr)
                {
                    if (c === atStrChar && (i === 0 || trimmedLine[i - 1] !== '\\')) {
                        isAtStr = false;
                    }
                }
                else if(isAtMultiComment)
                {
                    if(c=='*'&&i+1<strLen&&trimmedLine[i+1]=='/')
                    {
                        isAtMultiComment=false;
                        i++;
                    }
                }
                else
                {
                    if(c=="'"||c=='"'||c=="`")
                    {
                        isAtStr=true;
                        atStrChar=c;
                    }
                    else if(c=='/'&&i+1<strLen&&trimmedLine[i+1]=='/')
                    {
                        break;
                    }
                    else if(c=='/'&&i+1<strLen&&trimmedLine[i+1]=='*')
                    {
                        isAtMultiComment=true;
                        i++;
                    }
                    else if(c=='{' || c=='[' || c=='(')
                    {
                        currentIndentLevel++;
                    }
                    else if(c=='}' || c==']' || c==')')
                    {
                        currentIndentLevel = Math.max(0, currentIndentLevel-1);
                    }
                }
            }
            currentIndentLevel = Math.max(0, currentIndentLevel);
        });
        const originalCaretPos = getCaretPosition(contentDiv, pages[currentPageIndex].lineCache);
        contentDiv.textContent = beautifiedLines.join('\n');
        // ✨ Rebuild cache after beautify
        pages[currentPageIndex].lineCache = buildLineCache(contentDiv.textContent);
        debouncedUpdateLineNumbers(); // ✨ Debounced
        setCaretPosition(contentDiv, originalCaretPos.line, originalCaretPos.column, null, pages[currentPageIndex].lineCache);
        scrollCaretIntoView(contentDivScroller);
        contentDiv.dispatchEvent(new Event('input', { bubbles: true }));
        contentDivScroller.scrollTop = originalScrollTop;
        contentDivScroller.scrollLeft = originalScrollLeft;
    });

    // ✨ OPTIMIZED: ResizeObserver with debounced line update
    const resizeObserver = new ResizeObserver(entries => {
        debouncedUpdateLineNumbers();
        scrollCaretIntoView(contentDivScroller);
    });
    resizeObserver.observe(editorContainerWrapper);
    resizeObserver.observe(contentDiv);

    return editorContainerWrapper;
}

/**
 * Public function to create a new code editor programmatically.
 * @param {string|Array<Object>} initialContent - The initial text content or an array of page objects.
 * @returns {HTMLElement} The DOM element representing the code editor.
 */
export function createTexCode(initialContent = '') {
    return setupCodeEditorInstance(initialContent);
}

// --- DOM Observation for <textcode> tags ---
function observeTextcodeElements() {
    document.querySelectorAll('textcode').forEach(textcodeElement => {
        let initialContent = textcodeElement.textContent.trim();
        const pagesAttribute = textcodeElement.getAttribute('pages');
        if (pagesAttribute) {
            try {
                initialContent = JSON.parse(pagesAttribute);
            } catch (e) {
                console.error("Invalid 'pages' attribute JSON:", e);
                initialContent = textcodeElement.textContent.trim();
            }
        }
        const parentContainer = textcodeElement.parentNode;
        if (parentContainer) {
            const editorDom = setupCodeEditorInstance(initialContent, textcodeElement);
            parentContainer.replaceChild(editorDom, textcodeElement);
        } else {
            console.warn("Found <textcode> element without a parent, cannot convert:", textcodeElement);
        }
    });

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.tagName === 'TEXTCODE') {
                        let initialContent = node.textContent.trim();
                        const pagesAttribute = node.getAttribute('pages');
                        if (pagesAttribute) {
                            try {
                                initialContent = JSON.parse(pagesAttribute);
                            } catch (e) {
                                console.error("Invalid 'pages' attribute JSON:", e);
                                initialContent = node.textContent.trim();
                            }
                        }
                        const parentContainer = node.parentNode;
                        if (parentContainer) {
                            const editorDom = setupCodeEditorInstance(initialContent, node);
                            parentContainer.replaceChild(editorDom, node);
                        }
                    } else if (node.nodeType === 1) {
                        node.querySelectorAll('textcode').forEach(textcodeElement => {
                            let initialContent = textcodeElement.textContent.trim();
                            const pagesAttribute = textcodeElement.getAttribute('pages');
                            if (pagesAttribute) {
                                try {
                                    initialContent = JSON.parse(pagesAttribute);
                                } catch (e) {
                                    console.error("Invalid 'pages' attribute JSON:", e);
                                    initialContent = textcodeElement.textContent.trim();
                                }
                            }
                            const parentContainer = textcodeElement.parentNode;
                            if (parentContainer) {
                                const editorDom = setupCodeEditorInstance(initialContent, textcodeElement);
                                parentContainer.replaceChild(editorDom, textcodeElement);
                            }
                        });
                    }
                });
            }
        });
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

document.addEventListener('DOMContentLoaded', () => {
    observeTextcodeElements();
});