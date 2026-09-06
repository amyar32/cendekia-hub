import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorScheme,
  type MantineTheme,
  type TextProps,
  type TitleProps,
} from '@mantine/core';

export const DEFAULT_COLOR_SCHEME: MantineColorScheme = 'light';

const appColors = {
  background: '#faf9f8',
  surface: '#ffffff',
  text: '#58595b',
  muted: '#858587',
  border: '#ebe7e4',
  brand: '#e15f37',
  brandStrong: '#c94e29',
  brandSoft: '#fcefe9',
  mutedStrong: '#68696b',
  mutedSoft: '#9a9a9c',
  subtle: '#faf8f7',
} as const;

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
    brand: [
      '#fff4f0',
      '#ffe4da',
      '#ffc6b4',
      '#fda68c',
      '#f98767',
      '#ee714d',
      '#e15f37',
      '#c94e29',
      '#a93d1f',
      '#8b3018',
    ],
  },
  other: {
    appColors,
  },
  components: {
    Button: {
      defaultProps: { radius: 'md' },
      styles: {
        root: { fontWeight: 500 },
      },
    },
    Paper: {
      defaultProps: { radius: 'md' },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
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
      styles: {
        th: {
          background: appColors.subtle,
          color: appColors.muted,
          fontSize: '9px',
          letterSpacing: '1px',
        },
        td: { fontSize: '12px' },
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
  },
  light: {},
  dark: {},
});
