// Guards the committed brand assets against drifting from the geometry they are
// generated from. The mark now has one definition (packages/core/brand/mark.js)
// and several renderings; if someone tunes the geometry and forgets
// `npm run brand:icons`, the app icons silently keep the old shape. So rebuild
// every asset in memory and compare it byte-for-byte with what is on disk.

const { readFileSync } = require('fs');
const { join } = require('path');
const { buildAll, resolveTarget, ROOT, PNG_FILES } = require('./build-icons.js');
const { ANDROID_SAFE_ZONE_RATIO, markBounds, markEnclosingRadius } = require('@core/brand/mark');

describe('committed brand assets', () => {
  const built = buildAll();

  it('covers both apps and the standalone SVG sources', () => {
    const paths = built.map((f) => f.path);
    expect(paths).toContain('apps/web/public/favicon.svg');
    expect(paths).toContain('apps/web/public/apple-touch-icon.png');
    expect(paths).toContain('apps/mobile/assets/icon.png');
    expect(paths).toContain('apps/mobile/assets/adaptive-icon.png');
  });

  it.each(built.map((f) => f.path))('%s is up to date', (path) => {
    const onDisk = readFileSync(join(ROOT, path));
    const expected = built.find((f) => f.path === path).data;
    // Not toEqual on the buffers — a mismatch would dump megabytes of bytes.
    expect({ file: path, bytes: onDisk.length, sha: hash(onDisk) }).toEqual({
      file: path,
      bytes: expected.length,
      sha: hash(expected),
    });
  });

  it('serves the same favicon.svg bytes from public/ and assets/brand/', () => {
    const a = readFileSync(join(ROOT, 'apps/web/public/favicon.svg'));
    const b = readFileSync(join(ROOT, 'assets/brand/favicon.svg'));
    expect(a.equals(b)).toBe(true);
  });
});

describe('platform icon constraints', () => {
  const png = (path) => readFileSync(join(ROOT, path));
  // IHDR sits at a fixed offset: 8-byte signature, 4-byte length, 4-byte type.
  const header = (buf) => ({
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25], // 2 = truecolour, 6 = truecolour + alpha
  });

  it('ships the iOS-bound icons with no alpha channel at all', () => {
    // An all-opaque alpha channel still trips App Store validation, and Expo
    // flattens the iOS icon onto *white* — so a transparent source would come
    // out white-on-white.
    expect(header(png('apps/mobile/assets/icon.png'))).toEqual({
      width: 1024,
      height: 1024,
      colorType: 2,
    });
    expect(header(png('apps/web/public/apple-touch-icon.png')).colorType).toBe(2);
  });

  it('keeps alpha where the platform composites the mark itself', () => {
    // Android draws the adaptive foreground over its own background colour, and
    // the favicon's rounded corners have to be see-through.
    expect(header(png('apps/mobile/assets/adaptive-icon.png')).colorType).toBe(6);
    expect(header(png('apps/mobile/assets/splash-icon.png')).colorType).toBe(6);
    expect(header(png('apps/web/public/favicon.png')).colorType).toBe(6);
  });

  it('keeps the Android adaptive foreground inside the masking safe zone', () => {
    const target = PNG_FILES.find((t) => t.out === 'apps/mobile/assets/adaptive-icon.png');
    const { mark, markWidthPx } = resolveTarget(target);
    const scale = markWidthPx / markBounds(mark).width;
    const drawnRadius = markEnclosingRadius(mark) * scale;
    const safeRadius = (target.size * ANDROID_SAFE_ZONE_RATIO) / 2;
    expect(drawnRadius).toBeLessThan(safeRadius);
  });
});

function hash(buf) {
  return require('crypto').createHash('sha256').update(buf).digest('hex').slice(0, 16);
}
