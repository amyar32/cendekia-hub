import cendekia from './apps/cendekia.json';
import myppi from './apps/myppi.json';

export type AppThemeName = 'classic' | 'fresh';
const variants = { cendekia, myppi };
type ConfigEnv = Record<string, string | undefined>;

export function resolveAppConfig(env: ConfigEnv = {}) {
  const variant = env.APP_VARIANT?.trim() || env.NEXT_PUBLIC_APP_VARIANT?.trim() || 'cendekia';
  if (!Object.prototype.hasOwnProperty.call(variants, variant)) {
    throw new Error(`APP_VARIANT "${variant}" tidak tersedia. Pilih cendekia atau myppi.`);
  }
  const preset = variants[variant as keyof typeof variants];
  const inputNumber =
    variant === 'myppi' ? (env.APP_PPI_NUMBER ?? env.NEXT_PUBLIC_APP_PPI_NUMBER)?.trim() || '' : '';
  if (
    inputNumber &&
    (!/^\d+$/.test(inputNumber) ||
      !Number.isSafeInteger(Number(inputNumber)) ||
      Number(inputNumber) <= 0)
  ) {
    throw new Error('APP_PPI_NUMBER harus angka bulat positif, misalnya 38.');
  }
  const ppiNumber = inputNumber ? String(Number(inputNumber)) : '';
  const name = ppiNumber ? `${preset.name} ${ppiNumber}` : preset.name;
  const theme = env.NEXT_PUBLIC_APP_THEME?.trim() || preset.theme;
  if (theme !== 'classic' && theme !== 'fresh') {
    throw new Error('NEXT_PUBLIC_APP_THEME harus classic atau fresh.');
  }
  return {
    ...preset,
    ppiNumber,
    theme: theme as AppThemeName,
    brandName:
      env.NEXT_PUBLIC_APP_BRAND_NAME?.trim().slice(0, 80) || (ppiNumber ? name : preset.brandName),
    name: env.NEXT_PUBLIC_APP_NAME?.trim().slice(0, 80) || name,
    qrNamespace:
      env.NEXT_PUBLIC_APP_QR_NAMESPACE?.trim().slice(0, 80) ||
      (ppiNumber ? `${preset.qrNamespace}-${ppiNumber}` : preset.qrNamespace),
  };
}

// Next exposes the selector to browser bundles; scripts read APP_VARIANT directly.
// Explicit property access lets Next inline the public values at build time.
export const appConfig = resolveAppConfig({
  APP_VARIANT: process.env.NEXT_PUBLIC_APP_VARIANT || process.env.APP_VARIANT,
  APP_PPI_NUMBER: process.env.NEXT_PUBLIC_APP_PPI_NUMBER ?? process.env.APP_PPI_NUMBER,
  NEXT_PUBLIC_APP_THEME: process.env.NEXT_PUBLIC_APP_THEME,
  NEXT_PUBLIC_APP_BRAND_NAME: process.env.NEXT_PUBLIC_APP_BRAND_NAME,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_QR_NAMESPACE: process.env.NEXT_PUBLIC_APP_QR_NAMESPACE,
});
