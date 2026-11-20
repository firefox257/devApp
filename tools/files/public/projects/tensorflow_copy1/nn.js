/* nn.js — a from-scratch neural network library.
 * Float32Array tensors + reverse-mode autodiff + layers + Adam.
 * Runs on the main thread (window.nn) and in workers (self.nn).
 */
(function (global) {
'use strict';

// ---------- shape helpers ----------
const prod = s => s.reduce((a, b) => a * b, 1);
const sameShape = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function stridesOf(shape) {
  const s = new Array(shape.length); let acc = 1;
  for (let i = shape.length - 1; i >= 0; i--) { s[i] = acc; acc *= shape[i]; }
  return s;
}
function broadcastShapes(a, b) {
  const r = Math.max(a.length, b.length);
  const A = [...Array(r - a.length).fill(1), ...a];
  const B = [...Array(r - b.length).fill(1), ...b];
  return A.map((x, i) => {
    const y = B[i];
    if (x !== y && x !== 1 && y !== 1) throw new Error(`broadcast fail: [${a}] vs [${b}]`);
    return Math.max(x, y);
  });
}
function bcastStrides(src, out) {
  const r = out.length, off = r - src.length, ss = stridesOf(src), s = new Array(r).fill(0);
  for (let i = 0; i < src.length; i++)
    s[i + off] = (src[i] === 1 && out[i + off] !== 1) ? 0 : ss[i];
  return s;
}
// Odometer walk over the output: maps each flat output index to both input offsets.
function eachBroadcast(shape, sa, sb, cb) {
  const r = shape.length, idx = new Array(r).fill(0);
  let oa = 0, ob = 0;
  const n = prod(shape);
  for (let i = 0; i < n; i++) {
    cb(i, oa, ob);
    for (let d = r - 1; d >= 0; d--) {
      idx[d]++; oa += sa[d]; ob += sb[d];
      if (idx[d] < shape[d]) break;
      oa -= sa[d] * shape[d]; ob -= sb[d] * shape[d]; idx[d] = 0;
    }
  }
}

// ---------- RNG (mulberry32, reproducible inits) ----------
let _seed = 1337 >>> 0;
function rand() {
  _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const manualSeed = s => { _seed = s >>> 0; };

// ---------- Tensor + autograd tape ----------
let tensorsCreated = 0;
const engine = { tape: [], gradEnabled: true };

class Tensor {
  constructor(data, shape, requiresGrad = false) {
    this.data = data instanceof Float32Array ? data : Float32Array.from(data);
    this.shape = shape.slice();
    this.size = prod(shape);
    if (this.data.length !== this.size)
      throw new Error(`data length ${this.data.length} != shape [${shape}]`);
    this.requiresGrad = requiresGrad;
    this.grad = null;
    tensorsCreated++;
  }
  zeroGrad() { if (this.grad) this.grad.fill(0); }
  backward() { backward(this); }
}
const asTensor = x => x instanceof Tensor ? x : new Tensor([x], [1]);
const gradOf = t => t.grad || (t.grad = new Float32Array(t.size));

// Ops are recorded in creation order — which IS topological order.
// So backward() just walks the tape in reverse. No graph sort needed.
function record(out, backwardFn) {
  if (engine.gradEnabled && out.requiresGrad) engine.tape.push({ out, backward: backwardFn });
}
function backward(loss) {
  const tape = engine.tape; engine.tape = [];
  if (loss.size !== 1) throw new Error('backward() needs a scalar loss');
  gradOf(loss).fill(0); loss.grad[0] = 1;
  for (let i = tape.length - 1; i >= 0; i--) {
    const node = tape[i];
    if (node.out.grad) node.backward(node.out.grad);
  }
}
function noGrad(fn) {
  const prev = engine.gradEnabled; engine.gradEnabled = false;
  try { return fn(); } finally { engine.gradEnabled = prev; }
}
const clearTape = () => { engine.tape.length = 0; };

// ---------- elementwise ops (numpy-style broadcasting) ----------
function binaryOp(a, b, f, da, db) {
  a = asTensor(a); b = asTensor(b);
  const same = sameShape(a.shape, b.shape);
  const shape = same ? a.shape.slice() : broadcastShapes(a.shape, b.shape);
  const out = new Tensor(new Float32Array(prod(shape)), shape, a.requiresGrad || b.requiresGrad);
  const A = a.data, B = b.data, O = out.data, n = out.size;
  const sa = same ? null : bcastStrides(a.shape, shape);
  const sb = same ? null : bcastStrides(b.shape, shape);
  if (same) { for (let i = 0; i < n; i++) O[i] = f(A[i], B[i]); }
  else eachBroadcast(shape, sa, sb, (i, oa, ob) => { O[i] = f(A[oa], B[ob]); });
  record(out, g => {
    if (same) {
      if (a.requiresGrad) { const ga = gradOf(a); for (let i = 0; i < n; i++) ga[i] += da(A[i], B[i], O[i]) * g[i]; }
      if (b.requiresGrad) { const gb = gradOf(b); for (let i = 0; i < n; i++) gb[i] += db(A[i], B[i], O[i]) * g[i]; }
    } else {
      const ga = a.requiresGrad ? gradOf(a) : null;
      const gb = b.requiresGrad ? gradOf(b) : null;
      eachBroadcast(shape, sa, sb, (i, oa, ob) => {
        if (ga) ga[oa] += da(A[oa], B[ob], O[i]) * g[i];
        if (gb) gb[ob] += db(A[oa], B[ob], O[i]) * g[i];
      });
    }
  });
  return out;
}
const add = (a, b) => binaryOp(a, b, (x, y) => x + y, () => 1, () => 1);
const sub = (a, b) => binaryOp(a, b, (x, y) => x - y, () => 1, () => -1);
const mul = (a, b) => binaryOp(a, b, (x, y) => x * y, (x, y) => y, (x, y) => x);
const div = (a, b) => binaryOp(a, b, (x, y) => x / y, (x, y) => 1 / y, (x, y) => -x / (y * y));

function unaryOp(a, f, df) {
  const out = new Tensor(new Float32Array(a.size), a.shape, a.requiresGrad);
  const A = a.data, O = out.data;
  for (let i = 0; i < a.size; i++) O[i] = f(A[i]);
  record(out, g => {
    if (a.requiresGrad) { const ga = gradOf(a); for (let i = 0; i < a.size; i++) ga[i] += df(A[i], O[i]) * g[i]; }
  });
  return out;
}
const sigmoid = a => unaryOp(a, v => 1 / (1 + Math.exp(-v)), (v, o) => o * (1 - o));
const swish   = a => unaryOp(a, v => v / (1 + Math.exp(-v)),
  v => { const s = 1 / (1 + Math.exp(-v)); return s * (1 + v * (1 - s)); });
const relu    = a => unaryOp(a, v => v > 0 ? v : 0, v => v > 0 ? 1 : 0);
const exp     = a => unaryOp(a, Math.exp, (v, o) => o);
const log     = a => unaryOp(a, Math.log, v => 1 / v);
const sqrt    = a => unaryOp(a, Math.sqrt, (v, o) => 0.5 / o);
const rsqrt   = a => unaryOp(a, v => 1 / Math.sqrt(v), (v, o) => -0.5 * o * o * o);

// ---------- structural / reduction ops ----------
function matmul(a, b) { // [N,K] @ [K,M] → [N,M], i-k-j loop order (cache friendly)
  const [N, K] = a.shape, [K2, M] = b.shape;
  if (K !== K2) throw new Error(`matmul mismatch [${a.shape}] @ [${b.shape}]`);
  const out = new Tensor(new Float32Array(N * M), [N, M], a.requiresGrad || b.requiresGrad);
  const A = a.data, B = b.data, O = out.data;
  for (let i = 0; i < N; i++) {
    const aRow = i * K, oRow = i * M;
    for (let k = 0; k < K; k++) {
      const av = A[aRow + k]; if (av === 0) continue;
      const bRow = k * M;
      for (let j = 0; j < M; j++) O[oRow + j] += av * B[bRow + j];
    }
  }
  record(out, g => {
    if (a.requiresGrad) { // dA = G @ Bᵀ
      const ga = gradOf(a);
      for (let i = 0; i < N; i++) for (let k = 0; k < K; k++) {
        let s = 0; const gRow = i * M, bRow = k * M;
        for (let j = 0; j < M; j++) s += g[gRow + j] * B[bRow + j];
        ga[i * K + k] += s;
      }
    }
    if (b.requiresGrad) { // dB = Aᵀ @ G
      const gb = gradOf(b);
      for (let i = 0; i < N; i++) {
        const aRow = i * K, gRow = i * M;
        for (let k = 0; k < K; k++) {
          const av = A[aRow + k]; if (av === 0) continue;
          const gbRow = k * M;
          for (let j = 0; j < M; j++) gb[gbRow + j] += av * g[gRow + j];
        }
      }
    }
  });
  return out;
}

function reshape(a, shape) { // zero-copy view; grads are separate buffers so sharing is safe
  const out = new Tensor(a.data, shape, a.requiresGrad);
  record(out, g => {
    if (a.requiresGrad) { const ga = gradOf(a); for (let i = 0; i < a.size; i++) ga[i] += g[i]; }
  });
  return out;
}

function sliceLast(a, start, length) { // [...,D] → [...,length]
  const D = a.shape[a.shape.length - 1], outer = a.size / D;
  const out = new Tensor(new Float32Array(outer * length), [...a.shape.slice(0, -1), length], a.requiresGrad);
  for (let r = 0; r < outer; r++)
    out.data.set(a.data.subarray(r * D + start, r * D + start + length), r * length);
  record(out, g => {
    if (a.requiresGrad) {
      const ga = gradOf(a);
      for (let r = 0; r < outer; r++) for (let j = 0; j < length; j++) ga[r * D + start + j] += g[r * length + j];
    }
  });
  return out;
}

function concatLast(a, b) { // [...,H1] + [...,H2] → [...,H1+H2]
  const H1 = a.shape[a.shape.length - 1], H2 = b.shape[b.shape.length - 1];
  const outer = a.size / H1, HO = H1 + H2;
  if (b.size / H2 !== outer) throw new Error('concatLast shape mismatch');
  const out = new Tensor(new Float32Array(outer * HO), [...a.shape.slice(0, -1), HO], a.requiresGrad || b.requiresGrad);
  for (let r = 0; r < outer; r++) {
    out.data.set(a.data.subarray(r * H1, (r + 1) * H1), r * HO);
    out.data.set(b.data.subarray(r * H2, (r + 1) * H2), r * HO + H1);
  }
  record(out, g => {
    if (a.requiresGrad) { const ga = gradOf(a); for (let r = 0; r < outer; r++) for (let j = 0; j < H1; j++) ga[r * H1 + j] += g[r * HO + j]; }
    if (b.requiresGrad) { const gb = gradOf(b); for (let r = 0; r < outer; r++) for (let j = 0; j < H2; j++) gb[r * H2 + j] += g[r * HO + H1 + j]; }
  });
  return out;
}

function meanRows(a) { // [N,D] → [N,1]
  const [N, D] = a.shape;
  const out = new Tensor(new Float32Array(N), [N, 1], a.requiresGrad);
  for (let r = 0; r < N; r++) {
    let s = 0; for (let j = 0; j < D; j++) s += a.data[r * D + j];
    out.data[r] = s / D;
  }
  record(out, g => {
    if (a.requiresGrad) {
      const ga = gradOf(a);
      for (let r = 0; r < N; r++) { const gv = g[r] / D; for (let j = 0; j < D; j++) ga[r * D + j] += gv; }
    }
  });
  return out;
}

function meanAxis1(a) { // [B,T,D] → [B,D]  (global average pooling)
  const [B, T, D] = a.shape;
  const out = new Tensor(new Float32Array(B * D), [B, D], a.requiresGrad);
  for (let b = 0; b < B; b++) for (let t = 0; t < T; t++) {
    const src = (b * T + t) * D, dst = b * D;
    for (let d = 0; d < D; d++) out.data[dst + d] += a.data[src + d];
  }
  for (let i = 0; i < out.size; i++) out.data[i] /= T;
  record(out, g => {
    if (a.requiresGrad) {
      const ga = gradOf(a);
      for (let b = 0; b < B; b++) for (let t = 0; t < T; t++) {
        const dst = (b * T + t) * D, src = b * D;
        for (let d = 0; d < D; d++) ga[dst + d] += g[src + d] / T;
      }
    }
  });
  return out;
}

function embeddingOp(W, ids, outShape) { // gather rows; backward = scatter-add
  const V = W.shape[0], D = W.shape[1], n = ids.length;
  const out = new Tensor(new Float32Array(n * D), [...outShape, D], W.requiresGrad);
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    if (id < 0 || id >= V) throw new Error(`token id ${id} out of range [0,${V})`);
    out.data.set(W.data.subarray(id * D, (id + 1) * D), i * D);
  }
  record(out, g => {
    if (W.requiresGrad) {
      const gw = gradOf(W);
      for (let i = 0; i < n; i++) {
        const row = ids[i] * D;
        for (let j = 0; j < D; j++) gw[row + j] += g[i * D + j];
      }
    }
  });
  return out;
}

// ---------- loss + inference softmax ----------
// Fused stable softmax + sparse cross-entropy. dLogits = (p − onehot) / N.
function sparseCE(logits, labels) {
  const [N, V] = logits.shape;
  if (labels.length !== N) throw new Error('labels/batch mismatch');
  const probs = new Float32Array(N * V);
  let loss = 0;
  for (let r = 0; r < N; r++) {
    const off = r * V;
    let mx = -Infinity;
    for (let c = 0; c < V; c++) if (logits.data[off + c] > mx) mx = logits.data[off + c];
    let sum = 0;
    for (let c = 0; c < V; c++) { const e = Math.exp(logits.data[off + c] - mx); probs[off + c] = e; sum += e; }
    for (let c = 0; c < V; c++) probs[off + c] /= sum;
    loss -= logits.data[off + labels[r]] - mx - Math.log(sum);
  }
  const out = new Tensor([loss / N], [1], logits.requiresGrad);
  record(out, g => {
    if (logits.requiresGrad) {
      const gl = gradOf(logits), s = g[0] / N;
      for (let r = 0; r < N; r++) for (let c = 0; c < V; c++)
        gl[r * V + c] += s * (probs[r * V + c] - (c === labels[r] ? 1 : 0));
    }
  });
  return out;
}

function softmaxRow(data) { // inference helper, single row, no tape
  let mx = -Infinity;
  for (let i = 0; i < data.length; i++) if (data[i] > mx) mx = data[i];
  const out = new Float32Array(data.length); let s = 0;
  for (let i = 0; i < data.length; i++) { out[i] = Math.exp(data[i] - mx); s += out[i]; }
  for (let i = 0; i < out.length; i++) out[i] /= s;
  return out;
}

// ---------- modules ----------
class Module {
  constructor() { this._params = []; this._children = []; }
  param(shape, init) { const t = new Tensor(init(prod(shape)), shape, true); this._params.push(t); return t; }
  add(child) { this._children.push(child); return child; }
  parameters() { let out = this._params.slice(); for (const c of this._children) out = out.concat(c.parameters()); return out; }
  zeroGrad() { for (const p of this.parameters()) p.zeroGrad(); }
}

class Dense extends Module {
  constructor(nIn, nOut) {
    super();
    const lim = Math.sqrt(6 / (nIn + nOut)); // Glorot uniform, like TF's default
    this.W = this.param([nIn, nOut], n => Float32Array.from({ length: n }, () => (rand() * 2 - 1) * lim));
    this.b = this.param([1, nOut], n => new Float32Array(n));
  }
  forward(x) { return add(matmul(x, this.W), this.b); }
}

class Embedding extends Module {
  constructor(vocabSize, dim) {
    super();
    this.W = this.param([vocabSize, dim], n => Float32Array.from({ length: n }, () => (rand() * 2 - 1) * 0.05));
  }
  forward(ids, batch, seqLen) { return embeddingOp(this.W, ids, [batch, seqLen]); }
}

class LayerNorm extends Module {
  constructor(dim, eps = 1e-5) {
    super();
    this.dim = dim; this.eps = eps;
    this.gamma = this.param([1, dim], n => new Float32Array(n).fill(1));
    this.beta = this.param([1, dim], n => new Float32Array(n));
  }
  forward(x) { // works on any [..., dim]
    const D = this.dim, N = x.size / D;
    const flat = reshape(x, [N, D]);
    const cen = sub(flat, meanRows(flat));
    const v = meanRows(mul(cen, cen));
    const norm = mul(cen, rsqrt(add(v, this.eps)));
    return add(mul(reshape(norm, x.shape), this.gamma), this.beta);
  }
}

const ropeCache = new Map();
function ropeTables(seqLen, dim) {
  const key = `${seqLen}_${dim}`;
  if (ropeCache.has(key)) return ropeCache.get(key);
  const half = dim >> 1;
  const sin = new Float32Array(seqLen * half), cos = new Float32Array(seqLen * half);
  for (let p = 0; p < seqLen; p++) for (let i = 0; i < half; i++) {
    const ang = p / Math.pow(10000, 2 * i / dim);
    sin[p * half + i] = Math.sin(ang); cos[p * half + i] = Math.cos(ang);
  }
  const t = { sin: new Tensor(sin, [1, seqLen, half]), cos: new Tensor(cos, [1, seqLen, half]) };
  ropeCache.set(key, t);
  return t;
}
class RoPE { // rotate-half style, identical math to your TF RoPELayer
  constructor(seqLen, dim) {
    this.half = dim >> 1;
    const t = ropeTables(seqLen, dim);
    this.sin = t.sin; this.cos = t.cos;
  }
  forward(x) {
    const h = this.half;
    const x1 = sliceLast(x, 0, h), x2 = sliceLast(x, h, h);
    return concatLast(sub(mul(x1, this.cos), mul(x2, this.sin)),
                      add(mul(x1, this.sin), mul(x2, this.cos)));
  }
}

// ---------- your model, built from our parts ----------
class ChatLM extends Module {
  constructor(cfg) {
    super();
    this.cfg = { hiddenDim: 64, numLayers: 2, useRoPE: true, ...cfg };
    const H = this.cfg.hiddenDim, V = this.cfg.vocabSize + 1; // id 0 = <unk>/pad
    this.embed = this.add(new Embedding(V, H));
    this.ln0 = this.add(new LayerNorm(H));
    this.rope = this.cfg.useRoPE ? new RoPE(this.cfg.seqLen, H) : null;
    this.blocks = [];
    for (let i = 0; i < this.cfg.numLayers; i++)
      this.blocks.push({ g: this.add(new Dense(H, H)), v: this.add(new Dense(H, H)), ln: this.add(new LayerNorm(H)) });
    this.head = this.add(new Dense(H, V));
  }
  forward(ids, batch) { // ids: Int32Array of length batch*seqLen → logits [batch, V]
    const T = this.cfg.seqLen, H = this.cfg.hiddenDim;
    let x = this.embed.forward(ids, batch, T);
    x = this.ln0.forward(x);
    if (this.rope) x = this.rope.forward(x);
    for (const b of this.blocks) {
      const flat = reshape(x, [batch * T, H]);
      const gated = reshape(mul(swish(b.g.forward(flat)), b.v.forward(flat)), [batch, T, H]);
      x = b.ln.forward(add(x, gated)); // SwiGLU + residual + norm
    }
    return this.head.forward(meanAxis1(x));
  }
  getWeights() { return this.parameters().map(p => ({ shape: p.shape.slice(), data: p.data })); }
  setWeights(ws) {
    const ps = this.parameters();
    if (ws.length !== ps.length) throw new Error(`weight count ${ws.length} != ${ps.length}`);
    ps.forEach((p, i) => {
      if (!sameShape(p.shape, ws[i].shape)) throw new Error(`weight ${i}: shape [${ws[i].shape}] != [${p.shape}]`);
      p.data.set(ws[i].data);
    });
  }
}

// ---------- optimizer ----------
class Adam {
  constructor(params, lr = 0.005, b1 = 0.9, b2 = 0.999, eps = 1e-8) {
    this.params = params; this.lr = lr; this.b1 = b1; this.b2 = b2; this.eps = eps; this.t = 0;
    this.m = params.map(p => new Float32Array(p.size));
    this.v = params.map(p => new Float32Array(p.size));
  }
  step() {
    this.t++;
    const c1 = 1 - Math.pow(this.b1, this.t), c2 = 1 - Math.pow(this.b2, this.t), lr = this.lr;
    for (let p = 0; p < this.params.length; p++) {
      const t = this.params[p], g = t.grad; if (!g) continue;
      const m = this.m[p], v = this.v[p], d = t.data;
      for (let i = 0; i < d.length; i++) {
        const gi = g[i];
        const mi = m[i] = this.b1 * m[i] + (1 - this.b1) * gi;
        const vi = v[i] = this.b2 * v[i] + (1 - this.b2) * gi * gi;
        d[i] -= lr * (mi / c1) / (Math.sqrt(vi / c2) + this.eps);
      }
    }
  }
  zeroGrad() { for (const p of this.params) p.zeroGrad(); }
}

// ---------- serialization / debug ----------
function saveJSON(model, meta = {}) {
  return { format: 'nnjs-chatlm-v1', config: model.cfg, meta,
    weights: model.getWeights().map(w => ({ shape: w.shape, data: Array.from(w.data) })) };
}
function loadJSON(obj) {
  const m = new ChatLM(obj.config);
  m.setWeights(obj.weights.map(w => ({ shape: w.shape, data: Float32Array.from(w.data) })));
  return m;
}
// buildLoss must be a deterministic closure (fixed inputs). Float32 → expect err < ~2e-2.
function gradCheck(buildLoss, params, checks = 12, eps = 1e-2) {
  for (const p of params) p.zeroGrad();
  backward(buildLoss());
  const analytic = params.map(p => p.grad ? Float32Array.from(p.grad) : new Float32Array(p.size));
  let maxErr = 0;
  for (let c = 0; c < checks; c++) {
    const pi = Math.floor(rand() * params.length), p = params[pi];
    const i = Math.floor(rand() * p.size), orig = p.data[i];
    p.data[i] = orig + eps; const l1 = noGrad(() => buildLoss().data[0]);
    p.data[i] = orig - eps; const l2 = noGrad(() => buildLoss().data[0]);
    p.data[i] = orig;
    const num = (l1 - l2) / (2 * eps), ana = analytic[pi][i];
    maxErr = Math.max(maxErr, Math.abs(num - ana) / Math.max(1e-6, Math.abs(num) + Math.abs(ana)));
  }
  return maxErr;
}
const stats = () => ({ tensorsCreated, tapeLength: engine.tape.length, gradEnabled: engine.gradEnabled });

// ---------- ergonomics + export ----------
const P = Tensor.prototype;
P.add = function (o) { return add(this, o); };
P.sub = function (o) { return sub(this, o); };
P.mul = function (o) { return mul(this, o); };
P.div = function (o) { return div(this, o); };
P.matmul = function (o) { return matmul(this, o); };
P.reshape = function (s) { return reshape(this, s); };
P.swish = function () { return swish(this); };
P.sigmoid = function () { return sigmoid(this); };
P.meanRows = function () { return meanRows(this); };
P.meanAxis1 = function () { return meanAxis1(this); };

global.nn = {
  Tensor, Module, Dense, Embedding, LayerNorm, RoPE, ChatLM, Adam,
  backward, noGrad, clearTape, sparseCE, softmaxRow,
  manualSeed, gradCheck, stats, saveJSON, loadJSON,
  ops: { add, sub, mul, div, matmul, reshape, swish, sigmoid, relu, exp, log, sqrt, rsqrt,
         sliceLast, concatLast, meanRows, meanAxis1, embedding: embeddingOp }
};
})(typeof self !== 'undefined' ? self : this);