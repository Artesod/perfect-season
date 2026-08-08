import { describe, expect, it } from 'vitest';
import {
  createRng,
  POSITIONS,
  ROSTER_SIZE,
  type DraftState,
  type Player,
  type Position,
  type Team,
} from '@perfect-season/shared';
import {
  canPickPlayer,
  canReroll,
  createRollDraft,
  draftCandidates,
  eligiblePositions,
  hasLegalPick,
  pickPlayer,
  positionsNeeded,
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

/**
 * A 14-man roster (from teams other than the rolled one, so its candidates
 * stay offerable) with exactly one PG: the 15th pick must be a PG.
 */
function fourteenWithOnePG(rolledTeamId: string): Player[] {
  const pool = league.filter((t) => t.id !== rolledTeamId).flatMap((t) => t.players);
  const take = (pos: Position, n: number) =>
    pool.filter((p) => p.position === pos).slice(0, n);
  return [
    ...take('PG', 1),
    ...take('SG', 4),
    ...take('SF', 3),
    ...take('PF', 3),
    ...take('C', 3),
  ];
}

/** Huge cap slack, to isolate position rules from cap rules. */
const NO_CAP = -100_000;

describe('createRollDraft', () => {
  it('starts empty with a rolled team and reroll tokens', () => {
    const state = createRollDraft(SEED, league);
    expect(state.roster).toHaveLength(0);
    expect(state.rerollsLeft).toBe(2);
    expect(league.some((t) => t.id === state.rolledTeamId)).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    expect(createRollDraft(SEED, league)).toEqual(createRollDraft(SEED, league));
  });
});

describe('positionsNeeded', () => {
  it('starts at the full minimum and shrinks as positions fill', () => {
    expect(positionsNeeded([])).toEqual({ PG: 2, SG: 2, SF: 2, PF: 2, C: 2 });
    const pg = league[0].players.find((p) => p.position === 'PG')!;
    expect(positionsNeeded([pg]).PG).toBe(1);
  });
});

describe('canPickPlayer', () => {
  it('allows any position while there are rounds to spare', () => {
    const state = createRollDraft(SEED, league);
    // Round 1 of 15: every candidate is pickable regardless of position.
    for (const player of draftCandidates(state, league)) {
      expect(canPickPlayer(state, league, player.id, NO_CAP).ok).toBe(true);
    }
  });

  it('blocks picks that would make position minimums unfillable', () => {
    const base = createRollDraft(SEED, league);
    const state: DraftState = { ...base, roster: fourteenWithOnePG(base.rolledTeamId) };
    const candidates = draftCandidates(state, league);
    const nonPG = candidates.find((p) => p.position !== 'PG')!;
    const check = canPickPlayer(state, league, nonPG.id, NO_CAP);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('position-need');

    const pg = candidates.find((p) => p.position === 'PG');
    if (pg) {
      expect(canPickPlayer(state, league, pg.id, NO_CAP).ok).toBe(true);
    }
  });

  it('rejects players not on the rolled team', () => {
    const state = createRollDraft(SEED, league);
    const otherTeam = league.find((t) => t.id !== state.rolledTeamId)!;
    const check = canPickPlayer(state, league, otherTeam.players[0].id);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('not-offered');
  });

  it('blocks picks that make the roster impossible to finish under the cap', () => {
    // Greedily draft the priciest legal player; at some point the reserve
    // rule must reject an expensive candidate.
    let state = createRollDraft(SEED, league);
    let blocked = false;
    let guard = 0;
    while (state.roster.length < ROSTER_SIZE && guard++ < 200) {
      const byPrice = draftCandidates(state, league).sort((a, b) => b.salary - a.salary);
      const checks = byPrice.map((p) => ({ p, check: canPickPlayer(state, league, p.id) }));
      if (checks.some(({ check }) => !check.ok && check.reason === 'cannot-afford')) {
        blocked = true;
        break;
      }
      const legal = checks.find(({ check }) => check.ok);
      if (!legal) {
        state = rerollTeam(state, league, SEED);
        continue;
      }
      state = pickPlayer(state, league, SEED, legal.p.id);
    }
    expect(blocked).toBe(true);
  });
});

describe('pickPlayer', () => {
  it('advances the round and rolls a new team deterministically', () => {
    const state = createRollDraft(SEED, league);
    const player = draftCandidates(state, league).find(
      (p) => canPickPlayer(state, league, p.id).ok,
    )!;
    const a = pickPlayer(state, league, SEED, player.id);
    const b = pickPlayer(state, league, SEED, player.id);
    expect(a).toEqual(b);
    expect(a.roster).toContainEqual({ ...player, originTeamId: state.rolledTeamId });
    expect(a.rollIndex).toBe(state.rollIndex + 1);
  });

  it('stamps originTeamId with the team the player was drafted off of', () => {
    const state = createRollDraft(SEED, league);
    const player = draftCandidates(state, league).find(
      (p) => canPickPlayer(state, league, p.id).ok,
    )!;
    const after = pickPlayer(state, league, SEED, player.id);
    expect(after.roster[0].originTeamId).toBe(state.rolledTeamId);
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
    // 14 rostered with one PG: the last pick must be a PG. Gut the rolled
    // team of PGs and every candidate is position-blocked.
    const base = createRollDraft(SEED, league);
    const team = league.find((t) => t.id === base.rolledTeamId)!;
    const gutted: Team = {
      ...team,
      players: team.players.filter((p) => p.position !== 'PG'),
    };
    const guttedLeague = league.map((t) => (t.id === team.id ? gutted : t));
    const noTokens: DraftState = {
      ...base,
      roster: fourteenWithOnePG(base.rolledTeamId),
      rerollsLeft: 0,
    };
    expect(draftCandidates(noTokens, guttedLeague).length).toBeGreaterThan(0);
    expect(hasLegalPick(noTokens, guttedLeague, NO_CAP)).toBe(false);
    expect(canReroll(noTokens, guttedLeague, NO_CAP)).toEqual({ allowed: true, free: true });
    const rerolled = rerollTeam(noTokens, guttedLeague, SEED, NO_CAP);
    expect(rerolled.rerollsLeft).toBe(0);
  });
});

describe('dual-position players', () => {
  /** The rolled team with its first player made a dual SG/PG. */
  function leagueWithDual(state: DraftState): { league: Team[]; dualId: string } {
    const team = league.find((t) => t.id === state.rolledTeamId)!;
    const dual: Player = { ...team.players[0], position: 'SG', altPositions: ['PG'] };
    const patched: Team = { ...team, players: [dual, ...team.players.slice(1)] };
    return {
      league: league.map((t) => (t.id === team.id ? patched : t)),
      dualId: dual.id,
    };
  }

  it('lists eligible positions primary-first', () => {
    const state = createRollDraft(SEED, league);
    const { league: patched, dualId } = leagueWithDual(state);
    const dual = draftCandidates(state, patched).find((p) => p.id === dualId)!;
    expect(eligiblePositions(dual)).toEqual(['SG', 'PG']);
  });

  it('assigns the chosen position and re-derives the alternates', () => {
    const state = createRollDraft(SEED, league);
    const { league: patched, dualId } = leagueWithDual(state);
    const picked = pickPlayer(state, patched, SEED, dualId, NO_CAP, 'PG');
    const rostered = picked.roster.find((p) => p.id === dualId)!;
    expect(rostered.position).toBe('PG');
    expect(rostered.altPositions).toEqual(['SG']);
    expect(positionsNeeded(picked.roster).PG).toBe(1);
  });

  it('rejects an ineligible position', () => {
    const state = createRollDraft(SEED, league);
    const { league: patched, dualId } = leagueWithDual(state);
    const check = canPickPlayer(state, patched, dualId, NO_CAP, 'C');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('not-eligible');
  });

  it('is pickable when only the alternate position keeps the roster completable', () => {
    // 14 rostered with one PG: the last pick must be a PG. A dual SG/PG is
    // blocked as SG but legal as PG — and defaults to PG without asPosition.
    const base = createRollDraft(SEED, league);
    const { league: patched, dualId } = leagueWithDual(base);
    const state: DraftState = { ...base, roster: fourteenWithOnePG(base.rolledTeamId) };

    const asSG = canPickPlayer(state, patched, dualId, NO_CAP, 'SG');
    expect(asSG.ok).toBe(false);
    if (!asSG.ok) expect(asSG.reason).toBe('position-need');
    expect(canPickPlayer(state, patched, dualId, NO_CAP, 'PG').ok).toBe(true);
    expect(canPickPlayer(state, patched, dualId, NO_CAP).ok).toBe(true);

    const picked = pickPlayer(state, patched, SEED, dualId, NO_CAP);
    expect(picked.roster.find((p) => p.id === dualId)!.position).toBe('PG');
    expect(validateDraft(picked).errors.some((e) => e.includes('PG'))).toBe(false);
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
      // The feasibility guard must have covered every position minimum.
      for (const position of POSITIONS) {
        expect(state.roster.filter((p) => p.position === position).length).toBeGreaterThanOrEqual(
          2,
        );
      }
    }
  });

  it('blocks picks after the roster is full', () => {
    const done = draftGreedy(SEED, league);
    expect(done.roster).toHaveLength(ROSTER_SIZE);
    const anyPlayer = draftCandidates(done, league)[0];
    if (anyPlayer) {
      const check = canPickPlayer(done, league, anyPlayer.id);
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.reason).toBe('draft-complete');
    }
  });
});
