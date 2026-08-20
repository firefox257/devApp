//cppworker.js
import { WasmRuntime } from '/system/js/wasm-runtime.js';

let runtime;
let selfId;
let isReady = false;

// 🚀 Registry for direct MessagePorts and Peer Memory Views
const ports = new Map();
const peerMemories = new Map(); // Stores Uint8Array views of other workers' SharedArrayBuffers

const post = (type, payload) => {
	self.postMessage({ workerId: selfId, type, payload });
};

/**
 * Sets up the message handler for a direct peer-to-peer MessagePort.
 */
function setupPeerMsgHandler(peerId, port) {
	port.onmessage = async function(e) {
		try {
			// Ensure srcId is an integer for the C++ call
			const { srcId, srcPtr, size } = e.data;
			const numericSrcId = parseInt(srcId, 10);

			// 1. Get the peer's shared memory view (Map preserves the integer key type!)
			const peerMemView = peerMemories.get(numericSrcId);
			if (!peerMemView) {
				post('stderr', `No shared memory view for peer ${numericSrcId}`);
				return;
			}

			// 2. Extract the data slice from the peer's memory
			const dataSlice = peerMemView.subarray(srcPtr, srcPtr + size);

			// 3. Allocate memory in our own Wasm instance
			const destPtr = runtime.exports.malloc ? runtime.exports.malloc(size) : runtime.allocate(size);

			// 4. Copy data into our local Wasm memory buffer
			// Note: Ensure your WasmRuntime class exposes `memBuffer`. If not, use `runtime.memory.buffer`
			const selfMemView = new Uint8Array(runtime.memBuffer);
			selfMemView.set(dataSlice, destPtr);

			// 5. Notify our Wasm module (C++ expects an int for srcId)
			if (runtime.exports.onJsPeerMessage) {
				runtime.exports.onJsPeerMessage(numericSrcId, destPtr, size);
			} else {
				post('stderr', 'Wasm module missing onJsPeerMessage export');
			}

		} catch (err) {
			post('stderr', `Error handling peer message: ${err.message}`);
		}
	};
}

/**
 * Handles messages from the main thread
 */
async function handleMainThreadMsg(e) {
	// 🚀 FIX 2: Added `peerMemory` to the destructured variables!
	const { type, wasmModule, sharedMemory, workerId, peerMemoryBuffers, port, peerId, peerMemory } = e.data;

	if (type === 'init') {
		// Ensure selfId is an integer
		selfId = parseInt(workerId, 10);

		if (peerMemoryBuffers) {
			for (const [pId, peerSab] of Object.entries(peerMemoryBuffers)) {
				// Convert the string key from Object.entries back to an integer
				peerMemories.set(parseInt(pId, 10), new Uint8Array(peerSab));
			}
		}

		try {
			// 🚀 FIX 1: Restored the WasmRuntime instantiation block!
			runtime = new WasmRuntime({
					memory: sharedMemory,
					onStdout: (ptr) => {
						post('stdout', ptr)


						//const mem = new Uint8Array(runtime.memBuffer);
						//let end = ptr;
						//while (end < mem.length && mem[end] !== 0) end++;
						
						//post('stdout', new TextDecoder().decode(mem.subarray(ptr, end)));



					},
					onStderr: (ptr) => {
						post('stderr', ptr)


						//const mem = new Uint8Array(runtime.memBuffer);
						//let end = ptr;
						//while (end < mem.length && mem[end] !== 0) end++;
						//post('stderr', new TextDecoder().decode(mem.subarray(ptr, end)));


					},
					imports: {
						sys: {
							// 🚀 THE THIN BRIDGE: Fast memory-to-memory copy + Metadata send
							jsSendToPeer: function(targetId, srcPtr, size) {
								const targetPeer = ports.get(targetId);
								if (targetPeer && targetPeer.port) {
									targetPeer.port.postMessage({
											srcId: selfId, // Identify who sent it
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
								//post('stdout', end+" ");
							}
						}//*/
					}
				});

			await runtime.instantiate(wasmModule);

			// this needs to initilize for cout and other libs. c++
			runtime.run();


			isReady = true;
			post('ready', `Worker ${selfId} initialized`);

		} catch (err) {
			post('error', `Init failed: ${err.message || String(err)}`);
		}
	}
	else if (type === 'registerPeer') {
		// Ensure peerId is an integer for the Map and C++
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
			// Pass the integer directly to C++
			runtime.exports.testSend(numericTargetId, ptr);
			runtime.freeString(ptr);
		}
	}
}

// Set the main message listener
self.onmessage = handleMainThreadMsg;