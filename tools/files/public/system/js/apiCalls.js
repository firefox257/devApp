/*
do not remove!!!
location is at ./system/js/apiCalls.js
*/

/** @typedef {Object} FileInfo
 * @property {string} name - The name of the file or directory.
 * @property {'file' | 'directory'} type - The type of the item.
 * @property {number} size - The size of the file in bytes (0 for directories).
 * @property {string} modifiedTime - The ISO 8601 formatted last modified timestamp.
 * @property {number} modifiedTimeMs - The last modified timestamp in milliseconds.
 */

/**
 * Makes an API call to the server with custom headers.
 * @param {string} method - The HTTP method (GET, POST, PUT, DELETE).
 * @param {string} endpoint - The path to the endpoint on the server (e.g., '/').
 * @param {Object} [headers={}] - Custom headers for the request.
 * @param {string} [body=null] - The request body for POST/PUT requests.
 * @returns {Promise<string | Object>} - The response text or parsed JSON.
 */
async function makeApiCall(method, endpoint, headers = {}, body = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'text/plain', // Default for most of our custom API calls
            ...headers
        }
    }

    if (body !== null) {
        options.body = body
    }

    try {
        const response = await fetch(endpoint, options)

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`API Error ${response.status}: ${errorText}`)
        }

        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
            return await response.json()
        } else {
            return await response.text()
        }
    } catch (error) {
        console.error('Network or API call error:', error)
        throw error
    }
}

/**
 * Makes a synchronous API call to the server using XMLHttpRequest.
 * WARNING: Synchronous requests on the main thread block the UI and are deprecated in modern browsers.
 * Use only when absolutely necessary (e.g., inside Web Workers or specific legacy scenarios).
 * 
 * @param {string} method - The HTTP method (GET, POST, PUT, DELETE).
 * @param {string} endpoint - The path to the endpoint on the server.
 * @param {Object} [headers={}] - Custom headers for the request.
 * @param {string|null} [body=null] - The request body.
 * @param {string} [responseType='text'] - The response type ('text' or 'arraybuffer').
 * @returns {string|Object|ArrayBuffer} - The response text, parsed JSON, or ArrayBuffer.
 */
function makeApiCallSync(method, endpoint, headers = {}, body = null, responseType = 'text') {
    const xhr = new XMLHttpRequest();
    xhr.open(method, endpoint, false); // false makes it synchronous
    xhr.responseType = responseType;

    const finalHeaders = {
        'Content-Type': 'text/plain', // Default for most of our custom API calls
        ...headers
    };

    for (const [key, value] of Object.entries(finalHeaders)) {
        xhr.setRequestHeader(key, value);
    }

    try {
        xhr.send(body);
    } catch (error) {
        console.error('Network or API call error:', error);
        throw error;
    }

    if (xhr.status < 200 || xhr.status >= 300) {
        let errorText = '';
        // Accessing responseText throws an error if responseType is 'arraybuffer'
        if (responseType === 'arraybuffer') {
            errorText = `HTTP ${xhr.status} (Binary response)`;
        } else {
            try {
                errorText = xhr.responseText || `HTTP ${xhr.status}`;
            } catch (e) {
                errorText = `HTTP ${xhr.status}`;
            }
        }
        throw new Error(`API Error ${xhr.status}: ${errorText}`);
    }

    if (responseType === 'arraybuffer') {
        return xhr.response;
    }

    const contentType = xhr.getResponseHeader('content-type');
    if (contentType && contentType.includes('application/json')) {
        try {
            return JSON.parse(xhr.responseText);
        } catch (e) {
            return xhr.responseText;
        }
    } else {
        return xhr.responseText;
    }
}

const api = {
    /**
     * Lists files and directories on the server.
     * @param {string} path - The path to list, relative to the server's 'files' root. Can include wildcards (e.g., 'public/*.html').
     * @returns {Promise<FileInfo[]>} - A promise that resolves to an array of file/directory information.
     */
    ls: async (path) => {
        if (!path) {
            throw new Error('LS: Path is required.')
        }
        return makeApiCall('GET', '/', { 'X-CMD': 'ls', 'X-SRC': path })
    },

    /**
     * Reads the content of a file.
     * @param {string} filePath - The path to the file to read, relative to the server's 'files' root.
     * @returns {Promise<string>} - A promise that resolves to the file's content as a string.
     */
    readFile: async (filePath) => {
        if (!filePath) {
            throw new Error('ReadFile: File path is required.')
        }
        return makeApiCall('GET', '/', { 'X-CMD': 'fread', 'X-SRC': filePath })
    },

    /**
     * Reads the content of a file as a binary ArrayBuffer.
     * @param {string} filePath - The path to the file to read, relative to the server's 'files' root.
     * @returns {Promise<ArrayBuffer>} - A promise that resolves to the file's content as an ArrayBuffer.
     */
    readFileBinary: async (filePath) => {
        if (!filePath) {
            throw new Error('ReadFileBinary: File path is required.')
        }
		
		const response = await fetch('/', {
            method: 'GET',
            headers: {
				'X-CMD': 'freadb',
                'X-SRC': filePath
            }
        });
		
        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`API Error ${response.status}: ${errorText}`)
        }

        return await response.arrayBuffer()
    },

    /**
     * Saves content to a file. Creates or overwrites the file.
     * @param {string} filePath - The path where the file will be saved, relative to the server's 'files' root. Directories in the path will be created if they don't exist.
     * @param {string} content - The content to write to the file.
     * @returns {Promise<string>} - A promise that resolves to a success message.
     */
    saveFile: async (filePath, content) => {
        if (!filePath || content === undefined) {
            throw new Error('SaveFile: File path and content are required.')
        }

        return makeApiCall(
            'POST',
            '/',
            { 'X-CMD': 'fwrite', 'X-SRC': filePath },
            content
        )
    },

    /**
     * Creates a directory path recursively.
     * @param {string} mkPath - The directory path to create, relative to the server's 'files' root.
     * @returns {Promise<string>} - A promise that resolves to a success message.
     */
    mkPath: async (mkPath) => {
        if (!mkPath) {
            throw new Error('MkPath: Path to create is required.')
        }
        return makeApiCall('POST', '/', { 'X-CMD': 'mkdir', 'X-SRC': mkPath })
    },

    /**
     * Moves a file or directory (or multiple using wildcards) to a new destination.
     * @param {string} sourcePath - The source path(s) to move, relative to the server's 'files' root. Can include wildcards (e.g., 'public/*.txt').
     * @param {string} destinationPath - The destination directory, relative to the server's 'files' root.
     * @returns {Promise<string>} - A promise that resolves to a success message detailing the move operation.
     */
    mv: async (sourcePath, destinationPath) => {
        if (!sourcePath || !destinationPath) {
            throw new Error('MV: Source and destination paths are required.')
        }
        return makeApiCall('POST', '/', {
            'X-CMD': 'mv',
            'X-SRC': sourcePath,
            'X-DST': destinationPath
        })
    },

    /**
     * Copies a file or directory (or multiple using wildcards) to a new destination.
     * @param {string} sourcePath - The source path(s) to copy, relative to the server's 'files' root. Can include wildcards (e.g., 'public/*.txt').
     * @param {string} destinationPath - The destination directory, relative to the server's 'files' root.
     * @returns {Promise<string>} - A promise that resolves to a success message detailing the copy operation.
     */
    copy: async (sourcePath, destinationPath) => {
        if (!sourcePath || !destinationPath) {
            throw new Error('COPY: Source and destination paths are required.')
        }
        return makeApiCall('POST', '/', {
            'X-CMD': 'cp',
            'X-SRC': sourcePath,
            'X-DST': destinationPath
        })
    },

    /**
     * Renames a single file or directory.
     * @param {string} sourcePath - The current path of the file or directory, relative to the server's 'files' root.
     * @param {string} newPath - The new path and name for the file or directory, relative to the server's 'files' root. This must be in the same directory as the source.
     * @returns {Promise<string>} - A promise that resolves to a success message detailing the rename operation.
     */
    rn: async (sourcePath, newPath) => {
        if (!sourcePath || !newPath) {
            throw new Error('RN: Source and destination paths are required.')
        }
        return makeApiCall('POST', '/', {
            'X-CMD': 'rn',
            'X-SRC': sourcePath,
            'X-DST': newPath
        })
    },

    /**
     * Deletes files or directories. Moves to trash first if not already in trash, then permanently deletes from trash.
     * @param {string} delPath - The path(s) to delete, relative to the server's 'files' root. Can include wildcards (e.g., 'temp/*.log').
     * @returns {Promise<string>} - A promise that resolves to a success message detailing the deletion operation.
     */
    del: async (delPath) => {
        if (!delPath) {
            throw new Error('DEL: Path to delete is required.')
        }
        return makeApiCall('DELETE', '/', { 'X-CMD': 'rm', 'X-SRC': delPath })
    }
}

const apiSync = {
    /**
     * Synchronous version: Lists files and directories on the server.
     * @param {string} path - The path to list.
     * @returns {FileInfo[]} - An array of file/directory information.
     */
    ls: (path) => {
        if (!path) throw new Error('LS: Path is required.');
        return makeApiCallSync('GET', '/', { 'X-CMD': 'ls', 'X-SRC': path });
    },

    /**
     * Synchronous version: Reads the content of a file.
     * @param {string} filePath - The path to the file to read.
     * @returns {string} - The file's content as a string.
     */
    readFile: (filePath) => {
        if (!filePath) throw new Error('ReadFile: File path is required.');
        return makeApiCallSync('GET', '/', { 'X-CMD': 'fread', 'X-SRC': filePath });
    },

    /**
     * Synchronous version: Reads the content of a file as a binary ArrayBuffer.
     * @param {string} filePath - The path to the file to read.
     * @returns {ArrayBuffer} - The file's content as an ArrayBuffer.
     */
    readFileBinary: (filePath) => {
        if (!filePath) throw new Error('ReadFileBinary: File path is required.');
        return makeApiCallSync('GET', '/', { 'X-CMD': 'freadb', 'X-SRC': filePath }, null, 'arraybuffer');
    },

    /**
     * Synchronous version: Saves content to a file.
     * @param {string} filePath - The path where the file will be saved.
     * @param {string} content - The content to write to the file.
     * @returns {string} - A success message.
     */
    saveFile: (filePath, content) => {
        if (!filePath || content === undefined) throw new Error('SaveFile: File path and content are required.');
        return makeApiCallSync('POST', '/', { 'X-CMD': 'fwrite', 'X-SRC': filePath }, content);
    },

    /**
     * Synchronous version: Creates a directory path recursively.
     * @param {string} mkPath - The directory path to create.
     * @returns {string} - A success message.
     */
    mkPath: (mkPath) => {
        if (!mkPath) throw new Error('MkPath: Path to create is required.');
        return makeApiCallSync('POST', '/', { 'X-CMD': 'mkdir', 'X-SRC': mkPath });
    },

    /**
     * Synchronous version: Moves a file or directory to a new destination.
     * @param {string} sourcePath - The source path(s) to move.
     * @param {string} destinationPath - The destination directory.
     * @returns {string} - A success message.
     */
    mv: (sourcePath, destinationPath) => {
        if (!sourcePath || !destinationPath) throw new Error('MV: Source and destination paths are required.');
        return makeApiCallSync('POST', '/', { 'X-CMD': 'mv', 'X-SRC': sourcePath, 'X-DST': destinationPath });
    },

    /**
     * Synchronous version: Copies a file or directory to a new destination.
     * @param {string} sourcePath - The source path(s) to copy.
     * @param {string} destinationPath - The destination directory.
     * @returns {string} - A success message.
     */
    copy: (sourcePath, destinationPath) => {
        if (!sourcePath || !destinationPath) throw new Error('COPY: Source and destination paths are required.');
        return makeApiCallSync('POST', '/', { 'X-CMD': 'cp', 'X-SRC': sourcePath, 'X-DST': destinationPath });
    },

    /**
     * Synchronous version: Renames a single file or directory.
     * @param {string} sourcePath - The current path of the file or directory.
     * @param {string} newPath - The new path and name.
     * @returns {string} - A success message.
     */
    rn: (sourcePath, newPath) => {
        if (!sourcePath || !newPath) throw new Error('RN: Source and destination paths are required.');
        return makeApiCallSync('POST', '/', { 'X-CMD': 'rn', 'X-SRC': sourcePath, 'X-DST': newPath });
    },

    /**
     * Synchronous version: Deletes files or directories.
     * @param {string} delPath - The path(s) to delete.
     * @returns {string} - A success message.
     */
    del: (delPath) => {
        if (!delPath) throw new Error('DEL: Path to delete is required.');
        return makeApiCallSync('DELETE', '/', { 'X-CMD': 'rm', 'X-SRC': delPath });
    }
};

export { api, apiSync };