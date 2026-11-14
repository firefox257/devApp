// ./autogen_worker.js
let wasmInstance = null;
let workerId = 0;
let mainThreadPort = null;
let sharedMemory = null;
let peerPorts = new Map();
let isReady = false;
const SharedViews = {
_currentBuffer: null, _uint8: null, _dataView: null, _int32: null,
refresh() {
if (this._currentBuffer !== sharedMemory.buffer) {
this._currentBuffer = sharedMemory.buffer;
this._uint8 = new Uint8Array(this._currentBuffer);
this._dataView = new DataView(this._currentBuffer);
this._int32 = new Int32Array(this._currentBuffer);
}
},
get uint8() { this.refresh(); return this._uint8; },
get dataView() { this.refresh(); return this._dataView; },
get int32() { this.refresh(); return this._int32; }
};
const workerLocalExtensions = new Map();
self.onmessage = async function(e) { await handleWorkerMessage(e.data); };
self.onerror = function(event) {
let msg = 'Unknown error';
let details = [];
if (event instanceof ErrorEvent) {
msg = event.message || 'Unknown error';
if (event.filename) details.push(`File: ${event.filename}`);
if (event.lineno) details.push(`Line: ${event.lineno}`);
if (event.colno) details.push(`Col: ${event.colno}`);
if (event.error && event.error.stack) details.push(`Stack: ${event.error.stack}`);
} else {
msg = event.type || 'Event';
try {
let eventProps = {};
for (let key in event) {
try { eventProps[key] = event[key]; } catch(err) {}
}
details.push(`Event: ${JSON.stringify(eventProps)}`);
} catch (err) {
details.push(`Event: ${String(event)}`);
}
}
const fullMsg = `${msg} [${details.join(', ')}]`;
sendToMain({ type: 'MSG_ERR', msg: `Worker ${workerId !== undefined ? workerId : 'UNKNOWN'} uncaught error: ${fullMsg}` });
};
self.onunhandledrejection = function(event) {
let reason = event.reason;
let msg = "Unknown rejection";
if (reason instanceof Error) {
msg = `${reason.name}: ${reason.message}
${reason.stack || ''}`;
} else if (reason && typeof reason === 'object') {
try { msg = `Rejected Object: ${JSON.stringify(reason)}`; } catch(e) { msg = String(reason); }
} else {
msg = String(reason);
}
sendToMain({ type: 'MSG_ERR', msg: `Worker ${workerId !== undefined ? workerId : 'UNKNOWN'} unhandled promise rejection: ${msg}` });
};
async function handleWorkerMessage(data) {
if (data.type === 'INIT') {
workerId = data.workerId; sharedMemory = data.sharedMemory;
if (data.port) { mainThreadPort = data.port; mainThreadPort.onmessage = (e) => handleWorkerMessage(e.data); mainThreadPort.start(); }
const wasiStub = {
proc_exit: (code) => {
const err = new Error(`WASI proc_exit called with code ${code}`);
err.name = 'ExitStatus';
err.code = code;
throw err;
},
args_get: () => 0,
args_sizes_get: (argcPtr, argvBufSizePtr) => {
const view = SharedViews.dataView;
view.setUint32(argcPtr, 0, true);
view.setUint32(argvBufSizePtr, 0, true);
return 0;
},
environ_get: () => 0,
environ_sizes_get: (countPtr, bufSizePtr) => {
const view = SharedViews.dataView;
view.setUint32(countPtr, 0, true);
view.setUint32(bufSizePtr, 0, true);
return 0;
},
clock_res_get: (clockId, resolutionPtr) => {
const view = SharedViews.dataView;
view.setBigUint64(resolutionPtr, 1000000n, true);
return 0;
},
clock_time_get: (clockId, precision, timePtr) => {
const view = SharedViews.dataView;
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
const view = SharedViews.dataView;
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
const mem = SharedViews.uint8;
const view = SharedViews.dataView;
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
if (fd === 1) sendToMain({ type: 'MSG_INFO', msg: str });
if (fd === 2) sendToMain({ type: 'MSG_ERR', msg: str });
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
const view = SharedViews.dataView;
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
const memView = new Uint8Array(SharedViews.uint8.buffer, bufPtr, bufLen);
crypto.getRandomValues(memView);
return 0;
},
sched_yield: () => 0,
sock_accept: () => 44,
sock_recv: () => 44,
sock_send: () => 44,
sock_shutdown: () => 44
};
const importObject = {
env: {
memory: sharedMemory,
js_msginfo: (ptr) => sendToMain({ type: 'MSG_INFO', msg: readString(ptr) }),
js_msgwarn: (ptr) => sendToMain({ type: 'MSG_WARN', msg: readString(ptr) }),
js_msgerr: (ptr) => sendToMain({ type: 'MSG_ERR', msg: readString(ptr) }),
js_report_test_result: (name_ptr, passed, msg_ptr) => { sendToMain({ type: 'TEST_RESULT', testName: readString(name_ptr >>> 0), passed: passed !== 0, message: readString(msg_ptr >>> 0) }); },
js_post_async_task: (target_worker_id, dispatcher_ptr, this_ptr, args_ptr, future_ptr) => {
const targetId = target_worker_id >>> 0; const targetPort = peerPorts.get(targetId);
if (targetPort) { targetPort.postMessage({ type: 'POST_ASYNC_TASK', dispatcher_ptr: dispatcher_ptr >>> 0, this_ptr: this_ptr >>> 0, args_ptr: args_ptr >>> 0, future_ptr: future_ptr >>> 0 }); }
else {
const future_ptr_u = future_ptr >>> 0; const view = SharedViews.dataView;
view.setUint32(future_ptr_u + 8, 0xDEADBEEF, true); view.setUint32(future_ptr_u, 2, true);
if ((args_ptr >>> 0) !== 0 && wasmInstance.exports.cppfree) { wasmInstance.exports.cppfree(args_ptr >>> 0); }
Atomics.notify(SharedViews.int32, future_ptr_u / 4, 1);
}
},
js_sync_call: (target_id, dispatcher_ptr, this_ptr, args_ptr, sync_req_ptr) => {
const port = peerPorts.get(target_id >>> 0);
if (port) { port.postMessage({ type: 'SYNC_CALL', dispatcher_ptr: dispatcher_ptr >>> 0, this_ptr: this_ptr >>> 0, args_ptr: args_ptr >>> 0, sync_req_ptr: sync_req_ptr >>> 0 }); }
else {
const view = SharedViews.dataView; const ptr = sync_req_ptr >>> 0;
view.setUint32(ptr + 20, 0xDEADBEEF, true); view.setUint32(ptr, 2, true);
if ((args_ptr >>> 0) !== 0 && wasmInstance.exports.cppfree) { wasmInstance.exports.cppfree(args_ptr >>> 0); }
Atomics.notify(SharedViews.int32, ptr / 4, 1);
}
},
js_yield_coroutine: (coro_handle_ptr) => { setTimeout(() => { if (wasmInstance.exports.ag_resume_coroutine) { wasmInstance.exports.ag_resume_coroutine(coro_handle_ptr >>> 0); } }, 0); },
js_ext_call_async: (context, name_ptr, args_ptr, future_ptr) => {
const name = readString(name_ptr);
const handler = (context === 1) ? workerLocalExtensions.get(name) : null;
if (context === 1 && handler) {
try {
const jsonStr = readString(args_ptr >>> 0);
const argsArray = JSON.parse(jsonStr);
const result = handler(...argsArray);

const handleResult = (res) => {
const view = SharedViews.dataView;
const f_ptr = future_ptr >>> 0;
let res_ptr = 0;
if (typeof res === 'number') {
res_ptr = wasmInstance.exports.cppmalloc(4);
view.setInt32(res_ptr, res, true);
} else if (res !== undefined && res !== null) {
res_ptr = res >>> 0;
}
view.setUint32(f_ptr + 4, res_ptr, true);
view.setUint32(f_ptr, 1, true);
Atomics.notify(SharedViews.int32, f_ptr / 4, 1);
};

if (result && typeof result.then === 'function') {
result.then(handleResult).catch((err) => {
const view = SharedViews.dataView;
view.setUint32(future_ptr + 8, 0xDEADBEEF, true); view.setUint32(future_ptr, 2, true);
Atomics.notify(SharedViews.int32, future_ptr / 4, 1);
});
} else {
handleResult(result);
}
} catch (err) {
const view = SharedViews.dataView;
view.setUint32(future_ptr + 8, 0xDEADBEEF, true); view.setUint32(future_ptr, 2, true);
Atomics.notify(SharedViews.int32, future_ptr / 4, 1);
}
if (args_ptr) wasmInstance.exports.cppfree(args_ptr);
}
else if (context === 0) { sendToMain({ type: 'EXT_CALL_ASYNC', name: name, args_ptr: args_ptr >>> 0, future_ptr: future_ptr >>> 0, caller_worker_id: workerId }); }
else {
const view = SharedViews.dataView; view.setUint32(future_ptr + 8, 0xDEADBEEF, true); view.setUint32(future_ptr, 2, true);
Atomics.notify(SharedViews.int32, future_ptr / 4, 1); if (args_ptr) wasmInstance.exports.cppfree(args_ptr);
}
},
js_ext_call_sync: (context, name_ptr, args_ptr, sync_req_ptr) => {
const name = readString(name_ptr);
const handler = (context === 1) ? workerLocalExtensions.get(name) : null;
if (context === 1 && handler) {
try {
const jsonStr = readString(args_ptr >>> 0);
const argsArray = JSON.parse(jsonStr);
const result = handler(...argsArray);

const handleResult = (res) => {
const view = SharedViews.dataView;
const ptr = sync_req_ptr >>> 0;
let res_ptr = 0;
if (typeof res === 'number') {
res_ptr = wasmInstance.exports.cppmalloc(4);
view.setInt32(res_ptr, res, true);
} else if (res !== undefined && res !== null) {
res_ptr = res >>> 0;
}
view.setUint32(ptr + 16, res_ptr, true);
view.setUint32(ptr, 1, true);
Atomics.notify(SharedViews.int32, ptr / 4, 1);
};

if (result && typeof result.then === 'function') {
result.then(handleResult).catch((err) => {
const view = SharedViews.dataView; view.setUint32(sync_req_ptr + 20, 0xDEADBEEF, true); view.setUint32(sync_req_ptr, 2, true);
Atomics.notify(SharedViews.int32, sync_req_ptr / 4, 1);
});
} else {
handleResult(result);
}
} catch (err) {
const view = SharedViews.dataView; view.setUint32(sync_req_ptr + 20, 0xDEADBEEF, true); view.setUint32(sync_req_ptr, 2, true);
Atomics.notify(SharedViews.int32, sync_req_ptr / 4, 1);
}
if (args_ptr) wasmInstance.exports.cppfree(args_ptr);
}
else if (context === 0) { sendToMain({ type: 'EXT_CALL_SYNC', name: name, args_ptr: args_ptr >>> 0, sync_req_ptr: sync_req_ptr >>> 0, caller_worker_id: workerId }); }
else {
const view = SharedViews.dataView; view.setUint32(sync_req_ptr + 20, 0xDEADBEEF, true); view.setUint32(sync_req_ptr, 2, true);
Atomics.notify(SharedViews.int32, sync_req_ptr / 4, 1); if (args_ptr) wasmInstance.exports.cppfree(args_ptr);
}
},
js_ext_call_fire_and_forget: (context, name_ptr, args_ptr) => {
const name = readString(name_ptr);
const handler = (context === 1) ? workerLocalExtensions.get(name) : null;
if (context === 1 && handler) {
try {
const jsonStr = readString(args_ptr >>> 0);
const argsArray = JSON.parse(jsonStr);
handler(...argsArray);
} catch(e) {}
if (args_ptr) wasmInstance.exports.cppfree(args_ptr);
}
else if (context === 0) { sendToMain({ type: 'EXT_CALL_FIRE_AND_FORGET', name: name, args_ptr: args_ptr >>> 0, caller_worker_id: workerId }); }
else { if (args_ptr) wasmInstance.exports.cppfree(args_ptr); }
}
},
wasi_snapshot_preview1: wasiStub
};
try {
wasmInstance = await WebAssembly.instantiate(data.wasmModule, importObject);
if (wasmInstance.exports.ag_call_ctors) wasmInstance.exports.ag_call_ctors();
else if (wasmInstance.exports.__wasm_call_ctors) wasmInstance.exports.__wasm_call_ctors();
if (wasmInstance.exports.__initSharedAllocator) wasmInstance.exports.__initSharedAllocator();
if (wasmInstance.exports.__initProcess) wasmInstance.exports.__initProcess(workerId);
if (wasmInstance.exports.ag_set_worker_id) wasmInstance.exports.ag_set_worker_id(workerId);
if (data.autogenCtxPtr && wasmInstance.exports.set_autogen_context) wasmInstance.exports.set_autogen_context(data.autogenCtxPtr);
if (wasmInstance.exports.ag_ensure_context) wasmInstance.exports.ag_ensure_context();
if (wasmInstance.exports.init_shared_globals) wasmInstance.exports.init_shared_globals();
isReady = true; sendToMain({ type: 'READY' });
} catch (err) {
let errMsg = "Unknown initialization error";
if (err instanceof Error) {
errMsg = `${err.name}: ${err.message}`;
if (err.stack) errMsg += `
Stack: ${err.stack}`;
} else if (err && typeof err === 'object') {
errMsg = `Thrown Object: ${err.name || 'Unknown'}`;
if (err.code !== undefined) errMsg += ` (Code: ${err.code})`;
try { errMsg += `
Details: ${JSON.stringify(err)}`; } catch(e) {}
} else {
errMsg = String(err);
}
console.error(`[Worker ${workerId}] INIT_FAILED:`, errMsg);
sendToMain({ type: 'INIT_FAILED', error: errMsg });
}
} else if (data.type === 'ADD_PEER') {
const port = data.port; peerPorts.set(data.targetId, port); port.onmessage = (e) => handlePeerMessage(data.targetId, e.data); port.start();
} else if (data.type === 'CALL_EXPORT') {
if (!isReady) {
const callerPort = peerPorts.get(data.originalCallerId || 0);
if (callerPort) callerPort.postMessage({ type: 'EXPORT_RESULT', requestId: data.requestId, success: false, error: 'AG_ERR_INVALID_CALL_STATE' });
else sendToMain({ type: 'EXPORT_RESULT', requestId: data.requestId, success: false, error: 'AG_ERR_INVALID_CALL_STATE' }); return;
}
try {
const func = wasmInstance.exports[data.functionName];
if (typeof func !== 'function') throw new Error(`Invalid function name: ${data.functionName}`);
const result = func(...(data.args || []));
const callerPort = peerPorts.get(data.originalCallerId || 0);
if (callerPort) callerPort.postMessage({ type: 'EXPORT_RESULT', requestId: data.requestId, success: true, result });
else sendToMain({ type: 'EXPORT_RESULT', requestId: data.requestId, success: true, result });
} catch (err) {
let errMsg = "Unknown export error";
if (err instanceof Error) {
errMsg = `${err.name}: ${err.message}
${err.stack || ''}`;
} else if (err && typeof err === 'object') {
errMsg = `Thrown Object: ${err.name || 'Unknown'} (Code: ${err.code})`;
} else {
errMsg = String(err);
}
console.error(`[Worker ${workerId}] CALL_EXPORT error:`, errMsg);
const callerPort = peerPorts.get(data.originalCallerId || 0);
if (callerPort) callerPort.postMessage({ type: 'EXPORT_RESULT', requestId: data.requestId, success: false, error: errMsg });
else sendToMain({ type: 'EXPORT_RESULT', requestId: data.requestId, success: false, error: errMsg });
}
} else if (data.type === 'PING_PEER') {
const targetPort = peerPorts.get(data.targetId);
if (targetPort) { targetPort.postMessage({ type: 'PING_RECEIVED', from: workerId }); }
else { sendToMain({ type: 'MSG_ERR', msg: `Worker ${workerId} failed to ping ${data.targetId}: peer not found` }); }
} else if (data.type === 'REGISTER_WORKER_EXTENSION') {
try {
const func = eval('(' + data.func_str + ')');
workerLocalExtensions.set(data.name, func);
} catch (e) {
sendToMain({ type: 'MSG_ERR', msg: `Worker ${workerId} failed to register extension: ${e.message}` });
}
} else if (data.type === 'SHUTDOWN') {
if (wasmInstance && wasmInstance.exports.autogen_shutdown) { try { wasmInstance.exports.autogen_shutdown(); } catch (e) {} }
self.close();
}
}
function handlePeerMessage(callerId, data) {
if (data.type === 'POST_ASYNC_TASK') {
const future_ptr = data.future_ptr >>> 0; const view = SharedViews.dataView;
if (!isReady) { view.setUint32(future_ptr + 8, 0xDEADBEEF, true); view.setUint32(future_ptr, 2, true); Atomics.notify(SharedViews.int32, future_ptr / 4, 1); return; }
try {
const dispatcher_ptr = data.dispatcher_ptr >>> 0;
const result = wasmInstance.exports.autogen_dispatch(dispatcher_ptr, 0, (data.this_ptr ?? 0) >>> 0, (data.args_ptr ?? 0) >>> 0);
if ((result >>> 0) === 0xBADF00D) {
view.setUint32(future_ptr + 8, 0xDEADBEEF, true); view.setUint32(future_ptr, 2, true);
if ((data.args_ptr >>> 0) !== 0 && wasmInstance.exports.cppfree) { wasmInstance.exports.cppfree(data.args_ptr >>> 0); }
} else { view.setUint32(future_ptr + 4, result >>> 0, true); view.setUint32(future_ptr, 1, true); }
} catch (err) {
let errMsg = "Unknown dispatch error";
if (err instanceof Error) {
errMsg = `${err.name}: ${err.message}`;
} else if (err && typeof err === 'object') {
errMsg = `Thrown Object: ${err.name || 'Unknown'} (Code: ${err.code})`;
} else {
errMsg = String(err);
}
console.error(`[Worker ${workerId}] Dispatch error:`, errMsg);
sendToMain({ type: 'MSG_ERR', msg: `Worker ${workerId} dispatch error: ${errMsg}` });
view.setUint32(future_ptr + 8, 0xDEADBEEF, true); view.setUint32(future_ptr, 2, true);
if ((data.args_ptr >>> 0) !== 0 && wasmInstance.exports.cppfree) { wasmInstance.exports.cppfree(data.args_ptr >>> 0); }
}
Atomics.notify(SharedViews.int32, future_ptr / 4, 1);
if (wasmInstance.exports.agresume_future) { wasmInstance.exports.agresume_future(future_ptr); }
} else if (data.type === 'SYNC_CALL') {
const sync_req_ptr = data.sync_req_ptr >>> 0; const view = SharedViews.dataView;
try {
const dispatcher_ptr = data.dispatcher_ptr >>> 0;
const result = wasmInstance.exports.autogen_dispatch(dispatcher_ptr, 0, (data.this_ptr ?? 0) >>> 0, (data.args_ptr ?? 0) >>> 0);
view.setUint32(sync_req_ptr + 16, result >>> 0, true); view.setUint32(sync_req_ptr, 1, true);
} catch (err) {
let errMsg = "Unknown dispatch error";
if (err instanceof Error) {
errMsg = `${err.name}: ${err.message}`;
} else if (err && typeof err === 'object') {
errMsg = `Thrown Object: ${err.name || 'Unknown'} (Code: ${err.code})`;
} else {
errMsg = String(err);
}
console.error(`[Worker ${workerId}] Sync dispatch error:`, errMsg);
sendToMain({ type: 'MSG_ERR', msg: `Worker ${workerId} sync dispatch error: ${errMsg}` });
view.setUint32(sync_req_ptr + 20, 0xDEADBEEF, true); view.setUint32(sync_req_ptr, 2, true);
if ((data.args_ptr >>> 0) !== 0 && wasmInstance.exports.cppfree) { wasmInstance.exports.cppfree(data.args_ptr >>> 0); }
}
Atomics.notify(SharedViews.int32, sync_req_ptr / 4, 1);
} else if (data.type === 'PING_RECEIVED') { sendToMain({ type: 'PONG_FROM_WORKER', from: workerId, originalCaller: callerId }); }
else if (data.type === 'EXPORT_RESULT') { sendToMain({ type: 'EXPORT_RESULT', requestId: data.requestId, success: data.success, result: data.result, error: data.error }); }
}
function sendToMain(data) { if (mainThreadPort) mainThreadPort.postMessage(data); else self.postMessage(data); }
function readString(ptr) {
ptr = ptr >>> 0; if (!sharedMemory || !ptr) return "";
try {
const memory = SharedViews.uint8; if (ptr >= memory.length) return "[INVALID PTR]";
let str = ""; for (let i = ptr; i < memory.length && memory[i] !== 0; i++) { if (str.length > 4096) { str += "...[TRUNCATED]"; break; } str += String.fromCharCode(memory[i]); } return str;
} catch (err) { return `[readString error: ${err.message}]`; }
}