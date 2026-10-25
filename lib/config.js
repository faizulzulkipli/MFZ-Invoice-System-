'use strict';
/* =====================================================================
   Konfigurasi sambungan Supabase.
   Keutamaan: environment (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) > data/config.json
   data/config.json ditulis oleh halaman setup (kebenaran fail 600, di luar Git).
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const FILE = process.env.MFZ_CONFIG_FILE || path.join(__dirname, '..', 'data', 'config.json');
const ALLOW_CUSTOM = process.env.ALLOW_CUSTOM_SUPABASE_URL === '1';   // Supabase self-hosted / ujian tempatan

const cfg = { url: '', key: '', source: null };

function load() {
  const envUrl = (process.env.SUPABASE_URL || '').trim();
  const envKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (envUrl && envKey) {
    cfg.url = envUrl.replace(/\/+$/, ''); cfg.key = envKey; cfg.source = 'env';
    return;
  }
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (j.url && j.key) { cfg.url = j.url; cfg.key = j.key; cfg.source = 'file'; return; }
  } catch (_) { /* belum ada */ }
  cfg.url = ''; cfg.key = ''; cfg.source = null;
}

function save(url, key) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ url, key, saved_at: new Date().toISOString() }, null, 2), { mode: 0o600 });
  try { fs.chmodSync(FILE, 0o600); } catch (_) { /* Windows */ }
  cfg.url = url; cfg.key = key; cfg.source = 'file';
}

/** Terima URL projek Supabase; pulangkan origin yang bersih atau lontar ralat mesra. */
function normalizeUrl(input) {
  let u;
  try { u = new URL(String(input || '').trim()); } catch (_) { throw new Error('URL Supabase tidak sah. Contoh: https://abcdefgh.supabase.co'); }
  const hostOk = /\.supabase\.(co|in)$/i.test(u.hostname);
  if (!ALLOW_CUSTOM) {
    if (u.protocol !== 'https:') throw new Error('URL mesti bermula dengan https://');
    if (!hostOk) throw new Error('URL mesti berbentuk https://<projek>.supabase.co (Project URL dalam Project Settings > API).');
  } else if (!/^https?:$/.test(u.protocol)) throw new Error('URL tidak sah.');
  return u.origin;
}

/** Kunci backend mesti service_role / secret key, bukan anon / publishable. Pulang teks masalah atau null. */
function keyProblem(key) {
  key = String(key || '').trim();
  if (!key) return 'Kunci diperlukan.';
  if (/^sb_publishable_/.test(key)) return 'Ini kunci "publishable". Guna kunci service_role (secret).';
  if (/^sb_secret_/.test(key)) return null;
  if (/^eyJ/.test(key)) {
    try {
      const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
      return role === 'service_role' ? null : `Peranan kunci ialah "${role}". Guna kunci service_role (secret), bukan anon.`;
    } catch (_) { return 'Format kunci tidak sah.'; }
  }
  return 'Format kunci tidak dikenali. Salin semula kunci service_role daripada Supabase.';
}

const projectRef = (url) => (String(url).match(/^https:\/\/([a-z0-9]+)\.supabase\.(?:co|in)$/i) || [])[1] || null;

load();
module.exports = { cfg, load, save, normalizeUrl, keyProblem, projectRef, FILE };
