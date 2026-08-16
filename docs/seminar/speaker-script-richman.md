# Richman — Speaker Script (slides 8–15, 5:00 hard limit)

**Audience:** a public conference — software, electrical, and computer-systems engineers, plus non-technical people. Rule of thumb while rehearsing: _if a first-year from another department wouldn't follow the sentence, simplify it._ Plain story on the slides and in your mouth; the numbers and jargon live in the backup slides for Q&A.

~560 spoken words ≈ 4:15 talking + ~40 s demo clip. Rehearse to finish by 4:50 for buffer.
JooHyun's cue line: _"Richman will show you how we built it — and how we know it works."_

Timing checkpoints (from when you start): leave slide 10 by **2:30** · demo playing by **3:05** · start "What's next" by **4:20**.

---

## Slide 8 — How it works (0:45)

> Thanks, JooHyun. JooHyun told you _why_ this matters. I'll show you _how_ it works — and, just as importantly, how we know it actually works.
>
> Here's the whole idea in one picture. You ask a question out loud. The app listens, looks up an answer in a library of trusted dementia-care information, and speaks it back to you — through a face that talks like a person.

## Slide 9 — Making it feel human (0:50)

First, we had to make the avatar feel human, and the hardest part was the face.

A talking avatar is only believable if the mouth moves properly. A basic approach fails in ways that become very obvious once you notice them. The lips might never fully close for sounds like p, b, and m, and the tongue may barely move at all.

So we iterated and kept rebuilding the lip sync system to actually follow how people speak. The mouth moves smoothly from one sound into the next, and the lips fully close for sounds like p, b, and m.

We then created 95 automatic checks for specific moments, such as whether the lips were closed or the tongue was in the correct position. Our inital approach passed fewer than half of our checks. Whereas now our system passes all 95.

## Slide 10 — Making it trustworthy (0:55)

The second challenge was trust, because here, a wrong answer is not just a mistake. It could put someone at risk.

In our first version, we asked four emergency questions. Every response told a New Zealand caregiver to call triple zero — the Australian emergency number.

A couple of the answers also gave specific medication doses that were not supported by the source material.

So we built automatic safety checks designed to catch those exact failures. Now, every emergency response says one-one-one. Medication questions do not invent a dose; they direct the caregiver to a GP or pharmacist or base information on reliable sources.

And each answer includes citations linking it back to the trusted material it used.

## Slide 11 — Making it fast (0:40)

The third challenge was speed, because a conversation quickly breaks down when you are left waiting.

Our first version could stay silent for more than five seconds before saying anything.

So we changed the pipeline so the steps happen at the same time. The phone starts transcribing while you are still speaking, and the system begins preparing the response before the whole sentence has finished processing.

Now, the avatar starts speaking in about three seconds, which feels much closer to a normal conversation.

These are still early results, and we will run the full latency study later this semester.

## Slide 12 — Demo (0:45)

> But rather than tell you — let me show you. This is it, running on a real phone.

**[Play clip, ~35–40 s. Say nothing while it plays.]**

_If the clip fails:_ point to the stills — "Same build — a spoken question, a live transcript, a spoken answer that cites its source" — and move straight on.

## Slide 13 — How we know it works (0:30)

One thing I want to make clear is that these results are not based on us watching the system and deciding that it looks good.

The mouth movements, the safety checks, and the response times are all measured by tests we can run again whenever the system changes.

So if a change breaks something, we can catch it straight away. That means every result we have shown comes from a repeatable test, not just our own judgement.

## Slide 14 — What's next (0:30)

So far, we have shown that the system works in our technical tests.

What we have not measured yet is how well it works for real people. In the second half of the project, caregivers will use the avatar to find real dementia-care information, and we will compare their experience with a text-only version.

The study has been designed and hopefully we can get it in real hands to give us feedback.

## Slide 15 — Close (0:15)

A guide that feels human, gives safe answers, and responds in seconds — built to support people caring for someone with dementia.

Thank you. We’re happy to take your questions.

---

## Delivery notes

- **Cut priority if running behind** (in order): S13 down to its last sentence ("That's how we can stand up here…") → S9 "where each sound shapes the ones around it" → S14 "compared against plain text on a screen."
- **Never cut:** the triple-zero story (S10) and the demo. They _are_ the talk.
- **Pronunciation:** say "triple zero" and "one-one-one" — never "000/111". The contrast has to be _audible_.
- **Emphasis beats:** "That's the _Australian_ emergency number" (pause) · "Ours passes all ninety-five" (pause) · "It slows down — it never just breaks."
- Don't read the slides. On S9, let the chart show the numbers while you talk about the idea.
- Keep it warm, not clinical — this is a project about people, not a benchmark.

## Q&A prep — the technical depth lives here, not on the slides

The assessor is external and will probe. Answer plainly first, then offer the number. Backup slides B1–B4 have the data if you want to pull one up.

- **"How big is the knowledge base / where's the content from?"** ~450 curated passages we evaluate against — WHO's iSupport carer programme plus ~70 we wrote specifically for New Zealand. We're expanding it toward ~550 as we finish licensing the NZ-adapted material. (Backup B2.)
- **"How does the retrieval actually work?"** Hybrid search — meaning-based _and_ keyword — over a vector database (Supabase/pgvector), answer generated by GPT-4o, constrained to only use the retrieved passages. On our 42-question test set the right passage is in the top 5 about 97% of the time. (Backup B2.)
- **"How do you know the answers are grounded, not made up?"** Every citation the model prints is checked against the passages it was actually given — 133 of 133 valid in our test run. Groundedness is also scored by an LLM judge; human sign-off is explicitly still pending. (Backup B2.)
- **"How does the safety testing work?"** 36 deterministic must / must-not rules (e.g. must say 111, must not print a milligram number), run at temperature 0 with a fixed seed so it's repeatable. Went from 28/36 to 36/36. (Backup B3.)
- **"Your latency is only 4 turns on one device."** Agreed — it's a preliminary characterisation, not the evaluation. The full protocol (≥10 turns, Wi-Fi and cellular, both renderers) is defined and runs this semester. (Backup B4.)
- **"How does the lip-sync engine work?"** A co-articulation model (Cohen–Massaro dominance envelopes) driven by a grapheme-to-phoneme pipeline, with forced lip contact on closure sounds; scored by 95 timed checks recorded at ~90 Hz. (Backup B1.)
- **"One metric regressed — the jitter."** Yes, and we say so. The old version was under-articulated, so its curves were flatter and smoother by default; we haven't isolated that experimentally yet — a constant sweep is planned.
- **"Why RAG and not fine-tuning?"** Provenance and safety: cited, auditable NZ sources; we can update content without retraining; and out-of-scope refusals are testable.
