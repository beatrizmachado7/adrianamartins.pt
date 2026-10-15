'use strict';
// Notificações. Só o email por SMTP está implementado; WhatsApp/SMS são integrações opcionais.
// Sem configuração, a notificação fica registada como "not_configured" — nunca como enviada.
const { db, getSettings } = require('./db');
const { toLocal } = require('./availability');

let transport = null;
function smtpConfigured() { return !!(process.env.SMTP_HOST && process.env.SMTP_FROM); }
function getTransport() {
  if (!smtpConfigured()) return null;
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  }
  return transport;
}

const fmtDate = ms => toLocal(ms).setLocale('pt-PT').toFormat("cccc, d 'de' LLLL 'às' HH:mm");
// "hoje", "amanhã" ou a data — o lembrete pode sair no próprio dia (pedido aprovado em cima da hora)
const whenWord = ms => {
  const d = toLocal(ms).startOf('day'), t = toLocal(Date.now()).startOf('day');
  const diff = Math.round(d.diff(t, 'days').days);
  return diff === 0 ? `hoje às ${toLocal(ms).toFormat('HH:mm')}` : diff === 1 ? `amanhã às ${toLocal(ms).toFormat('HH:mm')}` : toLocal(ms).setLocale('pt-PT').toFormat("d 'de' LLLL 'às' HH:mm");
};
const fmtPrice = (c, type) => c == null ? 'Preço a confirmar' : (type === 'from' ? 'desde ' : '') + (c / 100).toFixed(2).replace('.', ',') + ' €';

function log(n) {
  db.prepare(`INSERT INTO notifications(booking_id,waitlist_id,channel,kind,recipient,subject,body,status,error,created_at)
    VALUES(@booking_id,@waitlist_id,@channel,@kind,@recipient,@subject,@body,@status,@error,@created_at)`)
    .run({ booking_id: null, waitlist_id: null, error: '', created_at: Date.now(), ...n });
}

async function sendEmail({ to, subject, text, kind, booking_id = null, waitlist_id = null }) {
  const t = getTransport();
  if (!t) { log({ channel: 'email', kind, recipient: to, subject, body: text, status: 'not_configured', booking_id, waitlist_id }); return false; }
  try {
    await t.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
    log({ channel: 'email', kind, recipient: to, subject, body: text, status: 'sent', booking_id, waitlist_id });
    return true;
  } catch (e) {
    log({ channel: 'email', kind, recipient: to, subject, body: text, status: 'failed', error: String(e.message || e), booking_id, waitlist_id });
    return false;
  }
}

function bookingSummary(b) {
  return `Serviço: ${b.service_name}\nData: ${fmtDate(b.start_at)}\nPreço: ${fmtPrice(b.price_cents, b.price_type)}\nProfissional: ${b.staff_name || ''}\nReferência: ${b.ref}`;
}
const PAY_LABEL = { mbway: 'MB WAY', transferencia: 'Transferência bancária', mao: 'Em mão (no espaço)' };
const eur = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
const paidSoFar = id => db.prepare("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE booking_id=? AND status='pago'").get(id).v;
// instruções do sinal para a cliente (vazio se o sinal estiver desligado ou já pago)
function paymentText(b, s) {
  if (!s.deposit_enabled) return '';
  const paid = paidSoFar(b.id);
  const amount = b.deposit_cents != null ? `um sinal de ${eur(b.deposit_cents)} (${s.deposit_percent}% do valor)` : `um sinal de ${s.deposit_percent}% do valor (combinamos o valor contigo)`;
  if (b.deposit_cents != null && paid >= b.deposit_cents) return `Sinal recebido: ${eur(paid)}. Obrigada! O restante é pago no final do serviço.`;
  const ref = `na descrição, indica a referência ${b.ref}`;
  const mb = String(s.mbway_number || '').trim(), iban = String(s.iban || '').trim();
  let how;
  if (b.payment_method === 'mao') return `Pagamento em mão: pagas o valor total no dia, no espaço (sem sinal).`;
  else if (b.payment_method === 'transferencia' && iban) how = `Transferência bancária para o IBAN ${iban}${s.iban_name ? ' (' + s.iban_name + ')' : ''} — ${ref}.`;
  else how = [mb && `MB WAY para o número ${mb} — ${ref}.`, iban && `Ou transferência bancária para o IBAN ${iban}${s.iban_name ? ' (' + s.iban_name + ')' : ''}.`].filter(Boolean).join('\n');
  return `Pagamento: para reservar o dia e a hora peço ${amount}.\n${how}${s.payment_note ? '\n' + s.payment_note : ''}`;
}
function footer(s) {
  return `\n\n${s.business_name}\n${s.address_line}, ${s.postal_code} ${s.city}\n${s.phone} · ${s.email}`;
}

const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const pay = (b, s) => { const t = paymentText(b, s); return t ? '\n\n' + t : ''; };
const templates = {
  confirmed: (b, s, link) => ({ subject: `Marcação confirmada — ${s.business_name}`,
    text: `Olá ${first(b.customer_name)},\n\nA tua marcação está confirmada.\n\n${bookingSummary(b)}${pay(b, s)}\n\n${s.arrival_note}\n\nPolítica de cancelamento: ${s.cancellation_policy}\n\nConsultar, reagendar ou cancelar: ${link}${footer(s)}` }),
  pending: (b, s, link) => ({ subject: `Pedido recebido — pendente de confirmação`,
    text: `Olá ${first(b.customer_name)},\n\nRecebi o teu pedido. O horário fica reservado para ti até ${fmtDate(b.hold_expires_at)} enquanto confirmo a marcação (no máximo em 24 horas). Envio-te novo email quando for aceite.\n\n${bookingSummary(b)}${pay(b, s)}\n\nConsultar o pedido: ${link}${footer(s)}` }),
  approved: (b, s, link) => ({ subject: `O teu pedido foi aceite — ${s.business_name}`,
    text: `Olá ${first(b.customer_name)},\n\nBoas notícias: a tua marcação foi confirmada.\n\n${bookingSummary(b)}${pay(b, s)}\n\nGerir marcação: ${link}${footer(s)}` }),
  rejected: (b, s) => ({ subject: `Não foi possível confirmar o teu pedido`,
    text: `Olá ${first(b.customer_name)},\n\nLamento, mas não foi possível confirmar o teu pedido para ${b.service_name} em ${fmtDate(b.start_at)}.${b.cancel_reason ? '\nMotivo: ' + b.cancel_reason : ''}\n\nPodes escolher outro horário em ${s.public_base_url}/marcar.html${footer(s)}` }),
  expired: (b, s) => ({ subject: `O teu pedido expirou`,
    text: `Olá ${first(b.customer_name)},\n\nO pedido para ${b.service_name} em ${fmtDate(b.start_at)} não foi confirmado dentro do prazo e o horário foi libertado. Podes escolher outro horário em ${s.public_base_url}/marcar.html${footer(s)}` }),
  cancelled: (b, s) => ({ subject: `Marcação cancelada — ${s.business_name}`,
    text: `Olá ${first(b.customer_name)},\n\nA marcação seguinte foi cancelada:\n\n${bookingSummary(b)}\n\nSe quiseres marcar novamente: ${s.public_base_url}/marcar.html${footer(s)}` }),
  rescheduled: (b, s, link) => ({ subject: `Marcação reagendada — ${s.business_name}`,
    text: `Olá ${first(b.customer_name)},\n\nA tua marcação foi alterada. Novos dados:\n\n${bookingSummary(b)}\n\nGerir marcação: ${link}${footer(s)}` }),
  reminder: (b, s, link) => ({ subject: `Lembrete: a tua marcação é ${whenWord(b.start_at)}`,
    text: `Olá ${first(b.customer_name)},\n\nLembro-te a tua marcação:\n\n${bookingSummary(b)}\n\n${s.arrival_note}\n\nConfirma a tua presença (ou altera a marcação) aqui: ${link}${footer(s)}` }),
  proposed: (b, s, link, extra = {}) => ({ subject: `Proposta de novo horário — ${s.business_name}`,
    text: `Olá ${first(b.customer_name)},\n\nO horário que pediste não está disponível, mas posso receber-te noutro horário:\n\n${bookingSummary(b)}${extra.message ? '\n\n' + extra.message : ''}\n\nO horário fica reservado para ti até ${fmtDate(b.hold_expires_at)}. Aceita ou recusa aqui: ${link}${footer(s)}` }),
  review: (b, s, link) => ({ subject: `Como correu a tua visita?`,
    text: `Olá ${first(b.customer_name)},\n\nObrigada pela tua visita. Se quiseres, partilha a tua opinião sobre ${b.service_name} — demora menos de um minuto e ajuda outras clientes.\n\n${link}\n\nEste link é pessoal e permite uma avaliação por atendimento.${footer(s)}` })
};

function loadBooking(id) {
  return db.prepare(`SELECT b.*, c.name customer_name, c.email customer_email, c.phone customer_phone, st.name staff_name
    FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN staff st ON st.id=b.staff_id WHERE b.id=?`).get(id);
}

/** Devolve o estado real: 'sent', 'failed', 'not_configured' ou 'skipped' (cliente sem email). */
async function notifyBooking(kind, bookingId, { token, reviewToken, message } = {}) {
  const s = getSettings();
  const b = loadBooking(bookingId);
  if (!b) return 'skipped';
  const link = token ? `${s.public_base_url}/gerir.html?t=${token}` : `${s.public_base_url}/gerir.html (link no email de confirmação)`;
  if (!b.customer_email) { log({ channel: 'email', kind, recipient: '(cliente sem email)', subject: kind, body: '', status: 'skipped', error: 'Cliente sem email registado', booking_id: b.id }); return 'skipped'; }
  const tpl = templates[kind](b, s, kind === 'review' ? `${s.public_base_url}/avaliar.html?t=${reviewToken}` : link, { message });
  const ok = await sendEmail({ to: b.customer_email, subject: tpl.subject, text: tpl.text, kind, booking_id: b.id });
  // Aviso à esteticista para novas marcações e pedidos
  if (['confirmed', 'pending', 'cancelled', 'rescheduled'].includes(kind) && b.source === 'online' && /@/.test(s.email)) {
    const labels = { confirmed: 'Nova marcação', pending: 'Novo pedido para aprovar', cancelled: 'Marcação cancelada pela cliente', rescheduled: 'Marcação reagendada pela cliente' };
    await sendEmail({ to: s.email, kind: 'staff_' + kind, booking_id: b.id, subject: `${labels[kind]}: ${b.service_name}`,
      text: `${labels[kind]}\n\nCliente: ${b.customer_name} · ${b.customer_phone} · ${b.customer_email}\n${bookingSummary(b)}${b.payment_method ? '\nPagamento: ' + PAY_LABEL[b.payment_method] : ''}${b.deposit_cents != null ? '\nSinal: ' + eur(b.deposit_cents) : ''}\n\nPainel: ${s.public_base_url}/admin/` });
  }
  return ok ? 'sent' : (smtpConfigured() ? 'failed' : 'not_configured');
}

/** Texto personalizado da mensagem de aniversário: {nome} = primeiro nome, {profissional} = nome da esteticista. */
function birthdayText(c, s = getSettings()) {
  return String(s.birthday_message || '').replace(/\{nome\}/g, String(c.name || '').trim().split(/\s+/)[0]).replace(/\{profissional\}/g, s.professional_name || s.business_name);
}
async function notifyBirthday(c) {
  const s = getSettings();
  return sendEmail({ to: c.email, kind: 'birthday', subject: `Muitos parabéns, ${String(c.name).split(/\s+/)[0]}!`, text: birthdayText(c, s) + footer(s) });
}

async function notifyWaitlistOffer(entry, token, service) {
  const s = getSettings();
  const link = `${s.public_base_url}/oferta.html?t=${token}`;
  await sendEmail({ to: entry.email, kind: 'waitlist_offer', waitlist_id: entry.id,
    subject: `Surgiu uma vaga para ${service.name}`,
    text: `Olá ${entry.name},\n\nSurgiu uma vaga compatível com o teu pedido na lista de espera:\n\n${service.name}\n${fmtDate(entry.offer_start_at)}\n\nO horário fica reservado para ti até ${fmtDate(entry.offer_expires_at)}. Para reservar ou recusar: ${link}\n\nSe não responderes até lá, a vaga passa para a pessoa seguinte.${footer(s)}` });
}

/** Estado das integrações para o painel: o que está configurado e o que falta (sem expor credenciais). */
function integrationStatus() {
  const missing = ['SMTP_HOST', 'SMTP_FROM'].filter(k => !process.env[k]);
  return {
    email: { configured: smtpConfigured(), missing, from: process.env.SMTP_FROM ? process.env.SMTP_FROM.replace(/^(.{2}).*(@.*)$/, '$1…$2') : '',
      auth: !!process.env.SMTP_USER, port: Number(process.env.SMTP_PORT || 587) },
    whatsapp: { configured: true, available: true, mode: 'one_tap', note: 'Mensagens com um toque: em cada marcação, o painel abre o teu WhatsApp com a mensagem já escrita. Só tens de carregar em Enviar.' },
    sms: { configured: false, available: false, note: 'Envio de SMS não está incluído nesta versão.' },
    jobs: process.env.JOBS !== 'off'
  };
}
function integrations() {
  const s = getSettings();
  return {
    email: smtpConfigured(),
    whatsapp: false, // integração não implementada/configurada — ver README
    sms: false,
    whatsapp_link: !!s.whatsapp // apenas ligação wa.me no site (abre a conversa, não envia nada)
  };
}

// ---------- WhatsApp com um toque: textos já preenchidos para cada marcação ----------
const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)).replace(/\n{3,}/g, '\n\n').trim();
function waMessages(b, manageUrl, reviewUrl = '') {
  const s = getSettings();
  const paid = paidSoFar(b.id);
  const dep = b.deposit_cents;
  const mb = String(s.mbway_number || '').trim(), iban = String(s.iban || '').trim();
  let sinal = '';
  if (s.deposit_enabled) {
    const v = dep != null ? eur(dep) : `${s.deposit_percent}% do valor`;
    if (b.payment_method === 'mao') sinal = `Pagamento em mão: pagas o valor total${b.price_cents != null ? ' (' + eur(b.price_cents) + ')' : ''} no dia, no espaço. Não precisas de pagar sinal.`;
    else if (dep != null && paid >= dep) sinal = 'Já recebi o teu sinal, obrigada!';
    else if (b.status === 'confirmed' && b.payment_method !== 'mao' && (mb || iban)) sinal = b.payment_method === 'transferencia' && iban ? `Falta só o sinal de ${v}, por transferência para o IBAN ${iban} (referência ${b.ref}).` : `Falta só o sinal de ${v}, por MB WAY para o ${mb} (referência ${b.ref}).`;
    else if (b.payment_method === 'mao') sinal = b.status === 'confirmed' ? `Pagamento em mão, no espaço (sinal de ${v}).` : `Combinamos a entrega do sinal (${v}) aqui no espaço.`;
    else if (b.payment_method === 'transferencia' && iban) sinal = `Para reservar, peço um sinal de ${v} por transferência para o IBAN ${iban}${s.iban_name ? ' (' + s.iban_name + ')' : ''}, com a referência ${b.ref}.`;
    else if (mb) sinal = `Para reservar, peço um sinal de ${v} por MB WAY para o ${mb}, com a referência ${b.ref} na descrição. Assim que receber, confirmo a tua marcação.`;
  }
  const vars = { nome: String(b.customer_name || '').trim().split(/\s+/)[0], servico: b.service_name, data: toLocal(b.start_at).setLocale('pt-PT').toFormat("cccc, d 'de' LLLL"),
    hora: toLocal(b.start_at).toFormat('HH:mm'), sinal: dep != null ? eur(dep) : '', sinal_texto: sinal, mbway: mb, iban, ref: b.ref, link: manageUrl,
    morada: `${s.address_line}, ${s.postal_code} ${s.city}`.trim(), profissional: s.professional_name || s.business_name,
    site: `${s.public_base_url}/marcar.html`, link_avaliacao: reviewUrl };
  return { pending: fill(s.wa_tpl_pending, vars), confirmed: fill(s.wa_tpl_confirmed, vars), reminder: fill(s.wa_tpl_reminder, vars),
    proposed: fill(s.wa_tpl_proposed, vars), cancelled: fill(s.wa_tpl_cancelled, vars), review: reviewUrl ? fill(s.wa_tpl_review, vars) : '' };
}

module.exports = { waMessages, notifyBooking, notifyBirthday, birthdayText, notifyWaitlistOffer, sendEmail, integrations, integrationStatus, fmtDate, fmtPrice, smtpConfigured };
