'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = __dirname;
const BASE = 'https://unpkg.com/@echogarden/espeak-ng-emscripten/espeak-ng/emscripten/';

const FILES = [
  'espeak-ng.js',
  'espeak-ng.wasm',
  'espeak-ng.data'
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
})();