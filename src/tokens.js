'use strict';
// Tokens privados derivados por HMAC: podem ser regenerados para lembretes, mas só o hash fica na base de dados.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const keyFile = path.join(DATA_DIR, 'secret.key');
// chave secreta: APP_SECRET, ou (no Netlify) guardada na própria base de dados, ou um ficheiro em DATA_DIR
let fileSecret = null;
function secret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  if (global.__APP_SECRET) return global.__APP_SECRET;
  if (!fileSecret) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    fileSecret = fs.readFileSync(keyFile, 'utf8').trim();
  }
  return fileSecret;
}

const derive = purpose => crypto.createHmac('sha256', secret()).update(purpose).digest('base64url');
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const random = (n = 32) => crypto.randomBytes(n).toString('base64url');

module.exports = {
  manageToken: (ref, nonce) => derive(`manage:${ref}:${nonce}`),
  reviewToken: ref => derive(`review:${ref}`),
  offerToken: (id, n) => derive(`offer:${id}:${n}`),
  waitlistToken: id => derive(`waitlist:${id}`),
  hash, random
};
