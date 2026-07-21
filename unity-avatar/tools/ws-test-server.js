/**
 * CC4 blendshape relay server — v2.
 *
 * In live mode (default): accepts a CC4AudioPayload via HTTP POST /segment and
 * streams the blendshape frames to Unity clients over WebSocket at 60 fps.
 * Use this to test the Unity BlendshapeReceiver against real TTS output from
 * the RN dev app without needing the full UaaL native module.
 *
 * In demo mode (--demo flag): loops a pre-baked 3.5 s "Hello, how are you
 * feeling today?" keyframe set for quick renderer smoke-tests.
 *
 * Usage:
 *   cd unity-avatar/tools
 *   npm install
 *   node ws-test-server.js          — live relay (waits for POST /segment)
 *   node ws-test-server.js --demo   — loops built-in demo keyframes
 *
 * HTTP endpoints (port 9001):
 *   GET  /status   → { version, clients, playing, demoMode }
 *   POST /segment  ← { blendshapes: [{time, weights}], duration, text?, emotion? }
 *   POST /stop     → zeros all weights and halts playback
 *
 * WebSocket protocol (ws://localhost:9001):
 *   server → client  { type: 'ready',   version: 2 }            on connect
 *   server → client  { type: 'weights', weights: {[shape]: 0–1} } at 60 fps
 *   server → client  { type: 'clear' }                          when segment ends
 *
 * CC4 blendshape naming reference (CC_Base_Body SkinnedMeshRenderer):
 *   V_Lip_Open, V_Open, V_Wide, V_Tight, V_Tight_O  — phoneme posture shapes
 *   V_Explosive                                      — bilabial closure (p/b/m)
 *   V_Dental_Lip                                     — labiodental contact (f/v)
 *   V_Affricate                                      — palatal rounded (ch/sh/j)
 *   Mouth_Lips_Pull_DL/DR/UL/UR                      — quadrant lip pulls
 *   Mouth_Lips_Press_L/R                             — bilabial press (symmetric)
 *   jaw_drive                                        — bone rotation, NOT a
 *                                                      blendshape; handled by
 *                                                      AvatarController separately
 *
 * DEVELOPMENT ONLY. For iOS production the RN app communicates with Unity via
 * the native UaaL bridge (NativeUnityAvatarModule), with no Node server in the
 * middle. Never route production iOS traffic through this server.
 */

const http      = require('http');
const WebSocket = require('ws');

const PORT      = 9001;
const FPS       = 60;
const FRAME_MS  = 1000 / FPS;
const VERSION   = 2;
const DEMO_MODE = process.argv.includes('--demo');

// ── Demo keyframes ─────────────────────────────────────────────────────────────
// Sentence: "Hello, how are you feeling today?"
// Weights are 0.0–1.0, matching AvatarController.SetTargetWeights() input range.
// Only used when --demo flag is set; ignored in live relay mode.
const DEMO_KEYFRAMES = [
  { t: 0.00, w: {} },

  // "Hel-" (h + eh) — small open, wide-ish
  { t: 0.28, w: { jaw_drive: 0.42, V_Lip_Open: 0.40, V_Wide: 0.65,
                  Mouth_Lips_Pull_DL: 0.20, Mouth_Lips_Pull_DR: 0.20 } },

  // "-lo" (l + oh) — rounded open
  { t: 0.46, w: { jaw_drive: 0.70, V_Lip_Open: 0.65, V_Open: 0.58,
                  Mouth_Lips_Pull_DL: 0.35, Mouth_Lips_Pull_DR: 0.35,
                  Mouth_Lips_Pull_UL: 0.22, Mouth_Lips_Pull_UR: 0.22 } },

  { t: 0.68, w: {} }, // inter-word pause

  // "how" (h + aa) — widest open
  { t: 0.94, w: { jaw_drive: 1.00, V_Lip_Open: 0.90, V_Open: 0.80,
                  Mouth_Lips_Pull_DL: 0.45, Mouth_Lips_Pull_DR: 0.45,
                  Mouth_Lips_Pull_UL: 0.30, Mouth_Lips_Pull_UR: 0.30 } },

  // "are" (aa → rr)
  { t: 1.16, w: { jaw_drive: 0.88, V_Lip_Open: 0.80, V_Open: 0.72,
                  Mouth_Lips_Pull_DL: 0.40, Mouth_Lips_Pull_DR: 0.40 } },
  { t: 1.30, w: { jaw_drive: 0.26, V_Lip_Open: 0.22, V_Tight_O: 0.48 } },

  // "you" (y + oo) — tight rounded
  { t: 1.44, w: { jaw_drive: 0.24, V_Lip_Open: 0.22, V_Tight_O: 1.00 } },

  // "feel-" (f) — labiodental
  { t: 1.62, w: { V_Dental_Lip: 1.00, jaw_drive: 0.08 } },

  // "-ing" (ee + ng)
  { t: 1.76, w: { jaw_drive: 0.18, V_Lip_Open: 0.18, V_Tight: 0.90 } },
  { t: 1.92, w: { Mouth_Lips_Press_L: 0.30, Mouth_Lips_Press_R: 0.30, jaw_drive: 0.04 } },

  // "to-" (t + oh)
  { t: 2.06, w: { jaw_drive: 0.40, V_Lip_Open: 0.35, V_Open: 0.38,
                  Mouth_Lips_Pull_DL: 0.20, Mouth_Lips_Pull_DR: 0.20 } },
  { t: 2.18, w: { jaw_drive: 0.70, V_Lip_Open: 0.65, V_Open: 0.56,
                  Mouth_Lips_Pull_DL: 0.35, Mouth_Lips_Pull_DR: 0.35,
                  Mouth_Lips_Pull_UL: 0.22, Mouth_Lips_Pull_UR: 0.22 } },

  // "-day" (d + ay)
  { t: 2.32, w: { jaw_drive: 1.00, V_Lip_Open: 0.90, V_Open: 0.80,
                  Mouth_Lips_Pull_DL: 0.45, Mouth_Lips_Pull_DR: 0.45,
                  Mouth_Lips_Pull_UL: 0.30, Mouth_Lips_Pull_UR: 0.30 } },
  { t: 2.50, w: { jaw_drive: 0.20, V_Lip_Open: 0.18, V_Tight: 0.88 } },

  { t: 2.68, w: { jaw_drive: 0.05 } },
  { t: 2.85, w: {} },
  { t: 3.50, w: {} }, // loop point
];
const DEMO_DURATION = 3.50;

// ── Playback state ────────────────────────────────────────────────────────────
// null = idle; set by POST /segment in live mode or at server start in demo mode.
let segment = null;
// { keyframes: [{t, w}], duration: number, startMs: number }

const serverStartMs = Date.now();

// ── Interpolation helpers ─────────────────────────────────────────────────────

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Return blendshape weights at `nowSec` seconds into the active segment.
 * In demo mode the timeline loops; in live mode it clamps at duration.
 */
function weightsAtTime(keyframes, duration, nowSec) {
  const t = DEMO_MODE
    ? ((nowSec % duration) + duration) % duration
    : Math.min(nowSec, duration);

  let prev = keyframes[0];
  let next = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (t >= keyframes[i].t && t < keyframes[i + 1].t) {
      prev = keyframes[i];
      next = keyframes[i + 1];
      break;
    }
  }

  const span  = next.t - prev.t;
  const alpha = span > 0 ? (t - prev.t) / span : 1.0;

  const allKeys = new Set([...Object.keys(prev.w), ...Object.keys(next.w)]);
  const weights = {};
  for (const k of allKeys) {
    const v = lerp(prev.w[k] ?? 0, next.w[k] ?? 0, alpha);
    if (v > 0.0005) weights[k] = parseFloat(v.toFixed(4));
  }
  return weights;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

// ── HTTP request handler ──────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const { method, url } = req;

  // Health check
  if (method === 'GET' && url === '/status') {
    return json(res, 200, {
      version:  VERSION,
      clients:  clients.size,
      playing:  segment !== null,
      demoMode: DEMO_MODE,
    });
  }

  // Inject a live CC4AudioPayload segment
  if (method === 'POST' && url === '/segment') {
    if (DEMO_MODE) {
      return json(res, 400, { error: 'Server is in --demo mode. Restart without --demo to accept live segments.' });
    }

    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { error: 'Invalid JSON body.' }); }

    const { blendshapes, duration, text, emotion } = body;
    if (!Array.isArray(blendshapes) || typeof duration !== 'number') {
      return json(res, 422, { error: 'Required: blendshapes (array) and duration (number).' });
    }

    // Convert CC4AudioPayload [{time, weights}] to internal [{t, w}] keyframe format.
    const keyframes = blendshapes.map(f => ({ t: f.time, w: f.weights ?? {} }));

    // Ensure a t=0 silence keyframe so interpolation always has a left bound.
    if (keyframes.length === 0 || keyframes[0].t > 0) {
      keyframes.unshift({ t: 0, w: {} });
    }
    // Ensure a trailing silence keyframe at the declared duration.
    if (keyframes[keyframes.length - 1].t < duration) {
      keyframes.push({ t: duration, w: {} });
    }

    segment = { keyframes, duration, startMs: Date.now() };
    console.log(`[>] Segment: ${JSON.stringify({
      text:     (text ?? '').slice(0, 50) || undefined,
      emotion:  emotion || undefined,
      duration: duration.toFixed(2) + 's',
      frames:   blendshapes.length,
    })}`);

    return json(res, 200, { ok: true, frames: keyframes.length, duration });
  }

  // Stop and clear current animation
  if (method === 'POST' && url === '/stop') {
    segment = null;
    broadcast({ type: 'clear' });
    console.log('[x] Playback stopped via /stop');
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: `No route: ${method} ${url}` });
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const httpServer = http.createServer(handleRequest);
const wss        = new WebSocket.Server({ server: httpServer });
const clients    = new Set();

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[+] Unity connected  (${clients.size} active)`);
  ws.send(JSON.stringify({ type: 'ready', version: VERSION }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[-] Unity disconnected  (${clients.size} active)`);
  });
  ws.on('error', (err) => console.warn(`[!] Client error: ${err.message}`));
});

// ── 60 fps broadcast loop ─────────────────────────────────────────────────────

let frameCount = 0;

// In demo mode we seed an always-running segment pointing at the demo keyframes.
if (DEMO_MODE) {
  segment = { keyframes: DEMO_KEYFRAMES, duration: DEMO_DURATION, startMs: serverStartMs };
}

setInterval(() => {
  if (clients.size === 0) return;
  if (!segment) return;

  const elapsed = (Date.now() - segment.startMs) / 1000;

  // In live mode: end the segment when it expires and signal Unity to clear.
  if (!DEMO_MODE && elapsed >= segment.duration) {
    segment = null;
    broadcast({ type: 'clear' });
    return;
  }

  const weights = weightsAtTime(segment.keyframes, segment.duration, elapsed);
  broadcast({ type: 'weights', weights });

  frameCount++;
  if (frameCount % FPS === 0) {
    const loopT = DEMO_MODE
      ? (elapsed % segment.duration).toFixed(2)
      : elapsed.toFixed(2);
    process.stdout.write(`\r  t=${loopT.padStart(5)}s  shapes=${Object.keys(weights).length}  clients=${clients.size}   `);
  }
}, FRAME_MS);

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  const line = '─'.repeat(61);
  console.log('');
  console.log(`┌${line}┐`);
  if (DEMO_MODE) {
    console.log(`│  CC4 blendshape server · DEMO MODE · port ${PORT}              │`);
    console.log(`│  Loop: ${DEMO_DURATION}s · ${DEMO_KEYFRAMES.length} keyframes · ${FPS} fps                              │`);
  } else {
    console.log(`│  CC4 blendshape relay server · port ${PORT}                  │`);
    console.log(`│  WS   ws://localhost:${PORT}   (Unity BlendshapeReceiver)      │`);
    console.log(`│  HTTP GET /status · POST /segment · POST /stop            │`);
  }
  console.log(`│  Press Play in Unity to connect                           │`);
  console.log(`└${line}┘`);
  console.log('');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown() {
  process.stdout.write('\n');
  console.log('[~] Shutting down...');
  for (const ws of clients) ws.close();
  httpServer.close(() => process.exit(0));
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
