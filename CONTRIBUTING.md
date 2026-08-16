# Contributing

Notes for anyone working in this repo — including future me.

## Setup

Node 20 (see `.nvmrc`). This is an npm-workspaces monorepo — one lockfile, one
install, from the repo root:

```bash
npm install
```

That covers `apps/mobile`, `apps/web` and `packages/core`. Don't run `npm install`
inside a workspace; it will create a nested `node_modules` and undo the hoisting
that keeps `react`, `three` and `@supabase/supabase-js` at a single shared copy.

The Unity project is a submodule and is only needed for avatar work:

```bash
git submodule update --init
```

## Where code goes

| Putting something in… | …means it must |
|---|---|
| `packages/core/` | have **no platform imports and no outward dependencies** — it runs on mobile, web and in Node. See [`packages/core/README.md`](packages/core/README.md). |
| `apps/mobile/src/` | be mobile-only (React Native, Expo APIs, native modules) |
| `apps/web/src/` | be web-only (DOM, browser audio, Vite) |
| `assets/` | be a binary asset both apps load (`@assets/…`). App icons go in `apps/mobile/assets/`. |

If two surfaces need the same logic, it belongs in `packages/core` — not
copy-pasted, and not imported across app boundaries.

## Before you push

Everything, from the repo root:

```bash
npm run typecheck && npm run lint && npm test
```

`npm test` runs both suites — Jest over `apps/mobile`, `packages/core` and
`scripts/`, then Vitest over `apps/web`. CI runs exactly these plus
`expo prebuild` for both platforms.

Lint currently reports ~155 warnings and **0 errors** — keep errors at zero; the
warnings are a known backlog, so don't let a new error hide in the noise.

Touching anything under `packages/core`? The web suite is what catches a break in
the shared boundary — `apps/web/tests/interop.test.js` imports core the way the
web app does, so a broken alias or a stray platform import fails there first.

## Things that will bite you

- **Path aliases are declared in four places.** `@core` lives in
  `apps/mobile/{babel.config.js,tsconfig.json,jest.config.js}` and
  `apps/web/vite.config.js`. Changing one without the others breaks a surface you
  may not be testing. `@assets` lives in the babel and vite configs.
- **Metro only resolves what it watches.** `packages/core` and `assets/` sit
  outside the app, so they are named in `apps/mobile/metro.config.js`
  `watchFolders`. A new shared directory at the root needs adding there or the
  mobile bundle will fail to resolve it.
- **Anything outside an app needs its `../` depth checked.** The move to `apps/`
  broke `sync-unity-webgl.mjs` this way — it resolved `unity-avatar` one level
  short and simply reported "no export found". Grep for `'../` in build scripts.
- **Never run `expo prebuild` from inside `apps/web/`.** Expo will treat the Vite
  app as a React Native project and write `android/`, `app.json` and RN
  dependencies into it. A shell's working directory persists, so a stray
  `cd apps/web` from an earlier command is enough to trigger it.
- **`apps/web/public/unity/Build/` is a build artefact**, not source. Regenerate
  with `npm run sync:unity -w apps/web`; that script also verifies
  `apps/web/vercel.json` still sends the right `Content-Encoding` headers and
  will fail the sync if not.
- **Don't commit build output.** `**/android/build/` and `.gradle/` are ignored;
  the module's `android/build.gradle` is source and stays tracked.
- **`@supabase/supabase-js` is pinned to an exact version**, not a range, because
  `patches/` carries a Hermes dynamic-import fix and patch-package matches on the
  exact version. Bumping it means regenerating the patch, or the fix silently
  stops applying.
- **`docs/report/` paths are stable on purpose** — they may be cited in
  submitted academic work. Don't reorganise that folder, and note that it cites
  `scripts/parse-latency.mjs` and `scripts/make-figures.py`, which is why those
  two stay at the top level of `scripts/`.

## Commits and branches

Conventional Commits (`feat(web): …`, `fix: …`, `docs: …`, `chore: …`), which is
what the existing history uses. Branch off `main`, open a PR, let CI pass.
