'use client';

import { AttendanceManager } from '@/features/attendance/components/attendance-manager';

export function ExtracurricularAttendanceManager({ writable }: { writable: boolean }) {
  return <AttendanceManager kind="extracurricular" writable={writable} />;
}
