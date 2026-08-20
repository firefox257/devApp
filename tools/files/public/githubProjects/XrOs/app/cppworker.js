//cppworker.js
import { WasmRuntime } from '/system/js/wasm-runtime.js';

let runtime;
let selfId;
let isReady = false;

const ports = new Map();
const peerBuffers = new Map(); // ✅ FIXED: Store raw SharedArrayBuffers, not Uint8Array views

const post = (type, payload) => {
	self.postMessage({ workerId: selfId, type, payload });
};

function setupPeerMsgHandler(peerId, port) {
	port.addEventListener('message', async function(e) {
		try {
			const { srcId, secId, srcPtr, size } = e.data;
			//const numericSrcId = parseInt(srcId, 10);
			//const numericSecId = parseInt(secId, 10);
			
			
			if (size === 0) return;

			const peerBuffer = peerBuffers.get(srcId);//numericSrcId);
			if (!peerBuffer) {
				post('stderr', `No shared memory buffer for peer ${numericSrcId}`);
				return;
			}

			// ✅ FIXED: Create a fresh view to handle memory growth safely
			const peerMemView = new Uint8Array(peerBuffer);
			const dataSlice = peerMemView.subarray(srcPtr, srcPtr + size);

			if (!runtime.exports.malloc) {
				post('stderr', 'Wasm module missing malloc export');
				return;
			}

			const destPtr = runtime.exports.malloc(size);
			if (!destPtr) {
				post('stderr', `malloc failed for size ${size}`);
				return;
			}

			const selfMemView = new Uint8Array(runtime.memBuffer);
			selfMemView.set(dataSlice, destPtr);

			if (runtime.exports.onJsPeerMessage) {
				runtime.exports.onJsPeerMessage(srcId, secId, destPtr, size);//numericSrcId, numericSecId, destPtr, size);
				// ✅ FIXED: Removed synchronous free to prevent use-after-free
			} else {
				post('stderr', 'Wasm module missing onJsPeerMessage export');
				if (runtime.exports.free) runtime.exports.free(destPtr);
			}

		} catch (err) {
			post('stderr', `Error handling peer message: ${err.message}`);
		}
	});
	port.start(); 
}

async function handleMainThreadMsg(e) {
	const { type, wasmModule, sharedMemory, workerId, port, peerId, peerMemory } = e.data;

	if (type === 'init') {
		selfId = parseInt(workerId, 10);

		try {
			runtime = new WasmRuntime({
				memory: sharedMemory,
				onStdout: (str) => post('stdout', str),
				onStderr: (str) => post('stderr', str),
				imports: {
					sys: {
						jsSendToPeer: function(targetId, targetSectionId, srcPtr, size) {
							const targetPeer = ports.get(targetId);
							if (targetPeer && targetPeer.port) {
								targetPeer.port.postMessage({
									srcId: selfId, 
									secId: targetSectionId,
									srcPtr,
									size
								});
							} else {
								post('stderr', `Cannot send to peer ${targetId}: port not found`);
							}
						}
					},
					env: {
						jsCout: (ptr) => post('stdout', runtime.readString(ptr))
					}
				}
			});

			await runtime.instantiate(wasmModule);
			isReady = true;
			post('ready', `Worker ${selfId} initialized`);

		} catch (err) {
			post('error', `Init failed: ${err.message || String(err)}`);
		}
	}
	else if (type === 'registerPeer') {
		const numericPeerId = parseInt(peerId, 10);

		ports.set(numericPeerId, { port });

		if (peerMemory) {
			// ✅ FIXED: Store the raw SharedArrayBuffer
			peerBuffers.set(numericPeerId, peerMemory);
		}

		setupPeerMsgHandler(numericPeerId, port);
		post('peerRegistered', numericPeerId);
	}
	else if (type === 'executeRun') {
		// 🚀 NEW: Handle execution trigger from Main Thread
		if (isReady && runtime) {
			try {
				const exitCode = runtime.run();
				post('runComplete', exitCode);
			} catch (err) {
				post('runError', err.message || String(err));
			}
		} else {
			post('runError', 'Worker not ready or runtime not initialized');
		}
	}
	else if (type === 'runTest') {
		const { targetId, targetSectionId, msg } = e.data;
		const numericTargetId = parseInt(targetId, 10);

		if (isReady && runtime.exports.testSend) {
			const ptr = runtime.writeString(msg);
			runtime.exports.testSend(numericTargetId, targetSectionId, ptr);
			// ✅ FIXED: Removed runtime.freeString(ptr) to prevent async race conditions
		} else if (!runtime.exports.testSend) {
             post('stderr', 'Wasm module missing testSend export');
        }
	}
}

self.onmessage = handleMainThreadMsg;