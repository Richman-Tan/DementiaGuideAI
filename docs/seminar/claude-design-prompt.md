# Prompt for Claude Design — copy everything below the line
# Attach when submitting: fig2_viseme_montage.png (avatar frames), app screenshots/demo stills, team photos.
# Optional references: fig1_checks_passed.png, fig3_bilabial_curves.png, rag-pipeline.png, workflow.png.

---

Build a polished 16:9 HTML slide deck (1920×1080) for a 10-minute university engineering conference talk, exportable to PDF (include print CSS: one slide per page, landscape). 15 slides. Keyboard/arrow navigation, slide counter, and a thin progress bar. Everything self-contained (inline CSS/JS, no external fonts or CDNs).

CONTEXT: This is our University of Auckland Part IV (final-year) Software Engineering project seminar at the Part IV Project Conference Day. Two students present 5 minutes each — JooHyun Kang presents slides 1–7, Richman Tan presents slides 8–15. An external academic assessor will ask technical questions, so every statistic must keep its small on-slide citation exactly as written below. Audience: academics and fellow students, mixed technical background.

DESIGN DIRECTION:
- Mood: calm, warm, trustworthy — this is a dementia-care project. Clinical coldness and startup-pitch flashiness are both wrong. Think "modern health research group", not "hackathon".
- Palette: deep slate/ink background alternating with warm off-white content slides; one calm teal/sea-green primary accent; one warm amber/coral secondary accent used ONLY for before/after "after" states and key numbers. High contrast, WCAG AA.
- Typography: clean humanist sans (system stack is fine). Very large headline type; giant numerals for statistics (the numbers are the heroes); small-caps or small grey type for citations at the bottom of slides.
- Density: ONE idea per slide, minimal text — bullets max ~6 words. This deck supports a rehearsed talk; it is not a document.
- Charts: draw natively in SVG/HTML in the deck's own style (data provided below). Simple, no gridline clutter, direct labels, baseline-vs-final always grey→accent.
- Every slide: slide number bottom-right, "Project #49 · DementiaGuide AI" tiny footer bottom-left.

THE 15 SLIDES:

1. HOOK (dark, full-bleed statement, no logos): Giant text: "Every 3 seconds, someone in the world develops dementia." Below, three small stat chips: "57M living with dementia worldwide (WHO, 2021)" · "NZ: 83,000 today → ~170,000 by 2050" · "~NZ$6b projected annual cost by 2050". Citation line: "Alzheimer's Disease International; WHO Dementia Fact Sheet 2025; Alzheimers NZ / Dementia Economic Impact Report".

2. TITLE: "Project #49" eyebrow. Title: "DementiaGuide AI". Subtitle: "An avatar-based digital resource management system for dementia care". Below: "JooHyun Kang · Richman Tan — Supervisor: Assoc. Prof. Jing Sun — Part IV Software Engineering, University of Auckland". Leave a subtle avatar-themed visual motif (abstract sound-wave-to-face line art, not clipart).

3. WHO WE ARE: Two photo placeholder cards side by side (I will drop photos in): "JooHyun Kang — Part IV Software" and "Richman Tan — Part IV Software". Keep minimal.

4. THE PROBLEM (this slide carries the motivation — give it weight): Headline: "The information exists. Caregivers can't get to it." Three evidence cards:
   - "≈1 in 3 informal dementia caregivers experience depression" (small cite: pooled prevalence 34%, Sallim et al. 2015, meta-analysis)
   - "Care systems are fragmented, bureaucratic, hard to navigate" (small cite: systematic review of 47 studies, Frontiers in Public Health 2025)
   - "WHO's own self-guided online programme (iSupport) showed no significant effect on carer burden in UK & Australian RCTs" (small cite: Lancet Reg. Health Europe 2024; Age & Ageing 2026)
   Kicker line in accent: "Static content isn't the bottleneck. Finding, navigating and applying it is."

5. TODAY vs OUR VISION: Two-column comparison. Left (muted/grey, "Today"): scattered resources · manual navigation · generic guidance · poor coordination · high caregiver stress. Right (accent, "DementiaGuide AI"): one integrated platform · conversational AI navigation · personalised, NZ-specific support · coordinated care · reduced burden. Bottom bridge line: "Same trusted WHO iSupport content — with a conversation in front of it."

6. RESEARCH QUESTIONS: Three numbered RQ cards:
   RQ1 "Can an avatar-based conversational interface make dementia-care resources easier to find and act on than conventional search?"
   RQ2 "Can LLM answers be made safe and verifiably grounded in trusted, NZ-appropriate sources?"
   RQ3 "Can the full voice→avatar loop run at conversational latency on a phone?"
   Below, a slim "Our success targets" strip: usability > 4/5 · ≥30% search-time reduction vs baseline · zero unsafe answers on our safety suite.

7. OUR SOLUTION — THE PIPELINE (JooHyun's handover slide): A five-stage horizontal pipeline with icons and one-line labels: Speech ("on-device speech recognition, en-NZ") → Retrieve ("551-chunk NZ knowledge base, hybrid vector + keyword search") → Generate ("GPT-4o, grounded with inline citations") → Speak ("ElevenLabs streaming TTS") → Avatar ("Unity CC4 character, lip-synced"). Beneath: small tech logo/text strip: React Native/Expo · Supabase pgvector · OpenAI · ElevenLabs · Unity.

8. SYSTEM DESIGN: Clean architecture diagram (draw it in SVG, layered): Mobile app (React Native/Expo) at centre-left; Supabase (pgvector KB — "551 chunks: 72 hand-curated NZ + 479 WHO iSupport") ; OpenAI ("text-embedding-3-small" embeddings, "gpt-4o" generation); ElevenLabs TTS with "Azure / OpenAI fallbacks"; Unity avatar via "Unity-as-a-Library native bridge" with "Three.js WebView fallback renderer". Callout badge: "Every streaming stage falls back independently to a blocking path."

9. MAKING THE AVATAR SPEAK: Split slide. Left: three short lines — Problem: "naive keyframe lip-sync — lips never close on p/b/m, tongue never moves" · Approach: "co-articulation engine (Cohen–Massaro dominance envelopes) + grapheme-to-phoneme pipeline" · Guarantee: "forced lip contact on closure sounds". Right: grouped horizontal bar chart "Acceptance checks passed per fixture", baseline (grey) vs final (accent), with totals banner "37/85 → 95/95":
   bilabials 6→17 (of 17) · dental 4→13 (13) · labiodental 9→16 (16) · sibilant_rhotic 6→13 (13) · hello 4→11 (11) · silence_gaps 4→9 (9) · rounded 4→6 (6) · g2p_pipeline (new) 10 (10).
   Leave an image placeholder row for avatar mouth-shape frames (I'll drop in a montage image).

10. MAKING ANSWERS SAFE: Story-led slide. Big line: "Our first prompt told a New Zealand caregiver to call 000 — the Australian emergency number. On every emergency test." Then an after-strip with four stat tiles (amber accent): "36/36 safety assertions (was 28/36)" · "4/4 emergency answers now say 111" · "0 Australian references left in the corpus" · "133/133 citation markers valid". Small supporting row: retrieval recall@5 0.969 · 0 wrongful refusals (32 in-scope questions). Footnote: "36 deterministic MUST/MUST-NOT assertions, temperature 0, fixed seed."

11. MAKING IT FAST: Before/after horizontal timeline strips. Top (grey, "Sequential — before"): record → upload audio → 750ms throttle → retrieve → generate → speak, labelled "2.2–5.5 s to first audio". Bottom (accent, "Streaming — now"): live transcription while speaking → speculative retrieval before you finish → TTS socket opens during LLM call, labelled "2.7–4.5 s to first audio (after cold start)". Two hero stat tiles: "STT finalisation 700–1,500 ms → 37–181 ms" · "−750 ms throttle removed". Small honest caveat: "preliminary: 4 turns, one device — full protocol (n≥10, Wi-Fi+cellular) scheduled."

12. DEMO: Near-full-bleed video placeholder (16:9 box, subtle play glyph) captioned "Voice question → live transcript → cited, spoken answer (~40 s)". I will embed the clip myself. Below, three small still-frame placeholders as fallback.

13. HOW WE TEST: Three cards:
   - "Avatar — automated Unity test loop: replays fixtures through the production pipeline, records blendshapes at ~90 Hz, gates 95 timed acceptance checks. Standing regression suite."
   - "RAG — 42-question caregiver set · deterministic retrieval scoring · 36 regex safety assertions at temperature 0 · LLM groundedness judge (human sign-off in progress)."
   - "Voice — per-stage latency checkpoints instrumented in every turn."
   Tagline: "Nothing is eyeballed. Every improvement is a re-runnable check."

14. WHAT'S NEXT: Four-step roadmap, numbered: ① Human usability study vs text-only baseline — task success, time-on-task, SUS; UAHPEC ethics protocol drafted (answers RQ1) — mark as "highest priority". ② Latency field protocol: n≥10, Wi-Fi + cellular, both renderers. ③ Single-round-trip retrieval — collapse the dominant 1.5–3.5 s cost to <1 s. ④ On-device articulation verification + perceptual study.

15. CLOSE (dark, mirrors slide 1): "Thank you — questions?" with a recap strip of three giant numbers: "95/95 articulation checks" · "36/36 safety assertions" · "2.7 s best time-to-first-audio". Team names + supervisor small at bottom.

Make slides 1 and 15 visually bookend each other. Keep slides 9–11 (the results block) on the light background so the charts carry. Do not invent any statistics beyond those given; do not remove the citations or the caveats — they are deliberate.
