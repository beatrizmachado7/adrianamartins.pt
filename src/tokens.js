'use strict';
// Tokens privados derivados por HMAC: podem ser regenerados para lembretes, mas só o hash fica na base de dados.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const keyFile = path.join(DATA_DIR, 'secret.key');
let SECRET = process.env.APP_SECRET;
if (!SECRET) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  SECRET = fs.readFileSync(keyFile, 'utf8').trim();
}

const derive = purpose => crypto.createHmac('sha256', SECRET).update(purpose).digest('base64url');
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const random = (n = 32) => crypto.randomBytes(n).toString('base64url');

module.exports = {
  manageToken: (ref, nonce) => derive(`manage:${ref}:${nonce}`),
  reviewToken: ref => derive(`review:${ref}`),
  offerToken: (id, n) => derive(`offer:${id}:${n}`),
  waitlistToken: id => derive(`waitlist:${id}`),
  hash, random
};
