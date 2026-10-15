'use strict';
// Servidor do site no Netlify (Functions "modernas": Request → Response).
// Converte o pedido para o formato que o serverless-http entende, corre a app Express com a base de dados
// carregada do Netlify Blobs (ver runtime.js) e devolve a resposta.
const { withDb, boot, stores, DB_KEY } = require('./runtime');
let handler = null;

function getHandler(server) {
  handler ||= require('serverless-http')(server.app, {
    binary: ['image/*', 'video/*', 'application/octet-stream'],
    // o serverless-http entrega o corpo já lido (Buffer): converte-o como o express.json faria
    request(req) {
      const type = String(req.headers['content-type'] || '');
      if (Buffer.isBuffer(req.body) && !/^video\//.test(type) && !/^image\//.test(type) && !/multipart/.test(type)) {
        const txt = req.body.toString('utf8');
        try { req.body = /json/.test(type) && txt ? JSON.parse(txt) : {}; } catch { req.body = {}; }
        req._body = true;
      } else if (req.body == null) req.body = {};
    }
  });
  return handler;
}

// pedido (formato Lambda) → resposta (formato Lambda)
async function handleEvent(event, context = {}) {
  const strip = p => String(p || '').replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '') || '/';
  event = { ...event, path: strip(event.path) };
  try {
    return await withDb(async ({ server }) => getHandler(server)({ ...event }, context));
  } catch (e) {
    console.error('[api]', e && e.stack || e);
    return { statusCode: e.status || 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: e.status ? e.message : 'Erro no servidor. Tenta outra vez.' }) };
  }
}

// Request (web) → Response (web)
async function handleRequest(req, context = {}) {
  const url = new URL(req.url);
  const headers = {}, multi = {};
  req.headers.forEach((v, k) => { headers[k] = v; multi[k] = [v]; });
  if (context.ip && !headers['x-forwarded-for']) { headers['x-forwarded-for'] = context.ip; multi['x-forwarded-for'] = [context.ip]; }
  if (!headers['x-forwarded-proto']) headers['x-forwarded-proto'] = url.protocol.replace(':', '');
  const qs = url.searchParams;
  const body = ['GET', 'HEAD'].includes(req.method) ? null : Buffer.from(await req.arrayBuffer());
  const event = {
    httpMethod: req.method, path: url.pathname, headers, multiValueHeaders: multi,
    queryStringParameters: Object.fromEntries(qs), multiValueQueryStringParameters: Object.fromEntries([...new Set(qs.keys())].map(k => [k, qs.getAll(k)])),
    body: body && body.length ? body.toString('base64') : null, isBase64Encoded: true,
    requestContext: { identity: { sourceIp: context.ip || headers['x-nf-client-connection-ip'] || '' } }
  };
  const r = await handleEvent(event, {});
  const out = new Headers();
  for (const [k, v] of Object.entries(r.headers || {})) if (v != null) out.set(k, String(v));
  for (const [k, vs] of Object.entries(r.multiValueHeaders || {})) { out.delete(k); for (const v of [].concat(vs)) out.append(k, String(v)); }
  const data = r.body ? Buffer.from(r.body, r.isBase64Encoded ? 'base64' : 'utf8') : null;
  return new Response(r.statusCode === 204 || r.statusCode === 304 ? null : data, { status: r.statusCode || 200, headers: out });
}

// tarefas automáticas + cópia de segurança diária (últimas 14)
async function runScheduled() {
  await withDb(({ core }) => core.runJobs());
  const data = stores().data, day = new Date().toISOString().slice(0, 10);
  const cur = await data.get(DB_KEY, { type: 'arrayBuffer' });
  if (cur) {
    await data.set(`copias/${day}.sqlite`, cur, { onlyIfNew: true });
    const { blobs } = await data.list({ prefix: 'copias/' });
    for (const b of blobs.map(x => x.key).sort().reverse().slice(14)) await data.delete(b);
  }
}

module.exports = { handleEvent, handleRequest, runScheduled, boot };
