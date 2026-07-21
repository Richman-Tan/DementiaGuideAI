# Source file manifest

Original source documents for knowledge-base ingestion. Files in this directory
are **not committed** unless their licence permits redistribution (see
`.gitignore` rule below and per-source licence in `scripts/ingest/registry.js`
+ `docs/rag-source-inventory.md`). This manifest IS committed and records what
each local file is, where it came from, and its checksum — so any ingestion is
reproducible even when the binary itself stays local.

| File | Source URL | Retrieved | sha256 | Licence evidence |
|---|---|---|---|---|
| `who-isupport-manual-2019.pdf` (7.98 MB, 275 pp) | https://iris.who.int/server/api/core/bitstreams/4d809873-9daa-43e0-bdee-d8aadf313fdb/content (IRIS record 10665/324794; ISBN 978-92-4-151586-3) | 2026-07-17 | `be5f4e89c9f05be2656674e8b7767036f72ec3d8b37bbb0a09ef6eb7a926ac85` | Page 3 of the PDF: "© World Health Organization 2019 … available under the Creative Commons Attribution-NonCommercial-ShareAlike 3.0 IGO licence (CC BY-NC-SA 3.0 IGO)" — copy/redistribute/adapt for non-commercial purposes with attribution + share-alike; no WHO endorsement implication; WHO logo not permitted |

To add a file:
```bash
curl -L -o content/sources/<name> '<official-url>'
shasum -a 256 content/sources/<name>
# add the row above, then register the source in scripts/ingest/registry.js
```
