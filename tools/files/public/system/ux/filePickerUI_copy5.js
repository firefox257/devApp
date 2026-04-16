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
 * v2.7+ UPDATE: Uses self-hosted Material Icons font with system variable fallbacks.
 * v2.7+ UPDATE: Toolbar icons now use --system-* color variables for theme consistency.
 * v2.7+ UPDATE: Selected file rows have proper contrast with --system-text-on-accent.
 * 🔧 FIX v2.7.1: Added CSS to ensure non-selected rows always have readable text color.
 * 🔧 FIX v2.7.1: Added directory/folder-specific text color fixes.
 * 🔧 FIX v3.4: Native checkboxes now use Matrix Theme colors (--system-accent, --system-border, --system-icon-bg)
 */
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

    /* ===== MATERIAL ICONS COLOR CODING (with system variable fallbacks) ===== */
    
    /* File Type Icons */
    .material-icon.icon-folder {
        color: var(--system-accent, var(--mi-fp-icon-folder, #FFB300));
    }
    
    .material-icon.icon-file {
        color: var(--system-info, var(--mi-fp-icon-file, #1976D2));
    }
    
    .material-icon.icon-up-dir {
        color: var(--system-info, var(--mi-fp-icon-up-dir, #0288D1));
    }
    
    /* Toolbar Action Icons - Mapped to semantic system colors */
    .material-icon.icon-create,
    .material-icon.icon-paste,
    .material-icon.icon-download,
    .material-icon.icon-confirm {
        color: var(--system-success, var(--mi-fp-action-create, #388E3C));
    }
    
    .material-icon.icon-rename,
    .material-icon.icon-copy,
    .material-icon.icon-upload,
    .material-icon.icon-refresh {
        color: var(--system-info, var(--mi-fp-action-rename, #1976D2));
    }
    
    .material-icon.icon-cut {
        color: var(--system-warning, var(--mi-fp-action-cut, #F57C00));
    }
    
    .material-icon.icon-delete {
        color: var(--system-danger, var(--mi-fp-action-delete, #D32F2F));
    }
    
    .material-icon.icon-cancel {
        color: var(--system-text-dim, var(--mi-fp-action-cancel, #757575));
    }
    
    /* Disabled State - Use system dimmed text */
    .file-picker-menu-bar button:disabled .material-icon {
        color: var(--system-text-dim, var(--mi-fp-icon-disabled, #BDBDBD)) !important;
    }
    /* ===== END MATERIAL ICONS COLOR CODING ===== */

    /* ===== TOOLBAR ICON BUTTONS - SYSTEM COLOR INTEGRATION [v2.7+] ===== */
    
    /* Ensure icons inside system-btn-icon inherit button text color */
    .system-btn-icon .material-icon,
    .file-picker-menu-bar button .material-icon {
        color: inherit !important;
        font-size: 1.1em;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    /* Primary toolbar buttons: use system-text for icon color */
    .file-picker-menu-bar button:not(:disabled) {
        color: var(--system-text, #333);
    }

    /* Danger button (delete) uses system-danger */
    .file-picker-menu-bar button.delete-btn:not(:disabled) {
        color: var(--system-danger, #d32f2f);
    }

    /* Secondary buttons (cancel) use dimmed text */
    .file-picker-menu-bar button.cancel-btn:not(:disabled) {
        color: var(--system-text-dim, #666);
    }

    /* Disabled state: always use system-text-dim */
    .file-picker-menu-bar button:disabled .material-icon {
        color: var(--system-text-dim, #999) !important;
        opacity: 0.6;
    }

    /* Refresh button in path bar */
    .file-picker-refresh-button {
        color: var(--system-text-dim, #666);
    }

    /* Ensure icon size consistency in toolbar for visibility */
    .file-picker-menu-bar .material-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
    }

    /* High contrast mode support */
    @media (prefers-contrast: high) {
        .file-picker-menu-bar button .material-icon {
            color: var(--system-text, #000) !important;
        }
    }
    /* ===== END TOOLBAR ICON BUTTONS ===== */

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

    /* ===== SELECTED FILE ROW - VISIBILITY FIX [v2.7+] ===== */
    
    /* Selected/highlighted row background */
    .file-picker-list-table tr.selected,
    .file-picker-list-table tr.file-picker-selected-row {
        background: var(--system-accent, #0078d4) !important;
    }

    /* Ensure text color contrasts with selection background */
    .file-picker-list-table tr.selected td,
    .file-picker-list-table tr.file-picker-selected-row td {
        color: var(--system-text-on-accent, #ffffff) !important;
    }

    /* File name link in selected row */
    .file-picker-list-table tr.selected .file-name,
    .file-picker-list-table tr.file-picker-selected-row .file-name {
        color: var(--system-text-on-accent, #ffffff) !important;
        text-decoration: none;
    }

    /* Icon colors in selected row */
    .file-picker-list-table tr.selected .material-icon,
    .file-picker-list-table tr.file-picker-selected-row .material-icon {
        color: var(--system-text-on-accent, #ffffff) !important;
    }

    /* Checkbox visibility in selected row */
    .file-picker-list-table tr.selected .file-checkbox,
    .file-picker-list-table tr.file-picker-selected-row .file-checkbox {
        accent-color: var(--system-text-on-accent, #ffffff);
    }

    /* Focus state for keyboard navigation */
    .file-picker-list-table tr.selected:focus,
    .file-picker-list-table tr.file-picker-selected-row:focus {
        outline: 2px solid var(--system-highlight, #4da3ff);
        outline-offset: -2px;
    }

    /* 🔧 FIX v2.7.1: Ensure NON-selected rows ALWAYS have readable text */
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) {
        background: transparent !important;
    }
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) td,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .file-name,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .material-icon {
        color: var(--system-text, #00ff41) !important;
    }
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .file-checkbox {
        accent-color: var(--system-accent, #00ff41);
    }

    /* 🔧 FIX v2.7.1: Directory/folder-specific text color fixes */
    
    /* Directory/folder name links in NON-selected rows */
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .up-directory,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .directory-name,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .folder-name {
        color: var(--system-accent, #00ff41) !important;
    }

    /* Folder icons in NON-selected rows */
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .icon-folder,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) td .material-icon.icon-folder {
        color: var(--system-accent, #00ff41) !important;
    }

    /* Parent directory (..) link in NON-selected rows */
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .parent-dir,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .up-dir {
        color: var(--system-info, #0099ff) !important;
    }

    /* Ensure folder icon in parent directory row has correct color */
    .file-picker-list-table tbody tr:first-child:not(.selected):not(.file-picker-selected-row) .material-icon {
        color: var(--system-info, #0099ff) !important;
    }

    /* Selected directory rows - ensure proper contrast */
    .file-picker-list-table tr.selected .up-directory,
    .file-picker-list-table tr.file-picker-selected-row .up-directory,
    .file-picker-list-table tr.selected .directory-name,
    .file-picker-list-table tr.file-picker-selected-row .directory-name {
        color: var(--system-text-on-accent, #ffffff) !important;
    }

    /* Selected folder icons */
    .file-picker-list-table tr.selected .icon-folder,
    .file-picker-list-table tr.file-picker-selected-row .icon-folder {
        color: var(--system-text-on-accent, #ffffff) !important;
    }

    /* 🔧 FIX v2.7.1: AGGRESSIVE override for all elements in non-selected rows */
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) a,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) span,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) div {
        color: var(--system-text, #00ff41) !important;
    }

    /* All icons in non-selected rows */
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .material-icons,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .material-icon,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .file-icon,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .icon-folder,
    .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .icon-file {
        color: var(--system-accent, #00ff41) !important;
        text-shadow: none !important;
    }

    /* High contrast mode support */
    @media (prefers-contrast: high) {
        .file-picker-list-table tr.selected,
        .file-picker-list-table tr.file-picker-selected-row {
            background: var(--system-text, #000) !important;
        }
        .file-picker-list-table tr.selected td,
        .file-picker-list-table tr.file-picker-selected-row td {
            color: var(--system-bg, #fff) !important;
        }
        /* High contrast: non-selected rows */
        .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) td {
            color: var(--system-text, #000) !important;
        }
        /* High contrast: directory links */
        .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .up-directory,
        .file-picker-list-table tbody tr:not(.selected):not(.file-picker-selected-row) .directory-name {
            color: var(--system-text, #000) !important;
        }
    }
    /* ===== END SELECTED FILE ROW ===== */

    /* ===== NATIVE CHECKBOX - MATRIX THEME STYLING [v3.4] ===== */
    
    /* Base checkbox styling - uses Matrix Theme variables */
    .file-picker-list-table .file-checkbox,
    .file-picker-select-all-checkbox {
        accent-color: var(--system-accent, #00ff41) !important;
        background-color: var(--system-icon-bg, rgba(0, 255, 65, 0.15)) !important;
        border: 1px solid var(--system-border, rgba(0, 255, 65, 0.3)) !important;
        border-radius: var(--system-radius, 4px) !important;
        cursor: pointer;
        width: 16px;
        height: 16px;
        transition: all var(--system-transition-fast, 0.15s ease);
        box-sizing: border-box;
    }

    /* Focus/Active states (touch/keyboard) */
    .file-picker-list-table .file-checkbox:focus,
    .file-picker-list-table .file-checkbox:active,
    .file-picker-select-all-checkbox:focus,
    .file-picker-select-all-checkbox:active {
        outline: none !important;
        box-shadow: 0 0 0 2px var(--system-accent, #00ff41), 0 0 12px rgba(0, 255, 65, 0.4) !important;
        border-color: rgba(0, 255, 65, 0.6) !important;
    }

    /* Checked state: ensure checkmark contrasts */
    .file-picker-list-table .file-checkbox:checked,
    .file-picker-select-all-checkbox:checked {
        accent-color: var(--system-accent, #00ff41) !important;
        background-color: var(--system-accent, #00ff41) !important;
        border-color: var(--system-accent, #00ff41) !important;
    }

    /* Checked state INSIDE selected row: invert for contrast */
    .file-picker-list-table tr.selected .file-checkbox:checked,
    .file-picker-list-table tr.file-picker-selected-row .file-checkbox:checked,
    .file-picker-list-table tr.selected .file-picker-select-all-checkbox:checked,
    .file-picker-list-table tr.file-picker-selected-row .file-picker-select-all-checkbox:checked {
        accent-color: var(--system-text-on-accent, #000000) !important;
        background-color: var(--system-text-on-accent, #ffffff) !important;
        border-color: var(--system-text-on-accent, #ffffff) !important;
    }

    /* Disabled state */
    .file-picker-list-table .file-checkbox:disabled,
    .file-picker-select-all-checkbox:disabled {
        opacity: 0.5 !important;
        cursor: not-allowed !important;
        background-color: rgba(0, 51, 0, 0.3) !important;
        border-color: rgba(0, 255, 65, 0.15) !important;
        accent-color: rgba(0, 255, 65, 0.3) !important;
    }

    /* High contrast mode support */
    @media (prefers-contrast: high) {
        .file-picker-list-table .file-checkbox,
        .file-picker-select-all-checkbox {
            border-width: 2px !important;
            border-color: var(--system-accent, #00ff41) !important;
            background-color: transparent !important;
        }
        .file-picker-list-table .file-checkbox:checked,
        .file-picker-select-all-checkbox:checked {
            background-color: var(--system-accent, #00ff41) !important;
            accent-color: var(--system-text-on-accent, #000) !important;
        }
    }

    /* Reduced motion support */
    @media (prefers-reduced-motion: reduce) {
        .file-picker-list-table .file-checkbox,
        .file-picker-select-all-checkbox {
            transition: none !important;
        }
    }
    /* ===== END NATIVE CHECKBOX - MATRIX THEME ===== */

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
    
    /* Button text span for "Use Path" button - HIDDEN for icon-only mode */
    .file-picker-menu-bar button .btn-text {
        display: none;
        font-size: 0.9em;
        margin-left: 2px;
        vertical-align: middle;
    }
    
    /* Ensure icon is vertically centered when text is hidden */
    .file-picker-menu-bar button.use-path-btn .material-icon.icon-confirm {
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
        .file-picker-creation-dialog,
        .file-picker-list-table .file-checkbox,
        .file-picker-select-all-checkbox {
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

// 🔧 FIX v2.7.1: NEW - Row selection management functions
/**
 * Toggles the selected state of a file row based on checkbox state.
 * @param {HTMLInputElement} checkbox - The checkbox element that changed.
 * @param {boolean} forceState - Optional: force a specific state (true/false).
 */
export function toggleRowSelection(checkbox, forceState = null) {
    const row = checkbox.closest('tr');
    if (!row) return;
    
    const shouldBeSelected = forceState !== null ? forceState : checkbox.checked;
    
    if (shouldBeSelected) {
        row.classList.add('selected', 'file-picker-selected-row');
    } else {
        // 🔧 FIX: Ensure classes are REMOVED when unchecked
        row.classList.remove('selected', 'file-picker-selected-row');
    }
    
    // Update toolbar button states based on selection
    updateToolbarButtonStates(row.closest('.file-picker-container-wrapper'));
}

/**
 * Updates the enabled/disabled state of toolbar buttons based on current selection.
 * @param {HTMLElement} pickerContainer - The file picker container.
 */
export function updateToolbarButtonStates(pickerContainer) {
    const selectedRows = pickerContainer.querySelectorAll('tbody tr.selected, tbody tr.file-picker-selected-row');
    const hasSelection = selectedRows.length > 0;
    
    // Enable/disable buttons based on selection
    const buttons = {
        '.rename-btn': hasSelection,
        '.copy-btn': hasSelection,
        '.cut-btn': hasSelection,
        '.delete-btn': hasSelection,
        '.paste-btn': true, // Always enabled for now
        '.use-path-btn': hasSelection && selectedRows.length === 1
    };
    
    Object.entries(buttons).forEach(([selector, enabled]) => {
        const btn = pickerContainer.querySelector(selector);
        if (btn) {
            btn.disabled = !enabled;
        }
    });
}

/**
 * Handles "Select All" checkbox logic.
 * @param {HTMLInputElement} selectAllCheckbox - The "Select All" checkbox.
 * @param {HTMLElement} pickerContainer - The file picker container.
 */
export function handleSelectAll(selectAllCheckbox, pickerContainer) {
    const checkboxes = pickerContainer.querySelectorAll('tbody .file-checkbox');
    const isChecked = selectAllCheckbox.checked;
    
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        toggleRowSelection(cb, isChecked);
    });
}

/**
 * Attaches event listeners to file picker interactive elements.
 * Call this AFTER creating the picker DOM.
 * @param {HTMLElement} pickerContainer - The file picker container.
 */
export function attachPickerEventListeners(pickerContainer) {
    // 🔧 FIX: Row checkbox change handler - properly adds/removes selected class
    pickerContainer.addEventListener('change', function(e) {
        if (e.target.classList.contains('file-checkbox')) {
            toggleRowSelection(e.target);
        }
        if (e.target.classList.contains('file-picker-select-all-checkbox')) {
            handleSelectAll(e.target, pickerContainer);
        }
    });
    
    // Row click handler (for keyboard/mouse selection without checkbox)
    pickerContainer.querySelector('tbody').addEventListener('click', function(e) {
        const row = e.target.closest('tr');
        if (!row) return;
        
        // Ignore clicks on checkboxes or links
        if (e.target.closest('.file-checkbox, .file-name, .up-directory')) return;
        
        // Toggle selection on row click
        const checkbox = row.querySelector('.file-checkbox');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            toggleRowSelection(checkbox);
        }
    });
    
    // Keyboard navigation support (Arrow keys + Space/Enter)
    pickerContainer.querySelector('tbody').addEventListener('keydown', function(e) {
        if (!['ArrowDown', 'ArrowUp', ' ', 'Enter'].includes(e.key)) return;
        
        const activeRow = document.activeElement?.closest('tr');
        if (!activeRow) return;
        
        e.preventDefault();
        
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            // Navigate to next/previous row
            const nextRow = e.key === 'ArrowDown' 
                ? activeRow.nextElementSibling 
                : activeRow.previousElementSibling;
            if (nextRow?.querySelector('.file-name')) {
                nextRow.querySelector('.file-name')?.focus();
            }
        } else if (e.key === ' ' || e.key === 'Enter') {
            // Toggle selection on Space/Enter
            const checkbox = activeRow.querySelector('.file-checkbox');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                toggleRowSelection(checkbox);
            }
        }
    });
    
    // Refresh button handler
    const refreshBtn = pickerContainer.querySelector('.file-picker-refresh-button');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            // Trigger custom event for parent to handle refresh
            pickerContainer.dispatchEvent(new CustomEvent('filepicker:refresh', {
                bubbles: true,
                detail: { path: pickerContainer.dataset.currentPath }
            }));
        });
    }
}