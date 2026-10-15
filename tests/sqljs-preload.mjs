// Pré-carrega o sql.js para correr os testes com o motor do Netlify: DB_DRIVER=sqljs NODE_OPTIONS=--import=./tests/sqljs-preload.mjs npm test
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.__SQLJS = await require('sql.js/dist/sql-asm.js')();
