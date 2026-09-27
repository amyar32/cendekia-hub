export type StudentCheckinTemplateData = {
  schoolName: string;
  studentName: string;
  date: string;
  time: string;
  status: 'present' | 'late' | 'absent';
};

type AttendanceStatus = 'present' | 'late' | 'sick' | 'excused' | 'absent';

function indonesianDate(date: string) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function attendanceStatus(status: AttendanceStatus) {
  return status === 'late'
    ? '⏰ *Hadir terlambat*'
    : status === 'absent'
      ? '❌ *Tidak hadir*'
      : status === 'sick'
        ? '🤒 *Sakit*'
        : status === 'excused'
          ? '📝 *Izin*'
          : '✅ *Hadir*';
}

export function studentCheckinMessage(input: StudentCheckinTemplateData) {
  const date = indonesianDate(input.date);
  const status = attendanceStatus(input.status);
  return [
    `📚 *INFORMASI KEHADIRAN*`,
    `*${input.schoolName}*`,
    '',
    'Yth. Bapak/Ibu Orang Tua/Wali, 👋',
    'Kehadiran Ananda telah tercatat dengan rincian berikut:',
    '',
    `👤 *Nama:* ${input.studentName}`,
    `📅 *Hari, tanggal:* ${date}`,
    `🕐 *Waktu pencatatan:* ${input.time.replace(':', '.')} (waktu sekolah)`,
    `📌 *Status:* ${status}`,
    '',
    'Jika ada ketidaksesuaian data, silakan hubungi pihak sekolah. 🙏',
    'Terima kasih atas perhatian dan kerja sama Bapak/Ibu.',
    '',
    '_Pesan ini dikirim otomatis oleh sistem kehadiran sekolah._',
  ].join('\n');
}

export type StudentExtracurricularAttendanceTemplateData = {
  schoolName: string;
  extracurricularName: string;
  teacherName: string;
  studentName: string;
  date: string;
  time: string;
  status: AttendanceStatus;
};

export function studentExtracurricularAttendanceMessage(
  input: StudentExtracurricularAttendanceTemplateData,
) {
  return [
    '🏅 *INFORMASI KEHADIRAN EKSTRAKURIKULER*',
    `*${input.schoolName}*`,
    '',
    'Yth. Bapak/Ibu Orang Tua/Wali, 👋',
    'Sesi ekstrakurikuler Ananda telah selesai dan kehadirannya telah dicatat:',
    '',
    `👤 *Nama:* ${input.studentName}`,
    `🏃 *Kegiatan:* ${input.extracurricularName}`,
    `👩‍🏫 *Guru pembina:* ${input.teacherName}`,
    `📅 *Hari, tanggal:* ${indonesianDate(input.date)}`,
    `🕐 *Waktu pencatatan:* ${input.time.replace(':', '.')} (waktu sekolah)`,
    `📌 *Status:* ${attendanceStatus(input.status)}`,
    '',
    'Jika ada ketidaksesuaian data, silakan hubungi pihak sekolah. 🙏',
    '',
    '_Pesan ini dikirim otomatis oleh sistem kehadiran sekolah._',
  ].join('\n');
}
