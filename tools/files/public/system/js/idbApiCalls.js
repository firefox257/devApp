/*
 * File: ./js/idbApiCalls.js
 * Description: Emulates the functionality of apiCalls.js using IndexedDB
 * for a client-side, local file system persistence, ensuring identical
 * output formats, especially for errors.
 */

/** @typedef {Object} FileInfo
 * @property {string} name - The name of the file or directory.
 * @property {'file' | 'directory'} type - The type of the item.
 * @property {number} size - The size of the file in bytes (0 for directories).
 * @property {string} modifiedTime - The ISO 8601 formatted last modified timestamp.
 * @property {number} modifiedTimeMs - The last modified timestamp in milliseconds.
 */

// --- IndexedDB Setup ---
const DB_NAME = 'FileSystemDB';
const DB_VERSION = 2; // <--- VERSION BUMPED
const STORE_NAME = 'files';
const PATH_KEY_PREFIX = '/'; 

let dbPromise = null;

/**
 * Opens the IndexedDB connection and ensures the object store exists.
 * @returns {Promise<IDBDatabase>} A promise that resolves to the IDB database instance.
 */
function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            let store;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                 store = db.createObjectStore(STORE_NAME, { keyPath: 'path' });
            } else {
                 store = request.transaction.objectStore(STORE_NAME);
            }

            const now = new Date();
            const nowISO = now.toISOString();
            const nowMs = now.getTime();

            // Root must always be '/'
            const rootDir = {
                path: PATH_KEY_PREFIX, 
                name: '', 
                type: 'directory',
                size: 0,
                content: null,
                modifiedTime: nowISO,
                modifiedTimeMs: nowMs
            };

            const trashDir = {
                path: '/trash',
                name: 'trash',
                type: 'directory',
                size: 0,
                content: null,
                modifiedTime: nowISO,
                modifiedTimeMs: nowMs
            };
            
            store.put(rootDir);
            store.put(trashDir);
            
            console.log(`IndexedDB upgraded to version ${DB_VERSION} and initialized with / and /trash directories.`);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(new Error(`API Error 500: IndexedDB connection failed: ${event.target.error.message}`));
        };
    });

    return dbPromise;
}

/**
 * Helper to get an IDB transaction.
 * @param {'readonly' | 'readwrite'} mode - The transaction mode.
 * @returns {Promise<IDBObjectStore>} The object store instance.
 */
async function getStore(mode = 'readonly') {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, mode);
    return tx.objectStore(STORE_NAME);
}

// --- Path and Utility Helpers (START) ---

/**
 * Normalizes a path to start with '/' and removes trailing slashes unless it's the root.
 * @param {string} p - The input path.
 * @returns {string} The normalized path.
 */
function normalizePath(p) {
    let normalized = (p.startsWith(PATH_KEY_PREFIX) ? p : PATH_KEY_PREFIX + p).replace(/\\/g, '/');
    if (normalized.length > 1 && normalized.endsWith(PATH_KEY_PREFIX)) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

/**
 * Extracts the directory path from a full path.
 * @param {string} filePath - The full path.
 * @returns {string} The directory path.
 */
function getDirPath(filePath) {
    const lastSlashIndex = filePath.lastIndexOf('/');
    if (lastSlashIndex === 0) return PATH_KEY_PREFIX;
    if (lastSlashIndex > 0) return filePath.substring(0, lastSlashIndex);
    return filePath; // Should not happen with normalized paths
}

/**
 * Converts a shell-style wildcard pattern to a RegExp object.
 * @param {string} pattern - The wildcard pattern (e.g., '*.html').
 * @returns {RegExp} The corresponding regular expression.
 */
function wildcardToRegExp(pattern) {
    // Escape all special regex characters except for '*'
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace the escaped '*' with '.*' (matches any character zero or more times)
    const regex = escaped.replace(/\\\*/g, '.*');
    // Ensure the entire string is matched
    return new RegExp('^' + regex + '$');
}


/**
 * Finds all file/directory entries matching a wildcard path pattern.
 * NOTE: This function's sole responsibility is to filter entries. 
 * The caller (api.ls) must handle the 404 error if the parent directory
 * of the wildcard path does not exist.
 * * @param {string} wildcardPath - Path which may contain a wildcard (e.g., '/public/*.txt').
 * @returns {Promise<Array<Object>>} - An array of matching file entries.
 */
async function findMatchingPaths(wildcardPath) {
    const normalizedPath = normalizePath(wildcardPath);
    const hasWildcard = normalizedPath.includes('*');

    if (!hasWildcard) {
        const store = await getStore();
        return new Promise((resolve, reject) => {
            const request = store.get(normalizedPath);
            request.onsuccess = (event) => {
                const result = event.target.result;
                resolve(result ? [result] : []);
            };
            request.onerror = (e) => reject(e);
        });
    }

    // --- Wildcard Search Logic ---
    const parentDir = getDirPath(normalizedPath);
    const pattern = normalizedPath.substring(normalizedPath.lastIndexOf('/') + 1);
    const regex = wildcardToRegExp(pattern);
    
    // The key prefix for all immediate children (e.g., '/public' + '/' -> '/public/')
    const parentDirPrefix = parentDir === PATH_KEY_PREFIX ? PATH_KEY_PREFIX : parentDir + PATH_KEY_PREFIX;
    
    // Check if the parent directory exists
    const store = await getStore();
    const parentEntry = await new Promise((resolve) => {
        const req = store.get(parentDir);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
    });
    
    // If the directory path leading up to the wildcard doesn't exist, return empty
    if (!parentEntry || parentEntry.type !== 'directory') {
        return [];
    }
    
    const range = IDBKeyRange.lowerBound(parentDirPrefix);
    const matchingEntries = [];

    return new Promise((resolve, reject) => {
        const request = store.openCursor(range);

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const entry = cursor.value;
                const fullPath = entry.path;

                // 1. Stop if the path is outside the parent directory
                if (!fullPath.startsWith(parentDirPrefix)) {
                    resolve(matchingEntries);
                    return;
                }
                
                // 2. Determine the path segment relative to the parent directory
                const relativePath = fullPath.substring(parentDirPrefix.length);
                
                // 3. Ensure it's an immediate child (no further '/' separator)
                const nextSeparatorIndex = relativePath.indexOf(PATH_KEY_PREFIX);
                const isImmediateChild = nextSeparatorIndex === -1;

                if (isImmediateChild) {
                    const entryName = entry.name;
                    // 4. Apply regex pattern to the file name
                    if (regex.test(entryName)) {
                        matchingEntries.push(entry);
                    }
                }

                cursor.continue();
            } else {
                resolve(matchingEntries);
            }
        };

        request.onerror = (event) => {
            reject(new Error(`Wildcard search error: ${event.target.error.message}`));
        };
    });
}
// --- Path and Utility Helpers (END) ---

// The core API implementation using IndexedDB.
const api = {
    /**
     * Lists files and directories in a path, or returns info for a single matching path/wildcard.
     * @param {string} path - The path to list (e.g., 'public/'). Can contain wildcards for single match returns.
     * @returns {Promise<FileInfo[]>} - Array of file/directory information.
     */
    ls: async (path) => {
        if (!path) {
            throw new Error('LS: Path is required.');
        }

        const normalizedPath = normalizePath(path);
        const hasWildcard = normalizedPath.includes('*');
        const store = await getStore();

        if (hasWildcard) {
            
            // Check for the parent directory's existence
            const parentDir = getDirPath(normalizedPath);
            const parentEntry = await new Promise((resolve) => {
                const req = store.get(parentDir);
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = () => resolve(null);
            });
            
            // If the parent directory itself does not exist, throw 404
            if (!parentEntry || parentEntry.type !== 'directory') {
                throw new Error(`API Error 404: LS Error: Path not found: ${path}`);
            }
            
            // LS with wildcard returns an array of matching files/directories
            const matchingEntries = await findMatchingPaths(normalizedPath);
            
            // If matchingEntries is empty, it means the directory exists, but no file matches the pattern.
            // This is NOT a 404 error, so we simply return the empty array.

            return matchingEntries.map(entry => ({
                name: entry.name,
                type: entry.type,
                size: entry.type === 'directory' ? 0 : entry.size,
                modifiedTime: entry.modifiedTime,
                modifiedTimeMs: entry.modifiedTimeMs
            }));
        }


        // --- No Wildcard (Directory or Single File Listing) ---
        const results = [];
        const uniqueNames = new Set();
        
        // 1. Check if the requested path exists and is a file/directory
        const targetEntry = await new Promise((resolve) => {
            const getReq = store.get(normalizedPath);
            getReq.onsuccess = (e) => resolve(e.target.result);
            getReq.onerror = () => resolve(null);
        });

        if (!targetEntry) {
            throw new Error(`API Error 404: LS Error: Path not found: ${path}`);
        }
        
        // If it's a file, return only its info in an array
        if (targetEntry.type === 'file') {
             return [{
                name: targetEntry.name,
                type: 'file',
                size: targetEntry.size,
                modifiedTime: targetEntry.modifiedTime,
                modifiedTimeMs: targetEntry.modifiedTimeMs
             }];
        }
        
        // 2. If it's a directory, list its contents (immediate children only)
        const prefix = normalizedPath === PATH_KEY_PREFIX ? PATH_KEY_PREFIX : normalizedPath + PATH_KEY_PREFIX; 

        const range = IDBKeyRange.lowerBound(prefix);
        const request = store.openCursor(range);

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const fullPath = cursor.value.path;
                    
                    // Stop if the path no longer starts with the directory prefix
                    if (!fullPath.startsWith(prefix)) {
                        resolve(results);
                        return;
                    }
                    
                    let remainder = fullPath.substring(prefix.length);

                    if (remainder) {
                        const nextSeparatorIndex = remainder.indexOf(PATH_KEY_PREFIX);
                        const name = nextSeparatorIndex === -1 ? remainder : remainder.substring(0, nextSeparatorIndex);

                        // We only want to process the *first segment* of the remainder (the name).
                        if (!uniqueNames.has(name)) {
                            uniqueNames.add(name);
                            
                            // Determine type: 'directory' if there are nested paths (nextSeparatorIndex !== -1) 
                            // OR if the stored entry explicitly says it's a directory (its key is /dir/name)
                            const isDirectory = nextSeparatorIndex !== -1 || cursor.value.type === 'directory';

                            results.push({
                                name: name,
                                type: isDirectory ? 'directory' : 'file',
                                size: isDirectory ? 0 : cursor.value.size,
                                modifiedTime: cursor.value.modifiedTime,
                                modifiedTimeMs: cursor.value.modifiedTimeMs
                            });
                        }
                    } 
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = (event) => {
                reject(new Error(`LS Error: ${event.target.error.message}`));
            };
        });
    },

    /**
     * Reads the content of a file. (No wildcard support on server for FREAD)
     * @param {string} filePath - The path to the file to read.
     * @returns {Promise<string>} - The file's content as a string.
     */
    readFile: async (filePath) => {
        if (!filePath) {
            throw new Error('ReadFile: File path is required.');
        }
        const store = await getStore();
        const normalizedPath = normalizePath(filePath);

        return new Promise((resolve, reject) => {
            const request = store.get(normalizedPath);

            request.onsuccess = (event) => {
                const fileEntry = event.target.result;
                if (!fileEntry) {
                    reject(new Error(`API Error 404: FREAD Error: File not found: ${filePath}`));
                    return;
                }
                if (fileEntry.type === 'directory') {
                    reject(new Error(`API Error 400: FREAD Error: Cannot read a directory: ${filePath}`));
                    return;
                }
                resolve(fileEntry.content || '');
            };

            request.onerror = (event) => {
                reject(new Error(`FREAD Error: ${event.target.error.message}`));
            };
        });
    },

    /**
     * Reads the content of a file as a binary ArrayBuffer. (No wildcard support on server for FREADB)
     * @param {string} filePath - The path to the file to read.
     * @returns {Promise<ArrayBuffer>} - The file's content as an ArrayBuffer.
     */
    readFileBinary: async (filePath) => {
        if (!filePath) {
            throw new Error('ReadFileBinary: File path is required.');
        }
        const store = await getStore();
        const normalizedPath = normalizePath(filePath);

        return new Promise((resolve, reject) => {
            const request = store.get(normalizedPath);

            request.onsuccess = (event) => {
                const fileEntry = event.target.result;
                if (!fileEntry) {
                    reject(new Error(`API Error 404: FREADB Error: File not found: ${filePath}`));
                    return;
                }
                if (fileEntry.type === 'directory') {
                    reject(new Error(`API Error 400: FREADB Error: Cannot read a directory: ${filePath}`));
                    return;
                }
                
                if (fileEntry.content instanceof ArrayBuffer) {
                    resolve(fileEntry.content);
                } else {
                    // Assuming string content needs to be converted for binary read emulation
                    const buffer = new TextEncoder().encode(fileEntry.content || '').buffer;
                    resolve(buffer);
                }
            };

            request.onerror = (event) => {
                reject(new Error(`FREADB Error: ${event.target.error.message}`));
            };
        });
    },

    /**
     * Saves content to a file. Creates or overwrites the file. (No wildcard support on server for FWRITE)
     * @param {string} filePath - The path where the file will be saved.
     * @param {string} content - The content to write to the file.
     * @returns {Promise<string>} - A promise that resolves to a success message.
     */
    saveFile: async (filePath, content) => {
        if (!filePath || content === undefined) {
            throw new Error('SaveFile: File path and content are required.');
        }

        const normalizedPath = normalizePath(filePath);
        const now = new Date();
        const nowISO = now.toISOString();
        const nowMs = now.getTime();
        const store = await getStore('readwrite');
        
        const fileEntry = {
            path: normalizedPath,
            name: normalizedPath.substring(normalizedPath.lastIndexOf('/') + 1),
            type: 'file',
            size: typeof content === 'string' ? new TextEncoder().encode(content).length : content.byteLength || 0,
            content: content,
            modifiedTime: nowISO,
            modifiedTimeMs: nowMs
        };

        return new Promise((resolve, reject) => {
            const request = store.put(fileEntry);
            
            request.onsuccess = () => {
                resolve(`File saved successfully: ${filePath}`);
            };

            request.onerror = (event) => {
                reject(new Error(`SAVEFILE Error: ${event.target.error.message}`));
            };
        });
    },

    /**
     * Creates a directory path recursively. (No wildcard support on server for MKDIR)
     * @param {string} mkPath - The directory path to create.
     * @returns {Promise<string>} - A promise that resolves to a success message.
     */
    mkPath: async (mkPath) => {
        if (!mkPath) {
            throw new Error('MkPath: Path to create is required.');
        }

        const normalizedPath = normalizePath(mkPath);
        const now = new Date();
        const nowISO = now.toISOString();
        const nowMs = now.getTime();
        const store = await getStore('readwrite');
        
        const dirEntry = {
            path: normalizedPath,
            name: normalizedPath.substring(normalizedPath.lastIndexOf('/') + 1),
            type: 'directory',
            size: 0,
            content: null,
            modifiedTime: nowISO,
            modifiedTimeMs: nowMs
        };

        return new Promise((resolve, reject) => {
            const request = store.get(normalizedPath);
            
            request.onsuccess = (event) => {
                const existing = event.target.result;
                if (existing && existing.type === 'file') {
                    reject(new Error(`MKPATH Error: Path exists and is a file: ${mkPath}`));
                    return;
                }

                if (existing && existing.type === 'directory') {
                    resolve(`MKPATH Warning: Path already exists: ${mkPath}`);
                    return;
                }

                const putRequest = store.put(dirEntry);
                putRequest.onsuccess = () => {
                    resolve(`Path created successfully: ${mkPath}`);
                };
                putRequest.onerror = (e) => {
                    reject(new Error(`MKPATH Error: ${e.target.error.message}`));
                };
            };
            
            request.onerror = (e) => {
                reject(new Error(`MKPATH Error: ${e.target.error.message}`));
            };
        });
    },

    /**
     * Moves a file or directory (or multiple using wildcards) to a new destination directory.
     * @param {string} sourcePath - The source path(s). Can contain wildcards.
     * @param {string} destinationPath - The destination directory.
     * @returns {Promise<string>} - A success message detailing the moves.
     */
    mv: async (sourcePath, destinationPath) => {
        if (!sourcePath || !destinationPath) {
            throw new Error('MV: Source and destination paths are required.');
        }

        const normalizedDestinationDir = normalizePath(destinationPath);
        const store = await getStore('readwrite');
        const now = new Date();
        const nowISO = now.toISOString();
        const nowMs = now.getTime();
        const results = [];

        try {
            // 1. Check if destination exists and is a directory
            const destEntry = await new Promise((resolve, reject) => {
                const req = store.get(normalizedDestinationDir);
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            });

            if (!destEntry || destEntry.type !== 'directory') {
                throw new Error(`MV Error: Destination is not a directory: ${destinationPath}`);
            }

            // 2. Find all matching source entries (supports wildcard)
            const matchingSources = await findMatchingPaths(sourcePath);

            if (matchingSources.length === 0) {
                 return `MV Warning: No files or directories matched the source: ${sourcePath}`;
            }

            // 3. Process the moves in a single transaction (though IDB handles it per request)
            for (const sourceEntry of matchingSources) {
                const sourceFullPath = sourceEntry.path;
                const sourceName = sourceEntry.name;
                
                // Identify all paths to move (item + its children if directory)
                const pathsToMove = [sourceEntry];
                if (sourceEntry.type === 'directory') {
                    const prefix = sourceFullPath + PATH_KEY_PREFIX;
                    await new Promise((resolve, reject) => {
                        const range = IDBKeyRange.lowerBound(prefix);
                        const req = store.openCursor(range);
                        req.onsuccess = (e) => {
                            const cursor = e.target.result;
                            if (cursor && cursor.key.startsWith(prefix)) {
                                pathsToMove.push(cursor.value);
                                cursor.continue();
                            } else {
                                resolve();
                            }
                        };
                        req.onerror = (e) => reject(e.target.error);
                    });
                }
                
                // Perform move (put new, delete old) for all paths
                for (const entry of pathsToMove) {
                    const oldPath = entry.path;
                    
                    // --- FIX APPLIED HERE ---
                    const pathSuffix = oldPath.substring(sourceFullPath.length);
                    const finalDestinationPath = normalizedDestinationDir + PATH_KEY_PREFIX + sourceName + pathSuffix;
                    // --- END FIX ---

                    const newEntry = {
                        ...entry,
                        path: finalDestinationPath,
                        modifiedTime: nowISO,
                        modifiedTimeMs: nowMs
                    };
                    
                    await new Promise((resolve, reject) => {
                        const putRequest = store.put(newEntry);
                        putRequest.onsuccess = () => {
                             const deleteRequest = store.delete(oldPath);
                             deleteRequest.onsuccess = resolve;
                             deleteRequest.onerror = reject;
                        };
                        putRequest.onerror = reject;
                    });
                }
                results.push(`Moved: ${sourceFullPath} to ${normalizedDestinationDir + PATH_KEY_PREFIX + sourceName}`);
            }

            return `MV Operation complete:\n${results.join('\n')}`;
        } catch (error) {
            console.error('MV Internal Server Error:', error);
            throw new Error(`MV Internal Server Error: ${error.message}`);
        }
    },

    /**
     * Copies a file (or multiple using wildcards) to a new destination directory.
     * Directory copy is NOT supported in this simplified IDB version, but wildcards are.
     * @param {string} sourcePath - The source path(s). Can contain wildcards.
     * @param {string} destinationPath - The destination directory.
     * @returns {Promise<string>} - A success message detailing the copies.
     */
    copy: async (sourcePath, destinationPath) => {
        if (!sourcePath || !destinationPath) {
            throw new Error('COPY: Source and destination paths are required.');
        }
        
        const normalizedDestinationDir = normalizePath(destinationPath);
        const store = await getStore('readwrite');
        const now = new Date();
        const nowISO = now.toISOString();
        const nowMs = now.getTime();
        const results = [];

        try {
            // 1. Check if destination exists and is a directory
            const destEntry = await new Promise((resolve, reject) => {
                const req = store.get(normalizedDestinationDir);
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            });

            if (!destEntry || destEntry.type !== 'directory') {
                throw new Error(`COPY Error: Destination is not a directory: ${destinationPath}`);
            }

            // 2. Find all matching source entries (supports wildcard)
            const matchingSources = await findMatchingPaths(sourcePath);
            
            if (matchingSources.length === 0) {
                 return `COPY Warning: No files or directories matched the source: ${sourcePath}`;
            }

            // 3. Process the copies
            for (const sourceEntry of matchingSources) {
                const sourceFullPath = sourceEntry.path;
                const sourceName = sourceEntry.name;

                if (sourceEntry.type === 'directory') {
                     // In a real implementation, this would involve recursive copy.
                     results.push(`Failed to copy ${sourceFullPath}: Directory copy not supported in this IDB implementation.`);
                     continue;
                }
                
                const finalDestinationPath = normalizedDestinationDir + PATH_KEY_PREFIX + sourceName;
                const newEntry = {
                    ...sourceEntry,
                    path: finalDestinationPath, // New path
                    modifiedTime: nowISO,
                    modifiedTimeMs: nowMs
                };
                
                // Copy logic: only put the new record
                await new Promise((resolve, reject) => {
                    const putRequest = store.put(newEntry);
                    putRequest.onsuccess = resolve;
                    putRequest.onerror = (e) => reject(e.target.error);
                });
                
                results.push(`Copied file: ${sourceFullPath} to ${finalDestinationPath}`);
            }

            return `COPY Operation complete:\n${results.join('\n')}`;
        } catch (error) {
            console.error('COPY Internal Server Error:', error);
            throw new Error(`COPY Internal Server Error: ${error.message}`);
        }
    },

    /**
     * Renames a single file or directory. (No wildcard support on server for RN)
     * @param {string} sourcePath - The current path.
     * @param {string} newPath - The new full path and name.
     * @returns {Promise<string>} - A success message.
     */
    rn: async (sourcePath, newPath) => {
        if (!sourcePath || !newPath) {
            throw new Error('RN: Source and new paths are required.');
        }
        
        const normalizedSource = normalizePath(sourcePath);
        const normalizedNewPath = normalizePath(newPath);

        const sourceDir = getDirPath(normalizedSource);
        const newDir = getDirPath(normalizedNewPath);
        if (sourceDir !== newDir) {
            throw new Error('RN Error: Destination must be in the same directory as the source.');
        }

        const store = await getStore('readwrite');
        const now = new Date();
        const nowISO = now.toISOString();
        const nowMs = now.getTime();

        return new Promise((resolve, reject) => {
            const getRequest = store.get(normalizedSource);

            getRequest.onsuccess = (event) => {
                const sourceEntry = event.target.result;
                if (!sourceEntry) {
                    reject(new Error(`RN Error: Source not found: ${sourcePath}`));
                    return;
                }

                // Handle directory rename recursively
                const pathsToUpdate = [sourceEntry];
                if (sourceEntry.type === 'directory') {
                    const prefix = normalizedSource + PATH_KEY_PREFIX;
                    const range = IDBKeyRange.lowerBound(prefix);
                    const req = store.openCursor(range);
                    req.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor && cursor.key.startsWith(prefix)) {
                            pathsToUpdate.push(cursor.value);
                            cursor.continue();
                        } else {
                            // All items found, start update process
                            
                            const updatePromises = pathsToUpdate.map(entry => {
                                const newPathSuffix = entry.path.substring(normalizedSource.length);
                                const newFullPath = normalizedNewPath + newPathSuffix;
                                
                                const newEntry = {
                                    ...entry,
                                    path: newFullPath,
                                    name: newFullPath.substring(newFullPath.lastIndexOf('/') + 1),
                                    modifiedTime: nowISO,
                                    modifiedTimeMs: nowMs
                                };
                                
                                return new Promise((res, rej) => {
                                    const putReq = store.put(newEntry);
                                    putReq.onsuccess = () => {
                                        const delReq = store.delete(entry.path);
                                        delReq.onsuccess = res;
                                        delReq.onerror = rej;
                                    };
                                    putReq.onerror = rej;
                                });
                            });
                            
                            Promise.all(updatePromises)
                                .then(() => resolve(`Renamed successfully: ${sourcePath} to ${newPath}`))
                                .catch(err => reject(new Error(`RN Error: Failed to update entry: ${err.message}`)));
                        }
                    };
                    req.onerror = (e) => reject(new Error(`RN Error: ${e.target.error.message}`));
                } else {
                    // Single file rename
                    const newEntry = {
                        ...sourceEntry,
                        path: normalizedNewPath,
                        name: normalizedNewPath.substring(normalizedNewPath.lastIndexOf('/') + 1),
                        modifiedTime: nowISO,
                        modifiedTimeMs: nowMs
                    };
                    
                    const putRequest = store.put(newEntry);
                    putRequest.onsuccess = () => {
                        const deleteRequest = store.delete(normalizedSource);
                        deleteRequest.onsuccess = () => resolve(`Renamed successfully: ${sourcePath} to ${newPath}`);
                        deleteRequest.onerror = (e) => reject(new Error(`RN Error (Cleanup): Failed to delete source: ${e.target.error.message}`));
                    };
                    putRequest.onerror = (e) => reject(new Error(`RN Error (Put): Failed to create destination: ${e.target.error.message}`));
                }
            };

            getRequest.onerror = (e) => {
                reject(new Error(`RN Error (Get): ${e.target.error.message}`));
            };
        });
    },

    /**
     * Deletes files or directories (or multiple using wildcards). Moves to trash if not already in trash.
     * @param {string} delPath - The path(s) to delete. Can contain wildcards.
     * @returns {Promise<string>} - A success message detailing the deletion operation.
     */
    del: async (delPath) => {
        if (!delPath) {
            throw new Error('DEL: Path to delete is required.');
        }

        const TRASH_PATH = '/trash';
        const store = await getStore('readwrite');
        const now = new Date();
        const nowISO = now.toISOString();
        const nowMs = now.getTime();
        const results = [];

        try {
            // 1. Find all matching source entries (supports wildcard)
            const matchingSources = await findMatchingPaths(delPath);

            if (matchingSources.length === 0) {
                 return `DEL Warning: No files or directories matched for deletion: ${delPath}`;
            }

            // 2. Process deletions/moves
            for (const sourceEntry of matchingSources) {
                const sourceFullPath = sourceEntry.path;
                const sourceName = sourceEntry.name;

                if (sourceFullPath.startsWith(TRASH_PATH + PATH_KEY_PREFIX) || sourceFullPath === TRASH_PATH) {
                    // --- Permanent Delete ---
                    
                    // Identify all paths to delete (item + its children if directory)
                    const pathsToDelete = [sourceFullPath];
                    if (sourceEntry.type === 'directory') {
                        const prefix = sourceFullPath + PATH_KEY_PREFIX;
                        await new Promise((resolve, reject) => {
                            const range = IDBKeyRange.lowerBound(prefix);
                            const req = store.openCursor(range);
                            req.onsuccess = (e) => {
                                const cursor = e.target.result;
                                if (cursor && cursor.key.startsWith(prefix)) {
                                    pathsToDelete.push(cursor.key);
                                    cursor.continue();
                                } else {
                                    resolve();
                                }
                            };
                            req.onerror = (e) => reject(e.target.error);
                        });
                    }

                    // Perform deletion of all paths
                    await Promise.all(pathsToDelete.map(p => new Promise((res, rej) => {
                        const delReq = store.delete(p);
                        delReq.onsuccess = res;
                        delReq.onerror = rej;
                    })));

                    results.push(`Permanently deleted ${sourceEntry.type} from trash: ${sourceFullPath}`);
                } else {
                    // --- Move to Trash ---
                    const trashDestination = TRASH_PATH + PATH_KEY_PREFIX + sourceName;
                    
                    // Identify all paths to move (item + its children if directory)
                    const pathsToMove = [sourceEntry];
                    if (sourceEntry.type === 'directory') {
                        const prefix = sourceFullPath + PATH_KEY_PREFIX;
                        await new Promise((resolve, reject) => {
                            const range = IDBKeyRange.lowerBound(prefix);
                            const req = store.openCursor(range);
                            req.onsuccess = (e) => {
                                const cursor = e.target.result;
                                if (cursor && cursor.key.startsWith(prefix)) {
                                    pathsToMove.push(cursor.value);
                                    cursor.continue();
                                } else {
                                    resolve();
                                }
                            };
                            req.onerror = (e) => reject(e.target.error);
                        });
                    }
                    
                    // Perform move (put new, delete old) for all paths
                    for (const entry of pathsToMove) {
                        const oldPath = entry.path;
                        const newPathSuffix = oldPath.substring(sourceFullPath.length);
                        const newFullPath = trashDestination + newPathSuffix;
                        
                        const newEntry = {
                            ...entry,
                            path: newFullPath,
                            modifiedTime: nowISO,
                            modifiedTimeMs: nowMs
                        };
                        
                        await new Promise((resolve, reject) => {
                            const putReq = store.put(newEntry);
                            putReq.onsuccess = () => {
                                const delReq = store.delete(oldPath);
                                delReq.onsuccess = resolve;
                                delReq.onerror = reject;
                            };
                            putReq.onerror = reject;
                        });
                    }
                    results.push(`Moved to trash: ${sourceFullPath}`);
                }
            }

            return `DEL Operation complete:\n${results.join('\n')}`;
        } catch (error) {
            console.error('DEL Internal Server Error:', error);
            throw new Error(`DEL Internal Server Error: ${error.message}`);
        }
    }
}

export { api };
