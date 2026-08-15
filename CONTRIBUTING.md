# Contributing

Notes for anyone working in this repo — including future me.

## Setup

Node 20 (see `.nvmrc`). The repo holds **two** npm projects:

```bash
npm install            # mobile app + shared core + scripts (repo root)
cd web && npm install  # web app
```

The Unity project is a submodule and is only needed for avatar work:

```bash
git submodule update --init
```

## Where code goes

| Putting something in… | …means it must |
|---|---|
| `packages/core/` | have **no platform imports and no outward dependencies** — it runs on mobile, web and in Node. See [`packages/core/README.md`](packages/core/README.md). |
| `src/` | be mobile-only (React Native, Expo APIs, native modules) |
| `web/src/` | be web-only (DOM, browser audio, Vite) |

If two surfaces need the same logic, it belongs in `packages/core` — not
copy-pasted, and not imported across app boundaries.

## Before you push

Both suites, from their own directories:

```bash
npm run typecheck && npm run lint && npm test   # root
cd web && npm test                              # web
```

CI runs exactly these plus `expo prebuild` for both platforms. Lint currently
reports ~138 warnings and **0 errors** — keep errors at zero; the warnings are a
known backlog, so don't let a new error hide in the noise.

Touching anything under `packages/core`? Run the web suite too — `web/tests/interop.test.js`
is what catches a break in the shared boundary.

## Things that will bite you

- **Path aliases are declared in four places.** `@core` lives in
  `babel.config.js`, `tsconfig.json`, `jest.config.js` and `web/vite.config.js`.
  Changing one without the others breaks a surface you may not be testing.
- **Never run `expo prebuild` from inside `web/`.** Expo will treat the Vite app
  as a React Native project and write `android/`, `app.json` and RN dependencies
  into it. `android/` and `ios/` are generated at the repo root only.
- **`web/public/unity/Build/` is a build artefact**, not source. Regenerate with
  `npm run sync:unity`; that script also verifies `web/vercel.json` still sends
  the right `Content-Encoding` headers and will fail the sync if not.
- **Don't commit build output.** `**/android/build/` and `.gradle/` are ignored;
  the module's `android/build.gradle` is source and stays tracked.
- **`docs/report/` paths are stable on purpose** — they may be cited in
  submitted academic work. Don't reorganise that folder.

## Commits and branches

Conventional Commits (`feat(web): …`, `fix: …`, `docs: …`, `chore: …`), which is
what the existing history uses. Branch off `main`, open a PR, let CI pass.
