'use strict';
/* =====================================================================
   MFZ Invoice System - pelanggan, inventori, invois, sebut harga,
   bayaran, dan cetakan A5 / PDF
   ===================================================================== */

/* ===================== PELANGGAN ===================== */
function openCustomerForm(c, done) {
  c = c || {};
  const inp = (k, label, type = 'text', ph = '') => field(label, `<input type="${type}" data-k="${k}" value="${esc(c[k])}" placeholder="${esc(ph)}">`);
  openModal({
    title: c.id ? 'Edit Pelanggan' : 'Pelanggan Baharu',
    body: `<div class="grid2">${inp('code', 'Kod', 'text', 'Auto jika kosong')}${inp('name', 'Nama Pelanggan / Syarikat *')}
      ${inp('contact_person', 'Nama Untuk Dihubungi')}${inp('phone', 'No. Telefon', 'tel')}</div>
      ${inp('email', 'E-mel', 'email')}
      ${field('Alamat', `<textarea data-k="address" rows="3">${esc(c.address)}</textarea>`)}
      ${field('Catatan', `<textarea data-k="notes" rows="2">${esc(c.notes)}</textarea>`)}`,
    onSave: async (ov) => {
      const body = Object.fromEntries($$('[data-k]', ov).map((el) => [el.dataset.k, el.value]));
      if (!body.name.trim()) throw new Error('Nama pelanggan diperlukan.');
      const saved = c.id ? await api('PUT', `/api/customers/${c.id}`, body) : await api('POST', '/api/customers', body);
      closeModal(ov);
      toast(c.id ? 'Pelanggan dikemas kini' : 'Pelanggan ditambah');
      done ? done(saved) : reload();
    },
  });
}

VIEWS.customers = async () => {
  const rows = await api('GET', '/api/customers');
  mountList({
    toolbar: `<h2 class="grow">Pelanggan</h2><input type="search" data-f="q" placeholder="Cari nama / kod / telefon…"><button class="btn primary" id="newBtn">+ Pelanggan Baharu</button>`,
    rows,
    match: (r, f) => !f.q || [r.code, r.name, r.contact_person, r.phone, r.email].join(' ').toLowerCase().includes(f.q),
    cols: [
      { h: 'Kod', f: (r) => esc(r.code) },
      { h: 'Nama', f: (r) => `<b>${esc(r.name)}</b>${r.contact_person ? `<br><small class="muted">${esc(r.contact_person)}</small>` : ''}` },
      { h: 'Telefon', f: (r) => esc(r.phone) },
      { h: 'E-mel', f: (r) => esc(r.email) },
      { h: 'Alamat', f: (r) => `<small>${nl2br((r.address || '').replace(/\n/g, ', '))}</small>` },
      { h: '', cls: 'actions', f: (r) => `<button class="btn sm" data-act="edit" data-id="${r.id}">Edit</button> <button class="btn sm danger" data-act="del" data-id="${r.id}">Padam</button>` },
    ],
    onAct: async (act, id) => {
      const r = rows.find((x) => x.id === id);
      if (act === 'edit') openCustomerForm(r);
      if (act === 'del' && confirm(`Padam pelanggan "${r.name}"?`)) {
        try { await api('DELETE', `/api/customers/${id}`); toast('Pelanggan dipadam'); reload(); } catch (e) { toast(e.message, true); }
      }
    },
  });
  $('#newBtn').onclick = () => openCustomerForm();
};

/* ===================== INVENTORI ===================== */
function openProductForm(p) {
  p = p || { track_stock: true, active: true, unit: 'unit' };
  const inp = (k, label, type = 'text', ph = '', extra = '') => field(label, `<input type="${type}" ${extra} data-k="${k}" value="${esc(p[k] ?? '')}" placeholder="${esc(ph)}">`);
  openModal({
    title: p.id ? 'Edit Produk' : 'Produk Baharu',
    body: `<div class="grid2">${inp('sku', 'SKU / Kod', 'text', 'Auto jika kosong')}${inp('name', 'Nama Produk *')}
      ${inp('category', 'Kategori')}${inp('unit', 'Unit (cth: unit, kotak, jam)')}
      ${inp('cost_price', 'Harga Kos (RM)', 'number', '', 'step="0.01" min="0"')}${inp('sell_price', 'Harga Jualan (RM)', 'number', '', 'step="0.01" min="0"')}
      ${inp('stock_qty', 'Kuantiti Stok', 'number', '', 'step="any"')}${inp('reorder_level', 'Aras Amaran Stok Rendah', 'number', '', 'step="any" min="0"')}</div>
      ${field('Keterangan', `<textarea data-k="description" rows="2">${esc(p.description)}</textarea>`)}
      <label class="chk"><input type="checkbox" data-k="track_stock" ${p.track_stock ? 'checked' : ''}> Jejak stok (nyahtanda untuk perkhidmatan)</label>
      <label class="chk"><input type="checkbox" data-k="active" ${p.active ? 'checked' : ''}> Aktif (boleh dipilih ketika buat invois)</label>`,
    onSave: async (ov) => {
      const body = Object.fromEntries($$('[data-k]', ov).map((el) => [el.dataset.k, el.type === 'checkbox' ? el.checked : el.value]));
      if (!body.name.trim()) throw new Error('Nama produk diperlukan.');
      p.id ? await api('PUT', `/api/products/${p.id}`, body) : await api('POST', '/api/products', body);
      closeModal(ov);
      toast(p.id ? 'Produk dikemas kini' : 'Produk ditambah');
      reload();
    },
  });
}

VIEWS.products = async () => {
  const rows = await api('GET', '/api/products');
  const low = (r) => r.track_stock && Number(r.stock_qty) <= Number(r.reorder_level);
  mountList({
    toolbar: `<h2 class="grow">Inventori</h2><input type="search" data-f="q" placeholder="Cari nama / SKU / kategori…">
      <label class="chk"><input type="checkbox" data-f="low"> Stok rendah sahaja</label><button class="btn primary" id="newBtn">+ Produk Baharu</button>`,
    rows,
    match: (r, f) => (!f.q || [r.sku, r.name, r.category].join(' ').toLowerCase().includes(f.q)) && (!f.low || low(r)),
    cols: [
      { h: 'SKU', f: (r) => esc(r.sku) },
      { h: 'Produk', f: (r) => `<b>${esc(r.name)}</b>${r.active ? '' : ' <span class="badge b-draft">Tidak aktif</span>'}` },
      { h: 'Kategori', f: (r) => esc(r.category) },
      { h: 'Unit', f: (r) => esc(r.unit) },
      { h: 'Kos (RM)', cls: 'r mono', f: (r) => num(r.cost_price) },
      { h: 'Jual (RM)', cls: 'r mono', f: (r) => num(r.sell_price) },
      { h: 'Stok', cls: 'r mono', f: (r) => (r.track_stock ? `${low(r) ? '<span class="badge b-low">' + num(r.stock_qty) + '</span>' : num(r.stock_qty)}` : '<small class="muted">Perkhidmatan</small>') },
      { h: '', cls: 'actions', f: (r) => `<button class="btn sm" data-act="edit" data-id="${r.id}">Edit</button> <button class="btn sm danger" data-act="del" data-id="${r.id}">Padam</button>` },
    ],
    onAct: async (act, id) => {
      const r = rows.find((x) => x.id === id);
      if (act === 'edit') openProductForm(r);
      if (act === 'del' && confirm(`Padam produk "${r.name}"?\n(Invois lama kekal, hanya pautan produk dibuang.)`)) {
        try { await api('DELETE', `/api/products/${id}`); toast('Produk dipadam'); reload(); } catch (e) { toast(e.message, true); }
      }
    },
  });
  $('#newBtn').onclick = () => openProductForm();
};

/* ===================== INVOIS ===================== */
function invoiceCols() {
  return [
    { h: 'No. Invois', f: (r) => `<b>${esc(r.invoice_no)}</b>` },
    { h: 'Tarikh', f: (r) => fdate(r.issue_date) },
    { h: 'Pelanggan', f: (r) => esc(r.customer_name) },
    { h: 'Jumlah (RM)', cls: 'r mono', f: (r) => num(r.total) },
    { h: 'Dibayar', cls: 'r mono', f: (r) => num(r.paid_amount) },
    { h: 'Baki', cls: 'r mono', f: (r) => (['void', 'draft'].includes(r.status) ? '-' : num(r.total - r.paid_amount)) },
    { h: 'Status', f: (r) => badge(r.status, STATUS_INV) + (['unpaid', 'partial'].includes(r.status) && r.due_date && r.due_date < todayStr() ? ' <span class="badge b-low">Lewat</span>' : '') },
    { h: '', cls: 'actions', f: (r) => `<button class="btn sm" data-act="view" data-id="${r.id}">Papar</button>
      <button class="btn sm" data-act="print" data-id="${r.id}">Cetak</button>
      <button class="btn sm" data-act="pdf" data-id="${r.id}">PDF</button>
      <button class="btn sm" data-act="pay" data-id="${r.id}">Bayaran</button>
      <button class="btn sm" data-act="edit" data-id="${r.id}">Edit</button>
      <button class="btn sm danger" data-act="del" data-id="${r.id}">Padam</button>` },
  ];
}

async function invoiceAction(act, id) {
  try {
    if (act === 'view') return await openPreview('invoice', id);
    if (act === 'print') return await printDoc('invoice', id, 'print');
    if (act === 'pdf') return await printDoc('invoice', id, 'pdf');
    if (act === 'pay') return await openPayments(id);
    if (act === 'edit') return await openDocEditor('invoice', id);
    if (act === 'del' && confirm('Padam invois ini? Stok akan dikembalikan dan semua bayaran berkaitan turut dipadam.')) {
      await api('DELETE', `/api/invoices/${id}`); toast('Invois dipadam'); reload();
    }
  } catch (e) { toast(e.message, true); }
}

VIEWS.invoices = async () => {
  const rows = await api('GET', '/api/invoices');
  mountList({
    toolbar: `<h2 class="grow">Invois</h2><input type="search" data-f="q" placeholder="Cari no. invois / pelanggan…">
      <select data-f="st"><option value="">Semua status</option>${Object.entries(STATUS_INV).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <input type="date" data-f="from" title="Dari"><input type="date" data-f="to" title="Hingga">
      <button class="btn primary" id="newBtn">+ Invois Baharu</button>`,
    rows,
    match: (r, f) => (!f.q || [r.invoice_no, r.customer_name, r.reference].join(' ').toLowerCase().includes(f.q)) &&
      (!f.st || r.status === f.st) && (!f.from || r.issue_date >= f.from) && (!f.to || r.issue_date <= f.to),
    cols: invoiceCols(),
    onAct: invoiceAction,
  });
  $('#newBtn').onclick = () => openDocEditor('invoice');
};

/* ===================== SEBUT HARGA ===================== */
VIEWS.quotations = async () => {
  const rows = await api('GET', '/api/quotations');
  mountList({
    toolbar: `<h2 class="grow">Sebut Harga</h2><input type="search" data-f="q" placeholder="Cari no. / pelanggan…">
      <select data-f="st"><option value="">Semua status</option>${Object.entries(STATUS_QT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <input type="date" data-f="from" title="Dari"><input type="date" data-f="to" title="Hingga">
      <button class="btn primary" id="newBtn">+ Sebut Harga Baharu</button>`,
    rows,
    match: (r, f) => (!f.q || [r.quotation_no, r.customer_name, r.reference].join(' ').toLowerCase().includes(f.q)) &&
      (!f.st || r.status === f.st) && (!f.from || r.issue_date >= f.from) && (!f.to || r.issue_date <= f.to),
    cols: [
      { h: 'No. Sebut Harga', f: (r) => `<b>${esc(r.quotation_no)}</b>` },
      { h: 'Tarikh', f: (r) => fdate(r.issue_date) },
      { h: 'Sah Hingga', f: (r) => fdate(r.valid_until) },
      { h: 'Pelanggan', f: (r) => esc(r.customer_name) },
      { h: 'Jumlah (RM)', cls: 'r mono', f: (r) => num(r.total) },
      { h: 'Status', f: (r) => badge(r.status, STATUS_QT) },
      { h: '', cls: 'actions', f: (r) => `<button class="btn sm" data-act="view" data-id="${r.id}">Papar</button>
        <button class="btn sm" data-act="print" data-id="${r.id}">Cetak</button>
        <button class="btn sm" data-act="pdf" data-id="${r.id}">PDF</button>
        ${r.converted_invoice_id || r.status === 'invoiced' ? '' : `<button class="btn sm" data-act="convert" data-id="${r.id}">→ Invois</button>`}
        <button class="btn sm" data-act="edit" data-id="${r.id}">Edit</button>
        <button class="btn sm danger" data-act="del" data-id="${r.id}">Padam</button>` },
    ],
    onAct: async (act, id) => {
      try {
        if (act === 'view') return await openPreview('quotation', id);
        if (act === 'print') return await printDoc('quotation', id, 'print');
        if (act === 'pdf') return await printDoc('quotation', id, 'pdf');
        if (act === 'edit') return await openDocEditor('quotation', id);
        if (act === 'convert' && confirm('Tukar sebut harga ini kepada invois?')) {
          const inv = await api('POST', `/api/quotations/${id}/convert`);
          toast(`Invois ${inv.invoice_no} dicipta`); location.hash = '#invoices';
        }
        if (act === 'del' && confirm('Padam sebut harga ini?')) { await api('DELETE', `/api/quotations/${id}`); toast('Sebut harga dipadam'); reload(); }
      } catch (e) { toast(e.message, true); }
    },
  });
  $('#newBtn').onclick = () => openDocEditor('quotation');
};

/* ===================== EDITOR INVOIS / SEBUT HARGA ===================== */
async function openDocEditor(kind, id) {
  const isInv = kind === 'invoice';
  const base = isInv ? 'invoices' : 'quotations';
  const [customers, products, doc] = await Promise.all([
    api('GET', '/api/customers'), api('GET', '/api/products'), id ? api('GET', `/api/${base}/${id}`) : null,
  ]);
  const s = state.settings;
  const d = doc || {
    issue_date: todayStr(), due_date: addDays(todayStr(), 30), valid_until: addDays(todayStr(), 30),
    status: isInv ? 'unpaid' : 'draft', tax_rate: s.tax_rate || 0, terms: s.invoice_terms || '', notes: '', discount: 0, reference: '',
  };
  const items = (d.items && d.items.length ? d.items : [{ description: '', qty: 1, unit_price: 0, discount: 0 }]).map((i) => ({ ...i }));
  const statuses = isInv ? { unpaid: 'Aktif (status bayaran automatik)', draft: 'Draf', void: 'Batal' } : STATUS_QT;
  const curStatus = isInv && ['paid', 'partial'].includes(d.status) ? 'unpaid' : d.status;
  const custOpts = (sel) => `<option value="">— Pilih pelanggan —</option>${customers.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.code || '')} ${esc(c.name)}</option>`).join('')}`;
  const prodOpts = (sel) => `<option value="">— Item bebas —</option>${products.filter((p) => p.active || p.id === sel).map((p) =>
    `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.sku || '')} ${esc(p.name)}${p.track_stock ? ` (stok ${num(p.stock_qty)})` : ''}</option>`).join('')}`;

  const ov = openModal({
    title: `${id ? 'Edit' : 'Baharu'} ${isInv ? 'Invois' : 'Sebut Harga'}${doc ? ' — ' + (d.invoice_no || d.quotation_no) : ''}`,
    wide: true,
    saveLabel: 'Simpan',
    body: `
      <div class="grid3">
        <div>${field('Pelanggan *', `<div style="display:flex;gap:6px"><select id="dCust">${custOpts(d.customer_id)}</select><button class="btn" id="dNewCust" type="button">+ Baru</button></div>`)}</div>
        ${field(isInv ? 'No. Invois' : 'No. Sebut Harga', `<input type="text" id="dNo" value="${esc(d.invoice_no || d.quotation_no || '')}" placeholder="Auto (cth. ${isInv ? s.invoice_prefix : s.quote_prefix}${new Date().getFullYear()}-0001)">`)}
        ${field('Status', `<select id="dStatus">${Object.entries(statuses).map(([k, v]) => `<option value="${k}" ${k === curStatus ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${field('Tarikh', `<input type="date" id="dDate" value="${esc(d.issue_date)}">`)}
        ${field(isInv ? 'Tarikh Akhir Bayaran' : 'Sah Sehingga', `<input type="date" id="dDue" value="${esc((isInv ? d.due_date : d.valid_until) || '')}">`)}
        ${field('Rujukan / No. PO', `<input type="text" id="dRef" value="${esc(d.reference)}">`)}
      </div>
      <div style="overflow:auto"><table class="items"><thead><tr><th>Produk</th><th>Perihal *</th><th>Kuantiti</th><th>Harga (RM)</th><th>Diskaun (RM)</th><th class="r">Jumlah</th><th></th></tr></thead><tbody id="dRows"></tbody></table></div>
      <div><button class="btn" id="dAdd" type="button">+ Tambah Baris</button></div>
      <div class="grid2">
        <div style="display:grid;gap:10px">${field('Nota (dipaparkan pada dokumen)', `<textarea id="dNotes" rows="2">${esc(d.notes)}</textarea>`)}
          ${field('Terma & Syarat', `<textarea id="dTerms" rows="3">${esc(d.terms)}</textarea>`)}</div>
        <div class="totals">
          <div><span>Jumlah Kecil</span><b id="tSub">0.00</b></div>
          <div><span>Diskaun Keseluruhan (RM)</span><input type="number" step="0.01" min="0" id="dDisc" value="${d.discount || 0}"></div>
          <div><span>${esc(s.tax_label || 'Cukai')} (%)</span><input type="number" step="0.01" min="0" id="dTax" value="${d.tax_rate || 0}"></div>
          <div><span>Jumlah ${esc(s.tax_label || 'Cukai')}</span><b id="tTax">0.00</b></div>
          <div class="grand"><span>JUMLAH</span><span id="tTotal">RM 0.00</span></div>
          ${isInv && doc ? `<div class="muted small"><span>Telah dibayar</span><span>${rm(d.paid_amount)}</span></div>` : ''}
        </div>
      </div>`,
    onSave: async () => {
      const payload = {
        customer_id: $('#dCust', ov).value, issue_date: $('#dDate', ov).value, status: $('#dStatus', ov).value,
        reference: $('#dRef', ov).value, notes: $('#dNotes', ov).value, terms: $('#dTerms', ov).value,
        discount: parseFloat($('#dDisc', ov).value) || 0, tax_rate: parseFloat($('#dTax', ov).value) || 0,
        items: items.filter((i) => String(i.description || '').trim()).map(({ product_id, description, qty, unit_price, discount }) => ({ product_id: product_id || null, description, qty, unit_price, discount })),
      };
      payload[isInv ? 'invoice_no' : 'quotation_no'] = $('#dNo', ov).value.trim();
      payload[isInv ? 'due_date' : 'valid_until'] = $('#dDue', ov).value || null;
      if (!payload.customer_id) throw new Error('Sila pilih pelanggan.');
      if (!payload.issue_date) throw new Error('Sila isi tarikh.');
      if (!payload.items.length) throw new Error('Sila isi perihal sekurang-kurangnya satu item.');
      const saved = id ? await api('PUT', `/api/${base}/${id}`, payload) : await api('POST', `/api/${base}`, payload);
      closeModal(ov);
      toast(`${isInv ? 'Invois' : 'Sebut harga'} ${saved.invoice_no || saved.quotation_no} disimpan`);
      reload();
    },
  });

  const tbody = $('#dRows', ov);
  const calc = () => {
    let sub = 0;
    $$('tr', tbody).forEach((tr) => {
      const it = items[+tr.dataset.i];
      const line = round2((it.qty || 0) * (it.unit_price || 0) - (it.discount || 0));
      sub += line; $('.lt', tr).textContent = num(line);
    });
    const disc = parseFloat($('#dDisc', ov).value) || 0;
    const tax = round2(((sub - disc) * (parseFloat($('#dTax', ov).value) || 0)) / 100);
    $('#tSub', ov).textContent = num(sub); $('#tTax', ov).textContent = num(tax); $('#tTotal', ov).textContent = rm(sub - disc + tax);
  };
  const drawRows = () => {
    tbody.innerHTML = items.map((it, i) => `<tr data-i="${i}">
      <td style="width:190px"><select data-f="product_id">${prodOpts(it.product_id)}</select></td>
      <td><input type="text" data-f="description" value="${esc(it.description)}" placeholder="Perihal item"></td>
      <td style="width:80px"><input type="number" step="any" min="0" data-f="qty" value="${it.qty ?? 1}"></td>
      <td style="width:105px"><input type="number" step="0.01" min="0" data-f="unit_price" value="${it.unit_price ?? 0}"></td>
      <td style="width:95px"><input type="number" step="0.01" min="0" data-f="discount" value="${it.discount ?? 0}"></td>
      <td class="lt" style="width:100px"></td>
      <td style="width:32px"><button class="btn ghost sm" data-del type="button" title="Buang baris">✕</button></td></tr>`).join('');
    calc();
  };
  tbody.addEventListener('input', (e) => {
    const t = e.target; const f = t.dataset.f; if (!f) return;
    const tr = t.closest('tr'); const it = items[+tr.dataset.i];
    it[f] = t.type === 'number' ? parseFloat(t.value) || 0 : t.value;
    if (f === 'product_id') {
      const p = products.find((x) => x.id === t.value);
      if (p) {
        it.description = p.name; it.unit_price = Number(p.sell_price);
        $('[data-f=description]', tr).value = p.name; $('[data-f=unit_price]', tr).value = p.sell_price;
      }
    }
    calc();
  });
  tbody.addEventListener('click', (e) => {
    if (!e.target.closest('[data-del]')) return;
    items.splice(+e.target.closest('tr').dataset.i, 1);
    if (!items.length) items.push({ description: '', qty: 1, unit_price: 0, discount: 0 });
    drawRows();
  });
  $('#dAdd', ov).onclick = () => { items.push({ description: '', qty: 1, unit_price: 0, discount: 0 }); drawRows(); };
  $('#dDisc', ov).oninput = calc; $('#dTax', ov).oninput = calc;
  $('#dNewCust', ov).onclick = () => openCustomerForm(null, (c) => { customers.push(c); $('#dCust', ov).innerHTML = custOpts(c.id); });
  drawRows();
}

/* ===================== BAYARAN ===================== */
async function openPayments(id) {
  let inv = await api('GET', `/api/invoices/${id}`);
  const ov = openModal({ title: `Bayaran — ${inv.invoice_no}`, body: '', buttons: [{ label: 'Tutup' }] });
  const draw = () => {
    const bal = round2(inv.total - inv.paid_amount);
    $('.body', ov).innerHTML = `
      <div class="cards" style="margin:0"><div class="card stat"><small>Jumlah Invois</small><b>${rm(inv.total)}</b></div>
        <div class="card stat"><small>Telah Dibayar</small><b>${rm(inv.paid_amount)}</b></div>
        <div class="card stat ${bal > 0 ? 'warn' : ''}"><small>Baki</small><b>${rm(bal)}</b><span>${badge(inv.status, STATUS_INV)}</span></div></div>
      ${table([
        { h: 'Tarikh', f: (p) => fdate(p.pay_date) }, { h: 'Kaedah', f: (p) => esc(PAY_METHODS[p.method] || p.method) },
        { h: 'Rujukan', f: (p) => esc(p.reference) }, { h: 'Jumlah (RM)', cls: 'r mono', f: (p) => num(p.amount) },
        { h: '', cls: 'actions', f: (p) => `<button class="btn sm danger" data-delpay="${p.id}">Padam</button>` },
      ], inv.payments)}
      ${['draft', 'void'].includes(inv.status) ? '<p class="muted">Invois berstatus Draf/Batal — tukar kepada "Aktif" untuk merekod bayaran.</p>' : `
      <h3 style="margin-top:6px">Tambah Bayaran</h3>
      <div class="grid4">${field('Tarikh', `<input type="date" id="pDate" value="${todayStr()}">`)}
        ${field('Jumlah (RM)', `<input type="number" step="0.01" min="0.01" id="pAmt" value="${bal > 0 ? bal : ''}">`)}
        ${field('Kaedah', `<select id="pMethod">${Object.entries(PAY_METHODS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`)}
        ${field('Rujukan', `<input type="text" id="pRef">`)}</div>
      <div><button class="btn primary" id="pAdd">Rekod Bayaran</button></div>`}`;
    $$('[data-delpay]', ov).forEach((b) => b.onclick = async () => {
      if (!confirm('Padam bayaran ini?')) return;
      try { inv = await api('DELETE', `/api/payments/${b.dataset.delpay}`); draw(); toast('Bayaran dipadam'); } catch (e) { toast(e.message, true); }
    });
    const add = $('#pAdd', ov);
    if (add) add.onclick = async () => {
      add.disabled = true;
      try {
        inv = await api('POST', `/api/invoices/${id}/payments`, { pay_date: $('#pDate', ov).value, amount: $('#pAmt', ov).value, method: $('#pMethod', ov).value, reference: $('#pRef', ov).value });
        draw(); toast('Bayaran direkodkan');
      } catch (e) { toast(e.message, true); add.disabled = false; }
    };
  };
  draw();
  ov.querySelector('[data-b="0"]').onclick = () => { closeModal(ov); if (location.hash.startsWith('#invoices') || location.hash.startsWith('#dashboard') || !location.hash) reload(); };
  ov.querySelector('[data-x]').onclick = ov.querySelector('[data-b="0"]').onclick;
}

/* ===================== CETAKAN A5 / PDF ===================== */
function terbilang(n) {
  const s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'lapan', 'sembilan', 'sepuluh', 'sebelas'];
  n = Math.floor(n);
  if (n < 12) return s[n];
  if (n < 20) return s[n - 10] + ' belas';
  if (n < 100) return s[Math.floor(n / 10)] + ' puluh' + (n % 10 ? ' ' + s[n % 10] : '');
  if (n < 200) return 'seratus' + (n % 100 ? ' ' + terbilang(n % 100) : '');
  if (n < 1000) return s[Math.floor(n / 100)] + ' ratus' + (n % 100 ? ' ' + terbilang(n % 100) : '');
  if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '');
  if (n < 1e6) return terbilang(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '');
  if (n < 1e9) return terbilang(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + terbilang(n % 1e6) : '');
  return String(n);
}
function amountWords(n) {
  const r = Math.floor(n + 1e-9); const c = Math.round((n - r) * 100);
  let t = 'Ringgit Malaysia ' + (r === 0 ? 'sifar' : terbilang(r));
  if (c) t += ' dan ' + terbilang(c) + ' sen';
  return t.charAt(0).toUpperCase() + t.slice(1) + ' sahaja';
}

function docHtml(kind, d, s) {
  const isInv = kind === 'invoice';
  const c = d.customer || {};
  const showDisc = d.items.some((i) => Number(i.discount) > 0);
  const dense = d.items.length > 12;
  const no = isInv ? d.invoice_no : d.quotation_no;
  const stamp = isInv && ['paid', 'void', 'draft'].includes(d.status) ? `<div class="stamp">${{ paid: 'DIBAYAR', void: 'BATAL', draft: 'DRAF' }[d.status]}</div>` : '';
  const meta = [
    [isInv ? 'No. Invois' : 'No. Sebut Harga', `<b>${esc(no)}</b>`], ['Tarikh', fdate(d.issue_date)],
    isInv ? ['Tarikh Akhir', fdate(d.due_date)] : ['Sah Sehingga', fdate(d.valid_until)],
    d.reference ? ['Rujukan', esc(d.reference)] : null,
  ].filter((x) => x && x[1]);
  const bal = round2(d.total - (d.paid_amount || 0));
  const bank = [s.bank_name, s.bank_account, s.bank_holder].filter(Boolean);
  const terms = d.terms || '';
  return `<div class="doc ${dense ? 'dense' : ''}">
    <div class="hd">
      <div class="co"><b>${esc(s.company_name)}</b>${s.reg_no ? `<div>${esc(s.reg_no)}</div>` : ''}
        <div>${esc(s.address)}</div><div>${[s.phone && 'Tel: ' + s.phone, s.email, s.website].filter(Boolean).map(esc).join(' | ')}${s.tax_no ? `<br>No. Cukai: ${esc(s.tax_no)}` : ''}</div></div>
      <div class="ttl"><h1>${isInv ? 'INVOIS' : 'SEBUT HARGA'}</h1>
        <table>${meta.map(([k, v]) => `<tr><td>${k}:</td><td>${v}</td></tr>`).join('')}</table>${stamp}</div>
    </div>
    <div class="parties">
      <div class="box"><small>${isInv ? 'Bil Kepada' : 'Kepada'}</small><b>${esc(c.name || '-')}</b>
        <div>${esc(c.contact_person ? 'U/P: ' + c.contact_person + '\n' : '')}${esc(c.address)}${c.phone ? `\nTel: ${esc(c.phone)}` : ''}</div></div>
      ${isInv && bank.length ? `<div class="box"><small>Maklumat Pembayaran</small><b>${esc(s.bank_name || '')}</b><div>No. Akaun: ${esc(s.bank_account || '-')}\n${esc(s.bank_holder || s.company_name)}</div></div>` : ''}
    </div>
    <table class="it"><thead><tr><th class="c" style="width:6mm">No</th><th>Perihal</th><th class="r" style="width:13mm">Kuantiti</th><th class="r" style="width:17mm">Harga (RM)</th>${showDisc ? '<th class="r" style="width:14mm">Diskaun</th>' : ''}<th class="r" style="width:19mm">Jumlah (RM)</th></tr></thead>
      <tbody>${d.items.map((i, n) => `<tr><td class="c">${n + 1}</td><td>${esc(i.description)}</td><td class="r">${Number(i.qty)}</td><td class="r">${num(i.unit_price)}</td>${showDisc ? `<td class="r">${num(i.discount)}</td>` : ''}<td class="r">${num(i.line_total)}</td></tr>`).join('')}</tbody></table>
    <div class="sum">
      <div class="left"><div class="words">${esc(amountWords(Number(d.total)))}</div>
        ${d.notes ? `<div class="pre"><b>Nota:</b> ${esc(d.notes)}</div>` : ''}
        ${terms ? `<div class="pre" style="margin-top:1mm"><b>Terma &amp; Syarat:</b>\n${esc(terms)}</div>` : ''}</div>
      <table class="tot">
        <tr><td>Jumlah Kecil</td><td class="r">${num(d.subtotal)}</td></tr>
        ${Number(d.discount) > 0 ? `<tr><td>Diskaun</td><td class="r">- ${num(d.discount)}</td></tr>` : ''}
        ${Number(d.tax_rate) > 0 ? `<tr><td>${esc(s.tax_label || 'Cukai')} (${Number(d.tax_rate)}%)</td><td class="r">${num(d.tax_amount)}</td></tr>` : ''}
        <tr class="g"><td>JUMLAH (RM)</td><td class="r">${num(d.total)}</td></tr>
        ${isInv && Number(d.paid_amount) > 0 ? `<tr><td>Telah Dibayar</td><td class="r">${num(d.paid_amount)}</td></tr><tr><td><b>Baki Perlu Dibayar</b></td><td class="r"><b>${num(bal)}</b></td></tr>` : ''}
      </table>
    </div>
    <div class="sig"><div>Disediakan oleh</div><div>${isInv ? 'Diterima oleh' : 'Tandatangan Pelanggan'}</div></div>
    ${s.invoice_footer ? `<div class="ft">${esc(s.invoice_footer)}</div>` : ''}
  </div>`;
}

async function loadDoc(kind, id) {
  const [d, s] = await Promise.all([api('GET', `/api/${kind === 'invoice' ? 'invoices' : 'quotations'}/${id}`), api('GET', '/api/settings')]);
  state.settings = s;
  return { d, s };
}

async function printDoc(kind, id, mode) {
  if (mode === 'pdf') {
    // PDF vektor A5 dijana oleh server (tiada pustaka luar / internet diperlukan)
    const a = document.createElement('a');
    a.href = `/api/${kind === 'invoice' ? 'invoices' : 'quotations'}/${id}/pdf?download=1`;
    a.download = '';
    document.body.appendChild(a); a.click(); a.remove();
    return toast('PDF A5 dimuat turun');
  }
  const { d, s } = await loadDoc(kind, id);
  const pa = $('#printArea');
  pa.className = 'a5';
  pa.innerHTML = docHtml(kind, d, s);
  setPageSize('A5 portrait', '6mm');
  await new Promise((r) => setTimeout(r, 80));
  window.print();
}

async function openPreview(kind, id) {
  const { d, s } = await loadDoc(kind, id);
  openModal({
    title: `${kind === 'invoice' ? 'Invois' : 'Sebut Harga'} ${kind === 'invoice' ? d.invoice_no : d.quotation_no} (A5)`,
    wide: true,
    body: `<div style="overflow:auto;background:#dfe5ea;padding:14px;display:flex;justify-content:center;border-radius:8px"><div style="box-shadow:0 2px 12px rgba(0,0,0,.25);padding:6mm;background:#fff">${docHtml(kind, d, s)}</div></div>`,
    buttons: [
      { label: 'Tutup' },
      { label: '⬇ Muat Turun PDF', onClick: () => printDoc(kind, id, 'pdf') },
      { label: '📄 Buka PDF', onClick: () => window.open(`/api/${kind === 'invoice' ? 'invoices' : 'quotations'}/${id}/pdf`, '_blank') },
      { label: '🖨 Cetak Terus (A5)', primary: true, onClick: () => printDoc(kind, id, 'print') },
    ],
  });
}
