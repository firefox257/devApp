// compiler.worker.js
import { runClang, resetFileCache } from './bundle.js';

const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => { self.postMessage({ type: 'log', msg: args.join(' '), level: 'info' }); originalLog(...args); };
console.error = (...args) => { self.postMessage({ type: 'log', msg: args.join(' '), level: 'error' }); originalError(...args); };

self.onmessage = async (e) => {
	const { id, sourcePath, sourceCode, args, action, paths } = e.data;

	if (action === 'resetCache') {
		resetFileCache(paths);
		const target = paths ? (Array.isArray(paths) ? paths.join(', ') : paths) : 'ALL files';
		self.postMessage({ type: 'log', msg: `✅ Cache reset successfully for: ${target}`, level: 'success' });
		return;
	}

	try {
		self.postMessage({ type: 'status', msg: 'Initializing compiler...', progress: 20 });
		const files = sourceCode ? { [sourcePath]: sourceCode } : { [sourcePath]: `lazy://${sourcePath}` };
		self.postMessage({ type: 'status', msg: 'Running clang++...', progress: 40 });

		const compileStart = performance.now();
		
		// FIX: Use streaming TextDecoder to prevent corrupted emojis/multi-byte chars
		const stdoutDecoder = new TextDecoder();
		const stderrDecoder = new TextDecoder();

		const result = await runClang(args, files, {
			stdout: (bytes) => {
				if (bytes) {
					const str = stdoutDecoder.decode(bytes, { stream: true });
					if (str) self.postMessage({ type: 'log', msg: str, level: 'info' });
				}
			},
			stderr: (bytes) => {
				if (bytes) {
					const str = stderrDecoder.decode(bytes, { stream: true });
					if (str) self.postMessage({ type: 'log', msg: str, level: 'warn' });
				}
			}
		});

		// Flush remaining bytes
		const finalOut = stdoutDecoder.decode();
		if (finalOut) self.postMessage({ type: 'log', msg: finalOut, level: 'info' });
		const finalErr = stderrDecoder.decode();
		if (finalErr) self.postMessage({ type: 'log', msg: finalErr, level: 'warn' });

		const compileTime = ((performance.now() - compileStart) / 1000).toFixed(2);
		self.postMessage({ type: 'log', msg: `Compilation took ${compileTime}s`, level: 'info' });

		const transferables = [];
		const outputs = {};
		for (const [filename, content] of Object.entries(result)) {
			if (filename === 'tmp' || filename === 'usr') continue;
			outputs[filename] = content;
			if (content instanceof Uint8Array) transferables.push(content.buffer);
		}

		self.postMessage({ type: 'result', id, success: true, files: outputs }, transferables);
	} catch (error) {
		self.postMessage({ type: 'result', id, success: false, error: error.message || String(error) });
	}
};