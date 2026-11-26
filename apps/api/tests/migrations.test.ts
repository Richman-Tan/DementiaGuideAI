// The database migrations, run for real.
//
// Every file in scripts/migrations is written to be pasted into the Supabase
// SQL editor, and until now none of them had ever run anywhere else: the first
// execution of each was against production. Two of them caused outages that
// way (see that folder's README). This applies the whole chain to a Postgres
// running in this process (PGlite, with pgvector) and then exercises what the
// server depends on: the search over the new embeddings, the daily counter
// behind the spending cap, and who may read or call what.
//
// What stands in for Supabase is the short bootstrap below: its three roles,
// the auth schema, and the default privileges it gives new tables. That part is
// a reconstruction, so a pass here says the SQL is valid and behaves as
// written, not that production is configured the same way.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toTraceRow } from '../src/trace.ts';
import type { TraceRow } from '../src/trace.ts';
import type { TurnSummary } from '../src/turn.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/migrations');
const ORDER = JSON.parse(readFileSync(join(DIR, 'order.json'), 'utf8')) as {
  fresh: string[];
  referenceOnly: string[];
};

// What a Supabase project has before any of these files run.
const SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
`;

const sql = (file: string) => readFileSync(join(DIR, file), 'utf8');

async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(SUPABASE);
  return db;
}

async function migrate(db: PGlite, files: string[] = ORDER.fresh): Promise<void> {
  for (const file of files) {
    try {
      await db.exec(sql(file));
    } catch (err) {
      throw new Error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Runs a query as one of Supabase's roles, optionally as a signed-in user. */
async function as<T>(db: PGlite, role: string, query: string, userId = ''): Promise<T[]> {
  await db.exec(`set role ${role}; set request.jwt.claim.sub = '${userId}';`);
  try {
    return (await db.query<T>(query)).rows;
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

/** A unit vector of the given width pointing mostly along one axis. */
const along = (axis: number, width: number, lean = 0) => {
  const v = new Array<number>(width).fill(0);
  v[axis] = 1;
  if (lean) v[axis + 1] = lean;
  return `[${v.join(',')}]`;
};

let db: PGlite;

beforeAll(async () => {
  db = await freshDatabase();
  await migrate(db);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('the migration files', () => {
  it('are each listed once, as run on a fresh database or as reference only', () => {
    const onDisk = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const listed = [...ORDER.fresh, ...ORDER.referenceOnly];
    expect([...listed].sort()).toEqual(onDisk);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('do not apply in filename order, which is why the order is written down', async () => {
    const byName = [...ORDER.fresh].sort();
    const scratch = await freshDatabase();
    await expect(migrate(scratch, byName)).rejects.toThrow(
      '2026-08-18_backend_v1.sql: relation "public.study_sessions" does not exist'
    );
    await scratch.close();
  }, 120_000);

  it('leave exactly one search function of each name', async () => {
    // Two functions named match_chunks made the app's call ambiguous and took
    // retrieval down (2026-07-13). The new search has its own name instead.
    const { rows } = await db.query<{ proname: string; n: number }>(
      `select proname, count(*)::int as n from pg_proc
       where proname in ('match_chunks', 'match_chunks_v2') group by proname order by proname`
    );
    expect(rows).toEqual([
      { proname: 'match_chunks', n: 1 },
      { proname: 'match_chunks_v2', n: 1 },
    ]);
  });

  it('can have the newest one run again without harm', async () => {
    await expect(db.exec(sql('2026-11-25_embedding_v2_voyage.sql'))).resolves.toBeDefined();
  });
});

describe('a database that already holds passages when a migration arrives', () => {
  it('keeps them searchable through the review-status migration', async () => {
    // The first version of that file left every existing row "pending", and
    // search returned nothing until it was corrected on the live database.
    const before = ORDER.fresh.indexOf('2026-10-07_review_status.sql');
    const scratch = await freshDatabase();
    await migrate(scratch, ORDER.fresh.slice(0, before));
    await scratch.exec(`
      insert into knowledge_chunks (id, category, title, content, embedding)
      values ('old-1', 'caregiving', 'Sundowning', 'Keep late afternoons calm.', '${along(0, 1536)}');
    `);
    await migrate(scratch, ORDER.fresh.slice(before));

    const { rows } = await scratch.query<{ review_status: string }>(
      `select review_status from knowledge_chunks where id = 'old-1'`
    );
    expect(rows).toEqual([{ review_status: 'approved' }]);
    const found = await scratch.query<{ id: string }>(
      `select id from match_chunks('${along(0, 1536)}'::vector, 'sundowning', 5, 0.25)`
    );
    expect(found.rows).toEqual([{ id: 'old-1' }]);
    // A passage added afterwards waits for review.
    await scratch.exec(
      `insert into knowledge_chunks (id, category, title, content) values ('new-1', 'c', 't', 'x')`
    );
    const added = await scratch.query<{ review_status: string }>(
      `select review_status from knowledge_chunks where id = 'new-1'`
    );
    expect(added.rows).toEqual([{ review_status: 'pending' }]);
    await scratch.close();
  }, 120_000);
});

describe('search over the Voyage embeddings (match_chunks_v2)', () => {
  const Q = along(0, 1024); // the question points along axis 0

  beforeAll(async () => {
    await db.exec(`
      insert into knowledge_chunks (id, category, title, content, review_status, embedding_v2, embedding_v2_at, embedded_at) values
        ('near',     'caregiving', 'Sundowning',     'Keep late afternoons calm and well lit.', 'approved', '${along(0, 1024, 0.1)}', now(), now() - interval '1 day'),
        ('nearer',   'caregiving', 'Evening routine', 'A steady routine helps in the evening.',  'approved', '${along(0, 1024)}',      now(), null),
        ('far',      'legal',      'Power of attorney', 'An enduring power of attorney covers sundowning decisions too.', 'approved', '${along(5, 1024)}', now(), null),
        ('unrelated','legal',      'Wills',          'How to update a will.',                   'approved', '${along(9, 1024)}',      now(), null),
        ('pending',  'caregiving', 'Draft',          'Not yet reviewed.',                       'pending',  '${along(0, 1024)}',      now(), null),
        ('no-v2',    'caregiving', 'Old embedding',  'Has only the OpenAI vector.',             'approved', null,                     null,  null),
        ('stale',    'caregiving', 'Re-ingested',    'Changed since it was embedded.',          'approved', '${along(3, 1024)}',      now() - interval '2 days', now());
    `);
  });

  const search = (text: string, extra = '') =>
    db.query<{ id: string; similarity: number }>(
      `select id, similarity from match_chunks_v2('${Q}'::vector, '${text}', 5, 0.25${extra})`
    );

  it('returns approved passages that have a Voyage embedding, closest first', async () => {
    const { rows } = await search('');
    expect(rows.map((r) => r.id)).toEqual(['nearer', 'near']);
    expect(rows[0]?.similarity).toBeCloseTo(0.7, 5); // 0.7 x a cosine of 1, with no keyword match
  });

  it('leaves out passages awaiting review and passages with no Voyage embedding', async () => {
    const ids = (await search('')).rows.map((r) => r.id);
    expect(ids).not.toContain('pending');
    expect(ids).not.toContain('no-v2');
  });

  it('also finds a passage by its words when its vector is nowhere near', async () => {
    // "far" points away from the question and mentions sundowning.
    const { rows } = await search('sundowning');
    expect(rows.map((r) => r.id)).toContain('far');
    expect(rows.map((r) => r.id)).not.toContain('unrelated');
  });

  it('takes the balance between vector and words as an argument', async () => {
    const vectorOnly = await search('sundowning', ', null, null, null, null, 1.0');
    const wordsOnly = await search('sundowning', ', null, null, null, null, 0.0');
    const score = (rows: { id: string; similarity: number }[], id: string) =>
      rows.find((r) => r.id === id)?.similarity ?? null;
    // With vectors only, the perfect vector match scores 1 and the keyword-only passage 0.
    expect(score(vectorOnly.rows, 'nearer')).toBeCloseTo(1, 5);
    expect(score(vectorOnly.rows, 'far')).toBeCloseTo(0, 5);
    // With words only, a passage with no matching word scores 0 and one with the word scores above it.
    expect(score(wordsOnly.rows, 'nearer')).toBeCloseTo(0, 5);
    expect(score(wordsOnly.rows, 'far')).toBeGreaterThan(0);
  });

  it('respects the number asked for', async () => {
    const { rows } = await db.query(`select id from match_chunks_v2('${Q}'::vector, '', 1, 0.25)`);
    expect(rows).toEqual([{ id: 'nearer' }]);
  });

  it('is what the server calls: the named arguments it sends are accepted', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from match_chunks_v2(query_embedding => '${Q}'::vector, query_text => 'evening',
         match_count => 50, min_similarity => 0.25, vector_weight => 0.7)`
    );
    expect(rows[0]?.id).toBe('nearer');
  });

  it('does not change the existing search, which still reads the old column', async () => {
    const { rows } = await db.query(
      `select id from match_chunks('${along(0, 1536)}'::vector, '', 5, 0.25)`
    );
    expect(rows).toEqual([]); // none of these rows has an OpenAI embedding
  });

  it('counts the approved passages the new search cannot yet answer from', async () => {
    // "no-v2" has no Voyage embedding; "stale" was re-ingested after its one was written.
    const { rows } = await db.query<{ missing: number }>(
      `select knowledge_chunks_v2_missing() as missing`
    );
    expect(rows).toEqual([{ missing: 2 }]);
    await db.exec(`
      update knowledge_chunks set embedding_v2 = '${along(2, 1024)}', embedding_v2_at = now()
      where id in ('no-v2', 'stale');
    `);
    const after = await db.query<{ missing: number }>(
      `select knowledge_chunks_v2_missing() as missing`
    );
    expect(after.rows).toEqual([{ missing: 0 }]);
  });

  it('refuses a vector of the wrong width', async () => {
    await expect(
      db.exec(`update knowledge_chunks set embedding_v2 = '${along(0, 1536)}' where id = 'near'`)
    ).rejects.toThrow(/expected 1024 dimensions/);
  });
});

describe('the daily counter behind the spending cap (bump_study_usage)', () => {
  const bump = (key: string, limit: number) =>
    as<{ ok: boolean }>(db, 'service_role', `select bump_study_usage('${key}', ${limit}) as ok`);

  it('allows up to the limit and refuses after it', async () => {
    expect(await bump('turn:all', 2)).toEqual([{ ok: true }]);
    expect(await bump('turn:all', 2)).toEqual([{ ok: true }]);
    expect(await bump('turn:all', 2)).toEqual([{ ok: false }]);
  });

  it('counts each name on its own, so speech does not use up the turns', async () => {
    expect(await bump('speak:all', 1)).toEqual([{ ok: true }]);
    expect(await bump('turn:visitor-1', 1)).toEqual([{ ok: true }]);
    expect(await bump('turn:visitor-2', 1)).toEqual([{ ok: true }]);
    expect(await bump('turn:visitor-1', 1)).toEqual([{ ok: false }]);
  });

  it('keeps counting past the limit, and starts again the next day', async () => {
    const { rows } = await db.query<{ count: number }>(
      `select count from study_usage where code = 'turn:all'`
    );
    expect(rows).toEqual([{ count: 3 }]);
    await db.exec(`update study_usage set day = day - 1 where code = 'turn:all'`);
    expect(await bump('turn:all', 2)).toEqual([{ ok: true }]);
  });

  it.each(['anon', 'authenticated'])('cannot be called by a visitor (%s)', async (role) => {
    await expect(as(db, role, `select bump_study_usage('turn:all', 1000000)`)).rejects.toThrow(
      /permission denied for function bump_study_usage/
    );
  });
});

describe('who can read and write what', () => {
  const ANA = '11111111-1111-4111-8111-111111111111';
  const BEN = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id) values ('${ANA}'), ('${BEN}');
      insert into conversations (id, user_id, surface) values
        ('aaaaaaaa-0000-4000-8000-000000000001', '${ANA}', 'chat'),
        ('bbbbbbbb-0000-4000-8000-000000000002', '${BEN}', 'chat');
      insert into messages (conversation_id, role, content) values
        ('aaaaaaaa-0000-4000-8000-000000000001', 'user', 'Ana asks'),
        ('bbbbbbbb-0000-4000-8000-000000000002', 'user', 'Ben asks');
      insert into usage_events (user_id, kind, units, model) values
        ('${ANA}', 'chat', 2070, 'claude-opus-5-5'),
        ('${BEN}', 'tts', 21, 'eleven_turbo_v2_5');
    `);
  });

  it('lets anyone read the knowledge base, and nobody but the server write to it', async () => {
    const read = await as<{ n: number }>(
      db,
      'anon',
      `select count(*)::int as n from knowledge_chunks`
    );
    expect(read[0]?.n).toBeGreaterThan(0);
    await expect(
      as(
        db,
        'anon',
        `insert into knowledge_chunks (id, category, title, content) values ('x', 'c', 't', 'y')`
      )
    ).rejects.toThrow(/row-level security/);
    const changed = await as(
      db,
      'anon',
      `update knowledge_chunks set title = 'defaced' returning id`
    );
    expect(changed).toEqual([]);
  });

  it('shows a signed-in visitor their own conversation and messages, and no one else’s', async () => {
    const mine = await as<{ content: string }>(
      db,
      'authenticated',
      `select content from messages`,
      ANA
    );
    expect(mine).toEqual([{ content: 'Ana asks' }]);
    const conversations = await as<{ user_id: string }>(
      db,
      'authenticated',
      `select user_id from conversations`,
      BEN
    );
    expect(conversations).toEqual([{ user_id: BEN }]);
  });

  it('shows a visitor with no session nothing at all', async () => {
    expect(await as(db, 'anon', `select 1 from conversations`)).toEqual([]);
    expect(await as(db, 'anon', `select 1 from messages`)).toEqual([]);
    expect(await as(db, 'anon', `select 1 from usage_events`)).toEqual([]);
  });

  it('keeps the counters out of visitors’ reach entirely', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(as(db, role, `select 1 from study_usage`)).rejects.toThrow(
        /permission denied for table study_usage/
      );
    }
  });

  it('lets a visitor read their own usage, and never write it', async () => {
    const mine = await as<{ kind: string }>(
      db,
      'authenticated',
      `select kind from usage_events`,
      ANA
    );
    expect(mine).toEqual([{ kind: 'chat' }]);
    await expect(
      as(
        db,
        'authenticated',
        `insert into usage_events (user_id, kind, units) values ('${ANA}', 'chat', 1)`,
        ANA
      )
    ).rejects.toThrow(/row-level security/);
  });

  it('accepts the two kinds of usage the server records, and no kind it has not heard of', async () => {
    // The turn endpoint records 'chat' and the speech endpoint 'tts'.
    await expect(
      db.exec(`insert into usage_events (user_id, kind, units) values ('${ANA}', 'turn', 1)`)
    ).rejects.toThrow(/usage_events_kind_check/);
  });
});

describe('the trace of each turn (turn_traces)', () => {
  const finished = (overrides: Partial<TurnSummary> = {}): TurnSummary => ({
    userId: 'user-1',
    request: {
      message: 'How do I manage sundowning?',
      history: [],
      modality: 'text',
      settings: {
        assistantName: 'Aaron',
        responseStyle: 'balanced',
        jargonMode: 'explain',
        personality: 'warm',
        conciseMode: false,
        isCaregiverSetup: true,
      },
    },
    stopReason: 'end_turn',
    errorCode: null,
    usage: {
      model: 'claude-opus-5-5',
      inputTokens: 900,
      outputTokens: 120,
      cacheReadTokens: 1000,
      cacheWriteTokens: 50,
    },
    timings: { retrievalDone: 300, llmSend: 305, firstToken: 1500, streamEnd: 4000, total: 4010 },
    pipelineVersion: 'p-test',
    promptVersion: 'v3-claude-nz',
    model: 'claude-opus-5-5',
    retrieval: { mode: 'fresh', chunks: [{ id: 'kb-1', similarity: 0.71 }], ms: 290 },
    safety: { level: 'none', source: 'triage' },
    cited: ['kb-1'],
    answerChars: 400,
    ...overrides,
  });

  /**
   * Inserts a row the way the server's does: as JSON, each value converted to
   * its column's type, which is what PostgREST does with a posted row.
   */
  async function write(row: TraceRow | Record<string, unknown>, role = 'service_role') {
    const columns = Object.keys(row).join(', ');
    await db.exec(`set role ${role};`);
    try {
      await db.query(
        `insert into public.turn_traces (${columns})
         select ${columns} from jsonb_populate_record(null::public.turn_traces, $1::jsonb)`,
        [JSON.stringify(row)]
      );
    } finally {
      await db.exec('reset role;');
    }
  }

  it('accepts the row the server builds, value for value', async () => {
    const row = toTraceRow(finished());
    await write(row);
    const [stored] = await as<Record<string, unknown>>(
      db,
      'service_role',
      `select * from turn_traces order by id desc limit 1`
    );
    const { id: _id, created_at: _at, ...columns } = stored!;
    expect(columns).toEqual(row);
  });

  it('has a column for everything the server sends, and for nothing else', async () => {
    const columns = await as<{ column_name: string }>(
      db,
      'service_role',
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'turn_traces'`
    );
    expect(columns.map((c) => c.column_name).sort()).toEqual(
      [...Object.keys(toTraceRow(finished())), 'id', 'created_at'].sort()
    );
  });

  it('has nowhere to put a question, an answer or an account', async () => {
    const columns = await as<{ column_name: string; data_type: string }>(
      db,
      'service_role',
      `select column_name, data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'turn_traces'`
    );
    expect(columns.filter((c) => c.data_type === 'uuid')).toEqual([]);
    // Every text column holds a name the system chose, never words a person wrote.
    expect(
      columns
        .filter((c) => c.data_type === 'text')
        .map((c) => c.column_name)
        .sort()
    ).toEqual([
      'error_code',
      'modality',
      'model',
      'pipeline_version',
      'prompt_version',
      'retrieval_mode',
      'safety_level',
      'safety_source',
      'stop_reason',
    ]);
  });

  it('keeps the time to the hour, so a trace cannot be matched to a usage row by its timestamp', async () => {
    const [row] = await as<{ on_the_hour: boolean }>(
      db,
      'service_role',
      `select created_at = date_trunc('hour', created_at) as on_the_hour
       from turn_traces order by id desc limit 1`
    );
    expect(row?.on_the_hour).toBe(true);
  });

  it('accepts a turn that failed before anything was known about it', async () => {
    await write(
      toTraceRow(
        finished({
          stopReason: 'error',
          errorCode: 'internal',
          usage: null,
          timings: null,
          promptVersion: null,
          model: null,
          retrieval: null,
          safety: null,
          cited: [],
          answerChars: null,
        })
      )
    );
  });

  it('refuses a modality it has not heard of, and a negative size or time', async () => {
    const row = toTraceRow(finished());
    await expect(write({ ...row, modality: 'telepathy' })).rejects.toThrow(/check constraint/);
    await expect(write({ ...row, question_chars: -1 })).rejects.toThrow(/check constraint/);
    await expect(write({ ...row, first_token_ms: -5 })).rejects.toThrow(/check constraint/);
    await expect(write({ ...row, output_tokens: -1 })).rejects.toThrow(/check constraint/);
  });

  it('is out of visitors’ reach entirely: no reading, no writing, not through the summary either', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(as(db, role, `select 1 from turn_traces`)).rejects.toThrow(
        /permission denied for table turn_traces/
      );
      await expect(write(toTraceRow(finished()), role)).rejects.toThrow(/permission denied/);
      await expect(as(db, role, `select 1 from turn_traces_daily`)).rejects.toThrow(
        /permission denied/
      );
    }
  });

  it('sums a day: turns, failures, empty searches, waits and tokens', async () => {
    const scratch = await freshDatabase();
    await migrate(scratch);
    const put = async (overrides: Partial<TurnSummary>) => {
      const row = toTraceRow(finished(overrides));
      const columns = Object.keys(row).join(', ');
      await scratch.query(
        `insert into public.turn_traces (${columns})
         select ${columns} from jsonb_populate_record(null::public.turn_traces, $1::jsonb)`,
        [JSON.stringify(row)]
      );
    };
    const waited = (firstToken: number): TurnSummary['timings'] => ({
      firstToken,
      total: firstToken + 2000,
    });
    await put({ timings: waited(1000) });
    await put({ timings: waited(2000) });
    await put({ timings: waited(3000), safety: { level: 'emergency', source: 'keywords' } });
    await put({
      timings: waited(4000),
      retrieval: { mode: 'none', chunks: [], ms: 200 },
      cited: [],
    });
    await put({ stopReason: 'aborted', usage: null, timings: { total: 900 } });
    await put({ stopReason: 'error', errorCode: 'generation_failed', usage: null, timings: null });
    // A spoken turn is its own line.
    await put({ request: { ...finished().request, modality: 'voice' }, timings: waited(800) });

    const { rows } = await scratch.query<Record<string, unknown>>(
      `select * from turn_traces_daily order by modality`
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      modality: 'text',
      model: 'claude-opus-5-5',
      pipeline_version: 'p-test',
      turns: 6,
      failed: 1,
      interrupted: 1,
      without_passages: 1,
      emergencies: 1,
      // Of the four that reached a first word: 1, 2, 3 and 4 seconds.
      first_token_p50_ms: 2500,
      first_token_p95_ms: 3850,
      // Four answered turns' tokens; the two that did not answer add none.
      input_tokens: 3600,
      output_tokens: 480,
      cache_read_tokens: 4000,
      cache_write_tokens: 200,
    });
    expect(rows[1]).toMatchObject({ modality: 'voice', turns: 1, first_token_p50_ms: 800 });
    await scratch.close();
  }, 120_000);
});

describe('the day’s budget in dollars (spend_reserve, spend_settle)', () => {
  let ledger: PGlite;
  const today = async () =>
    (await ledger.query<{ day: string }>(`select (now() at time zone 'utc')::date::text as day`))
      .rows[0]!.day;
  const reserve = async (micros: number, limit: number) =>
    (
      await ledger.query<{ day: string | null }>(`select spend_reserve($1, $2)::text as day`, [
        micros,
        limit,
      ])
    ).rows[0]!.day;
  const settle = (day: string, reserved: number, spent: number) =>
    ledger.query(`select spend_settle($1::date, $2, $3)`, [day, reserved, spent]);
  const row = async () =>
    (
      await ledger.query<{ reserved: number; spent: number }>(
        `select reserved_micros::int as reserved, spent_micros::int as spent from daily_spend`
      )
    ).rows[0];

  beforeAll(async () => {
    ledger = await freshDatabase();
    await migrate(ledger);
  }, 120_000);

  afterAll(async () => {
    await ledger.close();
  });

  it('sets money aside, and answers with the day it was set aside under', async () => {
    expect(await reserve(400_000, 1_000_000)).toBe(await today());
    expect(await row()).toEqual({ reserved: 400_000, spent: 0 });
  });

  it('counts what is already set aside: a second turn fits, a third does not', async () => {
    expect(await reserve(400_000, 1_000_000)).toBe(await today());
    // 800,000 is set aside; another 400,000 would pass the million.
    expect(await reserve(400_000, 1_000_000)).toBeNull();
    // A refusal changes nothing.
    expect(await row()).toEqual({ reserved: 800_000, spent: 0 });
    // Exactly reaching the limit is allowed.
    expect(await reserve(200_000, 1_000_000)).toBe(await today());
    expect(await row()).toEqual({ reserved: 1_000_000, spent: 0 });
  });

  it('settling replaces what was set aside with what was spent, and makes room again', async () => {
    await settle(await today(), 400_000, 41_200);
    expect(await row()).toEqual({ reserved: 600_000, spent: 41_200 });
    expect(await reserve(350_000, 1_000_000)).toBe(await today());
    expect(await row()).toEqual({ reserved: 950_000, spent: 41_200 });
  });

  it('records spending above the reservation as it is, and then refuses more', async () => {
    await settle(await today(), 950_000, 990_000);
    expect(await row()).toEqual({ reserved: 0, spent: 1_031_200 });
    expect(await reserve(1, 1_000_000)).toBeNull();
    // A higher limit lets the day go on.
    expect(await reserve(1, 2_000_000)).toBe(await today());
    await settle(await today(), 1, 0);
  });

  it('never lets what is set aside go below nothing', async () => {
    await settle(await today(), 5_000_000, 0);
    expect((await row())?.reserved).toBe(0);
  });

  it('settles under the day the money was set aside, not the day it ends', async () => {
    await ledger.exec(
      `insert into daily_spend (day, reserved_micros) values ('2026-01-01', 300000)`
    );
    await settle('2026-01-01', 300_000, 20_000);
    const { rows } = await ledger.query<{ reserved: number; spent: number }>(
      `select reserved_micros::int as reserved, spent_micros::int as spent
       from daily_spend where day = '2026-01-01'`
    );
    expect(rows[0]).toEqual({ reserved: 0, spent: 20_000 });
    // Today's row is untouched by it.
    expect((await row())?.spent).toBeGreaterThan(1_000_000);
  });

  it('refuses negative amounts, which would create budget out of nothing', async () => {
    await expect(reserve(-1, 1_000_000)).rejects.toThrow(/cannot be negative/);
    await expect(settle(await today(), -1, 0)).rejects.toThrow(/cannot be negative/);
    await expect(settle(await today(), 0, -1)).rejects.toThrow(/cannot be negative/);
  });

  it('is what the server calls: the named arguments it sends are accepted', async () => {
    const [made] = await as<{ day: string | null }>(
      ledger,
      'service_role',
      `select spend_reserve(p_micros => 1, p_limit_micros => 9000000)::text as day`
    );
    expect(made?.day).toBe(await today());
    await as(
      ledger,
      'service_role',
      `select spend_settle(p_day => '${made!.day}', p_reserved_micros => 1, p_spent_micros => 0)`
    );
  });

  it('is out of visitors’ reach entirely: not the table, and neither function', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(as(ledger, role, `select 1 from daily_spend`)).rejects.toThrow(
        /permission denied for table daily_spend/
      );
      await expect(as(ledger, role, `select spend_reserve(1, 1000000)`)).rejects.toThrow(
        /permission denied for function spend_reserve/
      );
      await expect(
        as(ledger, role, `select spend_settle(current_date, 1000000, 0)`)
      ).rejects.toThrow(/permission denied for function spend_settle/);
    }
  });
});
