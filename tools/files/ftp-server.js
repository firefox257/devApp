const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ==========================================
// CONFIGURATION
// ==========================================
const ROOT_DIR = path.join(__dirname, 'ftp_root');
const PORT = 2121; // Using 2121 to avoid requiring root privileges (port 21)

// Ensure root directory exists on startup
if (!fs.existsSync(ROOT_DIR)) {
    fs.mkdirSync(ROOT_DIR, { recursive: true });
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Security: Prevent directory traversal attacks (e.g., CWD ../../etc)
function resolveSandboxPath(clientCwd, relativePath) {
    const target = path.resolve(ROOT_DIR, clientCwd, relativePath);
    if (!target.startsWith(ROOT_DIR)) {
        return null; // Escaped sandbox
    }
    return target;
}

// Format date for LIST command (standard FTP format)
function formatDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    // If file is older than 6 months, show year instead of time
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    if (date < sixMonthsAgo) {
        return `${month} ${day}  ${date.getFullYear()}`;
    }
    return `${month} ${day} ${hours}:${minutes}`;
}

// Get local IP for PASV mode (fallback to 127.0.0.1)
function getLocalIP() {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // Check for both string 'IPv4' (Node 18+) and number 4 (older Node)
                if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
                    return iface.address;
                }
            }
        }
    } catch (err) {
        console.warn('Warning: Could not read network interfaces. Falling back to 127.0.0.1');
    }
    return '127.0.0.1';
}

// ==========================================
// FTP SERVER LOGIC
// ==========================================

const server = net.createServer((socket) => {
    // Client state
    let clientState = {
        cwd: '/',
        authenticated: false,
        username: null,
        dataType: 'A', // ASCII or Binary
        pasvServer: null
    };

    // Send response to client
    const send = (code, message) => {
        const response = `${code} ${message}\r\n`;
        socket.write(response);
    };

    // Handle incoming data from client
    let buffer = '';
    socket.on('data', (data) => {
        buffer += data.toString();
        
        // FTP commands are terminated by \r\n
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
        if (clientState.pasvServer) clientState.pasvServer.close();
    });

    socket.on('error', (err) => {
        console.error('Socket error:', err.message);
    });

    // Welcome message
    send(220, 'Welcome to the Node.js Scratch FTP Server');

    // ==========================================
    // COMMAND HANDLER
    // ==========================================
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
                // Accept any password for this scratch implementation
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

            case 'CWD':
                const newCwd = arg || '/';
                const resolvedCwd = resolveSandboxPath(clientState.cwd, newCwd);
                if (!resolvedCwd || !fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
                    send(550, 'Directory not found');
                } else {
                    // Update CWD to be relative to ROOT_DIR
                    clientState.cwd = '/' + path.relative(ROOT_DIR, resolvedCwd).replace(/\\/g, '/');
                    if (clientState.cwd === '') clientState.cwd = '/';
                    send(250, 'Directory changed to ' + clientState.cwd);
                }
                break;

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

            case 'MKD':
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

            case 'DELE':
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

            case 'QUIT':
                send(221, 'Goodbye');
                socket.end();
                break;

            default:
                send(502, 'Command not implemented');
        }
    }

    // ==========================================
    // DATA CONNECTION (PASSIVE MODE)
    // ==========================================
    function handlePasv() {
        // Close previous PASV server if it exists
        if (clientState.pasvServer) {
            clientState.pasvServer.close();
        }

        clientState.pasvServer = net.createServer((dataSocket) => {
            // Once client connects to data port, we close the listening server
            clientState.pasvServer.close();
            clientState.pasvServer = null;
            
            // Pass the data socket to the pending transfer
            if (clientState.pendingDataTransfer) {
                clientState.pendingDataTransfer(dataSocket);
                clientState.pendingDataTransfer = null;
            }
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

    // ==========================================
    // FILE TRANSFER COMMANDS
    // ==========================================
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

                let output = '';
                if (files.length === 0) {
                    dataSocket.end();
                    send(226, 'Transfer complete');
                    return;
                }

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
            
            readStream.on('end', () => {
                send(226, 'Transfer complete');
            });
            
            readStream.on('error', () => {
                send(550, 'File read error');
            });
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
            
            writeStream.on('finish', () => {
                send(226, 'Transfer complete');
            });
            
            writeStream.on('error', () => {
                send(550, 'File write error');
            });
        });
    }
});

server.listen(PORT, () => {
    console.log(`FTP Server running on port ${PORT}`);
    console.log(`Root directory: ${ROOT_DIR}`);
    console.log(`Connect using: ftp localhost ${PORT}`);
});