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

        // 🛡️ PREVENT EISDIR CRASH: Return 400 if targeting a directory
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
            
            fileStream.on('error', (streamErr) => {
                console.error(`[STREAM ERROR] ${filePath}:`, streamErr.message);
                if (!res.headersSent) sendPlainTextResponse(res, '500 Internal Server Error', 500);
            });
            fileStream.pipe(res);
        } else {
            const streamHeaders = {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                ...headers
            };
            res.writeHead(statusCode, streamHeaders);
            const fileStream = fs.createReadStream(filePath);
            
            fileStream.on('error', (streamErr) => {
                console.error(`[STREAM ERROR] ${filePath}:`, streamErr.message);
                if (!res.headersSent) sendPlainTextResponse(res, '500 Internal Server Error', 500);
            });
            fileStream.pipe(res);
        }
    });
};