import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleCellSummary } from '../src/features/schedules/cell-summary';

test('thirty simultaneous halaqah groups become one bounded timetable summary', () => {
  const entries = Array.from({ length: 30 }, (_, index) => ({
    assignment_id: `group-${index}`,
    entry_type: 'tahfidz' as const,
    entry_name: `Halaqah ${index + 1}`,
  }));
  assert.deepEqual(scheduleCellSummary(entries), [
    { kind: 'tahfidz', count: 30, title: 'Tahfidz · 30 kelompok', label: 'Tahfidz' },
  ]);
  // Repeated rows for the same group do not inflate the displayed count.
  assert.equal(scheduleCellSummary([...entries, entries[0]])[0].count, 30);
});
test('mixed slots keep lessons visible and group extracurriculars without listing every name', () => {
  const entries = [
    { assignment_id: 'lesson', entry_type: 'lesson' as const, entry_name: 'Matematika' },
    { assignment_id: 'group', entry_type: 'tahfidz' as const, entry_name: 'Halaqah A' },
    ...['Pramuka', 'Futsal', 'Seni'].map((name, index) => ({
      assignment_id: `extra-${index}`,
      entry_type: 'extracurricular' as const,
      entry_name: name,
    })),
  ];
  const summary = scheduleCellSummary(entries);
  assert.deepEqual(
    summary.map((item) => item.title),
    ['Matematika', 'Tahfidz · 1 kelompok', 'Pramuka, Futsal (+1)'],
  );
  assert.deepEqual(scheduleCellSummary([]), []);
});
