// Unity's WebGL runtime defaults to WebGLInput.captureAllKeyboardInput = true.
// That binds its key callbacks at the DOCUMENT level and calls preventDefault()
// with no check on event.target, which cancels the keypress default action —
// character insertion. On this app, where Unity boots eagerly on every route
// (src/main.jsx), the result was that EVERY text box on EVERY screen took focus,
// showed a caret, and silently dropped what you typed.
//
// The fix is one line of C#, and it is the kind of line that gets deleted by
// accident: it sits in a file nothing else references, its absence compiles and
// runs perfectly, and the damage only appears in a browser against a freshly
// exported 242MB build. Nobody rediscovers that cheaply — it took an instrumented
// walk of the event propagation path to find the first time.
//
// So assert the source directly, the way csp.test.js asserts vercel.json.
//
// SCOPE, HONESTLY: the C# lives in the unity-avatar/UnityAvatarProject SUBMODULE,
// and CI checks out this repo without it (.github/workflows/ci.yml uses a plain
// actions/checkout; the Unity project is multi-GB and the prebuild smoke job
// deliberately runs without its artifacts). Cloning it per-run would cost far
// more than this guard is worth. So these checks run for anyone working with the
// submodule present — which is exactly the person who can break the line — and
// skip in CI. They are a developer-side guard, not a CI gate.
//
// The gate is the SUBMODULE's presence, not the target file's: if the submodule
// is checked out and WebGLKeyboardInput.cs has gone missing, that is a deletion
// and it fails, rather than quietly looking like an absent submodule.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const unityScripts = join(webRoot, '..', '..', 'unity-avatar', 'UnityAvatarProject', 'Assets', 'Scripts');

// A sibling that has been in the Unity project far longer than this fix, so its
// presence means "the submodule is checked out" and never "the fix is intact".
const submoduleCheckedOut = existsSync(join(unityScripts, 'WebGLCameraFraming.cs'));
const target = join(unityScripts, 'WebGLKeyboardInput.cs');
const source = submoduleCheckedOut && existsSync(target) ? readFileSync(target, 'utf8') : '';

// The comments quote the wrong-way-round setting to explain what went wrong, so
// the "never turns it back on" check has to look at code only.
const code = source.replace(/\/\/.*$/gm, '');

// The WebGL-only compile gate. Mobile UaaL builds must not compile any of this:
// WebGLInput does not exist off the WebGL player and would fail those exports.
const gateStart = source.indexOf('#if UNITY_WEBGL && !UNITY_EDITOR');
const gateEnd = source.indexOf('#endif', gateStart);
const gated = gateStart === -1 ? '' : source.slice(gateStart, gateEnd);

describe.skipIf(!submoduleCheckedOut)('Unity leaves the page keyboard alone on WebGL', () => {
  it('still has the WebGLKeyboardInput.cs that carries the fix', () => {
    expect(
      existsSync(target),
      'WebGLKeyboardInput.cs is gone from the Unity project.\n'
        + 'Without it Unity preventDefault()s keypress at the document level and every\n'
        + 'HTML text box in the web app silently refuses typed characters.',
    ).toBe(true);
  });

  it('disables captureAllKeyboardInput', () => {
    expect(source).toMatch(/WebGLInput\.captureAllKeyboardInput\s*=\s*false\s*;/);
  });

  it('never turns capture back on', () => {
    expect(code).not.toMatch(/captureAllKeyboardInput\s*=\s*true/);
  });

  it('compiles only into the WebGL player, so the mobile exports are untouched', () => {
    expect(gateStart, 'the WebGL compile gate is missing').toBeGreaterThan(-1);
    expect(gateEnd).toBeGreaterThan(gateStart);
    expect(gated).toMatch(/WebGLInput\.captureAllKeyboardInput\s*=\s*false\s*;/);
  });

  it('applies itself at startup, so no scene or prefab has to carry it', () => {
    // RuntimeInitializeOnLoadMethod is what keeps this out of the shared scene
    // file — the same trick WebGLCameraFraming.cs uses to stay web-only.
    expect(gated).toMatch(/\[RuntimeInitializeOnLoadMethod\(RuntimeInitializeLoadType\.BeforeSceneLoad\)\]/);
  });
});
