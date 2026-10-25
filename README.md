# MFZ Invoice System

Sistem invois lengkap (rujukan Bukku.my): invois, sebut harga, inventori, pelanggan, bayaran, laporan, cetakan A5 / PDF, dan tetapan alamat syarikat. Data disimpan dalam **Supabase (PostgreSQL)**.

```
mfz-invoice/
├─ database/schema.sql   ← jalankan di Supabase SQL Editor (jadual + fungsi + data default)
├─ server.js             ← backend Node.js (tiada pakej luar), sambung terus ke Supabase
├─ lib/config.js         ← konfigurasi sambungan Supabase (env / data/config.json)
├─ lib/auth.js           ← hash kata laluan, sesi, had cubaan
├─ lib/pdf.js            ← penjana PDF A5 (vektor) di server, tanpa pakej luar
├─ public/               ← frontend (index, setup.html, login.html, css, js)
├─ .env.example          ← salin kepada .env
└─ package.json
```

## Pemasangan

1. **Cipta projek** di https://supabase.com (percuma).
2. **Jalankan** (Node.js 18+, tiada `npm install`): `node server.js` → buka http://localhost:3000
3. **Ikut halaman setup kali pertama** yang terbuka sendiri:
   1. **Sambungan Supabase** — tampal *Project URL* dan kunci **service_role** (*Project Settings → API*). Sambungan diuji sebelum disimpan.
   2. **Cipta database** — jika jadual belum ada, halaman setup memaparkan butang **Salin SQL**. Tampal di *SQL Editor* Supabase, tekan **Run**, kemudian klik **Semak semula**. Ia mencipta jadual, fungsi laporan dan data default (tetapan syarikat, 6 pelanggan, 10 produk, 30 invois + bayaran, 4 sebut harga). Selamat dijalankan berulang kali.
   3. **Akaun admin** — tetapkan nama pengguna dan kata laluan (min. 8 aksara). Selepas itu anda log masuk automatik.

Seterusnya sistem menunjukkan halaman **Log Masuk**; sesi bertahan 7 hari. Butang **Log keluar** ada di bawah sidebar.

### Di mana tetapan disimpan?
| Item | Disimpan di | Nota |
|---|---|---|
| URL + kunci Supabase | `data/config.json` (kebenaran 600, tidak masuk Git) **atau** environment variable | Environment `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` diutamakan. |
| Akaun admin | Jadual `app_admin` dalam Supabase (kata laluan di-hash scrypt) | Kekal walaupun pelayan dideploy semula. |

> **Hosting seperti Render (pelan percuma):** sistem fail dikosongkan setiap deploy, jadi `data/config.json` hilang. Letakkan `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` dalam *Environment*. Halaman setup hanya akan meminta langkah 2 dan 3 (cipta admin), dan akaun admin kekal dalam Supabase.
> Alternatif lama `APP_USER` + `APP_PASSWORD` (environment) masih berfungsi: ia menjadi akaun admin dan langkah cipta admin dilangkau.

### Keselamatan setup
- Halaman setup hanya aktif **sebelum** setup selesai; selepas itu ia ditutup (403) dan `/setup.html` dialihkan.
- Mencipta admin memerlukan kunci **service_role** (bukti pemilik), jadi orang lain yang sempat membuka URL anda dahulu tidak boleh merampas akaun admin.
- URL Supabase dihadkan kepada `https://<projek>.supabase.co` (menghalang SSRF). Untuk Supabase self-hosted / ujian tempatan tetapkan `ALLOW_CUSTOM_SUPABASE_URL=1`.
- Kunci `anon` / `publishable` ditolak. Log masuk dihadkan 8 percubaan gagal / 15 minit setiap IP.
- Kunci `service_role` hanya berada di server dan tidak pernah dihantar ke pelayar. Semua jadual dikunci dengan RLS. **Jangan commit `.env` atau `data/` ke Git.**

### Terlupa kata laluan / tukar sambungan
- **Kata laluan:** di SQL Editor Supabase jalankan `delete from app_admin;` kemudian buka semula `/setup.html` dan cipta akaun baharu (perlu kunci service_role).
- **Tukar projek Supabase:** padam `data/config.json` (atau tukar environment variable) dan restart.

## Ciri

| # | Ciri | Di mana |
|---|------|---------|
| 1 | Tambah / edit / padam invois (barisan item, diskaun, SST, status, bayaran separa) | Invois |
| 2 | Tambah / edit / padam inventori (stok auto tolak/pulang mengikut invois, amaran stok rendah) | Inventori |
| 3 | Tambah / edit / padam pelanggan | Pelanggan |
| 4 | Laporan semua data (jualan, produk, pelanggan, belum bayar, inventori, sebut harga) + eksport CSV | Laporan |
| 5 | Semua data dalam pangkalan data Supabase | — |
| 6 | Tambah / edit / padam sebut harga, tukar kepada invois dengan satu klik | Sebut Harga |
| 7 | Muat turun **PDF** A5 (vektor, teks boleh dipilih, dijana di server) | butang *PDF* / *Papar* |
| 8 | **Cetak terus** ke printer, muat A5 dengan fon kecil (`@page A5`) | butang *Cetak* |
| 9 | Edit alamat & maklumat syarikat MFZ (nama, SSM, alamat, telefon, bank, awalan nombor, SST, terma) | Tetapan Syarikat |
| 10 | Sambungan terus ke Supabase + SQL cipta database | `schema.sql`, `server.js` |
| 11 | Data default dalam SQL | `schema.sql` bahagian 15 |
| 12 | Laporan penuh **Harian / Mingguan / Bulanan / Tahunan** (jadual, graf, jumlah, produk & pelanggan teratas) | Laporan → Jualan |

## Tip cetakan A5
- Dalam dialog cetak pilih **Paper size: A5**, **Margins: Default/None**, tiada *Headers and footers*. Saiz A5 ditetapkan automatik oleh `@page`; jika printer anda menyokong, ia dipilih sendiri.
- Untuk cetak senyap tanpa dialog: jalankan Chrome dengan `--kiosk-printing`.
- Butang **PDF** dijana oleh server (`lib/pdf.js`) — tidak memerlukan internet atau pustaka luar. Endpoint: `GET /api/invoices/:id/pdf` dan `/api/quotations/:id/pdf` (tambah `?download=1` untuk muat turun).
- Invois dengan lebih 12 baris item menggunakan fon lebih kecil secara automatik; jika lebih panjang lagi ia bersambung ke halaman A5 seterusnya (kepala jadual diulang, nombor muka surat ditambah pada PDF).

## Nota logik
- Jualan dalam laporan dikira daripada invois bukan `Draf` / `Batal`, mengikut tarikh invois. *Dikutip* = jumlah bayaran direkod pada invois tersebut.
- Memadam invois memulangkan stok; mengedit kuantiti menyesuaikan stok. Menukar status kepada *Batal* **tidak** memulangkan stok — padam invois jika stok perlu dipulangkan.
- Pelanggan yang sudah mempunyai invois / sebut harga tidak boleh dipadam (data kekal konsisten).
- Nombor dokumen: `INV-2026-0001`, `QT-2026-0001` (awalan boleh diubah di Tetapan; kiraan bermula semula setiap tahun).
