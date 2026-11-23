// ./training-worker.js — ES module training worker.
/* WebGPU gated by on-device parity, CPU fallback. Protocol: INIT_BACKEND / TRAIN / CANCEL.
* Loaded with: new Worker('training-worker.js', { type: 'module' }) */
import * as nn from './nn.js';

// --- CONSOLE CAPTURE FOR iOS SAFARI (WORKER) ---
function safeStringify(a) {
  try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
  catch(e) { return String(a); }
}

const _wOrigLog = console.log;
const _wOrigWarn = console.warn;
const _wOrigError = console.error;

function postConsole(kind, args) {
  try {
    self.postMessage({
      type: 'CONSOLE',
      payload: { kind, msg: args.map(safeStringify).join(' ') }
    });
  } catch(e) {}
  if (kind === 'i') _wOrigLog.apply(console, args);
  if (kind === 'w') _wOrigWarn.apply(console, args);
  if (kind === 'e') _wOrigError.apply(console, args);
}

console.log = function(...args) { postConsole('i', args); };
console.warn = function(...args) { postConsole('w', args); };
console.error = function(...args) { postConsole('e', args); };
// -----------------------------------------------

let gpuCtx = null, backendName = 'nnjs-cpu', gpuVerified = false, gpuReport = null;
let cpuModel = null, opt = null, gpuModel = null;
let training = false, cancelled = false;
const yieldToEvents = () => new Promise(res => {
const ch = new MessageChannel();
ch.port1.onmessage = () => { ch.port1.close(); res(); };
ch.port2.postMessage(0);
});
function cpuMemInfo(params) {
let bytes = 0;
for (const p of params) bytes += p.size * 4 * 4;
return { numTensors: params.length * 4, numBytes: bytes };
}
function clipGrads(params, clip) {
let gn = 0;
for (const p of params) { const g = p.grad; if (g) for (let i = 0; i < g.length; i++) gn += g[i] * g[i]; }
gn = Math.sqrt(gn);
if (gn > clip) { const sc = clip / gn; for (const p of params) { const g = p.grad; if (g) for (let i = 0; i < g.length; i++) g[i] *= sc; } }
return gn;
}
function shuffleOrder(order, count) {
for (let i = 0; i < count; i++) order[i] = i;
for (let i = count - 1; i > 0; i--) {
const j = (Math.random() * (i + 1)) | 0;
const t = order[i]; order[i] = order[j]; order[j] = t;
}
}
function unpack(payload) {
const { count, xsBuffer, ysBuffer, wsBuffer, config } = payload;
const xs = xsBuffer instanceof Int32Array ? xsBuffer : new Int32Array(xsBuffer);
const ys = ysBuffer instanceof Int32Array ? ysBuffer : new Int32Array(ysBuffer);
const ws = wsBuffer instanceof Float32Array ? wsBuffer : wsBuffer ? new Float32Array(wsBuffer) : null;
const cfg = {
...config,
hiddenDim: config.hiddenDim || 64,
numLayers: config.numLayers || 2,
seed: (config.seed | 0) || 1337
};
return { count, xs, ys, ws, config: cfg };
}

/* ---------------- on-device GPU parity gate ---------------- */
async function verifyGPU() {
const cfg = { vocabSize: 15, seqLen: 8, useRoPE: true, softCap: 10, hiddenDim: 64, numLayers: 2 };
nn.manualSeed(7);
const cpu = new nn.ChatLM(cfg);
let gpu = null;
try {
gpu = new nn.GPUChatLM({ ...cfg, maxBatch: 4 });
await gpu.init();
gpu.setWeights(cpu.getWeights());
const B = 4, T = 8, V = 16;
const xs = new Int32Array(B * T), ys = new Int32Array(B), ws = new Float32Array(B);
let s = 123; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
for (let b = 0; b < B; b++) {
const pad = b % 3;
for (let t = 0; t < T; t++) xs[b * T + t] = t < pad ? 0 : 1 + ((rnd() * (V - 1)) | 0);
ys[b] = 1 + ((rnd() * (V - 1)) | 0);
ws[b] = b < 2 ? 1 : 0;
}
const lossT = nn.sparseCE(cpu.forward(xs, B), ys, ws);
nn.backward(lossT);
const ps = cpu.parameters();
const cpuFlat = new Float32Array(gpu.paramCount);
gpu.paramSpec.forEach((sp, i) => cpuFlat.set(ps[i].grad || new Float32Array(sp.size), sp.offset));
gpu.beginEpoch();
await gpu.runChunk([{ ids: xs, labels: ys, weights: ws }], { lr: 0, clip: 0 });
const enc = gpu.dev.createCommandEncoder();
enc.copyBufferToBuffer(gpu.slabBuf, gpu.oGrad * 4, gpu.wStage, 0, gpu.paramCount * 4);
gpu.dev.queue.submit([enc.finish()]);
await gpu.wStage.mapAsync(GPUMapMode.READ);
const gpuFlat = new Float32Array(gpu.wStage.getMappedRange()).slice();
gpu.wStage.unmap();
const { lossSum, wsum } = await gpu.endEpoch();
const gpuLoss = wsum ? lossSum / wsum : 0;
let maxAbs = 0, maxRel = 0;
for (let i = 0; i < cpuFlat.length; i++) {
const a = cpuFlat[i], b = gpuFlat[i], d = Math.abs(a - b);
if (d > maxAbs) maxAbs = d;
const r = d / Math.max(1e-6, Math.abs(a) + Math.abs(b));
if (r > maxRel) maxRel = r;
}
const lossDiff = Math.abs(gpuLoss - lossT.data[0]);
const ok = lossDiff < 1e-2 && maxRel < 1e-2;
return { ok, cpuLoss: lossT.data[0], gpuLoss, lossDiff, maxAbs, maxRel };
} finally {
nn.clearTape();
if (gpu) { try { gpu.dispose(); } catch (_) {} }
}
}

/* ---------------- GPU training ---------------- */
async function trainGPU(payload) {
const { count, xs, ys, ws, config } = unpack(payload);
const { vocabSize, lr, useRoPE, seqLen, epochs, batchSize, warmup, softCap, clip, hiddenDim, numLayers, seed } = config;
if (seqLen > nn.gpu.MAX_T) throw new Error(`seqLen ${seqLen} exceeds GPU limit ${nn.gpu.MAX_T}`);
nn.manualSeed(seed);
gpuModel = new nn.GPUChatLM({ vocabSize, seqLen, useRoPE, softCap: softCap || 0, hiddenDim, numLayers, maxBatch: batchSize });
await gpuModel.init();
const order = new Uint32Array(count);
const CHUNK = nn.gpu.CHUNK;
for (let epoch = 0; epoch < epochs && !cancelled; epoch++) {
const elr = warmup > 0 ? lr * Math.min(1, (epoch + 1) / warmup) : lr;
shuffleOrder(order, count);
gpuModel.beginEpoch();
let start = 0;
while (start < count && !cancelled) {
const chunk = [];
for (let c = 0; c < CHUNK && start < count; c++, start += batchSize) {
const bs = Math.min(batchSize, count - start);
const ids = new Int32Array(bs * seqLen), labels = new Int32Array(bs);
const weights = ws ? new Float32Array(bs) : null;
for (let i = 0; i < bs; i++) {
const row = order[start + i];
ids.set(xs.subarray(row * seqLen, (row + 1) * seqLen), i * seqLen);
labels[i] = ys[row];
if (weights) weights[i] = ws[row];
}
chunk.push({ ids, labels, weights });
}
await gpuModel.runChunk(chunk, { lr: elr, clip: clip || 0 });
await yieldToEvents();
}
if (cancelled) break;
const { lossSum, wsum } = await gpuModel.endEpoch();
const loss = wsum ? lossSum / wsum : 0;
if (!isFinite(loss)) throw new Error('Loss diverged (NaN/Inf) — lower the learning rate or raise warmup');
self.postMessage({ type: 'PROGRESS', epoch, totalEpochs: epochs, loss, lr: elr, memory: gpuModel.memoryInfo() });
await yieldToEvents();
}
if (cancelled) { gpuModel.dispose(); gpuModel = null; self.postMessage({ type: 'TRAIN_CANCELLED' }); return; }
const wsOut = await gpuModel.getWeights();
const weights = wsOut.map(w => ({ shape: w.shape, data: w.data, dtype: 'float32' }));
gpuModel.dispose(); gpuModel = null;
self.postMessage({ type: 'TRAIN_COMPLETE', weights, config }, weights.map(w => w.data.buffer));
}

/* ---------------- CPU engine (verified reference) ---------------- */
async function trainCPU(payload) {
const { count, xs, ys, ws, config } = unpack(payload);
const { vocabSize, lr, useRoPE, seqLen, epochs, batchSize, warmup, softCap, clip, hiddenDim, numLayers, seed } = config;
nn.manualSeed(seed);
cpuModel = new nn.ChatLM({ vocabSize, seqLen, useRoPE, softCap: softCap || 0, hiddenDim, numLayers });
const params = cpuModel.parameters();
opt = new nn.Adam(params, lr);
const order = new Uint32Array(count);
const bx = new Int32Array(batchSize * seqLen), by = new Int32Array(batchSize);
const bw = ws ? new Float32Array(batchSize) : null;
let batch = 0;
for (let epoch = 0; epoch < epochs && !cancelled; epoch++) {
opt.lr = warmup > 0 ? lr * Math.min(1, (epoch + 1) / warmup) : lr;
shuffleOrder(order, count);
let epochLoss = 0, seen = 0;
for (let start = 0; start < count; start += batchSize) {
const bs = Math.min(batchSize, count - start);
let wsum = 0;
for (let i = 0; i < bs; i++) {
const row = order[start + i];
bx.set(xs.subarray(row * seqLen, (row + 1) * seqLen), i * seqLen);
by[i] = ys[row];
if (bw) { bw[i] = ws[row]; wsum += bw[i]; }
}
const logits = cpuModel.forward(bx.subarray(0, bs * seqLen), bs);
const loss = nn.sparseCE(logits, by.subarray(0, bs), bw ? bw.subarray(0, bs) : null);
nn.backward(loss);
if (clip > 0) clipGrads(params, clip);
opt.step(); opt.zeroGrad();
const w = bw ? wsum : bs;
epochLoss += loss.data[0] * w; seen += w;
if (((batch++) & 3) === 0) { await yieldToEvents(); if (cancelled) break; }
}
if (cancelled) break;
self.postMessage({ type: 'PROGRESS', epoch, totalEpochs: epochs, loss: seen ? epochLoss / seen : 0, lr: opt.lr, memory: cpuMemInfo(params) });
await yieldToEvents();
}
if (cancelled) { nn.clearTape(); cpuModel = null; opt = null; self.postMessage({ type: 'TRAIN_CANCELLED' }); return; }
const weights = cpuModel.getWeights().map(w => ({ shape: w.shape, data: w.data, dtype: 'float32' }));
cpuModel = null; opt = null;
self.postMessage({ type: 'TRAIN_COMPLETE', weights, config }, weights.map(w => w.data.buffer));
}

async function train(payload) {
if (training) throw new Error('Training already in progress');
training = true; cancelled = false;
try {
if (gpuCtx && gpuVerified) {
try { await trainGPU(payload); return; }
catch (e) {
if (gpuModel) { try { gpuModel.dispose(); } catch (_) {} gpuModel = null; }
if (cancelled) { self.postMessage({ type: 'TRAIN_CANCELLED' }); return; }
console.warn('[worker] GPU train failed → CPU fallback:', e);
gpuVerified = false;
backendName = 'nnjs-cpu';
self.postMessage({
type: 'BACKEND_READY', backend: backendName, memory: { numTensors: 0, numBytes: 0 },
note: 'GPU run failed → verified CPU engine: ' + (e.message || e)
});
}
}
await trainCPU(payload);
} catch (e) {
nn.clearTape(); cpuModel = null; opt = null;
if (gpuModel) { try { gpuModel.dispose(); } catch (_) {} gpuModel = null; }
throw e;
} finally { training = false; }
}

self.onmessage = async e => {
const { type, payload } = e.data || {};
try {
if (type === 'INIT_BACKEND') {
gpuCtx = await nn.gpu.init();
gpuVerified = false; gpuReport = null;
if (gpuCtx) {
try { gpuReport = await verifyGPU(); gpuVerified = !!gpuReport.ok; }
catch (err) { gpuVerified = false; gpuReport = { ok: false, error: err.message || String(err) }; }
if (!gpuVerified) console.warn('[worker] GPU parity FAILED — using CPU engine', gpuReport);
}
backendName = (gpuCtx && gpuVerified) ? 'webgpu' : 'nnjs-cpu';
let note = null;
if (gpuCtx && !gpuVerified) {
note = gpuReport && gpuReport.error
? `WebGPU verify error (${gpuReport.error}) → verified CPU engine`
: `WebGPU failed parity (loss ${gpuReport.cpuLoss.toFixed(4)} vs ${gpuReport.gpuLoss.toFixed(4)}, grad maxRel ${gpuReport.maxRel.toExponential(2)}) → verified CPU engine`;
}
self.postMessage({
type: 'BACKEND_READY', backend: backendName,
memory: { numTensors: 0, numBytes: 0 },
adapter: gpuCtx ? gpuCtx.info : null,
parity: gpuReport, note
});
} else if (type === 'TRAIN') {
await train(payload);
} else if (type === 'CANCEL') {
cancelled = true;
}
} catch (err) {
self.postMessage({ type: 'ERROR', message: err.message || String(err), stack: err.stack });
}
};