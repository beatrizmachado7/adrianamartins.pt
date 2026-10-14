'use strict';
const { app } = require('./src/server');
const { db } = require('./src/db');
const C = require('./src/core');

const PORT = Number(process.env.PORT || 3000);
// primeira publicação: cria a conta do painel a partir de ADMIN_EMAIL + ADMIN_PASSWORD (só se ainda não houver nenhuma;
// depois disso a palavra-passe muda-se no painel, em Definições → Conta, e estas variáveis deixam de ter efeito)
if (!db.prepare('SELECT COUNT(*) n FROM admin_users').get().n && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const { hashPassword } = require('./src/server');
  if (process.env.ADMIN_PASSWORD.length < 10) console.error('ADMIN_PASSWORD tem de ter pelo menos 10 caracteres — conta não criada.');
  else {
    db.prepare('INSERT INTO admin_users(email,name,password_hash,created_at) VALUES(?,?,?,?)')
      .run(process.env.ADMIN_EMAIL.trim().toLowerCase(), process.env.ADMIN_NAME || 'Adriana Martins', hashPassword(process.env.ADMIN_PASSWORD), Date.now());
    console.log(`Conta do painel criada: ${process.env.ADMIN_EMAIL}`);
  }
}
if (!db.prepare('SELECT COUNT(*) n FROM admin_users').get().n) {
  console.warn('\n⚠  Ainda não existe nenhuma conta para o painel. Crie uma com:\n   npm run criar-admin -- email@exemplo.pt "Nome"\n');
}
app.listen(PORT, () => console.log(`Servidor em http://localhost:${PORT} (painel: /admin/)`));

// Tarefas automáticas: expirar pedidos, lembretes, convites de avaliação, lista de espera.
if (process.env.JOBS !== 'off') {
  const tick = () => C.runJobs().catch(e => console.error('Tarefas automáticas:', e));
  setTimeout(tick, 3000);
  setInterval(tick, 60000);
}

// Cópia de segurança diária da base de dados (BACKUPS=off para desligar)
if (process.env.BACKUPS !== 'off') {
  const { dailyBackup } = require('./src/backup');
  const bk = () => dailyBackup().then(f => f && console.log('Cópia de segurança:', f)).catch(e => console.error('Cópia de segurança falhou:', e.message));
  setTimeout(bk, 15000);
  setInterval(bk, 60 * 60 * 1000);
}
