async function runErrorTests(runtime, log) {
	// 1. Error_Invalid_Function_Name
	try {
		await runtime.callExport(0, 'non_existent_function_xyz');
		log({ workerId: 0, testName: 'Error_Invalid_Function_Name', passed: false, message: 'Should have thrown an error for invalid function name' });
	} catch (e) {
		if (e.message.includes('Invalid function name')) {
			log({ workerId: 0, testName: 'Error_Invalid_Function_Name', passed: true, message: 'Correctly rejected invalid function name' });
		} else {
			log({ workerId: 0, testName: 'Error_Invalid_Function_Name', passed: false, message: `Wrong error message: ${e.message}` });
		}
	}

	// 2. Error_Future_Rejection_Invalid_Worker
	try {
		const invalidWorkerId = 9999;
		const futPtr = await runtime.callExport(0, 'test_create_dedicated_future', invalidWorkerId, 10, 20);
		if (futPtr && (futPtr >>> 0) !== 0xDEADBEEF) {
			const fut = runtime.wrapFuture(futPtr);
			try {
				await fut.awaitResult('int32');
				log({ workerId: 0, testName: 'Error_Future_Rejection_Invalid_Worker', passed: false, message: 'Future should have rejected when targeting invalid worker' });
			} catch (e) {
				if (e.message.includes('rejected') || e.message.includes('DEADBEEF')) {
					log({ workerId: 0, testName: 'Error_Future_Rejection_Invalid_Worker', passed: true, message: 'Future correctly rejected with system error when targeting invalid worker' });
				} else {
					log({ workerId: 0, testName: 'Error_Future_Rejection_Invalid_Worker', passed: false, message: `Future rejected with unexpected error: ${e.message}` });
				}
			}
		} else {
			log({ workerId: 0, testName: 'Error_Future_Rejection_Invalid_Worker', passed: false, message: 'Failed to create future for invalid worker test' });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'Error_Future_Rejection_Invalid_Worker', passed: false, message: `Exception: ${e.message}` });
	}

	// 3. Error_Invalid_Target_Worker (NEW)
	try {
		await runtime.callExport(999, 'test_multi_param', 1, 2, 3);
		log({ workerId: 0, testName: 'Error_Invalid_Target_Worker', passed: false, message: 'Should have thrown an error for invalid target worker' });
	} catch (e) {
		if (e.message.includes('not ready') || e.message.includes('Invalid')) {
			log({ workerId: 0, testName: 'Error_Invalid_Target_Worker', passed: true, message: 'Correctly rejected call to non-existent worker' });
		} else {
			log({ workerId: 0, testName: 'Error_Invalid_Target_Worker', passed: false, message: `Wrong error message: ${e.message}` });
		}
	}
}