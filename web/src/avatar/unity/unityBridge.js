// Unity WebGL bridge. The WebGL build under /unity/Build/ is a machine-made,
// git-ignored artifact (run `npm run sync:unity` after a Unity export). When
// it's absent, isUnityAvailable() stays false and the effective-profile
// resolver falls the whole app back to the Three.js avatars.
//
// The message protocol is IDENTICAL to mobile UaaL (AvatarBridgeProtocol):
//   { type: 'setCharacter', id }                        → AvatarRouter.cs
//   { type: 'play', duration, visemes: [{t,d,v,w}], … } → forwarded verbatim
//   { type: 'stop' }
// delivered via unityInstance.SendMessage('AvatarRouter','ReceiveBridgeMessage', json).

const LOADER_URL = '/unity/Build/unity.loader.js';
const PROBE_CANDIDATES = [LOADER_URL, '/unity/Build.loader.js'];

let availability = null; // null = unprobed, else boolean
let probePromise = null;
let unityInstance = null;
let mountPromise = null;
let loaderUrl = null;
let sharedCanvas = null;

export function isUnityAvailable() {
  return availability === true;
}

// True once a Unity instance is live this session — lets screens that only
// WANT the avatar when it's already paid for (the Home hero) mount it without
// ever triggering the expensive cold boot themselves.
export function isUnityBooted() {
  return unityInstance !== null;
}

// Tri-state for the effective-profile resolver: null = probe still pending
// (stay optimistic about Unity), true/false once resolved.
export function getUnityAvailability() {
  return availability;
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
async function resolveBuildFiles(base) {
  try {
    const r = await fetch(`${base}manifest.json`);
    const type = r.headers.get('content-type') || '';
    if (r.ok && !type.includes('text/html')) {
      const m = await r.json();
      if (m.loader && m.data && m.framework && m.code) return m;
    }
  } catch { /* no manifest — use defaults */ }
  return { loader: 'unity.loader.js', data: 'unity.data', framework: 'unity.framework.js', code: 'unity.wasm' };
}

export async function mountUnity() {
  if (!(await probeUnity())) throw new Error('No Unity WebGL build installed');
  if (unityInstance) return unityInstance;
  if (mountPromise) return mountPromise;

  mountPromise = (async () => {
    const base = loaderUrl.replace(/[^/]+$/, '');
    const files = await resolveBuildFiles(base);

    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = base + files.loader;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Unity loader failed to load'));
      document.head.appendChild(s);
    });

    // createUnityInstance is provided by the loader script.
    // eslint-disable-next-line no-undef
    unityInstance = await createUnityInstance(getUnityCanvas(), {
      dataUrl: base + files.data,
      frameworkUrl: base + files.framework,
      codeUrl: base + files.code,
      companyName: 'DementiaGuideAI',
      productName: 'UnityAvatar',
    });
    return unityInstance;
  })();
  try {
    return await mountPromise;
  } catch (err) {
    mountPromise = null; // allow a retry after a transient load failure
    throw err;
  }
}

// Idle-time HTTP cache warmer for the Home screen: primes the browser cache
// (Cache-Control on /unity/* makes these hits) without booting a Unity heap.
// <link rel=prefetch> keeps the bytes out of JS memory; unsupported browsers
// simply ignore it.
export async function warmUnityCache() {
  if (!(await probeUnity())) return;
  const base = loaderUrl.replace(/[^/]+$/, '');
  const files = await resolveBuildFiles(base);
  for (const f of [files.loader, files.data, files.framework, files.code]) {
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.as = 'fetch';
    l.href = base + f;
    document.head.appendChild(l);
  }
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
  }
}
