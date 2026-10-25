'use strict';
/* Halaman setup kali pertama: (1) sambungan Supabase + semakan skema, (2) akaun admin, (3) siap */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const panel = $('#panel');
let memKey = '';            // kunci yang ditaip dalam sesi ini (hanya dalam memori pelayar)

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ralat pelayan (${res.status})`);
  return data;
}
function setStep(n) {
  document.querySelectorAll('#steps li').forEach((li) => {
    const s = Number(li.dataset.s);
    li.className = s < n ? 'done' : s === n ? 'on' : '';
  });
}
const msg = (el, text, kind = 'err') => { el.textContent = text || ''; el.className = 'auth-' + kind; el.hidden = !text; };
function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = on ? label.busy : label.idle; }

/* ---------- Langkah 1: sambungan + skema ---------- */
function viewConnect(st, note) {
  setStep(1);
  const connected = st.configured;
  const fromEnv = st.source === 'env';
  const schemaOk = st.schema && st.schema.status === 'ok';
  panel.innerHTML = `
    <h2>1. Sambungan Supabase</h2>
    ${fromEnv ? `<div class="auth-ok">Sambungan dikesan daripada environment variable pelayan.</div>` : ''}
    ${connected && !fromEnv ? `<div class="auth-ok">Sambungan disimpan.</div>` : ''}
    ${!connected || (connected && !fromEnv && memKey && st._edit) ? `
    <form id="cf" autocomplete="off">
      <p class="muted sm">Di Supabase: <b>Project Settings → API</b>. Salin <b>Project URL</b> dan kunci <b>service_role</b> (secret). Jangan guna kunci <i>anon</i> atau <i>publishable</i>.</p>
      <label class="fld">Project URL
        <input type="text" id="url" placeholder="https://abcdefgh.supabase.co" autocapitalize="none" spellcheck="false" required value="${esc(st.url || '')}"></label>
      <label class="fld">Kunci service_role
        <input type="password" id="key" placeholder="eyJ… atau sb_secret_…" autocomplete="off" spellcheck="false" required></label>
      <div id="cmsg" hidden></div>
      <button class="btn primary wide" id="cbtn" type="submit">Uji &amp; Simpan Sambungan</button>
    </form>` : `
    <dl class="kv-list"><dt>Project URL</dt><dd>${esc(st.url)}</dd><dt>Kunci</dt><dd>••••••••${fromEnv ? ' (environment)' : ' (disimpan di pelayan)'}</dd></dl>
    ${!fromEnv && memKey ? `<button class="btn sm" id="chg">Tukar sambungan</button>` : ''}`}
    ${connected ? schemaBlock(st) : ''}
    ${note ? `<div class="auth-ok">${esc(note)}</div>` : ''}
    ${connected ? `<div class="row-end"><button class="btn primary" id="next" ${schemaOk ? '' : 'disabled'}>Seterusnya: Akaun Admin →</button></div>` : ''}`;

  const cf = $('#cf');
  if (cf) cf.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#cbtn'), m = $('#cmsg');
    msg(m, ''); busy(btn, true, { busy: 'Menguji sambungan…', idle: 'Uji & Simpan Sambungan' });
    const key = $('#key').value.trim();
    try {
      const out = await api('POST', '/api/setup/connect', { url: $('#url').value, key, currentKey: memKey || undefined });
      memKey = key;
      if (out.complete) return location.replace('/login.html');
      viewConnect(out, out.schema && out.schema.status === 'ok' ? 'Sambungan berjaya diuji.' : '');
    } catch (ex) { msg(m, ex.message); busy(btn, false, { busy: '', idle: 'Uji & Simpan Sambungan' }); }
  };
  const chg = $('#chg'); if (chg) chg.onclick = () => viewConnect({ ...st, _edit: true });
  const next = $('#next'); if (next) next.onclick = () => viewAdmin(st);
  const re = $('#recheck');
  if (re) re.onclick = async () => { re.disabled = true; re.textContent = 'Menyemak…'; try { const out = await api('GET', '/api/setup/status'); out.complete ? location.replace('/login.html') : viewConnect(out); } catch (ex) { re.disabled = false; re.textContent = 'Semak semula'; alert(ex.message); } };
  const cp = $('#copysql');
  if (cp) cp.onclick = async () => {
    try {
      const sql = await (await fetch('/api/setup/schema')).text();
      try { await navigator.clipboard.writeText(sql); } catch (_) {
        const ta = document.createElement('textarea'); ta.value = sql; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      cp.textContent = '✓ SQL disalin (' + sql.split('\n').length + ' baris)';
    } catch (ex) { alert(ex.message); }
  };
}
function schemaBlock(st) {
  const s = st.schema || { status: 'error', message: 'Tidak diketahui' };
  if (s.status === 'ok') return `<div class="auth-ok">✓ Pangkalan data lengkap (jadual, fungsi laporan dan data default sedia ada).</div>`;
  const hint = s.status === 'missing'
    ? `<ol class="sm-steps"><li>Klik <b>Salin SQL</b>.</li><li>${st.sqlEditor ? `Buka <a href="${esc(st.sqlEditor)}" target="_blank" rel="noopener">SQL Editor Supabase</a>` : 'Buka SQL Editor di Supabase'}, tampal, kemudian tekan <b>Run</b>.</li><li>Kembali ke sini dan klik <b>Semak semula</b>.</li></ol>`
    : '';
  return `<div class="auth-err">${esc(s.message)}</div>${hint}
    <div class="row-gap"><button class="btn" id="copysql">Salin SQL</button><button class="btn" id="recheck">Semak semula</button></div>`;
}

/* ---------- Langkah 2: akaun admin ---------- */
function viewAdmin(st) {
  setStep(2);
  panel.innerHTML = `
    <h2>2. Akaun Admin</h2>
    <p class="muted sm">Akaun ini digunakan untuk log masuk ke sistem. Kata laluan disimpan sebagai hash (scrypt), bukan teks biasa.</p>
    <form id="af" autocomplete="off">
      <label class="fld">Nama pengguna
        <input type="text" id="user" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="40" required placeholder="cth. admin"></label>
      <label class="fld">Kata laluan <small class="muted">(sekurang-kurangnya 8 aksara)</small>
        <span class="pw"><input type="password" id="pw" autocomplete="new-password" minlength="8" required><button type="button" class="btn sm" id="tog">Papar</button></span></label>
      <div class="meter" id="meter"><i></i></div>
      <label class="fld">Sahkan kata laluan
        <input type="password" id="pw2" autocomplete="new-password" required></label>
      ${memKey ? '' : `<label class="fld">Kunci service_role <small class="muted">(pengesahan pemilik)</small>
        <input type="password" id="ownkey" autocomplete="off" spellcheck="false" required></label>
        <p class="muted sm">Untuk keselamatan, hanya orang yang memiliki kunci service_role boleh mencipta akaun admin.</p>`}
      <div id="amsg" hidden></div>
      <div class="row-gap">
        <button class="btn" type="button" id="back">← Kembali</button>
        <button class="btn primary" id="abtn" type="submit">Cipta Akaun &amp; Siap</button>
      </div>
    </form>`;
  const pw = $('#pw');
  $('#tog').onclick = (e) => { const show = pw.type === 'password'; pw.type = $('#pw2').type = show ? 'text' : 'password'; e.target.textContent = show ? 'Sorok' : 'Papar'; };
  pw.oninput = () => {
    const v = pw.value; let sc = 0;
    if (v.length >= 8) sc++; if (v.length >= 12) sc++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) sc++; if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) sc++;
    const m = $('#meter'); m.dataset.l = v ? sc : 0; m.firstElementChild.style.width = (sc * 25) + '%';
  };
  $('#back').onclick = () => viewConnect(st);
  $('#af').onsubmit = async (e) => {
    e.preventDefault();
    const m = $('#amsg'), btn = $('#abtn');
    if (pw.value !== $('#pw2').value) return msg(m, 'Kata laluan tidak sepadan.');
    msg(m, ''); busy(btn, true, { busy: 'Mencipta…', idle: 'Cipta Akaun & Siap' });
    try {
      await api('POST', '/api/setup/admin', { username: $('#user').value, password: pw.value, key: memKey || $('#ownkey').value.trim() });
      memKey = '';
      viewDone($('#user').value.trim());
    } catch (ex) { msg(m, ex.message); busy(btn, false, { busy: '', idle: 'Cipta Akaun & Siap' }); }
  };
}

/* ---------- Langkah 3 ---------- */
function viewDone(user) {
  setStep(4);
  panel.innerHTML = `
    <h2>✓ Setup selesai</h2>
    <p>Akaun admin <b>${esc(user)}</b> telah dicipta dan anda telah log masuk.</p>
    <ul class="sm-steps plain"><li>Alamat syarikat boleh diubah di <b>Tetapan Syarikat</b>.</li><li>Data contoh sedia ada boleh diubah atau dipadam bila-bila masa.</li></ul>
    <div class="row-end"><button class="btn primary" id="go">Masuk ke Sistem →</button></div>`;
  $('#go').onclick = () => location.replace('/');
}

(async function init() {
  try {
    const st = await api('GET', '/api/setup/status');
    if (st.complete) return location.replace('/login.html');
    if (st.configured && st.schema && st.schema.status === 'ok') return viewAdmin(st);
    viewConnect(st);
  } catch (ex) { panel.innerHTML = `<div class="auth-err">${esc(ex.message)}</div>`; }
})();
