// /wasi/fs-proxy.ws.js
/**
WASI Preview 2 FS Proxy - Compatible with webserver.js wrapper
Exports: module.exports.handler = function(ws, req) { return { onMessage, onOpen, onClose } }
*/
const fs = require('fs').promises;
const path = require('path');

const FS_ROOT = path.resolve(__dirname, '../../files/wasm-fs');
const PREOPEN_FD = 3;

const ERR = {
  OK: null, ACCES: 'access', BADF: 'bad-descriptor', IO: 'io',
  NOENT: 'no-entry', ISDIR: 'is-directory', NOTDIR: 'not-directory',
  EXIST: 'exist', NOTEMPTY: 'not-empty', NOSYS: 'unsupported'
};

const TYPE = { DIR: 'directory', FILE: 'regular-file', SYMLINK: 'symbolic-link' };

const openFiles = new Map();
let nextFd = 4;

function respond(ws, id, result = null, error = ERR.OK) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ id, result, error }));
  }
}

function resolvePath(virtualPath) {
  if (!virtualPath || virtualPath === '/') return FS_ROOT;
  const clean = virtualPath.replace(/^\/+/, '');
  const full = path.resolve(FS_ROOT, clean);
  return full.startsWith(FS_ROOT + path.sep) || full === FS_ROOT ? full : null;
}

function getFiletype(stats) {
  if (stats.isDirectory()) return TYPE.DIR;
  if (stats.isFile()) return TYPE.FILE;
  if (stats.isSymbolicLink()) return TYPE.SYMLINK;
  return 'unknown';
}

// ✅ Export handler function for webserver.js wrapper
module.exports.handler = function(ws, req) {
  return {
    onOpen: async () => {
      try { await fs.mkdir(FS_ROOT, { recursive: true }); } catch {}
      respond(ws, 0, { type: 'ready', preopens: [{ fd: PREOPEN_FD, path: '/' }] });
    },
    
    onMessage: async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } 
      catch { return respond(ws, 0, null, ERR.IO); }
      
      const { id, cmd, fd, path: virtualPath, length, offset, size, data, oflags, flags, newpath, newDirFd } = msg;
      if (id === undefined) return;

      try {
        switch (cmd) {
          case 'get-type': {
            if (fd === PREOPEN_FD) return respond(ws, id, { type: TYPE.DIR });
            const f = openFiles.get(fd);
            if (!f) return respond(ws, id, null, ERR.BADF);
            respond(ws, id, { type: f.type });
            break;
          }

          case 'get-flags':
            respond(ws, id, {});
            break;

          case 'metadata-hash':
          case 'metadata-hash-at': {
            const target = cmd === 'metadata-hash' 
              ? (fd === PREOPEN_FD ? FS_ROOT : openFiles.get(fd)?.path)
              : resolvePath(virtualPath);
            if (!target) return respond(ws, id, null, ERR.NOENT);
            const stats = await fs.stat(target);
            respond(ws, id, { hash: { lower: BigInt(stats.ino), upper: BigInt(stats.dev) } });
            break;
          }

          case 'stat':
          case 'stat-at': {
            const target = cmd === 'stat'
              ? (fd === PREOPEN_FD ? FS_ROOT : openFiles.get(fd)?.path)
              : resolvePath(virtualPath);
            if (!target) return respond(ws, id, null, ERR.NOENT);
            const stats = await fs.stat(target);
            respond(ws, id, {
              type: getFiletype(stats),
              nlink: BigInt(stats.nlink || 1),
              size: BigInt(stats.size)
            });
            break;
          }

          case 'open-at': {
            const dirPath = fd === PREOPEN_FD ? FS_ROOT : openFiles.get(fd)?.path;
            if (!dirPath) return respond(ws, id, null, ERR.BADF);
            const target = path.resolve(dirPath, virtualPath || '.');
            if (!target.startsWith(FS_ROOT + path.sep) && target !== FS_ROOT) {
              return respond(ws, id, null, ERR.ACCES);
            }
            if (oflags?.create) {
              await fs.mkdir(path.dirname(target), { recursive: true });
            }
            let mode = 'r';
            if (oflags?.create && oflags?.exclusive) mode = oflags.truncate ? 'wx+' : 'wx';
            else if (oflags?.truncate) mode = 'w+';
            else if (flags?.append) mode = flags.read !== false ? 'a+' : 'a';
            else if (flags?.write) mode = 'r+';
            
            try {
              const fh = await fs.open(target, mode);
              const stats = await fh.stat();
              const newFd = nextFd++;
              openFiles.set(newFd, { fh, path: target, type: getFiletype(stats), offset: 0 });
              respond(ws, id, { fd: newFd });
            } catch (e) {
              respond(ws, id, null, e.code === 'ENOENT' ? ERR.NOENT : ERR.IO);
            }
            break;
          }

          case 'read': {
            const f = openFiles.get(fd);
            if (!f || f.type === TYPE.DIR) return respond(ws, id, null, ERR.BADF);
            const len = Number(length ?? 65536);
            const off = offset !== undefined ? Number(offset) : f.offset;
            const buf = Buffer.alloc(len);
            const { bytesRead } = await f.fh.read(buf, 0, len, off);
            if (offset === undefined) f.offset = off + bytesRead;
            respond(ws, id, { 
              data: [buf.slice(0, bytesRead).toString('base64')], 
              bytesRead 
            });
            break;
          }

          case 'write': {
            const f = openFiles.get(fd);
            if (!f || f.type === TYPE.DIR) return respond(ws, id, null, ERR.BADF);
            const buf = Buffer.from(data, 'base64');
            const off = offset !== undefined ? Number(offset) : f.offset;
            const { bytesWritten } = await f.fh.write(buf, 0, buf.length, off);
            if (offset === undefined) f.offset = off + bytesWritten;
            respond(ws, id, { bytesWritten });
            break;
          }

          case 'set-size': {
            const f = openFiles.get(fd);
            if (!f) return respond(ws, id, null, ERR.BADF);
            const newSize = Number(size ?? 0);
            await f.fh.truncate(newSize);
            respond(ws, id, {});
            break;
          }

          case 'read-directory': {
            const dirPath = fd === PREOPEN_FD ? FS_ROOT : openFiles.get(fd)?.path;
            if (!dirPath) return respond(ws, id, null, ERR.BADF);
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            const result = entries
              .filter(e => e.name !== '.wasi-meta')
              .map(e => ({ name: e.name, type: getFiletype(e) }));
            respond(ws, id, { entries: result });
            break;
          }

          case 'create-directory-at': {
            const target = resolvePath(virtualPath);
            if (!target) return respond(ws, id, null, ERR.ACCES);
            await fs.mkdir(target, { recursive: false });
            respond(ws, id, {});
            break;
          }

          case 'unlink-file-at': {
            const target = resolvePath(virtualPath);
            if (!target) return respond(ws, id, null, ERR.ACCES);
            const stats = await fs.lstat(target);
            if (stats.isDirectory()) return respond(ws, id, null, ERR.ISDIR);
            await fs.unlink(target);
            respond(ws, id, {});
            break;
          }

          case 'remove-directory-at': {
            const target = resolvePath(virtualPath);
            if (!target) return respond(ws, id, null, ERR.ACCES);
            await fs.rmdir(target);
            respond(ws, id, {});
            break;
          }

          case 'readlink': {
            const target = resolvePath(virtualPath);
            if (!target) return respond(ws, id, null, ERR.NOENT);
            const linkTarget = await fs.readlink(target);
            respond(ws, id, { target: linkTarget });
            break;
          }

          case 'rename': {
            const oldPath = resolvePath(virtualPath);
            const newDir = newDirFd === PREOPEN_FD ? FS_ROOT : openFiles.get(newDirFd)?.path;
            const newPath = newDir ? path.resolve(newDir, newpath) : null;
            if (!oldPath || !newPath) return respond(ws, id, null, ERR.ACCES);
            await fs.rename(oldPath, newPath);
            respond(ws, id, {});
            break;
          }

          case 'symlink': {
            const linkPath = resolvePath(newpath);
            if (!linkPath) return respond(ws, id, null, ERR.ACCES);
            await fs.symlink(virtualPath, linkPath);
            respond(ws, id, {});
            break;
          }

          case 'link': {
            const oldPath = resolvePath(virtualPath);
            const newDir = newDirFd === PREOPEN_FD ? FS_ROOT : openFiles.get(newDirFd)?.path;
            const newPath = newDir ? path.resolve(newDir, newpath) : null;
            if (!oldPath || !newPath) return respond(ws, id, null, ERR.ACCES);
            await fs.link(oldPath, newPath);
            respond(ws, id, {});
            break;
          }

          case 'set-times': {
            const target = virtualPath ? resolvePath(virtualPath) : openFiles.get(fd)?.path;
            if (!target) return respond(ws, id, null, ERR.NOENT);
            const atime = new Date();
            const mtime = new Date();
            await fs.utimes(target, atime, mtime);
            respond(ws, id, {});
            break;
          }

          case 'read-via-stream':
          case 'write-via-stream':
          case 'append-via-stream':
            respond(ws, id, null, ERR.NOSYS);
            break;

          default:
            console.warn('Unknown FS command:', cmd);
            respond(ws, id, null, ERR.NOSYS);
        }
      } catch (err) {
        console.error('FS error:', cmd, err);
        respond(ws, id, null, ERR.IO);
      }
    },

    onClose: () => {
      for (const [, f] of openFiles) f.fh?.close?.();
      openFiles.clear();
    }
  };
};