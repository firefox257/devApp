
//cppworker.js

import { WasmRuntime } from '/system/js/wasm-runtime.js';

let runtime;
let selfId;
let isReady = false;

const ports = new Map();
const peerMemories = new Map(); 

const post = (type, payload) => {
	self.postMessage({ workerId: selfId, type, payload });
};

function setupPeerMsgHandler(peerId, port) {
	// ✅ FIXED: Use addEventListener and explicit start()
	port.addEventListener('message', async function(e) {
		try {
			const { srcId, srcPtr, size } = e.data;
			const numericSrcId = parseInt(srcId, 10);

			if (size === 0) return; // Guard against empty messages

			const peerMemView = peerMemories.get(numericSrcId);
			if (!peerMemView) {
				post('stderr', `No shared memory view for peer ${numericSrcId}`);
				return;
			}

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
				runtime.exports.onJsPeerMessage(numericSrcId, destPtr, size);
				
				// 🚨 FIXED: Prevent Memory Leak! Free the memory after C++ processes it.
				//if (runtime.exports.free) {
					//runtime.exports.free(destPtr);
				//}
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
				// 🚨 FIXED: wasm-runtime.js passes a decoded STRING here, not a pointer!
				onStdout: (str) => post('stdout', str),
				onStderr: (str) => post('stderr', str),
				imports: {
					sys: {
						jsSendToPeer: function(targetId, srcPtr, size) {
							const targetPeer = ports.get(targetId);
							if (targetPeer && targetPeer.port) {
								targetPeer.port.postMessage({
									srcId: selfId, 
									srcPtr,
									size
								});
							} else {
								post('stderr', `Cannot send to peer ${targetId}: port not found`);
							}
						}
					},
					env: {
						jsCout: (ptr) => {
							const mem = new Uint8Array(runtime.memBuffer);
							let end = ptr;
							while (end < mem.length && mem[end] !== 0) end++;
							post('stdout', new TextDecoder().decode(mem.subarray(ptr, end)));
						}
					}
				}
			});

			await runtime.instantiate(wasmModule);

			//runtime.run();

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
			peerMemories.set(numericPeerId, new Uint8Array(peerMemory));
		}

		setupPeerMsgHandler(numericPeerId, port);
		post('peerRegistered', numericPeerId);
	}
	else if (type === 'runTest') {
		const { targetId, msg } = e.data;
		const numericTargetId = parseInt(targetId, 10);

		if (isReady && runtime.exports.testSend) {
			const ptr = runtime.writeString(msg);
			runtime.exports.testSend(numericTargetId, ptr);
			runtime.freeString(ptr);
		} else if (!runtime.exports.testSend) {
             post('stderr', 'Wasm module missing testSend export');
        }
	}
}

self.onmessage = handleMainThreadMsg;