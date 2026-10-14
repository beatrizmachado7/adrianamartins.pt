'use strict';
// Cópias de segurança da base de dados (SQLite). Uma por dia, guardadas em data/backups (ou BACKUP_DIR).
// Ficam as últimas BACKUP_KEEP cópias (14 por omissão). A cópia é feita com o servidor a funcionar.
const fs = require('fs');
const path = require('path');
const { db, DB_FILE } = require('./db');

const DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_FILE), 'backups');
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP || 14));

async function backupNow() {
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = path.join(DIR, `estetica-${stamp}.db`);
  const tmp = file + '.tmp';
  await db.backup(tmp);
  fs.renameSync(tmp, file);
  const old = fs.readdirSync(DIR).filter(f => /^estetica-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(KEEP);
  for (const f of old) fs.unlinkSync(path.join(DIR, f));
  return file;
}

// só faz a cópia do dia se ainda não existir
async function dailyBackup() {
  const today = path.join(DIR, `estetica-${new Date().toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(today)) return null;
  return backupNow();
}

module.exports = { backupNow, dailyBackup, BACKUP_DIR: DIR };

if (require.main === module) backupNow().then(f => console.log('Cópia de segurança criada:', f)).catch(e => { console.error('Falhou a cópia de segurança:', e.message); process.exit(1); });
