import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import './global.css';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { cssVariablesResolver, theme } from './theme';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="auto">
      {children}
    </MantineProvider>
  );
}
