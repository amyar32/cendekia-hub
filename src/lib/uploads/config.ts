import type { Permission } from '@/config/modules';

export const uploadScopes = {
  'school.logo': {
    readPermission: 'school.read',
    writePermission: 'school.write',
    public: true,
    maxBytes: 5 * 1024 * 1024,
    kind: 'image',
  },
  'school.principal-signature': {
    readPermission: 'school.read',
    writePermission: 'school.write',
    public: true,
    maxBytes: 5 * 1024 * 1024,
    kind: 'image',
  },
  'teacher.photo': {
    readPermission: 'teachers.read',
    writePermission: 'teachers.write',
    public: false,
    maxBytes: 5 * 1024 * 1024,
    kind: 'image',
  },
  'student.photo': {
    readPermission: 'students.read',
    writePermission: 'students.write',
    public: false,
    maxBytes: 5 * 1024 * 1024,
    kind: 'image',
  },
  'student.document': {
    readPermission: 'students.read',
    writePermission: 'students.write',
    public: false,
    maxBytes: 10 * 1024 * 1024,
    kind: 'document',
  },
  'admission.document': {
    readPermission: 'admissions.read',
    writePermission: 'admissions.write',
    public: false,
    maxBytes: 10 * 1024 * 1024,
    kind: 'document',
  },
  'admission.photo': {
    readPermission: 'admissions.read',
    writePermission: 'admissions.write',
    public: false,
    maxBytes: 5 * 1024 * 1024,
    kind: 'image',
  },
  'schedule.bell-audio': {
    readPermission: null,
    writePermission: 'schedules.write',
    public: false,
    maxBytes: 10 * 1024 * 1024,
    kind: 'audio',
  },
} as const satisfies Record<
  string,
  {
    readPermission: Permission | null;
    writePermission: Permission;
    public: boolean;
    maxBytes: number;
    kind: 'image' | 'document' | 'audio';
  }
>;

export type UploadScope = keyof typeof uploadScopes;

export type UploadRow = {
  id: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  size: number;
  scope: UploadScope;
  created_by: string;
  created_at: string;
};

export function isUploadScope(value: string): value is UploadScope {
  return Object.hasOwn(uploadScopes, value);
}
