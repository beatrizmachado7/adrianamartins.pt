'use strict';
// Uso: npm run criar-admin -- email@exemplo.pt "Nome"   (a palavra-passe é pedida ou lida de ADMIN_PASSWORD)
const readline = require('readline');
const { db } = require('../src/db');
const { hashPassword } = require('../src/server');
const [email, name = 'Administração'] = process.argv.slice(2);
if (!email) { console.error('Indique o email: npm run criar-admin -- email@exemplo.pt "Nome"'); process.exit(1); }
const save = pw => {
  if (!pw || pw.length < 10) { console.error('A palavra-passe deve ter pelo menos 10 caracteres.'); process.exit(1); }
  db.prepare(`INSERT INTO admin_users(email,name,password_hash,created_at) VALUES(?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, name=excluded.name`).run(email.toLowerCase(), name, hashPassword(pw), Date.now());
  console.log(`Conta do painel pronta: ${email}`);
  process.exit(0);
};
if (process.env.ADMIN_PASSWORD) save(process.env.ADMIN_PASSWORD);
else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Palavra-passe (mín. 10 caracteres): ', pw => { rl.close(); save(pw.trim()); });
}
