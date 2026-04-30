// training-worker.js
// TensorFlow.js training worker for Chat-Ready Browser LLM
// Handles all training operations off the main thread to keep UI responsive

importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js');

// ========== CONFIG (must match main thread exactly) ==========
const HIDDEN_DIM = 64;
const NUM_LAYERS = 2;
// =============================================================

// ========== RoPE Cache & Utilities ==========
const ropeCache = {};

function computeRoPEConstants(seqLen, hiddenDim, base = 10000) {
  const key = `${seqLen}_${hiddenDim}`;
  if (ropeCache[key]) return ropeCache[key];
  
  const half = Math.floor(hiddenDim / 2);
  const freqs = Array.from({ length: half }, (_, i) => 
    1 / Math.pow(base, (2 * i) / hiddenDim)
  );
  
  const sinTable = [], cosTable = [];
  
  for (let pos = 0; pos < seqLen; pos++) {
    const sinRow = [], cosRow = [];
    for (let i = 0; i < half; i++) {
      sinRow.push(Math.sin(pos * freqs[i]));
      cosRow.push(Math.cos(pos * freqs[i]));
    }
    sinTable.push(sinRow);
    cosTable.push(cosRow);
  }
  
  return ropeCache[key] = { sinTable, cosTable, halfDim: half };
}

// ========== RoPE Layer (must be registered in worker context) ==========
class RoPELayer extends tf.layers.Layer {
  constructor(config) {
    super(config);
    this.seqLen = config.seqLen;
    this.hiddenDim = config.hiddenDim;
    // Pre-compute tables during construction
    const { sinTable, cosTable, halfDim } = computeRoPEConstants(
      this.seqLen, 
      this.hiddenDim
    );
    this.sinTable = sinTable;
    this.cosTable = cosTable;
    this.halfDim = halfDim;
  }
  
  static get className() { return 'RoPELayer'; }
  
  computeOutputShape(inputShape) { return inputShape; }
  
  call(inputs) {
    return tf.tidy(() => {
      const x = inputs[0];
      
      // Reshape precomputed tables for broadcasting
      // Note: We create these tensors every call. For optimization, 
      // they could be stored as class properties if memory allows, 
      // but tidy handles cleanup here.
      const s = tf.reshape(
        tf.tensor2d(this.sinTable, [this.seqLen, this.halfDim]),
        [1, this.seqLen, this.halfDim]
      );
      const c = tf.reshape(
        tf.tensor2d(this.cosTable, [this.seqLen, this.halfDim]),
        [1, this.seqLen, this.halfDim]
      );
      
      // Split input into two halves
      const x1 = tf.slice(x, [0, 0, 0], [-1, -1, this.halfDim]);
      const x2 = tf.slice(x, [0, 0, this.halfDim], [-1, -1, this.halfDim]);
      
      // Apply rotary transformation
      const rotated1 = tf.sub(tf.mul(x1, c), tf.mul(x2, s));
      const rotated2 = tf.add(tf.mul(x1, s), tf.mul(x2, c));
      
      return tf.concat([rotated1, rotated2], -1);
    });
  }
}
tf.serialization.registerClass(RoPELayer);

// ========== Model Architecture (Worker-Side) ==========
function createModel(vocabSize, learningRate, useRoPE, seqLen) {
  const input = tf.input({ shape: [seqLen], dtype: 'int32' });
  
  // Embedding layer (+1 for <unk> token)
  let x = tf.layers.embedding({
    inputDim: vocabSize + 1,
    outputDim: HIDDEN_DIM,
    inputLength: seqLen
  }).apply(input);
  
  // Normalize embeddings before positional encoding
  x = tf.layers.layerNormalization().apply(x);
  
  // Apply RoPE if enabled
  if (useRoPE) {
    x = new RoPELayer({ 
      seqLen: seqLen, 
      hiddenDim: HIDDEN_DIM 
    }).apply(x);
  }
  
  // SwiGLU blocks with residual connections + LayerNorm
  for (let i = 0; i < NUM_LAYERS; i++) {
    const residual = x;
    
    // Parallel projections for SwiGLU
    const gate = tf.layers.dense({ units: HIDDEN_DIM }).apply(x);
    const value = tf.layers.dense({ units: HIDDEN_DIM }).apply(x);
    
    // Gated activation: Swish(gate) * value
    x = tf.layers.multiply().apply([
      tf.layers.activation({ activation: 'swish' }).apply(gate),
      value
    ]);
    
    // Residual connection
    x = tf.layers.add().apply([x, residual]);
    
    // Post-LN for stability
    x = tf.layers.layerNormalization().apply(x);
  }
  
  // Global average pooling over sequence dimension
  x = tf.layers.globalAveragePooling1d().apply(x);
  
  // Output head: predict next token
  const output = tf.layers.dense({
    units: vocabSize + 1,
    activation: 'softmax'
  }).apply(x);
  
  // Compile model
  const model = tf.model({ inputs: input, outputs: output });
  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: 'categoricalCrossentropy'
  });
  
  return model;
}

// ========== Worker Message Handler ==========
self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;
  
  try {
    // --- Backend Initialization ---
    if (type === 'INIT_BACKEND') {
      const requestedBackend = payload.backend || 'webgl';
      const fallbacks = [requestedBackend, 'webgl', 'wasm', 'cpu'];
      let selectedBackend = null;
      
      for (const b of fallbacks) {
        try {
          await tf.setBackend(b);
          await tf.ready();
          selectedBackend = b;
          break;
        } catch (e) {
          console.warn(`[Worker] Backend ${b} failed:`, e.message);
        }
      }
      
      if (!selectedBackend) {
        throw new Error('No compatible backend found');
      }
      
      self.postMessage({ 
        type: 'BACKEND_READY', 
        backend: selectedBackend,
        memory: {
          numBytes: tf.memory().numBytes,
          numTensors: tf.memory().numTensors
        }
      });
    }
    
    // --- Training Job ---
    else if (type === 'TRAIN') {
      const { 
        vocabSize, 
        sequences, 
        config,
        backend 
      } = payload;
      
      console.log(`[Worker] Starting training: ${sequences.length} sequences`);
      
      // Ensure backend is set
      if (tf.getBackend() !== backend) {
        try {
          await tf.setBackend(backend);
          await tf.ready();
        } catch (e) {
          console.warn(`[Worker] Backend switch failed, using current: ${tf.getBackend()}`);
        }
      }
      
      // Create model
      const model = createModel(vocabSize, config.lr, config.useRoPE, config.seqLen);
      
      // Prepare training tensors
      const xs = tf.tensor2d(
        sequences.map(s => s.input), 
        [sequences.length, config.seqLen], 
        'int32'
      );
      const ys = tf.oneHot(
        tf.tensor1d(sequences.map(s => s.target), 'int32'), 
        vocabSize + 1
      );
      
      // Train
      await model.fit(xs, ys, {
        epochs: config.epochs,
        batchSize: config.batchSize,
        shuffle: true,
        callbacks: {
          onEpochEnd: async (epoch, logs) => {
            self.postMessage({
              type: 'PROGRESS',
              epoch,
              totalEpochs: config.epochs,
              loss: logs.loss,
              memory: {
                numBytes: tf.memory().numBytes,
                numTensors: tf.memory().numTensors
              }
            });
            // Yield to keep worker responsive
            await new Promise(r => setTimeout(r, 0));
          }
        }
      });
      
      console.log(`[Worker] Training complete. Extracting weights...`);
      
      // 1. Get weights
      const weights = model.getWeights();
      const weightData = [];
      
      // 2. Serialize weights BEFORE disposing model
      for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        // Await data() to ensure we have the values before disposal
        const data = await w.data(); 
        weightData.push({
          shape: w.shape,
          dtype: w.dtype,
          data: Array.from(data) // Convert TypedArray to normal Array for transfer
        });
      }
      
      // 3. NOW dispose model and training tensors
      model.dispose();
      xs.dispose();
      ys.dispose();
      // Dispose original weight tensors too (they are part of model, but good practice)
      weights.forEach(w => w.dispose());
      
      console.log(`[Worker] Weights extracted and memory cleaned.`);
      
      // 4. Send to main thread
      self.postMessage({
        type: 'TRAIN_COMPLETE',
        weights: weightData,
        config: {
          vocabSize,
          seqLen: config.seqLen,
          useRoPE: config.useRoPE,
          hiddenDim: HIDDEN_DIM,
          numLayers: NUM_LAYERS
        }
      });
      
    }
    
    // --- Cancel Training ---
    else if (type === 'CANCEL') {
      console.log('[Worker] Cancel requested');
      // Note: Hard to stop fit() mid-epoch without custom callback logic, 
      // but we acknowledge the request.
      self.postMessage({ type: 'TRAIN_CANCELLED' });
    }
    
  } catch (error) {
    console.error('[Worker Error]', error);
    self.postMessage({
      type: 'ERROR',
      message: error.message || 'Unknown worker error',
      stack: error.stack || ''
    });
  }
});

console.log('[Training Worker] Loaded and ready');