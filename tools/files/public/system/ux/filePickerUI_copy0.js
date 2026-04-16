// ./ux/filePickerUI.js

// --- Constants ---
const LINE_HEIGHT_EM = 1.5;
const HISTORY_DEBOUNCE_TIME = 300;

// --- Module-level Variables ---
let stylesInjected = false;

// --- Dynamic Style Injection ---
/**
 * Injects necessary CSS styles for the file picker into the document head.
 * Ensures styles are injected only once.
 */
export function injectStyles() {
    if (stylesInjected) return;

    const style = document.createElement('style');
    style.id = 'file-picker-styles';
    
	style.textContent = `
    /* ===== MATERIAL ICONS FONT & BASE STYLES ===== */
    
	
	@font-face {
            font-family: 'Material Icons';
            font-style: normal;
            font-weight: 400;
            src: url('/system/fonts/MaterialIcons-Regular.ttf') format('truetype');
            font-display: block;
        }
	
	
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

    /* ===== MATERIAL ICONS COLOR CODING ===== */
    
    /* File Type Icons */
    .material-icons.icon-folder {
        color: #FFB300; /* Amber - folders */
    }
    
    .material-icons.icon-file {
        color: #1976D2; /* Blue - files */
    }
    
    .material-icons.icon-up-dir {
        color: #0288D1; /* Light Blue - parent directory */
    }
    
    /* Toolbar Action Icons */
    .material-icons.icon-create {
        color: #388E3C; /* Green - create new */
    }
    
    .material-icons.icon-rename {
        color: #1976D2; /* Blue - edit/rename */
    }
    
    .material-icons.icon-copy {
        color: #0288D1; /* Light Blue - copy */
    }
    
    .material-icons.icon-cut {
        color: #F57C00; /* Orange - cut */
    }
    
    .material-icons.icon-paste {
        color: #388E3C; /* Green - paste */
    }
    
    .material-icons.icon-delete {
        color: #D32F2F; /* Red - delete */
    }
    
    .material-icons.icon-download {
        color: #388E3C; /* Green - download */
    }
    
    .material-icons.icon-upload {
        color: #1976D2; /* Blue - upload */
    }
    
    .material-icons.icon-cancel {
        color: #757575; /* Gray - cancel/close */
    }
    
    .material-icons.icon-confirm {
        color: #388E3C; /* Green - confirm/check */
    }
    
    .material-icons.icon-refresh {
        color: #1976D2; /* Blue - refresh */
    }
    
    /* Hover States - Brighten colors on hover */
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-folder,
    .file-picker-list-table .file-icon .material-icons.icon-folder:hover {
        color: #FFC107;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-file,
    .file-picker-list-table .file-icon .material-icons.icon-file:hover {
        color: #2196F3;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-up-dir {
        color: #03A9F4;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-create {
        color: #4CAF50;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-rename {
        color: #2196F3;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-copy {
        color: #03A9F4;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-cut {
        color: #FF9800;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-paste {
        color: #4CAF50;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-delete {
        color: #F44336;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-download {
        color: #4CAF50;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-upload {
        color: #2196F3;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-cancel {
        color: #9E9E9E;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-confirm {
        color: #4CAF50;
    }
    
    .file-picker-menu-bar button:hover:not(:disabled) .material-icons.icon-refresh {
        color: #2196F3;
    }
    
    /* Disabled State - Gray out all icons */
    .file-picker-menu-bar button:disabled .material-icons {
        color: #BDBDBD !important;
    }
    /* ===== END MATERIAL ICONS COLOR CODING ===== */

    /* Main container for the file picker */
    .file-picker-container-wrapper {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border: 1px solid #ccc;
        font-family: 'Fira Code', 'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
        font-size: 14px;
        line-height: ${LINE_HEIGHT_EM};
        box-sizing: border-box;
    }
    
    /* Global box-sizing for descendants */
    .file-picker-container-wrapper * {
        box-sizing: border-box;
    }

    /* Title Bar Styles to show the full path */
    .file-picker-title-bar {
        background-color: #333;
        color: #fff;
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

    /* Menu bar similar to fileManager.js */
    .file-picker-menu-bar {
        width: 100%;
        border-collapse: collapse;
        background-color: #f8f8f8;
        border-bottom: 1px solid #eee;
        flex-shrink: 0;
        display: table;
        table-layout: fixed;
    }

    .file-picker-menu-bar tr {
        display: table-row;
    }

    .file-picker-menu-bar td {
        border: 1px solid #ddd;
        text-align: center;
        vertical-align: middle;
        padding: 0;
        display: table-cell;
    }

    .file-picker-menu-bar button {
        background-color: transparent;
        border: none;
        color: #555;
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
        background-color: #e0e0e0;
        border-color: #ccc;
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
        background-color: #e9e9e9;
        border-bottom: 1px solid #ddd;
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
        color: #555;
        cursor: pointer;
        font-size: 1em;
        padding: 0 5px;
        height: 100%;
        display: flex;
        align-items: center;
    }
    .file-picker-refresh-button:hover {
        background-color: #e0e0e0;
    }

    /* File list area */
    .file-picker-list-container {
        flex-grow: 1;
        overflow-y: auto;
        background-color: #ffffff;
        color: #000000;
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
        border-bottom: 1px solid #eee;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: middle;
    }

    .file-picker-list-table th {
        background-color: #f0f0f0;
        font-weight: bold;
        color: #333;
        position: sticky;
        top: 0;
        z-index: 1;
    }

    .file-picker-list-table tr:hover {
        background-color: #f5f5f5;
    }

    /* ===== FIX: Tighten spacing between Checkbox and File Name ===== */
    
    /* Column 1: Icon */
    .file-picker-list-table td:nth-child(1) { 
        width: 36px; 
        text-align: center; 
        padding: 4px 2px;
    } 
    
    /* Column 2: Checkbox - Reduced width and padding */
    .file-picker-list-table th:nth-child(2),
    .file-picker-list-table td:nth-child(2) {
        width: 35px;
        text-align: center !important;
        padding: 2px 4px !important;
    }

    /* Column 3: Name - Reduced left padding to pull closer to checkbox */
    .file-picker-list-table th:nth-child(3),
    .file-picker-list-table td:nth-child(3) {
        width: auto;
        text-align: left !important;
        padding-left: 4px !important;
    }
    
    /* Column 4: Size */
    .file-picker-list-table td:nth-child(4) { 
        width: 80px; 
        text-align: right; 
    }

    .file-picker-list-table .file-name,
    .file-picker-list-table .up-directory {
        cursor: pointer;
        color: #007bff;
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
    
    /* New Wrapper for Modal Dialogs */
    .file-picker-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 99999999999;
    }

    /* Popup Message Styles */
    .file-picker-popup {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: #4CAF50;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
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
        background-color: #f44336;
    }

    /* Confirmation Dialog Styles */
    .file-picker-confirm-dialog {
        background-color: #fff;
        border: 1px solid #ccc;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        z-index: 99999999999; 
        display: flex;
        flex-direction: column;
        gap: 15px;
        min-width: 280px;
        max-width: 90%;
    }

    .file-picker-confirm-dialog p {
        margin: 0;
        font-size: 1.1em;
        color: #333;
        text-align: center;
    }

    .file-picker-confirm-dialog-buttons {
        display: flex;
        justify-content: center;
        gap: 10px;
    }

    .file-picker-confirm-dialog-buttons button {
        background-color: #007bff;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1em;
        min-width: 80px;
    }

    .file-picker-confirm-dialog-buttons button.cancel {
        background-color: #6c757d;
    }

    .file-picker-confirm-dialog-buttons button:hover {
        background-color: #0056b3;
    }

    .file-picker-confirm-dialog-buttons button.cancel:hover {
        background-color: #5a6268;
    }

    /* Prompt Dialog Styles */
    .file-picker-prompt-dialog {
        background-color: #fff;
        border: 1px solid #ccc;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        z-index: 99999999999;
        display: flex;
        flex-direction: column;
        gap: 15px;
        min-width: 280px;
        max-width: 90%;
    }

    .file-picker-prompt-dialog p {
        margin: 0;
        font-size: 1.1em;
        color: #333;
        text-align: center;
    }

    .file-picker-prompt-dialog input[type="text"] {
        width: calc(100% - 16px);
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1em;
        box-sizing: border-box;
    }

    .file-picker-prompt-dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }

    .file-picker-prompt-dialog-buttons button {
        background-color: #007bff;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1em;
    }

    .file-picker-prompt-dialog-buttons button.cancel {
        background-color: #6c757d;
    }

    .file-picker-prompt-dialog-buttons button:hover {
        background-color: #0056b3;
    }

    .file-picker-prompt-dialog-buttons button.cancel:hover {
        background-color: #5a6268;
    }
    
    /* New Creation Dialog Styles (Prompt with Radio Buttons) */
    .file-picker-creation-dialog {
        background-color: #fff;
        border: 1px solid #ccc;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        z-index: 99999999999;
        display: flex; 
        flex-direction: column;
        gap: 15px;
        min-width: 320px; 
        max-width: 90%;
    }

    .file-picker-creation-dialog p {
        margin: 0;
        font-size: 1.1em;
        color: #333;
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
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1em;
        box-sizing: border-box;
    }

    .file-picker-creation-dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    
    .file-picker-creation-dialog-buttons button {
        background-color: #007bff;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1em;
    }

    .file-picker-creation-dialog-buttons button.cancel {
        background-color: #6c757d;
    }

    .file-picker-creation-dialog-buttons button:hover {
        background-color: #0056b3;
    }

    .file-picker-creation-dialog-buttons button.cancel:hover {
        background-color: #5a6268;
    }
    
    /* Button text span for "Use Path" button */
    .file-picker-menu-bar button .btn-text {
        font-size: 0.9em;
        margin-left: 2px;
        vertical-align: middle;
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
 * Shows a temporary popup message.
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
    popup.classList.remove('error', 'show'); // Reset classes
    if (isError) {
        popup.classList.add('error');
    }
    popup.classList.add('show');

    setTimeout(() => {
        popup.classList.remove('show');
    }, 3000); // Hide after 3 seconds
}

/**
 * Shows a confirmation dialog.
 * @param {string} message The confirmation message.
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if canceled.
 */
export function showConfirmDialog(message) {
    return new Promise(resolve => {
        const dialogOverlay = getDialogOverlay(); // Get the single overlay
        dialogOverlay.innerHTML = `
            <div class="file-picker-confirm-dialog">
                <p class="file-picker-confirm-message">${message}</p>
                <div class="file-picker-confirm-dialog-buttons">
                    <button class="confirm-ok">OK</button>
                    <button class="cancel">Cancel</button>
                </div>
            </div>
        `;

        const okBtn = dialogOverlay.querySelector('.confirm-ok');
        const cancelBtn = dialogOverlay.querySelector('.cancel');

        dialogOverlay.style.display = 'flex';

        const handleResolve = (result) => {
            dialogOverlay.style.display = 'none';
            resolve(result);
        }

        okBtn.addEventListener('click', () => handleResolve(true), { once: true });
        cancelBtn.addEventListener('click', () => handleResolve(false), { once: true });
    });
}

/**
 * Shows a prompt dialog for text input.
 * @param {string} message The prompt message.
 * @param {string} defaultValue The default value for the input.
 * @returns {Promise<string|null>} Resolves to the input string if OK, null if canceled.
 */
export function showPromptDialog(message, defaultValue = '') {
    return new Promise(resolve => {
        const dialogOverlay = getDialogOverlay(); // Get the single overlay
        dialogOverlay.innerHTML = `
            <div class="file-picker-prompt-dialog">
                <p class="file-picker-prompt-message">${message}</p>
                <input type="text" class="file-picker-prompt-input" value="${defaultValue}" />
                <div class="file-picker-prompt-dialog-buttons">
                    <button class="prompt-ok">OK</button>
                    <button class="cancel">Cancel</button>
                </div>
            </div>
        `;
        
        const inputEl = dialogOverlay.querySelector('.file-picker-prompt-input');
        const okBtn = dialogOverlay.querySelector('.prompt-ok');
        const cancelBtn = dialogOverlay.querySelector('.cancel');

        dialogOverlay.style.display = 'flex';
        inputEl.focus();
        inputEl.select(); // Select the default value

        const handleResolve = (result) => {
            // Remove listeners for Enter/Escape
            inputEl.removeEventListener('keydown', handleKeyDown);
            dialogOverlay.style.display = 'none';
            resolve(result);
        }
        
        const handleOk = () => handleResolve(inputEl.value);
        const handleCancel = () => handleResolve(null);
        
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        okBtn.addEventListener('click', handleOk, { once: true });
        cancelBtn.addEventListener('click', handleCancel, { once: true });
        inputEl.addEventListener('keydown', handleKeyDown);
    });
}

/**
 * Shows a dialog to create a new file or directory.
 * @returns {Promise<{name: string, type: 'file'|'directory'}|null>} Resolves to object with name and type, or null if canceled.
 */
export function showCreationDialog() {
    return new Promise(resolve => {
        const dialogOverlay = getDialogOverlay();
        dialogOverlay.innerHTML = `
            <div class="file-picker-creation-dialog">
                <p>Create New Item</p>
                
                <div class="file-picker-creation-dialog-options">
                    <label>
                        <input type="radio" name="creationType" value="file" checked>
                        <span class="material-icons material-icons-sm icon-file" aria-hidden="true">insert_drive_file</span> File
                    </label>
                    <label>
                        <input type="radio" name="creationType" value="directory">
                        <span class="material-icons material-icons-sm icon-folder" aria-hidden="true">folder</span> Directory
                    </label>
                </div>

                <input type="text" class="file-picker-item-name-input" placeholder="Enter name" />
                
                <div class="file-picker-creation-dialog-buttons">
                    <button class="create-ok">Create</button>
                    <button class="cancel">Cancel</button>
                </div>
            </div>
        `;

        const inputEl = dialogOverlay.querySelector('.file-picker-item-name-input');
        const okBtn = dialogOverlay.querySelector('.create-ok');
        const cancelBtn = dialogOverlay.querySelector('.cancel');

        dialogOverlay.style.display = 'flex';
        inputEl.focus();

        const handleResolve = (result) => {
            // Remove listeners for Enter/Escape
            inputEl.removeEventListener('keydown', handleKeyDown);
            dialogOverlay.style.display = 'none';
            resolve(result);
        }

        const handleOk = () => {
            const name = inputEl.value.trim();
            const type = dialogOverlay.querySelector('input[name="creationType"]:checked').value;

            if (!name) {
                inputEl.placeholder = "Name cannot be empty!";
                inputEl.focus();
                return;
            }

            handleResolve({ name, type });
        };
        const handleCancel = () => handleResolve(null);
        
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        okBtn.addEventListener('click', handleOk, { once: true });
        cancelBtn.addEventListener('click', handleCancel, { once: true });
        inputEl.addEventListener('keydown', handleKeyDown);
    });
}


/**
 * Gets or creates a single, global overlay for all dialogs.
 * This prevents z-index issues and provides a consistent modal experience.
 * @returns {HTMLElement} The dialog overlay element.
 */
export function getDialogOverlay() {
    let overlay = document.getElementById('file-picker-dialog-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'file-picker-dialog-overlay';
        overlay.className = 'file-picker-dialog-overlay';
        document.body.appendChild(overlay);
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
                        <td><button class="create-btn" title="Create New File or Directory"></button></td>
                        <td><button class="rename-btn" title="Rename" disabled></button></td>
                        <td><button class="copy-btn" title="Copy Selected" disabled></button></td>
                        <td><button class="cut-btn" title="Cut Selected" disabled></button></td>
                        <td><button class="paste-btn" title="Paste" disabled></button></td>
                        <td><button class="delete-btn" title="Delete Selected" disabled></button></td>
                        <td><button class="cancel-btn" title="Cancel"></button></td>
                        <td><button class="use-path-btn" title="Use Selected File Path"></button></td>
                    </tr>
                </tbody>
            </table>

            <div class="file-picker-path-display">
                <span class="file-picker-current-path">Path: ${initialPath}</span>
                <button class="file-picker-refresh-button" title="Refresh"></button>
            </div>

            <div class="file-picker-list-container">
                <table class="file-picker-list-table">
                    <thead>
                        <tr>
                            <th></th>
							<th><input type="checkbox" class="file-picker-select-all-checkbox" title="Select All"></th>
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