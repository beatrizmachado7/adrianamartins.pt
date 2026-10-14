'use strict';
// Gera public/assets/offline.json: os dados do site (textos, contactos, serviços e preços) para o site abrir
// mesmo sem o servidor (ex.: só no Netlify, antes de ligar o Render). Uso: node scripts/snapshot-estatico.js
const fs = require('fs'), os = require('os'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'estetica-snap-'));
process.env.JOBS = 'off';
const { app } = require('../src/server');
const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/public`;
  const get = async p => (await fetch(base + p)).json();
  const [config, services] = await Promise.all([get('/config'), get('/services')]);
  config.hours = []; config.closures = [];
  const out = { generated_at: new Date().toISOString(), config, services, reviews: { reviews: [], count: 0, average: 0 } };
  const file = path.join(__dirname, '..', 'public', 'assets', 'offline.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('Escrito', path.relative(process.cwd(), file), Math.round(fs.statSync(file).size / 1024) + ' KB');
  server.close(); process.exit(0);
});
