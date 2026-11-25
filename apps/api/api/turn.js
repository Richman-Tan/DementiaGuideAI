// POST /api/turn — the function the platform deploys.
//
// The handler is TypeScript in ../src (src/turn.ts, wired up in
// src/entry/turn.ts) and is bundled, together with the shared pipeline from
// packages/core, into ../dist/turn.mjs by `npm run bundle -w apps/api`. A bundle
// rather than a direct import: a workspace package specifier resolves at build
// time on the platform and then fails at run time, and the core's TypeScript
// needs compiling somewhere.
export { default } from '../dist/turn.mjs';

// A turn streams for as long as the model writes; allow a full minute.
export const config = { maxDuration: 60 };
