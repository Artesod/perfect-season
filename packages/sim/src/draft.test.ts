import { describe, expect, it } from 'vitest';
import {
  createRng,
  POSITIONS,
  ROSTER_SIZE,
  type DraftState,
  type Team,
} from '@perfect-season/shared';
import {
  canPickPlayer,
  canReroll,
  createRollDraft,
  currentSlot,
  DRAFT_SLOTS,
  draftCandidates,
  hasLegalPick,
  pickPlayer,
  rerollTeam,
  validateDraft,
} from './draft';
import { generateLeague } from './league';

const SEED = 42;
const league = generateLeague(createRng(1));

/** Pick the best legal candidate each round, rerolling if a round has none. */
function draftGreedy(seed: number, teams: readonly Team[]): DraftState {
  let state = createRollDraft(seed, teams);
  let guard = 0;
  while (state.roster.length < ROSTER_SIZE && guard++ < 200) {
    const legal = draftCandidates(state, teams)
      .filter((p) => canPickPlayer(state, teams, p.id).ok)
      .sort((a, b) => b.overall - a.overall);
    if (legal.length === 0) {
      state = rerollTeam(state, teams, seed);
      continue;
    }
    state = pickPlayer(state, teams, seed, legal[0].id);
  }
  return state;
}

describe('createRollDraft', () => {
  it('has 15 slots covering every position twice then flex, with a team rolled', () => {
    const state = createRollDraft(SEED, league);
    expect(state.slots).toHaveLength(ROSTER_SIZE);
    for (const position of POSITIONS) {
      expect(state.slots.filter((s) => s === position)).toHaveLength(2);
    }
    expect(state.slots.filter((s) => s === 'flex')).toHaveLength(5);
    expect(state.slots).toEqual([...DRAFT_SLOTS]);
    expect(league.some((t) => t.id === state.rolledTeamId)).toBe(true);
    expect(currentSlot(state)).toBe(state.slots[0]);
  });

  it('is deterministic for the same seed', () => {
    expect(createRollDraft(SEED, league)).toEqual(createRollDraft(SEED, league));
  });
});

describe('canPickPlayer', () => {
  it('enforces the slot position in rounds 1-10', () => {
    const state = createRollDraft(SEED, league);
    const slot = currentSlot(state)!;
    const wrong = draftCandidates(state, league).find((p) => p.position !== slot)!;
    const check = canPickPlayer(state, league, wrong.id);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('wrong-position');
  });

  it('rejects players not on the rolled team', () => {
    const state = createRollDraft(SEED, league);
    const otherTeam = league.find((t) => t.id !== state.rolledTeamId)!;
    const check = canPickPlayer(state, league, otherTeam.players[0].id);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('not-offered');
  });

  it('blocks picks that make the roster impossible to finish under the cap', () => {
    // A tiny cap reduction squeeze: reserve rule must reject pricey picks late.
    let state = createRollDraft(SEED, league);
    let blocked = false;
    let guard = 0;
    while (state.roster.length < ROSTER_SIZE && guard++ < 200) {
      const candidates = draftCandidates(state, league)
        .filter((p) => {
          const slot = currentSlot(state)!;
          return slot === 'flex' || p.position === slot;
        })
        .sort((a, b) => b.salary - a.salary);
      const priciest = candidates[0];
      if (priciest) {
        const check = canPickPlayer(state, league, priciest.id);
        if (!check.ok) {
          expect(check.reason).toBe('cannot-afford');
          blocked = true;
          break;
        }
        state = pickPlayer(state, league, SEED, priciest.id);
      } else {
        state = rerollTeam(state, league, SEED);
      }
    }
    expect(blocked).toBe(true);
  });
});

describe('pickPlayer', () => {
  it('advances the round and rolls a new team deterministically', () => {
    const state = createRollDraft(SEED, league);
    const slot = currentSlot(state)!;
    const player = draftCandidates(state, league).find(
      (p) => canPickPlayer(state, league, p.id).ok && (slot === 'flex' || p.position === slot),
    )!;
    const a = pickPlayer(state, league, SEED, player.id);
    const b = pickPlayer(state, league, SEED, player.id);
    expect(a).toEqual(b);
    expect(a.roster).toContainEqual(player);
    expect(a.rollIndex).toBe(state.rollIndex + 1);
    expect(currentSlot(a)).toBe(a.slots[1]);
  });

  it('excludes already-drafted players from later offers of the same team', () => {
    const initial = createRollDraft(SEED, league);
    const picked = draftCandidates(initial, league).find(
      (p) => canPickPlayer(initial, league, p.id).ok,
    )!;
    const after = pickPlayer(initial, league, SEED, picked.id);
    // Point the offer back at the original team; the pick must be gone.
    const sameTeamAgain = { ...after, rolledTeamId: initial.rolledTeamId };
    expect(draftCandidates(sameTeamAgain, league).some((p) => p.id === picked.id)).toBe(false);
  });
});

describe('rerollTeam', () => {
  it('spends a token when a legal pick exists', () => {
    const state = createRollDraft(SEED, league);
    expect(hasLegalPick(state, league)).toBe(true);
    const check = canReroll(state, league);
    expect(check).toEqual({ allowed: true, free: false });
    const rerolled = rerollTeam(state, league, SEED);
    expect(rerolled.rerollsLeft).toBe(state.rerollsLeft - 1);
    expect(rerolled.rollIndex).toBe(state.rollIndex + 1);
  });

  it('throws once tokens are gone and picks are available', () => {
    let state = createRollDraft(SEED, league);
    state = rerollTeam(state, league, SEED);
    state = rerollTeam(state, league, SEED);
    expect(state.rerollsLeft).toBe(0);
    expect(canReroll(state, league).allowed).toBe(false);
    expect(() => rerollTeam(state, league, SEED)).toThrow(/rerolls/i);
  });

  it('is free when the rolled team offers no legal pick', () => {
    // Craft a state where the rolled team has no player at the needed slot.
    const state = createRollDraft(SEED, league);
    const slot = currentSlot(state)!;
    const team = league.find((t) => t.id === state.rolledTeamId)!;
    const gutted: Team = {
      ...team,
      players: team.players.filter((p) => p.position !== slot),
    };
    const guttedLeague = league.map((t) => (t.id === team.id ? gutted : t));
    const noTokens = { ...state, rerollsLeft: 0 };
    expect(hasLegalPick(noTokens, guttedLeague)).toBe(false);
    expect(canReroll(noTokens, guttedLeague)).toEqual({ allowed: true, free: true });
    const rerolled = rerollTeam(noTokens, guttedLeague, SEED);
    expect(rerolled.rerollsLeft).toBe(0);
  });
});

describe('full draft', () => {
  it('completes a legal 15-man roster across many seeds', () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      const state = draftGreedy(seed, league);
      expect(state.roster).toHaveLength(ROSTER_SIZE);
      expect(validateDraft(state).valid).toBe(true);
      const ids = new Set(state.roster.map((p) => p.id));
      expect(ids.size).toBe(ROSTER_SIZE);
    }
  });

  it('blocks picks after the roster is full', () => {
    const done = draftGreedy(SEED, league);
    expect(currentSlot(done)).toBeNull();
    const anyPlayer = draftCandidates(done, league)[0];
    if (anyPlayer) {
      const check = canPickPlayer(done, league, anyPlayer.id);
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.reason).toBe('draft-complete');
    }
  });
});
