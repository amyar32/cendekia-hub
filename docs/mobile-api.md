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

| Method | Endpoint                                             | Keterangan                                          |
| ------ | ---------------------------------------------------- | --------------------------------------------------- |
| `GET`  | `/api/v1/me`                                         | Profil akun, guru, dan sekolah                      |
| `GET`  | `/api/v1/me/schedule?date=YYYY-MM-DD`                | Gabungan jadwal pelajaran dan ekstrakurikuler       |
| `GET`  | `/api/v1/me/check-ins?from=YYYY-MM-DD&to=YYYY-MM-DD` | Riwayat check-in, maksimal 100 baris                |
| `GET`  | `/api/v1/classes`                                    | Rombel yang diajar atau diwalikan pada tahun aktif  |
| `GET`  | `/api/v1/classes/:classId/students`                  | Daftar minimal murid pada rombel yang boleh diakses |

Tanggal kosong mengikuti zona waktu sekolah.

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
