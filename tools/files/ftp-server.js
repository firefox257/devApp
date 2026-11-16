const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dns = require('dns');

// ==========================================
// CONFIGURATION
// ==========================================
const ROOT_DIR = path.join(__dirname, 'ftp_root');
const PORT = 2121;

// >>> SET THIS TO YOUR SERVER'S IP IF CLIENTS CONNECT REMOTELY <<<
// Leave as null to auto-detect. Set to '127.0.0.1' for local-only testing.
const PASV_HOST = null;

// Ensure root directory exists on startup
if (!fs.existsSync(ROOT_DIR)) {
    fs.mkdirSync(ROOT_DIR, { recursive: true });
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Security: Prevent directory traversal attacks
function resolveSandboxPath(clientCwd, relativePath) {
    const target = path.resolve(ROOT_DIR, clientCwd, relativePath);
    if (!target.startsWith(ROOT_DIR)) {
        return null;
    }
    return target;
}

function formatDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    if (date < sixMonthsAgo) {
        return `${month} ${day}  ${date.getFullYear()}`;
    }
    return `${month} ${day} ${hours}:${minutes}`;
}

// Bulletproof IP detection with multiple fallbacks
function getLocalIP() {
    // 1. If user hardcoded it, use that
    if (PASV_HOST) {
        return PASV_HOST;
    }

    // 2. Try os.networkInterfaces() — wrapped in multiple layers of safety
    try {
        const interfaces = os.networkInterfaces();
        if (interfaces) {
            for (const name of Object.keys(interfaces)) {
                const ifaces = interfaces[name];
                if (!ifaces) continue;
                for (const iface of ifaces) {
                    if (!iface) continue;
                    const family = iface.family;
                    const isIPv4 = family === 'IPv4' || family === 4 || family === 'ipv4';
                    if (isIPv4 && !iface.internal) {
                        return iface.address;
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[WARN] os.networkInterfaces() failed:', err.message);
    }

    // 3. Fallback: just return localhost
    console.warn('[WARN] Falling back to 127.0.0.1 for PASV. Set PASV_HOST in config if remote access is needed.');
    return '127.0.0.1';
}

// ==========================================
// FTP SERVER LOGIC
// ==========================================

const server = net.createServer((socket) => {
    let clientState = {
        cwd: '/',
        authenticated: false,
        username: null,
        dataType: 'A',
        pasvServer: null,
        pendingDataTransfer: null
    };

    const send = (code, message) => {
        socket.write(`${code} ${message}\r\n`);
    };

    let buffer = '';
    socket.on('data', (data) => {
        buffer += data.toString();
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\r\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 2);
            if (line.trim()) {
                handleCommand(line);
            }
        }
    });

    socket.on('close', () => {
        if (clientState.pasvServer) {
            try { clientState.pasvServer.close(); } catch (e) {}
        }
    });

    socket.on('error', (err) => {
        console.error('Socket error:', err.message);
    });

    send(220, 'Welcome to the Node.js Scratch FTP Server');

    function handleCommand(line) {
        const spaceIndex = line.indexOf(' ');
        const cmd = (spaceIndex === -1 ? line : line.slice(0, spaceIndex)).toUpperCase();
        const arg = spaceIndex === -1 ? '' : line.slice(spaceIndex + 1).trim();

        console.log(`[CMD] ${cmd} ${arg}`);

        switch (cmd) {
            case 'USER':
                clientState.username = arg;
                send(331, `User name ${arg} OK, need password`);
                break;

            case 'PASS':
                clientState.authenticated = true;
                send(230, 'User logged in, proceed');
                break;

            case 'SYST':
                send(215, 'UNIX Type: L8');
                break;

            case 'FEAT':
                send(211, 'Features:\r\n PASV\r\n UTF8\r\n211 End');
                break;

            case 'PWD':
                send(257, `"${clientState.cwd}" is current directory`);
                break;

            case 'CWD': {
                const newCwd = arg || '/';
                const resolvedCwd = resolveSandboxPath(clientState.cwd, newCwd);
                if (!resolvedCwd || !fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
                    send(550, 'Directory not found');
                } else {
                    clientState.cwd = '/' + path.relative(ROOT_DIR, resolvedCwd).replace(/\\/g, '/');
                    if (clientState.cwd === '') clientState.cwd = '/';
                    send(250, 'Directory changed to ' + clientState.cwd);
                }
                break;
            }

            case 'CDUP':
                handleCommand('CWD ..');
                break;

            case 'TYPE':
                clientState.dataType = arg.toUpperCase();
                send(200, `Type set to ${clientState.dataType}`);
                break;

            case 'PASV':
                handlePasv();
                break;

            case 'LIST':
            case 'NLST':
                handleList(arg, cmd === 'NLST');
                break;

            case 'RETR':
                handleRetr(arg);
                break;

            case 'STOR':
                handleStor(arg);
                break;

            case 'MKD': {
                const mkdPath = resolveSandboxPath(clientState.cwd, arg);
                if (!mkdPath) {
                    send(550, 'Permission denied');
                } else {
                    try {
                        fs.mkdirSync(mkdPath);
                        send(257, `"${arg}" directory created`);
                    } catch (e) {
                        send(550, 'Could not create directory');
                    }
                }
                break;
            }

            case 'DELE': {
                const delePath = resolveSandboxPath(clientState.cwd, arg);
                if (!delePath) {
                    send(550, 'Permission denied');
                } else {
                    try {
                        fs.unlinkSync(delePath);
                        send(250, 'File deleted');
                    } catch (e) {
                        send(550, 'Could not delete file');
                    }
                }
                break;
            }

            case 'QUIT':
                send(221, 'Goodbye');
                socket.end();
                break;

            default:
                send(502, 'Command not implemented');
        }
    }

    function handlePasv() {
        if (clientState.pasvServer) {
            try { clientState.pasvServer.close(); } catch (e) {}
            clientState.pasvServer = null;
        }

        clientState.pasvServer = net.createServer((dataSocket) => {
            try { clientState.pasvServer.close(); } catch (e) {}
            clientState.pasvServer = null;
            
            if (clientState.pendingDataTransfer) {
                const cb = clientState.pendingDataTransfer;
                clientState.pendingDataTransfer = null;
                cb(dataSocket);
            }
        });

        clientState.pasvServer.on('error', (err) => {
            console.error('PASV server error:', err.message);
            send(425, 'Cannot open data connection');
        });

        clientState.pasvServer.listen(0, () => {
            const port = clientState.pasvServer.address().port;
            const ip = getLocalIP().split('.').join(',');
            const p1 = Math.floor(port / 256);
            const p2 = port % 256;
            send(227, `Entering Passive Mode (${ip},${p1},${p2})`);
        });
    }

    function waitForDataConnection(callback) {
        if (clientState.pasvServer && clientState.pasvServer.listening) {
            clientState.pendingDataTransfer = callback;
        } else {
            send(425, 'Use PASV first');
        }
    }

    function handleList(arg, isNlst) {
        send(150, 'Opening data connection for directory list');
        
        waitForDataConnection((dataSocket) => {
            const dirPath = resolveSandboxPath(clientState.cwd, arg || '.');
            
            fs.readdir(dirPath, (err, files) => {
                if (err) {
                    dataSocket.end();
                    send(550, 'Failed to list directory');
                    return;
                }

                if (files.length === 0) {
                    dataSocket.end();
                    send(226, 'Transfer complete');
                    return;
                }

                let output = '';
                let processed = 0;
                files.forEach((file) => {
                    const filePath = path.join(dirPath, file);
                    fs.stat(filePath, (err, stats) => {
                        if (!err) {
                            if (isNlst) {
                                output += file + '\r\n';
                            } else {
                                const perms = stats.isDirectory() ? 'drwxr-xr-x' : '-rw-r--r--';
                                const dateStr = formatDate(stats.mtime);
                                output += `${perms} 1 ftp ftp ${stats.size.toString().padStart(12)} ${dateStr} ${file}\r\n`;
                            }
                        }
                        processed++;
                        if (processed === files.length) {
                            dataSocket.write(output);
                            dataSocket.end();
                            send(226, 'Transfer complete');
                        }
                    });
                });
            });
        });
    }

    function handleRetr(filename) {
        const filePath = resolveSandboxPath(clientState.cwd, filename);
        if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            send(550, 'File not found');
            return;
        }

        send(150, 'Opening data connection for file transfer');
        
        waitForDataConnection((dataSocket) => {
            const readStream = fs.createReadStream(filePath);
            readStream.pipe(dataSocket);
            
            readStream.on('end', () => send(226, 'Transfer complete'));
            readStream.on('error', () => send(550, 'File read error'));
        });
    }

    function handleStor(filename) {
        const filePath = resolveSandboxPath(clientState.cwd, filename);
        if (!filePath) {
            send(550, 'Permission denied');
            return;
        }

        send(150, 'Opening data connection for file upload');
        
        waitForDataConnection((dataSocket) => {
            const writeStream = fs.createWriteStream(filePath);
            dataSocket.pipe(writeStream);
            
            writeStream.on('finish', () => send(226, 'Transfer complete'));
            writeStream.on('error', () => send(550, 'File write error'));
        });
    }
});

server.listen(PORT, () => {
    console.log(`FTP Server running on port ${PORT}`);
    console.log(`Root directory: ${ROOT_DIR}`);
    console.log(`PASV host: ${PASV_HOST || '(auto-detect, fallback 127.0.0.1)'}`);
    console.log(`Connect using: ftp localhost ${PORT}`);
});