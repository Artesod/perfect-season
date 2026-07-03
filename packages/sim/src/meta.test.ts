import { describe, expect, it } from 'vitest';
import type { RunState } from '@perfect-season/shared';
import { MAX_ASCENSION } from './difficulty';
import { emptyMetaProgress, recordRun, unlockedAscension } from './meta';

function finishedRun(overrides: Partial<RunState> = {}): RunState {
  return {
    seed: 1,
    ascension: 0,
    livesRemaining: 0,
    league: [],
    draft: null,
    roster: [],
    season: null,
    wins: 40,
    losses: 1,
    status: 'lost',
    ...overrides,
  };
}

describe('recordRun', () => {
  it('rejects unfinished runs', () => {
    expect(() => recordRun(emptyMetaProgress(), finishedRun({ status: 'in-season' }))).toThrow();
  });

  it('tracks totals, best wins, and badges', () => {
    let meta = recordRun(emptyMetaProgress(), finishedRun({ wins: 61 }));
    expect(meta.totalRuns).toBe(1);
    expect(meta.bestWins).toBe(61);
    expect(meta.badges).toContain('first-steps');
    expect(meta.badges).toContain('heartbreak');
    expect(meta.badges).not.toContain('banner');

    meta = recordRun(meta, finishedRun({ status: 'won', wins: 82, livesRemaining: 1 }));
    expect(meta.runsWon).toBe(1);
    expect(meta.bestWins).toBe(82);
    expect(meta.badges).toContain('banner');
    expect(meta.badges).toContain('seventy');
  });

  it('winning unlocks the next ascension, capped at the max', () => {
    let meta = emptyMetaProgress();
    expect(unlockedAscension(meta)).toBe(0);

    meta = recordRun(meta, finishedRun({ status: 'won', wins: 82, ascension: 0 }));
    expect(unlockedAscension(meta)).toBe(1);

    meta = recordRun(meta, finishedRun({ status: 'won', wins: 82, ascension: MAX_ASCENSION }));
    expect(unlockedAscension(meta)).toBe(MAX_ASCENSION);
    expect(meta.badges).toContain('apex');
  });

  it('losing does not unlock ascensions', () => {
    const meta = recordRun(emptyMetaProgress(), finishedRun());
    expect(unlockedAscension(meta)).toBe(0);
  });
});
