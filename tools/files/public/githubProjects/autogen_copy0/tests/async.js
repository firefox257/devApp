// ./tests/async.js
async function runAsyncTests(runtime, log) {
	// 1. JS_Async_Future_Polling
	try {
		const futPtr = await runtime.callExport(0, 'test_create_future');
		if (futPtr && (futPtr >>> 0) !== 0xDEADBEEF) {
			const view = new DataView(runtime.sharedMemory.buffer);
			let status = view.getUint32(futPtr, true);
			let attempts = 0;
			while (status === 0 && attempts < 10) {
				await new Promise(r => setTimeout(r, 50));
				status = view.getUint32(futPtr, true);
				attempts++;
			}
			if (status === 0) {
				await runtime.callExport(0, 'test_resolve_future', futPtr);
				status = view.getUint32(futPtr, true);
			}
			const result = view.getUint32(futPtr + 4, true);
			if (status === 1 && result !== 0) {
				log({ workerId: 0, testName: 'JS_Async_Future_Polling', passed: true, message: 'Successfully created, polled, and resolved a C++ future' });
			} else {
				log({ workerId: 0, testName: 'JS_Async_Future_Polling', passed: false, message: `Future polling failed: status=${status}, result=${result}` });
			}
		} else {
			log({ workerId: 0, testName: 'JS_Async_Future_Polling', passed: false, message: 'Failed to create future' });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'JS_Async_Future_Polling', passed: false, message: `Exception: ${e.message}` });
	}
	// 2. CPP_ag_async_Friendly_Macro
	try {
		const futurePtr = await runtime.callExport(0, 'test_create_ag_async_future');
		if (futurePtr && (futurePtr >>> 0) !== 0xDEADBEEF) {
			const fut = runtime.wrapFuture(futurePtr);
			const value = await fut.awaitResult('int32');
			if (value === 40) {
				log({ workerId: 0, testName: 'CPP_ag_async_Friendly_Macro', passed: true, message: 'ag_async successfully packed args, dispatched, and resolved with correct result (15 + 25 = 40)' });
			} else {
				log({ workerId: 0, testName: 'CPP_ag_async_Friendly_Macro', passed: false, message: `ag_async resolved with wrong result: ${value}` });
			}
		} else {
			log({ workerId: 0, testName: 'CPP_ag_async_Friendly_Macro', passed: false, message: 'Failed to create ag_async future' });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_ag_async_Friendly_Macro', passed: false, message: `Exception: ${e.message}` });
	}
	// 3. CPP_ag_await_Int
	try {
		const futPtr = await runtime.callExport(0, 'test_cpp_await_int');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_ag_await_Int', passed: true, message: 'C++ ag_await successfully waited for int result non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_ag_await_Int', passed: false, message: `C++ ag_await failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_ag_await_Int', passed: false, message: `Exception: ${e.message}` });
	}
	// 4. JS_Dedicated_Worker_Async_Dispatch
	try {
		const dedicatedWorkerId = 1;
		const futPtr = await runtime.callExport(0, 'test_create_dedicated_future', dedicatedWorkerId, 100, 200);
		if (futPtr && (futPtr >>> 0) !== 0xDEADBEEF) {
			const fut = runtime.wrapFuture(futPtr);
			const value = await fut.awaitResult('int32');
			if (value === 300) {
				log({ workerId: 0, testName: 'JS_Dedicated_Worker_Async_Dispatch', passed: true, message: `Successfully dispatched and awaited async task on dedicated worker ${dedicatedWorkerId}` });
			} else {
				log({ workerId: 0, testName: 'JS_Dedicated_Worker_Async_Dispatch', passed: false, message: `Expected 300, got ${value}` });
			}
		} else {
			log({ workerId: 0, testName: 'JS_Dedicated_Worker_Async_Dispatch', passed: false, message: 'Failed to create dedicated future' });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'JS_Dedicated_Worker_Async_Dispatch', passed: false, message: `Exception: ${e.message}` });
	}
	// 5. JS_Direct_Export_Multi_Param
	try {
		const result = await runtime.callExport(0, 'test_multi_param', 10, 20, 30);
		if (result === 60) {
			log({ workerId: 0, testName: 'JS_Direct_Export_Multi_Param', passed: true, message: 'Successfully passed and unpacked multiple actual typed parameters (10 + 20 + 30 = 60) without args_ptr' });
		} else {
			log({ workerId: 0, testName: 'JS_Direct_Export_Multi_Param', passed: false, message: `Expected 60, got ${result}` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'JS_Direct_Export_Multi_Param', passed: false, message: `Exception: ${e.message}` });
	}
	// 6. CPP_Async_Class_Await
	try {
		const futPtr = await runtime.callExport(0, 'test_create_async_class_future1');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Async_Class_Await', passed: true, message: 'C++ ag_await successfully waited for and unpacked a custom struct/class result non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Async_Class_Await', passed: false, message: `C++ ag_await for class failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Async_Class_Await', passed: false, message: `Exception: ${e.message}` });
	}
	// 7. CPP_Async_Void_Execution
	try {
		const futPtr = await runtime.callExport(0, 'test_async_void_execution');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Async_Void_Execution', passed: true, message: 'C++ ag_async successfully executed a void function and updated shared memory state non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Async_Void_Execution', passed: false, message: `C++ ag_async void execution failed (counter was ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Async_Void_Execution', passed: false, message: `Exception: ${e.message}` });
	}
	// 8. CPP_Async_Dedicated_Class_Await
	try {
		const dedicatedWorkerId = 1;
		const futPtr = await runtime.callExport(0, 'test_create_async_dedicated_class_future', dedicatedWorkerId);
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Async_Dedicated_Class_Await', passed: true, message: 'C++ ag_await successfully waited for and unpacked a custom struct/class result specifically routed to a dedicated worker non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Async_Dedicated_Class_Await', passed: false, message: `C++ ag_await for dedicated class failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Async_Dedicated_Class_Await', passed: false, message: `Exception: ${e.message}` });
	}
	// 9. CPP_Sync_Call_Worker_To_Worker
	try {
		const dedicatedWorkerId = 1;
		const res = await runtime.callExport(0, 'test_sync_call', dedicatedWorkerId, 50, 75);
		if (res === 125) {
			log({ workerId: 0, testName: 'CPP_Sync_Call_Worker_To_Worker', passed: true, message: 'C++ ag_sync successfully blocked, waited via Atomics, and returned the correct result (50 + 75 = 125)' });
		} else {
			log({ workerId: 0, testName: 'CPP_Sync_Call_Worker_To_Worker', passed: false, message: `Expected 125, got ${res}` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Sync_Call_Worker_To_Worker', passed: false, message: `Exception: ${e.message}` });
	}
	// 10. CPP_Lambda_Async
	try {
		const futPtr = await runtime.callExport(0, 'test_lambda_async');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Lambda_Async', passed: true, message: 'ag_async successfully supports captureless lambdas via direct function pointer dispatch non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Lambda_Async', passed: false, message: `Lambda async failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Lambda_Async', passed: false, message: `Exception: ${e.message}` });
	}
	// 11. CPP_Lambda_Async_On
	try {
		const dedicatedWorkerId = 1;
		const futPtr = await runtime.callExport(0, 'test_lambda_async_on', dedicatedWorkerId);
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Lambda_Async_On', passed: true, message: 'ag_async_on successfully supports captureless lambdas targeted to specific workers non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Lambda_Async_On', passed: false, message: `Lambda async_on failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Lambda_Async_On', passed: false, message: `Exception: ${e.message}` });
	}
	// 12. CPP_Yield_Execution
	try {
		const counterPtr = await runtime.callExport(0, 'cppmalloc', 4);
		const view = new DataView(runtime.sharedMemory.buffer);
		view.setUint32(counterPtr, 0, true);
		const futPtr = await runtime.callExport(0, 'test_yield_task_js', counterPtr);
		if (futPtr && (futPtr >>> 0) !== 0xDEADBEEF) {
			const fut = runtime.wrapFuture(futPtr);
			const finalCount = await fut.awaitResult('uint32');
			if (finalCount === 7) {
				log({ workerId: 0, testName: 'CPP_Yield_Execution', passed: true, message: 'co_await ag_yield() successfully yielded to JS event loop and resumed, completing all steps and returning 7' });
			} else {
				log({ workerId: 0, testName: 'CPP_Yield_Execution', passed: false, message: `Yield execution failed, counter expected 7, got ${finalCount}` });
			}
		} else {
			log({ workerId: 0, testName: 'CPP_Yield_Execution', passed: false, message: 'Failed to create yield task future' });
		}
		await runtime.callExport(0, 'cppfree', counterPtr);
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Yield_Execution', passed: false, message: `Exception: ${e.message}` });
	}
	// ==========================================
	// PHASE 2: NEW LAMBDA TESTS
	// ==========================================
	// 13. CPP_Lambda_Capture_Async
	try {
		const futPtr = await runtime.callExport(0, 'test_lambda_capture_async');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Lambda_Capture_Async', passed: true, message: 'ag_async successfully supports capturing lambdas non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Lambda_Capture_Async', passed: false, message: `Capturing lambda async failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Lambda_Capture_Async', passed: false, message: `Exception: ${e.message}` });
	}
	// 14. CPP_Lambda_Val_To_Ref_Async
	try {
		const futPtr = await runtime.callExport(0, 'test_lambda_val_to_ref_async');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Lambda_Val_To_Ref_Async', passed: true, message: 'ag_async correctly handles lambda with reference parameter when passed by value (modifies copy) non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Lambda_Val_To_Ref_Async', passed: false, message: `Lambda val to ref async failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Lambda_Val_To_Ref_Async', passed: false, message: `Exception: ${e.message}` });
	}
	// 15. CPP_Lambda_Std_Ref_Async
	try {
		const futPtr = await runtime.callExport(0, 'test_lambda_std_ref_async');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Lambda_Std_Ref_Async', passed: true, message: 'ag_async correctly handles lambda with reference parameter when passed via std::ref (modifies original) non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Lambda_Std_Ref_Async', passed: false, message: `Lambda std::ref async failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Lambda_Std_Ref_Async', passed: false, message: `Exception: ${e.message}` });
	}
	// 16. CPP_Lambda_Capture_Ref_Async
	try {
		const futPtr = await runtime.callExport(0, 'test_lambda_capture_ref_async');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_Lambda_Capture_Ref_Async', passed: true, message: 'ag_async successfully supports capturing lambdas with reference parameters via std::ref non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_Lambda_Capture_Ref_Async', passed: false, message: `Capturing lambda with ref async failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_Lambda_Capture_Ref_Async', passed: false, message: `Exception: ${e.message}` });
	}
	// 17. CPP_await_all_heterogeneous
	try {
		const futPtr = await runtime.callExport(0, 'test_await_all_heterogeneous');
		const fut = runtime.wrapFuture(futPtr);
		const res = await fut.awaitResult('uint32');
		if (res === 1) {
			log({ workerId: 0, testName: 'CPP_await_all_heterogeneous', passed: true, message: 'ag_await_all successfully waited for multiple futures with heterogeneous types (int, float, int) and returned correct results non-blockingly' });
		} else {
			log({ workerId: 0, testName: 'CPP_await_all_heterogeneous', passed: false, message: `ag_await_all heterogeneous failed (got ${res})` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'CPP_await_all_heterogeneous', passed: false, message: `Exception: ${e.message}` });
	}
}