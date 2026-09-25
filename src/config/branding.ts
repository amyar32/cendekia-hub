function publicValue(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 80) : fallback;
}

function slug(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'app'
  );
}

export const APP_BRAND_NAME = publicValue(process.env.NEXT_PUBLIC_APP_BRAND_NAME, 'Cendekia');

export const APP_NAME = publicValue(process.env.NEXT_PUBLIC_APP_NAME, 'Cendekia Hub');

// Each clone replaces these files while keeping their stable public paths.
export const APP_BRAND_ASSETS = {
  logo: '/branding/logo.png',
  icon: '/branding/icon.png',
} as const;

const appNamePrefix = `${APP_BRAND_NAME} `;
export const APP_BRAND_SUFFIX = APP_NAME.startsWith(appNamePrefix)
  ? APP_NAME.slice(appNamePrefix.length)
  : '';

export const APP_BRAND_PRIMARY = APP_BRAND_SUFFIX ? APP_BRAND_NAME : APP_NAME;

export const APP_BRAND_SLUG = slug(APP_BRAND_NAME);

// Keep this stable after QR cards have been issued. It separates cards between cloned apps.
export const APP_QR_NAMESPACE = slug(
  publicValue(process.env.NEXT_PUBLIC_APP_QR_NAMESPACE, APP_BRAND_SLUG),
);
export const STUDENT_QR_PREFIX = `${APP_QR_NAMESPACE}:checkin:`;
export const TEACHER_QR_PREFIX = `${APP_QR_NAMESPACE}:teacher-checkin:`;
export const COMPLETE_CARD_QR_PATTERN = new RegExp(
  `^${APP_QR_NAMESPACE.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:(?:teacher-)?checkin:[0-9a-f]{48}$`,
  'i',
);
