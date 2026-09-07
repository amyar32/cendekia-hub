'use client';

import { AttendanceManager } from '@/components/attendance/attendance-manager';

export function StudentAttendanceManager({ writable }: { writable: boolean }) {
  return <AttendanceManager kind="lesson" writable={writable} />;
}
