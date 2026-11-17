// Non-React read of dg_settings for modules that live outside the tree
// (the voice avatar bridge). Mirrors SettingsContext's load(); an avatarId that
// is no longer on the roster is resolved by getAvatarProfile, not rewritten.
export function getSettingSnapshot() {
  try {
    const stored = JSON.parse(localStorage.getItem('dg_settings') || '{}');
    return { avatarId: 'aaron', ...stored };
  } catch {
    return { avatarId: 'aaron' };
  }
}
