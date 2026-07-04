// runner.worker.js
import { WasmRuntime } from './wasm-runtime.js';

let nextThreadId = 1;

self.onmessage = async (e) => {
    const { wasmModule, sharedMemory } = e.data;

    const runtime = new WasmRuntime({
        initialMemory: 256, maxMemory: 512,
        onStdout: (msg) => self.postMessage({ type: 'log', msg, level: 'info' }),
        onStderr: (msg) => self.postMessage({ type: 'log', msg, level: 'warn' })
    });

    // C++ Thread Spawn Import
    runtime.addImport('env', 'ww_spawn_cpp', (funcNamePtr, argsJsonPtr) => {
        const funcName = runtime.readString(funcNamePtr);
        const argsJson = runtime.readString(argsJsonPtr);
        const threadId = nextThreadId++;
        
        self.postMessage({ type: 'log', msg: `🚀 Spawning C++ Worker ${threadId} for '${funcName}'`, level: 'info' });
        self.postMessage({ type: 'spawn_cpp', funcName, argsJson, threadId });
        return threadId;
    });

    try {
        const importObject = {
            env: { 
                memory: sharedMemory,
                ...runtime._customImports.env 
            },
            wasi_snapshot_preview1: runtime.wasiImports
        };

        // 🚨 FIX: When passing a WebAssembly.Module, instantiate returns the Instance directly!
        const instance = await WebAssembly.instantiate(wasmModule, importObject);
        
        // Assign the instance, exports, and memory back to the runtime
        runtime.instance = instance;
        runtime.exports = instance.exports;
        runtime.memory = sharedMemory; 
        
        const exitCode = runtime.run();
        self.postMessage({ type: 'done', exitCode });
    } catch (err) {
        self.postMessage({ type: 'error', error: err.message || String(err) });
    }
};