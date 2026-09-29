# Integrasi mobile fitur wali kelas

Dokumen ini adalah kontrak implementasi untuk tim aplikasi mobile. Base path API adalah `/api/v1`.
Gunakan header `Authorization: Bearer <access_token>` pada seluruh request. Access token berlaku 15
menit dan refresh token 30 hari; refresh token wajib disimpan di Keychain/Keystore dan selalu diganti
dengan token baru dari `POST /auth/refresh`.

## Alur aplikasi

1. Login menggunakan `POST /auth/login` dan selesaikan perubahan password jika
   `must_change_password=true`.
2. Panggil `GET /me/homeroom` ketika bootstrap aplikasi, setelah refresh token, dan saat pengguna
   melakukan pull-to-refresh di beranda.
3. Tampilkan menu **Kelas Wali** hanya saat `is_homeroom_teacher=true`.
4. Halaman utama Kelas Wali mengambil `/homeroom/dashboard`. Halaman rekap mengambil
   `/homeroom/attendance`; detail sesi pelajaran mengambil
   `/homeroom/attendance-sessions/:sessionId`; detail murid mengambil
   `/homeroom/students/:studentId`.
5. Setelah membuat atau memperbarui tindak lanjut, invalidasi cache dashboard, detail murid, dan
   daftar tindak lanjut.

Jangan menentukan akses dari nama role `Guru` dan jangan mengirim `teacher_id`, `school_id`, atau
`class_id`. Server menentukan semuanya dari token serta penugasan wali kelas aktif.

## Bentuk respons dan error

Respons berhasil selalu berbentuk:

```json
{ "data": {}, "meta": {} }
```

Respons gagal selalu berbentuk:

```json
{
  "error": {
    "code": "HOMEROOM_NOT_ASSIGNED",
    "message": "Anda tidak memiliki penugasan wali kelas pada tahun ajaran aktif."
  }
}
```

Perlakuan status yang disarankan:

| Status                           | Tindakan aplikasi                                                              |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `400`                            | Tampilkan `error.message`; bila ada `error.fields`, pasangkan ke input form.   |
| `401`                            | Lakukan refresh token satu kali, ulangi request, lalu logout jika tetap gagal. |
| `403 PASSWORD_CHANGE_REQUIRED`   | Arahkan ke layar ganti password.                                               |
| `404 HOMEROOM_NOT_ASSIGNED`      | Sembunyikan menu Kelas Wali dan kembali ke beranda.                            |
| `404 HOMEROOM_STUDENT_NOT_FOUND` | Tutup detail; data/penugasan kemungkinan sudah berubah.                        |
| `404 FOLLOW_UP_NOT_FOUND`        | Hapus item dari cache dan muat ulang daftar.                                   |
| `409`                            | Tampilkan pesan konflik dari server.                                           |
| `5xx`                            | Tampilkan retry state; jangan ulangi mutasi otomatis tanpa idempotency.        |

Semua respons API menggunakan `Cache-Control: no-store`. Klien boleh memakai cache lokal sendiri,
tetapi wajib menginvalidasinya setelah mutasi dan ketika aplikasi kembali aktif.

## 1. Deteksi wali kelas

`GET /me/homeroom`

Guru yang menjadi wali kelas:

```json
{
  "data": {
    "is_homeroom_teacher": true,
    "homeroom": {
      "assignment_id": "uuid",
      "academic_year_id": "uuid",
      "academic_year_name": "2029/2030",
      "academic_year_start_date": "2029-07-01",
      "academic_year_end_date": "2030-06-30",
      "class_id": "uuid",
      "class_name": "7A",
      "grade_name": "Kelas 7",
      "student_count": 32
    }
  },
  "meta": {}
}
```

Guru tanpa penugasan wali tetap mendapat status `200`:

```json
{
  "data": { "is_homeroom_teacher": false, "homeroom": null },
  "meta": {}
}
```

`is_homeroom_teacher` adalah sumber kebenaran untuk navigasi. Jangan memakai keberadaan kelas dari
`GET /classes`, karena endpoint tersebut juga memuat kelas yang hanya diajar.

## 2. Dashboard harian

`GET /homeroom/dashboard?date=2029-07-02`

Parameter `date` opsional dan menggunakan tanggal lokal sekolah jika kosong.

```json
{
  "data": {
    "date": "2029-07-02",
    "homeroom": {
      "class_id": "uuid",
      "class_name": "7A",
      "grade_name": "Kelas 7",
      "student_count": 32
    },
    "summary": {
      "total_students": 32,
      "checked_in": 30,
      "on_time": 28,
      "late": 2,
      "gateway_absent": 0,
      "not_checked_in": 2,
      "scheduled_lessons": 6,
      "recorded_lessons": 4,
      "open_lessons": 1,
      "closed_lessons": 3,
      "unrecorded_lessons": 2,
      "attention_students": 4
    },
    "schedules": [
      {
        "schedule_id": "uuid",
        "subject_name": "Matematika",
        "teacher_name": "Budi Guru",
        "slot_name": "Jam 1",
        "start_time": "07:00",
        "end_time": "08:00",
        "session_id": "uuid atau null",
        "session_status": "open, closed, atau null",
        "recorded_count": 32,
        "present_count": 29,
        "late_count": 1,
        "sick_count": 1,
        "excused_count": 1,
        "absent_count": 0
      }
    ],
    "attention_students": [
      {
        "id": "uuid",
        "photo_url": "",
        "nis": "S-001",
        "nisn": "0099999999",
        "name": "Andi Murid",
        "gender": "male",
        "checkin_status": "late",
        "checked_in_at": "2029-07-02 07:20:00",
        "checkin_note": "",
        "lesson_record_count": 4,
        "present_count": 3,
        "late_count": 1,
        "sick_count": 0,
        "excused_count": 0,
        "absent_count": 0,
        "open_follow_up_count": 1
      }
    ]
  },
  "meta": {}
}
```

`session_status=null` berarti guru pengampu belum membuka absensi. Wali kelas hanya dapat melihat
status ini; aplikasi tidak boleh menawarkan perubahan absensi pelajaran guru lain.
`attention_students` memuat murid yang belum check-in, terlambat, memiliki status pelajaran selain
hadir, atau masih memiliki tindak lanjut terbuka.

## 3. Rekap kehadiran

`GET /homeroom/attendance?from=2029-07-01&to=2029-07-31`

- `to` default ke tanggal lokal sekolah.
- `from` default ke 29 hari sebelum `to`.
- Rentang inklusif maksimal 92 hari.
- Tambahkan `student_id=<uuid>` untuk mengambil satu murid.

Setiap elemen `students` berisi identitas ringkas dan agregat berikut:

```json
{
  "id": "uuid",
  "nis": "S-001",
  "name": "Andi Murid",
  "checkin_present": 18,
  "checkin_late": 2,
  "checkin_absent": 1,
  "lesson_present": 80,
  "lesson_late": 3,
  "lesson_sick": 2,
  "lesson_excused": 1,
  "lesson_absent": 4,
  "lesson_total": 90
}
```

Angka check-in adalah hitungan hari di gerbang. Angka pelajaran adalah hitungan per sesi pelajaran;
keduanya tidak boleh dijumlahkan menjadi satu metrik kehadiran.

## 4. Detail sesi absensi pelajaran

`GET /homeroom/attendance-sessions/:sessionId`

Gunakan endpoint ini saat wali kelas memilih sesi pelajaran dari dashboard. Respons `data`
memiliki `homeroom`, `session`, dan `records`; bentuk `session` serta `records` sama seperti
detail sesi guru sehingga layar detail dapat dipakai ulang. Endpoint ini hanya-baca dan hanya
mengembalikan sesi dari rombel wali kelas pada tahun ajaran aktif. Jika tidak sesuai, server
mengembalikan `404 HOMEROOM_ATTENDANCE_SESSION_NOT_FOUND`.

## 5. Detail murid

`GET /homeroom/students/:studentId`

Respons berisi `homeroom`, `student`, `guardians`, dan `follow_ups`. Profil murid hanya menyertakan
data operasional: foto, NIS/NISN, nama, jenis kelamin, kelahiran, golongan darah, agama, kontak,
serta informasi kebutuhan khusus. Kontak wali hanya berisi `id`, `name`, `relation`, `phone`,
`email`, dan `is_primary`.

API sengaja tidak mengirim NIK, nomor KK, alamat lengkap, token QR, maupun dokumen. Nomor telepon
boleh dinormalisasi di sisi tampilan untuk deep link `tel:` atau WhatsApp, tetapi nilai asli jangan
ditulis ke log analitik atau crash report.

## 6. Tindak lanjut

Daftar: `GET /homeroom/follow-ups?status=open&student_id=<uuid>`.
Kedua filter opsional. Respons dibatasi maksimal 200 item dan memprioritaskan status terbuka serta
batas waktu terdekat.

Buat: `POST /homeroom/follow-ups`

```json
{
  "student_id": "uuid",
  "category": "attendance",
  "note": "Hubungi wali terkait keterlambatan berulang.",
  "due_date": "2029-07-05"
}
```

`category` menerima `attendance`, `academic`, `behavior`, `welfare`, atau `other`. `note` wajib dan
maksimal 2.000 karakter. `due_date` boleh tanggal ISO atau `null`.

Perbarui: `PATCH /homeroom/follow-ups/:followUpId`

```json
{ "status": "resolved" }
```

Body boleh berisi satu atau beberapa dari `category`, `note`, `due_date`, dan `status`. Status hanya
`open` atau `resolved`. Mengubah kembali ke `open` akan mengosongkan `resolved_at`.

## Pemetaan layar yang disarankan

| Layar           | Endpoint utama           | Refresh                                |
| --------------- | ------------------------ | -------------------------------------- |
| Beranda         | `/me/homeroom`           | Saat bootstrap dan app resume          |
| Kelas Wali      | `/homeroom/dashboard`    | Pull-to-refresh dan setelah mutasi     |
| Rekap Kehadiran | `/homeroom/attendance`   | Saat rentang/filter berubah            |
| Detail Sesi Pelajaran | `/homeroom/attendance-sessions/:sessionId` | Saat sesi pada dashboard dipilih |
| Detail Murid    | `/homeroom/students/:id` | Saat dibuka dan setelah mutasi         |
| Tindak Lanjut   | `/homeroom/follow-ups`   | Saat filter berubah dan setelah mutasi |

Dashboard boleh di-refresh berkala ketika layar aktif, tetapi interval minimal 60 detik disarankan.
Hentikan polling ketika aplikasi berada di background. Belum ada push notification atau endpoint
offline sync; jangan antrekan mutasi tindak lanjut tanpa meminta konfirmasi pengguna setelah koneksi
kembali.

## TypeScript ringkas

```ts
type AttendanceStatus = 'present' | 'late' | 'sick' | 'excused' | 'absent';
type FollowUpCategory = 'attendance' | 'academic' | 'behavior' | 'welfare' | 'other';
type FollowUpStatus = 'open' | 'resolved';

type ApiSuccess<T> = { data: T; meta: Record<string, unknown> };
type ApiFailure = {
  error: { code: string; message: string; fields?: Record<string, string> };
};
```

Spesifikasi mesin yang dapat diimpor ke Postman atau generator SDK tersedia di
`GET /api/v1/openapi.json`, sedangkan Swagger UI tersedia di `/docs`.
