'use strict';
// Sinal de 50% e forma de pagamento escolhida pela cliente (MB WAY, transferência, em mão).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'estetica-pag-'));
process.env.DATA_DIR = DIR;
process.env.RATE_LIMIT = 'off';
const { DateTime } = require('luxon');
const { app, hashPassword } = require('../src/server');
const { db, saveSettings, getSettings } = require('../src/db');
const N = require('../src/notify');

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
const book = (start, extra = {}) => { n++; return call('POST', '/api/public/bookings', { service_id: 1, start, accept_policy: true, name: `Cliente Pag ${n}`, email: `pag${n}@exemplo.pt`, phone: `93200${String(n).padStart(4, '0')}`, ...extra }); };

before(async () => {
  db.exec('DELETE FROM staff_services; DELETE FROM services; DELETE FROM categories;');
  db.prepare("INSERT INTO categories(id,name,sort) VALUES (1,'Manicure',1)").run();
  db.prepare("INSERT INTO services(id,category_id,name,description,duration_min,price_cents,price_type,price_note,requires_approval,featured,sort) VALUES(1,1,'Gel','',0,3000,'fixed','',1,0,1),(2,1,'Consulta','',0,NULL,'consult','',1,0,2)").run();
  db.prepare('INSERT INTO staff_services VALUES(1,1),(1,2)').run();
  saveSettings({ min_notice_hours: 0, max_advance_days: 120, iban: '' });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  db.prepare('INSERT INTO admin_users(email,name,password_hash,created_at) VALUES(?,?,?,?)').run('a@teste.pt', 'Adriana', hashPassword('palavra-passe-1'), Date.now());
  const res = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@teste.pt', password: 'palavra-passe-1' }) });
  cookie = res.headers.get('set-cookie').split(';')[0];
});
after(() => server.close());

test('dados públicos incluem o sinal e o MB WAY; mensagem de aniversário nova', async () => {
  const c = (await call('GET', '/api/public/config')).body;
  assert.equal(c.deposit_enabled, true); assert.equal(c.deposit_percent, 50); assert.ok(c.mbway_number);
  assert.match(getSettings().birthday_message, /\{nome\}/); assert.match(getSettings().birthday_message, /\{profissional\}/);
  assert.match(c.booking_policy, /sinal de 50%/);
});

test('a forma de pagamento escolhida fica na marcação, com sinal de 50%', async () => {
  const d = day(5);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00', '11:00', '12:00', '13:00'] });
  const r = await book(at(d, '10:00'), { payment_method: 'mbway' });
  assert.equal(r.status, 201);
  assert.equal(r.body.payment_method, 'mbway'); assert.equal(r.body.deposit_cents, 1500); assert.equal(r.body.paid_cents, 0);
  const m = await book(at(d, '11:00'), { payment_method: 'mao' });
  assert.equal(m.body.payment_method, 'mao');
  // transferência sem IBAN configurado não é aceite (fica sem indicação); valor desconhecido também
  assert.equal((await book(at(d, '12:00'), { payment_method: 'transferencia' })).body.payment_method, '');
  assert.equal((await book(at(d, '13:00'), { payment_method: 'bitcoin' })).body.payment_method, '');
  const g = await call('GET', `/api/public/manage/${m.body.token}`);
  assert.equal(g.body.payment_method, 'mao');
});

test('serviço sem preço: sinal a combinar (sem valor)', async () => {
  const d = day(6);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00'] });
  const r = await call('POST', '/api/public/bookings', { service_id: 2, start: at(d, '10:00'), accept_policy: true, name: 'Cliente Consulta', email: 'consulta@exemplo.pt', phone: '932999999', payment_method: 'mbway' });
  assert.equal(r.status, 201); assert.equal(r.body.deposit_cents, null);
});

test('painel: registar o sinal num pedido pendente, aprovar e pagar o restante', async () => {
  const d = day(7);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00'] });
  const r = await book(at(d, '10:00'), { payment_method: 'mbway' });
  const id = db.prepare('SELECT id FROM bookings WHERE ref=?').get(r.body.ref).id;
  let b = (await adm('GET', `/bookings/${id}`)).body;
  assert.equal(b.payment_method, 'mbway'); assert.equal(b.deposit_cents, 1500);
  const p = await adm('POST', `/bookings/${id}/payments`, { amount_eur: '15', method: 'mbway', note: 'Sinal', request_key: 'sinal-1' });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  assert.equal((await call('GET', `/api/public/manage/${r.body.token}`)).body.paid_cents, 1500);
  await adm('POST', `/bookings/${id}/approve`, {});
  await adm('POST', `/bookings/${id}/payments`, { amount_eur: '15', method: 'numerario', request_key: 'resto-1' });
  b = (await adm('GET', `/bookings/${id}`)).body;
  assert.equal(b.paid_cents, 3000); assert.equal(b.status, 'confirmed');
  // a Adriana pode corrigir a forma de pagamento
  b = (await adm('PATCH', `/bookings/${id}`, { payment_method: 'mao' })).body;
  assert.equal(b.payment_method, 'mao');
});

test('email do pedido inclui as instruções do sinal (MB WAY e referência)', async () => {
  const d = day(8);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00'] });
  const r = await book(at(d, '10:00'), { payment_method: 'mbway' });
  const id = db.prepare('SELECT id FROM bookings WHERE ref=?').get(r.body.ref).id;
  await N.notifyBooking('pending', id, { token: 'x' });
  const mail = db.prepare("SELECT body FROM notifications WHERE booking_id=? AND kind='pending' ORDER BY id DESC").get(id).body;
  assert.match(mail, /sinal de 15,00 €/); assert.match(mail, /MB WAY para o número/); assert.ok(mail.includes(r.body.ref));
});

test('IBAN: validado e formatado; com IBAN, a transferência passa a ser aceite', async () => {
  assert.equal((await adm('PUT', '/settings', { iban: 'PT50 123' })).status, 422);
  assert.equal((await adm('PUT', '/settings', { iban: 'pt50000201231234567890154' })).status, 200);
  assert.equal(getSettings().iban, 'PT50 0002 0123 1234 5678 9015 4');
  const d = day(9);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00'] });
  assert.equal((await book(at(d, '10:00'), { payment_method: 'transferencia' })).body.payment_method, 'transferencia');
});

test('guardar textos no painel mantém os parágrafos', async () => {
  assert.equal((await adm('PUT', '/settings', { birthday_message: 'Olá {nome}!\r\n\r\nBeijinho,\n{profissional}' })).status, 200);
  assert.equal(getSettings().birthday_message, 'Olá {nome}!\n\nBeijinho,\n{profissional}');
});
