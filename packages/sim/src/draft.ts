import {
  createRng,
  deriveSeed,
  MIN_PER_POSITION,
  MIN_SALARY,
  POSITIONS,
  randInt,
  ROSTER_SIZE,
  type DraftState,
  type Player,
  type Position,
  type Team,
} from '@perfect-season/shared';

import { capSpace, validateRoster, type RosterValidation } from './cap';

export type { DraftState };

/**
 * The team-roll draft: each round rolls a random league team (seeded) and
 * the player drafts any one of its players — you decide which roster hole
 * to fill each round. The 2-per-position minimum is enforced by a
 * feasibility check: a pick is blocked if it would leave too few remaining
 * rounds to cover the positions still short. A couple of reroll tokens
 * (plus a free reroll whenever a rolled team offers no legal pick) keep the
 * RNG from ever soft-locking a run.
 */

export const REROLL_TOKENS = 2;

/**
 * Seed stream for team rolls: run.ts owns streams 0-2 and bases 100/10k/20k;
 * rolls live at 30k+. Roll k is the same team for a given seed no matter
 * what the player picked earlier, so replays with the same choices match.
 */
const DRAFT_ROLL_STREAM_BASE = 30_000;

function rollTeamId(seed: number, rollIndex: number, league: readonly Team[]): string {
  const rng = createRng(deriveSeed(seed, DRAFT_ROLL_STREAM_BASE + rollIndex));
  return league[randInt(rng, 0, league.length - 1)].id;
}

export function createRollDraft(seed: number, league: readonly Team[]): DraftState {
  return {
    rolledTeamId: rollTeamId(seed, 0, league),
    rollIndex: 1,
    rerollsLeft: REROLL_TOKENS,
    roster: [],
  };
}

/**
 * How many more players each position still needs to hit the roster
 * minimum. The draft's position guard and the UI's needs readout both
 * derive from this.
 */
export function positionsNeeded(roster: readonly Player[]): Record<Position, number> {
  const needed = {} as Record<Position, number>;
  for (const position of POSITIONS) {
    const count = roster.filter((p) => p.position === position).length;
    needed[position] = Math.max(0, MIN_PER_POSITION - count);
  }
  return needed;
}

function totalNeeded(roster: readonly Player[]): number {
  return Object.values(positionsNeeded(roster)).reduce((sum, n) => sum + n, 0);
}

/** Every position a player can fill: primary first, then alternates. */
export function eligiblePositions(player: Player): Position[] {
  const eligible = [player.position, ...(player.altPositions ?? [])];
  return [...new Set(eligible)];
}

/** The player as rostered when picked for the given position. */
function assignPosition(player: Player, position: Position): Player {
  const others = eligiblePositions(player).filter((p) => p !== position);
  const assigned: Player = { ...player, position };
  if (others.length > 0) assigned.altPositions = others;
  else delete assigned.altPositions;
  return assigned;
}

/** The rolled team's roster, minus anyone already drafted. */
export function draftCandidates(state: DraftState, league: readonly Team[]): Player[] {
  const team = league.find((t) => t.id === state.rolledTeamId);
  if (!team) throw new Error(`Rolled team ${state.rolledTeamId} is not in the league`);
  const draftedIds = new Set(state.roster.map((p) => p.id));
  return team.players.filter((p) => !draftedIds.has(p.id));
}

export type PickBlockReason =
  | 'draft-complete'
  | 'not-offered'
  | 'not-eligible'
  | 'position-need'
  | 'duplicate-person'
  | 'cannot-afford';

export type PickCheck = { ok: true } | { ok: false; reason: PickBlockReason; detail: string };

/**
 * Any player on the rolled team is fair game, as long as the pick leaves
 * the roster completable: enough remaining rounds to cover every position
 * still short of its minimum, and enough cap space to pay league-minimum
 * salaries for every remaining slot. Dual-position players may be picked
 * as any of their eligible positions: pass `asPosition` to check a
 * specific one, or omit it to accept whichever works.
 */
export function canPickPlayer(
  state: DraftState,
  league: readonly Team[],
  playerId: string,
  capReduction = 0,
  asPosition?: Position,
): PickCheck {
  if (state.roster.length >= ROSTER_SIZE) {
    return { ok: false, reason: 'draft-complete', detail: 'The roster is already full' };
  }
  const player = draftCandidates(state, league).find((p) => p.id === playerId);
  if (!player) {
    return {
      ok: false,
      reason: 'not-offered',
      detail: `Player ${playerId} is not on the rolled team`,
    };
  }
  if (asPosition && !eligiblePositions(player).includes(asPosition)) {
    return {
      ok: false,
      reason: 'not-eligible',
      detail: `${player.name} can't play ${asPosition} (plays ${eligiblePositions(player).join('/')})`,
    };
  }
  const samePerson = player.personKey
    ? state.roster.find((p) => p.personKey === player.personKey)
    : undefined;
  if (samePerson) {
    return {
      ok: false,
      reason: 'duplicate-person',
      detail: `${samePerson.name} is already rostered — only one version of a player is allowed`,
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
  // Position feasibility, for the requested position or any eligible one.
  let firstFail: PickCheck | null = null;
  for (const position of asPosition ? [asPosition] : eligiblePositions(player)) {
    const rosterAfter = [...state.roster, assignPosition(player, position)];
    if (totalNeeded(rosterAfter) <= slotsRemaining) {
      return { ok: true };
    }
    if (!firstFail) {
      const shortList = Object.entries(positionsNeeded(rosterAfter))
        .filter(([, n]) => n > 0)
        .map(([pos, n]) => `${n} ${pos}`)
        .join(', ');
      firstFail = {
        ok: false,
        reason: 'position-need',
        detail: `Picking ${player.name} as a ${position} leaves ${slotsRemaining} rounds to fill ${shortList} — cover the position minimums first`,
      };
    }
  }
  return firstFail!;
}

/** Whether the rolled team offers at least one legal pick this round. */
export function hasLegalPick(
  state: DraftState,
  league: readonly Team[],
  capReduction = 0,
): boolean {
  return draftCandidates(state, league).some(
    (p) => canPickPlayer(state, league, p.id, capReduction).ok,
  );
}

/**
 * Draft the player and, unless the roster is now full, roll the next team.
 * `asPosition` chooses which eligible position a dual-position player
 * fills; omitted, the first eligible position that keeps the roster
 * completable is assigned.
 */
export function pickPlayer(
  state: DraftState,
  league: readonly Team[],
  seed: number,
  playerId: string,
  capReduction = 0,
  asPosition?: Position,
): DraftState {
  const check = canPickPlayer(state, league, playerId, capReduction, asPosition);
  if (!check.ok) {
    throw new Error(`Cannot pick: ${check.detail}`);
  }
  const player = draftCandidates(state, league).find((p) => p.id === playerId)!;
  const position =
    asPosition ??
    eligiblePositions(player).find(
      (pos) => canPickPlayer(state, league, playerId, capReduction, pos).ok,
    )!;
  const roster = [
    ...state.roster,
    { ...assignPosition(player, position), originTeamId: state.rolledTeamId },
  ];
  if (roster.length >= ROSTER_SIZE) {
    return { ...state, roster };
  }
  return {
    ...state,
    roster,
    rolledTeamId: rollTeamId(seed, state.rollIndex, league),
    rollIndex: state.rollIndex + 1,
  };
}

export interface RerollCheck {
  allowed: boolean;
  /** True when the rolled team has no legal pick — rerolling costs nothing */
  free: boolean;
}

export function canReroll(
  state: DraftState,
  league: readonly Team[],
  capReduction = 0,
): RerollCheck {
  if (state.roster.length >= ROSTER_SIZE) return { allowed: false, free: false };
  const free = !hasLegalPick(state, league, capReduction);
  return { allowed: free || state.rerollsLeft > 0, free };
}

/** Roll a different team for this round, spending a token unless it's free. */
export function rerollTeam(
  state: DraftState,
  league: readonly Team[],
  seed: number,
  capReduction = 0,
): DraftState {
  const check = canReroll(state, league, capReduction);
  if (!check.allowed) {
    throw new Error('No rerolls left');
  }
  return {
    ...state,
    rolledTeamId: rollTeamId(seed, state.rollIndex, league),
    rollIndex: state.rollIndex + 1,
    rerollsLeft: check.free ? state.rerollsLeft : state.rerollsLeft - 1,
  };
}

/** Legality of the drafted roster for starting the season. */
export function validateDraft(state: DraftState): RosterValidation {
  return validateRoster(state.roster);
}
