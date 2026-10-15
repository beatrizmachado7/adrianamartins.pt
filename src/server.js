'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { db, getSettings, saveSettings, DEFAULT_SETTINGS } = require('./db');
const A = require('./availability');
const C = require('./core');
const T = require('./tokens');
const N = require('./notify');
const { AppError } = C;

const app = express();
app.disable('x-powered-by');
// só confia no proxy imediatamente à frente (Render/Nginx): impede contornar os limites com X-Forwarded-For falso
// TRUST_PROXY: true = 1 proxy (Render); um número = proxies à frente (ex.: 2 com o Netlify a encaminhar para o Render)
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : /^\d+$/.test(process.env.TRUST_PROXY || '') ? Number(process.env.TRUST_PROXY) : false);
// compressão gzip/brotli para HTML, CSS, JS e JSON (menos dados no telemóvel)
if (process.env.DB_DRIVER !== 'sqljs') app.use(require('compression')({ threshold: 1024 })); // no Netlify, a compressão é feita pela CDN
const smallJson = express.json({ limit: '100kb' });
app.use((req, res, next) => req.path.startsWith('/api/admin/uploads') ? next() : smallJson(req, res, next));
app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
});

// ---------- utilitários ----------
const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);
const int = v => { const n = Number(v); return Number.isInteger(n) ? n : null; };
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    if (process.env.RATE_LIMIT === 'off') return next(); // apenas para testes automáticos
    const k = req.ip + req.path, t = Date.now();
    const arr = (hits.get(k) || []).filter(x => t - x < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Demasiados pedidos. Tenta novamente dentro de instantes.' });
    arr.push(t); hits.set(k, arr); next();
  };
}
setInterval(() => hits.clear(), 3600000).unref();

// ---------- autenticação do painel ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [, salt, h] = String(stored).split('$');
  if (!salt || !h) return false;
  const a = crypto.scryptSync(String(pw), salt, 64), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cookieName = 'sid';
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function auth(req, res, next) {
  const tok = parseCookies(req)[cookieName];
  const s = tok && db.prepare('SELECT s.*, u.email, u.name FROM sessions s JOIN admin_users u ON u.id=s.user_id WHERE token_hash=? AND expires_at > ?').get(T.hash(tok), Date.now());
  if (!s) return res.status(401).json({ error: 'Sessão terminada. Inicie sessão novamente.' });
  // proteção CSRF: pedidos que alteram dados exigem cabeçalho próprio (não enviado por formulários de terceiros)
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'fetch') return res.status(403).json({ error: 'Pedido inválido.' });
  req.user = { id: s.user_id, email: s.email, name: s.name };
  next();
}

// ---------- API pública ----------
const pub = express.Router();
const PUBLIC_KEYS = ['wa_tpl_client', 'business_name', 'hero_title', 'hero_subtitle', 'address_line', 'postal_code', 'city', 'phone', 'email', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'logo_image', 'testimonials',
  'map_embed_url', 'map_link_url', 'professional_name', 'about_text', 'space_title', 'space_text', 'space_image', 'space_points', 'training', 'experience_text', 'experience_steps', 'hero_image', 'hero_image_2', 'hero_image_3',
  'about_image', 'about_image_2', 'video_url', 'video_file', 'video_image', 'services_image', 'pricing_image', 'booking_image', 'reviews_image', 'contacts_image', 'gallery', 'cancellation_policy', 'cancel_limit_hours', 'reschedule_limit_hours', 'min_notice_hours', 'max_advance_days', 'arrival_note', 'faq',
  'pending_hold_hours', 'waitlist_offer_minutes', 'privacy_controller', 'access_info', 'booking_policy', 'legal_id', 'register_enabled', 'register_title', 'register_intro',
  'deposit_enabled', 'deposit_percent', 'mbway_number', 'iban', 'iban_name', 'payment_note'];

pub.get('/config', (req, res) => {
  const s = getSettings();
  const out = Object.fromEntries(PUBLIC_KEYS.map(k => [k, s[k]]));
  out.hours = db.prepare('SELECT weekday,start,end FROM business_hours ORDER BY weekday,start').all();
  out.closures = db.prepare(`SELECT start_at, end_at, public_note, type FROM blocks WHERE staff_id IS NULL AND end_at > ? AND type IN ('encerramento','ferias')
    ORDER BY start_at LIMIT 10`).all(Date.now());
  out.staff = db.prepare('SELECT id,name,role,bio,photo_url FROM staff WHERE active=1 ORDER BY sort,id').all();
  out.integrations = N.integrations();
  out.timezone = A.tz();
  res.json(out);
});

pub.get('/services', (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort,id').all();
  const svcs = db.prepare(`SELECT s.id,s.category_id,s.group_name,s.bookable,s.name,s.description,s.image_url,s.included,s.preparation,s.price_cents,s.price_type,s.price_note,s.requires_approval,s.featured,
    (SELECT json_group_array(staff_id) FROM staff_services ss JOIN staff st ON st.id=ss.staff_id WHERE ss.service_id=s.id AND st.active=1) staff
    FROM services s WHERE s.active=1 ORDER BY s.sort,s.id`).all().map(s => ({ ...s, staff: JSON.parse(s.staff) }));
  res.json({ categories: cats.map(c => ({ ...c, services: svcs.filter(s => s.category_id === c.id) })).filter(c => c.services.length),
    uncategorized: svcs.filter(s => !s.category_id) });
});

pub.get('/days', (req, res) => {
  const service = C.getService(req.query.service_id);
  const s = getSettings();
  const today = A.toLocal(Date.now()).toISODate();
  const from = A.parseDate(req.query.from) ? req.query.from : today;
  A.expirePendingHolds();
  const days = A.availableDays(service, int(req.query.staff_id), from < today ? today : from, Math.min(int(req.query.days) || 35, 62), s);
  const last = A.toLocal(Date.now()).plus({ days: s.max_advance_days }).toISODate();
  res.json({ days: days.map(d => ({ ...d, bookable: d.date <= last })), last_date: last, today });
});

pub.get('/slots', (req, res) => {
  const service = C.getService(req.query.service_id);
  if (!A.parseDate(req.query.date)) throw new AppError(422, 'VALIDATION', 'Data inválida.');
  A.expirePendingHolds();
  const slots = A.slotsForDay(service, int(req.query.staff_id), req.query.date);
  const staffNames = Object.fromEntries(db.prepare('SELECT id,name FROM staff').all().map(s => [s.id, s.name]));
  res.json({ slots: slots.map(s => ({ ...s, staff: s.staff.map(id => ({ id, name: staffNames[id] })) })) });
});

pub.post('/bookings', rateLimit(10, 600000), wrap(async (req, res) => {
  if (req.body.website) throw new AppError(422, 'VALIDATION', 'Pedido inválido.'); // honeypot anti-spam
  const b = C.createBooking({ ...req.body, marketing_consent: req.body.marketing_consent === true });
  res.status(201).json(b);
}));

pub.get('/manage/:token', (req, res) => { A.expirePendingHolds(); res.json(C.publicBooking(C.bookingByToken(req.params.token))); });
pub.post('/manage/:token/cancel', rateLimit(10, 600000), (req, res) => {
  const id = C.bookingByToken(req.params.token);
  C.cancelBooking(id, { reason: req.body.reason });
  res.json(C.publicBooking(id));
});
pub.post('/manage/:token/reschedule', rateLimit(10, 600000), (req, res) => {
  const id = C.bookingByToken(req.params.token);
  try { C.rescheduleBooking(id, { start: req.body.start, staff_id: req.body.staff_id }); }
  catch (e) {
    if (e.code === 'SLOT_TAKEN') {
      const b = C.bookingRow(id);
      e.extra.alternatives = b.service_id ? A.alternatives(C.getService(b.service_id, { includeInactive: true }), req.body.staff_id, Number(req.body.start)).map(C.publicSlot) : [];
    }
    throw e;
  }
  res.json(C.publicBooking(id));
});

pub.post('/manage/:token/proposal', rateLimit(10, 600000), (req, res) => {
  const id = C.bookingByToken(req.params.token);
  C.answerProposal(id, req.body.accept === true);
  res.json(C.publicBooking(id));
});
pub.post('/manage/:token/attendance', rateLimit(10, 600000), (req, res) => {
  const id = C.bookingByToken(req.params.token);
  C.confirmAttendance(id, 'cliente');
  res.json(C.publicBooking(id));
});

// registo de clientes (link partilhado nas redes sociais)
pub.post('/register', rateLimit(5, 600000), (req, res) => {
  if (req.body.website) return res.status(201).json({ ok: true }); // honeypot anti-spam: finge sucesso, não guarda
  res.status(201).json(C.registerCustomer(req.body));
});

pub.post('/waitlist', rateLimit(5, 600000), (req, res) => {
  if (req.body.website) throw new AppError(422, 'VALIDATION', 'Pedido inválido.');
  const r = C.joinWaitlist(req.body);
  res.status(201).json({ ok: true, id: r.id });
});
pub.get('/offer/:token', (req, res) => res.json(C.publicOffer(req.params.token)));
pub.post('/offer/:token/accept', rateLimit(10, 600000), (req, res) => res.json(C.acceptOffer(req.params.token, { accept_policy: req.body.accept_policy, marketing_consent: req.body.marketing_consent === true })));
pub.post('/offer/:token/decline', (req, res) => { C.declineOffer(req.params.token); res.json({ ok: true }); });

pub.get('/reviews', (req, res) => {
  const rows = db.prepare(`SELECT id,rating,comment,author_name,service_name,verified,reply,created_at FROM reviews WHERE status='published' ORDER BY created_at DESC LIMIT ?`)
    .all(Math.min(int(req.query.limit) || 50, 200));
  const agg = db.prepare(`SELECT COUNT(*) n, AVG(rating) avg FROM reviews WHERE status='published'`).get();
  res.json({ reviews: rows, count: agg.n, average: agg.avg ? Math.round(agg.avg * 10) / 10 : null });
});
pub.get('/review/:token', (req, res) => {
  const c = C.reviewContext(req.params.token);
  res.json({ already: c.already, service_name: c.service_name, start: c.start, suggested_name: c.suggested_name, completed: c.booking.status === 'completed' });
});
pub.post('/review/:token', rateLimit(5, 600000), (req, res) => res.status(201).json(C.submitReview(req.params.token, req.body)));

app.use('/api/public', pub);

// ---------- API do painel ----------
const adm = express.Router();
adm.post('/login', rateLimit(8, 900000), (req, res) => {
  const u = db.prepare('SELECT * FROM admin_users WHERE email=?').get(String(req.body.email || '').toLowerCase().trim());
  if (!u || !checkPassword(req.body.password || '', u.password_hash)) throw new AppError(401, 'AUTH', 'Email ou palavra-passe incorretos.');
  const tok = T.random(32);
  const days = 14;
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(T.hash(tok), u.id, Date.now() + days * 86400000);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.set('Set-Cookie', `${cookieName}=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${days * 86400}${secure}`);
  res.json({ ok: true, name: u.name });
});
adm.post('/logout', (req, res) => {
  const tok = parseCookies(req)[cookieName];
  if (tok) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(T.hash(tok));
  res.set('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});
adm.use(auth);
adm.get('/me', (req, res) => res.json(req.user));
adm.post('/password', (req, res) => {
  const u = db.prepare('SELECT * FROM admin_users WHERE id=?').get(req.user.id);
  if (!checkPassword(req.body.current || '', u.password_hash)) throw new AppError(422, 'VALIDATION', 'A palavra-passe atual não está correta.');
  if (String(req.body.next || '').length < 10) throw new AppError(422, 'VALIDATION', 'A nova palavra-passe deve ter pelo menos 10 caracteres.');
  db.prepare('UPDATE admin_users SET password_hash=? WHERE id=?').run(hashPassword(req.body.next), u.id);
  res.json({ ok: true });
});

const BOOKING_SELECT = `SELECT b.id,b.ref,b.status,b.service_id,b.service_name,b.price_cents,b.price_type,b.start_at,b.staff_id,
  st.name staff_name,b.resource_id,b.hold_expires_at,b.source,b.cancel_reason,b.internal_notes,b.created_at,b.updated_at,b.reminder_sent_at,b.review_invited_at,
  b.proposed,b.attendance_confirmed_at,b.attendance_source,b.payment_method,b.deposit_cents,
  (SELECT COALESCE(SUM(p.amount_cents),0) FROM payments p WHERE p.booking_id=b.id AND p.status='pago') paid_cents,
  (SELECT n.status FROM notifications n WHERE n.booking_id=b.id AND n.kind='reminder' ORDER BY n.id DESC LIMIT 1) reminder_status,
  c.id customer_id,c.name customer_name,c.email customer_email,c.phone customer_phone
  FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN staff st ON st.id=b.staff_id`;
const ISO = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const dayRange = iso => { const d = A.parseDate(iso); if (!d) throw new AppError(422, 'VALIDATION', 'Data inválida.'); return [d.toMillis(), d.endOf('day').toMillis()]; };
const todayIso = () => A.toLocal(Date.now()).toISODate();

// Visão geral de um dia
adm.get('/overview', (req, res) => {
  A.expirePendingHolds();
  const date = ISO.test(req.query.date || '') ? req.query.date : todayIso();
  const [d0, d1] = dayRange(date);
  const day = db.prepare(`${BOOKING_SELECT} WHERE b.start_at BETWEEN ? AND ? AND b.status<>'cancelled' ORDER BY b.start_at`).all(d0, d1);
  const pending = db.prepare(`${BOOKING_SELECT} WHERE b.status='pending' ORDER BY b.start_at`).all();
  const board = A.dayBoard(date);
  const confirmed = day.filter(b => b.status === 'confirmed' || b.status === 'completed');
  const wl = db.prepare(`SELECT w.*, s.name service_name FROM waitlist w JOIN services s ON s.id=w.service_id WHERE w.status='active' ORDER BY w.created_at`).all();
  const signals = wl.map(w => ({ id: w.id, name: w.name, phone: w.phone, service_name: w.service_name, matches: C.waitlistMatches(w, 2) })).filter(w => w.matches.length);
  const s = getSettings();
  res.json({ date, today: todayIso(), bookings: day, pending, board,
    cards: { confirmed: confirmed.length, pending: pending.length, available: board.filter(t => t.state === 'livre').length,
      expected_cents: confirmed.reduce((a, b) => a + (b.price_cents || 0), 0), unpriced: confirmed.filter(b => b.price_cents == null).length },
    waitlist_signals: signals, integrations: N.integrations(), business_name: s.business_name,
    birthdays: date === todayIso() ? C.upcomingBirthdays(0).map(c => ({ ...c, message: N.birthdayText(c, s) })) : [],
    open_days: db.prepare('SELECT COUNT(DISTINCT date) n FROM day_slots WHERE date>=?').get(todayIso()).n,
    weekly_hours: db.prepare('SELECT COUNT(*) n FROM business_hours').get().n });
});
adm.get('/agenda/day', (req, res) => {
  A.expirePendingHolds();
  const date = ISO.test(req.query.date || '') ? req.query.date : todayIso();
  const [d0, d1] = dayRange(date);
  res.json({ date, board: A.dayBoard(date, int(req.query.staff_id)),
    bookings: db.prepare(`${BOOKING_SELECT} WHERE b.start_at BETWEEN ? AND ? ORDER BY b.start_at`).all(d0, d1) });
});

adm.get('/bookings', (req, res) => {
  const where = [], args = [];
  const from = ISO.test(req.query.from || '') ? A.parseDate(req.query.from).toMillis() : int(req.query.from);
  const to = ISO.test(req.query.to || '') ? A.parseDate(req.query.to).endOf('day').toMillis() : int(req.query.to);
  if (from) { where.push('b.start_at >= ?'); args.push(from); }
  if (to) { where.push('b.start_at <= ?'); args.push(to); }
  if (req.query.status) { const st = String(req.query.status).split(',').filter(x => C.STATUS_LABEL[x]); if (st.length) { where.push(`b.status IN (${st.map(() => '?').join(',')})`); args.push(...st); } }
  if (int(req.query.staff_id)) { where.push('b.staff_id=?'); args.push(int(req.query.staff_id)); }
  if (int(req.query.service_id)) { where.push('b.service_id=?'); args.push(int(req.query.service_id)); }
  if (int(req.query.customer_id)) { where.push('b.customer_id=?'); args.push(int(req.query.customer_id)); }
  if (req.query.q) { where.push('(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR b.ref LIKE ?)'); const q = `%${String(req.query.q).slice(0, 60)}%`; args.push(q, q, q, q); }
  A.expirePendingHolds();
  res.json(db.prepare(`${BOOKING_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.start_at ${req.query.order === 'desc' ? 'DESC' : 'ASC'} LIMIT 1000`).all(...args));
});
const bookingDetail = id => {
  const b = db.prepare(`${BOOKING_SELECT} WHERE b.id=?`).get(id);
  if (!b) throw new AppError(404, 'NOT_FOUND', 'Marcação não encontrada.');
  const base = getSettings().public_base_url;
  const manage_url = `${base}/gerir.html?t=${T.manageToken(b.ref, b.created_at)}`;
  // link para avaliar (atendimento concluído): o mesmo que iria no email, agora enviado por WhatsApp
  let review_url = '';
  if (b.status === 'completed' && !db.prepare('SELECT 1 FROM reviews WHERE booking_id=?').get(id)) {
    const tok = T.reviewToken(b.ref);
    db.prepare('UPDATE bookings SET review_token_hash=? WHERE id=? AND review_token_hash IS NULL').run(T.hash(tok), id);
    if (db.prepare('SELECT review_token_hash h FROM bookings WHERE id=?').get(id).h === T.hash(tok)) review_url = `${base}/avaliar.html?t=${tok}`;
  }
  return { ...b, manage_url, review_url, wa: N.waMessages(b, manage_url, review_url),
    events: db.prepare('SELECT at,actor,action,details FROM booking_events WHERE booking_id=? ORDER BY id').all(id),
    payments: db.prepare('SELECT * FROM payments WHERE booking_id=? ORDER BY paid_at, id').all(id),
    notifications: db.prepare('SELECT kind,status,recipient,error,created_at FROM notifications WHERE booking_id=? ORDER BY id DESC LIMIT 20').all(id) };
};
adm.get('/bookings/:id', (req, res) => res.json(bookingDetail(int(req.params.id))));
adm.post('/bookings', (req, res) => {
  const b = C.createBooking({ ...req.body, accept_policy: true }, { admin: true });
  res.status(201).json(b);
});
adm.patch('/bookings/:id', (req, res) => {
  const id = int(req.params.id);
  if (req.body.status) C.setStatus(id, req.body.status, { reason: req.body.reason });
  if (typeof req.body.internal_notes === 'string') {
    db.prepare('UPDATE bookings SET internal_notes=?, updated_at=? WHERE id=?').run(C.clean(req.body.internal_notes, 1000), Date.now(), id);
    C.logEvent(id, 'painel', 'Notas internas atualizadas');
  }
  if (typeof req.body.payment_method === 'string') C.setPaymentMethod(id, req.body.payment_method);
  if (req.body.attendance) C.confirmAttendance(id, C.clean(req.body.attendance, 40) || 'telefone');
  res.json(bookingDetail(id));
});
adm.post('/bookings/:id/approve', (req, res) => { C.approve(int(req.params.id)); res.json(bookingDetail(int(req.params.id))); });
adm.post('/bookings/:id/reject', (req, res) => { C.reject(int(req.params.id), req.body.reason); res.json({ ok: true }); });
adm.post('/bookings/:id/suggest', wrap(async (req, res) => {
  const notified = await C.suggestTime(int(req.params.id), req.body);
  res.json({ ...bookingDetail(int(req.params.id)), notified });
}));
adm.post('/bookings/:id/move', (req, res) => {
  C.rescheduleBooking(int(req.params.id), { start: req.body.start, staff_id: req.body.staff_id }, { byAdmin: true, notify: req.body.notify !== false });
  res.json(bookingDetail(int(req.params.id)));
});
// horários livres de um dia (para escolher ao marcar, reagendar ou sugerir)
adm.get('/slots', (req, res) => {
  A.expirePendingHolds();
  const date = req.query.date;
  if (!A.parseDate(date)) throw new AppError(422, 'VALIDATION', 'Data inválida.');
  res.json(A.dayBoard(date, int(req.query.staff_id)).filter(t => t.state === 'livre'));
});

// pagamentos e financeiro
adm.post('/bookings/:id/payments', (req, res) => {
  const p = C.addPayment(int(req.params.id), req.body);
  res.status(p.duplicate ? 200 : 201).json(p);
});
adm.post('/payments/:id/void', (req, res) => { C.voidPayment(int(req.params.id), req.body.reason); res.json({ ok: true }); });
function periodOf(q) {
  const from = ISO.test(q.from || '') ? q.from : todayIso().slice(0, 8) + '01';
  const to = ISO.test(q.to || '') ? q.to : todayIso();
  if (to < from) throw new AppError(422, 'VALIDATION', 'A data final é anterior à inicial.');
  return { from, to, a: A.parseDate(from).toMillis(), b: A.parseDate(to).endOf('day').toMillis() };
}
adm.get('/finance', (req, res) => {
  const P = periodOf(req.query);
  const payments = db.prepare(`SELECT p.*, b.ref, b.service_name, b.start_at, c.name customer_name, COALESCE(cat.name, 'Sem categoria') category_name FROM payments p JOIN bookings b ON b.id=p.booking_id
    JOIN customers c ON c.id=b.customer_id LEFT JOIN services sv ON sv.id=b.service_id LEFT JOIN categories cat ON cat.id=sv.category_id
    WHERE p.paid_at BETWEEN ? AND ? ORDER BY p.paid_at DESC, p.id DESC`).all(P.a, P.b);
  const ok = payments.filter(p => p.status === 'pago');
  const byService = {}, byMethod = {}, byCategory = {};
  for (const p of ok) {
    byCategory[p.category_name] = (byCategory[p.category_name] || 0) + p.amount_cents;
    byService[p.service_name] = (byService[p.service_name] || { name: p.service_name, cents: 0, count: 0 });
    byService[p.service_name].cents += p.amount_cents; byService[p.service_name].count++;
    byMethod[p.method] = (byMethod[p.method] || 0) + p.amount_cents;
  }
  // por receber: serviços realizados (concluídos) no período, com valor acordado ainda não pago na totalidade
  const done = db.prepare(`${BOOKING_SELECT} WHERE b.status='completed' AND b.start_at BETWEEN ? AND ? ORDER BY b.start_at`).all(P.a, P.b);
  const outstanding = done.filter(b => b.price_cents == null || b.paid_cents < b.price_cents)
    .map(b => ({ ...b, due_cents: b.price_cents == null ? null : b.price_cents - b.paid_cents }));
  res.json({ ...P, received_cents: ok.reduce((a, p) => a + p.amount_cents, 0), payments_count: ok.length,
    outstanding_cents: outstanding.reduce((a, b) => a + (b.due_cents || 0), 0), outstanding, unpriced: outstanding.filter(b => b.due_cents == null).length,
    by_service: Object.values(byService).sort((x, y) => y.cents - x.cents), by_method: byMethod, payments, methods: C.METHODS,
    by_category: Object.entries(byCategory).map(([name, cents]) => ({ name, cents })).sort((x, y) => y.cents - x.cents),
    expenses_cents: db.prepare('SELECT COALESCE(SUM(amount_cents),0) v FROM expenses WHERE spent_on BETWEEN ? AND ?').get(P.from, P.to).v });
});
adm.get('/finance/month', (req, res) => {
  const m = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayIso().slice(0, 7);
  const first = A.parseDate(m + '-01'); if (!first) throw new AppError(422, 'VALIDATION', 'Mês inválido.');
  const a = first.toMillis(), b = first.endOf('month').toMillis();
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM bookings WHERE start_at BETWEEN ? AND ? GROUP BY status').all(a, b).map(r => [r.status, r.n]));
  const top = db.prepare(`SELECT service_name name, COUNT(*) n FROM bookings WHERE start_at BETWEEN ? AND ? AND status IN ('confirmed','completed') GROUP BY service_name ORDER BY n DESC, name LIMIT 5`).all(a, b);
  const received = db.prepare("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE status='pago' AND paid_at BETWEEN ? AND ?").get(a, b).v;
  res.json({ month: m, completed: counts.completed || 0, cancelled: counts.cancelled || 0, no_show: counts.no_show || 0,
    confirmed: counts.confirmed || 0, pending: counts.pending || 0, top_services: top, received_cents: received });
});

// ---------- painel: página inicial (resumo do negócio) ----------
const monthBounds = iso => { const f = A.parseDate(iso.slice(0, 7) + '-01'); return [f.toMillis(), f.endOf('month').toMillis()]; };
adm.get('/dashboard', (req, res) => {
  A.expirePendingHolds();
  const s = getSettings(), now = Date.now(), t = todayIso();
  const [d0, d1] = dayRange(t), [m0, m1] = monthBounds(t);
  const todayList = db.prepare(`${BOOKING_SELECT} WHERE b.start_at BETWEEN ? AND ? AND b.status<>'cancelled' ORDER BY b.start_at`).all(d0, d1);
  const pending = db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='pending'").get().n;
  const received = db.prepare("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE status='pago' AND paid_at BETWEEN ? AND ?").get(m0, m1).v;
  // clientes distintas atendidas no mês (marcações concluídas)
  const clients = db.prepare("SELECT COUNT(DISTINCT customer_id) n FROM bookings WHERE status='completed' AND start_at BETWEEN ? AND ?").get(m0, m1).n;
  const next = db.prepare(`${BOOKING_SELECT} WHERE b.status IN ('pending','confirmed') AND b.start_at > ? ORDER BY b.start_at LIMIT 1`).get(now) || null;
  res.json({ today: t, name: s.professional_name || s.business_name, integrations: N.integrations(),
    cards: { today: todayList.length, pending, month_received_cents: received, month_clients: clients, next },
    birthdays: C.upcomingBirthdays(0).map(c => ({ id: c.id, name: c.name })),
    bookings: todayList, open_days: db.prepare('SELECT COUNT(DISTINCT date) n FROM day_slots WHERE date>=?').get(t).n,
    weekly_hours: db.prepare('SELECT COUNT(*) n FROM business_hours').get().n });
});
// faturação recebida (pagamentos registados) por dia ou por mês
function revenueSeries(range) {
  const t = A.toLocal(Date.now()).startOf('day'), out = [];
  if (range === '12m') {
    for (let i = 11; i >= 0; i--) {
      const m = t.startOf('month').minus({ months: i });
      out.push({ key: m.toFormat('yyyy-MM'), a: m.toMillis(), b: m.endOf('month').toMillis() });
    }
  } else {
    const n = range === '30d' ? 30 : 7;
    for (let i = n - 1; i >= 0; i--) { const d = t.minus({ days: i }); out.push({ key: d.toISODate(), a: d.toMillis(), b: d.endOf('day').toMillis() }); }
  }
  const q = db.prepare("SELECT COALESCE(SUM(amount_cents),0) v, COUNT(*) n FROM payments WHERE status='pago' AND paid_at BETWEEN ? AND ?");
  const qe = db.prepare('SELECT COALESCE(SUM(amount_cents),0) v FROM expenses WHERE spent_on BETWEEN ? AND ?');
  return out.map(p => { const r = q.get(p.a, p.b);
    const e = range === '12m' ? qe.get(p.key + '-01', p.key + '-31').v : qe.get(p.key, p.key).v;
    return { key: p.key, cents: r.v, payments: r.n, expenses_cents: e }; });
}
adm.get('/revenue', (req, res) => {
  const range = ['7d', '30d', '12m'].includes(req.query.range) ? req.query.range : '30d';
  res.json({ range, unit: range === '12m' ? 'month' : 'day', series: revenueSeries(range) });
});

// ---------- financeiro: indicadores, despesas, resultado, categorias ----------
adm.get('/finance/overview', (req, res) => {
  const t = A.toLocal(Date.now());
  const sum = (a, b) => db.prepare("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE status='pago' AND paid_at BETWEEN ? AND ?").get(a, b).v;
  const dS = t.startOf('day'), wS = t.startOf('week'), mS = t.startOf('month'), yS = t.startOf('year');
  const [m0, m1] = [mS.toMillis(), t.endOf('month').toMillis()];
  const paidBookings = db.prepare("SELECT COUNT(DISTINCT booking_id) n FROM payments WHERE status='pago' AND paid_at BETWEEN ? AND ?").get(m0, m1).n;
  const monthCents = sum(m0, m1);
  const expMonth = db.prepare('SELECT COALESCE(SUM(amount_cents),0) v FROM expenses WHERE spent_on BETWEEN ? AND ?').get(mS.toISODate(), t.endOf('month').toISODate()).v;
  const expYear = db.prepare('SELECT COALESCE(SUM(amount_cents),0) v FROM expenses WHERE spent_on BETWEEN ? AND ?').get(yS.toISODate(), t.endOf('year').toISODate()).v;
  const yearCents = sum(yS.toMillis(), t.endOf('year').toMillis());
  res.json({ day_cents: sum(dS.toMillis(), t.endOf('day').toMillis()), week_cents: sum(wS.toMillis(), t.endOf('week').toMillis()),
    month_cents: monthCents, year_cents: yearCents, avg_ticket_cents: paidBookings ? Math.round(monthCents / paidBookings) : 0, paid_bookings_month: paidBookings,
    month_expenses_cents: expMonth, year_expenses_cents: expYear, month_result_cents: monthCents - expMonth, year_result_cents: yearCents - expYear,
    months: revenueSeries('12m') });
});
const EXPENSE_CATS = { produtos: 'Produtos e material', renda: 'Renda', equipamento: 'Equipamento', formacao: 'Formação', marketing: 'Publicidade e redes', servicos: 'Água, luz e internet', impostos: 'Impostos e taxas', outro: 'Outro' };
function expenseFields(b) {
  const day = String(b.spent_on || ''), cents = Math.round(Number(String(b.amount_eur ?? '').replace(/\s/g, '').replace(',', '.')) * 100);
  const errors = {};
  if (!ISO.test(day) || !A.parseDate(day)) errors.spent_on = 'Indica a data da despesa.';
  if (!(cents > 0) || cents > 100000000) errors.amount_eur = 'Indica um valor maior que zero.';
  if (Object.keys(errors).length) throw new AppError(422, 'VALIDATION', Object.values(errors)[0], { errors });
  return { spent_on: day, amount_cents: cents, category: EXPENSE_CATS[b.category] ? b.category : 'outro', description: C.clean(b.description, 300) };
}
adm.get('/expenses', (req, res) => {
  const P = periodOf(req.query);
  const list = db.prepare('SELECT * FROM expenses WHERE spent_on BETWEEN ? AND ? ORDER BY spent_on DESC, id DESC').all(P.from, P.to);
  res.json({ ...P, list, total_cents: list.reduce((a, e) => a + e.amount_cents, 0), categories: EXPENSE_CATS });
});
adm.post('/expenses', (req, res) => {
  const f = expenseFields(req.body), now = Date.now();
  const id = db.prepare('INSERT INTO expenses(spent_on,amount_cents,category,description,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(f.spent_on, f.amount_cents, f.category, f.description, now, now).lastInsertRowid;
  res.status(201).json({ id });
});
adm.put('/expenses/:id', (req, res) => {
  const f = expenseFields(req.body);
  const r = db.prepare('UPDATE expenses SET spent_on=?, amount_cents=?, category=?, description=?, updated_at=? WHERE id=?').run(f.spent_on, f.amount_cents, f.category, f.description, Date.now(), int(req.params.id));
  if (!r.changes) throw new AppError(404, 'NOT_FOUND', 'Despesa não encontrada.');
  res.json({ ok: true });
});
adm.delete('/expenses/:id', (req, res) => { db.prepare('DELETE FROM expenses WHERE id=?').run(int(req.params.id)); res.json({ ok: true }); });

// ---------- notificações do painel (o que aconteceu do lado das clientes e do sistema) ----------
const metaGet = k => (db.prepare('SELECT v FROM app_meta WHERE k=?').get(k) || {}).v;
const metaSet = (k, v) => db.prepare('INSERT INTO app_meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v));
adm.get('/inbox', (req, res) => {
  A.expirePendingHolds();
  const seen = Number(metaGet('inbox_seen_at') || Date.now() - 7 * 86400000);
  const items = db.prepare(`SELECT e.id, e.at, e.actor, e.action, e.details, e.booking_id, b.status, b.start_at, b.service_name, c.name customer_name, c.phone customer_phone
    FROM booking_events e JOIN bookings b ON b.id=e.booking_id JOIN customers c ON c.id=b.customer_id
    WHERE e.actor IN ('cliente','sistema') ORDER BY e.at DESC, e.id DESC LIMIT 80`).all();
  const t = A.toLocal(Date.now()).plus({ days: 1 }).toISODate(), [a, b] = dayRange(t);
  const tomorrow = db.prepare(`${BOOKING_SELECT} WHERE b.status='confirmed' AND b.start_at BETWEEN ? AND ? ORDER BY b.start_at`).all(a, b);
  const pending = db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='pending'").get().n;
  const rem = remindersTomorrow(); for (const x of tomorrow) { const r = rem.list.find(y => y.id === x.id) || {}; x.wa_reminder = r.wa_reminder; x.wa_reminder_sent = !!r.wa_reminder_sent; }
  res.json({ seen_at: seen, unread: items.filter(i => i.at > seen).length, items, tomorrow, tomorrow_date: t, pending, reminder_hour: rem.hour, reminder_due: rem.due,
    emails: db.prepare('SELECT id,booking_id,kind,recipient,status,error,created_at FROM notifications ORDER BY id DESC LIMIT 60').all(), integrations: N.integrations() });
});
// ---------- lembretes por WhatsApp na véspera (a partir da hora escolhida, 21h por defeito) ----------
function remindersTomorrow() {
  const s = getSettings(), now = A.toLocal(Date.now()), t = now.plus({ days: 1 }).toISODate(), [a, b] = dayRange(t);
  const list = db.prepare(`${BOOKING_SELECT} WHERE b.status='confirmed' AND b.start_at BETWEEN ? AND ? ORDER BY b.start_at`).all(a, b);
  const sentQ = db.prepare("SELECT 1 FROM booking_events WHERE booking_id=? AND action='WhatsApp aberto' AND details='lembrete' LIMIT 1");
  for (const x of list) {
    x.wa_reminder = N.waMessages(x, `${s.public_base_url}/gerir.html?t=${T.manageToken(x.ref, x.created_at)}`).reminder;
    x.wa_reminder_sent = !!sentQ.get(x.id);
  }
  const hour = Number(s.reminder_wa_hour) || 21;
  return { date: t, hour, due: now.hour >= hour, list, unsent: list.filter(x => !x.wa_reminder_sent).length };
}
adm.get('/reminders', (req, res) => res.json(remindersTomorrow()));
adm.get('/inbox/count', (req, res) => {
  const seen = Number(metaGet('inbox_seen_at') || Date.now() - 7 * 86400000);
  res.json({ unread: db.prepare("SELECT COUNT(*) n FROM booking_events WHERE actor IN ('cliente','sistema') AND at > ?").get(seen).n,
    pending: db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='pending'").get().n, reminders: (r => r.due ? r.unsent : 0)(remindersTomorrow()) });
});
adm.post('/inbox/seen', (req, res) => { metaSet('inbox_seen_at', Date.now()); res.json({ ok: true }); });

// ---------- exportação dos dados das clientes (RGPD: portabilidade / cópia de segurança própria) ----------
adm.get('/export/customers', (req, res) => {
  const list = db.prepare(`${CUSTOMER_STATS_SQL()} GROUP BY c.id ORDER BY c.name COLLATE NOCASE`).all(Date.now());
  res.json({ exported_at: Date.now(), count: list.length, customers: list.map(c => ({ id: c.id, name: c.name, phone: c.phone, email: c.email || '', birthday: c.birthday || '',
    birthday_consent: !!c.birthday_consent, marketing_consent: !!c.marketing_consent, created_at: c.created_at, first_visit: c.first_visit, last_visit: c.last_visit,
    visits: c.visits || 0, paid_cents: c.paid_cents || 0, notes: c.notes || '' })) });
});

// bloqueios
adm.get('/blocks', (req, res) => res.json(db.prepare(`SELECT b.*, s.name staff_name FROM blocks b LEFT JOIN staff s ON s.id=b.staff_id WHERE b.end_at > ? ORDER BY b.start_at`).all(int(req.query.from) || Date.now() - 30 * 86400000)));
adm.post('/blocks', (req, res) => {
  const start = int(req.body.start_at), end = int(req.body.end_at);
  if (!start || !end || end <= start) throw new AppError(422, 'VALIDATION', 'Indique um início e um fim válidos.');
  const type = ['pausa', 'ferias', 'folga', 'encerramento', 'bloqueio'].includes(req.body.type) ? req.body.type : 'bloqueio';
  const staffId = int(req.body.staff_id) || null;
  const affected = db.prepare(`${BOOKING_SELECT} WHERE b.status IN ('pending','confirmed') AND b.start_at >= ? AND b.start_at < ? ${staffId ? 'AND b.staff_id=?' : ''}`)
    .all(...[start, end, ...(staffId ? [staffId] : [])]);
  const id = db.prepare('INSERT INTO blocks(staff_id,type,start_at,end_at,reason,public_note,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(staffId, type, start, end, C.clean(req.body.reason, 200), C.clean(req.body.public_note, 200), Date.now()).lastInsertRowid;
  res.status(201).json({ id, affected }); // marcações existentes não são canceladas automaticamente: o painel avisa
});
adm.delete('/blocks/:id', (req, res) => { db.prepare('DELETE FROM blocks WHERE id=?').run(int(req.params.id)); C.processWaitlist().catch(() => {}); res.json({ ok: true }); });

// serviços e categorias
adm.get('/services', (req, res) => {
  res.json({
    categories: db.prepare('SELECT * FROM categories ORDER BY sort,id').all(),
    services: db.prepare(`SELECT s.*, (SELECT json_group_array(staff_id) FROM staff_services WHERE service_id=s.id) staff,
      (SELECT COUNT(*) FROM bookings b WHERE b.service_id=s.id) bookings FROM services s ORDER BY s.sort,s.id`).all()
      .map(({ duration_min, ...s }) => ({ ...s, staff: JSON.parse(s.staff) })),
    resources: db.prepare('SELECT * FROM resources ORDER BY id').all()
  });
});
function serviceFields(b) {
  const name = C.clean(b.name, 120);
  if (!name) throw new AppError(422, 'VALIDATION', 'Indica o nome do serviço.');
  let price = b.price_eur === '' || b.price_eur == null ? null : Math.round(Number(String(b.price_eur).replace(',', '.')) * 100);
  if (price != null && (!Number.isFinite(price) || price < 0)) throw new AppError(422, 'VALIDATION', 'Preço inválido.');
  const price_type = ['fixed', 'from', 'variable', 'addon'].includes(b.price_type) ? b.price_type : 'fixed';
  if ((price_type === 'from' || price_type === 'variable') && !C.clean(b.price_note)) throw new AppError(422, 'VALIDATION', 'Quando o preço varia, explica de que depende.');
  return { category_id: int(b.category_id) || null, name, description: C.clean(b.description, 1000), price_cents: price, price_type,
    price_note: C.clean(b.price_note, 300), requires_approval: b.requires_approval === undefined ? 1 : (b.requires_approval ? 1 : 0), resource_id: int(b.resource_id) || null,
    featured: b.featured ? 1 : 0, active: b.active === false ? 0 : 1, sort: int(b.sort) || 0, image_url: C.clean(b.image_url, 500),
    included: C.clean(b.included, 1000), preparation: C.clean(b.preparation, 1000),
    group_name: C.clean(b.group_name, 80), bookable: b.bookable === false || b.price_type === 'addon' ? 0 : 1 };
}
function setServiceStaff(id, staff) {
  if (!Array.isArray(staff)) return;
  db.prepare('DELETE FROM staff_services WHERE service_id=?').run(id);
  for (const sid of staff.map(int).filter(Boolean)) db.prepare('INSERT OR IGNORE INTO staff_services VALUES(?,?)').run(sid, id);
}
adm.post('/services', (req, res) => {
  const f = serviceFields(req.body);
  const id = db.prepare(`INSERT INTO services(category_id,name,description,duration_min,price_cents,price_type,price_note,requires_approval,resource_id,featured,active,sort,image_url,included,preparation,group_name,bookable)
    VALUES(@category_id,@name,@description,0,@price_cents,@price_type,@price_note,@requires_approval,@resource_id,@featured,@active,@sort,@image_url,@included,@preparation,@group_name,@bookable)`).run(f).lastInsertRowid;
  setServiceStaff(id, req.body.staff || db.prepare('SELECT id FROM staff WHERE active=1').all().map(s => s.id));
  res.status(201).json({ id });
});
adm.put('/services/:id', (req, res) => {
  const f = serviceFields(req.body); f.id = int(req.params.id);
  db.prepare(`UPDATE services SET category_id=@category_id,name=@name,description=@description,price_cents=@price_cents,price_type=@price_type,
    price_note=@price_note,requires_approval=@requires_approval,resource_id=@resource_id,featured=@featured,active=@active,sort=@sort,image_url=@image_url,included=@included,preparation=@preparation,group_name=@group_name,bookable=@bookable WHERE id=@id`).run(f);
  setServiceStaff(f.id, req.body.staff);
  res.json({ ok: true }); // marcações existentes mantêm o nome e o preço acordados no momento da marcação
});
adm.post('/services/:id/active', (req, res) => {
  const r = db.prepare('UPDATE services SET active=? WHERE id=?').run(req.body.active ? 1 : 0, int(req.params.id));
  if (!r.changes) throw new AppError(404, 'NOT_FOUND', 'Serviço não encontrado.');
  res.json({ ok: true });
});
adm.delete('/services/:id', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) n FROM bookings WHERE service_id=?').get(int(req.params.id)).n;
  if (used) { db.prepare('UPDATE services SET active=0 WHERE id=?').run(int(req.params.id)); return res.json({ ok: true, archived: true }); }
  db.prepare('DELETE FROM services WHERE id=?').run(int(req.params.id));
  res.json({ ok: true });
});
adm.post('/categories', (req, res) => {
  const name = C.clean(req.body.name, 80); if (!name) throw new AppError(422, 'VALIDATION', 'Indique o nome da categoria.');
  res.status(201).json({ id: db.prepare('INSERT INTO categories(name,description,sort,image_url,note) VALUES(?,?,?,?,?)').run(name, C.clean(req.body.description, 300), int(req.body.sort) || 0, C.clean(req.body.image_url, 500), C.clean(req.body.note, 300)).lastInsertRowid });
});
adm.put('/categories/:id', (req, res) => {
  const name = C.clean(req.body.name, 80); if (!name) throw new AppError(422, 'VALIDATION', 'Indique o nome da categoria.');
  db.prepare('UPDATE categories SET name=?, description=?, sort=?, image_url=?, note=? WHERE id=?').run(name, C.clean(req.body.description, 300), int(req.body.sort) || 0, C.clean(req.body.image_url, 500), C.clean(req.body.note, 300), int(req.params.id));
  res.json({ ok: true });
});
adm.delete('/categories/:id', (req, res) => { db.prepare('DELETE FROM categories WHERE id=?').run(int(req.params.id)); res.json({ ok: true }); });
adm.post('/resources', (req, res) => {
  const name = C.clean(req.body.name, 80); if (!name) throw new AppError(422, 'VALIDATION', 'Indique o nome.');
  res.status(201).json({ id: db.prepare('INSERT INTO resources(name) VALUES(?)').run(name).lastInsertRowid });
});
adm.delete('/resources/:id', (req, res) => { db.prepare('DELETE FROM resources WHERE id=?').run(int(req.params.id)); res.json({ ok: true }); });

// profissionais
const validHours = rows => (Array.isArray(rows) ? rows : []).filter(r => r.weekday >= 1 && r.weekday <= 7 && /^\d\d:\d\d$/.test(r.start) && /^\d\d:\d\d$/.test(r.end) && r.start < r.end);
adm.get('/staff', (req, res) => res.json(db.prepare('SELECT * FROM staff ORDER BY sort,id').all().map(s => ({ ...s,
  hours: db.prepare('SELECT weekday,start,end FROM staff_hours WHERE staff_id=? ORDER BY weekday,start').all(s.id),
  services: db.prepare('SELECT service_id FROM staff_services WHERE staff_id=?').all(s.id).map(r => r.service_id) }))));
function saveStaff(id, b) {
  const name = C.clean(b.name, 80); if (!name) throw new AppError(422, 'VALIDATION', 'Indique o nome.');
  const f = [name, C.clean(b.role, 80), C.clean(b.bio, 1000), C.clean(b.photo_url, 500), b.active === false ? 0 : 1, int(b.sort) || 0];
  if (id) db.prepare('UPDATE staff SET name=?,role=?,bio=?,photo_url=?,active=?,sort=? WHERE id=?').run(...f, id);
  else id = db.prepare('INSERT INTO staff(name,role,bio,photo_url,active,sort) VALUES(?,?,?,?,?,?)').run(...f).lastInsertRowid;
  if (Array.isArray(b.hours)) {
    db.prepare('DELETE FROM staff_hours WHERE staff_id=?').run(id);
    for (const h of validHours(b.hours)) db.prepare('INSERT INTO staff_hours(staff_id,weekday,start,end) VALUES(?,?,?,?)').run(id, h.weekday, h.start, h.end);
  }
  if (Array.isArray(b.services)) {
    db.prepare('DELETE FROM staff_services WHERE staff_id=?').run(id);
    for (const sid of b.services.map(int).filter(Boolean)) db.prepare('INSERT OR IGNORE INTO staff_services VALUES(?,?)').run(id, sid);
  }
  return id;
}
adm.post('/staff', (req, res) => res.status(201).json({ id: db.transaction(() => saveStaff(null, req.body))() }));
adm.put('/staff/:id', (req, res) => { db.transaction(() => saveStaff(int(req.params.id), req.body))(); res.json({ ok: true }); });

// horário e definições
// Disponibilidade dia a dia (horários abertos à mão)
adm.get('/day-slots', (req, res) => {
  const from = ISO.test(req.query.from || '') ? req.query.from : '0000-00-00', to = ISO.test(req.query.to || '') ? req.query.to : '9999-12-31';
  const rows = db.prepare('SELECT date,time FROM day_slots WHERE date>=? AND date<=? ORDER BY date,time').all(from, to);
  const out = {}; for (const r of rows) (out[r.date] ||= []).push(r.time);
  res.json(Object.entries(out).map(([date, times]) => ({ date, times })));
});
adm.put('/day-slots/:date', (req, res) => {
  const date = req.params.date;
  if (!ISO.test(date) || !A.parseDate(date)) throw new AppError(422, 'VALIDATION', 'Data inválida.');
  const times = [...new Set((Array.isArray(req.body.times) ? req.body.times : []).map(String))];
  if (times.some(t => !HM.test(t))) throw new AppError(422, 'VALIDATION', 'Hora inválida (usa HH:MM).');
  if (times.length > 48) throw new AppError(422, 'VALIDATION', 'Demasiados horários para um dia.');
  // horas com marcação ativa não podem ser fechadas (reagendar ou cancelar primeiro)
  const [d0, d1] = dayRange(date);
  const booked = db.prepare(`SELECT start_at FROM bookings WHERE status IN ('pending','confirmed') AND start_at BETWEEN ? AND ?`).all(d0, d1).map(r => A.toLocal(r.start_at).toFormat('HH:mm'));
  // (também ao passar um dia do horário semanal para horas escolhidas à mão)
  const before = db.prepare('SELECT time FROM day_slots WHERE date=?').all(date).map(r => r.time);
  const removed = [...new Set(booked)].filter(t => !times.includes(t));
  if (removed.length && (times.length || before.length)) throw new AppError(409, 'BOOKED', `Não é possível retirar ${removed.join(', ')}: já tem marcação. Reagenda ou cancela primeiro.`);
  db.transaction(() => {
    db.prepare('DELETE FROM day_slots WHERE date=?').run(date);
    const ins = db.prepare('INSERT INTO day_slots(date,time) VALUES(?,?)');
    for (const t of times.sort()) ins.run(date, t);
  })();
  res.json({ date, times: times.sort() });
});
adm.get('/hours', (req, res) => res.json(db.prepare('SELECT weekday,start,end FROM business_hours ORDER BY weekday,start').all()));
adm.put('/hours', (req, res) => {
  const rows = validHours(req.body.hours);
  db.transaction(() => {
    db.prepare('DELETE FROM business_hours').run();
    for (const h of rows) db.prepare('INSERT INTO business_hours(weekday,start,end) VALUES(?,?,?)').run(h.weekday, h.start, h.end);
    saveSettings({ hours_confirmed: true });
  })();
  res.json({ ok: true });
});
adm.get('/settings', (req, res) => res.json({ settings: getSettings(), integrations: N.integrations(), status: N.integrationStatus(), zones: A.ZONES }));
// email de teste para a Adriana: confirma que a configuração do envio (ex.: iCloud) está certa
adm.post('/integrations/test-email', wrap(async (req, res) => {
  const s = getSettings();
  if (!/@/.test(s.email || '')) throw new AppError(422, 'VALIDATION', 'Preenche primeiro o email do espaço em Definições → Negócio e contactos.');
  if (!N.smtpConfigured()) return res.json({ ok: false, status: 'not_configured', error: 'O envio de email ainda não está configurado no servidor (SMTP_HOST e SMTP_FROM).' });
  const ok = await N.sendEmail({ to: s.email, kind: 'test', subject: `Email de teste — ${s.business_name}`,
    text: `Olá!\n\nEste é um email de teste enviado pelo painel. Se o estás a ler, as confirmações e os lembretes às clientes vão funcionar.\n\n${s.business_name}` });
  const last = db.prepare("SELECT status, error FROM notifications WHERE kind='test' ORDER BY id DESC LIMIT 1").get() || {};
  res.json({ ok, status: last.status, error: last.error || '', to: s.email });
}));
adm.post('/bookings/:id/wa-log', (req, res) => {
  const L = { pending: 'marcação recebida', confirmed: 'marcação confirmada', reminder: 'lembrete', proposed: 'proposta de horário', cancelled: 'aviso de cancelamento', review: 'pedido de avaliação' };
  const k = L[req.body.kind] ? req.body.kind : null; if (!k) throw new AppError(422, 'VALIDATION', 'Mensagem desconhecida.');
  C.logEvent(int(req.params.id), 'painel', 'WhatsApp aberto', L[k]); res.json({ ok: true });
});
adm.get('/integrations', (req, res) => {
  const recent = db.prepare(`SELECT status, COUNT(*) n FROM notifications WHERE created_at > ? GROUP BY status`).all(Date.now() - 30 * 86400000);
  res.json({ ...N.integrationStatus(), last30: Object.fromEntries(recent.map(r => [r.status, r.n])) });
});
const NUMERIC = { slot_step_min: [5, 240], min_notice_hours: [0, 720], max_advance_days: [1, 365], cancel_limit_hours: [0, 720],
  reschedule_limit_hours: [0, 720], pending_hold_hours: [1, 168], waitlist_offer_minutes: [10, 2880], waitlist_max_offers: [1, 10], reminder_hours: [1, 168], reminder_wa_hour: [8, 23], review_invite_delay_hours: [0, 168], deposit_percent: [10, 100] };
adm.put('/settings', (req, res) => {
  const out = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!(k in DEFAULT_SETTINGS) || k === 'public_base_url' && process.env.PUBLIC_BASE_URL) continue;
    if (k === 'iban') {
      const raw = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (raw && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(raw)) throw new AppError(422, 'VALIDATION', 'IBAN inválido. Confirma os dígitos (ex.: PT50 …).');
      out[k] = raw.replace(/(.{4})/g, '$1 ').trim(); continue;
    }
    if (k === 'timezone') { if (!A.ZONES.includes(v)) throw new AppError(422, 'VALIDATION', 'Fuso horário inválido.'); out[k] = v; continue; }
    if (NUMERIC[k]) {
      const n = Number(v); const [a, b] = NUMERIC[k];
      if (!Number.isFinite(n) || n < a || n > b) throw new AppError(422, 'VALIDATION', `Valor inválido para ${k} (entre ${a} e ${b}).`);
      out[k] = n;
    } else if (Array.isArray(DEFAULT_SETTINGS[k])) out[k] = Array.isArray(v) ? v : [];
    else if (typeof DEFAULT_SETTINGS[k] === 'boolean') out[k] = !!v;
    // textos longos (políticas, mensagens): mantém as quebras de linha/parágrafos
    else out[k] = String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 4000);
  }
  saveSettings(out);
  res.json({ ok: true });
});

// lista de espera
adm.get('/waitlist', (req, res) => res.json(db.prepare(`SELECT w.*, s.name service_name, st.name staff_name FROM waitlist w JOIN services s ON s.id=w.service_id
  LEFT JOIN staff st ON st.id=w.staff_id WHERE w.status IN ('active','offered') OR w.created_at > ? ORDER BY w.created_at`).all(Date.now() - 30 * 86400000)
  .map(w => ({ ...w, offer_token_hash: undefined, manage_token_hash: undefined, days: JSON.parse(w.days || '[]'), periods: JSON.parse(w.periods || '[]'),
    matches: w.status === 'active' ? C.waitlistMatches(w, 3) : [] }))));
adm.post('/waitlist', (req, res) => res.status(201).json({ id: C.addWaitlistManual(req.body) }));
adm.post('/waitlist/:id/contacted', (req, res) => {
  db.prepare('UPDATE waitlist SET contacted_at=?, notes=COALESCE(NULLIF(?,\'\'), notes) WHERE id=?').run(Date.now(), C.clean(req.body.notes, 300), int(req.params.id));
  res.json({ ok: true });
});
adm.post('/waitlist/:id/booked', (req, res) => {
  db.prepare("UPDATE waitlist SET status='booked', booking_id=? WHERE id=?").run(int(req.body.booking_id) || null, int(req.params.id));
  res.json({ ok: true });
});
adm.delete('/waitlist/:id', (req, res) => {
  db.prepare("UPDATE waitlist SET status='cancelled', offer_token_hash=NULL WHERE id=?").run(int(req.params.id));
  C.processWaitlist().catch(() => {});
  res.json({ ok: true });
});
adm.post('/waitlist/process', wrap(async (req, res) => res.json({ offers: await C.processWaitlist() })));

// clientes
const CUSTOMER_STATS_SQL = () => CUSTOMER_STATS;
const CUSTOMER_STATS = `SELECT c.*,
  SUM(CASE WHEN b.status='completed' THEN 1 ELSE 0 END) visits,
  MIN(CASE WHEN b.status='completed' THEN b.start_at END) first_visit,
  (SELECT COALESCE(SUM(p.amount_cents),0) FROM payments p JOIN bookings pb ON pb.id=p.booking_id WHERE pb.customer_id=c.id AND p.status='pago') paid_cents,
  MAX(CASE WHEN b.status='completed' THEN b.start_at END) last_visit,
  MIN(CASE WHEN b.status IN ('pending','confirmed') AND b.start_at > ? THEN b.start_at END) next_visit,
  SUM(CASE WHEN b.status='cancelled' THEN 1 ELSE 0 END) cancellations,
  SUM(CASE WHEN b.status='no_show' THEN 1 ELSE 0 END) no_shows,
  COUNT(b.id) total
  FROM customers c LEFT JOIN bookings b ON b.customer_id=c.id`;
adm.get('/customers', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60), d = C.digits(q);
  const rows = db.prepare(`${CUSTOMER_STATS} WHERE c.name LIKE ? OR c.email LIKE ? ${d.length >= 3 ? "OR REPLACE(REPLACE(c.phone,' ',''),'+','') LIKE ?" : ''}
    GROUP BY c.id ORDER BY c.name COLLATE NOCASE LIMIT ?`).all(Date.now(), `%${q}%`, `%${q}%`, ...(d.length >= 3 ? [`%${d}%`] : []), Math.min(int(req.query.limit) || 300, 500));
  const dupIds = new Set(duplicateGroups().flat().map(c => c.id));
  res.json(rows.map(r => ({ ...r, possible_duplicate: dupIds.has(r.id) })));
});
// duplicados possíveis: mesmo telefone ou mesmo email. O nome sozinho nunca basta (pessoas diferentes podem ter o mesmo nome).
function duplicateGroups() {
  const all = db.prepare('SELECT id,name,email,phone,created_at FROM customers').all();
  const groups = new Map();
  for (const c of all) {
    for (const k of [C.digits(c.phone).length >= 9 ? 't:' + C.digits(c.phone) : null, c.email ? 'e:' + c.email.toLowerCase() : null].filter(Boolean)) {
      if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c);
    }
  }
  const seen = new Set(), out = [];
  for (const [k, g] of groups) {
    if (g.length < 2) continue;
    const sig = g.map(c => c.id).sort().join(','); if (seen.has(sig)) continue; seen.add(sig);
    out.push(g.map(c => ({ ...c, reason: k.startsWith('t:') ? 'mesmo telefone' : 'mesmo email' })));
  }
  return out;
}
adm.get('/customers/duplicates', (req, res) => res.json(duplicateGroups()));
adm.get('/customers/:id', (req, res) => {
  const c = db.prepare(`${CUSTOMER_STATS} WHERE c.id=? GROUP BY c.id`).get(Date.now(), int(req.params.id));
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Cliente não encontrada.');
  const bookings = db.prepare(`${BOOKING_SELECT} WHERE c.id=? ORDER BY b.start_at DESC`).all(c.id);
  const dups = duplicateGroups().find(g => g.some(x => x.id === c.id));
  res.json({ ...c, bookings, paid_cents: bookings.reduce((a, b) => a + b.paid_cents, 0),
    services: Object.entries(bookings.filter(b => b.status === 'completed').reduce((m, b) => (m[b.service_name] = (m[b.service_name] || 0) + 1, m), {})).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    duplicates: dups ? dups.filter(x => x.id !== c.id) : [] });
});
// aniversários e formulário de registo
adm.get('/birthdays', (req, res) => {
  const s = getSettings();
  res.json({ list: C.upcomingBirthdays(Math.min(int(req.query.days) || 31, 366)).map(c => ({ ...c, message: N.birthdayText(c, s) })),
    email_auto: !!s.birthday_email_enabled, email_configured: N.smtpConfigured() });
});
adm.post('/customers/:id/greeted', (req, res) => {
  const c = C.upcomingBirthdays(366).find(x => x.id === int(req.params.id));
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Cliente sem aniversário registado.');
  db.prepare('UPDATE customers SET birthday_greeted_year=? WHERE id=?').run(req.body.undo ? null : +c.next_date.slice(0, 4), c.id);
  res.json({ ok: true });
});
adm.get('/register/stats', (req, res) => {
  const rows = db.prepare("SELECT source, registered_at FROM customers WHERE registered_at IS NOT NULL").all();
  const by = {}; for (const r of rows) { const k = String(r.source || '').replace(/^registo:/, '') || 'link'; by[k] = (by[k] || 0) + 1; }
  res.json({ total: rows.length, last30: rows.filter(r => r.registered_at > Date.now() - 30 * 86400000).length, by_origin: by,
    recent: db.prepare("SELECT id,name,email,phone,birthday,birthday_consent,source,registered_at FROM customers WHERE registered_at IS NOT NULL ORDER BY registered_at DESC LIMIT 10").all() });
});

adm.post('/customers', (req, res) => {
  const c = C.validateContact(req.body, { emailOptional: true });
  if (!req.body.force_new) { const m = C.findCustomerMatches(c); if (m.length) throw new AppError(409, 'POSSIBLE_DUPLICATE', 'Já existe uma ficha com este telefone ou email.', { matches: m }); }
  const bd = birthdayOf(req.body);
  try { res.status(201).json({ id: db.prepare('INSERT INTO customers(name,email,phone,notes,marketing_consent,created_at,birthday,birthday_consent,birthday_consent_at) VALUES(?,?,?,?,0,?,?,?,?)')
    .run(c.name, c.email, c.phone, C.clean(req.body.notes, 1000), Date.now(), bd, req.body.birthday_consent ? 1 : 0, req.body.birthday_consent ? Date.now() : null).lastInsertRowid }); }
  catch (e) { if (/UNIQUE/.test(e.message)) throw new AppError(409, 'DUPLICATE', 'Já existe uma cliente com este email.'); throw e; }
});
function birthdayOf(b) {
  if (b.birthday == null || b.birthday === '') return null;
  if (!C.validBirthday(String(b.birthday))) throw new AppError(422, 'VALIDATION', 'Aniversário inválido (dia e mês).');
  return String(b.birthday);
}
adm.put('/customers/:id', (req, res) => {
  const c = C.validateContact(req.body, { emailOptional: true });
  if ('birthday' in req.body) db.prepare('UPDATE customers SET birthday=?, birthday_consent=?, birthday_consent_at=CASE WHEN ? THEN COALESCE(birthday_consent_at, ?) ELSE NULL END WHERE id=?')
    .run(birthdayOf(req.body), req.body.birthday_consent ? 1 : 0, req.body.birthday_consent ? 1 : 0, Date.now(), int(req.params.id));
  try {
    db.prepare('UPDATE customers SET name=?, email=?, phone=?, notes=?, marketing_consent=?, marketing_consent_at=CASE WHEN ? THEN COALESCE(marketing_consent_at, ?) ELSE NULL END WHERE id=?')
      .run(c.name, c.email, c.phone, C.clean(req.body.notes, 1000), req.body.marketing_consent ? 1 : 0, req.body.marketing_consent ? 1 : 0, Date.now(), int(req.params.id));
  } catch (e) { if (/UNIQUE/.test(e.message)) throw new AppError(409, 'DUPLICATE', 'Já existe uma cliente com este email.'); throw e; }
  res.json({ ok: true });
});
// juntar duas fichas (só por decisão explícita da esteticista): as marcações passam para a ficha que fica
// RGPD — apagar dados pessoais de uma cliente (mantém marcações e pagamentos anónimos para a contabilidade)
adm.post('/customers/:id/anonymize', (req, res) => {
  const id = int(req.params.id);
  const c = db.prepare('SELECT id, email, phone FROM customers WHERE id=?').get(id);
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Cliente não encontrada.');
  db.transaction(() => {
    db.prepare("UPDATE waitlist SET name='Cliente apagada', email='', phone='', notes='' WHERE (email<>'' AND email=?) OR (phone<>'' AND phone=?)").run(c.email || '', c.phone || '');
    db.prepare(`UPDATE customers SET name=?, email=NULL, phone=?, notes='', marketing_consent=0, birthday=NULL, birthday_consent=0, birthday_consent_at=NULL, source='', registered_at=NULL WHERE id=?`)
      .run('Cliente apagada #' + id, 'apagado-' + id, id);
    db.prepare("UPDATE bookings SET internal_notes='' WHERE customer_id=?").run(id);
  })();
  res.json({ ok: true });
});
adm.post('/customers/:id/merge', (req, res) => {
  const from = int(req.params.id), into = int(req.body.into_id);
  if (!from || !into || from === into) throw new AppError(422, 'VALIDATION', 'Escolhe a ficha que fica.');
  db.transaction(() => {
    const a = db.prepare('SELECT * FROM customers WHERE id=?').get(from), b = db.prepare('SELECT * FROM customers WHERE id=?').get(into);
    if (!a || !b) throw new AppError(404, 'NOT_FOUND', 'Cliente não encontrada.');
    db.prepare('UPDATE bookings SET customer_id=? WHERE customer_id=?').run(into, from);
    const notes = [b.notes, a.notes && `[Da ficha junta: ${a.name}] ${a.notes}`].filter(Boolean).join('\n');
    db.prepare('UPDATE customers SET notes=?, email=COALESCE(email, ?), marketing_consent=MAX(marketing_consent, ?) WHERE id=?').run(notes.slice(0, 2000), null, a.marketing_consent, into);
    db.prepare('DELETE FROM customers WHERE id=?').run(from);
    if (a.email && !b.email) db.prepare('UPDATE customers SET email=? WHERE id=?').run(a.email, into);
  })();
  res.json({ ok: true, id: into });
});

// avaliações
adm.get('/reviews', (req, res) => res.json(db.prepare(`SELECT r.*, b.ref, c.name customer_name FROM reviews r JOIN bookings b ON b.id=r.booking_id
  JOIN customers c ON c.id=b.customer_id ORDER BY r.created_at DESC`).all()));
adm.post('/reviews/:id', (req, res) => { C.moderateReview(int(req.params.id), req.body); res.json({ ok: true }); });

// fotografias: o painel reduz a imagem no browser (WebP/JPEG, máx. 1600 px) antes de enviar
const UPLOAD_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'uploads');
require('fs').mkdirSync(UPLOAD_DIR, { recursive: true });
// no Netlify as fotografias ficam no Netlify Blobs (global.__UPLOAD_STORE, definido em netlify/functions/api.js)
const saveUpload = async (name, buf, type) => global.__UPLOAD_STORE ? global.__UPLOAD_STORE.set(name, buf, type) : require('fs').writeFileSync(path.join(UPLOAD_DIR, name), buf);
adm.post('/uploads', express.json({ limit: '4mb' }), wrap(async (req, res) => {
  const m = String(req.body.data || '').match(/^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new AppError(422, 'VALIDATION', 'Formato de imagem não suportado (use JPG, PNG ou WebP).');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2.5 * 1024 * 1024) throw new AppError(422, 'VALIDATION', 'A imagem é demasiado grande (máx. 2,5 MB depois de otimizada).');
  const name = `${Date.now()}-${T.random(6)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  await saveUpload(name, buf, 'image/' + m[1]);
  res.status(201).json({ url: `/uploads/${name}` });
}));

// vídeo do espaço (MP4/WebM, enviado tal como está) — toca sozinho, sem som, em "O espaço"
adm.post('/uploads/video', express.raw({ type: ['video/mp4', 'video/webm', 'video/quicktime'], limit: '60mb' }), wrap(async (req, res) => {
  const ext = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[String(req.headers['content-type']).split(';')[0]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) throw new AppError(422, 'VALIDATION', 'Formato de vídeo não suportado (usa MP4).');
  if (global.__UPLOAD_STORE && req.body.length > 5.5 * 1024 * 1024) throw new AppError(413, 'TOO_LARGE', 'No Netlify, os vídeos podem ter no máximo 5 MB. Comprime o vídeo ou usa um link do Instagram.');
  const name = `${Date.now()}-${T.random(6)}.${ext}`;
  await saveUpload(name, req.body, String(req.headers['content-type']).split(';')[0]);
  res.status(201).json({ url: `/uploads/${name}` });
}));

adm.get('/notifications', (req, res) => res.json(db.prepare('SELECT id,booking_id,waitlist_id,channel,kind,recipient,subject,status,error,created_at FROM notifications ORDER BY id DESC LIMIT 200').all()));

app.use('/api/admin', adm);

// ---------- erros ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Não encontrado.' }));
app.use((err, req, res, next) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Pedido inválido.' });
  console.error(err);
  res.status(500).json({ error: 'Ocorreu um erro inesperado. Tenta novamente.' });
});

// ---------- ficheiros estáticos ----------
app.get('/uploads/:name', wrap(async (req, res, next) => {
  if (!global.__UPLOAD_STORE) return next();
  const f = /^[\w.-]+$/.test(req.params.name) ? await global.__UPLOAD_STORE.get(req.params.name) : null;
  if (!f) return res.status(404).send('Não encontrado');
  res.set({ 'Content-Type': f.type || 'application/octet-stream', 'Cache-Control': 'public, max-age=2592000, immutable' }).send(f.data);
}));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.get('/sobre.html', (req, res) => res.redirect(301, '/espaco.html'));
app.get('/precario.html', (req, res) => res.redirect(301, '/servicos.html'));
// endereço curto para o painel: o-teu-dominio.pt/painel
app.get(['/painel', '/painel/'], (req, res) => res.redirect(302, '/admin/'));
app.get('/avaliacoes.html', (req, res) => res.redirect(301, '/#fb-sec')); // as avaliações passaram para a secção de feedback da página inicial
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));
// pesquisa no Google: robots.txt e sitemap.xml (o endereço vem de PUBLIC_BASE_URL ou do próprio pedido)
const siteUrl = req => (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin/\nDisallow: /api/\nDisallow: /gerir.html\nDisallow: /avaliar.html\nDisallow: /oferta.html\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => {
  const base = siteUrl(req);
  const pages = ['/', '/servicos.html', '/marcar.html', '/espaco.html', '/contactos.html', '/politicas.html', '/privacidade.html'];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `  <url><loc>${base}${p}</loc></url>`).join('\n')}\n</urlset>\n`);
});
// tipos de letra, imagens e vídeo mudam raramente: cache longa; HTML/CSS/JS: cache curta (revalidada)
const PROD = process.env.NODE_ENV === 'production';
app.use(express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html'], maxAge: PROD ? '1h' : 0,
  setHeaders(res, file) {
    if (/[\\/]admin[\\/]sw\.js$/.test(file) || (/\.(html|js|css|webmanifest)$/.test(file) && !/[\\/]vendor[\\/]/.test(file))) res.set('Cache-Control', 'no-cache');
    else if (PROD && /[\\/]assets[\\/](fonts|img|video)[\\/]/.test(file)) res.set('Cache-Control', 'public, max-age=2592000');
  },
}));

module.exports = { app, hashPassword };
