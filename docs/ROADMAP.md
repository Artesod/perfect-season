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
- [x] Team-roll draft (82-0 style): each of 15 rounds rolls a random league team and you pick any of its players — position minimums (2 per position) are enforced by a feasibility guard (a pick is blocked if too few rounds remain to cover the positions still short) instead of a fixed slot order; 2 reroll tokens per draft plus a free reroll whenever the rolled team has no legal pick (`packages/sim/src/draft.ts`)
- [x] Cap feasibility guard: a pick is blocked if it would make the roster impossible to finish under the cap; drafted players leave their CPU teams at season start (seeded fill-ins keep rosters at rotation depth)
- [x] Free agency: seeded FA pool (no superstars), sign with cap/roster checks, waive with 50% dead-cap penalty (`packages/sim/src/freeAgency.ts`)
- [x] Roster validation rules: exactly 15 players, min 2 per position, cap compliance, no duplicates (`validateRoster` in `cap.ts`)
- [x] Wire draft/free agency into `RunState` transitions (drafting → in-season) — done in `packages/sim/src/run.ts` (Phase 3 run loop)

## Phase 3 — Roguelike systems

- [x] Chemistry system: trait-based synergies/anti-synergies (floor general, inside-out, defensive anchor, lob threat, switchable wings, bench mob, too-many-cooks, no-spacing, one-way team, clogged paint, …) feeding team strength (`packages/sim/src/chemistry.ts`)
- [x] Chemistry arc: season-long `cohesion` scalar (0-1) on `SeasonState` — grows with games (wins faster), drops 20% per FA signing, jumps via card effects. Rules are typed `synergy` (deepen up to +25% as the team gels), `friction` (fade with cohesion; too-many-cooks floors at −3 and flips into "Pecking order established" +1 at 90% cohesion), or `structural` (persist until roster moves). CPU teams play at fixed 0.75 cohesion
- [x] Deep traits from the full 2K attribute sheet (~20 ratings scraped per player): margin-ranked archetypes (max 3) plus at most one event-linked trait (`iron-man`, `injury-prone`, `hot-head`); `ball-dominant` gated on ball-handle + overall + foul-drawing so off-ball stars and pass-first guards escape it — calibrated with `scripts/trait-audit.ts` (7% of the all-time pool, name-checked)
- [x] RNG event engine: seeded between-game rolls with difficulty scaling (`packages/sim/src/events.ts`)
  - [x] Injuries (minor/moderate/severe tiers, 1-40 games missed, players sit until healed) — targets weighted by durability traits (injury-prone 2x, iron-man 0.5x)
  - [x] Hot streaks / slumps (temporary rating deltas that tick down per game)
  - [x] Illness (1-2 games out), suspensions (1 game, hot-heads 3x likely), revenge games (+2 for one game when a drafted player faces his origin team, 25% chance)
  - [x] Nagging injuries: blocking play-hurt (−3 for 5-8 games) vs sit (2-3 games) decision (`pendingNagging`)
  - [x] Morale/locker-room events: authored cards fire as `pendingCard`, block the next game until the player chooses
- [~] AI-authored content pipeline (design-time only — see decisions log)
  - [x] Event-card content schema in `packages/shared` (`EventCard`, choices, typed effects) — extended with `absence`/`cohesion` effects, `alpha`/`supporting` targets, and a `requires` gate tying cards to active chemistry effects
  - [~] Event-card pool in `data/event-cards.json` — 13 cards authored ("Whose Team Is This?" resolves too-many-cooks via the alpha choice); grow the pool with AI generation as the event system matures
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
- [x] Visual design pass: vice-city-lights theme (black + neon pink/cyan, replaced the original dark hardwood look) via CSS variables in `index.css`, per-screen stylesheets, no UI framework

## Phase 5 — Accounts, persistence & leaderboards

- [x] Decide persistence strategy: localStorage stays the offline source of truth; Supabase (Postgres + auth + RLS, no server to host) adds sync/leaderboards without giving up static GitHub Pages hosting. The whole cloud layer is env-gated: no `VITE_SUPABASE_*` vars → local-only mode, zero network calls
- [x] User accounts: guest-first — signed out, the game is exactly as before (localStorage only); signing in adds sync + leaderboard eligibility. Guest progress survives sign-in via merge (no anonymous Supabase sessions needed — local meta merges into the account at first sign-in)
- [x] Google OAuth as the only sign-in method (no passwords → no reset/verification flows) — `apps/web/src/account.ts`
- [x] SQL schema in `db/schema.sql`: profiles (auto-created by trigger), meta_progress, runs (stores seed + ascension + dataset version for later server-side verification), leaderboard view; RLS: users write only their own rows, leaderboard data publicly readable. Setup guide in `db/README.md` — **one-time manual setup required** (Supabase project, schema apply, Google OAuth config, env vars/repo secrets)
- [x] Cloud sync of meta-progression: `mergeMetaProgress` (max counters, union badges — commutative, tested) merges local + cloud at sign-in and writes both sides; finished runs upsert meta + insert a run row, fire-and-forget so cloud failures never touch local play
- [x] Leaderboards: top runs (wins desc, ascension desc) with display names on the home screen — client-submitted; seeded determinism means entries can be re-verified from seed + choices later if cheating becomes a problem
- [ ] Backend/API layer beyond the BaaS (only if/when needed — e.g. serverless run verification)

## Phase 6 — Era player pools

- [x] Scrape Classic Teams (66 rosters, 1965–2019) and All-Time franchise teams (30) from 2kratings.com into `data/nba-players-eras.json` — `npm run fetch:nba-eras`, same page parser as the current-roster scrape; team slugs are discovered from the listing pages (2K adds classic teams each release) instead of hardcoded. Manual refresh only — historical ratings change per 2K release, not weekly, so the weekly cron still touches only `nba-players.json`
- [x] Dataset/mode selector on the home screen: Current / Classic eras / All-Time / Mixed / Fictional — a run carries a `PlayerPool` (mode + datasets); Mixed = current + classic + all-time in one pool, so the league is one CPU team per source roster (up to ~125 teams) and the schedule just repeats fewer opponents
- [x] Duplicate handling: era versions are distinct players ("Michael Jordan '96", "Michael Jordan (All-Time)") with a shared `personKey` (normalized name); draft picks, FA signings, and roster validation all refuse a second version of the same person. Fixed a latent `startSeason` bug this exposed: removing a pick from a short era roster and topping it back up to the same size masked the removal
- [x] Balance pass: salary rank bands and the FA "no superstars" cutoff switched from absolute ranks (12/48/140/300, overall ≤82) to pool-size fractions calibrated to the same numbers — era pools full of 90+ legends price themselves the same way, and tests verify a legal 15-man draft at max ascension in every mode. Era players ship without per-game stats (matching historical team-season stats to 66 rosters isn't worth the scrape complexity for display-only garnish)
- [x] (Stretch) era chemistry: "Ran it back" synergy (+1/+2) for 2/3+ rostered teammates from the same era roster — only strict subsets count, so intact CPU era teams stay at baseline instead of all getting a flat bonus

## Ideas backlog (unscoped)

- Trades with CPU teams
- Coach/scheme selection affecting team style
- In-game decision points (timeouts, rotations) for close games
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
| 2026-07-09 | Accounts/DB: Supabase (Postgres + auth), guest-first | Adds Google OAuth + SQL leaderboards without a server to run, so static GitHub Pages hosting survives. Game stays fully playable offline; login only adds sync/leaderboards. Google is the sole sign-in method to skip password flows. |
| 2026-07-09 | Eras: promoted from backlog, sourced from 2kratings classic/all-time pages | Same site/format as the current scrape, so the pipeline mostly reuses; rank-mapped salaries price historical players automatically. Distinct era versions of the same player are allowed in the pool but not on one roster. |
| 2026-07-25 | Era data: separate `nba-players-eras.json`, manual refresh | Historical rosters only change with new 2K releases; keeping them out of the weekly cron means a bad era scrape can never block the roster refresh, and current-mode seeds don't shift when era data updates. |
| 2026-07-25 | Salary bands + FA cutoff: absolute ranks → pool-size fractions | Era pools run 450–1900 players and skew high-rated; fractional bands (calibrated to the old absolute ranks at the ~525-player current pool) keep the relative cap squeeze identical in every mode. |
| 2026-07-25 | Era versions share a `personKey`; one version per person, enforced at pick/sign/validate time | Blocking at the earliest interaction (draft pick, FA signing) gives a tooltip explanation instead of a failed roster validation later; the validation rule stays as the backstop. |
| 2026-07-25 | Casual mode: +$25M cap toggle, not a cap-off switch | The cap squeeze is the draft's core decision, so it can't be removed — only relaxed. +$25M cancels even max ascension's −$25M while three supermaxes still eat ~$150M of $180M. Casual runs count in career stats but earn no badges, unlock no ascensions, and never post to the leaderboard (client just skips the insert — no schema change). |
| 2026-08-05 | Casual mode: no cap at all (supersedes +$25M) | Casual is for fantasy rosters, not a gentler puzzle — players want to draft anyone without cap worries. Implemented as `runCapReduction` returning `-Infinity` in casual runs, so every existing cap check passes untouched; UI special-cases the non-finite value ("No cap"/"Unlimited"). Badge/leaderboard ineligibility unchanged. |
| 2026-08-05 | Draft: free pick per roll (supersedes fixed slot order) | Fixed slots created dead rolls (a loaded team offering nothing legal) and blocked stars at the "wrong" round. Every roll now offers the whole team; the 2-per-position minimum moved from slot order to a feasibility guard (`positionsNeeded` — a pick is illegal if the positions still short can't fit in the rounds left), mirroring the existing cap-reserve guard. Tension shifts from a fixed schedule to managing your own remaining flexibility. Rolls stay seed-indexed, so determinism is unchanged. |
| 2026-08-05 | Casual mode: −4 CPU overall on top of no cap | Casual is the power-fantasy mode, but with pool = opponents (especially all-time), even a no-cap superteam had thin margins. A flat CPU handicap widens the gap in every pool without decoupling the draft pool from the opposition. Crucially applied at `startSeason` (after drafting), not at league creation — you draft from the league, so weakening it up front would weaken your own picks by the same amount and cancel out (verified with `scripts/balance-check.ts`: casual all-time superteams went from ~92% to ~97% per game). |
| 2026-08-05 | Game sim: UPSET_FACTOR 6 → 3.5, home bonus 1.5 → 1 | At factor 6 even a maxed-out roster capped near ~82% per game (median run ~3 games; 82-0 literally impossible at ~1e-6), so draft quality barely mattered — measured with `scripts/balance-check.ts`. At 3.5 a +9 strength edge wins ~92% and near-equal matchups stay tense; home bonus drops to 1 so equal-team home games sit at ~57% (real NBA home-court rate). Changes what seeds produce, like any balance pass. |
| 2026-08-05 | Dual-position players: draft-time role choice | 2kratings lists most players at 2+ positions (384/459 current players) but the scrape kept only the first. Now scraped as `position` + `altPositions`; drafting a dual-position player picks which role he fills (per-position pick buttons), reassigning `position` on the rostered copy so validation/chemistry/needs all use the assigned role. `pickPlayer` without an explicit position deterministically takes the first eligible role that keeps the roster completable, so replays and the smoke driver stay valid. |
| 2026-08-05 | Casual mode: 8 lives (standard stays at 1) — superseded same day: standard moved to 3 | Even after the CPU handicap and upset-factor tuning, one life makes casual unwinnable in practice: a ~97%-per-game superteam wins 82-0 only ~8% of the time, and full-season sims showed well-drafted all-time teams still drop 4-5 games per 82. The engine already supported lives as the loss condition, so casual now starts with `CASUAL_LIVES = 8` (run survives up to 7 losses) — measured at ~85% win rate for a greedy all-time draft vs 45% at 5 lives and 5% at 1 (`scripts/balance-check.ts` lives sweep). Win summary now shows the actual record; "82-0. Immortality." is reserved for true perfect seasons. |
| 2026-08-05 | Standard mode: 3 lives at every ascension | The same one-life math that broke casual applies to standard — a great cap-legal roster still can't realistically go 82-0, so runs ended too early to feel fair. All ascensions now grant 3 lives (survive up to 2 losses); lives-per-ascension (3 → 2 → 1) is a future difficulty lever once the other modifiers are tuned. Home copy, career stat labels, and leaderboard tooltips updated from "perfect season" wording to "season won". |
| 2026-08-07 | Chemistry arc: single `cohesion` scalar on `SeasonState` | Stacked teams (all-time mode) ate a permanent too-many-cooks penalty with no counterplay. One 0-1 scalar gives a season arc with minimal state: friction fades as you win together (and resolves into a small bonus at 90%), FA signings shake it up (−20%), a card can jump it. Structural flaws (no shooting/defense) deliberately don't fade — coaching solves behavior, not roster construction. CPU teams sit at 0.75 so established rosters aren't newly-drafted. Verified with `scripts/balance-check.ts`: casual all-time still ~93% of seasons won. |
| 2026-08-07 | Traits: derived from the full 2K attribute sheet | The team pages already carried ~20 per-player ratings in row data attributes — the scrape just ignored them. Trait derivation now margin-ranks archetype candidates (max 3) instead of keying off overall/3PT/dunk alone; `ball-dominant` additionally requires foul-drawing (the sheet's best on-ball-creation proxy), which cut the all-time pool's cooks from 18% to 7% and fixed off-ball stars being mislabeled. Attribute floors are NOT clamped to 40 like on-court ratings — the low tails of durability/intangibles are exactly what event traits read. |
| 2026-08-07 | Event traits: `hot-head` from low intangibles | No temper rating exists in the data; intangibles ≤35 is an honest-but-imperfect proxy (~2-4% of each pool). Event-linked traits change event odds only (suspension 3x, injury 2x/0.5x), never ratings, so a mislabel is flavor-level harm. |
| 2026-08-07 | Card `requires` gate + alpha targets | Cards can now demand an active chemistry effect (`requires: "chemistry-effect:too-many-cooks"`) and target the best involved player (`alpha`) vs the rest (`supporting`) — involved ids arrive overall-sorted. This makes cards a resolution mechanic for chemistry problems instead of pure flavor, without any new engine state. |
