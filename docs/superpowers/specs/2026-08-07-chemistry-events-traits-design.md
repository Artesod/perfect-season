# Chemistry arc, event diversity, and deep traits — design

Date: 2026-08-07
Status: approved pending user review

## Problem

Three connected problems, surfaced by all-time-mode superteams:

1. **Ball-dominant saturation.** `deriveTraits` (`packages/sim/src/realPlayers.ts`) marks
   every 88+ PG and every 85+ non-dunker SG as `ball-dominant`, using only
   overall/3PT/dunk. In era pools full of legends, nearly every guard qualifies —
   including historically great off-ball players — so stacked rosters always eat the
   `too-many-cooks` debuff, which scales unbounded (−1.5 per extra cook) and never
   resolves. Realistic superteams have early friction and then gel; ours never do.
2. **Shallow chemistry.** 8 static rules over a 12-trait vocabulary derived from 3
   numbers. Chemistry is a pure roster function; the season doesn't change it.
3. **Thin events.** 4 event types (injury / hot streak / slump / morale card) and 12
   authored cards.

Key discovery: the 2kratings team pages we already scrape carry the **full 37-attribute
sheet as `data-*` attributes on every roster row** (pass-vision, ball-handle,
perimeter-defense, block, steal, post-control, standing-dunk, overall-durability,
intangibles, …). We currently keep 3 of them. Deep traits cost no additional page
fetches.

## Design

### 1. Attribute scrape (`scripts/fetch-nba-data.ts`, `packages/shared`)

`RealPlayerRecord` gains an optional `attributes` object (~20 ratings kept from the 37):

- Shooting: `threePoint` (existing), `midRange`
- Finishing: `drivingDunk` (existing `dunk`), `standingDunk`, `layup`, `vertical`, `speed`
- Playmaking: `ballHandle`, `passAccuracy`, `passVision`, `passIq`
- Post: `postControl`, `closeShot`
- Defense: `perimeterDefense`, `interiorDefense`, `steal`, `block`
- Rebounding: `offensiveRebound`, `defensiveRebound`
- Meta: `durability` (from `overall-durability`), `intangibles`

Both datasets (`nba-players.json`, `nba-players-eras.json`) are re-scraped. `attributes`
is optional: rows missing it (scrape hiccups, future site changes) fall back to the
current heuristic derivation, and dataset validation does not require it.

### 2. Deep trait derivation (`realPlayers.ts`)

`deriveTraits` is rewritten to threshold on real attributes. Archetype traits (chemistry
vocabulary), each granted independently, capped at the 3 strongest signals:

| Trait | Signal (initial thresholds; calibrated per §8) |
| --- | --- |
| `sharpshooter` | 3PT ≥ 88 |
| `catch-and-shoot` / `stretch-big` | 3PT 80–87 (guards+wings / bigs) |
| `playmaker` | passing composite (mean of passAccuracy/passVision/passIq) ≥ 85 at PG/SG |
| `point-forward` | same composite ≥ 85 at SF/PF |
| `ball-dominant` | ballHandle ≥ 88 AND overall ≥ 85 AND 3PT < 88 (elite off-ball shooters escape) |
| `slasher` | drivingDunk ≥ 85 AND speed ≥ 80 |
| `lob-threat` (new) | standingDunk ≥ 85 AND vertical ≥ 80 |
| `post-scorer` | postControl ≥ 85 |
| `rim-protector` | block ≥ 85 AND interiorDefense ≥ 85 |
| `pest-defender` | steal ≥ 85 AND perimeterDefense ≥ 85 |
| `two-way` | perimeterDefense ≥ 80 AND interiorDefense ≥ 80 |
| `rebounder` | mean(offensiveRebound, defensiveRebound) ≥ 85 |

Plus at most one event-linked trait:

| Trait | Signal | Effect |
| --- | --- | --- |
| `iron-man` | durability ≥ 90 | halves his injury/illness target weight |
| `injury-prone` | durability ≤ 65 | doubles his injury/illness target weight |
| `hot-head` | intangibles ≤ 40 | raises suspension odds when a suspension fires |

Caveat, flagged for review: 2K has no temper rating, so `hot-head` uses low
`intangibles` as a volatility proxy. If that feels wrong, the alternative is dropping
the trait and keeping suspensions uniform-random.

Procedural players (`league.ts`): `TRAITS_BY_POSITION` pools gain the new vocabulary
(`lob-threat` for PF/C, event-linked traits rolled at low probability, e.g. 10%) so
fictional mode keeps parity.

### 3. Cohesion: chemistry becomes a season arc (`chemistry.ts`, `season.ts`, `run.ts`)

New scalar `cohesion` (0–1) on `SeasonState`:

- Starts at 0. Each game adds progress: wins +1 unit, losses +0.4; full at 35 units.
- Each FA signing removes 20% of current cohesion (new pieces re-learn each other).
  Waives don't reduce it.
- Event-card effects can add cohesion (see §6).
- CPU teams play at a fixed cohesion of 0.75 (established rosters).

Every chemistry rule gets a `kind`:

- **`friction`** (too-many-cooks): behavioral problems that winning solves. Delta scales
  by `(1 − cohesion)`; at cohesion ≥ ~0.9 the rule *flips* into "Pecking order
  established" (+1) — the superteam-gels arc.
- **`structural`** (no-spacing, matador-defense, clogged-paint, one-way-team): roster
  construction flaws. Never fade; fix them in free agency.
- **`synergy`** (all positives): deepen with familiarity — delta × (1 + 0.25·cohesion).

`too-many-cooks` base delta is floored at −3 (currently unbounded).

API: `computeChemistry(players, cohesion)` — still deterministic and near-pure; the UI
chemistry readout shows both the current value and the direction ("resolving with wins").

### 4. New chemistry rules (`chemistry.ts`)

| Rule | Kind | Condition | Delta |
| --- | --- | --- | --- |
| Lob threat | synergy | ≥1 playmaker/point-forward + ≥1 lob-threat or slasher | +1.5 |
| Switchable defense | synergy | ≥3 two-way/pest-defender at SG/SF/PF | +1.5 |
| Bench mob | synergy | 6th–9th best overalls average ≥ 78 | +1 |
| One-way team | structural | team mean offense − mean defense ≥ 8 | −1.5 |
| Clogged paint | structural | ≥3 PF/C with no shooting trait | −1.5 |

Existing rules keep their conditions; deltas re-verified in the balance pass (§8).

### 5. New events (`events.ts`, `season.ts`)

All rolled in `rollEvents`, which gains the next opponent as context:

- **Illness**: 1–2 games out, own `SeasonEvent` type (log flavor: flu/back spasms),
  sits via the existing absence machinery. Base chance ~3%/game.
- **Suspension**: 1 game out (altercation / accumulated techs). Base ~1.5%/game;
  `hot-head` players are weighted heavier in target selection.
- **Rivalry / revenge game**: when the next opponent is the team a rostered player was
  drafted off of, ~25% chance of a +2 boost for that game only ("circled this one on
  the calendar"). Requires tracking the origin team id on drafted players.
- **Nagging injury**: a blocking decision (reuses the pending-card modal machinery):
  *play him hurt* (−3 rating for 5–8 games) or *sit him* (2–3 games out). Base ~2%/game.

Injury/illness target selection becomes durability-weighted (iron-man ×0.5,
injury-prone ×2). Event-chance scaling by ascension continues to apply uniformly.

### 6. Event-card schema extensions (`packages/shared`, `events.ts`, card data)

- New effect types alongside `rating`: `absence` (`{ games }`) and `cohesion`
  (`{ delta }`).
- Optional `requires` field on `EventCard`: for now the single condition
  `"chemistry-effect:<id>"` (card only fires while that effect is active). Card
  selection filters the pool by requirements before the seeded pick.
- New authored card **"Whose team is this?"** — requires active `too-many-cooks`,
  involved = the ball-dominant players. Choices: *name an alpha* (alpha +2 for 6 games,
  others −2 for 4 games, cohesion +0.3 — the risky shortcut) or *let them sort it out*
  (no effect — the slow path).
- `validateEventCards` extended for the new effect types and `requires`.

### 7. Not in scope (explicitly cut)

Contract-year/deadline narrative modifiers, milestone chases, load-management prompts,
growing the card pool to ~30, hierarchy/veteran-presence/era-clash chemistry rules,
sim-linked traits like clutch. Candidates for a later pass.

### 8. Calibration, balance, tests

- **Trait audit script** (`scripts/trait-audit.ts` or extending `balance-check.ts`):
  prints trait frequency per pool (current / classic / all-time). Tune thresholds so
  traits stay informative — target `ball-dominant` at roughly the top 5–8% of a pool,
  not 40%.
- **Balance check**: re-run `scripts/balance-check.ts` on all-time standard + casual;
  baseline is the decisions-log numbers (casual all-time superteam ~97%/game). Stacked
  teams should now start slightly debuffed and finish slightly stronger than baseline
  once gelled.
- **Tests**: gelling math (friction fade, flip to pecking-order, FA cohesion hit), each
  new chemistry rule, each new event type, weighted target selection, card validation
  for new effect types/`requires`, trait derivation fixtures (an off-ball star is not
  ball-dominant; attribute-less rows fall back cleanly).
- Like any balance pass, this changes what existing seeds produce.

## Decisions log

| Decision | Rationale |
| --- | --- |
| Cohesion = single scalar on `SeasonState` | Everything chosen (gradual gelling, FA shake-ups, card jumps) with one number of state; chemistry stays a deterministic function of (roster, cohesion). Per-effect gelling state adds sync complexity for imperceptible nuance. |
| Friction vs structural anti-synergies | Realism: coaching/winning solves behavioral friction (2008 Celtics), but you can't coach shooting into a roster — structural flaws are FA problems. |
| Traits from full 2K attribute sheet | The data was already on the pages we scrape; 3 of 37 attributes kept was the root cause of ball-dominant saturation. |
| Event-linked traits limited to durability + hot-head | Ties traits into events without touching the game-sim core; clutch-style sim hooks deferred. |
| `hot-head` from low intangibles | 2K has no temper rating; proxy flagged for user judgment. |
