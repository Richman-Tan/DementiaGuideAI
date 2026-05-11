# DementiaGuide AI

A modern iOS mobile application that acts as a digital library for dementia care information. Users can ask questions through text or voice and receive responses through a real-time 3D avatar with lip-sync powered by the Web Audio API.

---

## Application Workflow

![DementiaGuide AI Workflow](./assets/workflow.png)

## RAG Pipeline Workflow

<img width="1536" height="1024" alt="RAGPipeline" src="https://github.com/user-attachments/assets/a19212ea-bd53-41d7-bb79-c5fcdc1e44c0" />

---

## Video Walkthrough

https://github.com/user-attachments/assets/ed2a9be7-1b46-41a0-905e-609f599734e5

---

## Overview

DementiaGuide AI is designed for caregivers, family members, and healthcare professionals. The app provides evidence-based dementia care guidance through a calm, accessible, and emotionally supportive interface. The AI avatar — **Aria** — is a VRM model rendered in real time with natural speech, lip-sync driven by the Web Audio API, and expressive idle animations.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK 54) |
| Navigation | React Navigation 7 (Bottom Tabs + Native Stack) |
| AI / RAG | OpenAI `gpt-4o-mini` + `text-embedding-3-small` |
| Avatar | VRM 3D model via Three.js r180 + `@pixiv/three-vrm` in a WebView |
| Lip Sync | Web Audio API — real-time RMS → mouth blend shape |
| TTS | `expo-speech` |
| Animations | React Native Animated API |
| Gradients | expo-linear-gradient |
| Audio | expo-av |
| Haptics | expo-haptics |
| Safe Area | react-native-safe-area-context |
| Storage | `@react-native-async-storage/async-storage`, `expo-secure-store` |

---

## Screens

| Screen | Description |
|---|---|
| **Home** | Avatar hero card, quick question chips, text/voice entry, navigation grid |
| **Chat** | iMessage-style conversation (GiftedChat), typing indicator, clickable source links |
| **Library** | Searchable knowledge base across 6 dementia-care categories with article detail view |
| **Voice** | Full-screen voice UI with real-time waveform, state machine, and transcript |
| **Settings** | Accessibility controls — text size, contrast, audio, subtitles, haptics, privacy |

---

## Project Structure

```
DementiaGuideAi/
├── App.js
├── babel.config.js
├── app.json                          # Expo config
└── src/
    ├── navigation/
    │   └── AppNavigator.js           # Bottom tab + stack navigator
    ├── screens/
    │   ├── HomeScreen.js
    │   ├── ChatScreen.js             # GiftedChat UI, calls openaiService, shows sources
    │   ├── LibraryScreen.js
    │   ├── ArticleDetailScreen.js    # Full article view from Library
    │   ├── VoiceScreen.js
    │   └── ProfileScreen.js          # AI configuration (API key, privacy controls)
    ├── components/
    │   ├── AvatarVRM.js              # VRM avatar in WebView (Three.js + lip sync)
    │   ├── Avatar.js                 # Legacy animated avatar (idle/listening/speaking)
    │   ├── MessageCard.js            # Chat bubble with sources and actions
    │   ├── CategoryCard.js           # Library category row
    │   └── VoiceWaveform.js          # 9-bar animated waveform
    ├── constants/
    │   ├── colors.js
    │   ├── typography.js
    │   └── data.js                   # Categories, resources, sample messages
    ├── data/
    │   └── knowledgeBase.js          # 42 dementia care knowledge chunks (7 per category)
    └── services/
        ├── openaiService.js          # Full RAG pipeline (embeddings, semantic search, chat)
        ├── aceService.js             # NVIDIA ACE stub (used by VoiceScreen mock)
        └── knowledgeService.js       # Knowledge base search (used by LibraryScreen)
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Expo CLI
- Xcode (for iOS Simulator) or Expo Go on a physical device
- An OpenAI API key

### Install

```bash
git clone <repo-url>
cd DementiaGuideAi
npm install
```

### Run

```bash
# iOS Simulator
npx expo start --ios

# Android
npx expo start --android

# Clear Metro cache if needed
npx expo start --ios --clear
```

### API Key Setup

Enter your OpenAI API key in the app under **Settings → AI Configuration**. The key is stored securely via `expo-secure-store` and never leaves the device.

---

## Avatar (AvatarVRM)

The avatar is a `.vrm` model rendered inside a React Native `WebView` using Three.js and `@pixiv/three-vrm`. All animation runs in the embedded browser context and communicates back to React Native via `postMessage`.

**State machine:** `idle → listening → thinking → speaking`

Each state drives:
- Body bob and sway amplitude
- Head look-around frequency and range
- Thinking gaze bias (up-right)
- Breathing depth on spine/chest bones

**Lip sync** uses the Web Audio API. When TTS audio plays, an `AnalyserNode` measures RMS energy per frame and maps it to the `aa` blend shape, producing mouth movement that tracks the actual audio waveform.

**Recovery:** If the WebGL context is lost (iOS background eviction, Android process kill), the WebView automatically remounts.

**Custom VRM model:** Pass a `modelUrl` prop to `AvatarVRM` to use any publicly hosted `.vrm` file.

```jsx
<AvatarVRM
  ref={avatarRef}
  modelUrl="https://example.com/your-model.vrm"
  isListening={listening}
  isSpeaking={speaking}
  isThinking={thinking}
  width={300}
  height={420}
/>

// Play TTS audio with lip sync
await avatarRef.current.playAudio(base64DataUri);

// Stop early
avatarRef.current.stopAudio();
```

---

## RAG Pipeline

The chat is powered by a fully client-side RAG pipeline in `src/services/openaiService.js`.

| Setting | Value |
|---|---|
| Embedding model | `text-embedding-3-small` (1536 dims) |
| Chat model | `gpt-4o-mini` |
| Context window | Last 6 messages |
| Retrieval | Top-5 chunks, min similarity 0.25 |
| Embedding cache | AsyncStorage key `kb_embeddings_v1` |
| Message history | AsyncStorage key `chat_messages_v1` (max 100) |

The knowledge base (`src/data/knowledgeBase.js`) contains 42 curated dementia care chunks across 6 categories: caregiving, clinical, behavioral best practices, home safety, wellbeing, and communication.

---

## Design System

| Token | Value | Use |
|---|---|---|
| Primary | `#4A7C8E` | Buttons, links, user bubbles |
| Secondary | `#7FB5A0` | Accents, success states |
| Accent | `#E8956D` | Warnings, speaking state |
| Background | `#F7F5F2` | App background |
| Surface | `#FFFFFF` | Cards, nav bar |
| Text Primary | `#1E2D3D` | Body and headings |

**Accessibility:**
- Minimum 44×44pt tap targets
- `accessibilityLabel` and `accessibilityRole` on all interactive elements
- Configurable text size (small / medium / large)
- High contrast mode toggle
- Subtitle and audio toggles for avatar responses
- Haptic feedback toggle

---

## Disclaimer

DementiaGuide AI provides information for general guidance only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider for dementia-related concerns.

---

## License

Private — all rights reserved.
