/* Páginas privadas da cliente (acesso por link com token): gerir marcação, avaliar, aceitar vaga da lista de espera. */
(function () {
  'use strict';
  const S = window.Site;
  const { api, icon, esc, $, $$, fmt } = S;
  const key = 'tk:' + location.pathname;
  let token = new URLSearchParams(location.search).get('t') || '';
  // o token sai do URL visível (fica na sessão do separador) para não ficar exposto em partilhas de ecrã
  try { if (token) sessionStorage.setItem(key, token); else token = sessionStorage.getItem(key) || ''; } catch { /* sem armazenamento */ }
  if (new URLSearchParams(location.search).get('t')) history.replaceState(null, '', location.pathname);
  const app = () => $('#app');
  const T = encodeURIComponent(token);
  const STATUS = { pending: ['Pendente de confirmação', 'warn'], confirmed: ['Confirmada', 'ok'], completed: ['Concluída', 'gold'], cancelled: ['Cancelada', 'err'], no_show: ['Falta', 'err'] };
  const fail = msg => app().innerHTML = `<div class="empty"><h2 style="font-size:1.6rem">Link indisponível</h2><p>${esc(msg)}</p><a class="btn" href="/marcar.html">Fazer nova marcação</a></div>`;

  // ---------- gerir marcação ----------
  async function gerir() {
    const cfg = await S.config();
    let b;
    try { b = await api(`/manage/${T}`); } catch (e) { return fail(e.message); }
    const [label, cls] = STATUS[b.status];
    app().innerHTML = `<h1 style="font-size:clamp(2rem,5vw,2.8rem)">Olá, ${esc(b.customer_name.split(' ')[0])}</h1>
      <div class="review-box"><p style="margin:0 0 14px"><span class="tag ${cls}">${label}</span></p><dl>
        <dt>Referência</dt><dd>${esc(b.ref)}</dd><dt>Serviço</dt><dd>${esc(b.service_name)}</dd><dt>Data</dt><dd>${fmt.dateTime(b.start)}</dd>
        <dt>Preço</dt><dd>${fmt.price(b.price_cents, b.price_type)}</dd>
        ${cfg.staff.length > 1 ? `<dt>Profissional</dt><dd>${esc(b.staff_name)}</dd>` : ''}
        <dt>Morada</dt><dd>${esc(cfg.address_line)}, ${esc(cfg.postal_code)} ${esc(cfg.city)}</dd>
        ${b.payment_method ? `<dt>Pagamento</dt><dd>${esc(S.PAY_OPTS[b.payment_method] || '')}</dd>` : ''}
      </dl></div>
      ${['pending', 'confirmed'].includes(b.status) && b.start > Date.now() ? S.payInfo(b, cfg) : ''}
      ${b.proposed ? `<div class="card" style="margin-bottom:16px;border-color:#e7c88f"><h3 style="margin-top:0">Proposta de novo horário</h3>
          <p>O horário que pediste não estava disponível. Proponho-te <strong>${fmt.dateTime(b.start)}</strong> — fica reservado para ti até ${fmt.dateTime(b.hold_expires_at)}.</p>
          <div class="actions-row"><button class="btn" id="p-yes">Aceitar este horário</button><button class="btn secondary" id="p-no">Não me dá jeito</button></div><div id="p-msg" role="alert"></div></div>`
        : b.status === 'pending' ? `<div class="notice" style="margin-bottom:16px">A tua marcação aguarda confirmação. O horário está reservado para ti até ${fmt.dateTime(b.hold_expires_at)}.</div>` : ''}
      ${b.can_confirm_attendance ? (b.attendance_confirmed ? '<div class="notice ok" style="margin-bottom:16px">Presença confirmada. Até breve!</div>'
        : '<div class="card" style="margin-bottom:16px"><p style="margin:0 0 12px">Vens à marcação? Confirma a tua presença — ajuda-me a organizar a agenda.</p><button class="btn" id="attend">Confirmo a minha presença</button></div>') : ''}
      ${b.status === 'cancelled' && b.cancel_reason ? `<div class="notice info" style="margin-bottom:16px">${esc(b.cancel_reason)}</div>` : ''}
      <div class="policy"><strong>Política de cancelamento</strong>${String(b.policy || '').split(/\n\s*\n/).map(x => `<p>${esc(x.trim())}</p>`).join('')}</div>
      <div class="actions-row">
        ${b.can_reschedule ? '<button class="btn" id="resched">Reagendar</button>' : ''}
        ${b.can_cancel ? '<button class="btn secondary" id="cancel">Cancelar marcação</button>' : ''}
        ${b.status === 'confirmed' ? `<a class="btn secondary" href="${window.Booking.icsFile(b, cfg)}" download="marcacao-${esc(b.ref)}.ics">${icon('calendar')} Adicionar ao calendário</a>` : ''}
      </div>
      ${['pending', 'confirmed'].includes(b.status) && !b.can_cancel && b.start > Date.now()
        ? `<p class="notice info" style="margin-top:16px">Já passou o prazo para alterar online (${b.cancel_limit_hours} h antes). Para alterações, contacta-me: <a href="${S.telLink(cfg.phone)}">${esc(cfg.phone)}</a>.</p>` : ''}
      <div id="panel" style="margin-top:22px"></div>`;
    const answer = accept => async e => {
      e.target.disabled = true;
      try { await api(`/manage/${T}/proposal`, { method: 'POST', body: { accept } }); await gerir(); $('#panel').innerHTML = `<div class="notice ok">${accept ? 'Marcação confirmada. Até breve!' : 'Recusaste o horário proposto. Podes escolher outro em Marcações.'}</div>`; }
      catch (err) { $('#p-msg').innerHTML = `<div class="notice err" style="margin-top:12px">${esc(err.message)}</div>`; e.target.disabled = false; }
    };
    $('#p-yes')?.addEventListener('click', answer(true));
    $('#p-no')?.addEventListener('click', answer(false));
    $('#attend')?.addEventListener('click', async e => {
      e.target.disabled = true;
      try { await api(`/manage/${T}/attendance`, { method: 'POST', body: {} }); await gerir(); } catch (err) { e.target.disabled = false; e.target.insertAdjacentHTML('afterend', `<div class="notice err" style="margin-top:12px">${esc(err.message)}</div>`); }
    });
    $('#cancel')?.addEventListener('click', () => {
      $('#panel').innerHTML = `<div class="card"><h3>Cancelar a marcação?</h3><div class="field"><label for="reason">Motivo (opcional)</label>
        <input class="input" id="reason" maxlength="200"></div><div class="actions-row"><button class="btn" id="do-cancel">Confirmar cancelamento</button>
        <button class="btn secondary" id="keep">Manter marcação</button></div><div id="msg" role="alert"></div></div>`;
      $('#keep').onclick = () => $('#panel').innerHTML = '';
      $('#do-cancel').onclick = async e => {
        e.target.disabled = true;
        try { await api(`/manage/${T}/cancel`, { method: 'POST', body: { reason: $('#reason').value } }); location.hash = ''; await gerir(); $('#panel').innerHTML = '<div class="notice ok">A marcação foi cancelada.</div>'; }
        catch (err) { $('#msg').innerHTML = `<div class="notice err" style="margin-top:12px">${esc(err.message)}</div>`; e.target.disabled = false; }
      };
    });
    $('#resched')?.addEventListener('click', () => {
      let date = null, slot = null;
      $('#panel').innerHTML = `<div class="card"><h3>Escolhe o novo dia e hora</h3><div id="cal"></div><div id="slots" style="margin-top:16px"></div><div id="msg" role="alert"></div></div>`;
      const pickSlot = s => {
        slot = s;
        $$('#slots .slot').forEach(x => x.setAttribute('aria-pressed', +x.dataset.start === s.start));
        $('#msg').innerHTML = `<div class="review-box" style="margin-top:16px"><p style="margin:0 0 12px">Mudar para <strong>${fmt.dateTime(s.start)}</strong>?</p>
          <button class="btn" id="do-resched">Confirmar novo horário</button></div>`;
        $('#do-resched').onclick = async e => {
          e.target.disabled = true;
          try { await api(`/manage/${T}/reschedule`, { method: 'POST', body: { start: slot.start } }); await gerir(); $('#panel').innerHTML = '<div class="notice ok">A marcação foi reagendada.</div>'; }
          catch (err) {
            const alts = err.data?.alternatives || [];
            $('#msg').innerHTML = `<div class="notice err" style="margin-top:12px">${esc(err.message)}${alts.length ? `<div class="alt-list">${alts.map(a => `<button class="chip" data-alt="${a.start}">${fmt.date(a.start, { weekday: 'short' })} · ${a.time}</button>`).join('')}</div>` : ''}</div>`;
            $$('[data-alt]').forEach(x => x.onclick = () => pickSlot(alts.find(a => a.start === +x.dataset.alt)));
          }
        };
      };
      const cal = () => window.Booking.renderCalendar($('#cal'), { serviceId: b.service_id, staffId: null, selected: date, onPick: d => {
        date = d; $$('#cal .day').forEach(x => x.setAttribute('aria-pressed', x.dataset.date === d));
        window.Booking.renderSlots($('#slots'), { serviceId: b.service_id, staffId: null, date: d, onPick: pickSlot });
      } });
      cal();
    });
  }

  // ---------- avaliar ----------
  async function avaliar() {
    let ctx;
    try { ctx = await api(`/review/${T}`); } catch (e) { return fail(e.message); }
    if (ctx.already) return app().innerHTML = '<div class="empty"><h2 style="font-size:1.6rem">Obrigada!</h2><p>Este atendimento já foi avaliado.</p><a class="btn secondary" href="/">Voltar ao site</a></div>';
    let rating = 0;
    app().innerHTML = `<h1 style="font-size:clamp(2rem,5vw,2.8rem)">Como correu a tua visita?</h1>
      <p class="lead">${esc(ctx.service_name)} · ${fmt.date(ctx.start)}</p>
      <form id="rf" class="card" novalidate>
        <fieldset style="border:0;padding:0;margin:0 0 18px"><legend class="label" style="margin-bottom:10px">Classificação</legend>
          <div class="stars" id="rate" role="radiogroup" style="gap:6px">${[1, 2, 3, 4, 5].map(i =>
            `<button type="button" role="radio" aria-checked="false" data-v="${i}" aria-label="${i} estrela${i > 1 ? 's' : ''}" style="background:none;border:0;padding:4px;cursor:pointer;color:var(--gold)">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg></button>`).join('')}</div>
        </fieldset>
        <div class="field"><label for="comment">Comentário (opcional)</label><textarea class="input" id="comment" maxlength="1000" placeholder="O que gostaste? O que podemos melhorar?"></textarea>
          <span class="hint">Por favor, não incluas dados pessoais (telefones, emails, moradas).</span></div>
        <div class="field"><label for="author">Nome a mostrar</label><input class="input" id="author" maxlength="40" value="${esc(ctx.suggested_name)}"></div>
        <p class="small muted">A avaliação é publicada como "verificada", associada a este atendimento. Publico opiniões positivas e negativas.</p>
        <div id="msg" role="alert"></div>
        <button class="btn block" type="submit">Enviar avaliação</button>
      </form>`;
    const paint = () => $$('#rate button').forEach(btn => { const on = +btn.dataset.v <= rating; btn.setAttribute('aria-checked', +btn.dataset.v === rating); btn.querySelector('path').setAttribute('fill', on ? 'currentColor' : 'none'); });
    $$('#rate button').forEach(btn => btn.onclick = () => { rating = +btn.dataset.v; paint(); });
    $('#rf').onsubmit = async e => {
      e.preventDefault();
      if (!rating) return $('#msg').innerHTML = '<div class="notice err" style="margin-bottom:12px">Escolhe de 1 a 5 estrelas.</div>';
      try {
        const r = await api(`/review/${T}`, { method: 'POST', body: { rating, comment: $('#comment').value, author_name: $('#author').value } });
        app().innerHTML = `<div class="empty"><h2 style="font-size:1.6rem">Obrigada pela tua avaliação!</h2><p>${r.status === 'pending'
          ? 'Como o texto parece ter um link ou contacto, vai ser revisto antes de ser publicado.' : 'Obrigada por partilhares a tua opinião.'}</p><a class="btn secondary" href="/">Voltar ao site</a></div>`;
      } catch (err) { $('#msg').innerHTML = `<div class="notice err" style="margin-bottom:12px">${esc(err.message)}</div>`; }
    };
  }

  // ---------- oferta da lista de espera ----------
  async function oferta() {
    let o;
    try { o = await api(`/offer/${T}`); } catch (e) { return fail(e.message); }
    if (!o.valid) return fail(o.status === 'booked' ? 'Já reservaste esta vaga. Consulta a mensagem de confirmação.' : 'O prazo desta oferta terminou e a vaga foi libertada.');
    app().innerHTML = `<h1 style="font-size:clamp(2rem,5vw,2.8rem)">Surgiu uma vaga para ti</h1>
      <div class="review-box"><dl><dt>Serviço</dt><dd>${esc(o.service_name)}</dd><dt>Data</dt><dd>${fmt.dateTime(o.start)}</dd>
        <dt>Preço</dt><dd>${fmt.price(o.price_cents, o.price_type)}</dd></dl></div>
      <div class="notice">Esta vaga está reservada só para ti até <strong>${fmt.dateTime(o.expires)}</strong>.</div>
      <div class="policy"><strong>Política de cancelamento</strong>${String(o.policy || '').split(/\n\s*\n/).map(x => `<p>${esc(x.trim())}</p>`).join('')}</div>
      <label class="check"><input type="checkbox" id="accept"> <span>Li e aceito a política de cancelamento e reagendamento.</span></label>
      <div id="msg" role="alert"></div>
      <div class="actions-row"><button class="btn" id="yes" disabled>Reservar esta vaga</button><button class="btn secondary" id="no">Não me serve</button></div>`;
    $('#accept').onchange = e => $('#yes').disabled = !e.target.checked;
    $('#yes').onclick = async e => {
      e.target.disabled = true;
      try {
        const b = await api(`/offer/${T}/accept`, { method: 'POST', body: { accept_policy: true } });
        const link = b.token ? `/gerir.html?t=${encodeURIComponent(b.token)}` : null;
        app().innerHTML = `<div class="success"><div class="ok-icon">${icon('check')}</div><h2>${b.status === 'pending' ? 'Pedido pendente de confirmação' : 'Marcação confirmada'}</h2>
          <p class="lead">${esc(b.service_name)} · ${fmt.dateTime(b.start)}</p>${link ? `<a class="btn" href="${link}">Gerir marcação</a>` : ''}</div>`;
      } catch (err) { $('#msg').innerHTML = `<div class="notice err" style="margin:12px 0">${esc(err.message)}</div>`; }
    };
    $('#no').onclick = async () => { await api(`/offer/${T}/decline`, { method: 'POST', body: {} }); app().innerHTML = '<div class="empty">Obrigada pela resposta. Continuas na lista de espera e aviso-te se surgir outra vaga compatível.</div>'; };
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!token) return fail('Este link está incompleto. Usa o link que recebeste por WhatsApp.');
    ({ gerir, avaliar, oferta })[document.body.dataset.page]?.().catch(e => fail(e.message));
  });
})();
