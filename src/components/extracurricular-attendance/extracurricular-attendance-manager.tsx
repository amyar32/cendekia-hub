'use client';

import { AttendanceManager } from '@/components/attendance/attendance-manager';

export function ExtracurricularAttendanceManager({ writable }: { writable: boolean }) {
  return <AttendanceManager kind="extracurricular" writable={writable} />;
}
