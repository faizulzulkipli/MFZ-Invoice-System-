/* =====================================================================
   MFZ INVOICE SYSTEM - Backend (Node.js >= 18, TANPA pakej luar)
   - Menyajikan frontend dari folder /public
   - REST API  /api/*  yang bercakap terus dengan Supabase (PostgREST + RPC)
   - Kunci Supabase (service role) hanya berada di server, tidak ke pelayar
   ===================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- .env (parser ringkas; mesti sebelum lib/config dimuat) ----------
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
} catch (_) { /* tiada .env - guna environment sistem */ }

const { buildDocPdf } = require('./lib/pdf');
const { cfg, save: saveConfig, normalizeUrl, keyProblem, projectRef } = require('./lib/config');
const A = require('./lib/auth');

const PORT = Number(process.env.PORT || 3000);
const APP_USER = process.env.APP_USER || '';
const APP_PASSWORD = process.env.APP_PASSWORD || '';
// Admin melalui environment (pilihan; menggantikan akaun yang dicipta di halaman setup)
const ENV_ADMIN = APP_USER && APP_PASSWORD ? { username: APP_USER, password: APP_PASSWORD } : null;
const envSecret = () => crypto.createHash('sha256').update(`${APP_USER}\n${APP_PASSWORD}\n${cfg.key}`).digest('hex');

// ---------- Klien PostgREST ringkas ----------
async function restWith(url, key, method, pathAndQuery, body, headers = {}) {
  let res;
  try {
    res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw Object.assign(new Error('Tidak dapat menghubungi Supabase. Semak URL projek dan sambungan internet.'), { status: 502, code: 'NETWORK' });
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { message: text }; }
  if (!res.ok) {
    const err = new Error((data && (data.message || data.msg || data.error_description)) || res.statusText);
    err.code = data && data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}
function rest(...args) {
  if (!cfg.url) throw Object.assign(new Error('Sambungan Supabase belum ditetapkan.'), { status: 503 });
  return restWith(cfg.url, cfg.key, ...args);
}
const rpc = (fn, args) => rest('POST', `rpc/${fn}`, args || {});

// Ambil semua baris (Supabase hadkan 1000 baris sekali panggil)
async function all(table, query = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = await rest('GET', `${table}?select=*${query}&limit=1000&offset=${offset}`);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const one = async (table, query) => (await rest('GET', `${table}?select=*&${query}&limit=1`))[0] || null;

// ---------- Utiliti ----------
const clean = (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null);
const numOr = (v, d = 0) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? d : Number(v));
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, clean(obj[k])]));
const myDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
};
const httpError = (status, message) => Object.assign(new Error(message), { status });
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

function friendly(e) {
  if (e.code === '23503') return 'Rekod ini sedang digunakan oleh data lain (cth. invois/sebut harga), jadi tidak boleh dipadam.';
  if (e.code === '23505') return 'Nombor / kod ini sudah wujud. Sila guna yang lain.';
  if (e.code === '23514') return 'Data tidak sah (semak nilai yang dimasukkan).';
  if (e.code === '42501' || /permission denied/i.test(e.message || ''))
    return 'Kebenaran pangkalan data ditolak. Pastikan SUPABASE_SERVICE_ROLE_KEY ialah kunci service_role (bukan anon), dan jalankan semula database/schema.sql di Supabase.';
  if (e.code === 'PGRST202' || /Could not find the function/i.test(e.message || ''))
    return 'Fungsi pangkalan data tidak dijumpai. Pastikan database/schema.sql telah dijalankan di Supabase.';
  if (e.code === 'PGRST205' || /Could not find the table/i.test(e.message || ''))
    return 'Jadual tidak dijumpai. Pastikan database/schema.sql telah dijalankan di Supabase.';
  return e.message || 'Ralat tidak diketahui';
}

async function nextCode(table, col, prefix, width) {
  const rows = await rest('GET', `${table}?select=${col}&limit=100000`);
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  rows.forEach((r) => { const m = (r[col] || '').match(re); if (m) max = Math.max(max, Number(m[1])); });
  return prefix + String(max + 1).padStart(width, '0');
}

// ---------- Pengendali ----------
const CUSTOMER_FIELDS = ['code', 'name', 'contact_person', 'email', 'phone', 'address', 'notes'];
const PRODUCT_TEXT = ['sku', 'name', 'description', 'category', 'unit'];
const SETTINGS_FIELDS = ['company_name', 'reg_no', 'address', 'phone', 'email', 'website', 'tax_no', 'bank_name',
  'bank_account', 'bank_holder', 'invoice_prefix', 'quote_prefix', 'tax_label', 'tax_rate', 'invoice_terms', 'invoice_footer'];

function productBody(b) {
  const p = pick(b, PRODUCT_TEXT);
  ['cost_price', 'sell_price', 'stock_qty', 'reorder_level'].forEach((k) => { if (k in b) p[k] = numOr(b[k]); });
  ['track_stock', 'active'].forEach((k) => { if (k in b) p[k] = !!b[k]; });
  if ('unit' in p && !p.unit) p.unit = 'unit';
  return p;
}

function validateDoc(b) {
  if (!b || !Array.isArray(b.items) || b.items.length === 0) throw httpError(400, 'Sila masukkan sekurang-kurangnya satu barisan item.');
  if (!b.customer_id) throw httpError(400, 'Sila pilih pelanggan.');
  b.items = b.items.filter((i) => String(i.description || '').trim() !== '');
  if (!b.items.length) throw httpError(400, 'Sila isi perihal bagi item.');
  b.items.forEach((i) => {
    i.qty = numOr(i.qty, 1); i.unit_price = numOr(i.unit_price); i.discount = numOr(i.discount);
    i.product_id = i.product_id || null;
  });
  b.discount = numOr(b.discount); b.tax_rate = numOr(b.tax_rate);
  return b;
}

async function getDoc(kind, id) {
  const t = kind === 'invoice' ? 'invoices' : 'quotations';
  const doc = await one(t, `id=eq.${encodeURIComponent(id)}`);
  if (!doc) throw httpError(404, 'Dokumen tidak dijumpai');
  const [items, customer, payments] = await Promise.all([
    rest('GET', `${kind}_items?select=*&${kind}_id=eq.${doc.id}&order=line_no.asc`),
    doc.customer_id ? one('customers', `id=eq.${doc.customer_id}`) : null,
    kind === 'invoice' ? rest('GET', `payments?select=*&invoice_id=eq.${doc.id}&order=pay_date.asc,created_at.asc`) : [],
  ]);
  return { ...doc, items, customer, payments };
}

async function withCustomerNames(rows) {
  const customers = await all('customers');
  const map = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  return rows.map((r) => ({ ...r, customer_name: map[r.customer_id] || '' }));
}

const ROUTES = [];
const route = (method, pattern, fn) => ROUTES.push({ method, re: new RegExp(`^${pattern}$`), fn });

// --- Tetapan syarikat
route('GET', '/api/settings', async () => one('company_settings', 'id=eq.1'));
route('PUT', '/api/settings', async ({ body }) => {
  const d = pick(body, SETTINGS_FIELDS);
  if ('tax_rate' in d) d.tax_rate = numOr(d.tax_rate);
  if ('company_name' in d && !d.company_name) throw httpError(400, 'Nama syarikat diperlukan.');
  ['invoice_prefix', 'quote_prefix'].forEach((k) => { if (k in d && !d[k]) delete d[k]; });
  d.updated_at = new Date().toISOString();
  return (await rest('PATCH', 'company_settings?id=eq.1', d))[0];
});

// --- Pelanggan
route('GET', '/api/customers', async () => all('customers', '&order=code.asc.nullslast,name.asc'));
route('POST', '/api/customers', async ({ body }) => {
  const d = pick(body, CUSTOMER_FIELDS);
  if (!d.name) throw httpError(400, 'Nama pelanggan diperlukan.');
  if (!d.code) d.code = await nextCode('customers', 'code', 'C', 3);
  return (await rest('POST', 'customers', d))[0];
});
route('PUT', '/api/customers/([\\w-]+)', async ({ body, params }) => {
  const d = pick(body, CUSTOMER_FIELDS);
  if ('name' in d && !d.name) throw httpError(400, 'Nama pelanggan diperlukan.');
  d.updated_at = new Date().toISOString();
  return (await rest('PATCH', `customers?id=eq.${params[0]}`, d))[0];
});
route('DELETE', '/api/customers/([\\w-]+)', async ({ params }) => { await rest('DELETE', `customers?id=eq.${params[0]}`); return { ok: true }; });

// --- Inventori
route('GET', '/api/products', async () => all('products', '&order=sku.asc.nullslast,name.asc'));
route('POST', '/api/products', async ({ body }) => {
  const d = productBody(body);
  if (!d.name) throw httpError(400, 'Nama produk diperlukan.');
  if (!d.sku) d.sku = await nextCode('products', 'sku', 'P', 3);
  return (await rest('POST', 'products', d))[0];
});
route('PUT', '/api/products/([\\w-]+)', async ({ body, params }) => {
  const d = productBody(body);
  if ('name' in d && !d.name) throw httpError(400, 'Nama produk diperlukan.');
  d.updated_at = new Date().toISOString();
  return (await rest('PATCH', `products?id=eq.${params[0]}`, d))[0];
});
route('DELETE', '/api/products/([\\w-]+)', async ({ params }) => { await rest('DELETE', `products?id=eq.${params[0]}`); return { ok: true }; });

// --- Invois & Sebut harga (logik sama)
for (const [kind, plural, saveFn] of [['invoice', 'invoices', 'save_invoice'], ['quotation', 'quotations', 'save_quotation']]) {
  route('GET', `/api/${plural}`, async () =>
    withCustomerNames(await all(plural, '&order=issue_date.desc,created_at.desc')));
  route('GET', `/api/${plural}/([\\w-]+)`, async ({ params }) => getDoc(kind, params[0]));
  route('POST', `/api/${plural}`, async ({ body }) => {
    const id = await rpc(saveFn, { p: { ...validateDoc(body), id: null } });
    return getDoc(kind, id);
  });
  route('PUT', `/api/${plural}/([\\w-]+)`, async ({ body, params }) => {
    const id = await rpc(saveFn, { p: { ...validateDoc(body), id: params[0] } });
    return getDoc(kind, id);
  });
  route('DELETE', `/api/${plural}/([\\w-]+)`, async ({ params }) => { await rest('DELETE', `${plural}?id=eq.${params[0]}`); return { ok: true }; });
}
route('POST', '/api/quotations/([\\w-]+)/convert', async ({ params }) => {
  const invId = await rpc('convert_quotation', { p_id: params[0] });
  return getDoc('invoice', invId);
});

// --- PDF A5 (vektor, dijana di server; tiada kebergantungan luar)
route('GET', '/api/(invoices|quotations)/([\\w-]+)/pdf', async ({ params, query }) => {
  const kind = params[0] === 'invoices' ? 'invoice' : 'quotation';
  const [d, s] = await Promise.all([getDoc(kind, params[1]), one('company_settings', 'id=eq.1')]);
  const no = (kind === 'invoice' ? d.invoice_no : d.quotation_no).replace(/[^\w.-]+/g, '_');
  return { __raw: { type: 'application/pdf', body: buildDocPdf(kind, d, s || {}),
    disposition: `${query.get('download') === '1' ? 'attachment' : 'inline'}; filename="${no}.pdf"` } };
});

// --- Bayaran
route('POST', '/api/invoices/([\\w-]+)/payments', async ({ body, params }) => {
  const amount = numOr(body.amount);
  if (amount <= 0) throw httpError(400, 'Jumlah bayaran mesti lebih daripada 0.');
  await rest('POST', 'payments', {
    invoice_id: params[0], amount, pay_date: isDate(body.pay_date) ? body.pay_date : myDate(),
    method: body.method || 'cash', reference: clean(body.reference), notes: clean(body.notes),
  });
  return getDoc('invoice', params[0]);
});
route('DELETE', '/api/payments/([\\w-]+)', async ({ params }) => {
  const p = await one('payments', `id=eq.${params[0]}`);
  await rest('DELETE', `payments?id=eq.${params[0]}`);
  return p ? getDoc('invoice', p.invoice_id) : { ok: true };
});

// --- Laporan
function range(q, defFrom, defTo) {
  const from = isDate(q.get('from')) ? q.get('from') : defFrom;
  const to = isDate(q.get('to')) ? q.get('to') : defTo;
  if (from > to) throw httpError(400, 'Tarikh mula mesti sebelum tarikh akhir.');
  return { from, to };
}
route('GET', '/api/reports/sales', async ({ query }) => {
  const period = ['day', 'week', 'month', 'year'].includes(query.get('period')) ? query.get('period') : 'month';
  const { from, to } = range(query, myDate(-365), myDate());
  const [rows, summary, products, customers] = await Promise.all([
    rpc('report_sales', { p_period: period, p_from: from, p_to: to }),
    rpc('report_summary', { p_from: from, p_to: to }),
    rpc('report_top_products', { p_from: from, p_to: to, p_limit: 10 }),
    rpc('report_top_customers', { p_from: from, p_to: to, p_limit: 10 }),
  ]);
  return { period, from, to, rows, summary: summary[0], top_products: products, top_customers: customers };
});
route('GET', '/api/reports/products', async ({ query }) => {
  const { from, to } = range(query, myDate(-365), myDate());
  return { from, to, rows: await rpc('report_top_products', { p_from: from, p_to: to, p_limit: 10000 }) };
});
route('GET', '/api/reports/customers', async ({ query }) => {
  const { from, to } = range(query, myDate(-365), myDate());
  return { from, to, rows: await rpc('report_top_customers', { p_from: from, p_to: to, p_limit: 10000 }) };
});
route('GET', '/api/reports/outstanding', async () => {
  const inv = (await all('invoices', '&order=due_date.asc.nullslast')).filter((i) => ['unpaid', 'partial'].includes(i.status));
  return { today: myDate(), rows: await withCustomerNames(inv) };
});
route('GET', '/api/reports/inventory', async () => ({ rows: await all('products', '&order=category.asc.nullslast,name.asc') }));
route('GET', '/api/reports/quotations', async ({ query }) => {
  const { from, to } = range(query, myDate(-365), myDate());
  const rows = (await all('quotations', '&order=issue_date.desc')).filter((q) => q.issue_date >= from && q.issue_date <= to);
  return { from, to, rows: await withCustomerNames(rows) };
});

// --- Dashboard
route('GET', '/api/dashboard', async () => {
  const today = myDate();
  const monthStart = today.slice(0, 8) + '01';
  const yearStart = today.slice(0, 4) + '-01-01';
  const d = new Date(`${monthStart}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 5);
  const sixAgo = d.toISOString().slice(0, 10);
  const [t, m, y, chart, invoices, products] = await Promise.all([
    rpc('report_summary', { p_from: today, p_to: today }),
    rpc('report_summary', { p_from: monthStart, p_to: today }),
    rpc('report_summary', { p_from: yearStart, p_to: today }),
    rpc('report_sales', { p_period: 'month', p_from: sixAgo, p_to: today }),
    all('invoices', '&order=issue_date.desc,created_at.desc'),
    all('products', '&active=eq.true'),
  ]);
  const open = invoices.filter((i) => ['unpaid', 'partial'].includes(i.status));
  const overdue = open.filter((i) => i.due_date && i.due_date < today);
  return {
    today: t[0], month: m[0], year: y[0], chart,
    outstanding: { count: open.length, amount: open.reduce((s, i) => s + (i.total - i.paid_amount), 0) },
    overdue: { count: overdue.length, amount: overdue.reduce((s, i) => s + (i.total - i.paid_amount), 0) },
    low_stock: products.filter((p) => p.track_stock && Number(p.stock_qty) <= Number(p.reorder_level))
      .map((p) => ({ id: p.id, sku: p.sku, name: p.name, stock_qty: p.stock_qty, reorder_level: p.reorder_level })),
    recent: await withCustomerNames(invoices.slice(0, 8)),
  };
});

// ---------- Pelayan HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const PUBLIC = path.join(__dirname, 'public');

function sendJson(res, status, data) {
  const s = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2e6) { reject(httpError(413, 'Data terlalu besar')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(httpError(400, 'JSON tidak sah')); } });
    req.on('error', reject);
  });
}

// ---------- Admin, semakan skema & status setup ----------
let adminCache = { at: 0, val: null };
async function getAdmin(force) {
  if (ENV_ADMIN) return { username: ENV_ADMIN.username, env: true, secret: envSecret() };
  if (!cfg.url) return null;
  const ttl = adminCache.val ? 30000 : 2000;
  if (!force && Date.now() - adminCache.at < ttl) return adminCache.val;
  try {
    const rows = await rest('GET', 'app_admin?select=username,password_hash,secret&id=eq.1&limit=1');
    adminCache = { at: Date.now(), val: rows[0] || null };
  } catch (_) {
    adminCache = { at: Date.now() - ttl + 5000, val: adminCache.val };   // gangguan sementara: kekalkan nilai lama
  }
  return adminCache.val;
}
const isComplete = async () => !!cfg.url && !!(await getAdmin());

async function checkSchema(url, key) {
  const tries = [
    () => restWith(url, key, 'GET', 'company_settings?select=id&limit=1'),
    () => restWith(url, key, 'GET', 'app_admin?select=id&limit=1'),
    () => restWith(url, key, 'POST', 'rpc/report_summary', { p_from: '2000-01-01', p_to: '2000-01-01' }),
  ];
  for (const t of tries) {
    try { await t(); } catch (e) {
      if (e.code === 'NETWORK') return { status: 'network', message: e.message };
      if (e.code === '42501' || e.status === 401 || e.status === 403)
        return { status: 'forbidden', message: 'Kunci ditolak oleh Supabase. Pastikan ia kunci service_role projek ini.' };
      if (e.code === 'PGRST205' || e.code === 'PGRST202' || e.status === 404)
        return { status: 'missing', message: 'Jadual / fungsi pangkalan data belum lengkap. Jalankan schema.sql di SQL Editor Supabase.' };
      return { status: 'error', message: e.message };
    }
  }
  return { status: 'ok' };
}

async function setupStatus() {
  const configured = !!cfg.url;
  if (configured && (await getAdmin(true))) return { complete: true };
  const ref = projectRef(cfg.url);
  return {
    complete: false, configured, source: cfg.source, url: cfg.url || null, adminFromEnv: !!ENV_ADMIN,
    schema: configured ? await checkSchema(cfg.url, cfg.key) : null,
    sqlEditor: ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : null,
  };
}

const setupLimit = A.limiter(40, 10 * 60e3);
const loginLimit = A.limiter(8, 15 * 60e3);

async function session(req) {
  const admin = await getAdmin();
  if (!admin) return null;
  const tok = A.readToken(A.parseCookies(req.headers.cookie)[A.COOKIE], admin.secret);
  return tok && A.safeEq(tok.u, admin.username) ? tok : null;
}
const sessionFor = (admin) => A.makeToken(admin.username, admin.secret);

// ---------- API setup (hanya sebelum setup selesai) ----------
async function setupApi(req, res, url, complete) {
  const p = url.pathname;
  if (p === '/api/setup/status' && req.method === 'GET') return sendJson(res, 200, complete ? { complete: true } : await setupStatus());
  if (complete) return sendJson(res, 403, { error: 'Setup sudah selesai.' });
  const ip = A.clientIp(req);
  if (setupLimit.blocked(ip)) return sendJson(res, 429, { error: 'Terlalu banyak percubaan. Cuba lagi sebentar.' });

  if (p === '/api/setup/schema' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(path.join(__dirname, 'database', 'schema.sql')));
  }

  if (p === '/api/setup/connect' && req.method === 'POST') {
    setupLimit.fail(ip);
    const b = await readBody(req);
    if (cfg.url) {
      if (cfg.source === 'env') throw httpError(409, 'Sambungan ditetapkan melalui environment variable dan tidak boleh diubah di sini.');
      if (!A.safeEq(b.currentKey, cfg.key)) throw httpError(409, 'Sambungan sudah ditetapkan.');
    }
    const urlN = normalizeUrl(b.url);
    const problem = keyProblem(b.key);
    if (problem) throw httpError(400, problem);
    const key = String(b.key).trim();
    const schema = await checkSchema(urlN, key);
    if (['network', 'forbidden', 'error'].includes(schema.status)) throw httpError(400, schema.message);
    try { saveConfig(urlN, key); } catch (e) {
      throw httpError(500, 'Tidak dapat menyimpan konfigurasi pada pelayan ini (' + e.code + '). Tetapkan SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY sebagai environment variable.');
    }
    adminCache = { at: 0, val: null };
    return sendJson(res, 200, await setupStatus());
  }

  if (p === '/api/setup/admin' && req.method === 'POST') {
    setupLimit.fail(ip);
    const b = await readBody(req);
    if (!cfg.url) throw httpError(400, 'Sila tetapkan sambungan Supabase dahulu.');
    if (!A.safeEq(b.key, cfg.key)) throw httpError(403, 'Kunci service_role tidak sepadan dengan sambungan yang ditetapkan.');
    if (ENV_ADMIN) throw httpError(409, 'Akaun admin ditetapkan melalui APP_USER / APP_PASSWORD.');
    const username = String(b.username || '').trim();
    const password = String(b.password || '');
    if (!/^[A-Za-z0-9._@-]{3,40}$/.test(username)) throw httpError(400, 'Nama pengguna 3-40 aksara (huruf, nombor, . _ @ -).');
    if (password.length < 8 || password.length > 200) throw httpError(400, 'Kata laluan mesti sekurang-kurangnya 8 aksara.');
    const schema = await checkSchema(cfg.url, cfg.key);
    if (schema.status !== 'ok') throw httpError(400, schema.message || 'Skema pangkalan data belum lengkap.');
    if (await getAdmin(true)) throw httpError(409, 'Akaun admin sudah wujud.');
    const row = { id: 1, username, password_hash: A.hashPassword(password), secret: crypto.randomBytes(32).toString('hex') };
    try { await rest('POST', 'app_admin', row, { Prefer: 'return=minimal' }); } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Akaun admin sudah wujud.');
      throw e;
    }
    adminCache = { at: Date.now(), val: row };
    res.setHeader('Set-Cookie', A.sessionCookie(sessionFor(row), req));
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'API tidak dijumpai' });
}

// ---------- Fail statik & pelayan ----------
function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Dilarang'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Tidak dijumpai'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff', ...(ext === '.html' ? { 'X-Frame-Options': 'DENY' } : {}) });
    res.end(buf);
  });
}
const redirect = (res, to) => { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const isApi = p.startsWith('/api/');

    if (/^\/(css|js)\//.test(p)) return serveStatic(res, p);          // kod frontend (bukan rahsia)

    const complete = await isComplete();
    if (p.startsWith('/api/setup/')) return await setupApi(req, res, url, complete);

    if (!complete) {                                                   // belum disetup -> halaman setup sahaja
      if (p === '/setup.html') return serveStatic(res, p);
      if (isApi) return sendJson(res, 503, { error: 'Setup belum selesai.', setup: true });
      return redirect(res, '/setup.html');
    }
    if (p === '/setup.html') return redirect(res, '/');

    if (p === '/api/login' && req.method === 'POST') {
      const ip = A.clientIp(req);
      if (loginLimit.blocked(ip)) throw httpError(429, 'Terlalu banyak percubaan log masuk. Cuba lagi dalam 15 minit.');
      const b = await readBody(req);
      const admin = await getAdmin();
      const ok = admin && A.safeEq(b.username, admin.username) &&
        (admin.env ? A.safeEq(b.password, ENV_ADMIN.password) : A.verifyPassword(b.password, admin.password_hash));
      if (!ok) { loginLimit.fail(ip); throw httpError(401, 'Nama pengguna atau kata laluan salah.'); }
      loginLimit.reset(ip);
      res.setHeader('Set-Cookie', A.sessionCookie(sessionFor(admin), req));
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/login.html') return (await session(req)) ? redirect(res, '/') : serveStatic(res, p);

    const sess = await session(req);
    if (!sess) {
      if (isApi) return sendJson(res, 401, { error: 'Sesi tamat. Sila log masuk semula.', login: true });
      return redirect(res, '/login.html');
    }
    if (p === '/api/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', A.sessionCookie('', req, true));
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/me') return sendJson(res, 200, { username: sess.u });

    if (isApi) {
      for (const r of ROUTES) {
        if (r.method !== req.method) continue;
        const m = p.match(r.re);
        if (!m) continue;
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
        const out = await r.fn({ body, params: m.slice(1), query: url.searchParams });
        if (out && out.__raw) {
          res.writeHead(200, { 'Content-Type': out.__raw.type, 'Content-Disposition': out.__raw.disposition, 'Cache-Control': 'no-store' });
          return res.end(out.__raw.body);
        }
        return sendJson(res, 200, out);
      }
      return sendJson(res, 404, { error: 'API tidak dijumpai' });
    }
    return serveStatic(res, p);
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 400;
    if (status >= 500) console.error(e);
    sendJson(res, status, { error: friendly(e) });
  }
});

server.listen(PORT, () => {
  console.log(`MFZ Invoice System berjalan di http://localhost:${PORT}`);
  if (!cfg.url) console.log('Belum disetup: buka alamat di atas dalam pelayar untuk melengkapkan setup kali pertama.');
  else console.log(`Supabase: ${cfg.url} (sumber: ${cfg.source})  |  Admin: ${ENV_ADMIN ? 'dari environment' : 'dalam pangkalan data'}`);
});
