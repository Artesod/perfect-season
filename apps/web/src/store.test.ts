import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunState } from '@perfect-season/shared';
import { emptyMetaProgress } from '@perfect-season/sim';

vi.mock('./cloud', () => ({ syncFinishedRun: vi.fn() }));

import { shouldPostRun, useGameStore } from './store';
import type { ChallengeParams } from './share/challengeLink';

const challenge: ChallengeParams = {
  seed: 7,
  ascension: 2,
  pool: 'procedural',
  casual: false,
  wins: 71,
  losses: 11,
  result: 'lost',
  datasetVersion: null,
};
const target = { wins: 71, losses: 11, result: 'lost' as const };

beforeEach(() => {
  useGameStore.setState({ run: null, runPool: null, meta: emptyMetaProgress(), challenge: null });
});

describe('challenge state', () => {
  it('stores and dismisses a challenge', () => {
    useGameStore.getState().setChallenge(challenge);
    expect(useGameStore.getState().challenge).toEqual(challenge);
    useGameStore.getState().dismissChallenge();
    expect(useGameStore.getState().challenge).toBeNull();
  });

  it('never persists the challenge', () => {
    useGameStore.getState().setChallenge(challenge);
    const saved = localStorage.getItem('perfect-season-meta') ?? '';
    expect(saved).not.toContain('"challenge"');
  });
});

describe('newRun with a challenge', () => {
  it('marks a locked-ascension challenge unranked and clears the pending challenge', () => {
    useGameStore.getState().setChallenge(challenge);
    useGameStore.getState().newRun(7, 2, null, false, { challenge: target });
    const run = useGameStore.getState().run!;
    expect(run.challenge).toEqual(target);
    expect(run.unranked).toBe(true);
    expect(useGameStore.getState().challenge).toBeNull();
  });

  it('keeps an unlocked-ascension challenge ranked', () => {
    useGameStore.getState().newRun(7, 0, null, false, { challenge: target });
    expect(useGameStore.getState().run!.unranked).toBe(false);
  });

  it('leaves normal runs without challenge fields', () => {
    useGameStore.getState().newRun(7, 0, null);
    const run = useGameStore.getState().run!;
    expect(run.challenge).toBeUndefined();
    expect(run.unranked).toBeUndefined();
  });
});

describe('shouldPostRun', () => {
  const run = { casual: false } as RunState;
  it('posts ranked runs only', () => {
    expect(shouldPostRun(run)).toBe(true);
    expect(shouldPostRun({ ...run, casual: true })).toBe(false);
    expect(shouldPostRun({ ...run, unranked: true })).toBe(false);
  });
});
