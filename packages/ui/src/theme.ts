import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';
import { dark, fonts, light, primaryScale, radius, toCssVars } from './tokens';

export const theme = createTheme({
  primaryColor: 'yutis',
  primaryShade: { light: 6, dark: 4 },
  // Dark mode's primary is a light teal, so text on it must turn dark.
  autoContrast: true,
  colors: {
    yutis: [...primaryScale] as unknown as MantineColorsTuple,
    // Navy-tinted dark palette so dark mode matches the sidebar instead of Mantine's neutral grey.
    dark: ['#E6EBF2', '#C2CCDA', '#98A3B5', '#6C788C', '#3A475C', '#243044', '#121A26', '#0B111A', '#070C14', '#04070C'],
  },
  fontFamily: fonts.sans,
  fontFamilyMonospace: fonts.mono,
  headings: { fontFamily: fonts.sans, fontWeight: '700' },
  defaultRadius: radius.control,
  radius: { md: `${radius.control}px`, lg: `${radius.card}px` },
  components: {
    Card: { defaultProps: { radius: 'lg', padding: 'md', shadow: 'xs' } },
    Paper: { defaultProps: { radius: 'lg' } },
    Button: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'xl', variant: 'light' } },
  },
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { ...toCssVars(light), '--mantine-color-body': light.bg },
  dark: { ...toCssVars(dark), '--mantine-color-body': dark.bg },
});
