export var WasmRegistry = {
	_workers: {},
	_promises: {},
	_peerPromises: {},

	load: function (url, id) {
		if (!this._promises[id]) {
			this._promises[id] = (async () => {
					if (this._workers[id] === undefined) {
						var worker = {};
						const response = await fetch(url);
						if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
						const wasmBuffer = await response.arrayBuffer();
						worker.module = await WebAssembly.compile(wasmBuffer);
						worker.memory = new WebAssembly.Memory({
								initial: 16, maximum: 4096, shared: true
							});
						worker.msgChannel = new MessageChannel();
						this._workers[id] = worker;
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

						workerObj.worker.onmessage = (e) => {
							const { type, payload, workerId } = e.data;
							if (type === 'stdout') console.log(`[Worker ${workerId}] ${payload}`);
							else if (type === 'stderr') console.error(`[Worker ${workerId}] ${payload}`);
							else {
								console.log(`[Worker ${workerId} Event: ${type}]`, payload);
							}
						};

						workerObj.msgChannel = new MessageChannel();
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
	// Peer-to-Peer Mesh Network Setup
	// ==========================================
	setupPeers: function() {
		// Object.keys() returns strings, so we map them back to Numbers (integers)
		const ids = Object.keys(this._workers).map(Number);
		this._peerPromises = {}; // Reset for a fresh mesh setup

		// Create an N x N full mesh network
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				const idA = ids[i]; // Integer
				const idB = ids[j]; // Integer
				const workerA = this._workers[idA];
				const workerB = this._workers[idB];

				const channel = new MessageChannel();

				// A gets port1 and a view of B's shared memory
				this._peerPromises[`${idA}-to-${idB}`] = this._registerPort(workerA, idA, idB, channel.port1, workerB.memory.buffer);

				// B gets port2 and a view of A's shared memory
				this._peerPromises[`${idB}-to-${idA}`] = this._registerPort(workerB, idB, idA, channel.port2, workerA.memory.buffer);
			}
		}
	},

	_registerPort: function(workerObj, selfId, peerId, port, peerMemoryBuffer) {
		return new Promise((resolve, reject) => {
				if (workerObj.worker) {
					// It's a Web Worker
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
							peerMemory: peerMemoryBuffer // Pass the SharedArrayBuffer!
						}, [port]); // Transfer the port, but NOT the SharedArrayBuffer
				} else {
					// It's a Main Thread WASM instance
					workerObj.ports = workerObj.ports || {};
					workerObj.peerMemories = workerObj.peerMemories || {};

					workerObj.ports[peerId] = port;
					workerObj.peerMemories[peerId] = new Uint8Array(peerMemoryBuffer);

					port.onmessage = (e) => {
						// Queue or handle incoming messages for main thread WASM
						console.info(`[Main Thread ${selfId}] Received message from peer ${peerId}:`, e.data);
					};
					port.start();
					resolve(); // Main thread is ready immediately
				}
			});
	},

	waitPeerAll: function() {
		return Promise.all(Object.values(this._peerPromises));
	}
}


