// worker-pool.js
export class WorkerPool {
    constructor(workerUrl, size = 4, wasmRuntime) {
        this.workers = [];
        this.taskQueue = [];
        this.activeTasks = new Map();
        this.wasmRuntime = wasmRuntime;

        for (let i = 0; i < size; i++) {
            const worker = new Worker(workerUrl, { type: 'module' });
            
            // 🚀 Pass SharedArrayBuffer immediately
            worker.postMessage({ type: 'init', memory: wasmRuntime.memory.buffer });
            
            worker.onmessage = (e) => this._handleCompletion(e.data);
            worker.onerror = (e) => console.error(`[Worker ${i}] Runtime Error:`, e.message);
            
            this.workers.push({ worker, busy: false });
        }
    }

    dispatchAsync(taskId, operation, payloadPtr, payloadLen, cppCallbackPtr) {
        const task = { taskId, operation, payloadPtr, payloadLen, cppCallbackPtr };
        const freeWorker = this.workers.find(w => !w.busy);
        if (freeWorker) {
            this._executeTask(freeWorker, task);
        } else {
            this.taskQueue.push(task);
        }
    }

    _executeTask(workerObj, task) {
        workerObj.busy = true;
        this.activeTasks.set(task.taskId, { workerObj, task });
        workerObj.worker.postMessage(task);
        console.log(`[Pool] 🚀 Dispatched task ${task.taskId}`);
    }

    _handleCompletion(data) {
        const activeTask = this.activeTasks.get(data.taskId);
        if (!activeTask) return;

        const { workerObj, task } = activeTask;
        workerObj.busy = false;
        this.activeTasks.delete(data.taskId);

        if (data.error) {
            console.error(`[Pool] ❌ Task ${data.taskId} failed: ${data.error}`);
        } else {
            console.log(`[Pool] ✅ Received result for task ${data.taskId}: ${data.result}`);
            
            // 🚀 CALL BACK INTO C++
            if (this.wasmRuntime) {
                try {
                    this.wasmRuntime.callExport('cpp_on_async_complete', data.taskId, data.result);
                    console.log(`[Pool] 🔄 Called C++ callback for task ${data.taskId}`);
                } catch (e) {
                    console.error(`[Pool] ❌ Failed to call C++ callback. Export missing?`, e);
                    console.log("[Pool] 💡 Available exports:", Object.keys(this.wasmRuntime.exports).filter(k => k.includes('async')));
                }
            }
        }

        if (this.taskQueue.length > 0) {
            const nextTask = this.taskQueue.shift();
            this._executeTask(workerObj, nextTask);
        }
    }
}