'use strict';
/* =====================================================================
   Penjana PDF kertas A5 (vektor, teks boleh dipilih) - TANPA pakej luar.
   Menggunakan fon Helvetica terbina PDF, jadi fail kecil dan berfungsi
   tanpa internet. Susun atur sepadan dengan cetakan terus (public/js/docs.js).
   ===================================================================== */
const zlib = require('zlib');

const W = 419.53, H = 595.28;      // A5 dalam titik (pt)
const M = 17;                      // margin ~6mm
const CW = W - M * 2;              // lebar kandungan
const FOOT = 14;                   // ruang kaki halaman

// Lebar glif Helvetica / Helvetica-Bold (AFM) untuk aksara ASCII 32..126
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,
  667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
  278,278,278,469,556,333,
  556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,
  334,260,334,584];
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,
  722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
  333,278,333,584,556,333,
  556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,
  389,280,389,584];

const FONT = { regular: 0, bold: 1, italic: 2 };

const normalize = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/ /g, ' ');

function tw(str, size, font) {
  const t = font === FONT.bold ? BOLD : HELV;
  let w = 0;
  for (const ch of normalize(str)) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? t[c - 32] : 556;
  }
  return (w * size) / 1000;
}

function wrap(str, width, size, font) {
  const out = [];
  for (const para of normalize(str).split(/\r?\n/)) {
    if (para.trim() === '') { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      let w = word;
      while (tw(w, size, font) > width && w.length > 1) {          // pecah perkataan yang terlalu panjang
        let i = w.length;
        while (i > 1 && tw(w.slice(0, i), size, font) > width) i--;
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, i)); w = w.slice(i);
      }
      const t = line ? `${line} ${w}` : w;
      if (tw(t, size, font) <= width) line = t; else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

const hex = (str) => {
  const b = Buffer.alloc(0);
  const bytes = [];
  for (const ch of normalize(str)) { const c = ch.charCodeAt(0); bytes.push(c <= 255 ? c : 63); }
  return '<' + Buffer.from(bytes).toString('hex') + '>';
};
const n2 = (v) => (Math.round(v * 100) / 100).toString();
const rgb = (c) => c.map((v) => n2(v / 255)).join(' ');

/* ---------- Penulis PDF ringkas ---------- */
class Pdf {
  constructor() { this.pages = []; this.ops = null; }
  addPage() { this.ops = []; this.pages.push(this.ops); }
  use(i) { this.ops = this.pages[i]; }

  text(x, y, str, o = {}) {
    const size = o.size || 8, font = o.font || 0, color = o.color || [17, 17, 17];
    let px = x;
    if (o.align === 'right') px = x - tw(str, size, font);
    else if (o.align === 'center') px = x - tw(str, size, font) / 2;
    const base = H - y - size * 0.82;
    this.ops.push(`BT ${rgb(color)} rg /F${font + 1} ${n2(size)} Tf ${n2(px)} ${n2(base)} Td ${hex(str)} Tj ET`);
  }
  line(x1, y1, x2, y2, w = 0.5, color = [17, 17, 17]) {
    this.ops.push(`${rgb(color)} RG ${n2(w)} w ${n2(x1)} ${n2(H - y1)} m ${n2(x2)} ${n2(H - y2)} l S`);
  }
  rect(x, y, w, h, o = {}) {
    const parts = [];
    if (o.fill) parts.push(`${rgb(o.fill)} rg`);
    if (o.stroke) parts.push(`${rgb(o.stroke)} RG ${n2(o.lw || 0.5)} w`);
    parts.push(`${n2(x)} ${n2(H - y - h)} ${n2(w)} ${n2(h)} re ${o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'}`);
    this.ops.push(parts.join(' '));
  }
  // Teks condong (cap air) dengan ketelusan
  watermark(str, color) {
    const a = (-28 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), size = 64, font = FONT.bold;
    const x = W / 2 - (tw(str, size, font) / 2) * c, y = H / 2 - (tw(str, size, font) / 2) * s;
    this.ops.push(`q /GS1 gs BT ${rgb(color)} rg /F2 ${size} Tf ${n2(c)} ${n2(s)} ${n2(-s)} ${n2(c)} ${n2(x)} ${n2(y)} Tm ${hex(str)} Tj ET Q`);
  }

  build(info) {
    const objs = [];                                  // indeks objek bermula 1
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null), pagesObj = add(null);
    const fonts = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'].map((f) =>
      add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
    const gs = add('<< /Type /ExtGState /ca 0.1 /CA 0.1 >>');
    const kids = [];
    for (const ops of this.pages) {
      const z = zlib.deflateSync(Buffer.from(ops.join('\n'), 'latin1'));
      const content = add({ stream: z, dict: '/Filter /FlateDecode' });
      const page = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${content} 0 R ` +
        `/Resources << /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> /ExtGState << /GS1 ${gs} 0 R >> >> >>`);
      kids.push(page);
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const infoId = add(`<< /Title ${hex(info.title)} /Author ${hex(info.author)} /Creator (MFZ Invoice System) >>`);

    const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    const offsets = [];
    let pos = chunks[0].length;
    objs.forEach((o, i) => {
      offsets.push(pos);
      const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
      let body;
      if (typeof o === 'string') body = Buffer.from(o + '\nendobj\n', 'latin1');
      else body = Buffer.concat([Buffer.from(`<< ${o.dict} /Length ${o.stream.length} >>\nstream\n`, 'latin1'), o.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
      const buf = Buffer.concat([head, body]);
      chunks.push(buf); pos += buf.length;
    });
    let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((off) => { xref += String(off).padStart(10, '0') + ' 00000 n \n'; });
    xref += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${infoId} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
    chunks.push(Buffer.from(xref, 'latin1'));
    return Buffer.concat(chunks);
  }
}

/* ---------- Bantuan paparan ---------- */
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = (n) => { const v = Number(n || 0); return Number.isInteger(v) ? String(v) : String(+v.toFixed(3)); };
const fdate = (d) => { if (!d) return ''; const p = String(d).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d); };

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
  const r = Math.floor(n + 1e-9), c = Math.round((n - r) * 100);
  let t = 'Ringgit Malaysia ' + (r === 0 ? 'sifar' : terbilang(r));
  if (c) t += ' dan ' + terbilang(c) + ' sen';
  return t.charAt(0).toUpperCase() + t.slice(1) + ' sahaja';
}

const GREY = [85, 85, 85], DARK = [17, 17, 17], LIGHT = [187, 187, 187], MID = [136, 136, 136], HEAD = [233, 233, 233];

/**
 * kind: 'invoice' | 'quotation'
 * d: dokumen dari API (dengan items, customer, payments); s: tetapan syarikat
 */
function buildDocPdf(kind, d, s) {
  const isInv = kind === 'invoice';
  const c = d.customer || {};
  const no = isInv ? d.invoice_no : d.quotation_no;
  const title = isInv ? 'INVOIS' : 'SEBUT HARGA';
  const dense = d.items.length > 12;
  const fs = dense ? 6.6 : 7.4, lead = fs * 1.3;
  const showDisc = d.items.some((i) => Number(i.discount) > 0);
  const LIMIT = H - M - FOOT;
  const pdf = new Pdf();

  const wmText = { void: 'BATAL', draft: 'DRAF' }[d.status];
  const newPage = () => { pdf.addPage(); if (wmText) pdf.watermark(wmText, [200, 0, 0]); };

  newPage();
  let y = M;

  /* --- Kepala: syarikat (kiri) + tajuk/meta (kanan) --- */
  const leftW = 215;
  pdf.text(M, y, s.company_name || '', { size: 11, font: FONT.bold }); y += 13;
  const coLines = [];
  if (s.reg_no) coLines.push(...wrap(s.reg_no, leftW, 6.8, 0));
  coLines.push(...wrap(s.address || '', leftW, 6.8, 0));
  const contact = [s.phone && `Tel: ${s.phone}`, s.email, s.website].filter(Boolean).join(' | ');
  if (contact) coLines.push(...wrap(contact, leftW, 6.8, 0));
  if (s.tax_no) coLines.push(`No. Cukai: ${s.tax_no}`);
  coLines.forEach((l) => { pdf.text(M, y, l, { size: 6.8, color: [51, 51, 51] }); y += 8.2; });

  let ry = M;
  pdf.text(W - M, ry, title, { size: 14, font: FONT.bold, align: 'right' }); ry += 17;
  const meta = [
    [isInv ? 'No. Invois' : 'No. Sebut Harga', no, true],
    ['Tarikh', fdate(d.issue_date)],
    isInv ? ['Tarikh Akhir', fdate(d.due_date)] : ['Sah Sehingga', fdate(d.valid_until)],
    d.reference ? ['Rujukan', d.reference] : null,
  ].filter((m) => m && m[1]);
  meta.forEach(([k, v, b]) => {
    pdf.text(W - M - 78, ry, `${k}:`, { size: 7.2, color: [68, 68, 68], align: 'right' });
    pdf.text(W - M, ry, String(v), { size: 7.2, font: b ? FONT.bold : 0, align: 'right' });
    ry += 9.2;
  });
  const stamp = isInv ? { paid: ['DIBAYAR', [21, 128, 61]], void: ['BATAL', [190, 18, 18]], draft: ['DRAF', [100, 100, 100]] }[d.status] : null;
  if (stamp) {
    const sw = tw(stamp[0], 7.5, FONT.bold) + 10;
    pdf.rect(W - M - sw, ry + 1, sw, 11, { stroke: stamp[1], lw: 0.8 });
    pdf.text(W - M - sw / 2, ry + 3, stamp[0], { size: 7.5, font: FONT.bold, color: stamp[1], align: 'center' });
    ry += 14;
  }
  y = Math.max(y, ry) + 3;
  pdf.line(M, y, W - M, y, 1.4); y += 6;

  /* --- Pihak: Bil Kepada + Maklumat Pembayaran --- */
  const bank = [s.bank_name, s.bank_account, s.bank_holder].filter(Boolean);
  const boxes = [{
    label: isInv ? 'Bil Kepada' : 'Kepada', head: c.name || '-',
    lines: [c.contact_person && `U/P: ${c.contact_person}`, ...(c.address ? c.address.split(/\r?\n/) : []), c.phone && `Tel: ${c.phone}`].filter(Boolean),
  }];
  if (isInv && bank.length) boxes.push({ label: 'Maklumat Pembayaran', head: s.bank_name || '', lines: [`No. Akaun: ${s.bank_account || '-'}`, s.bank_holder || s.company_name] });
  const gap = 11, bw = (CW - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach((b) => { b.wrapped = b.lines.flatMap((l) => wrap(l, bw - 10, 7, 0)); });
  const bh = Math.max(31, ...boxes.map((b) => 6 + 7 + 10 + b.wrapped.length * 8.4 + 3));
  boxes.forEach((b, i) => {
    const bx = M + i * (bw + gap);
    pdf.rect(bx, y, bw, bh, { stroke: MID, lw: 0.4 });
    pdf.text(bx + 5.5, y + 4, b.label.toUpperCase(), { size: 6.2, color: GREY });
    pdf.text(bx + 5.5, y + 12.5, b.head, { size: 8.2, font: FONT.bold });
    b.wrapped.forEach((l, k) => pdf.text(bx + 5.5, y + 22.5 + k * 8.4, l, { size: 7 }));
  });
  y += bh + 6;

  /* --- Jadual item --- */
  const cols = [{ k: 'no', w: 17, a: 'center', l: 'No' }, { k: 'desc', w: 0, a: 'left', l: 'Perihal' },
    { k: 'qty', w: 38, a: 'right', l: 'Kuantiti' }, { k: 'price', w: 50, a: 'right', l: 'Harga (RM)' }];
  if (showDisc) cols.push({ k: 'disc', w: 40, a: 'right', l: 'Diskaun' });
  cols.push({ k: 'amt', w: 56, a: 'right', l: 'Jumlah (RM)' });
  cols[1].w = CW - cols.reduce((a, x) => a + x.w, 0);
  let cx = M; cols.forEach((col) => { col.x = cx; cx += col.w; });
  const cell = (col, str, ty, o = {}) => {
    const px = col.a === 'right' ? col.x + col.w - 3.5 : col.a === 'center' ? col.x + col.w / 2 : col.x + 3.5;
    pdf.text(px, ty, str, { align: col.a, ...o });
  };
  const tableHead = () => {
    pdf.rect(M, y, CW, 13, { fill: HEAD });
    pdf.line(M, y, W - M, y, 0.5, MID); pdf.line(M, y + 13, W - M, y + 13, 0.5, MID);
    cols.forEach((col) => cell(col, col.l, y + 3.6, { size: 6.8, font: FONT.bold }));
    y += 13;
  };
  const contHeader = () => {
    pdf.text(M, M, s.company_name || '', { size: 8.5, font: FONT.bold });
    pdf.text(W - M, M, `${title} ${no} (sambungan)`, { size: 8.5, font: FONT.bold, align: 'right' });
    pdf.line(M, M + 13, W - M, M + 13, 0.8);
    y = M + 19;
  };
  tableHead();
  d.items.forEach((it, n) => {
    const lines = wrap(it.description, cols[1].w - 7, fs, 0);
    const rh = lines.length * lead + 3.2;
    if (y + rh > LIMIT) { newPage(); contHeader(); tableHead(); }
    const ty = y + 1.8;
    cell(cols[0], String(n + 1), ty, { size: fs });
    lines.forEach((l, k) => pdf.text(cols[1].x + 3.5, ty + k * lead, l, { size: fs }));
    cell(cols.find((x) => x.k === 'qty'), qtyFmt(it.qty), ty, { size: fs });
    cell(cols.find((x) => x.k === 'price'), money(it.unit_price), ty, { size: fs });
    if (showDisc) cell(cols.find((x) => x.k === 'disc'), money(it.discount), ty, { size: fs });
    cell(cols.find((x) => x.k === 'amt'), money(it.line_total), ty, { size: fs });
    y += rh;
    pdf.line(M, y, W - M, y, 0.3, LIGHT);
  });

  /* --- Ringkasan: kiri (perkataan/nota/terma), kanan (jumlah) --- */
  const bal = Math.round((Number(d.total) - Number(d.paid_amount || 0)) * 100) / 100;
  const tot = [['Jumlah Kecil', money(d.subtotal)]];
  if (Number(d.discount) > 0) tot.push(['Diskaun', `- ${money(d.discount)}`]);
  if (Number(d.tax_rate) > 0) tot.push([`${s.tax_label || 'Cukai'} (${qtyFmt(d.tax_rate)}%)`, money(d.tax_amount)]);
  const after = isInv && Number(d.paid_amount) > 0 ? [['Telah Dibayar', money(d.paid_amount)], ['Baki Perlu Dibayar', money(bal), true]] : [];
  const totH = tot.length * 10.5 + 15 + after.length * 10.5 + 4;
  const totW = 159, lw = CW - totW - 11;
  const left = [];
  wrap(amountWords(Number(d.total)), lw, 6.9, FONT.italic).forEach((l) => left.push({ t: l, f: FONT.italic }));
  if (d.notes) { left.push({ gap: 3 }); wrap(`Nota: ${d.notes}`, lw, 6.9, 0).forEach((l) => left.push({ t: l, f: 0 })); }
  if (d.terms) {
    left.push({ gap: 3 }); left.push({ t: 'Terma & Syarat:', f: FONT.bold });
    wrap(d.terms, lw, 6.9, 0).forEach((l) => left.push({ t: l, f: 0 }));
  }
  const leftH = left.reduce((a, r) => a + (r.gap || 8.6), 0);
  if (y + 6 + Math.max(totH, leftH) > LIMIT) { newPage(); contHeader(); }
  y += 6;
  let ly = y;
  left.forEach((r) => { if (r.gap) { ly += r.gap; return; } pdf.text(M, ly, r.t, { size: 6.9, font: r.f, color: [51, 51, 51] }); ly += 8.6; });
  const tx = W - M - totW;
  let ty = y;
  const row = (l, v, o = {}) => {
    pdf.text(tx + 3.5, ty, l, { size: 7.6, font: o.bold ? FONT.bold : 0 });
    pdf.text(tx + totW - 3.5, ty, v, { size: 7.6, font: o.bold ? FONT.bold : 0, align: 'right' });
    ty += 10.5;
  };
  tot.forEach(([l, v]) => row(l, v));
  pdf.line(tx, ty - 1.5, tx + totW, ty - 1.5, 0.9);
  ty += 1;
  pdf.text(tx + 3.5, ty, 'JUMLAH (RM)', { size: 9, font: FONT.bold });
  pdf.text(tx + totW - 3.5, ty, money(d.total), { size: 9, font: FONT.bold, align: 'right' });
  ty += 12.5;
  pdf.line(tx, ty - 1.5, tx + totW, ty - 1.5, 0.9);
  ty += 2;
  after.forEach(([l, v, b]) => row(l, v, { bold: b }));
  y = Math.max(ly, ty);

  /* --- Tandatangan & nota kaki --- */
  const footer = s.invoice_footer ? wrap(s.invoice_footer, CW, 6.3, 0) : [];
  if (y + 30 + footer.length * 7.6 > LIMIT) { newPage(); contHeader(); }
  y += 26;
  const sw = 119;
  pdf.line(M, y, M + sw, y, 0.4, [51, 51, 51]); pdf.line(W - M - sw, y, W - M, y, 0.4, [51, 51, 51]);
  pdf.text(M + sw / 2, y + 2, 'Disediakan oleh', { size: 6.6, align: 'center' });
  pdf.text(W - M - sw / 2, y + 2, isInv ? 'Diterima oleh' : 'Tandatangan Pelanggan', { size: 6.6, align: 'center' });
  y += 14;
  footer.forEach((l) => { pdf.text(W / 2, y, l, { size: 6.3, color: GREY, align: 'center' }); y += 7.6; });

  /* --- Nombor muka surat --- */
  const n = pdf.pages.length;
  if (n > 1) for (let i = 0; i < n; i++) { pdf.use(i); pdf.text(W - M, H - M - 8, `Muka ${i + 1}/${n}`, { size: 6.3, color: GREY, align: 'right' }); }

  return pdf.build({ title: `${title} ${no}`, author: s.company_name || 'MFZ' });
}

module.exports = { buildDocPdf, amountWords, tw, wrap };
