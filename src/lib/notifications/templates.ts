export type StudentCheckinTemplateData = {
  schoolName: string;
  studentName: string;
  date: string;
  time: string;
  status: 'present' | 'late' | 'absent';
};

export function studentCheckinMessage(input: StudentCheckinTemplateData) {
  // The input is a school-local calendar date, not a UTC check-in timestamp.
  const date = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${input.date}T00:00:00Z`));
  const status =
    input.status === 'late'
      ? '⏰ *Hadir terlambat*'
      : input.status === 'absent'
        ? '❌ *Tidak hadir*'
        : '✅ *Hadir*';
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
