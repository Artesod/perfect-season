# Roadmap & Task Tracking

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## Phase 0 — Project foundation

- [x] Create base folder structure and planning docs
- [~] `git init`, first commit — still todo: create GitHub repo and push
- [x] Scaffold Vite + React + TypeScript app in `apps/web`
- [x] Set up monorepo tooling (npm workspaces) so `apps/web` can import `packages/shared` and `packages/sim`
- [x] Linting/formatting (oxlint + Prettier — Vite template ships oxlint now) and Vitest as test runner
- [x] CI workflow: lint + typecheck + test + build on every push (`.github/workflows/ci.yml`)
- [x] Deploy workflow: pushing a `v*` tag deploys `apps/web` to GitHub Pages (`.github/workflows/deploy.yml`) — requires one-time repo setting: Settings → Pages → Source → "GitHub Actions"
- [x] Decide simulation language: **TypeScript** (shares types with frontend, can run client-side in a Web Worker for instant sims, no separate backend needed early). Python only if we later want heavy stats/ML tooling.

## Phase 1 — Core data & simulation engine (`packages/sim`, `packages/shared`)

- [x] Define core types: `Player`, `Team`, `GameResult`, `RunState`, `Contract`, `SeasonState`, `SeasonEvent`, `ChemistryEffect` in `packages/shared`
- [x] Player source: procedurally generated players (`packages/sim/src/league.ts`) — seeded generator for players, rosters, and the 29-team CPU league. Real NBA data can augment/replace it later behind the same interfaces.
- [x] Real NBA player mode: rosters + 2K ratings + headshot URLs scraped from 2kratings.com, plus last season's per-game stats (PPG/RPG/APG/etc.) name-matched from Basketball-Reference's league per-game page, into `data/nba-players.json`; stats surface in a per-player info modal (`PlayerInfoModal`) and are display-only — the stats scrape failing never blocks a roster refresh (`scripts/fetch-nba-data.ts`, refreshed weekly by `.github/workflows/refresh-data.yml`); `createRun(seed, ascension, dataset)` builds the CPU league from real players (`packages/sim/src/realPlayers.ts`) — salary (rank-mapped)/pWAR/traits derived from ratings, toggleable on the home screen. Headshots are hot-linked with `referrerPolicy="no-referrer"` (the CDN 403s foreign referers) and fall back to a generic gray avatar (`PlayerAvatar`)
- [~] Player rating model — overall → salary and overall → pWAR curves exist; refine once chemistry/traits feed in
- [x] Game simulation v1: team-strength model (ratings + home court + variance) → win probability → result (`packages/sim/src/game.ts`)
- [x] Season simulation: 82-game schedule against 29 CPU teams (`packages/sim/src/season.ts`) — perfect-season mode stops at first loss
- [ ] Playoff simulation: bracket, best-of-7 series — note: the run loop currently marks 82-0 as 'won'; switch to a 'playoffs' phase when this lands
- [~] Projected Wins Above Replacement (pWAR) calculation for roster-building guidance — v1 derived from overall
- [x] Deterministic seeded RNG (replayable/sharable runs) — mulberry32 in `packages/shared/src/rng.ts`
- [~] Unit tests for sim engine — game sim, league generation, and season sim covered; grow alongside new sim features

## Phase 2 — Roster building (draft / free agency / salary cap)

- [x] Salary cap model: $155M cap, cap math + dead cap support (`packages/sim/src/cap.ts`, constants in `packages/shared/src/constants.ts`)
- [x] Team-roll draft (82-0 style): each of 15 rounds rolls a random league team and you pick one of its players — rounds 1–10 demand each position twice, rounds 11–15 are flex; 2 reroll tokens per draft plus a free reroll whenever the rolled team has no legal pick (`packages/sim/src/draft.ts`)
- [x] Cap feasibility guard: a pick is blocked if it would make the roster impossible to finish under the cap; drafted players leave their CPU teams at season start (seeded fill-ins keep rosters at rotation depth)
- [x] Free agency: seeded FA pool (no superstars), sign with cap/roster checks, waive with 50% dead-cap penalty (`packages/sim/src/freeAgency.ts`)
- [x] Roster validation rules: exactly 15 players, min 2 per position, cap compliance, no duplicates (`validateRoster` in `cap.ts`)
- [x] Wire draft/free agency into `RunState` transitions (drafting → in-season) — done in `packages/sim/src/run.ts` (Phase 3 run loop)

## Phase 3 — Roguelike systems

- [x] Chemistry system: trait-based synergies/anti-synergies (floor general, inside-out, defensive anchor, too-many-cooks, no-spacing, …) feeding team strength (`packages/sim/src/chemistry.ts`)
- [x] RNG event engine: seeded between-game rolls with difficulty scaling (`packages/sim/src/events.ts`)
  - [x] Injuries (minor/moderate/severe tiers, 1-40 games missed, players sit until healed)
  - [x] Hot streaks / slumps (temporary rating deltas that tick down per game)
  - [x] Morale/locker-room events: authored cards fire as `pendingCard`, block the next game until the player chooses
- [~] AI-authored content pipeline (design-time only — see decisions log)
  - [x] Event-card content schema in `packages/shared` (`EventCard`, choices, typed effects)
  - [~] Event-card pool in `data/event-cards.json` — 12 starter cards authored; grow the pool with AI generation as the event system matures
  - [ ] Human review/curation pass on generated content before it ships (tone, balance, duplicates)
  - [x] Validation: `validateEventCards` + content test guarding every card in `data/` (schema, unique ids, choices must differ)
- [x] Run structure: full run loop `createRun` → draft → season → won/lost as pure `RunState` transitions with per-stream derived seeds (`packages/sim/src/run.ts`); meta-progression with badges + ascension unlocks (`packages/sim/src/meta.ts`)
- [x] Difficulty modifiers: 6 ascension levels scaling CPU strength, event rates, and cap squeeze (`packages/sim/src/difficulty.ts`)
- [x] Loss condition: configurable lives (1 at every ascension for now), run ends at 0

## Phase 4 — Frontend (`apps/web`)

- [x] App shell, routing, state management — Zustand store wrapping sim transitions (`apps/web/src/store.ts`), screens switch on `run.status` (no router); meta-progression persisted to localStorage
- [x] Draft screen: team-roll flow (round/slot header, rolled-team roster, reroll button, slot progress strip), cap sheet, roster board, chemistry readout, start-season gate
- [x] Season dashboard: schedule strip, record, next opponent with win probability, power rankings (by strength — CPU teams don't play each other yet), free agency drawer, event log
- [x] Game result screen: last-game panel with score + events (team-level summary; per-player box scores need sim support first)
- [x] Event/decision modals: injuries/streaks in the event log, event cards as a blocking modal (`EventCardModal`)
- [x] Run summary screen (win/loss banner, run stats, new badges, seed sharing)
- [x] Visual design pass: dark hardwood theme via CSS variables in `index.css`, per-screen stylesheets, no UI framework

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
- AI "beat reporter" post-game recaps — live LLM flavor layer, purely cosmetic (never affects outcomes), opt-in since it needs network/API key

## Decisions log

| Date       | Decision                                          | Rationale                                                                                                                                                                    |
| ---------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-01 | Monorepo: `apps/` + `packages/` + `db/` + `data/` | Keeps sim engine separate from UI, shareable types                                                                                                                           |
| 2026-07-01 | Sim language: TypeScript                          | Shared types with frontend, runs client-side                                                                                                                                 |
| 2026-07-01 | Lint: oxlint (not ESLint)                         | Ships with the Vite template, fast, zero config                                                                                                                              |
| 2026-07-01 | Hosting: GitHub Pages via tag-triggered Action    | Free, zero setup beyond one repo setting                                                                                                                                     |
| 2026-07-03 | Players: procedurally generated (seeded)          | No licensing risk, fits roguelike pools; real data can augment later                                                                                                         |
| 2026-07-03 | Salary cap: $155M flat cap, 50% dead cap on waive | NBA-ish number; tight enough that 3 max contracts is infeasible, forcing stars-vs-depth trade-offs. Dead cap makes roster churn costly.                                      |
| 2026-07-03 | RNG: per-stream derived seeds (`deriveSeed`)      | Each subsystem (league, draft, each game, each event roll) gets its own seed derived from run seed + stream id, so saves/loads and UI call patterns can't desync a replay.   |
| 2026-07-03 | AI/LLMs: design-time content only, not runtime    | Runtime LLM calls would break seeded determinism, offline play, and zero-backend hosting. Use AI to author event cards/flavor text into `data/`; engine stays deterministic. |
| 2026-07-07 | Frontend: Zustand + status-driven screens         | The game is one linear flow (home → draft → season → summary) driven by `run.status`, so a router adds nothing; one store holds `RunState` + persisted `MetaProgress`.       |
| 2026-07-07 | Real player data: 2kratings.com, design-time only | Only free source with a ready quality rating per player. Scraped into `data/` and bundled at build; no runtime fetches, so seeds stay deterministic and hosting stays static. |
| 2026-07-07 | Data refresh: weekly scheduled GitHub Action      | "Latest rosters over time" without a backend: the Action re-scrapes, validates (min teams/players + sim schema tests), and commits. A refresh changes what a seed produces; the dataset date is shown in the UI. |
| 2026-07-08 | Draft: team-roll (82-0 style), no undo            | More run-to-run variance than a flat pool: you draft whoever the rolled team offers. Position slots (each ×2, then 5 flex) keep 15 picks legal by construction; 2 reroll tokens + free reroll on dead offers prevent soft-locks. Rolls are seed-indexed so replays match. |
|            | Database: TBD (SQLite/Postgres)                   | Not needed until leaderboards/accounts                                                                                                                                       |
