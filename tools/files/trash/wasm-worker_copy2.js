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

const handleMessage = async function (e) {
	const { type } = e.data;

	if (type === 'INIT_WASM') {
		const { wasmModule, sharedMemory, workerId, peerMemoryBuffers } = e.data;
		selfId = workerId;

		// 🚀 Store references to peer SharedArrayBuffers
		for (const [peerId, peerSab] of Object.entries(peerMemoryBuffers || {})) {
			peerMemories.set(parseInt(peerId), new Uint8Array(peerSab));
		}

		try {
			runtime = new WasmRuntime({
				memory: sharedMemory,
				onStdout: (msg) => post('stdout', msg),
				onStderr: (msg) => post('stderr', msg),
				imports: {
					sys: {
						// 🚀 THE THIN BRIDGE: Fast memory-to-memory copy + Metadata send
						send_to_peer: (targetId, srcPtr, size, destPtr) => {
							const peerMem = peerMemories.get(targetId);
							const targetPort = ports.get(targetId);
							
							if (!peerMem || !targetPort) {
								post('error', `Cannot send to ${targetId}: Missing memory view or port`);
								return;
							}

							// 1. Get view of our own memory
							const selfMem = new Uint8Array(runtime.memBuffer);
							
							// 2. Fast native copy from our memory to peer's memory
							// V8/SpiderMonkey heavily optimize .set() for SharedArrayBuffers
							peerMem.set(selfMem.subarray(srcPtr, srcPtr + size), destPtr);

							// 3. Send ONLY metadata across the thread boundary
							targetPort.postMessage({ 
								type: 'WASM_DATA_READY', 
								destPtr, 
								size 
							});
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
	
	else if (type === 'CONNECT_PORT') {
		const { targetId, port } = e.data;
		ports.set(targetId, port);
		
		// Listen for incoming metadata from the peer
		port.onmessage = (e) => {
			const { type: msgType, destPtr, size } = e.data;
			if (msgType === 'WASM_DATA_READY' && runtime && runtime.exports.on_peer_data) {
				// 🚀 ZERO JS OVERHEAD: Pass pointers directly to C++
				runtime.exports.on_peer_data(destPtr, size);
			}
		};
	}

	else if (type === 'TERMINATE') {
		ports.forEach(port => port.close());
		runtime = null;
		self.close();
	}
};

self.addEventListener('message', handleMessage);