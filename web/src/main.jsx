import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { probeUnity } from './avatar/unity/unityBridge.js';
import './styles/tokens.css';
import './styles/app.css';

// Resolve Unity-build availability once at boot so the effective-profile
// resolver (renderer/voice/copy fallback) settles before the first screens.
probeUnity();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
