import type { TahfidzRecap } from './recap-types';
import { historyActivities, historyResults, historyStatuses } from './history-types';
import { reportExportTheme } from '@/features/reports/export-theme';

export const recapHeaders = [
  'NIS',
  'Nama siswa',
  'Sesi',
  'Hadir',
  'Telat',
  'Sakit',
  'Izin',
  'Alpa',
  'Kehadiran (%)',
  'Hafalan baru',
  'Murajaah',
  'Lancar',
  'Ulang',
  'Belum dinilai',
  'Belum setor',
];
export function recapRows(data: TahfidzRecap) {
  return data.rows.map((row) => [
    row.student_nis,
    row.student_name,
    row.total,
    row.present,
    row.late,
    row.sick,
    row.excused,
    row.absent,
    row.attendance_rate,
    row.new_count,
    row.review_count,
    row.fluent,
    row.repeat,
    row.not_assessed,
    row.not_submitted,
  ]);
}
const detailHeaders = [
  'Tanggal',
  'NIS',
  'Nama siswa',
  'Rombel',
  'Kelompok',
  'Pembimbing',
  'Kehadiran',
  'Kegiatan',
  'Surah',
  'Ayat',
  'Hasil',
  'Sesi',
  'Catatan',
  'Tahun ajaran',
];
function detailRows(data: TahfidzRecap) {
  return (data.records || []).map((row) => [
    row.attendance_date,
    row.student_nis,
    row.student_name,
    row.class_name,
    row.group_name,
    row.teacher_name,
    historyStatuses[row.status],
    historyActivities[row.activity_type],
    row.surah_name || '',
    row.ayah_from && row.ayah_to ? `${row.ayah_from}-${row.ayah_to}` : '',
    historyResults[row.result],
    row.session_status === 'closed' ? 'Ditutup' : 'Terbuka',
    row.note,
    row.academic_year_name,
  ]);
}
export function recapFilterLabels(data: TahfidzRecap) {
  return [
    `Tahun ajaran: ${data.options.academic_years.find((row) => row.value === data.filters.academic_year_id)?.label || 'Semua tahun ajaran'}`,
    `Periode ${data.filters.date_from} s.d. ${data.filters.date_to}`,
    `Kelompok: ${data.options.groups.find((row) => row.value === data.filters.group_id)?.label || 'Semua kelompok'}`,
    `Siswa: ${data.options.students.find((row) => row.value === data.filters.student_id)?.label || 'Semua siswa'}`,
    `Sesi: ${data.filters.session_status === 'closed' ? 'Ditutup' : data.filters.session_status === 'open' ? 'Terbuka (sementara)' : 'Semua (termasuk data sementara)'}`,
  ];
}

export async function createTahfidzExcel(data: TahfidzRecap) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = data.school_name;
  for (const [name, headers, rows] of [
    ['Rekap per siswa', recapHeaders, recapRows(data)],
    ['Detail setoran', detailHeaders, detailRows(data)],
  ] as const) {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow([data.school_name]);
    sheet.addRow(['Rekap Tahfidz']);
    for (const label of recapFilterLabels(data)) sheet.addRow([label]);
    sheet.addRow([
      `Kehadiran = (hadir + telat) / catatan sesi. ${data.summary.sessions} sesi, ${data.summary.students} siswa, ${data.summary.open_sessions} sesi terbuka.`,
    ]);
    for (let row = 1; row <= sheet.rowCount; row++) sheet.mergeCells(row, 1, row, headers.length);
    const heading = sheet.addRow(headers);
    heading.height = 32;
    heading.font = {
      name: reportExportTheme.font.excel,
      bold: true,
      color: { argb: reportExportTheme.excel.surface },
    };
    heading.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: reportExportTheme.excel.brand },
    };
    for (const row of rows) {
      const added = sheet.addRow(row);
      added.height = Math.max(
        22,
        ...row.map(
          (cell, index) =>
            Math.ceil(
              String(cell).length /
                (index === 1 || (name === 'Detail setoran' && index >= 2) ? 25 : 14),
            ) * 15,
        ),
      );
      added.eachCell((cell) => {
        cell.font = {
          name: reportExportTheme.font.excel,
          size: 10,
          color: { argb: reportExportTheme.excel.ink },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb:
              added.number % 2 === 0
                ? reportExportTheme.excel.stripe
                : reportExportTheme.excel.surface,
          },
        };
      });
    }
    sheet.columns.forEach((column, index) => {
      column.width = index === 1 || (name === 'Detail setoran' && index >= 2) ? 28 : 16;
    });
    sheet.views = [{ state: 'frozen', ySplit: heading.number }];
    sheet.autoFilter = {
      from: { row: heading.number, column: 1 },
      to: { row: heading.number, column: headers.length },
    };
    sheet.eachRow((row) => {
      row.alignment = { vertical: 'top', wrapText: true };
    });
    for (let row = 1; row <= 7; row++)
      sheet.getCell(row, 1).font = {
        name: reportExportTheme.font.excel,
        size: row === 1 ? 16 : row === 2 ? 12 : 10,
        bold: row <= 2,
        color: { argb: row <= 2 ? reportExportTheme.excel.ink : reportExportTheme.excel.muted },
      };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: reportExportTheme.excel.brandStrong },
    };
    sheet.getCell('A1').font = {
      name: reportExportTheme.font.excel,
      size: 16,
      bold: true,
      color: { argb: reportExportTheme.excel.surface },
    };
    sheet.getRow(1).height = 28;
    sheet.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
  }
  return workbook.xlsx.writeBuffer();
}

export async function createTahfidzPdf(data: TahfidzRecap) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setFont(reportExportTheme.font.pdf);
  const clean = (value: string | number) =>
    String(value).replace(/[‘’]/g, "'").replace(/[–—]/g, '-');
  const labels = recapFilterLabels(data);
  for (const [index, title, headers, rows] of [
    [0, 'Rekap Tahfidz per siswa', recapHeaders, recapRows(data)],
    [1, 'Detail setoran Tahfidz', detailHeaders, detailRows(data)],
  ] as const) {
    if (index > 0) pdf.addPage();
    pdf.setFontSize(9);
    const schoolLines: string[] = pdf.splitTextToSize(clean(data.school_name), 270);
    const filterLines: string[] = pdf.splitTextToSize(labels.map(clean).join(' | '), 270);
    const top = 20 + schoolLines.length * 4 + filterLines.length * 4;
    autoTable(pdf, {
      head: [headers],
      body: rows.map((row) => row.map(clean)),
      startY: top,
      margin: { top, left: 10, right: 10, bottom: 14 },
      theme: 'plain',
      styles: {
        font: reportExportTheme.font.pdf,
        fontSize: 7.5,
        cellPadding: 1.8,
        overflow: 'linebreak',
        textColor: reportExportTheme.pdf.text,
        lineColor: reportExportTheme.pdf.border,
        lineWidth: 0.15,
      },
      alternateRowStyles: { fillColor: reportExportTheme.pdf.subtle },
      rowPageBreak: 'avoid',
      columnStyles:
        index === 1
          ? Object.fromEntries(
              [20, 20, 24, 14, 22, 23, 17, 17, 22, 12, 17, 13, 36, 20].map((width, column) => [
                column,
                { cellWidth: width },
              ]),
            )
          : { 0: { cellWidth: 25 }, 1: { cellWidth: 35 } },
      headStyles: {
        fillColor: reportExportTheme.pdf.brand,
        textColor: reportExportTheme.pdf.surface,
      },
      didDrawPage: () => {
        pdf.setFontSize(12);
        pdf.setTextColor(...reportExportTheme.pdf.brandStrong);
        pdf.text(title, 10, 10);
        pdf.setFontSize(9);
        pdf.setTextColor(...reportExportTheme.pdf.text);
        pdf.text(schoolLines, 10, 16);
        pdf.setFontSize(8);
        pdf.setTextColor(...reportExportTheme.pdf.muted);
        pdf.text(filterLines, 10, 17 + schoolLines.length * 4);
      },
    });
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setFontSize(7);
    pdf.setTextColor(...reportExportTheme.pdf.muted);
    pdf.text(
      'Kehadiran = (hadir + telat) / catatan sesi; hafalan baru dan murajaah dihitung per catatan.',
      10,
      204,
    );
    pdf.text(`${page}/${pdf.getNumberOfPages()}`, 285, 204, { align: 'right' });
  }
  return pdf.output('arraybuffer');
}
