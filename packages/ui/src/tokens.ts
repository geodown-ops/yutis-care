/*
 * Design tokens for both apps. This is the one place to change colours: the Mantine theme and the
 * --yutis-* CSS variables are generated from it. Spec: https://claude.ai/artifact/8qGyJ8B3UVjkPAKZki4n34
 *
 * Style follows the Behance "Real Estate CRM Software" reference Geodown chose (2026-10-03): light
 * grey-lilac page, white cards without shadows, lavender #9994CE as the brand colour, ink #131517 for
 * the selected menu pill and main buttons, pastel tiles for overview figures, Urbanist type.
 * Status text colours are a step darker than the reference so small text stays WCAG AA on its tint.
 */

export interface ColorTokens {
  bg: string;
  surface: string;
  /** Inner tiles and secondary blocks inside a card. */
  surface2: string;
  /** Dividers and table rows. */
  line: string;
  /** Input and button outlines. */
  lineStrong: string;
  fg: string;
  muted: string;
  /** Lavender: logo, progress fills, first chart series, phone header. */
  brand: string;
  /** Text on `brand`. */
  brandFg: string;
  link: string;
  /** The YUTIS mark. */
  logo: string;
  nav: string;
  navFg: string;
  /** Text and icon on the active menu pill. */
  navStrong: string;
  navMuted: string;
  navActive: string;
  /** Circle behind each menu icon. */
  navIcon: string;
  ok: string; okWeak: string;
  warn: string; warnWeak: string;
  bad: string; badWeak: string;
  info: string; infoWeak: string;
  /** Pastel overview tiles; `*Strong` is the pill inside a tile. */
  tileLavender: string; tileLavenderStrong: string;
  tileMint: string; tileMintStrong: string;
  tilePink: string; tilePinkStrong: string;
  tileBlue: string; tileBlueStrong: string;
  grade1: string; grade2: string; grade3: string; grade4: string;
  /** Text on each grade colour. */
  grade1Fg: string; grade2Fg: string; grade3Fg: string; grade4Fg: string;
  chart1: string; chart2: string; chart3: string; chart4: string; chart5: string;
}

export const light: ColorTokens = {
  bg: '#F6F5F8',
  surface: '#FFFFFF',
  surface2: '#F4F4F3',
  line: '#EDECF1',
  lineStrong: '#D4D3DB',
  fg: '#131517',
  muted: '#646466',
  brand: '#9994CE',
  brandFg: '#131517',
  link: '#5F58A8',
  logo: '#102A43',
  nav: '#F6F5F8',
  navFg: '#3D3E3F',
  navStrong: '#FFFFFF',
  navMuted: '#6E6E72',
  navActive: '#131517',
  navIcon: '#EBEAF0',
  ok: '#18761C', okWeak: '#E3F6E4',
  warn: '#A14F00', warnWeak: '#FFF0DC',
  bad: '#C02D38', badWeak: '#FFE6E7',
  info: '#11689F', infoWeak: '#DFF6FF',
  tileLavender: '#F2F1FF', tileLavenderStrong: '#CDCCE9',
  tileMint: '#DAFFFA', tileMintStrong: '#AADDD8',
  tilePink: '#FFE6E7', tilePinkStrong: '#F7D7DA',
  tileBlue: '#DFF6FF', tileBlueStrong: '#C2E6F3',
  grade1: '#22A826', grade2: '#E8B21E', grade3: '#F07F2D', grade4: '#C42F3A',
  grade1Fg: '#131517', grade2Fg: '#131517', grade3Fg: '#131517', grade4Fg: '#FFFFFF',
  chart1: '#9994CE', chart2: '#22A826', chart3: '#22A0E7', chart4: '#E8707A', chart5: '#E8B21E',
};

export const dark: ColorTokens = {
  bg: '#0F1012',
  surface: '#18191C',
  surface2: '#202125',
  line: '#2A2B30',
  lineStrong: '#3A3B41',
  fg: '#EDEDF0',
  muted: '#A3A3AA',
  brand: '#9994CE',
  brandFg: '#131517',
  link: '#B3AEDD',
  logo: '#EDEDF0',
  nav: '#0F1012',
  navFg: '#C9C9CF',
  navStrong: '#131517',
  navMuted: '#8E8E96',
  navActive: '#9994CE',
  navIcon: '#1F2024',
  ok: '#5BCB66', okWeak: '#15301A',
  warn: '#F0A65A', warnWeak: '#35260F',
  bad: '#FF8A90', badWeak: '#3D1D21',
  info: '#6CC3F0', infoWeak: '#11293A',
  tileLavender: '#24223A', tileLavenderStrong: '#38355C',
  tileMint: '#0F2F2C', tileMintStrong: '#1A4A45',
  tilePink: '#3B2124', tilePinkStrong: '#5A3238',
  tileBlue: '#10283A', tileBlueStrong: '#1B4058',
  grade1: '#4CC35A', grade2: '#E8B840', grade3: '#F28C45', grade4: '#FF7A82',
  grade1Fg: '#0F1012', grade2Fg: '#0F1012', grade3Fg: '#0F1012', grade4Fg: '#0F1012',
  chart1: '#9994CE', chart2: '#5BCB66', chart3: '#6CC3F0', chart4: '#FF8A90', chart5: '#E8B840',
};

/** Lavender brand scale (Mantine needs 10 shades); shade 4 is the reference's #9994CE. */
export const brandScale = [
  '#F2F1FF', '#E4E2F7', '#CDCCE9', '#B3AEDD', '#9994CE',
  '#8580C2', '#6F69B3', '#5F58A8', '#4C4690', '#3A3570',
] as const;

/** Ink scale behind light-mode buttons, chips and the selected menu pill; shade 6 is #131517. */
export const inkScale = [
  '#F4F4F5', '#E6E6E9', '#CDCDD2', '#A6A6AC', '#7A7A80',
  '#4A4B50', '#131517', '#0B0C0E', '#060708', '#000000',
] as const;

/** Mantine's `dark` palette, which colours dark-mode inputs, borders and menus. */
export const darkScale = [
  '#EDEDF0', '#C9C9CF', '#A3A3AA', '#77777E', '#3A3B41',
  '#2A2B30', '#18191C', '#0F1012', '#0A0A0C', '#050506',
] as const;

/** Cards 20, inner tiles 14; buttons, inputs, badges and menu items are full pills. */
export const radius = { card: 20, tile: 14, grade: 6 } as const;

export const fonts = {
  // Urbanist has no CJK or Thai glyphs, so those fall through to Noto.
  sans: "'Urbanist', 'Noto Sans TC', 'Noto Sans Thai', system-ui, -apple-system, 'Microsoft JhengHei', 'PingFang TC', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Consolas, monospace",
} as const;

const kebab = (k: string) => k.replace(/[A-Z0-9]/g, m => '-' + m.toLowerCase()).replace(/-(\d)/g, '$1');

/** `{ navActive: '#…' }` → `{ '--yutis-nav-active': '#…' }`, for Mantine's cssVariablesResolver. */
export function toCssVars(t: ColorTokens): Record<string, string> {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [`--yutis-${kebab(k)}`, v]));
}

/** WCAG 2 contrast ratio between two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
