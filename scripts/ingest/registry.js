// Source registry — the single list of what the knowledge base should contain.
// Every ingested chunk carries the provenance recorded here (audit F-13).
// See docs/rag-source-inventory.md for the human-readable inventory with
// review verdicts, and docs/rag-target-architecture.md §5 for the refresh flow.
//
// Entry fields:
//   document_id     stable id; versioned re-ingestions get a NEW document_id
//                   (e.g. isupport-nz-v2026) so old and new can coexist until
//                   the eval passes and the old set is pruned
//   loader          'curated-js' | 'pdf' | 'url' | 'text'
//   local_path      for pdf/text loaders (relative to repo root); source files
//                   live under content/sources/ with MANIFEST.md recording
//                   sha256 + retrieval date
//   licence         short licence tag; licence_url for evidence
//   enabled         ingestion refuses disabled entries (licence gate: flip to
//                   true only after the licence is confirmed)

const REGISTRY = [
  {
    document_id: 'curated',
    title: 'DementiaGuide curated knowledge base',
    source_org: 'DementiaGuideAI',
    source_url: null,
    country: 'NZ', // target region; NZ content review tracked in Stage 9
    licence: 'internal',
    licence_url: null,
    source_version: '2026-07',
    loader: 'curated-js',
    local_path: 'src/features/library/data/knowledgeBase.js',
    category: null, // per-chunk categories come from the file itself
    enabled: true,
    notes: '70 hand-authored chunks, 10 per category. Paraphrased from cited orgs; per-chunk source_org/source_url preserved.',
  },
  {
    document_id: 'isupport-who-v2026',
    title: 'iSupport for dementia: training and support manual for carers of people with dementia',
    source_org: 'World Health Organization',
    source_url: 'https://iris.who.int/handle/10665/324794',
    country: 'GLOBAL',
    licence: 'CC BY-NC-SA 3.0 IGO', // verified from page 3 of the PDF (see content/sources/MANIFEST.md)
    licence_url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/igo/',
    source_version: '2019',
    loader: 'pdf',
    local_path: 'content/sources/who-isupport-manual-2019.pdf',
    category: 'isupport-course',
    enabled: true, // Licence + non-commercial use confirmed by project owner 2026-07-17.
    notes: 'Replaces the provenance-free isupport-who chunks currently in production. Prune old isupport-who ids only after the new set passes rag:eval:retrieval.',
  },
  {
    document_id: 'isupport-nz-v2026',
    title: 'iSupport NZ adaptation (official distribution to be identified)',
    source_org: 'TBD — NZ adaptation publisher',
    source_url: null,
    country: 'NZ',
    licence: 'TBD',
    licence_url: null,
    source_version: 'TBD',
    loader: 'pdf',
    local_path: 'content/sources/isupport-nz.pdf',
    category: 'isupport-course',
    enabled: false, // LICENCE GATE: identify official source + confirm terms (Stage 9)
    notes: 'Replaces the provenance-free isupport-nz chunks currently in production.',
  },
];

function getEntry(documentId) {
  return REGISTRY.find(e => e.document_id === documentId) ?? null;
}

module.exports = { REGISTRY, getEntry };
