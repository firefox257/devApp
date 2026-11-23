// ./tensorindex_worker.js — ES module app layer.
/* FIX: the page has BOTH <section id="corpus"> and <textarea id="corpus">.
* getElementById('corpus') returned the SECTION, so .value was always ''.
* We now bind the corpus explicitly to textarea#corpus. */
window.__tensorBoot = true;
import * as nn from './nn.js';
import { Tokenizer, restoreSpacing, STOP } from './tokenizer.js';
const WORKER_URL = 'training-worker.js';
const DEFAULT_CFG = { epochs: 300, lr: 0.001, warmup: 8, clip: 1, softCap: 10, batch: 32, seq: 32, hidden: 64, layers: 2, rope: true, seed: 1337 };
const S = {
tok: null,
model: null, gpu: null, gpuVerified: false, gpuReport: null,
worker: null, workerReady: false, workerBackend: '…',
training: false, cancelSent: false, activeSeq: null, trainStartSig: null,
loss: [], lrs: [], best: Infinity, bestEpoch: 0,
corpusSig: null, modelSig: null, modelMeta: null,
cfg: { ...DEFAULT_CFG },
suite: { running: false, stop: false, rows: [] },
conf: [], lastResult: null, undoCorpus: null,
sound: true, audio: null
};
let stepIds = [];
let stepProbs = null;

const E = {};
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mulberry = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const gpuUsable = () => !!S.gpu && S.gpuVerified;
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
/* ================= boot ================= */
document.addEventListener('DOMContentLoaded', async () => {
['pillWorker','pillRun','muteBtn','navTrain','navCancel','mismatchBar','mismatchText','btnShowDiff','btnRetrainNow','mismatchDetails',
'statEpoch','statLoss','statBest','statVocab','statSeq','statParams','heroTag','heroStatus','heroProg','progressRing','progressPct',
'badgeBackend','badgeModel','badgeSplit','runLog','btnCopyLog','btnQuickInspect','btnQuickSuite',
'corpusStats','reserveC','reserveV','btnMakeVocab','btnUndoCorpus',
'csSegments','csTokens','csVocab','csTrain','csHeld','csHash',
'tokOut','tokStats',
'cEpochs','cEpochsV','cLR','cWarmup','cWarmupV','cClip','cClipV','cSoftCap','cSoftCapV','cBatch','cSeq','cSeedV','seedMinus','seedPlus',
'cHidden','cLayersV','layMinus','layPlus','cRoPE','btnTrain','btnCancel','btnRandomize','btnResetCfg',
'lossCanvas','chartEmpty','chartTag','chartLog','mInit','mFinal','mDrop','mUnif',
'tempC','tempV','maxTokC','maxTokV','topKC','sampleMode','stopOnStop',
'btnGenerate','btnCopyResult','probStrip','confCanvas','inspTag','inspGot',
'suiteSet','suiteCount','suiteCountV','btnRunSuite','btnStopSuite','suiteProg','suiteAgg','suiteNote','suiteExact','suiteTok',
'suiteBody','suiteTag','suiteDetail','suiteAvail',
'btnParity','parityOut','provList','provState','provDiff','btnExport','btnImport','fileImport','densitySel','reduceMotion','soundOn','engineFacts','toastHost',
'stepCtx','stepList','btnStepAccept','btnStepPredict','btnStepReset'
].forEach(id => E[id] = $(id));
/* ---- DUPLICATE-ID FIX: bind the real form controls, not the <section>s ---- */
E.corpus = document.querySelector('textarea#corpus');
E.prompt = document.querySelector('textarea#prompt');
if (!E.corpus || E.corpus.tagName !== 'TEXTAREA') {
log('FATAL: could not find textarea#corpus — check the HTML', 'e');
toast('Corpus textarea not found', 'bad');
return;
}
log(`Corpus bound to <${E.corpus.tagName.toLowerCase()} id="${E.corpus.id}">`, 's');
/* ------------------------------------------------------------------------- */
loadCfg();
// NOTE: no more E.corpus.value = '' — never wipe text the user already pasted.
if (!E.prompt.value) E.prompt.value = '<|user|>ball1 and ball2<|assistant|> shows';
bindControls(); bindNav(); bindReveal();

let pt;
E.prompt.addEventListener('input', () => {
  clearTimeout(pt);
  pt = setTimeout(resetStep, 300);
});

initWorker();
S.gpu = await nn.gpu.init();
if (S.gpu) {
log('WebGPU present — verifying forward + gradients against CPU reference…', 'i');
E.parityOut.textContent = 'Verifying on this tab…';
try { S.gpuReport = await verifyGpuEngine(); S.gpuVerified = !!S.gpuReport.ok; }
catch (e) { S.gpuReport = { ok: false, error: e.message || String(e) }; S.gpuVerified = false; }
renderParityReport(S.gpuReport);
log(S.gpuVerified ? 'GPU parity PASSED — inference on device' : 'GPU parity FAILED — inference locked to verified CPU engine', S.gpuVerified ? 's' : 'e');
} else {
log('WebGPU unavailable — CPU engine', 'w');
E.parityOut.innerHTML = '<span style="color:var(--amber)">WebGPU unavailable on this tab. CPU engine is the reference.</span>';
}
paintBackend();
await rebuildTokenizer();
renderTokInspect();
drawLoss(); drawConf(); renderSuiteAgg(null); renderFacts(); renderProvenance();
log('Ready. Paste your training data into the corpus box, then tap "Make Vocab".', 'i');
});
/* ================= tokenizer inspector ================= */
function renderTokInspect() {
if (!E.tokOut || !S.tok) return;
const text = E.corpus.value;
const tokens = S.tok.tokenize(text);
const ids = S.tok.encode(text);
const uniq = new Set(tokens);
const RENDER_CAP = 250;
const shown = Math.min(tokens.length, RENDER_CAP);
let html = '';
for (let i = 0; i < shown; i++) {
const t = tokens[i], id = ids[i];
const cls = id === 0 ? ' bad' : (t === STOP ? ' stop' : '');
html += `<span class="tokchip${cls}" title="id ${id}">${esc(t)}<b>${id}</b></span>`;
}
if (tokens.length > RENDER_CAP) html += `<span style="color:var(--slate2);font-size:11px;align-self:center">… +${tokens.length - RENDER_CAP} more</span>`;
let unk = 0; const unkList = new Set();
for (let i = 0; i < ids.length; i++) if (ids[i] === 0) { unk++; unkList.add(tokens[i]); }
E.tokOut.innerHTML = html || '<span style="color:var(--slate2);font-size:12px">paste text into the corpus box above — it tokenizes live</span>';
const unkNote = unk
? `<br><span style="color:var(--red)">⚠ ${unk} unknown token${unk > 1 ? 's' : ''} (${[...unkList].slice(0, 8).map(esc).join(', ')}${unkList.size > 8 ? '…' : ''})</span>`
: '';
E.tokStats.innerHTML = `${tokens.length} tokens · ${uniq.size} unique · vocabulary size ${S.tok.vocabSize} · stopId ${S.tok.stopId}${unkNote}`;
}
/* ================= corpus ================= */
function segments() {
return E.corpus.value.split(/<\|stop\|>|\r?\n/)
.map(s => s.replace(/\s+/g, ' ').trim())
.filter(Boolean);
}
function splitInfo() {
const segs = segments();
const reserve = clamp(+E.reserveC.value || 0, 0, Math.max(0, segs.length - 1));
return { segs, reserve, train: segs.slice(0, segs.length - reserve), held: segs.slice(segs.length - reserve) };
}
function makeSig() {
const text = E.corpus.value;
return {
hash: fnv(text),
vocabHash: fnv(S.tok.vocabulary.join('|')),
segments: segments().length,
tokens: S.tok.encode(text).length,
at: new Date().toLocaleTimeString()
};
}
function sigDiff(a, b) {
if (!a || !b) return [];
const out = [];
if (a.hash !== b.hash) out.push(`corpus text differs — model trained on ${a.segments} segments / ${a.tokens} tokens, current corpus has ${b.segments} segments / ${b.tokens} tokens`);
if (a.vocabHash !== b.vocabHash) out.push('vocabulary differs');
return out;
}
function refreshCorpusStats() {
const { segs, train, held } = splitInfo();
const toks = segs.reduce((a, s) => a + S.tok.encode(s).length, 0);
E.csSegments.textContent = segs.length;
E.csTokens.textContent = toks;
E.csVocab.textContent = S.tok.vocabSize;
E.csTrain.textContent = train.length;
E.csHeld.textContent = held.length;
E.csHash.textContent = S.corpusSig ? S.corpusSig.hash : '—';
E.badgeSplit.textContent = `${train.length} train / ${held.length} held`;
E.corpusStats.textContent = `${segs.length} segments`;
E.reserveC.max = Math.max(0, Math.min(200, segs.length - 1));
if (+E.reserveC.value > +E.reserveC.max) E.reserveC.value = E.reserveC.max;
E.reserveV.textContent = E.reserveC.value;
updateSuiteAvail();
}
async function rebuildTokenizer() {
const text = E.corpus.value;
S.tok = new Tokenizer(text);
E.statVocab.textContent = S.tok.vocabSize;
E.mUnif.textContent = Math.log(S.tok.vocabSize + 1).toFixed(4);
S.corpusSig = makeSig();
refreshCorpusStats();
guardModel();
renderTokInspect();
if (S.workerReady && !S.training) setTrainEnabled(true);
renderFacts(); renderProvenance();
resetStep();
}
/* ================= provenance guard ================= */
function modelMatches() {
if (!S.model || !S.modelSig || !S.corpusSig) return false;
return S.modelSig.hash === S.corpusSig.hash && S.modelSig.vocabHash === S.corpusSig.vocabHash;
}
function guardModel() {
const has = !!S.model;
const ok = has && modelMatches();
const diffs = has ? sigDiff(S.modelSig, S.corpusSig) : [];
if (has && !ok) {
document.body.classList.add('blocked');
E.mismatchBar.classList.add('show');
E.mismatchText.textContent = `the live model was trained on a different corpus (${S.modelSig ? S.modelSig.hash : '—'}) — current corpus fingerprint is ${S.corpusSig.hash}. ${diffs.length} difference${diffs.length === 1 ? '' : 's'}.`;
E.mismatchDetails.innerHTML = diffs.length ? diffs.map(esc).join('<br>') : 'Corpora differ — retrain required.';
E.badgeModel.textContent = 'foreign model — blocked'; E.badgeModel.className = 'badge bad';
E.btnGenerate.disabled = true; E.btnRunSuite.disabled = true;
E.btnExport.disabled = false;
} else {
document.body.classList.remove('blocked');
E.mismatchBar.classList.remove('show');
E.mismatchDetails.classList.remove('show');
E.btnGenerate.disabled = !ok; E.btnRunSuite.disabled = !ok;
E.btnExport.disabled = !has;
if (ok) { E.badgeModel.textContent = `${S.model.isGPU ? 'GPU' : 'CPU'} model · corpus-bound`; E.badgeModel.className = 'badge ok'; }
else if (!has) { E.badgeModel.textContent = 'no model'; E.badgeModel.className = 'badge'; }
}
renderProvenance();
}
function renderProvenance() {
const m = S.modelSig, c = S.corpusSig;
E.provList.innerHTML = [
['model', S.model ? (S.model.isGPU ? 'WebGPU' : 'CPU') : 'none'],
['trained at', m ? m.at : '—'],
['model corpus', m ? `${m.segments} segments · ${m.tokens} tokens` : '—'],
['model hash', m ? m.hash : '—'],
['corpus hash', c ? c.hash : '—'],
['vocab match', m && c ? (m.vocabHash === c.vocabHash ? 'yes' : 'NO') : '—'],
['backend', S.workerBackend.toUpperCase()],
['arch', S.modelMeta ? `${S.modelMeta.hiddenDim}d × ${S.modelMeta.numLayers} · ctx ${S.modelMeta.seqLen}` : '—']
].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
const ok = modelMatches();
E.provState.textContent = !S.model ? 'no model' : ok ? 'bound to this corpus' : 'MISMATCH — grading blocked';
E.provState.className = 'badge ' + (!S.model ? '' : ok ? 'ok' : 'bad');
const diffs = S.model ? sigDiff(m, c) : [];
if (diffs.length) { E.provDiff.style.display = 'block'; E.provDiff.innerHTML = diffs.map(esc).join('<br>'); }
else E.provDiff.style.display = 'none';
}
/* ================= worker ================= */
function initWorker() {
if (typeof Worker === 'undefined') { log('Web Workers unsupported', 'e'); return; }
try {
S.worker = new Worker(WORKER_URL, { type: 'module' });
S.worker.onmessage = ev => onWorker(ev.data);
S.worker.onerror = ev => { log('Worker error: ' + ev.message, 'e'); toast('Worker error: ' + ev.message, 'bad'); S.training = false; setTrainEnabled(true); };
S.worker.postMessage({ type: 'INIT_BACKEND', payload: {} });
} catch (e) { log('Worker creation failed: ' + e.message, 'e'); }
}
async function onWorker(d) {
switch (d.type) {
case 'CONSOLE':
log(d.payload.msg, d.payload.kind);
break;
case 'BACKEND_READY':
S.workerReady = true; S.workerBackend = d.backend; paintBackend();
log(`Training backend: ${d.backend.toUpperCase()}${d.adapter && d.adapter.description ? ' · ' + d.adapter.description : ''}`, d.backend === 'webgpu' ? 's' : 'w');
if (d.parity && !d.parity.ok && !d.parity.error) log(`Worker GPU parity failed: loss ${d.parity.cpuLoss.toFixed(4)} vs ${d.parity.gpuLoss.toFixed(4)}, maxRel ${d.parity.maxRel.toExponential(2)}`, 'e');
if (d.note) log(d.note, 'w');
if (!S.training) setTrainEnabled(true);
renderFacts(); renderProvenance();
break;
case 'PROGRESS': {
S.loss.push(d.loss); S.lrs.push(d.lr || 0);
if (d.loss < S.best) { S.best = d.loss; S.bestEpoch = d.epoch + 1; }
setProgress((d.epoch + 1) / d.totalEpochs);
E.statEpoch.textContent = `${d.epoch + 1}/${d.totalEpochs}`;
E.statLoss.textContent = d.loss.toFixed(4);
E.statBest.textContent = S.best.toFixed(4);
E.heroStatus.innerHTML = `epoch <b>${d.epoch + 1}</b> · loss <b>${d.loss.toFixed(4)}</b> · lr <b>${(d.lr || 0).toFixed(5)}</b>`;
E.chartTag.textContent = `epoch ${d.epoch + 1}`;
drawLoss(); updateLossStats();
if ((d.epoch + 1) % 25 === 0) { log(`epoch ${d.epoch + 1}/${d.totalEpochs} · loss ${d.loss.toFixed(4)}`); beepForLoss(d.loss); }
break;
}
case 'TRAIN_COMPLETE':
if (S.cancelSent) { S.cancelSent = false; break; }
try {
await loadModel(d.weights, d.config);
S.modelSig = d.config.corpusSig || S.trainStartSig;
S.modelMeta = { hiddenDim: d.config.hiddenDim || 64, numLayers: d.config.numLayers || 2, seqLen: d.config.seqLen };
guardModel();
E.heroStatus.innerHTML = `<b>trained</b> · final loss <b>${(S.loss[S.loss.length - 1] || 0).toFixed(4)}</b> · best <b>${S.best.toFixed(4)}</b> @ ${S.bestEpoch}`;
E.heroTag.textContent = 'ready'; setProgress(1);
log(`Model live on ${S.model.isGPU ? 'WebGPU' : 'CPU'} · bound to corpus ${S.modelSig ? S.modelSig.hash : '—'}`, 's');
toast('Training complete — inspect or run the test', 'ok'); chord(true);
resetStep();
} catch (e) { log('Reconstruction failed: ' + e.message, 'e'); toast('Reconstruction failed: ' + e.message, 'bad'); }
S.training = false; setTrainEnabled(true); renderFacts();
break;
case 'TRAIN_CANCELLED':
log('Training cancelled', 'w'); E.heroTag.textContent = 'cancelled';
S.training = false; S.cancelSent = false; setTrainEnabled(true); break;
case 'ERROR':
log('Worker: ' + d.message, 'e'); toast(d.message, 'bad');
S.training = false; setTrainEnabled(true); chord(false); break;
}
}
function setTrainEnabled(on) {
const nSeg = segments().length;
const can = on && S.workerReady && S.tok && S.tok.vocabSize > 1 && nSeg > 0;
[E.btnTrain, E.navTrain].forEach(b => { b.disabled = !can; b.textContent = can ? (S.model ? '▶ Retrain' : '▶ Train model') : '▶ Train'; });
E.navTrain.textContent = E.btnTrain.textContent.replace(' model', '');
[E.btnCancel, E.navCancel].forEach(b => b.disabled = on);
if (!can && on) {
const why = !S.workerReady ? 'worker still probing'
: !S.tok || S.tok.vocabSize <= 1 ? 'vocabulary empty (corpus not read)'
: nSeg === 0 ? 'no segments' : 'busy';
E.heroStatus.textContent = `Train disabled — ${why}`;
}
}
function setProgress(p) {
const c = 2 * Math.PI * 48;
E.progressRing.setAttribute('stroke-dashoffset', String(c * (1 - clamp(p, 0, 1))));
E.progressPct.textContent = Math.round(p * 100) + '%';
E.heroProg.style.width = (p * 100) + '%';
}
async function loadModel(weights, config) {
if (S.model && S.model.isGPU) { try { S.model.dispose(); } catch (_) {} }
S.model = null;
const cfg = {
vocabSize: config.vocabSize, seqLen: config.seqLen, useRoPE: config.useRoPE,
softCap: config.softCap || 0, hiddenDim: config.hiddenDim || 64, numLayers: config.numLayers || 2
};
if (gpuUsable()) {
try {
const m = new nn.GPUChatLM({ ...cfg, maxBatch: 1 });
await m.init(); m.setWeights(weights);
S.model = m; S.activeSeq = cfg.seqLen; E.statSeq.textContent = cfg.seqLen; paintBackend(); return;
} catch (e) { log('GPU inference init failed (' + e.message + ') — CPU fallback', 'w'); }
}
const m = new nn.ChatLM(cfg); m.setWeights(weights);
S.model = m; S.activeSeq = cfg.seqLen; E.statSeq.textContent = cfg.seqLen; paintBackend();
}
/* ================= train ================= */
function prepareData() {
const req = +S.cfg.seq;
const { train } = splitInfo();
const enc = train.map(s => S.tok.encode(s + STOP)).filter(a => a.length >= 2);
if (!enc.length) return null;
const seqLen = Math.min(req, Math.max(...enc.map(a => a.length)));
if (seqLen < req) log(`Context auto-capped ${req} → ${seqLen}`, 'i');
let count = 0; for (const a of enc) count += a.length - 1;
const xs = new Int32Array(count * seqLen), ys = new Int32Array(count);
let row = 0;
for (const ids of enc) {
for (let i = 0; i < ids.length - 1; i++) {
const start = Math.max(0, i - seqLen + 1), slice = ids.slice(start, i + 1);
xs.set(slice, row * seqLen + (seqLen - slice.length));
ys[row] = ids[i + 1];
row++;
}
}
return { xs, ys, count, seqLen };
}
function startTrain() {
if (S.training) return;
if (!S.workerReady) { toast('Worker still probing', 'warn'); return; }
const d = prepareData();
if (!d) { toast('No valid segments in the corpus', 'bad'); return; }
ensureAudio();
S.trainStartSig = makeSig();
S.training = true; S.cancelSent = false; S.loss = []; S.lrs = []; S.best = Infinity; S.bestEpoch = 0;
E.chartEmpty.style.display = 'none'; E.heroTag.textContent = 'training';
E.statEpoch.textContent = '0/' + S.cfg.epochs; E.statLoss.textContent = '—'; E.statBest.textContent = '—';
setProgress(0); drawLoss(); setTrainEnabled(false);
E.btnGenerate.disabled = true; E.btnRunSuite.disabled = true;
E.badgeModel.textContent = 'training…'; E.badgeModel.className = 'badge info';
const batchSize = Math.max(1, Math.min(S.cfg.batch, d.count));
S.activeSeq = d.seqLen; E.statSeq.textContent = d.seqLen;
S.worker.postMessage({
type: 'TRAIN',
payload: {
vocabSize: S.tok.vocabSize, count: d.count, xsBuffer: d.xs, ysBuffer: d.ys, wsBuffer: null,
config: {
vocabSize: S.tok.vocabSize, lr: S.cfg.lr, useRoPE: S.cfg.rope, seqLen: d.seqLen,
epochs: S.cfg.epochs, batchSize, warmup: S.cfg.warmup, softCap: S.cfg.softCap, clip: S.cfg.clip,
hiddenDim: S.cfg.hidden, numLayers: S.cfg.layers, seed: S.cfg.seed, corpusSig: S.trainStartSig
}
}
}, [d.xs.buffer, d.ys.buffer]);
log(`Train ${S.workerBackend.toUpperCase()} · ${d.count} seqs · ctx ${d.seqLen} · batch ${batchSize} · ${S.cfg.hidden}d×${S.cfg.layers} · corpus ${S.trainStartSig.hash}`, 'i');
toast(`Training ${S.cfg.epochs} epochs on ${S.workerBackend.toUpperCase()}`, 'ok');
beep(660, .05, .05);
}
function cancelTrain() { if (S.training && S.worker) { S.cancelSent = true; S.worker.postMessage({ type: 'CANCEL' }); log('Cancel requested…', 'w'); } }
/* ================= inference ================= */
async function predict(ids) {
if (S.model.isGPU) return S.model.predictProbs(ids);
const T = S.activeSeq ?? S.model.cfg.seqLen;
const tail = ids.slice(-T), inp = new Int32Array(T);
inp.set(tail, T - tail.length);
return nn.softmaxRow(nn.noGrad(() => S.model.forward(inp, 1)).data);
}
function argmax(p) { let b = 1, v = -1; for (let i = 1; i < p.length; i++) if (p[i] > v) { v = p[i]; b = i; } return b; }
function sample(p, t) {
if (t <= 0) return argmax(p);
const sc = Array.from(p, v => Math.log(v + 1e-10) / t);
const mx = Math.max(...sc), ex = sc.map(v => Math.exp(v - mx));
const sum = ex.reduce((a, b) => a + b, 0);
let c = 0, r = Math.random();
for (let i = 0; i < ex.length; i++) { c += ex[i] / sum; if (r <= c) return i; }
return ex.length - 1;
}
async function generateFrom(promptText, greedy, maxTok, temp, halt, collect) {
let ctx = S.tok.encode(promptText);
const out = [], conf = [];
for (let i = 0; i < maxTok; i++) {
const p = await predict(ctx);
const id = greedy ? argmax(p) : sample(p, temp);
if (collect) collect.probs = p;
if (id === 0 || (halt && id === S.tok.stopId)) break;
out.push(id); ctx.push(id); conf.push(p[id] || 0);
if ((i & 3) === 0) await new Promise(r => setTimeout(r, 0));
}
const tokens = S.tok.decodeIds(out);
return { ids: out, conf, tokens, text: restoreSpacing(tokens) };
}
function renderStrip(probs) {
const idx = Array.from(probs, (p, i) => [p, i]).sort((a, b) => b[0] - a[0]).slice(0, +E.topKC.value);
const mx = idx[0] ? idx[0][0] : 1;
E.probStrip.innerHTML = idx.map(([p, i]) => {
const t = p / (mx || 1), hue = 265 - 200 * t;
const label = i === 0 ? '<unk>' : (S.tok.vocabulary[i - 1] || '#' + i);
return `<div class="cell" title="${esc(label)} — ${(p * 100).toFixed(2)}%" style="background:linear-gradient(180deg,hsl(${hue} 95% ${18 + 46 * t}%),hsl(${hue - 30} 90% ${8 + 26 * t}%))"></div>`;
}).join('');
}
async function runInspect() {
if (!S.model) { toast('Train a model first', 'warn'); return; }
if (!modelMatches()) { toast('Model was trained on a different corpus — retrain', 'bad'); return; }
E.btnGenerate.disabled = true; E.inspTag.textContent = 'decoding…';
const collect = {};
try {
const res = await generateFrom(E.prompt.value, E.sampleMode.value === 'greedy', +E.maxTokC.value, +E.tempC.value, E.stopOnStop.checked, collect);
S.conf = res.conf; drawConf();
if (collect.probs) renderStrip(collect.probs);
E.inspGot.value = res.text;
E.inspTag.textContent = `${res.ids.length} tokens`;
S.lastResult = res;
E.btnCopyResult.disabled = false;
log(`Generated ${res.ids.length} tokens`, 's');
} catch (e) { toast('Generation failed: ' + e.message, 'bad'); log('Generation failed: ' + e.message, 'e'); }
E.btnGenerate.disabled = !modelMatches();
}

/* ================= next-word step-by-step ================= */
function renderStepList(probs) {
  if (!probs) { E.stepList.innerHTML = '<div style="color:var(--slate2);padding:12px">No predictions yet.</div>'; return; }
  const K = 15;
  const indexed = Array.from(probs, (p, i) => [p, i]).sort((a, b) => b[0] - a[0]).slice(0, K);
  const maxP = indexed[0] ? indexed[0][0] : 1;
  
  let html = '';
  for (const [p, i] of indexed) {
    if (p < 0.001 && i !== indexed[0][1]) continue;
    const pct = (p * 100).toFixed(2);
    const token = i === 0 ? '<unk>' : (S.tok.vocabulary[i - 1] || `#${i}`);
    const displayToken = token === STOP ? '<|stop|>' : token;
    const hue = 265 - 200 * (p / maxP);
    html += `<div class="bar">
      <span style="color:var(--bone);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(displayToken)}">${esc(displayToken)}</span>
      <span class="tr"><i class="fi" style="width:${(p / maxP * 100).toFixed(1)}%;background:linear-gradient(90deg,hsl(${hue} 95% 55%),hsl(${hue - 30} 90% 35%))"></i></span>
      <span class="pc" style="color:var(--cyan)">${pct}%</span>
    </div>`;
  }
  E.stepList.innerHTML = html || '<div style="color:var(--slate2);padding:12px">No tokens predicted.</div>';
}

async function updateStep() {
  if (!S.model || !modelMatches()) {
    E.stepCtx.value = 'Train a model first';
    renderStepList(null);
    E.btnStepAccept.disabled = true;
    E.btnStepPredict.disabled = true;
    return;
  }
  
  const ctxText = S.tok.decode(stepIds);
  E.stepCtx.value = ctxText || '(empty context)';
  
  E.btnStepPredict.disabled = true;
  E.btnStepAccept.disabled = true;
  
  try {
    stepProbs = await predict(stepIds);
    renderStepList(stepProbs);
    E.btnStepPredict.disabled = false;
    E.btnStepAccept.disabled = false;
  } catch (e) {
    renderStepList(null);
    log('Step predict failed: ' + e.message, 'e');
  }
}

function resetStep() {
  if (!S.tok) return;
  stepIds = S.tok.encode(E.prompt.value);
  stepProbs = null;
  updateStep();
}

function acceptTop1Step() {
  if (!stepProbs) return;
  let bestId = 0, bestP = -1;
  for (let i = 0; i < stepProbs.length; i++) {
    if (stepProbs[i] > bestP) { bestP = stepProbs[i]; bestId = i; }
  }
  if (bestId === 0 || bestId === S.tok.stopId) {
    toast('Top-1 is <unk> or <|stop|> — sequence ended', 'warn');
    return;
  }
  stepIds.push(bestId);
  updateStep();
}

/* ================= generalization suite ================= */
function updateSuiteAvail() {
const { train, held } = splitInfo();
const n = (E.suiteSet.value === 'train' ? train : held).length;
E.suiteAvail.textContent = `${n} available`;
E.suiteCount.max = Math.max(4, Math.min(120, n || 4));
if (+E.suiteCount.value > +E.suiteCount.max) E.suiteCount.value = E.suiteCount.max;
E.suiteCountV.textContent = E.suiteCount.value;
}
function renderSuiteAgg(agg) {
const rows = [
['exact match', agg ? agg.exact / agg.n : 0, 'linear-gradient(90deg,#a3e635,#22d3ee)'],
['token accuracy', agg ? agg.tokOk / Math.max(1, agg.tokTotal) : 0, 'linear-gradient(90deg,#7c5cff,#ff3df0)']
];
E.suiteAgg.innerHTML = rows.map(([k, v, g]) =>
`<div class="bar"><span style="color:var(--slate)">${k}</span><span class="tr"><i class="fi" style="width:${(v * 100).toFixed(1)}%;background:${g}"></i></span><span class="pc">${agg ? (v * 100).toFixed(0) + '%' : '—'}</span></div>`).join('');
}
function diffWords(A, B) {
const n = A.length, m = B.length;
const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
const out = []; let i = 0, j = 0;
while (i < n && j < m) {
if (A[i] === B[j]) { out.push(['eq', A[i]]); i++; j++; }
else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['del', A[i]]); i++; }
else { out.push(['ins', B[j]]); j++; }
}
while (i < n) out.push(['del', A[i++]]);
while (j < m) out.push(['ins', B[j++]]);
return out;
}
const diffHTML = ops => ops.map(([k, w]) => `<span class="${k}">${esc(w)}</span>`).join(' ');
async function runSuite() {
if (!S.model) { toast('Train a model first', 'warn'); return; }
if (!modelMatches()) { toast('Model was trained on a different corpus — retrain', 'bad'); return; }
const set = E.suiteSet.value;
const { train, held } = splitInfo();
let pool = (set === 'train' ? train : held).slice();
if (!pool.length) { toast(`No ${set} segments available`, 'warn'); return; }
const rnd = mulberry(0x5EED);
for (let i = pool.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
const n = Math.min(pool.length, +E.suiteCount.value), sampleSegs = pool.slice(0, n);
S.suite.running = true; S.suite.stop = false; S.suite.rows = [];
E.btnRunSuite.disabled = true; E.btnStopSuite.disabled = false; E.btnGenerate.disabled = true;
E.suiteTag.textContent = `running 0/${n}`; E.suiteDetail.style.display = 'none'; E.suiteBody.innerHTML = '';
const agg = { n, exact: 0, tokOk: 0, tokTotal: 0 };
ensureAudio();
for (let k = 0; k < n; k++) {
if (S.suite.stop) break;
const seg = sampleSegs[k];
const ids = S.tok.encode(seg);
const half = Math.max(1, Math.ceil(ids.length / 2));
const promptIds = ids.slice(0, half), target = ids.slice(half);
if (!target.length) continue;
let ctx = promptIds.slice(); const got = [];
try {
for (let i = 0; i < target.length; i++) {
const p = await predict(ctx);
const id = argmax(p);
if (id === 0 || id === S.tok.stopId) break;
got.push(id); ctx.push(id);
if ((i & 3) === 0) await new Promise(r => setTimeout(r, 0));
}
} catch (e) { log('Suite failed: ' + e.message, 'e'); break; }
let ok = 0; for (let i = 0; i < target.length; i++) if (got[i] === target[i]) ok++;
agg.tokOk += ok; agg.tokTotal += target.length;
const exact = got.length === target.length && ok === target.length;
agg.exact += exact ? 1 : 0;
S.suite.rows.push({ seg, got, target, ok, exact });
const targetToks = S.tok.decodeIds(target), gotToks = S.tok.decodeIds(got);
const tr = document.createElement('tr');
tr.style.cursor = 'pointer';
tr.innerHTML = `<td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(seg)}">${esc(seg)}</td>
<td><span class="badge ${set === 'heldout' ? 'warn' : 'info'}" style="font-size:9.5px">${set === 'heldout' ? 'held' : 'train'}</span></td>
<td>${ok}/${target.length}</td>
<td>${exact ? '<span class="badge ok" style="font-size:9.5px">exact</span>' : '<span class="badge bad" style="font-size:9.5px">miss</span>'}</td>`;
tr.addEventListener('click', () => {
E.suiteDetail.style.display = 'block';
E.suiteDetail.innerHTML = `<div style="color:var(--slate);font-size:11px;margin-bottom:6px">continuation — expected → got</div>` +
diffHTML(diffWords(targetToks, gotToks));
});
E.suiteBody.appendChild(tr);
const sc = E.suiteBody.closest('.scroll'); if (sc) sc.scrollTop = sc.scrollHeight;
E.suiteProg.style.width = ((k + 1) / n * 100) + '%';
E.suiteTag.textContent = `running ${k + 1}/${n}`;
renderSuiteAgg({ ...agg, n: k + 1 });
E.suiteExact.textContent = `exact ${agg.exact}/${k + 1}`; E.suiteExact.className = 'badge ' + (agg.exact === k + 1 ? 'ok' : 'warn');
const acc = agg.tokTotal ? agg.tokOk / agg.tokTotal : 0;
E.suiteTok.textContent = `token acc ${(acc * 100).toFixed(0)}%`; E.suiteTok.className = 'badge ' + (acc > .9 ? 'ok' : acc > .6 ? 'info' : 'bad');
}
const done = S.suite.rows.length, pct = done ? Math.round(agg.exact / done * 100) : 0;
renderSuiteAgg(done ? { ...agg, n: done } : null);
E.suiteTag.textContent = S.suite.stop ? `stopped at ${done}` : `${done} segments · ${pct}% exact`;
E.suiteNote.textContent = !done ? 'Test stopped before any segment completed.'
: pct === 100 ? `Continuation holds on all ${done} ${set} segments.`
: `${agg.exact}/${done} exact · token accuracy ${agg.tokTotal ? Math.round(agg.tokOk / agg.tokTotal * 100) : 0}%.`;
log(`Suite ${set}: ${agg.exact}/${done} exact · token acc ${agg.tokTotal ? Math.round(agg.tokOk / agg.tokTotal * 100) : 0}%`, pct === 100 ? 's' : 'w');
toast(`Suite: ${agg.exact}/${done} exact (${pct}%)`, pct === 100 ? 'ok' : 'warn'); chord(pct === 100);
S.suite.running = false;
E.btnRunSuite.disabled = !modelMatches(); E.btnStopSuite.disabled = true;
E.btnGenerate.disabled = !modelMatches();
}
/* ================= charts ================= */
function fitCanvas(cv) {
const dpr = Math.min(2, window.devicePixelRatio || 1);
const r = cv.getBoundingClientRect();
const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
return { ctx, w, h };
}
function drawLoss() {
const { ctx, w, h } = fitCanvas(E.lossCanvas);
ctx.clearRect(0, 0, w, h);
const L = S.loss;
E.chartEmpty.style.display = L.length ? 'none' : 'grid';
if (!L.length) return;
const pad = { l: 44, r: 44, t: 14, b: 22 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
const logScale = E.chartLog.checked;
const lo = logScale ? Math.max(1e-3, Math.min(...L) * .8) : 0, hi = Math.max(...L) * 1.06;
const yOf = v => logScale
? pad.t + ih - (Math.log(Math.max(v, 1e-4)) - Math.log(lo)) / ((Math.log(hi) - Math.log(lo)) || 1) * ih
: pad.t + ih - (v - lo) / ((hi - lo) || 1) * ih;
const xOf = i => pad.l + (L.length === 1 ? iw / 2 : i / (L.length - 1) * iw);
ctx.fillStyle = 'rgba(255,59,92,.09)';
const yDiv = yOf(Math.min(hi, L[0] * 1.5));
if (yDiv > pad.t) ctx.fillRect(pad.l, pad.t, iw, Math.max(0, yDiv - pad.t));
ctx.strokeStyle = 'rgba(51,33,112,.75)'; ctx.lineWidth = 1;
ctx.font = '10px JetBrains Mono, monospace'; ctx.fillStyle = '#6f639c';
for (let g = 0; g <= 4; g++) {
const v = logScale ? Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * g / 4) : lo + (hi - lo) * g / 4;
const y = yOf(v);
ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
ctx.textAlign = 'right'; ctx.fillText(v.toFixed(v < 1 ? 3 : 2), pad.l - 6, y + 3);
}
if (S.lrs.some(v => v > 0)) {
const lmax = Math.max(...S.lrs);
ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]); ctx.beginPath();
S.lrs.forEach((v, i) => { const y = pad.t + ih - (v / (lmax || 1)) * ih * .92; i ? ctx.lineTo(xOf(i), y) : ctx.moveTo(xOf(i), y); });
ctx.stroke(); ctx.setLineDash([]);
ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'left';
ctx.fillText(lmax.toFixed(4), w - pad.r + 5, pad.t + 10); ctx.fillText('lr', w - pad.r + 5, pad.t + 24);
}
ctx.strokeStyle = '#7c5cff'; ctx.lineWidth = 1.9; ctx.beginPath();
L.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
ctx.stroke();
const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
grad.addColorStop(0, 'rgba(124,92,255,.34)'); grad.addColorStop(1, 'rgba(124,92,255,0)');
ctx.lineTo(xOf(L.length - 1), pad.t + ih); ctx.lineTo(xOf(0), pad.t + ih); ctx.closePath();
ctx.fillStyle = grad; ctx.fill();
let ema = L[0]; const E9 = [];
for (const v of L) { ema = ema * .9 + v * .1; E9.push(ema); }
ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2.2; ctx.beginPath();
E9.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
ctx.stroke();
const bi = L.indexOf(Math.min(...L));
ctx.fillStyle = '#a3e635'; ctx.beginPath(); ctx.arc(xOf(bi), yOf(L[bi]), 4, 0, 7); ctx.fill();
ctx.textAlign = bi > L.length * .7 ? 'right' : 'left';
ctx.fillText(`best ${L[bi].toFixed(3)}`, xOf(bi) + (bi > L.length * .7 ? -8 : 8), yOf(L[bi]) - 8);
ctx.textAlign = 'right'; ctx.fillStyle = '#22d3ee';
ctx.fillText(E9[E9.length - 1].toFixed(3), w - pad.r - 4, yOf(E9[E9.length - 1]) - 6);
ctx.fillStyle = '#6f639c'; ctx.textAlign = 'center';
ctx.fillText('epoch 1', pad.l + 16, h - 6); ctx.fillText('epoch ' + L.length, w - pad.r - 20, h - 6);
}
function updateLossStats() {
const L = S.loss; if (!L.length) return;
E.mInit.textContent = L[0].toFixed(4); E.mFinal.textContent = L[L.length - 1].toFixed(4);
const drop = (1 - L[L.length - 1] / L[0]) * 100;
E.mDrop.textContent = (drop >= 0 ? '−' : '+') + Math.abs(drop).toFixed(1) + '%';
E.mDrop.style.color = drop > 60 ? 'var(--lime)' : drop > 20 ? 'var(--amber)' : 'var(--red)';
}
function drawConf() {
const { ctx, w, h } = fitCanvas(E.confCanvas);
ctx.clearRect(0, 0, w, h);
if (!S.conf.length) {
ctx.fillStyle = '#6f639c'; ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'center';
ctx.fillText('confidence appears after a generation', w / 2, h / 2 + 4); return;
}
const bw = w / S.conf.length;
S.conf.forEach((p, i) => {
const bh = Math.max(2, p * (h - 8)), hue = 90 * p + 340 * (1 - p);
const g = ctx.createLinearGradient(0, h - bh, 0, h);
g.addColorStop(0, `hsl(${hue} 92% 62%)`); g.addColorStop(1, `hsl(${hue - 20} 88% 30%)`);
ctx.fillStyle = g; ctx.fillRect(i * bw + 1, h - bh - 2, Math.max(1, bw - 2), bh);
});
ctx.strokeStyle = 'rgba(163,230,53,.5)'; ctx.setLineDash([3, 3]); ctx.beginPath();
ctx.moveTo(0, h - .9 * (h - 8) - 2); ctx.lineTo(w, h - .9 * (h - 8) - 2); ctx.stroke(); ctx.setLineDash([]);
}
/* ================= parity / io ================= */
async function verifyGpuEngine() {
const cfg = { vocabSize: 15, seqLen: 8, useRoPE: true, softCap: 10, hiddenDim: 64, numLayers: 2 };
nn.manualSeed(7);
const cpu = new nn.ChatLM(cfg);
let gpu = null;
try {
gpu = new nn.GPUChatLM({ ...cfg, maxBatch: 4 });
await gpu.init(); gpu.setWeights(cpu.getWeights());
const B = 4, T = 8, V = 16, rnd = mulberry(123);
const xs = new Int32Array(B * T), ys = new Int32Array(B), ws = new Float32Array(B);
for (let b = 0; b < B; b++) {
const pad = b % 3;
for (let t = 0; t < T; t++) xs[b * T + t] = t < pad ? 0 : 1 + ((rnd() * (V - 1)) | 0);
ys[b] = 1 + ((rnd() * (V - 1)) | 0); ws[b] = b < 2 ? 1 : 0;
}
const lossT = nn.sparseCE(cpu.forward(xs, B), ys, ws);
nn.backward(lossT);
const ps = cpu.parameters(), cpuFlat = new Float32Array(gpu.paramCount);
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
let maxAbs = 0, maxRel = 0, nz = 0;
for (let i = 0; i < cpuFlat.length; i++) {
const a = cpuFlat[i], b = gpuFlat[i], d = Math.abs(a - b);
if (Math.abs(a) > 1e-8) nz++;
if (d > maxAbs) maxAbs = d;
const r = d / Math.max(1e-6, Math.abs(a) + Math.abs(b));
if (r > maxRel) maxRel = r;
}
const lossDiff = Math.abs(gpuLoss - lossT.data[0]);
return { ok: lossDiff < 1e-2 && maxRel < 1e-2, cpuLoss: lossT.data[0], gpuLoss, lossDiff, maxAbs, maxRel, nz, total: cpuFlat.length };
} finally { nn.clearTape(); if (gpu) { try { gpu.dispose(); } catch (_) {} } }
}
function renderParityReport(r) {
if (!r) { E.parityOut.textContent = 'Not run.'; return; }
if (r.error) { E.parityOut.innerHTML = `<span style="color:var(--red)">Verification error: ${esc(r.error)}</span><br><span style="color:var(--slate)">Inference locked to CPU.</span>`; return; }
E.parityOut.innerHTML =
`<div style="color:${r.ok ? 'var(--lime)' : 'var(--red)'};font-weight:700;margin-bottom:6px">${r.ok ? '✓ PARITY CONFIRMED' : '✗ MISMATCH — GPU DISABLED'}</div>` +
`loss CPU <b>${r.cpuLoss.toFixed(6)}</b> · GPU <b>${r.gpuLoss.toFixed(6)}</b><br>` +
`grad maxAbs <b>${r.maxAbs.toExponential(3)}</b> · maxRel <b>${r.maxRel.toExponential(3)}</b><br>` +
`nonzero grads <b>${r.nz}</b> / ${r.total}<br>` +
`<span style="color:var(--slate)">${r.ok ? 'GPU forward and gradients match the CPU reference.' : 'This device produces wrong GPU results. Training and inference use the verified CPU engine.'}</span>`;
}
async function runParity() {
if (!S.gpu) { E.parityOut.innerHTML = '<span style="color:var(--amber)">WebGPU unavailable — nothing to verify.</span>'; return; }
E.btnParity.disabled = true; E.parityOut.textContent = 'Running identical batch on both engines…';
try { S.gpuReport = await verifyGpuEngine(); S.gpuVerified = !!S.gpuReport.ok; }
catch (e) { S.gpuReport = { ok: false, error: e.message || String(e) }; S.gpuVerified = false; }
renderParityReport(S.gpuReport); paintBackend(); renderFacts(); renderProvenance();
log(`Gradient parity: ${S.gpuVerified ? 'PASS' : 'FAIL'} — GPU inference ${S.gpuVerified ? 'enabled' : 'disabled'}`, S.gpuVerified ? 's' : 'e');
toast(S.gpuVerified ? 'GPU parity confirmed' : 'GPU parity failed — CPU locked', S.gpuVerified ? 'ok' : 'bad');
if (S.model && S.model.isGPU && !S.gpuVerified) {
log('Live model sits on a failing GPU path — retrain to move it to CPU', 'w');
E.btnGenerate.disabled = true; E.btnRunSuite.disabled = true;
E.badgeModel.textContent = 'retrain (GPU untrusted)'; E.badgeModel.className = 'badge bad';
}
E.btnParity.disabled = false;
}
async function exportModel() {
if (!S.model) return;
try {
const weights = S.model.isGPU ? await S.model.getWeights() : S.model.getWeights();
const json = nn.packJSON(S.model.cfg, weights, {
vocab: S.tok.vocabulary, corpusSig: S.modelSig, lab: 'tensor-lab'
});
const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob); a.download = 'tensor-lab.nn.json'; a.click();
setTimeout(() => URL.revokeObjectURL(a.href), 5000);
toast('Model + provenance exported', 'ok');
} catch (e) { toast('Export failed: ' + e.message, 'bad'); }
}
async function importModel(file) {
try {
const obj = JSON.parse(await file.text());
if (obj.format && obj.format !== 'nnjs-chatlm-v3') throw new Error('unsupported format ' + obj.format);
const weights = obj.weights.map(w => ({ shape: w.shape, data: Float32Array.from(w.data) }));
await loadModel(weights, obj.config);
S.modelSig = (obj.meta && obj.meta.corpusSig) || obj.config.corpusSig || null;
S.modelMeta = { hiddenDim: obj.config.hiddenDim || 64, numLayers: obj.config.numLayers || 2, seqLen: obj.config.seqLen };
guardModel();
log(`Model imported · corpus ${S.modelSig ? S.modelSig.hash : 'unknown'}`, 's');
if (modelMatches()) {
  toast('Model imported and bound to this corpus', 'ok');
  resetStep();
} else {
  toast('Model imported — corpus mismatch, grading blocked until retrain', 'warn');
}
} catch (e) { toast('Import failed: ' + e.message, 'bad'); }
}
function renderFacts() {
const isGPU = !!S.model?.isGPU;
const pc = S.model ? (isGPU ? S.model.paramCount : S.model.parameters().reduce((a, p) => a + p.size, 0)) : 0;
E.statParams.textContent = pc ? (pc >= 1000 ? (pc / 1000).toFixed(1) + 'k' : pc) : '—';
const mem = isGPU ? S.model.memoryInfo() : null;
const parity = !S.gpu ? 'no webgpu' : S.gpuReport ? (S.gpuReport.ok ? 'PASS' : 'FAIL') : 'pending';
E.engineFacts.innerHTML = [
['gpu parity', parity],
['inference', isGPU ? 'WebGPU fused' : (S.model ? 'CPU (verified)' : '—')],
['weights', pc ? (pc * 4 / 1024).toFixed(1) + ' KB' : '—'],
['gpu buffers', mem ? (mem.numBytes / 1048576).toFixed(1) + ' MB' : '—'],
['worker', S.worker ? (S.workerReady ? 'ready' : 'probing') : 'absent']
].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
}
function paintBackend() {
const gpuW = S.workerBackend === 'webgpu';
E.pillWorker.innerHTML = `TRAIN <b>${S.workerBackend.toUpperCase()}</b>`;
E.pillWorker.className = 'pill ' + (gpuW ? 'gpu' : 'cpu');
const runGpu = S.model ? S.model.isGPU : gpuUsable();
E.pillRun.innerHTML = `RUN <b>${S.model ? (S.model.isGPU ? 'WEBGPU' : 'CPU') : (gpuUsable() ? 'WEBGPU*' : 'CPU')}</b>`;
E.pillRun.className = 'pill ' + (runGpu ? 'gpu' : 'cpu');
E.badgeBackend.textContent = (gpuW ? '⚡ ' : '🧠 ') + S.workerBackend + (S.gpu && !S.gpuVerified ? ' · gpu untrusted' : '');
E.badgeBackend.className = 'badge ' + (gpuW ? 'info' : 'warn');
}
/* ================= controls ================= */
function loadCfg() {
try { const raw = localStorage.getItem('tensorlab.cfg'); if (raw) Object.assign(S.cfg, JSON.parse(raw)); } catch (_) {}
S.cfg.epochs = clamp(+S.cfg.epochs || 300, 20, 800);
S.cfg.hidden = [32, 64, 96, 128].includes(+S.cfg.hidden) ? +S.cfg.hidden : 64;
S.cfg.layers = clamp(+S.cfg.layers || 2, 1, 4);
S.cfg.seed = +S.cfg.seed || 1337;
}
function saveCfg() { try { localStorage.setItem('tensorlab.cfg', JSON.stringify(S.cfg)); } catch (_) {} }
function pushCfgToUI() {
E.cEpochs.value = S.cfg.epochs; E.cEpochsV.textContent = S.cfg.epochs;
E.cLR.value = String(S.cfg.lr);
E.cWarmup.value = S.cfg.warmup; E.cWarmupV.textContent = S.cfg.warmup;
E.cClip.value = S.cfg.clip; E.cClipV.textContent = (+S.cfg.clip).toFixed(1);
E.cSoftCap.value = S.cfg.softCap; E.cSoftCapV.textContent = S.cfg.softCap;
E.cBatch.value = String(S.cfg.batch); E.cSeq.value = String(S.cfg.seq);
E.cHidden.value = String(S.cfg.hidden); E.cLayersV.textContent = S.cfg.layers;
E.cSeedV.textContent = S.cfg.seed; E.cRoPE.checked = !!S.cfg.rope;
}
function bindControls() {
pushCfgToUI();
const bindRange = (el, out, key, fmt) => {
const upd = () => { S.cfg[key] = +el.value; out.textContent = fmt ? fmt(+el.value) : el.value; saveCfg(); };
el.addEventListener('input', upd); upd();
};
bindRange(E.cEpochs, E.cEpochsV, 'epochs');
bindRange(E.cWarmup, E.cWarmupV, 'warmup');
bindRange(E.cClip, E.cClipV, 'clip', v => v.toFixed(1));
bindRange(E.cSoftCap, E.cSoftCapV, 'softCap');
E.cLR.addEventListener('change', () => { S.cfg.lr = +E.cLR.value; saveCfg(); });
E.cBatch.addEventListener('change', () => { S.cfg.batch = +E.cBatch.value; saveCfg(); });
E.cSeq.addEventListener('change', () => { S.cfg.seq = +E.cSeq.value; saveCfg(); });
E.cHidden.addEventListener('change', () => { S.cfg.hidden = +E.cHidden.value; saveCfg(); });
E.cRoPE.addEventListener('change', () => { S.cfg.rope = E.cRoPE.checked; saveCfg(); });
E.seedMinus.addEventListener('click', () => { S.cfg.seed = Math.max(1, S.cfg.seed - 1); E.cSeedV.textContent = S.cfg.seed; saveCfg(); });
E.seedPlus.addEventListener('click', () => { S.cfg.seed++; E.cSeedV.textContent = S.cfg.seed; saveCfg(); });
E.layMinus.addEventListener('click', () => { S.cfg.layers = clamp(S.cfg.layers - 1, 1, 4); E.cLayersV.textContent = S.cfg.layers; saveCfg(); });
E.layPlus.addEventListener('click', () => { S.cfg.layers = clamp(S.cfg.layers + 1, 1, 4); E.cLayersV.textContent = S.cfg.layers; saveCfg(); });
E.btnRandomize.addEventListener('click', () => {
const r = Math.random;
S.cfg.lr = [0.0005, 0.001, 0.002][(r() * 3) | 0];
S.cfg.warmup = 4 + ((r() * 16) | 0);
S.cfg.softCap = [0, 8, 10, 16][(r() * 4) | 0];
S.cfg.clip = +(0.5 + r() * 1.5).toFixed(1);
S.cfg.hidden = [32, 64, 96][(r() * 3) | 0];
S.cfg.layers = 1 + ((r() * 3) | 0);
S.cfg.seed = 1 + ((r() * 9999) | 0);
pushCfgToUI(); saveCfg(); toast('Hyperparameters randomized', 'ok');
});
E.btnResetCfg.addEventListener('click', () => { S.cfg = { ...DEFAULT_CFG }; pushCfgToUI(); saveCfg(); toast('Defaults restored', 'ok'); });
E.reserveC.addEventListener('input', () => { E.reserveV.textContent = E.reserveC.value; refreshCorpusStats(); });
/* ---- Make Vocab ---- */
const doMakeVocab = async () => {
const len = E.corpus.value.length;
if (!E.corpus.value.trim()) {
log(`Make Vocab: textarea is genuinely empty (length ${len})`, 'w');
toast('Corpus box is empty — paste your data first', 'warn');
return;
}
await rebuildTokenizer();
const nSeg = segments().length;
log(`Make Vocab: read ${len} chars → ${S.tok.vocabSize} vocab tokens · ${nSeg} segments`, 's');
toast(`Vocab: ${S.tok.vocabSize} tokens · ${nSeg} segments`, 'ok');
setTrainEnabled(!S.training);
};
E.btnMakeVocab.addEventListener('click', doMakeVocab);
E.btnUndoCorpus.addEventListener('click', undoCorpus);
let ct;
const onCorpusEdit = () => { clearTimeout(ct); ct = setTimeout(rebuildTokenizer, 300); };
E.corpus.addEventListener('input', onCorpusEdit);
E.corpus.addEventListener('change', onCorpusEdit);
E.corpus.addEventListener('paste', () => setTimeout(rebuildTokenizer, 60));
E.corpus.addEventListener('blur', () => rebuildTokenizer());
[E.btnTrain, E.navTrain, E.btnRetrainNow].forEach(b => b.addEventListener('click', startTrain));
[E.btnCancel, E.navCancel].forEach(b => b.addEventListener('click', cancelTrain));
E.btnShowDiff.addEventListener('click', () => E.mismatchDetails.classList.toggle('show'));
E.chartLog.addEventListener('change', drawLoss);
E.tempC.addEventListener('input', () => { E.tempV.textContent = (+E.tempC.value).toFixed(2); if (+E.tempC.value > 0) E.sampleMode.value = 'temp'; });
E.maxTokC.addEventListener('input', () => E.maxTokV.textContent = E.maxTokC.value);
E.sampleMode.addEventListener('change', () => {
if (E.sampleMode.value === 'greedy') { E.tempC.value = 0; E.tempV.textContent = '0.00'; }
else if (+E.tempC.value === 0) { E.tempC.value = 0.8; E.tempV.textContent = '0.80'; }
});
E.btnGenerate.addEventListener('click', runInspect);

E.btnStepAccept.addEventListener('click', acceptTop1Step);
E.btnStepPredict.addEventListener('click', updateStep);
E.btnStepReset.addEventListener('click', resetStep);

E.btnCopyResult.addEventListener('click', async () => {
if (!S.lastResult) return;
const txt = `prompt: ${E.prompt.value}
output: ${S.lastResult.text}
model corpus: ${S.modelSig ? S.modelSig.hash : '—'}
current corpus: ${S.corpusSig ? S.corpusSig.hash : '—'}`;
try { await navigator.clipboard.writeText(txt); toast('Result copied', 'ok'); } catch (_) { toast('Clipboard unavailable', 'warn'); }
});
E.btnQuickInspect.addEventListener('click', () => {
document.getElementById('inspect').scrollIntoView({ behavior: 'smooth' });
if (modelMatches()) runInspect(); else toast(S.model ? 'Retrain on this corpus first' : 'Train a model first', 'warn');
});
E.btnQuickSuite.addEventListener('click', () => {
document.getElementById('suite').scrollIntoView({ behavior: 'smooth' });
if (modelMatches()) runSuite(); else toast(S.model ? 'Retrain on this corpus first' : 'Train a model first', 'warn');
});
E.suiteSet.addEventListener('change', updateSuiteAvail);
E.suiteCount.addEventListener('input', () => E.suiteCountV.textContent = E.suiteCount.value);
E.btnRunSuite.addEventListener('click', runSuite);
E.btnStopSuite.addEventListener('click', () => { S.suite.stop = true; E.btnStopSuite.disabled = true; });
E.btnParity.addEventListener('click', runParity);
E.btnExport.addEventListener('click', exportModel);
E.btnImport.addEventListener('click', () => E.fileImport.click());
E.fileImport.addEventListener('change', () => { const f = E.fileImport.files[0]; if (f) importModel(f); E.fileImport.value = ''; });
E.densitySel.addEventListener('change', () => document.body.classList.toggle('compact', E.densitySel.value === 'compact'));
E.reduceMotion.addEventListener('change', () => document.body.classList.toggle('reduce', E.reduceMotion.checked));
E.soundOn.addEventListener('change', () => { S.sound = E.soundOn.checked; syncMute(); if (S.sound) { ensureAudio(); beep(720, .05, .05); } });
E.muteBtn.addEventListener('click', () => { S.sound = !S.sound; E.soundOn.checked = S.sound; syncMute(); if (S.sound) { ensureAudio(); beep(720, .05, .05); } });
E.btnCopyLog.addEventListener('click', async () => {
try { await navigator.clipboard.writeText(E.runLog.innerText); toast('Logs copied to clipboard', 'ok'); }
catch (_) { toast('Clipboard unavailable', 'warn'); }
});
syncMute();
window.addEventListener('resize', () => { drawLoss(); drawConf(); });
document.addEventListener('keydown', e => {
if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && document.activeElement === E.prompt) { e.preventDefault(); if (!E.btnGenerate.disabled) runInspect(); }
return;
}
const k = e.key.toLowerCase();
if (k === 't' && !E.btnTrain.disabled) startTrain();
else if (k === 'g' && !E.btnGenerate.disabled) runInspect();
else if (k === 's' && !E.btnRunSuite.disabled) runSuite();
else if (e.key === 'Escape') { cancelTrain(); S.suite.stop = true; }
});
window.addEventListener('beforeunload', () => {
if (S.worker) { S.worker.postMessage({ type: 'CANCEL' }); S.worker.terminate(); }
if (S.model?.isGPU) { try { S.model.dispose(); } catch (_) {} }
});
}
function undoCorpus() {
if (S.undoCorpus == null) return;
E.corpus.value = S.undoCorpus; S.undoCorpus = null; E.btnUndoCorpus.disabled = true;
rebuildTokenizer(); toast('Corpus restored', 'ok');
}
/* ================= nav / reveal / toast / log / audio ================= */
function bindNav() {
const links = [...document.querySelectorAll('.navlinks a')];
const secs = links.map(a => document.getElementById(a.dataset.sec)).filter(Boolean);
secs.forEach(s => {
new IntersectionObserver(ents => {
ents.forEach(en => { if (en.isIntersecting) links.forEach(l => l.classList.toggle('on', l.dataset.sec === en.target.id)); });
}, { rootMargin: '-120px 0px -65% 0px', threshold: 0 }).observe(s);
});
}
function bindReveal() {
const els = [...document.querySelectorAll('.reveal')];
if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
const io = new IntersectionObserver((ents, obs) => {
ents.forEach((en, i) => { if (en.isIntersecting) { setTimeout(() => en.target.classList.add('in'), i * 70); obs.unobserve(en.target); } });
}, { threshold: .08 });
els.forEach(e => io.observe(e));
}
function toast(msg, kind = 'ok', actionLabel, action) {
const el = document.createElement('div');
el.className = 'toast ' + kind;
el.innerHTML = `<span>${esc(msg)}</span>`;
if (actionLabel && action) {
const b = document.createElement('button'); b.textContent = actionLabel;
b.addEventListener('click', () => { action(); el.remove(); }); el.appendChild(b);
}
E.toastHost.appendChild(el);
setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; setTimeout(() => el.remove(), 320); }, actionLabel ? 7000 : 4200);
}
function log(msg, kind = '') {
if (!E.runLog) return;
const t = new Date().toLocaleTimeString();
const cls = { e: 'e', w: 'w', s: 's', i: 'i' }[kind] || '';
const pre = { e: '✗', w: '⚠', s: '✓', i: '›' }[kind] || '·';
E.runLog.innerHTML += `<span class="t">${t}</span> <span class="${cls}">${pre} ${esc(msg)}</span>
`;
E.runLog.scrollTop = E.runLog.scrollHeight;
}
/* ---- on-screen console capture (iOS Safari) ---- */
function safeStringify(a) {
if (a instanceof Error) return a.message;
try { return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a); }
catch (_) { return String(a); }
}
const _origLog = console.log, _origWarn = console.warn, _origError = console.error;
console.log = function (...args) { _origLog.apply(console, args); log(args.map(safeStringify).join(' '), 'i'); };
console.warn = function (...args) { _origWarn.apply(console, args); log(args.map(safeStringify).join(' '), 'w'); };
console.error = function (...args) { _origError.apply(console, args); log(args.map(safeStringify).join(' '), 'e'); };
window.addEventListener('error', e => log('Uncaught: ' + (e.message || e.error), 'e'));
window.addEventListener('unhandledrejection', e => log('Unhandled promise: ' + safeStringify(e.reason), 'e'));
/* ------------------------------------------------ */
function ensureAudio() {
if (!S.sound) return null;
if (!S.audio) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; try { S.audio = new AC(); } catch (_) { return null; } }
if (S.audio.state === 'suspended') S.audio.resume().catch(() => {});
return S.audio;
}
function beep(freq, dur = .06, gain = .05, type = 'sine') {
const ac = ensureAudio(); if (!ac || !S.sound) return;
const o = ac.createOscillator(), g = ac.createGain();
o.type = type; o.frequency.value = freq;
g.gain.setValueAtTime(0, ac.currentTime);
g.gain.linearRampToValueAtTime(gain, ac.currentTime + .008);
g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + dur);
o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur + .02);
}
function beepForLoss(loss) { if (S.sound) beep(200 + (1 - clamp(loss / 5, 0, 1)) * 700, .07, .035, 'triangle'); }
function chord(good) {
if (!S.sound) return;
(good ? [523, 659, 784, 1047] : [220, 185, 147]).forEach((f, i) => setTimeout(() => beep(f, .2, .045, good ? 'sine' : 'sawtooth'), i * 85));
}
function syncMute() {
E.muteBtn.textContent = S.sound ? '🔊' : '🔇';
E.muteBtn.classList.toggle('off', !S.sound);
E.muteBtn.title = S.sound ? 'Sound: on — click to mute' : 'Sound: muted — click to unmute';
}