'use strict';
/* =====================================================================
   Pengesahan: hash kata laluan (scrypt), token sesi bertandatangan (HMAC),
   cookie, dan had cubaan (rate limit). Tiada pakej luar.
   ===================================================================== */
const crypto = require('crypto');

const COOKIE = 'mfz_session';
const SESSION_MS = 7 * 24 * 3600 * 1000;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const got = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(got, expected);
}
const safeEq = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const y = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(x, y);
};

const mac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');
function makeToken(username, secret) {
  const body = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + SESSION_MS })).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}
function readToken(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !safeEq(sig, mac(body, secret))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch (_) { return null; }
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > 0) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}
function sessionCookie(token, req, clear) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  return `${COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; ${secure ? 'Secure; ' : ''}` +
    (clear ? 'Max-Age=0' : `Max-Age=${Math.floor(SESSION_MS / 1000)}`);
}

/* Had cubaan ringkas dalam memori: max `limit` percubaan gagal setiap `windowMs` bagi satu kunci (IP). */
function limiter(limit, windowMs) {
  const hits = new Map();
  const fresh = (k) => (hits.get(k) || []).filter((t) => Date.now() - t < windowMs);
  return {
    blocked: (k) => fresh(k).length >= limit,
    fail: (k) => { hits.set(k, [...fresh(k), Date.now()]); },
    reset: (k) => hits.delete(k),
  };
}
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

module.exports = { COOKIE, hashPassword, verifyPassword, safeEq, makeToken, readToken, parseCookies, sessionCookie, limiter, clientIp };
