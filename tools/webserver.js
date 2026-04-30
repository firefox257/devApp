// webserver.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const crypto = require('crypto');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const rename = promisify(fs.rename);
const unlink = promisify(fs.unlink);
const rm = promisify(fs.rm);
const copyFile = promisify(fs.copyFile);

// ==========================================================
// ===== MIME TYPE MAP =====
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
	'.m3u': 'text/plain', 
    '.svg': 'image/svg+xml',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.onnx': 'application/octet-stream',
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
};

// ==========================================================
// 🔧 DECODE CHANGE: Safe URI path decoder (segment-wise)
/**
 * Decodes URI-encoded path segments while preserving path structure.
 * Prevents %2F from becoming a literal slash that could break path logic.
 * @param {string} pathname - URI-encoded path (e.g., "/files/hello%20world.txt")
 * @returns {string} Decoded path with segments safely decoded
 */
function decodePathSegments(pathname) {
    if (!pathname) return pathname;
    return pathname.split('/').map(segment => {
        try {
            return decodeURIComponent(segment);
        } catch (e) {
            // If decoding fails (malformed %XX), keep original segment
            return segment;
        }
    }).join('/');
}

// ==========================================================
// ===== LAN ACCESS VALIDATION (RFC 1918 + Loopback + Link-Local) =====
/**
 * Validates if an IP address is from a private/local network range
 * Blocks all public/internet IPs for dev server security
 * @param {string} ip - Client IP address (IPv4 or IPv6)
 * @returns {boolean} True if IP is from LAN/private range
 */
function isLanIP(ip) {
    if (!ip) return false;
    
    // Handle IPv6 loopback and mapped IPv4
    if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return true;
    
    // Remove IPv6 prefix if present (::ffff:xxx.xxx.xxx.xxx)
    const cleanIP = ip.replace(/^::ffff:/i, '');
    
    // Check for optional ALLOW_IPS environment variable (comma-separated)
    const allowedIPs = (process.env.ALLOW_IPS || '').split(',').filter(Boolean);
    if (allowedIPs.includes(cleanIP) || allowedIPs.includes(ip)) return true;
    
    // IPv4 private ranges (RFC 1918 + loopback + link-local)
    const parts = cleanIP.split('.').map(Number);
    if (parts.length === 4 && parts.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
        const [a, b] = parts;
        // 10.0.0.0/8
        if (a === 10) return true;
        // 172.16.0.0/12
        if (a === 172 && b >= 16 && b <= 31) return true;
        // 192.168.0.0/16
        if (a === 192 && b === 168) return true;
        // 127.0.0.0/8 (loopback)
        if (a === 127) return true;
        // 169.254.0.0/16 (link-local)
        if (a === 169 && b === 254) return true;
        // 100.64.0.0/10 (CGNAT - Tailscale, etc.)
        if (a === 100 && b >= 64 && b <= 127) return true;
        return false;
    }
    
    // IPv6 private/unique local: fc00::/7
    if (cleanIP.includes(':')) {
        const lower = cleanIP.toLowerCase();
        // Unique Local Address (ULA)
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
        // Link-local
        if (lower.startsWith('fe80:')) return true;
        // IPv6 loopback variations
        if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
        return false;
    }
    
    // Unknown format → deny by default
    return false;
}

// ==========================================================
// ===== PATH VALIDATION HELPER =====
/**
 * Securely validates that a user-provided path stays within root directory
 * Prevents path traversal AND path confusion attacks
 * @param {string} root - Base directory (FILES_ROOT)
 * @param {string} userPath - User-supplied relative path
 * @returns {boolean} True if path is safe
 */
function isPathInsideRoot(root, userPath) {
    if (!userPath) return false;
    const resolvedRoot = path.resolve(root) + path.sep;
    const resolvedTarget = path.resolve(path.join(root, userPath)) + path.sep;
    return resolvedTarget.startsWith(resolvedRoot);
}

// ==========================================================
// ===== WEBSOCKET PROTOCOL HELPERS (RFC 6455 MINIMAL IMPLEMENTATION) =====
function computeAcceptKey(key) {
    const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto.createHash('sha1').update(key + magic).digest('base64');
}

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
// ===== CACHE STRUCTURES =====
const wsCache = new Map();
const apiCache = new Map();
const webrtcRooms = {}; // Initialize WebRTC rooms map

// ==========================================================
// ===== SERVER OPTIONS =====
const serverOptions = {
    port: 80,
    sslport: 443,
    key: './files/key.pem',
    cert: './files/cert.crt',
    additionalMethods: []
};

const allowHead = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, POST, GET, PUT, PATCH, DELETE',
    'Access-Control-Max-Age': 2592000,
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-LS-Path, X-Read-File, X-Read-File-Binary, X-Save-File, X-File-Path, X-File-Content, X-MKPATH, X-MV-Source, X-MV-Destination, X-DEL-Path, X-COPY-Source, X-COPY-Destination, X-RN-Source, X-RN-Destination, X-CMD, X-SRC, X-DST'
};

// ==========================================================
// ===== RESPONSE HELPERS =====
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

// ==========================================================
// ===== FILE REQUEST HANDLER =====
function handleFileRequest(req, res, filePath) {
    fs.stat(filePath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
				console.log("404 error")
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

// ==========================================================
// ===== API REQUEST HANDLER =====
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

// ==========================================================
// ===== MULTIPART FORM PARSER =====
const MAX_UPLOAD_SIZE = 500 * 1024 * 1024; // 500MB

function parseMultipartForm(req) {
    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        if (!boundaryMatch) {
            return reject(new Error('Missing boundary in Content-Type'));
        }
        const boundary = '--' + (boundaryMatch[1] || boundaryMatch[2]).trim();
        let bodyChunks = [];
        let totalSize = 0;
        req.on('data', (chunk) => {
            totalSize += chunk.length;
            if (totalSize > MAX_UPLOAD_SIZE) {
                req.destroy();
                reject(new Error('Payload too large (max 500MB)'));
                return;
            }
            bodyChunks.push(chunk);
        });
        req.on('end', () => {
            try {
                const buffer = Buffer.concat(bodyChunks);
                const bodyStr = buffer.toString('binary');
                const parts = bodyStr.split(boundary);
                const result = { fields: {}, files: [] };
                for (let i = 1; i < parts.length - 1; i++) {
                    const part = parts[i].trim();
                    if (!part) continue;
                    const headerEnd = part.indexOf('\r\n\r\n');
                    if (headerEnd === -1) continue;
                    const headersRaw = part.substring(0, headerEnd);
                    const content = part.substring(headerEnd + 4);
                    const dispMatch = headersRaw.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"/i);
                    if (!dispMatch) continue;
                    const fieldName = dispMatch[1];
                    const filenameMatch = headersRaw.match(/filename="([^"]+)"/i);
                    if (filenameMatch) {
                        const filename = filenameMatch[1];
                        const contentTypeMatch = headersRaw.match(/Content-Type:\s*([^\r\n]+)/i);
                        const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
                        let fileContent = content;
                        if (fileContent.endsWith('\r\n')) {
                            fileContent = fileContent.substring(0, fileContent.length - 2);
                        }
                        const isBinary = !contentType.startsWith('text/');
                        result.files.push({
                            field: fieldName,
                            name: filename,
                            type: contentType,
                            content: fileContent,
                            isBinary: isBinary
                        });
                    } else {
                        let fieldValue = content;
                        if (fieldValue.endsWith('\r\n')) {
                            fieldValue = fieldValue.substring(0, fieldValue.length - 2);
                        }
                        result.fields[fieldName] = fieldValue;
                    }
                }
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', (error) => {
            reject(error);
        });
    });
}

// ==========================================================
// ===== FILE UPLOAD HANDLER =====
async function handleFileUpload(req, res) {
    try {
        const parsed = await parseMultipartForm(req);
        if (!parsed.files || parsed.files.length === 0) {
            return sendPlainTextResponse(res, 'No file provided', 400);
        }
        if (!parsed.fields.path) {
            return sendPlainTextResponse(res, 'Missing path parameter', 400);
        }
        // 🔧 DECODE CHANGE: Decode the path from form field
        const filePathHeader = decodePathSegments(parsed.fields.path);
        if (!isPathInsideRoot(FILES_ROOT, filePathHeader)) {
            return sendPlainTextResponse(res, 'Access Denied', 403);
        }
        const file = parsed.files[0];
        const fullPath = path.join(FILES_ROOT, filePathHeader);
        const dir = path.dirname(fullPath);
        await mkdir(dir, { recursive: true });
        if (file.isBinary) {
            await writeFile(fullPath, Buffer.from(file.content, 'binary'));
        } else {
            await writeFile(fullPath, file.content, 'utf8');
        }
        sendPlainTextResponse(res, `File uploaded: ${filePathHeader}`, 200);
    } catch (error) {
        if (error.message.includes('Payload too large')) {
            sendPlainTextResponse(res, error.message, 413);
        } else if (error.message.includes('Missing boundary')) {
            sendPlainTextResponse(res, 'Invalid request format', 400);
        } else {
            console.error(`UPLOAD Error: ${error.message}`);
            sendPlainTextResponse(res, 'Upload failed: ' + error.message, 500);
        }
    }
}

// ==========================================================
// ===== WEBSOCKET UPGRADE HANDLER =====
function handleWsUpgrade(serverType, req, socket, head) {
    try {
        // ===== LAN ACCESS CHECK (SECURITY) =====
        const clientIP = req.socket?.remoteAddress || req.connection?.remoteAddress;
        if (!isLanIP(clientIP)) {
            console.warn(`[WS SECURITY] Blocked external WebSocket from ${clientIP} to ${req.url}`);
            socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            return;
        }
        
        // Validate path structure
        if (!req.url.startsWith('/ws/')) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            return;
        }
        // Extract handler name with strict sanitization
        const url = new URL(req.url, `http://${req.headers.host}`);
        // 🔧 DECODE CHANGE: Decode pathname segments for WebSocket handler name
        const rawPathname = url.pathname;
        const decodedPathname = decodePathSegments(rawPathname);
        const handlerName = path.basename(decodedPathname);
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
            // Create minimal WebSocket object
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
                        } catch (e) { }
                    }
                    socket.destroy();
                },
                readyState: 1,
                _socket: socket
            };
            // Frame parsing buffer
            let frameBuffer = Buffer.alloc(0);
            socket.on('data', (chunk) => {
                frameBuffer = Buffer.concat([frameBuffer, chunk]);
                while (frameBuffer.length >= 2) {
                    const message = parseWebSocketFrame(frameBuffer);
                    if (message === null) break;
                    const processedLen = frameBuffer.length;
                    frameBuffer = Buffer.alloc(0);
                    try {
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
            socket.on('close', () => {
                ws.readyState = 3;
                if (wsCache.has(handlerName)) {
                    wsCache.get(handlerName).lastAccessed = Date.now();
                }
                try {
                    const instance = handlerMod.handler(ws, req);
                    if (typeof instance?.onClose === 'function') instance.onClose();
                } catch (e) { }
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
// ===== CACHE CLEANUP INTERVAL =====
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
    // Cleanup inactive WebSocket handlers
    for (const [name, info] of wsCache.entries()) {
        if (now - info.lastAccessed > 60 * 60 * 1000) {
            console.log(`[WS] Unloaded inactive handler: ${name}`);
            try {
                const fp = path.join(__dirname, 'files', 'api', `${name}.ws.js`);
                delete require.cache[require.resolve(fp)];
            } catch (e) { }
            wsCache.delete(name);
        }
    }
    // Cleanup expired WebRTC rooms
    for (const roomId in webrtcRooms) {
        const room = webrtcRooms[roomId];
        if (Date.now() - room.lastAccessed > 120000) {
            if (room.waitingQueue) {
                room.waitingQueue.forEach(w => {
                    if (w.timeoutId) clearTimeout(w.timeoutId);
                    if (w.res && !w.res.headersSent) {
                        try { sendPlainTextResponse(w.res, 'Room expired', 410); } catch (e) { }
                    }
                });
            }
            delete webrtcRooms[roomId];
            console.log(`Cleaned expired WebRTC room: ${roomId}`);
        }
    }
}, 10 * 60 * 1000);

// ==========================================================
// ===== PATH CONSTANTS =====
const FILES_ROOT = path.join(__dirname, 'files');
const TRASH_DIR = path.join(FILES_ROOT, 'trash');

// ==========================================================
// ===== FILE SYSTEM HANDLERS =====
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
                sendPlainTextResponse(res, 'Payload too large (max 500MB)', 413);
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

async function handleMv(res, mvSourceHeader, mvDestinationHeader) {
    if (!isPathInsideRoot(FILES_ROOT, mvSourceHeader) ||
        !isPathInsideRoot(FILES_ROOT, mvDestinationHeader)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }
    const sourceFullPath = path.join(FILES_ROOT, mvSourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, mvDestinationHeader);
    
    try {
        let actualDestinationDir = destinationFullPath;
        
        try {
            const destinationStats = await stat(destinationFullPath);
            if (!destinationStats.isDirectory()) {
                return sendPlainTextResponse(res, 'Destination must be directory', 400);
            }
        } catch (err) {
            if (err.code === 'ENOENT') {
                const hasWildcard = mvDestinationHeader.includes('*');
                if (!hasWildcard && !mvDestinationHeader.endsWith('/') && !mvDestinationHeader.includes('*')) {
                    const destParent = path.dirname(destinationFullPath);
                    try {
                        const parentStats = await stat(destParent);
                        if (parentStats.isDirectory()) {
                            const hasSourceWildcard = mvSourceHeader.includes('*');
                            if (hasSourceWildcard) {
                                return sendPlainTextResponse(res, 'Cannot move multiple files to a file path', 400);
                            }
                            if (!isPathInsideRoot(FILES_ROOT, path.relative(FILES_ROOT, sourceFullPath))) {
                                return sendPlainTextResponse(res, 'Access Denied', 403);
                            }
                            const sourceStats = await stat(sourceFullPath);
                            // ✅ FIX: Allow directory → new directory name (destination doesn't exist yet)
                            if (sourceStats.isDirectory()) {
                                // Destination will be created as the moved directory name
                                actualDestinationDir = path.dirname(destinationFullPath);
                            } else {
                                // Source is a file, destination is a new file path
                                await rename(sourceFullPath, destinationFullPath);
                                return sendPlainTextResponse(res, `Moved: ${path.relative(FILES_ROOT, sourceFullPath)} to ${path.relative(FILES_ROOT, destinationFullPath)}`, 200);
                            }
                        }
                    } catch (parentErr) { }
                }
                // Create destination directory if it doesn't exist
                await mkdir(destinationFullPath, { recursive: true });
            } else {
                throw err;
            }
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
            const finalDestinationPath = path.join(actualDestinationDir, fileName);
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
                const hasWildcard = copyDestinationHeader.includes('*');
                if (!hasWildcard && !copyDestinationHeader.endsWith('/') && !copyDestinationHeader.includes('*')) {
                    const destParent = path.dirname(destinationFullPath);
                    try {
                        const parentStats = await stat(destParent);
                        if (parentStats.isDirectory()) {
                            const hasSourceWildcard = copySourceHeader.includes('*');
                            if (hasSourceWildcard) {
                                return sendPlainTextResponse(res, 'Cannot copy multiple files to a file path', 400);
                            }
                            if (!isPathInsideRoot(FILES_ROOT, path.relative(FILES_ROOT, sourceFullPath))) {
                                return sendPlainTextResponse(res, 'Access Denied', 403);
                            }
                            const sourceStats = await stat(sourceFullPath);
                            // ✅ FIX: Allow directory → new directory name (destination doesn't exist yet)
                            if (sourceStats.isDirectory()) {
                                // Destination will be created as the copied directory name
                                actualDestinationDir = path.dirname(destinationFullPath);
                            } else {
                                // Source is a file, destination is a new file path
                                await copyFile(sourceFullPath, destinationFullPath);
                                return sendPlainTextResponse(res, `Copied: ${path.relative(FILES_ROOT, sourceFullPath)} to ${path.relative(FILES_ROOT, destinationFullPath)}`, 200);
                            }
                        }
                    } catch (parentErr) { }
                }
                // Create destination directory if it doesn't exist
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
            const finalDestinationPath = path.join(actualDestinationDir, itemName);
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

// ==========================================================
// ===== MAIN HTTP REQUEST HANDLER =====
function webHandler(req, res) {
    // ===== LAN ACCESS CHECK (SECURITY) =====
    const clientIP = req.socket?.remoteAddress || req.connection?.remoteAddress;
    if (!isLanIP(clientIP)) {
        console.warn(`[SECURITY] Blocked external request from ${clientIP} to ${req.url}`);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden: Local network access only');
        return;
    }
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204, allowHead);
        res.end();
        return;
    }
    
    const requestedUrl = new URL(req.url, `http://${req.headers.host}`);
    
    // 🔧 DECODE CHANGE: Decode pathname segments safely
    const pathname = decodePathSegments(requestedUrl.pathname);
    
    console.log(pathname);
    
    // ===== FILE UPLOAD ENDPOINT =====
    if (pathname === '/upload' && req.method === 'POST') {
        handleFileUpload(req, res);
        return;
    }
    
    const xcmd = req.headers['x-cmd'];
    if (xcmd) {
        // 🔧 DECODE CHANGE: Decode header paths before use
        const xSrc = decodePathSegments(req.headers['x-src'] || '');
        const xDst = decodePathSegments(req.headers['x-dst'] || '');
        
        switch (xcmd) {
            case "ls":
                handleLs(res, xSrc);
                return;
            case "fread":
                handleReadFile(res, xSrc);
                return;
            case "freadb":
                handleReadFileBinary(req, res, xSrc);
                return;
            case "fwrite":
                if (req.method === 'POST' || req.method === 'PUT') {
                    handleSaveFile(req, res, xSrc);
                } else {
                    sendPlainTextResponse(res, 'SAVEFILE requires POST or PUT method.', 405);
                }
                return;
            case "mkdir":
                if (req.method === 'POST' || req.method === 'PUT') {
                    handleMkpath(res, xSrc);
                } else {
                    sendPlainTextResponse(res, 'MKPATH requires POST or PUT method.', 405);
                }
                return;
            case "mv":
                if (req.method === 'POST' || req.method === 'PUT') {
                    handleMv(res, xSrc, xDst);
                } else {
                    sendPlainTextResponse(res, 'MV requires POST or PUT method.', 405);
                }
                return;
            case "cp":
                if (req.method === 'POST' || req.method === 'PUT') {
                    handleCopy(res, xSrc, xDst);
                } else {
                    sendPlainTextResponse(res, 'COPY requires POST or PUT method.', 405);
                }
                return;
            case "rn":
                if (req.method === 'POST' || req.method === 'PUT') {
                    handleRn(res, xSrc, xDst);
                } else {
                    sendPlainTextResponse(res, 'RN requires POST or PUT method.', 405);
                }
                return;
            case "rm":
                if (req.method === 'DELETE') {
                    handleDel(res, xSrc);
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

// ==========================================================
// ===== HTTP SERVER =====
const httpServer = http.createServer(webHandler);

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
    console.log(`\x1b[36mLAN Access Only - External connections blocked\x1b[0m`);
    console.log(`WebRTC Signaling: POST /webrtc/signal | GET /webrtc/wait?roomId=xxx`);
    console.log(`WebSockets: ws://localhost:${serverOptions.port}/ws/<handler>`);
    console.log(`File Upload: POST /upload (multipart/form-data)`);
    console.log(`\x1b[33mTo allow specific external IPs: ALLOW_IPS=1.2.3.4,5.6.7.8 node webserver.js\x1b[0m`);
});

// ==========================================================
// ===== HTTPS SERVER =====
let httpsServer;
try {
    if (!fs.existsSync(serverOptions.key) || !fs.existsSync(serverOptions.cert)) {
        throw Object.assign(new Error('SSL certificate files missing'), { code: 'ENOENT' });
    }
    const privateKey = fs.readFileSync(serverOptions.key, 'utf8');
    const certificate = fs.readFileSync(serverOptions.cert, 'utf8');
    const credentials = { key: privateKey, cert: certificate };
    httpsServer = https.createServer(credentials, webHandler);
    
    httpsServer.on('upgrade', (req, socket, head) =>
        handleWsUpgrade('HTTPS', req, socket, head)
    );
    
    httpsServer.on('error', (err) => {
        console.error(`\x1b[31mHTTPS Server error on port ${serverOptions.sslport}: ${err.message}\x1b[0m`);
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${serverOptions.sslport} is already in use. Free the port or change sslport in serverOptions.`);
        } else if (err.code === 'EACCES') {
            console.error(`Permission denied for port ${serverOptions.sslport}. Ports < 1024 require root.`);
        } else if (err.code === 'ERR_SSL_KEY_FORMAT_INVALID') {
            console.error('Invalid private key format. Ensure key.pem is valid PEM format.');
        }
        httpsServer = null;
    });
    
    httpsServer.listen(serverOptions.sslport, () => {
        console.log(`\x1b[32mHTTPS Server running on port ${serverOptions.sslport}\x1b[0m`);
        console.log(`\x1b[36mLAN Access Only - External connections blocked\x1b[0m`);
        console.log(`WebRTC Signaling: POST /webrtc/signal | GET /webrtc/wait?roomId=xxx`);
        console.log(`WebSockets: wss://localhost:${serverOptions.sslport}/ws/<handler>`);
        console.log(`File Upload: POST /upload (multipart/form-data)`);
        if (typeof webAppReady === 'function') {
            webAppReady();
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
    }
    console.log(`\nℹ️ HTTP server is RUNNING on port ${serverOptions.port}`);
    console.log(`   Access via: http://localhost:${serverOptions.port}`);
}

// ==========================================================
// ===== EXAMPLE WEBSOCKET HANDLER TEMPLATE =====
/*
// Save as files/api/chat.ws.js
module.exports.handler = function(ws, request) {
    console.log('[chat] New connection from', request.socket.remoteAddress);
    return {
        onOpen: () => {
            ws.send(JSON.stringify({ type: 'system', message: 'Connected to chat server' }));
        },
        onMessage: (msg) => {
            try {
                const data = JSON.parse(msg);
                console.log('[chat] Received:', data);
                ws.send(JSON.stringify({
                    type: 'message',
                    content: data.content,
                    timestamp: new Date().toISOString(),
                    from: 'server'
                }));
            } catch (e) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
            }
        },
        onClose: () => {
            console.log('[chat] Connection closed');
        }
    };
};
*/
// ==========================================================