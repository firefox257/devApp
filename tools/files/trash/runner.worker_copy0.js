// runner.worker.js
import { WasmRuntime } from './wasm-runtime.js';

self.onmessage = async (e) => {
    const { wasmBinary } = e.data;

    const runtime = new WasmRuntime({
        initialMemory: 256, maxMemory: 512,
        onStdout: (msg) => self.postMessage({ type: 'log', msg, level: 'info' }),
        onStderr: (msg) => self.postMessage({ type: 'log', msg, level: 'warn' })
    });

    // JS Imports
    runtime.addImport('env', 'ww_spawn_js', (jsCodePtr, ctrlPtr) => {
        const jsCode = runtime.readString(jsCodePtr);
        
        // 🚨 GET THE WASM SHARED ARRAY BUFFER
        const sharedBuffer = runtime.memory.buffer; 
        
        // Initialize status to 0 in the WASM shared memory at the C++ pointer
        const ctrlView = new Int32Array(sharedBuffer, ctrlPtr, 2);
        Atomics.store(ctrlView, 0, 0); 
        
        self.postMessage({ type: 'log', msg: `🚀 Spawning WWThread (Heap Addr: ${ctrlPtr})`, level: 'info' });
        
        // Delegate to Main Thread, passing the WASM SharedArrayBuffer
        self.postMessage({ 
            type: 'spawn_js', 
            spawnCode: jsCode, 
            ctrlPtr: ctrlPtr,
            sharedBuffer: sharedBuffer 
        });
        
        return 1; 
    });

    runtime.addImport('env', 'ww_join', (ctrlPtr) => {
        const sharedBuffer = runtime.memory.buffer;
        self.postMessage({ type: 'log', msg: `⏳ Joining WWThread (Heap Addr: ${ctrlPtr})...`, level: 'info' });
        
        // 🚨 BLOCK using the WASM SharedArrayBuffer!
        const ctrlView = new Int32Array(sharedBuffer, ctrlPtr, 2);
        Atomics.wait(ctrlView, 0, 0); // Wait for status to change from 0
        
        const result = ctrlView[1]; // Read result directly from C++ heap
        self.postMessage({ type: 'log', msg: `✅ Joined! Result: ${result}`, level: 'success' });
        return result;
    });

    try {
        await runtime.instantiate(wasmBinary);
        const exitCode = runtime.run();
        self.postMessage({ type: 'done', exitCode });
    } catch (err) {
        self.postMessage({ type: 'error', error: err.message || String(err) });
    }
};