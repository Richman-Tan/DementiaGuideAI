// Category chip styling — the prototype's catStyle(): pale bg + deep text in
// light mode, dark tint + accent text in dark mode.
import { getCat } from '../data/services.js';

const DEEP = {
  caregiving: '#8A4A22', clinical: '#2D5F70', best: '#7A5A16',
  communication: '#4E4373', safety: '#7E352E', wellbeing: '#2E5F4D', prevention: '#2A5A8A',
};

export function catStyle(cid, dark) {
  const c = getCat(cid);
  if (!c) return { bg: 'var(--tint)', fg: 'var(--primary-d)', dot: 'var(--primary)' };
  return dark
    ? { bg: c.dk, fg: c.accent, dot: c.accent }
    : { bg: c.pale, fg: DEEP[cid], dot: c.accent };
}
