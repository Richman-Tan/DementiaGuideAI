#!/usr/bin/env node
// Copies the Unity WebGL export into the web app's serving slot:
//   unity-avatar/UnityAvatarProject/Builds/WebGL/Build/  →  apps/web/public/unity/Build/
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
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(webRoot, '../../unity-avatar/UnityAvatarProject/Builds/WebGL/Build');
const dest = join(webRoot, 'public', 'unity', 'Build');
const HOBBY_BYTES = 100 * 1024 * 1024; // Hobby per-file cap — warn only
const MAX_BYTES = 950 * 1024 * 1024; // just under the Pro 1 GB cap — fail

if (!existsSync(src)) {
  console.error(
    `No Unity WebGL export at ${src}\nRun Tools → UaaL → Export WebGL in the Unity Editor first.`
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

// "UnityAvatarProject.framework.js.unityweb" → base "UnityAvatarProject",
// suffix chain ".framework.js.unityweb". Rename base → "unity".
const manifest = {};
const roleOf = (chain) =>
  chain.startsWith('.loader')
    ? 'loader'
    : chain.startsWith('.data')
      ? 'data'
      : chain.startsWith('.framework')
        ? 'framework'
        : chain.startsWith('.wasm')
          ? 'code'
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
  console.error(
    `Export is missing expected files: ${missing.join(', ')} (found: ${readdirSync(dest).join(', ')})`
  );
  process.exit(1);
}

// Version stamp = content hash of the engine + data. The served filenames are
// stable and cached for a day, so WITHOUT this a redeploy leaves browsers
// mixing an old wasm with a new data file — which crashes the engine deep in
// its deserializer (an infinite-recursion stack overflow, not an obvious
// "mismatched files" error). unityBridge appends it to every build URL.
//
// SERVING_REV additionally busts the cache when only the *response headers*
// change while the bytes stay identical. Chrome replays a cached response with
// the headers it was stored with, so after the Content-Encoding fix a returning
// visitor would otherwise keep replaying the old unlabelled entry — and keep
// paying the 20-minute main-thread decompress — for a full max-age window.
// Bump this whenever how the files are SERVED changes.
const SERVING_REV = 2; // 2 = Content-Encoding: br + Content-Type per file

manifest.version = createHash('sha256')
  .update(readFileSync(join(dest, manifest.code)))
  .update(readFileSync(join(dest, manifest.framework)))
  .update(String(statSync(join(dest, manifest.data)).size))
  .update(`serving-rev-${SERVING_REV}`)
  .digest('hex')
  .slice(0, 12);

writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Build version: ${manifest.version}`);

// --- Compression / header contract -----------------------------------------
// The compressed build files are only usable at speed if the CDN labels them
// with a Content-Encoding the browser can decode NATIVELY. Without it Unity's
// loader silently falls back to decompressing in JavaScript on the main thread
// — which took >20 minutes on the 245MB data file and pinned the tab, with no
// error anywhere. vercel.json therefore pins a header rule per build file, and
// because those rules name the files literally, a compression-mode change
// (which renames .unityweb → .br) would stop matching them silently. Fail the
// sync instead: an unshippable build beats a build that loads for 20 minutes.
function detectEncoding(file) {
  const buf = Buffer.alloc(64);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buf, 0, 64, 0);
  } finally {
    closeSync(fd);
  }
  // Unity's decompression-fallback files carry a marker in a skippable
  // metadata block (which is why they are still valid br/gzip streams).
  const head = buf.toString('latin1');
  if (head.includes('UnityWeb Compressed Content (brotli)') || file.endsWith('.br')) return 'br';
  if (head.includes('UnityWeb Compressed Content (gzip)') || (buf[0] === 0x1f && buf[1] === 0x8b))
    return 'gzip';
  return null; // uncompressed — served as-is, no header needed
}

const REQUIRED_TYPE = { code: 'application/wasm' }; // nosniff + streaming compile
const vercelPath = join(webRoot, 'vercel.json');
const rules = JSON.parse(readFileSync(vercelPath, 'utf8')).headers ?? [];
const headerFor = (name) => {
  const rule = rules.find((r) => r.source === `/unity/Build/${name}`);
  return Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]));
};

const headerProblems = [];
for (const [role, name] of Object.entries(manifest)) {
  if (role === 'version') continue;
  const encoding = detectEncoding(join(dest, name));
  const sent = headerFor(name);
  if (encoding && sent['Content-Encoding'] !== encoding) {
    headerProblems.push(
      `  ${name}: is ${encoding}-compressed but vercel.json sends Content-Encoding: ${sent['Content-Encoding'] ?? '(none)'}`
    );
  }
  if (REQUIRED_TYPE[role] && sent['Content-Type'] !== REQUIRED_TYPE[role]) {
    headerProblems.push(
      `  ${name}: needs Content-Type: ${REQUIRED_TYPE[role]}, vercel.json sends ${sent['Content-Type'] ?? '(none)'}`
    );
  }
}

if (headerProblems.length) {
  console.error(
    `\nvercel.json does not match this build's files:\n${headerProblems.join('\n')}\n\n` +
      'Update the "/unity/Build/<file>" header rules in apps/web/vercel.json (and the\n' +
      'UNITY_COMPRESSED_TYPES map in apps/web/vite.config.js) to match the names above.\n' +
      'Shipping without them makes the browser decompress ~245MB in JS on the main\n' +
      'thread — a >20 minute load that reports no error.'
  );
  process.exit(1);
}

let tooBig = false;
console.log(`Synced Unity WebGL build → ${dest}`);
for (const entry of readdirSync(dest)) {
  const bytes = statSync(join(dest, entry)).size;
  const mb = (bytes / 1024 / 1024).toFixed(1);
  const over = bytes >= MAX_BYTES;
  const hobby = bytes >= HOBBY_BYTES;
  tooBig = tooBig || over;
  console.log(
    `  ${entry.padEnd(28)} ${mb.padStart(8)} MB${over ? '  ← OVER the 1 GB Vercel Pro per-file limit' : hobby ? '  (over 100 MB — needs the Pro plan to deploy)' : ''}`
  );
}

if (tooBig) {
  console.error('\nBuild exceeds the Vercel Pro per-file limit — shrink it before deploying.');
  process.exit(1);
}
