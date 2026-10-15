'use strict';
// Versão Netlify (Function + Blobs): várias instâncias a gravar ao mesmo tempo nunca perdem marcações
// nem aceitam duas marcações para a mesma hora (gravação condicional por etag + repetição).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { DateTime } = require('luxon');

const root = path.join(__dirname, '..');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'estetica-nl-'));
const env = { ...process.env, DATA_DIR: DIR, DB_JOURNAL: 'DELETE', RATE_LIMIT: 'off', NODE_OPTIONS: '' };
const PORTS = [4101, 4102, 4103];
let procs = [];
const day = DateTime.now().setZone('Europe/Lisbon').plus({ days: 5 }).toISODate();
const at = t => DateTime.fromISO(`${day}T${t}`, { zone: 'Europe/Lisbon' }).toMillis();

before(async () => {
  execFileSync('node', ['-e', `const {db,saveSettings}=require('./src/db'); saveSettings({ min_notice_hours: 0 });
    const ins=db.prepare('INSERT INTO day_slots(date,time) VALUES(?,?)'); for (const t of ['10:00','11:00','12:00','13:00','14:00','15:00']) ins.run('${day}', t);`], { env, cwd: root });
  procs = PORTS.map(p => spawn('node', ['scripts/netlify-local.js'], { env: { ...env, PORT: String(p) }, cwd: root, stdio: 'ignore' }));
  for (const p of PORTS) for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${p}/api/public/config`); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
});
after(() => procs.forEach(p => p.kill()));

const book = (port, t, n) => fetch(`http://127.0.0.1:${port}/api/public/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ service_id: 1, start: at(t), accept_policy: true, name: `Cliente ${n}`, phone: `9330000${String(n).padStart(2, '0')}`, payment_method: 'mbway' }) }).then(r => r.status);

test('mesma hora pedida em 3 instâncias ao mesmo tempo → só 1 aceite', async () => {
  const st = await Promise.all(PORTS.map((p, i) => book(p, '10:00', i + 1)));
  assert.equal(st.filter(s => s === 201).length, 1, JSON.stringify(st));
  assert.equal(st.filter(s => s === 409).length, 2, JSON.stringify(st));
});

test('horas diferentes em 3 instâncias ao mesmo tempo → nenhuma se perde', async () => {
  const st = await Promise.all([['11:00', 0], ['12:00', 1], ['13:00', 2], ['14:00', 0], ['15:00', 1]].map(([t, i], k) => book(PORTS[i], t, 10 + k)));
  assert.deepEqual(st, [201, 201, 201, 201, 201]);
  const n = execFileSync('node', ['-e', `process.stdout.write(String(require('./src/db').db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='pending'").get().n))`], { env, cwd: root }).toString();
  assert.equal(n, '6');
  // e a hora ocupada desaparece para as outras clientes
  const slots = await (await fetch(`http://127.0.0.1:${PORTS[2]}/api/public/slots?service_id=1&date=${day}`)).json();
  assert.equal(slots.slots.length, 0, 'todas as horas do dia ficaram ocupadas');
});
