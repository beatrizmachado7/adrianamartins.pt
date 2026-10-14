/* Comum a todas as páginas públicas: cabeçalho, rodapé, dados do espaço, utilitários. */
(function () {
  'use strict';
  let TZ = 'Europe/Lisbon'; // substituído pelo fuso configurado no painel (config.timezone)
  const ICONS = {
    clock: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor" stroke="none"/>',
    starEmpty: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    shield: '<path d="M12 3 4.5 6v6c0 4.4 3.2 7.8 7.5 9 4.3-1.2 7.5-4.6 7.5-9V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
    leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19 13 11"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".9" fill="currentColor" stroke="none"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
    mark: '<circle cx="12" cy="12" r="10" stroke-width="1"/><path d="M12 5.5c1.8 2.3 1.8 4.7 0 7-1.8-2.3-1.8-4.7 0-7zM12 12.5c2.6-.6 4.6.3 6 2.6-2.6.6-4.6-.3-6-2.6zM12 12.5c-2.6-.6-4.6.3-6 2.6 2.6.6 4.6-.3 6-2.6z" stroke-width="1.1"/>'
  };
  const icon = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const fmt = {
    price(c, type) {
      if (c == null) return 'Sob consulta';
      const v = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);
      return type === 'from' ? `desde ${v}` : type === 'variable' ? `${v}*` : type === 'addon' ? `+${v}` : v;
    },
    date(ms, opts = {}) { return new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', ...opts }).format(ms); },
    time(ms) { return new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(ms); },
    dateTime(ms) { return `${fmt.date(ms)}, às ${fmt.time(ms)}`; },
    short(ms) { return new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(ms); }
  };
  const DAYS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

  async function api(path, opts = {}) {
    const res = await fetch('/api/public' + path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Não foi possível concluir o pedido.'); e.status = res.status; e.data = data; throw e; }
    return data;
  }

  // fotografias otimizadas: carregamento diferido (exceto a principal) e descodificação assíncrona
  function photo(url, label, alt = '', { eager = false } = {}) {
    // as fotografias do espaço têm uma versão de 480 px para telemóveis
    const small = !window.DEMO_IMG && /^\/assets\/img\/espaco-[a-z]+\.webp$/.test(url || '') ? ` srcset="${esc(url.replace('.webp', '-480.webp'))} 480w, ${esc(url)} 768w" sizes="(max-width: 700px) 46vw, 34vw"` : '';
    return url ? `<div class="photo"><img src="${esc(url)}"${small} alt="${esc(alt || label)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>`
      : `<div class="photo" role="img" aria-label="Fotografia por adicionar: ${esc(label)}"><div class="ph"><div>${icon('image')}[FOTOGRAFIA]<br>${esc(label)}</div></div></div>`;
  }
  function stars(n) { return `<span class="stars" aria-label="${n} de 5 estrelas">${[1, 2, 3, 4, 5].map(i => icon(i <= Math.round(n) ? 'star' : 'starEmpty')).join('')}</span>`; }

  const byAppointment = '<p class="hours-appt">Atendimento só por marcação. Vê os dias e as horas livres em <a href="/marcar.html">Marcações</a>.</p>';
  function hoursTable(hours) {
    if (!hours.length) return byAppointment;
    const today = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' }).format(new Date()).replace(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/, d => ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[d])));
    return `<table class="hours"><tbody>${[1, 2, 3, 4, 5, 6, 7].map(d => {
      const rows = hours.filter(h => h.weekday === d);
      return `<tr class="${d === today ? 'today' : ''}"><td>${DAYS[d]}</td><td>${rows.length ? rows.map(h => `${h.start}–${h.end}`).join(' · ') : 'Encerrado'}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  // resumo: agrupa dias seguidos com o mesmo horário ("Terça a sexta · 10:00–13:00, 14:00–19:00")
  function hoursSummary(hours) {
    if (!hours.length) return byAppointment;
    const key = d => hours.filter(h => h.weekday === d).map(h => `${h.start}–${h.end}`).join(', ');
    const groups = [];
    for (let d = 1; d <= 7; d++) { const k = key(d), g = groups[groups.length - 1]; if (g && g.k === k) g.to = d; else groups.push({ k, from: d, to: d }); }
    const name = g => g.from === g.to ? DAYS[g.from] : `${DAYS[g.from]} a ${DAYS[g.to].toLowerCase()}`;
    const open = groups.filter(g => g.k), closed = groups.filter(g => !g.k).flatMap(g => Array.from({ length: g.to - g.from + 1 }, (_, i) => DAYS[g.from + i].toLowerCase()));
    return `<ul class="hours-summary">${open.map(g => `<li><span>${name(g)}</span><span>${g.k.replace(/, /g, ' · ')}</span></li>`).join('')}
      ${closed.length ? `<li class="muted"><span>Encerrado</span><span>${closed.join(', ').replace(/, ([^,]*)$/, ' e $1')}</span></li>` : ''}</ul>`;
  }
  function closuresHtml(c) {
    if (!c.length) return '';
    return `<div class="notice" style="margin-top:14px"><strong>Encerramentos previstos</strong><ul style="margin:6px 0 0;padding-left:18px">${c.map(x =>
      `<li>${fmt.short(x.start_at)}${x.end_at - x.start_at > 86400000 ? ' a ' + fmt.short(x.end_at - 1) : ''}${x.public_note ? ' — ' + esc(x.public_note) : ''}</li>`).join('')}</ul></div>`;
  }
  const waLink = n => { let d = String(n || '').replace(/\D/g, ''); if (!d) return ''; if (d.length === 9) d = '351' + d; return `https://wa.me/${d}`; };
  const telLink = n => /\d/.test(n) ? `tel:${String(n).replace(/[^\d+]/g, '')}` : '#';

  function header(cfg, page) {
    const links = [['index', '/', 'Início'], ['servicos', '/servicos.html', 'Serviços'], ['espaco', '/espaco.html', 'O espaço'],
      ['marcar', '/marcar.html', 'Marcações'], ['contactos', '/contactos.html', 'Contactos']];
    return `<a class="skip" href="#main">Saltar para o conteúdo</a>
    <div class="wrap">
      <a class="brand" href="/"><img class="brand-logo" src="${esc(cfg.logo_image || '/assets/img/logo-am.webp')}" alt="" width="68" height="48" decoding="async"><span data-name>${esc(cfg.business_name)}</span></a>
      <button class="menu-btn" aria-label="Abrir menu" aria-expanded="false" aria-controls="nav">${icon('menu')}</button>
      <nav class="nav" id="nav" aria-label="Principal">
        ${links.map(([k, h, t]) => `<a href="${h}" ${k === 'marcar' ? 'class="nav-cta"' : ''} ${k === page ? 'aria-current="page"' : ''}>${t}</a>`).join('')}
      </nav>
    </div>`;
  }
  // "@utilizador" a partir do link do Instagram (ou do que estiver escrito)
  const igHandle = v => { const m = String(v || '').match(/instagram\.com\/([^/?#]+)/i); return m ? '@' + m[1] : String(v || '').startsWith('@') ? v : v ? '@' + v : ''; };
  const igUrl = v => /^https?:/i.test(v || '') ? v : v ? `https://www.instagram.com/${String(v).replace(/^@/, '')}/` : '';
  function footer(cfg) {
    const y = new Date().getFullYear();
    return `<div class="wrap"><div class="cols">
      <div><h4>${esc(cfg.business_name)}</h4><ul class="f-info">
        <li><span class="f-lab">Morada:</span> <span data-set="address_line">${esc(cfg.address_line)}</span></li>
        <li><span class="f-lab">Código postal:</span> <span data-set="postal_code">${esc(cfg.postal_code)}</span>${cfg.city ? ` - <span data-set="city">${esc(cfg.city)}</span>` : ''}</li></ul></div>
      <div><h4>Contactos</h4><ul class="f-info">
        <li><span class="f-lab">Telefone:</span> <a href="${telLink(cfg.phone)}">${esc(cfg.phone)}</a></li>
        <li><span class="f-lab">Email:</span> <a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a></li>
        ${cfg.whatsapp ? `<li><a class="f-ig" href="${waLink(cfg.whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(cfg.whatsapp)}">${icon('phone')}<span>WhatsApp</span></a></li>` : ''}
        ${cfg.instagram ? `<li><a class="f-ig" href="${esc(igUrl(cfg.instagram))}" target="_blank" rel="noopener" aria-label="Instagram ${esc(igHandle(cfg.instagram))}">${icon('instagram')}<span>Instagram</span></a></li>` : ''}
        ${cfg.facebook ? `<li><a class="f-ig" href="${esc(cfg.facebook)}" target="_blank" rel="noopener">${icon('globe')}<span>Facebook</span></a></li>` : ''}
        ${cfg.tiktok ? `<li><a class="f-ig" href="${esc(cfg.tiktok)}" target="_blank" rel="noopener">${icon('globe')}<span>TikTok</span></a></li>` : ''}
      </ul></div>
      <div><h4>Políticas</h4><ul>
        <li><a href="/politicas.html#marcacao">Política de marcação</a></li>
        <li><a href="/politicas.html#cancelamento">Cancelamento e reagendamento</a></li>
        <li><a href="/privacidade.html">Privacidade</a></li>
      </ul></div></div>
      <div class="bottom"><span>© ${y} ${esc(cfg.business_name)}</span><span>Livro de Reclamações: <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener">livroreclamacoes.pt</a></span></div></div>`;
  }

  function reveal() {
    const els = $$('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)) return els.forEach(e => e.classList.add('in'));
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
  }

  let cfgPromise;
  const config = () => (cfgPromise ||= api('/config').then(c => { if (c.timezone) { TZ = c.timezone; window.Site.TZ = TZ; } return c; }));

  async function init() {
    const page = document.body.dataset.page;
    const cfg = await config().catch(() => null);
    if (!cfg) return;
    const h = $('#site-header'); if (h) { h.className = 'site-header'; h.innerHTML = header(cfg, page); }
    const f = $('#site-footer'); if (f) { f.className = 'site-footer'; f.innerHTML = footer(cfg); }
    if (document.body.dataset.cta !== 'off') {
      const bar = document.createElement('div');
      bar.className = 'mobile-cta';
      bar.innerHTML = `<a class="btn" href="/marcar.html">${icon('calendar')} Fazer marcação</a>`;
      document.body.appendChild(bar); document.body.classList.add('has-mobile-cta');
      // o botão acompanha sempre o scroll; só fica escondido enquanto o botão "Fazer marcação" do topo está à vista (não tapa o título)
      const heroBtn = document.querySelector('.hero .btn');
      if (heroBtn) {
        const upd = () => bar.classList.toggle('hide-top', heroBtn.getBoundingClientRect().bottom > 60);
        addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
      }
    }
    $$('[data-bind]').forEach(el => { const v = cfg[el.dataset.bind]; if (v != null) el.textContent = v; });
    if (cfg.business_name) document.title = document.title.replace('[NOME DO ESPAÇO]', cfg.business_name);
    const btn = $('.menu-btn'), nav = $('#nav');
    btn?.addEventListener('click', () => {
      const open = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', open);
      btn.innerHTML = icon(open ? 'close' : 'menu'); btn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    });
    addEventListener('scroll', () => h?.classList.toggle('scrolled', scrollY > 8), { passive: true });
    reveal();
  }

  // dados da cliente lembrados só neste aparelho (nunca vêm do servidor): preenchem a marcação seguinte
  const ME_KEY = 'am-cliente';
  const me = {
    get() { try { const v = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); return v && v.email ? v : null; } catch { return null; } },
    set(v) { try { localStorage.setItem(ME_KEY, JSON.stringify({ name: v.name, email: v.email, phone: v.phone })); } catch { /* sem armazenamento */ } },
    clear() { try { localStorage.removeItem(ME_KEY); } catch { /* */ } }
  };

  // ---------- sinal (pagamento para reservar) ----------
  const PAY_OPTS = { mbway: 'MB WAY', transferencia: 'Transferência bancária', mao: 'Em mão (no espaço)' };
  const eur = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
  const depositOf = (price, cfg) => cfg.deposit_enabled && price != null && price > 0 ? Math.round(price * (Number(cfg.deposit_percent) || 50) / 100) : null;
  const copyBtn = v => `<button type="button" class="copy-btn" data-copy="${esc(v)}" aria-label="Copiar ${esc(v)}">Copiar</button>`;
  // caixa com as instruções do sinal — b: { ref, payment_method, deposit_cents, paid_cents, price_cents }
  function payInfo(b, cfg) {
    if (!cfg.deposit_enabled) return '';
    const pct = cfg.deposit_percent || 50, dep = b.deposit_cents, paid = b.paid_cents || 0;
    if (dep != null && paid >= dep) {
      const rest = b.price_cents != null ? b.price_cents - paid : null;
      return `<div class="pay-box ok"><strong>Sinal recebido — obrigada!</strong><p>Já recebi ${eur(paid)}.${rest > 0 ? ` O restante (${eur(rest)}) é pago no final do serviço.` : ''}</p></div>`;
    }
    const mb = String(cfg.mbway_number || '').trim(), iban = String(cfg.iban || '').trim();
    const ibanLine = iban ? `<div class="pay-line"><span>IBAN${cfg.iban_name ? ` · ${esc(cfg.iban_name)}` : ''}</span><b>${esc(iban)}</b>${copyBtn(iban)}</div>` : '';
    const mbLine = mb ? `<div class="pay-line"><span>MB WAY</span><b>${esc(mb)}</b>${copyBtn(mb.replace(/\s/g, ''))}</div>` : '';
    const refLine = `<div class="pay-line"><span>Descrição / referência</span><b>${esc(b.ref)}</b>${copyBtn(b.ref)}</div>`;
    const amount = dep != null ? `<b>${eur(dep)}</b> (${pct}% do valor)` : `<b>${pct}% do valor</b> — combinamos o valor contigo`;
    let how;
    if (b.payment_method === 'mao') how = `<p>Escolheste <b>pagar em mão</b>. Combinamos contigo a entrega do sinal no espaço; os restantes ${100 - pct}% pagas no final do serviço.</p>`;
    else if (b.payment_method === 'transferencia' && iban) how = `<p>Faz uma transferência bancária para:</p>${ibanLine}${refLine}`;
    else if (b.payment_method === 'mbway' || !iban) how = mb ? `<p>Envia por MB WAY para:</p>${mbLine}${refLine}` : '<p>Envio-te os dados para o pagamento por mensagem.</p>';
    else how = `<p>Podes pagar por MB WAY ou transferência:</p>${mbLine}${ibanLine}${refLine}`;
    return `<div class="pay-box"><strong>Sinal para reservar: ${amount}</strong>${how}
      ${b.payment_method === 'mao' ? '' : `<p class="small">${esc(cfg.payment_note || '')}</p>`}</div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    const done = () => { const t = b.textContent; b.textContent = 'Copiado'; setTimeout(() => { b.textContent = t; }, 1600); };
    try { navigator.clipboard.writeText(b.dataset.copy).then(done, () => {}); } catch { /* sem área de transferência */ }
  });
  window.Site = { me, igHandle, igUrl, api, config, icon, esc, $, $$, fmt, photo, stars, hoursTable, hoursSummary, closuresHtml, waLink, telLink, DAYS, reveal, TZ, PAY_OPTS, payInfo, depositOf, eur };
  document.addEventListener('DOMContentLoaded', init);
})();
