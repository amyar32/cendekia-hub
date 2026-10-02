import { Badge, Stack, Text } from '@mantine/core';
import { scheduleCellSummary } from '../cell-summary';

export function ScheduleCellContent({
  entries,
  view,
}: {
  entries: {
    assignment_id: string;
    entry_type: 'lesson' | 'extracurricular' | 'tahfidz';
    entry_name: string;
    teacher_name: string;
    class_name: string;
    entry_code: string;
  }[];
  view: 'class' | 'teacher';
}) {
  const summaries = scheduleCellSummary(entries);
  return (
    <Stack gap={4}>
      {summaries.map((summary) => (
        <Text key={summary.kind} fw={700} size="xs" lineClamp={2}>
          {summary.title}
        </Text>
      ))}
      <Text variant="caption" lineClamp={1}>
        {entries.length > 1 || summaries.some((item) => item.kind === 'tahfidz')
          ? 'Lihat rincian kegiatan'
          : view === 'class'
            ? entries[0].teacher_name
            : entries[0].class_name}
      </Text>
      <Badge
        size="xs"
        variant="light"
        color={summaries.every((item) => item.kind === 'tahfidz') ? 'teal' : undefined}
      >
        {summaries.length > 1 ? `${entries.length} kegiatan` : summaries[0]?.label}
      </Badge>
    </Stack>
  );
}
