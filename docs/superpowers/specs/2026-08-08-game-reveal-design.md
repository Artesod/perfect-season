# Game Reveal Moment — Design

**Date:** 2026-08-08
**Status:** Approved for planning

## Problem

The season screen resolves "Play next game" instantly: the score silently appears in the
"Last game" panel and nothing on screen moves. For a roguelike whose premise is "one loss
can end the run," there is no tension at the moment of play and no payoff after it — so
the rational player behavior is to fast-click through the season. Playtesting confirmed
exactly that.

## Goal

Make clicking "Play next game" a moment: a short, skippable, inline reveal that builds
tension (quarter-by-quarter ticker), delivers flavor (play-by-play beats featuring your
players), and lands a payoff (WIN/LOSS stinger, with losses hitting hardest because they
cost a life).

## Decisions (settled during brainstorming)

| Question | Decision |
|---|---|
| Anchor direction | Game reveal moment (not dashboard juice or narrative feed alone) |
| Pacing | Reveal (~5s, skippable) on "Play next game" only; "Sim to next event" stays instant |
| Form | Quarter-by-quarter score ticker + occasional play-by-play beats between quarters |
| Placement | Inline — the "Game N" panel transforms into a live scoreboard (no overlay) |
| Star performers | Yes — synthesize a per-game star with a point total; shown in beats and post-game |

## Architecture overview

Three pieces, in dependency order:

1. **Sim: recap generator** (`packages/sim/src/recap.ts`) — pure, deterministic function
   producing quarter splits, a star performer, and tagged text beats from an existing
   `GameResult`. Nothing new is persisted.
2. **Store: reveal state** (`apps/web/src/store.ts`) — `playGame` still resolves the game
   immediately; it additionally sets a `reveal` object with the recap and a pre-game
   display snapshot so the dashboard can't spoil the outcome mid-ticker.
3. **UI: reveal component + post-game upgrade** (`apps/web/src/components/GameReveal.tsx`,
   `SeasonScreen.tsx`) — the ticker animation, stingers, and a richer "Last game" panel.

## 1. Sim layer — `buildGameRecap`

```ts
interface QuarterSplit { home: number; away: number }

interface RecapBeat {
  /** Quarter break after which the beat appears (1-3), or 4 for the final horn */
  afterQuarter: number;
  text: string;
  tag: 'clutch' | 'comeback' | 'blowout' | 'wire-to-wire' | 'star';
}

interface GameRecap {
  quarters: [QuarterSplit, QuarterSplit, QuarterSplit, QuarterSplit];
  star: { playerId: string; points: number };
  beats: RecapBeat[]; // 1-2 per game
}

function buildGameRecap(
  result: GameResult,
  roster: readonly Player[],      // user roster available that game (post-injury filter)
  seed: number,
  gameIndex: number,
): GameRecap
```

### Determinism

- RNG stream: `deriveSeed(seed, RECAP_STREAM_BASE + gameIndex)` with
  `RECAP_STREAM_BASE = 40_000` (run.ts owns 0-2/100/10k/20k; draft rolls own 30k+).
- Same `(result, roster, seed, gameIndex)` → identical recap. Because it is
  reproducible, the recap is **never stored in `SeasonState`** — the "Last game" panel
  regenerates it on render. No save-format migration.

### Quarter splits

- The four splits sum exactly to the final score for each team; every quarter score is
  plausible (roughly 18-38 points per team per quarter, jittered).
- Splits are shaped by a "game script" chosen from the real outcome:
  - **Clutch finish** (final margin ≤ 5): the 4th quarter score arrives within 1
    possession until the last tick; the winner may trail entering Q4.
  - **Comeback** (margin 6-14, seeded coin flip): winner trails at halftime by 6+.
  - **Blowout** (margin ≥ 15): winner pulls away in Q2/Q3.
  - **Wire-to-wire** (default): winner leads at every break.
- The script must be consistent with the final score — shaping adjusts intermediate
  quarters only, never the totals.

### Star performer

- Weighted pick over the **available** user roster (injured players excluded — the
  caller passes the filtered roster): weight = overall, boosted by active positive
  rating mods and scoring-flavored traits (`sharpshooter`, `ball-dominant`,
  `lob-threat`), damped by negative mods.
- Points: scaled from overall + weight jitter, clamped to 18-45. Losses cap the star
  lower (≤ 34) so a 45-point night never headlines a defeat.

### Beats

- Template library keyed by script tag; placeholders for star name, opponent name,
  quarter, and run size, e.g.:
  - clutch: "{star} ices it at the line — {team} survive."
  - comeback: "Down {deficit} at the half, {team} storm back."
  - blowout: "A {run}-0 third-quarter run breaks it open."
  - star: "{star} catches fire in the {quarter} — {points} and counting."
- Each game gets 1-2 beats: one script beat + (seeded 50%) one star beat. `afterQuarter`
  places them at quarter breaks; the clutch beat always lands after Q4 with the horn.

## 2. Store — reveal without spoilers

New store state and actions:

```ts
reveal: {
  recap: GameRecap;
  result: GameResult;
  /** What the dashboard showed before this game, rendered while the ticker runs */
  snapshot: { wins: number; losses: number; lives: number; gameNumber: number; eventCount: number };
} | null;

finishReveal: () => void; // clears reveal; dashboard catches up
```

- `playGame` resolves the game exactly as today (state remains the single source of
  truth; a refresh mid-reveal loses nothing — the reveal simply doesn't resume). Before
  calling `playNextGame` it captures the snapshot; after, it builds the recap from the
  new result and sets `reveal`.
- While `reveal` is non-null, `SeasonScreen` renders the topbar record/game/lives, the
  schedule strip, the event log, and the "Last game" panel from the snapshot values
  (i.e. the just-played game appears not-yet-played). Everything else renders live.
- **Run-ending games:** if the reveal's game finished the run (`status` `won`/`lost`),
  the app must keep showing `SeasonScreen` until `finishReveal()` — the loss reveal is
  the payoff, and skipping straight to the run-over screen would spoil it. Route on
  `run.status` only when `reveal` is null.
- `simToNextEvent` never sets `reveal`. `exitRun`/`newRun` clear it.

## 3. UI — the reveal

`GameReveal` replaces the "Game N" panel content while `reveal` is active:

1. **Lock-in (~0.4s):** matchup header stays; the win-probability figure fades out.
2. **Ticker (~0.8s per quarter):** cumulative scores roll odometer-style to each
   quarter break, brief pause between quarters; beats slide in at their `afterQuarter`
   position and persist as small lines under the scoreboard.
3. **Stinger (inline, ~1.2s):**
   - **Win:** large "WIN" flash. Copy escalates by context, checked in this order —
     milestone ("10-0", "20-0", "41-0 — halfway", every 10 wins), survival (pre-game
     win probability < 40%: "Escaped at {pct} odds"), statement (opponent in the top 3
     of the power rankings), else plain.
   - **Loss:** panel shake + red wash, "LIFE LOST — {n} remaining" (or "RUN OVER" at 0).
4. **Settle:** stinger fades, `finishReveal()` fires, dashboard updates (record ticks
   up, schedule cell fills, event log grows, post-game panel appears).

- **Skip:** clicking anywhere on the panel (or a visible "Skip" affordance) jumps
  straight to the stinger's settled state and calls `finishReveal()`.
- **Reduced motion:** `prefers-reduced-motion` (same media query the draft reel uses)
  skips the animation entirely — result + stinger text render statically, then settle.
- Timing constants live in one place in the component; total target ≈ 5s unskipped.

### Post-game panel upgrade

"Last game" gains, from the regenerated recap:

- a quarter line score (Q1-Q4 columns for both teams),
- "Player of the Game": avatar, name, synthesized points,
- the game's beats as one-line flavor text.

## Out of scope

- Opponent player names in beats (opponent rosters exist but stay team-level).
- Sound, full box scores, per-player season stats.
- Any change to "Sim to next event" behavior or pacing.
- Settings/toggles for the reveal (skip-by-click suffices).
- Playoff-specific presentation (playoffs aren't implemented yet; the reveal applies to
  whatever `playNextGame` plays).

## Testing

Vitest units in `packages/sim/src/recap.test.ts`:

- Quarter splits sum exactly to the final score for both teams.
- The winner of the splits' total is `winnerTeamId`.
- Determinism: identical inputs produce deep-equal recaps; different `gameIndex` diverges.
- Star performer is always drawn from the provided roster; loss games cap star points ≤ 34.
- Script selection: margin ≤ 5 yields a clutch-tagged beat after Q4; margin ≥ 15 yields
  a blowout tag; every game has 1-2 beats with valid `afterQuarter`.
- Quarter scores stay within plausible bounds.

Web side: typecheck plus a manual pass (reveal, skip, reduced-motion, loss with lives
remaining, run-ending loss, mid-reveal refresh). Store snapshot logic is kept simple
enough to verify by inspection; if it grows, extract and unit-test it.
