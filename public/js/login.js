'use strict';
const $ = (s) => document.querySelector(s);
$('#f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#go'), err = $('#err');
  err.hidden = true; btn.disabled = true; btn.textContent = 'Menyemak…';
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('#u').value, password: $('#p').value }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Ralat pelayan (${res.status})`);
    location.replace('/');
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
    btn.disabled = false; btn.textContent = 'Log Masuk'; $('#p').select();
  }
});
