/**
 * download-vendor.js — pinned vendor fetcher
 *
 * onnxruntime-web is pinned to ONE version (1.22.0). The 1.22 default bundle
 * (ort.min.js / ort.min.mjs) dynamically imports the JSEP glue at runtime:
 *     ort-wasm-simd-threaded.jsep.mjs  +  ort-wasm-simd-threaded.jsep.wasm
 * The old 1.17-era files (ort-wasm.wasm, ort-wasm-simd.wasm) do not exist in
 * 1.22 — mixing entry/asset versions is what broke the worker.
 *
 * Safety: exact-size verification, atomic writes (.part → rename),
 * redirect-safe, 3 attempts per file, skips files already present & valid,
 * exits non-zero if any required file is missing.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const VENDOR_DIR = path.join(process.cwd(), 'vendor');
const ORT_VERSION = '1.22.0';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

// Exact byte sizes from the onnxruntime-web@1.22.0 package listing.
// If you bump ORT_VERSION, update these (or empty the map to skip the check).
const SIZES = ORT_VERSION === '1.22.0' ? {
  'ort.min.js': 357641,
  'ort.min.mjs': 357568,
  'ort-wasm-simd-threaded.jsep.mjs': 44677,
  'ort-wasm-simd-threaded.jsep.wasm': 21872216,
} : {};

const DEPENDENCIES = [
  {
    name: 'ONNX Runtime Web (ESM — worker)',
    url: ORT_BASE + 'ort.min.mjs',
    dest: 'onnxruntime-web/ort.min.mjs',
    bytes: SIZES['ort.min.mjs'] ?? null,
    required: true,
  },
  {
    name: 'ONNX Runtime Web (IIFE — main thread / demo)',
    url: ORT_BASE + 'ort.min.js',
    dest: 'onnxruntime-web/ort.min.js',
    bytes: SIZES['ort.min.js'] ?? null,
    required: true,
  },
  {
    name: 'ONNX WASM glue (JSEP .mjs)',
    url: ORT_BASE + 'ort-wasm-simd-threaded.jsep.mjs',
    dest: 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs',
    bytes: SIZES['ort-wasm-simd-threaded.jsep.mjs'] ?? null,
    required: true,
  },
  {
    name: 'ONNX WASM binary (JSEP .wasm)',
    url: ORT_BASE + 'ort-wasm-simd-threaded.jsep.wasm',
    dest: 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm',
    bytes: SIZES['ort-wasm-simd-threaded.jsep.wasm'] ?? null,
    required: true,
  },
  {
    name: 'Phonemizer (jsDelivr ESM)',
    url: 'https://cdn.jsdelivr.net/npm/phonemizer@1.2.1/+esm',
    dest: 'phonemizer/phonemizer.esm.js',
    bytes: null,
    required: true,
  },
  {
    name: 'Phonemizer (esm.sh fallback)',
    url: 'https://esm.sh/phonemizer@1.2.1',
    dest: 'phonemizer/phonemizer.esm.sh.js',
    bytes: null,
    required: false,
  },
];

function fetchToFile(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
      timeout: 60000, // socket idle timeout — safe for the ~22 MB wasm on mobile
    }, (res) => {
      // Follow redirects BEFORE opening any file stream.
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume(); // drain
        if (redirects <= 0 || !res.headers.location) return reject(new Error('redirect failed'));
        const next = new URL(res.headers.location, url).href; // handles relative redirects too
        return fetchToFile(next, dest, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = dest + '.part';
      const out = fs.createWriteStream(tmp);
      const total = Number(res.headers['content-length']) || 0;
      const showProgress = total >= 5 * 1024 * 1024;
      let got = 0, nextPct = 10;

      const cleanup = () => { try { fs.unlinkSync(tmp); } catch {} };

      res.on('data', (chunk) => {
        got += chunk.length;
        if (showProgress) {
          const pct = Math.floor((got / total) * 100);
          if (pct >= nextPct) {
            process.stdout.write(`\r   ${pct}% of ${(total / 1048576).toFixed(1)} MB`);
            nextPct = pct + 10;
          }
        }
      });
      res.on('aborted', () => { out.destroy(); cleanup(); reject(new Error('connection aborted mid-download')); });
      res.on('error', (e) => { out.destroy(); cleanup(); reject(e); });
      out.on('error', (e) => { cleanup(); reject(e); });
      out.on('finish', () => {
        out.close(() => {
          try {
            if (showProgress) process.stdout.write('\r   100%                 \n');
            fs.renameSync(tmp, dest); // atomic: no half-written file ever appears at dest
            resolve();
          } catch (e) { cleanup(); reject(e); }
        });
      });
      res.pipe(out);
    });
    req.on('timeout', () => req.destroy(new Error('timeout (60s idle)')));
    req.on('error', reject);
  });
}

function verifyFile(dep, fullPath) {
  const size = fs.statSync(fullPath).size;
  if (dep.bytes != null) {
    if (size !== dep.bytes) {
      throw new Error(`size mismatch: got ${size.toLocaleString()}, expected ${dep.bytes.toLocaleString()} bytes`);
    }
  } else {
    if (size < 512) throw new Error(`suspiciously small (${size} bytes)`);
    const head = fs.readFileSync(fullPath, 'utf8').slice(0, 200).trimStart().toLowerCase();
    if (head.startsWith('<!doctype') || head.startsWith('<html')) {
      throw new Error('got an HTML page instead of JavaScript');
    }
  }
  return size;
}

async function download(dep) {
  const fullPath = path.join(VENDOR_DIR, dep.dest);

  // Idempotent reruns: keep files that already pass verification.
  if (fs.existsSync(fullPath)) {
    try {
      const size = verifyFile(dep, fullPath);
      console.log(`⏭️  Already present & verified (${size.toLocaleString()} bytes)\n`);
      return;
    } catch { /* wrong size / stale version → re-download */ }
  }

  for (let attempt = 1; ; attempt++) {
    try {
      await fetchToFile(dep.url, fullPath);
      const size = verifyFile(dep, fullPath);
      console.log(`✅ Saved: ${dep.dest} (${size.toLocaleString()} bytes)\n`);
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`   ↻ attempt ${attempt} failed (${e.message}) — retrying…`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function main() {
  console.log(`🚀 Vendor download — onnxruntime-web pinned to v${ORT_VERSION}\n`);
  fs.mkdirSync(VENDOR_DIR, { recursive: true });

  const failed = [];
  for (const dep of DEPENDENCIES) {
    const mb = dep.bytes ? ` (~${(dep.bytes / 1048576).toFixed(2)} MB)` : '';
    console.log(`⬇️  ${dep.name}${mb}`);
    try {
      await download(dep);
    } catch (e) {
      console.error(`❌ Failed: ${dep.name} — ${e.message}\n`);
      failed.push(dep);
    }
  }

  // Old-version leftovers: harmless, but flag them so the folder stays clean.
  const STALE = ['ort-wasm.wasm', 'ort-wasm-simd.wasm', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];
  const leftovers = STALE.filter(f => fs.existsSync(path.join(VENDOR_DIR, 'onnxruntime-web', f)));
  if (leftovers.length) {
    console.log(`ℹ️  Old-version leftovers (unused by v${ORT_VERSION}, safe to delete): ${leftovers.join(', ')}\n`);
  }

  const missingRequired = failed.filter(d => d.required);
  if (missingRequired.length) {
    console.error('🛑 Missing REQUIRED files: ' + missingRequired.map(d => d.dest).join(', '));
    console.error('   Fix your network and rerun — the TTS worker will not start without these.');
    process.exitCode = 1;
    return;
  }

  console.log('🎉 All required vendor files present and verified.');
  if (failed.length) console.log('⚠️  Optional files failed: ' + failed.map(d => d.dest).join(', '));
  console.log('📝 Next: hard-reload the page (Cmd/Ctrl+Shift+R) so cached 404s are dropped. No patch step needed.');
}

main();