import { appConfig } from './app-config';

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

export const APP_BRAND_NAME = appConfig.brandName;

export const APP_NAME = appConfig.name;

export const APP_BRAND_ASSETS = appConfig.assets;

const appNamePrefix = `${APP_BRAND_NAME} `;
export const APP_BRAND_SUFFIX = APP_NAME.startsWith(appNamePrefix)
  ? APP_NAME.slice(appNamePrefix.length)
  : '';

export const APP_BRAND_PRIMARY = APP_BRAND_SUFFIX ? APP_BRAND_NAME : APP_NAME;

export const APP_BRAND_SLUG = slug(APP_BRAND_NAME);

// Keep this stable after QR cards have been issued. It separates cards between cloned apps.
export const APP_QR_NAMESPACE = slug(appConfig.qrNamespace);
export const STUDENT_QR_PREFIX = `${APP_QR_NAMESPACE}:checkin:`;
export const TEACHER_QR_PREFIX = `${APP_QR_NAMESPACE}:teacher-checkin:`;
export const COMPLETE_CARD_QR_PATTERN = new RegExp(
  `^${APP_QR_NAMESPACE.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:(?:teacher-)?checkin:[0-9a-f]{48}$`,
  'i',
);
