// Serve only public game assets and the standalone 3D character preview, on loopback.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = new Set(['/index.html', '/favicon.svg', '/style.css', '/js/engine.js', '/js/render.js', '/js/db.js', '/js/cards.js', '/js/ui.js', '/js/trade.js', '/js/audio.js', '/js/home.js', '/js/admin.js', '/js/cloud-config.js', '/js/cloud.js', '/js/online.js', '/js/practice.js', '/data/players_db.js', '/data/players.sqlite', '/tools/characters.html', '/tools/characters-3d.html', '/tools/characters-3d.css', '/tools/characters-3d.js']);
const previewAsset = /^\/assets\/(?:vendor\/three\/[A-Za-z0-9_.-]+\.(?:js|txt)|characters\/[A-Za-z0-9_.-]+\.(?:glb|txt))$/;
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const name = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!assets.has(name) && !previewAsset.test(name)) { res.writeHead(404); res.end(); return; }
  const file = path.join(root, name);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  const types = {'.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.sqlite':'application/x-sqlite3','.glb':'model/gltf-binary','.txt':'text/plain; charset=utf-8'};
  res.writeHead(200, {'Content-Type':types[path.extname(name)], 'Cache-Control':'no-store'});
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}).listen(8765, '127.0.0.1', () => console.log('Game preview: http://127.0.0.1:8765/tools/characters-3d.html'));
