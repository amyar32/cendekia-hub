import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './globals.css';
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core';
import { Providers } from '@/components/providers';
import { DEFAULT_COLOR_SCHEME } from '@/config/theme';
import { APP_NAME } from '@/config/branding';

export const metadata = {
  title: `${APP_NAME} · CMS`,
  description: 'Workspace pengelolaan data yang modular dan terkontrol.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme={DEFAULT_COLOR_SCHEME} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
