'use strict';
// Netlify Function: o servidor do site (marcações, painel, horários) — ver netlify/lib/runtime.js
const { withDb } = require('../lib/runtime');
let handler = null;

exports.handler = async (event, context) => {
  try { if (!global.__BLOBS) require('@netlify/blobs').connectLambda(event); } catch { /* fora do Netlify */ }
  // /.netlify/functions/api/api/public/config → /api/public/config (o caminho original do site)
  const strip = p => String(p || '').replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '') || '/';
  event = { ...event, path: strip(event.path), rawUrl: event.rawUrl };
  try {
    return await withDb(async ({ server }) => {
      handler ||= require('serverless-http')(server.app, {
        binary: ['image/*', 'video/*', 'application/octet-stream'],
        // o serverless-http entrega o corpo já lido (Buffer): converte-o como o express.json faria
        request(req) {
          const type = String(req.headers['content-type'] || '');
          if (Buffer.isBuffer(req.body) && !/^video\//.test(type)) {
            const txt = req.body.toString('utf8');
            try { req.body = /json/.test(type) && txt ? JSON.parse(txt) : {}; } catch { req.body = {}; }
            req._body = true;
          } else if (req.body == null) req.body = {};
        }
      });
      return handler({ ...event }, context);
    });
  } catch (e) {
    return { statusCode: e.status || 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: e.status ? e.message : 'Erro no servidor. Tenta outra vez.' }) };
  }
};
