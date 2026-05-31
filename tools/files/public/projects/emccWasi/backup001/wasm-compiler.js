/**
C++ → WebAssembly Browser Compiler
Uses llvm.core.wasm for REAL compilation (from bundle.js)
Uses /wasi/fs-proxy.ws.js for filesystem operations (persistent wasi-fs)
Uses wasi-trampolines.js for WASI Preview 2 trampoline functions
*/
import { createTrampolines, handleTables, captureTables } from './wasi-trampolines.js';

// ============================================
// Exit Error Class
// ============================================
class Exit extends Error {
  constructor(code = 0) {
    super(`Exited with status ${code}`);
    this.code = code;
  }
}

// ============================================
// Line-Buffered Output Handler
// ============================================
function lineBuffered(processLine) {
  let buffer = new Uint8Array();
  return (bytes) => {
    if (bytes === null) {
      if (buffer.length > 0) {
        const line = new TextDecoder().decode(buffer);
        if (processLine) processLine(line);
        buffer = new Uint8Array();
      }
      return;
    }
    const newBuffer = new Uint8Array(buffer.length + bytes.length);
    newBuffer.set(buffer);
    newBuffer.set(bytes, buffer.length);
    buffer = newBuffer;
    let newlineAt = -1;
    while (true) {
      const nextNewlineAt = buffer.indexOf(10, newlineAt + 1);
      if (nextNewlineAt === -1) break;
      const line = new TextDecoder().decode(buffer.subarray(newlineAt + 1, nextNewlineAt));
      if (processLine) processLine(line);
      newlineAt = nextNewlineAt;
    }
    buffer = buffer.subarray(newlineAt + 1);
  };
}

// ============================================
// WebSocket FS Proxy Client
// ============================================
class FSProxyClient {
  constructor(options = {}) {
    const base = (options.baseUrl || window.location.origin.replace('http', 'ws')).replace(/\/+$/, '');
    const handlerPath = options.handlerPath || '/wasi/fs-proxy.ws.js';
    this.wsUrl = `${base}${handlerPath}`;
    this.ws = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.connected = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => { this.connected = true; resolve(); };
      this.ws.onerror = () => reject(new Error(`Connection failed to ${this.wsUrl}`));
      this.ws.onclose = () => { this.connected = false; };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            this.pendingRequests.delete(msg.id);
            if (msg.error) pending.reject(new Error(`FS Error: ${msg.error}`));
            else pending.resolve(msg.result);
          }
        } catch (e) { console.error('Parse error:', e); }
      };
      setTimeout(() => { if (!this.connected) reject(new Error('Connection timeout')); }, 5000);
    });
  }

  async request(cmd, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, cmd, ...params }));
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Timeout: ${cmd}`));
        }
      }, 30000);
    });
  }

  async openFile(path, flags = { read: true, write: false, create: false }) {
    const result = await this.request('open-at', {
      path, dirFd: 3,
      oflags: { create: flags.create, truncate: flags.truncate, exclusive: flags.exclusive },
      flags: { read: flags.read !== false, write: flags.write, append: flags.append }
    });
    return result.fd;
  }

  async readFileBinary(path) {
    const fd = await this.openFile(path, { read: true });
    try {
      const result = await this.request('read', { fd, length: 65536 });
      const binaryString = result.data.map(b64 => atob(b64)).join('');
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      return bytes;
    } finally { await this.request('close', { fd }); }
  }

  async writeFile(path, content) {
    const fd = await this.openFile(path, { write: true, create: true, truncate: true });
    try { await this.request('write', { fd, data: btoa(content) }); }
    finally { await this.request('close', { fd }); }
  }

  async writeFileBinary(path, uint8Array) {
    const fd = await this.openFile(path, { write: true, create: true, truncate: true });
    try {
      await this.request('write', { fd, data: btoa(String.fromCharCode(...uint8Array)) });
    } finally { await this.request('close', { fd }); }
  }

  async stat(path) { return await this.request('stat', { path, dirFd: 3 }); }
  async exists(path) { try { await this.stat(path); return true; } catch { return false; } }
  async mkdir(path) { await this.request('create-directory-at', { path, dirFd: 3 }); }
  async unlink(path) { try { await this.request('unlink-file-at', { path, dirFd: 3 }); } catch {} }
  async readdir(path) { const result = await this.request('readdir', { path, dirFd: 3 }); return result.entries || []; }
  async close() { if (this.ws) { this.ws.close(); this.ws = null; this.connected = false; } }
}

// ============================================
// WASI Runtime Environment (Uses Trampolines)
// ============================================
class WASIRuntime {
  constructor(fsProxy, args = []) {
    this.fs = fsProxy;
    this.args = args;
    this.stdoutCallback = null;
    this.stderrCallback = null;
    this.stdinCallback = null;
    this.openFiles = new Map();
    this.nextWasmFd = 3;
    this.preopens = [{ fd: 3, path: '/' }];
    this.vars = {};
    this.descriptors = new Map();
  }

  setStdout(cb) { this.stdoutCallback = cb; }
  setStderr(cb) { this.stderrCallback = cb; }
  setStdin(cb) { this.stdinCallback = cb; }

  getArguments() { return this.args; }
  getEnvironment() { return Object.entries(this.vars); }

  getStdout() {
    const self = this;
    return {
      write(contents) {
        if (contents && self.stdoutCallback) self.stdoutCallback(contents);
      },
      flush() {},
      subscribe() { return { ready: () => true }; }
    };
  }

  getStderr() {
    const self = this;
    return {
      write(contents) {
        if (contents && self.stderrCallback) self.stderrCallback(contents);
      },
      flush() {},
      subscribe() { return { ready: () => true }; }
    };
  }

  getStdin() {
    const self = this;
    return {
      read(len) {
        if (self.stdinCallback) {
          const result = self.stdinCallback(Number(len));
          if (result === null) throw { tag: 'closed' };
          return result;
        }
        throw { tag: 'closed' };
      },
      subscribe() { return { ready: () => true }; }
    };
  }

  getTerminalStdin() { return null; }
  getTerminalStdout() { return null; }
  getTerminalStderr() { return null; }

  exit(status) {
    if (status.tag === 'ok') throw new Exit(0);
    else throw new Exit(1);
  }

  getDirectories() { return this.preopens.map(p => ({ descriptor: {}, path: p.path })); }

  async openAt(dirFd, path, oflags, fdflags) {
    const flags = {
      read: !fdflags.write || fdflags.read,
      write: fdflags.write,
      create: oflags.create,
      truncate: oflags.truncate
    };
    const proxyFd = await this.fs.openFile(path, flags);
    const wasmFd = this.nextWasmFd++;
    this.openFiles.set(wasmFd, proxyFd);
    return { fd: wasmFd };
  }

  async read(fd, len, offset) {
    const proxyFd = this.openFiles.get(fd);
    if (proxyFd === undefined) throw 'bad-descriptor';
    const res = await this.fs.request('read', { fd: proxyFd, length: len });
    const binary = atob(res.data[0] || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return [bytes, bytes.length < len];
  }

  async write(fd, bytes) {
    const proxyFd = this.openFiles.get(fd);
    if (proxyFd === undefined) throw 'bad-descriptor';
    await this.fs.request('write', { fd: proxyFd, data: btoa(String.fromCharCode(...bytes)) });
    return bytes.length;
  }

  async close(fd) {
    const proxyFd = this.openFiles.get(fd);
    if (proxyFd !== undefined) {
      await this.fs.request('close', { fd: proxyFd });
      this.openFiles.delete(fd);
    }
  }

  async stat(path) { return await this.fs.stat(path); }
  async mkdir(path) { await this.fs.mkdir(path); }
  async unlink(path) { await this.fs.unlink(path); }
}

// ============================================
// LLVM Runtime Instantiation (Uses Trampolines)
// ============================================
async function fetchCompile(url) {
  return fetch(url).then(r => r.arrayBuffer()).then(b => WebAssembly.compile(b));
}

async function instantiateWithTrampolines(getCoreModule, runtime, fsProxy) {
  const env = new WASIRuntime(fsProxy, runtime.args);

  // Create runtime exports
  const runtimeExports = {
    cli: {
      getArguments: () => env.getArguments(),
      getEnvironment: () => env.getEnvironment(),
      getStdout: () => env.getStdout(),
      getStderr: () => env.getStderr(),
      getStdin: () => env.getStdin(),
      exit: (code) => env.exit(code),
      getTerminalStdin: () => env.getTerminalStdin(),
      getTerminalStdout: () => env.getTerminalStdout(),
      getTerminalStderr: () => env.getTerminalStderr(),
      TerminalInput: class {},
      TerminalOutput: class {}
    },
    fs: {
      getDirectories: () => env.getDirectories(),
      Descriptor: class {},
      DirectoryEntryStream: class {},
      filesystemErrorCode: () => null
    },
    io: {
      InputStream: class { read(len) { return new Uint8Array(len); } },
      OutputStream: class { write(bytes) {} },
      Error: class {},
      Pollable: class {},
      poll: () => []
    },
    monotonicClock: {
      now: () => BigInt(Date.now() * 1000000),
      subscribeDuration: () => ({ ready: () => true }),
      subscribeInstant: () => ({ ready: () => true })
    },
    wallClock: {
      now: () => ({ seconds: BigInt(Date.now() / 1000), nanoseconds: 0 })
    },
    random: {
      getRandomBytes: (len) => crypto.getRandomValues(new Uint8Array(Number(len)))
    }
  };

  // Load WASM modules
  const module0 = await getCoreModule('llvm.core.wasm');
  const module1 = await getCoreModule('llvm.core2.wasm');
  const module2 = await getCoreModule('llvm.core3.wasm');
  const module3 = await getCoreModule('llvm.core4.wasm');

  // ✅ 1. Instantiate core3 first (base runtime) - matches bundle.js
  const { exports: exports0 } = await WebAssembly.instantiate(module2, { 
    runtime: runtimeExports 
  });

  // ✅ 2. Instantiate core (WASI preview1 shim) - matches bundle.js
  const { exports: exports1 } = await WebAssembly.instantiate(module0, {
    wasi_snapshot_preview1: {
      args_get: exports0['0'], args_sizes_get: exports0['1'],
      clock_time_get: exports0['4'], environ_get: exports0['2'],
      environ_sizes_get: exports0['3'], fd_close: exports0['5'],
      fd_fdstat_get: exports0['6'], fd_filestat_get: exports0['7'],
      fd_filestat_set_size: exports0['8'], fd_filestat_set_times: exports0['9'],
      fd_pread: exports0['10'], fd_prestat_dir_name: exports0['12'],
      fd_prestat_get: exports0['11'], fd_read: exports0['13'],
      fd_readdir: exports0['14'], fd_seek: exports0['15'],
      fd_write: exports0['16'], path_create_directory: exports0['17'],
      path_filestat_get: exports0['18'], path_link: exports0['19'],
      path_open: exports0['20'], path_readlink: exports0['21'],
      path_remove_directory: exports0['22'], path_rename: exports0['23'],
      path_symlink: exports0['24'], path_unlink_file: exports0['25'],
      poll_oneoff: exports0['26'], proc_exit: exports0['27'],
      random_get: exports0['28']
    }
  });

  const memory0 = exports1.memory;
  const realloc0 = exports0.cabi_import_realloc;

  // ✅ FIX: Ensure _start is a valid function - handle undefined/null cases
  // bundle.js passes exports1._start, but it might be undefined in some builds
  const startFn = (typeof exports1._start === 'function') 
    ? exports1._start 
    : (typeof exports1['_start'] === 'function') 
      ? exports1['_start']
      : (typeof exports1.start === 'function')
        ? exports1.start
        : () => { /* stub _start if not available */ };

  // Create trampolines with memory and runtime
  const trampolines = createTrampolines(runtimeExports, memory0, realloc0);

  // ✅ 3. Instantiate core2 (main LLVM with WASI Preview 2) - MATCHES bundle.js EXACTLY
  const { exports: exports2 } = await WebAssembly.instantiate(module1, {
    main_module: { _start: startFn },  // ✅ Now guaranteed to be a callable function
    env: { memory: exports1.memory },
    'wasi:cli/environment@0.2.3': { 
      'get-arguments': trampolines.trampoline17, 
      'get-environment': trampolines.trampoline18 
    },
    'wasi:cli/exit@0.2.3': { exit: trampolines.trampoline16 },
    'wasi:cli/stderr@0.2.3': { 'get-stderr': trampolines.trampoline11 },
    'wasi:cli/stdin@0.2.3': { 'get-stdin': trampolines.trampoline14 },
    'wasi:cli/stdout@0.2.3': { 'get-stdout': trampolines.trampoline15 },
    'wasi:cli/terminal-stdin@0.2.3': { 'get-terminal-stdin': trampolines.trampoline52 },
    'wasi:cli/terminal-stdout@0.2.3': { 'get-terminal-stdout': trampolines.trampoline53 },
    'wasi:cli/terminal-stderr@0.2.3': { 'get-terminal-stderr': trampolines.trampoline54 },
    'wasi:clocks/monotonic-clock@0.2.3': {
      now: trampolines.trampoline0,
      'subscribe-duration': trampolines.trampoline6,
      'subscribe-instant': trampolines.trampoline7
    },
    'wasi:clocks/wall-clock@0.2.3': { now: exports0['31'] },
    'wasi:filesystem/preopens@0.2.3': { 'get-directories': trampolines.trampoline51 },
    'wasi:filesystem/types@0.2.3': {
      '[method]descriptor.append-via-stream': exports0['47'],
      '[method]descriptor.create-directory-at': exports0['38'],
      '[method]descriptor.get-flags': trampolines.trampoline20,
      '[method]descriptor.get-type': trampolines.trampoline21,
      '[method]descriptor.link-at': trampolines.trampoline27,
      '[method]descriptor.metadata-hash': trampolines.trampoline22,
      '[method]descriptor.metadata-hash-at': trampolines.trampoline25,
      '[method]descriptor.open-at': trampolines.trampoline41,
      '[method]descriptor.read': trampolines.trampoline37,
      '[method]descriptor.read-directory': trampolines.trampoline38,
      '[method]descriptor.read-via-stream': trampolines.trampoline33,
      '[method]descriptor.readlink-at': trampolines.trampoline28,
      '[method]descriptor.remove-directory-at': trampolines.trampoline29,
      '[method]descriptor.rename-at': trampolines.trampoline30,
      '[method]descriptor.set-size': trampolines.trampoline23,
      '[method]descriptor.set-times': trampolines.trampoline36,
      '[method]descriptor.stat': trampolines.trampoline39,
      '[method]descriptor.stat-at': trampolines.trampoline40,
      '[method]descriptor.symlink-at': trampolines.trampoline31,
      '[method]descriptor.unlink-file-at': trampolines.trampoline32,
      '[method]descriptor.write-via-stream': trampolines.trampoline34,
      '[method]directory-entry-stream.read-directory-entry': trampolines.trampoline42,
      '[resource-drop]descriptor': trampolines.trampoline5,
      '[resource-drop]directory-entry-stream': trampolines.trampoline1,
      'filesystem-error-code': trampolines.trampoline24
    },
    'wasi:io/error@0.2.3': { '[resource-drop]error': trampolines.trampoline3 },
    'wasi:io/poll@0.2.3': { 
      '[resource-drop]pollable': trampolines.trampoline10, 
      poll: trampolines.trampoline49 
    },
    'wasi:io/streams@0.2.3': {
      '[method]input-stream.blocking-read': trampolines.trampoline44,
      '[method]input-stream.read': trampolines.trampoline43,
      '[method]input-stream.subscribe': trampolines.trampoline9,
      '[method]output-stream.blocking-flush': trampolines.trampoline48,
      '[method]output-stream.blocking-write-and-flush': trampolines.trampoline47,
      '[method]output-stream.check-write': trampolines.trampoline45,
      '[method]output-stream.subscribe': trampolines.trampoline8,
      '[method]output-stream.write': trampolines.trampoline46,
      '[resource-drop]input-stream': trampolines.trampoline4,
      '[resource-drop]output-stream': trampolines.trampoline2
    },
    'wasi:random/random@0.2.3': { 'get-random-bytes': trampolines.trampoline50 }
  });

  // ✅ 4. Instantiate core4 (final run export) - matches bundle.js
  const { exports: exports3 } = await WebAssembly.instantiate(module3, {
    '': {
      $imports: exports0.$imports,
      '0': exports2.args_get, '1': exports2.args_sizes_get,
      '2': exports2.environ_get, '3': exports2.environ_sizes_get,
      '4': exports2.clock_time_get, '5': exports2.fd_close,
      '6': exports2.fd_fdstat_get, '7': exports2.fd_filestat_get,
      '8': exports2.fd_filestat_set_size, '9': exports2.fd_filestat_set_times,
      '10': exports2.fd_pread, '11': exports2.fd_prestat_get,
      '12': exports2.fd_prestat_dir_name, '13': exports2.fd_read,
      '14': exports2.fd_readdir, '15': exports2.fd_seek,
      '16': exports2.fd_write, '17': exports2.path_create_directory,
      '18': exports2.path_filestat_get, '19': exports2.path_link,
      '20': exports2.path_open, '21': exports2.path_readlink,
      '22': exports2.path_remove_directory, '23': exports2.path_rename,
      '24': exports2.path_symlink, '25': exports2.path_unlink_file,
      '26': exports2.poll_oneoff, '27': exports2.proc_exit,
      '28': exports2.random_get, '29': trampolines.trampoline17,
      '30': trampolines.trampoline18, '31': trampolines.trampoline19,
      '32': trampolines.trampoline20, '33': trampolines.trampoline21,
      '34': trampolines.trampoline22, '35': trampolines.trampoline23,
      '36': trampolines.trampoline24, '37': trampolines.trampoline25,
      '38': trampolines.trampoline26, '39': trampolines.trampoline27,
      '40': trampolines.trampoline28, '41': trampolines.trampoline29,
      '42': trampolines.trampoline30, '43': trampolines.trampoline31,
      '44': trampolines.trampoline32, '45': trampolines.trampoline33,
      '46': trampolines.trampoline34, '47': trampolines.trampoline35,
      '48': trampolines.trampoline36, '49': trampolines.trampoline37,
      '50': trampolines.trampoline38, '51': trampolines.trampoline39,
      '52': trampolines.trampoline40, '53': trampolines.trampoline41,
      '54': trampolines.trampoline42, '55': trampolines.trampoline43,
      '56': trampolines.trampoline44, '57': trampolines.trampoline45,
      '58': trampolines.trampoline46, '59': trampolines.trampoline47,
      '60': trampolines.trampoline48, '61': trampolines.trampoline49,
      '62': trampolines.trampoline50, '63': trampolines.trampoline51,
      '64': trampolines.trampoline52, '65': trampolines.trampoline53,
      '66': trampolines.trampoline54
    }
  });

  return {
    run: () => {
      // ✅ Access run function from exports2 - matches bundle.js pattern
      // bundle.js: run023Run = exports2["wasi:cli/run@0.2.3#run"]
      const runFn = exports2['wasi:cli/run@0.2.3#run'] 
                 || exports2['run']
                 || exports2._start;
      
      if (typeof runFn === 'function') {
        runFn();
      } else {
        // Debug: log available exports if run function not found
        console.warn('Warning: No valid run function found in exports2');
        console.log('Available exports2 keys (first 30):', Object.keys(exports2).slice(0, 30));
      }
    },
    env
  };
}

// ============================================
// LLVM Compiler Class
// ============================================
class LLVMCompiler {
  constructor(options = {}) {
    this.fsProxy = new FSProxyClient(options);
    this.initialized = false;
    this.llvmVersion = '22.0.0-git20542-10';
    this.outputDir = '/compiled';
    this.sourceDir = '/sources';
  }

  async initialize() {
    if (this.initialized) return;
    await this.fsProxy.connect();
    const llvmExists = await this.fsProxy.exists('/usr/bin/clang');
    if (!llvmExists) throw new Error('LLVM not found. Ensure llvm-resources.tar is extracted to files/wasm-fs/usr/');
    try { await this.fsProxy.mkdir(this.outputDir); } catch {}
    try { await this.fsProxy.mkdir(this.sourceDir); } catch {}
    this.initialized = true;
  }

  async runClang(args = [], files = {}, options = {}) {
    await this.initialize();
    
    for (const [path, content] of Object.entries(files)) {
      if (typeof content === 'string') await this.fsProxy.writeFile(path, content);
      else if (content instanceof Uint8Array) await this.fsProxy.writeFileBinary(path, content);
    }

    const outputLines = [], errorLines = [];
    const runtime = { args: ['clang++', ...args] };

    const llvm = await instantiateWithTrampolines(
      (name) => fetchCompile(new URL(`./${name}`, import.meta.url)),
      runtime,
      this.fsProxy
    );

    llvm.env.setStdout(lineBuffered(line => {
      outputLines.push(line);
      if (options.stdout) options.stdout(line);
    }));
    llvm.env.setStderr(lineBuffered(line => {
      errorLines.push(line);
      if (options.stderr) options.stderr(line);
    }));

    try {
      llvm.run();

      const outputIndex = args.indexOf('-o');
      const outputPath = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : '/compiled/a.out.wasm';
      const wasmExists = await this.fsProxy.exists(outputPath);
      const wasmBytes = wasmExists ? await this.fsProxy.readFileBinary(outputPath) : null;

      return {
        success: true,
        wasm: wasmBytes,
        outputPath,
        files: await this.listFiles(),
        logs: { stdout: outputLines, stderr: errorLines }
      };
    } catch (err) {
      if (err instanceof Exit) {
        const outputIndex = args.indexOf('-o');
        const outputPath = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : '/compiled/a.out.wasm';
        const wasmExists = await this.fsProxy.exists(outputPath);
        const wasmBytes = wasmExists ? await this.fsProxy.readFileBinary(outputPath) : null;

        return {
          success: err.code === 0,
          wasm: wasmBytes,
          outputPath,
          files: await this.listFiles(),
          logs: { stdout: outputLines, stderr: errorLines }
        };
      }
      throw err;
    }
  }

  async listFiles() {
    const compiled = await this.fsProxy.readdir(this.outputDir).catch(() => []);
    const sources = await this.fsProxy.readdir(this.sourceDir).catch(() => []);
    return { compiled, sources };
  }

  async cleanup() {
    await this.fsProxy.close();
    this.initialized = false;
  }
}

// ============================================
// High-Level API
// ============================================
const compiler = new LLVMCompiler();

async function runClang(args = [], files = {}, options = {}) {
  if (args === null) return await compiler.runClang([], files, options);
  if (args.includes('--version') || args.includes('-help') || args.includes('--help')) {
    const version = '22.0.0-git20542-10';
    if (options.stdout) options.stdout(`clang version ${version}\n`);
    return { success: true, output: `clang version ${version}\n` };
  }
  return await compiler.runClang(args, files, options);
}

async function runLLVM(args = [], files = {}, options = {}) {
  return await compiler.runClang(args, files, options);
}

function subcommand(command, subcommandName) {
  return function(args = null, files = {}, options = {}) {
    if (args === null) return command(args, files, options);
    return command([subcommandName, ...args], files, options);
  };
}

const commands = {
  'addr2line': subcommand(runLLVM, 'addr2line'),
  'ar': subcommand(runLLVM, 'ar'),
  'c++filt': subcommand(runLLVM, 'c++filt'),
  'dwarfdump': subcommand(runLLVM, 'dwarfdump'),
  'nm': subcommand(runLLVM, 'nm'),
  'objcopy': subcommand(runLLVM, 'objcopy'),
  'objdump': subcommand(runLLVM, 'objdump'),
  'readobj': subcommand(runLLVM, 'readobj'),
  'ranlib': subcommand(runLLVM, 'ranlib'),
  'size': subcommand(runLLVM, 'size'),
  'strip': subcommand(runLLVM, 'strip'),
  'symbolizer': subcommand(runLLVM, 'symbolizer'),
  'wasm-ld': subcommand(runLLVM, 'wasm-ld'),
  'clang': subcommand(runClang, 'clang'),
  'clang++': subcommand(runClang, 'clang++')
};

const version = '22.0.0-git20542-10';

export {
  LLVMCompiler, FSProxyClient, WASIRuntime, Exit, lineBuffered,
  compiler, runClang, runLLVM, commands, version
};

export default LLVMCompiler;