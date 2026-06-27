const worker = new Worker('compiler.worker.js', { type: 'module' });

worker.onmessage = async (e) => {
    const { id, success, files, error } = e.data;
    
    if (success) {
        for (const [filename, content] of Object.entries(files)) {
            const serverPath = `compiled/${filename}`;
            
            if (content instanceof Uint8Array) {
                // Binary file -> use your /upload endpoint
                await uploadBinary(serverPath, content);
            } else {
                // Text file -> use api.saveFile
                await api.saveFile(serverPath, content);
            }
        }
        console.log("Build complete and saved!");
    } else {
        console.error("Build failed:", error);
    }
};

// Trigger it
worker.postMessage({
    id: 1,
    sourcePath: 'src/main.c',
    sourceCode: '#include <stdio.h>\nint main() { return 0; }',
    args: ['clang', '-O2', '-o', 'main.wasm', 'src/main.c']
});