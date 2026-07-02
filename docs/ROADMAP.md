# Roadmap & Task Tracking

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## Phase 0 — Project foundation

- [x] Create base folder structure and planning docs
- [ ] `git init`, first commit, push to remote (GitHub)
- [ ] Scaffold Vite + React + TypeScript app in `apps/web`
- [ ] Set up monorepo tooling (npm/pnpm workspaces) so `apps/web` can import `packages/shared` and `packages/sim`
- [ ] Linting/formatting (ESLint + Prettier) and a basic test runner (Vitest)
- [ ] CI workflow: build + test on every push
- [ ] Deploy workflow: pushing a git tag (e.g. `v0.1.0`) deploys to live site (Vercel/Netlify/Cloudflare Pages — pick one)
- [ ] Decide simulation language: **TypeScript recommended** (shares types with frontend, can run client-side in a Web Worker for instant sims, no separate backend needed early). Python only if we later want heavy stats/ML tooling.

## Phase 1 — Core data & simulation engine (`packages/sim`, `packages/shared`)

- [ ] Define core types: `Player`, `Team`, `Contract`, `GameResult`, `SeasonState`, `RunState`
- [ ] Source player dataset (real NBA stats or generated players) into `data/`
- [ ] Player rating model — derive a per-player value (e.g. simplified BPM/WAR-style rating) from stats
- [ ] Game simulation v1: team-strength model (ratings + home court + variance) → win probability → result
- [ ] Season simulation: 82-game schedule against 29 CPU teams
- [ ] Playoff simulation: bracket, best-of-7 series
- [ ] Projected Wins Above Replacement (pWAR) calculation for roster-building guidance
- [ ] Deterministic seeded RNG (replayable/sharable runs)
- [ ] Unit tests for sim engine (distributions sanity checks, edge cases)

## Phase 2 — Roster building (draft / free agency / salary cap)

- [ ] Salary cap model (cap number, contract values per player)
- [ ] Draft pool generation: randomized pool of players per run (the roguelike "shop")
- [ ] Draft flow: build a 15-man roster under the cap
- [ ] Free agency between milestones (mid-season signings, replacing injured players)
- [ ] Roster validation rules (positions, minimum roster size, cap compliance)

## Phase 3 — Roguelike systems

- [ ] Chemistry system: dynamic synergies/anti-synergies between teammates (playstyle fit, position overlap, star ego, etc.)
- [ ] RNG event engine: framework for random events between/during games
  - [ ] Injuries (severity, games missed)
  - [ ] Hot streaks / career-high performances
  - [ ] Morale/locker-room events with choices (event cards)
- [ ] Run structure: meta-progression across runs (unlocks, badges, harder modifiers)
- [ ] Difficulty modifiers / ascension-style levels
- [ ] Loss condition: one loss ends the run (or configurable "lives")

## Phase 4 — Frontend (`apps/web`)

- [ ] App shell, routing, state management (Zustand or similar)
- [ ] Draft screen: player pool, cap sheet, roster board
- [ ] Season dashboard: schedule, record, standings, next opponent
- [ ] Game result screen: box-score-style summary, key events
- [ ] Event/decision modals (injury news, event cards)
- [ ] Run summary screen (win/loss, stats, seed sharing)
- [ ] Visual design pass: theme, typography, polish

## Phase 5 — Persistence & backend

- [ ] Decide persistence strategy: start with localStorage/IndexedDB for runs; add SQL database when accounts/leaderboards are needed
- [ ] SQL schema in `db/`: players, runs, run_events, leaderboard
- [ ] Backend/API layer (only if/when needed — e.g. Hono/Express or serverless functions)
- [ ] Leaderboards (best runs, fewest losses, hardest modifiers)
- [ ] User accounts (optional, late)

## Ideas backlog (unscoped)

- Trades with CPU teams
- Coach/scheme selection affecting team style
- In-game decision points (timeouts, rotations) for close games
- Historical player pools (draft from the 90s, etc.)
- Daily challenge seed shared by all players

## Decisions log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-07-01 | Monorepo: `apps/` + `packages/` + `db/` + `data/` | Keeps sim engine separate from UI, shareable types |
| | Sim language: TBD (TS recommended) | See Phase 0 |
| | Database: TBD (SQLite/Postgres) | Not needed until leaderboards/accounts |
| | Hosting: TBD | Needs tag-based deploy support |
