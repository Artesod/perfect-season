# Architecture

## Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | Vite + React + TypeScript | `apps/web` |
| Simulation | TypeScript (recommended) | `packages/sim` — see rationale below |
| Shared types | TypeScript | `packages/shared` — used by web, sim, and (later) API |
| Database | SQL, TBD (SQLite → Postgres) | Not needed until leaderboards/accounts; runs persist in browser first |
| Hosting | TBD (Vercel / Netlify / Cloudflare Pages) | Must support tag-triggered deploys |
| CI/CD | GitHub Actions | Build+test on push; deploy on tag |

### Why TypeScript for the sim (recommendation)

- Shares `Player`/`Team`/`GameResult` types directly with the frontend — no serialization drift.
- Can run entirely client-side in a Web Worker: instant simulation, no server costs, works offline.
- One toolchain, one language for the whole repo.
- Python would only pay off for heavy statistical modeling / ML on real NBA data — if that happens, it can live in a separate `tools/` pipeline that produces static datasets in `data/`, while the game sim stays in TS.

## Repo layout

```
basketball/
├── apps/
│   └── web/            # Vite + React game client
├── packages/
│   ├── shared/         # Types, constants, seeded RNG utils
│   └── sim/            # Pure simulation engine (no UI deps)
├── db/                 # SQL schema, migrations, seeds (later phase)
├── data/               # Player datasets (raw + processed)
├── docs/               # This documentation
└── .github/workflows/  # ci.yml, deploy.yml
```

Monorepo via npm/pnpm workspaces. `packages/sim` must stay pure (deterministic, no DOM/network) so it's testable and portable to a server later.

## Simulation architecture

- **Deterministic & seeded**: every run has a seed; same seed + same choices = same outcomes. Enables replays, shareable runs, and reliable tests.
- **Pure functions over game state**: `simulateGame(state, rng) → GameResult`, `applyEvent(state, event) → state`. UI is just a renderer of state + a dispatcher of choices.
- **Runs in a Web Worker** so 82-game batch sims never block the UI.

## Data model (early sketch)

- `Player`: id, name, position, ratings (off/def/etc.), salary, pWAR, tags (playstyle traits for chemistry)
- `Contract`: playerId, salary, years
- `RosterSlot`: player, role, health status
- `RunState`: seed, roster, cap sheet, schedule, record, active modifiers, event log
- `GameResult`: opponent, score, win prob, key performers, events fired

## Persistence strategy

1. **Phase 1**: localStorage/IndexedDB — full run state saved client-side. Zero backend.
2. **Phase 2**: SQL database + thin API for leaderboards and cross-device saves. Schema lives in `db/` from the start so it evolves with the types.

## Deployment (incremental builds)

- Every push to `main`: CI runs typecheck, lint, tests, build.
- Pushing a tag `v*` triggers the deploy workflow → builds `apps/web` → deploys to the live site.
- Version displayed in-app footer from the tag, so it's obvious what's live.
