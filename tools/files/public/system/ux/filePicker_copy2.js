// ./system/ux/filePicker.js

import { api } from '/system/js/apiCalls.js';
import { 
    injectStyles,
    formatBytes,
    showPopupMessage,
    createPickerDOM,
    getDialogOverlay
} from './filePickerUI.js';

// --- Module-level Variables ---
let currentPath = '/';
let clipboard = { type: null, paths: [] };
let _onFilePickHandler = null;
let _onCancelHandler = null;
let selectedFilePath = null;

// --- Core File Picker Setup Function ---

/**
 * Sets up a file picker instance, handling DOM creation, event listeners,
 * and property emulation.
 * @param {HTMLElement|null} originalElement - The original <filepicker> element if converting, otherwise null.
 * @returns {HTMLElement} The outermost DOM element representing the file picker.
 */
function setupFilePickerInstance(originalElement = null) {
    injectStyles();

    // --- State Variables (Per Instance) ---
    let instanceCurrentPath = '/';
    let instanceClipboard = { type: null, paths: [] };
    let instanceOnFilePickHandler = null;
    let instanceOnCancelHandler = null;
    let instanceSelectedFilePath = null;
    let instanceSelectedFileType = null;

    // Store original attributes from <filepicker> for emulation
    let originalId = null;
    let originalClass = null;
    let originalOnFilePickAttribute = null;
    let originalOnCancelAttribute = null;
    let originalButtonTextAttribute = null;
    let initialFilePathAttribute = null;

    if (originalElement) {
        originalId = originalElement.id;
        originalClass = originalElement.className;
        originalOnFilePickAttribute = originalElement.getAttribute('onfilepick');
        originalOnCancelAttribute = originalElement.getAttribute('oncancel');
        originalButtonTextAttribute = originalElement.getAttribute('useFileButtonText');
        initialFilePathAttribute = originalElement.getAttribute('file-path');
        if (initialFilePathAttribute) {
            const pathParts = initialFilePathAttribute.split('/');
            pathParts.pop(); 
            instanceCurrentPath = pathParts.join('/') + (pathParts.length > 1 ? '/' : '');
            if (pathParts.length === 1 && pathParts[0] === '') instanceCurrentPath = '/';
        }
    }

    // --- Create DOM Elements and Get References ---
    const pickerContainer = createPickerDOM(originalClass, originalId, instanceCurrentPath);
    const titleTextEl = pickerContainer.querySelector('.file-picker-title-text');
    const createButton = pickerContainer.querySelector('.create-btn'); 
    const renameButton = pickerContainer.querySelector('.rename-btn');
    const copyButton = pickerContainer.querySelector('.copy-btn');
    const cutButton = pickerContainer.querySelector('.cut-btn');
    const pasteButton = pickerContainer.querySelector('.paste-btn');
    const deleteButton = pickerContainer.querySelector('.delete-btn');
    
    // --- DOWNLOAD/UPLOAD BUTTON ADDITION ---
    const downloadButton = document.createElement('button');
    downloadButton.className = 'download-btn';
    downloadButton.title = 'Download/Upload'; 
    
    const menuRow = pickerContainer.querySelector('.file-picker-menu-bar tbody tr');
    const deleteCell = deleteButton.closest('td');
    if (deleteCell) {
        const downloadCell = document.createElement('td');
        downloadCell.appendChild(downloadButton);
        const cancelButtonCell = pickerContainer.querySelector('.cancel-btn').closest('td');
        menuRow.insertBefore(downloadCell, cancelButtonCell);
    }
    // --- END DOWNLOAD/UPLOAD BUTTON ADDITION ---

    const cancelButton = pickerContainer.querySelector('.cancel-btn');
    const usePathButton = pickerContainer.querySelector('.use-path-btn');
    const currentPathSpan = pickerContainer.querySelector('.file-picker-current-path');
    const refreshButton = pickerContainer.querySelector('.file-picker-refresh-button');
    const fileListTable = pickerContainer.querySelector('.file-picker-list-table');
    const fileListTbody = pickerContainer.querySelector('.file-picker-list-table tbody');
    const selectAllCheckbox = pickerContainer.querySelector('.file-picker-select-all-checkbox');

    // ✅ Get instance-specific dialog overlay
    const instanceDialogOverlay = getDialogOverlay(pickerContainer);

    // --- UPDATE BUTTON ICONS WITH MATERIAL ICONS ---
    createButton.innerHTML = '<i class="material-icons material-icons-lg icon-create" aria-hidden="true">create_new_folder</i>';
    createButton.title = "Create New File or Directory";

    renameButton.innerHTML = '<i class="material-icons material-icons-lg icon-rename" aria-hidden="true">edit</i>';
    renameButton.title = "Rename";

    copyButton.innerHTML = '<i class="material-icons material-icons-lg icon-copy" aria-hidden="true">content_copy</i>';
    copyButton.title = "Copy Selected";

    cutButton.innerHTML = '<i class="material-icons material-icons-lg icon-cut" aria-hidden="true">content_cut</i>';
    cutButton.title = "Cut Selected";

    pasteButton.innerHTML = '<i class="material-icons material-icons-lg icon-paste" aria-hidden="true">content_paste</i>';
    pasteButton.title = "Paste";

    deleteButton.innerHTML = '<i class="material-icons material-icons-lg icon-delete" aria-hidden="true">delete_outline</i>';
    deleteButton.title = "Delete Selected";

    downloadButton.innerHTML = '<i class="material-icons material-icons-lg icon-download" aria-hidden="true">file_download</i>';
    downloadButton.title = 'Download/Upload';

    cancelButton.innerHTML = '<i class="material-icons material-icons-lg icon-cancel" aria-hidden="true">close</i>';
    cancelButton.title = "Cancel";

    usePathButton.innerHTML = '<i class="material-icons material-icons-lg icon-confirm" aria-hidden="true">check</i>';
    usePathButton.title = "Use Selected File Path";

    refreshButton.innerHTML = '<i class="material-icons material-icons-sm icon-refresh" aria-hidden="true">refresh</i>';
    refreshButton.title = "Refresh";
    // --- END BUTTON ICON UPDATES ---

    /** Executes a string-based event handler from an HTML attribute. */
    const executeAttributeHandler = (handlerCode, scope, ...args) => {
        if (!handlerCode) return;
        try {
            const fn = new Function('event', 'filePath', handlerCode);
            fn.apply(scope, args);
        } catch (err) {
            console.error("Error executing attribute handler:", handlerCode, err);
        }
    };

    // Emulate 'onfilepick' property
    Object.defineProperty(pickerContainer, 'onfilepick', {
        get() { return instanceOnFilePickHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                instanceOnFilePickHandler = newValue;
            } else {
                console.warn("Attempted to set onfilepick to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // Emulate 'oncancel' property
    Object.defineProperty(pickerContainer, 'oncancel', {
        get() { return instanceOnCancelHandler; },
        set(newValue) {
            if (typeof newValue === 'function' || newValue === null) {
                instanceOnCancelHandler = newValue;
            } else {
                console.warn("Attempted to set oncancel to a non-function value:", newValue);
            }
        },
        configurable: true
    });

    // Emulate a 'filePath' property
    Object.defineProperty(pickerContainer, 'filePath', {
        get() { return instanceSelectedFilePath; },
        set(newValue) {
            if (typeof newValue === 'string') {
                const normalizedPath = newValue.endsWith('/') ? newValue.slice(0, -1) : newValue;
                const pathParts = normalizedPath.split('/');
                pathParts.pop();
                const dirPath = pathParts.join('/') + (pathParts.length > 1 ? '/' : '');
                
                renderFileList(dirPath || '/').then(() => {
                    const checkbox = fileListTbody.querySelector(`.file-checkbox[data-path="${normalizedPath}"]`);
                    const row = checkbox ? checkbox.closest('tr') : fileListTbody.querySelector(`.file-name[data-path="${normalizedPath}"]`)?.closest('tr');
                    
                    if (checkbox) {
                        checkbox.checked = true;
                        instanceSelectedFilePath = normalizedPath;
                        instanceSelectedFileType = row.dataset.type;
                        titleTextEl.textContent = normalizedPath;
                    } else if (row) {
                        instanceSelectedFilePath = normalizedPath;
                        instanceSelectedFileType = row.dataset.type;
                        titleTextEl.textContent = normalizedPath;
                    } else {
                        console.warn(`File or directory '${newValue}' not found.`);
                        instanceSelectedFilePath = null;
                        instanceSelectedFileType = null;
                        titleTextEl.textContent = 'No file selected';
                    }
                    updateButtonStates();
                });
            } else {
                console.warn("Attempted to set filePath to a non-string value:", newValue);
            }
        },
        configurable: true
    });

    // Emulate dom.buttonText property
    Object.defineProperty(pickerContainer, 'dom.buttonText', {
        get() { 
            const span = usePathButton.querySelector('.btn-text');
            return span ? span.textContent : ''; 
        },
        set(newValue) {
            if (newValue && typeof newValue === 'string') {
                let span = usePathButton.querySelector('.btn-text');
                if (!span) {
                    span = document.createElement('span');
                    span.className = 'btn-text';
                    usePathButton.appendChild(span);
                }
                span.textContent = newValue;
                usePathButton.title = `Use Selected File Path (${newValue})`;
            }
        },
        configurable: true
    });

    // Initialize handlers from attributes if present
    if (originalOnFilePickAttribute) {
        pickerContainer.onfilepick = (e, filePath) => executeAttributeHandler(originalOnFilePickAttribute, pickerContainer, e, filePath);
    }
    if (originalOnCancelAttribute) {
        pickerContainer.oncancel = (e) => executeAttributeHandler(originalOnCancelAttribute, pickerContainer, e);
    }
    if (originalButtonTextAttribute) {
        pickerContainer['dom.buttonText'] = originalButtonTextAttribute;
    }

    // ✅ INSTANCE-SPECIFIC DIALOG FUNCTIONS (Centered within picker)
    
    /** Shows a confirmation dialog centered in the picker. */
    const showConfirmDialog = (message) => {
        return new Promise(resolve => {
            instanceDialogOverlay.innerHTML = `
                <div class="file-picker-confirm-dialog">
                    <p class="file-picker-confirm-message">${message}</p>
                    <div class="file-picker-confirm-dialog-buttons">
                        <button class="confirm-ok">OK</button>
                        <button class="cancel">Cancel</button>
                    </div>
                </div>
            `;

            const okBtn = instanceDialogOverlay.querySelector('.confirm-ok');
            const cancelBtn = instanceDialogOverlay.querySelector('.cancel');

            instanceDialogOverlay.style.display = 'flex';

            const handleResolve = (result) => {
                instanceDialogOverlay.style.display = 'none';
                resolve(result);
            }

            okBtn.addEventListener('click', () => handleResolve(true), { once: true });
            cancelBtn.addEventListener('click', () => handleResolve(false), { once: true });
        });
    };

    /** Shows a prompt dialog centered in the picker. */
    const showPromptDialog = (message, defaultValue = '') => {
        return new Promise(resolve => {
            instanceDialogOverlay.innerHTML = `
                <div class="file-picker-prompt-dialog">
                    <p class="file-picker-prompt-message">${message}</p>
                    <input type="text" class="file-picker-prompt-input" value="${defaultValue}" />
                    <div class="file-picker-prompt-dialog-buttons">
                        <button class="prompt-ok">OK</button>
                        <button class="cancel">Cancel</button>
                    </div>
                </div>
            `;
            
            const inputEl = instanceDialogOverlay.querySelector('.file-picker-prompt-input');
            const okBtn = instanceDialogOverlay.querySelector('.prompt-ok');
            const cancelBtn = instanceDialogOverlay.querySelector('.cancel');

            instanceDialogOverlay.style.display = 'flex';
            inputEl.focus();
            inputEl.select();

            const handleResolve = (result) => {
                inputEl.removeEventListener('keydown', handleKeyDown);
                instanceDialogOverlay.style.display = 'none';
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
    };

    /** Shows a creation dialog centered in the picker. */
    const showCreationDialog = () => {
        return new Promise(resolve => {
            instanceDialogOverlay.innerHTML = `
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

            const inputEl = instanceDialogOverlay.querySelector('.file-picker-item-name-input');
            const okBtn = instanceDialogOverlay.querySelector('.create-ok');
            const cancelBtn = instanceDialogOverlay.querySelector('.cancel');

            instanceDialogOverlay.style.display = 'flex';
            inputEl.focus();

            const handleResolve = (result) => {
                inputEl.removeEventListener('keydown', handleKeyDown);
                instanceDialogOverlay.style.display = 'none';
                resolve(result);
            }

            const handleOk = () => {
                const name = inputEl.value.trim();
                const type = instanceDialogOverlay.querySelector('input[name="creationType"]:checked').value;

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
    };

    // ✅ INSTANCE-SCOPED POPUP MESSAGE (centered within picker container)
    const showInstancePopupMessage = (message, isError = false) => {
        let popup = pickerContainer.querySelector('.file-picker-popup-contained');
        if (!popup) {
            popup = document.createElement('div');
            popup.className = 'file-picker-popup-contained';
            pickerContainer.appendChild(popup);
        }

        popup.textContent = message;
        popup.classList.remove('error', 'show');
        if (isError) popup.classList.add('error');
        
        // Force reflow to restart transition
        void popup.offsetWidth;
        popup.classList.add('show');

        setTimeout(() => {
            popup.classList.remove('show');
        }, 3000);
    };

    // --- Core File Picker Functions ---

    const updateButtonStates = () => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const hasSelection = selectedCheckboxes.length > 0;
        const isSingleSelection = selectedCheckboxes.length === 1;

        copyButton.disabled = !hasSelection;
        cutButton.disabled = !hasSelection;
        deleteButton.disabled = !hasSelection;
        renameButton.disabled = !isSingleSelection;
        
        const isSingleFileSelection = isSingleSelection && 
            fileListTbody.querySelector(`.file-checkbox[data-path="${instanceSelectedFilePath}"]`)?.closest('tr')?.dataset.type === 'file';
        
        if (isSingleFileSelection) {
            downloadButton.innerHTML = '<i class="material-icons material-icons-lg icon-download" aria-hidden="true">file_download</i>';
            downloadButton.title = 'Download Selected File';
            downloadButton.disabled = false;
        } else {
            downloadButton.innerHTML = '<i class="material-icons material-icons-lg icon-upload" aria-hidden="true">file_upload</i>';
            downloadButton.title = 'Upload File to Current Directory';
            downloadButton.disabled = false;
        }
        
        pasteButton.disabled = instanceClipboard.type === null || instanceClipboard.paths.length === 0;

        const isSingleItemPath = instanceSelectedFilePath && instanceSelectedFilePath !== 'Multiple files selected';
        const isGoUpDir = instanceSelectedFilePath && instanceSelectedFilePath.endsWith('/..');
        usePathButton.disabled = !isSingleItemPath || isGoUpDir;
        
        const allCheckboxes = fileListTbody.querySelectorAll('.file-checkbox');
        const allFileCheckboxes = Array.from(allCheckboxes).filter(cb => !cb.closest('.up-directory-row'));
        selectAllCheckbox.checked = allFileCheckboxes.length > 0 && selectedCheckboxes.length === allFileCheckboxes.length;
        selectAllCheckbox.indeterminate = selectedCheckboxes.length > 0 && selectedCheckboxes.length < allFileCheckboxes.length;
    };

    const renderFileList = async (path) => {
        instanceCurrentPath = path;
        currentPathSpan.textContent = `Path: ${instanceCurrentPath}`;
        fileListTbody.innerHTML = '';
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;

        instanceSelectedFilePath = null;
        instanceSelectedFileType = null;
        titleTextEl.textContent = 'No file selected';

        try {
            const files = await api.ls(instanceCurrentPath === '/' ? '*' : `${instanceCurrentPath.endsWith('/') ? instanceCurrentPath + '*' : instanceCurrentPath + '/*'}`);
            let fileListHtml = '';
            
            if (instanceCurrentPath !== '/') {
                const parentPath = instanceCurrentPath.split('/').filter(p => p).slice(0, -1).join('/') + '/';
                const upPath = parentPath === '/' ? '/' : parentPath || '/';

                fileListHtml += `
                    <tr class="up-directory-row" data-type="directory">
                        <td><i class="material-icons material-icons-sm icon-up-dir" aria-hidden="true">arrow_upward</i></td>
						<td><input type="checkbox" class="file-checkbox" data-path="${upPath}/.." disabled aria-label="Parent directory"></td>
                        <td class="file-name up-directory" data-path="${upPath}">..</td>
                        <td></td>
                    </tr>
                `;
            }
            
            files.sort((a, b) => {
                if (a.type === 'directory' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });
            
            const normalizedCurrentPath = instanceCurrentPath.endsWith('/') ? instanceCurrentPath : instanceCurrentPath + '/';

            files.forEach(file => {
                const icon = file.type === 'directory' 
                    ? '<i class="material-icons material-icons-sm icon-folder" aria-hidden="true">folder</i>' 
                    : '<i class="material-icons material-icons-sm icon-file" aria-hidden="true">insert_drive_file</i>';
                
                const size = file.type === 'file' ? formatBytes(file.size) : '';
                const fullPath = normalizedCurrentPath + file.name;
                const dataType = file.type === 'directory' ? 'data-type="directory"' : 'data-type="file"';

                fileListHtml += `
                    <tr ${dataType}>
                        <td class="file-icon">${icon}</td>
						<td><input type="checkbox" class="file-checkbox" data-path="${fullPath}" aria-label="Select ${file.name}"></td>
                        <td class="file-name" data-path="${fullPath}">${file.name}</td>
                        <td class="file-size-cell">${size}</td>
                    </tr>
                `;
            });
            fileListTbody.innerHTML = fileListHtml;
            updateButtonStates();
        } catch (error) {
            console.error("Error rendering file list:", error);
            showPopupMessage(`Error: ${error.message || 'Failed to list files.'}`, true);
            fileListTbody.innerHTML = `<tr><td colspan="4">Error loading files: ${error.message || 'Unknown error'}</td></tr>`;
        }
    };
    
    const updateSelectionState = (path) => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const checkedCount = selectedCheckboxes.length;
        
        if (checkedCount === 1) {
            const checkedBox = selectedCheckboxes[0];
            instanceSelectedFilePath = checkedBox.dataset.path;
            const row = checkedBox.closest('tr');
            instanceSelectedFileType = row.dataset.type;
            titleTextEl.textContent = instanceSelectedFilePath;
        } else if (checkedCount > 1) {
            instanceSelectedFilePath = 'Multiple files selected';
            instanceSelectedFileType = null;
            titleTextEl.textContent = instanceSelectedFilePath;
        } else {
            const selectedDirNameEl = fileListTbody.querySelector(`.file-name[data-path="${path}"]`);
            if (selectedDirNameEl && selectedDirNameEl.closest('tr').dataset.type === 'directory') {
                instanceSelectedFilePath = path;
                instanceSelectedFileType = 'directory';
                titleTextEl.textContent = path;
            } else {
                instanceSelectedFilePath = null;
                instanceSelectedFileType = null;
                titleTextEl.textContent = 'No file selected';
            }
        }
        updateButtonStates();
    };

    const getSelectedPaths = () => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const paths = Array.from(selectedCheckboxes)
            .map(cb => cb.dataset.path)
            .filter(name => name);
        
        return paths;
    };
    
    const handleRename = async () => {
        const selected = getSelectedPaths();
        if (selected.length !== 1) {
            showInstancePopupMessage("Please select exactly one item to rename.", true);
            return;
        }

        const oldPath = selected[0];
        const oldName = oldPath.split('/').pop();
        const newName = await showPromptDialog(`Rename '${oldName}' to:`, oldName);

        if (newName === null || !newName.trim()) {
            showInstancePopupMessage("Rename cancelled.", true);
            return;
        }

        const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
        const newPath = parentDir + newName;
        
        try {
            await api.rn(oldPath, newPath);
            showInstancePopupMessage(`Renamed '${oldName}' to '${newName}' successfully.`);
            renderFileList(instanceCurrentPath);
        } catch (error) {
            console.error("Error renaming item:", error);
            showPopupMessage(`Failed to rename: ${error.message}`, true);
        }
    };

    const handleCreate = async () => {
        const result = await showCreationDialog();
        
        if (result === null || !result.name.trim()) {
            showInstancePopupMessage("Creation cancelled.", true);
            return;
        }

        const { name, type } = result;
        const normalizedName = name.trim();
        const pathSuffix = type === 'directory' ? '/' : '';
        const fullPath = instanceCurrentPath.endsWith('/') ? `${instanceCurrentPath}${normalizedName}${pathSuffix}` : `${instanceCurrentPath}/${normalizedName}${pathSuffix}`;

        try {
            if (type === 'file') {
                await api.saveFile(fullPath, '');
                showInstancePopupMessage(`File '${normalizedName}' created successfully.`);
            } else {
                await api.mkPath(fullPath);
                showInstancePopupMessage(`Directory '${normalizedName}' created successfully.`);
            }
            renderFileList(instanceCurrentPath);
        } catch (error) {
            console.error(`Error creating ${type}:`, error);
            showPopupMessage(`Failed to create ${type} '${normalizedName}': ${error.message}`, true);
        }
    };

    const handleCopy = () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showInstancePopupMessage("No items selected to copy.", true);
            return;
        }
        instanceClipboard.type = 'copy';
        instanceClipboard.paths = selected;
        showInstancePopupMessage(`Copied ${selected.length} item(s) to clipboard.`);
        updateButtonStates();
    };

    const handleCut = () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showInstancePopupMessage("No items selected to cut.", true);
            return;
        }
        instanceClipboard.type = 'cut';
        instanceClipboard.paths = selected;
        showInstancePopupMessage(`Cut ${selected.length} item(s) to clipboard.`);
        updateButtonStates();
    };

    const handlePaste = async () => {
        if (instanceClipboard.type === null || instanceClipboard.paths.length === 0) {
            showInstancePopupMessage("Clipboard is empty.", true);
            return;
        }

        const destination = instanceCurrentPath.endsWith('/') ? instanceCurrentPath : instanceCurrentPath + '/';
        let successCount = 0;
        let failCount = 0;

        let filesInDest = [];
        try {
            const lsPath = destination === '/' ? '*' : destination + '*';
            filesInDest = await api.ls(lsPath); 
        } catch (error) {
            console.error("Error fetching destination list:", error);
        }

        for (const sourcePath of instanceClipboard.paths) {
            const fileName = sourcePath.split('/').pop();
            let newFileName = fileName;

            if (instanceClipboard.type === 'copy') {
                let fileExists = filesInDest.some(f => f.name === newFileName);

                if (fileExists) {
                    let copyIndex = 0;
                    let foundUniqueName = false;
                    while (!foundUniqueName) {
                        const nameParts = newFileName.split('.');
                        const nameBase = nameParts.length > 1 ? nameParts.slice(0, -1).join('.') : newFileName;
                        const nameExt = nameParts.length > 1 ? `.${nameParts.pop()}` : '';
                        const baseWithoutCopy = nameBase.replace(/_copy\d+$/, '');
                        const testName = `${baseWithoutCopy}_copy${copyIndex}${nameExt}`;
                        const nameExists = filesInDest.some(f => f.name === testName);
                        
                        if (!nameExists) {
                            newFileName = testName;
                            foundUniqueName = true;
                        } else {
                            copyIndex++;
                        }
                    }
                }
            }

            try {
                if (instanceClipboard.type === 'copy') {
                    await api.copy(sourcePath, destination + newFileName);
                } else if (instanceClipboard.type === 'cut') {
                    await api.mv(sourcePath, destination);
                }
                successCount++;
            } catch (error) {
                console.error(`Error during paste operation for ${sourcePath}:`, error);
                showInstancePopupMessage(`Failed to ${instanceClipboard.type} ${sourcePath.split('/').pop()}: ${error.message}`, true);
                failCount++;
            }
        }

        if (successCount > 0) {
            showInstancePopupMessage(`${successCount} item(s) ${instanceClipboard.type}ed successfully.`);
        }
        if (failCount > 0) {
            showInstancePopupMessage(`${failCount} item(s) failed to ${instanceClipboard.type}.`, true);
        }

        if (instanceClipboard.type === 'cut' && failCount === 0) {
            instanceClipboard = { type: null, paths: [] };
        }
        renderFileList(instanceCurrentPath);
        updateButtonStates();
    };

    const handleDelete = async () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showInstancePopupMessage("No items selected to delete.", true);
            return;
        }

        const message = instanceCurrentPath.startsWith('/trash/')
            ? `Are you sure you want to permanently delete ${selected.length} selected item(s)? This action cannot be undone.`
            : `Are you sure you want to move ${selected.length} selected item(s) to /trash?`;

        const confirm = await showConfirmDialog(message);
        if (!confirm) {
            showInstancePopupMessage("Deletion cancelled.", true);
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const name of selected) {
            try {
                if (instanceCurrentPath.startsWith('/trash/')) {
                    await api.del(name);
                } else {
                    await api.mv(name, '/trash/');
                }
                successCount++;
            } catch (error) {
                console.error(`Error deleting/moving ${name}:`, error);
                showInstancePopupMessage(`Failed to delete/move ${name}: ${error.message}`, true);
                failCount++;
            }
        }

        if (successCount > 0) {
            showInstancePopupMessage(`${successCount} item(s) ${instanceCurrentPath.startsWith('/trash/') ? 'deleted permanently' : 'moved to trash'} successfully.`);
        }
        if (failCount > 0) {
            showInstancePopupMessage(`${failCount} item(s) failed to delete/move.`, true);
        }

        renderFileList(instanceCurrentPath);
        updateButtonStates();
    };
    
    const handleDownload = async () => {
        showInstancePopupMessage(`Starting download for ${instanceSelectedFilePath.split('/').pop()}...`);

        try {
            const arrayBuffer = await api.readFileBinary(instanceSelectedFilePath);
            const fileName = instanceSelectedFilePath.split('/').pop();
            const blob = new Blob([arrayBuffer]);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName; 
            
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showInstancePopupMessage(`Download of '${fileName}' completed.`);

        } catch (error) {
            console.error("Error during file download:", error);
            showPopupMessage(`Download failed: ${error.message}`, true);
        }
    };
    
    const handleUpload = () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.display = 'none';
        fileInput.multiple = false;
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) {
                document.body.removeChild(fileInput);
                return;
            }

            const destinationPath = instanceCurrentPath.endsWith('/') ? instanceCurrentPath : instanceCurrentPath + '/';
            const fullPath = destinationPath + file.name;

            showInstancePopupMessage(`Uploading '${file.name}' (${formatBytes(file.size)})...`);

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('path', fullPath);

                const xhr = new XMLHttpRequest();
                
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = Math.round((event.loaded / event.total) * 100);
                        showInstancePopupMessage(`Uploading '${file.name}': ${percentComplete}% (${formatBytes(event.loaded)} / ${formatBytes(event.total)})`);
                    }
                });
                
                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        showInstancePopupMessage(`✅ File '${file.name}' uploaded successfully!`);
                        renderFileList(instanceCurrentPath);
                    } else {
                        const errorText = xhr.responseText || 'Unknown error';
                        console.error("Upload failed:", errorText);
                        showPopupMessage(`❌ Upload failed: ${errorText}`, true);
                    }
                });
                
                xhr.addEventListener('error', () => {
                    console.error("Network error during upload");
                    showPopupMessage(`❌ Network error during upload`, true);
                });
                
                xhr.addEventListener('abort', () => {
                    showInstancePopupMessage(`Upload cancelled`, true);
                });
                
                xhr.open('POST', '/upload', true);
                xhr.send(formData);
                
            } catch (error) {
                console.error("Error initiating file upload:", error);
                showPopupMessage(`Upload failed for '${file.name}': ${error.message}`, true);
            } finally {
                document.body.removeChild(fileInput);
            }
        });

        document.body.appendChild(fileInput);
        fileInput.click();
    };
    
    const handleDownloadOrUpload = (e) => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const isSingleFileSelected = selectedCheckboxes.length === 1 && 
            fileListTbody.querySelector(`.file-checkbox[data-path="${instanceSelectedFilePath}"]`)?.closest('tr')?.dataset.type === 'file';

        if (isSingleFileSelected) {
            handleDownload(e);
        } else {
            handleUpload();
        }
    };

    const handleUsePath = (e) => {
        if (!instanceSelectedFilePath || instanceSelectedFilePath === 'Multiple files selected') {
            showInstancePopupMessage("Please select a single file or directory path to use.", true);
            return;
        }

        if (instanceOnFilePickHandler) {
            try {
                instanceOnFilePickHandler.call(pickerContainer, e, instanceSelectedFilePath);
            } catch (err) {
                console.error("Error executing programmatic onfilepick handler:", err);
            }
        } else if (originalOnFilePickAttribute) {
            executeAttributeHandler(originalOnFilePickAttribute, pickerContainer, e, instanceSelectedFilePath);
        }

        pickerContainer.dispatchEvent(new CustomEvent('filepick', {
            detail: { filePath: instanceSelectedFilePath },
            bubbles: true,
            composed: true
        }));
    };

    const handleCancel = (e) => {
        if (instanceOnCancelHandler) {
            try {
                instanceOnCancelHandler.call(pickerContainer, e);
            } catch (err) {
                console.error("Error executing programmatic oncancel handler:", err);
            }
        }
        if (originalOnCancelAttribute) {
            executeAttributeHandler(originalOnCancelAttribute, pickerContainer, e);
        }

        pickerContainer.dispatchEvent(new CustomEvent('cancel', {
            bubbles: true,
            composed: true
        }));
    };

    // --- Event Listeners ---

    if (initialFilePathAttribute) {
        pickerContainer.filePath = initialFilePathAttribute;
    } else {
        renderFileList(instanceCurrentPath);
    }
    updateButtonStates();

    createButton.addEventListener('click', handleCreate); 
    renameButton.addEventListener('click', handleRename);
    copyButton.addEventListener('click', handleCopy);
    cutButton.addEventListener('click', handleCut);
    pasteButton.addEventListener('click', handlePaste);
    deleteButton.addEventListener('click', handleDelete);
    downloadButton.addEventListener('click', handleDownloadOrUpload); 
    refreshButton.addEventListener('click', () => renderFileList(instanceCurrentPath));
    cancelButton.addEventListener('click', handleCancel);
    usePathButton.addEventListener('click', handleUsePath);

    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const checkboxes = fileListTbody.querySelectorAll('.file-checkbox');
        checkboxes.forEach(cb => {
            if (!cb.closest('.up-directory-row')) {
                cb.checked = isChecked;
            }
        });

        const checkedBoxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const checkedCount = checkedBoxes.length;

        if (checkedCount > 1) {
            instanceSelectedFilePath = 'Multiple files selected';
            instanceSelectedFileType = null;
            titleTextEl.textContent = instanceSelectedFilePath;
        } else if (checkedCount === 1) {
            const checkedBox = checkedBoxes[0];
            instanceSelectedFilePath = checkedBox.dataset.path;
            instanceSelectedFileType = checkedBox.closest('tr').dataset.type;
            titleTextEl.textContent = instanceSelectedFilePath;
        } else {
            instanceSelectedFilePath = null;
            instanceSelectedFileType = null;
            titleTextEl.textContent = 'No file selected';
        }

        updateButtonStates();
    });

    fileListTbody.addEventListener('click', (e) => {
        const targetRow = e.target.closest('tr');
        if (!targetRow) return;

        const nameCell = targetRow.querySelector('.file-name');
        
        if (targetRow.classList.contains('up-directory-row')) {
            const upPath = nameCell.dataset.path;
            renderFileList(upPath);
            return;
        }

        const fullPath = nameCell.dataset.path;
        const isDirectory = targetRow.dataset.type === 'directory';
        const checkbox = targetRow.querySelector('.file-checkbox');
        const isCheckboxClick = e.target.classList.contains('file-checkbox');
        
        if (nameCell && !isCheckboxClick) {
            if (isDirectory) {
                if (e.target.classList.contains('file-name')) {
                    renderFileList(fullPath + '/');
                } else {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });

    fileListTbody.addEventListener('change', (e) => {
        if (e.target.classList.contains('file-checkbox')) {
            const fullPath = e.target.dataset.path;
            updateSelectionState(fullPath); 
        }
    });

    const checkResize = () => {
        const containerWidth = pickerContainer.offsetWidth;
        const sizeCells = fileListTable.querySelectorAll('.file-size-cell');
        
        if (containerWidth < 400) {
            fileListTable.querySelector('thead th:nth-child(3)').style.display = 'none';
            sizeCells.forEach(cell => cell.style.display = 'none');
        } else {
            fileListTable.querySelector('thead th:nth-child(3)').style.display = 'table-cell';
            sizeCells.forEach(cell => cell.style.display = 'table-cell');
        }
    };

    const resizeObserver = new ResizeObserver(checkResize);
    resizeObserver.observe(pickerContainer);

    return pickerContainer;
}

// --- Public function to create a new file picker programmatically. ---
export function createfilePicker() {
    const dialogWrapper = document.createElement('div');
    dialogWrapper.className = 'file-picker-dialog-wrapper';
    dialogWrapper.style.position = 'fixed';
    dialogWrapper.style.top = '50%';
    dialogWrapper.style.left = '50%';
    dialogWrapper.style.transform = 'translate(-50%, -50%)';
    dialogWrapper.style.width = '80%';
    dialogWrapper.style.height = '80%';
    dialogWrapper.style.maxWidth = '600px';
    dialogWrapper.style.maxHeight = '800px';
    dialogWrapper.style.zIndex = '99999999999';

    const filePickerInstance = setupFilePickerInstance();
    dialogWrapper.appendChild(filePickerInstance);

    return dialogWrapper;
}

// --- DOM Observation for <filepicker> tags ---
function observeFilePickerElements() {
    document.querySelectorAll('filepicker').forEach(filepickerElement => {
        const parentContainer = filepickerElement.parentNode;
        if (parentContainer) {
            const pickerDom = setupFilePickerInstance(filepickerElement);
            parentContainer.replaceChild(pickerDom, filepickerElement);
        } else {
            console.warn("Found <filepicker> element without a parent, cannot convert:", filepickerElement);
        }
    });

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.tagName === 'FILEPICKER') {
                        const parentContainer = node.parentNode;
                        if (parentContainer) {
                            const pickerDom = setupFilePickerInstance(node);
                            parentContainer.replaceChild(pickerDom, node);
                        }
                    } else if (node.nodeType === 1) {
                        node.querySelectorAll('filepicker').forEach(filepickerElement => {
                            const parentContainer = filepickerElement.parentNode;
                            if (parentContainer) {
                                const pickerDom = setupFilePickerInstance(filepickerElement);
                                parentContainer.replaceChild(pickerDom, filepickerElement);
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

// --- Initialize on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    observeFilePickerElements();
});