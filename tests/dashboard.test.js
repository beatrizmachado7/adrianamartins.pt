'use strict';
// Testes do dashboard de gestão: fluxo completo, concorrência, pagamentos, clientes, acesso e persistência.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'estetica-dash-'));
process.env.DATA_DIR = DIR;
process.env.RATE_LIMIT = 'off';
const { DateTime } = require('luxon');
const { app, hashPassword } = require('../src/server');
const { db, saveSettings, DB_FILE } = require('../src/db');
const C = require('../src/core');
const T = require('../src/tokens');

const TZ = 'Europe/Lisbon';
let base, server, cookie;
const at = (date, time) => DateTime.fromISO(`${date}T${time}`, { zone: TZ }).toMillis();
const day = n => DateTime.now().setZone(TZ).plus({ days: n }).toISODate();
async function call(method, url, body, headers = {}) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const adm = (m, u, b) => call(m, '/api/admin' + u, b, { Cookie: cookie, 'X-Requested-With': 'fetch' });
const client = i => ({ name: `Cliente Demo ${i}`, email: `demo${i}@exemplo.pt`, phone: `93000${String(i).padStart(4, '0')}` });
const publicBook = (service_id, start, i, extra = {}) => call('POST', '/api/public/bookings', { service_id, start, accept_policy: true, ...client(i), ...extra });
const deepHasKey = (o, k) => o && typeof o === 'object' && (k in o || Object.values(o).some(v => deepHasKey(v, k)));

before(async () => {
  db.exec('DELETE FROM staff_services; DELETE FROM services; DELETE FROM categories;');
  db.prepare("INSERT INTO categories(id,name,sort) VALUES (1,'Manicure',1)").run();
  const ins = db.prepare("INSERT INTO services(id,category_id,name,description,duration_min,price_cents,price_type,price_note,requires_approval,featured,sort) VALUES(?,?,?,'',0,?,'fixed','',?,0,?)");
  [[1, 'Gel', 3000, 0], [2, 'Lash (aprovação)', 4000, 1], [3, 'Sem preço', null, 0]].forEach(([id, n, p, ap]) => { ins.run(id, 1, n, p, ap, id); db.prepare('INSERT INTO staff_services VALUES(1,?)').run(id); });
  saveSettings({ min_notice_hours: 0, max_advance_days: 120 });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  db.prepare('INSERT INTO admin_users(email,name,password_hash,created_at) VALUES(?,?,?,?)').run('adriana@teste.pt', 'Adriana', hashPassword('palavra-passe-1'), Date.now());
  const res = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'adriana@teste.pt', password: 'palavra-passe-1' }) });
  cookie = res.headers.get('set-cookie').split(';')[0];
});
after(() => server.close());

test('fluxo completo: pedido no site → aprovação → agenda → conclusão → pagamento → histórico da cliente', async () => {
  const d = day(3);
  assert.equal((await adm('PUT', `/day-slots/${d}`, { times: ['10:00', '11:00', '12:00'] })).status, 200);
  let ov = (await adm('GET', `/overview?date=${d}`)).body;
  assert.equal(ov.cards.available, 3, '3 horários disponíveis');
  // 1) pedido feito pela cliente no site (serviço com confirmação manual)
  const r = await publicBook(2, at(d, '11:00'), 1);
  assert.equal(r.status, 201); assert.equal(r.body.status, 'pending');
  ov = (await adm('GET', `/overview?date=${d}`)).body;
  assert.equal(ov.cards.pending, 1, 'aparece como pendente');
  assert.equal(ov.cards.available, 2, 'o horário fica reservado enquanto pendente');
  const id = ov.pending[0].id;
  // 2) aprovação → confirmada e na agenda de imediato
  const ap = await adm('POST', `/bookings/${id}/approve`, {});
  assert.equal(ap.status, 200); assert.equal(ap.body.status, 'confirmed');
  ov = (await adm('GET', `/overview?date=${d}`)).body;
  assert.equal(ov.cards.confirmed, 1); assert.equal(ov.cards.expected_cents, 4000, 'valor previsto = preço acordado');
  assert.ok(ov.board.find(t => t.time === '11:00').state === 'ocupado');
  const pubSlots = (await call('GET', `/api/public/slots?service_id=1&date=${d}`)).body.slots.map(s => s.time);
  assert.deepEqual(pubSlots, ['10:00', '12:00'], 'site deixa de mostrar o horário');
  // 3) o atendimento acontece (simula a passagem do tempo) e é concluído
  assert.equal((await adm('PATCH', `/bookings/${id}`, { status: 'completed' })).status, 422, 'não se conclui antes da hora');
  db.prepare('UPDATE bookings SET start_at=start_at-?, end_at=end_at-? WHERE id=?').run(4 * 86400000, 4 * 86400000, id);
  const done = await adm('PATCH', `/bookings/${id}`, { status: 'completed' });
  assert.equal(done.body.status, 'completed');
  // concluída ≠ paga
  let fin = (await adm('GET', `/finance?from=${day(-3)}&to=${day(0)}`)).body;
  assert.equal(fin.received_cents, 0, 'concluída não conta como recebida');
  assert.equal(fin.outstanding_cents, 4000); assert.equal(fin.outstanding[0].id, id);
  // 4) pagamento
  const key = 'k-' + Date.now();
  const p1 = await adm('POST', `/bookings/${id}/payments`, { amount_eur: '40,00', method: 'mbway', request_key: key });
  assert.equal(p1.status, 201);
  const p2 = await adm('POST', `/bookings/${id}/payments`, { amount_eur: '40,00', method: 'mbway', request_key: key });
  assert.equal(p2.status, 200); assert.equal(p2.body.duplicate, true, 'mesma chave → não duplica');
  const p3 = await adm('POST', `/bookings/${id}/payments`, { amount_eur: '5', method: 'numerario', request_key: key + 'x' });
  assert.equal(p3.status, 409, 'não ultrapassa o preço acordado sem confirmação');
  fin = (await adm('GET', `/finance?from=${day(0)}&to=${day(0)}`)).body;
  assert.equal(fin.received_cents, 4000); assert.equal(fin.payments.length, 1);
  assert.equal(fin.by_service[0].cents, 4000);
  const fin2 = (await adm('GET', `/finance?from=${day(-3)}&to=${day(0)}`)).body;
  assert.equal(fin2.outstanding_cents, 0, 'já não está por receber');
  // 5) histórico da cliente e da marcação
  const det = (await adm('GET', `/bookings/${id}`)).body;
  const actions = det.events.map(e => e.action);
  for (const a of ['Pedido enviado pelo site', 'Pedido aprovado', 'Estado: Concluída', 'Pagamento registado']) assert.ok(actions.includes(a), 'histórico: ' + a);
  const cust = (await adm('GET', `/customers/${det.customer_id}`)).body;
  assert.equal(cust.visits, 1); assert.ok(cust.last_visit); assert.equal(cust.paid_cents, 4000);
  assert.equal(cust.services[0].name, 'Lash (aprovação)');
  // anular pagamento: fica no histórico e deixa de contar
  assert.equal((await adm('POST', `/payments/${p1.body.id}/void`, { reason: 'teste' })).status, 200);
  assert.equal((await adm('GET', `/finance?from=${day(0)}&to=${day(0)}`)).body.received_cents, 0);
  assert.equal((await adm('POST', `/payments/${p1.body.id}/void`, { reason: 'teste' })).status, 409);
});

test('aprovações simultâneas e reservas simultâneas: o mesmo horário nunca fica duas vezes', async () => {
  const d = day(4);
  await adm('PUT', `/day-slots/${d}`, { times: ['15:00', '16:00'] });
  const r = await publicBook(2, at(d, '15:00'), 2);
  const id = (await adm('GET', '/bookings?status=pending')).body.find(b => b.start_at === at(d, '15:00')).id;
  const res = await Promise.all([1, 2, 3].map(() => adm('POST', `/bookings/${id}/approve`, {})));
  assert.equal(res.filter(x => x.status === 200).length, 1, 'só uma aprovação');
  assert.ok(r.status === 201);
  // 20 marcações em simultâneo (site + painel) para as 16:00
  const all = await Promise.all(Array.from({ length: 20 }, (_, i) => i % 2 ? publicBook(1, at(d, '16:00'), 50 + i) : adm('POST', '/bookings', { service_id: 1, start: at(d, '16:00'), ...client(80 + i) })));
  assert.equal(all.filter(x => x.status === 201).length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM bookings WHERE start_at=? AND status IN ('pending','confirmed')").get(at(d, '16:00')).n, 1);
});

test('aprovar revalida o horário: bloqueado entretanto → recusa a aprovação', async () => {
  const d = day(5);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00'] });
  await publicBook(2, at(d, '10:00'), 3);
  const id = (await adm('GET', '/bookings?status=pending')).body.find(b => b.start_at === at(d, '10:00')).id;
  await adm('POST', '/blocks', { type: 'bloqueio', start_at: at(d, '10:00'), end_at: at(d, '10:00') + 60000 });
  const ap = await adm('POST', `/bookings/${id}/approve`, {});
  assert.equal(ap.status, 409); assert.match(ap.body.error, /bloqueado/);
});

test('sugerir outro horário: o pedido muda, fica reservado e a cliente aceita pelo link', async () => {
  const d = day(6);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00', '14:00'] });
  const r = await publicBook(2, at(d, '10:00'), 4);
  const b = (await adm('GET', '/bookings?status=pending')).body.find(x => x.ref === r.body.ref);
  const s = await adm('POST', `/bookings/${b.id}/suggest`, { start: at(d, '14:00'), message: 'Pode ser à tarde?' });
  assert.equal(s.status, 200); assert.equal(s.body.proposed, 1); assert.equal(s.body.start_at, at(d, '14:00'));
  assert.equal(s.body.notified, 'not_configured', 'sem email configurado: não é simulado como enviado');
  const slots = (await call('GET', `/api/public/slots?service_id=1&date=${d}`)).body.slots.map(x => x.time);
  assert.deepEqual(slots, ['10:00'], '10:00 libertado, 14:00 reservado');
  const m = (await call('GET', `/api/public/manage/${r.body.token}`)).body;
  assert.equal(m.proposed, true);
  const acc = await call('POST', `/api/public/manage/${r.body.token}/proposal`, { accept: true });
  assert.equal(acc.body.status, 'confirmed');
  assert.ok((await adm('GET', `/bookings/${b.id}`)).body.events.some(e => e.action === 'Aceitou o horário sugerido'));
});

test('reagendar e cancelar atualizam a disponibilidade e ficam no histórico', async () => {
  const d = day(7);
  await adm('PUT', `/day-slots/${d}`, { times: ['09:00', '10:00', '11:00'] });
  const c = await adm('POST', '/bookings', { service_id: 1, start: at(d, '09:00'), name: 'Cliente Demo Telefone', phone: '931112223', channel: 'Telefone' });
  assert.equal(c.status, 201);
  const mv = await adm('POST', `/bookings/${c.body.id}/move`, { start: at(d, '11:00') });
  assert.equal(mv.status, 200);
  let free = (await adm('GET', `/slots?date=${d}`)).body.map(t => t.time);
  assert.deepEqual(free, ['09:00', '10:00']);
  assert.equal((await adm('POST', `/bookings/${c.body.id}/move`, { start: at(d, '11:00') + 0 })).status, 200, 'mesmo horário da própria marcação é aceite');
  const other = await adm('POST', '/bookings', { service_id: 1, start: at(d, '10:00'), name: 'Outra Pessoa', phone: '931112299' });
  assert.equal((await adm('POST', `/bookings/${c.body.id}/move`, { start: at(d, '10:00') })).status, 409, 'não reagenda para horário ocupado');
  assert.equal((await adm('PATCH', `/bookings/${other.body.id}`, { status: 'cancelled', reason: 'Desmarcou por telefone' })).status, 200);
  free = (await adm('GET', `/slots?date=${d}`)).body.map(t => t.time);
  assert.deepEqual(free, ['09:00', '10:00'], 'cancelamento liberta o horário');
  const ev = (await adm('GET', `/bookings/${c.body.id}`)).body.events.map(e => e.action);
  assert.ok(ev.includes('Marcação criada no painel') && ev.includes('Reagendada'));
});

test('bloquear manualmente um horário remove-o do site e do painel', async () => {
  const d = day(8);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00', '11:00'] });
  const b = await adm('POST', '/blocks', { type: 'folga', start_at: at(d, '11:00'), end_at: at(d, '11:00') + 60000, reason: 'Consulta' });
  assert.equal(b.status, 201);
  assert.deepEqual((await call('GET', `/api/public/slots?service_id=1&date=${d}`)).body.slots.map(s => s.time), ['10:00']);
  assert.equal((await adm('GET', `/agenda/day?date=${d}`)).body.board.find(t => t.time === '11:00').state, 'bloqueado');
  assert.equal((await publicBook(1, at(d, '11:00'), 9)).status, 409);
  await adm('DELETE', `/blocks/${b.body.id}`);
  assert.equal((await call('GET', `/api/public/slots?service_id=1&date=${d}`)).body.slots.length, 2);
});

test('clientes: reutilizar ficha, detetar duplicados por telefone/email (nunca só pelo nome) e juntar', async () => {
  const d = day(9);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00', '11:00', '12:00', '13:00'] });
  const a = await adm('POST', '/bookings', { service_id: 1, start: at(d, '10:00'), name: 'Maria Silva', phone: '912 000 111' });
  assert.equal(a.status, 201);
  const dup = await adm('POST', '/bookings', { service_id: 1, start: at(d, '11:00'), name: 'M. Silva', phone: '+351912000111' });
  assert.equal(dup.status, 409); assert.equal(dup.body.code, 'POSSIBLE_DUPLICATE'); assert.equal(dup.body.matches.length, 1);
  const cid = dup.body.matches[0].id;
  const reuse = await adm('POST', '/bookings', { service_id: 1, start: at(d, '11:00'), customer_id: cid });
  assert.equal(reuse.status, 201);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM bookings WHERE customer_id=?").get(cid).n, 2, 'mesma ficha reutilizada');
  const sameName = await adm('POST', '/bookings', { service_id: 1, start: at(d, '12:00'), name: 'Maria Silva', phone: '965 555 444' });
  assert.equal(sameName.status, 201, 'mesmo nome com outro telefone → outra pessoa, sem bloqueio');
  let groups = (await adm('GET', '/customers/duplicates')).body;
  assert.ok(!groups.some(g => g.every(c => c.name === 'Maria Silva')), 'o nome igual não gera duplicado');
  // duplicado real criado explicitamente
  const forced = await adm('POST', '/customers', { name: 'Maria S.', phone: '912000111', force_new: true });
  assert.equal(forced.status, 201);
  groups = (await adm('GET', '/customers/duplicates')).body;
  assert.ok(groups.some(g => g.some(c => c.id === cid) && g.some(c => c.id === forced.body.id)));
  assert.equal((await adm('POST', `/customers/${forced.body.id}/merge`, { into_id: cid })).status, 200);
  assert.equal((await adm('GET', `/customers/${forced.body.id}`)).status, 404);
  const card = (await adm('GET', `/customers/${cid}`)).body;
  assert.ok(card.next_visit && card.bookings.length === 2);
  const search = (await adm('GET', '/customers?q=912000')).body;
  assert.ok(search.some(c => c.id === cid), 'pesquisa por telefone');
});

test('lista de espera manual: vaga compatível sinalizada à esteticista (sem email simulado)', async () => {
  const d = day(10);
  await adm('PUT', `/day-slots/${d}`, { times: ['17:30'] });
  const w = await adm('POST', '/waitlist', { name: 'Joana Demo', phone: '934445556', service_id: 1, periods: ['fim_tarde'], date_from: d, date_to: d });
  assert.equal(w.status, 201);
  const list = (await adm('GET', '/waitlist')).body;
  const e = list.find(x => x.id === w.body.id);
  assert.equal(e.matches.length, 1); assert.equal(e.matches[0].time, '17:30');
  assert.equal(e.status, 'active', 'sem email configurado não há ofertas automáticas');
  const ov = (await adm('GET', `/overview?date=${d}`)).body;
  assert.ok(ov.waitlist_signals.some(s => s.id === w.body.id));
  assert.equal((await adm('POST', `/waitlist/${w.body.id}/contacted`, {})).status, 200);
});

test('lembretes: sem email configurado ficam registados como não enviados; presença confirmada pela cliente', async () => {
  const d = day(1);
  await adm('PUT', `/day-slots/${d}`, { times: ['09:30'] });
  const r = await publicBook(1, at(d, '09:30'), 11);
  db.prepare('UPDATE bookings SET created_at=created_at-? WHERE ref=?').run(3 * 86400000, r.body.ref);
  saveSettings({ reminder_hours: 72 }); // garante que a marcação está dentro da janela do lembrete
  await C.runJobs();
  const b = (await adm('GET', '/bookings?q=' + r.body.ref)).body[0];
  assert.equal(b.reminder_status, 'not_configured');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE status='sent'").get().n, 0, 'nada aparece como enviado');
  const st = (await adm('GET', '/integrations')).body;
  assert.equal(st.email.configured, false); assert.deepEqual(st.email.missing, ['SMTP_HOST', 'SMTP_FROM']);
  assert.ok(!JSON.stringify(st).includes('SMTP_PASS='), 'credenciais nunca expostas');
  const att = await call('POST', `/api/public/manage/${r.body.token}/attendance`, {});
  assert.equal(att.body.attendance_confirmed, true);
  saveSettings({ reminder_enabled: false });
});

test('resumo mensal e financeiro por intervalo', async () => {
  const m = (await adm('GET', `/finance/month?month=${day(0).slice(0, 7)}`)).body;
  for (const k of ['completed', 'cancelled', 'no_show', 'top_services', 'received_cents']) assert.ok(k in m);
  assert.equal((await adm('GET', `/finance?from=${day(2)}&to=${day(1)}`)).status, 422);
});

test('acesso não autorizado: dados das clientes e ações de gestão protegidos no servidor', async () => {
  const paths = [['GET', '/overview'], ['GET', '/bookings'], ['GET', '/customers'], ['GET', '/finance'], ['POST', '/bookings/1/payments'], ['POST', '/bookings/1/approve'], ['PUT', '/day-slots/2030-01-01'], ['GET', '/integrations']];
  for (const [m, p] of paths) assert.equal((await call(m, '/api/admin' + p, m === 'GET' ? undefined : {})).status, 401, `${m} ${p} sem sessão`);
  assert.equal((await call('POST', '/api/admin/bookings/1/approve', {}, { Cookie: cookie })).status, 403, 'sem cabeçalho anti-CSRF');
  assert.equal((await call('GET', '/api/admin/overview', undefined, { Cookie: 'sid=falso' })).status, 401);
  const pub = (await call('GET', '/api/public/config')).body;
  assert.ok(!JSON.stringify(pub).match(/demo\d+@exemplo/), 'a área pública não expõe clientes');
});

test('sem duração em lado nenhum da API do painel; persistência na base de dados', async () => {
  const lists = [(await adm('GET', '/bookings')).body, (await adm('GET', '/services')).body, (await adm('GET', `/overview?date=${day(3)}`)).body];
  for (const l of lists) { assert.ok(!deepHasKey(l, 'duration_min'), 'sem duration_min'); assert.ok(!deepHasKey(l, 'end_at'), 'sem hora de fim'); }
  // persistência: uma ligação nova ao ficheiro vê os mesmos dados
  const Database = require('better-sqlite3');
  const other = new Database(DB_FILE, { readonly: true });
  assert.ok(other.prepare('SELECT COUNT(*) n FROM payments').get().n >= 1);
  assert.ok(other.prepare('SELECT COUNT(*) n FROM booking_events').get().n >= 5);
  other.close();
  assert.equal((await adm('PUT', '/settings', { timezone: 'Marte/Base' })).status, 422);
  assert.equal((await adm('PUT', '/settings', { timezone: 'Atlantic/Azores' })).status, 200);
  assert.equal((await call('GET', '/api/public/config')).body.timezone, 'Atlantic/Azores');
  await adm('PUT', '/settings', { timezone: 'Europe/Lisbon' });
});

test('formulário de registo: cria a ficha, não revela nem substitui dados existentes, e a marcação seguinte usa a mesma ficha', async () => {
  const today = DateTime.now().setZone(TZ);
  const bday = today.toFormat('MM-dd');
  const r1 = await call('POST', '/api/public/register', { name: 'Rita Registo', email: 'rita.registo@exemplo.pt', phone: '917 000 001', birthday: bday, birthday_consent: true, origem: 'instagram' });
  assert.equal(r1.status, 201); assert.deepEqual(r1.body, { ok: true });
  const c = db.prepare("SELECT * FROM customers WHERE email='rita.registo@exemplo.pt'").get();
  assert.equal(c.birthday, bday); assert.equal(c.birthday_consent, 1); assert.equal(c.source, 'registo:instagram'); assert.ok(c.registered_at);
  // validação no servidor
  const bad = await call('POST', '/api/public/register', { name: 'Rita', email: 'x@exemplo.pt', phone: '917000002', birthday: '02-30' });
  assert.equal(bad.status, 422); assert.ok(bad.body.errors.name && bad.body.errors.birthday);
  // mesmo email por outra pessoa: resposta igual, nada é substituído
  const r2 = await call('POST', '/api/public/register', { name: 'Outra Pessoa', email: 'rita.registo@exemplo.pt', phone: '960000000', birthday: '01-01', birthday_consent: false });
  assert.deepEqual(r2.body, r1.body, 'a resposta não revela se o email já existe');
  const c2 = db.prepare('SELECT * FROM customers WHERE id=?').get(c.id);
  assert.equal(c2.name, 'Rita Registo'); assert.equal(c2.phone, '917 000 001'); assert.equal(c2.birthday, bday); assert.equal(c2.birthday_consent, 1);
  // honeypot: finge sucesso e não guarda
  await call('POST', '/api/public/register', { name: 'Bot Spam', email: 'bot@exemplo.pt', phone: '911111111', birthday: '05-05', website: 'http://spam' });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM customers WHERE email='bot@exemplo.pt'").get().n, 0);
  // marcação depois do registo, só com o mesmo email → mesma ficha
  const d = day(12);
  await adm('PUT', `/day-slots/${d}`, { times: ['10:00'] });
  const b = await publicBook(1, at(d, '10:00'), 0, { name: 'Rita Registo', email: 'rita.registo@exemplo.pt', phone: '917 000 001' });
  assert.equal(b.status, 201);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM customers WHERE email='rita.registo@exemplo.pt'").get().n, 1, 'sem duplicar');
  assert.equal(db.prepare('SELECT customer_id FROM bookings WHERE ref=?').get(b.body.ref).customer_id, c.id);
  // painel: aniversário de hoje, mensagem personalizada e felicitada
  const bd = (await adm('GET', '/birthdays?days=31')).body;
  const mine = bd.list.find(x => x.id === c.id);
  assert.equal(mine.days_until, 0); assert.match(mine.message, /Rita/); assert.ok(!/\{nome\}/.test(mine.message));
  assert.ok((await adm('GET', `/overview?date=${day(0)}`)).body.birthdays.some(x => x.id === c.id), 'aniversários de hoje na visão geral');
  await adm('POST', `/customers/${c.id}/greeted`, {});
  assert.equal((await adm('GET', '/birthdays?days=31')).body.list.find(x => x.id === c.id).greeted, true);
  const stats = (await adm('GET', '/register/stats')).body;
  assert.equal(stats.by_origin.instagram, 1); assert.ok(stats.recent.some(x => x.id === c.id));
  // sem email configurado, nenhum email de aniversário é enviado
  saveSettings({ birthday_email_enabled: true }); await adm('POST', `/customers/${c.id}/greeted`, { undo: true }); await C.runJobs();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE kind='birthday'").get().n, 0);
  saveSettings({ birthday_email_enabled: false });
  // formulário desligado
  await adm('PUT', '/settings', { register_enabled: false });
  assert.equal((await call('POST', '/api/public/register', { name: 'Nova Cliente', email: 'nova@exemplo.pt', phone: '918888888', birthday: '03-03' })).status, 410);
  await adm('PUT', '/settings', { register_enabled: true });
  // editar aniversário no painel
  assert.equal((await adm('PUT', `/customers/${c.id}`, { name: c.name, phone: c.phone, email: c.email, birthday: '13-01' })).status, 422);
  assert.equal((await adm('PUT', `/customers/${c.id}`, { name: c.name, phone: c.phone, email: c.email, birthday: '02-29', birthday_consent: false })).status, 200);
  assert.equal(db.prepare('SELECT birthday_consent FROM customers WHERE id=?').get(c.id).birthday_consent, 0);
  assert.equal((await call('GET', '/api/admin/birthdays')).status, 401, 'aniversários só no painel');
});
