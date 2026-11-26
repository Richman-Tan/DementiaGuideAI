import { Colors, getThemeColors, ColorScheme } from '@/theme/colors';
import { dark, light } from '@core/design/tokens';

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

// The design tokens in packages/core are the one source for the web app's
// colours. The mobile theme predates them and has more colours of its own; the
// ones the two apps share are held to the tokens here, so the brand cannot
// drift between them. (Still different, to be settled when mobile adopts the
// tokens: the text colours, and the dark theme's light and dark primaries.)
describe('colours shared with the web app', () => {
  const same = (mobile: string, token: string) => expect(mobile.toLowerCase()).toBe(token);

  it('the light theme has the tokens’ brand and surface colours', () => {
    const mobile = getThemeColors(false, false);
    same(mobile.primary, light.primary);
    same(mobile.primaryLight, light.primaryLight);
    same(mobile.primaryDark, light.primaryDark);
    same(mobile.background, light.bg);
    same(mobile.surface, light.surface);
    same(mobile.surfaceElevated, light.elevated);
  });

  it('the dark theme has the tokens’ primary and surface colours', () => {
    const mobile = getThemeColors(true, false);
    same(mobile.primary, dark.primary);
    same(mobile.background, dark.bg);
    same(mobile.surface, dark.surface);
    same(mobile.surfaceElevated, dark.elevated);
  });
});
