## What and why

<!-- What changes, and what problem it solves. Link an issue if there is one. -->

## How it was verified

<!-- Say what you actually ran, not what should pass. -->

- [ ] `npm run typecheck && npm run lint && npm test` (root)
- [ ] `cd web && npm test`
- [ ] Touched `packages/core/`? The web suite above covers the shared boundary
- [ ] Touched native/Unity? `npx expo prebuild --platform android --no-install`
- [ ] Checked by hand: <!-- which screen/flow, on which platform -->

## Notes for the reviewer

<!-- Anything surprising: a trap you hit, a decision you went back and forth on,
     something deliberately left out of scope. -->
