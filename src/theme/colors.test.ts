import { Colors, getThemeColors, ColorScheme } from '@/theme/colors';

describe('getThemeColors', () => {
  it('returns the light palette by default', () => {
    expect(getThemeColors()).toBe(Colors);
  });

  it('returns a distinct dark palette when darkMode is on', () => {
    const dark = getThemeColors(true, false);
    expect(dark).not.toBe(Colors);
    expect(dark.background).not.toBe(Colors.background);
  });

  it('every variant exposes the full ColorScheme key set', () => {
    const keys = Object.keys(Colors) as (keyof ColorScheme)[];
    for (const variant of [
      getThemeColors(false, false),
      getThemeColors(true, false),
      getThemeColors(false, true),
      getThemeColors(true, true),
    ]) {
      for (const k of keys) {
        expect(typeof variant[k]).toBe('string');
      }
    }
  });
});
