// ./ux/filePicker.js

import { api } from 'apiCalls';
import { 
    injectStyles,
    formatBytes,
    showPopupMessage,
    showConfirmDialog,
    showPromptDialog,
    showCreationDialog,
    createPickerDOM
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
    // These need to be instance-specific, so they are re-declared here for each new instance.
    let instanceCurrentPath = '/';
    let instanceClipboard = { type: null, paths: [] };
    let instanceOnFilePickHandler = null;
    let instanceOnCancelHandler = null;
    let instanceSelectedFilePath = null;
    let instanceSelectedFileType = null; // Track type for download check

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
            // Find the directory path from the file path
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
    // Note: The icon and title will be set dynamically in updateButtonStates
    const downloadButton = document.createElement('button');
    downloadButton.className = 'download-btn';
    downloadButton.title = 'Download/Upload'; 
    downloadButton.textContent = '🔄'; // Placeholder icon
    
    // Inject the download button into the menu bar's table row (after delete)
    const menuRow = pickerContainer.querySelector('.file-picker-menu-bar tbody tr');
    const deleteCell = deleteButton.closest('td');
    if (deleteCell) {
        const downloadCell = document.createElement('td');
        downloadCell.appendChild(downloadButton);
        // Insert before cancel button's cell
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
                        instanceSelectedFileType = row.dataset.type; // Set type
                        titleTextEl.textContent = normalizedPath;
                    } else if (row) {
                        instanceSelectedFilePath = normalizedPath;
                        instanceSelectedFileType = row.dataset.type; // Set type
                        titleTextEl.textContent = normalizedPath;
                    } else {
                        console.warn(`File or directory '${newValue}' not found.`);
                        instanceSelectedFilePath = null;
                        instanceSelectedFileType = null; // Clear type
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

    Object.defineProperty(pickerContainer, 'dom.buttonText', {
        get() { return usePathButton.textContent; },
        set(newValue) {
            if (newValue && typeof newValue === 'string') {
                usePathButton.textContent = newValue; // Update button text
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


    // --- Core File Picker Functions ---

    /**
     * Updates button states based on selection and clipboard.
     */
    const updateButtonStates = () => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const hasSelection = selectedCheckboxes.length > 0;
        const isSingleSelection = selectedCheckboxes.length === 1;

        copyButton.disabled = !hasSelection;
        cutButton.disabled = !hasSelection;
        deleteButton.disabled = !hasSelection;
        renameButton.disabled = !isSingleSelection;
        
        // Download/Upload button logic:
        const isSingleFileSelection = isSingleSelection && 
            fileListTbody.querySelector(`.file-checkbox[data-path="${instanceSelectedFilePath}"]`)?.closest('tr')?.dataset.type === 'file';
        
        // DUAL FUNCTIONALITY LOGIC
        if (isSingleFileSelection) {
            downloadButton.textContent = '📥'; // Download Icon
            downloadButton.title = 'Download Selected File';
            downloadButton.disabled = false;
        } else {
            downloadButton.textContent = '⬆️'; // Upload Icon
            downloadButton.title = 'Upload File to Current Directory';
            downloadButton.disabled = false; // Always enabled for upload
        }
        
        pasteButton.disabled = instanceClipboard.type === null || instanceClipboard.paths.length === 0;

        // Check if selection is a single item (file or directory, not '..')
        const isSingleItemPath = instanceSelectedFilePath && instanceSelectedFilePath !== 'Multiple files selected';
        const isGoUpDir = instanceSelectedFilePath && instanceSelectedFilePath.endsWith('/..');
        usePathButton.disabled = !isSingleItemPath || isGoUpDir;
        
        // Update Select All Checkbox state
        const allCheckboxes = fileListTbody.querySelectorAll('.file-checkbox');
        const allFileCheckboxes = Array.from(allCheckboxes).filter(cb => !cb.closest('.up-directory-row'));
        selectAllCheckbox.checked = allFileCheckboxes.length > 0 && selectedCheckboxes.length === allFileCheckboxes.length;
        selectAllCheckbox.indeterminate = selectedCheckboxes.length > 0 && selectedCheckboxes.length < allFileCheckboxes.length;
    };

    /**
     * Renders the file list for the current path.
     * @param {string} path The path to list.
     */
    const renderFileList = async (path) => {
        instanceCurrentPath = path;
        currentPathSpan.textContent = `Path: ${instanceCurrentPath}`;
        fileListTbody.innerHTML = '';
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;

        instanceSelectedFilePath = null;
        instanceSelectedFileType = null; // Clear type
        titleTextEl.textContent = 'No file selected';


        try {
            const files = await api.ls(instanceCurrentPath === '/' ? '*' : `${instanceCurrentPath.endsWith('/') ? instanceCurrentPath + '*' : instanceCurrentPath + '/*'}`);
            let fileListHtml = '';
            
            // Add '..' row if not at root
            if (instanceCurrentPath !== '/') {
                const parentPath = instanceCurrentPath.split('/').filter(p => p).slice(0, -1).join('/') + '/';
                const upPath = parentPath === '/' ? '/' : parentPath || '/';

                fileListHtml += `
                    <tr class="up-directory-row" data-type="directory">
                        <td>⬆️</td>
                        <td class="file-name up-directory" data-path="${upPath}">..</td>
                        <td></td>
                        <td><input type="checkbox" class="file-checkbox" data-path="${upPath}/.." disabled></td>
                    </tr>
                `;
            }
            
            // Sort files (Directories first, then by name)
            files.sort((a, b) => {
                if (a.type === 'directory' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });
            
            // Ensure path ends with '/' for consistent concatenation
            const normalizedCurrentPath = instanceCurrentPath.endsWith('/') ? instanceCurrentPath : instanceCurrentPath + '/';

            files.forEach(file => {
                const icon = file.type === 'directory' ? '📂' : '📄';
                const size = file.type === 'file' ? formatBytes(file.size) : '';
                const fullPath = normalizedCurrentPath + file.name;
                const dataType = file.type === 'directory' ? 'data-type="directory"' : 'data-type="file"';

                fileListHtml += `
                    <tr ${dataType}>
                        <td class="file-icon">${icon}</td>
                        <td class="file-name" data-path="${fullPath}">${file.name}</td>
                        <td class="file-size-cell">${size}</td>
                        <td><input type="checkbox" class="file-checkbox" data-path="${fullPath}"></td>
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
    
    /**
     * Updates the UI and state based on the current selection.
     */
    const updateSelectionState = (path) => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const checkedCount = selectedCheckboxes.length;
        
        if (checkedCount === 1) {
            const checkedBox = selectedCheckboxes[0];
            instanceSelectedFilePath = checkedBox.dataset.path;
            const row = checkedBox.closest('tr');
            instanceSelectedFileType = row.dataset.type; // Update type
            titleTextEl.textContent = instanceSelectedFilePath;
        } else if (checkedCount > 1) {
            instanceSelectedFilePath = 'Multiple files selected';
            instanceSelectedFileType = null; // Clear type
            titleTextEl.textContent = instanceSelectedFilePath;
        } else {
            // Check if a directory row was clicked (without checking the checkbox)
            const selectedDirNameEl = fileListTbody.querySelector(`.file-name[data-path="${path}"]`);
            if (selectedDirNameEl && selectedDirNameEl.closest('tr').dataset.type === 'directory') {
                instanceSelectedFilePath = path;
                instanceSelectedFileType = 'directory'; // Set type
                titleTextEl.textContent = path;
            } else {
                instanceSelectedFilePath = null;
                instanceSelectedFileType = null; // Clear type
                titleTextEl.textContent = 'No file selected';
            }
        }
        updateButtonStates();
    };


    /** Gets selected file/directory paths. */
    const getSelectedPaths = () => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const paths = Array.from(selectedCheckboxes)
            .map(cb => cb.dataset.path)
            .filter(name => name);
        
        return paths;
    };
    
    /** Handles renaming a file or directory. */
    const handleRename = async () => {
        const selected = getSelectedPaths();
        if (selected.length !== 1) {
            showPopupMessage("Please select exactly one item to rename.", true);
            return;
        }

        const oldPath = selected[0];
        const oldName = oldPath.split('/').pop();
        const newName = await showPromptDialog(`Rename '${oldName}' to:`, oldName);

        if (newName === null || !newName.trim()) {
            showPopupMessage("Rename cancelled.", true);
            return;
        }

        const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
        const newPath = parentDir + newName;
        
        try {
            await api.rn(oldPath, newPath);
            showPopupMessage(`Renamed '${oldName}' to '${newName}' successfully.`);
            renderFileList(instanceCurrentPath);
        } catch (error) {
            console.error("Error renaming item:", error);
            showPopupMessage(`Failed to rename: ${error.message}`, true);
        }
    };

    /** Handles creating a new empty file or directory. (COMBINED) */
    const handleCreate = async () => {
        const result = await showCreationDialog();
        
        if (result === null || !result.name.trim()) {
            showPopupMessage("Creation cancelled.", true);
            return;
        }

        const { name, type } = result;
        const normalizedName = name.trim();
        const pathSuffix = type === 'directory' ? '/' : '';
        const fullPath = instanceCurrentPath.endsWith('/') ? `${instanceCurrentPath}${normalizedName}${pathSuffix}` : `${instanceCurrentPath}/${normalizedName}${pathSuffix}`;

        try {
            if (type === 'file') {
                await api.saveFile(fullPath, '');
                showPopupMessage(`File '${normalizedName}' created successfully.`);
            } else { // directory
                await api.mkPath(fullPath);
                showPopupMessage(`Directory '${normalizedName}' created successfully.`);
            }
            renderFileList(instanceCurrentPath);
        } catch (error) {
            console.error(`Error creating ${type}:`, error);
            showPopupMessage(`Failed to create ${type} '${normalizedName}': ${error.message}`, true);
        }
    };


    /** Performs a copy operation. */
    const handleCopy = () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showPopupMessage("No items selected to copy.", true);
            return;
        }
        instanceClipboard.type = 'copy';
        instanceClipboard.paths = selected;
        showPopupMessage(`Copied ${selected.length} item(s) to clipboard.`);
        updateButtonStates();
    };

    /** Performs a cut operation. */
    const handleCut = () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showPopupMessage("No items selected to cut.", true);
            return;
        }
        instanceClipboard.type = 'cut';
        instanceClipboard.paths = selected;
        showPopupMessage(`Cut ${selected.length} item(s) to clipboard.`);
        updateButtonStates();
    };

    /** Performs a paste operation. */
    const handlePaste = async () => {
        if (instanceClipboard.type === null || instanceClipboard.paths.length === 0) {
            showPopupMessage("Clipboard is empty.", true);
            return;
        }

        const destination = instanceCurrentPath.endsWith('/') ? instanceCurrentPath : instanceCurrentPath + '/';
        let successCount = 0;
        let failCount = 0;

        // Fetch destination file list once for duplicate checking
        let filesInDest = [];
        try {
            // Note: api.ls expects a path that can be wildcarded, but for duplicate check we need the directory content
            const lsPath = destination === '/' ? '*' : destination + '*';
            filesInDest = await api.ls(lsPath); 
        } catch (error) {
            console.error("Error fetching destination list:", error);
            // Non-critical, continue with paste
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
                        
                        // Prevent adding 'copy' repeatedly if original name already contains it
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
                    // When cutting, we move to the destination directory. 
                    // The backend should handle the final file name (usually keeps original).
                    await api.mv(sourcePath, destination);
                }
                successCount++;
            } catch (error) {
                console.error(`Error during paste operation for ${sourcePath}:`, error);
                showPopupMessage(`Failed to ${instanceClipboard.type} ${sourcePath.split('/').pop()}: ${error.message}`, true);
                failCount++;
            }
        }

        if (successCount > 0) {
            showPopupMessage(`${successCount} item(s) ${instanceClipboard.type}ed successfully.`);
        }
        if (failCount > 0) {
            // Note: This popup will overwrite the success message if both occur, which is intended priority.
            showPopupMessage(`${failCount} item(s) failed to ${instanceClipboard.type}.`, true);
        }

        // Clear clipboard only if cut operation succeeded on all items
        if (instanceClipboard.type === 'cut' && failCount === 0) {
            instanceClipboard = { type: null, paths: [] };
        }
        renderFileList(instanceCurrentPath);
        updateButtonStates();
    };

    /** Performs a delete operation. */
    const handleDelete = async () => {
        const selected = getSelectedPaths();
        if (selected.length === 0) {
            showPopupMessage("No items selected to delete.", true);
            return;
        }

        const message = instanceCurrentPath.startsWith('/trash/')
            ? `Are you sure you want to permanently delete ${selected.length} selected item(s)? This action cannot be undone.`
            : `Are you sure you want to move ${selected.length} selected item(s) to /trash?`;

        const confirm = await showConfirmDialog(message);
        if (!confirm) {
            showPopupMessage("Deletion cancelled.", true);
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const name of selected) {
            try {
                // If in trash, delete permanently. Otherwise, move to trash.
                if (instanceCurrentPath.startsWith('/trash/')) {
                    await api.del(name);
                } else {
                    await api.mv(name, '/trash/');
                }
                successCount++;
            } catch (error) {
                console.error(`Error deleting/moving ${name}:`, error);
                showPopupMessage(`Failed to delete/move ${name}: ${error.message}`, true);
                failCount++;
            }
        }

        if (successCount > 0) {
            showPopupMessage(`${successCount} item(s) ${instanceCurrentPath.startsWith('/trash/') ? 'deleted permanently' : 'moved to trash'} successfully.`);
        }
        if (failCount > 0) {
            showPopupMessage(`${failCount} item(s) failed to delete/move.`, true);
        }

        renderFileList(instanceCurrentPath);
        updateButtonStates();
    };
    
    /**
     * Handles downloading the selected file.
     */
    const handleDownload = async () => {
        // This function is only called if a single file is selected (checked in handleDownloadOrUpload)
        
        showPopupMessage(`Starting download for ${instanceSelectedFilePath.split('/').pop()}...`);

        try {
            // Use the binary API call to fetch file content
            const arrayBuffer = await api.readFileBinary(instanceSelectedFilePath);
            
            // Get file name for the download
            const fileName = instanceSelectedFilePath.split('/').pop();
            
            // Create a Blob from the ArrayBuffer
            const blob = new Blob([arrayBuffer]);

            // Create a temporary anchor element to trigger the download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName; 
            
            document.body.appendChild(a);
            a.click();
            
            // Clean up the temporary elements and URL
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showPopupMessage(`Download of '${fileName}' completed.`);

        } catch (error) {
            console.error("Error during file download:", error);
            showPopupMessage(`Download failed: ${error.message}`, true);
        }
    };
    
    /**
     * Handles file upload when no file is selected.
     * Uses a temporary hidden input to prompt the user for a file.
     */
    const handleUpload = () => {
        // Create a temporary hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.display = 'none';
        
        // Listen for when a file is selected
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) {
                // User cancelled file selection
                document.body.removeChild(fileInput);
                return;
            }

            const destinationPath = instanceCurrentPath.endsWith('/') ? instanceCurrentPath : instanceCurrentPath + '/';
            const fullPath = destinationPath + file.name;

            showPopupMessage(`Uploading '${file.name}'...`);

            try {
                // Read the file content
                // Note: file.text() is used assuming the server primarily handles text/plain or JSON content.
                // For large files or non-text files, this should be adjusted to read as ArrayBuffer.
                const fileContent = await file.text(); 
                
                // Save the file content to the server
                await api.saveFile(fullPath, fileContent);

                showPopupMessage(`File '${file.name}' uploaded successfully.`);
                renderFileList(instanceCurrentPath); // Refresh the list
            } catch (error) {
                console.error("Error during file upload:", error);
                showPopupMessage(`Upload failed for '${file.name}': ${error.message}`, true);
            } finally {
                // Clean up the temporary input
                document.body.removeChild(fileInput);
            }
        });

        // Add to DOM and trigger the file selection dialog
        document.body.appendChild(fileInput);
        fileInput.click();
    };
    
    /**
     * Handles downloading the selected file OR initiates upload if nothing is selected.
     */
    const handleDownloadOrUpload = (e) => {
        const selectedCheckboxes = fileListTbody.querySelectorAll('.file-checkbox:checked');
        const isSingleFileSelected = selectedCheckboxes.length === 1 && 
            fileListTbody.querySelector(`.file-checkbox[data-path="${instanceSelectedFilePath}"]`)?.closest('tr')?.dataset.type === 'file';

        if (isSingleFileSelected) {
            handleDownload(e); // Existing download logic
        } else {
            handleUpload(); // New upload logic
        }
    };


    // Handle "Use File Path" operation
    const handleUsePath = (e) => {
        if (!instanceSelectedFilePath || instanceSelectedFilePath === 'Multiple files selected') {
            showPopupMessage("Please select a single file or directory path to use.", true);
            return;
        }

        // Prioritize programmatic handler over attribute handler
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

    // Handle "Cancel" operation
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

    // Initial render or file path load
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
    // Use the dual-functionality handler
    downloadButton.addEventListener('click', handleDownloadOrUpload); 
    refreshButton.addEventListener('click', () => renderFileList(instanceCurrentPath));
    cancelButton.addEventListener('click', handleCancel);
    usePathButton.addEventListener('click', handleUsePath);

    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const checkboxes = fileListTbody.querySelectorAll('.file-checkbox');
        checkboxes.forEach(cb => {
            if (!cb.closest('.up-directory-row')) { // Do not select '..'
                cb.checked = isChecked;
            }
        });

        // Update state based on selection count
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
            // Case 1: Clicked on the file/directory name or row (but not the checkbox)

            if (isDirectory) {
                // Directories: If the specific name element is clicked, navigate.
                if (e.target.classList.contains('file-name')) {
                    renderFileList(fullPath + '/');
                } else {
                    // If directory row is clicked elsewhere, toggle the checkbox for selection.
                    checkbox.checked = !checkbox.checked;
                    // Trigger change event manually to update selection state.
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else {
                // Files: Toggle checkbox for selection.
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });

    fileListTbody.addEventListener('change', (e) => {
        if (e.target.classList.contains('file-checkbox')) {
            const fullPath = e.target.dataset.path;
            // The selection state is updated based on the total count of checked boxes, 
            // ensuring multiselection is properly reflected in the title.
            updateSelectionState(fullPath); 
        }
    });

    // Handle resizing for responsiveness
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
/**
 * Public function to create a new file picker programmatically.
 * This now returns an encapsulated element to be used as a modal.
 * @returns {HTMLElement} The outermost DOM element representing the file picker.
 */
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
/**
 * Observes the DOM for `<filepicker> elements, converts them into
 * enhanced file pickers, and handles dynamically added elements.
 */
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