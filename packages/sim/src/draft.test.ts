import { describe, expect, it } from 'vitest';
import { createRng, MIN_PER_POSITION, POSITIONS, ROSTER_SIZE } from '@perfect-season/shared';
import {
  canDraft,
  DRAFT_POOL_SIZE,
  draftPlayer,
  generateDraftPool,
  startDraft,
  undraftPlayer,
  validateDraft,
  type DraftState,
} from './draft';

describe('generateDraftPool', () => {
  it('is deterministic and has the expected size', () => {
    expect(generateDraftPool(createRng(1))).toEqual(generateDraftPool(createRng(1)));
    expect(generateDraftPool(createRng(1))).toHaveLength(DRAFT_POOL_SIZE);
  });

  it('gives every position star-level and minimum-salary options', () => {
    const pool = generateDraftPool(createRng(2));
    for (const position of POSITIONS) {
      const atPosition = pool.filter((p) => p.position === position);
      expect(atPosition.length).toBeGreaterThanOrEqual(
        Math.floor(DRAFT_POOL_SIZE / POSITIONS.length) - 4,
      );
      // Star tier (8 players) covers all 5 positions; the superstar tier (4)
      // deliberately leaves one position without a superstar each run.
      expect(atPosition.some((p) => p.overall >= 80)).toBe(true);
      expect(atPosition.some((p) => p.overall <= 63)).toBe(true);
    }
    expect(pool.filter((p) => p.overall >= 88)).toHaveLength(4);
  });
});

/** Draft 2 cheapest per position, then 5 more cheapest overall. */
function draftBudgetRoster(state: DraftState): DraftState {
  for (const position of POSITIONS) {
    const cheapest = state.pool
      .filter((p) => p.position === position)
      .sort((a, b) => a.salary - b.salary)
      .slice(0, MIN_PER_POSITION);
    for (const player of cheapest) {
      state = draftPlayer(state, player.id);
    }
  }
  while (state.roster.length < ROSTER_SIZE) {
    const cheapest = [...state.pool].sort((a, b) => a.salary - b.salary)[0];
    state = draftPlayer(state, cheapest.id);
  }
  return state;
}

describe('draft flow', () => {
  it('supports drafting a full legal roster', () => {
    const state = draftBudgetRoster(startDraft(createRng(10)));
    expect(state.roster).toHaveLength(ROSTER_SIZE);
    expect(state.pool).toHaveLength(DRAFT_POOL_SIZE - ROSTER_SIZE);
    expect(validateDraft(state).valid).toBe(true);
  });

  it('blocks drafting players not in the pool', () => {
    const state = startDraft(createRng(11));
    const check = canDraft(state, 'nope');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('not-in-pool');
    expect(() => draftPlayer(state, 'nope')).toThrow();
  });

  it('blocks picks that make the roster impossible to finish under the cap', () => {
    let state = startDraft(createRng(12));
    // Greedily grab the most expensive players until one is blocked.
    let blocked = false;
    for (let i = 0; i < ROSTER_SIZE; i++) {
      const priciest = [...state.pool].sort((a, b) => b.salary - a.salary)[0];
      const check = canDraft(state, priciest.id);
      if (!check.ok) {
        expect(check.reason).toBe('cannot-afford');
        blocked = true;
        break;
      }
      state = draftPlayer(state, priciest.id);
    }
    expect(blocked).toBe(true);
  });

  it('blocks drafting onto a full roster', () => {
    const full = draftBudgetRoster(startDraft(createRng(13)));
    const check = canDraft(full, full.pool[0].id);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('roster-full');
  });

  it('undraft returns the player to the pool', () => {
    let state = startDraft(createRng(14));
    const player = state.pool[0];
    state = draftPlayer(state, player.id);
    expect(state.roster).toContainEqual(player);
    state = undraftPlayer(state, player.id);
    expect(state.roster).toHaveLength(0);
    expect(state.pool).toContainEqual(player);
    expect(state.pool).toHaveLength(DRAFT_POOL_SIZE);
  });
});
