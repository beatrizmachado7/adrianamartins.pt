'use strict';
// Base de dados para o Netlify (sem servidor próprio): SQLite em WebAssembly/asm.js (sql.js), em memória.
// O ficheiro da base de dados vive no Netlify Blobs; em cada pedido é carregado, usado e, se mudou, guardado.
// Esta camada imita a parte da API do better-sqlite3 que o resto do código usa (prepare/get/all/run, exec,
// transaction, pragma, backup), para que o resto do sistema funcione igual nos dois sítios.
const fs = require('fs');

function createFacade(SQL) {
  if (!SQL) throw new Error('sql.js não foi inicializado (global.__SQLJS).');
  let conn = null, depth = 0;
  const open = bytes => {
    if (conn) try { conn.close(); } catch { /* já fechada */ }
    conn = new SQL.Database(bytes && bytes.length ? bytes : undefined);
    conn.exec('PRAGMA foreign_keys = ON');
    depth = 0;
  };
  open(null);

  const norm = v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : Buffer.isBuffer(v) ? new Uint8Array(v) : v;
  const isPlain = o => o && typeof o === 'object' && !Array.isArray(o) && !Buffer.isBuffer(o) && !(o instanceof Uint8Array);
  function bindArgs(args) {
    if (args.length === 1 && Array.isArray(args[0])) args = args[0];
    if (args.length === 1 && isPlain(args[0])) {
      const o = {};
      for (const [k, v] of Object.entries(args[0])) { const n = norm(v); o['@' + k] = n; o[':' + k] = n; o['$' + k] = n; }
      return o;
    }
    return args.map(norm);
  }
  function query(sql, args, mode) {
    const st = conn.prepare(sql);
    try {
      if (args.length) st.bind(bindArgs(args));
      if (mode === 'get') return st.step() ? st.getAsObject() : undefined;
      if (mode === 'all') { const rows = []; while (st.step()) rows.push(st.getAsObject()); return rows; }
      st.step();
      const changes = conn.getRowsModified();
      const r = conn.exec('SELECT last_insert_rowid() AS id');
      return { changes, lastInsertRowid: r.length ? r[0].values[0][0] : 0 };
    } finally { st.free(); }
  }

  const facade = {
    prepare(sql) {
      return {
        get: (...a) => query(sql, a, 'get'),
        all: (...a) => query(sql, a, 'all'),
        run: (...a) => query(sql, a, 'run')
      };
    },
    exec(sql) { conn.exec(sql); return facade; },
    pragma(s) { try { conn.exec('PRAGMA ' + s); } catch { /* pragmas de ficheiro não se aplicam em memória */ } },
    transaction(fn) {
      const make = begin => (...args) => {
        const nested = depth > 0, name = 'sp' + depth;
        conn.exec(nested ? `SAVEPOINT ${name}` : begin);
        depth++;
        try {
          const r = fn(...args);
          depth--;
          conn.exec(nested ? `RELEASE ${name}` : 'COMMIT');
          return r;
        } catch (e) {
          depth--;
          try { conn.exec(nested ? `ROLLBACK TO ${name}; RELEASE ${name}` : 'ROLLBACK'); } catch { /* já revertida */ }
          throw e;
        }
      };
      const f = make('BEGIN');
      f.deferred = f; f.immediate = make('BEGIN IMMEDIATE'); f.exclusive = make('BEGIN EXCLUSIVE');
      return f;
    },
    async backup(file) { fs.writeFileSync(file, Buffer.from(facade.__export())); },
    close() { try { conn.close(); } catch { /* já fechada */ } },
    // ---- só para o Netlify ----
    __load(bytes) { open(bytes ? new Uint8Array(bytes) : null); },
    __export() { const b = conn.export(); conn.exec('PRAGMA foreign_keys = ON'); return b; },
    __changes() { return conn.exec('SELECT total_changes() AS n')[0].values[0][0]; }
  };
  return facade;
}

module.exports = { createFacade };
