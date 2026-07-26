
//runner.worker.js
import { WasmRuntime } from './wasm-runtime.js';

let nextWorkerId = 0;

self.onmessage = async (e) => {
    const { wasmModule, sharedMemory } = e.data;

    const runtime = new WasmRuntime({
        initialMemory: 256, maxMemory: 512,
        onStdout: (msg) => self.postMessage({ type: 'log', msg, level: 'info' }),
        onStderr: (msg) => self.postMessage({ type: 'log', msg, level: 'warn' })
    });

    // 🚀 NEW: Create a Web Worker and return its ID
    runtime.addImport('env', 'ww_create_worker', () => {
        const workerId = nextWorkerId++;
        self.postMessage({ type: 'create_worker', workerId });
        return workerId;
    });

    // 🚀 NEW: Run a function on a specific Web Worker
    runtime.addImport('env', 'ww_run_on_worker', (workerId, funcId, argsPtr) => {
        self.postMessage({ 
            type: 'run_on_worker', 
            workerId, 
            funcId, 
            argsPtr 
        });
    });

    try {
        const importObject = {
            env: { memory: sharedMemory, ...runtime._customImports.env },
            wasi_snapshot_preview1: runtime.wasiImports
        };

        const instance = await WebAssembly.instantiate(wasmModule, importObject);
        runtime.instance = instance;
        runtime.exports = instance.exports;
        runtime.memory = sharedMemory; 
        
        const exitCode = runtime.run();
        self.postMessage({ type: 'done', exitCode });
    } catch (err) {
        self.postMessage({ type: 'error', error: err.message || String(err) });
    }
};