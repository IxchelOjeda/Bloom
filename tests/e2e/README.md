# End-to-end tests (real app, real schema)

These run the **actual app** (Expo web build) in Chromium against the **real migrations** on
Postgres, with Row Level Security, grants and triggers enforced exactly as on Supabase.

`gateway.mjs` is a small **test-only** server that speaks the subset of the Supabase HTTP API
the app uses (GoTrue `/auth/v1`, PostgREST `/rest/v1`). Every REST request runs in its own
transaction as the `authenticated` role with the JWT's `sub`, and results are serialized with
Postgres' own JSON encoding (like PostgREST). It exists because the hosted Supabase Docker images
are not reachable from every CI/sandbox. It is never shipped and never used in production.

Not emulated: Edge Functions that need Deno + secrets (life-planner, recipe-ai, food-search
return 503, and the app shows its "unavailable" fallback), Storage (uploads are phone-only).
`delete-account` is mirrored (deletes the auth user; FKs cascade).

```bash
# 1. Postgres 15+ running locally
export PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres
npm run test:e2e:setup          # fresh orchid_e2e DB: Supabase stub + all migrations
npm run test:e2e:gateway &      # http://localhost:54321
npm run test:e2e:web &          # Expo web on http://localhost:8081
npm run test:e2e                # protocol smoke test + full UI flow (SHOTS=/tmp/shots for screenshots)
node tests/e2e/flow.cjs money   # run one step (plus sign-up)
```

What the flow covers (each step asserts the **persisted database state**, not just the UI):
sign-up → onboarding → Today · goal + multi-category task → completing it moves goal progress ·
energy / water / rest day (no duplicate) / minimum day / timeline event · brain dump → task & note ·
account → expense lowers balance · debt payment lowers remaining · savings contribution moves money ·
bill "mark paid" advances the due date · manual food (labelled estimate) + searching own foods ·
medication taken & habit checked from Today · theme change persists and restyles screens ·
offline edits apply instantly, show a banner, and sync exactly once on reconnect ·
log out / log in keeps data · every route deep-links without redirect or error · account deletion
removes every row.
