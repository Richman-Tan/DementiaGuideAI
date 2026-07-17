# DementiaGuide AI

A modern iOS mobile application that acts as a digital library for dementia care information. Users can ask questions through text or voice and receive responses through a real-time 3D avatar with lip-sync driven by ElevenLabs character-level alignment.

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

DementiaGuide AI is designed for caregivers, family members, and healthcare professionals. The app provides evidence-based dementia care guidance through a calm, accessible, and emotionally supportive interface. The AI avatar — **Aria** — is a VRM model rendered in real time with natural speech, multi-shape lip-sync driven by ElevenLabs character-level alignment, and expressive idle animations.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK 54) |
| Navigation | React Navigation 7 (Bottom Tabs + Native Stack) |
| AI / RAG | OpenAI `gpt-4o-mini` + `text-embedding-3-small` |
| Vector DB | Supabase (pgvector) — cloud-hosted knowledge base with `match_chunks` RPC |
| STT | OpenAI Whisper (`whisper-1`) via `expo-av` audio recording |
| TTS | ElevenLabs `eleven_turbo_v2_5` (primary) · OpenAI `tts-1` (fallback) |
| Lip Sync | ElevenLabs character-level alignment → viseme timeline → 5 VRM blend shapes |
| Avatar | VRM 3D model via Three.js r180 + `@pixiv/three-vrm` in a WebView |
| Animations | React Native Animated API |
| Gradients | expo-linear-gradient |
| Audio | expo-av · Web Audio API (WebView) |
| Haptics | expo-haptics |
| Safe Area | react-native-safe-area-context |
| Storage | `@react-native-async-storage/async-storage` · `expo-secure-store` |

---

## Screens

| Screen | Description |
|---|---|
| **Home** | Avatar hero card, quick question chips, text/voice entry, navigation grid |
| **Chat** | iMessage-style conversation, typing indicator, clickable source links |
| **Library** | Searchable knowledge base across 6 dementia-care categories with article detail view |
| **Voice** | Full-screen voice UI — records via Whisper STT, streams LLM response, plays avatar speech sentence-by-sentence with lip sync |
| **Settings** | Accessibility controls — text size, contrast, audio, subtitles, haptics, privacy |

---

## Project Structure

```
DementiaGuideAI/
├── App.js
├── babel.config.js
├── app.json                          # Expo config
├── .env                              # API keys (git-ignored)
├── .env.example                      # Template for required env vars
├── scripts/
│   ├── ingest.mjs                    # Add content from URLs or PDFs → Supabase
│   ├── migrate-to-supabase.mjs       # One-time migration: knowledgeBase.js → Supabase
│   ├── supabase-setup.sql            # pgvector schema + match_chunks RPC (run once in Supabase)
│   └── test-responses.mjs            # CLI tool to test RAG output against sample questions
└── src/
    ├── navigation/
    │   └── AppNavigator.js           # Bottom tab + stack navigator
    ├── screens/
    │   ├── HomeScreen.js
    │   ├── ChatScreen.js             # GiftedChat UI, calls openaiService, shows sources
    │   ├── LibraryScreen.js
    │   ├── ArticleDetailScreen.js    # Full article view from Library
    │   ├── VoiceScreen.js            # Voice conversation UI (Whisper → LLM → TTS → avatar)
    │   └── ProfileScreen.js          # AI configuration (API keys, privacy controls)
    ├── components/
    │   ├── AvatarVRM.js              # VRM avatar in WebView (Three.js + viseme lip sync)
    │   ├── Avatar.js                 # Legacy animated avatar (idle/listening/speaking)
    │   ├── MessageCard.js            # Chat bubble with sources and actions
    │   ├── CategoryCard.js           # Library category row
    │   └── VoiceWaveform.js          # 9-bar animated waveform
    ├── hooks/
    │   └── useAvatarConversation.js  # Voice pipeline orchestration (STT → LLM stream → TTS queue → playback)
    ├── lib/
    │   ├── tts/
    │   │   ├── ttsService.js         # TTS provider selection (ElevenLabs primary, OpenAI fallback)
    │   │   └── elevenLabsService.js  # ElevenLabs API wrapper (audio + character alignment)
    │   └── lipsync/
    │       ├── createVisemeTimeline.js  # Converts ElevenLabs alignment → viseme frame sequence
    │       └── phonemeMap.js            # Character → VRM viseme mapping
    ├── constants/
    │   ├── colors.js
    │   ├── typography.js
    │   └── data.js                   # Categories, resources, sample messages
    ├── data/
    │   └── knowledgeBase.js          # Legacy local KB (superseded by Supabase)
    └── services/
        ├── supabaseService.js        # Supabase anon client for the mobile app
        ├── openaiService.js          # RAG pipeline (embed query → Supabase match_chunks → streaming chat)
        ├── knowledgeService.js       # Knowledge base queries for Library screen (Supabase)
          └── aceService.js             # NVIDIA ACE stub (used by VoiceScreen mock)
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Expo CLI
- Xcode (for iOS Simulator) or Expo Go on a physical device
- An OpenAI API key
- A Supabase project (free tier) with pgvector enabled
- An ElevenLabs API key (optional — enables vowel-accurate lip sync; falls back to amplitude-based sync without it)

### Install

```bash
git clone <repo-url>
cd DementiaGuideAI
npm install
```

### Environment setup

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

```env
# Mobile app (Expo) — anon key is safe to use client-side
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key>

# Scripts — service role key (never expose to clients)
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
OPENAI_API_KEY=sk-...
```

### Supabase setup (first time only)

Run `scripts/supabase-setup.sql` in the Supabase SQL Editor to create the `knowledge_chunks` table, the pgvector index, and the `match_chunks` RPC function.

Then seed the knowledge base:

```bash
node scripts/migrate-to-supabase.mjs
```

### Run the mobile app

```bash
# iOS Simulator
npx expo start --ios

# Android
npx expo start --android

# Clear Metro cache if needed
npx expo start --ios --clear
```

### API Key Setup (mobile app)

Enter your API keys in the app under **Settings → AI Configuration**:
- **OpenAI key** — required for chat, STT (Whisper), and fallback TTS
- **ElevenLabs key** — optional; enables the full viseme lip sync pipeline

Both keys are stored securely via `expo-secure-store` and never leave the device.

---

## Voice Conversation Pipeline

The Voice screen runs a fully pipelined conversation flow managed by `useAvatarConversation.js`:

```
[Microphone] → expo-av recording
     ↓
[Whisper STT] → transcribed text
     ↓
[OpenAI gpt-4o-mini stream] → tokens arrive sentence by sentence
     ↓
[ElevenLabs TTS] ← fires immediately per sentence, in parallel
     ↓
[Viseme timeline] ← character alignment → mouth shape keyframes
     ↓
[AvatarVRM WebView] → plays audio + drives 5 blend shapes in real time
```

Each sentence is sent to TTS as soon as it completes in the LLM stream — so the avatar begins speaking the first sentence while later sentences are still being generated.

---

## Avatar (AvatarVRM)

The avatar is a `.vrm` model rendered inside a React Native `WebView` using Three.js and `@pixiv/three-vrm`. All animation runs in the embedded browser context and communicates back to React Native via `postMessage`.

**State machine:** `idle → listening → thinking → speaking`

Each state drives:
- Body bob and sway amplitude
- Head look-around frequency and range
- Thinking gaze bias (up-right)
- Breathing depth on spine/chest bones

**Lip sync — ElevenLabs viseme path (primary)**

ElevenLabs returns character-level timestamps alongside the audio. These are converted into a viseme frame sequence by `createVisemeTimeline.js`, mapping characters to one of five VRM blend shapes: `aa` (open), `ih` (smile-open), `ou` (round), `ee` (wide), `oh` (rounded-open). During playback, the WebView tracks `AudioContext.currentTime` each frame, binary-searches the viseme timeline, and cross-fades between the active and next frame over the final 20% of each frame's duration.

**Lip sync — RMS fallback path (OpenAI TTS or no ElevenLabs key)**

When no alignment data is available, a Web Audio `AnalyserNode` measures RMS amplitude per frame and maps it to the `aa` blend shape, producing open/close jaw movement that tracks the audio loudness.

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

// Play TTS audio with viseme lip sync (ElevenLabs path)
await avatarRef.current.playAudio({ audio: base64DataUri, visemeTimeline });

// Play TTS audio with RMS fallback
await avatarRef.current.playAudio(base64DataUri);

// Stop early
avatarRef.current.stopAudio();
```

---

## RAG Pipeline

The chat is powered by a cloud RAG pipeline using Supabase pgvector and OpenAI.

| Setting | Value |
|---|---|
| Embedding model | `text-embedding-3-small` (1536 dims) |
| Chat model | `gpt-4o-mini` |
| Vector DB | Supabase `knowledge_chunks` table (pgvector `vector(1536)`) |
| Retrieval | Hybrid Supabase `match_chunks` RPC (semantic + keyword scoring), top-8 chunks, min similarity 0.35 |
| Context window | Last 6 messages |
| Chunk size | ~500 words with ~50-word overlap |
| Auto-tagging | GPT-4o-mini assigns 5–8 specific tags per chunk at ingestion time |

**Flow:**

```
User query
  → embed via text-embedding-3-small
  → Supabase match_chunks RPC (server-side cosine similarity)
  → top-5 chunks injected as context
  → gpt-4o-mini streaming response with source attribution
```

### Adding content to the knowledge base

Use the CLI ingestion script:

```bash
# From a URL
node scripts/ingest.mjs \
  --source "https://www.alzheimers.org.uk/some-article" \
  --category clinical \
  --org "Alzheimer's Society UK"

# From a local PDF
node scripts/ingest.mjs \
  --source "./documents/care-guide.pdf" \
  --category caregiving \
  --org "Dementia Australia"

# Preview without uploading
node scripts/ingest.mjs --source <url> --category <slug> --org <name> --dry-run
```

Valid categories: `caregiving` · `clinical` · `communication` · `prevention` · `best-practices` · `home-safety` · `well-being`

`scripts/reingest-isupport.mjs` re-ingests the iSupport manuals from `src/documents/` (not tracked in git — place the NZ and WHO original PDFs there manually before running it).

### Testing RAG output

```bash
# Keyword/assertion suite (mustInclude checks + disclaimer/citation guards)
npm run test:answers

# Reference-answer suite (semantic similarity against 3-5 accepted answers per question)
npm run test:answers:reference

# Hybrid suite (semantic similarity + required safety keywords)
npm run test:answers:hybrid
```

The evaluator supports three modes in `scripts/test-responses.mjs`:

- `keywords` (default): phrase-level guards (`mustIncludeAny` / `mustIncludeAll`) plus disclaimer/helpline/citation checks.
- `reference`: compares the model response to multiple prewritten correct answers and passes when semantic similarity exceeds the threshold.
- `hybrid`: requires both semantic similarity and keyword safety guards.

### Comparing OpenAI vs Claude

`scripts/test-responses-compare.mjs` runs the same retrieved context and system prompt through both `gpt-4o-mini` (OpenAI) and Claude, then scores both against the same prewritten reference answers. Retrieval and evaluation are held constant so the comparison isolates generation quality between the two providers.

```bash
# Requires ANTHROPIC_API_KEY in .env (see .env.example) alongside the existing OpenAI/Supabase keys
npm run test:compare

# Run one case with full output from both models
node scripts/test-responses-compare.mjs --case sundowning --verbose

# Use a different Claude model (default: claude-opus-4-8)
node scripts/test-responses-compare.mjs --claude-model claude-sonnet-5

# Save the run to history for later reporting
npm run test:compare -- --log-history --label "opus-4-8 vs gpt-4o-mini"
```

Comparison runs are appended to the same `logs/test-history.ndjson` file with `mode: "compare"`, so `npm run test:history` and `scripts/test-history.mjs export` work unchanged — each question appears as two logged cases (`<id>-openai` and `<id>-claude`) with `provider`, `bestSimilarity`, and `latencyMs` fields for side-by-side comparison.

Useful commands:

```bash
# Run the full suite directly
node scripts/test-responses.mjs

# Run one case with full output
node scripts/test-responses.mjs --case sundowning --verbose

# Run one reference case with full output
node scripts/test-responses.mjs --mode reference --case ref-sundowning --verbose

# Run hybrid checks with a stricter semantic threshold
node scripts/test-responses.mjs --mode hybrid --reference-threshold 0.82

# Force the helpline number check for all cases
node scripts/test-responses.mjs --helpline-required
```

If you want to use npm and still pass flags through:

```bash
npm run test:answers -- --case sundowning --verbose
```

### Logging and viewing test history

You can persist test runs to an append-only NDJSON log (one JSON object per run):

```bash
# Save a reference run to the default history file
node scripts/test-responses.mjs --mode reference --log-history

# Save with a run label
node scripts/test-responses.mjs --mode reference --log-history --label "after reingest 2026-06-23"

# Save to a custom file
node scripts/test-responses.mjs --mode hybrid --log-history --history-file logs/hybrid-history.ndjson

# Include full AI responses in the history record
node scripts/test-responses.mjs --mode reference --log-history --log-responses
```

Default history file path:

```text
logs/test-history.ndjson
```

Quick ways to view history:

```bash
# Summary of recent runs
npm run test:history

# Full latest run JSON
npm run test:history:latest

# Full latest run in readable case-by-case format
npm run test:history:full

# Failed/error cases from latest run
npm run test:history:failures

# Show last 20 summary rows
node scripts/test-history.mjs summary --limit 20

# Use a custom history file
node scripts/test-history.mjs summary --file logs/hybrid-history.ndjson
```

Tip: commit the script and README changes, but usually keep `logs/` out of git via `.gitignore` if you want local-only test history.

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
