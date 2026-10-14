/* Conteúdo dinâmico das páginas públicas (dados vêm da API e são editáveis no painel). */
(function () {
  'use strict';
  const { api, config, icon, esc, $, $$, fmt, photo, stars, hoursTable, hoursSummary, closuresHtml, waLink, telLink } = window.Site;

  const priceNote = s => s.price_type !== 'fixed' && s.price_note ? `<p class="price-note">${s.price_type === 'variable' ? '* ' : ''}${esc(s.price_note)}</p>` : '';
  const svcCard = (s, catName) => `<article class="svc-card${s.image_url ? '' : ' no-photo'}">
      ${s.image_url ? photo(s.image_url, s.name) : ''}
      <div class="svc-body">
        ${catName && catName !== s.name ? `<span class="svc-kicker">${esc(catName)}</span>` : ''}
        <h3>${esc(s.name)}</h3>
        <div class="meta"><span class="price">${fmt.price(s.price_cents, s.price_type)}</span></div>
        ${priceNote(s)}
        <a class="btn small" href="/marcar.html?servico=${s.id}" aria-label="Marcar ${esc(s.name)}">Marcar</a>
      </div>
    </article>`;

  // feedback recebido pelas redes sociais (texto das mensagens, sem nomes nem fotografias das clientes)
  function testimonials(c) {
    const list = (c.testimonials || []).map(t => { const i = String(t).indexOf('|'); return i > -1 ? { service: t.slice(0, i).trim(), text: t.slice(i + 1).trim() } : { service: '', text: String(t).trim() }; }).filter(t => t.text);
    const sec = $('#fb-sec'); if (!sec) return 0;
    sec.hidden = !list.length;
    $('#testimonials').innerHTML = list.map(t => `<figure class="fb-card"><span class="fb-q" aria-hidden="true">“</span>
        <blockquote>${esc(t.text)}</blockquote>
        <figcaption>${t.service ? `<span class="fb-svc">${esc(t.service)}</span>` : ''}<span class="fb-src">${icon('instagram')} Mensagem de cliente</span></figcaption></figure>`).join('');
    const ig = $('#fb-ig'); if (ig && c.instagram) { ig.href = Site.igUrl(c.instagram); ig.hidden = false; }
    return list.length;
  }

  // serviços de uma categoria agrupados pelo "grupo" (ex.: Gel, Extras, Packs), pela ordem definida no painel
  const byGroup = list => list.reduce((acc, s) => { const g = s.group_name || ''; const last = acc[acc.length - 1];
    if (last && last.name === g) last.items.push(s); else acc.push({ name: g, items: [s] }); return acc; }, []);

  const addressHtml = c => `${esc(c.address_line)}<br>${esc(c.postal_code)}${c.city ? ' - ' + esc(c.city) : ''}`;
  const mapsUrl = c => c.map_link_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.address_line}, ${c.postal_code} ${c.city}`)}`;
  const steps = list => list.map(s => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('');

  // texto com parágrafos (linha em branco = novo parágrafo)
  const rich = t => String(t || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean).map(x => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('');

  const pages = {
    async index() {
      const [c, svc, rv] = await Promise.all([config(), api('/services'), api('/reviews?limit=1')]);
      $('#hero-title').textContent = c.hero_title;
      $('#hero-sub').textContent = c.hero_subtitle;
      // fotografia de fundo do primeiro ecrã, com opacidade baixa para o texto se ler bem
      // a fotografia por omissão já vem no HTML (aparece mais cedo); só se troca se tiver sido mudada no painel
      const heroImg = $('#hero-photo img');
      if (!c.hero_image) { $('#hero-photo').innerHTML = ''; $('#hero').classList.remove('has-photo'); }
      else if (!heroImg || heroImg.getAttribute('src') !== c.hero_image) {
        $('#hero-photo').innerHTML = `<img src="${esc(c.hero_image)}" alt="" fetchpriority="high" decoding="async">`;
        $('#hero').classList.add('has-photo');
      }
      const all = svc.categories.flatMap(cat => cat.services.filter(s => s.bookable !== 0).map(s => ({ ...s, _cat: cat.name })));
      const feat = (all.filter(s => s.featured).length ? all.filter(s => s.featured) : all).slice(0, 4);
      $('#featured').innerHTML = feat.map(s => svcCard(s, s._cat)).join('') || '<p class="empty-line">Serviços em breve.</p>';
      $('#about-photo').innerHTML = photo(c.about_image, 'Fotografia da esteticista');
      $('#about-text').textContent = c.about_text;
      const nFb = testimonials(c);
      // estrelas no topo do feedback: o número acompanha os feedbacks mostrados no site (Definições → Textos: feedback das clientes)
      const rl = $('#rating-line'), nTot = nFb;
      if (rl && nTot) { rl.innerHTML = `${stars(rv.count ? rv.average : 5)}<span>${nTot} ${nTot === 1 ? 'feedback de cliente' : 'feedbacks de clientes'}</span>`; rl.hidden = false; $('#fb-sec').hidden = false; }
      $('#address').innerHTML = addressHtml(c);
      $('#directions').href = mapsUrl(c);
      $('#hours').innerHTML = hoursSummary(c.hours);
      // dados estruturados para o Google (só com os campos já preenchidos)
      const real = v => v && !/^\[/.test(v);
      const ld = { '@context': 'https://schema.org', '@type': 'BeautySalon', name: c.business_name, url: location.origin + '/',
        image: real(c.hero_image) ? new URL(c.hero_image, location.origin).href : undefined,
        telephone: real(c.phone) ? c.phone : undefined, email: real(c.email) ? c.email : undefined,
        address: { '@type': 'PostalAddress', streetAddress: real(c.address_line) ? c.address_line : undefined, postalCode: real(c.postal_code) ? c.postal_code : undefined, addressLocality: real(c.city) ? c.city : undefined, addressCountry: 'PT' },
        sameAs: c.instagram ? [Site.igUrl(c.instagram)] : undefined, priceRange: '€€' };
      let tag = document.getElementById('ld-business');
      if (!tag) { tag = document.createElement('script'); tag.type = 'application/ld+json'; tag.id = 'ld-business'; document.head.appendChild(tag); }
      tag.textContent = JSON.stringify(ld);
      $('#closures').innerHTML = closuresHtml(c.closures);
    },
    async servicos() {
      const svc = await api('/services');
      const cats = svc.categories;
      const sparkle = '<svg class="orn" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.6 4.6 2.3 6.4 6.9 7-4.6.6-6.3 2.4-6.9 7-.6-4.6-2.3-6.4-6.9-7 4.6-.6 6.3-2.4 6.9-7z" fill="currentColor"/></svg>';
      const bookable = c => c.services.filter(x => x.bookable !== 0);
      const fromPrice = c => { const p = bookable(c).map(x => x.price_cents).filter(v => v != null); return p.length ? `Desde ${fmt.price(Math.min(...p), 'fixed')}` : ''; };
      // cartões compactos, lado a lado
      $('#price-list').innerHTML = cats.map(c => `<article class="svc-cat-card compact" id="cat-${c.id}" data-cat-id="${c.id}" aria-labelledby="h-cat-${c.id}">
        ${c.image_url ? photo(c.image_url, c.name) : ''}
        <header class="scc-head">${sparkle}<h2 id="h-cat-${c.id}">${esc(c.name)}</h2>${c.description && !c.description.startsWith('[') ? `<p>${esc(c.description)}</p>` : ''}</header>
        <p class="scc-meta"><span>${bookable(c).length} ${bookable(c).length === 1 ? 'opção' : 'opções'}</span>${fromPrice(c) ? `<span>${fromPrice(c)}</span>` : ''}</p>
        <div class="scc-foot"><button type="button" class="btn" data-open="${c.id}" aria-haspopup="dialog" aria-controls="svc-drawer">Ver preços</button></div>
      </article>`).join('') || '<p class="empty-line">Ainda não há serviços publicados.</p>';

      // painel lateral (esquerda): só para consultar tipos e preços; a marcação faz-se em Marcações
      const drawer = $('#svc-drawer'), backdrop = $('#drawer-backdrop');
      let opener = null;
      const row = s => `<div class="type-row${s.bookable === 0 ? ' is-extra' : ''}" data-svc-id="${s.id}">
          <div class="type-main"><h3>${esc(s.name)}</h3>${s.description && !s.description.startsWith('[') ? `<p>${esc(s.description)}</p>` : ''}
</div>
          <div class="type-actions"><span class="type-price">${fmt.price(s.price_cents, s.price_type)}</span>
            ${s.included || s.preparation ? `<button type="button" class="link-btn details-btn" aria-expanded="false" aria-controls="d-${s.id}">Ver detalhes</button>` : ''}</div>
          ${(s.price_type === 'from' || s.price_type === 'variable') && s.price_note ? `<p class="price-note type-note">${esc(s.price_note)}</p>` : ''}
          ${s.included || s.preparation ? `<div class="details" id="d-${s.id}" hidden>
            ${s.included ? `<div><h4>O que está incluído</h4><p>${esc(s.included)}</p></div>` : ''}
            ${s.preparation ? `<div><h4>Preparação</h4><p>${esc(s.preparation)}</p></div>` : ''}</div>` : ''}
        </div>`;
      function open(catId, btn) {
        const c = cats.find(x => x.id === +catId); if (!c) return;
        opener = btn;
        drawer.dataset.catId = c.id;
        drawer.innerHTML = `<div class="drawer-head"><div>${sparkle}<h2 id="drawer-title">${esc(c.name)}</h2></div>
            <button type="button" class="icon-btn" data-close aria-label="Fechar">${icon('close')}</button></div>
          <div class="drawer-body">
            ${c.description && !c.description.startsWith('[') ? `<p class="drawer-desc">${esc(c.description)}</p>` : ''}
            ${byGroup(c.services).map(g => `<section class="type-group">${g.name ? `<h3 class="group-h">${esc(g.name)}</h3>` : ''}
              ${g.items.some(x => x.bookable === 0) ? '<p class="group-hint">Os extras (◇) são acrescentados durante o atendimento.</p>' : ''}
              <div class="type-list">${g.items.map(row).join('')}</div></section>`).join('')}
            ${c.note ? `<p class="cat-note">${esc(c.note)}</p>` : ''}
          </div>
          <div class="drawer-foot"><p class="drawer-pick small muted">Já sabes o que queres? Escolhe o tipo, o dia e a hora em Marcações.</p>
            <a class="btn" id="drawer-go" href="/marcar.html?categoria=${c.id}">Fazer marcação</a></div>`;
        drawer.hidden = false; backdrop.hidden = false;
        requestAnimationFrame(() => { drawer.classList.add('open'); backdrop.classList.add('open'); });
        document.documentElement.classList.add('drawer-lock');
        $('[data-close]', drawer).focus();
      }
      function close() {
        drawer.classList.remove('open'); backdrop.classList.remove('open');
        document.documentElement.classList.remove('drawer-lock');
        setTimeout(() => { drawer.hidden = true; backdrop.hidden = true; }, 280);
        opener?.focus();
      }
      $$('[data-open]').forEach(b => b.onclick = () => open(b.dataset.open, b));
      backdrop.onclick = close;
      drawer.addEventListener('click', e => {
        if (e.target.closest('[data-close]')) return close();
        const det = e.target.closest('.details-btn');
        if (det) { const d = document.getElementById(det.getAttribute('aria-controls')), o = d.hidden; d.hidden = !o; det.setAttribute('aria-expanded', o); det.textContent = o ? 'Fechar detalhes' : 'Ver detalhes'; }
      });
      drawer.addEventListener('keydown', e => {
        if (e.key === 'Escape') return close();
        if (e.key === 'Tab') { // manter o foco dentro do painel
          const f = $$('button, a[href], [tabindex="0"]', drawer).filter(x => !x.hidden && x.offsetParent);
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      });
      // abrir diretamente com /servicos.html#cat-ID
      const h = location.hash.match(/^#cat-(\d+)$/); if (h) open(h[1], document.querySelector(`[data-open="${h[1]}"]`));
    },
    async precario() {
      const svc = await api('/services');
      $('#price-table').innerHTML = svc.categories.map(c => `<section class="pt-cat" aria-labelledby="pt-${c.id}">
        <h2 id="pt-${c.id}">${esc(c.name)}</h2>
        ${byGroup(c.services).map(g => `${g.name ? `<h3 class="group-h">${esc(g.name)}</h3>` : ''}
        <ul class="pt-list">${g.items.map(s => `<li>
          <div class="pt-name"><span>${esc(s.name)}</span>${s.description && !s.description.startsWith('[') ? `<small>${esc(s.description)}</small>` : ''}${(s.price_type === 'from' || s.price_type === 'variable') && s.price_note ? `<small>${esc(s.price_note)}</small>` : ''}</div>
          <span class="pt-dots" aria-hidden="true"></span>
          <span class="pt-price">${fmt.price(s.price_cents, s.price_type)}</span>
          ${s.bookable === 0 ? '<span class="pt-book pt-extra">extra</span>' : `<a class="pt-book" href="/marcar.html?servico=${s.id}" aria-label="Marcar ${esc(s.name)}">Marcar</a>`}
        </li>`).join('')}</ul>`).join('')}
        ${c.note ? `<p class="cat-note">${esc(c.note)}</p>` : ''}</section>`).join('') || '<p class="empty-line">Ainda não há serviços publicados.</p>';
    },
    async espaco() {
      const c = await config();
      // apresentação do espaço (não da esteticista — essa fica na página inicial)
      $('#space-photo').innerHTML = photo(c.space_image || (c.gallery || [])[0], 'Fotografia do espaço', 'O espaço Adriana Martins em Massamá', { eager: true });
      if (c.space_title) $('#space-title').textContent = c.space_title;
      $('#space-text').textContent = c.space_text || '';
      $('#space-points').innerHTML = (c.space_points || []).filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('');
      // vídeo: ficheiro próprio (toca sozinho, sem som) ou reel do Instagram
      const reel = String(c.video_url || '').match(/instagram\.com\/(?:reel|p)\/([\w-]+)/i);
      if (c.video_file || reel) {
        $('#video-sec').hidden = false;
        const gal = (c.gallery || []).filter(Boolean), poster = c.video_image || gal[1] || gal[0] || '';
        if (c.video_file) {
          // o vídeo só é descarregado quando está perto de aparecer no ecrã (poupa dados no telemóvel)
          $('#video-box').innerHTML = `<video class="space-video" ${poster ? `poster="${esc(poster)}"` : ''} muted loop playsinline preload="none" aria-label="Vídeo do espaço"></video>`;
          const v = $('#video-box video'); v.muted = true; v.defaultMuted = true;
          const still = matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData;
          const start = () => {
            if (v.src) return; v.src = c.video_file;
            if (still) { v.preload = 'metadata'; v.controls = true; return; }
            v.autoplay = true; v.play?.().catch(() => { v.controls = true; });
          };
          if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '300px 0px' });
            io.observe(v);
          } else start();
        } else if (window.DemoAPI) {
          // na demonstração o Instagram não pode ser incorporado: mostra a capa com ligação para o vídeo
          $('#video-box').innerHTML = `<a class="video-cover" href="https://www.instagram.com/reel/${reel[1]}/" target="_blank" rel="noopener" aria-label="Ver o vídeo no Instagram">
            ${poster ? `<img src="${esc(poster)}" alt="">` : ''}<span class="play" aria-hidden="true"></span><span class="cap">${icon('instagram')} Ver no Instagram</span></a>`;
        } else {
          $('#video-box').innerHTML = `<iframe class="ig-embed" src="https://www.instagram.com/reel/${reel[1]}/embed/" title="Vídeo do espaço no Instagram" loading="lazy" allowtransparency="true" allow="autoplay; encrypted-media" scrolling="no"></iframe>`;
        }
        $('#video-ig').innerHTML = c.instagram ? `<a class="text-link" href="${esc(Site.igUrl(c.instagram))}" target="_blank" rel="noopener">${icon('instagram')} Segue-me no Instagram</a>` : '';
      }
      const imgs = (c.gallery || []).filter(Boolean).filter(u => u !== (c.space_image || (c.gallery || [])[0])).slice(0, 6);
      const n = imgs.length;
      $('#gallery').innerHTML = imgs.map(u => photo(u, 'Fotografia do espaço', 'Fotografia do espaço')).join('');
      $('#gallery').dataset.count = n;
      $('#experience').innerHTML = steps(c.experience_steps);
      if (c.staff.length > 1) {
        $('#team').hidden = false;
        $('#team-list').innerHTML = c.staff.map(s => `<article>${photo(s.photo_url, s.name)}<h3 style="margin-top:16px">${esc(s.name)}</h3>
          <p class="muted">${esc(s.role)}</p>${s.bio ? `<p>${esc(s.bio)}</p>` : ''}</article>`).join('');
      }
    },
    async contactos() {
      const c = await config();
      $('#address').innerHTML = addressHtml(c);
      $('#directions').href = mapsUrl(c);
      $('#access').innerHTML = c.access_info ? `<h2 class="label-h" style="margin-top:28px">Estacionamento e acesso</h2><p>${esc(c.access_info)}</p>` : '';
      $('#contact-list').innerHTML = `
        <li><a href="${telLink(c.phone)}">${icon('phone')} ${esc(c.phone)}</a></li>
        ${c.whatsapp ? `<li><a href="${waLink(c.whatsapp)}" target="_blank" rel="noopener">${icon('phone')} Falar por WhatsApp</a></li>` : ''}
        ${c.instagram ? `<li><a href="${esc(Site.igUrl(c.instagram))}" target="_blank" rel="noopener">${icon('instagram')} ${esc(Site.igHandle(c.instagram))}</a></li>` : ''}
        <li><a href="mailto:${esc(c.email)}">${icon('mail')} ${esc(c.email)}</a></li>`;
      $('#hours').innerHTML = hoursTable(c.hours);
      $('#closures').innerHTML = closuresHtml(c.closures);
    },
    async registo() {
      const c = await config();
      if (c.register_title) $('#reg-title').textContent = c.register_title;
      $('#reg-intro').textContent = c.register_intro || '';
      if (c.register_enabled === false) {
        $('#reg-form').outerHTML = `<div class="notice info">O registo está temporariamente indisponível. Podes marcar diretamente em <a href="/marcar.html">Marcações</a>.</div>`;
        return;
      }
      const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      $('#r-day').innerHTML = '<option value="">Dia</option>' + Array.from({ length: 31 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}">${i + 1}</option>`).join('');
      $('#r-month').innerHTML = '<option value="">Mês</option>' + MESES.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${m}</option>`).join('');
      const known = Site.me.get();
      if (known) { $('#r-name').value = known.name || ''; $('#r-email').value = known.email || ''; $('#r-phone').value = known.phone || ''; }
      const origem = new URLSearchParams(location.search).get('origem') || '';
      const f = $('#reg-form');
      const err = (k, m) => { const el = $('#e-' + k); if (el) el.textContent = m || ''; const inp = f.querySelector(`[name=${k}]`); if (inp) inp.setAttribute('aria-invalid', !!m); };
      f.onsubmit = async e => {
        e.preventDefault();
        ['name', 'email', 'phone', 'birthday'].forEach(k => err(k, ''));
        $('#reg-msg').innerHTML = '';
        const name = f.name.value.trim(), email = f.email.value.trim(), phone = f.phone.value.trim(), d = f.day.value, m = f.month.value;
        let ok = true;
        if (name.split(/\s+/).length < 2) { err('name', 'Indica o nome completo (nome e apelido).'); ok = false; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err('email', 'Indica um email válido.'); ok = false; }
        if (phone.replace(/\D/g, '').length < 9) { err('phone', 'Indica um telemóvel válido (ex.: 912 345 678).'); ok = false; }
        const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][+m - 1];
        if (!d || !m || +d > max) { err('birthday', !d || !m ? 'Indica o dia e o mês do teu aniversário.' : 'Esse dia não existe nesse mês.'); ok = false; }
        if (!ok) return f.querySelector('[aria-invalid="true"]')?.focus();
        const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'A registar…';
        try {
          await api('/register', { method: 'POST', body: { name, email, phone, birthday: `${m}-${d}`, birthday_consent: f.consent.checked, origem, website: f.hp_extra.value } });
          Site.me.set({ name, email, phone });
          $('#reg-app').innerHTML = `<div class="reg-done"><svg class="orn" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.6 4.6 2.3 6.4 6.9 7-4.6.6-6.3 2.4-6.9 7-.6-4.6-2.3-6.4-6.9-7 4.6-.6 6.3-2.4 6.9-7z" fill="currentColor"/></svg>
            <h1>Obrigada, ${esc(name.split(/\s+/)[0])}!</h1><p class="lead">O teu registo está feito. Quando marcares neste aparelho, os teus dados já aparecem preenchidos.</p>
            <div class="actions-row" style="justify-content:center"><a class="btn" href="/marcar.html">Fazer marcação</a><a class="btn secondary" href="/servicos.html">Ver serviços</a></div></div>`;
          scrollTo({ top: 0, behavior: 'smooth' });
        } catch (x) {
          btn.disabled = false; btn.textContent = 'Registar-me';
          if (x.data?.errors) Object.entries(x.data.errors).forEach(([k, v]) => err(k, v));
          $('#reg-msg').innerHTML = `<div class="notice err" style="margin-bottom:14px">${esc(x.message)}</div>`;
        }
      };
    },
    async politicas() {
      const c = await config();
      $('#booking-policy').innerHTML = rich(c.booking_policy);
      $('#booking-rules').textContent = `As marcações online são feitas com pelo menos ${c.min_notice_hours} horas de antecedência e até ${c.max_advance_days} dias antes.`;
      $('#cancel-policy').innerHTML = rich(c.cancellation_policy);
      if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 50);
    },
    async privacidade() {
      const c = await config();
      $('#controller').textContent = c.privacy_controller;
      $('#priv-email').textContent = c.email;
    }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const p = pages[document.body.dataset.page];
    if (!p) return;
    try { await p(); } catch (e) { console.error(e); }
  });
})();
