# Struktur kode

```text
src/
  app/                  # Entry point Next.js: routing, layout, dan halaman
    (public)/           # Login dan formulir pendaftaran publik
    (cms)/              # Halaman CMS dengan layout terautentikasi
      (attendance)/     # Halaman absensi dalam layout CMS
    (attendance)/       # Scanner dan cetak kartu dengan tampilan mandiri
    (display)/          # Layar live
    api/                # Route HTTP; route modul meneruskan ke handler fitur
  features/             # Kode khusus fitur/domain
    <feature>/
      components/       # UI fitur beserta CSS module
      server/           # Handler dan layanan backend fitur
      client/           # Helper browser khusus fitur, jika diperlukan
  components/           # Komponen yang dipakai lintas fitur
    cms/                # EntityManager, ModulePage, uploader, dialog, layout daftar
    identity-card/      # Kartu identitas murid dan guru
  hooks/                # Hook bersama
  lib/                  # Utilitas dan infrastruktur bersama
    server/             # Konteks sekolah/akademik dan parameter daftar
    uploads/            # Konfigurasi, validasi, storage, dan maintenance upload
  config/               # Permission, branding, dan tema
tests/                  # Tes unit dan integrasi
scripts/                # Seed, backup, restore, dan maintenance
```

## Aturan penempatan

- Letakkan UI dan logika yang khusus untuk satu fitur di `features/<feature>`.
- Komponen lintas fitur berada di `components`; CSS module mengikuti komponennya.
- `ModulePage` menyatukan pemeriksaan izin baca/tulis halaman CMS sederhana. Handler API tetap wajib memeriksa izin sendiri.
- `EntityManager` menangani editor entitas berbasis konfigurasi untuk beberapa fitur.
- `AttendanceManager` dipakai bersama oleh absensi pelajaran dan ekstrakurikuler di fitur attendance.
- Helper bersama tidak mengimpor dari folder routing `app`. Halaman dan route mengimpor fitur atau utilitas bersama.
- Kode browser tidak boleh mengimpor implementasi dalam folder `server` atau database/filesystem. Gunakan `import type` untuk tipe server bila diperlukan.
- Gunakan import `@/…` untuk dependensi lintas folder. Folder `(…)` adalah route group dan tidak menambahkan segmen URL.
- Tambahkan subfolder hanya jika ada tanggung jawab yang jelas; tidak semua fitur membutuhkan `client`, `server`, dan `components` sekaligus.

Pemindahan struktur ini mempertahankan URL dan kontrak endpoint. File yang terlihat dihapus dan ditambah pada Git dapat merupakan file yang dipindahkan.
