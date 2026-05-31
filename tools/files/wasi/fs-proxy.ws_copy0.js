// /wasi/fs-proxy.ws.js
/**
WASI Preview 2 FS Proxy - CommonJS & VM2 Compatible
Adapted to wasi:filesystem/types@0.2.0 & wasi:filesystem/preopens@0.2.0
Cleaned, syntax-corrected, and aligned with fs-ws.js client protocol
*/
const fs = require('fs');
const { promisify } = require('util');
const { join, resolve, relative, dirname, basename } = require('path');

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
const fsWriteFile = promisify(fs.writeFile);
const fsReadFile = promisify(fs.readFile);

const FS_ROOT = resolve(__dirname, '../../files/wasm-fs');
const SYMLINK_META_DIR = '.wasi-meta';
const SYMLINK_META_EXT = '.symlink.json';
const HARDLINK_META_EXT = '.hardlink.json';

function getSymlinkMetaPath(realPath) {
  return join(dirname(realPath), SYMLINK_META_DIR, basename(realPath) + SYMLINK_META_EXT);
}
function getHardlinkMetaPath(realPath) {
  return join(dirname(realPath), SYMLINK_META_DIR, basename(realPath) + HARDLINK_META_EXT);
}

async function isVirtualSymlink(realPath) {
  try { return (await fsStat(getSymlinkMetaPath(realPath))).isFile(); }
  catch { return false; }
}
async function isVirtualHardlink(realPath) {
  try { return (await fsStat(getHardlinkMetaPath(realPath))).isFile(); }
  catch { return false; }
}

async function readVirtualSymlink(realPath) {
  return JSON.parse(await fsReadFile(getSymlinkMetaPath(realPath), 'utf8')).target;
}
async function readVirtualHardlink(realPath) {
  return JSON.parse(await fsReadFile(getHardlinkMetaPath(realPath), 'utf8')).target;
}

async function writeVirtualSymlink(linkPath, targetPath) {
  const metaPath = getSymlinkMetaPath(linkPath);
  await fsMkdir(dirname(metaPath), { recursive: true });
  await fsWriteFile(metaPath, JSON.stringify({ target: targetPath, type: 'symlink', created: Date.now() }), 'utf8');
}
async function writeVirtualHardlink(linkPath, targetPath) {
  const metaPath = getHardlinkMetaPath(linkPath);
  await fsMkdir(dirname(metaPath), { recursive: true });
  await fsWriteFile(metaPath, JSON.stringify({ target: targetPath, type: 'hardlink', created: Date.now() }), 'utf8');
}

async function cleanupVirtualSymlink(realPath) {
  try {
    await fsUnlink(getSymlinkMetaPath(realPath));
    await fsRmdir(dirname(getSymlinkMetaPath(realPath)));
  } catch {}
}
async function cleanupVirtualHardlink(realPath) {
  try {
    await fsUnlink(getHardlinkMetaPath(realPath));
    await fsRmdir(dirname(getHardlinkMetaPath(realPath)));
  } catch {}
}

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

function resolvePreview2Path(dirFd, virtualPath, state) {
  if (!virtualPath) return null;
  const effectiveFd = (dirFd != null && dirFd > 0) ? dirFd : 3;
  if (virtualPath.startsWith('/')) {
    const fullPath = resolve(join(FS_ROOT, virtualPath));
    const rel = relative(FS_ROOT, fullPath);
    if (rel.startsWith('..') || fullPath !== resolve(join(FS_ROOT, rel))) return null;
    return fullPath;
  }
  let basePath;
  const preopen = state.preopens.find(p => p.fd === effectiveFd);
  if (preopen) basePath = preopen.realPath;
  else if (state.openFiles.has(effectiveFd)) {
    const file = state.openFiles.get(effectiveFd);
    if (file.filetype !== FILE_TYPES.DIRECTORY) return null;
    basePath = file.path;
  } else return null;
  const fullPath = resolve(basePath, virtualPath || '.');
  return fullPath.startsWith(FS_ROOT + '/') || fullPath === FS_ROOT ? fullPath : null;
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
  if (oflags.create && oflags.exclusive) return oflags.truncate ? 'wx+' : 'wx';
  if (oflags.truncate) return 'w+';
  if (fdflags.append) return fdflags.read !== false ? 'a+' : 'a';
  if (oflags.create) return fdflags.read !== false ? 'a+' : 'a';
  const canRead = fdflags.read !== false;
  const canWrite = fdflags.write === true;
  if (canRead && canWrite) return 'r+';
  if (canWrite) return 'r+';
  return 'r';
}

const safeStringify = (obj) => JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v);

function initWasiState(ws) {
  const sock = ws._socket;
  if (!sock._wasiFS) {
    sock._wasiFS = {
      openFiles: new Map(),
      nextFd: 3,
      clientId: ws._socket.remoteAddress || 'unknown',
      preopens: [{ fd: 3, path: '/', realPath: FS_ROOT }]
    };
  }
  return sock._wasiFS;
}

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
      try { await fsMkdir(FS_ROOT, { recursive: true }); } catch {}
      respond(0, { type: 'ready', fsRoot: '/', preopens: preopens.map(p => ({ fd: p.fd, path: p.path })) });
    },
    
    onMessage: async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return respond(0, null, ERROR_CODES.INVAL); }
      
      const { id, cmd, path, dirFd, fd, data, offset, length, size, flags, oflags, newpath, newDirFd, whence, iovs, times } = msg;
      
      if (id === undefined) return respond(msg?.id ?? 0, null, ERROR_CODES.INVAL);
      
      const file = (fd !== undefined) ? getFd(fd) : null;
      if (fd !== undefined && !file && fd >= 3) return respond(id, null, ERROR_CODES.BADF);

      try {
        switch (cmd) {
          case 'get-preopens': 
            respond(id, preopens.map(p => ({ fd: p.fd, path: p.path }))); 
            break;

          case 'open-at': {
            let real = resolvePreview2Path(dirFd ?? 3, path, state);
            if (!real) return respond(id, null, ERROR_CODES.ACCES);
            let targetPath = real;
            
            if (await isVirtualSymlink(real)) {
              const target = await readVirtualSymlink(real);
              targetPath = target.startsWith('/') ? join(FS_ROOT, target) : resolve(dirname(real), target);
              if (!targetPath.startsWith(FS_ROOT + '/') && targetPath !== FS_ROOT) return respond(id, null, ERROR_CODES.ACCES);
            } else if (await isVirtualHardlink(real)) {
              targetPath = await readVirtualHardlink(real);
              if (!targetPath.startsWith(FS_ROOT + '/') && targetPath !== FS_ROOT) return respond(id, null, ERROR_CODES.ACCES);
            }
            
            if (oflags?.create) await fsMkdir(dirname(real), { recursive: true });
            const nodeFlags = mapPreview2FlagsToNodeFlags(oflags, flags);
            let osFd;
            try { osFd = await fsOpen(targetPath, nodeFlags); } catch (err) { return respond(id, null, toErrorCode(err)); }
            const fdNum = state.nextFd++;
            const s = await fsStat(targetPath);
            openFiles.set(fdNum, { 
              osFd, 
              path: targetPath, // Use targetPath so operations act on the actual file
              offset: 0, 
              flags: flags || {}, 
              filetype: await isVirtualSymlink(real) ? FILE_TYPES.SYMBOLIC_LINK : getFiletype(s) 
            });
            respond(id, { fd: fdNum }); 
            break;
          }

          case 'close': {
            if (typeof fd !== 'number' || isNaN(fd)) return respond(id, null, ERROR_CODES.BADF);
            const f = openFiles.get(fd);
            if (f) { await fsClose(f.osFd); openFiles.delete(fd); }
            respond(id, {}); 
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
              if (file.offset !== undefined && offset === undefined) file.offset += bytesWritten;
            }
            respond(id, { bytesWritten: totalWritten }); 
            break;
          }

          case 'seek': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            const w = whence ?? WHENCE.SET;
            let newPos = w === WHENCE.SET ? offset : w === WHENCE.CUR ? (file.offset ?? 0) + offset : (await fsStat(file.path)).size + offset;
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
            let targetPath = path ? resolvePreview2Path(dirFd ?? 3, path, state) : file?.path;
            if (!targetPath) return respond(id, null, ERROR_CODES.NOENT);
            
            if (path && await isVirtualHardlink(targetPath)) {
              targetPath = await readVirtualHardlink(targetPath);
            }
            
            try {
              const isVirtSym = await isVirtualSymlink(targetPath);
              let stats, filetype;
              if (isVirtSym) {
                filetype = FILE_TYPES.SYMBOLIC_LINK;
                try { stats = await fsStat(await readVirtualSymlink(targetPath)); } catch {
                  return respond(id, { 
                    device: 0n, inode: 0n, type: FILE_TYPES.SYMBOLIC_LINK, nlink: 1n, size: 0n, 
                    data_access_timestamp: 0n, data_modification_timestamp: 0n, status_change_timestamp: 0n 
                  });
                }
              } else { 
                stats = await fsLstat(targetPath); 
                filetype = getFiletype(stats, stats.isSymbolicLink()); 
              }
              respond(id, { 
                device: BigInt(stats.dev), 
                inode: BigInt(stats.ino), 
                type: filetype, 
                nlink: BigInt(stats.nlink || 1), 
                size: BigInt(stats.size), 
                data_access_timestamp: BigInt(stats.atimeMs * 1e6), 
                data_modification_timestamp: BigInt(stats.mtimeMs * 1e6), 
                status_change_timestamp: BigInt(stats.ctimeMs * 1e6) 
              });
            } catch (err) { respond(id, null, toErrorCode(err)); } 
            break;
          }

          case 'set-times': {
            let targetPath = path ? resolvePreview2Path(dirFd ?? 3, path, state) : file?.path;
            if (!targetPath) return respond(id, null, ERROR_CODES.NOENT);
            if (path && await isVirtualHardlink(targetPath)) targetPath = await readVirtualHardlink(targetPath);
            
            await fsUtimes(targetPath, 
              times?.atim ? new Date(Number(times.atim) / 1e6) : new Date(),  
              times?.mtim ? new Date(Number(times.mtim) / 1e6) : new Date()
            );
            respond(id, {}); 
            break;
          }

          case 'create-directory-at': {
            const real = resolvePreview2Path(dirFd ?? 3, path, state);
            if (!real) return respond(id, null, ERROR_CODES.ACCES);
            try { await fsMkdir(real, { recursive: false }); } catch (err) { if (err.code !== 'EEXIST') return respond(id, null, toErrorCode(err)); }
            respond(id, {}); 
            break;
          }

          case 'unlink-file-at': {
            const real = resolvePreview2Path(dirFd ?? 3, path, state);
            if (!real) return respond(id, null, ERROR_CODES.ACCES);
            
            if (await isVirtualHardlink(real)) {
              await cleanupVirtualHardlink(real);
              return respond(id, {});
            }
            
            await cleanupVirtualSymlink(real);
            try { if ((await fsLstat(real)).isDirectory()) return respond(id, null, ERROR_CODES.ISDIR); } catch {}
            try { await fsUnlink(real); } catch (err) { if (err.code !== 'ENOENT') return respond(id, null, toErrorCode(err)); }
            respond(id, {}); 
            break;
          }

          case 'remove-directory-at': {
            const real = resolvePreview2Path(dirFd ?? 3, path, state);
            if (!real) return respond(id, null, ERROR_CODES.ACCES);
            try { await fsRmdir(join(real, SYMLINK_META_DIR)); } catch {}
            try { await fsRmdir(real); } catch (err) { return respond(id, null, toErrorCode(err)); }
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
                const isVirtHard = await isVirtualHardlink(entryPath);
                let filetype, inode = 0;
                if (isVirtSym) { filetype = FILE_TYPES.SYMBOLIC_LINK; inode = Date.now(); }
                else if (isVirtHard) { 
                  filetype = FILE_TYPES.REGULAR_FILE; 
                  try {
                    const target = await readVirtualHardlink(entryPath);
                    const s = await fsStat(target);
                    inode = s.ino;
                  } catch { inode = Date.now(); }
                }
                else { const s = await fsLstat(entryPath); filetype = getFiletype(s, s.isSymbolicLink()); inode = s.ino; }
                result.push({ d_next: BigInt(d_next++), inode: BigInt(inode), type: filetype, name: e.name });
              } catch {}
            }
            respond(id, { entries: result }); 
            break;
          }

          case 'rename': {
            const oldP = resolvePreview2Path(dirFd ?? 3, path, state);
            const newP = resolvePreview2Path(newDirFd ?? dirFd ?? 3, newpath, state);
            if (!oldP || !newP) return respond(id, null, ERROR_CODES.ACCES);
            
            if (await isVirtualHardlink(oldP)) {
              const oldMeta = getHardlinkMetaPath(oldP);
              const newMeta = getHardlinkMetaPath(newP);
              try {
                await fsMkdir(dirname(newMeta), { recursive: true });
                await fsRename(oldMeta, newMeta);
                await cleanupVirtualHardlink(oldP);
                return respond(id, {});
              } catch (err) {
                return respond(id, null, toErrorCode(err));
              }
            }
            
            await cleanupVirtualSymlink(oldP);
            try { await fsRename(oldP, newP); } catch (err) { return respond(id, null, toErrorCode(err)); }
            respond(id, {}); 
            break;
          }

          case 'symlink': {
            const target = msg.path || msg.oldPath || msg.target;
            const linkName = msg.newpath || msg.link || msg.newPath;
            const dFd = msg.newDirFd ?? msg.dirFd ?? 3;
            if (!target || !linkName) return respond(id, null, ERROR_CODES.INVAL);
            const linkLocation = resolvePreview2Path(dFd, linkName, state);
            if (!linkLocation) return respond(id, null, ERROR_CODES.ACCES);
            try {
              await fsMkdir(dirname(linkLocation), { recursive: true });
              if (!(await fsStat(linkLocation).catch(() => null))) await fsWriteFile(linkLocation, '', 'utf8');
              await writeVirtualSymlink(linkLocation, target);
              respond(id, {});
            } catch (err) { respond(id, null, toErrorCode(err)); }
            break;
          }

          case 'readlink': {
            const real = resolvePreview2Path(dirFd ?? 3, path, state);
            if (!real) return respond(id, null, ERROR_CODES.NOENT);
            try { 
              respond(id, { target: await isVirtualSymlink(real) ? await readVirtualSymlink(real) : await fsReadlink(real) }); 
            } catch (err) { respond(id, null, toErrorCode(err)); }
            break;
          }

          // ✅ EMULATED HARD LINK LOGIC
          case 'link': {
            const oldP = resolvePreview2Path(dirFd ?? 3, path, state);
            const newP = resolvePreview2Path(newDirFd ?? dirFd ?? 3, newpath, state);
            if (!oldP || !newP) return respond(id, null, ERROR_CODES.ACCES);
            
            let actualTarget = oldP;
            if (await isVirtualHardlink(oldP)) {
              actualTarget = await readVirtualHardlink(oldP);
            }
            
            try { 
              await fsLink(actualTarget, newP); 
              respond(id, {}); 
            } catch (err) {
              // Fallback to virtual hardlink if native fails (e.g. EPERM, ENOSYS on iOS/iSH)
              if (['EPERM', 'ENOSYS', 'EACCES', 'EXDEV'].includes(err.code) || err.message.toLowerCase().includes('hard link')) {
                try {
                  await writeVirtualHardlink(newP, actualTarget);
                  respond(id, {});
                } catch (e) {
                  respond(id, null, toErrorCode(e));
                }
              } else {
                respond(id, null, toErrorCode(err));
              }
            }
            break;
          }

          case 'sync': 
          case 'datasync': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            try { 
              await (cmd === 'sync' ? fsFsync : fsFdatasync)(file.osFd); 
              respond(id, {}); 
            } catch (err) { respond(id, null, toErrorCode(err)); }
            break;
          }

          case 'set-size': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            
            const rawSize = size ?? length ?? msg.newSize ?? msg.fileSize;
            
            let numSize;
            try {
              if (rawSize === undefined || rawSize === null) {
                numSize = 0;
              } else if (typeof rawSize === 'bigint') { 
                numSize = Number(rawSize);
              } else if (typeof rawSize === 'string') {
                const cleaned = rawSize.trim().replace(/n$/i, '').trim();
                numSize = Number(cleaned);
              } else if (typeof rawSize === 'object' && rawSize !== null) {
                numSize = Number(rawSize.low ?? rawSize.value ?? rawSize.$numberLong ?? rawSize);
              } else {
                numSize = Number(rawSize); 
              }
            } catch {
              return respond(id, null, ERROR_CODES.INVAL);
            }
            
            if (isNaN(numSize) || numSize < 0 || !Number.isFinite(numSize)) {
              return respond(id, null, ERROR_CODES.INVAL);
            }
            
            numSize = Math.trunc(numSize);
            
            try {
              await fsFtruncate(file.osFd, numSize);
              respond(id, {});
            } catch (err) {
              if (err.code === 'EBADF') return respond(id, null, ERROR_CODES.ACCES);
              respond(id, null, toErrorCode(err));
            }
            break;
          }

          case 'advise': 
          case 'allocate': 
            respond(id, {}); 
            break;

          case 'pread': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            const buf = Buffer.alloc(length || 65536);
            const off = Number(msg.preadOffset ?? 0);
            const { bytesRead } = await fsRead(file.osFd, buf, 0, buf.length, off);
            respond(id, { data: buf.slice(0, bytesRead).toString('base64'), bytesRead }); 
            break;
          }

          case 'pwrite': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            const buf = Buffer.from(data, 'base64');
            const off = Number(msg.pwriteOffset ?? 0);
            const { bytesWritten } = await fsWrite(file.osFd, buf, 0, buf.length, off);
            respond(id, { bytesWritten }); 
            break;
          } 

          case 'metadata-hash': {
            let targetPath = path ? resolvePreview2Path(dirFd ?? 3, path, state) : file?.path;
            if (!targetPath) return respond(id, null, ERROR_CODES.NOENT);
            if (path && await isVirtualHardlink(targetPath)) targetPath = await readVirtualHardlink(targetPath);
            
            try { 
              const s = await fsStat(targetPath);
              respond(id, { hash: { lower: BigInt(s.ino), upper: BigInt(s.dev) } });
            } catch (err) { respond(id, null, toErrorCode(err)); } 
            break;
          }

          case 'get-type': {
            if (!file) return respond(id, null, ERROR_CODES.BADF);
            respond(id, { type: file.filetype }); 
            break;
          }

          default: respond(id, null, ERROR_CODES.NOSYS);
        }
      } catch (err) {
        respond(msg?.id ?? null, null, toErrorCode(err));
      }
    }, 

    onClose: () => {
      for (const [, f] of openFiles) fsClose(f.osFd).catch(() => {});
      openFiles.clear();
      if (ws._socket) delete ws._socket._wasiFS;
    }
  };
};