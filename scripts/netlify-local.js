'use strict';
// Simula o Netlify no computador (para testes): páginas da pasta public + a Netlify Function do servidor,
// com um "Netlify Blobs" falso guardado em ficheiros (a base de dados fica em DATA_DIR/estetica.db).
// Uso: DATA_DIR=/tmp/x PORT=3990 node scripts/netlify-local.js
const fs = require('fs'), path = require('path'), crypto = require('crypto'), http = require('http');
const express = require('express');

const PORT = Number(process.env.PORT || 3990);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DIRS = { data: DATA_DIR, uploads: path.join(DATA_DIR, 'blobs-fotografias') };

function fileStore(dir, mapKey = k => k) {
  const file = key => path.join(dir, mapKey(key));
  const lock = async () => { for (;;) { try { fs.mkdirSync(path.join(dir, '.lock')); return; } catch { await new Promise(r => setTimeout(r, 3)); } } };
  const unlock = () => fs.rmdirSync(path.join(dir, '.lock'));
  const etagOf = buf => crypto.createHash('sha1').update(buf).digest('hex');
  const store = {
    async getWithMetadata(key, o = {}) {
      const f = file(key); if (!fs.existsSync(f)) return null;
      const buf = fs.readFileSync(f), meta = fs.existsSync(f + '.meta') ? JSON.parse(fs.readFileSync(f + '.meta', 'utf8')) : {};
      return { data: o.type === 'arrayBuffer' ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) : buf.toString(), etag: etagOf(buf), metadata: meta };
    },
    async get(key, o) { const r = await store.getWithMetadata(key, o); return r ? r.data : null; },
    async set(key, value, o = {}) {
      fs.mkdirSync(path.dirname(file(key)), { recursive: true });
      await lock();
      try {
        const f = file(key), exists = fs.existsSync(f);
        if (o.onlyIfNew && exists) return { modified: false };
        if (o.onlyIfMatch && (!exists || etagOf(fs.readFileSync(f)) !== o.onlyIfMatch)) return { modified: false };
        const buf = Buffer.from(typeof value === 'string' ? value : new Uint8Array(value));
        fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f);
        if (o.metadata) fs.writeFileSync(f + '.meta', JSON.stringify(o.metadata));
        return { modified: true, etag: etagOf(buf) };
      } finally { unlock(); }
    },
    async list({ prefix = '' } = {}) {
      const out = [], walk = (d, rel) => { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d)) { const p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) { if (n !== '.lock') walk(p, r); } else if (!n.endsWith('.meta') && !n.endsWith('.tmp')) out.push({ key: r }); } };
      walk(dir, ''); return { blobs: out.filter(b => b.key.startsWith(prefix)) };
    },
    async delete(key) { try { fs.unlinkSync(file(key)); } catch { /* não existe */ } }
  };
  return store;
}
fs.mkdirSync(DIRS.uploads, { recursive: true });
global.__BLOBS = { data: fileStore(DIRS.data, k => k === 'estetica.sqlite' ? 'estetica.db' : k), uploads: fileStore(DIRS.uploads) };

const apiModule = import('../netlify/functions/api.js'); // Netlify Function moderna (Request → Response)
const app = express();
app.get(['/painel', '/painel/'], (req, res) => res.redirect(302, '/admin/'));
app.get('/avaliacoes.html', (req, res) => res.redirect(301, '/#fb-sec'));
app.get('/sobre.html', (req, res) => res.redirect(301, '/espaco.html'));
app.get('/precario.html', (req, res) => res.redirect(301, '/servicos.html'));
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));
app.use(['/api', '/uploads', '/sitemap.xml', '/robots.txt'], express.raw({ type: () => true, limit: '70mb' }), async (req, res) => {
  const { default: fn } = await apiModule;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, [].concat(v).join(', '));
  headers.set('x-forwarded-proto', 'http');
  const hasBody = !['GET', 'HEAD'].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length;
  const request = new Request(`http://localhost:${PORT}${req.originalUrl}`, { method: req.method, headers, body: hasBody ? req.body : undefined });
  const r = await fn(request, { ip: req.socket.remoteAddress });
  res.status(r.status);
  r.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
  const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await r.arrayBuffer()));
});
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
http.createServer(app).listen(PORT, () => console.log(`Netlify (simulado) em http://localhost:${PORT}`));
