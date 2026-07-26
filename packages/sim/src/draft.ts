import {
  createRng,
  deriveSeed,
  MIN_SALARY,
  POSITIONS,
  randInt,
  ROSTER_SIZE,
  type DraftSlot,
  type DraftState,
  type Player,
  type Team,
} from '@perfect-season/shared';

import { capSpace, validateRoster, type RosterValidation } from './cap';

export type { DraftState };

/**
 * The team-roll draft: each round rolls a random league team (seeded) and
 * the player drafts exactly one of its players for that round's slot.
 * Rounds 1-10 demand each position twice, so the 2-per-position roster
 * minimum holds by construction; rounds 11-15 are flex — that's where you
 * gamble on rolling a loaded roster. A couple of reroll tokens (plus a free
 * reroll whenever a rolled team offers no legal pick) keep the RNG from
 * ever soft-locking a run.
 */

/** Slot order: every position twice, then five flex rounds. */
export const DRAFT_SLOTS: readonly DraftSlot[] = [
  ...POSITIONS,
  ...POSITIONS,
  'flex',
  'flex',
  'flex',
  'flex',
  'flex',
];

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
    slots: [...DRAFT_SLOTS],
    rolledTeamId: rollTeamId(seed, 0, league),
    rollIndex: 1,
    rerollsLeft: REROLL_TOKENS,
    roster: [],
  };
}

/** The requirement of the round being drafted, or null once the roster is full. */
export function currentSlot(state: DraftState): DraftSlot | null {
  return state.roster.length >= state.slots.length ? null : state.slots[state.roster.length];
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
  | 'wrong-position'
  | 'duplicate-person'
  | 'cannot-afford';

export type PickCheck = { ok: true } | { ok: false; reason: PickBlockReason; detail: string };

/**
 * A pick must match the round's slot and — like the old pool draft — leave
 * enough cap space to pay league-minimum salaries for every remaining slot,
 * so the draft can never wander into an incompletable roster.
 */
export function canPickPlayer(
  state: DraftState,
  league: readonly Team[],
  playerId: string,
  capReduction = 0,
): PickCheck {
  const slot = currentSlot(state);
  if (!slot) {
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
  if (slot !== 'flex' && player.position !== slot) {
    return {
      ok: false,
      reason: 'wrong-position',
      detail: `This round needs a ${slot}, ${player.name} is a ${player.position}`,
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
  return { ok: true };
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

/** Draft the player and, unless the roster is now full, roll the next team. */
export function pickPlayer(
  state: DraftState,
  league: readonly Team[],
  seed: number,
  playerId: string,
  capReduction = 0,
): DraftState {
  const check = canPickPlayer(state, league, playerId, capReduction);
  if (!check.ok) {
    throw new Error(`Cannot pick: ${check.detail}`);
  }
  const player = draftCandidates(state, league).find((p) => p.id === playerId)!;
  const roster = [...state.roster, player];
  if (roster.length >= state.slots.length) {
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
  if (currentSlot(state) === null) return { allowed: false, free: false };
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
