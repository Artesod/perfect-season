import {
  MIN_SALARY,
  POSITIONS,
  randInt,
  ROSTER_SIZE,
  type DraftState,
  type Player,
  type Rng,
} from '@perfect-season/shared';

export type { DraftState };
import { capSpace, validateRoster, type RosterValidation } from './cap';
import { generatePlayer } from './league';

/**
 * The roguelike "shop": each run gets a seeded, tiered pool of players. Few
 * superstars, plenty of role players — the drafting puzzle is maximizing
 * pWAR under the cap while covering positions.
 */

interface PoolTier {
  count: number;
  minOverall: number;
  maxOverall: number;
}

const POOL_TIERS: readonly PoolTier[] = [
  { count: 4, minOverall: 88, maxOverall: 95 }, // superstars
  { count: 8, minOverall: 80, maxOverall: 87 }, // stars
  { count: 16, minOverall: 72, maxOverall: 79 }, // starters
  { count: 20, minOverall: 64, maxOverall: 71 }, // rotation
  { count: 24, minOverall: 55, maxOverall: 63 }, // minimum-salary depth
];

export const DRAFT_POOL_SIZE = POOL_TIERS.reduce((sum, t) => sum + t.count, 0);

/**
 * Positions cycle within each tier so counts stay balanced, with a seeded
 * offset per tier so which positions land in the short tiers (e.g. which
 * position gets no superstar) varies run to run.
 */
export function generateDraftPool(rng: Rng): Player[] {
  return POOL_TIERS.flatMap((tier) => {
    const offset = randInt(rng, 0, POSITIONS.length - 1);
    return Array.from({ length: tier.count }, (_, i) =>
      generatePlayer(rng, {
        position: POSITIONS[(i + offset) % POSITIONS.length],
        minOverall: tier.minOverall,
        maxOverall: tier.maxOverall,
      }),
    );
  });
}

export function startDraft(rng: Rng): DraftState {
  return { pool: generateDraftPool(rng), roster: [] };
}

export type DraftBlockReason = 'not-in-pool' | 'roster-full' | 'cannot-afford';

export type DraftCheck = { ok: true } | { ok: false; reason: DraftBlockReason; detail: string };

/**
 * A pick is affordable only if, after signing, the remaining cap space can
 * still pay league-minimum salaries for every unfilled slot — so the draft
 * can never soft-lock into an incompletable roster. `capReduction` covers
 * difficulty modifiers that shrink the effective cap.
 */
export function canDraft(state: DraftState, playerId: string, capReduction = 0): DraftCheck {
  const player = state.pool.find((p) => p.id === playerId);
  if (!player) {
    return { ok: false, reason: 'not-in-pool', detail: `Player ${playerId} is not in the pool` };
  }
  if (state.roster.length >= ROSTER_SIZE) {
    return {
      ok: false,
      reason: 'roster-full',
      detail: `Roster already has ${ROSTER_SIZE} players`,
    };
  }

  const spaceAfter = capSpace([...state.roster, player], capReduction);
  const slotsRemaining = ROSTER_SIZE - state.roster.length - 1;
  const reserveNeeded = slotsRemaining * MIN_SALARY;
  if (spaceAfter < reserveNeeded) {
    return {
      ok: false,
      reason: 'cannot-afford',
      detail: `Signing $${player.salary}M leaves $${spaceAfter.toFixed(1)}M but $${reserveNeeded}M is needed to fill the remaining ${slotsRemaining} slots`,
    };
  }
  return { ok: true };
}

export function draftPlayer(state: DraftState, playerId: string, capReduction = 0): DraftState {
  const check = canDraft(state, playerId, capReduction);
  if (!check.ok) {
    throw new Error(`Cannot draft: ${check.detail}`);
  }
  const player = state.pool.find((p) => p.id === playerId)!;
  return {
    pool: state.pool.filter((p) => p.id !== playerId),
    roster: [...state.roster, player],
  };
}

/** Undo a pick during the draft: the player returns to the pool. */
export function undraftPlayer(state: DraftState, playerId: string): DraftState {
  const player = state.roster.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Player ${playerId} is not on the drafted roster`);
  }
  return {
    pool: [...state.pool, player],
    roster: state.roster.filter((p) => p.id !== playerId),
  };
}

/** Legality of the drafted roster for starting the season. */
export function validateDraft(state: DraftState): RosterValidation {
  return validateRoster(state.roster);
}
