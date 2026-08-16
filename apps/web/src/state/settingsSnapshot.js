// Non-React read of dg_settings for modules that live outside the tree
// (avatar controller singleton). Mirrors SettingsContext's load(), including
// the one-time aria→aaron parity migration (read-only here — SettingsContext
// persists it at boot).
export function getSettingSnapshot() {
  try {
    const stored = JSON.parse(localStorage.getItem('dg_settings') || '{}');
    if (stored.avatarId === 'aria' && !stored.avatarMigratedToUnity) {
      stored.avatarId = 'aaron';
    }
    return { avatarId: 'aaron', ...stored };
  } catch {
    return { avatarId: 'aaron' };
  }
}
