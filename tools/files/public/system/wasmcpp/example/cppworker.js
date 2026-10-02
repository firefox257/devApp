//cppworker.js
import { createWorker } from '/system/wasmcpp/CppCreateWorker.js';


async function start()
{
	const post = (type, payload) => {
		self.postMessage({ workerId: mainObj.selfId, type, payload });
	};



	var mainObj= await createWorker(
		{
			self,
			imports:{
				myfuncs: {
					jsalert:function(msg)
					{
						post('jsalert', mainObj.runtime.readString(msg));
					}
				}

			},
			msgHandels:{
				runTest: async function(data)
				{
					const { targetId, targetSectionId, msg } = data;
					const numericTargetId = parseInt(targetId, 10);

					if (mainObj.isReady && mainObj.runtime.exports.testSend) {
						const ptr = mainObj.runtime.writeString(msg);
						mainObj.runtime.exports.testSend(numericTargetId, targetSectionId, ptr);
						// ✅ FIXED: Removed runtime.freeString(ptr) to prevent async race conditions
					} else if (!mainObj.runtime.exports.testSend) {
						post('stderr', 'Wasm module missing testSend export');
					}
				}
			}
		}
	);

}

start();
