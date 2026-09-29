# Integrasi native: Poin & Pembinaan Murid

Panduan ini merupakan kontrak implementasi REST API yang tersedia, bukan rencana endpoint.
Base URL: `/api/v1/points`. Swagger: `/docs` (tag **Points**).
OpenAPI untuk Postman/generator klien: `/api/v1/openapi.json`.
Autentikasi dan refresh token mengikuti [REST API aplikasi guru](mobile-api.md).
Tidak ada role atau alur BK, katalog hadiah, penukaran poin, maupun poin otomatis dari check-in.

## Persiapan admin

1. Pastikan tahun ajaran, semester, murid, keanggotaan kelas, dan penugasan wali kelas tersedia.
2. Buka **Poin & Pembinaan** (`/points`) pada web admin.
3. Buat aturan pada **Aturan Poin**: nama, kategori, jenis, bobot, dan status aktif.
4. Buat ambang pada **Ambang Pembinaan** sesuai kebijakan sekolah. Tidak ada angka bawaan yang otomatis diterapkan.
5. Administrator dan Guru bawaan mendapat permission baru melalui migrasi/seed. Untuk custom role, berikan permission secara eksplisit.

Permission:

| Permission      | Fungsi                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `points.read`   | Wajib untuk seluruh endpoint; akses baris tetap dibatasi.                                                               |
| `points.write`  | Mengajukan catatan, menambah bukti, dan melakukan mutasi sesuai cakupan.                                                |
| `points.manage` | Mengatur master dan mengakses/verifikasi/pembinaan seluruh murid dalam sekolah. Mutasi juga membutuhkan `points.write`. |

Guru biasa mendapat `points.read` dan `points.write`. Wali kelas ditentukan dari penugasan aktif, bukan nama role.
Native tetap mensyaratkan akun terhubung ke profil guru aktif, termasuk bila akun memiliki `points.manage`.
Admin tanpa profil guru menggunakan web admin. Semua endpoint web setara berada di
`/api/modules/points`, memakai sesi cookie dan pemeriksaan Origin untuk mutasi.

## Aturan produk dan akses

- `appreciation` dan `violation` adalah dua total terpisah, mulai dari nol setiap semester.
- Total hanya menghitung catatan `approved`. Apresiasi tidak mengurangi pelanggaran.
- Guru dapat mencari identitas dasar murid aktif satu sekolah untuk pelaporan lintas kelas.
- Guru membaca pengajuannya sendiri. Wali kelas juga membaca seluruh catatan murid yang sekarang menjadi anggota aktif kelas walinya. Pengelola mengakses seluruh sekolah.
- Ringkasan lengkap dan pembinaan hanya tersedia bagi wali kelas murid atau pengelola.
- Catatan guru biasa menjadi `pending`; catatan wali kelas bagi kelasnya sendiri atau pengelola langsung `approved`.
- `pending` dapat menjadi `approved` atau `rejected`. `approved` dapat menjadi `voided`. Tidak ada edit/hapus catatan. Untuk koreksi, batalkan dengan alasan lalu buat catatan baru.
- Bobot, jenis, nama aturan, dan kelas saat kejadian dicatat sebagai snapshot. Perubahan master tidak mengubah histori.
- Penugasan wali kelas diperiksa ulang setiap request. Wali baru mendapat akses; wali lama hanya mempertahankan akses sebagai pelapor pada pengajuannya sendiri.
- Jika murid belum memiliki wali kelas, pengajuan tetap `pending` dan dapat ditangani pengelola lewat web.
- Pencatatan memerlukan murid aktif, kelas aktif dalam tahun ajaran aktif, dan aturan aktif. Tanggal kejadian harus berada dalam semester yang dipilih, dalam tahun ajaran aktif, serta tidak melewati tanggal hari ini menurut zona waktu sekolah. Semester tidak harus berstatus aktif untuk pencatatan susulan dalam tahun aktif.
- Semua mutasi diaudit. Lampiran disimpan privat dalam database, sehingga tercakup dalam backup SQLite.

## Respons, tanggal, dan pagination

Semua request JSON mengirim `Authorization: Bearer <access_token>` dan `Content-Type: application/json`.
Respons JSON selalu memakai envelope:

```json
{
  "data": {
    "rows": [],
    "total": 0,
    "page": 1,
    "page_size": 20
  },
  "meta": {}
}
```

Respons detail/mutasi: `data` langsung berisi objek, bukan array. Semua daftar menerima
`page` (default 1, maksimum 100000) dan `page_size` (default 20, maksimum 100).
Daftar rules, policies, dan students juga dipaginasi: ambil halaman berikutnya sampai seluruh pilihan yang diperlukan tersedia.
Tidak ada cursor. Filter kosong sebaiknya dihilangkan.

`occurred_on` dan `due_date` berupa tanggal lokal sekolah `YYYY-MM-DD`, jangan konversi ke UTC.
Timestamp database seperti `created_at` dan `reviewed_at` berbentuk `YYYY-MM-DD HH:mm:ss` dalam UTC.
Untuk tampilan lokal, parse sebagai UTC terlebih dahulu (misalnya mengganti spasi dengan `T` dan menambahkan `Z`).
Nilai `is_active`, `year_active`, `can_review`, dan `can_attach` berupa angka 0/1 pada respons.
Kapabilitas `can_write` dan `can_manage` berupa boolean. Field nullable benar-benar dapat bernilai `null`.

## Bootstrap layar

`GET /options`

```json
{
  "data": {
    "capabilities": {
      "can_write": true,
      "can_manage": false,
      "homeroom_class_id": "11111111-1111-4111-8111-111111111111"
    },
    "semesters": [
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "name": "Ganjil",
        "academic_year_name": "2026/2027",
        "is_active": 1,
        "year_active": 1
      }
    ],
    "classes": [{ "id": "11111111-1111-4111-8111-111111111111", "name": "7A" }]
  },
  "meta": {}
}
```

- Pilih semester dengan `is_active = 1` dan `year_active = 1` sebagai default jika ada.
- Tampilkan **Pengajuan Saya** untuk semua pengguna dengan `points.read`.
- Tampilkan **Tambah Catatan** jika `can_write`.
- Tampilkan **Verifikasi Kelas**, **Rekap**, dan **Pembinaan** bila `homeroom_class_id` tidak null atau `can_manage`.
- Gunakan `can_review` dan `can_attach` dari detail untuk tombol tindakan. Jangan menentukan akses berdasarkan snapshot `class_id` kejadian karena murid bisa pindah kelas.
- Kapabilitas membantu UI; server tetap menjadi penentu izin. Muat ulang setelah penugasan/role berubah atau setelah mendapat 403.

## Daftar endpoint

Semua path di bawah relatif terhadap `/api/v1/points`.

| Method | Path                                       | Keterangan                                                  |
| ------ | ------------------------------------------ | ----------------------------------------------------------- |
| GET    | `/options`                                 | Kapabilitas, semester, kelas aktif.                         |
| GET    | `/students`                                | Pencarian identitas minimal murid aktif.                    |
| GET    | `/rules`                                   | Aturan aktif untuk guru; pengelola juga melihat nonaktif.   |
| POST   | `/rules`                                   | Buat aturan, khusus pengelola.                              |
| PATCH  | `/rules/{id}`                              | Ganti seluruh pengaturan aturan, khusus pengelola.          |
| GET    | `/policies`                                | Ambang aktif; pengelola juga melihat nonaktif.              |
| POST   | `/policies`                                | Buat ambang, khusus pengelola.                              |
| PATCH  | `/policies/{id}`                           | Ganti seluruh pengaturan ambang, khusus pengelola.          |
| GET    | `/entries`                                 | Riwayat/pengajuan/antrean verifikasi.                       |
| POST   | `/entries`                                 | Catat kejadian, mendukung retry idempoten.                  |
| GET    | `/entries/{id}`                            | Detail, daftar bukti, dan kapabilitas tindakan.             |
| POST   | `/entries/{id}/approve`                    | Sahkan pengajuan pending.                                   |
| POST   | `/entries/{id}/reject`                     | Tolak pengajuan pending dengan alasan.                      |
| POST   | `/entries/{id}/void`                       | Batalkan approved dengan alasan.                            |
| POST   | `/entries/{id}/attachments`                | Upload multipart bukti.                                     |
| GET    | `/entries/{id}/attachments/{attachmentId}` | Unduh berkas privat dengan Bearer token.                    |
| GET    | `/summary`                                 | Rekap per semester, murid/kelas.                            |
| GET    | `/cases`                                   | Daftar pembinaan sesuai akses.                              |
| POST   | `/cases`                                   | Pembinaan manual.                                           |
| GET    | `/cases/{id}`                              | Detail dan aktivitas pembinaan.                             |
| PATCH  | `/cases/{id}`                              | Status, tenggat, hasil, dan pengambilalihan tanggung jawab. |
| POST   | `/cases/{id}/activities`                   | Tambah catatan tindak lanjut.                               |

## Pencarian dan pengajuan

`GET /students?search=andi&class_id=<uuid>&page=1&page_size=20`

`search` opsional, mencari nama atau NIS, maksimum 100 karakter. `class_id` opsional.
Baris berisi `id`, `name`, `nis`, `photo_url`, `class_id`, `class_name`.
Murid tanpa kelas masih dapat muncul, tetapi pengajuan ditolak dengan `STUDENT_CLASS_REQUIRED` sampai penempatan kelas selesai.
Respons tidak memuat NISN, kontak wali, dokumen, atau catatan pembinaan.

`GET /rules?page_size=100` mengembalikan baris `id`, `school_id`, `name`, `kind`, `points`, `category`, `is_active`.
Tampilkan jenis dan bobot dari aturan; tidak ada input angka poin bebas.

`POST /entries`

```json
{
  "student_id": "33333333-3333-4333-8333-333333333333",
  "rule_id": "44444444-4444-4444-8444-444444444444",
  "semester_id": "22222222-2222-4222-8222-222222222222",
  "occurred_on": "2026-09-28",
  "note": "Terlambat 20 menit, alasan sudah dikonfirmasi.",
  "client_request_id": "55555555-5555-4555-8555-555555555555"
}
```

Semua field wajib. `note` 1–2000 karakter setelah trim. Semua ID berupa UUID.
Jangan mengirim `points`, `kind`, `class_id`, `school_id`, `created_by`, atau `status`; server menolaknya.

Respons baru: **201**, `data` berisi objek detail, `meta.replayed = false`.
Pengiriman ulang identik oleh akun yang sama: **200**, ID catatan sama, `meta.replayed = true`.
UUID sama dengan payload berbeda: **409 `IDEMPOTENCY_CONFLICT`**.

Contoh field penting dari `data` (respons sebenarnya juga menyertakan informasi audit/verifikasi):

```json
{
  "id": "66666666-6666-4666-8666-666666666666",
  "student_id": "33333333-3333-4333-8333-333333333333",
  "student_name": "Andi",
  "rule_name": "Terlambat",
  "kind": "violation",
  "points": 2,
  "status": "pending",
  "can_review": 0,
  "can_attach": 1,
  "attachments": []
}
```

**Implementasi retry:** buat satu UUID saat draft siap dikirim, simpan bersama payload lokal sampai hasil diketahui.
Jika timeout, kirim ulang payload dan UUID yang sama. Draft baru atau perubahan payload setelah berhasil
harus memakai UUID baru. Jangan membuat UUID baru pada setiap retry jaringan.
Endpoint mutasi lain belum idempoten; setelah timeout, baca ulang detail sebelum mengulangi.

## Riwayat, detail, dan verifikasi

`GET /entries` menerima filter berikut, semuanya opsional:

| Filter                                  | Nilai                                         |
| --------------------------------------- | --------------------------------------------- |
| `scope`                                 | `accessible` (default), `mine`, `homeroom`    |
| `student_id`, `semester_id`, `class_id` | UUID                                          |
| `kind`                                  | `appreciation`, `violation`                   |
| `status`                                | `pending`, `approved`, `rejected`, `voided`   |
| `from`, `to`                            | `YYYY-MM-DD`, batas tanggal kejadian inklusif |

Contoh:

- Pengajuan saya: `/entries?scope=mine&semester_id=<uuid>`.
- Antrean wali kelas: `/entries?scope=homeroom&status=pending`.
- Antrean admin: `/entries?status=pending`.
- Riwayat murid: `/entries?student_id=<uuid>&semester_id=<uuid>`; guru biasa tetap hanya menerima pengajuannya sendiri.

`class_id` pada filter entries adalah **kelas snapshot saat pencatatan**. `scope=homeroom` mengikuti murid kelas wali saat ini.
Daftar diurutkan `created_at DESC, id`. Respons daftar tidak memuat `attachments`, `can_review`, atau `can_attach`; gunakan detail.

`GET /entries/{id}` memuat snapshot, nama murid/kelas/pencatat, `reviewed_by`, `reviewed_at`, `review_reason`,
`voided_by`, `voided_at`, `void_reason`, `can_review`, `can_attach`, serta metadata `attachments`.
Field `request_hash` adalah detail internal; klien tidak perlu menggunakannya.

Pengesahan: `POST /entries/{id}/approve` dengan `{}` atau `{"reason":"Sudah dikonfirmasi."}`.
Penolakan/pembatalan: `POST /entries/{id}/reject` atau `/void` dengan:

```json
{ "reason": "Catatan ganda untuk kejadian yang sama." }
```

Alasan penolakan/pembatalan wajib 1–2000 karakter. Jika petugas lain sudah mengubah status, API mengembalikan
409 `INVALID_STATUS`. Muat ulang detail dan antrean, jangan mengubah saldo lokal secara spekulatif.
Setelah approve/void, muat ulang rekap dan pembinaan.

## Lampiran

1. Simpan catatan untuk mendapatkan ID.
2. Kirim `POST /entries/{id}/attachments` sebagai multipart, field **`file`**.
3. Jangan set `Content-Type: application/json`; biarkan pustaka HTTP membuat boundary multipart.
4. Maksimum tiga lampiran per catatan, masing-masing 5 MB. Format PNG/JPEG/WebP/PDF, isi file divalidasi server.
5. Hanya pencatat yang dapat menambah bukti saat `pending`, atau pada `approved` yang ia sahkan sendiri.
   Setelah disahkan petugas lain/ditolak/dibatalkan, bukti tidak dapat ditambah.
6. Jika upload gagal, catatan tetap tersimpan. Ulangi upload dari detail; jangan membuat catatan baru.
7. Upload belum idempoten. Setelah timeout, baca daftar lampiran untuk memeriksa hasil sebelum mengirim ulang.

Respons upload 201 berisi `id`, `original_name`, `mime_type`, `size`.
Download: `GET /entries/{entryId}/attachments/{attachmentId}` dengan Bearer token, hasilnya **binary**, bukan envelope JSON.
Download dengan HTTP client terautentikasi ke cache privat aplikasi, lalu buka viewer lokal.
Jangan membuka URL langsung di browser eksternal tanpa header autentikasi. Akses berkas mengikuti akses catatan pada setiap request.

## Rekap

`GET /summary?semester_id=<uuid>&student_id=<uuid>`

`semester_id` wajib. `student_id` dan `class_id` opsional, ditambah pagination.
Baris: `id` (ID murid), `name`, `nis`, `appreciation`, `violation`, `open_cases`.
Wali kelas otomatis dibatasi ke murid aktif kelas wali saat ini, termasuk saat melihat semester lampau.
Pengelola dapat melihat seluruh sekolah dan memfilter kelas dalam tahun semester yang dipilih.
Total disusun dari catatan yang sah; jangan menjumlahkan hanya satu halaman `/entries` untuk membuat saldo.
Web menyediakan ekspor Excel untuk rekap dan daftar catatan sesuai filter.

## Pembinaan

Saat poin disahkan, setiap ambang aktif yang tercapai membuat satu kasus per murid, semester, dan kebijakan.
Penanggung jawab awal adalah akun wali kelas aktif jika tersedia; jika tidak, `responsible_user_id = null`.
Tidak ada sanksi atau pengiriman pesan orang tua otomatis. Kasus merupakan daftar tindak lanjut.
Perubahan ambang tidak memproses ulang histori langsung; ambang diperiksa pada pengesahan berikutnya.
Menutup kasus lalu menambah pelanggaran tidak membuat ulang kasus untuk ambang sama pada semester sama.
Kasus tambahan dapat dibuat manual. Membatalkan poin tidak otomatis menutup kasus yang sudah terbentuk.

`GET /cases?semester_id=<uuid>&student_id=<uuid>&status=open` (semua filter opsional).
Guru tanpa kelas wali menerima daftar kosong; tidak mendapat akses detail kasus.

Pembinaan manual: `POST /cases`:

```json
{
  "student_id": "33333333-3333-4333-8333-333333333333",
  "semester_id": "22222222-2222-4222-8222-222222222222",
  "title": "Evaluasi kedisiplinan",
  "note": "Pertemuan awal bersama murid.",
  "due_date": "2026-10-05"
}
```

`title` 1–120 karakter, `note` 1–2000 karakter. `due_date` opsional/null. Respons 201 berisi detail kasus.
`GET /cases/{id}` menyertakan `activities` yang diurutkan berdasarkan waktu dan ID.
Catatan pembinaan merupakan data internal petugas; tidak ada API murid/orang tua pada tahap ini.

`PATCH /cases/{id}` menerima sebagian field berikut; paling sedikit satu:

```json
{
  "status": "in_progress",
  "due_date": "2026-10-05",
  "assign_to_me": true
}
```

Status: `open`, `in_progress`, `resolved`. Untuk menyelesaikan, isi `resolution`:

```json
{ "status": "resolved", "resolution": "Evaluasi selesai, perkembangan dicatat." }
```

`resolution` maksimal 2000 karakter dan wajib tidak kosong bila status akhir `resolved`.
`due_date: null` menghapus tenggat. `assign_to_me: true` mengganti penanggung jawab ke pengguna yang mengajukan perubahan;
hilangkan field jika tidak ingin mengubahnya. Saat wali kelas berganti, wali baru bisa mengambil tanggung jawab melalui opsi ini.
Kasus boleh dibuka kembali dengan status `open` atau `in_progress`; semua perubahan diaudit.
Penyelesaian kasus tidak menghapus poin pelanggaran.

`POST /cases/{id}/activities`:

```json
{ "note": "Pertemuan dengan orang tua selesai, evaluasi dijadwalkan pekan depan." }
```

Respons 201 berisi detail kasus beserta aktivitas terbaru. Catatan aktivitas tidak diedit/dihapus; tambah koreksi sebagai aktivitas baru.

## Pengaturan master (umumnya melalui web)

`POST /rules` dan `PATCH /rules/{id}` memakai payload lengkap:

```json
{
  "name": "Terlambat",
  "kind": "violation",
  "points": 2,
  "category": "Kedisiplinan",
  "is_active": true
}
```

`name` 1–120 karakter, `points` integer 1–1000, `category` maksimal 100 karakter (default kosong),
`is_active` boolean (default true). PATCH bukan patch parsial: kirim nilai lengkap agar default tidak mereset field yang terlewat.

`POST /policies` dan `PATCH /policies/{id}`:

```json
{ "name": "Pembinaan wali kelas", "threshold": 25, "is_active": true }
```

`threshold` integer 1–10000. Nonaktifkan aturan/kebijakan dengan `is_active: false`; tidak ada endpoint DELETE.

## Error dan penanganan UI

```json
{
  "error": {
    "code": "REASON_REQUIRED",
    "message": "Alasan wajib diisi."
  }
}
```

| HTTP / code                                                                                                                  | Penanganan                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 400 `VALIDATION_ERROR`                                                                                                       | Tampilkan `message` dan `fields` jika tersedia pada field formulir.                                |
| 400 `INVALID_EVENT_DATE`                                                                                                     | Perbaiki tanggal/semester.                                                                         |
| 400 `REASON_REQUIRED`, `RESOLUTION_REQUIRED`                                                                                 | Minta alasan atau hasil pembinaan.                                                                 |
| 400 `INVALID_ATTACHMENT`                                                                                                     | Periksa format dan ukuran file.                                                                    |
| 401 (kode autentikasi)                                                                                                       | Ikuti alur refresh token standar; login kembali bila gagal.                                        |
| 403 `FORBIDDEN`, `STUDENT_SCOPE_FORBIDDEN`, `ATTACHMENT_FORBIDDEN`                                                           | Muat ulang kapabilitas dan tampilkan alasan penolakan.                                             |
| 404 `STUDENT_NOT_FOUND`, `RULE_NOT_FOUND`, `SEMESTER_NOT_FOUND`, `ENTRY_NOT_FOUND`, `CASE_NOT_FOUND`, `ATTACHMENT_NOT_FOUND` | Data tidak ditemukan/tidak dapat diakses; kembali ke daftar.                                       |
| 409 `STUDENT_CLASS_REQUIRED`                                                                                                 | Minta admin melengkapi kelas murid.                                                                |
| 409 `ACADEMIC_YEAR_INACTIVE`                                                                                                 | Pilih semester dalam tahun ajaran aktif.                                                           |
| 409 `IDEMPOTENCY_CONFLICT`                                                                                                   | Jangan retry otomatis dengan payload berubah.                                                      |
| 409 `INVALID_STATUS`                                                                                                         | Refresh detail dan antrean; petugas lain mungkin sudah bertindak.                                  |
| 409 `ATTACHMENT_LIMIT`                                                                                                       | Sudah ada tiga bukti.                                                                              |
| 413 `PAYLOAD_TOO_LARGE`                                                                                                      | JSON maksimal 32 KiB; request upload maksimal 6 MiB termasuk multipart. File tetap maksimal 5 MiB. |

## Checklist implementasi native

- Bootstrap `/options`, lalu tampilkan menu sesuai kapabilitas.
- Cari murid di server dengan debounce dan pagination; jangan unduh seluruh profil sekolah.
- Form kejadian: murid, semester, aturan, tanggal lokal, catatan, bukti opsional.
- Simpan UUID request beserta draft untuk retry jaringan.
- Tangani respons create `pending` **atau** `approved` tanpa mengasumsikan salah satunya.
- Sediakan Pengajuan Saya, antrean wali, detail, alasan reject/void, rekap, dan pembinaan.
- Ambil kapabilitas tindakan dari detail; jangan mengandalkan nama role atau snapshot kelas.
- Sesudah mutasi, refresh daftar/detail/rekap/pembinaan yang relevan.
- Download lampiran memakai token; perlakukan sebagai binary.
- Tampilkan state kosong, loading, gagal, serta opsi retry. Pastikan double-tap tombol kirim diblokir.
- Uji akun guru biasa, wali kelas, guru tanpa kelas, perubahan wali, dan akun tanpa permission.
