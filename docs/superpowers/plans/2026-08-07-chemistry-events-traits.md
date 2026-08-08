# Chemistry Arc, Event Diversity & Deep Traits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traits derived from the full 2K attribute sheet, chemistry that evolves over the season via a cohesion scalar (friction anti-synergies resolve with wins), five new chemistry rules, and four new event types plus card-schema extensions.

**Architecture:** Chemistry stays a deterministic function `computeChemistry(players, cohesion)`; the only new state is `SeasonState.cohesion` (0–1) and `SeasonState.pendingNagging`. CPU teams play at fixed cohesion 0.75. All randomness flows through the existing per-stream seeded RNG; new event rolls extend `rollEvents` with a context object. Spec: `docs/superpowers/specs/2026-08-07-chemistry-events-traits-design.md`.

**Tech Stack:** TypeScript monorepo (npm workspaces), Vitest, cheerio scraper via system curl, React + Zustand frontend.

## Global Constraints

- Determinism: every random draw must come from the seeded `Rng` passed in; no `Math.random`, no runtime fetches. Balance changes altering what a seed produces are acceptable (documented pattern).
- `RunState` is NOT persisted (Zustand `partialize` keeps only `meta`) — no save-migration shims needed for new `SeasonState` fields.
- Commands run from repo root unless stated. Test: `npm test -w @perfect-season/sim`. Typecheck: `npm run typecheck`. Lint: `npm run lint`. Build: `npm run build`.
- Existing sim code style: pure functions over immutable state, doc comments explain intent. Follow it.
- Do not add comments that narrate code; comments explain non-obvious intent only.

---

### Task 1: Shared schema extensions

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/sim/src/run.ts` (compile fix: `startSeason` season init)
- Modify: `packages/sim/src/chemistry.ts` (compile fix: `kind` on effects)

**Interfaces:**
- Consumes: nothing new.
- Produces (later tasks rely on these exact names):
  - `PlayerAttributes` (20 number fields, names below), `RealPlayerRecord.attributes?: PlayerAttributes`
  - `Player.originTeamId?: string`
  - `SeasonEvent` union gains `illness`, `suspension`, `revenge`, `nagging` variants (shapes below)
  - `PendingNagging { playerId; playHurtDelta; playHurtGames; sitGames }`
  - `SeasonState.cohesion: number`, `SeasonState.pendingNagging: PendingNagging | null`
  - `ChemistryKind = 'synergy' | 'friction' | 'structural'`, `ChemistryEffect.kind: ChemistryKind`
  - `CardTarget = 'involved' | 'team' | 'alpha' | 'supporting'`
  - `CardEffect` gains `absence` and `cohesion` variants; `EventCard.requires?: string`

- [ ] **Step 1: Add the types**

In `packages/shared/src/types.ts`:

Add after `RealPlayerStats`:

```typescript
/**
 * The 2K attribute sheet scraped from team-page rows (see
 * scripts/fetch-nba-data.ts). Optional on RealPlayerRecord: rows missing any
 * attribute fall back to the legacy overall/3PT/dunk trait heuristics.
 */
export interface PlayerAttributes {
  midRange: number;
  closeShot: number;
  layup: number;
  standingDunk: number;
  vertical: number;
  speed: number;
  ballHandle: number;
  passAccuracy: number;
  passVision: number;
  passIq: number;
  drawFoul: number;
  postControl: number;
  interiorDefense: number;
  perimeterDefense: number;
  steal: number;
  block: number;
  offensiveRebound: number;
  defensiveRebound: number;
  durability: number;
  intangibles: number;
}
```

In `RealPlayerRecord`, after `dunk`:

```typescript
  /** Full attribute sheet when the scrape captured it; enables deep traits */
  attributes?: PlayerAttributes;
```

In `Player`, after `eraTeam`:

```typescript
  /**
   * League team id the player was drafted off of (set at pick time).
   * Powers revenge-game events; absent for FA signings and CPU players.
   */
  originTeamId?: string;
```

Extend `SeasonEvent` with four new variants (after `slump`, before `morale`):

```typescript
  | {
      type: 'illness';
      playerId: string;
      /** Short absence (flu, back spasms), distinct from injuries in the log */
      gamesOut: number;
    }
  | {
      type: 'suspension';
      playerId: string;
      gamesOut: number;
    }
  | {
      type: 'revenge';
      /** Player facing the team he was drafted off of next game */
      playerId: string;
      ratingDelta: number;
      gamesRemaining: number;
    }
  | {
      type: 'nagging';
      /** Nagging injury: blocks the next game until play/sit is chosen */
      playerId: string;
      playHurtDelta: number;
      playHurtGames: number;
      sitGames: number;
    }
```

Replace the `ChemistryEffect` block:

```typescript
/** How a chemistry effect behaves as the team gels over a season. */
export type ChemistryKind = 'synergy' | 'friction' | 'structural';

/** A chemistry synergy/anti-synergy derived from roster composition. */
export interface ChemistryEffect {
  id: string;
  label: string;
  /** Applied to team strength; positive = synergy, negative = anti-synergy */
  strengthDelta: number;
  /** Players producing the effect */
  playerIds: string[];
  /**
   * friction fades with cohesion (and flips positive once resolved);
   * structural never fades; synergy deepens slightly with cohesion.
   */
  kind: ChemistryKind;
}
```

Replace `CardEffect` and extend `EventCard`:

```typescript
/**
 * Who a card effect hits: the involved players, the whole roster, the
 * highest-overall involved player (alpha), or every other involved player.
 */
export type CardTarget = 'involved' | 'team' | 'alpha' | 'supporting';

export type CardEffect =
  | {
      type: 'rating';
      /** Overall delta while active */
      delta: number;
      /** Games the effect lasts */
      games: number;
      target: CardTarget;
    }
  | {
      type: 'absence';
      /** Games the targeted players sit */
      games: number;
      target: CardTarget;
    }
  | {
      type: 'cohesion';
      /** Added to season cohesion (0-1 scale), clamped */
      delta: number;
    }
  | { type: 'none' };
```

In `EventCard`, after `text`:

```typescript
  /**
   * Fire condition: "chemistry-effect:<id>" limits the card to seasons where
   * that chemistry effect is currently active. Involved players become the
   * effect's producers (sorted by overall, best first).
   */
  requires?: string;
```

Add after `PendingCard`:

```typescript
/** A rolled nagging injury waiting on the play-hurt/sit decision. */
export interface PendingNagging {
  playerId: string;
  playHurtDelta: number;
  playHurtGames: number;
  sitGames: number;
}
```

In `SeasonState`, after `pendingCard`:

```typescript
  pendingNagging: PendingNagging | null;
  /**
   * How gelled the roster is, 0-1. Grows with games (wins faster), drops on
   * FA signings, jumps via card effects. Friction chemistry fades with it.
   */
  cohesion: number;
```

- [ ] **Step 2: Fix the two compile errors**

In `packages/sim/src/run.ts` `startSeason`, the season literal gains the new fields:

```typescript
    season: {
      schedule,
      results: [],
      events: [],
      effects: emptyActiveEffects(),
      deadCap: 0,
      pendingCard: null,
      pendingNagging: null,
      cohesion: 0,
    },
```

In `packages/sim/src/chemistry.ts`, every effect literal returned by a rule needs `kind` to satisfy the new `ChemistryEffect`. Add `kind: 'synergy'` to floor-general, inside-out, defensive-anchor, glass-cleaners, ran-it-back; `kind: 'friction'` to too-many-cooks; `kind: 'structural'` to no-spacing and matador-defense. (Task 4 restructures this file; this is just the minimal compile fix.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test -w @perfect-season/sim`
Expected: typecheck clean; all existing tests pass (possibly chemistry tests need `kind` added to exact-object assertions — fix by adding the field, not changing values).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts packages/sim/src/run.ts packages/sim/src/chemistry.ts packages/sim/src/chemistry.test.ts
git commit -m "feat(shared): schema for player attributes, cohesion, new events, card targets"
```

---

### Task 2: Scrape the full attribute sheet

**Files:**
- Modify: `scripts/fetch-nba-data.ts` (inside `fetchTeam`)
- Modify: `packages/sim/src/realPlayers.ts:311-322` (`isValidPlayerRecord`)
- Regenerate: `data/nba-players.json`, `data/nba-players-eras.json`

**Interfaces:**
- Consumes: `PlayerAttributes` from Task 1.
- Produces: both datasets carry `attributes` on (nearly) every player. Task 3 reads them.

- [ ] **Step 1: Parse the attributes in `fetchTeam`**

In `scripts/fetch-nba-data.ts`, import `PlayerAttributes` from `@perfect-season/shared`. Above `fetchTeam`, add:

```typescript
/** Site data-attribute name for each PlayerAttributes field. */
const ATTRIBUTE_SOURCES: Record<keyof PlayerAttributes, string> = {
  midRange: 'mid-range-shot',
  closeShot: 'close-shot',
  layup: 'layup',
  standingDunk: 'standing-dunk',
  vertical: 'vertical',
  speed: 'speed',
  ballHandle: 'ball-handle',
  passAccuracy: 'pass-accuracy',
  passVision: 'pass-vision',
  passIq: 'pass-iq',
  drawFoul: 'draw-foul',
  postControl: 'post-control',
  interiorDefense: 'interior-defense',
  perimeterDefense: 'perimeter-defense',
  steal: 'steal',
  block: 'block',
  offensiveRebound: 'offensive-rebound',
  defensiveRebound: 'defensive-rebound',
  durability: 'overall-durability',
  intangibles: 'intangibles',
};

/** All-or-nothing: a partial sheet falls back to legacy trait heuristics. */
function parseAttributes(attr: (name: string) => string | undefined): PlayerAttributes | undefined {
  const result = {} as PlayerAttributes;
  for (const [field, source] of Object.entries(ATTRIBUTE_SOURCES)) {
    const value = Number.parseInt(attr(source) ?? '', 10);
    if (!Number.isFinite(value)) return undefined;
    result[field as keyof PlayerAttributes] = clampRating(value);
  }
  return result;
}
```

Inside the row loop in `fetchTeam`, after the `dunk` line:

```typescript
    const attributes = parseAttributes((name) => $row.attr(`data-${name}`));
```

and in the `players.push({ ... })` literal, after the `dunk` property:

```typescript
      ...(attributes ? { attributes } : {}),
```

- [ ] **Step 2: Validate attributes when present**

In `packages/sim/src/realPlayers.ts` `isValidPlayerRecord`, add to the conjunction:

```typescript
    (p.attributes === undefined ||
      (typeof p.attributes === 'object' &&
        typeof p.attributes.durability === 'number' &&
        typeof p.attributes.ballHandle === 'number')) &&
```

- [ ] **Step 3: Re-scrape both datasets**

Run: `npm run fetch:nba` (about a minute), then `npm run fetch:nba-eras` (roughly 3–5 minutes, ~96 team pages — run in background if desired).
Expected: both commands print per-team player counts and end with `Wrote N players ... to ...`.

- [ ] **Step 4: Spot-check and run the suite**

Check `data/nba-players.json` contains `"attributes"` with `"durability"` keys (e.g. search for `"ballHandle"`). Then run: `npm test -w @perfect-season/sim`
Expected: dataset-validation tests pass with the regenerated files.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-nba-data.ts packages/sim/src/realPlayers.ts data/nba-players.json data/nba-players-eras.json
git commit -m "feat(data): scrape full 2K attribute sheet into both datasets"
```

---

### Task 3: Deep trait derivation + audit script

**Files:**
- Modify: `packages/sim/src/realPlayers.ts:59-101` (`deriveTraits`)
- Create: `scripts/trait-audit.ts`
- Test: `packages/sim/src/realPlayers.test.ts`

**Interfaces:**
- Consumes: `PlayerAttributes` (Task 1), datasets with attributes (Task 2).
- Produces: trait vocabulary used by Tasks 4 and 6: existing traits plus `lob-threat`, `iron-man`, `injury-prone`, `hot-head`. `deriveTraits(record)` keeps its signature.

- [ ] **Step 1: Write failing tests**

Add to `packages/sim/src/realPlayers.test.ts` (import `deriveTraits` — export it from `realPlayers.ts` if not already; also import `PlayerAttributes` type):

```typescript
const baseAttributes: PlayerAttributes = {
  midRange: 70, closeShot: 70, layup: 70, standingDunk: 50, vertical: 60,
  speed: 70, ballHandle: 70, passAccuracy: 70, passVision: 70, passIq: 70,
  drawFoul: 60, postControl: 50, interiorDefense: 60, perimeterDefense: 60,
  steal: 60, block: 50, offensiveRebound: 50, defensiveRebound: 60,
  durability: 80, intangibles: 70,
};

const record = (overrides: Partial<RealPlayerRecord>, attrs: Partial<PlayerAttributes> = {}) => ({
  name: 'Test Player', position: 'PG' as const, overall: 80, threePoint: 70, dunk: 60,
  attributes: { ...baseAttributes, ...attrs },
  ...overrides,
});

describe('deriveTraits (attribute sheet)', () => {
  it('elite off-ball shooter is not ball-dominant', () => {
    const traits = deriveTraits(
      record({ overall: 96, threePoint: 95 }, { ballHandle: 95, passAccuracy: 88, passVision: 88, passIq: 88 }),
    );
    expect(traits).toContain('sharpshooter');
    expect(traits).not.toContain('ball-dominant');
  });

  it('on-ball engine without an elite three is ball-dominant', () => {
    const traits = deriveTraits(record({ overall: 94, threePoint: 78 }, { ballHandle: 95 }));
    expect(traits).toContain('ball-dominant');
  });

  it('lob finisher big gets lob-threat', () => {
    const traits = deriveTraits(
      record({ position: 'C', overall: 85, threePoint: 40 }, { standingDunk: 95, vertical: 88 }),
    );
    expect(traits).toContain('lob-threat');
  });

  it('caps archetypes at 3 and adds at most one event-linked trait', () => {
    const traits = deriveTraits(
      record(
        { overall: 95, threePoint: 90 },
        {
          ballHandle: 95, passAccuracy: 95, passVision: 95, passIq: 95, speed: 90,
          standingDunk: 90, vertical: 90, steal: 90, perimeterDefense: 90,
          interiorDefense: 85, block: 88, postControl: 90, offensiveRebound: 90,
          defensiveRebound: 90, durability: 95,
        },
      ),
    );
    const eventLinked = traits.filter((t) => ['iron-man', 'injury-prone', 'hot-head'].includes(t));
    expect(traits.length - eventLinked.length).toBeLessThanOrEqual(3);
    expect(eventLinked).toEqual(['iron-man']);
  });

  it('low durability outranks other event traits', () => {
    const traits = deriveTraits(record({}, { durability: 55, intangibles: 30 }));
    expect(traits).toContain('injury-prone');
    expect(traits).not.toContain('hot-head');
  });

  it('falls back to legacy heuristics without an attribute sheet', () => {
    const legacy = deriveTraits({ name: 'Old Row', position: 'C', overall: 85, threePoint: 40, dunk: 70 });
    expect(legacy).toContain('rim-protector');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @perfect-season/sim`
Expected: FAIL — new assertions (e.g. `lob-threat` missing, off-ball star currently gets `ball-dominant`).

- [ ] **Step 3: Rewrite `deriveTraits`**

In `packages/sim/src/realPlayers.ts`, rename the existing function body to `deriveTraitsLegacy(record)` (unchanged logic) and add:

```typescript
/**
 * Deep traits from the scraped attribute sheet: up to 3 archetype traits
 * (strongest margins over their thresholds win) plus at most one
 * event-linked trait. Rows without a sheet use the legacy heuristics.
 * Thresholds are calibrated with scripts/trait-audit.ts.
 */
export function deriveTraits(record: RealPlayerRecord): string[] {
  const a = record.attributes;
  if (!a) return deriveTraitsLegacy(record);

  const { position, overall, threePoint, dunk } = record;
  const isBig = position === 'PF' || position === 'C';
  const passing = (a.passAccuracy + a.passVision + a.passIq) / 3;

  const candidates: { trait: string; margin: number }[] = [];
  const add = (trait: string, ...margins: number[]) =>
    candidates.push({ trait, margin: Math.min(...margins) });

  if (threePoint >= 88) add('sharpshooter', threePoint - 88);
  else if (threePoint >= 80) add(isBig ? 'stretch-big' : 'catch-and-shoot', threePoint - 80);
  if (passing >= 85) add(position === 'PG' || position === 'SG' ? 'playmaker' : 'point-forward', passing - 85);
  if (a.ballHandle >= 88 && overall >= 85 && threePoint < 88)
    add('ball-dominant', a.ballHandle - 88, overall - 85);
  if (dunk >= 85 && a.speed >= 80) add('slasher', dunk - 85, a.speed - 80);
  if (a.standingDunk >= 85 && a.vertical >= 80) add('lob-threat', a.standingDunk - 85, a.vertical - 80);
  if (a.postControl >= 85) add('post-scorer', a.postControl - 85);
  if (a.block >= 85 && a.interiorDefense >= 85) add('rim-protector', a.block - 85, a.interiorDefense - 85);
  if (a.steal >= 85 && a.perimeterDefense >= 85) add('pest-defender', a.steal - 85, a.perimeterDefense - 85);
  if (a.perimeterDefense >= 80 && a.interiorDefense >= 80)
    add('two-way', a.perimeterDefense - 80, a.interiorDefense - 80);
  if ((a.offensiveRebound + a.defensiveRebound) / 2 >= 85)
    add('rebounder', (a.offensiveRebound + a.defensiveRebound) / 2 - 85);

  candidates.sort((x, y) => y.margin - x.margin);
  const traits = [...new Set(candidates.map((c) => c.trait))].slice(0, 3);
  if (traits.length === 0) traits.push(deriveTraitsLegacy(record)[0]);

  if (a.durability <= 65) traits.push('injury-prone');
  else if (a.durability >= 90) traits.push('iron-man');
  else if (a.intangibles <= 40) traits.push('hot-head');

  return traits;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @perfect-season/sim`
Expected: PASS (including all pre-existing realPlayers tests — dual-position, salary bands, etc.).

- [ ] **Step 5: Write the audit script**

Create `scripts/trait-audit.ts`:

```typescript
/**
 * Trait calibration probe: prints trait frequency per pool and names the
 * ball-dominant players so thresholds can be sanity-checked against real
 * basketball knowledge. Run: npx tsx scripts/trait-audit.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EraDataset, NbaDataset, PlayerPool } from '@perfect-season/shared';
import { mapPoolPlayers } from '@perfect-season/sim';

const dir = join(__dirname, '..', 'data');
const nba: NbaDataset = JSON.parse(readFileSync(join(dir, 'nba-players.json'), 'utf-8'));
const eras: EraDataset = JSON.parse(readFileSync(join(dir, 'nba-players-eras.json'), 'utf-8'));

const pools: PlayerPool[] = [
  { mode: 'current', nba },
  { mode: 'classic', eras },
  { mode: 'all-time', eras },
];

for (const pool of pools) {
  const players = mapPoolPlayers(pool).map((m) => m.player);
  const counts = new Map<string, number>();
  for (const p of players) for (const t of p.traits) counts.set(t, (counts.get(t) ?? 0) + 1);
  console.log(`\n== ${pool.mode} (${players.length} players) ==`);
  for (const [trait, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${trait.padEnd(16)} ${n} (${((n / players.length) * 100).toFixed(1)}%)`);
  }
  const cooks = players.filter((p) => p.traits.includes('ball-dominant')).map((p) => p.name);
  console.log(`  ball-dominant: ${cooks.slice(0, 25).join(', ')}${cooks.length > 25 ? ', …' : ''}`);
}
```

(`mapPoolPlayers` is already exported from the sim package.)

- [ ] **Step 6: Calibrate**

Run: `npx tsx scripts/trait-audit.ts`
Acceptance bands — adjust the thresholds in `deriveTraits` (not the tests' spirit) until:
- `ball-dominant`: 3–8% of every pool, and the current-pool name list reads like actual on-ball engines (Doncic/Gilgeous-Alexander types, not Curry/Klay types).
- No archetype trait above 40% of a pool; every archetype nonzero in the all-time pool.
- `injury-prone` + `iron-man` combined under 25% of a pool.
The likeliest levers: raise `ballHandle` cutoff to 90, or add `a.drawFoul >= 80` as a third ball-dominant condition (foul-drawing is the best on-ball-creation proxy in the sheet). Re-run tests after any change.

- [ ] **Step 7: Commit**

```bash
git add packages/sim/src/realPlayers.ts packages/sim/src/realPlayers.test.ts scripts/trait-audit.ts
git commit -m "feat(sim): derive traits from the full attribute sheet, with audit script"
```

---

### Task 4: Chemistry — cohesion scaling, rule kinds, five new rules

**Files:**
- Modify: `packages/sim/src/chemistry.ts` (restructure)
- Modify: `packages/sim/src/league.ts:121-127` (`TRAITS_BY_POSITION`)
- Test: `packages/sim/src/chemistry.test.ts`

**Interfaces:**
- Consumes: `ChemistryKind`, `ChemistryEffect.kind` (Task 1); trait vocabulary (Task 3).
- Produces (Tasks 5, 8, 9 rely on these):
  - `computeChemistry(players: readonly Player[], cohesion = 0): ChemistryEffect[]`
  - `chemistryDelta(players: readonly Player[], cohesion = 0): number`
  - `CPU_COHESION = 0.75`, `FRICTION_RESOLVED_AT = 0.9`
  - `cohesionAfterGame(cohesion: number, won: boolean): number`
  - `cohesionAfterSigning(cohesion: number): number`
  - New effect ids: `lob-city`, `switchable`, `bench-mob`, `one-way-team`, `clogged-paint`, `pecking-order`

- [ ] **Step 1: Write failing tests**

Add to `packages/sim/src/chemistry.test.ts` (reuse the file's existing `player`-builder helper; if it doesn't set traits/position/offense/defense, add a local helper):

```typescript
const p = (over: Partial<Player>): Player => ({
  id: over.id ?? `p${Math.random()}`, name: 'T', position: 'SF', overall: 80,
  offense: 80, defense: 80, salary: 10, pWAR: 3, traits: [], ...over,
});

describe('cohesion scaling', () => {
  const cooks = [
    p({ id: 'a', traits: ['ball-dominant'] }),
    p({ id: 'b', traits: ['ball-dominant'] }),
    p({ id: 'c', traits: ['ball-dominant'] }),
    p({ id: 'd', traits: ['ball-dominant'] }),
  ];

  it('floors too-many-cooks at -3 and fades it with cohesion', () => {
    const fresh = computeChemistry(cooks, 0).find((e) => e.id === 'too-many-cooks')!;
    expect(fresh.strengthDelta).toBe(-3);
    expect(fresh.kind).toBe('friction');
    const half = computeChemistry(cooks, 0.5).find((e) => e.id === 'too-many-cooks')!;
    expect(half.strengthDelta).toBe(-1.5);
  });

  it('flips too-many-cooks into pecking-order once resolved', () => {
    const effects = computeChemistry(cooks, 0.95);
    expect(effects.some((e) => e.id === 'too-many-cooks')).toBe(false);
    const resolved = effects.find((e) => e.id === 'pecking-order')!;
    expect(resolved.strengthDelta).toBe(1);
  });

  it('deepens synergies and leaves structural rules alone', () => {
    const roster = [
      p({ traits: ['playmaker'] }),
      p({ traits: ['catch-and-shoot'] }),
      p({ traits: ['catch-and-shoot'] }),
    ];
    const fg0 = computeChemistry(roster, 0).find((e) => e.id === 'floor-general')!;
    const fg1 = computeChemistry(roster, 1).find((e) => e.id === 'floor-general')!;
    expect(fg1.strengthDelta).toBeCloseTo(fg0.strengthDelta * 1.25, 5);

    const bricks = Array.from({ length: 8 }, (_, i) => p({ id: `b${i}`, traits: [] }));
    const ns0 = computeChemistry(bricks, 0).find((e) => e.id === 'no-spacing')!;
    const ns1 = computeChemistry(bricks, 1).find((e) => e.id === 'no-spacing')!;
    expect(ns1.strengthDelta).toBe(ns0.strengthDelta);
  });
});

describe('cohesion progression', () => {
  it('wins gel faster than losses; clamped at 1', () => {
    expect(cohesionAfterGame(0, true)).toBeCloseTo(1 / 35);
    expect(cohesionAfterGame(0, false)).toBeCloseTo(0.4 / 35);
    expect(cohesionAfterGame(0.999, true)).toBe(1);
  });
  it('signings knock off 20%', () => {
    expect(cohesionAfterSigning(0.5)).toBeCloseTo(0.4);
  });
});

describe('new rules', () => {
  it('lob-city: playmaker plus finisher', () => {
    const roster = [p({ traits: ['playmaker'] }), p({ traits: ['lob-threat'], position: 'C' })];
    expect(computeChemistry(roster, 0).some((e) => e.id === 'lob-city')).toBe(true);
  });
  it('switchable: three defensive wings', () => {
    const roster = [
      p({ position: 'SG', traits: ['pest-defender'] }),
      p({ position: 'SF', traits: ['two-way'] }),
      p({ position: 'PF', traits: ['two-way'] }),
    ];
    expect(computeChemistry(roster, 0).some((e) => e.id === 'switchable')).toBe(true);
  });
  it('bench-mob: strong 6th-9th men', () => {
    const roster = Array.from({ length: 10 }, (_, i) =>
      p({ id: `r${i}`, overall: i < 5 ? 90 : 80, traits: ['sharpshooter'] }),
    );
    expect(computeChemistry(roster, 0).some((e) => e.id === 'bench-mob')).toBe(true);
  });
  it('one-way-team: offense far ahead of defense', () => {
    const roster = Array.from({ length: 8 }, (_, i) =>
      p({ id: `o${i}`, offense: 90, defense: 78, traits: ['sharpshooter'] }),
    );
    const effect = computeChemistry(roster, 0).find((e) => e.id === 'one-way-team')!;
    expect(effect.kind).toBe('structural');
  });
  it('clogged-paint: three non-shooting bigs', () => {
    const roster = [
      p({ position: 'C', traits: ['rim-protector'] }),
      p({ position: 'C', traits: ['rebounder'] }),
      p({ position: 'PF', traits: ['post-scorer'] }),
      p({ position: 'SG', traits: ['sharpshooter'] }),
      p({ position: 'SG', traits: ['sharpshooter'] }),
      p({ position: 'SF', traits: ['sharpshooter'] }),
    ];
    expect(computeChemistry(roster, 0).some((e) => e.id === 'clogged-paint')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @perfect-season/sim`
Expected: FAIL — `cohesionAfterGame` not exported, new rule ids missing, cooks not floored.

- [ ] **Step 3: Restructure `chemistry.ts`**

Replace the rule list and public API (keep `withTrait`/`ids` helpers):

```typescript
import type { ChemistryEffect, ChemistryKind, Player } from '@perfect-season/shared';

/** Established CPU rosters play as if mostly gelled. */
export const CPU_COHESION = 0.75;
/** At this cohesion, friction effects resolve (flip positive). */
export const FRICTION_RESOLVED_AT = 0.9;

const COHESION_FULL_UNITS = 35;
const COHESION_WIN_UNITS = 1;
const COHESION_LOSS_UNITS = 0.4;
const COHESION_SIGNING_RETENTION = 0.8;

export function cohesionAfterGame(cohesion: number, won: boolean): number {
  const units = won ? COHESION_WIN_UNITS : COHESION_LOSS_UNITS;
  return Math.min(1, cohesion + units / COHESION_FULL_UNITS);
}

/** New pieces re-learn each other: each signing costs 20% of cohesion. */
export function cohesionAfterSigning(cohesion: number): number {
  return cohesion * COHESION_SIGNING_RETENTION;
}

type BaseEffect = Omit<ChemistryEffect, 'kind'>;

interface ChemistryRule {
  kind: ChemistryKind;
  evaluate: (players: readonly Player[]) => BaseEffect | null;
  /** friction only: what the effect becomes once the team has gelled */
  resolve?: (base: BaseEffect) => BaseEffect;
}
```

`RULES: readonly ChemistryRule[]` — each existing rule becomes `{ kind, evaluate }` with its current body (drop the `kind` fields added in Task 1's compile fix; strip them back out of the literals). Changes and additions:

too-many-cooks (friction, floored, resolvable):

```typescript
  {
    kind: 'friction',
    evaluate: (players) => {
      const dominant = withTrait(players, 'ball-dominant');
      if (dominant.length < 2) return null;
      return {
        id: 'too-many-cooks',
        label: 'Too many cooks: multiple ball-dominant stars',
        strengthDelta: Math.max(-3, -1.5 * (dominant.length - 1)),
        playerIds: ids(dominant),
      };
    },
    resolve: (base) => ({
      id: 'pecking-order',
      label: 'Pecking order established: the stars know their roles',
      strengthDelta: 1,
      playerIds: base.playerIds,
    }),
  },
```

Five new rules:

```typescript
  {
    kind: 'synergy',
    evaluate: (players) => {
      const passers = withTrait(players, 'playmaker', 'point-forward');
      const finishers = withTrait(players, 'lob-threat', 'slasher');
      if (passers.length === 0 || finishers.length === 0) return null;
      return {
        id: 'lob-city',
        label: 'Lob threat: a playmaker throwing to a finisher',
        strengthDelta: 1.5,
        playerIds: ids([passers[0], finishers[0]]),
      };
    },
  },
  {
    kind: 'synergy',
    evaluate: (players) => {
      const wings = players.filter(
        (p) =>
          ['SG', 'SF', 'PF'].includes(p.position) &&
          p.traits.some((t) => t === 'two-way' || t === 'pest-defender'),
      );
      if (wings.length < 3) return null;
      return {
        id: 'switchable',
        label: 'Switchable: wings who guard one through four',
        strengthDelta: 1.5,
        playerIds: ids(wings.slice(0, 3)),
      };
    },
  },
  {
    kind: 'synergy',
    evaluate: (players) => {
      if (players.length < 9) return null;
      const bench = [...players].sort((a, b) => b.overall - a.overall).slice(5, 9);
      const avg = bench.reduce((s, p) => s + p.overall, 0) / bench.length;
      if (avg < 78) return null;
      return {
        id: 'bench-mob',
        label: 'Bench mob: the second unit holds leads',
        strengthDelta: 1,
        playerIds: ids(bench),
      };
    },
  },
  {
    kind: 'structural',
    evaluate: (players) => {
      if (players.length < 8) return null;
      const avgOff = players.reduce((s, p) => s + p.offense, 0) / players.length;
      const avgDef = players.reduce((s, p) => s + p.defense, 0) / players.length;
      if (avgOff - avgDef < 8) return null;
      return {
        id: 'one-way-team',
        label: 'One-way team: nobody gets back on defense',
        strengthDelta: -1.5,
        playerIds: [],
      };
    },
  },
  {
    kind: 'structural',
    evaluate: (players) => {
      const nonShootingBigs = players.filter(
        (p) =>
          (p.position === 'PF' || p.position === 'C') &&
          !p.traits.some((t) => ['sharpshooter', 'stretch-big', 'catch-and-shoot'].includes(t)),
      );
      if (nonShootingBigs.length < 3) return null;
      return {
        id: 'clogged-paint',
        label: 'Clogged paint: three non-shooting bigs',
        strengthDelta: -1.5,
        playerIds: ids(nonShootingBigs.slice(0, 3)),
      };
    },
  },
```

Public API:

```typescript
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Chemistry at a given cohesion: synergies deepen slightly as the team
 * gels, friction fades and eventually resolves, structural flaws persist.
 * Cohesion 0 = brand-new roster (draft screen), CPU teams pass CPU_COHESION.
 */
export function computeChemistry(players: readonly Player[], cohesion = 0): ChemistryEffect[] {
  const c = Math.min(1, Math.max(0, cohesion));
  const effects: ChemistryEffect[] = [];
  for (const rule of RULES) {
    const base = rule.evaluate(players);
    if (!base) continue;
    if (rule.kind === 'synergy') {
      effects.push({ ...base, kind: 'synergy', strengthDelta: round1(base.strengthDelta * (1 + 0.25 * c)) });
    } else if (rule.kind === 'structural') {
      effects.push({ ...base, kind: 'structural' });
    } else if (c >= FRICTION_RESOLVED_AT && rule.resolve) {
      effects.push({ ...rule.resolve(base), kind: 'friction' });
    } else {
      effects.push({ ...base, kind: 'friction', strengthDelta: round1(base.strengthDelta * (1 - c)) });
    }
  }
  return effects;
}

/** Net team-strength modifier from all active chemistry effects. */
export function chemistryDelta(players: readonly Player[], cohesion = 0): number {
  return computeChemistry(players, cohesion).reduce((sum, e) => sum + e.strengthDelta, 0);
}
```

- [ ] **Step 4: Extend procedural trait pools**

In `packages/sim/src/league.ts`, update `TRAITS_BY_POSITION` (keeps fictional mode's vocabulary in step):

```typescript
const TRAITS_BY_POSITION: Record<Position, readonly string[]> = {
  PG: ['playmaker', 'sharpshooter', 'pest-defender', 'ball-dominant'],
  SG: ['sharpshooter', 'slasher', 'ball-dominant', 'catch-and-shoot'],
  SF: ['two-way', 'slasher', 'catch-and-shoot', 'point-forward'],
  PF: ['stretch-big', 'rebounder', 'post-scorer', 'lob-threat'],
  C: ['rim-protector', 'rebounder', 'lob-threat', 'stretch-big'],
};

const EVENT_TRAITS = ['iron-man', 'injury-prone', 'hot-head'] as const;
```

In `generatePlayer`, after the archetype traits are drawn:

```typescript
  if (rng() < 0.1) traits.push(pick(rng, EVENT_TRAITS));
```

(This shifts procedural seeds — acceptable per Global Constraints. `PF` loses `two-way` to make room; existing chemistry rules still find `two-way` on SF.)

- [ ] **Step 5: Run tests, fix stragglers**

Run: `npm test -w @perfect-season/sim`
Expected: new tests PASS. Pre-existing chemistry/league tests that assert exact trait pools or exact effect objects may need mechanical updates (add `kind`, adjust pool expectations). Do not weaken behavioral assertions.

- [ ] **Step 6: Commit**

```bash
git add packages/sim/src/chemistry.ts packages/sim/src/chemistry.test.ts packages/sim/src/league.ts packages/sim/src/league.test.ts
git commit -m "feat(sim): cohesion-scaled chemistry with rule kinds and five new rules"
```

---

### Task 5: Thread cohesion through the game sim

**Files:**
- Modify: `packages/sim/src/game.ts`, `packages/sim/src/season.ts`
- Test: `packages/sim/src/game.test.ts`, `packages/sim/src/season.test.ts`

**Interfaces:**
- Consumes: `chemistryDelta(players, cohesion)`, `CPU_COHESION`, `cohesionAfterGame` (Task 4).
- Produces (Task 8 and UI rely on):
  - `effectiveStrength(team: Team, cohesion = CPU_COHESION): number`
  - `homeWinProbability(home: Team, away: Team, homeCohesion = CPU_COHESION, awayCohesion = CPU_COHESION): number`
  - `simulateGame(home, away, rng, homeCohesion = CPU_COHESION, awayCohesion = CPU_COHESION): GameResult`
  - `simulateScheduledGame(userTeam, game, opponent, rng, userCohesion = 0): GameResult`

- [ ] **Step 1: Write failing tests**

Add to `packages/sim/src/game.test.ts`:

```typescript
it('cohesion changes effective strength through chemistry', () => {
  const cooks: Team = {
    id: 't', name: 'T',
    players: ['a', 'b', 'c'].map((id) => ({
      id, name: id, position: 'PG' as const, overall: 90, offense: 90, defense: 90,
      salary: 30, pWAR: 8, traits: ['ball-dominant'],
    })),
  };
  expect(effectiveStrength(cooks, 1)).toBeGreaterThan(effectiveStrength(cooks, 0));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @perfect-season/sim`
Expected: FAIL — `effectiveStrength` takes one argument.

- [ ] **Step 3: Implement**

`packages/sim/src/game.ts` — import `CPU_COHESION` from `./chemistry` and thread the parameter:

```typescript
/** Ratings plus chemistry — what games are actually decided on. */
export function effectiveStrength(team: Team, cohesion = CPU_COHESION): number {
  return teamStrength(team) + chemistryDelta(team.players, cohesion);
}

export function homeWinProbability(
  home: Team,
  away: Team,
  homeCohesion = CPU_COHESION,
  awayCohesion = CPU_COHESION,
): number {
  const diff =
    effectiveStrength(home, homeCohesion) + HOME_COURT_BONUS - effectiveStrength(away, awayCohesion);
  return 1 / (1 + Math.exp(-diff / UPSET_FACTOR));
}

export function simulateGame(
  home: Team,
  away: Team,
  rng: Rng,
  homeCohesion = CPU_COHESION,
  awayCohesion = CPU_COHESION,
): GameResult {
  const homeWinProb = homeWinProbability(home, away, homeCohesion, awayCohesion);
  // ... rest unchanged
```

`packages/sim/src/season.ts`:

```typescript
/** Play a single scheduled game from the user team's perspective. */
export function simulateScheduledGame(
  userTeam: Team,
  game: ScheduledGame,
  opponent: Team,
  rng: Rng,
  userCohesion = 0,
): GameResult {
  return game.isHome
    ? simulateGame(userTeam, opponent, rng, userCohesion, CPU_COHESION)
    : simulateGame(opponent, userTeam, rng, CPU_COHESION, userCohesion);
}
```

and in `simulateSeason`, accumulate cohesion across the loop (import `cohesionAfterGame`, `CPU_COHESION` from `./chemistry`):

```typescript
  let cohesion = 0;
  for (const game of schedule) {
    // ...
    const result = simulateScheduledGame(userTeam, game, opponent, rng, cohesion);
    results.push(result);
    const won = result.winnerTeamId === userTeam.id;
    cohesion = cohesionAfterGame(cohesion, won);
    if (won) {
      wins++;
    } else {
      losses++;
      if (stopOnLoss) break;
    }
  }
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @perfect-season/sim && npm run typecheck`
Expected: PASS (existing game/season tests use defaults and still compile).

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/game.ts packages/sim/src/game.test.ts packages/sim/src/season.ts packages/sim/src/season.test.ts
git commit -m "feat(sim): cohesion parameter through game and season simulation"
```

---

### Task 6: Event engine — new events, context object, weighted targets

**Files:**
- Modify: `packages/sim/src/events.ts`
- Test: `packages/sim/src/events.test.ts`

**Interfaces:**
- Consumes: new `SeasonEvent` variants, `PendingNagging` (Task 1); traits `iron-man`/`injury-prone`/`hot-head` (Task 3).
- Produces (Task 8 relies on):
  - `EventChances` gains `illness: number; suspension: number; nagging: number`
  - `EventContext { chances?: EventChances; cards?: readonly EventCard[]; chemistry?: ReadonlyMap<string, readonly string[]>; nextOpponentTeamId?: string }`
  - `rollEvents(availablePlayers, rng, context?: EventContext): SeasonEvent[]` (replaces the positional chances/cards params)
  - `applyEvent` handles illness/suspension/revenge (nagging is a no-op there)
  - `resolveNagging(effects: ActiveEffects, pending: PendingNagging, choice: 'play' | 'sit'): ActiveEffects`
  - `REVENGE_CHANCE = 0.25`

- [ ] **Step 1: Write failing tests**

Add to `packages/sim/src/events.test.ts` (reuse its player-builder helper; extend it to accept `traits` and `originTeamId` overrides if it doesn't already). Where a test needs every chance-gate to fire deterministically, use the stub rng `() => 0.0001` — it opens every `rng() < chance` gate with a nonzero chance, makes `randInt(rng, a, b)` return `a`, and makes every pick take the first candidate:

```typescript
describe('new event types', () => {
  it('illness and suspension sideline players via the absence map', () => {
    let effects = emptyActiveEffects();
    effects = applyEvent(effects, { type: 'illness', playerId: 'p1', gamesOut: 2 });
    effects = applyEvent(effects, { type: 'suspension', playerId: 'p2', gamesOut: 1 });
    expect(effects.injuries).toEqual({ p1: 2, p2: 1 });
  });

  it('revenge applies a one-game rating boost', () => {
    const effects = applyEvent(emptyActiveEffects(), {
      type: 'revenge', playerId: 'p1', ratingDelta: 2, gamesRemaining: 1,
    });
    expect(effects.ratingMods.p1).toEqual({ delta: 2, gamesRemaining: 1 });
  });

  it('nagging is inert until resolved', () => {
    const event = { type: 'nagging', playerId: 'p1', playHurtDelta: -3, playHurtGames: 6, sitGames: 2 } as const;
    expect(applyEvent(emptyActiveEffects(), event)).toEqual(emptyActiveEffects());
    const pending = { playerId: 'p1', playHurtDelta: -3, playHurtGames: 6, sitGames: 2 };
    expect(resolveNagging(emptyActiveEffects(), pending, 'play').ratingMods.p1)
      .toEqual({ delta: -3, gamesRemaining: 6 });
    expect(resolveNagging(emptyActiveEffects(), pending, 'sit').injuries.p1).toBe(2);
  });
});

describe('rollEvents context', () => {
  it('revenge only fires against a rostered player\'s origin team', () => {
    const roster = [player({ id: 'p1', originTeamId: 'cpu-3' }), player({ id: 'p2' })];
    const zeroChances = { injury: 0, illness: 0, suspension: 0, nagging: 0, hotStreak: 0, slump: 0, morale: 0 };
    const fire = rollEvents(roster, () => 0.0001, { chances: zeroChances, nextOpponentTeamId: 'cpu-3' });
    expect(fire.some((e) => e.type === 'revenge' && e.playerId === 'p1')).toBe(true);
    const wrongTeam = rollEvents(roster, () => 0.0001, { chances: zeroChances, nextOpponentTeamId: 'cpu-9' });
    expect(wrongTeam.some((e) => e.type === 'revenge')).toBe(false);
  });

  it('cards with requires only fire while the chemistry effect is active, targeting its producers best-first', () => {
    const card: EventCard = {
      id: 'gated', title: 'G', text: 't', requires: 'chemistry-effect:too-many-cooks',
      choices: [
        { id: 'a', label: 'A', effects: [{ type: 'none' }] },
        { id: 'b', label: 'B', effects: [{ type: 'cohesion', delta: 0.3 }] },
      ],
    };
    const roster = [
      player({ id: 'low', overall: 85 }), player({ id: 'high', overall: 95 }), player({ id: 'other' }),
    ];
    const chances = { injury: 0, illness: 0, suspension: 0, nagging: 0, hotStreak: 0, slump: 0, morale: 1 };
    const without = rollEvents(roster, () => 0.0001, { chances, cards: [card] });
    expect(without.some((e) => e.type === 'morale')).toBe(false);
    const withEffect = rollEvents(roster, () => 0.0001, {
      chances, cards: [card],
      chemistry: new Map([['too-many-cooks', ['low', 'high']]]),
    });
    const morale = withEffect.find((e) => e.type === 'morale')!;
    expect(morale.playerIds).toEqual(['high', 'low']);
  });

  it('weights injury targets by durability traits', () => {
    const roster = [
      player({ id: 'tank', traits: ['iron-man'] }),
      player({ id: 'glass', traits: ['injury-prone'] }),
    ];
    const chances = { injury: 1, illness: 0, suspension: 0, nagging: 0, hotStreak: 0, slump: 0, morale: 0 };
    let glassHits = 0;
    for (let seed = 0; seed < 200; seed++) {
      const events = rollEvents(roster, createRng(seed), { chances });
      if (events.some((e) => e.type === 'injury' && e.playerId === 'glass')) glassHits++;
    }
    expect(glassHits).toBeGreaterThan(120); // 4:1 weighting ≈ 80%
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @perfect-season/sim`
Expected: FAIL — new chances fields, context signature, `resolveNagging` missing.

- [ ] **Step 3: Implement in `events.ts`**

```typescript
export interface EventChances {
  injury: number;
  illness: number;
  suspension: number;
  nagging: number;
  hotStreak: number;
  slump: number;
  morale: number;
}

/** Per-game base probabilities; difficulty modifiers scale these. */
export const BASE_EVENT_CHANCES: EventChances = {
  injury: 0.05,
  illness: 0.03,
  suspension: 0.015,
  nagging: 0.02,
  hotStreak: 0.08,
  slump: 0.06,
  morale: 0.06,
};

export function scaleChances(chances: EventChances, multiplier: number): EventChances {
  return Object.fromEntries(
    Object.entries(chances).map(([key, value]) => [key, value * multiplier]),
  ) as unknown as EventChances;
}

/** Chance a revenge boost fires when a player faces his old team. */
export const REVENGE_CHANCE = 0.25;

export interface EventContext {
  chances?: EventChances;
  cards?: readonly EventCard[];
  /** Active chemistry effects on the roster: id -> producing player ids */
  chemistry?: ReadonlyMap<string, readonly string[]>;
  /** Next game's opponent, for revenge events */
  nextOpponentTeamId?: string;
}

const injuryWeight = (p: Player) =>
  p.traits.includes('iron-man') ? 0.5 : p.traits.includes('injury-prone') ? 2 : 1;
const suspensionWeight = (p: Player) => (p.traits.includes('hot-head') ? 3 : 1);

function weightedPick(rng: Rng, players: readonly Player[], weight: (p: Player) => number): Player {
  const total = players.reduce((sum, p) => sum + weight(p), 0);
  let roll = rng() * total;
  for (const p of players) {
    roll -= weight(p);
    if (roll <= 0) return p;
  }
  return players[players.length - 1];
}

function cardEligible(card: EventCard, chemistry: EventContext['chemistry']): boolean {
  if (!card.requires) return true;
  const effectId = card.requires.replace(/^chemistry-effect:/, '');
  return (chemistry?.get(effectId)?.length ?? 0) >= 2;
}
```

Rewrite `rollEvents` — one roll gate per event type, fixed order (injury, illness, suspension, nagging, hot-streak, slump, revenge, morale):

```typescript
/**
 * Roll the between-game events. `availablePlayers` should exclude anyone
 * already sidelined. Morale events fire only when a card pool is provided;
 * cards with `requires` also need the matching chemistry effect active.
 */
export function rollEvents(
  availablePlayers: readonly Player[],
  rng: Rng,
  context: EventContext = {},
): SeasonEvent[] {
  if (availablePlayers.length === 0) return [];
  const chances = context.chances ?? BASE_EVENT_CHANCES;
  const events: SeasonEvent[] = [];

  if (rng() < chances.injury) {
    events.push(rollInjury(rng, weightedPick(rng, availablePlayers, injuryWeight).id));
  }
  if (rng() < chances.illness) {
    events.push({
      type: 'illness',
      playerId: weightedPick(rng, availablePlayers, injuryWeight).id,
      gamesOut: randInt(rng, 1, 2),
    });
  }
  if (rng() < chances.suspension) {
    events.push({
      type: 'suspension',
      playerId: weightedPick(rng, availablePlayers, suspensionWeight).id,
      gamesOut: 1,
    });
  }
  if (rng() < chances.nagging) {
    events.push({
      type: 'nagging',
      playerId: pick(rng, availablePlayers).id,
      playHurtDelta: -3,
      playHurtGames: randInt(rng, 5, 8),
      sitGames: randInt(rng, 2, 3),
    });
  }
  if (rng() < chances.hotStreak) {
    events.push({
      type: 'hot-streak',
      playerId: pick(rng, availablePlayers).id,
      ratingDelta: randInt(rng, 2, 5),
      gamesRemaining: randInt(rng, 3, 8),
    });
  }
  if (rng() < chances.slump) {
    events.push({
      type: 'slump',
      playerId: pick(rng, availablePlayers).id,
      ratingDelta: -randInt(rng, 2, 5),
      gamesRemaining: randInt(rng, 3, 8),
    });
  }
  if (context.nextOpponentTeamId) {
    const returning = availablePlayers.filter(
      (p) => p.originTeamId === context.nextOpponentTeamId,
    );
    if (returning.length > 0 && rng() < REVENGE_CHANCE) {
      events.push({
        type: 'revenge',
        playerId: pick(rng, returning).id,
        ratingDelta: 2,
        gamesRemaining: 1,
      });
    }
  }
  const cards = (context.cards ?? []).filter((c) => cardEligible(c, context.chemistry));
  if (cards.length > 0 && rng() < chances.morale) {
    const card = pick(rng, cards);
    let involved: string[];
    if (card.requires) {
      const producers = new Set(
        context.chemistry!.get(card.requires.replace(/^chemistry-effect:/, ''))!,
      );
      involved = availablePlayers
        .filter((p) => producers.has(p.id))
        .sort((a, b) => b.overall - a.overall)
        .map((p) => p.id);
    } else {
      const involvedCount = Math.min(randInt(rng, 1, 2), availablePlayers.length);
      involved = [];
      while (involved.length < involvedCount) {
        const candidate = pick(rng, availablePlayers).id;
        if (!involved.includes(candidate)) involved.push(candidate);
      }
    }
    if (involved.length > 0) events.push({ type: 'morale', cardId: card.id, playerIds: involved });
  }
  return events;
}
```

Extend `applyEvent` (absences merge with `Math.max` so two same-game absences don't shrink):

```typescript
export function applyEvent(effects: ActiveEffects, event: SeasonEvent): ActiveEffects {
  switch (event.type) {
    case 'injury':
    case 'illness':
    case 'suspension':
      return {
        ...effects,
        injuries: {
          ...effects.injuries,
          [event.playerId]: Math.max(effects.injuries[event.playerId] ?? 0, event.gamesOut),
        },
      };
    case 'hot-streak':
    case 'slump':
      return {
        ...effects,
        ratingMods: mergeRatingMod(effects.ratingMods, event.playerId, event.ratingDelta, event.gamesRemaining),
      };
    case 'revenge':
      return {
        ...effects,
        ratingMods: mergeRatingMod(effects.ratingMods, event.playerId, event.ratingDelta, event.gamesRemaining),
      };
    case 'nagging':
    case 'morale':
      return effects;
  }
}

/** Apply the play-hurt/sit decision on a nagging injury. */
export function resolveNagging(
  effects: ActiveEffects,
  pending: PendingNagging,
  choice: 'play' | 'sit',
): ActiveEffects {
  if (choice === 'play') {
    return {
      ...effects,
      ratingMods: mergeRatingMod(effects.ratingMods, pending.playerId, pending.playHurtDelta, pending.playHurtGames),
    };
  }
  return {
    ...effects,
    injuries: { ...effects.injuries, [pending.playerId]: pending.sitGames },
  };
}
```

Update the two existing `rollEvents` call sites to the context signature: `run.ts` (Task 8 rewrites it anyway — do the minimal `{ chances, cards }` fix now so it compiles) and any existing tests in `events.test.ts` (`rollEvents(players, rng, chances, cards)` → `rollEvents(players, rng, { chances, cards })`; old `EventChances` literals need the three new keys).

- [ ] **Step 4: Run tests**

Run: `npm test -w @perfect-season/sim && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/events.ts packages/sim/src/events.test.ts packages/sim/src/run.ts
git commit -m "feat(sim): illness, suspension, nagging, and revenge events with weighted targets"
```

---

### Task 7: Card schema — absence/cohesion effects, alpha targets, requires, resolution card

**Files:**
- Modify: `packages/sim/src/events.ts` (`resolveCardChoice`, `validateEventCards`)
- Modify: `data/event-cards.json` (add one card)
- Test: `packages/sim/src/events.test.ts`, `packages/sim/src/content.test.ts` (existing content test guards the data file)

**Interfaces:**
- Consumes: `CardEffect`/`CardTarget`/`EventCard.requires` (Task 1).
- Produces (Task 8 relies on): `resolveCardChoice(effects, card, choiceId, involvedPlayerIds, rosterPlayerIds): { effects: ActiveEffects; cohesionDelta: number }` — involvedPlayerIds arrive sorted best-first (Task 6 guarantees it for `requires` cards), so `alpha` = index 0, `supporting` = the rest.

- [ ] **Step 1: Write failing tests**

```typescript
describe('resolveCardChoice extensions', () => {
  const card: EventCard = {
    id: 'alpha-card', title: 'T', text: 't',
    choices: [
      {
        id: 'pick-alpha', label: 'Name the alpha',
        effects: [
          { type: 'rating', delta: 2, games: 6, target: 'alpha' },
          { type: 'rating', delta: -2, games: 4, target: 'supporting' },
          { type: 'cohesion', delta: 0.3 },
        ],
      },
      {
        id: 'bench', label: 'Sit them down',
        effects: [{ type: 'absence', games: 2, target: 'involved' }],
      },
    ],
  };

  it('resolves alpha/supporting targets and returns the cohesion delta', () => {
    const { effects, cohesionDelta } = resolveCardChoice(
      emptyActiveEffects(), card, 'pick-alpha', ['best', 'second', 'third'], ['best', 'second', 'third', 'role'],
    );
    expect(effects.ratingMods.best).toEqual({ delta: 2, gamesRemaining: 6 });
    expect(effects.ratingMods.second).toEqual({ delta: -2, gamesRemaining: 4 });
    expect(effects.ratingMods.role).toBeUndefined();
    expect(cohesionDelta).toBeCloseTo(0.3);
  });

  it('applies absence effects', () => {
    const { effects, cohesionDelta } = resolveCardChoice(
      emptyActiveEffects(), card, 'bench', ['a', 'b'], ['a', 'b', 'c'],
    );
    expect(effects.injuries).toEqual({ a: 2, b: 2 });
    expect(cohesionDelta).toBe(0);
  });
});

describe('validateEventCards extensions', () => {
  it('rejects bad requires, zero-cohesion, and bad absence games', () => {
    const bad: EventCard[] = [{
      id: 'x', title: 'X', text: 'x', requires: 'weather:rainy',
      choices: [
        { id: 'a', label: 'A', effects: [{ type: 'cohesion', delta: 0 }] },
        { id: 'b', label: 'B', effects: [{ type: 'absence', games: 0, target: 'involved' }] },
      ],
    }];
    const errors = validateEventCards(bad);
    expect(errors.some((e) => e.includes('requires'))).toBe(true);
    expect(errors.some((e) => e.includes('cohesion'))).toBe(true);
    expect(errors.some((e) => e.includes('absence') || e.includes('games'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @perfect-season/sim`
Expected: FAIL — `resolveCardChoice` returns bare `ActiveEffects` today.

- [ ] **Step 3: Implement**

`resolveCardChoice` in `events.ts`:

```typescript
function targetIds(
  target: CardTarget,
  involved: readonly string[],
  roster: readonly string[],
): readonly string[] {
  switch (target) {
    case 'team':
      return roster;
    case 'involved':
      return involved;
    case 'alpha':
      return involved.slice(0, 1);
    case 'supporting':
      return involved.slice(1);
  }
}

/**
 * Apply the player's choice on a card. Involved ids arrive sorted by
 * overall (best first), which is what makes 'alpha' meaningful.
 */
export function resolveCardChoice(
  effects: ActiveEffects,
  card: EventCard,
  choiceId: string,
  involvedPlayerIds: readonly string[],
  rosterPlayerIds: readonly string[],
): { effects: ActiveEffects; cohesionDelta: number } {
  const choice = card.choices.find((c) => c.id === choiceId);
  if (!choice) {
    throw new Error(`Card ${card.id} has no choice ${choiceId}`);
  }
  let next = effects;
  let cohesionDelta = 0;
  for (const effect of choice.effects) {
    if (effect.type === 'cohesion') {
      cohesionDelta += effect.delta;
    } else if (effect.type === 'rating') {
      for (const playerId of targetIds(effect.target, involvedPlayerIds, rosterPlayerIds)) {
        next = { ...next, ratingMods: mergeRatingMod(next.ratingMods, playerId, effect.delta, effect.games) };
      }
    } else if (effect.type === 'absence') {
      for (const playerId of targetIds(effect.target, involvedPlayerIds, rosterPlayerIds)) {
        next = {
          ...next,
          injuries: { ...next.injuries, [playerId]: Math.max(next.injuries[playerId] ?? 0, effect.games) },
        };
      }
    }
  }
  return { effects: next, cohesionDelta };
}
```

`validateEventCards` — extend the per-card checks:

```typescript
    if (card.requires !== undefined && !/^chemistry-effect:[a-z][a-z-]*$/.test(card.requires)) {
      errors.push(`Card ${card.id}: bad requires "${card.requires}"`);
    }
```

and the per-effect checks (`VALID_TARGETS = ['involved', 'team', 'alpha', 'supporting']`):

```typescript
        if (effect.type === 'rating') {
          if (effect.delta === 0) errors.push(`Card ${card.id}/${choice.id}: rating delta of 0`);
          if (effect.games < 1) errors.push(`Card ${card.id}/${choice.id}: games must be >= 1`);
          if (!VALID_TARGETS.includes(effect.target)) errors.push(`Card ${card.id}/${choice.id}: bad target`);
        } else if (effect.type === 'absence') {
          if (effect.games < 1) errors.push(`Card ${card.id}/${choice.id}: absence games must be >= 1`);
          if (!VALID_TARGETS.includes(effect.target)) errors.push(`Card ${card.id}/${choice.id}: bad target`);
        } else if (effect.type === 'cohesion') {
          if (effect.delta === 0) errors.push(`Card ${card.id}/${choice.id}: cohesion delta of 0`);
          if (Math.abs(effect.delta) > 1) errors.push(`Card ${card.id}/${choice.id}: cohesion delta out of range`);
        } else if (effect.type !== 'none') {
          errors.push(`Card ${card.id}/${choice.id}: unknown effect type`);
        }
```

Update the Task 6 minimal fix in `run.ts` if the compiler complains about the new return shape — destructure and drop `cohesionDelta` for now (Task 8 uses it).

- [ ] **Step 4: Add the resolution card to `data/event-cards.json`**

```json
  {
    "id": "whose-team-is-this",
    "title": "Whose Team Is This?",
    "requires": "chemistry-effect:too-many-cooks",
    "text": "Beat writers keep asking who the offense runs through, and {player} answered \"me\" on live TV. The other stars saw the clip before the bus left.",
    "choices": [
      {
        "id": "name-alpha",
        "label": "Name your alpha — the offense runs through your best player",
        "effects": [
          { "type": "rating", "delta": 2, "games": 6, "target": "alpha" },
          { "type": "rating", "delta": -2, "games": 4, "target": "supporting" },
          { "type": "cohesion", "delta": 0.3 }
        ]
      },
      {
        "id": "let-them-sort",
        "label": "Say nothing — let the hierarchy sort itself out on the court",
        "effects": [{ "type": "none" }]
      }
    ]
  }
```

- [ ] **Step 5: Run tests**

Run: `npm test -w @perfect-season/sim`
Expected: PASS, including `content.test.ts` validating the new card against the extended schema.

- [ ] **Step 6: Commit**

```bash
git add packages/sim/src/events.ts packages/sim/src/events.test.ts data/event-cards.json
git commit -m "feat(sim): absence/cohesion card effects, alpha targets, gated resolution card"
```

---

### Task 8: Run-loop integration

**Files:**
- Modify: `packages/sim/src/run.ts`, `packages/sim/src/draft.ts:195-223` (`pickPlayer`)
- Modify: `packages/sim/src/index.ts` (export `runResolveNagging`, `CPU_COHESION` if not re-exported already — the package re-exports each module; verify)
- Test: `packages/sim/src/run.test.ts`, `packages/sim/src/draft.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces (store/UI rely on): `runResolveNagging(run: RunState, choice: 'play' | 'sit'): RunState`; `playNextGame` blocks on `pendingNagging`; drafted players carry `originTeamId`.

- [ ] **Step 1: Write failing tests**

Add to `packages/sim/src/draft.test.ts`:

```typescript
it('stamps originTeamId on drafted players', () => {
  // use the file's existing helper that drafts one player from a created run/league
  expect(draftedPlayer.originTeamId).toBe(rolledTeamIdAtPickTime);
});
```

Add to `packages/sim/src/run.test.ts` (follow the file's existing run-construction helpers):

```typescript
it('season starts at cohesion 0 and gels after games', () => {
  const run = startSeason(draftFullRoster(createRun(1)));
  expect(run.season!.cohesion).toBe(0);
  const after = playNextGame(run);
  expect(after.season!.cohesion).toBeGreaterThan(0);
});

it('signing a free agent costs cohesion', () => {
  // casual run: no cap, so the signing below can never fail a cap check
  let run = startSeason(draftFullRoster(createRun(1, 0, undefined, true)));
  while (run.season!.cohesion === 0 && run.status === 'in-season') run = playNextGame(run);
  const before = run.season!.cohesion;
  // free up a roster slot, then sign the cheapest available free agent
  const cut = [...run.roster].sort((a, b) => a.overall - b.overall)[0];
  run = runWaivePlayer(run, cut.id);
  const agent = currentFreeAgents(run).sort((a, b) => a.salary - b.salary)[0];
  run = runSignPlayer(run, agent);
  expect(run.season!.cohesion).toBeCloseTo(before * 0.8);
});

it('a pending nagging decision blocks the next game and resolves', () => {
  // construct a run whose season has pendingNagging set manually:
  const withPending = {
    ...run,
    season: { ...run.season!, pendingNagging: { playerId, playHurtDelta: -3, playHurtGames: 6, sitGames: 2 } },
  };
  expect(() => playNextGame(withPending)).toThrow(/nagging/i);
  const resolved = runResolveNagging(withPending, 'sit');
  expect(resolved.season!.pendingNagging).toBeNull();
  expect(resolved.season!.effects.injuries[playerId]).toBe(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @perfect-season/sim`
Expected: FAIL.

- [ ] **Step 3: Implement**

`draft.ts` `pickPlayer` — stamp origin when building the roster entry:

```typescript
  const roster = [
    ...state.roster,
    { ...assignPosition(player, position), originTeamId: state.rolledTeamId },
  ];
```

`run.ts` changes (import `cohesionAfterGame`, `cohesionAfterSigning`, `computeChemistry` from `./chemistry`, `resolveNagging` from `./events`):

`playNextGame`:
- Block on both pendings:

```typescript
  if (season.pendingCard || season.pendingNagging) {
    throw new Error('Resolve the pending decision (event card / nagging injury) before playing');
  }
```

- Pass cohesion into the sim: `simulateScheduledGame(userTeam(run), scheduled, opponent, gameRng, season.cohesion)`.
- After the result, update cohesion: `const cohesion = cohesionAfterGame(season.cohesion, won);`
- Build the event context (next game is `gameIndex + 1`):

```typescript
  let pendingNagging: PendingNagging | null = null;
  if (status === 'in-season') {
    const mods = difficultyFor(run.ascension);
    const eventRng = createRng(deriveSeed(run.seed, EVENT_STREAM_BASE + gameIndex));
    const available = availableRoster(run.roster, effects);
    const chemistry = new Map(
      computeChemistry(available, cohesion).map((e) => [e.id, e.playerIds] as const),
    );
    const rolled = rollEvents(available, eventRng, {
      chances: scaleChances(BASE_EVENT_CHANCES, mods.eventChanceMultiplier),
      cards,
      chemistry,
      nextOpponentTeamId: season.schedule[gameIndex + 1]?.opponentTeamId,
    });
    for (const event of rolled) {
      events.push(event);
      if (event.type === 'morale') {
        pendingCard = { cardId: event.cardId, playerIds: event.playerIds };
      } else if (event.type === 'nagging') {
        pendingNagging = {
          playerId: event.playerId,
          playHurtDelta: event.playHurtDelta,
          playHurtGames: event.playHurtGames,
          sitGames: event.sitGames,
        };
      } else {
        effects = applyEvent(effects, event);
      }
    }
  }
```

- Return the new fields: `season: { ...season, results: [...], events, effects, pendingCard, pendingNagging, cohesion }`.

`resolvePendingCard` — apply the cohesion delta:

```typescript
  const { effects, cohesionDelta } = resolveCardChoice(
    season.effects, card, choiceId, season.pendingCard.playerIds, run.roster.map((p) => p.id),
  );
  return {
    ...run,
    season: {
      ...season,
      effects,
      pendingCard: null,
      cohesion: Math.min(1, Math.max(0, season.cohesion + cohesionDelta)),
    },
  };
```

New transition:

```typescript
/** Resolve a pending nagging-injury decision: play him hurt or sit him. */
export function runResolveNagging(run: RunState, choice: 'play' | 'sit'): RunState {
  const season = run.season;
  if (!season?.pendingNagging) {
    throw new Error('No pending nagging injury to resolve');
  }
  const effects = resolveNagging(season.effects, season.pendingNagging, choice);
  return { ...run, season: { ...season, effects, pendingNagging: null } };
}
```

`runSignPlayer` — after the successful sign:

```typescript
  return {
    ...run,
    roster: signPlayer(run.roster, player, season.deadCap + capReduction),
    season: { ...season, cohesion: cohesionAfterSigning(season.cohesion) },
  };
```

`runWaivePlayer` — also clear a pending nagging decision for the departed player (mirror the effects cleanup): if `season.pendingNagging?.playerId === playerId`, set it to null in the returned season.

Verify `packages/sim/src/index.ts` re-exports the new names (`runResolveNagging`, `CPU_COHESION`, `cohesionAfterGame` come along automatically if it does `export * from './run'` etc.; add explicit exports if the file lists names individually).

- [ ] **Step 4: Run tests**

Run: `npm test -w @perfect-season/sim && npm run typecheck`
Expected: PASS. The run smoke tests (full-season drivers) should complete with the new events firing.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/run.ts packages/sim/src/run.test.ts packages/sim/src/draft.ts packages/sim/src/draft.test.ts packages/sim/src/index.ts
git commit -m "feat(sim): cohesion lifecycle, nagging decisions, and revenge context in the run loop"
```

---

### Task 9: Frontend wiring

**Files:**
- Modify: `apps/web/src/store.ts`
- Modify: `apps/web/src/components/EventLine.tsx`, `apps/web/src/components/EventCardModal.tsx`, `apps/web/src/components/ChemistryPanel.tsx`
- Create: `apps/web/src/components/NaggingModal.tsx`
- Modify: `apps/web/src/screens/SeasonScreen.tsx`

**Interfaces:**
- Consumes: `runResolveNagging`, cohesion-aware `computeChemistry`/`chemistryDelta`/`effectiveStrength`/`homeWinProbability` (Tasks 4/5/8).
- Produces: user-visible surface; no downstream consumers.

- [ ] **Step 1: Store**

`apps/web/src/store.ts`:
- Import `runResolveNagging` from `@perfect-season/sim`.
- Add to `GameStore`: `resolveNagging: (choice: 'play' | 'sit') => void;` and implement:

```typescript
      resolveNagging: (choice) => set({ run: runResolveNagging(get().run!, choice) }),
```

- `simToNextEvent` loop condition becomes:

```typescript
        while (next.status === 'in-season' && !next.season!.pendingCard && !next.season!.pendingNagging) {
```

- [ ] **Step 2: Event log lines**

`EventLine.tsx` — extend `describeEvent` and `EVENT_ICON` (the `Record<SeasonEvent['type'], string>` type forces completeness):

```typescript
    case 'illness':
      return `${anyPlayerName(run, event.playerId)} is under the weather — out ${event.gamesOut} game${event.gamesOut === 1 ? '' : 's'}`;
    case 'suspension':
      return `${anyPlayerName(run, event.playerId)} suspended ${event.gamesOut} game${event.gamesOut === 1 ? '' : 's'}`;
    case 'revenge':
      return `${anyPlayerName(run, event.playerId)} circled this one — facing his old team (+${event.ratingDelta})`;
    case 'nagging':
      return `${anyPlayerName(run, event.playerId)} is nursing a nagging injury — decision needed`;
```

```typescript
  illness: '🤒',
  suspension: '🚫',
  revenge: '😤',
  nagging: '🦵',
```

- [ ] **Step 3: Card modal effect descriptions**

`EventCardModal.tsx` `describeEffect`:

```typescript
function describeEffect(effect: CardEffect): string | null {
  if (effect.type === 'none') return null;
  if (effect.type === 'cohesion') {
    return effect.delta > 0 ? 'Team gels faster' : 'Team chemistry takes a hit';
  }
  const who =
    effect.target === 'team'
      ? 'whole team'
      : effect.target === 'alpha'
        ? 'your best player involved'
        : effect.target === 'supporting'
          ? 'the other involved players'
          : 'involved player(s)';
  if (effect.type === 'absence') {
    return `${who} sit${effect.target === 'alpha' ? 's' : ''} ${effect.games} game${effect.games === 1 ? '' : 's'}`;
  }
  const sign = effect.delta > 0 ? '+' : '';
  return `${sign}${effect.delta} OVR to ${who} for ${effect.games} games`;
}
```

- [ ] **Step 4: Nagging decision modal**

Create `apps/web/src/components/NaggingModal.tsx` (reuse the event-card modal styles):

```tsx
import { anyPlayerName } from '../format';
import { useGameStore } from '../store';
import './EventCardModal.css';

export function NaggingModal() {
  const run = useGameStore((s) => s.run)!;
  const resolveNagging = useGameStore((s) => s.resolveNagging);

  const pending = run.season?.pendingNagging;
  if (!pending) return null;

  const name = anyPlayerName(run, pending.playerId);
  return (
    <div className="modal-backdrop">
      <div className="modal event-card" role="dialog" aria-modal="true" aria-label="Nagging injury">
        <span className="event-card-kicker">Training room</span>
        <h3>Nagging Injury</h3>
        <p className="event-card-text">
          {name} tweaked something. He says he can play through it, but the trainers want him down.
        </p>
        <div className="event-card-choices">
          <button type="button" className="event-card-choice" onClick={() => resolveNagging('play')}>
            <span className="event-card-choice-label">Let him play through it</span>
            <span className="event-card-choice-effects muted">
              {pending.playHurtDelta} OVR for {pending.playHurtGames} games
            </span>
          </button>
          <button type="button" className="event-card-choice" onClick={() => resolveNagging('sit')}>
            <span className="event-card-choice-label">Sit him until it heals</span>
            <span className="event-card-choice-effects muted">Out {pending.sitGames} games</span>
          </button>
        </div>
      </div>
    </div>
  );
}
```

Render `<NaggingModal />` immediately next to wherever `<EventCardModal />` is rendered (find it — `SeasonScreen.tsx` or `App.tsx` — and mirror it).

- [ ] **Step 5: Chemistry panel with cohesion**

`ChemistryPanel.tsx` — add an optional `cohesion` prop; when provided, show a cohesion line and annotate kinds:

```tsx
export function ChemistryPanel({
  effects,
  delta,
  cohesion,
}: {
  effects: readonly ChemistryEffect[];
  delta: number;
  cohesion?: number;
}) {
```

Under the panel head, when `cohesion !== undefined`:

```tsx
      {cohesion !== undefined && (
        <p className="muted chem-cohesion">
          Cohesion {Math.round(cohesion * 100)}% — friction fades as the team gels
        </p>
      )}
```

And per effect item, after the label:

```tsx
              {effect.kind === 'friction' && effect.strengthDelta < 0 && (
                <span className="muted"> · resolving with wins</span>
              )}
              {effect.kind === 'structural' && (
                <span className="muted"> · fix via roster moves</span>
              )}
```

- [ ] **Step 6: Season screen cohesion plumbing**

`SeasonScreen.tsx`: let `cohesion = run.season!.cohesion`.
- Win probability (line ~56): `homeWinProbability(userTeam, opponent, cohesion)` when home; `1 - homeWinProbability(opponent, userTeam, CPU_COHESION, cohesion)` when away (import `CPU_COHESION` from `@perfect-season/sim`; the 4-arg defaults make the home case fine with 3 args).
- User strength readout (line ~190): `effectiveStrength(userTeam, cohesion)`.
- Chemistry panel (line ~342): `<ChemistryPanel effects={computeChemistry(run.roster, cohesion)} delta={chemistryDelta(run.roster, cohesion)} cohesion={cohesion} />`.
- Power rankings (line ~71) stay CPU-default.
`DraftScreen.tsx` needs no change (defaults to cohesion 0, which is correct for an unplayed roster).

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run lint && npm run build && npm test -w @perfect-season/sim`
Expected: all clean. Then `npm run dev`, start a quick casual run, and smoke-check: chemistry panel shows cohesion, playing games raises it, event log renders (sim-to-next-event a few times to see new events).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): cohesion readout, nagging decision modal, new event log lines"
```

---

### Task 10: Balance verification and docs

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/GAME_DESIGN.md`
- Run: `scripts/balance-check.ts`, `scripts/trait-audit.ts`

- [ ] **Step 1: Trait audit re-check**

Run: `npx tsx scripts/trait-audit.ts`
Confirm the Task 3 acceptance bands still hold after any later changes.

- [ ] **Step 2: Balance check**

Run: `npx tsx scripts/balance-check.ts`
Baseline (decisions log): casual all-time superteam ~97% avg per-game win probability at factor 3.5. Acceptance: avg P within a few points of baseline (≥ 90%). Note that this probe uses `effectiveStrength` defaults (CPU cohesion) — early-season user teams will sit slightly lower and gelled teams slightly higher than the printed number; that spread is the intended new arc. If stacked teams now grade wildly differently (e.g. avg P < 85%), revisit the too-many-cooks floor or trait thresholds before shipping.

- [ ] **Step 3: Update docs**

`docs/ROADMAP.md`:
- Phase 3: extend the chemistry line with cohesion (season-long arc, friction/structural kinds, five new rules) and the events lines with the four new event types; note the card-schema extensions (`absence`/`cohesion` effects, `requires` gating) and the 13th card.
- Decisions log rows (today's date), one line each: cohesion = single scalar on SeasonState (rationale: gradual gelling + FA shake-ups + card jumps with minimal state); friction vs structural anti-synergies (coaching solves behavior, not roster construction); traits from full attribute sheet (data was already on the scraped pages); `hot-head` from low intangibles as documented proxy.

`docs/GAME_DESIGN.md`: update the Chemistry section — synergies/anti-synergies now evolve via cohesion; mention friction resolution ("superteams gel") and structural flaws.

- [ ] **Step 4: Full suite and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green.

```bash
git add docs/ROADMAP.md docs/GAME_DESIGN.md
git commit -m "docs: chemistry arc, deep traits, and event diversity shipped"
```
