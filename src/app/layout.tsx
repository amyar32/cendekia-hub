import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './globals.css';
import { mantineHtmlProps } from '@mantine/core';
import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { APP_BRAND_ASSETS, APP_NAME } from '@/config/branding';

export const metadata: Metadata = {
  title: `${APP_NAME} · CMS`,
  description: 'Workspace pengelolaan data yang modular dan terkontrol.',
  icons: { icon: APP_BRAND_ASSETS.icon, apple: APP_BRAND_ASSETS.icon },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" {...mantineHtmlProps}>
      <head />
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
