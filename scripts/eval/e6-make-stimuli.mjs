#!/usr/bin/env node
// E6 perceptual lip-sync test — build the stimulus clips (docs/eval/evaluation-plan.md, E6).
//
// Plan: "8–10 caregiver sentences, real ElevenLabs audio, Aaron, recorded from
// the web build twice: engine (`visemes`) vs legacy (`blendshapes` only)", plus
// an optional "static mouth" control pair. This script does exactly that:
//
//   1. ElevenLabs /with-timestamps for each sentence in scripts/eval/e6/sentences.json,
//      with the web app's request (Brian voice, eleven_turbo_v2_5, mp3_44100_64,
//      the same voice_settings, speech rate 0.78) after normalizeSpokenText().
//      Responses are cached in <out>/tts/, so a re-run never re-bills.
//   2. The production lip-sync code builds the payload: createVisemeTimeline()
//      → segmentToCC4Payload() → { visemes, blendshapes }, emotion from
//      detectSentiment(), as apps/web/src/voice + UnityAvatarController do.
//   3. Chrome opens scripts/eval/e6/recorder.html against the real Unity WebGL
//      build (apps/web/public/unity/Build) and steps it in VIRTUAL TIME, one
//      exact 1/fps frame at a time, grabbing every frame (see recorder.html for
//      why real-time capture was not good enough). Conditions differ ONLY in the
//      play message:
//        engine — { visemes, blendshapes }   (what production sends)
//        legacy — { blendshapes }            (Unity's keyframe fallback: the plan's
//                                             `?lipsync=legacy` flag, without editing app code)
//        static — no play message            (control: mouth at rest)
//   4. ffmpeg joins the frames at a constant frame rate and lays the original
//      ElevenLabs audio in at play-message time + 10 ms (the app's look-ahead).
//   5. Clips get random IDs. The rating folder (<out>/rating/) holds the page,
//      the clips and a pair list with NO condition labels; the condition key is
//      written to <out>/key/e6-key.json, outside the folder raters see.
//
// Credentials (one of):
//   ELEVENLABS_API_KEY=…                      direct, as the bring-your-own-key app does
//   E6_ACCESS_CODE=… E6_API_BASE=https://…    via the deployed apps/api proxy
//                                             (writes one usage-meter row per sentence)
//
//   node scripts/eval/e6-make-stimuli.mjs [--out docs/eval/human/private/e6]
//        [--unity-build apps/web/public/unity/Build] [--chrome <path>] [--windowed]
//        [--tts-only] [--skip-tts] [--canvas 1080x1440] [--crop 0.50:0.50:0.25:0.05]
//        [--fps 60] [--keep-frames] [--timeout-min 30] [--limit N]
//
// The output folder must be git-ignored when it is inside the repo (the script
// refuses otherwise): clips and the key are study material, not source.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync, statSync, readdirSync, createReadStream } from 'node:fs';
import { resolve, dirname, join, extname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HERE = resolve(ROOT, 'scripts/eval/e6');
const require = createRequire(import.meta.url);
const { loadModule } = require(resolve(ROOT, 'unity-avatar/tools/esm-loader.js'));

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const flag = (n) => args.includes(n);
const abs = (p) => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const OUT = abs(argVal('--out', resolve(ROOT, 'docs/eval/human/private/e6')));
const UNITY_BUILD = abs(argVal('--unity-build', resolve(ROOT, 'apps/web/public/unity/Build')));
// Headless by default: on Apple silicon it renders through the same ANGLE/Metal GPU
// path as a window (logged as `renderer` in the key), opens nothing and makes no sound.
const HEADLESS = !flag('--windowed');
const TTS_ONLY = flag('--tts-only');
const SKIP_TTS = flag('--skip-tts');
const KEEP_FRAMES = flag('--keep-frames');
const [CANVAS_W, CANVAS_H] = String(argVal('--canvas', '1080x1440')).split('x').map(Number);
// Crop as fractions of the canvas: width:height:left:top. The web build frames
// head-to-hip (WebGLCameraFraming.cs, vFOV 25); lip-sync is judged on the face,
// so clips are cropped to head-and-shoulders (540×720 at the default canvas,
// no rescaling). The same crop applies to every clip.
const CROP = String(argVal('--crop', '0.50:0.50:0.25:0.05')).split(':').map(Number);
const FPS = Number(argVal('--fps', 60));
const TIMEOUT_MIN = Number(argVal('--timeout-min', 30));
const LIMIT = Number(argVal('--limit', 0)); // smoke runs: the first N-1 main pairs + the control pair
const SENTENCES = JSON.parse(readFileSync(resolve(HERE, 'sentences.json'), 'utf8'));

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || '';
const ACCESS_CODE = process.env.E6_ACCESS_CODE || '';
const API_BASE = (process.env.E6_API_BASE || '').replace(/\/$/, '');
const MODEL_ID = 'eleven_turbo_v2_5'; // apps/web/src/services/ttsClient.js + apps/api/api/eleven-tts.js

function die(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ── Safety: private output must not land in a tracked path ───────────────────
function assertPrivate(dir) {
  const rel = relative(ROOT, dir);
  if (rel.startsWith('..') || isAbsolute(rel)) return; // outside the repo
  const r = spawnSync('git', ['check-ignore', '-q', join(dir, 'probe.mp4')], { cwd: ROOT });
  if (r.status !== 0) die(`${dir} is inside the repo and NOT git-ignored. Clips, the key and responses are private — use docs/eval/human/private/… or a folder outside the repo.`);
}

// ── Production modules ───────────────────────────────────────────────────────
const LIPSYNC = resolve(ROOT, 'packages/core/lipsync');
const { createVisemeTimeline } = loadModule('createVisemeTimeline.js', LIPSYNC);
const { segmentToCC4Payload } = loadModule(resolve(ROOT, 'packages/core/avatar/blendshapeTranslator.js'));
const { normalizeSpokenText } = loadModule(resolve(ROOT, 'packages/core/tts/normalizeSpokenText.js'));

function loadDetectSentiment() {
  // detectSentiment is TypeScript; transpile it with the repo's own compiler.
  let ts;
  try { ts = require(require.resolve('typescript', { paths: [ROOT, process.cwd()] })); }
  catch { die('typescript not found — run `npm ci` in the repo root first.'); }
  const src = readFileSync(resolve(ROOT, 'packages/core/sentiment/detectSentiment.ts'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
  return mod.exports.detectSentiment;
}

// ── 1. TTS (cached) ──────────────────────────────────────────────────────────
async function fetchTts(text, voiceId, speechRate) {
  if (ELEVEN_KEY) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        output_format: 'mp3_44100_64',
        voice_settings: { stability: 0.40, similarity_boost: 0.75, style: 0.20, speed: speechRate },
      }),
    });
    if (!r.ok) die(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return { via: 'direct', data: await r.json() };
  }
  if (ACCESS_CODE && API_BASE) {
    const r = await fetch(`${API_BASE}/api/eleven-tts`, {
      method: 'POST',
      headers: { 'x-study-code': ACCESS_CODE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId, speechRate }),
    });
    if (!r.ok) die(`proxy ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return { via: 'proxy', data: await r.json() };
  }
  die('No TTS credentials. Set ELEVENLABS_API_KEY (preferred) or E6_ACCESS_CODE + E6_API_BASE. Cached responses in <out>/tts/ are reused without credentials.');
}

async function ensureTts(items) {
  mkdirSync(join(OUT, 'tts'), { recursive: true });
  mkdirSync(join(OUT, 'audio'), { recursive: true });
  const { elevenVoiceId, speechRate } = SENTENCES.voice;
  for (const s of items) {
    const cache = join(OUT, 'tts', `${s.id}.json`);
    const spoken = normalizeSpokenText(s.text);
    if (!existsSync(cache)) {
      if (SKIP_TTS) die(`--skip-tts but no cached TTS for ${s.id}`);
      process.stdout.write(`  TTS ${s.id} … `);
      const { via, data } = await fetchTts(spoken, elevenVoiceId, speechRate);
      if (!data.audio_base64 || !data.alignment) die(`response for ${s.id} lacks audio or alignment`);
      writeFileSync(cache, JSON.stringify({
        request: { text: spoken, voiceId: elevenVoiceId, model: MODEL_ID, outputFormat: 'mp3_44100_64', speechRate, via },
        fetchedAt: new Date().toISOString(),
        response: data,
      }));
      console.log('ok');
    }
    const cached = JSON.parse(readFileSync(cache, 'utf8'));
    if (cached.request.text !== spoken) die(`cached TTS for ${s.id} was made for different text; delete ${cache}`);
    writeFileSync(join(OUT, 'audio', `${s.id}.mp3`), Buffer.from(cached.response.audio_base64, 'base64'));
    s.alignment = cached.response.alignment;
    s.tts = cached.request;
  }
}

// ── 2. Payloads (production code path) ───────────────────────────────────────
function buildPayloads(s, detectSentiment) {
  // ttsClient: createVisemeTimeline(alignment, { visemeWeights: undefined }) for Aaron (visemeWeights null).
  const visemeTimeline = createVisemeTimeline(s.alignment, { visemeWeights: undefined });
  // useVoiceConversation: segment = { ...ttsResult, text: clean, emotion: detectSentiment(clean) }.
  const segment = { audio: null, visemeTimeline, text: s.text, emotion: detectSentiment(s.text) };
  const cc4 = segmentToCC4Payload(segment, null);
  const duration = visemeTimeline?.totalDuration ?? 0;
  // UnityAvatarController.playAudio sends exactly these fields.
  const engine = { type: 'play', duration, visemes: cc4.visemes, blendshapes: cc4.blendshapes, emotion: cc4.emotion, text: cc4.text };
  const legacy = { type: 'play', duration, blendshapes: cc4.blendshapes, emotion: cc4.emotion, text: cc4.text };
  return { engine, legacy, emotion: cc4.emotion, duration, visemeCount: cc4.visemes.length, keyframeCount: cc4.blendshapes.length };
}

// ── 3. Record in Chrome (virtual time) ───────────────────────────────────────
const UNITY_TYPES = {
  '.data.unityweb': 'application/octet-stream',
  '.framework.js.unityweb': 'text/javascript',
  '.wasm.unityweb': 'application/wasm',
};

function findChrome() {
  const cands = [argVal('--chrome'), process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  const hit = cands.find((p) => existsSync(p));
  if (!hit) die('Chrome not found — pass --chrome <path to the Chrome binary>.');
  return hit;
}

const frameDir = (clipId) => join(OUT, 'frames', clipId);

async function record(job) {
  rmSync(join(OUT, 'frames'), { recursive: true, force: true });
  const logLines = [];
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', (d) => chunks.push(d));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        if (p === '/frame') {
          const dir = frameDir(url.searchParams.get('clip').replace(/[^a-z0-9]/gi, ''));
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `f_${String(Number(url.searchParams.get('n'))).padStart(5, '0')}.jpg`), Buffer.from(body.toString('latin1'), 'base64'));
        } else if (p === '/log') {
          const e = JSON.parse(body.toString());
          logLines.push(e);
          if (e.event === 'unity-ready') console.log(`  Unity ready (${e.bootMs} ms) · ${e.renderer}`);
          if (e.event === 'warm') console.log(`  backbuffer ${e.backbuffer}, crop ${e.crop.sw}x${e.crop.sh} at ${e.crop.sx},${e.crop.sy}`);
          if (e.event === 'clip') process.stdout.write(`  clip ${logLines.filter((x) => x.event === 'clip').length}/${job.clips.length} (${e.frames} frames)\n`);
        } else if (p === '/done') resolveDone(JSON.parse(body.toString()));
        res.writeHead(204).end();
      });
      return;
    }
    let file = null; let headers = {};
    if (p === '/' || p === '/recorder.html') { file = join(HERE, 'recorder.html'); headers['Content-Type'] = 'text/html; charset=utf-8'; }
    else if (p === '/job.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(job)); return; }
    else if (p.startsWith('/audio/')) { file = join(OUT, 'audio', p.slice(7).replace(/[^A-Za-z0-9_.]/g, '')); headers['Content-Type'] = 'audio/mpeg'; }
    else if (p.startsWith('/unity/Build/')) {
      file = join(UNITY_BUILD, p.slice('/unity/Build/'.length).replace(/\.\./g, ''));
      const suffix = Object.keys(UNITY_TYPES).find((s) => p.endsWith(s));
      // Same headers as vite.config.js / vercel.json: native brotli decode, or the
      // loader's JS fallback takes ~20 minutes for the 245 MB data file.
      if (suffix) headers = { 'Content-Encoding': 'br', 'Content-Type': UNITY_TYPES[suffix] };
      else if (extname(p) === '.js') headers['Content-Type'] = 'text/javascript';
      else if (extname(p) === '.json') headers['Content-Type'] = 'application/json';
    }
    if (!file || !existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { ...headers, 'Content-Length': statSync(file).size, 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const profile = join(tmpdir(), `e6-chrome-${process.pid}`);
  const chromeArgs = [
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    // Silent by construction: the recorder only decodes audio (OfflineAudioContext)
    // and ffmpeg adds it later, and Chrome is muted as well, so nothing plays aloud.
    '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--force-device-scale-factor=1',
    `--window-size=${Math.min(job.canvas.width, 1200)},${Math.min(job.canvas.height, 900)}`, '--window-position=40,40',
    ...(HEADLESS ? ['--headless=new'] : []),
    `--app=http://127.0.0.1:${port}/recorder.html`,
  ];
  const chrome = spawn(findChrome(), chromeArgs, { stdio: 'ignore' });
  const timer = setTimeout(() => resolveDone({ ok: false, error: `timed out after ${TIMEOUT_MIN} min` }), TIMEOUT_MIN * 60000);
  const result = await done;
  clearTimeout(timer);
  const exited = new Promise((r) => chrome.once('exit', r));
  chrome.kill('SIGTERM');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
  server.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp profile; the OS cleans it */ }
  if (!result.ok) die(`recorder failed: ${result.error}`);
  return { log: logLines, unityLines: result.unityLines ?? [] };
}

// ── 4. Encode: constant-rate frames + the original audio at play + 10 ms ─────
function encode(clip, rec, outFile) {
  const n = readdirSync(frameDir(clip.clipId)).filter((f) => f.endsWith('.jpg')).length;
  if (n !== rec.frames) die(`${clip.clipId}: expected ${rec.frames} frames, found ${n}`);
  const delayMs = Math.round(rec.audioStartMs);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(rec.fps), '-i', join(frameDir(clip.clipId), 'f_%05d.jpg'),
    '-i', join(OUT, 'audio', `${clip.sentenceId}.mp3`),
    '-filter_complex', `[1:a]adelay=delays=${delayMs}:all=1,apad[a]`,
    '-map', '0:v', '-map', '[a]', '-shortest',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(rec.fps),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', outFile], { encoding: 'utf8' });
  if (r.status !== 0) die(`ffmpeg failed for ${clip.clipId}: ${r.stderr}`);
}

function probeDuration(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  assertPrivate(OUT);
  mkdirSync(OUT, { recursive: true });
  let items = [...SENTENCES.main.map((s) => ({ ...s, role: 'main' })), ...SENTENCES.control.map((s) => ({ ...s, role: 'control' }))];
  if (LIMIT > 0) items = [...items.slice(0, LIMIT - 1), items[items.length - 1]];
  console.log(`E6 stimuli → ${OUT}`);
  await ensureTts(items);
  if (TTS_ONLY) { console.log('TTS cached; stopping (--tts-only).'); return; }

  if (!existsSync(join(UNITY_BUILD, 'manifest.json'))) die(`No Unity WebGL build at ${UNITY_BUILD} (manifest.json missing). Pass --unity-build <dir>.`);
  const manifest = JSON.parse(readFileSync(join(UNITY_BUILD, 'manifest.json'), 'utf8'));
  const detectSentiment = loadDetectSentiment();

  // Clips: main → engine + legacy; control → engine + static. Random IDs hide the condition.
  const usedIds = new Set();
  const newId = () => { let id; do { id = 'v' + randomBytes(4).toString('hex'); } while (usedIds.has(id)); usedIds.add(id); return id; };
  const clips = [];
  const pairs = [];
  for (const s of items) {
    const p = buildPayloads(s, detectSentiment);
    s.payloadStats = { emotion: p.emotion, duration: p.duration, visemes: p.visemeCount, keyframes: p.keyframeCount };
    const conds = s.role === 'main' ? ['engine', 'legacy'] : ['engine', 'static'];
    const ids = conds.map((condition) => {
      const clipId = newId();
      clips.push({ clipId, sentenceId: s.id, role: s.role, condition,
        audioUrl: `/audio/${s.id}.mp3`, payload: condition === 'static' ? null : p[condition] });
      return clipId;
    });
    pairs.push({ pairId: s.role === 'main' ? `P${s.id.slice(1)}` : `K${s.id.slice(1)}`, sentenceId: s.id, role: s.role, clips: ids });
  }
  // Record in a random order so warm-up or drift cannot line up with a condition.
  const order = clips.map((c) => [randomBytes(4).readUInt32BE(0), c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c);

  const job = {
    buildBase: '/unity/Build/', manifest, character: SENTENCES.voice.character,
    canvas: { width: CANVAS_W, height: CANVAS_H }, crop: CROP, fps: FPS, jpegQuality: 0.93,
    warmupMs: 4000, settleMs: 1500, leadInMs: 700, stateLeadMs: 300, tailMs: 700,
    clips: order.map(({ clipId, audioUrl, payload }) => ({ clipId, audioUrl, payload })),
  };
  console.log(`  ${clips.length} clips (${pairs.length} pairs) at ${FPS} fps; Chrome ${HEADLESS ? 'headless' : 'windowed'}, muted — the full set takes roughly 20–25 minutes`);
  const rec = await record(job);
  const recById = Object.fromEntries(rec.log.filter((e) => e.event === 'clip').map((e) => [e.clipId, e]));

  const ratingDir = join(OUT, 'rating');
  const clipDir = join(ratingDir, 'clips');
  rmSync(ratingDir, { recursive: true, force: true });
  mkdirSync(clipDir, { recursive: true });
  process.stdout.write('  encoding ');
  for (const c of clips) {
    const r = recById[c.clipId];
    if (!r) die(`no recording log for ${c.clipId}`);
    if (r.sentPlay !== (c.condition !== 'static')) die(`${c.clipId}: play message ${r.sentPlay ? 'sent' : 'missing'} for condition ${c.condition}`);
    const outFile = join(clipDir, `${c.clipId}.mp4`);
    encode(c, r, outFile);
    c.seconds = Number(probeDuration(outFile).toFixed(2));
    c.sha256 = sha256(readFileSync(outFile));
    c.audioStartMs = r.audioStartMs;
    process.stdout.write('.');
  }
  console.log('');
  if (!KEEP_FRAMES) rmSync(join(OUT, 'frames'), { recursive: true, force: true });

  const stimuliId = `e6-${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;
  copyFileSync(join(HERE, 'rating.html'), join(ratingDir, 'index.html'));
  writeFileSync(join(ratingDir, 'stimuli.js'),
    '// Generated by scripts/eval/e6-make-stimuli.mjs — pair list only; conditions are in the key, not here.\n' +
    `window.E6_STIMULI = ${JSON.stringify({ stimuliId, pairs: pairs.map(({ pairId, role, clips: ids }) => ({ pairId, role, clips: ids })) }, null, 1)};\n`);

  mkdirSync(join(OUT, 'key'), { recursive: true });
  const gitSha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const ready = rec.log.find((e) => e.event === 'unity-ready') ?? {};
  writeFileSync(join(OUT, 'key', 'e6-key.json'), JSON.stringify({
    stimuliId, createdAt: new Date().toISOString(), gitSha,
    unityBuild: { dir: UNITY_BUILD, version: manifest.version ?? null },
    capture: { method: 'virtual-time frame stepping', canvas: job.canvas, crop: CROP, fps: FPS, chrome: HEADLESS ? 'headless' : 'windowed', renderer: ready.renderer ?? null, audioOffset: 'play message + 10 ms' },
    conditions: {
      engine: 'production payload {visemes, blendshapes} — co-articulation engine',
      legacy: 'payload {blendshapes} only — legacy keyframe track',
      static: 'no play message — mouth at rest (control)',
    },
    sentences: items.map(({ id, role, source, text, tts, payloadStats }) => ({ id, role, source, text, tts, payloadStats })),
    clips: Object.fromEntries(clips.map(({ clipId, sentenceId, role, condition, seconds, audioStartMs, sha256: h }) => [clipId, { sentenceId, role, condition, seconds, audioStartMs, sha256: h }])),
    pairs,
    recorderLog: rec.log,
    unityLog: rec.unityLines,
  }, null, 1));

  const secs = clips.map((c) => c.seconds);
  console.log(`\n✓ ${clips.length} clips, ${Math.min(...secs)}–${Math.max(...secs)} s each`);
  console.log(`  rating folder : ${ratingDir}   (give raters THIS folder only)`);
  console.log(`  condition key : ${join(OUT, 'key', 'e6-key.json')}   (keep it away from raters; e6-analyse.mjs needs it)`);
}

main().catch((err) => die(err?.stack ?? String(err)));
