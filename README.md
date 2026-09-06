# Cendekia Hub

Boilerplate CMS modular menggunakan **Next.js 16 App Router, React 19, TypeScript, Mantine 8, dan SQLite**. Antarmuka berbahasa Indonesia dengan navigasi responsif.

## Menjalankan lokal

Gunakan Node.js **22.13+** dan npm.

```bash
npm install
cp .env.example .env
```

Isi `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` di `.env`. Password wajib minimal 12 karakter; tidak ada password admin bawaan.

```bash
npm run db:seed
npm run dev
```

Buka <http://localhost:3000>. Masuk dengan akun yang diisi pada `.env`. Seeding dapat diulang dan tidak mengganti password akun yang sudah ada. Database dibuat otomatis di `data/cms.sqlite`; data tetap tersimpan setelah server restart.

## Fitur

- **Autentikasi:** login, logout, ubah password, sesi server 8 jam, cookie HttpOnly/SameSite, password scrypt dengan salt acak, dan batas 5 percobaan login gagal per email selama 15 menit.
- **Pengguna:** tambah, edit, nonaktifkan, hapus, dan tentukan role. Perubahan pengguna mencabut sesi pengguna tersebut.
- **RBAC:** role Administrator, Editor, Viewer; custom role dengan permission baca/tulis per modul. Permission diperiksa ulang dari database pada setiap request. Navigasi juga mengikuti permission.
- **Audit trail:** login berhasil/gagal, logout, perubahan password, dan setiap mutasi modul. Mutasi data dan audit berada dalam satu transaksi SQLite. Password dan token tidak dicatat. Endpoint hanya baca; trigger database menolak UPDATE/DELETE audit.
- **Master data kategori:** CRUD, status aktif, pencarian, paginasi, validasi, dan konfirmasi penghapusan.
- **Pengaturan sekolah:** identitas sekolah, kode, NPSN, alamat, kontak, upload logo, zona waktu, status aktif, RBAC, dan audit perubahan.
- **Media upload:** komponen upload gambar reusable, scope berbasis permission, validasi isi PNG/JPEG/WebP, metadata, dan storage lokal persisten.
- **Dashboard:** statistik dan aktivitas aktual, sesuai akses pengguna.

Administrator sistem tidak dapat diedit/dihapus, pengguna tidak dapat mengubah akses akunnya sendiri, dan pengguna tidak dapat memberikan akses melebihi permission yang dimilikinya. Akun dibuat administrator; registrasi publik dan reset password melalui email belum disertakan.

## Struktur

```text
src/
  app/
    login/                    Halaman login
    (cms)/                    Layout terautentikasi
      page.tsx                Dashboard dan pengambilan datanya
      users/                  Halaman pengguna
      roles/                  Halaman role
      audit/                  Halaman audit trail
      settings/               Halaman pengaturan akun
        school/               Halaman pengaturan sekolah
      master-data/categories/ Halaman kategori
    api/auth/                 Login, logout, perubahan password
    api/modules/              Route, handler, validasi, dan aturan bisnis per modul
  components/
    cms/                      Komponen bersama halaman CMS
    <nama-modul>/             Komponen UI khusus setiap modul
  hooks/                      Hook yang dipakai lintas komponen
  lib/
    auth.ts                   Sesi, pemeriksaan izin dan origin
    db.ts                     Skema SQLite, koneksi dan audit writer
    password.ts               Hash/verifikasi password
    http.ts                   Pemetaan error API
    uploads.ts                Registry scope dan adapter storage upload
  config/modules.ts          Katalog modul, permission, dan navigasi
scripts/seed.ts                Role awal dan akun administrator
tests/                       Pengujian unit dan integrasi HTTP
```

## Menambahkan modul

Gunakan `categories` sebagai contoh implementasi modul sederhana:

1. Tambahkan permission `products.read` / `products.write`, `ModuleKey`, dan metadata modul pada `src/config/modules.ts`.
2. Tambahkan skema tabel melalui migrasi database. Skema awal ada di `src/lib/db.ts` (versi 1); saat proyek berkembang, gunakan migrasi berurutan untuk mengubah tabel yang sudah berisi data.
3. Buat folder API `src/app/api/modules/products/` berisi `route.ts` dan `handlers.ts`. Letakkan validasi Zod dan aturan bisnis produk di handler tersebut.
4. Wajib panggil `requireUser('products.read')` untuk membaca, serta `checkOrigin(request)` dan `requireUser('products.write')` sebelum mutasi. Gunakan transaksi database untuk menyimpan perubahan bersama `audit(...)`. Jangan hanya menyembunyikan tombol di frontend.
5. Buat route eksplisit di `src/app/(cms)/<nama-modul>/page.tsx` dan letakkan tabel, form, serta modalnya di `src/components/<nama-modul>/`. Jangan menambahkan percabangan modul ke komponen atau handler gabungan; pindahkan ke `src/components/cms` atau `src/hooks` hanya kode yang memang dipakai tanpa mengetahui jenis modul.
6. Berikan permission baru kepada role yang relevan melalui perubahan seed/migrasi terkontrol. Seed awal tidak menimpa role yang sudah ada.
7. Uji akses tanpa sesi, role tanpa izin, CRUD, dan audit trail.

Registry menghubungkan navigasi dan routing; modul baru tetap membutuhkan skema, handler, serta UI. Boilerplate ini bukan loader plugin dinamis.

## Validasi

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
```

Tes integrasi membutuhkan build terlebih dahulu. Tes menjalankan server produksi di port 3317, memakai database sementara, lalu membersihkannya. Cakupan: autentikasi, CRUD kategori, pembatasan role, penolakan origin asing, pencabutan sesi, perubahan password, pembatasan login, perubahan permission langsung, pencegahan eskalasi akses, dan proteksi audit pada database.

## Menjalankan produksi

```bash
npm run build
npm start
```

Gunakan HTTPS karena cookie sesi memakai `Secure` pada produksi. Jika menggunakan reverse proxy, pertahankan host/origin publik agar pemeriksaan origin cocok. Database SQLite dan direktori `UPLOAD_STORAGE_PATH` membutuhkan disk persisten dengan izin tulis; keduanya perlu dibackup bersama. Rancangan ini ditujukan untuk satu instance Node.js. Untuk deployment serverless atau beberapa instance, pindahkan database ke PostgreSQL dan implementasi fungsi storage di `src/lib/uploads.ts` ke object storage bersama (misalnya S3-compatible), lalu siapkan migrasi dan strategi backup.

Trigger audit mencegah perubahan melalui koneksi aplikasi biasa, tetapi bukan penyimpanan tahan manipulasi oleh pemilik file database. Gunakan layanan audit terpisah jika membutuhkan jaminan tersebut.

## Referensi

- [Integrasi Mantine dengan Next.js](https://mantine.dev/guides/next/)
- [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation)
