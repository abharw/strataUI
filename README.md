# StrataUI

**A dynamic UI framework for personal agents, built for [Instinct](https://instinct.com), the viral personal assistant.** (The code calls it Strata.)

Instead of replying with a wall of text, the agent writes one constrained JSON spec. StrataUI validates it against a closed catalog of 27 components and renders it as a phone-first page that stays current as the agent keeps working: a trip itinerary, an apartment shortlist, an interview pipeline, a training plan. No agent-authored HTML, CSS or JavaScript ever crosses the wire.

## How it works

- **Closed component catalog.** The agent chooses blocks by the shape of its data: metrics, timelines, tables, checklists, approvals and more. Every block has a Zod schema, and the agent reads a generated manifest of them (`apps/web/src/page-content/`).
- **Safe, incremental writes.** Pages are versioned. Edits are small RFC 6902 patches against a `base_version`, so concurrent or retried writes can't silently overwrite each other.
- **Agent-native REST API.** An agent discovers everything from `/llms.txt`, connects with a one-time email code the person reads back to it, and gets errors written as instructions. The API is described by the OpenAPI document at `/openapi.json`.
- **Pages that outlive the task.** Pages live in named Spaces, carry their own provenance and update cadence, and are private until explicitly shared by link.
- **Composition evals.** Deterministic scorers check whether a spec actually *represents* its source material instead of pouring text into cards: role choice, fact retention, unjustified widgets. `pnpm eval:composition --golden` scores the hand-authored reference pages (18 briefs); `pnpm eval:composition --input candidates.json` scores any model's output (`apps/web/evals/composition/`).

## Run it

Requires Node 22 and pnpm 11 (`corepack enable`).

```sh
pnpm install
pnpm test:unit    # renderer, catalog, API and eval suites; no database needed
pnpm dev          # then open http://localhost:3000/dev/fixtures
```

The full app (accounts, persistence, sharing) needs Postgres and WorkOS. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill it in. Database connections require TLS (`sslmode=verify-full`); `.github/workflows/ci.yml` shows how to run the full suite, `pnpm test`, against a local Postgres.

## Layout

- `apps/web`: Next.js renderer, REST API, database schema and owner/reader surfaces
- `apps/mobile`: Expo shell that opens the same web renderer

Published as a single-commit snapshot of the private Strata repository's `main` branch (326 commits, August 21 – September 12, 2026).

Built by [Arav Bhardwaj](https://github.com/abharw) at [Basic Software](https://basicsoftware.ai). © 2026 Basic Software, Inc. Published with Basic Software's permission, for reference; no license is granted.
