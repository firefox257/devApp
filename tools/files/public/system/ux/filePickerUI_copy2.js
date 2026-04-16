// ./system/ux/filePickerUI.js

// --- Constants ---
const LINE_HEIGHT_EM = 1.5;
const HISTORY_DEBOUNCE_TIME = 300;

// --- Module-level Variables ---
let stylesInjected = false;

// --- Dynamic Style Injection ---
/**
 * Injects necessary CSS styles for the file picker into the document head.
 * Ensures styles are injected only once.
 * v2.7+ UPDATE: Uses system variable fallbacks for theme compatibility.
 */
export function injectStyles() {
    if (stylesInjected) return;

    const style = document.createElement('style');
    style.id = 'file-picker-styles';
    
    style.textContent = `
    /* ===== MATERIAL ICONS BASE STYLES (NO @font-face - OS handles fonts) ===== */
    
    .material-icons {
        font-family: 'Material Icons', 'Material Icons Round', sans-serif;
        font-weight: normal;
        font-style: normal;
        font-size: 1.1em;
        line-height: 1;
        letter-spacing: normal;
        text-transform: none;
        display: inline-block;
        white-space: nowrap;
        word-wrap: normal;
        direction: ltr;
        vertical-align: middle;
        -webkit-font-feature-settings: 'liga';
        -webkit-font-smoothing: antialiased;
        user-select: none;
        cursor: inherit;
    }

    .material-icons-sm {
        font-size: 1em;
        vertical-align: text-bottom;
    }

    .material-icons-lg {
        font-size: 1.3em;
    }

    /* ===== MATERIAL ICONS COLOR CODING (with system variable fallbacks) ===== */
    
    /* File Type Icons */
    .material-icons.icon-folder {
        color: var(--system-accent, var(--mi-fp-icon-folder, #FFB300));
    }
    
    .material-icons.icon-file {
        color: var(--system-info, var(--mi-fp-icon-file, #1976D2));
    }
    
    .material-icons.icon-up-dir {
        color: var(--system-info, var(--mi-fp-icon-up-dir, #0288D1));
    }
    
    /* Toolbar Action Icons - Mapped to semantic system colors */
    .material-icons.icon-create,
    .material-icons.icon-paste,
    .material-icons.icon-download,
    .material-icons.icon-confirm {
        color: var(--system-success, var(--mi-fp-action-create, #388E3C));
    }
    
    .material-icons.icon-rename,
    .material-icons.icon-copy,
    .material-icons.icon-upload,
    .material-icons.icon-refresh {
        color: var(--system-info, var(--mi-fp-action-rename, #1976D2));
    }
    
    .material-icons.icon-cut {
        color: var(--system-warning, var(--mi-fp-action-cut, #F57C00));
    }
    
    .material-icons.icon-delete {
        color: var(--system-danger, var(--mi-fp-action-delete, #D32F2F));
    }
    
    .material-icons.icon-cancel {
        color: var(--system-text-dim, var(--mi-fp-action-cancel, #757575));
    }
    
    /* Hover States - Brighten using system highlight */
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-folder,
    .file-picker-list-table .file-icon .material-icons.icon-folder:hover {
        color: var(--system-highlight, var(--mi-fp-icon-folder-hover, #FFC107));
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-file,
    .file-picker-list-table .file-icon .material-icons.icon-file:hover {
        color: var(--system-highlight, var(--mi-fp-icon-file-hover, #2196F3));
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-up-dir {
        color: var(--system-highlight, var(--mi-fp-icon-up-dir-hover, #03A9F4));
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-create,
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-paste,
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-download,
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-confirm {
        color: var(--system-success, var(--mi-fp-action-create-hover, #4CAF50));
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-rename,
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-copy,
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-upload,
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-refresh {
        color: var(--system-info, var(--mi-fp-action-rename-hover, #2196F3));
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-cut {
        color: var(--system-warning, var(--mi-fp-action-cut-hover, #FF9800));
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-delete {
        color: var(--system-danger, var(--mi-fp-action-delete-hover, #F44336));
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-cancel {
        color: var(--system-text, var(--mi-fp-action-cancel-hover, #9E9E9E));
    }
    
    /* Disabled State - Use system dimmed text */
    .file-picker-menu-bar button:disabled .material-icons {
        color: var(--system-text-dim, var(--mi-fp-icon-disabled, #BDBDBD)) !important;
    }
    /* ===== END MATERIAL ICONS COLOR CODING ===== */

    /* ===== CORE CONTAINER (with system variable fallbacks) ===== */
    .file-picker-container-wrapper {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border: 1px solid var(--system-border, var(--mi-fp-border, #ccc));
        font-family: var(--system-font, 'Fira Code', 'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace);
        font-size: 14px;
        line-height: ${LINE_HEIGHT_EM};
        box-sizing: border-box;
        background: var(--system-window-bg, var(--mi-fp-bg-container, #ffffff));
        color: var(--system-text, var(--mi-fp-text-primary, #000000));
        border-radius: var(--system-radius, 4px);
        box-shadow: var(--system-shadow, 0 2px 8px rgba(0,0,0,0.1));
    }
    
    /* Global box-sizing for descendants */
    .file-picker-container-wrapper * {
        box-sizing: border-box;
    }

    /* ===== TITLE BAR & HEADERS ===== */
    .file-picker-title-bar {
        background: var(--system-header-bg, var(--mi-fp-bg-titlebar, #333));
        color: var(--system-text-on-accent, var(--mi-fp-text-on-titlebar, #fff));
        padding: 4px 8px;
        font-weight: bold;
        flex-shrink: 0;
        overflow: hidden;
        white-space: nowrap;
        display: flex;
        align-items: center;
        justify-content: flex-start; 
    }
    .file-picker-title-bar span {
        flex-grow: 1;
        direction: rtl;
        text-align: left;
        text-overflow: ellipsis; 
        overflow: hidden;
        white-space: nowrap;
    }

    .file-picker-menu-bar {
        width: 100%;
        border-collapse: collapse;
        background: var(--system-header-bg, var(--mi-fp-bg-menubar, #f8f8f8));
        border-bottom: 1px solid var(--system-border, var(--mi-fp-border, #eee));
        flex-shrink: 0;
        display: table;
        table-layout: fixed;
    }

    .file-picker-menu-bar tr { display: table-row; }
    .file-picker-menu-bar td {
        border: 1px solid var(--system-border, var(--mi-fp-border, #ddd));
        text-align: center;
        vertical-align: middle;
        padding: 0;
        display: table-cell;
    }

    .file-picker-menu-bar button {
        background-color: transparent;
        border: none;
        color: var(--system-text, var(--mi-fp-text-secondary, #555));
        padding: 0 6px;
        margin: 0;
        cursor: pointer;
        border-radius: 0;
        font-size: 1em;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: background-color 0.2s, border-color 0.2s;
        line-height: 1;
        height: 24px;
        box-sizing: border-box;
        width: 100%;
    }

    .file-picker-menu-bar button:hover:not(:disabled) {
        background: var(--system-border-hover, var(--mi-fp-hover-bg, #e0e0e0));
        border-color: var(--system-border, var(--mi-fp-border-hover, #ccc));
    }

    .file-picker-menu-bar button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Path display and refresh button */
    .file-picker-path-display {
        display: flex;
        align-items: center;
        padding: 2px 5px;
        background: var(--system-header-bg, var(--mi-fp-bg-pathbar, #e9e9e9));
        border-bottom: 1px solid var(--system-border, var(--mi-fp-border, #ddd));
        flex-shrink: 0;
        height: 24px;
        box-sizing: border-box;
        font-weight: bold;
    }
    .file-picker-current-path {
        flex-grow: 1;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        padding-right: 5px;
    }
    .file-picker-refresh-button {
        background-color: transparent;
        border: none;
        color: var(--system-text, var(--mi-fp-text-secondary, #555));
        cursor: pointer;
        font-size: 1em;
        padding: 0 5px;
        height: 100%;
        display: flex;
        align-items: center;
    }
    .file-picker-refresh-button:hover {
        background: var(--system-border-hover, var(--mi-fp-hover-bg, #e0e0e0));
    }

    /* ===== FILE LIST AREA ===== */
    .file-picker-list-container {
        flex-grow: 1;
        overflow-y: auto;
        background: var(--system-window-bg, var(--mi-fp-bg-list, #ffffff));
        color: var(--system-text, var(--mi-fp-text-primary, #000000));
    }

    .file-picker-list-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
    }

    .file-picker-list-table th,
    .file-picker-list-table td {
        padding: 4px 8px;
        text-align: left;
        border-bottom: 1px solid var(--system-border, var(--mi-fp-border, #eee));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: middle;
    }

    .file-picker-list-table th {
        background: var(--system-header-bg, var(--mi-fp-bg-header, #f0f0f0));
        font-weight: bold;
        color: var(--system-text, var(--mi-fp-text-primary, #333));
        position: sticky;
        top: 0;
        z-index: 1;
    }

    .file-picker-list-table tr:hover {
        background: var(--system-border-hover, var(--mi-fp-row-hover, rgba(0,120,212,0.08)));
    }

    /* ===== COLUMN LAYOUT FIXES ===== */
    .file-picker-list-table td:nth-child(1) { 
        width: 36px; 
        text-align: center; 
        padding: 4px 2px;
    } 
    
    .file-picker-list-table th:nth-child(2),
    .file-picker-list-table td:nth-child(2) {
        width: 35px;
        text-align: center !important;
        padding: 2px 4px !important;
    }

    .file-picker-list-table th:nth-child(3),
    .file-picker-list-table td:nth-child(3) {
        width: auto;
        text-align: left !important;
        padding-left: 4px !important;
    }
    
    .file-picker-list-table td:nth-child(4) { 
        width: 80px; 
        text-align: right; 
    }

    .file-picker-list-table .file-name,
    .file-picker-list-table .up-directory {
        cursor: pointer;
        color: var(--system-accent, var(--mi-fp-link-color, #007bff));
        text-decoration: none;
        text-align: left !important;
    }

    .file-picker-list-table .file-name:hover,
    .file-picker-list-table .up-directory:hover {
        text-decoration: underline;
    }
    
    .file-picker-list-table .file-icon {
        font-size: 1.1em;
        vertical-align: middle;
    }

    .file-picker-list-table .file-checkbox {
        margin: 0;
        vertical-align: middle;
        cursor: pointer;
    }
    
    /* ===== DIALOG OVERLAY (container-relative) ===== */
    .file-picker-dialog-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    /* ===== POPUP (container-relative, centered) ===== */
    .file-picker-popup-contained {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--system-success, var(--mi-fp-popup-success-bg, #4CAF50));
        color: var(--system-text-on-accent, white);
        padding: 10px 20px;
        border-radius: var(--system-radius, 5px);
        box-shadow: var(--system-shadow, 0 4px 20px rgba(0,0,0,0.25));
        z-index: 1002;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.25s ease, visibility 0.25s ease;
        pointer-events: none;
        max-width: 90%;
        text-align: center;
        font-weight: 500;
    }

    .file-picker-popup-contained.show {
        opacity: 1;
        visibility: visible;
    }

    .file-picker-popup-contained.error {
        background: var(--system-danger, var(--mi-fp-popup-error-bg, #f44336));
    }

    /* ===== GLOBAL POPUP (viewport-centered fallback) ===== */
    .file-picker-popup {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--system-success, #4CAF50);
        color: var(--system-text-on-accent, white);
        padding: 10px 20px;
        border-radius: var(--system-radius, 5px);
        box-shadow: var(--system-shadow, 0 2px 10px rgba(0,0,0,0.2));
        z-index: 99999999999999;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s ease-in-out, visibility 0.3s ease-in-out;
    }

    .file-picker-popup.show {
        opacity: 1;
        visibility: visible;
    }

    .file-picker-popup.error {
        background: var(--system-danger, #f44336);
    }

    /* ===== CONFIRMATION DIALOG ===== */
    .file-picker-confirm-dialog {
        background: var(--system-menu-bg, var(--mi-fp-dialog-bg, #fff));
        border: 1px solid var(--system-border, var(--mi-fp-border, #ccc));
        padding: 20px;
        border-radius: var(--system-radius-lg, 8px);
        box-shadow: var(--system-shadow, 0 4px 15px rgba(0, 0, 0, 0.3));
        z-index: 1001;
        display: flex;
        flex-direction: column;
        gap: 15px;
        min-width: 280px;
        max-width: 90%;
        color: var(--system-text, var(--mi-fp-text-primary, #333));
    }

    .file-picker-confirm-dialog p {
        margin: 0;
        font-size: 1.1em;
        color: var(--system-text, var(--mi-fp-text-primary, #333));
        text-align: center;
    }

    .file-picker-confirm-dialog-buttons {
        display: flex;
        justify-content: center;
        gap: 10px;
    }

    .file-picker-confirm-dialog-buttons button {
        background: var(--system-accent, var(--mi-fp-btn-primary-bg, #007bff));
        color: var(--system-text-on-accent, white);
        border: none;
        padding: 8px 16px;
        border-radius: var(--system-radius, 5px);
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1em;
        min-width: 80px;
    }

    .file-picker-confirm-dialog-buttons button.cancel {
        background: var(--system-border, var(--mi-fp-btn-secondary-bg, #6c757d));
    }

    .file-picker-confirm-dialog-buttons button:hover {
        background: var(--system-accent-dim, var(--mi-fp-btn-primary-hover, #0056b3));
    }

    .file-picker-confirm-dialog-buttons button.cancel:hover {
        background: var(--system-border-hover, var(--mi-fp-btn-secondary-hover, #5a6268));
    }

    /* ===== PROMPT DIALOG ===== */
    .file-picker-prompt-dialog {
        background: var(--system-menu-bg, var(--mi-fp-dialog-bg, #fff));
        border: 1px solid var(--system-border, var(--mi-fp-border, #ccc));
        padding: 20px;
        border-radius: var(--system-radius-lg, 8px);
        box-shadow: var(--system-shadow, 0 4px 15px rgba(0, 0, 0, 0.3));
        z-index: 1001;
        display: flex;
        flex-direction: column;
        gap: 15px;
        min-width: 280px;
        max-width: 90%;
        color: var(--system-text, var(--mi-fp-text-primary, #333));
    }

    .file-picker-prompt-dialog p {
        margin: 0;
        font-size: 1.1em;
        color: var(--system-text, var(--mi-fp-text-primary, #333));
        text-align: center;
    }

    .file-picker-prompt-dialog input[type="text"] {
        width: calc(100% - 16px);
        padding: 8px;
        border: 1px solid var(--system-border, var(--mi-fp-input-border, #ddd));
        border-radius: var(--system-radius, 4px);
        font-size: 1em;
        box-sizing: border-box;
        background: var(--system-window-bg, #fff);
        color: var(--system-text, #000);
    }

    .file-picker-prompt-dialog input[type="text"]:focus {
        border-color: var(--system-accent, #007bff);
        box-shadow: 0 0 0 2px var(--system-highlight, rgba(0,120,212,0.2));
        outline: none;
    }

    .file-picker-prompt-dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }

    .file-picker-prompt-dialog-buttons button {
        background: var(--system-accent, var(--mi-fp-btn-primary-bg, #007bff));
        color: var(--system-text-on-accent, white);
        border: none;
        padding: 8px 16px;
        border-radius: var(--system-radius, 5px);
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1em;
    }

    .file-picker-prompt-dialog-buttons button.cancel {
        background: var(--system-border, var(--mi-fp-btn-secondary-bg, #6c757d));
    }

    .file-picker-prompt-dialog-buttons button:hover {
        background: var(--system-accent-dim, var(--mi-fp-btn-primary-hover, #0056b3));
    }

    .file-picker-prompt-dialog-buttons button.cancel:hover {
        background: var(--system-border-hover, var(--mi-fp-btn-secondary-hover, #5a6268));
    }
    
    /* ===== CREATION DIALOG ===== */
    .file-picker-creation-dialog {
        background: var(--system-menu-bg, var(--mi-fp-dialog-bg, #fff));
        border: 1px solid var(--system-border, var(--mi-fp-border, #ccc));
        padding: 20px;
        border-radius: var(--system-radius-lg, 8px);
        box-shadow: var(--system-shadow, 0 4px 15px rgba(0, 0, 0, 0.3));
        z-index: 1001;
        display: flex; 
        flex-direction: column;
        gap: 15px;
        min-width: 320px; 
        max-width: 90%;
        color: var(--system-text, var(--mi-fp-text-primary, #333));
    }

    .file-picker-creation-dialog p {
        margin: 0;
        font-size: 1.1em;
        color: var(--system-text, var(--mi-fp-text-primary, #333));
        text-align: center;
    }

    .file-picker-creation-dialog-options {
        display: flex;
        justify-content: center;
        gap: 20px;
        font-size: 1em;
    }
    
    .file-picker-creation-dialog-options label {
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .file-picker-creation-dialog input[type="text"] {
        width: calc(100% - 16px);
        padding: 8px;
        border: 1px solid var(--system-border, var(--mi-fp-input-border, #ddd));
        border-radius: var(--system-radius, 4px);
        font-size: 1em;
        box-sizing: border-box;
        background: var(--system-window-bg, #fff);
        color: var(--system-text, #000);
    }

    .file-picker-creation-dialog input[type="text"]:focus {
        border-color: var(--system-accent, #007bff);
        box-shadow: 0 0 0 2px var(--system-highlight, rgba(0,120,212,0.2));
        outline: none;
    }

    .file-picker-creation-dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    
    .file-picker-creation-dialog-buttons button {
        background: var(--system-accent, var(--mi-fp-btn-primary-bg, #007bff));
        color: var(--system-text-on-accent, white);
        border: none;
        padding: 8px 16px;
        border-radius: var(--system-radius, 5px);
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1em;
    }

    .file-picker-creation-dialog-buttons button.cancel {
        background: var(--system-border, var(--mi-fp-btn-secondary-bg, #6c757d));
    }

    .file-picker-creation-dialog-buttons button:hover {
        background: var(--system-accent-dim, var(--mi-fp-btn-primary-hover, #0056b3));
    }

    .file-picker-creation-dialog-buttons button.cancel:hover {
        background: var(--system-border-hover, var(--mi-fp-btn-secondary-hover, #5a6268));
    }
    
    /* Button text span for "Use Path" button - HIDDEN for icon-only mode */
    .file-picker-menu-bar button .btn-text {
        display: none;
        font-size: 0.9em;
        margin-left: 2px;
        vertical-align: middle;
    }
    
    /* Ensure icon is vertically centered when text is hidden */
    .file-picker-menu-bar button.use-path-btn .material-icons.icon-confirm {
        vertical-align: middle;
        display: inline-flex;
        align-items: center;
    }

    /* ===== ACCESSIBILITY & FALLBACKS ===== */
    
    /* Reduced motion support */
    @media (prefers-reduced-motion: reduce) {
        .file-picker-menu-bar button,
        .file-picker-list-table tr,
        .file-picker-popup-contained,
        .file-picker-confirm-dialog,
        .file-picker-prompt-dialog,
        .file-picker-creation-dialog {
            transition: none !important;
            animation: none !important;
        }
    }

    /* Backdrop-filter fallback for dialogs */
    @supports not (backdrop-filter: blur(10px)) {
        .file-picker-confirm-dialog,
        .file-picker-prompt-dialog,
        .file-picker-creation-dialog {
            background: var(--system-menu-bg, var(--mi-fp-dialog-bg, #fff)) !important;
            backdrop-filter: none !important;
        }
    }
`;
    
    document.head.appendChild(style);
    stylesInjected = true;
}

// --- Helper Functions ---

/**
 * Formats file size into a human-readable string.
 * @param {number} bytes The size in bytes.
 * @returns {string} Human-readable size.
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Shows a temporary popup message (GLOBAL - viewport centered).
 * @param {string} message The message to display.
 * @param {boolean} isError True if it's an error message, false for success.
 */
export function showPopupMessage(message, isError = false) {
    let popup = document.getElementById('file-picker-global-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'file-picker-global-popup';
        popup.className = 'file-picker-popup';
        document.body.appendChild(popup);
    }

    popup.textContent = message;
    popup.classList.remove('error', 'show');
    if (isError) {
        popup.classList.add('error');
    }
    popup.classList.add('show');

    setTimeout(() => {
        popup.classList.remove('show');
    }, 3000);
}

/**
 * Gets or creates a dialog overlay within a specific picker container.
 * @param {HTMLElement} pickerContainer - The file picker container
 * @returns {HTMLElement} The dialog overlay element.
 */
export function getDialogOverlay(pickerContainer) {
    let overlay = pickerContainer.querySelector('.file-picker-dialog-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'file-picker-dialog-overlay';
        pickerContainer.appendChild(overlay);
    }
    return overlay;
}

/**
 * Creates the DOM structure for a file picker instance.
 * @param {string} originalClass The class from the original element.
 * @param {string} originalId The ID from the original element.
 * @param {string} initialPath The initial path to display.
 * @returns {HTMLElement} The outermost DOM element of the file picker.
 */
export function createPickerDOM(originalClass, originalId, initialPath) {
    const pickerHtml = `
        <div class="file-picker-container-wrapper ${originalClass || ''}" ${originalId ? `id="${originalId}"` : ''}>
            <div class="file-picker-title-bar">
                <span class="file-picker-title-text">No file selected</span>
            </div>
            
            <table class="file-picker-menu-bar">
                <tbody>
                    <tr>
                        <td><button class="create-btn system-btn system-btn-icon" title="Create New File or Directory"></button></td>
                        <td><button class="rename-btn system-btn system-btn-icon" title="Rename" disabled></button></td>
                        <td><button class="copy-btn system-btn system-btn-icon" title="Copy Selected" disabled></button></td>
                        <td><button class="cut-btn system-btn system-btn-icon" title="Cut Selected" disabled></button></td>
                        <td><button class="paste-btn system-btn system-btn-icon" title="Paste" disabled></button></td>
                        <td><button class="delete-btn system-btn system-btn-icon system-btn-danger" title="Delete Selected" disabled></button></td>
                        <td><button class="cancel-btn system-btn system-btn-secondary system-btn-icon" title="Cancel"></button></td>
                        <td><button class="use-path-btn system-btn system-btn-icon" title="Use Selected File Path"></button></td>
                    </tr>
                </tbody>
            </table>

            <div class="file-picker-path-display">
                <span class="file-picker-current-path">Path: ${initialPath}</span>
                <button class="file-picker-refresh-button system-btn system-btn-icon" title="Refresh"></button>
            </div>

            <div class="file-picker-list-container">
                <table class="file-picker-list-table">
                    <thead>
                        <tr>
                            <th></th>
                            <th><input type="checkbox" class="file-picker-select-all-checkbox system-checkbox" title="Select All"></th>
                            <th>Name</th>
                            <th>Size</th>
                        </tr>
                    </thead>
                    <tbody>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const pickerContainerWrapper = document.createElement('div');
    pickerContainerWrapper.innerHTML = pickerHtml;
    return pickerContainerWrapper.firstElementChild;
}