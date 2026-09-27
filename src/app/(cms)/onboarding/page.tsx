import { AccessDenied } from '@/components/cms/access-denied/access-denied';
import {
  OnboardingManager,
  type OnboardingData,
} from '@/features/onboarding/components/onboarding-manager';
import { can } from '@/config/modules';
import { currentUser } from '@/lib/auth';
import { onboardingState } from '@/features/onboarding/server/handlers';

const writePermissions = [
  'school.write',
  'grades.write',
  'subjects.write',
  'extracurriculars.write',
  'academic-years.write',
  'schedules.write',
  'teachers.write',
  'students.write',
  'classes.write',
  'teaching-assignments.write',
  'homeroom-assignments.write',
  'extracurricular-assignments.write',
] as const;

export default async function Page() {
  const user = (await currentUser())!;
  if (!can(user.permissions, 'school.read')) return <AccessDenied />;
  return (
    <OnboardingManager
      initialData={onboardingState() as unknown as OnboardingData}
      writable={writePermissions.every((permission) => can(user.permissions, permission))}
    />
  );
}
