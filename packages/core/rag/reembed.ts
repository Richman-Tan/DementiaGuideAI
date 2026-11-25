// Giving every knowledge-base passage a second embedding, from a new model,
// beside the one it already has.
//
// The logic lives here, with its services injected, so it is typed and tested
// like the rest of the pipeline; scripts/ingest/reembed.mjs is the thin command
// that plugs in the database and the embedding provider.
//
// A passage needs embedding when it has no v2 vector, or when it was
// re-ingested after its v2 vector was written (the vector would describe the
// old text). scripts/migrations/2026-11-25_embedding_v2_voyage.sql counts the
// same rows in knowledge_chunks_v2_missing(), which gates the switch-over.

export interface KnowledgeRow {
  id: string;
  title: string;
  content: string;
  review_status: string | null;
  /** When the original embedding was last written, i.e. when the row was last ingested. */
  embedded_at: string | null;
  embedding_v2_at: string | null;
}

/** The text a passage is embedded from. Ingestion uses the same form. */
export const embeddingInput = (row: Pick<KnowledgeRow, 'title' | 'content'>) =>
  `${row.title}. ${row.content}`;

export function needsEmbedding(row: KnowledgeRow): boolean {
  if (!row.embedding_v2_at) return true;
  return row.embedded_at !== null && Date.parse(row.embedding_v2_at) < Date.parse(row.embedded_at);
}

/** Approved passages the new search could not return correctly: the switch-over gate. */
export const missingApproved = (rows: KnowledgeRow[]): string[] =>
  rows
    .filter((row) => row.review_status === 'approved' && needsEmbedding(row))
    .map((row) => row.id);

export interface ReembedDeps {
  /** Embeds a batch of passages, returning one vector per text, in order. */
  embedMany(texts: string[]): Promise<number[][]>;
  save(id: string, embedding: number[]): Promise<void>;
  log(line: string): void;
}

export interface ReembedOptions {
  batchSize?: number;
  /** Re-embed every passage, including those already up to date. */
  force?: boolean;
  /** Report what would be done without embedding or saving anything. */
  dryRun?: boolean;
}

export interface ReembedReport {
  rows: number;
  selected: number;
  embedded: number;
  /** Characters sent (or that would be sent) for embedding: the basis of the cost. */
  characters: number;
}

export async function reembed(
  rows: KnowledgeRow[],
  deps: ReembedDeps,
  { batchSize = 64, force = false, dryRun = false }: ReembedOptions = {}
): Promise<ReembedReport> {
  const selected = force ? rows : rows.filter(needsEmbedding);
  const characters = selected.reduce((total, row) => total + embeddingInput(row).length, 0);
  const report: ReembedReport = {
    rows: rows.length,
    selected: selected.length,
    embedded: 0,
    characters,
  };
  if (dryRun) {
    deps.log(
      `dry run: ${selected.length} of ${rows.length} passages would be embedded (${characters} characters)`
    );
    return report;
  }

  for (let start = 0; start < selected.length; start += batchSize) {
    const batch = selected.slice(start, start + batchSize);
    const vectors = await deps.embedMany(batch.map(embeddingInput));
    if (vectors.length !== batch.length) {
      throw new Error(
        `embedding returned ${vectors.length} vectors for a batch of ${batch.length}`
      );
    }
    // Saved one at a time, after the whole batch embedded: a failure part-way
    // leaves earlier rows complete and later ones untouched, and a re-run
    // picks up exactly the ones still missing.
    for (const [i, row] of batch.entries()) {
      await deps.save(row.id, vectors[i] as number[]);
      report.embedded += 1;
    }
    deps.log(`embedded ${report.embedded} of ${selected.length}`);
  }
  return report;
}
