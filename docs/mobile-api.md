# REST API aplikasi guru

API mobile tersedia di `/api/v1`. Dokumentasi interaktif Swagger tersedia di `/docs`, sedangkan
spesifikasi OpenAPI yang dapat diimpor ke Postman atau generator SDK tersedia di `/api/v1/openapi.json`.

Untuk klien browser pada origin lain, isi `MOBILE_API_CORS_ORIGINS` dengan daftar origin yang
dipisahkan koma, misalnya `https://app.example.com,https://staging.example.com`. Pada development,
origin HTTP `localhost`, `127.0.0.1`, dan `[::1]` otomatis diizinkan. Aplikasi native tidak
memerlukan CORS.

Seluruh respons menggunakan JSON dan endpoint selain login serta
refresh membutuhkan header berikut:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

Respons berhasil berbentuk `{ "data": ..., "meta": {} }`. Respons gagal berbentuk:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data tidak valid.",
    "fields": { "email": "Email tidak valid." }
  }
}
```

## Autentikasi

### Login

`POST /api/v1/auth/login`

```json
{
  "email": "guru@sekolah.test",
  "password": "kata-sandi",
  "device_id": "id-instalasi-aplikasi",
  "device_name": "Samsung A55"
}
```

Access token berlaku 15 menit dan refresh token berlaku 30 hari. Simpan refresh token di
Keychain/Keystore (misalnya melalui Expo Secure Store), bukan AsyncStorage. Login baru dengan
`device_id` yang sama mencabut sesi lama perangkat tersebut.

Jika `must_change_password` bernilai `true`, hanya profil, logout, dan perubahan kata sandi yang
dapat diakses.

### Mengganti kata sandi sementara

`POST /api/v1/auth/password`

```json
{
  "current_password": "kata-sandi-sementara",
  "new_password": "minimal-12-karakter"
}
```

Respons mengandung pasangan token baru. Semua sesi web dan mobile lama dicabut.

### Memperbarui token

`POST /api/v1/auth/refresh`

```json
{ "refresh_token": "..." }
```

Selalu simpan access token dan refresh token baru dari respons. Refresh token lama langsung tidak
berlaku setelah digunakan.

### Logout

`POST /api/v1/auth/logout`, menggunakan access token aktif.

## Profil dan data guru

| Method   | Endpoint                                             | Keterangan                                          |
| -------- | ---------------------------------------------------- | --------------------------------------------------- |
| `GET`    | `/api/v1/me`                                         | Profil akun, guru, dan sekolah                      |
| `GET`    | `/api/v1/me/schedule?date=YYYY-MM-DD`                | Gabungan jadwal pelajaran dan ekstrakurikuler       |
| `GET`    | `/api/v1/me/check-ins?from=YYYY-MM-DD&to=YYYY-MM-DD` | Riwayat check-in, maksimal 100 baris                |
| `GET`    | `/api/v1/me/homeroom`                                | Deteksi penugasan wali kelas aktif                  |
| `PUT`    | `/api/v1/me/push-token`                              | Daftarkan token Expo Push untuk sesi aktif          |
| `DELETE` | `/api/v1/me/push-token`                              | Nonaktifkan token push untuk sesi aktif             |
| `GET`    | `/api/v1/classes`                                    | Rombel yang diajar atau diwalikan pada tahun aktif  |
| `GET`    | `/api/v1/classes/:classId/students`                  | Daftar minimal murid pada rombel yang boleh diakses |

Tanggal kosong mengikuti zona waktu sekolah.

## Push notification

Setelah pengguna memberi izin notifikasi, kirim token project-scoped Expo dari
`getExpoPushTokenAsync` ke `PUT /api/v1/me/push-token`:

```json
{
  "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "android"
}
```

Token terikat ke sesi mobile aktif dan otomatis dinonaktifkan saat logout atau seluruh sesi akun
dicabut. Aplikasi perlu mendaftarkan ulang token setelah login, saat token perangkat berubah, dan
saat aplikasi kembali aktif setelah izin notifikasi diberikan.

Notifikasi poin menggunakan payload data `{ "type": "point_entry", "entry_id": "<uuid>" }`.
Notifikasi pembinaan menggunakan `{ "type": "coaching_case", "case_id": "<uuid>" }`. Setelah
notifikasi ditekan, muat detail dari API; jangan memperlakukan teks push sebagai sumber data.

Notifikasi guru terjadwal memakai payload `{ "type": "lesson_schedule", "schedule_id": "<uuid>",
"date": "YYYY-MM-DD" }` atau `{ "type": "attendance_reminder", "schedule_id": "<uuid>",
"date": "YYYY-MM-DD" }`. Keduanya diarahkan ke tab Jadwal. Backend hanya membuatnya saat
endpoint internal `POST /api/internal/notifications/teacher-reminders` dipanggil scheduler
setiap 10 menit dengan header `Authorization: Bearer <NOTIFICATION_CRON_SECRET>`.

## Poin dan pembinaan murid

API `/api/v1/points` menyediakan pencarian identitas dasar murid satu sekolah, pengajuan apresiasi/pelanggaran,
verifikasi wali kelas, bukti privat, rekap semester, dan pembinaan. Tidak ada role BK.
Lihat [panduan integrasi native poin](mobile-points-integration.md) untuk kontrak endpoint, contoh payload,
idempotensi, pagination, hak akses, error, dan alur layar. Swagger tersedia pada tag **Points**.

## Wali kelas

Fitur wali kelas memakai akun Guru yang sama dan diaktifkan berdasarkan penugasan
`homeroom_assignments` pada tahun ajaran aktif. Aplikasi mobile tidak perlu memiliki role atau proses
login khusus wali kelas. Gunakan `GET /api/v1/me/homeroom` setelah login untuk menentukan apakah
menu **Kelas Wali** perlu ditampilkan.

| Method  | Endpoint                                          | Keterangan                                        |
| ------- | ------------------------------------------------- | ------------------------------------------------- |
| `GET`   | `/api/v1/me/homeroom`                             | Status dan identitas kelas wali aktif             |
| `GET`   | `/api/v1/homeroom/dashboard?date=YYYY-MM-DD`      | Ringkasan gerbang dan pelajaran pada satu hari    |
| `GET`   | `/api/v1/homeroom/attendance?from=...&to=...`     | Rekap kehadiran per murid, maksimal 92 hari       |
| `GET`   | `/api/v1/homeroom/attendance-sessions/:sessionId` | Detail baca-saja sesi dan status murid kelas wali |
| `GET`   | `/api/v1/homeroom/students/:studentId`            | Profil aman, kontak wali, dan tindak lanjut       |
| `GET`   | `/api/v1/homeroom/follow-ups?status=open`         | Daftar tindak lanjut kelas                        |
| `POST`  | `/api/v1/homeroom/follow-ups`                     | Membuat tindak lanjut                             |
| `PATCH` | `/api/v1/homeroom/follow-ups/:followUpId`         | Mengubah atau menyelesaikan tindak lanjut         |

Kontrak respons, contoh payload, pemetaan layar, serta penanganan token dan error dijelaskan dalam
[panduan integrasi wali kelas](mobile-homeroom-integration.md). Seluruh endpoint selain
`/me/homeroom` mengembalikan `404 HOMEROOM_NOT_ASSIGNED` apabila guru tidak menjadi wali kelas aktif.
Server mengambil sekolah, guru, tahun ajaran, dan rombel dari access token; klien tidak boleh
mengirim atau menyimpan nilai tersebut sebagai dasar otorisasi.

## Penugasan mata pelajaran

`GET /api/v1/attendances` menggunakan Bearer token guru dan permission `student-attendance.read`.
Respons `data` berisi `academic_year` dan `subjects`, mengikuti pola `/api/v1/extracurriculars`.
Setiap item adalah satu penugasan, sehingga mata pelajaran yang sama pada rombel berbeda
memiliki `assignment_id` berbeda.

Field setiap item: `assignment_id`, `subject_id`, `code`, `name`, `category`, `description`,
`class_id`, `class_name`, `grade_name`, `semester_id`, `semester_name`, `student_count`, dan `schedules`.
Jadwal berisi `schedule_id`, `semester_id`, `semester_name`, `weekday` (1=Senin, 7=Minggu),
`time_slot_id`, `slot_name`, `start_time`, dan `end_time`.

Hanya penugasan guru yang login pada tahun ajaran aktif, dengan mata pelajaran dan rombel aktif,
yang dikembalikan. Semua semester pada tahun tersebut disertakan; `semester_id: null` berarti
“Semua Semester”. Jumlah murid menghitung murid aktif dengan keanggotaan rombel berstatus `active`.
Jadwal yang diarsipkan tidak disertakan. Penugasan tanpa jadwal memiliki `schedules: []`;
jika tidak ada penugasan, `subjects: []`. Daftar murid tersedia melalui
`GET /api/v1/classes/:classId/students`. Contoh respons tersedia di Swagger `/docs`.

## Absensi pelajaran

| Method | Endpoint                                         | Keterangan                                               |
| ------ | ------------------------------------------------ | -------------------------------------------------------- |
| `GET`  | `/api/v1/attendance-sessions?date=YYYY-MM-DD`    | Jadwal dan status sesi pada tanggal tersebut             |
| `POST` | `/api/v1/attendance-sessions`                    | Membuka sesi dan membuat catatan awal berstatus `absent` |
| `GET`  | `/api/v1/attendance-sessions/:sessionId`         | Detail sesi dan seluruh catatan murid                    |
| `PUT`  | `/api/v1/attendance-sessions/:sessionId/records` | Memperbarui catatan secara bulk                          |
| `POST` | `/api/v1/attendance-sessions/:sessionId/close`   | Menutup sesi                                             |

Membuka sesi bersifat idempoten untuk kombinasi jadwal dan tanggal: pengulangan request akan
mengembalikan sesi yang sudah ada.

Body untuk membuka sesi:

```json
{
  "schedule_id": "uuid",
  "attendance_date": "2029-07-02"
}
```

Body pembaruan catatan:

```json
{
  "records": [
    { "id": "uuid-catatan", "status": "present", "note": "" },
    { "id": "uuid-catatan", "status": "sick", "note": "Surat dokter" }
  ]
}
```

Nilai status: `present`, `late`, `sick`, `excused`, atau `absent`. Sesi yang sudah ditutup tidak
dapat diedit melalui API guru.

Semua akses kelas, jadwal, dan absensi divalidasi menggunakan profil guru dan sekolah dari token.
API tidak menerima `teacher_id` atau `school_id` dari aplikasi.

## Pembina dan absensi ekstrakurikuler

| Method | Endpoint                                                         | Keterangan                                   |
| ------ | ---------------------------------------------------------------- | -------------------------------------------- |
| `GET`  | `/api/v1/extracurriculars`                                       | Penugasan aktif, jadwal, dan jumlah peserta  |
| `GET`  | `/api/v1/extracurriculars/:assignmentId/participants`            | Peserta aktif pada kegiatan yang dibina      |
| `GET`  | `/api/v1/extracurricular-attendance-sessions?date=YYYY-MM-DD`    | Jadwal dan status sesi pada tanggal tertentu |
| `POST` | `/api/v1/extracurricular-attendance-sessions`                    | Membuka sesi absensi ekstrakurikuler         |
| `GET`  | `/api/v1/extracurricular-attendance-sessions/:sessionId`         | Detail sesi dan catatan peserta              |
| `PUT`  | `/api/v1/extracurricular-attendance-sessions/:sessionId/records` | Memperbarui catatan peserta secara bulk      |
| `POST` | `/api/v1/extracurricular-attendance-sessions/:sessionId/close`   | Menutup sesi absensi ekstrakurikuler         |

Body pembukaan sesi dan pembaruan catatan sama seperti absensi pelajaran. Endpoint hanya menerima
penugasan dengan status `active`, pada tahun ajaran aktif, dan terhubung ke guru yang sedang login.
Pembukaan sesi juga idempoten untuk kombinasi jadwal dan tanggal.
