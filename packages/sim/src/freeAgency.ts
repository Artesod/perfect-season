import { ROSTER_SIZE, type Player, type Rng } from '@perfect-season/shared';
import { capSpace } from './cap';
import { generatePlayer } from './league';

/**
 * Mid-season free agency: a seeded pool of unsigned players to replace
 * injured or underperforming roster spots. Waiving a player leaves dead cap
 * (a fraction of their salary still counts against the cap), so churning the
 * roster has a real cost.
 */

/** Fraction of a waived player's salary that stays on the cap sheet. */
export const DEAD_CAP_FRACTION = 0.5;

export interface GenerateFreeAgentsOptions {
  count?: number;
  minOverall?: number;
  maxOverall?: number;
}

/** Free agents skew weaker than the draft pool — no superstars sitting unsigned. */
export function generateFreeAgents(rng: Rng, options: GenerateFreeAgentsOptions = {}): Player[] {
  const count = options.count ?? 10;
  return Array.from({ length: count }, () =>
    generatePlayer(rng, {
      minOverall: options.minOverall ?? 55,
      maxOverall: options.maxOverall ?? 82,
    }),
  );
}

export type SignBlockReason = 'roster-full' | 'duplicate-person' | 'cannot-afford';

export type SignCheck = { ok: true } | { ok: false; reason: SignBlockReason; detail: string };

export function canSign(roster: readonly Player[], player: Player, deadCap = 0): SignCheck {
  if (roster.length >= ROSTER_SIZE) {
    return {
      ok: false,
      reason: 'roster-full',
      detail: `Roster is full (${ROSTER_SIZE}); waive someone first`,
    };
  }
  const samePerson = player.personKey
    ? roster.find((p) => p.personKey === player.personKey)
    : undefined;
  if (samePerson) {
    return {
      ok: false,
      reason: 'duplicate-person',
      detail: `${samePerson.name} is already rostered — only one version of a player is allowed`,
    };
  }
  const space = capSpace(roster, deadCap);
  if (player.salary > space) {
    return {
      ok: false,
      reason: 'cannot-afford',
      detail: `$${player.salary}M salary exceeds $${space.toFixed(1)}M of cap space`,
    };
  }
  return { ok: true };
}

export function signPlayer(roster: readonly Player[], player: Player, deadCap = 0): Player[] {
  const check = canSign(roster, player, deadCap);
  if (!check.ok) {
    throw new Error(`Cannot sign: ${check.detail}`);
  }
  return [...roster, player];
}

export interface WaiveResult {
  roster: Player[];
  /** Dead cap incurred by this waive; add it to the run's running total */
  deadCapIncurred: number;
}

export function waivePlayer(
  roster: readonly Player[],
  playerId: string,
  deadCapFraction = DEAD_CAP_FRACTION,
): WaiveResult {
  const player = roster.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Player ${playerId} is not on the roster`);
  }
  return {
    roster: roster.filter((p) => p.id !== playerId),
    deadCapIncurred: Math.round(player.salary * deadCapFraction * 10) / 10,
  };
}
