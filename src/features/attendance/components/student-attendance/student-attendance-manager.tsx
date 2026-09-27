'use client';

import { AttendanceManager } from '@/features/attendance/components/attendance-manager';

export function StudentAttendanceManager({
  writable,
  initialDate,
}: {
  writable: boolean;
  initialDate?: string;
}) {
  return <AttendanceManager kind="lesson" writable={writable} initialDate={initialDate} />;
}
