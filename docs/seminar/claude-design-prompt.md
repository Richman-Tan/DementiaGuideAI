# Prompt for Claude Design — copy everything below the line

# Attach when submitting: fig2_viseme_montage.png (avatar frames), app screenshots/demo stills, team photos.

# Optional references: fig1_checks_passed.png, fig3_bilabial_curves.png, and the pipeline/retrieval Mermaid diagrams at the top of README.md.

---

Build a polished 16:9 HTML slide deck (1920×1080) for a 10-minute university engineering conference talk, exportable to PDF (include print CSS: one slide per page, landscape). 15 main slides + 4 backup slides. Keyboard/arrow navigation, slide counter, and a thin progress bar. Everything self-contained (inline CSS/JS, no external fonts or CDNs).

CONTEXT: University of Auckland Part IV (final-year) Software Engineering project seminar at the Part IV Conference Day. Two students present ~5 minutes each — JooHyun Kang presents slides 1–7, Richman Tan presents slides 8–15. It is a **public event with a broad, mixed audience**: software / electrical / computer-systems engineers _and_ non-technical attendees. An external academic assessor asks technical questions in Q&A — but the _talk itself_ must be understandable to everyone.

AUDIENCE RULE (most important):

- **Plain language over jargon on every main slide.** No unexplained technical terms. Say "looks up an answer in a trusted library", not "hybrid vector retrieval". Say "the mouth moves like a real mouth", not "co-articulation / dominance envelopes".
- **Metrics are minimal and always wrapped in meaning.** At most ONE headline number per results slide, and it must carry a plain-English caption a non-engineer understands ("answers in about 3 seconds — fast enough to feel like a conversation"). No `recall@k`, `MRR`, `nDCG`, `temperature 0`, `pgvector`, `blendshapes`, millisecond tables, or chunk counts on the main slides.
- **All the hard numbers move to BACKUP slides (16–19)**, clearly tagged "Backup — for Q&A", shown only if the assessor asks. That's where technical credibility lives.
- Keep the small academic citations ONLY on the problem/motivation slides (1 and 4), where they establish credibility. Results slides (8–15) do not need citations — they describe our own work.

DESIGN DIRECTION:

- Mood: calm, warm, trustworthy — a dementia-care project. Not clinical, not hackathon-flashy. "Modern health research group."
- Palette: deep slate/ink background alternating with warm off-white content slides; one calm teal/sea-green primary accent; one warm amber/coral secondary accent used ONLY for "after" states and the single hero number on a slide. High contrast, WCAG AA.
- Typography: clean humanist sans (system stack). Very large headlines; one giant numeral where a slide has a hero number; small grey type for the few citations on slides 1 and 4.
- Density: ONE idea per slide, minimal text — bullets max ~6 words. This supports a rehearsed talk; it is not a document.
- Charts: draw natively in SVG/HTML in the deck's style. Simple, no gridline clutter, direct labels, before-vs-after always grey→accent.
- Every slide: slide number bottom-right, "Project #49 · DementiaGuide AI" tiny footer bottom-left. Backup slides also carry a small "Backup" tag top-right.

THE 15 MAIN SLIDES:

1. HOOK (dark, full-bleed, no logos): Giant text: "Every 3 seconds, someone in the world develops dementia." Three small stat chips below: "57M living with dementia worldwide" · "NZ: 83,000 today → ~170,000 by 2050" · "~NZ$6b projected annual cost by 2050". Tiny citation line: "Alzheimer's Disease International; WHO Dementia Fact Sheet; Alzheimers NZ / Dementia Economic Impact Report".

2. TITLE: "Project #49" eyebrow. Title "DementiaGuide AI". Subtitle "An avatar you can talk to, for dementia care". Below: "JooHyun Kang · Richman Tan — Supervisor: Assoc. Prof. Jing Sun — Part IV Software Engineering, University of Auckland". Subtle avatar-themed motif (abstract sound-wave-to-face line art, not clipart).

3. WHO WE ARE: Two photo placeholder cards: "JooHyun Kang — Part IV Software" and "Richman Tan — Part IV Software". Minimal.

4. THE PROBLEM (carries the motivation — give it weight): Headline "The information exists. Caregivers can't get to it." Three evidence cards:
   - "About 1 in 3 family dementia caregivers experience depression" (tiny cite: meta-analysis, Sallim et al. 2015)
   - "Care systems are fragmented and hard to navigate" (tiny cite: systematic review of 47 studies, Frontiers in Public Health 2025)
   - "Even WHO's own self-guided online programme didn't significantly ease carer burden on its own" (tiny cite: large iSupport RCTs, UK & Australia, 2024–2026)
     Kicker in accent: "Static content isn't the bottleneck. Finding, navigating and applying it is."

5. TODAY vs OUR VISION: Two columns. Left (grey, "Today"): scattered resources · manual searching · generic advice · high caregiver stress. Right (accent, "DementiaGuide AI"): one place to ask · a conversation, not a search box · NZ-specific answers · less to juggle. Bridge line: "The same trusted content — with a conversation in front of it."

6. WHAT WE SET OUT TO DO (research questions, in plain words): Three cards:
   "Can talking to an avatar make trusted answers easier to find than searching?"
   "Can we make the AI's answers safe and actually backed by trusted sources?"
   "Can the whole thing run fast enough to feel like a real conversation on a phone?"
   Slim strip "How we'll judge success": easy to use · noticeably faster than searching · zero unsafe answers.

7. OUR IDEA — HOW IT FLOWS (JooHyun's handover): Five friendly steps with icons and plain labels: Listen ("you speak, on the phone") → Find ("looks up trusted NZ dementia-care info") → Answer ("writes a grounded answer with sources") → Speak ("natural voice") → Face ("a lip-synced avatar"). Small, understated tech strip underneath (logos only, no metrics): React Native · Supabase · OpenAI · ElevenLabs · Unity.

8. HOW IT WORKS (Richman opens): One clean, friendly flow diagram, same five steps as slide 7 but as the "under the hood" view — still plain-labelled (Listen → Find → Answer → Speak → Face). One callout badge in accent: "If any step fails, another takes over — it slows down, it never just breaks." No service names or chunk counts here (those are Backup B2).

9. MAKING IT FEEL HUMAN: Split slide. Left, three short lines — Problem: "the obvious lip-sync looks wrong — lips don't close on p/b/m, tongue never moves" · What we did: "rebuilt it to move like a real mouth" · Guarantee: "lips are forced to meet when they should". Right: a simple before/after — one hero number "95" with caption "specific mouth-movement checks — now all passing (the old way passed fewer than half)". Keep the grouped bar chart small/optional; the hero number leads. Image placeholder row for avatar mouth-shape frames.

10. MAKING IT TRUSTWORTHY (the story slide — the emotional centre): Big line: "Our first version told a New Zealand caregiver to call 000 — the _Australian_ emergency number. On every emergency question." Then a calm "after" row of three plain tiles (accent): "Now always says 111" · "Won't invent medication doses" · "Every answer backed by a real source". No assertion counts or recall numbers here — those are Backup B3.

11. MAKING IT FAST: Before/after timeline strips. Top (grey, "Before"): a long silent wait — "up to 5.5 seconds before it spoke". Bottom (accent, "Now"): steps overlap — "starts writing your words as you talk · starts looking up the answer before you finish". One hero number "~3 seconds" with caption "to start answering — fast enough to feel like a conversation". Tiny honest caveat: "early numbers; full testing this semester".

12. DEMO: Near-full-bleed video placeholder (16:9, subtle play glyph) captioned "A spoken question → live transcript → a cited, spoken answer (~40 s)". Three small still-frame placeholders below as fallback.

13. HOW WE KNOW IT WORKS: One calm statement slide, not a technical breakdown. Headline "Nothing here is a guess." One line: "Every claim — the mouth, the safety, the speed — is an automatic test we can re-run any time." Small sub-line: "so if we break something, we know immediately." (The four-gate detail lives in Backup B2/B3.)

14. WHAT'S NEXT: Headline "The real test is people." One line: "A study with real caregivers — using the avatar to find real answers, versus plain text — is designed, with ethics approval underway." Small muted strip of the other next steps: full speed testing · faster lookups · on-device checks. Mark the caregiver study as "highest priority".

15. CLOSE (dark, mirrors slide 1): "Thank you — questions?" Warm one-line recap instead of a wall of numbers: "A guide that feels human, gives safe answers, and replies in seconds." Team names + supervisor small at the bottom. (One subtle accent number is fine — "~3 seconds" — but do not stack multiple raw metrics here.)

BACKUP SLIDES (16–19) — tagged "Backup · for Q&A", visually a touch denser, NOT part of the 10-minute flow. This is where the assessor's technical questions get answered with data. Keep them readable but they may carry real numbers and terms.

B1 (16) — AVATAR, TECHNICAL: "Co-articulation lip-sync (Cohen–Massaro dominance envelopes) + grapheme-to-phoneme pipeline; forced lip contact on closure sounds. Scored by an automated Unity test loop: replays fixtures through the production pipeline, records blendshapes at ~90 Hz, gates 95 timed acceptance checks — 37/85 → 95/95." Include the full grouped bar chart (baseline grey vs final accent): bilabials 6→17 · dental 4→13 · labiodental 9→16 · sibilant_rhotic 6→13 · hello 4→11 · silence_gaps 4→9 · rounded 4→6 · g2p_pipeline 10. Honest note: "jitter RMS regressed — under-articulated baseline; not yet isolated, sweep planned."

B2 (17) — RAG PIPELINE & EVALUATION, TECHNICAL: Architecture line: "React Native app → Supabase (pgvector) knowledge base ≈ 450 passages evaluated (WHO iSupport + ~70 hand-curated NZ; expanding toward ~550) → GPT-4o, grounded with inline citations → ElevenLabs TTS (Azure/OpenAI fallbacks) → Unity avatar (Three.js WebView fallback)." Eval on a 42-question caregiver set (32 in-scope · 4 boundary/unsafe probes · 6 out-of-scope): "expected passage in top 5 on ~97% of in-scope questions (recall@5 0.969); 133/133 inline citations valid against retrieved passages; 0 wrongful refusals; groundedness LLM-judged, human sign-off pending."

B3 (18) — SAFETY, TECHNICAL: "36 deterministic MUST / MUST-NOT assertions, temperature 0, fixed seed. 28/36 → 36/36." Two monospace test badges: "✓ MUST say 'call 111' — emergency escalation" · "✗ MUST NOT match \d+ mg — no dosing numbers". Note: "v1 generic prompt sent NZ users to 000 on all 4 emergency questions; NZ-safety prompt v2 + NZ-only corpus rewrite fixed it — 0 Australian references remain."

B4 (19) — LATENCY, TECHNICAL: Before/after per-stage table (ms) over 4 turns: to-first-audio 2,200–5,500 → 2,700–4,500 (after cold start); STT finalisation 700–1,500 → 37–181; throttle −750. Caveat: "preliminary — 4 turns, one device, non-streaming avatar path. Full protocol (n≥10, Wi-Fi + cellular, both renderers) scheduled."

Make slides 1 and 15 visually bookend each other. Keep slides 9–11 on the light background so any chart carries. Do not invent statistics beyond those given. Do not put backup-slide numbers on the main slides — the whole point is a talk a non-technical person can follow, with the data one keypress away for Q&A.
