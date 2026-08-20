// /system/js/wasm-registry.js

export class WasmRegistry {
    constructor() {
        this.module = null;
        this.url = null;
    }

    /**
     * Fetches and compiles the WASM module exactly once.
     * @param {string} url - Path to the .wasm file
     * @returns {Promise<WebAssembly.Module>}
     */
    async load(url) {
        if (this.module) return this.module; // Return cached compiled module

        console.info(`[Registry] Fetching ${url}...`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const buffer = await response.arrayBuffer();
        console.info(`[Registry] Downloaded ${buffer.byteLength} bytes. Compiling...`);
        
        this.module = await WebAssembly.compile(buffer);
        this.url = url;
        console.info(`[Registry] Module compiled and cached successfully.`);
        return this.module;
    }

    /**
     * Creates a new, isolated WASM instance with its own memory.
     * @param {Object} options - Configuration for this specific instance
     * @returns {WasmInstance}
     */
    createInstance(options = {}) {
        if (!this.module) {
            throw new Error("Module not loaded. Call registry.load() first.");
        }

        // 1. Create a NEW memory space for this instance
        // Set shared: true ONLY if your server provides COOP/COEP headers
        const memory = new WebAssembly.Memory({
            initial: options.initialPages || 256,
            maximum: options.maximumPages || 2048,
            shared: options.shared || false 
        });

        // 2. Build the import object, injecting this instance's specific memory
        const importObject = {
            env: {
                memory: memory,
                ...(options.imports?.env || {})
            },
            sys: {
                ...(options.imports?.sys || {})
            }
        };

        // 3. Instantiate synchronously (fast, since module is pre-compiled)
        const instance = new WebAssembly.Instance(this.module, importObject);

        // 4. Return the wrapped instance
        return new WasmInstance(instance, memory, options);
    }
}

export class WasmInstance {
    constructor(instance, memory, options) {
        this.instance = instance;
        this.memory = memory;
        this.onStdout = options.onStdout || console.log;
        this.onStderr = options.onStderr || console.error;
        
        // Fallback bump allocator pointer (if C++ malloc isn't used)
        this._heapPtr = 1024; 
    }

    run() {
        if (this.instance.exports.main) {
            return this.instance.exports.main();
        } else if (this.instance.exports._start) {
            this.instance.exports._start();
            return 0;
        }
        return 0;
    }

    callExport(funcName, ...args) {
        if (!this.instance.exports[funcName]) {
            throw new Error(`Export '${funcName}' not found`);
        }
        return this.instance.exports[funcName](...args);
    }

    writeString(str) {
        const bytes = new TextEncoder().encode(str + '\0');
        let ptr;
        
        // Use C++ malloc if exported, otherwise fallback to bump allocator
        if (this.instance.exports.malloc) {
            ptr = this.instance.exports.malloc(bytes.length);
        } else {
            ptr = this._heapPtr;
            this._heapPtr += bytes.length + (8 - (bytes.length % 8)); // 8-byte align
        }

        const mem = new Uint8Array(this.memory.buffer, ptr, bytes.length);
        mem.set(bytes);
        return ptr;
    }

    readString(ptr) {
        const mem = new Uint8Array(this.memory.buffer);
        let len = 0;
        while (ptr + len < mem.length && mem[ptr + len] !== 0) {
            len++;
        }
        return new TextDecoder().decode(mem.slice(ptr, ptr + len));
    }

    freeString(ptr) {
        if (this.instance.exports.free) {
            this.instance.exports.free(ptr);
        }
        // Note: Bump allocator memory is intentionally not reclaimed here.
    }
}