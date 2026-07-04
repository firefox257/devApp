// async-worker.js
let sharedMemoryBuffer = null;

self.onerror = (e) => console.error(`[Worker Error] ${e.message}`, e);

self.onmessage = function(e) {
    if (e.data.type === 'init') {
        sharedMemoryBuffer = e.data.memory;
        console.log(`[Worker] ✅ Initialized. Buffer byteLength: ${sharedMemoryBuffer.byteLength} bytes.`);
        return;
    }

    const { taskId, operation, payloadPtr, payloadLen } = e.data;
    let result = 0;

    try {
        // 🚨 CHECK 1: Did the buffer detach? (byteLength becomes 0)
        if (sharedMemoryBuffer.byteLength === 0) {
            throw new Error("Buffer was detached! WASM memory grew. Ensure initial === maximum in WasmRuntime.");
        }

        // 🚨 CHECK 2: Is the pointer actually out of bounds?
        if (payloadPtr + payloadLen > sharedMemoryBuffer.byteLength) {
            throw new Error(`Pointer out of bounds! ptr(${payloadPtr}) + len(${payloadLen}) > buffer(${sharedMemoryBuffer.byteLength})`);
        }

        if (operation === 'heavy_math' && payloadLen > 0) {
            // 🚀 ZERO-COPY READ: Directly map into SharedArrayBuffer
            const view = new Uint8Array(sharedMemoryBuffer, payloadPtr, payloadLen);
            for (let i = 0; i < view.length; i++) result += view[i];
        }
        
        // Simulate heavy work
        for (let i = 0; i < 1000000; i++) result += Math.sqrt(i);
    } catch (err) {
        console.error(`[Worker] ❌ Task ${taskId} failed:`, err);
        self.postMessage({ taskId, error: err.message });
        return;
    }

    self.postMessage({ taskId, result });
};