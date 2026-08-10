# P4P Conference Day Seminar — Slide-by-Slide Research & Content

**Event:** Part IV Project Conference Day, Saturday 25 July 2026, 8:30am–4:00pm
**Format:** 20-min slot = 10-min talk (strictly 5 min per student) + 5 min Q&A + 5 min changeover. Timing strictly enforced; no switching back and forth between presenters.
**Speakers:** JooHyun Kang (first 5 min, slides 1–7) → Richman Tan (second 5 min, slides 8–15).
**Assessor:** independent academic from outside the supervision group will ask technical questions in Q&A.

Calibration from last year's example deck (Tony & Alex, Project #79): 14 slides for 10 minutes, one idea per slide, very low text density, huge type, a hook slide *before* the title slide, tech logos used liberally, hand-drawn system diagram, demo near the end. Ours follows the same density norms with a more polished visual system.

---

## Verified statistics (use these; citations go on-slide in small type)

| Claim | Verified figure | Source |
|---|---|---|
| Global incidence | Someone in the world develops dementia every 3 seconds | Alzheimer's Disease International, Dementia Statistics — alzint.org |
| Global prevalence | 57 million people living with dementia (2021); nearly 10 million new cases/year; projected 139M by 2050 | WHO Dementia Fact Sheet (updated Mar 2025) — who.int |
| NZ prevalence | ~83,000 New Zealanders today, projected to almost 170,000 by 2050 | Alzheimers NZ / Dementia Economic Impact Report (Budget 2025 briefing) |
| NZ cost | Dementia will cost NZ nearly $6 billion/year by 2050; 1 in 4 NZers will die with the condition | Alzheimers NZ / DEIR |
| Caregiver depression | Pooled prevalence of depression among informal dementia caregivers ≈ 34% (~1 in 3) | Sallim et al. 2015, J Am Med Dir Assoc (meta-analysis); consistent with Collins & Kishita meta-analysis, Ageing & Society |
| Fragmentation / info needs | Caregivers report lack of information about dementia and services, and describe the care system as complex, fragmented, and bureaucratic (47-study systematic review, 2013–2023) | Frontiers in Public Health 2025 systematic review of needs/unmet needs |
| Static content isn't enough | WHO's own self-guided online carer programme **iSupport** showed **no significant effect** on carer depression/burden in UK (Lancet Reg Health Eur 2024) and Australian (Age & Ageing, Draw-Care) RCTs | Both trials named; this is the pivotal motivation stat |
| Avatar/ECA evidence | ECAs for dementia are promising but early: 7/15 studies reported better efficacy vs control; usability studies (e.g. ECA "Anne") show people with dementia + caregivers can use them independently at home | JMIR mHealth 2021 thematic literature analysis; JMIR mHealth 2021 Anne study |

**Dropped as unsupportable** (do not use): "avatar interfaces increase engagement 35%+", "personalised guidance reduces search time 70%", "60% of facilities lack integrated systems". No credible source found; an assessor would ask. "Usability > 4/5" and "≥30% search-time reduction" are kept but framed as **our own success targets**, not literature claims.

### Source URLs
- https://www.who.int/news-room/fact-sheets/detail/dementia
- https://www.alzint.org/about/dementia-facts-figures/dementia-statistics/
- https://cdn.alzheimers.org.nz/wp-content/uploads/2024/09/Alzheimers-NZ-Dementia-NZ-Briefing-for-Budget-2025.pdf
- https://www.sciencedirect.com/science/article/abs/pii/S1525861015006076 (Sallim et al., pooled 34%)
- https://www.cambridge.org/core/journals/ageing-and-society/article/abs/prevalence-of-depression-and-burden-among-informal-caregivers-of-people-with-dementia-a-metaanalysis/45C8A0DD5DED53978E039111FCCEB8EF
- https://www.frontiersin.org/journals/public-health/articles/10.3389/fpubh.2025.1605993/full
- https://www.thelancet.com/journals/lanepe/article/PIIS2666-7762(24)00293-X/fulltext (iSupport UK RCT, null)
- https://academic.oup.com/ageing (Draw-Care / iSupport Lite Australian RCT, null)
- https://mhealth.jmir.org/2021/7/e25381 (ECAs for dementia, thematic analysis)
- https://mhealth.jmir.org/2021/6/e25891 (ECA Anne usability, home settings)

---

## Slide-by-slide content (15 slides ≈ 40 s average)

### PART 1 — JooHyun (5:00)

**Slide 1 — Hook (0:30)**
- Full-bleed statement slide, no title yet: **“Every 3 seconds, someone in the world develops dementia.”** (ADI)
- Sub-stats appearing beneath: **57M** living with dementia worldwide (WHO 2021) · NZ: **83,000 → ~170,000 by 2050** · **~NZ$6b/yr** projected cost (Alzheimers NZ).
- Purpose: same job as Tony & Alex's meme-hook slide, but in our register — gravity, not humour.

**Slide 2 — Title (0:20)**
- Project #49 · **DementiaGuide AI** · “An avatar-based digital resource management system for dementia care” · JooHyun Kang & Richman Tan · Supervisor: Assoc. Prof. Jing Sun · Part IV Software Engineering, University of Auckland.

**Slide 3 — Who we are (0:15)**
- Two photo cards: JooHyun Kang, Richman Tan (Part IV Software). Keep it light and fast; the example deck used a fun team photo — optional.

**Slide 4 — The problem (1:00)**
- Headline: **“The information exists. Caregivers can't get to it.”**
- Three evidence cards:
  1. **~1 in 3** informal dementia caregivers experience depression (pooled 34%, meta-analysis).
  2. Caregivers report **fragmented, bureaucratic systems** and missing information about services (systematic review of 47 studies).
  3. **Even WHO's own online programme (iSupport) failed as self-guided content** — null effects on burden/depression in UK & Australian RCTs.
- Kicker line: “Static content isn't the bottleneck — **finding, navigating, and applying it is.**”

**Slide 5 — Current state vs our vision (0:45)**
- Two-column comparison (from our outline):
  - **Today:** scattered resources · manual navigation · generic guidance · poor coordination · high caregiver stress
  - **DementiaGuide AI:** one integrated platform · conversational AI navigation · personalised, NZ-specific support · coordinated care · reduced burden
- One-line bridge: “We take the same trusted WHO iSupport content — and put a conversation in front of it.”

**Slide 6 — Research questions & objectives (1:00)**
- Three RQs (each maps to a result Richman shows later):
  1. Can an **avatar-based conversational interface** make dementia-care resources easier to find and act on than conventional search?
  2. Can LLM answers be made **safe and verifiably grounded** in trusted, NZ-appropriate sources?
  3. Can the full **voice → avatar loop** run at conversational latency on a phone?
- Success targets (ours): usability **> 4/5**; **≥ 30%** search-time reduction vs baseline; zero unsafe answers on our safety suite.

**Slide 7 — Our solution: the pipeline (1:10) → handover**
- Five-stage horizontal pipeline diagram: 🎙 **Speech** (on-device STT, en-NZ) → 🔍 **Retrieve** (551-chunk NZ knowledge base, hybrid vector+keyword search) → 🧠 **Generate** (GPT-4o, grounded + cited) → 🔊 **Speak** (ElevenLabs TTS) → 🧑 **Avatar** (Unity CC4 character, lip-synced).
- Tech-stack strip: React Native/Expo · Supabase pgvector · OpenAI · ElevenLabs · Unity.
- JooHyun's last line hands over: “Richman will show you how we built and measured each stage.”

### PART 2 — Richman (5:00)

**Slide 8 — System design (0:50)**
- Architecture diagram (clean redraw): mobile app (Expo/RN) ↔ Supabase (pgvector KB, 551 chunks: 72 hand-curated NZ + 479 WHO iSupport) ↔ OpenAI (embeddings `text-embedding-3-small`, generation `gpt-4o`) ↔ ElevenLabs TTS (Azure/OpenAI fallbacks) ↔ Unity avatar via Unity-as-a-Library native bridge, Three.js WebView as fallback renderer.
- Design principle callout: **every streaming stage falls back independently** to a blocking path.

**Slide 9 — Making the avatar speak (0:55)**
- Problem: naive keyframe interpolation → mouth doesn't close on /p b m/, tongue never moves.
- Approach: **co-articulation engine** (Cohen–Massaro dominance envelopes) + G2P text→phoneme pipeline; guaranteed-contact rule for bilabials/labiodentals.
- Result (grouped bar chart, data below): acceptance checks **37/85 → 95/95**; tongue shapes went from literally never driven (0.00 on all 27 checks) to 0.40–0.72 peaks.
- Visual: restyled fig1 chart + 2–3 frames from the viseme montage (fig2).
- Honesty note for Q&A (not on slide): jitter RMS regressed; editor-only results.

**Slide 10 — Making answers safe & grounded (0:55)**
- The story: our v1 prompt told a New Zealand caregiver to call **000 — the Australian emergency number — on all four emergency test questions.** Deterministic safety suite caught it.
- After NZ-safety prompt v2 + corpus rewrite: **36/36 safety assertions pass** (was 28/36), **0** Australian references remain, dosing questions decline mg specifics.
- Grounding: retrieval recall@5 **0.969**; **133/133** inline citation markers valid against retrieved passages; 0 in-scope refusals.
- Stat tiles + a small before/after safety bar.

**Slide 11 — Making it fast (0:45)**
- Before/after latency architecture strip: sequential (record → upload → throttle → retrieve → generate → TTS) vs streaming (live partial transcripts, speculative retrieval while you speak, TTS socket opens during LLM call).
- Numbers: time-to-first-audio **2.2–5.5 s → 2.7–4.5 s** (after cold start); STT finalisation **700–1,500 ms → 37–181 ms**; throttle removal −750 ms.
- Caveat kept small + honest: n = 4 turns, one device, preliminary.

**Slide 12 — Demo (0:50)**
- Full-bleed demo slide, ~40 s pre-recorded clip: caregiver asks a question by voice → live transcript appears → avatar answers with spoken, cited, NZ-specific guidance.
- Fallback: 3 still frames from the clip on the same slide if playback fails.
- Shot list for recording: (1) hands-free voice question, e.g. “How do I handle sundowning in the evenings?”; (2) show live STT partials on screen; (3) avatar speaking with visible lip-sync; (4) end on citation chip → source view.

**Slide 13 — How we test (0:35)**
- Three test-harness cards:
  1. **Avatar:** automated Unity fixture loop — replays 8 fixtures through the production entry point, records blendshapes at ~90 Hz, gates 95 timed acceptance checks (standing regression suite).
  2. **RAG:** 42-question caregiver set; deterministic retrieval scoring; **36 regex MUST/MUST-NOT safety assertions** at temperature 0; LLM judge for groundedness (human sign-off in progress).
  3. **Latency:** per-stage checkpoints instrumented in every voice turn.
- Point to make verbally: everything is regression-testable — no eyeballing.

**Slide 14 — What's next (0:40)**
- Roadmap (4 items): ① **Human usability study** vs text-only baseline — task success, time-on-task, SUS; UAHPEC ethics protocol drafted (this answers RQ1). ② Latency field protocol (n ≥ 10, Wi-Fi + cellular, both renderers). ③ Single-round-trip retrieval (collapse the dominant 1.5–3.5 s cost to < 1 s). ④ On-device verification of the articulation suite + perceptual study.

**Slide 15 — Close (0:10)**
- Thank-you slide with the three headline numbers as a recap strip: **95/95** articulation checks · **36/36** safety assertions · **2.7 s** best time-to-first-audio. “Questions?” Project #49 footer.

---

## Q&A prep (assessor is external, technical)

1. **“Your groundedness scores are LLM-judged — how do you know they're right?”** Strict rubric, temp-0, fixed seed; independent AI cross-check agreed 10/10 on sampled rows; human sign-off is explicitly pending and listed as remaining work. Every score-1 was a helpline mention not literally in the passages — none was fabrication.
2. **“n = 4 latency turns is not an evaluation.”** Agreed — it's a preliminary characterisation; the full protocol (n ≥ 10, Wi-Fi + cellular, both renderers) is defined and scheduled; per-stage instrumentation is already in production.
3. **“Jitter regressed — why?”** Baseline under-articulated (flat curves have low second-difference); no visible oscillation in recordings; but we haven't isolated it experimentally, so it stands as a finding and constant-sweep is planned.
4. **“Why no user study yet?”** Requires UAHPEC ethics approval; protocol drafted; mid-year results deliberately validate enabling technology first.
5. **“Why not fine-tune a model instead of RAG?”** Provenance + safety: cited, auditable NZ sources; content updates without retraining; refusal behaviour on out-of-scope is testable.
6. **“Retrieval recall didn't improve — why present it?”** The overhaul fixed a corpus-imbalance artefact (family cap), then held recall stable through prompt/citation refactors and re-ingestion — stability under change was the goal; the win was safety.
7. **“How is this different from a chatbot / ChatGPT?”** Grounded in a curated NZ corpus with validated citations, NZ-safety prompt, embodied avatar for accessibility, offline-testable safety suite.
8. **“Privacy/security of health data?”** Supabase with per-user auth; no PHI in the KB (public care content); conversation data handling to be covered in ethics protocol.

## Chart data for the deck (native charts, not pasted PNGs)

**Lip-sync checks per fixture (baseline → final / total):** bilabials 6→17/17 · dental 4→13/13 · labiodental 9→16/16 · sibilant_rhotic 6→13/13 · hello 4→11/11 · silence_gaps 4→9/9 · rounded 4→6/6 · g2p_pipeline (new) 10/10. **Total 37/85 → 95/95.**

**Safety assertions:** overall 28/36 → 36/36 · emergency-111 0/4 → 4/4 · dosing 2/4 → 4/4 · region errors 3 → 0.

**Retrieval:** recall@1 0.844 · recall@3 0.938 · recall@5 0.969 · MRR 0.888 · citations 133/133 · in-scope refusals 0/32.

**Latency (ms), turns 2–4 after cold start:** to-first-audio 3,983 / 2,719 / 4,447 · STT final 48 / 37 / 181 · retrieval 1,853 / 1,580 / 2,819 · LLM first token 1,097 / 703 / 683 · TTS first audio 728 / 311 / 411. Baseline (sequential): 2,200–5,500 ms to first audio; Whisper STT 700–1,500 ms.

## Assets to attach when submitting the design prompt
- `docs/report/figures/fig2_viseme_montage.png` (avatar face frames — hero visual for slide 9)
- `docs/report/figures/fig1_checks_passed.png`, `fig3_bilabial_curves.png` (reference for restyled charts)
- `assets/rag-pipeline.png`, `assets/workflow.png` (reference for pipeline diagram)
- App screenshots / demo stills, team photos (to be taken)
