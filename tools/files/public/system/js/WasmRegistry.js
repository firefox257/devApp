import { WasmRuntime } from '/system/js/wasm-runtime.js';

export var WasmRegistry = {
	_workers: {},
	_promises: {},
	_peerPromises: {},
	_runPromises: {}, // 🚀 NEW: Track execution promises

	// ==========================================
	// 1. Load for Main Thread
	// ==========================================
	load: function (url, id) {
		if (!this._promises[id]) {
			this._promises[id] = (async () => {
				if (this._workers[id] === undefined) {
					var workerObj = {};
					const response = await fetch(url);
					if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
					const wasmBuffer = await response.arrayBuffer();
					workerObj.module = await WebAssembly.compile(wasmBuffer);
					workerObj.memory = new WebAssembly.Memory({
						initial: 16, maximum: 4096, shared: true
					});
					
					const runtime = new WasmRuntime({
						memory: workerObj.memory,
						onStdout: (msg) => console.log(`[Main ${id}] ${msg}`),
						onStderr: (msg) => console.error(`[Main ${id}] ${msg}`),
						imports: {
							sys: {
								jsSendToPeer: (targetId, targetSecId, srcPtr, size) => {
									const targetPeer = workerObj.ports ? workerObj.ports[targetId] : null;
									if (targetPeer) {
										targetPeer.postMessage({ srcId: id, secId: targetSecId, srcPtr, size });
									} else {
										console.error(`[Main ${id}] Cannot send to peer ${targetId}: port not found`);
									}
								}
							},
							env: {
								jsCout: (ptr) => console.log(`[Main ${id}]`, runtime.readString(ptr))
							}
						}
					});
					
					await runtime.instantiate(workerObj.module);
					workerObj.runtime = runtime;
					
					this._workers[id] = workerObj;
				}
				return this._workers[id];
			})();
		}
		return this._promises[id];
	},

	// ==========================================
	// 2. Load for Web Workers
	// ==========================================
	loadWorker: function (url, id, workerScriptUrl = './cppworker.js') {
		if (!this._promises[id]) {
			this._promises[id] = (async () => {
				if (this._workers[id] === undefined) {
					var workerObj = {};
					const response = await fetch(url);
					if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
					const wasmBuffer = await response.arrayBuffer();
					workerObj.module = await WebAssembly.compile(wasmBuffer);
					workerObj.memory = new WebAssembly.Memory({
						initial: 16, maximum: 4096, shared: true
					});
					workerObj.worker = new Worker(workerScriptUrl, { type: 'module' });

					await new Promise((resolveWorker, rejectWorker) => {
						const initHandler = (e) => {
							if (e.data.type === 'ready') {
								workerObj.worker.removeEventListener('message', initHandler);
								resolveWorker();
							} else if (e.data.type === 'error') {
								workerObj.worker.removeEventListener('message', initHandler);
								rejectWorker(new Error(e.data.payload));
							}
						};
						workerObj.worker.addEventListener('message', initHandler);
						workerObj.worker.onerror = (err) => rejectWorker(new Error(`Worker error: ${err.message}`));

						workerObj.worker.postMessage({
							type: 'init',
							workerId: id,
							wasmModule: workerObj.module,
							sharedMemory: workerObj.memory
						});
					});

					workerObj.worker.addEventListener('message', (e) => {
						const { type, payload, workerId } = e.data;
						if (type === 'peerRegistered' || type === 'ready' || type === 'runComplete' || type === 'runError') return;

						if (type === 'stdout') console.log(`[Worker ${workerId}] ${payload}`);
						else if (type === 'stderr') console.error(`[Worker ${workerId}] ${payload}`);
						else console.log(`[Worker ${workerId} Event: ${type}]`, payload);
					});

					this._workers[id] = workerObj;
				}
				return this._workers[id];
			})();
		}
		return this._promises[id];
	},

	waitLoadAll: function () {
		return Promise.all(Object.values(this._promises));
	},

	// ==========================================
	// 3. P2P Mesh Setup
	// ==========================================
	setupPeers: function() {
		const ids = Object.keys(this._workers).map(Number);
		this._peerPromises = {}; 

		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				const idA = ids[i];
				const idB = ids[j];
				const workerA = this._workers[idA];
				const workerB = this._workers[idB];

				const channel = new MessageChannel();

				this._peerPromises[`${idA}-to-${idB}`] = this._registerPort(workerA, idA, idB, channel.port1, workerB.memory.buffer);
				this._peerPromises[`${idB}-to-${idA}`] = this._registerPort(workerB, idB, idA, channel.port2, workerA.memory.buffer);
			}
		}
	},

	_registerPort: function(workerObj, selfId, peerId, port, peerMemoryBuffer) {
		return new Promise((resolve, reject) => {
			if (workerObj.worker) {
				// --- Web Worker Logic ---
				const handler = (e) => {
					if (e.data.type === 'peerRegistered' && e.data.payload === peerId) {
						workerObj.worker.removeEventListener('message', handler);
						resolve();
					} else if (e.data.type === 'error') {
						workerObj.worker.removeEventListener('message', handler);
						reject(new Error(e.data.payload));
					}
				};
				workerObj.worker.addEventListener('message', handler);

				workerObj.worker.postMessage({
					type: 'registerPeer',
					peerId: peerId,
					port: port,
					peerMemory: peerMemoryBuffer 
				}, [port]); 
			} else {
				// --- Main Thread Logic ---
				workerObj.ports = workerObj.ports || {};
				workerObj.peerBuffers = workerObj.peerBuffers || {}; // ✅ FIXED: Store raw buffers, not views

				workerObj.ports[peerId] = port;
				workerObj.peerBuffers[peerId] = peerMemoryBuffer;

				port.addEventListener('message', async (e) => {
					try {
						const { srcId, srcPtr, size } = e.data;
						const numericSrcId = parseInt(srcId, 10);
						if (size === 0) return;

						const peerMemBuffer = workerObj.peerBuffers[numericSrcId];
						if (!peerMemBuffer) {
							console.error(`[Main ${selfId}] No shared memory buffer for peer ${numericSrcId}`);
							return;
						}

						// ✅ FIXED: Create a fresh view to handle memory growth safely
						const peerMemView = new Uint8Array(peerMemBuffer);
						const dataSlice = peerMemView.subarray(srcPtr, srcPtr + size);
						const runtime = workerObj.runtime;

						if (!runtime.exports.malloc) {
							console.error(`[Main ${selfId}] Wasm module missing malloc export`);
							return;
						}

						const destPtr = runtime.exports.malloc(size);
						if (!destPtr) {
							console.error(`[Main ${selfId}] malloc failed for size ${size}`);
							return;
						}

						const selfMemView = new Uint8Array(runtime.memBuffer);
						selfMemView.set(dataSlice, destPtr);

						if (runtime.exports.onJsPeerMessage) {
							runtime.exports.onJsPeerMessage(numericSrcId, destPtr, size);
							// ✅ FIXED: Removed synchronous free to prevent use-after-free
						} else {
							console.error(`[Main ${selfId}] Wasm module missing onJsPeerMessage export`);
							if (runtime.exports.free) runtime.exports.free(destPtr);
						}
					} catch (err) {
						console.error(`[Main ${selfId}] Error handling peer message: ${err.message}`);
					}
				});
				
				port.start();
				resolve(); 
			}
		});
	},

	waitPeerAll: function() {
		return Promise.all(Object.values(this._peerPromises));
	},

	// ==========================================
	// 🚀 4. NEW: Execute runtime.run() on all modules
	// ==========================================
	runAll: function() {
		this._runPromises = {};
		const ids = Object.keys(this._workers).map(Number);

		for (let i = 0; i < ids.length; i++) {
			const id = ids[i];
			const workerObj = this._workers[id];

			if (workerObj.worker) {
				// --- Web Worker Logic ---
				this._runPromises[id] = new Promise((resolve, reject) => {
					const handler = (e) => {
						if (e.data.type === 'runComplete' && e.data.workerId === id) {
							workerObj.worker.removeEventListener('message', handler);
							resolve(e.data.payload);
						} else if (e.data.type === 'runError' && e.data.workerId === id) {
							workerObj.worker.removeEventListener('message', handler);
							reject(new Error(e.data.payload));
						}
					};
					workerObj.worker.addEventListener('message', handler);
					
					workerObj.worker.postMessage({ type: 'executeRun' });
				});
			} else {
				// --- Main Thread Logic ---
				this._runPromises[id] = (async () => {
					try {
						const exitCode = workerObj.runtime.run();
						console.info(`[Main ${id}] Execution finished with exit code: ${exitCode}`);
						return exitCode;
					} catch (err) {
						console.error(`[Main ${id}] Execution failed:`, err);
						throw err;
					}
				})();
			}
		}
	},

	// ==========================================
	// 🚀 5. NEW: Wait for all runtimes to finish
	// ==========================================
	waitRunAll: function() {
		return Promise.all(Object.values(this._runPromises));
	}
}