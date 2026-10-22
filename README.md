# MFZ Invoice System

Sistem invois lengkap (rujukan Bukku.my): invois, sebut harga, inventori, pelanggan, bayaran, laporan, cetakan A5 / PDF, dan tetapan alamat syarikat. Data disimpan dalam **Supabase (PostgreSQL)**.

```
mfz-invoice/
├─ database/schema.sql   ← jalankan di Supabase SQL Editor (jadual + fungsi + data default)
├─ server.js             ← backend Node.js (tiada pakej luar), sambung terus ke Supabase
├─ lib/pdf.js            ← penjana PDF A5 (vektor) di server, tanpa pakej luar
├─ public/               ← frontend (HTML/CSS/JS)
├─ .env.example          ← salin kepada .env
└─ package.json
```

## Pemasangan (5 langkah)

1. **Cipta projek** di https://supabase.com (percuma).
2. **Cipta database:** Supabase Dashboard → *SQL Editor* → *New query* → tampal seluruh `database/schema.sql` → **Run**.
   Ia mencipta semua jadual, fungsi laporan, dan memasukkan data default (tetapan syarikat, 6 pelanggan, 10 produk, 30 invois + bayaran sepanjang ~12 bulan, 4 sebut harga). Selamat dijalankan berulang kali — data contoh hanya dimasukkan jika jadual kosong.
3. **Ambil kunci:** *Project Settings → API* → salin **Project URL** dan **service_role key**.
4. **Konfigurasi:** `cp .env.example .env` kemudian isi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`.
5. **Jalankan** (perlu Node.js 18+): `node server.js` → buka http://localhost:3000

> `service_role` key hanya berada di server (`.env`) dan tidak pernah dihantar ke pelayar. Semua jadual dikunci dengan RLS, jadi anon key tidak boleh membaca data. **Jangan commit `.env` ke Git.**
> Jika sistem dihoskan di internet, tetapkan `APP_USER` dan `APP_PASSWORD` dalam `.env` untuk log masuk asas.

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
