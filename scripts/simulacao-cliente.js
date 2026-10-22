'use strict';
// Simulação completa da experiência da cliente (telemóvel), com capturas e os emails gerados.
// Uso: CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/simulacao-cliente.js <pasta-saida>
const { chromium, devices } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const OUT = process.argv[2] || path.join(os.tmpdir(), 'simulacao');
fs.mkdirSync(OUT, { recursive: true });
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'estetica-sim-'));
const PORT = 3960, BASE = `http://127.0.0.1:${PORT}`;
const root = path.join(__dirname, '..');
const env = { ...process.env, DATA_DIR: DIR, JOBS: 'off', RATE_LIMIT: 'off', SEED_SAMPLE_HOURS: '1', PUBLIC_BASE_URL: 'https://www.adrianamartins.pt' };
const node = code => execFileSync('node', ['-e', code], { env, cwd: root, encoding: 'utf8' });
node("require('./src/db')");
execFileSync('node', ['scripts/criar-admin.js', 'amartinsestetica@icloud.com', 'Adriana Martins'], { env: { ...env, ADMIN_PASSWORD: 'simulacao-painel-1' }, cwd: root });

const steps = [];
const add = (who, title, text, img, extra = {}) => steps.push({ who, title, text, img, ...extra });
const emails = id => JSON.parse(node(`const {db}=require('./src/db');console.log(JSON.stringify(db.prepare("SELECT kind,recipient,subject,body,status FROM notifications WHERE booking_id=? ORDER BY id").all(${id})))`));

(async () => {
  const srv = spawn('node', ['index.js'], { env: { ...env, PORT: String(PORT) }, cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/api/public/config'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'pt-PT', timezoneId: 'Europe/Lisbon' });
  const admCtx = await browser.newContext({ ...devices['iPhone 13'], locale: 'pt-PT', timezoneId: 'Europe/Lisbon' });
  ctx.setDefaultTimeout(15000); admCtx.setDefaultTimeout(15000);
  const errors = [];
  let n = 0;
  const shot = async (page, sel) => {
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('.toast, #toast, [role=status].show').forEach(t => t.style.display = 'none'));
    if (sel === 'top') await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    else if (sel) await page.locator(sel).first().evaluate(e => { const y = e.getBoundingClientRect().top + scrollY - 80; scrollTo({ top: Math.max(0, y), behavior: 'instant' }); });
    await page.waitForTimeout(350);
    const f = `${String(++n).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(OUT, f) });
    return f;
  };
  const c = await ctx.newPage();
  c.on('pageerror', e => errors.push(e.message));
  try {
    // 1. chega ao site (link do Instagram)
    await c.goto(BASE + '/'); await c.waitForSelector('#featured .feat-card');
    await c.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')));
    add('cliente', 'Chega ao site', 'A cliente abre o link que a Adriana partilhou no Instagram. Vê logo a fotografia, o título e o botão "Fazer marcação" (que acompanha o scroll).', await shot(c));
    add('cliente', 'Vê os serviços em destaque', 'Os serviços mais procurados, com preço, logo na página inicial.', await shot(c, '#featured'));
    await c.waitForSelector('#fb-sec:not([hidden])').catch(() => {}); await c.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')));
    if (await c.locator('#fb-sec:not([hidden])').count()) add('cliente', 'Lê o que outras clientes dizem', 'Os testemunhos tirados das mensagens do Instagram (sem nomes nem fotos).', await shot(c, '#fb-sec'));
    // 2. serviços
    await c.goto(BASE + '/servicos.html'); await c.waitForSelector('.svc-cat-card');
    add('cliente', 'Consulta os serviços e preços', 'Cada categoria tem um cartão; ao carregar abre a lista completa de opções e preços.', await shot(c));
    // 3. marcação
    await c.goto(BASE + '/marcar.html'); await c.waitForSelector('[data-pick-cat]');
    add('cliente', 'Passo 1 — escolhe a categoria', 'Em Marcações, começa por escolher a categoria.', await shot(c));
    await c.locator('[data-pick-cat]').first().click(); await c.waitForSelector('[data-service]');
    add('cliente', 'Escolhe o tipo de serviço', 'Vê todas as opções com o preço de cada uma.', await shot(c, '#step'));
    await c.click('[data-service="13"]'); await c.waitForSelector('#cal .day.has');
    add('cliente', 'Passo 2 — escolhe o dia', 'O calendário só mostra os dias com horários livres.', await shot(c, '#step'));
    await c.locator('#cal .day.has').first().click(); await c.waitForSelector('.slot');
    add('cliente', 'Escolhe a hora', 'Aparecem só as horas disponíveis nesse dia.', await shot(c, '#slots-wrap'));
    await c.locator('.slot').first().click(); await c.waitForSelector('#details-form');
    await c.fill('#f-name', 'Joana Silva'); await c.fill('#f-email', 'joana.silva@exemplo.pt'); await c.fill('#f-phone', '912 345 678');
    add('cliente', 'Passo 3 — os seus dados', 'Nome, email e telefone. Fica marcado "Lembrar os meus dados", para a próxima marcação ser mais rápida.', await shot(c, '#step'));
    await c.click('#details-form button[type=submit]'); await c.waitForSelector('#confirm');
    add('cliente', 'Passo 4 — revê a marcação', 'Resumo do serviço, preço, dia e hora antes de enviar.', await shot(c, '#step'));
    await c.check('input[name=pay][value=mbway]');
    add('cliente', 'Escolhe como pagar o sinal', 'Para reservar, é pedido um sinal de 50% (aqui 9,00 €). Escolhe MB WAY, transferência (aparece quando o IBAN estiver preenchido) ou em mão.', await shot(c, '.pay-choice'));
    await c.check('#accept');
    add('cliente', 'Aceita as condições e envia', 'Lê as condições de cancelamento (48 h) e o sinal, aceita e carrega em "Enviar pedido".', await shot(c, '.policy'));
    await c.click('#confirm'); await c.waitForSelector('.success h2');
    add('cliente', 'Pedido recebido', 'O horário fica reservado durante 24 h enquanto a Adriana confirma.', await shot(c));
    add('cliente', 'Dados para pagar o sinal', 'MB WAY 939 907 962 e a referência da marcação, com botões para copiar.', await shot(c, '.pay-box'));
    const manage = await c.locator('.success a.btn').last().getAttribute('href');
    const ref = (await c.textContent('.success .review-box')).match(/Referência\s*([A-Z0-9]{5,8})/)[1];
    const id = +node(`const {db}=require('./src/db');console.log(db.prepare('SELECT id FROM bookings WHERE ref=?').get('${ref}').id)`);
    let mails = emails(id);
    add('email', 'Email: "Pedido recebido"', 'Enviado à cliente logo a seguir (quando o email estiver configurado).', null, { email: mails.find(m => m.kind === 'pending') });
    add('email', 'Email para a Adriana: "Novo pedido para aprovar"', 'A Adriana recebe o aviso com os dados da cliente e a forma de pagamento.', null, { email: mails.find(m => m.kind === 'staff_pending') });
    // 4. a cliente paga o sinal; a Adriana regista e aprova
    const a = await admCtx.newPage();
    a.on('pageerror', e => errors.push('painel: ' + e.message));
    await a.goto(BASE + '/painel'); await a.waitForSelector('#l-email');
    await a.fill('#l-email', 'amartinsestetica@icloud.com'); await a.fill('#l-pass', 'simulacao-painel-1'); await a.click('#login-form button[type=submit]');
    await a.waitForSelector('.kpis'); await a.goto(BASE + '/admin/#marcacoes/pedidos'); await a.waitForSelector('.pend');
    add('adriana', 'A Adriana vê o pedido no painel', 'Com a indicação "Sinal por receber · MB WAY".', await shot(a, '.pend'));
    await a.click('.pend [data-dep]'); await a.waitForSelector('#pf');
    add('adriana', 'Recebe o MB WAY e regista o sinal', 'O valor (9,00 €), o método e a nota "Sinal" já vêm preenchidos.', await shot(a));
    await a.click('#pf button[type=submit]'); await a.waitForSelector('#dlg[open] [data-act="approve"]');
    await a.click('[data-act="approve"]'); await a.waitForSelector('#dlg[open] [data-act="move"]');
    add('adriana', 'Aprova a marcação', 'Sinal recebido e marcação confirmada.', await shot(a));
    await a.keyboard.press('Escape');
    mails = emails(id);
    add('email', 'Email: "O teu pedido foi aceite"', 'A cliente recebe a confirmação, já com "Sinal recebido".', null, { email: mails.find(m => m.kind === 'approved') });
    // 5. a cliente abre o link da marcação
    await c.goto(manage.startsWith("http") ? manage : BASE + manage); await c.waitForSelector('.review-box');
    add('cliente', 'Abre "Gerir marcação"', 'Pelo link privado vê a marcação confirmada, o sinal recebido e pode reagendar ou cancelar até 48 h antes.', await shot(c));
    // 6. lembrete na véspera
    node(`const {db}=require('./src/db');const T=require('./src/tokens');const N=require('./src/notify');const b=db.prepare('SELECT * FROM bookings WHERE id=${id}').get();
            N.notifyBooking('reminder', b.id, { token: T.manageToken(b.ref, b.created_at) }).then(()=>process.exit(0));`);
    mails = emails(id);
    add('email', 'Email: lembrete na véspera', 'Com link para confirmar a presença.', null, { email: mails.find(m => m.kind === 'reminder') });
    await c.goto(manage.startsWith("http") ? manage : BASE + manage); await c.waitForSelector('#attend');
    await c.click('#attend'); await c.waitForSelector('.notice.ok');
    add('cliente', 'Confirma a presença', 'Um toque e a Adriana fica a saber que a cliente vem.', await shot(c));
    // 7. dia do atendimento: concluir e pagar o restante
    node(`const {db}=require('./src/db');const {DateTime}=require('luxon');const t=DateTime.now().setZone('Europe/Lisbon').minus({hours:3}).startOf('hour').toMillis();db.prepare('UPDATE bookings SET start_at=?, end_at=? WHERE id=${id}').run(t, t)`);
    await a.goto(BASE + '/admin/#marcacoes'); await a.waitForTimeout(500); await a.goto(BASE + '/admin/#clientes'); await a.fill('#cq', 'Joana'); await a.waitForSelector('.ccard:has-text("Joana")'); await a.waitForTimeout(400);
    await a.click('.ccard:has-text("Joana")'); await a.waitForSelector('.profile');
    await a.locator('[data-booking]').first().click(); await a.waitForSelector('#dlg[open] [data-act="complete"]');
    await a.click('[data-act="complete"]'); await a.waitForSelector('#dlg[open] [data-act="pay"]');
    await a.click('[data-act="pay"]'); await a.waitForSelector('#pf'); await a.check('input[name=m][value=numerario]');
    add('adriana', 'No fim do serviço, regista o restante', 'O painel sugere os 9,00 € que faltam.', await shot(a));
    await a.click('#pf button[type=submit]'); await a.waitForSelector('#dlg[open] .mini-row');
    await a.keyboard.press('Escape');
    // 8. convite para avaliar
    node(`require('./src/core').runJobs().then(()=>process.exit(0))`);
    mails = emails(id);
    const rv = mails.find(m => m.kind === 'review');
    add('email', 'Email: convite para avaliar', 'Algumas horas depois do atendimento.', null, { email: rv });
    const rlink = rv.body.match(/https?:\/\/\S+avaliar\.html\?t=\S+/)[0].replace('https://www.adrianamartins.pt', BASE);
    await c.goto(rlink); await c.waitForSelector('#rf');
    await c.click('#rate button[data-v="5"]'); await c.fill('#comment', 'Adorei! A Adriana é super atenciosa e as unhas ficaram perfeitas.');
    add('cliente', 'Deixa a avaliação', 'Estrelas e um comentário. A avaliação fica publicada no site como "verificada" (a Adriana pode ocultá-la no painel).', await shot(c));
    await c.click('#rf button[type=submit]'); await c.waitForTimeout(1200);
    add('cliente', 'Obrigada!', 'Avaliação enviada e publicada.', await shot(c, 'top'));
    // 9. próxima marcação: dados lembrados
    await c.goto(BASE + '/marcar.html'); await c.locator('[data-pick-cat]').first().click(); await c.locator('[data-service]').first().click();
    await c.locator('#cal .day.has').nth(4).click(); await c.locator('.slot').first().click(); await c.waitForSelector('#details-form');
    add('cliente', 'Na próxima marcação', 'Os dados já aparecem preenchidos — basta continuar.', await shot(c, '#step'));
  } catch (e) { console.error('FALHOU', e.message); errors.push('FALHOU: ' + e.message); }
  // mensagem de aniversário (texto que a Adriana envia por WhatsApp)
  const bday = JSON.parse(node(`const {getSettings}=require('./src/db');const s=getSettings();console.log(JSON.stringify(s.birthday_message.replace(/\\{nome\\}/g,'Joana').replace(/\\{profissional\\}/g,s.professional_name||s.business_name)))`));
  add('email', 'No aniversário', 'A Adriana vê no painel quem faz anos e envia esta mensagem por WhatsApp com um toque (ou por email automático, se ativar).', null, { email: { subject: 'Mensagem de aniversário (WhatsApp)', recipient: 'Joana', body: bday } });
  fs.writeFileSync(path.join(OUT, 'steps.json'), JSON.stringify({ steps, errors }, null, 1));
  await browser.close(); srv.kill();
  console.log(steps.length, 'passos', errors.length ? errors : 'sem erros');
})();
