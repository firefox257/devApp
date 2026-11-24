// webserver.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const crypto = require('crypto');

const serverOptions = {
    port: 80,
    sslport: 443,
    key: './files/key.pem',
    cert: './files/cert.crt',
    additionalMethods: []
};


// ==========================================================
// ===== PATH CONSTANTS =====
const FILES_ROOT = path.join(__dirname, 'files');
globalThis.FILES_ROOT = FILES_ROOT; // Expose globally for nested .api.js files
const TRASH_DIR = path.join(FILES_ROOT, 'trash');

// ==========================================================
// 🚨 ENHANCED ERROR HANDLING
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

function logModuleError(context, filePath, error) {
  console.error(`\n\x1b[31m[${context}] ❌ LOAD/EXEC ERROR: ${filePath}\x1b[0m`);
  console.error(`\x1b[2mError:\x1b[0m ${error.message}`);
  
  if (error.stack) {
    console.error(`\x1b[2mStack:\x1b[0m\n${error.stack.split('\n').slice(1).map(l => '  ' + l).join('\n')}`);
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
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
    '.txt': 'text/plain', '.html': 'text/html', '.htm': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.jpg': 'image/jpeg', '.JPG': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.m3u': 'text/plain', '.svg': 'image/svg+xml',
    '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.onnx': 'application/octet-stream',
    '.css': 'text/css', '.hdr': 'application/octet-stream', '.json': 'application/json',
    '.stl': 'application/sla', '.dxf': 'application/dxf', '.gif': 'image/gif', '.woff2': 'font/woff2',
    '.ico': 'image/vnd.microsoft.icon', '.glb': 'model/gltf-binary', '.pvr': 'image/x-png',
    '.usdz': 'vnd.usdz+zip', '.mpd': 'application/dash+xml', '.dae': 'model/vnd.collada+xml',
    '.obj': 'multipart/form-data', '.ply': 'model/mesh', '.3dm': 'model/vnd.3dm', '.3ds': 'application/x-3ds',
    '.3mf': 'model/3mf', '.amf': 'application/octet-stream', '.bvh': 'animation/bvh', '.drc': 'application/octet-stream',
    '.fbx': 'application/octet-stream', '.gcode': 'text/x-gcode', '.kmz': 'application/vnd.google-earth.kmz+xml',
    '.lwo': 'image/x-lwo', '.md2': 'model/md2', '.mdd': 'application/octet-stream', '.nrrd': 'application/octet-stream',
    '.mtl': 'text/plain', '.pcd': 'application/vnd.pointcloud+json', '.pdb': 'chemical/pdb', '.vox': 'application/octet-stream',
    '.wrl': 'model/x3d-vrl', '.vtk': 'application/octet-stream', '.dds': 'image/vnd.ms-dds', '.exr': 'application/octet-stream',
    '.ktx': 'application/octet-stream', '.ktx2': 'application/octet-stream', '.tga': 'image/x-tga', '.tif': 'image/tiff',
    '.tiff': 'image/tiff', '.ttf': 'font/ttf', '.vtp': 'application/vibrationview', '.zip': 'application/zip',
    '.xyz': 'application/octet-stream', '.webm': 'video/webm', '.wat': 'text/plain', '.pdf': 'application/pdf', '.wasm': 'application/wasm'
};

// ==========================================================
// 🔧 DECODE CHANGE: Safe URI path decoder (segment-wise)
function decodePathSegments(pathname) {
    if (!pathname) return pathname;
    return pathname.split('/').map(segment => {
        try { return decodeURIComponent(segment); } catch (e) { return segment; }
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
    const isFin = (buffer[0] & 0x80) !== 0;
    const opcode = buffer[0] & 0x0F;
    if (![1, 8, 9, 10].includes(opcode)) {
        console.warn(`[WS] Unsupported opcode: ${opcode}`);
        return null; 
    }
    const isMasked = (buffer[1] & 0x80) === 0x80;
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
    const frameLength = dataStart + (isMasked ? 4 : 0) + payloadLen;
    if (buffer.length < frameLength) return null;
    let payload = buffer.slice(dataStart + (isMasked ? 4 : 0), frameLength);
    if (isMasked) {
        const masks = buffer.slice(dataStart, dataStart + 4);
        for (let i = 0; i < payload.length; i++) {
            payload[i] ^= masks[i % 4];
        }
    }
    return { opcode, isFin, message: payload.toString('utf8'), bytesConsumed: frameLength };
}

function createWebSocketFrame(message) {
    const payload = Buffer.from(message, 'utf8');
    const len = payload.length;
    let headerLen = 2;
    if (len > 65535) headerLen += 8;
    else if (len > 125) headerLen += 2;
    const buffer = Buffer.allocUnsafe(headerLen + len);
    buffer[0] = 0x81;
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

const allowHead = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, POST, GET, PUT, PATCH, DELETE',
    'Access-Control-Max-Age': 2592000,
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-LS-Path, X-Read-File, X-Read-File-Binary, X-Save-File, X-File-Path, X-File-Content, X-MKPATH, X-MV-Source, X-MV-Destination, X-DEL-Path, X-COPY-Source, X-COPY-Destination, X-RN-Source, X-RN-Destination, X-CMD, X-SRC, X-DST',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'cross-origin'
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
        if (stats.isDirectory()) {
            return sendPlainTextResponse(res, 'Cannot read a directory', 400);
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
            const streamHeaders = { 'Content-Length': fileSize, 'Content-Type': contentType, ...headers };
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
        if (stats.isDirectory()) {
            return sendPlainTextResponse(res, 'Cannot read a directory', 400);
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = _mimetype[ext] || 'application/octet-stream';
        streamFile(req, res, filePath, contentType);
    });
}

// ==========================================================
// ===== API REQUEST HANDLER =====
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
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);//"
        if (!boundaryMatch) return reject(new Error('Missing boundary in Content-Type'));
        const boundaryStr = (boundaryMatch[1] || boundaryMatch[2]).trim();
        const boundary = Buffer.from('--' + boundaryStr);
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
                const result = { fields: {}, files: [] };
                let offset = 0;
                while (true) {
                    const boundaryIndex = buffer.indexOf(boundary, offset);
                    if (boundaryIndex === -1) break;
                    const nextChars = buffer.slice(boundaryIndex + boundary.length, boundaryIndex + boundary.length + 4).toString('ascii');
                    if (nextChars.startsWith('--')) break;
                    offset = boundaryIndex + boundary.length;
                    if (buffer[offset] === 0x0D && buffer[offset + 1] === 0x0A) offset += 2;
                    const headerEndIdx = buffer.indexOf('\r\n\r\n', offset);
                    if (headerEndIdx === -1) break;
                    const headersRaw = buffer.slice(offset, headerEndIdx).toString('utf8');
                    offset = headerEndIdx + 4;
                    let contentEndIdx = buffer.indexOf(boundary, offset);
                    if (contentEndIdx === -1) contentEndIdx = buffer.length;
                    else if (contentEndIdx >= 2 && buffer[contentEndIdx - 2] === 0x0D && buffer[contentEndIdx - 1] === 0x0A) contentEndIdx -= 2;
                    const content = buffer.slice(offset, contentEndIdx);
                    const dispMatch = headersRaw.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"/i);//"
                    if (dispMatch) {
                        const fieldName = dispMatch[1];
                        const filenameMatch = headersRaw.match(/filename="([^"]+)"/i);//"
                        if (filenameMatch) {
                            const filename = filenameMatch[1];
                            const contentTypeMatch = headersRaw.match(/Content-Type:\s*([^\r\n]+)/i);
                            const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
                            result.files.push({ field: fieldName, name: filename, type: contentType, content: content, isBinary: true });
                        } else {
                            result.fields[fieldName] = content.toString('utf8');
                        }
                    }
                    offset = contentEndIdx;
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
        if (file.isBinary) await writeFile(fullPath, file.content);
        else await writeFile(fullPath, file.content, 'utf8');
        sendPlainTextResponse(res, `File uploaded: ${filePathHeader}`, 200);
    } catch (error) {
        if (error.message.includes('Payload too large')) sendPlainTextResponse(res, error.message, 413);
        else if (error.message.includes('Missing boundary')) sendPlainTextResponse(res, 'Invalid request format', 400);
        else {
            console.error(`\x1b[31m[UPLOAD] ❌ ERROR:\x1b[0m ${error.message}`);
            if (error.stack) console.error(`\x1b[2mStack:\x1b[0m\n${error.stack}`);
            sendPlainTextResponse(res, 'Upload failed: ' + error.message, 500);
        }
    }
}

// ==========================================================
// ===== WEBSOCKET UPGRADE HANDLER =====
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
                    if (typeof handlerMod.handler !== 'function') throw new Error('Handler must export "handler" function');
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
            socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);
            const ws = {
                send: (msg) => {
                    if (socket.writable && typeof msg === 'string') {
                        try { socket.write(createWebSocketFrame(msg)); } catch (e) { console.error(`[WS] Send error:`, e.message); }
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
            let wsInstance;
            try {
                wsInstance = handlerMod.handler(ws, req);
                if (typeof wsInstance?.onOpen === 'function') wsInstance.onOpen();
            } catch (e) {
                logModuleError('WS-OPEN', cacheKey, e);
                ws.close(1011, 'Init failed');
                return;
            }
            let frameBuffer = Buffer.alloc(0);
            socket.on('data', (chunk) => {
                frameBuffer = Buffer.concat([frameBuffer, chunk]);
                while (frameBuffer.length >= 2) {
                    const parsed = parseWebSocketFrame(frameBuffer);
                    if (parsed === null) break;
                    try {
                        if (parsed.opcode === 8) { ws.close(1000, 'Closed by client'); return; } 
                        else if (parsed.opcode === 9) {
                            const pongPayload = Buffer.from(parsed.message, 'utf8');
                            const pongLen = pongPayload.length;
                            let pongFrame;
                            if (pongLen <= 125) {
                                pongFrame = Buffer.allocUnsafe(2 + pongLen);
                                pongFrame[0] = 0x8A; pongFrame[1] = pongLen;
                                pongPayload.copy(pongFrame, 2);
                            } else {
                                pongFrame = Buffer.allocUnsafe(4 + pongLen);
                                pongFrame[0] = 0x8A; pongFrame[1] = 126;
                                pongFrame.writeUInt16BE(pongLen, 2);
                                pongPayload.copy(pongFrame, 4);
                            }
                            socket.write(pongFrame);
                        } else if (parsed.opcode === 1) {
                            if (typeof wsInstance?.onMessage === 'function') wsInstance.onMessage(parsed.message);
                        }
                    } catch (e) {
                        logModuleError('WS-MSG', cacheKey, e);
                        ws.close(1011, 'Handler error');
                        return;
                    }
                    frameBuffer = frameBuffer.slice(parsed.bytesConsumed);
                }
            });
            socket.on('close', () => {
                ws.readyState = 3;
                if (wsCache.has(cacheKey)) wsCache.get(cacheKey).lastAccessed = Date.now();
                try { if (typeof wsInstance?.onClose === 'function') wsInstance.onClose(); } catch (e) { }
            });
            socket.on('error', (err) => {
                console.error(`[WS] ${serverType} Socket error ${cacheKey}:`, err.message);
                ws.close(1006, 'Socket error');
            });
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
// ===== MAIN HTTP REQUEST HANDLER =====
function webHandler(req, res) {
    const clientIP = req.socket?.remoteAddress || req.connection?.remoteAddress;
    if (!isLanIP(clientIP)) {
        console.warn(`[SECURITY] Blocked external request from ${clientIP} to ${req.url}`);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden: Local network access only');
        return;
    }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');    
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');   
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    
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