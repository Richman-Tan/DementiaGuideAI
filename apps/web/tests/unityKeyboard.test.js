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
// So assert the source directly, the way csp.test.js asserts vercel.json. This
// cannot prove the exported wasm carries the flag (see verification in the deploy
// notes for the runtime probe that does), but it does stop the line going missing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const unityScripts = join(webRoot, '..', '..', 'unity-avatar', 'UnityAvatarProject', 'Assets', 'Scripts');
const source = readFileSync(join(unityScripts, 'WebGLKeyboardInput.cs'), 'utf8');

// The WebGL-only compile gate. Mobile UaaL builds must not compile any of this:
// WebGLInput does not exist off the WebGL player and would fail the iOS/Android
// exports outright.
const gateStart = source.indexOf('#if UNITY_WEBGL && !UNITY_EDITOR');
const gateEnd = source.indexOf('#endif', gateStart);
const gated = gateStart === -1 ? '' : source.slice(gateStart, gateEnd);

// The comments quote the wrong-way-round setting to explain what went wrong, so
// the "never turns it back on" check has to look at code only.
const code = source.replace(/\/\/.*$/gm, '');

describe('Unity leaves the page keyboard alone on WebGL', () => {
  it('disables captureAllKeyboardInput', () => {
    expect(
      source,
      'WebGLKeyboardInput.cs no longer turns off Unity keyboard capture.\n'
        + 'Without it, Unity preventDefault()s keypress at the document level and every\n'
        + 'HTML text box in the web app silently refuses typed characters.',
    ).toMatch(/WebGLInput\.captureAllKeyboardInput\s*=\s*false\s*;/);
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
