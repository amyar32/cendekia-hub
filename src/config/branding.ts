function publicValue(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 80) : fallback;
}

export const APP_BRAND_NAME = publicValue(process.env.NEXT_PUBLIC_APP_BRAND_NAME, 'Cendekia');

export const APP_NAME = publicValue(process.env.NEXT_PUBLIC_APP_NAME, 'Cendekia Hub');

const appNamePrefix = `${APP_BRAND_NAME} `;
export const APP_BRAND_SUFFIX = APP_NAME.startsWith(appNamePrefix)
  ? APP_NAME.slice(appNamePrefix.length)
  : '';

export const APP_BRAND_PRIMARY = APP_BRAND_SUFFIX ? APP_BRAND_NAME : APP_NAME;

export const APP_BRAND_SLUG =
  APP_BRAND_NAME.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'app';
