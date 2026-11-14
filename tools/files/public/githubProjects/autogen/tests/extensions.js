// ./tests/extensions.js
async function runExtensionTests(runtime, log) {
	// 1. CPP_Ext_Main_Async
	try {
		const futPtr = await runtime.callExport(0, 'test_ext_main_async');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Ext_Main_Async', passed: true, message: 'ag_ext_async successfully routed to Main Thread and returned correct async result (10 + 25 = 35) non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Ext_Main_Async', passed: false, message: `Main async ext failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Ext_Main_Async', passed: false, message: `Exception: ${e.message}` });
	}
	// 2. CPP_Ext_Main_Sync
	try {
		const res = await runtime.callExport(0, 'test_ext_main_sync');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Ext_Main_Sync', passed: true, message: 'ag_ext_sync successfully blocked, routed to Main Thread, and returned correct sync result (100 + 200 = 300)' });
		} else {
			log({ workerId: 0, testName: 'CPP_Ext_Main_Sync', passed: false, message: `Main sync ext failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Ext_Main_Sync', passed: false, message: `Exception: ${e.message}` });
	}
	// 3. CPP_Ext_Worker_Async
	try {
		const futPtr = await runtime.callExport(0, 'test_ext_worker_async');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Ext_Worker_Async', passed: true, message: 'ag_ext_async successfully routed to local Worker context and returned correct async result (6 * 7 = 42) non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Ext_Worker_Async', passed: false, message: `Worker async ext failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Ext_Worker_Async', passed: false, message: `Exception: ${e.message}` });
	}
	// 4. CPP_Ext_Worker_Sync
	try {
		const res = await runtime.callExport(0, 'test_ext_worker_sync');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Ext_Worker_Sync', passed: true, message: 'ag_ext_sync successfully blocked, executed locally in Worker context, and returned correct sync result (5 * 8 = 40)' });
		} else {
			log({ workerId: 0, testName: 'CPP_Ext_Worker_Sync', passed: false, message: `Worker sync ext failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Ext_Worker_Sync', passed: false, message: `Exception: ${e.message}` });
	}
	// 5. CPP_Ext_Fire_And_Forget
	try {
		const res = await runtime.callExport(0, 'test_ext_fire_and_forget');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Ext_Fire_And_Forget', passed: true, message: 'ag_ext_fire successfully dispatched one-way message to local Worker context without blocking' });
		} else {
			log({ workerId: 0, testName: 'CPP_Ext_Fire_And_Forget', passed: false, message: `Fire and forget ext failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Ext_Fire_And_Forget', passed: false, message: `Exception: ${e.message}` });
	}
	// 6. CPP_Ext_Main_Async_Promise
	try {
		const futPtr = await runtime.callExport(0, 'test_ext_main_async_promise');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Ext_Main_Async_Promise', passed: true, message: 'ag_ext_async successfully handled an async (Promise-returning) Main Thread extension without deadlocking (10 + 25 + 100 = 135) non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Ext_Main_Async_Promise', passed: false, message: `Main async promise ext failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Ext_Main_Async_Promise', passed: false, message: `Exception: ${e.message}` });
	}
	// 7. CPP_Ext_Worker_Async_Promise
	try {
		const futPtr = await runtime.callExport(0, 'test_ext_worker_async_promise');
		if (futPtr && (futPtr >>> 0) !== 0xDEADBEEF) {
			const fut = runtime.wrapFuture(futPtr);
			const res = await fut.awaitResult('uint32');
			if (res === 1) {
				log({ workerId: 0, testName: 'CPP_Ext_Worker_Async_Promise', passed: true, message: 'ag_await successfully yielded to JS event loop, handled async Worker extension, and returned correct result (6 * 7 = 42)' });
			} else {
				log({ workerId: 0, testName: 'CPP_Ext_Worker_Async_Promise', passed: false, message: `Worker async promise ext failed (got ${res})` });
			}
		} else {
			log({ workerId: 0, testName: 'CPP_Ext_Worker_Async_Promise', passed: false, message: 'Failed to create worker async promise future' });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Ext_Worker_Async_Promise', passed: false, message: `Exception: ${e.message}` });
	}
}