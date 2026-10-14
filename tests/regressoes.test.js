'use strict';
// Regressões da revisão de outubro 2026: prazos de pedidos pendentes, reagendamento, propostas, expiração, entradas inválidas.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'estetica-reg-'));
process.env.DATA_DIR = DIR;
process.env.RATE_LIMIT = 'off';
const { DateTime } = require('luxon');
const { app, hashPassword } = require('../src/server');
const { db, saveSettings } = require('../src/db');
const C = require('../src/core');

const TZ = 'Europe/Lisbon';
let base, server, cookie;
const at = (date, time) => DateTime.fromISO(`${date}T${time}`, { zone: TZ }).toMillis();
const day = n => DateTime.now().setZone(TZ).plus({ days: n }).toISODate();
async function call(method, url, body, headers = {}) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const adm = (m, u, b) => call(m, '/api/admin' + u, b, { Cookie: cookie, 'X-Requested-With': 'fetch' });
let n = 0;
const book = (start, extra = {}) => { n++; return call('POST', '/api/public/bookings', { service_id: 1, start, accept_policy: true, name: `Cliente Demo ${n}`, email: `reg${n}@exemplo.pt`, phone: `93100${String(n).padStart(4, '0')}`, ...extra }); };

before(async () => {
  db.exec('DELETE FROM staff_services; DELETE FROM services; DELETE FROM categories;');
  db.prepare("INSERT INTO categories(id,name,sort) VALUES (1,'Manicure',1)").run();
  db.prepare("INSERT INTO services(id,category_id,name,description,duration_min,price_cents,price_type,price_note,requires_approval,featured,sort) VALUES(1,1,'Gel','',0,3000,'fixed','',1,0,1)").run();
  db.prepare('INSERT INTO staff_services VALUES(1,1)').run();
  saveSettings({ min_notice_hours: 0, max_advance_days: 120, cancel_limit_hours: 48, reschedule_limit_hours: 48, pending_hold_hours: 24 });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  db.prepare('INSERT INTO admin_users(email,name,password_hash,created_at) VALUES(?,?,?,?)').run('a@teste.pt', 'Adriana', hashPassword('palavra-passe-1'), Date.now());
  const res = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@teste.pt', password: 'palavra-passe-1' }) });
  cookie = res.headers.get('set-cookie').split(';')[0];
});
after(() => server.close());

test('pedido pendente a menos de 48 h pode ser retirado pela cliente; confirmado não', async () => {
  const d = day(1);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'] });
  const t = DateTime.now().setZone(TZ).plus({ hours: 30 });
  const d2 = t.toISODate();
  // um horário a cerca de 30 h (entre 24 h e 48 h), qualquer que seja a hora a que o teste corre
  const hh = t.startOf('hour').toFormat('HH:mm');
  await adm('PUT', `/day-slots/${d2}`, { times: [hh] });
  const slot = at(d2, hh);
  const r = await book(slot);
  assert.equal(r.status, 201); assert.equal(r.body.status, 'pending');
  assert.equal(r.body.can_cancel, true, 'um pedido ainda por confirmar pode ser retirado');
  const c = await call('POST', `/api/public/manage/${r.body.token}/cancel`, {});
  assert.equal(c.status, 200); assert.equal(c.body.status, 'cancelled');
  // confirmado a menos de 48 h → bloqueado online
  const r2 = await book(slot);
  const id = db.prepare('SELECT id FROM bookings WHERE ref=?').get(r2.body.ref).id;
  assert.equal((await adm('POST', `/bookings/${id}/approve`, {})).status, 200);
  const g = await call('GET', `/api/public/manage/${r2.body.token}`);
  assert.equal(g.body.can_cancel, false);
  assert.equal((await call('POST', `/api/public/manage/${r2.body.token}/cancel`, {})).status, 403);
});

test('reagendar uma marcação confirmada mantém-na confirmada (não volta a pedido nem expira)', async () => {
  const d = day(10);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00', '11:00'] });
  const r = await book(at(d, '10:00'));
  const id = db.prepare('SELECT id FROM bookings WHERE ref=?').get(r.body.ref).id;
  await adm('POST', `/bookings/${id}/approve`, {});
  const m = await call('POST', `/api/public/manage/${r.body.token}/reschedule`, { start: at(d, '11:00') });
  assert.equal(m.status, 200); assert.equal(m.body.status, 'confirmed');
  assert.equal(db.prepare('SELECT hold_expires_at h FROM bookings WHERE id=?').get(id).h, null);
});

test('reagendar um pedido pendente não prolonga a reserva', async () => {
  const d = day(11);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00', '11:00'] });
  const r = await book(at(d, '10:00'));
  const id = db.prepare('SELECT id FROM bookings WHERE ref=?').get(r.body.ref).id;
  const before = db.prepare('SELECT hold_expires_at h FROM bookings WHERE id=?').get(id).h;
  await new Promise(res => setTimeout(res, 20));
  const m = await call('POST', `/api/public/manage/${r.body.token}/reschedule`, { start: at(d, '11:00') });
  assert.equal(m.status, 200); assert.equal(m.body.status, 'pending');
  assert.equal(db.prepare('SELECT hold_expires_at h FROM bookings WHERE id=?').get(id).h, before);
});

test('aceitar proposta: recusada se o horário foi bloqueado entretanto ou se a proposta expirou', async () => {
  const d = day(12);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00', '11:00', '12:00'] });
  const r = await book(at(d, '10:00'));
  const id = db.prepare('SELECT id FROM bookings WHERE ref=?').get(r.body.ref).id;
  assert.equal((await adm('POST', `/bookings/${id}/suggest`, { start: at(d, '11:00') })).status, 200);
  assert.equal((await adm('POST', '/blocks', { start_at: at(d, '11:00'), end_at: at(d, '11:00') + 3600000, type: 'ferias' })).status < 300, true);
  const a = await call('POST', `/api/public/manage/${r.body.token}/proposal`, { accept: true });
  assert.equal(a.status, 409, 'não confirma dentro de um bloqueio');
  // proposta expirada
  const r2 = await book(at(d, '12:00'));
  const id2 = db.prepare('SELECT id FROM bookings WHERE ref=?').get(r2.body.ref).id;
  db.prepare('UPDATE bookings SET proposed=1, hold_expires_at=? WHERE id=?').run(Date.now() - 1000, id2);
  const g = await call('GET', `/api/public/manage/${r2.body.token}`);
  assert.equal(g.body.status, 'cancelled', 'ao abrir o link, a proposta expirada já aparece como expirada');
  assert.equal((await call('POST', `/api/public/manage/${r2.body.token}/proposal`, { accept: true })).status, 409);
});

test('pedido expirado: a cliente é avisada uma única vez, mesmo que a expiração aconteça noutro pedido', async () => {
  const d = day(13);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00'] });
  const r = await book(at(d, '10:00'));
  const id = db.prepare('SELECT id FROM bookings WHERE ref=?').get(r.body.ref).id;
  db.prepare('UPDATE bookings SET hold_expires_at=? WHERE id=?').run(Date.now() - 1000, id);
  await call('GET', `/api/public/slots?service_id=1&date=${d}`); // expira aqui
  assert.equal(db.prepare('SELECT status FROM bookings WHERE id=?').get(id).status, 'cancelled');
  await C.runJobs(); await C.runJobs();
  const sent = db.prepare("SELECT COUNT(*) n FROM notifications WHERE booking_id=? AND kind='expired'").get(id);
  assert.equal(sent.n, 1);
});

test('marcação pendente criada no painel não expira sozinha', async () => {
  const d = day(20);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00'] });
  const r = await adm('POST', '/bookings', { service_id: 1, start: at(d, '10:00'), status: 'pending', name: 'Cliente Telefone', phone: '931999999', notify: false });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(db.prepare('SELECT hold_expires_at h FROM bookings WHERE id=?').get(r.body.id).h, null);
});

test('não é possível fechar uma hora com marcação ao passar o dia do horário semanal para horas à mão', async () => {
  const d = day(25);
  db.prepare('DELETE FROM day_slots WHERE date=?').run(d);
  // marcação feita num dia com horário semanal (sem horas à mão)
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00'] });
  const r = await adm('POST', '/bookings', { service_id: 1, start: at(d, '10:00'), name: 'Cliente Semanal', phone: '931888888', notify: false });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  db.prepare('DELETE FROM day_slots WHERE date=?').run(d);
  assert.equal((await adm('PUT', `/day-slots/${d}`, { times: ['15:00'] })).status, 409);
  assert.equal((await adm('PUT', `/day-slots/${d}`, { times: ['10:00', '15:00'] })).status, 200);
});

test('pedidos públicos sem corpo não dão erro 500', async () => {
  const res = await fetch(base + '/api/public/bookings', { method: 'POST' });
  assert.ok(res.status >= 400 && res.status < 500, `estado ${res.status}`);
});

test('serviço novo criado no painel exige confirmação por defeito', async () => {
  const r = await adm('POST', '/services', { name: 'Serviço novo', category_id: 1, price_cents: 1000, price_type: 'fixed', active: true, bookable: true, staff: [1] });
  assert.ok(r.status < 300, JSON.stringify(r.body));
  assert.equal(db.prepare("SELECT requires_approval r FROM services WHERE name='Serviço novo'").get().r, 1);
});
