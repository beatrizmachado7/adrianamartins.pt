'use strict';
// Netlify Scheduled Function (de 15 em 15 minutos, ver netlify.toml): pedidos que expiram, lista de espera
// e uma cópia de segurança diária da base de dados (últimas 14), tudo no Netlify Blobs.
const { withDb, stores, DB_KEY } = require('../lib/runtime');

exports.handler = async event => {
  try { if (!global.__BLOBS) require('@netlify/blobs').connectLambda(event); } catch { /* fora do Netlify */ }
  await withDb(({ core }) => core.runJobs());
  const data = stores().data, day = new Date().toISOString().slice(0, 10);
  const cur = await data.get(DB_KEY, { type: 'arrayBuffer' });
  if (cur) {
    await data.set(`copias/${day}.sqlite`, cur, { onlyIfNew: true });
    const { blobs } = await data.list({ prefix: 'copias/' });
    for (const b of blobs.map(x => x.key).sort().reverse().slice(14)) await data.delete(b);
  }
  return { statusCode: 200, body: 'ok' };
};
