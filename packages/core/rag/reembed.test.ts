import { embeddingInput, missingApproved, needsEmbedding, reembed } from './reembed.ts';
import type { KnowledgeRow, ReembedDeps } from './reembed.ts';

const row = (id: string, overrides: Partial<KnowledgeRow> = {}): KnowledgeRow => ({
  id,
  title: `Title ${id}`,
  content: `Content ${id}`,
  review_status: 'approved',
  embedded_at: '2026-09-01T00:00:00Z',
  embedding_v2_at: null,
  ...overrides,
});

const UP_TO_DATE = { embedding_v2_at: '2026-11-25T00:00:00Z' };

function fakeDeps(options: { failSaveOn?: string; shortBatch?: boolean } = {}) {
  const batches: string[][] = [];
  const saved: { id: string; embedding: number[] }[] = [];
  const logs: string[] = [];
  const deps: ReembedDeps = {
    embedMany: async (texts) => {
      batches.push(texts);
      const vectors = texts.map((t) => [t.length]);
      return options.shortBatch ? vectors.slice(1) : vectors;
    },
    save: async (id, embedding) => {
      if (id === options.failSaveOn) throw new Error(`could not save ${id}`);
      saved.push({ id, embedding });
    },
    log: (line) => logs.push(line),
  };
  return { deps, batches, saved, logs };
}

describe('embeddingInput', () => {
  it('is the title, then the content, the form ingestion embeds', () => {
    expect(embeddingInput({ title: 'Sundowning', content: 'Keep afternoons calm.' })).toBe(
      'Sundowning. Keep afternoons calm.'
    );
  });
});

describe('needsEmbedding', () => {
  it.each([
    ['has never had a v2 embedding', true, row('a')],
    ['is up to date', false, row('a', UP_TO_DATE)],
    [
      'was re-ingested after its v2 embedding',
      true,
      row('a', { embedded_at: '2026-12-01T00:00:00Z', embedding_v2_at: '2026-11-25T00:00:00Z' }),
    ],
    [
      'has a v2 embedding and no ingestion time',
      false,
      row('a', { embedded_at: null, ...UP_TO_DATE }),
    ],
  ])('a passage that %s needs embedding: %s', (_name, expected, r) => {
    expect(needsEmbedding(r)).toBe(expected);
  });
});

describe('missingApproved', () => {
  it('lists approved passages that still need embedding, and no others', () => {
    const rows = [
      row('needs'),
      row('done', UP_TO_DATE),
      row('pending', { review_status: 'pending' }),
      row('rejected', { review_status: 'rejected' }),
    ];
    expect(missingApproved(rows)).toEqual(['needs']);
  });
});

describe('reembed', () => {
  it('embeds and saves only the passages that need it, in batches', async () => {
    const rows = [
      row('a'),
      row('b', UP_TO_DATE),
      row('c'),
      row('d'),
      row('e', { review_status: 'pending' }),
    ];
    const { deps, batches, saved, logs } = fakeDeps();

    const report = await reembed(rows, deps, { batchSize: 2 });

    expect(batches).toEqual([
      ['Title a. Content a', 'Title c. Content c'],
      ['Title d. Content d', 'Title e. Content e'],
    ]);
    expect(saved.map((s) => s.id)).toEqual(['a', 'c', 'd', 'e']);
    expect(saved[0]?.embedding).toEqual(['Title a. Content a'.length]);
    expect(report).toEqual({
      rows: 5,
      selected: 4,
      embedded: 4,
      characters: 4 * 'Title a. Content a'.length,
    });
    expect(logs).toEqual(['embedded 2 of 4', 'embedded 4 of 4']);
  });

  it('embeds pending passages too, so approving one later leaves no gap', async () => {
    const { deps, saved } = fakeDeps();
    await reembed([row('p', { review_status: 'pending' })], deps);
    expect(saved.map((s) => s.id)).toEqual(['p']);
  });

  it('with force, re-embeds passages that are already up to date', async () => {
    const { deps, saved } = fakeDeps();
    const report = await reembed([row('a', UP_TO_DATE), row('b', UP_TO_DATE)], deps, {
      force: true,
    });
    expect(saved.map((s) => s.id)).toEqual(['a', 'b']);
    expect(report.selected).toBe(2);
  });

  it('on a dry run, reports the work without embedding or saving', async () => {
    const { deps, batches, saved, logs } = fakeDeps();
    const report = await reembed([row('a'), row('b', UP_TO_DATE)], deps, { dryRun: true });
    expect(batches).toEqual([]);
    expect(saved).toEqual([]);
    expect(report).toEqual({ rows: 2, selected: 1, embedded: 0, characters: 18 });
    expect(logs).toEqual(['dry run: 1 of 2 passages would be embedded (18 characters)']);
  });

  it('does nothing when every passage is up to date', async () => {
    const { deps, batches } = fakeDeps();
    const report = await reembed([row('a', UP_TO_DATE)], deps);
    expect(batches).toEqual([]);
    expect(report).toEqual({ rows: 1, selected: 0, embedded: 0, characters: 0 });
  });

  it('stops on a failed save, leaving earlier passages saved and reporting how far it got', async () => {
    const { deps, saved } = fakeDeps({ failSaveOn: 'b' });
    await expect(reembed([row('a'), row('b'), row('c')], deps, { batchSize: 2 })).rejects.toThrow(
      'could not save b'
    );
    expect(saved.map((s) => s.id)).toEqual(['a']);
  });

  it('refuses a batch that comes back with the wrong number of vectors', async () => {
    const { deps, saved } = fakeDeps({ shortBatch: true });
    await expect(reembed([row('a'), row('b')], deps)).rejects.toThrow(
      'embedding returned 1 vectors for a batch of 2'
    );
    expect(saved).toEqual([]);
  });
});
