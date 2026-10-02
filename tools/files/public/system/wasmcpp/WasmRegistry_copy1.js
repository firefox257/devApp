
//WasmRegistry.js


import { WasmRuntime } from '/system/wasmcpp/wasm-runtime.js';

function defaultReplace(obj, defaultObj) {
	for(var i in defaultObj) {
		if(!obj[i]) obj[i]=defaultObj[i];
	}
	return obj;
}

var __sharedMemory = new WebAssembly.Memory({
		initial: 16, maximum: 4096, shared: true
	});

export var WasmRegistry = {
	_workers: {},
	_promises: {},
	_peerPromises: {},
	_runPromises: {}, // 🚀 NEW: Track execution promises
	
	getWorker:function(id)
	{
		return this._workers[id];
	},

	// ==========================================
	// 1. Load for Main Thread
	// ==========================================
	load: function (argsobj){//url, id, imports={}) {

		var {wasmUrl, id, imports} = defaultReplace(argsobj, {imports:{}});


		if (!this._promises[id]) {
			this._promises[id] = (async () => {
					if (this._workers[id] === undefined) {
						var workerObj = {};
						const response = await fetch(wasmUrl);
						if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
						const wasmBuffer = await response.arrayBuffer();
						workerObj.module = await WebAssembly.compile(wasmBuffer);
						//workerObj.memory = new WebAssembly.Memory({
						//		initial: 16, maximum: 4096, shared: true
						//	});
						workerObj.memory=__sharedMemory;

						imports.__jssys= {
							jsSendToPeer: (targetId, targetSecId, srcPtr) => {
								const targetPeer = workerObj.ports ? workerObj.ports[targetId] : null;
								if (targetPeer) {
									targetPeer.postMessage({ srcId: id, secId: targetSecId, srcPtr });
								} else {
									console.error(`[Main ${id}] Cannot send to peer ${targetId}: port not found`);
								}
							},
							jsCout: (ptr) => console.log(`[Main ${id}]`, runtime.readString(ptr))
						};


						const runtime = new WasmRuntime({
								memory: workerObj.memory,
								onStdout: (msg) => console.log(`[Main ${id}] ${msg}`),
								onStderr: (msg) => console.error(`[Main ${id}] ${msg}`),
								imports
							});

						await runtime.instantiate(workerObj.module);

						if (!runtime.exports.onJsPeerMessage)
						{
							console.error(`[Main ${selfId}] Wasm module missing onJsPeerMessage export`);
						}


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
	loadWorker: function (argsobj){//wasmUrl, id, workerScriptUrl = './cppworker.js', msgHandels={}) {

		var {wasmUrl, id, workerScriptUrl, msgHandels}=defaultReplace(argsobj, {
				workerScriptUrl:'./cppworker.js',
				msgHandels:{}
			});

		if (!this._promises[id]) {
			this._promises[id] = (async () => {
					if (this._workers[id] === undefined) {
						var workerObj = {};
						const response = await fetch(wasmUrl);
						if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
						const wasmBuffer = await response.arrayBuffer();
						workerObj.module = await WebAssembly.compile(wasmBuffer);
						//workerObj.memory = new WebAssembly.Memory({
						//		initial: 16, maximum: 4096, shared: true
						//	});
						workerObj.memory=__sharedMemory;
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
										type: '__init',
										workerId: id,
										wasmModule: workerObj.module,
										sharedMemory: workerObj.memory
									});
							});



						msgHandels.__stdout=(msg) =>
						{
							const { type, payload, workerId } = msg;
							console.log(`[Worker ${workerId}] ${payload}`);
						};
						msgHandels.__stderr=(msg) =>
						{
							const { type, payload, workerId } = msg;
							console.error(`[Worker ${workerId}] ${payload}`);
						};

						//todo add main thread message handlers
						workerObj.worker.addEventListener('message', (e) => {
								if(!msgHandels[e.data.type]){
									console.log(`[Worker ${workerId} Event: ${type}]`, payload);
									return;
								}
								msgHandels[e.data.type](e.data);
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
							type: '__registerPeer',
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
							try
							{
								const { srcId, secId, srcPtr, size } = e.data;
								runtime.exports.onJsPeerMessage(srcId, srcPtr, size);


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

						workerObj.worker.postMessage({ type: '__executeRun' });
					});
			} else {
				// --- Main Thread Logic ---
				this._runPromises[id] = (async () => {
						try {
							workerObj.runtime.run();
							//const exitCode = workerObj.runtime.run();
							//console.info(`[Main ${id}] Execution finished with exit code: ${exitCode}`);
							//return exitCode;
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
	},
	
	initAll: async function()
	{
		await this.waitLoadAll();
		
		this.setupPeers();
		await this.waitPeerAll();
		
		this.runAll();
		
		await this.waitRunAll();
		
	}
}