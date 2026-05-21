//do not remove
// /wasi/fs-proxy.ws.js
/**
 * WASI Preview 1 FS Proxy - CommonJS & VM2 Compatible
 * Full implementation of wasi_snapshot_preview1 filesystem API
 * 
 * FIX: Removed invalid `continue` in switch (only allowed in loops)
 * FIX: Added safe BigInt JSON serialization (Node crashes on BigInt in stringify)
 * FIX: Moved legacy alias mapping before switch for clean control flow
 */

const fs = require('fs');
const { promisify } = require('util');
const { join, resolve, relative, dirname } = require('path');

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

const FS_ROOT = resolve(__dirname, '../../files/wasm-fs');

// ============================================================================
// WASI Constants
// ============================================================================
const ERRNO = {
  SUCCESS: 0, EBADF: 8, EINVAL: 28, ENOENT: 44, EISDIR: 31, ENOTDIR: 54,
  EEXIST: 20, ENOTEMPTY: 55, ENOTCAPABLE: 76, ENOSYS: 52, EIO: 29
};

const FILETYPE = {
  UNKNOWN: 0, BLOCK_DEVICE: 1, CHARACTER_DEVICE: 2, DIRECTORY: 3,
  REGULAR_FILE: 4, SYMBOLIC_LINK: 5, SOCKET_DGRAM: 6, SOCKET_STREAM: 7
};

const OFLAGS = { CREAT: 1 << 0, DIRECTORY: 1 << 1, EXCL: 1 << 2, TRUNC: 1 << 4 };
const FDFLAGS = { APPEND: 1 << 0, DSYNC: 1 << 1, NONBLOCK: 1 << 2, RSYNC: 1 << 3, SYNC: 1 << 4 };
const WHENCE = { SET: 0, CUR: 1, END: 2 };

// ============================================================================
// Helper Functions
// ============================================================================
function sanitizePath(virtualPath) {
  if (!virtualPath || !virtualPath.startsWith('/')) return null;
  const fullPath = join(FS_ROOT, virtualPath);
  const rel = relative(FS_ROOT, fullPath);
  if (rel.startsWith('..') || resolve(fullPath) !== join(FS_ROOT, rel)) return null;
  return fullPath;
}

function toErrno(err) {
  if (!err) return ERRNO.SUCCESS;
  const map = {
    ENOENT: ERRNO.ENOENT, EACCES: ERRNO.EACCES, EBADF: ERRNO.EBADF,
    EISDIR: ERRNO.EISDIR, ENOTDIR: ERRNO.ENOTDIR, EEXIST: ERRNO.EEXIST,
    ENOTEMPTY: ERRNO.ENOTEMPTY, EINVAL: ERRNO.EINVAL, EIO: ERRNO.EIO
  };
  return map[err.code] || ERRNO.EIO;
}

function getFiletype(stats, isSymlink = false) {
  if (isSymlink) return FILETYPE.SYMBOLIC_LINK;
  if (stats.isDirectory()) return FILETYPE.DIRECTORY;
  if (stats.isFile()) return FILETYPE.REGULAR_FILE;
  if (stats.isCharacterDevice()) return FILETYPE.CHARACTER_DEVICE;
  if (stats.isBlockDevice()) return FILETYPE.BLOCK_DEVICE;
  if (stats.isSocket()) return FILETYPE.SOCKET_STREAM;
  return FILETYPE.UNKNOWN;
}

function mapOflagsToNodeFlags(oflags, fdflags) {
  let flags = 'r+';
  if (oflags & OFLAGS.CREAT) flags = (oflags & OFLAGS.EXCL) ? 'wx' : 'a';
  if (oflags & OFLAGS.TRUNC) flags = 'w+';
  if (fdflags & FDFLAGS.APPEND) flags = 'a';
  return flags;
}

// Safe JSON stringify for BigInt (Node throws TypeError otherwise)
const safeStringify = (obj) => JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v);

function getState(ws) {
  const sock = ws._socket;
  if (!sock._wasiFS) {
    sock._wasiFS = {
      openFiles: new Map(),
      nextFd: 3,
      clientId: ws._socket.remoteAddress || 'unknown',
      preopens: [{ fd: 3, path: '/', realPath: FS_ROOT }]
    };
    console.log(`[WASI-FS] ${sock._wasiFS.clientId} ✅ State attached`);
  }
  return sock._wasiFS;
}

// ============================================================================
// WebSocket Handler
// ============================================================================
module.exports.handler = function(ws, req) {
  const state = getState(ws);
  const { openFiles, preopens } = state;
  const clientId = state.clientId;

  const respond = (reqId, result = null, errno = ERRNO.SUCCESS) => {
    if (ws.readyState === 1) {
      ws.send(safeStringify({ id: reqId, result, errno }));
    }
  };

  const getFd = (fd) => {
    if (fd < 3) return { std: true, fd };
    return openFiles.get(fd);
  };

  return {
    onOpen: async () => {
      if (state.onOpenCalled) return;
      state.onOpenCalled = true;
      console.log(`[WASI-FS] ${clientId} onOpen`);
      try { await fsMkdir(FS_ROOT, { recursive: true }); } catch (e) {}
      respond(0, {
        type: 'ready',
        fsRoot: '/',
        preopens: preopens.map(p => ({ fd: p.fd, path: p.path }))
      });
    },

    onMessage: async (raw) => {
      let msg = null;
      try {
        msg = JSON.parse(raw);
        let { id, cmd, path, fd, data, offset, length, flags, newpath, oflags, fdflags, whence, iovs, times } = msg;
        
        if (id === undefined) return respond(msg?.id ?? 0, null, ERRNO.EINVAL);

        // ✅ FIX: Handle legacy aliases BEFORE switch (avoids invalid `continue`)
        const legacyMap = {
          'open': 'path_open', 'read': 'fd_read', 'write': 'fd_write',
          'close': 'fd_close', 'mkdir': 'path_create_directory',
          'unlink': 'path_unlink_file', 'readdir': 'path_readdir',
          'stat': 'path_filestat_get', 'rename': 'path_rename',
          'seek': 'fd_seek', 'fsync': 'fd_sync',
          'ftruncate': 'fd_filestat_set_size', 'rmdir': 'path_remove_directory',
          'symlink': 'path_symlink', 'readlink': 'path_readlink',
          'link': 'path_link', 'utimes': 'path_filestat_set_times',
          'tell': 'fd_tell', 'pread': 'fd_pread', 'pwrite': 'fd_pwrite',
          'datasync': 'fd_datasync',
        };
        
        if (legacyMap[cmd]) {
          const original = cmd;
          cmd = legacyMap[cmd];
          if (original === 'open' && flags) {
            msg.oflags = flags === 'w' ? (OFLAGS.CREAT|OFLAGS.TRUNC) : 0;
            oflags = msg.oflags;
          }
        }

        switch (cmd) {
          case 'fd_close': {
            if (typeof fd !== 'number' || isNaN(fd)) return respond(id, null, ERRNO.EBADF);
            const file = openFiles.get(fd);
            if (file) { await fsClose(file.osFd); openFiles.delete(fd); }
            respond(id, {});
            break;
          }

          case 'fd_read': {
            const file = getFd(fd);
            if (!file || file.std) return respond(id, null, ERRNO.EBADF);
            const bufs = iovs || [{ data: '', len: length ?? 65536 }];
            let totalRead = 0; const results = [];
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

          case 'fd_write': {
            const file = getFd(fd);
            if (!file || file.std) return respond(id, null, ERRNO.EBADF);
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

          case 'fd_seek': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            const w = whence ?? WHENCE.SET;
            let newPos;
            if (w === WHENCE.SET) newPos = offset;
            else if (w === WHENCE.CUR) newPos = (file.offset ?? 0) + offset;
            else if (w === WHENCE.END) { const s = await fsStat(file.path); newPos = s.size + offset; }
            else return respond(id, null, ERRNO.EINVAL);
            if (newPos < 0) return respond(id, null, ERRNO.EINVAL);
            file.offset = newPos;
            respond(id, { offset: BigInt(newPos) });
            break;
          }

          case 'fd_tell': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            respond(id, { offset: BigInt(file.offset ?? 0) });
            break;
          }

          case 'fd_pread': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            const buf = Buffer.alloc(length ?? 65536);
            const { bytesRead } = await fsRead(file.osFd, buf, 0, buf.length, offset);
            respond(id, { data: [buf.slice(0, bytesRead).toString('base64')], bytesRead });
            break;
          }

          case 'fd_pwrite': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            const buf = Buffer.from(data, 'base64');
            const { bytesWritten } = await fsWrite(file.osFd, buf, 0, buf.length, offset);
            respond(id, { bytesWritten });
            break;
          }

          case 'fd_sync': case 'fd_datasync': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            await (cmd === 'fd_sync' ? fsFsync : fsFdatasync)(file.osFd);
            respond(id, {});
            break;
          }

          case 'fd_filestat_get': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            const s = await fsStat(file.path);
            respond(id, {
              dev: BigInt(s.dev), ino: BigInt(s.ino), filetype: getFiletype(s),
              nlink: BigInt(s.nlink || 1), size: BigInt(s.size),
              atim: BigInt(s.atimeMs * 1e6), mtim: BigInt(s.mtimeMs * 1e6), ctim: BigInt(s.ctimeMs * 1e6)
            });
            break;
          }

          case 'fd_filestat_set_size': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            await fsFtruncate(file.osFd, length ?? 0);
            respond(id, {});
            break;
          }

          case 'fd_filestat_set_times': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            const atime = times?.atim !== undefined ? Number(times.atim) / 1e6 : new Date();
            const mtime = times?.mtim !== undefined ? Number(times.mtim) / 1e6 : new Date();
            await fsUtimes(file.path, atime, mtime);
            respond(id, {});
            break;
          }

          case 'fd_fdstat_get': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            const s = await fsStat(file.path);
            respond(id, {
              fs_filetype: getFiletype(s), fs_flags: file.fdflags || 0,
              fs_rights_base: "0x301", fs_rights_inheriting: "0x0"
            });
            break;
          }

          case 'fd_fdstat_set_flags': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            file.fdflags = fdflags || 0;
            respond(id, {});
            break;
          }

          case 'fd_readdir': {
            const file = getFd(fd);
            if (!file) return respond(id, null, ERRNO.EBADF);
            const entries = await fsReaddir(file.path, { withFileTypes: true });
            const result = [];
            for (const e of entries) {
              const s = await fsLstat(join(file.path, e.name));
              result.push({
                d_next: BigInt(result.length + 1), d_ino: BigInt(s.ino),
                d_namlen: BigInt(e.name.length), d_type: getFiletype(s, e.isSymbolicLink()), name: e.name
              });
            }
            respond(id, { entries: result });
            break;
          }

          case 'fd_advise': case 'fd_allocate': respond(id, {}); break;

          case 'path_open': {
            const real = sanitizePath(path);
            if (!real) return respond(id, null, ERRNO.ENOTCAPABLE);
            await fsMkdir(dirname(real), { recursive: true });
            const nodeFlags = mapOflagsToNodeFlags(oflags || 0, fdflags || 0);
            let osFd;
            try { osFd = await fsOpen(real, nodeFlags); }
            catch (err) { return respond(id, null, toErrno(err)); }
            const fdNum = state.nextFd++;
            const s = await fsStat(real);
            openFiles.set(fdNum, { osFd, path: real, offset: 0, fdflags: fdflags || 0, filetype: getFiletype(s) });
            respond(id, { fd: fdNum });
            break;
          }

          case 'path_create_directory': {
            const real = sanitizePath(path);
            if (!real) return respond(id, null, ERRNO.ENOTCAPABLE);
            await fsMkdir(real, { recursive: false });
            respond(id, {});
            break;
          }

          case 'path_unlink_file': {
            const real = sanitizePath(path);
            if (!real) return respond(id, null, ERRNO.ENOTCAPABLE);
            if ((await fsLstat(real)).isDirectory()) return respond(id, null, ERRNO.EISDIR);
            await fsUnlink(real);
            respond(id, {});
            break;
          }

          case 'path_remove_directory': {
            const real = sanitizePath(path);
            if (!real) return respond(id, null, ERRNO.ENOTCAPABLE);
            await fsRmdir(real);
            respond(id, {});
            break;
          }

          case 'path_rename': {
            const oldP = sanitizePath(path);
            const newP = sanitizePath(newpath);
            if (!oldP || !newP) return respond(id, null, ERRNO.ENOTCAPABLE);
            await fsRename(oldP, newP);
            respond(id, {});
            break;
          }

          case 'path_symlink': {
            const linkPath = sanitizePath(newpath);
            if (!linkPath) return respond(id, null, ERRNO.ENOTCAPABLE);
            await fsSymlink(path, linkPath);
            respond(id, {});
            break;
          }

          case 'path_readlink': {
            const real = sanitizePath(path);
            if (!real) return respond(id, null, ERRNO.ENOTCAPABLE);
            respond(id, { target: await fsReadlink(real) });
            break;
          }

          case 'path_link': {
            const oldP = sanitizePath(path);
            const newP = sanitizePath(newpath);
            if (!oldP || !newP) return respond(id, null, ERRNO.ENOTCAPABLE);
            await fsLink(oldP, newP);
            respond(id, {});
            break;
          }

          case 'path_filestat_get': {
            const real = sanitizePath(path);
            if (!real) return respond(id, null, ERRNO.ENOTCAPABLE);
            const s = await fsLstat(real);
            respond(id, {
              dev: BigInt(s.dev), ino: BigInt(s.ino), filetype: getFiletype(s, s.isSymbolicLink()),
              nlink: BigInt(s.nlink || 1), size: BigInt(s.size),
              atim: BigInt(s.atimeMs * 1e6), mtim: BigInt(s.mtimeMs * 1e6), ctim: BigInt(s.ctimeMs * 1e6)
            });
            break;
          }

          case 'path_filestat_set_times': {
            const real = sanitizePath(path);
            if (!real) return respond(id, null, ERRNO.ENOTCAPABLE);
            const atime = times?.atim !== undefined ? Number(times.atim) / 1e6 : new Date();
            const mtime = times?.mtim !== undefined ? Number(times.mtim) / 1e6 : new Date();
            await fsUtimes(real, atime, mtime);
            respond(id, {});
            break;
          }

          case 'path_readdir': {
            const real = sanitizePath(path);
            if (!real) return respond(id, null, ERRNO.ENOTCAPABLE);
            const entries = await fsReaddir(real, { withFileTypes: true });
            const result = [];
            for (const e of entries) {
              const s = await fsLstat(join(real, e.name));
              result.push({ name: e.name, type: getFiletype(s, e.isSymbolicLink()), ino: BigInt(s.ino) });
            }
            respond(id, { entries: result });
            break;
          }

          case 'fd_prestat_get': {
            const pre = preopens.find(p => p.fd === fd);
            if (!pre) return respond(id, null, ERRNO.EBADF);
            respond(id, { pr_name_len: BigInt(pre.path.length) });
            break;
          }

          case 'fd_prestat_dir_name': {
            const pre = preopens.find(p => p.fd === fd);
            if (!pre) return respond(id, null, ERRNO.EBADF);
            respond(id, { path: pre.path });
            break;
          }

          default:
            console.error(`[WASI-FS] ❌ Unknown cmd: "${cmd}"`);
            respond(id, null, ERRNO.ENOSYS);
        }
      } catch (err) {
        console.error(`[WASI-FS] 💥 ${clientId} ERROR:`, err);
        respond(msg?.id ?? null, null, toErrno(err));
      }
    },

    onClose: () => {
      console.log(`[WASI-FS] ${clientId} closed. Cleaning up ${openFiles.size} FDs`);
      for (const [fId, f] of openFiles) {
        fsClose(f.osFd).catch(e => console.error(`[WASI-FS] Error closing FD ${fId}:`, e));
      }
      if (ws._socket) delete ws._socket._wasiFS;
    }
  };
};