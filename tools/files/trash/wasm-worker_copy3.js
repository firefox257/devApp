// system/js/wasm-worker.js
import { WasmRuntime } from './wasm-runtime.js';

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
 * Handles receiving memory pointers from peers, allocating local Wasm memory, 
 * and copying the data over.
 */
function setupPeerMsgHandler(peerId, port) {
	port.onmessage = async function(e) {
		try {
			const { srcId, srcPtr, size } = e.data; // srcId is the original sender's workerId

			// 1. Get the peer's shared memory view
			const peerMemView = peerMemories.get(srcId);
			if (!peerMemView) {
				post('stderr', `No shared memory view for peer ${srcId}`);
				return;
			}

			// 2. Extract the data slice from the peer's memory
			const dataSlice = peerMemView.subarray(srcPtr, srcPtr + size);

			// 3. Allocate memory in our own Wasm instance
			// (Assumes your Wasm module exports a 'malloc' function. Adjust if your allocator is named differently)
			const destPtr = runtime.exports.malloc ? runtime.exports.malloc(size) : runtime.allocate(size);

			// 4. Copy data into our local Wasm memory buffer
			const selfMemView = new Uint8Array(runtime.memBuffer);
			selfMemView.set(dataSlice, destPtr);

			// 5. Notify our Wasm module that data has arrived and is ready to be processed
			if (runtime.exports.onPeerMessage) {
				runtime.exports.onPeerMessage(srcId, destPtr, size);
			} else {
				post('stderr', 'Wasm module missing onPeerMessage export');
			}

		} catch (err) {
			post('stderr', `Error handling peer message: ${err.message}`);
		}
	};
}

/**
 * Handles messages from the main thread (initialization, peer registration, etc.)
 */
async function handleMainThreadMsg(e) {
	const { type, wasmModule, sharedMemory, workerId, peerMemoryBuffers, port, peerId } = e.data;

	if (type === 'init') {
		selfId = workerId;

		// 🚀 Store references to peer SharedArrayBuffers
		if (peerMemoryBuffers) {
			for (const [pId, peerSab] of Object.entries(peerMemoryBuffers)) {
				peerMemories.set(parseInt(pId), new Uint8Array(peerSab));
			}
		}

		try {
			runtime = new WasmRuntime({
					memory: sharedMemory,
					onStdout: (msg) => post('stdout', msg),
					onStderr: (msg) => post('stderr', msg),
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
							}
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
		// Register a new peer port dynamically after initialization
		ports.set(peerId, { port, sharedMemory });
		setupPeerMsgHandler(peerId, port);
		post('stdout', `Registered peer port for ${peerId}`);
	}
}

// Set the main message listener
self.onmessage = handleMainThreadMsg;