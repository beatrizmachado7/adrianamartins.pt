'use strict';
// Regras de negócio: marcações (transacionais), lista de espera, avaliações e tarefas automáticas.
const crypto = require('crypto');
const { db, getSettings } = require('./db');
const A = require('./availability');
const T = require('./tokens');
const N = require('./notify');

class AppError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

const REASONS = {
  booking: 'Este horário acabou de ser reservado.', resource: 'A sala ou equipamento necessário já está ocupado nesse horário.',
  block: 'Este horário está bloqueado (pausa, férias ou encerramento).', offer: 'Este horário está reservado temporariamente para outra cliente.',
  min_notice: 'Este horário já não respeita a antecedência mínima para marcar online.', max_advance: 'Ainda não é possível marcar para esta data.',
  outside_hours: 'Este horário está fora do horário de atendimento.', too_old: 'Data inválida.'
};

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRef = () => Array.from(crypto.randomBytes(6), b => ALPH[b % ALPH.length]).join('');

// ---------- validação ----------
const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
function validateContact(body, { emailOptional = false } = {}) {
  const name = clean(body.name, 80), email = clean(body.email, 120).toLowerCase(), phone = clean(body.phone, 30);
  const errors = {};
  if (name.length < 2) errors.name = 'Indica o teu nome.';
  if (!(emailOptional && !email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Indica um email válido.';
  const digits = phone.replace(/[^\d]/g, '');
  if (!/^\+?[\d\s().-]{9,20}$/.test(phone) || digits.length < 9) errors.phone = 'Indica um telefone válido (ex.: 912 345 678).';
  if (Object.keys(errors).length) throw new AppError(422, 'VALIDATION', 'Verifica os dados indicados.', { errors });
  return { name, email: email || null, phone };
}

function getService(id, { includeInactive = false } = {}) {
  const s = db.prepare('SELECT * FROM services WHERE id=?').get(Number(id));
  if (!s || (!s.active && !includeInactive)) throw new AppError(404, 'SERVICE', 'Serviço não encontrado.');
  return s;
}

const last9 = p => String(p || '').replace(/\D/g, '').slice(-9);
function upsertCustomer({ name, email, phone }, marketing) {
  // a mesma cliente é reconhecida pelo email (se indicado) ou pelo telemóvel
  const ex = (email && db.prepare('SELECT * FROM customers WHERE email=?').get(email))
    || db.prepare('SELECT * FROM customers WHERE phone IS NOT NULL ORDER BY id').all().find(c => last9(c.phone) && last9(c.phone) === last9(phone));
  if (ex) {
    db.prepare('UPDATE customers SET name=?, phone=? WHERE id=?').run(name, phone, ex.id);
    if (marketing === true && !ex.marketing_consent) db.prepare('UPDATE customers SET marketing_consent=1, marketing_consent_at=? WHERE id=?').run(Date.now(), ex.id);
    return ex.id;
  }
  return db.prepare('INSERT INTO customers(name,email,phone,marketing_consent,marketing_consent_at,created_at) VALUES(?,?,?,?,?,?)')
    .run(name, email, phone, marketing ? 1 : 0, marketing ? Date.now() : null, Date.now()).lastInsertRowid;
}

// ---------- histórico ----------
const ACTORS = { cliente: 'cliente', painel: 'painel', sistema: 'sistema' };
function logEvent(bookingId, actor, action, details = '') {
  db.prepare('INSERT INTO booking_events(booking_id,at,actor,action,details) VALUES(?,?,?,?,?)').run(bookingId, Date.now(), ACTORS[actor] || 'sistema', action, String(details || '').slice(0, 500));
}
const when = ms => A.toLocal(ms).toFormat('dd/MM/yyyy HH:mm');
const digits = p => String(p || '').replace(/\D/g, '').replace(/^351(?=\d{9}$)/, '');

// ---------- marcações ----------
// Cada marcação ocupa um horário (hora de início) da profissional. Não há duração nem hora de fim.
function slotTaken(e) { return e instanceof AppError ? e.code === 'SLOT_TAKEN' : /SLOT_TAKEN|UNIQUE constraint failed: bookings\.staff_id/.test(e.message); }

/** Possíveis duplicados de uma cliente: mesmo telefone ou mesmo email (o nome sozinho nunca basta). */
function findCustomerMatches({ phone, email }) {
  const d = digits(phone);
  return db.prepare('SELECT id,name,email,phone FROM customers').all()
    .filter(c => (d.length >= 9 && digits(c.phone) === d) || (email && c.email && c.email.toLowerCase() === String(email).toLowerCase()));
}

/**
 * Cria uma marcação. Tudo dentro de uma transação IMMEDIATE: o bloqueio de escrita do SQLite
 * garante que duas confirmações simultâneas (mesmo em processos diferentes) são serializadas,
 * e a disponibilidade é revalidada já com o bloqueio adquirido. A base de dados recusa ainda
 * qualquer segunda marcação ativa da mesma profissional à mesma hora (índice único + gatilho).
 */
// Como a cliente prefere pagar (fica registado na marcação). Não há pagamento automático: a Adriana regista o que recebe.
const PAY_PREFS = { mbway: 'MB WAY', transferencia: 'Transferência bancária', mao: 'Em mão (no espaço)' };
const depositFor = (price, settings) => settings.deposit_enabled && price != null && price > 0 ? Math.round(price * (Number(settings.deposit_percent) || 50) / 100) : null;
const payPref = (v, settings) => {
  const k = PAY_PREFS[v] ? v : '';
  if (k === 'transferencia' && !String(settings.iban || '').trim()) return '';
  return k;
};

function createBooking(input, { admin = false, offerId = null } = {}) {
  const settings = getSettings();
  const service = getService(input.service_id, { includeInactive: admin });
  if (!admin && service.bookable === 0) throw new AppError(422, 'SERVICE', 'Este serviço é um extra e é acrescentado durante o atendimento — escolhe o serviço principal.');
  const start = Number(input.start);
  if (!Number.isFinite(start)) throw new AppError(422, 'VALIDATION', 'Horário inválido.');
  if (!admin && !input.accept_policy) throw new AppError(422, 'POLICY', 'É necessário aceitar a política de cancelamento.');
  // cliente: no painel pode reutilizar-se a ficha existente (customer_id)
  let existing = null, contact = null;
  if (admin && input.customer_id) {
    existing = db.prepare('SELECT * FROM customers WHERE id=?').get(Number(input.customer_id));
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Cliente não encontrada.');
  } else {
    contact = validateContact(input, { emailOptional: true }); // contacto principal: telemóvel (WhatsApp); email opcional
    if (admin && !input.force_new) {
      const m = findCustomerMatches(contact);
      if (m.length) throw new AppError(409, 'POSSIBLE_DUPLICATE', 'Já existe uma ficha com este telefone ou email. Escolhe se é a mesma cliente.', { matches: m });
    }
  }
  const wantedStaff = input.staff_id ? Number(input.staff_id) : null;

  const run = db.transaction(() => {
    A.expirePendingHolds();
    const candidates = A.staffForService(service.id, wantedStaff);
    if (!candidates.length) throw new AppError(422, 'STAFF', 'Profissional indisponível para este serviço.');
    let chosen = null, reason = null;
    for (const st of candidates) {
      reason = A.isFree(st.id, service, start, { settings, admin, ignoreOfferId: offerId });
      if (!reason) { chosen = st; break; }
    }
    if (!chosen) throw new AppError(409, 'SLOT_TAKEN', REASONS[reason] || 'Horário indisponível.', { reason });
    let customerId;
    if (existing) customerId = existing.id;
    else if (admin) {
      try { customerId = db.prepare('INSERT INTO customers(name,email,phone,marketing_consent,created_at) VALUES(?,?,?,0,?)').run(contact.name, contact.email, contact.phone, Date.now()).lastInsertRowid; }
      catch (e) { if (/UNIQUE/.test(e.message)) throw new AppError(409, 'DUPLICATE', 'Este email já pertence a outra ficha de cliente. Usa essa ficha ou deixa o email em branco.'); throw e; }
    } else customerId = upsertCustomer(contact, input.marketing_consent === true);
    const pending = !admin && !!service.requires_approval;
    const nowMs = Date.now();
    const ref = newRef();
    const token = T.manageToken(ref, nowMs);
    const status = admin && input.status === 'pending' ? 'pending' : (pending ? 'pending' : 'confirmed');
    const hold = status === 'pending' && !admin ? Math.min(nowMs + settings.pending_hold_hours * 3600000, Math.max(start, nowMs + 3600000)) : null;
    const id = db.prepare(`INSERT INTO bookings(ref,customer_id,service_id,staff_id,resource_id,service_name,duration_min,price_cents,price_type,
        start_at,end_at,status,hold_expires_at,manage_token_hash,source,internal_notes,policy_accepted_at,created_at,updated_at,payment_method,deposit_cents)
        VALUES(?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ref, customerId, service.id, chosen.id, service.resource_id, service.name,
      service.price_cents, service.price_type, start, start, status, hold, T.hash(token), admin ? 'admin' : 'online',
      clean(input.internal_notes, 1000), admin ? null : nowMs, nowMs, nowMs, payPref(input.payment_method, settings), payPref(input.payment_method, settings) === 'mao' ? null : depositFor(service.price_cents, settings)).lastInsertRowid;
    const pm = payPref(input.payment_method, settings);
    logEvent(id, admin ? 'painel' : 'cliente', admin ? 'Marcação criada no painel' : (status === 'pending' ? 'Pedido enviado pelo site' : 'Marcação feita pelo site'),
      `${service.name} · ${when(start)}${admin && input.channel ? ' · via ' + clean(input.channel, 30) : ''}${pm ? ' · pagamento: ' + PAY_PREFS[pm] : ''}`);
    return { id, ref, token, status };
  });

  let res;
  try { res = run.immediate(); }
  catch (e) {
    if (slotTaken(e)) {
      const alt = admin ? [] : A.alternatives(service, wantedStaff, start).map(publicSlot);
      throw new AppError(409, 'SLOT_TAKEN', e instanceof AppError ? e.message : REASONS.booking, { alternatives: alt });
    }
    throw e;
  }
  if (!(admin && input.notify === false)) N.notifyBooking(res.status === 'pending' ? 'pending' : 'confirmed', res.id, { token: res.token }).catch(() => {});
  return { ...publicBooking(res.id), id: admin ? res.id : undefined, token: res.token };
}

const publicSlot = s => ({ start: s.start, time: s.time, date: A.toLocal(s.start).toISODate() });

function bookingRow(id) {
  return db.prepare(`SELECT b.*, c.name customer_name, c.email customer_email, c.phone customer_phone, st.name staff_name,
    CASE WHEN sv.id IS NOT NULL AND sv.active=1 AND COALESCE(sv.bookable,1)=1 THEN 1 ELSE 0 END service_active
    FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN staff st ON st.id=b.staff_id LEFT JOIN services sv ON sv.id=b.service_id WHERE b.id=?`).get(id);
}
function publicBooking(id) {
  const b = bookingRow(id);
  const s = getSettings();
  const hoursLeft = (b.start_at - Date.now()) / 3600000;
  const active = ['pending', 'confirmed'].includes(b.status) && b.start_at > Date.now();
  return {
    ref: b.ref, status: b.status, service_id: b.service_id, service_name: b.service_name,
    price_cents: b.price_cents, price_type: b.price_type, start: b.start_at, staff_id: b.staff_id, staff_name: b.staff_name,
    hold_expires_at: b.hold_expires_at, customer_name: b.customer_name, cancel_reason: b.cancel_reason,
    proposed: !!b.proposed && b.status === 'pending', attendance_confirmed: !!b.attendance_confirmed_at,
    // um pedido ainda por confirmar pode ser retirado/alterado a qualquer momento; o prazo de 48 h aplica-se às marcações confirmadas
    can_cancel: active && (b.status === 'pending' || hoursLeft >= s.cancel_limit_hours),
    can_reschedule: active && !b.proposed && !!b.service_active && (b.status === 'pending' || hoursLeft >= s.reschedule_limit_hours),
    can_confirm_attendance: b.status === 'confirmed' && b.start_at > Date.now(),
    cancel_limit_hours: s.cancel_limit_hours, reschedule_limit_hours: s.reschedule_limit_hours, policy: s.cancellation_policy,
    payment_method: b.payment_method || '', deposit_cents: b.deposit_cents, paid_cents: paidOf(b.id)
  };
}
function bookingByToken(token) {
  const b = db.prepare('SELECT id FROM bookings WHERE manage_token_hash=?').get(T.hash(String(token || '')));
  if (!b) throw new AppError(404, 'NOT_FOUND', 'Link inválido ou expirado.');
  return b.id;
}
const mustExist = id => { const b = bookingRow(id); if (!b) throw new AppError(404, 'NOT_FOUND', 'Marcação não encontrada.'); return b; };

function cancelBooking(id, { byAdmin = false, reason = '', notify = true } = {}) {
  const b = mustExist(id);
  if (!['pending', 'confirmed'].includes(b.status)) throw new AppError(409, 'STATE', 'Esta marcação já não está ativa.');
  if (!byAdmin) {
    const pb = publicBooking(id);
    if (!pb.can_cancel) throw new AppError(403, 'POLICY', `O cancelamento online só é possível até ${pb.cancel_limit_hours} horas antes. Contacta-me diretamente.`);
  }
  const why = clean(reason, 300) || (byAdmin ? 'Cancelada pelo espaço' : 'Cancelada pela cliente');
  db.prepare("UPDATE bookings SET status='cancelled', cancel_reason=?, proposed=0, updated_at=? WHERE id=?").run(why, Date.now(), id);
  logEvent(id, byAdmin ? 'painel' : 'cliente', 'Cancelada', `${why} · horário ${when(b.start_at)} libertado`);
  if (notify) N.notifyBooking('cancelled', id).catch(() => {});
  processWaitlist().catch(() => {});
}

function rescheduleBooking(id, { start, staff_id }, { byAdmin = false, notify = true } = {}) {
  const settings = getSettings();
  const b = mustExist(id);
  if (!byAdmin && !publicBooking(id).can_reschedule) throw new AppError(403, 'POLICY', `O reagendamento online só é possível até ${settings.reschedule_limit_hours} horas antes.`);
  if (!['pending', 'confirmed'].includes(b.status)) throw new AppError(409, 'STATE', 'Esta marcação já não está ativa.');
  const service = b.service_id ? getService(b.service_id, { includeInactive: true }) : { id: null, resource_id: b.resource_id };
  const st = Number(start);
  if (!Number.isFinite(st)) throw new AppError(422, 'VALIDATION', 'Horário inválido.');
  if (byAdmin && st < Date.now() - 3600000) throw new AppError(422, 'VALIDATION', 'Escolhe um horário futuro.');
  const run = db.transaction(() => {
    A.expirePendingHolds();
    const cands = staff_id ? [{ id: Number(staff_id) }] : (service.id ? A.staffForService(service.id, null) : [{ id: b.staff_id }]);
    cands.sort((x, y) => (y.id === b.staff_id) - (x.id === b.staff_id));
    let chosen = null, reason;
    for (const c of cands) {
      reason = A.isFree(c.id, service, st, { settings, admin: byAdmin, ignoreBookingId: id });
      if (!reason) { chosen = c; break; }
    }
    if (!chosen) throw new AppError(409, 'SLOT_TAKEN', REASONS[reason] || 'Horário indisponível.');
    // uma marcação já confirmada continua confirmada no novo horário (não volta a pedido nem pode expirar);
    // um pedido pendente continua pendente, sem prolongar o prazo de reserva
    const hold = b.status === 'pending' ? Math.min(b.hold_expires_at || st, st) : null;
    db.prepare('UPDATE bookings SET start_at=?, end_at=?, staff_id=?, status=?, hold_expires_at=?, reminder_sent_at=NULL, attendance_confirmed_at=NULL, updated_at=? WHERE id=?')
      .run(st, st, chosen.id, b.status, hold, Date.now(), id);
    logEvent(id, byAdmin ? 'painel' : 'cliente', 'Reagendada', `${when(b.start_at)} → ${when(st)}`);
  });
  try { run.immediate(); }
  catch (e) {
    if (e instanceof AppError) throw e;
    if (slotTaken(e)) throw new AppError(409, 'SLOT_TAKEN', REASONS.booking);
    throw e;
  }
  if (notify) N.notifyBooking('rescheduled', id, { token: T.manageToken(b.ref, b.created_at) }).catch(() => {});
  processWaitlist().catch(() => {});
}

const STATUS_LABEL = { pending: 'Pendente', confirmed: 'Confirmada', completed: 'Concluída', cancelled: 'Cancelada', no_show: 'Não compareceu' };
function setStatus(id, status, { reason = '' } = {}) {
  if (!STATUS_LABEL[status]) throw new AppError(422, 'VALIDATION', 'Estado inválido.');
  const b = mustExist(id);
  if (status === 'cancelled') return cancelBooking(id, { byAdmin: true, reason });
  if (status === 'confirmed' && b.status === 'pending') return approve(id);
  if (['completed', 'no_show'].includes(status)) {
    if (b.start_at > Date.now()) throw new AppError(422, 'VALIDATION', 'Só é possível concluir ou assinalar falta depois da hora da marcação.');
    if (!['confirmed', 'completed', 'no_show'].includes(b.status)) throw new AppError(409, 'STATE', 'Só marcações confirmadas podem ser concluídas ou assinaladas como falta.');
  }
  if (b.status === status) return;
  try {
    db.prepare("UPDATE bookings SET status=?, hold_expires_at=CASE WHEN ?='pending' THEN hold_expires_at ELSE NULL END, updated_at=? WHERE id=?").run(status, status, Date.now(), id);
  } catch (e) { if (slotTaken(e)) throw new AppError(409, 'SLOT_TAKEN', 'Esse horário já está ocupado por outra marcação.'); throw e; }
  logEvent(id, 'painel', `Estado: ${STATUS_LABEL[status]}`, `Antes: ${STATUS_LABEL[b.status]}`);
}

/**
 * Aprovar um pedido: revalida o horário (bloqueios entretanto criados, hora já passada) e confirma,
 * tudo numa transação IMMEDIATE — duas aprovações ou uma marcação simultânea nunca ficam com o mesmo horário.
 */
function approve(id) {
  const run = db.transaction(() => {
    A.expirePendingHolds();
    const b = bookingRow(id);
    if (!b || b.status !== 'pending') throw new AppError(409, 'STATE', 'Este pedido já não está pendente (pode ter expirado ou sido cancelado).');
    if (b.start_at < Date.now()) throw new AppError(409, 'STATE', 'A hora deste pedido já passou. Sugere outro horário ou recusa o pedido.');
    const why = A.conflicts(b.staff_id, b.resource_id, b.start_at, { ignoreBookingId: id });
    if (why) throw new AppError(409, 'SLOT_TAKEN', why === 'block' ? 'Este horário foi bloqueado entretanto. Sugere outro horário à cliente.' : REASONS[why]);
    db.prepare("UPDATE bookings SET status='confirmed', hold_expires_at=NULL, proposed=0, updated_at=? WHERE id=? AND status='pending'").run(Date.now(), id);
    logEvent(id, 'painel', 'Pedido aprovado', `Confirmada para ${when(b.start_at)}`);
    return b;
  });
  let b;
  try { b = run.immediate(); } catch (e) { if (!(e instanceof AppError) && slotTaken(e)) throw new AppError(409, 'SLOT_TAKEN', REASONS.booking); throw e; }
  N.notifyBooking('approved', id, { token: T.manageToken(b.ref, b.created_at) }).catch(() => {});
}
function reject(id, reason) {
  const b = bookingRow(id);
  if (!b || b.status !== 'pending') throw new AppError(409, 'STATE', 'Este pedido já não está pendente.');
  const why = clean(reason, 300) || 'Pedido recusado';
  db.prepare("UPDATE bookings SET status='cancelled', cancel_reason=?, proposed=0, updated_at=? WHERE id=?").run(why, Date.now(), id);
  logEvent(id, 'painel', 'Pedido recusado', why);
  N.notifyBooking('rejected', id).catch(() => {});
  processWaitlist().catch(() => {});
}
/**
 * Sugerir outro horário a um pedido pendente: o pedido passa para o novo horário (que fica reservado para a cliente)
 * e continua pendente até a cliente aceitar pelo link — ou até a esteticista confirmar depois de falar com ela.
 */
function suggestTime(id, { start, staff_id, message }) {
  const b = bookingRow(id);
  if (!b || b.status !== 'pending') throw new AppError(409, 'STATE', 'Só é possível sugerir outro horário a pedidos pendentes.');
  const st = Number(start);
  if (!Number.isFinite(st) || st < Date.now()) throw new AppError(422, 'VALIDATION', 'Escolhe um horário futuro.');
  const settings = getSettings();
  const run = db.transaction(() => {
    const staffId = staff_id ? Number(staff_id) : b.staff_id;
    const why = A.conflicts(staffId, b.resource_id, st, { ignoreBookingId: id });
    if (why) throw new AppError(409, 'SLOT_TAKEN', REASONS[why]);
    db.prepare('UPDATE bookings SET start_at=?, end_at=?, staff_id=?, proposed=1, hold_expires_at=?, updated_at=? WHERE id=?')
      .run(st, st, staffId, Math.min(Date.now() + settings.pending_hold_hours * 3600000, st), Date.now(), id);
    logEvent(id, 'painel', 'Outro horário sugerido', `${when(b.start_at)} → ${when(st)}${message ? ' · ' + clean(message, 200) : ''}`);
  });
  try { run.immediate(); } catch (e) { if (!(e instanceof AppError) && slotTaken(e)) throw new AppError(409, 'SLOT_TAKEN', REASONS.booking); throw e; }
  // fica pendente: o horário anterior é libertado
  processWaitlist().catch(() => {});
  return N.notifyBooking('proposed', id, { token: T.manageToken(b.ref, b.created_at), message: clean(message, 300) });
}
function answerProposal(id, accept) {
  A.expirePendingHolds();
  const b = mustExist(id);
  if (b.status !== 'pending' || !b.proposed) throw new AppError(409, 'STATE', 'Esta proposta já não está disponível.');
  if (accept) {
    const run = db.transaction(() => {
      const cur = mustExist(id);
      if (cur.status !== 'pending' || !cur.proposed || cur.start_at <= Date.now()) throw new AppError(409, 'STATE', 'Esta proposta já não está disponível.');
      const why = A.conflicts(cur.staff_id, cur.resource_id, cur.start_at, { ignoreBookingId: id });
      if (why) throw new AppError(409, 'SLOT_TAKEN', 'Este horário deixou de estar disponível. Contacta-me para combinarmos outro.');
      db.prepare("UPDATE bookings SET status='confirmed', hold_expires_at=NULL, proposed=0, updated_at=? WHERE id=? AND status='pending'").run(Date.now(), id);
    });
    try { run.immediate(); } catch (e) { if (!(e instanceof AppError) && slotTaken(e)) throw new AppError(409, 'SLOT_TAKEN', REASONS.booking); throw e; }
    logEvent(id, 'cliente', 'Aceitou o horário sugerido', `Confirmada para ${when(b.start_at)}`);
    N.notifyBooking('approved', id, { token: T.manageToken(b.ref, b.created_at) }).catch(() => {});
    return;
  }
  if (!accept) {
    db.prepare("UPDATE bookings SET status='cancelled', cancel_reason='A cliente recusou o horário sugerido', proposed=0, updated_at=? WHERE id=?").run(Date.now(), id);
    logEvent(id, 'cliente', 'Recusou o horário sugerido', `Horário ${when(b.start_at)} libertado`);
    processWaitlist().catch(() => {});
    return;
  }
}
function confirmAttendance(id, source) {
  const b = mustExist(id);
  if (b.status !== 'confirmed') throw new AppError(409, 'STATE', 'Só marcações confirmadas.');
  db.prepare('UPDATE bookings SET attendance_confirmed_at=?, attendance_source=? WHERE id=?').run(Date.now(), source, id);
  logEvent(id, source === 'cliente' ? 'cliente' : 'painel', 'Presença confirmada', source === 'cliente' ? 'Pelo link do lembrete' : `Registada no painel (${clean(source, 40)})`);
}

// ---------- pagamentos ----------
const METHODS = { numerario: 'Numerário', mbway: 'MB WAY', multibanco: 'Multibanco', cartao: 'Cartão', transferencia: 'Transferência', outro: 'Outro' };
const paidOf = bookingId => db.prepare("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE booking_id=? AND status='pago'").get(bookingId).v;
/**
 * Regista um pagamento. Nunca se assume que uma marcação está paga: só conta o que é registado aqui.
 * request_key (gerada pelo painel ao abrir o formulário) torna o registo idempotente: repetir o pedido não duplica.
 */
function addPayment(bookingId, body) {
  const key = clean(body.request_key, 80) || null;
  const run = db.transaction(() => {
    if (key) { const ex = db.prepare('SELECT * FROM payments WHERE request_key=?').get(key); if (ex) return { ...ex, duplicate: true }; }
    const b = mustExist(bookingId);
    if (!['pending', 'confirmed', 'completed', 'no_show'].includes(b.status)) throw new AppError(409, 'STATE', 'Não é possível registar pagamentos de uma marcação cancelada.');
    const amount = Math.round(Number(String(body.amount_eur ?? '').replace(',', '.')) * 100);
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(422, 'VALIDATION', 'Indica um valor superior a 0 €.');
    if (!METHODS[body.method]) throw new AppError(422, 'VALIDATION', 'Escolhe o método de pagamento.');
    const day = A.parseDate(body.paid_on || A.toLocal(Date.now()).toISODate());
    if (!day || day.toMillis() > Date.now() + 86400000) throw new AppError(422, 'VALIDATION', 'Data de pagamento inválida.');
    const paid = paidOf(bookingId);
    if (b.price_cents != null && b.price_type === 'fixed' && paid + amount > b.price_cents && !body.allow_over)
      throw new AppError(409, 'OVERPAID', `Com este valor, o total pago (${((paid + amount) / 100).toFixed(2).replace('.', ',')} €) ultrapassa o preço acordado (${(b.price_cents / 100).toFixed(2).replace('.', ',')} €). ${paid ? 'Já está registado ' + (paid / 100).toFixed(2).replace('.', ',') + ' €.' : ''}`.trim(), { paid_cents: paid, price_cents: b.price_cents });
    const paidAt = day.toISODate() === A.toLocal(Date.now()).toISODate() ? Date.now() : day.set({ hour: 12 }).toMillis();
    const id = db.prepare('INSERT INTO payments(booking_id,amount_cents,method,status,paid_at,note,request_key,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(bookingId, amount, body.method, 'pago', paidAt, clean(body.note, 300), key, Date.now()).lastInsertRowid;
    logEvent(bookingId, 'painel', 'Pagamento registado', `${(amount / 100).toFixed(2).replace('.', ',')} € · ${METHODS[body.method]}`);
    return db.prepare('SELECT * FROM payments WHERE id=?').get(id);
  });
  return run.immediate();
}
function setPaymentMethod(id, v) {
  const b = mustExist(id);
  const pm = payPref(v, getSettings());
  if (pm === (b.payment_method || '')) return;
  // em mão: paga tudo no espaço, sem sinal; nas outras formas, sinal sobre o preço combinado
  const dep = pm === 'mao' ? null : depositFor(b.price_cents, getSettings());
  db.prepare('UPDATE bookings SET payment_method=?, deposit_cents=?, updated_at=? WHERE id=?').run(pm, dep, Date.now(), id);
  logEvent(id, 'painel', 'Forma de pagamento alterada', PAY_PREFS[pm] || 'sem indicação');
}
function voidPayment(id, reason) {
  const p = db.prepare('SELECT * FROM payments WHERE id=?').get(id);
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Pagamento não encontrado.');
  if (p.status !== 'pago') throw new AppError(409, 'STATE', 'Este pagamento já foi anulado.');
  const why = clean(reason, 200); if (!why) throw new AppError(422, 'VALIDATION', 'Indica o motivo da anulação.');
  db.prepare("UPDATE payments SET status='anulado', void_reason=?, voided_at=? WHERE id=?").run(why, Date.now(), id);
  logEvent(p.booking_id, 'painel', 'Pagamento anulado', `${(p.amount_cents / 100).toFixed(2).replace('.', ',')} € · ${why}`);
}

// ---------- lista de espera ----------
function joinWaitlist(body) {
  const contact = validateContact(body, { emailOptional: true });
  contact.email = contact.email || '';
  const service = getService(body.service_id);
  const days = (Array.isArray(body.days) ? body.days : []).map(Number).filter(d => d >= 1 && d <= 7);
  const periods = (Array.isArray(body.periods) ? body.periods : []).filter(p => p in A.PERIODS);
  const dateOk = d => !d || A.parseDate(d);
  if (!dateOk(body.date_from) || !dateOk(body.date_to)) throw new AppError(422, 'VALIDATION', 'Datas inválidas.');
  const dup = db.prepare("SELECT id, phone, email FROM waitlist WHERE service_id=? AND status IN ('active','offered')").all(service.id)
    .find(w => (contact.email && w.email === contact.email) || last9(w.phone) === last9(contact.phone));
  if (dup) throw new AppError(409, 'DUPLICATE', 'Já estás na lista de espera para este serviço. Aviso-te quando surgir uma vaga.');
  const id = db.prepare(`INSERT INTO waitlist(service_id,staff_id,name,email,phone,days,periods,date_from,date_to,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(service.id, body.staff_id ? Number(body.staff_id) : null, contact.name, contact.email, contact.phone,
    JSON.stringify(days), JSON.stringify(periods), body.date_from || null, body.date_to || null, Date.now()).lastInsertRowid;
  const token = T.waitlistToken(id);
  db.prepare('UPDATE waitlist SET manage_token_hash=? WHERE id=?').run(T.hash(token), id);
  processWaitlist().catch(() => {});
  return { id, token };
}

function matchesPrefs(entry, slotStart) {
  const days = JSON.parse(entry.days || '[]'), periods = JSON.parse(entry.periods || '[]');
  const t = A.toLocal(slotStart);
  if (days.length && !days.includes(t.weekday)) return false;
  if (periods.length && !periods.includes(A.periodOf(slotStart))) return false;
  if (entry.date_from && t.toISODate() < entry.date_from) return false;
  if (entry.date_to && t.toISODate() > entry.date_to) return false;
  return JSON.parse(entry.skipped || '[]').indexOf(slotStart) === -1;
}

let wlRunning = false;
/**
 * Oferece vagas compatíveis, por ordem de inscrição, uma pessoa de cada vez por vaga.
 * A vaga oferecida fica bloqueada para outras pessoas até expirar, por isso nunca é oferecida em duplicado.
 */
async function processWaitlist() {
  // Sem email configurado não se "oferece" nada a ninguém (a cliente não receberia o aviso):
  // as vagas compatíveis aparecem apenas sinalizadas no painel, para a esteticista contactar a cliente.
  if (!N.smtpConfigured()) return 0;
  if (wlRunning) return; wlRunning = true;
  const offers = [];
  try {
    const s = getSettings();
    const nowMs = Date.now();
    db.transaction(() => {
      A.expirePendingHolds();
      // ofertas expiradas: a vaga é libertada e a pessoa volta à lista (ou sai após o máximo de ofertas)
      for (const e of db.prepare("SELECT * FROM waitlist WHERE status='offered' AND offer_expires_at <= ?").all(nowMs)) {
        const skipped = JSON.parse(e.skipped || '[]'); skipped.push(e.offer_start_at);
        const next = e.offers_count >= s.waitlist_max_offers ? 'expired' : 'active';
        db.prepare('UPDATE waitlist SET status=?, offer_token_hash=NULL, offer_start_at=NULL, offer_staff_id=NULL, offer_expires_at=NULL, skipped=? WHERE id=?')
          .run(next, JSON.stringify(skipped), e.id);
      }
      // apagar inscrições cujo período terminou
      db.prepare("UPDATE waitlist SET status='expired' WHERE status='active' AND date_to IS NOT NULL AND date_to < ?").run(A.toLocal(nowMs).toISODate());
      const active = db.prepare("SELECT * FROM waitlist WHERE status='active' AND email<>'' ORDER BY created_at, id").all();
      for (const e of active) {
        let service; try { service = getService(e.service_id); } catch { continue; }
        const from = A.toLocal(Math.max(nowMs, e.date_from ? A.parseDate(e.date_from).toMillis() : 0));
        let found = null;
        for (let i = 0; i <= s.max_advance_days && !found; i++) {
          const day = from.plus({ days: i }).toISODate();
          if (e.date_to && day > e.date_to) break;
          for (const slot of A.slotsForDay(service, e.staff_id, day, { settings: s })) {
            if (matchesPrefs(e, slot.start)) { found = slot; break; }
          }
        }
        if (!found) continue;
        const n = e.offers_count + 1;
        const token = T.offerToken(e.id, n);
        // a oferta nunca dura além do prazo mínimo de antecedência antes do horário
        const expires = Math.min(nowMs + s.waitlist_offer_minutes * 60000, found.start - s.min_notice_hours * 3600000);
        if (expires <= nowMs + 5 * 60000) continue;
        db.prepare("UPDATE waitlist SET status='offered', offer_token_hash=?, offer_start_at=?, offer_staff_id=?, offer_expires_at=?, offers_count=? WHERE id=? AND status='active'")
          .run(T.hash(token), found.start, found.staff[0], expires, n, e.id);
        offers.push({ id: e.id, token, service });
      }
    }).immediate();
  } finally { wlRunning = false; }
  for (const o of offers) {
    const e = db.prepare('SELECT * FROM waitlist WHERE id=?').get(o.id);
    await N.notifyWaitlistOffer(e, o.token, o.service);
  }
  return offers.length;
}

/** Vagas compatíveis com cada inscrição ativa (para o painel sinalizar e a esteticista contactar a cliente). */
function waitlistMatches(entry, limit = 3) {
  const s = getSettings();
  let service; try { service = getService(entry.service_id); } catch { return []; }
  const nowMs = Date.now();
  const from = A.toLocal(Math.max(nowMs, entry.date_from ? A.parseDate(entry.date_from).toMillis() : 0));
  const out = [];
  for (let i = 0; i <= Math.min(s.max_advance_days, 45) && out.length < limit; i++) {
    const day = from.plus({ days: i }).toISODate();
    if (entry.date_to && day > entry.date_to) break;
    for (const slot of A.slotsForDay(service, entry.staff_id, day, { settings: { ...s, min_notice_hours: 0 } })) {
      if (matchesPrefs(entry, slot.start)) { out.push(publicSlot(slot)); if (out.length >= limit) break; }
    }
  }
  return out;
}
function addWaitlistManual(body) {
  const name = clean(body.name, 80), phone = clean(body.phone, 30), email = clean(body.email, 120).toLowerCase();
  if (name.length < 2) throw new AppError(422, 'VALIDATION', 'Indica o nome da cliente.');
  if (digits(phone).length < 9) throw new AppError(422, 'VALIDATION', 'Indica um telefone válido.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AppError(422, 'VALIDATION', 'Email inválido.');
  const service = getService(body.service_id, { includeInactive: true });
  const days = (Array.isArray(body.days) ? body.days : []).map(Number).filter(d => d >= 1 && d <= 7);
  const periods = (Array.isArray(body.periods) ? body.periods : []).filter(p => p in A.PERIODS);
  const dateOk = d => !d || A.parseDate(d);
  if (!dateOk(body.date_from) || !dateOk(body.date_to)) throw new AppError(422, 'VALIDATION', 'Datas inválidas.');
  return db.prepare(`INSERT INTO waitlist(service_id,staff_id,name,email,phone,days,periods,date_from,date_to,notes,source,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(service.id, body.staff_id ? Number(body.staff_id) : null, name, email, phone, JSON.stringify(days), JSON.stringify(periods),
    body.date_from || null, body.date_to || null, clean(body.notes, 300), 'painel', Date.now()).lastInsertRowid;
}

function offerByToken(token) {
  const e = db.prepare('SELECT * FROM waitlist WHERE offer_token_hash=?').get(T.hash(String(token || '')));
  if (!e) throw new AppError(404, 'NOT_FOUND', 'Esta oferta já não é válida.');
  return e;
}
function publicOffer(token) {
  const e = offerByToken(token);
  const service = db.prepare('SELECT * FROM services WHERE id=?').get(e.service_id);
  const staff = e.offer_staff_id ? db.prepare('SELECT name FROM staff WHERE id=?').get(e.offer_staff_id) : null;
  return { status: e.status, valid: e.status === 'offered' && e.offer_expires_at > Date.now(), start: e.offer_start_at, expires: e.offer_expires_at,
    service_name: service?.name, price_cents: service?.price_cents, price_type: service?.price_type,
    staff_name: staff?.name, name: e.name, policy: getSettings().cancellation_policy, booking_id: e.booking_id };
}
function acceptOffer(token, { accept_policy, marketing_consent } = {}) {
  const e = offerByToken(token);
  if (e.status === 'booked' && e.booking_id) return { already: true, ...publicBooking(e.booking_id) };
  if (e.status !== 'offered' || e.offer_expires_at <= Date.now()) throw new AppError(410, 'EXPIRED', 'O prazo desta oferta terminou e a vaga foi libertada.');
  const booking = createBooking({ service_id: e.service_id, staff_id: e.offer_staff_id, start: e.offer_start_at, name: e.name, email: e.email,
    phone: e.phone, accept_policy, marketing_consent }, { offerId: e.id });
  db.prepare("UPDATE waitlist SET status='booked', booking_id=(SELECT id FROM bookings WHERE ref=?) WHERE id=?").run(booking.ref, e.id);
  return booking;
}
function declineOffer(token) {
  const e = offerByToken(token);
  if (e.status !== 'offered') return;
  const skipped = JSON.parse(e.skipped || '[]'); skipped.push(e.offer_start_at);
  db.prepare("UPDATE waitlist SET status='active', offer_token_hash=NULL, offer_start_at=NULL, offer_staff_id=NULL, offer_expires_at=NULL, skipped=? WHERE id=?")
    .run(JSON.stringify(skipped), e.id);
  processWaitlist().catch(() => {});
}

// ---------- registo de clientes (formulário partilhado nas redes sociais) ----------
const BDAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function validBirthday(v) {
  if (!BDAY.test(v || '')) return false;
  const [m, d] = v.split('-').map(Number); return d <= DAYS_IN[m - 1];
}
/**
 * Regista (ou completa) a ficha de uma cliente. A resposta é sempre a mesma, exista ou não a ficha,
 * para não revelar quem está registado. Numa ficha existente só se preenchem campos vazios
 * (nunca se substitui nome ou telefone por um formulário público) e o consentimento só pode ser dado.
 */
function registerCustomer(body) {
  const s = getSettings();
  if (!s.register_enabled) throw new AppError(410, 'CLOSED', 'O registo está temporariamente indisponível. Podes marcar diretamente em Marcações.');
  // todos os erros de uma vez (nome completo, email, telemóvel, aniversário)
  let c = null, errors = {};
  try { c = validateContact(body); } catch (e) { if (e.code !== 'VALIDATION') throw e; errors = { ...e.extra.errors }; }
  if (clean(body.name, 80).split(/\s+/).filter(Boolean).length < 2) errors.name = 'Indica o nome completo (nome e apelido).';
  if (errors.phone) errors.phone = 'Indica um telemóvel válido (ex.: 912 345 678).';
  const birthday = String(body.birthday || '');
  if (!validBirthday(birthday)) errors.birthday = 'Indica o dia e o mês do teu aniversário.';
  if (Object.keys(errors).length) throw new AppError(422, 'VALIDATION', 'Verifica os dados indicados.', { errors });
  const consent = body.birthday_consent === true;
  const origin = String(body.origem || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'link';
  const now = Date.now();
  db.transaction(() => {
    const ex = db.prepare('SELECT * FROM customers WHERE email=?').get(c.email);
    if (ex) {
      db.prepare(`UPDATE customers SET phone=CASE WHEN phone IS NULL OR phone='' THEN ? ELSE phone END, birthday=COALESCE(birthday, ?),
        birthday_consent=CASE WHEN ? THEN 1 ELSE birthday_consent END, birthday_consent_at=CASE WHEN ? AND birthday_consent=0 THEN ? ELSE birthday_consent_at END,
        registered_at=COALESCE(registered_at, ?), source=CASE WHEN source IS NULL OR source='' THEN ? ELSE source END WHERE id=?`)
        .run(c.phone, birthday, consent ? 1 : 0, consent ? 1 : 0, now, now, 'registo:' + origin, ex.id);
    } else {
      db.prepare(`INSERT INTO customers(name,email,phone,marketing_consent,notes,created_at,birthday,birthday_consent,birthday_consent_at,source,registered_at)
        VALUES(?,?,?,0,'',?,?,?,?,?,?)`).run(c.name, c.email, c.phone, now, birthday, consent ? 1 : 0, consent ? now : null, 'registo:' + origin, now);
    }
  }).immediate();
  return { ok: true };
}
/** Próximos aniversários (inclui hoje), no fuso do espaço. 29/02 é celebrado a 28/02 nos anos comuns. */
function upcomingBirthdays(days = 30) {
  const today = A.toLocal(Date.now()).startOf('day'), year = today.year;
  const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return db.prepare("SELECT id,name,email,phone,birthday,birthday_consent,birthday_greeted_year,source FROM customers WHERE birthday IS NOT NULL AND birthday<>''").all().map(c => {
    const [m, d] = c.birthday.split('-').map(Number);
    const at = y => today.set({ year: y, month: m, day: m === 2 && d === 29 && !leap(y) ? 28 : d });
    let next = at(year); if (next < today) next = at(year + 1);
    return { ...c, next_date: next.toISODate(), days_until: Math.round(next.diff(today, 'days').days), greeted: c.birthday_greeted_year === next.year };
  }).filter(c => c.days_until <= days).sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name, 'pt'));
}

// ---------- avaliações ----------
const PII = /(https?:\/\/|www\.|[^\s@]+@[^\s@]+\.\w+|(\+?\d[\s.-]?){9,})/i;
function reviewContext(token) {
  const b = db.prepare('SELECT * FROM bookings WHERE review_token_hash=?').get(T.hash(String(token || '')));
  if (!b) throw new AppError(404, 'NOT_FOUND', 'Link de avaliação inválido.');
  const r = db.prepare('SELECT id FROM reviews WHERE booking_id=?').get(b.id);
  const c = db.prepare('SELECT name FROM customers WHERE id=?').get(b.customer_id);
  return { booking: b, already: !!r, service_name: b.service_name, start: b.start_at, suggested_name: shortName(c.name) };
}
const shortName = n => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };
function submitReview(token, body) {
  const ctx = reviewContext(token);
  if (ctx.booking.status !== 'completed') throw new AppError(403, 'STATE', 'Só é possível avaliar atendimentos concluídos.');
  if (ctx.already) throw new AppError(409, 'DUPLICATE', 'Este atendimento já foi avaliado. Obrigada!');
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError(422, 'VALIDATION', 'Escolhe uma classificação de 1 a 5 estrelas.');
  const comment = clean(body.comment, 1000);
  const author = clean(body.author_name, 40) || ctx.suggested_name;
  // contém links, emails ou números de telefone → fica pendente de moderação (não é publicado automaticamente)
  const status = PII.test(comment) || PII.test(author) ? 'pending' : 'published';
  try {
    db.prepare(`INSERT INTO reviews(booking_id,rating,comment,author_name,service_name,verified,status,created_at) VALUES(?,?,?,?,?,1,?,?)`)
      .run(ctx.booking.id, rating, comment, author, ctx.booking.service_name, status, Date.now());
  } catch (e) { if (/UNIQUE/.test(e.message)) throw new AppError(409, 'DUPLICATE', 'Este atendimento já foi avaliado.'); throw e; }
  return { status };
}
const HIDE_REASONS = { spam: 'Spam', ofensivo: 'Conteúdo ofensivo', dados_pessoais: 'Contém dados pessoais' };
function moderateReview(id, { action, reason, reply }) {
  const r = db.prepare('SELECT * FROM reviews WHERE id=?').get(id);
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Avaliação não encontrada.');
  if (action === 'hide') {
    if (!HIDE_REASONS[reason]) throw new AppError(422, 'VALIDATION', 'Só é possível ocultar por spam, conteúdo ofensivo ou dados pessoais. Críticas negativas legítimas não podem ser ocultadas.');
    db.prepare("UPDATE reviews SET status='hidden', hidden_reason=?, moderated_at=? WHERE id=?").run(reason, Date.now(), id);
  } else if (action === 'publish') {
    db.prepare("UPDATE reviews SET status='published', hidden_reason='', moderated_at=? WHERE id=?").run(Date.now(), id);
  } else if (action === 'reply') {
    db.prepare('UPDATE reviews SET reply=? WHERE id=?').run(clean(reply, 1000), id);
  } else throw new AppError(422, 'VALIDATION', 'Ação inválida.');
}

// ---------- tarefas automáticas ----------
async function runJobs() {
  const s = getSettings();
  const nowMs = Date.now();
  // pedidos pendentes expirados
  // (a expiração também acontece noutros pedidos ao servidor; o aviso à cliente é enviado aqui, uma única vez)
  A.expirePendingHolds();
  const expired = db.prepare("SELECT id FROM bookings WHERE status='cancelled' AND cancel_reason='Pedido expirou sem confirmação' AND expired_notified_at IS NULL").all();
  for (const b of expired) {
    if (db.prepare('UPDATE bookings SET expired_notified_at=? WHERE id=? AND expired_notified_at IS NULL').run(nowMs, b.id).changes) await N.notifyBooking('expired', b.id);
  }
  // quem veio da lista de espera e cujo pedido expirou sem confirmação volta a ficar na lista
  db.prepare(`UPDATE waitlist SET status='active', booking_id=NULL WHERE status='booked' AND booking_id IN
    (SELECT id FROM bookings WHERE status='cancelled' AND cancel_reason='Pedido expirou sem confirmação')`).run();
  // lembretes (na véspera, por defeito 24 h antes) — só se estiverem ativos nas Definições
  const due = !s.reminder_enabled ? [] : db.prepare(`SELECT id, ref, created_at FROM bookings WHERE status='confirmed' AND reminder_sent_at IS NULL
    AND start_at > ? AND start_at <= ? AND created_at < start_at - ?`).all(nowMs, nowMs + s.reminder_hours * 3600000, 2 * 3600000);
  for (const b of due) {
    const upd = db.prepare('UPDATE bookings SET reminder_sent_at=? WHERE id=? AND reminder_sent_at IS NULL').run(nowMs, b.id);
    if (upd.changes) await N.notifyBooking('reminder', b.id, { token: T.manageToken(b.ref, b.created_at) });
  }
  // convites de avaliação após atendimento concluído
  const done = db.prepare(`SELECT id, ref FROM bookings WHERE status='completed' AND review_invited_at IS NULL AND start_at <= ?`)
    .all(nowMs - s.review_invite_delay_hours * 3600000);
  for (const b of done) {
    const token = T.reviewToken(b.ref);
    const upd = db.prepare('UPDATE bookings SET review_invited_at=?, review_token_hash=? WHERE id=? AND review_invited_at IS NULL').run(nowMs, T.hash(token), b.id);
    if (upd.changes) await N.notifyBooking('review', b.id, { reviewToken: token });
  }
  // mensagem de aniversário por email: só com email configurado, opção ativa e consentimento da cliente
  if (s.birthday_email_enabled && N.smtpConfigured()) {
    for (const c of upcomingBirthdays(0)) {
      if (!c.birthday_consent || !c.email || c.greeted) continue;
      const upd = db.prepare('UPDATE customers SET birthday_greeted_year=? WHERE id=? AND (birthday_greeted_year IS NULL OR birthday_greeted_year<>?)').run(+c.next_date.slice(0, 4), c.id, +c.next_date.slice(0, 4));
      if (upd.changes) await N.notifyBirthday(c);
    }
  }
  await processWaitlist();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowMs);
}

module.exports = { AppError, createBooking, publicBooking, bookingByToken, bookingRow, cancelBooking, rescheduleBooking, setStatus,
  approve, reject, suggestTime, answerProposal, confirmAttendance, addPayment, voidPayment, paidOf, METHODS, PAY_PREFS, payPref, setPaymentMethod, STATUS_LABEL, logEvent,
  findCustomerMatches, digits, waitlistMatches, addWaitlistManual, registerCustomer, upcomingBirthdays, validBirthday, joinWaitlist, processWaitlist, publicOffer, acceptOffer, declineOffer, reviewContext, submitReview, moderateReview,
  HIDE_REASONS, runJobs, validateContact, clean, getService, publicSlot, REASONS };
