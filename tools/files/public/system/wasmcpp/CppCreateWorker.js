//CppCreateWorker.js
import { WasmRuntime } from '/system/wasmcpp/wasm-runtime.js';




function defaultReplace(obj, defaultObj) {
	for(var i in defaultObj) {
		if(!obj[i]) obj[i]=defaultObj[i];
	}
	return obj;
}

//start export initilize function here


async function createWorker(argsobj)
{

	var {self, imports, msgHandels} = defaultReplace(argsobj,
		{
			imports:{},
			msgHandels:{}
		});

	var mainObj = {
		selfId:undefined,
		isReady: false,
		runtime: undefined,
		peerPorts: new Map(),
		peerBuffers: new Map()
	};

	const post = (type, payload) => {
		self.postMessage({ workerId: mainObj.selfId, type, payload });
	};
	const stdout = (payload)=> {

		self.postMessage({ workerId: mainObj.selfId, type: "__stdout", payload });
	};
	const stderr = (payload)=> {

		self.postMessage({ workerId: mainObj.selfId, type: "__stderr", payload });
	};

	imports.__jssys = {
		jsSendToPeer: function(targetId, targetSectionId, srcPtr, size) {
			const targetPeer = mainObj.peerPorts.get(targetId);
			if (targetPeer && targetPeer.port) {
				targetPeer.port.postMessage({
						srcId: mainObj.selfId,
						secId: targetSectionId,
						srcPtr,
						size
					});
			} else {
				stderr(`Cannot send to peer ${targetId}: port not found`);
			}
		},
		jsCout: (ptr) => stdout(mainObj.runtime.readString(ptr))


	}


	function setupPeerMsgHandler(peerId, port) {
		port.addEventListener('message', async function(e) {
				try {
					const { srcId, secId, srcPtr, size } = e.data;


					if (size === 0) return;

					const peerBuffer = mainObj.peerBuffers.get(srcId);
					if (!peerBuffer) {
						post('stderr', `No shared memory buffer for peer ${numericSrcId}`);
						return;
					}

					// ✅ FIXED: Create a fresh view to handle memory growth safely
					const peerMemView = new Uint8Array(peerBuffer);
					const dataSlice = peerMemView.subarray(srcPtr, srcPtr + size);


					const destPtr = mainObj.runtime.exports.__cppAllocateMsg(secId, size);


					if (!destPtr) {
						stderr(`malloc failed for size ${size}`);
						return;
					}

					const selfMemView = new Uint8Array(mainObj.runtime.memBuffer);
					selfMemView.set(dataSlice, destPtr);

					//first  byte set to 0 as not bing used any more
					dataSlice[0]=0;
					mainObj.runtime.exports.onJsPeerMessage(srcId, secId, destPtr, size);


				} catch (err) {
					stderr(`Error handling peer message: ${err.message}`);
				}
			});
		port.start();
	}

	msgHandels.__init=async function(msg)
	{
		mainObj.selfId = parseInt(msg.workerId, 10);

		try {
			mainObj.runtime = new WasmRuntime({
					memory: msg.sharedMemory,
					onStdout: (str) => post('stdout', str),
					onStderr: (str) => post('stderr', str),
					imports
				});

			await mainObj.runtime.instantiate(msg.wasmModule);

			if (!mainObj.runtime.exports.onJsPeerMessage)
			{
				stderr('Wasm module missing onJsPeerMessage export');
				return;
			}
			else if (!mainObj.runtime.exports.__cppAllocateMsg)
			{
				stderr('Wasm module missing __cppAllocateMsg export');
				return;
			}
			else
			{

				mainObj.isReady = true;
				post('ready', `Worker ${mainObj.selfId} initialized`);
			}




		}
		catch (err)
		{
			post('error', `Init failed: ${err.message || String(err)}`);
		}
	}//end __init

	msgHandels.__registerPeer=async function(msg)
	{

		const numericPeerId = parseInt(msg.peerId, 10);

		mainObj.peerPorts.set(numericPeerId, {port: msg.port });

		if (msg.peerMemory) {
			// ✅ FIXED: Store the raw SharedArrayBuffer
			mainObj.peerBuffers.set(numericPeerId, msg.peerMemory);
		}

		setupPeerMsgHandler(numericPeerId, msg.port);
		post('peerRegistered', numericPeerId);

	}


	msgHandels.__executeRun = async function(msg)
	{

		// 🚀 NEW: Handle execution trigger from Main Thread
		if (mainObj.isReady && mainObj.runtime) {
			try {
				const exitCode = mainObj.runtime.run();


				post('runComplete', exitCode);
			} catch (err) {
				post('runError', err.message || String(err));
			}
		} else {
			post('runError', 'Worker not ready or runtime not initialized');
		}

	}


	async function handleMainThreadMsg(e) {
		//const { type, wasmModule, sharedMemory, workerId, port, peerId, peerMemory } = e.data;

		msgHandels[e.data.type](e.data);

	}

	self.onmessage = handleMainThreadMsg;
	return mainObj;
}

//createWorker(self);
export {createWorker};