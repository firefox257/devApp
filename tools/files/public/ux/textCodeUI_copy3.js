// ./ux/textCodeUI.js

// --- Constants ---
export const TAB_SPACES = 4;
export const LINE_HEIGHT_EM = 1.5;
export const HISTORY_DEBOUNCE_TIME = 300;

// --- Module-level Variables ---
export let stylesInjected = false;

// --- Dynamic Style Injection ---
export function injectStyles() {
    if (stylesInjected) return;

    const style = document.createElement('style');
    style.id = 'code-editor-styles';
    style.textContent = `
        /* Material Icons Font Face */
        @font-face {
            font-family: 'Material Icons';
            font-style: normal;
            font-weight: 400;
            src: url('/fonts/MaterialIcons-Regular.ttf') format('truetype');
            font-display: block;
        }

        /* Material Icon Base Class */
        .material-icon {
            font-family: 'Material Icons';
            font-weight: normal;
            font-style: normal;
            font-size: 1.1em;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
        }

        /* Semantic Color Classes */
        .icon-primary { color: #007bff !important; }
        .icon-secondary { color: #6c757d !important; }
        .icon-destructive { color: #dc3545 !important; }
        .icon-success { color: #28a745 !important; }
        .icon-warning { color: #fd7e14 !important; }
        .icon-directory { color: #ffc107 !important; }
        .icon-navigation { color: #17a2b8 !important; }
        .icon-ai { color: #6f42c1 !important; }

        /* Main container */
        .code-editor-container-wrapper {
            position: relative;
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            overflow: hidden;
            border: 1px solid #ccc;
        }

        /* Menu bar table */
        .code-editor-menu-bar {
            width: 100%;
            border-collapse: collapse;
            background-color: #f8f8f8;
            table-layout: fixed;
            border-bottom: 1px solid #eee;
            flex-shrink: 0;
        }

        /* Title Bar */
        .code-editor-title-bar {
            background-color: #e9e9e9;
            font-weight: bold;
            color: #333;
            padding: 2px 10px;
            text-align: right;
            vertical-align: middle;
            border-bottom: 1px solid #ddd;
            box-sizing: border-box;
            height: 24px;
            display: table-cell;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            direction: rtl;
        }

        .code-editor-title-bar .title-text {
            display: inline-block;
            direction: ltr;
            white-space: nowrap;
        }

        .code-editor-menu-bar td {
            border: 1px solid #ddd;
            text-align: center;
            vertical-align: middle;
            padding: 0;
            width: 1%;
        }

        .code-editor-menu-bar .find-input-cell {
            width: 160px;
            display: table-cell;
        }

        .code-editor-menu-bar input.find-input {
            width: 100%;
            padding: 2px 5px;
            box-sizing: border-box;
            border: 1px solid #ccc;
            outline: none;
            font-size: 14px;
        }

        /* Menu bar buttons with Material Icons - Aligned */
        .code-editor-menu-bar button {
            background-color: transparent;
            border: none;
            color: #555;
            padding: 0;
            margin: 0;
            cursor: pointer;
            border-radius: 0;
            font-size: 1em;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s, border-color 0.2s;
            line-height: 1;
            height: 24px;
            box-sizing: border-box;
            width: 100%;
            gap: 4px;
        }

        .code-editor-menu-bar button .material-icon {
            font-size: 1.2em;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
        }

        .code-editor-menu-bar button:hover:not(:disabled) {
            background-color: #e0e0e0;
            border-color: #ccc;
        }

        .code-editor-menu-bar button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Editor wrapper */
        .code-editor-wrapper {
            display: flex;
            flex-grow: 1;
            font-family: 'Fira Code', 'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
            font-size: 14px;
            line-height: ${LINE_HEIGHT_EM};
            overflow: hidden;
        }

        /* Line numbers */
        .code-editor-line-numbers {
            flex-shrink: 0;
            text-align: right;
            padding: 10mm 0 200vh 0;
            background-color: #f0f0f0;
            color: #888;
            user-select: none;
            overflow-y: hidden;
            box-sizing: border-box;
        }

        .code-editor-line-numbers > div {
            height: ${LINE_HEIGHT_EM}em;
            line-height: ${LINE_HEIGHT_EM}em;
            padding: 0 10px;
        }

        /* Content scroller */
        .code-editor-content-scroller {
            flex-grow: 1;
            padding: 0;
            overflow: auto;
            background-color: #ffffff;
        }

        /* Editable content */
        .code-editor-content {
            margin: 0;
            padding: 0;
            outline: none;
            display: inline-block;
            background-color: #ffffff;
            color: #000000;
            tab-size: ${TAB_SPACES};
            -moz-tab-size: ${TAB_SPACES};
            white-space: pre;
            word-break: normal;
            box-sizing: border-box;
            caret-color: red;
            caret-shape: block;
            min-width: 100vw;
            min-height: 100vh;
        }

        .code-editor-content > div {
            padding: 0 10px;
        }

        /* ✨ Circular Beautify Button with Border Circle */
        .code-editor-beautify-button-container {
            position: absolute;
            top: 48px;
            right: 10px;
            z-index: 10;
        }

        .code-editor-beautify-button-container button {
            background-color: transparent;
            color: #007bff;
            border: 2px solid #007bff;
            width: 40px;
            height: 40px;
            padding: 0;
            cursor: pointer;
            border-radius: 50%;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            font-size: 1em;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .code-editor-beautify-button-container button .material-icon {
            font-size: 1.4em;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
        }

        .code-editor-beautify-button-container button:hover {
            background-color: #007bff;
            color: white;
            transform: scale(1.1);
            box-shadow: 0 4px 10px rgba(0,123,255,0.4);
        }

        .code-editor-beautify-button-container button:active {
            transform: scale(0.95);
        }

        /* Go to Line dialog */
        .code-editor-goto-dialog {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #fff;
            border: 1px solid #ccc;
            padding: 15px;
            border-radius: 5px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
            z-index: 20;
            display: none;
            flex-direction: column;
            gap: 10px;
            min-width: 200px;
        }

        .code-editor-goto-dialog input[type="number"] {
            width: calc(100% - 12px);
            padding: 6px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-size: 1em;
            box-sizing: border-box;
        }

        .code-editor-goto-dialog-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 5px;
        }

        .code-editor-goto-dialog-buttons button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        .code-editor-goto-dialog-buttons button.cancel {
            background-color: #6c757d;
        }

        .code-editor-goto-dialog-buttons button:hover {
            background-color: #0056b3;
        }

        .code-editor-goto-dialog-buttons button.cancel:hover {
            background-color: #5a6268;
        }

        /* Pages menu input */
        .code-editor-menu-bar .pages-menu-title-input {
            width: 100%;
            padding: 2px 5px;
            box-sizing: border-box;
            border: 1px solid #ccc;
            outline: none;
            font-size: 14px;
        }

        /* Clipboard Dropdown Menu */
        .code-editor-clipboard-menu {
            position: absolute;
            background-color: #fff;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 15;
            display: none;
            flex-direction: column;
            min-width: 180px;
            padding: 4px 0;
        }

        .code-editor-clipboard-menu button {
            background: none;
            border: none;
            padding: 8px 12px;
            text-align: left;
            cursor: pointer;
            font-size: 14px;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            box-sizing: border-box;
        }

        .code-editor-clipboard-menu button .material-icon {
            font-size: 1.1em;
            width: 20px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .code-editor-clipboard-menu button:hover {
            background-color: #f0f0f0;
        }

        .code-editor-clipboard-menu button:active {
            background-color: #e0e0e0;
        }
    `;
    document.head.appendChild(style);
    stylesInjected = true;
}

/**
 * Gets the current line and column (visual, considering tabs) of the caret within an editable div.
 */
export function getCaretPosition(editableDiv) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return { line: 1, column: 1, charIndex: 0 };

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editableDiv);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    const currentText = preCaretRange.toString();
    const lines = currentText.split('\n');

    const line = lines.length;
    let column = 0;
    const currentLineContent = lines[lines.length - 1] || '';

    for (let i = 0; i < currentLineContent.length; i++) {
        if (currentLineContent[i] === '\t') {
            column += TAB_SPACES;
        } else {
            column += 1;
        }
    }

    let charIndex = 0;
    for (let i = 0; i < lines.length - 1; i++) {
        charIndex += lines[i].length + 1;
    }
    charIndex += currentLineContent.length;

    return { line, column, charIndex };
}

/**
 * Sets the caret position within an editable div to a specific line and column (visual).
 */
export function setCaretPosition(editableDiv, line, column, charIndex = null) {
    const textContent = editableDiv.textContent;
    const lines = textContent.split('\n');
    let targetCharIndex = 0;

    if (charIndex !== null) {
        targetCharIndex = Math.min(charIndex, textContent.length);
    } else {
        for (let i = 0; i < line - 1 && i < lines.length; i++) {
            targetCharIndex += lines[i].length + 1;
        }

        let targetLineContent = '';
        if (line > lines.length) {
            targetLineContent = lines[lines.length - 1] || '';
            targetCharIndex = textContent.length;
        } else {
            targetLineContent = lines[line - 1] || '';
        }

        let currentVisualCol = 0;
        let targetCharIndexInLine = 0;
        for (let i = 0; i < targetLineContent.length; i++) {
            if (currentVisualCol >= column) {
                targetCharIndexInLine = i;
                break;
            }
            if (targetLineContent[i] === '\t') {
                currentVisualCol += TAB_SPACES;
            } else {
                currentVisualCol += 1;
            }
            targetCharIndexInLine = i + 1;
        }
        targetCharIndex += targetCharIndexInLine;
    }

    targetCharIndex = Math.min(targetCharIndex, textContent.length);

    const range = document.createRange();
    const selection = window.getSelection();

    let currentNode = editableDiv.firstChild;
    let charsCounted = 0;

    while (currentNode) {
        if (currentNode.nodeType === Node.TEXT_NODE) {
            const nodeLength = currentNode.length;
            if (targetCharIndex <= charsCounted + nodeLength) {
                range.setStart(currentNode, targetCharIndex - charsCounted);
                range.setEnd(currentNode, targetCharIndex - charsCounted);
                break;
            }
            charsCounted += nodeLength;
        } else if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.textContent !== undefined) {
            charsCounted += currentNode.textContent.length;
            if (targetCharIndex <= charsCounted) {
                range.setStart(currentNode, Math.max(0, targetCharIndex - (charsCounted - currentNode.textContent.length)));
                range.setEnd(currentNode, Math.max(0, targetCharIndex - (charsCounted - currentNode.textContent.length)));
                break;
            }
        }
        currentNode = currentNode.nextSibling;
    }

    if (!currentNode && editableDiv.firstChild) {
        range.setStart(editableDiv.firstChild, 0);
        range.setEnd(editableDiv.firstChild, 0);
    } else if (!editableDiv.firstChild) {
        range.setStart(editableDiv, 0);
        range.setEnd(editableDiv, 0);
    }

    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Scrolls the caret into the visible area of the editor.
 */
export function scrollCaretIntoView(editableDiv) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    let caretRect;
    try {
        caretRect = range.getBoundingClientRect();
    } catch (e) {
        const tempRange = document.createRange();
        const startNode = range.startContainer;
        const startOffset = range.startOffset;

        if (startNode.nodeType === Node.TEXT_NODE && startOffset > 0) {
            tempRange.setStart(startNode, startOffset - 1);
            tempRange.setEnd(startNode, startOffset);
        } else if (startNode.nodeType === Node.ELEMENT_NODE && startNode.childNodes.length > 0) {
            const childIndex = Math.max(0, startOffset - 1);
            if (startNode.childNodes[childIndex]) {
                tempRange.selectNode(startNode.childNodes[childIndex]);
            } else {
                tempRange.selectNode(editableDiv);
            }
        } else {
            tempRange.selectNode(editableDiv);
        }
        caretRect = tempRange.getBoundingClientRect();
    }

    const editorRect = editableDiv.getBoundingClientRect();

    if (caretRect.bottom > editorRect.bottom) {
        editableDiv.scrollTop += (caretRect.bottom - editorRect.bottom);
    } else if (caretRect.top < editorRect.top) {
        editableDiv.scrollTop -= (editorRect.top - caretRect.top);
    }

    if (caretRect.right > editorRect.right) {
        editableDiv.scrollLeft += (caretRect.right - editorRect.right);
    } else if (caretRect.left < editorRect.left) {
        editableDiv.scrollLeft -= (editorRect.left - caretRect.left);
    }
}

/**
 * Copies text to the clipboard
 */
export function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy to clipboard:', err);
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
        } catch (e) {
            console.error('Fallback copy failed:', e);
        }
        document.body.removeChild(textArea);
    });
}

/**
 * Gets text from the clipboard
 */
export async function getFromClipboard() {
    try {
        return await navigator.clipboard.readText();
    } catch (err) {
        console.error('Failed to read from clipboard:', err);
        return '';
    }
}

/**
 * The HTML template for the code editor's DOM structure.
 * Updated with Material Icons ligatures and semantic color classes.
 */
export const editorHtml = `
    <table class="code-editor-menu-bar">
        <tbody>
            <tr class="code-editor-title-bar-row">
                <td class="code-editor-title-bar" colspan="10">
                    <span class="title-text"></span>
                </td>
            </tr>
            <tr>
                <td><button class="undo-btn" title="Undo" disabled><span class="material-icon icon-secondary" aria-hidden="true">undo</span></button></td>
                <td><button class="redo-btn" title="Redo" disabled><span class="material-icon icon-secondary" aria-hidden="true">redo</span></button></td>
                <td><button class="select-all-btn" title="Select All"><span class="material-icon icon-primary" aria-hidden="true">select_all</span></button></td>
                <td><button class="select-bracket-btn" title="Select Bracket Content"><span class="material-icon icon-secondary" aria-hidden="true">code</span></button></td>
                <td><button class="clipboard-btn" title="Clipboard"><span class="material-icon icon-primary" aria-hidden="true">content_copy</span></button></td>
                <td><button class="goto-btn" title="Go to Line"><span class="material-icon icon-secondary" aria-hidden="true">arrow_upward</span></button></td>
                <td><button class="find-btn" title="Find Text (Ctrl+F)"><span class="material-icon icon-secondary" aria-hidden="true">search</span></button></td>
                <td><button class="pages-btn" title="Pages"><span class="material-icon icon-primary" aria-hidden="true">article</span></button></td>
                <td style="display: none;"><button class="run-btn" title="Run Code"><span class="material-icon icon-success" aria-hidden="true">play_arrow</span></button></td>
                <td style="display: none;"><button class="save-btn" title="Save"><span class="material-icon icon-warning" aria-hidden="true">save</span></button></td>
                <td style="display: none;"><button class="close-btn" title="Close Editor"><span class="material-icon icon-destructive" aria-hidden="true">close</span></button></td>
                <td colspan="4" class="find-input-cell" style="display: none;width:60px;"><input type="text" placeholder="Find..." class="find-input" ></td>
                <td style="display: none;"><button class="find-prev-btn" title="Previous"><span class="material-icon icon-secondary" aria-hidden="true">arrow_back</span></button></td>
                <td style="display: none;"><button class="find-next-btn" title="Next"><span class="material-icon icon-secondary" aria-hidden="true">arrow_forward</span></button></td>
                <td style="display: none;"><button class="find-close-btn" title="Close Find"><span class="material-icon icon-destructive" aria-hidden="true">close</span></button></td>
                <td style="display: none;"><button class="pages-prev-btn" title="Previous Page"><span class="material-icon icon-secondary" aria-hidden="true">arrow_back</span></button></td>
                <td style="display: none;" colspan="2"><input type="text" placeholder="Page Title" class="pages-menu-title-input"></td>
                <td style="display: none;" colspan="2"><select class="pages-menu-dropdown"></select></td>
                <td style="display: none;"><button class="pages-next-btn" title="Next Page"><span class="material-icon icon-secondary" aria-hidden="true">arrow_forward</span></button></td>
                <td style="display: none;"><button class="pages-close-btn" title="Close Pages Menu"><span class="material-icon icon-destructive" aria-hidden="true">close</span></button></td>
            </tr>
        </tbody>
    </table>
    <div class="code-editor-wrapper">
        <div class="code-editor-line-numbers"></div>
        <div class="code-editor-content-scroller">
            <span style="font-size:0; height:10mm; width:2000%; display:flex;padding:0; margin:0;border:0;"></span>
            <div class="code-editor-content" contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off"></div>
            <span style="height:100vh; width:2000%; display:inline-block;"></span>
        </div>
    </div>
    
    <!-- ✨ Circular Beautify Button with Border Circle -->
    <div class="code-editor-beautify-button-container">
        <button class="beautify-btn" title="Beautify Code">
            <span class="material-icon icon-primary" aria-hidden="true">sparkles</span>
        </button>
    </div>
    
    <div class="code-editor-goto-dialog">
        <span>Go to Line:</span>
        <input type="number" min="1" value="1" />
        <div class="code-editor-goto-dialog-buttons">
            <button class="goto-ok">Go</button>
            <button class="cancel">Cancel</button>
        </div>
    </div>
    
    <!-- Clipboard Menu with Material Icons & Colors -->
    <div class="code-editor-clipboard-menu">
        <button class="clipboard-cut" title="Cut"><span class="material-icon icon-warning" aria-hidden="true">content_cut</span> Cut</button>
        <button class="clipboard-copy" title="Copy"><span class="material-icon icon-primary" aria-hidden="true">content_copy</span> Copy</button>
        <button class="clipboard-paste" title="Paste"><span class="material-icon icon-primary" aria-hidden="true">content_paste</span> Paste</button>
        <button class="clipboard-copy-all" title="Copy All Text"><span class="material-icon icon-primary" aria-hidden="true">content_copy</span> Copy All</button>
        <button class="clipboard-replace-all" title="Replace All with Clipboard"><span class="material-icon icon-warning" aria-hidden="true">autorenew</span> Replace All</button>
    </div>
`;