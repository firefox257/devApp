// ./tensorindex_worker.js
/* TENSOR LAB — app layer for nn.js (engine unchanged).
* Seeded with the user's 40-entity corpus. Two guarantees:
*  1) PROVENANCE — the live model is fingerprinted to the corpus it trained on.
*     A model trained on other data cannot be graded against this schema.
*  2) BELIEF PROBE — decodes every entity in both slots to read back the
*     description the model actually holds, and diffs it against the corpus.
* WebGPU is used only after on-device forward+gradient parity passes. */
'use strict';
const SPECIAL = ['<|system|>', '<|user|>', '<|assistant|>', '<|stop|>'];
const WORKER_URL = 'training-worker.js';
/* ---- the user's corpus: 40 entities, 60 unique ordered pairs ---- */
const USER_SCHEMA = [
['ball1','green','rough'], ['ball2','blue','dull'],
['apple','red','sweet'], ['banana','yellow','soft'],
['car1','fast','shiny'], ['car2','slow','rusty'],
['door1','heavy','wooden'], ['door2','light','metal'],
['cloud1','white','fluffy'], ['cloud2','gray','thick'],
['pen1','black','smooth'], ['pen2','blue','grippy'],
['shoe1','red','laced'], ['shoe2','white','slip-on'],
['phone1','sleek','black'], ['phone2','bulky','silver'],
['cat1','orange','fluffy'], ['cat2','gray','sleek'],
['book1','thick','hardcover'], ['book2','thin','paperback'],
['cup1','ceramic','white'], ['cup2','plastic','blue'],
['tree1','tall','leafy'], ['tree2','short','bare'],
['lamp1','bright','modern'], ['lamp2','dim','vintage'],
['hat1','wool','warm'], ['hat2','straw','light'],
['key1','brass','old'], ['key2','steel','new'],
['rock1','smooth','gray'], ['rock2','jagged','brown'],
['fish1','gold','shiny'], ['fish2','blue','matte'],
['bag1','leather','brown'], ['bag2','canvas','green'],
['clock1','round','analog'], ['clock2','square','digital'],
['plant1','tall','leafy'], ['plant2','short','spiky']
];
const USER_PAIRS = [
['ball1','ball2'],['apple','banana'],['car1','car2'],['door1','door2'],['cloud1','cloud2'],
['pen1','pen2'],['shoe1','shoe2'],['phone1','phone2'],['cat1','cat2'],['book1','book2'],
['cup1','cup2'],['tree1','tree2'],['lamp1','lamp2'],['hat1','hat2'],['key1','key2'],
['rock1','rock2'],['fish1','fish2'],['bag1','bag2'],['clock1','clock2'],['plant1','plant2'],
['ball1','apple'],['ball2','car1'],['apple','door2'],['banana','cloud1'],['car2','pen1'],
['door1','shoe2'],['cloud2','phone1'],['pen2','cat1'],['shoe1','book2'],['phone2','cup1'],
['cat2','tree1'],['book1','lamp2'],['cup2','hat1'],['tree2','key2'],['lamp1','rock1'],
['hat2','fish2'],['key1','bag1'],['rock2','clock2'],['fish1','plant1'],['bag2','ball1'],
['clock1','banana'],['plant2','car2'],['ball2','door1'],['apple','cloud2'],['banana','pen2'],
['car1','shoe1'],['door2','phone2'],['cloud1','cat2'],['pen1','book1'],['shoe2','cup2'],
['phone1','tree2'],['cat1','lamp1'],['book2','hat2'],['cup1','key1'],['tree1','rock2'],
['lamp2','fish1'],['hat1','bag2'],['key2','clock1'],['rock1','plant2'],['fish2','ball1']
];
const DEFAULT_CFG = { epochs: 300, lr: 0.001, warmup: 8, clip: 1, softCap: 10, batch: 32, seq: 32, hidden: 64, layers: 2, rope: true, seed: 1337 };
const S = {
tok: null, vocab: null, idToToken: [], stopId: null,
model: null, gpu: null, gpuVerified: false, gpuReport: null,
worker: null, workerReady: false, workerBackend: '…',
training: false, cancelSent: false, activeSeq: null, trainStartSig: null,
loss: [], lrs: [], best: Infinity, bestEpoch: 0,
schema: new Map(), seen: new Set(), corpusSig: null, modelSig: null, modelMeta: null,
beliefs: new Map(), probe: { running: false, stop: false },
cfg: { ...DEFAULT_CFG },
suite: { running: false, stop: false, rows: [] },
conf: [], lastResult: null, undoCorpus: null, purgeArmed: 0,
sound: true, audio: null
};
const E = {};
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const norm = s => String(s).replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '').trim();
const mulberry = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const gpuUsable = () => !!S.gpu && S.gpuVerified;
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
/* ================= boot ================= */
document.addEventListener('DOMContentLoaded', async () => {
['pillWorker','pillRun','muteBtn','navTrain','navCancel','mismatchBar','mismatchText','btnShowDiff','btnRetrainNow','mismatchDetails',
'statEpoch','statLoss','statBest','statVocab','statSeq','statParams','heroTag','heroStatus','heroProg','progressRing','progressPct',
'badgeBackend','badgeModel','badgeSplit','runLog','btnCopyLog','btnQuickInspect','btnQuickProbe',
'corpus','corpusStats','genCount','genCountV','genReserve','genReserveV','genBalance','btnGenPairs','btnUndoCorpus','btnRestoreSeed',
'schemaBody','schemaCount','badgeSeen','badgeHeld','badgeCover',
'cEpochs','cEpochsV','cLR','cWarmup','cWarmupV','cClip','cClipV','cSoftCap','cSoftCapV','cBatch','cSeq','cSeedV','seedMinus','seedPlus',
'cHidden','cLayersV','layMinus','layPlus','cRoPE','btnTrain','btnCancel','btnRandomize','btnResetCfg',
'lossCanvas','chartEmpty','chartTag','chartLog','mInit','mFinal','mDrop','mUnif',
'pairA','pairB','pairStatus','tagSel','prompt','tempC','tempV','maxTokC','maxTokV','topKC','sampleMode','stopOnStop',
'btnGenerate','btnCopyResult','probStrip','confCanvas','inspTag','inspVerdict','inspSlots','inspDiff','inspDiag','inspBelief','inspGot','inspExpected',
'probeAnchor','probeScope','btnProbe','btnStopProbe','probeProg','beliefMatch','beliefWrong','beliefUnknown','beliefNote','beliefTag',
'beliefBody','beliefCount','btnCopyBeliefs','btnPurgeModel',
'suiteSet','suiteCount','suiteCountV','btnRunSuite','btnStopSuite','suiteProg','suiteAgg','suiteNote','suiteExact','suiteBleed','suiteEcho',
'suiteBody','suiteTag','suiteDetail','suiteAvail',
'btnParity','parityOut','provList','provState','provDiff','btnExport','btnImport','fileImport','densitySel','reduceMotion','soundOn','engineFacts','toastHost'
].forEach(id => E[id] = $(id));
loadCfg();
E.corpus.value = userCorpus();
bindControls(); bindNav(); bindReveal();
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
setPair('ball1', 'door2');
drawLoss(); drawConf(); renderSuiteAgg(null); renderFacts(); renderProvenance(); renderBeliefs();
log(`Corpus loaded: ${S.schema.size} entities · ${S.seen.size} seen pairs · fingerprint ${S.corpusSig.hash}`, 'i');
log('ball1 + door2 is held-out. Expected: door2 is light and metal.', 'i');
});
/* ================= corpus / schema ================= */
function userSchemaMap() {
const m = new Map();
for (const [n, c, t] of USER_SCHEMA) m.set(n, { color: c, texture: t, desc: `${c} and ${t}` });
return m;
}
function segLine(a, b, schema) {
const d = x => schema.get(x).desc;
return `<|user|>${a} and ${b}<|assistant|> shows ${a} is ${d(a)} and ${b} is ${d(b)}<|stop|>`;
}
function userCorpus() {
const m = userSchemaMap();
return USER_PAIRS.map(([a, b]) => segLine(a, b, m)).join('\n');
}
const GEN_RE = /^shows\s+(\S+)\s+is\s+([\s\S]*?)\s+and\s+(\S+)\s+is\s+([\s\S]*)$/;
function parseSchema(text) {
const map = new Map(), seen = new Set();
for (const seg of String(text).split('<|stop|>').map(s => s.trim()).filter(Boolean)) {
const m = seg.match(/^<\|user\|>([\s\S]*?)<\|assistant\|>([\s\S]*)$/);
if (!m) continue;
const um = m[1].trim().match(/^(\S+)\s+and\s+(\S+)$/);
if (!um) continue;
const a = um[1], b = um[2];
const g = GEN_RE.exec(norm(m[2]));
if (!g || g[1] !== a || g[3] !== b) continue;
const put = (n, desc) => {
const parts = desc.split(/\s+and\s+/).map(s => s.trim()).filter(Boolean);
if (parts.length) map.set(n, { color: parts[0], texture: parts.slice(1).join(' and ') || '—', desc: parts.join(' and ') });
};
put(a, g[2]); put(b, g[4]);
seen.add(a + '|' + b);
}
return { map, seen };
}
function makeSig() {
const entries = [...S.schema.entries()].map(([n, e]) => [n, e.desc]).sort((a, b) => a[0] < b[0] ? -1 : 1);
const pairs = [...S.seen].sort();
return {
hash: fnv(entries.map(e => e.join('=')).join(';') + '#' + pairs.join(',')),
vocabHash: fnv((S.vocab || []).join('|')),
entities: entries.length, pairs: pairs.length, entries, pairList: pairs,
at: new Date().toLocaleTimeString()
};
}
function sigDiff(a, b) {
if (!a || !b) return [];
const A = new Map(a.entries), B = new Map(b.entries), out = [];
for (const [n, d] of B) if (!A.has(n)) out.push(`+ ${n} — new in corpus (${d}), absent from model's schema`);
for (const [n, d] of A) if (!B.has(n)) out.push(`− ${n} — model knows it (${d}), not in current corpus`);
for (const [n, d] of B) if (A.has(n) && A.get(n) !== d) out.push(`≠ ${n} — model: “${A.get(n)}” · corpus: “${d}”`);
if (a.pairs !== b.pairs) out.push(`≠ training pairs — model saw ${a.pairs}, corpus has ${b.pairs}`);
return out;
}
function refreshSchema() {
const { map, seen } = parseSchema(E.corpus.value);
S.schema = map; S.seen = seen;
const names = [...map.keys()], total = names.length * (names.length - 1);
const c1 = {}, c2 = {};
for (const k of seen) { const [a, b] = k.split('|'); c1[a] = (c1[a] || 0) + 1; c2[b] = (c2[b] || 0) + 1; }
E.schemaBody.innerHTML = names.length ? names.map(n => {
const e = map.get(n);
return `<tr><td><span class="chip n">${esc(n)}</span></td><td><span class="chip c">${esc(e.color)}</span></td>
<td><span class="chip t">${esc(e.texture)}</span></td><td>${c1[n] || 0}</td><td>${c2[n] || 0}</td></tr>`;
}).join('') : `<tr><td colspan="5" style="color:var(--slate2);padding:14px">No parseable segments.</td></tr>`;
E.schemaCount.textContent = `${names.length} entities`;
E.badgeSeen.textContent = `seen ${seen.size}`;
E.badgeHeld.textContent = `held-out ${Math.max(0, total - seen.size)}`;
const covered = names.filter(n => c1[n] && c2[n]).length;
E.badgeCover.textContent = `both-slot coverage ${covered}/${names.length}`;
E.badgeCover.className = 'badge ' + (covered === names.length && names.length ? 'ok' : 'warn');
E.badgeSplit.textContent = `${seen.size} seen / ${Math.max(0, total - seen.size)} held`;
E.corpusStats.textContent = `${E.corpus.value.split('<|stop|>').filter(s => s.trim()).length} segments`;
const maxGen = Math.min(800, Math.max(20, total));
E.genCount.max = maxGen;
if (+E.genCount.value > maxGen) E.genCount.value = maxGen;
E.genCountV.textContent = E.genCount.value;
E.genReserve.max = Math.min(200, Math.max(0, total - 20));
if (+E.genReserve.value > +E.genReserve.max) E.genReserve.value = E.genReserve.max;
E.genReserveV.textContent = E.genReserve.value;
updateSuiteAvail(); syncProbeAnchor();
}
function allPairs() { const n = [...S.schema.keys()], o = []; for (const a of n) for (const b of n) if (a !== b) o.push([a, b]); return o; }
function pairsFor(set) {
return allPairs().filter(([a, b]) => { const s = S.seen.has(a + '|' + b); return set === 'all' ? true : set === 'seen' ? s : !s; });
}
function updateSuiteAvail() {
const n = pairsFor(E.suiteSet.value).length;
E.suiteAvail.textContent = `${n} available`;
E.suiteCount.max = Math.max(4, Math.min(120, n || 4));
if (+E.suiteCount.value > +E.suiteCount.max) E.suiteCount.value = E.suiteCount.max;
E.suiteCountV.textContent = E.suiteCount.value;
}
function generatePairs() {
if (S.schema.size < 2) { toast('Need at least 2 entities', 'bad'); return; }
const map = new Map(S.schema), names = [...map.keys()];
const total = names.length * (names.length - 1);
const want = clamp(+E.genCount.value, 2, total);
const rnd = mulberry(0xC0FFEE);
const pool = [];
for (const a of names) for (const b of names) if (a !== b) pool.push([a, b]);
for (let i = pool.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
let train = [], used = new Set();
if (E.genBalance.checked) {
const per = Math.max(2, Math.floor(want / names.length));
for (const a of names) {
const partners = pool.filter(([x]) => x === a).map(([, y]) => y);
for (let k = 0; k < Math.min(per, partners.length); k++) {
const key = a + '|' + partners[k];
if (!used.has(key) && train.length < want) { used.add(key); train.push([a, partners[k]]); }
}
}
for (const b of names) {
const partners = pool.filter(([, y]) => y === b).map(([x]) => x);
for (let k = 0; k < Math.min(per, partners.length); k++) {
const key = partners[k] + '|' + b;
if (!used.has(key) && train.length < want) { used.add(key); train.push([partners[k], b]); }
}
}
}
for (const [a, b] of pool) { if (train.length >= want) break; const k = a + '|' + b; if (!used.has(k)) { used.add(k); train.push([a, b]); } }
S.undoCorpus = E.corpus.value; E.btnUndoCorpus.disabled = false;
E.corpus.value = train.map(([a, b]) => segLine(a, b, map)).join('\n');
rebuildTokenizer();
const held = total - train.length;
toast(`${train.length} dense pairs · ${held} held-out`, 'ok', 'Undo', undoCorpus);
log(`Dense corpus: ${train.length} pairs, ${held} held-out, ~${(train.length / names.length).toFixed(1)} partners per entity per slot`, 'i');
}
function undoCorpus() {
if (S.undoCorpus == null) return;
E.corpus.value = S.undoCorpus; S.undoCorpus = null; E.btnUndoCorpus.disabled = true;
rebuildTokenizer(); toast('Corpus restored', 'ok');
}
/* ================= tokenizer ================= */
function buildTokenizer(corpus) {
const rx = /[a-zA-Z0-9]+|[^a-zA-Z0-9\s]/g;
const specialSet = new Set(SPECIAL);
const uniq = [...new Set((corpus.match(rx) || []).filter(t => !specialSet.has(t)))].sort((a, b) => {
for (let i = 0; i < Math.max(a.length, b.length); i++) {
const ca = i < a.length ? a.charCodeAt(i) : -1, cb = i < b.length ? b.charCodeAt(i) : -1;
if (ca !== cb) return ca - cb;
} return 0;
});
const vocabulary = [...SPECIAL, ...uniq];
const dec = {}; vocabulary.forEach((t, i) => dec[t] = i + 1);
const splitRe = new RegExp(`(${SPECIAL.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
return {
vocabulary, dec, splitRe,
encode(text) {
const ids = [];
for (const p of String(text).split(splitRe).filter(p => p.trim())) {
if (specialSet.has(p)) ids.push(dec[p]);
else ids.push(...(p.match(rx) || []).map(t => dec[t] || 0));
}
return ids;
},
decode: ids => ids.map(id => id === 0 ? '' : (vocabulary[id - 1] || '')).join('')
};
}
function restoreSpacing(text) {
if (!text) return '';
const valid = new Set(S.vocab);
return String(text).split(S.tok.splitRe).map(seg => {
if (SPECIAL.includes(seg)) return seg;
const words = []; let i = 0;
while (i < seg.length) {
let m = null;
for (let l = Math.min(30, seg.length - i); l > 0; l--) if (valid.has(seg.slice(i, i + l))) { m = seg.slice(i, i + l); break; }
if (m) { words.push(m); i += m.length; } else words.push(seg[i++]);
}
return words.join(' ').replace(/\s+([,.!?:;'"')\]])/g, '$1').trim();
}).join('').trim();
}
async function rebuildTokenizer() {
S.tok = buildTokenizer(E.corpus.value);
S.vocab = S.tok.vocabulary;
S.idToToken = ['<unk>', ...S.vocab];
S.stopId = S.tok.dec['<|stop|>'];
E.statVocab.textContent = S.vocab.length;
E.mUnif.textContent = Math.log(S.vocab.length + 1).toFixed(4);
refreshSchema();
S.corpusSig = makeSig();
syncPairSelectors();
S.beliefs.clear(); renderBeliefs();
guardModel();
if (S.workerReady && !S.training) setTrainEnabled(true);
renderFacts(); renderProvenance();
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
E.mismatchText.textContent = `live model was trained on a different schema (${S.modelSig ? S.modelSig.entities : '?'} entities, ${S.modelSig ? S.modelSig.hash : '—'}) — this corpus has ${S.corpusSig.entities} entities, ${S.corpusSig.hash}. ${diffs.length} difference${diffs.length === 1 ? '' : 's'}.`;
E.mismatchDetails.innerHTML = diffs.length ? diffs.map(esc).join('<br>') : 'Vocabulary differs even though the schema matches — retrain required.';
E.badgeModel.textContent = 'foreign model — blocked'; E.badgeModel.className = 'badge bad';
E.btnGenerate.disabled = true; E.btnRunSuite.disabled = true; E.btnProbe.disabled = true;
E.btnExport.disabled = false; E.btnPurgeModel.disabled = false;
E.inspTag.textContent = 'blocked — retrain';
} else {
document.body.classList.remove('blocked');
E.mismatchBar.classList.remove('show');
E.mismatchDetails.classList.remove('show');
E.btnGenerate.disabled = !ok; E.btnRunSuite.disabled = !ok; E.btnProbe.disabled = !ok;
E.btnExport.disabled = !has; E.btnPurgeModel.disabled = !has;
if (ok) { E.badgeModel.textContent = `${S.model.isGPU ? 'GPU' : 'CPU'} model · schema-bound`; E.badgeModel.className = 'badge ok'; }
else if (!has) { E.badgeModel.textContent = 'no model'; E.badgeModel.className = 'badge'; }
}
renderProvenance();
}
function renderProvenance() {
const m = S.modelSig, c = S.corpusSig;
E.provList.innerHTML = [
['model', S.model ? (S.model.isGPU ? 'WebGPU' : 'CPU') : 'none'],
['trained at', m ? m.at : '—'],
['model schema', m ? `${m.entities} entities · ${m.pairs} pairs` : '—'],
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
function purgeModel() {
if (!S.model) return;
const now = Date.now();
if (now - S.purgeArmed > 4000) {
S.purgeArmed = now;
E.btnPurgeModel.classList.add('armed');
E.btnPurgeModel.textContent = '⚠ Click again to purge';
setTimeout(() => { if (Date.now() - S.purgeArmed >= 3900) { E.btnPurgeModel.classList.remove('armed'); E.btnPurgeModel.textContent = '🗑 Purge model'; } }, 4100);
return;
}
S.purgeArmed = 0;
E.btnPurgeModel.classList.remove('armed'); E.btnPurgeModel.textContent = '🗑 Purge model';
if (S.model.isGPU) { try { S.model.dispose(); } catch (_) {} }
S.model = null; S.modelSig = null; S.modelMeta = null; S.beliefs.clear();
S.loss = []; S.lrs = []; S.best = Infinity;
E.statEpoch.textContent = '0'; E.statLoss.textContent = '—'; E.statBest.textContent = '—';
setProgress(0); drawLoss(); renderBeliefs(); guardModel(); renderFacts();
E.inspVerdict.className = 'verdict idle';
E.inspVerdict.innerHTML = '<div class="big">◌</div><div><div class="txt">Model purged</div><div class="sub">train on the current corpus to continue</div></div>';
E.inspSlots.innerHTML = ''; E.inspDiag.innerHTML = ''; E.inspDiff.textContent = '—';
E.inspGot.value = ''; E.inspBelief.textContent = 'Probe beliefs to see what the model thinks these entities are.';
toast('Model purged — corpus untouched', 'ok');
log('Model purged', 'w');
}
/* ================= worker ================= */
function initWorker() {
if (typeof Worker === 'undefined') { log('Web Workers unsupported', 'e'); return; }
try {
S.worker = new Worker(WORKER_URL);
S.worker.onmessage = ev => onWorker(ev.data);
S.worker.onerror = ev => { log('Worker error: ' + ev.message, 'e'); toast('Worker error: ' + ev.message, 'bad'); S.training = false; setTrainEnabled(true); };
S.worker.postMessage({ type: 'INIT_BACKEND', payload: {} });
} catch (e) { log('Worker creation failed: ' + e.message, 'e'); }
}
async function onWorker(d) {
switch (d.type) {
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
S.beliefs.clear(); renderBeliefs(); guardModel();
E.heroStatus.innerHTML = `<b>trained</b> · final loss <b>${(S.loss[S.loss.length - 1] || 0).toFixed(4)}</b> · best <b>${S.best.toFixed(4)}</b> @ ${S.bestEpoch}`;
E.heroTag.textContent = 'ready'; setProgress(1);
log(`Model live on ${S.model.isGPU ? 'WebGPU' : 'CPU'} · bound to schema ${S.modelSig ? S.modelSig.hash : '—'}`, 's');
toast('Training complete — inspect or probe', 'ok'); chord(true);
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
const can = on && S.workerReady && S.vocab && S.vocab.length > 4;
[E.btnTrain, E.navTrain].forEach(b => { b.disabled = !can; b.textContent = can ? (S.model ? '▶ Retrain' : '▶ Train model') : '▶ Train'; });
E.navTrain.textContent = E.btnTrain.textContent.replace(' model', '');
[E.btnCancel, E.navCancel].forEach(b => b.disabled = on);
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
const enc = E.corpus.value.split('<|stop|>').map(s => s.trim()).filter(Boolean)
.map(s => S.tok.encode(s + '<|stop|>')).filter(a => a.length >= 2);
if (!enc.length) return null;
const seqLen = Math.min(req, Math.max(...enc.map(a => a.length)));
if (seqLen < req) log(`Context auto-capped ${req} → ${seqLen}`, 'i');
let count = 0; for (const a of enc) count += a.length - 1;
const xs = new Int32Array(count * seqLen), ys = new Int32Array(count), ws = new Float32Array(count);
const aid = S.tok.dec['<|assistant|>'];
let row = 0, sup = 0;
for (const ids of enc) {
const ai = ids.indexOf(aid);
for (let i = 0; i < ids.length - 1; i++) {
const start = Math.max(0, i - seqLen + 1), slice = ids.slice(start, i + 1);
xs.set(slice, row * seqLen + (seqLen - slice.length));
ys[row] = ids[i + 1];
ws[row] = (ai !== -1 && i + 1 > ai) ? 1 : 0;
sup += ws[row]; row++;
}
}
return { xs, ys, ws, count, seqLen, sup };
}
function startTrain() {
if (S.training) return;
if (!S.workerReady) { toast('Worker still probing', 'warn'); return; }
const d = prepareData();
if (!d) { toast('No valid segments in the corpus', 'bad'); return; }
if (!d.sup) { toast('No assistant targets — check the tags', 'bad'); return; }
ensureAudio();
S.trainStartSig = makeSig();
S.training = true; S.cancelSent = false; S.loss = []; S.lrs = []; S.best = Infinity; S.bestEpoch = 0;
E.chartEmpty.style.display = 'none'; E.heroTag.textContent = 'training';
E.statEpoch.textContent = '0/' + S.cfg.epochs; E.statLoss.textContent = '—'; E.statBest.textContent = '—';
setProgress(0); drawLoss(); setTrainEnabled(false);
E.btnGenerate.disabled = true; E.btnRunSuite.disabled = true; E.btnProbe.disabled = true;
E.badgeModel.textContent = 'training…'; E.badgeModel.className = 'badge info';
const batchSize = Math.max(1, Math.min(S.cfg.batch, d.count));
S.activeSeq = d.seqLen; E.statSeq.textContent = d.seqLen;
S.worker.postMessage({
type: 'TRAIN',
payload: {
vocabSize: S.vocab.length, count: d.count, xsBuffer: d.xs, ysBuffer: d.ys, wsBuffer: d.ws,
config: {
vocabSize: S.vocab.length, lr: S.cfg.lr, useRoPE: S.cfg.rope, seqLen: d.seqLen,
epochs: S.cfg.epochs, batchSize, warmup: S.cfg.warmup, softCap: S.cfg.softCap, clip: S.cfg.clip,
hiddenDim: S.cfg.hidden, numLayers: S.cfg.layers, seed: S.cfg.seed, corpusSig: S.trainStartSig
}
}
}, [d.xs.buffer, d.ys.buffer, d.ws.buffer]);
log(`Train ${S.workerBackend.toUpperCase()} · ${d.count} seqs (${d.sup} supervised) · ctx ${d.seqLen} · batch ${batchSize} · ${S.cfg.hidden}d×${S.cfg.layers} · schema ${S.trainStartSig.hash}`, 'i');
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
if (id === 0 || (halt && id === S.stopId)) break;
out.push(id); ctx.push(id); conf.push(p[id] || 0);
if ((i & 3) === 0) await new Promise(r => setTimeout(r, 0));
}
return { ids: out, conf, text: restoreSpacing(S.tok.decode(out)) };
}
/* ================= grading ================= */
function expectation(a, b) {
const A = S.schema.get(a), B = S.schema.get(b);
return A && B ? `shows ${a} is ${A.desc} and ${b} is ${B.desc}` : null;
}
function parseGenerated(text) {
const g = GEN_RE.exec(norm(text));
return g ? { a: g[1], da: norm(g[2]), b: g[3], db: norm(g[4]) } : null;
}
const attrList = d => String(d).split(/\s+and\s+/).map(s => s.trim()).filter(Boolean);
function grade(a, b, gotText) {
const exp = expectation(a, b), A = S.schema.get(a), B = S.schema.get(b);
const slots = { entity1: false, attrs1: false, entity2: false, attrs2: false };
const diag = [], g = parseGenerated(gotText);
if (!exp) return { exact: false, slots, diag: ['Pair is not in the schema'], got: g, exp: '' };
if (!g) { diag.push('Output does not match the template — the frame is not learned yet'); return { exact: false, slots, diag, got: null, exp }; }
slots.entity1 = g.a === a; slots.attrs1 = norm(g.da) === A.desc;
slots.entity2 = g.b === b; slots.attrs2 = norm(g.db) === B.desc;
const ga = attrList(g.da), gb = attrList(g.db), ea = attrList(A.desc), eb = attrList(B.desc);
if (!slots.entity1) diag.push(`Slot 1 entity wrong: “${g.a}” ≠ “${a}”`);
if (!slots.entity2) {
if (g.b === a) diag.push('Slot 2 entity echoed slot 1');
else if (S.schema.has(g.b)) diag.push(`Slot 2 entity substituted → “${g.b}”`);
else diag.push(`Slot 2 entity unknown to this corpus → “${g.b}”`);
}
if (!slots.attrs1) diag.push(`Slot 1 attributes wrong: “${g.da}” ≠ “${A.desc}”`);
if (!slots.attrs2) {
if (gb[0] && eb[0] && gb[0] !== eb[0]) {
if (ga[0] && gb[0] === ga[0]) diag.push(`Colour bleed — slot 2 took slot 1 colour “${gb[0]}”`);
else if (ea[1] && gb[0] === ea[1]) diag.push(`Cross-attribute bleed — slot 2 colour is slot 1 texture “${gb[0]}”`);
else diag.push(`Slot 2 colour wrong: “${gb[0]}” ≠ “${eb[0]}”`);
}
if (gb[1] && eb[1] && gb[1] !== eb[1]) {
if (ga[1] && gb[1] === ga[1]) diag.push(`Texture bleed — slot 2 took slot 1 texture “${gb[1]}”`);
else diag.push(`Slot 2 texture wrong: “${gb[1]}” ≠ “${eb[1]}”`);
}
if (!gb.length) diag.push('Slot 2 attributes missing');
}
const belA = S.beliefs.get(a), belB = S.beliefs.get(b);
if (belB && belB.slot2 && belB.slot2 !== B.desc) diag.push(`Model belief: it holds ${b} = “${belB.slot2}”, corpus says “${B.desc}” — stale/foreign training`);
if (belA && belA.slot1 && belA.slot1 !== A.desc) diag.push(`Model belief: it holds ${a} = “${belA.slot1}”, corpus says “${A.desc}”`);
const exact = norm(gotText) === norm(exp);
if (exact) { diag.length = 0; diag.push('Copy rule satisfied — both entities and all attributes correct'); }
return { exact, slots, diag, got: g, exp, bleed: diag.some(d => /bleed/i.test(d)), echo: g.b === a };
}
function diffWords(exp, got) {
const A = String(exp).split(/\s+/).filter(Boolean), B = String(got).split(/\s+/).filter(Boolean);
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
function currentPair() {
const m = E.prompt.value.match(/<\|user\|>\s*(\S+)\s+and\s+(\S+)/);
if (m && S.schema.has(m[1]) && S.schema.has(m[2]) && m[1] !== m[2]) return [m[1], m[2]];
const a = E.pairA.value, b = E.pairB.value;
return S.schema.has(a) && S.schema.has(b) && a !== b ? [a, b] : null;
}
function renderBeliefLine(pair) {
if (!pair) return;
const [a, b] = pair, A = S.beliefs.get(a), B = S.beliefs.get(b);
if (!A && !B) { E.inspBelief.textContent = 'Not probed for this pair yet — run the belief probe.'; return; }
const fmt = (n, bel, slot, want) => {
const got = bel ? bel[slot] : null;
if (!got) return `${n}: unreadable`;
return `${n}: model “${got}” ${got === want ? '✓ matches corpus' : `✗ corpus says “${want}”`}`;
};
E.inspBelief.innerHTML = [
fmt(a, A, 'slot1', S.schema.get(a).desc),
fmt(b, B, 'slot2', S.schema.get(b).desc)
].map(s => esc(s)).join('<br>');
}
function renderInspection(pair, gotText) {
const [a, b] = pair, v = grade(a, b, gotText);
S.lastResult = { pair, gotText, v };
const seenPair = S.seen.has(a + '|' + b);
E.inspTag.textContent = seenPair ? 'seen pair' : 'held-out pair';
E.inspVerdict.className = 'verdict ' + (v.exact ? 'ok' : 'bad');
const pass = Object.values(v.slots).filter(Boolean).length;
E.inspVerdict.innerHTML = `<div class="big">${v.exact ? '✓' : '✗'}</div>
<div><div class="txt">${v.exact ? 'EXACT MATCH' : 'MISMATCH'} — ${pass}/4 slots correct</div>
<div class="sub">${esc(a)} + ${esc(b)} · ${seenPair ? 'seen in training' : 'never seen together'} · ${E.sampleMode.value === 'greedy' ? 'greedy' : 'sampled'}</div></div>`;
const A = S.schema.get(a), B = S.schema.get(b), g = v.got;
E.inspSlots.innerHTML = [
['entity 1', g ? g.a : '—', a, v.slots.entity1],
['attributes 1', g ? g.da : '—', A.desc, v.slots.attrs1],
['entity 2', g ? g.b : '—', b, v.slots.entity2],
['attributes 2', g ? g.db : '—', B.desc, v.slots.attrs2]
].map(([k, got, exp, ok]) => `<div class="slot ${ok ? 'pass' : 'fail'}"><div class="sk">${k}</div><div class="sv">${esc(got)}</div><div class="ex">want ${esc(exp)}</div></div>`).join('');
E.inspDiff.innerHTML = diffHTML(diffWords(v.exp, norm(gotText)));
E.inspDiag.innerHTML = v.diag.map(d => `<li class="${v.exact ? 'good' : (/bleed|echo|belief/i.test(d) ? 'err' : '')}">${esc(d)}</li>`).join('');
E.inspGot.value = gotText; E.inspExpected.value = v.exp;
renderBeliefLine(pair);
E.btnCopyResult.disabled = false;
beep(v.exact ? 880 : 150, v.exact ? .06 : .09, v.exact ? .05 : .07);
return v;
}
async function runInspect() {
if (!S.model) { toast('Train a model first', 'warn'); return; }
if (!modelMatches()) { toast('Model was trained on a different corpus — retrain', 'bad'); return; }
const pair = currentPair();
if (!pair) { toast('Prompt must name two schema entities', 'bad'); return; }
E.btnGenerate.disabled = true; E.inspTag.textContent = 'decoding…';
const collect = {};
try {
const res = await generateFrom(E.prompt.value, E.sampleMode.value === 'greedy', +E.maxTokC.value, +E.tempC.value, E.stopOnStop.checked, collect);
S.conf = res.conf; drawConf();
if (collect.probs) renderStrip(collect.probs);
const v = renderInspection(pair, res.text);
log(`Inspect ${pair[0]}+${pair[1]} → ${v.exact ? 'EXACT' : 'MISMATCH'} (${Object.values(v.slots).filter(Boolean).length}/4)`, v.exact ? 's' : 'w');
} catch (e) { toast('Generation failed: ' + e.message, 'bad'); log('Generation failed: ' + e.message, 'e'); }
E.btnGenerate.disabled = !modelMatches();
}
function renderStrip(probs) {
const idx = Array.from(probs, (p, i) => [p, i]).sort((a, b) => b[0] - a[0]).slice(0, +E.topKC.value);
const mx = idx[0] ? idx[0][0] : 1;
E.probStrip.innerHTML = idx.map(([p, i]) => {
const t = p / (mx || 1), hue = 265 - 200 * t;
const label = S.idToToken[i] !== undefined ? S.idToToken[i] : '#' + i;
return `<div class="cell" title="${esc(label)} — ${(p * 100).toFixed(2)}%" style="background:linear-gradient(180deg,hsl(${hue} 95% ${18 + 46 * t}%),hsl(${hue - 30} 90% ${8 + 26 * t}%))"></div>`;
}).join('');
}
/* ================= belief probe ================= */
function syncProbeAnchor() {
const names = [...S.schema.keys()], keep = E.probeAnchor.value;
E.probeAnchor.innerHTML = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
if (names.includes(keep)) E.probeAnchor.value = keep;
else if (names.length) E.probeAnchor.value = names[0];
}
function renderBeliefs() {
const names = [...S.schema.keys()];
E.beliefCount.textContent = S.beliefs.size ? `${S.beliefs.size}/${names.length} probed` : '—';
if (!S.beliefs.size) {
E.beliefBody.innerHTML = `<tr><td colspan="5" style="color:var(--slate2);padding:16px">No probe yet.</td></tr>`;
E.beliefMatch.textContent = 'learned —'; E.beliefWrong.textContent = 'wrong —'; E.beliefUnknown.textContent = 'unreadable —';
[E.beliefMatch, E.beliefWrong, E.beliefUnknown].forEach(b => b.className = 'badge');
E.btnCopyBeliefs.disabled = true;
return;
}
let ok = 0, bad = 0, unk = 0;
E.beliefBody.innerHTML = names.filter(n => S.beliefs.has(n)).map(n => {
const e = S.schema.get(n), b = S.beliefs.get(n);
const s1 = b.slot1, s2 = b.slot2;
const good = s1 === e.desc && s2 === e.desc;
const unreadable = !s1 && !s2;
if (unreadable) unk++; else if (good) ok++; else bad++;
const cell = v => !v ? '<span style="color:var(--slate2)">unreadable</span>'
: `<span class="chip ${v === e.desc ? 'n' : 'bad'}">${esc(v)}</span>`;
const state = unreadable ? '<span class="badge warn">unreadable</span>' : good ? '<span class="badge ok">learned</span>' : '<span class="badge bad">wrong</span>';
return `<tr><td><span class="chip n">${esc(n)}</span></td><td>${esc(e.desc)}</td><td>${cell(s1)}</td><td>${cell(s2)}</td><td>${state}</td></tr>`;
}).join('');
E.beliefMatch.textContent = `learned ${ok}`; E.beliefMatch.className = 'badge ' + (ok ? 'ok' : '');
E.beliefWrong.textContent = `wrong ${bad}`; E.beliefWrong.className = 'badge ' + (bad ? 'bad' : 'ok');
E.beliefUnknown.textContent = `unreadable ${unk}`; E.beliefUnknown.className = 'badge ' + (unk ? 'warn' : '');
E.btnCopyBeliefs.disabled = false;
const wrongNames = names.filter(n => { const b = S.beliefs.get(n); return b && (b.slot1 || b.slot2) && (b.slot1 !== S.schema.get(n).desc || b.slot2 !== S.schema.get(n).desc); });
E.beliefNote.textContent = bad
? `${bad} entities hold a different description than this corpus${wrongNames.length ? ` (e.g. ${wrongNames.slice(0, 4).join(', ')})` : ''}. That is exactly what produces fluent-but-wrong generations — the model learned another schema.`
: ok ? `All ${ok} probed entities match the corpus in both slots. The model's beliefs are aligned with this schema.`
: 'No readable beliefs — the template is not learned yet.';
}
async function runProbe() {
if (!S.model) { toast('Train a model first', 'warn'); return; }
if (!modelMatches()) { toast('Model was trained on a different corpus — retrain first', 'bad'); return; }
const names = [...S.schema.keys()];
if (names.length < 2) { toast('Need at least 2 entities', 'bad'); return; }
let anchor = E.probeAnchor.value;
if (!S.schema.has(anchor)) anchor = names[0];
let list = names;
if (E.probeScope.value === '12') list = names.slice(0, 12);
else if (E.probeScope.value === 'suspect') {
list = names.filter(n => { const b = S.beliefs.get(n); return !b || b.slot1 !== S.schema.get(n).desc || b.slot2 !== S.schema.get(n).desc; });
if (!list.length) list = names.slice(0, 12);
}
S.probe.running = true; S.probe.stop = false;
E.btnProbe.disabled = true; E.btnStopProbe.disabled = false; E.btnGenerate.disabled = true; E.btnRunSuite.disabled = true;
E.beliefTag.textContent = `probing 0/${list.length}`;
ensureAudio();
for (let i = 0; i < list.length; i++) {
if (S.probe.stop) break;
const n = list[i];
const other = n === anchor ? names.find(x => x !== n) : anchor;
if (!other) continue;
let slot1 = null, slot2 = null;
try {
const r1 = await generateFrom(`<|user|>${n} and ${other}<|assistant|>`, true, 48, 0, true, null);
const g1 = parseGenerated(r1.text);
if (g1 && g1.a === n) slot1 = g1.da;
const r2 = await generateFrom(`<|user|>${other} and ${n}<|assistant|>`, true, 48, 0, true, null);
const g2 = parseGenerated(r2.text);
if (g2 && g2.b === n) slot2 = g2.db;
} catch (e) { log('Probe failed: ' + e.message, 'e'); break; }
S.beliefs.set(n, { slot1, slot2 });
E.probeProg.style.width = ((i + 1) / list.length * 100) + '%';
E.beliefTag.textContent = `probing ${i + 1}/${list.length}`;
renderBeliefs();
if ((i & 1) === 0) await new Promise(r => setTimeout(r, 0));
}
S.probe.running = false;
E.beliefTag.textContent = S.probe.stop ? 'stopped' : `${S.beliefs.size} probed`;
E.btnProbe.disabled = !modelMatches(); E.btnStopProbe.disabled = true;
E.btnGenerate.disabled = !modelMatches(); E.btnRunSuite.disabled = !modelMatches();
renderBeliefs(); renderBeliefLine(currentPair());
const wrong = [...S.beliefs.entries()].filter(([n, b]) => (b.slot1 || b.slot2) && (b.slot1 !== S.schema.get(n).desc || b.slot2 !== S.schema.get(n).desc)).length;
log(`Belief probe: ${S.beliefs.size} entities · ${wrong} holding a foreign description`, wrong ? 'w' : 's');
toast(wrong ? `${wrong} entities hold the wrong description` : 'Beliefs match the corpus', wrong ? 'warn' : 'ok');
chord(!wrong);
}
/* ================= suite ================= */
function renderSuiteAgg(agg) {
const rows = [
['exact match', agg ? agg.exact / agg.n : 0, 'linear-gradient(90deg,#a3e635,#22d3ee)'],
['entity 1', agg ? agg.entity1 / agg.n : 0, 'linear-gradient(90deg,#22d3ee,#7c5cff)'],
['attributes 1', agg ? agg.attrs1 / agg.n : 0, 'linear-gradient(90deg,#7c5cff,#ff3df0)'],
['entity 2', agg ? agg.entity2 / agg.n : 0, 'linear-gradient(90deg,#fbbf24,#ff3df0)'],
['attributes 2', agg ? agg.attrs2 / agg.n : 0, 'linear-gradient(90deg,#ff3df0,#ff3b5c)']
];
E.suiteAgg.innerHTML = rows.map(([k, v, g]) =>
`<div class="bar"><span style="color:var(--slate)">${k}</span><span class="tr"><i class="fi" style="width:${(v * 100).toFixed(1)}%;background:${g}"></i></span><span class="pc">${agg ? (v * 100).toFixed(0) + '%' : '—'}</span></div>`).join('');
}
async function runSuite() {
if (!S.model) { toast('Train a model first', 'warn'); return; }
if (!modelMatches()) { toast('Model was trained on a different corpus — retrain', 'bad'); return; }
const set = E.suiteSet.value;
let pool = pairsFor(set);
if (!pool.length) { toast(`No ${set} pairs available`, 'warn'); return; }
const rnd = mulberry(0x5EED);
pool = pool.slice();
for (let i = pool.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
const n = Math.min(pool.length, +E.suiteCount.value), samplePairs = pool.slice(0, n);
S.suite.running = true; S.suite.stop = false; S.suite.rows = [];
E.btnRunSuite.disabled = true; E.btnStopSuite.disabled = false; E.btnGenerate.disabled = true; E.btnProbe.disabled = true;
E.suiteTag.textContent = `running 0/${n}`; E.suiteDetail.style.display = 'none'; E.suiteBody.innerHTML = '';
const agg = { n, exact: 0, entity1: 0, attrs1: 0, entity2: 0, attrs2: 0, bleed: 0, echo: 0 };
ensureAudio();
for (let k = 0; k < n; k++) {
if (S.suite.stop) break;
const [a, b] = samplePairs[k];
let res;
try { res = await generateFrom(`<|user|>${a} and ${b}<|assistant|>`, true, 48, 0, true, null); }
catch (e) { log('Suite failed: ' + e.message, 'e'); break; }
const v = grade(a, b, res.text);
agg.exact += v.exact ? 1 : 0;
for (const s of ['entity1', 'attrs1', 'entity2', 'attrs2']) agg[s] += v.slots[s] ? 1 : 0;
agg.bleed += v.bleed ? 1 : 0; agg.echo += v.echo ? 1 : 0;
const seen = S.seen.has(a + '|' + b);
S.suite.rows.push({ a, b, v, text: res.text, seen });
const mark = ok => `<span style="color:${ok ? 'var(--lime)' : 'var(--red)'};font-weight:700">${ok ? '✓' : '✗'}</span>`;
const tr = document.createElement('tr');
tr.style.cursor = 'pointer';
tr.innerHTML = `<td><span class="chip n">${esc(a)}</span> <span style="color:var(--slate2)">+</span> <span class="chip n">${esc(b)}</span></td>
<td><span class="badge ${seen ? 'info' : 'warn'}" style="font-size:9.5px">${seen ? 'seen' : 'held'}</span></td>
<td>${mark(v.slots.entity1)}</td><td>${mark(v.slots.attrs1)}</td><td>${mark(v.slots.entity2)}</td><td>${mark(v.slots.attrs2)}</td>
<td>${v.exact ? '<span class="badge ok" style="font-size:9.5px">exact</span>' : '<span class="badge bad" style="font-size:9.5px">miss</span>'}</td>`;
tr.addEventListener('click', () => {
E.suiteDetail.style.display = 'block';
E.suiteDetail.innerHTML = `<div style="color:var(--slate);font-size:11px;margin-bottom:6px">${esc(a)} + ${esc(b)} — expected → got</div>` +
diffHTML(diffWords(v.exp, norm(res.text))) +
(v.diag.length ? `<div style="margin-top:8px;color:var(--amber);font-size:11.5px">${v.diag.map(esc).join(' · ')}</div>` : '');
});
E.suiteBody.appendChild(tr);
const sc = E.suiteBody.closest('.scroll'); if (sc) sc.scrollTop = sc.scrollHeight;
E.suiteProg.style.width = ((k + 1) / n * 100) + '%';
E.suiteTag.textContent = `running ${k + 1}/${n}`;
renderSuiteAgg({ ...agg, n: k + 1 });
E.suiteExact.textContent = `exact ${agg.exact}/${k + 1}`; E.suiteExact.className = 'badge ' + (agg.exact === k + 1 ? 'ok' : 'warn');
E.suiteBleed.textContent = `bleed ${agg.bleed}`; E.suiteBleed.className = 'badge ' + (agg.bleed ? 'bad' : 'ok');
E.suiteEcho.textContent = `echo ${agg.echo}`; E.suiteEcho.className = 'badge ' + (agg.echo ? 'bad' : 'ok');
if ((k & 3) === 0) await new Promise(r => setTimeout(r, 0));
}
const done = S.suite.rows.length, pct = done ? Math.round(agg.exact / done * 100) : 0;
renderSuiteAgg(done ? { ...agg, n: done } : null);
E.suiteTag.textContent = S.suite.stop ? `stopped at ${done}` : `${done} pairs · ${pct}% exact`;
E.suiteNote.textContent = !done ? 'Suite stopped before any pair completed.'
: pct === 100 ? `The copy rule holds on all ${done} ${set} pairs.`
: `${agg.exact}/${done} exact. Slot-2 attributes ${Math.round(agg.attrs2 / done * 100)}%; ${agg.bleed} bleed, ${agg.echo} echo.`;
log(`Suite ${set}: ${agg.exact}/${done} exact · attrs2 ${Math.round(agg.attrs2 / Math.max(1, done) * 100)}%`, pct === 100 ? 's' : 'w');
toast(`Suite: ${agg.exact}/${done} exact (${pct}%)`, pct === 100 ? 'ok' : 'warn'); chord(pct === 100);
S.suite.running = false;
E.btnRunSuite.disabled = !modelMatches(); E.btnStopSuite.disabled = true;
E.btnGenerate.disabled = !modelMatches(); E.btnProbe.disabled = !modelMatches();
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
E.btnGenerate.disabled = true; E.btnRunSuite.disabled = true; E.btnProbe.disabled = true;
E.badgeModel.textContent = 'retrain (GPU untrusted)'; E.badgeModel.className = 'badge bad';
}
E.btnParity.disabled = false;
}
async function exportModel() {
if (!S.model) return;
try {
const weights = S.model.isGPU ? await S.model.getWeights() : S.model.getWeights();
const json = nn.packJSON(S.model.cfg, weights, {
vocab: S.vocab, specialTokens: SPECIAL, activeSeqLen: S.activeSeq,
schema: [...S.schema.entries()], seen: [...S.seen],
corpusSig: S.modelSig, beliefs: [...S.beliefs.entries()], lab: 'tensor-lab'
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
S.beliefs.clear();
if (obj.meta && Array.isArray(obj.meta.beliefs)) for (const [n, b] of obj.meta.beliefs) S.beliefs.set(n, b);
if (obj.meta && Array.isArray(obj.meta.schema) && obj.meta.schema.length && !modelMatches()) {
const m = new Map(obj.meta.schema);
const lines = (obj.meta.seen || []).map(k => { const [a, b] = k.split('|'); return m.has(a) && m.has(b) ? segLine(a, b, m) : null; }).filter(Boolean);
if (lines.length) {
S.undoCorpus = E.corpus.value; E.btnUndoCorpus.disabled = false;
E.corpus.value = lines.join('\n'); await rebuildTokenizer();
toast('Imported model — corpus switched to its own schema', 'ok', 'Undo', undoCorpus);
}
}
renderBeliefs(); guardModel();
log(`Model imported · schema ${S.modelSig ? S.modelSig.hash : 'unknown'}`, 's');
if (modelMatches()) toast('Model imported and bound to this corpus', 'ok');
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
E.genCount.addEventListener('input', () => E.genCountV.textContent = E.genCount.value);
E.genReserve.addEventListener('input', () => E.genReserveV.textContent = E.genReserve.value);
E.btnGenPairs.addEventListener('click', generatePairs);
E.btnUndoCorpus.addEventListener('click', undoCorpus);
E.btnRestoreSeed.addEventListener('click', () => {
S.undoCorpus = E.corpus.value; E.btnUndoCorpus.disabled = false;
E.corpus.value = userCorpus(); rebuildTokenizer(); setPair('ball1', 'door2');
toast('Your 40-entity corpus restored', 'ok', 'Undo', undoCorpus);
});
let ct; E.corpus.addEventListener('input', () => { clearTimeout(ct); ct = setTimeout(rebuildTokenizer, 350); });
[E.btnTrain, E.navTrain, E.btnRetrainNow].forEach(b => b.addEventListener('click', startTrain));
[E.btnCancel, E.navCancel].forEach(b => b.addEventListener('click', cancelTrain));
E.btnShowDiff.addEventListener('click', () => E.mismatchDetails.classList.toggle('show'));
E.chartLog.addEventListener('change', drawLoss);
E.pairA.addEventListener('change', () => setPair(E.pairA.value, E.pairB.value));
E.pairB.addEventListener('change', () => setPair(E.pairA.value, E.pairB.value));
E.tagSel.addEventListener('change', () => { if (E.tagSel.value) { E.prompt.value += E.tagSel.value; E.tagSel.value = ''; E.prompt.focus(); updatePairStatus(); } });
E.prompt.addEventListener('input', updatePairStatus);
E.tempC.addEventListener('input', () => { E.tempV.textContent = (+E.tempC.value).toFixed(2); if (+E.tempC.value > 0) E.sampleMode.value = 'temp'; });
E.maxTokC.addEventListener('input', () => E.maxTokV.textContent = E.maxTokC.value);
E.sampleMode.addEventListener('change', () => {
if (E.sampleMode.value === 'greedy') { E.tempC.value = 0; E.tempV.textContent = '0.00'; }
else if (+E.tempC.value === 0) { E.tempC.value = 0.8; E.tempV.textContent = '0.80'; }
});
E.topKC.addEventListener('change', () => { if (S.lastResult && modelMatches()) runInspect(); });
E.btnGenerate.addEventListener('click', runInspect);
E.btnCopyResult.addEventListener('click', async () => {
if (!S.lastResult) return;
const r = S.lastResult;
const txt = `prompt: ${E.prompt.value}
output: ${r.gotText}
expected: ${r.v.exp}
verdict: ${r.v.exact ? 'EXACT' : 'MISMATCH'}
slots: ${JSON.stringify(r.v.slots)}
notes: ${r.v.diag.join('; ')}
model schema: ${S.modelSig ? S.modelSig.hash : '—'}
corpus schema: ${S.corpusSig ? S.corpusSig.hash : '—'}`;
try { await navigator.clipboard.writeText(txt); toast('Result copied', 'ok'); } catch (_) { toast('Clipboard unavailable', 'warn'); }
});
E.btnQuickInspect.addEventListener('click', () => {
setPair('ball1', 'door2');
document.getElementById('inspect').scrollIntoView({ behavior: 'smooth' });
if (modelMatches()) runInspect(); else toast(S.model ? 'Retrain on this corpus first' : 'Train first — this grades ball1 + door2', 'warn');
});
E.btnQuickProbe.addEventListener('click', () => {
document.getElementById('beliefs').scrollIntoView({ behavior: 'smooth' });
if (modelMatches()) runProbe(); else toast(S.model ? 'Retrain on this corpus first' : 'Train a model first', 'warn');
});
E.probeAnchor.addEventListener('change', () => {});
E.btnProbe.addEventListener('click', runProbe);
E.btnStopProbe.addEventListener('click', () => { S.probe.stop = true; E.btnStopProbe.disabled = true; });
E.btnPurgeModel.addEventListener('click', purgeModel);
E.btnCopyBeliefs.addEventListener('click', async () => {
const lines = [...S.beliefs.entries()].map(([n, b]) => {
const want = S.schema.get(n) ? S.schema.get(n).desc : '?';
return `${n}\tcorpus=${want}\tslot1=${b.slot1 || 'unreadable'}\tslot2=${b.slot2 || 'unreadable'}\t${b.slot1 === want && b.slot2 === want ? 'OK' : 'WRONG'}`;
});
try { await navigator.clipboard.writeText(`model schema ${S.modelSig ? S.modelSig.hash : '—'} vs corpus ${S.corpusSig ? S.corpusSig.hash : '—'}\n` + lines.join('\n')); toast('Belief report copied', 'ok'); }
catch (_) { toast('Clipboard unavailable', 'warn'); }
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
  try {
    await navigator.clipboard.writeText(E.runLog.innerText);
    toast('Logs copied to clipboard', 'ok');
  } catch (_) {
    toast('Clipboard unavailable', 'warn');
  }
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
else if (k === 'p' && !E.btnProbe.disabled) runProbe();
else if (k === 's' && !E.btnRunSuite.disabled) runSuite();
else if (e.key === 'Escape') { cancelTrain(); S.suite.stop = true; S.probe.stop = true; }
});
window.addEventListener('beforeunload', () => {
if (S.worker) { S.worker.postMessage({ type: 'CANCEL' }); S.worker.terminate(); }
if (S.model?.isGPU) { try { S.model.dispose(); } catch (_) {} }
});
}
function syncPairSelectors() {
const names = [...S.schema.keys()], keepA = E.pairA.value, keepB = E.pairB.value;
const opts = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
E.pairA.innerHTML = opts; E.pairB.innerHTML = opts;
if (names.includes(keepA)) E.pairA.value = keepA;
if (names.includes(keepB)) E.pairB.value = keepB;
if (names.length > 1 && E.pairA.value === E.pairB.value) E.pairB.value = names.find(n => n !== E.pairA.value);
}
function setPair(a, b) {
const names = [...S.schema.keys()];
if (!names.includes(a) || !names.includes(b) || a === b) { a = names[0]; b = names.find(n => n !== a); if (!a || !b) return; }
E.pairA.value = a; E.pairB.value = b;
E.prompt.value = `<|user|>${a} and ${b}<|assistant|>`;
E.inspExpected.value = expectation(a, b) || '';
updatePairStatus(); renderBeliefLine([a, b]);
}
function updatePairStatus() {
const p = currentPair();
if (!p) { E.pairStatus.textContent = 'free prompt'; E.pairStatus.style.color = 'var(--amber)'; return; }
const seen = S.seen.has(p[0] + '|' + p[1]);
E.pairStatus.textContent = seen ? 'seen in training' : 'held-out pair';
E.pairStatus.style.color = seen ? 'var(--cyan)' : 'var(--lime)';
E.inspExpected.value = expectation(p[0], p[1]) || '';
renderBeliefLine(p);
}
/* ================= nav / reveal / toast / log / audio ================= */
function bindNav() {
const links = [...document.querySelectorAll('.navlinks a')];
const secs = links.map(a => document.getElementById(a.dataset.sec)).filter(Boolean);
new IntersectionObserver(ents => {
ents.forEach(en => { if (en.isIntersecting) links.forEach(l => l.classList.toggle('on', l.dataset.sec === en.target.id)); });
}, { rootMargin: '-120px 0px -65% 0px', threshold: 0 }).observe && secs.forEach(s => {
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
const t = new Date().toLocaleTimeString();
const cls = { e: 'e', w: 'w', s: 's', i: 'i' }[kind] || '';
const pre = { e: '✗', w: '⚠', s: '✓', i: '›' }[kind] || '·';
E.runLog.innerHTML += `<span class="t">${t}</span> <span class="${cls}">${pre} ${esc(msg)}</span>\n`;
E.runLog.scrollTop = E.runLog.scrollHeight;
}
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