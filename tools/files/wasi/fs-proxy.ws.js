// do not remove
// /wasi/fs-proxy.ws.js
/**
WASI Preview 2 FS Proxy - CommonJS & VM2 Compatible
Adapted to wasi:filesystem/types@0.2.0 & wasi:filesystem/preopens@0.2.0
Error codes: WASI Preview 2 error-code strings ('no-entry', 'access', etc.)
Flags: Explicit JSON objects instead of bitmasks
Paths: dirFd + relative path resolution with sandbox enforcement
Timestamps: Nanosecond precision per WASI 0.2 spec
Platform workarounds: iOS/mobile ftruncate, symlink unsupported handling
Virtual symlinks: JSON metadata emulation for platforms without symlink support
*/
const fs = require('fs');
const { promisify } = require('util');
const { join, resolve, relative, dirname, basename } = require('path');

// Promisify standard fs functions
const fsOpen = promisify(fs.open);
const fsRead = promisify(fs.read);
const fsWrite = promisify(fs.write);
const fsClose = promisify(fs.close);
const fsMkdir = promisify(fs.mkdir);
const fsUnlink = promisify(fs.unlink);
const fsRmdir = promisify(fs.rmdir);
const fsReaddir = promisify(fs.readdir);
const fsStat = promisify(fs.stat);
const fsLstat = promisify(fs.lstat);
const fsRename = promisify(fs.rename);
const fsSymlink = promisify(fs.symlink);
const fsReadlink = promisify(fs.readlink);
const fsLink = promisify(fs.link);
const fsFsync = promisify(fs.fsync);
const fsFdatasync = promisify(fs.fdatasync);
const fsFtruncate = promisify(fs.ftruncate);
const fsUtimes = promisify(fs.utimes);

// 🔧 FIX: Promisify writeFile and readFile (required for async/await usage)
const fsWriteFile = promisify(fs.writeFile);
const fsReadFile = promisify(fs.readFile);

const FS_ROOT = resolve(__dirname, '../../files/wasm-fs');

// ============================================================================
// Virtual Symlink Emulation (iOS/Mobile Support)
// ============================================================================
const SYMLINK_META_DIR = '.wasi-meta';
const SYMLINK_META_EXT = '.symlink.json';

function getSymlinkMetaPath(realPath) {
  const dir = dirname(realPath);
  const name = basename(realPath);
  return join(dir, SYMLINK_META_DIR, name + SYMLINK_META_EXT);
}

async function isVirtualSymlink(realPath) {
  try {
    const metaPath = getSymlinkMetaPath(realPath);
    const metaStats = await fsStat(metaPath);
    return metaStats.isFile();
  } catch {
    return false;
  }
}

async function readVirtualSymlink(realPath) {
  const metaPath = getSymlinkMetaPath(realPath);
  // 🔧 FIX: Use promisified fsReadFile
  const content = await fsReadFile(metaPath, 'utf8');
  const meta = JSON.parse(content);
  return meta.target;
}

async function writeVirtualSymlink(linkPath, targetPath) {
  const metaPath = getSymlinkMetaPath(linkPath);
  await fsMkdir(dirname(metaPath), { recursive: true });
  const meta = { target: targetPath, type: 'symlink', created: Date.now() };
  // 🔧 FIX: Use promisified fsWriteFile
  await fsWriteFile(metaPath, JSON.stringify(meta), 'utf8');
}

// 🔧 FIX: Cleanup directory if empty
async function cleanupVirtualSymlink(realPath) {
  try {
    const metaPath = getSymlinkMetaPath(realPath);
    await fsUnlink(metaPath);
    
    // 🔧 FIX: Try to remove the .wasi-meta directory if it's now empty
    // This prevents ENOTEMPTY errors later during directory removal
    const metaDir = dirname(metaPath);
    await fsRmdir(metaDir); 
  } catch (e) { 
    // ignore errors (e.g., directory not empty yet or already removed)
  }
}

// ============================================================================
// WASI Preview 2 Constants
// ============================================================================
const ERROR_CODES = {
  OK: null, ACCES: 'access', WOULD_BLOCK: 'would-block', BADF: 'bad-descriptor',
  BUSY: 'busy', EXIST: 'exist', FILE_TOO_LARGE: 'file-too-large', INVAL: 'invalid',
  IO: 'io', ISDIR: 'is-directory', NOTDIR: 'not-directory', NOENT: 'no-entry',
  NOTEMPTY: 'not-empty', NOSYS: 'unsupported', PERM: 'access'
};

const FILE_TYPES = {
  UNKNOWN: 'unknown', BLOCK_DEVICE: 'block-device', CHARACTER_DEVICE: 'character-device',
  DIRECTORY: 'directory', REGULAR_FILE: 'regular-file', SYMBOLIC_LINK: 'symbolic-link',
  SOCKET_DGRAM: 'socket-dgram', SOCKET_STREAM: 'socket-stream'
};

const WHENCE = { SET: 0, CUR: 1, END: 2 };

// ============================================================================
// Helper Functions
// ============================================================================
function resolvePreview2Path(dirFd, virtualPath, state) {
  if (!virtualPath) {
    console.warn(`[WASI2-FS] resolvePreview2Path: virtualPath is empty/null`);
    return null;
  }

  // Fix: WASI tests often pass 0 or -1 (AT_FDCWD). Map them to preopen FD 3.
  const effectiveFd = (dirFd != null && dirFd > 0) ? dirFd : 3;

  if (virtualPath.startsWith('/')) {
    const fullPath = resolve(join(FS_ROOT, virtualPath));
    const rel = relative(FS_ROOT, fullPath);
    if (rel.startsWith('..') || fullPath !== resolve(join(FS_ROOT, rel))) {
      console.warn(`[WASI2-FS] Sandbox escape: ${virtualPath}`);
      return null;
    }
    return fullPath;
  }

  let basePath;
  const preopen = state.preopens.find(p => p.fd === effectiveFd);
  if (preopen) {
    basePath = preopen.realPath;
  } else if (state.openFiles.has(effectiveFd)) {
    const file = state.openFiles.get(effectiveFd);
    if (file.filetype !== FILE_TYPES.DIRECTORY) {
      console.warn(`[WASI2-FS] FD ${effectiveFd} is not a directory`);
      return null;
    }
    basePath = file.path;
  } else {
    console.warn(`[WASI2-FS] Invalid or closed FD: ${effectiveFd}`);
    return null;
  }

  const fullPath = resolve(basePath, virtualPath || '.');
  if (!fullPath.startsWith(FS_ROOT + '/') && fullPath !== FS_ROOT) {
    console.warn(`[WASI2-FS] Resolved path escapes sandbox: ${fullPath}`);
    return null;
  }
  return fullPath;
}

function toErrorCode(err) {
  if (!err) return ERROR_CODES.OK;
  const map = {
    ENOENT: ERROR_CODES.NOENT, EACCES: ERROR_CODES.ACCES, EBADF: ERROR_CODES.BADF,
    EISDIR: ERROR_CODES.ISDIR, ENOTDIR: ERROR_CODES.NOTDIR, EEXIST: ERROR_CODES.EXIST,
    ENOTEMPTY: ERROR_CODES.NOTEMPTY, EINVAL: ERROR_CODES.INVAL, EIO: ERROR_CODES.IO,
    EPERM: ERROR_CODES.PERM, ENOSYS: ERROR_CODES.NOSYS, EXDEV: ERROR_CODES.NOSYS
  };
  return map[err.code] || ERROR_CODES.IO;
}

function getFiletype(stats, isSymlink = false) {
  if (isSymlink) return FILE_TYPES.SYMBOLIC_LINK;
  if (!stats) return FILE_TYPES.UNKNOWN;
  if (stats.isDirectory()) return FILE_TYPES.DIRECTORY;
  if (stats.isFile()) return FILE_TYPES.REGULAR_FILE;
  if (stats.isCharacterDevice()) return FILE_TYPES.CHARACTER_DEVICE;
  if (stats.isBlockDevice()) return FILE_TYPES.BLOCK_DEVICE;
  if (stats.isSocket()) return FILE_TYPES.SOCKET_STREAM;
  return FILE_TYPES.UNKNOWN;
}

function mapPreview2FlagsToNodeFlags(oflags = {}, fdflags = {}) {
  let nodeFlags = 'r';
  if (oflags.create) nodeFlags = oflags.exclusive ? 'wx' : 'a';
  if (oflags.truncate) nodeFlags = 'w+';
  if (fdflags.append) nodeFlags = 'a';
  if (!fdflags.read && fdflags.write && !nodeFlags.includes('w')) nodeFlags = 'w';
  if (fdflags.read && !fdflags.write && !nodeFlags.includes('r')) nodeFlags = 'r';
  return nodeFlags || 'r';
}

const safeStringify = (obj) => JSON.stringify(obj, (_, v) =>
  typeof v === 'bigint' ? v.toString() : v
);

function initWasiState(ws) {
  const sock = ws._socket;
  if (!sock._wasiFS) {
    sock._wasiFS = {
      openFiles: new Map(), nextFd: 3,
      clientId: ws._socket.remoteAddress || 'unknown',
      preopens: [{ fd: 3, path: '/', realPath: FS_ROOT }]
    };
    globalThis._wasiFSState = sock._wasiFS;
    console.log(`[WASI2-FS] ${sock._wasiFS.clientId} ✅ State initialized`);
  }
  return sock._wasiFS;
}

// ============================================================================
// WebSocket Handler
// ============================================================================
module.exports.handler = function(ws, req) {
  const state = initWasiState(ws);
  const { openFiles, preopens } = state;
  const clientId = state.clientId;

  const respond = (reqId, result = null, error = ERROR_CODES.OK) => {
    if (ws.readyState === 1) ws.send(safeStringify({ id: reqId, result, error }));
  };

  const getFd = (fd) => (fd < 3) ? { std: true, fd } : openFiles.get(fd);

  return {
    onOpen: async () => {
      if (state.onOpenCalled) return;
      state.onOpenCalled = true;
      console.log(`[WASI2-FS] ${clientId} onOpen`);
      try { await fsMkdir(FS_ROOT, { recursive: true }); } catch (e) {}
      respond(0, { type: 'ready', fsRoot: '/', preopens: preopens.map(p => ({ fd: p.fd, path: p.path })) });
    },

    onMessage: async (raw) => {
      let msg = null;
      try {
        msg = JSON.parse(raw);
        const { id, cmd, path, dirFd, fd, data, offset, length, flags, oflags, newpath, newDirFd, whence, iovs, times } = msg;

        if (id === undefined) return respond(msg?.id ?? 0, null, ERROR_CODES.INVAL);
        const file = (fd !== undefined) ? getFd(fd) : null;
        // 🔧 FIX: Fixed syntax error "&&"
        if (fd !== undefined && !file && fd >= 3) return respond(id, null, ERROR_CODES.BADF);

        switch (cmd) {
          case 'get-preopens':
            respond(id, preopens.map(p => ({ fd: p.fd, path: p.path })));
            break;

          case 'open-at': {
            const real = resolvePreview2Path(dirFd ?? 3, path, state);
            // 🔧 FIX: Fixed syntax error "null"
            if (!real) return respond(id, null, ERROR_CODES.ACCES);

            let targetPath = real;
            if (await isVirtualSymlink(real)) {
              const target = await readVirtualSymlink(real);
              // 🔧 FIX: Fixed syntax error "targetPath"
              targetPath = target.startsWith('/') 
                ? join(FS_ROOT, target) 
                : resolve(dirname(real), target);
              if (!targetPath.startsWith(FS_ROOT + '/') && targetPath !== FS_ROOT) {
                return respond(id, null, ERROR_CODES.ACCES);
              }
            }

            if (oflags?.create) await fsMkdir(dirname(real), { recursive: true });
            const nodeFlags = mapPreview2FlagsToNodeFlags(oflags, flags);
            let osFd;
            try { 
              // 🔧 FIX: Fixed syntax error "err"
              osFd = await fsOpen(targetPath, nodeFlags); 
            }
            catch (err) { return respond(id, null, toErrorCode(err)); }

            const fdNum = state.nextFd++;
            const s = await fsStat(targetPath);
            // 🔧 FIX: Fixed syntax error "isVirtualSymlink"
            const isVirtSym = await isVirtualSymlink(real);
            openFiles.set(fdNum, { 
              osFd, 
              path: real, 
              offset: 0, 
              flags: flags || {}, 
              filetype: isVirtSym ? FILE_TYPES.SYMBOLIC_LINK : getFiletype(s) 
            });
            respond(id, { fd: fdNum });
            break;
          }

          case 'close': {
            if (typeof fd !== 'number' || isNaN(fd)) return respond(id, null, ERROR_CODES.BADF);
            const f = openFiles.get(fd);
            if (f) { await fsClose(f.osFd); openFiles.delete(fd); }
            respond(id, {});
            // 🔧 FIX: Fixed syntax error "break"
            break;
          }

          case 'read': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            const bufs = iovs || [{ data: '', len: length ?? 65536 }];
            let totalRead = 0, results = [];
            for (const iov of bufs) {
              const buf = Buffer.alloc(iov.len);
              const readOffset = offset !== undefined ? offset : (file.offset ?? 0);
              const { bytesRead } = await fsRead(file.osFd, buf, 0, buf.length, readOffset);
              if (bytesRead === 0) break;
              results.push(buf.slice(0, bytesRead).toString('base64'));
              totalRead += bytesRead;
              // 🔧 FIX: Fixed syntax error "&&"
              if (file.offset !== undefined && offset === undefined) file.offset += bytesRead;
            }
            respond(id, { data: results, bytesRead: totalRead });
            break;
          }

          case 'write': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            const bufs = iovs || [{ data, len: Buffer.from(data, 'base64').length }];
            let totalWritten = 0;
            for (const iov of bufs) {
              const buf = Buffer.from(iov.data || data, 'base64');
              const writeOffset = offset !== undefined ? offset : (file.offset ?? 0);
              const { bytesWritten } = await fsWrite(file.osFd, buf, 0, buf.length, writeOffset);
              totalWritten += bytesWritten;
              // 🔧 FIX: Fixed syntax error "&&"
              if (file.offset !== undefined && offset === undefined) file.offset += bytesWritten;
            }
            respond(id, { bytesWritten: totalWritten });
            break;
          }

          case 'seek': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            const w = whence ?? WHENCE.SET;
            let newPos;
            if (w === WHENCE.SET) newPos = offset;
            else if (w === WHENCE.CUR) newPos = (file.offset ?? 0) + offset;
            else if (w === WHENCE.END) { const s = await fsStat(file.path); newPos = s.size + offset; }
            else return respond(id, null, ERROR_CODES.INVAL);
            if (newPos < 0) return respond(id, null, ERROR_CODES.INVAL);
            file.offset = newPos;
            respond(id, { offset: BigInt(newPos) });
            break;
          }

          case 'tell': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            respond(id, { offset: BigInt(file.offset ?? 0) });
            break;
          }

          case 'stat': {
            // 🔧 FIX: Fixed syntax error "targetPath"
            const targetPath = path ? resolvePreview2Path(dirFd ?? 3, path, state) : file?.path;
            if (!targetPath) return respond(id, null, ERROR_CODES.NOENT);

            try {
              const isVirtSym = await isVirtualSymlink(targetPath);
              let stats, filetype;

              if (isVirtSym) {
                filetype = FILE_TYPES.SYMBOLIC_LINK;
                try {
                  const target = await readVirtualSymlink(targetPath);
                  const resolved = target.startsWith('/') 
                    ? join(FS_ROOT, target) 
                    : resolve(dirname(targetPath), target);
                  stats = await fsStat(resolved);
                } catch {
                  const now = Date.now();
                  return respond(id, {
                    device: BigInt(0), inode: BigInt(0), type: FILE_TYPES.SYMBOLIC_LINK,
                    nlink: BigInt(1), size: BigInt(0),
                    data_access_timestamp: BigInt(now * 1e6),
                    data_modification_timestamp: BigInt(now * 1e6),
                    status_change_timestamp: BigInt(now * 1e6)
                  });
                }
              } else {
                stats = await fsLstat(targetPath);
                filetype = getFiletype(stats, stats.isSymbolicLink());
              }

              respond(id, {
                device: BigInt(stats.dev), inode: BigInt(stats.ino), type: filetype,
                nlink: BigInt(stats.nlink || 1), size: BigInt(stats.size),
                data_access_timestamp: BigInt(stats.atimeMs * 1e6),
                data_modification_timestamp: BigInt(stats.mtimeMs * 1e6),
                status_change_timestamp: BigInt(stats.ctimeMs * 1e6)
              });
            } catch (err) {
              return respond(id, null, toErrorCode(err));
            }
            break;
          }

          case 'set-times': {
            // 🔧 FIX: Fixed syntax error "resolvePreview2Path"
            const targetPath = path ? resolvePreview2Path(dirFd ?? 3, path, state) : file?.path;
            if (!targetPath) return respond(id, null, ERROR_CODES.NOENT);
            // 🔧 FIX: Fixed syntax error "times"
            const atime = times?.atim !== undefined ? Number(times.atim) / 1e6 : new Date();
            const mtime = times?.mtim !== undefined ? Number(times.mtim) / 1e6 : new Date();
            await fsUtimes(targetPath, atime, mtime);
            // 🔧 FIX: Fixed syntax error "respond"
            respond(id, {});
            break;
          }

          case 'create-directory-at': {
            const real = resolvePreview2Path(dirFd ?? 3, path, state);
            // 🔧 FIX: Fixed syntax error "null"
            if (!real) return respond(id, null, ERROR_CODES.ACCES);
            try { await fsMkdir(real, { recursive: false }); }
            catch (err) { if (err.code !== 'EEXIST') return respond(id, null, toErrorCode(err)); }
            // 🔧 FIX: Fixed syntax error "respond"
            respond(id, {});
            break;
          }

          case 'unlink-file-at': {
            const real = resolvePreview2Path(dirFd ?? 3, path, state);
            // 🔧 FIX: Fixed syntax error "respond"
            if (!real) return respond(id, null, ERROR_CODES.ACCES);

            await cleanupVirtualSymlink(real);

            try {
              const isVirtSym = await isVirtualSymlink(real);
              let isDir = false;
              if (isVirtSym) {
                const target = await readVirtualSymlink(real);
                const resolved = target.startsWith('/') 
                  ? join(FS_ROOT, target)  
                  : resolve(dirname(real), target);
                try {
                  const s = await fsStat(resolved);
                  isDir = s.isDirectory();
                } catch { /* target might not exist */ }
              } else {
                try {
                  const s = await fsLstat(real);
                  isDir = s.isDirectory();
                } catch (err) {
                  if (err.code === 'ENOENT') return respond(id, {});
                  throw err; 
                }
              }
              // 🔧 FIX: Fixed syntax error "ERROR_CODES.ISDIR"
              if (isDir) return respond(id, null, ERROR_CODES.ISDIR);
            } catch (err) {
              if (err.code !== 'ENOENT') return respond(id, null, toErrorCode(err));
            }

            try {
              await fsUnlink(real);
            } catch (err) {
              if (err.code !== 'ENOENT') return respond(id, null, toErrorCode(err));
            }
            respond(id, {});
            break;
          }

          case 'remove-directory-at': {
            const real = resolvePreview2Path(dirFd ?? 3, path, state);
            // 🔧 FIX: Fixed syntax error "null"
            if (!real) return respond(id, null, ERROR_CODES.ACCES);
            
            // 🔧 FIX: Cleanup the hidden .wasi-meta directory if it exists
            // This prevents ENOTEMPTY errors when the parent is deleted
            const metaDir = join(real, SYMLINK_META_DIR);
            try {
              await fsRmdir(metaDir);
            } catch (err) {
              if (err.code !== 'ENOENT') console.debug(`[WASI2-FS] Meta dir cleanup warning: ${err.code}`);
            }

            await fsRmdir(real);
            // 🔧 FIX: Fixed syntax error "respond"
            respond(id, {});
            break;
          }

          case 'readdir': {
            const targetPath = path ? resolvePreview2Path(dirFd ?? 3, path, state) : file?.path;
            if (!targetPath) return respond(id, null, ERROR_CODES.NOENT);

            const entries = await fsReaddir(targetPath, { withFileTypes: true });
            const result = [];
            let d_next = 1;

            for (const e of entries) {
              if (e.name === SYMLINK_META_DIR) continue;

              const entryPath = join(targetPath, e.name);

              try {
                const isVirtSym = await isVirtualSymlink(entryPath);
                let filetype, inode = 0;

                if (isVirtSym) {
                  filetype = FILE_TYPES.SYMBOLIC_LINK;
                  inode = Date.now();
                } else {
                  const s = await fsLstat(entryPath);
                  const isNativeSym = s.isSymbolicLink();
                  filetype = getFiletype(s, isNativeSym);
                  inode = s.ino;
                }

                // 🔧 FIX: Fixed syntax error "BigInt"
                result.push({ 
                  d_next: BigInt(d_next++), 
                  inode: BigInt(inode), 
                  type: filetype, 
                  name: e.name 
                });
              } catch (err) {
                // 🔧 FIX: Fixed syntax error "!=="
                if (err.code !== 'ENOENT') console.warn(`[WASI2-FS] readdir stat error: ${err.code}`);
                continue;
              }
            }
            respond(id, { entries: result });
            break;
          } 

          case 'rename': {
            const oldP = resolvePreview2Path(dirFd ?? 3, path, state);
            const newP = resolvePreview2Path(newDirFd ?? dirFd ?? 3, newpath, state);
            if (!oldP || !newP) return respond(id, null, ERROR_CODES.ACCES);

            await cleanupVirtualSymlink(oldP);
            await fsRename(oldP, newP);
            // 🔧 FIX: Fixed syntax error "respond"
            respond(id, {});
            break;
          }

          // 🔧 FIX: Fixed syntax error "remove-directory-at" key
          // Also applied proper symlink handling logic (oldPath, fsWriteFile)
          case 'symlink': {
            // 🔍 DEBUG: Log the EXACT message from the test
            console.log(`[WASI2-FS] 🔍 SYMLINK MSG:`, JSON.stringify({
              id: msg.id, cmd: msg.cmd, path: msg.path, newpath: msg.newpath,
              newDirFd: msg.newDirFd, dirFd: msg.dirFd, link: msg.link, newPath: msg.newPath
            }, null, 2));

            // WASI 0.2: symlink(old-path, new-dir-fd, new-path)
            // 🔧 FIX: Accept multiple field names for target (old-path)
            const target = msg.path || msg.oldPath || msg.target;
            // 🔧 FIX: Accept multiple field names for link name (new-path)
            const linkName = msg.newpath || msg.link || msg.newPath;
            const dirFd = msg.newDirFd ?? msg.dirFd ?? 3;

            console.debug(`[WASI2-FS] symlink params: target="${target}", linkName="${linkName}", dirFd=${dirFd}`);

            // 🔧 FIX: Validate BOTH fields explicitly
            if (!target || target.trim() === "") {
              console.warn(`[WASI2-FS] ❌ symlink: missing or empty target`);
              return respond(id, null, ERROR_CODES.INVAL);
            }
            if (!linkName || linkName.trim() === "") {
              console.warn(`[WASI2-FS] ❌ symlink: missing or empty linkName`);
              return respond(id, null, ERROR_CODES.INVAL);
            }

            const linkLocation = resolvePreview2Path(dirFd, linkName, state);
            if (!linkLocation) {
              console.warn(`[WASI2-FS] ❌ symlink: path resolution failed for "${linkName}"`);
              return respond(id, null, ERROR_CODES.ACCES);
            }

            try {
              await fsMkdir(dirname(linkLocation), { recursive: true });
              
              // iOS: Skip placeholder write if restricted
              try {
                const exists = await fsStat(linkLocation).catch(() => null);
                if (!exists) {
                  // 🔧 FIX: Use promisified fsWriteFile
                  await fsWriteFile(linkLocation, '', 'utf8');
                }
              } catch (writeErr) {
                console.debug(`[WASI2-FS] Placeholder skipped: ${writeErr.code}`);
              }

              // 🔧 FIX: Write the ACTUAL target, NO fallback to '.'
              await writeVirtualSymlink(linkLocation, target);
              
              // 🔍 Confirm metadata file location
              console.debug(`[WASI2-FS] ✅ Symlink: ${linkLocation} -> ${target}`);
              console.debug(`[WASI2-FS] ✅ Metadata: ${getSymlinkMetaPath(linkLocation)}`);
              
              respond(id, {});
            } catch (err) {
              console.warn(`[WASI2-FS] Virtual symlink failed: ${err.code}`);
              return respond(id, null, toErrorCode(err));
            }
            break;
          }

          case 'readlink': {
            const real = resolvePreview2Path(dirFd ?? 3, path, state);
            // 🔧 FIX: Fixed syntax error "null"
            if (!real) return respond(id, null, ERROR_CODES.NOENT);

            try {
              if (await isVirtualSymlink(real)) {
                const target = await readVirtualSymlink(real);
                respond(id, { target });
              } else {
                const target = await fsReadlink(real);
                respond(id, { target });
              }
            } catch (err) {
              // 🔧 FIX: Fixed syntax error "EINVAL"
              if (err.code === 'EINVAL' || err.code === 'ENOENT') {
                return respond(id, null, ERROR_CODES.INVAL);
              }
              return respond(id, null, toErrorCode(err));
            }
            // 🔧 FIX: Fixed syntax error "break"
            break;
          }

          case 'link': {
            return respond(id, null, ERROR_CODES.NOSYS);
          }

          case 'sync':
          case 'datasync': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            await (cmd === 'sync' ? fsFsync : fsFdatasync)(file.osFd);
            respond(id, {});
            break;
          }

          case 'set-size': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            let numSize;
            try {
              if (typeof length === 'string') numSize = Number(BigInt(length));
              else if (typeof length === 'bigint') numSize = Number(length);
              else numSize = Number(length ?? 0);
            } catch { return respond(id, null, ERROR_CODES.INVAL); }
            if (isNaN(numSize) || numSize < 0) return respond(id, null, ERROR_CODES.INVAL);
            try {
              await fsFtruncate(file.osFd, numSize);
              respond(id, {});
            } catch (err) {
              // 🔧 FIX: Fixed syntax error "&&"
              if (err.code === 'EINVAL' && file.path) {
                try {
                  await fsClose(file.osFd);
                  const tmpFd = await fsOpen(file.path, 'r+');
                  await fsFtruncate(tmpFd, numSize);
                  await fsClose(tmpFd);
                  file.osFd = await fsOpen(file.path, mapPreview2FlagsToNodeFlags({}, file.flags || {}));
                  respond(id, {});
                  return;
                } catch (fallbackErr) { return respond(id, null, toErrorCode(fallbackErr)); }
              }
              return respond(id, null, toErrorCode(err));
            }
            break;
          }

          case 'advise':
          case 'allocate':
            respond(id, {});
            break;

          default:
            console.error(`[WASI2-FS] ❌ Unknown cmd: "${cmd}"`);
            respond(id, null, ERROR_CODES.NOSYS);
        }
      } catch (err) {
        console.error(`[WASI2-FS] 💥 ${clientId} ERROR:`, err);
        respond(msg?.id ?? null, null, toErrorCode(err));
      }
    },

    // 🔧 FIX: Fixed syntax error "=>"
    onClose: () => {
      console.log(`[WASI2-FS] ${clientId} closed. Cleaning up ${openFiles.size} FDs`);
      for (const [fId, f] of openFiles) {
        // 🔧 FIX: Fixed syntax error "=>"
        fsClose(f.osFd).catch(e => console.error(`[WASI2-FS] Error closing FD ${fId}:`, e));
      }
      if (ws._socket) delete ws._socket._wasiFS;
    }
  };
};