import { describe, expect, it } from 'vitest';
import type { RunState } from '@perfect-season/shared';
import { MAX_ASCENSION } from './difficulty';
import { emptyMetaProgress, mergeMetaProgress, recordRun, unlockedAscension } from './meta';

function finishedRun(overrides: Partial<RunState> = {}): RunState {
  return {
    seed: 1,
    ascension: 0,
    casual: false,
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

  it('casual runs count in career stats but earn no badges or unlocks', () => {
    const meta = recordRun(
      emptyMetaProgress(),
      finishedRun({ status: 'won', wins: 82, casual: true }),
    );
    expect(meta.totalRuns).toBe(1);
    expect(meta.runsWon).toBe(1);
    expect(meta.bestWins).toBe(82);
    expect(meta.badges).toEqual([]);
    expect(unlockedAscension(meta)).toBe(0);
  });
});

describe('mergeMetaProgress', () => {
  it('unions badges and takes the max of every counter', () => {
    const local = {
      totalRuns: 5,
      runsWon: 1,
      bestWins: 70,
      highestAscensionBeaten: 0,
      badges: ['first-steps', 'seventy'],
    };
    const cloud = {
      totalRuns: 3,
      runsWon: 2,
      bestWins: 82,
      highestAscensionBeaten: 1,
      badges: ['first-steps', 'banner'],
    };
    const merged = mergeMetaProgress(local, cloud);
    expect(merged).toEqual({
      totalRuns: 5,
      runsWon: 2,
      bestWins: 82,
      highestAscensionBeaten: 1,
      badges: ['banner', 'first-steps', 'seventy'],
    });
  });

  it('merging with empty progress is a no-op apart from badge order', () => {
    const meta = recordRun(emptyMetaProgress(), finishedRun({ status: 'won', wins: 82 }));
    const merged = mergeMetaProgress(meta, emptyMetaProgress());
    expect(merged).toEqual({ ...meta, badges: [...meta.badges].sort() });
  });

  it('is commutative', () => {
    const a = { totalRuns: 2, runsWon: 0, bestWins: 30, highestAscensionBeaten: -1, badges: ['x'] };
    const b = { totalRuns: 1, runsWon: 1, bestWins: 82, highestAscensionBeaten: 2, badges: ['y'] };
    expect(mergeMetaProgress(a, b)).toEqual(mergeMetaProgress(b, a));
  });
});
