/* DEMONSTRAÇÃO — simula a API do servidor dentro do browser (dados guardados só neste browser).
   Reproduz as mesmas regras do servidor real (src/availability.js e src/core.js), de forma simplificada. */
(function () {
  'use strict';
  const TZ = 'Europe/Lisbon';
  const KEY = 'demo-estetica-v8';
  const H = 3600000, D = 86400000;

  // ---------- datas em Lisboa ----------
  const pf = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = ms => { const o = {}; for (const p of pf.formatToParts(ms)) o[p.type] = p.value; return o; };
  const offset = ms => { const p = parts(ms); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; };
  function lisbon(date, time = '00:00') {
    const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
    const g = Date.UTC(y, m - 1, d, h, mi); let r = g - offset(g); const o2 = offset(r); if (g - o2 !== r) r = g - o2; return r;
  }
  const isoDay = ms => { const p = parts(ms); return `${p.year}-${p.month}-${p.day}`; };
  const minOf = ms => { const p = parts(ms); return +p.hour * 60 + +p.minute; };
  const hhmm = ms => { const p = parts(ms); return `${p.hour}:${p.minute}`; };
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const wd = iso => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7 + 1;
  const hm = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  const today = () => isoDay(Date.now());
  const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ref = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPH[b % ALPH.length]).join('');
  const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

  class E extends Error { constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; } }

  // ---------- estado inicial ----------
  const DEFAULTS = {
    business_name: 'ADRIANA MARTINS', hero_title: 'Um momento para cuidar de ti.',
    hero_subtitle: 'Manicure, pedicure, lash lifting e depilação a cera e a laser, em Massamá. Marca o teu próximo momento de bem-estar.',
    legal_id: '[IDENTIFICAÇÃO DO NEGÓCIO — nome legal e NIF]', access_info: '',
    booking_policy: 'As marcações são feitas com antecedência, aqui no site, escolhendo um dos dias e horários disponíveis no calendário de Marcações. Só os horários que aparecem no site estão abertos para marcação; se não encontrares o horário que procuras, podes entrar na lista de espera.\n\nDepois de enviares o pedido, o horário fica reservado para ti enquanto aguardas a minha confirmação. Confirmo todas as marcações no prazo máximo de 24 horas e envio-te a resposta por WhatsApp. Se precisar de propor outro horário, também te aviso por WhatsApp e podes aceitar ou recusar a proposta.\n\nPara reservar o dia e a hora com pagamento por MB WAY ou transferência bancária, peço um sinal de 50% do valor do serviço, indicando a referência da marcação. Os restantes 50% são pagos no final do serviço. Se preferires pagar em mão, escolhe essa opção ao marcar: nesse caso não há sinal e pagas o valor total no dia, no espaço.\n\nPeço que chegues com 5 minutos de antecedência. Se te atrasares, avisa-me: posso ter de encurtar o serviço ou remarcar, para não atrasar as clientes seguintes.',
    address_line: 'Avenida Américo Ferrer Lopes Loja 11C', postal_code: '2745-715', city: 'Massamá', phone: '939 907 962', email: 'amartinsestetica@icloud.com', whatsapp: '939 907 962', instagram: 'https://www.instagram.com/estetica_adrianamartins/',
    map_embed_url: '', map_link_url: '', professional_name: 'Adriana Martins',
    about_text: 'Sou a Adriana Martins, esteticista. O meu objetivo é ajudar cada cliente a sentir-se bem consigo, através de cuidados que valorizam a sua beleza natural. Acredito num atendimento próximo e atento, onde há espaço para ouvir as suas necessidades e tornar cada visita num momento de cuidado pessoal.',
    training: [], experience_text: '',
    experience_steps: [
      { title: 'Conversa inicial', text: 'Começo com alguns minutos para perceber o que procuras e se há algo a ter em conta.' },
      { title: 'O atendimento', text: 'Explico cada passo antes de começar e ajusto o que for preciso para te sentires confortável.' },
      { title: 'Antes de sair', text: 'Partilho cuidados simples para os dias seguintes, quando se aplicam.' }],
    testimonials: ["Lash Lifting | Mais uma vez obrigada! Gostei imenso de como as minhas pestanas ficaram 💗 Nunca as tinha visto tão curvadas e tão bonitas!! Obrigada 🫶 Ficaram incríveis!", "Lash Lifting | Adri, as minhas pestanas com o lifting ficaram lindíssimas! Mt obrigada. Até breve", "Unhas | Grande transformação!!! Belo!!!", "Unhas | Com a melhor, tudo se torna tão simples ❤️", "Unhas | Incrível Adriana, parabéns 👏👏", "Unhas | Maravilhosass"],
    logo_image: '/assets/img/logo-am.webp', profile_image: '', facebook: '', tiktok: '',
    space_title: 'Um espaço pensado para ti', space_text: 'Em Massamá, preparei um espaço calmo e acolhedor, em tons claros de bege e madeira, onde cada detalhe foi escolhido para te sentires à vontade. Tem uma zona de atendimento confortável, um cantinho de espera para relaxares e material profissional, tratado com todo o cuidado de higiene. O atendimento é só por marcação, para que cada visita seja tranquila e sem pressas.', space_image: '/assets/img/espaco-logo.webp', space_points: ['Atendimento só por marcação, sem esperas', 'Ambiente calmo, luminoso e reservado', 'Material profissional e cuidado com a higiene em cada atendimento', 'Na Avenida Américo Ferrer Lopes, em Massamá'],
    hero_image: '/assets/img/hero-adriana.webp', about_image: '/assets/img/adriana.webp', gallery: ['/assets/img/espaco-logo.webp', '/assets/img/espaco-atendimento.webp', '/assets/img/espaco-detalhe.webp', '/assets/img/espaco-espera.webp'],
    video_url: 'https://www.instagram.com/reel/DaVIOYGsrlj/', video_file: '/assets/video/espaco.mp4', video_image: '/assets/img/video-capa.webp',
    timezone: 'Europe/Lisbon', slot_step_min: 60, buffer_min: 0, min_notice_hours: 24, max_advance_days: 60, cancel_limit_hours: 48, reschedule_limit_hours: 48,
    cancellation_policy: 'Os cancelamentos e reagendamentos têm de ser feitos com pelo menos 48 horas de antecedência em relação à hora marcada. Podes fazê-lo através do link da tua marcação (que também te envio por WhatsApp), ou contactando-me diretamente.\n\nA menos de 48 horas da marcação já não é possível cancelar nem reagendar pelo site. Nesse caso, contacta-me o mais cedo possível por telefone.\n\nSe cancelares com pelo menos 48 horas de antecedência, devolvo o sinal ou guardo-o para uma nova marcação, como preferires. A menos de 48 horas, ou em caso de falta, o sinal não é devolvido.\n\nFaltar sem avisar impede outra cliente de usar esse horário. Em caso de faltas repetidas sem aviso, posso deixar de aceitar marcações online.',
    pending_hold_hours: 24, waitlist_offer_minutes: 120, waitlist_max_offers: 3, reminder_enabled: true, reminder_hours: 24, review_invite_delay_hours: 0,
    register_enabled: true, register_title: 'Regista-te',
    register_intro: 'Deixa os teus dados uma vez: nas próximas marcações fica tudo mais rápido e, no teu aniversário, recebes uma mensagem minha.',
    birthday_message: 'Olá {nome}, muitos parabéns! 🎂\n\nHoje o dia é todo teu e merece ser celebrado com tudo aquilo que te faz feliz. Obrigada por me deixares fazer parte dos teus momentos de cuidado — é sempre um gosto enorme receber-te.\n\nQue este novo ano te traga saúde, alegria e muitos motivos para sorrir.\n\nUm beijinho grande,\n{profissional}', birthday_email_enabled: false,
    deposit_enabled: true, deposit_percent: 50, mbway_number: '939 907 962', iban: '', iban_name: '',
    payment_note: 'Os restantes 50% são pagos no final do serviço.',
    wa_tpl_pending: 'Olá {nome}! 😊 Obrigada pela tua marcação.\n\n✨ {servico}\n🗓️ {data}, às {hora}\n\n{sinal_texto}\n\nPodes acompanhar a tua marcação aqui: {link}\n\nUm beijinho,\n{profissional}',
    wa_tpl_confirmed: 'Olá {nome}! A tua marcação está confirmada. 🤍\n\n✨ {servico}\n🗓️ {data}, às {hora}\n📍 {morada}\n\n{sinal_texto}\n\nPeço que chegues 5 minutos antes. Se precisares de alterar, podes fazê-lo até 48 horas antes, aqui: {link}\n\nAté breve!\n{profissional}',
    wa_tpl_proposed: 'Olá {nome}! 😊 O horário que escolheste já não está disponível, mas posso receber-te:\n\n✨ {servico}\n🗓️ {data}, às {hora}\n\nPodes aceitar ou recusar aqui: {link}\n\nUm beijinho,\n{profissional}',
    wa_tpl_cancelled: 'Olá {nome}! A tua marcação foi cancelada.\n\n✨ {servico}\n🗓️ {data}, às {hora}\n\nSe quiseres, escolhe outro horário aqui: {site}\n\nUm beijinho,\n{profissional}',
    wa_tpl_review: 'Olá {nome}! 🤍 Obrigada pela tua visita.\n\nSe tiveres um minuto, adorava saber a tua opinião — ajuda-me muito: {link_avaliacao}\n\nUm beijinho,\n{profissional}',
    wa_tpl_reminder: 'Olá {nome}! 😊 Passo só para te lembrar da tua marcação de amanhã.\n\n✨ {servico}\n🗓️ {data}, às {hora}\n📍 {morada}\n\nSe puderes, confirma a tua presença aqui: {link}\n\nAté amanhã!\n{profissional}', reminder_wa_hour: 21, wa_tpl_client_contact: 'Olá Adriana! 😊 Gostava de fazer uma marcação.', wa_tpl_client: 'Olá Adriana! 😊\nAcabei de fazer uma marcação no site.\n\n✨ {servico}\n🗓️ {data}, às {hora}\n💳 Pagamento: {pagamento}\n👤 {nome}\n\nObrigada!',
    arrival_note: 'Chega 5 minutos antes. Se tiveres alguma dúvida sobre a preparação, contacta-me antes da visita.',
    faq: [
      { q: 'Como faço uma marcação?', a: 'Em Marcações, escolhe o serviço e um dos dias e horários disponíveis e envia o pedido com o teu nome e telemóvel. Confirmo a marcação no prazo máximo de 24 horas e envio-te a confirmação por WhatsApp, com um link para gerires a marcação.' },
      { q: 'Posso cancelar ou reagendar?', a: 'Sim, até 48 horas antes da hora marcada, pelo link privado da tua marcação (que também te envio por WhatsApp). A menos de 48 horas, contacta-me diretamente por telefone.' },
      { q: 'O que significa "Pedido pendente de confirmação"?', a: 'Todas as marcações são confirmadas por mim. O horário fica reservado para ti e respondo no prazo máximo de 24 horas; envio-te uma mensagem por WhatsApp assim que o pedido for aceite ou se precisar de propor outro horário.' },
      { q: 'Como me preparo para a visita?', a: 'Chega com alguns minutos de antecedência. Se o serviço exigir algum cuidado prévio, indico na descrição do serviço ou entro em contacto contigo.' },
      { q: 'E se o horário que quero estiver ocupado?', a: 'Aparecem as alternativas mais próximas e podes entrar na lista de espera. Se surgir uma vaga compatível, envio-te um aviso com prazo para reservares.' }],
    privacy_controller: '[RESPONSÁVEL PELO TRATAMENTO DE DADOS — nome/empresa e NIF]', public_base_url: 'https://[o-seu-site].pt',
    whatsapp_enabled: false, sms_enabled: false, hours_confirmed: false
  };

  let S, dirty = false;
  // fotografias do site embutidas na demonstração (o caminho real fica guardado)
  const demoImg = v => (window.DEMO_IMG && window.DEMO_IMG[v]) || v;
  function newService(id, category_id, name, featured, sort) {
    return { id, category_id, group_name: '', bookable: 1, name, description: '[Descrição curta.]', price_cents: null, price_type: 'fixed', price_note: '', requires_approval: 1, resource_id: null,
      featured, active: 1, sort, image_url: '', included: '', preparation: '' };
  }

  // ---------- dados de DEMONSTRAÇÃO (clientes fictícias, identificadas como "Demo") ----------
  function demoData(s) {
    const svc = n => s.services.find(x => x.name === n && x.active) || s.services.find(x => x.bookable !== 0);
    const nowDay = today();
    // horários abertos à mão: dias úteis das últimas 2 semanas e das próximas 3
    for (let i = -14; i <= 21; i++) {
      const d = addDays(nowDay, i); if (wd(d) === 7 || wd(d) === 1) continue;
      if (!s.daySlots[d]) s.daySlots[d] = wd(d) === 6 ? ['10:00', '11:00', '12:00'] : ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    }
    const people = [['Ana Demo', '910000101', 'ana.demo@exemplo.pt'], ['Beatriz Demo', '910000102', 'beatriz.demo@exemplo.pt'], ['Carla Demo', '910000103', ''],
      ['Diana Demo', '910000104', 'diana.demo@exemplo.pt'], ['Eva Demo', '910000105', 'eva.demo@exemplo.pt'], ['Filipa Demo', '910000106', ''],
      ['Gabriela Demo', '910000107', 'gabriela.demo@exemplo.pt'], ['Helena Demo', '910000108', 'helena.demo@exemplo.pt'],
      ['Ana Demo', '910000999', ''] /* mesmo nome, outra pessoa: não é duplicado */, ['A. Demo (ficha repetida)', '910000101', ''] /* mesmo telefone: possível duplicado */];
    const cust = people.map(([name, phone, email]) => { const c = { id: ++s.seq, name, phone, email: email || null, notes: '', marketing_consent: 0, created_at: Date.now() - 40 * D, demo: true }; s.customers.push(c); return c; });
    const mk = (ci, dayOffset, time, svcName, status, extra = {}) => {
      let d = addDays(nowDay, dayOffset); while (wd(d) === 7 || wd(d) === 1) d = addDays(d, dayOffset < 0 ? -1 : 1); // só dias abertos
      const sv = svc(svcName); const start = lisbon(d, time);
      if (s.bookings.some(b => ACTIVE(b) && b.staff_id === 1 && b.start_at === start)) return null;
      const b = { id: ++s.seq, ref: ref(), customer_id: cust[ci].id, service_id: sv.id, staff_id: 1, resource_id: null, service_name: sv.name, price_cents: sv.price_cents, price_type: sv.price_type,
        start_at: start, status, hold_expires_at: status === 'pending' ? Date.now() + 20 * H : null, token: rnd(), review_token: null, source: extra.source || 'online', cancel_reason: extra.reason || '',
        internal_notes: extra.notes || '', created_at: Date.now() - 6 * D, updated_at: Date.now(), reminder_sent_at: null, review_invited_at: status === 'completed' ? Date.now() : null,
        proposed: 0, attendance_confirmed_at: extra.attend ? Date.now() - H : null, attendance_source: extra.attend ? 'cliente' : '', demo: true };
      s.bookings.push(b);
      ev(b, extra.source === 'admin' ? 'painel' : 'cliente', extra.source === 'admin' ? 'Marcação criada no painel' : status === 'pending' ? 'Pedido enviado pelo site' : 'Marcação feita pelo site', `${sv.name} · ${dmyhm(start)}`, b.created_at);
      if (status === 'completed') ev(b, 'painel', 'Estado: Concluída', 'Antes: Confirmada', start + H);
      if (status === 'no_show') ev(b, 'painel', 'Estado: Não compareceu', 'Antes: Confirmada', start + H);
      if (status === 'cancelled') ev(b, 'cliente', 'Cancelada', extra.reason || 'Cancelada pela cliente', start - 2 * D);
      return b;
    };
    const pay = (b, method, part = 1) => { if (!b || b.price_cents == null) return; const p = { id: ++s.seq, booking_id: b.id, amount_cents: Math.round(b.price_cents * part), method, status: 'pago', paid_at: b.start_at + H, note: '', request_key: 'demo-' + b.id, void_reason: '', voided_at: null, created_at: b.start_at + H };
      s.payments.push(p); ev(b, 'painel', 'Pagamento registado', `${eurTxt(p.amount_cents)} · ${METHODS[method]}`, p.paid_at); };
    // passado: concluídas (pagas e por pagar), falta, cancelamento
    pay(mk(0, -9, '10:00', 'Primeira Aplicação (sobre unha natural)', 'completed'), 'mbway');
    pay(mk(1, -8, '11:00', 'Moderna', 'completed'), 'numerario');
    pay(mk(2, -6, '15:00', 'Manutenção', 'completed'), 'cartao');
    mk(3, -5, '16:00', 'Simples', 'completed', { notes: 'Prefere tons nude.' }); // concluída e ainda por pagar
    mk(4, -4, '10:00', 'Manutenção', 'no_show');
    mk(5, -3, '12:00', 'Moderna', 'cancelled', { reason: 'Cancelada pela cliente' });
    pay(mk(6, -2, '14:00', 'Primeira Aplicação (sobre unha natural)', 'completed'), 'transferencia');
    pay(mk(0, -1, '17:00', 'Manutenção', 'completed'), 'mbway', 0.5);
    // hoje e próximos dias
    const t = s.daySlots[nowDay] ? 0 : 1;
    mk(1, t, '10:00', 'Manutenção', 'confirmed', { attend: true });
    mk(7, t, '11:00', 'Moderna', 'confirmed', { source: 'admin', notes: 'Marcou por telefone.' });
    mk(2, t, '15:00', 'Primeira Aplicação (sobre unha natural)', 'confirmed');
    mk(3, t + 1, '14:00', 'Lash Lifting', 'pending');
    mk(4, t + 2, '11:00', 'Simples', 'confirmed');
    mk(8, t + 2, '16:00', 'Moderna', 'pending');
    mk(6, t + 3, '10:00', 'Manutenção', 'confirmed');
    // aniversários de exemplo (hoje, daqui a 3 dias e daqui a 12 dias) e registos pelo formulário
    const md = n => addDays(nowDay, n).slice(5);
    [[0, 0, 1, 'instagram'], [1, 3, 1, 'instagram'], [3, 12, 0, 'facebook'], [6, 20, 1, 'balcao']].forEach(([ci, n, ok, origin]) => {
      Object.assign(cust[ci], { birthday: md(n), birthday_consent: ok, birthday_consent_at: ok ? Date.now() - 30 * D : null, source: 'registo:' + origin, registered_at: Date.now() - (30 - n) * D });
    });
    // lista de espera com vaga compatível (fim de tarde)
    s.waitlist.push({ id: ++s.seq, service_id: svc('Manutenção').id, staff_id: null, name: 'Inês Demo', email: '', phone: '910000120', days: [], periods: ['fim_tarde'], date_from: null, date_to: null,
      notes: 'Só pode depois do trabalho.', source: 'painel', status: 'active', offers_count: 0, skipped: [], created_at: Date.now() - 2 * D, contacted_at: null, demo: true });
  }
  function seed() {
    const s = { settings: { ...DEFAULTS }, seq: 100, hours: [], staff: [{ id: 1, name: 'Adriana Martins', role: 'Esteticista', bio: '', photo_url: '', active: 1, sort: 0 }],
      staffHours: [], staffServices: [], resources: [], blocks: [], customers: [], bookings: [], reviews: [], waitlist: [], notifications: [], payments: [], events: [], loggedIn: false,
      daySlots: {}, manualHours: true, v9: true };
    s.categories = []; s.services = [];
    (window.DEMO_CATALOGO || []).forEach((c, i) => {
      s.categories.push({ id: i + 1, name: c.name, description: c.description || '', note: c.note || '', sort: i + 1, image_url: '' });
      c.services.forEach(x => s.services.push({ ...newService(s.services.length + 1, i + 1, x.name, x.featured ? 1 : 0, s.services.length),
        group_name: x.group || '', bookable: x.bookable === 0 ? 0 : 1, price_cents: x.price ?? null, price_type: x.type || 'fixed', description: x.desc || '' }));
    });
    s.staffServices = s.services.map(x => [1, x.id]);
    s.catalogSeen = s.categories.map(c => c.name);
    S = s; demoData(s); s.v10 = true;
    return s;
  }

  const METHODS = { numerario: 'Numerário', mbway: 'MB WAY', multibanco: 'Multibanco', cartao: 'Cartão', transferencia: 'Transferência', outro: 'Outro' };
  const STATUS_LABEL = { pending: 'Pendente', confirmed: 'Confirmada', completed: 'Concluída', cancelled: 'Cancelada', no_show: 'Não compareceu' };
  const eurTxt = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
  const dmyhm = ms => { const d = isoDay(ms); return `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${hhmm(ms)}`; };
  function ev(b, actor, action, details = '', at = Date.now()) { (S.events ||= []).push({ id: ++S.seq, booking_id: b.id, at, actor, action, details }); }

  // ---------- disponibilidade: cada marcação ocupa um horário (sem duração) ----------
  const svcById = i => S.services.find(x => x.id === +i);
  const staffFor = (sid, staffId) => S.staff.filter(st => st.active && S.staffServices.some(([a, b]) => a === st.id && b === sid) && (!staffId || st.id === +staffId)).sort((a, b) => a.sort - b.sort || a.id - b.id);
  const work = (staffId, w) => { const own = S.staffHours.filter(h => h.staff_id === staffId); return (own.length ? own : S.hours).filter(h => h.weekday === w).map(h => [hm(h.start), hm(h.end)]); };
  const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  function openMinutes(staffId, date) {
    const man = (S.daySlots[date] || []).map(hm); if (man.length) return man;
    const out = []; for (const [a, b] of work(staffId, wd(date))) for (let m = a; m < b; m += S.settings.slot_step_min) out.push(m);
    return [...new Set(out)].sort((x, y) => x - y);
  }
  const ACTIVE = b => b.status === 'confirmed' || b.status === 'pending';
  function expire() {
    for (const b of S.bookings) if (b.status === 'pending' && b.hold_expires_at && b.hold_expires_at < Date.now()) {
      b.status = 'cancelled'; b.cancel_reason = 'Pedido expirou sem confirmação'; b.proposed = 0; ev(b, 'sistema', 'Pedido expirou', 'Sem confirmação dentro do prazo — horário libertado'); notify('expired', b);
    }
  }
  const blockAt = (staffId, start) => S.blocks.find(x => (!x.staff_id || x.staff_id === staffId) && x.start_at <= start && start < x.end_at);
  function conflicts(staffId, resourceId, start, o = {}) {
    for (const b of S.bookings) {
      if (!ACTIVE(b) || b.id === o.ignoreBookingId || b.start_at !== start) continue;
      if (b.staff_id === staffId) return 'booking';
      if (resourceId && b.resource_id === resourceId) return 'resource';
    }
    if (blockAt(staffId, start)) return 'block';
    if (S.waitlist.some(w => w.status === 'offered' && w.offer_expires_at > Date.now() && w.offer_staff_id === staffId && w.offer_start_at === start && w.id !== o.ignoreOfferId)) return 'offer';
    return null;
  }
  function rules(staffId, start, admin) {
    if (admin) return null;
    if (start < Date.now() + S.settings.min_notice_hours * H) return 'min_notice';
    if (isoDay(start) > addDays(today(), S.settings.max_advance_days)) return 'max_advance';
    return openMinutes(staffId, isoDay(start)).includes(minOf(start)) ? null : 'outside_hours';
  }
  const isFree = (staffId, svc, start, o = {}) => rules(staffId, start, o.admin) || conflicts(staffId, svc.resource_id, start, o);
  function slots(svc, staffId, date, o = {}) {
    const map = new Map();
    for (const st of staffFor(svc.id, staffId)) for (const m of openMinutes(st.id, date)) {
      const start = lisbon(date, fmt(m));
      if (minOf(start) !== m || isFree(st.id, svc, start, o)) continue;
      if (!map.has(start)) map.set(start, []); map.get(start).push(st.id);
    }
    return [...map].sort((x, y) => x[0] - y[0]).map(([start, staff]) => ({ start, time: hhmm(start), staff }));
  }
  function board(date, staffId) {
    const out = [];
    for (const st of S.staff.filter(x => x.active && (!staffId || x.id === +staffId))) for (const m of openMinutes(st.id, date)) {
      const start = lisbon(date, fmt(m)); if (minOf(start) !== m) continue;
      const b = S.bookings.find(k => ACTIVE(k) && k.staff_id === st.id && k.start_at === start), bl = !b && blockAt(st.id, start);
      out.push({ start, time: fmt(m), staff_id: st.id, staff_name: st.name, state: b ? 'ocupado' : bl ? 'bloqueado' : start < Date.now() ? 'passado' : 'livre',
        booking_id: b ? b.id : null, block: bl ? { id: bl.id, type: bl.type, reason: bl.reason } : null });
    }
    return out.sort((a, b) => a.start - b.start || a.staff_id - b.staff_id);
  }
  function alternatives(svc, staffId, start) {
    const res = [];
    for (let i = 0; i < 14 && res.length < 6; i++) {
      const d = addDays(isoDay(start), i); const sl = slots(svc, staffId, d);
      if (!i) sl.sort((a, b) => Math.abs(a.start - start) - Math.abs(b.start - start));
      for (const x of sl) { if (res.length >= 6) break; res.push({ start: x.start, time: x.time, date: d }); }
    }
    return res;
  }
  const REASONS = { booking: 'Este horário acabou de ser reservado.', resource: 'A sala ou equipamento necessário já está ocupado nesse horário.', block: 'Este horário está bloqueado (pausa, férias ou encerramento).',
    offer: 'Este horário está reservado temporariamente para outra cliente.', min_notice: 'Este horário já não respeita a antecedência mínima para marcar online.', max_advance: 'Ainda não é possível marcar para esta data.', outside_hours: 'Este horário está fora do horário de atendimento.' };

  // ---------- notificações: na demonstração nada é enviado (fica registado como "não enviado") ----------
  const LINKS = { confirmed: 'g', pending: 'g', approved: 'g', rescheduled: 'g', reminder: 'g', proposed: 'g', review: 'r' };
  function notify(kind, b) {
    const c = S.customers.find(x => x.id === b.customer_id) || {};
    const link = LINKS[kind] === 'g' ? `/gerir.html?t=${b.token}` : LINKS[kind] === 'r' ? `/avaliar.html?t=${b.review_token}` : '';
    const status = c.email ? 'not_configured' : 'skipped';
    S.notifications.unshift({ id: id(), booking_id: b.id, channel: 'email', kind, recipient: c.email || '(cliente sem email)', subject: kind, status, error: 'Demonstração: nada é enviado.', demo_link: link, created_at: Date.now() });
    return status;
  }

  // ---------- validação, clientes e marcações ----------
  const digits = p => String(p || '').replace(/\D/g, '').replace(/^351(?=\d{9}$)/, '');
  function contact(b, optionalEmail) {
    const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase(), phone = clean(b.phone, 30), errors = {};
    if (name.length < 2) errors.name = optionalEmail ? 'Indica o nome da cliente.' : 'Indica o teu nome.';
    if (!(optionalEmail && !email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Indica um email válido.';
    if (digits(phone).length < 9) errors.phone = 'Indica um telefone válido (ex.: 912 345 678).';
    if (Object.keys(errors).length) throw new E(422, 'Verifica os dados indicados.', { errors });
    return { name, email: email || null, phone };
  }
  const matches = c => S.customers.filter(x => (digits(c.phone).length >= 9 && digits(x.phone) === digits(c.phone)) || (c.email && x.email && x.email === c.email)).map(x => ({ id: x.id, name: x.name, email: x.email, phone: x.phone }));
  function upsert(c, marketing) {
    let x = (c.email && S.customers.find(k => k.email === c.email)) || S.customers.find(k => digits(k.phone).slice(-9) && digits(k.phone).slice(-9) === digits(c.phone).slice(-9));
    if (x) { x.name = c.name; x.phone = c.phone; if (marketing) x.marketing_consent = 1; return x.id; }
    x = { id: id(), ...c, marketing_consent: marketing ? 1 : 0, notes: '', created_at: Date.now() }; S.customers.push(x); return x.id;
  }
  function create(inp, { admin = false, offerId = null } = {}) {
    const svc = svcById(inp.service_id); if (!svc || (!svc.active && !admin)) throw new E(404, 'Serviço não encontrado.');
    if (!admin && svc.bookable === 0) throw new E(422, 'Este serviço é um extra e é acrescentado durante o atendimento — escolhe o serviço principal.');
    const start = +inp.start; if (!Number.isFinite(start)) throw new E(422, 'Horário inválido.');
    if (!admin && !inp.accept_policy) throw new E(422, 'É necessário aceitar a política de cancelamento.');
    let existing = null, c = null;
    if (admin && inp.customer_id) { existing = S.customers.find(x => x.id === +inp.customer_id); if (!existing) throw new E(404, 'Cliente não encontrada.'); }
    else {
      c = contact(inp, true);
      if (admin && !inp.force_new) { const m = matches(c); if (m.length) throw new E(409, 'Já existe uma ficha com este telefone ou email. Escolhe se é a mesma cliente.', { code: 'POSSIBLE_DUPLICATE', matches: m }); }
      if (admin && c.email && S.customers.some(x => x.email === c.email)) throw new E(409, 'Este email já pertence a outra ficha de cliente. Usa essa ficha ou deixa o email em branco.');
    }
    expire();
    const cands = staffFor(svc.id, inp.staff_id); if (!cands.length) throw new E(422, 'Profissional indisponível para este serviço.');
    let chosen, reason;
    for (const st of cands) { reason = isFree(st.id, svc, start, { admin, ignoreOfferId: offerId }); if (!reason) { chosen = st; break; } }
    if (!chosen) throw new E(409, REASONS[reason] || 'Horário indisponível.', { code: 'SLOT_TAKEN', alternatives: admin ? [] : alternatives(svc, inp.staff_id, start) });
    const custId = existing ? existing.id : admin ? (S.customers.push({ id: id(), ...c, marketing_consent: 0, notes: '', created_at: Date.now() }), S.seq) : upsert(c, inp.marketing_consent === true);
    const status = admin && inp.status === 'pending' ? 'pending' : (!admin && svc.requires_approval ? 'pending' : 'confirmed');
    const b = { id: id(), ref: ref(), customer_id: custId, service_id: svc.id, staff_id: chosen.id, resource_id: svc.resource_id, service_name: svc.name, price_cents: svc.price_cents, price_type: svc.price_type,
      start_at: start, status, hold_expires_at: status === 'pending' && !admin ? Math.min(Date.now() + S.settings.pending_hold_hours * H, Math.max(start, Date.now() + H)) : null, token: rnd(), review_token: null,
      source: admin ? 'admin' : 'online', cancel_reason: '', internal_notes: clean(inp.internal_notes, 1000), created_at: Date.now(), updated_at: Date.now(), reminder_sent_at: null, review_invited_at: null,
      proposed: 0, attendance_confirmed_at: null, attendance_source: '', payment_method: payPref(inp.payment_method), deposit_cents: payPref(inp.payment_method) === 'mao' ? null : depositFor(svc.price_cents) };
    S.bookings.push(b);
    ev(b, admin ? 'painel' : 'cliente', admin ? 'Marcação criada no painel' : status === 'pending' ? 'Pedido enviado pelo site' : 'Marcação feita pelo site', `${svc.name} · ${dmyhm(start)}${admin && inp.channel ? ' · via ' + clean(inp.channel, 30) : ''}`);
    if (!(admin && inp.notify === false)) notify(status === 'pending' ? 'pending' : 'confirmed', b);
    return { ...pub(b), id: admin ? b.id : undefined, token: b.token };
  }
  const staffName = i => S.staff.find(s => s.id === i)?.name;
  const PAY_PREFS = { mbway: 'MB WAY', transferencia: 'Transferência bancária', mao: 'Em mão (no espaço)' };
  const payPref = v => PAY_PREFS[v] && !(v === 'transferencia' && !String(S.settings.iban || '').trim()) ? v : '';
  const depositFor = price => S.settings.deposit_enabled && price != null && price > 0 ? Math.round(price * (+S.settings.deposit_percent || 50) / 100) : null;
  function pub(b) {
    const left = (b.start_at - Date.now()) / H, act = ACTIVE(b) && b.start_at > Date.now(), c = S.customers.find(x => x.id === b.customer_id) || {};
    return { ref: b.ref, status: b.status, service_id: b.service_id, service_name: b.service_name, price_cents: b.price_cents, price_type: b.price_type,
      start: b.start_at, staff_id: b.staff_id, staff_name: staffName(b.staff_id), hold_expires_at: b.hold_expires_at, customer_name: c.name, cancel_reason: b.cancel_reason,
      proposed: !!b.proposed && b.status === 'pending', attendance_confirmed: !!b.attendance_confirmed_at,
      can_cancel: act && (b.status === 'pending' || left >= S.settings.cancel_limit_hours), can_reschedule: act && !b.proposed && (svcById(b.service_id)?.active !== 0) && (b.status === 'pending' || left >= S.settings.reschedule_limit_hours), can_confirm_attendance: b.status === 'confirmed' && b.start_at > Date.now(),
      cancel_limit_hours: S.settings.cancel_limit_hours, reschedule_limit_hours: S.settings.reschedule_limit_hours, policy: S.settings.cancellation_policy,
      payment_method: b.payment_method || '', deposit_cents: b.deposit_cents ?? null, paid_cents: paidOf(b.id) };
  }
  const byToken = t => { const b = S.bookings.find(x => x.token === t); if (!b) throw new E(404, 'Link inválido ou expirado.'); return b; };
  const bk = i => { const b = S.bookings.find(x => x.id === +i); if (!b) throw new E(404, 'Marcação não encontrada.'); return b; };
  function cancel(b, admin, reason) {
    if (!ACTIVE(b)) throw new E(409, 'Esta marcação já não está ativa.');
    if (!admin && !pub(b).can_cancel) throw new E(403, `O cancelamento online só é possível até ${S.settings.cancel_limit_hours} horas antes. Contacta-me diretamente.`);
    b.status = 'cancelled'; b.proposed = 0; b.cancel_reason = clean(reason, 300) || (admin ? 'Cancelada pelo espaço' : 'Cancelada pela cliente');
    ev(b, admin ? 'painel' : 'cliente', 'Cancelada', `${b.cancel_reason} · horário ${dmyhm(b.start_at)} libertado`); notify('cancelled', b); waitlist();
  }
  function move(b, start, staffId, admin, notifyClient = true) {
    if (!admin && !pub(b).can_reschedule) throw new E(403, `O reagendamento online só é possível até ${S.settings.reschedule_limit_hours} horas antes.`);
    if (!ACTIVE(b)) throw new E(409, 'Esta marcação já não está ativa.');
    start = +start; if (admin && start < Date.now() - H) throw new E(422, 'Escolhe um horário futuro.');
    const svc = svcById(b.service_id) || { resource_id: b.resource_id };
    const cands = staffId ? [{ id: +staffId }] : staffFor(b.service_id).sort((x, y) => (y.id === b.staff_id) - (x.id === b.staff_id));
    let ch, r; for (const c of cands) { r = isFree(c.id, svc, start, { admin, ignoreBookingId: b.id }); if (!r) { ch = c; break; } }
    if (!ch) throw new E(409, REASONS[r] || 'Horário indisponível.', { code: 'SLOT_TAKEN', alternatives: admin ? [] : alternatives(svc, null, start) });
    const before = b.start_at;
    b.start_at = start; b.staff_id = ch.id; b.reminder_sent_at = null; b.attendance_confirmed_at = null; b.updated_at = Date.now();
    if (b.status === 'pending') b.hold_expires_at = Math.min(b.hold_expires_at || start, start); else b.hold_expires_at = null;
    ev(b, admin ? 'painel' : 'cliente', 'Reagendada', `${dmyhm(before)} → ${dmyhm(start)}`);
    if (notifyClient) notify('rescheduled', b); waitlist();
  }
  function approve(b) {
    expire();
    if (b.status !== 'pending') throw new E(409, 'Este pedido já não está pendente (pode ter expirado ou sido cancelado).');
    if (b.start_at < Date.now()) throw new E(409, 'A hora deste pedido já passou. Sugere outro horário ou recusa o pedido.');
    const why = conflicts(b.staff_id, b.resource_id, b.start_at, { ignoreBookingId: b.id });
    if (why) throw new E(409, why === 'block' ? 'Este horário foi bloqueado entretanto. Sugere outro horário à cliente.' : REASONS[why], { code: 'SLOT_TAKEN' });
    b.status = 'confirmed'; b.hold_expires_at = null; b.proposed = 0; ev(b, 'painel', 'Pedido aprovado', `Confirmada para ${dmyhm(b.start_at)}`); notify('approved', b);
  }
  function setStatus(b, status, reason) {
    if (!STATUS_LABEL[status]) throw new E(422, 'Estado inválido.');
    if (status === 'cancelled') return cancel(b, true, reason);
    if (status === 'confirmed' && b.status === 'pending') return approve(b);
    if (['completed', 'no_show'].includes(status)) {
      if (b.start_at > Date.now()) throw new E(422, 'Só é possível concluir ou assinalar falta depois da hora da marcação.');
      if (!['confirmed', 'completed', 'no_show'].includes(b.status)) throw new E(409, 'Só marcações confirmadas podem ser concluídas ou assinaladas como falta.');
    }
    if (b.status === status) return;
    ev(b, 'painel', `Estado: ${STATUS_LABEL[status]}`, `Antes: ${STATUS_LABEL[b.status]}`);
    b.status = status; if (status !== 'pending') b.hold_expires_at = null; b.updated_at = Date.now(); jobs();
  }
  const paidOf = bid => S.payments.filter(p => p.booking_id === bid && p.status === 'pago').reduce((a, p) => a + p.amount_cents, 0);
  function addPayment(b, body) {
    const key = clean(body.request_key, 80) || null;
    if (key) { const ex = S.payments.find(p => p.request_key === key); if (ex) return [{ ...ex, duplicate: true }, 200]; }
    if (!['pending', 'confirmed', 'completed', 'no_show'].includes(b.status)) throw new E(409, 'Não é possível registar pagamentos de uma marcação cancelada.');
    const amount = Math.round(+String(body.amount_eur ?? '').replace(',', '.') * 100);
    if (!(amount > 0)) throw new E(422, 'Indica um valor superior a 0 €.');
    if (!METHODS[body.method]) throw new E(422, 'Escolhe o método de pagamento.');
    const day = /^\d{4}-\d\d-\d\d$/.test(body.paid_on || '') ? body.paid_on : today();
    if (day > today()) throw new E(422, 'Data de pagamento inválida.');
    const paid = paidOf(b.id);
    if (b.price_cents != null && b.price_type === 'fixed' && paid + amount > b.price_cents && !body.allow_over)
      throw new E(409, `Com este valor, o total pago (${eurTxt(paid + amount)}) ultrapassa o preço acordado (${eurTxt(b.price_cents)}).${paid ? ' Já está registado ' + eurTxt(paid) + '.' : ''}`, { code: 'OVERPAID' });
    const p = { id: id(), booking_id: b.id, amount_cents: amount, method: body.method, status: 'pago', paid_at: day === today() ? Date.now() : lisbon(day, '12:00'), note: clean(body.note, 300), request_key: key, void_reason: '', voided_at: null, created_at: Date.now() };
    S.payments.push(p); ev(b, 'painel', 'Pagamento registado', `${eurTxt(amount)} · ${METHODS[body.method]}`);
    return [p, 201];
  }

  // ---------- lista de espera: sem email configurado, só sinaliza vagas compatíveis à esteticista ----------
  const PER = { manha: [0, 780], tarde: [780, 1020], fim_tarde: [1020, 1440] };
  const prefsOk = (w, start) => (!w.days.length || w.days.includes(wd(isoDay(start)))) && (!w.periods.length || w.periods.some(p => minOf(start) >= PER[p][0] && minOf(start) < PER[p][1]))
    && (!w.date_from || isoDay(start) >= w.date_from) && (!w.date_to || isoDay(start) <= w.date_to) && !(w.skipped || []).includes(start);
  function wlMatches(w, limit = 3) {
    const svc = svcById(w.service_id); if (!svc || !svc.active) return [];
    const out = [];
    for (let i = 0; i <= 45 && out.length < limit; i++) {
      const d = addDays(w.date_from && w.date_from > today() ? w.date_from : today(), i); if (w.date_to && d > w.date_to) break;
      for (const sl of slots(svc, w.staff_id, d, { admin: false })) if (sl.start > Date.now() && prefsOk(w, sl.start)) { out.push({ start: sl.start, time: sl.time, date: d }); if (out.length >= limit) break; }
    }
    return out;
  }
  function waitlist() { /* na demonstração o email não está configurado: não há ofertas automáticas */ return 0; }

  // ---------- tarefas automáticas ----------
  function jobs() {
    expire();
    for (const b of S.bookings) {
      if (S.settings.reminder_enabled && b.status === 'confirmed' && !b.reminder_sent_at && b.start_at > Date.now() && b.start_at <= Date.now() + S.settings.reminder_hours * H && b.created_at < b.start_at - 2 * H) { b.reminder_sent_at = Date.now(); notify('reminder', b); }
      if (b.status === 'completed' && !b.review_invited_at && b.start_at <= Date.now() - S.settings.review_invite_delay_hours * H) { b.review_invited_at = Date.now(); b.review_token = rnd(); notify('review', b); }
    }
  }

  try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; }
  // atualiza estados guardados por versões anteriores da demonstração (mantém textos, serviços e horários)
  function migrate() {
    if (!S.textEdits) S.textEdits = {};
    if (!S.settings.instagram) S.settings.instagram = DEFAULTS.instagram;
    const ph = v => !v || /^\[/.test(String(v).trim());
    for (const k of ['professional_name', 'about_text', 'about_image']) if (ph(S.settings[k])) S.settings[k] = DEFAULTS[k];
    if (!(S.settings.gallery || []).filter(Boolean).length) S.settings.gallery = DEFAULTS.gallery.slice();
    if (!('video_url' in S.settings)) S.settings.video_url = DEFAULTS.video_url;
    if (!S.settings.video_file || /^blob:/.test(S.settings.video_file)) { S.settings.video_file = DEFAULTS.video_file; S.settings.video_image = DEFAULTS.video_image; }
    if (!S.daySlots) S.daySlots = {};
    for (const k of ['timezone', 'reminder_enabled']) if (!(k in S.settings)) S.settings[k] = DEFAULTS[k];
    if (!S.catalogSeen) S.catalogSeen = S.categories.map(c => c.name);
    (window.DEMO_CATALOGO || []).filter(c => ['Depilação a Cera'].includes(c.name)).forEach(c => {
      if (S.catalogSeen.includes(c.name)) return; S.catalogSeen.push(c.name);
      if (S.categories.some(x => x.name.toLowerCase() === c.name.toLowerCase())) return;
      const cid = Math.max(0, ...S.categories.map(x => x.id)) + 1;
      S.categories.push({ id: cid, name: c.name, description: c.description || '', note: c.note || '', sort: Math.max(0, ...S.categories.map(x => x.sort)) + 1, image_url: '' });
      c.services.forEach(x => { const sid = Math.max(0, ...S.services.map(y => y.id)) + 1;
        S.services.push({ ...newService(sid, cid, x.name, x.featured ? 1 : 0, S.services.length), group_name: x.group || '', bookable: x.bookable === 0 ? 0 : 1, price_cents: x.price ?? null, price_type: x.type || 'fixed', description: x.desc || '' });
        S.staffServices.push([1, sid]); });
      dirty = true;
    });
    if (!S.manualHours) { S.hours = []; S.manualHours = true; dirty = true; }
    // v9: dashboard de gestão — sem duração, pagamentos, histórico e novos dados de demonstração
    if (!S.v9) {
      S.v9 = true; S.payments = []; S.events = [];
      S.services.forEach(x => { delete x.duration_min; });
      const oldIds = new Set(S.customers.filter(c => /^Cliente Exemplo/.test(c.name)).map(c => c.id));
      S.bookings = S.bookings.filter(b => !oldIds.has(b.customer_id)).map(b => { const { duration_min, end_at, ...rest } = b; return { proposed: 0, ...rest }; });
      S.customers = S.customers.filter(c => !oldIds.has(c.id));
      if (S.staff[0] && /^\[/.test(S.staff[0].name)) S.staff[0].name = 'Adriana Martins';
      S.waitlist = (S.waitlist || []).filter(w => !/exemplo/.test(w.email || ''));
      if (!S.customers.some(c => c.demo)) demoData(S); dirty = true;
    }
  }
  function migrate10() {
    if (S.v10) return; S.v10 = true;
    for (const k of ['register_enabled', 'register_title', 'register_intro', 'birthday_message', 'birthday_email_enabled']) if (!(k in S.settings)) S.settings[k] = DEFAULTS[k];
    const nowDay = today(), md = n => addDays(nowDay, n).slice(5);
    const demoC = S.customers.filter(c => c.demo);
    [[0, 0, 1, 'instagram'], [1, 3, 1, 'instagram'], [3, 12, 0, 'facebook'], [6, 20, 1, 'balcao']].forEach(([ci, n, ok, origin]) => {
      const c = demoC[ci]; if (c && !c.birthday) Object.assign(c, { birthday: md(n), birthday_consent: ok, source: 'registo:' + origin, registered_at: Date.now() - (30 - n) * D });
    });
    dirty = true;
  }
  function migrate11() {
    if (S.v11) return; S.v11 = true;
    const st = S.settings, m = String(st.postal_code || '').match(/^(\d{4}-\d{3})\s*-?\s*(.*)$/);
    if (m) { st.postal_code = m[1]; if (m[2]) st.city = m[2]; }
    if (/^\[/.test(st.postal_code || '')) st.postal_code = '2745-715';
    if (!st.city || /^\[LOCALID/i.test(st.city)) st.city = 'Massamá';
    for (const k of Object.keys(S.textEdits || {})) if (/Código postal e localidade/.test(S.textEdits[k].original || '')) delete S.textEdits[k];
    dirty = true;
  }
  function migrate12() {
    if (S.v12) return; S.v12 = true;
    const st = S.settings;
    if (!st.business_name || /^\[/.test(st.business_name)) st.business_name = DEFAULTS.business_name;
    if (/^Manicure, pedicure e pestanas\./.test(st.hero_subtitle || '')) st.hero_subtitle = DEFAULTS.hero_subtitle;
    for (const k of ['booking_policy', 'cancellation_policy']) st[k] = String(st[k] || '').replace(/\s*\[CONFIRMAR POLÍTICA\]/g, '');
    dirty = true;
  }
  // v13: novas políticas (confirmação em 24 h, cancelamento até 48 h) e todas as marcações confirmadas pela Adriana
  function migrate13() {
    if (S.v13) return; S.v13 = true;
    const st = S.settings;
    for (const k of ['booking_policy', 'cancellation_policy', 'faq']) st[k] = JSON.parse(JSON.stringify(DEFAULTS[k]));
    st.min_notice_hours = 24; st.cancel_limit_hours = 48; st.reschedule_limit_hours = 48;
    (S.services || []).forEach(x => { x.requires_approval = 1; });
    dirty = true;
  }

  // ---------- histórico de DEMONSTRAÇÃO (meses anteriores): atendimentos pagos, despesas e avaliações ----------
  function demoHistory(s) {
    s.expenses ||= []; s.meta ||= {};
    const cust = s.customers.filter(c => c.demo).slice(0, 8); if (!cust.length) return;
    const svcs = s.services.filter(x => x.active && x.bookable !== 0 && x.price_cents != null); if (!svcs.length) return;
    const t = today(), methods = ['mbway', 'numerario', 'cartao', 'transferencia'], times = ['10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
    let k = 0;
    for (let back = 160; back >= 11; back -= 3) {
      let d = addDays(t, -back); if (wd(d) === 7 || wd(d) === 1) continue;
      const start = lisbon(d, times[k % times.length]);
      if (s.bookings.some(b => b.start_at === start)) { k++; continue; }
      const sv = svcs[(k * 7) % svcs.length], c = cust[(k * 3) % cust.length];
      const b = { id: ++s.seq, ref: ref(), customer_id: c.id, service_id: sv.id, staff_id: 1, resource_id: null, service_name: sv.name, price_cents: sv.price_cents, price_type: sv.price_type,
        start_at: start, status: 'completed', hold_expires_at: null, token: rnd(), review_token: null, source: k % 3 ? 'online' : 'admin', cancel_reason: '', internal_notes: '',
        created_at: start - 5 * D, updated_at: start + H, reminder_sent_at: null, review_invited_at: start + 2 * H, proposed: 0, attendance_confirmed_at: null, attendance_source: '', demo: true };
      s.bookings.push(b);
      (s.events ||= []).push({ id: ++s.seq, booking_id: b.id, at: b.created_at, actor: b.source === 'admin' ? 'painel' : 'cliente', action: b.source === 'admin' ? 'Marcação criada no painel' : 'Pedido enviado pelo site', details: sv.name });
      s.events.push({ id: ++s.seq, booking_id: b.id, at: start + H, actor: 'painel', action: 'Estado: Concluída', details: 'Antes: Confirmada' });
      s.payments.push({ id: ++s.seq, booking_id: b.id, amount_cents: sv.price_cents, method: methods[k % methods.length], status: 'pago', paid_at: start + H, note: '', request_key: 'demo-h-' + b.id, void_reason: '', voided_at: null, created_at: start + H });
      k++;
    }
    // despesas mensais de exemplo (6 meses)
    let mo = t.slice(0, 7);
    for (let i = 0; i < 6; i++) {
      [['produtos', 3800 + i * 300, 'Vernizes, géis e descartáveis (demo)', '05'], ['servicos', 2600, 'Luz e internet (demo)', '12'], ['marketing', i % 2 ? 1500 : 0, 'Publicidade no Instagram (demo)', '20']]
        .forEach(([cat, v, txt, dd]) => { const day = mo + '-' + dd; if (v && day <= t) s.expenses.push({ id: ++s.seq, spent_on: day, amount_cents: v, category: cat, description: txt, created_at: Date.now(), demo: true }); });
      const [y, m] = mo.split('-').map(Number); mo = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    }
    // avaliações de exemplo (identificadas como demonstração)
    if (!(s.reviews || []).length) {
      const done = s.bookings.filter(b => b.status === 'completed' && b.demo).slice(-6);
      [[5, 'Atendimento muito cuidadoso e espaço super acolhedor. (exemplo de demonstração)'], [5, 'Adorei o resultado, voltarei de certeza. (exemplo de demonstração)'], [4, 'Muito simpática e pontual. (exemplo de demonstração)']]
        .forEach(([rating, comment], i) => { const b = done[i]; if (!b) return; const c = s.customers.find(x => x.id === b.customer_id);
          (s.reviews ||= []).push({ id: ++s.seq, booking_id: b.id, rating, comment, author_name: c.name.split(' ')[0] + ' (demo)', service_name: b.service_name, verified: 1, status: i === 2 ? 'pending' : 'published', hidden_reason: '', reply: '', created_at: b.start_at + 3 * H, demo: true }); });
    }
  }
  function migrate27() { if (S.v27) return; S.v27 = true; const OLD = {'wa_tpl_proposed': 'Olá {nome}! O horário que pediste não está disponível, mas posso receber-te {data} às {hora} ({servico}).\\n\\nPodes aceitar ou recusar aqui: {link}\\n\\n{profissional}', 'wa_tpl_cancelled': 'Olá {nome}! A tua marcação de {data} às {hora} ({servico}) foi cancelada.\\n\\nSe quiseres, escolhe outro horário em {site}\\n\\n{profissional}', 'wa_tpl_review': 'Olá {nome}! Obrigada pela tua visita. 🤍 Se tiveres um minuto, adorava saber a tua opinião: {link_avaliacao}\\n\\n{profissional}'}; for (const k in OLD) if (S.settings[k] === OLD[k].replace(/\\n/g, '\n')) S.settings[k] = DEFAULTS[k]; if (S.settings.wa_tpl_client_contact == null) S.settings.wa_tpl_client_contact = DEFAULTS.wa_tpl_client_contact; dirty = true; }
  function migrate26() { if (S.v26) return; S.v26 = true; if (S.settings.wa_tpl_reminder === 'Olá {nome}! Lembro-te da tua marcação de {data} às {hora} ({servico}).\n\nConfirma a tua presença aqui, por favor: {link}\n\nAté já!\n{profissional}') S.settings.wa_tpl_reminder = DEFAULTS.wa_tpl_reminder; if (S.settings.reminder_wa_hour == null) S.settings.reminder_wa_hour = 21; if (S.settings.wa_tpl_client == null) S.settings.wa_tpl_client = DEFAULTS.wa_tpl_client; dirty = true; }
  function remindersTomorrow() {
    const t = addDays(today(), 1), [a, z] = dayRange(t), hour = Number(S.settings.reminder_wa_hour) || 21;
    const list = S.bookings.filter(b => b.status === 'confirmed' && b.start_at >= a && b.start_at <= z).map(b => ({ ...SEL(b), wa_reminder: waMessages(b).reminder, wa_reminder_sent: (S.events || []).some(e => e.booking_id === b.id && e.action === 'WhatsApp aberto' && e.details === 'lembrete') })).sort((x, y) => x.start_at - y.start_at);
    return { date: t, hour, due: new Date().getHours() >= hour, list, unsent: list.filter(x => !x.wa_reminder_sent).length };
  }
  function migrate25() { if (S.v25) return; S.v25 = true; if (S.settings.wa_tpl_pending === 'Olá {nome}! 😊 Obrigada pelo teu pedido de marcação.\n\n✨ {servico}\n🗓️ {data}, às {hora}\n\n{sinal_texto}\n\nPodes acompanhar o teu pedido aqui: {link}\n\nUm beijinho,\n{profissional}') S.settings.wa_tpl_pending = DEFAULTS.wa_tpl_pending; (S.bookings || []).forEach(b => (b.events || []).forEach(e => { if (e.details === 'pedido recebido') e.details = 'marcação recebida'; if (e.details === 'pedido confirmado') e.details = 'marcação confirmada'; })); dirty = true; }
  function migrate24() { if (S.v24) return; S.v24 = true; if (/combinamos a entrega do sinal/.test(S.settings.booking_policy || '')) S.settings.booking_policy = DEFAULTS.booking_policy;
    (S.bookings || []).forEach(b => { if (b.payment_method === 'mao' && ['pending', 'confirmed'].includes(b.status)) b.deposit_cents = null; }); dirty = true; }
  function migrate23() { if (S.v23) return; S.v23 = true; if (S.settings.wa_tpl_confirmed === 'Olá {nome}! A tua marcação está confirmada. 🤍\n\n✨ {servico}\n🗓️ {data}, às {hora}\n📍 {morada}\n\nPeço que chegues 5 minutos antes. Se precisares de alterar, podes fazê-lo até 48 horas antes, aqui: {link}\n\nAté breve!\n{profissional}') S.settings.wa_tpl_confirmed = DEFAULTS.wa_tpl_confirmed; dirty = true; }
  function migrate22() { if (S.v22) return; S.v22 = true; const st = S.settings;
    if (st.wa_tpl_pending === 'Olá {nome}! Recebi o teu pedido de marcação para {servico}, {data} às {hora}. 😊\n\n{sinal_texto}\n\nPodes ver o teu pedido aqui: {link}\n\n{profissional}') st.wa_tpl_pending = DEFAULTS.wa_tpl_pending;
    if (st.wa_tpl_confirmed === 'Olá {nome}! A tua marcação está confirmada: {servico}, {data} às {hora}. 🤍\n\nMorada: {morada}\n\nSe precisares de alterar, usa este link (até 48 horas antes): {link}\n\nAté breve!\n{profissional}') st.wa_tpl_confirmed = DEFAULTS.wa_tpl_confirmed; dirty = true; }
  function migrate21() { if (S.v21) return; S.v21 = true; const st = S.settings;
    for (const k of ['wa_tpl_proposed', 'wa_tpl_cancelled', 'wa_tpl_review']) if (!(k in st)) st[k] = DEFAULTS[k];
    const old = /por email|no email de confirmação|nome, email e telefone|recebes um email/;
    for (const k of ['booking_policy', 'cancellation_policy']) if (old.test(st[k] || '')) st[k] = DEFAULTS[k];
    if ((st.faq || []).some(f => old.test(f.a))) st.faq = JSON.parse(JSON.stringify(DEFAULTS.faq));
    dirty = true; }
  function migrate20() { if (S.v20) return; S.v20 = true; for (const k of ['wa_tpl_pending', 'wa_tpl_confirmed', 'wa_tpl_reminder', 'wa_tpl_proposed', 'wa_tpl_cancelled', 'wa_tpl_review']) if (!(k in S.settings)) S.settings[k] = DEFAULTS[k]; dirty = true; }
  function migrate19() { if (S.v19) return; S.v19 = true; (S.services || []).forEach(x => { if (x.name === 'Lash Lifting' && x.price_cents == null) { x.price_cents = 2000; x.price_type = 'fixed'; } }); dirty = true; }
  function migrate18() {
    if (S.v18) return; S.v18 = true;
    const st = S.settings;
    for (const k of ['deposit_enabled', 'deposit_percent', 'mbway_number', 'iban', 'iban_name', 'payment_note']) if (!(k in st)) st[k] = DEFAULTS[k];
    if (st.payment_note === 'Indica a referência da marcação na descrição do pagamento. Os restantes 50% são pagos no final do serviço.') st.payment_note = DEFAULTS.payment_note;
    if (st.birthday_message === 'Olá {nome}! Muitos parabéns! Desejo-te um dia muito especial, cheio de coisas boas. Um beijinho, {profissional}') st.birthday_message = DEFAULTS.birthday_message;
    if (st.booking_policy === DEFAULTS.booking_policy.replace(/Para reservar o dia e a hora[^\n]*\n\n/, '')) st.booking_policy = DEFAULTS.booking_policy;
    if (st.cancellation_policy === DEFAULTS.cancellation_policy.replace(/Se cancelares com pelo menos 48 horas[^\n]*\n\n/, '')) st.cancellation_policy = DEFAULTS.cancellation_policy;
    // marcações de exemplo: forma de pagamento e sinal, para se ver no painel
    const prefs = ['mbway', 'mbway', 'mao'];
    S.bookings.filter(b => ['pending', 'confirmed'].includes(b.status) && b.start_at > Date.now()).forEach((b, i) => {
      if (!b.payment_method) b.payment_method = prefs[i % prefs.length];
      if (b.deposit_cents === undefined) b.deposit_cents = b.price_cents != null && b.price_cents > 0 ? Math.round(b.price_cents / 2) : null;
      if (b.status === 'confirmed' && b.deposit_cents && b.payment_method !== 'mao' && !paidOf(b.id))
        S.payments.push({ id: ++S.seq, booking_id: b.id, amount_cents: b.deposit_cents, method: b.payment_method, status: 'pago', paid_at: Math.min(Date.now(), b.created_at + 2 * H), note: 'Sinal', request_key: 'demo-sinal-' + b.id, void_reason: '', voided_at: null, created_at: Date.now() });
    });
    dirty = true;
  }
  function migrate17() { if (S.v17) return; S.v17 = true; if (!('testimonials' in S.settings)) S.settings.testimonials = DEFAULTS.testimonials.slice(); dirty = true; }
  function migrate16() { if (S.v16) return; S.v16 = true; S.expenses ||= []; S.meta ||= {}; for (const k of ['logo_image', 'profile_image', 'facebook', 'tiktok']) if (!(k in S.settings)) S.settings[k] = DEFAULTS[k]; if (S.customers.some(c => c.demo)) demoHistory(S); dirty = true; }
  function migrate15() { if (S.v15) return; S.v15 = true; for (const k of ['space_title', 'space_text', 'space_image', 'space_points']) if (!(k in S.settings)) S.settings[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); dirty = true; }
  function migrate14() { if (S.v14) return; S.v14 = true; if (!S.settings.whatsapp) S.settings.whatsapp = '939 907 962'; dirty = true; }
  if (!S || !S.settings) S = seed();
  migrate(); migrate10(); migrate11(); migrate12(); migrate13(); migrate14(); migrate15(); migrate16(); migrate17(); migrate18(); migrate19(); migrate20(); migrate21(); migrate22(); migrate23(); migrate24(); migrate25(); migrate26(); migrate27();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* sem armazenamento: fica em memória */ }
    if (dirty && window.DemoAPI && window.DemoAPI.onSave) window.DemoAPI.onSave(S);
    dirty = false;
  };
  const id = () => ++S.seq;

  // ---------- registo e aniversários ----------
  const validBday = v => { if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v || '')) return false; const [m, d] = v.split('-').map(Number); return d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; };
  const bdayText = c => String(S.settings.birthday_message || '').replace(/\{nome\}/g, String(c.name || '').trim().split(/\s+/)[0]).replace(/\{profissional\}/g, S.settings.professional_name || S.settings.business_name);
  function birthdays(days) {
    const t = today(), y = +t.slice(0, 4), leap = n => (n % 4 === 0 && n % 100 !== 0) || n % 400 === 0;
    return S.customers.filter(c => c.birthday).map(c => {
      const [m, d] = c.birthday.split('-').map(Number), at = yy => `${yy}-${String(m).padStart(2, '0')}-${String(m === 2 && d === 29 && !leap(yy) ? 28 : d).padStart(2, '0')}`;
      let next = at(y); if (next < t) next = at(y + 1);
      const du = Math.round((new Date(next + 'T12:00:00Z') - new Date(t + 'T12:00:00Z')) / D);
      return { id: c.id, name: c.name, email: c.email, phone: c.phone, birthday: c.birthday, birthday_consent: c.birthday_consent ? 1 : 0, birthday_greeted_year: c.birthday_greeted_year || null,
        source: c.source || '', next_date: next, days_until: du, greeted: c.birthday_greeted_year === +next.slice(0, 4), message: bdayText(c) };
    }).filter(c => c.days_until <= days).sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name, 'pt'));
  }

  // ---------- vistas de dados (como as do servidor, sem duração nem hora de fim) ----------
  const SEL = b => {
    const c = S.customers.find(x => x.id === b.customer_id) || {}, { duration_min, end_at, token, review_token, demo, ...rest } = b;
    const rem = S.notifications.find(n => n.booking_id === b.id && n.kind === 'reminder');
    return { ...rest, staff_name: staffName(b.staff_id), customer_name: c.name, customer_email: c.email, customer_phone: c.phone, paid_cents: paidOf(b.id), reminder_status: rem ? rem.status : null, proposed: b.proposed || 0 };
  };
  const waMessages = b => {
    const st = S.settings, paid = paidOf(b.id), dep = b.deposit_cents, eur = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
    const mb = String(st.mbway_number || '').trim(), iban = String(st.iban || '').trim(); let sinal = '';
    if (st.deposit_enabled) { const v = dep != null ? eur(dep) : `${st.deposit_percent}% do valor`;
      if (b.payment_method === 'mao') sinal = `Pagamento em mão: pagas o valor total${b.price_cents != null ? ' (' + eur(b.price_cents) + ')' : ''} no dia, no espaço. Não precisas de pagar sinal.`;
      else if (dep != null && paid >= dep) sinal = 'Já recebi o teu sinal, obrigada!';
      else if (b.status === 'confirmed' && b.payment_method !== 'mao' && (mb || iban)) sinal = b.payment_method === 'transferencia' && iban ? `Falta só o sinal de ${v}, por transferência para o IBAN ${iban} (referência ${b.ref}).` : `Falta só o sinal de ${v}, por MB WAY para o ${mb} (referência ${b.ref}).`;
      else if (b.payment_method === 'mao') sinal = b.status === 'confirmed' ? `Pagamento em mão, no espaço (sinal de ${v}).` : `Combinamos a entrega do sinal (${v}) aqui no espaço.`;
      else if (b.payment_method === 'transferencia' && iban) sinal = `Para reservar, peço um sinal de ${v} por transferência para o IBAN ${iban}, com a referência ${b.ref}.`;
      else if (mb) sinal = `Para reservar, peço um sinal de ${v} por MB WAY para o ${mb}, com a referência ${b.ref} na descrição. Assim que receber, confirmo a tua marcação.`; }
    const c = S.customers.find(x => x.id === b.customer_id) || {};
    const d = new Date(b.start_at), fmt = o => new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', ...o }).format(d);
    const vars = { nome: String(c.name || '').split(' ')[0], servico: b.service_name, data: fmt({ weekday: 'long', day: 'numeric', month: 'long' }), hora: fmt({ hour: '2-digit', minute: '2-digit' }),
      sinal: dep != null ? eur(dep) : '', sinal_texto: sinal, mbway: mb, iban, ref: b.ref, link: location.origin + '/gerir.html?t=' + b.token, morada: `${st.address_line}, ${st.postal_code} ${st.city}`, profissional: st.professional_name || st.business_name,
      site: location.origin + '/marcar.html', link_avaliacao: '' };
    if (b.status === 'completed' && !S.reviews.some(r => r.booking_id === b.id)) { b.review_token ||= rnd(); vars.link_avaliacao = location.origin + '/avaliar.html?t=' + b.review_token; }
    const fill = t => String(t || '').replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m).replace(/\n{3,}/g, '\n\n').trim();
    return { pending: fill(st.wa_tpl_pending), confirmed: fill(st.wa_tpl_confirmed), reminder: fill(st.wa_tpl_reminder), proposed: fill(st.wa_tpl_proposed), cancelled: fill(st.wa_tpl_cancelled), review: vars.link_avaliacao ? fill(st.wa_tpl_review) : '' };
  };
  const detail = b => ({ ...SEL(b), wa: waMessages(b), events: (S.events || []).filter(e => e.booking_id === b.id).sort((x, y) => x.at - y.at), payments: S.payments.filter(p => p.booking_id === b.id).sort((x, y) => x.paid_at - y.paid_at),
    notifications: S.notifications.filter(n => n.booking_id === b.id).slice(0, 20).map(n => ({ kind: n.kind, status: n.status, recipient: n.recipient, error: n.error, created_at: n.created_at, demo_link: n.demo_link })) });
  const dayRange = d => [lisbon(d), lisbon(addDays(d, 1)) - 1];
  const nextMonth = mo => { const [y, m] = mo.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
  const monthR = mo => [lisbon(mo + '-01'), lisbon(nextMonth(mo) + '-01') - 1];
  const paidBetween = (a, z) => S.payments.filter(p => p.status === 'pago' && p.paid_at >= a && p.paid_at <= z).reduce((s2, p) => s2 + p.amount_cents, 0);
  const expBetween = (a, z) => (S.expenses || []).filter(e => e.spent_on >= a && e.spent_on <= z).reduce((s2, e) => s2 + e.amount_cents, 0);
  function series(r) {
    const t = today(), out = [];
    if (r === '12m') { let mo = t.slice(0, 7); const ms = []; for (let i = 0; i < 12; i++) { ms.unshift(mo); const [y, m] = mo.split('-').map(Number); mo = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; }
      for (const mo2 of ms) { const [a, z] = monthR(mo2); out.push({ key: mo2, cents: paidBetween(a, z), payments: S.payments.filter(p => p.status === 'pago' && p.paid_at >= a && p.paid_at <= z).length, expenses_cents: expBetween(mo2 + '-01', mo2 + '-31') }); } }
    else { const n = r === '7d' ? 7 : 30; for (let i = n - 1; i >= 0; i--) { const d = addDays(t, -i), [a, z] = dayRange(d); out.push({ key: d, cents: paidBetween(a, z), payments: S.payments.filter(p => p.status === 'pago' && p.paid_at >= a && p.paid_at <= z).length, expenses_cents: expBetween(d, d) }); } }
    return out;
  }
  const EXP_CATS = { produtos: 'Produtos e material', renda: 'Renda', equipamento: 'Equipamento', formacao: 'Formação', marketing: 'Publicidade e redes', servicos: 'Água, luz e internet', impostos: 'Impostos e taxas', outro: 'Outro' };
  function expFields(b) {
    const day = String(b.spent_on || ''), cents = Math.round(Number(String(b.amount_eur ?? '').replace(/\s/g, '').replace(',', '.')) * 100);
    if (!/^\d{4}-\d\d-\d\d$/.test(day)) throw new E(422, 'Indica a data da despesa.', { errors: { spent_on: 'Indica a data da despesa.' } });
    if (!(cents > 0)) throw new E(422, 'Indica um valor maior que zero.', { errors: { amount_eur: 'Indica um valor maior que zero.' } });
    return { spent_on: day, amount_cents: cents, category: EXP_CATS[b.category] ? b.category : 'outro', description: clean(b.description, 300) };
  }
  function custStats(c) {
    const bs = S.bookings.filter(b => b.customer_id === c.id), done = bs.filter(b => b.status === 'completed').map(b => b.start_at), next = bs.filter(b => ACTIVE(b) && b.start_at > Date.now()).map(b => b.start_at);
    return { ...c, visits: done.length, last_visit: done.length ? Math.max(...done) : null, first_visit: done.length ? Math.min(...done) : null, paid_cents: bs.reduce((a, b) => a + paidOf(b.id), 0),
      next_visit: next.length ? Math.min(...next) : null, cancellations: bs.filter(b => b.status === 'cancelled').length,
      no_shows: bs.filter(b => b.status === 'no_show').length, total: bs.length };
  }
  function dupGroups() {
    const g = new Map();
    for (const c of S.customers) for (const k of [digits(c.phone).length >= 9 ? 't:' + digits(c.phone) : null, c.email ? 'e:' + c.email.toLowerCase() : null].filter(Boolean)) { if (!g.has(k)) g.set(k, []); g.get(k).push(c); }
    const seen = new Set(), out = [];
    for (const [k, l] of g) { if (l.length < 2) continue; const sig = l.map(c => c.id).sort().join(); if (seen.has(sig)) continue; seen.add(sig);
      out.push(l.map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, created_at: c.created_at, reason: k[0] === 't' ? 'mesmo telefone' : 'mesmo email' }))); }
    return out;
  }
  const PUBLIC_KEYS = ['wa_tpl_client', 'wa_tpl_client_contact', 'business_name', 'hero_title', 'hero_subtitle', 'address_line', 'postal_code', 'city', 'phone', 'email', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'logo_image', 'testimonials', 'map_embed_url', 'map_link_url', 'professional_name',
    'about_text', 'space_title', 'space_text', 'space_image', 'space_points', 'training', 'experience_text', 'experience_steps', 'hero_image', 'about_image', 'gallery', 'video_url', 'video_file', 'video_image', 'cancellation_policy', 'cancel_limit_hours', 'reschedule_limit_hours', 'min_notice_hours',
    'max_advance_days', 'arrival_note', 'faq', 'pending_hold_hours', 'waitlist_offer_minutes', 'privacy_controller', 'access_info', 'booking_policy', 'legal_id', 'register_enabled', 'register_title', 'register_intro',
    'deposit_enabled', 'deposit_percent', 'mbway_number', 'iban', 'iban_name', 'payment_note'];
  const svcOut = s => { const { duration_min, ...rest } = s; return { ...rest, staff: S.staffServices.filter(([, b]) => b === s.id).map(([a]) => a) }; };
  const vh = rows => (rows || []).filter(r => r.weekday >= 1 && r.weekday <= 7 && /^\d\d:\d\d$/.test(r.start) && /^\d\d:\d\d$/.test(r.end) && r.start < r.end);
  const NUM = { deposit_percent: [10, 100], slot_step_min: [5, 240], min_notice_hours: [0, 720], max_advance_days: [1, 365], cancel_limit_hours: [0, 720], reschedule_limit_hours: [0, 720], pending_hold_hours: [1, 168],
    waitlist_offer_minutes: [10, 2880], waitlist_max_offers: [1, 10], reminder_hours: [1, 168], review_invite_delay_hours: [0, 168], reminder_wa_hour: [8, 23] };
  const ZONES = ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'];
  const INTEGR = { email: { configured: false, missing: ['SMTP_HOST', 'SMTP_FROM'], from: '', auth: false, port: 587 },
    whatsapp: { configured: true, available: true, mode: 'one_tap', note: 'Mensagens com um toque: em cada marcação, o painel abre o teu WhatsApp com a mensagem já escrita. Só tens de carregar em Enviar.' },
    sms: { configured: false, available: false, note: 'Envio de SMS não está incluído nesta versão.' }, jobs: true };
  const isoQ = (v, end) => /^\d{4}-\d\d-\d\d$/.test(v || '') ? (end ? dayRange(v)[1] : lisbon(v)) : +v || 0;

  const routes = [
    // ---------- público ----------
    ['GET', /^\/api\/public\/config$/, () => ({ ...Object.fromEntries(PUBLIC_KEYS.map(k => [k, /image/.test(k) ? demoImg(S.settings[k]) : k === 'gallery' ? (S.settings.gallery || []).map(demoImg) : k === 'video_file' ? ((window.DEMO_VIDEO || {})[S.settings.video_file] || S.settings.video_file) : S.settings[k]])),
      hours: S.hours.slice().sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)),
      closures: S.blocks.filter(x => !x.staff_id && x.end_at > Date.now() && ['ferias', 'encerramento'].includes(x.type)).sort((a, b) => a.start_at - b.start_at), staff: S.staff.filter(s => s.active),
      integrations: { email: false, whatsapp: false, sms: false, whatsapp_link: !!S.settings.whatsapp }, timezone: S.settings.timezone || TZ })],
    ['GET', /^\/api\/public\/services$/, () => {
      const sv = S.services.filter(s => s.active).sort((a, b) => a.sort - b.sort).map(s => ({ ...svcOut(s), staff: svcOut(s).staff.filter(i => S.staff.find(x => x.id === i)?.active) }));
      return { categories: S.categories.slice().sort((a, b) => a.sort - b.sort).map(c => ({ ...c, services: sv.filter(s => s.category_id === c.id) })).filter(c => c.services.length), uncategorized: sv.filter(s => !s.category_id) };
    }],
    ['GET', /^\/api\/public\/days$/, (m, q) => {
      const svc = svcById(q.get('service_id')); if (!svc) throw new E(404, 'Serviço não encontrado.'); expire();
      let from = /^\d{4}-\d\d-\d\d$/.test(q.get('from') || '') ? q.get('from') : today(); if (from < today()) from = today();
      const n = Math.min(+q.get('days') || 35, 62), last = addDays(today(), S.settings.max_advance_days);
      return { days: Array.from({ length: n }, (_, i) => { const d = addDays(from, i); return { date: d, count: slots(svc, q.get('staff_id'), d).length, bookable: d <= last }; }), last_date: last, today: today() };
    }],
    ['GET', /^\/api\/public\/slots$/, (m, q) => { const svc = svcById(q.get('service_id')); if (!svc) throw new E(404, 'Serviço não encontrado.'); expire();
      return { slots: slots(svc, q.get('staff_id'), q.get('date')).map(s => ({ ...s, staff: s.staff.map(i => ({ id: i, name: staffName(i) })) })) }; }],
    ['POST', /^\/api\/public\/bookings$/, (m, q, b) => create({ ...b, marketing_consent: b.marketing_consent === true }), 201],
    ['GET', /^\/api\/public\/manage\/([^/]+)$/, m => pub(byToken(m[1]))],
    ['POST', /^\/api\/public\/manage\/([^/]+)\/cancel$/, (m, q, b) => { const k = byToken(m[1]); cancel(k, false, b.reason); return pub(k); }],
    ['POST', /^\/api\/public\/manage\/([^/]+)\/reschedule$/, (m, q, b) => { const k = byToken(m[1]); move(k, b.start, b.staff_id, false); return pub(k); }],
    ['POST', /^\/api\/public\/manage\/([^/]+)\/proposal$/, (m, q, body) => {
      const b = byToken(m[1]); if (b.status !== 'pending' || !b.proposed) throw new E(409, 'Esta proposta já não está disponível.');
      if (body.accept === true) { b.status = 'confirmed'; b.hold_expires_at = null; b.proposed = 0; ev(b, 'cliente', 'Aceitou o horário sugerido', `Confirmada para ${dmyhm(b.start_at)}`); notify('approved', b); }
      else { b.status = 'cancelled'; b.proposed = 0; b.cancel_reason = 'A cliente recusou o horário sugerido'; ev(b, 'cliente', 'Recusou o horário sugerido', `Horário ${dmyhm(b.start_at)} libertado`); }
      return pub(b);
    }],
    ['POST', /^\/api\/public\/manage\/([^/]+)\/attendance$/, m => { const b = byToken(m[1]); if (b.status !== 'confirmed') throw new E(409, 'Só marcações confirmadas.');
      b.attendance_confirmed_at = Date.now(); b.attendance_source = 'cliente'; ev(b, 'cliente', 'Presença confirmada', 'Pelo link do lembrete'); return pub(b); }],
    ['POST', /^\/api\/public\/register$/, (m, q, b) => {
      if (b.website) return { ok: true };
      if (!S.settings.register_enabled) throw new E(410, 'O registo está temporariamente indisponível. Podes marcar diretamente em Marcações.');
      let c = null, errors = {};
      try { c = contact(b); } catch (e) { errors = { ...((e.extra || {}).errors || {}) }; }
      if (clean(b.name, 80).split(/\s+/).filter(Boolean).length < 2) errors.name = 'Indica o nome completo (nome e apelido).';
      if (errors.phone) errors.phone = 'Indica um telemóvel válido (ex.: 912 345 678).';
      if (!validBday(b.birthday)) errors.birthday = 'Indica o dia e o mês do teu aniversário.';
      if (Object.keys(errors).length) throw new E(422, 'Verifica os dados indicados.', { errors });
      const origin = String(b.origem || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'link', consent = b.birthday_consent === true;
      const ex = S.customers.find(x => x.email === c.email);
      if (ex) { if (!ex.phone) ex.phone = c.phone; if (!ex.birthday) ex.birthday = b.birthday; if (consent) ex.birthday_consent = 1; if (!ex.registered_at) ex.registered_at = Date.now(); if (!ex.source) ex.source = 'registo:' + origin; }
      else S.customers.push({ id: id(), ...c, marketing_consent: 0, notes: '', created_at: Date.now(), birthday: b.birthday, birthday_consent: consent ? 1 : 0, source: 'registo:' + origin, registered_at: Date.now() });
      return { ok: true };
    }, 201],
    ['POST', /^\/api\/public\/waitlist$/, (m, q, b) => {
      const c = contact(b, true); c.email = c.email || ''; const svc = svcById(b.service_id); if (!svc) throw new E(404, 'Serviço não encontrado.');
      if (S.waitlist.some(w => ((c.email && w.email === c.email) || digits(w.phone) === digits(c.phone)) && w.service_id === svc.id && ['active', 'offered'].includes(w.status))) throw new E(409, 'Já estás na lista de espera para este serviço. Aviso-te quando surgir uma vaga.');
      const w = { id: id(), service_id: svc.id, staff_id: b.staff_id ? +b.staff_id : null, ...c, days: (b.days || []).map(Number), periods: (b.periods || []).filter(p => p in PER),
        date_from: b.date_from || null, date_to: b.date_to || null, status: 'active', offers_count: 0, skipped: [], notes: '', source: 'online', contacted_at: null, created_at: Date.now() };
      S.waitlist.push(w); return { ok: true, id: w.id };
    }, 201],
    ['GET', /^\/api\/public\/offer\/([^/]+)$/, () => { throw new E(404, 'Esta oferta já não é válida.'); }],
    ['GET', /^\/api\/public\/reviews$/, (m, q) => { const pubR = S.reviews.filter(r => r.status === 'published').sort((a, b) => b.created_at - a.created_at);
      return { reviews: pubR.slice(0, +q.get('limit') || 50), count: pubR.length, average: pubR.length ? Math.round(pubR.reduce((a, r) => a + r.rating, 0) / pubR.length * 10) / 10 : null }; }],
    ['GET', /^\/api\/public\/review\/([^/]+)$/, m => { const b = S.bookings.find(x => x.review_token === m[1]); if (!b) throw new E(404, 'Link de avaliação inválido.');
      const n = S.customers.find(c => c.id === b.customer_id).name.split(' '); return { already: S.reviews.some(r => r.booking_id === b.id), service_name: b.service_name, start: b.start_at,
        suggested_name: n.length > 1 ? `${n[0]} ${n[n.length - 1][0]}.` : n[0], completed: b.status === 'completed' }; }],
    ['POST', /^\/api\/public\/review\/([^/]+)$/, (m, q, body) => {
      const b = S.bookings.find(x => x.review_token === m[1]); if (!b) throw new E(404, 'Link de avaliação inválido.');
      if (b.status !== 'completed') throw new E(403, 'Só é possível avaliar atendimentos concluídos.');
      if (S.reviews.some(r => r.booking_id === b.id)) throw new E(409, 'Este atendimento já foi avaliado. Obrigada!');
      const rating = +body.rating; if (!(rating >= 1 && rating <= 5)) throw new E(422, 'Escolhe uma classificação de 1 a 5 estrelas.');
      const comment = clean(body.comment, 1000), author = clean(body.author_name, 40) || 'Cliente';
      const PII = /(https?:\/\/|www\.|[^\s@]+@[^\s@]+\.\w+|(\+?\d[\s.-]?){9,})/i;
      const status = PII.test(comment) || PII.test(author) ? 'pending' : 'published';
      S.reviews.push({ id: id(), booking_id: b.id, rating, comment, author_name: author, service_name: b.service_name, verified: 1, status, hidden_reason: '', reply: '', created_at: Date.now() });
      return { status };
    }, 201],

    // ---------- painel (privado) ----------
    ['POST', /^\/api\/admin\/login$/, (m, q, b) => { if (String(b.email).trim().toLowerCase() !== 'demo@exemplo.pt' || b.password !== 'demonstracao') throw new E(401, 'Email ou palavra-passe incorretos. Na demonstração usa demo@exemplo.pt / demonstracao.'); S.loggedIn = true; return { ok: true }; }, 200, true],
    ['POST', /^\/api\/admin\/logout$/, () => { S.loggedIn = false; return { ok: true }; }, 200, true],
    ['GET', /^\/api\/admin\/me$/, () => ({ id: 1, email: 'demo@exemplo.pt', name: 'Demonstração' })],
    ['POST', /^\/api\/admin\/password$/, () => { throw new E(422, 'Na demonstração não é possível alterar a palavra-passe.'); }],
    ['GET', /^\/api\/admin\/overview$/, (m, q) => {
      expire(); const date = /^\d{4}-\d\d-\d\d$/.test(q.get('date') || '') ? q.get('date') : today(), [a, z] = dayRange(date);
      const all = S.bookings.map(SEL), day = all.filter(b => b.start_at >= a && b.start_at <= z && b.status !== 'cancelled').sort((x, y) => x.start_at - y.start_at);
      const pending = all.filter(b => b.status === 'pending').sort((x, y) => x.start_at - y.start_at), bd = board(date);
      const conf = day.filter(b => b.status === 'confirmed' || b.status === 'completed');
      return { date, today: today(), bookings: day, pending, board: bd,
        cards: { confirmed: conf.length, pending: pending.length, available: bd.filter(t => t.state === 'livre').length, expected_cents: conf.reduce((s2, b) => s2 + (b.price_cents || 0), 0), unpriced: conf.filter(b => b.price_cents == null).length },
        waitlist_signals: S.waitlist.filter(w => w.status === 'active').map(w => ({ id: w.id, name: w.name, phone: w.phone, service_name: svcById(w.service_id)?.name, matches: wlMatches(w, 2) })).filter(w => w.matches.length),
        integrations: { email: false, whatsapp: false, sms: false }, business_name: S.settings.business_name, birthdays: date === today() ? birthdays(0) : [],
        open_days: Object.keys(S.daySlots).filter(d => d >= today() && S.daySlots[d].length).length, weekly_hours: S.hours.length };
    }],
    ['GET', /^\/api\/admin\/agenda\/day$/, (m, q) => { expire(); const date = q.get('date') || today(), [a, z] = dayRange(date);
      return { date, board: board(date, q.get('staff_id')), bookings: S.bookings.filter(b => b.start_at >= a && b.start_at <= z).map(SEL).sort((x, y) => x.start_at - y.start_at) }; }],
    ['GET', /^\/api\/admin\/bookings$/, (m, q) => {
      expire(); let l = S.bookings.map(SEL);
      const from = isoQ(q.get('from')), to = isoQ(q.get('to'), true);
      if (from) l = l.filter(b => b.start_at >= from); if (to) l = l.filter(b => b.start_at <= to);
      if (q.get('status')) { const st = q.get('status').split(','); l = l.filter(b => st.includes(b.status)); }
      for (const k of ['staff_id', 'service_id', 'customer_id']) if (+q.get(k)) l = l.filter(b => b[k] === +q.get(k));
      if (q.get('q')) { const s2 = q.get('q').toLowerCase(), d = digits(s2); l = l.filter(b => [b.customer_name, b.customer_email, b.ref].some(v => String(v || '').toLowerCase().includes(s2)) || (d.length >= 3 && digits(b.customer_phone).includes(d))); }
      return l.sort((a, b) => q.get('order') === 'desc' ? b.start_at - a.start_at : a.start_at - b.start_at);
    }],
    ['GET', /^\/api\/admin\/bookings\/(\d+)$/, m => detail(bk(m[1]))],
    ['POST', /^\/api\/admin\/bookings$/, (m, q, b) => create({ ...b, accept_policy: true }, { admin: true }), 201],
    ['PATCH', /^\/api\/admin\/bookings\/(\d+)$/, (m, q, body) => {
      const b = bk(m[1]);
      if (body.status) setStatus(b, body.status, body.reason);
      if (typeof body.payment_method === 'string') { const pm = payPref(body.payment_method); if (pm !== (b.payment_method || '')) { b.payment_method = pm; b.deposit_cents = pm === 'mao' ? null : depositFor(b.price_cents); ev(b, 'painel', 'Forma de pagamento alterada', PAY_PREFS[pm] || 'sem indicação'); } }
      if (typeof body.internal_notes === 'string') { b.internal_notes = clean(body.internal_notes, 1000); ev(b, 'painel', 'Notas internas atualizadas'); }
      if (body.attendance) { if (b.status !== 'confirmed') throw new E(409, 'Só marcações confirmadas.'); b.attendance_confirmed_at = Date.now(); b.attendance_source = clean(body.attendance, 40); ev(b, 'painel', 'Presença confirmada', `Registada no painel (${b.attendance_source})`); }
      return detail(b);
    }],
    ['POST', /^\/api\/admin\/bookings\/(\d+)\/approve$/, m => { const b = bk(m[1]); approve(b); return detail(b); }],
    ['POST', /^\/api\/admin\/bookings\/(\d+)\/reject$/, (m, q, body) => { const b = bk(m[1]); if (b.status !== 'pending') throw new E(409, 'Este pedido já não está pendente.');
      b.status = 'cancelled'; b.proposed = 0; b.cancel_reason = clean(body.reason, 300) || 'Pedido recusado'; ev(b, 'painel', 'Pedido recusado', b.cancel_reason); notify('rejected', b); return { ok: true }; }],
    ['POST', /^\/api\/admin\/bookings\/(\d+)\/suggest$/, (m, q, body) => {
      const b = bk(m[1]); if (b.status !== 'pending') throw new E(409, 'Só é possível sugerir outro horário a pedidos pendentes.');
      const st = +body.start; if (!(st > Date.now())) throw new E(422, 'Escolhe um horário futuro.');
      const staffId = +body.staff_id || b.staff_id, why = conflicts(staffId, b.resource_id, st, { ignoreBookingId: b.id });
      if (why) throw new E(409, REASONS[why], { code: 'SLOT_TAKEN' });
      const before = b.start_at; Object.assign(b, { start_at: st, staff_id: staffId, proposed: 1, hold_expires_at: Math.min(Date.now() + S.settings.pending_hold_hours * H, st), updated_at: Date.now() });
      ev(b, 'painel', 'Outro horário sugerido', `${dmyhm(before)} → ${dmyhm(st)}${body.message ? ' · ' + clean(body.message, 200) : ''}`);
      return { ...detail(b), notified: notify('proposed', b) };
    }],
    ['POST', /^\/api\/admin\/bookings\/(\d+)\/move$/, (m, q, body) => { const b = bk(m[1]); move(b, body.start, body.staff_id, true, body.notify !== false); return detail(b); }],
    ['GET', /^\/api\/admin\/slots$/, (m, q) => { expire(); return board(q.get('date'), q.get('staff_id')).filter(t => t.state === 'livre'); }],
    ['POST', /^\/api\/admin\/bookings\/(\d+)\/payments$/, (m, q, body) => addPayment(bk(m[1]), body)],
    ['POST', /^\/api\/admin\/payments\/(\d+)\/void$/, (m, q, body) => {
      const p = S.payments.find(x => x.id === +m[1]); if (!p) throw new E(404, 'Pagamento não encontrado.'); if (p.status !== 'pago') throw new E(409, 'Este pagamento já foi anulado.');
      const why = clean(body.reason, 200); if (!why) throw new E(422, 'Indica o motivo da anulação.');
      Object.assign(p, { status: 'anulado', void_reason: why, voided_at: Date.now() }); ev(bk(p.booking_id), 'painel', 'Pagamento anulado', `${eurTxt(p.amount_cents)} · ${why}`); return { ok: true };
    }],
    ['GET', /^\/api\/admin\/finance$/, (m, q) => {
      const from = /^\d{4}-\d\d-\d\d$/.test(q.get('from') || '') ? q.get('from') : today().slice(0, 8) + '01', to = /^\d{4}-\d\d-\d\d$/.test(q.get('to') || '') ? q.get('to') : today();
      if (to < from) throw new E(422, 'A data final é anterior à inicial.');
      const a = lisbon(from), z = dayRange(to)[1];
      const payments = S.payments.filter(p => p.paid_at >= a && p.paid_at <= z).map(p => { const b = bk(p.booking_id); return { ...p, ref: b.ref, service_name: b.service_name, start_at: b.start_at, customer_name: S.customers.find(c => c.id === b.customer_id)?.name }; })
        .sort((x, y) => y.paid_at - x.paid_at || y.id - x.id);
      const ok = payments.filter(p => p.status === 'pago'), bySvc = {}, byMethod = {}, byCat = {};
      for (const p of ok) { const sv = svcById(bk(p.booking_id).service_id), cat = S.categories.find(c => c.id === sv?.category_id)?.name || 'Sem categoria'; byCat[cat] = (byCat[cat] || 0) + p.amount_cents; }
      for (const p of ok) { (bySvc[p.service_name] ||= { name: p.service_name, cents: 0, count: 0 }); bySvc[p.service_name].cents += p.amount_cents; bySvc[p.service_name].count++; byMethod[p.method] = (byMethod[p.method] || 0) + p.amount_cents; }
      const outstanding = S.bookings.filter(b => b.status === 'completed' && b.start_at >= a && b.start_at <= z).map(SEL).filter(b => b.price_cents == null || b.paid_cents < b.price_cents)
        .map(b => ({ ...b, due_cents: b.price_cents == null ? null : b.price_cents - b.paid_cents })).sort((x, y) => x.start_at - y.start_at);
      return { from, to, received_cents: ok.reduce((s2, p) => s2 + p.amount_cents, 0), payments_count: ok.length, outstanding_cents: outstanding.reduce((s2, b) => s2 + (b.due_cents || 0), 0), outstanding,
        unpriced: outstanding.filter(b => b.due_cents == null).length, by_service: Object.values(bySvc).sort((x, y) => y.cents - x.cents), by_method: byMethod, payments, methods: METHODS,
        by_category: Object.entries(byCat).map(([name, cents]) => ({ name, cents })).sort((x, y) => y.cents - x.cents), expenses_cents: expBetween(from, to) };
    }],
    ['GET', /^\/api\/admin\/finance\/month$/, (m, q) => {
      const mo = /^\d{4}-\d\d$/.test(q.get('month') || '') ? q.get('month') : today().slice(0, 7), a = lisbon(mo + '-01'), z = lisbon(addDays(addDays(mo + '-28', 5).slice(0, 8) + '01', 0)) - 1;
      const bs = S.bookings.filter(b => b.start_at >= a && b.start_at <= z), cnt = st => bs.filter(b => b.status === st).length, top = {};
      bs.filter(b => ['confirmed', 'completed'].includes(b.status)).forEach(b => { top[b.service_name] = (top[b.service_name] || 0) + 1; });
      return { month: mo, completed: cnt('completed'), cancelled: cnt('cancelled'), no_show: cnt('no_show'), confirmed: cnt('confirmed'), pending: cnt('pending'),
        top_services: Object.entries(top).map(([name, n]) => ({ name, n })).sort((x, y) => y.n - x.n || x.name.localeCompare(y.name)).slice(0, 5),
        received_cents: S.payments.filter(p => p.status === 'pago' && p.paid_at >= a && p.paid_at <= z).reduce((s2, p) => s2 + p.amount_cents, 0) };
    }],
    ['GET', /^\/api\/admin\/blocks$/, (m, q) => S.blocks.filter(x => x.end_at > (+q.get('from') || Date.now() - 30 * D)).sort((a, b) => a.start_at - b.start_at).map(x => ({ ...x, staff_name: staffName(x.staff_id) }))],
    ['POST', /^\/api\/admin\/blocks$/, (m, q, b) => {
      const s2 = +b.start_at, e = +b.end_at; if (!s2 || !e || e <= s2) throw new E(422, 'Indica um início e um fim válidos.');
      const staffId = +b.staff_id || null;
      const affected = S.bookings.filter(k => ACTIVE(k) && k.start_at >= s2 && k.start_at < e && (!staffId || k.staff_id === staffId)).map(SEL);
      const x = { id: id(), staff_id: staffId, type: ['pausa', 'ferias', 'folga', 'encerramento', 'bloqueio'].includes(b.type) ? b.type : 'bloqueio', start_at: s2, end_at: e, reason: clean(b.reason), public_note: clean(b.public_note), created_at: Date.now() };
      S.blocks.push(x); return { id: x.id, affected };
    }, 201],
    ['DELETE', /^\/api\/admin\/blocks\/(\d+)$/, m => { S.blocks = S.blocks.filter(x => x.id !== +m[1]); return { ok: true }; }],
    ['GET', /^\/api\/admin\/services$/, () => ({ categories: S.categories.slice().sort((a, b) => a.sort - b.sort), services: S.services.slice().sort((a, b) => a.sort - b.sort).map(s => ({ ...svcOut(s), bookings: S.bookings.filter(b => b.service_id === s.id).length })), resources: S.resources })],
    ['POST', /^\/api\/admin\/services$/, (m, q, b) => { const s2 = { id: id(), ...svcFields(b) }; S.services.push(s2); setSvcStaff(s2.id, b.staff || S.staff.map(x => x.id)); return { id: s2.id }; }, 201],
    ['PUT', /^\/api\/admin\/services\/(\d+)$/, (m, q, b) => { const x = svcById(m[1]); if (!x) throw new E(404, 'Serviço não encontrado.'); Object.assign(x, svcFields(b)); setSvcStaff(+m[1], b.staff); return { ok: true }; }],
    ['POST', /^\/api\/admin\/services\/(\d+)\/active$/, (m, q, b) => { const x = svcById(m[1]); if (!x) throw new E(404, 'Serviço não encontrado.'); x.active = b.active ? 1 : 0; return { ok: true }; }],
    ['DELETE', /^\/api\/admin\/services\/(\d+)$/, m => { if (S.bookings.some(b => b.service_id === +m[1])) { svcById(m[1]).active = 0; return { ok: true, archived: true }; }
      S.services = S.services.filter(s2 => s2.id !== +m[1]); return { ok: true }; }],
    ['POST', /^\/api\/admin\/categories$/, (m, q, b) => { if (!clean(b.name)) throw new E(422, 'Indica o nome da categoria.'); const c = { id: id(), name: clean(b.name, 80), description: clean(b.description, 300), note: clean(b.note, 300), sort: +b.sort || 0, image_url: String(b.image_url || '').slice(0, 900000) }; S.categories.push(c); return { id: c.id }; }, 201],
    ['PUT', /^\/api\/admin\/categories\/(\d+)$/, (m, q, b) => { if (!clean(b.name)) throw new E(422, 'Indica o nome da categoria.'); Object.assign(S.categories.find(c => c.id === +m[1]), { name: clean(b.name, 80), description: clean(b.description, 300), note: clean(b.note, 300), sort: +b.sort || 0, image_url: String(b.image_url || '').slice(0, 900000) }); return { ok: true }; }],
    ['DELETE', /^\/api\/admin\/categories\/(\d+)$/, m => { S.categories = S.categories.filter(c => c.id !== +m[1]); S.services.forEach(s2 => { if (s2.category_id === +m[1]) s2.category_id = null; }); return { ok: true }; }],
    ['GET', /^\/api\/admin\/staff$/, () => S.staff.map(s2 => ({ ...s2, hours: S.staffHours.filter(h => h.staff_id === s2.id), services: S.staffServices.filter(([a]) => a === s2.id).map(([, b]) => b) }))],
    ['POST', /^\/api\/admin\/staff$/, (m, q, b) => ({ id: saveStaff(null, b) }), 201],
    ['PUT', /^\/api\/admin\/staff\/(\d+)$/, (m, q, b) => { saveStaff(+m[1], b); return { ok: true }; }],
    ['GET', /^\/api\/admin\/day-slots$/, (m, q) => {
      const from = q.get('from') || '0000', to = q.get('to') || '9999';
      return Object.keys(S.daySlots).filter(d => d >= from && d <= to && S.daySlots[d].length).sort().map(date => ({ date, times: S.daySlots[date].slice() }));
    }],
    ['PUT', /^\/api\/admin\/day-slots\/(\d{4}-\d\d-\d\d)$/, (m, q, b) => {
      const times = [...new Set((Array.isArray(b.times) ? b.times : []).map(String))];
      if (times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new E(422, 'Hora inválida (usa HH:MM).');
      if (times.length > 48) throw new E(422, 'Demasiados horários para um dia.');
      const [a, z] = dayRange(m[1]), booked = S.bookings.filter(k => ACTIVE(k) && k.start_at >= a && k.start_at <= z).map(k => hhmm(k.start_at));
      const removed = (S.daySlots[m[1]] || []).filter(t => !times.includes(t) && booked.includes(t));
      if (removed.length) throw new E(409, `Não é possível retirar ${removed.join(', ')}: já tem marcação. Reagenda ou cancela primeiro.`);
      if (times.length) S.daySlots[m[1]] = times.sort(); else delete S.daySlots[m[1]];
      return { date: m[1], times: times.sort() };
    }],
    ['GET', /^\/api\/admin\/hours$/, () => S.hours.slice().sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))],
    ['PUT', /^\/api\/admin\/hours$/, (m, q, b) => { S.hours = vh(b.hours).map(h => ({ weekday: +h.weekday, start: h.start, end: h.end })); S.settings.hours_confirmed = true; return { ok: true }; }],
    ['GET', /^\/api\/admin\/settings$/, () => ({ settings: S.settings, integrations: { email: false, whatsapp: false, sms: false }, status: INTEGR, zones: ZONES })],
    ['POST', /^\/api\/admin\/integrations\/test-email$/, () => ({ ok: false, status: 'not_configured', error: 'Na demonstração não são enviados emails.' })],
    ['POST', /^\/api\/admin\/bookings\/(\d+)\/wa-log$/, (m, q, body) => { const L = { pending: 'marcação recebida', confirmed: 'marcação confirmada', reminder: 'lembrete', proposed: 'proposta de horário', cancelled: 'aviso de cancelamento', review: 'pedido de avaliação' }; if (!L[body.kind]) throw new E(422, 'Mensagem desconhecida.'); ev(bk(m[1]), 'painel', 'WhatsApp aberto', L[body.kind]); return { ok: true }; }],
    ['GET', /^\/api\/admin\/integrations$/, () => { const l = {}; S.notifications.filter(n => n.created_at > Date.now() - 30 * D).forEach(n => { l[n.status] = (l[n.status] || 0) + 1; }); return { ...INTEGR, last30: l }; }],
    ['PUT', /^\/api\/admin\/settings$/, (m, q, b) => {
      for (const [k, v] of Object.entries(b)) {
        if (!(k in DEFAULTS)) continue;
        if (k === 'timezone') { if (!ZONES.includes(v)) throw new E(422, 'Fuso horário inválido.'); S.settings[k] = v; continue; }
        if (k === 'iban') { const raw = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (raw && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(raw)) throw new E(422, 'IBAN inválido. Confirma os dígitos (ex.: PT50 …).'); S.settings[k] = raw.replace(/(.{4})/g, '$1 ').trim(); continue; }
        if (NUM[k]) { const n = +v; if (!(n >= NUM[k][0] && n <= NUM[k][1])) throw new E(422, `Valor inválido para ${k} (entre ${NUM[k][0]} e ${NUM[k][1]}).`); S.settings[k] = n; }
        else if (Array.isArray(DEFAULTS[k])) S.settings[k] = Array.isArray(v) ? v : [];
        else if (typeof DEFAULTS[k] === 'boolean') S.settings[k] = !!v; else S.settings[k] = /image/.test(k) ? String(v).slice(0, 900000) : String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 4000);
      }
      return { ok: true };
    }],
    ['GET', /^\/api\/admin\/waitlist$/, () => S.waitlist.filter(w => ['active', 'offered'].includes(w.status) || w.created_at > Date.now() - 30 * D).sort((a, b) => a.created_at - b.created_at)
      .map(w => ({ ...w, service_name: svcById(w.service_id)?.name, staff_name: staffName(w.staff_id), matches: w.status === 'active' ? wlMatches(w) : [] }))],
    ['POST', /^\/api\/admin\/waitlist$/, (m, q, b) => {
      const name = clean(b.name, 80), phone = clean(b.phone, 30), email = clean(b.email, 120).toLowerCase();
      if (name.length < 2) throw new E(422, 'Indica o nome da cliente.'); if (digits(phone).length < 9) throw new E(422, 'Indica um telefone válido.');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new E(422, 'Email inválido.');
      if (!svcById(b.service_id)) throw new E(404, 'Serviço não encontrado.');
      const w = { id: id(), service_id: +b.service_id, staff_id: null, name, email, phone, days: (b.days || []).map(Number).filter(d => d >= 1 && d <= 7), periods: (b.periods || []).filter(p => p in PER),
        date_from: b.date_from || null, date_to: b.date_to || null, notes: clean(b.notes, 300), source: 'painel', status: 'active', offers_count: 0, skipped: [], contacted_at: null, created_at: Date.now() };
      S.waitlist.push(w); return { id: w.id };
    }, 201],
    ['POST', /^\/api\/admin\/waitlist\/(\d+)\/contacted$/, (m, q, b) => { const w = S.waitlist.find(x => x.id === +m[1]); if (w) { w.contacted_at = Date.now(); if (clean(b.notes)) w.notes = clean(b.notes, 300); } return { ok: true }; }],
    ['POST', /^\/api\/admin\/waitlist\/(\d+)\/booked$/, (m, q, b) => { const w = S.waitlist.find(x => x.id === +m[1]); if (w) { w.status = 'booked'; w.booking_id = +b.booking_id || null; } return { ok: true }; }],
    ['DELETE', /^\/api\/admin\/waitlist\/(\d+)$/, m => { const w = S.waitlist.find(x => x.id === +m[1]); if (w) w.status = 'cancelled'; return { ok: true }; }],
    ['GET', /^\/api\/admin\/customers$/, (m, q) => {
      const s2 = (q.get('q') || '').trim().toLowerCase(), d = digits(s2), dup = new Set(dupGroups().flat().map(c => c.id));
      return S.customers.filter(c => !s2 || [c.name, c.email].some(v => String(v || '').toLowerCase().includes(s2)) || (d.length >= 3 && digits(c.phone).includes(d)))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt')).slice(0, +q.get('limit') || 300).map(c => ({ ...custStats(c), possible_duplicate: dup.has(c.id) }));
    }],
    ['GET', /^\/api\/admin\/customers\/duplicates$/, () => dupGroups()],
    ['GET', /^\/api\/admin\/birthdays$/, (m, q) => ({ list: birthdays(Math.min(+q.get('days') || 31, 366)), email_auto: !!S.settings.birthday_email_enabled, email_configured: false })],
    ['POST', /^\/api\/admin\/customers\/(\d+)\/greeted$/, (m, q, b) => { const c = birthdays(366).find(x => x.id === +m[1]); if (!c) throw new E(404, 'Cliente sem aniversário registado.');
      S.customers.find(x => x.id === c.id).birthday_greeted_year = b.undo ? null : +c.next_date.slice(0, 4); return { ok: true }; }],
    ['GET', /^\/api\/admin\/register\/stats$/, () => {
      const r = S.customers.filter(c => c.registered_at), by = {};
      r.forEach(c => { const k = String(c.source || '').replace(/^registo:/, '') || 'link'; by[k] = (by[k] || 0) + 1; });
      return { total: r.length, last30: r.filter(c => c.registered_at > Date.now() - 30 * D).length, by_origin: by,
        recent: r.slice().sort((a, b) => b.registered_at - a.registered_at).slice(0, 10).map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, birthday: c.birthday, birthday_consent: c.birthday_consent, source: c.source, registered_at: c.registered_at })) };
    }],
    ['GET', /^\/api\/admin\/customers\/(\d+)$/, m => {
      const c = S.customers.find(x => x.id === +m[1]); if (!c) throw new E(404, 'Cliente não encontrada.');
      const bookings = S.bookings.filter(b => b.customer_id === c.id).map(SEL).sort((a, b) => b.start_at - a.start_at), svc = {};
      bookings.filter(b => b.status === 'completed').forEach(b => { svc[b.service_name] = (svc[b.service_name] || 0) + 1; });
      const g = dupGroups().find(x => x.some(y => y.id === c.id));
      return { ...custStats(c), bookings, paid_cents: bookings.reduce((a, b) => a + b.paid_cents, 0), services: Object.entries(svc).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
        duplicates: g ? g.filter(x => x.id !== c.id) : [] };
    }],
    ['POST', /^\/api\/admin\/customers$/, (m, q, b) => {
      const c = contact(b, true);
      if (!b.force_new) { const mm = matches(c); if (mm.length) throw new E(409, 'Já existe uma ficha com este telefone ou email.', { code: 'POSSIBLE_DUPLICATE', matches: mm }); }
      if (c.email && S.customers.some(k => k.email === c.email)) throw new E(409, 'Já existe uma cliente com este email.');
      if (b.birthday && !validBday(b.birthday)) throw new E(422, 'Aniversário inválido (dia e mês).');
      const x = { id: id(), ...c, notes: clean(b.notes, 1000), marketing_consent: 0, created_at: Date.now(), birthday: b.birthday || null, birthday_consent: b.birthday_consent ? 1 : 0 }; S.customers.push(x); return { id: x.id };
    }, 201],
    ['PUT', /^\/api\/admin\/customers\/(\d+)$/, (m, q, b) => { const c = contact(b, true); const x = S.customers.find(k => k.id === +m[1]); if (!x) throw new E(404, 'Cliente não encontrada.');
      if (c.email && S.customers.some(k => k.email === c.email && k.id !== x.id)) throw new E(409, 'Já existe uma cliente com este email.');
      if ('birthday' in b) { if (b.birthday && !validBday(b.birthday)) throw new E(422, 'Aniversário inválido (dia e mês).'); x.birthday = b.birthday || null; x.birthday_consent = b.birthday_consent ? 1 : 0; }
      Object.assign(x, c, { notes: clean(b.notes, 1000), marketing_consent: b.marketing_consent ? 1 : 0 }); return { ok: true }; }],
    ['POST', /^\/api\/admin\/customers\/(\d+)\/anonymize$/, m => { const c = S.customers.find(x => x.id === +m[1]); if (!c) throw new E(404, 'Cliente não encontrada.');
      Object.assign(c, { name: 'Cliente apagada #' + c.id, email: null, phone: 'apagado-' + c.id, notes: '', marketing_consent: 0, birthday: null, birthday_consent: 0, source: '', registered_at: null });
      S.bookings.forEach(b => { if (b.customer_id === c.id) b.internal_notes = ''; }); return { ok: true }; }],
    ['POST', /^\/api\/admin\/customers\/(\d+)\/merge$/, (m, q, b) => {
      const from = S.customers.find(x => x.id === +m[1]), into = S.customers.find(x => x.id === +b.into_id);
      if (!from || !into || from === into) throw new E(422, 'Escolhe a ficha que fica.');
      S.bookings.forEach(k => { if (k.customer_id === from.id) k.customer_id = into.id; });
      into.notes = [into.notes, from.notes && `[Da ficha junta: ${from.name}] ${from.notes}`].filter(Boolean).join('\n'); if (!into.email && from.email) into.email = from.email;
      S.customers = S.customers.filter(x => x !== from); return { ok: true, id: into.id };
    }],
    ['GET', /^\/api\/admin\/reviews$/, () => S.reviews.slice().sort((a, b) => b.created_at - a.created_at).map(r => { const b = S.bookings.find(x => x.id === r.booking_id); return { ...r, ref: b?.ref, customer_name: S.customers.find(c => c.id === b?.customer_id)?.name }; })],
    ['POST', /^\/api\/admin\/reviews\/(\d+)$/, (m, q, b) => {
      const r = S.reviews.find(x => x.id === +m[1]);
      if (b.action === 'hide') { if (!['spam', 'ofensivo', 'dados_pessoais'].includes(b.reason)) throw new E(422, 'Só é possível ocultar por spam, conteúdo ofensivo ou dados pessoais. Críticas negativas legítimas não podem ser ocultadas.'); r.status = 'hidden'; r.hidden_reason = b.reason; }
      else if (b.action === 'publish') { r.status = 'published'; r.hidden_reason = ''; } else if (b.action === 'reply') r.reply = clean(b.reply, 1000);
      return { ok: true };
    }],
    // ---------- painel novo: resumo, faturação, despesas, notificações, exportação ----------
    ['GET', /^\/api\/admin\/dashboard$/, () => {
      expire(); const t = today(), [a, z] = dayRange(t), [m0, m1] = monthR(t.slice(0, 7)), now = Date.now(), all = S.bookings.map(SEL);
      const list = all.filter(b => b.start_at >= a && b.start_at <= z && b.status !== 'cancelled').sort((x, y) => x.start_at - y.start_at);
      const next = all.filter(b => ACTIVE(b) && b.start_at > now).sort((x, y) => x.start_at - y.start_at)[0] || null;
      return { today: t, name: S.settings.professional_name || S.settings.business_name, integrations: { email: false, whatsapp: false, sms: false },
        cards: { today: list.length, pending: all.filter(b => b.status === 'pending').length, month_received_cents: paidBetween(m0, m1),
          month_clients: new Set(S.bookings.filter(b => b.status === 'completed' && b.start_at >= m0 && b.start_at <= m1).map(b => b.customer_id)).size, next },
        birthdays: birthdays(0).map(c => ({ id: c.id, name: c.name })),
        bookings: list, open_days: Object.keys(S.daySlots).filter(d => d >= t && S.daySlots[d].length).length, weekly_hours: S.hours.length };
    }],
    ['GET', /^\/api\/admin\/revenue$/, (m, q) => { const r = ['7d', '30d', '12m'].includes(q.get('range')) ? q.get('range') : '30d'; return { range: r, unit: r === '12m' ? 'month' : 'day', series: series(r) }; }],
    ['GET', /^\/api\/admin\/finance\/overview$/, () => {
      const t = today(), [d0, d1] = dayRange(t), w0 = lisbon(addDays(t, 1 - wd(t))), w1 = dayRange(addDays(t, 7 - wd(t)))[1], [m0, m1] = monthR(t.slice(0, 7));
      const y0 = lisbon(t.slice(0, 4) + '-01-01'), y1 = lisbon((+t.slice(0, 4) + 1) + '-01-01') - 1;
      const month = paidBetween(m0, m1), year = paidBetween(y0, y1), nb = new Set(S.payments.filter(p => p.status === 'pago' && p.paid_at >= m0 && p.paid_at <= m1).map(p => p.booking_id)).size;
      const em = expBetween(t.slice(0, 7) + '-01', t.slice(0, 7) + '-31'), ey = expBetween(t.slice(0, 4) + '-01-01', t.slice(0, 4) + '-12-31');
      return { day_cents: paidBetween(d0, d1), week_cents: paidBetween(w0, w1), month_cents: month, year_cents: year, avg_ticket_cents: nb ? Math.round(month / nb) : 0, paid_bookings_month: nb,
        month_expenses_cents: em, year_expenses_cents: ey, month_result_cents: month - em, year_result_cents: year - ey, months: series('12m') };
    }],
    ['GET', /^\/api\/admin\/expenses$/, (m, q) => {
      const from = /^\d{4}-\d\d-\d\d$/.test(q.get('from') || '') ? q.get('from') : today().slice(0, 8) + '01', to = /^\d{4}-\d\d-\d\d$/.test(q.get('to') || '') ? q.get('to') : today();
      const list = (S.expenses || []).filter(e => e.spent_on >= from && e.spent_on <= to).sort((x, y) => y.spent_on.localeCompare(x.spent_on) || y.id - x.id);
      return { from, to, list, total_cents: list.reduce((a, e) => a + e.amount_cents, 0), categories: EXP_CATS };
    }],
    ['POST', /^\/api\/admin\/expenses$/, (m, q, b) => { const e = { id: id(), ...expFields(b), created_at: Date.now() }; (S.expenses ||= []).push(e); return { id: e.id }; }, 201],
    ['PUT', /^\/api\/admin\/expenses\/(\d+)$/, (m, q, b) => { const e = (S.expenses || []).find(x => x.id === +m[1]); if (!e) throw new E(404, 'Despesa não encontrada.'); Object.assign(e, expFields(b)); return { ok: true }; }],
    ['DELETE', /^\/api\/admin\/expenses\/(\d+)$/, m => { S.expenses = (S.expenses || []).filter(x => x.id !== +m[1]); return { ok: true }; }],
    ['GET', /^\/api\/admin\/inbox$/, () => {
      expire(); const seen = (S.meta || {}).inbox_seen_at || Date.now() - 3 * D;
      const items = (S.events || []).filter(e => e.actor === 'cliente' || e.actor === 'sistema').sort((x, y) => y.at - x.at || y.id - x.id).slice(0, 80).map(e => {
        const b = S.bookings.find(x => x.id === e.booking_id) || {}, c = S.customers.find(x => x.id === b.customer_id) || {};
        return { id: e.id, at: e.at, actor: e.actor, action: e.action, details: e.details, booking_id: e.booking_id, status: b.status, start_at: b.start_at, service_name: b.service_name, customer_name: c.name, customer_phone: c.phone };
      });
      const t = addDays(today(), 1), [a, z] = dayRange(t);
      return { seen_at: seen, unread: items.filter(i => i.at > seen).length, items, tomorrow: remindersTomorrow().list, reminder_hour: remindersTomorrow().hour, reminder_due: remindersTomorrow().due,
        tomorrow_date: t, pending: S.bookings.filter(b => b.status === 'pending').length, emails: S.notifications.slice(0, 60), integrations: { email: false, whatsapp: false, sms: false } };
    }],
    ['GET', /^\/api\/admin\/inbox\/count$/, () => { const seen = (S.meta || {}).inbox_seen_at || Date.now() - 3 * D;
      return { unread: (S.events || []).filter(e => (e.actor === 'cliente' || e.actor === 'sistema') && e.at > seen).length, pending: S.bookings.filter(b => b.status === 'pending').length, reminders: (r => r.due ? r.unsent : 0)(remindersTomorrow()) }; }],
    ['GET', /^\/api\/admin\/reminders$/, () => remindersTomorrow()],
    ['POST', /^\/api\/admin\/inbox\/seen$/, () => { (S.meta ||= {}).inbox_seen_at = Date.now(); return { ok: true }; }],
    ['GET', /^\/api\/admin\/export\/customers$/, () => ({ exported_at: Date.now(), count: S.customers.length, customers: S.customers.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt')).map(c => { const x = custStats(c);
      return { id: c.id, name: c.name, phone: c.phone, email: c.email || '', birthday: c.birthday || '', birthday_consent: !!c.birthday_consent, marketing_consent: !!c.marketing_consent, created_at: c.created_at,
        first_visit: x.first_visit, last_visit: x.last_visit, visits: x.visits, paid_cents: x.paid_cents, notes: c.notes || '' }; }) })],
    ['GET', /^\/api\/admin\/notifications$/, () => S.notifications.slice(0, 200)],
    ['POST', /^\/api\/admin\/uploads$/, (m, q, b) => { if (!/^data:image\/(webp|jpeg|png);base64,/.test(b.data || '')) throw new E(422, 'Formato de imagem não suportado.'); return { url: b.data }; }, 201]
  ];
  function svcFields(b) {
    const name = clean(b.name, 120); if (!name) throw new E(422, 'Indica o nome do serviço.');
    const price = b.price_eur === '' || b.price_eur == null ? null : Math.round(+String(b.price_eur).replace(',', '.') * 100);
    if (price != null && !(price >= 0)) throw new E(422, 'Preço inválido.');
    const pt = ['fixed', 'from', 'variable', 'addon'].includes(b.price_type) ? b.price_type : 'fixed';
    if ((pt === 'from' || pt === 'variable') && !clean(b.price_note)) throw new E(422, 'Quando o preço varia, explica de que depende.');
    return { group_name: clean(b.group_name, 80), bookable: b.bookable === false || pt === 'addon' ? 0 : 1, category_id: +b.category_id || null, name, description: clean(b.description, 1000), price_cents: price, price_type: pt, price_note: clean(b.price_note, 300),
      requires_approval: b.requires_approval ? 1 : 0, resource_id: +b.resource_id || null, featured: b.featured ? 1 : 0, active: b.active === false ? 0 : 1, sort: +b.sort || 0,
      image_url: String(b.image_url || '').slice(0, 900000), included: clean(b.included, 1000), preparation: clean(b.preparation, 1000) };
  }
  function setSvcStaff(sid, staff) { if (!Array.isArray(staff)) return; S.staffServices = S.staffServices.filter(([, b]) => b !== sid).concat(staff.map(Number).map(a => [a, sid])); }
  function saveStaff(sid, b) {
    if (!clean(b.name)) throw new E(422, 'Indica o nome.');
    const f = { name: clean(b.name, 80), role: clean(b.role, 80), bio: clean(b.bio, 1000), photo_url: clean(b.photo_url, 500), active: b.active === false ? 0 : 1, sort: +b.sort || 0 };
    if (sid) Object.assign(S.staff.find(s2 => s2.id === sid), f); else { sid = id(); S.staff.push({ id: sid, ...f }); }
    if (Array.isArray(b.hours)) S.staffHours = S.staffHours.filter(h => h.staff_id !== sid).concat(vh(b.hours).map(h => ({ staff_id: sid, weekday: +h.weekday, start: h.start, end: h.end })));
    if (Array.isArray(b.services)) S.staffServices = S.staffServices.filter(([a]) => a !== sid).concat(b.services.map(Number).map(x => [sid, x]));
    return sid;
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, opts = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, opts);
    if (url === '/api/admin/uploads/video' && opts.body instanceof Blob) {
      return new Response(JSON.stringify({ url: URL.createObjectURL(opts.body) }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    const u = new URL(url, 'https://demo.local'), method = (opts.method || 'GET').toUpperCase();
    await new Promise(r => setTimeout(r, 120)); // latência simulada
    let status = 200, body;
    try {
      const r = routes.find(([mm, re]) => mm === method && re.test(u.pathname));
      if (!r) throw new E(404, 'Não encontrado.');
      if (u.pathname.startsWith('/api/admin') && !r[4] && !S.loggedIn) throw new E(401, 'Sessão terminada. Inicia sessão novamente.');
      if (method !== 'GET') { jobs(); dirty = true; }
      const out = r[2](u.pathname.match(r[1]), u.searchParams, opts.body ? JSON.parse(opts.body) : {});
      if (Array.isArray(out) && out.length === 2 && typeof out[1] === 'number' && out[0] && out[0].booking_id) { body = out[0]; status = out[1]; } else { body = out; status = r[3] || 200; }
      save();
    } catch (e) {
      status = e.status || 500; body = { error: e.status ? e.message : 'Erro inesperado na demonstração.', ...(e.extra || {}) };
      if (!e.status) console.error(e);
    }
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  window.DemoAPI = {
    // "Repor dados" volta ao estado inicial, mas mantém os textos editados
    reset() { const te = S.textEdits; try { localStorage.removeItem(KEY); } catch { /* */ } S = seed(); S.textEdits = te || {}; dirty = true; save(); },
    jobs: () => { jobs(); save(); },
    state: () => S,
    load(st) { if (st && st.settings) { S = st; migrate(); migrate10(); migrate11(); migrate12(); migrate13(); migrate14(); migrate15(); migrate16(); migrate17(); migrate18(); migrate19(); migrate20(); migrate21(); migrate22(); migrate23(); migrate24(); migrate25(); migrate26(); migrate27(); jobs(); save(); } },
    setField(kind, id, field, v) {
      const list = kind === 'cat' ? S.categories : S.services, x = list.find(e => e.id === +id);
      if (x && field in x) { x[field] = v; if (kind === 'svc' && field === 'name') S.bookings.forEach(b => { if (b.service_id === x.id && b.start_at > Date.now() && ACTIVE(b)) b.service_name = v; }); dirty = true; save(); }
    },
    addService(catId) {
      const sv = newService(id(), +catId, '[Novo tipo]', 0, S.services.length);
      S.services.push(sv); S.staffServices.push([1, sv.id]); dirty = true; save(); return sv.id;
    },
    removeService(svcId) {
      const x = S.services.find(e => e.id === +svcId); if (!x) return;
      if (S.bookings.some(b => b.service_id === x.id)) x.active = 0; else { S.services = S.services.filter(e => e !== x); S.staffServices = S.staffServices.filter(([, b]) => b !== x.id); }
      dirty = true; save();
    },
    setSetting(k, v) { if (k in S.settings) { S.settings[k] = v; dirty = true; save(); } },
    saveText(key, rec) { if (rec) S.textEdits[key] = rec; else delete S.textEdits[key]; dirty = true; save(); },
    onSave: null
  };
  jobs(); save();
})();
