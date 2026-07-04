//webserver.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const crypto = require('crypto');

// ==========================================================
// 🚨 ENHANCED ERROR HANDLING
// Global catch-alls for uncaught syntax/runtime errors
process.on('uncaughtException', (err, origin) => {
  console.error(`\n\x1b[31m💥 UNCAUGHT EXCEPTION\x1b[0m`);
  console.error(`Origin: ${origin}`);
  console.error(`Message: ${err.message}`);
  if (err.stack) console.error(`Stack:\n${err.stack}`);
  console.error('\x1b[0m---\n');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`\n\x1b[31m⚠️  UNHANDLED REJECTION\x1b[0m`);
  console.error(`Reason: ${reason}`);
  if (reason?.stack) console.error(`Stack:\n${reason.stack}`);
  console.error('\x1b[0m---\n');
});

// Helper: Dump full stacktrace + file context on module load/execution failure
function logModuleError(context, filePath, error) {
  console.error(`\n\x1b[31m[${context}] ❌ LOAD/EXEC ERROR: ${filePath}\x1b[0m`);
  console.error(`\x1b[2mError:\x1b[0m ${error.message}`);
  
  if (error.stack) {
    console.error(`\x1b[2mStack:\x1b[0m\n${error.stack.split('\n').slice(1).map(l => '  ' + l).join('\n')}`);
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    // Extract line number from Node.js stack trace
    const lineMatch = error.stack?.match(/:(\d+):\d+/);
    const errorLine = lineMatch ? parseInt(lineMatch[1]) : null;
    const start = Math.max(0, (errorLine || 1) - 5);
    const end = Math.min(lines.length, (errorLine || 1) + 5);
    
    console.error(`\x1b[2mFile snippet (lines ${start + 1}-${end}):\x1b[0m`);
    for (let i = start; i < end; i++) {
      const marker = (i + 1) === errorLine ? '\x1b[33m>>>\x1b[0m' : '   ';
      console.error(`  ${marker} ${String(i + 1).padStart(4)} | ${lines[i]}`);
    }
  } catch (readErr) {
    console.error(`\x1b[2m(Could not read file: ${readErr.message})\x1b[0m`);
  }
  console.error('\x1b[0m---\n');
}
// ==========================================================

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
	'.wasm': 'application/wasm',
	".onnx": ' application/octet-stream'
};

// ==========================================================
// 🔧 DECODE CHANGE: Safe URI path decoder (segment-wise)
function decodePathSegments(pathname) {
    if (!pathname) return pathname;
    return pathname.split('/').map(segment => {
        try {
            return decodeURIComponent(segment);
        } catch (e) {
            return segment;
        }
    }).join('/');
}

// ==========================================================
// ===== LAN ACCESS VALIDATION =====
function isLanIP(ip) {
    if (!ip) return false;
    if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return true;
    const cleanIP = ip.replace(/^::ffff:/i, '');
    const allowedIPs = (process.env.ALLOW_IPS || '').split(',').filter(Boolean);
    if (allowedIPs.includes(cleanIP) || allowedIPs.includes(ip)) return true;
    const parts = cleanIP.split('.').map(Number);
    if (parts.length === 4 && parts.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
        const [a, b] = parts;
        if (a === 10) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        return false;
    }
    if (cleanIP.includes(':')) {
        const lower = cleanIP.toLowerCase();
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
        if (lower.startsWith('fe80:')) return true;
        if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
        return false;
    }
    return false;
}

// ==========================================================
// ===== PATH VALIDATION HELPER =====
function isPathInsideRoot(root, userPath) {
    if (!userPath) return false;
    const resolvedRoot = path.resolve(root) + path.sep;
    const resolvedTarget = path.resolve(path.join(root, userPath)) + path.sep;
    return resolvedTarget.startsWith(resolvedRoot);
}

// ==========================================================
// ===== WEBSOCKET PROTOCOL HELPERS =====
function computeAcceptKey(key) {
    const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto.createHash('sha1').update(key + magic).digest('base64');
}

function parseWebSocketFrame(buffer) {
    if (buffer.length < 2) return null;
    const opcode = buffer[0] & 0x0F;
    if (opcode !== 1) return null; // Only handling text frames (opcode 1) for simplicity
    const isMasked = (buffer[1] & 0x80) === 0x80;
    if (!isMasked) return null;
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
    buffer[0] = 0x81; // Text frame, FIN bit set
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
const webrtcRooms = {};

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
// ===== API REQUEST HANDLER (supports nested paths) =====
async function handleApiRequest(req, res, relativePath) {
    const apiFilePath = path.join(FILES_ROOT, relativePath);
    
    if (!isPathInsideRoot(FILES_ROOT, relativePath)) {
        return sendPlainTextResponse(res, 'Access Denied', 403);
    }
    
    if (apiCache.has(relativePath)) {
        const cachedApi = apiCache.get(relativePath);
        cachedApi.lastAccessed = Date.now();
        try {
            await cachedApi.module.handler(req, res);
        } catch (error) {
            logModuleError('API', relativePath, error);
            if (!res.headersSent) sendPlainTextResponse(res, '500 Internal Server Error', 500);
        }
    } else {
        fs.access(apiFilePath, fs.constants.F_OK, async (err) => {
            if (err) {
                sendPlainTextResponse(res, `404 API Not Found: ${relativePath}`, 404);
                return;
            }
            try {
                delete require.cache[require.resolve(apiFilePath)];
                const apiModule = require(apiFilePath);
                if (typeof apiModule.handler === 'function') {
                    apiCache.set(relativePath, { module: apiModule, lastAccessed: Date.now() });
                    await apiModule.handler(req, res);
                } else {
                    throw new Error('Handler must export "handler" function');
                }
            } catch (error) {
                logModuleError('API', relativePath, error);
                if (!res.headersSent) sendPlainTextResponse(res, '500 Internal Server Error', 500);
            }
        });
    }
}

// ==========================================================
// ===== MULTIPART FORM PARSER =====
const MAX_UPLOAD_SIZE = 500 * 1024 * 1024;

function parseMultipartForm(req) {
    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        if (!boundaryMatch) return reject(new Error('Missing boundary in Content-Type'));
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
                        if (fileContent.endsWith('\r\n')) fileContent = fileContent.substring(0, fileContent.length - 2);
                        const isBinary = !contentType.startsWith('text/');
                        result.files.push({ field: fieldName, name: filename, type: contentType, content: fileContent, isBinary });
                    } else {
                        let fieldValue = content;
                        if (fieldValue.endsWith('\r\n')) fieldValue = fieldValue.substring(0, fieldValue.length - 2);
                        result.fields[fieldName] = fieldValue;
                    }
                }
                resolve(result);
            } catch (error) { reject(error); }
        });
        req.on('error', reject);
    });
}

// ==========================================================
// ===== FILE UPLOAD HANDLER =====
async function handleFileUpload(req, res) {
    try {
        const parsed = await parseMultipartForm(req);
        if (!parsed.files || parsed.files.length === 0) return sendPlainTextResponse(res, 'No file provided', 400);
        if (!parsed.fields.path) return sendPlainTextResponse(res, 'Missing path parameter', 400);
        const filePathHeader = decodePathSegments(parsed.fields.path);
        if (!isPathInsideRoot(FILES_ROOT, filePathHeader)) return sendPlainTextResponse(res, 'Access Denied', 403);
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
            logModuleError('UPLOAD', 'multipart-parser', error);
            sendPlainTextResponse(res, 'Upload failed: ' + error.message, 500);
        }
    }
}

// ==========================================================
// ===== WEBSOCKET UPGRADE HANDLER (supports nested paths) =====
function handleWsUpgrade(serverType, req, socket, head) {
    try {
        const clientIP = req.socket?.remoteAddress || req.connection?.remoteAddress;
        if (!isLanIP(clientIP)) {
            console.warn(`[WS SECURITY] Blocked external WebSocket from ${clientIP} to ${req.url}`);
            socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            return;
        }
        
        const url = new URL(req.url, `http://${req.headers.host}`);
        const rawPathname = url.pathname;
        const decodedPathname = decodePathSegments(rawPathname);
        
        if (!decodedPathname.endsWith('.ws.js')) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            return;
        }
        
        if (!isPathInsideRoot(FILES_ROOT, decodedPathname)) {
            console.warn(`[WS] Blocked path traversal: ${decodedPathname}`);
            socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            return;
        }
        
        const wsFilePath = path.join(FILES_ROOT, decodedPathname);
        const cacheKey = decodedPathname;
        const handlerBasename = path.basename(decodedPathname);
        
        if (!handlerBasename || handlerBasename.includes('/') || handlerBasename.includes('\\') || handlerBasename.length > 100) {
            console.warn(`[WS] Blocked invalid handler name: ${handlerBasename}`);
            socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            return;
        }
        
        fs.access(wsFilePath, fs.constants.F_OK, (err) => {
            if (err) {
                socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
                return;
            }
            
            let handlerMod;
            if (wsCache.has(cacheKey)) {
                const cached = wsCache.get(cacheKey);
                cached.lastAccessed = Date.now();
                handlerMod = cached.module;
            } else {
                try {
                    delete require.cache[require.resolve(wsFilePath)];
                    handlerMod = require(wsFilePath);
                    if (typeof handlerMod.handler !== 'function') {
                        throw new Error('Handler must export "handler" function');
                    }
                    wsCache.set(cacheKey, { module: handlerMod, lastAccessed: Date.now() });
                } catch (e) {
                    logModuleError('WS', cacheKey, e);
                    socket.end('HTTP/1.1 500 Internal Error\r\n\r\n');
                    return;
                }
            }
            
            if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !req.headers['sec-websocket-key']) {
                socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
                return;
            }
            
            const acceptKey = computeAcceptKey(req.headers['sec-websocket-key']);
            socket.write(
                `HTTP/1.1 101 Switching Protocols\r\n` +
                `Upgrade: websocket\r\n` +
                `Connection: Upgrade\r\n` +
                `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
            );
            
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
                            socket.write(Buffer.concat([Buffer.from([0x88, payload.length]), payload]));
                        } catch (e) { }
                    }
                    socket.destroy();
                },
                readyState: 1,
                _socket: socket
            };
            
            // [FIX] Execute handler ONCE immediately after successful handshake
            let wsInstance;
            try {
                wsInstance = handlerMod.handler(ws, req);
                if (typeof wsInstance?.onOpen === 'function') wsInstance.onOpen();
            } catch (e) {
                logModuleError('WS-OPEN', cacheKey, e);
                ws.close(1011, 'Init failed');
                return; // Stop execution to prevent attaching listeners to a failed connection
            }
            
            let frameBuffer = Buffer.alloc(0);
            socket.on('data', (chunk) => {
                frameBuffer = Buffer.concat([frameBuffer, chunk]);
                while (frameBuffer.length >= 2) {
                    const message = parseWebSocketFrame(frameBuffer);
                    if (message === null) break;
                    
                    // Note: Clearing the buffer here is a pre-existing quirk in your parser. 
                    // If multiple frames arrive in a single TCP chunk, this drops the subsequent frames.
                    frameBuffer = Buffer.alloc(0); 
                    
                    try {
                        // [FIX] Use the stored instance instead of re-calling handler
                        if (typeof wsInstance?.onMessage === 'function') wsInstance.onMessage(message);
                    } catch (e) {
                        logModuleError('WS-MSG', cacheKey, e);
                        ws.close(1011, 'Handler error');
                    }
                }
            });
            
            socket.on('close', () => {
                ws.readyState = 3;
                if (wsCache.has(cacheKey)) wsCache.get(cacheKey).lastAccessed = Date.now();
                try {
                    // [FIX] Use the stored instance instead of re-calling handler
                    if (typeof wsInstance?.onClose === 'function') wsInstance.onClose();
                } catch (e) { }
            });
            
            socket.on('error', (err) => {
                console.error(`[WS] ${serverType} Socket error ${cacheKey}:`, err.message);
                ws.close(1006, 'Socket error');
            });
            
            // [FIX] Removed the duplicate handler call that was previously located here
        });
    } catch (e) {
        logModuleError('WS-UPGRADE', req.url || 'unknown', e);
        if (!socket.destroyed) socket.end('HTTP/1.1 500 Internal Error\r\n\r\n');
    }
}

// ==========================================================
// ===== CACHE CLEANUP INTERVAL =====
setInterval(() => {
    const now = Date.now();
    for (const [relativePath, apiInfo] of apiCache.entries()) {
        if (now - apiInfo.lastAccessed > 60 * 60 * 1000) {
            const apiFilePath = path.join(FILES_ROOT, relativePath);
            try { delete require.cache[require.resolve(apiFilePath)]; } catch (e) { }
            apiCache.delete(relativePath);
        }
    }
    for (const [cacheKey, info] of wsCache.entries()) {
        if (now - info.lastAccessed > 60 * 60 * 1000) {
            try {
                const fp = path.join(FILES_ROOT, cacheKey);
                delete require.cache[require.resolve(fp)];
            } catch (e) { }
            wsCache.delete(cacheKey);
        }
    }
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
    if (!isPathInsideRoot(FILES_ROOT, lsPath)) return sendPlainTextResponse(res, 'Access Denied', 403);
    const hasWildcard = lsPath.includes('*');
    let targetDirectory, filesToProcess = [];
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
                const fileInfo = { name: path.basename(targetDirectory), type: 'file', size: stats.size, modifiedTime: stats.mtime.toISOString(), modifiedTimeMs: stats.mtime.getTime() };
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
                fileInfoList.push({ name: file, type: fileStats.isDirectory() ? 'directory' : 'file', size: fileStats.size, modifiedTime: fileStats.mtime.toISOString(), modifiedTimeMs: fileStats.mtime.getTime() });
            } catch (err) { console.warn(`Could not get stats for file: ${err.message}`); }
        }
        sendJsonResponse(res, fileInfoList);
    } catch (error) {
        if (error.code === 'ENOENT') sendPlainTextResponse(res, 'Path not found', 404);
        else { console.error(`LS Error: ${error.message}`); sendPlainTextResponse(res, 'Internal Server Error', 500); }
    }
}

async function handleReadFile(res, filePathHeader) {
    if (!isPathInsideRoot(FILES_ROOT, filePathHeader)) return sendPlainTextResponse(res, 'Access Denied', 403);
    const fullPath = path.join(FILES_ROOT, filePathHeader);
    try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) return sendPlainTextResponse(res, 'Cannot read a directory', 400);
        const content = await readFile(fullPath, 'utf8');
        sendPlainTextResponse(res, content);
    } catch (error) {
        if (error.code === 'ENOENT') sendPlainTextResponse(res, 'File not found', 404);
        else { console.error(`READFILE Error: ${error.message}`); sendPlainTextResponse(res, 'Internal Server Error', 500); }
    }
}

async function handleReadFileBinary(req, res, filePathHeader) {
    //console.log("file:");
	//console.log(JSON.stringify(filePathHeader));
	if (!isPathInsideRoot(FILES_ROOT, filePathHeader)) return sendPlainTextResponse(res, 'Access Denied', 403);
    const fullPath = path.join(FILES_ROOT, filePathHeader);
    try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) return sendPlainTextResponse(res, 'Cannot read a directory', 400);
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = _mimetype[ext] || 'application/octet-stream';
        streamFile(req, res, fullPath, contentType);
    } catch (error) {
        if (error.code === 'ENOENT') sendPlainTextResponse(res, 'File not found', 404);
        else { console.error(`READFILEB Error: ${error.message}`); sendPlainTextResponse(res, 'Internal Server Error', 500); }
    }
}

async function handleSaveFile(req, res, filePathHeader) {
    if (!isPathInsideRoot(FILES_ROOT, filePathHeader)) return sendPlainTextResponse(res, 'Access Denied', 403);
    const fullPath = path.join(FILES_ROOT, filePathHeader);
    let body = '', sizeExceeded = false;
    req.on('data', chunk => {
        if (sizeExceeded) return;
        body += chunk.toString();
        if (body.length > MAX_UPLOAD_SIZE) {
            sizeExceeded = true;
            req.destroy();
            if (!res.headersSent) sendPlainTextResponse(res, 'Payload too large (max 500MB)', 413);
        }
    });
    req.on('end', async () => {
        if (sizeExceeded) return;
        try {
            const dir = path.dirname(fullPath);
            await mkdir(dir, { recursive: true });
            await writeFile(fullPath, body, 'utf8');
            sendPlainTextResponse(res, `File saved: ${filePathHeader}`, 200);
        } catch (error) { console.error(`SAVEFILE Error: ${error.message}`); sendPlainTextResponse(res, 'Internal Server Error', 500); }
    });
    req.on('error', (error) => { if (!res.headersSent) sendPlainTextResponse(res, 'Request Error', 500); });
}

async function handleMkpath(res, mkPathHeader) {
    if (!isPathInsideRoot(FILES_ROOT, mkPathHeader)) return sendPlainTextResponse(res, 'Access Denied', 403);
    const fullPath = path.join(FILES_ROOT, mkPathHeader);
    try {
        await mkdir(fullPath, { recursive: true });
        sendPlainTextResponse(res, `Path created: ${mkPathHeader}`, 200);
    } catch (error) {
        if (error.code === 'EEXIST') sendPlainTextResponse(res, `Path exists: ${mkPathHeader}`, 200);
        else { console.error(`MKPATH Error: ${error.message}`); sendPlainTextResponse(res, 'Internal Server Error', 500); }
    }
}

async function handleMv(res, mvSourceHeader, mvDestinationHeader) {
    if (!isPathInsideRoot(FILES_ROOT, mvSourceHeader) || !isPathInsideRoot(FILES_ROOT, mvDestinationHeader)) return sendPlainTextResponse(res, 'Access Denied', 403);
    const sourceFullPath = path.join(FILES_ROOT, mvSourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, mvDestinationHeader);
    try {
        let actualDestinationDir = destinationFullPath;
        try {
            const destinationStats = await stat(destinationFullPath);
            if (!destinationStats.isDirectory()) return sendPlainTextResponse(res, 'Destination must be directory', 400);
        } catch (err) {
            if (err.code === 'ENOENT') {
                const hasWildcard = mvDestinationHeader.includes('*');
                if (!hasWildcard && !mvDestinationHeader.endsWith('/') && !mvDestinationHeader.includes('*')) {
                    const destParent = path.dirname(destinationFullPath);
                    try {
                        const parentStats = await stat(destParent);
                        if (parentStats.isDirectory()) {
                            const hasSourceWildcard = mvSourceHeader.includes('*');
                            if (hasSourceWildcard) return sendPlainTextResponse(res, 'Cannot move multiple files to a file path', 400);
                            if (!isPathInsideRoot(FILES_ROOT, path.relative(FILES_ROOT, sourceFullPath))) return sendPlainTextResponse(res, 'Access Denied', 403);
                            const sourceStats = await stat(sourceFullPath);
                            if (sourceStats.isDirectory()) {
                                actualDestinationDir = path.dirname(destinationFullPath);
                            } else {
                                await rename(sourceFullPath, destinationFullPath);
                                return sendPlainTextResponse(res, `Moved: ${path.relative(FILES_ROOT, sourceFullPath)} to ${path.relative(FILES_ROOT, destinationFullPath)}`, 200);
                            }
                        }
                    } catch (parentErr) { }
                }
                await mkdir(destinationFullPath, { recursive: true });
            } else throw err;
        }
        const hasWildcard = mvSourceHeader.includes('*');
        let filesToMove = [], baseSourceDir = path.dirname(sourceFullPath), pattern = hasWildcard ? path.basename(sourceFullPath) : null;
        if (hasWildcard) {
            try {
                const sourceFiles = await readdir(baseSourceDir);
                const safePattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
                const regex = new RegExp('^' + safePattern + '$');
                filesToMove = sourceFiles.filter(file => regex.test(file)).map(file => path.join(baseSourceDir, file));
            } catch (err) { if (err.code === 'ENOENT') return sendPlainTextResponse(res, 'Source directory not found', 404); throw err; }
        } else {
            try { await stat(sourceFullPath); filesToMove.push(sourceFullPath); }
            catch (err) { if (err.code === 'ENOENT') return sendPlainTextResponse(res, 'Source not found', 404); throw err; }
        }
        if (filesToMove.length === 0) return sendPlainTextResponse(res, 'No files matched source', 200);
        const results = [];
        for (const fileToMove of filesToMove) {
            if (!isPathInsideRoot(FILES_ROOT, path.relative(FILES_ROOT, fileToMove))) { results.push(`Skipped invalid path: ${path.relative(FILES_ROOT, fileToMove)}`); continue; }
            const fileName = path.basename(fileToMove);
            const finalDestinationPath = path.join(actualDestinationDir, fileName);
            try {
                await rename(fileToMove, finalDestinationPath);
                results.push(`Moved: ${path.relative(FILES_ROOT, fileToMove)} to ${path.relative(FILES_ROOT, finalDestinationPath)}`);
            } catch (moveError) { console.error(`Error moving ${fileToMove}: ${moveError.message}`); results.push(`Failed to move ${path.relative(FILES_ROOT, fileToMove)}: ${moveError.message}`); }
        }
        sendPlainTextResponse(res, `MV complete:\n${results.join('\n')}`, 200);
    } catch (error) { console.error(`MV Error: ${error.message}`); sendPlainTextResponse(res, 'Internal Server Error', 500); }
}

async function handleRn(res, rnSourceHeader, rnDestinationHeader) {
    if (!isPathInsideRoot(FILES_ROOT, rnSourceHeader) || !isPathInsideRoot(FILES_ROOT, rnDestinationHeader)) return sendPlainTextResponse(res, 'Access Denied', 403);
    const sourceFullPath = path.join(FILES_ROOT, rnSourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, rnDestinationHeader);
    if (path.dirname(sourceFullPath) !== path.dirname(destinationFullPath)) return sendPlainTextResponse(res, 'Destination must be in same directory', 400);
    try {
        await rename(sourceFullPath, destinationFullPath);
        sendPlainTextResponse(res, `Renamed: ${rnSourceHeader} to ${rnDestinationHeader}`, 200);
    } catch (error) {
        if (error.code === 'ENOENT') sendPlainTextResponse(res, 'Source not found', 404);
        else { console.error(`RN Error: ${error.message}`); sendPlainTextResponse(res, 'Internal Server Error', 500); }
    }
}

async function copyDirectoryRecursive(src, dest) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) await copyDirectoryRecursive(srcPath, destPath);
        else await copyFile(srcPath, destPath);
    }
}

async function handleCopy(res, copySourceHeader, copyDestinationHeader) {
    if (!isPathInsideRoot(FILES_ROOT, copySourceHeader) || !isPathInsideRoot(FILES_ROOT, copyDestinationHeader)) return sendPlainTextResponse(res, 'Access Denied', 403);
    const sourceFullPath = path.join(FILES_ROOT, copySourceHeader);
    const destinationFullPath = path.join(FILES_ROOT, copyDestinationHeader);
    try {
        let actualDestinationDir = destinationFullPath;
        try {
            const destStats = await stat(destinationFullPath);
            if (!destStats.isDirectory()) return sendPlainTextResponse(res, 'Destination must be directory', 400);
        } catch (err) {
            if (err.code === 'ENOENT') {
                const hasWildcard = copyDestinationHeader.includes('*');
                if (!hasWildcard && !copyDestinationHeader.endsWith('/') && !copyDestinationHeader.includes('*')) {
                    const destParent = path.dirname(destinationFullPath);
                    try {
                        const parentStats = await stat(destParent);
                        if (parentStats.isDirectory()) {
                            const hasSourceWildcard = copySourceHeader.includes('*');
                            if (hasSourceWildcard) return sendPlainTextResponse(res, 'Cannot copy multiple files to a file path', 400);
                            if (!isPathInsideRoot(FILES_ROOT, path.relative(FILES_ROOT, sourceFullPath))) return sendPlainTextResponse(res, 'Access Denied', 403);
                            const sourceStats = await stat(sourceFullPath);
                            if (sourceStats.isDirectory()) { actualDestinationDir = path.dirname(destinationFullPath); }
                            else { await copyFile(sourceFullPath, destinationFullPath); return sendPlainTextResponse(res, `Copied: ${path.relative(FILES_ROOT, sourceFullPath)} to ${path.relative(FILES_ROOT, destinationFullPath)}`, 200); }
                        }
                    } catch (parentErr) { }
                }
                await mkdir(destinationFullPath, { recursive: true });
            } else throw err;
        }
        const hasWildcard = copySourceHeader.includes('*');
        let itemsToCopy = [], baseSourceDir = path.dirname(sourceFullPath), pattern = hasWildcard ? path.basename(sourceFullPath) : null;
        if (hasWildcard) {
            try {
                const sourceEntries = await readdir(baseSourceDir);
                const safePattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
                const regex = new RegExp('^' + safePattern + '$');
                itemsToCopy = sourceEntries.filter(entry => regex.test(entry)).map(entry => path.join(baseSourceDir, entry));
            } catch (err) { if (err.code === 'ENOENT') return sendPlainTextResponse(res, 'Source directory not found', 404); throw err; }
        } else {
            try { await stat(sourceFullPath); itemsToCopy.push(sourceFullPath); }
            catch (err) { if (err.code === 'ENOENT') return sendPlainTextResponse(res, 'Source not found', 404); throw err; }
        }
        if (itemsToCopy.length === 0) return sendPlainTextResponse(res, 'No files matched source', 200);
        const results = [];
        for (const itemToCopy of itemsToCopy) {
            if (!isPathInsideRoot(FILES_ROOT, path.relative(FILES_ROOT, itemToCopy))) { results.push(`Skipped invalid path: ${path.relative(FILES_ROOT, itemToCopy)}`); continue; }
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
            } catch (copyError) { console.error(`Error copying ${itemToCopy}: ${copyError.message}`); results.push(`Failed to copy ${path.relative(FILES_ROOT, itemToCopy)}: ${copyError.message}`); }
        }
        sendPlainTextResponse(res, `COPY complete:\n${results.join('\n')}`, 200);
    } catch (error) { console.error(`COPY Error: ${error.message}`); sendPlainTextResponse(res, 'Internal Server Error', 500); }
}

async function handleDel(res, delPathHeader) {
    if (!isPathInsideRoot(FILES_ROOT, delPathHeader)) return sendPlainTextResponse(res, 'Access Denied', 403);
    const fullPathToDelete = path.join(FILES_ROOT, delPathHeader);
    try {
        const hasWildcard = delPathHeader.includes('*');
        let itemsToDelete = [], baseDeleteDir = path.dirname(fullPathToDelete), pattern = hasWildcard ? path.basename(fullPathToDelete) : null;
        if (hasWildcard) {
            try {
                const sourceFiles = await readdir(baseDeleteDir);
                const safePattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
                const regex = new RegExp('^' + safePattern + '$');
                itemsToDelete = sourceFiles.filter(file => regex.test(file)).map(file => path.join(baseDeleteDir, file));
            } catch (err) { if (err.code === 'ENOENT') return sendPlainTextResponse(res, 'Source directory not found', 404); throw err; }
        } else {
            try { await stat(fullPathToDelete); itemsToDelete.push(fullPathToDelete); }
            catch (err) { if (err.code === 'ENOENT') return sendPlainTextResponse(res, 'Item not found', 404); throw err; }
        }
        if (itemsToDelete.length === 0) return sendPlainTextResponse(res, 'No files matched for deletion', 200);
        const results = [];
        for (const itemPath of itemsToDelete) {
            if (!isPathInsideRoot(FILES_ROOT, path.relative(FILES_ROOT, itemPath))) { results.push(`Skipped invalid path: ${path.relative(FILES_ROOT, itemPath)}`); continue; }
            const relativeItemPath = path.relative(FILES_ROOT, itemPath);
            try {
                const itemStats = await stat(itemPath);
                const isDirectory = itemStats.isDirectory();
                if (itemPath.startsWith(TRASH_DIR + path.sep) || itemPath === TRASH_DIR) {
                    if (isDirectory) { await rm(itemPath, { recursive: true, force: true }); results.push(`Permanently deleted directory from trash: ${relativeItemPath}`); }
                    else { await unlink(itemPath); results.push(`Permanently deleted file from trash: ${relativeItemPath}`); }
                } else {
                    await mkdir(TRASH_DIR, { recursive: true });
                    const trashDestination = path.join(TRASH_DIR, path.basename(itemPath));
                    await rename(itemPath, trashDestination);
                    results.push(`Moved to trash: ${relativeItemPath}`);
                }
            } catch (deleteError) { console.error(`Error deleting/moving ${itemPath}: ${deleteError.message}`); results.push(`Failed to delete/move ${relativeItemPath}: ${deleteError.message}`); }
        }
        sendPlainTextResponse(res, `DEL complete:\n${results.join('\n')}`, 200);
    } catch (error) { console.error(`DEL Error: ${error.message}`); sendPlainTextResponse(res, 'Internal Server Error', 500); }
}

// ==========================================================
// ===== MAIN HTTP REQUEST HANDLER =====
function webHandler(req, res) {
    const clientIP = req.socket?.remoteAddress || req.connection?.remoteAddress;
    if (!isLanIP(clientIP)) {
        console.warn(`[SECURITY] Blocked external request from ${clientIP} to ${req.url}`);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden: Local network access only');
        return;
    }
    
    if (req.method === 'OPTIONS') { res.writeHead(204, allowHead); res.end(); return; }
    
    const requestedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodePathSegments(requestedUrl.pathname);
    
    if (pathname === '/upload' && req.method === 'POST') { handleFileUpload(req, res); return; }
    
    if (pathname.endsWith('.api.js') || pathname.endsWith('.ws.js')) {
        if (!isPathInsideRoot(FILES_ROOT, pathname)) {
            return sendPlainTextResponse(res, 'Access Denied', 403);
        }
        if (pathname.endsWith('.api.js')) {
            handleApiRequest(req, res, pathname);
        } else {
            if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
                return sendPlainTextResponse(res, 'WebSocket upgrade required', 400);
            }
            return;
        }
        return;
    }
    
    const xcmd = req.headers['x-cmd'];
    if (xcmd) {
        const xSrc = decodePathSegments(req.headers['x-src'] || '');
        const xDst = decodePathSegments(req.headers['x-dst'] || '');
        switch (xcmd) {
            case "ls": handleLs(res, xSrc); return;
            case "fread": handleReadFile(res, xSrc); return;
            case "freadb": handleReadFileBinary(req, res, xSrc); return;
            case "fwrite":
                if (req.method === 'POST' || req.method === 'PUT') { handleSaveFile(req, res, xSrc); }
                else { sendPlainTextResponse(res, 'SAVEFILE requires POST or PUT method.', 405); }
                return;
            case "mkdir":
                if (req.method === 'POST' || req.method === 'PUT') { handleMkpath(res, xSrc); }
                else { sendPlainTextResponse(res, 'MKPATH requires POST or PUT method.', 405); }
                return;
            case "mv":
                if (req.method === 'POST' || req.method === 'PUT') { handleMv(res, xSrc, xDst); }
                else { sendPlainTextResponse(res, 'MV requires POST or PUT method.', 405); }
                return;
            case "cp":
                if (req.method === 'POST' || req.method === 'PUT') { handleCopy(res, xSrc, xDst); }
                else { sendPlainTextResponse(res, 'COPY requires POST or PUT method.', 405); }
                return;
            case "rn":
                if (req.method === 'POST' || req.method === 'PUT') { handleRn(res, xSrc, xDst); }
                else { sendPlainTextResponse(res, 'RN requires POST or PUT method.', 405); }
                return;
            case "rm":
                if (req.method === 'DELETE') { handleDel(res, xSrc); }
                else { sendPlainTextResponse(res, 'DEL requires DELETE method.', 405); }
                return;
            default: sendPlainTextResponse(res, 'Command not found ' + xcmd, 405); return;
        }
    }
    
    const filePath = path.join(__dirname, 'files', 'public', pathname === '/' ? 'index.html' : pathname);
    handleFileRequest(req, res, filePath);
}

// ==========================================================
// ===== HTTP SERVER =====
const httpServer = http.createServer(webHandler);
httpServer.on('upgrade', (req, socket, head) => handleWsUpgrade('HTTP', req, socket, head));
httpServer.on('error', (err) => {
    console.error(`\x1b[31mHTTP Server error on port ${serverOptions.port}: ${err.message}\x1b[0m`);
    if (err.code === 'EADDRINUSE') console.error(`Port ${serverOptions.port} is already in use.`);
    else if (err.code === 'EACCES') console.error(`Permission denied for port ${serverOptions.port}.`);
    process.exit(1);
});
httpServer.listen(serverOptions.port, () => {});

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
    httpsServer.on('upgrade', (req, socket, head) => handleWsUpgrade('HTTPS', req, socket, head));
    httpsServer.on('error', (err) => {
        console.error(`\x1b[31mHTTPS Server error on port ${serverOptions.sslport}: ${err.message}\x1b[0m`);
        if (err.code === 'EADDRINUSE') console.error(`Port ${serverOptions.sslport} is already in use.`);
        else if (err.code === 'EACCES') console.error(`Permission denied for port ${serverOptions.sslport}.`);
        else if (err.code === 'ERR_SSL_KEY_FORMAT_INVALID') console.error('Invalid private key format.');
        httpsServer = null;
    });
    httpsServer.listen(serverOptions.sslport, () => {
        if (typeof webAppReady === 'function') webAppReady();
    });
} catch (error) {
    console.error(`\x1b[31m❌ FAILED to start HTTPS server:\x1b[0m ${error.message}`);
    if (error.code === 'ENOENT') {
        console.error(`\nMISSING CERTIFICATE FILES! Expected:`);
        console.error(`  Key:  ${path.resolve(serverOptions.key)}`);
        console.error(`  Cert: ${path.resolve(serverOptions.cert)}`);
    }
}