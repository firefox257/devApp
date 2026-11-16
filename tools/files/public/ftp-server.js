const net = require('net');
const fs = require('fs');
const path = require('path');

// Root directory exposed by FTP
const ROOT_DIR = path.resolve(__dirname, 'ftp_root');

const HOST = '0.0.0.0';
const PORT = 2121;

// Important:
// null = auto use the control socket local IP.
// If connecting from another device, set this to the IP you use in the FTP client.
// Example:
// const PASV_HOST = '192.168.1.50';
const PASV_HOST = null;

const DEBUG = true;

// ======================================================
// Startup
// ======================================================

fs.mkdirSync(ROOT_DIR, { recursive: true });

function log(...args) {
    if (DEBUG) console.log(...args);
}

// ======================================================
// Safe FTP path handling
// ======================================================

function isInsideRoot(fsPath) {
    const rel = path.relative(ROOT_DIR, fsPath);
    return rel === '' || (
        rel &&
        rel !== '..' &&
        !rel.startsWith('..' + path.sep) &&
        !path.isAbsolute(rel)
    );
}

function resolveFtpPath(cwd, input) {
    let name = String(input || '').trim();
    if (!name) name = '.';

    // Treat Windows-style separators as FTP separators too.
    name = name.replace(/\\/g, '/');

    let virtualPath;

    if (name.startsWith('/')) {
        virtualPath = path.posix.normalize(name);
    } else {
        virtualPath = path.posix.normalize(path.posix.join(cwd, name));
    }

    if (!virtualPath.startsWith('/')) {
        virtualPath = '/' + virtualPath;
    }

    virtualPath = virtualPath.replace(/\/+/g, '/');

    if (virtualPath.length > 1 && virtualPath.endsWith('/')) {
        virtualPath = virtualPath.slice(0, -1);
    }

    const relativeToRoot = virtualPath.replace(/^\/+/, '');
    const fsPath = path.resolve(ROOT_DIR, relativeToRoot);

    if (!isInsideRoot(fsPath)) {
        return null;
    }

    return {
        fsPath,
        ftpPath: virtualPath || '/'
    };
}

function quoteFtpPath(p) {
    return `"${String(p).replace(/"/g, '""')}"`;
}

function cleanListArg(arg) {
    // Many clients send: LIST -la
    // Ignore option flags and use remaining path.
    const parts = String(arg || '').match(/"[^"]*"|'[^']*'|\S+/g) || [];

    const cleaned = parts
        .filter(x => !x.startsWith('-'))
        .map(x => x.replace(/^["']|["']$/g, ''));

    return cleaned.join(' ') || '.';
}

// ======================================================
// Formatting helpers
// ======================================================

function formatListDate(date) {
    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const month = months[date.getMonth()];
    const day = String(date.getDate()).padStart(2, ' ');

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (date < sixMonthsAgo || date > now) {
        return `${month} ${day}  ${date.getFullYear()}`;
    }

    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');

    return `${month} ${day} ${hh}:${mm}`;
}

function formatMdtm(date) {
    return date.toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14);
}

function ipv4FromAddress(addr) {
    if (!addr) return null;

    addr = String(addr);

    // Remove IPv6 zone index.
    addr = addr.replace(/%.*$/, '');

    if (addr.startsWith('::ffff:')) {
        addr = addr.slice(7);
    }

    if (addr === '::1') {
        return '127.0.0.1';
    }

    if (net.isIPv4(addr)) {
        return addr;
    }

    return null;
}

function makeUnixListLine(name, stats) {
    const perms = stats.isDirectory() ? 'drwxr-xr-x' : '-rw-r--r--';
    const size = String(stats.size).padStart(13);
    const date = formatListDate(stats.mtime);

    return `${perms} 1 ftp ftp ${size} ${date} ${name}\r\n`;
}

// ======================================================
// FTP server
// ======================================================

const server = net.createServer((socket) => {
    const state = {
        cwd: '/',
        username: null,
        loggedIn: false,
        type: 'A',

        dataServer: null,
        queuedDataSocket: null,
        pendingDataCallback: null,
        currentDataSocket: null,

        activeAddress: null,
        renameFrom: null
    };

    function send(code, message) {
        if (!socket.writable) return;

        const text = `${code} ${message}\r\n`;
        log('[SEND]', text.trim());
        socket.write(text);
    }

    function sendRaw(text) {
        if (!socket.writable) return;
        log('[SEND]', text.trim());
        socket.write(text);
    }

    function closePassiveListener() {
        if (state.dataServer) {
            try {
                state.dataServer.close();
            } catch (_) {}

            state.dataServer = null;
        }

        state.pendingDataCallback = null;

        if (state.queuedDataSocket) {
            try {
                state.queuedDataSocket.destroy();
            } catch (_) {}

            state.queuedDataSocket = null;
        }
    }

    function cleanupAllData() {
        closePassiveListener();

        if (state.currentDataSocket) {
            try {
                state.currentDataSocket.destroy();
            } catch (_) {}

            state.currentDataSocket = null;
        }
    }

    function deliverDataSocket(dataSocket, callback) {
        state.currentDataSocket = dataSocket;

        dataSocket.on('error', (err) => {
            log('[DATA ERROR]', err.message);
        });

        dataSocket.on('close', () => {
            if (state.currentDataSocket === dataSocket) {
                state.currentDataSocket = null;
            }
        });

        try {
            callback(dataSocket);
        } catch (err) {
            console.error('[TRANSFER ERROR]', err);
            try {
                dataSocket.destroy();
            } catch (_) {}
            send(550, 'Transfer failed');
        }
    }

    function getPassiveHost() {
        if (PASV_HOST) {
            return PASV_HOST;
        }

        // This does NOT use os.networkInterfaces().
        // It asks the existing control connection what local IP was used.
        const localIp = ipv4FromAddress(socket.localAddress);

        if (localIp) {
            return localIp;
        }

        return '127.0.0.1';
    }

    function handlePassive(extended) {
        closePassiveListener();
        state.activeAddress = null;

        const listener = net.createServer((dataSocket) => {
            log('[DATA] Passive data connection accepted');

            try {
                listener.close();
            } catch (_) {}

            if (state.dataServer === listener) {
                state.dataServer = null;
            }

            const callback = state.pendingDataCallback;
            state.pendingDataCallback = null;

            if (callback) {
                deliverDataSocket(dataSocket, callback);
            } else {
                // Important race fix:
                // Client may connect to PASV port before sending LIST/RETR/STOR.
                log('[DATA] Queueing data socket until transfer command arrives');
                state.queuedDataSocket = dataSocket;
            }
        });

        state.dataServer = listener;

        listener.on('error', (err) => {
            console.error('[PASV ERROR]', err.message);

            if (state.dataServer === listener) {
                state.dataServer = null;
            }

            send(425, 'Cannot open passive data connection');
        });

        listener.listen(0, HOST, () => {
            const port = listener.address().port;

            if (extended) {
                send(229, `Entering Extended Passive Mode (|||${port}|)`);
                return;
            }

            const ip = getPassiveHost();

            if (!net.isIPv4(ip)) {
                send(425, 'PASV requires IPv4. Use EPSV or set PASV_HOST to an IPv4 address.');
                closePassiveListener();
                return;
            }

            const parts = ip.split('.');
            const p1 = Math.floor(port / 256);
            const p2 = port % 256;

            send(227, `Entering Passive Mode (${parts.join(',')},${p1},${p2})`);
        });
    }

    function getDataConnection(callback) {
        if (state.queuedDataSocket && !state.queuedDataSocket.destroyed) {
            log('[DATA] Using queued passive data socket');

            const dataSocket = state.queuedDataSocket;
            state.queuedDataSocket = null;

            deliverDataSocket(dataSocket, callback);
            return;
        }

        if (state.dataServer && state.dataServer.listening) {
            log('[DATA] Waiting for passive data connection');
            state.pendingDataCallback = callback;
            return;
        }

        if (state.activeAddress) {
            log('[DATA] Connecting to active data address', state.activeAddress);

            const dataSocket = net.createConnection(state.activeAddress);

            dataSocket.once('connect', () => {
                deliverDataSocket(dataSocket, callback);
            });

            dataSocket.once('error', (err) => {
                console.error('[ACTIVE DATA ERROR]', err.message);
                send(425, 'Cannot connect to active data port');
            });

            return;
        }

        send(425, 'Use PASV, EPSV, or PORT first');
    }

    function requireLogin(cmd) {
        const allowedBeforeLogin = new Set([
            'USER',
            'PASS',
            'QUIT',
            'SYST',
            'FEAT',
            'NOOP',
            'OPTS'
        ]);

        if (!state.loggedIn && !allowedBeforeLogin.has(cmd)) {
            send(530, 'Please login first');
            return false;
        }

        return true;
    }

    function changeDirectory(arg) {
        const p = resolveFtpPath(state.cwd, arg || '/');

        if (!p) {
            send(550, 'Permission denied');
            return;
        }

        try {
            const stats = fs.statSync(p.fsPath);

            if (!stats.isDirectory()) {
                send(550, 'Not a directory');
                return;
            }

            state.cwd = p.ftpPath;
            send(250, `Directory changed to ${state.cwd}`);
        } catch (_) {
            send(550, 'Directory not found');
        }
    }

    function handleList(arg, nlst) {
        const listPath = cleanListArg(arg);
        const p = resolveFtpPath(state.cwd, listPath);

        if (!p) {
            send(550, 'Permission denied');
            return;
        }

        let stats;

        try {
            stats = fs.statSync(p.fsPath);
        } catch (_) {
            send(550, 'Directory not found');
            return;
        }

        if (!stats.isDirectory()) {
            send(550, 'Not a directory');
            return;
        }

        send(150, 'Opening data connection for directory listing');

        getDataConnection((dataSocket) => {
            let output = '';

            try {
                const names = fs.readdirSync(p.fsPath);
                names.sort();

                for (const name of names) {
                    const childPath = path.join(p.fsPath, name);

                    try {
                        const childStats = fs.statSync(childPath);

                        if (nlst) {
                            output += name + '\r\n';
                        } else {
                            output += makeUnixListLine(name, childStats);
                        }
                    } catch (_) {
                        // Skip files that disappear or cannot be stat'ed.
                    }
                }
            } catch (err) {
                console.error('[LIST ERROR]', err.message);
                try {
                    dataSocket.destroy();
                } catch (_) {}
                send(550, 'Failed to list directory');
                return;
            }

            let failed = false;

            dataSocket.on('error', () => {
                failed = true;
            });

            dataSocket.on('close', () => {
                if (!failed) {
                    send(226, 'Transfer complete');
                }
            });

            dataSocket.end(output);
        });
    }

    function handleRetr(filename) {
        if (!filename) {
            send(501, 'Missing filename');
            return;
        }

        const p = resolveFtpPath(state.cwd, filename);

        if (!p) {
            send(550, 'Permission denied');
            return;
        }

        let stats;

        try {
            stats = fs.statSync(p.fsPath);
        } catch (_) {
            send(550, 'File not found');
            return;
        }

        if (!stats.isFile()) {
            send(550, 'Not a regular file');
            return;
        }

        send(150, 'Opening data connection for file download');

        getDataConnection((dataSocket) => {
            let failed = false;

            const readStream = fs.createReadStream(p.fsPath);

            readStream.on('error', (err) => {
                failed = true;
                console.error('[RETR ERROR]', err.message);
                try {
                    dataSocket.destroy();
                } catch (_) {}
                send(550, 'File read error');
            });

            dataSocket.on('error', () => {
                failed = true;
                try {
                    readStream.destroy();
                } catch (_) {}
            });

            dataSocket.on('close', () => {
                if (!failed) {
                    send(226, 'Transfer complete');
                }
            });

            readStream.pipe(dataSocket);
        });
    }

    function handleStor(filename) {
        if (!filename) {
            send(501, 'Missing filename');
            return;
        }

        const p = resolveFtpPath(state.cwd, filename);

        if (!p) {
            send(550, 'Permission denied');
            return;
        }

        try {
            if (fs.existsSync(p.fsPath) && fs.statSync(p.fsPath).isDirectory()) {
                send(550, 'Cannot overwrite directory');
                return;
            }
        } catch (_) {
            send(550, 'File error');
            return;
        }

        send(150, 'Opening data connection for file upload');

        getDataConnection((dataSocket) => {
            let failed = false;

            const writeStream = fs.createWriteStream(p.fsPath);

            writeStream.on('finish', () => {
                if (!failed) {
                    send(226, 'Transfer complete');
                }
            });

            writeStream.on('error', (err) => {
                failed = true;
                console.error('[STOR ERROR]', err.message);
                try {
                    dataSocket.destroy();
                } catch (_) {}
                send(550, 'File write error');
            });

            dataSocket.on('error', () => {
                failed = true;
                try {
                    writeStream.destroy();
                } catch (_) {}
            });

            dataSocket.pipe(writeStream);
        });
    }

    function handleCommand(line) {
        const spaceIndex = line.indexOf(' ');

        const cmd = (
            spaceIndex === -1
                ? line
                : line.slice(0, spaceIndex)
        ).toUpperCase();

        const arg = spaceIndex === -1
            ? ''
            : line.slice(spaceIndex + 1).trim();

        if (cmd === 'PASS') {
            log('[CMD] PASS ****');
        } else {
            log('[CMD]', cmd, arg);
        }

        if (!requireLogin(cmd)) return;

        switch (cmd) {
            case 'USER': {
                state.username = arg || 'anonymous';
                state.loggedIn = false;
                send(331, 'User name OK, need password');
                break;
            }

            case 'PASS': {
                state.loggedIn = true;
                send(230, 'User logged in');
                break;
            }

            case 'SYST': {
                send(215, 'UNIX Type: L8');
                break;
            }

            case 'FEAT': {
                sendRaw(
                    '211-Features:\r\n' +
                    ' UTF8\r\n' +
                    ' PASV\r\n' +
                    ' EPSV\r\n' +
                    ' PORT\r\n' +
                    ' SIZE\r\n' +
                    ' MDTM\r\n' +
                    '211 End\r\n'
                );
                break;
            }

            case 'OPTS': {
                if (arg.toUpperCase() === 'UTF8 ON') {
                    send(200, 'UTF8 enabled');
                } else {
                    send(200, 'OK');
                }
                break;
            }

            case 'NOOP': {
                send(200, 'OK');
                break;
            }

            case 'PWD':
            case 'XPWD': {
                send(257, `${quoteFtpPath(state.cwd)} is current directory`);
                break;
            }

            case 'CWD': {
                changeDirectory(arg || '/');
                break;
            }

            case 'CDUP': {
                changeDirectory('..');
                break;
            }

            case 'TYPE': {
                state.type = arg.toUpperCase() || 'A';
                send(200, `Type set to ${state.type}`);
                break;
            }

            case 'MODE': {
                send(200, 'Mode set');
                break;
            }

            case 'STRU': {
                send(200, 'Structure set');
                break;
            }

            case 'PASV': {
                handlePassive(false);
                break;
            }

            case 'EPSV': {
                handlePassive(true);
                break;
            }

            case 'PORT': {
                const nums = arg.split(',').map(x => Number(x.trim()));

                if (
                    nums.length !== 6 ||
                    nums.some(n => !Number.isInteger(n) || n < 0 || n > 255)
                ) {
                    send(501, 'Invalid PORT command');
                    break;
                }

                const host = nums.slice(0, 4).join('.');
                const port = nums[4] * 256 + nums[5];

                closePassiveListener();

                state.activeAddress = { host, port };

                send(200, 'PORT command successful');
                break;
            }

            case 'EPRT': {
                // Example: |1|192.168.1.5|52100|
                const parts = arg.split('|').filter(Boolean);

                if (parts.length !== 3) {
                    send(501, 'Invalid EPRT command');
                    break;
                }

                const host = parts[1];
                const port = Number(parts[2]);

                if (!Number.isInteger(port) || port <= 0 || port > 65535) {
                    send(501, 'Invalid EPRT port');
                    break;
                }

                closePassiveListener();

                state.activeAddress = { host, port };

                send(200, 'EPRT command successful');
                break;
            }

            case 'LIST': {
                handleList(arg, false);
                break;
            }

            case 'NLST': {
                handleList(arg, true);
                break;
            }

            case 'RETR': {
                handleRetr(arg);
                break;
            }

            case 'STOR': {
                handleStor(arg);
                break;
            }

            case 'DELE': {
                const p = resolveFtpPath(state.cwd, arg);

                if (!p) {
                    send(550, 'Permission denied');
                    break;
                }

                try {
                    const stats = fs.statSync(p.fsPath);

                    if (!stats.isFile()) {
                        send(550, 'Not a regular file');
                        break;
                    }

                    fs.unlinkSync(p.fsPath);
                    send(250, 'File deleted');
                } catch (_) {
                    send(550, 'Could not delete file');
                }

                break;
            }

            case 'MKD':
            case 'XMKD': {
                const p = resolveFtpPath(state.cwd, arg);

                if (!p) {
                    send(550, 'Permission denied');
                    break;
                }

                try {
                    fs.mkdirSync(p.fsPath);
                    send(257, `${quoteFtpPath(p.ftpPath)} created`);
                } catch (_) {
                    send(550, 'Could not create directory');
                }

                break;
            }

            case 'RMD':
            case 'XRMD': {
                const p = resolveFtpPath(state.cwd, arg);

                if (!p) {
                    send(550, 'Permission denied');
                    break;
                }

                try {
                    fs.rmdirSync(p.fsPath);
                    send(250, 'Directory removed');
                } catch (_) {
                    send(550, 'Could not remove directory');
                }

                break;
            }

            case 'RNFR': {
                const p = resolveFtpPath(state.cwd, arg);

                if (!p || !fs.existsSync(p.fsPath)) {
                    send(550, 'File or directory not found');
                    break;
                }

                state.renameFrom = p.fsPath;
                send(350, 'Ready for RNTO');
                break;
            }

            case 'RNTO': {
                if (!state.renameFrom) {
                    send(503, 'Use RNFR first');
                    break;
                }

                const p = resolveFtpPath(state.cwd, arg);

                if (!p) {
                    send(550, 'Permission denied');
                    break;
                }

                try {
                    fs.renameSync(state.renameFrom, p.fsPath);
                    state.renameFrom = null;
                    send(250, 'Rename successful');
                } catch (_) {
                    send(550, 'Rename failed');
                }

                break;
            }

            case 'SIZE': {
                const p = resolveFtpPath(state.cwd, arg);

                if (!p) {
                    send(550, 'Permission denied');
                    break;
                }

                try {
                    const stats = fs.statSync(p.fsPath);

                    if (!stats.isFile()) {
                        send(550, 'Not a regular file');
                        break;
                    }

                    send(213, String(stats.size));
                } catch (_) {
                    send(550, 'File not found');
                }

                break;
            }

            case 'MDTM': {
                const p = resolveFtpPath(state.cwd, arg);

                if (!p) {
                    send(550, 'Permission denied');
                    break;
                }

                try {
                    const stats = fs.statSync(p.fsPath);
                    send(213, formatMdtm(stats.mtime));
                } catch (_) {
                    send(550, 'File not found');
                }

                break;
            }

            case 'ABOR': {
                cleanupAllData();
                send(226, 'Aborted');
                break;
            }

            case 'QUIT': {
                send(221, 'Goodbye');
                socket.end();
                cleanupAllData();
                break;
            }

            default: {
                send(502, 'Command not implemented');
                break;
            }
        }
    }

    let buffer = '';

    socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');

        let index;

        while ((index = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);

            if (line.endsWith('\r')) {
                line = line.slice(0, -1);
            }

            if (line.length > 0) {
                handleCommand(line);
            }
        }
    });

    socket.on('error', (err) => {
        log('[SOCKET ERROR]', err.message);
    });

    socket.on('close', () => {
        log('[CONTROL] Closed');
        cleanupAllData();
    });

    log(
        '[CONTROL] Connected',
        'remote=', socket.remoteAddress,
        'local=', socket.localAddress
    );

    send(220, 'Node.js FTP server ready');
});

server.on('error', (err) => {
    console.error('[SERVER ERROR]', err);
});

server.listen(PORT, HOST, () => {
    console.log(`FTP Server running on port ${PORT}`);
    console.log(`Root directory: ${ROOT_DIR}`);
    console.log(`PASV host: ${PASV_HOST || '(auto from control socket)'}`);
    console.log(`Connect using: ftp localhost ${PORT}`);
});