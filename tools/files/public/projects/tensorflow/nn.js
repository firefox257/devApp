// ./nn.js — from-scratch NN engine, exported as an ES module.
/* v4.3: module conversion. IIFE / global `nn` removed; everything is exported.
* CPU engine + WebGPU backend unchanged from v4.2 (fused kernels, slab layout,
* parity-friendly parameter order identical to CPU ChatLM).
* Use via:  import * as nn from './nn.js';
*/
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

// ---------- elementwise ops ----------
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
function matmul(a, b) {
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
		if (a.requiresGrad) {
			const ga = gradOf(a);
			for (let i = 0; i < N; i++) for (let k = 0; k < K; k++) {
				let s = 0; const gRow = i * M, bRow = k * M;
				for (let j = 0; j < M; j++) s += g[gRow + j] * B[bRow + j];
				ga[i * K + k] += s;
			}
		}
		if (b.requiresGrad) {
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

function reshape(a, shape) {
	const out = new Tensor(a.data, shape, a.requiresGrad);
	record(out, g => {
		if (a.requiresGrad) { const ga = gradOf(a); for (let i = 0; i < a.size; i++) ga[i] += g[i]; }
	});
	return out;
}

function sliceLast(a, start, length) {
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

function concatLast(a, b) {
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

function meanRows(a) {
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

function meanAxis1(a) {
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

function embeddingOp(W, ids, outShape) {
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

// ---------- attention primitives ----------
function causalAttention(q, k, v, mask, cap) {
	const [B, T, H] = q.shape, scale = 1 / Math.sqrt(H);
	const out = new Tensor(new Float32Array(B * T * H), [B, T, H],
		q.requiresGrad || k.requiresGrad || v.requiresGrad);
	const P = new Float32Array(B * T * T);
	const F = new Float32Array(B * T * T);
	const Q = q.data, K = k.data, V = v.data, O = out.data, s = new Float32Array(T);
	for (let b = 0; b < B; b++) for (let i = 0; i < T; i++) {
		const qo = (b * T + i) * H, po = (b * T + i) * T;
		let mx = -Infinity, any = false;
		for (let j = 0; j <= i; j++) {
			if (!mask[b * T + j]) continue;
			const ko = (b * T + j) * H;
			let d = 0; for (let h = 0; h < H; h++) d += Q[qo + h] * K[ko + h];
			const raw = d * scale;
			if (cap) { const th = Math.tanh(raw / cap); s[j] = cap * th; F[po + j] = (1 - th * th) * scale; }
			else { s[j] = raw; F[po + j] = scale; }
			if (s[j] > mx) mx = s[j]; any = true;
		}
		if (!any) { s[i] = 0; mx = 0; F[po + i] = scale; }
		let sum = 0;
		for (let j = 0; j <= i; j++) {
			const ok = mask[b * T + j] || (!any && j === i);
			const e = ok ? Math.exp(s[j] - mx) : 0;
			P[po + j] = e; sum += e;
		}
		for (let j = 0; j <= i; j++) {
			const p = P[po + j] / sum; P[po + j] = p;
			if (p === 0) continue;
			const vo = (b * T + j) * H;
			for (let h = 0; h < H; h++) O[qo + h] += p * V[vo + h];
		}
	}
	record(out, g => {
		const gq = q.requiresGrad ? gradOf(q) : null;
		const gk = k.requiresGrad ? gradOf(k) : null;
		const gv = v.requiresGrad ? gradOf(v) : null;
		for (let b = 0; b < B; b++) for (let i = 0; i < T; i++) {
			const qo = (b * T + i) * H, po = (b * T + i) * T;
			let dot = 0;
			for (let j = 0; j <= i; j++) {
				const p = P[po + j]; if (p === 0) continue;
				const vo = (b * T + j) * H;
				let dp = 0; for (let h = 0; h < H; h++) dp += g[qo + h] * V[vo + h];
				s[j] = dp; dot += p * dp;
				if (gv) for (let h = 0; h < H; h++) gv[vo + h] += p * g[qo + h];
			}
			for (let j = 0; j <= i; j++) {
				const p = P[po + j]; if (p === 0) continue;
				const ds = p * (s[j] - dot) * F[po + j], ko = (b * T + j) * H;
				if (gq) for (let h = 0; h < H; h++) gq[qo + h] += ds * K[ko + h];
				if (gk) for (let h = 0; h < H; h++) gk[ko + h] += ds * Q[qo + h];
			}
		}
	});
	return out;
}

function takeLast(x) {
	const [B, T, H] = x.shape;
	const out = new Tensor(new Float32Array(B * H), [B, H], x.requiresGrad);
	for (let b = 0; b < B; b++)
		out.data.set(x.data.subarray((b * T + T - 1) * H, (b * T + T) * H), b * H);
	record(out, g => {
		if (x.requiresGrad) {
			const gx = gradOf(x);
			for (let b = 0; b < B; b++) for (let h = 0; h < H; h++)
				gx[(b * T + T - 1) * H + h] += g[b * H + h];
		}
	});
	return out;
}

// ---------- loss + inference softmax ----------
function sparseCE(logits, labels, weights) {
	const [N, V] = logits.shape;
	if (labels.length !== N) throw new Error('labels/batch mismatch');
	const probs = new Float32Array(N * V);
	let loss = 0, wsum = 0;
	for (let r = 0; r < N; r++) {
		const w = weights ? weights[r] : 1; wsum += w;
		const off = r * V;
		let mx = -Infinity;
		for (let c = 0; c < V; c++) if (logits.data[off + c] > mx) mx = logits.data[off + c];
		let sum = 0;
		for (let c = 0; c < V; c++) { const e = Math.exp(logits.data[off + c] - mx); probs[off + c] = e; sum += e; }
		for (let c = 0; c < V; c++) probs[off + c] /= sum;
		loss -= w * (logits.data[off + labels[r]] - mx - Math.log(sum));
	}
	const denom = wsum || 1;
	const out = new Tensor([loss / denom], [1], logits.requiresGrad);
	record(out, g => {
		if (logits.requiresGrad) {
			const gl = gradOf(logits), s = g[0] / denom;
			for (let r = 0; r < N; r++) {
				const w = weights ? weights[r] : 1;
				for (let c = 0; c < V; c++)
					gl[r * V + c] += s * w * (probs[r * V + c] - (c === labels[r] ? 1 : 0));
			}
		}
	});
	return out;
}

function softmaxRow(data) {
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
		const lim = Math.sqrt(6 / (nIn + nOut));
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
	forward(x) {
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

class RoPE {
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

class CausalSelfAttention extends Module {
	constructor(dim, seqLen, useRoPE = true, softCap = 0) {
		super();
		this.dim = dim; this.seqLen = seqLen; this.softCap = softCap > 0 ? softCap : 0;
		this.Wq = this.add(new Dense(dim, dim));
		this.Wk = this.add(new Dense(dim, dim));
		this.Wv = this.add(new Dense(dim, dim));
		this.Wo = this.add(new Dense(dim, dim));
		this.rope = useRoPE ? new RoPE(seqLen, dim) : null;
	}
	forward(x, mask) {
		const B = x.shape[0], T = this.seqLen, H = this.dim;
		const flat = reshape(x, [B * T, H]);
		let q = reshape(this.Wq.forward(flat), [B, T, H]);
		let k = reshape(this.Wk.forward(flat), [B, T, H]);
		const v = reshape(this.Wv.forward(flat), [B, T, H]);
		if (this.rope) { q = this.rope.forward(q); k = this.rope.forward(k); }
		const att = causalAttention(q, k, v, mask, this.softCap);
		return reshape(this.Wo.forward(reshape(att, [B * T, H])), [B, T, H]);
	}
}

// ---------- model: pre-LN causal transformer + SwiGLU, last-token readout ----------
class ChatLM extends Module {
	constructor(cfg) {
		super();
		this.cfg = { hiddenDim: 64, numLayers: 2, useRoPE: true, softCap: 10, ...cfg };
		const H = this.cfg.hiddenDim, V = this.cfg.vocabSize + 1;
		this.embed = this.add(new Embedding(V, H));
		this.blocks = [];
		for (let i = 0; i < this.cfg.numLayers; i++)
			this.blocks.push({
				ln1:  this.add(new LayerNorm(H)),
				attn: this.add(new CausalSelfAttention(H, this.cfg.seqLen, this.cfg.useRoPE, this.cfg.softCap)),
				ln2:  this.add(new LayerNorm(H)),
				g:    this.add(new Dense(H, H)),
				v:    this.add(new Dense(H, H))
			});
		this.lnF  = this.add(new LayerNorm(H));
		this.head = this.add(new Dense(H, V));
	}
	forward(ids, batch) {
		const T = this.cfg.seqLen, H = this.cfg.hiddenDim;
		const mask = new Uint8Array(ids.length);
		for (let i = 0; i < ids.length; i++) mask[i] = ids[i] === 0 ? 0 : 1;
		let x = this.embed.forward(ids, batch, T);
		for (const b of this.blocks) {
			x = add(x, b.attn.forward(b.ln1.forward(x), mask));
			const flat = reshape(b.ln2.forward(x), [batch * T, H]);
			const gated = reshape(mul(swish(b.g.forward(flat)), b.v.forward(flat)), [batch, T, H]);
			x = add(x, gated);
		}
		return this.head.forward(takeLast(this.lnF.forward(x)));
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
	constructor(params, lr = 0.001, b1 = 0.9, b2 = 0.999, eps = 1e-8) {
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
function packJSON(config, weights, meta = {}) {
	return { format: 'nnjs-chatlm-v3', config, meta,
		weights: weights.map(w => ({ shape: w.shape, data: Array.from(w.data) })) };
}
function saveJSON(model, meta = {}) { return packJSON(model.cfg, model.getWeights(), meta); }
function loadJSON(obj) {
	if (obj.format && obj.format !== 'nnjs-chatlm-v3')
		throw new Error(`unsupported format '${obj.format}' — retrain and re-export with the current nn.js`);
	const m = new ChatLM(obj.config);
	m.setWeights(obj.weights.map(w => ({ shape: w.shape, data: Float32Array.from(w.data) })));
	return m;
}

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

// =====================================================================
// ------------------------- WebGPU BACKEND ----------------------------
// =====================================================================
const GPU_MAX_T = 512;
const GPU_CHUNK = 32;
const GS_WG = 64;
const OP_SLOTS = 160;
const OP_VARIANTS = 24;

let _gpuPromise = null;
function gpuInit() {
	if (_gpuPromise) return _gpuPromise;
	_gpuPromise = (async () => {
		try {
			if (typeof navigator === 'undefined' || !navigator.gpu) return null;
			const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
			if (!adapter) return null;
			const device = await adapter.requestDevice();
			let info = {};
			try {
				const ai = adapter.info || {};
				info = { vendor: ai.vendor || '', architecture: ai.architecture || '', description: ai.description || '' };
			} catch (_) {}
			device.lost.then(l => { if (l.reason !== 'destroyed') console.warn('[nn.gpu] device lost:', l.message); });
			return { device, adapter, info };
		} catch (e) {
			console.warn('[nn.gpu] init failed:', e && e.message);
			return null;
		}
	})();
	return _gpuPromise;
}

const WGSL = `
struct StepU {
	B:u32, T:u32, H:u32, V:u32, N:u32,
	cap:f32, attScale:f32, lnEps:f32,
	lr:f32, beta1:f32, beta2:f32, adamEps:f32,
	corr1:f32, corr2:f32, clip:f32, denom:f32,
	ioBase:u32, oGrad:u32, oM:u32, oV:u32, oScale:u32, aGrad:u32,
	idsStride:u32, labStride:u32, paramCount:u32,
	wsum:f32, p1:u32, p2:u32,
};
struct OpU { a:u32, b:u32, c:u32, d:u32, e:u32, f:u32, g:u32, h:u32, };
@group(0) @binding(0) var<uniform> u: StepU;
@group(0) @binding(1) var<storage, read_write> slab: array<f32>;
@group(0) @binding(2) var<storage, read_write> ar: array<f32>;
@group(0) @binding(3) var<storage, read> io: array<u32>;
@group(0) @binding(4) var<uniform> op: OpU;
@group(0) @binding(5) var<storage, read_write> lossBuf: array<f32>;
var<workgroup> red: array<f32, 64>;
var<workgroup> redA: array<f32, 64>;
var<workgroup> redB: array<f32, 64>;
var<workgroup> redL: array<f32, 64>;
var<workgroup> redN: array<f32, 64>;
var<workgroup> sc: array<f32, 512>;
var<workgroup> dpS: array<f32, 512>;
var<workgroup> dsS: array<f32, 512>;
var<workgroup> tA: array<f32, 256>;
var<workgroup> tB: array<f32, 256>;
@compute @workgroup_size(64)
fn kEmbed(@builtin(global_invocation_id) g: vec3<u32>) {
	var idx = g.x;
	while (idx < op.e) {
		let pos = idx / u.H; let h = idx % u.H;
		let id = io[u.ioBase + pos];
		ar[op.a + idx] = slab[id * u.H + h];
		idx += 4096u;
	}
}
@compute @workgroup_size(64)
fn kEmbedBwd(@builtin(global_invocation_id) g: vec3<u32>) {
	let r = g.x;
	if (r >= u.V) { return; }
	for (var pos = 0u; pos < u.N; pos = pos + 1u) {
		if (io[u.ioBase + pos] == r) {
			for (var h = 0u; h < u.H; h = h + 1u) {
				slab[u.oGrad + r * u.H + h] += ar[op.a + pos * u.H + h];
			}
		}
	}
}
@compute @workgroup_size(64)
fn kLNFwd(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
	let r = wg.x; let tid = l.x; let base = r * u.H;
	var s = 0.0;
	for (var h = tid; h < u.H; h += 64u) { s += ar[op.a + base + h]; }
	red[tid] = s; workgroupBarrier();
	if (tid == 0u) { var t = 0.0; for (var i = 0u; i < 64u; i++) { t += red[i]; } red[0] = t / f32(u.H); }
	workgroupBarrier();
	let mean = red[0];
	workgroupBarrier();
	var v = 0.0;
	for (var h = tid; h < u.H; h += 64u) { let d = ar[op.a + base + h] - mean; v += d * d; }
	red[tid] = v; workgroupBarrier();
	if (tid == 0u) { var t = 0.0; for (var i = 0u; i < 64u; i++) { t += red[i]; } red[0] = 1.0 / sqrt(t / f32(u.H) + u.lnEps); }
	workgroupBarrier();
	let rs = red[0];
	if (tid == 0u) { ar[op.d + r] = rs; }
	for (var h = tid; h < u.H; h += 64u) {
		let xh = (ar[op.a + base + h] - mean) * rs;
		ar[op.c + base + h] = xh;
		ar[op.b + base + h] = slab[op.e + h] * xh + slab[op.f + h];
	}
}
@compute @workgroup_size(64)
fn kLNBwdRows(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
	let r = wg.x; let tid = l.x; let base = r * u.H;
	var s1 = 0.0; var s2 = 0.0;
	for (var h = tid; h < u.H; h += 64u) {
		let dh = ar[op.a + base + h] * slab[op.d + h];
		s1 += dh; s2 += dh * ar[op.b + base + h];
	}
	red[tid] = s1; workgroupBarrier();
	if (tid == 0u) { var t = 0.0; for (var i = 0u; i < 64u; i++) { t += red[i]; } red[0] = t / f32(u.H); }
	workgroupBarrier();
	let m1 = red[0];
	workgroupBarrier();
	red[tid] = s2; workgroupBarrier();
	if (tid == 0u) { var t = 0.0; for (var i = 0u; i < 64u; i++) { t += red[i]; } red[0] = t / f32(u.H); }
	workgroupBarrier();
	let m2 = red[0];
	let rs = ar[op.c + r];
	for (var h = tid; h < u.H; h += 64u) {
		let dh = ar[op.a + base + h] * slab[op.d + h];
		ar[op.e + base + h] += rs * (dh - m1 - ar[op.b + base + h] * m2);
	}
}
@compute @workgroup_size(64)
fn kLNBwdParams(@builtin(global_invocation_id) g: vec3<u32>) {
	let h = g.x;
	if (h >= u.H) { return; }
	var sg = 0.0; var sb = 0.0;
	for (var r = 0u; r < u.N; r = r + 1u) {
		let dy = ar[op.a + r * u.H + h];
		sg += dy * ar[op.b + r * u.H + h];
		sb += dy;
	}
	slab[op.c + h] += sg;
	slab[op.d + h] += sb;
}
fn rdB(i: u32) -> f32 {
	if ((op.h & 16u) != 0u) { return slab[i]; }
	return ar[i];
}
fn wrC(i: u32, v: f32, acc: bool) {
	if ((op.h & 32u) != 0u) {
		if (acc) { slab[i] += v; } else { slab[i] = v; }
	} else {
		if (acc) { ar[i] += v; } else { ar[i] = v; }
	}
}
@compute @workgroup_size(16, 16)
fn kMatmul(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
	let M = op.e; let K = op.f; let Nc = op.g; let flags = op.h;
	let row = wg.y * 16u + l.y; let col = wg.x * 16u + l.x;
	let li = l.y * 16u + l.x;
	var acc = 0.0;
	for (var t = 0u; t < K; t += 16u) {
		let ak = t + l.x; let bk = t + l.y;
		var av = 0.0;
		if (row < M && ak < K) {
			let ai = select(row * K + ak, ak * M + row, (flags & 1u) != 0u);
			av = ar[op.a + ai];
		}
		tA[li] = av;
		var bv = 0.0;
		if (bk < K && col < Nc) {
			let bi = select(bk * Nc + col, col * K + bk, (flags & 2u) != 0u);
			bv = rdB(op.b + bi);
		}
		tB[li] = bv;
		workgroupBarrier();
		for (var kk = 0u; kk < 16u; kk = kk + 1u) {
			acc += tA[l.y * 16u + kk] * tB[kk * 16u + l.x];
		}
		workgroupBarrier();
	}
	if (row < M && col < Nc) {
		var v = acc;
		if ((flags & 8u) != 0u) { v += slab[op.d + col]; }
		wrC(op.c + row * Nc + col, v, (flags & 4u) != 0u);
	}
}
@compute @workgroup_size(64)
fn kBiasBwd(@builtin(global_invocation_id) g: vec3<u32>) {
	let c = g.x;
	if (c >= op.f) { return; }
	var s = 0.0;
	for (var r = 0u; r < op.e; r = r + 1u) { s += ar[op.a + r * op.f + c]; }
	slab[op.b + c] += s;
}
@compute @workgroup_size(64)
fn kRoPE(@builtin(global_invocation_id) g: vec3<u32>) {
	let half = u.H / 2u;
	var idx = g.x;
	while (idx < op.e) {
		let r = idx / half; let i = idx % half; let p = r % u.T;
		let ang = f32(p) / pow(10000.0, f32(2u * i) / f32(u.H));
		let c = cos(ang); let s = sin(ang);
		let b0 = r * u.H + i; let b1 = b0 + half;
		let x1 = ar[op.a + b0]; let x2 = ar[op.a + b1];
		if (op.c == 0u) {
			ar[op.b + b0] = x1 * c - x2 * s;
			ar[op.b + b1] = x1 * s + x2 * c;
		} else {
			ar[op.b + b0] = x1 * c + x2 * s;
			ar[op.b + b1] = x2 * c - x1 * s;
		}
		idx += 4096u;
	}
}
@compute @workgroup_size(64)
fn kAttFwd(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
	let row = wg.x; let tid = l.x;
	let b = row / u.T; let i = row % u.T;
	let qo = row * u.H; let po = row * u.T;
	var localAny = 0.0;
	for (var j = tid; j <= i; j += 64u) {
		if (io[u.ioBase + b * u.T + j] == 0u) {
			sc[j] = -1e30;
			ar[op.e + po + j] = 0.0;
		} else {
			var d = 0.0;
			for (var h = 0u; h < u.H; h = h + 1u) {
				d += ar[op.a + qo + h] * ar[op.b + (b * u.T + j) * u.H + h];
			}
			let raw = d * u.attScale;
			if (u.cap > 0.0) {
				let th = tanh(raw / u.cap);
				sc[j] = u.cap * th;
				ar[op.e + po + j] = (1.0 - th * th) * u.attScale;
			} else {
				sc[j] = raw;
				ar[op.e + po + j] = u.attScale;
			}
			localAny = 1.0;
		}
	}
	redA[tid] = localAny; workgroupBarrier();
	if (tid == 0u) {
		var t = 0.0; for (var k = 0u; k < 64u; k++) { t += redA[k]; }
		if (t == 0.0) { sc[i] = 0.0; ar[op.e + po + i] = u.attScale; }
	}
	workgroupBarrier();
	var mx = -1e30;
	for (var j = tid; j <= i; j += 64u) { mx = max(mx, sc[j]); }
	redA[tid] = mx; workgroupBarrier();
	if (tid == 0u) { var m = -1e30; for (var k = 0u; k < 64u; k++) { m = max(m, redA[k]); } redA[0] = m; }
	workgroupBarrier();
	let mxa = redA[0];
	workgroupBarrier();
	var sm = 0.0;
	for (var j = tid; j <= i; j += 64u) { let e = exp(sc[j] - mxa); sc[j] = e; sm += e; }
	redA[tid] = sm; workgroupBarrier();
	if (tid == 0u) { var t = 0.0; for (var k = 0u; k < 64u; k++) { t += redA[k]; } redA[0] = 1.0 / t; }
	workgroupBarrier();
	let inv = redA[0];
	workgroupBarrier();
	for (var j = tid; j <= i; j += 64u) {
		let p = sc[j] * inv; sc[j] = p; ar[op.d + po + j] = p;
	}
	workgroupBarrier();
	for (var h = tid; h < u.H; h += 64u) {
		var a = 0.0;
		for (var j = 0u; j <= i; j = j + 1u) {
			a += sc[j] * ar[op.c + (b * u.T + j) * u.H + h];
		}
		ar[op.f + qo + h] = a;
	}
}
@compute @workgroup_size(64)
fn kAttBwd1(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
	let row = wg.x; let tid = l.x;
	let b = row / u.T; let i = row % u.T;
	let qo = row * u.H; let po = row * u.T;
	var dot = 0.0;
	for (var j = tid; j <= i; j += 64u) {
		let p = ar[op.d + po + j];
		if (p == 0.0) {
			dpS[j] = 0.0; ar[op.g + po + j] = 0.0;
		} else {
			var d = 0.0;
			for (var h = 0u; h < u.H; h = h + 1u) {
				d += ar[op.f + qo + h] * ar[op.c + (b * u.T + j) * u.H + h];
			}
			dpS[j] = d; dot += p * d;
		}
	}
	redB[tid] = dot; workgroupBarrier();
	if (tid == 0u) { var t = 0.0; for (var k = 0u; k < 64u; k++) { t += redB[k]; } redB[0] = t; }
	workgroupBarrier();
	let dotAll = redB[0];
	workgroupBarrier();
	for (var j = tid; j <= i; j += 64u) {
		let p = ar[op.d + po + j];
		let ds = p * (dpS[j] - dotAll) * ar[op.e + po + j];
		dsS[j] = ds; ar[op.g + po + j] = ds;
	}
	workgroupBarrier();
	for (var h = tid; h < u.H; h += 64u) {
		var a = 0.0;
		for (var j = 0u; j <= i; j = j + 1u) {
			a += dsS[j] * ar[op.b + (b * u.T + j) * u.H + h];
		}
		ar[op.h + qo + h] += a;
	}
}
@compute @workgroup_size(64)
fn kAttBwd2(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
	let row = wg.x; let tid = l.x;
	let b = row / u.T; let j = row % u.T;
	let ko = row * u.H;
	for (var h = tid; h < u.H; h += 64u) {
		var av = 0.0; var ak = 0.0;
		for (var i = j; i < u.T; i = i + 1u) {
			let pi = (b * u.T + i) * u.T + j;
			av += ar[op.b + pi] * ar[op.c + (b * u.T + i) * u.H + h];
			ak += ar[op.d + pi] * ar[op.a + (b * u.T + i) * u.H + h];
		}
		ar[op.e + ko + h] += av;
		ar[op.f + ko + h] += ak;
	}
}
@compute @workgroup_size(64)
fn kSwiGLUFwd(@builtin(global_invocation_id) g: vec3<u32>) {
	var idx = g.x;
	while (idx < op.e) {
		let gv = ar[op.a + idx];
		let s = 1.0 / (1.0 + exp(-gv));
		let sg = gv * s;
		ar[op.c + idx] = sg;
		ar[op.d + idx] = sg * ar[op.b + idx];
		idx += 4096u;
	}
}
@compute @workgroup_size(64)
fn kSwiGLUBwd(@builtin(global_invocation_id) g: vec3<u32>) {
	var idx = g.x;
	while (idx < op.g) {
		let gv = ar[op.a + idx];
		let s = 1.0 / (1.0 + exp(-gv));
		let dg = ar[op.d + idx];
		ar[op.e + idx] += dg * ar[op.b + idx] * s * (1.0 + gv * (1.0 - s));
		ar[op.f + idx] += dg * ar[op.c + idx];
		idx += 4096u;
	}
}
@compute @workgroup_size(64)
fn kAddFwd(@builtin(global_invocation_id) g: vec3<u32>) {
	var idx = g.x;
	while (idx < op.e) {
		ar[op.c + idx] = ar[op.a + idx] + ar[op.b + idx];
		idx += 4096u;
	}
}
@compute @workgroup_size(64)
fn kAddBwd(@builtin(global_invocation_id) g: vec3<u32>) {
	var idx = g.x;
	while (idx < op.e) {
		let d = ar[op.a + idx];
		ar[op.b + idx] += d;
		ar[op.c + idx] += d;
		idx += 4096u;
	}
}
@compute @workgroup_size(64)
fn kTakeLastFwd(@builtin(global_invocation_id) g: vec3<u32>) {
	var idx = g.x;
	while (idx < op.e) {
		let b = idx / u.H; let h = idx % u.H;
		ar[op.b + idx] = ar[op.a + (b * u.T + u.T - 1u) * u.H + h];
		idx += 4096u;
	}
}
@compute @workgroup_size(64)
fn kTakeLastBwd(@builtin(global_invocation_id) g: vec3<u32>) {
	var idx = g.x;
	while (idx < op.e) {
		let b = idx / u.H; let h = idx % u.H;
		ar[op.b + (b * u.T + u.T - 1u) * u.H + h] += ar[op.a + idx];
		idx += 4096u;
	}
}
@compute @workgroup_size(64)
fn kLoss(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
	let b = wg.x; let tid = l.x; let off = b * u.V;
	let y = io[u.ioBase + u.idsStride + b];
	let w = bitcast<f32>(io[u.ioBase + u.idsStride + u.labStride + b]);
	var mx = -1e30;
	for (var c = tid; c < u.V; c += 64u) { mx = max(mx, ar[op.a + off + c]); }
	redL[tid] = mx; workgroupBarrier();
	if (tid == 0u) { var m = -1e30; for (var k = 0u; k < 64u; k++) { m = max(m, redL[k]); } redL[0] = m; }
	workgroupBarrier();
	let mxa = redL[0];
	workgroupBarrier();
	var sm = 0.0;
	for (var c = tid; c < u.V; c += 64u) { sm += exp(ar[op.a + off + c] - mxa); }
	redL[tid] = sm; workgroupBarrier();
	if (tid == 0u) { var t = 0.0; for (var k = 0u; k < 64u; k++) { t += redL[k]; } redL[0] = t; }
	workgroupBarrier();
	let suma = redL[0];
	workgroupBarrier();
	let wd = w / u.denom;
	for (var c = tid; c < u.V; c += 64u) {
		let p = exp(ar[op.a + off + c] - mxa) / suma;
		ar[op.b + off + c] = p;
		ar[op.c + off + c] = wd * (p - select(0.0, 1.0, c == y));
	}
	if (tid == 0u) {
		ar[op.d + b] = w * (mxa + log(suma) - ar[op.a + off + y]);
	}
}
@compute @workgroup_size(1)
fn kAccum() {
	var s = 0.0;
	for (var b = 0u; b < u.B; b = b + 1u) { s += ar[op.a + b]; }
	lossBuf[0] += s;
	lossBuf[1] += u.wsum;
}
@compute @workgroup_size(64)
fn kZero(@builtin(global_invocation_id) g: vec3<u32>) {
	var idx = g.x;
	while (idx < op.b) {
		let o = op.a + idx;
		if (op.c == 0u) { slab[o] = 0.0; } else { ar[o] = 0.0; }
		idx += 4096u;
	}
}
@compute @workgroup_size(64)
fn kGradNorm(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
	let tid = l.x;
	var s = 0.0;
	var idx = wg.x * 64u + tid;
	while (idx < op.e) {
		let g = slab[u.oGrad + idx];
		s += g * g;
		idx += 4096u;
	}
	redN[tid] = s; workgroupBarrier();
	if (tid == 0u) {
		var t = 0.0; for (var k = 0u; k < 64u; k++) { t += redN[k]; }
		slab[u.oScale + 1u + wg.x] = t;
	}
}
@compute @workgroup_size(1)
fn kClip() {
	var t = 0.0;
	for (var k = 0u; k < 64u; k++) { t += slab[u.oScale + 1u + k]; }
	var s = 1.0;
	if (!(t >= 0.0)) { s = 0.0; }
	else if (u.clip > 0.0) {
		let n = sqrt(t);
		if (n > u.clip) { s = u.clip / n; }
	}
	slab[u.oScale] = s;
}
@compute @workgroup_size(64)
fn kAdam(@builtin(global_invocation_id) g: vec3<u32>) {
	let sc = slab[u.oScale];
	var idx = g.x;
	while (idx < op.e) {
		let gr = slab[u.oGrad + idx] * sc;
		let m = u.beta1 * slab[u.oM + idx] + (1.0 - u.beta1) * gr;
		let v = u.beta2 * slab[u.oV + idx] + (1.0 - u.beta2) * gr * gr;
		slab[u.oM + idx] = m;
		slab[u.oV + idx] = v;
		slab[idx] -= u.lr * (m / u.corr1) / (sqrt(v / u.corr2) + u.adamEps);
		idx += 4096u;
	}
}
`;

const GPU_KERNELS = ['kEmbed','kEmbedBwd','kLNFwd','kLNBwdRows','kLNBwdParams','kMatmul','kBiasBwd',
	'kRoPE','kAttFwd','kAttBwd1','kAttBwd2','kSwiGLUFwd','kSwiGLUBwd','kAddFwd','kAddBwd',
	'kTakeLastFwd','kTakeLastBwd','kLoss','kAccum','kZero','kGradNorm','kClip','kAdam'];

class GPUChatLM {
	constructor(cfg) {
		this.cfg = { hiddenDim: 64, numLayers: 2, useRoPE: true, softCap: 10, maxBatch: 1, ...cfg };
		this.isGPU = true;
		const { seqLen, hiddenDim } = this.cfg;
		if (!seqLen || seqLen > GPU_MAX_T) throw new Error(`WebGPU backend supports seqLen 1..${GPU_MAX_T}`);
		if (hiddenDim % 2 !== 0) throw new Error('hiddenDim must be even (RoPE pairs)');
		this.adamT = 0;
		this._busy = Promise.resolve();
		this._buildParams();
		this._buildArena();
		this._variants = new Map();
		this._variantCount = 0;
	}

	_buildParams() {
		const H = this.cfg.hiddenDim, V = this.cfg.vocabSize + 1, L = this.cfg.numLayers;
		const spec = [], po = {};
		let off = 0;
		const add = (name, shape, init) => {
			if (name in po) throw new Error(`duplicate GPU param name: ${name}`);
			const size = prod(shape);
			po[name] = off;
			spec.push({ name, shape, offset: off, size, init });
			off += size;
		};
		const xav = (nIn, nOut) => { const lim = Math.sqrt(6 / (nIn + nOut)); return () => (rand() * 2 - 1) * lim; };
		const emb = () => (rand() * 2 - 1) * 0.05;
		const ones = () => 1, zeros = () => 0;
		add('embed', [V, H], emb);
		for (let l = 0; l < L; l++) {
			add('ln1g' + l, [1, H], ones); add('ln1b' + l, [1, H], zeros);
			for (const w of ['q', 'k', 'v', 'o']) {
				add('W' + w + l, [H, H], xav(H, H)); add('b' + w + l, [1, H], zeros);
			}
			add('ln2g' + l, [1, H], ones); add('ln2b' + l, [1, H], zeros);
			add('Wg' + l, [H, H], xav(H, H)); add('bg' + l, [1, H], zeros);
			add('Wu' + l, [H, H], xav(H, H)); add('bu' + l, [1, H], zeros);
		}
		add('gF', [1, H], ones); add('bF', [1, H], zeros);
		add('Wh', [H, V], xav(H, V)); add('bh', [1, V], zeros);
		this.paramSpec = spec; this.po = po; this.paramCount = off;
		this.oGrad = off; this.oM = off * 2; this.oV = off * 3; this.oScale = off * 4;
		this._slabElems = off * 4 + 65;
		this._cpuParams = new Float32Array(off);
		for (const s of spec) for (let i = 0; i < s.size; i++) this._cpuParams[s.offset + i] = s.init();
	}

	_buildArena() {
		const { seqLen: T, hiddenDim: H, numLayers: L, vocabSize, maxBatch, useRoPE } = this.cfg;
		const V = vocabSize + 1, N = maxBatch * T, NH = N * H, BTT = maxBatch * T * T;
		const A = {}; let o = 0;
		const al = (n, sz) => { A[n] = o; o += sz; };
		al('x0', NH);
		for (let l = 0; l < L; l++) {
			al('ln1y' + l, NH); al('ln1xh' + l, NH); al('ln1rs' + l, N);
			al('qp' + l, NH); al('kp' + l, NH); al('vv' + l, NH);
			if (useRoPE) { al('q' + l, NH); al('k' + l, NH); }
			else { A['q' + l] = A['qp' + l]; A['k' + l] = A['kp' + l]; }
			al('P' + l, BTT); al('F' + l, BTT); al('att' + l, NH); al('ao' + l, NH); al('x1' + l, NH);
			al('ln2y' + l, NH); al('ln2xh' + l, NH); al('ln2rs' + l, N);
			al('gp' + l, NH); al('vv2' + l, NH); al('sg' + l, NH); al('gat' + l, NH); al('x2' + l, NH);
		}
		al('lnFy', NH); al('lnFxh', NH); al('lnFrs', N); al('lastH', maxBatch * H);
		al('logits', maxBatch * V); al('probs', maxBatch * V); al('rowLoss', maxBatch);
		this.A = A; this.arenaElems = o; this.aGrad = o;
		this.idsStride = maxBatch * T; this.labStride = maxBatch;
		this.ioStride = this.idsStride + 2 * this.labStride;
	}

	async init() {
		const g = await gpuInit();
		if (!g) throw new Error('WebGPU unavailable');
		this.dev = g.device; this.adapterInfo = g.info;
		const dev = this.dev;
		const storage = GPUBufferUsage.STORAGE;
		const copySrc = GPUBufferUsage.COPY_SRC, copyDst = GPUBufferUsage.COPY_DST;
		const mk = (bytes, usage) => dev.createBuffer({ size: Math.max(4, bytes), usage });
		this.slabBuf   = mk(this._slabElems * 4, storage | copySrc | copyDst);
		this.arenaBuf  = mk(this.arenaElems * 2 * 4, storage | copySrc);
		this.ioBuf     = mk(GPU_CHUNK * this.ioStride * 4, storage | copyDst);
		this.stepUBuf  = mk(GPU_CHUNK * 256, GPUBufferUsage.UNIFORM | copyDst);
		this.opUBuf    = mk(OP_VARIANTS * OP_SLOTS * 256, GPUBufferUsage.UNIFORM | copyDst);
		this.lossBuf   = mk(8, storage | copySrc | copyDst);
		this.lossStage = mk(8, GPUBufferUsage.MAP_READ | copyDst);
		this.probStage = mk((this.cfg.vocabSize + 1) * 4, GPUBufferUsage.MAP_READ | copyDst);
		this.wStage    = mk(this.paramCount * 4, GPUBufferUsage.MAP_READ | copyDst);
		dev.queue.writeBuffer(this.slabBuf, 0, this._cpuParams);
		dev.queue.writeBuffer(this.lossBuf, 0, new Float32Array(2));
		this.bgl = dev.createBindGroupLayout({ entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			{ binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
			{ binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
		]});
		this.bg = dev.createBindGroup({ layout: this.bgl, entries: [
			{ binding: 0, resource: { buffer: this.stepUBuf, offset: 0, size: 256 } },
			{ binding: 1, resource: { buffer: this.slabBuf } },
			{ binding: 2, resource: { buffer: this.arenaBuf } },
			{ binding: 3, resource: { buffer: this.ioBuf } },
			{ binding: 4, resource: { buffer: this.opUBuf, offset: 0, size: 256 } },
			{ binding: 5, resource: { buffer: this.lossBuf } },
		]});
		const layout = dev.createPipelineLayout({ bindGroupLayouts: [this.bgl] });
		const module = dev.createShaderModule({ code: WGSL });
		const pipes = await Promise.all(GPU_KERNELS.map(k =>
			dev.createComputePipelineAsync({ layout, compute: { module, entryPoint: k } })));
		this.pipes = {};
		GPU_KERNELS.forEach((k, i) => { this.pipes[k] = pipes[i]; });
		this._ready = true;
		return this;
	}

	_getVariant(bs, mode) {
		const key = bs + '|' + mode;
		if (this._variants.has(key)) return this._variants.get(key);
		if (this._variantCount >= OP_VARIANTS) throw new Error('too many GPU dispatch variants');
		const { seqLen: T, hiddenDim: H, numLayers: L, vocabSize, useRoPE } = this.cfg;
		const V = vocabSize + 1, N = bs * T, A = this.A, po = this.po, oG = this.oGrad;
		const tw = o => this.aGrad + o;
		const seq = [];
		const D = (k, op, wx, wy = 1) => seq.push({ k, op, wx, wy });
		const mmD = (rows, cols) => [Math.ceil(cols / 16), Math.ceil(rows / 16)];
		const c64 = n => Math.ceil(n / 64);
		if (mode === 'train') {
			D('kZero', [this.aGrad, this.arenaElems, 1, 0, 0, 0, 0, 0], GS_WG);
			D('kZero', [oG, this.paramCount, 0, 0, 0, 0, 0, 0], GS_WG);
		}
		D('kEmbed', [A.x0, 0, 0, 0, N * H, 0, 0, 0], GS_WG);
		let inOff = A.x0;
		for (let l = 0; l < L; l++) {
			D('kLNFwd', [inOff, A['ln1y'+l], A['ln1xh'+l], A['ln1rs'+l], po['ln1g'+l], po['ln1b'+l], 0, 0], N);
			for (const w of ['q', 'k', 'v']) {
				const dst = (w === 'v' ? 'vv' : w + 'p') + l;
				D('kMatmul', [A['ln1y'+l], po['W'+w+l], A[dst], po['b'+w+l], N, H, H, 24], ...mmD(N, H));
			}
			if (useRoPE) {
				D('kRoPE', [A['qp'+l], A['q'+l], 0, 0, N * (H / 2), 0, 0, 0], GS_WG);
				D('kRoPE', [A['kp'+l], A['k'+l], 0, 0, N * (H / 2), 0, 0, 0], GS_WG);
			}
			D('kAttFwd', [A['q'+l], A['k'+l], A['vv'+l], A['P'+l], A['F'+l], A['att'+l], 0, 0], N);
			D('kMatmul', [A['att'+l], po['Wo'+l], A['ao'+l], po['bo'+l], N, H, H, 24], ...mmD(N, H));
			D('kAddFwd', [inOff, A['ao'+l], A['x1'+l], 0, N * H, 0, 0, 0], GS_WG);
			D('kLNFwd', [A['x1'+l], A['ln2y'+l], A['ln2xh'+l], A['ln2rs'+l], po['ln2g'+l], po['ln2b'+l], 0, 0], N);
			D('kMatmul', [A['ln2y'+l], po['Wg'+l], A['gp'+l], po['bg'+l], N, H, H, 24], ...mmD(N, H));
			D('kMatmul', [A['ln2y'+l], po['Wu'+l], A['vv2'+l], po['bu'+l], N, H, H, 24], ...mmD(N, H));
			D('kSwiGLUFwd', [A['gp'+l], A['vv2'+l], A['sg'+l], A['gat'+l], N * H, 0, 0, 0], GS_WG);
			D('kAddFwd', [A['x1'+l], A['gat'+l], A['x2'+l], 0, N * H, 0, 0, 0], GS_WG);
			inOff = A['x2'+l];
		}
		D('kLNFwd', [inOff, A.lnFy, A.lnFxh, A.lnFrs, po.gF, po.bF, 0, 0], N);
		D('kTakeLastFwd', [A.lnFy, A.lastH, 0, 0, bs * H, 0, 0, 0], GS_WG);
		D('kMatmul', [A.lastH, po.Wh, A.logits, po.bh, bs, H, V, 24], ...mmD(bs, V));
		D('kLoss', [A.logits, A.probs, tw(A.logits), A.rowLoss, 0, 0, 0, 0], bs);
		if (mode === 'train') {
			D('kAccum', [A.rowLoss, 0, 0, 0, 0, 0, 0, 0], 1);
			const dLog = tw(A.logits);
			D('kMatmul', [dLog, po.Wh, tw(A.lastH), 0, bs, V, H, 22], ...mmD(bs, H));
			D('kMatmul', [A.lastH, dLog, oG + po.Wh, 0, H, bs, V, 37], ...mmD(H, V));
			D('kBiasBwd', [dLog, oG + po.bh, 0, 0, bs, V, 0, 0], c64(V));
			D('kTakeLastBwd', [tw(A.lastH), tw(A.lnFy), 0, 0, bs * H, 0, 0, 0], GS_WG);
			D('kLNBwdRows', [tw(A.lnFy), A.lnFxh, A.lnFrs, po.gF, tw(A['x2'+(L-1)]), 0, 0, 0], N);
			D('kLNBwdParams', [tw(A.lnFy), A.lnFxh, oG + po.gF, oG + po.bF, 0, 0, 0, 0], c64(H));
			for (let l = L - 1; l >= 0; l--) {
				const lin = l === 0 ? A.x0 : A['x2'+(l-1)];
				D('kAddBwd', [tw(A['x2'+l]), tw(A['x1'+l]), tw(A['gat'+l]), 0, N * H, 0, 0, 0], GS_WG);
				D('kSwiGLUBwd', [A['gp'+l], A['vv2'+l], A['sg'+l], tw(A['gat'+l]), tw(A['gp'+l]), tw(A['vv2'+l]), N * H, 0], GS_WG);
				D('kMatmul', [tw(A['gp'+l]), po['Wg'+l], tw(A['ln2y'+l]), 0, N, H, H, 22], ...mmD(N, H));
				D('kMatmul', [tw(A['vv2'+l]), po['Wu'+l], tw(A['ln2y'+l]), 0, N, H, H, 22], ...mmD(N, H));
				D('kMatmul', [A['ln2y'+l], tw(A['gp'+l]), oG + po['Wg'+l], 0, H, N, H, 37], ...mmD(H, H));
				D('kMatmul', [A['ln2y'+l], tw(A['vv2'+l]), oG + po['Wu'+l], 0, H, N, H, 37], ...mmD(H, H));
				D('kBiasBwd', [tw(A['gp'+l]), oG + po['bg'+l], 0, 0, N, H, 0, 0], c64(H));
				D('kBiasBwd', [tw(A['vv2'+l]), oG + po['bu'+l], 0, 0, N, H, 0, 0], c64(H));
				D('kLNBwdRows', [tw(A['ln2y'+l]), A['ln2xh'+l], A['ln2rs'+l], po['ln2g'+l], tw(A['x1'+l]), 0, 0, 0], N);
				D('kLNBwdParams', [tw(A['ln2y'+l]), A['ln2xh'+l], oG + po['ln2g'+l], oG + po['ln2b'+l], 0, 0, 0, 0], c64(H));
				D('kAddBwd', [tw(A['x1'+l]), tw(lin), tw(A['ao'+l]), 0, N * H, 0, 0, 0], GS_WG);
				D('kMatmul', [tw(A['ao'+l]), po['Wo'+l], tw(A['att'+l]), 0, N, H, H, 22], ...mmD(N, H));
				D('kMatmul', [A['att'+l], tw(A['ao'+l]), oG + po['Wo'+l], 0, H, N, H, 37], ...mmD(H, H));
				D('kBiasBwd', [tw(A['ao'+l]), oG + po['bo'+l], 0, 0, N, H, 0, 0], c64(H));
				D('kAttBwd1', [A['q'+l], A['k'+l], A['vv'+l], A['P'+l], A['F'+l], tw(A['att'+l]), tw(A['P'+l]), tw(A['q'+l])], N);
				D('kAttBwd2', [A['q'+l], A['P'+l], tw(A['att'+l]), tw(A['P'+l]), tw(A['vv'+l]), tw(A['k'+l]), 0, 0], N);
				if (useRoPE) {
					D('kRoPE', [tw(A['q'+l]), tw(A['q'+l]), 1, 0, N * (H / 2), 0, 0, 0], GS_WG);
					D('kRoPE', [tw(A['k'+l]), tw(A['k'+l]), 1, 0, N * (H / 2), 0, 0, 0], GS_WG);
				}
				for (const w of ['q', 'k', 'v']) {
					const an = (w === 'v' ? 'vv' : w) + l;
					D('kMatmul', [tw(A[an]), po['W'+w+l], tw(A['ln1y'+l]), 0, N, H, H, 22], ...mmD(N, H));
					D('kMatmul', [A['ln1y'+l], tw(A[an]), oG + po['W'+w+l], 0, H, N, H, 37], ...mmD(H, H));
					D('kBiasBwd', [tw(A[an]), oG + po['b'+w+l], 0, 0, N, H, 0, 0], c64(H));
				}
				D('kLNBwdRows', [tw(A['ln1y'+l]), A['ln1xh'+l], A['ln1rs'+l], po['ln1g'+l], tw(lin), 0, 0, 0], N);
				D('kLNBwdParams', [tw(A['ln1y'+l]), A['ln1xh'+l], oG + po['ln1g'+l], oG + po['ln1b'+l], 0, 0, 0, 0], c64(H));
			}
			D('kEmbedBwd', [tw(A.x0), 0, 0, 0, 0, 0, 0, 0], c64(V));
			D('kGradNorm', [0, 0, 0, 0, this.paramCount, 0, 0, 0], GS_WG);
			D('kClip', [0, 0, 0, 0, 0, 0, 0, 0], 1);
			D('kAdam', [0, 0, 0, 0, this.paramCount, 0, 0, 0], GS_WG);
		}
		if (seq.length > OP_SLOTS) throw new Error('dispatch sequence exceeds OP_SLOTS');
		const slot = this._variantCount++;
		const ops = new Uint32Array(seq.length * 64);
		seq.forEach((d, i) => { ops.set(d.op, i * 64); d.opOff = (slot * OP_SLOTS + i) * 256; });
		this.dev.queue.writeBuffer(this.opUBuf, slot * OP_SLOTS * 256, ops.buffer);
		const v = { seq };
		this._variants.set(key, v);
		return v;
	}

	_fillStepU(u32, f32, byteOff, bs, wsum, ioBase, lr, clip, t) {
		const o = byteOff / 4, c = this.cfg;
		u32[o+0] = bs; u32[o+1] = c.seqLen; u32[o+2] = c.hiddenDim; u32[o+3] = c.vocabSize + 1; u32[o+4] = bs * c.seqLen;
		f32[o+5] = c.softCap > 0 ? c.softCap : 0; f32[o+6] = 1 / Math.sqrt(c.hiddenDim); f32[o+7] = 1e-5;
		f32[o+8] = lr; f32[o+9] = 0.9; f32[o+10] = 0.999; f32[o+11] = 1e-8;
		f32[o+12] = 1 - Math.pow(0.9, t); f32[o+13] = 1 - Math.pow(0.999, t);
		f32[o+14] = clip; f32[o+15] = wsum || 1;
		u32[o+16] = ioBase; u32[o+17] = this.oGrad; u32[o+18] = this.oM; u32[o+19] = this.oV;
		u32[o+20] = this.oScale; u32[o+21] = this.aGrad;
		u32[o+22] = this.idsStride; u32[o+23] = this.labStride; u32[o+24] = this.paramCount;
		f32[o+25] = wsum;
		u32[o+26] = 0; u32[o+27] = 0;
	}

	beginEpoch() { this.dev.queue.writeBuffer(this.lossBuf, 0, new Float32Array(2)); }

	async runChunk(batches, { lr, clip }) {
		if (!this._ready) throw new Error('GPUChatLM not initialized');
		if (batches.length > GPU_CHUNK) throw new Error('chunk too large');
		const n = batches.length;
		const io = new Uint32Array(n * this.ioStride);
		const ioF = new Float32Array(io.buffer);
		const su = new ArrayBuffer(n * 256);
		const suU = new Uint32Array(su), suF = new Float32Array(su);
		const T = this.cfg.seqLen;
		for (let s = 0; s < n; s++) {
			const b = batches[s], bs = b.labels.length, base = s * this.ioStride;
			for (let i = 0; i < bs * T; i++) io[base + i] = b.ids[i];
			let wsum = 0;
			for (let i = 0; i < bs; i++) {
				io[base + this.idsStride + i] = b.labels[i];
				const w = b.weights ? b.weights[i] : 1;
				ioF[base + this.idsStride + this.labStride + i] = w;
				wsum += w;
			}
			this._fillStepU(suU, suF, s * 256, bs, wsum, base, lr, clip, this.adamT + s + 1);
		}
		this.dev.queue.writeBuffer(this.ioBuf, 0, io.buffer);
		this.dev.queue.writeBuffer(this.stepUBuf, 0, su);
		const enc = this.dev.createCommandEncoder();
		let s = 0;
		while (s < n) {
			const bs = batches[s].labels.length;
			let e = s + 1;
			while (e < n && batches[e].labels.length === bs) e++;
			const v = this._getVariant(bs, 'train');
			const pass = enc.beginComputePass();
			for (let i = s; i < e; i++) {
				const stepOff = i * 256;
				for (const d of v.seq) {
					pass.setPipeline(this.pipes[d.k]);
					pass.setBindGroup(0, this.bg, [stepOff, d.opOff]);
					pass.dispatchWorkgroups(d.wx, d.wy, 1);
				}
			}
			pass.end();
			s = e;
		}
		this.dev.queue.submit([enc.finish()]);
		this.adamT += n;
	}

	async endEpoch() {
		const enc = this.dev.createCommandEncoder();
		enc.copyBufferToBuffer(this.lossBuf, 0, this.lossStage, 0, 8);
		this.dev.queue.submit([enc.finish()]);
		await this.lossStage.mapAsync(GPUMapMode.READ);
		const r = new Float32Array(this.lossStage.getMappedRange());
		const out = { lossSum: r[0], wsum: r[1] };
		this.lossStage.unmap();
		return out;
	}

	predictProbs(ids) {
		const p = this._busy.then(() => this._predict(ids));
		this._busy = p.catch(() => {});
		return p;
	}

	async _predict(ids) {
		const T = this.cfg.seqLen, V = this.cfg.vocabSize + 1;
		const tail = ids.slice(-T);
		const io = new Uint32Array(this.ioStride);
		io.set(tail, T - tail.length);
		const su = new ArrayBuffer(256);
		this._fillStepU(new Uint32Array(su), new Float32Array(su), 0, 1, 1, 0, 0, 0, 1);
		this.dev.queue.writeBuffer(this.ioBuf, 0, io.buffer);
		this.dev.queue.writeBuffer(this.stepUBuf, 0, su);
		const v = this._getVariant(1, 'infer');
		const enc = this.dev.createCommandEncoder();
		const pass = enc.beginComputePass();
		for (const d of v.seq) {
			pass.setPipeline(this.pipes[d.k]);
			pass.setBindGroup(0, this.bg, [0, d.opOff]);
			pass.dispatchWorkgroups(d.wx, d.wy, 1);
		}
		pass.end();
		enc.copyBufferToBuffer(this.arenaBuf, this.A.probs * 4, this.probStage, 0, V * 4);
		this.dev.queue.submit([enc.finish()]);
		await this.probStage.mapAsync(GPUMapMode.READ);
		const probs = new Float32Array(this.probStage.getMappedRange()).slice();
		this.probStage.unmap();
		return probs;
	}

	setWeights(ws) {
		if (ws.length !== this.paramSpec.length) throw new Error(`weight count ${ws.length} != ${this.paramSpec.length}`);
		const flat = new Float32Array(this.paramCount);
		this.paramSpec.forEach((s, i) => {
			if (!sameShape(s.shape, ws[i].shape)) throw new Error(`weight ${i}: shape [${ws[i].shape}] != [${s.shape}]`);
			if (ws[i].data.length !== s.size) throw new Error(`weight ${i}: size mismatch`);
			flat.set(ws[i].data, s.offset);
		});
		this.dev.queue.writeBuffer(this.slabBuf, 0, flat);
	}

	async getWeights() {
		const enc = this.dev.createCommandEncoder();
		enc.copyBufferToBuffer(this.slabBuf, 0, this.wStage, 0, this.paramCount * 4);
		this.dev.queue.submit([enc.finish()]);
		await this.wStage.mapAsync(GPUMapMode.READ);
		const flat = new Float32Array(this.wStage.getMappedRange());
		const ws = this.paramSpec.map(s => ({ shape: s.shape.slice(), data: flat.slice(s.offset, s.offset + s.size) }));
		this.wStage.unmap();
		return ws;
	}

	memoryInfo() {
		return {
			numTensors: this.paramCount,
			numBytes: this._slabElems * 4 + this.arenaElems * 2 * 4 +
				GPU_CHUNK * this.ioStride * 4 + OP_VARIANTS * OP_SLOTS * 256
		};
	}

	dispose() {
		for (const b of [this.slabBuf, this.arenaBuf, this.ioBuf, this.stepUBuf, this.opUBuf,
			this.lossBuf, this.lossStage, this.probStage, this.wStage]) {
			try { b && b.destroy(); } catch (_) {}
		}
		this._ready = false;
	}
}

// ---------- ergonomics ----------
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
P.takeLast = function () { return takeLast(this); };

const gpu = { init: gpuInit, available: async () => !!(await gpuInit()), MAX_T: GPU_MAX_T, CHUNK: GPU_CHUNK };
const ops = { add, sub, mul, div, matmul, reshape, swish, sigmoid, relu, exp, log, sqrt, rsqrt,
	sliceLast, concatLast, meanRows, meanAxis1, embedding: embeddingOp, causalAttention, takeLast };

export {
	Tensor, Module, Dense, Embedding, LayerNorm, RoPE, CausalSelfAttention, ChatLM, Adam,
	backward, noGrad, clearTape, sparseCE, softmaxRow,
	manualSeed, gradCheck, stats, saveJSON, loadJSON, packJSON,
	GPUChatLM, gpu, ops
};