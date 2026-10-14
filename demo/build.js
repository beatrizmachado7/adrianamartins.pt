'use strict';
// Gera demo/dist/demo.html: o site e o painel reais num único ficheiro, com a API simulada no browser.
// Uso: node demo/build.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = f => path.join(ROOT, 'public', f);
const read = f => fs.readFileSync(f, 'utf8');

const PAGES = { index: 'index.html', servicos: 'servicos.html', espaco: 'espaco.html', politicas: 'politicas.html', contactos: 'contactos.html', privacidade: 'privacidade.html', registo: 'registo.html',
  marcar: 'marcar.html', gerir: 'gerir.html', avaliar: 'avaliar.html', oferta: 'oferta.html', admin: 'admin/index.html' };
const RUN = { marcar: ['site', 'booking'], gerir: ['site', 'booking', 'client'], avaliar: ['site', 'booking', 'client'], oferta: ['site', 'booking', 'client'], admin: ['admin'] };

const TPL = {};
const VIDEO_JSON = JSON.stringify(Object.fromEntries(fs.readdirSync(P('assets/video')).map(f => ['/assets/video/' + f, fs.readFileSync(P('assets/video/' + f)).toString('base64')])));
for (const [k, f] of Object.entries(PAGES)) {
  const html = read(P(f));
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  const bodyTag = html.match(/<body([^>]*)>/)[1];
  const attr = n => (bodyTag.match(new RegExp(`${n}="([^"]*)"`)) || [])[1] || '';
  let body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.lastIndexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
  if (k === 'admin') {
    body = body.replace('<p class="muted">Acesso privado. As clientes marcam pelo site.</p>', '<p class="notice info small">Demonstração: entra com <strong>demo@exemplo.pt</strong> e a palavra-passe <strong>demonstracao</strong> (já preenchidos).</p>')
      .replace('id="l-email" type="email"', 'id="l-email" type="email" value="demo@exemplo.pt"').replace('id="l-pass" type="password"', 'id="l-pass" type="password" value="demonstracao"');
  }
  for (const f of fs.readdirSync(P('assets/img'))) body = body.split('/assets/img/' + f).join('data:image/' + (f.endsWith('.webp') ? 'webp' : f.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(P('assets/img/' + f)).toString('base64'));
  TPL[k] = { title, cls: attr('class'), page: attr('data-page'), cta: attr('data-cta'), html: body, run: RUN[k] || ['site', 'pages'] };
}

// CSS com tipos de letra embutidos
let css = read(P('assets/site.css')) + '\n' + read(P('admin/admin.css'));
css = css.replace(/url\("\/assets\/fonts\/([^"]+)"\)/g, (m, f) => `url("data:font/woff2;base64,${fs.readFileSync(P('assets/fonts/' + f)).toString('base64')}")`);

// Scripts reais, executados dentro de uma função com location/history/addEventListener simulados
// imagens do próprio site (ex.: logótipo) embutidas como data URI
const IMG = Object.fromEntries(fs.readdirSync(P('assets/img')).map(f => ['/assets/img/' + f, 'data:image/' + (f.endsWith('.webp') ? 'webp' : f.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(P('assets/img/' + f)).toString('base64')]));
const patch = src => Object.entries(IMG).reduce((t, [k, v]) => t.split(k).join(v), src.replace(/document\.addEventListener\('DOMContentLoaded',/g, '__ready('));
let admin = read(P('admin/admin.js'));
admin = admin.replace("[n.status] || esc(n.status)}</span></li>`",
  "[n.status] || esc(n.status)}</span>${n.demo_link ? ` · <a href=\"${esc(n.demo_link)}\">Abrir o link que a cliente receberia</a>` : ''}</li>`");
if (!admin.includes('demo_link')) throw new Error('patch das notificações falhou (admin.js mudou)');
let client = read(P('assets/client.js')).replace("'tk:' + location.pathname", "'tk:' + document.body.dataset.page");
const SCRIPTS = { site: read(P('assets/site.js')), pages: read(P('assets/pages.js')), booking: read(P('assets/booking.js')), client, admin: read(P('admin/vendor/qrcode.js')) + '\n' + admin };
const fns = Object.entries(SCRIPTS).map(([k, s]) => `${JSON.stringify(k)}: function (location, history, addEventListener, __ready) {\n${patch(s)}\n}`).join(',\n');

const safe = s => JSON.stringify(s).replace(/<\//g, '<\\/');
const out = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Demonstração do site de estética</title>
<style>
${css}
.demo-bar { position: relative; z-index: 60; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; justify-content: center; padding: 8px 16px; background: #3a2a20; color: #f3ece3; font: 500 .82rem/1.4 var(--sans); text-align: center; }
.demo-bar strong { color: #e9dcc5; letter-spacing: .08em; text-transform: uppercase; font-size: .72rem; }
.demo-bar a, .demo-bar button { color: #fff; background: none; border: 0; font: inherit; text-decoration: underline; text-decoration-color: #b8935a; text-underline-offset: 3px; cursor: pointer; padding: 2px 0; }
.demo-bar a[aria-current="page"] { text-decoration: none; font-weight: 700; }
a[download] { display: none !important; }
.demo-bar button[aria-pressed="true"] { background: #b8935a; color: #2a1e17; border-radius: 999px; padding: 2px 12px; text-decoration: none; font-weight: 600; }
.demo-sync { font-size: .74rem; color: #e9dcc5; opacity: .85; }
.demo-float { position: fixed; top: auto; bottom: 90px; left: 16px; right: 16px; z-index: 200; border: 1px solid #e9dcc5; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.12); }
.demo-hint { position: sticky; top: 0; z-index: 59; background: #f6efe2; color: #5e420f; padding: 8px 16px; text-align: center; font: 500 .85rem/1.4 var(--sans); border-bottom: 1px solid #e9dcc5; }
body.demo-editing .demo-editable { outline: 1.5px dashed #b8935a; outline-offset: 3px; border-radius: 4px; cursor: text; }
body.demo-editing .demo-editable:focus { outline: 2px solid #82612c; background: rgba(246, 239, 226, .6); }
body.demo-editing .site-header { position: relative; }
.demo-list { list-style: none; padding: 0; margin: 16px 0 0; display: grid; gap: 12px; }
.demo-list li { display: grid; gap: 4px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.demo-list s { color: var(--brown-500); }
.demo-list .link-btn { justify-self: start; font-size: .88rem; }
.demo-tool { font: 600 .82rem var(--sans); border: 1px dashed #b8935a; background: #fbf6ec; color: #6b4e1f; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.demo-tool-add { margin-top: 14px; }
.demo-tool-rm { padding: 4px 10px; font-size: .76rem; }

</style>
<div id="demo-boot" style="padding:40px 16px;text-align:center;font:15px system-ui;color:#5a4335">A carregar a demonstração…</div>
<script>
window.DEMO_CATALOGO = ${JSON.stringify(JSON.parse(read(path.join(ROOT, 'src', 'catalogo.json'))).categorias)};
window.DEMO_IMG = ${JSON.stringify(Object.fromEntries(fs.readdirSync(P('assets/img')).map(f => ['/assets/img/' + f, 'data:image/' + (f.endsWith('.webp') ? 'webp' : f.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(P('assets/img/' + f)).toString('base64')])))};
// vídeo do espaço: embutido e convertido num endereço local (blob) para tocar sozinho
window.DEMO_VIDEO = (function () {
  var out = {}, src = ${VIDEO_JSON};
  Object.keys(src).forEach(function (k) {
    try { var bin = atob(src[k]), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      out[k] = URL.createObjectURL(new Blob([u], { type: 'video/mp4' })); } catch (e) { /* sem vídeo */ }
  });
  return out;
})();
${read(path.join(__dirname, 'mock-api.js'))}
(function () {
  'use strict';
  var PANEL_ONLY = false;
  var TPL = ${safe(TPL)};
  var SCRIPTS = {
${fns}
  };
  var ORIGIN = 'https://www.o-seu-site.pt';
  var listeners = [], fake = { hashchange: [], popstate: [] }, baseNodes = null, L;

  function makeLocation(pathname, search, hash) {
    var h = hash || '';
    return {
      pathname: pathname, search: search || '', origin: ORIGIN,
      get hash() { return h; },
      set hash(v) { v = String(v || ''); var nv = v && v[0] !== '#' ? '#' + v : v; if (nv === '#') nv = ''; if (nv === h) return; h = nv;
        fake.hashchange.slice().forEach(function (fn) { setTimeout(fn, 0); }); },
      get href() { return ORIGIN + this.pathname + this.search + h; },
      set href(v) { navigate(v); },
      assign: function (v) { navigate(v); }, replace: function (v) { navigate(v); }, reload: function () { navigate(this.pathname + this.search + h); }
    };
  }
  var fakeHistory = {
    state: null,
    pushState: function (st, t, url) { this.state = st; apply(url); },
    replaceState: function (st, t, url) { this.state = st; apply(url); },
    back: function () {}, forward: function () {}, go: function () {}
  };
  function apply(url) { if (url == null) return; var u = new URL(String(url), ORIGIN + L.pathname); L.pathname = u.pathname; L.search = u.search; }
  function scopedAdd(type, fn, opts) {
    if (fake[type]) { fake[type].push(fn); return; }
    window.addEventListener(type, fn, opts); listeners.push([type, fn, opts]);
  }
  function ready(fn) { setTimeout(fn, 0); }
  function pageOf(p) {
    if (p === '/' || p === '/index.html' || p === '') return 'index';
    if (p.indexOf('/admin') === 0) return 'admin';
    var m = p.match(/^\\/([a-z]+)\\.html$/); return m && TPL[m[1]] ? m[1] : 'index';
  }
  function render(page, search, hash) {
    listeners.forEach(function (l) { window.removeEventListener(l[0], l[1], l[2]); });
    listeners = []; fake = { hashchange: [], popstate: [] };
    document.querySelectorAll('dialog[open]').forEach(function (d) { try { d.close(); } catch (e) {} });
    Array.prototype.slice.call(document.body.childNodes).forEach(function (n) { if (baseNodes.indexOf(n) === -1) n.remove(); });
    var t = TPL[page], b = document.body;
    b.className = t.cls; b.removeAttribute('data-page'); b.removeAttribute('data-cta');
    if (t.page) b.dataset.page = t.page; if (t.cta) b.dataset.cta = t.cta;
    var bar = '<div class="demo-bar" role="note"><strong>Demonstração</strong><span>Dados de exemplo, guardados só neste browser. Nenhum email é enviado.</span>' +
      (PANEL_ONLY ? '' : '<a href="/"' + (page !== 'admin' ? ' aria-current="page"' : '') + '>Site</a><a href="/admin/"' + (page === 'admin' ? ' aria-current="page"' : '') + '>Painel</a>' +
      '<button type="button" id="demo-edit" aria-pressed="' + editing + '">' + (editing ? 'Terminar edição' : 'Editar textos') + '</button>' +
      '<button type="button" id="demo-changes">Alterações (' + Object.keys(window.DemoAPI.state().textEdits).length + ')</button>') +
      '<button type="button" id="demo-reset">Repor dados</button><span id="demo-sync" class="demo-sync"></span></div>' +
      (editing ? '<div class="demo-hint" role="status">Modo de edição: toca num título, texto ou botão para o alterares. A alteração fica guardada quando sais do campo.</div>' : '');
    b.insertAdjacentHTML('afterbegin', bar + t.html);
    document.title = t.title + ' · Demonstração';
    L = makeLocation(page === 'admin' ? '/admin/' : '/' + (page === 'index' ? '' : page + '.html'), search, hash);
    window.Site = undefined; window.Booking = undefined;
    t.run.forEach(function (k) { SCRIPTS[k].call(window, L, fakeHistory, scopedAdd, ready); });
    document.getElementById('demo-reset').onclick = function () { window.DemoAPI.reset(); render(page, '', ''); };
    if (!PANEL_ONLY) {
      document.getElementById('demo-edit').onclick = function () { editing = !editing; render(page, L.search, L.hash); };
      document.getElementById('demo-changes').onclick = showChanges;
    }
    b.classList.toggle('demo-editing', editing);
    current = { page: page, search: search, hash: hash };
    setSync(syncMsg);
    watchEdits();
    window.scrollTo(0, 0);
    if (hash && page !== 'admin') setTimeout(function () { var el = document.getElementById(hash.slice(1)); if (el) el.scrollIntoView(); }, 700);
  }
  // ---------- edição de textos ----------
  var editing = false, current = null, mo = null, syncMsg = '';
  var EDITABLE = 'main h1, main h2, main h3, main h4, main p, main li, main a.btn, main a.text-link, main button.link-btn, main .label-h, main blockquote, main dt, main .chip,' +
    '.site-footer h4, .site-footer p, .site-footer li > a, .site-footer li > span, .site-footer [data-set], .nav a, .brand span, dialog h2, dialog p';
  // textos que vêm das definições: ao editar, muda a definição (e por isso em todo o site e no painel)
  var SETTING_KEYS = ['business_name', 'professional_name', 'hero_title', 'hero_subtitle', 'about_text', 'address_line', 'postal_code', 'city', 'phone', 'email', 'legal_id'];
  function settingFor(text) { var st = window.DemoAPI.state().settings; for (var i = 0; i < SETTING_KEYS.length; i++) if (String(st[SETTING_KEYS[i]]).trim() === text) return SETTING_KEYS[i]; return null; }
  function scopeOf(el) { return el.closest('.site-header, .site-footer, .mobile-cta') ? '*' : current.page; }
  function candidates() {
    return Array.prototype.filter.call(document.querySelectorAll(EDITABLE), function (el) {
      if (el.closest('.demo-bar, .demo-hint, #demo-dlg, .admin-side, .shell, .demo-tool')) return false;
      if (el.matches('.details-btn')) return false;
      if (el.querySelector('svg, img, input, select, textarea, button, a, h1, h2, h3, h4, p, li, ul, div, dl')) return false;
      return el.textContent.trim().length > 0;
    });
  }
  // textos que pertencem a dados (categorias e tipos de serviço): ao editar, muda o próprio dado
  function entityOf(el) {
    var card = el.closest('[data-cat-id]'), row = el.closest('[data-svc-id]');
    if (row && el.matches('.type-main h3')) return { kind: 'svc', id: row.dataset.svcId, field: 'name' };
    if (row && el.matches('.type-main p')) return { kind: 'svc', id: row.dataset.svcId, field: 'description' };
    if (row && el.matches('.details p')) { var h = el.parentElement.querySelector('h4'); return { kind: 'svc', id: row.dataset.svcId, field: h && /Prepara/.test(h.textContent) ? 'preparation' : 'included' }; }
    if (card && el.matches('.scc-head h2')) return { kind: 'cat', id: card.dataset.catId, field: 'name' };
    if (card && el.matches('.scc-head p, .drawer-desc')) return { kind: 'cat', id: card.dataset.catId, field: 'description' };
    return null;
  }
  function addTools() {
    // no painel lateral dos serviços (modo de edição): acrescentar/remover tipos
    var dr = document.querySelector('#svc-drawer[data-cat-id]');
    if (!dr || dr.hidden || dr.querySelector('.demo-tool-add')) return;
    var catId = dr.dataset.catId, reopen = function () { render(current.page, current.search, '#cat-' + catId); };
    Array.prototype.forEach.call(dr.querySelectorAll('.details[hidden]'), function (d) { d.hidden = false; });
    var add = document.createElement('button'); add.type = 'button'; add.className = 'demo-tool demo-tool-add'; add.textContent = '+ Acrescentar tipo';
    add.onclick = function () { window.DemoAPI.addService(catId); reopen(); };
    dr.querySelector('.drawer-body').appendChild(add);
    Array.prototype.forEach.call(dr.querySelectorAll('.type-row'), function (row) {
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'demo-tool demo-tool-rm'; rm.textContent = 'Remover';
      rm.onclick = function (e) { e.stopPropagation(); window.DemoAPI.removeService(row.dataset.svcId); reopen(); };
      row.querySelector('.type-actions').appendChild(rm);
    });
  }
  function applyEdits() {
    if (!current) return;
    if (editing) addTools();
    var edits = window.DemoAPI.state().textEdits;
    candidates().forEach(function (el) {
      var orig = el.dataset.orig || el.textContent.trim();
      var rec = edits[scopeOf(el) + '|' + orig];
      if (rec) { el.dataset.orig = orig; if (el.textContent.trim() !== rec.text && document.activeElement !== el) el.textContent = rec.text; }
      if (editing && !el.classList.contains('demo-editable')) {
        if (!el.dataset.orig) el.dataset.orig = orig;
        el.setAttribute('contenteditable', 'plaintext-only');
        if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
        el.classList.add('demo-editable');
        el.addEventListener('blur', onBlur); el.addEventListener('keydown', onKey);
      }
    });
  }
  function onKey(e) {
    if (e.key === 'Enter' && !/^(P|BLOCKQUOTE|LI)$/.test(e.target.tagName)) { e.preventDefault(); e.target.blur(); }
  }
  function onBlur(e) {
    var el = e.target, text = el.innerText.replace(/[ \\t]+\\n/g, '\\n').trim(), orig = el.dataset.orig, key = scopeOf(el) + '|' + orig;
    if (!orig) return;
    if (!text) { el.textContent = orig; text = orig; }
    var ent = entityOf(el);
    if (ent) {
      if (text !== orig) { window.DemoAPI.setField(ent.kind, ent.id, ent.field, text); el.dataset.orig = text; }
      return;
    }
    var sk = el.dataset.set || (!window.DemoAPI.state().textEdits[key] && settingFor(orig));
    if (sk) {
      if (text !== orig) { window.DemoAPI.setSetting(sk, text); setTimeout(function () { render(current.page, current.search, current.hash); }, 0); }
      return;
    }
    var edits = window.DemoAPI.state().textEdits;
    if (text === orig) { if (edits[key]) window.DemoAPI.saveText(key, null); }
    else if (!edits[key] || edits[key].text !== text) window.DemoAPI.saveText(key, { page: scopeOf(el) === '*' ? 'todas as páginas' : current.page, original: orig, text: text, at: Date.now() });
    var c = document.getElementById('demo-changes'); if (c) c.textContent = 'Alterações (' + Object.keys(window.DemoAPI.state().textEdits).length + ')';
  }
  function watchEdits() {
    if (mo) mo.disconnect();
    var t = null;
    mo = new MutationObserver(function () { clearTimeout(t); t = setTimeout(applyEdits, 60); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(applyEdits, 0);
  }
  function escH(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function showChanges() {
    var edits = window.DemoAPI.state().textEdits, keys = Object.keys(edits);
    var d = document.getElementById('demo-dlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'demo-dlg'; document.body.appendChild(d); baseNodes.push(d); }
    d.innerHTML = '<div class="dlg-body"><div class="dlg-head"><h2 style="font-size:1.5rem;margin:0">Textos alterados</h2><button type="button" class="icon-btn" data-x aria-label="Fechar">×</button></div>' +
      (keys.length ? '<ul class="demo-list">' + keys.map(function (k) { var r = edits[k]; return '<li><span class="small muted">' + escH(r.page) + '</span><s>' + escH(r.original) + '</s><strong>' + escH(r.text) + '</strong><button type="button" class="link-btn" data-undo="' + escH(k) + '">Repor original</button></li>'; }).join('') + '</ul>'
        : '<p class="muted">Ainda não alteraste nenhum texto. Carrega em "Editar textos" na barra escura e toca no texto que queres mudar.</p>') +
      '<p class="small muted" style="margin-top:16px">' + (dbOn ? 'As alterações ficam guardadas nesta demonstração e o Claude consegue lê-las para as passar para o site real.' : 'As alterações ficam guardadas neste browser.') +
      ' Serviços, preços, horários e textos como a apresentação mudam-se no Painel.</p></div>';
    d.querySelector('[data-x]').onclick = function () { d.close(); };
    Array.prototype.forEach.call(d.querySelectorAll('[data-undo]'), function (bt) { bt.onclick = function () { window.DemoAPI.saveText(bt.dataset.undo, null); d.close(); render(current.page, current.search, current.hash); showChanges(); }; });
    if (!d.open) d.showModal();
  }
  function setSync(m) { syncMsg = m; var el = document.getElementById('demo-sync'); if (el) el.textContent = m; }

  // ---------- guardar na própria demonstração (capacidade db do artefacto) ----------
  var dbOn = false;
  async function connectDb() {
    if (!window.claude || !window.claude.use) return;
    var db = null; try { db = await window.claude.use('db'); } catch (e) { db = null; }
    if (!db) return;
    var ref = db.doc('demo/state');
    try {
      var snap = await ref.get();
      if (snap.exists && snap.data().json) { window.DemoAPI.load(JSON.parse(snap.data().json)); if (current) render(current.page, current.search, current.hash); }
    } catch (e) { return; }
    dbOn = true;
    var writing = Promise.resolve(), timer = null, canWrite = true;
    setSync('✓ Guardado');
    window.DemoAPI.onSave = function (st) {
      if (!canWrite) return;
      clearTimeout(timer); setSync('A guardar…');
      timer = setTimeout(function () {
        var copy = JSON.parse(JSON.stringify(st, function (k, v) { return typeof v === 'string' && v.indexOf('data:') === 0 ? '' : v; }));
        copy.notifications = (copy.notifications || []).slice(0, 60); copy.loggedIn = false;
        var json = JSON.stringify(copy);
        if (json.length > 240000) { copy.bookings = copy.bookings.slice(-150); copy.notifications = []; json = JSON.stringify(copy); }
        writing = writing.then(function () { return ref.set({ json: json, updatedAt: Date.now() }); })
          .then(function () { setSync('✓ Guardado'); })
          .catch(function (e) { if (e && e.code === 'invalid_argument') { canWrite = false; dbOn = false; setSync('Guardado só neste browser'); } else setSync('Não foi possível guardar'); });
      }, 900);
    };
  }

  function navigate(href) {
    var u = new URL(String(href), ORIGIN + (L ? L.pathname : '/'));
    var page = pageOf(u.pathname);
    if (PANEL_ONLY && page !== 'admin') {
      var n = document.createElement('div'); n.className = 'demo-hint demo-float'; n.setAttribute('role', 'status');
      n.textContent = 'Esta demonstração mostra só o painel. Essa página faz parte do site das clientes.';
      document.body.appendChild(n); setTimeout(function () { n.remove(); }, 3200); return;
    }
    if (L && page === pageOf(L.pathname) && u.search === L.search && u.hash && page === 'admin') { L.hash = u.hash; return; }
    render(page, u.search, u.hash);
  }
  document.addEventListener('click', function (e) {
    if (editing && e.target.closest && e.target.closest('.demo-editable, #drawer-go')) { e.preventDefault(); e.stopPropagation(); return; }
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || a.hasAttribute('download')) return;
    var href = a.getAttribute('href');
    if (href.indexOf(ORIGIN) === 0) href = href.slice(ORIGIN.length) || '/';
    if (href[0] === '#') {
      e.preventDefault();
      if (L.pathname === '/admin/') { L.hash = href; return; }
      var el = document.getElementById(href.slice(1)); if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (href[0] === '/') { e.preventDefault(); navigate(href); }
  }, true);
  function start() {
    document.getElementById('demo-boot').remove();
    baseNodes = Array.prototype.slice.call(document.body.childNodes);
    var h = (window.location.hash || '').slice(1);
    var startPage = PANEL_ONLY ? 'admin' : { painel: 'admin', admin: 'admin', marcar: 'marcar', servicos: 'servicos', registo: 'registo' }[h] || 'index';
    render(startPage, '', '');
    connectDb();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
</script>
`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'demo.html'), out);
console.log('demo/dist/demo.html', Math.round(out.length / 1024) + ' KB');

// versão só do painel (sem o site das clientes nem o vídeo)
let panel = out.replace('var PANEL_ONLY = false;', 'var PANEL_ONLY = true;').replace(VIDEO_JSON, '{}').replace(safe(TPL), safe({ admin: TPL.admin }));
panel = panel.replace(/<title>[^<]*<\/title>/, '<title>Painel Adriana Martins</title>');
if (!panel.includes('var PANEL_ONLY = true;')) throw new Error('versão do painel falhou');
fs.writeFileSync(path.join(__dirname, 'dist', 'painel.html'), panel);
console.log('demo/dist/painel.html', Math.round(panel.length / 1024) + ' KB');
