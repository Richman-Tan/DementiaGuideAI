# Adding your own content to the knowledge base

For the research team: how a document you wrote (or a source you cleared)
becomes part of what the assistant can retrieve and cite. No app deploy is
involved — the corpus lives in Supabase and every client reads it live, so
changes take effect as soon as the ingest completes.

The whole flow is five steps; the only slow one is the review.

## 1. Write the file

Plain text or markdown, saved under `content/sources/` (e.g.
`content/sources/dg-curated-<topic>-<yyyy-mm>.txt`). Structure it with `#`
headings — the ingester splits chunks on headings, so **each heading-led
section becomes one retrieval unit**. Aim for sections of roughly 100–500
words; shorter sections are merged into the next one.

Content rules (the v2-nz-safety framing the prompt and safety checks assume):

- New Zealand services only: GP, Healthline 0800 611 116, 111, Alzheimers NZ
  0800 004 001. Never Australian services (the safety suite fails on them).
- No medicine names with doses, no diagnosis. "Talk to the GP or pharmacist"
  is the ceiling for medication advice.
- Plain language, carer-facing, like the existing library articles.

## 2. Record it in the manifest

Add a row to `content/sources/MANIFEST.md`: filename, where it came from
(for team-authored content: "team-authored <date>", plus what it was adapted
from), the `shasum -a 256` of the file, and the licence. Team-authored
content is licence `internal` and IS committed (see the `.gitignore` carve-out
for `dg-curated-*.txt`); third-party files stay uncommitted unless their
licence permits redistribution.

## 3. Register it

Add an entry to `REGISTRY` in `scripts/ingest/registry.js` — the field
comments at the top of the file explain each one. The important choices:

- `document_id`: stable and versioned, e.g. `dg-<topic>-v2026-09`.
- `loader: 'text'` for a text/markdown file (`pdf` and `url` also exist).
- `category`: one of the categories in `packages/core/rag/ragConfig.js`
  (`CATEGORIES`) — the ingest refuses unknown ones.
- `enabled: false` **until the content is signed off** — the ingester refuses
  disabled entries, which is the review gate doing its job.

## 4. Get it signed off

Clinical content needs a clinician's review before it can be retrieved in
answers (this is also what reduces the IP question to zero for team-authored
material: it is our own text, reviewed by our own clinician). When approved:
remove any draft header from the file, re-hash it into the manifest row, and
flip `enabled: true`.

## 5. Ingest and check

```bash
npm run kb:ingest:dry -- --doc <document_id>   # shows chunking, writes nothing
npm run kb:ingest -- --doc <document_id>       # embeds + upserts to Supabase
npm run rag:eval:retrieval                     # recall metrics still healthy?
npm run rag:eval:safety                        # safety gates still pass?
```

The ingest needs `.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`OPENAI_API_KEY` (the app's anon key cannot write). Ingest is idempotent —
unchanged chunks are hash-skipped, edited ones are re-embedded — and content
is live for all clients the moment the upsert finishes.

If the new content answers a question type the eval set doesn't cover, add a
labelled question to `scripts/eval/questions.js` in the same change (use
`pendingContent: true` until the chunk ids exist, then fill in `relevant`).

Worked example: `dg-delirium-v2026-09` (sudden sleepiness → delirium), added
2026-09-09 after pilot feedback, sign-off pending — every step above has a
concrete instance in that change.
