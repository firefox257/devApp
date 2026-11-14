// ./tests/globals.js
async function runGlobalTests(runtime, log) {
	// 1. JS_Register_Global_Main
	try {
		const res = await runtime.callExport(0, 'test');
		if (res === 1) {
			log({ workerId: 0, testName: 'JS_Register_Global_Main', passed: true, message: 'Main worker successfully accessed auto-initialized native global pointer' });
		} else {
			log({ workerId: 0, testName: 'JS_Register_Global_Main', passed: false, message: `Main worker test failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'JS_Register_Global_Main', passed: false, message: `Exception: ${e.message}` });
	}
	// 2. JS_Register_Global_Thread
	try {
		const futPtr = await runtime.callExport(1, 'testthread');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 1, testName: 'JS_Register_Global_Thread', passed: true, message: 'Worker 1 successfully accessed native global (proven cross-worker propagation) non-blockingly' });
		} else {
			log({ workerId: 1, testName: 'JS_Register_Global_Thread', passed: false, message: `Worker 1 test failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 1, testName: 'JS_Register_Global_Thread', passed: false, message: `Exception: ${e.message}` });
	}
}