'use strict';
// Painel v2: resumo, faturação, despesas, resultado, notificações, exportação e apagamento (RGPD).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'estetica-p2-'));
process.env.DATA_DIR = DIR;
process.env.RATE_LIMIT = 'off';
const { DateTime } = require('luxon');
const { app, hashPassword } = require('../src/server');
const { db, saveSettings } = require('../src/db');

const TZ = 'Europe/Lisbon';
let base, server, cookie;
const at = (date, time) => DateTime.fromISO(`${date}T${time}`, { zone: TZ }).toMillis();
const day = n => DateTime.now().setZone(TZ).plus({ days: n }).toISODate();
async function call(method, url, body, headers = {}) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const adm = (m, u, b) => call(m, '/api/admin' + u, b, { Cookie: cookie, 'X-Requested-With': 'fetch' });

before(async () => {
  db.exec('DELETE FROM staff_services; DELETE FROM services; DELETE FROM categories;');
  db.prepare("INSERT INTO categories(id,name,sort) VALUES (1,'Manicure',1),(2,'Pedicure',2)").run();
  db.prepare("INSERT INTO services(id,category_id,name,description,duration_min,price_cents,price_type,price_note,requires_approval,featured,sort) VALUES(1,1,'Gel','',0,3000,'fixed','',1,0,1),(2,2,'Spa','',0,2000,'fixed','',1,0,2)").run();
  db.prepare('INSERT INTO staff_services VALUES(1,1),(1,2)').run();
  saveSettings({ min_notice_hours: 0, max_advance_days: 120 });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  db.prepare('INSERT INTO admin_users(email,name,password_hash,created_at) VALUES(?,?,?,?)').run('a@teste.pt', 'Adriana', hashPassword('palavra-passe-1'), Date.now());
  const res = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@teste.pt', password: 'palavra-passe-1' }) });
  cookie = res.headers.get('set-cookie').split(';')[0];
});
after(() => server.close());

test('rotas novas exigem sessão', async () => {
  for (const u of ['/dashboard', '/revenue', '/finance/overview', '/expenses', '/inbox', '/inbox/count', '/export/customers']) {
    assert.equal((await call('GET', '/api/admin' + u)).status, 401, u);
  }
  assert.equal((await call('POST', '/api/admin/expenses', { spent_on: day(0), amount_eur: '10' }, { 'X-Requested-With': 'fetch' })).status, 401);
});

test('resumo, faturação e clientes do mês contam só pagamentos registados', async () => {
  const d = day(0);
  await adm('PUT', `/day-slots/${d}`, { times: ['00:05', '00:10', '23:50'] });
  // duas marcações no painel para hoje (já passadas: pagamento de hoje)
  const mk = async (t, svc, name, phone) => (await adm('POST', '/bookings', { service_id: svc, start: at(d, t), name, phone, notify: false })).body.id;
  const b1 = await mk('00:05', 1, 'Rita Teste', '931000001'), b2 = await mk('00:10', 2, 'Sara Teste', '931000002');
  let r = (await adm('GET', '/dashboard')).body;
  assert.equal(r.cards.month_received_cents, 0, 'sem pagamento registado não há faturação');
  assert.equal(r.cards.today >= 2, true);
  await adm('PATCH', `/bookings/${b1}`, { status: 'completed' });
  await adm('PATCH', `/bookings/${b2}`, { status: 'completed' });
  await adm('POST', `/bookings/${b1}/payments`, { amount_eur: '30', paid_on: d, method: 'mbway', request_key: 'k1' });
  await adm('POST', `/bookings/${b2}/payments`, { amount_eur: '20', paid_on: d, method: 'numerario', request_key: 'k2' });
  r = (await adm('GET', '/dashboard')).body;
  assert.equal(r.cards.month_received_cents, 5000);
  assert.equal(r.cards.month_clients, 2);
  for (const range of ['7d', '30d', '12m']) {
    const s = (await adm('GET', '/revenue?range=' + range)).body;
    assert.equal(s.series.length, range === '7d' ? 7 : range === '30d' ? 30 : 12);
    assert.equal(s.series.reduce((a, p) => a + p.cents, 0), 5000, `total ${range}`);
  }
  const f = (await adm('GET', `/finance?from=${d}&to=${d}`)).body;
  assert.deepEqual(f.by_category.map(c => [c.name, c.cents]), [['Manicure', 3000], ['Pedicure', 2000]], 'receitas por categoria');
});

test('despesas: validação, CRUD e resultado operacional estimado', async () => {
  const d = day(0);
  assert.equal((await adm('POST', '/expenses', { spent_on: d, amount_eur: '0' })).status, 422, 'valor zero recusado');
  assert.equal((await adm('POST', '/expenses', { spent_on: 'ontem', amount_eur: '10' })).status, 422, 'data inválida recusada');
  const c = await adm('POST', '/expenses', { spent_on: d, amount_eur: '12,50', category: 'produtos', description: 'Vernizes' });
  assert.equal(c.status, 201);
  let list = (await adm('GET', `/expenses?from=${d}&to=${d}`)).body;
  assert.equal(list.total_cents, 1250);
  assert.equal((await adm('PUT', `/expenses/${c.body.id}`, { spent_on: d, amount_eur: '15', category: 'xpto' })).status, 200);
  list = (await adm('GET', `/expenses?from=${d}&to=${d}`)).body;
  assert.equal(list.list[0].amount_cents, 1500); assert.equal(list.list[0].category, 'outro', 'categoria desconhecida → outro');
  const o = (await adm('GET', '/finance/overview')).body;
  assert.equal(o.month_cents, 5000); assert.equal(o.month_expenses_cents, 1500); assert.equal(o.month_result_cents, 3500);
  assert.equal(o.avg_ticket_cents, 2500, 'média por atendimento pago');
  assert.equal(o.months.length, 12);
  assert.equal((await adm('DELETE', `/expenses/${c.body.id}`)).status, 200);
  assert.equal((await adm('GET', '/finance/overview')).body.month_expenses_cents, 0);
});

test('notificações: pedidos do site aparecem como novos e ficam lidos', async () => {
  const d = day(3);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00'] });
  await adm('POST', '/inbox/seen', {});
  const r = await call('POST', '/api/public/bookings', { service_id: 1, start: at(d, '10:00'), accept_policy: true, name: 'Lara Teste', email: 'lara@exemplo.pt', phone: '931000003' });
  assert.equal(r.status, 201);
  let c = (await adm('GET', '/inbox/count')).body;
  assert.equal(c.unread, 1); assert.ok(c.pending >= 1);
  const inbox = (await adm('GET', '/inbox')).body;
  assert.ok(inbox.items.some(i => i.customer_name === 'Lara Teste' && /Pedido enviado/.test(i.action)));
  await adm('POST', '/inbox/seen', {});
  c = (await adm('GET', '/inbox/count')).body;
  assert.equal(c.unread, 0);
});

test('exportação das clientes e apagamento de dados pessoais (RGPD)', async () => {
  const ex = (await adm('GET', '/export/customers')).body;
  const rita = ex.customers.find(c => c.name === 'Rita Teste');
  assert.ok(rita); assert.equal(rita.paid_cents, 3000); assert.equal(rita.visits, 1);
  assert.equal((await adm('POST', `/customers/${rita.id}/anonymize`, {})).status, 200);
  const c = (await adm('GET', `/customers/${rita.id}`)).body;
  assert.match(c.name, /^Cliente apagada/); assert.equal(c.email, null); assert.ok(!/931000001/.test(c.phone));
  // a faturação mantém-se (registos financeiros anónimos)
  assert.equal((await adm('GET', '/finance/overview')).body.month_cents, 5000);
});
