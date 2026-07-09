import type { RunState } from '@perfect-season/shared';
import { MAX_ASCENSION } from './difficulty';

/**
 * Meta-progression across runs. Pure data + a fold function; the UI persists
 * MetaProgress (localStorage for now) and folds each finished run into it.
 */

export interface MetaProgress {
  totalRuns: number;
  runsWon: number;
  /** Most regular-season wins achieved in any single run */
  bestWins: number;
  /** Highest ascension level beaten; -1 before the first win */
  highestAscensionBeaten: number;
  badges: string[];
}

export function emptyMetaProgress(): MetaProgress {
  return { totalRuns: 0, runsWon: 0, bestWins: 0, highestAscensionBeaten: -1, badges: [] };
}

/** Highest difficulty currently playable. */
export function unlockedAscension(meta: MetaProgress): number {
  return Math.min(meta.highestAscensionBeaten + 1, MAX_ASCENSION);
}

/**
 * Merge two MetaProgress snapshots — e.g. local guest progress with cloud
 * progress at sign-in. Badges and high-water marks union/max cleanly; run
 * counters take the max of the two sides (summing would double-count runs
 * present in both snapshots), so counters are a floor, never inflated.
 */
export function mergeMetaProgress(a: MetaProgress, b: MetaProgress): MetaProgress {
  return {
    totalRuns: Math.max(a.totalRuns, b.totalRuns),
    runsWon: Math.max(a.runsWon, b.runsWon),
    bestWins: Math.max(a.bestWins, b.bestWins),
    highestAscensionBeaten: Math.max(a.highestAscensionBeaten, b.highestAscensionBeaten),
    badges: [...new Set([...a.badges, ...b.badges])].sort(),
  };
}

export interface BadgeDefinition {
  id: string;
  label: string;
  earned: (run: RunState, meta: MetaProgress) => boolean;
}

export const BADGES: readonly BadgeDefinition[] = [
  {
    id: 'first-steps',
    label: 'First Steps — finish your first run',
    earned: () => true,
  },
  {
    id: 'banner',
    label: 'Banner — win a run',
    earned: (run) => run.status === 'won',
  },
  {
    id: 'seventy',
    label: '70 Club — reach 70 wins in one run',
    earned: (run) => run.wins >= 70,
  },
  {
    id: 'heartbreak',
    label: 'Heartbreak — lose a run after 60+ wins',
    earned: (run) => run.status === 'lost' && run.wins >= 60,
  },
  {
    id: 'apex',
    label: 'Apex — win at the highest ascension',
    earned: (run) => run.status === 'won' && run.ascension === MAX_ASCENSION,
  },
];

/** Fold a finished run (status 'won' or 'lost') into the meta progress. */
export function recordRun(meta: MetaProgress, run: RunState): MetaProgress {
  if (run.status !== 'won' && run.status !== 'lost') {
    throw new Error(`Cannot record a run that is still '${run.status}'`);
  }
  const won = run.status === 'won';
  const badges = new Set(meta.badges);
  for (const badge of BADGES) {
    if (badge.earned(run, meta)) badges.add(badge.id);
  }
  return {
    totalRuns: meta.totalRuns + 1,
    runsWon: meta.runsWon + (won ? 1 : 0),
    bestWins: Math.max(meta.bestWins, run.wins),
    highestAscensionBeaten: won
      ? Math.max(meta.highestAscensionBeaten, run.ascension)
      : meta.highestAscensionBeaten,
    badges: [...badges],
  };
}
