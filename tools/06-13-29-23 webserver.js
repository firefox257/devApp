const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const rename = promisify(fs.rename);
const unlink = promisify(fs.unlink);
const rm = promisify(fs.rm);
const copyFile = promisify(fs.copyFile);

const _mimetype = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.js': 'text/javascript',
    '.jpg': 'image/jpeg',
    '.JPG': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.svg': 'image/svg+xml',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.css': 'text/css',
    '.hdr': 'application/octet-stream',
    '.json': 'application/json',
    '.stl': 'application/sla',
    '.dxf': 'application/dxf',
    '.gif': 'image/gif',
    '.woff2': 'font/woff2',
    '.ico': 'image/vnd.microsoft.icon',
    '.glb': 'model/gltf-binary',
    '.wasm': 'application/wasm',
    '.pvr': 'image/x-png',
    '.usdz': 'vnd.usdz+zip',
    '.mpd': 'application/dash+xml',
    '.dae': 'model/vnd.collada+xml',
    '.obj': 'multipart/form-data',
    '.ply': 'model/mesh',
    '.3dm': 'model/vnd.3dm',
    '.3ds': 'application/x-3ds',
    '.3mf': 'model/3mf',
    '.amf': 'application/octet-stream',
    '.bvh': 'animation/bvh',
    '.drc': 'application/octet-stream',
    '.fbx': 'application/octet-stream',
    '.gcode': 'text/x-gcode',
    '.kmz': 'application/vnd.google-earth.kmz+xml',
    '.lwo': 'image/x-lwo',
    '.md2': 'model/md2',
    '.mdd': 'application/octet-stream',
    '.nrrd': 'application/octet-stream',
    '.mtl': 'text/plain',
    '.pcd': 'application/vnd.pointcloud+json',
    '.pdb': 'chemical/pdb',
    '.vox': 'application/octet-stream',
    '.wrl': 'model/x3d-vrl',
    '.vtk': 'application/octet-stream',
    '.dds': 'image/vnd.ms-dds',
    '.exr': 'application/octet-stream',
    '.ktx': 'application/octet-stream',
    '.ktx2': 'application/octet-stream',
    '.tga': 'image/x-tga',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.ttf': 'font/ttf',
    '.vtp': 'application/vibrationview',
    '.zip': 'application/zip',
    '.xyz': 'application/octet-stream',
    '.webm': 'video/webm',
    '.wat': 'text/plain'
}

// WebRTC Signaling Store - FIXED STRUCTURE
const webrtcRooms = {}; // roomId -> { pendingMessage: *, waitingQueue: [{res, timeoutId}], lastAccessed: Date }
const MAX_ROOMS = 1000; // Prevent memory exhaustion
const WAIT_TIMEOUT = 30000; // 30 seconds wait timeout

const serverOptions = {
    port: 80,
    sslport: 443,
    key: './key.pem',
    cert: './cert.pem',
    additionalMethods: []
}

const allowHead = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':
        'OPTIONS, POST, GET, PUT, PATCH, DELETE',
    'Access-Control-Max-Age': 2592000, //30 days
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-LS-Path, X-Read-File, X-Read-File-Binary, X-Save-File, X-File-Path, X-File-Content, X-MKPATH, X-MV-Source, X-MV-Destination, X-DEL-Path, X-COPY-Source, X-COPY-Destination, X-RN-Source, X-RN-Destination'
}

globalThis.sendPlainTextResponse = function (res, message, statusCode = 200, headers = {}) {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain', ...headers });
    res.end(typeof message === 'object' ? JSON.stringify(message) : message);
};

globalThis.sendJsonResponse = function (res, data, statusCode = 200, headers = {}) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(data));
};

globalThis.streamFile = function (req, res, filePath, contentType, statusCode = 200, headers = {}) {
    fs.stat(filePath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                sendPlainTextResponse(res, '404 Not Found', 404);
            } else {
                sendPlainTextResponse(res, '500 Internal Server Error', 500);
            }
            return;
        }

        const fileSize = stats.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            const streamHeaders = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
                ...headers
            };

            res.writeHead(206, streamHeaders);
            const fileStream = fs.createReadStream(filePath, { start, end });
            fileStream.pipe(res);
        } else {
            const streamHeaders = {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                ...headers
            };
            res.writeHead(statusCode, streamHeaders);
            fs.createReadStream(filePath).pipe(res);
        }
    });
};

const apiCache = new Map();

function handleFileRequest(req, res, filePath) {
    fs.stat(filePath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                sendPlainTextResponse(res, '404 Not Found', 404);
            } else {
                sendPlainTextResponse(res, '500 Internal Server Error', 500);
            }
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = _mimetype[ext] || 'application/octet-stream';

        streamFile(req, res, filePath, contentType);
    });
}

async function handleApiRequest(req, res, apiName) {
    const apiFilePath = path.join(__dirname, 'files', 'api', `${apiName}.api.js`);

    if (apiCache.has(apiName)) {
        const cachedApi = apiCache.get(apiName);
        cachedApi.lastAccessed = Date.now();
        try {
            await cachedApi.module.handler(req, res);
        } catch (error) {
            console.error(`Error executing cached API ${apiName}:`, error);
            sendPlainTextResponse(res, '500 Internal Server Error', 500);
        }
    } else {
        fs.access(apiFilePath, fs.constants.F_OK, async (err) => {
            if (err) {
                sendPlainTextResponse(res, `404 API Not Found: ${apiName}`, 404);
                return;
            }

            try {
                delete require.cache[require.resolve(apiFilePath)];
                const apiModule = require(apiFilePath);
                if (typeof apiModule.handler === 'function') {
                    apiCache.set(apiName, { module: apiModule, lastAccessed: Date.now() });
                    await apiModule.handler(req, res);
                } else {
                    sendPlainTextResponse(res, `500 API Error: ${apiName}.api.js does not export a 'handler' function.`, 500);
                }
            } catch (error) {
                console.error(`Error loading or executing API ${apiName}:`, error);
                sendPlainTextResponse(res, '500 Internal Server Error', 500);
            }
        });
    }
}

setInterval(() => {
    const now = Date.now();
    
    // Cleanup old APIs
    for (const [apiName, apiInfo] of apiCache.entries()) {
        const oneHour = 60 * 60 * 1000;
        if (now - apiInfo.lastAccessed > oneHour) {
            console.log(`Unloading API: ${apiName}.api.js due to inactivity.`);
            const apiFilePath = path.join(__dirname, 'files', 'api', `${apiName}.api.js`);
            delete require.cache[require.resolve(apiFilePath)];
            apiCache.delete(apiName);
        }
    }
    
    // Cleanup expired WebRTC rooms
    for (const roomId in webrtcRooms) {
        const room = webrtcRooms[roomId];
        // Clean rooms with no activity for 2 minutes
        if (Date.now() - room.lastAccessed > 120000) {
            // Clear all timeouts in queue
            if (room.waitingQueue) {
                room.waitingQueue.forEach(w => {
                    if (w.timeoutId) clearTimeout(w.timeoutId);
                    if (w.res && !w.res.headersSent) {
                        try { sendPlainTextResponse(w.res, 'Room expired', 410); } catch (e) {}
                    }
                });
            }
            delete webrtcRooms[roomId];
            console.log(`Cleaned expired WebRTC room: ${roomId}`);
        }
    }
}, 10 * 60 * 1000);

const FILES_ROOT = path.join(__dirname, 'files');
const TRASH_DIR = path.join(FILES_ROOT, 'trash');

// The CORRECTED handleLs function
async function handleLs(res, lsPath) {
    const hasWildcard = lsPath.includes('*');
    let targetDirectory;
    let filesToProcess = [];

    // Basic path traversal prevention for the target directory
    if (!path.join(FILES_ROOT, lsPath).startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid LS path.', 403);
    }

    try {
        if (hasWildcard) {
            targetDirectory = path.join(FILES_ROOT, path.dirname(lsPath));
            const pattern = path.basename(lsPath);
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            const allEntries = await readdir(targetDirectory);
            filesToProcess = allEntries.filter(file => regex.test(file));
        } else {
            targetDirectory = path.join(FILES_ROOT, lsPath);
            const stats = await stat(targetDirectory);

            if (stats.isFile()) {
                // It's a single file request, return only its info
                const fileInfo = {
                    name: path.basename(targetDirectory),
                    type: 'file',
                    size: stats.size,
                    modifiedTime: stats.mtime.toISOString(),
                    modifiedTimeMs: stats.mtime.getTime()
                };
                return sendJsonResponse(res, [fileInfo]);
            } else if (stats.isDirectory()) {
                // It's a directory request, list all its contents
                filesToProcess = await readdir(targetDirectory);
            }
        }

        const fileInfoList = [];
        for (const file of filesToProcess) {
            const filePath = path.join(targetDirectory, file);
            try {
                const fileStats = await stat(filePath);
                fileInfoList.push({
                    name: file,
                    type: fileStats.isDirectory() ? 'directory' : 'file',
                    size: fileStats.size,
                    modifiedTime: fileStats.mtime.toISOString(),
                    modifiedTimeMs: fileStats.mtime.getTime()
                });
            } catch (err) {
                // Skip if we can't get stats (e.g., race condition)
                console.warn(`Could not get stats for ${filePath}: ${err.message}`);
            }
        }
        sendJsonResponse(res, fileInfoList);

    } catch (error) {
        if (error.code === 'ENOENT') {
            sendPlainTextResponse(res, `LS Error: Path not found: ${lsPath}`, 404);
        } else {
            console.error(`LS Internal Server Error for path "${lsPath}": ${error.message}`);
            sendPlainTextResponse(res, `LS Internal Server Error: ${error.message}`, 500);
        }
    }
}

async function handleReadFile(res, filePathHeader) {
    const fullPath = path.join(FILES_ROOT, filePathHeader);

    if (!fullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid file path.', 403);
    }

    try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
            return sendPlainTextResponse(res, 'READFILE Error: Cannot read a directory.', 400);
        }
        const content = await readFile(fullPath, 'utf8');
        sendPlainTextResponse(res, content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            sendPlainTextResponse(res, `READFILE Error: File not found: ${filePathHeader}`, 404);
        } else {
            console.error(`READFILE Error: ${error.message}`);
            sendPlainTextResponse(res, `READFILE Internal Server Error: ${error.message}`, 500);
        }
    }
}

async function handleReadFileBinary(req, res, filePathHeader) {
   const fullPath = path.join(FILES_ROOT, filePathHeader);

    if (!fullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid file path.', 403);
    }

    try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
            return sendPlainTextResponse(res, 'READFILE Error: Cannot read a directory.', 400);
        }
        
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = _mimetype[ext] || 'application/octet-stream';

        streamFile(req, res, fullPath, contentType);

    } catch (error) {
        if (error.code === 'ENOENT') {
            sendPlainTextResponse(res, `READFILE Error: File not found: ${filePathHeader}`, 404);
        } else {
            console.error(`READFILE Error: ${error.message}`);
            sendPlainTextResponse(res, `READFILE Internal Server Error: ${error.message}`, 500);
        }
    }
}

async function handleSaveFile(req, res, filePathHeader) {
    const fullPath = path.join(FILES_ROOT, filePathHeader);

    if (!fullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid file path.', 403);
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        try {
            const dir = path.dirname(fullPath);
            await mkdir(dir, { recursive: true });

            await writeFile(fullPath, body, 'utf8');
            sendPlainTextResponse(res, `File saved successfully: ${filePathHeader}`, 200);
        } catch (error) {
            console.error(`SAVEFILE Error: ${error.message}`);
            sendPlainTextResponse(res, `SAVEFILE Internal Server Error: ${error.message}`, 500);
        }
    });

    req.on('error', (error) => {
        console.error(`Request error during SAVEFILE: ${error.message}`);
        sendPlainTextResponse(res, 'Request Error during SAVEFILE', 500);
    });
}

async function handleMkpath(res, mkPathHeader) {
    const fullPath = path.join(FILES_ROOT, mkPathHeader);

    if (!fullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid MKPATH.', 403);
    }

    try {
        await mkdir(fullPath, { recursive: true });
        sendPlainTextResponse(res, `Path created successfully: ${mkPathHeader}`, 200);
    } catch (error) {
        if (error.code === 'EEXIST') {
            sendPlainTextResponse(res, `MKPATH Warning: Path already exists: ${mkPathHeader}`, 200);
        } else {
            console.error(`MKPATH Error: ${error.message}`);
            sendPlainTextResponse(res, `MKPATH Internal Server Error: ${error.message}`, 500);
        }
    }
}

async function handleMv(res, mvSourceHeader, mvDestinationHeader) {
    const sourceFullPath = path.join(FILES_ROOT, mvSourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, mvDestinationHeader);

    if (!sourceFullPath.startsWith(FILES_ROOT) || !destinationFullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid MV source or destination path.', 403);
    }

    try {
        const destinationStats = await stat(destinationFullPath);
        if (!destinationStats.isDirectory()) {
            return sendPlainTextResponse(res, `MV Error: Destination is not a directory: ${mvDestinationHeader}`, 400);
        }

        const hasWildcard = mvSourceHeader.includes('*');
        let filesToMove = [];
        let baseSourceDir = path.dirname(sourceFullPath);
        let pattern = hasWildcard ? path.basename(sourceFullPath) : null;

        if (hasWildcard) {
            try {
                const sourceFiles = await readdir(baseSourceDir);
                const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                filesToMove = sourceFiles
                    .filter(file => regex.test(file))
                    .map(file => path.join(baseSourceDir, file));
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `MV Error: Source directory for wildcard not found: ${path.dirname(mvSourceHeader)}`, 404);
                }
                throw err;
            }
        } else {
            try {
                await stat(sourceFullPath);
                filesToMove.push(sourceFullPath);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `MV Error: Source not found: ${mvSourceHeader}`, 404);
                }
                throw err;
            }
        }

        if (filesToMove.length === 0) {
            return sendPlainTextResponse(res, `MV Warning: No files or directories matched the source: ${mvSourceHeader}`, 200);
        }

        const results = [];
        for (const fileToMove of filesToMove) {
            const fileName = path.basename(fileToMove);
            const finalDestinationPath = path.join(destinationFullPath, fileName);
            try {
                await rename(fileToMove, finalDestinationPath);
                results.push(`Moved: ${path.relative(FILES_ROOT, fileToMove)} to ${path.relative(FILES_ROOT, finalDestinationPath)}`);
            } catch (moveError) {
                console.error(`Error moving ${fileToMove}: ${moveError.message}`);
                results.push(`Failed to move ${path.relative(FILES_ROOT, fileToMove)}: ${moveError.message}`);
            }
        }
        sendPlainTextResponse(res, `MV Operation complete:\n${results.join('\n')}`, 200);

    } catch (error) {
        console.error(`MV Internal Server Error: ${error.message}`);
        sendPlainTextResponse(res, `MV Internal Server Error: ${error.message}`, 500);
    }
}

async function handleRn(res, rnSourceHeader, rnDestinationHeader) {
    const sourceFullPath = path.join(FILES_ROOT, rnSourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, rnDestinationHeader);
    
    if (!sourceFullPath.startsWith(FILES_ROOT) || !destinationFullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid RN source or destination path.', 403);
    }

    if (path.dirname(sourceFullPath) !== path.dirname(destinationFullPath)) {
        return sendPlainTextResponse(res, 'RN Error: Destination must be in the same directory as the source.', 400);
    }

    try {
        await rename(sourceFullPath, destinationFullPath);
        sendPlainTextResponse(res, `Renamed successfully: ${rnSourceHeader} to ${rnDestinationHeader}`, 200);
    } catch (error) {
        if (error.code === 'ENOENT') {
            sendPlainTextResponse(res, `RN Error: Source not found: ${rnSourceHeader}`, 404);
        } else {
            console.error(`RN Internal Server Error: ${error.message}`);
            sendPlainTextResponse(res, `RN Internal Server Error: ${error.message}`, 500);
        }
    }
}

async function copyDirectoryRecursive(src, dest) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectoryRecursive(srcPath, destPath);
        } else {
            await copyFile(srcPath, destPath);
        }
    }
}

async function handleCopy(res, copySourceHeader, copyDestinationHeader) {
    const sourceFullPath = path.join(FILES_ROOT, copySourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, copyDestinationHeader);

    if (!sourceFullPath.startsWith(FILES_ROOT) || !destinationFullPath.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid COPY source or destination path.', 403);
    }

    try {
        let actualDestinationDir = destinationFullPath;
        try {
            const destStats = await stat(destinationFullPath);
            if (!destStats.isDirectory()) {
                return sendPlainTextResponse(res, `COPY Error: Destination is not a directory: ${copyDestinationHeader}`, 400);
            }
        } catch (err) {
            if (err.code === 'ENOENT') {
                await mkdir(destinationFullPath, { recursive: true });
            } else {
                throw err;
            }
        }

        const hasWildcard = copySourceHeader.includes('*');
        let itemsToCopy = [];
        let baseSourceDir = path.dirname(sourceFullPath);
        let pattern = hasWildcard ? path.basename(sourceFullPath) : null;

        if (hasWildcard) {
            try {
                const sourceEntries = await readdir(baseSourceDir);
                const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                itemsToCopy = sourceEntries
                    .filter(entry => regex.test(entry))
                    .map(entry => path.join(baseSourceDir, entry));
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `COPY Error: Source directory for wildcard not found: ${path.dirname(copySourceHeader)}`, 404);
                }
                throw err;
            }
        } else {
            try {
                await stat(sourceFullPath);
                itemsToCopy.push(sourceFullPath);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `COPY Error: Source not found: ${copySourceHeader}`, 404);
                }
                throw err;
            }
        }

        if (itemsToCopy.length === 0) {
            return sendPlainTextResponse(res, `COPY Warning: No files or directories matched the source: ${copySourceHeader}`, 200);
        }

        const results = [];
        for (const itemToCopy of itemsToCopy) {
            const itemName = path.basename(itemToCopy);
            const finalDestinationPath = path.join(destinationFullPath, itemName);

            try {
                const itemStats = await stat(itemToCopy);
                if (itemStats.isDirectory()) {
                    await copyDirectoryRecursive(itemToCopy, finalDestinationPath);
                    results.push(`Copied directory: ${path.relative(FILES_ROOT, itemToCopy)} to ${path.relative(FILES_ROOT, finalDestinationPath)}`);
                } else {
                    const parentDirOfFile = path.dirname(finalDestinationPath);
                    await mkdir(parentDirOfFile, { recursive: true });
                    await copyFile(itemToCopy, finalDestinationPath);
                    results.push(`Copied file: ${path.relative(FILES_ROOT, itemToCopy)} to ${path.relative(FILES_ROOT, finalDestinationPath)}`);
                }
            } catch (copyError) {
                console.error(`Error copying ${itemToCopy}: ${copyError.message}`);
                results.push(`Failed to copy ${path.relative(FILES_ROOT, itemToCopy)}: ${copyError.message}`);
            }
        }
        sendPlainTextResponse(res, `COPY Operation complete:\n${results.join('\n')}`, 200);

    } catch (error) {
        console.error(`COPY Internal Server Error: ${error.message}`);
        sendPlainTextResponse(res, `COPY Internal Server Error: ${error.message}`, 500);
    }
}

async function handleDel(res, delPathHeader) {
    const fullPathToDelete = path.join(FILES_ROOT, delPathHeader);

    if (!fullPathToDelete.startsWith(FILES_ROOT)) {
        return sendPlainTextResponse(res, 'Access Denied: Invalid DEL path.', 403);
    }

    try {
        const hasWildcard = delPathHeader.includes('*');
        let itemsToDelete = [];
        let baseDeleteDir = path.dirname(fullPathToDelete);
        let pattern = hasWildcard ? path.basename(fullPathToDelete) : null;

        if (hasWildcard) {
            try {
                const sourceFiles = await readdir(baseDeleteDir);
                const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                itemsToDelete = sourceFiles
                    .filter(file => regex.test(file))
                    .map(file => path.join(baseDeleteDir, file));
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `DEL Error: Source directory for wildcard not found: ${path.dirname(delPathHeader)}`, 404);
                }
                throw err;
            }
        } else {
            try {
                await stat(fullPathToDelete);
                itemsToDelete.push(fullPathToDelete);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, `DEL Error: Item not found: ${delPathHeader}`, 404);
                }
                throw err;
            }
        }

        if (itemsToDelete.length === 0) {
            return sendPlainTextResponse(res, `DEL Warning: No files or directories matched for deletion: ${delPathHeader}`, 200);
        }

        const results = [];
        for (const itemPath of itemsToDelete) {
            const relativeItemPath = path.relative(FILES_ROOT, itemPath);
            try {
                const itemStats = await stat(itemPath);
                const isDirectory = itemStats.isDirectory();

                if (itemPath.startsWith(TRASH_DIR + path.sep) || itemPath === TRASH_DIR) {
                    if (isDirectory) {
                        await rm(itemPath, { recursive: true, force: true });
                        results.push(`Permanently deleted directory from trash: ${relativeItemPath}`);
                    } else {
                        await unlink(itemPath);
                        results.push(`Permanently deleted file from trash: ${relativeItemPath}`);
                    }
                } else {
                    await mkdir(TRASH_DIR, { recursive: true });
                    const trashDestination = path.join(TRASH_DIR, path.basename(itemPath));
                    await rename(itemPath, trashDestination);
                    results.push(`Moved to trash: ${relativeItemPath}`);
                }
            } catch (deleteError) {
                console.error(`Error deleting/moving ${itemPath}: ${deleteError.message}`);
                results.push(`Failed to delete/move ${relativeItemPath}: ${deleteError.message}`);
            }
        }
        sendPlainTextResponse(res, `DEL Operation complete:\n${results.join('\n')}`, 200);

    } catch (error) {
        console.error(`DEL Internal Server Error: ${error.message}`);
        sendPlainTextResponse(res, `DEL Internal Server Error: ${error.message}`, 500);
    }
}

function webHandler(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, allowHead);
        res.end();
        return;
    }

    // WebRTC Signaling Endpoints (HTTP Long Polling) - FIXED IMPLEMENTATION
    const requestedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = requestedUrl.pathname;
    
    // Signal endpoint: POST /webrtc/signal { roomId, message }
    if (pathname === '/webrtc/signal' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (!data.roomId || !data.message || typeof data.roomId !== 'string' || !data.roomId.trim()) {
                    return sendPlainTextResponse(res, 'Invalid roomId or message', 400);
                }
                const roomId = data.roomId.trim().substring(0, 100); // Sanitize + limit length
                
                // Clean old rooms if near capacity (simple LRU)
                if (Object.keys(webrtcRooms).length > MAX_ROOMS) {
                    const oldestRoom = Object.keys(webrtcRooms).sort((a, b) => 
                        (webrtcRooms[a].lastAccessed || 0) - (webrtcRooms[b].lastAccessed || 0)
                    )[0];
                    if (oldestRoom) {
                        const room = webrtcRooms[oldestRoom];
                        if (room.waitingQueue) {
                            room.waitingQueue.forEach(w => {
                                if (w.timeoutId) clearTimeout(w.timeoutId);
                            });
                        }
                        delete webrtcRooms[oldestRoom];
                        console.log(`Cleaned oldest room due to capacity: ${oldestRoom}`);
                    }
                }

                // Deliver to first waiting peer if queue exists (FIFO)
                if (webrtcRooms[roomId]?.waitingQueue && webrtcRooms[roomId].waitingQueue.length > 0) {
                    const waitingPeer = webrtcRooms[roomId].waitingQueue.shift();
                    clearTimeout(waitingPeer.timeoutId);
                    
                    // Send message to waiting peer
                    sendJsonResponse(waitingPeer.res, { message: data.message });
                    
                    // Cleanup room if no pending message and empty queue
                    if (!webrtcRooms[roomId].pendingMessage && webrtcRooms[roomId].waitingQueue.length === 0) {
                        delete webrtcRooms[roomId];
                    }
                    
                    sendPlainTextResponse(res, 'Message delivered', 200);
                    return;
                }

                // Store message for future poll (overwrite existing)
                webrtcRooms[roomId] = {
                    pendingMessage: data.message,
                    waitingQueue: [],
                    lastAccessed: Date.now()
                };
                sendPlainTextResponse(res, 'Message stored', 200);
            } catch (e) {
                console.error('Signal parse error:', e.message);
                sendPlainTextResponse(res, 'Invalid JSON payload', 400);
            }
        });
        req.on('error', () => sendPlainTextResponse(res, 'Request error', 500));
        return;
    }

    // Wait endpoint: GET /webrtc/wait?roomId=xxx - FIXED: Keep room alive after delivering pending message!
    if (pathname === '/webrtc/wait' && req.method === 'GET') {
        const roomId = requestedUrl.searchParams.get('roomId')?.trim().substring(0, 100);
        
        if (!roomId) {
            return sendPlainTextResponse(res, 'Missing roomId parameter', 400);
        }

        // Deliver stored message immediately if available
        if (webrtcRooms[roomId]?.pendingMessage !== undefined) {
            sendJsonResponse(res, { message: webrtcRooms[roomId].pendingMessage });
            // === CRITICAL FIX ===
            // DO NOT delete pendingMessage or room!
            // Room must stay alive for reverse signaling (answer going back to offerer)
            webrtcRooms[roomId].lastAccessed = Date.now();
            // pendingMessage remains until explicitly overwritten or room expires
            return;
        }

        // Initialize room if it doesn't exist
        if (!webrtcRooms[roomId]) {
            webrtcRooms[roomId] = {
                pendingMessage: null,
                waitingQueue: [],
                lastAccessed: Date.now()
            };
        }

        // Add to waiting queue (FIFO)
        const timeoutId = setTimeout(() => {
            const room = webrtcRooms[roomId];
            if (room) {
                // Remove this specific waiter from queue
                room.waitingQueue = room.waitingQueue.filter(w => w.res !== res);
                // Cleanup room if truly empty
                if (!room.pendingMessage && room.waitingQueue.length === 0) {
                    delete webrtcRooms[roomId];
                }
            }
            if (!res.headersSent) {
                sendPlainTextResponse(res, 'Signaling timeout', 408);
            }
        }, WAIT_TIMEOUT);

        webrtcRooms[roomId].waitingQueue.push({ res, timeoutId });
        webrtcRooms[roomId].lastAccessed = Date.now();
        
        // IMPORTANT: Do NOT call res.end() here - response stays open
        return;
    }

    const xcmd = req.headers['x-cmd'];
    if (xcmd) {
        switch (xcmd) {
            case "ls":
                handleLs(res, req.headers['x-src']);
                return;
            case "fread":
                handleReadFile(res, req.headers['x-src']);
                return;
            case "freadb":
                handleReadFileBinary(req, res, req.headers['x-src']);
                return;
            case "fwrite":
                if (req.method === 'POST' || req.method === 'PUT') {
                    handleSaveFile(req, res, req.headers['x-src']);
                } else {
                    sendPlainTextResponse(res, 'SAVEFILE requires POST or PUT method.', 405);
                }
                return;
            case "mkdir":
                if (req.method === 'POST' || req.method === 'PUT') {
                    handleMkpath(res, req.headers['x-src']);
                } else {
                    sendPlainTextResponse(res, 'MKPATH requires POST or PUT method.', 405);
                }
                return;
            case "mv":
                if (req.method === 'POST' || req.method === 'PUT') {
                    handleMv(res, req.headers['x-src'], req.headers['x-dst']);
                } else {
                    sendPlainTextResponse(res, 'MV requires POST or PUT method.', 405);
                }
                return;
            case "cp":
                if (req.method === 'POST' || req.method === 'PUT') {
                    handleCopy(res, req.headers['x-src'], req.headers['x-dst']);
                } else {
                    sendPlainTextResponse(res, 'COPY requires POST or PUT method.', 405);
                }
                return;
            case "rn":
                if (req.method === 'POST' || req.method === 'PUT') {
                    handleRn(res, req.headers['x-src'], req.headers['x-dst']);
                } else {
                    sendPlainTextResponse(res, 'RN requires POST or PUT method.', 405);
                }
                return;
            case "rm":
                if (req.method === 'DELETE') {
                    handleDel(res, req.headers['x-src']);
                } else {
                    sendPlainTextResponse(res, 'DEL requires DELETE method.', 405);
                }
                return;
            default:
                sendPlainTextResponse(res, 'Command not found ' + xcmd, 405);
                return;
        }
    }

    if (pathname.endsWith('.api.js')) {
        const apiName = path.basename(pathname, '.api.js');
        handleApiRequest(req, res, apiName);
        return;
    }

    const filePath = path.join(__dirname, 'files', 'public', pathname === '/' ? 'index.html' : pathname);
    handleFileRequest(req, res, filePath);
}

const httpServer = http.createServer(webHandler);

httpServer.listen(serverOptions.port, () => {
    console.log(`HTTP Server running on port ${serverOptions.port}`);
    console.log(`WebRTC Signaling: POST /webrtc/signal | GET /webrtc/wait?roomId=xxx`);
});

let httpsServer;
try {
    const privateKey = fs.readFileSync(serverOptions.key, 'utf8');
    const certificate = fs.readFileSync(serverOptions.cert, 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    httpsServer = https.createServer(credentials, webHandler);

    httpsServer.listen(serverOptions.sslport, () => {
        console.log(`HTTPS Server running on port ${serverOptions.sslport}`);
        console.log(`WebRTC Signaling: POST /webrtc/signal | GET /webrtc/wait?roomId=xxx`);
    });
    if (typeof webAppReady === 'function') {
        webAppReady();
    }
} catch (error) {
    console.error('Error starting HTTPS server: Ensure key.pem and cert.pem exist in the server directory and are valid.', error.message);
    console.log('HTTPS server will not start.');
}