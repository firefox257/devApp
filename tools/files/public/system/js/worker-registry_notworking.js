// system/js/worker-registry.js

export class WorkerRegistry {
    constructor(wasmModule, sharedMemory) {
        this.wasmModule = wasmModule;
        this.sharedMemory = sharedMemory;
        this.workers = new Map(); // workerId → Worker
        this.runtime = null;
    }

    setRuntime(runtime) {
        this.runtime = runtime;
    }

    createWorker(workerId, runtime) {
        if (this.workers.has(workerId)) return;

        const worker = new Worker('/system/js/wasm-worker.js', { type: 'module' });

        worker.onmessage = (e) => {
            const { type, taskId, payload, workerId: wId } = e.data;

            if (type === 'stdout') console.log(`[Worker ${wId}] ${payload}`);
            else if (type === 'stderr') console.error(`[Worker ${wId}] ${payload}`);
            else if (type === 'done') {
                // Tell C++ this worker is free
                if (this.runtime) {
                    this.runtime.callExport('onWorkerDone', wId);
                }
            }
            else if (type === 'error') console.error(`[Worker ${wId}] ERROR: ${payload}`);
        };

        worker.postMessage({
            type: 'INIT_WASM',
            wasmModule: this.wasmModule,
            sharedMemory: this.sharedMemory
        });

        this.workers.set(workerId, worker);
    }

    executeOnWorker(workerId, taskPtr, threadIndex, totalThreads) {
        const worker = this.workers.get(workerId);
        if (!worker) {
            console.error(`[Registry] Worker ${workerId} not found!`);
            return;
        }
        worker.postMessage({
            type: 'EXECUTE_TASK',
            workerId: workerId,
            taskPtr: taskPtr,
            threadIndex: threadIndex,
            totalThreads: totalThreads
        });
    }

    destroyWorker(workerId) {
        const worker = this.workers.get(workerId);
        if (worker) {
            worker.terminate();
            this.workers.delete(workerId);
        }
    }
}