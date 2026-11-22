// Guards the Three.js version the mobile avatar's WebView renders with.
//
// The legacy mobile avatar renders inside a WebView whose HTML is built by
// buildHTML() in AvatarVRM.js. That HTML loads Three from a CDN via an
// importmap, so the version is a string in a template literal — not anything
// npm resolves, and nothing else checks it. The importmap names the version
// twice and the DRACO decoder path a third time; updating only some of them
// loads mismatched modules at runtime.
//
// apps/web used to run the same renderer against an npm copy of three, and this
// file also held the two in step. The web app no longer has a Three.js renderer
// (its avatar is the Unity build), so the WebView pin is the only copy left.

const { readFileSync } = require('fs');
const { join } = require('path');

const REPO = join(__dirname, '..', '..', '..', '..', '..', '..');
const read = (p) => readFileSync(join(REPO, p), 'utf8');

const CDN_VERSION = /cdn\.jsdelivr\.net\/npm\/three@([\d.]+)\//;

describe('Three.js version pin', () => {
  const avatarVrm = read('apps/mobile/src/features/avatar/components/AvatarVRM.js');

  it('pins a CDN version in the WebView importmap', () => {
    expect(avatarVrm).toMatch(CDN_VERSION);
  });

  it('uses one CDN version throughout AvatarVRM.js', () => {
    // The importmap has two entries and DRACOLoader.setDecoderPath a third.
    // Updating only some of them is the obvious way to get this wrong. The
    // floor is two rather than three so that self-hosting the DRACO decoder
    // stays open without tripping this.
    const found = [...avatarVrm.matchAll(new RegExp(CDN_VERSION, 'g'))].map((m) => m[1]);
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(found)]).toHaveLength(1);
  });
});

describe('apps/mobile dependencies', () => {
  const mobilePkg = JSON.parse(read('apps/mobile/package.json'));

  it('does not declare three: the WebView gets it from the CDN, not Metro', () => {
    // The only `import * as THREE from 'three'` in apps/mobile sits inside the
    // buildHTML() template literal, i.e. it is WebView HTML satisfied by the
    // importmap above. Declaring the npm package here implies Metro bundles it.
    expect(mobilePkg.dependencies.three).toBeUndefined();
  });

  it('does not declare @pixiv/three-vrm, which nothing references', () => {
    expect(mobilePkg.dependencies['@pixiv/three-vrm']).toBeUndefined();
  });
});
