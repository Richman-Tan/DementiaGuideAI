import React, { useRef, useEffect, useMemo, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export const DEFAULT_VRM_MODEL_URL =
  'https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/HairSample_Male.vrm';

function buildHTML(modelUrl) {
  const safeUrl = modelUrl.replace(/'/g, '%27');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">

<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  #status {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    transform: translateY(-50%);
    text-align: center;
    color: #fff;
    font: bold 15px/1.6 system-ui, sans-serif;
    padding: 8px;
    pointer-events: none;
    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
    z-index: 10;
  }
</style>

<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
    "@pixiv/three-vrm": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.5.2/lib/three-vrm.module.min.js"
  }
}
<\/script>

<script>
window._dbg = function(msg) {
  var el = document.getElementById('status');
  if (el) {
    el.textContent = msg;
    el.style.color = '#ffcc00';
  }

  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'debug',
      message: msg
    }));
  }
};

window.onerror = function(msg, src, line, col, err) {
  window._dbg('JS error: ' + msg + ' line ' + line);
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
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

window._dbg('Imports loaded: THREE r' + THREE.REVISION);

const statusEl = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

document.body.appendChild(renderer.domElement);

renderer.domElement.addEventListener('webglcontextlost', function(event) {
  event.preventDefault();
  window._dbg('WebGL context lost');

  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'context_lost'
    }));
  }
});

renderer.domElement.addEventListener('webglcontextrestored', function() {
  window._dbg('WebGL context restored');
});

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  35,
  window.innerWidth / window.innerHeight,
  0.1,
  20
);

camera.position.set(0, 1.25, 2.5);
camera.lookAt(0, 1.25, 0);

scene.add(new THREE.AmbientLight(0xffffff, 1.2));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(1, 2, 2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbfd7ff, 0.8);
fillLight.position.set(-1.5, 1, 1);
scene.add(fillLight);

let vrm = null;
let baseRotationY = 0;
let basePositionY = 0;
let avatarState = 'idle';
let mouthCurrent = 0;
let lastTs = null;
let elapsed = 0;
let blinkCooldown = 2.2;
let blinkProgress = 0;
let blinking = false;
let activeBlend = 0;
let speakBlend = 0;
let thinkBlend = 0;
const boneRefs = {};
const boneBase = {};

function frameCamera(modelScene) {
  const box = new THREE.Box3().setFromObject(modelScene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  const height = size.y || 1.6;

  const visibleBottom = box.min.y + height * 0.35;
  const visibleTop = box.max.y + height * 0.08;
  const visibleCenterY = (visibleBottom + visibleTop) / 2;
  const visibleHeight = visibleTop - visibleBottom;

  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const distance = (visibleHeight / 2) / Math.tan(fovRad / 2);

  camera.position.set(center.x, visibleCenterY, distance * 1.2);
  camera.lookAt(center.x, visibleCenterY, center.z);
  camera.updateProjectionMatrix();

  window._dbg('Camera framed: h=' + height.toFixed(2) + ' dist=' + distance.toFixed(2));
}

function setAvatarState(state) {
  avatarState = state || 'idle';
}

window.setAvatarState = setAvatarState;

function handleIncomingMessage(event) {
  try {
    const data = JSON.parse(event.data);
    if (data && data.state) {
      setAvatarState(data.state);
    }
  } catch (e) {}
}

window.addEventListener('message', handleIncomingMessage);
document.addEventListener('message', handleIncomingMessage);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function bone(name) {
  if (!vrm || !vrm.humanoid) return null;
  if (!boneRefs[name]) {
    boneRefs[name] = vrm.humanoid.getNormalizedBoneNode(name) || null;
  }
  return boneRefs[name];
}

function rememberBoneBase(name) {
  const targetBone = bone(name);
  if (!targetBone || boneBase[name]) return;
  boneBase[name] = {
    x: targetBone.rotation.x,
    y: targetBone.rotation.y,
    z: targetBone.rotation.z,
  };
}

function setBoneRotation(name, x, y, z) {
  const targetBone = bone(name);
  if (!targetBone) return;

  rememberBoneBase(name);
  targetBone.rotation.x = x;
  targetBone.rotation.y = y;
  targetBone.rotation.z = z;
}

function applyRelaxedPose() {
  // Pull the avatar out of the default T-pose into a calm neutral stance.
  const leftUpperArm = bone('leftUpperArm');
  const rightUpperArm = bone('rightUpperArm');
  const leftLowerArm = bone('leftLowerArm');
  const rightLowerArm = bone('rightLowerArm');
  const leftHand = bone('leftHand');
  const rightHand = bone('rightHand');
  const spine = bone('spine');
  const chest = bone('chest');
  const neck = bone('neck');
  const head = bone('head');

  [
    'spine',
    'chest',
    'neck',
    'head',
    'leftUpperArm',
    'rightUpperArm',
    'leftLowerArm',
    'rightLowerArm',
    'leftHand',
    'rightHand',
  ].forEach(rememberBoneBase);

  if (spine) spine.rotation.x = -0.04;
  if (chest) chest.rotation.x = 0.02;
  if (neck) neck.rotation.x = 0.01;
  if (head) head.rotation.x = -0.02;

  if (leftUpperArm) {
    leftUpperArm.rotation.z -= -1.3;
    leftUpperArm.rotation.x += 0.04;
    leftUpperArm.rotation.y += 0.05;
  }

  if (rightUpperArm) {
    rightUpperArm.rotation.z += -1.3;
    rightUpperArm.rotation.x += 0.04;
    rightUpperArm.rotation.y -= 0.05;
  }

  if (leftLowerArm) {
    leftLowerArm.rotation.z -= 0.04;
    leftLowerArm.rotation.x -= 0.04;
  }

  if (rightLowerArm) {
    rightLowerArm.rotation.z += 0.04;
    rightLowerArm.rotation.x -= 0.04;
  }

  // Forearm roll: twist the palm to face the thigh (pronation).
  // In VRM normalised space, lower-arm X is the roll axis.
  if (leftLowerArm)  leftLowerArm.rotation.x  -= 0.5;
  if (rightLowerArm) rightLowerArm.rotation.x -= 0.5;

  // Wrist: slight tilt so the hand hangs relaxed rather than rigid.
  if (leftHand)  { leftHand.rotation.y  += 0.0;  leftHand.rotation.z  += 0.18; }
  if (rightHand) { rightHand.rotation.y -= 0.0;  rightHand.rotation.z -= 0.18; }

  // Finger curl — proximal joints curl more, intermediate joints curl less.
  // Left hand: positive Z curls fingers inward; right hand: negative Z.
  const L_CURL = 0.32;
  const R_CURL = -0.32;
  [
    'leftIndexProximal',  'leftMiddleProximal',
    'leftRingProximal',   'leftLittleProximal',
  ].forEach(n => { const b = bone(n); if (b) b.rotation.z += L_CURL; });
  [
    'leftIndexIntermediate',  'leftMiddleIntermediate',
    'leftRingIntermediate',   'leftLittleIntermediate',
  ].forEach(n => { const b = bone(n); if (b) b.rotation.z += L_CURL * 0.55; });
  [
    'rightIndexProximal',  'rightMiddleProximal',
    'rightRingProximal',   'rightLittleProximal',
  ].forEach(n => { const b = bone(n); if (b) b.rotation.z += R_CURL; });
  [
    'rightIndexIntermediate',  'rightMiddleIntermediate',
    'rightRingIntermediate',   'rightLittleIntermediate',
  ].forEach(n => { const b = bone(n); if (b) b.rotation.z += R_CURL * 0.55; });

  // Thumb: spread away from the palm slightly.
  const lThumb = bone('leftThumbProximal');
  const rThumb = bone('rightThumbProximal');
  if (lThumb) lThumb.rotation.z += 0.22;
  if (rThumb) rThumb.rotation.z -= 0.22;

  [
    'spine',
    'chest',
    'neck',
    'head',
    'leftUpperArm',
    'rightUpperArm',
    'leftLowerArm',
    'rightLowerArm',
    'leftHand',
    'rightHand',
  ].forEach((name) => {
    const targetBone = bone(name);
    if (!targetBone) return;
    boneBase[name] = {
      x: targetBone.rotation.x,
      y: targetBone.rotation.y,
      z: targetBone.rotation.z,
    };
  });
}

function setExpression(name, value) {
  if (!vrm || !vrm.expressionManager) return;

  try {
    vrm.expressionManager.setValue(name, value);
  } catch (e) {}
}

function loadVRM() {
  window._dbg('Renderer created, loading model...');

  const loader = new GLTFLoader();
  loader.crossOrigin = 'anonymous';

  loader.register((parser) => {
    return new VRMLoaderPlugin(parser);
  });

  loader.load(
    '${safeUrl}',
    (gltf) => {
      window._dbg('GLTF loaded, extracting VRM...');

      vrm = gltf.userData.vrm;

      if (!vrm) {
        window._dbg('No VRM data found');
        if (statusEl) statusEl.textContent = 'No VRM data found';
        return;
      }

      window._dbg('VRM extracted, preparing scene...');

      try {
        VRMUtils.rotateVRM0(vrm);
      } catch (e) {
        console.log('rotateVRM0 skipped', e);
      }

      vrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
        obj.visible = true;
      });

      baseRotationY = vrm.scene.rotation.y;
      basePositionY = vrm.scene.position.y;

      applyRelaxedPose();

      scene.add(vrm.scene);
      frameCamera(vrm.scene);

      if (statusEl) {
        statusEl.style.display = 'none';
      }

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'loaded'
        }));
      }

      window._dbg('Avatar loaded successfully');
    },
    (xhr) => {
      const pct = xhr.total ? Math.round((xhr.loaded / xhr.total) * 100) : '?';

      if (statusEl) {
        statusEl.textContent = 'Loading ' + pct + '%';
      }

      if (pct === 100) {
        window._dbg('Model download 100%');
      }
    },
    (error) => {
      const msg = error && error.message ? error.message : String(error);
      window._dbg('Model load error: ' + msg);

      if (statusEl) {
        statusEl.textContent = 'Load error';
      }

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          message: msg
        }));
      }
    }
  );
}

function animate(ts) {
  requestAnimationFrame(animate);

  try {
    if (lastTs === null) lastTs = ts;

    const dt = Math.min((ts - lastTs) * 0.001, 0.05);
    lastTs = ts;
    elapsed += dt;

    if (vrm) {
      vrm.update(dt);

      const speaking = avatarState === 'speaking';
      const listening = avatarState === 'listening';
      const thinking = avatarState === 'thinking';
      const active = speaking || listening || thinking;

      // Smooth blend values — drift toward target at ~0.04/frame (~0.6 s at 60 fps)
      activeBlend = lerp(activeBlend, active    ? 1 : 0, 0.04);
      speakBlend  = lerp(speakBlend,  speaking  ? 1 : 0, 0.04);
      thinkBlend  = lerp(thinkBlend,  thinking  ? 1 : 0, 0.035);

      const bobAmp = lerp(0.006, 0.012, speakBlend);
      const bobRate = speaking ? 1.8 : listening ? 1.2 : 0.8;

      vrm.scene.position.y =
        basePositionY + Math.sin(elapsed * bobRate) * bobAmp;

      const swayAmp = lerp(0.015, lerp(0.025, 0.035, speakBlend), activeBlend);

      vrm.scene.rotation.y =
        baseRotationY + Math.sin(elapsed * 0.35) * swayAmp;

      const breath = Math.sin(elapsed * (speaking ? 2.4 : 1.5));
      const spineBase = boneBase.spine;
      const chestBase = boneBase.chest;
      const neckBase = boneBase.neck;
      const headBase = boneBase.head;
      const leftUpperArmBase = boneBase.leftUpperArm;
      const rightUpperArmBase = boneBase.rightUpperArm;
      const leftLowerArmBase = boneBase.leftLowerArm;
      const rightLowerArmBase = boneBase.rightLowerArm;

      if (spineBase) {
        setBoneRotation(
          'spine',
          spineBase.x + breath * 0.015,
          spineBase.y,
          spineBase.z
        );
      }

      if (chestBase) {
        setBoneRotation(
          'chest',
          chestBase.x + breath * 0.025,
          chestBase.y,
          chestBase.z
        );
      }

      // Compound look-around with thinking gaze bias (up-right = classic thinking direction).
      const thinkGazeH = thinkBlend * 0.09;   // drift gaze right while thinking
      const thinkGazeV = thinkBlend * (-0.06); // drift gaze up while thinking
      const thinkTiltZ = thinkBlend * 0.13;    // tilt head slightly to the right

      const lookH =
        Math.sin(elapsed * 0.27) * lerp(0.10, 0.04, activeBlend) +
        Math.sin(elapsed * 0.17) * lerp(0.045, 0.02, activeBlend) +
        thinkGazeH;
      const lookV =
        Math.sin(elapsed * 0.38) * lerp(0.038, 0.022, activeBlend) +
        Math.sin(elapsed * 0.23) * 0.012 +
        thinkGazeV;

      if (neckBase) {
        setBoneRotation(
          'neck',
          neckBase.x + breath * 0.008 + Math.sin(elapsed * 0.6) * 0.012,
          neckBase.y + lookH * 0.38,
          neckBase.z
        );
      }

      if (headBase) {
        setBoneRotation(
          'head',
          headBase.x + lookV,
          headBase.y + lookH * 0.62,
          headBase.z + Math.sin(elapsed * 0.35) * 0.012 + thinkTiltZ
        );
      }

      // Arms: keep base z negative (natural hang) but swing with two
      // frequencies and independent phases so left/right feel uncoupled.
      const armSwingA = Math.sin(elapsed * 0.52);
      const armSwingB = Math.sin(elapsed * 0.81);
      const armSwingAR = Math.sin(elapsed * 0.52 + 1.1); // offset phase for right
      const armSwingBR = Math.sin(elapsed * 0.81 + 0.7);

      if (leftUpperArmBase) {
        setBoneRotation(
          'leftUpperArm',
          leftUpperArmBase.x + breath * 0.02,
          leftUpperArmBase.y + armSwingB * 0.018,
          leftUpperArmBase.z + armSwingA * 0.055 + armSwingB * 0.022
        );
      }

      if (rightUpperArmBase) {
        setBoneRotation(
          'rightUpperArm',
          rightUpperArmBase.x + breath * 0.02,
          rightUpperArmBase.y - armSwingBR * 0.018,
          rightUpperArmBase.z - (armSwingAR * 0.055 + armSwingBR * 0.022)
        );
      }

      if (leftLowerArmBase) {
        setBoneRotation(
          'leftLowerArm',
          leftLowerArmBase.x + Math.sin(elapsed * 0.88) * 0.03,
          leftLowerArmBase.y,
          leftLowerArmBase.z + Math.sin(elapsed * 0.63) * 0.025
        );
      }

      if (rightLowerArmBase) {
        setBoneRotation(
          'rightLowerArm',
          rightLowerArmBase.x + Math.sin(elapsed * 0.88 + 0.9) * 0.03,
          rightLowerArmBase.y,
          rightLowerArmBase.z - Math.sin(elapsed * 0.63 + 0.6) * 0.025
        );
      }

      let mouthTarget = 0;
      if (lipSyncActive && lipSyncAnalyser && lipSyncBuf) {
        lipSyncAnalyser.getByteTimeDomainData(lipSyncBuf);
        let sumSq = 0;
        for (let i = 0; i < lipSyncBuf.length; i++) {
          const x = (lipSyncBuf[i] / 128.0) - 1.0;
          sumSq += x * x;
        }
        const rms = Math.sqrt(sumSq / lipSyncBuf.length);
        mouthTarget = Math.min(1.0, rms * 10.0);
      } else if (speaking) {
        mouthTarget = 0.2 + Math.abs(Math.sin(elapsed * 7)) * 0.45;
      }

      mouthCurrent = lerp(mouthCurrent, mouthTarget, lipSyncActive ? 0.5 : 0.2);

      setExpression('aa', mouthCurrent);
      setExpression('surprised', listening ? 0.08 : 0);

      blinkCooldown -= dt;
      if (!blinking && blinkCooldown <= 0) {
        blinking = true;
        blinkProgress = 0;
        blinkCooldown = Math.random() * 2.5 + 1.8;
      }

      if (blinking) {
        blinkProgress += dt / 0.16;
        const blinkValue = blinkProgress < 0.5
          ? blinkProgress * 2
          : (1 - blinkProgress) * 2;
        const clampedBlink = Math.min(Math.max(blinkValue, 0), 1);
        setExpression('blinkLeft', clampedBlink);
        setExpression('blinkRight', clampedBlink);

        if (blinkProgress >= 1) {
          blinking = false;
          setExpression('blinkLeft', 0);
          setExpression('blinkRight', 0);
        }
      }

      if (vrm.expressionManager && vrm.expressionManager.update) {
        vrm.expressionManager.update();
      }
    }

    renderer.render(scene, camera);
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    window._dbg('Render loop error: ' + msg);

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'error',
        message: msg
      }));
    }
  }
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  if (vrm) {
    frameCamera(vrm.scene);
  }
});

loadVRM();
// === LIP SYNC VIA WEB AUDIO API ===
let lipSyncCtx = null, lipSyncAnalyser = null, lipSyncBuf = null;
let lipSyncSource = null, lipSyncActive = false;

window.playAudioWithLipSync = async function(dataUri) {
  if (lipSyncSource) { try { lipSyncSource.stop(); } catch(e) {} }
  lipSyncActive = false; lipSyncAnalyser = null; lipSyncBuf = null; lipSyncSource = null;
  try {
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
    const bin = atob(base64);
    const ab = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) ab[i] = bin.charCodeAt(i);

    if (!lipSyncCtx) lipSyncCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (lipSyncCtx.state === 'suspended') await lipSyncCtx.resume();

    const decoded = await lipSyncCtx.decodeAudioData(ab.buffer);
    lipSyncAnalyser = lipSyncCtx.createAnalyser();
    lipSyncAnalyser.fftSize = 256;
    lipSyncBuf = new Uint8Array(lipSyncAnalyser.frequencyBinCount);

    lipSyncSource = lipSyncCtx.createBufferSource();
    lipSyncSource.buffer = decoded;
    lipSyncSource.connect(lipSyncAnalyser);
    lipSyncAnalyser.connect(lipSyncCtx.destination);
    lipSyncActive = true;

    lipSyncSource.onended = () => {
      lipSyncActive = false; lipSyncAnalyser = null; lipSyncBuf = null; lipSyncSource = null;
      if (window.ReactNativeWebView)
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'audioEnd' }));
    };
    lipSyncSource.start(0);
  } catch(err) {
    lipSyncActive = false;
    if (window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'audioEnd', error: String(err) }));
  }
};

window.stopAudioLipSync = function() {
  lipSyncActive = false;
  if (lipSyncSource) { try { lipSyncSource.stop(); } catch(e) {} lipSyncSource = null; }
  lipSyncAnalyser = null; lipSyncBuf = null;
};

requestAnimationFrame(animate);
<\/script>
</body>
</html>`;
}

export const AvatarVRM = forwardRef(({
  modelUrl = DEFAULT_VRM_MODEL_URL,
  width,
  height,
  isListening = false,
  isSpeaking = false,
  isThinking = false,
  style,
}, ref) => {
  const webRef = useRef(null);
  const stateRef = useRef('idle');
  const audioEndResolveRef = useRef(null);

  const [webKey, setWebKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useImperativeHandle(ref, () => ({
    playAudio: (dataUri) => new Promise(resolve => {
      audioEndResolveRef.current = resolve;
      webRef.current?.injectJavaScript(
        `window.playAudioWithLipSync(${JSON.stringify(dataUri)});true;`
      );
    }),
    stopAudio: () => {
      audioEndResolveRef.current = null;
      webRef.current?.injectJavaScript(`window.stopAudioLipSync();true;`);
    },
  }));

  const source = useMemo(
    () => ({
      html: buildHTML(modelUrl),
      baseUrl: 'https://localhost/',
    }),
    [modelUrl]
  );

  const recoverWebView = useCallback((reason) => {
    console.log('[AvatarVRM] Recovering WebView:', reason);
    setLoading(true);
    setError(false);
    setWebKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const next = isSpeaking ? 'speaking' : isThinking ? 'thinking' : isListening ? 'listening' : 'idle';

    if (next === stateRef.current) return;

    stateRef.current = next;

    webRef.current?.injectJavaScript(`
      if (window.setAvatarState) {
        window.setAvatarState('${next}');
      }
      true;
    `);
  }, [isListening, isSpeaking, isThinking]);

  const handleMessage = useCallback(
    (event) => {
      console.log('[AvatarVRM] message:', event.nativeEvent.data);

      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'loaded') {
          setLoading(false);
          setError(false);
        }

        if (data.type === 'error') {
          setLoading(false);
          setError(true);
        }

        if (data.type === 'context_lost') {
          recoverWebView('webgl-context-lost');
        }

        if (data.type === 'debug') {
          console.log('[AvatarVRM]', data.message);
        }

        if (data.type === 'audioEnd') {
          const resolve = audioEndResolveRef.current;
          audioEndResolveRef.current = null;
          resolve?.();
        }
      } catch (e) {
        console.log('[AvatarVRM] Failed to parse message:', e);
      }
    },
    [recoverWebView]
  );

  const sizeStyle =
    width != null || height != null
      ? {
          width: width ?? 300,
          height: height ?? 420,
        }
      : {};

  return (
    <View style={[sizeStyle, styles.container, style]}>
      <WebView
        key={webKey}
        ref={webRef}
        source={source}
        style={styles.webview}
        backgroundColor="transparent"
        containerStyle={styles.webviewContainer}
        onLoadStart={() => {
          setLoading(true);
          setError(false);
        }}
        onLoadEnd={() => {
          console.log('[AvatarVRM] WebView load ended');
        }}
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
        mediaPlaybackRequiresUserAction={false}
        onNavigationStateChange={(navState) => {
          console.log(
            '[AvatarVRM] nav',
            navState.url,
            'loading=',
            navState.loading
          );
        }}
        onShouldStartLoadWithRequest={(request) => {
          const url = request?.url ?? '';

          const allow =
            url.startsWith('about:blank') ||
            url.startsWith('https://localhost/') ||
            url.startsWith('https://') ||
            url.startsWith('http://') ||
            url.startsWith('blob:') ||
            url.startsWith('data:');

          if (!allow) {
            console.log('[AvatarVRM] Blocked navigation:', url);
          }

          return allow;
        }}
        onMessage={handleMessage}
        onContentProcessDidTerminate={() =>
          recoverWebView('ios-content-process-terminated')
        }
        onRenderProcessGone={() => recoverWebView('android-render-process-gone')}
        onError={(e) => {
          console.log('[AvatarVRM] WebView error', e.nativeEvent);
          setLoading(false);
          setError(true);
        }}
        onHttpError={(e) => {
          console.log('[AvatarVRM] HTTP error', e.nativeEvent.statusCode);
          setLoading(false);
          setError(true);
        }}
      />

      {loading && !error && (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="rgba(255,255,255,0.7)" />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webviewContainer: {
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});