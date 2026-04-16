// ./system/ux/filePickerUI.js

// --- Constants ---
const LINE_HEIGHT_EM = 1.5;
const HISTORY_DEBOUNCE_TIME = 300;

// --- Module-level Variables ---
let stylesInjected = false;

// --- Dynamic Style Injection ---
export function injectStyles() {
    if (stylesInjected) return;

    const style = document.createElement('style');
    style.id = 'file-picker-styles';
    
    style.textContent = `
    /* ===== MATERIAL ICONS @FONT-FACE (Self-hosted) ===== */
    @font-face {
        font-family: 'Material Icons';
        font-style: normal;
        font-weight: 400;
        src: url('/system/fonts/MaterialIcons-Regular.ttf') format('truetype');
        font-display: block;
    }

    /* ===== BASE ICON CLASS ===== */
    .material-icon {
        font-family: 'Material Icons';
        font-weight: normal;
        font-style: normal;
        font-size: 1em;
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
        vertical-align: middle;
        user-select: none;
        cursor: inherit;
    }

    .material-icon-sm { font-size: 0.9em; }
    .material-icon-lg { font-size: 1.3em; }

    /* ===== MATERIAL ICONS COLOR CODING - SYSTEM VARIABLES [v2.7+] ===== */
    
    /* File Type Icons - System Theme Variables */
    .material-icon.icon-folder {
        color: var(--system-accent) !important;
    }
    
    .material-icon.icon-file {
        color: var(--system-accent) !important;
    }
    
    .material-icon.icon-up-dir {
        color: var(--system-accent) !important;
    }
    
    /* Toolbar Action Icons - Mapped to semantic system colors */
    .material-icon.icon-create,
    .material-icon.icon-paste,
    .material-icon.icon-download,
    .material-icon.icon-confirm {
        color: var(--system-success) !important;
    }
    
    .material-icon.icon-rename,
    .material-icon.icon-copy,
    .material-icon.icon-upload,
    .material-icon.icon-refresh {
        color: var(--system-info) !important;
    }
    
    .material-icon.icon-cut {
        color: var(--system-warning) !important;
    }
    
    .material-icon.icon-delete {
        color: var(--system-danger) !important;
    }
    
    .material-icon.icon-cancel {
        color: var(--system-text-dim) !important;
    }
    
    /* Disabled State */
    .file-picker-menu-bar button:disabled .material-icon {
        color: var(--system-text-dim) !important;
        opacity: 0.6;
    }

    /* ===== TOOLBAR ICON BUTTONS ===== */
    
    .system-btn-icon .material-icon,
    .file-picker-menu-bar button .material-icon {
        color: inherit !important;
        font-size: 1.1em;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .file-picker-menu-bar button:not(:disabled) {
        color: var(--system-text);
    }

    .file-picker-menu-bar button.delete-btn:not(:disabled) {
        color: var(--system-danger);
    }

    .file-picker-menu-bar button.cancel-btn:not(:disabled) {
        color: var(--system-text-dim);
    }

    .file-picker-menu-bar button:disabled {
        color: var(--system-text-dim) !important;
        opacity: 0.6;
        cursor: not-allowed;
    }

    .file-picker-refresh-button {
        color: var(--system-text-dim);
    }

    .file-picker-menu-bar .material-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
    }

    /* ===== CORE CONTAINER ===== */
    .file-picker-container-wrapper {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border: 1px solid var(--system-border);
        font-family: var(--system-font, 'Fira Code', 'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace);
        font-size: 14px;
        line-height: ${LINE_HEIGHT_EM};
        box-sizing: border-box;
        background: var(--system-window-bg);
        color: var(--system-text);
        border-radius: var(--system-radius, 4px);
        box-shadow: var(--system-shadow, 0 2px 8px rgba(0,0,0,0.1));
    }
    
    .file-picker-container-wrapper * {
        box-sizing: border-box;
    }

    /* ===== TITLE BAR & HEADERS ===== */
    .file-picker-title-bar {
        background: var(--system-header-bg);
        color: var(--system-text-on-accent);
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
        background: var(--system-header-bg);
        border-bottom: 1px solid var(--system-border);
        flex-shrink: 0;
        display: table;
        table-layout: fixed;
    }

    .file-picker-menu-bar tr { display: table-row; }
    .file-picker-menu-bar td {
        border: 1px solid var(--system-border);
        text-align: center;
        vertical-align: middle;
        padding: 0;
        display: table-cell;
    }

    .file-picker-menu-bar button {
        background-color: transparent;
        border: none;
        color: var(--system-text);
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

    .file-picker-menu-bar button:active {
        background-color: var(--system-highlight);
        opacity: 0.9;
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
        background: var(--system-header-bg);
        border-bottom: 1px solid var(--system-border);
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
        color: var(--system-text);
    }
    .file-picker-refresh-button {
        background-color: transparent;
        border: none;
        color: var(--system-text-dim);
        cursor: pointer;
        font-size: 1em;
        padding: 0 5px;
        height: 100%;
        display: flex;
        align-items: center;
    }
    .file-picker-refresh-button:active {
        color: var(--system-text);
        opacity: 0.9;
    }

    /* ===== FILE LIST AREA ===== */
    .file-picker-list-container {
        flex-grow: 1;
        overflow-y: auto;
        background: var(--system-window-bg);
        color: var(--system-text);
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
        border-bottom: 1px solid var(--system-border);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: middle;
    }

    .file-picker-list-table th {
        background: var(--system-header-bg);
        font-weight: bold;
        color: var(--system-text);
        position: sticky;
        top: 0;
        z-index: 1;
    }

    /* ===== SELECTED FILE ROW ===== */
    
    .file-picker-list-table tr.selected,
    .file-picker-list-table tr.file-picker-selected-row {
        background: var(--system-accent) !important;
    }

    .file-picker-list-table tr.selected td,
    .file-picker-list-table tr.file-picker-selected-row td {
        color: var(--system-text-on-accent) !important;
    }

    .file-picker-list-table tr.selected .file-name,
    .file-picker-list-table tr.file-picker-selected-row .file-name {
        color: var(--system-text-on-accent) !important;
        text-decoration: none;
    }

    .file-picker-list-table tr.selected .material-icon,
    .file-picker-list-table tr.file-picker-selected-row .material-icon {
        color: var(--system-text-on-accent) !important;
    }

    .file-picker-list-table tr.selected .file-checkbox,
    .file-picker-list-table tr.file-picker-selected-row .file-checkbox {
        accent-color: var(--system-text-on-accent);
    }

    .file-picker-list-table tr.selected:focus,
    .file-picker-list-table tr.file-picker-selected-row:focus {
        outline: 2px solid var(--system-highlight);
        outline-offset: -2px;
    }

    /* ===== NON-SELECTED ROWS - PATH/ICON STYLING [FIXED] ===== */
    
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) {
        background: transparent !important;
    }
    
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) td,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .file-name {
        color: var(--system-text) !important;
    }

    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .material-icon.icon-folder {
        color: var(--system-accent) !important;
    }
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .material-icon.icon-file {
        color: var(--system-accent) !important;
    }
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .material-icon.icon-up-dir {
        color: var(--system-accent) !important;
    }
    
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .material-icon:not(.icon-folder):not(.icon-file):not(.icon-up-dir) {
        color: var(--system-text) !important;
    }

    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .file-checkbox {
        accent-color: var(--system-accent);
    }

    /* ===== DIRECTORY PATH LINKS - SYSTEM THEME ===== */
    
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .directory-name,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .folder-name {
        color: var(--system-accent) !important;
    }

    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .parent-dir,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .up-dir {
        color: var(--system-info) !important;
    }

    /* ✅ REMOVED CONFLICTING :first-child RULE THAT WAS OVERRIDING ICON COLORS */
    /* .file-picker-list-table tbody tr:first-child:not(.selected):not(.file-picker-selected-row) .material-icon { ... } */

    .file-picker-list-table tr.selected .directory-name,
    .file-picker-list-table tr.file-picker-selected-row .directory-name {
        color: var(--system-text-on-accent) !important;
    }

    .file-picker-list-table tr.selected .icon-folder,
    .file-picker-list-table tr.file-picker-selected-row .icon-folder {
        color: var(--system-text-on-accent) !important;
    }

    /* ===== FOCUS STATES (Mobile-First - No Hover) ===== */
    
    .file-picker-list-table .file-name:focus,
    .file-picker-list-table .directory-name:focus {
        outline: 2px solid var(--system-highlight);
        outline-offset: 2px;
        border-radius: var(--system-radius, 4px);
    }

    /* ===== NATIVE CHECKBOX - THEME STYLING ===== */
    
    .file-picker-list-table .file-checkbox,
    .file-picker-select-all-checkbox {
        accent-color: var(--system-accent) !important;
        background-color: var(--system-icon-bg, transparent) !important;
        border: 1px solid var(--system-border) !important;
        border-radius: var(--system-radius, 4px) !important;
        cursor: pointer;
        width: 16px;
        height: 16px;
        transition: all var(--system-transition-fast, 0.15s ease);
        box-sizing: border-box;
    }

    .file-picker-list-table .file-checkbox:focus,
    .file-picker-list-table .file-checkbox:active,
    .file-picker-select-all-checkbox:focus,
    .file-picker-select-all-checkbox:active {
        outline: none !important;
        box-shadow: 0 0 0 2px var(--system-accent), 0 0 12px rgba(0, 120, 212, 0.4) !important;
        border-color: var(--system-accent) !important;
    }

    .file-picker-list-table .file-checkbox:checked,
    .file-picker-select-all-checkbox:checked {
        accent-color: var(--system-accent) !important;
        background-color: var(--system-accent) !important;
        border-color: var(--system-accent) !important;
    }

    .file-picker-list-table tr.selected .file-checkbox:checked,
    .file-picker-list-table tr.file-picker-selected-row .file-checkbox:checked,
    .file-picker-list-table tr.selected .file-picker-select-all-checkbox:checked,
    .file-picker-list-table tr.file-picker-selected-row .file-picker-select-all-checkbox:checked {
        accent-color: var(--system-text-on-accent) !important;
        background-color: var(--system-text-on-accent) !important;
        border-color: var(--system-text-on-accent) !important;
    }

    .file-picker-list-table .file-checkbox:disabled,
    .file-picker-select-all-checkbox:disabled {
        opacity: 0.5 !important;
        cursor: not-allowed !important;
        background-color: var(--system-bg-disabled, rgba(0, 0, 0, 0.1)) !important;
        border-color: var(--system-border-dim, rgba(0, 0, 0, 0.2)) !important;
        accent-color: var(--system-text-dim) !important;
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
    .file-picker-list-table .directory-name {
        cursor: pointer;
        color: var(--system-accent);
        text-decoration: none;
        text-align: left !important;
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
    
    /* ===== DIALOG OVERLAY ===== */
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

    /* ===== POPUP ===== */
    .file-picker-popup-contained {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--system-success);
        color: var(--system-text-on-accent);
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
        background: var(--system-danger);
    }

    .file-picker-popup {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--system-success);
        color: var(--system-text-on-accent);
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
        background: var(--system-danger);
    }

    /* ===== CONFIRMATION DIALOG ===== */
    .file-picker-confirm-dialog {
        background: var(--system-menu-bg);
        border: 1px solid var(--system-border);
        padding: 20px;
        border-radius: var(--system-radius-lg, 8px);
        box-shadow: var(--system-shadow, 0 4px 15px rgba(0, 0, 0, 0.3));
        z-index: 1001;
        display: flex;
        flex-direction: column;
        gap: 15px;
        min-width: 280px;
        max-width: 90%;
        color: var(--system-text);
    }

    .file-picker-confirm-dialog p {
        margin: 0;
        font-size: 1.1em;
        color: var(--system-text);
        text-align: center;
    }

    .file-picker-confirm-dialog-buttons {
        display: flex;
        justify-content: center;
        gap: 10px;
    }

    .file-picker-confirm-dialog-buttons button {
        background: var(--system-accent);
        color: var(--system-text-on-accent);
        border: none;
        padding: 8px 16px;
        border-radius: var(--system-radius, 5px);
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1em;
        min-width: 80px;
    }

    .file-picker-confirm-dialog-buttons button:active {
        opacity: 0.9;
    }

    .file-picker-confirm-dialog-buttons button.cancel {
        background: var(--system-border);
        color: var(--system-text);
    }

    /* ===== PROMPT DIALOG ===== */
    .file-picker-prompt-dialog {
        background: var(--system-menu-bg);
        border: 1px solid var(--system-border);
        padding: 20px;
        border-radius: var(--system-radius-lg, 8px);
        box-shadow: var(--system-shadow, 0 4px 15px rgba(0, 0, 0, 0.3));
        z-index: 1001;
        display: flex;
        flex-direction: column;
        gap: 15px;
        min-width: 280px;
        max-width: 90%;
        color: var(--system-text);
    }

    .file-picker-prompt-dialog p {
        margin: 0;
        font-size: 1.1em;
        color: var(--system-text);
        text-align: center;
    }

    .file-picker-prompt-dialog input[type="text"] {
        width: calc(100% - 16px);
        padding: 8px;
        border: 1px solid var(--system-border);
        border-radius: var(--system-radius, 4px);
        font-size: 1em;
        box-sizing: border-box;
        background: var(--system-window-bg);
        color: var(--system-text);
    }

    .file-picker-prompt-dialog input[type="text"]:focus {
        border-color: var(--system-accent);
        box-shadow: 0 0 0 2px var(--system-highlight);
        outline: none;
    }

    .file-picker-prompt-dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }

    .file-picker-prompt-dialog-buttons button {
        background: var(--system-accent);
        color: var(--system-text-on-accent);
        border: none;
        padding: 8px 16px;
        border-radius: var(--system-radius, 5px);
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1em;
    }

    .file-picker-prompt-dialog-buttons button:active {
        opacity: 0.9;
    }

    .file-picker-prompt-dialog-buttons button.cancel {
        background: var(--system-border);
        color: var(--system-text);
    }

    /* ===== CREATION DIALOG ===== */
    .file-picker-creation-dialog {
        background: var(--system-menu-bg);
        border: 1px solid var(--system-border);
        padding: 20px;
        border-radius: var(--system-radius-lg, 8px);
        box-shadow: var(--system-shadow, 0 4px 15px rgba(0, 0, 0, 0.3));
        z-index: 1001;
        display: flex; 
        flex-direction: column;
        gap: 15px;
        min-width: 320px; 
        max-width: 90%;
        color: var(--system-text);
    }

    .file-picker-creation-dialog p {
        margin: 0;
        font-size: 1.1em;
        color: var(--system-text);
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
        color: var(--system-text);
    }

    .file-picker-creation-dialog input[type="text"] {
        width: calc(100% - 16px);
        padding: 8px;
        border: 1px solid var(--system-border);
        border-radius: var(--system-radius, 4px);
        font-size: 1em;
        box-sizing: border-box;
        background: var(--system-window-bg);
        color: var(--system-text);
    }

    .file-picker-creation-dialog input[type="text"]:focus {
        border-color: var(--system-accent);
        box-shadow: 0 0 0 2px var(--system-highlight);
        outline: none;
    }

    .file-picker-creation-dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    
    .file-picker-creation-dialog-buttons button {
        background: var(--system-accent);
        color: var(--system-text-on-accent);
        border: none;
        padding: 8px 16px;
        border-radius: var(--system-radius, 5px);
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1em;
    }

    .file-picker-creation-dialog-buttons button:active {
        opacity: 0.9;
    }

    .file-picker-creation-dialog-buttons button.cancel {
        background: var(--system-border);
        color: var(--system-text);
    }
    
    .file-picker-menu-bar button .btn-text {
        display: none;
        font-size: 0.9em;
        margin-left: 2px;
        vertical-align: middle;
    }
    
    .file-picker-menu-bar button.use-path-btn .material-icon.icon-confirm {
        vertical-align: middle;
        display: inline-flex;
        align-items: center;
    }

    /* ===== REDUCED MOTION ===== */
    @media (prefers-reduced-motion: reduce) {
        .file-picker-menu-bar button,
        .file-picker-list-table tr,
        .file-picker-popup-contained,
        .file-picker-confirm-dialog,
        .file-picker-prompt-dialog,
        .file-picker-creation-dialog,
        .file-picker-list-table .file-checkbox,
        .file-picker-select-all-checkbox {
            transition: none !important;
            animation: none !important;
        }
    }

    @supports not (backdrop-filter: blur(10px)) {
        .file-picker-confirm-dialog,
        .file-picker-prompt-dialog,
        .file-picker-creation-dialog {
            background: var(--system-menu-bg) !important;
            backdrop-filter: none !important;
        }
    }
    `;
    
    document.head.appendChild(style);
    stylesInjected = true;
}

// --- Helper Functions ---

export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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

export function getDialogOverlay(pickerContainer) {
    let overlay = pickerContainer.querySelector('.file-picker-dialog-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'file-picker-dialog-overlay';
        pickerContainer.appendChild(overlay);
    }
    return overlay;
}

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

export function toggleRowSelection(checkbox, forceState = null) {
    const row = checkbox.closest('tr');
    if (!row) return;
    
    const shouldBeSelected = forceState !== null ? forceState : checkbox.checked;
    
    if (shouldBeSelected) {
        row.classList.add('selected', 'file-picker-selected-row');
    } else {
        row.classList.remove('selected', 'file-picker-selected-row');
    }
    
    updateToolbarButtonStates(row.closest('.file-picker-container-wrapper'));
}

export function updateToolbarButtonStates(pickerContainer) {
    const selectedRows = pickerContainer.querySelectorAll('tbody tr.selected, tbody tr.file-picker-selected-row');
    const hasSelection = selectedRows.length > 0;
    
    const buttons = {
        '.rename-btn': hasSelection,
        '.copy-btn': hasSelection,
        '.cut-btn': hasSelection,
        '.delete-btn': hasSelection,
        '.paste-btn': true,
        '.use-path-btn': hasSelection && selectedRows.length === 1
    };
    
    Object.entries(buttons).forEach(([selector, enabled]) => {
        const btn = pickerContainer.querySelector(selector);
        if (btn) {
            btn.disabled = !enabled;
        }
    });
}

export function handleSelectAll(selectAllCheckbox, pickerContainer) {
    const checkboxes = pickerContainer.querySelectorAll('tbody .file-checkbox');
    const isChecked = selectAllCheckbox.checked;
    
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        toggleRowSelection(cb, isChecked);
    });
}

export function attachPickerEventListeners(pickerContainer) {
    pickerContainer.addEventListener('change', function(e) {
        if (e.target.classList.contains('file-checkbox')) {
            toggleRowSelection(e.target);
        }
        if (e.target.classList.contains('file-picker-select-all-checkbox')) {
            handleSelectAll(e.target, pickerContainer);
        }
    });
    
    pickerContainer.querySelector('tbody').addEventListener('click', function(e) {
        const row = e.target.closest('tr');
        if (!row) return;
        if (e.target.closest('.file-checkbox, .file-name, .directory-name')) return;
        const checkbox = row.querySelector('.file-checkbox');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            toggleRowSelection(checkbox);
        }
    });
    
    pickerContainer.querySelector('tbody').addEventListener('keydown', function(e) {
        if (!['ArrowDown', 'ArrowUp', ' ', 'Enter'].includes(e.key)) return;
        const activeRow = document.activeElement?.closest('tr');
        if (!activeRow) return;
        e.preventDefault();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const nextRow = e.key === 'ArrowDown' 
                ? activeRow.nextElementSibling 
                : activeRow.previousElementSibling;
            if (nextRow?.querySelector('.file-name')) {
                nextRow.querySelector('.file-name')?.focus();
            }
        } else if (e.key === ' ' || e.key === 'Enter') {
            const checkbox = activeRow.querySelector('.file-checkbox');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                toggleRowSelection(checkbox);
            }
        }
    });
    
    const refreshBtn = pickerContainer.querySelector('.file-picker-refresh-button');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            pickerContainer.dispatchEvent(new CustomEvent('filepicker:refresh', {
                bubbles: true,
                detail: { path: pickerContainer.dataset.currentPath }
            }));
        });
    }
}