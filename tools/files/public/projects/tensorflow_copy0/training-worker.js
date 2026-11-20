// training-worker.js — optimized training core (same protocol & architecture)
importScripts('tf.min.js');

const HIDDEN_DIM = 64, NUM_LAYERS = 2;
const ropeCache = {};
let model = null, xs = null, ys = null;
let training = false, cancelled = false, backendName = null;

tf.enableProdMode(); // skip per-kernel validation checks

// Macrotask yield without setTimeout's 4ms clamp; lets CANCEL arrive between batches.
const yieldToEvents = () => new Promise(res => {
	const ch = new MessageChannel();
	ch.port1.onmessage = () => { ch.port1.close(); res(); };
	ch.port2.postMessage(0);
});

function computeRoPEConstants(seqLen, hiddenDim, base = 10000) {
	const key = `${seqLen}_${hiddenDim}`;
	if (ropeCache[key]) return ropeCache[key];
	const half = Math.floor(hiddenDim / 2);
	const freqs = Array.from({ length: half }, (_, i) => 1 / Math.pow(base, 2 * i / hiddenDim));
	const s = [], c = [];
	for (let p = 0; p < seqLen; p++) {
		const sr = [], cr = [];
		for (let i = 0; i < half; i++) { sr.push(Math.sin(p * freqs[i])); cr.push(Math.cos(p * freqs[i])); }
		s.push(sr); c.push(cr);
	}
	return ropeCache[key] = { sinTable: s, cosTable: c, halfDim: half };
}

class RoPELayer extends tf.layers.Layer {
	constructor(cfg) {
		super(cfg);
		this.seqLen = cfg.seqLen; this.hiddenDim = cfg.hiddenDim;
		const { sinTable, cosTable, halfDim } = computeRoPEConstants(this.seqLen, this.hiddenDim);
		this.sinTable = sinTable; this.cosTable = cosTable; this.halfDim = halfDim;
		this._sin = null; this._cos = null;
	}
	static className = 'RoPELayer';
	computeOutputShape(s) { return s; }
	getConfig() { return { ...super.getConfig(), seqLen: this.seqLen, hiddenDim: this.hiddenDim }; }
	call(inputs) {
		return tf.tidy(() => {
			if (!this._sin) { // ⚡ upload ONCE, reuse every step (was: every call)
				this._sin = tf.keep(tf.tensor2d(this.sinTable, [this.seqLen, this.halfDim]).reshape([1, this.seqLen, this.halfDim]));
				this._cos = tf.keep(tf.tensor2d(this.cosTable, [this.seqLen, this.halfDim]).reshape([1, this.seqLen, this.halfDim]));
			}
			const x = inputs[0], s = this._sin, c = this._cos;
			const x1 = tf.slice(x, [0, 0, 0], [-1, -1, this.halfDim]);
			const x2 = tf.slice(x, [0, 0, this.halfDim], [-1, -1, this.halfDim]);
			return tf.concat([tf.sub(tf.mul(x1, c), tf.mul(x2, s)), tf.add(tf.mul(x1, s), tf.mul(x2, c))], -1);
		});
	}
	dispose() {
		this._sin?.dispose(); this._cos?.dispose();
		this._sin = this._cos = null;
		return super.dispose();
	}
}
tf.serialization.registerClass(RoPELayer);

// Identical layer order to the main thread → weight arrays line up 1:1.
function createModel(vsz, lr, rope, seqLen) {
	const inp = tf.input({ shape: [seqLen], dtype: 'int32' });
	let x = tf.layers.embedding({ inputDim: vsz + 1, outputDim: HIDDEN_DIM, inputLength: seqLen }).apply(inp);
	x = tf.layers.layerNormalization().apply(x);
	if (rope) x = new RoPELayer({ seqLen, hiddenDim: HIDDEN_DIM }).apply(x);
	for (let i = 0; i < NUM_LAYERS; i++) {
		const r = x;
		const g = tf.layers.dense({ units: HIDDEN_DIM }).apply(x);
		const v = tf.layers.dense({ units: HIDDEN_DIM }).apply(x);
		x = tf.layers.multiply().apply([tf.layers.activation({ activation: 'swish' }).apply(g), v]);
		x = tf.layers.add().apply([x, r]);
		x = tf.layers.layerNormalization().apply(x);
	}
	x = tf.layers.globalAveragePooling1d().apply(x);
	const out = tf.layers.dense({ units: vsz + 1, activation: 'softmax' }).apply(x);
	const m = tf.model({ inputs: inp, outputs: out });
	// ⚡ sparse loss: int targets, no [batch, vocab] one-hot tensors
	m.compile({ optimizer: tf.train.adam(lr), loss: 'sparseCategoricalCrossentropy' });
	return m;
}

async function initBackend(preferred) {
	const order = [...new Set([preferred, 'webgpu', 'webgl', 'wasm', 'cpu'])];
	for (const b of order) {
		try {
			if (b === 'webgpu' && !self.navigator?.gpu) continue;
			if (b === 'webgl' && typeof OffscreenCanvas === 'undefined') continue; // WebGL in worker needs it
			if (!(await tf.setBackend(b))) continue;
			await tf.ready();
			return b;
		} catch (e) { /* fall through to next backend */ }
	}
	throw new Error('No usable TensorFlow.js backend in worker');
}

function cleanupTraining() {
	if (model) {
		try { model.dispose(); } catch (_) {}
		try { model.optimizer?.dispose(); } catch (_) {}
		model = null;
	}
	xs?.dispose(); ys?.dispose(); xs = ys = null;
}

async function train(payload) {
	if (training) throw new Error('Training already in progress');
	if (!backendName) throw new Error('Backend not initialized');
	training = true; cancelled = false;
	cleanupTraining(); // free previous run's GPU memory before allocating
	try {
		const { vocabSize, count, config } = payload;
		const { lr, useRoPE, seqLen, epochs, batchSize } = config;
		// ⚡ flat transferable buffers → tensors, built once (not per epoch)
		xs = tf.tensor2d(payload.xs, [count, seqLen], 'int32');
		ys = tf.tensor2d(payload.ys, [count, 1], 'int32');
		model = createModel(vocabSize, lr, useRoPE, seqLen);

		await model.fit(xs, ys, {
			epochs, batchSize, shuffle: true,
			yieldEvery: 'never', // no rAF in workers; we yield manually instead
			callbacks: {
				onBatchEnd: async (batch) => {
					if (cancelled) model.stopTraining = true;
					if ((batch & 3) === 0) await yieldToEvents(); // keep CANCEL responsive
				},
				onEpochEnd: async (epoch, logs) => {
					self.postMessage({ type: 'PROGRESS', epoch, totalEpochs: epochs, loss: logs.loss, memory: tf.memory() });
					await yieldToEvents();
				}
			}
		});

		if (cancelled) { cleanupTraining(); self.postMessage({ type: 'TRAIN_CANCELLED' }); return; }

		const weights = model.getWeights().map(w => ({ data: w.dataSync(), shape: w.shape, dtype: w.dtype }));
		cleanupTraining();
		// ⚡ zero-copy transfer of weight buffers back to main thread
		self.postMessage({ type: 'TRAIN_COMPLETE', weights, config }, weights.map(w => w.data.buffer));
	} catch (e) {
		cleanupTraining();
		throw e;
	} finally {
		training = false;
	}
}

self.onmessage = async (e) => {
	const { type, payload } = e.data || {};
	try {
		if (type === 'INIT_BACKEND') {
			backendName = await initBackend(payload?.backend || 'webgpu');
			self.postMessage({ type: 'BACKEND_READY', backend: backendName, memory: tf.memory() });
		} else if (type === 'TRAIN') {
			await train(payload);
		} else if (type === 'CANCEL') {
			cancelled = true;
			if (model) model.stopTraining = true;
		}
	} catch (err) {
		self.postMessage({ type: 'ERROR', message: err.message || String(err), stack: err.stack });
	}
};