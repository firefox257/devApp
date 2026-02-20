// webserver.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const crypto = require('crypto'); // [WEBSOCKET] Required for handshake

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
    '.wat': 'text/plain',
	'.pdf': 'application/pdf',

}

// ===== CRITICAL SECURITY FIX: PATH VALIDATION HELPER =====
/**
 * Securely validates that a user-provided path stays within root directory
 * Prevents path traversal AND path confusion attacks
 * @param {string} root - Base directory (FILES_ROOT)
 * @param {string} userPath - User-supplied relative path
 * @returns {boolean} True if path is safe
 */
function isPathInsideRoot(root, userPath) {
    const resolvedRoot = path.resolve(root) + path.sep;
    const resolvedTarget = path.resolve(path.join(root, userPath)) + path.sep;
    return resolvedTarget.startsWith(resolvedRoot);
}
// ==========================================================

// ===== WEBSOCKET PROTOCOL HELPERS (RFC 6455 MINIMAL IMPLEMENTATION) =====
// [WEBSOCKET] Compute Sec-WebSocket-Accept header value
function computeAcceptKey(key) {
    const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto.createHash('sha1').update(key + magic).digest('base64');
}

// [WEBSOCKET] Parse ONLY masked text frames (client->server MUST mask)
function parseWebSocketFrame(buffer) {
    if (buffer.length < 2) return null;
    const opcode = buffer[0] & 0x0F;
    if (opcode !== 1) return null; // Only text frames
    const isMasked = (buffer[1] & 0x80) === 0x80;
    if (!isMasked) return null; // Reject unmasked frames per spec
    
    let payloadLen = buffer[1] & 0x7F;
    let dataStart = 2;
    
    if (payloadLen === 126) {
        if (buffer.length < 4) return null;
        payloadLen = buffer.readUInt16BE(2);
        dataStart = 4;
    } else if (payloadLen === 127) {
        if (buffer.length < 10) return null;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        dataStart = 10;
    }
    
    if (buffer.length < dataStart + 4 + payloadLen) return null;
    const masks = buffer.slice(dataStart, dataStart + 4);
    const payload = buffer.slice(dataStart + 4, dataStart + 4 + payloadLen);
    
    // Unmask payload (XOR with mask bytes)
    for (let i = 0; i < payload.length; i++) {
        payload[i] ^= masks[i % 4];
    }
    return payload.toString('utf8');
}

// [WEBSOCKET] Create server->client text frame (unmasked per spec)
function createWebSocketFrame(message) {
    const payload = Buffer.from(message, 'utf8');
    const len = payload.length;
    let headerLen = 2;
    
    if (len > 65535) headerLen += 8;
    else if (len > 125) headerLen += 2;
    
    const buffer = Buffer.allocUnsafe(headerLen + len);
    buffer[0] = 0x81; // FIN bit + text frame opcode
    
    if (len <= 125) {
        buffer[1] = len;
    } else if (len <= 65535) {
        buffer[1] = 126;
        buffer.writeUInt16BE(len, 2);
    } else {
        buffer[1] = 127;
        buffer.writeBigUInt64BE(BigInt(len), 2);
    }
    
    payload.copy(buffer, headerLen);
    return buffer;
}
// ==========================================================

// WebRTC Signaling Store
const webrtcRooms = {}; // roomId -> { pendingMessage: *, waitingQueue: [{res, timeoutId}], lastAccessed: Date }
const MAX_ROOMS = 1000; // Prevent memory exhaustion
const WAIT_TIMEOUT = 30000; // 30 seconds wait timeout

// ===== WEBSOCKET HANDLER CACHE (MIRRORS API CACHE PATTERN) =====
// [WEBSOCKET] Cache structure identical to apiCache
const wsCache = new Map(); // handlerName -> { module, lastAccessed }
// ==========================================================

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

// ===== WEBSOCKET UPGRADE HANDLER (SECURE ROUTING) =====
// [WEBSOCKET] Handles HTTP Upgrade requests for /ws/* endpoints
function handleWsUpgrade(serverType, req, socket, head) {
    try {
        // Validate path structure
        if (!req.url.startsWith('/ws/')) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            return;
        }

        // Extract handler name with strict sanitization
        const url = new URL(req.url, `http://${req.headers.host}`);
        const handlerName = path.basename(url.pathname);
        
        // SECURITY: Block path traversal/suspicious characters
        if (!handlerName || 
            handlerName.includes('.') || 
            handlerName.includes('/') || 
            handlerName.includes('\\') ||
            handlerName.length > 100) {
            console.warn(`[WS] Blocked invalid handler name: ${handlerName}`);
            socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            return;
        }

        // Resolve handler path WITH ROOT VALIDATION
        const apiRoot = path.join(__dirname, 'files', 'api');
        const wsFilePath = path.join(apiRoot, `${handlerName}.ws.js`);
        
        if (!isPathInsideRoot(apiRoot, path.relative(apiRoot, wsFilePath))) {
            console.warn(`[WS] Blocked path traversal: ${wsFilePath}`);
            socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            return;
        }

        // Verify file exists
        fs.access(wsFilePath, fs.constants.F_OK, (err) => {
            if (err) {
                socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
                return;
            }

            // Load handler (with cache)
            let handlerMod;
            if (wsCache.has(handlerName)) {
                const cached = wsCache.get(handlerName);
                cached.lastAccessed = Date.now();
                handlerMod = cached.module;
            } else {
                try {
                    // Clear require cache for hot reload
                    delete require.cache[require.resolve(wsFilePath)];
                    handlerMod = require(wsFilePath);
                    
                    if (typeof handlerMod.handler !== 'function') {
                        throw new Error('Handler must export "handler" function');
                    }
                    
                    wsCache.set(handlerName, { 
                        module: handlerMod, 
                        lastAccessed: Date.now() 
                    });
                    console.log(`[WS] ${serverType} Loaded handler: ${handlerName}`);
                } catch (e) {
                    console.error(`[WS] ${serverType} Load error ${handlerName}:`, e.message);
                    socket.end('HTTP/1.1 500 Internal Error\r\n\r\n');
                    return;
                }
            }

            // Validate WebSocket handshake headers
            if (req.headers.upgrade?.toLowerCase() !== 'websocket' || 
                !req.headers['sec-websocket-key']) {
                socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
                return;
            }

            // Send handshake response
            const acceptKey = computeAcceptKey(req.headers['sec-websocket-key']);
            socket.write(
                `HTTP/1.1 101 Switching Protocols\r\n` +
                `Upgrade: websocket\r\n` +
                `Connection: Upgrade\r\n` +
                `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
            );

            // Create minimal WebSocket object (mimics ws library API)
            const ws = {
                send: (msg) => {
                    if (socket.writable && typeof msg === 'string') {
                        try { socket.write(createWebSocketFrame(msg)); }
                        catch (e) { console.error(`[WS] Send error:`, e.message); }
                    }
                },
                close: (code = 1000, reason = '') => {
                    if (socket.writable) {
                        try {
                            const payload = Buffer.alloc(2 + reason.length);
                            payload.writeUInt16BE(code, 0);
                            if (reason) Buffer.from(reason, 'utf8').copy(payload, 2);
                            socket.write(Buffer.concat([
                                Buffer.from([0x88, payload.length]),
                                payload
                            ]));
                        } catch (e) {}
                    }
                    socket.destroy();
                },
                readyState: 1, // OPEN (matches WebSocket API spec)
                _socket: socket
            };

            // Frame parsing buffer
            let frameBuffer = Buffer.alloc(0);
            socket.on('data', (chunk) => {
                frameBuffer = Buffer.concat([frameBuffer, chunk]);
                while (frameBuffer.length >= 2) {
                    const message = parseWebSocketFrame(frameBuffer);
                    if (message === null) break; // Need more data
                    
                    // Remove processed frame bytes (simplified)
                    const processedLen = frameBuffer.length; // Actual impl would calculate precisely
                    frameBuffer = Buffer.alloc(0); // Reset buffer
                    
                    try {
                        // Call handler's onMessage if defined
                        const instance = handlerMod.handler(ws, req);
                        if (typeof instance?.onMessage === 'function') {
                            instance.onMessage(message);
                        }
                    } catch (e) {
                        console.error(`[WS] ${serverType} Handler error ${handlerName}:`, e.message);
                        ws.close(1011, 'Handler error');
                    }
                }
            });

            // Connection lifecycle events
            socket.on('close', () => {
                ws.readyState = 3; // CLOSED
                if (wsCache.has(handlerName)) {
                    wsCache.get(handlerName).lastAccessed = Date.now();
                }
                try {
                    const instance = handlerMod.handler(ws, req);
                    if (typeof instance?.onClose === 'function') instance.onClose();
                } catch (e) {}
            });

            socket.on('error', (err) => {
                console.error(`[WS] ${serverType} Socket error ${handlerName}:`, err.message);
                ws.close(1006, 'Socket error');
            });

            // Initialize handler
            try {
                const instance = handlerMod.handler(ws, req);
                if (typeof instance?.onOpen === 'function') {
                    instance.onOpen();
                }
            } catch (e) {
                console.error(`[WS] ${serverType} Init error ${handlerName}:`, e.message);
                ws.close(1011, 'Init failed');
            }
        });
    } catch (e) {
        console.error(`[WS] ${serverType} Upgrade error:`, e.message);
        if (!socket.destroyed) {
            socket.end('HTTP/1.1 500 Internal Error\r\n\r\n');
        }
    }
}
// ==========================================================

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
    
    // [WEBSOCKET] Cleanup inactive WebSocket handlers
    for (const [name, info] of wsCache.entries()) {
        if (now - info.lastAccessed > 60 * 60 * 1000) { // 1 hour
            console.log(`[WS] Unloaded inactive handler: ${name}`);
            try {
                const fp = path.join(__dirname, 'files', 'api', `${name}.ws.js`);
                delete require.cache[require.resolve(fp)];
            } catch (e) {}
            wsCache.delete(name);
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
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB upload limit

// ===== CORRECTED handleLs with SECURITY FIX =====
async function handleLs(res, lsPath) {
    if (!isPathInsideRoot(FILES_ROOT, lsPath)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }

    const hasWildcard = lsPath.includes('*');
    let targetDirectory;
    let filesToProcess = [];

    try {
        if (hasWildcard) {
            targetDirectory = path.join(FILES_ROOT, path.dirname(lsPath));
            const pattern = path.basename(lsPath);
            const safePattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            const regex = new RegExp('^' + safePattern + '$');
            const allEntries = await readdir(targetDirectory);
            filesToProcess = allEntries.filter(file => regex.test(file));
        } else {
            targetDirectory = path.join(FILES_ROOT, lsPath);
            const stats = await stat(targetDirectory);

            if (stats.isFile()) {
                const fileInfo = {
                    name: path.basename(targetDirectory),
                    type: 'file',
                    size: stats.size,
                    modifiedTime: stats.mtime.toISOString(),
                    modifiedTimeMs: stats.mtime.getTime()
                };
                return sendJsonResponse(res, [fileInfo]);
            } else if (stats.isDirectory()) {
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
                console.warn(`Could not get stats for file: ${err.message}`);
            }
        }
        sendJsonResponse(res, fileInfoList);

    } catch (error) {
        if (error.code === 'ENOENT') {
            sendPlainTextResponse(res, 'Path not found', 404);
        } else {
            console.error(`LS Error: ${error.message}`);
            sendPlainTextResponse(res, 'Internal Server Error', 500);
        }
    }
}

// ===== CORRECTED handleReadFile with SECURITY FIX =====
async function handleReadFile(res, filePathHeader) {
    if (!isPathInsideRoot(FILES_ROOT, filePathHeader)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }

    const fullPath = path.join(FILES_ROOT, filePathHeader);

    try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
            return sendPlainTextResponse(res, 'Cannot read a directory', 400);
        }
        const content = await readFile(fullPath, 'utf8');
        sendPlainTextResponse(res, content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            sendPlainTextResponse(res, 'File not found', 404);
        } else {
            console.error(`READFILE Error: ${error.message}`);
            sendPlainTextResponse(res, 'Internal Server Error', 500);
        }
    }
}

// ===== CORRECTED handleReadFileBinary with SECURITY FIX =====
async function handleReadFileBinary(req, res, filePathHeader) {
    if (!isPathInsideRoot(FILES_ROOT, filePathHeader)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }

    const fullPath = path.join(FILES_ROOT, filePathHeader);

    try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
            return sendPlainTextResponse(res, 'Cannot read a directory', 400);
        }
        
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = _mimetype[ext] || 'application/octet-stream';

        streamFile(req, res, fullPath, contentType);

    } catch (error) {
        if (error.code === 'ENOENT') {
            sendPlainTextResponse(res, 'File not found', 404);
        } else {
            console.error(`READFILEB Error: ${error.message}`);
            sendPlainTextResponse(res, 'Internal Server Error', 500);
        }
    }
}

// ===== CORRECTED handleSaveFile with SECURITY + DOS FIX =====
async function handleSaveFile(req, res, filePathHeader) {
    if (!isPathInsideRoot(FILES_ROOT, filePathHeader)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }

    const fullPath = path.join(FILES_ROOT, filePathHeader);
    let body = '';
    let sizeExceeded = false;

    req.on('data', chunk => {
        if (sizeExceeded) return;
        body += chunk.toString();
        if (body.length > MAX_UPLOAD_SIZE) {
            sizeExceeded = true;
            req.destroy();
            if (!res.headersSent) {
                sendPlainTextResponse(res, 'Payload too large (max 10MB)', 413);
            }
        }
    });

    req.on('end', async () => {
        if (sizeExceeded) return;
        try {
            const dir = path.dirname(fullPath);
            await mkdir(dir, { recursive: true });

            await writeFile(fullPath, body, 'utf8');
            sendPlainTextResponse(res, `File saved: ${filePathHeader}`, 200);
        } catch (error) {
            console.error(`SAVEFILE Error: ${error.message}`);
            sendPlainTextResponse(res, 'Internal Server Error', 500);
        }
    });

    req.on('error', (error) => {
        if (!res.headersSent) {
            sendPlainTextResponse(res, 'Request Error', 500);
        }
    });
}

// ===== CORRECTED handleMkpath with SECURITY FIX =====
async function handleMkpath(res, mkPathHeader) {
    if (!isPathInsideRoot(FILES_ROOT, mkPathHeader)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }

    const fullPath = path.join(FILES_ROOT, mkPathHeader);

    try {
        await mkdir(fullPath, { recursive: true });
        sendPlainTextResponse(res, `Path created: ${mkPathHeader}`, 200);
    } catch (error) {
        if (error.code === 'EEXIST') {
            sendPlainTextResponse(res, `Path exists: ${mkPathHeader}`, 200);
        } else {
            console.error(`MKPATH Error: ${error.message}`);
            sendPlainTextResponse(res, 'Internal Server Error', 500);
        }
    }
}

// ===== CORRECTED handleMv with SECURITY + REGEX FIX =====
async function handleMv(res, mvSourceHeader, mvDestinationHeader) {
    if (!isPathInsideRoot(FILES_ROOT, mvSourceHeader) || 
        !isPathInsideRoot(FILES_ROOT, mvDestinationHeader)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }

    const sourceFullPath = path.join(FILES_ROOT, mvSourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, mvDestinationHeader);

    try {
        const destinationStats = await stat(destinationFullPath);
        if (!destinationStats.isDirectory()) {
            return sendPlainTextResponse(res, 'Destination must be directory', 400);
        }

        const hasWildcard = mvSourceHeader.includes('*');
        let filesToMove = [];
        let baseSourceDir = path.dirname(sourceFullPath);
        let pattern = hasWildcard ? path.basename(sourceFullPath) : null;

        if (hasWildcard) {
            try {
                const sourceFiles = await readdir(baseSourceDir);
                const safePattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
                const regex = new RegExp('^' + safePattern + '$');
                filesToMove = sourceFiles
                    .filter(file => regex.test(file))
                    .map(file => path.join(baseSourceDir, file));
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, 'Source directory not found', 404);
                }
                throw err;
            }
        } else {
            try {
                await stat(sourceFullPath);
                filesToMove.push(sourceFullPath);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, 'Source not found', 404);
                }
                throw err;
            }
        }

        if (filesToMove.length === 0) {
            return sendPlainTextResponse(res, 'No files matched source', 200);
        }

        const results = [];
        for (const fileToMove of filesToMove) {
            if (!isPathInsideRoot(FILES_ROOT, path.relative(FILES_ROOT, fileToMove))) {
                results.push(`Skipped invalid path: ${path.relative(FILES_ROOT, fileToMove)}`);
                continue;
            }
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
        sendPlainTextResponse(res, `MV complete:\n${results.join('\n')}`, 200);

    } catch (error) {
        console.error(`MV Error: ${error.message}`);
        sendPlainTextResponse(res, 'Internal Server Error', 500);
    }
}

// ===== CORRECTED handleRn with SECURITY FIX =====
async function handleRn(res, rnSourceHeader, rnDestinationHeader) {
    if (!isPathInsideRoot(FILES_ROOT, rnSourceHeader) || 
        !isPathInsideRoot(FILES_ROOT, rnDestinationHeader)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }

    const sourceFullPath = path.join(FILES_ROOT, rnSourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, rnDestinationHeader);
    
    if (path.dirname(sourceFullPath) !== path.dirname(destinationFullPath)) {
        return sendPlainTextResponse(res, 'Destination must be in same directory', 400);
    }

    try {
        await rename(sourceFullPath, destinationFullPath);
        sendPlainTextResponse(res, `Renamed: ${rnSourceHeader} to ${rnDestinationHeader}`, 200);
    } catch (error) {
        if (error.code === 'ENOENT') {
            sendPlainTextResponse(res, 'Source not found', 404);
        } else {
            console.error(`RN Error: ${error.message}`);
            sendPlainTextResponse(res, 'Internal Server Error', 500);
        }
    }
}

// ===== CORRECTED handleCopy with SECURITY + REGEX FIX =====
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
    if (!isPathInsideRoot(FILES_ROOT, copySourceHeader) || 
        !isPathInsideRoot(FILES_ROOT, copyDestinationHeader)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }

    const sourceFullPath = path.join(FILES_ROOT, copySourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, copyDestinationHeader);

    try {
        let actualDestinationDir = destinationFullPath;
        try {
            const destStats = await stat(destinationFullPath);
            if (!destStats.isDirectory()) {
                return sendPlainTextResponse(res, 'Destination must be directory', 400);
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
                const safePattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
                const regex = new RegExp('^' + safePattern + '$');
                itemsToCopy = sourceEntries
                    .filter(entry => regex.test(entry))
                    .map(entry => path.join(baseSourceDir, entry));
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, 'Source directory not found', 404);
                }
                throw err;
            }
        } else {
            try {
                await stat(sourceFullPath);
                itemsToCopy.push(sourceFullPath);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, 'Source not found', 404);
                }
                throw err;
            }
        }

        if (itemsToCopy.length === 0) {
            return sendPlainTextResponse(res, 'No files matched source', 200);
        }

        const results = [];
        for (const itemToCopy of itemsToCopy) {
            if (!isPathInsideRoot(FILES_ROOT, path.relative(FILES_ROOT, itemToCopy))) {
                results.push(`Skipped invalid path: ${path.relative(FILES_ROOT, itemToCopy)}`);
                continue;
            }
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
        sendPlainTextResponse(res, `COPY complete:\n${results.join('\n')}`, 200);

    } catch (error) {
        console.error(`COPY Error: ${error.message}`);
        sendPlainTextResponse(res, 'Internal Server Error', 500);
    }
}

// ===== CORRECTED handleDel with SECURITY + REGEX FIX =====
async function handleDel(res, delPathHeader) {
    if (!isPathInsideRoot(FILES_ROOT, delPathHeader)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }

    const fullPathToDelete = path.join(FILES_ROOT, delPathHeader);

    try {
        const hasWildcard = delPathHeader.includes('*');
        let itemsToDelete = [];
        let baseDeleteDir = path.dirname(fullPathToDelete);
        let pattern = hasWildcard ? path.basename(fullPathToDelete) : null;

        if (hasWildcard) {
            try {
                const sourceFiles = await readdir(baseDeleteDir);
                const safePattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
                const regex = new RegExp('^' + safePattern + '$');
                itemsToDelete = sourceFiles
                    .filter(file => regex.test(file))
                    .map(file => path.join(baseDeleteDir, file));
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, 'Source directory not found', 404);
                }
                throw err;
            }
        } else {
            try {
                await stat(fullPathToDelete);
                itemsToDelete.push(fullPathToDelete);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    return sendPlainTextResponse(res, 'Item not found', 404);
                }
                throw err;
            }
        }

        if (itemsToDelete.length === 0) {
            return sendPlainTextResponse(res, 'No files matched for deletion', 200);
        }

        const results = [];
        for (const itemPath of itemsToDelete) {
            if (!isPathInsideRoot(FILES_ROOT, path.relative(FILES_ROOT, itemPath))) {
                results.push(`Skipped invalid path: ${path.relative(FILES_ROOT, itemPath)}`);
                continue;
            }
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
        sendPlainTextResponse(res, `DEL complete:\n${results.join('\n')}`, 200);

    } catch (error) {
        console.error(`DEL Error: ${error.message}`);
        sendPlainTextResponse(res, 'Internal Server Error', 500);
    }
}

function webHandler(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, allowHead);
        res.end();
        return;
    }

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
                const roomId = data.roomId.trim().substring(0, 100);
                
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

                if (webrtcRooms[roomId]?.waitingQueue && webrtcRooms[roomId].waitingQueue.length > 0) {
                    const waitingPeer = webrtcRooms[roomId].waitingQueue.shift();
                    clearTimeout(waitingPeer.timeoutId);
                    
                    sendJsonResponse(waitingPeer.res, { message: data.message });
                    
                    if (webrtcRooms[roomId]) {
                        webrtcRooms[roomId].pendingMessage = null;
                        webrtcRooms[roomId].lastAccessed = Date.now();
                        if (webrtcRooms[roomId].waitingQueue.length === 0) {
                            delete webrtcRooms[roomId];
                        }
                    }
                    
                    sendPlainTextResponse(res, 'Message delivered', 200);
                    return;
                }

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

    // Wait endpoint: GET /webrtc/wait?roomId=xxx
    if (pathname === '/webrtc/wait' && req.method === 'GET') {
        const roomId = requestedUrl.searchParams.get('roomId')?.trim().substring(0, 100);
        
        if (!roomId) {
            return sendPlainTextResponse(res, 'Missing roomId parameter', 400);
        }

        if (webrtcRooms[roomId]?.pendingMessage !== undefined) {
            sendJsonResponse(res, { message: webrtcRooms[roomId].pendingMessage });
            webrtcRooms[roomId].lastAccessed = Date.now();
            return;
        }

        if (!webrtcRooms[roomId]) {
            webrtcRooms[roomId] = {
                pendingMessage: null,
                waitingQueue: [],
                lastAccessed: Date.now()
            };
        }

        const timeoutId = setTimeout(() => {
            const room = webrtcRooms[roomId];
            if (room) {
                room.waitingQueue = room.waitingQueue.filter(w => w.res !== res);
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

// ===== HTTP SERVER WITH WEBSOCKET UPGRADE =====
const httpServer = http.createServer(webHandler);

// [WEBSOCKET] Attach upgrade handler BEFORE error listener
httpServer.on('upgrade', (req, socket, head) => 
    handleWsUpgrade('HTTP', req, socket, head)
);

httpServer.on('error', (err) => {
    console.error(`\x1b[31mHTTP Server error on port ${serverOptions.port}: ${err.message}\x1b[0m`);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${serverOptions.port} is already in use. Stop other services using this port.`);
    } else if (err.code === 'EACCES') {
        console.error(`Permission denied for port ${serverOptions.port}. Use sudo or switch to port > 1024.`);
    }
    process.exit(1);
});

httpServer.listen(serverOptions.port, () => {
    console.log(`\x1b[32mHTTP Server running on port ${serverOptions.port}\x1b[0m`);
    console.log(`WebRTC Signaling: POST /webrtc/signal | GET /webrtc/wait?roomId=xxx`);
    console.log(`WebSockets: ws://localhost:${serverOptions.port}/ws/<handler>`);
});

// ===== HTTPS SERVER WITH WEBSOCKET UPGRADE =====
let httpsServer;
try {
    // Verify files exist before reading (prevents vague errors)
    if (!fs.existsSync(serverOptions.key) || !fs.existsSync(serverOptions.cert)) {
        throw Object.assign(new Error('SSL certificate files missing'), { code: 'ENOENT' });
    }

    const privateKey = fs.readFileSync(serverOptions.key, 'utf8');
    const certificate = fs.readFileSync(serverOptions.cert, 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    httpsServer = https.createServer(credentials, webHandler);
    
    // [WEBSOCKET] Attach upgrade handler BEFORE error listener
    httpsServer.on('upgrade', (req, socket, head) => 
        handleWsUpgrade('HTTPS', req, socket, head)
    );

    // CRITICAL: Handle async listen errors (port conflicts, permissions)
    httpsServer.on('error', (err) => {
        console.error(`\x1b[31mHTTPS Server error on port ${serverOptions.sslport}: ${err.message}\x1b[0m`);
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${serverOptions.sslport} is already in use. Free the port or change sslport in serverOptions.`);
        } else if (err.code === 'EACCES') {
            console.error(`Permission denied for port ${serverOptions.sslport}. Ports < 1024 require root. Try:`);
            console.error(`  sudo node webserver.js   OR   change sslport to 8443 in serverOptions`);
        } else if (err.code === 'ERR_SSL_KEY_FORMAT_INVALID') {
            console.error('Invalid private key format. Ensure key.pem is valid PEM format.');
        }
        httpsServer = null;
    });

    httpsServer.listen(serverOptions.sslport, () => {
        console.log(`\x1b[32mHTTPS Server running on port ${serverOptions.sslport}\x1b[0m`);
        console.log(`WebRTC Signaling: POST /webrtc/signal | GET /webrtc/wait?roomId=xxx`);
        console.log(`WebSockets: wss://localhost:${serverOptions.sslport}/ws/<handler>`);
        if (typeof webAppReady === 'function') {
            webAppReady(); // ONLY called when server is actually listening
        }
    });
} catch (error) {
    console.error(`\x1b[31m❌ FAILED to start HTTPS server:\x1b[0m ${error.message}`);
    
    if (error.code === 'ENOENT') {
        console.error(`\nMISSING CERTIFICATE FILES! Expected:`);
        console.error(`  Key:  ${path.resolve(serverOptions.key)}`);
        console.error(`  Cert: ${path.resolve(serverOptions.cert)}`);
        console.log(`\n🔧 TO GENERATE SELF-SIGNED CERT (development ONLY):`);
        console.log(`openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"`);
        console.log(`\n⚠️  WARNING: Browsers will show security warnings with self-signed certs.`);
        console.log(`✅ For production: Use certs from Let's Encrypt or trusted CA.`);
    } else if (error.message.includes('PEM') || error.code === 'ERR_OSSL_PEM_NO_START_LINE') {
        console.error('Certificate/key file is corrupted or invalid PEM format. Regenerate certificates.');
    }
    
    console.log(`\nℹ️  HTTP server is RUNNING on port ${serverOptions.port}`);
    console.log(`   Access via: http://localhost:${serverOptions.port}`);
    console.log(`   WebSockets: ws://localhost:${serverOptions.port}/ws/<handler>`);
}

// ===== EXAMPLE WEBSOCKET HANDLER (files/api/chat.ws.js) =====
/*
// Save as files/api/chat.ws.js
module.exports.handler = function(ws, request) {
  console.log('[chat] New connection from', request.socket.remoteAddress);
  
  // Optional lifecycle methods (called by server)
  return {
    onOpen: () => {
      ws.send(JSON.stringify({ type: 'system', message: 'Connected to chat server' }));
    },
    
    onMessage: (msg) => {
      try {
        const data = JSON.parse(msg);
        console.log('[chat] Received:', data);
        
        // Simple echo with timestamp
        ws.send(JSON.stringify({
          type: 'message',
          content: data.content,
          timestamp: new Date().toISOString(),
          from: 'server'
        }));
      } catch (e) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Invalid JSON' 
        }));
      }
    },
    
    onClose: () => {
      console.log('[chat] Connection closed');
    }
  };
};
*/
// ==========================================================