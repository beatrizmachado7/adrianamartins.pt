'use strict';
// Teste de ponta a ponta no browser (telemóvel 390×844 e computador). Uso: node tests/e2e.js [pasta-screenshots]
const { chromium, devices } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert/strict');

const OUT = process.argv[2] || path.join(os.tmpdir(), 'estetica-shots');
fs.mkdirSync(OUT, { recursive: true });
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'estetica-e2e-'));
const PORT = 3950, BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, DATA_DIR: DIR, JOBS: 'off', RATE_LIMIT: 'off', SEED_SAMPLE_HOURS: '1', PUBLIC_BASE_URL: BASE };
const root = path.join(__dirname, '..');
// serviço 2 com aprovação manual, para testar o estado "Pendente"
execFileSync('node', ['-e', "require('./src/db').db.prepare('UPDATE services SET requires_approval=CASE WHEN id=2 THEN 1 ELSE 0 END').run()"], { env, cwd: root });
execFileSync('node', ['scripts/criar-admin.js', 'admin@exemplo.pt', 'Administração'], { env: { ...env, ADMIN_PASSWORD: 'painel-teste-123' }, cwd: root });

const log = (...a) => console.log('✓', ...a);
(async () => {
  const srv = spawn('node', ['index.js'], { env: { ...env, PORT: String(PORT) }, cwd: root, stdio: 'inherit' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/public/config'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const origNewContext = browser.newContext.bind(browser);
  browser.newContext = async o => { const c = await origNewContext(o); c.setDefaultTimeout(15000); if (process.env.NO_FONTS) await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); return c; };
  const errors = [];
  const phone = await browser.newContext({ ...devices['iPhone 13'], locale: 'pt-PT', timezoneId: 'America/New_York' }); // fuso diferente de propósito
  const shot = async (page, name, full = true) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }); };
  try {
    // ---------- site no telemóvel ----------
    const p = await phone.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
    await p.goto(BASE + '/');
    await p.waitForSelector('#featured .svc-card');
    await p.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')));
    await shot(p, '01-telemovel-inicio');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, 'sem scroll horizontal no telemóvel');
    log('homepage no telemóvel sem scroll horizontal');
    const navItems = await p.$$eval('#nav a', as => as.map(a => a.textContent.trim()));
    assert.deepEqual(navItems, ['Início', 'Serviços', 'O espaço', 'Marcações', 'Contactos'], 'menu com as 5 secções');
    assert.equal((await p.textContent('.hero .btn')).trim(), 'Fazer marcação');
    assert.equal((await p.textContent('.hero .text-link')).trim(), 'Ver serviços');
    assert.equal(await p.locator('main :text-matches("\\d+ ?(min|h)\\b")').count(), 0, 'sem duração visível');
    assert.equal(await p.locator('main > section').count(), 5, 'homepage: 5 secções (feedback com a classificação) + rodapé');
    assert.ok(await p.locator('#featured .svc-card').count() <= 4, 'no máximo 4 serviços em destaque');
    assert.equal((await p.textContent('#hero-title')).trim(), 'Um momento para cuidar de ti.');
    log('homepage: menu, 5 secções e serviços em destaque');
    await p.click('.menu-btn'); await shot(p, '02-telemovel-menu', false); await p.click('.menu-btn');

    await p.goto(BASE + '/servicos.html'); await p.waitForSelector('.svc-cat-card');
    // cartões lado a lado; "Marcar" abre o painel lateral com todas as opções e preços
    assert.ok((await p.textContent('#cat-1 .scc-meta')).includes('Desde'), 'cartão mostra "Desde"');
    await p.locator('#cat-1 .scc-foot button').click();
    await p.waitForSelector('#svc-drawer.open .type-row');
    assert.equal((await p.textContent('#svc-drawer .type-price')).replace(/\s/g, ' ').trim(), '36 €', 'preços no painel');
    assert.ok((await p.$$eval('#svc-drawer .group-h', x => x.map(e => e.textContent))).includes('Gel'), 'subgrupos (Gel, Extras…)');
    assert.ok((await p.textContent('#svc-drawer')).replace(/\s/g, ' ').includes('+1,50 €'), 'extras com "+"');
    assert.equal(await p.locator('#svc-drawer [role=radio]').count(), 0, 'painel só para consultar');
    await shot(p, '03-telemovel-servicos-painel', false);
    await p.click('#drawer-go');
    await p.waitForSelector('#step .option[data-service]');
    assert.match(await p.textContent('#stepper .current'), /Passo 1 de 4/, 'painel → Marcações, passo 1 filtrado pela categoria');
    assert.equal(await p.locator('#step .opt-group h3').count(), 0, 'só os tipos dessa categoria');
    await p.goto(BASE + '/marcar.html'); await p.waitForSelector('#step .bk-cat');
    assert.ok(await p.locator('#step .bk-cat').count() >= 2, 'Marcações: categorias em cartões');
    await shot(p, '03b-telemovel-marcar-cartoes');
    await p.locator('#step .bk-cat').first().locator('button').click();
    await p.waitForSelector('#step .option[data-service]');
    await p.click('#step [data-allcats]'); await p.waitForSelector('#step .bk-cat');
    await p.goto(BASE + '/marcar.html?servico=1');
    await p.waitForSelector('#cal .day.has');
    assert.match(await p.textContent('#stepper .current'), /Passo 2 de 4/, 'serviço já selecionado → passo 2');
    await shot(p, '04-marcar-dia', false);
    await p.locator('#cal .day.has').nth(2).click(); // > 24 h de distância, para poder reagendar
    await p.waitForSelector('.slot');
    await shot(p, '05-marcar-hora');
    const chosenTime = await p.locator('.slot').nth(2).textContent();
    await p.locator('.slot').nth(2).click();
    await p.click('#details-form button[type=submit]'); // vazio → erros de validação
    assert.match(await p.textContent('#e-name'), /nome/);
    await p.fill('#f-name', 'Maria Teste'); await p.fill('#f-phone', '912 345 678');
    await shot(p, '06-marcar-dados', false);
    await p.click('#details-form button[type=submit]');
    await p.waitForSelector('#confirm');
    assert.equal(await p.isDisabled('#confirm'), true, 'confirmação exige aceitar a política');
    assert.ok((await p.textContent('#step')).includes(chosenTime.trim()));
    await p.check('#accept');
    assert.equal(await p.isDisabled('#confirm'), true, 'confirmação exige escolher a forma de pagamento');
    await p.check('input[name=pay][value=mbway]');
    assert.equal(await p.isDisabled('#confirm'), false);
    await shot(p, '07-marcar-rever');
    await p.click('#confirm');
    await p.waitForSelector('.success h2');
    assert.equal((await p.textContent('.success h2')).trim(), 'Marcação confirmada');
    assert.match(await p.textContent('.success .lead'), /A tua marcação está confirmada\. Espero por ti no dia .+, às \d\d:\d\d\./);
    assert.ok(!/email/i.test(await p.textContent('.success')), 'sem referências a email');
    assert.match(await p.getAttribute('.wa-send a', 'href'), /^https:\/\/wa\.me\/351939907962\?text=Ol%C3%A1%20Adriana/, 'enviar o pedido à Adriana por WhatsApp');
    assert.equal(await p.locator('#f-email').count(), 0);
    assert.match(await p.textContent('.success .pay-box'), /Sinal para reservar/);
    assert.match(await p.textContent('.success .pay-box'), /939 907 962/);
    await shot(p, '08-marcar-confirmada');
    log('fluxo completo de marcação no telemóvel (hora', chosenTime.trim() + ', fuso do telemóvel: Nova Iorque)');
    const manage = await p.locator('.success a.btn').last().getAttribute('href');

    // ---------- conflito: duas clientes no mesmo horário ----------
    const ctxA = await browser.newContext({ ...devices['iPhone 13'], locale: 'pt-PT' }), ctxB = await browser.newContext({ ...devices['iPhone 13'], locale: 'pt-PT' });
    const [a, b] = [await ctxA.newPage(), await ctxB.newPage()];
    for (const [pg, n] of [[a, 'Ana'], [b, 'Beatriz']]) {
      await pg.goto(BASE + '/marcar.html?servico=3');
      await pg.locator('#cal .day.has').nth(1).click();
      await pg.locator('.slot').first().click();
      await pg.fill('#f-name', n + ' Teste'); await pg.fill('#f-phone', n === 'Ana' ? '913000001' : '913000002');
      await pg.click('#details-form button[type=submit]'); await pg.check('#accept'); await pg.check('input[name=pay][value=mao]');
    }
    await Promise.all([a.click('#confirm'), b.click('#confirm')]);
    await Promise.all([a.waitForSelector('.success, #confirm-msg .notice'), b.waitForSelector('.success, #confirm-msg .notice')]);
    const okA = await a.locator('.success').count(), okB = await b.locator('.success').count();
    assert.equal(okA + okB, 1, 'só uma das duas clientes consegue o horário');
    const loser = okA ? b : a;
    assert.ok(await loser.locator('[data-alt]').count() > 0, 'mostra alternativas próximas');
    assert.equal((await loser.textContent('#confirm-msg .state')).trim(), 'Indisponível');
    assert.ok(await loser.locator('#confirm-msg [data-waitlist]').count() === 1, 'oferece lista de espera');
    await shot(loser, '09-conflito-alternativas');
    log('conflito simultâneo: 1 confirmada, a outra vê alternativas + lista de espera');
    await loser.locator('[data-alt]').first().click();
    await loser.click('#confirm');
    await loser.waitForSelector('.success');
    log('a segunda cliente reservou uma alternativa');
    await loser.goto(BASE + '/marcar.html?servico=3');
    await loser.locator('#cal .day.has').first().waitFor();
    assert.equal((await loser.textContent('[data-waitlist]')).trim(), 'Avisa-me quando surgir uma vaga.');
    await loser.locator('[data-waitlist]').click();
    await loser.check('#wl-days input[value="2"]', { force: true });
    await loser.fill('#wl-name', 'Beatriz Teste'); await loser.fill('#wl-phone', '913000000');
    await loser.click('#wl-form [type=submit]');
    await loser.waitForSelector('#wl-msg .notice.ok');
    await shot(loser, '10-lista-espera', false);
    log('inscrição na lista de espera');

    // ---------- gerir marcação: reagendar e cancelar ----------
    await p.goto(manage);
    await p.waitForSelector('#resched');
    assert.equal(new URL(p.url()).search, '', 'token retirado do URL visível');
    await shot(p, '11-gerir-marcacao');
    await p.click('#resched');
    await p.locator('#cal .day.has').nth(2).click();
    await p.locator('#slots .slot').first().click();
    await p.click('#do-resched');
    await p.waitForSelector('#panel .notice.ok');
    log('reagendamento pela cliente');
    await p.reload(); await p.waitForSelector('#cancel');
    await p.click('#cancel'); await p.click('#do-cancel');
    await p.waitForSelector('#panel .notice.ok');
    assert.ok((await p.textContent('#app')).includes('Cancelada'));
    log('cancelamento pela cliente (link continua a funcionar após recarregar)');

    // ---------- dashboard no telemóvel (fuso do telemóvel diferente do espaço) ----------
    const ap = await phone.newPage();
    ap.on('pageerror', e => errors.push('painel: ' + e.message));
    await ap.goto(BASE + '/admin/');
    await ap.fill('#l-email', 'admin@exemplo.pt'); await ap.fill('#l-pass', 'errada'); await ap.click('#login-form button');
    await ap.waitForSelector('#l-msg .notice');
    await ap.fill('#l-pass', 'painel-teste-123'); await ap.click('#login-form button');
    await ap.waitForSelector('.kpis');
    const tabs = await ap.$$eval('#tabbar a', a => a.map(x => x.textContent.trim().replace(/\d+$/, '')));
    assert.deepEqual(tabs, ['Dashboard', 'Marcações', 'Calendário', 'Clientes'], 'navegação do telemóvel');
    assert.ok(await ap.isVisible('#tb-more'), 'botão "Mais" no telemóvel');
    assert.equal(await ap.isVisible('#side'), false, 'sem barra lateral no telemóvel');
    assert.equal(await ap.locator('.kpis .kpi').count(), 5, 'cinco cartões');
    assert.ok((await ap.textContent('.kpis')).includes('Faturação do mês'));
    assert.match(await ap.textContent('.hello'), /\d{2}\/\d{2}\/\d{4}/, 'data DD/MM/AAAA');
    assert.equal(await ap.evaluate(() => innerWidth <= screen.width), true, 'sem zoom por conteúdo largo');
    await shot(ap, '12-painel-visao-geral-telemovel');
    assert.equal(await ap.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'painel sem scroll horizontal');
    await ap.click('#tabbar a[href="#calendario"]'); await ap.waitForSelector('#ag-cal');
    await ap.click('[data-mode="mes"]'); await ap.waitForSelector('.month');
    await shot(ap, '13-painel-agenda-mes-telemovel');
    assert.match(await ap.textContent('#ag-body .dp-face'), /^\d{2}\/\d{2}\/\d{4}$/, 'campo de data em DD/MM/AAAA');
    for (const h of ['dashboard', 'marcacoes', 'marcacoes/pedidos', 'calendario', 'calendario/disponibilidade', 'clientes', 'servicos', 'financeiro', 'avaliacoes', 'notificacoes', 'definicoes/lembretes']) {
      await ap.goto(BASE + '/admin/#' + h); await ap.waitForFunction(() => !document.querySelector('#view .loading'));
      assert.equal(await ap.evaluate(() => document.documentElement.scrollWidth > innerWidth || innerWidth > screen.width), false, `sem scroll horizontal em ${h} (telemóvel)`);
    }
    await ap.goto(BASE + '/admin/#marcacoes'); await ap.waitForSelector('#mk-list');
    // a marcação feita no telemóvel (hora de Lisboa) aparece com a mesma hora no painel, apesar do fuso do telemóvel
    await ap.fill('#mk-q', 'Maria Teste'); await ap.waitForSelector('#mk-list [data-booking]');
    const mariaTime = execFileSync('node', ['-e', `const {db}=require('./src/db'); const r=db.prepare("SELECT b.start_at FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE c.name='Maria Teste' ORDER BY b.id DESC").get(); process.stdout.write(new Intl.DateTimeFormat('pt-PT',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(r.start_at));`], { env, cwd: root }).toString();
    assert.ok((await ap.textContent('#mk-list .appt .t')).includes(mariaTime), `hora apresentada no fuso do espaço (${mariaTime})`);
    await ap.locator('#mk-list [data-booking]').first().click(); await ap.waitForSelector('#dlg[open] .kv');
    assert.ok(await ap.isVisible('#dlg[open] a[href^="tel:"]'), 'contactos na ficha da marcação');
    await shot(ap, '13b-painel-detalhe-telemovel');
    await ap.keyboard.press('Escape');
    log('dashboard no telemóvel: navegação inferior com "Mais", 5 cartões, datas DD/MM/AAAA, fuso do espaço');

    // ---------- páginas: o espaço, contactos, políticas ----------
    await p.goto(BASE + '/espaco.html'); await p.waitForSelector('#gallery .photo');
    const g = await p.locator('#gallery .photo').count(); assert.ok(g >= 3 && g <= 6, 'galeria com 3 a 6 fotografias');
    await shot(p, '22-telemovel-espaco');
    await p.goto(BASE + '/contactos.html'); await p.waitForSelector('#hours .hours');
    assert.ok(await p.locator('#directions').getAttribute('href'));
    await shot(p, '23-telemovel-contactos');
    await p.goto(BASE + '/precario.html'); await p.waitForSelector('#price-list .svc-cat-card');
    assert.ok(p.url().endsWith('/servicos.html'), 'preçário redireciona para serviços');
    await p.goto(BASE + '/politicas.html#cancelamento'); await p.waitForSelector('#cancel-policy:not(:empty)');
    log('O espaço (galeria), contactos, preçário e políticas');

    // ---------- painel no computador ----------
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-PT' });
    const d = await desk.newPage();
    d.on('pageerror', e => errors.push('desktop: ' + e.message));
    await d.goto(BASE + '/'); await d.waitForSelector('#featured .svc-card');
    await d.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')));
    await shot(d, '14-computador-inicio');
    await d.goto(BASE + '/marcar.html?servico=1'); await d.waitForSelector('#cal .day.has');
    await shot(d, '15-computador-marcar', false);
    await d.goto(BASE + '/admin/');
    await d.fill('#l-email', 'admin@exemplo.pt'); await d.fill('#l-pass', 'painel-teste-123'); await d.click('#login-form button');
    await d.waitForSelector('.kpis');
    assert.ok(await d.isVisible('#side'), 'barra lateral no computador');
    assert.deepEqual(await d.$$eval('#menu a span:first-of-type', a => a.map(x => x.textContent)), ['Dashboard', 'Marcações', 'Calendário', 'Clientes', 'Serviços', 'Financeiro', 'Avaliações', 'Notificações', 'Definições']);
    assert.ok(await d.isVisible('#logout'), 'terminar sessão no rodapé da barra lateral');
    // serviços: editar preço → reflete no site
    await d.goto(BASE + '/admin/#servicos'); await d.waitForSelector('[data-svc="2"]');
    await shot(d, '16-painel-servicos', false);
    await d.click('[data-svc="2"]'); await d.waitForSelector('#sf');
    await d.fill('#v-p', '55'); await d.check('#v-r'); await d.click('#sf button[type=submit]');
    await d.waitForFunction(() => document.querySelector('[data-svc="2"]')?.closest('.svc-row').textContent.includes('55,00'));
    const pub = await (await fetch(BASE + '/api/public/services')).json();
    assert.equal(pub.categories[0].services.find(s => s.id === 2).price_cents, 5500);
    log('serviço editado no painel → preço atualizado no site');
    // pedido pelo site → pendente → aprovado no painel
    await p.goto(BASE + '/marcar.html?servico=2');
    await p.locator('#cal .day.has').nth(3).click(); await p.locator('.slot').first().click();
    await p.fill('#f-name', 'Sofia Teste'); await p.fill('#f-phone', '914000000');
    await p.click('#details-form button[type=submit]'); await p.check('#accept'); await p.check('input[name=pay][value=mbway]'); await p.click('#confirm');
    await p.waitForSelector('.success h2');
    assert.equal((await p.textContent('.success h2')).trim(), 'Pedido recebido — aguarda confirmação');
    await shot(p, '17-pedido-pendente');
    await d.goto(BASE + '/admin/#calendario'); await d.waitForSelector('#ag-pend .pa-row');
    assert.ok((await d.textContent('#ag-pend')).includes('Sofia Teste'), 'pedido pendente à mão no calendário');
    await d.goto(BASE + '/admin/#notificacoes'); await d.waitForSelector('.feed-row');
    assert.ok((await d.textContent('.feed')).includes('Sofia Teste'), 'pedido nas notificações');
    await d.goto(BASE + '/admin/#marcacoes/pedidos'); await d.waitForSelector('.pend [data-approve]');
    await shot(d, '17b-painel-pedidos', false);
    assert.match(await d.textContent('.pend'), /Sinal por receber · MB WAY/);
    // aprovar sem sinal pede confirmação (dois cliques)
    await d.click('.pend [data-approve]'); assert.match(await d.textContent('.pend [data-approve]'), /Sinal por receber/);
    // registar o sinal (50%) — valor, método e nota já preenchidos
    await d.click('.pend [data-dep]'); await d.waitForSelector('#pf');
    assert.equal(await d.inputValue('#p-v'), '27,50', 'sinal = 50% do preço');
    assert.equal(await d.inputValue('#p-n'), 'Sinal');
    assert.equal(await d.isChecked('input[name=m][value=mbway]'), true);
    await d.click('#pf button[type=submit]'); await d.waitForSelector('#dlg[open] [data-act="approve"]');
    assert.match(await d.textContent('#dlg'), /Sinal recebido/);
    await d.click('[data-act="approve"]'); await d.waitForSelector('#dlg[open] [data-act="move"]');
    await d.keyboard.press('Escape');
    await d.goto(BASE + '/admin/#marcacoes/pedidos'); await d.waitForSelector('#mk-body .empty');
    log('pedido do site: sinal registado e aprovado no painel');
    // agenda semanal com a marcação aprovada
    await d.goto(BASE + '/admin/#calendario'); await d.waitForSelector('#ag-cal');
    await d.click('[data-mode="semana"]'); await d.waitForSelector('.wk');
    for (let i = 0; i < 4 && !(await d.locator('.wk .wk-ev').count()); i++) { await d.click('[data-nav="1"]'); await d.waitForTimeout(300); await d.waitForSelector('.wk'); }
    assert.ok(await d.locator('.wk .wk-ev').count() > 0);
    assert.ok(await d.locator('.wk .wk-ev[draggable="true"]').count() > 0, 'marcações futuras podem ser arrastadas');
    await shot(d, '18-painel-agenda-semana', false);
    // conclusão do atendimento + pagamento (simula que a hora da marcação já passou)
    execFileSync('node', ['-e', `const {db}=require('./src/db'); db.prepare("UPDATE bookings SET start_at=start_at-?, end_at=end_at-? WHERE id=(SELECT b.id FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE c.name='Sofia Teste')").run(10*86400000, 10*86400000);`], { env, cwd: root });
    await d.goto(BASE + '/admin/#clientes'); await d.fill('#cq', 'Sofia'); await d.waitForSelector('.ccard:has-text("Sofia")'); await d.waitForTimeout(400);
    await d.click('.ccard:has-text("Sofia")'); await d.waitForSelector('.profile');
    await d.locator('[data-booking]').first().click(); await d.waitForSelector('#dlg[open] [data-act="complete"]');
    await d.click('[data-act="complete"]'); await d.waitForSelector('#dlg[open] [data-act="pay"]');
    await d.click('[data-act="pay"]'); await d.waitForSelector('#pf');
    assert.equal(await d.inputValue('#p-v'), '27,50', 'valor sugerido = restante (preço − sinal)');
    await d.click('#pf button[type=submit]'); await d.waitForSelector('#dlg[open] .mini-row');
    await shot(d, '19-painel-marcacao-paga', false);
    await d.keyboard.press('Escape');
    await d.goto(BASE + '/admin/#financeiro'); await d.waitForSelector('.kpis');
    await d.click('[data-fm="intervalo"]'); await d.waitForSelector('#f-from');
    const tzToday = await d.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date()));
    await d.fill('#f-from', tzToday); await d.dispatchEvent('#f-from', 'change'); await d.waitForSelector('#fin-body .kpis');
    assert.ok((await d.textContent('#fin-body .kpis')).includes('55,00'), 'total recebido = pagamentos registados');
    await shot(d, '20-painel-financeiro', false);
    await d.goto(BASE + '/admin/#clientes'); await d.fill('#cq', 'Sofia'); await d.waitForSelector('.ccard:has-text("Sofia")'); await d.waitForTimeout(400); await d.click('.ccard:has-text("Sofia")'); await d.waitForSelector('.profile');
    assert.ok((await d.textContent('.kpis')).includes('55,00'), 'histórico da cliente com o pagamento');
    log('conclusão, pagamento, financeiro e histórico da cliente');
    // nenhuma informação de duração em nenhuma área do dashboard
    for (const h of ['dashboard', 'marcacoes', 'marcacoes/pedidos', 'marcacoes/espera', 'calendario', 'calendario/disponibilidade', 'calendario/bloqueios', 'clientes', 'servicos', 'financeiro', 'avaliacoes', 'notificacoes',
      'definicoes/horario', 'definicoes/lembretes', 'definicoes/regras', 'definicoes/espaco', 'definicoes/equipa']) {
      await d.goto(BASE + '/admin/#' + h); await d.waitForFunction(() => !document.querySelector('#view .loading'));
      const txt = await d.textContent('#view');
      assert.ok(!/dura[çc][ãa]o/i.test(txt), `sem "duração" em ${h}`);
      if (/dashboard|marcacoes|calendario|clientes/.test(h)) assert.ok(!/\d\d:\d\d\s*[–-]\s*\d\d:\d\d/.test(txt), `sem hora de fim em ${h}`);
    }
    await d.click('[data-svc="1"]').catch(() => {});
    await d.goto(BASE + '/admin/#servicos'); await d.waitForSelector('[data-svc]'); await d.click('[data-svc]'); await d.waitForSelector('#sf');
    assert.ok(!/dura[çc][ãa]o|minutos/i.test(await d.textContent('#dlg')), 'formulário de serviço sem duração');
    await d.keyboard.press('Escape');
    log('nenhuma duração nem hora de fim no dashboard');
    await d.goto(BASE + '/admin/#definicoes/lembretes'); await d.waitForSelector('#waf');
    assert.equal(await d.locator('#waf textarea').count(), 3, 'três mensagens de WhatsApp: pedido recebido, pedido confirmado, aniversário');
    await shot(d, '21-painel-mensagens', false);
    await d.reload(); await d.waitForSelector('#waf');
    log('mensagens de WhatsApp editáveis; sessão persiste ao recarregar');

    assert.deepEqual(errors, [], 'sem erros de JavaScript');
    log('sem erros de JavaScript na consola');
    console.log('\nTODOS OS TESTES E2E PASSARAM. Screenshots em', OUT);
  } catch (e) {
    console.error('FALHOU:', e.message, '\nErros JS:', errors);
    process.exitCode = 1;
  } finally { await browser.close(); srv.kill(); }
})();
