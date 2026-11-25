// POST /api/speak — the function the platform deploys.
//
// The handler is TypeScript in ../src (src/speak.ts, wired up in
// src/entry/speak.ts), bundled into ../dist/speak.mjs by
// `npm run bundle -w apps/api`. See api/turn.js for why it is a bundle.
export { default } from '../dist/speak.mjs';

export const config = { maxDuration: 30 };
