// wasm-runtime.js

export class WasmRuntime {
	constructor(options = {}) {
		this.options = options;
		this.instance = null;
		this.memory = null;
		this.exports = {};
		this._customImports = options.imports || {};
		this._initWasi();
	}

	_initWasi() {
		this.wasiImports = {
			proc_exit: (code) => { throw { name: 'ExitStatus', code }; },

			// ==========================================
			// CONSOLE I/O (std::cout, std::cerr)
			// ==========================================
			fd_write: (fd, iovsPtr, iovsLen, nwrittenPtr) => {
				if (fd !== 1 && fd !== 2) return 8; // 8 = EBADF

				const mem = new Uint8Array(this.memory.buffer);
				const view = new DataView(this.memory.buffer);
				let total = 0;
				let str = "";

				for (let i = 0; i < iovsLen; i++) {
					const ptr = view.getUint32(iovsPtr + i * 8, true);
					const len = view.getUint32(iovsPtr + i * 8 + 4, true);
					str += new TextDecoder().decode(mem.subarray(ptr, ptr + len));
					total += len;
				}

				if (fd === 1 && this.options.onStdout) this.options.onStdout(str);
				if (fd === 2 && this.options.onStderr) this.options.onStderr(str);

				view.setUint32(nwrittenPtr, total, true);
				return 0;
			},

			// ==========================================
			// 100% COMPLETE WASI PREVIEW1 STUBS (45 Functions)
			// ==========================================

			// File Descriptors
			fd_read: () => 8,
			fd_pread: () => 8,
			fd_pwrite: () => 8,
			fd_close: () => 0,
			fd_seek: () => 8,
			fd_tell: () => 8,
			fd_fdstat_get: () => 8,
			fd_fdstat_set_flags: () => 0,
			fd_fdstat_set_rights: () => 0,
			fd_filestat_get: () => 44,
			fd_filestat_set_size: () => 0,
			fd_filestat_set_times: () => 0,
			fd_advise: () => 44,
			fd_allocate: () => 44,
			fd_datasync: () => 44,
			fd_sync: () => 44,
			fd_readdir: () => 44,
			fd_renumber: () => 8,       // 👈 FIX: Added missing fd_renumber

			// Preopens
			fd_prestat_get: () => 8,
			fd_prestat_dir_name: () => 8,

			// Paths
			path_open: () => 44,
			path_filestat_get: () => 44,
			path_filestat_set_times: () => 44,
			path_create_directory: () => 44,
			path_link: () => 44,
			path_readlink: () => 44,
			path_remove_directory: () => 44,
			path_rename: () => 44,
			path_symlink: () => 44,
			path_unlink_file: () => 44,

			// Sockets
			sock_accept: () => 44,
			sock_recv: () => 44,
			sock_send: () => 44,
			sock_shutdown: () => 44,

			// Environment & Arguments
			args_get: () => 0,
			args_sizes_get: (argcPtr, argvBufSizePtr) => {
				const v = new DataView(this.memory.buffer);
				v.setUint32(argcPtr, 0, true);
				v.setUint32(argvBufSizePtr, 0, true);
				return 0;
			},
			environ_get: () => 0,
			environ_sizes_get: (countPtr, bufSizePtr) => {
				const v = new DataView(this.memory.buffer);
				v.setUint32(countPtr, 0, true);
				v.setUint32(bufSizePtr, 0, true);
				return 0;
			},

			// Clocks
			clock_res_get: (clockId, resolutionPtr) => {
				new DataView(this.memory.buffer).setBigUint64(resolutionPtr, 1000000n, true);
				return 0;
			},
			clock_time_get: (clockId, precision, timePtr) => {
				const ns = BigInt(Date.now()) * 1000000n;
				new DataView(this.memory.buffer).setBigUint64(timePtr, ns, true);
				return 0;
			},

			// Random & Polling
			random_get: (bufPtr, bufLen) => {
				crypto.getRandomValues(new Uint8Array(this.memory.buffer, bufPtr, bufLen));
				return 0;
			},
			poll_oneoff: () => 44,
			sched_yield: () => 0,
		};
	}

	addImport(namespace, name, func) {
		if (!this._customImports[namespace]) this._customImports[namespace] = {};
		this._customImports[namespace][name] = func;
	}

	async instantiate(wasmBinary) {
		const importObject = {
			wasi_snapshot_preview1: this.wasiImports,
			...this._customImports
		};

		if (this.options.importMemory) {
			if (!importObject.env) importObject.env = {};
			importObject.env.memory = new WebAssembly.Memory({
					initial: this.options.initialMemory || 256,
					maximum: this.options.maxMemory || 512,
					//shared:true
				});
		}

		try {
			const { instance } = await WebAssembly.instantiate(wasmBinary, importObject);
			this.instance = instance;
			this.memory = instance.exports.memory || importObject.env?.memory;
			this.exports = instance.exports;
			return this;
		} catch (err) {
			console.error("WASM Instantiation Error:", err);
			throw err;
		}
	}

	setMemorySize(pages) {
		if (!this.memory) throw new Error("WASM not instantiated yet.");
		const currentPages = this.memory.buffer.byteLength / 65536;
		if (pages > currentPages) this.memory.grow(pages - currentPages);
	}

	getExport(name) {
		if (!this.exports[name]) throw new Error(`Exported function '${name}' not found.`);
		return this.exports[name];
	}

	callExport(name, ...args) { return this.getExport(name)(...args); }

	run() {
		if (!this.exports._start) throw new Error("No _start function found.");
		try {
			this.exports._start();
			return 0;
		} catch (e) {
			if (e.name === 'ExitStatus') return e.code;
			throw e;
		}
	}

	writeString(str) {
		if (!this.exports.malloc) throw new Error("C++ must export 'malloc'.");
		const encoder = new TextEncoder();
		const bytes = encoder.encode(str + '\0');
		const ptr = this.exports.malloc(bytes.length);
		new Uint8Array(this.memory.buffer).set(bytes, ptr);
		return ptr;
	}

	readString(ptr) {
		const mem = new Uint8Array(this.memory.buffer);
		let end = ptr;
		while (mem[end] !== 0) end++;
		return new TextDecoder().decode(mem.subarray(ptr, end));
	}
}