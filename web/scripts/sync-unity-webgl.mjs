#!/usr/bin/env node
// Copies the Unity WebGL export into the web app's serving slot:
//   unity-avatar/UnityAvatarProject/Builds/WebGL/Build/  →  web/public/unity/Build/
//
// Unity names the files after productName (UnityAvatarProject.*); the web
// loader contract is unity.* (probe hits /unity/Build/unity.loader.js), so
// each file's basename is renamed with its suffix chain preserved —
// UnityAvatarProject.data.unityweb → unity.data.unityweb. A manifest.json
// records the final names so unityBridge.js needs no code change when the
// compression mode (and therefore the suffixes) changes.
//
// Size guard: Vercel caps static file uploads at 100 MB on Hobby and 1 GB on
// Pro. This project deploys on Pro (the Brotli data file is ~234 MB — HD
// meshes with ~400 blendshapes per character dominate and can't be texture-
// capped away), so files over 100 MB only WARN, and the script fails hard
// near the Pro ceiling.
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(webRoot, '../unity-avatar/UnityAvatarProject/Builds/WebGL/Build');
const dest = join(webRoot, 'public', 'unity', 'Build');
const HOBBY_BYTES = 100 * 1024 * 1024; // Hobby per-file cap — warn only
const MAX_BYTES = 950 * 1024 * 1024;   // just under the Pro 1 GB cap — fail

if (!existsSync(src)) {
  console.error(`No Unity WebGL export at ${src}\nRun Tools → UaaL → Export WebGL in the Unity Editor first.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

// "UnityAvatarProject.framework.js.unityweb" → base "UnityAvatarProject",
// suffix chain ".framework.js.unityweb". Rename base → "unity".
const manifest = {};
const roleOf = (chain) =>
  chain.startsWith('.loader') ? 'loader'
    : chain.startsWith('.data') ? 'data'
      : chain.startsWith('.framework') ? 'framework'
        : chain.startsWith('.wasm') ? 'code'
          : null;

for (const entry of readdirSync(dest)) {
  const dot = entry.indexOf('.');
  if (dot <= 0) continue;
  const chain = entry.slice(dot);
  const renamed = `unity${chain}`;
  if (entry !== renamed) renameSync(join(dest, entry), join(dest, renamed));
  const role = roleOf(chain);
  if (role) manifest[role] = renamed;
}

const missing = ['loader', 'data', 'framework', 'code'].filter((r) => !manifest[r]);
if (missing.length) {
  console.error(`Export is missing expected files: ${missing.join(', ')} (found: ${readdirSync(dest).join(', ')})`);
  process.exit(1);
}

writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

let tooBig = false;
console.log(`Synced Unity WebGL build → ${dest}`);
for (const entry of readdirSync(dest)) {
  const bytes = statSync(join(dest, entry)).size;
  const mb = (bytes / 1024 / 1024).toFixed(1);
  const over = bytes >= MAX_BYTES;
  const hobby = bytes >= HOBBY_BYTES;
  tooBig = tooBig || over;
  console.log(`  ${entry.padEnd(28)} ${mb.padStart(8)} MB${over ? '  ← OVER the 1 GB Vercel Pro per-file limit' : hobby ? '  (over 100 MB — needs the Pro plan to deploy)' : ''}`);
}

if (tooBig) {
  console.error('\nBuild exceeds the Vercel Pro per-file limit — shrink it before deploying.');
  process.exit(1);
}
