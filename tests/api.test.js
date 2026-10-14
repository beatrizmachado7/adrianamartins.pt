'use strict';
// Testes de integração: correm a aplicação real numa base de dados temporária.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'estetica-test-'));
process.env.DATA_DIR = DIR;
process.env.RATE_LIMIT = 'off';
process.env.SEED_SAMPLE_HOURS = '1';
const { DateTime } = require('luxon');
const { app, hashPassword } = require('../src/server');
const { db, saveSettings } = require('../src/db');
const A = require('../src/availability');
const C = require('../src/core');
const T = require('../src/tokens');

let base, server, cookie;
const TZ = 'Europe/Lisbon';
const at = (date, time) => DateTime.fromISO(`${date}T${time}`, { zone: TZ }).toMillis();
// próxima terça-feira com pelo menos 3 dias de distância (o horário de exemplo abre de terça a sábado)
function nextWeekday(wd, minDays = 3, skipWeeks = 0) {
  let d = DateTime.now().setZone(TZ).startOf('day').plus({ days: minDays });
  while (d.weekday !== wd) d = d.plus({ days: 1 });
  return d.plus({ weeks: skipWeeks }).toISODate();
}
async function call(method, url, body, headers = {}) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
}
const adm = (m, u, b) => call(m, '/api/admin' + u, b, { Cookie: cookie, 'X-Requested-With': 'fetch' });
const person = (i = 1) => ({ name: `Cliente Teste ${i}`, email: `cliente${i}@exemplo.pt`, phone: `91234567${i % 10}` });
const book = (service_id, start, i = 1, extra = {}) => call('POST', '/api/public/bookings', { service_id, start, accept_policy: true, ...person(i), ...extra });

// Catálogo fixo de teste (independente dos serviços de exemplo do site): durações e regras conhecidas.
function fixture() {
  db.exec('DELETE FROM staff_services; DELETE FROM services; DELETE FROM categories;');
  db.prepare("INSERT INTO categories(id,name,sort) VALUES (1,'A',1),(2,'B',2)").run();
  const ins = db.prepare('INSERT INTO services(id,category_id,name,description,duration_min,price_cents,price_type,price_note,requires_approval,featured,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  [[1, 1, 'S60', 60, 0], [2, 1, 'Aprovacao', 75, 1], [3, 2, 'S50', 50, 0], [4, 2, 'S45', 45, 0], [5, 2, 'S60b', 60, 0], [6, 1, 'S30', 30, 0], [7, 2, 'S30b', 30, 0]]
    .forEach(([id, c, n, d, ap]) => { ins.run(id, c, n, '', d, null, 'fixed', '', ap, 1, id); db.prepare('INSERT INTO staff_services VALUES(1,?)').run(id); });
}

before(async () => {
  fixture();
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  db.prepare('INSERT INTO admin_users(email,name,password_hash,created_at) VALUES(?,?,?,?)').run('admin@teste.pt', 'Admin', hashPassword('palavra-passe-1'), Date.now());
  saveSettings({ max_advance_days: 365 });
  const r = await call('POST', '/api/admin/login', { email: 'admin@teste.pt', password: 'palavra-passe-1' });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { server.close(); });

test('disponibilidade respeita horário (intervalos com pausa) e duração', async () => {
  const d = nextWeekday(2);
  const r = await call('GET', `/api/public/slots?service_id=1&date=${d}`);
  const times = r.body.slots.map(s => s.time);
  assert.equal(times[0], '10:00');
  assert.ok(times.includes('12:00') && !times.includes('12:15'), 'serviço de 60 min não pode passar das 13:00 (pausa)');
  assert.ok(times.includes('14:00') && times.includes('18:00') && !times.includes('18:15'));
  const sun = nextWeekday(7);
  assert.equal((await call('GET', `/api/public/slots?service_id=1&date=${sun}`)).body.slots.length, 0, 'domingo encerrado');
});

test('marcação confirmada automaticamente, com link privado de gestão', async () => {
  const d = nextWeekday(2);
  const r = await book(1, at(d, '10:00'), 1);
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'confirmed');
  assert.ok(r.body.token && r.body.token.length > 30);
  const m = await call('GET', `/api/public/manage/${r.body.token}`);
  assert.equal(m.status, 200);
  assert.equal(m.body.ref, r.body.ref);
  assert.equal((await call('GET', '/api/public/manage/token-invalido')).status, 404);
});

test('cada marcação ocupa um horário: o mesmo horário não é marcado duas vezes (com alternativas)', async () => {
  const d = nextWeekday(2);
  const slots = (await call('GET', `/api/public/slots?service_id=1&date=${d}`)).body.slots.map(s => s.time);
  // sem duração: só o horário das 10:00 fica ocupado; as 11:00 continuam livres
  assert.ok(!slots.includes('10:00') && slots.includes('11:00'));
  const dup = await book(1, at(d, '10:00'), 2);
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'SLOT_TAKEN');
  assert.ok(dup.body.alternatives.length > 0);
  const other = await book(6, at(d, '10:00'), 2); // outro serviço, mesmo horário e profissional → recusado
  assert.equal(other.status, 409);
  assert.ok(!('duration_min' in (await call('GET', '/api/public/services')).body.categories[0].services[0]), 'a duração não é exposta');
});

test('concorrência: 25 pedidos simultâneos para o mesmo horário → só 1 marcação', async () => {
  const d = nextWeekday(3);
  const start = at(d, '15:00');
  const results = await Promise.all(Array.from({ length: 25 }, (_, i) => book(1, start, 100 + i)));
  const ok = results.filter(r => r.status === 201);
  assert.equal(ok.length, 1, `esperado 1 sucesso, obtido ${ok.length}`);
  assert.equal(results.filter(r => r.status === 409).length, 24);
  const n = db.prepare("SELECT COUNT(*) n FROM bookings WHERE start_at=? AND status IN ('pending','confirmed')").get(start).n;
  assert.equal(n, 1);
});

test('base de dados recusa o mesmo horário duas vezes mesmo que a lógica da aplicação falhe', () => {
  const d = nextWeekday(3);
  const b = db.prepare("SELECT * FROM bookings WHERE start_at=? AND status='confirmed'").get(at(d, '15:00'));
  assert.throws(() => db.prepare(`INSERT INTO bookings(ref,customer_id,service_id,staff_id,service_name,duration_min,start_at,end_at,status,manage_token_hash,created_at,updated_at)
    VALUES('X1',?,1,?, 'x',0,?,?,'confirmed','h-x1',0,0)`).run(b.customer_id, b.staff_id, b.start_at, b.start_at), /SLOT_TAKEN|UNIQUE/);
  // horário seguinte (sem duração) é aceite
  const x = db.prepare(`INSERT INTO bookings(ref,customer_id,service_id,staff_id,service_name,duration_min,start_at,end_at,status,manage_token_hash,created_at,updated_at)
    VALUES('X2',?,1,?, 'x',0,?,?,'cancelled','h-x2',0,0)`).run(b.customer_id, b.staff_id, b.start_at, b.start_at);
  assert.ok(x.changes, 'uma marcação cancelada não ocupa o horário');
});

test('antecedência mínima e limite máximo', async () => {
  const soon = Date.now() + 3600000;
  const r = await book(1, soon, 3);
  assert.equal(r.status, 409);
  saveSettings({ max_advance_days: 30 });
  const far = DateTime.now().setZone(TZ).plus({ days: 45 });
  let d = far; while (d.weekday !== 3) d = d.plus({ days: 1 });
  const r2 = await book(1, at(d.toISODate(), '10:00'), 3);
  assert.equal(r2.status, 409);
  assert.match(r2.body.error, /data/);
  saveSettings({ max_advance_days: 365 });
});

test('fora do horário e validação de dados no servidor', async () => {
  const d = nextWeekday(2);
  assert.equal((await book(1, at(d, '08:00'), 4)).status, 409);
  assert.equal((await book(1, at(d, '13:30'), 4)).status, 409, 'durante a pausa de almoço');
  const bad = await call('POST', '/api/public/bookings', { service_id: 1, start: at(d, '16:00'), accept_policy: true, name: 'A', email: 'x', phone: '12' });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.errors.name && bad.body.errors.email && bad.body.errors.phone);
  const noPolicy = await call('POST', '/api/public/bookings', { service_id: 1, start: at(d, '16:00'), ...person(4) });
  assert.equal(noPolicy.status, 422);
});

test('aprovação manual: pedido pendente reserva o horário e expira', async () => {
  const d = nextWeekday(4);
  const r = await book(2, at(d, '10:00'), 5);
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'pending');
  assert.ok(r.body.hold_expires_at > Date.now());
  assert.equal((await book(1, at(d, '10:00'), 6)).status, 409, 'horário reservado enquanto pendente');
  // simular expiração do prazo
  db.prepare("UPDATE bookings SET hold_expires_at=? WHERE ref=?").run(Date.now() - 1000, r.body.ref);
  const again = await book(1, at(d, '10:00'), 6);
  assert.equal(again.status, 201, 'após expirar, o horário fica livre');
  assert.equal(db.prepare('SELECT status FROM bookings WHERE ref=?').get(r.body.ref).status, 'cancelled');
});

test('aprovar e recusar pedidos no painel', async () => {
  const d = nextWeekday(4);
  const r = await book(2, at(d, '15:00'), 7);
  const id = db.prepare('SELECT id FROM bookings WHERE ref=?').get(r.body.ref).id;
  assert.equal((await adm('POST', `/bookings/${id}/approve`, {})).status, 200);
  assert.equal(db.prepare('SELECT status FROM bookings WHERE id=?').get(id).status, 'confirmed');
  const r2 = await book(2, at(d, '17:00'), 8);
  const id2 = db.prepare('SELECT id FROM bookings WHERE ref=?').get(r2.body.ref).id;
  await adm('POST', `/bookings/${id2}/reject`, { reason: 'Indisponível' });
  assert.equal(db.prepare('SELECT status FROM bookings WHERE id=?').get(id2).status, 'cancelled');
});

test('bloqueios (férias/pausas) removem horários', async () => {
  const d = nextWeekday(5);
  const before = (await call('GET', `/api/public/slots?service_id=1&date=${d}`)).body.slots.length;
  const r = await adm('POST', '/blocks', { type: 'pausa', start_at: at(d, '14:00'), end_at: at(d, '16:00'), reason: 'Formação' });
  assert.equal(r.status, 201);
  const slots = (await call('GET', `/api/public/slots?service_id=1&date=${d}`)).body.slots.map(s => s.time);
  assert.ok(slots.length < before);
  assert.ok(!slots.some(t => t >= '13:15' && t < '16:00'));
  assert.ok(slots.includes('16:00'));
  assert.equal((await book(1, at(d, '14:30'), 9)).status, 409);
});

test('recurso partilhado: duas profissionais não usam a mesma sala ao mesmo tempo', async () => {
  const res = await adm('POST', '/resources', { name: 'Sala 1' });
  const svc = (await adm('GET', '/services')).body.services.find(s => s.id === 3);
  const st2 = await adm('POST', '/staff', { name: 'Profissional 2', services: [3] });
  await adm('PUT', '/services/3', { ...svc, price_eur: '', resource_id: res.body.id, staff: [1, st2.body.id] });
  const d = nextWeekday(5, 3, 1);
  const a = await book(3, at(d, '10:00'), 10, { staff_id: 1 });
  assert.equal(a.status, 201);
  const b = await book(3, at(d, '10:00'), 11, { staff_id: st2.body.id });
  assert.equal(b.status, 409, 'sala ocupada');
  const slots = (await call('GET', `/api/public/slots?service_id=3&date=${d}&staff_id=${st2.body.id}`)).body.slots.map(s => s.time);
  assert.ok(!slots.includes('10:00') && !slots.includes('10:30'));
  // serviço sem recurso: a segunda profissional pode trabalhar em paralelo
  await adm('PUT', '/services/3', { ...svc, price_eur: '', resource_id: null, staff: [1, st2.body.id] });
  assert.equal((await book(3, at(d, '10:00'), 11, { staff_id: st2.body.id })).status, 201);
  await adm('PUT', `/staff/${st2.body.id}`, { name: 'Profissional 2', active: false, services: [] });
});

test('cancelar e reagendar pela cliente respeitam a política', async () => {
  const d = nextWeekday(6);
  const r = await book(1, at(d, '10:00'), 12);
  const rs = await call('POST', `/api/public/manage/${r.body.token}/reschedule`, { start: at(d, '12:00') });
  assert.equal(rs.status, 200);
  assert.equal(rs.body.start, at(d, '12:00'));
  assert.equal((await book(1, at(d, '10:00'), 13)).status, 201, 'horário antigo libertado');
  const c = await call('POST', `/api/public/manage/${r.body.token}/cancel`, {});
  assert.equal(c.body.status, 'cancelled');
  assert.equal((await call('POST', `/api/public/manage/${r.body.token}/cancel`, {})).status, 409);
  // dentro do prazo-limite (24h): não pode cancelar online
  saveSettings({ min_notice_hours: 0 });
  const soon = DateTime.now().setZone(TZ).plus({ hours: 5 });
  const id = C.createBooking({ service_id: 1, start: soon.toMillis(), ...person(14), force_new: true }, { admin: true, notify: false });
  const tok = id.token;
  const late = await call('POST', `/api/public/manage/${tok}/cancel`, {});
  assert.equal(late.status, 403);
  saveSettings({ min_notice_hours: 12 });
});

test('lista de espera: vaga oferecida a uma pessoa de cada vez, sem duplicação', async () => {
  // as ofertas automáticas só existem com email configurado (servidor SMTP inexistente: o envio falha, a oferta mantém-se)
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = '9'; process.env.SMTP_FROM = 'teste@exemplo.pt';
  const d = nextWeekday(2, 3, 2);
  // deixar apenas o horário das 10:00 aberto nesse dia
  await adm('POST', '/blocks', { type: 'pausa', start_at: at(d, '11:00'), end_at: at(d, '20:00') });
  const b = await book(6, at(d, '10:00'), 20);
  assert.equal(b.status, 201);
  assert.equal((await call('GET', `/api/public/slots?service_id=6&date=${d}`)).body.slots.length, 0);
  const w1 = await call('POST', '/api/public/waitlist', { service_id: 6, date_from: d, date_to: d, ...person(21) });
  const w2 = await call('POST', '/api/public/waitlist', { service_id: 6, date_from: d, date_to: d, ...person(22) });
  assert.equal(w1.status, 201); assert.equal(w2.status, 201);
  assert.equal((await call('POST', '/api/public/waitlist', { service_id: 6, ...person(21) })).status, 409, 'inscrição duplicada');
  await C.processWaitlist();
  assert.equal(db.prepare('SELECT status FROM waitlist WHERE id=?').get(w1.body.id).status, 'active', 'sem vaga ainda');
  // cancelamento liberta a vaga
  await call('POST', `/api/public/manage/${b.body.token}/cancel`, {});
  await new Promise(r => setTimeout(r, 50));
  await C.processWaitlist();
  const e1 = db.prepare('SELECT * FROM waitlist WHERE id=?').get(w1.body.id);
  const e2 = db.prepare('SELECT * FROM waitlist WHERE id=?').get(w2.body.id);
  assert.equal(e1.status, 'offered');
  assert.equal(e2.status, 'active', 'a mesma vaga não é oferecida a duas pessoas');
  // durante a oferta, ninguém mais pode marcar esse horário
  assert.equal((await book(6, e1.offer_start_at, 23)).status, 409);
  const tok = T.offerToken(e1.id, e1.offers_count);
  const acc = await call('POST', `/api/public/offer/${tok}/accept`, { accept_policy: true });
  assert.equal(acc.status, 200);
  assert.equal(acc.body.status, 'confirmed');
  const again = await call('POST', `/api/public/offer/${tok}/accept`, { accept_policy: true });
  assert.equal(again.body.already, true, 'aceitar duas vezes não cria segunda marcação');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM bookings WHERE start_at=? AND status='confirmed'").get(e1.offer_start_at).n, 1);
});

test('oferta expirada passa à pessoa seguinte', async () => {
  const d = nextWeekday(2, 3, 2);
  const e2 = db.prepare("SELECT * FROM waitlist WHERE email='cliente22@exemplo.pt'").get();
  // libertar a vaga outra vez
  const bk = db.prepare("SELECT id FROM bookings WHERE start_at=? AND status='confirmed'").get(at(d, '10:00'));
  C.cancelBooking(bk.id, { byAdmin: true, notify: false });
  await new Promise(r => setTimeout(r, 50));
  await C.processWaitlist();
  let w = db.prepare('SELECT * FROM waitlist WHERE id=?').get(e2.id);
  assert.equal(w.status, 'offered');
  const firstStart = w.offer_start_at;
  db.prepare('UPDATE waitlist SET offer_expires_at=? WHERE id=?').run(Date.now() - 1, e2.id);
  await C.processWaitlist();
  w = db.prepare('SELECT * FROM waitlist WHERE id=?').get(e2.id);
  assert.ok(JSON.parse(w.skipped).includes(firstStart), 'a vaga não aceite não volta a ser oferecida à mesma pessoa');
  assert.ok(w.status !== 'offered' || w.offer_start_at !== firstStart);
  assert.equal((await call('GET', `/api/public/offer/${T.offerToken(e2.id, 1)}`)).status, 404, 'link antigo deixa de funcionar');
  delete process.env.SMTP_HOST; delete process.env.SMTP_PORT; delete process.env.SMTP_FROM;
});

test('avaliações: só após atendimento concluído, uma por marcação, moderação limitada', async () => {
  const past = DateTime.now().setZone(TZ).minus({ days: 1 }).set({ hour: 11, minute: 0 }).toMillis();
  const b = C.createBooking({ service_id: 1, start: past, ...person(30), force_new: true }, { admin: true, notify: false });
  const id = db.prepare('SELECT id FROM bookings WHERE ref=?').get(b.ref).id;
  await adm('PATCH', `/bookings/${id}`, { status: 'completed' });
  saveSettings({ review_invite_delay_hours: 0 });
  await C.runJobs();
  const tok = T.reviewToken(b.ref);
  assert.ok(db.prepare('SELECT review_invited_at FROM bookings WHERE id=?').get(id).review_invited_at);
  const r1 = await call('POST', `/api/public/review/${tok}`, { rating: 2, comment: 'O atendimento atrasou.' });
  assert.equal(r1.status, 201); assert.equal(r1.body.status, 'published');
  assert.equal((await call('POST', `/api/public/review/${tok}`, { rating: 5 })).status, 409, 'uma avaliação por atendimento');
  const pubList = (await call('GET', '/api/public/reviews')).body;
  assert.equal(pubList.reviews[0].verified, 1);
  const rid = pubList.reviews[0].id;
  const hide = await adm('POST', `/reviews/${rid}`, { action: 'hide', reason: 'negativa' });
  assert.equal(hide.status, 422, 'não é possível ocultar só por ser negativa');
  assert.equal((await adm('POST', `/reviews/${rid}`, { action: 'hide', reason: 'spam' })).status, 200);
  // comentário com contacto → fica por moderar
  const b2 = C.createBooking({ service_id: 1, start: past - 86400000, ...person(31), force_new: true }, { admin: true, notify: false });
  const id2 = db.prepare('SELECT id FROM bookings WHERE ref=?').get(b2.ref).id;
  await adm('PATCH', `/bookings/${id2}`, { status: 'completed' });
  await C.runJobs();
  const r2 = await call('POST', `/api/public/review/${T.reviewToken(b2.ref)}`, { rating: 5, comment: 'Liguem-me 912345678' });
  assert.equal(r2.body.status, 'pending');
  // marcação não concluída não pode ser avaliada (não há token)
  assert.equal((await call('GET', `/api/public/review/${T.reviewToken('NAOEXISTE')}`)).status, 404);
});

test('notificações sem SMTP nunca aparecem como enviadas', () => {
  const rows = db.prepare('SELECT status FROM notifications').all();
  assert.ok(rows.length > 0);
  assert.ok(rows.every(r => r.status !== 'sent'));
  assert.ok(rows.some(r => r.status === 'not_configured'));
});

test('painel protegido: sem sessão e sem cabeçalho anti-CSRF não há acesso', async () => {
  assert.equal((await call('GET', '/api/admin/bookings')).status, 401);
  assert.equal((await call('POST', '/api/admin/services', { name: 'x', duration_min: 30 }, { Cookie: cookie })).status, 403);
  assert.equal((await call('POST', '/api/admin/login', { email: 'admin@teste.pt', password: 'errada' })).status, 401);
  const cust = (await call('GET', '/api/public/config')).body;
  assert.ok(!('customers' in cust) && !JSON.stringify(cust).includes('cliente1@exemplo.pt'), 'dados de clientes não expostos');
});

test('mudança de hora (Europe/Lisbon): horários corretos no último domingo de outubro', () => {
  db.prepare("INSERT INTO business_hours(weekday,start,end) VALUES(7,'10:00','12:00')").run();
  const svc = C.getService(6);
  const s = A.slotsForDay(svc, null, '2026-10-25'); // passa de UTC+1 para UTC+0 às 02:00
  assert.equal(s[0].time, '10:00');
  assert.equal(new Date(s[0].start).toISOString(), '2026-10-25T10:00:00.000Z', '10:00 em Lisboa = 10:00 UTC no inverno');
  const s2 = A.slotsForDay(svc, null, '2026-10-18');
  if (s2.length) assert.equal(new Date(s2[0].start).toISOString(), '2026-10-18T09:00:00.000Z', '10:00 em Lisboa = 09:00 UTC no verão');
  db.prepare('DELETE FROM business_hours WHERE weekday=7').run();
});

test('alterar o preço de um serviço não altera marcações existentes (preço acordado preservado)', async () => {
  const before = db.prepare('SELECT price_cents, service_name FROM bookings WHERE service_id=1 LIMIT 1').get();
  const svc = (await adm('GET', '/services')).body.services.find(s => s.id === 1);
  assert.ok(!('duration_min' in svc), 'o painel não recebe a duração');
  const r = await adm('PUT', '/services/1', { ...svc, price_eur: '45,50', name: 'S60 novo', staff: [1] });
  assert.equal(r.status, 200);
  const pub = (await call('GET', '/api/public/services')).body.categories[0].services.find(s => s.id === 1);
  assert.equal(pub.price_cents, 4550); assert.equal(pub.name, 'S60 novo');
  const after = db.prepare('SELECT price_cents, service_name FROM bookings WHERE service_id=1 LIMIT 1').get();
  assert.deepEqual(after, before);
  assert.equal((await adm('PUT', '/services/1', { ...svc, price_type: 'variable', price_note: '' })).status, 422, 'preço variável exige explicação');
  await adm('PUT', '/services/1', { ...svc, staff: [1] });
});

test('serviço com detalhes (incluído, preparação) e fotografia carregada pelo painel', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await adm('POST', '/uploads', { data: png });
  assert.equal(up.status, 201);
  assert.match(up.body.url, /^\/uploads\/.+\.png$/);
  const img = await fetch(base + up.body.url);
  assert.equal(img.status, 200);
  assert.equal((await adm('POST', '/uploads', { data: 'data:text/html;base64,PGgxPg==' })).status, 422, 'só imagens');
  assert.equal((await call('POST', '/api/admin/uploads', { data: png })).status, 401, 'carregar exige sessão');
  const svc = (await adm('GET', '/services')).body.services.find(s => s.id === 4);
  await adm('PUT', '/services/4', { ...svc, price_eur: '20', image_url: up.body.url, included: 'Limar e hidratar.', preparation: 'Não é necessária.', staff: [1] });
  const pub = (await call('GET', '/api/public/services')).body.categories.flatMap(c => c.services).find(s => s.id === 4);
  assert.equal(pub.image_url, up.body.url); assert.equal(pub.included, 'Limar e hidratar.'); assert.equal(pub.preparation, 'Não é necessária.');
});

test('novas definições públicas: políticas, acesso e identificação', async () => {
  await adm('PUT', '/settings', { access_info: 'Estacionamento gratuito na rua.', legal_id: 'Exemplo Lda · NIF 000000000' });
  const c = (await call('GET', '/api/public/config')).body;
  assert.equal(c.access_info, 'Estacionamento gratuito na rua.');
  assert.ok(c.booking_policy && c.cancellation_policy && c.legal_id);
  assert.equal(c.hero_title, 'Um momento para cuidar de ti.');
});

test('extras não se marcam online (só no painel)', async () => {
  db.prepare("INSERT INTO services(id,category_id,name,duration_min,price_cents,price_type,bookable,sort) VALUES(50,1,'Extra',15,300,'addon',0,50)").run();
  db.prepare('INSERT INTO staff_services VALUES(1,50)').run();
  const d = nextWeekday(4, 3, 3);
  const r = await book(50, at(d, '10:00'), 60);
  assert.equal(r.status, 422);
  const pub = (await call('GET', '/api/public/services')).body.categories.flatMap(c => c.services).find(s => s.id === 50);
  assert.equal(pub.bookable, 0); assert.equal(pub.price_type, 'addon');
});

test('disponibilidade aberta à mão no painel: só os horários escolhidos para esse dia', async () => {
  const date = nextWeekday(1, 3, 3); // segunda-feira (encerrada no horário semanal)
  const svc = C.getService(1);
  assert.equal(A.slotsForDay(svc, null, date).length, 0, 'sem horários manuais: dia fechado');
  assert.equal((await adm('PUT', `/day-slots/${date}`, { times: ['10:00', '9:00'] })).status, 422, 'hora mal escrita é recusada');
  const r = await adm('PUT', `/day-slots/${date}`, { times: ['14:30', '10:00', '10:00'] });
  assert.equal(r.status, 200); assert.deepEqual(r.body.times, ['10:00', '14:30']);
  assert.deepEqual(A.slotsForDay(svc, null, date).map(s => s.time), ['10:00', '14:30']);
  const list = (await adm('GET', `/day-slots?from=${date}&to=${date}`)).body;
  assert.deepEqual(list, [{ date, times: ['10:00', '14:30'] }]);
  // só se marca nos horários abertos
  assert.equal((await book(1, at(date, '11:00'), 81)).status, 409);
  const ok = await book(1, at(date, '14:30'), 82);
  assert.equal(ok.status, 201);
  assert.deepEqual(A.slotsForDay(svc, null, date).map(s => s.time), ['10:00'], 'horário ocupado deixa de aparecer');
  const refused = await adm('PUT', `/day-slots/${date}`, { times: [] });
  assert.equal(refused.status, 409, 'uma hora com marcação não pode ser fechada');
  assert.match(refused.body.error, /14:30/);
  assert.equal((await adm('PUT', `/day-slots/${date}`, { times: ['14:30'] })).status, 200, 'fechar as outras horas é permitido');
  assert.equal(A.slotsForDay(svc, null, date).length, 0, 'sem horas livres');
});

test('vídeo do espaço: carregar MP4 e recusar outros formatos', async () => {
  const up = (type, body) => fetch(base + '/api/admin/uploads/video', { method: 'POST', headers: { 'Content-Type': type, Cookie: cookie, 'X-Requested-With': 'fetch' }, body });
  const ok = await up('video/mp4', Buffer.from('00000018667479706d703432', 'hex'));
  assert.equal(ok.status, 201);
  const { url } = await ok.json();
  assert.match(url, /^\/uploads\/.+\.mp4$/);
  assert.equal((await fetch(base + url)).status, 200);
  assert.equal((await up('text/plain', 'x')).status, 422);
});
