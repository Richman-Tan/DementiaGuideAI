import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ensureUnityBoot } from './avatar/unity/unityBridge.js';
import './styles/tokens.css';
import './styles/app.css';

// Eager avatar boot: probe + start the (one-time) 234MB Unity download the
// moment the app opens, on the shared detached canvas — screens attach when
// ready. Deferred a tick so loader-script parse doesn't contend first paint;
// the probe also settles the effective-profile fallback.
setTimeout(ensureUnityBoot, 0);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
