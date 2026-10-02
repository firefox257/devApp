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

	// 🚨 FIX 5: Bulletproof memory accessor
	// Handles both WebAssembly.Memory objects and raw ArrayBuffers/SharedArrayBuffers
	get memBuffer() {
		return this.memory instanceof WebAssembly.Memory ? this.memory.buffer : this.memory;
	}

	_initWasi() {
		this.wasiImports = {
			proc_exit: (code) => { throw { name: 'ExitStatus', code }; },

			// ==========================================
			// CONSOLE I/O (std::cout, std::cerr)
			// ==========================================
			fd_write: (fd, iovsPtr, iovsLen, nwrittenPtr) => {
				if (fd !== 1 && fd !== 2) return 8; // 8 = EBADF

				const mem = new Uint8Array(this.memBuffer);
				const view = new DataView(this.memBuffer);
				let total = 0;
				const chunks = [];

				// 🚨 FIX 1: Collect all chunks first to prevent splitting multi-byte UTF-8 chars
				for (let i = 0; i < iovsLen; i++) {
					const ptr = view.getUint32(iovsPtr + i * 8, true);
					const len = view.getUint32(iovsPtr + i * 8 + 4, true);
					chunks.push(mem.subarray(ptr, ptr + len));
					total += len;
				}

				// Combine into a single contiguous buffer before decoding
				const combined = new Uint8Array(total);
				let offset = 0;
				for (const chunk of chunks) {
					combined.set(chunk, offset);
					offset += chunk.length;
				}
				const str = new TextDecoder().decode(combined);

				if (fd === 1 && this.options.onStdout) this.options.onStdout(str);
				if (fd === 2 && this.options.onStderr) this.options.onStderr(str);

				view.setUint32(nwrittenPtr, total, true);
				return 0;
			},

			// ==========================================
			// 🚨 FIX 3: Enable isatty() for ANSI Colors!
			// ==========================================
			fd_fdstat_get: (fd, bufPtr) => {
				if (fd === 1 || fd === 2) {
					const view = new DataView(this.memBuffer);
					// Tell C++ this is a Character Device (enables isatty() and colors)
					view.setUint8(bufPtr, 2); // 2 = __WASI_FILETYPE_CHARACTER_DEVICE
					view.setUint16(bufPtr + 2, 0, true); // flags
					view.setBigUint64(bufPtr + 8, 0xFFFFFFFFFFFFFFFFn, true); // rights base
					view.setBigUint64(bufPtr + 16, 0xFFFFFFFFFFFFFFFFn, true); // rights inheriting
					return 0;
				}
				return 8; // EBADF for other FDs
			},

			// ==========================================
			// 🚨 FIX 2: Implement sleep() via poll_oneoff
			// ==========================================
			poll_oneoff: (subPtr, retPtr, nSubs, nEventsPtr) => {
				const view = new DataView(this.memBuffer);
				let eventsWritten = 0;
				
				for (let i = 0; i < nSubs; i++) {
					const subBase = subPtr + i * 48; // WASI subscription is 48 bytes
					const userdata = view.getBigUint64(subBase, true);
					const type = view.getUint8(subBase + 8); // 0 = clock, 1 = fd_read, 2 = fd_write
					
					const retBase = retPtr + eventsWritten * 32; // WASI event is 32 bytes
					view.setBigUint64(retBase, userdata, true);
					view.setUint8(retBase + 10, type);
					
					if (type === 0) { // CLOCK subscription
						const flags = view.getUint16(subBase + 40, true);
						let timeoutNs = view.getBigUint64(subBase + 24, true);
						
						// If flag & 1 is true, it's an absolute timestamp. Convert to relative.
						if (flags & 1) { 
							const nowNs = BigInt(Date.now()) * 1000000n;
							const diffNs = timeoutNs - nowNs;
							timeoutNs = diffNs > 0n ? diffNs : 0n;
						}
						
						const timeoutMs = Number(timeoutNs / 1000000n);
						
						// Block the thread synchronously using Atomics.wait
						if (typeof Atomics !== 'undefined') {
							const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
							Atomics.wait(waitBuffer, 0, 0, timeoutMs);
						} else {
							// Fallback busy-wait (only if SharedArrayBuffer is somehow disabled)
							const start = Date.now();
							while (Date.now() - start < timeoutMs) {}
						}
						
						view.setUint16(retBase + 8, 0, true); // error = success
						eventsWritten++;
					} else {
						// For FD_READ / FD_WRITE, return ENOSYS
						view.setUint16(retBase + 8, 44, true); 
						eventsWritten++;
					}
				}
				
				view.setUint32(nEventsPtr, eventsWritten, true);
				return 0;
			},

			// ==========================================
			// 100% COMPLETE WASI PREVIEW1 STUBS
			// ==========================================
			fd_read: () => 8,
			fd_pread: () => 8,
			fd_pwrite: () => 8,
			fd_close: () => 0,
			fd_seek: () => 8,
			fd_tell: () => 8,
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
			fd_renumber: () => 8,

			fd_prestat_get: () => 8,
			fd_prestat_dir_name: () => 8,

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

			sock_accept: () => 44,
			sock_recv: () => 44,
			sock_send: () => 44,
			sock_shutdown: () => 44,

			args_get: () => 0,
			args_sizes_get: (argcPtr, argvBufSizePtr) => {
				const v = new DataView(this.memBuffer);
				v.setUint32(argcPtr, 0, true);
				v.setUint32(argvBufSizePtr, 0, true);
				return 0;
			},
			environ_get: () => 0,
			environ_sizes_get: (countPtr, bufSizePtr) => {
				const v = new DataView(this.memBuffer);
				v.setUint32(countPtr, 0, true);
				v.setUint32(bufSizePtr, 0, true);
				return 0;
			},

			clock_res_get: (clockId, resolutionPtr) => {
				new DataView(this.memBuffer).setBigUint64(resolutionPtr, 1000000n, true);
				return 0;
			},
			clock_time_get: (clockId, precision, timePtr) => {
				const ns = BigInt(Date.now()) * 1000000n;
				new DataView(this.memBuffer).setBigUint64(timePtr, ns, true);
				return 0;
			},

			// 🚨 FIX 4: Safe random generation for SharedArrayBuffer
			random_get: (bufPtr, bufLen) => {
				const temp = new Uint8Array(bufLen);
				crypto.getRandomValues(temp);
				new Uint8Array(this.memBuffer).set(temp, bufPtr);
				return 0;
			},
			
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

		if (!importObject.env) importObject.env = {};
		if (!importObject.env.memory) {
			importObject.env.memory = new WebAssembly.Memory({
				initial: this.options.initialMemory || 256,
				maximum: this.options.maxMemory || 512,
				shared: true 
			});
		}

		this.memory = importObject.env.memory;

		try {
			const { instance } = await WebAssembly.instantiate(wasmBinary, importObject);
			this.instance = instance;
			this.memory = instance.exports.memory || this.memory;
			this.exports = instance.exports;
			return this;
		} catch (err) {
			console.error("WASM Instantiation Error:", err);
			throw err;
		}
	}

	setMemorySize(pages) {
		if (!this.memory) throw new Error("WASM not instantiated yet.");
		const currentPages = this.memBuffer.byteLength / 65536;
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
		new Uint8Array(this.memBuffer).set(bytes, ptr);
		return ptr;
	}

	readString(ptr) {
		const mem = new Uint8Array(this.memBuffer);
		let end = ptr;
		while (mem[end] !== 0) end++;
		return new TextDecoder().decode(mem.subarray(ptr, end));
	}
}