// fetch_ext.js
/**
 * Registers the Autogen fetch worker extension supporting raw binary/text data.
 * @param {AutogenRuntime} runtime - The active AutogenRuntime instance.
 */
export function registerFetchExtension(runtime) {
    runtime.registerWorkerExtension("fetch", async (url) => {
        // In the worker context, `wasmInstance` and `sharedMemory` are global variables provided by Autogen.
        if (typeof wasmInstance === 'undefined' || typeof sharedMemory === 'undefined') {
            throw new Error("fetch ext: cannot resolve wasmInstance/sharedMemory in worker");
        }

        const response = await fetch(url);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const size = bytes.length;
        
        // Allocate exact space for raw data using the officially exported cppmalloc function
        const dataPtr = wasmInstance.exports.cppmalloc(size || 1);
        
        // Re-create view AFTER alloc in case heap grew and detached the buffer
        new Uint8Array(sharedMemory.buffer).set(bytes, dataPtr);
        
        // Allocate FetchResult struct (16 bytes: 8 for data_ptr, 4 for size, 4 for status)
        const structPtr = wasmInstance.exports.cppmalloc(16);
        
        // Re-create view AFTER alloc
        const dv = new DataView(sharedMemory.buffer);
        dv.setBigUint64(structPtr, BigInt(dataPtr), true);
        dv.setUint32(structPtr + 8, size, true);
        dv.setUint32(structPtr + 12, response.status, true);
        
        return structPtr;
    });
}