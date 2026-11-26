# @dementiaguide/admin — knowledge-base intake tool

Lets a non-engineer submit a PDF, a URL, or pasted text to the knowledge base
— chunked, tagged, titled, and embedded the same way
`scripts/ingest/ingest.mjs` does for the CLI path — without running that
script or holding an OpenAI/service-role key. See
`scripts/ingest/pipeline.js` for the shared pipeline both use.

Submissions are never instantly live: every one lands in `knowledge_chunks`
with `review_status = 'pending'`, and `match_chunks` only returns
`'approved'` rows (`scripts/migrations/2026-10-07_review_status.sql`). A
reviewer has to look at it and approve it before it can be cited in chat.

## Adding a new admin

There's no sign-up screen on purpose — only pre-created Supabase Auth users
can sign in, and only ones whose email is on the server-side allowlist.

1. **Create the Supabase Auth user**: [Dashboard → Authentication →
   Users](https://supabase.com/dashboard/project/jxfzuzgwaomvpvobcyri/auth/users)
   → **Add user** → **Create new user** → their email + a password (the
   dashboard requires one; it's what they'll actually log in with — share it
   with them out of band). Toggle **Auto Confirm User** on.
2. **Allowlist their email**: add it to `ADMIN_ALLOWED_EMAILS` (comma-separated)
   in the `apps/api` Vercel project's env vars, then redeploy `apps/api` —
   being a valid Supabase login is not enough on its own, `apps/api/api/_lib/adminGuard.js`
   checks this list server-side on every request.

To remove someone's access: delete their email from `ADMIN_ALLOWED_EMAILS`
and redeploy `apps/api` (their Supabase login still works, but the server
will reject every request). Deleting the Supabase user too is optional.

## Signing in

Open the deployed URL (https://dementiaguide-admin.vercel.app) and sign in with the email + password from above.
Auth is `supabase.auth.signInWithPassword` — see `src/lib/useAuth.js`.

## Seeing how the assistant is used

The **Usage** tab shows what the live assistant has been doing over the last
7 to 90 days: turns a day, how many failed or were interrupted, how often the
search found no passage, how many were emergencies, how long people waited for
the first word (median and 95th percentile), and an estimated cost. If a daily
budget is set (`DAILY_BUDGET_USD` on `apps/api`), it also shows how much of
today's is spent.

It reads the daily summary of the turn traces through `GET /api/admin-usage`,
behind the same sign-in and allowlist as everything else here. A trace holds
what the system did on a turn and never what was said, so nothing on this page
is anyone's question or answer. Costs are tokens at list prices: an estimate,
not the provider's bill, and speech is not included.

It needs `scripts/migrations/2026-11-27_turn_traces.sql` to have been run, and
says so if it has not. Until the server's answering endpoint is switched on
there are no turns to show.

## Submitting a resource

Pick a source type (PDF upload / website URL / pasted text), fill in the
title and category (required), and the provenance fields (source
organisation, citation link, licence, country — all optional but worth
filling in when known, since they're shown as the citation in chat). Submit.

A result panel shows the chunk count and `document_id` on success. PDFs are
capped at roughly 3MB (see `apps/api/api/admin/ingest.js` for why) — bigger
documents still need the `registry.js` + CLI path.

## Reviewing and approving submissions

There's no review UI by design — it's the Supabase table editor:

1. Open [`knowledge_chunks`](https://supabase.com/dashboard/project/jxfzuzgwaomvpvobcyri/editor)
   and filter `review_status` = `pending`.
2. Read the `content`/`display_title`/`category` for each row (all rows from
   one submission share a `document_id`, so you can filter/select by that too).
3. Looks right → set `review_status` to `approved`. Looks wrong → `rejected`,
   or just delete the row.

Nothing else needs to happen — `match_chunks` picks up `approved` rows on
the next query, no redeploy or cache to clear.

## Checking things via SQL

Useful queries in the SQL editor:

```sql
-- everything pending review
select id, document_id, title, category, created_at
from knowledge_chunks where review_status = 'pending' order by created_at desc;

-- confirm a specific chunk is (or isn't) actually retrievable
select id, display_title, round(similarity::numeric, 4) as similarity
from match_chunks(
  (select embedding from knowledge_chunks where id = '<chunk id>'),
  '<a query it should match>', 10, 0.0
) order by similarity desc;
```

## Local development

```bash
cp .env.example .env        # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_API_BASE_URL
npm run admin                # from the repo root — starts this app on :5173
```

`apps/api` needs to be running too (it has no dev-time Vite middleware like
`apps/web` does — see `vite.config.js`'s header comment for why): from
`apps/api`, `npx vercel dev` (needs `vercel login` + `vercel link` once).

## Deployment

Own Vercel project (`dementiaguide-admin`), separate from `apps/web` and
`apps/mobile` so neither gains any weight from this tool — same reasoning
`apps/api/README.md` gives for why that's its own project too.

```bash
vercel build --prod --yes
vercel deploy --prebuilt --prod --yes
```

Needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` set
as env vars on the Vercel project. `apps/api`'s `ALLOWED_ORIGINS` needs this
app's deployed origin added (CORS), and Supabase's [Auth → URL
Configuration](https://supabase.com/dashboard/project/jxfzuzgwaomvpvobcyri/auth/url-configuration)
needs it added to **Redirect URLs**.

**If sign-in silently does nothing** (no request, no error, nothing in
Supabase's auth logs): check `vercel.json`'s CSP `connect-src` actually
allows `https://*.supabase.co`. This app talks to Supabase directly from the
browser for auth — if that's missing, every auth call is refused by the
browser before it ever leaves, and it looks exactly like "the login is
broken" with no obvious cause. (This happened once; see the
`fix(admin): allow the Supabase domain in the CSP's connect-src` commit.)
