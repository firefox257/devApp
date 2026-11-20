// ========== CONFIG ==========
const HIDDEN_DIM = 64;
const NUM_LAYERS = 2;
const SPECIAL_TOKENS = ['<|system|>', '<|user|>', '<|assistant|>', '<|stop|>'];
const WORKER_BACKEND = 'webgpu';

tf.enableProdMode();

let customTokenizer = null, model = null, vocab = null, idToToken = [];
let isTraining = false, lossHistory = [], useRoPE = true, stopTokenId = null;
let activeSeqLen = null;
const ropeCache = {};

let trainingWorker = null;
let workerBackendReady = false;
let trainingCancelled = false;

const els = {};

// ========== WORKER CODE (embedded Blob) ==========
const WORKER_CODE = `
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js');

const HIDDEN_DIM = 64, NUM_LAYERS = 2;
const ropeCache = {};
let model = null, xs = null, ys = null;
let training = false, cancelled = false, backendName = null;

tf.enableProdMode();

const yieldToEvents = () => new Promise(res => {
	const ch = new MessageChannel();
	ch.port1.onmessage = () => { ch.port1.close(); res(); };
	ch.port2.postMessage(0);
});

function computeRoPEConstants(seqLen, hiddenDim, base = 10000) {
	const key = \`\${seqLen}_\${hiddenDim}\`;
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
			if (!this._sin) {
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
	m.compile({ optimizer: tf.train.adam(lr), loss: 'sparseCategoricalCrossentropy' });
	return m;
}

async function initBackend(preferred) {
	const order = [...new Set([preferred, 'webgpu', 'webgl', 'wasm', 'cpu'])];
	for (const b of order) {
		try {
			if (b === 'webgpu' && !self.navigator?.gpu) continue;
			if (b === 'webgl' && typeof OffscreenCanvas === 'undefined') continue;
			await tf.setBackend(b);
			await tf.ready();
			return b;
		} catch (e) { /* fall through */ }
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
	cleanupTraining();
	try {
		const { count, config, xsBuffer, ysBuffer } = payload;
		const vocabSize = config.vocabSize ?? payload.vocabSize;
		config.vocabSize = vocabSize; // guarantee it survives the round-trip to main thread
		const { lr, useRoPE, seqLen, epochs, batchSize } = config;

		xs = tf.tensor2d(xsBuffer, [count, seqLen], 'int32');
		ys = tf.tensor2d(ysBuffer, [count, 1], 'float32'); // sparse CE runs floor() on labels → needs float32
		model = createModel(vocabSize, lr, useRoPE, seqLen);

		await model.fit(xs, ys, {
			epochs, batchSize, shuffle: true,
			yieldEvery: 'never',
			callbacks: {
				onBatchEnd: async (batch) => {
					if (cancelled) model.stopTraining = true;
					if ((batch & 3) === 0) await yieldToEvents();
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
`;

document.addEventListener('DOMContentLoaded', async () => {
	Object.assign(els, {
		sampleText: document.getElementById('sampleText'), epochs: document.getElementById('epochs'),
		lr: document.getElementById('learningRate'), seqLen: document.getElementById('seqLength'),
		enableRoPE: document.getElementById('enableRoPE'), trainBtn: document.getElementById('trainBtn'),
		trainStatus: document.getElementById('trainStatus'), trainLog: document.getElementById('trainLog'),
		lossChart: document.getElementById('lossChart'), chatInput: document.getElementById('chatInput'),
		generateBtn: document.getElementById('generateBtn'), chatOutput: document.getElementById('chatOutput'),
		responseText: document.getElementById('responseText'), rawOutput: document.getElementById('rawOutput'),
		chatStatus: document.getElementById('chatStatus'), temp: document.getElementById('temperature'),
		maxGen: document.getElementById('maxGenTokens'), tokDot: document.getElementById('tokDot'),
		tokStatus: document.getElementById('tokStatus'), sampleCount: document.getElementById('sampleCount'),
		vocabSize: document.getElementById('vocabSize'), archSeq: document.getElementById('archSeq'),
		exportBtn: document.getElementById('exportBtn'), ropeStatus: document.getElementById('ropeStatus'),
		tagSelector: document.getElementById('tagSelector'),
		predictionPanel: document.getElementById('predictionPanel'),
		predictionList: document.getElementById('predictionList'),
		predictionCount: document.getElementById('predictionCount'),
		topK: document.getElementById('topK'),
		rebuildTokenBtn: document.getElementById('rebuildTokenBtn')
	});

	els.archSeq.textContent = parseInt(els.seqLen.value);

	await initTrainingWorker();
	await initTokenizer();

	els.trainBtn.addEventListener('click', trainModel);
	els.generateBtn.addEventListener('click', generateResponse);
	els.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !els.generateBtn.disabled) {
      e.preventDefault();
      generateResponse();
    }
  });
	els.enableRoPE.addEventListener('change', () => {
    useRoPE = els.enableRoPE.checked;
    els.ropeStatus.textContent = useRoPE ? 'Enabled' : 'Disabled';
  });
	els.seqLen.addEventListener('change', () => {
    const v = parseInt(els.seqLen.value);
    els.archSeq.textContent = v;
    showStatus(els.trainStatus, v >= 128 ? `⚠️ ${v} tokens: Training will take longer.` : '', 'warning');
  });
	els.tagSelector.addEventListener('change', () => {
    if (els.tagSelector.value) {
      els.chatInput.value += els.tagSelector.value;
      els.chatInput.focus();
      els.tagSelector.value = '';
    }
  });
	els.topK?.addEventListener('change', () => {
    els.predictionCount.textContent = `Top ${els.topK.value}`;
  });
	els.rebuildTokenBtn?.addEventListener('click', manualRebuildTokenizer);

	els.sampleText?.addEventListener('input', () => {
	  els.rebuildTokenBtn.disabled = false;
	  clearTimeout(window.vt);
	  window.vt = setTimeout(async () => {
	    if (!isTraining) {
	      els.tokStatus.textContent = 'Auto-updating...';
	      await buildVocabulary();
	      els.tokStatus.textContent = `✓ Ready • ${vocab.length}`;
	      els.vocabSize.textContent = vocab.length;

	      if (model) {
	        log('⚠️ Vocabulary changed — model needs retraining', 'warn');
	        els.generateBtn.disabled = true;
	        els.exportBtn.disabled = true;
	      }
	      log('🔤 Tokenizer auto-updated');
	    }
	  }, 400);
	});

	els.sampleCount.textContent = els.sampleText.value.split('<|stop|>').filter(l=>l.trim()).length;
	updateBackendDisplay('worker', { name: WORKER_BACKEND, status: 'initializing' });
});

async function initTrainingWorker() {
  if (typeof Worker === 'undefined') {
    log('❌ Web Workers not supported — falling back to main thread', 'error');
    showStatus(els.trainStatus, '⚠️ Workers unsupported — UI may lag during training', 'warning');
    return;
  }
  try {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    trainingWorker = new Worker(URL.createObjectURL(blob));

    trainingWorker.onmessage = (e) => handleWorkerMessage(e.data);
    trainingWorker.onerror = (e) => {
      log(`❌ Worker error: ${e.message}`, 'error');
      showStatus(els.trainStatus, `Worker error: ${e.message}`, 'error');
      isTraining = false;
      els.trainBtn.disabled = false;
    };

    trainingWorker.postMessage({
      type: 'INIT_BACKEND',
      payload: { backend: WORKER_BACKEND }
    });

    log('🔧 Training worker initialized');
  } catch (err) {
    log(`❌ Failed to create worker: ${err.message}`, 'error');
    showStatus(els.trainStatus, '⚠️ Worker init failed — using main thread fallback', 'warning');
  }
}

async function handleWorkerMessage(data) {
  const { type, epoch, totalEpochs, loss, memory, weights, config, backend, message, stack } = data;

  switch (type) {
    case 'BACKEND_READY':
      workerBackendReady = true;
      log(`✅ Worker backend: ${backend.toUpperCase()}`);
      updateBackendDisplay('worker', { name: backend, status: 'ready', memory });
      if (vocab?.length && !isTraining) {
        els.trainBtn.disabled = false;
        els.trainBtn.innerHTML = '🚀 Train';
      }
      break;

    case 'PROGRESS':
      lossHistory.push(loss);
      updateLossChart();
      const pct = Math.round((epoch + 1) / totalEpochs * 100);
      showStatus(els.trainStatus, `${pct}% • Loss: ${loss.toFixed(4)}`, 'training');
      log(`Epoch ${epoch + 1}/${totalEpochs} • Loss: ${loss.toFixed(4)}`);
      if (epoch % 5 === 0 && memory?.numBytes) {
        const mb = (memory.numBytes / 1024 / 1024).toFixed(1);
        log(`📊 Worker Mem: ${mb}MB • Tensors: ${memory.numTensors}`);
      }
      break;

    case 'TRAIN_COMPLETE':
      if (trainingCancelled) {
        trainingCancelled = false;
        log('⏭️ Training result ignored (was cancelled)');
        return;
      }
      try {
        await reconstructModelFromWeights(weights, config);
        showStatus(els.trainStatus, '✅ Training complete!', 'success');
        log('🎉 Model ready for generation!');
        els.generateBtn.disabled = false;
        els.exportBtn.disabled = false;
        els.trainBtn.innerHTML = '🔄 Retrain';
      } catch (e) {
        showStatus(els.trainStatus, `❌ ${e.message}`, 'error');
        log(`Reconstruction failed: ${e.message}`, 'error');
      }
      isTraining = false;
      els.trainBtn.disabled = false;
      break;

    case 'ERROR':
      log(`❌ Worker error: ${message}`, 'error');
      if (stack) console.error('[Worker Stack]', stack);
      showStatus(els.trainStatus, `❌ ${message}`, 'error');
      isTraining = false;
      els.trainBtn.disabled = false;
      els.generateBtn.disabled = !model;
      els.exportBtn.disabled = !model;
      break;

    case 'TRAIN_CANCELLED':
      log('⏹️ Training cancelled');
      showStatus(els.trainStatus, 'Training cancelled', 'warning');
      isTraining = false;
      els.trainBtn.disabled = false;
      els.generateBtn.disabled = !model;
      els.exportBtn.disabled = !model;
      break;
  }
}

async function reconstructModelFromWeights(weightData, config) {
  if (model) {
    model.dispose();
    model = null;
  }
  const m = createModel(config.vocabSize, 0.001, config.useRoPE, config.seqLen);
  const weights = weightData.map(wd => tf.tensor(wd.data, wd.shape, wd.dtype));
  m.setWeights(weights);
  weights.forEach(w => w.dispose());
  model = m;
  activeSeqLen = config.seqLen;
  els.archSeq.textContent = config.seqLen;
  log(`✓ Model reconstructed: ${config.vocabSize + 1} vocab, seqLen ${config.seqLen}`);
}

function log(msg, type = 'info') {
	const time = new Date().toLocaleTimeString();
	const prefix = {error:'❌', success:'✅', warn:'⚠️'}[type] || 'ℹ️';
	els.trainLog.innerHTML += `[${time}] ${prefix} ${msg}\n`;
	els.trainLog.scrollTop = els.trainLog.scrollHeight;
}

function showStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = `status show ${type}`;
}

function buildChatTokenizer(corpus, specialTokens = []) {
	const tokenRegex = /[a-zA-Z0-9]+|[^a-zA-Z0-9\s]/g;
	const baseTokens = corpus.match(tokenRegex) || [];
	const specialSet = new Set(specialTokens);
	const uniqueBase = [...new Set(baseTokens)].filter(t => !specialSet.has(t));
	uniqueBase.sort((a, b) => {
    for(let i=0; i<Math.max(a.length, b.length); i++) {
      const ca = i<a.length?a.charCodeAt(i):-1, cb = i<b.length?b.charCodeAt(i):-1;
      if(ca!==cb) return ca-cb;
    }
    return 0;
  });
	const vocabulary = [...specialTokens, ...uniqueBase];
	const decoder = {}; vocabulary.forEach((t, i) => decoder[t] = i + 1);
	const encode = text => {
		const ids = []; const escaped = specialTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
		const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'g')).filter(p => p.trim());
		for (const p of parts) {
      if(specialSet.has(p)) ids.push(decoder[p]);
      else ids.push(...(p.match(tokenRegex)||[]).map(t=>decoder[t]||0));
    }
		return ids;
	};
	return { vocabulary, decoder, encode, decode: ids => ids.map(id => id===0?'':(vocabulary[id-1]||'')).join(''), specialTokens };
}

function restoreSpacing(decodedText, vocabulary, specialTokens) {
	if (!decodedText) return '';
	const escaped = specialTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const segments = decodedText.split(new RegExp(`(${escaped.join('|')})`, 'g'));
	const valid = new Set(vocabulary);
	return segments.map(seg => {
		if (specialTokens.includes(seg)) return seg;
		let words = [], i = 0;
		while (i < seg.length) {
      let m = null;
      for (let l = Math.min(30, seg.length - i); l > 0; l--) {
        if (valid.has(seg.slice(i, i+l))) {
          m = seg.slice(i, i+l);
          break;
        }
      }
      if (m) { words.push(m); i += m.length; }
      else { words.push(seg[i++]); }
    }
		return words.join(' ').replace(/\s+([,.!?:;'"')\]])/g, '$1').trim();
	}).join('').trim();
}

async function buildVocabulary() {
	customTokenizer = buildChatTokenizer(els.sampleText.value, SPECIAL_TOKENS);
	vocab = customTokenizer.vocabulary;
	idToToken = ['<unk>', ...vocab.map(t => t.replace(/\n/g,'\\n'))];
	stopTokenId = customTokenizer.decoder['<|stop|>'];
	els.vocabSize.textContent = vocab.length;
  els.sampleCount.textContent = els.sampleText.value.split('<|stop|>').filter(l=>l.trim()).length;
  log(`✓ Vocab: ${vocab.length} | Stop ID: ${stopTokenId}`);
}

async function initTokenizer() {
	els.tokStatus.textContent = 'Building...'; els.tokDot.className = 'status-dot';
	try {
    await buildVocabulary();
    if(vocab.length===0) throw new Error('Empty');
    els.tokDot.className = 'status-dot success';
    els.tokStatus.textContent = `✓ Ready • ${vocab.length}`;

    if (workerBackendReady) {
      els.trainBtn.disabled = false;
      els.trainBtn.innerHTML = '🚀 Train';
    }

    els.chatInput.disabled = false;
    els.rebuildTokenBtn.disabled = false;
    log('🔤 Tokenizer ready');
  }
	catch(e) { els.tokDot.className = 'status-dot error'; els.tokStatus.textContent = `Error: ${e.message.slice(0,20)}`; log(e.message, 'error'); }
}

function setTokenBtnState(enabled, loading = false) {
  els.rebuildTokenBtn.disabled = !enabled || loading;
  els.rebuildTokenBtn.innerHTML = loading
    ? '<span style="display:inline-block; animation: spin 1s linear infinite">🌀</span> Building...'
    : '🔄 Rebuild Tokenizer';
}

async function manualRebuildTokenizer() {
  if (!els.sampleText.value.trim()) {
    showStatus(els.trainStatus, '⚠️ Enter training data first', 'warning');
    return;
  }
  setTokenBtnState(false, true);
  els.tokStatus.textContent = 'Rebuilding...';
  els.tokDot.className = 'status-dot';
  try {
    await buildVocabulary();
    if (vocab.length === 0) throw new Error('Empty vocabulary');
    els.tokDot.className = 'status-dot success';
    els.tokStatus.textContent = `✓ Ready • ${vocab.length} tokens`;
    els.vocabSize.textContent = vocab.length;
    if (model) {
      log('⚠️ Vocabulary changed — model needs retraining', 'warn');
      els.generateBtn.disabled = true;
      els.exportBtn.disabled = true;
      showStatus(els.chatStatus, '🔁 Model needs retraining after vocab change', 'warning');
    }
    if (!isTraining && workerBackendReady) {
      els.trainBtn.disabled = false;
      els.trainBtn.innerHTML = '🚀 Train';
    }
    log('🔤 Tokenizer rebuilt manually');
    showStatus(els.trainStatus, '✓ Tokenizer updated', 'success');
  } catch (e) {
    els.tokDot.className = 'status-dot error';
    els.tokStatus.textContent = `Error: ${e.message.slice(0, 25)}`;
    log(`❌ Rebuild failed: ${e.message}`, 'error');
    showStatus(els.trainStatus, `❌ ${e.message}`, 'error');
  } finally { setTokenBtnState(true, false); }
}

function computeRoPEConstants(seqLen, hiddenDim, base=10000) {
	const key = `${seqLen}_${hiddenDim}`; if(ropeCache[key]) return ropeCache[key];
	const half = Math.floor(hiddenDim/2), freqs = Array.from({length:half}, (_,i)=>1/Math.pow(base, 2*i/hiddenDim));
	const s=[], c=[]; for(let p=0;p<seqLen;p++){const sr=[],cr=[];for(let i=0;i<half;i++){sr.push(Math.sin(p*freqs[i]));cr.push(Math.cos(p*freqs[i]));}s.push(sr);c.push(cr);}
	return ropeCache[key]={sinTable:s, cosTable:c, halfDim:half};
}

class RoPELayer extends tf.layers.Layer {
	constructor(cfg){super(cfg);this.seqLen=cfg.seqLen;this.hiddenDim=cfg.hiddenDim;const{sinTable,cosTable,halfDim}=computeRoPEConstants(this.seqLen,this.hiddenDim);this.sinTable=sinTable;this.cosTable=cosTable;this.halfDim=halfDim;this._sin=null;this._cos=null;}
	static className='RoPELayer'; computeOutputShape(s){return s;}
	getConfig() { return { ...super.getConfig(), seqLen: this.seqLen, hiddenDim: this.hiddenDim }; }
	call(inputs){return tf.tidy(()=>{
		if(!this._sin){
			this._sin = tf.keep(tf.tensor2d(this.sinTable,[this.seqLen,this.halfDim]).reshape([1,this.seqLen,this.halfDim]));
			this._cos = tf.keep(tf.tensor2d(this.cosTable,[this.seqLen,this.halfDim]).reshape([1,this.seqLen,this.halfDim]));
		}
		const x=inputs[0],s=this._sin,c=this._cos;
		const x1=tf.slice(x,[0,0,0],[-1,-1,this.halfDim]),x2=tf.slice(x,[0,0,this.halfDim],[-1,-1,this.halfDim]);
		return tf.concat([tf.sub(tf.mul(x1,c),tf.mul(x2,s)),tf.add(tf.mul(x1,s),tf.mul(x2,c))],-1);
	});}
	dispose() {
		this._sin?.dispose(); this._cos?.dispose();
		this._sin = this._cos = null;
		return super.dispose();
	}
}
tf.serialization.registerClass(RoPELayer);

function prepareSegmentTrainingData() {
	const raw = els.sampleText.value.trim();
	const requested = parseInt(els.seqLen.value);
	const segments = raw.split('<|stop|>').map(s => s.trim()).filter(Boolean);
	const encoded = segments.map(s => customTokenizer.encode(s + '<|stop|>')).filter(ids => ids.length >= 2);
	if (!encoded.length) return null;

	const seqLen = Math.min(requested, Math.max(...encoded.map(ids => ids.length)));
	if (seqLen < requested) log(`⚡ Context auto-capped ${requested} → ${seqLen} (longest segment)`);

	let count = 0;
	for (const ids of encoded) count += ids.length - 1;

	const xs = new Int32Array(count * seqLen);
	const ys = new Int32Array(count);
	let row = 0;
	for (const ids of encoded) {
		for (let i = 0; i < ids.length - 1; i++) {
			const start = Math.max(0, i - seqLen + 1);
			const slice = ids.slice(start, i + 1);
			const offset = seqLen - slice.length;
			xs.set(slice, row * seqLen + offset);
			ys[row] = ids[i + 1];
			row++;
		}
	}
	log(`📦 ${count} segment-aware sequences • ${(xs.byteLength / 1024).toFixed(1)}KB flat buffer`);
	return { xs, ys, count, seqLen };
}

function createModel(vsz, lr, rope=true, seqLen=300) {
	const inp = tf.input({shape:[seqLen], dtype:'int32'});
	let x = tf.layers.embedding({inputDim:vsz+1,outputDim:HIDDEN_DIM,inputLength:seqLen}).apply(inp);
	x = tf.layers.layerNormalization().apply(x);
	if(rope) x = new RoPELayer({seqLen:seqLen,hiddenDim:HIDDEN_DIM}).apply(x);
	for(let i=0;i<NUM_LAYERS;i++){
		const r = x;
		const g = tf.layers.dense({units:HIDDEN_DIM}).apply(x);
		const v = tf.layers.dense({units:HIDDEN_DIM}).apply(x);
		x = tf.layers.multiply().apply([tf.layers.activation({activation:'swish'}).apply(g), v]);
		x = tf.layers.add().apply([x, r]);
		x = tf.layers.layerNormalization().apply(x);
	}
	x = tf.layers.globalAveragePooling1d().apply(x);
	const out = tf.layers.dense({units:vsz+1, activation:'softmax'}).apply(x);
	const m = tf.model({inputs:inp, outputs:out});
	m.compile({optimizer:tf.train.adam(lr), loss:'sparseCategoricalCrossentropy'});
	return m;
}

async function trainModel() {
	if(isTraining || !vocab?.length) return;
  if (!trainingWorker || !workerBackendReady) {
    showStatus(els.trainStatus, '⚠️ Worker not ready — please wait', 'warning');
    return;
  }
  trainingCancelled = false;
	isTraining = true;
	els.trainBtn.disabled = true;
	els.generateBtn.disabled = true;
	els.exportBtn.disabled = true;
	lossHistory = [];
	els.trainLog.innerHTML = '';
	showStatus(els.trainStatus, 'Preparing data...', 'training');

	try {
		const data = prepareSegmentTrainingData();
    if (!data) throw new Error('No valid sequences. Check training data format.');
    const { xs, ys, count, seqLen } = data;

    const batchSize = Math.max(1, Math.min(seqLen <= 64 ? 32 : seqLen <= 128 ? 16 : 8, count));
    activeSeqLen = seqLen;
    els.archSeq.textContent = seqLen;

    showStatus(els.trainStatus, 'Sending to worker...', 'training');
    trainingWorker.postMessage({
      type: 'TRAIN',
      payload: {
        vocabSize: vocab.length, count, xsBuffer: xs, ysBuffer: ys,
        config: {
          vocabSize: vocab.length,
          lr: parseFloat(els.lr.value),
          useRoPE: els.enableRoPE.checked,
          seqLen,
          epochs: parseInt(els.epochs.value),
          batchSize
        },
        backend: WORKER_BACKEND
      }
    }, [xs.buffer, ys.buffer]);

    log(`🚀 Training in worker • batch ${batchSize} • seqLen ${seqLen}`);
	} catch(e){
		showStatus(els.trainStatus, `❌ ${e.message}`, 'error');
		log(e.message, 'error');
    isTraining = false;
    els.trainBtn.disabled = false;
    els.generateBtn.disabled = !model;
    els.exportBtn.disabled = !model;
	}
}

function sampleFromProbs(p, t=1.0) {
  if(t===0) {
    let mx=0;
    for(let i=1;i<p.length;i++) if(p[i]>p[mx]) mx=i;
    return mx;
  }
  const sc=p.map(v=>Math.log(v+1e-10)/t), mx=Math.max(...sc), ex=sc.map(v=>Math.exp(v-mx)), sm=ex.reduce((a,b)=>a+b,0), nm=ex.map(v=>v/sm), r=Math.random();
  let c=0;
  for(let i=0;i<nm.length;i++){c+=nm[i];if(r<=c)return i;}
  return nm.length-1;
}

async function generateResponse() {
	if(!model||!customTokenizer){showStatus(els.chatStatus,'⚠️ Train first!','error');return;}
	const raw = els.chatInput.value.trim(); if(!raw){showStatus(els.chatStatus,'⚠️ Type a prompt!','error');return;}
	showStatus(els.chatStatus,'Generating...','training'); els.chatOutput.classList.add('ready'); els.responseText.innerHTML='<span style="color:var(--text-dim)">Processing...</span>'; els.rawOutput.value='';
	const seqLen = activeSeqLen ?? parseInt(els.seqLen.value), maxT = parseInt(els.maxGen.value), temp = parseFloat(els.temp.value);
	let ctx = customTokenizer.encode(raw), gen = [], stopped = false;
	try {
		for(let i=0;i<maxT;i++){let inp=ctx.slice(-seqLen); if(inp.length<seqLen)inp=[...Array(seqLen-inp.length).fill(0),...inp];
		const t=tf.tensor2d([inp],[1,seqLen],'int32'), p=model.predict(t), probs=await p.data(); t.dispose(); p.dispose();
		const n=sampleFromProbs(probs,temp); if(n===stopTokenId||n===0){stopped=true;break;} gen.push(n); ctx.push(n);}
		els.rawOutput.value = restoreSpacing(customTokenizer.decode(stopped?[...gen,stopTokenId]:gen), vocab, SPECIAL_TOKENS);
		els.responseText.innerHTML = `<span style="color:var(--primary)">Input:</span> ${raw}<br><span style="color:var(--success)">Output:</span> ${restoreSpacing(customTokenizer.decode(gen),vocab,SPECIAL_TOKENS)||'Empty.'}`;
		showStatus(els.chatStatus,'✓ Generated!','success');
		await updatePredictions();
	} catch(e){els.responseText.textContent=`Error: ${e.message}`; showStatus(els.chatStatus,`❌ ${e.message}`,'error'); console.error(e);}
}

async function getTopKPredictions(prompt, k) {
	if(!model||!customTokenizer) return [];
	const seqLen = activeSeqLen ?? parseInt(els.seqLen.value);
	let inp = customTokenizer.encode(prompt).slice(-seqLen);
	if(inp.length < seqLen) inp = [...Array(seqLen-inp.length).fill(0), ...inp];
	const t = tf.tensor2d([inp], [1, seqLen], 'int32');
	const p = model.predict(t);
	const probs = Array.from(await p.data());
	t.dispose(); p.dispose();

	return probs.map((pr, i) => ({
		token: idToToken[i] !== undefined ? idToToken[i] : (i === 0 ? '<unk>' : `[ID:${i}]`),
		prob: pr
	})).sort((a,b) => b.prob - a.prob)
	  .slice(0, k)
	  .map(item => ({ ...item, pct: (item.prob * 100).toFixed(2) }));
}

function renderPredictions(preds) {
	const list = els.predictionList; list.innerHTML = '';
	if(!preds || preds.length === 0) {
		list.innerHTML = '<div style="padding:0.8rem;color:var(--text-dim);text-align:center">No predictions available</div>';
		els.predictionPanel.classList.add('show');
		els.predictionPanel.scrollIntoView({behavior:'smooth', block:'nearest'});
		return;
	}
	const maxP = preds[0].prob || 0.001;
	preds.forEach(p => {
		if (!p || !p.token) return;
		const el = document.createElement('div');
		el.className = 'prediction-item';
		const safeToken = String(p.token).replace(/\n/g,'↵').replace(/\s+/g,'·');
		const barWidth = Math.min(100, (p.prob / maxP) * 100);
		el.innerHTML = `<span class="prediction-token">${safeToken}</span><div style="display:flex;align-items:center;gap:0.6rem"><div class="prediction-bar" style="width:${barWidth}%"></div><span class="prediction-prob">${p.pct}%</span></div>`;
		el.addEventListener('click', () => { els.chatInput.value += p.token; els.chatInput.focus(); });
		list.appendChild(el);
	});
	els.predictionPanel.classList.add('show');
	els.predictionPanel.scrollIntoView({behavior:'smooth', block:'nearest'});
}

async function updatePredictions() {
	const prompt = els.chatInput.value.trim();
	if(!prompt) { els.predictionPanel.classList.remove('show'); return; }
	els.predictionCount.textContent = `Top ${els.topK.value}`;
	try {
		const preds = await getTopKPredictions(prompt, parseInt(els.topK.value));
		renderPredictions(preds);
	} catch(e) {
		console.warn('Prediction error:', e);
		els.predictionList.innerHTML = `<div style="padding:0.8rem;color:var(--error)">⚠️ Prediction failed: ${e.message?.slice(0,50) || 'Unknown error'}</div>`;
		els.predictionPanel.classList.add('show');
	}
}

function updateLossChart() {
	const c=els.lossChart; c.innerHTML=''; if(!lossHistory.length)return;
	const mx=Math.max(...lossHistory,0.001), bw=Math.max(2,Math.floor(c.clientWidth/Math.max(lossHistory.length,15)));
	lossHistory.forEach((l,i)=>{const b=document.createElement('div');b.className='loss-bar';b.style.left=`${i*bw}px`;b.style.height=`${Math.min(100,l/mx*100)}%`;c.appendChild(b);});
}

function clearChat() {
  els.chatInput.value='';
  els.responseText.innerHTML='<span style="color:var(--text-dim)">Cleared. Enter a raw prompt...</span>';
  els.rawOutput.value='';
  els.chatOutput.classList.remove('ready');
  els.predictionPanel.classList.remove('show');
  showStatus(els.chatStatus,'','');
}

async function exportModel() {
  if(!model)return;
  try{
    showStatus(els.chatStatus,'Exporting...','training');
    await model.save('downloads://chat-llm');
    showStatus(els.chatStatus,'✅ Exported','success');
  }catch(e){
    showStatus(els.chatStatus,`❌ ${e.message}`,'error');
  }
}

function updateBackendDisplay(backend, info) {
	let statusEl = document.getElementById('backendStatus');
	if (!statusEl) {
		const el = document.createElement('div');
		el.id = 'backendStatus';
		el.style.cssText = 'font-size:0.8rem;color:var(--text-dim);margin-top:0.5rem;padding:0.5rem;background:var(--code-bg);border-radius:6px;border:1px solid var(--border);';
		if (els.trainLog?.parentNode) {
			els.trainLog.parentNode.insertBefore(el, els.trainLog.nextSibling);
		}
		statusEl = el;
	}
	const badge = { webgl: '🎮', wasm: '⚙️', cpu: '🧠', webgpu: '🚀', worker: '🧵', none: '❌' }[backend] || '❓';
	let details = '';
	if (info.webglVersion) details += ` • WebGL ${info.webglVersion}`;
	if (info.maxTextureSize) details += ` • MaxTex: ${info.maxTextureSize}px`;
	if (info.simd !== undefined) details += ` • SIMD: ${info.simd}`;
	if (info.gpuName) details += ` • ${info.gpuName}`;
	if (info.memory?.numBytes) {
		const mb = (info.memory.numBytes / 1024 / 1024).toFixed(1);
		details += ` • Mem: ${mb}MB`;
	}
	if (info.error) details += ` • ⚠️ ${info.error}`;
	if (info.status) details += ` • ${info.status}`;
	statusEl.innerHTML = `<strong>${badge} Backend:</strong> <code style="color:var(--primary)">${backend.toUpperCase()}</code>${details}`;
}

async function showBackendDetails() {
	const backend = tf.getBackend();
	const available = tf.listBackends();
	const mem = tf.memory();
	const details = [
		`🔹 Active: ${backend.toUpperCase()}`,
		`🔹 Available: ${available.join(', ')}`,
		`🔹 Tensors: ${mem.numTensors}`,
		`🔹 Memory: ${(mem.numBytes/1024/1024).toFixed(2)} MB`,
		`🔹 Unreliable: ${mem.unreliable ? '⚠️ Yes' : '✅ No'}`,
		`🔹 Worker: ${trainingWorker ? '✅ Active' : '❌ Inactive'}`,
		`🔹 Worker Ready: ${workerBackendReady ? '✅ Yes' : '❌ No'}`
	].join('\n');
	alert(`🧠 TensorFlow.js Backend Info\n\n${details}`);
	log(`📋 Backend details: ${details.replace(/\n/g, ' | ')}`);
}

window.addEventListener('beforeunload', () => {
  if (trainingWorker) {
    trainingWorker.postMessage({ type: 'CANCEL' });
    trainingWorker.terminate();
    log('🔧 Training worker terminated');
  }
});

window.clearChat = clearChat;
window.exportModel = exportModel;
window.showBackendDetails = showBackendDetails;

log('🚀 Initializing with optimized Web Worker support...');