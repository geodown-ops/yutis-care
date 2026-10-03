/*
 * Design tokens for both apps. This is the one place to change colours: the Mantine theme and the
 * --yutis-* CSS variables are generated from it. Spec: https://claude.ai/artifact/8qGyJ8B3UVjkPAKZki4n34
 */

export interface ColorTokens {
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  fg: string;
  muted: string;
  nav: string;
  navFg: string;
  /** Active item and product name on the sidebar. */
  navStrong: string;
  navMuted: string;
  navActive: string;
  ok: string; okWeak: string;
  warn: string; warnWeak: string;
  bad: string; badWeak: string;
  info: string; infoWeak: string;
  grade1: string; grade2: string; grade3: string; grade4: string;
  /** Text on each grade colour (yellow and the bright dark-mode grades need dark text). */
  grade1Fg: string; grade2Fg: string; grade3Fg: string; grade4Fg: string;
  chart1: string; chart2: string; chart3: string; chart4: string; chart5: string;
}

export const light: ColorTokens = {
  bg: '#F2F4F7',
  surface: '#FFFFFF',
  surface2: '#F7F8FA',
  line: '#E3E7ED',
  fg: '#121826',
  muted: '#5B6475',
  nav: '#0F1A2A',
  navFg: '#C9D3E1',
  navStrong: '#FFFFFF',
  navMuted: '#7D8BA1',
  navActive: '#1C2B42',
  ok: '#1E8E5A', okWeak: '#E3F4EA',
  warn: '#B7791F', warnWeak: '#FBF0DC',
  bad: '#C2412D', badWeak: '#FBE7E3',
  info: '#2F6FB3', infoWeak: '#E4EEF9',
  grade1: '#1E8E5A', grade2: '#D29B1C', grade3: '#E07A2E', grade4: '#C2412D',
  grade1Fg: '#FFFFFF', grade2Fg: '#2A1D00', grade3Fg: '#2A1300', grade4Fg: '#FFFFFF',
  chart1: '#0E7C6B', chart2: '#2F4A7A', chart3: '#E3A33B', chart4: '#E06A4E', chart5: '#5AA9E6',
};

export const dark: ColorTokens = {
  bg: '#0B111A',
  surface: '#121A26',
  surface2: '#172131',
  line: '#243044',
  fg: '#E6EBF2',
  muted: '#98A3B5',
  nav: '#070C14',
  navFg: '#C2CCDA',
  navStrong: '#FFFFFF',
  navMuted: '#6F7D93',
  navActive: '#17233A',
  ok: '#4CC487', okWeak: '#12301F',
  warn: '#E7B04F', warnWeak: '#33270F',
  bad: '#F07A66', badWeak: '#3A1A15',
  info: '#79AEE8', infoWeak: '#14263B',
  grade1: '#3FB27A', grade2: '#E0B043', grade3: '#EE9150', grade4: '#F07A66',
  grade1Fg: '#0B111A', grade2Fg: '#0B111A', grade3Fg: '#0B111A', grade4Fg: '#0B111A',
  chart1: '#3CC4AC', chart2: '#7E9CD6', chart3: '#E7B04F', chart4: '#F08A70', chart5: '#79BDF0',
};

/** Primary colour scale (Mantine needs 10 shades). Light mode uses shade 6, dark mode shade 4. */
export const primaryScale = [
  '#E6F5F2', '#CCEBE5', '#9AD8CB', '#63C3B0', '#3CC4AC',
  '#1C9C84', '#0E7C6B', '#0B6B5C', '#085A4D', '#05483E',
] as const;

export const radius = { card: 16, control: 10, grade: 6 } as const;

export const fonts = {
  sans: "'Plus Jakarta Sans', 'Noto Sans TC', 'Noto Sans Thai', system-ui, -apple-system, 'Microsoft JhengHei', 'PingFang TC', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Consolas, monospace",
} as const;

const kebab = (k: string) => k.replace(/[A-Z0-9]/g, m => '-' + m.toLowerCase()).replace(/-(\d)/g, '$1');

/** `{ navActive: '#…' }` → `{ '--yutis-nav-active': '#…' }`, for Mantine's cssVariablesResolver. */
export function toCssVars(t: ColorTokens): Record<string, string> {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [`--yutis-${kebab(k)}`, v]));
}
