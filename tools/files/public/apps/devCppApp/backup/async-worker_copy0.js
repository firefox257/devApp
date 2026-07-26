// async-worker.js
self.onmessage = function(e) {
    const { taskId, operation, payloadPtr, payloadLen } = e.data;
    
    // Simulate heavy async work (e.g., image processing, complex math, fetching)
    let result = 0;
    if (operation === 'heavy_math') {
        for (let i = 0; i < 100000000; i++) result += Math.sqrt(i);
    }

    // Send result back to main thread
    self.postMessage({ taskId, result });
};