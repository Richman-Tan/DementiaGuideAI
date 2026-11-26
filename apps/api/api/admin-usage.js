// GET /api/admin-usage — the function the platform deploys.
//
// The handler is TypeScript in ../src (src/adminUsage.ts, wired up in
// src/entry/admin-usage.ts), bundled into ../dist/admin-usage.mjs by
// `npm run bundle -w apps/api`. See api/turn.js for why it is a bundle.
export { default } from '../dist/admin-usage.mjs';

export const config = { maxDuration: 15 };
