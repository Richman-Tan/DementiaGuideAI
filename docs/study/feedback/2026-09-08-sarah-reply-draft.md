# Draft reply to Sarah — feedback of 8 Sep 2026

Status: DRAFT for Richman & JooHyun to edit and send. Not committed to git.
Everything referenced is merged, deployed, and live as of 2026-09-09.

---

Hi Sarah,

Thanks for taking the time to test it properly. Everything below is live on the site now.

**Delirium** — the knowledge base only covered delirium as sudden confusion or agitation, so a question about sleepiness never surfaced it. We've added two entries (sudden drowsiness as a sign of delirium, and what to do — same-day GP, Healthline 0800 611 116, 111 if they can't be woken), plus an automated check so any answer about sudden sleepiness has to point to urgent advice rather than calling it normal progression.

**Adding our own material** — already possible. A plain-text document gets registered and is live for all users within minutes, no app release needed. The delirium entries went in this way, and there's a one-page guide for the team. It also keeps the IP side simple, since the text is ours.

**PubMed** — the pipeline could ingest it, but the writing is too academic for this audience and the licensing is unclear. The better route is plain-language summaries of the relevant evidence, added as our own content — can discuss on the call.

**Windows** — the task panel is about a third smaller (the scenario text sits behind a "Show details" button), the chat no longer jumps to the bottom while an answer is coming in — scroll up and it stays put, with a "Jump to latest" button — and there's an "Aa" button that makes all the text bigger.

**Questionnaires** — answers can now be un-ticked. We've also built a multiple-answer question type but haven't applied it anywhere yet: which questions should allow more than one answer is your call, and probably belongs with the ethics amendment.

**Links** — they now say "opens in a new tab". The missing ones were a mix of a bug (sources matched to our library articles hid their external link) and missing data (the iSupport material had no links stored) — both fixed. Many Alzheimers NZ links go to their homepage rather than the exact page; deep-linking them is a content job we could do together.

**Aaron and Aria** — same assistant, same answers. Aaron is the default avatar; when his (large) 3-D model fails to load, the app was silently swapping in a simpler one called Aria, and a few pages said "Aria" regardless. The name is now consistent everywhere, the app says when the swap happens, and we record which avatar each session actually saw.

**Microphone** — a few failure modes showed no error at all, and the first spoken question could hit a slow server start. The setup page now won't start until the mic check passes (or you choose to type instead), failures show a plain message, and the server is warmed up beforehand. Worth trying again in Chrome — and typing always works on the voice screen too.

**USA sources** — partly there already: the knowledge base includes material from the Alzheimer's Association, NIA, Alzheimers.gov, Family Caregiver Alliance and Mayo Clinic alongside the NZ/UK/WHO core. If there are specific US resources you'd like in, we can add them once the licences are checked.

**PIS, consent forms and the e-DiVA amendment** — let's go through these together.

Two things for you, whenever suits:

1. Which questionnaire items, if any, should allow multiple answers.
2. Whether the "not a real person" reminder on the task panel can also move behind "Show details" — it's always visible for now.

Richman & JooHyun
