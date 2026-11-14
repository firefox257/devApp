async function runLifecycleTests(runtime, log) {
	// 1. JS_Memory_Growth_Resilience
	try {
		const structPtr = await runtime.callExport(0, 'test_alloc_4_bytes');
		if (structPtr && (structPtr >>> 0) !== 0xDEADBEEF) {
			const view = new DataView(runtime.sharedMemory.buffer);
			view.setUint32(structPtr, 42, true);
			const oldBuffer = runtime.sharedMemory.buffer;
			runtime.sharedMemory.grow(10);
			const newBuffer = runtime.sharedMemory.buffer;
			if (oldBuffer !== newBuffer) {
				const newView = new DataView(runtime.sharedMemory.buffer);
				const a = newView.getUint32(structPtr, true);
				if (a === 42) {
					log({ workerId: 0, testName: 'JS_Memory_Growth_Resilience', passed: true, message: 'Data correctly persisted and was readable after WebAssembly.Memory growth' });
				} else {
					log({ workerId: 0, testName: 'JS_Memory_Growth_Resilience', passed: false, message: `Data mismatch after growth: a=${a}` });
				}
			} else {
				log({ workerId: 0, testName: 'JS_Memory_Growth_Resilience', passed: false, message: 'Memory did not grow as expected' });
			}
		} else {
			log({ workerId: 0, testName: 'JS_Memory_Growth_Resilience', passed: false, message: 'Failed to get pointer for growth test' });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'JS_Memory_Growth_Resilience', passed: false, message: `Exception: ${e.message}` });
	}

	// 2. Worker_Memory_Growth_Resilience
	try {
		const structPtr = await runtime.callExport(0, 'test_alloc_4_bytes');
		if (structPtr && (structPtr >>> 0) !== 0xDEADBEEF) {
			const view = new DataView(runtime.sharedMemory.buffer);
			view.setUint32(structPtr, 99, true);
			runtime.sharedMemory.grow(5);
			const result = await runtime.callExport(0, 'test_read_4_bytes', structPtr);
			if (result === 99) {
				log({ workerId: 0, testName: 'Worker_Memory_Growth_Resilience', passed: true, message: 'Worker successfully read data after main-thread WebAssembly.Memory growth' });
			} else {
				log({ workerId: 0, testName: 'Worker_Memory_Growth_Resilience', passed: false, message: `Worker read mismatch after growth: expected 99, got ${result}` });
			}
		} else {
			log({ workerId: 0, testName: 'Worker_Memory_Growth_Resilience', passed: false, message: 'Failed to get pointer for worker growth test' });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'Worker_Memory_Growth_Resilience', passed: false, message: `Exception: ${e.message}` });
	}

	// 3. C++_Logging_Pipeline
	try {
		const logResult = await runtime.callExport(0, 'test_trigger_logs');
		if (logResult === 1) {
			log({ workerId: 0, testName: 'C++_Logging_Pipeline', passed: true, message: 'Successfully triggered msginfo, msgwarn, msgerr from C++ to main thread' });
		} else {
			log({ workerId: 0, testName: 'C++_Logging_Pipeline', passed: false, message: `Logging test returned ${logResult} instead of 1` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'C++_Logging_Pipeline', passed: false, message: `Exception: ${e.message}` });
	}

	// 4. JS_Shared_Memory_Pointer_Validation (NEW)
	try {
		const ptr1 = await runtime.callExport(0, 'test_alloc_8_bytes');
		const ptr2 = await runtime.callExport(0, 'test_alloc_8_bytes');
		if (ptr1 !== ptr2 && ptr1 !== 0 && ptr2 !== 0) {
			const view = new DataView(runtime.sharedMemory.buffer);
			view.setUint32(ptr1, 0x12345678, true);
			const readVal = await runtime.callExport(0, 'test_read_4_bytes', ptr1);
			if (readVal === 0x12345678) {
				log({ workerId: 0, testName: 'JS_Shared_Memory_Pointer_Validation', passed: true, message: 'Successfully validated distinct shared memory pointers and cross-boundary read/write' });
			} else {
				log({ workerId: 0, testName: 'JS_Shared_Memory_Pointer_Validation', passed: false, message: `Pointer read mismatch: expected 0x12345678, got ${readVal.toString(16)}` });
			}
		} else {
			log({ workerId: 0, testName: 'JS_Shared_Memory_Pointer_Validation', passed: false, message: 'Failed to allocate distinct shared memory pointers' });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'JS_Shared_Memory_Pointer_Validation', passed: false, message: `Exception: ${e.message}` });
	}

	// 5. Runtime_Shutdown
	try {
		if (runtime.state === 'RUNNING' || runtime.state === 'READY') {
			runtime.shutdown();
			if (runtime.state === 'SHUTDOWN') {
				log({ workerId: 0, testName: 'Runtime_Shutdown_State', passed: true, message: 'Runtime state correctly transitioned to SHUTDOWN' });
			} else {
				log({ workerId: 0, testName: 'Runtime_Shutdown_State', passed: false, message: `Expected SHUTDOWN state, got ${runtime.state}` });
			}
			try {
				await runtime.callExport(0, 'test_alloc_4_bytes');
				log({ workerId: 0, testName: 'Runtime_Shutdown_Rejects_Calls', passed: false, message: 'Should have rejected call after shutdown' });
			} catch (e) {
				if (e.message.includes('shutdown') || e.message.includes('not ready')) {
					log({ workerId: 0, testName: 'Runtime_Shutdown_Rejects_Calls', passed: true, message: 'Correctly rejected call after shutdown' });
				} else {
					log({ workerId: 0, testName: 'Runtime_Shutdown_Rejects_Calls', passed: false, message: `Wrong error message: ${e.message}` });
				}
			}
		} else {
			log({ workerId: 0, testName: 'Runtime_Shutdown', passed: false, message: `Runtime not in READY/RUNNING state before shutdown test: ${runtime.state}` });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'Runtime_Shutdown', passed: false, message: `Exception: ${e.message}` });
	}
}