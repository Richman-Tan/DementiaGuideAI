# Test coverage: what "100%" means here

Agreed in October 2026. The target has two parts:

1. **Every user flow has an end-to-end test**:
   - web: Playwright, `apps/web/e2e/`;
   - iOS: Maestro on the iOS Simulator, `apps/mobile/.maestro/` (see [ios-e2e.md](ios-e2e.md)).
2. **The testable logic reaches 100% statement and line coverage**, from unit and e2e tests
   combined:
   - the web app (`apps/web/src`);
   - the shared core (`packages/core`);
   - the API (`apps/api/api`).

   Rendering and native code that no test runner can meaningfully execute is excluded **by
   file, with the reason, in [`scripts/test/coverage-scope.mjs`](../../scripts/test/coverage-scope.mjs)**.
   Nothing is hidden with ignore comments: the gate counts and lists any it finds.

Branches and functions are reported but not gated. The mobile app's statement coverage is not
part of the target: its flows are covered by the Maestro suite instead.

## How it is measured

| Source | Runner | Instrumenter | Output |
|---|---|---|---|
| Web unit | Vitest (`apps/web/tests`) | istanbul | `apps/web/coverage/coverage-final.json` |
| Web e2e | Playwright with `E2E_COVERAGE=1` | istanbul (`vite-plugin-istanbul`) | `apps/web/.coverage-e2e/*.json` |
| Mobile + core | Jest (`apps/mobile/jest.coverage.config.js`) | v8 | `apps/mobile/coverage/coverage-final.json` |
| API | Vitest (`apps/api/tests`) | istanbul | `apps/api/coverage/coverage-final.json` |

- **Web unit and web e2e are summed per statement.** They use the same instrumenter, so their
  statement maps match.
- **e2e snapshots.** The e2e page fixture (`apps/web/e2e/support.js`) saves `window.__coverage__`
  before every full navigation and at the end of each test, because a reload starts a fresh
  document.
- **Shared core.** It is credited with whichever of Jest or the web runs covers each file
  better. The two use different instrumenters, so their maps can't be summed, and this is a
  lower bound.
- **Untested files.** A source file in scope that no test ever loads counts as 0%, so it can't
  fall out of the denominator.

## Running it

```
npm run test:coverage:all            # every suite with coverage, then the gate report
node scripts/test/coverage-gate.mjs  # the report alone, from existing outputs
node scripts/test/coverage-gate.mjs --enforce   # exit 1 unless every in-scope file is at 100%
```

The report is printed and written to `coverage/gate.md`, which is git-ignored. In CI it is also
added to the job summary.

## Exclusions

The list, with the reason for each file, is `EXCLUDED` in
[`scripts/test/coverage-scope.mjs`](../../scripts/test/coverage-scope.mjs). An exclusion needs a
reason a reviewer can check: why no test runner can meaningfully execute the file. "Hard to
test" is not a reason.

| File | Why it is excluded |
|---|---|
| `apps/web/src/avatar/three/renderer.js` | Generated from the mobile WebView renderer and marked do-not-edit. It is a WebGL/Three.js scene, so its correctness is visual. The e2e suite still runs it as the fallback avatar. |
| `apps/web/src/avatar/three/audio.js` | Drives the Web Audio API (audio-clock scheduling, analyser). Its behaviour depends on a real audio clock. |
| `apps/web/src/avatar/unity/unityBridge.js` | Loads and drives the Unity WebGL runtime. The 244 MB build is git-ignored and absent from CI. |
| `apps/web/src/avatar/unity/UnityAvatarController.js` | Forwards payloads to the Unity instance. The payload builder (`packages/core/avatar/blendshapeTranslator.js`) is in scope. |

Everything else is in scope, including code that needs fakes to test:
- the avatar bridge and the headless avatar;
- the Three.js controller;
- the Unity React components;
- web speech recognition (`sttWeb.js`);
- the voice loop.
