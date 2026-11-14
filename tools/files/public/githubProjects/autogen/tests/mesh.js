async function runMeshTests(runtime, log) {
	// 1. Worker_to_Worker_Mesh_Ping
	try {
		const worker1Id = 0;
		const worker2Id = 1;
		const worker1 = runtime.workers.get(worker1Id);

		if (worker1 && runtime.workers.has(worker2Id)) {
			await new Promise(r => setTimeout(r, 500));

			const meshResult = await new Promise((resolve) => {
					runtime.meshTestResolve = (result) => {
						runtime.meshTestResolve = null;
						resolve(result);
					};
					worker1.worker.postMessage({ type: 'PING_PEER', targetId: worker2Id });
					setTimeout(() => {
							if (runtime.meshTestResolve) {
								runtime.meshTestResolve = null;
								resolve({ passed: false, message: `Timeout waiting for PONG from Worker ${worker2Id}` });
							}
						}, 2000);
				});
			log({ workerId: 0, testName: 'Worker_to_Worker_Mesh_Ping', ...meshResult });
		} else {
			log({ workerId: 0, testName: 'Worker_to_Worker_Mesh_Ping', passed: false, message: 'Insufficient workers configured for mesh test' });
		}
	} catch (e) {
		log({ workerId: 0, testName: 'Worker_to_Worker_Mesh_Ping', passed: false, message: `Exception: ${e.message}` });
	}
}