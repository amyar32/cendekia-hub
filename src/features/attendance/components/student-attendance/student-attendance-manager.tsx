'use client';

import { AttendanceManager } from '@/features/attendance/components/attendance-manager';

export function StudentAttendanceManager({ writable }: { writable: boolean }) {
  return <AttendanceManager kind="lesson" writable={writable} />;
}
