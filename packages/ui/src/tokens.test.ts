import { describe, expect, it } from 'vitest';
import { brandScale, contrastRatio, dark, darkScale, inkScale, light, toCssVars, type ColorTokens } from './tokens';

describe('design tokens', () => {
  it('light and dark define the same tokens', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('maps token names to --yutis-* variables', () => {
    const v = toCssVars(light);
    expect(v['--yutis-nav-active']).toBe(light.navActive);
    expect(v['--yutis-ok-weak']).toBe(light.okWeak);
    expect(v['--yutis-grade4']).toBe(light.grade4);
    expect(v['--yutis-surface2']).toBe(light.surface2);
    expect(v['--yutis-tile-lavender-strong']).toBe(light.tileLavenderStrong);
  });

  it('has the 10 shades Mantine requires', () => {
    for (const scale of [brandScale, inkScale, darkScale]) expect(scale).toHaveLength(10);
  });

  it('keeps the reference brand colours', () => {
    expect(brandScale[4]).toBe('#9994CE');
    expect(inkScale[6]).toBe('#131517');
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#646466', '#FFFFFF')).toBeCloseTo(5.9, 1);
  });

  // Text pairs the components actually use; each must reach WCAG AA for normal text (4.5:1).
  const textPairs = (t: ColorTokens): [string, string, string][] => [
    ['fg on bg', t.fg, t.bg],
    ['muted on bg', t.muted, t.bg],
    ['muted on surface', t.muted, t.surface],
    ['link on surface', t.link, t.surface],
    ['brandFg on brand', t.brandFg, t.brand],
    ['navFg on nav', t.navFg, t.nav],
    ['navMuted on nav', t.navMuted, t.nav],
    ['navStrong on navActive', t.navStrong, t.navActive],
    ...(['ok', 'warn', 'bad', 'info'] as const).map(k => [`${k} on ${k}Weak`, t[k], t[`${k}Weak`]] as [string, string, string]),
    ...(['Lavender', 'Mint', 'Pink', 'Blue'] as const).flatMap(k => [
      [`fg on tile${k}`, t.fg, t[`tile${k}`]],
      [`fg on tile${k}Strong`, t.fg, t[`tile${k}Strong`]],
    ] as [string, string, string][]),
    ...([1, 2, 3, 4] as const).map(n => [`grade${n}Fg on grade${n}`, t[`grade${n}Fg`], t[`grade${n}`]] as [string, string, string]),
  ];

  for (const [scheme, t] of [['light', light], ['dark', dark]] as const) {
    it(`${scheme} text pairs reach 4.5:1`, () => {
      const failing = textPairs(t).filter(([, a, b]) => contrastRatio(a, b) < 4.5).map(([name, a, b]) => `${name} ${contrastRatio(a, b).toFixed(2)}`);
      expect(failing).toEqual([]);
    });
  }
});
