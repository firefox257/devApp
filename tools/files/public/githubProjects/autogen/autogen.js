// ./autogen.js
// Dynamically resolve the worker URL based on where autogen.js is loaded from
// This prevents 404 errors when the HTML file is in a different directory than the JS files.
const AUTOGEN_WORKER_URL = '/githubProjects/autogen/autogen_worker.js';
class AgFuture {
constructor(runtime, futurePtr) { this.runtime = runtime; this.futurePtr = futurePtr; }
get status() { return new DataView(this.runtime.sharedMemory.buffer).getUint32(this.futurePtr, true); }
get resultPtr() { return new DataView(this.runtime.sharedMemory.buffer).getUint32(this.futurePtr + 4, true); }
get errorCode() { return new DataView(this.runtime.sharedMemory.buffer).getUint32(this.futurePtr + 8, true); }
async awaitResult(type = 'uint32') {
let attempts = 0; const maxAttempts = 1000;
while (this.status === 0) {
if (++attempts > maxAttempts) { await this.runtime.callExport(0, 'cppfree', this.futurePtr); throw new Error('AgFuture timed out'); }
await new Promise(r => setTimeout(r, 10));
}
if (this.status === 2) { const err = this.errorCode; await this.runtime.callExport(0, 'cppfree', this.futurePtr); throw new Error(`Future rejected: ${err}`); }
const ptr = this.resultPtr; let value; const view = new DataView(this.runtime.sharedMemory.buffer);
if (type === 'void' || ptr === 0) value = undefined;
else if (type === 'int32') value = view.getInt32(ptr, true);
else if (type === 'uint32') value = view.getUint32(ptr, true);
else if (type === 'float') value = view.getFloat32(ptr, true);
else if (type === 'double') value = view.getFloat64(ptr, true);
else value = ptr;
if (ptr !== 0) await this.runtime.callExport(0, 'cppfree', ptr);
await this.runtime.callExport(0, 'cppfree', this.futurePtr); return value;
}
}
class AutogenRuntime {
constructor() {
this.sharedMemory = new WebAssembly.Memory({ initial: 256, maximum: 4096, shared: true });
this.wasmModule = null; this.workers = new Map(); this.nextWorkerId = 1;
this.dedicatedCount = 0; this.undedicatedCount = 0; this.state = 'UNINITIALIZED';
this.pendingCalls = new Map(); this.onTestResult = null;
this.mainWasmInstance = null;
this.mainExtensions = new Map();
}
registerMainExtension(name, handler) {
this.mainExtensions.set(name, handler);
}
registerWorkerExtension(name, func) {
const funcStr = func.toString();
for (const [id, info] of this.workers.entries()) {
info.worker.postMessage({
type: 'REGISTER_WORKER_EXTENSION',
name: name,
func_str: funcStr
});
}
}
_readString(ptr) {
if (!this.sharedMemory || !ptr) return "";
try {
const view8 = new Uint8Array(this.sharedMemory.buffer);
let str = "";
for (let j = ptr; j < view8.length && view8[j] !== 0; j++) {
str += String.fromCharCode(view8[j]);
}
return str;
} catch (err) { return ""; }
}
async initialize(wasmUrl) {
this.state = 'CONFIGURING';
const response = await fetch(wasmUrl);
if (!response.ok) { this.state = 'FAILED'; throw new Error(`HTTP Error ${response.status} fetching ${wasmUrl}`); }
this.state = 'INITIALIZING_WASM';
this.wasmModule = await WebAssembly.compile(await response.arrayBuffer());
const wasiStub = {
proc_exit: (code) => {
const err = new Error(`WASI proc_exit called with code ${code}`);
err.name = 'ExitStatus';
err.code = code;
throw err;
},
args_get: () => 0,
args_sizes_get: (argcPtr, argvBufSizePtr) => {
const view = new DataView(this.sharedMemory.buffer);
view.setUint32(argcPtr, 0, true);
view.setUint32(argvBufSizePtr, 0, true);
return 0;
},
environ_get: () => 0,
environ_sizes_get: (countPtr, bufSizePtr) => {
const view = new DataView(this.sharedMemory.buffer);
view.setUint32(countPtr, 0, true);
view.setUint32(bufSizePtr, 0, true);
return 0;
},
clock_res_get: (clockId, resolutionPtr) => {
const view = new DataView(this.sharedMemory.buffer);
view.setBigUint64(resolutionPtr, 1000000n, true);
return 0;
},
clock_time_get: (clockId, precision, timePtr) => {
const view = new DataView(this.sharedMemory.buffer);
const ns = BigInt(Date.now()) * 1000000n;
view.setBigUint64(timePtr, ns, true);
return 0;
},
fd_advise: () => 0,
fd_allocate: () => 0,
fd_close: () => 0,
fd_datasync: () => 0,
fd_fdstat_get: (fd, bufPtr) => {
if (fd === 1 || fd === 2) {
const view = new DataView(this.sharedMemory.buffer);
view.setUint8(bufPtr, 2); // __WASI_FILETYPE_CHARACTER_DEVICE
view.setUint16(bufPtr + 2, 0, true);
view.setBigUint64(bufPtr + 8, 0xFFFFFFFFFFFFFFFFn, true);
view.setBigUint64(bufPtr + 16, 0xFFFFFFFFFFFFFFFFn, true);
return 0;
}
return 8; // EBADF
},
fd_fdstat_set_flags: () => 0,
fd_fdstat_set_rights: () => 0,
fd_filestat_get: () => 44, // ENOTSUP
fd_filestat_set_size: () => 0,
fd_filestat_set_times: () => 0,
fd_pread: () => 8,
fd_prestat_dir_name: () => 8,
fd_prestat_get: () => 8,
fd_pwrite: () => 8,
fd_read: () => 8,
fd_readdir: () => 44,
fd_renumber: () => 8,
fd_seek: () => 8,
fd_sync: () => 44,
fd_tell: () => 8,
fd_write: (fd, iovsPtr, iovsLen, nwrittenPtr) => {
if (fd !== 1 && fd !== 2) return 8; // EBADF
const view = new DataView(this.sharedMemory.buffer);
const mem = new Uint8Array(this.sharedMemory.buffer);
let total = 0;
const chunks = [];
for (let i = 0; i < iovsLen; i++) {
const ptr = view.getUint32(iovsPtr + i * 8, true);
const len = view.getUint32(iovsPtr + i * 8 + 4, true);
chunks.push(mem.subarray(ptr, ptr + len));
total += len;
}
const combined = new Uint8Array(total);
let offset = 0;
for (const chunk of chunks) {
combined.set(chunk, offset);
offset += chunk.length;
}
const str = new TextDecoder().decode(combined);
if (fd === 1) console.log("[WASM-MAIN]", str);
if (fd === 2) console.error("[WASM-MAIN]", str);
view.setUint32(nwrittenPtr, total, true);
return 0;
},
path_create_directory: () => 44,
path_filestat_get: () => 44,
path_filestat_set_times: () => 44,
path_link: () => 44,
path_open: () => 44,
path_readlink: () => 44,
path_remove_directory: () => 44,
path_rename: () => 44,
path_symlink: () => 44,
path_unlink_file: () => 44,
poll_oneoff: (subPtr, retPtr, nSubs, nEventsPtr) => {
const view = new DataView(this.sharedMemory.buffer);
let eventsWritten = 0;
for (let i = 0; i < nSubs; i++) {
const subBase = subPtr + i * 48;
const userdata = view.getBigUint64(subBase, true);
const type = view.getUint8(subBase + 8);
const retBase = retPtr + eventsWritten * 32;
view.setBigUint64(retBase, userdata, true);
view.setUint8(retBase + 10, type);
if (type === 0) { // CLOCK_SUBSCRIPTION
const flags = view.getUint16(subBase + 40, true);
let timeoutNs = view.getBigUint64(subBase + 24, true);
if (flags & 1) { // SUBSCRIPTION_CLOCK_ABSTIME
const nowNs = BigInt(Date.now()) * 1000000n;
const diffNs = timeoutNs - nowNs;
timeoutNs = diffNs > 0n ? diffNs : 0n;
}
const timeoutMs = Number(timeoutNs / 1000000n);
if (typeof Atomics !== 'undefined') {
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
Atomics.wait(waitBuffer, 0, 0, timeoutMs);
} else {
const start = Date.now();
while (Date.now() - start < timeoutMs) {}
}
view.setUint16(retBase + 8, 0, true);
eventsWritten++;
} else {
view.setUint16(retBase + 8, 44, true); // ENOTSUP
eventsWritten++;
}
}
view.setUint32(nEventsPtr, eventsWritten, true);
return 0;
},
random_get: (bufPtr, bufLen) => {
const memView = new Uint8Array(this.sharedMemory.buffer, bufPtr, bufLen);
crypto.getRandomValues(memView);
return 0;
},
sched_yield: () => 0,
sock_accept: () => 44,
sock_recv: () => 44,
sock_send: () => 44,
sock_shutdown: () => 44
};
const tempInstance = await WebAssembly.instantiate(this.wasmModule, {
env: {
memory: this.sharedMemory,
js_msginfo: () => {}, js_msgwarn: () => {}, js_msgerr: () => {},
js_report_test_result: () => {}, js_post_async_task: () => {}, js_sync_call: () => {},
js_yield_coroutine: () => {}, js_ext_call_async: () => {}, js_ext_call_sync: () => {}, js_ext_call_fire_and_forget: () => {}
},
wasi_snapshot_preview1: wasiStub
});
this.mainWasmInstance = tempInstance;
if (tempInstance.exports.ag_set_worker_id) tempInstance.exports.ag_set_worker_id(0);
this.dedicatedCount = tempInstance.exports.get_dedicated_count ? tempInstance.exports.get_dedicated_count() : 1;
this.undedicatedCount = tempInstance.exports.get_undedicated_count ? tempInstance.exports.get_undedicated_count() : 2;
let autogenCtxPtr = 0;
if (tempInstance.exports.ag_alloc_context) autogenCtxPtr = tempInstance.exports.ag_alloc_context();
this.state = 'CREATING_WORKERS';
await this._createWorker('MAIN', 0, false, autogenCtxPtr);
for (let i = 0; i < this.dedicatedCount; i++) await this._createWorker('DEDICATED', this.nextWorkerId++, true, autogenCtxPtr);
for (let i = 0; i < this.undedicatedCount; i++) await this._createWorker('UNDEDICATED', this.nextWorkerId++, false, autogenCtxPtr);
this.state = 'ESTABLISHING_MESSAGEPORT_MESH'; this._establishMesh();
this.state = 'INITIALIZING_RUNTIME';
await this._initGlobals();
this.state = 'READY'; this.state = 'RUNNING'; console.log("AutogenRuntime: RUNNING.");
}
async _initGlobals() {
const count = await this.callExport(0, 'ag_get_globals_count');
for (let i = 0; i < count; i++) {
const namePtr = await this.callExport(0, 'ag_get_global_name', i);
if (!namePtr) continue;
const view8 = new Uint8Array(this.sharedMemory.buffer);
let name = "";
for (let j = namePtr; view8[j] !== 0; j++) name += String.fromCharCode(view8[j]);
const initFn = `init_${name}`;
const sharedPtr = await this.callExport(0, initFn);
const setFn = `set_${name}`;
for (const [id, info] of this.workers.entries()) {
await this.callExport(id, setFn, sharedPtr);
}
}
}
async _createWorker(type, id, isDedicated, autogenCtxPtr = 0) {
return new Promise((resolve, reject) => {
// Use the dynamically resolved absolute URL to prevent 404s
const worker = new Worker(AUTOGEN_WORKER_URL);
const channel = new MessageChannel();
const workerInfo = { id, type, worker, port: channel.port1, isDedicated, initResolve: resolve, initReject: reject, state: 'CREATED' };
this.workers.set(id, workerInfo);
channel.port1.onmessage = (e) => this._handleWorkerMessage(id, e.data); channel.port1.start();
worker.onerror = (e) => {
let errMsg = 'Unknown worker error';
let details = [];
if (e instanceof ErrorEvent) {
errMsg = e.message || 'Unknown error';
if (e.filename) details.push(`File: ${e.filename}`);
if (e.lineno) details.push(`Line: ${e.lineno}`);
if (e.colno) details.push(`Col: ${e.colno}`);
if (e.error && e.error.stack) details.push(`Stack: ${e.error.stack}`);
} else {
// Generic Event (e.g., script load failure, CORS, 404, or Syntax Error in Firefox)
errMsg = e.type || 'Event';
details.push(`Likely a script load error (404 Not Found, CORS block, or Syntax Error).`);
details.push(`Attempted Worker URL: ${AUTOGEN_WORKER_URL}`);
if (e.target && e.target.src) details.push(`Target URL: ${e.target.src}`);
}
const fullMsg = `${errMsg} [${details.join(' | ')}]`;
console.error(`[Main] Worker ${id} FATAL ERROR:`, fullMsg, e);
for (const [reqId, pending] of this.pendingCalls.entries()) {
if (pending.workerId === id) {
pending.reject(new Error(`Worker ${id} crashed: ${fullMsg}`));
this.pendingCalls.delete(reqId);
}
}
if (workerInfo.initReject) workerInfo.initReject(new Error(fullMsg));
this.state = 'FAILED';
};
worker.onmessageerror = (e) => { console.error(`[Main] Worker ${id} message error:`, e); };
worker.postMessage({ type: 'INIT', workerId: id, workerType: type, wasmModule: this.wasmModule, sharedMemory: this.sharedMemory, port: channel.port2, autogenCtxPtr }, [channel.port2]);
});
}
_establishMesh() {
const workerIds = Array.from(this.workers.keys());
for (let i = 0; i < workerIds.length; i++) {
for (let j = i + 1; j < workerIds.length; j++) {
const channel = new MessageChannel();
this.workers.get(workerIds[i]).worker.postMessage({ type: 'ADD_PEER', targetId: workerIds[j], port: channel.port1 }, [channel.port1]);
this.workers.get(workerIds[j]).worker.postMessage({ type: 'ADD_PEER', targetId: workerIds[i], port: channel.port2 }, [channel.port2]);
}
}
}
_handleWorkerMessage(workerId, data) {
const info = this.workers.get(workerId); if (!info) return;
switch (data.type) {
case 'READY': info.state = 'READY'; if (info.initResolve) info.initResolve(); break;
case 'INIT_FAILED': info.state = 'FAILED'; this.state = 'FAILED'; if (info.initReject) info.initReject(new Error(data.error)); break;
case 'MSG_INFO': console.log(`[Worker ${workerId}]`, data.msg); break;
case 'MSG_WARN': console.warn(`[Worker ${workerId}]`, data.msg); break;
case 'MSG_ERR': console.error(`[Worker ${workerId}]`, data.msg); break;
case 'TEST_RESULT': if (this.onTestResult) this.onTestResult({ workerId: workerId, testName: data.testName, passed: data.passed, message: data.message }); break;
case 'PONG_FROM_WORKER': if (this.meshTestResolve) { this.meshTestResolve({ passed: true, message: `Worker ${data.from} successfully received ping from Worker ${data.originalCaller}` }); this.meshTestResolve = null; } break;
case 'EXPORT_RESULT': { const pending = this.pendingCalls.get(data.requestId); if (pending) { this.pendingCalls.delete(data.requestId); if (data.success) pending.resolve(data.result); else pending.reject(new Error(data.error)); } break; }
case 'EXT_CALL_ASYNC': {
const handler = this.mainExtensions.get(data.name);
if (handler) {
try {
const jsonStr = this._readString(data.args_ptr);
const argsArray = JSON.parse(jsonStr);
const result = handler(data.caller_worker_id, ...argsArray);

const handleResult = (res) => {
const view = new DataView(this.sharedMemory.buffer);
let res_ptr = 0;
if (typeof res === 'number') {
res_ptr = this.mainWasmInstance.exports.cppmalloc(4);
new DataView(this.sharedMemory.buffer).setInt32(res_ptr, res, true);
} else if (res !== undefined && res !== null) {
res_ptr = res >>> 0;
}
view.setUint32(data.future_ptr + 4, res_ptr, true);
view.setUint32(data.future_ptr, 1, true);
Atomics.notify(new Int32Array(this.sharedMemory.buffer), data.future_ptr / 4, 1);
};

if (result && typeof result.then === 'function') {
result.then(handleResult).catch((err) => {
const view = new DataView(this.sharedMemory.buffer);
view.setUint32(data.future_ptr + 8, 0xDEADBEEF, true);
view.setUint32(data.future_ptr, 2, true);
Atomics.notify(new Int32Array(this.sharedMemory.buffer), data.future_ptr / 4, 1);
});
} else {
handleResult(result);
}
} catch (err) {
const view = new DataView(this.sharedMemory.buffer);
view.setUint32(data.future_ptr + 8, 0xDEADBEEF, true);
view.setUint32(data.future_ptr, 2, true);
Atomics.notify(new Int32Array(this.sharedMemory.buffer), data.future_ptr / 4, 1);
}
if (data.args_ptr && this.mainWasmInstance) this.mainWasmInstance.exports.cppfree(data.args_ptr);
} else {
const view = new DataView(this.sharedMemory.buffer);
view.setUint32(data.future_ptr + 8, 0xDEADBEEF, true); view.setUint32(data.future_ptr, 2, true);
Atomics.notify(new Int32Array(this.sharedMemory.buffer), data.future_ptr / 4, 1);
if (data.args_ptr && this.mainWasmInstance) this.mainWasmInstance.exports.cppfree(data.args_ptr);
}
break;
}
case 'EXT_CALL_SYNC': {
const handler = this.mainExtensions.get(data.name);
if (handler) {
try {
const jsonStr = this._readString(data.args_ptr);
const argsArray = JSON.parse(jsonStr);
const result = handler(data.caller_worker_id, ...argsArray);

const handleResult = (res) => {
const view = new DataView(this.sharedMemory.buffer);
let res_ptr = 0;
if (typeof res === 'number') {
res_ptr = this.mainWasmInstance.exports.cppmalloc(4);
new DataView(this.sharedMemory.buffer).setInt32(res_ptr, res, true);
} else if (res !== undefined && res !== null) {
res_ptr = res >>> 0;
}
view.setUint32(data.sync_req_ptr + 16, res_ptr, true);
view.setUint32(data.sync_req_ptr, 1, true);
Atomics.notify(new Int32Array(this.sharedMemory.buffer), data.sync_req_ptr / 4, 1);
};

if (result && typeof result.then === 'function') {
result.then(handleResult).catch((err) => {
const view = new DataView(this.sharedMemory.buffer);
view.setUint32(data.sync_req_ptr + 20, 0xDEADBEEF, true);
view.setUint32(data.sync_req_ptr, 2, true);
Atomics.notify(new Int32Array(this.sharedMemory.buffer), data.sync_req_ptr / 4, 1);
});
} else {
handleResult(result);
}
} catch (err) {
const view = new DataView(this.sharedMemory.buffer);
view.setUint32(data.sync_req_ptr + 20, 0xDEADBEEF, true);
view.setUint32(data.sync_req_ptr, 2, true);
Atomics.notify(new Int32Array(this.sharedMemory.buffer), data.sync_req_ptr / 4, 1);
}
if (data.args_ptr && this.mainWasmInstance) this.mainWasmInstance.exports.cppfree(data.args_ptr);
} else {
const view = new DataView(this.sharedMemory.buffer);
view.setUint32(data.sync_req_ptr + 20, 0xDEADBEEF, true); view.setUint32(data.sync_req_ptr, 2, true);
Atomics.notify(new Int32Array(this.sharedMemory.buffer), data.sync_req_ptr / 4, 1);
if (data.args_ptr && this.mainWasmInstance) this.mainWasmInstance.exports.cppfree(data.args_ptr);
}
break;
}
case 'EXT_CALL_FIRE_AND_FORGET': {
const handler = this.mainExtensions.get(data.name);
if (handler) {
try {
const jsonStr = this._readString(data.args_ptr);
const argsArray = JSON.parse(jsonStr);
handler(data.caller_worker_id, ...argsArray);
} catch(e) {}
if (data.args_ptr && this.mainWasmInstance) this.mainWasmInstance.exports.cppfree(data.args_ptr);
} else {
if (data.args_ptr && this.mainWasmInstance) this.mainWasmInstance.exports.cppfree(data.args_ptr);
}
break;
}
}
}
callExport(workerId, functionName, ...args) {
return new Promise((resolve, reject) => {
try {
const info = this.workers.get(workerId);
if (!info || (info.state !== 'READY' && info.state !== 'RUNNING')) return reject(new Error(`Worker ${workerId} not ready.`));
const requestId = Math.random().toString(36).substring(2, 15);
this.pendingCalls.set(requestId, { resolve, reject, workerId });
info.worker.postMessage({ type: 'CALL_EXPORT', requestId, functionName, args });
} catch (err) { reject(err); }
});
}
wrapFuture(futurePtr) { return new AgFuture(this, futurePtr); }
shutdown() {
if (this.state === 'SHUTDOWN' || this.state === 'FAILED' || this.state === 'UNINITIALIZED') return;
this.state = 'SHUTDOWN'; console.log("AutogenRuntime: Initiating shutdown...");
for (const [reqId, pending] of this.pendingCalls.entries()) pending.reject(new Error("Runtime shutdown"));
this.pendingCalls.clear();
for (const [id, info] of this.workers.entries()) { try { info.worker.postMessage({ type: 'SHUTDOWN' }); info.worker.terminate(); } catch (e) { console.error(`Failed to terminate worker ${id}:`, e); } }
this.workers.clear(); this.sharedMemory = null; this.wasmModule = null; this.mainWasmInstance = null; console.log("AutogenRuntime: Shutdown complete.");
}
}
globalThis.AgFuture = AgFuture;
globalThis.AutogenRuntime = AutogenRuntime;