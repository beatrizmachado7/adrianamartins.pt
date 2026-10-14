'use strict';
// Disponibilidade por horário (sem duração): cada marcação ocupa a hora de início da profissional.
// Os horários vêm do que a esteticista abre no painel (dia a dia) ou, opcionalmente, do horário semanal.
const { DateTime } = require('luxon');
const { db, getSettings } = require('./db');

const ACTIVE = "('pending','confirmed')";
const PERIODS = { manha: [0, 13 * 60], tarde: [13 * 60, 17 * 60], fim_tarde: [17 * 60, 24 * 60] };
const ZONES = ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'];

// fuso horário configurado para o espaço (Definições)
const tz = () => { const z = getSettings().timezone; return ZONES.includes(z) ? z : 'Europe/Lisbon'; };
const now = () => Date.now();
const toLocal = ms => DateTime.fromMillis(ms, { zone: tz() });
const parseDate = d => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return null;
  const dt = DateTime.fromISO(d, { zone: tz() });
  return dt.isValid ? dt.startOf('day') : null;
};
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const fmtHM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Pedidos pendentes cujo prazo expirou deixam de ocupar o horário.
function expirePendingHolds() {
  const rows = db.prepare(`SELECT id FROM bookings WHERE status='pending' AND hold_expires_at IS NOT NULL AND hold_expires_at < ?`).all(now());
  if (!rows.length) return 0;
  const upd = db.prepare(`UPDATE bookings SET status='cancelled', cancel_reason='Pedido expirou sem confirmação', updated_at=? WHERE id=? AND status='pending'`);
  const ev = db.prepare(`INSERT INTO booking_events(booking_id,at,actor,action,details) VALUES(?,?,?,?,?)`);
  for (const r of rows) if (upd.run(now(), r.id).changes) ev.run(r.id, now(), 'sistema', 'Pedido expirou', 'Sem confirmação dentro do prazo — horário libertado');
  return rows.length;
}

function staffForService(serviceId, staffId) {
  const rows = db.prepare(`SELECT st.* FROM staff st JOIN staff_services ss ON ss.staff_id=st.id
    WHERE ss.service_id=? AND st.active=1 ORDER BY st.sort, st.id`).all(serviceId);
  return staffId ? rows.filter(r => r.id === Number(staffId)) : rows;
}

// Horários abertos à mão para um dia (YYYY-MM-DD), em minutos desde 00:00. [] = dia sem horários manuais.
function manualTimes(dateStr) {
  return db.prepare('SELECT time FROM day_slots WHERE date=? ORDER BY time').all(dateStr).map(r => hm(r.time));
}
// Intervalos do horário semanal (opcional) de uma profissional num dia da semana.
function workIntervals(staffId, weekday) {
  const hasOwn = db.prepare('SELECT COUNT(*) n FROM staff_hours WHERE staff_id=?').get(staffId).n > 0;
  const rows = hasOwn ? db.prepare('SELECT start,end FROM staff_hours WHERE staff_id=? AND weekday=? ORDER BY start').all(staffId, weekday)
    : db.prepare('SELECT start,end FROM business_hours WHERE weekday=? ORDER BY start').all(weekday);
  return rows.map(r => [hm(r.start), hm(r.end)]);
}
/** Horas de início abertas para uma profissional num dia (minutos). Dia com horas manuais → só essas. */
function openMinutes(staffId, day, settings = getSettings()) {
  const manual = manualTimes(day.toISODate());
  if (manual.length) return manual;
  const out = [];
  for (const [a, b] of workIntervals(staffId, day.weekday)) for (let m = a; m < b; m += settings.slot_step_min) out.push(m);
  return [...new Set(out)].sort((x, y) => x - y);
}
// hora de parede local → instante (correto nos dias de mudança de hora; null se a hora não existir)
function instant(day, m) {
  const lt = day.set({ hour: Math.floor(m / 60), minute: m % 60, second: 0, millisecond: 0 });
  return lt.hour * 60 + lt.minute === m ? lt.toMillis() : null;
}

/** Motivo pelo qual o horário está ocupado para a profissional, ou null se estiver livre. */
function conflicts(staffId, resourceId, start, opts = {}) {
  const ign = opts.ignoreBookingId || 0;
  if (db.prepare(`SELECT 1 FROM bookings WHERE status IN ${ACTIVE} AND id<>? AND staff_id=? AND start_at=?`).get(ign, staffId, start)) return 'booking';
  if (resourceId && db.prepare(`SELECT 1 FROM bookings WHERE status IN ${ACTIVE} AND id<>? AND resource_id=? AND start_at=?`).get(ign, resourceId, start)) return 'resource';
  if (blockAt(staffId, start)) return 'block';
  const of = db.prepare(`SELECT 1 FROM waitlist WHERE status='offered' AND offer_expires_at > ? AND offer_staff_id=? AND offer_start_at=? AND id<>?`)
    .get(now(), staffId, start, opts.ignoreOfferId || 0);
  return of ? 'offer' : null;
}
const blockAt = (staffId, start) => db.prepare(`SELECT * FROM blocks WHERE (staff_id IS NULL OR staff_id=?) AND start_at <= ? AND ? < end_at LIMIT 1`).get(staffId, start, start);

/** Regras de calendário para marcações online (o painel pode marcar fora delas). */
function withinRules(staffId, start, settings, { admin = false } = {}) {
  if (admin) return start < now() - 365 * 86400000 ? 'too_old' : null;
  const s = toLocal(start);
  if (start < now() + settings.min_notice_hours * 3600000) return 'min_notice';
  if (s.startOf('day') > toLocal(now()).startOf('day').plus({ days: settings.max_advance_days })) return 'max_advance';
  return openMinutes(staffId, s.startOf('day'), settings).includes(s.hour * 60 + s.minute) ? null : 'outside_hours';
}

function isFree(staffId, service, start, opts = {}) {
  const settings = opts.settings || getSettings();
  return withinRules(staffId, start, settings, opts) || conflicts(staffId, service.resource_id, start, opts);
}

/** Horários disponíveis num dia para um serviço: [{start, time, staff:[ids]}] */
function slotsForDay(service, staffId, dateStr, opts = {}) {
  const settings = opts.settings || getSettings();
  const day = parseDate(dateStr);
  if (!day) return [];
  const map = new Map();
  for (const st of staffForService(service.id, staffId)) {
    for (const m of openMinutes(st.id, day, settings)) {
      const start = instant(day, m);
      if (start == null || isFree(st.id, service, start, { settings, ignoreOfferId: opts.ignoreOfferId })) continue;
      if (!map.has(start)) map.set(start, []);
      map.get(start).push(st.id);
    }
  }
  return [...map.entries()].sort((x, y) => x[0] - y[0]).map(([start, staff]) => ({ start, time: toLocal(start).toFormat('HH:mm'), staff }));
}

/**
 * Quadro do dia para o painel: cada hora aberta com o seu estado (livre, ocupado, bloqueado, passado).
 * Não depende do serviço: mostra a ocupação real da agenda.
 */
function dayBoard(dateStr, staffId = null) {
  const settings = getSettings();
  const day = parseDate(dateStr);
  if (!day) return [];
  const staff = db.prepare('SELECT id,name FROM staff WHERE active=1 ORDER BY sort,id').all().filter(s => !staffId || s.id === Number(staffId));
  const out = [];
  for (const st of staff) {
    for (const m of openMinutes(st.id, day, settings)) {
      const start = instant(day, m); if (start == null) continue;
      const b = db.prepare(`SELECT id FROM bookings WHERE status IN ${ACTIVE} AND staff_id=? AND start_at=?`).get(st.id, start);
      const bl = !b && blockAt(st.id, start);
      const offer = !b && !bl && db.prepare(`SELECT id FROM waitlist WHERE status='offered' AND offer_expires_at > ? AND offer_staff_id=? AND offer_start_at=?`).get(now(), st.id, start);
      out.push({ start, time: fmtHM(m), staff_id: st.id, staff_name: st.name,
        state: b ? 'ocupado' : bl ? 'bloqueado' : offer ? 'reservado' : start < now() ? 'passado' : 'livre',
        booking_id: b ? b.id : null, block: bl ? { id: bl.id, type: bl.type, reason: bl.reason } : null });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.staff_id - b.staff_id);
}

/** Dias com disponibilidade num intervalo (para o calendário). */
function availableDays(service, staffId, fromDate, days, settings = getSettings()) {
  const out = [];
  let d = parseDate(fromDate);
  for (let i = 0; i < days; i++, d = d.plus({ days: 1 })) out.push({ date: d.toISODate(), count: slotsForDay(service, staffId, d.toISODate(), { settings }).length });
  return out;
}

/** Alternativas próximas a um horário desejado (mesmo dia e dias seguintes). */
function alternatives(service, staffId, start, limit = 6) {
  const settings = getSettings();
  const base = toLocal(start).startOf('day');
  const res = [];
  for (let i = 0; i < 14 && res.length < limit; i++) {
    const day = base.plus({ days: i });
    let slots = slotsForDay(service, staffId, day.toISODate(), { settings });
    if (i === 0) slots = slots.sort((a, b) => Math.abs(a.start - start) - Math.abs(b.start - start));
    for (const s of slots) { if (res.length >= limit) break; res.push({ ...s, date: day.toISODate() }); }
  }
  return res;
}

function periodOf(ms) {
  const t = toLocal(ms); const m = t.hour * 60 + t.minute;
  return Object.entries(PERIODS).find(([, [a, b]]) => m >= a && m < b)?.[0];
}

module.exports = { get TZ() { return tz(); }, tz, ZONES, toLocal, parseDate, manualTimes, expirePendingHolds, staffForService, workIntervals, openMinutes,
  conflicts, isFree, slotsForDay, dayBoard, availableDays, alternatives, periodOf, PERIODS, withinRules, blockAt };
