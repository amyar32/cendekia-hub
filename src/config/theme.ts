import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorScheme,
  type MantineTheme,
  type TextProps,
  type TitleProps,
} from '@mantine/core';
import { classicTheme } from './themes/classic';
import { freshTheme } from './themes/fresh';

export const DEFAULT_COLOR_SCHEME: MantineColorScheme = 'light';

export type AppThemeName = 'classic' | 'fresh';

export const APP_THEME_NAME: AppThemeName =
  process.env.NEXT_PUBLIC_APP_THEME === 'fresh' ? 'fresh' : 'classic';

const selectedTheme = APP_THEME_NAME === 'fresh' ? freshTheme : classicTheme;
const appColors = selectedTheme.appColors;
const appShadows = selectedTheme.shadows;

export const theme = createTheme({
  primaryColor: 'brand',
  defaultRadius: 'md',
  cursorType: 'pointer',
  respectReducedMotion: true,
  fontFamily: 'Arial, Helvetica, sans-serif',
  headings: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '30px', lineHeight: '1.2' },
      h2: { fontSize: '26px', lineHeight: '1.25' },
      h3: { fontSize: '15px', lineHeight: '1.35' },
    },
  },
  colors: {
    brand: selectedTheme.brand,
  },
  other: {
    appColors,
    appShadows,
  },
  components: {
    Button: {
      defaultProps: { radius: 'md' },
      styles: {
        root: { fontWeight: 600 },
      },
    },
    Paper: {
      defaultProps: { radius: 'md' },
    },
    Alert: {
      defaultProps: { radius: 'md', variant: 'light' },
    },
    Badge: {
      defaultProps: { variant: 'light', radius: 'sm' },
      styles: { root: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 } },
    },
    InputWrapper: {
      styles: { label: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
        overlayProps: { backgroundOpacity: 0.38, blur: 4 },
        transitionProps: { transition: 'pop', duration: 180 },
      },
      styles: {
        content: {
          border: `1px solid ${appColors.border}`,
          boxShadow: '0 24px 70px rgba(56, 44, 38, 0.18)',
        },
        header: {
          borderBottom: `1px solid ${appColors.border}`,
          padding: '20px 24px',
        },
        title: {
          color: appColors.text,
          fontSize: '17px',
          fontWeight: 700,
        },
        body: { padding: '24px' },
        close: { borderRadius: '50%' },
      },
    },
    NavLink: {
      styles: {
        root: {
          borderRadius: '7px',
          color: appColors.mutedStrong,
          fontSize: '12px',
          fontWeight: 500,
          marginBottom: '5px',
          padding: '10px 13px',
        },
        label: { fontSize: '12px' },
      },
    },
    Table: {
      defaultProps: { verticalSpacing: 'md', horizontalSpacing: 'lg', highlightOnHover: true },
      styles: {
        th: {
          background: appColors.subtle,
          color: appColors.muted,
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
        },
        td: { fontSize: 'var(--app-table-font-size)', lineHeight: 1.5 },
      },
    },
    Title: {
      styles: (_theme: MantineTheme, props: TitleProps) => ({
        root: {
          letterSpacing: props.order === 1 ? '-1px' : props.order === 2 ? '-0.6px' : undefined,
        },
      }),
    },
    Text: {
      styles: (_theme: MantineTheme, props: TextProps) => {
        const variants: Record<string, React.CSSProperties> = {
          eyebrow: {
            color: appColors.muted,
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1.8px',
          },
          description: {
            color: appColors.muted,
            fontSize: '12px',
            lineHeight: 1.7,
          },
          caption: { color: appColors.mutedSoft, fontSize: '10px' },
          label: { color: appColors.mutedStrong, fontSize: '11px' },
        };

        return { root: variants[props.variant || ''] };
      },
    },
  },
});

/** Makes application-specific theme tokens available to plain CSS. */
export const cssVariablesResolver: CSSVariablesResolver = (resolvedTheme) => ({
  variables: {
    '--app-table-font-size': '12px',
    '--app-color-background': resolvedTheme.other.appColors.background,
    '--app-color-surface': resolvedTheme.other.appColors.surface,
    '--app-color-text': resolvedTheme.other.appColors.text,
    '--app-color-muted': resolvedTheme.other.appColors.muted,
    '--app-color-border': resolvedTheme.other.appColors.border,
    '--app-color-brand': resolvedTheme.other.appColors.brand,
    '--app-color-brand-strong': resolvedTheme.other.appColors.brandStrong,
    '--app-color-brand-soft': resolvedTheme.other.appColors.brandSoft,
    '--app-color-muted-strong': resolvedTheme.other.appColors.mutedStrong,
    '--app-color-muted-soft': resolvedTheme.other.appColors.mutedSoft,
    '--app-color-subtle': resolvedTheme.other.appColors.subtle,
    '--app-color-success': resolvedTheme.other.appColors.success,
    '--app-color-success-soft': resolvedTheme.other.appColors.successSoft,
    '--app-color-warning': resolvedTheme.other.appColors.warning,
    '--app-color-warning-soft': resolvedTheme.other.appColors.warningSoft,
    '--app-color-danger': resolvedTheme.other.appColors.danger,
    '--app-color-danger-soft': resolvedTheme.other.appColors.dangerSoft,
    '--app-shadow-card': resolvedTheme.other.appShadows.card,
    '--app-shadow-elevated': resolvedTheme.other.appShadows.elevated,
  },
  light: { '--mantine-color-default-border': resolvedTheme.other.appColors.border },
  dark: {},
});
