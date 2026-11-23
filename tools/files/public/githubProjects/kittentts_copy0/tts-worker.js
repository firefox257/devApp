// ./tts-worker.js — module worker. NO static vendor imports:
// a failed static import kills the worker before it can report anything.

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

// 1) Forward console FIRST, before any imports.
const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const ser = a => a instanceof Error ? (a.stack || String(a))
  : typeof a === 'string' ? a
  : (() => { try { return JSON.stringify(a); } catch (e) { return String(a); } })();
for (const level of Object.keys(orig)) {
  console[level] = (...args) => {
    orig[level].apply(console, args);
    try { post({ type: 'log', message: { level, args: args.map(ser) } }); } catch (e) {}
  };
}

const status = (phase, message) => post({ type: 'status', phase, message });

let tts = null;
let latestGen = 0;
let queue = Promise.resolve();   // serialize jobs: _lastPhonWasGold / opts are shared state

async function loadOrt() {
  const base = new URL('./vendor/onnxruntime-web/', self.location.href).href;
  const candidates = [base + 'ort.min.mjs', base + 'ort.mjs', base + 'ort.min.js'];
  const failures = [];
  for (const url of candidates) {
    try {
      const mod = await import(url);
      // ESM export, default export, or UMD that attached itself to globalThis:
      const o = (mod && mod.InferenceSession) ? mod
        : (mod && mod.default && mod.default.InferenceSession) ? mod.default
        : (globalThis.ort && globalThis.ort.InferenceSession) ? globalThis.ort : null;
      if (!o) { failures.push(url + ' → loaded but no InferenceSession export'); continue; }
      o.env.wasm.wasmPaths = base;   // absolute URL, resolves correctly inside the worker
      o.env.wasm.numThreads = 1;     // no SharedArrayBuffer / COOP+COEP needed
      o.env.wasm.proxy = false;      // we ARE the worker; nested workers break Safari/Firefox
      try { o.env.logLevel = 'error'; } catch (e) {}
      globalThis.ort = o;            // kittentts.js picks this up
      console.log('[Worker] ORT loaded from', url);
      return o;
    } catch (e) { failures.push(url + ' → ' + ((e && e.message) || e)); }
  }
  throw new Error('Could not load ONNX runtime:\n' + failures.join('\n'));
}

async function doInit(opts) {
  if (tts && tts.ready) { post({ type: 'ready', voices: tts.voices, sampleRate: tts.sampleRate }); return; }
  status('ort', 'Loading ONNX runtime…');
  await loadOrt();
  status('engine', 'Loading KittenTTS engine…');
  const mod = await import('./kittentts.js');
  const KittenTTS = mod.default || mod.KittenTTS;
  tts = new KittenTTS(opts || {});
  tts.on('status', s => status('model', s));
  await tts.load(f => post({ type: 'progress', value: f }));
  post({ type: 'ready', voices: tts.voices, sampleRate: tts.sampleRate });
}

function enqueueSynth({ idx, text, voice, speed, gen }) {
  queue = queue.then(async () => {
    try {
      if (gen != null && gen < latestGen) { post({ type: 'stale', idx, gen }); return; }
      if (!tts || !tts.ready) throw new Error('TTS not initialized');
      tts.opts.voice = voice;
      tts.opts.speed = speed;
      const r = await tts.synthesize(text);
      post({ type: 'synthesized', idx, gen, samples: r.samples, sampleRate: r.sampleRate },
           [r.samples.buffer]);
    } catch (e) {
      console.error('[Worker] synth failed for', idx, e);
      post({ type: 'error', idx, gen, error: String((e && e.message) || e), stack: e && e.stack });
    }
  });
}

self.onmessage = (e) => {
  const { type, ...data } = e.data || {};
  if (type === 'init') {
    doInit(data.opts).catch(err => {
      console.error('[Worker] init failed:', err);
      post({ type: 'error', phase: 'init', error: String((err && err.message) || err), stack: err && err.stack });
    });
  } else if (type === 'synthesize') {
    enqueueSynth(data);
  } else if (type === 'setOpts') {
    if (data.gen != null) latestGen = data.gen;
    if (tts) {
      if (data.voice != null) tts.opts.voice = data.voice;
      if (data.speed != null) tts.opts.speed = data.speed;
    }
  }
};

post({ type: 'boot' });   // proves the worker script itself loaded
console.log('[Worker] boot ok, waiting for init');