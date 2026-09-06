'use client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { cssVariablesResolver, DEFAULT_COLOR_SCHEME, theme } from '@/config/theme';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme={DEFAULT_COLOR_SCHEME}
    >
      <Notifications />
      {children}
    </MantineProvider>
  );
}
