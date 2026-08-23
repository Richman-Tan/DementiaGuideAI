// Guards the seam between the two Three.js versions this repo runs.
//
// The mobile avatar renders inside a WebView whose HTML is built by buildHTML()
// in AvatarVRM.js. That HTML loads Three from a CDN via an importmap, so the
// version mobile actually renders with is a string in a template literal — not
// anything npm resolves. Meanwhile apps/web runs the *same* renderer code
// (generated from this file by apps/web/scripts/extract-renderer.mjs) against
// the npm copy.
//
// Nothing links those two. Bumping the npm dependency leaves the CDN pin behind
// silently, and the symptom is an avatar bug that reproduces on one platform
// only — which is a genuinely nasty thing to chase. Hence this test: it fails
// loudly the moment the two drift apart.

const { readFileSync } = require('fs');
const { join } = require('path');

const REPO = join(__dirname, '..', '..', '..', '..', '..', '..');
const read = (p) => readFileSync(join(REPO, p), 'utf8');

const CDN_VERSION = /cdn\.jsdelivr\.net\/npm\/three@([\d.]+)\//;

describe('Three.js version seam', () => {
  const avatarVrm = read('apps/mobile/src/features/avatar/components/AvatarVRM.js');

  it('pins a CDN version in the WebView importmap', () => {
    expect(avatarVrm).toMatch(CDN_VERSION);
  });

  it('uses one CDN version throughout AvatarVRM.js', () => {
    // The importmap has two entries and DRACOLoader.setDecoderPath a third.
    // Updating only some of them is the obvious way to get this wrong. The
    // floor is two rather than three so that self-hosting the DRACO decoder —
    // which is what apps/web already does — stays open without tripping this.
    const found = [...avatarVrm.matchAll(new RegExp(CDN_VERSION, 'g'))].map((m) => m[1]);
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(found)]).toHaveLength(1);
  });

  it('renders the exact version apps/web resolves, not merely a satisfying one', () => {
    // Compare against the lockfile, not apps/web's `^` range. A range is too
    // weak to be a guard: with `^0.185.0` declared, npm resolves 0.185.1 while
    // a CDN pin of 0.185.0 still "satisfies" it — which is precisely the drift
    // this test exists to prevent, passing. The lockfile is the artefact that
    // says what the web build actually runs.
    const lock = JSON.parse(read('package-lock.json'));
    const resolved = lock.packages['node_modules/three'].version;
    expect(avatarVrm.match(CDN_VERSION)[1]).toBe(resolved);
  });

  it('keeps the extract-renderer replacement key on the same version', () => {
    // extract-renderer.mjs rewrites the DRACO decoder URL by exact string match,
    // then asserts no 'cdn.jsdelivr.net' survives. If its key still names the old
    // version the extraction throws — correct, but only at build time, and with
    // an error that does not name the cause.
    const extract = read('apps/web/scripts/extract-renderer.mjs');
    expect(extract.match(CDN_VERSION)[1]).toBe(avatarVrm.match(CDN_VERSION)[1]);
  });
});

describe('apps/mobile dependencies', () => {
  const mobilePkg = JSON.parse(read('apps/mobile/package.json'));

  it('does not declare three: the WebView gets it from the CDN, not Metro', () => {
    // The only `import * as THREE from 'three'` in apps/mobile sits inside the
    // buildHTML() template literal, i.e. it is WebView HTML satisfied by the
    // importmap above. Declaring the npm package here implies Metro bundles it.
    // apps/web still depends on three, genuinely.
    expect(mobilePkg.dependencies.three).toBeUndefined();
  });

  it('does not declare @pixiv/three-vrm, which nothing references', () => {
    expect(mobilePkg.dependencies['@pixiv/three-vrm']).toBeUndefined();
  });
});
