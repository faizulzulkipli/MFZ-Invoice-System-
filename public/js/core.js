'use strict';
/* =====================================================================
   MFZ Invoice System - core: utiliti, modal, router, papan pemuka, tetapan
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm = (n) => 'RM ' + num(n);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const todayStr = () => new Date().toLocaleDateString('en-CA');
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const fdate = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

const state = { settings: {} };
const STATUS_INV = { draft: 'Draf', unpaid: 'Belum Bayar', partial: 'Separa', paid: 'Dibayar', void: 'Batal' };
const STATUS_QT = { draft: 'Draf', sent: 'Dihantar', accepted: 'Diterima', rejected: 'Ditolak', expired: 'Tamat Tempoh', invoiced: 'Telah Diinvois' };
const PAY_METHODS = { cash: 'Tunai', bank: 'Pindahan Bank', card: 'Kad', ewallet: 'E-Dompet', cheque: 'Cek' };
const badge = (s, map) => `<span class="badge b-${esc(s)}">${esc(map[s] || s)}</span>`;

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.login) location.href = '/login.html';          // sesi tamat
    else if (data.setup) location.href = '/setup.html';     // setup belum selesai
    throw new Error(data.error || `Ralat pelayan (${res.status})`);
  }
  return data;
}

let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, isErr ? 5500 : 2600);
}

/* ---------- Modal (boleh bertindih) ---------- */
function closeModal(ov) { (ov || $('#modalRoot').lastElementChild)?.remove(); }
function openModal({ title, body, wide, buttons, onSave, saveLabel }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  const btns = buttons || [{ label: onSave ? 'Batal' : 'Tutup' }, ...(onSave ? [{ label: saveLabel || 'Simpan', primary: true, onClick: onSave }] : [])];
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <header><h3>${esc(title)}</h3><button class="btn ghost" data-x aria-label="Tutup">✕</button></header>
    <div class="body">${body}</div>
    <footer>${btns.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-b="${i}">${b.label}</button>`).join('')}</footer></div>`;
  $('#modalRoot').appendChild(ov);
  $('[data-x]', ov).onclick = () => closeModal(ov);
  $$('[data-b]', ov).forEach((el) => {
    const b = btns[+el.dataset.b];
    el.onclick = async () => {
      if (!b.onClick) return closeModal(ov);
      el.disabled = true;
      try { await b.onClick(ov); } catch (e) { toast(e.message, true); } finally { el.disabled = false; }
    };
  });
  const first = $('input:not([type=hidden]),select,textarea', ov);
  if (first && !wide) first.focus();
  return ov;
}

/* ---------- Jadual & senarai ---------- */
function table(cols, rows) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${c.h}</th>`).join('')}</tr></thead><tbody>${
    rows.length ? rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.cls || ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">Tiada data</td></tr>`}</tbody></table></div>`;
}

function mountList({ toolbar, rows, cols, match, onAct }) {
  $('#view').innerHTML = `<div class="toolbar">${toolbar}</div><div id="tbl"></div><p class="muted small" id="cnt"></p>`;
  const controls = $$('#view .toolbar [data-f]');
  const draw = () => {
    const f = Object.fromEntries(controls.map((e) => [e.dataset.f, e.type === 'checkbox' ? e.checked : e.value.trim().toLowerCase()]));
    const list = rows.filter((r) => match(r, f));
    $('#tbl').innerHTML = table(cols, list);
    $('#cnt').textContent = `${list.length} daripada ${rows.length} rekod`;
  };
  // Teks: 'input' sahaja (jika 'change' turut digunakan, jadual dilukis semula ketika blur
  // dan klik pertama pada butang baris hilang). Pilihan/tarikh/kotak semak: 'change'.
  controls.forEach((e) => e.addEventListener(['search', 'text'].includes(e.type) ? 'input' : 'change', draw));
  $('#tbl').onclick = (e) => { const b = e.target.closest('[data-act]'); if (b) onAct(b.dataset.act, b.dataset.id); };
  draw();
}

function barChart(rows, series, labelKey = 'label') {
  const H = 150;
  const m = Math.max(1, ...rows.map((r) => series.reduce((s, x) => s + Number(r[x.k] || 0), 0)));
  const short = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(n));
  return `<div class="chart">${rows.map((r) => {
    const tot = series.reduce((s, x) => s + Number(r[x.k] || 0), 0);
    return `<div class="col" title="${esc(r[labelKey])}: ${rm(tot)}"><div class="val">${tot ? short(tot) : ''}</div>
      <div class="stackbar">${series.map((x) => `<div class="bar" style="height:${(Number(r[x.k] || 0) / m) * H}px;min-height:0;border-radius:0;background:${x.color}"></div>`).join('')}</div>
      <div class="lbl">${esc(r[labelKey])}</div></div>`;
  }).join('')}</div>
  <div class="legend">${series.map((x) => `<span><i style="background:${x.color}"></i>${x.name}</span>`).join('')}</div>`;
}

const field = (label, inner) => `<label class="f"><span>${label}</span>${inner}</label>`;

/* ---------- Router ---------- */
const VIEWS = {};
const TITLES = { dashboard: 'Papan Pemuka', invoices: 'Invois', quotations: 'Sebut Harga', customers: 'Pelanggan', products: 'Inventori', reports: 'Laporan', settings: 'Tetapan Syarikat' };
async function router() {
  const r = (location.hash.slice(1) || 'dashboard').split('?')[0];
  const key = VIEWS[r] ? r : 'dashboard';
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === key));
  $('#pageTitle').textContent = TITLES[key];
  document.title = `${TITLES[key]} - MFZ Invoice System`;
  $('#sidebar').classList.remove('open');
  $('#view').innerHTML = '<p class="muted">Memuatkan…</p>';
  try { await VIEWS[key](); } catch (e) { $('#view').innerHTML = `<div class="card"><b>Ralat:</b> ${esc(e.message)}</div>`; }
}
const reload = () => router();

/* ---------- Papan pemuka ---------- */
VIEWS.dashboard = async () => {
  const d = await api('GET', '/api/dashboard');
  const stat = (t, v, sub, warn) => `<div class="card stat ${warn ? 'warn' : ''}"><small>${t}</small><b>${v}</b><span>${sub}</span></div>`;
  $('#view').innerHTML = `
    <div class="cards">
      ${stat('Jualan Hari Ini', rm(d.today.sales_total), `${d.today.invoice_count} invois`)}
      ${stat('Jualan Bulan Ini', rm(d.month.sales_total), `${d.month.invoice_count} invois · dikutip ${rm(d.month.collected)}`)}
      ${stat('Jualan Tahun Ini', rm(d.year.sales_total), `${d.year.invoice_count} invois`)}
      ${stat('Belum Dibayar', rm(d.outstanding.amount), `${d.outstanding.count} invois`)}
      ${stat('Lewat Tempoh', rm(d.overdue.amount), `${d.overdue.count} invois`, d.overdue.count > 0)}
      ${stat('Stok Rendah', d.low_stock.length, 'item perlu tambah stok', d.low_stock.length > 0)}
    </div>
    <div class="grid2" style="grid-template-columns:2fr 1fr">
      <div class="card"><h3 style="margin-bottom:8px">Jualan 6 Bulan Terakhir</h3>
        ${barChart(d.chart, [{ k: 'outstanding', name: 'Belum bayar', color: '#e9a97b' }, { k: 'collected', name: 'Dikutip', color: '#0f766e' }])}</div>
      <div class="card"><h3 style="margin-bottom:8px">Stok Rendah</h3>
        ${d.low_stock.length ? `<table class="tbl"><tbody>${d.low_stock.slice(0, 8).map((p) => `<tr><td>${esc(p.name)}<br><small class="muted">${esc(p.sku || '')}</small></td><td class="r"><span class="badge b-low">${num(p.stock_qty)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Semua stok mencukupi 👍</p>'}</div>
    </div>
    <div class="toolbar" style="margin-top:16px"><h2 class="grow">Invois Terkini</h2>
      <button class="btn primary" id="dNew">+ Invois Baharu</button></div>
    ${table(invoiceCols(false), d.recent)}`;
  $('#dNew').onclick = () => openDocEditor('invoice');
  $('.tbl-wrap:last-of-type').onclick = (e) => { const b = e.target.closest('[data-act]'); if (b) invoiceAction(b.dataset.act, b.dataset.id); };
};

/* ---------- Tetapan syarikat ---------- */
VIEWS.settings = async () => {
  const s = (state.settings = await api('GET', '/api/settings'));
  const t = (k, label, type = 'text') => field(label, `<input type="${type}" data-k="${k}" value="${esc(s[k])}">`);
  const ta = (k, label, rows = 3) => field(label, `<textarea data-k="${k}" rows="${rows}">${esc(s[k])}</textarea>`);
  $('#view').innerHTML = `<div class="stack" style="max-width:860px">
    <div class="card"><h3 style="margin-bottom:12px">Maklumat Syarikat <small class="muted">(dipaparkan pada invois &amp; sebut harga)</small></h3>
      <div class="grid2">${t('company_name', 'Nama Syarikat *')}${t('reg_no', 'No. Pendaftaran (SSM)')}</div>
      <div style="margin:12px 0">${ta('address', 'Alamat Syarikat (satu baris setiap baris alamat)', 4)}</div>
      <div class="grid2">${t('phone', 'No. Telefon')}${t('email', 'E-mel', 'email')}${t('website', 'Laman Web')}${t('tax_no', 'No. Cukai (SST/TIN)')}</div></div>
    <div class="card"><h3 style="margin-bottom:12px">Maklumat Bank <small class="muted">(untuk pembayaran)</small></h3>
      <div class="grid3">${t('bank_name', 'Nama Bank')}${t('bank_account', 'No. Akaun')}${t('bank_holder', 'Nama Pemegang Akaun')}</div></div>
    <div class="card"><h3 style="margin-bottom:12px">Tetapan Dokumen</h3>
      <div class="grid4">${t('invoice_prefix', 'Awalan No. Invois')}${t('quote_prefix', 'Awalan No. Sebut Harga')}${t('tax_label', 'Nama Cukai')}${t('tax_rate', 'Kadar Cukai Lalai (%)', 'number')}</div>
      <div class="grid2" style="margin-top:12px">${ta('invoice_terms', 'Terma &amp; Syarat Lalai', 4)}${ta('invoice_footer', 'Nota Kaki Dokumen', 4)}</div></div>
    <div><button class="btn primary" id="saveSettings">Simpan Tetapan</button></div></div>`;
  $('#saveSettings').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const body = Object.fromEntries($$('#view [data-k]').map((el) => [el.dataset.k, el.value]));
      state.settings = await api('PUT', '/api/settings', body);
      $('#brandCo').textContent = state.settings.company_name;
      toast('Tetapan disimpan');
    } catch (err) { toast(err.message, true); } finally { e.target.disabled = false; }
  };
};

/* ---------- Mula ---------- */
async function boot() {
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  window.addEventListener('hashchange', router);
  $('#logoutBtn').onclick = async () => { try { await api('POST', '/api/logout'); } catch (_) { /* abaikan */ } location.href = '/login.html'; };
  api('GET', '/api/me').then((m) => { $('#meUser').textContent = m.username; }).catch(() => {});
  try { state.settings = await api('GET', '/api/settings'); $('#brandCo').textContent = state.settings.company_name; }
  catch (e) { toast(e.message, true); }
  router();
}
window.addEventListener('DOMContentLoaded', boot);

/* Tetapkan saiz kertas cetakan secara dinamik (serasi Chrome/Edge/Firefox/Safari) */
function setPageSize(size, margin) {
  let st = document.getElementById('pageRule');
  if (!st) { st = document.createElement('style'); st.id = 'pageRule'; document.head.appendChild(st); }
  st.textContent = `@page{size:${size};margin:${margin}}`;
}
