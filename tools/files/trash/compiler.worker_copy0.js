// compiler.worker.js
import { runClang, resetFileCache } from './bundle.js';

// Forward console logs to main thread so they appear in the UI console
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
	self.postMessage({ type: 'log', msg: args.join(' '), level: 'info' });
	originalLog(...args);
};
console.error = (...args) => {
	self.postMessage({ type: 'log', msg: args.join(' '), level: 'error' });
	originalError(...args);
};

self.onmessage = async (e) => {
	// Destructure both standard compilation data and the new cache reset data
	const { id, sourcePath, sourceCode, args, action, paths } = e.data;

	// ==========================================
	// 1. HANDLE CACHE RESET ACTIONS FROM UI
	// ==========================================
	if (action === 'resetCache') {
		// Call the updated resetFileCache which now accepts strings, arrays, or null
		resetFileCache(paths);

		const target = paths
		? (Array.isArray(paths) ? paths.join(', ') : paths)
		: 'ALL files';

		self.postMessage({
				type: 'log',
				msg: `✅ Cache reset successfully for: ${target}`,
				level: 'success'
			});
		return; // Exit early, no compilation needed
	}

	// ==========================================
	// 2. STANDARD COMPILATION FLOW
	// ==========================================
	try {
		self.postMessage({ type: 'status', msg: 'Initializing compiler...', progress: 20 });

		// NOTE: We intentionally removed the automatic `resetFileCache()` here.
		// This allows the user's manual cache reset buttons in the UI to actually work!

		const files = {};
		if (sourceCode) {
			files[sourcePath] = sourceCode;
		} else {
			files[sourcePath] = `lazy://${sourcePath}`;
		}

		self.postMessage({ type: 'status', msg: 'Running clang++...', progress: 40 });

		const compileStart = performance.now();

		// Capture stdout/stderr from Clang and send to main thread
		const result = await runClang(args, files, {
				stdout: (bytes) => {
					if (bytes) self.postMessage({ type: 'log', msg: new TextDecoder().decode(bytes), level: 'info' });
				},
				stderr: (bytes) => {
					if (bytes) self.postMessage({ type: 'log', msg: new TextDecoder().decode(bytes), level: 'warn' });
				}
			});

		const compileTime = ((performance.now() - compileStart) / 1000).toFixed(2);
		self.postMessage({ type: 'log', msg: `Compilation took ${compileTime}s`, level: 'info' });

		// Extract transferable ArrayBuffers for zero-copy messaging
		const transferables = [];
		const outputs = {};
		for (const [filename, content] of Object.entries(result)) {
			if (filename === 'tmp' || filename === 'usr') continue;
			outputs[filename] = content;
			if (content instanceof Uint8Array) {
				transferables.push(content.buffer);
			}
		}

		self.postMessage({
				type: 'result',
				id,
				success: true,
				files: outputs
			}, transferables);

	} catch (error) {
		self.postMessage({
				type: 'result',
				id,
				success: false,
				error: error.message || String(error)
			});
	}
};