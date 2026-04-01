// serve.js — local HTTP server for ympl_viewer.html
// Usage:  node serve.js
// Opens:  http://localhost:8080/ympl_viewer.html
//
// Serves all files in this directory. No extra packages needed.

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT = 8080;
const DIR  = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.yaml': 'text/yaml',
  '.yml':  'text/yaml',
  '.txt':  'text/plain',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // ── Anthropic proxy — avoids browser CORS block ──────────────────────────
  if (req.method === 'POST' && urlPath === '/proxy/anthropic') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch (_) { res.writeHead(400); res.end('Bad JSON'); return; }
      const apiKey = payload.apiKey;
      if (!apiKey) { res.writeHead(400); res.end('Missing apiKey'); return; }
      delete payload.apiKey;                          // strip before forwarding
      const data    = JSON.stringify(payload);
      const options = {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers: {
          'Content-Type':      'application/json',
          'Content-Length':    Buffer.byteLength(data),
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
      };
      const proxy = https.request(options, proxyRes => {
        let out = '';
        proxyRes.on('data', c => out += c);
        proxyRes.on('end', () => {
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(out);
        });
      });
      proxy.on('error', err => { res.writeHead(502); res.end(JSON.stringify({ error: err.message })); });
      proxy.write(data);
      proxy.end();
    });
    return;
  }

  // ── Static file server ────────────────────────────────────────────────────
  const file = urlPath === '/' ? '/ympl_viewer.html' : urlPath;
  const abs  = path.join(DIR, file);

  // Prevent directory traversal
  if (!abs.startsWith(DIR)) { res.writeHead(403); res.end(); return; }

  fs.readFile(abs, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(abs).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('YMPL viewer → http://localhost:' + PORT + '/ympl_viewer.html');
  console.log('Press Ctrl+C to stop.');

  // Auto-open in default browser (Windows / Mac / Linux)
  const url = 'http://localhost:' + PORT + '/ympl_viewer.html';
  const { exec } = require('child_process');
  if      (process.platform === 'win32')  exec('start ""  "' + url + '"');
  else if (process.platform === 'darwin') exec('open "' + url + '"');
  else                                     exec('xdg-open "' + url + '"');
});
