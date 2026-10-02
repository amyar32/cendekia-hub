import { theme } from '@/config/theme';
import type { classicTheme } from '@/config/themes/classic';

type AppColors = { [Key in keyof typeof classicTheme.appColors]: string };
type Rgb = [number, number, number];
const colors = theme.other!.appColors as AppColors;
const argb = (value: string) => `FF${value.replace('#', '').toUpperCase()}`;
const rgb = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

export const reportExportTheme = {
  font: { excel: theme.fontFamily!.split(',')[0].trim(), pdf: 'helvetica' },
  excel: {
    brand: argb(colors.brand),
    brandStrong: argb(colors.brandStrong),
    brandSoft: argb(colors.brandSoft),
    ink: argb(colors.text),
    muted: argb(colors.muted),
    line: argb(colors.border),
    stripe: argb(colors.subtle),
    surface: argb(colors.surface),
    success: argb(colors.successSoft),
    warning: argb(colors.warningSoft),
    danger: argb(colors.dangerSoft),
  },
  pdf: {
    brand: rgb(colors.brand),
    brandStrong: rgb(colors.brandStrong),
    text: rgb(colors.text),
    muted: rgb(colors.muted),
    border: rgb(colors.border),
    subtle: rgb(colors.subtle),
    surface: rgb(colors.surface),
  },
};
