// ✅ NEW CODE
//cpp-worker.js

const cppWorkerCode = `
    self.onmessage = async function(e) {
        const { wasmModule, sharedMemory, funcName, argsJson, threadId } = e.data;
        try {
            // Basic WASI stubs
            const wasiStubs = {
                args_get: () => 0, args_sizes_get: () => 0,
                environ_get: () => 0, environ_sizes_get: () => 0,
                fd_write: () => 0, proc_exit: () => 0,
                clock_time_get: () => 0, random_get: () => 0
            };

            const imports = {
                env: { memory: sharedMemory },
                wasi_snapshot_preview1: wasiStubs
            };

            // 🚨 FIX 1: Dynamically stub any missing 'env' imports (like ww_spawn_cpp)
            // This prevents the LinkError without needing to know every custom import name.
            for (const imp of WebAssembly.Module.imports(wasmModule)) {
                if (imp.module === 'env' && imp.kind === 'function') {
                    if (!imports.env[imp.name]) {
                        imports.env[imp.name] = () => 0; // Dummy function returning 0
                    }
                }
            }

            // 🚨 FIX 2: When passing a WebAssembly.Module, instantiate returns the Instance directly!
            const instance = await WebAssembly.instantiate(wasmModule, imports);

            const func = instance.exports[funcName];
            if (!func) throw new Error('Function not exported: ' + funcName);
            
            const args = JSON.parse(argsJson);
            const result = func(...args);
            
            self.postMessage({ type: 'done', threadId, result });
        } catch (err) {
            self.postMessage({ type: 'error', threadId, msg: err.message });
        }
    };
`;