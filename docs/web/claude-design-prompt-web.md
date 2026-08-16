# Prompt for Claude Design — copy everything below the line
# Attach when submitting (optional but recommended): app screenshots of Home / Chat / Voice / Library / Settings from the iOS or Android build, plus the pipeline/retrieval Mermaid diagrams at the top of README.md as reference.
# Goal: the WEB build of DementiaGuide AI — same product, same brand, adapted to desktop/tablet/mobile-web layouts.

---

Build a production-quality, fully responsive **web application front-end for DementiaGuide AI** — the web counterpart of our existing iOS and Android app. React (or clean componentised HTML/CSS/JS if React isn't available), self-contained, no external CDNs or fonts. Every page below must be built, wired together with working client-side routing, and populated with the real content and mock data provided. Where a live backend call would happen, implement a **mock mode** (clearly marked service layer with `// INTEGRATION:` comments) so the whole app is clickable end-to-end without keys.

CONTEXT — WHAT THE PRODUCT IS:
DementiaGuide AI is an avatar-based digital resource platform for dementia care, used by family caregivers, care workers, and health professionals (many older, many stressed, many non-technical). It combines:
- **Aria**, a 3D AI assistant (VRM avatar, real-time lip-sync) who answers questions by text or voice;
- a **RAG chat** grounded in a curated knowledge base, with inline citations that link to the source articles;
- a **Library** of curated resources in 7 dementia-care categories;
- a guided **onboarding** that tailors tone, detail level, jargon handling, text size, and voice speed;
- deep **accessibility settings** (text scale, high contrast, dark mode, subtitles, concise answers, hands-free voice).
The mobile app already exists — the web build must feel like the same product, not a new design. New Zealand English spelling throughout ("behaviour", "organise", "carer").

AUDIENCE RULE (most important):
This is a dementia-care product for stressed, often older users. Plain language everywhere. Generous type sizes (base 17–18px). Large hit targets (min 44×44px). Calm pacing — no aggressive animation, honour `prefers-reduced-motion`. One primary action per screen. Never make the user feel tested or rushed. WCAG 2.1 AA minimum on every page in BOTH themes.

DESIGN DIRECTION & TOKENS (match the existing app exactly):
- Mood: calm, warm, trustworthy — "modern health research group", not clinical, not startup-flashy.
- Light theme: background `#F7F5F2` (warm off-white), surface `#FFFFFF`, elevated `#FAFAFA`. Primary teal `#4A7C8E`, light `#6A9BAD`, dark `#2D5F70`, muted tint `#EBF3F6`.
- Dark theme: background `#111820`, surface `#1C2532`, elevated `#222E3D`, primary `#5C9CB0`, muted `#0F2535`. Dark mode is a real setting (toggle in Settings + respect `prefers-color-scheme`), not an afterthought — build every page in both.
- Category accents (used ONLY on category cards/chips and article headers): Caregiving `#E8956D`, Clinical `#4A7C8E`, Best Practices `#F0C070`, Communication `#9B8DC4`, Home Safety `#D4756B`, Carer Wellbeing `#7FB5A0`, Prevention `#5B9BD5` — each with its pale muted companion for backgrounds.
- Typography: clean humanist sans (system stack). Clear hierarchy; all font sizes must multiply by a global `textScale` variable (0.85 / 1.0 / 1.25) controlled from Settings — build this in from the start, don't bolt it on.
- Cards: soft 16–20px radii, subtle shadows, 1px hairline borders. High-contrast mode thickens borders and deepens text colours.

GLOBAL LAYOUT & NAVIGATION (the web adaptation of our mobile tab bar):
- **Desktop (≥1024px):** persistent left sidebar (~260px): logo/wordmark "DementiaGuide AI" top; nav items Home, Chat, Voice, Library, Settings with icons + labels; a prominent teal **"Talk to Aria"** microphone button styled as the hero action (this is the web version of our raised centre mic tab); footer of sidebar shows theme toggle + tiny "v1.0 · Made in Aotearoa NZ" line. Main content area max-width ~1200px, centred.
- **Tablet (768–1023px):** collapsed icon-only sidebar (72px) with tooltips.
- **Mobile web (<768px):** bottom tab bar identical to the native app — Home, Chat, raised centre mic button (56px teal circle, floats above the bar), Library, Settings. Active tab shows a small dot under the icon.
- Client-side routes: `/` (landing), `/onboarding/*`, `/app/home`, `/app/chat`, `/app/voice`, `/app/library`, `/app/library/:articleId`, `/app/settings`, `/privacy`, `/disclaimer`, plus a friendly 404.
- First visit (no saved settings in localStorage) → redirect into onboarding. Completed onboarding → `/app/home`.

════════════════════════════════════════
THE PAGES — build every one of these:
════════════════════════════════════════

**PAGE 0 — LANDING `/` (public marketing page, the only page that "sells"):**
- Hero: split layout — left: headline "Dementia care answers you can actually talk to.", subline "Aria is a caring AI guide who answers your questions with trusted, cited information — by text or voice.", two CTAs: primary "Open the app" → onboarding/app, secondary "Browse the library". Right: large framed avatar placeholder card (soft teal gradient, silhouette of Aria with a subtle idle-breathing CSS animation; label it clearly as the avatar stage).
- Trust strip: three chips — "Grounded answers with sources" · "Private — conversations stay on your device" · "Designed with accessibility first".
- Feature trio cards: Chat (cited answers), Voice (hands-free conversation), Library (7 curated categories) — each with a mini illustrative mock (a fake message bubble with a citation chip, a waveform, a category grid thumbnail).
- "How it works" 3-step row: Ask → Aria checks the trusted library → You get a plain-language answer with sources.
- Prominent medical disclaimer band before the footer: "DementiaGuide AI provides general information, not medical advice. Always consult a health professional for decisions about care." Footer: Privacy Policy, Medical Disclaimer, University of Auckland Part IV project credit.

**PAGES 1–12 — ONBOARDING `/onboarding/*` (guided, one question per screen):**
Shared shell: centred card (max 560px), progress dots across the top, big title, optional subtitle, large option cards (radio-style, whole card clickable, teal border + tick when selected), Back link top-left, primary Continue button pinned bottom. Every choice writes to the settings store. "Skip for now" available from step 2 onward (applies sensible defaults). Steps, in this exact order:
1. **Welcome** — warm greeting, Aria avatar placeholder, "Set up in about 2 minutes" note, primary "Let's begin", secondary "Skip setup".
2. **Setup type** — "Who is setting up this app today?" subtitle "This helps Aria speak to you in the right way." Options: I'm caring for someone / I work in care professionally / I'm setting it up for someone else / I'm exploring for myself.
3. **Support level** — "How comfortable are you with using apps like this?" Options: Very comfortable / Somewhat / I'd like extra guidance (this last one turns on more explanatory microcopy app-wide).
4. **Aria's style** — "What kind of helper feels right for you?" subtitle "You can always change this later." Options: Warm & encouraging / Calm & steady / Straightforward & practical.
5. **Response style** — "When you ask a question, how much detail would you like?" Options: Short and simple / Balanced / Thorough with explanations.
6. **Jargon** — "When medical words come up, what would you prefer?" Options: Plain language only / Medical terms with a short explanation / Medical terms are fine.
7. **Communication** — "How would you like to talk with Aria?" Options: Speak my questions ("Hold a button and ask your question out loud") / Type my questions ("Use the keyboard to write your questions") / Both.
8. **Voice speed** — "How fast would you like Aria to speak?" subtitle "You can change this in Settings at any time." Slider or 3 options (Slower / Normal / Faster) with a "Preview voice" play button (mock: pulse animation + subtitle line).
9. **Text size** — "How would you like the text to appear?" Live preview paragraph that re-renders at Small / Medium / Large as the user picks (A / A / A selector). This immediately applies `textScale`.
10. **Display preferences** — "A few display choices" subtitle "These can all be changed later in Settings." Toggle list: Dark mode, High contrast, Subtitles during voice replies, Show Aria's avatar.
11. **Safety** — "One important thing to know" — full-card gentle disclaimer: Aria gives general information, not medical advice; in an emergency call 111 (NZ); for health concerns contact your GP or Healthline 0800 611 116. Single button "I understand".
12. **Summary** — "Here's how you've set things up" subtitle "Tap Change to adjust anything." Read-back list of every choice with a Change link per row (deep-links to that step), then a celebratory but calm "Meet Aria →" primary button into `/app/home`.

**PAGE 13 — HOME `/app/home`:**
- Greeting header: time-aware "Good morning/afternoon/evening" + user-facing line "Ask a question, explore resources, or start a conversation about dementia care."
- **Avatar hero card**: large rounded card, soft teal gradient. Aria avatar stage (see AVATAR component below) with idle animation; status line under her ("Ready when you are"). On desktop this card sits left with the ask-box right; on mobile it stacks.
- **Ask box**: prominent input "Type your question…" with send button; a microphone button beside it that jumps to `/app/voice`. Submitting navigates to Chat with the message pre-sent.
- **Quick questions** — horizontally scrollable chip row (wraps to 2 rows on desktop) with exactly these: "How do I manage sundowning?" · "What are early signs of dementia?" · "How can I help with wandering?" · "What medications are commonly used?" · "How do I handle aggressive behavior?" · "What respite care options are available?". Clicking a chip opens Chat with that question sent.
- **Navigation grid**: cards for Chat ("Ask questions"), Voice ("Talk with Aria"), Library ("Browse 49 curated articles"), Settings ("Make it yours").
- **Featured resources** rail: 4 cards (title, category chip in its accent colour, read time): Understanding the Stages of Dementia (Clinical, 8 min) · Creating a Safe Home Environment (Caregiving, 6 min) · Communicating with Memory Loss (Communication, 5 min) · Carer Wellbeing and Burnout Prevention (Best Practices, 10 min). Each links to its article page.

**PAGE 14 — CHAT `/app/chat`:**
- Layout: message thread centred (max ~760px) with a slim collapsible **Aria side panel** on desktop (avatar bust + "Aria is listening" state text) — hidden on mobile.
- Message bubbles: user right (teal, white text), Aria left (surface card). Timestamps on hover/tap. Day dividers.
- **Typing indicator** (three soft bouncing dots in an Aria bubble) while waiting; then the reply **streams in token-by-token** (simulate streaming in mock mode).
- **Inline citations**: superscript markers `[1] [2]` inside Aria's replies; below each cited reply a "Sources" row of citation chips (favicon-style dot in category colour + article title). Clicking a chip opens a **source preview drawer** (right-side sheet on desktop, bottom sheet on mobile) showing the article excerpt with a "Read full article →" link into the Library.
- Composer: sticky bottom bar — text input, send button, mic shortcut, and a small "New conversation" action. An unobtrusive persistent one-line disclaimer above the composer: "General information only — not medical advice."
- States to build: empty state (Aria welcome message + 3 suggested questions), streaming state, error state ("I couldn't reach the knowledge base — try again" with Retry), and a **safety response style**: when a question involves urgent risk, Aria's reply renders with a soft amber left-border callout containing NZ emergency guidance (111 / Healthline 0800 611 116). Seed the mock thread with one normal cited exchange AND one safety-flavoured exchange so both render.
- If "Get to the point" (concise mode) is on, mock replies are visibly shorter.

**PAGE 15 — VOICE `/app/voice` (full-screen, immersive — the signature screen):**
- Takes over the whole viewport (nav hidden; small ✕ close top-left returning to previous page). Dimmed calm gradient background.
- Centre: **large Aria avatar stage** (see AVATAR component) — idle when quiet, "listening" glow ring while recording, mouth/subtitle activity while speaking.
- Below avatar: state label cycling through the real interaction loop: "Tap to talk" → "Listening…" (live partial transcript appears as faded text that solidifies) → "Thinking…" (soft pulsing dots) → Aria speaks (animated **subtitle line** shows her sentence-by-sentence captions, honouring the Subtitles setting).
- Primary control: one huge (88px+) circular mic button bottom-centre — tap to start, tap to stop. If **Hands-free Conversation** is on, show "Aria will notice when you finish speaking" and auto-transition from Listening → Thinking after silence (simulate with a timer); the button becomes "End conversation".
- Secondary controls: repeat-last-answer, open transcript (slide-up panel with the running conversation, shares history with Chat), mute Aria.
- Simulate the full loop in mock mode with realistic timings (fast mode setting shortens the Thinking phase). INTEGRATION comments: STT = Web Speech API or Whisper; TTS = ElevenLabs streaming; visemes drive the avatar mouth.

**PAGE 16 — LIBRARY `/app/library`:**
- Header: "Library" + subtitle "Trusted, curated dementia-care guidance — the same knowledge Aria uses."
- **Search bar** (prominent): live filter across titles/tags; show result count; friendly empty-results state ("No matches — try asking Aria in Chat instead" with a button).
- **Category grid** — 7 cards (2-col mobile, 3–4-col desktop), each with its icon, accent-tinted background, title, description, article count (7 each): Caregiving Advice "Practical daily care tips and strategies" · Clinical Guidelines "Evidence-based medical recommendations" · Best Practices "Research-backed behavioural care approaches" · Communication "Connecting with loved ones with dementia" · Home Safety "Making the home safe for someone with dementia" · Carer Wellbeing "Supporting the health and resilience of family carers" · Prevention & Early Detection "Risk factors, warning signs, and brain health strategies".
- Clicking a category filters an **article list** below (or navigates to a filtered view): rows with title, 1-line summary, read time, category chip. Include realistic mock articles matching our real titles, e.g. Managing Sundowning Behaviour · Responding to Repetitive Questions and Actions · Personal Hygiene and Bathing Assistance · Stages of Dementia: Mild, Moderate and Severe · Medications Used in Dementia · When to Seek Urgent Medical Review · Handling Physical Aggression and Agitation · Wandering Prevention and Safe-Return Strategies · Reducing Anxiety Through Environment Design (write ~2 more per category so every category has content).

**PAGE 17 — ARTICLE DETAIL `/app/library/:articleId`:**
- Breadcrumb "Library / {Category}". Category-accent header band with icon, title, read time, tags.
- Body: comfortable reading column (max ~680px, 1.7 line-height, textScale-aware), section headings, callout boxes for "Try this" practical tips and amber "When to seek help" safety boxes.
- Footer of article: "Ask Aria about this" button (opens Chat pre-filled with "Tell me more about {article title}"), Related articles (3 cards, same category), and a provenance line ("Reviewed content · Last updated {date}").
- Write ONE article in full (Managing Sundowning Behaviour — realistic, plain-language, NZ-appropriate) and template the rest with 2–3 paragraphs each.

**PAGE 18 — SETTINGS `/app/settings`:**
Grouped exactly like the app, card sections with icon + label + sublabel + control per row:
- **Accessibility**: Text Size (A/A/A segmented control, live effect) · High Contrast toggle "Increase colour contrast for readability" · Dark Mode toggle "Easier on the eyes in low light". (Omit Haptics on web.)
- **Avatar & Audio**: Show Avatar "Display Aria's visual avatar interface" · Audio Responses "Aria speaks responses aloud" · Subtitles "Show captions during voice responses" · Auto-play Responses · Get to the Point "Shorter answers — no filler words or jargon" · Hands-free Conversation "Aria notices when you finish speaking — no need to tap stop" · Faster Voice Responses "Aria starts speaking sooner — turn off if audio sounds choppy" · Voice speed selector.
- **Privacy & Trust**: Privacy Policy (→ `/privacy`) · Data Security "Conversations are stored only on this device" (info sheet) · Medical Disclaimer (→ `/disclaimer`) · Clear Conversation History (confirm dialog, gentle not scary).
- **Advanced** (collapsed by default): API key rows for OpenAI, ElevenLabs, Azure Speech — masked input, save/clear, "stored only in this browser" note.
- **About**: version, "University of Auckland Part IV Software Engineering project", link to re-run onboarding ("Redo the setup questions").
All toggles persist to localStorage and take effect immediately app-wide.

**PAGES 19–21 — SUPPORTING:**
- `/privacy` and `/disclaimer`: clean readable static pages in the same shell (write sensible plain-language NZ-appropriate content; disclaimer includes 111 and Healthline 0800 611 116).
- **404**: warm, on-brand — "We couldn't find that page" with Aria motif and buttons Home / Library.

════════════════════════════════════════
SHARED COMPONENTS (build once, reuse):
════════════════════════════════════════
- **AVATAR STAGE**: a self-contained component used on Landing, Home, Chat side panel, and Voice. For this build, implement a beautiful placeholder: soft radial-gradient stage, an elegant abstract avatar (SVG bust/silhouette is fine — do NOT attempt a real 3D model), with CSS states: `idle` (slow breathing scale + occasional blink), `listening` (teal pulse ring), `thinking` (soft shimmer), `speaking` (subtle mouth-bar equaliser + synced subtitle line). Expose the state as a prop and mark `// INTEGRATION: replace with Three.js + @pixiv/three-vrm canvas; speaking state driven by ElevenLabs viseme timeline`.
- Citation chip + source preview drawer · message bubble pair · typing indicator · category card · article row · settings row (toggle / nav / segmented) · onboarding option card · progress dots · primary/secondary buttons · toast (for "History cleared", "Settings saved").

DATA & INTEGRATION LAYER:
One `services/` module with mock implementations and `// INTEGRATION:` notes describing the real stack so a developer can wire it later: chat → OpenAI `gpt-4o` with our RAG pipeline (Supabase pgvector `match_chunks` RPC, `text-embedding-3-small`, prompt returns inline `[n]` citations mapped to knowledge-base chunk ids); STT → Whisper or Web Speech API; TTS → ElevenLabs `eleven_turbo_v2_5` with character-level alignment for visemes (OpenAI `tts-1` fallback). All conversation history and settings in localStorage only — no accounts, no server-side storage.

ACCEPTANCE CHECKLIST (verify before finishing):
1. Every route above exists and is reachable by clicking, on mobile-web AND desktop widths.
2. Onboarding choices visibly change the app (text size, dark mode, contrast, subtitles, concise replies).
3. Both themes pass AA contrast on every page; text scale works everywhere without breaking layout.
4. Chat shows: streaming reply, citations with working source drawer, safety callout variant, empty + error states.
5. Voice screen demonstrates the full loop (tap → listening with partial transcript → thinking → speaking with subtitles) in mock mode, including hands-free variant.
6. Library search filters live; every category opens with content; article page reads beautifully at Large text size.
7. Keyboard navigation and visible focus rings throughout; `prefers-reduced-motion` disables the ambient animations.
8. No external network requests; everything self-contained.
