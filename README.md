https://github.com/user-attachments/assets/6a495b13-e0e4-44df-ba65-ab9a53d1803b


# StrataUI

**A dynamic UI framework for personal agents, built for [Instinct](https://instinct.com), the viral personal assistant.**

## Why

I’ve always been interested in building better interfaces for technology. For agents, that means getting past the wall of text. As people use agents for increasingly important and varied tasks, we need to keep pushing the UX frontier. I built this for text-based personal assistants: the agent writes a JSON spec, which is validated against a small set of tasteful, designed components and rendered as a page. I’ve used it for meal prep, travel bookings, and tracking long-term fitness goals.

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

Built by Arav Bhardwaj at [Basic Software](https://basicsoftware.ai).
