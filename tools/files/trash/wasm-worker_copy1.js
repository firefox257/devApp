// system/js/wasm-worker.js
import { WasmRuntime } from './wasm-runtime.js';

var runtime;


asyn function init(e)
{
	const { wasmModule, sharedMemory, taskId, inputPtr } = e.data;
	try
	{
		runtime = new WasmRuntime({
				memory: sharedMemory, // 🚨 Inject the shared memory!
				onStdout: (msg) => post('stdout', msg),
				onStderr: (msg) => post('stderr', msg)
			});

		//post('status', 'Instantiating...');
		// Pass the compiled Module instead of the raw buffer
		await runtime.instantiate(wasmModule);

		// Optional: Pass a specific memory pointer to your C++ function if needed
		// e.g., runtime.callExport('run_task', inputPtr);

		//post('status', 'Running...');
		const exitCode = runtime.run();

		//post('status', 'Finished');
		//post('exit', exitCode);
	} catch (err) {
		post('error', err.message || String(err));
	}
}





self.onmessage = async (e) => {


	// Helper to send messages back to the main thread
	const post = (type, payload) => self.postMessage({ taskId, type, payload });


};