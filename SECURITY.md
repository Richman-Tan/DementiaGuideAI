# Security Policy

## Reporting a vulnerability

**Do not open a public issue.** Report privately through
[GitHub Security Advisories](https://github.com/Richman-Tan/DementiaGuideAI/security/advisories/new),
which lets us discuss and fix the problem before any detail is public.

Please include what you were able to do, how to reproduce it, and which surface
it affects. You can expect an acknowledgement within a week.

## What is in scope

This project is a research prototype, not a production service, and its threat
model reflects that. The areas most worth reporting:

- **Credential handling.** Both clients hold third-party API keys themselves —
  `localStorage` under `dg_keys` on web, on-device storage on mobile — and call
  OpenAI and ElevenLabs directly. Anything that leaks those keys, or that would
  let one user's key be used by another, is in scope.
- **The Supabase anon key and row-level security.** The anon key is public by
  design; the protection is RLS. Any read or write it grants beyond published
  knowledge-base content is in scope.
- **Content Security Policy.** `apps/web/vercel.json` sets the CSP and
  `apps/web/tests/csp.test.js` keeps its inline-script hash in sync. A bypass, or
  a way to get script execution past it, is in scope.
- **Prompt injection that defeats grounding.** The assistant must answer only
  from retrieved passages and cite them. Input that makes it answer from model
  memory, fabricate a citation, or ignore the safety instructions is a genuine
  finding for this project — the grounding _is_ the safety mechanism.
- Dependency vulnerabilities that are actually reachable from application code.

## What is out of scope

- Missing hardening on a locally-run dev server.
- Anything that requires an attacker to already control the user's device or
  their own browser storage.
- Reports produced only by an automated scanner, with no demonstrated impact.
- The absence of user accounts or server-side metering. This is known and
  deliberate for now — see `docs/architecture/backend-plan.md`, which describes
  moving credentials server-side as planned work.

## A note on medical safety

This is not a medical device and gives general information only. If you find the
assistant giving unsafe care guidance — telling someone to stop a medication,
missing an emergency escalation, or citing a source that does not support the
claim — please report it. Use a normal
[bug report](https://github.com/Richman-Tan/DementiaGuideAI/issues/new?template=bug_report.yml)
unless it involves a credential or data leak, in which case use the private
advisory link above.
