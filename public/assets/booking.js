/* Fluxo de marcação: serviço → profissional → dia → hora → dados → rever → confirmação.
   Também exporta o calendário e os horários para "gerir marcação" e para a lista de espera. */
(function () {
  'use strict';
  const S = window.Site;
  const { api, icon, esc, $, $$, fmt } = S;
  const needPay = () => !!cfg.deposit_enabled;

  // ---------- componentes reutilizáveis ----------
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const monthStart = iso => iso.slice(0, 8) + '01';
  const daysInMonth = iso => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate();
  const weekdayMon = iso => ((new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7); // 0 = segunda

  async function renderCalendar(el, { serviceId, staffId, month, selected, onPick, onMonth }) {
    el.innerHTML = '<div class="cal"><div class="spinner"></div></div>';
    const m = month || null;
    // o servidor começa sempre em "hoje" (Europe/Lisbon) se a data pedida já passou
    let data;
    try { data = await api(`/days?service_id=${serviceId}${staffId ? '&staff_id=' + staffId : ''}&from=${m || ''}&days=${m ? daysInMonth(m) : 31}`); }
    catch (e) { el.innerHTML = `<div class="notice err">${esc(e.status === 404 ? 'Este serviço já não está disponível para marcação online. Contacta-me para combinarmos.' : 'Não foi possível carregar o calendário. Verifica a ligação e tenta novamente.')}</div>`; return; }
    const today = data.today;
    const ms = m || monthStart(today);
    const n = daysInMonth(ms);
    const map = Object.fromEntries(data.days.map(d => [d.date, d]));
    const canPrev = ms > monthStart(today), canNext = monthStart(addDays(ms, n)) <= data.last_date;
    const pad = weekdayMon(ms);
    const firstAvail = data.days.find(d => d.count && d.bookable && d.date >= today);
    el.innerHTML = `<div class="cal">
      <div class="cal-head">
        <button class="icon-btn" data-nav="-1" ${canPrev ? '' : 'disabled'} aria-label="Mês anterior">${icon('left')}</button>
        <strong aria-live="polite">${MONTHS[+ms.slice(5, 7) - 1]} ${ms.slice(0, 4)}</strong>
        <button class="icon-btn" data-nav="1" ${canNext ? '' : 'disabled'} aria-label="Mês seguinte">${icon('right')}</button>
      </div>
      <div class="cal-grid" role="grid">
        ${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(d => `<div class="dow" aria-hidden="true">${d}</div>`).join('')}
        ${Array.from({ length: pad }, () => '<span class="day pad"></span>').join('')}
        ${Array.from({ length: n }, (_, i) => {
          const iso = addDays(ms, i), d = map[iso];
          const ok = d && d.count > 0 && d.bookable && iso >= today;
          const label = `${i + 1} de ${MONTHS[+ms.slice(5, 7) - 1]}${ok ? `, ${d.count} horário${d.count > 1 ? 's' : ''} disponíve${d.count > 1 ? 'is' : 'l'}` : ', sem disponibilidade'}`;
          return `<button class="day ${ok ? 'has' : ''} ${iso === today ? 'today' : ''}" data-date="${iso}" ${ok ? '' : 'disabled'} aria-pressed="${iso === selected}" aria-label="${label}">${i + 1}</button>`;
        }).join('')}
      </div>
      <p class="small muted" style="margin:12px 0 0">${firstAvail ? `Primeiro dia disponível este mês: <button class="link-btn" data-date="${firstAvail.date}">${fmt.date(new Date(firstAvail.date + 'T12:00:00Z'), { timeZone: 'UTC' })}</button>` : 'Sem horários disponíveis neste mês.'}</p>
    </div>`;
    $$('[data-date]', el).forEach(b => b.addEventListener('click', () => onPick(b.dataset.date)));
    $$('[data-nav]', el).forEach(b => b.addEventListener('click', () => {
      const next = b.dataset.nav === '1' ? monthStart(addDays(ms, n)) : monthStart(addDays(ms, -1));
      onMonth?.(next);
      renderCalendar(el, { serviceId, staffId, month: next, selected, onPick, onMonth });
    }));
  }

  function periodOf(ms) {
    const h = +new Intl.DateTimeFormat('en-GB', { timeZone: S.TZ, hour: '2-digit', hourCycle: 'h23' }).format(ms);
    return h < 13 ? 'Manhã' : h < 17 ? 'Tarde' : 'Fim de tarde';
  }
  async function renderSlots(el, { serviceId, staffId, date, selected, onPick }) {
    el.innerHTML = '<div class="spinner" aria-label="A carregar horários"></div>';
    let slots;
    try { ({ slots } = await api(`/slots?service_id=${serviceId}${staffId ? '&staff_id=' + staffId : ''}&date=${date}`)); }
    catch (e) { el.innerHTML = '<div class="notice err">Não foi possível carregar os horários. Verifica a ligação e tenta novamente.</div>'; return []; }
    if (!slots.length) { el.innerHTML = '<div class="empty">Já não há horários disponíveis neste dia.</div>'; return slots; }
    const groups = {};
    for (const s of slots) (groups[periodOf(s.start)] ||= []).push(s);
    el.innerHTML = `<div class="slots">${Object.entries(groups).map(([p, list]) => `<h3>${p}</h3><div class="slot-grid">${list.map(s =>
      `<button class="slot" data-start="${s.start}" aria-pressed="${s.start === selected}">${s.time}</button>`).join('')}</div>`).join('')}</div>`;
    $$('.slot', el).forEach(b => b.addEventListener('click', () => onPick(slots.find(s => s.start === +b.dataset.start))));
    return slots;
  }

  function icsFile(b, cfg) {
    const z = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//marcacoes//PT', 'BEGIN:VEVENT', `UID:${b.ref}@marcacoes`, `DTSTAMP:${z(Date.now())}`,
      `DTSTART:${z(b.start)}`, `SUMMARY:${b.service_name} — ${cfg.business_name}`,
      `LOCATION:${cfg.address_line}, ${cfg.postal_code} ${cfg.city}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return URL.createObjectURL(new Blob([txt], { type: 'text/calendar' }));
  }

  // ---------- lista de espera ----------
  function openWaitlist(cfg, services, preset = {}) {
    const dlg = $('#wl-dialog'), form = $('#wl-form');
    $('#wl-service').innerHTML = services.map(s => `<option value="${s.id}" ${s.id === preset.service_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const openDays = cfg.hours.length ? [...new Set(cfg.hours.map(h => h.weekday))].sort() : [1, 2, 3, 4, 5, 6];
    $('#wl-days').innerHTML = openDays.map(d => `<label><input type="checkbox" name="days" value="${d}"><span>${S.DAYS[d]}</span></label>`).join('');
    if (preset.contact) { form.name.value = preset.contact.name || ''; form.phone.value = preset.contact.phone || ''; }
    if (preset.date) form.date_from.value = preset.date;
    $('#wl-msg').innerHTML = '';
    form.querySelector('[type=submit]').hidden = false;
    dlg.showModal();
    $$('[data-close]', dlg).forEach(b => b.onclick = () => dlg.close());
    form.onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = { service_id: +fd.get('service_id'), staff_id: preset.staff_id || null, days: fd.getAll('days').map(Number), periods: fd.getAll('periods'),
        date_from: fd.get('date_from') || null, date_to: fd.get('date_to') || null, name: fd.get('name'), phone: fd.get('phone'), website: fd.get('hp_extra') };
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        await api('/waitlist', { method: 'POST', body });
        $('#wl-msg').innerHTML = `<div class="notice ok" style="margin-bottom:14px">Pedido registado. Quando surgir uma vaga compatível, aviso-te por WhatsApp.</div>`;
        btn.hidden = true;
      } catch (err) {
        $('#wl-msg').innerHTML = `<div class="notice err" style="margin-bottom:14px">${esc(err.message)}${err.data?.errors ? '<br>' + Object.values(err.data.errors).map(esc).join('<br>') : ''}</div>`;
      } finally { btn.disabled = false; }
    };
  }

  window.Booking = { renderCalendar, renderSlots, icsFile, openWaitlist };

  // ---------- fluxo principal: 4 passos ----------
  if (document.body.dataset.page !== 'marcar') return;

  const STEPS = [['service', 'Serviço'], ['when', 'Dia e hora'], ['details', 'Os teus dados'], ['review', 'Confirmar']];
  const st = { step: 'service', cat: null, service: null, staff: null, date: null, slot: null, month: null, accepted: false,
    contact: { name: '', email: '', phone: '', marketing: false, remember: true, ...(S.me.get() || {}) }, result: null };
  let cfg, catalog, services;

  const staffFor = s => cfg.staff.filter(p => s.staff.includes(p.id));
  const multiStaff = () => st.service && staffFor(st.service).length > 1;
  const staffName = id => cfg.staff.find(p => p.id === id)?.name;
  const dayLabel = iso => fmt.date(new Date(iso + 'T12:00:00Z'), { timeZone: 'UTC' });
  const openWl = () => openWaitlist(cfg, services, { service_id: st.service?.id, staff_id: st.staff, date: st.date, contact: st.contact });
  const wlLink = '<p class="wl-cta"><button class="link-btn" data-waitlist>Avisa-me quando surgir uma vaga.</button></p>';

  function go(step, push = true) {
    st.step = step;
    if (push) history.pushState({ step }, '', location.pathname + location.search);
    render();
    const top = $('#main').getBoundingClientRect().top + scrollY - 10;
    if (scrollY > top) scrollTo({ top, behavior: 'smooth' });
  }
  addEventListener('popstate', e => { if (e.state?.step && !st.result) { st.step = e.state.step; render(); } });

  function renderStepper() {
    const idx = STEPS.findIndex(([k]) => k === st.step);
    $('#stepper').innerHTML = st.result ? '' : STEPS.map(([k, l], i) => `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}" ${i === idx ? 'aria-current="step"' : ''}>
      <span>Passo ${i + 1} de 4 · ${l}</span></li>`).join('');
  }
  function renderSummary() {
    const s = st.service;
    const rows = [
      ['Serviço', s ? esc(s.name) : '—'], ['Preço', s ? fmt.price(s.price_cents, s.price_type) : '—'],
      ...(multiStaff() ? [['Profissional', st.staff ? esc(staffName(st.staff)) : 'Sem preferência']] : []),
      ['Data', st.date ? dayLabel(st.date) : '—'], ['Hora', st.slot ? st.slot.time : '—']
    ];
    $('#summary').hidden = !!st.result;
    $('#summary').innerHTML = `<h3>Resumo</h3><dl>${rows.map(([k, v]) => `<div class="${v === '—' ? 'unset' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      `;
  }
  const backBtn = to => `<button class="back" data-back="${to}">${icon('left')} Voltar</button>`;
  const stateTag = k => ({ confirmed: '<span class="state ok">Confirmada</span>', pending: '<span class="state warn">Pendente</span>', unavailable: '<span class="state err">Indisponível</span>' }[k]);

  // opções de serviço, com os subgrupos (ex.: Gel, Packs) como pequenos títulos
  function optionsHtml(list, nested) {
    let last = null;
    return `<div class="opt-group">${list.map(s => {
      const g = s.group_name || '';
      const head = g !== last && g ? `<p class="opt-sub">${esc(g)}</p>` : '';
      last = g;
      return `${head}<button class="option" data-service="${s.id}" aria-pressed="${st.service?.id === s.id}">
        <strong>${esc(s.name)}</strong><span class="price">${fmt.price(s.price_cents, s.price_type)}</span>
        <span class="meta">${s.description && !s.description.startsWith('[') ? esc(s.description) : ''}</span>
      </button>`;
    }).join('')}</div>`;
  }

  const views = {
    service() {
      const cat = st.cat && catalog.find(c => c.id === st.cat);
      if (cat) return `${catalog.length > 1 ? `<button class="back" data-allcats>${icon('left')} Outras categorias</button>` : ''}
        <h2>Escolhe o tipo de ${esc(cat.name.toLowerCase())}</h2>
        ${optionsHtml(cat.services)}`;
      // 1.º: cartões por categoria (o mesmo estilo da página Serviços)
      const sparkle = '<svg class="orn" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.6 4.6 2.3 6.4 6.9 7-4.6.6-6.3 2.4-6.9 7-.6-4.6-2.3-6.4-6.9-7 4.6-.6 6.3-2.4 6.9-7z" fill="currentColor"/></svg>';
      const from = c => { const p = c.services.map(x => x.price_cents).filter(v => v != null); return p.length ? `Desde ${fmt.price(Math.min(...p), 'fixed')}` : ''; };
      return `<h2>Escolhe o serviço</h2>
        <div class="bk-cats">${catalog.map(c => `<article class="svc-cat-card compact bk-cat" data-cat-id="${c.id || ''}" data-pick-cat="${c.id || ''}">
          <header class="scc-head">${sparkle}<h3>${esc(c.name)}</h3>${c.description && !c.description.startsWith('[') ? `<p>${esc(c.description)}</p>` : ''}</header>
          <p class="scc-meta"><span>${c.services.length} ${c.services.length === 1 ? 'opção' : 'opções'}</span>${from(c) ? `<span>${from(c)}</span>` : ''}</p>
          <div class="scc-foot"><button type="button" class="btn" data-cat-btn="${c.id || ''}" aria-label="Escolher ${esc(c.name)}">Escolher</button></div>
        </article>`).join('')}</div>`;
    },
    when() {
      const list = multiStaff() ? staffFor(st.service) : [];
      return `${backBtn('service')}<h2>Escolhe o dia e a hora</h2>
        <p class="muted">${esc(st.service.name)}. Só aparecem horários disponíveis.</p>
        ${list.length ? `<div class="staff-pick" role="group" aria-label="Profissional"><span class="label-h">Com quem</span><div class="chips">
          <button class="chip" data-staff="" aria-pressed="${!st.staff}">Sem preferência</button>
          ${list.map(p => `<button class="chip" data-staff="${p.id}" aria-pressed="${st.staff === p.id}">${esc(p.name)}</button>`).join('')}</div></div>` : ''}
        <div class="when-grid"><div id="cal"></div>
        <div id="slots-wrap" class="slots-wrap"><h3 class="label-h" id="slots-title">${st.date ? dayLabel(st.date) : 'Horas disponíveis'}</h3>
          <div id="slots">${st.date ? '' : '<p class="muted small">Escolhe um dia no calendário para veres as horas.</p>'}</div></div></div>
        ${wlLink}`;
    },
    details() {
      const c = st.contact;
      const known = S.me.get();
      return `${backBtn('when')}<h2>Os teus dados</h2>
        ${known ? `<div class="notice ok" style="margin-bottom:16px">Olá, ${esc(known.name.split(' ')[0])}! Os teus dados estão guardados neste aparelho. <button type="button" class="link-btn" id="not-me">Não és tu?</button></div>`
          : '<p class="muted">Só peço o necessário para a marcação.</p>'}
        <form id="details-form" novalidate>
          <div class="field"><label for="f-name">Nome</label><input class="input" id="f-name" name="name" autocomplete="name" value="${esc(c.name)}" required><span class="err-msg" id="e-name"></span></div>
          <div class="field"><label for="f-phone">Telemóvel (WhatsApp)</label><input class="input" id="f-phone" type="tel" name="phone" autocomplete="tel" inputmode="tel" value="${esc(c.phone)}" required>
            <span class="hint">É por aqui que te envio a confirmação e o link para gerires a marcação.</span><span class="err-msg" id="e-phone"></span></div>
          <label class="check"><input type="checkbox" name="remember" ${c.remember !== false ? 'checked' : ''}>
            <span>Lembrar os meus dados neste aparelho (para a próxima marcação ser mais rápida)</span></label>
          <input class="hp" tabindex="-1" autocomplete="off" name="hp_extra" aria-hidden="true">
          <button class="btn block" style="margin-top:14px" type="submit">Continuar</button>
        </form>`;
    },
    review() {
      const s = st.service;
      return `${backBtn('details')}<h2>Rever e confirmar</h2>
        <div class="review-box"><dl>
          <dt>Serviço</dt><dd>${esc(s.name)}</dd>
          <dt>Preço</dt><dd>${fmt.price(s.price_cents, s.price_type)}${s.price_type !== 'fixed' && s.price_note ? `<div class="price-note" style="font-weight:400">${esc(s.price_note)}</div>` : ''}</dd>
          <dt>Data</dt><dd>${fmt.date(st.slot.start)}</dd>
          <dt>Hora</dt><dd>${st.slot.time}</dd>
          ${multiStaff() ? `<dt>Profissional</dt><dd>${st.staff ? esc(staffName(st.staff)) : (st.slot.staff?.length === 1 ? esc(st.slot.staff[0].name) : 'Sem preferência')}</dd>` : ''}
          <dt>Nome</dt><dd>${esc(st.contact.name)}</dd><dt>Telemóvel</dt><dd>${esc(st.contact.phone)}</dd>
        </dl><button class="link-btn small" data-back="when">Alterar dia ou hora</button></div>
        ${payChoice(s)}
        ${s.requires_approval ? `<div class="notice" style="margin-bottom:14px">Confirmo a tua marcação no prazo máximo de 24 horas. Até lá, o horário fica reservado para ti durante ${cfg.pending_hold_hours} horas.</div>` : ''}
        <div class="policy"><strong>Condições de cancelamento</strong>${String(cfg.cancellation_policy || '').split(/\n\s*\n/).map(x => `<p>${esc(x.trim())}</p>`).join('')}</div>
        <label class="check"><input type="checkbox" id="accept" ${st.accepted ? 'checked' : ''}> <span>Li e aceito as condições de cancelamento e reagendamento.</span></label>
        <div id="confirm-msg" role="alert"></div>
        <button class="btn block" id="confirm" style="margin-top:12px" ${canSend() ? '' : 'disabled'}>${s.requires_approval ? 'Enviar pedido' : 'Confirmar marcação'}</button>`;
    },
    done() {
      const b = st.result, pending = b.status === 'pending';
      const link = `${location.origin}/gerir.html?t=${encodeURIComponent(b.token)}`;
      const when = `${fmt.date(b.start, { weekday: undefined })}`;
      // sem email: a cliente envia o pedido à Adriana por WhatsApp (fica com a conversa aberta para o sinal e a confirmação)
      // texto editável no painel (Definições → Mensagens WhatsApp); linhas sem valor (ex.: sem forma de pagamento) desaparecem
      const V = { nome: st.contact.name, servico: b.service_name, data: fmt.date(b.start), hora: fmt.time(b.start), pagamento: b.payment_method ? S.PAY_OPTS[b.payment_method] : '', ref: b.ref };
      const tpl = cfg.wa_tpl_client || 'Olá Adriana! 😊\nAcabei de fazer uma marcação no site.\n\n✨ {servico}\n🗓️ {data}, às {hora}\n💳 Pagamento: {pagamento}\n👤 {nome}\n\nObrigada!';
      const waText = tpl.split('\n').filter(l => !(l.match(/\{(\w+)\}/g) || []).some(m => (m.slice(1, -1) in V) && !V[m.slice(1, -1)]))
        .map(l => l.replace(/\{(\w+)\}/g, (m, k) => k in V ? V[k] : m)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
      const wa = cfg.whatsapp ? S.waLink(cfg.whatsapp) + '?text=' + encodeURIComponent(waText) : '';
      return `<div class="success step">
        <div class="ok-icon">${icon(pending ? 'clock' : 'check')}</div>
        ${stateTag(pending ? 'pending' : 'confirmed')}
        <h2>${pending ? 'Marcação recebida — aguarda confirmação' : 'Marcação confirmada'}</h2>
        <p class="lead" style="margin:0 auto 18px">${pending
          ? `Confirmo a tua marcação por WhatsApp, no máximo em 24 horas. O horário fica reservado para ti até ${fmt.dateTime(b.hold_expires_at)}.`
          : `A tua marcação está confirmada. Espero por ti no dia ${when}, às ${fmt.time(b.start)}.`}</p>
        ${wa ? `<div class="wa-send"><p><strong>Último passo:</strong> envia-me o pedido por WhatsApp — a mensagem já vai escrita.</p>
          <a class="btn block wa-btn" href="${wa}" target="_blank" rel="noopener">${icon('phone')} Enviar por WhatsApp</a></div>` : ''}
        <div class="review-box"><dl>
          <dt>Serviço</dt><dd>${esc(b.service_name)}</dd><dt>Data</dt><dd>${fmt.dateTime(b.start)}</dd>
          <dt>Preço</dt><dd>${fmt.price(b.price_cents, b.price_type)}</dd>${cfg.staff.length > 1 ? `<dt>Profissional</dt><dd>${esc(b.staff_name)}</dd>` : ''}
          <dt>Morada</dt><dd>${esc(cfg.address_line)}, ${esc(cfg.city)}</dd><dt>Referência</dt><dd>${esc(b.ref)}</dd>
          ${b.payment_method ? `<dt>Pagamento</dt><dd>${esc(S.PAY_OPTS[b.payment_method] || '')}</dd>` : ''}
        </dl></div>
        ${S.payInfo(b, cfg)}
        <div class="notice info small" style="text-align:left">Guarda este link privado para consultares, cancelares ou reagendares (também to envio por WhatsApp):<br><a href="${link}" style="word-break:break-all">${esc(link)}</a></div>
        <div class="actions-row">
          ${pending ? '' : `<a class="btn secondary" href="${icsFile(b, cfg)}" download="marcacao-${esc(b.ref)}.ics">${icon('calendar')} Adicionar ao calendário</a>`}
          <a class="btn secondary" href="${link}">Gerir marcação</a>
        </div></div>`;
    }
  };

  // escolha da forma de pagamento do sinal (fica registada na marcação; não há pagamento automático)
  function payChoice(s) {
    if (!needPay()) return '';
    const pct = cfg.deposit_percent || 50, dep = S.depositOf(s.price_cents, cfg);
    const mb = String(cfg.mbway_number || '').trim(), iban = String(cfg.iban || '').trim();
    const opts = [
      ['mbway', 'MB WAY', mb ? `Envias o sinal para o ${esc(mb)}` : 'Envio-te o número por mensagem'],
      iban && ['transferencia', 'Transferência bancária (Multibanco)', 'Por transferência para o meu IBAN'],
      ['mao', 'Em mão', 'Pagas o valor total no dia, no espaço — sem sinal']
    ].filter(Boolean);
    return `<fieldset class="pay-choice"><legend>Como preferes pagar?</legend>
      <p>Com MB WAY${iban ? ' ou transferência' : ''}, peço um sinal de ${dep != null ? `<b>${S.eur(dep)}</b> (${pct}% do valor)` : `<b>${pct}% do valor</b> (combinamos contigo o valor)`} para reservar o dia e a hora; os restantes ${100 - pct}% pagas no final do serviço. Em mão, não há sinal: pagas tudo no dia.</p>
      <div class="pay-opts">${opts.map(([k, l, d]) => `<label class="pay-opt"><input type="radio" name="pay" value="${k}" ${st.pay === k ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>
      <p class="small" style="margin:10px 0 0">Mostro-te os dados para o pagamento a seguir.</p></fieldset>`;
  }
  const canSend = () => st.accepted && (!needPay() || !!st.pay);

  async function showSlots() {
    $('#slots-title').textContent = dayLabel(st.date);
    const list = await renderSlots($('#slots'), { serviceId: st.service.id, staffId: st.staff, date: st.date, selected: st.slot?.start,
      onPick: s => { st.slot = s; go('details'); } });
    if (matchMedia('(max-width: 960px)').matches) $('#slots-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return list;
  }

  async function render() {
    renderStepper(); renderSummary();
    const el = $('#step');
    el.className = 'step'; void el.offsetWidth;
    el.innerHTML = st.result ? views.done() : views[st.step]();
    $$('[data-back]', el).forEach(b => b.onclick = () => go(b.dataset.back));
    $$('[data-waitlist]', el).forEach(b => b.onclick = openWl);
    if (st.result) return;
    const h = el.querySelector('h2'); h?.setAttribute('tabindex', '-1');
    $('[data-allcats]', el)?.addEventListener('click', () => { st.cat = null; render(); });
    $$('[data-pick-cat]', el).forEach(card => card.onclick = e => {
      if (document.body.classList.contains('demo-editing') && !e.target.closest('[data-cat-btn]')) return;
      const c = catalog.find(x => String(x.id || '') === card.dataset.pickCat); if (!c) return;
      st.cat = c.id;
      if (c.services.length === 1) { const s = c.services[0]; if (st.service?.id !== s.id) { st.slot = null; st.date = null; st.staff = null; } st.service = s; return go('when'); }
      render();
    });
    if (st.step === 'service') $$('[data-service]', el).forEach(b => b.onclick = () => {
      const s = services.find(x => x.id === +b.dataset.service);
      if (st.service?.id !== s.id) { st.slot = null; st.date = null; st.staff = null; }
      st.service = s; go('when');
    });
    if (st.step === 'when') {
      const cal = () => renderCalendar($('#cal'), { serviceId: st.service.id, staffId: st.staff, month: st.month || (st.date && st.date.slice(0, 8) + '01'), selected: st.date,
        onMonth: m => st.month = m,
        onPick: d => { if (d !== st.date) st.slot = null; st.date = d; $$('#cal .day').forEach(x => x.setAttribute('aria-pressed', x.dataset.date === d)); showSlots(); } });
      cal();
      if (st.date) renderSlots($('#slots'), { serviceId: st.service.id, staffId: st.staff, date: st.date, selected: st.slot?.start, onPick: s => { st.slot = s; go('details'); } });
      $$('[data-staff]', el).forEach(b => b.onclick = () => {
        st.staff = b.dataset.staff ? +b.dataset.staff : null; st.slot = null; st.date = null;
        $$('[data-staff]', el).forEach(x => x.setAttribute('aria-pressed', x === b));
        $('#slots').innerHTML = '<p class="muted small">Escolhe um dia no calendário para veres as horas.</p>'; $('#slots-title').textContent = 'Horas disponíveis';
        renderSummary(); cal();
      });
    }
    $('#not-me', el)?.addEventListener('click', () => { S.me.clear(); st.contact = { name: '', email: '', phone: '', marketing: false, remember: true }; render(); });
    if (st.step === 'details') $('#details-form').onsubmit = e => {
      e.preventDefault();
      const f = e.target; let ok = true;
      const checks = { name: v => v.trim().length >= 2 || 'Indica o teu nome.',
        phone: v => v.replace(/\D/g, '').length >= 9 || 'Indica um telefone válido (ex.: 912 345 678).' };
      for (const [k, fn] of Object.entries(checks)) {
        const r = fn(f[k].value); f[k].setAttribute('aria-invalid', r !== true); $('#e-' + k).textContent = r === true ? '' : r;
        if (r !== true && ok) { f[k].focus(); ok = false; }
      }
      st.contact = { name: f.name.value.trim(), email: '', phone: f.phone.value.trim(), marketing: false, website: f.hp_extra.value, remember: f.remember.checked };
      if (ok) go('review');
    };
    if (st.step === 'review') {
      const btn = $('#confirm');
      $('#accept').onchange = e => { st.accepted = e.target.checked; btn.disabled = !canSend(); };
      $$('input[name=pay]', el).forEach(r => r.onchange = () => { st.pay = r.value; btn.disabled = !canSend(); });
      btn.onclick = async () => {
        const label = btn.textContent;
        btn.disabled = true; btn.textContent = 'A confirmar…';
        try {
          st.result = await api('/bookings', { method: 'POST', body: { service_id: st.service.id, staff_id: st.staff, start: st.slot.start, name: st.contact.name,
            phone: st.contact.phone, marketing_consent: false, accept_policy: true, website: st.contact.website, payment_method: needPay() ? st.pay : undefined } });
          if (st.contact.remember) S.me.set(st.contact); else S.me.clear();
          history.replaceState({ step: 'done' }, '', location.pathname);
          render(); scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
          btn.textContent = label; btn.disabled = false;
          const alts = err.data?.alternatives || [];
          if (err.status === 409) {
            $('#confirm-msg').innerHTML = `<div class="notice err" style="margin-top:14px">${stateTag('unavailable')} <strong>Este horário já não está disponível.</strong> ${esc(err.message)}
              ${alts.length ? `<p style="margin:10px 0 4px">Horários próximos:</p><div class="alt-list">${alts.map(a =>
                `<button class="chip" data-alt="${a.start}">${fmt.date(a.start, { weekday: 'short' })} · ${a.time}</button>`).join('')}</div>` : ''}
              <p style="margin:8px 0 0"><button class="link-btn" data-waitlist>Avisa-me quando surgir uma vaga.</button></p></div>`;
            $$('[data-alt]').forEach(b => b.onclick = () => {
              const a = alts.find(x => x.start === +b.dataset.alt);
              st.date = a.date; st.slot = { start: a.start, time: a.time, staff: [] };
              render();
            });
            $$('#confirm-msg [data-waitlist]').forEach(b => b.onclick = openWl);
          } else if (err.status === 422 && err.data?.errors) {
            go('details');
            setTimeout(() => Object.entries(err.data.errors).forEach(([k, v]) => { const e = $('#e-' + k); if (e) e.textContent = v; }), 50);
          } else $('#confirm-msg').innerHTML = `<div class="notice err" style="margin-top:14px">${esc(err.message)}</div>`;
        }
      };
    }
    if (document.activeElement === document.body || !el.contains(document.activeElement)) h?.focus({ preventScroll: true });
  }

  // sem servidor ligado: as marcações online ficam fechadas e a cliente marca por mensagem ou telefone
  function offlineBooking(c) {
    const wa = c.whatsapp ? S.waContact(c) : '';
    $('#stepper').innerHTML = ''; $('#summary').hidden = true;
    $('#step').innerHTML = `<div class="offline-box"><h2>Marcações online em breve</h2>
      <p>As marcações pelo site vão abrir dentro de pouco tempo. Até lá, marca comigo por WhatsApp ou por telefone — respondo o mais depressa possível.</p>
      <div class="actions-row">${wa ? `<a class="btn" href="${wa}" target="_blank" rel="noopener">${icon('phone')} Marcar por WhatsApp</a>` : ''}
        ${c.phone ? `<a class="btn secondary" href="${S.telLink(c.phone)}">Ligar ${esc(c.phone)}</a>` : ''}</div>
      <p class="small muted">Vê os serviços e preços em <a href="/servicos.html">Serviços</a>.</p></div>`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    [cfg, catalog] = await Promise.all([S.config(), api('/services')]);
    if (S.isOffline()) return offlineBooking(cfg);
    // só os serviços que se marcam online (os extras são acrescentados no atendimento)
    catalog = [...catalog.categories, ...(catalog.uncategorized.length ? [{ name: 'Outros', services: catalog.uncategorized }] : [])]
      .map(c => ({ ...c, services: c.services.filter(s => s.bookable !== 0) })).filter(c => c.services.length);
    services = catalog.flatMap(c => c.services);
    // ?categoria=ID (botão "Marcar" de um cartão): mostra só os tipos desse cartão; se houver só um, avança
    const preCat = catalog.find(c => c.id === +new URLSearchParams(location.search).get('categoria'));
    if (preCat) { st.cat = preCat.id; if (preCat.services.length === 1) { st.service = preCat.services[0]; st.step = 'when'; } }
    const pre = +new URLSearchParams(location.search).get('servico');
    const s = services.find(x => x.id === pre);
    if (s) { st.service = s; st.step = 'when'; }
    history.replaceState({ step: st.step }, '', location.pathname + location.search);
    render();
  });
})();
