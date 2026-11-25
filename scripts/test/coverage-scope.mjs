// What "100% coverage" is measured over, and what is deliberately left out.
//
// Agreed definition (Oct 2026): every user flow has an end-to-end test (web:
// Playwright; iOS: Maestro), and the testable logic below reaches 100%
// statement and line coverage from unit and e2e tests combined. Rendering and
// native code that no test runner can meaningfully execute is excluded here,
// by file, with the reason — never hidden with ignore comments. The human
// version of this list is docs/testing/coverage.md; keep the two in step.

/** Each area is measured from the named coverage sources (see coverage-gate.mjs). */
export const AREAS = [
  { id: 'web', label: 'Web app — apps/web/src', root: 'apps/web/src/', sources: ['web'] },
  // Shared core: the mobile Jest suite and the web Vitest suite both exercise it,
  // with different instrumenters, so their maps cannot be summed; each file is
  // credited with the better of the two (a lower bound on the true union).
  {
    id: 'core',
    label: 'Shared core — packages/core',
    root: 'packages/core/',
    sources: ['jest', 'web'],
  },
  { id: 'api', label: 'API — apps/api/api', root: 'apps/api/api/', sources: ['api'] },
  // The server's TypeScript, which the files under api/ deploy as a bundle.
  { id: 'api-src', label: 'API — apps/api/src', root: 'apps/api/src/', sources: ['api'] },
];

/** Source files that are part of an area but not of the gate: path → reason. */
export const EXCLUDED = {
  'apps/api/api/turn.js':
    'Deploy shim: re-exports the bundle that `npm run bundle -w apps/api` makes from apps/api/src, and sets the ' +
    'function time limit. The code it deploys is in scope under apps/api/src; the bundle does not exist until built.',
  'apps/api/api/speak.js':
    'Deploy shim: re-exports the bundle that `npm run bundle -w apps/api` makes from apps/api/src, and sets the ' +
    'function time limit. The code it deploys is in scope under apps/api/src; the bundle does not exist until built.',
  'apps/web/src/voice/pcmTap.worklet.js':
    'Runs inside the audio thread (an AudioWorkletGlobalScope), where no coverage is collected: it copies ' +
    'microphone samples into 20 ms frames and posts them. What is done with the frames (voice/micInput.js, ' +
    'packages/core/voice/speechDetector.ts) is in scope.',
  'apps/web/src/avatar/audioEngine.js':
    'Drives the Web Audio API (AudioContext scheduling, AnalyserNode); extracted verbatim from the ' +
    'mobile renderer, and its timing depends on a real audio clock rather than on logic a test can stub.',
  'apps/web/src/avatar/unity/unityBridge.js':
    'Loads and drives the Unity WebGL runtime (loader script, createUnityInstance, canvas parking); ' +
    'the 244 MB build is git-ignored and absent from CI, so the runtime it talks to cannot be present.',
  'apps/web/src/avatar/unity/UnityAvatarController.js':
    'Unity runtime glue: forwards blendshape payloads to the Unity instance over SendMessage. The payload ' +
    'itself is built by packages/core/avatar/blendshapeTranslator.js, which is in scope.',
};

/** Never measured: tests, fixtures and type declarations. */
export const IGNORE = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.d\.ts$/,
  /__tests__\//,
  /__mocks__\//,
];

/** Extensions that count as source. */
export const EXTENSIONS = ['.js', '.jsx', '.mjs', '.ts', '.tsx'];
