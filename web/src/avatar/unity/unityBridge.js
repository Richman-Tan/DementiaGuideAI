// Unity WebGL bridge. The WebGL build under /unity/Build/ is a machine-made,
// git-ignored artifact (run `npm run sync:unity` after a Unity export). When
// it's absent, isUnityAvailable() stays false and the effective-profile
// resolver falls the whole app back to the Three.js avatars.
//
// Boot is EAGER: main.jsx calls ensureUnityBoot() right after first paint so
// the 234MB download starts the moment the app opens, on the shared detached
// canvas; screens attach when they mount. Load progress is broadcast through
// onUnityLoadProgress — the loader reports byte progress 0→0.9 and then goes
// silent through the multi-minute main-thread brotli decompress, so the state
// machine surfaces that gap as an explicit 'preparing' phase.
//
// The message protocol is IDENTICAL to mobile UaaL (AvatarBridgeProtocol):
//   { type: 'setCharacter', id }                        → AvatarRouter.cs
//   { type: 'play', duration, visemes: [{t,d,v,w}], … } → forwarded verbatim
//   { type: 'stop' }
// delivered via unityInstance.SendMessage('AvatarRouter','ReceiveBridgeMessage', json).
import { getSettingSnapshot } from '../../state/settingsSnapshot.js';

const LOADER_URL = '/unity/Build/unity.loader.js';
const PROBE_CANDIDATES = [LOADER_URL, '/unity/Build.loader.js'];

let availability = null; // null = unprobed, else boolean
let probePromise = null;
let unityInstance = null;
let mountPromise = null;
let loaderScriptPromise = null;
let loaderUrl = null;
let sharedCanvas = null;
let retriedOnce = false;

// Load-state machine: idle → downloading → preparing → ready | failed,
// or → unavailable when no build is installed.
let loadPhase = 'idle';
let loadPct = 0; // 0..1 of the DOWNLOAD phase (normalized from the loader's 0→0.9)
const loadSubscribers = new Set();

function setLoadState(phase, pct = loadPct) {
  if (phase === loadPhase && pct === loadPct) return;
  loadPhase = phase;
  loadPct = pct;
  const snapshot = { phase: loadPhase, pct: loadPct };
  for (const cb of loadSubscribers) cb(snapshot);
}

export function getUnityLoadState() {
  return { phase: loadPhase, pct: loadPct };
}

// Subscribe to load-state changes. Invokes cb immediately with the current
// state (late subscribers — a freshly-opened Voice screen — render correctly
// without a separate init read). Returns an unsubscribe function.
export function onUnityLoadProgress(cb) {
  loadSubscribers.add(cb);
  cb(getUnityLoadState());
  return () => loadSubscribers.delete(cb);
}

export function isUnityAvailable() {
  return availability === true;
}

// Tri-state for the effective-profile resolver: null = probe still pending
// (stay optimistic about Unity), true/false once resolved.
export function getUnityAvailability() {
  return availability;
}

// True once a Unity instance is live this session.
export function isUnityBooted() {
  return unityInstance !== null;
}

// HEAD-probe for a Unity build; result is cached for the session.
export async function probeUnity() {
  if (availability !== null) return availability;
  if (!probePromise) {
    probePromise = (async () => {
      for (const url of PROBE_CANDIDATES) {
        try {
          const r = await fetch(url, { method: 'HEAD' });
          // Vite's SPA fallback answers HTML for unknown paths — require JS.
          const type = r.headers.get('content-type') || '';
          if (r.ok && !type.includes('text/html')) {
            loaderUrl = url;
            availability = true;
            return true;
          }
        } catch { /* unreachable */ }
      }
      availability = false;
      setLoadState('unavailable');
      return false;
    })();
  }
  return probePromise;
}

// One canvas for the app: Unity binds its GL context to the canvas it was
// created with, so screens reparent this shared element (same pattern as the
// Three controller's host) instead of handing Unity a fresh canvas per mount.
export function getUnityCanvas() {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCanvas.id = 'unity-canvas';
    sharedCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  }
  return sharedCanvas;
}

// sync-unity-webgl.mjs writes a manifest naming the build files (so a future
// compression change — .unityweb suffixes — needs no code edit); older manual
// drops without one get the documented default names.
// The manifest also carries a per-build `version` stamp. It must never be
// served stale or the version itself goes stale, hence cache: 'no-cache'.
async function resolveBuildFiles(base) {
  try {
    const r = await fetch(`${base}manifest.json`, { cache: 'no-cache' });
    const type = r.headers.get('content-type') || '';
    if (r.ok && !type.includes('text/html')) {
      const m = await r.json();
      if (m.loader && m.data && m.framework && m.code) return m;
    }
  } catch { /* no manifest — use defaults */ }
  return { loader: 'unity.loader.js', data: 'unity.data', framework: 'unity.framework.js', code: 'unity.wasm' };
}

// Inject the loader script once; guarded so a retry after a transient failure
// doesn't append a second script tag.
function loadLoaderScript(src) {
  if (!loaderScriptPromise) {
    loaderScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => {
        loaderScriptPromise = null;
        reject(new Error('Unity loader failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return loaderScriptPromise;
}

export async function mountUnity() {
  if (!(await probeUnity())) throw new Error('No Unity WebGL build installed');
  if (unityInstance) return unityInstance;
  if (mountPromise) return mountPromise;

  mountPromise = (async () => {
    setLoadState('downloading', 0);
    const base = loaderUrl.replace(/[^/]+$/, '');
    const files = await resolveBuildFiles(base);
    // Version every build URL. The filenames are stable and cached for a day,
    // so without this a redeploy leaves returning visitors mixing an old wasm
    // with a new data file — which crashes the engine deep inside its
    // deserializer rather than failing cleanly.
    const v = files.version ? `?v=${files.version}` : '';
    await loadLoaderScript(base + files.loader + v);

    // createUnityInstance is provided by the loader script. Its progress
    // callback covers 0→0.9 (byte-accurate download) then goes silent until
    // the engine finishes booting — surface that gap as 'preparing'.
    // eslint-disable-next-line no-undef
    unityInstance = await createUnityInstance(getUnityCanvas(), {
      dataUrl: base + files.data + v,
      frameworkUrl: base + files.framework + v,
      codeUrl: base + files.code + v,
      companyName: 'DementiaGuideAI',
      productName: 'UnityAvatar',
    }, (p) => {
      if (p >= 0.89) setLoadState('preparing', 1);
      else setLoadState('downloading', Math.min(p / 0.9, 1));
    });
    setLoadState('ready', 1);
    return unityInstance;
  })();
  try {
    return await mountPromise;
  } catch (err) {
    mountPromise = null; // allow a retry after a transient load failure
    // A ~230MB transfer fails for boring reasons — a dropped connection, a
    // sleeping laptop, memory pressure mid-decompress. Retry once silently
    // before showing anyone an error they can't act on.
    if (!retriedOnce) {
      retriedOnce = true;
      console.warn('[unity] load failed, retrying once:', err?.message ?? err);
      return mountUnity();
    }
    setLoadState('failed');
    throw err;
  }
}

// Idempotent eager entry point — called from main.jsx right after first paint
// so the download begins the moment the app opens, and from the "Try again"
// affordance after a failure (mountPromise nulls on failure, so this retries).
export function ensureUnityBoot() {
  if (getSettingSnapshot().showAvatar === false) return;
  retriedOnce = false; // a manual "Try again" gets its own silent retry
  probeUnity().then((ok) => {
    if (ok) mountUnity().catch(() => { /* state machine already says 'failed' */ });
  });
}

export function sendBridgeMessage(obj) {
  if (!unityInstance) return false;
  unityInstance.SendMessage('AvatarRouter', 'ReceiveBridgeMessage', JSON.stringify(obj));
  return true;
}

export function setCharacter(id) {
  return sendBridgeMessage({ type: 'setCharacter', id });
}

export function unmountUnity() {
  if (unityInstance) {
    try { unityInstance.Quit(); } catch { /* already gone */ }
    unityInstance = null;
    mountPromise = null;
    setLoadState('idle', 0);
  }
}
