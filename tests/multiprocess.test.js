'use strict';
// Três processos do servidor sobre a MESMA base de dados, pedidos simultâneos para o mesmo horário.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { DateTime } = require('luxon');

test('marcações simultâneas em 3 processos diferentes → apenas 1 é aceite', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estetica-mp-'));
  const env = { ...process.env, DATA_DIR: dir, JOBS: 'off', RATE_LIMIT: 'off', SEED_SAMPLE_HOURS: '1' };
  require('child_process').execFileSync('node', ['-e', "require('./src/db')"], { env, cwd: path.join(__dirname, '..') });
  const ports = [3901, 3902, 3903];
  const procs = ports.map(p => spawn('node', ['index.js'], { env: { ...env, PORT: String(p) }, cwd: path.join(__dirname, '..'), stdio: 'ignore' }));
  try {
    for (const p of ports) {
      for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${p}/api/public/config`); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    }
    let d = DateTime.now().setZone('Europe/Lisbon').startOf('day').plus({ days: 4 });
    while (d.weekday !== 3) d = d.plus({ days: 1 });
    const start = DateTime.fromISO(`${d.toISODate()}T16:00`, { zone: 'Europe/Lisbon' }).toMillis();
    for (let round = 0; round < 5; round++) {
      const s = start; // sempre o mesmo horário
      const res = await Promise.all(Array.from({ length: 30 }, (_, i) => fetch(`http://127.0.0.1:${ports[i % 3]}/api/public/bookings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: 1, start: s, accept_policy: true, name: `Cliente ${round}-${i}`, email: `c${round}x${i}@exemplo.pt`, phone: '912345678' })
      }).then(r => r.status)));
      const created = res.filter(x => x === 201).length;
      assert.equal(created, round === 0 ? 1 : 0, `ronda ${round}: ${created} marcações criadas`);
      assert.ok(res.every(x => x === 201 || x === 409), 'sem erros inesperados: ' + res.join(','));
    }
    const Database = require('better-sqlite3');
    const db = new Database(path.join(dir, 'estetica.db'), { readonly: true });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM bookings WHERE status IN ('pending','confirmed')").get().n, 1);
    db.close();
  } finally { procs.forEach(p => p.kill()); }
});
