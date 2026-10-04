import { createTheme, virtualColor, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';
import { brandScale, dark, darkScale, fonts, inkScale, light, radius, toCssVars, type ColorTokens } from './tokens';

const tuple = (shades: readonly string[]) => [...shades] as unknown as MantineColorsTuple;
const pill = { defaultProps: { radius: 'xl' } };

export const theme = createTheme({
  // Buttons, chips and checkboxes are ink in light mode (as in the reference) and lavender in dark mode,
  // where an ink button would vanish. Use color="yutis" for lavender in both.
  primaryColor: 'ink',
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  black: light.fg,
  colors: {
    yutis: tuple(brandScale),
    charcoal: tuple(inkScale),
    ink: virtualColor({ name: 'ink', light: 'charcoal', dark: 'yutis' }),
    dark: tuple(darkScale),
  },
  fontFamily: fonts.sans,
  fontFamilyMonospace: fonts.mono,
  headings: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    sizes: { h1: { fontSize: '34px' }, h2: { fontSize: '30px', lineHeight: '1.25' }, h3: { fontSize: '20px' } },
  },
  defaultRadius: 'md',
  radius: { md: `${radius.tile}px`, lg: `${radius.card}px`, xl: '999px' },
  components: {
    Card: { defaultProps: { radius: 'lg', padding: 'lg', shadow: 'none' } },
    Paper: { defaultProps: { radius: 'lg' } },
    Button: pill,
    ActionIcon: pill,
    Badge: { defaultProps: { radius: 'xl', variant: 'light' } },
    Chip: pill,
    SegmentedControl: { defaultProps: { radius: 'xl', color: 'ink' } },
    TextInput: pill,
    Select: pill,
    NativeSelect: pill,
    Autocomplete: pill,
    Progress: { defaultProps: { radius: 'xl', color: 'yutis.4' } },
    Tabs: { defaultProps: { variant: 'pills', radius: 'xl' } },
  },
});

const schemeVars = (t: ColorTokens) => ({
  ...toCssVars(t),
  '--mantine-color-body': t.bg,
  '--mantine-color-dimmed': t.muted,
  '--mantine-color-anchor': t.link,
  '--mantine-color-default': t.surface,
  '--mantine-color-default-border': t.lineStrong,
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: schemeVars(light),
  dark: schemeVars(dark),
});
