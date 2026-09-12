import { randomBytes, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { checkOrigin, HttpError, requireUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { failure } from '@/lib/http';

export const runtime = 'nodejs';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
type Level = 'sd' | 'smp' | 'sma';
type ImportRow = {
  sheet: 'Guru' | 'Murid';
  row: number;
  status: 'valid' | 'warning' | 'error';
  messages: string[];
  data: Record<string, string | number | boolean>;
};
const teacherImportSchema = z.object({
  kode_pegawai: z.string().trim().min(1).max(30),
  nip: z.string().trim().max(30),
  nama: z.string().trim().min(2).max(100),
  gender: z.enum(['male', 'female']),
  golongan_darah: z.enum(['', 'A', 'B', 'AB', 'O']),
  email: z.email('Email guru wajib diisi dan harus valid.'),
  telepon: z.string().trim().max(30),
  employment_status: z.enum(['permanent', 'contract', 'honorary']),
});
const studentImportSchema = z.object({
  nis: z.string().trim().min(1).max(30),
  nisn: z.string().trim().max(30),
  nama: z.string().trim().min(2).max(100),
  gender: z.enum(['male', 'female']),
  golongan_darah: z.enum(['', 'A', 'B', 'AB', 'O']),
  tanggal_lahir: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  tempat_lahir: z.string().trim().max(100),
  nama_rombel: z.string().trim().min(1).max(50),
  nama_wali: z.string().trim().max(100),
  telepon_wali: z.string().trim().max(30),
});

function value(cell: ExcelJS.Cell) {
  const raw = cell.value;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (raw && typeof raw === 'object') {
    if ('result' in raw) return String(raw.result ?? '').trim();
    if ('text' in raw) return String(raw.text ?? '').trim();
    if ('richText' in raw)
      return raw.richText
        .map((part) => part.text)
        .join('')
        .trim();
  }
  return String(raw ?? '').trim();
}

function sheetRows(sheet: ExcelJS.Worksheet, headers: string[]) {
  const actual = headers.map((_, index) => value(sheet.getRow(1).getCell(index + 1)).toLowerCase());
  if (actual.some((header, index) => header !== headers[index]))
    throw new HttpError(400, `Kolom sheet ${sheet.name} tidak sesuai template terbaru.`);
  const rows: Array<{ row: number; data: Record<string, string> }> = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const data = Object.fromEntries(
      headers.map((header, index) => [header, value(row.getCell(index + 1))]),
    );
    if (Object.values(data).some(Boolean)) rows.push({ row: number, data });
  });
  return rows;
}

function normalizeGender(value: string) {
  const normalized = value.toLowerCase();
  if (['l', 'laki-laki', 'laki laki', 'male'].includes(normalized)) return 'male';
  if (['p', 'perempuan', 'female'].includes(normalized)) return 'female';
  return '';
}

function normalizeEmployment(value: string) {
  const normalized = value.toLowerCase();
  if (['tetap', 'permanent'].includes(normalized)) return 'permanent';
  if (['kontrak', 'contract'].includes(normalized)) return 'contract';
  if (['honorer', 'honorary'].includes(normalized)) return 'honorary';
  return '';
}

function normalizeBloodType(value: string) {
  const normalized = value.toUpperCase();
  return ['', 'A', 'B', 'AB', 'O'].includes(normalized) ? normalized : '';
}

function validateWorkbook(workbook: ExcelJS.Workbook, schoolId: string, academicYearId: string) {
  const teacherSheet = workbook.getWorksheet('Guru');
  const studentSheet = workbook.getWorksheet('Murid');
  if (!teacherSheet || !studentSheet)
    throw new HttpError(400, 'Workbook harus memiliki sheet Guru dan Murid.');
  const existingClasses = db()
    .prepare('SELECT id,name FROM classes WHERE school_id=? AND academic_year_id=?')
    .all(schoolId, academicYearId) as Array<{ id: string; name: string }>;
  const classNames = new Set(existingClasses.map((row) => row.name.toLowerCase()));
  const employeeCodes = new Set<string>();
  const studentNumbers = new Set<string>();
  const result: ImportRow[] = [];

  for (const source of sheetRows(teacherSheet, [
    'kode_pegawai',
    'nip',
    'nama',
    'jenis_kelamin',
    'golongan_darah',
    'email',
    'telepon',
    'status_kepegawaian',
  ])) {
    const messages: string[] = [];
    const code = source.data.kode_pegawai.toUpperCase();
    const gender = normalizeGender(source.data.jenis_kelamin);
    const bloodType = normalizeBloodType(source.data.golongan_darah);
    const employment = normalizeEmployment(source.data.status_kepegawaian);
    if (!code) messages.push('Kode Guru wajib diisi.');
    if (!source.data.nama) messages.push('Nama guru wajib diisi.');
    if (!gender) messages.push('Jenis kelamin harus Laki-laki atau Perempuan.');
    if (source.data.golongan_darah && !bloodType)
      messages.push('Golongan darah harus A, B, AB, atau O.');
    if (!employment) messages.push('Status harus Tetap, Kontrak, atau Honorer.');
    if (!source.data.email) messages.push('Email guru wajib diisi.');
    else if (!z.email().safeParse(source.data.email).success)
      messages.push('Format email tidak valid.');
    if (employeeCodes.has(code)) messages.push('Kode Guru duplikat di workbook.');
    employeeCodes.add(code);
    const exists = db()
      .prepare('SELECT id FROM teachers WHERE school_id=? AND employee_code=?')
      .get(schoolId, code);
    result.push({
      sheet: 'Guru',
      row: source.row,
      status: messages.length ? 'error' : exists ? 'warning' : 'valid',
      messages: messages.length ? messages : exists ? ['Guru sudah ada dan akan dilewati.'] : [],
      data: {
        ...source.data,
        kode_pegawai: code,
        gender,
        golongan_darah: bloodType,
        employment_status: employment,
      },
    });
  }

  for (const source of sheetRows(studentSheet, [
    'nis',
    'nisn',
    'nama',
    'jenis_kelamin',
    'golongan_darah',
    'tanggal_lahir',
    'tempat_lahir',
    'nama_rombel',
    'nama_wali',
    'telepon_wali',
  ])) {
    const messages: string[] = [];
    const nis = source.data.nis.toUpperCase();
    const gender = normalizeGender(source.data.jenis_kelamin);
    const bloodType = normalizeBloodType(source.data.golongan_darah);
    const classroomName = source.data.nama_rombel.toLowerCase();
    if (!nis) messages.push('NIS wajib diisi.');
    if (!source.data.nama) messages.push('Nama murid wajib diisi.');
    if (!gender) messages.push('Jenis kelamin harus Laki-laki atau Perempuan.');
    if (source.data.golongan_darah && !bloodType)
      messages.push('Golongan darah harus A, B, AB, atau O.');
    if (!classroomName || !classNames.has(classroomName))
      messages.push('Nama rombel tidak ditemukan.');
    if (source.data.tanggal_lahir && !/^\d{4}-\d{2}-\d{2}$/.test(source.data.tanggal_lahir))
      messages.push('Tanggal lahir harus berformat YYYY-MM-DD.');
    if (studentNumbers.has(nis)) messages.push('NIS duplikat di workbook.');
    studentNumbers.add(nis);
    const exists = db()
      .prepare('SELECT id FROM students WHERE school_id=? AND nis=?')
      .get(schoolId, nis);
    result.push({
      sheet: 'Murid',
      row: source.row,
      status: messages.length ? 'error' : exists ? 'warning' : 'valid',
      messages: messages.length ? messages : exists ? ['Murid sudah ada dan akan dilewati.'] : [],
      data: { ...source.data, nis, gender, golongan_darah: bloodType },
    });
  }
  return result;
}

function styleSheet(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE15F37' } };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 24;
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  sheet.autoFilter = { from: 'A1', to: sheet.getRow(1).getCell(widths.length).address };
}

function simulationNames() {
  const first = [
    'Alya',
    'Bagas',
    'Citra',
    'Dimas',
    'Eka',
    'Farhan',
    'Gina',
    'Hendra',
    'Indah',
    'Joko',
  ];
  const last = ['Safitri', 'Pramudya', 'Maharani', 'Saputra', 'Wulandari'];
  return Array.from(
    { length: 50 },
    (_, index) => `${first[index % first.length]} ${last[Math.floor(index / first.length)]}`,
  );
}

async function template(level: Level, simulation: boolean, classroomNames: string[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cendekia Hub';
  const guide = workbook.addWorksheet('Petunjuk');
  guide.addRows([
    ['Template Import Onboarding Cendekia Hub'],
    ['1. Jangan mengubah nama sheet atau judul kolom.'],
    ['2. Nama rombel harus sama persis dengan rombel yang dibuat pada langkah sebelumnya.'],
    ['3. Tanggal menggunakan format YYYY-MM-DD.'],
    ['4. Lakukan preview di aplikasi sebelum mengimpor.'],
    ['5. Baris yang sudah ada akan dilewati, bukan ditimpa.'],
  ]);
  guide.getColumn(1).width = 86;
  guide.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFE15F37' } };

  const teacher = workbook.addWorksheet('Guru');
  teacher.addRow([
    'kode_pegawai',
    'nip',
    'nama',
    'jenis_kelamin',
    'golongan_darah',
    'email',
    'telepon',
    'status_kepegawaian',
  ]);
  const teacherNames = [
    'Ahmad Fauzi',
    'Dewi Lestari',
    'Rizky Pratama',
    'Nadia Putri',
    'Fajar Hidayat',
    'Intan Permata',
    'Budi Santoso',
    'Siti Rahmawati',
    'Arif Nugroho',
    'Maya Anggraini',
    'Dedi Kurniawan',
    'Ratna Sari',
    'Yoga Prabowo',
    'Nur Aisyah',
    'Agus Setiawan',
  ];
  if (simulation)
    teacherNames.forEach((name, index) =>
      teacher.addRow([
        `G${String(index + 1).padStart(3, '0')}`,
        `198${index % 10}0101201${index % 10}01100${index % 9}`,
        `${name}, S.Pd.`,
        index % 2 ? 'Perempuan' : 'Laki-laki',
        ['A', 'B', 'AB', 'O'][index % 4],
        `guru${index + 1}@simulasi.sch.id`,
        `08123456${String(index).padStart(4, '0')}`,
        index % 5 === 0 ? 'Honorer' : index % 4 === 0 ? 'Kontrak' : 'Tetap',
      ]),
    );
  styleSheet(teacher, [16, 24, 30, 18, 18, 32, 18, 22]);

  const student = workbook.addWorksheet('Murid');
  student.addRow([
    'nis',
    'nisn',
    'nama',
    'jenis_kelamin',
    'golongan_darah',
    'tanggal_lahir',
    'tempat_lahir',
    'nama_rombel',
    'nama_wali',
    'telepon_wali',
  ]);
  if (simulation)
    simulationNames().forEach((name, index) =>
      student.addRow([
        `2026${String(index + 1).padStart(4, '0')}`,
        `0098${String(100000 + index)}`,
        name,
        index % 2 ? 'Laki-laki' : 'Perempuan',
        ['A', 'B', 'AB', 'O'][index % 4],
        `${level === 'sd' ? 2015 : level === 'smp' ? 2012 : 2009}-${String((index % 9) + 1).padStart(2, '0')}-15`,
        'Bandung',
        classroomNames[index % classroomNames.length],
        `Bapak/Ibu ${name.split(' ')[0]}`,
        `08137765${String(index).padStart(4, '0')}`,
      ]),
    );
  styleSheet(student, [16, 18, 28, 18, 18, 18, 20, 20, 28, 20]);
  return workbook.xlsx.writeBuffer();
}

function context() {
  const school = db()
    .prepare('SELECT id,education_level FROM schools ORDER BY is_active DESC,created_at LIMIT 1')
    .get() as { id: string; education_level: string } | undefined;
  if (!school) throw new HttpError(409, 'Simpan profil sekolah terlebih dahulu.');
  const year = db()
    .prepare('SELECT id,start_date FROM academic_years WHERE school_id=? AND is_active=1')
    .get(school.id) as { id: string; start_date: string } | undefined;
  if (!year) throw new HttpError(409, 'Aktifkan tahun ajaran terlebih dahulu.');
  return { school, year };
}

async function requireImportAccess() {
  const actor = await requireUser('teachers.write');
  await requireUser('students.write');
  return actor;
}

export async function GET(request: Request) {
  try {
    await requireUser('school.read');
    const { school, year } = context();
    const url = new URL(request.url);
    const requested = url.searchParams.get('level');
    const level: Level =
      requested === 'sd' || requested === 'smp' || requested === 'sma' ? requested : 'sma';
    const simulation = url.searchParams.get('simulation') === '1';
    const classrooms = db()
      .prepare(
        'SELECT name FROM classes WHERE school_id=? AND academic_year_id=? AND is_active=1 ORDER BY name',
      )
      .all(school.id, year.id) as Array<{ name: string }>;
    if (simulation && !classrooms.length)
      throw new HttpError(409, 'Buat minimal satu rombel sebelum mengunduh data simulasi.');
    const bytes = await template(
      level,
      simulation,
      classrooms.map((classroom) => classroom.name),
    );
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cendekia-${url.searchParams.get('simulation') === '1' ? 'simulasi' : 'template'}-${level}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireImportAccess();
    const { school, year } = context();
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File) || !file.size) throw new HttpError(400, 'Pilih file Excel.');
      if (file.size > MAX_FILE_SIZE) throw new HttpError(413, 'Ukuran file maksimal 5 MB.');
      if (!file.name.toLowerCase().endsWith('.xlsx'))
        throw new HttpError(415, 'File harus berformat .xlsx.');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const rows = validateWorkbook(workbook, school.id, year.id);
      return Response.json({
        rows,
        summary: {
          total: rows.length,
          valid: rows.filter((row) => row.status === 'valid').length,
          warning: rows.filter((row) => row.status === 'warning').length,
          error: rows.filter((row) => row.status === 'error').length,
        },
      });
    }

    const input = z
      .object({
        action: z.literal('commit'),
        rows: z
          .array(
            z.object({
              sheet: z.enum(['Guru', 'Murid']),
              row: z.number().int(),
              status: z.enum(['valid', 'warning', 'error']),
              messages: z.array(z.string()),
              data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
            }),
          )
          .max(2000),
      })
      .parse(await request.json());
    if (input.rows.some((row) => row.status === 'error'))
      throw new HttpError(400, 'Perbaiki seluruh baris error sebelum mengimpor.');
    const created = { teachers: 0, students: 0, placements: 0 };
    db().transaction(() => {
      for (const row of input.rows.filter(
        (item) => item.sheet === 'Guru' && item.status === 'valid',
      )) {
        const data = teacherImportSchema.parse(row.data);
        if (
          db()
            .prepare('SELECT id FROM teachers WHERE school_id=? AND employee_code=?')
            .get(school.id, data.kode_pegawai)
        )
          continue;
        db()
          .prepare(
            `INSERT INTO teachers(id,school_id,user_id,photo_url,employee_code,nip,name,gender,
                      birth_date,blood_type,phone,email,address,join_date,employment_status,is_active,qr_token)
                      VALUES(?,?,NULL,'',?,?,?,?,NULL,?,?,?, '',NULL,?,1,?)`,
          )
          .run(
            randomUUID(),
            school.id,
            data.kode_pegawai,
            data.nip,
            data.nama,
            data.gender,
            data.golongan_darah,
            data.telepon,
            String(data.email).toLowerCase(),
            data.employment_status,
            randomBytes(24).toString('hex'),
          );
        created.teachers++;
      }
      for (const row of input.rows.filter(
        (item) => item.sheet === 'Murid' && item.status === 'valid',
      )) {
        const data = studentImportSchema.parse(row.data);
        if (
          db()
            .prepare('SELECT id FROM students WHERE school_id=? AND nis=?')
            .get(school.id, data.nis)
        )
          continue;
        const classroom = db()
          .prepare(
            'SELECT id FROM classes WHERE school_id=? AND academic_year_id=? AND lower(name)=lower(?)',
          )
          .get(school.id, year.id, data.nama_rombel) as { id: string } | undefined;
        if (!classroom)
          throw new HttpError(400, `Rombel untuk baris murid ${row.row} tidak ditemukan.`);
        const studentId = randomUUID();
        db()
          .prepare(
            `INSERT INTO students(id,school_id,photo_url,nis,nisn,name,gender,birth_date,birth_place,
                      blood_type,address,phone,email,enrollment_date,is_active,qr_token)
                      VALUES(?,?,'',?,?,?,?,?,?,?,'','','',?,1,?)`,
          )
          .run(
            studentId,
            school.id,
            data.nis,
            data.nisn,
            data.nama,
            data.gender,
            data.tanggal_lahir || null,
            data.tempat_lahir,
            data.golongan_darah,
            year.start_date,
            randomBytes(24).toString('hex'),
          );
        if (data.nama_wali)
          db()
            .prepare(
              `INSERT INTO guardians(id,student_id,name,relation,phone,email,address,is_primary)
                        VALUES(?,?,?,'Orang tua',?,'','',1)`,
            )
            .run(randomUUID(), studentId, data.nama_wali, data.telepon_wali);
        db()
          .prepare(
            `INSERT INTO class_memberships(id,student_id,class_id,academic_year_id,start_date,status)
                      VALUES(?,?,?,?,?,'active')`,
          )
          .run(randomUUID(), studentId, classroom.id, year.id, year.start_date);
        created.students++;
        created.placements++;
      }
      audit(actor.email, 'import', 'onboarding', school.id, created);
    })();
    return Response.json({ ok: true, created });
  } catch (error) {
    return failure(error);
  }
}
