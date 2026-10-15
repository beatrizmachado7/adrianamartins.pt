/* Dashboard de gestão (privado). Mesma base de dados e mesma agenda do site.
   Regra: nenhuma informação de duração dos serviços — cada marcação ocupa um horário. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let TZ = 'Europe/Lisbon';

  // ---------- instalar no telemóvel (aplicação / PWA) ----------
  let installEvt = null;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!window.DemoAPI && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(() => {});
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  }

  // ---------- ícones discretos ----------
  const ICONS = {
    home: '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.8 14.2c2.3.1 4 1.6 4.6 4.3"/>',
    sparkle: '<path d="M12 3.5c.6 4.4 2.2 6 6.5 6.6-4.3.6-5.9 2.2-6.5 6.6-.6-4.4-2.2-6-6.5-6.6 4.3-.6 5.9-2.2 6.5-6.6z"/><path d="M18.5 15.5c.2 1.6.8 2.2 2.3 2.4-1.5.2-2.1.8-2.3 2.4-.2-1.6-.8-2.2-2.3-2.4 1.5-.2 2.1-.8 2.3-2.4z"/>',
    euro: '<path d="M17.5 6.5A7 7 0 1 0 17.5 17.5"/><path d="M4.5 10.5h9M4.5 13.5h9"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>', phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
    gift: '<rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9c-1.5-3.5-5-4-5.5-2S9 9 12 9zm0 0c1.5-3.5 5-4 5.5-2S15 9 12 9z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    out: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    star: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4-3.9-3.8 5.4-.8z"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".8"/><circle cx="4" cy="12" r=".8"/><circle cx="4" cy="18" r=".8"/>', ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  // ---------- datas no fuso do espaço: DD/MM/AAAA e 24 h ----------
  const parts = ms => { const o = {}; for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(ms)) o[p.type] = p.value; return o; };
  const offset = ms => { const p = parts(ms); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; };
  function at(date, time = '00:00') { // data + hora de parede no fuso do espaço → instante
    const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, h, mi); let r = guess - offset(guess); const o2 = offset(r); if (guess - o2 !== r) r = guess - o2; return r;
  }
  const isoDay = ms => { const p = parts(ms); return `${p.year}-${p.month}-${p.day}`; };
  const hhmm = ms => { const p = parts(ms); return `${p.hour}:${p.minute}`; };
  const today = () => isoDay(Date.now());
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const wdMon = iso => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7 + 1;
  const dmy = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
  const dmyMs = ms => ms ? dmy(isoDay(ms)) : '—';
  const WD = ['', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  const WDS = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const longDay = iso => `${WD[wdMon(iso)]}, ${dmy(iso)}`;
  const shortDay = iso => `${WDS[wdMon(iso)]} ${dmy(iso)}`;
  const monthName = iso => { const m = MONTHS[+iso.slice(5, 7) - 1]; return m[0].toUpperCase() + m.slice(1) + ' ' + iso.slice(0, 4); };
  const dt = ms => `${dmyMs(ms)} ${hhmm(ms)}`;

  // ---------- preços em euros ----------
  const eurFmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
  const euro = c => c == null ? '—' : eurFmt.format(c / 100);
  const price = (c, t) => c == null ? 'Por definir' : (t === 'from' ? 'desde ' : t === 'addon' ? '+' : '') + euro(c) + (t === 'variable' ? ' (variável)' : '');
  const toEur = c => c == null ? '' : (c / 100).toFixed(2).replace('.', ',');

  // ---------- estados: texto + cor ----------
  const STATUS = { pending: ['Pendente', 'warn'], confirmed: ['Confirmada', 'conf'], completed: ['Concluída', 'ok'], cancelled: ['Cancelada', 'off'], no_show: ['Não compareceu', 'err'] };
  const chip = s => { const [l, c] = STATUS[s] || [s, '']; return `<span class="st st-${c}">${l}</span>`; };
  const METHODS = { numerario: 'Numerário', mbway: 'MB WAY', multibanco: 'Multibanco', cartao: 'Cartão', transferencia: 'Transferência', outro: 'Outro' };
  // forma de pagamento escolhida pela cliente ao marcar → método sugerido ao registar o sinal
  const PAY_PREF = { mbway: 'MB WAY', transferencia: 'Transferência bancária', mao: 'Em mão' };
  const PREF_METHOD = { mbway: 'mbway', transferencia: 'transferencia', mao: 'numerario' };
  const depositDue = b => b.deposit_cents != null && ['pending', 'confirmed'].includes(b.status) ? Math.max(0, b.deposit_cents - (b.paid_cents || 0)) : 0;
  const depTag = b => b.deposit_cents == null ? '' : (b.paid_cents || 0) >= b.deposit_cents ? '<span class="mini ok">Sinal recebido</span>'
    : '<span class="mini warn">Sinal por receber</span>';
  const approveLabel = b => depositDue(b) ? 'Aprovar sem sinal?' : '';
  const BLOCK_TYPES = { bloqueio: 'Bloqueio pontual', pausa: 'Pausa', folga: 'Folga', ferias: 'Férias', encerramento: 'Encerramento' };
  const REMINDER = { sent: ['Lembrete enviado', 'ok'], failed: ['Lembrete falhou', 'err'], not_configured: ['Lembrete não enviado — email não configurado', 'warn'], skipped: ['Sem lembrete — cliente sem email', 'off'] };

  // ---------- API ----------
  async function api(path, opts = {}) {
    let res;
    try {
      res = await fetch('/api/admin' + path, { method: opts.method || 'GET', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch { throw new Error('Sem ligação ao servidor. Verifica a internet e tenta novamente.'); }
    if (!/json/.test(res.headers.get('content-type') || '') && !window.DEMO_IMG) {
      throw new Error('O painel ainda não está ligado ao servidor. Fica disponível depois de o servidor (Render) ser publicado.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith('/login')) { showLogin(); throw new Error(''); }
    if (!res.ok) { const e = new Error(data.error || 'Ocorreu um erro.'); e.data = data; e.status = res.status; throw e; }
    return data;
  }
  function toast(msg, kind = 'ok') {
    const t = $('#toast'); (dlg.open ? dlg : document.body).appendChild(t); t.innerHTML = `${ic(kind === 'err' ? 'x' : 'check')}<span>${esc(msg)}</span>`;
    t.className = 'toast show ' + kind; clearTimeout(t._h); t._h = setTimeout(() => t.className = 'toast', kind === 'err' ? 5200 : 3000);
  }
  const run = fn => async (...a) => {
    const btn = a[0]?.currentTarget instanceof HTMLButtonElement ? a[0].currentTarget : (a[0]?.submitter || null);
    if (btn) { if (btn.dataset.busy) return; btn.dataset.busy = '1'; btn.classList.add('busy'); }
    try { await fn(...a); } catch (e) { if (e.message) toast(e.message, 'err'); }
    finally { if (btn) { delete btn.dataset.busy; btn.classList.remove('busy'); } }
  };
  const loading = (el = $('#view')) => { el.innerHTML = '<div class="loading" role="status"><div class="spinner"></div><span>A carregar…</span></div>'; };
  const empty = (txt, extra = '') => `<div class="empty">${esc(txt)}${extra}</div>`;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ---------- janelas ----------
  const dlg = $('#dlg');
  function modal(html, onOpen, { wide = false, side = false } = {}) {
    $('#dlg-body').innerHTML = html; dlg.classList.toggle('wide', wide); dlg.classList.toggle('side', side);
    if (!dlg.open) dlg.showModal();
    $$('[data-close]', dlg).forEach(b => b.onclick = () => dlg.close());
    onOpen && onOpen($('#dlg-body'));
  }
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  const head = (t, sub = '') => `<div class="dlg-head"><div><h2>${t}</h2>${sub ? `<p class="dlg-sub">${sub}</p>` : ''}</div><button type="button" class="icon-btn" data-close aria-label="Fechar">${ic('x')}</button></div>`;
  function armed(btn, label) { // confirmação em dois cliques (sem janelas do browser)
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1'; btn.dataset.orig = btn.innerHTML; btn.textContent = label;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.innerHTML = btn.dataset.orig; } }, 5000);
    return false;
  }
  const formMsg = (el, msg, kind = 'err') => { el.innerHTML = msg ? `<div class="notice ${kind}" role="alert">${msg}</div>` : ''; };

  // ---------- campos de data sempre em DD/MM/AAAA (o seletor nativo fica por baixo) ----------
  function enhanceDates(root = document) {
    $$('input[type=date]:not([data-dp])', root).forEach(inp => {
      inp.dataset.dp = '1';
      const wrap = document.createElement('span'); wrap.className = 'dp' + (inp.closest('.field') ? ' block' : '');
      const face = document.createElement('span'); face.className = 'input dp-face'; face.setAttribute('aria-hidden', 'true');
      inp.replaceWith(wrap); wrap.append(face, inp);
      const sync = () => { face.textContent = inp.value ? dmy(inp.value) : 'dd/mm/aaaa'; face.classList.toggle('ph', !inp.value); };
      inp.addEventListener('input', sync); inp.addEventListener('change', sync);
      inp.addEventListener('click', () => { try { inp.showPicker(); } catch { /* sem showPicker */ } });
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      Object.defineProperty(inp, 'value', { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); }, configurable: true });
      sync();
    });
  }
  new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) enhanceDates(n.matches?.('input[type=date]') ? n.parentElement : n); })
    .observe(document.body, { childList: true, subtree: true });

  // ---------- dados em cache ----------
  const cache = { services: null, staff: null, settings: null, integrations: null };
  async function load(force) {
    const jobs = [];
    if (force || !cache.services) jobs.push(api('/services').then(r => cache.services = r));
    if (force || !cache.staff) jobs.push(api('/staff').then(r => cache.staff = r));
    await Promise.all(jobs);
    return cache;
  }
  const multiStaff = () => (cache.staff || []).filter(s => s.active).length > 1;
  const svcOptions = (sel, { all = false, placeholder = '' } = {}) => {
    const { categories, services } = cache.services;
    const list = services.filter(s => all || s.active);
    const groups = categories.map(c => [c.name, list.filter(s => s.category_id === c.id)]).concat([['Sem categoria', list.filter(s => !s.category_id)]]).filter(g => g[1].length);
    return (placeholder ? `<option value="">${placeholder}</option>` : '') + groups.map(([n, l]) => `<optgroup label="${esc(n)}">${l.map(s =>
      `<option value="${s.id}" ${+sel === s.id ? 'selected' : ''}>${esc(s.name)}${s.group_name ? ' · ' + esc(s.group_name) : ''} — ${price(s.price_cents, s.price_type)}${s.active ? '' : ' (inativo)'}</option>`).join('')}</optgroup>`).join('');
  };
  const telHref = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
  const waHref = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 9) d = '351' + d; return 'https://wa.me/' + d; };

  // ---------- linha de marcação (agenda) — hora, cliente, serviço, estado ----------
  const apptRow = (b, { actions = true } = {}) => `<div class="appt s-${b.status}" data-booking="${b.id}" tabindex="0" role="button" aria-label="Abrir marcação de ${esc(b.customer_name)} às ${hhmm(b.start_at)}">
      <div class="t">${hhmm(b.start_at)}</div>
      <div class="who"><strong>${esc(b.customer_name)}</strong><span>${esc(b.service_name)}${multiStaff() ? ' · ' + esc(b.staff_name) : ''}</span>
        ${b.proposed ? '<span class="mini warn">Horário sugerido — aguarda resposta</span>' : ''}${b.attendance_confirmed_at && b.status === 'confirmed' ? '<span class="mini ok">Presença confirmada</span>' : ''}</div>
      <div class="side">${chip(b.status)}${actions ? quickActions(b) : ''}</div></div>`;
  function quickActions(b) {
    const past = b.start_at <= Date.now();
    if (b.status === 'pending') return `<span class="qa"><button class="btn tiny" data-approve="${b.id}" ${depositDue(b) ? 'data-nodep="1"' : ''}>Aprovar</button></span>`;
    if (b.status === 'confirmed' && past) return `<span class="qa"><button class="btn tiny" data-complete="${b.id}">Concluir</button></span>`;
    if (b.status === 'completed' && b.price_cents != null && b.paid_cents < b.price_cents) return `<span class="qa"><button class="btn tiny secondary" data-pay="${b.id}">Pagamento</button></span>`;
    return '';
  }
  function bindBookings(root, refresh) {
    $$('[data-booking]', root).forEach(el => {
      const open = e => { if (e.target.closest('button, a')) return; openBooking(+el.dataset.booking, refresh); };
      el.onclick = open; el.onkeydown = e => (e.key === 'Enter' || e.key === ' ') && e.target === el && (e.preventDefault(), openBooking(+el.dataset.booking, refresh));
    });
    $$('[data-approve]', root).forEach(b => b.onclick = run(async e => { e.stopPropagation(); if (b.dataset.nodep && !armed(e.currentTarget, 'Sinal por receber — aprovar?')) return; await api(`/bookings/${b.dataset.approve}/approve`, { method: 'POST', body: {} }); toast('Pedido aprovado — já está na agenda'); refresh(); }));
    $$('[data-reject]', root).forEach(b => b.onclick = e => { e.stopPropagation(); rejectDialog(+b.dataset.reject, refresh); });
    $$('[data-suggest]', root).forEach(b => b.onclick = e => { e.stopPropagation(); slotDialog({ id: +b.dataset.suggest, mode: 'suggest' }, refresh); });
    $$('[data-complete]', root).forEach(b => b.onclick = run(async e => { e.stopPropagation(); await api(`/bookings/${b.dataset.complete}`, { method: 'PATCH', body: { status: 'completed' } }); toast('Atendimento concluído'); refresh(); }));
    $$('[data-pay]', root).forEach(b => b.onclick = run(async e => { e.stopPropagation(); paymentDialog(await api(`/bookings/${b.dataset.pay}`), refresh); }));
    $$('[data-dep]', root).forEach(b => b.onclick = run(async e => { e.stopPropagation(); depositDialog(await api(`/bookings/${b.dataset.dep}`), refresh); }));
  }

  // ---------- detalhe da marcação ----------
  async function openBooking(id, refresh = route) {
    modal('<div class="loading"><div class="spinner"></div><span>A carregar…</span></div>', null, { side: true });
    let b;
    try { b = await api(`/bookings/${id}`); } catch (e) { dlg.close(); return toast(e.message, 'err'); }
    const past = b.start_at <= Date.now();
    const due = b.price_cents == null ? null : b.price_cents - b.paid_cents;
    const rem = null; // lembretes por WhatsApp (botão na marcação)
    const A = []; // ações por estado
    if (depositDue(b)) A.push(`<button class="btn small secondary" data-act="deposit">${ic('euro')}Registar sinal (${euro(depositDue(b))})</button>`);
    if (b.status === 'pending') A.push(`<button class="btn small" data-act="approve">${ic('check')}Aprovar</button>`, '<button class="btn small secondary" data-act="suggest">Sugerir outro horário</button>', '<button class="btn small ghost-err" data-act="reject">Recusar</button>');
    if (b.status === 'confirmed') {
      if (past) A.push(`<button class="btn small" data-act="complete">${ic('check')}Concluir</button>`, '<button class="btn small ghost-err" data-act="noshow">Não compareceu</button>');
      A.push('<button class="btn small secondary" data-act="move">Reagendar</button>');
      if (!b.attendance_confirmed_at && !past) A.push('<button class="btn small secondary" data-act="attend">Confirmou presença</button>');
    }
    if (['confirmed', 'completed', 'no_show'].includes(b.status) && !(due !== null && due <= 0)) A.push(`<button class="btn small secondary" data-act="pay">${ic('euro')}Registar pagamento</button>`);
    if (['pending', 'confirmed'].includes(b.status)) A.push('<button class="btn small ghost-err" data-act="cancel">Cancelar marcação</button>');
    modal(`${head(esc(b.customer_name), `${chip(b.status)} <span class="muted">Ref. ${esc(b.ref)} · ${b.source === 'admin' ? 'criada no painel' : 'pedido pelo site'}</span>`)}
      <div class="contact-row">
        <a class="pill-link" href="${telHref(b.customer_phone)}">${ic('phone')}${esc(b.customer_phone)}</a>
        <a class="pill-link" href="${waHref(b.customer_phone)}" target="_blank" rel="noopener">${ic('chat')}WhatsApp</a>
        ${b.customer_email ? `<a class="pill-link" href="mailto:${esc(b.customer_email)}">${ic('mail')}${esc(b.customer_email)}</a>` : '<span class="pill-link muted">Sem email</span>'}
        <a class="pill-link" href="#clientes/${b.customer_id}" data-close>${ic('users')}Ficha da cliente</a>
      </div>
      <dl class="kv">
        <dt>Serviço</dt><dd>${esc(b.service_name)}</dd>
        <dt>Data</dt><dd>${longDay(isoDay(b.start_at))}</dd>
        <dt>Hora</dt><dd>${hhmm(b.start_at)}</dd>
        ${multiStaff() ? `<dt>Profissional</dt><dd>${esc(b.staff_name)}</dd>` : ''}
        <dt>Preço acordado</dt><dd>${price(b.price_cents, b.price_type)}</dd>
        <dt>Pagamento</dt><dd><select class="input mini-sel" id="b-pm" aria-label="Forma de pagamento escolhida">${[['', 'Sem indicação'], ...Object.entries(PAY_PREF)].map(([k, l]) => `<option value="${k}" ${(b.payment_method || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></dd>
        ${b.deposit_cents != null ? `<dt>Sinal</dt><dd>${euro(b.deposit_cents)} ${depTag(b)}</dd>` : b.payment_method === 'mao' ? '<dt>Sinal</dt><dd><span class="mini">Sem sinal — paga tudo no espaço</span></dd>' : ''}
        ${(b.status === 'pending' || b.status === 'cancelled') && !b.paid_cents ? '' : `<dt>Pago</dt><dd>${euro(b.paid_cents)}${due > 0 && ['completed', 'no_show'].includes(b.status) ? ` <span class="mini warn">Por receber ${euro(due)}</span>` : due !== null && due <= 0 ? ' <span class="mini ok">Pago</span>' : ''}</dd>`}
        ${b.status === 'pending' ? `<dt>Reservado até</dt><dd>${b.hold_expires_at ? dt(b.hold_expires_at) : '—'}</dd>` : ''}
        ${rem ? `<dt>Lembrete</dt><dd><span class="mini ${rem[1]}">${rem[0]}</span></dd>` : ''}
        ${b.status === 'confirmed' ? `<dt>Presença</dt><dd>${b.attendance_confirmed_at ? `<span class="mini ok">Confirmada ${b.attendance_source === 'cliente' ? 'pela cliente' : '(' + esc(b.attendance_source) + ')'} · ${dt(b.attendance_confirmed_at)}</span>` : '<span class="muted">Por confirmar</span>'}</dd>` : ''}
        ${b.cancel_reason && ['cancelled'].includes(b.status) ? `<dt>Motivo</dt><dd>${esc(b.cancel_reason)}</dd>` : ''}
      </dl>
      ${A.length ? `<div class="actions">${A.join('')}</div>` : ''}
      ${waBlock(b)}
      <div class="field" style="margin-top:18px"><label for="b-notes">Notas internas <span class="muted small">(só tu vês — não registes dados de saúde)</span></label>
        <textarea class="input" id="b-notes" rows="3" maxlength="1000">${esc(b.internal_notes)}</textarea></div>
      <button class="btn tiny secondary" data-act="notes">Guardar notas</button>
      ${b.payments.length ? `<h3 class="sec-h">Pagamentos</h3><div class="mini-list">${b.payments.map(p => `<div class="mini-row ${p.status === 'anulado' ? 'void' : ''}">
          <span><b>${euro(p.amount_cents)}</b> · ${METHODS[p.method] || esc(p.method)} · ${dmyMs(p.paid_at)}${p.note ? ' · ' + esc(p.note) : ''}</span>
          ${p.status === 'pago' ? `<button class="link-btn" data-void="${p.id}">Anular</button>` : `<span class="mini off">Anulado${p.void_reason ? ': ' + esc(p.void_reason) : ''}</span>`}</div>`).join('')}</div>` : ''}
      <details class="history"><summary>Histórico de alterações (${b.events.length})</summary>
        <ol class="timeline">${b.events.map(e => `<li><time>${dt(e.at)}</time><b>${esc(e.action)}</b>${e.details ? `<span>${esc(e.details)}</span>` : ''}<em>${esc(e.actor)}</em></li>`).join('') || '<li>Sem registos.</li>'}</ol>
        
      </details>`, body => {
      const act = (k, fn) => { const el = $(`[data-act="${k}"]`, body); if (el) el.onclick = run(fn); };
      const done = async (msg, reopen = true) => { toast(msg); refresh(); if (reopen && dlg.open) openBooking(id, refresh); };
      act('approve', async e => { if (depositDue(b) && !armed(e.currentTarget, 'Sinal por receber — aprovar mesmo assim?')) return; await api(`/bookings/${id}/approve`, { method: 'POST', body: {} }); done('Pedido aprovado — já está na agenda'); });
      act('deposit', async () => depositDialog(b, refresh));
      const pm = $('#b-pm', body); if (pm) pm.onchange = run(async () => { await api(`/bookings/${id}`, { method: 'PATCH', body: { payment_method: pm.value } }); toast('Forma de pagamento atualizada'); refresh(); });
      act('reject', async () => rejectDialog(id, refresh));
      act('suggest', async () => slotDialog({ id, mode: 'suggest', booking: b }, refresh));
      act('move', async () => slotDialog({ id, mode: 'move', booking: b }, refresh));
      act('complete', async () => { await api(`/bookings/${id}`, { method: 'PATCH', body: { status: 'completed' } }); done('Atendimento concluído'); });
      act('noshow', async e => { if (!armed(e.currentTarget, 'Confirmar: não compareceu')) return; await api(`/bookings/${id}`, { method: 'PATCH', body: { status: 'no_show' } }); done('Assinalado: não compareceu'); });
      act('attend', async () => { await api(`/bookings/${id}`, { method: 'PATCH', body: { attendance: 'telefone/mensagem' } }); done('Presença confirmada'); });
      act('pay', async () => paymentDialog(b, refresh));
      act('cancel', async () => cancelDialog(id, refresh));
      act('notes', async () => { await api(`/bookings/${id}`, { method: 'PATCH', body: { internal_notes: $('#b-notes', body).value } }); toast('Notas guardadas'); });
      $$('[data-void]', body).forEach(x => x.onclick = () => voidDialog(+x.dataset.void, id, refresh));
      $$('[data-wa]', body).forEach(a => a.addEventListener('click', () => { api(`/bookings/${id}/wa-log`, { method: 'POST', body: { kind: a.dataset.wa } }).then(() => setTimeout(() => dlg.open && openBooking(id, refresh), 800)).catch(() => {}); }));
    }, { side: true });
  }

  // WhatsApp com um toque: abre o WhatsApp da Adriana com a mensagem já escrita (ela só carrega em Enviar)
  function waBlock(b) {
    if (!b.customer_phone || b.start_at < Date.now()) return '';
    if (b.status === 'pending' && !b.proposed) return `<div class="wa-box"><span class="wa-h">${ic('chat')}Marcação recebida — automático</span>
      <span class="small muted">A cliente já viu no site a confirmação da marcação e os dados do sinal, e enviou-te a marcação por WhatsApp. Não precisas de enviar nada agora: aprova e envia o "Marcação confirmada".</span></div>`;
    if (b.status !== 'confirmed' || !b.wa) return '';
    const done = (b.events || []).some(e => e.action === 'WhatsApp aberto' && (e.details === WA_L.confirmed || e.details === 'pedido confirmado'));
    return `<div class="wa-box ${done ? '' : 'todo'}"><span class="wa-h">${ic('chat')}Enviar por WhatsApp</span>
      <span class="small ${done ? 'muted' : ''}">${done ? 'Mensagem "Marcação confirmada" já enviada. Podes voltar a abri-la se precisares.' : 'Falta avisar a cliente: <b>"Marcação confirmada"</b>.'}</span>
      <div class="wa-btns"><a class="btn tiny ${done ? 'secondary' : ''}" data-wa="confirmed" href="${waHref(b.customer_phone)}?text=${encodeURIComponent(b.wa.confirmed)}" target="_blank" rel="noopener">${ic('chat')}Marcação confirmada${done ? ' ✓' : ''}</a></div></div>`;
  }
  // lembretes por WhatsApp na véspera (um toque, a partir das 21h)
  const remRow = b => `<div class="mini-row rem-row"><span><b>${hhmm(b.start_at)}</b> · ${esc(b.customer_name)} · ${esc(b.service_name)}${b.attendance_confirmed_at ? ' <span class="mini ok">Presença confirmada</span>' : ''}</span>
    <span class="row-actions"><a class="btn tiny ${b.wa_reminder_sent ? 'secondary' : ''}" data-rem="${b.id}" href="${waHref(b.customer_phone)}?text=${encodeURIComponent(b.wa_reminder || '')}" target="_blank" rel="noopener">${ic('chat')}${b.wa_reminder_sent ? 'Lembrete enviado ✓' : 'Enviar lembrete'}</a></span></div>`;
  const bindRem = (root, refresh) => $$('[data-rem]', root).forEach(a => a.addEventListener('click', () => {
    api(`/bookings/${a.dataset.rem}/wa-log`, { method: 'POST', body: { kind: 'reminder' } }).then(() => setTimeout(() => { refresh(); updateBadges(); }, 400)).catch(() => {});
  }));
  async function remCard(el) {
    const r = await api('/reminders').catch(() => null);
    if (!r || !el.isConnected) return;
    if (!r.list.length) { el.innerHTML = ''; return; }
    if (!r.due) { el.innerHTML = `<div class="notice slim">${ic('bell')}<span>Amanhã tens ${r.list.length} ${r.list.length === 1 ? 'marcação' : 'marcações'}. Às ${r.hour}h aparecem aqui os lembretes para enviares por WhatsApp.</span></div>`; return; }
    el.innerHTML = `<section class="panel rem-panel ${r.unsent ? 'todo' : ''}"><h2>${ic('chat')}Lembretes de amanhã <small>${r.unsent ? r.unsent + ' por enviar' : 'todos enviados ✓'}</small></h2>
      <p class="small muted">${longDay(r.date)} · cada botão abre o WhatsApp com a mensagem já escrita — só tens de carregar em Enviar.</p>${r.list.map(remRow).join('')}</section>`;
    bindRem(el, () => remCard(el));
  }
  const WA_L = { pending: 'marcação recebida', confirmed: 'marcação confirmada', reminder: 'lembrete', proposed: 'proposta de horário', cancelled: 'aviso de cancelamento', review: 'pedido de avaliação' };
  function cancelDialog(id, refresh) {
    modal(`${head('Cancelar marcação')}<form id="cf"><div class="field"><label for="c-r">Motivo <span class="muted small">(opcional — fica no histórico)</span></label><input class="input" id="c-r" maxlength="300"></div>
      <p class="small muted">O horário fica livre de imediato para outras marcações.</p><div id="cf-msg"></div>
      <div class="actions"><button class="btn ghost-err" type="submit">Cancelar marcação</button><button class="btn secondary" type="button" data-close>Voltar</button></div></form>`, body => {
      $('#cf', body).onsubmit = run(async e => { e.preventDefault(); await api(`/bookings/${id}`, { method: 'PATCH', body: { status: 'cancelled', reason: $('#c-r', body).value } }); toast('Marcação cancelada — horário libertado'); refresh(); openBooking(id, refresh); });
    });
  }
  function rejectDialog(id, refresh) {
    modal(`${head('Recusar pedido')}<form id="rf"><div class="field"><label for="r-r">Motivo <span class="muted small">(opcional — fica no histórico)</span></label><input class="input" id="r-r" maxlength="300" placeholder="Ex.: Não tenho disponibilidade nesse dia"></div>
      <p class="small muted">Em alternativa, podes <b>sugerir outro horário</b> em vez de recusar.</p>
      <div class="actions"><button class="btn ghost-err" type="submit">Recusar pedido</button><button class="btn secondary" type="button" data-close>Voltar</button></div></form>`, body => {
      $('#rf', body).onsubmit = run(async e => { e.preventDefault(); await api(`/bookings/${id}/reject`, { method: 'POST', body: { reason: $('#r-r', body).value } }); toast('Pedido recusado'); refresh(); openBooking(id, refresh); });
    });
  }
  function voidDialog(pid, bid, refresh) {
    modal(`${head('Anular pagamento')}<form id="vf"><p class="small muted">O pagamento fica no histórico como anulado e deixa de contar no total recebido.</p>
      <div class="field"><label for="v-r">Motivo</label><input class="input" id="v-r" required maxlength="200" placeholder="Ex.: registado por engano"></div>
      <div class="actions"><button class="btn ghost-err" type="submit">Anular</button><button class="btn secondary" type="button" data-close>Voltar</button></div></form>`, body => {
      $('#vf', body).onsubmit = run(async e => { e.preventDefault(); await api(`/payments/${pid}/void`, { method: 'POST', body: { reason: $('#v-r', body).value } }); toast('Pagamento anulado'); refresh(); bid ? openBooking(bid, refresh) : dlg.close(); });
    });
  }

  // registar pagamento — idempotente (a mesma chave nunca regista duas vezes)
  const depositDialog = (b, refresh) => paymentDialog(b, refresh, { amount: depositDue(b), method: PREF_METHOD[b.payment_method] || 'mbway', note: 'Sinal', title: 'Registar sinal' });
  function paymentDialog(b, refresh, preset = {}) {
    const key = uuid();
    const due = preset.amount ?? (b.price_cents == null ? null : Math.max(0, b.price_cents - (b.paid_cents || 0)));
    const m0 = preset.method || 'numerario';
    modal(`${head(preset.title || 'Registar pagamento', `${esc(b.customer_name)} · ${esc(b.service_name)} · ${dmyMs(b.start_at)} ${hhmm(b.start_at)}`)}
      <form id="pf" novalidate>
        <p class="small muted" style="margin-top:0">Preço acordado: <b>${price(b.price_cents, b.price_type)}</b> · Já pago: <b>${euro(b.paid_cents || 0)}</b></p>
        <div class="form-grid">
          <div class="field"><label for="p-v">Valor (€)</label><input class="input" id="p-v" inputmode="decimal" value="${due ? toEur(due) : ''}" required placeholder="0,00"></div>
          <div class="field"><label for="p-d">Data do pagamento</label><input class="input" id="p-d" type="date" value="${today()}" max="${today()}" required></div>
        </div>
        <div class="field"><span class="label">Método</span><div class="choice">${Object.entries(METHODS).map(([k, l]) => `<label><input type="radio" name="m" value="${k}" ${k === m0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
        <div class="field"><label for="p-n">Nota <span class="muted small">(opcional)</span></label><input class="input" id="p-n" maxlength="300" value="${esc(preset.note || '')}"></div>
        <div id="pf-msg"></div>
        <div class="actions"><button class="btn" type="submit">${ic('check')}${preset.title || 'Registar pagamento'}</button><button class="btn secondary" type="button" data-close>Cancelar</button></div>
      </form>`, body => {
      $('#pf', body).onsubmit = run(async e => {
        e.preventDefault();
        const payload = { amount_eur: $('#p-v', body).value, paid_on: $('#p-d', body).value, method: $('input[name=m]:checked', body).value, note: $('#p-n', body).value, request_key: key };
        try {
          const r = await api(`/bookings/${b.id}/payments`, { method: 'POST', body: payload });
          toast(r.duplicate ? 'Este pagamento já estava registado' : 'Pagamento registado'); refresh(); openBooking(b.id, refresh);
        } catch (err) {
          if (err.data?.code === 'OVERPAID') {
            formMsg($('#pf-msg', body), `${esc(err.message)}<br><button type="button" class="btn tiny secondary" id="p-over" style="margin-top:8px">Registar mesmo assim (ex.: gorjeta ou extra)</button>`, 'warn');
            $('#p-over', body).onclick = run(async () => { await api(`/bookings/${b.id}/payments`, { method: 'POST', body: { ...payload, allow_over: true } }); toast('Pagamento registado'); refresh(); openBooking(b.id, refresh); });
          } else formMsg($('#pf-msg', body), esc(err.message));
        }
      });
    });
  }

  // escolher um horário livre (reagendar, sugerir outro horário, nova marcação)
  async function freeTimes(date, staffId) { return api(`/slots?date=${date}${staffId ? '&staff_id=' + staffId : ''}`); }
  function slotPicker(root, { date, staffId, onPick, allowOther = false }) {
    root.innerHTML = `<div class="sp"><div class="sp-top"><button type="button" class="icon-btn" data-d="-1" aria-label="Dia anterior">${ic('left')}</button>
        <input class="input" type="date" value="${date}" min="${today()}" aria-label="Dia"><button type="button" class="icon-btn" data-d="1" aria-label="Dia seguinte">${ic('right')}</button></div>
      <div class="sp-times" aria-live="polite"></div>${allowOther ? `<details class="sp-other"><summary>Outra hora (fora dos horários abertos)</summary><div class="av-row"><input class="input" type="time" step="300" aria-label="Hora"><button type="button" class="btn tiny secondary">Usar esta hora</button></div></details>` : ''}</div>`;
    const inp = $('input[type=date]', root), box = $('.sp-times', root);
    let chosen = null;
    async function show() {
      box.innerHTML = '<div class="spinner"></div>';
      try {
        const list = await freeTimes(inp.value, staffId);
        box.innerHTML = list.length ? list.map(t => `<button type="button" class="slot-btn" data-s="${t.start}" data-staff="${t.staff_id}">${t.time}${multiStaff() ? `<small>${esc(t.staff_name)}</small>` : ''}</button>`).join('')
          : `<p class="muted small">Sem horários livres em ${dmy(inp.value)}. Abre horários em Calendário → Horários para marcação${allowOther ? ' ou usa "Outra hora"' : ''}.</p>`;
        $$('.slot-btn', box).forEach(b => b.onclick = () => { $$('.slot-btn', box).forEach(x => x.setAttribute('aria-pressed', x === b)); chosen = { start: +b.dataset.s, staff_id: +b.dataset.staff }; onPick(chosen); });
      } catch (e) { box.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; }
      onPick(null);
    }
    inp.onchange = show;
    $$('[data-d]', root).forEach(b => b.onclick = () => { const n = addDays(inp.value, +b.dataset.d); if (n >= today()) { inp.value = n; show(); } });
    if (allowOther) $('.sp-other button', root).onclick = () => { const t = $('.sp-other input', root).value; if (!t) return toast('Indica a hora', 'err'); $$('.slot-btn', box).forEach(x => x.setAttribute('aria-pressed', false)); onPick({ start: at(inp.value, t), staff_id: staffId || null, other: true }); toast(`Hora escolhida: ${dmy(inp.value)} ${t}`); };
    show();
  }
  function slotDialog({ id, mode, booking }, refresh) {
    const T = { move: ['Reagendar marcação', 'Reagendar', 'move'], suggest: ['Sugerir outro horário', 'Enviar sugestão', 'suggest'] }[mode];
    let pick = null;
    modal(`${head(T[0], booking ? `${esc(booking.customer_name)} · ${esc(booking.service_name)} · atualmente ${dmyMs(booking.start_at)} ${hhmm(booking.start_at)}` : '')}
      ${mode === 'suggest' ? '<p class="small muted" style="margin-top:0">O pedido passa para o horário escolhido, que fica reservado para a cliente. Continua pendente até ela aceitar pelo link do email — ou até tu o aprovares depois de falares com ela.</p>' : '<p class="small muted" style="margin-top:0">O horário atual fica livre assim que confirmares.</p>'}
      <div id="sp"></div>
      ${mode === 'suggest' ? '<div class="field"><label for="s-m">Mensagem para a cliente <span class="muted small">(opcional)</span></label><input class="input" id="s-m" maxlength="300"></div>' : '<label class="check"><input type="checkbox" id="s-n" checked><span>Avisar a cliente por email (se tiver email e o email estiver configurado)</span></label>'}
      <div id="s-msg"></div><div class="actions"><button class="btn" id="s-go" disabled>${T[1]}</button><button class="btn secondary" data-close>Cancelar</button></div>`, body => {
      slotPicker($('#sp', body), { date: booking && booking.start_at > Date.now() ? isoDay(booking.start_at) : today(), staffId: null, allowOther: mode === 'move', onPick: p => { pick = p; $('#s-go', body).disabled = !p; } });
      $('#s-go', body).onclick = run(async () => {
        if (!pick) return;
        try {
          if (mode === 'move') { await api(`/bookings/${id}/move`, { method: 'POST', body: { start: pick.start, staff_id: pick.staff_id, notify: $('#s-n', body).checked } }); toast('Marcação reagendada'); }
          else {
            const r = await api(`/bookings/${id}/suggest`, { method: 'POST', body: { start: pick.start, staff_id: pick.staff_id, message: $('#s-m', body).value } });
            toast('Horário reservado — envia a proposta por WhatsApp');
          }
          refresh(); openBooking(id, refresh);
        } catch (e) { formMsg($('#s-msg', body), esc(e.message)); }
      });
    });
  }

  // ---------- nova marcação (telefone, mensagem, presencial) ----------
  async function newBooking(pre = {}, refresh = route) {
    await load();
    let customer = pre.customer || null, pick = pre.start ? { start: pre.start, staff_id: pre.staff_id || null } : null;
    modal(`${head('Nova marcação', 'Para pedidos recebidos por telefone, mensagem ou ao balcão.')}
      <form id="nf" novalidate>
        <div class="field"><span class="label">Cliente</span><div id="n-cli"></div></div>
        <div class="field"><label for="n-svc">Serviço</label><select class="input" id="n-svc" required>${svcOptions(pre.service_id, { placeholder: 'Escolhe o serviço' })}</select></div>
        <div class="field"><span class="label">Dia e hora</span>${pre.start ? `<div class="picked">${longDay(isoDay(pre.start))} · <b>${hhmm(pre.start)}</b> <button type="button" class="link-btn" id="n-change">Alterar</button></div><div id="n-sp" hidden></div>` : '<div id="n-sp"></div>'}</div>
        <div class="form-grid">
          <div class="field"><label for="n-ch">Pedido recebido por</label><select class="input" id="n-ch"><option>Telefone</option><option>Mensagem</option><option>Presencial</option><option>Instagram</option><option>Outro</option></select></div>
          <div class="field"><label for="n-st">Estado</label><select class="input" id="n-st"><option value="confirmed">Confirmada</option><option value="pending">Pendente (a confirmar com a cliente)</option></select></div>
        </div>
        <div class="field"><label for="n-notes">Notas internas <span class="muted small">(opcional)</span></label><textarea class="input" id="n-notes" rows="2" maxlength="1000"></textarea></div>

        <div id="nf-msg"></div>
        <div class="actions"><button class="btn" type="submit">${ic('check')}Criar marcação</button><button class="btn secondary" type="button" data-close>Cancelar</button></div>
      </form>`, body => {
      const cli = $('#n-cli', body);
      function renderCli() {
        if (customer) {
          cli.innerHTML = `<div class="picked">${ic('users')}<b>${esc(customer.name)}</b> · ${esc(customer.phone)}${customer.email ? ' · ' + esc(customer.email) : ''} <button type="button" class="link-btn" id="n-cl-x">Trocar</button></div>`;
          $('#n-cl-x', cli).onclick = () => { customer = null; renderCli(); };
          return;
        }
        cli.innerHTML = `<div class="search-box">${ic('search')}<input class="input" id="n-q" placeholder="Procurar cliente por nome, telefone ou email" autocomplete="off"></div>
          <div id="n-res" class="typeahead"></div>
          <details id="n-newd" ${pre.newCustomer ? 'open' : ''}><summary>Nova cliente</summary>
            <div class="form-grid" style="margin-top:10px"><div class="field"><label for="n-name">Nome</label><input class="input" id="n-name" autocomplete="off" maxlength="80"></div>
            <div class="field"><label for="n-phone">Telefone</label><input class="input" id="n-phone" type="tel" inputmode="tel" maxlength="30"></div></div>
            <div class="field"><label for="n-email">Email <span class="muted small">(opcional)</span></label><input class="input" id="n-email" type="email" inputmode="email" maxlength="120"></div></details>`;
        let h;
        $('#n-q', cli).oninput = e => { clearTimeout(h); const q = e.target.value.trim(); if (q.length < 2) { $('#n-res', cli).innerHTML = ''; return; }
          h = setTimeout(async () => {
            const list = await api('/customers?limit=6&q=' + encodeURIComponent(q)).catch(() => []);
            $('#n-res', cli).innerHTML = list.length ? list.map(c => `<button type="button" data-c='${esc(JSON.stringify({ id: c.id, name: c.name, phone: c.phone, email: c.email }))}'><b>${esc(c.name)}</b><span>${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}${c.last_visit ? ' · última visita ' + dmyMs(c.last_visit) : ''}</span></button>`).join('')
              : '<p class="small muted" style="margin:6px 0">Nenhuma ficha encontrada — cria uma nova cliente abaixo.</p>';
            $$('[data-c]', cli).forEach(b => b.onclick = () => { customer = JSON.parse(b.dataset.c); renderCli(); });
            if (!list.length) $('#n-newd', cli).open = true;
          }, 220); };
      }
      renderCli();
      const startPicker = () => slotPicker($('#n-sp', body), { date: pre.date && pre.date >= today() ? pre.date : today(), allowOther: true, onPick: p => { pick = p; } });
      if (!pre.start) startPicker(); else $('#n-change', body).onclick = () => { $('#n-sp', body).hidden = false; $('#n-change', body).parentElement.remove(); pick = null; startPicker(); };
      const submit = async force => {
        const msg = $('#nf-msg', body); formMsg(msg, '');
        const service_id = $('#n-svc', body).value;
        if (!service_id) return formMsg(msg, 'Escolhe o serviço.');
        if (!pick) return formMsg(msg, 'Escolhe o dia e a hora.');
        const payload = { service_id, start: pick.start, staff_id: pick.staff_id || undefined, status: $('#n-st', body).value, channel: $('#n-ch', body).value,
          internal_notes: $('#n-notes', body).value, notify: false, force_new: !!force };
        if (customer) payload.customer_id = customer.id;
        else Object.assign(payload, { name: $('#n-name', body)?.value, phone: $('#n-phone', body)?.value, email: $('#n-email', body)?.value });
        try {
          const r = await api('/bookings', { method: 'POST', body: payload });
          toast('Marcação criada — já está na agenda'); refresh(); if (pre.onCreated) pre.onCreated(r); openBooking(r.id, refresh);
        } catch (e) {
          if (e.data?.code === 'POSSIBLE_DUPLICATE') {
            formMsg(msg, `<b>Esta cliente já pode ter ficha.</b> ${esc(e.message)}<div class="dup-pick">${e.data.matches.map(m => `<button type="button" class="btn tiny" data-use='${esc(JSON.stringify(m))}'>Usar: ${esc(m.name)} · ${esc(m.phone)}</button>`).join('')}
              <button type="button" class="btn tiny secondary" id="n-force">Não é a mesma pessoa — criar nova ficha</button></div>`, 'warn');
            $$('[data-use]', msg).forEach(b => b.onclick = () => { customer = JSON.parse(b.dataset.use); renderCli(); formMsg(msg, ''); submit(false); });
            $('#n-force', msg).onclick = () => submit(true);
          } else if (e.data?.errors) formMsg(msg, Object.values(e.data.errors).map(esc).join('<br>'));
          else formMsg(msg, esc(e.message));
        }
      };
      $('#nf', body).onsubmit = run(async e => { e.preventDefault(); await submit(false); });
    }, { wide: true });
  }

  // ---------- bloquear horário ----------
  function blockDialog(pre = {}, refresh = route) {
    modal(`${head('Bloquear horário', 'O horário deixa de aparecer no site para marcações.')}
      <form id="bf" novalidate>
        <div class="seg full" role="tablist">${[['um', 'Um horário'], ['dia', 'Dia inteiro'], ['periodo', 'Período']].map(([k, l], i) => `<button type="button" data-mode="${k}" aria-pressed="${(pre.mode || 'um') === k}">${l}</button>`).join('')}</div>
        <div class="form-grid" style="margin-top:14px">
          <div class="field"><label for="bk-type">Tipo</label><select class="input" id="bk-type">${Object.entries(BLOCK_TYPES).map(([k, l]) => `<option value="${k}" ${pre.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${multiStaff() ? `<div class="field"><label for="bk-staff">Aplica-se a</label><select class="input" id="bk-staff"><option value="">Todo o espaço</option>${cache.staff.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>` : ''}
        </div>
        <div data-m="um"><div class="form-grid"><div class="field"><label for="bk-d">Dia</label><input class="input" type="date" id="bk-d" value="${pre.date || today()}"></div>
          <div class="field"><label for="bk-t">Hora</label><input class="input" type="time" id="bk-t" step="300" value="${pre.time || ''}"></div></div></div>
        <div data-m="dia" hidden><div class="field"><label for="bk-dd">Dia</label><input class="input" type="date" id="bk-dd" value="${pre.date || today()}"></div></div>
        <div data-m="periodo" hidden><div class="form-grid"><div class="field"><label for="bk-d1">De</label><input class="input" type="date" id="bk-d1" value="${pre.date || today()}"></div><div class="field"><label for="bk-t1">Hora</label><input class="input" type="time" id="bk-t1" value="00:00"></div></div>
          <div class="form-grid"><div class="field"><label for="bk-d2">Até</label><input class="input" type="date" id="bk-d2" value="${pre.date || today()}"></div><div class="field"><label for="bk-t2">Hora</label><input class="input" type="time" id="bk-t2" value="23:59"></div></div></div>
        <div class="field"><label for="bk-r">Motivo interno <span class="muted small">(opcional)</span></label><input class="input" id="bk-r" maxlength="200"></div>
        <div class="field" data-pub hidden><label for="bk-p">Nota no site <span class="muted small">(férias e encerramentos aparecem em Contactos)</span></label><input class="input" id="bk-p" maxlength="200" placeholder="Ex.: Encerrado para férias"></div>
        <div id="bk-msg"></div>
        <div class="actions"><button class="btn" type="submit">${ic('lock')}Bloquear</button><button class="btn secondary" type="button" data-close>Cancelar</button></div>
      </form>`, body => {
      let mode = pre.mode || 'um';
      const sync = () => { $$('[data-m]', body).forEach(x => x.hidden = x.dataset.m !== mode); $$('[data-mode]', body).forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode)); $('[data-pub]', body).hidden = !['ferias', 'encerramento'].includes($('#bk-type', body).value); };
      $$('[data-mode]', body).forEach(b => b.onclick = () => { mode = b.dataset.mode; sync(); });
      $('#bk-type', body).onchange = sync; sync();
      $('#bf', body).onsubmit = run(async e => {
        e.preventDefault(); const msg = $('#bk-msg', body);
        let s, en;
        if (mode === 'um') { const t = $('#bk-t', body).value; if (!t) return formMsg(msg, 'Indica a hora a bloquear.'); s = at($('#bk-d', body).value, t); en = s + 60000; }
        else if (mode === 'dia') { const d = $('#bk-dd', body).value; s = at(d); en = at(addDays(d, 1)); }
        else { s = at($('#bk-d1', body).value, $('#bk-t1', body).value || '00:00'); const t2 = $('#bk-t2', body).value || '23:59'; en = t2 === '23:59' ? at(addDays($('#bk-d2', body).value, 1)) : at($('#bk-d2', body).value, t2); }
        if (!(en > s)) return formMsg(msg, 'O fim tem de ser depois do início.');
        const r = await api('/blocks', { method: 'POST', body: { type: $('#bk-type', body).value, staff_id: $('#bk-staff', body)?.value || null, start_at: s, end_at: en, reason: $('#bk-r', body).value, public_note: $('#bk-p', body).value } });
        refresh();
        if (r.affected.length) {
          modal(`${head('Bloqueio criado — atenção')}<div class="notice warn">Já existem marcações neste período. Não foram canceladas automaticamente: decide caso a caso (reagendar ou cancelar).</div><div style="margin-top:12px">${r.affected.map(b => apptRow(b, { actions: false })).join('')}</div>`, body2 => bindBookings(body2, refresh));
        } else { toast('Horário bloqueado'); dlg.close(); }
      });
    });
  }

  const views = {};
  let seq = 0; // cada navegação incrementa: respostas antigas não desenham por cima do ecrã atual
  const stale = my => my !== seq;
  // ---------- gráficos simples (SVG): barras com dica ao passar o rato/tocar e tabela acessível ----------
  const C_REV = '#96562c', C_EXP = '#b88a2a'; // receitas · despesas (validados para daltonismo)
  const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
  const eurShort = c => { const v = c / 100; return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + ' mil €' : Math.round(v) + ' €'; };
  function barChart(el, { labels, long = labels, series, height = 210, valueFmt = euro, axisFmt = eurShort }) {
    if (!el) return;
    const draw = () => {
      const W = Math.max(280, el.clientWidth || 600), H = height, padL = 52, padR = 8, padT = 12, padB = 26;
      const n = labels.length, k = series.length, cw = W - padL - padR, ch = H - padT - padB, band = cw / Math.max(1, n);
      const max = niceMax(Math.max(0, ...series.flatMap(s => s.values)));
      const bw = Math.max(3, Math.min(24, (band * 0.72 - 2 * (k - 1)) / k));
      const y = v => padT + ch - (v / max) * ch;
      const bar = (x, v, color) => { const top = y(v), h = padT + ch - top; if (v <= 0) return ''; const r = Math.min(4, h, bw / 2);
        return `<path d="M${x},${padT + ch} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${padT + ch} Z" fill="${color}"/>`; };
      const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(cw / 46))));
      const ticks = [0, max / 2, max];
      let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(series.map(s => s.name).join(' e '))}">`;
      svg += ticks.map(t => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="ch-grid"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end" class="ch-ax">${axisFmt(t)}</text>`).join('');
      for (let i = 0; i < n; i++) {
        const gx = padL + band * i + (band - (bw * k + 2 * (k - 1))) / 2;
        svg += `<g class="ch-col" data-i="${i}">${series.map((s, j) => bar(gx + j * (bw + 2), s.values[i], s.color)).join('')}<rect x="${padL + band * i}" y="${padT}" width="${band}" height="${ch}" fill="transparent"/></g>`;
        if (i % every === 0) svg += `<text x="${padL + band * i + band / 2}" y="${H - 8}" text-anchor="middle" class="ch-ax">${esc(labels[i])}</text>`;
      }
      svg += '</svg>';
      el.innerHTML = `${k > 1 ? `<div class="ch-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''}<div class="ch-box">${svg}<div class="ch-tip" hidden></div></div>
        <details class="ch-table"><summary>Ver em tabela</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${series.map(s => `<th class="num">${esc(s.name)}</th>`).join('')}</tr></thead>
        <tbody>${labels.map((l, i) => `<tr><td>${esc(long[i])}</td>${series.map(s => `<td class="num">${valueFmt(s.values[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
      const box = $('.ch-box', el), tip = $('.ch-tip', el);
      const show = (g, ev) => {
        const i = +g.dataset.i; $$('.ch-col', el).forEach(x => x.classList.toggle('dim', x !== g));
        tip.innerHTML = `<b>${esc(long[i])}</b>${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}: <b>${valueFmt(s.values[i])}</b></span>`).join('')}`;
        tip.hidden = false; const r = box.getBoundingClientRect(), gx = g.getBoundingClientRect();
        let left = gx.left - r.left + gx.width / 2 - tip.offsetWidth / 2; left = Math.max(0, Math.min(left, r.width - tip.offsetWidth));
        tip.style.left = left + 'px'; tip.style.top = '0px';
      };
      $$('.ch-col', el).forEach(g => { g.addEventListener('pointerenter', e => show(g, e)); g.addEventListener('pointerdown', e => show(g, e)); });
      box.addEventListener('pointerleave', () => { tip.hidden = true; $$('.ch-col', el).forEach(x => x.classList.remove('dim')); });
    };
    draw();
    if ('ResizeObserver' in window) { let w = el.clientWidth; const ro = new ResizeObserver(() => { if (!el.isConnected) return ro.disconnect(); if (Math.abs(el.clientWidth - w) > 20) { w = el.clientWidth; draw(); } }); ro.observe(el); }
  }
  const MSH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const seriesLabels = (list, unit) => unit === 'month'
    ? { labels: list.map(p => MSH[+p.key.slice(5, 7) - 1]), long: list.map(p => monthName(p.key + '-01')) }
    : { labels: list.map(p => p.key.slice(8) + '/' + p.key.slice(5, 7)), long: list.map(p => longDay(p.key)) };
  const hbars = (list, fmtV = euro, sub = () => '') => { const max = Math.max(1, ...list.map(x => x.v)); return list.map(x => `<div class="bar-row" title="${esc(x.name)}: ${fmtV(x.v)}"><span class="bar-l">${esc(x.name)}${sub(x)}</span><span class="bar"><span style="width:${Math.max(3, Math.round(x.v / max * 100))}%"></span></span><b>${fmtV(x.v)}</b></div>`).join(''); };

  // ---------- DASHBOARD ----------
  const dash = { range: '30d' };
  const greeting = () => { const h = +hhmm(Date.now()).slice(0, 2); return h < 6 ? 'Boa noite' : h < 13 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'; };
  views.dashboard = async () => {
    await load();
    const my = seq;
    const d = await api('/dashboard');
    if (stale(my)) return;
    const c = d.cards, nx = c.next, first = String(d.name || '').split(' ')[0];
    setTop('Dashboard', `<button class="btn small" id="t-new">${ic('plus')}<span>Nova marcação</span></button>`);
    $('#view').innerHTML = `
      <div class="hello"><div><h2>${greeting()}, ${esc(first)}!</h2><p>Aqui está o resumo do teu negócio · <span class="muted">${longDay(d.today)}</span></p></div></div>
      ${!d.open_days && !d.weekly_hours ? `<div class="notice slim">${ic('calendar')}<span>Ainda não abriste horários para marcação. <a href="#calendario/disponibilidade">Abrir horários</a></span></div>` : ''}
      <div id="rem-dash"></div>
      ${d.birthdays && d.birthdays.length ? `<div class="notice slim bday-note">${ic('gift')}<span>Hoje faz anos: <b>${d.birthdays.map(b => esc(b.name)).join(', ')}</b>. <a href="#clientes/aniversarios">Enviar mensagem</a></span></div>` : ''}
      <div class="kpis five">
        <a class="kpi" href="#calendario"><span class="k-l">${ic('calendar')}Marcações de hoje</span><b>${c.today}</b><small>${c.today === 1 ? 'cliente agendada' : 'clientes agendadas'}</small></a>
        <a class="kpi ${c.pending ? 'attn' : ''}" href="#marcacoes/pedidos"><span class="k-l">${ic('bell')}Pendentes</span><b>${c.pending}</b><small>${c.pending ? 'aguardam aprovação' : 'nenhum por responder'}</small></a>
        <a class="kpi" href="#financeiro"><span class="k-l">${ic('euro')}Faturação do mês</span><b>${euro(c.month_received_cents)}</b><small>pagamentos registados</small></a>
        <a class="kpi" href="#clientes"><span class="k-l">${ic('users')}Clientes deste mês</span><b>${c.month_clients}</b><small>atendidas (distintas)</small></a>
        ${nx ? `<button class="kpi next" data-booking="${nx.id}"><span class="k-l">${ic('sparkle')}Próxima marcação</span><b class="b-sm">${esc(nx.customer_name)}</b><small>${esc(nx.service_name)} · ${isoDay(nx.start_at) === d.today ? 'hoje' : shortDay(isoDay(nx.start_at))} às ${hhmm(nx.start_at)}${nx.status === 'pending' ? ' · pendente' : ''}</small></button>`
          : `<div class="kpi"><span class="k-l">${ic('sparkle')}Próxima marcação</span><b class="b-sm">—</b><small>sem marcações futuras</small></div>`}
      </div>
      <div class="quick">${[['q-new', 'plus', 'Nova marcação'], ['q-client', 'users', 'Adicionar cliente'], ['q-block', 'lock', 'Bloquear horário'], ['q-cal', 'calendar', 'Ver calendário']].map(([id, i, l]) => `<button class="quick-btn" id="${id}">${ic(i)}<span>${l}</span></button>`).join('')}</div>
      <div class="cols-2 dash-cols">
        <section class="panel"><h2>Faturação <span class="seg sm">${[['7d', '7 dias'], ['30d', '30 dias'], ['12m', '12 meses']].map(([k, l]) => `<button data-range="${k}" aria-pressed="${dash.range === k}">${l}</button>`).join('')}</span></h2>
          <p class="small muted" style="margin-top:-6px" id="rev-sum"></p><div id="rev-chart" class="chart"><div class="spinner"></div></div></section>
        <section class="panel"><h2>Marcações de hoje <small>${d.bookings.length}</small></h2>
          ${d.bookings.length ? `<div class="today-list">${d.bookings.map(b => `<div class="tl-row s-${b.status}" data-booking="${b.id}" tabindex="0" role="button">
              <span class="tl-t">${hhmm(b.start_at)}</span><span class="tl-who"><b>${esc(b.customer_name)}</b><small>${esc(b.service_name)}</small></span>${chip(b.status)}<span class="tl-go" aria-hidden="true">${ic('right')}</span></div>`).join('')}</div>`
            : empty('Sem marcações hoje.', ' <a href="#calendario">Abrir calendário</a>')}
        </section>
      </div>`;
    const re = () => views.dashboard();
    bindBookings($('#view'), re);
    remCard($('#rem-dash'));
    $('#q-new').onclick = () => newBooking({}, re);
    $('#q-client').onclick = () => customerForm({});
    $('#q-block').onclick = () => blockDialog({ date: today() }, re);
    $('#q-cal').onclick = () => { location.hash = 'calendario'; };
    const drawRev = async () => {
      const box = $('#rev-chart'); if (!box) return;
      const r = await api('/revenue?range=' + dash.range);
      if (!box.isConnected) return;
      const L = seriesLabels(r.series, r.unit), total = r.series.reduce((a, p) => a + p.cents, 0);
      $('#rev-sum').textContent = `Total recebido: ${euro(total)} · ${r.series.reduce((a, p) => a + p.payments, 0)} pagamento(s)`;
      barChart(box, { ...L, series: [{ name: 'Recebido', color: C_REV, values: r.series.map(p => p.cents) }] });
    };
    $$('[data-range]').forEach(b => b.onclick = () => { dash.range = b.dataset.range; $$('[data-range]').forEach(x => x.setAttribute('aria-pressed', x === b)); drawRev().catch(e => toast(e.message, 'err')); });
    drawRev().catch(() => {});
  };
  // junta horários abertos (livres/bloqueados) e marcações numa lista por hora
  function mergeBoard(board, bookings) {
    const rows = [], seen = new Set();
    for (const b of bookings.filter(b => b.status !== 'cancelled')) { rows.push({ t: b.start_at, kind: 'b', b }); seen.add(b.staff_id + ':' + b.start_at); }
    for (const s of board) if (!seen.has(s.staff_id + ':' + s.start) && s.state !== 'ocupado') rows.push({ t: s.start, kind: s.state, s });
    return rows.sort((a, b) => a.t - b.t || (a.kind === 'b' ? -1 : 1));
  }
  const rowOfTimeline = r => r.kind === 'b' ? apptRow(r.b)
    : r.kind === 'livre' ? `<div class="appt free"><div class="t">${r.s.time}</div><div class="who"><span>Livre${multiStaff() ? ' · ' + esc(r.s.staff_name) : ''}</span></div>
        <div class="side"><button class="btn tiny secondary" data-newat="${r.s.start}" data-staff="${r.s.staff_id}">${ic('plus')}Marcar</button><button class="link-btn" data-blockat="${r.s.start}">Bloquear</button></div></div>`
    : r.kind === 'bloqueado' ? `<div class="appt blocked"><div class="t">${r.s.time}</div><div class="who"><span>${BLOCK_TYPES[r.s.block?.type] || 'Bloqueado'}${r.s.block?.reason ? ' · ' + esc(r.s.block.reason) : ''}</span></div><div class="side"><span class="st st-off">Bloqueado</span></div></div>`
    : r.kind === 'reservado' ? `<div class="appt blocked"><div class="t">${r.s.time}</div><div class="who"><span>Oferecido à lista de espera</span></div><div class="side"><span class="st st-warn">Reservado</span></div></div>`
    : `<div class="appt past"><div class="t">${r.s.time}</div><div class="who"><span>Livre (já passou)</span></div><div class="side"></div></div>`;
  function bindTimeline(root, refresh) {
    $$('[data-newat]', root).forEach(b => b.onclick = () => newBooking({ start: +b.dataset.newat, staff_id: +b.dataset.staff }, refresh));
    $$('[data-blockat]', root).forEach(b => b.onclick = () => blockDialog({ date: isoDay(+b.dataset.blockat), time: hhmm(+b.dataset.blockat) }, refresh));
  }
  const pendingCard = b => `<div class="pend" data-booking="${b.id}" tabindex="0" role="button">
      <div class="pend-top"><div><b>${esc(b.customer_name)}</b>${b.created_at > Date.now() - 86400000 && b.source !== 'admin' ? ' <span class="mini new">Novo</span>' : ''}<span>${esc(b.service_name)}</span></div>${chip('pending')}</div>
      <div class="pend-when">${ic('calendar')}${shortDay(isoDay(b.start_at))} · <b>${hhmm(b.start_at)}</b>${b.proposed ? ' <span class="mini warn">Sugerido por ti — aguarda a cliente</span>' : ''}</div>
      <div class="pend-meta">${esc(b.customer_phone)}${b.hold_expires_at ? ` · reservado até ${dt(b.hold_expires_at)}` : ''}</div>
      ${b.deposit_cents != null || b.payment_method ? `<div class="pend-pay"><span class="pay-pref">Pagamento: <b>${PAY_PREF[b.payment_method] || 'sem indicação'}</b></span>${b.payment_method === 'mao' ? '<span class="mini">Sem sinal</span>' : depTag(b)}${depositDue(b) ? `<button class="link-btn" data-dep="${b.id}">Registar sinal</button>` : ''}</div>` : ''}
      <div class="row-actions"><button class="btn tiny" data-approve="${b.id}" ${depositDue(b) ? 'data-nodep="1"' : ''}>${ic('check')}Aprovar</button><button class="btn tiny secondary" data-suggest="${b.id}">Sugerir outro horário</button><button class="btn tiny ghost-err" data-reject="${b.id}">Recusar</button></div></div>`;

  // ---------- MARCAÇÕES (lista, pedidos, lista de espera) ----------
  const mk = { period: 'proximas', from: null, to: null, q: '', service: '', status: '' };
  const MK_TABS = [['lista', 'Todas as marcações'], ['pedidos', 'Pedidos pendentes'], ['espera', 'Lista de espera']];
  const MK_PERIODS = [['proximas', 'Próximas'], ['hoje', 'Hoje'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['passadas', 'Histórico (90 dias)'], ['intervalo', 'Intervalo']];
  const topBookingActions = () => `<button class="btn small secondary" id="t-block">${ic('lock')}<span>Bloquear horário</span></button><button class="btn small" id="t-new">${ic('plus')}<span>Nova marcação</span></button>`;
  views.marcacoes = async arg => {
    await load();
    const tab = MK_TABS.some(t => t[0] === arg) ? arg : 'lista';
    setTop('Marcações', topBookingActions());
    const my = seq;
    const cnt = await api('/inbox/count').catch(() => null);
    if (stale(my)) return;
    $('#view').innerHTML = `<div class="tabs" role="tablist">${MK_TABS.map(([k, l]) => `<a role="tab" href="#marcacoes${k === 'lista' ? '' : '/' + k}" aria-selected="${tab === k}">${l}${k === 'pedidos' && cnt?.pending ? `<span class="badge">${cnt.pending}</span>` : ''}</a>`).join('')}</div><div id="mk-body"></div>`;
    const body = $('#mk-body'); loading(body);
    if (tab === 'pedidos') return AG.pedidos(body);
    if (tab === 'espera') return AG.espera(body);
    return bookingList(body);
  };
  function mkRange() {
    const t = today(), mon = addDays(t, 1 - wdMon(t));
    switch (mk.period) {
      case 'hoje': return [t, t, 'asc'];
      case 'semana': return [mon, addDays(mon, 6), 'asc'];
      case 'mes': return [t.slice(0, 8) + '01', addDays(addDays(t.slice(0, 8) + '28', 5).slice(0, 8) + '01', -1), 'asc'];
      case 'passadas': return [addDays(t, -90), addDays(t, -1), 'desc'];
      case 'intervalo': return [mk.from || t, mk.to || addDays(t, 30), 'asc'];
      default: return [t, addDays(t, 60), 'asc'];
    }
  }
  async function bookingList(body) {
    body.innerHTML = `<div class="toolbar wrap">
        <select class="input" id="mk-p" aria-label="Período">${MK_PERIODS.map(([k, l]) => `<option value="${k}" ${mk.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${mk.period === 'intervalo' ? `<label class="small">De <input class="input" type="date" id="mk-f" value="${mk.from || today()}"></label><label class="small">Até <input class="input" type="date" id="mk-t" value="${mk.to || addDays(today(), 30)}"></label>` : ''}
        <div class="search-box grow">${ic('search')}<input class="input" id="mk-q" placeholder="Cliente, telefone, email ou referência" value="${esc(mk.q)}" aria-label="Pesquisar cliente"></div>
        <select class="input" id="mk-s" aria-label="Serviço">${svcOptions(mk.service, { all: true, placeholder: 'Todos os serviços' })}</select>
        <select class="input" id="mk-st" aria-label="Estado"><option value="">Todos os estados</option>${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${mk.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn small secondary" id="mk-csv">${ic('ext')}<span>Exportar CSV</span></button>
      </div><div id="mk-list"></div>`;
    const re = () => bookingList(body);
    $('#mk-p', body).onchange = e => { mk.period = e.target.value; re(); };
    $('#mk-f', body)?.addEventListener('change', e => { mk.from = e.target.value; draw(); });
    $('#mk-t', body)?.addEventListener('change', e => { mk.to = e.target.value; draw(); });
    let h; $('#mk-q', body).oninput = e => { clearTimeout(h); h = setTimeout(() => { mk.q = e.target.value.trim(); draw(); }, 260); };
    $('#mk-s', body).onchange = e => { mk.service = e.target.value; draw(); };
    $('#mk-st', body).onchange = e => { mk.status = e.target.value; draw(); };
    let last = [];
    $('#mk-csv', body).onclick = () => downloadCsv(`marcacoes-${today()}.csv`, ['Data', 'Hora', 'Cliente', 'Telefone', 'Email', 'Serviço', 'Estado', 'Preço acordado (€)', 'Pago (€)', 'Origem', 'Referência'],
      last.map(b => [dmyMs(b.start_at), hhmm(b.start_at), b.customer_name, b.customer_phone, b.customer_email || '', b.service_name, STATUS[b.status]?.[0] || b.status, toEur(b.price_cents), toEur(b.paid_cents), b.source === 'admin' ? 'Painel' : 'Site', b.ref]));
    const box = $('#mk-list', body);
    let token = 0;
    async function draw() {
      const my = ++token; loading(box);
      const [from, to, order] = mkRange();
      const list = await api(`/bookings?from=${from}&to=${to}&order=${order}${mk.q ? '&q=' + encodeURIComponent(mk.q) : ''}${mk.service ? '&service_id=' + mk.service : ''}${mk.status ? '&status=' + mk.status : ''}`);
      if (my !== token || !box.isConnected) return;
      last = list;
      const counts = Object.fromEntries(Object.keys(STATUS).map(k => [k, list.filter(b => b.status === k).length]));
      box.innerHTML = `<p class="small muted">${dmy(from)} a ${dmy(to)} · ${list.length} marcação(ões)${list.length ? ' — ' + Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${STATUS[k][0].toLowerCase()}: ${n}`).join(', ') : ''}</p>
        ${list.length ? groupByDay(list, order) : empty('Nenhuma marcação com estes filtros.')}`;
      bindBookings(box, draw);
    }
    await draw();
  }
  function groupByDay(list, order = 'asc') {
    const g = {}; for (const b of list) (g[isoDay(b.start_at)] ||= []).push(b);
    return Object.entries(g).map(([d, items]) => `<h3 class="sec-h">${longDay(d)}${d === today() ? ' · hoje' : ''}</h3><div class="appt-list">${items.sort((a, b) => order === 'desc' ? b.start_at - a.start_at : a.start_at - b.start_at).map(b => apptRow(b)).join('')}</div>`).join('');
  }
  // CSV (abre no Excel/Numbers; separador ";" e BOM para os acentos ficarem certos)
  function downloadCsv(name, headers, rows) {
    if (!rows.length) return toast('Não há registos para exportar com estes filtros.', 'err');
    const cell = v => { const s2 = String(v ?? ''); return /[";\n]/.test(s2) ? `"${s2.replace(/"/g, '""')}"` : s2; };
    const csv = '﻿' + [headers, ...rows].map(r => r.map(cell).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(`Ficheiro ${name} descarregado`);
  }

  // ---------- CALENDÁRIO (dia, semana, mês — arrastar para reagendar) ----------
  const ag = { mode: null, date: null, service: '', status: '' };
  const CAL_TABS = [['', 'Calendário'], ['disponibilidade', 'Horários para marcação'], ['bloqueios', 'Bloqueios, folgas e férias']];
  views.calendario = async arg => {
    await load();
    ag.date ||= today(); ag.mode ||= matchMedia('(max-width: 700px)').matches ? 'dia' : 'semana';
    const tab = CAL_TABS.some(t => t[0] === arg) ? arg : '';
    setTop('Calendário', topBookingActions());
    $('#view').innerHTML = `<div class="tabs" role="tablist">${CAL_TABS.map(([k, l]) => `<a role="tab" href="#calendario${k ? '/' + k : ''}" aria-selected="${tab === k}">${l}</a>`).join('')}</div><div id="ag-body"></div>`;
    const body = $('#ag-body'); loading(body);
    if (tab === 'disponibilidade') return AG.disponibilidade(body);
    if (tab === 'bloqueios') return AG.bloqueios(body);
    return AG.calendario(body);
  };
  views.agenda = arg => { location.replace('#' + ({ pedidos: 'marcacoes/pedidos', espera: 'marcacoes/espera', disponibilidade: 'calendario/disponibilidade', bloqueios: 'calendario/bloqueios' }[arg] || 'calendario')); };
  views.geral = () => { location.replace('#dashboard'); };
  const AG = {};
  AG.calendario = async body => {
    body.innerHTML = `<div class="cal-layout"><div class="cal-main"><div class="toolbar">
      <div class="seg">${[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, l]) => `<button data-mode="${k}" aria-pressed="${ag.mode === k}">${l}</button>`).join('')}</div>
      <div class="day-nav"><button class="icon-btn" data-nav="-1" aria-label="Anterior">${ic('left')}</button><input class="input" type="date" id="ag-date" value="${ag.date}" aria-label="Data"><button class="icon-btn" data-nav="1" aria-label="Seguinte">${ic('right')}</button><button class="btn tiny secondary" data-nav="0">Hoje</button></div>
      <select class="input" id="ag-svc" aria-label="Filtrar por serviço">${svcOptions(ag.service, { all: true, placeholder: 'Todos os serviços' })}</select>
      <select class="input" id="ag-st" aria-label="Filtrar por estado"><option value="">Todos os estados</option>${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${ag.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div><div id="ag-cal"></div></div><aside class="cal-aside" id="ag-pend"></aside></div>`;
    const box = $('#ag-cal', body);
    const re = () => AG.calendario(body);
    $$('[data-mode]', body).forEach(b => b.onclick = () => { ag.mode = b.dataset.mode; re(); });
    $$('[data-nav]', body).forEach(b => b.onclick = () => {
      const n = +b.dataset.nav; if (!n) ag.date = today();
      else if (ag.mode === 'dia') ag.date = addDays(ag.date, n); else if (ag.mode === 'semana') ag.date = addDays(ag.date, 7 * n);
      else { const d = new Date(ag.date.slice(0, 8) + '15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); ag.date = d.toISOString().slice(0, 8) + '01'; }
      re();
    });
    $('#ag-date', body).onchange = e => { if (e.target.value) { ag.date = e.target.value; re(); } };
    $('#ag-svc', body).onchange = e => { ag.service = e.target.value; draw(); };
    $('#ag-st', body).onchange = e => { ag.status = e.target.value; draw(); };
    const filt = () => `${ag.service ? '&service_id=' + ag.service : ''}${ag.status ? '&status=' + ag.status : ''}`;
    const keep = b => (ag.status ? b.status === ag.status : b.status !== 'cancelled') && (!ag.service || b.service_id === +ag.service);
    // pedidos pendentes sempre à mão
    const drawPend = async () => {
      const el = $('#ag-pend', body); if (!el) return;
      const list = await api('/bookings?status=pending');
      if (!el.isConnected) return;
      el.innerHTML = `<details class="panel pend-aside" ${list.length && !matchMedia('(max-width: 900px)').matches ? 'open' : ''}><summary><b>Pedidos pendentes</b> <span class="badge ${list.length ? '' : 'zero'}">${list.length}</span></summary>
        ${list.length ? list.map(b => `<div class="pa-row" data-booking="${b.id}" tabindex="0" role="button"><b>${esc(b.customer_name)}</b><span>${esc(b.service_name)}</span><span class="small">${shortDay(isoDay(b.start_at))} · ${hhmm(b.start_at)}</span>
          <span class="row-actions"><button class="btn tiny" data-approve="${b.id}">${ic('check')}Aprovar</button><button class="btn tiny secondary" data-suggest="${b.id}">Outro horário</button><button class="btn tiny ghost-err" data-reject="${b.id}">Recusar</button></span></div>`).join('') : '<p class="small muted" style="margin:8px 0 0">Nenhum pedido por responder.</p>'}</details>`;
      bindBookings(el, () => { drawPend(); draw(); });
    };
    let token = 0;
    async function draw() {
      if (!box.isConnected) return;
      const my = ++token; loading(box);
      if (ag.mode === 'dia') {
        const d = await api('/agenda/day?date=' + ag.date);
        if (my !== token || !box.isConnected) return;
        const list = d.bookings.filter(keep);
        const rows = ag.service || ag.status ? list.map(b => ({ t: b.start_at, kind: 'b', b })) : mergeBoard(d.board, list);
        const cancelled = !ag.status && d.bookings.filter(b => b.status === 'cancelled' && (!ag.service || b.service_id === +ag.service));
        box.innerHTML = `<h3 class="sec-h">${longDay(ag.date)}${ag.date === today() ? ' · hoje' : ''}</h3>${rows.length ? rows.map(rowOfTimeline).join('') : empty('Sem marcações nem horários abertos neste dia.', ' <a href="#calendario/disponibilidade">Abrir horários</a>')}
          ${cancelled && cancelled.length ? `<details class="history"><summary>Canceladas neste dia (${cancelled.length})</summary>${cancelled.map(b => apptRow(b, { actions: false })).join('')}</details>` : ''}`;
        bindBookings(box, refresh); bindTimeline(box, refresh);
      } else if (ag.mode === 'semana') {
        const mon = addDays(ag.date, 1 - wdMon(ag.date)), days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
        const [list, ...boards] = await Promise.all([api(`/bookings?from=${mon}&to=${days[6]}${filt()}`), ...days.map(dd => api('/agenda/day?date=' + dd).then(r => r.board).catch(() => []))]);
        if (my !== token || !box.isConnected) return;
        const items = list.filter(keep), mins = ms => { const t = hhmm(ms); return +t.slice(0, 2) * 60 + +t.slice(3); };
        const hours = new Set(); items.forEach(b => hours.add(Math.floor(mins(b.start_at) / 60))); boards.flat().forEach(s2 => hours.add(Math.floor(mins(s2.start) / 60)));
        let h0 = Math.min(9, ...hours), h1 = Math.max(19, ...hours); if (!isFinite(h0)) { h0 = 9; h1 = 19; }
        const H = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i), pad = n => String(n).padStart(2, '0');
        box.innerHTML = `<h3 class="sec-h">Semana de ${dmy(mon)} a ${dmy(days[6])}</h3><p class="small muted dnd-hint">Arrasta uma marcação para outro dia ou hora para a reagendar. Toca numa marcação para ver os detalhes.</p>
          <div class="wk-scroll"><div class="wk" style="--rows:${H.length}">
            <div class="wk-corner"></div>${days.map(dd => `<button class="wk-dh ${dd === today() ? 'today' : ''}" data-day="${dd}">${WDS[wdMon(dd)]} <b>${dd.slice(8)}</b></button>`).join('')}
            ${H.map(hh => `<div class="wk-h">${pad(hh)}:00</div>${days.map((dd, di) => {
              const evs = items.filter(b => isoDay(b.start_at) === dd && Math.floor(mins(b.start_at) / 60) === hh).sort((a, b) => a.start_at - b.start_at);
              const slots = boards[di].filter(s2 => Math.floor(mins(s2.start) / 60) === hh && !evs.some(b => b.start_at === s2.start));
              const past = at(dd, pad(hh) + ':59') < Date.now();
              return `<div class="wk-c ${past ? 'past' : ''} ${dd === today() ? 'today' : ''}" data-drop="${dd}" data-h="${hh}">
                ${slots.map(s2 => s2.state === 'livre' ? `<button class="wk-free" data-newat="${s2.start}" data-staff="${s2.staff_id}" title="Livre — marcar">${s2.time}</button>` : s2.state === 'bloqueado' ? `<span class="wk-blk" title="${esc(BLOCK_TYPES[s2.block?.type] || 'Bloqueado')}">${s2.time} ${ic('lock')}</span>` : '').join('')}
                ${evs.map(b => `<button class="wk-ev s-${b.status}" data-booking="${b.id}" ${['pending', 'confirmed'].includes(b.status) && b.start_at > Date.now() ? `draggable="true" data-drag="${b.id}"` : ''}><b>${hhmm(b.start_at)}</b> ${esc(b.customer_name.split(' ')[0])}<small>${esc(b.service_name)}</small></button>`).join('')}</div>`;
            }).join('')}`).join('')}
          </div></div>`;
        bindBookings(box, refresh); bindTimeline(box, refresh);
        $$('.wk-dh', box).forEach(b => b.onclick = () => { ag.date = b.dataset.day; ag.mode = 'dia'; re(); });
        bindDnD(box, items, (b, cell) => ({ date: cell.dataset.drop, time: pad(+cell.dataset.h) + ':' + hhmm(b.start_at).slice(3) }));
      } else {
        const first = ag.date.slice(0, 8) + '01', last = addDays(addDays(first, 32).slice(0, 8) + '01', -1);
        const list = (await api(`/bookings?from=${first}&to=${last}${filt()}`)).filter(keep);
        if (my !== token || !box.isConnected) return;
        const pad0 = wdMon(first) - 1, n = +last.slice(8);
        box.innerHTML = `<h3 class="sec-h">${monthName(first)}</h3><p class="small muted dnd-hint">Arrasta uma marcação para outro dia (mantém a hora). Toca num dia para o ver em detalhe.</p><div class="month"><span class="dow">Seg</span><span class="dow">Ter</span><span class="dow">Qua</span><span class="dow">Qui</span><span class="dow">Sex</span><span class="dow">Sáb</span><span class="dow">Dom</span>
          ${'<span></span>'.repeat(pad0)}${Array.from({ length: n }, (_, i) => {
            const dd = first.slice(0, 8) + String(i + 1).padStart(2, '0');
            const items = list.filter(b => isoDay(b.start_at) === dd).sort((a, b) => a.start_at - b.start_at);
            const pend = items.filter(b => b.status === 'pending').length;
            return `<div class="mday ${dd === today() ? 'today' : ''} ${dd < today() ? 'past' : ''}" data-day="${dd}" data-drop="${dd}" role="button" tabindex="0" aria-label="${dmy(dd)}: ${items.length} marcações"><b>${i + 1}</b>
              ${items.slice(0, 3).map(b => `<span class="pill s-${b.status}" ${['pending', 'confirmed'].includes(b.status) && b.start_at > Date.now() ? `draggable="true" data-drag="${b.id}"` : ''}>${hhmm(b.start_at)} ${esc(b.customer_name.split(' ')[0])}</span>`).join('')}${items.length > 3 ? `<span class="pill more">+${items.length - 3}</span>` : ''}
              ${items.length ? `<span class="n">${items.length}${pend ? ' · ' + pend + 'P' : ''}</span>` : ''}</div>`;
          }).join('')}</div><p class="small muted" style="margin-top:10px">P = pedidos pendentes.</p>`;
        $$('[data-day]', box).forEach(b => { const go = () => { ag.date = b.dataset.day; ag.mode = 'dia'; re(); }; b.onclick = go; b.onkeydown = e => e.key === 'Enter' && go(); });
        bindDnD(box, list, (b, cell) => ({ date: cell.dataset.drop, time: hhmm(b.start_at) }));
      }
    }
    const refresh = () => { draw(); drawPend(); };
    drawPend().catch(() => {});
    await draw();
  };
  // arrastar e largar (computador); no telemóvel usa-se "Reagendar" no detalhe
  function bindDnD(root, list, target) {
    let dragId = null;
    $$('[data-drag]', root).forEach(el => {
      el.addEventListener('dragstart', e => { dragId = +el.dataset.drag; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragId)); el.classList.add('dragging'); root.classList.add('is-dragging'); });
      el.addEventListener('dragend', () => { el.classList.remove('dragging'); root.classList.remove('is-dragging'); $$('.drop-over', root).forEach(x => x.classList.remove('drop-over')); });
    });
    $$('[data-drop]', root).forEach(cell => {
      cell.addEventListener('dragover', e => { if (dragId == null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; cell.classList.add('drop-over'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('drop-over'));
      cell.addEventListener('drop', e => {
        e.preventDefault(); cell.classList.remove('drop-over');
        const b = list.find(x => x.id === dragId); dragId = null; if (!b) return;
        const t = target(b, cell); if (at(t.date, t.time) === b.start_at) return;
        moveDialog(b, t.date, t.time);
      });
    });
  }
  function moveDialog(b, date, time) {
    modal(`${head('Reagendar marcação', `${esc(b.customer_name)} · ${esc(b.service_name)}`)}
      <form id="mvf"><p class="small" style="margin-top:0">De <b>${longDay(isoDay(b.start_at))} às ${hhmm(b.start_at)}</b> para:</p>
        <div class="form-grid"><div class="field"><label for="mv-d">Dia</label><input class="input" type="date" id="mv-d" value="${date}" min="${today()}" required></div>
          <div class="field"><label for="mv-t">Hora</label><input class="input" type="time" id="mv-t" step="300" value="${time}" required></div></div>
        <p class="small muted">Depois de reagendar, envia a nova data à cliente pelo botão WhatsApp da marcação.</p>
        <p class="small muted">O sistema verifica se o novo horário está livre e não bloqueado. O horário atual fica livre assim que confirmares.</p>
        <div id="mv-msg"></div><div class="actions"><button class="btn" type="submit">${ic('check')}Reagendar</button><button class="btn secondary" type="button" data-close>Cancelar</button></div></form>`, body => {
      $('#mvf', body).onsubmit = run(async e => {
        e.preventDefault();
        try { await api(`/bookings/${b.id}/move`, { method: 'POST', body: { start: at($('#mv-d', body).value, $('#mv-t', body).value), notify: false } }); toast('Marcação reagendada'); dlg.close(); route(); }
        catch (err) { formMsg($('#mv-msg', body), esc(err.message)); }
      });
    });
  }
  AG.pedidos = async body => {
    const list = (await api('/bookings?status=pending')).sort((x, y) => y.created_at - x.created_at);
    if (!(typeof body !== 'undefined' ? body : $('#view')).isConnected) return;
    body.innerHTML = `<p class="small muted">Pedidos feitos pelo site (e marcações que criaste como pendentes). Ao aprovar, o horário é verificado de novo; depois envia a confirmação à cliente pelo botão WhatsApp da marcação. Em vez de recusar, podes sugerir outro horário.</p>
      ${list.length ? `<div class="pend-grid">${list.map(pendingCard).join('')}</div>` : empty('Não há pedidos por confirmar.')}`;
    bindBookings(body, () => AG.pedidos(body));
  };
  AG.espera = async body => {
    const list = await api('/waitlist');
    if (!(typeof body !== 'undefined' ? body : $('#view')).isConnected) return;
    const DAYS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'], PER = { manha: 'manhã', tarde: 'tarde', fim_tarde: 'fim de tarde' };
    const active = list.filter(w => w.status === 'active' || w.status === 'offered');
    body.innerHTML = `<div class="toolbar"><p class="small muted grow" style="margin:0">Quando surge uma vaga compatível, aparece aqui assinalada para contactares a cliente.</p><button class="btn small" id="wl-add">${ic('plus')}Adicionar à lista</button></div>
      ${active.length ? active.map(w => `<div class="wl ${w.matches.length ? 'match' : ''}">
        <div class="wl-main"><b>${esc(w.name)}</b> <span class="muted">· ${esc(w.phone)}${w.email ? ' · ' + esc(w.email) : ''}</span>
          <div>${esc(w.service_name)} · ${w.days.length ? w.days.map(d => DAYS[d]).join(', ') : 'qualquer dia'} · ${w.periods.length ? w.periods.map(p => PER[p]).join(', ') : 'qualquer hora'}${w.date_from || w.date_to ? ` · ${w.date_from ? 'de ' + dmy(w.date_from) : ''} ${w.date_to ? 'até ' + dmy(w.date_to) : ''}` : ''}</div>
          ${w.notes ? `<div class="small muted">${esc(w.notes)}</div>` : ''}
          ${w.matches.length ? `<div class="wl-match">${ic('bell')}<b>Vaga compatível:</b> ${w.matches.map(m => `<button class="link-btn" data-wlbook="${w.id}" data-start="${m.start}">${shortDay(m.date)} ${m.time}</button>`).join(' · ')}</div>` : '<div class="small muted">Ainda sem vaga compatível.</div>'}
          ${w.contacted_at ? `<div class="mini ok">Contactada em ${dt(w.contacted_at)}</div>` : ''}${w.status === 'offered' ? '<div class="mini warn">Vaga oferecida por email — aguarda resposta</div>' : ''}</div>
        <div class="row-actions"><a class="btn tiny secondary" href="${telHref(w.phone)}">${ic('phone')}Ligar</a><button class="btn tiny secondary" data-wlc="${w.id}">Contactada</button><button class="link-btn" data-wlx="${w.id}">Remover</button></div></div>`).join('')
        : empty('A lista de espera está vazia.')}`;
    const re = () => AG.espera(body);
    $$('[data-wlc]', body).forEach(b => b.onclick = run(async () => { await api(`/waitlist/${b.dataset.wlc}/contacted`, { method: 'POST', body: {} }); toast('Assinalada como contactada'); re(); }));
    $$('[data-wlx]', body).forEach(b => b.onclick = run(async e => { if (!armed(e.currentTarget, 'Confirmar remoção')) return; await api(`/waitlist/${b.dataset.wlx}`, { method: 'DELETE' }); toast('Removida da lista'); re(); }));
    $$('[data-wlbook]', body).forEach(b => b.onclick = () => {
      const w = list.find(x => x.id === +b.dataset.wlbook);
      newBooking({ start: +b.dataset.start, service_id: w.service_id, newCustomer: true, onCreated: r => api(`/waitlist/${w.id}/booked`, { method: 'POST', body: { booking_id: r.id } }) }, re);
      setTimeout(() => { const n = $('#n-name'), p = $('#n-phone'), em = $('#n-email'); if (n) { n.value = w.name; p.value = w.phone; em.value = w.email || ''; } }, 50);
    });
    $('#wl-add', body).onclick = () => modal(`${head('Adicionar à lista de espera')}<form id="wf" novalidate>
        <div class="form-grid"><div class="field"><label for="w-n">Nome</label><input class="input" id="w-n" required maxlength="80"></div><div class="field"><label for="w-p">Telefone</label><input class="input" id="w-p" type="tel" required maxlength="30"></div></div>
        <div class="field"><label for="w-e">Email <span class="muted small">(opcional)</span></label><input class="input" id="w-e" type="email" maxlength="120"></div>
        <div class="field"><label for="w-s">Serviço</label><select class="input" id="w-s">${svcOptions(null)}</select></div>
        <fieldset class="field"><legend class="label">Dias preferidos <span class="muted small">(opcional)</span></legend><div class="choice">${[1, 2, 3, 4, 5, 6, 7].map(d => `<label><input type="checkbox" name="d" value="${d}"><span>${WDS[d]}</span></label>`).join('')}</div></fieldset>
        <fieldset class="field"><legend class="label">Período <span class="muted small">(opcional)</span></legend><div class="choice">${Object.entries(PER).map(([k, l]) => `<label><input type="checkbox" name="p" value="${k}"><span>${l}</span></label>`).join('')}</div></fieldset>
        <div class="form-grid"><div class="field"><label for="w-f">A partir de</label><input class="input" type="date" id="w-f"></div><div class="field"><label for="w-t">Até</label><input class="input" type="date" id="w-t"></div></div>
        <div class="field"><label for="w-o">Notas</label><input class="input" id="w-o" maxlength="300"></div><div id="wf-msg"></div>
        <div class="actions"><button class="btn" type="submit">Adicionar</button><button class="btn secondary" type="button" data-close>Cancelar</button></div></form>`, b2 => {
      $('#wf', b2).onsubmit = run(async e => {
        e.preventDefault();
        try {
          await api('/waitlist', { method: 'POST', body: { name: $('#w-n', b2).value, phone: $('#w-p', b2).value, email: $('#w-e', b2).value, service_id: $('#w-s', b2).value,
            days: $$('input[name=d]:checked', b2).map(x => +x.value), periods: $$('input[name=p]:checked', b2).map(x => x.value), date_from: $('#w-f', b2).value, date_to: $('#w-t', b2).value, notes: $('#w-o', b2).value } });
          toast('Adicionada à lista de espera'); dlg.close(); re();
        } catch (err) { formMsg($('#wf-msg', b2), esc(err.message)); }
      });
    });
  };
  // horários abertos para marcação, dia a dia
  const av = { month: null, date: null };
  // horários para marcação: um cartão simples — escolher o dia e a hora e "Abrir horário"
  AG.disponibilidade = async body => {
    // a lista mostra sempre a semana a contar de hoje (7 dias); os dias que já passaram desaparecem sozinhos
    const to = addDays(today(), 120), weekEnd = addDays(today(), 6);
    const [list, bks] = await Promise.all([api(`/day-slots?from=${today()}&to=${to}`), api(`/bookings?from=${today()}&to=${to}`)]);
    if (!(typeof body !== 'undefined' ? body : $('#view')).isConnected) return;
    const booked = new Set(bks.filter(x => ['pending', 'confirmed'].includes(x.status)).map(x => isoDay(x.start_at) + ' ' + hhmm(x.start_at)));
    const byDate = Object.fromEntries(list.map(x => [x.date, x.times]));
    const days = Array.from({ length: 7 }, (_, i) => { const d = addDays(today(), i); return { date: d, times: byDate[d] || [] }; });
    const total = days.reduce((n, x) => n + x.times.length, 0);
    const later = list.filter(x => x.date > weekEnd).reduce((n, x) => n + x.times.length, 0);
    body.innerHTML = `<section class="panel av-card"><h2>Adicionar horário</h2>
        <p class="small muted" style="margin:0 0 14px">Escolhe o dia e a hora em que podes atender. Só os horários abertos aparecem no site, e cada horário recebe uma marcação.</p>
        <form id="av-add" class="av-form" novalidate>
          <div class="field"><label for="av-d">Dia</label><input class="input" type="date" id="av-d" min="${today()}" value="${av.date && av.date >= today() ? av.date : ''}" required></div>
          <div class="field"><label for="av-t">Hora</label><input class="input" type="time" id="av-t" step="300" value="${av.time || ''}" required></div>
          <button class="btn" type="submit">${ic('plus')}Abrir horário</button>
        </form><div id="av-msg" role="alert"></div></section>
      <section class="panel"><h2>Horários abertos esta semana <span class="muted small" style="font-family:var(--sans);font-weight:400">${dmy(today()).slice(0, 5)} a ${dmy(weekEnd).slice(0, 5)} · ${total} ${total === 1 ? 'horário' : 'horários'}</span></h2>
        ${total ? `<div class="av-list">${days.map(x => `<div class="av-dayrow${x.times.length ? '' : ' av-none'}"><b>${x.date === today() ? 'Hoje' : shortDay(x.date)}</b><div class="av-times">${x.times.length ? '' : '<span class="muted small">Sem horários</span>'}${x.times.map(t => booked.has(x.date + ' ' + t)
          ? `<span class="av-chip busy">${t}<small>marcada</small></span>`
          : `<span class="av-chip">${t}<button type="button" data-rm="${x.date}|${t}" aria-label="Fechar ${t} de ${dmy(x.date)}">×</button></span>`).join('')}</div></div>`).join('')}</div>
          <p class="small muted" style="margin:12px 0 0">Para fechar um horário, carrega no ×. Horários com marcação não podem ser fechados: reagenda ou cancela a marcação primeiro.</p>`
        : '<p class="muted small" style="margin:0">Ainda não há horários abertos para esta semana. Escolhe um dia e uma hora acima.</p>'}
        ${later ? `<p class="small muted" style="margin:10px 0 0">Tens ainda ${later} ${later === 1 ? 'horário aberto' : 'horários abertos'} depois de ${dmy(weekEnd)}. Aparecem aqui quando entrarem na semana.</p>` : ''}</section>`;
    const re = () => AG.disponibilidade(body);
    const timesOf = d => (list.find(x => x.date === d) || {}).times || [];
    $('#av-add', body).onsubmit = run(async e => {
      e.preventDefault();
      const d = $('#av-d', body).value, t = $('#av-t', body).value, msg = $('#av-msg', body);
      if (!d) return formMsg(msg, 'Escolhe o dia.');
      if (!t) return formMsg(msg, 'Escolhe a hora.');
      if (timesOf(d).includes(t)) return formMsg(msg, `O horário das ${t} de ${dmy(d)} já está aberto.`, 'warn');
      await api(`/day-slots/${d}`, { method: 'PUT', body: { times: [...timesOf(d), t] } });
      av.date = d; av.time = '';
      toast(`Horário aberto: ${dmy(d)} às ${t}`); re();
    });
    $$('[data-rm]', body).forEach(b => b.onclick = run(async () => {
      const [d, t] = b.dataset.rm.split('|');
      await api(`/day-slots/${d}`, { method: 'PUT', body: { times: timesOf(d).filter(x => x !== t) } });
      toast(`Horário fechado: ${dmy(d)} às ${t}`); re();
    }));
  };
  AG.bloqueios = async body => {
    const list = await api('/blocks');
    if (!(typeof body !== 'undefined' ? body : $('#view')).isConnected) return;
    body.innerHTML = `<div class="toolbar"><p class="small muted grow" style="margin:0">Pausas, folgas, férias, encerramentos e bloqueios pontuais. Um horário bloqueado não aparece no site.</p><button class="btn small" id="bk-new">${ic('lock')}Bloquear horário</button></div>
      ${list.length ? list.map(x => `<div class="appt blocked"><div class="t">${dmyMs(x.start_at)}<small>${hhmm(x.start_at)}</small></div>
        <div class="who"><strong>${BLOCK_TYPES[x.type] || esc(x.type)}${x.staff_name ? ' · ' + esc(x.staff_name) : ''}</strong><span>${x.end_at - x.start_at <= 60000 ? 'Só este horário' : 'até ' + dt(x.end_at - (hhmm(x.end_at) === '00:00' ? 60000 : 0))}${x.reason ? ' · ' + esc(x.reason) : ''}${x.public_note ? ' · no site: “' + esc(x.public_note) + '”' : ''}</span></div>
        <div class="side"><button class="btn tiny secondary" data-del="${x.id}">Remover</button></div></div>`).join('') : empty('Sem bloqueios.')}`;
    const re = () => AG.bloqueios(body);
    $('#bk-new', body).onclick = () => blockDialog({}, re);
    $$('[data-del]', body).forEach(b => b.onclick = run(async e => { if (!armed(e.currentTarget, 'Confirmar')) return; await api(`/blocks/${b.dataset.del}`, { method: 'DELETE' }); toast('Bloqueio removido — horário livre'); re(); }));
  };

  // ---------- CLIENTES ----------
  const cl = { q: '', filter: 'todas' };
  // fidelização pela frequência de visitas concluídas
  const loyalty = v => v >= 8 ? [5, 'Fiel'] : v >= 4 ? [4, 'Frequente'] : v >= 2 ? [3, 'Regular'] : v === 1 ? [2, 'Nova'] : [0, 'Sem visitas'];
  const loyBadge = (v, withLabel = true) => { const [n, l] = loyalty(v || 0); return `<span class="loy" title="Fidelização: ${l} · ${v || 0} visita(s)" aria-label="Fidelização: ${l}">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(5 - n)}${withLabel ? `<em>${l}</em>` : ''}</span>`; };
  const AWAY_DAYS = 90;
  const isAway = c => c.last_visit && c.last_visit < Date.now() - AWAY_DAYS * 86400000 && !c.next_visit;
  const CL_FILTERS = [['todas', 'Todas'], ['frequentes', 'Frequentes'], ['ausentes', `Sem voltar há ${AWAY_DAYS}+ dias`], ['novas', 'Novas'], ['marcadas', 'Com marcação']];
  const clFilter = { todas: () => true, frequentes: c => (c.visits || 0) >= 4, ausentes: isAway, novas: c => (c.visits || 0) <= 1, marcadas: c => !!c.next_visit };
  const CL_TABS = [['', 'Clientes'], ['aniversarios', 'Aniversários'], ['formulario', 'Formulário']];
  const clTabs = cur => `<div class="tabs" role="tablist">${CL_TABS.map(([k, l]) => `<a role="tab" href="#clientes${k ? '/' + k : ''}" aria-selected="${cur === k}">${l}</a>`).join('')}</div>`;
  views.clientes = async id => {
    if (id === 'aniversarios') return birthdaysView();
    if (id === 'formulario') return registerView();
    if (id) return customerCard(+id);
    setTop('Clientes', `<button class="btn small" id="t-newc">${ic('plus')}<span>Nova cliente</span></button>`);
    $('#view').innerHTML = `${clTabs('')}<div class="toolbar"><div class="search-box grow">${ic('search')}<input class="input" id="cq" placeholder="Pesquisar por nome, telefone ou email" value="${esc(cl.q)}" aria-label="Pesquisar clientes"></div></div>
      <div class="chips" role="radiogroup" aria-label="Filtrar clientes">${CL_FILTERS.map(([k, l]) => `<button class="chip-f" data-cf="${k}" aria-pressed="${cl.filter === k}">${l}</button>`).join('')}</div><div id="dup"></div><div id="cl-list"></div>`;
    $$('[data-cf]').forEach(b => b.onclick = () => { cl.filter = b.dataset.cf; $$('[data-cf]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
    $('#t-newc').onclick = () => customerForm({});
    const draw = async () => {
      loading($('#cl-list'));
      const [list, dups] = await Promise.all([api('/customers?q=' + encodeURIComponent(cl.q)), api('/customers/duplicates')]);
      if (!$('#cl-list') || location.hash.startsWith('#clientes/')) return; // a página mudou entretanto
      $('#dup').innerHTML = dups.length ? `<div class="notice warn slim">${ic('users')}<span><b>${dups.length} possível(eis) duplicado(s)</b> — fichas com o mesmo telefone ou email. <button class="link-btn" id="dup-see">Rever</button></span></div>` : '';
      $('#dup-see')?.addEventListener('click', () => dupDialog(dups));
      const shown = list.filter(clFilter[cl.filter] || clFilter.todas);
      $('#cl-list').innerHTML = `<p class="small muted">${shown.length} cliente(s)${cl.filter === 'ausentes' ? ` — vieram pelo menos uma vez e não voltam há mais de ${AWAY_DAYS} dias (sem marcação futura). Bom momento para um contacto.` : ''}</p>` + (shown.length ? `<div class="cards-list">${shown.map(c => `<a class="ccard" href="#clientes/${c.id}">
          <div class="ccard-top"><b>${esc(c.name)}</b>${c.possible_duplicate ? '<span class="mini warn">Possível duplicado</span>' : isAway(c) ? '<span class="mini warn">Não volta há algum tempo</span>' : ''}</div>
          <span class="muted">${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}</span>
          ${loyBadge(c.visits)}
          <span class="ccard-meta"><span>${c.visits || 0} visita(s)</span>${c.first_visit ? `<span>Cliente desde ${dmyMs(c.first_visit)}</span>` : ''}<span>Última: ${c.last_visit ? dmyMs(c.last_visit) : '—'}</span><span>Gasto: ${euro(c.paid_cents || 0)}</span>${c.next_visit ? `<span class="ok">Próxima: ${dmyMs(c.next_visit)}</span>` : ''}${c.no_shows ? `<span class="err">${c.no_shows} falta(s)</span>` : ''}${c.birthday ? `<span>${ic('gift')}${bdayTxt(c.birthday)}</span>` : ''}</span></a>`).join('')}</div>`
        : empty(cl.q || cl.filter !== 'todas' ? 'Nenhuma cliente com estes filtros.' : 'Ainda não há clientes.'));
    };
    let h; $('#cq').oninput = e => { clearTimeout(h); h = setTimeout(() => { cl.q = e.target.value.trim(); draw(); }, 250); };
    await draw();
  };
  function dupDialog(groups) {
    modal(`${head('Possíveis duplicados', 'Só são sugeridas fichas com o mesmo telefone ou o mesmo email. O nome sozinho nunca basta: pessoas diferentes podem ter o mesmo nome.')}
      ${groups.map(g => `<div class="dupg"><p class="small muted" style="margin:0 0 8px">${esc(g[0].reason)}</p>${g.map(c => `<div class="mini-row"><span><b>${esc(c.name)}</b> · ${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''} · criada ${dmyMs(c.created_at)}</span><a class="link-btn" href="#clientes/${c.id}" data-close>Ver ficha</a></div>`).join('')}</div>`).join('')}
      <p class="small muted">Para juntar fichas, abre a ficha que queres eliminar e escolhe “Juntar com…”. Confirma sempre que é a mesma pessoa.</p>`, null, { wide: true });
  }
  function customerForm(c, after) {
    modal(`${head(c.id ? 'Editar cliente' : 'Nova cliente')}<form id="cf" novalidate>
      <div class="field"><label for="c-n">Nome</label><input class="input" id="c-n" value="${esc(c.name || '')}" maxlength="80" required></div>
      <div class="form-grid"><div class="field"><label for="c-p">Telefone</label><input class="input" id="c-p" type="tel" value="${esc(c.phone || '')}" maxlength="30" required></div>
        <div class="field"><label for="c-e">Email <span class="muted small">(opcional)</span></label><input class="input" id="c-e" type="email" value="${esc(c.email || '')}" maxlength="120"></div></div>
      <fieldset class="field"><legend class="label">Aniversário <span class="muted small">(dia e mês, opcional)</span></legend><div class="bday-pick">${bdaySelects(c.birthday)}</div></fieldset>
      <label class="check"><input type="checkbox" id="c-bc" ${c.birthday_consent ? 'checked' : ''}><span>Aceitou receber mensagem de aniversário</span></label>
      <div class="field"><label for="c-o">Notas internas</label><textarea class="input" id="c-o" rows="3" maxlength="1000">${esc(c.notes || '')}</textarea></div>
      <label class="check"><input type="checkbox" id="c-m" ${c.marketing_consent ? 'checked' : ''}><span>Aceitou receber novidades por email</span></label>
      <div id="cf-msg"></div><div class="actions"><button class="btn" type="submit">Guardar</button><button class="btn secondary" type="button" data-close>Cancelar</button></div></form>`, body => {
      const send = async force => {
        const bd = $('#bd-m', body).value && $('#bd-d', body).value ? `${$('#bd-m', body).value}-${$('#bd-d', body).value}` : '';
        const b = { name: $('#c-n', body).value, phone: $('#c-p', body).value, email: $('#c-e', body).value, notes: $('#c-o', body).value, marketing_consent: $('#c-m', body).checked,
          birthday: bd, birthday_consent: $('#c-bc', body).checked, force_new: force };
        try {
          const r = await api(c.id ? `/customers/${c.id}` : '/customers', { method: c.id ? 'PUT' : 'POST', body: b });
          toast('Ficha guardada'); dlg.close(); if (after) after(); else location.hash = 'clientes/' + (c.id || r.id);
        } catch (e) {
          if (e.data?.code === 'POSSIBLE_DUPLICATE') {
            formMsg($('#cf-msg', body), `${esc(e.message)}<div class="dup-pick">${e.data.matches.map(m => `<a class="btn tiny" href="#clientes/${m.id}" data-close>Abrir: ${esc(m.name)}</a>`).join('')}<button type="button" class="btn tiny secondary" id="c-force">É outra pessoa — criar ficha</button></div>`, 'warn');
            $('#c-force', body).onclick = () => send(true); $$('[data-close]', body).forEach(x => x.onclick = () => dlg.close());
          } else formMsg($('#cf-msg', body), e.data?.errors ? Object.values(e.data.errors).map(esc).join('<br>') : esc(e.message));
        }
      };
      $('#cf', body).onsubmit = run(async e => { e.preventDefault(); await send(false); });
    });
  }
  async function customerCard(id) {
    await load();
    const my = seq;
    const c = await api('/customers/' + id);
    if (stale(my)) return;
    setTop('Clientes', `<button class="btn small" id="t-nb">${ic('plus')}<span>Nova marcação</span></button>`);
    const now = Date.now();
    const upcoming = c.bookings.filter(b => ['pending', 'confirmed'].includes(b.status) && b.start_at > now).sort((a, b) => a.start_at - b.start_at);
    const history = c.bookings.filter(b => !upcoming.includes(b));
    $('#view').innerHTML = `<a class="back-link" href="#clientes">${ic('left')}Clientes</a>
      <div class="profile"><div><h2>${esc(c.name)}</h2>
        <div class="contact-row"><a class="pill-link" href="${telHref(c.phone)}">${ic('phone')}${esc(c.phone)}</a><a class="pill-link" href="${waHref(c.phone)}" target="_blank" rel="noopener">${ic('chat')}WhatsApp</a>
          ${c.email ? `<a class="pill-link" href="mailto:${esc(c.email)}">${ic('mail')}${esc(c.email)}</a>` : '<span class="pill-link muted">Sem email</span>'}</div></div>
        <div class="row-actions"><button class="btn small secondary" id="c-edit">Editar</button><button class="btn small" id="c-nb">${ic('plus')}Nova marcação</button></div></div>
      ${c.duplicates.length ? `<div class="notice warn slim">${ic('users')}<span>Possível duplicado (mesmo telefone ou email): ${c.duplicates.map(d => `<a href="#clientes/${d.id}">${esc(d.name)}</a>`).join(', ')}. <button class="link-btn" id="c-merge">Juntar com…</button></span></div>` : ''}
      <div class="loy-line">${loyBadge(c.visits)}${c.visits >= 2 && c.first_visit && c.last_visit ? `<span class="small muted">Vem em média a cada ${Math.max(1, Math.round((c.last_visit - c.first_visit) / 86400000 / (c.visits - 1)))} dias</span>` : ''}${isAway(c) ? `<span class="mini warn">Não volta há ${Math.round((Date.now() - c.last_visit) / 86400000)} dias</span>` : ''}</div>
      <div class="kpis small">
        <div class="kpi"><span class="k-l">Visitas</span><b>${c.visits || 0}</b><small>concluídas</small></div>
        <div class="kpi"><span class="k-l">Primeira visita</span><b class="b-sm">${c.first_visit ? dmyMs(c.first_visit) : '—'}</b></div>
        <div class="kpi"><span class="k-l">Última visita</span><b class="b-sm">${c.last_visit ? dmyMs(c.last_visit) : '—'}</b></div>
        <div class="kpi"><span class="k-l">Próxima</span><b class="b-sm">${upcoming[0] ? dmyMs(upcoming[0].start_at) + ' ' + hhmm(upcoming[0].start_at) : '—'}</b></div>
        <div class="kpi ${c.cancellations || c.no_shows ? 'attn' : ''}"><span class="k-l">Cancelamentos / faltas</span><b class="b-sm">${c.cancellations || 0} / ${c.no_shows || 0}</b></div>
        <div class="kpi"><span class="k-l">Total gasto</span><b class="b-sm">${euro(c.paid_cents)}</b><small>pagamentos registados</small></div>
      </div>
      <div class="cols-2">
        <div><section class="panel"><h2>Próximas marcações</h2>${upcoming.length ? upcoming.map(b => `<div class="dayline">${shortDay(isoDay(b.start_at))}</div>${apptRow(b)}`).join('') : empty('Sem marcações futuras.')}</section>
          <section class="panel"><h2>Histórico <small>${history.length}</small></h2>${history.length ? history.map(b => `<div class="dayline">${shortDay(isoDay(b.start_at))}</div>${apptRow(b, { actions: false })}`).join('') : empty('Ainda sem histórico.')}</section></div>
        <div><section class="panel"><h2>Notas internas</h2><textarea class="input" id="c-notes" rows="5" maxlength="1000" placeholder="Preferências, observações… (não registes dados de saúde)">${esc(c.notes || '')}</textarea>
            <button class="btn tiny secondary" id="c-sn" style="margin-top:10px">Guardar notas</button></section>
          <section class="panel"><h2>Serviços realizados</h2>${c.services.length ? `<ul class="plain">${c.services.map(s => `<li><span>${esc(s.name)}</span><b>${s.n}×</b></li>`).join('')}</ul>` : empty('Ainda sem serviços concluídos.')}</section>
          <section class="panel"><h2>Ficha</h2><dl class="kv"><dt>Aniversário</dt><dd>${c.birthday ? `${bdayTxt(c.birthday)} ${c.birthday_consent ? '<span class="mini ok">Aceita mensagem</span>' : '<span class="mini off">Sem consentimento</span>'}` : '—'}</dd>
            <dt>Origem</dt><dd>${c.registered_at ? `Formulário de registo (${esc(String(c.source || '').replace(/^registo:/, '') || 'link')}) · ${dmyMs(c.registered_at)}` : 'Marcação'}</dd>
            <dt>Criada</dt><dd>${dmyMs(c.created_at)}</dd><dt>Novidades por email</dt><dd>${c.marketing_consent ? 'Sim' : 'Não'}</dd></dl>
            <button class="btn tiny ghost-err" id="c-anon" style="margin-top:12px">Apagar dados pessoais (RGPD)</button>
            <p class="small muted" style="margin:6px 0 0">Para pedidos de apagamento: remove nome, contactos, aniversário e notas. O histórico de marcações e pagamentos fica anónimo.</p></section></div>
      </div>`;
    const re = () => customerCard(id);
    const nb = () => newBooking({ customer: { id: c.id, name: c.name, phone: c.phone, email: c.email } }, re);
    $('#t-nb').onclick = nb; $('#c-nb').onclick = nb;
    $('#c-edit').onclick = () => customerForm(c, re);
    $('#c-sn').onclick = run(async () => { await api('/customers/' + id, { method: 'PUT', body: { name: c.name, phone: c.phone, email: c.email, notes: $('#c-notes').value, marketing_consent: !!c.marketing_consent } }); toast('Notas guardadas'); });
    $('#c-anon').onclick = run(async e => { if (!armed(e.currentTarget, 'Confirmar: apagar dados de ' + c.name.split(' ')[0])) return; await api(`/customers/${id}/anonymize`, { method: 'POST', body: {} }); toast('Dados pessoais apagados'); re(); });
    $('#c-merge')?.addEventListener('click', () => modal(`${head('Juntar fichas', 'As marcações desta ficha passam para a ficha escolhida e esta ficha é eliminada. Só o faças se tiveres a certeza de que é a mesma pessoa.')}
      ${c.duplicates.map(d => `<div class="mini-row"><span><b>${esc(d.name)}</b> · ${esc(d.phone)}${d.email ? ' · ' + esc(d.email) : ''} <span class="muted">(${esc(d.reason)})</span></span><button class="btn tiny" data-into="${d.id}">Juntar com esta</button></div>`).join('')}`, body => {
      $$('[data-into]', body).forEach(b => b.onclick = run(async e => { if (!armed(e.currentTarget, 'Confirmar: é a mesma pessoa')) return; await api(`/customers/${id}/merge`, { method: 'POST', body: { into_id: +b.dataset.into } }); toast('Fichas juntas'); dlg.close(); location.hash = 'clientes/' + b.dataset.into; }));
    }));
    bindBookings($('#view'), re);
  }

  // ---------- aniversários ----------
  const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const bdayTxt = b => b ? `${b.slice(3)}/${b.slice(0, 2)}` : '—';
  const bdaySelects = b => `<select class="input" id="bd-d" aria-label="Dia"><option value="">Dia</option>${Array.from({ length: 31 }, (_, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}" ${b && b.slice(3) === v ? 'selected' : ''}>${i + 1}</option>`; }).join('')}</select>
    <select class="input" id="bd-m" aria-label="Mês"><option value="">Mês</option>${MES.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}" ${b && b.slice(0, 2) === v ? 'selected' : ''}>${m}</option>`; }).join('')}</select>`;
  const waMsg = (phone, text) => waHref(phone) + '?text=' + encodeURIComponent(text);
  const when2 = c => c.days_until === 0 ? '<b class="ok">Faz anos hoje</b>' : c.days_until === 1 ? 'Amanhã' : `Daqui a ${c.days_until} dias`;
  const bdayRow = c => `<div class="bday-row ${c.greeted ? 'done' : ''}">
      <div class="bday-date"><b>${c.next_date.slice(8)}</b><span>${MES[+c.next_date.slice(5, 7) - 1].slice(0, 3)}</span></div>
      <div class="bday-main"><a href="#clientes/${c.id}"><b>${esc(c.name)}</b></a><span class="small">${when2(c)}${c.greeted ? ' · <span class="ok">Felicitada ✓</span>' : ''}</span>
        ${c.birthday_consent ? '' : '<span class="mini off">Sem consentimento para mensagem</span>'}</div>
      <div class="row-actions">${c.birthday_consent ? `<a class="btn tiny" href="${waMsg(c.phone, c.message)}" target="_blank" rel="noopener" data-greet="${c.id}">${ic('chat')}WhatsApp</a>
        ${c.email ? `<a class="btn tiny secondary" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Muitos parabéns!')}&body=${encodeURIComponent(c.message)}" data-greet="${c.id}">${ic('mail')}Email</a>` : ''}` : ''}
        <button class="link-btn small" data-greeted="${c.id}" data-undo="${c.greeted ? 1 : ''}">${c.greeted ? 'Desfazer' : 'Já felicitei'}</button></div></div>`;
  function bindBdays(root, refresh) {
    $$('[data-greeted]', root).forEach(b => b.onclick = run(async () => { await api(`/customers/${b.dataset.greeted}/greeted`, { method: 'POST', body: { undo: !!b.dataset.undo } }); toast(b.dataset.undo ? 'Marcação desfeita' : 'Assinalada como felicitada'); refresh(); }));
    // ao abrir o WhatsApp/email com a mensagem, assinala como felicitada (pode desfazer-se)
    $$('[data-greet]', root).forEach(a => a.addEventListener('click', () => { api(`/customers/${a.dataset.greet}/greeted`, { method: 'POST', body: {} }).then(() => setTimeout(refresh, 400)).catch(() => {}); }));
  }
  async function birthdaysView() {
    setTop('Clientes', '');
    const my = seq;
    const d = await api('/birthdays?days=31');
    if (stale(my)) return;
    const today = d.list.filter(c => c.days_until === 0), week = d.list.filter(c => c.days_until > 0 && c.days_until <= 7), month = d.list.filter(c => c.days_until > 7);
    const sec = (t, l, e) => `<section class="panel"><h2>${t} <small>${l.length}</small></h2>${l.length ? l.map(bdayRow).join('') : empty(e)}</section>`;
    $('#view').innerHTML = `${clTabs('aniversarios')}
      <p class="small muted">A mensagem abre o WhatsApp já escrita com o nome da cliente — só tens de carregar em enviar. Só aparece para quem deu consentimento.</p>
      ${sec('Hoje', today, 'Ninguém faz anos hoje.')}${sec('Próximos 7 dias', week, 'Sem aniversários nos próximos 7 dias.')}${sec('Até ao fim do próximo mês', month, 'Sem mais aniversários nos próximos 31 dias.')}`;
    bindBdays($('#view'), birthdaysView);
  }

  // ---------- formulário de registo (link para as redes sociais) ----------
  const ORIGINS = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['whatsapp', 'WhatsApp'], ['tiktok', 'TikTok'], ['balcao', 'QR no espaço'], ['link', 'Outro']];
  const reg = { origin: 'instagram' };
  async function registerView() {
    setTop('Clientes', '');
    const my = seq;
    const [{ settings: s }, st, integ] = await Promise.all([api('/settings'), api('/register/stats'), api('/integrations')]);
    if (stale(my)) return;
    const base = (/^https?:\/\//.test(s.public_base_url || '') && !/\[|localhost/.test(s.public_base_url) ? s.public_base_url.replace(/\/$/, '') : location.origin) + '/registo.html';
    const link = () => base + (reg.origin && reg.origin !== 'link' ? '?origem=' + reg.origin : '');
    const ON = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', tiktok: 'TikTok', balcao: 'QR no espaço', link: 'Link direto' };
    $('#view').innerHTML = `${clTabs('formulario')}
      <div class="cols-2">
        <div>
          <section class="panel"><h2><span>${ic('link')}Link do formulário</span>
              <label class="switch"><input type="checkbox" id="rg-on" ${s.register_enabled ? 'checked' : ''}><span></span><em>${s.register_enabled ? 'Ativo' : 'Desligado'}</em></label></h2>
            <p class="small muted">Escolhe onde vais publicar: cada rede social tem o seu link, para saberes de onde vêm os registos. As clientes registadas aparecem logo em Clientes, com o aniversário.</p>
            <div class="choice" role="radiogroup" aria-label="Onde vais publicar">${ORIGINS.map(([k, l]) => `<label><input type="radio" name="rg-o" value="${k}" ${reg.origin === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
            <div class="link-box"><input class="input" id="rg-link" readonly value="${esc(link())}" aria-label="Link do formulário"><button class="btn small" id="rg-copy">${ic('copy')}<span>Copiar</span></button></div>
            <div class="row-actions"><a class="btn tiny secondary" id="rg-open" href="${esc(link())}" target="_blank" rel="noopener">${ic('ext')}Abrir formulário</a>
              ${navigator.share ? '<button class="btn tiny secondary" id="rg-share">Partilhar…</button>' : ''}</div>
            <div class="qr-box"><div id="rg-qr" aria-label="Código QR do link"></div><div><b>Código QR</b><p class="small muted">Para imprimir e pôr no espaço, ou para uma story. Lê-se com a câmara do telemóvel.</p>
              <a class="btn tiny secondary" id="rg-qr-dl" download="registo-qr.png" href="#">Descarregar imagem</a></div></div>
          </section>
          <section class="panel"><h2>Registos <small>${st.total} no total · ${st.last30} nos últimos 30 dias</small></h2>
            ${Object.keys(st.by_origin).length ? `<div class="origin-list">${Object.entries(st.by_origin).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="mini">${esc(ON[k] || k)}: <b>${n}</b></span>`).join('')}</div>` : ''}
            ${st.recent.length ? st.recent.map(c => `<a class="mini-row click" href="#clientes/${c.id}"><span><b>${esc(c.name)}</b> · ${esc(c.phone)}<br><span class="small muted">${esc(c.email)} · aniversário ${bdayTxt(c.birthday)}${c.birthday_consent ? '' : ' · sem consentimento'}</span></span><span class="small muted">${dmyMs(c.registered_at)}</span></a>`).join('') : empty('Ainda ninguém se registou pelo formulário.')}
          </section>
        </div>
        <form class="panel" id="rg-f"><h2>Textos do formulário</h2>
          <div class="field"><label for="rg-t">Título do formulário</label><input class="input" id="rg-t" value="${esc(s.register_title)}" maxlength="80"></div>
          <div class="field"><label for="rg-i">Texto de apresentação</label><textarea class="input" id="rg-i" rows="3" maxlength="400">${esc(s.register_intro)}</textarea></div>
          <p class="small muted">A mensagem de aniversário edita-se em <a href="#definicoes/lembretes">Definições → Mensagens WhatsApp</a>.</p>
<button class="btn">Guardar</button></form>
      </div>`;
    const drawQR = () => {
      const box = $('#rg-qr'); if (!box || typeof qrcode !== 'function') return;
      const q = qrcode(0, 'M'); q.addData(link()); q.make();
      box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      const n = q.getModuleCount(), cs = 8, m = 4, c = document.createElement('canvas'); c.width = c.height = (n + m * 2) * cs;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#3a2a20';
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + m) * cs, (r + m) * cs, cs, cs);
      $('#rg-qr-dl').href = c.toDataURL('image/png');
    };
    const sync = () => { $('#rg-link').value = link(); $('#rg-open').href = link(); drawQR(); };
    $$('input[name=rg-o]').forEach(r => r.onchange = () => { reg.origin = r.value; sync(); });
    drawQR();
    $('#rg-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(link()); } catch { const i = $('#rg-link'); i.select(); document.execCommand('copy'); }
      toast('Link copiado — cola-o na publicação ou na bio');
    };
    $('#rg-share')?.addEventListener('click', () => navigator.share({ title: s.register_title, text: s.register_intro, url: link() }).catch(() => {}));
    $('#rg-on').onchange = run(async e => { await api('/settings', { method: 'PUT', body: { register_enabled: e.target.checked } }); toast(e.target.checked ? 'Formulário ativo' : 'Formulário desligado — o link mostra uma mensagem de indisponível'); registerView(); });
    $('#rg-f').onsubmit = run(async e => { e.preventDefault(); await api('/settings', { method: 'PUT', body: { register_title: $('#rg-t').value, register_intro: $('#rg-i').value } }); toast('Guardado'); });
  }

  // ---------- SERVIÇOS ----------
  views.servicos = async () => {
    const my = seq;
    await load(true);
    if (stale(my)) return;
    const { categories, services } = cache.services;
    setTop('Serviços', `<button class="btn small secondary" id="t-cat">${ic('plus')}<span>Categoria</span></button><button class="btn small" id="t-svc">${ic('plus')}<span>Novo serviço</span></button>`);
    const groups = categories.map(c => [c, services.filter(s => s.category_id === c.id)]).concat([[{ id: 0, name: 'Sem categoria' }, services.filter(s => !s.category_id)]]).filter(g => g[0].id || g[1].length);
    $('#view').innerHTML = `<p class="small muted">As alterações aparecem logo no site. As marcações já feitas mantêm o serviço e o preço acordados.</p>
      ${groups.map(([c, list]) => `<section class="panel"><h2>${esc(c.name)} <span class="row-actions"><small>${list.filter(s => s.active).length} ativo(s)</small>${c.id ? `<button class="btn tiny secondary" data-cat="${c.id}">Editar categoria</button>` : ''}</span></h2>
        ${list.length ? list.map(s => `<div class="svc-row ${s.active ? '' : 'off'}">
          <div class="svc-main">${s.image_url ? `<img class="svc-thumb" src="${esc((window.DEMO_IMG && window.DEMO_IMG[s.image_url]) || s.image_url)}" alt="">` : ''}<b>${esc(s.name)}</b>${s.group_name ? ` <span class="mini">${esc(s.group_name)}</span>` : ''}${s.bookable === 0 ? ' <span class="mini">Extra</span>' : ''}${s.requires_approval ? ' <span class="mini warn">Confirmação manual</span>' : ''}
            ${s.description ? `<span class="muted small">${esc(s.description)}</span>` : ''}</div>
          <div class="svc-price">${price(s.price_cents, s.price_type)}</div>
          <label class="switch" title="${s.active ? 'Ativo' : 'Inativo'}"><input type="checkbox" data-active="${s.id}" ${s.active ? 'checked' : ''}><span></span><em>${s.active ? 'Ativo' : 'Inativo'}</em></label>
          <button class="btn tiny secondary" data-svc="${s.id}">Editar</button></div>`).join('') : empty('Sem serviços nesta categoria.')}</section>`).join('')}`;
    $('#t-svc').onclick = () => editService({ active: 1, bookable: 1, price_type: 'fixed', requires_approval: 1 });
    $('#t-cat').onclick = () => editCategory({});
    $$('[data-svc]').forEach(b => b.onclick = () => editService(services.find(s => s.id === +b.dataset.svc)));
    $$('[data-cat]').forEach(b => b.onclick = () => editCategory(categories.find(c => c.id === +b.dataset.cat)));
    $$('[data-active]').forEach(i => i.onchange = run(async () => { await api(`/services/${i.dataset.active}/active`, { method: 'POST', body: { active: i.checked } }); toast(i.checked ? 'Serviço ativado — visível no site' : 'Serviço desativado — deixa de aparecer no site'); views.servicos(); }));
  };
  function editCategory(c) {
    modal(`${head(c.id ? 'Editar categoria' : 'Nova categoria')}<form id="kf"><div class="field"><label for="k-n">Nome</label><input class="input" id="k-n" value="${esc(c.name || '')}" required maxlength="80"></div>
      <div class="field"><label for="k-d">Descrição curta</label><input class="input" id="k-d" value="${esc(c.description || '')}" maxlength="300"></div>
      <div class="field"><label for="k-o">Nota no fim da lista de preços <span class="muted small">(ex.: *Tabela em vigor em 2026.)</span></label><input class="input" id="k-o" value="${esc(c.note || '')}" maxlength="300"></div>
      <div class="field"><label for="k-s">Ordem</label><input class="input" type="number" id="k-s" value="${c.sort || 0}"></div>
      <div id="kf-msg"></div><div class="actions"><button class="btn" type="submit">Guardar</button>${c.id ? '<button type="button" class="btn ghost-err" id="k-del">Apagar categoria</button>' : ''}</div></form>`, body => {
      $('#kf', body).onsubmit = run(async e => { e.preventDefault(); await api(c.id ? `/categories/${c.id}` : '/categories', { method: c.id ? 'PUT' : 'POST', body: { name: $('#k-n', body).value, description: $('#k-d', body).value, note: $('#k-o', body).value, sort: +$('#k-s', body).value, image_url: c.image_url || '' } }); dlg.close(); toast('Categoria guardada'); views.servicos(); });
      $('#k-del', body)?.addEventListener('click', run(async e => { if (!armed(e.currentTarget, 'Confirmar (os serviços ficam sem categoria)')) return; await api(`/categories/${c.id}`, { method: 'DELETE' }); dlg.close(); toast('Categoria apagada'); views.servicos(); }));
    });
  }
  function editService(s) {
    const { categories } = cache.services;
    modal(`${head(s.id ? 'Editar serviço' : 'Novo serviço')}<form id="sf" novalidate>
      <div class="field"><label for="v-n">Nome</label><input class="input" id="v-n" value="${esc(s.name || '')}" required maxlength="120"></div>
      <div class="form-grid"><div class="field"><label for="v-c">Categoria</label><select class="input" id="v-c"><option value="">Sem categoria</option>${categories.map(c => `<option value="${c.id}" ${s.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="v-g">Subgrupo <span class="muted small">(opcional — ex.: Gel, Packs)</span></label><input class="input" id="v-g" value="${esc(s.group_name || '')}" maxlength="80"></div></div>
      <div class="field"><label for="v-d">Descrição breve</label><textarea class="input" id="v-d" rows="2" maxlength="1000">${esc(s.description || '')}</textarea></div>
      <div class="form-grid"><div class="field"><label for="v-p">Preço (€)</label><input class="input" id="v-p" inputmode="decimal" placeholder="vazio = por definir" value="${toEur(s.price_cents)}"></div>
        <div class="field"><label for="v-t">Tipo de preço</label><select class="input" id="v-t"><option value="fixed">Fixo</option><option value="from">“Desde” (mínimo)</option><option value="variable">Variável</option><option value="addon">Extra (+)</option></select></div></div>
      ${imgField('image_url', 'Fotografia (opcional — aparece no site)', s.image_url)}
      <div class="field" id="v-noteF"><label for="v-pn">De que depende o preço?</label><input class="input" id="v-pn" value="${esc(s.price_note || '')}" maxlength="300" placeholder="Ex.: depende da zona"></div>
      <label class="check"><input type="checkbox" id="v-a" ${s.active !== 0 ? 'checked' : ''}><span><b>Ativo</b> — visível no site e disponível para marcar</span></label>
      <label class="check"><input type="checkbox" id="v-r" ${s.requires_approval ? 'checked' : ''}><span>Pedidos online ficam pendentes até eu confirmar</span></label>
      <label class="check"><input type="checkbox" id="v-b" ${s.bookable !== 0 ? 'checked' : ''}><span>Pode ser marcado sozinho (desliga para extras acrescentados no atendimento)</span></label>
      ${s.id && s.bookings ? `<p class="small muted">Este serviço tem ${s.bookings} marcação(ões). Mudar o nome ou o preço não altera as marcações já feitas.</p>` : ''}
      <div id="sf-msg"></div><div class="actions"><button class="btn" type="submit">Guardar</button>${s.id ? `<button type="button" class="btn ghost-err" id="v-del">${s.bookings ? 'Desativar' : 'Apagar'}</button>` : ''}</div></form>`, body => {
      const t = $('#v-t', body); t.value = s.price_type || 'fixed'; bindImgFields(body);
      const sync = () => $('#v-noteF', body).hidden = !['from', 'variable'].includes(t.value); t.onchange = sync; sync();
      $('#sf', body).onsubmit = run(async e => {
        e.preventDefault();
        const b = { ...s, name: $('#v-n', body).value, category_id: $('#v-c', body).value, group_name: $('#v-g', body).value, description: $('#v-d', body).value,
          price_eur: $('#v-p', body).value.trim(), price_type: t.value, price_note: $('#v-pn', body).value, active: $('#v-a', body).checked,
          requires_approval: $('#v-r', body).checked, bookable: $('#v-b', body).checked, featured: !!s.featured, image_url: $('#i-image_url', body).value };
        try { await api(s.id ? `/services/${s.id}` : '/services', { method: s.id ? 'PUT' : 'POST', body: b }); dlg.close(); toast('Serviço guardado — já atualizado no site'); views.servicos(); }
        catch (err) { formMsg($('#sf-msg', body), esc(err.message)); }
      });
      $('#v-del', body)?.addEventListener('click', run(async e => { if (!armed(e.currentTarget, 'Confirmar')) return; const r = await api(`/services/${s.id}`, { method: 'DELETE' }); dlg.close(); toast(r.archived ? 'Serviço desativado (tem marcações no histórico)' : 'Serviço apagado'); views.servicos(); }));
    });
  }

  // ---------- FINANCEIRO ----------
  const fin = { mode: 'mes', day: null, month: null, from: null, to: null, sumMonth: null, range: '12m' };
  const EXP_CATS = { produtos: 'Produtos e material', renda: 'Renda', equipamento: 'Equipamento', formacao: 'Formação', marketing: 'Publicidade e redes', servicos: 'Água, luz e internet', impostos: 'Impostos e taxas', outro: 'Outro' };
  views.financeiro = async () => {
    fin.day ||= today(); fin.month ||= today().slice(0, 7); fin.sumMonth ||= today().slice(0, 7);
    fin.from ||= today().slice(0, 8) + '01'; fin.to ||= today();
    const range = fin.mode === 'dia' ? [fin.day, fin.day] : fin.mode === 'mes' ? [fin.month + '-01', addDays(addDays(fin.month + '-28', 5).slice(0, 8) + '01', -1)] : [fin.from, fin.to];
    setTop('Financeiro', `<button class="btn small secondary" id="t-exp">${ic('plus')}<span>Registar despesa</span></button>`);
    const my = seq;
    const ovw = await api('/finance/overview');
    if (stale(my)) return;
    const res = c => `<b class="${c < 0 ? 'neg' : ''}">${euro(c)}</b>`;
    $('#view').innerHTML = `
      <p class="small muted">A faturação é sempre a soma dos <b>pagamentos registados</b>: uma marcação concluída só conta depois de registares o pagamento. O resultado é estimado: receitas menos as despesas que registaste.</p>
      <div class="kpis six">
        <div class="kpi"><span class="k-l">Hoje</span><b>${euro(ovw.day_cents)}</b></div>
        <div class="kpi"><span class="k-l">Esta semana</span><b>${euro(ovw.week_cents)}</b></div>
        <div class="kpi"><span class="k-l">Este mês</span><b>${euro(ovw.month_cents)}</b><small>${ovw.paid_bookings_month} atendimento(s) pago(s)</small></div>
        <div class="kpi"><span class="k-l">Este ano</span><b>${euro(ovw.year_cents)}</b></div>
        <div class="kpi"><span class="k-l">Média por atendimento</span><b>${euro(ovw.avg_ticket_cents)}</b><small>este mês</small></div>
        <div class="kpi"><span class="k-l">Resultado do mês</span>${res(ovw.month_result_cents)}<small>despesas ${euro(ovw.month_expenses_cents)} · ano ${euro(ovw.year_result_cents)}</small></div>
      </div>
      <div class="cols-2">
        <section class="panel"><h2>Evolução da faturação <span class="seg sm">${[['7d', '7 dias'], ['30d', '30 dias'], ['12m', '12 meses']].map(([k, l]) => `<button data-frange="${k}" aria-pressed="${fin.range === k}">${l}</button>`).join('')}</span></h2><div id="f-evo" class="chart"></div></section>
        <section class="panel"><h2>Comparação entre meses <small>receitas e despesas</small></h2><div id="f-months" class="chart"></div></section>
      </div>
      <div class="toolbar period-bar"><span class="small muted">Detalhe do período:</span><div class="seg">${[['dia', 'Dia'], ['mes', 'Mês'], ['intervalo', 'Intervalo']].map(([k, l]) => `<button data-fm="${k}" aria-pressed="${fin.mode === k}">${l}</button>`).join('')}</div>
        ${fin.mode === 'dia' ? `<input class="input" type="date" id="f-day" value="${fin.day}" aria-label="Dia">` : fin.mode === 'mes' ? `<input class="input" type="month" id="f-month" value="${fin.month}" aria-label="Mês">`
          : `<label class="small">De <input class="input" type="date" id="f-from" value="${fin.from}"></label><label class="small">Até <input class="input" type="date" id="f-to" value="${fin.to}"></label>`}</div>
      <div id="fin-body"></div>
      <section class="panel" id="fin-month"></section>`;
    // gráficos
    const L12 = seriesLabels(ovw.months, 'month');
    barChart($('#f-months'), { ...L12, series: [{ name: 'Receitas', color: C_REV, values: ovw.months.map(p => p.cents) }, { name: 'Despesas', color: C_EXP, values: ovw.months.map(p => p.expenses_cents) }] });
    const drawEvo = async () => { const r = await api('/revenue?range=' + fin.range); const el = $('#f-evo'); if (!el) return; barChart(el, { ...seriesLabels(r.series, r.unit), series: [{ name: 'Recebido', color: C_REV, values: r.series.map(p => p.cents) }] }); };
    $$('[data-frange]').forEach(b => b.onclick = () => { fin.range = b.dataset.frange; $$('[data-frange]').forEach(x => x.setAttribute('aria-pressed', x === b)); drawEvo(); });
    drawEvo().catch(() => {});
    $('#t-exp').onclick = () => expenseDialog({}, views.financeiro);
    $$('[data-fm]').forEach(b => b.onclick = () => { fin.mode = b.dataset.fm; views.financeiro(); });
    $('#f-day')?.addEventListener('change', e => { fin.day = e.target.value || today(); views.financeiro(); });
    $('#f-month')?.addEventListener('change', e => { fin.month = e.target.value || today().slice(0, 7); views.financeiro(); });
    $('#f-from')?.addEventListener('change', e => { fin.from = e.target.value; views.financeiro(); });
    $('#f-to')?.addEventListener('change', e => { fin.to = e.target.value; views.financeiro(); });
    const box = $('#fin-body'); loading(box);
    let d, ex; try { [d, ex] = await Promise.all([api(`/finance?from=${range[0]}&to=${range[1]}`), api(`/expenses?from=${range[0]}&to=${range[1]}`)]); } catch (e) { if (!stale(my)) box.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; return; }
    if (stale(my) || !box.isConnected) return;
    const per = range[0] === range[1] ? longDay(range[0]) : `${dmy(range[0])} a ${dmy(range[1])}`;
    box.innerHTML = `<h3 class="sec-h">${per}</h3>
      <div class="kpis">
        <div class="kpi"><span class="k-l">Recebido</span><b>${euro(d.received_cents)}</b><small>${d.payments_count} pagamento(s)</small></div>
        <div class="kpi"><span class="k-l">Despesas</span><b>${euro(ex.total_cents)}</b><small>${ex.list.length} registo(s)</small></div>
        <div class="kpi"><span class="k-l">Resultado estimado</span>${res(d.received_cents - ex.total_cents)}<small>recebido − despesas</small></div>
        <div class="kpi ${d.outstanding.length ? 'attn' : ''}"><span class="k-l">Por receber</span><b>${euro(d.outstanding_cents)}</b><small>${d.outstanding.length} serviço(s) por pagar${d.unpriced ? ` · ${d.unpriced} sem preço` : ''}</small></div>
      </div>
      <div class="cols-2">
        <section class="panel"><h2>Serviços com maior faturação</h2>${d.by_service.length ? hbars(d.by_service.slice(0, 8).map(x => ({ name: x.name, v: x.cents, n: x.count })), euro, x => `<small>${x.n}×</small>`) : empty('Sem pagamentos registados neste período.')}</section>
        <section class="panel"><h2>Receitas por categoria</h2>${d.by_category.length ? hbars(d.by_category.map(x => ({ name: x.name, v: x.cents })), euro, x => `<small>${d.received_cents ? Math.round(x.v / d.received_cents * 100) : 0}%</small>`) : empty('Sem pagamentos registados neste período.')}
          ${Object.keys(d.by_method).length ? `<h3 class="sec-h">Por método</h3><div class="methods">${Object.entries(d.by_method).map(([k, v]) => `<span>${METHODS[k] || k}: <b>${euro(v)}</b></span>`).join('')}</div>` : ''}</section>
      </div>
      <section class="panel"><h2><span>Pagamentos pendentes <small>serviços concluídos ainda por pagar</small></span></h2>${d.outstanding.length ? d.outstanding.map(b => `<div class="mini-row click" data-booking="${b.id}" tabindex="0" role="button">
          <span><b>${esc(b.customer_name)}</b> · ${esc(b.service_name)}<br><span class="muted small">${dmyMs(b.start_at)} ${hhmm(b.start_at)} · acordado ${price(b.price_cents, b.price_type)} · pago ${euro(b.paid_cents)}</span></span>
          <span class="row-actions"><b>${b.due_cents == null ? 'Sem preço' : euro(b.due_cents)}</b><button class="btn tiny" data-pay="${b.id}">Registar</button></span></div>`).join('') : empty('Nada por receber neste período.')}</section>
      <section class="panel"><h2><span>Histórico de pagamentos <small>${d.payments.length}</small></span> <button class="btn tiny secondary" id="csv-pay">${ic('ext')}Exportar CSV</button></h2>${d.payments.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Método</th><th>Estado</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${d.payments.map(p => `<tr class="${p.status === 'anulado' ? 'void' : ''}"><td>${dmyMs(p.paid_at)}</td><td>${esc(p.customer_name)}</td><td>${esc(p.service_name)}<br><span class="muted small">marcação ${dmyMs(p.start_at)}</span></td><td>${METHODS[p.method] || esc(p.method)}</td>
          <td>${p.status === 'pago' ? '<span class="st st-ok">Pago</span>' : `<span class="st st-off">Anulado</span>${p.void_reason ? `<br><span class="small muted">${esc(p.void_reason)}</span>` : ''}`}</td><td class="num"><b>${euro(p.amount_cents)}</b></td>
          <td>${p.status === 'pago' ? `<button class="link-btn" data-void="${p.id}">Anular</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Sem pagamentos registados neste período.')}</section>
      <section class="panel"><h2><span>Despesas <small>${euro(ex.total_cents)}</small></span> <span class="row-actions"><button class="btn tiny secondary" id="csv-exp">${ic('ext')}Exportar CSV</button><button class="btn tiny" id="exp-new">${ic('plus')}Registar despesa</button></span></h2>
        ${ex.list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead><tbody>
          ${ex.list.map(e => `<tr><td>${dmy(e.spent_on)}</td><td>${esc(EXP_CATS[e.category] || e.category)}</td><td>${esc(e.description) || '<span class="muted">—</span>'}</td><td class="num"><b>${euro(e.amount_cents)}</b></td><td><button class="link-btn" data-exp="${e.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : empty('Sem despesas registadas neste período.')}</section>`;
    bindBookings(box, views.financeiro);
    $$('[data-void]', box).forEach(b => b.onclick = () => voidDialog(+b.dataset.void, null, views.financeiro));
    $('#exp-new', box).onclick = () => expenseDialog({}, views.financeiro);
    $$('[data-exp]', box).forEach(b => b.onclick = () => expenseDialog(ex.list.find(e => e.id === +b.dataset.exp), views.financeiro));
    $('#csv-pay', box).onclick = () => downloadCsv(`pagamentos-${range[0]}-a-${range[1]}.csv`, ['Data', 'Cliente', 'Serviço', 'Data da marcação', 'Método', 'Estado', 'Valor (€)', 'Nota', 'Motivo da anulação'],
      d.payments.map(p => [dmyMs(p.paid_at), p.customer_name, p.service_name, dmyMs(p.start_at), METHODS[p.method] || p.method, p.status === 'pago' ? 'Pago' : 'Anulado', toEur(p.amount_cents), p.note || '', p.void_reason || '']));
    $('#csv-exp', box).onclick = () => downloadCsv(`despesas-${range[0]}-a-${range[1]}.csv`, ['Data', 'Categoria', 'Descrição', 'Valor (€)'], ex.list.map(e => [dmy(e.spent_on), EXP_CATS[e.category] || e.category, e.description || '', toEur(e.amount_cents)]));
    // resumo mensal
    const mbox = $('#fin-month');
    const drawMonth = async () => {
      mbox.innerHTML = '<div class="spinner"></div>';
      const m = await api('/finance/month?month=' + fin.sumMonth);
      if (!mbox.isConnected) return;
      mbox.innerHTML = `<h2>Resumo mensal <input class="input inline" type="month" id="fm-m" value="${m.month}" aria-label="Mês do resumo"></h2>
        <div class="kpis small"><div class="kpi"><span class="k-l">Concluídas</span><b>${m.completed}</b></div><div class="kpi"><span class="k-l">Cancelamentos</span><b>${m.cancelled}</b></div>
          <div class="kpi"><span class="k-l">Faltas</span><b>${m.no_show}</b></div><div class="kpi"><span class="k-l">Recebido</span><b class="b-sm">${euro(m.received_cents)}</b></div></div>
        <h3 class="sec-h">Serviços mais procurados</h3>${m.top_services.length ? hbars(m.top_services.map(x => ({ name: x.name, v: x.n })), v => `${v}×`) : empty('Sem marcações neste mês.')}`;
      $('#fm-m').onchange = e => { fin.sumMonth = e.target.value || today().slice(0, 7); drawMonth(); };
    };
    drawMonth();
  };
  function expenseDialog(e, refresh) {
    modal(`${head(e.id ? 'Editar despesa' : 'Registar despesa', 'Despesas do negócio: produtos, renda, equipamento, publicidade… Entram no resultado estimado.')}
      <form id="xf" novalidate><div class="form-grid">
        <div class="field"><label for="x-d">Data</label><input class="input" type="date" id="x-d" value="${e.spent_on || today()}" required></div>
        <div class="field"><label for="x-v">Valor (€)</label><input class="input" id="x-v" inputmode="decimal" value="${e.amount_cents ? toEur(e.amount_cents) : ''}" placeholder="0,00" required></div></div>
        <div class="field"><label for="x-c">Categoria</label><select class="input" id="x-c">${Object.entries(EXP_CATS).map(([k, l]) => `<option value="${k}" ${e.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="x-t">Descrição <span class="muted small">(opcional)</span></label><input class="input" id="x-t" value="${esc(e.description || '')}" maxlength="300" placeholder="Ex.: encomenda de vernizes"></div>
        <div id="xf-msg"></div>
        <div class="actions"><button class="btn" type="submit">${ic('check')}Guardar</button>${e.id ? '<button type="button" class="btn ghost-err" id="x-del">Apagar</button>' : '<button class="btn secondary" type="button" data-close>Cancelar</button>'}</div></form>`, body => {
      $('#xf', body).onsubmit = run(async ev => {
        ev.preventDefault();
        const b = { spent_on: $('#x-d', body).value, amount_eur: $('#x-v', body).value, category: $('#x-c', body).value, description: $('#x-t', body).value };
        try { await api(e.id ? `/expenses/${e.id}` : '/expenses', { method: e.id ? 'PUT' : 'POST', body: b }); dlg.close(); toast('Despesa guardada'); refresh(); }
        catch (err) { formMsg($('#xf-msg', body), esc(err.message)); }
      });
      $('#x-del', body)?.addEventListener('click', run(async ev => { if (!armed(ev.currentTarget, 'Confirmar: apagar')) return; await api(`/expenses/${e.id}`, { method: 'DELETE' }); dlg.close(); toast('Despesa apagada'); refresh(); }));
    });
  }

  // ---------- fotografias (Definições → Textos e fotografias) ----------
  async function shrink(file, max = 1600) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    let data = c.toDataURL('image/webp', 0.82);
    if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', 0.84);
    return data;
  }
  async function uploadFile(file) {
    if (!/^image\//.test(file.type)) throw new Error('Escolhe um ficheiro de imagem (JPG, PNG ou WebP).');
    return (await api('/uploads', { method: 'POST', body: { data: await shrink(file) } })).url;
  }
  function imgField(name, label, value) {
    return `<div class="field img-field" data-img="${name}"><label for="i-${name}">${label}</label>
      <div class="img-row"><span class="thumb">${value ? `<img src="${esc((window.DEMO_IMG && window.DEMO_IMG[value]) || value)}" alt="">` : ''}</span>
        <input class="input" id="i-${name}" name="${name}" value="${esc(value || '')}" placeholder="Carrega uma fotografia ou cola um URL">
        <label class="btn tiny secondary upl">Carregar<input type="file" accept="image/*" hidden></label></div></div>`;
  }
  function bindImgFields(root) {
    $$('.img-field', root).forEach(f => {
      const inp = $('input.input', f), th = $('.thumb', f), file = $('input[type=file]', f);
      inp.oninput = () => th.innerHTML = inp.value ? `<img src="${esc(inp.value)}" alt="">` : '';
      file.onchange = run(async () => { if (!file.files[0]) return; toast('A otimizar e enviar…'); inp.value = await uploadFile(file.files[0]); inp.oninput(); toast('Fotografia carregada — não te esqueças de guardar'); });
    });
    $$('[data-gallery-add]', root).forEach(inpt => inpt.onchange = run(async () => {
      const ta = $('#s-gallery', root); const urls = [];
      for (const f of inpt.files) urls.push(await uploadFile(f));
      ta.value = [...ta.value.split('\n').map(x => x.trim()).filter(Boolean), ...urls].slice(0, 6).join('\n');
      toast(`${urls.length} fotografia(s) carregada(s) — não te esqueças de guardar`);
    }));
    $$('[data-video-add]', root).forEach(inpt => inpt.onchange = run(async () => {
      const f = inpt.files[0]; if (!f) return;
      if (f.size > 60 * 1024 * 1024) throw new Error('O vídeo tem mais de 60 MB — exporta-o mais curto ou com menos qualidade.');
      toast('A enviar o vídeo…');
      const res = await fetch('/api/admin/uploads/video', { method: 'POST', headers: { 'Content-Type': f.type || 'video/mp4', 'X-Requested-With': 'fetch' }, body: f, credentials: 'same-origin' });
      const r = await res.json().catch(() => ({})); if (!res.ok) throw new Error(r.error || 'Não foi possível enviar o vídeo.');
      $('#i-video_file', root).value = r.url; toast('Vídeo carregado — não te esqueças de guardar');
    }));
  }
  const DAYNAMES = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  function hoursEditor(rows) {
    return `<div class="hours-editor">${[1, 2, 3, 4, 5, 6, 7].map(d => `<div class="row" data-wd="${d}"><strong>${DAYNAMES[d]}</strong><div class="ints">
      ${rows.filter(h => h.weekday === d).map(h => `<span class="int"><input class="input" type="time" value="${h.start}" aria-label="Das"> – <input class="input" type="time" value="${h.end}" aria-label="Às"><button type="button" class="x" aria-label="Remover">×</button></span>`).join('')}
      <button type="button" class="btn tiny secondary" data-add>+ Intervalo</button></div></div>`).join('')}</div>`;
  }
  function bindHours(root) {
    const add = btn => { const s = document.createElement('span'); s.className = 'int'; s.innerHTML = '<input class="input" type="time" value="10:00" aria-label="Das"> – <input class="input" type="time" value="19:00" aria-label="Às"><button type="button" class="x" aria-label="Remover">×</button>'; btn.before(s); s.querySelector('.x').onclick = () => s.remove(); };
    $$('[data-add]', root).forEach(b => b.onclick = () => add(b));
    $$('.int .x', root).forEach(x => x.onclick = () => x.parentElement.remove());
  }
  const readHours = root => $$('[data-wd]', root).flatMap(r => $$('.int', r).map(i => { const [a, b] = $$('input', i); return { weekday: +r.dataset.wd, start: a.value, end: b.value }; }));

  // ---------- DEFINIÇÕES ----------
  const DEF_TABS = [['espaco', 'Negócio e contactos'], ['horario', 'Horário de funcionamento'], ['regras', 'Regras e políticas'], ['pagamentos', 'Pagamentos e sinal'], ['lembretes', 'Mensagens WhatsApp'],
    ['conteudo', 'Textos e fotografias do site'], ['equipa', 'Profissionais'], ['dados', 'Dados das clientes (RGPD)'], ['conta', 'Conta e acesso']];
  views.definicoes = async tab => {
    if (tab === 'disponibilidade' || tab === 'bloqueios') return location.replace('#calendario/' + tab);
    if (tab === 'avaliacoes') return location.replace('#avaliacoes');
    tab = DEF_TABS.some(t => t[0] === tab) ? tab : 'espaco';
    setTop('Definições', '');
    const my = seq;
    const { settings: s, status, zones } = await api('/settings');
    if (stale(my)) return;
    cache.settings = s;
    $('#view').innerHTML = `<div class="def"><nav class="def-nav" aria-label="Secções das definições">${DEF_TABS.map(([k, l]) => `<a href="#definicoes/${k}" aria-current="${tab === k ? 'page' : 'false'}">${l}</a>`).join('')}</nav><div id="def-body" class="def-body"></div></div>`;
    const body = $('#def-body');
    if (tab === 'equipa') return staffView(body);
    const inp = (k, l, o = {}) => `<div class="field" ${o.full ? 'style="grid-column:1/-1"' : ''}><label for="s-${k}">${l}</label>${o.area
      ? `<textarea class="input" id="s-${k}" name="${k}" rows="${o.rows || 3}">${esc(Array.isArray(s[k]) ? s[k].join('\n') : s[k])}</textarea>`
      : `<input class="input" id="s-${k}" name="${k}" ${o.type ? `type="${o.type}"` : ''} ${o.min != null ? `min="${o.min}"` : ''} value="${esc(s[k])}">`}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
    const ZN = { 'Europe/Lisbon': 'Portugal continental (Lisboa)', 'Atlantic/Madeira': 'Madeira', 'Atlantic/Azores': 'Açores' };
    const forms = {
      horario: async () => {
        const hours = await api('/hours');
    if (!(typeof body !== 'undefined' ? body : $('#view')).isConnected) return;
        body.innerHTML = `<form id="hf" class="panel"><h2>Horário de funcionamento</h2><p class="small muted">Opcional. Se preencheres, o site oferece horas dentro destes intervalos (a cada ${s.slot_step_min} minutos) nos dias em que não abriste horas à mão.
          Num dia com horas abertas em <a href="#calendario/disponibilidade">Calendário → Horários para marcação</a>, só essas contam. Deixa vazio para abrir sempre à mão.
          Pausas de almoço, folgas, férias e exceções: <a href="#calendario/bloqueios">Calendário → Bloqueios, folgas e férias</a>.</p>
          ${hoursEditor(hours)}<div class="field" style="max-width:320px;margin-top:16px"><label for="s-step">Intervalo entre horas oferecidas (minutos)</label><input class="input" id="s-step" type="number" min="5" max="240" value="${s.slot_step_min}"></div>
          <button class="btn">Guardar horário</button></form>`;
        bindHours(body);
        $('#hf').onsubmit = run(async e => { e.preventDefault(); await api('/hours', { method: 'PUT', body: { hours: readHours(body) } }); await api('/settings', { method: 'PUT', body: { slot_step_min: +$('#s-step').value } }); toast('Horário guardado'); });
      },
      lembretes: async () => {
        const st = await api('/integrations');
    if (!(typeof body !== 'undefined' ? body : $('#view')).isConnected) return;
        const E = st.email;
        body.innerHTML = `<section class="panel"><h2>${ic('chat')} Mensagens por WhatsApp</h2>
            <p class="small muted" style="margin:0">As mensagens às clientes saem do teu WhatsApp, com um toque: em cada marcação, o botão <b>Enviar por WhatsApp</b> abre a conversa com o texto já escrito (com o link da marcação e os dados do sinal) e só tens de carregar em Enviar.
            Cada mensagem aberta fica registada no histórico da marcação.</p></section>
          <form id="waf" class="panel"><h2>Mensagens de WhatsApp</h2>
            <p class="small muted">Cada mensagem abre o teu WhatsApp já escrita — só tens de carregar em Enviar. A <b>marcação recebida é automática</b>: no fim da marcação a cliente vê no site a confirmação e os dados do sinal, e envia-te a marcação por WhatsApp.</p>
            <div class="wa-tpl"><div class="field"><label for="w-k">Ao marcar · mensagem que a cliente te envia</label><span class="hint">No fim da marcação no site, a cliente carrega em "Enviar por WhatsApp" e esta mensagem vai para ti. Podes usar <code>{servico}</code> <code>{data}</code> <code>{hora}</code> <code>{pagamento}</code> <code>{nome}</code> (nome completo); se a cliente não escolher pagamento, essa linha não aparece.</span><textarea class="input" id="w-k" name="wa_tpl_client" rows="8" maxlength="800">${esc(s.wa_tpl_client || '')}</textarea></div>
              <div class="wa-prev"><span class="small muted">Pré-visualização</span><p data-prev="w-k"></p></div></div>
            <div class="wa-tpl"><div class="field"><label for="w-c">1 · Marcação confirmada</label><span class="hint">Botão na marcação, depois de a aprovares.</span><textarea class="input" id="w-c" name="wa_tpl_confirmed" rows="7">${esc(s.wa_tpl_confirmed)}</textarea></div>
              <div class="wa-prev"><span class="small muted">Pré-visualização</span><p data-prev="w-c"></p></div></div>
            <div class="wa-tpl"><div class="field"><label for="w-r">2 · Lembrete (véspera)</label><span class="hint">No dia anterior, a partir da hora escolhida, aparece no Dashboard a lista "Lembretes de amanhã" com um botão por cliente.</span><textarea class="input" id="w-r" name="wa_tpl_reminder" rows="8">${esc(s.wa_tpl_reminder)}</textarea>
              <label class="small" for="w-rh" style="margin-top:8px;display:block">Hora do lembrete</label><select class="input" id="w-rh" name="reminder_wa_hour" style="max-width:140px">${[...new Set([17, 18, 19, 20, 21, 22, 23, Number(s.reminder_wa_hour || 21)])].sort((x, y) => x - y).map(h => `<option value="${h}" ${Number(s.reminder_wa_hour || 21) === h ? 'selected' : ''}>${h}h</option>`).join('')}</select></div>
              <div class="wa-prev"><span class="small muted">Pré-visualização</span><p data-prev="w-r"></p></div></div>
            <div class="wa-tpl"><div class="field"><label for="w-b">3 · Mensagem de aniversário</label><span class="hint">Botão em Clientes → Aniversários e no Dashboard, no dia de anos da cliente.</span><textarea class="input" id="w-b" name="birthday_message" rows="9" maxlength="800">${esc(s.birthday_message)}</textarea></div>
              <div class="wa-prev"><span class="small muted">Pré-visualização</span><p data-prev="w-b"></p></div></div>
            <p class="small muted">Podes usar: <code>{nome}</code> primeiro nome · <code>{profissional}</code> o teu nome · nas mensagens 1 e 2 também <code>{servico}</code> <code>{data}</code> <code>{hora}</code> <code>{ref}</code> <code>{link}</code> (link da marcação) <code>{morada}</code> <code>{sinal_texto}</code> (sinal recebido ou por receber).</p>
            <button class="btn">Guardar mensagens</button></form>
          <section class="panel"><h2>Próximas marcações — presença</h2><div id="rem-list"><div class="spinner"></div></div></section>`;
        const list = await api(`/bookings?status=confirmed&from=${today()}&to=${addDays(today(), 7)}`);
        if (!$('#rem-list')) return;
        $('#rem-list').innerHTML = list.length ? list.map(b => `<div class="mini-row click" data-booking="${b.id}" tabindex="0" role="button"><span><b>${shortDay(isoDay(b.start_at))} ${hhmm(b.start_at)}</b> · ${esc(b.customer_name)} · ${esc(b.service_name)}</span>
            <span class="row-actions">${b.attendance_confirmed_at ? '<span class="mini ok">Presença confirmada</span>' : '<span class="mini">Presença por confirmar</span>'}<span class="mini off">Abrir para enviar por WhatsApp</span></span></div>`).join('') : empty('Sem marcações confirmadas nos próximos 7 dias.');
        bindBookings(body, () => views.definicoes('lembretes'));
        bindSettings();
        $('#waf', body).onsubmit = run(async e => {
          e.preventDefault();
          const out = Object.fromEntries([...$('#waf', body).elements].filter(x => x.name).map(x => [x.name, x.value]));
          await api('/settings', { method: 'PUT', body: out }); Object.assign(s, out); toast('Mensagens guardadas');
        });
        const EX = { nome: 'Ana', profissional: s.professional_name || s.business_name, servico: 'Verniz Gel', data: 'sábado, 17 de outubro', hora: '10:00', ref: 'AB12CD', link: (s.public_base_url || '') + '/gerir.html?t=…',
          morada: `${s.address_line}, ${s.postal_code} ${s.city}`, sinal: '9,00 €', pagamento: 'Em mão (no espaço)', sinal_texto: `Para reservar, peço um sinal de 9,00 € por MB WAY para o ${s.mbway_number}, com a referência AB12CD na descrição. Assim que receber, confirmo a tua marcação.` };
        const fillEx = (t, X = EX) => t.replace(/\{(\w+)\}/g, (m, k) => k in X ? X[k] : m).replace(/\n{3,}/g, '\n\n').trim();
        $$('[data-prev]', body).forEach(p => { const ta = $('#' + p.dataset.prev, body); const up = () => { p.textContent = fillEx(ta.value, p.dataset.prev === 'w-k' ? { ...EX, nome: 'Ana Silva' } : EX); }; ta.addEventListener('input', up); up(); });
      },
      pagamentos: async () => {
        body.innerHTML = `<form id="sf" class="panel"><h2>Pagamentos e sinal</h2>
          <p class="small muted">Ao marcar, a cliente escolhe como prefere pagar: <b>MB WAY</b>, <b>transferência bancária</b> (só aparece se preencheres o IBAN) ou <b>em mão</b>. A escolha fica na marcação.
            O site não cobra nada automaticamente: mostra os teus dados à cliente e tu registas o sinal no painel quando o receberes (botão <b>Registar sinal</b> na marcação).</p>
          <label class="check"><input type="checkbox" name="deposit_enabled" ${s.deposit_enabled ? 'checked' : ''}><span>Pedir sinal para reservar o dia e a hora</span></label>
          <div class="form-grid" style="margin-top:12px">
            ${inp('deposit_percent', 'Sinal (% do valor do serviço)', { type: 'number', min: 10, hint: '50 = metade agora, metade no final do serviço.' })}
            ${inp('mbway_number', 'Número MB WAY', { hint: 'Mostrado à cliente depois de marcar e nas mensagens de WhatsApp.' })}
            ${inp('iban', 'IBAN (opcional)', { hint: 'Ex.: PT50 0000 0000 0000 0000 0000 0. Vazio = sem opção de transferência.' })}
            ${inp('iban_name', 'Titular da conta (opcional)')}
            ${inp('payment_note', 'Nota para a cliente', { full: true, area: true, rows: 2 })}
          </div><button class="btn">Guardar</button></form>`;
        bindSettings();
      },
      regras: async () => {
        body.innerHTML = `<form id="sf" class="panel"><h2>Regras de marcação</h2><div class="form-grid">
          <div class="field"><label for="s-timezone">Fuso horário do espaço</label><select class="input" id="s-timezone" name="timezone">${zones.map(z => `<option value="${z}" ${s.timezone === z ? 'selected' : ''}>${ZN[z] || z}</option>`).join('')}</select><span class="hint">Usado para mostrar e comparar todas as datas e horas.</span></div>
          ${inp('min_notice_hours', 'Antecedência mínima para marcar online (horas)', { type: 'number', min: 0 })}${inp('max_advance_days', 'Marcar com até quantos dias de antecedência', { type: 'number', min: 1 })}
          ${inp('cancel_limit_hours', 'A cliente pode cancelar online até (horas antes)', { type: 'number', min: 0 })}${inp('reschedule_limit_hours', 'A cliente pode reagendar online até (horas antes)', { type: 'number', min: 0 })}
          ${inp('pending_hold_hours', 'Pedido pendente: horário reservado durante (horas)', { type: 'number', min: 1 })}
          ${inp('booking_policy', 'Política de marcação (página Políticas)', { full: true, area: true })}
          ${inp('cancellation_policy', 'Condições de cancelamento e reagendamento (mostradas antes de confirmar)', { full: true, area: true, rows: 4 })}
        </div><button class="btn">Guardar regras</button></form>`;
        bindSettings();
      },
      espaco: async () => {
        body.innerHTML = `<form id="sf" class="panel"><h2>Negócio e contactos</h2><div class="form-grid">
          ${inp('business_name', 'Nome do estabelecimento')}${inp('professional_name', 'Nome da profissional')}
          ${imgField('logo_image', 'Logótipo (site e painel)', s.logo_image)}${imgField('profile_image', 'Fotografia de perfil (painel)', s.profile_image)}
          ${inp('phone', 'Telefone')}${inp('email', 'Email (aparece no site)')}
          ${inp('whatsapp', 'WhatsApp', { hint: 'O número de telemóvel. Cria o botão "WhatsApp" no site.' })}${inp('instagram', 'Instagram (link ou @utilizador)')}
          ${inp('facebook', 'Facebook (link, opcional)')}${inp('tiktok', 'TikTok (link, opcional)')}
          ${inp('address_line', 'Morada')}${inp('postal_code', 'Código postal')}${inp('city', 'Localidade')}
          ${inp('map_link_url', 'Link do mapa (opcional)', { hint: 'Vazio = "Como chegar" abre o Google Maps com a morada.' })}
          ${inp('access_info', 'Estacionamento e acesso (opcional)', { full: true, area: true, rows: 2 })}
          ${inp('privacy_controller', 'Responsável pelo tratamento de dados (nome/empresa e NIF)', { full: true })}
          ${inp('public_base_url', 'Endereço público do site', { hint: 'Usado nos links enviados por WhatsApp, ex.: https://www.oteusite.pt' })}
        </div><button class="btn">Guardar</button></form>`;
        bindImgFields(body); bindSettings(() => paintSide());
      },
      conteudo: async () => {
        body.innerHTML = `<form id="sf" class="panel"><h2>Textos e fotografias do site</h2><div class="form-grid">
          ${inp('hero_title', 'Título do primeiro ecrã', { full: true })}${inp('hero_subtitle', 'Texto do primeiro ecrã', { full: true, area: true, rows: 2 })}
          ${imgField('hero_image', 'Fotografia principal', s.hero_image)}${imgField('about_image', 'Fotografia da esteticista', s.about_image)}
          ${inp('about_text', 'Apresentação da esteticista (página inicial)', { full: true, area: true, rows: 4 })}
          ${inp('space_title', 'Página "O espaço" — título', { full: true })}${inp('space_text', 'Página "O espaço" — texto sobre o espaço', { full: true, area: true, rows: 4 })}
          ${inp('space_points', 'Página "O espaço" — pontos em destaque (um por linha)', { full: true, area: true, rows: 4 })}
          ${imgField('space_image', 'Página "O espaço" — fotografia principal', s.space_image)}
          ${inp('testimonials', 'Feedback das clientes (página inicial) — um por linha, no formato <b>Serviço | mensagem</b>', { full: true, area: true, rows: 6, hint: 'Ex.: Lash Lifting | As minhas pestanas ficaram lindíssimas! Sem nomes nem fotografias das clientes.' })}
          ${inp('training', 'Formação (uma por linha, opcional)', { full: true, area: true, rows: 3 })}
          ${inp('video_url', 'Vídeo do Instagram (link do reel)', { full: true })}
          <div class="field" style="grid-column:1/-1"><label for="i-video_file">Vídeo do espaço (MP4 — toca sozinho, sem som)</label>
            <div class="img-row"><input class="input" id="i-video_file" name="video_file" value="${esc(s.video_file || '')}"><label class="btn tiny secondary upl">Carregar<input type="file" accept="video/mp4,video/webm,video/quicktime" hidden data-video-add></label></div></div>
          ${imgField('video_image', 'Capa do vídeo', s.video_image)}
          <div class="field" style="grid-column:1/-1"><label for="s-gallery">Galeria de "O espaço" — 4 a 6 fotografias (um endereço por linha)</label>
            <textarea class="input" id="s-gallery" name="gallery" rows="5">${esc((s.gallery || []).join('\n'))}</textarea>
            <label class="btn tiny secondary upl" style="justify-self:start">Carregar fotografias<input type="file" accept="image/*" multiple hidden data-gallery-add></label></div>
          ${inp('arrival_note', 'Nota para a visita (aparece na confirmação)', { full: true, area: true, rows: 2 })}
        </div><button class="btn">Guardar</button></form>`;
        bindImgFields(body); bindSettings();
      },
      dados: async () => {
        body.innerHTML = `<section class="panel"><h2>Dados das clientes (RGPD)</h2>
          <p class="small">O painel guarda apenas o necessário para gerir as marcações: nome, telefone, email (opcional), aniversário (só dia e mês, opcional), histórico de marcações, pagamentos e notas internas. Não registes dados de saúde nas notas.</p>
          <ul class="small ticks-plain"><li><b>Acesso e portabilidade:</b> exporta todos os dados das clientes num ficheiro CSV (abre no Excel).</li>
            <li><b>Apagamento:</b> na ficha da cliente, “Apagar dados pessoais” remove nome, contactos, aniversário e notas, mantendo apenas os registos financeiros anónimos exigidos por lei.</li>
            <li><b>Cópias de segurança:</b> o servidor faz uma cópia diária da base de dados (as últimas 14).</li>
            <li><b>Acesso ao painel:</b> só com sessão iniciada; as palavras-passe são guardadas cifradas.</li></ul>
          <button class="btn" id="exp-cust">${ic('ext')}Exportar clientes (CSV)</button></section>`;
        $('#exp-cust', body).onclick = run(async () => {
          const d = await api('/export/customers');
          downloadCsv(`clientes-${today()}.csv`, ['Nome', 'Telefone', 'Email', 'Aniversário (dd/mm)', 'Aceita msg. aniversário', 'Aceita novidades', 'Ficha criada', 'Primeira visita', 'Última visita', 'Visitas', 'Total pago (€)', 'Notas'],
            d.customers.map(c => [c.name, c.phone, c.email, c.birthday ? bdayTxt(c.birthday) : '', c.birthday_consent ? 'Sim' : 'Não', c.marketing_consent ? 'Sim' : 'Não', dmyMs(c.created_at), c.first_visit ? dmyMs(c.first_visit) : '', c.last_visit ? dmyMs(c.last_visit) : '', c.visits, toEur(c.paid_cents), c.notes]));
        });
      },
      conta: async () => {
        const me = await api('/me').catch(() => ({}));
        body.innerHTML = `<section class="panel" style="max-width:520px"><h2>Acesso ao painel</h2><dl class="kv"><dt>Conta</dt><dd>${esc(me.email || '—')}</dd><dt>Nome</dt><dd>${esc(me.name || '—')}</dd></dl>
          <p class="small muted">O painel é privado: todas as páginas exigem sessão iniciada e o servidor recusa pedidos sem sessão. Depois de várias tentativas falhadas, o acesso fica bloqueado temporariamente. Para terminar a sessão usa “Terminar sessão” no menu.</p></section>
          <form id="pw" class="panel" style="max-width:520px"><h2>Alterar palavra-passe</h2><div class="field"><label for="pw-c">Palavra-passe atual</label><input class="input" id="pw-c" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="pw-n">Nova palavra-passe (mínimo 10 caracteres)</label><input class="input" id="pw-n" type="password" autocomplete="new-password"></div><div id="pw-msg"></div><button class="btn">Alterar palavra-passe</button></form>
          <section class="panel install-help" style="max-width:520px"><h2>Instalar no telemóvel</h2>
            ${isStandalone() ? '<p class="mini ok">O painel já está instalado neste aparelho.</p>' : `
            <p class="small muted">O painel fica com ícone no ecrã principal e abre em ecrã inteiro, como uma aplicação. Os dados são sempre os do servidor.</p>
            ${installEvt ? `<button type="button" class="btn" id="pwa-install">${ic('plus')}Instalar o painel</button>` : ''}
            <ol class="small"><li><strong>iPhone (Safari):</strong> toca em <em>Partilhar</em> e depois em <em>Adicionar ao ecrã principal</em>.</li>
            <li><strong>Android (Chrome):</strong> abre o menu <em>⋮</em> e escolhe <em>Instalar aplicação</em> (ou <em>Adicionar ao ecrã principal</em>).</li></ol>`}
          </section>`;
        const ib = $('#pwa-install'); if (ib) ib.onclick = async () => { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); installEvt = null; if (r && r.outcome === 'accepted') toast('Painel instalado'); ib.remove(); };
        $('#pw').onsubmit = run(async e => { e.preventDefault(); try { await api('/password', { method: 'POST', body: { current: $('#pw-c').value, next: $('#pw-n').value } }); e.target.reset(); formMsg($('#pw-msg'), ''); toast('Palavra-passe alterada'); } catch (err) { formMsg($('#pw-msg'), esc(err.message)); } });
      }
    };
    function bindSettings(after) {
      const sf = $('#sf', body); if (!sf) return;
      sf.onsubmit = run(async e => {
        e.preventDefault();
        const out = {};
        for (const el of sf.elements) if (el.name && el.name in s) out[el.name] = el.type === 'checkbox' ? el.checked : Array.isArray(s[el.name]) ? el.value.split('\n').map(x => x.trim()).filter(Boolean) : el.value;
        await api('/settings', { method: 'PUT', body: out });
        if (out.timezone) TZ = out.timezone;
        Object.assign(cache.settings || {}, out);
        toast('Definições guardadas'); if (out.business_name) $('#biz').textContent = out.business_name; if (after) after();
      });
    }
    loading(body);
    await forms[tab]();
  };
  async function staffView(body) {
    await load(true);
    body.innerHTML = `<section class="panel"><h2>Profissionais <button class="btn tiny" id="p-new">${ic('plus')}Profissional</button></h2>
      <p class="small muted">Com mais do que uma profissional, cada uma tem a sua agenda: o mesmo horário pode ser marcado uma vez para cada profissional.</p>
      ${cache.staff.map(p => `<div class="mini-row"><span><b>${esc(p.name)}</b> · ${esc(p.role)}${p.active ? '' : ' <span class="mini off">Inativa</span>'}</span><button class="btn tiny secondary" data-p="${p.id}">Editar</button></div>`).join('')}</section>`;
    const edit = p => modal(`${head(p.id ? 'Editar profissional' : 'Nova profissional')}<form id="sf2">
      <div class="form-grid"><div class="field"><label for="st-n">Nome</label><input class="input" id="st-n" value="${esc(p.name || '')}"></div><div class="field"><label for="st-r">Função</label><input class="input" id="st-r" value="${esc(p.role || '')}"></div></div>
      <div class="field"><label for="st-b">Apresentação</label><textarea class="input" id="st-b" rows="3">${esc(p.bio || '')}</textarea></div>
      <fieldset class="field"><legend class="label">Serviços que realiza</legend><div class="choice wrap">${cache.services.services.map(s => `<label><input type="checkbox" name="svc" value="${s.id}" ${p.services.includes(s.id) ? 'checked' : ''}><span>${esc(s.name)}</span></label>`).join('')}</div></fieldset>
      <label class="check"><input type="checkbox" id="st-a" ${p.active !== 0 ? 'checked' : ''}><span>Ativa</span></label>
      <div class="actions"><button class="btn" type="submit">Guardar</button></div></form>`, b2 => {
      $('#sf2', b2).onsubmit = run(async e => { e.preventDefault(); await api(p.id ? `/staff/${p.id}` : '/staff', { method: p.id ? 'PUT' : 'POST', body: { name: $('#st-n', b2).value, role: $('#st-r', b2).value, bio: $('#st-b', b2).value, photo_url: p.photo_url || '', active: $('#st-a', b2).checked, services: $$('[name=svc]:checked', b2).map(x => +x.value), hours: p.hours } }); dlg.close(); cache.staff = null; toast('Guardado'); staffView(body); });
    }, { wide: true });
    $('#p-new', body).onclick = () => edit({ hours: [], services: cache.services.services.map(s => s.id) });
    $$('[data-p]', body).forEach(b => b.onclick = () => edit(cache.staff.find(p => p.id === +b.dataset.p)));
  }
  // ---------- AVALIAÇÕES ----------
  const rvs = { filter: 'todas' };
  views.avaliacoes = async () => { setTop('Avaliações', ''); await reviewsView($('#view')); };
  async function reviewsView(body) {
    const my = seq;
    const list = await api('/reviews');
    if (stale(my) || !body.isConnected) return;
    const RS = { published: ['Publicada', 'ok'], pending: ['Por aprovar', 'warn'], hidden: ['Oculta', 'off'] }, HR = { spam: 'Spam', ofensivo: 'Conteúdo ofensivo', dados_pessoais: 'Dados pessoais' };
    const pub = list.filter(r => r.status === 'published'), avg = pub.length ? pub.reduce((a, r) => a + r.rating, 0) / pub.length : 0;
    const dist = [5, 4, 3, 2, 1].map(n => ({ name: `${n} ★`, v: pub.filter(r => r.rating === n).length }));
    const F = [['todas', 'Todas', list.length], ['pending', 'Por aprovar', list.filter(r => r.status === 'pending').length], ['published', 'Publicadas', pub.length], ['hidden', 'Ocultas', list.filter(r => r.status === 'hidden').length]];
    const shown = rvs.filter === 'todas' ? list : list.filter(r => r.status === rvs.filter);
    body.innerHTML = `<div class="cols-2 rv-head">
        <section class="panel rv-score"><span class="k-l">Classificação média</span><b>${pub.length ? avg.toFixed(1).replace('.', ',') : '—'}</b><span class="stars" aria-hidden="true">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</span><small>${pub.length} avaliação(ões) publicada(s) · ${list.length} no total</small></section>
        <section class="panel"><h2>Distribuição <small>publicadas</small></h2>${pub.length ? hbars(dist, v => String(v)) : empty('Ainda sem avaliações publicadas.')}</section></div>
      <div class="notice slim">${ic('sparkle')}<span>Só clientes com atendimento concluído podem avaliar (uma vez por atendimento). As que têm links, emails ou números ficam <b>por aprovar</b>. Podes ocultar apenas spam, conteúdo ofensivo ou dados pessoais — críticas legítimas ficam visíveis, mas podes sempre responder. Tudo fica registado aqui.</span></div>
      <div class="chips">${F.map(([k, l, n]) => `<button class="chip-f" data-rf="${k}" aria-pressed="${rvs.filter === k}">${l} <span class="muted">${n}</span></button>`).join('')}</div>
      ${shown.map(r => `<section class="panel rv"><div class="rv-top"><span><span class="stars" aria-label="${r.rating} de 5">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span> <b>${esc(r.author_name)}</b> <span class="small muted">· ${esc(r.service_name)} · ${dmyMs(r.created_at)}</span></span><span class="st st-${RS[r.status][1]}">${RS[r.status][0]}${r.hidden_reason ? ': ' + HR[r.hidden_reason] : ''}</span></div>
        <p>${esc(r.comment) || '<span class="muted">Sem comentário.</span>'}</p>${r.reply ? `<p class="small reply">A tua resposta: ${esc(r.reply)}</p>` : ''}
        <div class="row-actions">${r.status !== 'published' ? `<button class="btn tiny" data-pub="${r.id}">${ic('check')}${r.status === 'pending' ? 'Aprovar e publicar' : 'Voltar a publicar'}</button>` : ''}${r.status !== 'hidden' ? `<select class="input inline" data-hide="${r.id}" aria-label="Ocultar"><option value="">Ocultar por…</option>${Object.entries(HR).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>` : ''}
          <button class="btn tiny secondary" data-reply="${r.id}">${r.reply ? 'Editar resposta' : 'Responder'}</button>${r.ref ? `<span class="small muted">Ref. ${esc(r.ref)}${r.customer_name ? ' · ' + esc(r.customer_name) : ''}</span>` : ''}</div></section>`).join('') || empty(list.length ? 'Nenhuma avaliação com este filtro.' : 'Ainda não há avaliações. Depois de um atendimento concluído, a cliente recebe o convite para avaliar (se o email estiver configurado).')}`;
    const re = () => reviewsView(body);
    $$('[data-rf]', body).forEach(b => b.onclick = () => { rvs.filter = b.dataset.rf; re(); });
    $$('[data-pub]', body).forEach(b => b.onclick = run(async () => { await api(`/reviews/${b.dataset.pub}`, { method: 'POST', body: { action: 'publish' } }); toast('Avaliação publicada no site'); re(); }));
    $$('[data-hide]', body).forEach(s2 => s2.onchange = run(async () => { if (!s2.value) return; await api(`/reviews/${s2.dataset.hide}`, { method: 'POST', body: { action: 'hide', reason: s2.value } }); toast('Avaliação ocultada (fica no registo)'); re(); }));
    $$('[data-reply]', body).forEach(b => b.onclick = () => { const r = list.find(x => x.id === +b.dataset.reply);
      modal(`${head('Resposta pública', 'Aparece no site, por baixo da avaliação.')}<form id="rpf"><div class="field"><textarea class="input" id="rp" rows="4" maxlength="1000">${esc(r.reply)}</textarea></div><button class="btn">Guardar resposta</button></form>`, b2 => {
        $('#rpf', b2).onsubmit = run(async e => { e.preventDefault(); await api(`/reviews/${r.id}`, { method: 'POST', body: { action: 'reply', reply: $('#rp', b2).value } }); dlg.close(); toast('Resposta guardada'); re(); });
      }); });
  }

  // ---------- NOTIFICAÇÕES ----------
  const nt = { tab: 'atividade' };
  const NT_KIND = a => /Pedido enviado|Marcação feita/.test(a) ? ['plus', 'Nova marcação', 'new'] : /Cancelada/.test(a) ? ['x', 'Marcação cancelada', 'cancel'] : /Reagendada/.test(a) ? ['calendar', 'Cliente reagendou', 'move']
    : /Aceitou/.test(a) ? ['check', 'Aceitou o horário sugerido', 'ok'] : /Recusou/.test(a) ? ['x', 'Recusou o horário sugerido', 'cancel'] : /Presença/.test(a) ? ['check', 'Confirmou presença', 'ok'] : /expirou/.test(a) ? ['bell', 'Pedido expirou sem resposta', 'warn'] : ['bell', a, ''];
  const EMAIL_KIND = { confirmed: 'Confirmação', pending: 'Pedido recebido', approved: 'Pedido aprovado', rejected: 'Pedido recusado', cancelled: 'Cancelamento', rescheduled: 'Reagendamento', reminder: 'Lembrete', proposed: 'Proposta de horário', expired: 'Pedido expirado', review: 'Convite para avaliar', waitlist_offer: 'Vaga da lista de espera', birthday: 'Aniversário', admin_new: 'Aviso de nova marcação' };
  views.notificacoes = async arg => {
    nt.tab = ['atividade', 'amanha'].includes(arg) ? arg : 'atividade';
    setTop('Notificações', '');
    const my = seq;
    const d = await api('/inbox');
    if (stale(my)) return;
    const s = cache.settings || {};
    const T = [['atividade', 'Atividade', d.unread], ['amanha', 'Amanhã', d.tomorrow.length]];
    const remind = b => `Olá ${String(b.customer_name).split(' ')[0]}! Lembro-te da tua marcação amanhã, ${shortDay(isoDay(b.start_at))}, às ${hhmm(b.start_at)} (${b.service_name}). Até amanhã! ${s.professional_name || ''}`.trim();
    $('#view').innerHTML = `<div class="tabs" role="tablist">${T.map(([k, l, n]) => `<a role="tab" href="#notificacoes${k === 'atividade' ? '' : '/' + k}" aria-selected="${nt.tab === k}">${l}${n ? `<span class="badge">${n}</span>` : ''}</a>`).join('')}</div>
      ${d.pending ? `<a class="notice warn slim" href="#marcacoes/pedidos">${ic('bell')}<span><b>${d.pending} pedido(s) pendente(s)</b> a aguardar a tua aprovação →</span></a>` : ''}
      <div id="nt-body"></div>`;
    const body = $('#nt-body');
    if (nt.tab === 'atividade') {
      body.innerHTML = d.items.length ? `<div class="feed">${d.items.map(i => { const [icn, title, cls] = NT_KIND(i.action); return `<div class="feed-row ${cls} ${i.at > d.seen_at ? 'unread' : ''}" data-booking="${i.booking_id}" tabindex="0" role="button">
          <span class="feed-ic">${ic(icn)}</span><span class="feed-main"><b>${esc(title)}</b><span>${esc(i.customer_name)} · ${esc(i.service_name || '')}${i.start_at ? ` · ${shortDay(isoDay(i.start_at))} ${hhmm(i.start_at)}` : ''}</span>${i.details ? `<small class="muted">${esc(i.details)}</small>` : ''}</span>
          <span class="feed-side"><time>${dt(i.at)}</time>${i.status === 'pending' && /Pedido enviado/.test(i.action) ? `<button class="btn tiny" data-approve="${i.booking_id}">Aprovar</button>` : chip(i.status)}</span></div>`; }).join('')}</div>`
        : empty('Ainda não há atividade das clientes.');
      bindBookings(body, () => views.notificacoes('atividade'));
      if (d.unread) api('/inbox/seen', { method: 'POST', body: {} }).then(updateBadges).catch(() => {});
    } else if (nt.tab === 'amanha') {
      body.innerHTML = `<p class="small muted">Marcações confirmadas para ${longDay(d.tomorrow_date)}. ${d.reminder_due ? 'Envia o lembrete a cada cliente com um toque.' : `Os lembretes ficam destacados a partir das ${d.reminder_hour}h (também no Dashboard).`} <a href="#definicoes/lembretes">Editar mensagem</a></p>
        ${d.tomorrow.length ? d.tomorrow.map(remRow).join('') : empty('Sem marcações confirmadas para amanhã.')}`;
      bindRem(body, () => views.notificacoes('amanha'));
    } else {
      const ST = { sent: ['Enviado', 'ok'], failed: ['Falhou', 'err'], not_configured: ['Não enviado — email não configurado', 'warn'], skipped: ['Não enviado — cliente sem email', 'off'] };
      body.innerHTML = `<p class="small muted">Registo real de cada mensagem: nada é marcado como enviado se não tiver sido. ${d.integrations.email ? 'O email está configurado.' : '<b>O email ainda não está configurado</b> — <a href="#definicoes/lembretes">ver o que falta</a>.'}</p>
        ${d.emails.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Mensagem</th><th>Para</th><th>Estado</th></tr></thead><tbody>${d.emails.map(n => `<tr ${n.booking_id ? `data-booking="${n.booking_id}" class="click"` : ''}><td>${dt(n.created_at)}</td><td>${esc(EMAIL_KIND[n.kind] || n.kind)}</td><td>${esc(n.recipient || '—')}</td><td><span class="mini ${(ST[n.status] || [])[1] || ''}">${(ST[n.status] || [n.status])[0]}</span>${n.error ? `<br><span class="small muted">${esc(n.error)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Ainda não há mensagens registadas.')}`;
      bindBookings(body, () => views.notificacoes('emails'));
    }
  };

  // ---------- navegação ----------
  const NAV = [['dashboard', 'Dashboard', 'home'], ['marcacoes', 'Marcações', 'list'], ['calendario', 'Calendário', 'calendar'], ['clientes', 'Clientes', 'users'], ['servicos', 'Serviços', 'sparkle'],
    ['financeiro', 'Financeiro', 'euro'], ['avaliacoes', 'Avaliações', 'star'], ['notificacoes', 'Notificações', 'bell'], ['definicoes', 'Definições', 'gear']];
  const TAB_MAIN = ['dashboard', 'marcacoes', 'calendario', 'clientes'];
  const counts = { pending: 0, unread: 0, reminders: 0 };
  const badgeOf = k => k === 'dashboard' && counts.reminders ? `<span class="badge" aria-label="${counts.reminders} lembretes por enviar">${counts.reminders}</span>` : k === 'marcacoes' && counts.pending ? `<span class="badge" aria-label="${counts.pending} pedidos pendentes">${counts.pending}</span>`
    : k === 'notificacoes' && counts.unread ? `<span class="badge" aria-label="${counts.unread} notificações novas">${counts.unread}</span>` : '';
  let curView = 'dashboard';
  function menu(cur) {
    curView = cur;
    $('#menu').innerHTML = NAV.map(([k, l, i]) => `<a href="#${k}" ${k === cur ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span>${badgeOf(k)}</a>`).join('');
    const more = NAV.filter(([k]) => !TAB_MAIN.includes(k)), moreBadge = counts.unread ? `<span class="badge">${counts.unread}</span>` : '';
    $('#tabbar').innerHTML = NAV.filter(([k]) => TAB_MAIN.includes(k)).map(([k, l, i]) => `<a href="#${k}" ${k === cur ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span>${badgeOf(k)}</a>`).join('')
      + `<button type="button" id="tb-more" ${more.some(([k]) => k === cur) ? 'aria-current="page"' : ''}>${ic('menu')}<span>Mais</span>${moreBadge}</button>`;
    $('#tb-more').onclick = () => modal(`${head('Menu')}<nav class="more-menu">${more.map(([k, l, i]) => `<a href="#${k}" data-close ${k === cur ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span>${badgeOf(k)}</a>`).join('')}
        <a href="/" target="_blank" rel="noopener">${ic('ext')}<span>Ver o site</span></a><button type="button" class="more-out" id="mm-out">${ic('out')}<span>Terminar sessão</span></button></nav>`, b => { $('#mm-out', b).onclick = logout; });
  }
  async function updateBadges() {
    try { const c = await api('/inbox/count'); if (c.pending !== counts.pending || c.unread !== counts.unread || (c.reminders || 0) !== counts.reminders) { c.reminders = c.reminders || 0; Object.assign(counts, c); menu(curView); } } catch { /* sem ligação */ }
  }
  function paintSide() {
    const s = cache.settings || {}, st = (cache.staff || [])[0] || {};
    const img = u => (window.DEMO_IMG && window.DEMO_IMG[u]) || u;
    const photo = img(s.profile_image || st.photo_url || s.about_image || '');
    $('#side-photo').innerHTML = photo ? `<img src="${esc(photo)}" alt="">` : `<span>${esc(String(s.professional_name || 'A').trim().charAt(0))}</span>`;
    $('#side-name').textContent = s.professional_name || '';
    $('#biz').textContent = s.business_name || '';
    if (s.logo_image) $$('.brand-logo-img').forEach(i => { i.src = img(s.logo_image); });
  }
  function setTop(title, actions) {
    $('#view-title').textContent = title;
    $('#top-actions').innerHTML = actions;
    $('#t-new')?.addEventListener('click', () => newBooking({ date: location.hash.startsWith('#calendario') ? ag.date : today() }));
    $('#t-block')?.addEventListener('click', () => blockDialog({ date: (location.hash.startsWith('#calendario') ? ag.date : today()) || today() }));
  }
  async function route() {
    const [k, arg] = (location.hash.slice(1) || 'dashboard').split('/');
    const v = views[k] ? k : 'dashboard';
    seq++;
    menu(['agenda', 'geral'].includes(v) ? curView : v); window.scrollTo(0, 0);
    loading();
    try { await views[v](arg); } catch (e) { if (e.message) $('#view').innerHTML = `<div class="notice err">${esc(e.message)} <button class="link-btn" onclick="location.reload()">Recarregar</button></div>`; }
    updateBadges();
  }

  // ---------- arranque ----------
  function showLogin() { $('#shell').hidden = true; $('#login').hidden = false; $('#l-email').focus(); }
  $('#login-form').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#login-form button'); btn.classList.add('busy');
    try { await api('/login', { method: 'POST', body: { email: $('#l-email').value, password: $('#l-pass').value } }); start(); }
    catch (err) { formMsg($('#l-msg'), esc(err.message)); }
    finally { btn.classList.remove('busy'); }
  };
  async function logout() { await api('/logout', { method: 'POST', body: {} }).catch(() => {}); if (dlg.open) dlg.close(); location.hash = ''; showLogin(); }
  $('#logout').onclick = logout;
  setInterval(() => { if (!$('#shell').hidden && document.visibilityState === 'visible') updateBadges(); }, 60000);
  addEventListener('hashchange', () => { if (dlg.open) dlg.close(); route(); });
  async function start() {
    try { await api('/me'); } catch (err) { if (err.message) { showLogin(); formMsg($('#l-msg'), esc(err.message)); } return; }
    try { const { settings } = await api('/settings'); TZ = settings.timezone || TZ; cache.settings = settings; await load(); paintSide(); } catch { /* continua */ }
    $('#login').hidden = true; $('#shell').hidden = false;
    route();
  }
  start();
})();
