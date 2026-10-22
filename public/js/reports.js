'use strict';
/* =====================================================================
   MFZ Invoice System - Laporan (Harian / Mingguan / Bulanan / Tahunan,
   produk, pelanggan, belum bayar, inventori, sebut harga) + CSV + Cetak
   ===================================================================== */
const REPORT_TYPES = {
  sales: 'Jualan (Harian / Mingguan / Bulanan / Tahunan)',
  products: 'Jualan Mengikut Produk',
  customers: 'Jualan Mengikut Pelanggan',
  outstanding: 'Invois Belum Dibayar (Umur Hutang)',
  inventory: 'Inventori & Nilai Stok',
  quotations: 'Sebut Harga',
};
const PERIODS = { day: 'Harian', week: 'Mingguan', month: 'Bulanan', year: 'Tahunan' };
const R = { type: 'sales', period: 'month', from: '', to: '', last: null };

function defaultFrom(period) {
  const t = todayStr();
  if (period === 'day') return addDays(t, -29);
  if (period === 'week') return addDays(t, -83);
  if (period === 'month') { const d = new Date(t + 'T00:00:00'); d.setDate(1); d.setMonth(d.getMonth() - 11); return d.toLocaleDateString('en-CA'); }
  const y = new Date().getFullYear() - 4; return `${y}-01-01`;
}

/* ---- Jadual laporan generik. Lajur: {h, v(row) -> nilai mentah, r:nombor, money, sum, html(row)} ---- */
function reportTableHtml(rep, forPrint) {
  const cell = (c, row) => (c.html ? c.html(row) : c.money ? num(c.v(row)) : esc(c.v(row)));
  const foot = rep.cols.some((c) => c.sum) && rep.rows.length
    ? `<tfoot><tr>${rep.cols.map((c, i) => `<td class="${c.r ? 'r mono' : ''}">${c.sum ? (c.money ? num(rep.rows.reduce((a, r) => a + Number(c.v(r) || 0), 0)) : rep.rows.reduce((a, r) => a + Number(c.v(r) || 0), 0)) : i === 0 ? 'JUMLAH' : ''}</td>`).join('')}</tr></tfoot>` : '';
  const inner = `<thead><tr>${rep.cols.map((c) => `<th class="${c.r ? 'r' : ''}">${c.h}</th>`).join('')}</tr></thead>
    <tbody>${rep.rows.length ? rep.rows.map((row) => `<tr>${rep.cols.map((c) => `<td class="${c.r ? 'r mono' : ''}">${cell(c, row)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${rep.cols.length}" class="empty">Tiada data untuk tempoh ini</td></tr>`}</tbody>${foot}`;
  return forPrint ? `<table>${inner}</table>` : `<div class="tbl-wrap"><table class="tbl">${inner}</table></div>`;
}

function csvDownload(rep, filename) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [rep.cols.map((c) => q(c.h)).join(',')];
  rep.rows.forEach((r) => lines.push(rep.cols.map((c) => q(c.v(r))).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const card = (t, v, sub, warn) => `<div class="card stat ${warn ? 'warn' : ''}"><small>${t}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;

/* ---- Penjana setiap jenis laporan ---- */
const GENERATORS = {
  async sales() {
    const q = `period=${R.period}&from=${R.from}&to=${R.to}`;
    const d = await api('GET', `/api/reports/sales?${q}`);
    const sm = d.summary;
    return {
      title: `Laporan Jualan ${PERIODS[R.period]}`, range: `${fdate(d.from)} hingga ${fdate(d.to)}`,
      cards: [
        ['Bil. Invois', sm.invoice_count], ['Jumlah Jualan', rm(sm.sales_total)], ['Dikutip', rm(sm.collected)],
        ['Belum Dibayar', rm(sm.outstanding)], [`Cukai (${state.settings.tax_label || 'SST'})`, rm(sm.tax_total)],
        ['Sebut Harga', `${sm.quote_count} (${rm(sm.quote_total)})`], ['Pelanggan Baharu', sm.new_customers],
      ],
      chart: barChart(d.rows, [{ k: 'outstanding', name: 'Belum bayar', color: '#e9a97b' }, { k: 'collected', name: 'Dikutip', color: '#0f766e' }]),
      cols: [
        { h: 'Tempoh', v: (r) => r.label },
        { h: 'Bil. Invois', r: 1, sum: 1, v: (r) => r.invoice_count },
        { h: 'Jualan Kasar (RM)', r: 1, money: 1, sum: 1, v: (r) => r.subtotal },
        { h: 'Diskaun (RM)', r: 1, money: 1, sum: 1, v: (r) => r.discount },
        { h: 'Cukai (RM)', r: 1, money: 1, sum: 1, v: (r) => r.tax },
        { h: 'Jumlah (RM)', r: 1, money: 1, sum: 1, v: (r) => r.total },
        { h: 'Dikutip (RM)', r: 1, money: 1, sum: 1, v: (r) => r.collected },
        { h: 'Belum Bayar (RM)', r: 1, money: 1, sum: 1, v: (r) => r.outstanding },
      ],
      rows: d.rows,
      extra: [
        { title: 'Produk Terlaris (10 teratas)', cols: [{ h: 'Produk', v: (r) => r.name }, { h: 'Kuantiti', r: 1, v: (r) => r.qty }, { h: 'Jualan (RM)', r: 1, money: 1, v: (r) => r.revenue }], rows: d.top_products },
        { title: 'Pelanggan Teratas (10 teratas)', cols: [{ h: 'Pelanggan', v: (r) => r.customer }, { h: 'Invois', r: 1, v: (r) => r.invoice_count }, { h: 'Jumlah (RM)', r: 1, money: 1, v: (r) => r.total }], rows: d.top_customers },
      ],
      file: `jualan-${R.period}-${d.from}_${d.to}.csv`,
    };
  },
  async products() {
    const d = await api('GET', `/api/reports/products?from=${R.from}&to=${R.to}`);
    return {
      title: 'Laporan Jualan Mengikut Produk', range: `${fdate(d.from)} hingga ${fdate(d.to)}`,
      cards: [['Jenis Produk Terjual', d.rows.length], ['Jumlah Jualan', rm(d.rows.reduce((a, r) => a + Number(r.revenue), 0))]],
      cols: [{ h: 'Produk', v: (r) => r.name }, { h: 'SKU', v: (r) => r.sku || '' }, { h: 'Kuantiti Terjual', r: 1, sum: 1, v: (r) => r.qty },
        { h: 'Bil. Invois', r: 1, v: (r) => r.invoice_count }, { h: 'Jualan (RM)', r: 1, money: 1, sum: 1, v: (r) => r.revenue }],
      rows: d.rows, file: `produk-${d.from}_${d.to}.csv`,
    };
  },
  async customers() {
    const d = await api('GET', `/api/reports/customers?from=${R.from}&to=${R.to}`);
    return {
      title: 'Laporan Jualan Mengikut Pelanggan', range: `${fdate(d.from)} hingga ${fdate(d.to)}`,
      cards: [['Pelanggan Aktif', d.rows.length], ['Jumlah Jualan', rm(d.rows.reduce((a, r) => a + Number(r.total), 0))], ['Belum Dibayar', rm(d.rows.reduce((a, r) => a + Number(r.outstanding), 0))]],
      cols: [{ h: 'Pelanggan', v: (r) => r.customer }, { h: 'Kod', v: (r) => r.code || '' }, { h: 'Bil. Invois', r: 1, sum: 1, v: (r) => r.invoice_count },
        { h: 'Jumlah (RM)', r: 1, money: 1, sum: 1, v: (r) => r.total }, { h: 'Dikutip (RM)', r: 1, money: 1, sum: 1, v: (r) => r.collected }, { h: 'Belum Bayar (RM)', r: 1, money: 1, sum: 1, v: (r) => r.outstanding }],
      rows: d.rows, file: `pelanggan-${d.from}_${d.to}.csv`,
    };
  },
  async outstanding() {
    const d = await api('GET', '/api/reports/outstanding');
    const days = (r) => (r.due_date && r.due_date < d.today ? Math.round((new Date(d.today) - new Date(r.due_date)) / 864e5) : 0);
    const bal = (r) => round2(r.total - r.paid_amount);
    const bucket = (lo, hi) => d.rows.filter((r) => days(r) >= lo && days(r) <= hi).reduce((a, r) => a + bal(r), 0);
    return {
      title: 'Laporan Invois Belum Dibayar', range: `Setakat ${fdate(d.today)}`,
      cards: [['Jumlah Belum Bayar', rm(d.rows.reduce((a, r) => a + bal(r), 0)), `${d.rows.length} invois`], ['Belum Lewat', rm(bucket(0, 0))],
        ['Lewat 1–30 hari', rm(bucket(1, 30)), '', bucket(1, 30) > 0], ['Lewat 31–60 hari', rm(bucket(31, 60)), '', bucket(31, 60) > 0], ['Lewat 61+ hari', rm(bucket(61, 99999)), '', bucket(61, 99999) > 0]],
      cols: [{ h: 'No. Invois', v: (r) => r.invoice_no }, { h: 'Pelanggan', v: (r) => r.customer_name }, { h: 'Tarikh', v: (r) => fdate(r.issue_date) }, { h: 'Tarikh Akhir', v: (r) => fdate(r.due_date) },
        { h: 'Jumlah (RM)', r: 1, money: 1, sum: 1, v: (r) => r.total }, { h: 'Dibayar (RM)', r: 1, money: 1, sum: 1, v: (r) => r.paid_amount }, { h: 'Baki (RM)', r: 1, money: 1, sum: 1, v: bal },
        { h: 'Lewat (hari)', r: 1, v: days, html: (r) => (days(r) ? `<span class="badge b-low">${days(r)}</span>` : '0') }],
      rows: d.rows, file: `belum-bayar-${d.today}.csv`,
    };
  },
  async inventory() {
    const d = await api('GET', '/api/reports/inventory');
    const rows = d.rows;
    const tracked = rows.filter((r) => r.track_stock);
    const low = (r) => r.track_stock && Number(r.stock_qty) <= Number(r.reorder_level);
    const costVal = (r) => (r.track_stock ? round2(r.stock_qty * r.cost_price) : 0);
    const sellVal = (r) => (r.track_stock ? round2(r.stock_qty * r.sell_price) : 0);
    return {
      title: 'Laporan Inventori & Nilai Stok', range: `Setakat ${fdate(todayStr())}`,
      cards: [['Jumlah Item', rows.length, `${tracked.length} dijejak stok`], ['Nilai Stok (Kos)', rm(rows.reduce((a, r) => a + costVal(r), 0))],
        ['Nilai Stok (Jualan)', rm(rows.reduce((a, r) => a + sellVal(r), 0))], ['Stok Rendah', rows.filter(low).length, '', rows.filter(low).length > 0]],
      cols: [{ h: 'SKU', v: (r) => r.sku || '' }, { h: 'Produk', v: (r) => r.name }, { h: 'Kategori', v: (r) => r.category || '' }, { h: 'Unit', v: (r) => r.unit },
        { h: 'Stok', r: 1, v: (r) => (r.track_stock ? r.stock_qty : '-') }, { h: 'Aras Amaran', r: 1, v: (r) => (r.track_stock ? r.reorder_level : '-') },
        { h: 'Kos (RM)', r: 1, money: 1, v: (r) => r.cost_price }, { h: 'Jual (RM)', r: 1, money: 1, v: (r) => r.sell_price },
        { h: 'Nilai Kos (RM)', r: 1, money: 1, sum: 1, v: costVal }, { h: 'Nilai Jualan (RM)', r: 1, money: 1, sum: 1, v: sellVal },
        { h: 'Status', v: (r) => (!r.track_stock ? 'Perkhidmatan' : low(r) ? 'Stok Rendah' : 'OK'), html: (r) => (!r.track_stock ? '<small class="muted">Perkhidmatan</small>' : low(r) ? '<span class="badge b-low">Stok Rendah</span>' : '<span class="badge b-paid">OK</span>') }],
      rows, file: `inventori-${todayStr()}.csv`,
    };
  },
  async quotations() {
    const d = await api('GET', `/api/reports/quotations?from=${R.from}&to=${R.to}`);
    const by = (st) => d.rows.filter((r) => st.includes(r.status));
    const val = (a) => rm(a.reduce((x, r) => x + Number(r.total), 0));
    const closed = by(['accepted', 'invoiced', 'rejected', 'expired']).length;
    return {
      title: 'Laporan Sebut Harga', range: `${fdate(d.from)} hingga ${fdate(d.to)}`,
      cards: [['Jumlah Sebut Harga', d.rows.length, val(d.rows)], ['Diterima / Diinvois', by(['accepted', 'invoiced']).length, val(by(['accepted', 'invoiced']))],
        ['Dihantar (menunggu)', by(['sent']).length, val(by(['sent']))], ['Draf', by(['draft']).length, val(by(['draft']))],
        ['Ditolak / Tamat', by(['rejected', 'expired']).length, val(by(['rejected', 'expired']))],
        ['Kadar Kejayaan', closed ? Math.round((by(['accepted', 'invoiced']).length / closed) * 100) + '%' : '-']],
      cols: [{ h: 'No.', v: (r) => r.quotation_no }, { h: 'Tarikh', v: (r) => fdate(r.issue_date) }, { h: 'Pelanggan', v: (r) => r.customer_name }, { h: 'Sah Hingga', v: (r) => fdate(r.valid_until) },
        { h: 'Jumlah (RM)', r: 1, money: 1, sum: 1, v: (r) => r.total }, { h: 'Status', v: (r) => STATUS_QT[r.status] || r.status }],
      rows: d.rows, file: `sebut-harga-${d.from}_${d.to}.csv`,
    };
  },
};

function renderReport(rep) {
  R.last = rep;
  $('#rpt').innerHTML = `
    <div class="card" style="margin-bottom:14px"><h2>${esc(rep.title)}</h2><p class="muted" style="margin:2px 0 0">${esc(rep.range)}</p></div>
    <div class="cards">${rep.cards.map((c) => card(...c)).join('')}</div>
    ${rep.chart ? `<div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:6px">Graf Jualan</h3>${rep.chart}</div>` : ''}
    ${reportTableHtml(rep)}
    ${(rep.extra || []).map((x) => `<h3 style="margin:18px 0 8px">${esc(x.title)}</h3>${reportTableHtml(x)}`).join('')}`;
}

async function runReport() {
  const box = $('#rpt');
  if (!box) return;
  box.innerHTML = '<p class="muted">Menjana laporan…</p>';
  try { renderReport(await GENERATORS[R.type]()); } catch (e) { box.innerHTML = `<div class="card"><b>Ralat:</b> ${esc(e.message)}</div>`; }
}

function printReport() {
  const rep = R.last;
  if (!rep) return toast('Sila jana laporan dahulu', true);
  const pa = $('#printArea');
  pa.className = 'a4';
  pa.innerHTML = `<div class="rpt-print"><h2>${esc(state.settings.company_name)}</h2>
    <div><b>${esc(rep.title)}</b> — ${esc(rep.range)}</div>
    <div class="kv">${rep.cards.map((c) => `<span>${c[0]}: <b>${c[1]}</b></span>`).join('')}</div>
    ${reportTableHtml(rep, true)}
    ${(rep.extra || []).map((x) => `<h3 style="margin-top:5mm">${esc(x.title)}</h3>${reportTableHtml(x, true)}`).join('')}
    <p style="font-size:7pt;color:#666;margin-top:4mm">Dicetak pada ${new Date().toLocaleString('ms-MY')}</p></div>`;
  setPageSize('A4 portrait', '10mm');
  setTimeout(() => window.print(), 80);
}

VIEWS.reports = async () => {
  if (!R.from) { R.from = defaultFrom(R.period); R.to = todayStr(); }
  const needsRange = ['sales', 'products', 'customers', 'quotations'].includes(R.type);
  $('#view').innerHTML = `
    <div class="card" style="margin-bottom:14px"><div class="toolbar" style="margin:0">
      <label class="f" style="min-width:290px"><span>Jenis Laporan</span><select id="rType">${Object.entries(REPORT_TYPES).map(([k, v]) => `<option value="${k}" ${k === R.type ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${R.type === 'sales' ? `<div><span class="muted small" style="display:block;margin-bottom:3px">Tempoh</span><div class="tabs" id="rTabs">${Object.entries(PERIODS).map(([k, v]) => `<button data-p="${k}" class="${k === R.period ? 'on' : ''}">${v}</button>`).join('')}</div></div>` : ''}
      ${needsRange ? `<label class="f"><span>Dari</span><input type="date" id="rFrom" value="${R.from}"></label><label class="f"><span>Hingga</span><input type="date" id="rTo" value="${R.to}"></label>` : ''}
      <div style="align-self:flex-end;display:flex;gap:8px"><button class="btn primary" id="rGo">Jana Laporan</button><button class="btn" id="rCsv">⬇ CSV (Excel)</button><button class="btn" id="rPrint">🖨 Cetak</button></div>
    </div></div><div id="rpt"></div>`;
  $('#rType').onchange = (e) => { R.type = e.target.value; VIEWS.reports(); };
  $$('#rTabs button').forEach((b) => b.onclick = () => { R.period = b.dataset.p; R.from = defaultFrom(R.period); R.to = todayStr(); VIEWS.reports(); });
  const syncRange = () => { if ($('#rFrom')) { R.from = $('#rFrom').value; R.to = $('#rTo').value; } };
  $('#rGo').onclick = () => { syncRange(); if (!R.from || !R.to) return toast('Sila pilih tarikh', true); runReport(); };
  $('#rCsv').onclick = () => { if (!R.last) return toast('Sila jana laporan dahulu', true); csvDownload(R.last, R.last.file); };
  $('#rPrint').onclick = printReport;
  await runReport();
};
