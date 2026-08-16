// React view of the Unity load-state machine (unityBridge.js). Multiple
// concurrent subscribers are the point: Home hero, the Voice stage and any
// mount can all watch the one global boot.
import { useEffect, useState } from 'react';
import { getUnityLoadState, onUnityLoadProgress } from './unityBridge.js';

export function useUnityLoadState() {
  const [state, setState] = useState(getUnityLoadState);
  useEffect(() => onUnityLoadProgress(setState), []);
  return state; // { phase: 'idle'|'downloading'|'preparing'|'ready'|'unavailable'|'failed', pct: 0..1 }
}
