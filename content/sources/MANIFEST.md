# Source file manifest

Original source documents for knowledge-base ingestion. Files in this directory
are **not committed** unless their licence permits redistribution (see
`.gitignore` rule below and per-source licence in `scripts/ingest/registry.js`
+ `docs/rag-source-inventory.md`). This manifest IS committed and records what
each local file is, where it came from, and its checksum — so any ingestion is
reproducible even when the binary itself stays local.

| File | Source URL | Retrieved | sha256 | Licence evidence |
|---|---|---|---|---|
| _(none yet — populated in Stage 9 after the licence gate)_ | | | | |

To add a file:
```bash
curl -L -o content/sources/<name> '<official-url>'
shasum -a 256 content/sources/<name>
# add the row above, then register the source in scripts/ingest/registry.js
```
