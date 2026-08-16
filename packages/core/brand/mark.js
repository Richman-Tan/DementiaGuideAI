// Single source of truth for the DementiaGuide AI brand mark.
//
// The mark ("Companion") is two overlapping circles — one solid, one outlined —
// standing for two people side by side. It replaced the old letter-"A" tile.
//
// Plain CommonJS on purpose, same as rag/ragConfig.js: this module is consumed
// by the React Native app (Metro), by Vite, and by the Node .mjs generator under
// scripts/brand/ — so it must not use ESM syntax and must not import anything
// platform-specific. Change the geometry here, never in a per-renderer copy.

// Circles are expressed in a 48x48 coordinate space. Note they are NOT centred
// in that box — see markBounds() below, which every renderer must use.
const MARK = {
  solid: { cx: 18, cy: 24, r: 11.5 },
  ring: { cx: 31, cy: 24, r: 11.5, strokeWidth: 3.4 },
};

// White on teal reads thinner than teal on white at the same stroke width, so
// the reversed mark carries a slightly heavier ring. This optical correction is
// from the approved design, not an approximation of it.
const MARK_REVERSED = {
  solid: MARK.solid,
  ring: { ...MARK.ring, strokeWidth: 3.8 },
};

// Chunkier variant for small renderings, where a 3.4 stroke is barely over 1px
// once the browser downscales a 48px favicon to 16px. Its heavier ring covers
// both the small-size and the reversed correction, so it needs no sibling.
const MARK_COMPACT = {
  solid: { cx: 18, cy: 24, r: 12.5 },
  ring: { cx: 31, cy: 24, r: 12, strokeWidth: 4.4 },
};

// Threshold for switching to MARK_COMPACT, measured in the *drawn width of the
// mark* rather than the size of whatever contains it. A 34px sidebar tile only
// gives the mark 21px, which is smaller than the mark inside a 48px favicon —
// so keying off the container would weight those two differently for no reason.
const COMPACT_BELOW = 40;

// `reversed` means white-on-teal — a tile, an app icon, a favicon.
function markFor(markWidthPx, reversed) {
  if (markWidthPx < COMPACT_BELOW) return MARK_COMPACT;
  return reversed ? MARK_REVERSED : MARK;
}

// Tight bounding box of the drawn mark, stroke included. The mark is wider than
// it is tall and sits right of centre in the 48-box, so anything that centres it
// (an app icon, a square tile) has to centre on this box rather than on 24,24.
function markBounds(mark) {
  const ringOuter = mark.ring.r + mark.ring.strokeWidth / 2;
  const minX = Math.min(mark.solid.cx - mark.solid.r, mark.ring.cx - ringOuter);
  const maxX = Math.max(mark.solid.cx + mark.solid.r, mark.ring.cx + ringOuter);
  const minY = Math.min(mark.solid.cy - mark.solid.r, mark.ring.cy - ringOuter);
  const maxY = Math.max(mark.solid.cy + mark.solid.r, mark.ring.cy + ringOuter);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// viewBox string cropped to the mark itself, so an <svg> using it needs no
// transform — the mark simply fills whatever width/height the element is given.
function markViewBox(mark) {
  const b = markBounds(mark);
  return `${b.minX} ${b.minY} ${b.width} ${b.height}`;
}

// Aspect ratio (width / height) of the mark. ~1.43.
function markAspect(mark) {
  const b = markBounds(mark);
  return b.width / b.height;
}

// onTile is the reversed mark — app icons, favicons, the sidebar lockup.
//
// light/dark exist for the standalone SVG exports in assets/brand/ (slide decks,
// docs, anywhere outside a running app). In the apps themselves the mark is
// tinted from the live theme instead — CSS custom properties on web, the theme
// object on mobile — so it can never drift from the surrounding UI. light does
// match --primary/--primary-l; dark deliberately uses the *darker* end of the
// dark ramp (--primary-d) because #7FB6C8 has too little contrast on #111820.
const MARK_COLORS = {
  onTile: { solid: '#FFFFFF', ring: 'rgba(255,255,255,0.75)' },
  light: { solid: '#4A7C8E', ring: '#6A9BAD' },
  dark: { solid: '#5C9CB0', ring: '#9CCBDB' },
};

const TILE = {
  background: '#4A7C8E',
  // Corner radius as a fraction of tile size, and how much of the tile's width
  // the mark spans. Both carried over from the approved design. Note the ratio
  // applies to *tiles* only — the untiled Android and splash images have their
  // own padding, driven by each platform's safe area rather than by this.
  radiusRatio: 19 / 64,
  markWidthRatio: 0.62,
};

// Android adaptive icons are a 108dp canvas of which only the centre 66dp circle
// is guaranteed to survive masking — 61.1%, not 66%, since the outer 18dp on
// each side is bleed for the mask and parallax. Anything drawing the foreground
// has to keep the mark inside this.
const ANDROID_SAFE_ZONE_RATIO = 66 / 108;

// Radius of the smallest circle centred on the mark's bounding box that contains
// the whole mark, in 48-space units. Smaller than the bounding box's half
// diagonal, because the mark is two discs rather than a rectangle — using the
// diagonal instead would shrink the Android icon by about a fifth for nothing.
function markEnclosingRadius(mark) {
  const b = markBounds(mark);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const ringOuter = mark.ring.r + mark.ring.strokeWidth / 2;
  return Math.max(
    Math.hypot(mark.solid.cx - cx, mark.solid.cy - cy) + mark.solid.r,
    Math.hypot(mark.ring.cx - cx, mark.ring.cy - cy) + ringOuter
  );
}

module.exports = {
  MARK,
  MARK_REVERSED,
  MARK_COMPACT,
  COMPACT_BELOW,
  MARK_COLORS,
  TILE,
  ANDROID_SAFE_ZONE_RATIO,
  markFor,
  markBounds,
  markViewBox,
  markAspect,
  markEnclosingRadius,
};
