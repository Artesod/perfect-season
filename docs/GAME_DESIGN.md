# Game Design

## Concept

A roguelike run-based game: draft an NBA roster, survive an 82-game season without losing, win the championship. Each run is a fresh draft with a randomized player pool, random events, and emergent chemistry — so no two runs play the same.

## Core loop

1. **Draft** — Build a 15-man roster from a randomized player pool under a salary cap, maximizing projected Wins Above Replacement (pWAR).
2. **Play the season** — Simulate games one at a time (or in batches). Between games, respond to events and manage the roster.
3. **Survive** — A loss ends the run (perfect-season mode). Win all 82 + playoffs to complete the run.
4. **Meta-progress** — Completed/failed runs unlock modifiers, badges, and harder difficulties.

## Systems

### Roster & salary cap

- 15-man roster, position requirements TBD (e.g. min 2 per position group).
- Salary cap forces trade-offs: superstars vs. depth.
- Player value expressed as pWAR; the drafting challenge is maximizing team pWAR under cap and fit constraints.

### Chemistry

Dynamic modifiers based on roster composition, applied to team strength:

- **Synergies**: e.g. elite playmaker + catch-and-shoot wings, rim protector + poor perimeter defenders, floor spacing around a post scorer.
- **Anti-synergies**: ball-dominant stars together, overlapping positions, too many non-shooters.
- Chemistry can evolve during the season (wins build it, events can break it).

### RNG events

Fired between games (and possibly mid-game later):

- **Injuries** — severity tiers, games missed, forces free-agency scrambles.
- **Performance swings** — hot streaks, career nights, slumps.
- **Event cards** — locker-room and narrative events with player choices (risk/reward).

Event probability can scale with difficulty modifiers.

### Free agency

- Mid-season pool refreshes to replace injured/underperforming players.
- Signing costs cap space; waiving players may have penalties (dead cap).

### Game simulation

- Team strength = aggregate player ratings + chemistry modifiers + situational factors (home court, fatigue, streaks).
- Win probability model with meaningful variance — a superteam should still sweat some nights (that's the roguelike tension).
- Output: score, key performers, notable events. (Full box scores are a later fidelity upgrade.)

### Win / loss conditions

- **Win**: 82-0 regular season + 16 playoff wins → banner.
- **Loss**: any single loss ends the run (classic mode). Configurable variants: 3 lives, "win 70+", etc.

## Difficulty & replayability

- Seeded runs (shareable seeds).
- Ascension-style modifiers: weaker draft pools, tighter cap, higher injury rates, stronger CPU teams.
- Unlockables across runs to keep meta-progression interesting.

## Open design questions

- [ ] Real NBA players vs. procedurally generated players (licensing/data considerations vs. flavor)?
- [ ] How much in-game agency (rotations, timeouts) vs. pure between-game management?
- [ ] Does the player see opponent strength before games (planning) or not (tension)?
- [ ] How punishing should injuries be at base difficulty?
