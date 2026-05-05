import React, { useRef, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export const DEFAULT_VRM_MODEL_URL =
  'https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/fem_vroid.vrm';

function dbg(msg) {
  return `
    (function(){
      var el = document.getElementById('status');
      if(el){ el.textContent = ${JSON.stringify(msg)}; el.style.color='#00ff88'; el.style.fontSize='14px'; }
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug',message:${JSON.stringify(msg)}}));
    })();
  `;
}

function buildHTML(modelUrl) {
  const safeUrl = modelUrl.replace(/'/g, '%27');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  *{margin:0;padding:0;overflow:hidden}
  html,body{width:100%;height:100%;background:transparent}
  canvas{display:block}
  #status{
    position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);
    text-align:center;color:#fff;
    font:bold 15px/1.6 system-ui,sans-serif;
    padding:8px;pointer-events:none;
    text-shadow:0 1px 4px rgba(0,0,0,0.8)
  }
</style>

<!-- importmap — must appear before any module script -->
<script type="importmap">
{
  "imports": {
    "three":          "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
    "three/addons/":  "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
    "@pixiv/three-vrm": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.5.2/lib/three-vrm.module.min.js"
  }
}
<\/script>

<!-- non-module script: catch errors that happen during module loading -->
<script>
window._dbg = function(msg) {
  var el = document.getElementById('status');
  if(el){ el.textContent = msg; el.style.color='#ffcc00'; }
  if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug',message:msg}));
};
window.onerror = function(msg, src, line, col, err) {
  window._dbg('JS error: ' + msg + ' (line ' + line + ')');
  return false;
};
window.addEventListener('unhandledrejection', function(e) {
  var reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
  window._dbg('Unhandled promise rejection: ' + reason);
});
window._dbg('Page loaded, waiting for module...');
<\/script>
</head>

<body>
<div id="status">Loading avatar…</div>

<script type="module">
window._dbg('Module script started');

import * as THREE from 'three';
window._dbg('THREE imported: r' + THREE.REVISION);

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
window._dbg('GLTFLoader imported');

import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
window._dbg('three-vrm imported');

// ── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.prepend(renderer.domElement);
window._dbg('Renderer created, loading model...');

// ── Scene + fog ───────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x080814, 0.12);

// ── Camera (overwritten by frameCamera after model loads) ─────────────────────
const cam = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 20);
cam.position.set(0, 1.2, 2.5);
cam.lookAt(0, 1.1, 0);

// ── Lighting ──────────────────────────────────────────────────────────────────
const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
key.position.set(0.7, 2.2, 1.8);
key.castShadow = true;
scene.add(key);

const fill = new THREE.DirectionalLight(0xc5d5ff, 0.9);
fill.position.set(-1.2, 0.8, 0.6);
scene.add(fill);

const rim = new THREE.DirectionalLight(0x8899ee, 0.6);
rim.position.set(0, 1.5, -2.5);
scene.add(rim);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));

// ── Auto-frame camera to show upper 65% of character ─────────────────────────
function frameCamera(modelScene, camera) {
  const box = new THREE.Box3().setFromObject(modelScene);
  const size = new THREE.Vector3();
  box.getSize(size);

  const modelTop    = box.max.y;
  const modelBottom = box.min.y;
  const modelHeight = size.y;

  const frameBottom = modelBottom + modelHeight * 0.35;
  const frameTop    = modelTop    + modelHeight * 0.06;
  const frameCenter = (frameBottom + frameTop) / 2;
  const frameHeight = frameTop - frameBottom;

  const fovRad     = (camera.fov * Math.PI) / 180;
  const dist       = (frameHeight / 2) / Math.tan(fovRad / 2);
  const paddedDist = dist * 1.15;

  camera.position.set(0, frameCenter, paddedDist);
  camera.lookAt(0, frameCenter, 0);
  camera.updateProjectionMatrix();
  window._dbg('Camera framed: h=' + modelHeight.toFixed(2) + ' dist=' + paddedDist.toFixed(2));
}

// ── Load VRM ──────────────────────────────────────────────────────────────────
let vrm = null;
const loader = new GLTFLoader();
loader.crossOrigin = 'anonymous';
loader.register(parser => new VRMLoaderPlugin(parser));

const statusEl = document.getElementById('status');

loader.load(
  '${safeUrl}',
  gltf => {
    window._dbg('GLTF loaded, extracting VRM...');
    vrm = gltf.userData.vrm;
    if (!vrm) {
      statusEl.textContent = 'No VRM data in model';
      window._dbg('ERROR: No VRM data in gltf.userData.vrm');
      return;
    }
    window._dbg('VRM extracted, optimising...');

    try { VRMUtils.removeUnnecessaryVertices(gltf.scene); } catch(e) {}
    try { VRMUtils.combineSkeletons(gltf.scene); } catch(e) {}
    try { VRMUtils.combineMorphs(vrm); } catch(e) {}

    // Disable frustum culling so meshes are never clipped out of view
    vrm.scene.traverse(obj => { obj.frustumCulled = false; });

    vrm.scene.rotation.y = Math.PI;
    scene.add(vrm.scene);
    frameCamera(vrm.scene, cam);

    statusEl.style.display = 'none';
    if (window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'loaded' }));
  },
  xhr => {
    const pct = xhr.total ? Math.round(xhr.loaded / xhr.total * 100) : '?';
    statusEl.textContent = 'Loading ' + pct + '%';
    if (pct % 25 === 0) window._dbg('Model download ' + pct + '%');
  },
  err => {
    const msg = err && err.message ? err.message : String(err);
    statusEl.textContent = 'Load error — see debug';
    window._dbg('Model load ERROR: ' + msg);
    if (window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: msg }));
  }
);

// ── State machine ─────────────────────────────────────────────────────────────
let avatarState = 'idle';
function setAvatarState(s) { avatarState = s; }
window.setAvatarState = setAvatarState;
function onMsg(e) {
  try { const d = JSON.parse(e.data); if (d && d.state) setAvatarState(d.state); } catch(ex) {}
}
window.addEventListener('message', onMsg);
document.addEventListener('message', onMsg);

// ── Animation helpers ─────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function bone(name) { return vrm?.humanoid?.getNormalizedBoneNode(name) ?? null; }
function expr(name, val) { vrm?.expressionManager?.setValue(name, val); }

const BLINK_HALF = 0.09;
let blinkCooldown = Math.random() * 2 + 2;
let blinking = false;
let blinkProgress = 0;
let mouthCurrent = 0;

// ── Render loop ───────────────────────────────────────────────────────────────
let lastTs = null;
let elapsed = 0;

(function animate(ts) {
  requestAnimationFrame(animate);

  if (lastTs === null) lastTs = ts;
  const dt = Math.min((ts - lastTs) * 0.001, 0.05);
  elapsed += dt;
  lastTs = ts;

  if (!vrm) { renderer.render(scene, cam); return; }

  vrm.update(dt);

  const speaking  = avatarState === 'speaking';
  const listening = avatarState === 'listening';

  // Breathing
  const breathRate  = speaking ? 1.2 : 0.7;
  const breathDepth = speaking ? 0.013 : 0.007;
  const chest = bone('chest');
  const spine = bone('spine');
  if (chest) chest.rotation.x = Math.sin(elapsed * breathRate) * breathDepth;
  if (spine) spine.rotation.x = Math.sin(elapsed * breathRate + 0.4) * breathDepth * 0.5;

  // Hips sway
  const hips = bone('hips');
  if (hips) {
    hips.rotation.z = Math.sin(elapsed * 0.25) * 0.008;
    hips.position.y = Math.sin(elapsed * 0.7) * 0.003;
  }

  // Head
  const head = bone('head');
  if (head) {
    const s = listening ? 1.7 : 1.0;
    head.rotation.y = Math.sin(elapsed * 0.38) * 0.055 * s;
    head.rotation.x = Math.sin(elapsed * 0.46) * 0.027 * s - 0.025;
    head.rotation.z = Math.sin(elapsed * 0.29) * 0.018 * s;
  }

  // Neck
  const neck = bone('neck');
  if (neck) {
    neck.rotation.y = Math.sin(elapsed * 0.38) * 0.018;
    neck.rotation.x = Math.sin(elapsed * 0.46) * 0.010 - 0.008;
  }

  // Eyes
  const leftEye  = bone('leftEye');
  const rightEye = bone('rightEye');
  if (leftEye && rightEye) {
    const gazeX = Math.sin(elapsed * 0.15) * 0.08;
    const gazeY = Math.sin(elapsed * 0.21) * 0.04;
    [leftEye, rightEye].forEach(e => { e.rotation.y = gazeX; e.rotation.x = gazeY; });
  }

  // Arms
  const lArm = bone('leftUpperArm');
  const rArm = bone('rightUpperArm');
  if (lArm) lArm.rotation.z =  0.06 + Math.sin(elapsed * 0.32) * 0.022;
  if (rArm) rArm.rotation.z = -0.06 - Math.sin(elapsed * 0.32 + 1.1) * 0.022;

  // Blink
  blinkCooldown -= dt;
  if (blinkCooldown <= 0 && !blinking) {
    blinking = true;
    blinkProgress = 0;
    blinkCooldown = Math.random() * 3.5 + 2.0;
  }
  if (blinking) {
    blinkProgress += dt / (BLINK_HALF * 2);
    const v = blinkProgress < 0.5 ? blinkProgress * 2 : (1 - blinkProgress) * 2;
    const clamped = Math.min(Math.max(v, 0), 1);
    expr('blinkLeft',  clamped);
    expr('blinkRight', clamped);
    if (blinkProgress >= 1.0) {
      blinking = false;
      expr('blinkLeft',  0);
      expr('blinkRight', 0);
    }
  }

  // Mouth
  const mouthTarget = speaking
    ? Math.abs(Math.sin(elapsed * 7.5)) * 0.55 + Math.abs(Math.sin(elapsed * 13.3)) * 0.20
    : 0;
  mouthCurrent = lerp(mouthCurrent, mouthTarget, 0.22);
  expr('aa', mouthCurrent);

  expr('surprised', listening ? 0.20 : 0);

  vrm.expressionManager?.update();
  renderer.render(scene, cam);
})();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cam.aspect = window.innerWidth / window.innerHeight;
  cam.updateProjectionMatrix();
});
<\/script>
</body>
</html>`;
}

export const AvatarVRM = ({
  modelUrl = DEFAULT_VRM_MODEL_URL,
  width,
  height,
  isListening = false,
  isSpeaking = false,
  style,
}) => {
  const webRef = useRef(null);
  const stateRef = useRef('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Memoize the entire source object — a new object reference on every render
  // would cause react-native-webview to call loadHTMLString again and restart the page.
  const source = useMemo(() => ({ html: buildHTML(modelUrl) }), [modelUrl]);

  useEffect(() => {
    const next = isSpeaking ? 'speaking' : isListening ? 'listening' : 'idle';
    if (next === stateRef.current) return;
    stateRef.current = next;
    webRef.current?.injectJavaScript(`setAvatarState('${next}'); true;`);
  }, [isListening, isSpeaking]);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'loaded') setLoading(false);
      if (data.type === 'error') { setLoading(false); setError(true); }
      // Log all debug messages from the WebView to the RN console
      if (data.type === 'debug') console.log('[AvatarVRM]', data.message);
    } catch {}
  };

  const sizeStyle = (width != null || height != null) ? { width: width ?? 300, height: height ?? 420 } : {};

  return (
    <View style={[sizeStyle, styles.container, style]}>
      <WebView
        ref={webRef}
        source={source}
        style={styles.webview}
        backgroundColor="transparent"
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled
        originWhitelist={['*']}
        allowFileAccess
        domStorageEnabled
        mixedContentMode="always"
        androidLayerType="hardware"
        allowsInlineMediaPlayback
        onMessage={handleMessage}
        onError={(e) => {
          console.log('[AvatarVRM] WebView error', e.nativeEvent);
          setLoading(false); setError(true);
        }}
        onHttpError={(e) => {
          console.log('[AvatarVRM] HTTP error', e.nativeEvent.statusCode);
          setLoading(false); setError(true);
        }}
      />
      {loading && !error && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="rgba(255,255,255,0.7)" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
