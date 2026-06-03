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
    background: #0D0D1A;
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
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"
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
renderer.setClearColor(0x0D0D1A, 1.0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

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

// Bright warm neutral ambient — lifts shadow floor so eye sockets are not dark
scene.add(new THREE.AmbientLight(0xD0C8C0, 0.70));

// Key light — reduced intensity, moved forward (+Z) to fill the face frontally
const keyLight = new THREE.DirectionalLight(0xFFF5E8, 1.3);
keyLight.position.set(-0.8, 2.0, 3.5);
scene.add(keyLight);

// Fill light — warm front-right, even coverage, removes harsh shadows
const fillLight = new THREE.DirectionalLight(0xFFEDD8, 0.70);
fillLight.position.set(1.2, 1.0, 3.0);
scene.add(fillLight);

// Subtle warm-gold top rim — very low intensity, separates hair from background
const rimLight = new THREE.DirectionalLight(0xFFD090, 0.15);
rimLight.position.set(0.0, 3.0, -2.0);
scene.add(rimLight);

// GLB model references
let model     = null;   // gltf.scene — the root Object3D
let headMesh  = null;   // Wolf3D_Head — drives visemes, blinks, expressions
let teethMesh = null;   // Wolf3D_Teeth — mirrors viseme morph targets

let baseRotationY = 0;
let basePositionY = 0;
let avatarState = 'idle';
let mouthCurrent = 0;
// All internal viseme keys — vowels + consonant articulators
const ALL_VISEME_KEYS = ['aa','ih','ou','ee','oh','v_pp','v_ff','v_th','v_dd','v_kk','v_ch','v_ss','v_nn','v_rr'];
// Per-channel smoothed weights — lerped each frame so transitions feel organic
const vSmooth = { aa:0, ih:0, ou:0, ee:0, oh:0, v_pp:0, v_ff:0, v_th:0, v_dd:0, v_kk:0, v_ch:0, v_ss:0, v_nn:0, v_rr:0 };
const V_LERP = 0.55;
let lastTs = null;
let elapsed = 0;
// State blends — each lerps 0→1 as the matching state becomes active
let activeBlend  = 0;
let speakBlend   = 0;
let thinkBlend   = 0;
let empathyBlend = 0;
let waitBlend    = 0;
let listenBlend  = 0;

// Blink state machine — phases: idle|closing|hold|opening|between|closing2|hold2|opening2
let blinkPhase    = 'idle';
let blinkTimer    = 0;
let blinkNext     = 3.0;   // seconds until next blink trigger
let blinkIsDouble = false;
let blinkValue    = 0;     // 0 = eyes open, 1 = fully closed

// Organic breathing rhythm variation (prevents mechanical regularity)
let breathVarTarget  = 0;
let breathVarCurrent = 0;
let breathVarNext    = 4.0;

// Bone map built once on load — keyed by our normalised names
const boneMap  = {};
const boneBase = {};

// Micro-saccade state — tiny random eye fixation shifts
let nextSaccadeTime = 0;
let saccadeTargetX  = 0, saccadeTargetY  = 0;
let saccadeCurrentX = 0, saccadeCurrentY = 0;

// Phase accumulators — prevent sine discontinuities when rate changes
let bobPhase   = 0;
let swayPhase  = 0;
let breathPhase = 0;

// Idle smile moment state machine
let idleSmileActive  = false;
let idleSmileTimer   = 0;
let idleSmileNext    = 5.0 + Math.random() * 8.0;
let idleSmileHold    = 0;
let idleSmileTarget  = 0;
let idleSmileCurrent = 0;

// Idle head tilt moment state machine
let idleTiltActive  = false;
let idleTiltTimer   = 0;
let idleTiltNext    = 8.0 + Math.random() * 10.0;
let idleTiltHold    = 0;
let idleTiltTarget  = 0;
let idleTiltCurrent = 0;

// Listening nod state machine
let nodActive  = false;
let nodTimer   = 0;
let nodNext    = 3.5 + Math.random() * 3.5;
let nodHold    = 0;
let nodTarget  = 0;
let nodCurrent = 0;

// Conversational gaze state machine
// 'center' = looking at camera (eye contact); 'away' = natural glance break
let gazePhase    = 'center';
let gazeTimer    = 0;
let gazeDuration = 1.5;   // seconds to hold current gaze phase
let gazeTargetH  = 0;     // horizontal gaze target (0 = camera center)
let gazeTargetV  = 0.01;  // slight upward = looking into eyes rather than forehead
let gazeCurrentH = 0;
let gazeCurrentV = 0;

function frameCamera(modelScene) {
  const box = new THREE.Box3().setFromObject(modelScene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  const height = size.y || 1.6;

  // Waist-up framing: show top 45% of avatar (head down to just above the hips).
  // Extra headroom above (+0.10) keeps the face from sitting at the very top.
  const visibleBottom = box.min.y + height * 0.55;
  const visibleTop    = box.max.y + height * 0.10;
  const visibleCenterY = (visibleBottom + visibleTop) / 2;
  const visibleHeight  = visibleTop - visibleBottom;

  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const distance = (visibleHeight / 2) / Math.tan(fovRad / 2);

  camera.position.set(center.x, visibleCenterY, distance * 1.0);
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

// ─── ANIMATION CONFIGURATION ─────────────────────────────────────────────────
// All animation intensities, rates, and thresholds live here — tweak freely.
const ANIM = {
  // Breathing
  BREATH_RATE_IDLE:    1.5,    BREATH_RATE_SPEAK:   2.2,
  BREATH_SPINE_AMP:    0.015,  BREATH_CHEST_AMP:    0.025,
  BREATH_NECK_AMP:     0.008,  BREATH_ARM_AMP:      0.018,
  BREATH_VAR_AMP:      0.003,  // organic rate modulation depth

  // Body bob / sway
  BOB_IDLE:      0.005,  BOB_ACTIVE:      0.010,
  BOB_RATE_IDLE: 0.7,    BOB_RATE_LISTEN: 1.1,   BOB_RATE_SPEAK: 1.7,
  SWAY_IDLE:     0.012,  SWAY_ACTIVE:     0.022,  SWAY_SPEAK:     0.030,
  SWAY_RATE:     0.33,

  // Head look-around (dual-frequency natural drift)
  LOOK_H_AMP1: 0.09,   LOOK_H_AMP2: 0.040, LOOK_H_FREQ1: 0.25, LOOK_H_FREQ2: 0.16,
  LOOK_V_AMP1: 0.035,  LOOK_V_AMP2: 0.011, LOOK_V_FREQ1: 0.37, LOOK_V_FREQ2: 0.22,
  LOOK_ACTIVE_SCALE: 0.40,
  HEAD_ROLL_AMP: 0.010, HEAD_ROLL_FREQ: 0.33,

  // Micro-saccades (randomised fixation shifts)
  SACCADE_X_AMP: 0.040, SACCADE_Y_AMP: 0.028,
  SACCADE_MIN:   1.0,   SACCADE_MAX:   3.0,

  // Conversational gaze — eye contact with natural periodic breaks
  GAZE_HOLD_MIN:     1.4,   // minimum seconds of direct eye contact
  GAZE_HOLD_RANGE:   2.0,   // random range on top → 1.4–3.4 s eye contact
  GAZE_AWAY_MIN:     0.30,  // minimum seconds of looking away
  GAZE_AWAY_RANGE:   0.70,  // random range on top → 0.30–1.0 s break
  GAZE_AWAY_H:       0.09,  // max horizontal offset when glancing (radians)
  GAZE_AWAY_V:       0.05,  // max vertical offset when glancing (radians)
  GAZE_RETURN_SPEED: 4.5,   // lerp multiplier returning to center (fast, deliberate)
  GAZE_SHIFT_SPEED:  3.0,   // lerp multiplier shifting gaze away (slightly slower)
  GAZE_MICRO_H:      0.012, // residual horizontal head micro-movement
  GAZE_MICRO_V:      0.007, // residual vertical head micro-movement

  // Eye bone rotation — eyes lead, head follows
  EYE_H_SCALE:   0.60,  // fraction of horizontal gaze handled by eye bones (rest = head)
  EYE_V_SCALE:   0.65,  // fraction of vertical gaze handled by eye bones
  EYE_SACCADE:   0.75,  // fraction of saccade offset routed to eyes vs. head

  // Blinking — natural asymmetric eyelid kinematics (fast close, slow open)
  BLINK_CLOSE_DUR:   0.075,  // fast close  (~75 ms)
  BLINK_HOLD_DUR:    0.030,  // hold closed (~30 ms)
  BLINK_OPEN_DUR:    0.180,  // slow open   (~180 ms)
  BLINK_MIN:         3.0,    // minimum seconds between blinks
  BLINK_MAX:         7.5,    // maximum seconds between blinks
  BLINK_DOUBLE_PROB: 0.18,   // probability of a double blink
  BLINK_DOUBLE_GAP:  0.12,   // pause between the two closures in a double blink

  // State-specific head pose biases (radians)
  THINK_GAZE_H:    0.09,  THINK_GAZE_V:    -0.06,  THINK_TILT_Z:   0.13,
  EMPATHY_TILT_Z: -0.08,  EMPATHY_TILT_X:   0.015,
  LISTEN_TILT_X:   0.010,
  WAIT_TILT_Z:     0.040,  // gentle curious lean when waiting (~2.3°)
  NOD_AMP:         0.032,  // listening nod forward-dip amplitude (~1.8°)
  NOD_SPEED:       2.2,    // lerp speed toward/away from nod peak
  NOD_HOLD_MIN:    0.30,   NOD_HOLD_MAX:    0.70,  // seconds to hold dipped position
  NOD_INT_MIN:     3.5,    NOD_INT_MAX:     7.0,   // seconds between nod triggers

  // Arms
  ARM_FREQ1: 0.50, ARM_FREQ2: 0.79, ARM_AMP1: 0.050, ARM_AMP2: 0.020,
  ARM_LOWER_FREQ: 0.86, ARM_LOWER_AMP: 0.028,
  ARM_TWIST_FREQ: 0.61, ARM_TWIST_AMP: 0.022,

  // Facial expressions
  IDLE_SMILE:         0.28,  IDLE_RELAX:        0.18,
  ACTIVE_SMILE_MIN:   0.10,  // floor — smile never fully disappears
  LISTEN_SURPRISE:    0.04,  LISTEN_BROW_INNER: 0.08,
  EMPATHY_BROW_INNER: 0.12,  THINK_BROW_DOWN:   0.08,

  // Idle personality moments — gentle smile + head tilt to feel warm and alive
  IDLE_SMILE_PEAK:         0.68,  // peak smile weight during a moment
  IDLE_SMILE_MOMENT_SPEED: 2.8,   // lerp speed toward/away from peak
  IDLE_SMILE_HOLD_MIN:     1.5,   IDLE_SMILE_HOLD_MAX:     3.0,
  IDLE_SMILE_INT_MIN:      5.0,   IDLE_SMILE_INT_MAX:      12.0,

  IDLE_TILT_AMP:           0.055, // max head roll (~3°)
  IDLE_TILT_SPEED:         1.0,
  IDLE_TILT_HOLD_MIN:      1.2,   IDLE_TILT_HOLD_MAX:      2.8,
  IDLE_TILT_INT_MIN:       10.0,  IDLE_TILT_INT_MAX:       24.0,
};

// Smooth-step: slow-in, slow-out — more organic than linear for eyelids
function smoothstep(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}
function blinkCurveClose(t) { return smoothstep(t / ANIM.BLINK_CLOSE_DUR); }
function blinkCurveOpen(t)  { return 1 - smoothstep(t / ANIM.BLINK_OPEN_DUR); }

function bone(name) {
  return boneMap[name] || null;
}

// Mixamo → our normalised bone name (RPM exports use Mixamo rig)
const BONE_NAME_MAP = {
  'hips':                    ['Hips'],
  'spine':                   ['Spine'],
  'chest':                   ['Spine2', 'Spine1', 'Chest'],
  'neck':                    ['Neck'],
  'head':                    ['Head'],
  'leftEye':                 ['LeftEye'],
  'rightEye':                ['RightEye'],
  'leftShoulder':            ['LeftShoulder'],
  'rightShoulder':           ['RightShoulder'],
  'leftUpperArm':            ['LeftArm'],
  'rightUpperArm':           ['RightArm'],
  'leftLowerArm':            ['LeftForeArm'],
  'leftLowerArmRoll':        ['LeftForeArm1'],
  'rightLowerArm':           ['RightForeArm'],
  'rightLowerArmRoll':       ['RightForeArm1'],
  'leftHand':                ['LeftHand'],
  'rightHand':               ['RightHand'],
  'leftIndexProximal':       ['LeftHandIndex1'],
  'leftIndexIntermediate':   ['LeftHandIndex2'],
  'leftMiddleProximal':      ['LeftHandMiddle1'],
  'leftMiddleIntermediate':  ['LeftHandMiddle2'],
  'leftRingProximal':        ['LeftHandRing1'],
  'leftRingIntermediate':    ['LeftHandRing2'],
  'leftLittleProximal':      ['LeftHandPinky1'],
  'leftLittleIntermediate':  ['LeftHandPinky2'],
  'leftThumbProximal':       ['LeftHandThumb1'],
  'rightIndexProximal':      ['RightHandIndex1'],
  'rightIndexIntermediate':  ['RightHandIndex2'],
  'rightMiddleProximal':     ['RightHandMiddle1'],
  'rightMiddleIntermediate': ['RightHandMiddle2'],
  'rightRingProximal':       ['RightHandRing1'],
  'rightRingIntermediate':   ['RightHandRing2'],
  'rightLittleProximal':     ['RightHandPinky1'],
  'rightLittleIntermediate': ['RightHandPinky2'],
  'rightThumbProximal':      ['RightHandThumb1'],
};

function buildBoneMap() {
  const reverseMap = {};
  for (const [normalised, candidates] of Object.entries(BONE_NAME_MAP)) {
    for (const candidate of candidates) {
      reverseMap[candidate] = normalised;
    }
  }
  model.traverse((obj) => {
    if (!obj.isBone && !obj.isSkinnedMesh) return;
    const normalised = reverseMap[obj.name];
    if (normalised && !boneMap[normalised]) {
      boneMap[normalised] = obj;
    }
  });
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

  // Clavicle: slight forward-and-down set so the shoulder sits naturally on the torso
  // rather than being pulled back or shrugged. Adjust z to push arm geometry outward.
  const leftShoulder  = bone('leftShoulder');
  const rightShoulder = bone('rightShoulder');
  if (leftShoulder)  { leftShoulder.rotation.z  -= 0.16;  leftShoulder.rotation.y  += 0.05; }
  if (rightShoulder) { rightShoulder.rotation.z += 0.16;  rightShoulder.rotation.y -= 0.05; }

  if (leftUpperArm) {
    leftUpperArm.rotation.z -= -1.25;
    leftUpperArm.rotation.x += 0.1;
    leftUpperArm.rotation.y += 1.5;
  }

  if (rightUpperArm) {
    rightUpperArm.rotation.z += -1.25;
    rightUpperArm.rotation.x += 0.1;
    rightUpperArm.rotation.y -= 1.5;
  }

  if (leftLowerArm) {
    leftLowerArm.rotation.z -= 0.04;
    leftLowerArm.rotation.x -= 0.04;
  }

  if (rightLowerArm) {
    rightLowerArm.rotation.z += 0.04;
    rightLowerArm.rotation.x -= 0.04;
  }

  // Elbow hang angle — X only on the main forearm bone (this bone is elbow flex,
  // not the roll axis; adding Y here swings the arm rather than twisting the palm).
  if (leftLowerArm)  leftLowerArm.rotation.x -= 0.5;
  if (rightLowerArm) rightLowerArm.rotation.x -= 0.5;

  // Palm supination via the dedicated twist/roll bones (LeftForeArm1 / RightForeArm1).
  // These start at identity T-pose and exist purely for forearm roll — Y rotation
  // here is a clean supination with zero positional side-effect on the arm.
  const leftLowerArmRoll  = bone('leftLowerArmRoll');
  const rightLowerArmRoll = bone('rightLowerArmRoll');
  if (leftLowerArmRoll)  leftLowerArmRoll.rotation.y  -= 1.4;
  if (rightLowerArmRoll) rightLowerArmRoll.rotation.y += 1.4;

  // Wrist: tiny extension to prevent droop; palm direction set by roll bones above.
  if (leftHand)  { leftHand.rotation.x -= 0.05;  leftHand.rotation.y += 0.0;  leftHand.rotation.z += 0.0; }
  if (rightHand) { rightHand.rotation.x -= 0.05;  rightHand.rotation.y += 0.0;  rightHand.rotation.z += 0.0; }

  // Finger curl — negative X is the curl/flexion direction in this RPM rig.
  // T-pose starts at x≈+0.284 (slight extension); subtracting X moves into flexion.
  // Symmetric for both hands (positive X = extension for both, from GLB data).
  const CURL_P = 0.45;          // proximal joints
  const CURL_I = CURL_P * 0.55; // intermediate joints curl less
  [
    'leftIndexProximal',  'leftMiddleProximal',
    'leftRingProximal',   'leftLittleProximal',
    'rightIndexProximal', 'rightMiddleProximal',
    'rightRingProximal',  'rightLittleProximal',
  ].forEach(n => { const b = bone(n); if (b) b.rotation.x -= CURL_P; });
  [
    'leftIndexIntermediate',  'leftMiddleIntermediate',
    'leftRingIntermediate',   'leftLittleIntermediate',
    'rightIndexIntermediate', 'rightMiddleIntermediate',
    'rightRingIntermediate',  'rightLittleIntermediate',
  ].forEach(n => { const b = bone(n); if (b) b.rotation.x -= CURL_I; });

  // Thumb: natural rest position.
  const lThumb = bone('leftThumbProximal');
  const rThumb = bone('rightThumbProximal');
  if (lThumb) lThumb.rotation.z += 0.22;
  if (rThumb) rThumb.rotation.z -= 0.22;

  [
    'spine',
    'chest',
    'neck',
    'head',
    'leftEye',
    'rightEye',
    'leftShoulder',
    'rightShoulder',
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

// Maps our internal expression names to morph target names on the head mesh.
// Defaults follow RPM/Oculus/ARKit convention. patchExprMap() rewrites entries
// at runtime if the loaded model uses a different naming convention.
let EXPR_MAP = {
  // ── Vowel visemes (Oculus/RPM names by default) ───────────────────────────
  'aa':    ['viseme_aa'],
  'ih':    ['viseme_I'],
  'ou':    ['viseme_U'],
  'ee':    ['viseme_E'],
  'oh':    ['viseme_O'],
  // ── Consonant visemes ─────────────────────────────────────────────────────
  'v_pp':  ['viseme_PP'],
  'v_ff':  ['viseme_FF'],
  'v_th':  ['viseme_TH'],
  'v_dd':  ['viseme_DD'],
  'v_kk':  ['viseme_kk'],
  'v_ch':  ['viseme_CH'],
  'v_ss':  ['viseme_SS'],
  'v_nn':  ['viseme_nn'],
  'v_rr':  ['viseme_RR'],
  // ── Facial expressions ────────────────────────────────────────────────────
  'blinkLeft':  ['eyeBlinkLeft'],
  'blinkRight': ['eyeBlinkRight'],
  'happy':      ['mouthSmileLeft', 'mouthSmileRight'],
  'relaxed':    ['cheekSquintLeft', 'cheekSquintRight'],
  'surprised':  ['eyeWideLeft', 'eyeWideRight'],
  // ── Eyebrow expressions (RPM ARKit names) ────────────────────────────────
  'browInnerUp': ['browInnerUp'],
  'browDown':    ['browDownLeft', 'browDownRight'],
  'browOuterUp': ['browOuterUpLeft', 'browOuterUpRight'],
};

// Alternate blend shape names used by some ARKit/MetaPerson exports.
const EXPR_ALTERNATES = {
  'blinkLeft':  [['eyeBlinkLeft'], ['EyeBlink_L'], ['Blink_L']],
  'blinkRight': [['eyeBlinkRight'], ['EyeBlink_R'], ['Blink_R']],
  'surprised':  [['eyeWideLeft', 'eyeWideRight'], ['EyeWide_L', 'EyeWide_R']],
  'happy':      [['mouthSmileLeft', 'mouthSmileRight'], ['mouthSmile_L', 'mouthSmile_R']],
  'relaxed':    [['cheekSquintLeft', 'cheekSquintRight'], ['cheekSquint_L', 'cheekSquint_R']],
  'browInnerUp': [['browInnerUp'], ['BrowInnerUp']],
  'browDown':    [['browDownLeft', 'browDownRight'], ['BrowDown_L', 'BrowDown_R']],
};

function patchExprMap() {
  if (!headMesh || !headMesh.morphTargetDictionary) return;
  const dict = headMesh.morphTargetDictionary;

  // Patch eye/face expression names for alternate ARKit export conventions.
  for (const [key, variants] of Object.entries(EXPR_ALTERNATES)) {
    for (const variant of variants) {
      if (variant.every(name => name in dict)) {
        EXPR_MAP[key] = variant;
        break;
      }
    }
  }

  // AvatarSDK MetaPerson export — viseme shapes exist but without the "viseme_" prefix.
  // Shape names: aa, ih, ou, oh, E (note uppercase E for the "ee" vowel).
  // Must be checked BEFORE the jawOpen fallback because this model has both.
  if (!('viseme_aa' in dict) && 'aa' in dict && 'ih' in dict) {
    // Vowels
    EXPR_MAP.aa = ['aa'];
    EXPR_MAP.ih = ['ih'];
    EXPR_MAP.ou = ['ou'];
    EXPR_MAP.ee = 'E' in dict ? ['E'] : EXPR_MAP.ee;
    EXPR_MAP.oh = ['oh'];
    // Consonant articulators (AvatarSDK exports without viseme_ prefix)
    if ('PP' in dict) EXPR_MAP.v_pp = ['PP'];
    if ('FF' in dict) EXPR_MAP.v_ff = ['FF'];
    if ('TH' in dict) EXPR_MAP.v_th = ['TH'];
    if ('DD' in dict) EXPR_MAP.v_dd = ['DD'];
    if ('kk' in dict) EXPR_MAP.v_kk = ['kk'];
    if ('CH' in dict) EXPR_MAP.v_ch = ['CH'];
    if ('SS' in dict) EXPR_MAP.v_ss = ['SS'];
    if ('nn' in dict) EXPR_MAP.v_nn = ['nn'];
    if ('RR' in dict) EXPR_MAP.v_rr = ['RR'];
    window._dbg('Visemes: AvatarSDK full set (vowels + consonant articulators)');
  }

  // If the model has no Oculus viseme shapes (viseme_aa etc.) but has ARKit jaw/mouth
  // shapes, remap the five visemes onto weighted ARKit combos.
  // Each entry is [morphName, scale] — the incoming viseme weight (0–1) is multiplied
  // by scale so we can mix multiple shapes at different intensities.
  else if (!('viseme_aa' in dict) && !('aa' in dict) && 'jawOpen' in dict) {
    const has = (n) => n in dict;
    // aa — open vowel ("father"): strong jaw drop + lower lip pull
    EXPR_MAP.aa = [
      ['jawOpen',            0.72],
      ...(has('mouthLowerDownLeft')  ? [['mouthLowerDownLeft',  0.50], ['mouthLowerDownRight', 0.50]] : []),
      ...(has('mouthRollLower')      ? [['mouthRollLower',      0.22]] : []),
    ];
    // ih — front vowel ("bit"): wide lip stretch, slight jaw
    EXPR_MAP.ih = [
      ['jawOpen',            0.22],
      ...(has('mouthStretchLeft')    ? [['mouthStretchLeft',    0.78], ['mouthStretchRight',   0.78]] : []),
      ...(has('mouthDimpleLeft')     ? [['mouthDimpleLeft',     0.18], ['mouthDimpleRight',    0.18]] : []),
    ];
    // ou — rounded vowel ("you"): pucker with moderate jaw
    EXPR_MAP.ou = [
      ['jawOpen',            0.28],
      ...(has('mouthPucker')         ? [['mouthPucker',         0.88]] : []),
      ...(has('mouthFunnel')         ? [['mouthFunnel',         0.25]] : []),
    ];
    // ee — high front vowel ("see"): strong stretch, near-closed jaw
    EXPR_MAP.ee = [
      ['jawOpen',            0.12],
      ...(has('mouthStretchLeft')    ? [['mouthStretchLeft',    0.82], ['mouthStretchRight',   0.82]] : []),
      ...(has('mouthSmileLeft')      ? [['mouthSmileLeft',      0.16], ['mouthSmileRight',     0.16]] : []),
    ];
    // oh — rounded open vowel ("go"): funnel + strong jaw drop
    EXPR_MAP.oh = [
      ['jawOpen',            0.65],
      ...(has('mouthFunnel')         ? [['mouthFunnel',         0.78]] : []),
      ...(has('mouthLowerDownLeft')  ? [['mouthLowerDownLeft',  0.22], ['mouthLowerDownRight', 0.22]] : []),
    ];
    window._dbg('Visemes remapped to weighted ARKit shapes');
  }

  window._dbg('EXPR_MAP.aa=' + EXPR_MAP.aa + ' blinkLeft=' + EXPR_MAP.blinkLeft);
}

// Viseme keys — all of these are mirrored to teethMesh when present.
const VISEME_KEYS = new Set(ALL_VISEME_KEYS);

function setMorphTarget(mesh, morphName, value) {
  if (!mesh || !mesh.morphTargetDictionary) return;
  const idx = mesh.morphTargetDictionary[morphName];
  if (idx !== undefined) {
    mesh.morphTargetInfluences[idx] = Math.max(0, Math.min(1, value));
  }
}

function setExpression(name, value) {
  if (!headMesh) return;
  const targets = EXPR_MAP[name];
  if (!targets) return;
  const isViseme = VISEME_KEYS.has(name);
  for (const entry of targets) {
    // Each entry is either a plain string or a [morphName, scale] pair.
    // Scaled entries let one logical viseme drive multiple morphs at different intensities.
    const morphName = Array.isArray(entry) ? entry[0] : entry;
    const scale     = Array.isArray(entry) ? entry[1] : 1.0;
    const v = value * scale;
    setMorphTarget(headMesh, morphName, v);
    if (isViseme && teethMesh) setMorphTarget(teethMesh, morphName, v);
  }
}

function loadModel() {
  window._dbg('Renderer created, loading GLB model...');

  const loader = new GLTFLoader();
  loader.crossOrigin = 'anonymous';

  loader.load(
    '${safeUrl}',
    (gltf) => {
      window._dbg('GLTF loaded, setting up model...');

      model = gltf.scene;

      // Collect all meshes that carry morph targets for scored head/teeth detection.
      const morphMeshes = [];
      model.traverse((obj) => {
        obj.frustumCulled = false;
        if (!obj.isMesh) return;
        const morphCount = obj.morphTargetDictionary ? Object.keys(obj.morphTargetDictionary).length : 0;
        window._dbg('Mesh: ' + obj.name + (morphCount ? ' [' + morphCount + ' morphs]' : ''));
        if (morphCount > 0) morphMeshes.push(obj);

        // RPM exact names — highest priority
        if (obj.name === 'Wolf3D_Head')  headMesh  = obj;
        if (obj.name === 'Wolf3D_Teeth') teethMesh = obj;
      });

      // If RPM names didn't match, resolve head mesh by scored fallback
      if (!headMesh) {
        // P2: name contains 'head' or 'face' (case-insensitive)
        for (const m of morphMeshes) {
          const nm = m.name.toLowerCase();
          if (nm.includes('head') || nm.includes('face')) { headMesh = m; break; }
        }
      }
      if (!headMesh) {
        // P3: mesh with an eye-blink morph (reliable face-mesh marker); among matches pick the one
        // with the most morphs so we get jaw/mouth shapes too (MetaPerson has two face meshes).
        let p3best = null;
        for (const m of morphMeshes) {
          const d = m.morphTargetDictionary;
          if ('eyeBlinkLeft' in d || 'EyeBlink_L' in d || 'Blink_L' in d) {
            if (!p3best || Object.keys(d).length > Object.keys(p3best.morphTargetDictionary).length) {
              p3best = m;
            }
          }
        }
        if (p3best) headMesh = p3best;
      }
      if (!headMesh && morphMeshes.length > 0) {
        // P4: mesh with the most morph targets
        morphMeshes.sort((a, b) => Object.keys(b.morphTargetDictionary).length - Object.keys(a.morphTargetDictionary).length);
        headMesh = morphMeshes[0];
      }

      // Teeth: Wolf3D_Teeth already set, else name-match, else skip
      if (!teethMesh) {
        for (const m of morphMeshes) {
          if (m.name.toLowerCase().includes('teeth')) { teethMesh = m; break; }
        }
      }

      if (headMesh) {
        const names = Object.keys(headMesh.morphTargetDictionary).slice(0, 15).join(', ');
        window._dbg('Head mesh: ' + headMesh.name + ', morphs: ' + names);
      } else {
        window._dbg('Head mesh: NOT FOUND — expressions will be inactive');
      }
      if (teethMesh) window._dbg('Teeth mesh: ' + teethMesh.name);

      patchExprMap();
      buildBoneMap();

      baseRotationY = model.rotation.y;
      basePositionY = model.position.y;

      applyRelaxedPose();

      scene.add(model);
      frameCamera(model);

      if (statusEl) statusEl.style.display = 'none';

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'loaded' }));
      }

      window._dbg('Avatar loaded successfully');
    },
    (xhr) => {
      const pct = xhr.total ? Math.round((xhr.loaded / xhr.total) * 100) : '?';
      if (statusEl) statusEl.textContent = 'Loading ' + pct + '%';
      if (pct === 100) window._dbg('Model download 100%');
    },
    (error) => {
      const msg = error && error.message ? error.message : String(error);
      window._dbg('Model load error: ' + msg);
      if (statusEl) statusEl.textContent = 'Load error';
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: msg }));
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

    if (model) {
      // ─── STATE DETECTION ──────────────────────────────────────────────────
      const speaking  = avatarState === 'speaking';
      const listening = avatarState === 'listening';
      const thinking  = avatarState === 'thinking';
      const empathy   = avatarState === 'empathy';
      const waiting   = avatarState === 'waiting';
      const active    = speaking || listening || thinking || empathy || waiting;

      // Blend values drift toward target at ~0.04/frame (~0.6 s at 60 fps)
      activeBlend  = lerp(activeBlend,  active    ? 1 : 0, 0.04);
      speakBlend   = lerp(speakBlend,   speaking  ? 1 : 0, 0.04);
      thinkBlend   = lerp(thinkBlend,   thinking  ? 1 : 0, 0.035);
      empathyBlend = lerp(empathyBlend, empathy   ? 1 : 0, 0.030);
      waitBlend    = lerp(waitBlend,    waiting   ? 1 : 0, 0.035);
      listenBlend  = lerp(listenBlend,  listening ? 1 : 0, 0.04);

      // ─── BODY BOB & SWAY ──────────────────────────────────────────────────
      const bobAmp  = lerp(ANIM.BOB_IDLE, ANIM.BOB_ACTIVE, speakBlend);
      const bobRate = lerp(lerp(ANIM.BOB_RATE_IDLE, ANIM.BOB_RATE_LISTEN, listenBlend), ANIM.BOB_RATE_SPEAK, speakBlend);
      bobPhase += dt * bobRate;
      model.position.y = basePositionY + Math.sin(bobPhase) * bobAmp;

      const swayAmp = lerp(ANIM.SWAY_IDLE, lerp(ANIM.SWAY_ACTIVE, ANIM.SWAY_SPEAK, speakBlend), activeBlend);
      swayPhase += dt * ANIM.SWAY_RATE;
      model.rotation.y = baseRotationY + Math.sin(swayPhase) * swayAmp;

      // ─── ORGANIC BREATHING ────────────────────────────────────────────────
      // Modulate breath rate with a slow secondary oscillator so the rhythm
      // never locks into a perfectly regular pattern.
      if (elapsed > breathVarNext) {
        breathVarTarget = (Math.random() - 0.5) * ANIM.BREATH_VAR_AMP;
        breathVarNext   = elapsed + 3.0 + Math.random() * 5.0;
      }
      breathVarCurrent = lerp(breathVarCurrent, breathVarTarget, dt * 0.15);
      const breathRate = lerp(ANIM.BREATH_RATE_IDLE, ANIM.BREATH_RATE_SPEAK, speakBlend) + breathVarCurrent;
      breathPhase += dt * breathRate;
      const breath = Math.sin(breathPhase);

      const spineBase        = boneBase.spine;
      const chestBase        = boneBase.chest;
      const neckBase         = boneBase.neck;
      const headBase         = boneBase.head;
      const leftUpperArmBase  = boneBase.leftUpperArm;
      const rightUpperArmBase = boneBase.rightUpperArm;
      const leftLowerArmBase  = boneBase.leftLowerArm;
      const rightLowerArmBase = boneBase.rightLowerArm;

      if (spineBase) {
        setBoneRotation('spine', spineBase.x + breath * ANIM.BREATH_SPINE_AMP, spineBase.y, spineBase.z);
      }

      if (chestBase) {
        setBoneRotation('chest', chestBase.x + breath * ANIM.BREATH_CHEST_AMP, chestBase.y, chestBase.z);
      }

      // ─── CONVERSATIONAL GAZE ──────────────────────────────────────────────
      // Hold natural eye contact most of the time; take short periodic breaks
      // just as a real person would in conversation. Thinking state overrides
      // with its upward-right wander; idle retains gentle micro-movement.
      const thinkTiltZ   = thinkBlend   * ANIM.THINK_TILT_Z;
      const empathyTiltZ = empathyBlend * ANIM.EMPATHY_TILT_Z;
      const empathyTiltX = empathyBlend * ANIM.EMPATHY_TILT_X;
      const listenTiltX  = listenBlend  * ANIM.LISTEN_TILT_X;

      gazeTimer += dt;
      if (gazeTimer >= gazeDuration) {
        gazeTimer = 0;
        if (gazePhase === 'center') {
          // Break eye contact — glance to the side or slightly up/down
          gazePhase   = 'away';
          gazeTargetH = (Math.random() * 2 - 1) * ANIM.GAZE_AWAY_H;
          gazeTargetV = (Math.random() * 2 - 1) * ANIM.GAZE_AWAY_V;
          // Speaking: shorter breaks; listening: very brief; idle: longer wanders
          const awayScale = speaking ? 0.65 : listening ? 0.5 : 1.0;
          gazeDuration = (ANIM.GAZE_AWAY_MIN + Math.random() * ANIM.GAZE_AWAY_RANGE) * awayScale;
        } else {
          // Return to eye contact
          gazePhase   = 'center';
          gazeTargetH = 0;
          gazeTargetV = 0.01;  // very slight upward = looking into eyes
          // Listening holds eye contact longest; speaking normal; idle shorter
          const holdScale = listening ? 1.4 : speaking ? 1.0 : 0.7;
          gazeDuration = (ANIM.GAZE_HOLD_MIN + Math.random() * ANIM.GAZE_HOLD_RANGE) * holdScale;
        }
      }

      // Smooth the gaze — returning to center is slightly faster (decisive)
      const gazeSpeed = gazePhase === 'center' ? ANIM.GAZE_RETURN_SPEED : ANIM.GAZE_SHIFT_SPEED;
      gazeCurrentH = lerp(gazeCurrentH, gazeTargetH, dt * gazeSpeed);
      gazeCurrentV = lerp(gazeCurrentV, gazeTargetV, dt * gazeSpeed);

      // Tiny residual micro-movement so the head never looks frozen on a point
      const microH = Math.sin(elapsed * ANIM.LOOK_H_FREQ1) * ANIM.GAZE_MICRO_H
                   + Math.sin(elapsed * ANIM.LOOK_H_FREQ2) * ANIM.GAZE_MICRO_H * 0.4;
      const microV = Math.sin(elapsed * ANIM.LOOK_V_FREQ1) * ANIM.GAZE_MICRO_V;

      // Thinking state blends the gaze machine out and replaces with upward-right wander
      const lookH = lerp(gazeCurrentH + microH, ANIM.THINK_GAZE_H, thinkBlend);
      const lookV = lerp(gazeCurrentV + microV, ANIM.THINK_GAZE_V, thinkBlend);

      // Neck follows at reduced scale — eyes carry most of the horizontal gaze
      if (neckBase) {
        setBoneRotation(
          'neck',
          neckBase.x + breath * ANIM.BREATH_NECK_AMP + Math.sin(elapsed * 0.6) * 0.012,
          neckBase.y + lookH * 0.38 * (1.0 - ANIM.EYE_H_SCALE),
          neckBase.z
        );
      }

      // Micro-saccades — fast tiny fixation shifts routed primarily to the eye bones
      if (elapsed > nextSaccadeTime) {
        saccadeTargetX  = (Math.random() - 0.5) * ANIM.SACCADE_X_AMP;
        saccadeTargetY  = (Math.random() - 0.5) * ANIM.SACCADE_Y_AMP;
        const saccadeMin = listenBlend > 0.5 ? 0.6 : ANIM.SACCADE_MIN;
        const saccadeMax = listenBlend > 0.5 ? 1.8 : ANIM.SACCADE_MAX;
        nextSaccadeTime = elapsed + saccadeMin + Math.random() * (saccadeMax - saccadeMin);
      }
      // Saccades interpolate toward target — fast but smooth, not an instant pop
      saccadeCurrentX = lerp(saccadeCurrentX, saccadeTargetX, dt * 18.0);
      saccadeCurrentY = lerp(saccadeCurrentY, saccadeTargetY, dt * 18.0);

      // ─── IDLE PERSONALITY MOMENTS ─────────────────────────────────────────
      // Smile and head tilt moments only fire when Aria is at rest (activeBlend low).
      // Both fade out automatically as she becomes active.
      const isIdleEnough = activeBlend < 0.25;

      idleSmileTimer += dt;
      if (!idleSmileActive && isIdleEnough && idleSmileTimer >= idleSmileNext) {
        idleSmileActive = true;
        idleSmileHold   = ANIM.IDLE_SMILE_HOLD_MIN + Math.random() * (ANIM.IDLE_SMILE_HOLD_MAX - ANIM.IDLE_SMILE_HOLD_MIN);
        idleSmileTarget = ANIM.IDLE_SMILE_PEAK;
        idleSmileTimer  = 0;
      } else if (idleSmileActive && idleSmileTimer >= idleSmileHold) {
        idleSmileActive = false;
        idleSmileTarget = 0;
        idleSmileTimer  = 0;
        idleSmileNext   = ANIM.IDLE_SMILE_INT_MIN + Math.random() * (ANIM.IDLE_SMILE_INT_MAX - ANIM.IDLE_SMILE_INT_MIN);
      }
      idleSmileCurrent = lerp(idleSmileCurrent, idleSmileTarget, dt * ANIM.IDLE_SMILE_MOMENT_SPEED);

      idleTiltTimer += dt;
      if (!idleTiltActive && isIdleEnough && idleTiltTimer >= idleTiltNext) {
        idleTiltActive = true;
        idleTiltHold   = ANIM.IDLE_TILT_HOLD_MIN + Math.random() * (ANIM.IDLE_TILT_HOLD_MAX - ANIM.IDLE_TILT_HOLD_MIN);
        idleTiltTarget = (Math.random() > 0.5 ? 1 : -1) * ANIM.IDLE_TILT_AMP * (0.6 + Math.random() * 0.4);
        idleTiltTimer  = 0;
      } else if (idleTiltActive && idleTiltTimer >= idleTiltHold) {
        idleTiltActive = false;
        idleTiltTarget = 0;
        idleTiltTimer  = 0;
        idleTiltNext   = ANIM.IDLE_TILT_INT_MIN + Math.random() * (ANIM.IDLE_TILT_INT_MAX - ANIM.IDLE_TILT_INT_MIN);
      }
      idleTiltCurrent = lerp(idleTiltCurrent, idleTiltTarget, dt * ANIM.IDLE_TILT_SPEED);

      // ─── LISTENING NOD ────────────────────────────────────────────────────
      // Gentle periodic forward head-dip to signal active listening.
      // Only fires while listenBlend is high; fades proportionally as state leaves.
      const isListeningEnough = listenBlend > 0.3;
      nodTimer += dt;
      if (!nodActive && isListeningEnough && nodTimer >= nodNext) {
        nodActive = true;
        nodHold   = ANIM.NOD_HOLD_MIN + Math.random() * (ANIM.NOD_HOLD_MAX - ANIM.NOD_HOLD_MIN);
        nodTarget = ANIM.NOD_AMP;
        nodTimer  = 0;
      } else if (nodActive && nodTimer >= nodHold) {
        nodActive = false;
        nodTarget = 0;
        nodTimer  = 0;
        nodNext   = ANIM.NOD_INT_MIN + Math.random() * (ANIM.NOD_INT_MAX - ANIM.NOD_INT_MIN);
      }
      nodCurrent = lerp(nodCurrent, nodTarget, dt * ANIM.NOD_SPEED);
      if (!isListeningEnough) nodCurrent = lerp(nodCurrent, 0, dt * ANIM.NOD_SPEED);

      // Scale both idle moments out when active so transitions feel seamless
      const idleTiltOutput  = idleTiltCurrent  * (1 - activeBlend);
      const idleSmileOutput = idleSmileCurrent * (1 - activeBlend);

      // ─── EYE BONES ────────────────────────────────────────────────────────
      // Eyes lead the gaze direction; head follows passively at reduced scale.
      // This creates the natural human pattern of eyes moving first, head
      // drifting to catch up. Saccades route primarily here so they look like
      // actual eye micro-movements rather than head twitches.
      const leftEyeBase  = boneBase.leftEye;
      const rightEyeBase = boneBase.rightEye;
      const eyeH = lerp(gazeCurrentH, ANIM.THINK_GAZE_H, thinkBlend) * ANIM.EYE_H_SCALE;
      const eyeV = lerp(gazeCurrentV, ANIM.THINK_GAZE_V, thinkBlend) * ANIM.EYE_V_SCALE;

      if (leftEyeBase) {
        setBoneRotation('leftEye',
          leftEyeBase.x + eyeV + saccadeCurrentX * ANIM.EYE_SACCADE,
          leftEyeBase.y + eyeH + saccadeCurrentY * ANIM.EYE_SACCADE,
          leftEyeBase.z
        );
      }
      if (rightEyeBase) {
        setBoneRotation('rightEye',
          rightEyeBase.x + eyeV + saccadeCurrentX * ANIM.EYE_SACCADE,
          rightEyeBase.y + eyeH + saccadeCurrentY * ANIM.EYE_SACCADE,
          rightEyeBase.z
        );
      }

      // Head carries the remaining gaze fraction — tilt/empathy offsets stay full
      if (headBase) {
        setBoneRotation(
          'head',
          headBase.x + lookV * (1.0 - ANIM.EYE_V_SCALE) + saccadeCurrentX * (1.0 - ANIM.EYE_SACCADE) + empathyTiltX + listenTiltX + nodCurrent * listenBlend,
          headBase.y + lookH * 0.62 * (1.0 - ANIM.EYE_H_SCALE) + saccadeCurrentY * (1.0 - ANIM.EYE_SACCADE),
          headBase.z + Math.sin(elapsed * ANIM.HEAD_ROLL_FREQ) * ANIM.HEAD_ROLL_AMP + thinkTiltZ + empathyTiltZ + waitBlend * ANIM.WAIT_TILT_Z + idleTiltOutput
        );
      }

      // ─── ARMS ─────────────────────────────────────────────────────────────
      // Two frequencies per arm, with independent phase offsets per side,
      // so left and right arms never swing in perfect lockstep.
      const armSwingA  = Math.sin(elapsed * ANIM.ARM_FREQ1);
      const armSwingB  = Math.sin(elapsed * ANIM.ARM_FREQ2);
      const armSwingAR = Math.sin(elapsed * ANIM.ARM_FREQ1 + 1.1);
      const armSwingBR = Math.sin(elapsed * ANIM.ARM_FREQ2 + 0.7);

      if (leftUpperArmBase) {
        setBoneRotation(
          'leftUpperArm',
          leftUpperArmBase.x + breath * ANIM.BREATH_ARM_AMP,
          leftUpperArmBase.y + armSwingB * 0.018,
          leftUpperArmBase.z + armSwingA * ANIM.ARM_AMP1 + armSwingB * ANIM.ARM_AMP2
        );
      }

      if (rightUpperArmBase) {
        setBoneRotation(
          'rightUpperArm',
          rightUpperArmBase.x + breath * ANIM.BREATH_ARM_AMP,
          rightUpperArmBase.y - armSwingBR * 0.018,
          rightUpperArmBase.z - (armSwingAR * ANIM.ARM_AMP1 + armSwingBR * ANIM.ARM_AMP2)
        );
      }

      if (leftLowerArmBase) {
        setBoneRotation(
          'leftLowerArm',
          leftLowerArmBase.x + Math.sin(elapsed * ANIM.ARM_LOWER_FREQ) * ANIM.ARM_LOWER_AMP,
          leftLowerArmBase.y,
          leftLowerArmBase.z + Math.sin(elapsed * ANIM.ARM_TWIST_FREQ) * ANIM.ARM_TWIST_AMP
        );
      }

      if (rightLowerArmBase) {
        setBoneRotation(
          'rightLowerArm',
          rightLowerArmBase.x + Math.sin(elapsed * ANIM.ARM_LOWER_FREQ + 0.9) * ANIM.ARM_LOWER_AMP,
          rightLowerArmBase.y,
          rightLowerArmBase.z - Math.sin(elapsed * ANIM.ARM_TWIST_FREQ + 0.6) * ANIM.ARM_TWIST_AMP
        );
      }

      // ─── MOUTH / LIP SYNC ─────────────────────────────────────────────────
      if (visemeMode && lipSyncActive) {
        // Drive all 14 viseme channels with per-channel smoothing.
        const w = LipSyncController.getVisemeWeights();
        let maxV = 0;
        for (let vi = 0; vi < ALL_VISEME_KEYS.length; vi++) {
          const k = ALL_VISEME_KEYS[vi];
          vSmooth[k] = lerp(vSmooth[k], w[k] || 0, V_LERP);
          setExpression(k, vSmooth[k]);
          if (vSmooth[k] > maxV) maxV = vSmooth[k];
        }
        mouthCurrent = maxV;
      } else {
        // Decay all viseme channels so the mouth closes smoothly when audio ends.
        for (let vi = 0; vi < ALL_VISEME_KEYS.length; vi++) {
          vSmooth[ALL_VISEME_KEYS[vi]] = lerp(vSmooth[ALL_VISEME_KEYS[vi]], 0, V_LERP);
        }

        // RMS fallback path — amplitude drives 'aa' only.
        let mouthTarget = 0;
        if (lipSyncActive && lipSyncAnalyser && lipSyncBuf) {
          lipSyncAnalyser.getByteTimeDomainData(lipSyncBuf);
          let sumSq = 0;
          for (let i = 0; i < lipSyncBuf.length; i++) {
            const x = (lipSyncBuf[i] / 128.0) - 1.0;
            sumSq += x * x;
          }
          const rms = Math.sqrt(sumSq / lipSyncBuf.length);
          mouthTarget = Math.min(1.0, rms * 15.0);
        } else if (speaking) {
          mouthTarget = 0.2 + Math.abs(Math.sin(elapsed * 7)) * 0.45;
        }
        mouthCurrent = lerp(mouthCurrent, mouthTarget, lipSyncActive ? 0.5 : 0.2);
        // 'aa' blends RMS-driven value with any decaying viseme weight for a smooth hand-off.
        setExpression('aa', Math.max(mouthCurrent, vSmooth.aa));
        for (let vi = 1; vi < ALL_VISEME_KEYS.length; vi++) {
          setExpression(ALL_VISEME_KEYS[vi], vSmooth[ALL_VISEME_KEYS[vi]]);
        }
      }

      // ─── FACIAL EXPRESSIONS ───────────────────────────────────────────────
      // Eyebrows: each state has a distinct shape; setExpression silently no-ops
      // if the morph target doesn't exist in this particular model export.
      const browInner = listenBlend  * ANIM.LISTEN_BROW_INNER
                      + empathyBlend * ANIM.EMPATHY_BROW_INNER;
      const browDown  = thinkBlend   * ANIM.THINK_BROW_DOWN;
      setExpression('browInnerUp', browInner);
      setExpression('browDown',    browDown);

      // Attentive wide-eye on listening
      setExpression('surprised', listenBlend * ANIM.LISTEN_SURPRISE);

      // Warm smile: baseline never fully disappears; occasional idle moments peak higher.
      const smileTarget = lerp(ANIM.ACTIVE_SMILE_MIN, ANIM.IDLE_SMILE, 1 - activeBlend * 0.75);
      setExpression('happy',   Math.max(smileTarget, idleSmileOutput));
      setExpression('relaxed', lerp(0.04, ANIM.IDLE_RELAX, 1 - speakBlend));

      // ─── BLINK STATE MACHINE ──────────────────────────────────────────────
      // Natural eyelid kinematics: fast close (~75 ms), brief hold, slow open (~180 ms).
      // 18% of blinks are doubles — a brief re-closure shortly after the first.
      blinkTimer += dt;
      switch (blinkPhase) {
        case 'idle':
          if (blinkTimer >= blinkNext) {
            blinkPhase    = 'closing';
            blinkTimer    = 0;
            blinkIsDouble = Math.random() < ANIM.BLINK_DOUBLE_PROB;
          }
          break;
        case 'closing':
          blinkValue = blinkCurveClose(blinkTimer);
          if (blinkTimer >= ANIM.BLINK_CLOSE_DUR) { blinkPhase = 'hold'; blinkTimer = 0; }
          break;
        case 'hold':
          blinkValue = 1;
          if (blinkTimer >= ANIM.BLINK_HOLD_DUR) { blinkPhase = 'opening'; blinkTimer = 0; }
          break;
        case 'opening':
          blinkValue = blinkCurveOpen(blinkTimer);
          if (blinkTimer >= ANIM.BLINK_OPEN_DUR) {
            blinkValue = 0;
            if (blinkIsDouble) {
              blinkPhase = 'between';
              blinkTimer = 0;
            } else {
              blinkPhase = 'idle';
              blinkNext  = ANIM.BLINK_MIN + Math.random() * (ANIM.BLINK_MAX - ANIM.BLINK_MIN);
              blinkTimer = 0;
            }
          }
          break;
        case 'between':
          blinkValue = 0;
          if (blinkTimer >= ANIM.BLINK_DOUBLE_GAP) { blinkPhase = 'closing2'; blinkTimer = 0; }
          break;
        case 'closing2':
          blinkValue = blinkCurveClose(blinkTimer);
          if (blinkTimer >= ANIM.BLINK_CLOSE_DUR) { blinkPhase = 'hold2'; blinkTimer = 0; }
          break;
        case 'hold2':
          blinkValue = 1;
          if (blinkTimer >= ANIM.BLINK_HOLD_DUR) { blinkPhase = 'opening2'; blinkTimer = 0; }
          break;
        case 'opening2':
          blinkValue = blinkCurveOpen(blinkTimer);
          if (blinkTimer >= ANIM.BLINK_OPEN_DUR) {
            blinkValue = 0;
            blinkPhase = 'idle';
            blinkNext  = ANIM.BLINK_MIN + Math.random() * (ANIM.BLINK_MAX - ANIM.BLINK_MIN);
            blinkTimer = 0;
          }
          break;
      }
      setExpression('blinkLeft',  blinkValue);
      setExpression('blinkRight', blinkValue);

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

  if (model) {
    frameCamera(model);
  }
});

loadModel();

// ─── LIP SYNC STATE ──────────────────────────────────────────────────────────
// Shared by both the RMS fallback path and the viseme-timeline path.
let lipSyncCtx    = null;
let lipSyncSource = null;
let lipSyncActive = false;

// RMS fallback path (used when no ElevenLabs key / no alignment data).
let lipSyncAnalyser = null;
let lipSyncBuf      = null;

// Viseme timeline path (used when ElevenLabs returns character-level alignment).
// visemeMode = true  → LipSyncController.getVisemeWeights() drives the mouth.
// visemeMode = false → AnalyserNode RMS drives 'aa' only (legacy behaviour).
let visemeMode     = false;
let visemeTimeline = null;   // { frames: [{time, viseme, duration, weight}], totalDuration }
let audioStartTime = null;   // AudioContext.currentTime at the moment source.start(0) fires

// ─── LipSyncController ───────────────────────────────────────────────────────
// Runs inside the WebView every animation frame.
//
// How viseme timing works:
//   audioStartTime is captured at source.start(0).
//   now = lipSyncCtx.currentTime - audioStartTime gives playback position in seconds.
//   Binary search finds the most recently started frame (O(log n), ~6 ops for 50 frames).
//   During the last 20% of each frame's duration the controller cross-fades
//   the current viseme out and the next viseme in — this produces natural-looking
//   mouth transitions without an additional lerp layer on top.
//
// Why no lerp on top of getVisemeWeights():
//   AudioContext.currentTime advances continuously at 60 fps. The blendT value
//   inside getVisemeWeights already moves linearly 0→1 over 20% of the frame
//   duration. Adding setExpression(lerp(prev, target, 0.5)) would add a second
//   smoothing layer, causing the viseme to "lag" past the audio cue it maps to.
const LipSyncController = {
  getVisemeWeights: function() {
    const result = { aa:0, ih:0, ou:0, ee:0, oh:0, v_pp:0, v_ff:0, v_th:0, v_dd:0, v_kk:0, v_ch:0, v_ss:0, v_nn:0, v_rr:0 };
    if (!visemeMode || !visemeTimeline || audioStartTime === null || !lipSyncCtx) {
      return result;
    }

    const now    = lipSyncCtx.currentTime - audioStartTime;
    const frames = visemeTimeline.frames;
    if (!frames || !frames.length) return result;

    // Binary search: largest frames[i].time ≤ now
    let lo = 0, hi = frames.length - 1, activeIdx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].time <= now) { activeIdx = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (activeIdx < 0) return result;

    const active   = frames[activeIdx];
    const progress = Math.min((now - active.time) / Math.max(active.duration, 0.001), 1.0);

    // Cross-fade: last 20% of the current frame overlaps into the next frame.
    const FADE_START = 0.80;
    let currentWeight = active.weight;
    let nextViseme    = null;
    let nextWeight    = 0;

    if (progress > FADE_START && activeIdx + 1 < frames.length) {
      const blendT = (progress - FADE_START) / (1.0 - FADE_START); // 0 → 1
      const next   = frames[activeIdx + 1];
      currentWeight = active.weight * (1.0 - blendT);
      nextViseme    = next.viseme;
      nextWeight    = next.weight * blendT;
    }

    if (active.viseme !== 'neutral' && result[active.viseme] !== undefined) {
      result[active.viseme] = Math.max(result[active.viseme], currentWeight);
    }
    if (nextViseme && nextViseme !== 'neutral' && result[nextViseme] !== undefined) {
      result[nextViseme] = Math.max(result[nextViseme], nextWeight);
    }

    return result;
  },
};

// ─── Helper: decode a data URI and play it through AudioContext ───────────────
async function _decodeAndPlay(dataUri) {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const bin    = atob(base64);
  const ab     = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) ab[i] = bin.charCodeAt(i);

  if (!lipSyncCtx) {
    lipSyncCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Auto-resume if iOS suspends the context mid-playback (e.g. audio session change)
    lipSyncCtx.addEventListener('statechange', function() {
      if (lipSyncCtx && lipSyncCtx.state === 'suspended') {
        lipSyncCtx.resume().catch(function() {});
      }
    });
  }
  if (lipSyncCtx.state === 'suspended') await lipSyncCtx.resume();

  return lipSyncCtx.decodeAudioData(ab.buffer);
}

function _stopCurrent() {
  if (lipSyncSource) {
    lipSyncSource.onended = null; // prevent stale audioEnd from resolving next segment early
    try { lipSyncSource.stop(); } catch(e) {}
    lipSyncSource = null;
  }
  lipSyncActive   = false;
  lipSyncAnalyser = null;
  lipSyncBuf      = null;
  visemeMode      = false;
  visemeTimeline  = null;
  audioStartTime  = null;
}

function _onAudioEnded(errorMsg) {
  _stopCurrent();
  if (window.ReactNativeWebView) {
    const msg = errorMsg
      ? { type: 'audioEnd', error: errorMsg }
      : { type: 'audioEnd' };
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
}

// ─── RMS FALLBACK PATH ───────────────────────────────────────────────────────
// Used when ElevenLabs is not configured or its call fails.
// Driven by Web Audio AnalyserNode amplitude → 'aa' blend shape only.
window.playAudioWithLipSync = async function(dataUri) {
  _stopCurrent();
  visemeMode = false;
  try {
    const decoded   = await _decodeAndPlay(dataUri);
    lipSyncAnalyser = lipSyncCtx.createAnalyser();
    lipSyncAnalyser.fftSize = 256;
    lipSyncBuf = new Uint8Array(lipSyncAnalyser.frequencyBinCount);

    lipSyncSource = lipSyncCtx.createBufferSource();
    lipSyncSource.buffer = decoded;
    lipSyncSource.connect(lipSyncAnalyser);
    lipSyncAnalyser.connect(lipSyncCtx.destination);
    lipSyncActive = true;

    lipSyncSource.onended = () => _onAudioEnded(null);
    if (lipSyncCtx.state === 'suspended') await lipSyncCtx.resume();
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'audioStart' }));
    }
    lipSyncSource.start(0);
  } catch(err) {
    _onAudioEnded(String(err));
  }
};

// ─── VISEME TIMELINE PATH ────────────────────────────────────────────────────
// Used when ElevenLabs returns character-level alignment data.
// LipSyncController.getVisemeWeights() reads audioCtx.currentTime each frame
// to determine which viseme frame is active and applies a 20% crossfade into
// the next frame for smooth transitions between mouth shapes.
//
// To swap the TTS provider: implement ttsWithAlignment() in a new service class
// and update ttsService.js. The visemeTimeline shape must match VisemeTimeline:
//   { frames: [{time, viseme, duration, weight}], totalDuration }
window.playAudioWithVisemeTimeline = async function(dataUri, timeline) {
  _stopCurrent();
  visemeMode     = true;
  visemeTimeline = timeline;
  try {
    const decoded = await _decodeAndPlay(dataUri);
    lipSyncSource = lipSyncCtx.createBufferSource();
    lipSyncSource.buffer = decoded;
    lipSyncSource.connect(lipSyncCtx.destination); // no analyser needed
    lipSyncActive = true;

    lipSyncSource.onended = () => _onAudioEnded(null);
    if (lipSyncCtx.state === 'suspended') await lipSyncCtx.resume();
    audioStartTime = lipSyncCtx.currentTime; // anchor after resume so timing is accurate
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'audioStart' }));
    }
    lipSyncSource.start(0);
  } catch(err) {
    _onAudioEnded(String(err));
  }
};

// ─── STOP ────────────────────────────────────────────────────────────────────
window.stopAudioLipSync = function() {
  _stopCurrent();
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
  isListening   = false,
  isSpeaking    = false,
  isThinking    = false,
  isEmpathetic  = false,
  isWaiting     = false,
  style,
}, ref) => {
  const webRef = useRef(null);
  const stateRef = useRef('idle');
  const audioEndResolveRef = useRef(null);
  const audioStartCbRef = useRef(null);

  const [webKey, setWebKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useImperativeHandle(ref, () => ({
    /**
     * Play an audio segment and animate the avatar's mouth.
     *
     * @param {string|{audio:string, visemeTimeline:object|null}} payload
     *   - Plain string: data URI → uses RMS-based fallback (legacy / OpenAI TTS).
     *   - Object { audio, visemeTimeline }:
     *       audio          — data:audio/mpeg;base64,... URI
     *       visemeTimeline — { frames, totalDuration } from ElevenLabs alignment,
     *                        or null to fall back to RMS mode automatically.
     *
     * Returns a Promise that resolves when the audio segment finishes playing.
     *
     * How the audio queue works (in useAvatarConversation):
     *   Segments are generated concurrently (each sentence fires TTS immediately),
     *   but playAudio() is awaited in order so the avatar speaks sentence-by-sentence
     *   while later segments continue generating in the background.
     */
    playAudio: (payload) => new Promise(resolve => {
      audioEndResolveRef.current = resolve;

      if (typeof payload === 'string') {
        // Legacy / fallback: plain data URI → RMS lip sync
        webRef.current?.injectJavaScript(
          `window.playAudioWithLipSync(${JSON.stringify(payload)});true;`
        );
      } else {
        // ElevenLabs path: pass audio + viseme timeline into the WebView
        const { audio, visemeTimeline } = payload;
        if (visemeTimeline) {
          webRef.current?.injectJavaScript(
            `window.playAudioWithVisemeTimeline(${JSON.stringify(audio)}, ${JSON.stringify(visemeTimeline)});true;`
          );
        } else {
          // Object payload but no timeline — use RMS fallback with the audio URI
          webRef.current?.injectJavaScript(
            `window.playAudioWithLipSync(${JSON.stringify(audio)});true;`
          );
        }
      }
    }),
    stopAudio: () => {
      audioEndResolveRef.current = null;
      audioStartCbRef.current = null;
      webRef.current?.injectJavaScript(`window.stopAudioLipSync();true;`);
    },
    setOnAudioStart: (cb) => { audioStartCbRef.current = cb; },
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
    const next = isSpeaking   ? 'speaking'
               : isThinking   ? 'thinking'
               : isEmpathetic ? 'empathy'
               : isListening  ? 'listening'
               : isWaiting    ? 'waiting'
               : 'idle';

    if (next === stateRef.current) return;

    stateRef.current = next;

    webRef.current?.injectJavaScript(`
      if (window.setAvatarState) {
        window.setAvatarState('${next}');
      }
      true;
    `);
  }, [isListening, isSpeaking, isThinking, isEmpathetic, isWaiting]);

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

        if (data.type === 'audioStart') {
          const cb = audioStartCbRef.current;
          audioStartCbRef.current = null;
          cb?.();
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
        backgroundColor="#0D0D1A"
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
    backgroundColor: '#0D0D1A',
  },
  webviewContainer: {
    backgroundColor: '#0D0D1A',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0D0D1A',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});