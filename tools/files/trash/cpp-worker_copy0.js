// cpp-worker.js

// Basic WASI stubs so the C++ code doesn't crash on startup
const wasiStubs = {
    args_get: () => 0,
    args_sizes_get: (argcPtr, argvBufSizePtr) => {
        // We can't easily use the shared memory view here without knowing the offset, 
        // but for simple functions it's fine.
        return 0; 
    },
    environ_get: () => 0,
    environ_sizes_get: () => 0,
    fd_write: (fd, iovs, iovs_len, nwritten) => {
        // Basic std::cout stub for the workers
        // Note: In a real scenario, you'd use Atomics to lock the console output 
        // so multiple threads don't interleave their text.
        return 0; 
    },
    proc_exit: () => 0,
    // ... add other required WASI stubs here
};

self.onmessage = async (e) => {
    const { wasmModule, sharedMemory, threadId } = e.data;

    try {
        // Instantiate the C++ code using the SHARED memory from the main thread
        const { instance } = await WebAssembly.instantiate(wasmModule, {
            env: { 
                memory: sharedMemory // <--- Injecting the ONE shared memory
            },
            wasi_snapshot_preview1: wasiStubs
        });

        self.postMessage({ type: 'log', threadId, msg: 'Instantiated with shared memory!' });

        // Call the exported C++ function
        // Because the memory is shared, this C++ code can read/write to the exact same 
        // heap as the other workers.
        if (instance.exports.heavy_calculation) {
            const result = instance.exports.heavy_calculation(threadId);
            self.postMessage({ type: 'done', threadId, result });
        } else {
            self.postMessage({ type: 'log', threadId, msg: 'Function not found!' });
        }

    } catch (err) {
        self.postMessage({ type: 'log', threadId, msg: `Error: ${err.message}` });
    }
};