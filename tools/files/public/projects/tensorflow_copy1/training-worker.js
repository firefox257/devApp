/* training-worker.js — trains nn.ChatLM off the main thread.
 * Same message protocol as the TF.js version: INIT_BACKEND / TRAIN / CANCEL. */
importScripts('nn.js');

let model = null, opt = null, training = false, cancelled = false;

// Macrotask yield without setTimeout's 4ms clamp; lets CANCEL arrive between batches.
const yieldToEvents = () => new Promise(res => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); res(); };
  ch.port2.postMessage(0);
});

function memInfo(params) {
  let bytes = 0;
  for (const p of params) bytes += p.size * 4 * 4; // data + grad + Adam m,v
  return { numTensors: params.length * 4, numBytes: bytes };
}

async function train(payload) {
  if (training) throw new Error('Training already in progress');
  training = true; cancelled = false;
  try {
    const { count, xsBuffer, ysBuffer, config } = payload;
    const { vocabSize, lr, useRoPE, seqLen, epochs, batchSize } = config;
    const xs = xsBuffer instanceof Int32Array ? xsBuffer : new Int32Array(xsBuffer);
    const ys = ysBuffer instanceof Int32Array ? ysBuffer : new Int32Array(ysBuffer);

    nn.manualSeed(1337); // reproducible runs
    model = new nn.ChatLM({ vocabSize, seqLen, useRoPE });
    const params = model.parameters();
    opt = new nn.Adam(params, lr);

    const order = new Uint32Array(count);
    const bx = new Int32Array(batchSize * seqLen);
    const by = new Int32Array(batchSize);
    let batch = 0;

    for (let epoch = 0; epoch < epochs && !cancelled; epoch++) {
      for (let i = 0; i < count; i++) order[i] = i;
      for (let i = count - 1; i > 0; i--) { // Fisher–Yates shuffle
        const j = (Math.random() * (i + 1)) | 0;
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }
      let epochLoss = 0, seen = 0;
      for (let start = 0; start < count; start += batchSize) {
        const bs = Math.min(batchSize, count - start);
        for (let i = 0; i < bs; i++) {
          const row = order[start + i];
          bx.set(xs.subarray(row * seqLen, (row + 1) * seqLen), i * seqLen);
          by[i] = ys[row];
        }
        const logits = model.forward(bx.subarray(0, bs * seqLen), bs);
        const loss = nn.sparseCE(logits, by.subarray(0, bs));
        nn.backward(loss);   // consumes + clears the tape
        opt.step();
        opt.zeroGrad();      // grad buffers are reused, never reallocated
        epochLoss += loss.data[0] * bs; seen += bs;
        if (((batch++) & 3) === 0) { await yieldToEvents(); if (cancelled) break; }
      }
      if (cancelled) break;
      self.postMessage({ type: 'PROGRESS', epoch, totalEpochs: epochs,
        loss: epochLoss / seen, memory: memInfo(params) });
      await yieldToEvents();
    }

    if (cancelled) {
      nn.clearTape(); model = null; opt = null;
      self.postMessage({ type: 'TRAIN_CANCELLED' });
      return;
    }
    const weights = model.getWeights().map(w => ({ shape: w.shape, data: w.data, dtype: 'float32' }));
    model = null; opt = null;
    // zero-copy transfer of weight buffers back to the main thread
    self.postMessage({ type: 'TRAIN_COMPLETE', weights, config }, weights.map(w => w.data.buffer));
  } catch (e) {
    nn.clearTape(); model = null; opt = null;
    throw e;
  } finally {
    training = false;
  }
}

self.onmessage = async (e) => {
  const { type, payload } = e.data || {};
  try {
    if (type === 'INIT_BACKEND') {
      self.postMessage({ type: 'BACKEND_READY', backend: 'nnjs-cpu', memory: { numTensors: 0, numBytes: 0 } });
    } else if (type === 'TRAIN') {
      await train(payload);
    } else if (type === 'CANCEL') {
      cancelled = true;
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message || String(err), stack: err.stack });
  }
};