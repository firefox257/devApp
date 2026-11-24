'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname; // saves next to this script
const BASE = 'https://unpkg.com/onnxruntime-web@1.16.3/dist/';

const FILES = [

  'ort.min.js',
  'ort-wasm.wasm',
  'ort-wasm-simd.wasm',
  'ort-wasm-threaded.wasm',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-threaded.worker.js'
];

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'node' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  console.log('saving to: ' + OUT + '\n');
  let ok = 0;

  for (const name of FILES) {
    process.stdout.write('downloading ' + name + ' ... ');
    try {
      const buf = await get(BASE + name);
      fs.writeFileSync(path.join(OUT, name), buf);
      console.log('OK  ' + (buf.length / 1048576).toFixed(2) + ' MB');
      ok++;
    } catch (e) {
      console.log('FAIL  ' + e.message);
    }
  }

  console.log('\n' + ok + '/' + FILES.length + ' files written.');
  console.log('Now hard-refresh the page.');
})();