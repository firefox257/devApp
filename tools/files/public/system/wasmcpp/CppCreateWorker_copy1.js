//CppCreateWorker.js
import { WasmRuntime } from '/system/wasmcpp/wasm-runtime.js';




function defaultReplace(obj, defaultObj) {
	for(var i in defaultObj) {
		if(!obj[i]) obj[i]=defaultObj[i];
	}
	return obj;
}

//start export initilize function here

var post;
var stdout;
var stderr;

async function workerUtils(self)
{
	if(post == undefined)
	{
		post = (type, payload) => {
			self.postMessage({ workerId: mainObj.selfId, type, payload });
		};
		stdout = (payload)=> {

			self.postMessage({ workerId: mainObj.selfId, type: "__stdout", payload });
		};
		stderr = (payload)=> {

			self.postMessage({ workerId: mainObj.selfId, type: "__stderr", payload });
		};
	}
	return {post, stdout, stderr};
}


async function createWorker(argsobj)
{


	var {self, imports, msgHandels} = defaultReplace(argsobj,
		{
			imports:{},
			msgHandels:{}
		});



	if(post == undefined)
	{
		post = (type, payload) => {
			self.postMessage({ workerId: mainObj.selfId, type, payload });
		};
		stdout = (payload)=> {

			self.postMessage({ workerId: mainObj.selfId, type: "__stdout", payload });
		};
		stderr = (payload)=> {

			self.postMessage({ workerId: mainObj.selfId, type: "__stderr", payload });
		};
	}



	var mainObj = {
		selfId:undefined,
		isReady: false,
		runtime: undefined,
		peerPorts: new Map(),
		peerBuffers: new Map(),
		stdout,
		stderr


	};

	imports.__jssys = {
		jsSendToPeer: function(targetId, targetSectionId, srcPtr) {
			const targetPeer = mainObj.peerPorts.get(targetId);
			if (targetPeer && targetPeer.port) {
				targetPeer.port.postMessage({
						srcId: mainObj.selfId,
						secId: targetSectionId,
						srcPtr
					});
			} else {
				stderr(`Cannot send to peer ${targetId}: port not found`);
			}
		},
		jsCout: (ptr) => stdout(mainObj.runtime.readString(ptr))


	}


	function setupPeerMsgHandler(peerId, port) {
		port.addEventListener('message', async function(e) {
				try
				{

					const { srcId, secId, srcPtr, size } = e.data;
					mainObj.runtime.exports.onJsPeerMessage(srcId, secId, srcPtr, size);


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
			else if (!mainObj.runtime.exports.onJsPeerMessage)
			{
				stderr(`Wasm module missing onJsPeerMessage export`);
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
				//const exitCode = mainObj.runtime.run();
				mainObj.runtime.run();

				//post('runComplete', exitCode);
				post('runComplete');

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

export {createWorker, workerUtils};

