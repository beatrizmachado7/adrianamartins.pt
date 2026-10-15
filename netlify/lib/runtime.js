'use strict';
// Liga o sistema ao Netlify: base de dados (ficheiro SQLite) e fotografias no Netlify Blobs.
// Em cada pedido: carrega a base de dados → corre o pedido → se algo mudou, guarda.
// Proteção contra escritas em simultâneo: a gravação só é aceite se ninguém tiver gravado entretanto (etag);
// se alguém gravou, o pedido é repetido sobre a versão mais recente (assim nunca há duas marcações na mesma hora).
process.env.DB_DRIVER = 'sqljs';
process.env.DATA_DIR = process.env.DATA_DIR || '/tmp/estetica';
process.env.JOBS = 'off';
process.env.BACKUPS = 'off';
if (!process.env.TRUST_PROXY) process.env.TRUST_PROXY = 'true';

const DB_KEY = 'estetica.sqlite';
let mods = null, booting = null, queue = Promise.resolve();

// armazenamento: Netlify Blobs (ou, nos testes locais, um substituto em global.__BLOBS)
function stores() {
  if (global.__BLOBS) return global.__BLOBS;
  const { getStore } = require('@netlify/blobs');
  return { data: getStore({ name: 'estetica-dados', consistency: 'strong' }), uploads: getStore({ name: 'estetica-fotografias', consistency: 'strong' }) };
}

async function boot() {
  if (mods) return mods;
  booting ||= (async () => {
    global.__SQLJS = await require('sql.js/dist/sql-asm.js')();
    const up = () => stores().uploads;
    global.__UPLOAD_STORE = {
      async set(name, buf, type) { await up().set(name, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), { metadata: { type } }); },
      async get(name) {
        const r = await up().getWithMetadata(name, { type: 'arrayBuffer' });
        return r ? { data: Buffer.from(r.data), type: r.metadata && r.metadata.type } : null;
      }
    };
    const dbm = require('../../src/db');
    const server = require('../../src/server');
    const core = require('../../src/core');
    mods = { dbm, server, core };
    return mods;
  })();
  return booting;
}

// primeira publicação: cria a conta do painel a partir de ADMIN_EMAIL + ADMIN_PASSWORD (só se ainda não houver nenhuma)
function ensureAdmin({ dbm, server }) {
  const { db } = dbm;
  if (db.prepare('SELECT COUNT(*) n FROM admin_users').get().n) return;
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase(), pw = process.env.ADMIN_PASSWORD || '';
  if (!email || pw.length < 10) return;
  db.prepare('INSERT INTO admin_users(email,name,password_hash,created_at) VALUES(?,?,?,?)')
    .run(email, process.env.ADMIN_NAME || 'Adriana Martins', server.hashPassword(pw), Date.now());
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// corre fn() com a base de dados carregada; guarda se mudou; repete se houver conflito
async function withDb(fn) {
  const m = await boot();
  const run = async () => {
    const data = stores().data;
    for (let attempt = 0; attempt < 6; attempt++) {
      const cur = await data.getWithMetadata(DB_KEY, { type: 'arrayBuffer', consistency: 'strong' });
      m.dbm.db.__load(cur ? new Uint8Array(cur.data) : null);
      m.dbm.init();
      const before = m.dbm.db.__changes();
      // chave secreta dos links privados: fica guardada na base de dados (é igual em todas as instâncias)
      let key = m.dbm.db.prepare("SELECT v FROM app_meta WHERE k='app_secret'").get();
      if (!key) { key = { v: require('crypto').randomBytes(32).toString('hex') }; m.dbm.db.prepare("INSERT INTO app_meta(k,v) VALUES('app_secret',?)").run(key.v); }
      global.__APP_SECRET = key.v;
      ensureAdmin(m);
      const result = await fn(m);
      if (cur && m.dbm.db.__changes() === before) return result; // só leitura: nada a guardar
      const bytes = m.dbm.db.__export();
      const w = await data.set(DB_KEY, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
      if (!w || w.modified !== false) return result;
      await sleep(40 * (attempt + 1) + Math.random() * 60); // outra pessoa gravou entretanto: repetir sobre a versão nova
    }
    throw Object.assign(new Error('Muitos pedidos ao mesmo tempo. Tenta outra vez dentro de momentos.'), { status: 503 });
  };
  // dentro da mesma instância, um pedido de cada vez
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

module.exports = { withDb, boot, stores, DB_KEY };
