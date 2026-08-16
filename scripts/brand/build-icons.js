#!/usr/bin/env node
// Regenerates every brand asset from the geometry in packages/core/brand/mark.js.
//
//   npm run brand:icons
//
// Outputs are committed, so this only needs running when the mark itself
// changes. Nobody needs it to build or run either app.
//
// It rasterises without any dependency — not sharp, not a headless browser.
// The mark is two circles and the tile is a rounded rectangle, so each shape
// has a closed-form signed distance function; pixel coverage is read straight
// off it (`0.5 - distance`, clamped), which gives clean antialiasing at one
// sample per pixel. PNG encoding is Node's own zlib plus a CRC. The upshot is
// that this runs identically on any machine with Node, including CI, and it
// controls the alpha channel exactly — which matters, because iOS app icons
// must not carry transparency and Android adaptive foregrounds must.
//
// If the mark ever becomes something more than circles, the SVG sources written
// to assets/brand/ stay the portable definition; only this rasteriser would
// need replacing.
//
// CommonJS, and the build is split from the write, so build-icons.test.js can
// rebuild every asset in memory and compare it against what is committed. That
// is what stops the icons drifting after someone edits the geometry.

const { deflateSync } = require('node:zlib');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join, relative } = require('node:path');

const {
  MARK,
  MARK_REVERSED,
  MARK_COLORS,
  TILE,
  ANDROID_SAFE_ZONE_RATIO,
  markFor,
  markBounds,
  markEnclosingRadius,
} = require('../../packages/core/brand/mark.js');

const ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------- PNG output

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// `rgba` is a Float32Array of straight-alpha values in 0..1, four per pixel.
// withAlpha:false writes colour type 2 (truecolour, no alpha channel at all)
// rather than an all-opaque alpha channel, so App Store validation stays quiet.
function encodePng(width, height, rgba, withAlpha) {
  const channels = withAlpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type 0 (None) — these images compress fine flat
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = rowStart + 1 + x * channels;
      for (let c = 0; c < 3; c++) raw[d + c] = Math.round(clamp01(rgba[s + c]) * 255);
      if (withAlpha) raw[d + 3] = Math.round(clamp01(rgba[s + 3]) * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = withAlpha ? 6 : 2; // colour type
  // 10..12 stay 0: deflate, adaptive filtering, no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------- rasterising

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// '#RRGGBB' or 'rgba(r,g,b,a)' → {r,g,b,a} in 0..1
function parseColor(css) {
  const rgba = /^rgba?\(([^)]+)\)$/.exec(css.trim());
  if (rgba) {
    const p = rgba[1].split(',').map((n) => parseFloat(n));
    return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 };
  }
  const hex = css.replace('#', '');
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
    a: 1,
  };
}

// Straight-alpha source-over, the same compositing an SVG renderer would do —
// which is what keeps the rasterised PNGs identical to the committed SVGs.
function composite(buf, i, col, coverage) {
  const a = col.a * coverage;
  if (a <= 0) return;
  const da = buf[i + 3];
  const outA = a + da * (1 - a);
  if (outA <= 0) return;
  buf[i] = (col.r * a + buf[i] * da * (1 - a)) / outA;
  buf[i + 1] = (col.g * a + buf[i + 1] * da * (1 - a)) / outA;
  buf[i + 2] = (col.b * a + buf[i + 2] * da * (1 - a)) / outA;
  buf[i + 3] = outA;
}

// Paint every pixel whose signed distance says it is inside `sdf`.
function fill(buf, size, sdf, css) {
  const col = parseColor(css);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const coverage = clamp01(0.5 - sdf(x + 0.5, y + 0.5));
      if (coverage > 0) composite(buf, (y * size + x) * 4, col, coverage);
    }
  }
}

const sdCircle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const sdRing = (cx, cy, r, w) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - w / 2;

const sdRoundedSquare = (size, radius) => (x, y) => {
  const half = size / 2;
  const qx = Math.abs(x - half) - half + radius;
  const qy = Math.abs(y - half) - half + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};

// Map the 48-unit mark space onto a `size` canvas, centred on the mark's true
// bounding box. The circles are deliberately not centred in their own viewBox,
// so centring on 24,24 would push the mark visibly right of centre.
function placeMark(mark, size, markWidthPx) {
  const b = markBounds(mark);
  const scale = markWidthPx / b.width;
  return {
    scale,
    x: (size - markWidthPx) / 2 - b.minX * scale,
    y: (size - b.height * scale) / 2 - b.minY * scale,
  };
}

function renderIcon({ size, mark, colors, tile, markWidthPx, withAlpha }) {
  const buf = new Float32Array(size * size * 4);

  if (tile === 'square') {
    fill(buf, size, () => -1, TILE.background); // full bleed; iOS applies its own mask
  } else if (tile === 'rounded') {
    fill(buf, size, sdRoundedSquare(size, size * TILE.radiusRatio), TILE.background);
  }

  const p = placeMark(mark, size, markWidthPx);
  const at = (v) => v * p.scale;
  fill(
    buf,
    size,
    sdCircle(p.x + at(mark.solid.cx), p.y + at(mark.solid.cy), at(mark.solid.r)),
    colors.solid
  );
  fill(
    buf,
    size,
    sdRing(
      p.x + at(mark.ring.cx),
      p.y + at(mark.ring.cy),
      at(mark.ring.r),
      at(mark.ring.strokeWidth)
    ),
    colors.ring
  );

  return encodePng(size, size, buf, withAlpha);
}

// --------------------------------------------------------------- SVG sources

// The shared colours use CSS rgba() so they can drop straight into a style prop
// on either platform, but SVG wants the alpha split out into its own attribute —
// rgba() in a paint attribute is SVG 2 and not universally honoured.
function paint(css, kind) {
  const c = parseColor(css);
  const hex =
    '#' +
    [c.r, c.g, c.b]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, '0')
          .toUpperCase()
      )
      .join('');
  return `${kind}="${hex}"` + (c.a < 1 ? ` ${kind}-opacity="${c.a}"` : '');
}

function markSvgBody(mark, colors, indent = '  ') {
  return (
    `${indent}<circle cx="${mark.solid.cx}" cy="${mark.solid.cy}" r="${mark.solid.r}" ${paint(colors.solid, 'fill')}/>\n` +
    `${indent}<circle cx="${mark.ring.cx}" cy="${mark.ring.cy}" r="${mark.ring.r}" fill="none" ` +
    `${paint(colors.ring, 'stroke')} stroke-width="${mark.ring.strokeWidth}"/>`
  );
}

// Bare mark, cropped to its own bounding box so it fills whatever box it is given.
function bareMarkSvg(mark, colors, label) {
  const b = markBounds(mark);
  const box = [b.minX, b.minY, b.width, b.height].map((n) => Number(n.toFixed(3))).join(' ');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="${label}">\n` +
    `${markSvgBody(mark, colors)}\n</svg>\n`
  );
}

// Mark on a tile, centred on the mark's bounding box rather than the viewBox.
function tileSvg(mark, size, radius, markWidthPx, label) {
  const p = placeMark(mark, size, markWidthPx);
  const round = (n) => Number(n.toFixed(3));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}">\n` +
    `  <!-- DementiaGuide AI "Companion" mark. Generated by scripts/brand/build-icons.js\n` +
    `       from packages/core/brand/mark.js — edit there, not here. -->\n` +
    `  <rect width="${size}" height="${size}"${radius ? ` rx="${round(radius)}"` : ''} fill="${TILE.background}"/>\n` +
    `  <g transform="translate(${round(p.x)} ${round(p.y)}) scale(${round(p.scale)})">\n` +
    `${markSvgBody(mark, MARK_COLORS.onTile, '    ')}\n` +
    `  </g>\n</svg>\n`
  );
}

// ------------------------------------------------------------------- targets

const FAVICON_MARK_WIDTH = 64 * TILE.markWidthRatio;
const FAVICON_SVG = tileSvg(
  markFor(FAVICON_MARK_WIDTH, true),
  64,
  64 * TILE.radiusRatio,
  FAVICON_MARK_WIDTH,
  'DementiaGuide AI'
);

const SVG_FILES = [
  ['assets/brand/mark.svg', bareMarkSvg(MARK, MARK_COLORS.light, 'DementiaGuide AI')],
  ['assets/brand/mark-dark.svg', bareMarkSvg(MARK, MARK_COLORS.dark, 'DementiaGuide AI')],
  [
    'assets/brand/mark-reversed.svg',
    bareMarkSvg(MARK_REVERSED, MARK_COLORS.onTile, 'DementiaGuide AI'),
  ],
  [
    'assets/brand/icon.svg',
    tileSvg(MARK_REVERSED, 512, 0, 512 * TILE.markWidthRatio, 'DementiaGuide AI'),
  ],
  ['assets/brand/favicon.svg', FAVICON_SVG],
  // The web app serves this one directly; same bytes, so the two cannot drift.
  ['apps/web/public/favicon.svg', FAVICON_SVG],
];

const tileRatio = TILE.markWidthRatio;

// How wide to draw the mark on the Android adaptive foreground. The hard limit
// is the masking safe zone; the number below sits inside it on purpose.
//
// Derived rather than guessed, and the enclosing radius matters: the mark is two
// discs, not a rectangle, so measuring it by its bounding box's diagonal would
// shrink the icon by about a fifth for nothing. Filling the safe zone outright
// also looks wrong next to other launcher icons — 88% of it puts the mark's
// enclosing circle at ~58dp, in line with Material's 60dp circular keyline,
// while its 62 x 44dp box lands almost exactly on the 64 x 48dp keyline for a
// horizontal shape.
const ANDROID_KEYLINE_FILL = 0.88;

function androidSafeWidth(mark, size) {
  const b = markBounds(mark);
  const safeRadiusPx = (size * ANDROID_SAFE_ZONE_RATIO) / 2;
  const maxScale = safeRadiusPx / markEnclosingRadius(mark);
  return Math.floor(b.width * maxScale * ANDROID_KEYLINE_FILL);
}

const PNG_FILES = [
  // Web. The rounded tile needs alpha for its corners; the Apple touch icon is
  // full-bleed and opaque because iOS applies its own mask and rejects alpha.
  { out: 'apps/web/public/favicon.png', size: 48, tile: 'rounded', ratio: tileRatio, alpha: true },
  {
    out: 'apps/web/public/apple-touch-icon.png',
    size: 180,
    tile: 'square',
    ratio: tileRatio,
    alpha: false,
  },

  // Mobile. Expo's `web.favicon`; unused in practice (the real web app is Vite)
  // but kept in step so the two never disagree.
  {
    out: 'apps/mobile/assets/favicon.png',
    size: 48,
    tile: 'rounded',
    ratio: tileRatio,
    alpha: true,
  },

  // Expo regenerates the iOS icon from this with removeTransparency:true and a
  // *white* flatten colour, so the source has to be opaque teal already — a
  // transparent white mark would come out white-on-white.
  {
    out: 'apps/mobile/assets/icon.png',
    size: 1024,
    tile: 'square',
    ratio: tileRatio,
    alpha: false,
  },

  {
    out: 'apps/mobile/assets/adaptive-icon.png',
    size: 1024,
    tile: null,
    widthPx: 'android-safe',
    alpha: true,
  },

  // Splash. app.json's legacy `splash` key makes iOS render this square at the
  // full screen width, so the mark lands at ratio x screen width (~40%); Android
  // contain-fits it into a 200dp box. The transparent padding, not the file
  // size, is what sets both.
  { out: 'apps/mobile/assets/splash-icon.png', size: 1024, tile: null, ratio: 0.4, alpha: true },
];

// ----------------------------------------------------------------- build/main

// How wide the mark lands on a given target, which is also what decides its
// weight — the mark inside a 48px favicon is only ~30px across, so keying the
// compact variant off the canvas size instead would get it wrong.
function resolveTarget(t) {
  const provisional =
    t.widthPx === 'android-safe' ? androidSafeWidth(MARK_REVERSED, t.size) : t.size * t.ratio;
  const mark = markFor(provisional, true);
  const markWidthPx = t.widthPx === 'android-safe' ? androidSafeWidth(mark, t.size) : provisional;
  return { mark, markWidthPx };
}

// Every asset, in memory. Kept separate from writing so the test can rebuild
// them all and diff against what is committed.
function buildAll() {
  const files = SVG_FILES.map(([path, svg]) => ({ path, data: Buffer.from(svg, 'utf8') }));

  for (const t of PNG_FILES) {
    const { mark, markWidthPx } = resolveTarget(t);
    files.push({
      path: t.out,
      data: renderIcon({
        size: t.size,
        mark,
        // Always the reversed mark: tiled icons sit on teal, and the untiled
        // Android/splash images sit on the teal backgrounds set in app.json.
        colors: MARK_COLORS.onTile,
        tile: t.tile,
        markWidthPx,
        withAlpha: t.alpha,
      }),
    });
  }
  return files;
}

function main() {
  console.log('Brand assets');
  for (const { path: rel, data } of buildAll()) {
    const path = join(ROOT, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
    console.log(`  ${relative(ROOT, path).padEnd(42)} ${String(data.length).padStart(7)} B`);
  }
  console.log(
    '\nDone. Mobile launcher/splash images regenerate from these on the next `expo prebuild`.'
  );
}

module.exports = { buildAll, resolveTarget, androidSafeWidth, ROOT, PNG_FILES, SVG_FILES };

if (require.main === module) main();
