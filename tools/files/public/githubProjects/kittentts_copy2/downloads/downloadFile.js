const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { pipeline } = require('node:stream/promises');

// Put your target file URL at the top



//const FILE_URL = 'https://kvongcmehsanalibrary.wordpress.com/wp-content/uploads/2021/07/harrypotter.pdf';
const FILE_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.mjs';

//curl -L -o vendor/onnxruntime-web/ort.min.mjs \
 // https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.mjs



const OUTPUT_DIR = './';

function requestUrl(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      reject(new Error('Too many redirects.'));
      return;
    }

    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(parsed, (res) => {
      // Handle redirects (301, 302, 307, 308)
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        res.resume(); // Drain response body
        const nextUrl = new URL(res.headers.location, parsed).toString();
        requestUrl(nextUrl, maxRedirects - 1).then(resolve, reject);
        return;
      }

      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }

      resolve(res);
    });

    req.on('error', reject);
  });
}

async function downloadFile(url, outputDir) {
  const response = await requestUrl(url);

  const urlPath = new URL(url).pathname;
  const filename = path.basename(urlPath) || 'downloaded_file';
  const destinationPath = path.join(outputDir, filename);

  await fs.promises.mkdir(outputDir, { recursive: true });

  const fileStream = fs.createWriteStream(destinationPath);
  await pipeline(response, fileStream);

  console.log(`Saved to: ${destinationPath}`);
}

downloadFile(FILE_URL, OUTPUT_DIR).catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
