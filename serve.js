// serve.js — local HTTP server for ympl_viewer.html
// Usage:  node serve.js
// Opens:  http://localhost:8080/ympl_viewer.html
//
// Serves all files in this directory. No extra packages needed.

const http = require('http');
const fs   = require('fs');
const path = require('path');

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
  const file    = urlPath === '/' ? '/ympl_viewer.html' : urlPath;
  const abs     = path.join(DIR, file);

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
