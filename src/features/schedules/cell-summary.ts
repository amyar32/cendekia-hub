type CellEntry = {
  assignment_id: string;
  entry_type: 'lesson' | 'extracurricular' | 'tahfidz';
  entry_name: string;
};

export function scheduleCellSummary(entries: CellEntry[]) {
  const kinds = [
    ['lesson', 'Pelajaran'],
    ['tahfidz', 'Tahfidz'],
    ['extracurricular', 'Ekstrakurikuler'],
  ] as const;
  return kinds.flatMap(([kind, label]) => {
    const matching = [
      ...new Map(
        entries
          .filter((entry) => entry.entry_type === kind)
          .map((entry) => [entry.assignment_id, entry]),
      ).values(),
    ];
    if (!matching.length) return [];
    const names = [...new Set(matching.map((entry) => entry.entry_name))];
    return [
      {
        kind,
        count: matching.length,
        title:
          kind === 'tahfidz'
            ? `${label} · ${matching.length} kelompok`
            : `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` (+${names.length - 2})` : ''}`,
        label,
      },
    ];
  });
}
