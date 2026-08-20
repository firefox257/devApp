import { WasmRuntime } from '/system/js/wasm-runtime.js';

export var WasmRegistry = {
	_workers: {},
	_promises: {},
	_peerPromises: {},

	// 🚀 UPDATED: Load for Main Thread (Instantiates WasmRuntime)
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
					
					// Instantiate WasmRuntime for the Main Thread
					const runtime = new WasmRuntime({
						memory: workerObj.memory,
						onStdout: (msg) => console.log(`[Main ${id}] ${msg}`),
						onStderr: (msg) => console.error(`[Main ${id}] ${msg}`),
						imports: {
							sys: {
								jsSendToPeer: (targetId, srcPtr, size) => {
									const targetPeer = workerObj.ports ? workerObj.ports[targetId] : null;
									if (targetPeer) {
										targetPeer.postMessage({ srcId: id, srcPtr, size });
									} else {
										console.error(`[Main ${id}] Cannot send to peer ${targetId}: port not found`);
									}
								}
							},
							env: {
								// Captures the local `runtime` variable safely
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
						if (type === 'peerRegistered' || type === 'ready') return;

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

	// 🚀 UPDATED: Handles P2P Mesh Communications for BOTH Workers and Main Thread
	_registerPort: function(workerObj, selfId, peerId, port, peerMemoryBuffer) {
		return new Promise((resolve, reject) => {
			if (workerObj.worker) {
				// ... Web Worker Logic (Unchanged) ...
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
				// 🚀 Main Thread P2P Message Handler
				workerObj.ports = workerObj.ports || {};
				workerObj.peerMemories = workerObj.peerMemories || {};

				workerObj.ports[peerId] = port;
				workerObj.peerMemories[peerId] = new Uint8Array(peerMemoryBuffer);

				port.addEventListener('message', async (e) => {
					try {
						const { srcId, srcPtr, size } = e.data;
						const numericSrcId = parseInt(srcId, 10);
						if (size === 0) return;

						const peerMemView = workerObj.peerMemories[numericSrcId];
						if (!peerMemView) {
							console.error(`[Main ${selfId}] No shared memory view for peer ${numericSrcId}`);
							return;
						}

						// Zero-copy read from peer's SharedArrayBuffer
						const dataSlice = peerMemView.subarray(srcPtr, srcPtr + size);
						const runtime = workerObj.runtime;

						if (!runtime.exports.malloc) {
							console.error(`[Main ${selfId}] Wasm module missing malloc export`);
							return;
						}

						// Allocate local memory and copy payload
						const destPtr = runtime.exports.malloc(size);
						if (!destPtr) {
							console.error(`[Main ${selfId}] malloc failed for size ${size}`);
							return;
						}

						const selfMemView = new Uint8Array(runtime.memBuffer);
						selfMemView.set(dataSlice, destPtr);

						if (runtime.exports.onJsPeerMessage) {
							runtime.exports.onJsPeerMessage(numericSrcId, destPtr, size);
							// 🚨 FIXED: Prevent Memory Leak! Free memory after C++ processes it.
							if (runtime.exports.free) runtime.exports.free(destPtr);
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
	}
}