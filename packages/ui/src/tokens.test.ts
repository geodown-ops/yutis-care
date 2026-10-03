import { describe, expect, it } from 'vitest';
import { dark, light, primaryScale, toCssVars } from './tokens';

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
  });

  it('has the 10 primary shades Mantine requires', () => {
    expect(primaryScale).toHaveLength(10);
  });
});
