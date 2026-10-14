'use strict';
// Base de dados SQLite (ficheiro persistente) + esquema + dados iniciais com campos identificados.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'estetica.db');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000'); // vários processos: espera pelo bloqueio em vez de falhar

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT DEFAULT '', bio TEXT DEFAULT '',
  photo_url TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
-- weekday: 1=segunda ... 7=domingo. Várias linhas por dia permitem pausas (ex.: almoço).
CREATE TABLE IF NOT EXISTS business_hours (
  id INTEGER PRIMARY KEY, weekday INTEGER NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL
);
-- Se uma profissional tiver linhas aqui, substituem o horário geral para ela.
-- Horários abertos à mão no painel, dia a dia (ex.: 2026-10-14 às 10:00, 11:30…).
-- Num dia com horários aqui, só estes contam; o horário semanal é ignorado nesse dia.
CREATE TABLE IF NOT EXISTS day_slots (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, time TEXT NOT NULL, UNIQUE(date, time)
);
CREATE TABLE IF NOT EXISTS staff_hours (
  id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY, category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL, description TEXT DEFAULT '', duration_min INTEGER NOT NULL,
  price_cents INTEGER,                       -- NULL = preço ainda não definido
  price_type TEXT NOT NULL DEFAULT 'fixed',  -- fixed | from | variable
  price_note TEXT DEFAULT '',                -- de que depende o preço quando varia
  requires_approval INTEGER NOT NULL DEFAULT 0,
  resource_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
  featured INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS staff_services (
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);
-- Bloqueios: pausa, ferias, encerramento. staff_id NULL = todo o espaço (mostrado no site como encerramento).
CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY, staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'pausa', start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
  reason TEXT DEFAULT '', public_note TEXT DEFAULT '', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT NOT NULL,
  marketing_consent INTEGER NOT NULL DEFAULT 0, marketing_consent_at INTEGER,
  notes TEXT DEFAULT '', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY, ref TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  resource_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL, duration_min INTEGER NOT NULL, price_cents INTEGER, price_type TEXT,
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
  status TEXT NOT NULL,                 -- pending | confirmed | completed | cancelled | no_show
  hold_expires_at INTEGER,              -- só para 'pending'
  manage_token_hash TEXT UNIQUE NOT NULL,
  review_token_hash TEXT UNIQUE,
  source TEXT NOT NULL DEFAULT 'online',
  cancel_reason TEXT DEFAULT '', internal_notes TEXT DEFAULT '',
  policy_accepted_at INTEGER,
  reminder_sent_at INTEGER, review_invited_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_staff_time ON bookings(staff_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_bookings_resource_time ON bookings(resource_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, booking_id INTEGER UNIQUE NOT NULL REFERENCES bookings(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), comment TEXT DEFAULT '',
  author_name TEXT NOT NULL, service_name TEXT DEFAULT '', verified INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published',  -- published | pending | hidden
  hidden_reason TEXT DEFAULT '',            -- spam | ofensivo | dados_pessoais
  reply TEXT DEFAULT '', created_at INTEGER NOT NULL, moderated_at INTEGER
);
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY, service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
  days TEXT NOT NULL DEFAULT '[]', periods TEXT NOT NULL DEFAULT '[]',
  date_from TEXT, date_to TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- active | offered | booked | expired | cancelled
  offer_token_hash TEXT UNIQUE, offer_start_at INTEGER, offer_staff_id INTEGER, offer_expires_at INTEGER,
  offers_count INTEGER NOT NULL DEFAULT 0, skipped TEXT NOT NULL DEFAULT '[]',
  manage_token_hash TEXT UNIQUE, booking_id INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, booking_id INTEGER, waitlist_id INTEGER, channel TEXT NOT NULL,
  kind TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body TEXT,
  status TEXT NOT NULL,  -- sent | failed | not_configured
  error TEXT DEFAULT '', created_at INTEGER NOT NULL
);

-- Pagamentos registados à mão no painel (o total recebido é sempre a soma destes registos).
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL,                   -- numerario | mbway | multibanco | cartao | transferencia | outro
  status TEXT NOT NULL DEFAULT 'pago',    -- pago | anulado (nunca se apaga: fica no histórico)
  paid_at INTEGER NOT NULL, note TEXT DEFAULT '',
  request_key TEXT UNIQUE,                -- impede registar o mesmo pagamento duas vezes (duplo clique, repetição)
  void_reason TEXT DEFAULT '', voided_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid ON payments(paid_at);

-- Despesas do negócio (registadas à mão no painel) — para o resultado operacional estimado
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, spent_on TEXT NOT NULL,          -- AAAA-MM-DD no fuso do espaço
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category TEXT NOT NULL DEFAULT 'outro', description TEXT DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_day ON expenses(spent_on);
-- Histórico de alterações de cada marcação (quem, quando, o quê).
CREATE TABLE IF NOT EXISTS booking_events (
  id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id),
  at INTEGER NOT NULL, actor TEXT NOT NULL,   -- cliente | painel | sistema
  action TEXT NOT NULL, details TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_events_booking ON booking_events(booking_id);
`);

// migrações simples (bases de dados criadas por versões anteriores)
for (const [table, col, def] of [['bookings', 'proposed', 'INTEGER NOT NULL DEFAULT 0'], ['bookings', 'attendance_confirmed_at', 'INTEGER'],
  ['bookings', 'attendance_source', "TEXT DEFAULT ''"], ['waitlist', 'contacted_at', 'INTEGER'], ['waitlist', 'notes', "TEXT DEFAULT ''"],
  ['waitlist', 'source', "TEXT DEFAULT 'online'"],
  // registo de clientes (formulário) e aniversários: só dia e mês (MM-DD), com consentimento próprio para a mensagem
  ['customers', 'birthday', 'TEXT'], ['customers', 'birthday_consent', 'INTEGER NOT NULL DEFAULT 0'], ['customers', 'birthday_consent_at', 'INTEGER'],
  ['customers', 'source', "TEXT DEFAULT ''"], ['customers', 'registered_at', 'INTEGER'], ['customers', 'birthday_greeted_year', 'INTEGER'], ['services', 'image_url', "TEXT DEFAULT ''"], ['categories', 'image_url', "TEXT DEFAULT ''"],
  ['services', 'included', "TEXT DEFAULT ''"], ['services', 'preparation', "TEXT DEFAULT ''"],
  ['services', 'group_name', "TEXT DEFAULT ''"], ['services', 'bookable', "INTEGER NOT NULL DEFAULT 1"], ['categories', 'note', "TEXT DEFAULT ''"],
  // pagamentos: como a cliente prefere pagar (mbway | transferencia | mao) e sinal combinado no momento da marcação
  ['bookings', 'payment_method', "TEXT DEFAULT ''"], ['bookings', 'deposit_cents', 'INTEGER']]) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

// aviso de "pedido expirou": coluna nova; os cancelamentos antigos ficam marcados como já avisados
if (!db.prepare('PRAGMA table_info(bookings)').all().some(c => c.name === 'expired_notified_at')) {
  db.exec('ALTER TABLE bookings ADD COLUMN expired_notified_at INTEGER');
  db.prepare("UPDATE bookings SET expired_notified_at=? WHERE status='cancelled'").run(Date.now());
}
// novas regras (outubro 2026): todas as marcações online são confirmadas pela Adriana — aplicado uma vez às bases existentes
db.exec("CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v TEXT)");
if (!db.prepare("SELECT 1 FROM app_meta WHERE k='all_services_require_approval'").get()) {
  db.prepare("INSERT INTO app_meta(k,v) VALUES('all_services_require_approval','1')").run();
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='services'").get()) db.exec('UPDATE services SET requires_approval=1');
}

// preço do Lash Lifting definido (outubro 2026): 20 € — só se ainda estiver "sob consulta"
if (!db.prepare("SELECT 1 FROM app_meta WHERE k='lash_price_2000'").get()) {
  db.prepare("INSERT INTO app_meta(k,v) VALUES('lash_price_2000','1')").run();
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='services'").get())
    db.prepare("UPDATE services SET price_cents=2000, price_type='fixed' WHERE name='Lash Lifting' AND price_cents IS NULL").run();
}

// Cada marcação ocupa um horário (hora de início) da profissional — sem duração.
// Proteção final ao nível da base de dados: nunca duas marcações ativas da mesma profissional à mesma hora.
db.exec(`
DROP TRIGGER IF EXISTS trg_no_overlap_insert;
DROP TRIGGER IF EXISTS trg_no_overlap_update;
CREATE TRIGGER IF NOT EXISTS trg_no_double_slot_insert BEFORE INSERT ON bookings
WHEN NEW.status IN ('pending','confirmed') BEGIN
  SELECT RAISE(ABORT, 'SLOT_TAKEN') WHERE EXISTS (
    SELECT 1 FROM bookings b WHERE b.staff_id = NEW.staff_id AND b.status IN ('pending','confirmed') AND b.start_at = NEW.start_at);
END;
CREATE TRIGGER IF NOT EXISTS trg_no_double_slot_update BEFORE UPDATE OF start_at, staff_id, status ON bookings
WHEN NEW.status IN ('pending','confirmed') BEGIN
  SELECT RAISE(ABORT, 'SLOT_TAKEN') WHERE EXISTS (
    SELECT 1 FROM bookings b WHERE b.id <> NEW.id AND b.staff_id = NEW.staff_id AND b.status IN ('pending','confirmed') AND b.start_at = NEW.start_at);
END;
CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_active_slot ON bookings(staff_id, start_at) WHERE status IN ('pending','confirmed');
`);

const DEFAULT_SETTINGS = {
  business_name: 'ADRIANA MARTINS',
  hero_title: 'Um momento para cuidar de ti.',
  hero_subtitle: 'Manicure, pedicure, lash lifting e depilação a cera e a laser, em Massamá. Marca o teu próximo momento de bem-estar.',
  legal_id: '[IDENTIFICAÇÃO DO NEGÓCIO — nome legal e NIF]',
  access_info: '',          // estacionamento e acesso (só quando fornecido)
  address_line: 'Avenida Américo Ferrer Lopes Loja 11C', postal_code: '2745-715', city: 'Massamá',
  phone: '939 907 962', email: 'amartinsestetica@icloud.com', whatsapp: '939 907 962', instagram: 'https://www.instagram.com/estetica_adrianamartins/',
  map_embed_url: '', map_link_url: '',
  professional_name: 'Adriana Martins',
  about_text: 'Sou a Adriana Martins, esteticista. O meu objetivo é ajudar cada cliente a sentir-se bem consigo, através de cuidados que valorizam a sua beleza natural. Acredito num atendimento próximo e atento, onde há espaço para ouvir as suas necessidades e tornar cada visita num momento de cuidado pessoal.',
  training: [],            // apenas formação fornecida pela esteticista
  experience_text: '',     // idem
  // "Como decorre a primeira visita" (página O espaço)
  experience_steps: [
    { title: 'Conversa inicial', text: 'Começo com alguns minutos para perceber o que procuras e se há algo a ter em conta.' },
    { title: 'O atendimento', text: 'Explico cada passo antes de começar e ajusto o que for preciso para te sentires confortável.' },
    { title: 'Antes de sair', text: 'Partilho cuidados simples para os dias seguintes, quando se aplicam.' }
  ],
  // fotografias (URL). Vazio = espaço reservado elegante com a indicação [FOTOGRAFIA]
  testimonials: ["Lash Lifting | Mais uma vez obrigada! Gostei imenso de como as minhas pestanas ficaram 💗 Nunca as tinha visto tão curvadas e tão bonitas!! Obrigada 🫶 Ficaram incríveis!", "Lash Lifting | Adri, as minhas pestanas com o lifting ficaram lindíssimas! Mt obrigada. Até breve", "Unhas | Grande transformação!!! Belo!!!", "Unhas | Com a melhor, tudo se torna tão simples ❤️", "Unhas | Incrível Adriana, parabéns 👏👏", "Unhas | Maravilhosass"],
  logo_image: '/assets/img/logo-am.webp', profile_image: '', facebook: '', tiktok: '',
  space_title: 'Um espaço pensado para ti', space_text: 'Em Massamá, preparei um espaço calmo e acolhedor, em tons claros de bege e madeira, onde cada detalhe foi escolhido para te sentires à vontade. Tem uma zona de atendimento confortável, um cantinho de espera para relaxares e material profissional, tratado com todo o cuidado de higiene. O atendimento é só por marcação, para que cada visita seja tranquila e sem pressas.', space_image: '/assets/img/espaco-logo.webp', space_points: ['Atendimento só por marcação, sem esperas', 'Ambiente calmo, luminoso e reservado', 'Material profissional e cuidado com a higiene em cada atendimento', 'Na Avenida Américo Ferrer Lopes, em Massamá'],
  hero_image: '/assets/img/hero-adriana.webp', hero_image_2: '', hero_image_3: '', about_image: '/assets/img/adriana.webp', about_image_2: '',
  services_image: '', pricing_image: '', booking_image: '', reviews_image: '', contacts_image: '', gallery: ['/assets/img/espaco-logo.webp', '/assets/img/espaco-atendimento.webp', '/assets/img/espaco-detalhe.webp', '/assets/img/espaco-espera.webp'],
  video_url: 'https://www.instagram.com/reel/DaVIOYGsrlj/', video_file: '/assets/video/espaco.mp4', video_image: '/assets/img/video-capa.webp',
  timezone: 'Europe/Lisbon',  // fuso horário do espaço (Portugal continental e Madeira; Açores: Atlantic/Azores)
  slot_step_min: 60, buffer_min: 0, min_notice_hours: 24, max_advance_days: 60,
  cancel_limit_hours: 48, reschedule_limit_hours: 48,
  booking_policy: 'As marcações são feitas com antecedência, aqui no site, escolhendo um dos dias e horários disponíveis no calendário de Marcações. Só os horários que aparecem no site estão abertos para marcação; se não encontrares o horário que procuras, podes entrar na lista de espera.\n\nDepois de enviares o pedido, o horário fica reservado para ti enquanto aguardas a minha confirmação. Confirmo todas as marcações no prazo máximo de 24 horas e envio-te a resposta por WhatsApp. Se precisar de propor outro horário, também te aviso por WhatsApp e podes aceitar ou recusar a proposta.\n\nPara reservar o dia e a hora, peço um sinal de 50% do valor do serviço, por MB WAY ou transferência bancária, indicando a referência da marcação. Os restantes 50% são pagos no final do serviço. Se preferires pagar em mão, escolhe essa opção ao marcar e combinamos a entrega do sinal.\n\nPeço que chegues com 5 minutos de antecedência. Se te atrasares, avisa-me: posso ter de encurtar o serviço ou remarcar, para não atrasar as clientes seguintes.',
  cancellation_policy: 'Os cancelamentos e reagendamentos têm de ser feitos com pelo menos 48 horas de antecedência em relação à hora marcada. Podes fazê-lo através do link da tua marcação (que também te envio por WhatsApp), ou contactando-me diretamente.\n\nA menos de 48 horas da marcação já não é possível cancelar nem reagendar pelo site. Nesse caso, contacta-me o mais cedo possível por telefone.\n\nSe cancelares com pelo menos 48 horas de antecedência, devolvo o sinal ou guardo-o para uma nova marcação, como preferires. A menos de 48 horas, ou em caso de falta, o sinal não é devolvido.\n\nFaltar sem avisar impede outra cliente de usar esse horário. Em caso de faltas repetidas sem aviso, posso deixar de aceitar marcações online.',
  pending_hold_hours: 24, waitlist_offer_minutes: 120, waitlist_max_offers: 3,
  reminder_enabled: true, reminder_hours: 24, review_invite_delay_hours: 2,
  // formulário de registo (link partilhado nas redes sociais) e mensagens de aniversário
  register_enabled: true,
  register_title: 'Regista-te',
  register_intro: 'Deixa os teus dados uma vez: nas próximas marcações fica tudo mais rápido e, no teu aniversário, recebes uma mensagem minha.',
  birthday_message: 'Olá {nome}, muitos parabéns! 🎂\n\nHoje o dia é todo teu e merece ser celebrado com tudo aquilo que te faz feliz. Obrigada por me deixares fazer parte dos teus momentos de cuidado — é sempre um gosto enorme receber-te.\n\nQue este novo ano te traga saúde, alegria e muitos motivos para sorrir.\n\nUm beijinho grande,\n{profissional}',
  birthday_email_enabled: false,
  // pagamentos: sinal para reservar + dados para MB WAY / transferência (sem pagamento automático no site)
  deposit_enabled: true, deposit_percent: 50,
  mbway_number: '939 907 962', iban: '', iban_name: '',
  payment_note: 'Os restantes 50% são pagos no final do serviço.',
  // mensagens de WhatsApp com um toque (o painel abre o WhatsApp da Adriana com o texto já escrito)
  wa_tpl_pending: 'Olá {nome}! 😊 Obrigada pelo teu pedido de marcação.\n\n✨ {servico}\n🗓️ {data}, às {hora}\n\n{sinal_texto}\n\nPodes acompanhar o teu pedido aqui: {link}\n\nUm beijinho,\n{profissional}',
  wa_tpl_confirmed: 'Olá {nome}! A tua marcação está confirmada. 🤍\n\n✨ {servico}\n🗓️ {data}, às {hora}\n📍 {morada}\n\nPeço que chegues 5 minutos antes. Se precisares de alterar, podes fazê-lo até 48 horas antes, aqui: {link}\n\nAté breve!\n{profissional}',
  wa_tpl_proposed: 'Olá {nome}! O horário que pediste não está disponível, mas posso receber-te {data} às {hora} ({servico}).\n\nPodes aceitar ou recusar aqui: {link}\n\n{profissional}',
  wa_tpl_cancelled: 'Olá {nome}! A tua marcação de {data} às {hora} ({servico}) foi cancelada.\n\nSe quiseres, escolhe outro horário em {site}\n\n{profissional}',
  wa_tpl_review: 'Olá {nome}! Obrigada pela tua visita. 🤍 Se tiveres um minuto, adorava saber a tua opinião: {link_avaliacao}\n\n{profissional}',
  wa_tpl_reminder: 'Olá {nome}! Lembro-te da tua marcação de {data} às {hora} ({servico}).\n\nConfirma a tua presença aqui, por favor: {link}\n\nAté já!\n{profissional}',
  arrival_note: 'Chega 5 minutos antes. Se tiveres alguma dúvida sobre a preparação, contacta-me antes da visita.',
  faq: [
    { q: 'Como faço uma marcação?', a: 'Em Marcações, escolhe o serviço e um dos dias e horários disponíveis e envia o pedido com o teu nome e telemóvel. Confirmo a marcação no prazo máximo de 24 horas e envio-te a confirmação por WhatsApp, com um link para gerires a marcação.' },
    { q: 'Posso cancelar ou reagendar?', a: 'Sim, até 48 horas antes da hora marcada, pelo link privado da tua marcação (que também te envio por WhatsApp). A menos de 48 horas, contacta-me diretamente por telefone.' },
    { q: 'O que significa "Pedido pendente de confirmação"?', a: 'Todas as marcações são confirmadas por mim. O horário fica reservado para ti e respondo no prazo máximo de 24 horas; envio-te uma mensagem por WhatsApp assim que o pedido for aceite ou se precisar de propor outro horário.' },
    { q: 'Como me preparo para a visita?', a: 'Chega com alguns minutos de antecedência. Se o serviço exigir algum cuidado prévio, indico na descrição do serviço ou entro em contacto contigo.' },
    { q: 'E se o horário que quero estiver ocupado?', a: 'Aparecem as alternativas mais próximas e podes entrar na lista de espera. Se surgir uma vaga compatível, envio-te um aviso com prazo para reservares.' }
  ],
  privacy_controller: '[RESPONSÁVEL PELO TRATAMENTO DE DADOS — nome/empresa e NIF]',
  public_base_url: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  whatsapp_enabled: false, sms_enabled: false,
  hours_confirmed: false
};

// textos predefinidos atualizados (outubro 2026): se a Adriana ainda tinha o texto antigo guardado sem alterações, passa a usar o novo
{
  const OLD = {
    birthday_message: 'Olá {nome}! Muitos parabéns! Desejo-te um dia muito especial, cheio de coisas boas. Um beijinho, {profissional}',
    booking_policy: DEFAULT_SETTINGS.booking_policy.replace(/Para reservar o dia e a hora[^\n]*\n\n/, ''),
    cancellation_policy: DEFAULT_SETTINGS.cancellation_policy.replace(/Se cancelares com pelo menos 48 horas[^\n]*\n\n/, ''),
    payment_note: 'Indica a referência da marcação na descrição do pagamento. Os restantes 50% são pagos no final do serviço.',
    wa_tpl_pending: 'Olá {nome}! Recebi o teu pedido de marcação para {servico}, {data} às {hora}. 😊\n\n{sinal_texto}\n\nPodes ver o teu pedido aqui: {link}\n\n{profissional}',
    wa_tpl_confirmed: 'Olá {nome}! A tua marcação está confirmada: {servico}, {data} às {hora}. 🤍\n\nMorada: {morada}\n\nSe precisares de alterar, usa este link (até 48 horas antes): {link}\n\nAté breve!\n{profissional}'
  };
  const del = db.prepare('DELETE FROM settings WHERE key=? AND value=?');
  for (const [k, v] of Object.entries(OLD)) del.run(k, JSON.stringify(v));
}

// contacto por WhatsApp em vez de email (outubro 2026): textos antigos guardados sem alterações passam aos novos
{
  const BACK = [["Confirmo todas as marcações no prazo máximo de 24 horas e envio-te a resposta por WhatsApp. Se precisar de propor outro horário, também te aviso por WhatsApp e podes aceitar ou recusar a proposta.", "Confirmo todas as marcações no prazo máximo de 24 horas e recebes a resposta por email. Se precisar de propor outro horário, também te aviso por email e podes aceitar ou recusar a proposta."], ["Podes fazê-lo através do link da tua marcação (que também te envio por WhatsApp), ou contactando-me diretamente.", "Podes fazê-lo através do link que recebes no email de confirmação, ou contactando-me diretamente."], ["envia o pedido com o teu nome e telemóvel. Confirmo a marcação no prazo máximo de 24 horas e envio-te a confirmação por WhatsApp, com um link para gerires a marcação.", "envia o pedido com o teu nome, email e telefone. Confirmo a marcação no prazo máximo de 24 horas e recebes a confirmação por email, com um link para gerires a marcação."], ["pelo link privado da tua marcação (que também te envio por WhatsApp).", "pelo link privado que recebes no email de confirmação."], ["envio-te uma mensagem por WhatsApp assim que o pedido for aceite ou se precisar de propor outro horário.", "recebes um email assim que o pedido for aceite ou se precisar de propor outro horário."]];
  const old = v => BACK.reduce((t, [n, o]) => t.split(n).join(o), v);
  const del = db.prepare('DELETE FROM settings WHERE key=? AND value=?');
  for (const k of ['booking_policy', 'cancellation_policy', 'faq']) del.run(k, JSON.stringify(k === 'faq' ? DEFAULT_SETTINGS.faq.map(f => ({ q: f.q, a: old(f.a) })) : old(DEFAULT_SETTINGS[k])));
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) { try { s[r.key] = JSON.parse(r.value); } catch { s[r.key] = r.value; } }
  if (process.env.PUBLIC_BASE_URL) s.public_base_url = process.env.PUBLIC_BASE_URL;
  return s;
}
const upsertSetting = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
function saveSettings(obj) {
  const tx = db.transaction(o => { for (const [k, v] of Object.entries(o)) if (k in DEFAULT_SETTINGS) upsertSetting.run(k, JSON.stringify(v)); });
  tx(obj);
}

function seed() {
  const has = db.prepare('SELECT COUNT(*) n FROM staff').get().n;
  if (has) return;
  const tx = db.transaction(() => {
    const staffId = db.prepare("INSERT INTO staff(name, role, bio) VALUES(?,?,?)").run('Adriana Martins', 'Esteticista', '').lastInsertRowid;
    // Sem horário pré-definido: os horários são abertos à mão no painel (Disponibilidade).
    // SEED_SAMPLE_HOURS=1 (só nos testes) cria um horário semanal de exemplo.
    if (process.env.SEED_SAMPLE_HOURS === '1') {
      const bh = db.prepare('INSERT INTO business_hours(weekday,start,end) VALUES(?,?,?)');
      for (const d of [2, 3, 4, 5]) { bh.run(d, '10:00', '13:00'); bh.run(d, '14:00', '19:00'); }
      bh.run(6, '10:00', '14:00');
    }
    // catálogo real (tabelas de preços enviadas) — ver src/catalogo.json (a duração não é usada: cada marcação ocupa um horário)
    const catalogo = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogo.json'), 'utf8')).categorias;
    const cat = db.prepare('INSERT INTO categories(name, description, note, sort) VALUES(?,?,?,?)');
    const sv = db.prepare(`INSERT INTO services(category_id,group_name,name,description,duration_min,price_cents,price_type,price_note,requires_approval,featured,sort,bookable,included,preparation)
      VALUES(?,?,?,?,?,?,?,'',1,?,?,?,'','')`);
    const link = db.prepare('INSERT INTO staff_services(staff_id, service_id) VALUES(?,?)');
    let sort = 0;
    catalogo.forEach((c, i) => {
      const cid = cat.run(c.name, c.description || '', c.note || '', i + 1).lastInsertRowid;
      for (const x of c.services) {
        const id = sv.run(cid, x.group || '', x.name, x.desc || '', 0, x.price ?? null, x.type || 'fixed', x.featured ? 1 : 0, sort++, x.bookable === 0 ? 0 : 1).lastInsertRowid;
        link.run(staffId, id);
      }
    });
  });
  tx();
}
seed();

module.exports = { db, getSettings, saveSettings, DEFAULT_SETTINGS, DB_FILE };
